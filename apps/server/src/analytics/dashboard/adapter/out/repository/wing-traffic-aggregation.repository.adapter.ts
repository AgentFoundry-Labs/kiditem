import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  businessDateText,
  businessDatesInWindow,
  type ResolvedDashboardPeriod,
} from '../../../domain/period/dashboard-period';
import {
  AD_ACCOUNT_DAILY_KPI_READ_PORT,
  type AdAccountDailyKpiReadPort,
} from '../../../../../advertising/application/port/in/ad-account-daily-kpi-source.port';
import {
  AD_TRAFFIC_READ_PORT,
  type AdTrafficReadPort,
} from '../../../../../advertising/application/port/in/ad-traffic-source.port';
import type {
  AdAccountDailyKpiPublishedRow,
  AdTrafficSourceAccountDaily,
  AdTrafficSourceDailyPublished,
  AdTrafficSourcePublished,
} from '@kiditem/shared/advertising';
import type {
  TrafficCoverage,
  TrafficMetricReconciliation,
  TrafficReconciliation,
  TrafficReconciliationStatus,
} from '@kiditem/shared/dashboard';
import type {
  TrafficAdditiveMetric,
  WingTrafficAggregationRepositoryPort,
  WingTrafficMetrics,
  CoupangAdsMetrics,
  WingDailyTrendRow,
  CoupangAdsDailyRow,
} from '../../../application/port/out/repository/wing-traffic-aggregation.repository.port';

const TRAFFIC_METRICS: readonly TrafficAdditiveMetric[] = [
  'views',
  'cartAdds',
  'orders',
  'salesQty',
  'revenue',
];

/**
 * Read adapter for the owner-published Wing account daily source.
 *
 * The owner publishes both accountDaily and optionDaily evidence. Account
 * metrics are deliberately read from accountDaily only: option rows can be
 * unmatched, can share a listing, and cannot be summed into account visitors
 * or account orders. Legacy rows/dashboard publications are accepted by the
 * shared compatibility union but are not a daily analytics source.
 */
