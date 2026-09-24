import { AI_LISTING_CONTENT_QUERY_PORT, type ListingContentQueryPort } from '../../content/application/port/in/workspace/listing-content-query.port';
import { CHANNEL_OPTION_RECIPE_PORT, type ChannelOptionRecipePort } from '../../channels/application/port/in/channel-option-recipe.port';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../channels/application/port/in/account/channel-account.port';
import { ownerTransaction } from '../../prisma/owner-transaction';
import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../channels/application/port/in/listing/channel-listing-query.port';
import { Inject, Injectable } from '@nestjs/common';
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
import { kstBusinessDate, kstMonthWindow, kstWindowDateRange } from '../../common/kst';
import {
  isOrderWindowComplete,
  orderWindowBasis,
  perListingProfitRows,
  profitWindowBasis,
  profitWindowTotals,
  readProfitWindowFacts,
  resolveFinanceWindow,
  totalOrUnavailable,
  type FinanceWindow,
  type PerListingProfit,
  type ProfitWindowFacts,
} from '../../common/per-listing-profit';
import {
  PRODUCT_TRANSACTIONAL_READ_PORT,
  type ProductTransactionalReadPort,
} from '../../products/application/port/in/product-transactional-read.port';
import {
  readListingOptionOrderFacts,
  readOrderWindowFacts,
  readRepurchaseOrderFacts,
  type OrderWindowInput,
} from '../../orders/adapter/out/persistence/read/order-facts.reader';

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
 * The window is evaluated over its KST business days closed at `now`
 * (ADR-0001). A window total or ratio is published only when the Orders
 * collection covered every one of those days and its denominator is non-zero;
 * per-row values stay visible beside the basis that says which dates they rest
 * on.
 */
