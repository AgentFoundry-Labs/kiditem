import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type {
  DashboardSalesSummary,
  ProfitBreakdown,
  MonthlyTrendItem,
  TrafficKpi,
} from '@kiditem/shared/dashboard';
import type { DashboardContext } from '../../domain/context';
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
} from '../port/out/repository/wing-traffic-aggregation.repository.port';
import {
  ROCKET_REVENUE_REPOSITORY_PORT,
  type RocketRevenueRepositoryPort,
  type RocketDailyRow,
  type RocketOrderRow,
} from '../port/out/repository/rocket-revenue.repository.port';
import { buildEffectivePeriod } from '../../domain/util/effective-period';
import { reconcileCollectedAdSpend } from '../../domain/util/collected-ad-profit';
import { pct1 } from '../../domain/util/percent';

export interface RocketDailySalesResult {
  year: number;
  month: number;
  days: RocketDailyRow[];
  total: { revenue: number; poCount: number; itemQty: number };
}

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
    @Inject(ROCKET_REVENUE_REPOSITORY_PORT)
    private readonly rocketRevenue: RocketRevenueRepositoryPort,
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
        latestWingDataDate,
        latestRocketDataDate,
        rocketMonth,
        rocketPrevMonth,
        rocketRange,
        rocketPrevRange,
      ] = await Promise.all([
        this.profitCalculation.calculateForRange(organizationId, monthStart, monthEnd),
        this.profitCalculation.calculateForRange(organizationId, prevMonthDate, monthStart),
        this.profitCalculation.calculateForRange(organizationId, dateRange.start, dateRange.end),
        this.profitCalculation.calculateForRange(organizationId, dateRange.prevStart, dateRange.prevEnd),
        this.salesRepository.fetchTodayKpis(organizationId, todayStart, todayEnd),
        this.salesRepository.fetchTopProducts(organizationId, monthStart, monthEnd),
        this.salesRepository.fetchDailyRevenue(organizationId, monthStart, monthEnd),
        this.fetchMonthlyTrend(organizationId, monthStart),
        this.wingAdSummary.fetchCurrentMonthSummary(organizationId, year, month, monthStart),
        this.wingTrafficRepository.aggregateTraffic(organizationId, monthStart, monthEnd),
        this.wingTrafficRepository.aggregateTraffic(organizationId, prevMonthDate, monthStart),
        this.wingTrafficRepository.aggregateTraffic(organizationId, dateRange.start, dateRange.end),
        this.wingTrafficRepository.aggregateTraffic(organizationId, dateRange.prevStart, dateRange.prevEnd),
        this.wingTrafficRepository.aggregateTraffic(organizationId, todayStart, todayEnd),
        this.wingTrafficRepository.aggregateCoupangAds(organizationId, monthStart, monthEnd),
        this.wingTrafficRepository.aggregateCoupangAds(organizationId, prevMonthDate, monthStart),
        this.wingTrafficRepository.findLatestDataDate(organizationId),
        this.rocketRevenue.findLatestDataDate(organizationId),
        this.rocketRevenue.aggregateRevenue(organizationId, monthStart, monthEnd),
        this.rocketRevenue.aggregateRevenue(organizationId, prevMonthDate, monthStart),
        this.rocketRevenue.aggregateRevenue(organizationId, dateRange.start, dateRange.end),
        this.rocketRevenue.aggregateRevenue(organizationId, dateRange.prevStart, dateRange.prevEnd),
      ]);

      const useWingMonthly = curMonth.revenue === 0 && wingTrafficMonth.hasData;
      const useWingRange = rangeCur.revenue === 0 && wingTrafficRange.hasData;
      const useWingToday = todayRows.revenue === 0 && wingTrafficToday.hasData;

      const today = useWingToday
        ? { revenue: wingTrafficToday.revenue, orders: wingTrafficToday.orders }
        : todayRows;

      const wingLastSync = pickLatest(
        wing?.lastSyncAt ?? null,
        wingTrafficMonth.lastObservedAt,
      );
      const latestDataDate = pickLatest(latestWingDataDate, latestRocketDataDate);
      const lastSyncAt = pickLatest(
        pickLatest(wingLastSync, coupangAdsMonth.lastObservedAt),
        rocketMonth.lastObservedAt,
      );

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
          useWingMonthly,
          rocketMonth.revenue,
          rocketPrevMonth.revenue,
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
          useWingRange,
          rocketRange.revenue,
          rocketPrevRange.revenue,
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
          wingTrafficMonth,
          coupangAdsMonth,
          rocketMonth,
        ),
      } satisfies DashboardSalesSummary;
    } catch (error) {
      this.logger.error('Failed to get sales summary', error);
      throw new InternalServerErrorException('Failed to get sales summary');
    }
  }

  /**
   * 쿠팡 로켓(발주) 일별 매출 — 매출분석 화면 상세 테이블/차트용.
   * 발주확정 원천 발주를 해당 월(KST 발주일) 범위로 읽는다.
   */
  async getRocketDailySales(
    organizationId: string,
    year: number,
    month: number,
  ): Promise<RocketDailySalesResult> {
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 1));
    const days = await this.rocketRevenue.fetchDaily(organizationId, monthStart, monthEnd);
    const total = days.reduce(
      (acc, d) => ({
        revenue: acc.revenue + d.revenue,
        poCount: acc.poCount + d.poCount,
        itemQty: acc.itemQty + d.itemQty,
      }),
      { revenue: 0, poCount: 0, itemQty: 0 },
    );
    return { year, month, days, total };
  }

  /**
   * 특정 발주일(KST)의 로켓 발주확정 목록 + 품목(SKU) 내역 — 드릴다운용.
   */
  async getRocketOrders(organizationId: string, dateStr: string): Promise<RocketOrderRow[]> {
    const date = new Date(dateStr + 'T00:00:00.000Z');
    return this.rocketRevenue.fetchOrdersForDate(organizationId, date);
  }

  /**
   * 기간(+상태) 로켓 발주 리스트 — 주문수집/물류 페이지의 발주 리스트용.
   */
  async getRocketOrdersList(
    organizationId: string,
    fromStr: string,
    toStr: string,
    status?: string,
  ): Promise<RocketOrderRow[]> {
    const from = new Date(fromStr + 'T00:00:00.000Z');
    const to = new Date(new Date(toStr + 'T00:00:00.000Z').getTime() + 24 * 3600 * 1000);
    return this.rocketRevenue.fetchOrders(organizationId, from, to, status);
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
    useWing: boolean,
    rocketRevenue = 0,
    prevRocketRevenue = 0,
  ): DashboardSalesSummary['monthly'] {
    // 윙/주문 기준 base 매출 (기존 로직 그대로) + 로켓(발주) 매출을 더해 total 구성.
    const wingRevenue = useWing ? wingCur.revenue : cur.revenue;
    const prevWingRevenue = useWing ? wingPrev.revenue : prev.revenue;
    const revenue = wingRevenue + rocketRevenue;
    const prevRevenue = prevWingRevenue + prevRocketRevenue;

    // 로켓은 정산 데이터 부재 → profit 미반영(윙 fallback 정책 동일).
    const profit = useWing ? 0 : cur.netProfit;
    const prevProfit = useWing ? 0 : prev.netProfit;

    // 광고비율은 광고가 붙는 윙 매출 기준으로 계산(로켓 합산 total 로 희석하지 않음).
    const adRate = pct1(cur.adCost, wingRevenue);
    const prevAdRate = pct1(prev.adCost, prevWingRevenue);
    const revenueChange = pct1(revenue - prevRevenue, prevRevenue);
    const profitChange = useWing
      ? 0
      : pct1(profit - prevProfit, Math.abs(prevProfit));

    return {
      revenue,
      wingRevenue,
      rocketRevenue,
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
  // those metric tiles when `effectivePeriod.revenueSource` is not backed by
  // order-settlement revenue.
  private buildRangeKpi(
    range: string,
    cur: RangeProfitMetrics,
    prev: RangeProfitMetrics,
    wingCur: WingTrafficMetrics,
    wingPrev: WingTrafficMetrics,
    useWing: boolean,
    rocketRevenue = 0,
    prevRocketRevenue = 0,
  ): NonNullable<DashboardSalesSummary['rangeKpi']> {
    const wingRevenue = useWing ? wingCur.revenue : cur.revenue;
    const prevWingRevenue = useWing ? wingPrev.revenue : prev.revenue;
    const revenue = wingRevenue + rocketRevenue;
    const prevRevenue = prevWingRevenue + prevRocketRevenue;
    const profit = useWing ? 0 : cur.netProfit;
    const prevProfit = useWing ? 0 : prev.netProfit;

    // 이익률은 정산 가능한 윙 base 기준(로켓 합산 total 로 희석 방지).
    const profitRate = useWing ? 0 : pct1(profit, wingRevenue);
    const prevProfitRate = useWing ? 0 : pct1(prevProfit, prevWingRevenue);
    const revenueChange = pct1(revenue - prevRevenue, prevRevenue);
    const profitChange = useWing
      ? 0
      : pct1(profit - prevProfit, Math.abs(prevProfit));
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
      profitRateChange: useWing
        ? 0
        : Math.round((profitRate - prevProfitRate) * 10) / 10,
    } satisfies NonNullable<DashboardSalesSummary['rangeKpi']>;
  }

  // ── monthlyTrend = loop × 6 calculateForRange ───────────────────────────
  private async fetchMonthlyTrend(
    organizationId: string,
    currentMonthStart: Date,
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
        const [m, wing, rocket, coupangAds] = await Promise.all([
          this.profitCalculation.calculateForRange(organizationId, start, end),
          this.wingTrafficRepository.aggregateTraffic(organizationId, start, end),
          this.rocketRevenue.aggregateRevenue(organizationId, start, end),
          this.wingTrafficRepository.aggregateCoupangAds(organizationId, start, end),
        ]);
        const adjusted = reconcileCollectedAdSpend(m, coupangAds);
        const period = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
        const revenue = (adjusted.revenue > 0 ? adjusted.revenue : wing.revenue) + rocket.revenue;
        const profit = adjusted.revenue > 0 ? adjusted.netProfit : 0;
        return { period, revenue, profit, adCost: adjusted.adCost } satisfies MonthlyTrendItem;
      }),
    );
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
}

function pickLatest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}
