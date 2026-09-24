import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type SourceImportRun } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
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
import type { ParsedWingCatalogRow } from '../documents/coupang-wing/workbook.parser';
import { resolveCoupangVendorId } from '../../../domain/account/coupang-account-identity';
import { lockProductMapping } from '../../../../products/transaction/product-mapping-lock';
import {
  CHANNELS_PRODUCT_MAPPING_GENERATION_PORT,
  type ChannelsProductMappingGenerationPort,
} from '../../../application/port/out/cross-domain/product-mapping-generation.port';
import { allocatePublicationSequence } from '../../../../common/publication-sequence';
import { buildCoupangWingSnapshotCoverage } from './coupang-wing-snapshot';
import { deactivateCatalogAbsence } from './catalog-absence';
import { liveCatalogImport, lockCatalogAccount } from './channel-catalog-attempt-fence';
import {
  upsertChannelCatalogIdentities,
  type ChannelCatalogIdentityOption,
} from './channel-catalog-identity-upsert';
import {
  CHANNEL_OPTION_RECIPE_PORT,
  type ChannelOptionRecipePort,
} from '../../../application/port/in/channel-option-recipe.port';
import { applyRegisteredOptionRecipes } from '../persistence/registered-option-recipes';

const SOURCE_TYPE = 'coupang_wing_catalog';
const CHANNEL = 'coupang';
const CLAIM_READ_LIMIT = 3;
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
    @Inject(CHANNEL_OPTION_RECIPE_PORT)
    private readonly recipes: ChannelOptionRecipePort,
    @Inject(CHANNELS_PRODUCT_MAPPING_GENERATION_PORT)
    private readonly productMapping: ChannelsProductMappingGenerationPort,
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
      const optionsByProduct = new Map<string, ChannelCatalogIdentityOption[]>();
      for (const row of input.rows) {
        const options = optionsByProduct.get(row.externalProductId) ?? [];
        options.push({
          externalOptionId: row.externalSkuId,
          optionName: row.optionName,
          salePrice: null,
          sellerSku: null,
          barcode: row.barcode,
          modelNumber: row.modelNumber,
          skuStatus: row.skuStatus,
          attributes: row.attributesJson,
          raw: row.rawJson,
        });
        optionsByProduct.set(row.externalProductId, options);
      }

      const identities = await upsertChannelCatalogIdentities(tx, {
        organizationId: input.organizationId,
        channelAccountId: input.channelAccountId,
        lastImportRunId: input.runId,
        rawSource: SOURCE_TYPE,
        // 윙 엑셀에는 판매자코드 칸도 판매가 칸도 없다. 브라우저 수집이 본 값을 지우지 않는다.
        // 옵션명·판매상태·모델번호·바코드는 양식의 필수 칸이라 그대로 관측한다.
        unobservedOptionFields: ['sellerSku', 'salePrice'],
        products: canonicalParents.map((parent) => ({
          externalProductId: parent.externalProductId,
          registeredName: parent.registeredName,
          displayName: parent.displayName,
          category: parent.category,
          manufacturer: parent.manufacturer,
          brand: parent.brand,
          productStatus: parent.productStatus,
          raw: parent.rawJson,
          options: optionsByProduct.get(parent.externalProductId) ?? [],
        })),
      });
      const { mappingIdentityChanged } = identities;
      const {
        createdProductCount,
        updatedProductCount,
        createdSkuCount,
        updatedSkuCount,
      } = identities.changes;

      await applyRegisteredOptionRecipes(ownerTransaction(tx), this.recipes, {
        organizationId: input.organizationId,
        channelListingIds: [...identities.listingIds.values()],
      });

      // 건너뛴 줄 때문에 한 차원을 완전히 덮지 못했으면 그 차원은 끄지 않는다.
      const absence = await deactivateCatalogAbsence(tx, {
        organizationId: input.organizationId,
        channelAccountId: input.channelAccountId,
        sourceImportRunId: input.runId,
        // 윙 엑셀은 계정의 상품 목록 전체를 한 번에 담는다.
        scope: { kind: 'account' },
        presentExternalProductIds: snapshotCoverage.canDeactivateUnseenProducts
          ? snapshotCoverage.externalProductIds
          : null,
        presentExternalOptionIds: snapshotCoverage.canDeactivateUnseenSkus
          ? snapshotCoverage.externalSkuIds
          : null,
      });
      const deactivatedSkuCount = absence.options;
      const deactivatedProductCount = absence.listings;

      if (mappingIdentityChanged || deactivatedSkuCount > 0 || deactivatedProductCount > 0) {
        await this.productMapping.advance(tx, input.organizationId);
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
