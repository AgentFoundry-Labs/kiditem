import { Inject, Injectable, Logger } from '@nestjs/common';
import { buildPeriodBasis } from '@kiditem/shared/dashboard';
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
import { resolveDashboardPeriod } from '../../domain/period/dashboard-period';
import {
  COUPANG_ADS_SOURCE,
  ORDERS_SOURCE,
  PROFIT_CALCULATION_SOURCE,
  WING_TRAFFIC_SOURCE,
  type DashboardSourceName,
} from '../../domain/evidence';
import type { DashboardContext } from '../../domain/context';

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

  async getTrend(
    ctx: DashboardContext,
    organizationId: string,
  ): Promise<DashboardTrendItem[]> {
    const startedAt = Date.now();
    // Trend windows are explicit half-open KST business-date ranges resolved
    // against the caller's anchor — never this process's clock. The current
    // in-progress KST day is excluded, so no future/partial row can shift the
    // selected date set or make a missing day look collected.
    const period = resolveDashboardPeriod(ctx, ctx.anchor, 'closed_day_clipped').selected;
    const { from: since, to: until } = period.queryWindow;
    const selectedDates = period.selectedDates;

    // A failed source is not the same thing as an empty source. Keep each
    // read independent so a valid order/Wing series survives an ad outage;
    // the per-metric basis below marks the affected dates unverified.
    const [dailyProfitResult, orderResult, wingResult, adsResult] = await Promise.all([
      settle(() => this.profitCalculation.calculateDailyForRange(organizationId, period)),
      settle(() => this.trendRepository.fetchTrendRevenueRows(organizationId, since, until)),
      settle(() => this.wingTrafficRepository.fetchDailyTrend(organizationId, since, until)),
      settle(() => this.wingTrafficRepository.fetchDailyAds(organizationId, since, until)),
    ]);
    const dailyProfitRows = dailyProfitResult.rows;
    const orderRows = orderResult.rows;
    const wingDailyRows = wingResult.rows;
    const coupangAdsRows = adsResult.rows;
    for (const [source, result] of [
      [PROFIT_CALCULATION_SOURCE, dailyProfitResult],
      [ORDERS_SOURCE, orderResult],
      [WING_TRAFFIC_SOURCE, wingResult],
      [COUPANG_ADS_SOURCE, adsResult],
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
        const revenueSource: DashboardSourceName[] = hasOrderRow
          ? [ORDERS_SOURCE]
          : hasWingRow
            ? [WING_TRAFFIC_SOURCE]
            : [ORDERS_SOURCE, WING_TRAFFIC_SOURCE];
        // Status is derived from the evidence, so each basis states only what
        // it measured: which dates it has, which it rejected, and which
        // required read threw.
        const revenueQueryFailures: DashboardSourceName[] = [
          ...(dailyProfitResult.error ? [PROFIT_CALCULATION_SOURCE] as const : []),
          ...(orderResult.error ? [ORDERS_SOURCE] as const : []),
          ...(!hasOrderRow && wingResult.error ? [WING_TRAFFIC_SOURCE] as const : []),
        ];
        const profitQueryFailures: DashboardSourceName[] = [
          ...(dailyProfitResult.error ? [PROFIT_CALCULATION_SOURCE] as const : []),
          ...(adEvidenceError ? [COUPANG_ADS_SOURCE] as const : []),
        ];
        const adQueryFailures: DashboardSourceName[] = adEvidenceError
          ? [COUPANG_ADS_SOURCE]
          : [];
        const metricBasis: DashboardMetricBasisMap = {
          revenue: buildPeriodBasis({
            from: date,
            to: date,
            includedDates: revenue !== null ? [date] : [],
            sources: revenueSource,
            queryFailedSources: revenueQueryFailures,
          }),
          profit: buildPeriodBasis({
            from: date,
            to: date,
            includedDates: profit !== null ? [date] : [],
            // An order cost input that was read and refused is invalid
            // evidence for the date, not an unread source.
            invalidDates: dailyProfit?.costComplete === false && hasDailyOrderRow
              ? [date]
              : [],
            sources: [ORDERS_SOURCE, COUPANG_ADS_SOURCE],
            queryFailedSources: profitQueryFailures,
          }),
          adCost: buildPeriodBasis({
            from: date,
            to: date,
            includedDates: adCost !== null ? [date] : [],
            sources: [COUPANG_ADS_SOURCE],
            queryFailedSources: adQueryFailures,
          }),
        };
        return { date, revenue, profit, adCost, metricBasis } satisfies DashboardTrendItem;
      });

    this.logger.debug({
      msg: 'dashboard-trend.getTrend',
      organizationId,
      range: ctx.effectiveRange,
      days: selectedDates.length,
      rowCount: result.length,
      dailyProfitRowCount: dailyProfitRows.length,
      latencyMs: Date.now() - startedAt,
    });

    return result;
  }
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
