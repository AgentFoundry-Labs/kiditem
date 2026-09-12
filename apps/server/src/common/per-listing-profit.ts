import type { AdAccountDailyKpiPublishedEvidence } from '@kiditem/shared/advertising';
import type { PrismaService } from '../prisma/prisma.service';
import { kstBusinessDate } from './kst';
import { measuredAdCoverageWhere } from './ad-window-facts';

/**
 * Plan F1 T1 (extracted from `finance/services/profit-loss.service.ts:findAll`).
 *
 * Per-listing profit aggregation shared by:
 *   - finance/profit-loss (PLData rows, plus returnCount + extra metadata)
 *   - dashboard/dashboard-inventory (warnings.minusProducts / lowProfitProducts / highAdProducts)
 *
 * ADR-0003: the ad read is coverage-aware. `ChannelListingDailySnapshot.adSpend`
 * is `Int @default(0)`, so summing it unfiltered makes an uncollected day and a
 * genuinely zero-spend day identical. This module filters on the evidence
 * columns through `ad-window-facts`, and yields an unavailable profit rather
 * than a partial sum. Top-N contribution ranking is
 * exempt and keeps its own unfiltered 30% approximation.
 *
 * The listing-level calendar alone cannot say whether an organization runs no
 * ads or whether ad collection failed for the whole window: both leave the
 * calendar empty. That fact is account-level and Advertising already publishes
 * it, so callers read `AccountAdEvidence` from Advertising's in-port and pass
 * it in. This module stays a pure helper — it consumes the owner's word (and
 * the dates that word was reached over), and never derives a second one of its
 * own.
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


const DAY_MS = 86_400_000;

function businessDateText(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * The account-level ad publication, as Advertising's
 * `AdAccountDailyKpiReadPort` already answers it. Declared structurally so
 * this helper depends on the shared evidence vocabulary rather than on the
 * Advertising module: the caller owns the injected port, this module only
 * knows how to phrase the question.
 */
export interface AccountAdEvidenceReader {
  readPublished(input: {
    organizationId: string;
    from?: string;
    to?: string;
  }): Promise<{
    evidence: AdAccountDailyKpiPublishedEvidence;
    rows: readonly { businessDate: string }[];
  }>;
}

/**
 * The account-level answer for one window: the owner's evidence word, and
 * whether that word was reached over the whole window or only part of it.
 *
 * The evidence word describes the rows the owner returned and says nothing
 * about which dates those rows covered — `AdAccountDailyKpiPublishedEvidence`
 * documents that explicitly. `coversWindow` supplies the missing half, so a
 * consumer can tell "no spend on every date you asked about" from "no spend
 * on the three dates I happen to have".
 */
export interface AccountAdEvidence {
  evidence: AdAccountDailyKpiPublishedEvidence;
  /**
   * Whether the owner published a row for **every** business date in the
   * window. Derived here, from the business dates the owner's own rows carry,
   * so no consumer has to re-derive the window's calendar.
   */
  coversWindow: boolean;
}

/**
 * Asks the advertising owner how to read this window, in the owner's terms.
 *
 * `readPublished` takes inclusive business-date texts while the profit window
 * is the half-open `[from, to)` used everywhere else, so the last date the ad
 * reads here can see is the day before `kstBusinessDate(to)`. Every caller
 * translates the window through this function so that two consumers of the
 * same window ask the owner the same question instead of inventing bounds of
 * their own.
 *
 * A window containing no business date asks the owner nothing, so it proves
 * nothing: that is `MISSING`, never an advertising cost of zero.
 */
