// `/api/dashboard/sales` and `/api/dashboard/ad` each publish their own
// `effectivePeriod`, and the web renders both in one label row. They must agree
// on the same month and the same sources.
//
// This is Tier 3 rather than a service unit spec because the guarantee is only
// worth asserting where the two endpoints request *different* windows: a test
// is correct here only if the source answers the window it was actually asked
// for. A port mock can only do that by reimplementing the adapter's read
// semantics — which date has a row, when partial coverage becomes `hasData`,
// where the anchor cutoff sits — and that second implementation of the adapter
// would itself be untested (docs/TESTING.md, "Mock 이 어댑터를 흉내내기
// 시작하면 Tier 3 로 올린다"). So the window difference is made a database
// fact: the owners publish real rows, and both services read them through
// their real repository adapters.
//
// The month boundary is the day the guarantee can break. Anchoring the
// sales-side month on yesterday answered `wing`/`coupang_ads` from August
// while the ad endpoint answered `none` for September — both under a `2026-09`
// label (docs/adr/0001-dashboard-month-window-is-anchor-clipped.md).

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';

import { enumerateDashboardDates } from '@kiditem/shared/dashboard';
import type { AdCoverage } from '@kiditem/shared/dashboard';
import type {
  AdTrafficSourceDailyPlan,
  AdTrafficSourceDailyReceiptInput,
  AdTrafficSourcePeriodReceiptInput,
} from '@kiditem/shared/advertising';

import { DashboardAdService } from '../application/service/dashboard-ad.service';
import { DashboardSalesService } from '../application/service/dashboard-sales.service';
import { buildDashboardContext } from '../domain/context';
import { DashboardSalesRepositoryAdapter } from '../adapter/out/repository/dashboard-sales.repository.adapter';
import { ProductTransactionalReadRepositoryAdapter } from '../../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { PRODUCT_TRANSACTIONAL_READ_PORT } from '../../../products/application/port/in/product-transactional-read.port';
import { ProfitCalculationRepositoryAdapter } from '../adapter/out/repository/profit-calculation.repository.adapter';
import { WingTrafficAggregationRepositoryAdapter } from '../adapter/out/repository/wing-traffic-aggregation.repository.adapter';
import { DASHBOARD_SALES_REPOSITORY_PORT } from '../application/port/out/repository/dashboard-sales.repository.port';
import { PROFIT_CALCULATION_REPOSITORY_PORT } from '../application/port/out/repository/profit-calculation.repository.port';
import { WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT } from '../application/port/out/repository/wing-traffic-aggregation.repository.port';
import { PrismaService } from '../../../prisma/prisma.service';
import { SourceFailureAlerts } from '../../../alerts/alerts.service';
import { AdTrafficSourceRepository } from '../../../advertising/adapter/out/repository/ad-traffic-source.repository';
import { AD_TRAFFIC_READ_PORT } from '../../../advertising/application/port/in/ad-traffic-source.port';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../../test-helpers/real-prisma';
import type { PrismaClient } from '@prisma/client';
import { seedAd } from '../../../test-helpers/finance-seeds';

const WING_URL = 'https://wing.coupang.com/tenants/business-insight/sales-analysis';
const VENDOR_ID = 'VENDOR-AGREEMENT';

/**
 * Collection always starts on 1 August, so the previous calendar month is a
 * *complete* Wing/ads range in every case below. That is what makes "the 1st
 * reads nothing" a real assertion rather than a coincidence of missing data:
 * an endpoint that reached back a month would find a complete range and
 * publish it under the anchor month's label.
 */
const COLLECTED_FROM = '2026-08-01';

/** Per-collected-day Wing account figures published by the traffic owner. */
const WING_DAILY = {
  visitors: 120,
  views: 500,
  cartAdds: 40,
  orders: 10,
  salesQty: 12,
  revenue: 100_000,
  providerConversionRate: null,
} as const;

/** Per-collected-day Coupang ad figures the campaign sweep reported. */
const ADS_DAILY = {
  adSpend: 20_000,
  adRevenue: 80_000,
  impressions: 3_000,
  clicks: 150,
  conversions: 6,
  orders: 6,
} as const;

type TrafficSummary = {
  visitors: number;
  views: number;
  cartAdds: number;
  orders: number;
  salesQty: number;
  revenue: number;
  providerConversionRate: number | null;
};

