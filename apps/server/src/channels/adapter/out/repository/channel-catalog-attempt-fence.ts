import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CoupangCatalogCollectionPlanSchema } from '@kiditem/shared/coupang-catalog-snapshot';
import { resolveCoupangVendorId } from '../../../domain/coupang-account-identity';

export const CATALOG_SOURCE = 'coupang_wing_catalog';
export const CATALOG_PARSER = 'coupang-catalog-owner-v1';
export const CATALOG_STAGING_SOURCE = 'coupang_wing_catalog_browser';
export const CATALOG_LIST_URL =
  'https://wing.coupang.com/tenants/seller-web/vendor-inventory/list?searchKeywordType=ALL&searchKeywords=&salesMethod=ALL&productStatus=ALL&stockSearchType=ALL&shippingFeeSearchType=ALL&displayCategoryCodes=&listingStartTime=null&listingEndTime=null&saleEndDateSearchType=ALL&bundledShippingSearchType=ALL&upBundling=ALL&displayDeletedProduct=false&shippingMethod=ALL&exposureStatus=ALL&locale=ko_KR&sortMethod=SORT_BY_ITEM_LEVEL_UNIT_SOLD&countPerPage=50&page=1';
export const CATALOG_DETAIL_URL =
  'https://wing.coupang.com/tenants/seller-web/vendor-inventory/modify';
export type CatalogScope = { organizationId: string; channelAccountId: string };
export const catalogWhere = (scope: CatalogScope) => ({
  organizationId: scope.organizationId,
  channelAccountId: scope.channelAccountId,
  sourceType: CATALOG_SOURCE,
  parserVersion: CATALOG_PARSER,
});
export const catalogAlertKey = (channelAccountId: string) =>
  `channels:coupang_wing_catalog:${channelAccountId}`;
export async function lockCatalogAccount(tx: Prisma.TransactionClient, scope: CatalogScope) {
  const key = `channel-catalog-publication:${scope.organizationId}:${CATALOG_SOURCE}:${scope.channelAccountId}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text AS lock`;
}
export async function lockCatalogAttempt(
  tx: Prisma.TransactionClient,
  input: CatalogScope & { runId: string; attemptToken: string },
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM source_import_runs
    WHERE id = ${input.runId}::uuid AND organization_id = ${input.organizationId}::uuid
      AND channel_account_id = ${input.channelAccountId}::uuid
      AND source_type = ${CATALOG_SOURCE} AND parser_version = ${CATALOG_PARSER}
    FOR UPDATE
  `;
  if (!rows.length) throw new NotFoundException('Catalog attempt not found');
  const run = await tx.sourceImportRun.findFirstOrThrow({
    where: { ...catalogWhere(input), id: input.runId },
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
) {
  const aggregate = await tx.sourceImportRun.aggregate({
    where: {
      organizationId: scope.organizationId,
      channelAccountId: scope.channelAccountId,
      sourceType: CATALOG_SOURCE,
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
  if (
    plan.channelAccountId !== scope.channelAccountId ||
    plan.vendorId !== (await catalogAccountVendor(tx, scope))
  )
    throw new ConflictException('Catalog account changed after admission');
  if (BigInt(plan.publicationRevision) !== (await catalogPublicationRevision(tx, scope)))
    throw new ConflictException('A newer catalog publication superseded this attempt');
}