@Injectable()
export class StatisticsService {
  constructor(
    @Inject(CHANNEL_LISTING_QUERY_PORT) private readonly channelListings: ChannelListingQueryPort,
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT)
    private readonly inventoryTransactionalRead: ProductTransactionalReadPort,
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly channelAccounts: ChannelAccountPort,
    @Inject(CHANNEL_OPTION_RECIPE_PORT) private readonly channelRecipes: ChannelOptionRecipePort,
    @Inject(AI_LISTING_CONTENT_QUERY_PORT) private readonly listingContent: ListingContentQueryPort,
  ) {}

  /**
   * The KST month a statistics read evaluates: the explicit period, or the
   * month containing `now` — the default every finance screen uses, so an
   * omitted period never scans the whole order history. Clipped to the days
   * closed at `now`.
   */
  private resolveWindow(period: string | undefined, now: Date): FinanceWindow {
    if (period) {
      const [year, month] = period.split('-').map(Number);
      return resolveFinanceWindow(kstMonthWindow(year, month), now);
    }
    const today = kstBusinessDate(now);
    return resolveFinanceWindow(kstMonthWindow(today.getUTCFullYear(), today.getUTCMonth() + 1), now);
  }

  private readFacts(organizationId: string, period: string | undefined, now: Date): Promise<ProfitWindowFacts> {
    const window = this.resolveWindow(period, now);
    return this.prisma.$transaction(
      (tx) => readProfitWindowFacts(
        tx,
        organizationId,
        window,
        this.inventoryTransactionalRead, { listings: this.channelListings, recipes: this.channelRecipes, accounts: this.channelAccounts, content: this.listingContent }
      ),
      REPEATABLE_READ,
    );
  }

  private async readListingRows(
    organizationId: string,
    period: string | undefined,
    now: Date,
  ): Promise<{ facts: ProfitWindowFacts; rows: PerListingProfit[] }> {
    const facts = await this.readFacts(organizationId, period, now);
    const rows = perListingProfitRows(facts).sort((a, b) => b.revenue - a.revenue);
    return { facts, rows };
  }

  async overview(
    organizationId: string,
    period: string | undefined,
    now: Date,
  ): Promise<StatisticsOverview> {
    const [facts, totalProducts] = await Promise.all([
      this.readFacts(organizationId, period, now),
      this.channelListings.readCatalogFacts(ownerTransaction(this.prisma), { organizationId, activeOnly: true }).then(rows => rows.length),
    ]);
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

  async products(
    organizationId: string,
    period: string | undefined,
    now: Date,
  ): Promise<StatisticsProductsResponse> {
    const { facts, rows } = await this.readListingRows(organizationId, period, now);

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
      basis: profitWindowBasis(facts),
    } satisfies StatisticsProductsResponse;
  }

  async categories(
    organizationId: string,
    period: string | undefined,
    now: Date,
  ): Promise<StatisticsCategoriesResponse> {
    const { facts, rows } = await this.readListingRows(organizationId, period, now);

    const categoryMap = new Map<string, {
      revenue: number;
      orders: number;
      profits: (number | null)[];
      listingIds: Set<string>;
    }>();

    for (const metric of rows) {
      const cat = metric.category ?? '미분류';
      const entry = categoryMap.get(cat) ?? { revenue: 0, orders: 0, profits: [], listingIds: new Set<string>() };
      entry.revenue += metric.revenue;
      entry.orders += metric.orderCount;
      entry.profits.push(metric.netProfit);
      entry.listingIds.add(metric.listingId);
      categoryMap.set(cat, entry);
    }

    // A group total describes the whole evaluated window, so like the overview
    // it exists only once the Orders collection covered every date of it.
    const collected = isOrderWindowComplete(facts.orderWindow);
    return {
      rows: Array.from(categoryMap.entries())
        .sort(([, left], [, right]) => right.revenue - left.revenue)
        .map(([category, data]) => ({
          category,
          name: category,
          revenue: collected ? data.revenue : null,
          orders: collected ? data.orders : null,
          profit: collected ? totalOrUnavailable(data.profits) : null,
          productCount: collected ? data.listingIds.size : null,
        } satisfies StatisticsCategoryRow)),
      basis: profitWindowBasis(facts),
    } satisfies StatisticsCategoriesResponse;
  }

  async grades(
    organizationId: string,
    period: string | undefined,
    now: Date,
  ): Promise<StatisticsGradesResponse> {
    const { facts, rows } = await this.readListingRows(organizationId, period, now);

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

    // Same rule as categories: no group total over a partly collected window.
    const collected = isOrderWindowComplete(facts.orderWindow);
    return {
      rows: Array.from(gradeMap.entries())
        .sort(([, left], [, right]) => right.revenue - left.revenue)
        .map(([grade, data]) => ({
          grade,
          revenue: collected ? data.revenue : null,
          profit: collected ? totalOrUnavailable(data.profits) : null,
          count: collected ? data.productCount : null,
          adCost: collected ? totalOrUnavailable(data.adCosts) : null,
        } satisfies StatisticsGradeRow)),
      basis: profitWindowBasis(facts),
    } satisfies StatisticsGradesResponse;
  }

  async pareto(
    organizationId: string,
    period: string | undefined,
    now: Date,
  ): Promise<StatisticsParetoResponse> {
    const { facts, rows } = await this.readListingRows(organizationId, period, now);

    // Shares are cut from the whole evaluated window's listing revenue, so they
    // exist only once the Orders collection covered every date of it.
    const totalRevenue = isOrderWindowComplete(facts.orderWindow)
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
      basis: profitWindowBasis(facts),
    } satisfies StatisticsParetoResponse;
  }

  async repurchase(
    organizationId: string,
    period: string | undefined,
    now: Date,
  ): Promise<StatisticsRepurchaseResponse> {
    const window = this.resolveWindow(period, now);
    const input: OrderWindowInput = {
      organizationId,
      ...window.effective,
      excludedStatuses: REPURCHASE_EXCLUDED_STATUSES,
    };
    const { orderWindow, orders, lines, optionDisplays } = await this.prisma.$transaction(async (tx) => {
      const orderWindow = await readOrderWindowFacts(tx, input, this.channelAccounts);
      const orders = await readRepurchaseOrderFacts(tx, input);
      const lines = await readListingOptionOrderFacts(tx, input);
      const optionIds = [...new Set(lines.map((line) => line.listingOptionId))];
      const optionDisplays = optionIds.length === 0 ? [] : await this.channelListings.readOptionIdentities(ownerTransaction(tx), { organizationId, optionIds }).then(async rows => { const listings = await this.channelListings.readDisplayFacts(ownerTransaction(tx), { organizationId, listingIds: [...new Set(rows.map(row => row.listingId))] }); const byId = new Map(listings.map(row => [row.id, row])); return rows.map(row => ({ id: row.optionId, listing: byId.get(row.listingId)! })); });
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

    // Customer counts describe the whole evaluated window, so they exist only
    // once the Orders collection covered every date of it.
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
      basis: {
        requestedWindow: kstWindowDateRange(window.requested),
        orders: orderWindowBasis(orderWindow, window),
      },
    } satisfies StatisticsRepurchaseResponse;
  }
}
