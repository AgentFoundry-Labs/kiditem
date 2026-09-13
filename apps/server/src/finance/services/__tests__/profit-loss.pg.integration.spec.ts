import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { ProfitLossResponseSchema } from '@kiditem/shared/finance';
import { periodBasisStatus } from '@kiditem/shared/dashboard';
import { ProfitLossService } from '../profit-loss.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  seedAd,
  seedCompletedAdSweepRun,
  seedCompletedOrderCoverageRun,
} from '../../../test-helpers/finance-seeds';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
} from '../../../test-helpers/real-prisma';

/**
 * ProfitLossService PG integration (live aggregation over the canonical
 * Orders, Inventory, Advertising and Products readers).
 *
 * The wire carries the month's rows, the month's totals and the basis those
 * totals rest on. A value whose inputs were not all measured is `null`.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal master + listing + option + listingOption stack for a organization. */
async function setupListing(
  prisma: PrismaClient,
  organizationId: string,
  suffix: string,
) {
  const master = await prisma.masterProduct.create({
    data: {
      organizationId,
      code: `M-${suffix}`,
      name: `Master ${suffix}`,
      category: '유아용품',
      abcGrade: 'A',
    },
  });
  const inventorySku = await prisma.sellpiaInventorySku.create({
    data: {
      organizationId,
      code: `SP-${suffix}`,
      name: `Sellpia ${suffix}`,
      purchasePrice: 1000,
      currentStock: 100,
    },
  });
  const option = inventorySku;
  const channelAccount = await prisma.channelAccount.upsert({
    where: {
      organizationId_channel_externalAccountId: {
        organizationId,
        channel: 'coupang',
        externalAccountId: 'profit-loss-test',
      },
    },
    create: {
      organizationId,
      channel: 'coupang',
      name: 'Profit loss test account',
      externalAccountId: 'profit-loss-test',
      isPrimary: true,
    },
    update: {},
  });
  const listing = await prisma.channelListing.create({
    data: {
      organizationId,
      channelAccountId: channelAccount.id,
      masterProductId: master.id,
      externalId: `EXT-${suffix}`,
      channelName: `Listing ${suffix}`,
      displayName: `Master ${suffix}`,
      category: '유아용품',
    },
  });
  const listingOption = await prisma.channelListingOption.create({
    data: {
      organizationId,
      listingId: listing.id,
      externalOptionId: `VI-${suffix}`,
      itemName: `OPT-${suffix}`,
      sellerSku: `SKU-${suffix}`,
      costPriceOverride: 1000,
      commissionRate: 0.1,
      otherCost: 50,
    },
  });
  await prisma.channelListingOptionInventoryComponent.create({
    data: {
      organizationId,
      channelListingOptionId: listingOption.id,
      sellpiaInventorySkuId: inventorySku.id,
      quantity: 1,
    },
  });
  return { master, listing, option, listingOption };
}

/** Create an order with one or more line items. Each lineItem uses the given listingOption. */
async function createOrder(
  prisma: PrismaClient,
  organizationId: string,
  opts: {
    orderedAt: Date;
    shippingPrice?: number;
    status?: string;
    lineItems: Array<{ listingOptionId: string; optionId: string; totalPrice: number; quantity?: number }>;
    externalOrderId?: string;
  },
) {
  const listingOption = await prisma.channelListingOption.findFirstOrThrow({
    where: {
      id: opts.lineItems[0]?.listingOptionId,
      organizationId,
    },
    select: { listing: { select: { channelAccountId: true } } },
  });
  const order = await prisma.order.create({
    data: {
      organizationId,
      channelAccountId: listingOption.listing.channelAccountId,
      externalOrderId: opts.externalOrderId ?? `ORD-${Date.now()}-${Math.random()}`,
      orderedAt: opts.orderedAt,
      status: opts.status ?? 'paid',
      shippingPrice: opts.shippingPrice ?? 0,
      totalPrice: opts.lineItems.reduce((s, li) => s + li.totalPrice, 0),
    },
  });
  let lineItemIdx = 0;
  for (const li of opts.lineItems) {
    await prisma.orderLineItem.create({
      data: {
        organizationId,
        orderId: order.id,
        listingOptionId: li.listingOptionId,
        quantity: li.quantity ?? 1,
        unitPrice: li.totalPrice,
        totalPrice: li.totalPrice,
        externalLineId: `LI-${order.id}-${lineItemIdx++}`,
      },
    });
  }
  return order;
}

