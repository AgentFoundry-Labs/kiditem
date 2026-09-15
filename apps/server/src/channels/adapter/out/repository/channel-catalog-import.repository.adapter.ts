import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type SourceImportRun } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { SourceFailureAlerts } from '../../../../alerts/alerts.service';
import {
  CompletedSourceArtifactRunSchema,
  type CoupangWingCatalogImportResponse,
  SOURCE_IMPORT_RUN_COMPLETED_STATUS,
  SOURCE_IMPORT_RUN_FAILED_STATUS,
  SOURCE_IMPORT_RUN_RUNNING_STATUS,
} from '@kiditem/shared/source-import';
import type {
  ChannelCatalogImportClaim,
  ChannelCatalogImportRepositoryPort,
} from '../../../application/port/out/repository/channel-catalog-import.repository.port';
import type { ParsedWingCatalogRow } from '../../../application/service/coupang-wing-workbook.parser';
import { resolveCoupangVendorId } from '../../../domain/coupang-account-identity';
import {
  advanceProductMappingGeneration,
  lockProductMapping,
} from '../../../../common/product-mapping-generation';
import { allocatePublicationSequence } from '../../../../common/publication-sequence';
import { buildCoupangWingSnapshotCoverage } from './coupang-wing-snapshot';
import { liveCatalogImport, lockCatalogAccount } from './channel-catalog-attempt-fence';
import { listingRawJsonReplacementSql } from './channel-listing-raw-json';

