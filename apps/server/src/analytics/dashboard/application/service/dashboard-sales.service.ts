import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import {
  PROFIT_CALCULATION_REPOSITORY_PORT,
  type ProfitCalculationRepositoryPort,
  type RangeProfitMetrics,
} from '../port/out/repository/profit-calculation.repository.port';
import {
  WING_AD_SUMMARY_REPOSITORY_PORT,
  type WingAdSummaryRepositoryPort,
  type WingAdSummaryResult,
} from '../port/out/repository/wing-ad-summary.repository.port';
import {
  DASHBOARD_SALES_REPOSITORY_PORT,
  type DashboardSalesRepositoryPort,
} from '../port/out/repository/dashboard-sales.repository.port';
import {
  WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT,
  type WingTrafficAggregationRepositoryPort,
  type WingTrafficMetrics,
  type TrafficAdditiveMetric,
} from '../port/out/repository/wing-traffic-aggregation.repository.port';
import { buildEffectivePeriod } from '../../domain/util/effective-period';
import { reconcileCollectedAdSpend } from '../../domain/util/collected-ad-profit';
import { pct1 } from '../../domain/util/percent';
import { kstBusinessDate, kstDayStart, kstMonthStart } from '../../../../common/kst';
import type { DashboardContext } from '../../domain/context';
import type {
  DashboardSalesSummary,
  ProfitBreakdown,
  MonthlyTrendItem,
  TrafficKpi,
} from '@kiditem/shared/dashboard';

/**
 * Dashboard sales summary.
 *
 * Drive replay support (Plan F2):
 *  - When the calendar window has zero Order rows but the same window has
 *    Wing daily-fact rows in `channel_listing_daily_snapshots.traffic_*`, the
 *    Wing aggregate is what we surface on `monthly.revenue`,
 *    `rangeKpi.revenue`, and `trafficKpi.{visitors,views,orders,salesQty,
 *    revenue,cartAdds,conversionRate}`. This avoids the all-zero dashboard
 *    on operator workspaces that only loaded Drive replay data.
 *  - The Order-based path is still preferred when orders exist (live
 *    workspaces). The fallback only activates when the order-based revenue
 *    is zero for the requested period.
 *  - `effectivePeriod` reports which period and which source fed the
 *    monthly numbers so the dashboard UI can label "주문 기준" /
 *    "Wing 매출 기준" without guessing.
 *
 * Tenant-scope rule: every Prisma call binds organizationId.
 */
@Injectable()
export class DashboardSalesService {
  private readonly logger = new Logger(DashboardSalesService.name);

  constructor(
    @Inject(PROFIT_CALCULATION_REPOSITORY_PORT)
    private readonly profitCalculation: ProfitCalculationRepositoryPort,
    @Inject(WING_AD_SUMMARY_REPOSITORY_PORT)
    private readonly wingAdSummary: WingAdSummaryRepositoryPort,
    @Inject(DASHBOARD_SALES_REPOSITORY_PORT)
    private readonly salesRepository: DashboardSalesRepositoryPort,
    @Inject(WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT)
    private readonly wingTrafficRepository: WingTrafficAggregationRepositoryPort,
  ) {}

