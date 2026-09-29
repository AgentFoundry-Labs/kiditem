import { z } from 'zod';
import { zIsoDate } from './common.js';
import { AdActionProviderOutcomeSchema } from './advertising-operations.js';

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

// A campaign row is the current `ChannelAdCampaign` state plus the product-report sums
// of its measured days (KID-372). `listing` is set only when the campaign advertised
// exactly one listing in the period; Coupang campaigns usually span many products.
export const AdCampaignSnapshotSchema = z.object({
  listing: AdListingSummarySchema.nullable(),
  channelAccountId: z.string().uuid(),
  campaignIdentity: z.string().min(1),
  campaignId: z.string().nullable(),
  campaignName: z.string().nullable(),
  /**
   * Whether the requested period has any measured ad day. When it has none the
   * structural `metrics` object is still present, but consumers must render
   * unknown values rather than its zero placeholders. On a measured period a
   * campaign without rows spent 0.
   */
  metricsAvailable: z.boolean(),
  /** Current provider status (`ChannelAdCampaign.status`). */
  status: z.string().nullable(),
  /** `isActive` as the ad center's ON/OFF word. */
  onOff: z.string().nullable(),
  isActive: z.boolean(),
  /** Provider budget as reported; the unit (KRW per day) is not yet confirmed (KID-371). */
  budget: z.number().int().nullable(),
  /** Provider ROAS target as reported. */
  roasTarget: z.number().nullable(),
  period: z.string(),
  /** Spend is the ad center's delivered spend ("집행 광고비"); conversions are orders. */
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
  saleType: z.string().nullable(),
  period: z.string(),
  metrics: AdMetricsSchema,
});
export type AdProductSnapshot = z.infer<typeof AdProductSnapshotSchema>;

// ───── Keyword grain ─────
//
// Keyword rows come from the ad report's keyword table (KID-371/372): one row
// per keyword, ad group, advertised option and day, and only for keywords that
// drew a click. A period view sums the measured days of the chosen period.
// Non-search exposure is the row with `keyword ''`, marked `nonSearch`.

/** Relevance verdict produced by the keyword agent. `null` = not judged yet. */
export const AdKeywordRelevanceSchema = z.enum([
  'relevant',
  'loose',
  'irrelevant',
]);
export type AdKeywordRelevance = z.infer<typeof AdKeywordRelevanceSchema>;

/**
 * The most ids one ad action approve or reject command names. One action
 * listing page holds at most as many actions, so a listed page is reviewed in
 * one command.
 */
export const AD_ACTION_COMMAND_MAX_IDS = 200;

/**
 * The review an approve or reject command can require each named action to
 * still be in. An action in another review is skipped, so a screen read before
 * another operator's review never undoes that review.
 */
export const AdActionExpectedApprovalStatusSchema = z.enum(['pending_review', 'approved']);
export type AdActionExpectedApprovalStatus = z.infer<typeof AdActionExpectedApprovalStatusSchema>;

/**
 * What an ad action approve or reject command answers: how many distinct
 * actions of the organization it changed.
 */
export const AdActionCommandResultSchema = z.object({
  updated: z.number().int().nonnegative(),
});
export type AdActionCommandResult = z.infer<typeof AdActionCommandResultSchema>;

/**
 * An ad action's execution word (KID-386). An action is a decision; its
 * execution is an `advertising.ad_action` operation, and this word is read from
 * the action's latest one:
 *
 * - `not_prepared`: no operation. A proposal awaiting review, an approved
 *   action the operator applies by hand (`pause_keyword`, `change_bid`,
 *   `change_daily_budget`), or an approval from before KID-386 or whose
 *   preparation did not finish (approving it again prepares it).
 * - `queued` (prepared, waiting for the extension's popup), `running`
 *   (claimed), `done` (the ad center showed the new campaign), `uncertain` (the
 *   form was submitted but no campaign id was read; check the ad center),
 *   `failed`, `cancelled` (rejected before the extension took it).
 */
export const AD_ACTION_EXECUTE_STATUSES = [
  'not_prepared',
  'queued',
  'running',
  'done',
  'uncertain',
  'failed',
  'cancelled',
] as const;
export const AdActionExecuteStatusSchema = z.enum(AD_ACTION_EXECUTE_STATUSES);
export type AdActionExecuteStatus = z.infer<typeof AdActionExecuteStatusSchema>;