const SOURCE_TYPE = 'coupang_wing_catalog';
const CHANNEL = 'coupang';
const CLAIM_READ_LIMIT = 3;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  /**
   * One Wing catalog import per account: the claim runs under the same account
   * lock as the browser collection begin and opens no RUNNING row while the
   * account's browser import (either stage, or a pending details handoff) or
   * another workbook import is live, naming that import's root attempt.
   */
  async claimCoupangWingImport(
    input: ClaimInput,
  ): Promise<ChannelCatalogImportClaim> {
    await this.assertActiveWingAccount(input.organizationId, input.channelAccountId);
    try {
      return await this.prisma.$transaction(
        (tx) => this.claimInTransaction(tx, input),
        TRANSACTION_OPTIONS,
      );
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      // A claim outside the account lock created this file's run first.
      return this.prisma.$transaction(
        (tx) => this.claimInTransaction(tx, input),
        TRANSACTION_OPTIONS,
      );
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
      await lockProductMapping(tx, input.organizationId);
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

      if (lockedRun.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS) {
        const completed = await tx.sourceImportRun.findFirstOrThrow({
          where: {
            id: input.runId,
            organizationId: input.organizationId,
            sourceType: SOURCE_TYPE,
            channelAccountId: input.channelAccountId,
            status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
          },
        });
        return importResponse(completed, true, zeroChanges());
      }

      if (
        lockedRun.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS ||
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
          select: { id: true, externalId: true, isActive: true },
        }),
        tx.channelListingOption.findMany({
          where: {
            organizationId: input.organizationId,
            listing: { channelAccountId: input.channelAccountId },
            externalOptionId: { in: externalSkuIds },
          },
          select: { id: true, listingId: true, externalOptionId: true, isActive: true },
        }),
      ]);
      const existingProductIds = new Set(
        existingProducts.map((row) => row.externalId),
      );
      const existingSkuIds = new Set(
        existingSkus.map((row) => row.externalOptionId),
      );
      const existingProductByExternalId = new Map(
        existingProducts.map((row) => [row.externalId, row]),
      );
      const existingSkuByExternalId = new Map(
        existingSkus.map((row) => [row.externalOptionId, row]),
      );
      const mappingIdentityChanged =
        canonicalParents.some((row) => {
          const existing = existingProductByExternalId.get(row.externalProductId);
          return !existing || !existing.isActive;
        })
        || input.rows.some((row) => {
          const existing = existingSkuByExternalId.get(row.externalSkuId);
          return !existing || !existing.isActive;
        });
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
            raw_json = ${listingRawJsonReplacementSql},
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

      let deactivatedSkuCount = 0;
      if (snapshotCoverage.canDeactivateUnseenSkus) {
        const deactivatedSkus = await tx.channelListingOption.updateMany({
          where: {
            organizationId: input.organizationId,
            listing: { channelAccountId: input.channelAccountId },
            externalOptionId: { notIn: snapshotCoverage.externalSkuIds },
            isActive: true,
          },
          data: {
            isActive: false,
            lastImportRunId: input.runId,
          },
        });
        deactivatedSkuCount = deactivatedSkus.count;
      }
      let deactivatedProductCount = 0;
      if (snapshotCoverage.canDeactivateUnseenProducts) {
        const deactivatedProducts = await tx.channelListing.updateMany({
          where: {
            organizationId: input.organizationId,
            channelAccountId: input.channelAccountId,
            externalId: { notIn: snapshotCoverage.externalProductIds },
            isActive: true,
          },
          data: {
            isActive: false,
            lastImportRunId: input.runId,
          },
        });
        deactivatedProductCount = deactivatedProducts.count;
      }

      if (mappingIdentityChanged || deactivatedSkuCount > 0 || deactivatedProductCount > 0) {
        await advanceProductMappingGeneration(tx, input.organizationId);
      }

      const publicationSequence = await allocatePublicationSequence(
        tx,
        input.organizationId,
        SOURCE_TYPE,
      );

      const importedAt = new Date();
      const completion = await tx.sourceImportRun.updateMany({
        where: {
          id: input.runId,
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: input.channelAccountId,
          status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
          attemptToken: input.attemptToken,
        },
        data: {
          status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
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
      await this.alerts.resolveSourceFailure(tx, {
        organizationId: input.organizationId,
        dedupeKey: catalogImportAlertKey(input.channelAccountId),
        attemptId: input.attemptToken,
      });

      const completed = await tx.sourceImportRun.findFirstOrThrow({
        where: {
          id: input.runId,
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: input.channelAccountId,
          status: SOURCE_IMPORT_RUN_COMPLETED_STATUS,
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
    await this.prisma.$transaction(async (tx) => {
      const lockKey = `channel-catalog-import:${organizationId}:${SOURCE_TYPE}:${channelAccountId}`;
      await tx.$queryRaw`
        -- queryraw-tenancy-exempt: organization-scoped advisory lock
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
      `;
      const failed = await tx.sourceImportRun.updateMany({
        where: {
          id: runId,
          organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId,
          status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
          attemptToken,
        },
        data: { status: SOURCE_IMPORT_RUN_FAILED_STATUS },
      });
      if (failed.count === 0) return;
      await this.alerts.recordTerminalOutcome(tx, {
        organizationId,
        dedupeKey: catalogImportAlertKey(channelAccountId),
        sourceType: SOURCE_TYPE,
        // File retries reuse the run, but every claim rotates its attempt token.
        attemptId: attemptToken,
        code: 'CATALOG_IMPORT_FAILED',
        title: '쿠팡 상품 파일 가져오기 실패',
        message: '상품 파일을 가져오지 못했습니다. 파일을 확인한 뒤 다시 시도해주세요.',
        href: `/product-pipeline/registered-products?channelAccountId=${channelAccountId}`,
      });
    }, TRANSACTION_OPTIONS);
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

  private async claimInTransaction(
    tx: Prisma.TransactionClient,
    input: ClaimInput,
  ): Promise<ChannelCatalogImportClaim> {
    await lockCatalogAccount(tx, input);
    // Publication and failure settle a run under their own lock, so a lost
    // compare-and-set reads the run again before deciding.
    for (let read = 0; read < CLAIM_READ_LIMIT; read += 1) {
      const existing = await tx.sourceImportRun.findFirst({
        where: {
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: input.channelAccountId,
          fileHash: input.fileHash,
        },
      });
      if (existing?.status === SOURCE_IMPORT_RUN_COMPLETED_STATUS) {
        return {
          kind: 'duplicate',
          response: importResponse(existing, true, zeroChanges()),
        };
      }
      const live = await liveCatalogImport(tx, input);
      if (live) return { kind: 'running', attemptId: live.attemptId };
      if (!existing) {
        const created = await tx.sourceImportRun.create({
          data: {
            organizationId: input.organizationId,
            sourceType: SOURCE_TYPE,
            channelAccountId: input.channelAccountId,
            fileName: input.fileName,
            fileHash: input.fileHash,
            status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
            rowCount: input.rowCount,
            importedAt: null,
            createdBy: input.userId,
            attemptToken: randomUUID(),
          },
        });
        return {
          kind: 'started',
          runId: created.id,
          attemptToken: created.attemptToken,
        };
      }
      if (existing.status !== SOURCE_IMPORT_RUN_RUNNING_STATUS && existing.status !== SOURCE_IMPORT_RUN_FAILED_STATUS) {
        return { kind: 'running', attemptId: existing.id };
      }
      // A stale running import is reclaimed and a failed one retried, each
      // under a new token so the previous worker's writes stay fenced out.
      const attemptToken = randomUUID();
      const claimed = await tx.sourceImportRun.updateMany({
        where: {
          id: existing.id,
          organizationId: input.organizationId,
          sourceType: SOURCE_TYPE,
          channelAccountId: input.channelAccountId,
          status: existing.status,
          ...(existing.status === SOURCE_IMPORT_RUN_RUNNING_STATUS ? { updatedAt: existing.updatedAt } : {}),
          attemptToken: existing.attemptToken,
        },
        data: {
          status: SOURCE_IMPORT_RUN_RUNNING_STATUS,
          fileName: input.fileName,
          rowCount: input.rowCount,
          createdBy: input.userId,
          importedAt: null,
          attemptToken,
        },
      });
      if (claimed.count === 1) {
        return { kind: 'started', runId: existing.id, attemptToken };
      }
    }
    throw new ConflictException('Coupang Wing catalog import claim lost its fence');
  }
}

function catalogImportAlertKey(channelAccountId: string): string {
  return `channels:${SOURCE_TYPE}:import:${channelAccountId}`;
}

function assertCanonicalCoupangAccountIdentity(account: {
  externalAccountId: string | null;
  vendorId: string | null;
}): void {
  if (!resolveCoupangVendorId(account)) {
    throw new BadRequestException(
      'Coupang Wing catalog imports require a vendor identity',
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