  async getSummary(
    ctx: DashboardContext,
    organizationId: string,
  ): Promise<DashboardSalesSummary> {
    try {
      const startedAt = Date.now();
      const {
        year,
        month,
        monthStart,
        monthEnd,
        prevMonthDate,
        dateRange,
        todayStart,
        todayEnd,
      } = ctx;
      const wingRanges = resolveWingTrafficSourceRanges(ctx);

      const [
        curMonth,
        prevMonth,
        rangeCur,
        rangePrev,
        todayRows,
        topProductRows,
        dailyRevenueRows,
        monthlyTrend,
        wing,
        wingTrafficMonth,
        wingTrafficPrevMonth,
        wingTrafficRange,
        wingTrafficPrevRange,
        coupangAdsMonth,
        coupangAdsPrevMonth,
        latestWingDataDate,
      ] = await Promise.all([
        this.profitCalculation.calculateForRange(organizationId, monthStart, monthEnd),
        this.profitCalculation.calculateForRange(organizationId, prevMonthDate, monthStart),
        this.profitCalculation.calculateForRange(organizationId, dateRange.start, dateRange.end),
        this.profitCalculation.calculateForRange(organizationId, dateRange.prevStart, dateRange.prevEnd),
        this.salesRepository.fetchTodayKpis(organizationId, todayStart, todayEnd),
        this.salesRepository.fetchTopProducts(organizationId, monthStart, monthEnd),
        this.salesRepository.fetchDailyRevenue(organizationId, monthStart, monthEnd),
        this.fetchMonthlyTrend(organizationId, monthStart, ctx.anchor),
        this.wingAdSummary.fetchCurrentMonthSummary(organizationId, year, month, monthStart),
        this.wingTrafficRepository.aggregateTraffic(organizationId, wingRanges.month.from, wingRanges.month.to),
        this.wingTrafficRepository.aggregateTraffic(organizationId, wingRanges.previousMonth.from, wingRanges.previousMonth.to),
        this.wingTrafficRepository.aggregateTraffic(organizationId, wingRanges.current.from, wingRanges.current.to),
        this.wingTrafficRepository.aggregateTraffic(organizationId, wingRanges.previous.from, wingRanges.previous.to),
        this.wingTrafficRepository.aggregateCoupangAds(organizationId, wingRanges.month.from, wingRanges.month.to),
        this.wingTrafficRepository.aggregateCoupangAds(
          organizationId,
          wingRanges.previousMonth.from,
          wingRanges.previousMonth.to,
        ),
        this.wingTrafficRepository.findLatestDataDate(organizationId),
      ]);

      const useWingMonthly = !hasOrderEvidence(curMonth) && canUseWingRevenue(wingTrafficMonth);
      const useWingRange = !hasOrderEvidence(rangeCur) && canUseWingRevenue(wingTrafficRange);
      // The Today card is order-backed. Never substitute yesterday's closed
      // Wing source range into a widget labelled as today.
      const today = todayRows;

      const wingLastSync = pickLatest(
        wing?.lastSyncAt ?? null,
        wingTrafficMonth.lastObservedAt,
      );
      const latestDataDate = latestWingDataDate;
      const lastSyncAt = pickLatest(wingLastSync, coupangAdsMonth.lastObservedAt);

      this.logger.debug({
        msg: 'dashboard-sales.getSummary',
        organizationId,
        range: ctx.effectiveRange,
        anchorShifted: ctx.anchorShifted,
        latencyMs: Date.now() - startedAt,
        topProductsCount: topProductRows.length,
        monthlyTrendMonths: monthlyTrend.length,
        hasWingOverride: wing !== null,
        useWingMonthly,
        useWingRange,
      });

      const [coupangAdsForRange, coupangAdsForPrevRange] = await Promise.all([
        this.wingTrafficRepository.aggregateCoupangAds(organizationId, wingRanges.current.from, wingRanges.current.to),
        this.wingTrafficRepository.aggregateCoupangAds(organizationId, wingRanges.previous.from, wingRanges.previous.to),
      ]);
      const curMonthProfit = reconcileCollectedAdSpend(curMonth, coupangAdsMonth);
      const prevMonthProfit = reconcileCollectedAdSpend(prevMonth, coupangAdsPrevMonth);
      const rangeCurProfit = reconcileCollectedAdSpend(rangeCur, coupangAdsForRange);
      const rangePrevProfit = reconcileCollectedAdSpend(rangePrev, coupangAdsForPrevRange);

      return {
        today,
        monthly: this.buildMonthly(
          curMonthProfit,
          prevMonthProfit,
          wingTrafficMonth,
          wingTrafficPrevMonth,
        ),
        topProducts: topProductRows,
        monthlyTrend,
        profitDetail: this.buildProfitDetail(curMonthProfit),
        rangeKpi: this.buildRangeKpi(
          ctx.effectiveRange,
          rangeCurProfit,
          rangePrevProfit,
          wingTrafficRange,
          wingTrafficPrevRange,
        ),
        dailyRevenue: dailyRevenueRows,
        planAchievement: null,
        trafficKpi: this.buildTrafficKpi(
          rangeCurProfit,
          wingTrafficRange,
          wing,
          useWingRange,
        ),
        lastSyncAt: lastSyncAt?.toISOString() ?? null,
        effectivePeriod: buildEffectivePeriod(
          ctx,
          latestDataDate,
          curMonth,
          { ...wingTrafficMonth, hasData: canUseWingRevenue(wingTrafficMonth) },
          coupangAdsMonth,
        ),
      } satisfies DashboardSalesSummary;
    } catch (error) {
      this.logger.error('Failed to get sales summary', error);
      throw new InternalServerErrorException('Failed to get sales summary');
    }
  }

