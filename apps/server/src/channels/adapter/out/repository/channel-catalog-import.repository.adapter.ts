import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type SourceImportRun } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  CompletedSourceArtifactRunSchema,
  type CoupangWingCatalogImportResponse,
} from '@kiditem/shared/source-import';
import type {
  ChannelCatalogImportClaim,
  ChannelCatalogImportRepositoryPort,
} from '../../../application/port/out/repository/channel-catalog-import.repository.port';
import type { ParsedWingCatalogRow } from '../../../application/service/coupang-wing-workbook.parser';
import { buildCoupangWingSnapshotCoverage } from './coupang-wing-snapshot';

const SOURCE_TYPE = 'coupang_wing_catalog';
const CHANNEL = 'coupang';
const STALE_AFTER_MS = 30 * 60 * 1_000;
const UPSERT_BATCH_SIZE = 500;
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 60_000 } as const;

type ClaimInput = Parameters<
  ChannelCatalogImportRepositoryPort['claimCoupangWingImport']
>[0];
type UpsertInput = Parameters<
  ChannelCatalogImportRepositoryPort['upsertCoupangWingCatalog']
>[0];

type LockedRunRow = {
  id: string;
  organizationId: string;
  sourceType: string;
  channelAccountId: string | null;
  status: string;
  attemptToken: string;
};

type CanonicalParent = Pick<
  ParsedWingCatalogRow,
  | 'externalProductId'
  | 'registeredName'
  | 'displayName'
  | 'category'
  | 'manufacturer'
  | 'brand'
  | 'productStatus'
  | 'rawJson'
>;

