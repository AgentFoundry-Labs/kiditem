import { z } from 'zod';
import { zIsoDate } from './common.js';

export const AdExtensionReplayIdempotencyKeySchema = z.string()
  .max(160)
  .regex(/^authoritative-rebuild:[1-9][0-9]*:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
export type AdExtensionReplayIdempotencyKey = z.infer<
  typeof AdExtensionReplayIdempotencyKeySchema
>;

/** Producer-side campaign report authority contract. */
export const AdCampaignReportScopeSchema = z.enum([
  'single_campaign_authoritative',
  'single_campaign_metadata_raw',
  'multi_campaign_raw',
]);
export type AdCampaignReportScope = z.infer<
  typeof AdCampaignReportScopeSchema
>;

// ───── Building blocks ─────

export const AdListingSummarySchema = z.object({
  listingId: z.string().uuid(),
  externalId: z.string(),
  channelName: z.string().nullable(),
  masterProduct: z.object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
  }),
  option: z.object({
    id: z.string().uuid(),
    sku: z.string(),
    optionName: z.string().nullable(),
  }).nullable(),
});
export type AdListingSummary = z.infer<typeof AdListingSummarySchema>;

export const AdMetricsSchema = z.object({
  spend: z.number().int(),
  impressions: z.number().int(),
  clicks: z.number().int(),
  conversions: z.number().int(),
  revenue: z.number().int(),
  ctr: z.number().nullable(),
  roas: z.number().nullable(),
  cvr: z.number().nullable(),
});
export type AdMetrics = z.infer<typeof AdMetricsSchema>;

// ───── List / Hub ─────

export const AdsListItemSchema = AdListingSummarySchema.merge(z.object({
  metrics: AdMetricsSchema,
  grade: z.enum(['A', 'B', 'C']).nullable(),
}));
export type AdsListItem = z.infer<typeof AdsListItemSchema>;

export const AdsHubSummarySchema = z.object({
  totalSpend: z.number().int(),
  totalRevenue: z.number().int(),
  totalRoas: z.number().nullable(),
  gradeSpend: z.record(z.enum(['A', 'B', 'C']), z.number().int()),
  gradeSpendPercent: z.record(z.enum(['A', 'B', 'C']), z.number()),
});
export type AdsHubSummary = z.infer<typeof AdsHubSummarySchema>;
export type AdsSummary = AdsHubSummary;

export const AdsHubDataSchema = z.object({
  products: z.array(AdsListItemSchema),
  summary: AdsHubSummarySchema,
  // Products' retained ABC publication cutoff. Null before any publication:
  // no product's grade membership is measured, so a per-grade count is unknown.
  abcOfficialCutoffDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});
export type AdsHubData = z.infer<typeof AdsHubDataSchema>;