  // ── monthly mapping ─────────────────────────────────────────────────────
  //
  // Drive replay only carries Wing revenue + Coupang ad spend; settlement
  // metrics (commission, shipping, COGS) are absent. Net profit therefore
  // cannot be derived from Wing alone — synthesizing `revenue - adSpend`
  // would be misleading because it ignores cost-of-goods and platform fees.
  // We surface revenue + adRate (both well-defined when their inputs are
  // real), and leave `profit`/`profitChange`/`prevProfit` null when settlement
  // evidence is unavailable. The UI reads `effectivePeriod.revenueSource` to
  // hide the profit card when the value isn't trustworthy.
  private buildMonthly(
    cur: RangeProfitMetrics,
    prev: RangeProfitMetrics,
    wingCur: WingTrafficMetrics,
    wingPrev: WingTrafficMetrics,
  ): DashboardSalesSummary['monthly'] {
    const current = resolveSalesPeriod(cur, wingCur);
    const previous = resolveSalesPeriod(prev, wingPrev);

    // 광고비율은 광고가 붙는 윙 매출 기준으로 계산(로켓 합산 total 로 희석 방지).
    const adRate = current.revenue === null ? null : pct1(cur.adCost, current.revenue);
    const prevAdRate = previous.revenue === null ? null : pct1(prev.adCost, previous.revenue);
    const revenueChange = percentChange(current.revenue, previous.revenue);
    const profitChange = percentChange(current.profit, previous.profit, true);

    return {
      revenue: current.revenue,
      wingRevenue: current.wingRevenue,
      profit: current.profit,
      adRate,
      prevRevenue: previous.revenue,
      prevProfit: previous.profit,
      revenueChange,
      profitChange,
      prevAdRate,
      available: current.available,
      previousAvailable: previous.available,
    } satisfies DashboardSalesSummary['monthly'];
  }

  // ── profitDetail ────────────────────────────────────────────────────────
  //
  // For the Wing fallback path we don't have settlement data, so the profit
  // breakdown isn't trustworthy. Returning the Order-based zero is *less*
  // misleading than half-filling it with synthesized numbers. The UI hides
  // the breakdown on Wing-source periods.
  private buildProfitDetail(
    cur: RangeProfitMetrics,
  ): ProfitBreakdown {
    return {
      revenue: cur.revenue,
      costOfGoods: cur.costOfGoods,
      commission: cur.commission,
      shippingCost: cur.shippingCost,
      adCost: cur.adCost,
      otherCost: cur.otherCost,
      netProfit: cur.netProfit,
      orderCount: cur.orderCount,
    } satisfies ProfitBreakdown;
  }

  // ── rangeKpi ────────────────────────────────────────────────────────────
  //
  // When `useWing` is true the order-based profit math is unreliable
  // (no settlement data on Drive replay), so we report Wing revenue but
  // leave profit / profitRate null. The UI is responsible for hiding those
  // metric tiles when `effectivePeriod.revenueSource` is not backed by
  // order-settlement revenue.
  private buildRangeKpi(
    range: string,
    cur: RangeProfitMetrics,
    prev: RangeProfitMetrics,
    wingCur: WingTrafficMetrics,
    wingPrev: WingTrafficMetrics,
  ): NonNullable<DashboardSalesSummary['rangeKpi']> {
    const current = resolveSalesPeriod(cur, wingCur);
    const previous = resolveSalesPeriod(prev, wingPrev);

    // Wing-only revenue has no settlement costs, so do not synthesize a zero
    // profit/profitRate that looks like a measured result.
    const profitRate = current.profit !== null && current.revenue !== null
      ? pct1(current.profit, current.revenue)
      : null;
    const prevProfitRate = previous.profit !== null && previous.revenue !== null
      ? pct1(previous.profit, previous.revenue)
      : null;
    const revenueChange = percentChange(current.revenue, previous.revenue);
    const profitChange = percentChange(current.profit, previous.profit, true);
    return {
      range,
      revenue: current.revenue,
      profit: current.profit,
      prevRevenue: previous.revenue,
      prevProfit: previous.profit,
      revenueChange,
      profitChange,
      profitRate,
      prevProfitRate,
      profitRateChange: difference(profitRate, prevProfitRate),
      available: current.available,
      previousAvailable: previous.available,
    } satisfies NonNullable<DashboardSalesSummary['rangeKpi']>;
  }

