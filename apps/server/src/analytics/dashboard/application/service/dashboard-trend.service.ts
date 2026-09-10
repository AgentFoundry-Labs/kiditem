import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  DashboardMetricBasisMap,
  DashboardTrendItem,
} from '@kiditem/shared/dashboard';
import {
  PROFIT_CALCULATION_REPOSITORY_PORT,
  type ProfitCalculationRepositoryPort,
} from '../port/out/repository/profit-calculation.repository.port';
import {
  DASHBOARD_TREND_REPOSITORY_PORT,
  type DashboardTrendRepositoryPort,
} from '../port/out/repository/dashboard-trend.repository.port';
import {
  WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT,
  type WingTrafficAggregationRepositoryPort,
} from '../port/out/repository/wing-traffic-aggregation.repository.port';
import { kstBusinessDate, kstDayStart } from '../../../../common/kst';

@Injectable()
export class DashboardTrendService {
  private readonly logger = new Logger(DashboardTrendService.name);

  constructor(
    @Inject(PROFIT_CALCULATION_REPOSITORY_PORT)
    private readonly profitCalculation: ProfitCalculationRepositoryPort,
    @Inject(DASHBOARD_TREND_REPOSITORY_PORT)
    private readonly trendRepository: DashboardTrendRepositoryPort,
    @Inject(WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT)
    private readonly wingTrafficRepository: WingTrafficAggregationRepositoryPort,
  ) {}

