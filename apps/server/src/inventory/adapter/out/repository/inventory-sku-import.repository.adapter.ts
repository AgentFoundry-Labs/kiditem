import { createHash, randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type SourceImportRun } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ImportClaim,
  InventorySkuImportRepositoryPort,
} from '../../../application/port/out/repository/inventory-sku-import.repository.port';
import type { ParsedSellpiaInventoryRow } from '../../../application/service/sellpia-inventory-workbook.parser';
import type { SellpiaInventoryImportResponse } from '@kiditem/shared/source-import';

const SOURCE_TYPE = 'sellpia_inventory';
const STALE_AFTER_MS = 30 * 60 * 1_000;
const UPSERT_BATCH_SIZE = 500;
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 60_000 } as const;

type ClaimInput = Parameters<InventorySkuImportRepositoryPort['claimSellpiaImport']>[0];
type ReplaceInput = Parameters<InventorySkuImportRepositoryPort['replaceSellpiaSnapshot']>[0];

type LockedRunRow = {
  id: string;
  organizationId: string;
  sourceType: string;
  channelAccountId: string | null;
  status: string;
  attemptToken: string;
};

@Injectable()
export class InventorySkuImportRepositoryAdapter
implements InventorySkuImportRepositoryPort {
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

      const existing = await tx.inventorySku.findMany({
        where: { organizationId: input.organizationId },
        select: { id: true, sellpiaProductCode: true },
      });
      const existingCodes = new Set(existing.map((row) => row.sellpiaProductCode));
      const createdSkuCount = input.rows.filter(
        (row) => !existingCodes.has(row.sellpiaProductCode),
      ).length;
      const updatedSkuCount = input.rows.length - createdSkuCount;

      for (let offset = 0; offset < input.rows.length; offset += UPSERT_BATCH_SIZE) {
        const batch = input.rows.slice(offset, offset + UPSERT_BATCH_SIZE);
        const payload = JSON.stringify(
          batch.map((row) => toUpsertPayload(input.organizationId, row)),
        );
        await tx.$executeRaw`
          INSERT INTO inventory_skus (
            id,
            organization_id,
            sellpia_product_code,
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
            (record->>'inventorySkuId')::uuid,
            ${input.organizationId}::uuid,
            record->>'sellpiaProductCode',
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
          ON CONFLICT (organization_id, sellpia_product_code)
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

        await tx.$executeRaw`
          INSERT INTO master_products (
            id,
            organization_id,
            code,
            name,
            sellpia_product_code,
            sellpia_name,
            sellpia_barcode,
            option_name,
            current_stock,
            purchase_price,
            sale_price,
            is_active,
            raw_json,
            last_import_run_id,
            is_temporary,
            temporary_reason,
            lifecycle_state,
            created_at,
            updated_at
          )
          SELECT
            (record->>'masterProductId')::uuid,
            ${input.organizationId}::uuid,
            record->>'masterCode',
            record->>'name',
            record->>'sellpiaProductCode',
            record->>'name',
            record->>'barcode',
            record->>'optionName',
            (record->>'currentStock')::integer,
            (record->>'purchasePrice')::integer,
            (record->>'salePrice')::integer,
            TRUE,
            record->'rawJson',
            ${input.runId}::uuid,
            TRUE,
            'sellpia_master_cutover',
            'inventory_staged',
            NOW(),
            NOW()
          FROM jsonb_array_elements(${payload}::jsonb) AS record
          ON CONFLICT (organization_id, sellpia_product_code)
            WHERE sellpia_product_code IS NOT NULL
          DO UPDATE SET
            name = EXCLUDED.name,
            sellpia_name = EXCLUDED.sellpia_name,
            sellpia_barcode = EXCLUDED.sellpia_barcode,
            option_name = EXCLUDED.option_name,
            current_stock = EXCLUDED.current_stock,
            purchase_price = EXCLUDED.purchase_price,
            sale_price = EXCLUDED.sale_price,
            is_active = TRUE,
            raw_json = EXCLUDED.raw_json,
            last_import_run_id = EXCLUDED.last_import_run_id,
            is_temporary = TRUE,
            temporary_reason = 'sellpia_master_cutover',
            lifecycle_state = 'inventory_staged',
            updated_at = NOW()
        `;

        await tx.$executeRaw`
          INSERT INTO inventory_sku_master_product_maps (
            id,
            organization_id,
            inventory_sku_id,
            master_product_id,
            resolution,
            details,
            created_at,
            updated_at
          )
          SELECT
            (record->>'identityId')::uuid,
            ${input.organizationId}::uuid,
            inventory_sku.id,
            master_product.id,
            'sellpia_import',
            jsonb_build_object(
              'sourceType', ${SOURCE_TYPE}::text,
              'sellpiaProductCode', record->>'sellpiaProductCode'
            ),
            NOW(),
            NOW()
          FROM jsonb_array_elements(${payload}::jsonb) AS record
          JOIN inventory_skus AS inventory_sku
            ON inventory_sku.organization_id = ${input.organizationId}::uuid
           AND inventory_sku.sellpia_product_code = record->>'sellpiaProductCode'
          JOIN master_products AS master_product
            ON master_product.organization_id = ${input.organizationId}::uuid
           AND master_product.sellpia_product_code = record->>'sellpiaProductCode'
          ON CONFLICT DO NOTHING
        `;
      }

      const completeCodes = input.rows.map((row) => row.sellpiaProductCode);
      const publishedIdentities = await tx.inventorySku.findMany({
        where: {
          organizationId: input.organizationId,
          sellpiaProductCode: { in: completeCodes },
        },
        select: {
          sellpiaProductCode: true,
          masterProductMap: {
            select: {
              organizationId: true,
              masterProduct: {
                select: {
                  organizationId: true,
                  sellpiaProductCode: true,
                },
              },
            },
          },
        },
      });
      const invalidIdentity = publishedIdentities.find(
        (inventorySku) =>
          !inventorySku.masterProductMap ||
          inventorySku.masterProductMap.organizationId !== input.organizationId ||
          inventorySku.masterProductMap.masterProduct.organizationId !== input.organizationId ||
          inventorySku.masterProductMap.masterProduct.sellpiaProductCode !==
            inventorySku.sellpiaProductCode,
      );
      if (publishedIdentities.length !== completeCodes.length || invalidIdentity) {
        throw new ConflictException(
          'Sellpia inventory identity ledger did not resolve every published code',
        );
      }

      const absentSkuWhere = {
        organizationId: input.organizationId,
        sellpiaProductCode: { notIn: completeCodes },
      } as const;
      const zeroedSkuCount = await tx.inventorySku.count({
        where: {
          ...absentSkuWhere,
          currentStock: { not: 0 },
        },
      });
      await tx.inventorySku.updateMany({
        where: {
          ...absentSkuWhere,
        },
        data: {
          currentStock: 0,
          isActive: false,
          lastImportRunId: input.runId,
        },
      });
      await tx.masterProduct.updateMany({
        where: {
          organizationId: input.organizationId,
          sellpiaProductCode: {
            not: null,
            notIn: completeCodes,
          },
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
        createdSkuCount,
        updatedSkuCount,
        zeroedSkuCount,
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

function toUpsertPayload(organizationId: string, row: ParsedSellpiaInventoryRow) {
  return {
    inventorySkuId: randomUUID(),
    masterProductId: randomUUID(),
    identityId: randomUUID(),
    masterCode: stagedMasterCode(organizationId, row.sellpiaProductCode),
    sellpiaProductCode: row.sellpiaProductCode,
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

function stagedMasterCode(organizationId: string, sellpiaProductCode: string): string {
  const digest = createHash('sha256').update(sellpiaProductCode).digest('hex').slice(0, 24);
  return `SELLPIA::${organizationId}::${digest}`;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function zeroChanges(): SellpiaInventoryImportResponse['changes'] {
  return { createdSkuCount: 0, updatedSkuCount: 0, zeroedSkuCount: 0 };
}

function importResponse(
  run: SourceImportRun,
  duplicate: boolean,
  changes: SellpiaInventoryImportResponse['changes'],
): SellpiaInventoryImportResponse {
  return {
    run: {
      id: run.id,
      sourceType: 'sellpia_inventory',
      channelAccountId: null,
      fileName: run.fileName,
      fileHash: run.fileHash,
      status: run.status as 'completed',
      rowCount: run.rowCount,
      importedAt: run.importedAt?.toISOString() ?? null,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    },
    duplicate,
    changes,
  };
}
