import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeTestPrisma, OTHER_ORGANIZATION_ID, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID as ORG } from '../../test-helpers/real-prisma';
import { advertisingLedgerTestReader } from '../../test-helpers/channel-fact-ports';
import { setupChannelListing, setupMaster, setupProductOption } from '../../test-helpers/finance-seeds';
import { seedAdReportRun, seedListingAdDay } from '../../test-helpers/ad-ledger-seeds';
import type { PrismaService } from '../../prisma/prisma.service';
import { ownerTransaction } from '../../prisma/owner-transaction';

/**
 * 기여이익 월 배분(KID-372 ①b, 읽을 때 계산). 잠그는 것: 달마다 측정한 날의 리스팅 합(집행액·청구액)만 현재 확정 레시피
 * 무게(구성품 수량 합)로 원천상품에 나누고, 원 단위 나머지는 무게가 큰 원천상품부터 1원씩 준다. 측정하지 않은 날의 행,
 * 레시피 없는 리스팅, 다른 조직 행은 배분에 들지 않는다.
 */
describe('readMonthlyAdAllocation (PG)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  /** 원천상품 하나를 구성품으로 둔 쿠팡 리스팅. */
  async function listingOf(organizationId: string, code: string) {
    const { id: masterId } = await setupMaster(prisma, { organizationId, code: `M-${code}`, name: code });
    const { id: optionId } = await setupProductOption(prisma, { organizationId, masterId, sku: `SKU-${code}`, costPrice: 0 });
    const listing = await setupChannelListing(prisma, {
      organizationId, masterId, channel: 'coupang', externalId: `EXT-${code}`, optionId, externalOptionId: `VI-${code}`,
    });
    return { ...listing, masterProductId: optionId };
  }

  const read = (organizationId: string, months: string[]) =>
    advertisingLedgerTestReader(prisma as unknown as PrismaService)
      .readMonthlyAdAllocation(ownerTransaction(prisma as never), { organizationId, months });

  it('splits each listing month over measured days by the current recipe weights, remainder to the heavier product', async () => {
    const bundle = await listingOf(ORG, 'BUNDLE');
    const single = await listingOf(ORG, 'SINGLE');
    // BUNDLE = 2 × its own product + 1 × SINGLE's product → weights 2 : 1.
    await prisma.channelListingOptionInventoryComponent.updateMany({
      where: { channelListingOptionId: bundle.listingOptionId },
      data: { quantity: 2 },
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: { organizationId: ORG, channelListingOptionId: bundle.listingOptionId, masterProductId: single.masterProductId, quantity: 1 },
    });
    const { channelAccountId } = await seedListingAdDay(prisma, {
      organizationId: ORG, listingId: bundle.listingId, date: '2026-04-05', spend: 1_000, billedSpend: 901,
    });
    await seedListingAdDay(prisma, {
      organizationId: ORG, listingId: single.listingId, date: '2026-04-06', spend: 300, billedSpend: 280,
    });
    // Only 04-05 and 04-06 are measured; nothing else in April is.

    const rows = await read(ORG, ['2026-04']);

    const sorted = [...rows].sort((a, b) => a.channelListingId.localeCompare(b.channelListingId) || a.masterProductId.localeCompare(b.masterProductId));
    expect(sorted).toEqual([
      // 1,000 × 2/3 = 666.7 → 667 (the remainder won goes to the heavier product), 333; billed 901 → 601 / 300.
      { masterProductId: bundle.masterProductId, channelListingId: bundle.listingId, channelAccountId, month: '2026-04', allocatedSpend: 667, allocatedBilledSpend: 601, measuredDays: 2 },
      { masterProductId: single.masterProductId, channelListingId: bundle.listingId, channelAccountId, month: '2026-04', allocatedSpend: 333, allocatedBilledSpend: 300, measuredDays: 2 },
      { masterProductId: single.masterProductId, channelListingId: single.listingId, channelAccountId, month: '2026-04', allocatedSpend: 300, allocatedBilledSpend: 280, measuredDays: 2 },
    ].sort((a, b) => a.channelListingId.localeCompare(b.channelListingId) || a.masterProductId.localeCompare(b.masterProductId)));
  });

  it('leaves out rows of unmeasured days, months not asked for, listings without a recipe and other organizations', async () => {
    const listed = await listingOf(ORG, 'LISTED');
    const unmapped = await listingOf(ORG, 'UNMAPPED');
    await prisma.channelListingOptionInventoryComponent.deleteMany({ where: { channelListingOptionId: unmapped.listingOptionId } });
    const other = await listingOf(OTHER_ORGANIZATION_ID, 'OTHER');
    await seedListingAdDay(prisma, { organizationId: ORG, listingId: listed.listingId, date: '2026-04-10', spend: 500 });
    await seedListingAdDay(prisma, { organizationId: ORG, listingId: unmapped.listingId, date: '2026-04-10', spend: 700 });
    await seedListingAdDay(prisma, { organizationId: ORG, listingId: listed.listingId, date: '2026-05-02', spend: 900 });
    await seedListingAdDay(prisma, { organizationId: OTHER_ORGANIZATION_ID, listingId: other.listingId, date: '2026-04-10', spend: 999_999 });
    // A row whose day no succeeded run covers is not measured.
    const { channelAccountId } = await prisma.channelListing.findUniqueOrThrow({ where: { id: listed.listingId }, select: { channelAccountId: true } });
    const failed = await seedAdReportRun(prisma, { organizationId: ORG, channelAccountId, start: '2026-04-11', end: '2026-04-11', status: 'failed' });
    await prisma.channelAdProductDailySnapshot.create({
      data: {
        organizationId: ORG, channelAccountId, operationId: failed.id, date: new Date('2026-04-11T00:00:00Z'),
        campaignId: 'C1', adGroupId: '', vendorItemId: 'VI-UNMEASURED', listingId: listed.listingId,
        impressions: 0, clicks: 0, spend: 4_000, billedSpend: 4_000, orders: 0, units: 0, revenue: 0,
      },
    });

    expect(await read(ORG, ['2026-04'])).toEqual([
      { masterProductId: listed.masterProductId, channelListingId: listed.listingId, channelAccountId, month: '2026-04', allocatedSpend: 500, allocatedBilledSpend: 500, measuredDays: 1 },
    ]);
  });

  it('reads nothing for an organization with no active Coupang account', async () => {
    await prisma.channelAccount.updateMany({ where: { organizationId: ORG }, data: { status: 'inactive' } });
    expect(await read(ORG, ['2026-04'])).toEqual([]);
  });
});
