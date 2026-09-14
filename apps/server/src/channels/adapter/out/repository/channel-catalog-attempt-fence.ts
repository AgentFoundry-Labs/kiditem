import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  COUPANG_CATALOG_BASIC_SOURCE_TYPE,
  COUPANG_CATALOG_DETAILS_SOURCE_TYPE,
  CoupangCatalogCollectionPlanSchema,
  CoupangCatalogDetailManifestConfirmationV1Schema,
  CoupangCatalogListingBasicsChunkV1Schema,
  CoupangCatalogStageSchema,
  type CoupangCatalogStage,
} from '@kiditem/shared/coupang-catalog-snapshot';
import { resolveCoupangVendorId } from '../../../domain/coupang-account-identity';

export const CATALOG_SOURCE = 'coupang_wing_catalog';
export const CATALOG_BASICS_SOURCE = COUPANG_CATALOG_BASIC_SOURCE_TYPE;
export const CATALOG_DETAILS_SOURCE = COUPANG_CATALOG_DETAILS_SOURCE_TYPE;
export const CATALOG_PARSER = 'coupang-catalog-owner-v1';
export const CATALOG_STAGING_SOURCE = 'coupang_wing_catalog_browser';
export const CATALOG_RATE_LIMIT_CODE = 'WING_PROVIDER_RATE_LIMITED';
export const CATALOG_LEGACY_LIST_URL =
  'https://wing.coupang.com/tenants/seller-web/vendor-inventory/list?searchKeywordType=ALL&searchKeywords=&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&shippingFeeSearchType=ALL&displayCategoryCodes=&listingStartTime=null&listingEndTime=null&saleEndDateSearchType=ALL&bundledShippingSearchType=ALL&upBundling=ALL&displayDeletedProduct=false&shippingMethod=ALL&exposureStatus=ALL&locale=ko_KR&sortMethod=SORT_BY_ITEM_LEVEL_UNIT_SOLD&countPerPage=50&page=1';
export const CATALOG_STAGED_LIST_URL =
  'https://wing.coupang.com/tenants/seller-web/vendor-inventory/list?searchKeywordType=ALL&searchKeywords=&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&shippingFeeSearchType=ALL&displayCategoryCodes=&listingStartTime=null&listingEndTime=null&saleEndDateSearchType=ALL&bundledShippingSearchType=ALL&upBundling=ALL&displayDeletedProduct=false&shippingMethod=ALL&exposureStatus=ALL&locale=ko_KR&sortMethod=SORT_BY_ITEM_LEVEL_UNIT_SOLD&countPerPage=500&page=1';
export const CATALOG_LEGACY_DETAIL_URL =
  'https://wing.coupang.com/tenants/seller-web/vendor-inventory/modify';
export const CATALOG_STAGED_DETAIL_URL =
  'https://wing.coupang.com/tenants/seller-web/v2/vendor-inventory/seller-product';
// Keep the old names as compatibility aliases for legacy full-catalog plans.
export const CATALOG_LIST_URL = CATALOG_LEGACY_LIST_URL;
export const CATALOG_DETAIL_URL = CATALOG_LEGACY_DETAIL_URL;
export type CatalogScope = { organizationId: string; channelAccountId: string };
export const catalogSourceForStage = (stage: CoupangCatalogStage = 'full') =>
  stage === 'basics' ? CATALOG_BASICS_SOURCE : stage === 'details' ? CATALOG_DETAILS_SOURCE : CATALOG_SOURCE;
export const catalogWhere = (
  scope: CatalogScope,
  stage: CoupangCatalogStage = 'full',
) => ({
  organizationId: scope.organizationId,
  channelAccountId: scope.channelAccountId,
  sourceType: catalogSourceForStage(stage),
  parserVersion: CATALOG_PARSER,
});
export const catalogAlertKey = (
  channelAccountId: string,
  stage: CoupangCatalogStage = 'full',
) => `channels:${catalogSourceForStage(stage)}:${channelAccountId}`;
export async function lockCatalogAccount(tx: Prisma.TransactionClient, scope: CatalogScope) {
  const key = `channel-catalog-publication:${scope.organizationId}:${CATALOG_SOURCE}:${scope.channelAccountId}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text AS lock`;
}

/** A workbook import holds its account until it goes this long without an update. */
export const CATALOG_WORKBOOK_STALE_AFTER_MS = 30 * 60 * 1_000;

const liveBrowserAttempt = (now: Date) => ({
  parserVersion: CATALOG_PARSER,
  sourceType: { in: [CATALOG_SOURCE, CATALOG_BASICS_SOURCE, CATALOG_DETAILS_SOURCE] },
  expiresAt: { gt: now },
});
const liveWorkbookImport = (now: Date) => ({
  sourceType: CATALOG_SOURCE,
  fileHash: { not: null },
  updatedAt: { gte: new Date(now.getTime() - CATALOG_WORKBOOK_STALE_AFTER_MS) },
});

