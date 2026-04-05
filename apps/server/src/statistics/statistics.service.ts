import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildPeriodFilter(period?: string) {
    if (!period) return {};
    const [year, month] = period.split('-').map(Number);
    return {
      orderedAt: {
        gte: new Date(year, month - 1, 1),
        lt: new Date(year, month, 1),
      },
    };
  }

  private buildPlPeriodFilter(period?: string) {
    if (!period) return {};
    const [year, month] = period.split('-').map(Number);
    return { year, month };
  }

  async overview(companyId: string, period?: string) {
    const plWhere = { companyId, ...this.buildPlPeriodFilter(period) };

    const [agg, totalProducts] = await Promise.all([
      this.prisma.profitLoss.aggregate({
        where: plWhere,
        _sum: {
          revenue: true,
          netProfit: true,
          orderCount: true,
        },
      }),
      this.prisma.product.count({ where: { companyId } }),
    ]);

    const totalRevenue = agg._sum.revenue ?? 0;
    const totalProfit = agg._sum.netProfit ?? 0;
    const totalOrders = agg._sum.orderCount ?? 0;
    const avgMargin = totalRevenue > 0 ? totalProfit / totalRevenue : 0;

    return {
      totalRevenue,
      totalOrders,
      totalProfit,
      avgMargin: Math.round(avgMargin * 10000) / 10000,
      totalProducts,
    };
  }

  async products(companyId: string, period?: string) {
    const plWhere = { companyId, ...this.buildPlPeriodFilter(period) };

    const records = await this.prisma.profitLoss.findMany({
      where: plWhere,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            category: true,
            abcGrade: true,
            thumbnailUrl: true,
          },
        },
      },
      orderBy: { revenue: 'desc' },
    });

    return records.map((r) => ({
      productId: r.productId,
      productName: r.product.name,
      category: r.product.category,
      grade: r.product.abcGrade,
      thumbnailUrl: r.product.thumbnailUrl,
      totalRevenue: r.revenue,
      netProfit: r.netProfit,
      orderCount: r.orderCount,
      profitRate: r.revenue > 0
        ? Math.round((r.netProfit / r.revenue) * 10000) / 10000
        : 0,
      margin: r.revenue > 0
        ? Math.round((r.netProfit / r.revenue) * 10000) / 10000
        : 0,
    }));
  }

  async categories(companyId: string, period?: string) {
    const plWhere = { companyId, ...this.buildPlPeriodFilter(period) };

    const records = await this.prisma.profitLoss.findMany({
      where: plWhere,
      include: {
        product: { select: { category: true } },
      },
    });

    const categoryMap = new Map<string, { revenue: number; orders: number; profit: number }>();

    for (const r of records) {
      const cat = r.product.category ?? '미분류';
      const entry = categoryMap.get(cat) ?? { revenue: 0, orders: 0, profit: 0 };
      entry.revenue += r.revenue;
      entry.orders += r.orderCount;
      entry.profit += r.netProfit;
      categoryMap.set(cat, entry);
    }

    return Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        name: category,
        ...data,
        count: data.orders,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  async delivery(companyId: string, period?: string) {
    const where: Record<string, unknown> = { companyId };

    if (period) {
      const [year, month] = period.split('-').map(Number);
      where.shippedAt = {
        gte: new Date(year, month - 1, 1),
        lt: new Date(year, month, 1),
      };
    }

    const shipments = await this.prisma.shipment.findMany({
      where,
      select: {
        deliveryDays: true,
        courierName: true,
      },
    });

    // Average delivery days
    const withDays = shipments.filter((s) => s.deliveryDays != null);
    const avgDeliveryDays = withDays.length > 0
      ? Math.round(
          (withDays.reduce((sum, s) => sum + s.deliveryDays!, 0) / withDays.length) * 10,
        ) / 10
      : 0;

    // Courier distribution
    const courierMap = new Map<string, number>();
    for (const s of shipments) {
      const name = s.courierName ?? '미지정';
      courierMap.set(name, (courierMap.get(name) ?? 0) + 1);
    }

    const courierDistribution = Array.from(courierMap.entries())
      .map(([courier, count]) => ({ courier, count }))
      .sort((a, b) => b.count - a.count);

    // Daily shipment counts (last 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const dailyShipments = await this.prisma.shipment.findMany({
      where: {
        companyId,
        shippedAt: { gte: thirtyDaysAgo, lte: now },
      },
      select: { shippedAt: true },
    });

    const dailyMap = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
      const d = new Date(now.getTime() - (29 - i) * 86400000);
      dailyMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const s of dailyShipments) {
      if (s.shippedAt) {
        const key = s.shippedAt.toISOString().slice(0, 10);
        if (dailyMap.has(key)) {
          dailyMap.set(key, (dailyMap.get(key) ?? 0) + 1);
        }
      }
    }
    const daily = Array.from(dailyMap.entries()).map(([date, count]) => ({ date, count }));

    return {
      totalShipments: shipments.length,
      avgDeliveryDays,
      courierDistribution,
      daily,
    };
  }

  async grades(companyId: string, period?: string) {
    const plWhere = { companyId, ...this.buildPlPeriodFilter(period) };

    const records = await this.prisma.profitLoss.findMany({
      where: plWhere,
      include: {
        product: { select: { abcGrade: true } },
      },
    });

    const gradeMap = new Map<string, { revenue: number; profit: number; productCount: number }>();

    for (const r of records) {
      const grade = r.product.abcGrade ?? 'N/A';
      const entry = gradeMap.get(grade) ?? { revenue: 0, profit: 0, productCount: 0 };
      entry.revenue += r.revenue;
      entry.profit += r.netProfit;
      entry.productCount += 1;
      gradeMap.set(grade, entry);
    }

    return Array.from(gradeMap.entries())
      .map(([grade, data]) => ({
        grade,
        revenue: data.revenue,
        profit: data.profit,
        count: data.productCount,
        productCount: data.productCount,
        adCost: 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  async pareto(companyId: string, period?: string) {
    const plWhere = { companyId, ...this.buildPlPeriodFilter(period) };

    const records = await this.prisma.profitLoss.findMany({
      where: plWhere,
      include: {
        product: { select: { id: true, name: true, abcGrade: true } },
      },
      orderBy: { revenue: 'desc' },
    });

    const totalRevenue = records.reduce((sum, r) => sum + r.revenue, 0);
    const top20Count = Math.max(1, Math.ceil(records.length * 0.2));
    const top20Records = records.slice(0, top20Count);
    const top20Revenue = top20Records.reduce((sum, r) => sum + r.revenue, 0);

    // Grade distribution
    const gradeMap = new Map<string, { count: number; revenue: number }>();
    for (const r of records) {
      const grade = r.product.abcGrade ?? 'N/A';
      const entry = gradeMap.get(grade) ?? { count: 0, revenue: 0 };
      entry.count += 1;
      entry.revenue += r.revenue;
      gradeMap.set(grade, entry);
    }
    const gradeDistribution = Array.from(gradeMap.entries())
      .map(([grade, data]) => ({ grade, ...data }))
      .sort((a, b) => b.revenue - a.revenue);

    const top20Products = top20Records.map((r) => ({
      productId: r.productId,
      productName: r.product.name,
      revenue: r.revenue,
    }));

    return {
      totalProducts: records.length,
      top20Count,
      totalRevenue,
      top20Revenue,
      top20RevenueRatio: totalRevenue > 0
        ? Math.round((top20Revenue / totalRevenue) * 10000) / 10000
        : 0,
      top20Products,
      data: top20Products,
      gradeDistribution,
    };
  }

  async repurchase(companyId: string, period?: string) {
    const where: Record<string, unknown> = { companyId };

    if (period) {
      const [year, month] = period.split('-').map(Number);
      where.orderedAt = {
        gte: new Date(year, month - 1, 1),
        lt: new Date(year, month, 1),
      };
    }

    const orders = await this.prisma.order.findMany({
      where: {
        ...where,
        status: { notIn: ['cancelled', 'returned'] },
      },
      select: { receiverName: true },
    });

    // Count orders per receiver
    const receiverMap = new Map<string, number>();
    for (const o of orders) {
      const name = o.receiverName ?? '';
      if (!name) continue;
      receiverMap.set(name, (receiverMap.get(name) ?? 0) + 1);
    }

    const totalCustomers = receiverMap.size;
    const repeatCustomers = Array.from(receiverMap.values()).filter((c) => c >= 2).length;
    const repurchaseRate = totalCustomers > 0
      ? Math.round((repeatCustomers / totalCustomers) * 10000) / 10000
      : 0;

    return {
      totalCustomers,
      repeatCustomers: repeatCustomers as number,
      repurchaseRate,
      totalOrders: orders.length,
      repeatCount: repeatCustomers,
      repeatProducts: [] as string[],
      repeatCustomersList: [] as string[],
    };
  }
}
