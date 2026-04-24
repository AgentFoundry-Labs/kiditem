import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  StatisticsOverview,
  StatisticsProductRow,
  StatisticsCategoryRow,
  StatisticsGradeRow,
  StatisticsParetoResponse,
  StatisticsRepurchaseResponse,
  StatisticsDeliveryResponse,
} from '@kiditem/shared';
import { PrismaService } from '../prisma/prisma.service';
import { buildPerListingMetrics } from '../common/per-listing-profit';
import { kstMonthStart } from '../common/kst';

const EXCLUDED_ORDER_STATUSES = ['cancelled', 'returned', 'refunded'] as const;

@Injectable()
export class StatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveWindow(period?: string) {
    if (period) {
      const [year, month] = period.split('-').map(Number);
      return { from: kstMonthStart(year, month), to: kstMonthStart(year, month + 1) };
    }

    const now = new Date();
    return {
      from: new Date(0),
      to: kstMonthStart(now.getFullYear(), now.getMonth() + 2),
    };
  }

  private buildOrderWhere(companyId: string, period?: string): Prisma.OrderWhereInput {
    const { from, to } = this.resolveWindow(period);
    return {
      companyId,
      orderedAt: { gte: from, lt: to },
      status: { notIn: [...EXCLUDED_ORDER_STATUSES] },
    };
  }

  private getListingMetrics(companyId: string, period?: string) {
    const { from, to } = this.resolveWindow(period);
    return buildPerListingMetrics(this.prisma, companyId, from, to);
  }

  async overview(companyId: string, period?: string) {
    const [metrics, totalProducts, totalOrders] = await Promise.all([
      this.getListingMetrics(companyId, period),
      this.prisma.masterProduct.count({
        where: { companyId, isDeleted: false },
      }),
      this.prisma.order.count({
        where: this.buildOrderWhere(companyId, period),
      }),
    ]);

    const totalRevenue = metrics.reduce((sum, metric) => sum + metric.revenue, 0);
    const totalProfit = metrics.reduce((sum, metric) => sum + metric.netProfit, 0);
    const avgMargin = totalRevenue > 0 ? totalProfit / totalRevenue : 0;

    return {
      totalRevenue,
      totalOrders,
      totalProfit,
      avgMargin: Math.round(avgMargin * 10000) / 10000,
      totalProducts,
    } satisfies StatisticsOverview;
  }

  async products(companyId: string, period?: string) {
    const metrics = await this.getListingMetrics(companyId, period);

    return [...metrics]
      .sort((a, b) => b.revenue - a.revenue)
      .map((metric) => ({
        listingId: metric.listingId,
        externalId: metric.externalId,
        channelName: metric.channelName,
        masterId: metric.masterId,
        masterCode: metric.masterCode,
        productName: metric.masterName,
        category: metric.category,
        grade: metric.grade,
        thumbnailUrl: metric.thumbnailUrl,
        totalRevenue: metric.revenue,
        netProfit: metric.netProfit,
        orderCount: metric.orderCount,
        profitRate: metric.revenue > 0
          ? Math.round((metric.netProfit / metric.revenue) * 10000) / 10000
          : 0,
        margin: metric.revenue > 0
          ? Math.round((metric.netProfit / metric.revenue) * 10000) / 10000
          : 0,
      } satisfies StatisticsProductRow));
  }

  async categories(companyId: string, period?: string) {
    const metrics = await this.getListingMetrics(companyId, period);

    const categoryMap = new Map<string, { revenue: number; orders: number; profit: number }>();

    for (const metric of metrics) {
      const cat = metric.category ?? '미분류';
      const entry = categoryMap.get(cat) ?? { revenue: 0, orders: 0, profit: 0 };
      entry.revenue += metric.revenue;
      entry.orders += metric.orderCount;
      entry.profit += metric.netProfit;
      categoryMap.set(cat, entry);
    }

    return Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        name: category,
        ...data,
        count: data.orders,
      } satisfies StatisticsCategoryRow))
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
      select: {
        orderedAt: true,
        totalPrice: true,
        lineItems: { select: { quantity: true } },
      },
    });

    const orderDailyMap = new Map<string, { orders: number; revenue: number; qty: number }>();
    for (const o of dailyOrders) {
      if (!o.orderedAt) continue;
      const key = o.orderedAt.toISOString().slice(0, 10);
      const entry = orderDailyMap.get(key) ?? { orders: 0, revenue: 0, qty: 0 };
      entry.orders += 1;
      entry.revenue += o.totalPrice ?? 0;
      entry.qty += o.lineItems.reduce((s, li) => s + li.quantity, 0);
      orderDailyMap.set(key, entry);
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
    } satisfies StatisticsDeliveryResponse;
  }

  async grades(companyId: string, period?: string) {
    const metrics = await this.getListingMetrics(companyId, period);

    const gradeMap = new Map<string, { revenue: number; profit: number; productCount: number; adCost: number }>();

    for (const metric of metrics) {
      const grade = metric.grade ?? 'N/A';
      const entry = gradeMap.get(grade) ?? { revenue: 0, profit: 0, productCount: 0, adCost: 0 };
      entry.revenue += metric.revenue;
      entry.profit += metric.netProfit;
      entry.productCount += 1;
      entry.adCost += metric.adCost;
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
      } satisfies StatisticsGradeRow))
      .sort((a, b) => b.revenue - a.revenue);
  }

  async pareto(companyId: string, period?: string) {
    const metrics = [...await this.getListingMetrics(companyId, period)]
      .sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = metrics.reduce((sum, metric) => sum + metric.revenue, 0);

    // Compute full pareto items with cumulative percent
    let cumulativeRevenue = 0;
    const fullParetoItems = metrics.map((metric, index) => {
      cumulativeRevenue += metric.revenue;
      const revenuePercent = totalRevenue > 0
        ? Math.round((metric.revenue / totalRevenue) * 1000) / 10
        : 0;
      const cumulativePercent = totalRevenue > 0
        ? Math.round((cumulativeRevenue / totalRevenue) * 1000) / 10
        : 0;
      const currentGrade = metric.grade ?? 'N/A';
      const suggestedGrade = cumulativePercent <= 70 ? 'A' : cumulativePercent <= 90 ? 'B' : 'C';
      return {
        id: metric.listingId,
        rank: index + 1,
        name: metric.masterName,
        currentGrade,
        suggestedGrade,
        gradeMatch: currentGrade === suggestedGrade,
        revenue: metric.revenue,
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
    } satisfies StatisticsParetoResponse;
  }

  async repurchase(companyId: string, period?: string) {
    const whereOrder: Prisma.OrderWhereInput = {
      companyId,
      status: { notIn: ['cancelled', 'returned'] },
    };
    if (period) {
      const [year, month] = period.split('-').map(Number);
      whereOrder.orderedAt = {
        gte: kstMonthStart(year, month),
        lt: kstMonthStart(year, month + 1),
      };
    }

    // customer-level aggregate (receiver 기반) — 기존 동작 유지 (Order.totalPrice/orderedAt/receiverName)
    const orders = await this.prisma.order.findMany({
      where: whereOrder,
      select: { receiverName: true, totalPrice: true, orderedAt: true },
    });

    // master-level repeat products — listingOption → listing → master 경유
    const lines = await this.prisma.orderLineItem.findMany({
      where: {
        order: whereOrder,
        listingOptionId: { not: null },
      },
      select: {
        order: { select: { receiverName: true } },
        listingOption: {
          select: {
            listing: {
              select: {
                masterId: true,
                master: { select: { name: true, category: true } },
              },
            },
          },
        },
      },
    });

    const masterMap = new Map<string, { productName: string; category: string | null; customers: Set<string>; orderCount: number }>();
    for (const l of lines) {
      const mid = l.listingOption?.listing?.masterId;
      if (!mid) continue;
      const entry = masterMap.get(mid) ?? {
        productName: l.listingOption?.listing?.master.name ?? '',
        category: l.listingOption?.listing?.master.category ?? null,
        customers: new Set<string>(),
        orderCount: 0,
      };
      if (l.order.receiverName) entry.customers.add(l.order.receiverName);
      entry.orderCount += 1;
      masterMap.set(mid, entry);
    }

    const repeatProducts = Array.from(masterMap.entries())
      .filter(([, v]) => v.customers.size >= 2)
      .sort((a, b) => b[1].orderCount - a[1].orderCount)
      .slice(0, 20)
      .map(([masterId, v]) => ({
        masterId,
        productName: v.productName,
        category: v.category,
        orderCount: v.orderCount,
      }));

    // customer-level (receiver) — 기존 로직 유지
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
    } satisfies StatisticsRepurchaseResponse;
  }
}
