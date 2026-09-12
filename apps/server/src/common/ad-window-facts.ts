import { Prisma, type PrismaClient } from '@prisma/client';
import {
  AD_METRIC_SUMS_SQL,
  IS_CAMPAIGN_GRAIN_SQL,
  IS_PRODUCT_GRAIN_SQL,
} from '../advertising/adapter/out/repository/ad-target-grain.sql';

/**
 * The one reader of listing-day advertising values.
 *
 * The ledger is `channel_ad_target_daily_snapshots`: what the Coupang campaign
 * sweep publishes, one row per advertised target per business date. A day
 * with no advertising has no row, so rows alone cannot say which days were
 * looked at. The sweep declares that in the coverage columns written by its
 * terminal transaction, and every business date inside that window is
 * **measured** — with the rows' sums, or a measured zero when there are none.
 * Rows published before the source-owner cutover carry no run and no declared
 * window. They remain preserved as raw history, but cannot prove that the
 * account-day was complete; KID-36 owns their later reconstruction. A date
 * outside a proven completed declaration was never measured, and nothing here
 * fills it with a zero (ADR-0006): the length of `days` *is* the covered-day
 * count.
 *
 * Two more rules travel with every read, written once here:
 *
 * - **Which row is current.** A target-day may exist in several sweep
 *   generations. The newest *completed* sweep whose declared window covers
 *   the date is the answer for every target on it: its rows win, and a
 *   target an older sweep reported that it no longer does has stopped, not
 *   survived. A running or failed attempt is not evidence.
 * - **Which rows to sum.** A product-grain row (one advertised option/listing)
 *   is what a listing's day is made of. A campaign rollup already contains its
 *   members, so at account level a day is the sum of its rollups when the
 *   sweep published any, else the sum of its product rows; the two are never
 *   added together. Keyword-grain rows describe a trailing window, not a day,
 *   and are never summed here.
 *
 * `channel_listing_daily_snapshots` still carries ad columns from the
 * pre-cutover writer. They are a rollup of this ledger, nobody writes them any
 * more, and no reader may touch them; their removal is a schema cutover.
 */

type AdReadable = Pick<PrismaClient, '$queryRaw'>;

/**
 * Whether advertising applies to the organization at all: false when it has
 * no active Coupang channel account, so there is nothing to collect and
 * advertising is a satisfied input at zero. The one place this fact is read for ad
 * evidence, so "not applied" is decided the same way by every consumer.
 */
export async function advertisingApplies(
  prisma: Pick<PrismaClient, 'channelAccount'>,
  organizationId: string,
): Promise<boolean> {
  const account = await prisma.channelAccount.findFirst({
    where: { organizationId, channel: 'coupang', status: 'active' },
    select: { id: true },
  });
  return account !== null;
}

const DAY_MS = 86_400_000;

