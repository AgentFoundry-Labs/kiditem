import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    try {
      const now = new Date();
      const todayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const todayAgg = await this.prisma.order.aggregate({
        _sum: { totalPrice: true, quantity: true },
        _count: true,
        where: { orderedAt: { gte: todayStart } },
      });

      const monthlyPL = await this.prisma.profitLoss.aggregate({
        _sum: { revenue: true, netProfit: true, adCost: true },
        where: { year, month },
      });

      const totalRevenue = monthlyPL._sum.revenue ?? 0;
      const totalAdCost = monthlyPL._sum.adCost ?? 0;
      const adRate =
        totalRevenue > 0 ? (totalAdCost / totalRevenue) * 100 : 0;

      const gradeRows = await this.prisma.product.groupBy({
        by: ['abcGrade'],
        _count: true,
        where: { status: 'active' },
      });

      const gradeCount = gradeRows.reduce<Record<string, number>>(
        (acc, g) => ({ ...acc, [g.abcGrade ?? 'C']: g._count }),
        {},
      );

      const unreadAlerts = await this.prisma.alert.findMany({
        where: { isRead: false },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      const allPLCurrentMonth = await this.prisma.profitLoss.findMany({
        where: { year, month },
      });

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

      const inventories = await this.prisma.inventory.findMany();
      const needReorder = inventories.filter(
        (inv) => inv.currentStock > 0 && inv.currentStock <= inv.reorderPoint,
      ).length;

      const totalActiveProducts = await this.prisma.product.count({
        where: { status: 'active' },
      });

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

      const monthlyTrend = await this.prisma.profitLoss.groupBy({
        by: ['year', 'month'],
        _sum: { revenue: true, netProfit: true, adCost: true },
        orderBy: [{ year: 'asc' }, { month: 'asc' }],
      });

      return {
        summary: {
          todayRevenue: todayAgg._sum.totalPrice ?? 0,
          todayOrders: todayAgg._count,
          monthlyRevenue: totalRevenue,
          monthlyProfit: monthlyPL._sum.netProfit ?? 0,
          adRate: Math.round(adRate * 10) / 10,
          totalProducts: totalActiveProducts,
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
        monthlyTrend: monthlyTrend.map((m) => ({
          period: `${m.year}-${String(m.month).padStart(2, '0')}`,
          revenue: m._sum.revenue ?? 0,
          profit: m._sum.netProfit ?? 0,
          adCost: m._sum.adCost ?? 0,
        })),
      };
    } catch {
      throw new InternalServerErrorException('서버 오류가 발생했습니다.');
    }
  }
}
