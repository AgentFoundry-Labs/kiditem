import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { resolvePricing } from '../../common/master-product-resolver';
import type {
  DashboardSalesSummary,
  TopProduct,
  ProfitBreakdown,
  TrafficKpi,
  MonthlyTrendItem,
  DailyRevenueItem,
  PlanAchievement,
} from '@kiditem/shared';
import type { DashboardContext } from './context';
import { calculateProfitForRange } from '../helpers/profit-calculator';
import { fetchWingAdSummary } from '../helpers/wing-ad-summary';

@Injectable()
export class DashboardSalesService {
  private readonly logger = new Logger(DashboardSalesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSummary(ctx: DashboardContext): Promise<DashboardSalesSummary> {
    try {
      const {
        todayStart, todayEnd,
        year, month,
        monthStart, monthEnd,
        prevMonthDate, prevYear, prevMonthNum,
        dateRange, effectiveRange,
      } = ctx;

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const periodStr = `${year}-${String(month).padStart(2, '0')}`;

      // Phase 1 — all independent queries in parallel
      // TODO: dedupe in follow-up — when effectiveRange === 'month' and no custom range,
      //       rangeProfitCur ≡ curMonthProfit and rangeProfitPrev ≡ prevMonthProfit.
      //       Legacy runs 4 calls anyway; kept for parity.
      const [
        todayAgg,
        allPLCurrentMonth,
        plTrend,
        dailyOrderRows,
        trafficAgg,
        salesPlan,
        wingMonthlyRevenueRows,
        wingMonthlyCogsRows,
        rangeProfitCur,
        rangeProfitPrev,
        curMonthProfit,
        prevMonthProfit,
        wingAdSummary,
      ] = await Promise.all([
        // today.revenue / today.orders
        this.prisma.coupangOrder.aggregate({
          _sum: { totalPrice: true },
          _count: true,
          where: { orderedAt: { gte: todayStart, lt: todayEnd } },
        }),

        // all P&L rows for current month — for topProducts (has-PL path)
        this.prisma.profitLoss.findMany({
          where: { year, month },
        }),

        // monthly trend: P&L grouped by year/month
        this.prisma.profitLoss.groupBy({
          by: ['year', 'month'],
          _sum: { revenue: true, netProfit: true, adCost: true },
          orderBy: [{ year: 'asc' }, { month: 'asc' }],
        }),

        // 30-day daily orders (dailyRevenue)
        this.prisma.order.findMany({
          where: {
            orderedAt: { gte: thirtyDaysAgo },
            status: { notIn: ['cancelled', 'returned'] },
          },
          select: { orderedAt: true, totalPrice: true },
        }),

        // trafficKpi — periodDays=1 daily aggregate for dateRange
        this.prisma.trafficStats.aggregate({
          _sum: {
            visitors: true,
            views: true,
            orders: true,
            salesQty: true,
            revenue: true,
            cartAdds: true,
          },
          where: {
            periodDays: 1,
            date: { gte: dateRange.start, lt: dateRange.end },
          },
        }),

        // planAchievement
        this.prisma.salesPlan.findFirst({
          where: { period: periodStr },
        }),

        // Wing monthly revenue via traffic_stats (period_days>=14 first, fallback to daily sum)
        this.prisma.$queryRaw<{ revenue: bigint; orders: bigint }[]>`
          WITH agg_period AS (
            SELECT DISTINCT ON (product_id) product_id, revenue, orders
            FROM traffic_stats
            WHERE period_days >= 14 AND date >= ${monthStart} AND date < ${monthEnd}
            ORDER BY product_id, period_days DESC, date DESC
          ),
          daily_sum AS (
            SELECT ts.product_id, SUM(ts.revenue)::bigint AS revenue, SUM(ts.orders)::bigint AS orders
            FROM traffic_stats ts
            WHERE ts.period_days = 1 AND ts.date >= ${monthStart} AND ts.date < ${monthEnd}
              AND NOT EXISTS (SELECT 1 FROM agg_period a WHERE a.product_id = ts.product_id)
            GROUP BY ts.product_id
          )
          SELECT COALESCE(SUM(revenue), 0)::bigint AS revenue, COALESCE(SUM(orders), 0)::bigint AS orders
          FROM (SELECT revenue, orders FROM agg_period UNION ALL SELECT revenue, orders FROM daily_sum) t
        `.then(rows => ({
          _sum: {
            revenue: Number(rows[0]?.revenue ?? 0),
            orders: Number(rows[0]?.orders ?? 0),
          },
        })),

        // Wing monthly COGS (traffic_stats.salesQty × product.costPrice)
        this.prisma.$queryRaw<{ cogs: bigint }[]>`
          SELECT COALESCE(SUM(ts.sales_qty * COALESCE(p.cost_price, 0)), 0) AS cogs
          FROM traffic_stats ts
          JOIN products p ON p.id = ts.product_id
          WHERE ts.period_days = 1
            AND ts.date >= ${monthStart}
            AND ts.date < ${monthEnd}
        `,

        // range profit (current period) — for rangeKpi
        calculateProfitForRange(this.prisma, dateRange.start, dateRange.end),

        // range profit (previous period) — for rangeKpi comparison
        calculateProfitForRange(this.prisma, dateRange.prevStart, dateRange.prevEnd),

        // current month Order-based profit — for monthly/profitDetail
        calculateProfitForRange(this.prisma, monthStart, monthEnd),

        // previous month Order-based profit — for monthly comparison
        calculateProfitForRange(this.prisma, prevMonthDate, monthStart),

        // Wing adSummary snapshot (A8)
        fetchWingAdSummary(this.prisma, year, month, monthStart),
      ]);

      // Phase 2 — assemble

      const monthlyTrafficRev = Number(wingMonthlyRevenueRows._sum.revenue ?? 0);
      const monthlyTrafficCOGS = Number(wingMonthlyCogsRows[0]?.cogs ?? 0);
      const hasPLData = allPLCurrentMonth.length > 0;

      // --- profitDetail base (Order-based, overridden by Wing data below)
      const profitDetail = this.buildProfitDetail(
        curMonthProfit,
        monthlyTrafficCOGS,
        wingAdSummary,
        monthlyTrafficRev,
      );

      return {
        today: this.buildToday(todayAgg),
        monthly: this.buildMonthly(
          curMonthProfit,
          prevMonthProfit,
          monthlyTrafficRev,
          wingAdSummary,
        ),
        topProducts: await this.buildTopProducts(
          hasPLData,
          allPLCurrentMonth,
          year,
          month,
        ),
        monthlyTrend: this.buildMonthlyTrend(plTrend),
        profitDetail,
        rangeKpi: this.buildRangeKpi(
          effectiveRange,
          dateRange,
          rangeProfitCur,
          rangeProfitPrev,
          monthlyTrafficRev,
          wingAdSummary,
          profitDetail,
        ),
        dailyRevenue: this.buildDailyRevenue(dailyOrderRows, curMonthProfit),
        planAchievement: this.buildPlanAchievement(salesPlan),
        trafficKpi: this.buildTrafficKpi(trafficAgg, wingAdSummary),
        lastSyncAt: wingAdSummary?.lastSyncAt ?? null,
      } satisfies DashboardSalesSummary;
    } catch (error) {
      this.logger.error('Failed to get sales summary', error);
      throw new InternalServerErrorException('Failed to get sales summary');
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private buildToday(
    todayAgg: { _sum: { totalPrice: number | null }; _count: number },
  ): DashboardSalesSummary['today'] {
    return {
      revenue: todayAgg._sum.totalPrice ?? 0,
      orders: todayAgg._count,
    };
  }

  private buildMonthly(
    curMonthProfit: { revenue: number; netProfit: number; adCost: number },
    prevMonthProfit: { revenue: number; netProfit: number; adCost: number },
    monthlyTrafficRev: number,
    wingAdSummary: { adRevenue: number; adSpend: number; adRoas: number } | null,
  ): DashboardSalesSummary['monthly'] {
    // Revenue: Wing traffic_stats preferred over Order-based
    const monthRevenue = monthlyTrafficRev > 0 ? monthlyTrafficRev : curMonthProfit.revenue;
    const monthProfit = curMonthProfit.netProfit;

    // adRate: Wing adSpend / traffic revenue when Wing data is present
    let adRate: number;
    if (wingAdSummary && wingAdSummary.adRevenue > 0 && monthRevenue > 0) {
      adRate = Math.round((wingAdSummary.adSpend / monthRevenue) * 1000) / 10;
    } else if (curMonthProfit.revenue > 0) {
      adRate = Math.round((curMonthProfit.adCost / curMonthProfit.revenue) * 1000) / 10;
    } else {
      adRate = 0;
    }

    const prevRevenue = prevMonthProfit.revenue;
    const prevProfit = prevMonthProfit.netProfit;
    const prevAdRate = prevRevenue > 0
      ? Math.round((prevMonthProfit.adCost / prevRevenue) * 1000) / 10
      : 0;

    const revenueChange = prevRevenue > 0
      ? Math.round(((monthRevenue - prevRevenue) / prevRevenue) * 1000) / 10
      : 0;
    const profitChange = prevProfit !== 0
      ? Math.round(((monthProfit - prevProfit) / Math.abs(prevProfit)) * 1000) / 10
      : 0;

    return {
      revenue: monthRevenue,
      profit: monthProfit,
      adRate,
      prevRevenue,
      prevProfit,
      revenueChange,
      profitChange,
      prevAdRate,
    };
  }

  private async buildTopProducts(
    hasPLData: boolean,
    allPLCurrentMonth: { productId: string; revenue: number; netProfit: number }[],
    year: number,
    month: number,
  ): Promise<TopProduct[]> {
    if (!hasPLData) {
      // No PL data — fall back to coupang_order_items raw query
      const topOrderItems = await this.prisma.$queryRaw<
        {
          seller_product_id: string;
          seller_product_name: string;
          revenue: number;
          order_count: number;
        }[]
      >`
        SELECT
          coi.seller_product_id,
          coi.seller_product_name,
          SUM(coi.order_price)::int AS revenue,
          COUNT(DISTINCT co.id)::int AS order_count
        FROM coupang_order_items coi
        JOIN coupang_orders co ON co.id = coi.order_id
        WHERE co.ordered_at >= ${new Date(year, month - 1, 1)}
          AND co.ordered_at < ${new Date(year, month, 1)}
          AND coi.seller_product_id IS NOT NULL
        GROUP BY coi.seller_product_id, coi.seller_product_name
        ORDER BY revenue DESC
        LIMIT 10
      `;

      const sellerIds = topOrderItems.map((r) => r.seller_product_id);
      const products = sellerIds.length > 0
        ? await this.prisma.product.findMany({
            where: { coupangProductId: { in: sellerIds } },
            include: { company: true, masterProduct: true },
          })
        : [];
      const productMap = new Map(products.map((p) => [p.coupangProductId, p]));

      return topOrderItems.map((r) => {
        const prod = productMap.get(r.seller_product_id);
        const rev = Number(r.revenue);
        const resolved = prod
          ? resolvePricing(prod)
          : { costPrice: 0, sellPrice: 0, commissionRate: 0, isCostMissing: true };
        const rate = resolved.commissionRate || 0.108;
        const comm = Math.round(rev * rate);
        const cnt = Number(r.order_count);
        const cogsVal = resolved.costPrice * cnt;
        const ship = (prod?.shippingCost ?? 0) * cnt;
        const net = rev - comm - cogsVal - ship;
        return {
          id: prod?.id ?? r.seller_product_id,
          name: prod?.name ?? r.seller_product_name,
          company: prod?.company?.name ?? 'N/A',
          grade: prod?.abcGrade ?? 'C',
          revenue: rev,
          netProfit: net,
          profitRate: rev > 0 ? Math.round((net / rev) * 1000) / 10 : 0,
        } satisfies TopProduct;
      });
    }

    // Has PL data — fetch with product/company join ordered by netProfit desc
    const topPLRows = await this.prisma.profitLoss.findMany({
      where: { year, month },
      include: {
        product: {
          include: { company: true },
        },
      },
      orderBy: { netProfit: 'desc' },
      take: 10,
    });

    return topPLRows.map((tp) => ({
      id: tp.productId,
      name: tp.product?.name ?? 'N/A',
      company: tp.product?.company?.name ?? 'N/A',
      grade: tp.product?.abcGrade ?? 'C',
      revenue: tp.revenue,
      netProfit: tp.netProfit,
      profitRate: tp.revenue > 0 ? Math.round((tp.netProfit / tp.revenue) * 1000) / 10 : 0,
    } satisfies TopProduct));
  }

  private buildMonthlyTrend(
    plTrend: { year: number; month: number; _sum: { revenue: number | null; netProfit: number | null; adCost: number | null } }[],
  ): MonthlyTrendItem[] {
    return plTrend.map((m) => ({
      period: `${m.year}-${String(m.month).padStart(2, '0')}`,
      revenue: m._sum.revenue ?? 0,
      profit: m._sum.netProfit ?? 0,
      adCost: m._sum.adCost ?? 0,
    } satisfies MonthlyTrendItem));
  }

  private buildProfitDetail(
    curMonthProfit: {
      revenue: number;
      costOfGoods: number;
      commission: number;
      shippingCost: number;
      adCost: number;
      otherCost: number;
      netProfit: number;
      orderCount: number;
    },
    monthlyTrafficCOGS: number,
    wingAdSummary: { adRevenue: number; adSpend: number } | null,
    monthlyTrafficRev: number,
  ): ProfitBreakdown {
    const costOfGoods = monthlyTrafficCOGS > 0 ? monthlyTrafficCOGS : curMonthProfit.costOfGoods;

    let detail: ProfitBreakdown = {
      revenue: curMonthProfit.revenue,
      costOfGoods,
      commission: 0,       // Wing-based: direct deduction from adGmv; unset
      shippingCost: 0,     // not tracked; 0
      adCost: curMonthProfit.adCost,
      otherCost: 0,
      netProfit: curMonthProfit.netProfit,
      orderCount: curMonthProfit.orderCount,
    };

    // A8: Wing override — when Wing adSummary present, override P&L fields
    if (wingAdSummary && wingAdSummary.adRevenue > 0) {
      const pdRevenue = monthlyTrafficRev > 0 ? monthlyTrafficRev : curMonthProfit.revenue;
      detail = {
        revenue: pdRevenue,
        costOfGoods,
        commission: 0,
        shippingCost: 0,
        adCost: wingAdSummary.adSpend,
        otherCost: 0,
        netProfit: pdRevenue - wingAdSummary.adSpend - costOfGoods,
        orderCount: curMonthProfit.orderCount,
      };
    }

    return detail satisfies ProfitBreakdown;
  }

  private buildRangeKpi(
    effectiveRange: string,
    dateRange: { start: Date; end: Date; prevStart: Date; prevEnd: Date },
    rangeProfitCur: { revenue: number; netProfit: number; adCost: number; profitRate: number },
    rangeProfitPrev: { revenue: number; netProfit: number; adCost: number; profitRate: number },
    monthlyTrafficRev: number,
    wingAdSummary: { adRevenue: number; adSpend: number } | null,
    profitDetail: ProfitBreakdown,
  ): DashboardSalesSummary['rangeKpi'] {
    // month range + traffic data available → use Wing traffic revenue
    const rangeRevenue = (effectiveRange === 'month' && monthlyTrafficRev > 0)
      ? monthlyTrafficRev
      : rangeProfitCur.revenue;
    const prevRangeRevenue = rangeProfitPrev.revenue;

    let rangeProfit = rangeProfitCur.netProfit;
    // A8: Wing override — when Wing data present and range is month, recalculate profit
    if (wingAdSummary && wingAdSummary.adRevenue > 0 && effectiveRange === 'month') {
      rangeProfit = profitDetail.netProfit;
    }

    const revenueChange = prevRangeRevenue > 0
      ? Math.round(((rangeRevenue - prevRangeRevenue) / prevRangeRevenue) * 1000) / 10
      : 0;
    const profitChange = rangeProfitPrev.netProfit !== 0
      ? Math.round(((rangeProfit - rangeProfitPrev.netProfit) / Math.abs(rangeProfitPrev.netProfit)) * 1000) / 10
      : 0;

    const profitRateChange = Math.round((rangeProfitCur.profitRate - rangeProfitPrev.profitRate) * 10) / 10;

    return {
      range: effectiveRange,
      revenue: rangeRevenue,
      profit: rangeProfit,
      prevRevenue: prevRangeRevenue,
      prevProfit: rangeProfitPrev.netProfit,
      revenueChange,
      profitChange,
      profitRate: rangeProfitCur.profitRate,
      prevProfitRate: rangeProfitPrev.profitRate,
      profitRateChange,
    };
  }

  private buildDailyRevenue(
    dailyOrderRows: { orderedAt: Date; totalPrice: number }[],
    curMonthProfit: { revenue: number; netProfit: number },
  ): DailyRevenueItem[] | undefined {
    if (dailyOrderRows.length === 0) return undefined;

    const avgProfitRate = curMonthProfit.revenue > 0
      ? (curMonthProfit.netProfit / curMonthProfit.revenue) * 100
      : 0;

    const dailyRevenueMap = new Map<string, number>();
    for (const order of dailyOrderRows) {
      const dateKey = order.orderedAt.toISOString().slice(0, 10);
      dailyRevenueMap.set(dateKey, (dailyRevenueMap.get(dateKey) ?? 0) + order.totalPrice);
    }

    return Array.from(dailyRevenueMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, revenue]) => ({
        date,
        revenue,
        profitRate: revenue > 0 ? Math.round(avgProfitRate * 10) / 10 : 0,
      } satisfies DailyRevenueItem));
  }

  private buildPlanAchievement(
    salesPlan: {
      targetRevenue: number;
      actualRevenue: number;
      targetOrders: number;
      actualOrders: number;
    } | null,
  ): PlanAchievement | null {
    if (!salesPlan) return null;
    return {
      targetRevenue: salesPlan.targetRevenue,
      actualRevenue: salesPlan.actualRevenue,
      targetOrders: salesPlan.targetOrders,
      actualOrders: salesPlan.actualOrders,
      achieveRate: salesPlan.targetRevenue > 0
        ? Math.round((salesPlan.actualRevenue / salesPlan.targetRevenue) * 1000) / 10
        : 0,
    } satisfies PlanAchievement;
  }

  private buildTrafficKpi(
    trafficAgg: {
      _sum: {
        visitors: number | null;
        views: number | null;
        orders: number | null;
        salesQty: number | null;
        revenue: number | null;
        cartAdds: number | null;
      };
    },
    wingAdSummary: { rawAdSummary?: Record<string, unknown> | null } | null,
  ): TrafficKpi | undefined {
    const tkVisitors = trafficAgg._sum.visitors ?? 0;
    const tkOrders = trafficAgg._sum.orders ?? 0;
    const tkRevenue = trafficAgg._sum.revenue ?? 0;
    const conversionRate = tkVisitors > 0 ? Math.round((tkOrders / tkVisitors) * 1000) / 10 : 0;

    return {
      visitors: tkVisitors,
      views: trafficAgg._sum.views ?? 0,
      orders: tkOrders,
      salesQty: trafficAgg._sum.salesQty ?? 0,
      revenue: tkRevenue,
      cartAdds: trafficAgg._sum.cartAdds ?? 0,
      conversionRate,
      adSummary: wingAdSummary?.rawAdSummary ?? null,
      source: 'aggregate' as const,
      needsScrape: tkVisitors === 0 && tkRevenue === 0,
    } satisfies TrafficKpi;
  }
}