export async function readAccountAdEvidence(
  reader: AccountAdEvidenceReader,
  organizationId: string,
  from: Date,
  to: Date,
): Promise<AccountAdEvidence> {
  const businessDateFrom = kstBusinessDate(from);
  const lastBusinessDate = new Date(kstBusinessDate(to).getTime() - DAY_MS);
  if (lastBusinessDate.getTime() < businessDateFrom.getTime()) {
    return { evidence: 'MISSING', coversWindow: false };
  }
  const published = await reader.readPublished({
    organizationId,
    from: businessDateText(businessDateFrom),
    to: businessDateText(lastBusinessDate),
  });
  // `kstBusinessDate` yields UTC midnight, so the window's business dates are
  // exactly this stride. Walk them against the dates the owner published: one
  // absent date is enough to make the answer partial.
  const publishedDates = new Set(published.rows.map((row) => row.businessDate));
  let coversWindow = true;
  for (
    let day = businessDateFrom.getTime();
    day <= lastBusinessDate.getTime();
    day += DAY_MS
  ) {
    if (!publishedDates.has(businessDateText(new Date(day)))) {
      coversWindow = false;
      break;
    }
  }
  return { evidence: published.evidence, coversWindow };
}

/** Narrows to the listings whose ad coverage was complete. */
export function hasMeasuredProfit(
  row: PerListingProfit,
): row is PerListingMetrics {
  return row.adCost !== null && row.netProfit !== null && row.profitRate !== null;
}

/**
 * @param accountAdEvidence how Advertising says this window's account-level
 *   publication should be read — obtain it with `readAccountAdEvidence` for
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
   * The account answers first, because it is the only place that separates an
   * organization that runs no ads from one whose ad collection failed:
   *
   * - `NOT_APPLIED` — no advertising account exists, so no collection can
   *   exist either. Advertising is a satisfied input at zero for every
   *   listing.
   * - `MISSING` — an account exists and published no complete row for this
   *   window. No listing has a measured ad cost, so every profit here is
   *   unavailable. Absent evidence is never a cost of zero.
   * - `CONFIRMED_ZERO` **over the whole window** — the account published an
   *   explicit zero for every business date asked about, which is positive
   *   proof that no campaign ran. An empty per-listing calendar is then the
   *   expected shape rather than absent evidence: an empty ad report writes no
   *   listing rows at all (`flushListingAdMetrics` iterates the report's own
   *   rows, and nothing synthesises an all-zero *listing* row the way the
   *   account collector synthesises an all-zero *account* row). Falling
   *   through to the calendar would blank the profit of every organization
   *   that simply ran no ads.
   *
   *   Full date coverage is what upgrades the word to a measurement, and it
   *   cannot be skipped: the owner decides `CONFIRMED_ZERO` over whatever rows
   *   fall in the range, so zero rows on 3 of 30 requested days earns the same
   *   word. Only "zero on every date in the window" rules out spend on a date
   *   nobody looked at; partial coverage leaves the rest of the window
   *   unproven and falls through to the calendar below, which is where an
   *   unproven window belongs.
   * - `OBSERVED`, or `CONFIRMED_ZERO` over part of the window — the source did
   *   publish, so the per-listing calendar below decides. An **empty** calendar
   *   is then missing evidence rather than proof of no spend: under `OBSERVED`
   *   the account saw spend that no listing recorded, which is a contradiction
   *   rather than a zero. It used to satisfy `coveredDays === collectedDayCount`
   *   as `0 === 0` and publish a measured zero for a window the listing-level
   *   source never covered.
   *
   * Within a non-empty calendar, a listing the daily-fact source never touched
   * has a **not-applied** ad cost — the source ran and never reported it, so
   * zero is a satisfied input rather than a missing one.
   *
   * Once the source has touched a listing, its ad evidence must cover every
   * date on the window's ad-collection calendar. A listing short of that is
   * **missing** those dates, whether the rows are absent or present without ad
   * provenance. A present-but-unmarked row is the case an unfiltered
   * `SUM(adSpend)` silently reads as a measured zero.
   */
  const resolveAdCost = (listingId: string): number | null => {
    if (accountAdEvidence.evidence === 'NOT_APPLIED') return 0;
    if (accountAdEvidence.evidence === 'MISSING') return null;
    if (accountAdEvidence.evidence === 'CONFIRMED_ZERO' && accountAdEvidence.coversWindow) {
      return 0;
    }
    if (collectedDayCount === 0) return null;
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
