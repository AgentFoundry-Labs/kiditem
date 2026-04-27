import { z } from 'zod';

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
  tier: z.string().nullable(),
  adTier: z.string().nullable(),
}));
export type AdsListItem = z.infer<typeof AdsListItemSchema>;

export const AdsHubSummarySchema = z.object({
  totalSpend: z.number().int(),
  totalRevenue: z.number().int(),
  totalRoas: z.number().nullable(),
  gradeSpend: z.record(z.enum(['A', 'B', 'C']), z.number().int()),
  tierSpend: z.record(z.string(), z.number().int()),
  gradeSpendPercent: z.record(z.enum(['A', 'B', 'C']), z.number()),
});
export type AdsHubSummary = z.infer<typeof AdsHubSummarySchema>;
export type AdsSummary = AdsHubSummary;

export const AdsHubDataSchema = z.object({
  products: z.array(AdsListItemSchema),
  summary: AdsHubSummarySchema,
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

export const AdCampaignSnapshotSchema = z.object({
  listing: AdListingSummarySchema,
  campaignId: z.string().nullable(),
  campaignName: z.string().nullable(),
  period: z.string(),
  metrics: AdMetricsSchema,
});
export type AdCampaignSnapshot = z.infer<typeof AdCampaignSnapshotSchema>;

export const AdProductSnapshotSchema = z.object({
  listing: AdListingSummarySchema,
  period: z.string(),
  metrics: AdMetricsSchema,
});
export type AdProductSnapshot = z.infer<typeof AdProductSnapshotSchema>;

export const AdTrendsDataSchema = z.object({
  daily: z.array(z.object({
    date: z.string(),
    metrics: AdMetricsSchema,
  })),
  firstHalf: AdMetricsSchema,
  secondHalf: AdMetricsSchema,
  gradeBudget: z.record(z.enum(['A', 'B', 'C']), z.number().int()),
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

export const AdTop20ItemSchema = z.object({
  listing: AdListingSummarySchema,
  grade: z.enum(['A', 'B', 'C']).nullable(),
  rank: z.number().int(),
  metrics: AdMetricsSchema,
});
export type AdTop20Item = z.infer<typeof AdTop20ItemSchema>;

export const AdTierAnalysisSchema = z.object({
  tier: z.string(),
  count: z.number().int(),
  spend: z.number().int(),
  revenue: z.number().int(),
  roas: z.number().nullable(),
});
export type AdTierAnalysis = z.infer<typeof AdTierAnalysisSchema>;

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
  tierAnalysis: z.array(AdTierAnalysisSchema),
  top20: z.array(AdTop20ItemSchema),
});
export type AdStrategyPlan = z.infer<typeof AdStrategyPlanSchema>;

export const AdWeeklyPlanSchema = AdStrategyPlanSchema.extend({
  week: z.object({ start: z.string(), end: z.string() }),
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
 * and `ChannelAccountDailyKpiSnapshot(source='wing', kpiType='wing_itemwinner_kpi')`
 * for Wing KPI sidebar. Legacy `ItemWinner` / `AdSnapshot` are NOT consulted.
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

// ───── Exposure Analysis ─────

export const ExposureFactorScoreSchema = z.object({
  factor: z.string(),
  score: z.number(),
  weight: z.number(),
});
export type ExposureFactorScore = z.infer<typeof ExposureFactorScoreSchema>;

export const ExposureProductScoreSchema = z.object({
  listing: AdListingSummarySchema,
  grade: z.enum(['A', 'B', 'C']).nullable(),
  factors: z.array(ExposureFactorScoreSchema),
  totalScore: z.number(),
  topIssue: z.string().nullable(),
});
export type ExposureProductScore = z.infer<typeof ExposureProductScoreSchema>;

export const ExposureUrgentActionSchema = z.object({
  listing: AdListingSummarySchema,
  grade: z.enum(['A', 'B', 'C']).nullable(),
  issue: z.string(),
  suggestedAction: z.string(),
});
export type ExposureUrgentAction = z.infer<typeof ExposureUrgentActionSchema>;

export const ExposureAnalysisDataSchema = z.object({
  scores: z.array(ExposureProductScoreSchema),
  urgentActions: z.array(ExposureUrgentActionSchema),
});
export type ExposureAnalysisData = z.infer<typeof ExposureAnalysisDataSchema>;
