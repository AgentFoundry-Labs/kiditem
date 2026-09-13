import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPerListingProfit,
  readAdEvidenceFromLedger,
} from '../../common/per-listing-profit';
import { kstMonthStart } from '../../common/kst';
import {
  ORDER_FACT_EXCLUDED_STATUSES,
  readListingOptionOrderFacts,
  readObservedOrderBounds,
  readOrderWindowFacts,
  readRepurchaseOrderFacts,
  type OrderWindowInput,
} from '../../orders/read/order-facts.reader';
import type {
  StatisticsOverview,
  StatisticsProductRow,
  StatisticsCategoryRow,
  StatisticsGradeRow,
  StatisticsParetoResponse,
  StatisticsRepurchaseResponse,
} from '@kiditem/shared/statistics';
import { Prisma } from '@prisma/client';

/**
 * Totals a profit column that may be unavailable.
 *
 * A rollup over a set containing an unavailable member is itself unavailable
 * (ADR-0006) — summing only the measured members would silently report a
 * smaller total as if it were the whole. Revenue and order counts never depend
 * on ad coverage, so they keep totalling every listing.
 */
/** Margin of an possibly-unavailable profit over its revenue. */
function ratio(netProfit: number | null, revenue: number): number | null {
  if (netProfit === null) return null;
  return revenue > 0 ? Math.round((netProfit / revenue) * 10000) / 10000 : 0;
}

function totalOrUnavailable(values: readonly (number | null)[]): number | null {
  let total = 0;
  for (const value of values) {
    if (value === null) return null;
    total += value;
  }
  return total;
}

@Injectable()
export class StatisticsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private async resolveWindow(organizationId: string, period?: string) {
    if (period) {
      const [year, month] = period.split('-').map(Number);
      return { from: kstMonthStart(year, month), to: kstMonthStart(year, month + 1) };
    }