@Injectable()
export class WingTrafficAggregationRepositoryAdapter
  implements WingTrafficAggregationRepositoryPort
{
  constructor(
    @Inject(AD_TRAFFIC_READ_PORT)
    private readonly trafficRead: AdTrafficReadPort,
    @Inject(AD_ACCOUNT_DAILY_KPI_READ_PORT)
    private readonly dailyKpiRead: AdAccountDailyKpiReadPort,
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

    const published = await this.readTrafficPublished(organizationId, range);
    const daily = published ? dailyPublication(published) : null;
    if (!daily) return emptyTrafficMetrics(targetDates);

    // A complete replacement supersedes the previous value for a date. Pick
    // the latest observed account original instead of double counting rows.
    const rows = selectAccountDailyRows(daily.accountDaily, range);
    const totals = sumAccountDaily(rows);
    const coverage = buildCoverage(targetDates, rows);
    const reconciliation = normalizeReconciliation(daily.reconciliation, totals);
    const complete = coverage.targetDays > 0
      && coverage.completedDays === coverage.targetDays;
    // A daily average divides by the days it actually covers. Dividing a
    // partial window by the days requested would understate every one of them,
    // which is the same error as reading a day nobody collected as a zero.
    const dailyAverageVisitors = coverage.completedDays > 0
      ? totals.visitors / coverage.completedDays
      : null;
    const latest = latestAccountDailyRow(rows);
    const revenueReconciliation = reconciliation.revenue;
    const revenueUsable = complete && revenueReconciliation.status !== 'MISMATCH';

    return {
      revenue: totals.revenue,
      orders: totals.orders,
      salesQty: totals.salesQty,
      // `visitors` is retained for compatibility, but it is an average of
      // account daily UV values rather than a sum or an option aggregation.
      visitors: dailyAverageVisitors ?? 0,
      views: totals.views,
      cartAdds: totals.cartAdds,
      // This is our orders/views ratio. Preserve full precision here; the
      // presentation layer owns percentage rounding. Provider's original
      // percentage remains separate in providerConversionRate.
      conversionRate: totals.views > 0
        ? (totals.orders / totals.views) * 100
        : 0,
      dailyAverageVisitors,
      providerConversionRate: providerConversionRate(daily, rows),
      sourceAttemptId: latest?.sourceAttemptId ?? daily.attemptId,
      coverage,
      reconciliation,
      exactPeriodEvidence: daily.periodSummary ?? daily.legacyExactPeriodEvidence,
      // A row with all explicit zeroes is still a complete collected day. A
      // partial range or a revenue mismatch is not eligible to drive a full
      // period revenue/effective-period fallback; detailed evidence remains
      // available through coverage/reconciliation below.
      isCollected: rows.length > 0,
      hasData: revenueUsable,
      lastObservedAt: latest ? new Date(latest.observedAt) : null,
    } satisfies WingTrafficMetrics;
  }

  async aggregateCoupangAds(
    organizationId: string,
    period: ResolvedDashboardPeriod,
  ): Promise<CoupangAdsMetrics> {
    const targetDates = period.selectedDates;
    const range = dateRangeOf(targetDates);
    if (!range) return emptyCoupangAdsMetrics();
    const rows = selectAdsRows(await this.readPublishedRows(organizationId, range), range);
    // The cutoff is the caller's anchor, never this process's clock.
    const coverage = buildAdsCoverage(targetDates, period.knownThrough, rows);

    let spend = 0;
    let revenue = 0;
    let impressions = 0;
    let clicks = 0;
    let conversions = 0;
    let orders = 0;
    let lastObservedAt: Date | null = null;

    for (const row of rows) {
      spend += toInt(row.normalized.adSpend);
      revenue += toInt(row.normalized.adRevenue);
      impressions += toInt(row.normalized.impressions);
      clicks += toInt(row.normalized.clicks);
      conversions += toInt(row.normalized.conversions);
      orders += toInt(row.normalized.orders);
      const observedAt = new Date(row.observedAt);
      if (!lastObservedAt || observedAt > lastObservedAt) {
        lastObservedAt = observedAt;
      }
    }

    const hasData = coverage.targetDays > 0
      && coverage.completedDays === coverage.targetDays;
    const conversionRate = clicks > 0 ? (orders / clicks) * 100 : null;
    const providerConversionRate = rows.length === 1
      ? numberOrNull(rows[0]?.normalized.providerConversionRate)
      : null;

    return {
      spend,
      revenue,
      impressions,
      clicks,
      conversions,
      orders,
      conversionRate,
      providerConversionRate,
      coverage,
      isCollected: rows.length > 0,
      hasData,
      lastObservedAt,
    } satisfies CoupangAdsMetrics;
  }

  /** Latest account daily date, never the legacy period start/businessDate. */
  async findLatestDataDate(
    organizationId: string,
  ): Promise<Date | null> {
    const [wing, ads] = await Promise.all([
      this.readTrafficPublished(organizationId),
      this.findLatestCoupangAdsDate(organizationId),
    ]);

    const dates = [
      wing ? latestTrafficDate(wing) : null,
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

    const published = await this.readTrafficPublished(organizationId, range);
    const daily = published ? dailyPublication(published) : null;
    if (!daily) return [];

    return selectAccountDailyRows(daily.accountDaily, range).map((row) => ({
      date: row.businessDate,
      revenue: row.revenue,
      orders: row.orders,
      salesQty: row.salesQty,
      visitors: row.visitors,
      views: row.views,
      cartAdds: row.cartAdds,
      observedAt: row.observedAt,
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
    const rows = selectAdsRows(await this.readPublishedRows(organizationId, range), range);

    return rows.map((row) => ({
      date: row.businessDate,
      ad_cost: toInt(row.normalized.adSpend),
      ad_revenue: toInt(row.normalized.adRevenue),
      clicks: toInt(row.normalized.clicks),
      impressions: toInt(row.normalized.impressions),
      conversions: toInt(row.normalized.conversions),
      orders: toInt(row.normalized.orders),
      observedAt: row.observedAt,
    } satisfies CoupangAdsDailyRow));
  }

  private async readPublishedRows(
    organizationId: string,
    range: { from: string; to?: string },
  ): Promise<AdAccountDailyKpiPublishedRow[]> {
    try {
      return (
        await this.dailyKpiRead.readPublished({
          organizationId,
          ...range,
        })
      ).rows;
    } catch (error) {
      if (
        error instanceof NotFoundException &&
        error.message === 'COUPANG_ACCOUNT_NOT_FOUND'
      ) {
        return [];
      }
      throw error;
    }
  }

  private async readTrafficPublished(
    organizationId: string,
    range?: { from?: string; to?: string },
  ): Promise<AdTrafficSourcePublished | null> {
    try {
      return await this.trafficRead.readPublished({
        organizationId,
        ...range,
      });
    } catch (error) {
      if (
        error instanceof NotFoundException &&
        ['COUPANG_ACCOUNT_NOT_FOUND', 'AD_TRAFFIC_SOURCE_MISSING'].includes(error.message)
      ) {
        return null;
      }
      throw error;
    }
  }

  private async findLatestCoupangAdsDate(
    organizationId: string,
  ): Promise<Date | null> {
    const rows = await this.readPublishedRows(organizationId, { from: '0001-01-01' });
    return rows.reduce<Date | null>((latest, row) => {
      const date = new Date(`${row.businessDate}T00:00:00.000Z`);
      return !latest || date > latest ? date : latest;
    }, null);
  }
}

type DateRange = { from: string; to?: string };
type AccountDailyRow = AdTrafficSourceAccountDaily;
type DailyTrafficPublication = AdTrafficSourceDailyPublished;

function dailyPublication(
  published: AdTrafficSourcePublished,
): DailyTrafficPublication | null {
  // AdTrafficSourcePublished is a compatibility union. Checking the new
  // accountDaily field is intentional: legacy rows/dashboard must never feed
  // account-level daily analytics.
  return 'accountDaily' in published ? published : null;
}

function selectAccountDailyRows(
  rows: ReadonlyArray<AccountDailyRow>,
  range: DateRange,
): AccountDailyRow[] {
  const byDate = new Map<string, AccountDailyRow>();
  for (const row of rows) {
    if (!dateInRange(row.businessDate, range)) continue;
    const current = byDate.get(row.businessDate);
    if (!current || Date.parse(row.observedAt) >= Date.parse(current.observedAt)) {
      byDate.set(row.businessDate, row);
    }
  }
  return [...byDate.values()].sort((a, b) => a.businessDate.localeCompare(b.businessDate));
}

function sumAccountDaily(rows: ReadonlyArray<AccountDailyRow>) {
  return rows.reduce(
    (sum, row) => ({
      visitors: sum.visitors + finiteInt(row.visitors),
      views: sum.views + finiteInt(row.views),
      cartAdds: sum.cartAdds + finiteInt(row.cartAdds),
      orders: sum.orders + finiteInt(row.orders),
      salesQty: sum.salesQty + finiteInt(row.salesQty),
      revenue: sum.revenue + finiteInt(row.revenue),
    }),
    { visitors: 0, views: 0, cartAdds: 0, orders: 0, salesQty: 0, revenue: 0 },
  );
}

function latestAccountDailyRow(rows: ReadonlyArray<AccountDailyRow>): AccountDailyRow | null {
  return rows.reduce<AccountDailyRow | null>(
    (latest, row) => !latest || Date.parse(row.observedAt) >= Date.parse(latest.observedAt)
      ? row
      : latest,
    null,
  );
}

function buildCoverage(
  targetDates: readonly string[],
  rows: ReadonlyArray<AccountDailyRow>,
): TrafficCoverage {
  const completed = new Set(rows.map((row) => row.businessDate));
  return {
    from: targetDates[0]!,
    to: targetDates[targetDates.length - 1]!,
    targetDays: targetDates.length,
    completedDays: targetDates.filter((date) => completed.has(date)).length,
    missingDates: targetDates.filter((date) => !completed.has(date)),
  };
}

function normalizeReconciliation(
  raw: Partial<TrafficReconciliation> | undefined,
  totals: ReturnType<typeof sumAccountDaily>,
): TrafficReconciliation {
  return Object.fromEntries(
    TRAFFIC_METRICS.map((metric) => {
      const value = raw?.[metric];
      if (value && isReconciliationStatus(value.status)) {
        return [metric, {
          status: value.status,
          dailySum: numberOrNull(value.dailySum),
          periodValue: numberOrNull(value.periodValue),
        } satisfies TrafficMetricReconciliation];
      }
      return [metric, {
        status: 'UNVERIFIED',
        dailySum: totals[metric],
        periodValue: null,
      } satisfies TrafficMetricReconciliation];
    }),
  ) as TrafficReconciliation;
}

function providerConversionRate(
  published: DailyTrafficPublication,
  rows: ReadonlyArray<AccountDailyRow>,
): number | null {
  const summaryValue = published.periodSummary?.accountSummary;
  if (typeof summaryValue?.providerConversionRate === 'number'
    && Number.isFinite(summaryValue.providerConversionRate)) {
    return summaryValue.providerConversionRate;
  }
  const legacy = published.legacyExactPeriodEvidence;
  if (legacy) {
    const value = legacy.providerConversionRate;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  // A single daily original is itself the provider's ratio for that day. For
  // multi-day ranges we do not average provider ratios or invent a period
  // provider value; the own orders/views ratio remains independently usable.
  if (rows.length === 1) return rows[0]?.providerConversionRate ?? null;
  return null;
}

function latestTrafficDate(published: AdTrafficSourcePublished): Date | null {
  const daily = dailyPublication(published);
  if (!daily) return null;
  return daily.accountDaily.reduce<Date | null>((latest, row) => {
    const date = new Date(`${row.businessDate}T00:00:00.000Z`);
    return !latest || date > latest ? date : latest;
  }, null);
}

function selectAdsRows(
  rows: ReadonlyArray<AdAccountDailyKpiPublishedRow>,
  range: DateRange,
): AdAccountDailyKpiPublishedRow[] {
  const byDate = new Map<string, AdAccountDailyKpiPublishedRow>();
  for (const row of rows) {
    if (!dateInRange(row.businessDate, range)) continue;
    const current = byDate.get(row.businessDate);
    if (!current || Date.parse(row.observedAt) >= Date.parse(current.observedAt)) {
      byDate.set(row.businessDate, row);
    }
  }
  return [...byDate.values()].sort((a, b) => a.businessDate.localeCompare(b.businessDate));
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
  rows: ReadonlyArray<AdAccountDailyKpiPublishedRow>,
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

/** Inclusive owner-read bounds for a resolved date set. */
function dateRangeOf(
  dates: readonly string[],
): { from: string; to: string } | null {
  if (dates.length === 0) return null;
  return { from: dates[0]!, to: dates[dates.length - 1]! };
}

function dateInRange(value: string, range: DateRange): boolean {
  return value >= range.from && (!range.to || value <= range.to);
}

function isReconciliationStatus(value: unknown): value is TrafficReconciliationStatus {
  return value === 'MATCHED' || value === 'MISMATCH' || value === 'UNVERIFIED';
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function finiteInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
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
    revenue: 0,
    orders: 0,
    salesQty: 0,
    visitors: 0,
    views: 0,
    cartAdds: 0,
    conversionRate: 0,
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

function emptyCoupangAdsMetrics(): CoupangAdsMetrics {
  return {
    spend: 0,
    revenue: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    orders: 0,
    conversionRate: null,
    providerConversionRate: null,
    coverage: null,
    isCollected: false,
    hasData: false,
    lastObservedAt: null,
  };
}

function toInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const cleaned = value.replace(/[,%]/g, '');
    const n = Number(cleaned);
    if (Number.isFinite(n)) return Math.max(0, Math.round(n));
  }
  return 0;
}
