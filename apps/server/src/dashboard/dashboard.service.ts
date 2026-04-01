import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { kstDayStart } from '../common/kst';
import type { DashboardSummary, DashboardTrendItem } from '@kiditem/shared';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(): Promise<DashboardSummary> {
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
            const cogs = prod?.costCny
              ? Math.round(Number(prod.costCny) * 190 * cnt)
              : 0;
            const ship = (prod?.shippingCost ?? 0) * cnt;
            const net = rev - comm - cogs - ship;

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