  // ── monthlyTrend = loop × 6 calculateForRange ───────────────────────────
  private async fetchMonthlyTrend(
    organizationId: string,
    currentMonthStart: Date,
    anchor: Date,
  ): Promise<MonthlyTrendItem[]> {
    const offsets = [5, 4, 3, 2, 1, 0]; // chronological: oldest → current
    const trends = await Promise.all(
      offsets.map(async (offset) => {
        const start = new Date(
          currentMonthStart.getFullYear(),
          currentMonthStart.getMonth() - offset,
          1,
        );
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
        const wingRange = resolveMonthlyWingRange(start, end, anchor);
        const [m, wing, coupangAds] = await Promise.all([
          this.profitCalculation.calculateForRange(organizationId, start, end),
          this.wingTrafficRepository.aggregateTraffic(organizationId, wingRange.from, wingRange.to),
          this.wingTrafficRepository.aggregateCoupangAds(organizationId, wingRange.from, wingRange.to),
        ]);
        const adjusted = reconcileCollectedAdSpend(m, coupangAds);
        const period = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
        const wingRevenueAvailable = canUseWingRevenue(wing);
        const orderAvailable = hasOrderEvidence(adjusted);
        const adsAvailable = coupangAds.hasData;
        const revenue = orderAvailable
          ? adjusted.revenue
          : wingRevenueAvailable
            ? wing.revenue
            : null;
        // Wing GMV is not settlement evidence, so profit remains unavailable
        // even when Wing revenue is available.
        const profit = orderAvailable ? adjusted.netProfit : null;
        const adCost = orderAvailable || adsAvailable ? adjusted.adCost : null;
        return { period, revenue, profit, adCost } satisfies MonthlyTrendItem;
      }),
    );
    return trends;
  }

  // ── trafficKpi ──────────────────────────────────────────────────────────
  //
  // Wing path: surface clean Wing/Drive metrics (visitors, views, orders,
  // salesQty, revenue, cartAdds, conversionRate). `netProfit`/`profitRate`
  // are left at null — Drive replay does not carry the settlement data
  // needed to derive net profit. Synthesizing "revenue minus ad spend"
  // would mislead users into thinking the dashboard knows COGS/commission/
  // shipping. The UI hides profit-rate metrics when `revenueSource ===
  // 'wing'`.
  private buildTrafficKpi(
    cur: RangeProfitMetrics,
    wingCur: WingTrafficMetrics,
    wing: WingAdSummaryResult | null,
    useWing: boolean,
  ): TrafficKpi {
    const wingValues = trafficKpiValues(wingCur);
    if (useWing) {
      return {
        ...wingValues,
        adSummary: wing?.rawAdSummary ?? null,
        source: wing ? 'wing' : 'drive_replay',
        // Wing GMV has no settlement/COGS evidence; null is intentional.
        netProfit: null,
        profitRate: null,
        needsScrape: false,
        trafficAvailable: wingCur.isCollected,
        trafficObservedAt: wingCur.lastObservedAt?.toISOString() ?? null,
      } satisfies TrafficKpi;
    }
    const orderDataAvailable = cur.revenue !== 0 || cur.orderCount > 0;
    if (!orderDataAvailable) {
      return {
        ...wingValues,
        adSummary: wing?.rawAdSummary ?? null,
        source: wing ? 'wing' : 'drive_replay',
        netProfit: null,
        profitRate: null,
        needsScrape: false,
        trafficAvailable: wingCur.isCollected,
        trafficObservedAt: wingCur.lastObservedAt?.toISOString() ?? null,
      } satisfies TrafficKpi;
    }
    return {
      visitors: wingValues.visitors,
      views: wingValues.views,
      orders: cur.orderCount,
      salesQty: wingValues.salesQty,
      revenue: cur.revenue,
      cartAdds: wingValues.cartAdds,
      conversionRate: wingValues.conversionRate,
      dailyAverageVisitors: wingValues.dailyAverageVisitors,
      providerConversionRate: wingValues.providerConversionRate,
      coverage: wingValues.coverage,
      reconciliation: wingValues.reconciliation,
      exactPeriodEvidence: wingValues.exactPeriodEvidence,
      adSummary: wing?.rawAdSummary ?? null,
      source: wing ? 'wing' : undefined,
      netProfit: cur.netProfit,
      profitRate: pct1(cur.netProfit, cur.revenue),
      trafficAvailable: wingCur.isCollected,
      trafficObservedAt: wingCur.lastObservedAt?.toISOString() ?? null,
    } satisfies TrafficKpi;
  }
}

