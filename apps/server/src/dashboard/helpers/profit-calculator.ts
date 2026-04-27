import type { PrismaService } from '../../prisma/prisma.service';
import { resolvePricing } from '../../common/option-pricing-resolver';

export interface RangeProfitMetrics {
  revenue: number;
  costOfGoods: number;
  commission: number;
  shippingCost: number;
  adCost: number;
  otherCost: number;
  netProfit: number;
  profitRate: number;
  orderCount: number;
  adRevenue: number;
  adImpressions: number;
  adClicks: number;
  adConversions: number;
}

/**
 * Period profit — v2 I3 Canonical aggregation on `OrderLineItem.totalPrice`
 * (not `Order.totalPrice`). The Plan A.5 schema removed `Order.product` and
 * `Order.quantity`; revenue / costs must now be summed per-lineItem.
 *
 * v2 invariants applied:
 *  - I3: revenue = SUM(OrderLineItem.totalPrice) (lineItem-level canonical)
 *  - I7: companyId filter (ADR-0006 multi-tenant isolation)
 *  - I8: half-open range `orderedAt >= from && orderedAt < to` (never `lte`)
 *  - C-08: v2 nested-only resolver — `resolvePricing({ option })`
 *
 * R-1 (Plan D.1 T4): shipping is order-level, not lineItem-level.
 * `Order.shippingPrice` is accumulated once per order (outer loop).
 * `option.shippingCost` is intentionally excluded from the select clause and
 * the inner-loop accumulation. `ProductOption.shippingCost` is kept in schema
 * for legacy compat but must NOT be used in revenue/cost aggregation.
 *
 * Hard rewrite Phase H3b — ad metrics now aggregate from
 * `ChannelListingDailySnapshot` (additive ad columns: adSpend / adRevenue /
 * adImpressions / adClicks / adConversions). The dual-source legacy chain
 * (`AdSnapshot.aggregate` then `Ad.aggregate` fallback) is gone — daily facts
 * are the single source-of-truth.
 *
 * Proration: the legacy code pro-rated against elapsed-vs-total days because
 * `AdSnapshot` rollups represented month-to-date totals; a 7-day window over
 * a current month had to scale that MTD down. Daily facts are per-day rows,
 * so a `businessDate >= from && < to` aggregate already covers exactly the
 * requested days. No proration is applied — daily-fact-as-source-of-truth
 * removes the need for derived per-period scaling.
 */
export async function calculateProfitForRange(
  prisma: PrismaService,
  companyId: string,
  from: Date,
  to: Date,
): Promise<RangeProfitMetrics> {
  const orders = await prisma.order.findMany({
    where: {
      companyId, // v2 I7 — ADR-0006 IDOR scope (previously absent)
      orderedAt: { gte: from, lt: to }, // v2 I8 half-open
      status: { notIn: ['cancelled', 'returned', 'refunded'] },
    },
    select: {
      shippingPrice: true, // R-1 (Plan D.1 T4): order-level shipping source
      lineItems: {
        select: {
          quantity: true,
          totalPrice: true,
          option: {
            select: {
              // costCny lives on MasterProduct (not ProductOption) — skip here.
              // option-pricing-resolver treats missing costCny as nullish and
              // falls back to option.costPrice which is the canonical KRW cost.
              costPrice: true,
              commissionRate: true,
              // shippingCost: removed — Plan D.1 R-1 moves shipping to order level
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
    shippingCost += o.shippingPrice || 0; // R-1 (Plan D.1 T4): once per order
    for (const li of o.lineItems) {
      revenue += li.totalPrice || 0; // I3: lineItem-level canonical
      const p = li.option;
      if (!p) continue; // option nullable — no pricing resolve possible
      const resolved = resolvePricing({ option: p }); // v2 nested-only (C-08)
      costOfGoods += resolved.costPrice * li.quantity;
      commission += (li.totalPrice || 0) * resolved.commissionRate;
      // shippingCost removed from inner loop — R-1 moves to outer (order-level)
      otherCost += resolved.otherCost * li.quantity;
    }
  }

  // 광고비: ChannelListingDailySnapshot 기간 합계.
  // Daily-fact-as-source-of-truth — 기간 view 는 SUM(additive metrics).
  // 비율(ROAS/CTR/CVR) 은 호출자가 ratio-recompute 헬퍼로 별도 산출.
  const adAgg = await prisma.channelListingDailySnapshot.aggregate({
    where: {
      companyId,
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

  const netProfit = revenue - costOfGoods - commission - shippingCost - adCost - otherCost;
  const profitRate = revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : 0;

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
