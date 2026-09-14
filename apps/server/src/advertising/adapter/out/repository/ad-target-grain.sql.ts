import { Prisma } from '@prisma/client';

// The grain rule of `advertising/domain/ad-target-grain.ts`, as SQL, for
// every reader of `channel_ad_target_daily_snapshots`. Column references are
// unqualified, so a fragment must be used where the target table is the only
// relation in scope (or aliased identically). Lives beside the adapters
// because domain code stays Prisma-free.

/** The stamped grain, whichever meta namespace a writer generation used. */
export const STAMPED_AD_TARGET_GRAIN_SQL = Prisma.sql`
  COALESCE(
    meta_json -> 'advertising.campaign.target' ->> 'granularity',
    meta_json -> 'advertising.raw.target' ->> 'granularity',
    meta_json -> 'data' ->> 'granularity'
  )
`;

/** True for a row attributable to one advertised option/listing. */
export const IS_PRODUCT_GRAIN_SQL = Prisma.sql`
  CASE
    WHEN ${STAMPED_AD_TARGET_GRAIN_SQL} IS NOT NULL THEN ${STAMPED_AD_TARGET_GRAIN_SQL} = 'product'
    ELSE (
      external_option_id IS NOT NULL
      OR listing_option_id IS NOT NULL
      OR listing_id IS NOT NULL
    )
  END
`;

/** True for a campaign rollup row, whose metrics already contain its members. */
export const IS_CAMPAIGN_GRAIN_SQL = Prisma.sql`
  CASE
    WHEN ${STAMPED_AD_TARGET_GRAIN_SQL} IS NOT NULL THEN ${STAMPED_AD_TARGET_GRAIN_SQL} = 'campaign'
    ELSE (
      external_option_id IS NULL
      AND listing_option_id IS NULL
      AND listing_id IS NULL
    )
  END
`;

/** The six additive ad metrics of a target row, summed as integers. */
export const AD_METRIC_SUMS_SQL = Prisma.sql`
  SUM(spend)::int AS spend, SUM(revenue)::int AS revenue, SUM(impressions)::int AS impressions,
  SUM(clicks)::int AS clicks, SUM(conversions)::int AS conversions, SUM(orders)::int AS orders
`;

/**
 * Whether the provider grid behind a row carried a conversion-count column.
 * The ledger stores 0 in a column the grid lacked, so a row without this stamp
 * is not evidence of zero conversions or orders.
 */
export const CONVERSIONS_OBSERVED_SQL = Prisma.sql`
  COALESCE(
    meta_json -> 'advertising.campaign.target' ->> 'conversionsObserved',
    meta_json -> 'advertising.raw.target' ->> 'conversionsObserved',
    meta_json -> 'data' ->> 'conversionsObserved',
    'false'
  ) = 'true'
`;
