import { profitCatalogTestReaders } from '../../../../../test-helpers/channel-fact-ports';
import { ProductTransactionalReadRepositoryAdapter } from '../../../../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { describe, it, expect, beforeEach } from 'vitest';
import { periodBasisStatus } from '@kiditem/shared/dashboard';
import { SalesAnalysisService } from '../sales-analysis.service';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID, OTHER_ORGANIZATION_ID } from '../../../../../test-helpers/real-prisma';
import {
  setupMaster,
  setupProductOption,
  setupChannelListing,
  seedOrderWithLineItems,
  seedAd,
  seedCompletedAdSweepRun,
  seedCompletedOrderCoverageRun,
} from '../../../../../test-helpers/finance-seeds';

const prisma = makeTestPrisma();
const service = new SalesAnalysisService(prisma as any, new ProductTransactionalReadRepositoryAdapter(), profitCatalogTestReaders(prisma as any as never).accounts, profitCatalogTestReaders(prisma as any as never).listings, profitCatalogTestReaders(prisma as any as never).recipes, profitCatalogTestReaders(prisma as any as never).content);

async function setupChannelFixture(organizationId: string, channel: string, suffix: string) {
  const master = await setupMaster(prisma, { organizationId, code: `M-${suffix}`, name: `Product ${suffix}` });
  const option = await setupProductOption(prisma, { organizationId, masterId: master.id, sku: `SKU-${suffix}` });
  const { listingId, listingOptionId } = await setupChannelListing(prisma, {
    organizationId,
    masterId: master.id,
    channel,
    externalId: `EXT-${suffix}`,
    optionId: option.id,
    externalOptionId: `VI-${suffix}`,
  });
  return { masterId: master.id, optionId: option.id, listingId, listingOptionId };
}

/** The Orders collection declares it collected these KST dates. */
const coverOrders = (
  organizationId = TEST_ORGANIZATION_ID,
  startDate = '2026-04-01',
  endDate = '2026-04-30',
) => seedCompletedOrderCoverageRun(prisma, { organizationId, startDate, endDate });

