import type { PrismaService } from '../prisma/prisma.service';
import { kstBusinessDate } from './kst';

/**
 * Plan F1 T1 (extracted from `finance/services/profit-loss.service.ts:findAll`).
 *
 * Per-listing profit aggregation shared by:
 *   - finance/profit-loss (PLData rows, plus returnCount + extra metadata)
 *   - dashboard/dashboard-inventory (warnings.minusProducts / lowProfitProducts / highAdProducts)
 *
 * ADR-0003: the ad read is coverage-aware. `ChannelListingDailySnapshot.adSpend`
 * is `Int @default(0)`, so summing it unfiltered makes an uncollected day and a
 * genuinely zero-spend day identical. This module filters on the same evidence
 * columns Advertising's `master-product-ad-spend-read` uses, and yields an
 * unavailable profit rather than a partial sum. Top-N contribution ranking is
 * exempt and keeps its own unfiltered 30% approximation.
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
/**
 * One listing's settled profit over a window.
 *
 * `adCost`, `netProfit` and `profitRate` are **unavailable** (`null`) when the
 * listing's ad coverage is incomplete for the window — see ADR-0003. A partial
 * ad sum is not a smaller ad cost, and a profit computed from one is not a
 * smaller profit; it is a fabricated number.
 */
export interface PerListingProfit {
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
  adCost: number | null;
  otherCost: number;
  netProfit: number | null;
  profitRate: number | null;
  orderCount: number;
}

/** A `PerListingProfit` whose ad coverage was complete, so its profit is measured. */
export interface PerListingMetrics extends PerListingProfit {
  adCost: number;
  netProfit: number;
  profitRate: number;
}

const EXCLUDED_ORDER_STATUSES = ['cancelled', 'returned', 'refunded'] as const;

/**
 * The ad evidence a `ChannelListingDailySnapshot` row must carry before its
 * `adSpend` counts as a measurement. Identical to Advertising's
 * `master-product-ad-spend-read` filter (ADR-0003): `adSpend` is
 * `Int @default(0)`, so an uncollected row is otherwise indistinguishable from
 * a confirmed-zero one.
 */
function measuredAdCoverageWhere(organizationId: string, from: Date, to: Date) {
  return {
    organizationId,
    businessDate: { gte: from, lt: to },
    adCoverageStatus: { in: ['OBSERVED', 'CONFIRMED_ZERO'] },
    adObservedAt: { not: null },
  };
}

/** Narrows to the listings whose ad coverage was complete. */
export function hasMeasuredProfit(
  row: PerListingProfit,
): row is PerListingMetrics {
  return row.adCost !== null && row.netProfit !== null && row.profitRate !== null;
}

