// @kiditem/shared root barrel — compatibility surface only.
//
// All consumers under apps/server/src and apps/web/src use subpath imports
// (e.g. `@kiditem/shared/product`, `@kiditem/shared/errors`,
// `@kiditem/shared/security`). The root barrel is
// frozen by `scripts/check-shared-root-imports.sh` and is being shrunk in
// batches per the Reconstruction Export Policy in packages/shared/CLAUDE.md.
// Do NOT add new exports here — register a new subpath in
// `packages/shared/package.json` instead.

// Common
export { PaginatedResponseSchema, ApiErrorResponseSchema, SyncInfoSchema } from './schemas/common.js';
export type { PaginatedResponse, ApiErrorResponse, SyncInfo } from './schemas/common.js';

// Product
export {
  MasterImageRoleSchema,
  MasterImageItemSchema,
  GetMasterImagesResponseSchema,
  UpdateMasterImagesRequestSchema,
  UploadMasterImageResponseSchema,
} from './schemas/product.js';
export type {
  MasterImageRole,
  MasterImageItem,
  GetMasterImagesResponse,
  UpdateMasterImagesRequest,
  UploadMasterImageResponse,
} from './schemas/product.js';

// Order (Plan A.5 — channel-agnostic; W3 — UI-ready response schemas)
export {
  OrderSchema,
  OrderLineItemSchema,
  OrderPlatformSchema,
  OrderStatusSchema,
  OrderPipelineStatusSchema,
  OrderListLineItemSchema,
  OrderListItemSchema,
  OrderListResponseSchema,
  OrderStatsResponseSchema,
  OrderActionResponseSchema,
  OrderPipelineResponseSchema,
} from './schemas/order.js';
export type {
  Order,
  OrderLineItem,
  OrderPlatform,
  OrderStatus,
  OrderPipelineStatus,
  OrderListLineItem,
  OrderListItem,
  OrderListResponse,
  OrderStatsResponse,
  OrderActionResponse,
  OrderPipelineResponse,
} from './schemas/order.js';

// Dashboard
export {
  DashboardSalesSummarySchema,
  DashboardAdSummarySchema,
  DashboardInventorySummarySchema,
  DashboardTrendItemSchema,
  // shared building blocks
  DashboardAlertItemSchema,
  TopProductSchema,
  ProfitBreakdownSchema,
  TrafficKpiSchema,
  AdMetricsDetailSchema,
  IndustryBenchmarkSchema,
  PlanAchievementSchema,
  MonthlyTrendItemSchema,
  DailyRevenueItemSchema,
  DailyAdItemSchema,
  GradeChangesSchema,
  WarningsSchema,
} from './schemas/dashboard.js';
export type {
  DashboardSalesSummary,
  DashboardAdSummary,
  DashboardInventorySummary,
  DashboardTrendItem,
  DashboardAlertItem,
  TopProduct,
  ProfitBreakdown,
  TrafficKpi,
  AdMetricsDetail,
  IndustryBenchmark,
  PlanAchievement,
  MonthlyTrendItem,
  DailyRevenueItem,
  DailyAdItem,
  GradeChanges,
  Warnings,
} from './schemas/dashboard.js';

// Reviews
export {
  ReviewFilterSchema,
  ReviewListItemSchema,
  ReviewListResponseSchema,
  ReviewSummarySchema,
} from './schemas/reviews.js';
export type {
  ReviewFilter,
  ReviewListItem,
  ReviewListResponse,
  ReviewSummary,
} from './schemas/reviews.js';

// Thumbnails
export {
  ThumbnailScoresSchema,
  ComplianceScoresSchema,
  ImageSpecSchema,
  ImageSpecIssueSchema,
  ThumbnailAnalysisResultSchema,
  ThumbnailAnalysisSummarySchema,
  ThumbnailAnalysisListResponseSchema,
  ThumbnailGenerationItemSchema,
  ThumbnailGenerationListResponseSchema,
  ThumbnailTrackingRecordSchema,
  ThumbnailTrackingListResponseSchema,
  UpdateThumbnailTrackingMetricsSchema,
  EditAnalysisResultSchema,
  RecomposeVariantOptionSchema,
  RecomposeVariantClassificationSchema,
  RECOMPOSE_VARIANT_KEYS,
  RECOMPOSE_KINDS,
  THUMBNAIL_PHASES,
  THUMBNAIL_TRACKING_STATUSES,
} from './schemas/thumbnails.js';
export type {
  ThumbnailScores,
  ComplianceScores,
  ImageSpec,
  ImageSpecIssue,
  ThumbnailAnalysisResult,
  ThumbnailAnalysisSummary,
  ThumbnailAnalysisListResponse,
  ThumbnailGenerationItem,
  ThumbnailGenerationListResponse,
  ThumbnailTrackingRecord,
  ThumbnailTrackingListResponse,
  UpdateThumbnailTrackingMetrics,
  EditAnalysisResult,
  RecomposeVariantOption,
  RecomposeVariantClassification,
  RecomposeVariantKey,
  RecomposeKind,
  ThumbnailPhase,
  ThumbnailTrackingStatus,
} from './schemas/thumbnails.js';

// Ads (Plan B2b — listingId-primary)
export {
  AdListingSummarySchema,
  AdMetricsSchema,
  AdsListItemSchema,
  AdsHubSummarySchema,
  AdsHubDataSchema,
  FindAllAdsResponseSchema,
  AdCampaignSnapshotSchema,
  AdProductSnapshotSchema,
  AdTrendsDataSchema,
  AdStrategyActionSchema,
  AdTop20ItemSchema,
  AdIssuesSchema,
  AdRulesDataSchema,
  AdStrategyPlanSchema,
  AdWeeklyPlanSchema,
  AdStrategyRecommendationSchema,
  AdBenchmarkDataSchema,
  ChannelStateSignalSchema,
  ChannelOptionStateSignalSchema,
  AdExtensionStatusSchema,
  AdCollectStatusSchema,
} from './schemas/ads.js';
export type {
  AdListingSummary,
  AdMetrics,
  AdsListItem,
  AdsHubSummary,
  AdsHubData,
  AdsSummary,
  FindAllAdsResponse,
  AdCampaignSnapshot,
  AdProductSnapshot,
  AdTrendsData,
  AdStrategyAction,
  AdTop20Item,
  AdIssues,
  AdRulesData,
  AdStrategyPlan,
  AdWeeklyPlan,
  AdStrategyRecommendation,
  AdBenchmarkData,
  ChannelStateSignal,
  ChannelOptionStateSignal,
  AdExtensionStatus,
  AdCollectStatus,
} from './schemas/ads.js';
