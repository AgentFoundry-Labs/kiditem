import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { kstDayStart } from '../common/kst';
import type { DashboardSummary, DashboardTrendItem } from '@kiditem/shared';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(range?: string, from?: string, to?: string): Promise<DashboardSummary> {
    try {
      const now = new Date();
      const todayStart = kstDayStart(now);
      const todayEnd = new Date(todayStart.getTime() + 86400000);

      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 1);
      const prevMonthDate = new Date(year, month - 2, 1);
      const prevYear = prevMonthDate.getFullYear();
      const prevMonthNum = prevMonthDate.getMonth() + 1;

      const [
        todayAgg,
        monthlyPL,
        gradeRows,
        unreadAlerts,
        allPLCurrentMonth,
        inventoryReorderCount,
        totalActiveProducts,
        plTrend,
        adAggCurrentMonth,
        adAggPrevMonth,
        prevMonthPL,
      ] = await Promise.all([
        this.prisma.coupangOrder.aggregate({
          _sum: { totalPrice: true },
          _count: true,
          where: { orderedAt: { gte: todayStart, lt: todayEnd } },
        }),
        this.prisma.profitLoss.aggregate({
          _sum: { revenue: true, netProfit: true, adCost: true },
          where: { year, month },
        }),
        this.prisma.product.groupBy({
          by: ['abcGrade'],
          _count: true,
          where: { status: 'active' },
        }),
        this.prisma.alert.findMany({
          where: { isRead: false },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.profitLoss.findMany({
          where: { year, month },
        }),
        this.prisma.inventory.count({
          where: {
            currentStock: { gt: 0 },
            reorderPoint: { gt: 0 },
          },
        }),
        this.prisma.product.count({
          where: { status: 'active' },
        }),
        this.prisma.profitLoss.groupBy({
          by: ['year', 'month'],
          _sum: { revenue: true, netProfit: true, adCost: true },
          orderBy: [{ year: 'asc' }, { month: 'asc' }],
        }),
        this.prisma.$queryRaw<
          { spend: number; impressions: number; clicks: number; revenue: number }[]
        >`
          SELECT
            COALESCE(SUM(spend), 0)::int AS spend,
            COALESCE(SUM(impressions), 0)::int AS impressions,
            COALESCE(SUM(clicks), 0)::int AS clicks,
            COALESCE(SUM(revenue), 0)::int AS revenue
          FROM ads
          WHERE date >= ${monthStart}::date AND date < ${monthEnd}::date
        `,
        this.prisma.$queryRaw<
          { spend: number; impressions: number; clicks: number; revenue: number }[]
        >`
          SELECT
            COALESCE(SUM(spend), 0)::int AS spend,
            COALESCE(SUM(impressions), 0)::int AS impressions,
            COALESCE(SUM(clicks), 0)::int AS clicks,
            COALESCE(SUM(revenue), 0)::int AS revenue
          FROM ads
          WHERE date >= ${prevMonthDate}::date AND date < ${monthStart}::date
        `,
        this.prisma.profitLoss.aggregate({
          _sum: { revenue: true, netProfit: true, adCost: true },
          where: { year: prevYear, month: prevMonthNum },
        }),
      ]);

      const hasPLData = allPLCurrentMonth.length > 0;
      const gradeCount = gradeRows.reduce<Record<string, number>>(
        (acc, g) => ({ ...acc, [g.abcGrade ?? 'C']: g._count }),
        {},
      );

      // reorderPoint 필터링: DB에서 1차 필터 후 앱 레벨에서 정확히 계산
      const needReorder = hasPLData
        ? await this.prisma.inventory
            .findMany({
              where: { currentStock: { gt: 0 } },
              select: { currentStock: true, reorderPoint: true },
            })
            .then(
              (rows) =>
                rows.filter((inv) => inv.currentStock <= inv.reorderPoint)
                  .length,
            )
        : inventoryReorderCount;

      const curAd = adAggCurrentMonth[0] ?? { spend: 0, impressions: 0, clicks: 0, revenue: 0 };
      const prevAd = adAggPrevMonth[0] ?? { spend: 0, impressions: 0, clicks: 0, revenue: 0 };

      const curRoas = Number(curAd.spend) > 0 ? (Number(curAd.revenue) / Number(curAd.spend)) * 100 : 0;
      const curCtr = Number(curAd.impressions) > 0 ? (Number(curAd.clicks) / Number(curAd.impressions)) * 100 : 0;
      const prevRoas = Number(prevAd.spend) > 0 ? (Number(prevAd.revenue) / Number(prevAd.spend)) * 100 : 0;
      const prevCtr = Number(prevAd.impressions) > 0 ? (Number(prevAd.clicks) / Number(prevAd.impressions)) * 100 : 0;

      const prevPLRevenue = prevMonthPL._sum.revenue ?? 0;
      const prevPLProfit = prevMonthPL._sum.netProfit ?? 0;
      const prevPLAdCost = prevMonthPL._sum.adCost ?? 0;
      const prevAdRateVal = prevPLRevenue > 0 ? (prevPLAdCost / prevPLRevenue) * 100 : 0;

      const adMetrics = {
        roas: Math.round(curRoas * 100) / 100,
        ctr: Math.round(curCtr * 100) / 100,
        adRevenue: Number(curAd.revenue),
        totalAdSpend: Number(curAd.spend),
        prevMonthlyRevenue: prevPLRevenue,
        prevMonthlyProfit: prevPLProfit,
        prevRoas: Math.round(prevRoas * 100) / 100,
        prevCtr: Math.round(prevCtr * 100) / 100,
        prevAdRevenue: Number(prevAd.revenue),
        prevTotalAdSpend: Number(prevAd.spend),
        prevAdRate: Math.round(prevAdRateVal * 10) / 10,
      };

      // ── 추가 데이터 쿼리 ────────────────────────────────────────────────────
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const periodStr = `${year}-${String(month).padStart(2, '0')}`;

      // range KPI 기간 계산
      const effectiveRange = range ?? 'month';
      let rangeStart: Date;
      let rangeEnd: Date;
      let prevRangeStart: Date;
      let prevRangeEnd: Date;
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - 7);
      const prevWeekStart = new Date(weekStart);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);

      if (from && to) {
        rangeStart = new Date(from);
        rangeEnd = new Date(to);
        rangeEnd.setDate(rangeEnd.getDate() + 1);
        const duration = rangeEnd.getTime() - rangeStart.getTime();
        prevRangeStart = new Date(rangeStart.getTime() - duration);
        prevRangeEnd = rangeStart;
      } else if (effectiveRange === 'week') {
        rangeStart = weekStart;
        rangeEnd = now;
        prevRangeStart = prevWeekStart;
        prevRangeEnd = weekStart;
      } else if (effectiveRange === 'day') {
        rangeStart = todayStart;
        rangeEnd = todayEnd;
        prevRangeStart = yesterdayStart;
        prevRangeEnd = todayStart;
      } else {
        rangeStart = monthStart;
        rangeEnd = monthEnd;
        prevRangeStart = prevMonthDate;
        prevRangeEnd = monthStart;
      }

      const [
        profitDetailAgg,
        trafficAgg,
        rangeOrderAgg,
        prevRangeOrderAgg,
        dailyOrderRows,
        dailyAdRows,
        salesPlan,
        gradeChangesRows,
      ] = await Promise.all([
        this.prisma.profitLoss.aggregate({
          _sum: {
            revenue: true,
            cogs: true,
            commission: true,
            shippingCost: true,
            adCost: true,
            otherCost: true,
            netProfit: true,
            orderCount: true,
          },
          where: { year, month },
        }),
        this.prisma.trafficStats.aggregate({
          _sum: {
            visitors: true,
            views: true,
            orders: true,
            salesQty: true,
            revenue: true,
            cartAdds: true,
          },
          where: { date: { gte: monthStart, lt: monthEnd } },
        }),
        this.prisma.order.aggregate({
          _sum: { totalPrice: true },
          _count: true,
          where: {
            orderedAt: { gte: rangeStart, lt: rangeEnd },
            status: { notIn: ['cancelled', 'returned'] },
          },
        }),
        this.prisma.order.aggregate({
          _sum: { totalPrice: true },
          _count: true,
          where: {
            orderedAt: { gte: prevRangeStart, lt: prevRangeEnd },
            status: { notIn: ['cancelled', 'returned'] },
          },
        }),
        this.prisma.order.findMany({
          where: {
            orderedAt: { gte: thirtyDaysAgo },
            status: { notIn: ['cancelled', 'returned'] },
          },
          select: { orderedAt: true, totalPrice: true },
        }),
        this.prisma.$queryRaw<{ date: string; ad_cost: number }[]>`
          SELECT
            TO_CHAR(date, 'YYYY-MM-DD') AS date,
            COALESCE(SUM(spend), 0)::int AS ad_cost
          FROM ads
          WHERE date >= ${thirtyDaysAgo}::date
          GROUP BY 1
          ORDER BY 1
        `,
        this.prisma.salesPlan.findFirst({
          where: { period: periodStr },
        }),
        this.prisma.gradeHistory.findMany({
          where: { calculatedAt: { gte: sevenDaysAgo } },
          select: { oldGrade: true, newGrade: true },
        }),
      ]);

      // profitDetail 구성 (ProfitLoss 필드: cogs)
      const profitDetail = {
        revenue: profitDetailAgg._sum.revenue ?? 0,
        costOfGoods: profitDetailAgg._sum.cogs ?? 0,
        commission: profitDetailAgg._sum.commission ?? 0,
        shippingCost: profitDetailAgg._sum.shippingCost ?? 0,
        adCost: profitDetailAgg._sum.adCost ?? 0,
        otherCost: profitDetailAgg._sum.otherCost ?? 0,
        netProfit: profitDetailAgg._sum.netProfit ?? 0,
        orderCount: profitDetailAgg._sum.orderCount ?? 0,
      };

      // rangeKpi 구성
      const rangeRevenue = rangeOrderAgg._sum.totalPrice ?? 0;
      const prevRangeRevenue = prevRangeOrderAgg._sum.totalPrice ?? 0;
      const rangeLabel = from && to ? 'custom' : effectiveRange;
      const rangeKpi = {
        range: rangeLabel,
        revenue: rangeRevenue,
        profit: 0,
        adSpend: Number(curAd.spend),
        prevRevenue: prevRangeRevenue,
        prevProfit: 0,
        revenueChange: prevRangeRevenue > 0 ? Math.round(((rangeRevenue - prevRangeRevenue) / prevRangeRevenue) * 1000) / 10 : 0,
        profitChange: 0,
        adRoas: Math.round(curRoas * 100) / 100,
        adConvRevenue: Number(curAd.revenue),
      };

      // trafficKpi 구성
      const trafficKpi = {
        visitors: trafficAgg._sum.visitors ?? 0,
        views: trafficAgg._sum.views ?? 0,
        orders: trafficAgg._sum.orders ?? 0,
        salesQty: trafficAgg._sum.salesQty ?? 0,
        revenue: trafficAgg._sum.revenue ?? 0,
        cartAdds: trafficAgg._sum.cartAdds ?? 0,
      };

      // adKpi 구성
      const adKpi = {
        totalSpend: Number(curAd.spend),
        impressions: Number(curAd.impressions),
        clicks: Number(curAd.clicks),
        convRevenue: Number(curAd.revenue),
        ctr: Math.round(curCtr * 100) / 100,
        roas: Math.round(curRoas * 100) / 100,
      };

      // comparison 구성
      const monthlyRevenuePL = monthlyPL._sum.revenue ?? 0;
      const monthlyProfitPL = monthlyPL._sum.netProfit ?? 0;
      const revenueChange = prevPLRevenue > 0 ? Math.round(((monthlyRevenuePL - prevPLRevenue) / prevPLRevenue) * 1000) / 10 : 0;
      const profitChange = prevPLProfit !== 0 ? Math.round(((monthlyProfitPL - prevPLProfit) / Math.abs(prevPLProfit)) * 1000) / 10 : 0;
      const comparison = {
        prevRevenue: prevPLRevenue,
        prevProfit: prevPLProfit,
        revenueChange,
        profitChange,
      };

      // dailyTrend 구성 (Order에서 일별 집계)
      const dailyRevenueMap = new Map<string, number>();
      for (const order of dailyOrderRows) {
        const dateKey = order.orderedAt.toISOString().slice(0, 10);
        dailyRevenueMap.set(dateKey, (dailyRevenueMap.get(dateKey) ?? 0) + order.totalPrice);
      }
      const dailyAdMap = new Map<string, number>(dailyAdRows.map((r) => [r.date, Number(r.ad_cost)]));
      const allDates = new Set([...dailyRevenueMap.keys(), ...dailyAdMap.keys()]);
      const dailyTrend = Array.from(allDates).sort().map((date) => ({
        date,
        revenue: dailyRevenueMap.get(date) ?? 0,
        adCost: dailyAdMap.get(date) ?? 0,
      }));

      // planAchievement 구성
      const planAchievement = salesPlan
        ? {
            targetRevenue: salesPlan.targetRevenue,
            actualRevenue: salesPlan.actualRevenue,
            targetOrders: salesPlan.targetOrders,
            actualOrders: salesPlan.actualOrders,
            achieveRate: salesPlan.targetRevenue > 0
              ? Math.round((salesPlan.actualRevenue / salesPlan.targetRevenue) * 1000) / 10
              : 0,
          }
        : null;

      // gradeChanges 구성
      const upgraded = gradeChangesRows.filter((g) => {
        const grades = ['D', 'C', 'B', 'A'];
        return grades.indexOf(g.newGrade) > grades.indexOf(g.oldGrade ?? 'D');
      }).length;
      const downgraded = gradeChangesRows.filter((g) => {
        const grades = ['D', 'C', 'B', 'A'];
        return grades.indexOf(g.newGrade) < grades.indexOf(g.oldGrade ?? 'D');
      }).length;
      const gradeChanges = {
        upgraded,
        downgraded,
        total: gradeChangesRows.length,
      };

      const industryBenchmark = { avgAdRate: 12, avgProfitRate: 8, avgRoas: 250, avgCtr: 1.5 };
      const dataFreshness = { lastSync: new Date().toISOString(), attributionWindow: '14일' };

      // profitLoss가 비어있으면 coupang_orders에서 실시간 계산
      if (!hasPLData) {
        const [monthlyOrderAgg, topOrderItems, orderTrend] =
          await Promise.all([
            this.prisma.$queryRaw<
              { revenue: number; order_count: number }[]
            >`
            SELECT
              COALESCE(SUM(total_price), 0)::int AS revenue,
              COUNT(*)::int AS order_count
            FROM coupang_orders
            WHERE ordered_at >= ${monthStart}
              AND ordered_at < ${monthEnd}
          `,
            this.prisma.$queryRaw<
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
            WHERE co.ordered_at >= ${monthStart}
              AND co.ordered_at < ${monthEnd}
              AND coi.seller_product_id IS NOT NULL
            GROUP BY coi.seller_product_id, coi.seller_product_name
            ORDER BY revenue DESC
            LIMIT 10
          `,
            this.prisma.$queryRaw<
              { month_start: Date; revenue: number; order_count: number }[]
            >`
            SELECT
              DATE_TRUNC('month', ordered_at) AS month_start,
              COALESCE(SUM(total_price), 0)::int AS revenue,
              COUNT(*)::int AS order_count
            FROM coupang_orders
            GROUP BY 1
            ORDER BY 1
          `,
          ]);

        const sellerIds = topOrderItems.map((r) => r.seller_product_id);
        const products =
          sellerIds.length > 0
            ? await this.prisma.product.findMany({
                where: { coupangProductId: { in: sellerIds } },
                include: { company: true },
              })
            : [];
        const productMap = new Map(
          products.map((p) => [p.coupangProductId, p]),
        );

        const monthlyRevenue = Number(monthlyOrderAgg[0]?.revenue ?? 0);

        return {
          summary: {
            todayRevenue: todayAgg._sum.totalPrice ?? 0,
            todayOrders: todayAgg._count,
            monthlyRevenue,
            monthlyProfit: 0,
            adRate: 0,
            totalProducts: totalActiveProducts,
            ...adMetrics,
          },
          gradeCount,
          alerts: unreadAlerts,
          warnings: {
            minusProducts: 0,
            lowProfitProducts: 0,
            highAdProducts: 0,
            needReorder,
          },
          topProducts: topOrderItems.map((r) => {
            const prod = productMap.get(r.seller_product_id);
            const rev = Number(r.revenue);
            const rate = prod?.commissionRate
              ? Number(prod.commissionRate)
              : 0.108;
            const comm = Math.round(rev * rate);
            const cnt = Number(r.order_count);
            const cogsVal = prod?.costCny
              ? Math.round(Number(prod.costCny) * 190 * cnt)
              : 0;
            const ship = (prod?.shippingCost ?? 0) * cnt;
            const net = rev - comm - cogsVal - ship;

            return {
              id: prod?.id ?? r.seller_product_id,
              name: prod?.name ?? r.seller_product_name,
              company: prod?.company?.name ?? 'N/A',
              grade: prod?.abcGrade ?? 'C',
              revenue: rev,
              netProfit: net,
              profitRate:
                rev > 0 ? Math.round((net / rev) * 1000) / 10 : 0,
            };
          }),
          monthlyTrend: orderTrend.map((m) => {
            const d = new Date(m.month_start);
            return {
              period: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
              revenue: Number(m.revenue),
              profit: 0,
              adCost: 0,
            };
          }),
          profitDetail,
          rangeKpi,
          trafficKpi,
          adKpi,
          comparison,
          dailyTrend,
          planAchievement,
          gradeChanges,
          industryBenchmark,
          dataFreshness,
        } satisfies DashboardSummary;
      }

      // profitLoss 데이터가 있는 경우 (기존 로직)
      const totalRevenue = monthlyPL._sum.revenue ?? 0;
      const totalAdCost = monthlyPL._sum.adCost ?? 0;
      const adRate =
        totalRevenue > 0 ? (totalAdCost / totalRevenue) * 100 : 0;

      const minusProducts = allPLCurrentMonth.filter(
        (pl) => pl.netProfit < 0,
      ).length;

      const lowProfitProducts = allPLCurrentMonth.filter((pl) => {
        const profitRate =
          pl.revenue > 0 ? (pl.netProfit / pl.revenue) * 100 : 0;
        return profitRate >= 0 && profitRate <= 3;
      }).length;

      const highAdProducts = allPLCurrentMonth.filter(
        (pl) =>
          pl.revenue > 0 &&
          pl.adCost > 0 &&
          (pl.adCost / pl.revenue) * 100 > 15,
      ).length;

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

      return {
        summary: {
          todayRevenue: todayAgg._sum.totalPrice ?? 0,
          todayOrders: todayAgg._count,
          monthlyRevenue: totalRevenue,
          monthlyProfit: monthlyPL._sum.netProfit ?? 0,
          adRate: Math.round(adRate * 10) / 10,
          totalProducts: totalActiveProducts,
          ...adMetrics,
        },
        gradeCount,
        alerts: unreadAlerts,
        warnings: {
          minusProducts,
          lowProfitProducts,
          highAdProducts,
          needReorder,
        },
        topProducts: topPLRows.map((tp) => ({
          id: tp.productId,
          name: tp.product?.name ?? 'N/A',
          company: tp.product?.company?.name ?? 'N/A',
          grade: tp.product?.abcGrade ?? 'C',
          revenue: tp.revenue,
          netProfit: tp.netProfit,
          profitRate:
            tp.revenue > 0
              ? Math.round((tp.netProfit / tp.revenue) * 1000) / 10
              : 0,
        })),
        monthlyTrend: plTrend.map((m) => ({
          period: `${m.year}-${String(m.month).padStart(2, '0')}`,
          revenue: m._sum.revenue ?? 0,
          profit: m._sum.netProfit ?? 0,
          adCost: m._sum.adCost ?? 0,
        })),
        profitDetail,
        rangeKpi,
        trafficKpi,
        adKpi,
        comparison,
        dailyTrend,
        planAchievement,
        gradeChanges,
        industryBenchmark,
        dataFreshness,
      } satisfies DashboardSummary;
    } catch {
      throw new InternalServerErrorException('서버 오류가 발생했습니다.');
    }
  }

  async getTrend(range: string): Promise<DashboardTrendItem[]> {
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [orderRows, adRows] = await Promise.all([
      this.prisma.$queryRaw<{ date: string; revenue: number }[]>`
        SELECT
          TO_CHAR(ordered_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS date,
          COALESCE(SUM(total_price), 0)::int AS revenue
        FROM orders
        WHERE ordered_at >= ${since}
        GROUP BY 1
        ORDER BY 1
      `,
      this.prisma.$queryRaw<{ date: string; ad_cost: number }[]>`
        SELECT
          TO_CHAR(date, 'YYYY-MM-DD') AS date,
          COALESCE(SUM(spend), 0)::int AS ad_cost
        FROM ads
        WHERE date >= ${since}::date
        GROUP BY 1
        ORDER BY 1
      `,
    ]);

    const adMap = new Map(adRows.map((r) => [r.date, Number(r.ad_cost)]));

    return orderRows.map((r) => ({
      date: r.date,
      revenue: Number(r.revenue),
      profit: 0,
      adCost: adMap.get(r.date) ?? 0,
    } satisfies DashboardTrendItem));
  }
}
