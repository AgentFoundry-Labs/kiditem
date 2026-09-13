import { addDays, businessDateKey } from '../../common/kst';
import { compareAttemptsNewestFirst, isNewerAttempt } from '../../common/current-row';
import {
  Prisma,
  type ChannelAdTargetDailySnapshot,
  type SourceImportRun,
} from '@prisma/client';
import { currentRowTieBreakSql } from '../../common/current-row';
import {
  AD_METRIC_SUMS_SQL,
  CONVERSIONS_OBSERVED_SQL,
  IS_CAMPAIGN_GRAIN_SQL,
  IS_PRODUCT_GRAIN_SQL,
} from '../adapter/out/repository/ad-target-grain.sql';
import { mergeKeywordTargets } from '../application/service/ad-keyword-normalizer';
import type { UpsertAdTargetDailyInput } from '../application/port/out/repository/channel-target-daily.repository.port';

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

/** The channel whose accounts the Coupang campaign sweep publishes target-day advertising for. */
export const AD_SWEEP_CHANNEL = 'coupang';
const AD_SWEEP_ACCOUNT_STATUS = 'active';

/**
 * Whether the campaign sweep covers a channel account: an active Coupang
 * account. No target-day row can exist for a listing sold on any other
 * account. The one statement of the rule `advertisingApplies` and the ledger's
 * active-account filter apply.
 */
export function adSweepCoversChannelAccount(
  account: Readonly<{ channel: string; status: string }>,
): boolean {
  return account.channel === AD_SWEEP_CHANNEL && account.status === AD_SWEEP_ACCOUNT_STATUS;
}

/**
 * Whether advertising is an input to one sale key's profit — a listing, or a
 * channel grouping of listings. Measured spend for the key always applies,
 * whatever account the sold lines sit on; otherwise advertising applies when
 * the organization advertises and the key sells on an account the sweep
 * covers. Where it does not apply, advertising is Not applied (0), never an
 * unmeasured cost.
 */
export function advertisingAppliesToSale(
  input: Readonly<{
    organizationAdvertises: boolean;
    sweepCoversAccount: boolean;
    hasMeasuredSpend: boolean;
  }>,
): boolean {
  return input.hasMeasuredSpend || (input.organizationAdvertises && input.sweepCoversAccount);
}

/**
 * Whether advertising applies to the organization at all: false when it has
 * no active Coupang channel account, so there is nothing to collect and
 * advertising is a satisfied input at zero. The one place this fact is read for ad
 * evidence, so "not applied" is decided the same way by every consumer.
 */
export async function advertisingApplies(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<boolean> {
  const account = await tx.channelAccount.findFirst({
    where: { organizationId, channel: AD_SWEEP_CHANNEL, status: AD_SWEEP_ACCOUNT_STATUS },
    select: { id: true },
  });
  return account !== null;
}


/**
 * The organization's active Coupang accounts. A date is an organization-level
 * measurement only when every applicable account declared it complete.
 */
const ACTIVE_AD_ACCOUNTS_CTE = (organizationId: string) => Prisma.sql`
    SELECT id
    FROM channel_accounts
    WHERE organization_id = ${organizationId}::uuid
      AND channel = ${AD_SWEEP_CHANNEL}
      AND status = ${AD_SWEEP_ACCOUNT_STATUS}
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
      ${from ? Prisma.sql`AND d >= ${businessDateKey(from)}::date` : Prisma.empty}
      ${to ? Prisma.sql`AND d < ${businessDateKey(to)}::date` : Prisma.empty}
    GROUP BY d::date
    HAVING COUNT(DISTINCT channel_account_id) = (SELECT COUNT(*) FROM active_accounts)
  `;
}

/**
 * The measured target rows of `[from, to)` — one per (account, target, day),
 * from the newest completed campaign sweep whose declaration covers it. With
 * `currentGenerationOnly`, only rows of each account's newest completed sweep
 * are kept: the current target set, not every target the account ever ran.
 */
