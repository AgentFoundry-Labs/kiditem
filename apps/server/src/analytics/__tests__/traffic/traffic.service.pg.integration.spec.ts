import { channelFactTestPorts, channelFactTestProviders } from '../../../test-helpers/channel-fact-ports';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { TrafficService } from '../../application/service/traffic/traffic.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { SourceFailureAlerts } from '../../../alerts/alerts.service';
import { AdTrafficSourceRepository } from '../../../advertising/adapter/out/repository/ad-traffic-source.repository';
import {
  AD_TRAFFIC_READ_PORT,
} from '../../../advertising/application/port/in/ad-traffic-source.port';
import { currentBusinessDate } from '../../../advertising/domain/business-date';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
  IDOR_SENTINEL,
} from '../../../test-helpers/real-prisma';
import type {
  AdTrafficSourceDailyPlan,
  AdTrafficSourceDailyReceiptInput,
  AdTrafficSourcePeriodReceiptInput,
} from '@kiditem/shared/advertising';
import type { PrismaClient } from '@prisma/client';

const DAY_MS = 86_400_000;
const WING_URL = 'https://wing.coupang.com/tenants/business-insight/sales-analysis';

type TrafficSummary = {
  visitors: number;
  views: number;
  cartAdds: number;
  orders: number;
  salesQty: number;
  revenue: number;
  providerConversionRate: number | null;
};

type MonthRange = {
  year: number;
  month: number;
  startDate: string;
  endDate: string;
  days: number;
};

const dateText = (value: Date): string => value.toISOString().slice(0, 10);
const dateShift = (date: string, days: number): string =>
  dateText(new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS));

function summary(overrides: Partial<TrafficSummary> = {}): TrafficSummary {
  return {
    visitors: 10,
    views: 20,
    cartAdds: 3,
    orders: 2,
    salesQty: 4,
    revenue: 300,
    providerConversionRate: null,
    ...overrides,
  };
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
      pvToOrder: values.providerConversionRate === null
        ? null
        : values.providerConversionRate / 100,
    },
  };
}

function previousMonthRange(reference = currentBusinessDate()): MonthRange {
  const currentMonthStart = new Date(Date.UTC(
    reference.getUTCFullYear(),
    reference.getUTCMonth(),
    1,
  ));
  const previousMonthEnd = new Date(currentMonthStart.getTime() - DAY_MS);
  const previousMonthStart = new Date(Date.UTC(
    previousMonthEnd.getUTCFullYear(),
    previousMonthEnd.getUTCMonth(),
    1,
  ));
  return {
    year: previousMonthEnd.getUTCFullYear(),
    month: previousMonthEnd.getUTCMonth() + 1,
    startDate: dateText(previousMonthStart),
    endDate: dateText(previousMonthEnd),
    days: Math.round((previousMonthEnd.getTime() - previousMonthStart.getTime()) / DAY_MS) + 1,
  };
}

/**
 * `TrafficService` reads owner-published account daily facts. Listing daily
 * snapshots are deliberately not a read fallback for Wing traffic.
 */