@Injectable()
export class ChannelCatalogImportRepositoryAdapter
implements ChannelCatalogImportRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async claimCoupangWingImport(
    input: ClaimInput,
  ): Promise<ChannelCatalogImportClaim> {
    await this.assertActiveWingAccount(input.organizationId, input.channelAccountId);

    const existing = await this.findRun(
      input.organizationId,
      input.channelAccountId,
      input.fileHash,
    );
    if (existing) return this.claimExistingRun(input, existing);

    const attemptToken = randomUUID();
    try {
      const created = await this.prisma.sourceImportRun.create({
        data: {
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: input.channelAccountId,
          fileName: input.fileName,
          fileHash: input.fileHash,
          status: 'running',
          rowCount: input.rowCount,
          importedAt: null,
          createdBy: input.userId,
          attemptToken,
        },
      });
      return {
        kind: 'started',
        runId: created.id,
        attemptToken: created.attemptToken,
      };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const raced = await this.findRun(
        input.organizationId,
        input.channelAccountId,
        input.fileHash,
      );
      if (!raced) throw error;
      return this.claimExistingRun(input, raced);
    }
  }

  async upsertCoupangWingCatalog(
    input: UpsertInput,
  ): Promise<CoupangWingCatalogImportResponse> {
    if (input.rows.length === 0) {
      throw new BadRequestException(
        'Coupang Wing catalog publication requires at least one valid row.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const lockKey =
        `channel-catalog-import:${input.organizationId}:${SOURCE_TYPE}:${input.channelAccountId}`;
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
      `;

      const account = await tx.channelAccount.findFirst({
        where: {
          id: input.channelAccountId,
          organizationId: input.organizationId,
          status: 'active',
        },
        select: { id: true, channel: true, externalAccountId: true, vendorId: true },
      });
      if (!account) {
        throw new NotFoundException('Active channel account not found');
      }
      if (account.channel !== CHANNEL) {
        throw new BadRequestException(
          'Coupang Wing catalog imports require a channel=coupang account',
        );
      }
      assertCanonicalCoupangAccountIdentity(account);

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
          AND channel_account_id = ${input.channelAccountId}::uuid
        FOR UPDATE
      `;
      const lockedRun = lockedRows[0];
      if (
        !lockedRun ||
        lockedRun.sourceType !== SOURCE_TYPE ||
        lockedRun.channelAccountId !== input.channelAccountId
      ) {
        throw new ConflictException(
          'Coupang Wing catalog import run is not owned by this tenant/account',
        );
      }

      if (lockedRun.status === 'completed') {
        const completed = await tx.sourceImportRun.findFirstOrThrow({
          where: {
            id: input.runId,
            organizationId: input.organizationId,
            sourceType: SOURCE_TYPE,
            channelAccountId: input.channelAccountId,
            status: 'completed',
          },
        });
        return importResponse(completed, true, zeroChanges());
      }

      if (
        lockedRun.status !== 'running' ||
        lockedRun.attemptToken !== input.attemptToken
      ) {
        throw new ConflictException(
          'Coupang Wing catalog import attempt no longer owns this run',
        );
      }

      const canonicalParents = canonicalParentRows(input.rows);
      const snapshotCoverage = buildCoupangWingSnapshotCoverage(
        input.rows,
        input.skippedRows,
      );
      const externalProductIds = canonicalParents.map(
        (row) => row.externalProductId,
      );
      const externalSkuIds = input.rows.map((row) => row.externalSkuId);
      const [existingProducts, existingSkus] = await Promise.all([
        tx.channelListing.findMany({
          where: {
            organizationId: input.organizationId,
            channelAccountId: input.channelAccountId,
            externalId: { in: externalProductIds },
          },
          select: { id: true, externalId: true },
        }),
        tx.channelListingOption.findMany({
          where: {
            organizationId: input.organizationId,
            listing: { channelAccountId: input.channelAccountId },
            externalOptionId: { in: externalSkuIds },
          },
          select: { id: true, listingId: true, externalOptionId: true },
        }),
      ]);
      const existingProductIds = new Set(
        existingProducts.map((row) => row.externalId),
      );
      const existingSkuIds = new Set(
        existingSkus.map((row) => row.externalOptionId),
      );
      const createdProductCount = canonicalParents.filter(
        (row) => !existingProductIds.has(row.externalProductId),
      ).length;
      const updatedProductCount = canonicalParents.length - createdProductCount;
      const createdSkuCount = input.rows.filter(
        (row) => !existingSkuIds.has(row.externalSkuId),
      ).length;
      const updatedSkuCount = input.rows.length - createdSkuCount;

      for (
        let offset = 0;
        offset < canonicalParents.length;
        offset += UPSERT_BATCH_SIZE
      ) {
        const batch = canonicalParents.slice(offset, offset + UPSERT_BATCH_SIZE);
        const payload = JSON.stringify(
          batch.map((row) => ({ id: randomUUID(), ...row })),
        );
        await tx.$executeRaw`
          INSERT INTO channel_listings (
            id,
            organization_id,
            channel_account_id,
            external_id,
            channel_name,
            display_name,
            category,
            manufacturer,
            brand,
            status,
            raw_json,
            last_import_run_id,
            is_active,
            created_at,
            updated_at
          )
          SELECT
            (record->>'id')::uuid,
            ${input.organizationId}::uuid,
            ${input.channelAccountId}::uuid,
            record->>'externalProductId',
            record->>'registeredName',
            record->>'displayName',
            record->>'category',
            record->>'manufacturer',
            record->>'brand',
            record->>'productStatus',
            record->'rawJson',
            ${input.runId}::uuid,
            TRUE,
            NOW(),
            NOW()
          FROM jsonb_array_elements(${payload}::jsonb) AS record
          ON CONFLICT (organization_id, channel_account_id, external_id)
            WHERE channel_account_id IS NOT NULL
          DO UPDATE SET
            channel_name = EXCLUDED.channel_name,
            display_name = EXCLUDED.display_name,
            category = EXCLUDED.category,
            manufacturer = EXCLUDED.manufacturer,
            brand = EXCLUDED.brand,
            status = EXCLUDED.status,
            raw_json = EXCLUDED.raw_json,
            last_import_run_id = EXCLUDED.last_import_run_id,
            is_active = TRUE,
            updated_at = NOW()
        `;
      }

      const persistedProducts = await tx.channelListing.findMany({
        where: {
          organizationId: input.organizationId,
          channelAccountId: input.channelAccountId,
          externalId: { in: externalProductIds },
        },
        select: { id: true, externalId: true },
      });
      const productIdByExternalId = new Map(
        persistedProducts.map((row) => [row.externalId, row.id]),
      );
      if (productIdByExternalId.size !== canonicalParents.length) {
        throw new ConflictException(
          'Coupang Wing parent upsert did not resolve every imported product',
        );
      }

      const importedParentBySku = new Map(
        input.rows.map((row) => [row.externalSkuId, row.externalProductId]),
      );
      for (const existingSku of existingSkus) {
        const importedParentId = productIdByExternalId.get(
          importedParentBySku.get(existingSku.externalOptionId) ?? '',
        );
        if (!importedParentId || existingSku.listingId !== importedParentId) {
          throw new BadRequestException(
            `External SKU ${existingSku.externalOptionId} is already attached to a different parent`,
          );
        }
      }

      for (let offset = 0; offset < input.rows.length; offset += UPSERT_BATCH_SIZE) {
        const batch = input.rows.slice(offset, offset + UPSERT_BATCH_SIZE);
        const payload = JSON.stringify(
          batch.map((row) => ({
            id: randomUUID(),
            listingId: productIdByExternalId.get(row.externalProductId),
            externalSkuId: row.externalSkuId,
            optionName: row.optionName,
            skuStatus: row.skuStatus,
            modelNumber: row.modelNumber,
            barcode: row.barcode,
            attributesJson: row.attributesJson,
            rawJson: row.rawJson,
          })),
        );
        await tx.$executeRaw`
          INSERT INTO channel_listing_options (
            id,
            listing_id,
            organization_id,
            external_option_id,
            item_name,
            seller_sku,
            sale_price,
            barcode,
            model_number,
            status,
            attributes_json,
            raw_json,
            last_import_run_id,
            is_active,
            created_at,
            updated_at
          )
          SELECT
            (record->>'id')::uuid,
            (record->>'listingId')::uuid,
            ${input.organizationId}::uuid,
            record->>'externalSkuId',
            record->>'optionName',
            NULL,
            NULL,
            record->>'barcode',
            record->>'modelNumber',
            record->>'skuStatus',
            record->'attributesJson',
            record->'rawJson',
            ${input.runId}::uuid,
            TRUE,
            NOW(),
            NOW()
          FROM jsonb_array_elements(${payload}::jsonb) AS record
          ON CONFLICT (listing_id, external_option_id)
          DO UPDATE SET
            listing_id = EXCLUDED.listing_id,
            item_name = EXCLUDED.item_name,
            barcode = EXCLUDED.barcode,
            model_number = EXCLUDED.model_number,
            status = EXCLUDED.status,
            attributes_json = EXCLUDED.attributes_json,
            raw_json = EXCLUDED.raw_json,
            last_import_run_id = EXCLUDED.last_import_run_id,
            is_active = TRUE,
            updated_at = NOW()
        `;
      }

      if (snapshotCoverage.canDeactivateUnseenSkus) {
        await tx.channelListingOption.updateMany({
          where: {
            organizationId: input.organizationId,
            listing: { channelAccountId: input.channelAccountId },
            externalOptionId: { notIn: snapshotCoverage.externalSkuIds },
          },
          data: {
            isActive: false,
            lastImportRunId: input.runId,
          },
        });
      }
      if (snapshotCoverage.canDeactivateUnseenProducts) {
        await tx.channelListing.updateMany({
          where: {
            organizationId: input.organizationId,
            channelAccountId: input.channelAccountId,
            externalId: { notIn: snapshotCoverage.externalProductIds },
          },
          data: {
            isActive: false,
            lastImportRunId: input.runId,
          },
        });
      }

      const publicationSequence = await nextPublicationSequence(tx, input.organizationId);

      const importedAt = new Date();
      const completion = await tx.sourceImportRun.updateMany({
        where: {
          id: input.runId,
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: input.channelAccountId,
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
        throw new ConflictException(
          'Coupang Wing catalog import attempt lost its fence',
        );
      }

      const completed = await tx.sourceImportRun.findFirstOrThrow({
        where: {
          id: input.runId,
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: input.channelAccountId,
          status: 'completed',
          attemptToken: input.attemptToken,
        },
      });
      return importResponse(completed, false, {
        createdProductCount,
        updatedProductCount,
        createdSkuCount,
        updatedSkuCount,
        skippedRowCount: input.skippedRows.length,
      });
    }, TRANSACTION_OPTIONS);
  }

  async markImportFailed(
    organizationId: string,
    channelAccountId: string,
    runId: string,
    attemptToken: string,
  ): Promise<void> {
    await this.prisma.sourceImportRun.updateMany({
      where: {
        id: runId,
        organizationId,
        sourceType: SOURCE_TYPE,
        channelAccountId,
        status: 'running',
        attemptToken,
      },
      data: { status: 'failed' },
    });
  }

  private async assertActiveWingAccount(
    organizationId: string,
    channelAccountId: string,
  ): Promise<void> {
    const account = await this.prisma.channelAccount.findFirst({
      where: { id: channelAccountId, organizationId, status: 'active' },
      select: { id: true, channel: true, externalAccountId: true, vendorId: true },
    });
    if (!account) throw new NotFoundException('Active channel account not found');
    if (account.channel !== CHANNEL) {
      throw new BadRequestException(
        'Coupang Wing catalog imports require a channel=coupang account',
      );
    }
    assertCanonicalCoupangAccountIdentity(account);
  }

  private async claimExistingRun(
    input: ClaimInput,
    run: SourceImportRun,
  ): Promise<ChannelCatalogImportClaim> {
    if (run.status === 'completed') {
      return {
        kind: 'duplicate',
        response: importResponse(run, true, zeroChanges()),
      };
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
          channelAccountId: input.channelAccountId,
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
          channelAccountId: input.channelAccountId,
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

  private async resolveLostClaimRace(
    input: ClaimInput,
    runId: string,
  ): Promise<ChannelCatalogImportClaim> {
    const current = await this.prisma.sourceImportRun.findFirst({
      where: {
        id: runId,
        organizationId: input.organizationId,
        sourceType: SOURCE_TYPE,
        channelAccountId: input.channelAccountId,
        fileHash: input.fileHash,
      },
    });
    if (!current) return this.claimCoupangWingImport(input);
    return this.claimExistingRun(input, current);
  }

  private findRun(
    organizationId: string,
    channelAccountId: string,
    fileHash: string,
  ): Promise<SourceImportRun | null> {
    return this.prisma.sourceImportRun.findFirst({
      where: {
        organizationId,
        sourceType: SOURCE_TYPE,
        channelAccountId,
        fileHash,
      },
    });
  }
}

function assertCanonicalCoupangAccountIdentity(account: {
  externalAccountId: string | null;
  vendorId: string | null;
}): void {
  const externalAccountId = account.externalAccountId?.trim();
  if (!externalAccountId) {
    throw new BadRequestException(
      'Coupang Wing catalog imports require a nonblank external account identity',
    );
  }

  const vendorId = account.vendorId?.trim();
  if (vendorId && vendorId !== externalAccountId) {
    throw new ConflictException(
      'Coupang account vendor identity conflicts with its external account identity',
    );
  }
}

function canonicalParentRows(rows: ParsedWingCatalogRow[]): CanonicalParent[] {
  const parents = new Map<string, CanonicalParent>();
  for (const row of rows) {
    const existing = parents.get(row.externalProductId);
    if (!existing) {
      parents.set(row.externalProductId, {
        externalProductId: row.externalProductId,
        registeredName: row.registeredName,
        displayName: row.displayName,
        category: row.category,
        manufacturer: row.manufacturer,
        brand: row.brand,
        productStatus: row.productStatus,
        rawJson: row.rawJson,
      });
      continue;
    }
    existing.registeredName ??= row.registeredName;
    existing.displayName ??= row.displayName;
    existing.category ??= row.category;
    existing.manufacturer ??= row.manufacturer;
    existing.brand ??= row.brand;
    existing.productStatus ??= row.productStatus;
  }
  return [...parents.values()];
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

async function nextPublicationSequence(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<bigint> {
  const sequenceLockKey = `channel-catalog-sequence:${organizationId}:${SOURCE_TYPE}`;
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${sequenceLockKey}, 0))::text AS "lock"
  `;
  const rows = await tx.$queryRaw<Array<{ publicationSequence: bigint }>>`
    SELECT COALESCE(MAX(publication_sequence), 0::bigint) + 1 AS "publicationSequence"
    FROM source_import_runs
    WHERE organization_id = ${organizationId}::uuid
      AND source_type = ${SOURCE_TYPE}
  `;
  const publicationSequence = rows[0]?.publicationSequence;
  if (publicationSequence === undefined) {
    throw new ConflictException('Could not allocate channel catalog publication sequence');
  }
  return publicationSequence;
}

function zeroChanges(): CoupangWingCatalogImportResponse['changes'] {
  return {
    createdProductCount: 0,
    updatedProductCount: 0,
    createdSkuCount: 0,
    updatedSkuCount: 0,
    skippedRowCount: 0,
  };
}

function importResponse(
  run: SourceImportRun,
  duplicate: boolean,
  changes: CoupangWingCatalogImportResponse['changes'],
): CoupangWingCatalogImportResponse {
  if (run.channelAccountId === null) {
    throw new ConflictException(
      'Completed Coupang Wing import is missing its channel account',
    );
  }
  const completedRun = CompletedSourceArtifactRunSchema.parse({
    id: run.id,
    sourceType: 'coupang_wing_catalog',
    channelAccountId: run.channelAccountId,
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
    run: completedRun,
    duplicate,
    changes,
  };
}