function measuredTargetRows(
  organizationId: string,
  from?: Date,
  to?: Date,
  options: { currentGenerationOnly?: boolean } = {},
) {
  return Prisma.sql`
    SELECT DISTINCT ON (
      t.channel_account_id, t.business_date, t.target_type, t.target_key, COALESCE(t.ad_group_id, '')
    )
      t.id,
      t.channel_account_id,
      t.business_date,
      t.listing_id,
      t.listing_option_id,
      t.external_id,
      t.external_option_id,
      t.campaign_identity,
      t.campaign_id,
      t.campaign_name,
      t.target_type,
      t.target_key,
      t.keyword,
      t.status,
      t.on_off,
      t.current_bid,
      t.daily_budget,
      t.spend, t.revenue, t.impressions, t.clicks, t.conversions, t.orders,
      ${CONVERSIONS_OBSERVED_SQL} AS conversions_observed,
      t.last_observed_at,
      t.updated_at,
      t.meta_json
    FROM channel_ad_target_daily_snapshots t
    LEFT JOIN sweeps r ON r.id = t.source_import_run_id
    WHERE t.organization_id = ${organizationId}::uuid
      ${from ? Prisma.sql`AND t.business_date >= ${businessDateKey(from)}::date` : Prisma.empty}
      ${to ? Prisma.sql`AND t.business_date < ${businessDateKey(to)}::date` : Prisma.empty}
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
      ${options.currentGenerationOnly
        ? Prisma.sql`AND r.id = (
            SELECT latest.id FROM sweeps latest
            WHERE latest.channel_account_id = t.channel_account_id
            ORDER BY latest.freshness_generation DESC NULLS LAST, latest.id DESC
            LIMIT 1
          )`
        : Prisma.empty}
    ORDER BY
      t.channel_account_id, t.business_date, t.target_type, t.target_key, COALESCE(t.ad_group_id, ''),
      r.freshness_generation DESC NULLS LAST, t.last_observed_at DESC, t.id DESC
  `;
}

/**
 * One campaign's row per account-day: the provider's campaign rollup when the
 * sweep published one (several identity schemes may describe the same row, so
 * the best-evidenced one is kept), else the sum of the campaign's product rows.
 * Both are never added together. Selects from the `measured` CTE.
 */
const CAMPAIGN_DAILY_CTES = Prisma.sql`
    campaign_daily AS (
      SELECT DISTINCT ON (channel_account_id, campaign_identity, business_date) *
      FROM measured
      WHERE target_type <> 'keyword' AND campaign_identity IS NOT NULL AND ${IS_CAMPAIGN_GRAIN_SQL}
      ORDER BY channel_account_id, campaign_identity, business_date,
        (spend + revenue + impressions + clicks + conversions + orders) DESC, last_observed_at DESC
    ),
    product_campaign_daily AS (
      SELECT
        channel_account_id,
        campaign_identity,
        business_date,
        MAX(campaign_id) AS campaign_id,
        MAX(campaign_name) AS campaign_name,
        SUM(spend) AS spend,
        SUM(revenue) AS revenue,
        SUM(impressions) AS impressions,
        SUM(clicks) AS clicks,
        SUM(conversions) AS conversions,
        SUM(orders) AS orders,
        bool_and(conversions_observed) AS conversions_observed
      FROM measured
      WHERE target_type <> 'keyword' AND campaign_identity IS NOT NULL AND ${IS_PRODUCT_GRAIN_SQL}
      GROUP BY channel_account_id, campaign_identity, business_date
    )
`;