type TrafficKpiValues = Pick<
  TrafficKpi,
  | 'visitors'
  | 'views'
  | 'salesQty'
  | 'cartAdds'
  | 'conversionRate'
  | 'dailyAverageVisitors'
  | 'providerConversionRate'
  | 'coverage'
  | 'reconciliation'
  | 'exactPeriodEvidence'
> & { orders: number | null; revenue: number | null };

function canUseWingRevenue(metrics: WingTrafficMetrics): boolean {
  if (!metrics.hasData) return false;
  const coverage = metrics.coverage;
  if (coverage && coverage.completedDays !== coverage.targetDays) return false;
  return metrics.reconciliation?.revenue?.status !== 'MISMATCH';
}

function canUseWingMetric(
  metrics: WingTrafficMetrics,
  metric: TrafficAdditiveMetric,
): boolean {
  if (!metrics.isCollected) return false;
  const coverage = metrics.coverage;
  if (coverage && coverage.completedDays !== coverage.targetDays) return false;
  return metrics.reconciliation?.[metric]?.status !== 'MISMATCH';
}

function trafficKpiValues(metrics: WingTrafficMetrics): TrafficKpiValues {
  const visitorsAvailable = metrics.isCollected
    && (!metrics.coverage || metrics.coverage.completedDays === metrics.coverage.targetDays);
  const viewsAvailable = canUseWingMetric(metrics, 'views');
  const ordersAvailable = canUseWingMetric(metrics, 'orders');
  const salesQtyAvailable = canUseWingMetric(metrics, 'salesQty');
  const revenueAvailable = canUseWingMetric(metrics, 'revenue');
  const cartAddsAvailable = canUseWingMetric(metrics, 'cartAdds');
  const visitors = visitorsAvailable
    ? (metrics.dailyAverageVisitors ?? metrics.visitors)
    : null;
  const views = viewsAvailable ? metrics.views : null;
  const orders = ordersAvailable ? metrics.orders : null;

  return {
    visitors,
    views,
    orders,
    revenue: revenueAvailable ? metrics.revenue : null,
    salesQty: salesQtyAvailable ? metrics.salesQty : null,
    cartAdds: cartAddsAvailable ? metrics.cartAdds : null,
    // The ratio is unavailable when views are unavailable or zero. The
    // adapter computes orders/views, never orders/visitors.
    conversionRate: views !== null && views > 0 && orders !== null
      ? (orders / views) * 100
      : null,
    dailyAverageVisitors: visitors,
    providerConversionRate: metrics.providerConversionRate ?? null,
    coverage: metrics.coverage ?? null,
    reconciliation: metrics.reconciliation ?? null,
    exactPeriodEvidence: metrics.exactPeriodEvidence ?? null,
  };
}

interface ResolvedSalesPeriod {
  revenue: number | null;
  wingRevenue: number | null;
  profit: number | null;
  available: boolean;
}

const DAY_MS = 86_400_000;

interface WingTrafficDateRange {
  from: Date;
  to: Date;
}

interface WingTrafficSourceRanges {
  month: WingTrafficDateRange;
  previousMonth: WingTrafficDateRange;
  current: WingTrafficDateRange;
  previous: WingTrafficDateRange;
}