describe('TrafficService (PG integration) — daily facts', () => {
  let prisma: PrismaClient;
  let service: TrafficService;
  let trafficOwner: AdTrafficSourceRepository;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const prismaService = prisma as unknown as PrismaService;
    trafficOwner = new AdTrafficSourceRepository(channelFactTestPorts(prismaService).accounts, channelFactTestPorts(prismaService).listings,
      prismaService,
      new SourceFailureAlerts(prismaService),
    );
    const m = await Test.createTestingModule({
      providers: [
        ...channelFactTestProviders,
        TrafficService,
        { provide: PrismaService, useValue: prisma },
        { provide: AD_TRAFFIC_READ_PORT, useValue: trafficOwner },
      ],
    }).compile();
    service = m.get(TrafficService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  async function seedListing(organizationId: string, suffix: string) {
    const account = await prisma.channelAccount.create({
      data: {
        organizationId,
        channel: 'coupang',
        name: `Wing ${suffix}`,
        externalAccountId: `WING-${suffix}`,
        vendorId: `VENDOR-${suffix}`,
        isPrimary: true,
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId,
        channelAccountId: account.id,
        externalId: `EXT-${suffix}`,
      },
    });
    await prisma.channelListingOption.create({
      data: {
        organizationId,
        listingId: listing.id,
        externalOptionId: '1001',
        isActive: true,
      },
    });
    return listing;
  }

  function dailyReceipt(
    attemptId: string,
    plan: AdTrafficSourceDailyPlan,
    businessDate: string,
    values: TrafficSummary,
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
        visitors: values.visitors,
        views: values.views,
        cartAdds: values.cartAdds,
        orders: values.orders,
        salesQty: values.salesQty,
        revenue: values.revenue,
      }],
      accountSummary: values,
      accountSummaryRaw: rawSummary(`daily:${businessDate}`, values),
    };
  }

  function periodReceipt(
    attemptId: string,
    plan: AdTrafficSourceDailyPlan,
    values: TrafficSummary,
  ): AdTrafficSourcePeriodReceiptInput {
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

  /** Begins an owner attempt and uploads its receipts; the terminal submission is the caller's. */
  async function stageOwnerRange(
    organizationId: string,
    channelAccountId: string,
    startDate: string,
    endDate: string,
    dailyValues: TrafficSummary,
  ) {
    const started = await trafficOwner.beginAttempt({
      organizationId,
      idempotencyKey: randomUUID(),
      request: {
        channelAccountId,
        startDate,
        endDate,
        url: WING_URL,
      },
    });
    const control = await trafficOwner.readAttemptControl({
      organizationId,
      attemptId: started.attemptId,
    });
    if (!control) throw new Error('Owner attempt control was not created.');
    const plan = started.plan as AdTrafficSourceDailyPlan;
    const days = plan.expectedDates.length;
    for (const [index, businessDate] of plan.expectedDates.entries()) {
      await trafficOwner.uploadReceipt({
        organizationId,
        attemptId: started.attemptId,
        attemptToken: control.attemptToken,
        sequence: index * 100,
        receipt: dailyReceipt(started.attemptId, plan, businessDate, dailyValues),
      });
    }
    const periodValues: TrafficSummary = {
      ...dailyValues,
      visitors: dailyValues.visitors * days,
      views: dailyValues.views * days,
      cartAdds: dailyValues.cartAdds * days,
      orders: dailyValues.orders * days,
      salesQty: dailyValues.salesQty * days,
      revenue: dailyValues.revenue * days,
    };
    await trafficOwner.uploadReceipt({
      organizationId,
      attemptId: started.attemptId,
      attemptToken: control.attemptToken,
      sequence: days * 100,
      receipt: periodReceipt(started.attemptId, plan, periodValues),
    });
    const stagedControl = await trafficOwner.readAttemptControl({
      organizationId,
      attemptId: started.attemptId,
    });
    if (!stagedControl) throw new Error('Owner attempt control was lost.');
    return {
      attemptId: started.attemptId,
      attemptToken: control.attemptToken,
      manifestChecksum: stagedControl.manifestChecksum,
    };
  }

  async function collectOwnerRange(
    organizationId: string,
    channelAccountId: string,
    startDate: string,
    endDate: string,
    dailyValues: TrafficSummary,
  ) {
    const staged = await stageOwnerRange(organizationId, channelAccountId, startDate, endDate, dailyValues);
    await trafficOwner.finalizeAttempt({ organizationId, ...staged });
    return staged;
  }

  it('getTrafficSummary — owner coverage includes today and withholds incomplete totals', async () => {
    const listing = await seedListing(TEST_ORGANIZATION_ID, 'A');
    const today = dateText(currentBusinessDate());
    const closedEnd = dateShift(today, -1);
    await collectOwnerRange(
      TEST_ORGANIZATION_ID,
      listing.channelAccountId,
      dateShift(today, -7),
      closedEnd,
      summary({ revenue: 100, orders: 1, salesQty: 1, visitors: 10 }),
    );

    const result = await service.getTrafficSummary(7, TEST_ORGANIZATION_ID);
    expect(result).toMatchObject({
      revenue: null,
      orders: null,
      salesQty: null,
      visitors: null,
      averageDailyVisitors: null,
      coverage: {
        from: dateShift(today, -6),
        to: today,
        targetDays: 7,
        completedDays: 6,
        missingDates: [today],
      },
    });
  });

  it('getTrafficSummary — missing owner publication returns null metrics and explicit coverage', async () => {
    const today = dateText(currentBusinessDate());
    const result = await service.getTrafficSummary(7, TEST_ORGANIZATION_ID);
    expect(result).toMatchObject({
      revenue: null,
      orders: null,
      salesQty: null,
      visitors: null,
      averageDailyVisitors: null,
      coverage: {
        from: dateShift(today, -6),
        to: today,
        targetDays: 7,
        completedDays: 0,
        missingDates: Array.from({ length: 7 }, (_, index) => dateShift(today, -6 + index)),
      },
    });
  });

  it('getMonthlyRevenue — owner publications remain organization-scoped', async () => {
    const tListing = await seedListing(TEST_ORGANIZATION_ID, 'T');
    const oListing = await seedListing(OTHER_ORGANIZATION_ID, 'O');
    const range = previousMonthRange();

    await collectOwnerRange(
      TEST_ORGANIZATION_ID,
      tListing.channelAccountId,
      range.startDate,
      range.endDate,
      summary({ revenue: 500, orders: 5 }),
    );
    await collectOwnerRange(
      OTHER_ORGANIZATION_ID,
      oListing.channelAccountId,
      range.startDate,
      range.endDate,
      summary({ revenue: IDOR_SENTINEL, orders: IDOR_SENTINEL }),
    );

    const tResult = await service.getMonthlyRevenue(
      range.year,
      range.month,
      TEST_ORGANIZATION_ID,
    );
    expect(tResult.total.revenue).toBe(range.days * 500);
    expect(tResult.total.orders).toBe(range.days * 5);
    expect(tResult.total.revenue).not.toBe(IDOR_SENTINEL);

    const oResult = await service.getMonthlyRevenue(
      range.year,
      range.month,
      OTHER_ORGANIZATION_ID,
    );
    expect(oResult.total.revenue).toBe(range.days * IDOR_SENTINEL);
    expect(oResult.total.orders).toBe(range.days * IDOR_SENTINEL);
    expect(oResult.total.revenue).not.toBe(tResult.total.revenue);
  });

  it('getMonthlyRevenue — aggregates complete owner days, averages visitors, and blocks listing fallback', async () => {
    const listing = await seedListing(TEST_ORGANIZATION_ID, 'M');
    const legacyListing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: listing.channelAccountId,
        externalId: 'EXT-M-LEGACY',
      },
    });
    const range = previousMonthRange();
    await collectOwnerRange(
      TEST_ORGANIZATION_ID,
      listing.channelAccountId,
      range.startDate,
      range.endDate,
      summary({ visitors: 100, views: 20, cartAdds: 3, orders: 2, salesQty: 4, revenue: 1000 }),
    );
    await collectOwnerRange(
      TEST_ORGANIZATION_ID,
      listing.channelAccountId,
      dateShift(range.startDate, -1),
      dateShift(range.startDate, -1),
      summary({
        visitors: IDOR_SENTINEL,
        views: IDOR_SENTINEL,
        cartAdds: IDOR_SENTINEL,
        orders: IDOR_SENTINEL,
        salesQty: IDOR_SENTINEL,
        revenue: IDOR_SENTINEL,
      }),
    );

    // A legacy listing fact with a sentinel value must never supplement the
    // owner's accountDaily projection.
    await prisma.channelListingDailySnapshot.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId: legacyListing.id,
        channel: 'coupang',
        externalId: legacyListing.externalId,
        businessDate: new Date(`${range.startDate}T00:00:00.000Z`),
        trafficVisitors: IDOR_SENTINEL,
        trafficViews: IDOR_SENTINEL,
        trafficOrders: IDOR_SENTINEL,
        trafficSalesQty: IDOR_SENTINEL,
        trafficRevenue: IDOR_SENTINEL,
      },
    });

    const result = await service.getMonthlyRevenue(
      range.year,
      range.month,
      TEST_ORGANIZATION_ID,
    );
    expect(result.year).toBe(range.year);
    expect(result.month).toBe(range.month);
    expect(result.total).toEqual({
      revenue: range.days * 1000,
      orders: range.days * 2,
      salesQty: range.days * 4,
      visitors: 100,
      views: range.days * 20,
      cartAdds: range.days * 3,
    });
    expect(result.averageDailyVisitors).toBe(100);
    expect(result.days).toHaveLength(range.days);
    expect(result.coverage).toEqual({
      from: range.startDate,
      to: range.endDate,
      targetDays: range.days,
      completedDays: range.days,
      missingDates: [],
    });
  });

});
