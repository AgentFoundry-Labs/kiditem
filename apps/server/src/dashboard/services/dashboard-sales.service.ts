import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  DashboardSalesSummary,
  ProfitBreakdown,
  TopProduct,
  MonthlyTrendItem,
  TrafficKpi,
  DailyRevenueItem,
} from '@kiditem/shared/dashboard';
import type { DashboardContext } from './context';
import { calculateProfitForRange, type RangeProfitMetrics } from '../helpers/profit-calculator';
import { fetchWingAdSummary, type WingAdSummaryResult } from '../helpers/wing-ad-summary';
import { pct1 } from '../helpers/percent';

/**
 * Plan F1 T2 — full implementation (replaces Plan B2c-deferred stub).
 *
 * 9 parallel reads (Promise.all):
 *   1-2. cur/prev month profit  (calculateProfitForRange)
 *   3-4. range cur/prev profit  (calculateProfitForRange)
 *   5.   today raw KPIs         ($queryRaw, KST boundary)
 *   6.   topProducts N=10       ($queryRaw, JOIN listing+master+option, LIMIT 10)
 *   7.   dailyRevenue           ($queryRaw, current month per-day)
 *   8.   monthlyTrend × 6       (calculateProfitForRange loop, Q2 decision)
 *   9.   wing override          (fetchWingAdSummary, null when no snapshot)
 *
 * Wing override scope (I8): only `trafficKpi.adSummary` + `lastSyncAt`. monthly.revenue
 * stays Order-based (Wing override of monthly metrics is the dashboard-ad service's
 * responsibility per spec § A.6).
 *
 * Per ADR-0006 + ADR-0018: every Prisma call binds companyId via parameter / ${companyId}::uuid.
 */
