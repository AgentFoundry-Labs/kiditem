// @kiditem/shared/schemas barrel — compatibility surface only.
//
// All consumers under apps/server/src and apps/web/src use domain subpath
// imports (e.g. `@kiditem/shared/product`, `@kiditem/shared/order`,
// `@kiditem/shared/inventory`). This `schemas` barrel exists to keep
// pre-Phase 2 archived recipes resolvable. Do NOT add new exports here —
// register a new subpath in `packages/shared/package.json` instead. See the
// Reconstruction Export Policy in packages/shared/AGENTS.md.

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
} from './product.js';
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
} from './product.js';

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
} from './order.js';
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
} from './order.js';

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
} from './inventory.js';
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
} from './inventory.js';

// Workflow
export { WorkflowTemplateSchema, WorkflowRunSchema, WorkflowStepRunSchema } from './workflow.js';
export type { WorkflowTemplate, WorkflowRun, WorkflowStepRun } from './workflow.js';

// Agent
export {
  AgentSchema,
  AgentListItemSchema,
  HeartbeatRunSchema,
  AgentRuntimeStateSchema,
  DailyCostSchema,
  AgentCostSummarySchema,
  CostAnalyticsSchema,
} from './agent.js';
export type {
  Agent,
  AgentListItem,
  HeartbeatRun,
  AgentRuntimeState,
  DailyCost,
  AgentCostSummary,
  CostAnalytics,
} from './agent.js';

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
} from './agent-trace.js';
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
} from './agent-trace.js';

// Marketplace
export { ConfigurableParamSchema, MarketplaceCatalogItemSchema } from './marketplace.js';
export type { ConfigurableParam, MarketplaceCatalogItem, WorkflowCatalogItem, AgentCatalogItem } from './marketplace.js';

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
} from './dashboard.js';
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
} from './thumbnails.js';
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
} from './ads.js';

// Action Task
export {
  ActionTaskSchema,
  ActionTaskRelatedProductSchema,
  ActionTaskSourceAlertSchema,
  ActionTaskListSchema,
} from './action-task.js';
export type {
  ActionTask,
  ActionTaskRelatedProduct,
  ActionTaskSourceAlert,
  ActionTaskList,
  ActionTaskExecuteResponse,
} from './action-task.js';
