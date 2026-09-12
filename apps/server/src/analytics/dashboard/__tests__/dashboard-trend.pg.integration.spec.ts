import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { DashboardTrendService } from '../application/service/dashboard-trend.service';
import { DashboardTrendRepositoryAdapter } from '../adapter/out/repository/dashboard-trend.repository.adapter';
import { WingTrafficAggregationRepositoryAdapter } from '../adapter/out/repository/wing-traffic-aggregation.repository.adapter';
import { ProfitCalculationRepositoryAdapter } from '../adapter/out/repository/profit-calculation.repository.adapter';
import { PrismaService } from '../../../prisma/prisma.service';
import { PROFIT_CALCULATION_REPOSITORY_PORT } from '../application/port/out/repository/profit-calculation.repository.port';
import { DASHBOARD_TREND_REPOSITORY_PORT } from '../application/port/out/repository/dashboard-trend.repository.port';
import { WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT } from '../application/port/out/repository/wing-traffic-aggregation.repository.port';
import { AD_TRAFFIC_READ_PORT } from '../../../advertising/application/port/in/ad-traffic-source.port';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
  IDOR_SENTINEL,
} from '../../../test-helpers/real-prisma';
import {
  setupMaster,
  setupProductOption,
  setupChannelListing,
  seedOrderWithLineItems,
  seedAd,
} from '../../../test-helpers/finance-seeds';
import type { PrismaClient } from '@prisma/client';
import { buildDashboardContext } from '../domain/context';