/** An ad action's execution as the action listing reads it from its operation (KID-386). */
export const AdActionExecutionSchema = z.object({
  /** The action's latest `advertising.ad_action` operation; null while `not_prepared`. */
  operationId: z.string().uuid().nullable(),
  executeStatus: AdActionExecuteStatusSchema,
  /** What the ad center showed, for a finished run. */
  providerOutcome: AdActionProviderOutcomeSchema.nullable(),
  /** The created campaign's ad center id, when it was read. */
  campaignId: z.string().nullable(),
  /** Registry code of a failed run. */
  errorCode: z.string().nullable(),
  /** Why a run failed; null otherwise. */
  errorMessage: z.string().nullable(),
  /** When a succeeded run finished. */
  executedAt: z.coerce.date().nullable(),
});
export type AdActionExecution = z.infer<typeof AdActionExecutionSchema>;

/** `POST /api/ads/campaigns/register`: the approved action and the run it prepared (null if preparing it failed). */
export const AdCampaignRegisterResponseSchema = z.object({
  ok: z.literal(true),
  actionId: z.string().uuid(),
  operationId: z.string().uuid().nullable(),
});
export type AdCampaignRegisterResponse = z.infer<typeof AdCampaignRegisterResponseSchema>;

/**
 * A keyword's latest `pause_keyword` proposal. Once that proposal is rejected
 * the keyword shows none, and an older proposal does not come back. An
 * approved one stays shown until the operator closes it, since the operator
 * pauses the keyword in the ad center (KID-138 decision A).
 */
export const AdKeywordPauseProposalSchema = z.object({
  actionId: z.string().uuid(),
  approvalStatus: z.enum(['pending_review', 'approved']),
  /**
   * Execution word (`AD_ACTION_EXECUTE_STATUSES`). A keyword pause is applied
   * by hand, so its proposal reads `not_prepared` whether it awaits review or
   * stands approved.
   */
  executeStatus: AdActionExecuteStatusSchema,
  /** Why the latest run failed; null otherwise. */
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
  /** The non-search exposure row (`keyword ''`) of one advertised option. */
  nonSearch: z.boolean(),
  status: z.string().nullable(),
  onOff: z.string().nullable(),
  /** Advertised option this keyword is attached to. */
  externalOptionId: z.string().nullable(),
  productName: z.string().nullable(),
  listing: AdListingSummarySchema.nullable(),
  /** The chosen period. */
  period: z.string(),
  /** Measured days this keyword had rows on within the period. */
  windowDays: z.number().int().nonnegative(),
  /** Last measured day this keyword had a row. */
  businessDate: zIsoDate,
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
  /** Search keywords; the non-search row is not counted. */
  keywordCount: z.number().int(),
  /** Search keywords that drew at least one impression in the period. */
  servingCount: z.number().int(),
  irrelevantCount: z.number().int(),
  unjudgedCount: z.number().int(),
  metrics: AdMetricsSchema,
});
export type AdKeywordProductSummary = z.infer<
  typeof AdKeywordProductSummarySchema
>;

export const AdKeywordsDataSchema = z.object({
  period: z.string(),
  /** 측정일 수: 고른 기간 안에서 광고 보고서가 측정한 날 수(달력 일수가 아니다 — 월 기간이어도 측정한 날만 센다). */
  windowDays: z.number().int().nonnegative(),
  collectedAt: z.string().nullable(),
  products: z.array(AdKeywordProductSummarySchema),
  keywords: z.array(AdKeywordSnapshotSchema),
});
export type AdKeywordsData = z.infer<typeof AdKeywordsDataSchema>;

// ───── Measured ad metrics over the ad report ledger ─────
//
// Every row of a measured day carries the report's order count, so a measured
// metric always has a conversion count (KID-372). An unmeasured day has no
// metrics at all (`metrics: null`), never zeros.
const AdBusinessDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const AdMeasuredMetricsSchema = AdMetricsSchema;
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
 * and the newest succeeded Wing item-winner operation for the collection
 * metadata and the Wing KPI sidebar. Legacy `ItemWinner` / `AdSnapshot` are NOT consulted.
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
 *  - `rawSnapshotCount`: rows Wing returned in that operation. Replaces the
 *    legacy `snapshotCount` (which was `AdSnapshot` rows).
 *  - `latestScrapeAt`: that operation's `finishedAt ?? startedAt`.
 *  - `latestScrapePageType`: `itemwinner` when that operation exists.
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
 * collection time. Counts are under advertising / wing buckets respectively.
 */
export const AdCollectStatusSchema = z.object({
  lastCollectedAt: z.union([z.string(), z.date()]).nullable(),
  campaignSnapshotCount: z.number().int(),
  productSnapshotCount: z.number().int(),
});
export type AdCollectStatus = z.infer<typeof AdCollectStatusSchema>;