export async function buildPerListingProfit(
  prisma: PrismaService,
  organizationId: string,
  from: Date,
  to: Date,
): Promise<PerListingProfit[]> {
  const businessDateFrom = kstBusinessDate(from);
  const businessDateTo = kstBusinessDate(to);
  const [orders, adByListing, collectedDates, observedListings] = await Promise.all([
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
                inventoryComponents: {
                  select: {
                    quantity: true,
                    sellpiaInventorySku: {
                      select: { purchasePrice: true },
                    },
                  },
                },
                listing: {
                  select: {
                    id: true,
                    externalId: true,
                    channelName: true,
                    displayName: true,
                    category: true,
                    masterProduct: {
                      select: {
                        id: true,
                        code: true,
                        name: true,
                        category: true,
                        abcGrade: true,
                      },
                    },
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
    // Listing-level ad spend over the same `[from, to)` window, counting only
    // rows that carry ad evidence. `(organizationId, listingId, businessDate)`
    // is unique, so the group's row count is this listing's covered day count.
    prisma.channelListingDailySnapshot.groupBy({
      by: ['listingId'],
      _sum: { adSpend: true },
      _count: true,
      where: measuredAdCoverageWhere(organizationId, businessDateFrom, businessDateTo),
    }),
    // The window's ad-collection calendar: the business dates on which the ad
    // source reported anything at all. A listing the source did report, but
    // that is absent on one of these dates, has a hole in its evidence.
    prisma.channelListingDailySnapshot.groupBy({
      by: ['businessDate'],
      where: measuredAdCoverageWhere(organizationId, businessDateFrom, businessDateTo),
    }),
    // Listings the daily-fact source touched at all in the window, with or
    // without ad provenance. A listing present here but absent from the
    // coverage-filtered read was reported without its ad metrics — that is
    // missing evidence, not an absent source.
    prisma.channelListingDailySnapshot.groupBy({
      by: ['listingId'],
      where: {
        organizationId,
        businessDate: { gte: businessDateFrom, lt: businessDateTo },
      },
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
          masterId: listing.masterProduct?.id ?? listing.id,
          masterCode: listing.masterProduct?.code ?? listing.externalId,
          masterName: listing.masterProduct?.name
            ?? listing.displayName
            ?? listing.channelName
            ?? listing.externalId,
          category: listing.masterProduct?.category ?? listing.category,
          grade: listing.masterProduct?.abcGrade ?? null,
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
      const componentCost = option.inventoryComponents.reduce(
        (sum, component) => sum
          + (component.sellpiaInventorySku.purchasePrice ?? 0)
            * component.quantity,
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

  const collectedDayCount = collectedDates.length;
  const adEvidenceByListing = new Map(
    adByListing.map((r) => [
      r.listingId,
      { spend: r._sum?.adSpend ?? 0, coveredDays: r._count },
    ]),
  );

  const observedListingIds = new Set(observedListings.map((r) => r.listingId));

  /**
   * A listing the daily-fact source never touched in this window has a
   * **not-applied** ad cost — nothing was ever asked about it, so zero is a
   * satisfied input rather than a missing one.
   *
   * Once the source has touched a listing, its ad evidence must cover every
   * date on the window's ad-collection calendar. A listing short of that is
   * **missing** those dates, whether the rows are absent or present without ad
   * provenance. A present-but-unmarked row is the case an unfiltered
   * `SUM(adSpend)` silently reads as a measured zero.
   */
  const resolveAdCost = (listingId: string): number | null => {
    if (!observedListingIds.has(listingId)) return 0;
    const evidence = adEvidenceByListing.get(listingId);
    const coveredDays = evidence?.coveredDays ?? 0;
    return coveredDays === collectedDayCount ? evidence?.spend ?? 0 : null;
  };

  return Array.from(groups.values()).map((g) => {
    const adCost = resolveAdCost(g.listingId);
    const costOfGoods = Math.round(g.costOfGoods);
    const commission = Math.round(g.commission);
    const otherCost = Math.round(g.otherCost);
    const netProfit = adCost === null
      ? null
      : g.revenue - costOfGoods - commission - g.shippingCost - adCost - otherCost;
    const profitRate = netProfit === null
      ? null
      : g.revenue > 0 ? Math.round((netProfit / g.revenue) * 1000) / 10 : 0;
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
    } satisfies PerListingProfit;
  });
}

/**
 * The measured per-listing rows, and how much of the window's population they
 * left out. A caller that publishes a calculation basis needs both: the count
 * it can compute, and the fact that it counted a subset.
 */
export interface PerListingMetricsCoverage {
  /** Listings whose ad coverage was complete, so their profit is measured. */
  metrics: PerListingMetrics[];
  /** Listings withheld because their ad coverage was incomplete. */
  withheldListings: number;
}

/**
 * Per-listing rows whose profit is measured, with the withheld population.
 *
 * A listing with incomplete ad coverage is **withheld** rather than published
 * with a partial sum — the same rule ABC applies when advertising evidence is
 * not ready. Withholding shrinks the population a rollup counts, so the size
 * of what was withheld is evidence about the rollup and travels with it;
 * `withheldListings > 0` with an empty `metrics` is an empty computable
 * subset, not a counted zero.
 *
 * Use `buildPerListingProfit` wherever a reader sees one listing's own profit
 * and can be shown that it is unavailable.
 */
export async function buildPerListingMetricsCoverage(
  prisma: PrismaService,
  organizationId: string,
  from: Date,
  to: Date,
): Promise<PerListingMetricsCoverage> {
  const rows = await buildPerListingProfit(prisma, organizationId, from, to);
  const metrics = rows.filter(hasMeasuredProfit);
  return { metrics, withheldListings: rows.length - metrics.length };
}

/**
 * The measured projection alone, for callers that publish no calculation
 * basis and so have nowhere to say a listing was withheld.
 */
export async function buildPerListingMetrics(
  prisma: PrismaService,
  organizationId: string,
  from: Date,
  to: Date,
): Promise<PerListingMetrics[]> {
  const coverage = await buildPerListingMetricsCoverage(prisma, organizationId, from, to);
  return coverage.metrics;
}
