import { channelFactTestProviders } from '../../../../../test-helpers/channel-fact-ports';
import { PRODUCT_TRANSACTIONAL_READ_PORT } from '../../../../../products/application/port/in/product-transactional-read.port';
import { ProductTransactionalReadRepositoryAdapter } from '../../../../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { ProfitLossResponseSchema } from '@kiditem/shared/finance';
import { periodBasisStatus } from '@kiditem/shared/dashboard';
import { ProfitLossService } from '../profit-loss.service';
import { PrismaService } from '../../../../../prisma/prisma.service';
import {
  seedAd,
  seedCompletedAdSweepRun,
  seedCompletedOrderCoverageRun,
  seedOrderWithLineItems,
  setupChannelListing,
  setupMaster,
  setupProductOption,
} from '../../../../../test-helpers/finance-seeds';
import { seedSourceProduct } from '../../../../../test-helpers/inventory-seeds';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
} from '../../../../../test-helpers/real-prisma';

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
  const master = await seedSourceProduct(prisma, {
    organizationId,
    code: `SP-${suffix}`,
    name: `Master ${suffix}`,
    purchasePrice: 1000,
    currentStock: 100,
  });
  const option = master;
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
    },
  });
  await prisma.channelListingOptionInventoryComponent.create({
    data: {
      organizationId,
      channelListingOptionId: listingOption.id,
      masterProductId: master.id,
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
  // A Rocket direct-purchase order: its sales carry no commission or other
  // cost, so the listing's purchase cost is its only cost input (KID-114).
  const rocketAccount = await prisma.channelAccount.upsert({
    where: {
      organizationId_channel_externalAccountId: {
        organizationId,
        channel: 'rocket',
        externalAccountId: 'profit-loss-rocket',
      },
    },
    create: {
      organizationId,
      channel: 'rocket',
      name: 'Profit loss Rocket account',
      externalAccountId: 'profit-loss-rocket',
    },
    update: {},
  });
  const order = await prisma.order.create({
    data: {
      organizationId,
      channelAccountId: rocketAccount.id,
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
    (await service.findAll(organizationId, year, month, AFTER_MONTHS)).rows;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();

    const m = await Test.createTestingModule({
      providers: [
        ...channelFactTestProviders,
        { provide: PRODUCT_TRANSACTIONAL_READ_PORT, useClass: ProductTransactionalReadRepositoryAdapter },
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

    const result = await service.findAll(TEST_ORGANIZATION_ID, 2026, 4, AFTER_MONTHS);

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

    const result = await service.findAll(TEST_ORGANIZATION_ID, 2026, 4, AFTER_MONTHS);
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

    const result = await service.findAll(TEST_ORGANIZATION_ID, 2026, 4, AFTER_MONTHS);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      returnCount: null,
      adCost: null,
      netProfit: null,
      profitRate: null,
    });
    expect(result.totals).toMatchObject({ revenue: 20_000, adCost: null, netProfit: null, profitRate: null });
    expect(result.basis.adCost.includedDates).toEqual([]);
    expect(periodBasisStatus(result.basis.adCost)).toBe('empty');
    expect(periodBasisStatus(result.basis.revenue)).toBe('complete');
  });

  it('A confirmed-zero advertising window → adCost: 0', async () => {
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
    expect(result[0].returnCount).toBeNull();
    expect(result[0].adCost).toBe(0);
    expect(result[0].netProfit).not.toBeNull();
  });

  /**
   * Returns have no owner publication: nothing collects them, so a row with
   * collected lines publishes no return count, not 0 (ADR-0006, ADR-0009).
   */
  it('publishes no return count for a row with collected lines', async () => {
    const list = await setupListing(prisma, TEST_ORGANIZATION_ID, 'NULL-LO');
    const orderedAt = new Date('2026-04-15T00:00:00.000Z');

    const order = await createOrder(prisma, TEST_ORGANIZATION_ID, {
      orderedAt,
      externalOrderId: 'NULL-LO-ORD',
      lineItems: [{ listingOptionId: list.listingOption.id, optionId: list.option.id, totalPrice: 10_000 }],
    });
    await prisma.orderLineItem.create({
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
    await coverOrders();

    const result = await rowsFor(TEST_ORGANIZATION_ID, 2026, 4);

    const row = result.find((r) => r.externalId === 'EXT-NULL-LO');
    expect(row, 'L1 row for EXT-NULL-LO should exist').toBeDefined();
    expect(row!.returnCount).toBeNull();
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
      },
    });
    // One option of the product is priced through a Sellpia component; the
    // other option's mapped Sellpia component has no purchase price.
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: pricedOption.id,
        masterProductId: known.option.id,
        quantity: 1,
      },
    });
    await prisma.masterProduct.update({
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

    const result = await service.findAll(TEST_ORGANIZATION_ID, 2026, 4, AFTER_MONTHS);

    expect(result.rows.find((row) => row.listingId === known.listing.id)).toMatchObject({
      revenue: 10_000,
      cogs: 1_000,
      commission: 0,
      otherCost: 0,
      adCost: 0,
      netProfit: 9_000,
      profitRate: 90,
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

    const result = await service.findAll(TEST_ORGANIZATION_ID, 2026, 4, AFTER_MONTHS);

    expect(result.period).toBe('2026-04');
    expect(result.rows[0]).toMatchObject({
      cogs: 1_000, commission: 0, otherCost: 0, shippingCost: 3_000,
      adCost: 2_000, netProfit: 14_000, profitRate: 70,
    });
    expect(result.totals).toEqual({
      revenue: 20_000,
      orderCount: 1,
      cost: 6_000,
      adCost: 2_000,
      netProfit: 14_000,
      profitRate: 70,
      adCostRate: 10,
      unallocatedAdCost: 0,
      adCostGrainDifference: 0,
      unallocatedShipping: 0,
    });
    expect(result.basis.revenue).toMatchObject({
      from: '2026-04-01', to: '2026-04-30', targetDays: 30, sources: ['orders'],
    });
    expect(result.basis.adCost.sources).toEqual(['coupang_ads']);
    expect(result.basis.requestedWindow).toEqual({ from: '2026-04-01', to: '2026-04-30' });
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

    const result = await service.findAll(TEST_ORGANIZATION_ID, 2026, 4, AFTER_MONTHS);

    // The collected line stays visible with its basis; nothing derived from
    // the whole month is published from twenty collected days.
    expect(result.rows[0]).toMatchObject({ revenue: 20_000, netProfit: null, profitRate: null });
    expect(result.totals).toMatchObject({
      revenue: null, orderCount: null, cost: null, netProfit: null, profitRate: null,
    });
    expect(result.basis.revenue.includedDates).toHaveLength(20);
    expect(periodBasisStatus(result.basis.revenue)).toBe('partial');
  });

  /** A moment after every month these cases read has closed in KST. */
  const AFTER_MONTHS = new Date('2026-07-01T00:00:00.000Z');

  /**
   * The month containing today is evaluated over its closed KST days only,
   * the anchor-clipped month of ADR-0001: its totals rest on the days through
   * yesterday, and a line ordered today is not part of them.
   */
  describe('in-progress month window', () => {
    /** 12:00 KST on 15 April: 1–14 April are closed. */
    const MID_APRIL = new Date('2026-04-15T03:00:00.000Z');
    /** 12:00 KST on 1 April: no April day is closed. */
    const APRIL_FIRST = new Date('2026-04-01T03:00:00.000Z');
    /** 12:00 KST on 15 May: April has ended. */
    const MID_MAY = new Date('2026-05-15T03:00:00.000Z');

    it('evaluates the month containing today over its closed days and leaves today out', async () => {
      const list = await setupListing(prisma, TEST_ORGANIZATION_ID, 'MID-MONTH');
      await createOrder(prisma, TEST_ORGANIZATION_ID, {
        orderedAt: new Date('2026-04-10T00:00:00.000Z'),
        externalOrderId: 'MID-MONTH-CLOSED',
        lineItems: [{ listingOptionId: list.listingOption.id, optionId: list.option.id, totalPrice: 10_000 }],
      });
      await createOrder(prisma, TEST_ORGANIZATION_ID, {
        orderedAt: new Date('2026-04-15T01:00:00.000Z'),
        externalOrderId: 'MID-MONTH-TODAY',
        lineItems: [{ listingOptionId: list.listingOption.id, optionId: list.option.id, totalPrice: 20_000 }],
      });
      await seedCompletedAdSweepRun(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        generation: 1,
        window: { startDate: '2026-04-01', endDate: '2026-04-14' },
      });
      await coverOrders(TEST_ORGANIZATION_ID, '2026-04-01', '2026-04-15');

      const result = await service.findAll(TEST_ORGANIZATION_ID, 2026, 4, MID_APRIL);

      expect(result.rows).toEqual([
        expect.objectContaining({ revenue: 10_000, orderCount: 1, netProfit: 9_000 }),
      ]);
      expect(result.totals).toMatchObject({ revenue: 10_000, orderCount: 1, adCost: 0, netProfit: 9_000 });
      expect(result.basis.requestedWindow).toEqual({ from: '2026-04-01', to: '2026-04-30' });
      expect(result.basis.revenue).toMatchObject({ from: '2026-04-01', to: '2026-04-14', targetDays: 14 });
      for (const basis of [result.basis.revenue, result.basis.adCost, result.basis.profit]) {
        expect(periodBasisStatus(basis)).toBe('complete');
      }
    });

    /**
     * The sweep reached the 13th while the window's last closed day is the
     * 14th. Advertising applies, so the window has no profit; its basis must
     * not present the dates both sources did measure as a partly measured
     * profit beside a value that does not exist.
     */
    it('publishes no profit date beside an unavailable profit when the sweep stops short of the last closed day', async () => {
      const list = await setupListing(prisma, TEST_ORGANIZATION_ID, 'AD-SHORT');
      await createOrder(prisma, TEST_ORGANIZATION_ID, {
        orderedAt: new Date('2026-04-10T00:00:00.000Z'),
        externalOrderId: 'AD-SHORT-CLOSED',
        lineItems: [{ listingOptionId: list.listingOption.id, optionId: list.option.id, totalPrice: 10_000 }],
      });
      await seedCompletedAdSweepRun(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        generation: 1,
        window: { startDate: '2026-04-01', endDate: '2026-04-13' },
      });
      await coverOrders(TEST_ORGANIZATION_ID, '2026-04-01', '2026-04-14');

      const result = await service.findAll(TEST_ORGANIZATION_ID, 2026, 4, MID_APRIL);

      expect(result.totals).toMatchObject({ revenue: 10_000, adCost: null, netProfit: null });
      expect(periodBasisStatus(result.basis.adCost)).toBe('partial');
      expect(result.basis.profit.includedDates).toEqual([]);
      expect(periodBasisStatus(result.basis.profit)).toBe('empty');
    });

    it('publishes no totals on the 1st, when no day of the month has closed', async () => {
      const list = await setupListing(prisma, TEST_ORGANIZATION_ID, 'FIRST-DAY');
      await createOrder(prisma, TEST_ORGANIZATION_ID, {
        orderedAt: new Date('2026-04-01T01:00:00.000Z'),
        externalOrderId: 'FIRST-DAY-TODAY',
        lineItems: [{ listingOptionId: list.listingOption.id, optionId: list.option.id, totalPrice: 10_000 }],
      });
      await coverOrders(TEST_ORGANIZATION_ID, '2026-04-01', '2026-04-01');

      const result = await service.findAll(TEST_ORGANIZATION_ID, 2026, 4, APRIL_FIRST);

      expect(result.rows).toEqual([]);
      expect(result.totals).toEqual({
        revenue: null, orderCount: null, cost: null, adCost: null, netProfit: null, profitRate: null,
        adCostRate: null, unallocatedAdCost: null, adCostGrainDifference: null, unallocatedShipping: null,
      });
      expect(result.basis.requestedWindow).toEqual({ from: '2026-04-01', to: '2026-04-30' });
      // The effective window ends the day before it starts: zero closed days.
      expect(result.basis.revenue).toMatchObject({
        from: '2026-04-01', to: '2026-03-31', targetDays: 0, includedDates: [],
      });
      expect(periodBasisStatus(result.basis.revenue)).toBe('empty');
    });

    it('evaluates a month that has already ended over every one of its days', async () => {
      const list = await setupListing(prisma, TEST_ORGANIZATION_ID, 'ENDED-MONTH');
      await createOrder(prisma, TEST_ORGANIZATION_ID, {
        orderedAt: new Date('2026-04-30T14:00:00.000Z'),
        externalOrderId: 'ENDED-MONTH-LAST-DAY',
        lineItems: [{ listingOptionId: list.listingOption.id, optionId: list.option.id, totalPrice: 10_000 }],
      });
      await coverAprilAds();
      await coverOrders();

      const result = await service.findAll(TEST_ORGANIZATION_ID, 2026, 4, MID_MAY);

      expect(result.totals).toMatchObject({ revenue: 10_000, orderCount: 1, netProfit: 9_000 });
      expect(result.basis.requestedWindow).toEqual({ from: '2026-04-01', to: '2026-04-30' });
      expect(result.basis.revenue).toMatchObject({ from: '2026-04-01', to: '2026-04-30', targetDays: 30 });
      expect(periodBasisStatus(result.basis.profit)).toBe('complete');
    });
  });

  /**
   * KID-85 follow-up P3-2 and P3-13 — the totals publish what no product row
   * carries (spend on a listing that sold nothing, shipping of a zero-revenue
   * order) and the ad cost share, so the screen does no arithmetic.
   */
  it('publishes the totals no product row carries and the ad cost share', async () => {
    const sold = await setupListing(prisma, TEST_ORGANIZATION_ID, 'ALLOC-SOLD');
    const unsold = await setupListing(prisma, TEST_ORGANIZATION_ID, 'ALLOC-UNSOLD');
    const orderedAt = new Date('2026-04-15T00:00:00.000Z');
    await createOrder(prisma, TEST_ORGANIZATION_ID, {
      orderedAt,
      externalOrderId: 'ALLOC-PAID',
      shippingPrice: 3_000,
      lineItems: [{ listingOptionId: sold.listingOption.id, optionId: sold.option.id, totalPrice: 20_000 }],
    });
    await createOrder(prisma, TEST_ORGANIZATION_ID, {
      orderedAt,
      externalOrderId: 'ALLOC-ZERO-REVENUE',
      shippingPrice: 500,
      lineItems: [{ listingOptionId: sold.listingOption.id, optionId: sold.option.id, totalPrice: 0 }],
    });
    const runId = await coverAprilAds();
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID, listingId: sold.listing.id, date: '2026-04-15', spend: 2_000, runId,
    });
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID, listingId: unsold.listing.id, date: '2026-04-15', spend: 1_000, runId,
    });
    await coverOrders();

    const result = await service.findAll(TEST_ORGANIZATION_ID, 2026, 4, AFTER_MONTHS);

    // The zero-revenue order has no revenue to weigh its shipping by, so its
    // 500 stays out of the row; the unsold listing's 1,000 spend has no row.
    expect(result.rows).toEqual([
      expect.objectContaining({
        listingId: sold.listing.id, cogs: 2_000, shippingCost: 3_000, adCost: 2_000, netProfit: 13_000,
      }),
    ]);
    expect(result.totals).toEqual({
      revenue: 20_000,
      orderCount: 2,
      cost: 8_500,
      adCost: 3_000,
      netProfit: 11_500,
      profitRate: 57.5,
      adCostRate: 15,
      unallocatedAdCost: 1_000,
      adCostGrainDifference: 0,
      unallocatedShipping: 500,
    });
  });

  /**
   * KID-85 follow-up 3c — each part no row carries is taken from exact values.
   * The won that per-line shipping rounding leaves between the rows and the
   * total is rounding, never unallocated shipping.
   */
  it('publishes no unallocated shipping for the won per-line rounding leaves', async () => {
    const left = await setupListing(prisma, TEST_ORGANIZATION_ID, 'ROUND-LEFT');
    const right = await setupListing(prisma, TEST_ORGANIZATION_ID, 'ROUND-RIGHT');
    await createOrder(prisma, TEST_ORGANIZATION_ID, {
      orderedAt: new Date('2026-04-15T00:00:00.000Z'),
      externalOrderId: 'ROUND-SPLIT',
      shippingPrice: 1_001,
      lineItems: [
        { listingOptionId: left.listingOption.id, optionId: left.option.id, totalPrice: 10_000 },
        { listingOptionId: right.listingOption.id, optionId: right.option.id, totalPrice: 10_000 },
      ],
    });
    await coverAprilAds();
    await coverOrders();

    const result = await service.findAll(TEST_ORGANIZATION_ID, 2026, 4, AFTER_MONTHS);

    // 1,001 split 50/50 rounds each row to 501, so the rows carry 1,002.
    expect(result.rows.map((row) => row.shippingCost)).toEqual([501, 501]);
    expect(result.totals).toMatchObject({
      unallocatedShipping: 0,
      unallocatedAdCost: 0,
      adCostGrainDifference: 0,
    });
  });

  it('separates spend on a listing that sold nothing from the campaign and listing grain difference', async () => {
    const sold = await setupListing(prisma, TEST_ORGANIZATION_ID, 'GRAIN-SOLD');
    const unsold = await setupListing(prisma, TEST_ORGANIZATION_ID, 'GRAIN-UNSOLD');
    await createOrder(prisma, TEST_ORGANIZATION_ID, {
      orderedAt: new Date('2026-04-15T00:00:00.000Z'),
      externalOrderId: 'GRAIN-PAID',
      lineItems: [{ listingOptionId: sold.listingOption.id, optionId: sold.option.id, totalPrice: 20_000 }],
    });
    const runId = await coverAprilAds();
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID, listingId: sold.listing.id, date: '2026-04-15', spend: 2_000, runId,
    });
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID, listingId: unsold.listing.id, date: '2026-04-15', spend: 400, runId,
    });
    // The campaign report of the same account-day is the account total: 2,600,
    // 200 more than the product rows under it.
    await prisma.channelAdTargetDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: sold.listing.channelAccountId,
        channel: 'coupang',
        businessDate: new Date('2026-04-15T00:00:00.000Z'),
        targetType: 'product',
        targetKey: 'campaign:grain',
        campaignIdentity: 'campaign:grain',
        sourceImportRunId: runId,
        spend: 2_600,
        adSpend: 2_600,
        metaJson: { data: { granularity: 'campaign' } },
      },
    });
    await coverOrders();

    const result = await service.findAll(TEST_ORGANIZATION_ID, 2026, 4, AFTER_MONTHS);

    expect(result.rows).toEqual([
      expect.objectContaining({ listingId: sold.listing.id, adCost: 2_000 }),
    ]);
    expect(result.totals).toMatchObject({
      adCost: 2_600,
      // Listing-grain spend of the listing that sold nothing.
      unallocatedAdCost: 400,
      // Campaign-grain total minus listing-grain spend over every listing.
      adCostGrainDifference: 200,
    });
  });

  describe('cost inputs that do not apply (KID-114)', () => {
    /** A listing on `channel` with a 5,000 KRW purchase-priced recipe. */
    async function pricedListing(code: string, channel: string) {
      const { id: masterId } = await setupMaster(prisma, {
        organizationId: TEST_ORGANIZATION_ID, code: `M-${code}`, name: `Master ${code}`,
      });
      const { id: optionId } = await setupProductOption(prisma, {
        organizationId: TEST_ORGANIZATION_ID, masterId, sku: `SKU-${code}`, costPrice: 5_000,
      });
      const listing = await setupChannelListing(prisma, {
        organizationId: TEST_ORGANIZATION_ID, masterId, channel,
        externalId: `EXT-${code}`, optionId, externalOptionId: `VI-${code}`,
      });
      return { ...listing, optionId };
    }

    const sell = (
      code: string,
      listing: { optionId: string; listingOptionId: string },
      revenue: number,
      orderChannel?: string,
    ) => seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: `PL-${code}`,
      orderedAt: '2026-04-10T03:00:00Z',
      shippingPrice: 0,
      ...(orderChannel ? { orderChannel } : {}),
      lineItems: [{ quantity: 1, totalPrice: revenue, optionId: listing.optionId, listingOptionId: listing.listingOptionId }],
    });

    it('counts the lines a commission or other cost does not apply to apart from the lines it has no source for', async () => {
      const rocket = await pricedListing('RULE-ROCKET', 'naver');
      const naver = await pricedListing('RULE-NAVER', 'naver');
      await sell('RULE-ROCKET', rocket, 10_000, 'rocket');
      await sell('RULE-NAVER', naver, 8_000);
      await coverOrders();

      const result = await service.findAll(TEST_ORGANIZATION_ID, 2026, 4, AFTER_MONTHS);

      expect(result.rows.find((row) => row.listingId === rocket.listingId)).toMatchObject({
        commission: 0, otherCost: 0, netProfit: 5_000,
      });
      expect(result.rows.find((row) => row.listingId === naver.listingId)).toMatchObject({
        commission: null, otherCost: null, netProfit: null,
      });
      expect(result.totals).toMatchObject({ revenue: 18_000, cost: null, netProfit: null });
      expect(result.basis.costInputs).toEqual({
        unmappedLines: 0,
        purchaseCost: { lines: 2, notAppliedLines: 0, unmeasuredLines: 0 },
        commission: { lines: 2, notAppliedLines: 1, unmeasuredLines: 1 },
        otherCost: { lines: 2, notAppliedLines: 1, unmeasuredLines: 1 },
        // No Coupang advertising account: advertising applies to no line.
        advertising: { lines: 2, notAppliedLines: 2, unmeasuredLines: 0 },
      });
    });

    it('counts lines sold under no listing option apart from lines whose purchase price is missing', async () => {
      const priced = await pricedListing('UNMAPPED-PRICED', 'naver');
      const { id: masterId } = await setupMaster(prisma, {
        organizationId: TEST_ORGANIZATION_ID, code: 'M-UNMAPPED-UNPRICED', name: 'Master UNMAPPED-UNPRICED',
      });
      const skuId = randomUUID();
      await seedSourceProduct(prisma, {
        id: skuId,
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SKU-UNMAPPED-UNPRICED',
        name: 'Unpriced component',
      });
      const unpriced = await setupChannelListing(prisma, {
        organizationId: TEST_ORGANIZATION_ID, masterId, channel: 'naver',
        externalId: 'EXT-UNMAPPED-UNPRICED', optionId: skuId, externalOptionId: 'VI-UNMAPPED-UNPRICED',
      });
      await sell('UNMAPPED-PRICED', priced, 10_000, 'rocket');
      await sell('UNMAPPED-UNPRICED', { optionId: skuId, listingOptionId: unpriced.listingOptionId }, 8_000, 'rocket');
      // A collected line sold under no listing option of any listing.
      const order = await prisma.order.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID, externalOrderId: 'PL-UNMAPPED-PRICED' },
        select: { id: true },
      });
      await prisma.orderLineItem.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          orderId: order.id,
          listingOptionId: null,
          productName: 'Unlinked line',
          quantity: 1,
          unitPrice: 2_000,
          totalPrice: 2_000,
          externalLineId: 'LI-UNMAPPED',
        },
      });
      await coverOrders();

      const result = await service.findAll(TEST_ORGANIZATION_ID, 2026, 4, AFTER_MONTHS);

      expect(result.totals).toMatchObject({ revenue: 20_000, cost: null, netProfit: null });
      expect(result.basis.costInputs).toEqual({
        // No product row and no recipe: counted apart, not as a missing purchase price.
        unmappedLines: 1,
        purchaseCost: { lines: 2, notAppliedLines: 0, unmeasuredLines: 1 },
        commission: { lines: 2, notAppliedLines: 2, unmeasuredLines: 0 },
        otherCost: { lines: 2, notAppliedLines: 2, unmeasuredLines: 0 },
        advertising: { lines: 2, notAppliedLines: 2, unmeasuredLines: 0 },
      });
    });

    it('says advertising is Not applied on a channel the Coupang sweep cannot cover', async () => {
      const coupang = await pricedListing('ADS-COUPANG', 'coupang');
      const naver = await pricedListing('ADS-NAVER', 'naver');
      await sell('ADS-COUPANG', coupang, 10_000, 'rocket');
      await sell('ADS-NAVER', naver, 10_000, 'rocket');
      await coverOrders();

      const result = await service.findAll(TEST_ORGANIZATION_ID, 2026, 4, AFTER_MONTHS);

      // No sweep measured April, so the Coupang listing's advertising is Not
      // measured; the Naver listing's advertising is Not applied.
      expect(result.rows.find((row) => row.listingId === coupang.listingId)).toMatchObject({
        adCost: null, netProfit: null,
      });
      expect(result.rows.find((row) => row.listingId === naver.listingId)).toMatchObject({
        adCost: 0, netProfit: 5_000,
      });
      expect(result.basis.costInputs.advertising).toEqual({ lines: 2, notAppliedLines: 1, unmeasuredLines: 1 });
    });
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