    return this.prisma.$transaction((tx) => readObservedOrderBounds(tx, organizationId));
  }

  /**
   * Whether advertising applies to this window at all is Advertising's answer,
   * not one this read model may infer from an empty listing calendar.
   */
  private async getListingMetrics(organizationId: string, period?: string) {
    const window = await this.resolveWindow(organizationId, period);
    if (!window) return [];
    return this.getListingMetricsForWindow(organizationId, window);
  }

  async overview(organizationId: string, period?: string) {
    const window = await this.resolveWindow(organizationId, period);
    const [metrics, totalProducts, orderFacts] = await Promise.all([
      window ? this.getListingMetricsForWindow(organizationId, window) : Promise.resolve([]),
      this.prisma.channelListing.count({
        where: { organizationId, isActive: true },
      }),
      window
        ? this.prisma.$transaction((tx) => readOrderWindowFacts(tx, {
          organizationId,
          ...window,
          excludedStatuses: ORDER_FACT_EXCLUDED_STATUSES,
        }))
        : Promise.resolve(null),
    ]);
    const totalOrders = orderFacts?.orderCount ?? 0;

    const totalRevenue = metrics.reduce((sum, metric) => sum + metric.revenue, 0);
    const totalProfit = totalOrUnavailable(metrics.map((metric) => metric.netProfit));
    const avgMargin = totalProfit === null
      ? null
      : totalRevenue > 0 ? totalProfit / totalRevenue : 0;

    return {
      totalRevenue,
      totalOrders,
      totalProfit,
      avgMargin: avgMargin === null ? null : Math.round(avgMargin * 10000) / 10000,
      totalProducts,
    } satisfies StatisticsOverview;
  }

  async products(organizationId: string, period?: string) {
    const metrics = await this.getListingMetrics(organizationId, period);

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
        profitRate: ratio(metric.netProfit, metric.revenue),
        margin: ratio(metric.netProfit, metric.revenue),
      } satisfies StatisticsProductRow));
  }

  async categories(organizationId: string, period?: string) {
    const metrics = await this.getListingMetrics(organizationId, period);

    const categoryMap = new Map<string, {
      revenue: number;
      orders: number;
      profits: (number | null)[];
    }>();

    for (const metric of metrics) {
      const cat = metric.category ?? '미분류';
      const entry = categoryMap.get(cat) ?? { revenue: 0, orders: 0, profits: [] };
      entry.revenue += metric.revenue;
      entry.orders += metric.orderCount;
      entry.profits.push(metric.netProfit);
      categoryMap.set(cat, entry);
    }

    return Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        name: category,
        revenue: data.revenue,
        orders: data.orders,
        profit: totalOrUnavailable(data.profits),
        count: data.orders,
      } satisfies StatisticsCategoryRow))
      .sort((a, b) => b.revenue - a.revenue);
  }

  async grades(organizationId: string, period?: string) {
    const metrics = await this.getListingMetrics(organizationId, period);

    const gradeMap = new Map<string, {
      revenue: number;
      profits: (number | null)[];
      productCount: number;
      adCosts: (number | null)[];
    }>();

    for (const metric of metrics) {
      const grade = metric.grade ?? 'N/A';
      const entry = gradeMap.get(grade)
        ?? { revenue: 0, profits: [], productCount: 0, adCosts: [] };
      entry.revenue += metric.revenue;
      entry.profits.push(metric.netProfit);
      entry.productCount += 1;
      entry.adCosts.push(metric.adCost);
      gradeMap.set(grade, entry);
    }

    return Array.from(gradeMap.entries())
      .map(([grade, data]) => ({
        grade,
        revenue: data.revenue,
        profit: totalOrUnavailable(data.profits),
        count: data.productCount,
        productCount: data.productCount,
        adCost: totalOrUnavailable(data.adCosts),
      } satisfies StatisticsGradeRow))
      .sort((a, b) => b.revenue - a.revenue);
  }

  async pareto(organizationId: string, period?: string) {
    const metrics = [...await this.getListingMetrics(organizationId, period)]
      .sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = metrics.reduce((sum, metric) => sum + metric.revenue, 0);

    let cumulativeRevenue = 0;
    const paretoItems = metrics.map((metric, index) => {
      cumulativeRevenue += metric.revenue;
      const revenuePercent = totalRevenue > 0
        ? Math.round((metric.revenue / totalRevenue) * 1000) / 10
        : 0;
      const cumulativePercent = totalRevenue > 0
        ? Math.round((cumulativeRevenue / totalRevenue) * 1000) / 10
        : 0;
      const paretoBand = cumulativePercent <= 70
        ? 'top70' as const
        : cumulativePercent <= 90
          ? 'next20' as const
          : 'tail10' as const;
      return {
        id: metric.listingId,
        rank: index + 1,
        name: metric.masterName,
        paretoBand,
        revenue: metric.revenue,
        revenuePercent,
        cumulativePercent,
      };
    });

    const bandDistribution = { top70: 0, next20: 0, tail10: 0 };
    for (const item of paretoItems) {
      bandDistribution[item.paretoBand] += 1;
    }

    return {
      totalRevenue,
      bandDistribution,
      data: paretoItems,
    } satisfies StatisticsParetoResponse;
  }

  async repurchase(organizationId: string, period?: string) {
    const window = await this.resolveWindow(organizationId, period);
    if (!window) {
      return {
        totalCustomers: 0,
        repeatCount: 0,
        repurchaseRate: 0,
        totalOrders: 0,
        repeatProducts: [],
        repeatCustomers: [],
      } satisfies StatisticsRepurchaseResponse;
    }
    const input: OrderWindowInput = {
      organizationId,
      ...window,
      excludedStatuses: ['cancelled', 'returned'],
    };
    const { orders, lines, optionDisplays } = await this.prisma.$transaction(async (tx) => {
      const orders = await readRepurchaseOrderFacts(tx, input);
      const lines = await readListingOptionOrderFacts(tx, input);
      const optionIds = [...new Set(lines.map((line) => line.listingOptionId))];
      const optionDisplays = optionIds.length === 0 ? [] : await tx.channelListingOption.findMany({
        where: { organizationId, id: { in: optionIds } },
        select: {
          id: true,
          listing: {
            select: {
              id: true,
              displayName: true,
              channelName: true,
              externalId: true,
              category: true,
            },
          },
        },
      });
      return { orders, lines, optionDisplays };
    });
    const displayByOption = new Map(optionDisplays.map((option) => [option.id, option.listing]));
    const receiverByOrder = new Map(orders.map((order) => [order.orderId, order.receiverName]));

    const masterMap = new Map<string, { productName: string; category: string | null; customers: Set<string>; orderCount: number }>();
    for (const line of lines) {
      const listing = displayByOption.get(line.listingOptionId);
      if (!listing) continue;
      const mid = listing.id;
      const entry = masterMap.get(mid) ?? {
        productName: listing.displayName ?? listing.channelName ?? listing.externalId,
        category: listing.category,
        customers: new Set<string>(),
        orderCount: 0,
      };
      const receiverName = receiverByOrder.get(line.orderId);
      if (receiverName) entry.customers.add(receiverName);
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
      entry.totalAmount += o.revenue;
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

  private async getListingMetricsForWindow(
    organizationId: string,
    window: { from: Date; to: Date },
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const accountAdEvidence = await readAdEvidenceFromLedger(
          tx, organizationId, window.from, window.to,
        );
        return buildPerListingProfit(
          tx, organizationId, window.from, window.to, accountAdEvidence,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
