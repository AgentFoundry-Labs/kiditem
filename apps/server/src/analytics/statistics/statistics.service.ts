import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  StatisticsCategoriesResponse,
  StatisticsCategoryRow,
  StatisticsGradeRow,
  StatisticsGradesResponse,
  StatisticsOverview,
  StatisticsParetoItem,
  StatisticsParetoResponse,
  StatisticsProductRow,
  StatisticsProductsResponse,
  StatisticsRepurchaseResponse,
} from '@kiditem/shared/statistics';
import { PrismaService } from '../../prisma/prisma.service';
import { kstMonthStart } from '../../common/kst';
import {
  isOrderWindowComplete,
  orderWindowBasis,
  perListingProfitRows,
  profitWindowBasis,
  profitWindowTotals,
  readProfitWindowFacts,
  totalOrUnavailable,
  type PerListingProfit,
  type ProfitWindowFacts,
} from '../../common/per-listing-profit';
import {
  readListingOptionOrderFacts,
  readObservedOrderBounds,
  readOrderWindowFacts,
  readRepurchaseOrderFacts,
  type OrderWindowInput,
} from '../../orders/read/order-facts.reader';

const REPEATABLE_READ = { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead };

/** A refunded order still shows the customer came back; cancelled and returned orders do not. */
const REPURCHASE_EXCLUDED_STATUSES = ['cancelled', 'returned'] as const;

/** A ratio with four decimals. No ratio over an unavailable or zero denominator (ADR-0006). */
function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 10000) / 10000;
}

/** A percent share with one decimal of a total that exists and is non-zero. */
function share(part: number, total: number | null): number | null {
  if (total === null || total <= 0) return null;
  return Math.round((part / total) * 1000) / 10;
}

function paretoBand(cumulativePercent: number): 'top70' | 'next20' | 'tail10' {
  if (cumulativePercent <= 70) return 'top70';
  return cumulativePercent <= 90 ? 'next20' : 'tail10';
}

/**
 * Statistics over the owner readers.
 *
 * A window total or ratio is published only when the Orders collection covered
 * every business date of the window and its denominator is non-zero; per-row
 * values stay visible beside the basis that says which dates they rest on.
 */