/**
 * Align Wing reads with the web collection contract: only closed KST days
 * feed dashboard traffic. Orders/Sellpia ranges remain owned by Dashboard-
 * Context and are deliberately not rewritten here.
 */
export function resolveWingTrafficSourceRanges(
  ctx: DashboardContext,
): WingTrafficSourceRanges {
  const { month: monthRange, previousMonth: previousMonthRange } = closedWingMonthRanges(ctx.anchor);
  const todayStart = kstDayStart(ctx.anchor);
  const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);

  let current: WingTrafficDateRange;
  let previous: WingTrafficDateRange;
  switch (ctx.effectiveRange) {
    case 'day':
      current = { from: yesterdayStart, to: todayStart };
      previous = {
        from: new Date(yesterdayStart.getTime() - DAY_MS),
        to: yesterdayStart,
      };
      break;
    case 'week':
      current = {
        from: new Date(todayStart.getTime() - 7 * DAY_MS),
        to: todayStart,
      };
      previous = {
        from: new Date(todayStart.getTime() - 14 * DAY_MS),
        to: new Date(todayStart.getTime() - 7 * DAY_MS),
      };
      break;
    case 'custom':
      current = { from: ctx.dateRange.start, to: ctx.dateRange.end };
      previous = { from: ctx.dateRange.prevStart, to: ctx.dateRange.prevEnd };
      break;
    case 'month':
    default:
      current = monthRange;
      previous = previousMonthRange;
      break;
  }

  return {
    month: monthRange,
    previousMonth: previousMonthRange,
    current,
    previous,
  };
}

function resolveMonthlyWingRange(
  start: Date,
  end: Date,
  anchor: Date,
): WingTrafficDateRange {
  const { month: currentMonth } = closedWingMonthRanges(anchor);
  const periodStart = kstBusinessDate(start);
  const currentMonthDate = kstBusinessDate(currentMonth.from);
  if (
    periodStart.getUTCFullYear() === currentMonthDate.getUTCFullYear()
    && periodStart.getUTCMonth() === currentMonthDate.getUTCMonth()
  ) {
    return currentMonth;
  }
  return { from: start, to: end };
}

function closedWingMonthRanges(anchor: Date): {
  month: WingTrafficDateRange;
  previousMonth: WingTrafficDateRange;
} {
  const todayStart = kstDayStart(anchor);
  const yesterdayBusinessDate = kstBusinessDate(
    new Date(todayStart.getTime() - DAY_MS),
  );
  const year = yesterdayBusinessDate.getUTCFullYear();
  const month = yesterdayBusinessDate.getUTCMonth() + 1;
  const monthStart = kstMonthStart(year, month);
  const previousMonthStart = month === 1
    ? kstMonthStart(year - 1, 12)
    : kstMonthStart(year, month - 1);
  return {
    month: { from: monthStart, to: todayStart },
    previousMonth: { from: previousMonthStart, to: monthStart },
  };
}

function hasOrderEvidence(metrics: {
  revenue: number;
  orderCount?: number;
  orders?: number;
}): boolean {
  return metrics.revenue !== 0 || (metrics.orderCount ?? metrics.orders ?? 0) > 0;
}

function resolveSalesPeriod(
  orderMetrics: RangeProfitMetrics,
  wingMetrics: WingTrafficMetrics,
): ResolvedSalesPeriod {
  if (hasOrderEvidence(orderMetrics)) {
    return {
      revenue: orderMetrics.revenue,
      wingRevenue: null,
      profit: orderMetrics.netProfit,
      available: true,
    };
  }
  if (canUseWingRevenue(wingMetrics)) {
    return {
      revenue: wingMetrics.revenue,
      wingRevenue: wingMetrics.revenue,
      // Wing GMV is not a settlement/profit fact.
      profit: null,
      available: true,
    };
  }
  return {
    revenue: null,
    wingRevenue: null,
    profit: null,
    available: false,
  };
}

function percentChange(
  current: number | null,
  previous: number | null,
  absolutePrevious = false,
): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return pct1(current - previous, absolutePrevious ? Math.abs(previous) : previous);
}

function difference(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return Math.round((current - previous) * 10) / 10;
}

function pickLatest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}
