// @kiditem/shared root barrel — compatibility surface only.
//
// All consumers under apps/server/src and apps/web/src use subpath imports
// (e.g. `@kiditem/shared/product`, `@kiditem/shared/errors`,
// `@kiditem/shared/security`, `@kiditem/shared/panel`). The root barrel is
// frozen by `scripts/check-shared-root-imports.sh` and is being shrunk in
// batches per `docs/superpowers/plans/2026-04-29-shared-root-barrel-shrink.md`.
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
  MoneyRangeSchema,
  MasterSchema,
  ProductOptionSchema,
  BundleComponentSchema,
  MasterWithOptionsSchema,
  OptionWithComponentsSchema,
  ProductCatalogListItemSchema,
  ProductCatalogDetailSchema,
  ProductCatalogCountsSchema,
  ProductCatalogListResponseSchema,
} from './schemas/product.js';
export type {
  MasterImageRole,
  MasterImageItem,
  GetMasterImagesResponse,
  UpdateMasterImagesRequest,
  UploadMasterImageResponse,
  MoneyRange,
  Master,
  ProductOption,
  BundleComponent,
  MasterWithOptions,
  OptionWithComponents,
  ProductCatalogListItem,
  ProductCatalogDetail,
  ProductCatalogCounts,
  ProductCatalogListResponse,
} from './schemas/product.js';

// Order (Plan A.5 — channel-agnostic; W3 — UI-ready response schemas)
export {
  OrderSchema,
  OrderLineItemSchema,
  OrderReturnSchema,
  OrderReturnLineItemSchema,
  OrderPlatformSchema,
  OrderReturnTypeSchema,
  OrderStatusSchema,
  OrderPipelineStatusSchema,
  OrderListLineItemSchema,
  DeliveryCompanySchema,
  OrderListItemSchema,
  OrderListResponseSchema,
  OrderStatsResponseSchema,
  OrderActionResponseSchema,
  OrderPipelineResponseSchema,
} from './schemas/order.js';
export type {
  Order,
  OrderLineItem,
  OrderReturn,
  OrderReturnLineItem,
  OrderPlatform,
  OrderReturnType,
  OrderStatus,
  OrderPipelineStatus,
  OrderListLineItem,
  DeliveryCompany,
  OrderListItem,
  OrderListResponse,
  OrderStatsResponse,
  OrderActionResponse,
  OrderPipelineResponse,
} from './schemas/order.js';

// Inventory
export {
  InventorySchema,
  InventoryStatusSchema,
  InventoryListItemSchema,
  InventorySummarySchema,
  InventoryListResponseSchema,
  StockTransactionTypeSchema,
  StockTransactionSchema,
  StockOperationResultSchema,
  TransactionListItemSchema,
  TransactionListResponseSchema,
  TransactionSummarySchema,
  ReceiveStockInputSchema,
  IssueStockInputSchema,
  AdjustStockInputSchema,
  UpdateInventoryMetadataInputSchema,
} from './schemas/inventory.js';
export type {
  Inventory,
  InventoryStatus,
  InventoryListItem,
  InventorySummary,
  InventoryListResponse,
  StockTransactionType,
  StockTransaction,
  StockOperationResult,
  TransactionListItem,
  TransactionListResponse,
  TransactionSummary,
  ReceiveStockInput,
  IssueStockInput,
  AdjustStockInput,
  UpdateInventoryMetadataInput,
} from './schemas/inventory.js';

// Workflow
export { WorkflowTemplateSchema, WorkflowRunSchema, WorkflowStepRunSchema } from './schemas/workflow.js';
export type { WorkflowTemplate, WorkflowRun, WorkflowStepRun } from './schemas/workflow.js';