@Injectable()
export class StatisticsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * An explicit period is its KST month. Without one the window spans the
   * observed completed orders; with no completed order there is no window.
   */
  private async resolveWindow(organizationId: string, period?: string) {
    if (period) {
      const [year, month] = period.split('-').map(Number);
      return { from: kstMonthStart(year, month), to: kstMonthStart(year, month + 1) };
    }

    return this.prisma.$transaction((tx) => readObservedOrderBounds(tx, organizationId));
  }

  private async readFacts(organizationId: string, period?: string): Promise<ProfitWindowFacts | null> {
    const window = await this.resolveWindow(organizationId, period);
    if (!window) return null;
    return this.prisma.$transaction(
      (tx) => readProfitWindowFacts(tx, organizationId, window.from, window.to),
      REPEATABLE_READ,
    );
  }

  private async readListingRows(
    organizationId: string,
    period?: string,
  ): Promise<{ facts: ProfitWindowFacts | null; rows: PerListingProfit[] }> {
    const facts = await this.readFacts(organizationId, period);
    const rows = facts ? perListingProfitRows(facts).sort((a, b) => b.revenue - a.revenue) : [];
    return { facts, rows };
  }

  async overview(organizationId: string, period?: string): Promise<StatisticsOverview> {
    const [facts, totalProducts] = await Promise.all([
      this.readFacts(organizationId, period),
      this.prisma.channelListing.count({
        where: { organizationId, isActive: true },
      }),
    ]);
    if (!facts) {
      return {
        totalRevenue: null,
        totalOrders: null,
        totalProfit: null,
        avgMargin: null,
        totalProducts,
        basis: null,
      } satisfies StatisticsOverview;
    }

    const totals = profitWindowTotals(facts);
    return {
      totalRevenue: totals.revenue,
      totalOrders: totals.orderCount,
      totalProfit: totals.netProfit,
      avgMargin: ratio(totals.netProfit, totals.revenue),
      totalProducts,
      basis: profitWindowBasis(facts),
    } satisfies StatisticsOverview;
  }

  async products(organizationId: string, period?: string): Promise<StatisticsProductsResponse> {
    const { facts, rows } = await this.readListingRows(organizationId, period);

    return {
      rows: rows.map((metric) => ({
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
      } satisfies StatisticsProductRow)),
      basis: facts ? profitWindowBasis(facts) : null,
    } satisfies StatisticsProductsResponse;
  }

  async categories(organizationId: string, period?: string): Promise<StatisticsCategoriesResponse> {
    const { facts, rows } = await this.readListingRows(organizationId, period);

    const categoryMap = new Map<string, {
      revenue: number;
      orders: number;
      profits: (number | null)[];
    }>();

    for (const metric of rows) {
      const cat = metric.category ?? '미분류';
      const entry = categoryMap.get(cat) ?? { revenue: 0, orders: 0, profits: [] };
      entry.revenue += metric.revenue;
      entry.orders += metric.orderCount;
      entry.profits.push(metric.netProfit);
      categoryMap.set(cat, entry);
    }

    return {
      rows: Array.from(categoryMap.entries())
        .map(([category, data]) => ({
          category,
          name: category,
          revenue: data.revenue,
          orders: data.orders,
          profit: totalOrUnavailable(data.profits),
          count: data.orders,
        } satisfies StatisticsCategoryRow))
        .sort((a, b) => b.revenue - a.revenue),
      basis: facts ? profitWindowBasis(facts) : null,
    } satisfies StatisticsCategoriesResponse;
  }

  async grades(organizationId: string, period?: string): Promise<StatisticsGradesResponse> {
    const { facts, rows } = await this.readListingRows(organizationId, period);

    const gradeMap = new Map<string, {
      revenue: number;
      profits: (number | null)[];
      productCount: number;
      adCosts: (number | null)[];
    }>();

    for (const metric of rows) {
      const grade = metric.grade ?? 'N/A';
      const entry = gradeMap.get(grade)
        ?? { revenue: 0, profits: [], productCount: 0, adCosts: [] };
      entry.revenue += metric.revenue;
      entry.profits.push(metric.netProfit);
      entry.productCount += 1;
      entry.adCosts.push(metric.adCost);
      gradeMap.set(grade, entry);
    }

    return {
      rows: Array.from(gradeMap.entries())
        .map(([grade, data]) => ({
          grade,
          revenue: data.revenue,
          profit: totalOrUnavailable(data.profits),
          count: data.productCount,
          productCount: data.productCount,
          adCost: totalOrUnavailable(data.adCosts),
        } satisfies StatisticsGradeRow))
        .sort((a, b) => b.revenue - a.revenue),
      basis: facts ? profitWindowBasis(facts) : null,
    } satisfies StatisticsGradesResponse;
  }

  async pareto(organizationId: string, period?: string): Promise<StatisticsParetoResponse> {
    const { facts, rows } = await this.readListingRows(organizationId, period);

    // Shares are cut from the whole window's listing revenue, so they exist
    // only once the Orders collection covered every date of it.
    const totalRevenue = facts && isOrderWindowComplete(facts.orderWindow)
      ? rows.reduce((sum, metric) => sum + metric.revenue, 0)
      : null;

    let cumulativeRevenue = 0;
    const data = rows.map((metric, index) => {
      cumulativeRevenue += metric.revenue;
      const cumulativePercent = share(cumulativeRevenue, totalRevenue);
      return {
        id: metric.listingId,
        rank: index + 1,
        name: metric.masterName,
        paretoBand: cumulativePercent === null ? null : paretoBand(cumulativePercent),
        revenue: metric.revenue,
        revenuePercent: share(metric.revenue, totalRevenue),
        cumulativePercent,
      } satisfies StatisticsParetoItem;
    });

    let bandDistribution: StatisticsParetoResponse['bandDistribution'] = null;
    if (totalRevenue !== null && totalRevenue > 0) {
      bandDistribution = { top70: 0, next20: 0, tail10: 0 };
      for (const item of data) {
        if (item.paretoBand) bandDistribution[item.paretoBand] += 1;
      }
    }

    return {
      totalRevenue,
      bandDistribution,
      data,
      basis: facts ? profitWindowBasis(facts) : null,
    } satisfies StatisticsParetoResponse;
  }

  async repurchase(organizationId: string, period?: string): Promise<StatisticsRepurchaseResponse> {
    const window = await this.resolveWindow(organizationId, period);
    if (!window) {
      return {
        totalCustomers: null,
        repeatCount: null,
        repurchaseRate: null,
        totalOrders: null,
        repeatProducts: [],
        repeatCustomers: [],
        basis: null,
      } satisfies StatisticsRepurchaseResponse;
    }
    const input: OrderWindowInput = {
      organizationId,
      ...window,
      excludedStatuses: REPURCHASE_EXCLUDED_STATUSES,
    };
    const { orderWindow, orders, lines, optionDisplays } = await this.prisma.$transaction(async (tx) => {
      const orderWindow = await readOrderWindowFacts(tx, input);
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
      return { orderWindow, orders, lines, optionDisplays };
    }, REPEATABLE_READ);
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

    // Customer counts describe the whole window, so they exist only once the
    // Orders collection covered every date of it.
    const collected = isOrderWindowComplete(orderWindow);
    const totalCustomers = collected ? receiverMap.size : null;
    const repeatCount = collected
      ? Array.from(receiverMap.values()).filter((c) => c.count >= 2).length
      : null;

    return {
      totalCustomers,
      repeatCount,
      repurchaseRate: ratio(repeatCount, totalCustomers),
      totalOrders: orderWindow.orderCount,
      repeatProducts,
      repeatCustomers,
      basis: { orders: orderWindowBasis(orderWindow) },
    } satisfies StatisticsRepurchaseResponse;
  }
}