export const FindAllAdsResponseSchema = z.object({
  items: z.array(AdsListItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});
export type FindAllAdsResponse = z.infer<typeof FindAllAdsResponseSchema>;

// ───── Campaigns / Trends ─────

// `listing` becomes nullable — campaign-grain rollups in `ChannelAdTargetDailySnapshot`
// are not always tied to a specific listing (Coupang campaigns frequently span many
// products). Drive replay only has campaign- and account-level ad data, so listing-less
// rows must surface to operators instead of being dropped.
export const AdCampaignSnapshotSchema = z.object({
  listing: AdListingSummarySchema.nullable(),
  channelAccountId: z.string().uuid(),
  campaignIdentity: z.string().min(1),
  campaignId: z.string().nullable(),
  campaignName: z.string().nullable(),
  /**
   * Whether the requested period has additive campaign facts.
   *
   * A completed campaign sweep can observe an OFF campaign without producing
   * dated performance facts. In that case the structural `metrics` object is
   * still present, but consumers must render unknown values rather than its
   * zero placeholders.
   */
  metricsAvailable: z.boolean(),
  /** Current provider state from the latest identity-complete sweep. */
  status: z.string().nullable(),
  /** Current provider ON/OFF state from the latest identity-complete sweep. */
  onOff: z.string().nullable(),
  period: z.string(),
  /**
   * Whether `metrics.conversions` is a collected value at all.
   *
   * The Coupang campaign dashboard grid has no conversion-count column — only
   * the per-campaign product detail grid carries `광고 전환 판매수`. The scraper
   * emits a numeric 0 for absent columns, so a campaign-grain `conversions: 0`
   * means "not collected". Render unknown (`-`) rather than a fabricated 0.
   */
  conversionsAvailable: z.boolean(),
  metrics: AdMetricsSchema,
});
export type AdCampaignSnapshot = z.infer<typeof AdCampaignSnapshotSchema>;

export const AdProductSnapshotSchema = z.object({
  listing: AdListingSummarySchema.nullable(),
  channelAccountId: z.string().uuid(),
  campaignIdentity: z.string().nullable(),
  externalId: z.string().nullable(),
  externalOptionId: z.string().nullable(),
  campaignId: z.string().nullable(),
  campaignName: z.string().nullable(),
  keyword: z.string().nullable(),
  status: z.string().nullable(),
  onOff: z.string().nullable(),
  productName: z.string().nullable(),
  imageUrl: z.string().nullable(),
  productUrl: z.string().nullable(),
  saleType: z.string().nullable(),
  period: z.string(),
  metrics: AdMetricsSchema,
});
export type AdProductSnapshot = z.infer<typeof AdProductSnapshotSchema>;

// ───── Keyword grain ─────
//
// The Coupang ad centre "키워드 보기" modal is backed by two provider calls:
// `POST /marketing/cmg-api/tableMetric` with `tableType='keyword'` (metrics per
// keyword for one ad) and `GET /marketing/tetris-api/ad/keywords/{adId}`
// (manually registered keywords with their audit state and bid). A keyword that
// only appears in the metric table is smart-targeting inventory Coupang matched
// on its own — the advertiser never registered it.

/** How a keyword became attached to an ad. */
export const AdKeywordOriginSchema = z.enum(['registered', 'smart_targeting']);
export type AdKeywordOrigin = z.infer<typeof AdKeywordOriginSchema>;

/** Relevance verdict produced by the keyword agent. `null` = not judged yet. */
export const AdKeywordRelevanceSchema = z.enum([
  'relevant',
  'loose',
  'irrelevant',
]);
export type AdKeywordRelevance = z.infer<typeof AdKeywordRelevanceSchema>;

/**
 * A keyword's latest `pause_keyword` proposal. Once that proposal is rejected
 * the keyword shows none, and an older proposal does not come back; one that
 * failed or is done is still shown, so an operator can run a failure again.
 */
export const AdKeywordPauseProposalSchema = z.object({
  actionId: z.string().uuid(),
  approvalStatus: z.enum(['pending_review', 'approved']),
  /**
   * Execution state read from the proposal's latest attempt. A proposal
   * awaiting review has no attempt and reads `queued`; a running attempt past
   * its execution deadline reads `failed`.
   */
  executeStatus: z.enum(['queued', 'running', 'done', 'failed']),
  /** Why the latest attempt failed, such as "실행 기한 초과"; null otherwise. */
  errorMessage: z.string().nullable(),
});
export type AdKeywordPauseProposal = z.infer<typeof AdKeywordPauseProposalSchema>;

export const AdKeywordSnapshotSchema = z.object({
  channelAccountId: z.string().uuid(),
  campaignIdentity: z.string().nullable(),
  campaignId: z.string().nullable(),
  campaignName: z.string().nullable(),
  adGroup: z.string().nullable(),
  keyword: z.string(),
  origin: AdKeywordOriginSchema,
  /** Provider audit state for registered keywords ("승인" / "검수중" / …). */
  status: z.string().nullable(),
  onOff: z.string().nullable(),
  currentBid: z.number().int().nullable(),
  /** Advertised option this keyword is attached to. */
  externalOptionId: z.string().nullable(),
  productName: z.string().nullable(),
  listing: AdListingSummarySchema.nullable(),
  /** Source-declared non-additive observation window. */
  period: z.literal('7d'),
  windowDays: z.literal(7),
  businessDate: zIsoDate,
  /**
   * Whether `metrics.conversions` is a collected count. The keyword table can
   * lack the conversion column; ingest then stores 0, so render unknown (`-`)
   * and treat `metrics.cvr` as unavailable when this is false.
   */
  conversionsAvailable: z.boolean(),
  metrics: AdMetricsSchema,
  relevance: AdKeywordRelevanceSchema.nullable(),
  relevanceReason: z.string().nullable(),
  /** The pause proposal behind an "irrelevant" verdict; null when none is in play. */
  pauseProposal: AdKeywordPauseProposalSchema.nullable(),
});
export type AdKeywordSnapshot = z.infer<typeof AdKeywordSnapshotSchema>;

/** One advertised product with its keyword footprint rolled up. */
export const AdKeywordProductSummarySchema = z.object({
  externalOptionId: z.string(),
  productName: z.string().nullable(),
  campaignId: z.string().nullable(),
  campaignName: z.string().nullable(),
  listing: AdListingSummarySchema.nullable(),
  keywordCount: z.number().int(),
  registeredCount: z.number().int(),
  smartTargetingCount: z.number().int(),
  /** Keywords that drew at least one impression in the period. */
  servingCount: z.number().int(),
  irrelevantCount: z.number().int(),
  unjudgedCount: z.number().int(),
  /** True only when every rolled-up keyword's conversion count was collected. */
  conversionsAvailable: z.boolean(),
  metrics: AdMetricsSchema,
});
export type AdKeywordProductSummary = z.infer<
  typeof AdKeywordProductSummarySchema
>;

export const AdKeywordsDataSchema = z.object({
  period: z.literal('7d'),
  windowDays: z.literal(7),
  collectedAt: z.string().nullable(),
  products: z.array(AdKeywordProductSummarySchema),
  keywords: z.array(AdKeywordSnapshotSchema),
});
export type AdKeywordsData = z.infer<typeof AdKeywordsDataSchema>;

// ───── Measured ad metrics over the campaign sweep's ledger ─────
//
// The advertising target-day ledger stores 0 in a conversion column the
// provider grid did not carry. A reader publishes that count as `null`, so a
// consumer never renders or reasons over a conversion count nobody observed.
const AdBusinessDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const AdMeasuredMetricsSchema = AdMetricsSchema.extend({
  conversions: z.number().int().nullable(),
});
export type AdMeasuredMetrics = z.infer<typeof AdMeasuredMetricsSchema>;

/** One requested business date; `metrics: null` when the sweep never measured it. */
export const AdTrendsDaySchema = z.object({
  date: AdBusinessDateSchema,
  metrics: AdMeasuredMetricsSchema.nullable(),
  orders: z.number().int().nullable(),
});
export type AdTrendsDay = z.infer<typeof AdTrendsDaySchema>;

/**
 * Account totals over the measured days of the requested window. Ratios
 * recompute from the summed raw values; `periodDayCount` is the number of
 * measured days behind every value, and 0 when the sweep measured none. No
 * source word travels here (ADR-0006); a screen names the source from the count.
 */
export const AdTrendsSummarySchema = z.object({
  periodDayCount: z.number().int().nonnegative(),
  latestBusinessDate: AdBusinessDateSchema.nullable(),
  observedAt: z.string().nullable(),
  metrics: AdMeasuredMetricsSchema.nullable(),
  orders: z.number().int().nullable(),
});
export type AdTrendsSummary = z.infer<typeof AdTrendsSummarySchema>;

export const AdTrendsDataSchema = z.object({
  knownThrough: AdBusinessDateSchema,
  /** Inclusive requested window. */
  from: AdBusinessDateSchema,
  to: AdBusinessDateSchema,
  /** Every date of the requested window, ascending. */
  daily: z.array(AdTrendsDaySchema),
  summary: AdTrendsSummarySchema,
});
export type AdTrendsData = z.infer<typeof AdTrendsDataSchema>;

// ───── Strategy (rules / plan / recommendations) ─────

// Wave C4 — read-only product/option state signal derived from
// `ChannelListingDailySnapshot` / `ChannelListingOptionDailySnapshot`. Surfaced
// on strategy actions so reviewers see the product-state evidence behind a
// recommendation (item-winner status, winner price gap, current sale/exposure
// status, option stock/status, last observed timestamp).
export const ChannelOptionStateSignalSchema = z.object({
  listingOptionId: z.string().uuid(),
  externalOptionId: z.string(),
  optionName: z.string().nullable(),
  saleStatus: z.string().nullable(),
  isActive: z.boolean().nullable(),
  salePrice: z.number().int().nullable(),
  stockQty: z.number().int().nullable(),
  isOfferWinner: z.boolean().nullable(),
  myPrice: z.number().int().nullable(),
  winnerPrice: z.number().int().nullable(),
  winnerGapPrice: z.number().int().nullable(),
});
export type ChannelOptionStateSignal = z.infer<
  typeof ChannelOptionStateSignalSchema
>;

export const ChannelStateSignalSchema = z.object({
  channel: z.string(),
  externalId: z.string(),
  businessDate: z.string(),
  lastObservedAt: z.string(),
  sampleCount: z.number().int(),
  productName: z.string().nullable(),
  status: z.string().nullable(),
  exposureStatus: z.string().nullable(),
  saleStatus: z.string().nullable(),
  channelPrice: z.number().int().nullable(),
  isOfferWinner: z.boolean().nullable(),
  myPrice: z.number().int().nullable(),
  winnerPrice: z.number().int().nullable(),
  winnerGapPrice: z.number().int().nullable(),
  productRank: z.number().int().nullable(),
  categoryRank: z.number().int().nullable(),
  primaryOption: ChannelOptionStateSignalSchema.nullable(),
});
export type ChannelStateSignal = z.infer<typeof ChannelStateSignalSchema>;

export const AdStrategyActionSchema = z.object({
  listing: AdListingSummarySchema,
  grade: z.enum(['A', 'B', 'C']).nullable(),
  actionType: z.string(),
  priority: z.enum(['urgent', 'high', 'medium', 'low']),
  reason: z.string(),
  currentValue: z.number().int().nullable(),
  proposedValue: z.number().int().nullable(),
  // Wave C4 — optional channel-state evidence (null when no daily snapshot
  // exists yet for the listing). Backwards-compatible — old clients can
  // ignore the field.
  channelState: ChannelStateSignalSchema.nullable().optional(),
});
export type AdStrategyAction = z.infer<typeof AdStrategyActionSchema>;

// Per-listing traffic side-channel surfaced on Top 20 plan items so the
// strategy view stays informative when only Wing traffic data is matched.
export const AdListingTrafficSchema = z.object({
  revenue: z.number().int(),
  orders: z.number().int(),
});
export type AdListingTraffic = z.infer<typeof AdListingTrafficSchema>;

export const AdTop20ItemSchema = z.object({
  listing: AdListingSummarySchema,
  grade: z.enum(['A', 'B', 'C']).nullable(),
  rank: z.number().int(),
  metrics: AdMeasuredMetricsSchema,
  // Wing traffic for the same window (revenue + orders). Null when no
  // traffic snapshot landed for the listing in the period.
  traffic: AdListingTrafficSchema.nullable(),
});
export type AdTop20Item = z.infer<typeof AdTop20ItemSchema>;

export const AdIssuesSchema = z.object({
  zeroConversion: z.array(AdStrategyActionSchema),
  lowRoas: z.array(AdStrategyActionSchema),
  highSpend: z.array(AdStrategyActionSchema),
});
export type AdIssues = z.infer<typeof AdIssuesSchema>;

export const AdRulesDataSchema = z.object({
  recommendations: z.array(AdStrategyActionSchema),
  summary: z.object({
    totalActions: z.number().int(),
    urgentCount: z.number().int(),
  }),
});
export type AdRulesData = z.infer<typeof AdRulesDataSchema>;

export const AdStrategyPlanSchema = z.object({
  actions: z.array(AdStrategyActionSchema),
  issues: AdIssuesSchema,
  top20: z.array(AdTop20ItemSchema),
});
export type AdStrategyPlan = z.infer<typeof AdStrategyPlanSchema>;

export const AdWeeklyPlanSchema = AdStrategyPlanSchema.extend({
  week: z.object({ start: z.string(), end: z.string() }),
  /**
   * Listings of the plan whose profit over the current month's closed KST days
   * was withheld because a cost input was not measured (KID-85 P3-14). They
   * carry no profit rate, so the actions reason over the rest; this count says
   * how large that gap is.
   */
  profitWithheldListings: z.number().int().nonnegative(),
  /**
   * Whether a completed Orders collection covered every closed KST day of the
   * current month, the window profit rates are evaluated over (ADR-0001). When
   * it did not, no action carries a profit rate and `profitWithheldListings`
   * counts only the orders collected so far; on the 1st no day has closed.
   */
  orderWindowComplete: z.boolean(),
});
export type AdWeeklyPlan = z.infer<typeof AdWeeklyPlanSchema>;

export const AdStrategyRecommendationSchema = z.object({
  listing: AdListingSummarySchema,
  grade: z.enum(['A', 'B', 'C']).nullable(),
  title: z.string(),
  body: z.string(),
  priority: z.enum(['urgent', 'high', 'medium', 'low']),
});
export type AdStrategyRecommendation = z.infer<typeof AdStrategyRecommendationSchema>;

// ───── Benchmark ─────

export const AdBenchmarkDataSchema = z.object({
  ownMetrics: AdMetricsSchema,
  industryAverage: AdMetricsSchema,
  diagnosis: z.array(z.object({
    metric: z.enum(['ctr', 'roas', 'cvr']),
    status: z.enum(['above', 'average', 'below']),
    delta: z.number(),
    message: z.string(),
  })),
  listings: z.array(AdListingSummarySchema.merge(z.object({ metrics: AdMetricsSchema }))),
});
export type AdBenchmarkData = z.infer<typeof AdBenchmarkDataSchema>;

// ───── Extension status (H3 — current-state semantics) ─────

/**
 * `/api/ads/extension/status` response. Hard rewrite Phase H3 — all counts
 * come from latest `ChannelListingDailySnapshot` per listing
 * (orderBy businessDate desc, lastObservedAt desc, updatedAt desc, id desc),
 * `ChannelScrapeRun` / `ChannelScrapeSnapshot` for raw collection metadata,
 * and the Wing item-winner source owner's COMPLETE publication for the Wing KPI
 * sidebar. Legacy `ItemWinner` / `AdSnapshot` are NOT consulted.
 *
 * Field semantics:
 *  - `currentWinnerCount`: latest daily snapshot per listing where
 *    `isOfferWinner === true`.
 *  - `currentNonWinnerCount`: latest daily snapshot per listing where
 *    `isOfferWinner === false`.
 *  - `currentUnknownWinnerCount`: latest daily snapshot per listing where
 *    `isOfferWinner === null` (observed but provider didn't surface winner
 *    flag).
 *  - `currentWinnerObservedListings`: total listings with at least one daily
 *    snapshot (winner + non-winner + unknown). Replaces the legacy
 *    `itemWinnerCount`, which had been all `ItemWinner` rows ever recorded.
 *  - `latestChannelStateAt`: max(`lastObservedAt`) across daily snapshots —
 *    "현재 상태 마지막 갱신 시각".
 *  - `rawSnapshotCount`: count of `ChannelScrapeSnapshot` rows. Replaces the
 *    legacy `snapshotCount` (which was `AdSnapshot` rows).
 *  - `latestScrapeAt`: latest `ChannelScrapeRun.finishedAt ?? startedAt`.
 *  - `latestScrapePageType`: pageType of the latest run.
 */
export const AdExtensionStatusSchema = z.object({
  connected: z.literal(true),
  listingCount: z.number().int(),
  currentWinnerCount: z.number().int(),
  currentNonWinnerCount: z.number().int(),
  currentUnknownWinnerCount: z.number().int(),
  currentWinnerObservedListings: z.number().int(),
  latestChannelStateAt: z.union([z.string(), z.date()]).nullable(),
  rawSnapshotCount: z.number().int(),
  latestScrapeAt: z.union([z.string(), z.date()]).nullable(),
  latestScrapePageType: z.string().nullable(),
  wing: z.object({
    kpis: z.record(z.string(), z.string()),
    lastSync: z.union([z.string(), z.date()]).nullable(),
  }),
});
export type AdExtensionStatus = z.infer<typeof AdExtensionStatusSchema>;

/**
 * `/api/ads/collect/status` response. H3 — `lastCollectedAt` is the latest
 * `ChannelScrapeRun.finishedAt ?? startedAt`. Counts are run-row counts under
 * advertising / wing buckets respectively (see plan §C6 §2 mapping).
 */
export const AdCollectStatusSchema = z.object({
  lastCollectedAt: z.union([z.string(), z.date()]).nullable(),
  campaignSnapshotCount: z.number().int(),
  productSnapshotCount: z.number().int(),
});
export type AdCollectStatus = z.infer<typeof AdCollectStatusSchema>;
