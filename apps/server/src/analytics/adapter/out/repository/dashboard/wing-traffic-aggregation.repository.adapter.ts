import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../../../channels/application/port/in/account/channel-account.port';
import { ownerTransaction } from '../../../../../prisma/owner-transaction';
import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../../../../channels/application/port/in/listing/channel-listing-query.port';
import type { ListingTrafficDailyFact, ListingTrafficWindowFacts } from '../../../../../channels/domain/listing/observation-facts';
import { Inject,  Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { readAdWindowFacts, readLatestAdDate } from '../../../../../advertising/adapter/out/persistence/read/ad-target-facts';
import { addDays, parseBusinessDate } from '../../../../../common/kst';
import {
  ORDER_FACT_EXCLUDED_STATUSES,
  readDailyOrderFacts,
  readOrderLineWindowFacts,
  type DailyOrderFacts,
  type OrderLineWindowFacts,
} from '../../../../../orders/adapter/out/persistence/read/order-facts.reader';
import {
  businessDateText,
  businessDatesInWindow,
  type ResolvedDashboardPeriod,
} from '../../../../domain/dashboard/period/dashboard-period';
import { adTrafficReconciliationStatus } from '@kiditem/shared/advertising';
import type {
  TrafficCoverage,
  TrafficMetricReconciliation,
  TrafficReconciliation,
} from '@kiditem/shared/dashboard';
import type {
  TrafficAdditiveMetric,
  WingTrafficAggregationRepositoryPort,
  WingTrafficMetrics,
  CoupangAdsMetrics,
  WingDailyTrendRow,
  CoupangAdsDailyRow,
  DashboardAdRateFacts,
  DashboardTrafficFunnelFacts,
} from '../../../../application/port/out/repository/dashboard/wing-traffic-aggregation.repository.port';

const TRAFFIC_METRICS: readonly TrafficAdditiveMetric[] = [
  'views',
  'cartAdds',
  'orders',
  'salesQty',
  'revenue',
];

/**
 * Read adapter for owner-published listing-day traffic and advertising facts.
 *
 * Wing traffic totals come from the current-generation listing facts selected
 * by Channels' canonical reader. The source attempt supplies declared account
 * coverage, including provider-confirmed empty dates; advertising stays on its
 * independent target-day ledger.
 */
@Injectable()
export class WingTrafficAggregationRepositoryAdapter
  implements WingTrafficAggregationRepositoryPort
{
  constructor(
    @Inject(CHANNEL_LISTING_QUERY_PORT) private readonly channelListings: ChannelListingQueryPort,
    private readonly prisma: PrismaService,
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly channelAccounts: ChannelAccountPort,
  ) {}

  async aggregateTraffic(
    organizationId: string,
    period: ResolvedDashboardPeriod,
  ): Promise<WingTrafficMetrics> {
    // The caller resolved the date set; the adapter neither re-derives KST
    // business-date keys nor consults the wall clock.
    const targetDates = period.selectedDates;
    const range = dateRangeOf(targetDates);
    if (!range) return emptyTrafficMetrics();

    const traffic = await this.prisma.$transaction(
      (tx) => this.channelListings.readTrafficWindow(ownerTransaction(tx), {
        organizationId,
        from: dayStart(range.from),
        to: dayAfter(range.to),
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const totals = traffic.totals;
    const coverage = buildCoverage(targetDates, traffic.coverage);
    const reconciliation = normalizeReconciliation(totals);
    const complete = coverage.targetDays > 0
      && coverage.completedDays === coverage.targetDays;
    // A daily average divides by the days it actually covers. Dividing a
    // partial window by the days requested would understate every one of them,
    // which is the same error as reading a day nobody collected as a zero.
    const dailyAverageVisitors = coverage.completedDays > 0
      ? totals.visitors / coverage.completedDays
      : null;
    const revenueReconciliation = reconciliation.revenue;
    const revenueUsable = complete
      && adTrafficReconciliationStatus(revenueReconciliation) !== 'MISMATCH';
    // Additive totals measure only the dates the owner covered. A window with
    // no covered date has measured nothing, so it publishes no total at all.
    const measured = coverage.completedDays > 0;

    return {
      revenue: measured ? totals.revenue : null,
      orders: measured ? totals.orders : null,
      salesQty: measured ? totals.salesQty : null,
      // `visitors` is retained for compatibility, but it is an average of
      // the listing-day visitor totals over the dates with measured traffic.
      visitors: dailyAverageVisitors,
      views: measured ? totals.views : null,
      cartAdds: measured ? totals.cartAdds : null,
      // This is our orders/views ratio. Preserve full precision here; the
      // presentation layer owns percentage rounding. Provider's original
      // percentage remains separate in providerConversionRate.
      // Dashboard conversion is orders/views; a zero or absent denominator
      // has no measurable ratio.
      conversionRate: measured && totals.views > 0
        ? (totals.orders / totals.views) * 100
        : null,
      dailyAverageVisitors,
      providerConversionRate: null,
      sourceAttemptId: null,
      coverage,
      reconciliation,
      exactPeriodEvidence: null,
      // An included owner date is collected even when its evidence is an
      // empty-provider proof with no listing row. A partial range or a revenue
      // mismatch cannot drive a full-period revenue fallback.
      isCollected: traffic.coverage.includedDates.length > 0,
      hasData: revenueUsable,
      lastObservedAt: traffic.latestObservedAt,
    } satisfies WingTrafficMetrics;
  }

  async aggregateCoupangAds(
    organizationId: string,
    period: ResolvedDashboardPeriod,
  ): Promise<CoupangAdsMetrics> {
    const targetDates = period.selectedDates;
    const range = dateRangeOf(targetDates);
    if (!range) return emptyCoupangAdsMetrics();
    // The listing ledger holds the facts; the account ledger holds only the
    // days the ad-centre scrape happened to run. Reading the numbers from the
    // account summary is what made a fully covered month read `0/31일`.
    const { days: rows, observedAt: lastObservedAt } = await this.prisma.$transaction(
      (tx) => readAdWindowFacts(
        tx,
        { organizationId, from: dayStart(range.from), to: dayAfter(range.to) }, this.channelAccounts
      ),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    // The cutoff is the caller's anchor, never this process's clock.
    const coverage = buildAdsCoverage(targetDates, period.knownThrough, rows);

    let spend = 0;
    let revenue = 0;
    let impressions = 0;
    let clicks = 0;
    let conversions = 0;
    let orders = 0;
    let conversionsObserved = true;

    for (const row of rows) {
      spend += row.spend;
      revenue += row.revenue;
      impressions += row.impressions;
      clicks += row.clicks;
      conversions += row.conversions;
      orders += row.orders;
      if (!row.conversionsObserved) conversionsObserved = false;
    }

    // A measured date always returns a day row, so no row means nothing was
    // measured and no total is published. A conversion count is a measurement
    // only when every summed day observed the conversion columns.
    const measured = rows.length > 0;
    const conversionCountsMeasured = measured && conversionsObserved;
    const hasData = coverage.targetDays > 0
      && coverage.completedDays === coverage.targetDays;
    const conversionRate = conversionCountsMeasured && clicks > 0
      ? (orders / clicks) * 100
      : null;
    // The provider's own ratio lives on the account summary, which is no
    // longer this read's source. Ours is orders/clicks, published above.
    const providerConversionRate = null;

    return {
      spend: measured ? spend : null,
      revenue: measured ? revenue : null,
      impressions: measured ? impressions : null,
      clicks: measured ? clicks : null,
      conversions: conversionCountsMeasured ? conversions : null,
      orders: conversionCountsMeasured ? orders : null,
      conversionRate,
      providerConversionRate,
      coverage,
      isCollected: rows.length > 0,
      hasData,
      lastObservedAt,
    } satisfies CoupangAdsMetrics;
  }

  async readTrafficFunnel(
    organizationId: string,
    period: ResolvedDashboardPeriod,
  ): Promise<DashboardTrafficFunnelFacts> {
    const targetDates = period.selectedDates;
    const range = dateRangeOf(targetDates);
    if (!range) return emptyTrafficFunnel();

    return this.prisma.$transaction(
      async (tx) => {
        const ownerDateInput = {
          organizationId,
          from: dayStart(range.from),
          to: dayAfter(range.to),
        };
        const orderInput = {
          organizationId,
          from: period.queryWindow.from,
          to: period.queryWindow.to,
          excludedStatuses: ORDER_FACT_EXCLUDED_STATUSES,
        };
        const [traffic, orders] = await Promise.all([
          this.channelListings.readTrafficWindow(ownerTransaction(tx), ownerDateInput),
          readOrderLineWindowFacts(tx, orderInput, this.channelAccounts),
        ]);
        const optionIds = [...new Set(
          orders.orders.flatMap((order) =>
            order.lines.flatMap((line) => line.listingOptionId ? [line.listingOptionId] : [])),
        )];
        const options = optionIds.length > 0
          ? await this.channelListings.readOptionIdentities(ownerTransaction(tx), { organizationId, optionIds, activeOnly: true, channel: 'coupang' }).then(rows => rows.map(row => ({ id: row.optionId, listingId: row.listingId })))
          : [];
        return composeTrafficFunnel(
          targetDates,
          traffic,
          orders,
          options,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async readAdRateFacts(
    organizationId: string,
    period: ResolvedDashboardPeriod,
  ): Promise<DashboardAdRateFacts> {
    const targetDates = period.selectedDates;
    const range = dateRangeOf(targetDates);
    if (!range) return emptyAdRateFacts();

    return this.prisma.$transaction(
      async (tx) => {
        const ownerDateInput = {
          organizationId,
          from: dayStart(range.from),
          to: dayAfter(range.to),
        };
        const orderInput = {
          organizationId,
          from: period.queryWindow.from,
          to: period.queryWindow.to,
          excludedStatuses: ORDER_FACT_EXCLUDED_STATUSES,
        };
        const [ads, orderWindow, dailyOrders, traffic] = await Promise.all([
          readAdWindowFacts(tx, ownerDateInput, this.channelAccounts),
          readOrderLineWindowFacts(tx, orderInput, this.channelAccounts),
          readDailyOrderFacts(tx, orderInput),
          this.channelListings.readTrafficWindow(ownerTransaction(tx), ownerDateInput),
        ]);
        return composeAdRateFacts(
          targetDates,
          period.knownThrough,
          ads.days,
          orderWindow.window.includedDates,
          dailyOrders,
          traffic,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** Latest account daily date, never the legacy period start/businessDate. */
  async findLatestDataDate(
    organizationId: string,
  ): Promise<Date | null> {
    const [wing, ads] = await this.prisma.$transaction(
      async (tx) => {
        const traffic = await this.channelListings.readTrafficWindow(ownerTransaction(tx), { organizationId });
        const adDate = await readLatestAdDate(tx, organizationId, this.channelAccounts);
        return [traffic, adDate] as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    const dates = [
      wing.coverage.includedDates.length > 0
        ? dayStart(wing.coverage.includedDates[wing.coverage.includedDates.length - 1]!)
        : null,
      ads,
    ].filter((d): d is Date => d instanceof Date);
    if (dates.length === 0) return null;
    return dates.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b));
  }

  /**
   * Per-day Wing account traffic over a half-open `[since, until)` window.
   * Explicit zero account days are retained; legacy listing/period evidence
   * is not used to invent a daily point.
   */
  async fetchDailyTrend(
    organizationId: string,
    since: Date,
    until?: Date,
  ): Promise<WingDailyTrendRow[]> {
    const range = until
      ? dateRangeOf(businessDatesInWindow(since, until))
      : { from: businessDateText(since) };
    if (!range) return [];

    const traffic = await this.prisma.$transaction(
      (tx) => this.channelListings.readTrafficWindow(ownerTransaction(tx), {
        organizationId,
        from: dayStart(range.from),
        ...('to' in range ? { to: dayAfter(range.to) } : {}),
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    return aggregateTrafficDays(
      traffic.rows,
      traffic.coverage.includedDates,
      traffic.latestObservedAt,
    ).map((row) => ({
      date: row.businessDate,
      revenue: row.revenue,
      orders: row.orders,
      salesQty: row.salesQty,
      visitors: row.visitors,
      views: row.views,
      cartAdds: row.cartAdds,
      observedAt: row.observedAt.toISOString(),
    } satisfies WingDailyTrendRow));
  }

  /**
   * Per-day Coupang ads over `[since, until?)`. Pulls owner-published daily
   * KPI rows; this lane is independent from Wing traffic account originals.
   */
  async fetchDailyAds(
    organizationId: string,
    since: Date,
    until?: Date,
  ): Promise<CoupangAdsDailyRow[]> {
    const range = until
      ? dateRangeOf(businessDatesInWindow(since, until))
      : { from: businessDateText(since) };
    if (!range) return [];
    const { days } = await this.prisma.$transaction(
      (tx) => readAdWindowFacts(tx, {
        organizationId,
        from: dayStart(range.from),
        ...('to' in range ? { to: dayAfter(range.to) } : {}),
      }, this.channelAccounts),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    return days.map((row) => ({
      date: row.businessDate,
      ad_cost: row.spend,
    } satisfies CoupangAdsDailyRow));
  }

}

function composeTrafficFunnel(
  targetDates: readonly string[],
  traffic: ListingTrafficWindowFacts,
  orders: OrderLineWindowFacts,
  options: readonly Readonly<{ id: string; listingId: string }>[],
): DashboardTrafficFunnelFacts {
  const trafficDates = new Set(traffic.coverage.includedDates);
  const orderDates = new Set(orders.window.includedDates);
  const commonDates = targetDates.filter(
    (date) => trafficDates.has(date) && orderDates.has(date),
  );
  const commonDateSet = new Set(commonDates);
  const trafficRows = traffic.rows.filter((row) => trafficDates.has(row.businessDate));
  const trafficByKey = new Map(
    trafficRows.map((row) => [`${row.listingId}:${row.businessDate}`, row]),
  );
  const optionToListing = new Map(options.map((row) => [row.id, row.listingId]));
  const ordersByKey = new Map<string, {
    orderIds: Set<string>;
    quantity: number;
    revenue: number;
  }>();
  for (const order of orders.orders) {
    if (!orderDates.has(order.businessDate)) continue;
    for (const line of order.lines) {
      if (!line.listingOptionId) continue;
      const listingId = optionToListing.get(line.listingOptionId);
      if (!listingId) continue;
      const key = `${listingId}:${order.businessDate}`;
      const value = ordersByKey.get(key) ?? {
        orderIds: new Set<string>(),
        quantity: 0,
        revenue: 0,
      };
      value.orderIds.add(order.orderId);
      value.quantity += line.quantity;
      value.revenue += line.revenue;
      ordersByKey.set(key, value);
    }
  }

  const trafficTotals = trafficRows.reduce(
    (total, row) => ({
      visitors: total.visitors + row.visitors,
      views: total.views + row.views,
      cartAdds: total.cartAdds + row.cartAdds,
    }),
    { visitors: 0, views: 0, cartAdds: 0 },
  );
  const listingDateKeys = [...trafficByKey.keys()].filter((key) => {
    const date = key.slice(key.lastIndexOf(':') + 1);
    // A terminal Orders empty day proves zero orders for every traffic listing
    // on that date even though there is no Order row to join.
    return commonDateSet.has(date);
  });
  const datesWithTrafficRows = new Set(trafficRows.map((row) => row.businessDate));
  const datesWithOrderRows = new Set(
    [...ordersByKey.keys()].map((key) => key.slice(key.lastIndexOf(':') + 1)),
  );
  const explicitEmptyDates = commonDates.filter(
    (date) => !datesWithTrafficRows.has(date) && !datesWithOrderRows.has(date),
  );
  const commonOrderIds = new Set<string>();
  const commonTotals = listingDateKeys.reduce(
    (total, key) => {
      const trafficRow = trafficByKey.get(key);
      const orderRow = ordersByKey.get(key);
      for (const orderId of orderRow?.orderIds ?? []) commonOrderIds.add(orderId);
      return {
        views: total.views + (trafficRow?.views ?? 0),
        cartAdds: total.cartAdds + (trafficRow?.cartAdds ?? 0),
        quantity: total.quantity + (orderRow?.quantity ?? 0),
        revenue: total.revenue + (orderRow?.revenue ?? 0),
      };
    },
    { views: 0, cartAdds: 0, quantity: 0, revenue: 0 },
  );
  const commonOrderCount = commonOrderIds.size;
  const trafficMeasured = trafficDates.size > 0;
  const intersectionMeasured = listingDateKeys.length > 0 || explicitEmptyDates.length > 0;
  const intersectionDates = [...new Set([
    ...listingDateKeys.map((key) => key.slice(key.lastIndexOf(':') + 1)),
    ...explicitEmptyDates,
  ])].sort();
  const dailyAverageVisitors = trafficMeasured
    ? trafficTotals.visitors / trafficDates.size
    : null;
  const trafficCoverage = buildCoverage(targetDates, traffic.coverage);

  return {
    visitors: dailyAverageVisitors,
    views: trafficMeasured ? trafficTotals.views : null,
    cartAdds: trafficMeasured ? trafficTotals.cartAdds : null,
    cartRate: trafficMeasured && trafficTotals.views > 0
      ? (trafficTotals.cartAdds / trafficTotals.views) * 100
      : null,
    orders: intersectionMeasured ? commonOrderCount : null,
    orderCartRate: intersectionMeasured && commonTotals.cartAdds > 0
      ? (commonOrderCount / commonTotals.cartAdds) * 100
      : null,
    salesQty: intersectionMeasured ? commonTotals.quantity : null,
    revenue: intersectionMeasured ? commonTotals.revenue : null,
    conversionRate: intersectionMeasured && commonTotals.views > 0
      ? (commonOrderCount / commonTotals.views) * 100
      : null,
    dailyAverageVisitors,
    metricDates: {
      visitors: [...trafficDates],
      views: [...trafficDates],
      cartAdds: [...trafficDates],
      cartRate: trafficMeasured && trafficTotals.views > 0 ? [...trafficDates] : [],
      orders: intersectionMeasured ? intersectionDates : [],
      orderCartRate: intersectionMeasured && commonTotals.cartAdds > 0 ? intersectionDates : [],
      salesQty: intersectionMeasured ? intersectionDates : [],
      revenue: intersectionMeasured ? intersectionDates : [],
      conversionRate: intersectionMeasured && commonTotals.views > 0 ? intersectionDates : [],
    },
    intersectionListingCount: intersectionMeasured
      ? new Set(listingDateKeys.map((key) => key.slice(0, key.lastIndexOf(':')))).size
      : 0,
    intersectionListingDateCount: intersectionMeasured ? listingDateKeys.length : 0,
    trafficCoverage,
    trafficObservedAt: traffic.latestObservedAt,
    orderObservedAt: orders.window.observedAt,
  };
}

function composeAdRateFacts(
  targetDates: readonly string[],
  knownThrough: string,
  adDays: readonly Readonly<{ businessDate: string; spend: number }>[],
  orderIncludedDates: readonly string[],
  dailyOrders: readonly DailyOrderFacts[],
  traffic: ListingTrafficWindowFacts,
): DashboardAdRateFacts {
  const adCoverage = buildAdsCoverage(targetDates, knownThrough, adDays);
  const adComplete = adCoverage.targetDays > 0
    && adCoverage.completedDays === adCoverage.targetDays;
  const adByDate = new Map(adDays.map((row) => [row.businessDate, row.spend]));
  const orderDates = new Set(orderIncludedDates);
  const orderByDate = new Map(dailyOrders.map((row) => [row.day, row.revenue]));
  const orderIntersection = targetDates.filter(
    (date) => adByDate.has(date) && orderDates.has(date),
  );
  if (orderIntersection.length > 0) {
    return {
      adSpend: sumDates(orderIntersection, adByDate),
      revenue: sumDates(orderIntersection, orderByDate),
      revenueSource: 'orders',
      includedDates: orderIntersection,
      adCoverageComplete: adComplete,
    };
  }

  const trafficDates = new Set(traffic.coverage.includedDates);
  const wingIntersection = targetDates.filter(
    (date) => adByDate.has(date) && trafficDates.has(date),
  );
  if (wingIntersection.length > 0) {
    const wingRevenue = new Map<string, number>();
    for (const row of traffic.rows) {
      if (!trafficDates.has(row.businessDate)) continue;
      wingRevenue.set(
        row.businessDate,
        (wingRevenue.get(row.businessDate) ?? 0) + row.revenue,
      );
    }
    return {
      adSpend: sumDates(wingIntersection, adByDate),
      revenue: sumDates(wingIntersection, wingRevenue),
      revenueSource: 'wing',
      includedDates: wingIntersection,
      adCoverageComplete: adComplete,
    };
  }

  return emptyAdRateFacts(adComplete);
}

function sumDates(dates: readonly string[], values: ReadonlyMap<string, number>): number {
  return dates.reduce((sum, date) => sum + (values.get(date) ?? 0), 0);
}

function emptyTrafficFunnel(): DashboardTrafficFunnelFacts {
  return {
    visitors: null,
    views: null,
    cartAdds: null,
    cartRate: null,
    orders: null,
    orderCartRate: null,
    salesQty: null,
    revenue: null,
    conversionRate: null,
    dailyAverageVisitors: null,
    metricDates: {
      visitors: [],
      views: [],
      cartAdds: [],
      cartRate: [],
      orders: [],
      orderCartRate: [],
      salesQty: [],
      revenue: [],
      conversionRate: [],
    },
    intersectionListingCount: 0,
    intersectionListingDateCount: 0,
    trafficCoverage: null,
    trafficObservedAt: null,
    orderObservedAt: null,
  };
}

function emptyAdRateFacts(adCoverageComplete = false): DashboardAdRateFacts {
  return {
    adSpend: null,
    revenue: null,
    revenueSource: 'unavailable',
    includedDates: [],
    adCoverageComplete,
  };
}

type DateRange = { from: string; to?: string };

function buildCoverage(
  targetDates: readonly string[],
  facts: Readonly<{
    includedDates: readonly string[];
    invalidDates: readonly string[];
    missingDates: readonly string[];
  }>,
): TrafficCoverage {
  const completed = new Set(facts.includedDates);
  const unavailable = new Set([...facts.invalidDates, ...facts.missingDates]);
  return {
    from: targetDates[0]!,
    to: targetDates[targetDates.length - 1]!,
    targetDays: targetDates.length,
    completedDays: targetDates.filter((date) => completed.has(date)).length,
    missingDates: targetDates.filter((date) =>
      unavailable.has(date) || !completed.has(date)),
  };
}

/** Listing-day totals carry no provider period value, so nothing verifies them. */
function normalizeReconciliation(
  totals: {
    visitors: number;
    views: number;
    cartAdds: number;
    orders: number;
    salesQty: number;
    revenue: number;
  },
): TrafficReconciliation {
  return Object.fromEntries(
    TRAFFIC_METRICS.map((metric) => [metric, {
      dailySum: totals[metric],
      periodValue: null,
    } satisfies TrafficMetricReconciliation]),
  ) as TrafficReconciliation;
}

function buildAdsCoverage(
  targetDates: readonly string[],
  /**
   * Last KST business date the caller's anchor treats as closed. Coverage is
   * bounded by it, never by the newest row that happened to be returned, and
   * never by this process's clock: a future-dated row must remain visible as
   * outside the known cutoff rather than moving the cutoff forward.
   */
  knownThroughDate: string,
  rows: ReadonlyArray<{ businessDate: string }>,
) {
  const completedDates = new Set(rows.map((row) => row.businessDate));
  const to = targetDates[targetDates.length - 1]!;
  return {
    from: targetDates[0]!,
    to,
    knownThrough: to < knownThroughDate ? to : knownThroughDate,
    targetDays: targetDates.length,
    completedDays: targetDates.filter((date) => completedDates.has(date)).length,
    missingDates: targetDates.filter((date) => !completedDates.has(date)),
  };
}

/** UTC midnight of a business date, the key `businessDate` is stored under. */
function dayStart(date: string): Date {
  const parsed = parseBusinessDate(date);
  if (!parsed) throw new Error(`Invalid business date: ${date}`);
  return parsed;
}

/** The exclusive end of a `[from, to)` window whose last business date is `date`. */
function dayAfter(date: string): Date {
  return addDays(dayStart(date), 1);
}

/** Inclusive owner-read bounds for a resolved date set. */
function dateRangeOf(
  dates: readonly string[],
): { from: string; to: string } | null {
  if (dates.length === 0) return null;
  return { from: dates[0]!, to: dates[dates.length - 1]! };
}

function emptyTrafficMetrics(targetDates?: readonly string[]): WingTrafficMetrics {
  const coverage = targetDates && targetDates.length > 0
    ? {
        from: targetDates[0]!,
        to: targetDates[targetDates.length - 1]!,
        targetDays: targetDates.length,
        completedDays: 0,
        missingDates: [...targetDates],
      }
    : null;
  return {
    revenue: null,
    orders: null,
    salesQty: null,
    visitors: null,
    views: null,
    cartAdds: null,
    conversionRate: null,
    dailyAverageVisitors: null,
    providerConversionRate: null,
    sourceAttemptId: null,
    coverage,
    reconciliation: null,
    exactPeriodEvidence: null,
    isCollected: false,
    hasData: false,
    lastObservedAt: null,
  };
}

type DailyTrafficTotals = {
  businessDate: string;
  visitors: number;
  views: number;
  cartAdds: number;
  orders: number;
  salesQty: number;
  revenue: number;
  observedAt: Date;
};

function aggregateTrafficDays(
  rows: readonly ListingTrafficDailyFact[],
  includedDates: readonly string[],
  latestObservedAt: Date | null,
): DailyTrafficTotals[] {
  const byDate = new Map<string, DailyTrafficTotals>();
  const included = new Set(includedDates);
  for (const row of rows) {
    if (!included.has(row.businessDate)) continue;
    const current = byDate.get(row.businessDate);
    if (!current) {
      byDate.set(row.businessDate, {
        businessDate: row.businessDate,
        visitors: row.visitors,
        views: row.views,
        cartAdds: row.cartAdds,
        orders: row.orders,
        salesQty: row.salesQty,
        revenue: row.revenue,
        observedAt: row.observedAt,
      });
      continue;
    }
    current.visitors += row.visitors;
    current.views += row.views;
    current.cartAdds += row.cartAdds;
    current.orders += row.orders;
    current.salesQty += row.salesQty;
    current.revenue += row.revenue;
    if (row.observedAt > current.observedAt) current.observedAt = row.observedAt;
  }
  for (const businessDate of includedDates) {
    if (!byDate.has(businessDate) && latestObservedAt) {
      byDate.set(businessDate, {
        businessDate,
        visitors: 0,
        views: 0,
        cartAdds: 0,
        orders: 0,
        salesQty: 0,
        revenue: 0,
        observedAt: latestObservedAt,
      });
    }
  }
  return [...byDate.values()].sort((left, right) =>
    left.businessDate.localeCompare(right.businessDate));
}

function emptyCoupangAdsMetrics(): CoupangAdsMetrics {
  return {
    spend: null,
    revenue: null,
    impressions: null,
    clicks: null,
    conversions: null,
    orders: null,
    conversionRate: null,
    providerConversionRate: null,
    coverage: null,
    isCollected: false,
    hasData: false,
    lastObservedAt: null,
  };
}
