import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AD_REPORT_KIND } from '@kiditem/shared/advertising-operations';
import { makeTestPrisma, OTHER_ORGANIZATION_ID, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID as ORG } from '../../test-helpers/real-prisma';
import { channelFactTestPorts } from '../../test-helpers/channel-fact-ports';
import { setupChannelListing, setupMaster, setupProductOption } from '../../test-helpers/finance-seeds';
import type { PrismaService } from '../../prisma/prisma.service';
import { ownerTransaction } from '../../prisma/owner-transaction';
import { AdvertisingLedgerReadService } from '../application/service/advertising-ledger-read.service';
import { AdLedgerReadPersistenceAdapter } from '../adapter/out/persistence/ad-ledger-read.persistence.adapter';
import { profitAdCost } from '../domain/ad-spend-rule';

/**
 * 새 광고 원장 리더(KID-372 골격). 잠그는 것: 측정한 날은 활성 쿠팡 계정 모두의 성공한 `advertising.ad_report` 실행 창이 덮은
 * 날뿐이고(KID-45), 측정한 날인데 행이 없으면 0인 날이며, 하루 합은 상품 행 합 + 계정 조정 행이고, 다른 조직 행은 섞이지 않는다.
 */
describe('ad-ledger-facts (PG)', () => {
  let prisma: PrismaClient;
  let service: AdvertisingLedgerReadService;
  const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    service = new AdvertisingLedgerReadService(channelFactTestPorts(prisma as unknown as PrismaService).accounts, new AdLedgerReadPersistenceAdapter());
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function coupangAccount(organizationId: string, externalAccountId: string, status = 'active') {
    return prisma.channelAccount.create({
      data: { organizationId, channel: 'coupang', name: externalAccountId, externalAccountId, isPrimary: false, status },
      select: { id: true },
    });
  }

  async function reportRun(organizationId: string, channelAccountId: string, start: string, end: string, finishedAt: string, status = 'succeeded') {
    return prisma.operation.create({
      data: {
        organizationId,
        kind: AD_REPORT_KIND,
        status,
        token: randomUUID(),
        expiresAt: day(end),
        plan: { channelAccountId, startDate: start, endDate: end },
        windowStart: day(start),
        windowEnd: day(end),
        finishedAt: new Date(finishedAt),
        attempts: 1,
      },
      select: { id: true },
    });
  }

  async function listing(organizationId: string, code: string, channelAccountId: string) {
    const master = await setupMaster(prisma, { organizationId, code, name: `Listing ${code}` });
    const option = await setupProductOption(prisma, { organizationId, masterId: master.id, sku: `${code}-OPT` });
    return setupChannelListing(prisma, {
      organizationId, masterId: master.id, channel: 'coupang', externalId: `EXT-${code}`, optionId: option.id, externalOptionId: `VI-${code}`, channelAccountId,
    });
  }

  function productRow(input: {
    organizationId: string; channelAccountId: string; operationId: string; date: string; listingId?: string | null;
    campaignId?: string; vendorItemId?: string; spend?: number; billedSpend?: number; revenue?: number; clicks?: number; orders?: number;
  }) {
    return {
      organizationId: input.organizationId,
      channelAccountId: input.channelAccountId,
      operationId: input.operationId,
      date: day(input.date),
      campaignId: input.campaignId ?? 'C1',
      adGroupId: '',
      vendorItemId: input.vendorItemId ?? 'VI-1',
      listingId: input.listingId ?? null,
      impressions: 10,
      clicks: input.clicks ?? 1,
      spend: input.spend ?? 0,
      orders: input.orders ?? 0,
      units: input.orders ?? 0,
      revenue: input.revenue ?? 0,
      billedSpend: input.billedSpend ?? input.spend ?? 0,
    };
  }

  it('활성 계정 모두의 성공 실행 창이 덮은 날만 측정한 날이고, 행 없는 측정일은 0, 실패 실행은 아무 날도 덮지 않는다', async () => {
    const a = await coupangAccount(ORG, 'A');
    const b = await coupangAccount(ORG, 'B');
    const runA = await reportRun(ORG, a.id, '2026-09-01', '2026-09-04', '2026-09-05T01:00:00Z');
    await reportRun(ORG, b.id, '2026-09-02', '2026-09-03', '2026-09-05T02:00:00Z');
    await reportRun(ORG, b.id, '2026-09-04', '2026-09-04', '2026-09-05T03:00:00Z', 'failed');
    await prisma.channelAdProductDailySnapshot.createMany({
      data: [
        productRow({ organizationId: ORG, channelAccountId: a.id, operationId: runA.id, date: '2026-09-01', spend: 100 }),
        productRow({ organizationId: ORG, channelAccountId: a.id, operationId: runA.id, date: '2026-09-02', spend: 200, billedSpend: 180 }),
        productRow({ organizationId: ORG, channelAccountId: a.id, operationId: runA.id, date: '2026-09-04', spend: 400 }),
      ],
    });
    const tx = ownerTransaction(prisma);
    const coverage = await service.readAdCoverage(tx, { organizationId: ORG });
    expect(coverage.measuredDates).toEqual(['2026-09-02', '2026-09-03']);
    expect(coverage.latestMeasuredDate).toBe('2026-09-03');
    expect(coverage.observedAt?.toISOString()).toBe('2026-09-05T02:00:00.000Z');
    expect([...coverage.activeAccountIds].sort()).toEqual([a.id, b.id].sort());

    const facts = await service.readAdWindowFacts(tx, { organizationId: ORG });
    expect(facts.days).toEqual([
      expect.objectContaining({ businessDate: '2026-09-02', spend: 200, billedSpend: 180, adjustment: 0 }),
      expect.objectContaining({ businessDate: '2026-09-03', spend: 0, billedSpend: 0, adjustment: 0, clicks: 0 }),
    ]);
    expect(facts.observedAt?.toISOString()).toBe('2026-09-05T02:00:00.000Z');
  });

  it('하루 합은 상품 행 합 + 계정 조정 행(캠페인 키 \'\')이고 이익 광고비는 그 합에 부가세를 얹은 값이며 다른 조직은 섞이지 않는다', async () => {
    const a = await coupangAccount(ORG, 'A');
    const other = await coupangAccount(OTHER_ORGANIZATION_ID, 'X');
    const run = await reportRun(ORG, a.id, '2026-09-10', '2026-09-10', '2026-09-11T01:00:00Z');
    const otherRun = await reportRun(OTHER_ORGANIZATION_ID, other.id, '2026-09-10', '2026-09-10', '2026-09-11T01:00:00Z');
    const l1 = await listing(ORG, 'L1', a.id);
    const l2 = await listing(ORG, 'L2', a.id);
    await prisma.channelAdProductDailySnapshot.createMany({
      data: [
        productRow({ organizationId: ORG, channelAccountId: a.id, operationId: run.id, date: '2026-09-10', listingId: l1.listingId, vendorItemId: 'VI-L1', spend: 300, billedSpend: 250, revenue: 900, orders: 2 }),
        productRow({ organizationId: ORG, channelAccountId: a.id, operationId: run.id, date: '2026-09-10', listingId: l2.listingId, vendorItemId: 'VI-L2', campaignId: 'C2', spend: 100, billedSpend: 100 }),
        productRow({ organizationId: ORG, channelAccountId: a.id, operationId: run.id, date: '2026-09-10', listingId: null, vendorItemId: 'VI-UNMAPPED', campaignId: 'C3', spend: 50, billedSpend: 50 }),
        productRow({ organizationId: OTHER_ORGANIZATION_ID, channelAccountId: other.id, operationId: otherRun.id, date: '2026-09-10', vendorItemId: 'VI-X', spend: 9_999 }),
      ],
    });
    await prisma.channelAdDailyBilling.createMany({
      data: [
        { organizationId: ORG, channelAccountId: a.id, operationId: run.id, date: day('2026-09-10'), settlementDomain: 'SELLER', campaignKey: 'C1', deliveredSpend: 300, billedSpend: 250, promotionAdjustment: -50, billableAdjustment: 0 },
        { organizationId: ORG, channelAccountId: a.id, operationId: run.id, date: day('2026-09-10'), settlementDomain: 'SELLER', campaignKey: '', deliveredSpend: 0, billedSpend: 30, promotionAdjustment: 0, billableAdjustment: 30 },
        { organizationId: ORG, channelAccountId: a.id, operationId: run.id, date: day('2026-09-10'), settlementDomain: 'RETAIL', campaignKey: '', deliveredSpend: 0, billedSpend: -10, promotionAdjustment: -10, billableAdjustment: 0 },
      ],
    });
    const tx = ownerTransaction(prisma);
    const facts = await service.readAdWindowFacts(tx, { organizationId: ORG, from: '2026-09-10', to: '2026-09-11' });
    expect(facts.days).toEqual([
      expect.objectContaining({ businessDate: '2026-09-10', spend: 450, billedSpend: 400, adjustment: 20, revenue: 900, orders: 2 }),
    ]);
    const [today] = facts.days;
    expect(profitAdCost({ billedSpend: today.billedSpend, adjustment: today.adjustment })).toBe(462);

    const listings = await service.readListingAdWindowFacts(tx, { organizationId: ORG, from: '2026-09-10', to: '2026-09-11' });
    expect(listings.map((row) => [row.listingId, row.spend, row.billedSpend, row.days, row.firstDate]).sort()).toEqual([
      [l1.listingId, 300, 250, 1, '2026-09-10'],
      [l2.listingId, 100, 100, 1, '2026-09-10'],
    ].sort());
    expect(listings[0].observedAt?.toISOString()).toBe('2026-09-11T01:00:00.000Z');

    // 창 밖(측정하지 않은 날)은 빈 목록이지 0이 아니다.
    const outside = await service.readAdWindowFacts(tx, { organizationId: ORG, from: '2026-09-11', to: '2026-09-12' });
    expect(outside.days).toEqual([]);
  });

  it('활성 쿠팡 계정이 없으면 광고는 적용되지 않고 측정한 날도 없다', async () => {
    await coupangAccount(ORG, 'paused', 'paused');
    const tx = ownerTransaction(prisma);
    expect(await service.advertisingApplies(tx, ORG)).toBe(false);
    expect(await service.readAdCoverage(tx, { organizationId: ORG })).toEqual({
      measuredDates: [], latestMeasuredDate: null, observedAt: null, activeAccountIds: [],
    });
    expect(await service.readListingAdWindowFacts(tx, { organizationId: ORG })).toEqual([]);
  });
});
