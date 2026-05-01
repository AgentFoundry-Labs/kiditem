import { describe, it, expect, beforeEach } from 'vitest';
import { SalesAnalysisService } from '../sales-analysis.service';
import { makeTestPrisma, resetDb, seedBaseFixture, TEST_ORGANIZATION_ID, OTHER_ORGANIZATION_ID } from '../../../test-helpers/real-prisma';
import {
  setupMaster,
  setupProductOption,
  setupChannelListing,
  seedOrderWithLineItems,
  seedReturn,
  seedAd,
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

describe('SalesAnalysisService.getAnalysis (PG integration)', () => {
  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('groups orders by channel (coupang + naver)', async () => {
    const coup = await setupChannelFixture(TEST_ORGANIZATION_ID, 'coupang', 'GROUP-COUP');
    const naver = await setupChannelFixture(TEST_ORGANIZATION_ID, 'naver', 'GROUP-NAVER');
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'GROUP-1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'GROUP-2', orderedAt: '2026-04-15T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 8000, optionId: naver.optionId, listingOptionId: naver.listingOptionId }],
    });
    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04');
    expect(result.channels).toHaveLength(2);
    expect(result.channels.map((c) => c.channel).sort()).toEqual(['coupang', 'naver']);
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
    const t = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04');
    const o = await service.getAnalysis(OTHER_ORGANIZATION_ID, '2026-04');
    expect(t.totals.totalRevenue).toBe(10000);
    expect(o.totals.totalRevenue).toBe(20000);
  });

  it('ADR-0017 returnRate — past-period order excluded from current returnRate', async () => {
    const coup = await setupChannelFixture(TEST_ORGANIZATION_ID, 'coupang', 'ADR-0017');
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
    await seedReturn(prisma, {
      organizationId: TEST_ORGANIZATION_ID, orderId: aprOrderId, requestedAt: '2026-04-25T00:00:00Z',
      lineItems: [{ orderLineItemId: aprLineItem!.id }],
    });

    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04');
    const c = result.channels.find((x) => x.channel === 'coupang')!;
    expect(c.totalOrders).toBe(1);          // only April order counted in denominator
    expect(c.returnCount).toBe(1);          // only April order's return counted in numerator
    expect(c.returnRate).toBeCloseTo(1, 6); // 1 / 1 = 1.0 ≤ 1
  });

  it('orphanReturnCount — orderId NULL returns go to totals.orphanReturnCount', async () => {
    const coup = await setupChannelFixture(TEST_ORGANIZATION_ID, 'coupang', 'ORPHAN');
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'ORPHAN-1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    await seedReturn(prisma, { organizationId: TEST_ORGANIZATION_ID, orderId: null, requestedAt: '2026-04-15T00:00:00Z' });

    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04');
    expect(result.channels[0].returnCount).toBe(0);
    expect(result.totals.orphanReturnCount).toBe(1);
  });

  it('SalesAnalysisDataSchema.parse succeeds on response', async () => {
    const coup = await setupChannelFixture(TEST_ORGANIZATION_ID, 'coupang', 'VALIDATE');
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'VAL-1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04');
    const { SalesAnalysisDataSchema } = await import('@kiditem/shared/finance');
    expect(() => SalesAnalysisDataSchema.parse(result)).not.toThrow();
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
    const april = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04');
    const may = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-05');
    expect(april.totals.totalRevenue).toBe(7777);
    expect(may.totals.totalRevenue).toBe(8888);
  });

  it('perf baseline — 1000 orders + lineItems across 2 channels < 2s', async () => {
    const coup = await setupChannelFixture(TEST_ORGANIZATION_ID, 'coupang', 'PERF-C');
    const naver = await setupChannelFixture(TEST_ORGANIZATION_ID, 'naver', 'PERF-N');
    const orderData = Array.from({ length: 1000 }, (_, i) => ({
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: `PERF-${i}`,
      platform: 'coupang',
      orderedAt: new Date(`2026-04-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`),
      status: 'accepted',
      totalPrice: 10000,
      shippingPrice: 3000,
    }));
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
        optionId: target.optionId,
        listingOptionId: target.listingOptionId,
      }];
    });
    await prisma.orderLineItem.createMany({ data: lineItemData });

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
    // coupang has orders; naver only has ad spend (no orders)
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'EMPTY-1', orderedAt: '2026-04-10T00:00:00Z',
      lineItems: [{ quantity: 1, totalPrice: 10000, optionId: coup.optionId, listingOptionId: coup.listingOptionId }],
    });
    await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: naver.listingId, date: '2026-04-15', spend: 500 });
    const result = await service.getAnalysis(TEST_ORGANIZATION_ID, '2026-04');
    expect(result.channels).toHaveLength(1);
    expect(result.channels[0].channel).toBe('coupang');
  });
});
