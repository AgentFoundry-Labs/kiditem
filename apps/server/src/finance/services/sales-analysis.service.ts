import { Injectable, Logger } from '@nestjs/common';
import type { SalesAnalysisData, ChannelAnalysis } from '@kiditem/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { kstMonthStart } from '../../common/kst';
import { resolvePricing } from '../../common/option-pricing-resolver';

const EXCLUDED_ORDER_STATUSES = ['cancelled', 'returned', 'refunded'] as const;

/**
 * Map ChannelListing.channel (platform) → ChannelAnalysis.channelType.
 * ChannelListing does NOT have channelType field; derive from channel value.
 */
const CHANNEL_TYPE_MAP: Record<string, 'marketplace' | 'direct' | 'other'> = {
  coupang: 'marketplace',
  naver: 'marketplace',
  '11st': 'marketplace',
  gmarket: 'marketplace',
  auction: 'marketplace',
  wing: 'direct',
};

function resolveChannelType(channel: string): 'marketplace' | 'direct' | 'other' {
  return CHANNEL_TYPE_MAP[channel] ?? 'other';
}

/**
 * Plan D.3 — sales-analysis live aggregation (ADR-0016 bypass + ADR-0017 returnRate + orphan policy).
 *
 * Hard rewrite Phase H3b — per-channel ad spend now sources from
 * `ChannelListingDailySnapshot.adSpend` aggregated by listing over the
 * requested KST month window. Replaces the legacy legacy `Ad.groupBy`
 * call that read the `ads` table. Daily facts are the single source-of-truth
 * for listing/day ad metrics; period totals are SUMs over `businessDate`.
 *
 * Data flow:
 *   Order (+ shippingPrice) → OrderLineItem → ChannelListingOption.listing.channel
 *   + OrderReturnLineItem INNER JOIN Order (ADR-0017, 3-hop IDOR)
 *   + ChannelListingDailySnapshot.groupBy(['listingId'], _sum.adSpend)
 *     → listingId→channel map
 *
 * Group key: `ChannelListing.channel` (platform)
 * Orphan side metric: `totals.orphanReturnCount` (requestedAt ∈ period + orderId NULL).
 */