/**
 * Bulk-seed N orders × M lineItems for latency baseline.
 * Uses createMany for fast insert.
 */
async function seedBulkOrders(
  prisma: PrismaClient,
  opts: {
    organizationId: string;
    listingOptionId: string;
    optionId: string;
    orderCount: number;
    lineItemsPerOrder: number;
    year: number;
    month: number;
  },
) {
  const { organizationId, listingOptionId, orderCount, lineItemsPerOrder, year, month } = opts;
  const listingOption = await prisma.channelListingOption.findFirstOrThrow({
    where: { id: listingOptionId, organizationId },
    select: { listing: { select: { channelAccountId: true } } },
  });

  const orderRows: Array<{
    organizationId: string;
    channelAccountId: string;
    externalOrderId: string;
    orderedAt: Date;
    status: string;
    shippingPrice: number;
    totalPrice: number;
  }> = [];

  const day = 15;
  const orderedAt = new Date(Date.UTC(year, month - 1, day, 0, 0, 0)); // UTC → KST 09:00, safe in middle of month

  for (let i = 0; i < orderCount; i++) {
    orderRows.push({
      organizationId,
      channelAccountId: listingOption.listing.channelAccountId,
      externalOrderId: `BULK-${i}-${Date.now()}-${Math.random()}`,
      orderedAt,
      status: 'paid',
      shippingPrice: 0,
      totalPrice: lineItemsPerOrder * 10_000,
    });
  }

  await prisma.order.createMany({ data: orderRows });

  const createdOrders = await prisma.order.findMany({
    where: { organizationId, externalOrderId: { startsWith: 'BULK-' } },
    select: { id: true },
  });

  const lineItemRows: Array<{
    organizationId: string;
    orderId: string;
    listingOptionId: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    externalLineId: string;
  }> = [];

  for (const order of createdOrders) {
    for (let j = 0; j < lineItemsPerOrder; j++) {
      lineItemRows.push({
        organizationId,
        orderId: order.id,
        listingOptionId,
        quantity: 1,
        unitPrice: 10_000,
        totalPrice: 10_000,
        externalLineId: `BLI-${order.id}-${j}`,
      });
    }
  }

  await prisma.orderLineItem.createMany({ data: lineItemRows });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('ProfitLossService (PG integration — live aggregation)', () => {
  let prisma: PrismaClient;
  let service: ProfitLossService;

  /** The Orders collection declares it collected these KST dates. */
  const coverOrders = (
    organizationId = TEST_ORGANIZATION_ID,
    startDate = '2026-04-01',
    endDate = '2026-04-30',
  ) => seedCompletedOrderCoverageRun(prisma, { organizationId, startDate, endDate });

  /** The campaign sweep declares it measured every April date. */
  const coverAprilAds = (organizationId = TEST_ORGANIZATION_ID) => seedCompletedAdSweepRun(prisma, {
    organizationId,
    generation: 1,
    window: { startDate: '2026-04-01', endDate: '2026-04-30' },
  });

  const rowsFor = async (organizationId: string, year: number, month: number) =>
    (await service.findAll(organizationId, year, month)).rows;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();

    const m = await Test.createTestingModule({
      providers: [
        ProfitLossService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = m.get(ProfitLossService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('IDOR: findAll(TEST_COMPANY) returns only TEST rows; OTHER rows never leak', async () => {
    const listA = await setupListing(prisma, TEST_ORGANIZATION_ID, 'IDOR-A');
    const listB = await setupListing(prisma, TEST_ORGANIZATION_ID, 'IDOR-B');
    const listC = await setupListing(prisma, TEST_ORGANIZATION_ID, 'IDOR-C');

    const orderedAt = new Date('2026-04-15T00:00:00.000Z');

    await createOrder(prisma, TEST_ORGANIZATION_ID, {
      orderedAt,
      externalOrderId: 'IDOR-TEST-1',
      lineItems: [{ listingOptionId: listA.listingOption.id, optionId: listA.option.id, totalPrice: 10_000 }],
    });
    await createOrder(prisma, TEST_ORGANIZATION_ID, {
      orderedAt,
      externalOrderId: 'IDOR-TEST-2',
      lineItems: [{ listingOptionId: listB.listingOption.id, optionId: listB.option.id, totalPrice: 20_000 }],
    });
    await createOrder(prisma, TEST_ORGANIZATION_ID, {
      orderedAt,
      externalOrderId: 'IDOR-TEST-3',
      lineItems: [{ listingOptionId: listC.listingOption.id, optionId: listC.option.id, totalPrice: 30_000 }],
    });

    const otherListA = await setupListing(prisma, OTHER_ORGANIZATION_ID, 'IDOR-OA');
    const otherListB = await setupListing(prisma, OTHER_ORGANIZATION_ID, 'IDOR-OB');
    const otherListC = await setupListing(prisma, OTHER_ORGANIZATION_ID, 'IDOR-OC');

    await createOrder(prisma, OTHER_ORGANIZATION_ID, {
      orderedAt,
      externalOrderId: 'IDOR-OTHER-1',
      lineItems: [{ listingOptionId: otherListA.listingOption.id, optionId: otherListA.option.id, totalPrice: 999_999 }],
    });
    await createOrder(prisma, OTHER_ORGANIZATION_ID, {
      orderedAt,
      externalOrderId: 'IDOR-OTHER-2',
      lineItems: [{ listingOptionId: otherListB.listingOption.id, optionId: otherListB.option.id, totalPrice: 999_999 }],
    });
    await createOrder(prisma, OTHER_ORGANIZATION_ID, {
      orderedAt,
      externalOrderId: 'IDOR-OTHER-3',
      lineItems: [{ listingOptionId: otherListC.listingOption.id, optionId: otherListC.option.id, totalPrice: 999_999 }],
    });
    await coverOrders(TEST_ORGANIZATION_ID);
    await coverOrders(OTHER_ORGANIZATION_ID);

    const result = await service.findAll(TEST_ORGANIZATION_ID, 2026, 4);

    expect(result.rows).toHaveLength(3);
    const externalIds = result.rows.map((r) => r.externalId);
    expect(externalIds.every((id) => id.startsWith('EXT-IDOR-') && !id.startsWith('EXT-IDOR-O'))).toBe(true);
    expect(result.rows.every((r) => r.revenue < 999_999)).toBe(true);
    expect(result.totals.revenue).toBe(60_000);

    const otherResult = await rowsFor(OTHER_ORGANIZATION_ID, 2026, 4);
    expect(otherResult).toHaveLength(3);
    expect(otherResult.every((r) => r.externalId.startsWith('EXT-IDOR-O'))).toBe(true);
  });

  it('Shipping splits revenue-weighted: 9000:3000 order → 2250+750 across 2 listings', async () => {
    const listA = await setupListing(prisma, TEST_ORGANIZATION_ID, 'SHIP-A');
    const listB = await setupListing(prisma, TEST_ORGANIZATION_ID, 'SHIP-B');

    const orderedAt = new Date('2026-04-15T00:00:00.000Z');
    const order = await prisma.order.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: listA.listing.channelAccountId,
        externalOrderId: 'SHIP-ORD-1',
        orderedAt,
        status: 'paid',
        shippingPrice: 3000,
        totalPrice: 12_000,
      },
    });
    await prisma.orderLineItem.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        orderId: order.id,
        listingOptionId: listA.listingOption.id,
        quantity: 1,
        unitPrice: 9000,
        totalPrice: 9000,
        externalLineId: 'SHIP-LI-A',
      },
    });
    await prisma.orderLineItem.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        orderId: order.id,
        listingOptionId: listB.listingOption.id,
        quantity: 1,
        unitPrice: 3000,
        totalPrice: 3000,
        externalLineId: 'SHIP-LI-B',
      },
    });
    await coverOrders();

    const result = await rowsFor(TEST_ORGANIZATION_ID, 2026, 4);

    expect(result).toHaveLength(2);
    const rowA = result.find((r) => r.externalId === 'EXT-SHIP-A');
    const rowB = result.find((r) => r.externalId === 'EXT-SHIP-B');
    expect(rowA!.revenue).toBe(9000);
    expect(rowB!.revenue).toBe(3000);
    expect(rowA!.shippingCost).toBe(2250);
    expect(rowB!.shippingCost).toBe(750);
    expect(rowA!.shippingCost + rowB!.shippingCost).toBe(3000);
  });

  it('the response passes ProfitLossResponseSchema — no shape drift vs shared schema', async () => {
    const listA = await setupListing(prisma, TEST_ORGANIZATION_ID, 'SCHEMA-A');
    const listB = await setupListing(prisma, TEST_ORGANIZATION_ID, 'SCHEMA-B');

    const orderedAt = new Date('2026-04-15T00:00:00.000Z');
    await createOrder(prisma, TEST_ORGANIZATION_ID, {
      orderedAt,
      externalOrderId: 'SCHEMA-ORD-1',
      lineItems: [{ listingOptionId: listA.listingOption.id, optionId: listA.option.id, totalPrice: 15_000 }],
    });
    await createOrder(prisma, TEST_ORGANIZATION_ID, {
      orderedAt,
      externalOrderId: 'SCHEMA-ORD-2',
      lineItems: [{ listingOptionId: listB.listingOption.id, optionId: listB.option.id, totalPrice: 25_000 }],
    });
    await coverOrders();

    const result = await service.findAll(TEST_ORGANIZATION_ID, 2026, 4);
    expect(result.rows.length).toBeGreaterThan(0);

    const parsed = ProfitLossResponseSchema.safeParse(JSON.parse(JSON.stringify(result)));
    expect(parsed.success, `ProfitLossResponseSchema.parse failed: ${JSON.stringify(parsed)}`).toBe(true);
  });

  it('KST boundary: 2026-04-30T15:00:00Z (= 2026-05-01 00:00 KST) excluded from April, included in May', async () => {
    const listApril = await setupListing(prisma, TEST_ORGANIZATION_ID, 'KST-APRIL');
    const listEarlyMay = await setupListing(prisma, TEST_ORGANIZATION_ID, 'KST-EARLY-MAY');
    const listLateApril = await setupListing(prisma, TEST_ORGANIZATION_ID, 'KST-LATE-APRIL');

    await createOrder(prisma, TEST_ORGANIZATION_ID, {
      orderedAt: new Date('2026-04-15T00:00:00.000Z'),
      externalOrderId: 'KST-APRIL-ORD',
      lineItems: [{ listingOptionId: listApril.listingOption.id, optionId: listApril.option.id, totalPrice: 10_000 }],
    });
    await createOrder(prisma, TEST_ORGANIZATION_ID, {
      orderedAt: new Date('2026-04-30T15:00:00.000Z'),
      externalOrderId: 'KST-EARLY-MAY-ORD',
      lineItems: [{ listingOptionId: listEarlyMay.listingOption.id, optionId: listEarlyMay.option.id, totalPrice: 50_000 }],
    });
    await createOrder(prisma, TEST_ORGANIZATION_ID, {
      orderedAt: new Date('2026-04-30T14:59:59.999Z'),
      externalOrderId: 'KST-LATE-APRIL-ORD',
      lineItems: [{ listingOptionId: listLateApril.listingOption.id, optionId: listLateApril.option.id, totalPrice: 77_777 }],
    });
    await coverOrders(TEST_ORGANIZATION_ID, '2026-04-01', '2026-05-31');

    const aprilResult = await rowsFor(TEST_ORGANIZATION_ID, 2026, 4);
    const lateAprilRow = aprilResult.find((r) => r.externalId === 'EXT-KST-LATE-APRIL');
    expect(lateAprilRow, 'LATE-APRIL row (last ms of April) should be included in April').toBeDefined();
    expect(lateAprilRow!.revenue).toBe(77_777);
    expect(aprilResult.find((r) => r.externalId === 'EXT-KST-EARLY-MAY')).toBeUndefined();
    expect(aprilResult.every((r) => r.revenue !== 50_000)).toBe(true);

    const mayResult = await rowsFor(TEST_ORGANIZATION_ID, 2026, 5);
    const earlyMayRow = mayResult.find((r) => r.externalId === 'EXT-KST-EARLY-MAY');
    expect(earlyMayRow, 'EARLY-MAY row should be included in May').toBeDefined();
    expect(earlyMayRow!.revenue).toBe(50_000);
    expect(mayResult.find((r) => r.externalId === 'EXT-KST-LATE-APRIL')).toBeUndefined();
    expect(mayResult.every((r) => r.revenue !== 77_777)).toBe(true);
  });

  it('an advertising account that published nothing leaves ad cost and profit unavailable', async () => {
    const list = await setupListing(prisma, TEST_ORGANIZATION_ID, 'EMPTY-A');

    await createOrder(prisma, TEST_ORGANIZATION_ID, {
      orderedAt: new Date('2026-04-15T00:00:00.000Z'),
      externalOrderId: 'EMPTY-ORD-1',
      lineItems: [{ listingOptionId: list.listingOption.id, optionId: list.option.id, totalPrice: 20_000 }],
    });
    await coverOrders();

    const result = await service.findAll(TEST_ORGANIZATION_ID, 2026, 4);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      returnCount: 0,
      adCost: null,
      netProfit: null,
      profitRate: null,
    });
    expect(result.totals).toMatchObject({ revenue: 20_000, adCost: null, netProfit: null, profitRate: null });
    expect(result.basis.adCost.includedDates).toEqual([]);
    expect(periodBasisStatus(result.basis.adCost)).toBe('empty');
    expect(periodBasisStatus(result.basis.revenue)).toBe('complete');
  });

  it('A confirmed-zero advertising window → returnCount: 0, adCost: 0', async () => {
    const list = await setupListing(prisma, TEST_ORGANIZATION_ID, 'ZERO-A');

    await createOrder(prisma, TEST_ORGANIZATION_ID, {
      orderedAt: new Date('2026-04-15T00:00:00.000Z'),
      externalOrderId: 'ZERO-ORD-1',
      lineItems: [{ listingOptionId: list.listingOption.id, optionId: list.option.id, totalPrice: 20_000 }],
    });
    const runId = await coverAprilAds();
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID, listingId: list.listing.id,
      date: '2026-04-15', spend: 0, runId,
    });
    await coverOrders();

    const result = await rowsFor(TEST_ORGANIZATION_ID, 2026, 4);

    expect(result).toHaveLength(1);
    expect(result[0].returnCount).toBe(0);
    expect(result[0].adCost).toBe(0);
    expect(result[0].netProfit).not.toBeNull();
  });

  it('ReturnLineItem with null orderLineItem.listingOption → skipped; properly wired → returnCount: 1', async () => {
    const list = await setupListing(prisma, TEST_ORGANIZATION_ID, 'NULL-LO');
    const orderedAt = new Date('2026-04-15T00:00:00.000Z');

    const order = await createOrder(prisma, TEST_ORGANIZATION_ID, {
      orderedAt,
      externalOrderId: 'NULL-LO-ORD',
      lineItems: [{ listingOptionId: list.listingOption.id, optionId: list.option.id, totalPrice: 10_000 }],
    });
    const realLineItem = await prisma.orderLineItem.findFirstOrThrow({
      where: { orderId: order.id, listingOptionId: list.listingOption.id },
    });
    const orphanLineItem = await prisma.orderLineItem.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        orderId: order.id,
        listingOptionId: null,
        quantity: 1,
        unitPrice: 5_000,
        totalPrice: 5_000,
        externalLineId: 'NULL-LO-LI-ORPHAN',
      },
    });
    const orderReturn = await prisma.orderReturn.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        orderId: order.id,
        channelAccountId: list.listing.channelAccountId,
        externalReturnId: 'RET-NULL-LO',
        status: 'return_request',
        type: 'RETURN',
        reason: '단순변심',
        faultBy: 'CUSTOMER',
        requesterName: 'Test',
        requestedAt: orderedAt,
      },
    });
    await prisma.orderReturnLineItem.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        returnId: orderReturn.id,
        orderLineItemId: realLineItem.id,
        productName: 'real item',
        quantity: 1,
      },
    });
    await prisma.orderReturnLineItem.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        returnId: orderReturn.id,
        orderLineItemId: orphanLineItem.id,
        productName: 'orphaned',
        quantity: 1,
      },
    });
    await coverOrders();

    const result = await rowsFor(TEST_ORGANIZATION_ID, 2026, 4);

    const row = result.find((r) => r.externalId === 'EXT-NULL-LO');
    expect(row, 'L1 row for EXT-NULL-LO should exist').toBeDefined();
    expect(row!.returnCount).toBe(1);
  });

  /**
   * KID-85 acceptance — a product with any line lacking cost has no measured
   * net profit, and a month containing it has no measured profit either.
   */
  it('publishes no net profit for a product with any line lacking cost, and none for the month', async () => {
    const known = await setupListing(prisma, TEST_ORGANIZATION_ID, 'COST-KNOWN');
    const unknown = await setupListing(prisma, TEST_ORGANIZATION_ID, 'COST-UNKNOWN');
    const pricedOption = await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: unknown.listing.id,
        externalOptionId: 'VI-COST-UNKNOWN-PRICED',
        costPriceOverride: 1000,
        commissionRate: 0.1,
        otherCost: 50,
      },
    });
    // The second option of the same product has neither a cost override nor
    // a purchase price on its mapped Sellpia component.
    await prisma.channelListingOption.update({
      where: { id: unknown.listingOption.id },
      data: { costPriceOverride: null },
    });
    await prisma.sellpiaInventorySku.update({
      where: { id: unknown.option.id },
      data: { purchasePrice: null },
    });

    const orderedAt = new Date('2026-04-15T00:00:00.000Z');
    await createOrder(prisma, TEST_ORGANIZATION_ID, {
      orderedAt,
      externalOrderId: 'COST-KNOWN-ORD',
      lineItems: [{ listingOptionId: known.listingOption.id, optionId: known.option.id, totalPrice: 10_000 }],
    });
    await createOrder(prisma, TEST_ORGANIZATION_ID, {
      orderedAt,
      externalOrderId: 'COST-UNKNOWN-ORD',
      lineItems: [
        { listingOptionId: pricedOption.id, optionId: unknown.option.id, totalPrice: 10_000 },
        { listingOptionId: unknown.listingOption.id, optionId: unknown.option.id, totalPrice: 10_000 },
      ],
    });
    await coverAprilAds();
    await coverOrders();

    const result = await service.findAll(TEST_ORGANIZATION_ID, 2026, 4);

    expect(result.rows.find((row) => row.listingId === known.listing.id)).toMatchObject({
      revenue: 10_000,
      cogs: 1_000,
      commission: 1_000,
      otherCost: 50,
      adCost: 0,
      netProfit: 7_950,
      profitRate: 79.5,
    });
    expect(result.rows.find((row) => row.listingId === unknown.listing.id)).toMatchObject({
      revenue: 20_000,
      cogs: null,
      netProfit: null,
      profitRate: null,
    });
    expect(result.totals).toMatchObject({
      revenue: 30_000,
      orderCount: 2,
      adCost: 0,
      netProfit: null,
      profitRate: null,
    });
    expect(periodBasisStatus(result.basis.revenue)).toBe('complete');
    expect(result.basis.profit.invalidDates).toHaveLength(30);
    expect(periodBasisStatus(result.basis.profit)).toBe('empty');
  });

  it('a fully measured month publishes its totals with a complete basis', async () => {
    const list = await setupListing(prisma, TEST_ORGANIZATION_ID, 'MEASURED');
    await createOrder(prisma, TEST_ORGANIZATION_ID, {
      orderedAt: new Date('2026-04-15T00:00:00.000Z'),
      externalOrderId: 'MEASURED-ORD',
      shippingPrice: 3_000,
      lineItems: [{ listingOptionId: list.listingOption.id, optionId: list.option.id, totalPrice: 20_000 }],
    });
    const runId = await coverAprilAds();
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID, listingId: list.listing.id,
      date: '2026-04-15', spend: 2_000, runId,
    });
    await coverOrders();

    const result = await service.findAll(TEST_ORGANIZATION_ID, 2026, 4);

    expect(result.period).toBe('2026-04');
    expect(result.rows[0]).toMatchObject({
      cogs: 1_000, commission: 2_000, otherCost: 50, shippingCost: 3_000,
      adCost: 2_000, netProfit: 11_950, profitRate: 59.8,
    });
    expect(result.totals).toEqual({
      revenue: 20_000,
      orderCount: 1,
      cost: 8_050,
      adCost: 2_000,
      netProfit: 11_950,
      profitRate: 59.8,
    });
    expect(result.basis.revenue).toMatchObject({
      from: '2026-04-01', to: '2026-04-30', targetDays: 30, sources: ['orders'],
    });
    expect(result.basis.adCost.sources).toEqual(['coupang_ads']);
    expect(result.basis.profit.sources).toEqual(['orders', 'coupang_ads']);
    for (const basis of [result.basis.revenue, result.basis.adCost, result.basis.profit]) {
      expect(periodBasisStatus(basis)).toBe('complete');
    }
  });

  it('a month the Orders collection covered only in part publishes no window totals', async () => {
    const list = await setupListing(prisma, TEST_ORGANIZATION_ID, 'PARTIAL');
    await createOrder(prisma, TEST_ORGANIZATION_ID, {
      orderedAt: new Date('2026-04-15T00:00:00.000Z'),
      externalOrderId: 'PARTIAL-ORD',
      lineItems: [{ listingOptionId: list.listingOption.id, optionId: list.option.id, totalPrice: 20_000 }],
    });
    await coverAprilAds();
    await coverOrders(TEST_ORGANIZATION_ID, '2026-04-01', '2026-04-20');

    const result = await service.findAll(TEST_ORGANIZATION_ID, 2026, 4);

    // The collected line stays visible with its basis; nothing derived from
    // the whole month is published from twenty collected days.
    expect(result.rows[0]).toMatchObject({ revenue: 20_000, netProfit: null, profitRate: null });
    expect(result.totals).toMatchObject({
      revenue: null, orderCount: null, cost: null, netProfit: null, profitRate: null,
    });
    expect(result.basis.revenue.includedDates).toHaveLength(20);
    expect(periodBasisStatus(result.basis.revenue)).toBe('partial');
  });

  it('handles 1000 orders with 3 lineItems each under 2s (CEO-C3 baseline)', async () => {
    const { listingOption, option, listing } = await setupListing(prisma, TEST_ORGANIZATION_ID, 'PERF-A');

    await seedBulkOrders(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingOptionId: listingOption.id,
      optionId: option.id,
      orderCount: 1000,
      lineItemsPerOrder: 3,
      year: 2026,
      month: 4,
    });
    await coverOrders();

    const start = Date.now();
    const result = await rowsFor(TEST_ORGANIZATION_ID, 2026, 4);
    const latencyMs = Date.now() - start;

    expect(result.length).toBeGreaterThan(0);
    expect(result.find((r) => r.listingId === listing.id)).toBeDefined();
    console.log(`[perf] profit-loss 1000 orders / 3 lineItems → ${latencyMs}ms`);
    expect(latencyMs).toBeLessThan(2000);
  });
});