describe('DashboardTrendService.getTrend (PG integration)', () => {
  let prisma: PrismaClient;
  let service: DashboardTrendService;
  const trafficRead = { readPublished: vi.fn() };

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const m = await Test.createTestingModule({
      providers: [
        DashboardTrendService,
        DashboardTrendRepositoryAdapter,
        WingTrafficAggregationRepositoryAdapter,
        ProfitCalculationRepositoryAdapter,
        { provide: PrismaService, useValue: prisma },
        { provide: PROFIT_CALCULATION_REPOSITORY_PORT, useExisting: ProfitCalculationRepositoryAdapter },
        { provide: DASHBOARD_TREND_REPOSITORY_PORT, useExisting: DashboardTrendRepositoryAdapter },
        { provide: WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT, useExisting: WingTrafficAggregationRepositoryAdapter },
        { provide: AD_TRAFFIC_READ_PORT, useValue: trafficRead },
      ],
    }).compile();
    service = m.get(DashboardTrendService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    trafficRead.readPublished.mockResolvedValue({
      channelAccountId: '00000000-0000-4000-8000-000000000001',
      rows: [],
      dashboard: null,
      plan: { businessDate: '1970-01-01' },
    });
  });

  /**
   * Seed a TEST listing + a single yesterday order with given lineItem totalPrice
   * and optional ad spend on the same date.
   */
  async function seedTestListingWithYesterdayOrder(opts: {
    suffix: string;
    lineItemTotalPrice: number;
    /** Used as Order.totalPrice deliberately — sentinel for I3 fix verification. */
    orderTotalPriceOverride?: number;
    costPrice?: number;
    adSpend?: number;
  }) {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { id: masterId } = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: `M-T-${opts.suffix}`, name: `Master T-${opts.suffix}`,
    });
    const { id: optionId } = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      sku: `SKU-T-${opts.suffix}`, costPrice: opts.costPrice ?? 0, commissionRate: 0,
    });
    const { listingId, listingOptionId } = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      channel: 'coupang', externalId: `EXT-T-${opts.suffix}`,
      optionId, externalOptionId: `VI-T-${opts.suffix}`,
    });
    const listing = await prisma.channelListing.findUniqueOrThrow({
      where: { id: listingId },
      select: { channelAccountId: true },
    });

    if (opts.orderTotalPriceOverride !== undefined) {
      // Bypass helper to set Order.totalPrice independently of lineItem totals.
      const order = await prisma.order.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: listing.channelAccountId,
          externalOrderId: `TREND-T-${opts.suffix}`,
          orderedAt: yesterday,
          status: 'paid',
          totalPrice: opts.orderTotalPriceOverride,
          shippingPrice: 0,
        },
      });
      await prisma.orderLineItem.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          orderId: order.id,
          listingOptionId,
          quantity: 1,
          unitPrice: opts.lineItemTotalPrice,
          totalPrice: opts.lineItemTotalPrice,
          externalLineId: `LI-${order.id}-0`,
        },
      });
    } else {
      await seedOrderWithLineItems(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: `TREND-T-${opts.suffix}`,
        orderedAt: yesterday.toISOString(),
        shippingPrice: 0,
        lineItems: [{ quantity: 1, totalPrice: opts.lineItemTotalPrice, optionId, listingOptionId }],
      });
    }

    if (opts.adSpend !== undefined) {
      await seedAd(prisma, {
        organizationId: TEST_ORGANIZATION_ID, listingId,
        date: yesterday.toISOString().slice(0, 10), spend: opts.adSpend,
      });
    }
    return { listingId, optionId, listingOptionId };
  }

  it('T1: TEST sees only TEST rows — OTHER sentinel never leaks', async () => {
    await seedTestListingWithYesterdayOrder({ suffix: '1', lineItemTotalPrice: 30_000 });
    // OTHER sentinel
    const oM = await setupMaster(prisma, { organizationId: OTHER_ORGANIZATION_ID, code: 'M-O-1', name: 'OM' });
    const oO = await setupProductOption(prisma, { organizationId: OTHER_ORGANIZATION_ID, masterId: oM.id, sku: 'SKU-O-1' });
    const oL = await setupChannelListing(prisma, {
      organizationId: OTHER_ORGANIZATION_ID, masterId: oM.id,
      channel: 'coupang', externalId: 'EXT-O-1', optionId: oO.id, externalOptionId: 'VI-O-1',
    });
    await seedOrderWithLineItems(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
      externalOrderId: 'TREND-O-1',
      orderedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: IDOR_SENTINEL, optionId: oO.id, listingOptionId: oL.listingOptionId }],
    });
    await seedAd(prisma, {
      organizationId: OTHER_ORGANIZATION_ID, listingId: oL.listingId,
      date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10), spend: IDOR_SENTINEL,
    });

    const result = await service.getTrend(buildDashboardContext(), TEST_ORGANIZATION_ID, '30d');
    for (const row of result) {
      expect(row.revenue).not.toBe(IDOR_SENTINEL);
      expect(row.adCost).not.toBe(IDOR_SENTINEL);
    }
    const yesterdayRow = result.find((r) => r.revenue === 30_000);
    expect(yesterdayRow).toBeDefined();
  });

  it('T2: OTHER sees only OTHER — TEST does not leak', async () => {
    await seedTestListingWithYesterdayOrder({ suffix: '2', lineItemTotalPrice: 30_000 });
    const oM = await setupMaster(prisma, { organizationId: OTHER_ORGANIZATION_ID, code: 'M-O-2', name: 'OM' });
    const oO = await setupProductOption(prisma, { organizationId: OTHER_ORGANIZATION_ID, masterId: oM.id, sku: 'SKU-O-2' });
    const oL = await setupChannelListing(prisma, {
      organizationId: OTHER_ORGANIZATION_ID, masterId: oM.id,
      channel: 'coupang', externalId: 'EXT-O-2', optionId: oO.id, externalOptionId: 'VI-O-2',
    });
    await seedOrderWithLineItems(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
      externalOrderId: 'TREND-O-2',
      orderedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: IDOR_SENTINEL, optionId: oO.id, listingOptionId: oL.listingOptionId }],
    });

    const result = await service.getTrend(buildDashboardContext(), OTHER_ORGANIZATION_ID, '30d');
    for (const row of result) {
      expect(row.revenue).not.toBe(30_000);
    }
    expect(result.find((r) => r.revenue === IDOR_SENTINEL)).toBeDefined();
  });

  it('T3: fresh organization → selected dates remain explicitly empty', async () => {
    const result = await service.getTrend(buildDashboardContext(), TEST_ORGANIZATION_ID, '7d');
    expect(result).toHaveLength(7);
    expect(result.every((row) => row.revenue === null && row.adCost === null && row.profit === null)).toBe(true);
  });

  it('T4: uses line-item revenue and complete same-date costs, not order total or a range margin', async () => {
    // Sentinel: Order.totalPrice = 999_999_999 vs lineItem.totalPrice = 100_000.
    // Pre-fix would aggregate Order.totalPrice → revenue = 999M.
    // Post-fix aggregates lineItem.totalPrice → revenue = 100k.
    // Every non-ad cost must be explicit, including confirmed zero shipping.
    const { listingId, listingOptionId } = await seedTestListingWithYesterdayOrder({
      suffix: '4',
      lineItemTotalPrice: 100_000,
      orderTotalPriceOverride: 999_999_999,
      costPrice: 70_000,
    });
    await prisma.channelListingOption.update({
      where: { id: listingOptionId, organizationId: TEST_ORGANIZATION_ID },
      data: { shippingCost: 0 },
    });
    // The sweep visited yesterday and found no advertising: a measured zero.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingId,
      date: new Date(yesterday.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10),
      spend: 0,
    });

    const result = await service.getTrend(buildDashboardContext(), TEST_ORGANIZATION_ID, '30d');
    const yesterdayRow = result.find((r) => r.revenue === 100_000);
    expect(yesterdayRow).toBeDefined();
    expect(yesterdayRow?.profit).toBe(30_000);
    // Critical assertion: revenue is NOT the bogus Order.totalPrice
    for (const row of result) {
      expect(row.revenue).not.toBe(999_999_999);
    }
  });

  it('T5: Wing-only v2 trend keeps profit unavailable instead of synthesizing revenue minus ad cost', async () => {
    const businessDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const businessDateOnly = new Date(Date.UTC(
      businessDate.getFullYear(),
      businessDate.getMonth(),
      businessDate.getDate(),
    ));
    const dateKey = businessDateOnly.toISOString().slice(0, 10);
    const { id: masterId } = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      code: 'M-T-WING',
      name: 'Wing-only Master',
    });
    const { id: optionId } = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId,
      sku: 'SKU-T-WING',
    });
    const { listingId } = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId,
      channel: 'coupang',
      externalId: 'EXT-T-WING',
      optionId,
      externalOptionId: 'VI-T-WING',
    });
    const listing = await prisma.channelListing.findUniqueOrThrow({
      where: { id: listingId },
      select: { channelAccountId: true },
    });

    await prisma.channelListingDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId,
        channel: 'coupang',
        externalId: 'EXT-T-WING',
        businessDate: businessDateOnly,
        trafficVisitors: 20,
        trafficOrders: 4,
        trafficSalesQty: 4,
        trafficRevenue: 120_000,
      },
    });
    const trafficPublication = {
      channelAccountId: listing.channelAccountId,
      attemptId: '00000000-0000-4000-8000-000000000002',
      plan: {
        sourceType: 'coupang_wing_traffic',
        parserVersion: 'wing-traffic-daily-v2',
        channelAccountId: listing.channelAccountId,
        expectedAdvertiserId: 'VENDOR-A',
        providerVendorId: 'VENDOR-A',
        startDate: dateKey,
        endDate: dateKey,
        businessDate: dateKey,
        periodDays: 1,
        expectedDates: [dateKey],
        filterScope: 'ALL_NORMAL_RFM',
        targetUrl: null,
      },
      providerVendorId: 'VENDOR-A',
      filterScope: 'ALL_NORMAL_RFM',
      accountDaily: [{
        businessDate: dateKey,
        observedAt: '2026-09-06T01:00:00.000Z',
        sourceAttemptId: '00000000-0000-4000-8000-000000000002',
        providerConversionRate: null,
        visitors: 20,
        views: 0,
        cartAdds: 0,
        orders: 4,
        salesQty: 4,
        revenue: 120_000,
      }],
      optionDaily: [],
      periodSummary: null,
      coverage: {
        from: dateKey,
        to: dateKey,
        targetDays: 1,
        completedDays: 1,
        missingDates: [],
      },
      reconciliation: Object.fromEntries([
        'views', 'cartAdds', 'orders', 'salesQty', 'revenue',
      ].map((metric) => [metric, { status: 'UNVERIFIED', dailySum: null, periodValue: null }])),
      legacyExactPeriodEvidence: null,
    };
    trafficRead.readPublished.mockImplementation(async (input: { from?: string; to?: string }) => {
      if ((input.from && dateKey < input.from) || (input.to && dateKey > input.to)) {
        return { ...trafficPublication, accountDaily: [] };
      }
      return trafficPublication;
    });
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingId,
      date: dateKey,
      spend: 30_000,
      revenue: 90_000,
      impressions: 1000,
      clicks: 50,
      conversions: 3,
      orders: 3,
    });

    const result = await service.getTrend(buildDashboardContext(), TEST_ORGANIZATION_ID, '30d');
    const wingRow = result.find((r) => r.date === dateKey);

    expect(wingRow).toMatchObject({
      revenue: 120_000,
      adCost: 30_000,
      profit: null,
    });
  });
});