describe('SalesAnalysisService.getAnalysis (PG integration)', () => {
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('groups orders by channel and derives the channel type', async () => {
    const coup = await setupChannelFixture(TEST_ORGANIZATION_ID, 'naver', 'GROUP-NAVER');
    const wing = await setupChannelFixture(TEST_ORGANIZATION_ID, 'wing', 'GROUP-WING');
    const other = await setupChannelFixture(TEST_ORGANIZATION_ID, 'unknown-ch', 'GROUP-OTHER');
    for (const [index, fixture] of [coup, wing, other].entries()) {
      await seedOrderWithLineItems(prisma, {
        orderChannel: 'rocket',
        organizationId: TEST_ORGANIZATION_ID, externalOrderId: `GROUP-${index}`, orderedAt: '2026-04-10T00:00:00Z',
        lineItems: [{ quantity: 1, totalPrice: 10000 - index, optionId: fixture.optionId, listingOptionId: fixture.listingOptionId }],
      });
    }
    await coverOrders();

    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04', AFTER_MONTHS);

    expect(result.channels.map((c) => [c.channel, c.channelType])).toEqual([
      ['naver', 'marketplace'],
      ['wing', 'direct'],
      ['unknown-ch', 'other'],
    ]);
  });

  it('IDOR double-blind — TEST + OTHER organizations returns each own data', async () => {
    const tcoup = await setupChannelFixture(TEST_ORGANIZATION_ID, 'coupang', 'IDOR-T-COUP');
    const ocoup = await setupChannelFixture(OTHER_ORGANIZATION_ID, 'coupang', 'IDOR-O-COUP');
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'IDOR-T1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: tcoup.optionId, listingOptionId: tcoup.listingOptionId }],
    });
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: OTHER_ORGANIZATION_ID, externalOrderId: 'IDOR-O1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 20000, optionId: ocoup.optionId, listingOptionId: ocoup.listingOptionId }],
    });
    await coverOrders(TEST_ORGANIZATION_ID);
    await coverOrders(OTHER_ORGANIZATION_ID);

    const t = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04', AFTER_MONTHS);
    const o = await service.getAnalysis(OTHER_ORGANIZATION_ID, '2026-04', AFTER_MONTHS);
    expect(t.totals.totalRevenue).toBe(10000);
    expect(o.totals.totalRevenue).toBe(20000);
  });

  /**
   * Returns have no owner publication: nothing collects them and no coverage
   * declares a window of them observed. A fully collected order month still
   * publishes no return count, return rate or orphan return count (ADR-0006,
   * ADR-0009).
   */
  it('publishes no return count, return rate or orphan return count for a fully collected order month', async () => {
    const coup = await setupChannelFixture(TEST_ORGANIZATION_ID, 'coupang', 'RETURNS');
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'RETURNS-1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    await coverOrders();

    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04', AFTER_MONTHS);

    expect(periodBasisStatus(result.basis.revenue)).toBe('complete');
    expect(result.totals.totalRevenue).toBe(10000);
    expect(result.channels).toHaveLength(1);
    expect(result.channels[0]).toMatchObject({
      channel: 'coupang',
      totalOrders: 1,
      returnCount: null,
      returnRate: null,
    });
    expect(result.totals.orphanReturnCount).toBeNull();
  });

  it('SalesAnalysisDataSchema.parse succeeds on response', async () => {
    const coup = await setupChannelFixture(TEST_ORGANIZATION_ID, 'coupang', 'VALIDATE');
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'VAL-1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    await coverOrders();
    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04', AFTER_MONTHS);
    const { SalesAnalysisDataSchema } = await import('@kiditem/shared/finance');
    expect(() => SalesAnalysisDataSchema.parse(JSON.parse(JSON.stringify(result)))).not.toThrow();
  });

  it('KST boundary — 2026-04-30T14:59:59.999Z IN April, 15:00:00Z IN May', async () => {
    const coup = await setupChannelFixture(TEST_ORGANIZATION_ID, 'coupang', 'KST');
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'APR-LAST', orderedAt: '2026-04-30T14:59:59.999Z',
      lineItems: [{ quantity: 1, totalPrice: 7777, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'MAY-FIRST', orderedAt: '2026-04-30T15:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 8888, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    await coverOrders(TEST_ORGANIZATION_ID, '2026-04-01', '2026-05-31');
    const april = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04', AFTER_MONTHS);
    const may = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-05', AFTER_MONTHS);
    expect(april.totals.totalRevenue).toBe(7777);
    expect(may.totals.totalRevenue).toBe(8888);
  });

  it('perf baseline — 1000 orders + lineItems across 2 channels < 2s', async () => {
    const coup = await setupChannelFixture(TEST_ORGANIZATION_ID, 'coupang', 'PERF-C');
    const naver = await setupChannelFixture(TEST_ORGANIZATION_ID, 'naver', 'PERF-N');
    const [coupListing, naverListing] = await Promise.all([
      prisma.channelListing.findUniqueOrThrow({
        where: { id: coup.listingId },
        select: { channelAccountId: true },
      }),
      prisma.channelListing.findUniqueOrThrow({
        where: { id: naver.listingId },
        select: { channelAccountId: true },
      }),
    ]);
    const orderData = Array.from({ length: 1000 }, (_, i) => {
      const channelAccountId = i % 10 < 7
        ? coupListing.channelAccountId
        : naverListing.channelAccountId;
      return {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId,
        externalOrderId: `PERF-${i}`,
        orderedAt: new Date(`2026-04-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`),
        status: 'accepted',
        totalPrice: 10000,
        shippingPrice: 3000,
      };
    });
    await prisma.order.createMany({ data: orderData });
    const orders = await prisma.order.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID, externalOrderId: { startsWith: 'PERF-' } },
      select: { id: true, externalOrderId: true },
    });
    const lineItemData = orders.flatMap((o) => {
      const idx = parseInt(o.externalOrderId.split('-')[1], 10);
      const target = idx % 10 < 7 ? coup : naver;
      return [{
        orderId: o.id,
        organizationId: TEST_ORGANIZATION_ID,
        quantity: 1,
        totalPrice: 10000,
        listingOptionId: target.listingOptionId,
      }];
    });
    await prisma.orderLineItem.createMany({ data: lineItemData });
    await coverOrders();

    const start = Date.now();
    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04', AFTER_MONTHS);
    const latencyMs = Date.now() - start;
    expect(result.totals.totalOrders).toBe(1000);
    expect(result.channels).toHaveLength(2);
    expect(latencyMs).toBeLessThan(2000);
    console.log(`[perf] sales-analysis 1000 orders × 2 channels → ${latencyMs}ms`);
  });

  it('empty-channel ad — spend on channel with 0 orders is dropped', async () => {
    const coup = await setupChannelFixture(TEST_ORGANIZATION_ID, 'coupang', 'EMPTY-C');
    const naver = await setupChannelFixture(TEST_ORGANIZATION_ID, 'naver', 'EMPTY-N');
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'EMPTY-1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: naver.listingId, date: '2026-04-15', spend: 500 });
    await coverOrders();
    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04', AFTER_MONTHS);
    expect(result.channels).toHaveLength(1);
    expect(result.channels[0].channel).toBe('coupang');
  });

  /** KID-85 acceptance — unmeasured advertising is never added to a channel profit as zero. */
  it('publishes no Coupang channel profit while its advertising sweep has not measured the month, and keeps the channels it cannot cover', async () => {
    const coup = await setupChannelFixture(TEST_ORGANIZATION_ID, 'coupang', 'ADS-UNMEASURED-C');
    const naver = await setupChannelFixture(TEST_ORGANIZATION_ID, 'naver', 'ADS-UNMEASURED-N');
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'ADS-UNMEASURED-1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'ADS-UNMEASURED-2', orderedAt: '2026-04-11T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 8000, optionId: naver.optionId, listingOptionId: naver.listingOptionId }],
    });
    await coverOrders();

    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04', AFTER_MONTHS);

    expect(result.channels.find((c) => c.channel === 'coupang')).toMatchObject({
      totalCost: null,
      totalProfit: null,
      profitRate: null,
    });
    // KID-85 follow-up P3-5: the target-day ledger only sweeps Coupang accounts,
    // so advertising is Not applied to Naver: cost = purchase 5000 + order
    // shipping 3000 (a Rocket order carries no commission), with no ad cost to
    // wait for.
    expect(result.channels.find((c) => c.channel === 'naver')).toMatchObject({
      totalCost: 8000,
      totalProfit: 0,
      profitRate: 0,
    });
    expect(result.channels.map((c) => c.totalRevenue)).toEqual([10000, 8000]);
    expect(result.totals).toMatchObject({
      totalRevenue: 18000,
      totalOrders: 2,
      totalCost: null,
      totalProfit: null,
      profitRate: null,
    });
    expect(periodBasisStatus(result.basis.revenue)).toBe('complete');
    expect(periodBasisStatus(result.basis.adCost)).toBe('empty');
  });

  it('subtracts each channel its measured ad spend once the sweep covers the month', async () => {
    const coup = await setupChannelFixture(TEST_ORGANIZATION_ID, 'coupang', 'ADS-MEASURED-C');
    const naver = await setupChannelFixture(TEST_ORGANIZATION_ID, 'naver', 'ADS-MEASURED-N');
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'ADS-MEASURED-1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'ADS-MEASURED-2', orderedAt: '2026-04-11T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 8000, optionId: naver.optionId, listingOptionId: naver.listingOptionId }],
    });
    const runId = await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      generation: 1,
      window: { startDate: '2026-04-01', endDate: '2026-04-30' },
    });
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID, listingId: coup.listingId, date: '2026-04-15', spend: 2000, runId,
    });
    await coverOrders();

    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04', AFTER_MONTHS);

    // cost = purchase 5000 + order shipping 3000 + ad spend; a Rocket order
    // carries no commission.
    expect(result.channels.find((c) => c.channel === 'coupang')).toMatchObject({
      totalCost: 10000, totalProfit: 0, profitRate: 0,
    });
    expect(result.channels.find((c) => c.channel === 'naver')).toMatchObject({
      totalCost: 8000, totalProfit: 0, profitRate: 0,
    });
    expect(result.totals).toMatchObject({
      totalRevenue: 18000, totalCost: 18000, totalProfit: 0, profitRate: 0,
    });
    for (const basis of [result.basis.revenue, result.basis.adCost, result.basis.profit]) {
      expect(periodBasisStatus(basis)).toBe('complete');
    }
  });

  it('publishes no ratio over a zero denominator', async () => {
    const naver = await setupChannelFixture(TEST_ORGANIZATION_ID, 'naver', 'ZERO-REVENUE');
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'ZERO-REVENUE-1', orderedAt: '2026-04-10T00:00:00Z',
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: 0, optionId: naver.optionId, listingOptionId: naver.listingOptionId }],
    });
    await coverOrders();

    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04', AFTER_MONTHS);

    expect(result.channels[0]).toMatchObject({
      totalRevenue: 0,
      totalCost: 5000,
      totalProfit: -5000,
      profitRate: null,
      avgOrderValue: 0,
      // Returns have no source, so a rate over the channel's one order is not 0.
      returnCount: null,
      returnRate: null,
    });
    expect(result.totals).toMatchObject({ totalRevenue: 0, totalProfit: -5000, profitRate: null });
  });

  it('a month the Orders collection covered only in part publishes no window totals', async () => {
    const naver = await setupChannelFixture(TEST_ORGANIZATION_ID, 'naver', 'PARTIAL');
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'PARTIAL-1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: naver.optionId, listingOptionId: naver.listingOptionId }],
    });
    await coverOrders(TEST_ORGANIZATION_ID, '2026-04-01', '2026-04-15');

    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04', AFTER_MONTHS);

    expect(result.channels[0].totalRevenue).toBe(10000);
    expect(result.totals).toMatchObject({
      totalRevenue: null, totalOrders: null, totalCost: null, totalProfit: null, profitRate: null,
    });
    expect(result.basis.revenue.includedDates).toHaveLength(15);
    expect(periodBasisStatus(result.basis.revenue)).toBe('partial');
  });

  /** A moment after every month these cases read has closed in KST. */
  const AFTER_MONTHS = new Date('2026-07-01T00:00:00.000Z');
  /** 12:00 KST on 15 April: 1–14 April are closed. */
  const MID_APRIL = new Date('2026-04-15T03:00:00.000Z');

  it('defaults to the month containing today and evaluates it over its closed days', async () => {
    const naver = await setupChannelFixture(TEST_ORGANIZATION_ID, 'naver', 'MID-MONTH');
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'MID-MONTH-CLOSED', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: naver.optionId, listingOptionId: naver.listingOptionId }],
    });
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'MID-MONTH-TODAY', orderedAt: '2026-04-15T01:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 8000, optionId: naver.optionId, listingOptionId: naver.listingOptionId }],
    });
    await coverOrders(TEST_ORGANIZATION_ID, '2026-04-01', '2026-04-15');

    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, undefined, MID_APRIL);

    expect(result.period).toBe('2026-04');
    expect(result.channels).toEqual([
      expect.objectContaining({ channel: 'naver', totalOrders: 1, totalRevenue: 10000 }),
    ]);
    expect(result.totals).toMatchObject({ totalRevenue: 10000, totalOrders: 1 });
    expect(result.basis.requestedWindow).toEqual({ from: '2026-04-01', to: '2026-04-30' });
    expect(result.basis.revenue).toMatchObject({ from: '2026-04-01', to: '2026-04-14', targetDays: 14 });
    expect(periodBasisStatus(result.basis.revenue)).toBe('complete');
  });

  /** Policies the retired mock spec asserted: per-channel versus global order counts, and the shipping split. */
  it('counts an order spanning two channels in each channel but once in the totals, splitting its shipping by line revenue', async () => {
    const naver = await setupChannelFixture(TEST_ORGANIZATION_ID, 'naver', 'SPLIT-NAVER');
    const wing = await setupChannelFixture(TEST_ORGANIZATION_ID, 'wing', 'SPLIT-WING');
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'SPLIT-BOTH', orderedAt: '2026-04-10T00:00:00Z',
      shippingPrice: 3000,
      lineItems: [
        { quantity: 1, totalPrice: 6000, optionId: naver.optionId, listingOptionId: naver.listingOptionId },
        { quantity: 1, totalPrice: 4000, optionId: wing.optionId, listingOptionId: wing.listingOptionId },
      ],
    });
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'SPLIT-NAVER-ONLY', orderedAt: '2026-04-11T00:00:00Z',
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: 2000, optionId: naver.optionId, listingOptionId: naver.listingOptionId }],
    });
    await coverOrders();

    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04', AFTER_MONTHS);

    // cost = purchase 5000 per unit + the line's share of its order's 3000
    // shipping: 6000/10000 → 1800 to naver, 4000/10000 → 1200 to wing.
    expect(result.channels).toEqual([
      expect.objectContaining({
        channel: 'naver', totalOrders: 2, totalRevenue: 8000, totalCost: 11800, totalProfit: -3800, avgOrderValue: 4000,
      }),
      expect.objectContaining({
        channel: 'wing', totalOrders: 1, totalRevenue: 4000, totalCost: 6200, totalProfit: -2200, avgOrderValue: 4000,
      }),
    ]);
    expect(result.totals).toMatchObject({
      totalRevenue: 12000, totalOrders: 2, totalCost: 18000, totalProfit: -6000,
    });
  });

  /**
   * KID-85 follow-up P3-4 — line costs stay exact and each aggregate rounds its
   * own sum; a line's shipping share is rounded once, so a channel can carry a
   * won less of an order's shipping than the window total does.
   */
  it("rounds each line's shipping share once, and the totals carry the order's whole shipping", async () => {
    const naver = await setupChannelFixture(TEST_ORGANIZATION_ID, 'naver', 'ROUNDING');
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'ROUNDING-1', orderedAt: '2026-04-10T00:00:00Z',
      orderChannel: 'rocket',
      shippingPrice: 1000,
      lineItems: [1, 2, 3].map(() => ({
        quantity: 1, totalPrice: 1000, optionId: naver.optionId, listingOptionId: naver.listingOptionId,
      })),
    });
    await coverOrders();

    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04', AFTER_MONTHS);

    // Three equal lines each take Math.round(1000 / 3) = 333 of the order's
    // shipping: the channel sums 999 beside 15000 purchase cost, while the
    // window total carries the order's whole 1000.
    expect(result.channels[0]).toMatchObject({ totalRevenue: 3000, totalCost: 15999, totalProfit: -12999 });
    expect(result.totals).toMatchObject({ totalCost: 16000, totalProfit: -13000 });
  });

  /**
   * Advertising's own rule decides applicability, and measured spend is never
   * dropped: a channel whose sold lines sit on an inactive Coupang account
   * still carries the spend its active account's unsold listings published.
   */
  it('does not report a zero ad cost for a channel key that has measured spend', async () => {
    const activeUnsold = await setupChannelFixture(TEST_ORGANIZATION_ID, 'coupang', 'ACTIVE-UNSOLD');
    const inactive = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Inactive Coupang account',
        externalAccountId: 'inactive-coupang',
        status: 'inactive',
        isPrimary: false,
      },
      select: { id: true },
    });
    const master = await setupMaster(prisma, { organizationId: TEST_ORGANIZATION_ID, code: 'M-INACTIVE-SOLD', name: 'Inactive sold' });
    const option = await setupProductOption(prisma, { organizationId: TEST_ORGANIZATION_ID, masterId: master.id, sku: 'SKU-INACTIVE-SOLD' });
    const sold = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId: master.id,
      channel: 'coupang',
      channelAccountId: inactive.id,
      externalId: 'EXT-INACTIVE-SOLD',
      optionId: option.id,
      externalOptionId: 'VI-INACTIVE-SOLD',
    });
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'INACTIVE-SOLD-1', orderedAt: '2026-04-10T00:00:00Z',
      shippingPrice: 0,
      orderChannel: 'rocket',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: option.id, listingOptionId: sold.listingOptionId }],
    });
    const runId = await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      generation: 1,
      window: { startDate: '2026-04-01', endDate: '2026-04-30' },
    });
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID, listingId: activeUnsold.listingId, date: '2026-04-15', spend: 2000, runId,
    });
    await coverOrders();

    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04', AFTER_MONTHS);

    // Rocket order: purchase 5000, no commission or other cost, no shipping,
    // plus the 2000 the coupang channel's active listing spent.
    expect(result.channels).toEqual([
      expect.objectContaining({ channel: 'coupang', totalRevenue: 10000, totalCost: 7000, totalProfit: 3000 }),
    ]);
  });
});