function dateText(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * The organization's active Coupang accounts. A date is an organization-level
 * measurement only when every applicable account declared it complete.
 */
const ACTIVE_AD_ACCOUNTS_CTE = (organizationId: string) => Prisma.sql`
    SELECT id
    FROM channel_accounts
    WHERE organization_id = ${organizationId}::uuid
      AND channel = 'coupang'
      AND status = 'active'
`;

/**
 * Completed campaign sweeps for applicable accounts, whose terminal coverage
 * columns are the declaration. Inlined at every `$queryRaw` site so the
 * organization binding is visible where the query is issued, which is what
 * the tenancy scanner checks.
 */
const SWEEPS_CTE = (organizationId: string) => Prisma.sql`
    SELECT id, channel_account_id, freshness_generation,
      coverage_start_date AS window_start,
      coverage_end_date AS window_end
    FROM source_import_runs
    WHERE organization_id = ${organizationId}::uuid
      AND status = 'completed'
      AND source_type = 'coupang_ad_campaign'
      AND parser_version = 'ad-campaign-v1'
      AND plan ->> 'captureMode' = 'campaign_sweep'
      AND channel_account_id IS NOT NULL
      AND channel_account_id IN (SELECT id FROM active_accounts)
      AND coverage_start_date IS NOT NULL
      AND coverage_end_date IS NOT NULL
`;

/**
 * The business dates of `[from, to)` the ad source measured: every date inside
 * a completed sweep's declared window. The source owner writes that validated
 * declaration to the run's coverage columns in its terminal transaction.
 */
function coveredDates(from?: Date, to?: Date) {
  return Prisma.sql`
    SELECT d::date AS business_date
    FROM sweeps
    CROSS JOIN LATERAL generate_series(window_start, window_end, interval '1 day') AS d
    WHERE TRUE
      ${from ? Prisma.sql`AND d >= ${dateText(from)}::date` : Prisma.empty}
      ${to ? Prisma.sql`AND d < ${dateText(to)}::date` : Prisma.empty}
    GROUP BY d::date
    HAVING COUNT(DISTINCT channel_account_id) = (SELECT COUNT(*) FROM active_accounts)
  `;
}

/**
 * The measured target rows of `[from, to)` — one per (account, target, day),
 * from the newest completed campaign sweep whose declaration covers it.
 */
function measuredTargetRows(organizationId: string, from?: Date, to?: Date) {
  return Prisma.sql`
    SELECT DISTINCT ON (
      t.channel_account_id, t.business_date, t.target_type, t.target_key, COALESCE(t.ad_group_id, '')
    )
      t.channel_account_id,
      t.business_date,
      t.listing_id,
      t.campaign_identity,
      t.target_type,
      t.spend, t.revenue, t.impressions, t.clicks, t.conversions, t.orders,
      t.last_observed_at,
      t.external_option_id, t.listing_option_id, t.meta_json
    FROM channel_ad_target_daily_snapshots t
    LEFT JOIN sweeps r ON r.id = t.source_import_run_id
    WHERE t.organization_id = ${organizationId}::uuid
      ${from ? Prisma.sql`AND t.business_date >= ${dateText(from)}::date` : Prisma.empty}
      ${to ? Prisma.sql`AND t.business_date < ${dateText(to)}::date` : Prisma.empty}
      AND r.id IS NOT NULL
      AND r.channel_account_id = t.channel_account_id
      AND t.business_date BETWEEN r.window_start AND r.window_end
      -- A newer completed sweep that declared it swept this date is the
      -- current answer for every target on it; an older row it no longer
      -- reports is not spend that survived, it is spend that stopped.
      AND NOT EXISTS (
        SELECT 1 FROM sweeps newer
        WHERE newer.channel_account_id = t.channel_account_id
          AND newer.window_start <= t.business_date AND newer.window_end >= t.business_date
          AND newer.freshness_generation > COALESCE(r.freshness_generation, -1)
      )
    ORDER BY
      t.channel_account_id, t.business_date, t.target_type, t.target_key, COALESCE(t.ad_group_id, ''),
      r.freshness_generation DESC NULLS LAST, t.last_observed_at DESC, t.id DESC
  `;
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

type DayRow = {
  business_date: Date;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  orders: number;
  observed_at: Date | null;
};

/**
 * Ad facts for `[from, to)`, one entry per business date the source measured.
 * A measured date without rows is a zero day: the sweep looked and found no
 * advertising.
 *
 * Summing each account's selected grain is what makes this an
 * organization-level answer: the caller asked what advertising cost, not what
 * it cost per listing.
 */
export async function readAdWindowFacts(
  prisma: AdReadable,
  input: { organizationId: string; from?: Date; to?: Date },
): Promise<AdWindowFacts> {
  const rows = await prisma.$queryRaw<DayRow[]>(Prisma.sql`
    WITH active_accounts AS (${ACTIVE_AD_ACCOUNTS_CTE(input.organizationId)}), -- organization_id bound above
    sweeps AS (${SWEEPS_CTE(input.organizationId)}), -- organization_id bound above
    measured AS (${measuredTargetRows(input.organizationId, input.from, input.to)}),
    covered AS (${coveredDates(input.from, input.to)}),
    -- One campaign may appear under several target keys for one account-day
    -- (one per identity scheme the scraper has used); they describe the same
    -- Coupang row, so keep the best-evidenced one. Another account may reuse
    -- the provider identity and remains a separate fact.
    campaign_daily AS (
      SELECT DISTINCT ON (channel_account_id, campaign_identity, business_date) *
      FROM measured
      WHERE target_type <> 'keyword' AND campaign_identity IS NOT NULL AND ${IS_CAMPAIGN_GRAIN_SQL}
      ORDER BY channel_account_id, campaign_identity, business_date,
        (spend + revenue + impressions + clicks + conversions + orders) DESC, last_observed_at DESC
    ),
    campaign_days AS (
      SELECT channel_account_id, business_date,
        ${AD_METRIC_SUMS_SQL},
        MAX(last_observed_at) AS observed_at
      FROM campaign_daily GROUP BY channel_account_id, business_date
    ),
    product_days AS (
      SELECT channel_account_id, business_date,
        ${AD_METRIC_SUMS_SQL},
        MAX(last_observed_at) AS observed_at
      FROM measured
      WHERE target_type <> 'keyword' AND ${IS_PRODUCT_GRAIN_SQL}
      GROUP BY channel_account_id, business_date
    ),
    account_days AS (
      SELECT
        a.id AS channel_account_id,
        d.business_date,
        COALESCE(c.spend, p.spend, 0) AS spend,
        COALESCE(c.revenue, p.revenue, 0) AS revenue,
        COALESCE(c.impressions, p.impressions, 0) AS impressions,
        COALESCE(c.clicks, p.clicks, 0) AS clicks,
        COALESCE(c.conversions, p.conversions, 0) AS conversions,
        COALESCE(c.orders, p.orders, 0) AS orders,
        GREATEST(c.observed_at, p.observed_at) AS observed_at
      FROM covered d
      CROSS JOIN active_accounts a
      LEFT JOIN campaign_days c
        ON c.channel_account_id = a.id AND c.business_date = d.business_date
      LEFT JOIN product_days p
        ON p.channel_account_id = a.id AND p.business_date = d.business_date
    )
    SELECT
      business_date,
      ${AD_METRIC_SUMS_SQL},
      MAX(observed_at) AS observed_at
    FROM account_days
    GROUP BY business_date
    ORDER BY 1 ASC
  `);

  let observedAt: Date | null = null;
  const days = rows.map((row) => {
    if (row.observed_at && (!observedAt || row.observed_at > observedAt)) observedAt = row.observed_at;
    return {
      businessDate: dateText(row.business_date),
      spend: row.spend,
      revenue: row.revenue,
      impressions: row.impressions,
      clicks: row.clicks,
      conversions: row.conversions,
      orders: row.orders,
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

type ListingRow = {
  listing_id: string;
  days: number;
  first_date: Date;
  last_date: Date;
  observed_at: Date;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  orders: number;
};

/**
 * Ad facts per listing for `[from, to)`; either bound may be open. Coverage is
 * account-level — the sweep looked at every listing on every measured date —
 * so a listing absent here spent nothing on the measured dates, and `days` is
 * the window's measured-day count, the same for every listing. A caller that
 * needs to know whether the window was measured at all reads
 * `readAdWindowFacts(...).days`.
 */
export async function readListingAdWindowFacts(
  prisma: AdReadable,
  input: { organizationId: string; from?: Date; to?: Date },
): Promise<readonly AdListingWindowFacts[]> {
  const rows = await prisma.$queryRaw<ListingRow[]>(Prisma.sql`
    WITH active_accounts AS (${ACTIVE_AD_ACCOUNTS_CTE(input.organizationId)}), -- organization_id bound above
    sweeps AS (${SWEEPS_CTE(input.organizationId)}), -- organization_id bound above
    measured AS (${measuredTargetRows(input.organizationId, input.from, input.to)}),
    covered AS (${coveredDates(input.from, input.to)})
    SELECT
      listing_id,
      (SELECT COUNT(*) FROM covered)::int AS days,
      MIN(business_date) AS first_date,
      MAX(business_date) AS last_date,
      MAX(last_observed_at) AS observed_at,
      ${AD_METRIC_SUMS_SQL}
    FROM measured
    INNER JOIN covered USING (business_date)
    WHERE listing_id IS NOT NULL AND target_type <> 'keyword' AND ${IS_PRODUCT_GRAIN_SQL}
    GROUP BY listing_id
  `);
  return rows.map((row) => ({
    listingId: row.listing_id,
    days: row.days,
    firstDate: dateText(row.first_date),
    lastDate: dateText(row.last_date),
    observedAt: row.observed_at,
    spend: row.spend,
    revenue: row.revenue,
    impressions: row.impressions,
    clicks: row.clicks,
    conversions: row.conversions,
    orders: row.orders,
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

type ListingDayRow = {
  listing_id: string;
  business_date: Date;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
};

/** Measured listing-day ad rows for `[from, to)`, ascending by date. */
export async function readListingDayAdFacts(
  prisma: AdReadable,
  input: { organizationId: string; from: Date; to: Date },
): Promise<readonly AdListingDayFacts[]> {
  const rows = await prisma.$queryRaw<ListingDayRow[]>(Prisma.sql`
    WITH active_accounts AS (${ACTIVE_AD_ACCOUNTS_CTE(input.organizationId)}), -- organization_id bound above
    sweeps AS (${SWEEPS_CTE(input.organizationId)}), -- organization_id bound above
    measured AS (${measuredTargetRows(input.organizationId, input.from, input.to)}),
    covered AS (${coveredDates(input.from, input.to)})
    SELECT
      listing_id, business_date,
      ${AD_METRIC_SUMS_SQL}
    FROM measured
    INNER JOIN covered USING (business_date)
    WHERE listing_id IS NOT NULL AND target_type <> 'keyword' AND ${IS_PRODUCT_GRAIN_SQL}
    GROUP BY listing_id, business_date
    ORDER BY business_date ASC, listing_id ASC
  `);
  return rows.map((row) => ({
    listingId: row.listing_id,
    businessDate: row.business_date,
    spend: row.spend,
    revenue: row.revenue,
    impressions: row.impressions,
    clicks: row.clicks,
    conversions: row.conversions,
  }));
}

/** The newest business date the ad source reported for the organization. */
export async function readLatestAdDate(
  prisma: AdReadable,
  organizationId: string,
): Promise<Date | null> {
  const rows = await prisma.$queryRaw<{ business_date: Date | null }[]>(Prisma.sql`
    WITH active_accounts AS (${ACTIVE_AD_ACCOUNTS_CTE(organizationId)}), -- organization_id bound above
    sweeps AS (${SWEEPS_CTE(organizationId)}), -- organization_id bound above
    covered AS (${coveredDates()})
    SELECT MAX(business_date) AS business_date FROM covered
  `);
  return rows[0]?.business_date ?? null;
}

/** The exclusive end of a `[from, to)` window whose last business date is `date`. */
export function dayAfter(date: Date): Date {
  return new Date(date.getTime() + DAY_MS);
}
