import type { PrismaService } from '../prisma/prisma.service';

/**
 * Plan F1 T1 (extracted from `finance/services/profit-loss.service.ts:findAll`).
 *
 * Per-listing profit aggregation shared by:
 *   - finance/profit-loss (PLData rows, plus returnCount + extra metadata)
 *   - dashboard/dashboard-inventory (warnings.minusProducts / lowProfitProducts / highAdProducts)
 *
 * Pure function (no @Injectable). Uses live aggregation:
 *   - I3 canonical: revenue = SUM(OrderLineItem.totalPrice)
 *   - I7 multi-tenant: every Prisma call scoped by organizationId
 *   - I8 half-open: orderedAt: { gte: from, lt: to }
 *   - R-1 shipping: order-level Order.shippingPrice, revenue-weighted distribution
 *   - Tenant-scope compliance: both queries pass organizationId; no $queryRaw used
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
  organizationId: string,
  from: Date,
  to: Date,
): Promise<PerListingMetrics[]> {
  const [orders, adRows] = await Promise.all([
    prisma.order.findMany({
      where: {
        organizationId,
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
            listingOption: {
              select: {
                costPriceOverride: true,
                commissionRate: true,
                shippingCost: true,
                otherCost: true,
                components: {
                  select: {
                    quantity: true,
                    masterProduct: { select: { purchasePrice: true } },
                  },
                },
                listing: {
                  select: {
                    id: true,
                    externalId: true,
                    channelName: true,
                    displayName: true,
                    category: true,
                    abcGrade: true,
                    channelAccount: { select: { channel: true } },
                    thumbnails: {
                      where: { status: 'active' },
                      orderBy: { updatedAt: 'desc' },
                      take: 1,
                      select: { imageUrl: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    // Listing-level ad spend aggregates from
    // `ChannelListingDailySnapshot.adSpend` over the same `[from, to)` window.
    // Caller signature is unchanged; the result columns (`adCost` per listing)
    // remain populated by the map below.
    prisma.channelListingDailySnapshot.groupBy({
      by: ['listingId'],
      _sum: { adSpend: true },
      where: { organizationId, businessDate: { gte: from, lt: to } },
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
      if (!listing || !li.listingOption) continue;
      const key = listing.id;

      let g = groups.get(key);
      if (!g) {
        g = {
          listingId: listing.id,
          externalId: listing.externalId,
          channelName: listing.channelName ?? null,
          channel: listing.channelAccount.channel,
          masterId: listing.id,
          masterCode: listing.externalId,
          masterName: listing.displayName ?? listing.channelName ?? listing.externalId,
          category: listing.category,
          grade: listing.abcGrade,
          thumbnailUrl: listing.thumbnails[0]?.imageUrl ?? null,
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

      const option = li.listingOption;
      const componentCost = option.components.reduce(
        (sum, component) => sum + (component.masterProduct.purchasePrice ?? 0) * component.quantity,
        0,
      );
      const costPrice = option.costPriceOverride ?? componentCost;
      const commissionRate = Number(option.commissionRate ?? 0);
      const lineRevenue = li.totalPrice || 0;
      g.revenue += lineRevenue;
      g.costOfGoods += costPrice * li.quantity;
      g.commission += lineRevenue * commissionRate;
      g.otherCost += (option.otherCost ?? 0) * li.quantity;
      // Revenue-weighted shipping distribution (zero-revenue order → drop ship)
      if (orderTotalRevenue > 0 && o.shippingPrice) {
        g.shippingCost += Math.round(o.shippingPrice * (lineRevenue / orderTotalRevenue));
      }
    }
  }

  const adCostMap = new Map<string, number>(
    adRows.map((r) => [r.listingId, r._sum.adSpend ?? 0]),
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