@Injectable()
export class DashboardSalesService {
  private readonly logger = new Logger(DashboardSalesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSummary(
    ctx: DashboardContext,
    companyId: string,
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
      ] = await Promise.all([
        calculateProfitForRange(this.prisma, companyId, monthStart, monthEnd),
        calculateProfitForRange(this.prisma, companyId, prevMonthDate, monthStart),
        calculateProfitForRange(this.prisma, companyId, dateRange.start, dateRange.end),
        calculateProfitForRange(this.prisma, companyId, dateRange.prevStart, dateRange.prevEnd),
        this.fetchTodayKpis(companyId, todayStart, todayEnd),
        this.fetchTopProducts(companyId, monthStart, monthEnd),
        this.fetchDailyRevenue(companyId, monthStart, monthEnd),
        this.fetchMonthlyTrend(companyId, monthStart),
        fetchWingAdSummary(this.prisma, companyId, year, month, monthStart),
      ]);

      this.logger.debug({
        msg: 'dashboard-sales.getSummary',
        companyId,
        range: ctx.effectiveRange,
        latencyMs: Date.now() - startedAt,
        topProductsCount: topProductRows.length,
        monthlyTrendMonths: monthlyTrend.length,
        hasWingOverride: wing !== null,
      });

      return {
        today: todayRows,
        monthly: this.buildMonthly(curMonth, prevMonth),
        topProducts: topProductRows,
        monthlyTrend,
        profitDetail: this.buildProfitDetail(curMonth),
        rangeKpi: this.buildRangeKpi(ctx.effectiveRange, rangeCur, rangePrev),
        dailyRevenue: dailyRevenueRows,
        planAchievement: null, // F1 out-of-scope (D.3b will wire)
        trafficKpi: this.buildTrafficKpi(curMonth, wing),
        lastSyncAt: wing?.lastSyncAt?.toISOString() ?? null,
      } satisfies DashboardSalesSummary;
    } catch (error) {
      this.logger.error('Failed to get sales summary', error);
      throw new InternalServerErrorException('Failed to get sales summary');
    }
  }

  // ── Today KPI: KST today, SUM(oli.total_price) — I3 canonical ────────────
  private async fetchTodayKpis(
    companyId: string,
    todayStart: Date,
    todayEnd: Date,
  ): Promise<DashboardSalesSummary['today']> {
    const rows = await this.prisma.$queryRaw<{ revenue: number; orders: number }[]>`
      SELECT
        COALESCE(SUM(oli.total_price), 0)::int AS revenue,
        COUNT(DISTINCT o.id)::int AS orders
      FROM orders o
      JOIN order_line_items oli ON oli.order_id = o.id
      WHERE o.company_id = ${companyId}::uuid
        AND o.ordered_at >= ${todayStart}
        AND o.ordered_at < ${todayEnd}
        AND o.status NOT IN ('cancelled', 'returned', 'refunded')
    `;
    const r = rows[0];
    return { revenue: Number(r?.revenue ?? 0), orders: Number(r?.orders ?? 0) };
  }

  // ── monthly mapping (R-01 explicit) ──────────────────────────────────────
  private buildMonthly(
    cur: RangeProfitMetrics,
    prev: RangeProfitMetrics,
  ): DashboardSalesSummary['monthly'] {
    const adRate = pct1(cur.adCost, cur.revenue);
    const prevAdRate = pct1(prev.adCost, prev.revenue);
    const revenueChange = pct1(cur.revenue - prev.revenue, prev.revenue);
    // abs-guarded: prev.netProfit can be negative; pct1 doc notes this exact pattern.
    // Math.abs(prev.netProfit) > 0 ⟺ prev.netProfit !== 0, so guard semantics match.
    const profitChange = pct1(cur.netProfit - prev.netProfit, Math.abs(prev.netProfit));

    return {
      revenue: cur.revenue,
      profit: cur.netProfit,
      adRate,
      prevRevenue: prev.revenue,
      prevProfit: prev.netProfit,
      revenueChange,
      profitChange,
      prevAdRate,
    } satisfies DashboardSalesSummary['monthly'];
  }

  // ── profitDetail: 8-field subset of RangeProfitMetrics (R-05 explicit) ───
  private buildProfitDetail(cur: RangeProfitMetrics): ProfitBreakdown {
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

  // ── rangeKpi (mirrors monthly shape, range-aware) ────────────────────────
  private buildRangeKpi(
    range: string,
    cur: RangeProfitMetrics,
    prev: RangeProfitMetrics,
  ): NonNullable<DashboardSalesSummary['rangeKpi']> {
    const profitRate = pct1(cur.netProfit, cur.revenue);
    const prevProfitRate = pct1(prev.netProfit, prev.revenue);
    const revenueChange = pct1(cur.revenue - prev.revenue, prev.revenue);
    // abs-guarded: prev.netProfit can be negative; pct1 doc notes this exact pattern.
    // Math.abs(prev.netProfit) > 0 ⟺ prev.netProfit !== 0, so guard semantics match.
    const profitChange = pct1(cur.netProfit - prev.netProfit, Math.abs(prev.netProfit));
    return {
      range,
      revenue: cur.revenue,
      profit: cur.netProfit,
      prevRevenue: prev.revenue,
      prevProfit: prev.netProfit,
      revenueChange,
      profitChange,
      profitRate,
      prevProfitRate,
      // Delta of two already-rounded 1dp percents (not a ratio) — pct1 doesn't apply.
      profitRateChange: Math.round((profitRate - prevProfitRate) * 10) / 10,
    } satisfies NonNullable<DashboardSalesSummary['rangeKpi']>;
  }

  // ── topProducts N=10, company = ChannelListing.channelName ───────────────
  private async fetchTopProducts(
    companyId: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<TopProduct[]> {
    const rows = await this.prisma.$queryRaw<Array<{
      id: string; name: string; company: string | null; grade: string | null;
      revenue: number; quantity: number;
    }>>`
      SELECT
        mp.id::text AS id,
        mp.name AS name,
        cl.channel_name AS company,
        mp.abc_grade AS grade,
        SUM(oli.total_price)::int AS revenue,
        SUM(oli.quantity)::int AS quantity
      FROM orders o
      JOIN order_line_items oli ON oli.order_id = o.id
      JOIN channel_listing_options clo ON clo.id = oli.listing_option_id
      JOIN channel_listings cl ON cl.id = clo.listing_id
      JOIN master_products mp ON mp.id = cl.master_id
      WHERE o.company_id = ${companyId}::uuid
        AND cl.company_id = ${companyId}::uuid
        AND mp.company_id = ${companyId}::uuid
        AND o.ordered_at >= ${monthStart}
        AND o.ordered_at < ${monthEnd}
        AND o.status NOT IN ('cancelled', 'returned', 'refunded')
      GROUP BY mp.id, mp.name, cl.channel_name, mp.abc_grade
      ORDER BY revenue DESC
      LIMIT 10
    `;

    // KNOWN APPROXIMATION (Plan F1 critic MAJOR #2 — documented in release note):
    // For the top-N ranking widget we approximate netProfit/profitRate using a flat
    // 30% margin assumption. Precise per-listing math lives in /api/profit-loss
    // (which uses buildPerListingMetrics). Top-N is a summary visual, not a financial
    // report — users who need exact margin per master must drill into /profit-loss.
    // T6 spec asserts the approximation explicitly so future drift is caught.
    return rows.map((r) => {
      const revenue = Number(r.revenue ?? 0);
      const netProfit = Math.round(revenue * 0.3);
      const profitRate = revenue > 0 ? 30.0 : 0;
      return {
        id: r.id,
        name: r.name,
        company: r.company ?? '미지정',
        grade: r.grade ?? 'C',
        revenue,
        netProfit,
        profitRate,
      } satisfies TopProduct;
    });
  }

  // ── dailyRevenue (current month per-day, KST boundary) ───────────────────
  private async fetchDailyRevenue(
    companyId: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<DailyRevenueItem[]> {
    const rows = await this.prisma.$queryRaw<Array<{ date: string; revenue: number }>>`
      SELECT
        TO_CHAR(o.ordered_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS date,
        COALESCE(SUM(oli.total_price), 0)::int AS revenue
      FROM orders o
      JOIN order_line_items oli ON oli.order_id = o.id
      WHERE o.company_id = ${companyId}::uuid
        AND o.ordered_at >= ${monthStart}
        AND o.ordered_at < ${monthEnd}
        AND o.status NOT IN ('cancelled', 'returned', 'refunded')
      GROUP BY 1
      ORDER BY 1
    `;
    return rows.map((r) => ({ date: r.date, revenue: Number(r.revenue) } satisfies DailyRevenueItem));
  }

  // ── monthlyTrend = loop × 6 calculateProfitForRange (Q2 decision) ────────
  private async fetchMonthlyTrend(
    companyId: string,
    currentMonthStart: Date,
  ): Promise<MonthlyTrendItem[]> {
    const offsets = [5, 4, 3, 2, 1, 0]; // chronological: oldest → current
    const trends = await Promise.all(offsets.map(async (offset) => {
      const start = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() - offset, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      const m = await calculateProfitForRange(this.prisma, companyId, start, end);
      const period = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
      return { period, revenue: m.revenue, profit: m.netProfit, adCost: m.adCost } satisfies MonthlyTrendItem;
    }));
    return trends;
  }

  // ── trafficKpi: Wing override only for adSummary (R-03 explicit) ─────────
  private buildTrafficKpi(
    cur: RangeProfitMetrics,
    wing: WingAdSummaryResult | null,
  ): TrafficKpi {
    return {
      visitors: 0,
      views: 0,
      orders: cur.orderCount,
      salesQty: 0,
      revenue: cur.revenue,
      cartAdds: 0,
      adSummary: wing?.rawAdSummary ?? null,
      source: wing ? 'wing' : undefined,
      netProfit: cur.netProfit,
      profitRate: pct1(cur.netProfit, cur.revenue),
    } satisfies TrafficKpi;
  }
}