/** One business date the ad source reported, with that day's totals. */
export type AdWindowDay = Readonly<{
  businessDate: string;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  /**
   * Stored count; a measurement only when `conversionsObserved`. The campaign
   * dashboard grid carries no conversion columns, and the ledger keeps 0 there.
   */
  conversions: number;
  orders: number;
  /**
   * Whether every row summed into this day came from a provider grid that
   * carried the conversion-count columns (`conversions` and `orders`). A day
   * measured with no rows observed nothing to count and is `true`.
   */
  conversionsObserved: boolean;
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
  conversions_observed: boolean;
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
  tx: Prisma.TransactionClient,
  input: { organizationId: string; from?: Date; to?: Date },
): Promise<AdWindowFacts> {
  const rows = await tx.$queryRaw<DayRow[]>(Prisma.sql`
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
        bool_and(conversions_observed) AS conversions_observed,
        MAX(last_observed_at) AS observed_at
      FROM campaign_daily GROUP BY channel_account_id, business_date
    ),
    product_days AS (
      SELECT channel_account_id, business_date,
        ${AD_METRIC_SUMS_SQL},
        bool_and(conversions_observed) AS conversions_observed,
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
        -- The same grain the sums came from decides whether its conversion
        -- columns were observed; a measured day without rows counted nothing.
        CASE
          WHEN c.channel_account_id IS NOT NULL THEN c.conversions_observed
          WHEN p.channel_account_id IS NOT NULL THEN p.conversions_observed
          ELSE TRUE
        END AS conversions_observed,
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
      bool_and(conversions_observed) AS conversions_observed,
      MAX(observed_at) AS observed_at
    FROM account_days
    GROUP BY business_date
    ORDER BY 1 ASC
  `);

  let observedAt: Date | null = null;
  const days = rows.map((row) => {
    if (row.observed_at && (!observedAt || row.observed_at > observedAt)) observedAt = row.observed_at;
    return {
      businessDate: businessDateKey(row.business_date),
      spend: row.spend,
      revenue: row.revenue,
      impressions: row.impressions,
      clicks: row.clicks,
      conversions: row.conversions,
      orders: row.orders,
      conversionsObserved: row.conversions_observed,
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
  /** Whether every summed product row observed the conversion-count columns. */
  conversionsObserved: boolean;
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
  conversions_observed: boolean;
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
  tx: Prisma.TransactionClient,
  input: { organizationId: string; from?: Date; to?: Date },
): Promise<readonly AdListingWindowFacts[]> {
  const rows = await tx.$queryRaw<ListingRow[]>(Prisma.sql`
    WITH active_accounts AS (${ACTIVE_AD_ACCOUNTS_CTE(input.organizationId)}), -- organization_id bound above
    sweeps AS (${SWEEPS_CTE(input.organizationId)}), -- organization_id bound above
    measured AS (${measuredTargetRows(input.organizationId, input.from, input.to)}),
    covered AS (${coveredDates(input.from, input.to)})
    SELECT
      listing_id,
      (SELECT COUNT(*) FROM covered)::int AS days,
      (SELECT MIN(business_date) FROM covered) AS first_date,
      (SELECT MAX(business_date) FROM covered) AS last_date,
      MAX(last_observed_at) AS observed_at,
      ${AD_METRIC_SUMS_SQL},
      bool_and(conversions_observed) AS conversions_observed
    FROM measured
    INNER JOIN covered USING (business_date)
    WHERE listing_id IS NOT NULL AND target_type <> 'keyword' AND ${IS_PRODUCT_GRAIN_SQL}
    GROUP BY listing_id
  `);
  return rows.map((row) => ({
    listingId: row.listing_id,
    days: row.days,
    firstDate: businessDateKey(row.first_date),
    lastDate: businessDateKey(row.last_date),
    observedAt: row.observed_at,
    spend: row.spend,
    revenue: row.revenue,
    impressions: row.impressions,
    clicks: row.clicks,
    conversions: row.conversions,
    orders: row.orders,
    conversionsObserved: row.conversions_observed,
  }));
}

/** The newest business date the ad source reported for the organization. */
export async function readLatestAdDate(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<Date | null> {
  const rows = await tx.$queryRaw<{ business_date: Date | null }[]>(Prisma.sql`
    WITH active_accounts AS (${ACTIVE_AD_ACCOUNTS_CTE(organizationId)}), -- organization_id bound above
    sweeps AS (${SWEEPS_CTE(organizationId)}), -- organization_id bound above
    covered AS (${coveredDates()})
    SELECT MAX(business_date) AS business_date FROM covered
  `);
  return rows[0]?.business_date ?? null;
}

/** The exclusive end of a `[from, to)` window whose last business date is `date`. */
export function dayAfter(date: Date): Date {
  return addDays(date, 1);
}

/** One campaign's measured totals over a window. */
export type AdCampaignWindowRollup = Readonly<{
  targetKey: string;
  channelAccountId: string;
  campaignIdentity: string;
  campaignId: string | null;
  campaignName: string | null;
  listingId: string | null;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  orders: number;
  /** Whether every summed campaign-day observed the conversion-count columns. */
  conversionsObserved: boolean;
}>;

/**
 * Per-campaign totals for `[from, to)` over the measured target rows. A
 * campaign-day is the provider campaign rollup when one was published, else
 * the sum of that campaign's product rows; the two are never added together.
 */
export async function readCampaignWindowRollups(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; from: Date; to: Date },
): Promise<AdCampaignWindowRollup[]> {
  return tx.$queryRaw<AdCampaignWindowRollup[]>(Prisma.sql`
    WITH active_accounts AS (${ACTIVE_AD_ACCOUNTS_CTE(input.organizationId)}), -- organization_id bound above
    sweeps AS (${SWEEPS_CTE(input.organizationId)}), -- organization_id bound above
    measured AS (${measuredTargetRows(input.organizationId, input.from, input.to)}),
    ${CAMPAIGN_DAILY_CTES},
    daily AS (
      SELECT channel_account_id, campaign_identity, business_date, campaign_id, campaign_name,
        listing_id, spend::bigint AS spend, revenue::bigint AS revenue,
        impressions::bigint AS impressions, clicks::bigint AS clicks,
        conversions::bigint AS conversions, orders::bigint AS orders, conversions_observed
      FROM campaign_daily
      UNION ALL
      SELECT p.channel_account_id, p.campaign_identity, p.business_date, p.campaign_id, p.campaign_name,
        NULL::uuid AS listing_id, p.spend, p.revenue, p.impressions, p.clicks,
        p.conversions, p.orders, p.conversions_observed
      FROM product_campaign_daily p
      WHERE NOT EXISTS (
        SELECT 1 FROM campaign_daily c
        WHERE c.channel_account_id = p.channel_account_id
          AND c.campaign_identity = p.campaign_identity
          AND c.business_date = p.business_date
      )
    )
    SELECT
      channel_account_id::text || ':' || campaign_identity AS "targetKey",
      channel_account_id          AS "channelAccountId",
      campaign_identity           AS "campaignIdentity",
      MAX(campaign_id)            AS "campaignId",
      MAX(campaign_name)          AS "campaignName",
      MAX(listing_id::text)::uuid AS "listingId",
      SUM(spend)::int             AS spend,
      SUM(revenue)::int           AS revenue,
      SUM(impressions)::int       AS impressions,
      SUM(clicks)::int            AS clicks,
      SUM(conversions)::int       AS conversions,
      SUM(orders)::int            AS orders,
      bool_and(conversions_observed) AS "conversionsObserved"
    FROM daily
    GROUP BY channel_account_id, campaign_identity
  `);
}

/** One advertised product target's measured totals over a window. */
export type AdProductWindowRollup = Readonly<{
  targetKey: string;
  channelAccountId: string;
  campaignIdentity: string | null;
  campaignId: string | null;
  campaignName: string | null;
  listingId: string | null;
  listingOptionId: string | null;
  externalId: string | null;
  externalOptionId: string | null;
  keyword: string | null;
  status: string | null;
  onOff: string | null;
  metaJson: unknown | null;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  orders: number;
}>;

/**
 * Product-grain target totals for `[from, to)`; descriptors come from each
 * target's current row. Campaign rollup rows never appear here, so a campaign
 * cannot list itself as one of its products.
 */
export async function readProductWindowRollups(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    from: Date;
    to: Date;
    campaign?: { channelAccountId: string; campaignIdentity: string };
  },
): Promise<AdProductWindowRollup[]> {
  return tx.$queryRaw<AdProductWindowRollup[]>(Prisma.sql`
    WITH active_accounts AS (${ACTIVE_AD_ACCOUNTS_CTE(input.organizationId)}), -- organization_id bound above
    sweeps AS (${SWEEPS_CTE(input.organizationId)}), -- organization_id bound above
    measured AS (${measuredTargetRows(input.organizationId, input.from, input.to)}),
    scoped AS (
      SELECT *
      FROM measured
      WHERE target_type = 'product'
        AND ${IS_PRODUCT_GRAIN_SQL}
        ${input.campaign
          ? Prisma.sql`
              AND channel_account_id = ${input.campaign.channelAccountId}::uuid
              AND campaign_identity = ${input.campaign.campaignIdentity}
            `
          : Prisma.empty}
    ),
    rollups AS (
      SELECT
        target_key AS "targetKey",
        SUM(spend)::int AS spend,
        SUM(revenue)::int AS revenue,
        SUM(impressions)::int AS impressions,
        SUM(clicks)::int AS clicks,
        SUM(conversions)::int AS conversions,
        SUM(orders)::int AS orders
      FROM scoped
      GROUP BY target_key
    ),
    latest AS (
      SELECT DISTINCT ON (target_key)
        target_key AS "targetKey",
        channel_account_id AS "channelAccountId",
        campaign_identity AS "campaignIdentity",
        campaign_id AS "campaignId",
        campaign_name AS "campaignName",
        listing_id AS "listingId",
        listing_option_id AS "listingOptionId",
        external_id AS "externalId",
        external_option_id AS "externalOptionId",
        keyword,
        status,
        on_off AS "onOff",
        meta_json AS "metaJson"
      FROM scoped
      ORDER BY target_key, ${currentRowTieBreakSql({
        businessDate: Prisma.sql`business_date`,
        observedAt: Prisma.sql`last_observed_at`,
        updatedAt: Prisma.sql`updated_at`,
        id: Prisma.sql`id`,
      })}
    )
    SELECT
      rollups."targetKey",
      latest."channelAccountId",
      latest."campaignIdentity",
      latest."campaignId",
      latest."campaignName",
      latest."listingId",
      latest."listingOptionId",
      latest."externalId",
      latest."externalOptionId",
      latest.keyword,
      latest.status,
      latest."onOff",
      latest."metaJson",
      rollups.spend,
      rollups.revenue,
      rollups.impressions,
      rollups.clicks,
      rollups.conversions,
      rollups.orders
    FROM rollups
    JOIN latest USING ("targetKey")
    ORDER BY rollups.revenue DESC, rollups.spend DESC, rollups."targetKey" ASC
  `);
}

/** A campaign or product target as its account's newest completed sweep last reported it. */
export type AdCurrentTargetRow = Readonly<{
  id: string;
  targetType: string;
  targetKey: string;
  listingId: string | null;
  listingOptionId: string | null;
  externalId: string | null;
  externalOptionId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  keyword: string | null;
  status: string | null;
  currentBid: number | null;
  dailyBudget: number | null;
  spend: number;
  revenue: number;
  impressions: number;
  clicks: number;
  conversions: number;
  metaJson: unknown | null;
}>;

/**
 * The current campaign and product targets: each target's latest measured row
 * inside its account's newest completed sweep. A target that sweep no longer
 * reports has stopped and is absent.
 */
export async function readCurrentAdTargetRows(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<AdCurrentTargetRow[]> {
  return tx.$queryRaw<AdCurrentTargetRow[]>(Prisma.sql`
    WITH active_accounts AS (${ACTIVE_AD_ACCOUNTS_CTE(organizationId)}), -- organization_id bound above
    sweeps AS (${SWEEPS_CTE(organizationId)}), -- organization_id bound above
    measured AS (${measuredTargetRows(organizationId, undefined, undefined, { currentGenerationOnly: true })})
    SELECT DISTINCT ON (target_key)
      id,
      target_type        AS "targetType",
      target_key         AS "targetKey",
      listing_id         AS "listingId",
      listing_option_id  AS "listingOptionId",
      external_id        AS "externalId",
      external_option_id AS "externalOptionId",
      campaign_id        AS "campaignId",
      campaign_name      AS "campaignName",
      keyword,
      status,
      current_bid        AS "currentBid",
      daily_budget       AS "dailyBudget",
      spend,
      revenue,
      impressions,
      clicks,
      conversions,
      meta_json          AS "metaJson"
    FROM measured
    WHERE target_type IN ('campaign', 'product')
    ORDER BY target_key, ${currentRowTieBreakSql({
      businessDate: Prisma.sql`business_date`,
      observedAt: Prisma.sql`last_observed_at`,
      updatedAt: Prisma.sql`updated_at`,
      id: Prisma.sql`id`,
    })}
  `);
}

/** The ledger row an `AdAction` was proposed from, as its provenance. */
export type AdTargetRowEvidence = Readonly<{
  id: string;
  targetType: string;
  campaignName: string | null;
  keyword: string | null;
  businessDate: Date;
  lastObservedAt: Date;
}>;

/**
 * Provenance lookup for proposed actions: the exact rows they cite, fenced to
 * the organization. This identifies evidence already acted on; it is not a
 * measurement read and applies no sweep gate.
 */
export async function readAdTargetRowEvidence(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; ids: readonly string[] },
): Promise<AdTargetRowEvidence[]> {
  if (input.ids.length === 0) return [];
  return tx.channelAdTargetDailySnapshot.findMany({
    where: { id: { in: [...input.ids] }, organizationId: input.organizationId },
    select: {
      id: true,
      targetType: true,
      campaignName: true,
      keyword: true,
      businessDate: true,
      lastObservedAt: true,
    },
  });
}

type KeywordCoverage = {
  campaignIdentity: string;
  adGroupId: string;
  capturedAt: string;
  businessDate: string;
};

type PublishedKeywordGroup = {
  attempt: SourceImportRun;
  coverage: KeywordCoverage | null;
  observedAt: number;
};

export type AdKeywordFact = ChannelAdTargetDailySnapshot & {
  targetType: 'keyword';
  keyword: string;
  /** Width declared by the source for this non-additive observation. */
  windowDays: 7;
};

function keywordManifest(attempt: SourceImportRun) {
  const report = attempt.qualityReport as {
    rosterCapturedAt?: string;
    keywordCoverage?: KeywordCoverage[];
  } | null;
  return {
    rosterAt: Date.parse(report?.rosterCapturedAt ?? ''),
    groups: (report?.keywordCoverage ?? []).filter(
      (group) =>
        typeof group.campaignIdentity === 'string' &&
        typeof group.adGroupId === 'string' &&
        Number.isFinite(Date.parse(group.capturedAt)) &&
        /^\d{4}-\d{2}-\d{2}$/.test(group.businessDate),
    ),
  };
}

function keywordRecency(group: PublishedKeywordGroup) {
  return { observedAt: group.observedAt, importedAt: group.attempt.importedAt, id: group.attempt.id };
}

const keywordGroupKey = (group: KeywordCoverage) =>
  JSON.stringify([group.campaignIdentity, group.adGroupId]);

function keywordSelectionKey(group: PublishedKeywordGroup): string {
  return JSON.stringify([
    group.attempt.id,
    group.attempt.channelAccountId,
    group.coverage?.campaignIdentity,
    group.coverage?.adGroupId,
    group.coverage?.businessDate,
  ]);
}

function keywordWindowDays(metaJson: unknown): number | null {
  if (!metaJson || typeof metaJson !== 'object' || Array.isArray(metaJson)) {
    return null;
  }
  const meta = metaJson as Record<string, unknown>;
  for (const candidate of [meta['advertising.keyword.target'], meta.data]) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      continue;
    }
    const value = (candidate as Record<string, unknown>).windowDays;
    if (typeof value === 'number' && Number.isInteger(value)) return value;
  }
  return null;
}