  async getTrend(organizationId: string, range: string): Promise<DashboardTrendItem[]> {
    const startedAt = Date.now();
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    // Trend windows are explicit half-open KST business-date ranges. The
    // current in-progress KST day is excluded, so no future/partial row can
    // shift the selected date set or make a missing day look collected.
    const until = kstDayStart(new Date());
    const since = new Date(until.getTime() - days * 86_400_000);
    const selectedDates = enumerateDates(
      businessDateText(since),
      businessDateText(until),
    );

    // A failed source is not the same thing as an empty source. Keep each
    // read independent so a valid order/Wing series survives an ad outage;
    // the per-metric basis below marks the affected dates unverified.
    const [dailyProfitResult, orderResult, wingResult, adsResult] = await Promise.all([
      settle(() => this.profitCalculation.calculateDailyForRange(organizationId, since, until)),
      settle(() => this.trendRepository.fetchTrendRevenueRows(organizationId, since, until)),
      settle(() => this.wingTrafficRepository.fetchDailyTrend(organizationId, since, until)),
      settle(() => this.wingTrafficRepository.fetchDailyAds(organizationId, since, until)),
    ]);
    const dailyProfitRows = dailyProfitResult.rows;
    const orderRows = orderResult.rows;
    const wingDailyRows = wingResult.rows;
    const coupangAdsRows = adsResult.rows;
    for (const [source, result] of [
      ['profit', dailyProfitResult],
      ['orders', orderResult],
      ['wing_traffic', wingResult],
      ['coupang_ads', adsResult],
    ] as const) {
      if (result.error) {
        this.logger.warn({
          msg: 'dashboard-trend.source-unverified',
          organizationId,
          source,
          error: result.error instanceof Error ? result.error.message : 'unknown error',
        });
      }
    }

    const profitByDate = new Map(dailyProfitRows.map((row) => [row.date, row]));
    const orderRevByDate = new Map(orderRows.map((r) => [r.date, Number(r.revenue)]));
    const wingByDate = new Map(wingDailyRows.map((r) => [r.date, r]));
    const coupangAdsByDate = new Map(coupangAdsRows.map((r) => [r.date, r]));

    const result: DashboardTrendItem[] = selectedDates
      .map((date) => {
        const dailyProfit = profitByDate.get(date);
        const hasDailyOrderRow = dailyProfit?.hasOrderEvidence === true;
        const hasOrderRow = hasDailyOrderRow || orderRevByDate.has(date);
        const wingRow = wingByDate.get(date);
        const hasWingRow = wingRow !== undefined;
        const orderRev = hasDailyOrderRow
          ? dailyProfit?.revenue ?? 0
          : orderRevByDate.get(date) ?? 0;
        const wingRev = wingRow?.revenue ?? 0;
        // Prefer order revenue when present; otherwise the Wing/Drive
        // daily fact. Wing rows can be negative (returns spike) which we
        // preserve so the trend line reflects reality.
        const revenue = hasOrderRow ? orderRev : hasWingRow ? wingRev : null;

        // Account owner ads are the only account-level ad source. A collected
        // zero is valid; absence is unknown rather than a fabricated zero.
        const adRow = coupangAdsByDate.get(date);
        const adCost = adRow !== undefined
          ? Number(adRow.ad_cost)
          : dailyProfit?.adCost ?? null;
        const ownerAdEvidence = dailyProfit?.hasAdEvidence === true
          && dailyProfit.adCost !== null;
        const externalAdEvidence = adRow !== undefined;
        // Either reader can provide the authoritative account-ad fact. A
        // failed owner read must not invalidate a same-date external ad row,
        // and vice versa; only the absence of both plus a read error is
        // unverified evidence.
        const adEvidenceError = !externalAdEvidence
          && !ownerAdEvidence
          && (dailyProfit?.adEvidenceError !== undefined || adsResult.error !== null);
        const orderEvidenceError = !hasDailyOrderRow
          && orderResult.error !== null;
        const profitError = dailyProfitResult.error !== null
          || adEvidenceError
          || (dailyProfit?.costComplete === false && hasDailyOrderRow);
        // Profit is published only from the adapter's same-date calculation.
        // A whole-range margin or an incomplete cost row must never become a
        // fabricated daily zero/number.
        const profit = hasDailyOrderRow
          && dailyProfit
          && dailyProfit.costComplete
          && adCost !== null
          && !profitError
          ? Math.round(dailyProfit.revenue - dailyProfit.cost - adCost)
          : null;
        const revenueSource = hasOrderRow
          ? ['orders']
          : hasWingRow
            ? ['wing_traffic']
            : ['orders', 'wing_traffic'];
        const revenueError = (orderEvidenceError && !hasWingRow)
          || (!hasOrderRow && wingResult.error !== null);
        const revenueQueryFailures = [
          ...(dailyProfitResult.error ? ['profit'] : []),
          ...(orderResult.error ? ['orders'] : []),
          ...(!hasOrderRow && wingResult.error ? ['wing_traffic'] : []),
        ];
        const profitQueryFailures = [
          ...(dailyProfitResult.error ? ['profit'] : []),
          ...(adEvidenceError ? ['coupang_ads'] : []),
        ];
        const adQueryFailures = adEvidenceError ? ['coupang_ads'] : [];
        const metricBasis: DashboardMetricBasisMap = {
          revenue: singleDateBasis(
            date,
            revenue !== null,
            revenueSource,
            revenueError,
            hasOrderRow ? null : wingRow?.observedAt ?? null,
            false,
            revenueQueryFailures,
          ),
          profit: singleDateBasis(
            date,
            profit !== null,
            ['orders', 'coupang_ads'],
            profitError,
            adRow?.observedAt ?? null,
            dailyProfit?.costComplete === false && hasDailyOrderRow,
            profitQueryFailures,
          ),
          adCost: singleDateBasis(
            date,
            adCost !== null,
            ['coupang_ads'],
            adEvidenceError,
            adRow?.observedAt ?? null,
            false,
            adQueryFailures,
          ),
        };
        return { date, revenue, profit, adCost, metricBasis } satisfies DashboardTrendItem;
      });

    this.logger.debug({
      msg: 'dashboard-trend.getTrend',
      organizationId,
      range,
      days,
      rowCount: result.length,
      dailyProfitRowCount: dailyProfitRows.length,
      latencyMs: Date.now() - startedAt,
    });

    return result;
  }
}

function businessDateText(value: Date): string {
  return kstBusinessDate(value).toISOString().slice(0, 10);
}

function enumerateDates(from: string, to: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor.getTime() < end.getTime()) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function singleDateBasis(
  date: string,
  included: boolean,
  sources: string[],
  unverified = false,
  observedAt: string | null = null,
  invalid = false,
  queryFailedSources: string[] = [],
): DashboardMetricBasisMap[string] {
  const status = included ? 'complete' : unverified ? 'unverified' : 'empty';
  const uniqueQueryFailedSources = [...new Set(queryFailedSources)];
  return {
    kind: 'period',
    from: date,
    to: date,
    targetDays: 1,
    includedDates: included ? [date] : [],
    includedDays: included ? 1 : 0,
    missingDates: included ? [] : [date],
    invalidDates: invalid ? [date] : [],
    sources,
    ...(uniqueQueryFailedSources.length > 0 ? { queryFailedSources: uniqueQueryFailedSources } : {}),
    status,
    partial: false,
    observedAt,
  };
}

interface SettledRows<T> {
  rows: T[];
  error: unknown | null;
}

async function settle<T>(read: () => Promise<T[]>): Promise<SettledRows<T>> {
  try {
    return { rows: await read(), error: null };
  } catch (error) {
    return { rows: [], error };
  }
}
