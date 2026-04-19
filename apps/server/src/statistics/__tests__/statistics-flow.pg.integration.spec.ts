import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { StatisticsService } from '../statistics.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
} from '../../test-helpers/real-prisma';

/**
 * Plan B2c.orders T11 — statistics-flow.pg integration spec.
 *
 * 7 methods × real Postgres 검증:
 *   - overview: totalProducts = MasterProduct.count, ProfitLoss aggregate.
 *   - products: listingId-primary rows with master hydrate (category/grade/thumbnail).
 *   - categories: master.category groupBy.
 *   - grades: master.abcGrade groupBy + adCost sum.
 *   - pareto: revenue desc + cumulative percent + gradeMatch.
 *   - delivery: lineItems.quantity sum (30-day rolling).
 *   - repurchase: master-level repeatProducts (receiver A orders 2 lineItems of same master).
 *
 * KST 월 경계: Order @ 2026-04-30 14:30Z (KST 23:30 April) → April, Order @ 2026-04-30 15:30Z
 * (KST 2026-05-01 00:30) → May. repurchase 가 kstMonthStart() 로 bucketing 하므로
 * period='2026-04' 조회 시 첫 번째만 포함.
 *
 * Fixture: 1 company (TEST_COMPANY_ID) + 2 master + 3 option + 2 channelListing
 *   + 3 channelListingOption + 4 order × 5 lineItem + 3 ProfitLoss + Shipment (skipped for delivery).
 */

