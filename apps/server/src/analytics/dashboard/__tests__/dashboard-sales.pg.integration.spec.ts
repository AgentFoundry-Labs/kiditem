import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH,
} from '@kiditem/shared/product-abc';
import { DashboardSalesService } from '../application/service/dashboard-sales.service';
import { buildDashboardContext } from '../domain/context';
import { DashboardSalesRepositoryAdapter } from '../adapter/out/repository/dashboard-sales.repository.adapter';
import { WingTrafficAggregationRepositoryAdapter } from '../adapter/out/repository/wing-traffic-aggregation.repository.adapter';
import { ProfitCalculationRepositoryAdapter } from '../adapter/out/repository/profit-calculation.repository.adapter';
import { WingAdSummaryRepositoryAdapter } from '../adapter/out/repository/wing-ad-summary.repository.adapter';
import { PrismaService } from '../../../prisma/prisma.service';
import { PROFIT_CALCULATION_REPOSITORY_PORT } from '../application/port/out/repository/profit-calculation.repository.port';
import { WING_AD_SUMMARY_REPOSITORY_PORT } from '../application/port/out/repository/wing-ad-summary.repository.port';
import { DASHBOARD_SALES_REPOSITORY_PORT } from '../application/port/out/repository/dashboard-sales.repository.port';
import { WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT } from '../application/port/out/repository/wing-traffic-aggregation.repository.port';
import { AD_ACCOUNT_DAILY_KPI_READ_PORT } from '../../../advertising/application/port/in/ad-account-daily-kpi-source.port';
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
} from '../../../test-helpers/finance-seeds';
import type { PrismaClient } from '@prisma/client';