/**
 * Current COMPLETE advertising keyword observations.
 *
 * Keyword metrics describe a trailing seven-day window whose end is
 * `businessDate`; they are never added across observation times. When several
 * physical rows represent the same target in the same source observation they
 * may still be merged, preserving the provider's target-key behavior.
 */
export async function readCompleteAdKeywordFacts(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: {
    channelAccountId?: string;
    campaignIdentity?: string;
  } = {},
): Promise<{ attempts: SourceImportRun[]; rows: AdKeywordFact[] }> {
  const published = await tx.sourceImportRun.findMany({
    where: {
      organizationId,
      status: 'completed',
      OR: [
        { sourceType: 'coupang_ad_keyword', parserVersion: 'ad-keyword-v1' },
        { sourceType: 'coupang_ad_campaign', parserVersion: 'ad-campaign-v1' },
      ],
      ...(input.channelAccountId
        ? { channelAccountId: input.channelAccountId }
        : {}),
    },
  });
  const accounts = new Map<string, typeof published>();
  for (const attempt of published) {
    if (!attempt.channelAccountId) continue;
    const list = accounts.get(attempt.channelAccountId) ?? [];
    list.push(attempt);
    accounts.set(attempt.channelAccountId, list);
  }

  const attempts: SourceImportRun[] = [];
  const selected: PublishedKeywordGroup[] = [];
  for (const accountAttempts of accounts.values()) {
    const snapshots = accountAttempts.map((attempt) => ({
      attempt,
      ...keywordManifest(attempt),
    }));
    const full = snapshots.filter(
      (snapshot) =>
        snapshot.attempt.sourceType === 'coupang_ad_keyword' &&
        Number.isFinite(snapshot.rosterAt),
    );
    full.sort((a, b) => compareAttemptsNewestFirst(
      { observedAt: a.rosterAt, importedAt: a.attempt.importedAt, id: a.attempt.id },
      { observedAt: b.rosterAt, importedAt: b.attempt.importedAt, id: b.attempt.id },
    ));
    if (full[0]) attempts.push(full[0].attempt);

    const groups = new Set(
      snapshots.flatMap((snapshot) => snapshot.groups.map(keywordGroupKey)),
    );
    for (const key of groups) {
      let winner: PublishedKeywordGroup | undefined;
      for (const snapshot of snapshots) {
        const coverage =
          snapshot.groups.find((group) => keywordGroupKey(group) === key) ??
          null;
        if (!coverage && !full.includes(snapshot)) continue;
        const candidate = {
          attempt: snapshot.attempt,
          coverage,
          observedAt: coverage
            ? Date.parse(coverage.capturedAt)
            : snapshot.rosterAt,
        };
        if (!winner || isNewerAttempt(keywordRecency(candidate), keywordRecency(winner))) winner = candidate;
      }
      if (winner?.coverage) selected.push(winner);
    }
  }

  const contributions = selected.length
    ? await tx.channelAdTargetDailySnapshot.findMany({
        where: {
          organizationId,
          targetType: 'keyword',
          keyword: { not: null },
          OR: selected.map(({ attempt, coverage }) => ({
            sourceImportRunId: attempt.id,
            channelAccountId: attempt.channelAccountId!,
            campaignIdentity: coverage!.campaignIdentity,
            adGroupId: coverage!.adGroupId,
            businessDate: new Date(coverage!.businessDate),
          })),
          ...(input.campaignIdentity
            ? { campaignIdentity: input.campaignIdentity }
            : {}),
        },
      })
    : [];

  const selectedByScope = new Map(
    selected.map((group) => [keywordSelectionKey(group), group]),
  );
  const observations = contributions.map((contribution) => {
    const scope = selectedByScope.get(
      JSON.stringify([
        contribution.sourceImportRunId,
        contribution.channelAccountId,
        contribution.campaignIdentity,
        contribution.adGroupId,
        businessDateKey(contribution.businessDate),
      ]),
    );
    const windowDays = keywordWindowDays(contribution.metaJson);
    if (windowDays !== 7) {
      throw new Error(
        `AD_KEYWORD_WINDOW_MISMATCH: expected 7 days, received ${windowDays ?? 'missing'}`,
      );
    }
    return {
      contribution,
      observedAt: scope?.observedAt ?? contribution.lastObservedAt.getTime(),
      windowDays,
    };
  });
  observations.sort(
    (a, b) =>
      a.contribution.channelAccountId.localeCompare(
        b.contribution.channelAccountId,
      ) ||
      a.contribution.targetKey.localeCompare(b.contribution.targetKey) ||
      b.observedAt - a.observedAt ||
      b.contribution.id.localeCompare(a.contribution.id),
  );

  const rows = new Map<
    string,
    { fact: AdKeywordFact; observedAt: number; sourceImportRunId: string | null }
  >();
  for (const { contribution, observedAt } of observations) {
    const target = {
      ...contribution,
      targetType: 'keyword' as const,
      keyword: contribution.keyword!,
      windowDays: 7 as const,
    };
    const key = JSON.stringify([target.channelAccountId, target.targetKey]);
    const previous = rows.get(key);
    if (!previous) {
      rows.set(key, {
        fact: target,
        observedAt,
        sourceImportRunId: target.sourceImportRunId,
      });
      continue;
    }
    // One COMPLETE attempt may publish independent ad-group contributions to
    // the same public keyword key. Those are one frozen observation and remain
    // additive. A contribution from another attempt is a later observation,
    // so it replaces this one instead of being added to it.
    if (previous.sourceImportRunId !== target.sourceImportRunId) continue;
    rows.set(key, {
      ...previous,
      fact: {
        ...previous.fact,
        ...mergeKeywordTargets(
          {
            ...previous.fact,
            metaJson:
              previous.fact.metaJson as UpsertAdTargetDailyInput['metaJson'],
          },
          {
            ...target,
            metaJson: target.metaJson as UpsertAdTargetDailyInput['metaJson'],
          },
        ),
        keyword: previous.fact.keyword,
        targetType: 'keyword',
        metaJson: previous.fact.metaJson,
        windowDays: 7,
      } as AdKeywordFact,
    });
  }
  return { attempts, rows: [...rows.values()].map((row) => row.fact) };
}

/** Campaign daily grains share one account snapshot, including an authoritative empty generation. */
export function completeAdCampaignSourceIds(organizationId: string) {
  return Prisma.sql`
    SELECT DISTINCT ON (channel_account_id) id
    FROM source_import_runs
    WHERE organization_id = ${organizationId}::uuid
      AND source_type = 'coupang_ad_campaign' AND parser_version = 'ad-campaign-v1'
      AND status = 'completed' AND channel_account_id IS NOT NULL
      AND plan ->> 'captureMode' = 'campaign_sweep'
    ORDER BY channel_account_id, freshness_generation DESC NULLS LAST, id DESC
  `;
}
