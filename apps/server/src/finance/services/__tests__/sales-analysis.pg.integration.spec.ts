import { describe, it, expect, beforeEach } from 'vitest';
import { periodBasisStatus } from '@kiditem/shared/dashboard';
import { SalesAnalysisService } from '../sales-analysis.service';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID, OTHER_ORGANIZATION_ID } from '../../../test-helpers/real-prisma';
import {
  setupMaster,
  setupProductOption,
  setupChannelListing,
  seedOrderWithLineItems,
  seedReturn,
  seedAd,
  seedCompletedAdSweepRun,
  seedCompletedOrderCoverageRun,
} from '../../../test-helpers/finance-seeds';

const prisma = makeTestPrisma();
const service = new SalesAnalysisService(prisma as any);

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
        organizationId: TEST_ORGANIZATION_ID, externalOrderId: `GROUP-${index}`, orderedAt: '2026-04-10T00:00:00Z',
        lineItems: [{ quantity: 1, totalPrice: 10000 - index, optionId: fixture.optionId, listingOptionId: fixture.listingOptionId }],
      });
    }
    await coverOrders();

    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04');

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
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'IDOR-T1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: tcoup.optionId, listingOptionId: tcoup.listingOptionId }],
    });
    await seedOrderWithLineItems(prisma, {
      organizationId: OTHER_ORGANIZATION_ID, externalOrderId: 'IDOR-O1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 20000, optionId: ocoup.optionId, listingOptionId: ocoup.listingOptionId }],
    });
    await coverOrders(TEST_ORGANIZATION_ID);
    await coverOrders(OTHER_ORGANIZATION_ID);

    const t = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04');
    const o = await service.getAnalysis(OTHER_ORGANIZATION_ID, '2026-04');
    expect(t.totals.totalRevenue).toBe(10000);
    expect(o.totals.totalRevenue).toBe(20000);
  });

  it('returnRate counts distinct returned orders of the period only', async () => {
    const coup = await setupChannelFixture(TEST_ORGANIZATION_ID, 'coupang', 'return-rate');
    const marchOrderId = await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'MAR-1', orderedAt: '2026-03-15T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 5000, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    const aprOrderId = await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'APR-1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    const marchLineItem = await prisma.orderLineItem.findFirst({
      where: { orderId: marchOrderId }, select: { id: true },
    });
    const aprLineItem = await prisma.orderLineItem.findFirst({
      where: { orderId: aprOrderId }, select: { id: true },
    });
    await seedReturn(prisma, {
      organizationId: TEST_ORGANIZATION_ID, orderId: marchOrderId, requestedAt: '2026-04-07T00:00:00Z',
      lineItems: [{ orderLineItemId: marchLineItem!.id }],
    });
    // Two returned lines of one order are one returned order, not two.
    await seedReturn(prisma, {
      organizationId: TEST_ORGANIZATION_ID, orderId: aprOrderId, requestedAt: '2026-04-25T00:00:00Z',
      lineItems: [{ orderLineItemId: aprLineItem!.id }, { orderLineItemId: aprLineItem!.id }],
    });
    await coverOrders(TEST_ORGANIZATION_ID, '2026-03-01', '2026-04-30');

    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04');
    const c = result.channels.find((x) => x.channel === 'coupang')!;
    expect(c.totalOrders).toBe(1);
    expect(c.returnCount).toBe(1);
    expect(c.returnRate).toBeCloseTo(1, 6);
  });

  it('orphanReturnCount — orderId NULL returns go to totals.orphanReturnCount', async () => {
    const coup = await setupChannelFixture(TEST_ORGANIZATION_ID, 'coupang', 'ORPHAN');
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'ORPHAN-1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    await seedReturn(prisma, { organizationId: TEST_ORGANIZATION_ID, orderId: null, requestedAt: '2026-04-15T00:00:00Z' });
    await coverOrders();

    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04');
    expect(result.channels[0].returnCount).toBe(0);
    expect(result.channels[0].returnRate).toBe(0);
    expect(result.totals.orphanReturnCount).toBe(1);
  });

  it('SalesAnalysisDataSchema.parse succeeds on response', async () => {
    const coup = await setupChannelFixture(TEST_ORGANIZATION_ID, 'coupang', 'VALIDATE');
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'VAL-1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    await coverOrders();
    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04');
    const { SalesAnalysisDataSchema } = await import('@kiditem/shared/finance');
    expect(() => SalesAnalysisDataSchema.parse(JSON.parse(JSON.stringify(result)))).not.toThrow();
  });

  it('KST boundary — 2026-04-30T14:59:59.999Z IN April, 15:00:00Z IN May', async () => {
    const coup = await setupChannelFixture(TEST_ORGANIZATION_ID, 'coupang', 'KST');
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'APR-LAST', orderedAt: '2026-04-30T14:59:59.999Z',
      lineItems: [{ quantity: 1, totalPrice: 7777, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'MAY-FIRST', orderedAt: '2026-04-30T15:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 8888, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    await coverOrders(TEST_ORGANIZATION_ID, '2026-04-01', '2026-05-31');
    const april = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04');
    const may = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-05');
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
    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04');
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
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'EMPTY-1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: naver.listingId, date: '2026-04-15', spend: 500 });
    await coverOrders();
    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04');
    expect(result.channels).toHaveLength(1);
    expect(result.channels[0].channel).toBe('coupang');
  });

  /** KID-85 acceptance — unmeasured advertising is never added to a channel profit as zero. */
  it('publishes no channel profit while the advertising sweep has not measured the month', async () => {
    const coup = await setupChannelFixture(TEST_ORGANIZATION_ID, 'coupang', 'ADS-UNMEASURED-C');
    const naver = await setupChannelFixture(TEST_ORGANIZATION_ID, 'naver', 'ADS-UNMEASURED-N');
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'ADS-UNMEASURED-1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'ADS-UNMEASURED-2', orderedAt: '2026-04-11T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 8000, optionId: naver.optionId, listingOptionId: naver.listingOptionId }],
    });
    await coverOrders();

    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04');

    for (const channel of result.channels) {
      expect(channel, channel.channel).toMatchObject({
        totalCost: null,
        totalProfit: null,
        profitRate: null,
      });
    }
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
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'ADS-MEASURED-1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    await seedOrderWithLineItems(prisma, {
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

    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04');

    // cost = purchase 5000 + commission 10% + order shipping 3000 + ad spend.
    expect(result.channels.find((c) => c.channel === 'coupang')).toMatchObject({
      totalCost: 11000, totalProfit: -1000, profitRate: -10,
    });
    expect(result.channels.find((c) => c.channel === 'naver')).toMatchObject({
      totalCost: 8800, totalProfit: -800, profitRate: -10,
    });
    expect(result.totals).toMatchObject({
      totalRevenue: 18000, totalCost: 19800, totalProfit: -1800, profitRate: -10,
    });
    for (const basis of [result.basis.revenue, result.basis.adCost, result.basis.profit]) {
      expect(periodBasisStatus(basis)).toBe('complete');
    }
  });

  it('publishes no ratio over a zero denominator', async () => {
    const naver = await setupChannelFixture(TEST_ORGANIZATION_ID, 'naver', 'ZERO-REVENUE');
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'ZERO-REVENUE-1', orderedAt: '2026-04-10T00:00:00Z',
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: 0, optionId: naver.optionId, listingOptionId: naver.listingOptionId }],
    });
    await coverOrders();

    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04');

    expect(result.channels[0]).toMatchObject({
      totalRevenue: 0,
      totalCost: 5000,
      totalProfit: -5000,
      profitRate: null,
      avgOrderValue: 0,
      returnRate: 0,
    });
    expect(result.totals).toMatchObject({ totalRevenue: 0, totalProfit: -5000, profitRate: null });
  });

  it('a month the Orders collection covered only in part publishes no window totals', async () => {
    const naver = await setupChannelFixture(TEST_ORGANIZATION_ID, 'naver', 'PARTIAL');
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'PARTIAL-1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: naver.optionId, listingOptionId: naver.listingOptionId }],
    });
    await coverOrders(TEST_ORGANIZATION_ID, '2026-04-01', '2026-04-15');

    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04');

    expect(result.channels[0].totalRevenue).toBe(10000);
    expect(result.totals).toMatchObject({
      totalRevenue: null, totalOrders: null, totalCost: null, totalProfit: null, profitRate: null,
    });
    expect(result.basis.revenue.includedDates).toHaveLength(15);
    expect(periodBasisStatus(result.basis.revenue)).toBe('partial');
  });
});