interface EndpointPeriod {
  revenueSource: string;
  adSource: string;
  label: string;
}

interface AgreementReading {
  sales: EndpointPeriod;
  ad: EndpointPeriod;
  salesMonthly: { available: boolean; wingRevenue: number | null };
  adMonthly: { source: string; totalAdSpend: number | null };
  /** The month window the ad endpoint actually queried, as it publishes it. */
  adMonthCoverage: AdCoverage | null;
}

describe('effectivePeriod source agreement across dashboard endpoints (PG integration)', () => {
  let prisma: PrismaClient;
  let salesService: DashboardSalesService;
  let adService: DashboardAdService;
  let trafficOwner: AdTrafficSourceRepository;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    trafficOwner = new AdTrafficSourceRepository(
      prismaService,
      new SourceFailureAlerts(prismaService),
    );

    const m = await Test.createTestingModule({
      providers: [
        DashboardSalesService,
        DashboardAdService,
        DashboardSalesRepositoryAdapter,
        WingTrafficAggregationRepositoryAdapter,
        ProfitCalculationRepositoryAdapter,
        { provide: PRODUCT_TRANSACTIONAL_READ_PORT, useClass: ProductTransactionalReadRepositoryAdapter },
        { provide: PrismaService, useValue: prisma },
        {
          provide: PROFIT_CALCULATION_REPOSITORY_PORT,
          useExisting: ProfitCalculationRepositoryAdapter,
        },
        {
          provide: DASHBOARD_SALES_REPOSITORY_PORT,
          useExisting: DashboardSalesRepositoryAdapter,
        },
        {
          provide: WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT,
          useExisting: WingTrafficAggregationRepositoryAdapter,
        },
        // The source owners themselves, against the same database.
        { provide: AD_TRAFFIC_READ_PORT, useValue: trafficOwner },
      ],
    }).compile();
    salesService = m.get(DashboardSalesService);
    adService = m.get(DashboardAdService);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  /**
   * Publish one Wing traffic collection through the traffic owner and one
   * measured ad day in the advertising target-day ledger per business date
   * from 1 August through `collectedThrough`.
   *
   * Cases only read, so each group collects once in its own `beforeAll`.
   */
  async function collectThrough(collectedThrough: string): Promise<void> {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    const { channelAccountId, listingId } = await seedCoupangAccount();
    await publishWingTraffic(channelAccountId, COLLECTED_FROM, collectedThrough);
    for (const businessDate of enumerateDashboardDates(COLLECTED_FROM, collectedThrough)) {
      await seedAd(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        listingId,
        date: businessDate,
        spend: ADS_DAILY.adSpend,
        revenue: ADS_DAILY.adRevenue,
        impressions: ADS_DAILY.impressions,
        clicks: ADS_DAILY.clicks,
        conversions: ADS_DAILY.conversions,
        orders: ADS_DAILY.orders,
      });
    }
  }

  async function seedCoupangAccount(): Promise<{ channelAccountId: string; listingId: string }> {
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Agreement Wing',
        externalAccountId: 'WING-AGREEMENT',
        vendorId: VENDOR_ID,
        isPrimary: true,
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: 'EXT-AGREEMENT',
      },
    });
    await prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        externalOptionId: '1001',
        isActive: true,
      },
    });
    return { channelAccountId: account.id, listingId: listing.id };
  }

  function rawSummary(label: string, values: TrafficSummary) {
    return {
      source: 'wing.summary.body',
      label,
      summaryMetrics: {
        totalUniqueVisitor: values.visitors,
        totalPageViews: values.views,
        totalAddToCart: values.cartAdds,
        totalOrders: values.orders,
        totalUnitsSold: values.salesQty,
        totalGmv: values.revenue,
        pvToOrder: null,
      },
    };
  }

  function dailyTrafficReceipt(
    attemptId: string,
    plan: AdTrafficSourceDailyPlan,
    businessDate: string,
  ): AdTrafficSourceDailyReceiptInput {
    return {
      key: `${attemptId}:daily:${businessDate}`,
      capturedAt: `${businessDate}T01:00:00.000Z`,
      url: WING_URL,
      providerVendorId: plan.providerVendorId,
      kind: 'daily_page',
      filterScope: plan.filterScope,
      businessDate,
      startDate: businessDate,
      endDate: businessDate,
      period: 1,
      pageIndex: 1,
      proof: {
        expectedPages: 1,
        visitedPages: [1],
        terminalPageObserved: true,
        verified: true,
        complete: true,
      },
      data: [{
        vendorItemId: '1001',
        visitors: WING_DAILY.visitors,
        views: WING_DAILY.views,
        cartAdds: WING_DAILY.cartAdds,
        orders: WING_DAILY.orders,
        salesQty: WING_DAILY.salesQty,
        revenue: WING_DAILY.revenue,
      }],
      accountSummary: { ...WING_DAILY },
      accountSummaryRaw: rawSummary(`daily:${businessDate}`, { ...WING_DAILY }),
    };
  }

  function periodTrafficReceipt(
    attemptId: string,
    plan: AdTrafficSourceDailyPlan,
    days: number,
  ): AdTrafficSourcePeriodReceiptInput {
    const values: TrafficSummary = {
      visitors: WING_DAILY.visitors * days,
      views: WING_DAILY.views * days,
      cartAdds: WING_DAILY.cartAdds * days,
      orders: WING_DAILY.orders * days,
      salesQty: WING_DAILY.salesQty * days,
      revenue: WING_DAILY.revenue * days,
      providerConversionRate: null,
    };
    return {
      key: `${attemptId}:period`,
      capturedAt: `${plan.endDate}T02:00:00.000Z`,
      url: WING_URL,
      providerVendorId: plan.providerVendorId,
      kind: 'period_summary',
      filterScope: plan.filterScope,
      startDate: plan.startDate,
      endDate: plan.endDate,
      period: plan.periodDays,
      accountSummary: values,
      accountSummaryRaw: rawSummary('period', values),
    };
  }

  /** Publish one Wing traffic collection covering `[startDate, endDate]`. */
  async function publishWingTraffic(
    channelAccountId: string,
    startDate: string,
    endDate: string,
  ): Promise<void> {
    const started = await trafficOwner.beginAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      idempotencyKey: randomUUID(),
      request: { channelAccountId, startDate, endDate, url: WING_URL },
    });
    const control = await trafficOwner.readAttemptControl({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: started.attemptId,
    });
    if (!control) throw new Error('Wing traffic attempt control was not created.');
    const plan = started.plan as AdTrafficSourceDailyPlan;
    for (const [index, businessDate] of plan.expectedDates.entries()) {
      await trafficOwner.uploadReceipt({
        organizationId: TEST_ORGANIZATION_ID,
        attemptId: started.attemptId,
        attemptToken: control.attemptToken,
        sequence: index * 100,
        receipt: dailyTrafficReceipt(started.attemptId, plan, businessDate),
      });
    }
    await trafficOwner.uploadReceipt({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: started.attemptId,
      attemptToken: control.attemptToken,
      sequence: plan.expectedDates.length * 100,
      receipt: periodTrafficReceipt(started.attemptId, plan, plan.expectedDates.length),
    });
    const staged = await trafficOwner.readAttemptControl({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: started.attemptId,
    });
    if (!staged) throw new Error('Wing traffic attempt control was lost.');
    await trafficOwner.finalizeAttempt({
      organizationId: TEST_ORGANIZATION_ID,
      attemptId: started.attemptId,
      attemptToken: control.attemptToken,
      manifestChecksum: staged.manifestChecksum,
    });
  }

  /**
   * Both endpoints answered from the same published rows, for one anchor. No
   * orders exist, so `revenueSource`/`adSource` are decided purely by which
   * business dates each endpoint's month window asks the sources for.
   */
  async function readAt(anchor: Date): Promise<AgreementReading> {
    const ctx = buildDashboardContext('month', undefined, undefined, anchor);
    const sales = await salesService.getSummary(ctx, TEST_ORGANIZATION_ID);
    const ad = await adService.getSummary(ctx, TEST_ORGANIZATION_ID);

    return {
      sales: {
        revenueSource: sales.effectivePeriod!.revenueSource,
        adSource: sales.effectivePeriod!.adSource ?? 'none',
        label: sales.effectivePeriod!.label,
      },
      ad: {
        revenueSource: ad.effectivePeriod!.revenueSource,
        adSource: ad.effectivePeriod!.adSource ?? 'none',
        label: ad.effectivePeriod!.label,
      },
      salesMonthly: {
        available: sales.monthly.available,
        wingRevenue: sales.monthly.wingRevenue ?? null,
      },
      adMonthly: {
        source: ad.monthly.source ?? 'unavailable',
        totalAdSpend: ad.monthly.totalAdSpend ?? null,
      },
      adMonthCoverage: ad.monthly.coverage ?? null,
    };
  }

  // 2026-09-01 12:00 KST — September has no closed day yet.
  const FIRST_OF_MONTH = new Date('2026-09-01T03:00:00.000Z');
  // 2026-09-02 12:00 KST — exactly one closed day of the month.
  const SECOND_OF_MONTH = new Date('2026-09-02T03:00:00.000Z');
  // 2026-09-08 12:00 KST — seven closed days.
  const MID_MONTH = new Date('2026-09-08T03:00:00.000Z');

  describe('on the 1st, with every day of the previous month collected', () => {
    // The realistic state on 1 September: August is complete, September has
    // published nothing yet. Both endpoints must answer for September anyway.
    beforeAll(() => collectThrough('2026-08-31'), 120_000);

    it('agrees, where the two month windows used to diverge', async () => {
      const { sales, ad } = await readAt(FIRST_OF_MONTH);

      expect(ad.revenueSource).toBe(sales.revenueSource);
      expect(ad.adSource).toBe(sales.adSource);
      // Neither endpoint may reach into August to fill a September label.
      expect(sales).toEqual({ revenueSource: 'none', adSource: 'none', label: '2026-09' });
      expect(ad).toEqual({ revenueSource: 'none', adSource: 'none', label: '2026-09' });
    });

    it('publishes no month value, still labelled with the anchor month', async () => {
      const at = await readAt(FIRST_OF_MONTH);

      // An empty month window is the correct outcome, not a gap to backfill.
      expect(at.adMonthCoverage).toBeNull();
      expect(at.adMonthly).toEqual({ source: 'unavailable', totalAdSpend: null });
      expect(at.salesMonthly).toEqual({ available: false, wingRevenue: null });
      expect(at.sales.label).toBe('2026-09');
      expect(at.ad.label).toBe('2026-09');
    });
  });

  describe('with the anchor month collected through the 7th', () => {
    beforeAll(() => collectThrough('2026-09-07'), 120_000);

    // The ad endpoint used to read its `effectivePeriod` Wing evidence over
    // the whole calendar month — future dates included — so it reported `none`
    // for a month the sales endpoint reported as `wing`, on every day, not
    // only the 1st. Both now read the month window the sources are actually
    // closed for. This is also the complete-Wing-month case: a full,
    // reconciled account range is what makes `wing` the answer.
    it('decides revenueSource from one Wing window mid-month', async () => {
      const { sales, ad } = await readAt(MID_MONTH);

      expect(ad.revenueSource).toBe(sales.revenueSource);
      expect(ad.adSource).toBe(sales.adSource);
      expect(sales.revenueSource).toBe('wing');
      // Advertising has one ledger; a month window the sweep covered end to
      // end names it, and a window that reached past the closed days would
      // leave it incomplete and name none.
      expect(sales.adSource).toBe('coupang_ads');
      expect(sales.label).toBe('2026-09');
    });

    it('covers exactly the 1st on the 2nd', async () => {
      const at = await readAt(SECOND_OF_MONTH);

      // The anchor is the cutoff, not the newest published row: rows for the
      // 2nd through the 7th exist here and must stay outside this window.
      expect(at.adMonthCoverage).toEqual({
        from: '2026-09-01',
        to: '2026-09-01',
        knownThrough: '2026-09-01',
        targetDays: 1,
        completedDays: 1,
        missingDates: [],
      });
      expect(at.adMonthly).toEqual({ source: 'coupang_ads', totalAdSpend: ADS_DAILY.adSpend });
      expect(at.sales.label).toBe('2026-09');
    });

    it('is unchanged mid-month: every closed day of the anchor month', async () => {
      const at = await readAt(MID_MONTH);

      expect(at.adMonthCoverage).toEqual({
        from: '2026-09-01',
        to: '2026-09-07',
        knownThrough: '2026-09-07',
        targetDays: 7,
        completedDays: 7,
        missingDates: [],
      });
      expect(at.adMonthly).toEqual({
        source: 'coupang_ads',
        totalAdSpend: 7 * ADS_DAILY.adSpend,
      });
      expect(at.salesMonthly).toEqual({
        available: true,
        wingRevenue: 7 * WING_DAILY.revenue,
      });
    });
  });
});