// Agent
export {
  AgentSchema,
  AgentListItemSchema,
  HeartbeatRunSchema,
  AgentRuntimeStateSchema,
  DailyCostSchema,
  AgentCostSummarySchema,
  CostAnalyticsSchema,
} from './schemas/agent.js';
export type {
  Agent,
  AgentListItem,
  HeartbeatRun,
  AgentRuntimeState,
  DailyCost,
  AgentCostSummary,
  CostAnalytics,
} from './schemas/agent.js';

// Agent Trace
export {
  AgentTaskSchema,
  WorkflowRunTraceSchema,
  AgentWakeupRequestSchema,
  AgentEventSchema,
  AgentLogSchema,
  TraceabilitySchema,
  TracePaginationSchema,
  AgentTraceSchema,
  AgentTaskListResponseSchema,
} from './schemas/agent-trace.js';
export type {
  AgentTask,
  WorkflowRunTrace,
  AgentWakeupRequest,
  AgentEvent,
  AgentLog,
  Traceability,
  TracePagination,
  AgentTrace,
  AgentTaskListResponse,
} from './schemas/agent-trace.js';

// Marketplace
export { ConfigurableParamSchema, MarketplaceCatalogItemSchema } from './schemas/marketplace.js';
export type { ConfigurableParam, MarketplaceCatalogItem, WorkflowCatalogItem, AgentCatalogItem } from './schemas/marketplace.js';

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
  DataFreshnessSchema,
  MonthlyTrendItemSchema,
  DailyRevenueItemSchema,
  DailyAdItemSchema,
  GradeChangesSchema,
  WarningsSchema,
  WingAdSummarySchema,
} from './schemas/dashboard.js';
export type {
  DashboardSalesSummary,
  DashboardAdSummary,
  DashboardInventorySummary,
  DashboardTrendItem,
  AlertItemDashboard,
  TopProduct,
  ProfitBreakdown,
  TrafficKpi,
  AdMetricsDetail,
  IndustryBenchmark,
  PlanAchievement,
  DataFreshness,
  MonthlyTrendItem,
  DailyRevenueItem,
  DailyAdItem,
  GradeChanges,
  Warnings,
  WingAdSummary,
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
  ThumbnailListItemSchema,
  ThumbnailSummarySchema,
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
  THUMBNAIL_REGISTRATION_STATUSES,
  THUMBNAIL_TRACKING_STATUSES,
} from './schemas/thumbnails.js';
export type {
  ThumbnailListItem,
  ThumbnailSummary,
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
  UpdateThumbnailTrackingMetricsInput,
  EditAnalysisResult,
  RecomposeVariantOption,
  RecomposeVariantClassification,
  RecomposeVariantKey,
  RecomposeKind,
  ThumbnailPhase,
  ThumbnailRegistrationStatus,
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
  AdTierAnalysisSchema,
  AdIssuesSchema,
  AdRulesDataSchema,
  AdStrategyPlanSchema,
  AdWeeklyPlanSchema,
  AdStrategyRecommendationSchema,
  AdBenchmarkDataSchema,
  ExposureFactorScoreSchema,
  ExposureProductScoreSchema,
  ExposureUrgentActionSchema,
  ExposureAnalysisDataSchema,
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
  AdTierAnalysis,
  AdIssues,
  AdRulesData,
  AdStrategyPlan,
  AdWeeklyPlan,
  AdStrategyRecommendation,
  AdBenchmarkData,
  ExposureFactorScore,
  ExposureProductScore,
  ExposureUrgentAction,
  ExposureAnalysisData,
  ChannelStateSignal,
  ChannelOptionStateSignal,
  AdExtensionStatus,
  AdCollectStatus,
} from './schemas/ads.js';

// Action Task
export {
  ActionTaskSchema,
  ActionTaskRelatedProductSchema,
  ActionTaskSourceAlertSchema,
  ActionTaskListSchema,
} from './schemas/action-task.js';
export type {
  ActionTask,
  ActionTaskRelatedProduct,
  ActionTaskSourceAlert,
  ActionTaskList,
  ActionTaskExecuteResponse,
} from './schemas/action-task.js';
