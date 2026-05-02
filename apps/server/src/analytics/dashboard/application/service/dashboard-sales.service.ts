import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  DashboardEffectivePeriod,
  DashboardSalesSummary,
  ProfitBreakdown,
  MonthlyTrendItem,
  TrafficKpi,
} from '@kiditem/shared/dashboard';
import type { DashboardContext } from './context';
import {
  calculateProfitForRange,
  type RangeProfitMetrics,
} from '../../adapter/out/repository/profit-calculation.repository.adapter';
import {
  fetchWingAdSummary,
  type WingAdSummaryResult,
} from '../../adapter/out/repository/wing-ad-summary.repository.adapter';
import { DashboardSalesRepositoryAdapter } from '../../adapter/out/repository/dashboard-sales.repository.adapter';
import {
  WingTrafficAggregationRepositoryAdapter,
  type CoupangAdsMetrics,
  type WingTrafficMetrics,
} from '../../adapter/out/repository/wing-traffic-aggregation.repository.adapter';
import { pct1 } from '../../helpers/percent';

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
 * Per ADR-0006 + ADR-0018: every Prisma call binds organizationId.
 */
@Injectable()
export class DashboardSalesService {
  private readonly logger = new Logger(DashboardSalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly salesRepository: DashboardSalesRepositoryAdapter,
    private readonly wingTrafficRepository: WingTrafficAggregationRepositoryAdapter,
  ) {}

