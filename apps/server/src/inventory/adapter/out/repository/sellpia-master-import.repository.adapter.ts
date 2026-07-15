import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type SourceImportRun } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ImportClaim,
  SellpiaMasterImportRepositoryPort,
} from '../../../application/port/out/repository/sellpia-master-import.repository.port';
import type { ParsedSellpiaInventoryRow } from '../../../application/service/sellpia-inventory-workbook.parser';
import {
  VerifiedSellpiaSourceImportRunSchema,
  type SellpiaInventoryImportResponse,
} from '@kiditem/shared/source-import';

const SOURCE_TYPE = 'sellpia_inventory';
const STALE_AFTER_MS = 30 * 60 * 1_000;
const UPSERT_BATCH_SIZE = 500;
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 60_000 } as const;

type ClaimInput = Parameters<SellpiaMasterImportRepositoryPort['claimSellpiaImport']>[0];
type ReplaceInput = Parameters<SellpiaMasterImportRepositoryPort['replaceSellpiaSnapshot']>[0];

type LockedRunRow = {
  id: string;
  organizationId: string;
  sourceType: string;
  channelAccountId: string | null;
  status: string;
  attemptToken: string;
};

@Injectable()
export class SellpiaMasterImportRepositoryAdapter
implements SellpiaMasterImportRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async claimSellpiaImport(input: ClaimInput): Promise<ImportClaim> {
    const existing = await this.findRun(input.organizationId, input.fileHash);
    if (existing) return this.claimExistingRun(input, existing);

    const attemptToken = randomUUID();
    try {
      const created = await this.prisma.sourceImportRun.create({
        data: {
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: null,
          fileName: input.fileName,
          fileHash: input.fileHash,
          status: 'running',
          rowCount: input.rowCount,
          importedAt: null,
          createdBy: input.userId,
          attemptToken,
        },
      });
      return { kind: 'started', runId: created.id, attemptToken: created.attemptToken };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const raced = await this.findRun(input.organizationId, input.fileHash);
      if (!raced) throw error;
      return this.claimExistingRun(input, raced);
    }
  }

  async replaceSellpiaSnapshot(
    input: ReplaceInput,
  ): Promise<SellpiaInventoryImportResponse> {
    return this.prisma.$transaction(async (tx) => {
      const lockKey = `inventory-sku-import:${input.organizationId}:${SOURCE_TYPE}`;
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
      `;

      const lockedRows = await tx.$queryRaw<LockedRunRow[]>`
        SELECT
          id,
          organization_id AS "organizationId",
          source_type AS "sourceType",
          channel_account_id AS "channelAccountId",
          status,
          attempt_token AS "attemptToken"
        FROM source_import_runs
        WHERE id = ${input.runId}::uuid
          AND organization_id = ${input.organizationId}::uuid
        FOR UPDATE
      `;
      const lockedRun = lockedRows[0];
      if (
        !lockedRun ||
        lockedRun.sourceType !== SOURCE_TYPE ||
        lockedRun.channelAccountId !== null
      ) {
        throw new ConflictException('Sellpia inventory import run is not owned by this tenant');
      }

      if (lockedRun.status === 'completed') {
        const completed = await tx.sourceImportRun.findFirstOrThrow({
          where: {
            id: input.runId,
            organizationId: input.organizationId,
            sourceType: SOURCE_TYPE,
            channelAccountId: null,
            status: 'completed',
          },
        });
        return importResponse(completed, true, zeroChanges());
      }

      if (
        lockedRun.status !== 'running' ||
        lockedRun.attemptToken !== input.attemptToken
      ) {
        throw new ConflictException('Sellpia inventory import attempt no longer owns this run');
      }

      const existing = await tx.masterProduct.findMany({
        where: {
          organizationId: input.organizationId,
          code: { in: input.rows.map((row) => row.sellpiaProductCode) },
        },
        select: { code: true },
      });
      const existingCodes = new Set(existing.map((row) => row.code));
      const createdMasterProductCount = input.rows.filter(
        (row) => !existingCodes.has(row.sellpiaProductCode),
      ).length;
      const updatedMasterProductCount = input.rows.length - createdMasterProductCount;

      for (let offset = 0; offset < input.rows.length; offset += UPSERT_BATCH_SIZE) {
        const batch = input.rows.slice(offset, offset + UPSERT_BATCH_SIZE);
        const payload = JSON.stringify(
          batch.map(toUpsertPayload),
        );
        await tx.$executeRaw`
          INSERT INTO master_products (
            id,
            organization_id,
            code,
            name,
            option_name,
            barcode,
            current_stock,
            purchase_price,
            sale_price,
            is_active,
            raw_json,
            last_import_run_id,
            created_at,
            updated_at
          )
          SELECT
            (record->>'masterProductId')::uuid,
            ${input.organizationId}::uuid,
            record->>'code',
            record->>'name',
            record->>'optionName',
            record->>'barcode',
            (record->>'currentStock')::integer,
            (record->>'purchasePrice')::integer,
            (record->>'salePrice')::integer,
            TRUE,
            record->'rawJson',
            ${input.runId}::uuid,
            NOW(),
            NOW()
          FROM jsonb_array_elements(${payload}::jsonb) AS record
          ON CONFLICT (organization_id, code)
          DO UPDATE SET
            name = EXCLUDED.name,
            option_name = EXCLUDED.option_name,
            barcode = EXCLUDED.barcode,
            current_stock = EXCLUDED.current_stock,
            purchase_price = EXCLUDED.purchase_price,
            sale_price = EXCLUDED.sale_price,
            is_active = TRUE,
            raw_json = EXCLUDED.raw_json,
            last_import_run_id = EXCLUDED.last_import_run_id,
            updated_at = NOW()
        `;
      }

      const completeCodes = input.rows.map((row) => row.sellpiaProductCode);
      const inactivatedMasterProductCount = await tx.masterProduct.count({
        where: {
          organizationId: input.organizationId,
          code: { notIn: completeCodes },
          isActive: true,
        },
      });
      await tx.masterProduct.updateMany({
        where: {
          organizationId: input.organizationId,
          code: { notIn: completeCodes },
        },
        data: {
          currentStock: 0,
          isActive: false,
          lastImportRunId: input.runId,
        },
      });

      const publicationSequence = await nextPublicationSequence(tx, input.organizationId);

      const importedAt = new Date();
      const completion = await tx.sourceImportRun.updateMany({
        where: {
          id: input.runId,
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: null,
          status: 'running',
          attemptToken: input.attemptToken,
        },
        data: {
          status: 'completed',
          rowCount: input.rows.length,
          importedAt,
          lastVerifiedAt: importedAt,
          verificationCount: 1,
          lastTrigger: 'legacy_manual_import',
          publicationSequence,
        },
      });
      if (completion.count !== 1) {
        throw new ConflictException('Sellpia inventory import attempt lost its fence');
      }

      const completed = await tx.sourceImportRun.findFirstOrThrow({
        where: {
          id: input.runId,
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: null,
          status: 'completed',
          attemptToken: input.attemptToken,
        },
      });
      return importResponse(completed, false, {
        createdMasterProductCount,
        updatedMasterProductCount,
        inactivatedMasterProductCount,
      });
    }, TRANSACTION_OPTIONS);
  }

  async markImportFailed(
    organizationId: string,
    runId: string,
    attemptToken: string,
  ): Promise<void> {
    await this.prisma.sourceImportRun.updateMany({
      where: {
        id: runId,
        organizationId,
        sourceType: SOURCE_TYPE,
        channelAccountId: null,
        status: 'running',
        attemptToken,
      },
      data: { status: 'failed' },
    });
  }

  private async claimExistingRun(
    input: ClaimInput,
    run: SourceImportRun,
  ): Promise<ImportClaim> {
    if (run.status === 'completed') {
      return { kind: 'duplicate', response: importResponse(run, true, zeroChanges()) };
    }

    if (run.status === 'running') {
      const staleBefore = new Date(Date.now() - STALE_AFTER_MS);
      if (run.updatedAt >= staleBefore) return { kind: 'running' };

      const attemptToken = randomUUID();
      const reclaimed = await this.prisma.sourceImportRun.updateMany({
        where: {
          id: run.id,
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: null,
          status: 'running',
          updatedAt: run.updatedAt,
          attemptToken: run.attemptToken,
        },
        data: {
          fileName: input.fileName,
          rowCount: input.rowCount,
          createdBy: input.userId,
          importedAt: null,
          attemptToken,
        },
      });
      if (reclaimed.count === 1) {
        return { kind: 'started', runId: run.id, attemptToken };
      }
      return this.resolveLostClaimRace(input, run.id);
    }

    if (run.status === 'failed') {
      const attemptToken = randomUUID();
      const retried = await this.prisma.sourceImportRun.updateMany({
        where: {
          id: run.id,
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: null,
          status: 'failed',
          attemptToken: run.attemptToken,
        },
        data: {
          status: 'running',
          fileName: input.fileName,
          rowCount: input.rowCount,
          createdBy: input.userId,
          importedAt: null,
          attemptToken,
        },
      });
      if (retried.count === 1) {
        return { kind: 'started', runId: run.id, attemptToken };
      }
      return this.resolveLostClaimRace(input, run.id);
    }

    return { kind: 'running' };
  }

  private async resolveLostClaimRace(input: ClaimInput, runId: string): Promise<ImportClaim> {
    const current = await this.prisma.sourceImportRun.findFirst({
      where: {
        id: runId,
        organizationId: input.organizationId,
        sourceType: SOURCE_TYPE,
        channelAccountId: null,
        fileHash: input.fileHash,
      },
    });
    if (!current) return this.claimSellpiaImport(input);
    return this.claimExistingRun(input, current);
  }

  private findRun(organizationId: string, fileHash: string): Promise<SourceImportRun | null> {
    return this.prisma.sourceImportRun.findFirst({
      where: {
        organizationId,
        sourceType: SOURCE_TYPE,
        channelAccountId: null,
        fileHash,
      },
    });
  }
}

function toUpsertPayload(row: ParsedSellpiaInventoryRow) {
  return {
    masterProductId: randomUUID(),
    code: row.sellpiaProductCode,
    name: row.name,
    optionName: row.optionName,
    barcode: row.barcode,
    currentStock: row.currentStock,
    purchasePrice: row.purchasePrice,
    salePrice: row.salePrice,
    rawJson: row.rawJson,
  };
}

async function nextPublicationSequence(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<bigint> {
  const rows = await tx.$queryRaw<Array<{ publicationSequence: bigint }>>`
    SELECT COALESCE(MAX(publication_sequence), 0::bigint) + 1 AS "publicationSequence"
    FROM source_import_runs
    WHERE organization_id = ${organizationId}::uuid
      AND source_type = ${SOURCE_TYPE}
  `;
  const publicationSequence = rows[0]?.publicationSequence;
  if (publicationSequence === undefined) {
    throw new ConflictException('Could not allocate Sellpia publication sequence');
  }
  return publicationSequence;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function zeroChanges(): SellpiaInventoryImportResponse['changes'] {
  return {
    createdMasterProductCount: 0,
    updatedMasterProductCount: 0,
    inactivatedMasterProductCount: 0,
  };
}

function importResponse(
  run: SourceImportRun,
  duplicate: boolean,
  changes: SellpiaInventoryImportResponse['changes'],
): SellpiaInventoryImportResponse {
  const verifiedRun = VerifiedSellpiaSourceImportRunSchema.parse({
    id: run.id,
    sourceType: 'sellpia_inventory',
    channelAccountId: null,
    fileName: run.fileName,
    fileHash: run.fileHash,
    status: run.status,
    rowCount: run.rowCount,
    importedAt: run.importedAt?.toISOString() ?? null,
    lastVerifiedAt: run.lastVerifiedAt?.toISOString() ?? null,
    verificationCount: run.verificationCount,
    lastTrigger: run.lastTrigger,
    freshnessGeneration: run.freshnessGeneration?.toString() ?? null,
    manualFreshExportConfirmedAt:
      run.manualFreshExportConfirmedAt?.toISOString() ?? null,
    manualFreshExportConfirmedBy: run.manualFreshExportConfirmedBy,
    qualityReport: run.qualityReport,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  });
  return {
    run: verifiedRun,
    duplicate,
    outcome: 'published',
    changes,
  };
}
