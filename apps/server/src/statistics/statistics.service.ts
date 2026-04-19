import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LISTING_WITH_MASTER_SELECT_EXTENDED } from '../common/listing-select';

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
      this.prisma.masterProduct.count({
        where: { companyId, isDeleted: false },
      }),
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
        listing: { select: LISTING_WITH_MASTER_SELECT_EXTENDED },
      },
      orderBy: { revenue: 'desc' },
    });

    return records.map((r) => ({
      listingId: r.listingId,
      externalId: r.listing.externalId,
      channelName: r.listing.channelName,
      masterId: r.listing.master.id,
      masterCode: r.listing.master.code,
      productName: r.listing.master.name,
      category: r.listing.master.category,
      grade: r.listing.master.abcGrade,
      thumbnailUrl: r.listing.master.thumbnailUrl,
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
    // Daily order counts/revenue (last 30 days)
    const dailyOrders = await this.prisma.order.findMany({
      where: {
        companyId,
        orderedAt: { gte: thirtyDaysAgo, lte: now },
        status: { notIn: ['cancelled', 'returned'] },
      },
      select: { orderedAt: true, totalPrice: true, quantity: true },
    });

    const orderDailyMap = new Map<string, { orders: number; revenue: number; qty: number }>();
    for (const o of dailyOrders) {
      if (o.orderedAt) {
        const key = o.orderedAt.toISOString().slice(0, 10);
        const entry = orderDailyMap.get(key) ?? { orders: 0, revenue: 0, qty: 0 };
        entry.orders += 1;
        entry.revenue += o.totalPrice ?? 0;
        entry.qty += o.quantity ?? 0;
        orderDailyMap.set(key, entry);
      }
    }

    const daily = Array.from(dailyMap.entries()).map(([date, count]) => {
      const orderEntry = orderDailyMap.get(date) ?? { orders: 0, revenue: 0, qty: 0 };
      return { date, count, ...orderEntry };
    });

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

    const gradeMap = new Map<string, { revenue: number; profit: number; productCount: number; adCost: number }>();

    for (const r of records) {
      const grade = r.product.abcGrade ?? 'N/A';
      const entry = gradeMap.get(grade) ?? { revenue: 0, profit: 0, productCount: 0, adCost: 0 };
      entry.revenue += r.revenue;
      entry.profit += r.netProfit;
      entry.productCount += 1;
      entry.adCost += r.adCost;
      gradeMap.set(grade, entry);
    }

    return Array.from(gradeMap.entries())
      .map(([grade, data]) => ({
        grade,
        revenue: data.revenue,
        profit: data.profit,
        count: data.productCount,
        productCount: data.productCount,
        adCost: data.adCost,
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

    // Compute full pareto items with cumulative percent
    let cumulativeRevenue = 0;
    const fullParetoItems = records.map((r, index) => {
      cumulativeRevenue += r.revenue;
      const revenuePercent = totalRevenue > 0
        ? Math.round((r.revenue / totalRevenue) * 1000) / 10
        : 0;
      const cumulativePercent = totalRevenue > 0
        ? Math.round((cumulativeRevenue / totalRevenue) * 1000) / 10
        : 0;
      const currentGrade = r.product.abcGrade ?? 'N/A';
      const suggestedGrade = cumulativePercent <= 70 ? 'A' : cumulativePercent <= 90 ? 'B' : 'C';
      return {
        id: r.productId,
        rank: index + 1,
        name: r.product.name,
        currentGrade,
        suggestedGrade,
        gradeMatch: currentGrade === suggestedGrade,
        revenue: r.revenue,
        revenuePercent,
        cumulativePercent,
      };
    });

    // Grade distribution as object
    const gradeDistribution = { A: 0, B: 0, C: 0 } as { A: number; B: number; C: number };
    for (const item of fullParetoItems) {
      const g = item.currentGrade as 'A' | 'B' | 'C';
      if (g in gradeDistribution) gradeDistribution[g] += 1;
    }

    const mismatchCount = fullParetoItems.filter((item) => !item.gradeMatch).length;

    return {
      totalRevenue,
      gradeDistribution,
      mismatchCount,
      data: fullParetoItems,
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
      select: { receiverName: true, totalPrice: true, orderedAt: true },
    });

    // repeatProducts
    const productOrders = await this.prisma.order.findMany({
      where: {
        ...where,
        status: { notIn: ['cancelled', 'returned'] },
        productId: { not: null },
      },
      select: {
        productId: true,
        receiverName: true,
        product: { select: { name: true, category: true } },
      },
    });

    const productCustomerMap = new Map<string, { productName: string; category: string | null; customers: Set<string>; orderCount: number }>();
    for (const o of productOrders) {
      if (!o.productId) continue;
      const entry = productCustomerMap.get(o.productId) ?? {
        productName: o.product?.name ?? '',
        category: o.product?.category ?? null,
        customers: new Set<string>(),
        orderCount: 0,
      };
      if (o.receiverName) entry.customers.add(o.receiverName);
      entry.orderCount += 1;
      productCustomerMap.set(o.productId, entry);
    }

    const repeatProducts = Array.from(productCustomerMap.entries())
      .filter(([, v]) => v.customers.size >= 2)
      .sort((a, b) => b[1].orderCount - a[1].orderCount)
      .slice(0, 20)
      .map(([productId, v]) => ({
        productId,
        productName: v.productName,
        category: v.category,
        orderCount: v.orderCount,
      }));

    // Count orders per receiver
    const receiverMap = new Map<string, { count: number; totalAmount: number; lastOrder: Date | null }>();
    for (const o of orders) {
      const name = o.receiverName ?? '';
      if (!name) continue;
      const entry = receiverMap.get(name) ?? { count: 0, totalAmount: 0, lastOrder: null };
      entry.count += 1;
      entry.totalAmount += o.totalPrice ?? 0;
      if (!entry.lastOrder || (o.orderedAt && o.orderedAt > entry.lastOrder)) {
        entry.lastOrder = o.orderedAt;
      }
      receiverMap.set(name, entry);
    }

    const totalCustomers = receiverMap.size;
    const repeatCustomerCount = Array.from(receiverMap.values()).filter((c) => c.count >= 2).length;
    const repurchaseRate = totalCustomers > 0
      ? Math.round((repeatCustomerCount / totalCustomers) * 10000) / 10000
      : 0;

    const repeatCustomers = Array.from(receiverMap.entries())
      .filter(([, v]) => v.count >= 2)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20)
      .map(([name, v]) => ({
        name,
        count: v.count,
        totalAmount: v.totalAmount,
        lastOrder: v.lastOrder,
      }));

    return {
      totalCustomers,
      repeatCount: repeatCustomerCount,
      repurchaseRate,
      totalOrders: orders.length,
      repeatProducts,
      repeatCustomers,
    };
  }
}
