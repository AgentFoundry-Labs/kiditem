import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { PLDataSchema } from '@kiditem/shared/finance';
import { ProfitLossService } from '../profit-loss.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
  OTHER_COMPANY_ID,
} from '../../../test-helpers/real-prisma';

/**
 * Plan D.1 T6 — ProfitLossService PG integration (live aggregation).
 *
 * T5 が profit-loss.service.ts を ProfitLoss table read から
 * Order + OrderLineItem + ChannelListingOption + MasterProduct + Ad + OrderReturnLineItem
 * への live aggregation に書き換えた。
 *
 * 検証:
 *   1. IDOR: 2 companies × 3 orders each — TEST company query excludes OTHER company rows.
 *   2. Shipping revenue-weighted split: 2 listings in 9000:3000 ratio, shipping 3000 → 2250 + 750.
 *   3. PLDataSchema.parse(row) — no shape drift vs shared schema.
 *   4. KST boundary: orderedAt UTC that falls in May KST is excluded from April query, included in May.
 *   5. Empty returns + empty ads → returnCount: 0, adCost: 0 (Map fallback).
 *   6. Null listingOption on ReturnLineItem → skipped, no count increment.
 *   7. CEO-C3 latency baseline: 1000 orders × 3 lineItems under 2s.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal master + listing + option + listingOption stack for a company. */
async function setupListing(
  prisma: PrismaClient,
  companyId: string,
  suffix: string,
) {
  const master = await prisma.masterProduct.create({
    data: {
      companyId,
      code: `M-${suffix}`,
      name: `Master ${suffix}`,
      category: '유아용품',
      abcGrade: 'A',
      optionCounter: 1,
    },
  });
  const listing = await prisma.channelListing.create({
    data: {
      companyId,
      masterId: master.id,
      channel: 'coupang',
      externalId: `EXT-${suffix}`,
      channelName: `Listing ${suffix}`,
    },
  });
  const option = await prisma.productOption.create({
    data: {
      companyId,
      masterId: master.id,
      optionName: `OPT-${suffix}`,
      sku: `SKU-${suffix}`,
      costPrice: 1000,
      commissionRate: 0.1,
      otherCost: 50,
    },
  });
  const listingOption = await prisma.channelListingOption.create({
    data: {
      companyId,
      listingId: listing.id,
      optionId: option.id,
      externalOptionId: `VI-${suffix}`,
    },
  });
  return { master, listing, option, listingOption };
}