describe('DashboardSalesService.getSummary (PG integration)', () => {
  let prisma: PrismaClient;
  let service: DashboardSalesService;
  const trafficRead = { readPublished: vi.fn() };

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const m = await Test.createTestingModule({
      providers: [
        DashboardSalesService,
        DashboardSalesRepositoryAdapter,
        WingTrafficAggregationRepositoryAdapter,
        ProfitCalculationRepositoryAdapter,
        WingAdSummaryRepositoryAdapter,
        { provide: PrismaService, useValue: prisma },
        { provide: PROFIT_CALCULATION_REPOSITORY_PORT, useExisting: ProfitCalculationRepositoryAdapter },
        { provide: WING_AD_SUMMARY_REPOSITORY_PORT, useExisting: WingAdSummaryRepositoryAdapter },
        { provide: DASHBOARD_SALES_REPOSITORY_PORT, useExisting: DashboardSalesRepositoryAdapter },
        { provide: WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT, useExisting: WingTrafficAggregationRepositoryAdapter },
        {
          provide: AD_ACCOUNT_DAILY_KPI_READ_PORT,
          useValue: {
            readPublished: async () => ({
              channelAccountId: '00000000-0000-4000-8000-000000000001',
              rows: [],
            }),
          },
        },
        { provide: AD_TRAFFIC_READ_PORT, useValue: trafficRead },
      ],
    }).compile();
    service = m.get(DashboardSalesService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    trafficRead.readPublished.mockResolvedValue({
      channelAccountId: '00000000-0000-0000-0000-000000000001',
      rows: [],
      dashboard: null,
      plan: { businessDate: '1970-01-01' },
    });
  });

  /**
   * Helper: create a single seeded master+listing+option for current month.
   * Returns IDs for further per-order seeding.
   */
  async function seedTestListing(suffix: string) {
    const { id: masterId } = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: `M-T-${suffix}`, name: `Master T-${suffix}`, abcGrade: 'A',
    });
    const { id: optionId } = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      sku: `SKU-T-${suffix}`, costPrice: 50_000, commissionRate: 0.1, otherCost: 0,
    });
    const { listingId, listingOptionId } = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      channel: 'coupang', externalId: `EXT-T-${suffix}`, channelName: '쿠팡',
      optionId, externalOptionId: `VI-T-${suffix}`,
    });
    return { masterId, optionId, listingId, listingOptionId };
  }

  function midMonth(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 15, 3, 0, 0);
  }

  it('T1: baseline monthly — single order, math verified', async () => {
    const { optionId, listingOptionId } = await seedTestListing('1');
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'SALES-T-1',
      orderedAt: midMonth().toISOString(),
      shippingPrice: 10_000,
      lineItems: [{ quantity: 1, totalPrice: 100_000, optionId, listingOptionId }],
    });

    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_ORGANIZATION_ID);

    expect(result.monthly.revenue).toBe(100_000);
    expect(result.monthly.profit).toBe(30_000);             // 100k - 50k - 10k - 10k - 0 - 0
    expect(result.monthly.adRate).toBe(0);                  // no ad
    expect(result.profitDetail?.netProfit).toBe(30_000);
    expect(result.profitDetail?.commission).toBe(10_000);
    expect(result.profitDetail?.shippingCost).toBe(10_000);
    expect(result.planAchievement).toBeNull();
  });

  it('T2: IDOR isolation — OTHER sentinel never leaks into TEST', async () => {
    const t = await seedTestListing('2');
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'SALES-T-2',
      orderedAt: midMonth().toISOString(),
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: 1_000, optionId: t.optionId, listingOptionId: t.listingOptionId }],
    });

    // OTHER sentinel
    const oMaster = await setupMaster(prisma, { organizationId: OTHER_ORGANIZATION_ID, code: 'M-O-2', name: 'Other M2' });
    const oOption = await setupProductOption(prisma, {
      organizationId: OTHER_ORGANIZATION_ID, masterId: oMaster.id, sku: 'SKU-O-2', costPrice: 0, commissionRate: 0,
    });
    const oListing = await setupChannelListing(prisma, {
      organizationId: OTHER_ORGANIZATION_ID, masterId: oMaster.id,
      channel: 'coupang', externalId: 'EXT-O-2',
      optionId: oOption.id, externalOptionId: 'VI-O-2',
    });
    await seedOrderWithLineItems(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
      externalOrderId: 'SALES-O-2',
      orderedAt: midMonth().toISOString(),
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: IDOR_SENTINEL, optionId: oOption.id, listingOptionId: oListing.listingOptionId }],
    });

    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_ORGANIZATION_ID);

    expect(result.monthly.revenue).toBe(1_000);
    expect(result.monthly.revenue).not.toBe(IDOR_SENTINEL);
    expect(result.today.revenue).not.toBe(IDOR_SENTINEL);
    for (const tp of result.topProducts) {
      expect(tp.revenue).not.toBe(IDOR_SENTINEL);
    }
  });

  it('T3: rangeKpi reflects week window when range=week', async () => {
    const { optionId, listingOptionId } = await seedTestListing('3');
    // Seed an order 3 days ago (inside week window)
    const recent = new Date();
    recent.setDate(recent.getDate() - 3);
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'SALES-T-3',
      orderedAt: recent.toISOString(),
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: 50_000, optionId, listingOptionId }],
    });

    const ctx = buildDashboardContext('week');
    const result = await service.getSummary(ctx, TEST_ORGANIZATION_ID);

    expect(result.rangeKpi).toBeDefined();
    expect(result.rangeKpi?.range).toBe('week');
    expect(result.rangeKpi?.revenue).toBe(50_000);
  });

  it('T4: empty organization returns unavailable values (no error)', async () => {
    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_ORGANIZATION_ID);

    expect(result.monthly).toMatchObject({
      revenue: null,
      profit: null,
      adRate: null,
      prevRevenue: null,
      prevProfit: null,
      revenueChange: null,
      profitChange: null,
      prevAdRate: null,
      available: false,
      previousAvailable: false,
    });
    expect(result.topProducts).toEqual([]);
    expect(result.monthlyTrend).toHaveLength(6); // 6 months loop always emits 6 entries
    expect(result.monthlyTrend.every((t) => (
      t.revenue === null && t.profit === null && t.adCost === null
    ))).toBe(true);
    expect(result.profitDetail?.revenue).toBe(0);
    expect(result.trafficKpi?.adSummary).toBeNull();
    expect(result.lastSyncAt).toBeNull();
  });

  it('T4b: complete v2 Wing monthlyTrend keeps profit unavailable without settlement data', async () => {
    const { listingId } = await seedTestListing('4B');
    const now = new Date();
    const businessDate = new Date(Date.UTC(
      now.getFullYear(),
      now.getMonth(),
      Math.max(1, now.getDate() - 1),
    ));
    await prisma.channelListingDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId,
        channel: 'coupang',
        externalId: 'EXT-T-4B',
        businessDate,
        trafficVisitors: 30,
        trafficOrders: 6,
        trafficSalesQty: 6,
        trafficRevenue: 120_000,
      },
    });
    const trafficDate = businessDate.toISOString().slice(0, 10);
    const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    // The owner source is complete only through the latest closed KST
    // business day. Do not manufacture future zero rows merely to make a
    // current-month range look complete.
    const latestClosedDate = new Date(Date.UTC(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 1,
    ));
    const monthLastDate = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0));
    const monthEnd = latestClosedDate < monthLastDate ? latestClosedDate : monthLastDate;
    const monthDates: string[] = [];
    for (const cursor = new Date(monthStart); cursor <= monthEnd; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      monthDates.push(cursor.toISOString().slice(0, 10));
    }
    const trafficPublication = {
      channelAccountId: '00000000-0000-4000-8000-000000000001',
      attemptId: '00000000-0000-4000-8000-000000000002',
      plan: {
        sourceType: 'coupang_wing_traffic',
        parserVersion: 'wing-traffic-daily-v2',
        channelAccountId: '00000000-0000-4000-8000-000000000001',
        expectedAdvertiserId: 'VENDOR-A',
        providerVendorId: 'VENDOR-A',
        startDate: monthDates[0],
        endDate: monthDates.at(-1),
        businessDate: monthDates.at(-1),
        periodDays: monthDates.length,
        expectedDates: monthDates,
        filterScope: 'ALL_NORMAL_RFM',
        targetUrl: null,
      },
      providerVendorId: 'VENDOR-A',
      filterScope: 'ALL_NORMAL_RFM',
      accountDaily: monthDates.map((date) => ({
        businessDate: date,
        observedAt: `${date}T15:00:00.000Z`,
        sourceAttemptId: '00000000-0000-4000-8000-000000000002',
        providerConversionRate: null,
        visitors: date === trafficDate ? 30 : 0,
        views: date === trafficDate ? 100 : 0,
        cartAdds: 0,
        orders: date === trafficDate ? 6 : 0,
        salesQty: date === trafficDate ? 6 : 0,
        revenue: date === trafficDate ? 120_000 : 0,
      })),
      optionDaily: [],
      periodSummary: null,
      coverage: {
        from: monthDates[0],
        to: monthDates.at(-1),
        targetDays: monthDates.length,
        completedDays: monthDates.length,
        missingDates: [],
      },
      reconciliation: Object.fromEntries([
        'views', 'cartAdds', 'orders', 'salesQty', 'revenue',
      ].map((metric) => [metric, { status: 'UNVERIFIED', dailySum: null, periodValue: null }])),
      legacyExactPeriodEvidence: null,
    };
    // The owner publication is accountDaily v2. The listing snapshot above is
    // deliberately retained as a legacy/linked row and must not be used for
    // account coverage or revenue.
    trafficRead.readPublished.mockResolvedValue(trafficPublication);

    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_ORGANIZATION_ID);
    const currentPeriod = `${ctx.year}-${String(ctx.month).padStart(2, '0')}`;
    const currentTrend = result.monthlyTrend.find((row) => row.period === currentPeriod);

    expect(result.effectivePeriod?.revenueSource).toBe('wing');
    expect(currentTrend).toMatchObject({
      revenue: 120_000,
      profit: null,
      adCost: null,
    });
  });

  it('T5: Wing override flows through trafficKpi.adSummary + lastSyncAt', async () => {
    // Hard rewrite Phase H3b — wing dashboard ad-summary now lives in
    // ChannelAccountDailyKpiSnapshot(source='wing', kpiType='wing_dashboard').
    const { listingId } = await seedTestListing('5');
    const listing = await prisma.channelListing.findUniqueOrThrow({
      where: { id: listingId },
      select: { channelAccountId: true },
    });
    const now = new Date();
    const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const businessDate = new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
    );
    await prisma.channelAccountDailyKpiSnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: listing.channelAccountId,
        channel: 'coupang',
        source: 'wing',
        kpiType: 'wing_dashboard',
        businessDate,
        normalizedJson: {
          startDate: monthStartStr,
          adSummary: { adGmv: '7777', adSpend: '2222' },
        },
        lastObservedAt: now,
        firstObservedAt: now,
      },
    });

    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_ORGANIZATION_ID);

    expect(result.trafficKpi?.adSummary).toMatchObject({ adGmv: '7777', adSpend: '2222' });
    expect(result.trafficKpi?.source).toBe('wing');
    expect(result.lastSyncAt).not.toBeNull();
  });

  it('T6: topProducts ranks by revenue DESC, capped at 10', async () => {
    // Seed 12 listings × 1 order each, decreasing revenue 12000, 11000, ..., 1000
    for (let i = 1; i <= 12; i++) {
      const { id: masterId } = await setupMaster(prisma, {
        organizationId: TEST_ORGANIZATION_ID, code: `M-T-TOP-${i}`, name: `Top ${i}`, abcGrade: i <= 4 ? 'A' : i <= 8 ? 'B' : 'C',
      });
      const { id: optionId } = await setupProductOption(prisma, {
        organizationId: TEST_ORGANIZATION_ID, masterId, sku: `SKU-T-TOP-${i}`, costPrice: 0, commissionRate: 0,
      });
      const { listingOptionId } = await setupChannelListing(prisma, {
        organizationId: TEST_ORGANIZATION_ID, masterId,
        channel: 'coupang', externalId: `EXT-T-TOP-${i}`, channelName: `채널${i}`,
        optionId, externalOptionId: `VI-T-TOP-${i}`,
      });
      await seedOrderWithLineItems(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: `SALES-T-TOP-${i}`,
        orderedAt: midMonth().toISOString(),
        shippingPrice: 0,
        lineItems: [{ quantity: 1, totalPrice: (13 - i) * 1_000, optionId, listingOptionId }],
      });
    }

    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_ORGANIZATION_ID);

    expect(result.topProducts).toHaveLength(10);
    expect(result.topProducts[0].revenue).toBe(12_000);
    expect(result.topProducts[9].revenue).toBe(3_000);
    expect(result.topProducts[0].name).toBe('Top 1');
    expect(result.topProducts[0].organization).toBe('채널1');     // ChannelListing.channelName

    // KNOWN APPROXIMATION assertion (critic MAJOR #2):
    // Top-N rows always carry profitRate=30.0 and netProfit=round(revenue*0.3).
    // If this assertion fails, someone replaced the approximation — update release
    // note + remove this guard.
    expect(result.topProducts[0].profitRate).toBe(30.0);
    expect(result.topProducts[0].netProfit).toBe(Math.round(12_000 * 0.3));
  });

  it('keeps an unclassified stored MasterProduct grade null in Top Products', async () => {
    const master = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      code: 'M-T-TOP-UNCLASSIFIED',
      name: 'Unclassified Top Product',
      abcGrade: null,
    });
    const option = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId: master.id,
      sku: 'SKU-T-TOP-UNCLASSIFIED',
      costPrice: 0,
      commissionRate: 0,
    });
    const listing = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId: master.id,
      channel: 'coupang',
      externalId: 'EXT-T-TOP-UNCLASSIFIED',
      optionId: option.id,
      externalOptionId: 'VI-T-TOP-UNCLASSIFIED',
    });
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'SALES-T-TOP-UNCLASSIFIED',
      orderedAt: midMonth().toISOString(),
      shippingPrice: 0,
      lineItems: [{
        quantity: 1,
        totalPrice: 10_000,
        optionId: option.id,
        listingOptionId: listing.listingOptionId,
      }],
    });

    const result = await service.getSummary(
      buildDashboardContext(),
      TEST_ORGANIZATION_ID,
    );

    expect(result.topProducts[0]).toMatchObject({
      name: 'Unclassified Top Product',
      grade: null,
    });
  });

  it('retains the published absolute grade and provenance after a newer source failure', async () => {
    const { masterId, optionId, listingOptionId } = await seedTestListing('ABC');
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'SALES-T-ABC',
      orderedAt: midMonth().toISOString(),
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: 10_000, optionId, listingOptionId }],
    });
    const formula = await prisma.masterProductAbcFormulaVersion.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        formulaKey: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD.formulaKey,
        version: 1,
        formulaJson: JSON.parse(JSON.stringify(PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD)),
        formulaChecksum: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH,
      },
    });
    const source = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'sellpia_product_profitability',
        status: 'completed',
      },
    });
    const advertising = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'coupang_ad_profitability',
        status: 'completed',
      },
    });
    await prisma.masterProductAbcEvaluation.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        masterProductId: masterId,
        formulaVersionId: formula.id,
        abcGrade: 'A',
        weightedRevenue: 10_000_000,
        weightedOrderTimeSupplyCost: 6_000_000,
        weightedAdvertisingSpend: 1_000_000,
        weightedOperatingProfit: 3_000_000,
        operatingProfitVelocity30: 3_000_000,
        operatingMargin: 0.3,
        lossPersistence: 0,
        profitScore: 100,
        marginScore: 100,
        consistencyScore: 100,
        economicScore: 100,
        validObservationDays: 30,
        saleStartDate: new Date('2026-05-01T00:00:00.000Z'),
        formulaRevision: 1,
        publicationRevision: 2,
        gradeBasisCutoffDate: new Date('2026-06-30T00:00:00Z'),
        sellpiaSourceImportRunId: source.id,
        advertisingSourceImportRunId: advertising.id,
        sellpiaGeneration: 3n,
        advertisingGeneration: 4n,
        mappingGeneration: 5n,
        calculatedAt: new Date('2026-07-01T00:00:00Z'),
      },
    });
    await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'coupang_ad_profitability',
        status: 'failed',
        errorCode: 'COLLECTION_FAILED',
      },
    });

    const result = await service.getSummary(buildDashboardContext(), TEST_ORGANIZATION_ID);

    expect(result.topProducts[0]).toMatchObject({
      grade: 'A',
      abcEvaluation: {
        abcGrade: 'A',
        weightedOperatingProfit: 3_000_000,
        economicScore: 100,
        formula: PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
        publicationRevision: 2,
        gradeBasisCutoffDate: '2026-06-30',
        saleStartDate: '2026-05-01',
        sellpiaSourceImportRunId: source.id,
        advertisingSourceImportRunId: advertising.id,
        sellpiaGeneration: '3', advertisingGeneration: '4', mappingGeneration: '5',
      },
    });
  });

  it('T7: a bundle listing contributes its line revenue exactly once', async () => {
    const primary = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      code: 'M-T-BUNDLE-PRIMARY',
      name: 'Bundle representative',
    });
    const secondary = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      code: 'M-T-BUNDLE-SECONDARY',
      name: 'Bundle component',
    });
    const secondaryOption = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId: secondary.id,
      sku: 'SKU-T-BUNDLE-SECONDARY',
      costPrice: 0,
      commissionRate: 0,
    });
    const option = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId: primary.id,
      sku: 'SKU-T-BUNDLE',
      costPrice: 0,
      commissionRate: 0,
    });
    const listing = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId: primary.id,
      channel: 'coupang',
      externalId: 'EXT-T-BUNDLE',
      channelName: '번들 상품',
      optionId: option.id,
      externalOptionId: 'VI-T-BUNDLE',
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: listing.listingOptionId,
        sellpiaInventorySkuId: secondaryOption.id,
        quantity: 2,
      },
    });
    await seedOrderWithLineItems(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'SALES-T-BUNDLE',
      orderedAt: midMonth().toISOString(),
      shippingPrice: 0,
      lineItems: [{
        quantity: 1,
        totalPrice: 80_000,
        optionId: option.id,
        listingOptionId: listing.listingOptionId,
      }],
    });

    const result = await service.getSummary(buildDashboardContext(), TEST_ORGANIZATION_ID);

    expect(result.topProducts).toHaveLength(1);
    expect(result.topProducts[0]).toMatchObject({
      id: listing.listingId,
      name: 'Bundle representative',
      organization: '번들 상품',
      revenue: 80_000,
    });
  });
});
