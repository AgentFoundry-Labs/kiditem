// @kiditem/shared/schemas barrel — compatibility surface only.
//
// All consumers under apps/server/src and apps/web/src use domain subpath
// imports (e.g. `@kiditem/shared/product`, `@kiditem/shared/order`,
// `@kiditem/shared/inventory`). This `schemas` barrel exists to keep
// pre-Phase 2 archived recipes resolvable. Do NOT add new exports here —
// register a new subpath in `packages/shared/package.json` instead. See the
// Reconstruction Export Policy in packages/shared/CLAUDE.md.

// Common
export { PaginatedResponseSchema, ApiErrorResponseSchema, SyncInfoSchema, zIsoDate } from './common.js';
export type { PaginatedResponse, ApiErrorResponse, SyncInfo } from './common.js';

// Product
export {
  MasterImageRoleSchema,
  MasterImageItemSchema,
  GetMasterImagesResponseSchema,
  UpdateMasterImagesRequestSchema,
  UploadMasterImageResponseSchema,
} from './product.js';
export type {
  MasterImageRole,
  MasterImageItem,
  GetMasterImagesResponse,
  UpdateMasterImagesRequest,
  UploadMasterImageResponse,
} from './product.js';

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
} from './order.js';
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
} from './order.js';

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
} from './dashboard.js';
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
} from './dashboard.js';

// Reviews
export {
  ReviewFilterSchema,
  ReviewListItemSchema,
  ReviewListResponseSchema,
  ReviewSummarySchema,
} from './reviews.js';
export type {
  ReviewFilter,
  ReviewListItem,
  ReviewListResponse,
  ReviewSummary,
} from './reviews.js';

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
} from './thumbnails.js';
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
} from './thumbnails.js';

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
} from './ads.js';
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
} from './ads.js';
