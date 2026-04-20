import { Injectable, Logger } from '@nestjs/common';
import type { PLData } from '@kiditem/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { kstMonthStart } from '../../common/kst';
import { resolvePricing } from '../../common/option-pricing-resolver';

/**
 * Plan D.1 T5 (v2) — ADR-0016 live aggregation.
 *
 * Replaces the legacy `prisma.profitLoss.findMany` read-path with direct aggregation.
 * `ProfitLoss` 테이블은 writer 부재로 비어 있음. Plan E 에서 writer 검토.
 *
 * Data flow:
 *   Order (+ shippingPrice) → OrderLineItem → ChannelListingOption.listing → MasterProduct
 *   + OrderReturnLineItem (returnCount)
 *   + Ad (adCost, canonical daily spend per listing)
 *
 * Patterns (B2c.orders 재사용):
 * - I3: SUM(OrderLineItem.totalPrice) per listing
 * - I8: orderedAt: { gte, lt } half-open
 * - I7: companyId from @CurrentCompany() caller
 * - kstMonthStart wrap (month+1 자동 처리)
 * - resolvePricing({ option }) nested-only
 *
 * Shipping: Order.shippingPrice 를 listing 간 revenue-weighted 분배 (ADR-0016).
 */
@Injectable()
export class ProfitLossService {
  private readonly logger = new Logger(ProfitLossService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    companyId: string,
    year: number,
    month: number,
  ): Promise<PLData[]> {
    const startedAt = Date.now();
    const from = kstMonthStart(year, month);
    const to = kstMonthStart(year, month + 1);

    const [orders, returnRows, adRows] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          companyId,
          orderedAt: { gte: from, lt: to },
          status: { notIn: ['cancelled', 'returned', 'refunded'] },
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
                select: {
                  listing: {
                    select: {
                      id: true,
                      externalId: true,
                      channelName: true,
                      master: {
                        select: {
                          id: true,
                          code: true,
                          legacyCode: true,
                          name: true,
                          category: true,
                          abcGrade: true,
                          thumbnailUrl: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.orderReturnLineItem.findMany({
        where: {
          companyId,
          return: { requestedAt: { gte: from, lt: to } },
        },
        select: {
          orderLineItem: {
            select: { listingOption: { select: { listingId: true } } },
          },
        },
      }),
      this.prisma.ad.groupBy({
        by: ['listingId'],
        _sum: { spend: true },
        where: {
          companyId,
          date: { gte: from, lt: to },
        },
      }),
    ]);

    type Agg = {
      listingId: string;
      externalId: string;
      channelName: string | null;
      masterId: string;
      masterCode: string;
      masterName: string;
      category: string | null;
      grade: string | null;
      thumbnailUrl: string | null;
      revenue: number;
      cogs: number;
      commission: number;
      shippingCost: number;
      otherCost: number;
      orderIds: Set<string>;
    };
    const groups = new Map<string, Agg>();

    for (const o of orders) {
      const orderTotalRevenue = o.lineItems.reduce((sum, li) => sum + (li.totalPrice || 0), 0);

      for (const li of o.lineItems) {
        const listing = li.listingOption?.listing;
        if (!listing) continue;
        const key = listing.id;

        let g = groups.get(key);
        if (!g) {
          g = {
            listingId: listing.id,
            externalId: listing.externalId,
            channelName: listing.channelName ?? null,
            masterId: listing.master.id,
            masterCode: listing.master.legacyCode ?? listing.master.code,
            masterName: listing.master.name,
            category: listing.master.category ?? null,
            grade: listing.master.abcGrade ?? null,
            thumbnailUrl: listing.master.thumbnailUrl ?? null,
            revenue: 0,
            cogs: 0,
            commission: 0,
            shippingCost: 0,
            otherCost: 0,
            orderIds: new Set<string>(),
          };
          groups.set(key, g);
        }

        g.orderIds.add(o.id);

        const resolved = resolvePricing({ option: li.option ?? {} });
        const lineRevenue = li.totalPrice || 0;
        g.revenue += lineRevenue;
        g.cogs += resolved.costPrice * li.quantity;
        g.commission += lineRevenue * resolved.commissionRate;
        g.otherCost += resolved.otherCost * li.quantity;

        if (orderTotalRevenue > 0 && o.shippingPrice) {
          g.shippingCost += Math.round(o.shippingPrice * (lineRevenue / orderTotalRevenue));
        }
      }
    }

    const returnMap = new Map<string, number>();
    for (const rli of returnRows) {
      const listingId = rli.orderLineItem?.listingOption?.listingId;
      if (!listingId) continue;
      returnMap.set(listingId, (returnMap.get(listingId) ?? 0) + 1);
    }

    const adCostMap = new Map<string, number>(
      adRows.map((r) => [r.listingId, r._sum.spend ?? 0]),
    );

    const rows = Array.from(groups.values()).map((g) => {
      const returnCount = returnMap.get(g.listingId) ?? 0;
      const adCost = adCostMap.get(g.listingId) ?? 0;
      const commission = Math.round(g.commission);
      const cogs = Math.round(g.cogs);
      const otherCost = Math.round(g.otherCost);
      const netProfit = g.revenue - cogs - commission - g.shippingCost - adCost - otherCost;
      const profitRate = g.revenue > 0 ? Math.round((netProfit / g.revenue) * 1000) / 10 : 0;
      return {
        listingId: g.listingId,
        externalId: g.externalId,
        channelName: g.channelName,
        masterId: g.masterId,
        masterCode: g.masterCode,
        masterName: g.masterName,
        category: g.category,
        grade: g.grade,
        thumbnailUrl: g.thumbnailUrl,
        revenue: g.revenue,
        cogs,
        commission,
        shippingCost: g.shippingCost,
        adCost,
        otherCost,
        netProfit,
        profitRate,
        orderCount: g.orderIds.size,
        returnCount,
      } satisfies PLData;
    }).sort((a, b) => b.revenue - a.revenue);

    this.logger.log({
      msg: 'profit-loss.findAll',
      companyId,
      year,
      month,
      orderCount: orders.length,
      listingCount: rows.length,
      latencyMs: Date.now() - startedAt,
    });

    return rows;
  }
}
