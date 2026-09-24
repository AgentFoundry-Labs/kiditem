import { profitCatalogTestReaders } from '../../../test-helpers/channel-fact-ports';
import { channelFactTestPorts, channelFactTestProviders } from '../../../test-helpers/channel-fact-ports';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, afterEach, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD_HASH,
} from '@kiditem/shared/product-abc';
import { periodBasisStatus } from '@kiditem/shared/dashboard';
import { DashboardSalesService } from '../application/service/dashboard-sales.service';
import { buildDashboardContext } from '../domain/context';
import { DashboardSalesRepositoryAdapter } from '../adapter/out/repository/dashboard-sales.repository.adapter';
import { WingTrafficAggregationRepositoryAdapter } from '../adapter/out/repository/wing-traffic-aggregation.repository.adapter';
import { ProfitCalculationRepositoryAdapter } from '../adapter/out/repository/profit-calculation.repository.adapter';
import { PrismaService } from '../../../prisma/prisma.service';
import { PROFIT_CALCULATION_REPOSITORY_PORT } from '../application/port/out/repository/profit-calculation.repository.port';
import { DASHBOARD_SALES_REPOSITORY_PORT } from '../application/port/out/repository/dashboard-sales.repository.port';
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
  seedCompletedAdSweepRun,
  seedCompletedOrderCoverageRun,
} from '../../../test-helpers/finance-seeds';
import {
  addDays,
  businessDateKey,
  datesInclusive,
  evidenceCutoffDate,
  kstBusinessDate,
  kstMonthEnd,
  kstMonthStart,
  parseBusinessDate,
} from '../../../common/kst';
import { ProfitLossService } from '../../../finance/services/profit-loss.service';
import { seedSourceProduct } from '../../../test-helpers/inventory-seeds';
import { ProductTransactionalReadRepositoryAdapter } from '../../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { PRODUCT_TRANSACTIONAL_READ_PORT } from '../../../products/application/port/in/product-transactional-read.port';
import {
  PRODUCT_ABC_READ_PORT,
  type ProductAbcReadPort,
} from '../../../products/application/port/in/product-abc-read.port';
import { buildProductAbcReadModel } from '../../../products/domain/product-abc-read-model';
import { readProductAbcPublication } from '../../../products/adapter/out/persistence/read/product-abc-publication.reader';
import { periodOf } from './test-helpers/period';
import type { PrismaClient } from '@prisma/client';

/**
 * 00:46 KST on 2026-09-15, which is still 2026-09-14 in UTC. A seed built from
 * the runner's local calendar wrote the day before the service's latest closed
 * KST day there, so the Wing month looked one day short of complete. Pinning
 * the clock reproduces that instant in any runner timezone.
 */
const KST_DAWN = new Date('2026-09-14T15:46:00.000Z');

function productAbcRead(prisma: PrismaClient): ProductAbcReadPort {
  return {
    readAbc: async (input: {
      organizationId: string;
      masterProductIds: readonly string[];
    }) => {
      const publication = await prisma.$transaction((tx) =>
        readProductAbcPublication(tx, input),
      );
      const targetCutoff = publication.publication?.officialCutoffDate ?? '2026-06-30';
      const actualCutoff = publication.publication?.officialCutoffDate ?? null;
      const source = {
        requiredCutoff: targetCutoff,
        actualCutoff,
        latestAttemptState: publication.publication ? 'COMPLETE' as const : null,
      };
      return {
        targetCutoff,
        actualCutoff,
        capturedAt: publication.publication?.publishedAt ?? null,
        publication: publication.publication,
        products: publication.products.map((product) => ({
          masterProductId: product.masterProductId,
          saleStartDate: product.evaluation?.saleStartDate ?? null,
          contributionEligible: product.contributionEligible,
          abc: buildProductAbcReadModel({
            evaluation: product.evaluation,
            mappingValid: product.contributionEligible,
            saleStartDate: product.evaluation?.saleStartDate ?? null,
            evidence: {
              actualCutoff,
              mappingGeneration: publication.publication?.mappingGeneration ?? null,
              sellpia: source,
              advertising: source,
            },
            formulaState: {
              formulaRevision: product.evaluation?.formulaRevision
                ?? publication.publication?.formulaRevision
                ?? publication.currentFormulaRevision,
              publicationRevision: publication.publication?.publicationRevision ?? 0,
              officialCutoffDate: publication.publication?.officialCutoffDate ?? null,
              publishedAt: publication.publication?.publishedAt ?? null,
              mappingGeneration: publication.currentMappingGeneration,
            },
          }),
        })),
      };
    },
  };
}

