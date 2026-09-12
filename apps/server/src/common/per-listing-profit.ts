import type { PrismaService } from '../prisma/prisma.service';
import { kstBusinessDate } from './kst';
import { advertisingApplies, readAdWindowFacts, readListingAdWindowFacts } from './ad-window-facts';
import type { PrismaClient } from '@prisma/client';

/**
 * Plan F1 T1 (extracted from `finance/services/profit-loss.service.ts:findAll`).
 *
 * Per-listing profit aggregation shared by:
 *   - finance/profit-loss (PLData rows, plus returnCount + extra metadata)
 *   - dashboard/dashboard-inventory (warnings.minusProducts / lowProfitProducts / highAdProducts)
 *
 * ADR-0006: the ad read is coverage-aware. Listing-day ad values come from the
 * advertising target-day ledger through `ad-window-facts`, where a day the
 * sweep never reported is absent rather than zero, so this module yields an
 * unavailable profit rather than a partial sum.
 *
 * The listing rows alone cannot say whether an organization runs no ads or
 * whether ad collection failed for the whole window: both leave them empty.
 * That fact is account-level: whether a Coupang account exists at all, and
 * which dates the sweep measured. Callers pass it in as `AccountAdEvidence`,
 * read with `readAdEvidenceFromLedger`. This module stays a pure helper — it
 * consumes those facts and never derives a word of its own.
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
 * listing's ad coverage is incomplete for the window — see ADR-0006. A partial
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


const DAY_MS = 86_400_000;

function businessDateText(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * The account-level answer for one window, as the ledger states it: whether
 * advertising applies at all, how many business dates the sweep measured, what
 * it spent across them, and whether those dates cover the whole window. "No
 * spend on every date you asked about" is a measured zero; "no spend on the
 * three dates I happen to have" is not, and only `coversWindow` tells them
 * apart.
 */
export interface AccountAdEvidence {
  /** False when the organization has no Coupang channel account, so advertising does not apply. */
  hasAdAccount: boolean;
  /** Business dates the sweep measured inside the window. */
  publishedDates: number;
  /** Ad spend summed over those measured dates. */
  accountSpend: number;
  /** Whether the sweep measured **every** business date in the window. */
  coversWindow: boolean;
}

/**
 * The window answer, read from the advertising ledger: whether advertising
 * applies (no Coupang account, nothing to collect), how many business dates
 * of the window the campaign sweep measured, what it spent across them, and
 * whether every date in the window was measured.
 */
export async function readAdEvidenceFromLedger(
  prisma: Pick<PrismaClient, '$queryRaw' | 'channelAccount'>,
  organizationId: string,
  from: Date,
  to: Date,
): Promise<AccountAdEvidence> {
  const businessDateFrom = kstBusinessDate(from);
  const businessDateTo = kstBusinessDate(to);
  const windowDays = Math.max(0, Math.round((businessDateTo.getTime() - businessDateFrom.getTime()) / DAY_MS));
  const [applies, facts] = await Promise.all([
    advertisingApplies(prisma, organizationId),
    windowDays === 0
      ? Promise.resolve({ days: [] as const, observedAt: null })
      : readAdWindowFacts(prisma, { organizationId, from: businessDateFrom, to: businessDateTo }),
  ]);
  return {
    hasAdAccount: applies,
    publishedDates: facts.days.length,
    accountSpend: facts.days.reduce((sum, day) => sum + day.spend, 0),
    coversWindow: windowDays > 0 && facts.days.length === windowDays,
  };
}

/** Narrows to the listings whose ad coverage was complete. */
export function hasMeasuredProfit(
  row: PerListingProfit,
): row is PerListingMetrics {
  return row.adCost !== null && row.netProfit !== null && row.profitRate !== null;
}

/**
 * @param accountAdEvidence how Advertising says this window's account-level
 *   coverage should be read — obtain it with `readAdEvidenceFromLedger` for
 *   the same `[from, to)` window — which is also what carries the date
 *   coverage the owner's evidence word deliberately leaves out. It is required
 *   because its absence is what made "this organization runs no ads" and "ad
 *   collection failed for the whole window" the same computed zero.
 */
export async function buildPerListingProfit(
  prisma: PrismaService,
  organizationId: string,
  from: Date,
  to: Date,
  accountAdEvidence: AccountAdEvidence,
): Promise<PerListingProfit[]> {
  const businessDateFrom = kstBusinessDate(from);
  const businessDateTo = kstBusinessDate(to);
  const [orders, adByListing] = await Promise.all([
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
    // Listing-level measured ad spend over the same `[from, to)` window, from
    // the ledger's product-grain rows. Coverage is account-level, so a
    // listing absent here spent nothing on the measured dates.
    readListingAdWindowFacts(prisma, { organizationId, from: businessDateFrom, to: businessDateTo }),
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

  const adSpendByListing = new Map(adByListing.map((r) => [r.listingId, r.spend]));

  /**
   * The account answers first, because it is the only place that separates an
   * organization that runs no ads from one whose ad collection failed:
   *
   * - No advertising account — no collection can exist either. Advertising
   *   is a satisfied input at zero for every listing.
   * - A window the sweep measured no date of. No listing has a measured ad
   *   cost, so every profit here is unavailable. Absent evidence is never a
   *   cost of zero.
   * - A window the sweep measured only part of. A sum over 3 of 30 requested
   *   days proves nothing about the other 27, so profit stays unavailable.
   * - A fully measured window. Coverage is account-level — the sweep looked
   *   at every listing on every measured date — so each listing's cost is the
   *   sum of its rows, and a listing with no row at all spent nothing.
   */
  const resolveAdCost = (listingId: string): number | null => {
    if (!accountAdEvidence.hasAdAccount) return 0;
    if (accountAdEvidence.publishedDates === 0) return null;
    if (!accountAdEvidence.coversWindow) return null;
    return adSpendByListing.get(listingId) ?? 0;
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
 *
 * An account-level `MISSING` withholds every listing, so a caller that
 * publishes a calculation basis reports an empty computable subset instead of
 * a counted zero.
 */
export async function buildPerListingMetricsCoverage(
  prisma: PrismaService,
  organizationId: string,
  from: Date,
  to: Date,
  accountAdEvidence: AccountAdEvidence,
): Promise<PerListingMetricsCoverage> {
  const rows = await buildPerListingProfit(
    prisma,
    organizationId,
    from,
    to,
    accountAdEvidence,
  );
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
  accountAdEvidence: AccountAdEvidence,
): Promise<PerListingMetrics[]> {
  const coverage = await buildPerListingMetricsCoverage(
    prisma,
    organizationId,
    from,
    to,
    accountAdEvidence,
  );
  return coverage.metrics;
}
