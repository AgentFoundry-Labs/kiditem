import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * What advertising cost and returned over one window, and on which days.
 *
 * Two ledgers answer about advertising and they answer different questions.
 * `channel_account_daily_kpi_snapshots` carries the account's own evidence
 * word — whether an advertising account exists at all, and whether the owner
 * published anything — and `channel_listing_daily_snapshots` carries the
 * facts, one row per listing per day. Consumers need both: the account says
 * *how to read* the window, the listing ledger says *what is in it*.
 *
 * `per-listing-profit` has read them that way since ADR-0003. The dashboard's
 * ad panel did not: it asked the account ledger for the numbers as well, and
 * that ledger is a per-day account summary the browser only writes when the
 * ad-centre scrape runs. On this database that is 13 rows for July against
 * 38,068 listing-days holding the same month's 431,238원, so the panel read
 * `0/31일` over a fully covered month.
 *
 * This is the read, in one place, so the next consumer cannot pick the wrong
 * half of it.
 */

/**
 * The ad evidence a `ChannelListingDailySnapshot` row must carry before its
 * `adSpend` counts as a measurement. `adSpend` is `Int @default(0)`, so an
 * uncollected row is otherwise indistinguishable from a confirmed-zero one —
 * which is the difference between "no advertising ran" and "nobody looked".
 *
 * Identical to Advertising's `master-product-ad-spend-read` filter (ADR-0003).
 * This is its single definition; `per-listing-profit` imports it from here.
 */
export function measuredAdCoverageWhere(
  organizationId: string,
  from: Date,
  to: Date,
): Prisma.ChannelListingDailySnapshotWhereInput {
  return {
    organizationId,
    businessDate: { gte: from, lt: to },
    adCoverageStatus: { in: ['OBSERVED', 'CONFIRMED_ZERO'] },
    adObservedAt: { not: null },
  };
}

/** One business date the ad source reported, with that day's totals. */
export type AdWindowDay = Readonly<{
  businessDate: string;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  orders: number;
}>;

export type AdWindowFacts = Readonly<{
  /**
   * The business dates the ad source reported, ascending. This list *is* the
   * coverage: a date absent from it was never collected, which is why callers
   * must not fill the gap with a zero.
   */
  days: readonly AdWindowDay[];
  /** The latest moment any of those days was observed. */
  observedAt: Date | null;
}>;

type AdReadable = Pick<PrismaClient, 'channelListingDailySnapshot'>;

/**
 * Ad facts for `[from, to)`, one entry per business date the source reported.
 *
 * Summing across listings is what makes this an account-level answer: the
 * caller asked what advertising cost, not what it cost per listing. Nothing is
 * emitted for a date the source never reported, so the length of `days` is the
 * window's covered-day count and a caller never has to distinguish a zero row
 * from an absent one.
 */
export async function readAdWindowFacts(
  prisma: AdReadable,
  input: { organizationId: string; from: Date; to: Date },
): Promise<AdWindowFacts> {
  const rows = await prisma.channelListingDailySnapshot.groupBy({
    by: ['businessDate'],
    where: measuredAdCoverageWhere(input.organizationId, input.from, input.to),
    _sum: {
      adSpend: true,
      adRevenue: true,
      adImpressions: true,
      adClicks: true,
      adConversions: true,
      adOrders: true,
    },
    _max: { adObservedAt: true },
    orderBy: { businessDate: 'asc' },
  });

  let observedAt: Date | null = null;
  const days = rows.map((row) => {
    const seen = row._max.adObservedAt;
    if (seen && (!observedAt || seen > observedAt)) observedAt = seen;
    return {
      businessDate: row.businessDate.toISOString().slice(0, 10),
      spend: row._sum.adSpend ?? 0,
      revenue: row._sum.adRevenue ?? 0,
      impressions: row._sum.adImpressions ?? 0,
      clicks: row._sum.adClicks ?? 0,
      conversions: row._sum.adConversions ?? 0,
      orders: row._sum.adOrders ?? 0,
    } satisfies AdWindowDay;
  });

  return { days, observedAt };
}