describe('DashboardSalesService.getSummary (PG integration)', () => {
  let prisma: PrismaClient;
  let service: DashboardSalesService;
  let wingTraffic: WingTrafficAggregationRepositoryAdapter;
  const trafficRead = { readPublished: vi.fn() };

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const m = await Test.createTestingModule({
      providers: [
        ...channelFactTestProviders,
        DashboardSalesService,
        DashboardSalesRepositoryAdapter,
        WingTrafficAggregationRepositoryAdapter,
        ProfitCalculationRepositoryAdapter,
        { provide: PRODUCT_TRANSACTIONAL_READ_PORT, useClass: ProductTransactionalReadRepositoryAdapter },
        { provide: PRODUCT_ABC_READ_PORT, useValue: productAbcRead(prisma) },
        { provide: PrismaService, useValue: prisma },
        { provide: PROFIT_CALCULATION_REPOSITORY_PORT, useExisting: ProfitCalculationRepositoryAdapter },
        { provide: DASHBOARD_SALES_REPOSITORY_PORT, useExisting: DashboardSalesRepositoryAdapter },
        { provide: WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT, useExisting: WingTrafficAggregationRepositoryAdapter },
        { provide: AD_TRAFFIC_READ_PORT, useValue: trafficRead },
      ],
    }).compile();
    service = m.get(DashboardSalesService);
    wingTraffic = m.get(WingTrafficAggregationRepositoryAdapter);
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

  afterEach(() => {
    vi.useRealTimers();
  });

  /** The anchor's KST calendar month as `YYYY-MM`, whatever the runner's timezone. */
  function anchorMonth(): string {
    return businessDateKey(kstBusinessDate(new Date())).slice(0, 7);
  }

  /**
   * The campaign sweep visited every day of the anchor month and found no
   * advertising: a measured zero on each date. The real collector never
   * answers a visited day with "no row", so a no-ads month is evidence, and
   * profit over it is computable.
   */
  let sweepGeneration = 0;
  async function seedConfirmedZeroMonth(): Promise<void> {
    const month = anchorMonth();
    await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      generation: ++sweepGeneration,
      window: { startDate: `${month}-01`, endDate: kstMonthEnd(month) },
    });
  }

  /**
   * Helper: create a single seeded master+listing+option for current month.
   * Returns IDs for further per-order seeding.
   */
  async function seedTestListing(suffix: string) {
    const { id: masterId } = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID, code: `M-T-${suffix}`, name: `Master T-${suffix}`,
    });
    const { id: optionId } = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      sku: `SKU-T-${suffix}`, costPrice: 50_000,
    });
    const { listingId, listingOptionId } = await setupChannelListing(prisma, {
      organizationId: TEST_ORGANIZATION_ID, masterId,
      channel: 'coupang', externalId: `EXT-T-${suffix}`, channelName: '쿠팡',
      optionId, externalOptionId: `VI-T-${suffix}`,
    });
    await seedConfirmedZeroMonth();
    return { masterId, optionId, listingId, listingOptionId };
  }

  /** 03:00 KST on the 15th of the anchor's KST month — inside the month window everywhere. */
  function midMonth(): Date {
    const [year, month] = anchorMonth().split('-').map(Number);
    return new Date(addDays(kstMonthStart(year, month), 14).getTime() + 3 * 60 * 60 * 1000);
  }

  async function readMeasuredSummary(
    ctx: ReturnType<typeof buildDashboardContext>,
    organizationId = TEST_ORGANIZATION_ID,
  ) {
    const month = `${ctx.year}-${String(ctx.month).padStart(2, '0')}`;
    await seedCompletedOrderCoverageRun(prisma, {
      organizationId,
      startDate: `${month}-01`,
      endDate: kstMonthEnd(month),
    });
    return service.getSummary(ctx, organizationId);
  }

  /**
   * KID-144 — a month's profit, and the rate, change and inputs built on it,
   * read the anchor's month clipped to its closed KST days (ADR-0001). Orders
   * and the campaign sweep can only ever have covered those days, so a profit
   * read over the whole calendar month was unavailable all month. The anchor is
   * fixed after 06:00 KST, so the closed days do not move with the wall clock.
   */
  it('T1: publishes the month profit over its closed days — single order, math verified', async () => {
    // 12:00 KST on 20 September: 1–19 September are closed, the 20th is open.
    const anchor = new Date('2026-09-20T03:00:00.000Z');
    const { optionId, listingOptionId } = await seedTestListing('1');
    // This case owns its coverage. It replaces the helper's calendar-month
    // sweep with what real collections reach: the sweep and the Orders
    // collection both stop at the 19th.
    await prisma.channelAdTargetDailySnapshot.deleteMany({ where: { organizationId: TEST_ORGANIZATION_ID } });
    await prisma.sourceImportRun.deleteMany({
      where: { organizationId: TEST_ORGANIZATION_ID, sourceType: 'coupang_ad_campaign' },
    });
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'SALES-T-1',
      orderedAt: '2026-09-15T12:00:00+09:00',
      shippingPrice: 10_000,
      lineItems: [{ quantity: 1, totalPrice: 100_000, optionId, listingOptionId }],
    });
    await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      generation: ++sweepGeneration,
      window: { startDate: '2026-09-01', endDate: '2026-09-19' },
    });
    await seedCompletedOrderCoverageRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      startDate: '2026-09-01',
      endDate: '2026-09-19',
    });

    const result = await service.getSummary(
      buildDashboardContext(undefined, undefined, undefined, anchor),
      TEST_ORGANIZATION_ID,
    );

    // 100k − 50k purchase cost − 10k shipping; a Rocket order carries no
    // commission. The sweep measured every closed day and found no
    // advertising, which is evidence, so profit is computable.
    expect(result.monthly.profit).toBe(40_000);
    expect(result.monthly.adRate).toBe(0);
    expect(result.rangeKpi).toMatchObject({ profit: 40_000, profitRate: 40 });
    expect(result.profitInputs).toMatchObject({ revenue: 100_000, cost: 60_000, adCost: 0 });
    expect(result.profitDetail).toMatchObject({
      revenue: 100_000,
      netProfit: 40_000,
      commission: 0,
      shippingCost: 10_000,
    });
    for (const key of ['monthly.profit', 'rangeKpi.profit', 'rangeKpi.profitRate', 'profitInputs'] as const) {
      const basis = result.metricBasis?.[key];
      expect(basis, key).toMatchObject({
        kind: 'period',
        from: '2026-09-01',
        to: '2026-09-19',
        targetDays: 19,
      });
      expect(basis?.kind === 'period' ? periodBasisStatus(basis) : null, key).toBe('complete');
    }
    expect(result.planAchievement).toBeNull();
  });

  it('T2: IDOR isolation — OTHER sentinel never leaks into TEST', async () => {
    const t = await seedTestListing('2');
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'SALES-T-2',
      orderedAt: midMonth().toISOString(),
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: 1_000, optionId: t.optionId, listingOptionId: t.listingOptionId }],
    });

    // OTHER sentinel
    const oMaster = await setupMaster(prisma, { organizationId: OTHER_ORGANIZATION_ID, code: 'M-O-2', name: 'Other M2' });
    const oOption = await setupProductOption(prisma, {
      organizationId: OTHER_ORGANIZATION_ID, masterId: oMaster.id, sku: 'SKU-O-2', costPrice: 0,
    });
    const oListing = await setupChannelListing(prisma, {
      organizationId: OTHER_ORGANIZATION_ID, masterId: oMaster.id,
      channel: 'coupang', externalId: 'EXT-O-2',
      optionId: oOption.id, externalOptionId: 'VI-O-2',
    });
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: OTHER_ORGANIZATION_ID,
      externalOrderId: 'SALES-O-2',
      orderedAt: midMonth().toISOString(),
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: IDOR_SENTINEL, optionId: oOption.id, listingOptionId: oListing.listingOptionId }],
    });

    const ctx = buildDashboardContext();
    const result = await readMeasuredSummary(ctx);

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
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'SALES-T-3',
      orderedAt: recent.toISOString(),
      shippingPrice: 0,
      lineItems: [{ quantity: 1, totalPrice: 50_000, optionId, listingOptionId }],
    });

    const ctx = buildDashboardContext('week');
    const result = await readMeasuredSummary(ctx);

    expect(result.rangeKpi).toBeDefined();
    expect(result.rangeKpi?.range).toBe('week');
    expect(result.rangeKpi?.revenue).toBe(50_000);
  });

  it('T4: empty organization returns unavailable values (no error)', async () => {
    // An organization with nothing in it has no Coupang account either, so
    // advertising is not an input to its profit.

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
    expect(result.profitDetail?.revenue).toBeNull();
    expect(result.trafficKpi).toMatchObject({
      visitors: null,
      conversionRate: null,
      trafficObservedAt: null,
    });
    expect(result.lastSyncAt).toBeNull();
  });

  it('treats a completed provider-backed empty Wing window as collected zero traffic', async () => {
    const { listingId } = await seedTestListing('EMPTY-TRAFFIC');
    const listing = await prisma.channelListing.findUniqueOrThrow({
      where: { id: listingId },
      select: { channelAccountId: true },
    });
    const confirmedDates = ['2026-09-01', '2026-09-02'];
    const importedAt = new Date('2026-09-03T03:00:00.000Z');
    await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: listing.channelAccountId,
        sourceType: 'coupang_wing_traffic',
        status: 'completed',
        freshnessGeneration: 1n,
        providerBackedEmptyProof: true,
        qualityReport: { confirmedDates },
        importedAt,
      },
    });

    const result = await wingTraffic.aggregateTraffic(
      TEST_ORGANIZATION_ID,
      periodOf(
        new Date('2026-08-31T15:00:00.000Z'),
        new Date('2026-09-02T15:00:00.000Z'),
        {
          anchor: new Date('2026-09-04T00:00:00.000Z'),
          sourceClass: 'closed_day_clipped',
        },
      ),
    );

    expect(result).toMatchObject({
      revenue: 0,
      orders: 0,
      salesQty: 0,
      visitors: 0,
      views: 0,
      cartAdds: 0,
      conversionRate: null,
      dailyAverageVisitors: 0,
      isCollected: true,
      hasData: true,
      lastObservedAt: importedAt,
      coverage: {
        targetDays: 2,
        completedDays: 2,
        missingDates: [],
      },
    });
  });

  it('publishes provider-confirmed empty Wing days as zero trend points and leaves unconfirmed days as holes', async () => {
    const { listingId } = await seedTestListing('EMPTY-TREND');
    const listing = await prisma.channelListing.findUniqueOrThrow({
      where: { id: listingId },
      select: { channelAccountId: true },
    });
    // The provider confirmed 09-01 and 09-02 empty; nobody confirmed 09-03.
    await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: listing.channelAccountId,
        sourceType: 'coupang_wing_traffic',
        status: 'completed',
        freshnessGeneration: 1n,
        providerBackedEmptyProof: true,
        qualityReport: { confirmedDates: ['2026-09-01', '2026-09-02'] },
        importedAt: new Date('2026-09-04T03:00:00.000Z'),
      },
    });

    const rows = await wingTraffic.fetchDailyTrend(
      TEST_ORGANIZATION_ID,
      new Date('2026-08-31T15:00:00.000Z'),
      new Date('2026-09-03T15:00:00.000Z'),
    );

    const zeroDay = { revenue: 0, orders: 0, salesQty: 0, visitors: 0, views: 0, cartAdds: 0 };
    expect(rows.map(({ date, revenue, orders, salesQty, visitors, views, cartAdds }) => ({
      date, revenue, orders, salesQty, visitors, views, cartAdds,
    }))).toEqual([
      { date: '2026-09-01', ...zeroDay },
      { date: '2026-09-02', ...zeroDay },
    ]);
  });

  it('publishes no additive traffic or ad value for a window nothing measured', async () => {
    await seedTestListing('UNMEASURED');
    const period = periodOf(
      new Date('2026-06-09T15:00:00.000Z'),
      new Date('2026-06-11T15:00:00.000Z'),
      { anchor: new Date('2026-06-20T00:00:00.000Z'), sourceClass: 'closed_day_clipped' },
    );

    await expect(wingTraffic.aggregateTraffic(TEST_ORGANIZATION_ID, period)).resolves.toMatchObject({
      revenue: null,
      orders: null,
      salesQty: null,
      visitors: null,
      views: null,
      cartAdds: null,
      isCollected: false,
      hasData: false,
    });
    await expect(wingTraffic.aggregateCoupangAds(TEST_ORGANIZATION_ID, period)).resolves.toMatchObject({
      spend: null,
      revenue: null,
      impressions: null,
      clicks: null,
      conversions: null,
      orders: null,
      conversionRate: null,
      isCollected: false,
      hasData: false,
    });
  });

  it('keeps an unobserved conversion count null in the Coupang ad totals', async () => {
    const { listingId } = await seedTestListing('UNOBSERVED-CONVERSIONS');
    const runId = await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      generation: 100,
      window: { startDate: '2026-07-10', endDate: '2026-07-11' },
    });
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID, listingId, runId, date: '2026-07-10',
      spend: 1_000, revenue: 5_000, clicks: 40, conversions: 2, orders: 3,
      conversionsObserved: true,
    });
    // The campaign dashboard grid carries no conversion columns: stored 0, unobserved.
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID, listingId, runId, date: '2026-07-11',
      spend: 2_000, revenue: 0, clicks: 10, conversions: 0, orders: 0,
      conversionsObserved: false,
    });
    const since = new Date('2026-07-09T15:00:00.000Z');
    const until = new Date('2026-07-11T15:00:00.000Z');

    const totals = await wingTraffic.aggregateCoupangAds(
      TEST_ORGANIZATION_ID,
      periodOf(since, until, {
        anchor: new Date('2026-07-20T00:00:00.000Z'),
        sourceClass: 'closed_day_clipped',
      }),
    );
    expect(totals).toMatchObject({
      spend: 3_000,
      clicks: 50,
      conversions: null,
      orders: null,
      conversionRate: null,
      isCollected: true,
      hasData: true,
    });
  });

  it('composes funnel orders from the exact listing-day intersection, never Wing order fields', async () => {
    const first = await seedTestListing('FUNNEL-1');
    const second = await seedTestListing('FUNNEL-2');
    const businessDate = '2026-09-01';
    const account = await prisma.channelListing.findUniqueOrThrow({
      where: { id: first.listingId },
      select: { channelAccountId: true },
    });
    const attempt = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.channelAccountId,
        sourceType: 'coupang_wing_traffic',
        status: 'completed',
        freshnessGeneration: 99n,
        providerBackedEmptyProof: false,
        qualityReport: { confirmedDates: [businessDate] },
        importedAt: new Date('2026-09-02T01:00:00.000Z'),
      },
    });
    await prisma.channelListingDailySnapshot.createMany({
      data: [
        { listingId: first.listingId, externalId: 'EXT-T-FUNNEL-1', views: 100, carts: 10 },
        { listingId: second.listingId, externalId: 'EXT-T-FUNNEL-2', views: 900, carts: 90 },
      ].map((row) => ({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: row.listingId,
        channel: 'coupang',
        externalId: row.externalId,
        businessDate: new Date(`${businessDate}T00:00:00.000Z`),
        trafficVisitors: row.views,
        trafficViews: row.views,
        trafficCartAdds: row.carts,
        // Deliberately impossible provider values: the composite must ignore
        // them for Orders-owned funnel stages.
        trafficOrders: 777,
        trafficSalesQty: 888,
        trafficRevenue: 9_999_999,
        trafficObservedAt: new Date('2026-09-02T01:00:00.000Z'),
        metaJson: {
          'traffic.currentSource': 'wing.traffic',
          'wing.traffic': { sourceAttemptId: attempt.id },
        },
      })),
    });
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'FUNNEL-ORDER-1',
      orderedAt: '2026-09-01T03:00:00+09:00',
      shippingPrice: 0,
      lineItems: [{
        quantity: 2,
        totalPrice: 100,
        optionId: first.optionId,
        listingOptionId: first.listingOptionId,
      }, {
        quantity: 1,
        totalPrice: 50,
        optionId: second.optionId,
        listingOptionId: second.listingOptionId,
      }],
    });
    await seedCompletedOrderCoverageRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      startDate: businessDate,
      endDate: businessDate,
    });

    const result = await wingTraffic.readTrafficFunnel(
      TEST_ORGANIZATION_ID,
      periodOf(
        new Date('2026-08-31T15:00:00.000Z'),
        new Date('2026-09-01T15:00:00.000Z'),
        { anchor: new Date('2026-09-03T00:00:00.000Z'), sourceClass: 'closed_day_clipped' },
      ),
    );

    expect(result).toMatchObject({
      views: 1_000,
      cartAdds: 100,
      cartRate: 10,
      orders: 1,
      orderCartRate: 1,
      salesQty: 3,
      revenue: 150,
      conversionRate: 0.1,
      intersectionListingCount: 2,
      intersectionListingDateCount: 2,
    });
    expect(result.metricDates.orders).toEqual([businessDate]);
    expect(result.metricDates.orderCartRate).toEqual([businessDate]);
  });

  it('computes ad rate inputs only from owner-valid common dates', async () => {
    const listing = await seedTestListing('AD-RATE');
    // This adapter-level case owns its coverage fixture. Remove the helper's
    // current-month explicit-zero sweep so D2 remains deliberately unmeasured.
    await prisma.channelAdTargetDailySnapshot.deleteMany({
      where: { organizationId: TEST_ORGANIZATION_ID },
    });
    await prisma.sourceImportRun.deleteMany({
      where: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'coupang_ad_campaign',
      },
    });
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'AD-RATE-D1',
      orderedAt: '2026-09-01T03:00:00+09:00',
      shippingPrice: 0,
      lineItems: [{
        quantity: 1,
        totalPrice: 100,
        optionId: listing.optionId,
        listingOptionId: listing.listingOptionId,
      }],
    });
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
      organizationId: TEST_ORGANIZATION_ID,
      externalOrderId: 'AD-RATE-D2-UNPROVEN',
      orderedAt: '2026-09-02T03:00:00+09:00',
      shippingPrice: 0,
      lineItems: [{
        quantity: 1,
        totalPrice: 900,
        optionId: listing.optionId,
        listingOptionId: listing.listingOptionId,
      }],
    });
    await seedCompletedOrderCoverageRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      startDate: '2026-09-01',
      endDate: '2026-09-01',
    });
    const adRunId = await seedCompletedAdSweepRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      generation: ++sweepGeneration,
      window: { startDate: '2026-09-01', endDate: '2026-09-01' },
    });
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingId: listing.listingId,
      date: '2026-09-01',
      spend: 10,
      runId: adRunId,
    });
    await seedAd(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      listingId: listing.listingId,
      date: '2026-09-02',
      spend: 20,
      // Preserved legacy evidence without a terminal owner declaration must
      // not expand the measured intersection.
      runId: null,
    });

    const result = await wingTraffic.readAdRateFacts(
      TEST_ORGANIZATION_ID,
      periodOf(
        new Date('2026-08-31T15:00:00.000Z'),
        new Date('2026-09-02T15:00:00.000Z'),
        { anchor: new Date('2026-09-04T00:00:00.000Z'), sourceClass: 'closed_day_clipped' },
      ),
    );

    expect(result).toEqual({
      adSpend: 10,
      revenue: 100,
      revenueSource: 'orders',
      includedDates: ['2026-09-01'],
      adCoverageComplete: false,
    });
  });

  it('publishes zero funnel orders when Orders declares a complete empty day', async () => {
    const listing = await seedTestListing('FUNNEL-EMPTY');
    const businessDate = '2026-09-01';
    const account = await prisma.channelListing.findUniqueOrThrow({
      where: { id: listing.listingId },
      select: { channelAccountId: true },
    });
    const attempt = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.channelAccountId,
        sourceType: 'coupang_wing_traffic',
        status: 'completed',
        freshnessGeneration: 101n,
        providerBackedEmptyProof: false,
        qualityReport: { confirmedDates: [businessDate] },
        importedAt: new Date('2026-09-02T01:00:00.000Z'),
      },
    });
    await prisma.channelListingDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.listingId,
        channel: 'coupang',
        externalId: 'EXT-T-FUNNEL-EMPTY',
        businessDate: new Date(`${businessDate}T00:00:00.000Z`),
        trafficVisitors: 100,
        trafficViews: 100,
        trafficCartAdds: 10,
        trafficObservedAt: new Date('2026-09-02T01:00:00.000Z'),
        metaJson: {
          'traffic.currentSource': 'wing.traffic',
          'wing.traffic': { sourceAttemptId: attempt.id },
        },
      },
    });
    await seedCompletedOrderCoverageRun(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      startDate: businessDate,
      endDate: businessDate,
    });

    const result = await wingTraffic.readTrafficFunnel(
      TEST_ORGANIZATION_ID,
      periodOf(
        new Date('2026-08-31T15:00:00.000Z'),
        new Date('2026-09-01T15:00:00.000Z'),
        { anchor: new Date('2026-09-03T00:00:00.000Z'), sourceClass: 'closed_day_clipped' },
      ),
    );

    expect(result).toMatchObject({
      views: 100,
      cartAdds: 10,
      orders: 0,
      salesQty: 0,
      revenue: 0,
      conversionRate: 0,
      orderCartRate: 0,
      intersectionListingCount: 1,
      intersectionListingDateCount: 1,
    });
  });

  it('T4b: complete v2 Wing monthlyTrend keeps profit unavailable without settlement data', async () => {
    // The month and its closed days are KST facts. Reading the runner's local
    // calendar instead left the seed a day behind the service in the KST small
    // hours of a UTC runner, and the month never looked complete.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(KST_DAWN);
    const { listingId } = await seedTestListing('4B');
    const month = anchorMonth();
    const monthStart = parseBusinessDate(`${month}-01`)!;
    // The owner source is complete only through the latest closed KST
    // business day. Do not manufacture future zero rows merely to make a
    // current-month range look complete.
    const latestClosedDate = evidenceCutoffDate(new Date());
    const monthLastDate = parseBusinessDate(kstMonthEnd(month))!;
    const monthEnd = latestClosedDate < monthLastDate ? latestClosedDate : monthLastDate;
    const monthDates = datesInclusive(monthStart, monthEnd).map(businessDateKey);
    const trafficDate = monthDates.at(-1)!;
    await prisma.channelListingDailySnapshot.createMany({
      data: monthDates.map((date) => ({
        organizationId: TEST_ORGANIZATION_ID,
        listingId,
        channel: 'coupang',
        externalId: 'EXT-T-4B',
        businessDate: new Date(`${date}T00:00:00.000Z`),
        trafficVisitors: date === trafficDate ? 30 : 0,
        trafficViews: date === trafficDate ? 100 : 0,
        trafficOrders: date === trafficDate ? 6 : 0,
        trafficSalesQty: date === trafficDate ? 6 : 0,
        trafficRevenue: date === trafficDate ? 120_000 : 0,
        trafficObservedAt: new Date(`${date}T15:00:00.000Z`),
      })),
    });
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
      ].map((metric) => [metric, { dailySum: null, periodValue: null }])),
      legacyExactPeriodEvidence: null,
    };
    // The old account publication remains present to prove that Dashboard
    // traffic now comes from the canonical listing-day reader.
    trafficRead.readPublished.mockResolvedValue(trafficPublication);
    // This fixture is about Wing revenue without settlement data: the ad
    // account exists but the sweep has reported nothing for the month, so ad
    // cost stays unavailable rather than becoming a collected zero.
    await prisma.channelAdTargetDailySnapshot.deleteMany({ where: { organizationId: TEST_ORGANIZATION_ID } });
    await prisma.sourceImportRun.deleteMany({ where: { organizationId: TEST_ORGANIZATION_ID, sourceType: 'coupang_ad_campaign' } });

    const ctx = buildDashboardContext();
    const result = await service.getSummary(ctx, TEST_ORGANIZATION_ID);
    expect(result.effectivePeriod?.revenueSource).toBe('wing');
    expect(result.monthly).toMatchObject({
      revenue: 120_000,
      profit: null,
      adRate: null,
    });
    expect(result.trafficKpi).toMatchObject({
      visitors: 30 / monthDates.length,
      orders: null,
      salesQty: null,
      revenue: null,
      conversionRate: null,
      trafficObservedAt: `${monthDates.at(-1)}T15:00:00.000Z`,
    });
  });

  it('T6: topProducts ranks by revenue DESC, capped at 10', async () => {
    // Seed 12 listings × 1 order each, decreasing revenue 12000, 11000, ..., 1000
    for (let i = 1; i <= 12; i++) {
      const { id: masterId } = await setupMaster(prisma, {
        organizationId: TEST_ORGANIZATION_ID, code: `M-T-TOP-${i}`, name: `Top ${i}`,
      });
      const { id: optionId } = await setupProductOption(prisma, {
        organizationId: TEST_ORGANIZATION_ID, masterId, sku: `SKU-T-TOP-${i}`, costPrice: 0,
      });
      const { listingOptionId } = await setupChannelListing(prisma, {
        organizationId: TEST_ORGANIZATION_ID, masterId,
        channel: 'coupang', externalId: `EXT-T-TOP-${i}`, channelName: `채널${i}`,
        optionId, externalOptionId: `VI-T-TOP-${i}`,
      });
      await seedOrderWithLineItems(prisma, {
        orderChannel: 'rocket',
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: `SALES-T-TOP-${i}`,
        orderedAt: midMonth().toISOString(),
        shippingPrice: 0,
        lineItems: [{ quantity: 1, totalPrice: (13 - i) * 1_000, optionId, listingOptionId }],
      });
    }
    await seedConfirmedZeroMonth();

    const ctx = buildDashboardContext();
    const result = await readMeasuredSummary(ctx);

    expect(result.topProducts).toHaveLength(10);
    expect(result.topProducts[0].revenue).toBe(12_000);
    expect(result.topProducts[9].revenue).toBe(3_000);
    expect(result.topProducts[0].name).toBe('Top 1');
    expect(result.topProducts[0].organization).toBe('채널1');     // ChannelListing.channelName

    // The approximation this used to guard is gone. Profit now comes from the
    // same `buildPerListingProfit` that /api/profit-loss reads, so the figure
    // follows this fixture's own inputs: zero supply cost, zero commission,
    // zero shipping, and an ad publication confirmed zero across the window.
    expect(result.topProducts[0].netProfit).toBe(12_000);
    expect(result.topProducts[0].profitRate).toBe(100);
    expect(result.topProducts[0].netProfit).not.toBe(Math.round(12_000 * 0.3));
  });

  /**
   * Rocket purchase orders are channel revenue, and their lines carry no
   * listing option: the Coupang direct importer resolves product identity
   * through Supply's confirmation. The ranking's inner join used to drop them,
   * so a July of real Rocket revenue read as "no product revenue". They belong
   * in the ranking by revenue — and with no listing to settle against, they
   * carry no profit rather than an assumed one.
   */
  it('ranks a Rocket line by its revenue and publishes no profit for it', async () => {
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Coupang Rocket',
      },
      select: { id: true },
    });
    const order = await prisma.order.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalOrderId: 'ROCKET-PO-1',
        orderedAt: midMonth(),
        status: 'accepted',
        shippingPrice: 0,
        totalPrice: 1_474_200,
      },
      select: { id: true },
    });
    await prisma.orderLineItem.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        orderId: order.id,
        listingOptionId: null,
        sku: '53889600',
        productName: '2000바풍투톤슬라임 152g 12개 혼합색상 랜덤발송',
        quantity: 12,
        unitPrice: 122_850,
        totalPrice: 1_474_200,
        externalLineId: 'ROCKET-LI-1',
      },
    });

    const result = await readMeasuredSummary(buildDashboardContext());

    const rocket = result.topProducts.find((row) => row.id === 'line-sku:53889600');
    expect(rocket).toBeDefined();
    expect(rocket?.revenue).toBe(1_474_200);
    expect(rocket?.organization).toBe('Coupang Rocket');
    expect(rocket?.name).toBe('2000바풍투톤슬라임 152g 12개 혼합색상 랜덤발송');
    expect(rocket?.grade).toBeNull();
    expect(rocket?.netProfit).toBeNull();
    expect(rocket?.profitRate).toBeNull();
  });

  it('keeps an unclassified stored MasterProduct grade null in Top Products', async () => {
    const master = await setupMaster(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      code: 'M-T-TOP-UNCLASSIFIED',
      name: 'Unclassified Top Product',
    });
    const option = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId: master.id,
      sku: 'SKU-T-TOP-UNCLASSIFIED',
      costPrice: 0,
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
      orderChannel: 'rocket',
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

    const result = await readMeasuredSummary(buildDashboardContext());

    expect(result.topProducts[0]).toMatchObject({
      name: 'Unclassified Top Product',
      grade: null,
    });
  });

  it('retains the published absolute grade and provenance after a newer source failure', async () => {
    const { masterId, optionId, listingOptionId } = await seedTestListing('ABC');
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
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
    await prisma.masterProductAbcFormulaState.upsert({
      where: { organizationId: TEST_ORGANIZATION_ID },
      create: {
        organizationId: TEST_ORGANIZATION_ID,
        activeFormulaVersionId: formula.id,
        formulaRevision: 1,
        publicationRevision: 2,
        officialCutoffDate: new Date('2026-06-30T00:00:00Z'),
        publishedAt: new Date('2026-07-01T00:00:00Z'),
        publishedSellpiaSourceImportRunId: source.id,
        publishedAdvertisingSourceImportRunId: advertising.id,
        publishedMappingGeneration: 5n,
        mappingGeneration: 5n,
      },
      update: {
        activeFormulaVersionId: formula.id,
        formulaRevision: 1,
        publicationRevision: 2,
        officialCutoffDate: new Date('2026-06-30T00:00:00Z'),
        publishedAt: new Date('2026-07-01T00:00:00Z'),
        publishedSellpiaSourceImportRunId: source.id,
        publishedAdvertisingSourceImportRunId: advertising.id,
        publishedMappingGeneration: 5n,
        mappingGeneration: 5n,
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

    const result = await readMeasuredSummary(buildDashboardContext());

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
    });
    const option = await setupProductOption(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      masterId: primary.id,
      sku: 'SKU-T-BUNDLE',
      costPrice: 0,
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
        masterProductId: secondaryOption.id,
        quantity: 2,
      },
    });
    await seedOrderWithLineItems(prisma, {
      orderChannel: 'rocket',
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

    const result = await readMeasuredSummary(buildDashboardContext());

    expect(result.topProducts).toHaveLength(1);
    expect(result.topProducts[0]).toMatchObject({
      id: listing.listingId,
      name: 'Bundle representative',
      organization: '번들 상품',
      revenue: 80_000,
    });
  });
  /**
   * Business-date evidence published on the profit port. These run against the
   * real order rows so the KST bucketing, the query's admission rules, and the
   * window enumeration are all exercised together; the ad source stays a stub
   * because the Advertising owner publishes it, not this adapter.
   */
  describe('ProfitCalculationRepositoryAdapter business-date coverage', () => {
    // KST 2026-03-01 00:00 → 2026-03-04 00:00 = business dates 03-01..03-03.
    const FROM = new Date('2026-02-28T15:00:00.000Z');
    const TO = new Date('2026-03-03T15:00:00.000Z');
    const REQUESTED = ['2026-03-01', '2026-03-02', '2026-03-03'];

    function buildAdapter(): ProfitCalculationRepositoryAdapter {
      return new ProfitCalculationRepositoryAdapter(channelFactTestPorts(prisma as unknown as PrismaService).accounts, channelFactTestPorts(prisma as unknown as PrismaService).recipes,
        prisma as unknown as PrismaService,
        new ProductTransactionalReadRepositoryAdapter(),
      );
    }

    let coverageListingId: string | null = null;

    /**
     * The campaign sweep reported an explicit zero for each named date on the
     * organization's listing. No date at all is the absent answer: the account
     * exists but the sweep published nothing for the range.
     */
    async function publishedRows(...businessDates: string[]): Promise<void> {
      if (!coverageListingId) {
        const { listingId } = await seedTestListing('COV-LEDGER');
        await prisma.channelAdTargetDailySnapshot.deleteMany({ where: { organizationId: TEST_ORGANIZATION_ID } });
        await prisma.sourceImportRun.deleteMany({ where: { organizationId: TEST_ORGANIZATION_ID, sourceType: 'coupang_ad_campaign' } });
        coverageListingId = listingId;
      }
      for (const date of businessDates) {
        await seedAd(prisma, { organizationId: TEST_ORGANIZATION_ID, listingId: coverageListingId, date, spend: 0 });
      }
    }

    /** An organization with no advertising account at all: its only account is not a Coupang one. */
    async function notApplied(): Promise<void> {
      await prisma.channelAdTargetDailySnapshot.deleteMany({ where: { organizationId: TEST_ORGANIZATION_ID } });
      await prisma.sourceImportRun.deleteMany({ where: { organizationId: TEST_ORGANIZATION_ID, sourceType: 'coupang_ad_campaign' } });
      await prisma.channelAccount.updateMany({
        where: { organizationId: TEST_ORGANIZATION_ID, channel: 'coupang' },
        data: { channel: 'naver' },
      });
    }

    beforeEach(() => {
      coverageListingId = null;
    });

    /**
     * One order on each requested date, with every settlement input present so
     * `costComplete` is true and the only thing that can withhold `netProfit`
     * is the advertising evidence under test. Per day:
     * 10,000 revenue − 5,000 COGS − 1,000 shipping = 4,000; a Rocket order
     * carries no commission.
     * The order carries its own positive `shippingPrice`, because the option's
     * nullable `shippingCost` would otherwise be a missing cost input.
     */
    const DAILY_REVENUE = 10_000;
    const DAILY_PROFIT = 4_000;

    async function seedFullyCoveredOrders(suffix: string): Promise<void> {
      const { id: masterId } = await setupMaster(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        code: `M-T-${suffix}`,
        name: `Master T-${suffix}`,
      });
      const { id: optionId } = await setupProductOption(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        masterId,
        sku: `SKU-T-${suffix}`,
        costPrice: 5_000,
      });
      const { listingOptionId } = await setupChannelListing(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        masterId,
        channel: 'coupang',
        externalId: `EXT-T-${suffix}`,
        optionId,
        externalOptionId: `VI-T-${suffix}`,
      });
      for (const businessDate of REQUESTED) {
        await seedOrderWithLineItems(prisma, {
          orderChannel: 'rocket',
          organizationId: TEST_ORGANIZATION_ID,
          externalOrderId: `SALES-${suffix}-${businessDate}`,
          orderedAt: `${businessDate}T05:00:00.000Z`,
          shippingPrice: 1_000,
          lineItems: [{
            quantity: 1,
            totalPrice: DAILY_REVENUE,
            optionId,
            listingOptionId,
          }],
        });
      }
      await seedCompletedOrderCoverageRun(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        startDate: REQUESTED[0],
        endDate: REQUESTED.at(-1)!,
      });
    }

    it('reports an internal hole as a requested date without order evidence', async () => {
      const { optionId, listingOptionId } = await seedTestListing('COV-HOLE');
      for (const orderedAt of ['2026-03-01T05:00:00.000Z', '2026-03-03T05:00:00.000Z']) {
        await seedOrderWithLineItems(prisma, {
          orderChannel: 'rocket',
          organizationId: TEST_ORGANIZATION_ID,
          externalOrderId: `SALES-COV-${orderedAt}`,
          orderedAt,
          shippingPrice: 0,
          lineItems: [{ quantity: 1, totalPrice: 10_000, optionId, listingOptionId }],
        });
      }
      await seedCompletedOrderCoverageRun(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        startDate: '2026-03-01',
        endDate: '2026-03-01',
      });
      await seedCompletedOrderCoverageRun(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        startDate: '2026-03-03',
        endDate: '2026-03-03',
      });

      await publishedRows();
      const result = await buildAdapter().calculateForRange(
        TEST_ORGANIZATION_ID,
        periodOf(FROM, TO),
      );

      expect(result.sourceCoverage.requestedDates).toEqual(REQUESTED);
      expect(result.sourceCoverage.orderDates).toEqual(['2026-03-01', '2026-03-03']);
      // The hole is a known-missing date, not a date outside the question.
      expect(result.sourceCoverage.requestedDates).toContain('2026-03-02');
      expect(result.sourceCoverage.orderDates).not.toContain('2026-03-02');
    });

    it('keeps a collected zero as a partial fact without promoting the whole range', async () => {
      const { optionId, listingOptionId } = await seedTestListing('COV-ZERO');
      await seedOrderWithLineItems(prisma, {
        orderChannel: 'rocket',
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'SALES-COV-ZERO',
        orderedAt: '2026-03-02T05:00:00.000Z',
        shippingPrice: 0,
        lineItems: [{ quantity: 1, totalPrice: 0, optionId, listingOptionId }],
      });
      await seedCompletedOrderCoverageRun(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        startDate: '2026-03-02',
        endDate: '2026-03-02',
      });

      await publishedRows('2026-03-02');
      const result = await buildAdapter().calculateForRange(
        TEST_ORGANIZATION_ID,
        periodOf(FROM, TO),
      );

      // A measured zero is evidence for 03-02, but it cannot settle the
      // requested 03-01..03-03 scalar while the surrounding dates are absent.
      expect(result.revenue).toBeNull();
      expect(result.adCost).toBeNull();
      expect(result.sourceCoverage.orderDates).toEqual(['2026-03-02']);
      expect(result.sourceCoverage.adDates).toEqual(['2026-03-02']);
      // 03-01 and 03-03 carry no published ad row, so coverage stays partial.
      expect(result.adEvidenceComplete).toBe(false);
    });

    it('separates a failed ad read from an ad source with no published rows', async () => {
      let broken: PrismaClient;
      broken = new Proxy(prisma, {
        get(target, prop, receiver) {
          if (prop === '$transaction') {
            return async (callback: (tx: PrismaClient) => unknown) => callback(broken);
          }
          if (prop === '$queryRaw') {
            return async (...args: unknown[]) => {
              const sql = args[0] as { strings?: readonly string[] } | undefined;
              if ((sql?.strings ?? []).join('').includes('channel_ad_target_daily_snapshots')) {
                throw new Error('ledger unavailable');
              }
              return (target.$queryRaw as (...queryArgs: unknown[]) => unknown)(...args);
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      });
      await publishedRows();
      const failed = await new ProfitCalculationRepositoryAdapter(channelFactTestPorts(broken as unknown as PrismaService).accounts, channelFactTestPorts(broken as unknown as PrismaService).recipes,
        broken as unknown as PrismaService,
        new ProductTransactionalReadRepositoryAdapter(),
      )
        .calculateForRange(TEST_ORGANIZATION_ID, periodOf(FROM, TO));
      const emptyPublication = await buildAdapter().calculateForRange(
        TEST_ORGANIZATION_ID,
        periodOf(FROM, TO),
      );

      expect(failed.sourceCoverage.adDates).toEqual([]);
      expect(failed.adEvidenceError).toBe('AD_EVIDENCE_READ_FAILED');
      expect(emptyPublication.sourceCoverage.adDates).toEqual([]);
      expect(emptyPublication.adEvidenceError).toBeUndefined();
      // Both windows still know which dates were asked for.
      expect(failed.sourceCoverage.requestedDates).toEqual(REQUESTED);
      expect(emptyPublication.sourceCoverage.requestedDates).toEqual(REQUESTED);
      expect(failed.adEvidenceComplete).toBe(false);
      expect(emptyPublication.adEvidenceComplete).toBe(false);
    });

    it('computes profit for an organization that does not advertise', async () => {
      await seedFullyCoveredOrders('COV-NOT-APPLIED');
      await notApplied();

      const result = await buildAdapter().calculateForRange(
        TEST_ORGANIZATION_ID,
        periodOf(FROM, TO),
      );

      // No advertising account exists, so advertising is not an input to this
      // period. Ad cost is a genuine zero and profit is publishable.
      expect(result.revenue).toBe(DAILY_REVENUE * REQUESTED.length);
      expect(result.adCost).toBe(0);
      expect(result.adEvidenceComplete).toBe(true);
      expect(result.adEvidenceError).toBeUndefined();
      expect(result.netProfit).toBe(DAILY_PROFIT * REQUESTED.length);
      // The window is still named honestly: no ad date is fabricated to close
      // the coverage equality, so a later basis reads orders alone.
      expect(result.sourceCoverage.adDates).toEqual([]);
      expect(result.sourceCoverage.hasAdAccount).toBe(false);
      expect(result.sourceCoverage.orderDates).toEqual(REQUESTED);
    });

    it('withholds profit when an existing ad account published nothing', async () => {
      await seedFullyCoveredOrders('COV-MISSING');
      await publishedRows();

      const result = await buildAdapter().calculateForRange(
        TEST_ORGANIZATION_ID,
        periodOf(FROM, TO),
      );

      // Absent evidence is not an advertising cost of zero, so the same order
      // rows that computed a profit above must not produce one here.
      expect(result.revenue).toBe(DAILY_REVENUE * REQUESTED.length);
      expect(result.sourceCoverage.hasAdAccount).toBe(true);
      expect(result.adEvidenceComplete).toBe(false);
      expect(result.adEvidenceError).toBeUndefined();
      expect(result.netProfit).toBeNull();
      expect(result.profitRate).toBeNull();
    });

    it('withholds profit when only part of the range carries ad evidence', async () => {
      await seedFullyCoveredOrders('COV-PARTIAL');
      await publishedRows('2026-03-01', '2026-03-02');

      const result = await buildAdapter()
        .calculateForRange(TEST_ORGANIZATION_ID, periodOf(FROM, TO));

      // 03-03 was never published. A partially covered range cannot be read as
      // a whole-period ad cost, so profit stays withheld.
      expect(result.sourceCoverage.adDates).toEqual(['2026-03-01', '2026-03-02']);
      expect(result.sourceCoverage.hasAdAccount).toBe(true);
      expect(result.adEvidenceComplete).toBe(false);
      expect(result.netProfit).toBeNull();
    });

    it('computes profit for a fully covered window of collected zeros', async () => {
      await seedFullyCoveredOrders('COV-CONFIRMED-ZERO');
      await publishedRows(...REQUESTED);

      const result = await buildAdapter().calculateForRange(
        TEST_ORGANIZATION_ID,
        periodOf(FROM, TO),
      );

      // A collector-observed zero on every day is real evidence: it behaves
      // like OBSERVED with zero values, not like an absent source.
      expect(result.sourceCoverage.hasAdAccount).toBe(true);
      expect(result.adEvidenceComplete).toBe(true);
      expect(result.netProfit).toBe(DAILY_PROFIT * REQUESTED.length);
    });

    it('publishes a fully covered window as complete ad evidence', async () => {
      await publishedRows(...REQUESTED);
      const result = await buildAdapter().calculateForRange(
        TEST_ORGANIZATION_ID,
        periodOf(FROM, TO),
      );

      expect(result.sourceCoverage.adDates).toEqual(REQUESTED);
      expect(result.sourceCoverage.orderDates).toEqual([]);
      expect(result.adEvidenceComplete).toBe(true);
    });
  });

  /**
   * KID-114 — the dashboard profit card, the Top-N ranking and the P&L screen
   * apply one cost rule: recipe × Sellpia purchase price, commission and other
   * cost decided by the order's channel account, order shipping price. For the
   * same options and window they publish the same value, or no value, together.
   */
  describe('one cost rule across the profit card, Top-N and P&L', () => {
    const FROM = kstMonthStart(2026, 3);
    const TO = kstMonthStart(2026, 4);
    const AFTER = new Date('2026-07-01T00:00:00.000Z');

    async function sellOnce(
      code: string,
      opts: { orderChannel?: string; listingChannel?: string; purchasePrice: number | null },
    ) {
      const { id: masterId } = await setupMaster(prisma, {
        organizationId: TEST_ORGANIZATION_ID, code: `M-AGREE-${code}`, name: `Master AGREE-${code}`,
      });
      let skuId: string;
      if (opts.purchasePrice === null) {
        skuId = randomUUID();
        await seedSourceProduct(prisma, {
          id: skuId, organizationId: TEST_ORGANIZATION_ID, code: `SKU-AGREE-${code}`, name: `Unpriced ${code}`,
        });
      } else {
        skuId = (await setupProductOption(prisma, {
          organizationId: TEST_ORGANIZATION_ID, masterId, sku: `SKU-AGREE-${code}`, costPrice: opts.purchasePrice,
        })).id;
      }
      const listing = await setupChannelListing(prisma, {
        organizationId: TEST_ORGANIZATION_ID, masterId, channel: opts.listingChannel ?? 'naver',
        externalId: `EXT-AGREE-${code}`, optionId: skuId, externalOptionId: `VI-AGREE-${code}`,
      });
      await seedOrderWithLineItems(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: `AGREE-${code}`,
        orderedAt: '2026-03-10T03:00:00.000Z',
        shippingPrice: 1_000,
        ...(opts.orderChannel ? { orderChannel: opts.orderChannel } : {}),
        lineItems: [{ quantity: 1, totalPrice: 10_000, optionId: skuId, listingOptionId: listing.listingOptionId }],
      });
      await seedCompletedOrderCoverageRun(prisma, {
        organizationId: TEST_ORGANIZATION_ID, startDate: '2026-03-01', endDate: '2026-03-31',
      });
      return { listingId: listing.listingId };
    }

    async function profitEverywhere() {
      const client = prisma as unknown as PrismaService;
      const card = await new ProfitCalculationRepositoryAdapter(channelFactTestPorts(client).accounts, channelFactTestPorts(client).recipes,
        client,
        new ProductTransactionalReadRepositoryAdapter(),
      )
        .calculateForRange(TEST_ORGANIZATION_ID, periodOf(FROM, TO, { anchor: AFTER }));
      const topProducts = await new DashboardSalesRepositoryAdapter(channelFactTestPorts(client).accounts, channelFactTestPorts(client).listings, channelFactTestPorts(client).recipes,
        client,
        new ProductTransactionalReadRepositoryAdapter(),
        productAbcRead(prisma), profitCatalogTestReaders(client as never).content
      )
        .fetchTopProducts(TEST_ORGANIZATION_ID, FROM, TO);
      const profitLoss = await new ProfitLossService(client, new ProductTransactionalReadRepositoryAdapter(), profitCatalogTestReaders(client as never).accounts, profitCatalogTestReaders(client as never).listings, profitCatalogTestReaders(client as never).recipes, profitCatalogTestReaders(client as never).content)
        .findAll(TEST_ORGANIZATION_ID, 2026, 3, AFTER);
      return {
        card: card.netProfit,
        topProducts: topProducts.map((row) => row.netProfit),
        profitLossTotal: profitLoss.totals.netProfit,
        profitLossRows: profitLoss.rows.map((row) => row.netProfit),
      };
    }

    it('publishes one net profit for a Rocket line with a purchase cost', async () => {
      await sellOnce('ROCKET', { orderChannel: 'rocket', purchasePrice: 5_000 });

      // 10,000 revenue − 5,000 purchase cost − 1,000 order shipping; commission
      // and other cost are Not applied to a Rocket direct-purchase order.
      await expect(profitEverywhere()).resolves.toEqual({
        card: 4_000, topProducts: [4_000], profitLossTotal: 4_000, profitLossRows: [4_000],
      });
    });

    it('publishes no net profit anywhere for a line whose commission has no source', async () => {
      await sellOnce('NAVER', { purchasePrice: 5_000 });

      await expect(profitEverywhere()).resolves.toEqual({
        card: null, topProducts: [null], profitLossTotal: null, profitLossRows: [null],
      });
    });

    it('publishes no net profit anywhere for a Rocket line without a purchase cost', async () => {
      await sellOnce('UNPRICED', { orderChannel: 'rocket', purchasePrice: null });

      await expect(profitEverywhere()).resolves.toEqual({
        card: null, topProducts: [null], profitLossTotal: null, profitLossRows: [null],
      });
    });

    /**
     * Where advertising applies: the organization's active Coupang account
     * runs ads and the Rocket line sells on its Coupang listing. The sweep's
     * declared March decides the option's ad cost on all three screens, so a
     * March day it never declared leaves that cost, and every profit built on
     * it, unmeasured everywhere at once (ADR-0006).
     */
    async function advertiseMarch(listingId: string, opts: { declaresMarch15: boolean }) {
      const windows = opts.declaresMarch15
        ? [{ startDate: '2026-03-01', endDate: '2026-03-31' }]
        : [
          { startDate: '2026-03-01', endDate: '2026-03-14' },
          { startDate: '2026-03-16', endDate: '2026-03-31' },
        ];
      const runIds: string[] = [];
      for (const [index, window] of windows.entries()) {
        runIds.push(await seedCompletedAdSweepRun(prisma, {
          organizationId: TEST_ORGANIZATION_ID, generation: index + 1, window,
        }));
      }
      // The option's own measured spend, on a day the first sweep declared.
      await seedAd(prisma, {
        organizationId: TEST_ORGANIZATION_ID, listingId, date: '2026-03-10', spend: 500, runId: runIds[0],
      });
    }

    it('publishes one net profit for an advertised Rocket line the sweep measured all month', async () => {
      const { listingId } = await sellOnce('ADS-COVERED', {
        orderChannel: 'rocket', listingChannel: 'coupang', purchasePrice: 5_000,
      });
      await advertiseMarch(listingId, { declaresMarch15: true });

      // 10,000 revenue − 5,000 purchase cost − 1,000 order shipping − 500 measured ad spend.
      await expect(profitEverywhere()).resolves.toEqual({
        card: 3_500, topProducts: [3_500], profitLossTotal: 3_500, profitLossRows: [3_500],
      });
    });

    it('publishes no net profit anywhere for an advertised Rocket line when a sweep day is missing', async () => {
      const { listingId } = await sellOnce('ADS-MISSING-DAY', {
        orderChannel: 'rocket', listingChannel: 'coupang', purchasePrice: 5_000,
      });
      await advertiseMarch(listingId, { declaresMarch15: false });

      // The account's 15 March spend was never measured: neither the option's
      // ad cost nor a profit built on it exists on any screen.
      await expect(profitEverywhere()).resolves.toEqual({
        card: null, topProducts: [null], profitLossTotal: null, profitLossRows: [null],
      });
    });
  });
});