@Injectable()
export class SalesAnalysisService {
  private readonly logger = new Logger(SalesAnalysisService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getAnalysis(
    companyId: string,
    period?: string,
  ): Promise<SalesAnalysisData> {
    const startedAt = Date.now();
    const resolvedPeriod = this.resolvePeriod(period);
    const { year, month } = this.parsePeriod(resolvedPeriod);
    const from = kstMonthStart(year, month);
    const to = kstMonthStart(year, month + 1);

    // 4 parallel queries (all data-independent)
    const [orders, returnOrderIdRows, adGroupRows, orphanCount] = await Promise.all([
      // 1) Orders with nested listingOption.listing.channel
      this.prisma.order.findMany({
        where: {
          companyId,
          orderedAt: { gte: from, lt: to },
          status: { notIn: [...EXCLUDED_ORDER_STATUSES] },
        },
        select: {
          id: true,
          shippingPrice: true,
          lineItems: {
            select: {
              quantity: true,
              totalPrice: true,
              option: {
                select: { costPrice: true, commissionRate: true, otherCost: true },
              },
              listingOption: {
                select: { listing: { select: { id: true, channel: true } } },
              },
            },
          },
        },
      }),
      // 2) Return events — need (orderId, channel) per returned lineItem.
      //    3-hop IDOR: OrderReturnLineItem.companyId + return.companyId + return.order.companyId
      //    Status filter mirror on return.order.
      this.prisma.orderReturnLineItem.findMany({
        where: {
          companyId,
          return: {
            companyId,
            order: {
              companyId,
              orderedAt: { gte: from, lt: to },
              status: { notIn: [...EXCLUDED_ORDER_STATUSES] },
            },
          },
        },
        select: {
          orderLineItem: {
            select: {
              order: { select: { id: true } },
              listingOption: {
                select: { listing: { select: { channel: true } } },
              },
            },
          },
        },
      }),
      // 3) Ad spend grouped by listingId — Hard rewrite Phase H3b: source
      // moved from legacy `Ad` to `ChannelListingDailySnapshot.adSpend`.
      // listingId is non-nullable on the daily-fact row so the resulting
      // shape is straightforward.
      this.prisma.channelListingDailySnapshot.groupBy({
        by: ['listingId'],
        _sum: { adSpend: true },
        where: {
          companyId,
          businessDate: { gte: from, lt: to },
        },
      }),
      // 4) Orphan return count (ADR-0017 side metric) — orderId NULL, requestedAt ∈ period
      this.prisma.orderReturn.count({
        where: {
          companyId,
          orderId: null,
          requestedAt: { gte: from, lt: to },
        },
      }),
    ]);

    // Resolve listingId → channel (for ad rows). `listingId` is non-nullable
    // on `ChannelListingDailySnapshot` so the filter just dedupes.
    const adListingIds = Array.from(
      new Set(adGroupRows.map((r) => r.listingId)),
    );
    const listings =
      adListingIds.length > 0
        ? await this.prisma.channelListing.findMany({
            where: { id: { in: adListingIds }, companyId },
            select: { id: true, channel: true },
          })
        : [];
    const listingIdToChannel = new Map<string, string>(
      listings.map((l) => [l.id, l.channel]),
    );

    // Build return order-set per channel (ADR-0017 distinct Order count)
    const returnOrderSets = new Map<string, Set<string>>();
    for (const rli of returnOrderIdRows) {
      const channel = rli.orderLineItem?.listingOption?.listing?.channel;
      const orderId = rli.orderLineItem?.order?.id;
      if (!channel || !orderId) continue;
      if (!returnOrderSets.has(channel)) returnOrderSets.set(channel, new Set());
      returnOrderSets.get(channel)!.add(orderId);
    }

    // Build ad cost per channel — daily-fact `adSpend` SUM grouped by listing,
    // mapped to channel via the IDOR-scoped listing lookup above.
    const adCostMap = new Map<string, number>();
    for (const row of adGroupRows) {
      const channel = listingIdToChannel.get(row.listingId);
      if (!channel) continue;
      adCostMap.set(channel, (adCostMap.get(channel) ?? 0) + (row._sum.adSpend ?? 0));
    }

    // Aggregate orders per channel
    type Agg = {
      channel: string;
      orderIds: Set<string>;
      totalRevenue: number;
      totalCogs: number;
      totalCommission: number;
      totalShipping: number;
      totalOtherCost: number;
    };
    const groups = new Map<string, Agg>();
    const globalOrderIds = new Set<string>(); // totals.totalOrders — global distinct

    for (const o of orders) {
      globalOrderIds.add(o.id);
      const orderTotalRevenue = o.lineItems.reduce(
        (sum, li) => sum + (li.totalPrice || 0),
        0,
      );

      for (const li of o.lineItems) {
        const channel = li.listingOption?.listing?.channel;
        if (!channel) continue;
        let g = groups.get(channel);
        if (!g) {
          g = {
            channel,
            orderIds: new Set<string>(),
            totalRevenue: 0,
            totalCogs: 0,
            totalCommission: 0,
            totalShipping: 0,
            totalOtherCost: 0,
          };
          groups.set(channel, g);
        }

        g.orderIds.add(o.id);
        const resolved = resolvePricing({ option: li.option ?? {} });
        const lineRevenue = li.totalPrice || 0;
        g.totalRevenue += lineRevenue;
        g.totalCogs += Math.round(resolved.costPrice * li.quantity);
        g.totalCommission += Math.round(lineRevenue * resolved.commissionRate);
        g.totalOtherCost += Math.round(resolved.otherCost * li.quantity);

        // Revenue-weighted shipping (ADR-0016 pattern, D.1 T5)
        if (orderTotalRevenue > 0 && o.shippingPrice) {
          g.totalShipping += Math.round(
            o.shippingPrice * (lineRevenue / orderTotalRevenue),
          );
        }
      }
    }

    const channels: ChannelAnalysis[] = Array.from(groups.values())
      .map((g) => {
        const returnedOrderIds = returnOrderSets.get(g.channel) ?? new Set<string>();
        const returnCount = returnedOrderIds.size;
        const totalOrders = g.orderIds.size;
        const adCost = adCostMap.get(g.channel) ?? 0;
        const totalCost =
          g.totalCogs +
          g.totalCommission +
          g.totalShipping +
          adCost +
          g.totalOtherCost;
        const totalProfit = g.totalRevenue - totalCost;
        const returnRate =
          totalOrders === 0 ? 0 : Math.min(1, returnCount / totalOrders);
        const avgOrderValue = totalOrders === 0 ? 0 : g.totalRevenue / totalOrders;
        return {
          channel: g.channel,
          channelType: resolveChannelType(g.channel),
          totalOrders,
          totalRevenue: g.totalRevenue,
          totalCost,
          totalProfit,
          returnCount,
          returnRate,
          avgOrderValue,
        } satisfies ChannelAnalysis;
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    const totals = {
      totalRevenue: channels.reduce((s, c) => s + c.totalRevenue, 0),
      totalProfit: channels.reduce((s, c) => s + c.totalProfit, 0),
      totalOrders: globalOrderIds.size, // global distinct (NOT channels sum)
      totalCost: channels.reduce((s, c) => s + c.totalCost, 0),
      orphanReturnCount: orphanCount,
    };

    const result = { period: resolvedPeriod, channels, totals } satisfies SalesAnalysisData;

    this.logger.log({
      msg: 'sales-analysis.getAnalysis',
      companyId,
      period: resolvedPeriod,
      channelCount: channels.length,
      totalOrders: totals.totalOrders,
      totalRevenue: totals.totalRevenue,
      orphanReturnCount: totals.orphanReturnCount,
      latencyMs: Date.now() - startedAt,
    });

    return result;
  }

  private resolvePeriod(period?: string): string {
    if (period && /^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return period;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private parsePeriod(period: string): { year: number; month: number } {
    const [y, m] = period.split('-').map((s) => parseInt(s, 10));
    return { year: y, month: m };
  }
}