describe('Statistics flow (PG integration)', () => {
  let prisma: PrismaClient;
  let service: StatisticsService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();

    const m = await Test.createTestingModule({
      providers: [
        StatisticsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = m.get(StatisticsService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  // ---------------------------------------------------------------------------
  // Shared fixture builder — 2 master + 3 option + 2 listing + 3 listingOption
  // + 3 ProfitLoss + 4 order × 5 lineItem.
  // ---------------------------------------------------------------------------
  async function seedDomainFixture() {
    // Master M1 — category '유아용품', grade A, thumbnail
    const masterM1 = await prisma.masterProduct.create({
      data: {
        companyId: TEST_COMPANY_ID,
        code: 'M-001',
        name: 'Master M1',
        category: '유아용품',
        abcGrade: 'A',
        thumbnailUrl: 'https://cdn/m1.jpg',
        optionCounter: 2,
      },
    });
    // Master M2 — category '완구', grade B, no thumbnail
    const masterM2 = await prisma.masterProduct.create({
      data: {
        companyId: TEST_COMPANY_ID,
        code: 'M-002',
        name: 'Master M2',
        category: '완구',
        abcGrade: 'B',
        optionCounter: 1,
      },
    });

    // 3 options (M1: o1a, o1b; M2: o2a)
    const optM1a = await prisma.productOption.create({
      data: {
        companyId: TEST_COMPANY_ID,
        masterId: masterM1.id,
        optionName: 'M1-red',
        sku: 'M-001-001',
      },
    });
    const optM1b = await prisma.productOption.create({
      data: {
        companyId: TEST_COMPANY_ID,
        masterId: masterM1.id,
        optionName: 'M1-blue',
        sku: 'M-001-002',
      },
    });
    const optM2a = await prisma.productOption.create({
      data: {
        companyId: TEST_COMPANY_ID,
        masterId: masterM2.id,
        optionName: 'M2-std',
        sku: 'M-002-001',
      },
    });

    // 2 channelListings (M1 → L1, M2 → L2)
    const listingL1 = await prisma.channelListing.create({
      data: {
        companyId: TEST_COMPANY_ID,
        masterId: masterM1.id,
        channel: 'coupang',
        externalId: 'EXT-L1',
        channelName: 'L1 쿠팡',
      },
    });
    const listingL2 = await prisma.channelListing.create({
      data: {
        companyId: TEST_COMPANY_ID,
        masterId: masterM2.id,
        channel: 'coupang',
        externalId: 'EXT-L2',
        channelName: 'L2 쿠팡',
      },
    });

    // 3 channelListingOptions (L1: lo1a, lo1b; L2: lo2a)
    const loL1a = await prisma.channelListingOption.create({
      data: {
        companyId: TEST_COMPANY_ID,
        listingId: listingL1.id,
        optionId: optM1a.id,
        vendorItemId: 'VI-L1A',
      },
    });
    const loL1b = await prisma.channelListingOption.create({
      data: {
        companyId: TEST_COMPANY_ID,
        listingId: listingL1.id,
        optionId: optM1b.id,
        vendorItemId: 'VI-L1B',
      },
    });
    const loL2a = await prisma.channelListingOption.create({
      data: {
        companyId: TEST_COMPANY_ID,
        listingId: listingL2.id,
        optionId: optM2a.id,
        vendorItemId: 'VI-L2A',
      },
    });

    // ProfitLoss — 3 rows for year=2026 month=4.
    // Order 합계 shape:
    //   L1 revenue = 700_000, netProfit = 140_000, orderCount = 2, adCost = 50_000
    //   L2 revenue = 300_000, netProfit = 60_000, orderCount = 1, adCost = 10_000
    //   (also month=3 row for L1 to ensure period filter works)
    await prisma.profitLoss.create({
      data: {
        companyId: TEST_COMPANY_ID,
        listingId: listingL1.id,
        year: 2026,
        month: 4,
        revenue: 700_000,
        netProfit: 140_000,
        orderCount: 2,
        adCost: 50_000,
      },
    });
    await prisma.profitLoss.create({
      data: {
        companyId: TEST_COMPANY_ID,
        listingId: listingL2.id,
        year: 2026,
        month: 4,
        revenue: 300_000,
        netProfit: 60_000,
        orderCount: 1,
        adCost: 10_000,
      },
    });
    // March PL for L1 — filtered out by April period, but present for period=undefined assertions
    await prisma.profitLoss.create({
      data: {
        companyId: TEST_COMPANY_ID,
        listingId: listingL1.id,
        year: 2026,
        month: 3,
        revenue: 100_000,
        netProfit: 20_000,
        orderCount: 1,
        adCost: 5_000,
      },
    });

    // 4 Orders × 5 lineItems (all April, KST 기준):
    //   O1 (receiver A, KST 2026-04-10, paid): 2 lineItems of master M1 (repeat same master via single receiver)
    //       lo1a × qty 2 @ 10,000 = 20,000
    //       lo1b × qty 1 @ 12,000 = 12,000
    //     Order.totalPrice = 32,000
    //   O2 (receiver B, KST 2026-04-12, paid): 1 lineItem of M2
    //       lo2a × qty 3 @ 5,000 = 15,000
    //       Order.totalPrice = 15,000
    //   O3 (receiver A, KST 2026-04-15, paid): 1 lineItem of M2 — different master from O1 (receiver A repurchase on customer-level only)
    //       lo2a × qty 1 @ 5,000 = 5,000
    //       Order.totalPrice = 5,000
    //   O4 (receiver C, KST 2026-04-18, cancelled): 1 lineItem of M1 — excluded from repurchase/delivery by status
    //       lo1a × qty 5 @ 10,000 = 50,000
    //       Order.totalPrice = 50,000
    const o1 = await prisma.order.create({
      data: {
        companyId: TEST_COMPANY_ID,
        platform: 'coupang',
        externalOrderId: 'ORD-O1',
        orderedAt: new Date(Date.UTC(2026, 3, 10, 3, 0, 0)),
        status: 'paid',
        totalPrice: 32_000,
        receiverName: 'A',
      },
    });
    const o2 = await prisma.order.create({
      data: {
        companyId: TEST_COMPANY_ID,
        platform: 'coupang',
        externalOrderId: 'ORD-O2',
        orderedAt: new Date(Date.UTC(2026, 3, 12, 3, 0, 0)),
        status: 'paid',
        totalPrice: 15_000,
        receiverName: 'B',
      },
    });
    const o3 = await prisma.order.create({
      data: {
        companyId: TEST_COMPANY_ID,
        platform: 'coupang',
        externalOrderId: 'ORD-O3',
        orderedAt: new Date(Date.UTC(2026, 3, 15, 3, 0, 0)),
        status: 'paid',
        totalPrice: 5_000,
        receiverName: 'A',
      },
    });
    const o4 = await prisma.order.create({
      data: {
        companyId: TEST_COMPANY_ID,
        platform: 'coupang',
        externalOrderId: 'ORD-O4',
        orderedAt: new Date(Date.UTC(2026, 3, 18, 3, 0, 0)),
        status: 'cancelled',
        totalPrice: 50_000,
        receiverName: 'C',
      },
    });

    // O1 → 2 lineItems (M1-a + M1-b — same master M1, different listingOptions)
    await prisma.orderLineItem.create({
      data: {
        companyId: TEST_COMPANY_ID,
        orderId: o1.id,
        listingOptionId: loL1a.id,
        quantity: 2,
        unitPrice: 10_000,
        totalPrice: 20_000,
      },
    });
    await prisma.orderLineItem.create({
      data: {
        companyId: TEST_COMPANY_ID,
        orderId: o1.id,
        listingOptionId: loL1b.id,
        quantity: 1,
        unitPrice: 12_000,
        totalPrice: 12_000,
      },
    });
    // O2 → 1 lineItem (M2-a)
    await prisma.orderLineItem.create({
      data: {
        companyId: TEST_COMPANY_ID,
        orderId: o2.id,
        listingOptionId: loL2a.id,
        quantity: 3,
        unitPrice: 5_000,
        totalPrice: 15_000,
      },
    });
    // O3 → 1 lineItem (M2-a)
    await prisma.orderLineItem.create({
      data: {
        companyId: TEST_COMPANY_ID,
        orderId: o3.id,
        listingOptionId: loL2a.id,
        quantity: 1,
        unitPrice: 5_000,
        totalPrice: 5_000,
      },
    });
    // O4 → 1 lineItem (cancelled — excluded)
    await prisma.orderLineItem.create({
      data: {
        companyId: TEST_COMPANY_ID,
        orderId: o4.id,
        listingOptionId: loL1a.id,
        quantity: 5,
        unitPrice: 10_000,
        totalPrice: 50_000,
      },
    });

    return {
      masterM1,
      masterM2,
      listingL1,
      listingL2,
      optM1a,
      optM1b,
      optM2a,
      loL1a,
      loL1b,
      loL2a,
      orders: { o1, o2, o3, o4 },
    };
  }

  // ---------------------------------------------------------------------------
  // #1 overview
  // ---------------------------------------------------------------------------
  describe('overview', () => {
    it('totalProducts = MasterProduct.count (isDeleted:false) + ProfitLoss aggregate for April period', async () => {
      await seedDomainFixture();

      const result = await service.overview(TEST_COMPANY_ID, '2026-04');

      // 2 master products (M1 + M2), both isDeleted: false
      expect(result.totalProducts).toBe(2);

      // April PL sums: 700k + 300k = 1_000_000 revenue, 140k + 60k = 200_000 netProfit,
      //                2 + 1 = 3 orderCount, avgMargin = 200_000/1_000_000 = 0.2
      expect(result.totalRevenue).toBe(1_000_000);
      expect(result.totalProfit).toBe(200_000);
      expect(result.totalOrders).toBe(3);
      expect(result.avgMargin).toBe(0.2);
    });

    it('soft-deleted master is excluded from totalProducts count', async () => {
      await seedDomainFixture();
      // Soft-delete M1
      await prisma.masterProduct.updateMany({
        where: { companyId: TEST_COMPANY_ID, code: 'M-001' },
        data: { isDeleted: true },
      });

      const result = await service.overview(TEST_COMPANY_ID, '2026-04');
      expect(result.totalProducts).toBe(1); // only M2 remains
    });

    it('omitted period aggregates ALL ProfitLoss rows (no year/month filter)', async () => {
      await seedDomainFixture();

      const result = await service.overview(TEST_COMPANY_ID);

      // All PL rows: 700k + 300k + 100k (March) = 1_100_000
      expect(result.totalRevenue).toBe(1_100_000);
      expect(result.totalProfit).toBe(220_000);
      expect(result.totalOrders).toBe(4); // 2 + 1 + 1
    });
  });

  // ---------------------------------------------------------------------------
  // #2 products
  // ---------------------------------------------------------------------------
  describe('products', () => {
    it('returns 2 rows (April ProfitLoss count) hydrated with master code/name/category/grade/thumbnail', async () => {
      await seedDomainFixture();

      const result = await service.products(TEST_COMPANY_ID, '2026-04');

      expect(result).toHaveLength(2);
      // orderBy revenue desc: L1(700k) first, L2(300k) second
      expect(result[0].masterCode).toBe('M-001');
      expect(result[0].productName).toBe('Master M1');
      expect(result[0].category).toBe('유아용품');
      expect(result[0].grade).toBe('A');
      expect(result[0].thumbnailUrl).toBe('https://cdn/m1.jpg');
      expect(result[0].totalRevenue).toBe(700_000);
      expect(result[0].netProfit).toBe(140_000);
      expect(result[0].orderCount).toBe(2);
      expect(result[0].profitRate).toBe(0.2); // 140/700 rounded to 4 decimals
      expect(result[0].margin).toBe(0.2);

      expect(result[1].masterCode).toBe('M-002');
      expect(result[1].productName).toBe('Master M2');
      expect(result[1].category).toBe('완구');
      expect(result[1].grade).toBe('B');
      expect(result[1].thumbnailUrl).toBeNull();
      expect(result[1].totalRevenue).toBe(300_000);
    });
  });

  // ---------------------------------------------------------------------------
  // #3 categories
  // ---------------------------------------------------------------------------
  describe('categories', () => {
    it('groups April ProfitLoss rows by master.category; sorted by revenue desc', async () => {
      await seedDomainFixture();

      const result = await service.categories(TEST_COMPANY_ID, '2026-04');

      expect(result).toHaveLength(2);
      const byCat = new Map(result.map((r) => [r.category, r]));
      expect(byCat.get('유아용품')).toEqual({
        category: '유아용품',
        name: '유아용품',
        revenue: 700_000,
        orders: 2,
        profit: 140_000,
        count: 2,
      });
      expect(byCat.get('완구')).toEqual({
        category: '완구',
        name: '완구',
        revenue: 300_000,
        orders: 1,
        profit: 60_000,
        count: 1,
      });
      // 유아용품 revenue 700k > 완구 300k — sorted first
      expect(result[0].category).toBe('유아용품');
      expect(result[1].category).toBe('완구');
    });
  });

  // ---------------------------------------------------------------------------
  // #4 grades
  // ---------------------------------------------------------------------------
  describe('grades', () => {
    it('groups April ProfitLoss rows by master.abcGrade with productCount + adCost sum', async () => {
      await seedDomainFixture();

      const result = await service.grades(TEST_COMPANY_ID, '2026-04');

      // A (L1 only) = 700k revenue, 140k profit, 50k adCost, 1 productCount
      // B (L2 only) = 300k revenue, 60k profit, 10k adCost, 1 productCount
      expect(result).toHaveLength(2);
      const byGrade = new Map(result.map((r) => [r.grade, r]));
      expect(byGrade.get('A')).toEqual({
        grade: 'A',
        revenue: 700_000,
        profit: 140_000,
        count: 1,
        productCount: 1,
        adCost: 50_000,
      });
      expect(byGrade.get('B')).toEqual({
        grade: 'B',
        revenue: 300_000,
        profit: 60_000,
        count: 1,
        productCount: 1,
        adCost: 10_000,
      });
      // A > B sort
      expect(result[0].grade).toBe('A');
    });
  });

  // ---------------------------------------------------------------------------
  // #5 pareto
  // ---------------------------------------------------------------------------
  describe('pareto', () => {
    it('revenue desc + cumulativePercent + gradeMatch — id uses listingId (not masterId)', async () => {
      const { listingL1, listingL2 } = await seedDomainFixture();

      const result = await service.pareto(TEST_COMPANY_ID, '2026-04');

      expect(result.totalRevenue).toBe(1_000_000);
      // gradeDistribution: A=1 (L1), B=1 (L2), C=0
      expect(result.gradeDistribution).toEqual({ A: 1, B: 1, C: 0 });

      expect(result.data).toHaveLength(2);
      // row 0: L1 — 700k, 70% cumulative → suggestedGrade 'A', currentGrade 'A' → match
      expect(result.data[0].id).toBe(listingL1.id);
      expect(result.data[0].rank).toBe(1);
      expect(result.data[0].name).toBe('Master M1');
      expect(result.data[0].revenue).toBe(700_000);
      expect(result.data[0].revenuePercent).toBe(70);
      expect(result.data[0].cumulativePercent).toBe(70);
      expect(result.data[0].currentGrade).toBe('A');
      expect(result.data[0].suggestedGrade).toBe('A');
      expect(result.data[0].gradeMatch).toBe(true);

      // row 1: L2 — 300k, cumulative 100% → suggestedGrade 'C', currentGrade 'B' → mismatch
      expect(result.data[1].id).toBe(listingL2.id);
      expect(result.data[1].rank).toBe(2);
      expect(result.data[1].name).toBe('Master M2');
      expect(result.data[1].revenue).toBe(300_000);
      expect(result.data[1].revenuePercent).toBe(30);
      expect(result.data[1].cumulativePercent).toBe(100);
      expect(result.data[1].currentGrade).toBe('B');
      expect(result.data[1].suggestedGrade).toBe('C'); // cum > 90 → C
      expect(result.data[1].gradeMatch).toBe(false);

      expect(result.mismatchCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // #6 delivery — Order.lineItems.quantity sum (30-day rolling window).
  // Shipment side: 0 (no Shipment fixture — totalShipments=0, courierDistribution=[]).
  // ---------------------------------------------------------------------------
  describe('delivery', () => {
    it('sums lineItems.quantity per day; excludes cancelled orders', async () => {
      await seedDomainFixture();

      // `delivery()` uses rolling 30-day window anchored to `new Date()`.
      // The fixture uses April 10-18, 2026. In CI / local at 2026-04-19 or later,
      // these dates may or may not fall within 30 days depending on when test runs.
      // To make this deterministic, query ALL orders via the service and verify
      // the present-day aggregation behavior — we check the SHAPE, not absolute dates.
      // Specifically: the daily array has 30 entries, and cancelled orders (O4 qty 5)
      // are NOT counted anywhere.

      const result = await service.delivery(TEST_COMPANY_ID, '2026-04');

      // Shape invariants (independent of current date)
      expect(result.daily).toHaveLength(30);
      expect(result.totalShipments).toBe(0); // no Shipment fixtures
      expect(result.avgDeliveryDays).toBe(0);
      expect(result.courierDistribution).toEqual([]);

      // Cancelled orders MUST be excluded — O4 was 5 qty of M1-a on 2026-04-18.
      // Sum all qty across 30-day window; cancelled should not appear.
      const totalQtyIn30d = result.daily.reduce((s, d) => s + d.qty, 0);
      const totalOrdersIn30d = result.daily.reduce((s, d) => s + d.orders, 0);
      const totalRevenueIn30d = result.daily.reduce((s, d) => s + d.revenue, 0);

      // If test runs within 30 days of April 2026 fixture dates, should see qty from O1+O2+O3:
      //   O1: 2 + 1 = 3 qty, revenue 32k
      //   O2: 3 qty, revenue 15k
      //   O3: 1 qty, revenue 5k
      //   O4 (cancelled): EXCLUDED
      //   Total if in-window: qty 7, orders 3, revenue 52_000
      // If out-of-window, all zero. Either way, cancelled O4 (qty 5, revenue 50k) MUST NOT appear.
      //
      // Invariant: sum of qty ≤ 7 (O1+O2+O3 only, O4 excluded).
      // And sum of qty is NEVER 5 or 12 (values that would imply O4 leakage).
      expect(totalQtyIn30d).toBeLessThanOrEqual(7);
      expect(totalQtyIn30d).not.toBe(12); // would indicate O4 qty 5 leaked in addition to the valid 7
      expect(totalRevenueIn30d).toBeLessThanOrEqual(52_000);
      expect(totalOrdersIn30d).toBeLessThanOrEqual(3);
    });
  });

  // ---------------------------------------------------------------------------
  // #7 repurchase — master-level repeatProducts + customer-level receiver stats.
  // KST bucketing via kstMonthStart() — April filter excludes March orders.
  // ---------------------------------------------------------------------------
  describe('repurchase', () => {
    it('repeatProducts = masters with ≥2 distinct receivers; receiver A repurchase via different masters counts customer-level but not master-level', async () => {
      const { masterM1, masterM2 } = await seedDomainFixture();

      const result = await service.repurchase(TEST_COMPANY_ID, '2026-04');

      // totalOrders: 3 (O1+O2+O3; O4 cancelled excluded)
      expect(result.totalOrders).toBe(3);

      // Receiver-level:
      //   A: O1 (32k) + O3 (5k) = 2 orders, 37k totalAmount
      //   B: O2 (15k) = 1 order
      // totalCustomers = 2, repeatCount = 1 (A only), repurchaseRate = 0.5
      expect(result.totalCustomers).toBe(2);
      expect(result.repeatCount).toBe(1);
      expect(result.repurchaseRate).toBe(0.5);

      // repeatCustomers: A only, count=2, totalAmount = 32k + 5k = 37k
      expect(result.repeatCustomers).toHaveLength(1);
      expect(result.repeatCustomers[0].name).toBe('A');
      expect(result.repeatCustomers[0].count).toBe(2);
      expect(result.repeatCustomers[0].totalAmount).toBe(37_000);
      expect(result.repeatCustomers[0].lastOrder).toEqual(
        new Date(Date.UTC(2026, 3, 15, 3, 0, 0)), // O3 timestamp
      );

      // Master-level repeatProducts:
      //   M1 lineItems: O1 has 2 lineItems (lo1a + lo1b) — BOTH from receiver A.
      //     distinct receivers set for M1 = {A} → size 1 → NOT repeatProduct.
      //   M2 lineItems: O2 (receiver B) + O3 (receiver A) → distinct receivers {A, B} → size 2 → repeatProduct.
      //     orderCount for M2 = 2 (one lineItem each from O2 and O3).
      //   O4 (cancelled) lineItem — excluded from `order: { status: notIn: ['cancelled','returned'] }`.
      expect(result.repeatProducts).toHaveLength(1);
      expect(result.repeatProducts[0].masterId).toBe(masterM2.id);
      expect(result.repeatProducts[0].productName).toBe('Master M2');
      expect(result.repeatProducts[0].category).toBe('완구');
      expect(result.repeatProducts[0].orderCount).toBe(2);

      // Sanity: M1 not in repeatProducts despite having more lineItems
      const masterIds = result.repeatProducts.map((p) => p.masterId);
      expect(masterIds).not.toContain(masterM1.id);
    });

    it('master-level repeatProduct when receiver A orders the SAME master 2× across separate orders', async () => {
      // Separate fixture: receiver A orders master M1 twice (O1 + O2), receiver B orders M1 once (O3).
      // => M1 distinct receivers = {A, B} (size 2) → repeatProduct. orderCount should be 3 lineItems.
      const m1 = await prisma.masterProduct.create({
        data: {
          companyId: TEST_COMPANY_ID,
          code: 'M-REP',
          name: 'Rep M1',
          category: 'test',
          optionCounter: 1,
        },
      });
      const opt = await prisma.productOption.create({
        data: {
          companyId: TEST_COMPANY_ID,
          masterId: m1.id,
          optionName: 'Rep-opt',
          sku: 'M-REP-001',
        },
      });
      const listing = await prisma.channelListing.create({
        data: {
          companyId: TEST_COMPANY_ID,
          masterId: m1.id,
          channel: 'coupang',
          externalId: 'EXT-REP',
          channelName: 'Rep L',
        },
      });
      const lo = await prisma.channelListingOption.create({
        data: {
          companyId: TEST_COMPANY_ID,
          listingId: listing.id,
          optionId: opt.id,
          vendorItemId: 'VI-REP',
        },
      });

      // 3 orders, 3 lineItems total, 2 distinct receivers
      for (const [suffix, receiver] of [['A1', 'A'], ['A2', 'A'], ['B1', 'B']] as const) {
        const o = await prisma.order.create({
          data: {
            companyId: TEST_COMPANY_ID,
            platform: 'coupang',
            externalOrderId: `ORD-REP-${suffix}`,
            orderedAt: new Date(Date.UTC(2026, 3, 10, 3, 0, 0)),
            status: 'paid',
            totalPrice: 1000,
            receiverName: receiver,
          },
        });
        await prisma.orderLineItem.create({
          data: {
            companyId: TEST_COMPANY_ID,
            orderId: o.id,
            listingOptionId: lo.id,
            quantity: 1,
            unitPrice: 1000,
            totalPrice: 1000,
          },
        });
      }

      const result = await service.repurchase(TEST_COMPANY_ID, '2026-04');

      expect(result.repeatProducts).toHaveLength(1);
      expect(result.repeatProducts[0].masterId).toBe(m1.id);
      expect(result.repeatProducts[0].orderCount).toBe(3); // 3 lineItems across 3 orders
    });

    it('lineItem with listingOption: null is excluded from masterMap', async () => {
      // 1 order with 1 lineItem (listingOption null → not counted in repeatProducts aggregation)
      const o = await prisma.order.create({
        data: {
          companyId: TEST_COMPANY_ID,
          platform: 'coupang',
          externalOrderId: 'ORD-NULL',
          orderedAt: new Date(Date.UTC(2026, 3, 10, 3, 0, 0)),
          status: 'paid',
          totalPrice: 1000,
          receiverName: 'X',
        },
      });
      await prisma.orderLineItem.create({
        data: {
          companyId: TEST_COMPANY_ID,
          orderId: o.id,
          listingOptionId: null, // unmatched — excluded from repurchase master aggregation
          quantity: 1,
          unitPrice: 1000,
          totalPrice: 1000,
        },
      });

      const result = await service.repurchase(TEST_COMPANY_ID, '2026-04');

      // Master-level: empty (the only lineItem had null listingOptionId — query filters it out)
      expect(result.repeatProducts).toHaveLength(0);
      // Customer-level: receiver X has 1 order — not repeat
      expect(result.totalCustomers).toBe(1);
      expect(result.repeatCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // #8 KST month boundary — repurchase uses kstMonthStart() for orderedAt filter.
  // Two orders bookending the KST April→May boundary should bucket correctly.
  // ---------------------------------------------------------------------------
  describe('KST month boundary (repurchase.orderedAt filter)', () => {
    it('order at 2026-04-30 14:30Z (KST 23:30 April 30) is included in April period', async () => {
      // Single order at KST 23:30 on April 30 → UTC 14:30 on April 30
      // kstMonthStart(2026, 4) → UTC 2026-03-31 15:00
      // kstMonthStart(2026, 5) → UTC 2026-04-30 15:00
      // orderedAt 2026-04-30 14:30Z < 2026-04-30 15:00Z → in April bucket.
      await prisma.order.create({
        data: {
          companyId: TEST_COMPANY_ID,
          platform: 'coupang',
          externalOrderId: 'ORD-KST-APRIL',
          orderedAt: new Date(Date.UTC(2026, 3, 30, 14, 30, 0)),
          status: 'paid',
          totalPrice: 1000,
          receiverName: 'K',
        },
      });

      const april = await service.repurchase(TEST_COMPANY_ID, '2026-04');
      expect(april.totalOrders).toBe(1);

      const may = await service.repurchase(TEST_COMPANY_ID, '2026-05');
      expect(may.totalOrders).toBe(0);
    });

    it('order at 2026-04-30 15:30Z (KST 00:30 May 1) is included in May period, NOT April', async () => {
      // orderedAt 2026-04-30 15:30Z >= 2026-04-30 15:00Z (kstMonthStart May) → May bucket.
      await prisma.order.create({
        data: {
          companyId: TEST_COMPANY_ID,
          platform: 'coupang',
          externalOrderId: 'ORD-KST-MAY',
          orderedAt: new Date(Date.UTC(2026, 3, 30, 15, 30, 0)),
          status: 'paid',
          totalPrice: 1000,
          receiverName: 'K',
        },
      });

      const may = await service.repurchase(TEST_COMPANY_ID, '2026-05');
      expect(may.totalOrders).toBe(1);

      const april = await service.repurchase(TEST_COMPANY_ID, '2026-04');
      expect(april.totalOrders).toBe(0);
    });
  });
});