/** Create an order with one or more line items. Each lineItem uses the given listingOption. */
async function createOrder(
  prisma: PrismaClient,
  companyId: string,
  opts: {
    orderedAt: Date;
    shippingPrice?: number;
    status?: string;
    lineItems: Array<{ listingOptionId: string; optionId: string; totalPrice: number; quantity?: number }>;
    externalOrderId?: string;
  },
) {
  const order = await prisma.order.create({
    data: {
      companyId,
      platform: 'coupang',
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
        companyId,
        orderId: order.id,
        listingOptionId: li.listingOptionId,
        optionId: li.optionId,
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
    companyId: string;
    listingOptionId: string;
    optionId: string;
    orderCount: number;
    lineItemsPerOrder: number;
    year: number;
    month: number;
  },
) {
  const { companyId, listingOptionId, optionId, orderCount, lineItemsPerOrder, year, month } = opts;

  // Build all order rows
  const orderRows: Array<{
    companyId: string;
    platform: string;
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
      companyId,
      platform: 'coupang',
      externalOrderId: `BULK-${i}-${Date.now()}-${Math.random()}`,
      orderedAt,
      status: 'paid',
      shippingPrice: 0,
      totalPrice: lineItemsPerOrder * 10_000,
    });
  }

  await prisma.order.createMany({ data: orderRows });

  // Fetch back to get IDs
  const createdOrders = await prisma.order.findMany({
    where: { companyId, externalOrderId: { startsWith: 'BULK-' } },
    select: { id: true },
  });

  // Build all lineItem rows
  const lineItemRows: Array<{
    companyId: string;
    orderId: string;
    listingOptionId: string;
    optionId: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    externalLineId: string;
  }> = [];

  for (const order of createdOrders) {
    for (let j = 0; j < lineItemsPerOrder; j++) {
      lineItemRows.push({
        companyId,
        orderId: order.id,
        listingOptionId,
        optionId,
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

  // ---------------------------------------------------------------------------
  // Test 1: IDOR — 2 companies × 3 orders each
  // ---------------------------------------------------------------------------
  it('IDOR: findAll(TEST_COMPANY) returns only TEST rows; OTHER rows never leak', async () => {
    // TEST company — 3 listings, 1 order each
    const listA = await setupListing(prisma, TEST_COMPANY_ID, 'IDOR-A');
    const listB = await setupListing(prisma, TEST_COMPANY_ID, 'IDOR-B');
    const listC = await setupListing(prisma, TEST_COMPANY_ID, 'IDOR-C');

    const orderedAt = new Date('2026-04-15T00:00:00.000Z');

    await createOrder(prisma, TEST_COMPANY_ID, {
      orderedAt,
      externalOrderId: 'IDOR-TEST-1',
      lineItems: [{ listingOptionId: listA.listingOption.id, optionId: listA.option.id, totalPrice: 10_000 }],
    });
    await createOrder(prisma, TEST_COMPANY_ID, {
      orderedAt,
      externalOrderId: 'IDOR-TEST-2',
      lineItems: [{ listingOptionId: listB.listingOption.id, optionId: listB.option.id, totalPrice: 20_000 }],
    });
    await createOrder(prisma, TEST_COMPANY_ID, {
      orderedAt,
      externalOrderId: 'IDOR-TEST-3',
      lineItems: [{ listingOptionId: listC.listingOption.id, optionId: listC.option.id, totalPrice: 30_000 }],
    });

    // OTHER company — 3 listings, 1 order each
    const otherListA = await setupListing(prisma, OTHER_COMPANY_ID, 'IDOR-OA');
    const otherListB = await setupListing(prisma, OTHER_COMPANY_ID, 'IDOR-OB');
    const otherListC = await setupListing(prisma, OTHER_COMPANY_ID, 'IDOR-OC');

    await createOrder(prisma, OTHER_COMPANY_ID, {
      orderedAt,
      externalOrderId: 'IDOR-OTHER-1',
      lineItems: [{ listingOptionId: otherListA.listingOption.id, optionId: otherListA.option.id, totalPrice: 999_999 }],
    });
    await createOrder(prisma, OTHER_COMPANY_ID, {
      orderedAt,
      externalOrderId: 'IDOR-OTHER-2',
      lineItems: [{ listingOptionId: otherListB.listingOption.id, optionId: otherListB.option.id, totalPrice: 999_999 }],
    });
    await createOrder(prisma, OTHER_COMPANY_ID, {
      orderedAt,
      externalOrderId: 'IDOR-OTHER-3',
      lineItems: [{ listingOptionId: otherListC.listingOption.id, optionId: otherListC.option.id, totalPrice: 999_999 }],
    });

    const result = await service.findAll(TEST_COMPANY_ID, 2026, 4);

    // TEST company has 3 listings → 3 rows
    expect(result).toHaveLength(3);

    // None of the OTHER company's external IDs in result
    const externalIds = result.map((r) => r.externalId);
    expect(externalIds.every((id) => id.startsWith('EXT-IDOR-') && !id.startsWith('EXT-IDOR-O'))).toBe(true);
    expect(externalIds.some((id) => id.startsWith('EXT-IDOR-O'))).toBe(false);

    // No OTHER company revenue (999_999 each) should appear
    expect(result.every((r) => r.revenue < 999_999)).toBe(true);

    // OTHER company query should see only OTHER rows
    const otherResult = await service.findAll(OTHER_COMPANY_ID, 2026, 4);
    expect(otherResult).toHaveLength(3);
    expect(otherResult.every((r) => r.externalId.startsWith('EXT-IDOR-O'))).toBe(true);
    expect(otherResult.some((r) => r.externalId.startsWith('EXT-IDOR-A') || r.externalId.startsWith('EXT-IDOR-B'))).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Test 2: Shipping revenue-weighted split
  // ---------------------------------------------------------------------------
  it('Shipping splits revenue-weighted: 9000:3000 order → 2250+750 across 2 listings', async () => {
    const listA = await setupListing(prisma, TEST_COMPANY_ID, 'SHIP-A');
    const listB = await setupListing(prisma, TEST_COMPANY_ID, 'SHIP-B');

    // One order with 2 lineItems across 2 listings: 9000 (A) + 3000 (B), shippingPrice=3000
    const orderedAt = new Date('2026-04-15T00:00:00.000Z');
    const order = await prisma.order.create({
      data: {
        companyId: TEST_COMPANY_ID,
        platform: 'coupang',
        externalOrderId: 'SHIP-ORD-1',
        orderedAt,
        status: 'paid',
        shippingPrice: 3000,
        totalPrice: 12_000,
      },
    });
    await prisma.orderLineItem.create({
      data: {
        companyId: TEST_COMPANY_ID,
        orderId: order.id,
        listingOptionId: listA.listingOption.id,
        optionId: listA.option.id,
        quantity: 1,
        unitPrice: 9000,
        totalPrice: 9000,
        externalLineId: 'SHIP-LI-A',
      },
    });
    await prisma.orderLineItem.create({
      data: {
        companyId: TEST_COMPANY_ID,
        orderId: order.id,
        listingOptionId: listB.listingOption.id,
        optionId: listB.option.id,
        quantity: 1,
        unitPrice: 3000,
        totalPrice: 3000,
        externalLineId: 'SHIP-LI-B',
      },
    });

    const result = await service.findAll(TEST_COMPANY_ID, 2026, 4);

    expect(result).toHaveLength(2);

    const rowA = result.find((r) => r.externalId === 'EXT-SHIP-A');
    const rowB = result.find((r) => r.externalId === 'EXT-SHIP-B');

    expect(rowA).toBeDefined();
    expect(rowB).toBeDefined();

    expect(rowA!.revenue).toBe(9000);
    expect(rowB!.revenue).toBe(3000);

    // Shipping split: A = round(3000 * 9000/12000) = 2250, B = round(3000 * 3000/12000) = 750
    expect(rowA!.shippingCost).toBe(2250);
    expect(rowB!.shippingCost).toBe(750);

    // Total shipping must reconcile
    expect(rowA!.shippingCost + rowB!.shippingCost).toBe(3000);
  });

  // ---------------------------------------------------------------------------
  // Test 3: PLDataSchema.parse(row) — shape drift guard
  // ---------------------------------------------------------------------------
  it('All rows pass PLDataSchema.parse() — no shape drift vs shared schema', async () => {
    const listA = await setupListing(prisma, TEST_COMPANY_ID, 'SCHEMA-A');
    const listB = await setupListing(prisma, TEST_COMPANY_ID, 'SCHEMA-B');

    const orderedAt = new Date('2026-04-15T00:00:00.000Z');

    await createOrder(prisma, TEST_COMPANY_ID, {
      orderedAt,
      externalOrderId: 'SCHEMA-ORD-1',
      lineItems: [{ listingOptionId: listA.listingOption.id, optionId: listA.option.id, totalPrice: 15_000 }],
    });
    await createOrder(prisma, TEST_COMPANY_ID, {
      orderedAt,
      externalOrderId: 'SCHEMA-ORD-2',
      lineItems: [{ listingOptionId: listB.listingOption.id, optionId: listB.option.id, totalPrice: 25_000 }],
    });

    const result = await service.findAll(TEST_COMPANY_ID, 2026, 4);
    expect(result.length).toBeGreaterThan(0);

    for (const row of result) {
      const parsed = PLDataSchema.safeParse(row);
      expect(parsed.success, `PLDataSchema.parse failed for row: ${JSON.stringify(parsed)}`).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 4: KST boundary — April end / May start split
  // ---------------------------------------------------------------------------
  it('KST boundary: 2026-04-30T15:00:00Z (= 2026-05-01 00:00 KST) excluded from April, included in May', async () => {
    // Two distinct listings so result rows are distinguishable by listingId/externalId
    const listApril = await setupListing(prisma, TEST_COMPANY_ID, 'KST-APRIL');
    const listEarlyMay = await setupListing(prisma, TEST_COMPANY_ID, 'KST-EARLY-MAY');
    const listLateApril = await setupListing(prisma, TEST_COMPANY_ID, 'KST-LATE-APRIL');

    // In-window April order (KST: 2026-04-15)
    await createOrder(prisma, TEST_COMPANY_ID, {
      orderedAt: new Date('2026-04-15T00:00:00.000Z'),
      externalOrderId: 'KST-APRIL-ORD',
      lineItems: [{ listingOptionId: listApril.listingOption.id, optionId: listApril.option.id, totalPrice: 10_000 }],
    });

    // Upper boundary: 2026-04-30T15:00:00.000Z = 2026-05-01 00:00 KST — EXCLUDED from April, INCLUDED in May
    await createOrder(prisma, TEST_COMPANY_ID, {
      orderedAt: new Date('2026-04-30T15:00:00.000Z'),
      externalOrderId: 'KST-EARLY-MAY-ORD',
      lineItems: [{ listingOptionId: listEarlyMay.listingOption.id, optionId: listEarlyMay.option.id, totalPrice: 50_000 }],
    });

    // Lower boundary: 2026-04-30T14:59:59.999Z = 2026-04-30 23:59:59.999 KST — last ms of April, INCLUDED in April
    await createOrder(prisma, TEST_COMPANY_ID, {
      orderedAt: new Date('2026-04-30T14:59:59.999Z'),
      externalOrderId: 'KST-LATE-APRIL-ORD',
      lineItems: [{ listingOptionId: listLateApril.listingOption.id, optionId: listLateApril.option.id, totalPrice: 77_777 }],
    });

    // April query: in-window + late-April orders (INCLUDED); early-May order (EXCLUDED)
    const aprilResult = await service.findAll(TEST_COMPANY_ID, 2026, 4);

    // LATE-APRIL (sentinel revenue 77_777) MUST appear in April
    const lateAprilRow = aprilResult.find((r) => r.externalId === 'EXT-KST-LATE-APRIL');
    expect(lateAprilRow, 'LATE-APRIL row (last ms of April) should be included in April').toBeDefined();
    expect(lateAprilRow!.revenue).toBe(77_777);

    // EARLY-MAY must NOT appear in April
    const earlyMayInApril = aprilResult.find((r) => r.externalId === 'EXT-KST-EARLY-MAY');
    expect(earlyMayInApril, 'EARLY-MAY row should NOT appear in April').toBeUndefined();

    // Revenue 50_000 (EARLY-MAY sentinel) must not contaminate any April row
    expect(aprilResult.every((r) => r.revenue !== 50_000)).toBe(true);

    // May query: EARLY-MAY (INCLUDED); LATE-APRIL (EXCLUDED)
    const mayResult = await service.findAll(TEST_COMPANY_ID, 2026, 5);

    // EARLY-MAY MUST appear in May
    const earlyMayRow = mayResult.find((r) => r.externalId === 'EXT-KST-EARLY-MAY');
    expect(earlyMayRow, 'EARLY-MAY row should be included in May').toBeDefined();
    expect(earlyMayRow!.revenue).toBe(50_000);

    // LATE-APRIL must NOT appear in May
    const lateAprilInMay = mayResult.find((r) => r.externalId === 'EXT-KST-LATE-APRIL');
    expect(lateAprilInMay, 'LATE-APRIL row should NOT appear in May').toBeUndefined();

    // Revenue 77_777 (LATE-APRIL sentinel) must not contaminate any May row
    expect(mayResult.every((r) => r.revenue !== 77_777)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 5: Empty returns + empty ads → returnCount: 0, adCost: 0
  // ---------------------------------------------------------------------------
  it('Empty returns + empty ad rows → returnCount: 0, adCost: 0 (Map fallback)', async () => {
    const list = await setupListing(prisma, TEST_COMPANY_ID, 'EMPTY-A');

    await createOrder(prisma, TEST_COMPANY_ID, {
      orderedAt: new Date('2026-04-15T00:00:00.000Z'),
      externalOrderId: 'EMPTY-ORD-1',
      lineItems: [{ listingOptionId: list.listingOption.id, optionId: list.option.id, totalPrice: 20_000 }],
    });

    // No OrderReturnLineItem seeded, no Ad seeded
    const result = await service.findAll(TEST_COMPANY_ID, 2026, 4);

    expect(result).toHaveLength(1);
    const row = result[0];

    expect(row.returnCount).toBe(0);
    expect(row.adCost).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Test 6: Null listingOption on ReturnLineItem → skipped; properly wired → counted
  // ---------------------------------------------------------------------------
  it('ReturnLineItem with null orderLineItem.listingOption → skipped; properly wired → returnCount: 1', async () => {
    const list = await setupListing(prisma, TEST_COMPANY_ID, 'NULL-LO');

    const orderedAt = new Date('2026-04-15T00:00:00.000Z');

    // Create the order with a real line item that points to the listing
    const order = await createOrder(prisma, TEST_COMPANY_ID, {
      orderedAt,
      externalOrderId: 'NULL-LO-ORD',
      lineItems: [{ listingOptionId: list.listingOption.id, optionId: list.option.id, totalPrice: 10_000 }],
    });

    // Fetch the real line item id created by createOrder
    const realLineItem = await prisma.orderLineItem.findFirstOrThrow({
      where: { orderId: order.id, listingOptionId: list.listingOption.id },
    });

    // Also create an orphaned order line item with NULL listingOptionId
    const orphanLineItem = await prisma.orderLineItem.create({
      data: {
        companyId: TEST_COMPANY_ID,
        orderId: order.id,
        listingOptionId: null, // intentionally null — no listingOption
        quantity: 1,
        unitPrice: 5_000,
        totalPrice: 5_000,
        externalLineId: 'NULL-LO-LI-ORPHAN',
      },
    });

    // Create one OrderReturn with 2 ReturnLineItems:
    //   ReturnLineItem A: properly wired to real lineItem → should contribute
    //   ReturnLineItem B: wired to orphan lineItem (null listingOptionId) → should be skipped
    const orderReturn = await prisma.orderReturn.create({
      data: {
        companyId: TEST_COMPANY_ID,
        orderId: order.id,
        platform: 'coupang',
        externalReturnId: 'RET-NULL-LO',
        status: 'return_request',
        type: 'RETURN',
        reason: '단순변심',
        faultBy: 'CUSTOMER',
        requesterName: 'Test',
        requestedAt: orderedAt,
      },
    });

    // ReturnLineItem A — properly wired (contributes to returnCount)
    await prisma.orderReturnLineItem.create({
      data: {
        companyId: TEST_COMPANY_ID,
        returnId: orderReturn.id,
        orderLineItemId: realLineItem.id, // real lineItem with listingOptionId → listingId resolves
        productName: 'real item',
        quantity: 1,
      },
    });

    // ReturnLineItem B — orphaned (skipped by aggregation)
    await prisma.orderReturnLineItem.create({
      data: {
        companyId: TEST_COMPANY_ID,
        returnId: orderReturn.id,
        orderLineItemId: orphanLineItem.id, // null listingOptionId → no listingId → skipped
        productName: 'orphaned',
        quantity: 1,
      },
    });

    const result = await service.findAll(TEST_COMPANY_ID, 2026, 4);

    // Only 1 row for the real listing
    const row = result.find((r) => r.externalId === 'EXT-NULL-LO');
    expect(row, 'L1 row for EXT-NULL-LO should exist').toBeDefined();

    // ReturnLineItem A (properly wired) contributes → returnCount: 1
    expect(row!.returnCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Test 7: CEO-C3 latency baseline — 1000 orders × 3 lineItems under 2s
  // ---------------------------------------------------------------------------
  it('handles 1000 orders with 3 lineItems each under 2s (CEO-C3 baseline)', async () => {
    const { listingOption, option, listing } = await setupListing(prisma, TEST_COMPANY_ID, 'PERF-A');

    await seedBulkOrders(prisma, {
      companyId: TEST_COMPANY_ID,
      listingOptionId: listingOption.id,
      optionId: option.id,
      orderCount: 1000,
      lineItemsPerOrder: 3,
      year: 2026,
      month: 4,
    });

    const start = Date.now();
    const result = await service.findAll(TEST_COMPANY_ID, 2026, 4);
    const latencyMs = Date.now() - start;

    expect(result.length).toBeGreaterThan(0);
    expect(result.find((r) => r.listingId === listing.id)).toBeDefined();

    console.log(`[perf] profit-loss 1000 orders / 3 lineItems → ${latencyMs}ms`);

    // CEO-C3: must complete under 2s. If this fails, it exposes a scale issue — do NOT skip.
    expect(latencyMs).toBeLessThan(2000);
  });
});
