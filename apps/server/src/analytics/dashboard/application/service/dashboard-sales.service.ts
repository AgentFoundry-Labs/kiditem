import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
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
import { pct1 } from '../../helpers/percent';

/**
 * Plan F1 T2 — full implementation (replaces Plan B2c-deferred stub).
 *
 * 9 parallel reads (Promise.all):
 *   1-2. cur/prev month profit  (calculateProfitForRange)
 *   3-4. range cur/prev profit  (calculateProfitForRange)
 *   5.   today raw KPIs         (DashboardSalesRepositoryAdapter, KST boundary)
 *   6.   topProducts N=10       (DashboardSalesRepositoryAdapter, JOIN listing+master+option, LIMIT 10)
 *   7.   dailyRevenue           (DashboardSalesRepositoryAdapter, current month per-day)
 *   8.   monthlyTrend × 6       (calculateProfitForRange loop, Q2 decision)
 *   9.   wing override          (fetchWingAdSummary, null when no snapshot)
 *
 * Wing override scope (I8): only `trafficKpi.adSummary` + `lastSyncAt`. monthly.revenue
 * stays Order-based (Wing override of monthly metrics is the dashboard-ad service's
 * responsibility per spec § A.6).
 *
 * Per ADR-0006 + ADR-0018: every Prisma call binds organizationId via parameter / ${organizationId}::uuid.
 */
@Injectable()
export class DashboardSalesService {
  private readonly logger = new Logger(DashboardSalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly salesRepository: DashboardSalesRepositoryAdapter,
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
      ]);

      this.logger.debug({
        msg: 'dashboard-sales.getSummary',
        organizationId,
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

  // ── monthlyTrend = loop × 6 calculateProfitForRange (Q2 decision) ────────
  private async fetchMonthlyTrend(
    organizationId: string,
    currentMonthStart: Date,
  ): Promise<MonthlyTrendItem[]> {
    const offsets = [5, 4, 3, 2, 1, 0]; // chronological: oldest → current
    const trends = await Promise.all(offsets.map(async (offset) => {
      const start = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() - offset, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      const m = await calculateProfitForRange(this.prisma, organizationId, start, end);
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
