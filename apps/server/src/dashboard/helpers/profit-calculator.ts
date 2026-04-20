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
 * Note (shippingCost over-count — Plan D deferred): currently accumulates
 * `resolved.shippingCost` **per-lineItem**. For an order with N lineItems this
 * over-counts shipping by up to Nx when shipping is really order-level. Plan D
 * (§4.6 spec note) will reintroduce order-level shipping once the canonical
 * field exists on `Order`.
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
              shippingCost: true,
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
    for (const li of o.lineItems) {
      revenue += li.totalPrice || 0; // I3: lineItem-level canonical
      const p = li.option;
      if (!p) continue; // option nullable — no pricing resolve possible
      const resolved = resolvePricing({ option: p }); // v2 nested-only (C-08)
      costOfGoods += resolved.costPrice * li.quantity;
      commission += (li.totalPrice || 0) * resolved.commissionRate;
      shippingCost += resolved.shippingCost; // per-lineItem (Plan D defer note above)
      otherCost += resolved.otherCost * li.quantity;
    }
  }

  // 광고비: 현재 기간이면 AdSnapshot → 일할계산, 폴백은 Ad 테이블
  const now = new Date();
  const isCurrentPeriod = from <= now && to > now;

  let adCost = 0;
  let adImpressions = 0;
  let adClicks = 0;
  let adConversions = 0;
  let adRevenue = 0;

  if (isCurrentPeriod) {
    const latestCapturedAt = await prisma.adSnapshot.aggregate({
      where: { source: 'advertising', pageType: 'campaign' },
      _max: { capturedAt: true },
    });

    if (latestCapturedAt._max.capturedAt) {
      const snapshots = await prisma.adSnapshot.findMany({
        where: {
          source: 'advertising',
          pageType: 'campaign',
          capturedAt: latestCapturedAt._max.capturedAt,
        },
        select: { spend: true, impressions: true, clicks: true, conversions: true, revenue: true },
      });

      const monthlyAdCost = snapshots.reduce((s, r) => s + (r.spend || 0), 0);
      const totalImp = snapshots.reduce((s, r) => s + (r.impressions || 0), 0);
      const totalClk = snapshots.reduce((s, r) => s + (r.clicks || 0), 0);
      const totalConv = snapshots.reduce((s, r) => s + (r.conversions || 0), 0);
      const totalRev = snapshots.reduce((s, r) => s + (r.revenue || 0), 0);

      if (monthlyAdCost > 0) {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const daysElapsed = Math.max(1, Math.ceil((now.getTime() - monthStart.getTime()) / 86400000));
        const rangeEnd = to > now ? now : to;
        const daysInRange = Math.max(1, Math.ceil((rangeEnd.getTime() - from.getTime()) / 86400000));

        if (daysInRange >= daysElapsed) {
          adCost = monthlyAdCost;
          adImpressions = totalImp;
          adClicks = totalClk;
          adConversions = totalConv;
          adRevenue = totalRev;
        } else {
          const ratio = daysInRange / daysElapsed;
          adCost = Math.round(monthlyAdCost * ratio);
          adImpressions = Math.round(totalImp * ratio);
          adClicks = Math.round(totalClk * ratio);
          adConversions = Math.round(totalConv * ratio);
          adRevenue = Math.round(totalRev * ratio);
        }
      }
    }
  }

  // 폴백: Ad 테이블
  if (adCost === 0) {
    const adAgg = await prisma.ad.aggregate({
      where: { date: { gte: from, lt: to } },
      _sum: { spend: true, impressions: true, clicks: true, conversions: true, revenue: true },
    });
    adCost = adAgg._sum.spend || 0;
    adImpressions = adAgg._sum.impressions || 0;
    adClicks = adAgg._sum.clicks || 0;
    adConversions = adAgg._sum.conversions || 0;
    adRevenue = adAgg._sum.revenue || 0;
  }

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
