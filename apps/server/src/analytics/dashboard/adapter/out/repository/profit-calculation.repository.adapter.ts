// Period profit aggregation — v2 I3 canonical on `OrderLineItem.totalPrice`
// (not `Order.totalPrice`). The Plan A.5 schema removed `Order.product` and
// `Order.quantity`; revenue/costs sum per line item.
//
// Invariants applied:
//   - I3: revenue = SUM(OrderLineItem.totalPrice) (lineItem-level canonical)
//   - I7: organizationId filter (multi-tenant isolation)
//   - I8: half-open range `orderedAt >= from && orderedAt < to` (never `lte`)
//   - C-08: v2 nested-only resolver — `resolvePricing({ option })`
//   - R-1 (Plan D.1 T4): shipping accumulates from `Order.shippingPrice`
//     once per order (outer loop), not per line item.
//
// Ad metrics aggregate from `ChannelListingDailySnapshot` additive columns
// (`adSpend / adRevenue / adImpressions / adClicks / adConversions`). Daily
// facts are the single source-of-truth; ratios recompute via the shared
// percent helpers.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { resolvePricing } from '../../../../../common/option-pricing-resolver';
import type {
  ProfitCalculationRepositoryPort,
  RangeProfitMetrics,
} from '../../../application/port/out/profit-calculation.repository.port';

@Injectable()
export class ProfitCalculationRepositoryAdapter
  implements ProfitCalculationRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async calculateForRange(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<RangeProfitMetrics> {
    const orders = await this.prisma.order.findMany({
      where: {
        organizationId,
        orderedAt: { gte: from, lt: to },
        status: { notIn: ['cancelled', 'returned', 'refunded'] },
      },
      select: {
        shippingPrice: true,
        lineItems: {
          select: {
            quantity: true,
            totalPrice: true,
            option: {
              select: {
                costPrice: true,
                commissionRate: true,
                otherCost: true,
              },
            },
          },
        },
      },
    });

    let revenue = 0;
    let costOfGoods = 0;
    let commission = 0;
    let shippingCost = 0;
    let otherCost = 0;
    const orderCount = orders.length;

    for (const o of orders) {
      shippingCost += o.shippingPrice || 0;
      for (const li of o.lineItems) {
        revenue += li.totalPrice || 0;
        const p = li.option;
        if (!p) continue;
        const resolved = resolvePricing({ option: p });
        costOfGoods += resolved.costPrice * li.quantity;
        commission += (li.totalPrice || 0) * resolved.commissionRate;
        otherCost += resolved.otherCost * li.quantity;
      }
    }

    const adAgg = await this.prisma.channelListingDailySnapshot.aggregate({
      where: {
        organizationId,
        businessDate: { gte: from, lt: to },
      },
      _sum: {
        adSpend: true,
        adRevenue: true,
        adImpressions: true,
        adClicks: true,
        adConversions: true,
      },
    });

    const adCost = adAgg._sum.adSpend ?? 0;
    const adRevenue = adAgg._sum.adRevenue ?? 0;
    const adImpressions = adAgg._sum.adImpressions ?? 0;
    const adClicks = adAgg._sum.adClicks ?? 0;
    const adConversions = adAgg._sum.adConversions ?? 0;

    const netProfit =
      revenue - costOfGoods - commission - shippingCost - adCost - otherCost;
    const profitRate =
      revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : 0;

    return {
      revenue: Math.round(revenue),
      costOfGoods: Math.round(costOfGoods),
      commission: Math.round(commission),
      shippingCost: Math.round(shippingCost),
      adCost: Math.round(adCost),
      otherCost: Math.round(otherCost),
      netProfit: Math.round(netProfit),
      profitRate,
      orderCount,
      adImpressions,
      adClicks,
      adConversions,
      adRevenue: Math.round(adRevenue),
    } satisfies RangeProfitMetrics;
  }
}
