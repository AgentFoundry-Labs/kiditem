import type { PrismaService } from '../prisma/prisma.service';
import { resolvePricing } from './option-pricing-resolver';

/**
 * Plan F1 T1 (extracted from `finance/services/profit-loss.service.ts:findAll`).
 *
 * Per-listing profit aggregation shared by:
 *   - finance/profit-loss (PLData rows, plus returnCount + extra metadata)
 *   - dashboard/dashboard-inventory (warnings.minusProducts / lowProfitProducts / highAdProducts)
 *
 * Pure function (no @Injectable). Follows ADR-0016 live aggregation:
 *   - I3 canonical: revenue = SUM(OrderLineItem.totalPrice)
 *   - I7 multi-tenant: every Prisma call scoped by companyId
 *   - I8 half-open: orderedAt: { gte: from, lt: to }
 *   - R-1 shipping: order-level Order.shippingPrice, revenue-weighted distribution
 *   - ADR-0018 compliance: all 2 queries pass companyId; no $queryRaw used
 *
 * Excludes returnCount (D.3b will add) — the OrderReturnLineItem fetch stays
 * in profit-loss.service.findAll because PLData.returnCount is finance-specific.
 *
 * Excluded order statuses: ['cancelled', 'returned', 'refunded'] — same as
 * profit-loss.service and profit-calculator.ts.
 */
export interface PerListingMetrics {
  listingId: string;
  externalId: string;
  channelName: string | null;
  channel: string;
  masterId: string;
  masterCode: string;
  masterName: string;
  category: string | null;
  grade: string | null;
  thumbnailUrl: string | null;
  revenue: number;
  costOfGoods: number;
  commission: number;
  shippingCost: number;
  adCost: number;
  otherCost: number;
  netProfit: number;
  profitRate: number;
  orderCount: number;
}

const EXCLUDED_ORDER_STATUSES = ['cancelled', 'returned', 'refunded'] as const;

export async function buildPerListingMetrics(
  prisma: PrismaService,
  companyId: string,
  from: Date,
  to: Date,
): Promise<PerListingMetrics[]> {
  const [orders, adRows] = await Promise.all([
    prisma.order.findMany({
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
              select: {
                listing: {
                  select: {
                    id: true,
                    externalId: true,
                    channel: true,
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
    prisma.ad.groupBy({
      by: ['listingId'],
      _sum: { spend: true },
      where: { companyId, date: { gte: from, lt: to } },
    }),
  ]);

  type Agg = {
    listingId: string;
    externalId: string;
    channelName: string | null;
    channel: string;
    masterId: string;
    masterCode: string;
    masterName: string;
    category: string | null;
    grade: string | null;
    thumbnailUrl: string | null;
    revenue: number;
    costOfGoods: number;
    commission: number;
    shippingCost: number;
    otherCost: number;
    orderIds: Set<string>;
  };
  const groups = new Map<string, Agg>();

  for (const o of orders) {
    const orderTotalRevenue = o.lineItems.reduce((s, li) => s + (li.totalPrice || 0), 0);

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
          channel: listing.channel,
          masterId: listing.master.id,
          masterCode: listing.master.legacyCode ?? listing.master.code,
          masterName: listing.master.name,
          category: listing.master.category ?? null,
          grade: listing.master.abcGrade ?? null,
          thumbnailUrl: listing.master.thumbnailUrl ?? null,
          revenue: 0,
          costOfGoods: 0,
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
      g.costOfGoods += resolved.costPrice * li.quantity;
      g.commission += lineRevenue * resolved.commissionRate;
      g.otherCost += resolved.otherCost * li.quantity;

      // R-1 revenue-weighted shipping distribution (zero-revenue order → drop ship per ADR-0016)
      if (orderTotalRevenue > 0 && o.shippingPrice) {
        g.shippingCost += Math.round(o.shippingPrice * (lineRevenue / orderTotalRevenue));
      }
    }
  }

  const adCostMap = new Map<string, number>(
    adRows.map((r) => [r.listingId, r._sum.spend ?? 0]),
  );

  return Array.from(groups.values()).map((g) => {
    const adCost = adCostMap.get(g.listingId) ?? 0;
    const costOfGoods = Math.round(g.costOfGoods);
    const commission = Math.round(g.commission);
    const otherCost = Math.round(g.otherCost);
    const netProfit = g.revenue - costOfGoods - commission - g.shippingCost - adCost - otherCost;
    const profitRate = g.revenue > 0 ? Math.round((netProfit / g.revenue) * 1000) / 10 : 0;
    return {
      listingId: g.listingId,
      externalId: g.externalId,
      channelName: g.channelName,
      channel: g.channel,
      masterId: g.masterId,
      masterCode: g.masterCode,
      masterName: g.masterName,
      category: g.category,
      grade: g.grade,
      thumbnailUrl: g.thumbnailUrl,
      revenue: g.revenue,
      costOfGoods,
      commission,
      shippingCost: g.shippingCost,
      adCost,
      otherCost,
      netProfit,
      profitRate,
      orderCount: g.orderIds.size,
    } satisfies PerListingMetrics;
  });
}