/**
 * The account's live Wing catalog attempt from either path: a browser
 * collection of any stage inside its lease, or a running workbook import that
 * is not stale. The workbook claim and the browser begin both read this under
 * `lockCatalogAccount`, so one account never holds two live attempts.
 */
export function liveCatalogAttempt(tx: Prisma.TransactionClient, scope: CatalogScope, now = new Date()) {
  return tx.sourceImportRun.findFirst({
    where: {
      organizationId: scope.organizationId,
      channelAccountId: scope.channelAccountId,
      status: 'running',
      OR: [liveBrowserAttempt(now), liveWorkbookImport(now)],
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
}

/** The account's running workbook import that is not stale. */
export function liveCatalogWorkbookImport(tx: Prisma.TransactionClient, scope: CatalogScope, now = new Date()) {
  return tx.sourceImportRun.findFirst({
    where: {
      organizationId: scope.organizationId,
      channelAccountId: scope.channelAccountId,
      status: 'running',
      ...liveWorkbookImport(now),
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
}
export async function lockCatalogAttempt(
  tx: Prisma.TransactionClient,
  input: CatalogScope & { runId: string; attemptToken: string; stage?: CoupangCatalogStage },
) {
  const stage = input.stage ?? 'full';
  const sourceType = catalogSourceForStage(stage);
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM source_import_runs
    WHERE id = ${input.runId}::uuid AND organization_id = ${input.organizationId}::uuid
      AND channel_account_id = ${input.channelAccountId}::uuid
      AND source_type = ${sourceType} AND parser_version = ${CATALOG_PARSER}
    FOR UPDATE
  `;
  if (!rows.length) throw new NotFoundException('Catalog attempt not found');
  const run = await tx.sourceImportRun.findFirstOrThrow({
    where: { ...catalogWhere(input, stage), id: input.runId },
  });
  assertCatalogToken(run.attemptToken, input.attemptToken);
  return run;
}
export function assertCatalogToken(expected: string, received: string) {
  if (!received || received !== expected)
    throw new ConflictException('Catalog attempt token mismatch');
}
export function assertCatalogRunning(run: { status: string; expiresAt: Date | null }) {
  if (run.status !== 'running') throw new ConflictException('Catalog attempt is terminal');
  if (!run.expiresAt || run.expiresAt.getTime() <= Date.now())
    throw new ConflictException('ATTEMPT_EXPIRED');
}

type CatalogPauseRun = {
  status: string;
  expiresAt: Date | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  qualityReport?: unknown;
};

export type CatalogPause = {
  code: typeof CATALOG_RATE_LIMIT_CODE;
  message: string;
  phase: 'hydration';
  recoverable: true;
  notBefore: string | null;
};

/**
 * A provider pause is intentionally represented on the RUNNING source row.
 * Read it from both the indexed error columns and the JSON error envelope so
 * old rows and the durable source payload have one consistent fence.
 */
export function catalogPause(run: CatalogPauseRun): CatalogPause | null {
  const quality = jsonRecord(run.qualityReport);
  const error = jsonRecord(quality?.error);
  if (run.errorCode !== CATALOG_RATE_LIMIT_CODE && error?.code !== CATALOG_RATE_LIMIT_CODE)
    return null;
  return {
    code: CATALOG_RATE_LIMIT_CODE,
    message: typeof error?.message === 'string'
      ? error.message
      : run.errorMessage ?? 'Coupang Wing provider rate limit reached',
    phase: 'hydration',
    recoverable: true,
    notBefore: typeof error?.notBefore === 'string' ? error.notBefore : null,
  };
}

export function assertCatalogWritable(run: CatalogPauseRun) {
  assertCatalogRunning(run);
  const pause = catalogPause(run);
  if (pause) {
    throw new ConflictException({
      code: 'ATTEMPT_PAUSED',
      reason: pause.code,
      message: pause.message,
      phase: pause.phase,
      recoverable: pause.recoverable,
      notBefore: pause.notBefore,
    });
  }
}
export async function catalogAccountVendor(tx: Prisma.TransactionClient, scope: CatalogScope) {
  await tx.$queryRaw`SELECT id FROM channel_accounts WHERE id = ${scope.channelAccountId}::uuid AND organization_id = ${scope.organizationId}::uuid FOR SHARE`;
  const account = await tx.channelAccount.findFirst({
    where: {
      id: scope.channelAccountId,
      organizationId: scope.organizationId,
      status: 'active',
    },
    select: { channel: true, externalAccountId: true, vendorId: true },
  });
  if (!account) throw new NotFoundException('Active channel account not found');
  if (account.channel !== 'coupang')
    throw new BadRequestException('Coupang Wing catalog requires channel=coupang');
  const vendorId = resolveCoupangVendorId(account);
  if (!vendorId) throw new BadRequestException('Coupang account requires a vendor identity');
  return vendorId;
}
export async function catalogPublicationRevision(
  tx: Prisma.TransactionClient,
  scope: CatalogScope,
  stage: CoupangCatalogStage = 'full',
) {
  const aggregate = await tx.sourceImportRun.aggregate({
    where: {
      organizationId: scope.organizationId,
      channelAccountId: scope.channelAccountId,
      sourceType: catalogSourceForStage(stage),
      status: 'completed',
    },
    _max: { publicationSequence: true },
  });
  return aggregate._max.publicationSequence ?? 0n;
}
export async function assertCatalogPublicationPlan(
  tx: Prisma.TransactionClient,
  scope: CatalogScope,
  rawPlan: unknown,
) {
  const plan = CoupangCatalogCollectionPlanSchema.parse(rawPlan);
  const stage = CoupangCatalogStageSchema.parse(plan.stage ?? 'full');
  if (
    plan.channelAccountId !== scope.channelAccountId ||
    plan.vendorId !== (await catalogAccountVendor(tx, scope))
  )
    throw new ConflictException('Catalog account changed after admission');
  if (BigInt(plan.publicationRevision) !== (await catalogPublicationRevision(tx, scope, stage)))
    throw new ConflictException('A newer catalog publication superseded this attempt');
  if (stage === 'details') {
    const basis = await latestCompletedCatalogBasics(tx, scope);
    if (!basis || plan.basicAttemptId !== basis.id || plan.basicManifestHash !== basis.manifestHash ||
      plan.basicPublicationSequence !== basis.publicationSequence) {
      throw new ConflictException('A newer basic catalog publication superseded this detail attempt');
    }
  }
}

/**
 * Details admission is a child handoff, not an invitation to use whichever
 * basics publication happens to be newest after the request was issued.
 * Callers hold the account advisory lock, so this check and the child insert
 * share one serialization boundary.
 */
export async function assertExpectedDetailsBasis(
  tx: Prisma.TransactionClient,
  input: CatalogScope & { expectedBasicAttemptId?: string },
  rawPlan?: unknown,
) {
  const expected = input.expectedBasicAttemptId;
  const plan = rawPlan === undefined
    ? null
    : CoupangCatalogCollectionPlanSchema.parse(rawPlan);
  const pinnedAttemptId = expected || plan?.basicAttemptId;
  const basis = await latestCompletedCatalogBasics(tx, input, pinnedAttemptId);
  if (!basis || (expected && basis.id !== expected)) {
    throw new ConflictException('The details attempt is pinned to a different basic catalog publication');
  }
  if (plan && (plan.stage !== 'details' ||
    (expected && (plan.basicAttemptId !== expected || plan.rootAttemptId !== expected)) ||
    (!expected && plan.basicAttemptId && plan.basicAttemptId !== basis.id))) {
    throw new ConflictException('The details idempotency key is pinned to a different basic catalog publication');
  }
  return basis;
}

export type CatalogBasicsBasis = {
  id: string;
  manifestHash: string;
  publicationSequence: string;
  productIds: string[];
};

/**
 * Finds the last server-complete basics stage.  Details are fenced against
 * this basis independently of the legacy XLSX publication revision.
 */
export async function latestCompletedCatalogBasics(
  tx: Prisma.TransactionClient,
  scope: CatalogScope,
  basisId?: string,
): Promise<CatalogBasicsBasis | null> {
  const run = await tx.sourceImportRun.findFirst({
    where: {
      ...catalogWhere(scope, 'basics'),
      status: 'completed',
      ...(basisId ? { id: basisId } : {}),
    },
    orderBy: [{ publicationSequence: 'desc' }, { importedAt: 'desc' }],
    select: {
      id: true,
      publicationSequence: true,
      qualityReport: true,
      channelScrapeRuns: {
        where: {
          organizationId: scope.organizationId,
          channelAccountId: scope.channelAccountId,
          source: CATALOG_STAGING_SOURCE,
        },
        include: {
          chunks: {
            orderBy: [{ kind: 'asc' }, { sequence: 'asc' }],
            select: { kind: true, sequence: true, payload: true },
          },
        },
      },
    },
  });
  if (!run) return null;
  const quality = jsonRecord(run.qualityReport);
  const manifestHash = typeof quality?.basicManifestHash === 'string'
    ? quality.basicManifestHash
    : typeof quality?.manifestHash === 'string'
      ? quality.manifestHash
      : null;
  const productIds = Array.isArray(quality?.productIds)
    ? quality.productIds.filter((value): value is string => typeof value === 'string')
    : collectBasicProductIds(run.channelScrapeRuns.flatMap((scrape) => scrape.chunks));
  if (!manifestHash || !run.publicationSequence || productIds.length === 0) return null;
  return {
    id: run.id,
    manifestHash,
    publicationSequence: run.publicationSequence.toString(),
    productIds,
  };
}

function collectBasicProductIds(chunks: Array<{ kind: string; sequence: number; payload: unknown }>) {
  const ids: string[] = [];
  for (const chunk of chunks) {
    if (chunk.kind === 'listing_basics') {
      const parsed = CoupangCatalogListingBasicsChunkV1Schema.safeParse(chunk.payload);
      if (parsed.success) ids.push(...parsed.data.products.map(({ product }) => product.externalProductId));
    }
  }
  return ids;
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