  async getSummary(
    ctx: DashboardContext,
    organizationId: string,
  ): Promise<DashboardSalesSummary> {
    try {
      const startedAt = Date.now();
      const { year, month, monthStart, monthEnd, prevMonthDate, dateRange, todayStart, todayEnd } = ctx;

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
        wingTrafficToday,
        coupangAdsMonth,
        coupangAdsPrevMonth,
        latestDataDate,
      ] = await Promise.all([
        calculateProfitForRange(this.prisma, organizationId, monthStart, monthEnd),
        calculateProfitForRange(this.prisma, organizationId, prevMonthDate, monthStart),
        calculateProfitForRange(this.prisma, organizationId, dateRange.start, dateRange.end),
        calculateProfitForRange(this.prisma, organizationId, dateRange.prevStart, dateRange.prevEnd),
        this.salesRepository.fetchTodayKpis(organizationId, todayStart, todayEnd),
        this.salesRepository.fetchTopProducts(organizationId, monthStart, monthEnd),
        this.salesRepository.fetchDailyRevenue(organizationId, monthStart, monthEnd),
        this.fetchMonthlyTrend(organizationId, monthStart),
        fetchWingAdSummary(this.prisma, organizationId, year, month, monthStart),
        this.wingTrafficRepository.aggregateTraffic(organizationId, monthStart, monthEnd),
        this.wingTrafficRepository.aggregateTraffic(organizationId, prevMonthDate, monthStart),
        this.wingTrafficRepository.aggregateTraffic(organizationId, dateRange.start, dateRange.end),
        this.wingTrafficRepository.aggregateTraffic(organizationId, dateRange.prevStart, dateRange.prevEnd),
        this.wingTrafficRepository.aggregateTraffic(organizationId, todayStart, todayEnd),
        this.wingTrafficRepository.aggregateCoupangAds(organizationId, monthStart, monthEnd),
        this.wingTrafficRepository.aggregateCoupangAds(organizationId, prevMonthDate, monthStart),
        this.wingTrafficRepository.findLatestDataDate(organizationId),
      ]);

      const useWingMonthly = curMonth.revenue === 0 && wingTrafficMonth.hasData;
      const useWingRange = rangeCur.revenue === 0 && wingTrafficRange.hasData;
      const useWingToday = todayRows.revenue === 0 && wingTrafficToday.hasData;
      const useCoupangAdsForMonth =
        coupangAdsMonth.hasData &&
        coupangAdsMonth.spend > curMonth.adCost;

      const today = useWingToday
        ? { revenue: wingTrafficToday.revenue, orders: wingTrafficToday.orders }
        : todayRows;

      const wingLastSync = pickLatest(wing?.lastSyncAt ?? null, wingTrafficMonth.lastObservedAt);
      const lastSyncAt = wingLastSync ?? coupangAdsMonth.lastObservedAt;

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
        this.wingTrafficRepository.aggregateCoupangAds(organizationId, dateRange.start, dateRange.end),
        this.wingTrafficRepository.aggregateCoupangAds(organizationId, dateRange.prevStart, dateRange.prevEnd),
      ]);

      return {
        today,
        monthly: this.buildMonthly(
          curMonth,
          prevMonth,
          wingTrafficMonth,
          wingTrafficPrevMonth,
          coupangAdsMonth,
          coupangAdsPrevMonth,
          useWingMonthly,
          useCoupangAdsForMonth,
        ),
        topProducts: topProductRows,
        monthlyTrend,
        profitDetail: this.buildProfitDetail(curMonth, wingTrafficMonth, coupangAdsMonth, useWingMonthly, useCoupangAdsForMonth),
        rangeKpi: this.buildRangeKpi(
          ctx.effectiveRange,
          rangeCur,
          rangePrev,
          wingTrafficRange,
          wingTrafficPrevRange,
          coupangAdsForRange,
          coupangAdsForPrevRange,
          useWingRange,
        ),
        dailyRevenue: dailyRevenueRows,
        planAchievement: null,
        trafficKpi: this.buildTrafficKpi(rangeCur, wingTrafficRange, coupangAdsForRange, wing, useWingRange),
        lastSyncAt: lastSyncAt?.toISOString() ?? null,
        effectivePeriod: this.buildEffectivePeriod(
          ctx,
          latestDataDate,
          curMonth,
          wingTrafficMonth,
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
  // real), and leave `profit`/`profitChange`/`prevProfit` at zero. The UI
  // reads `effectivePeriod.revenueSource` to hide the profit card when the
  // value isn't trustworthy.
  private buildMonthly(
    cur: RangeProfitMetrics,
    prev: RangeProfitMetrics,
    wingCur: WingTrafficMetrics,
    wingPrev: WingTrafficMetrics,
    coupangAdsCur: CoupangAdsMetrics,
    coupangAdsPrev: CoupangAdsMetrics,
    useWing: boolean,
    useCoupangAds: boolean,
  ): DashboardSalesSummary['monthly'] {
    const revenue = useWing ? wingCur.revenue : cur.revenue;
    const prevRevenue = useWing ? wingPrev.revenue : prev.revenue;

    const adCost = useCoupangAds ? coupangAdsCur.spend : cur.adCost;
    const prevAdCost = useCoupangAds ? coupangAdsPrev.spend : prev.adCost;
    const profit = useWing ? 0 : cur.netProfit;
    const prevProfit = useWing ? 0 : prev.netProfit;

    const adRate = pct1(adCost, revenue);
    const prevAdRate = pct1(prevAdCost, prevRevenue);
    const revenueChange = pct1(revenue - prevRevenue, prevRevenue);
    const profitChange = useWing ? 0 : pct1(profit - prevProfit, Math.abs(prevProfit));

    return {
      revenue,
      profit,
      adRate,
      prevRevenue,
      prevProfit,
      revenueChange,
      profitChange,
      prevAdRate,
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
    _wingCur: WingTrafficMetrics,
    _coupangAds: CoupangAdsMetrics,
    _useWing: boolean,
    _useCoupangAds: boolean,
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
  // leave profit / profitRate at zero. The UI is responsible for hiding
  // those metric tiles when `effectivePeriod.revenueSource === 'wing'`.
  private buildRangeKpi(
    range: string,
    cur: RangeProfitMetrics,
    prev: RangeProfitMetrics,
    wingCur: WingTrafficMetrics,
    wingPrev: WingTrafficMetrics,
    _coupangAdsCur: CoupangAdsMetrics,
    _coupangAdsPrev: CoupangAdsMetrics,
    useWing: boolean,
  ): NonNullable<DashboardSalesSummary['rangeKpi']> {
    const revenue = useWing ? wingCur.revenue : cur.revenue;
    const prevRevenue = useWing ? wingPrev.revenue : prev.revenue;
    const profit = useWing ? 0 : cur.netProfit;
    const prevProfit = useWing ? 0 : prev.netProfit;

    const profitRate = useWing ? 0 : pct1(profit, revenue);
    const prevProfitRate = useWing ? 0 : pct1(prevProfit, prevRevenue);
    const revenueChange = pct1(revenue - prevRevenue, prevRevenue);
    const profitChange = useWing ? 0 : pct1(profit - prevProfit, Math.abs(prevProfit));
    return {
      range,
      revenue,
      profit,
      prevRevenue,
      prevProfit,
      revenueChange,
      profitChange,
      profitRate,
      prevProfitRate,
      profitRateChange: useWing ? 0 : Math.round((profitRate - prevProfitRate) * 10) / 10,
    } satisfies NonNullable<DashboardSalesSummary['rangeKpi']>;
  }

  // ── monthlyTrend = loop × 6 calculateProfitForRange ─────────────────────
  private async fetchMonthlyTrend(
    organizationId: string,
    currentMonthStart: Date,
  ): Promise<MonthlyTrendItem[]> {
    const offsets = [5, 4, 3, 2, 1, 0]; // chronological: oldest → current
    const trends = await Promise.all(offsets.map(async (offset) => {
      const start = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() - offset, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      const [m, wing] = await Promise.all([
        calculateProfitForRange(this.prisma, organizationId, start, end),
        this.wingTrafficRepository.aggregateTraffic(organizationId, start, end),
      ]);
      const period = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
      const revenue = m.revenue > 0 ? m.revenue : wing.revenue;
      const profit = m.revenue > 0 ? m.netProfit : Math.max(0, revenue - m.adCost);
      return { period, revenue, profit, adCost: m.adCost } satisfies MonthlyTrendItem;
    }));
    return trends;
  }

  // ── trafficKpi ──────────────────────────────────────────────────────────
  //
  // Wing path: surface clean Wing/Drive metrics (visitors, views, orders,
  // salesQty, revenue, cartAdds, conversionRate). `netProfit`/`profitRate`
  // are left at zero — Drive replay does not carry the settlement data
  // needed to derive net profit. Synthesizing "revenue minus ad spend"
  // would mislead users into thinking the dashboard knows COGS/commission/
  // shipping. The UI hides profit-rate metrics when `revenueSource ===
  // 'wing'`.
  private buildTrafficKpi(
    cur: RangeProfitMetrics,
    wingCur: WingTrafficMetrics,
    _coupangAdsCur: CoupangAdsMetrics,
    wing: WingAdSummaryResult | null,
    useWing: boolean,
  ): TrafficKpi {
    if (useWing) {
      return {
        visitors: wingCur.visitors,
        views: wingCur.views,
        orders: wingCur.orders,
        salesQty: wingCur.salesQty,
        revenue: wingCur.revenue,
        cartAdds: wingCur.cartAdds,
        conversionRate: wingCur.conversionRate,
        adSummary: wing?.rawAdSummary ?? null,
        source: wing ? 'wing' : 'drive_replay',
        netProfit: 0,
        profitRate: 0,
        needsScrape: false,
      } satisfies TrafficKpi;
    }
    return {
      visitors: wingCur.visitors,
      views: wingCur.views,
      orders: cur.orderCount > 0 ? cur.orderCount : wingCur.orders,
      salesQty: wingCur.salesQty,
      revenue: cur.revenue,
      cartAdds: wingCur.cartAdds,
      conversionRate: wingCur.conversionRate,
      adSummary: wing?.rawAdSummary ?? null,
      source: wing ? 'wing' : undefined,
      netProfit: cur.netProfit,
      profitRate: pct1(cur.netProfit, cur.revenue),
    } satisfies TrafficKpi;
  }

  // ── effectivePeriod ─────────────────────────────────────────────────────
  private buildEffectivePeriod(
    ctx: DashboardContext,
    latestDataDate: Date | null,
    cur: RangeProfitMetrics,
    wingCur: WingTrafficMetrics,
    coupangAds: CoupangAdsMetrics,
  ): DashboardEffectivePeriod {
    const orderActive = cur.revenue !== 0 || cur.orderCount > 0;
    const wingActive = wingCur.hasData;
    const adsActive = coupangAds.hasData;

    let revenueSource: DashboardEffectivePeriod['revenueSource'] = 'none';
    if (orderActive && wingActive) revenueSource = 'mixed';
    else if (orderActive) revenueSource = 'orders';
    else if (wingActive) revenueSource = 'wing';

    let adSource: DashboardEffectivePeriod['adSource'] = 'none';
    if (cur.adCost > 0 && adsActive) adSource = 'mixed';
    else if (cur.adCost > 0) adSource = 'orders';
    else if (adsActive) adSource = 'coupang_ads';

    return {
      year: ctx.year,
      month: ctx.month,
      label: `${ctx.year}-${String(ctx.month).padStart(2, '0')}`,
      shifted: ctx.anchorShifted,
      latestDataDate: latestDataDate
        ? latestDataDate.toISOString().slice(0, 10)
        : null,
      revenueSource,
      adSource,
    } satisfies DashboardEffectivePeriod;
  }
}

function pickLatest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}
