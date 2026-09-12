import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * The one reader of listing-day advertising values.
 *
 * `channel_listing_daily_snapshots` carries the facts, one row per listing per
 * day, and its ad columns are `Int @default(0)`: an uncollected day and a
 * genuinely zero-spend day are the same number. What tells them apart is
 * `adObservedAt` — a day the ad source reported carries the moment it was
 * observed, and a day it never reported carries nothing. That timestamp is the
 * only evidence a listing-day ad value needs, and every read in this module is
 * gated on it (ADR-0003).
 *
 * This module exists so the gate is written once. A consumer that wants an ad
 * value over a window asks here — per day, per listing, or per listing-day —
 * and can never reach the raw sum without the gate. The dashboard's ad panel
 * once read the account ledger for numbers that only this ledger holds (13
 * rows against 38,068 listing-days for one July); `per-listing-profit`,
 * Advertising's strategy and benchmark reads, Finance's sales analysis and
 * Products' operations list each carried their own copy of the sum, four of
 * them without the gate. This is the read, in one place.
 *
 * Which dates the account's advertising owner published, and whether an
 * account exists at all, is a different question with a different ledger; see
 * `readAccountAdEvidence` in `per-listing-profit`.
 */

type AdReadable = Pick<PrismaClient, 'channelListingDailySnapshot'>;

/** Rows carrying a measured ad value inside `[from, to)`; either bound may be open. */
export function measuredAdWhere(
  organizationId: string,
  from?: Date,
  to?: Date,
): Prisma.ChannelListingDailySnapshotWhereInput {
  return {
    organizationId,
    ...(from || to
      ? { businessDate: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
      : {}),
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
  input: { organizationId: string; from?: Date; to?: Date },
): Promise<AdWindowFacts> {
  const rows = await prisma.channelListingDailySnapshot.groupBy({
    by: ['businessDate'],
    where: measuredAdWhere(input.organizationId, input.from, input.to),
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

/** One listing's measured ad totals over a window, and the days behind them. */
export type AdListingWindowFacts = Readonly<{
  listingId: string;
  /** Business dates the source reported for this listing inside the window. */
  days: number;
  firstDate: string;
  lastDate: string;
  /** The latest moment any of those days was observed. */
  observedAt: Date;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  orders: number;
}>;

/**
 * Ad facts per listing for `[from, to)`; either bound may be open. A listing
 * the source never reported inside the window is absent, not zero. `days` is
 * the listing's own covered-day count, which a caller compares against the
 * window's calendar (`readAdWindowFacts(...).days`) to tell a complete listing
 * from one with a hole.
 */
export async function readListingAdWindowFacts(
  prisma: AdReadable,
  input: { organizationId: string; from?: Date; to?: Date },
): Promise<readonly AdListingWindowFacts[]> {
  const rows = await prisma.channelListingDailySnapshot.groupBy({
    by: ['listingId'],
    where: measuredAdWhere(input.organizationId, input.from, input.to),
    _count: true,
    _min: { businessDate: true },
    _max: { businessDate: true, adObservedAt: true },
    _sum: {
      adSpend: true,
      adRevenue: true,
      adImpressions: true,
      adClicks: true,
      adConversions: true,
      adOrders: true,
    },
  });
  return rows.map((row) => ({
    listingId: row.listingId,
    days: row._count,
    firstDate: row._min.businessDate!.toISOString().slice(0, 10),
    lastDate: row._max.businessDate!.toISOString().slice(0, 10),
    observedAt: row._max.adObservedAt!,
    spend: row._sum.adSpend ?? 0,
    revenue: row._sum.adRevenue ?? 0,
    impressions: row._sum.adImpressions ?? 0,
    clicks: row._sum.adClicks ?? 0,
    conversions: row._sum.adConversions ?? 0,
    orders: row._sum.adOrders ?? 0,
  }));
}

/** One listing on one business date the ad source reported. */
export type AdListingDayFacts = Readonly<{
  listingId: string;
  businessDate: Date;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
}>;

/** Measured listing-day ad rows for `[from, to)`, ascending by date. */
export async function readListingDayAdFacts(
  prisma: AdReadable,
  input: { organizationId: string; from: Date; to: Date },
): Promise<readonly AdListingDayFacts[]> {
  const rows = await prisma.channelListingDailySnapshot.findMany({
    where: measuredAdWhere(input.organizationId, input.from, input.to),
    select: {
      listingId: true,
      businessDate: true,
      adSpend: true,
      adRevenue: true,
      adImpressions: true,
      adClicks: true,
      adConversions: true,
    },
    orderBy: { businessDate: 'asc' },
  });
  return rows.map((row) => ({
    listingId: row.listingId,
    businessDate: row.businessDate,
    spend: row.adSpend,
    revenue: row.adRevenue,
    impressions: row.adImpressions,
    clicks: row.adClicks,
    conversions: row.adConversions,
  }));
}

/** The newest business date the ad source reported for the organization. */
export async function readLatestAdDate(
  prisma: AdReadable,
  organizationId: string,
): Promise<Date | null> {
  const row = await prisma.channelListingDailySnapshot.findFirst({
    where: measuredAdWhere(organizationId),
    orderBy: { businessDate: 'desc' },
    select: { businessDate: true },
  });
  return row?.businessDate ?? null;
}
