import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { periodBasisStatus } from '@kiditem/shared/dashboard';
import { StatisticsService } from '../statistics.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  IDOR_SENTINEL,
  OTHER_ORGANIZATION_ID,
  TEST_ORGANIZATION_ID,
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
} from '../../../test-helpers/real-prisma';
import {
  seedAd,
  seedCompletedAdSweepRun,
  seedOrderWithLineItems,
  seedCompletedOrderCollection,
  setupChannelListing,
  setupMaster,
  setupProductOption,
} from '../../../test-helpers/finance-seeds';
import { seedPublishedProductAbcGrades } from '../../../products/__tests__/test-helpers/published-product-abc';

describe('Statistics flow (PG integration)', () => {
  let prisma: PrismaClient;
  let service: StatisticsService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();

    const moduleRef = await Test.createTestingModule({
      providers: [
        StatisticsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(StatisticsService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  /**
   * Two graded products on Coupang, April orders, an April campaign sweep
   * and an Orders collection declaring it collected April through
   * `orderCoverageEnd`.
   */
  async function seedStatisticsFixture(
    organizationId = TEST_ORGANIZATION_ID,
    orderCoverageEnd = '2026-04-30',
  ) {
    const prefix = organizationId === TEST_ORGANIZATION_ID ? 'TEST' : 'OTHER';

    const { id: masterM1 } = await setupMaster(prisma, {
      organizationId,
      code: `${prefix}-M-001`,
      name: `${prefix} Master M1`,
      category: '유아용품',
      abcGrade: null,
      thumbnailUrl: 'https://cdn/m1.jpg',
    });
    const { id: masterM2 } = await setupMaster(prisma, {
      organizationId,
      code: `${prefix}-M-002`,
      name: `${prefix} Master M2`,
      category: '완구',
      abcGrade: null,
    });
    await seedPublishedProductAbcGrades(prisma, {
      organizationId,
      grades: [
        { masterProductId: masterM1, abcGrade: 'A' },
        { masterProductId: masterM2, abcGrade: 'B' },
      ],
    });

    const { id: optM1a } = await setupProductOption(prisma, {
      organizationId,
      masterId: masterM1,
      sku: `${prefix}-SKU-M1A`,
      costPrice: 5_000,
      commissionRate: 0.1,
    });
    const { id: optM1b } = await setupProductOption(prisma, {
      organizationId,
      masterId: masterM1,
      sku: `${prefix}-SKU-M1B`,
      costPrice: 4_000,
      commissionRate: 0.1,
    });
    const { id: optM2a } = await setupProductOption(prisma, {
      organizationId,
      masterId: masterM2,
      sku: `${prefix}-SKU-M2A`,
      costPrice: 2_000,
      commissionRate: 0.1,
    });

    const listingL1 = await setupChannelListing(prisma, {
      organizationId,
      masterId: masterM1,
      channel: 'coupang',
      externalId: `${prefix}-EXT-L1`,
      channelName: `${prefix} L1`,
      optionId: optM1a,
      externalOptionId: `${prefix}-VI-L1A`,
    });
    const listingL1b = await prisma.channelListingOption.create({
      data: {
        organizationId,
        listingId: listingL1.listingId,
        externalOptionId: `${prefix}-VI-L1B`,
        costPriceOverride: 4_000,
        commissionRate: 0.1,
        otherCost: 0,
      },
      select: { id: true },
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId,
        channelListingOptionId: listingL1b.id,
        sellpiaInventorySkuId: optM1b,
        quantity: 1,
      },
    });
    await prisma.channelListingOption.update({
      where: { id: listingL1.listingOptionId },
      data: { costPriceOverride: 5_000 },
    });
    const listingL2 = await setupChannelListing(prisma, {
      organizationId,
      masterId: masterM2,
      channel: 'coupang',
      externalId: `${prefix}-EXT-L2`,
      channelName: `${prefix} L2`,
      optionId: optM2a,
      externalOptionId: `${prefix}-VI-L2A`,
    });

    const o1 = await seedOrderWithLineItems(prisma, {
      organizationId,
      externalOrderId: `${prefix}-ORD-1`,
      orderedAt: '2026-04-10T03:00:00Z',
      shippingPrice: 0,
      lineItems: [
        { quantity: 2, totalPrice: 20_000, optionId: optM1a, listingOptionId: listingL1.listingOptionId },
        { quantity: 1, totalPrice: 12_000, optionId: optM1b, listingOptionId: listingL1b.id },
      ],
    });
    await prisma.order.update({
      where: { id: o1 },
      data: { receiverName: 'A', totalPrice: 999_999 },
    });

    const o2 = await seedOrderWithLineItems(prisma, {
      organizationId,
      externalOrderId: `${prefix}-ORD-2`,
      orderedAt: '2026-04-12T03:00:00Z',
      shippingPrice: 0,
      lineItems: [
        { quantity: 3, totalPrice: 15_000, optionId: optM2a, listingOptionId: listingL2.listingOptionId },
      ],
    });
    await prisma.order.update({
      where: { id: o2 },
      data: { receiverName: 'B', totalPrice: 999_999 },
    });

    const o3 = await seedOrderWithLineItems(prisma, {
      organizationId,
      externalOrderId: `${prefix}-ORD-3`,
      orderedAt: '2026-04-15T03:00:00Z',
      shippingPrice: 0,
      lineItems: [
        { quantity: 1, totalPrice: 5_000, optionId: optM2a, listingOptionId: listingL2.listingOptionId },
      ],
    });
    await prisma.order.update({
      where: { id: o3 },
      data: { receiverName: 'A', totalPrice: 999_999 },
    });

    const o4 = await seedOrderWithLineItems(prisma, {
      organizationId,
      externalOrderId: `${prefix}-ORD-4`,
      orderedAt: '2026-04-18T03:00:00Z',
      shippingPrice: 0,
      status: 'cancelled',
      lineItems: [
        { quantity: 5, totalPrice: 50_000, optionId: optM1a, listingOptionId: listingL1.listingOptionId },
      ],
    });
    await prisma.order.update({ where: { id: o4 }, data: { receiverName: 'C' } });

    const o5 = await seedOrderWithLineItems(prisma, {
      organizationId,
      externalOrderId: `${prefix}-ORD-5`,
      orderedAt: '2026-04-30T15:30:00Z',
      shippingPrice: 0,
      lineItems: [
        { quantity: 1, totalPrice: 9_000, optionId: optM1a, listingOptionId: listingL1.listingOptionId },
      ],
    });
    await prisma.order.update({ where: { id: o5 }, data: { receiverName: 'D' } });

    const runId = await seedCompletedAdSweepRun(prisma, {
      organizationId,
      generation: 1,
      window: { startDate: '2026-04-01', endDate: '2026-04-30' },
    });
    await seedAd(prisma, {
      organizationId,
      listingId: listingL1.listingId,
      date: '2026-04-15',
      spend: 3_000,
      runId,
    });
    await seedAd(prisma, {
      organizationId,
      listingId: listingL2.listingId,
      date: '2026-04-15',
      spend: 1_000,
      runId,
    });

    await seedCompletedOrderCollection(prisma, {
      organizationId,
      startDate: '2026-04-01', endDate: orderCoverageEnd,
      orderIds: [o1, o2, o3, o4, o5],
    });

    return {
      masterM1,
      masterM2,
      listingL1: listingL1.listingId,
      listingL2: listingL2.listingId,
    };
  }

  it('overview publishes the collected month totals with a complete basis', async () => {
    await seedStatisticsFixture();

    const result = await service.overview(TEST_ORGANIZATION_ID, '2026-04', AFTER_APRIL);

    expect(result).toMatchObject({
      totalRevenue: 52_000,
      totalOrders: 3,
      totalProfit: 20_800,
      avgMargin: 0.4,
      totalProducts: 2,
    });
    expect(result.basis).not.toBeNull();
    for (const basis of [result.basis!.revenue, result.basis!.adCost, result.basis!.profit]) {
      expect(periodBasisStatus(basis)).toBe('complete');
    }
  });

  it('products hydrates master metadata and keeps ratio-based profitRate semantics', async () => {
    const { masterM1, masterM2, listingL1, listingL2 } = await seedStatisticsFixture();

    const result = await service.products(TEST_ORGANIZATION_ID, '2026-04', AFTER_APRIL);

    expect(result.rows).toEqual([
      {
        listingId: listingL1,
        externalId: 'TEST-EXT-L1',
        channelName: 'TEST L1',
        masterId: masterM1,
        masterCode: 'TEST-M-001',
        productName: 'TEST Master M1',
        category: '유아용품',
        grade: 'A',
        thumbnailUrl: 'https://cdn/m1.jpg',
        totalRevenue: 32_000,
        netProfit: 11_800,
        orderCount: 1,
        profitRate: 0.3688,
        margin: 0.3688,
      },
      {
        listingId: listingL2,
        externalId: 'TEST-EXT-L2',
        channelName: 'TEST L2',
        masterId: masterM2,
        masterCode: 'TEST-M-002',
        productName: 'TEST Master M2',
        category: '완구',
        grade: 'B',
        thumbnailUrl: null,
        totalRevenue: 20_000,
        netProfit: 9_000,
        orderCount: 2,
        profitRate: 0.45,
        margin: 0.45,
      },
    ]);
    expect(periodBasisStatus(result.basis!.profit)).toBe('complete');
  });

  it('categories and grades reduce live metrics instead of snapshot rows', async () => {
    await seedStatisticsFixture();

    const [categories, grades] = await Promise.all([
      service.categories(TEST_ORGANIZATION_ID, '2026-04', AFTER_APRIL),
      service.grades(TEST_ORGANIZATION_ID, '2026-04', AFTER_APRIL),
    ]);

    expect(categories.rows).toEqual([
      { category: '유아용품', name: '유아용품', revenue: 32_000, orders: 1, profit: 11_800, count: 1 },
      { category: '완구', name: '완구', revenue: 20_000, orders: 2, profit: 9_000, count: 2 },
    ]);
    expect(grades.rows).toEqual([
      { grade: 'A', revenue: 32_000, profit: 11_800, count: 1, productCount: 1, adCost: 3_000 },
      { grade: 'B', revenue: 20_000, profit: 9_000, count: 1, productCount: 1, adCost: 1_000 },
    ]);
    expect(periodBasisStatus(categories.basis!.revenue)).toBe('complete');
    expect(periodBasisStatus(grades.basis!.adCost)).toBe('complete');
  });

  it('pareto sorts by live revenue and exposes neutral revenue bands', async () => {
    const { listingL1, listingL2 } = await seedStatisticsFixture();

    const result = await service.pareto(TEST_ORGANIZATION_ID, '2026-04', AFTER_APRIL);

    expect(result.totalRevenue).toBe(52_000);
    expect(result.bandDistribution).toEqual({ top70: 1, next20: 0, tail10: 1 });
    expect(result.data).toEqual([
      {
        id: listingL1,
        rank: 1,
        name: 'TEST Master M1',
        paretoBand: 'top70',
        revenue: 32_000,
        revenuePercent: 61.5,
        cumulativePercent: 61.5,
      },
      {
        id: listingL2,
        rank: 2,
        name: 'TEST Master M2',
        paretoBand: 'tail10',
        revenue: 20_000,
        revenuePercent: 38.5,
        cumulativePercent: 100,
      },
    ]);
  });

  it('repurchase keeps receiver-level and listing-level behavior on current schema', async () => {
    const { listingL1, listingL2 } = await seedStatisticsFixture();

    const result = await service.repurchase(TEST_ORGANIZATION_ID, '2026-04', AFTER_APRIL);

    expect(result).toMatchObject({
      totalCustomers: 2,
      repeatCount: 1,
      repurchaseRate: 0.5,
      totalOrders: 3,
      repeatProducts: [
        {
          masterId: listingL2,
          productName: 'TEST Master M2',
          category: '완구',
          orderCount: 2,
        },
      ],
      repeatCustomers: [
        {
          name: 'A',
          count: 2,
          totalAmount: 37_000,
          lastOrder: new Date('2026-04-15T03:00:00.000Z'),
        },
      ],
    });
    expect(result.repeatProducts.map((item) => item.masterId)).not.toContain(listingL1);
    expect(periodBasisStatus(result.basis!.orders)).toBe('complete');
  });

  it('repurchase includes an imported listing without a component mapping', async () => {
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Active Wing account',
        externalAccountId: 'WING-ACCOUNT-REPURCHASE',
        status: 'active',
      },
      select: { id: true },
    });
    const importRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'coupang_wing_catalog',
        channelAccountId: account.id,
        fileName: 'wing-products-repurchase.xlsx',
        fileHash: 'wing-products-repurchase',
        status: 'completed',
        rowCount: 1,
        importedAt: new Date('2026-04-14T00:00:00.000Z'),
      },
      select: { id: true },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: 'EXT-UNLINKED-REPURCHASE',
        channelName: 'Wing import only',
        status: 'active',
        lastImportRunId: importRun.id,
      },
      select: { id: true },
    });
    const listingOption = await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        externalOptionId: 'VI-UNLINKED-REPURCHASE',
        lastImportRunId: importRun.id,
      },
      select: { id: true },
    });

    for (const [index, receiverName] of ['A', 'B'].entries()) {
      const order = await prisma.order.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: account.id,
          externalOrderId: `REPURCHASE-UNLINKED-${index + 1}`,
          orderedAt: new Date(`2026-04-${15 + index}T03:00:00.000Z`),
          status: 'accepted',
          shippingPrice: 0,
          totalPrice: 10_000,
          receiverName,
        },
        select: { id: true },
      });
      await prisma.orderLineItem.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          orderId: order.id,
          listingOptionId: listingOption.id,
          productName: 'Wing import only',
          quantity: 1,
          unitPrice: 10_000,
          totalPrice: 10_000,
          externalLineId: `LI-UNLINKED-REPURCHASE-${index + 1}`,
        },
      });
    }

    await seedCompletedOrderCollection(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      startDate: '2026-04-01', endDate: '2026-04-30',
      orderIds: (await prisma.order.findMany({
        where: { organizationId: TEST_ORGANIZATION_ID }, select: { id: true },
      })).map((order) => order.id),
    });

    const result = await service.repurchase(TEST_ORGANIZATION_ID, '2026-04', AFTER_APRIL);

    expect(result.repeatProducts).toEqual([
      {
        masterId: listing.id,
        productName: 'Wing import only',
        category: null,
        orderCount: 2,
      },
    ]);
  });

  it('never leaks other-organization live metrics into the requested tenant', async () => {
    await seedStatisticsFixture(TEST_ORGANIZATION_ID);
    const other = await seedStatisticsFixture(OTHER_ORGANIZATION_ID);
    await seedAd(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
      listingId: other.listingL1,
      date: '2026-04-16',
      spend: IDOR_SENTINEL,
    });
    const otherOptionId = await prisma.channelListingOption.findFirstOrThrow({
      where: { organizationId: OTHER_ORGANIZATION_ID, listingId: other.listingL1 },
      select: { id: true },
    }).then((row) => row.id);
    await seedOrderWithLineItems(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
      externalOrderId: 'OTHER-SENTINEL',
      orderedAt: '2026-04-16T03:00:00Z',
      shippingPrice: 0,
      lineItems: [
        { quantity: 1, totalPrice: IDOR_SENTINEL, optionId: otherOptionId, listingOptionId: otherOptionId },
      ],
    });

    const result = await service.products(TEST_ORGANIZATION_ID, '2026-04', AFTER_APRIL);

    expect(result.rows).toHaveLength(2);
    for (const row of result.rows) {
      expect(row.totalRevenue).not.toBe(IDOR_SENTINEL);
      expect(row.netProfit).not.toBe(IDOR_SENTINEL);
    }
  });

  /**
   * KID-77 leftover — an explicit period must not publish totals counted from
   * a partly collected Orders window.
   */
  it('publishes no window totals for an explicit period the Orders collection covered only in part', async () => {
    await seedStatisticsFixture(TEST_ORGANIZATION_ID, '2026-04-14');

    const [overview, products, pareto, repurchase] = await Promise.all([
      service.overview(TEST_ORGANIZATION_ID, '2026-04', AFTER_APRIL),
      service.products(TEST_ORGANIZATION_ID, '2026-04', AFTER_APRIL),
      service.pareto(TEST_ORGANIZATION_ID, '2026-04', AFTER_APRIL),
      service.repurchase(TEST_ORGANIZATION_ID, '2026-04', AFTER_APRIL),
    ]);

    expect(overview).toMatchObject({
      totalRevenue: null,
      totalOrders: null,
      totalProfit: null,
      avgMargin: null,
      totalProducts: 2,
    });
    expect(overview.basis!.revenue.includedDates).toHaveLength(14);
    expect(periodBasisStatus(overview.basis!.revenue)).toBe('partial');

    // Collected lines stay visible with that basis; a profit that would pair
    // a whole-month ad cost with fourteen days of orders does not.
    expect(products.rows).toHaveLength(2);
    for (const row of products.rows) {
      expect(row).toMatchObject({ netProfit: null, profitRate: null, margin: null });
    }

    expect(pareto.totalRevenue).toBeNull();
    expect(pareto.bandDistribution).toBeNull();
    for (const item of pareto.data) {
      expect(item).toMatchObject({ revenuePercent: null, cumulativePercent: null, paretoBand: null });
    }

    expect(repurchase).toMatchObject({
      totalCustomers: null,
      repeatCount: null,
      repurchaseRate: null,
      totalOrders: null,
    });
    expect(periodBasisStatus(repurchase.basis!.orders)).toBe('partial');
  });

  it('publishes no ratio over zero revenue', async () => {
    const { id: masterId } = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: 'ZERO-M', name: 'Zero revenue product',
    });
    const { id: optionId } = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId, sku: 'ZERO-SKU', costPrice: 5_000, commissionRate: 0.1,
    });
    const listing = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId, channel: 'naver',
      externalId: 'ZERO-EXT', optionId, externalOptionId: 'ZERO-VI',
    });
    const orderId = await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'ZERO-ORD',
      orderedAt: '2026-04-10T03:00:00Z',
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: 0, optionId, listingOptionId: listing.listingOptionId }],
    });
    await seedCompletedOrderCollection(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      startDate: '2026-04-01', endDate: '2026-04-30', orderIds: [orderId],
    });

    const [overview, products, pareto] = await Promise.all([
      service.overview(TEST_ORGANIZATION_ID, '2026-04', AFTER_APRIL),
      service.products(TEST_ORGANIZATION_ID, '2026-04', AFTER_APRIL),
      service.pareto(TEST_ORGANIZATION_ID, '2026-04', AFTER_APRIL),
    ]);

    expect(overview).toMatchObject({
      totalRevenue: 0, totalOrders: 1, totalProfit: -5_000, avgMargin: null,
    });
    expect(products.rows[0]).toMatchObject({
      totalRevenue: 0, netProfit: -5_000, profitRate: null, margin: null,
    });
    expect(pareto.totalRevenue).toBe(0);
    expect(pareto.bandDistribution).toBeNull();
    expect(pareto.data[0]).toMatchObject({
      revenuePercent: null, cumulativePercent: null, paretoBand: null,
    });
  });

  it('publishes no repurchase rate for a collected month without customers', async () => {
    await seedCompletedOrderCollection(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      startDate: '2026-04-01', endDate: '2026-04-30', orderIds: [],
    });

    const result = await service.repurchase(TEST_ORGANIZATION_ID, '2026-04', AFTER_APRIL);

    expect(result).toMatchObject({
      totalCustomers: 0,
      repeatCount: 0,
      repurchaseRate: null,
      totalOrders: 0,
      repeatProducts: [],
      repeatCustomers: [],
    });
    expect(periodBasisStatus(result.basis!.orders)).toBe('complete');
  });

  /** A moment after April has closed in KST. */
  const AFTER_APRIL = new Date('2026-06-01T00:00:00.000Z');
  /** 12:00 KST on 15 April: 1–14 April are closed. */
  const MID_APRIL = new Date('2026-04-15T03:00:00.000Z');
  /** 12:00 KST on 1 April: no April day is closed. */
  const APRIL_FIRST = new Date('2026-04-01T03:00:00.000Z');

  it('evaluates the month containing today over its closed days only', async () => {
    await seedStatisticsFixture();

    const [overview, repurchase] = await Promise.all([
      service.overview(TEST_ORGANIZATION_ID, '2026-04', MID_APRIL),
      service.repurchase(TEST_ORGANIZATION_ID, '2026-04', MID_APRIL),
    ]);

    // Orders of 10 and 12 April are closed; the order of 15 April was placed today.
    expect(overview).toMatchObject({
      totalRevenue: 47_000,
      totalOrders: 2,
      totalProfit: 22_300,
      avgMargin: 0.4745,
    });
    expect(overview.basis!.requestedWindow).toEqual({ from: '2026-04-01', to: '2026-04-30' });
    expect(overview.basis!.revenue).toMatchObject({ from: '2026-04-01', to: '2026-04-14', targetDays: 14 });
    expect(periodBasisStatus(overview.basis!.profit)).toBe('complete');

    expect(repurchase).toMatchObject({
      totalCustomers: 2,
      repeatCount: 0,
      repurchaseRate: 0,
      totalOrders: 2,
      repeatCustomers: [],
    });
    expect(repurchase.basis!.requestedWindow).toEqual({ from: '2026-04-01', to: '2026-04-30' });
    expect(repurchase.basis!.orders).toMatchObject({ from: '2026-04-01', to: '2026-04-14', targetDays: 14 });
  });

  it('publishes no totals on the 1st, when no day of the month has closed', async () => {
    await seedStatisticsFixture();

    const [overview, products] = await Promise.all([
      service.overview(TEST_ORGANIZATION_ID, '2026-04', APRIL_FIRST),
      service.products(TEST_ORGANIZATION_ID, '2026-04', APRIL_FIRST),
    ]);

    expect(overview).toMatchObject({
      totalRevenue: null, totalOrders: null, totalProfit: null, avgMargin: null,
    });
    expect(overview.basis!.requestedWindow).toEqual({ from: '2026-04-01', to: '2026-04-30' });
    expect(overview.basis!.revenue).toMatchObject({
      from: '2026-04-01', to: '2026-03-31', targetDays: 0, includedDates: [],
    });
    expect(products.rows).toEqual([]);
  });

  /** KID-85 review P2-3 — group totals follow the same coverage rule as the overview. */
  it('categories and grades publish no group totals for an explicit period the Orders collection covered only in part', async () => {
    await seedStatisticsFixture(TEST_ORGANIZATION_ID, '2026-04-14');

    const [categories, grades] = await Promise.all([
      service.categories(TEST_ORGANIZATION_ID, '2026-04', AFTER_APRIL),
      service.grades(TEST_ORGANIZATION_ID, '2026-04', AFTER_APRIL),
    ]);

    expect(categories.rows).toEqual([
      { category: '유아용품', name: '유아용품', revenue: null, orders: null, profit: null, count: null },
      { category: '완구', name: '완구', revenue: null, orders: null, profit: null, count: null },
    ]);
    expect(grades.rows).toEqual([
      { grade: 'A', revenue: null, profit: null, count: null, productCount: null, adCost: null },
      { grade: 'B', revenue: null, profit: null, count: null, productCount: null, adCost: null },
    ]);
    expect(periodBasisStatus(categories.basis!.revenue)).toBe('partial');
    expect(periodBasisStatus(grades.basis!.revenue)).toBe('partial');

    // The same collection covers every closed day of the month containing today.
    const [openCategories, openGrades] = await Promise.all([
      service.categories(TEST_ORGANIZATION_ID, '2026-04', MID_APRIL),
      service.grades(TEST_ORGANIZATION_ID, '2026-04', MID_APRIL),
    ]);

    expect(openCategories.rows).toEqual([
      { category: '유아용품', name: '유아용품', revenue: 32_000, orders: 1, profit: 14_800, count: 1 },
      { category: '완구', name: '완구', revenue: 15_000, orders: 1, profit: 7_500, count: 1 },
    ]);
    expect(openGrades.rows).toEqual([
      { grade: 'A', revenue: 32_000, profit: 14_800, count: 1, productCount: 1, adCost: 0 },
      { grade: 'B', revenue: 15_000, profit: 7_500, count: 1, productCount: 1, adCost: 0 },
    ]);
    expect(periodBasisStatus(openCategories.basis!.revenue)).toBe('complete');
    expect(openGrades.basis!.revenue).toMatchObject({ from: '2026-04-01', to: '2026-04-14', targetDays: 14 });
  });

  /** KID-85 follow-up P3-11 — an omitted period is the KST month containing now, as on every finance screen. */
  it('defaults an omitted period to the KST month containing now, not the whole order history', async () => {
    await seedStatisticsFixture();

    const [overview, repurchase] = await Promise.all([
      service.overview(TEST_ORGANIZATION_ID, undefined, MID_APRIL),
      service.repurchase(TEST_ORGANIZATION_ID, undefined, MID_APRIL),
    ]);

    expect(overview).toMatchObject({ totalRevenue: 47_000, totalOrders: 2, totalProfit: 22_300 });
    expect(overview.basis!.requestedWindow).toEqual({ from: '2026-04-01', to: '2026-04-30' });
    expect(overview.basis!.revenue).toMatchObject({ from: '2026-04-01', to: '2026-04-14', targetDays: 14 });
    expect(repurchase.basis!.requestedWindow).toEqual({ from: '2026-04-01', to: '2026-04-30' });

    // On 1 June KST no June day has closed; April's orders are not June's.
    const june = await service.overview(TEST_ORGANIZATION_ID, undefined, AFTER_APRIL);

    expect(june).toMatchObject({
      totalRevenue: null, totalOrders: null, totalProfit: null, avgMargin: null, totalProducts: 2,
    });
    expect(june.basis!.requestedWindow).toEqual({ from: '2026-06-01', to: '2026-06-30' });
    expect(june.basis!.revenue).toMatchObject({ targetDays: 0, includedDates: [] });
  });
});
