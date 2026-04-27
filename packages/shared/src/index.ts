// Common
export { PaginatedResponseSchema, ApiErrorResponseSchema, SyncInfoSchema } from './schemas/common.js';
export type { PaginatedResponse, ApiErrorResponse, SyncInfo } from './schemas/common.js';

// Product
export {
  MasterImageRoleSchema,
  MasterImageItemSchema,
  ProductImageRoleSchema, // @deprecated alias — see schemas/product.ts
  ProductImageItemSchema, // @deprecated alias — see schemas/product.ts
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
  ProductImageRole, // @deprecated alias — see schemas/product.ts
  ProductImageItem, // @deprecated alias — see schemas/product.ts
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

// Profit & Loss (Plan B2c.orders — listingId-primary)
export { PLDataSchema } from './schemas/profit-loss.js';
export type { PLData } from './schemas/profit-loss.js';

// Statistics (Plan B2c.orders — listing/master hydrated)
export {
  StatisticsOverviewSchema,
  StatisticsProductRowSchema,
  StatisticsCategoryRowSchema,
  StatisticsGradeRowSchema,
  StatisticsParetoItemSchema,
  StatisticsParetoResponseSchema,
  StatisticsRepurchaseProductSchema,
  StatisticsRepurchaseCustomerSchema,
  StatisticsRepurchaseResponseSchema,
  StatisticsDeliveryDailySchema,
  StatisticsDeliveryResponseSchema,
} from './schemas/statistics.js';
export type {
  StatisticsOverview,
  StatisticsProductRow,
  StatisticsCategoryRow,
  StatisticsGradeRow,
  StatisticsParetoItem,
  StatisticsParetoResponse,
  StatisticsRepurchaseProduct,
  StatisticsRepurchaseCustomer,
  StatisticsRepurchaseResponse,
  StatisticsDeliveryDaily,
  StatisticsDeliveryResponse,
} from './schemas/statistics.js';

// Settlements (Plan B2c.orders — reconcile response)
export {
  SettlementReconcileDetailSchema,
  SettlementReconcileResponseSchema,
} from './schemas/settlements.js';
export type {
  SettlementReconcileDetail,
  SettlementReconcileResponse,
} from './schemas/settlements.js';

// Supplier Stats (Plan B2c.orders — optionId aggregation)
export {
  SupplierSalesRowSchema,
  SupplierProductSalesRowSchema,
} from './schemas/supplier-stats.js';
export type {
  SupplierSalesRow,
  SupplierProductSalesRow,
} from './schemas/supplier-stats.js';

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
export { ConfigurableParamSchema, MarketplaceCatalogItemSchema, WorkflowCatalogItemSchema, AgentCatalogItemSchema } from './schemas/marketplace.js';
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

// Channel Dashboard — Return (ADR-0017, Plan D.2)
export { ReturnSummarySchema } from './schemas/return-summary.js';
export type { ReturnSummary } from './schemas/return-summary.js';

// Channel Dashboard (Plan E.1 T1 — drift guard for channel-dashboard.service.ts)
export {
  ChannelDashboardSummarySchema,
  RevenueTrendPointSchema,
  ProductRankingRowSchema,
  ReturnReasonRowSchema,
  ReturnFaultSplitSchema,
} from './schemas/channel-dashboard.js';
export type {
  ChannelDashboardSummary,
  RevenueTrendPoint,
  ProductRankingRow,
  ReturnReasonRow,
  ReturnFaultSplit,
} from './schemas/channel-dashboard.js';

// Sales Analysis (Plan D.3, ADR-0017)
export { SalesAnalysisDataSchema, ChannelAnalysisSchema } from './schemas/sales-analysis.js';
export type { SalesAnalysisData, ChannelAnalysis } from './schemas/sales-analysis.js';

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

// Alerts
export { AlertItemSchema } from './schemas/alerts.js';
export type { AlertItem } from './schemas/alerts.js';

// Rules
export { RuleItemSchema } from './schemas/rules.js';
export type { RuleItem } from './schemas/rules.js';

// Action Task
export {
  ActionTaskSchema,
  ActionTaskRelatedProductSchema,
  ActionTaskSourceAlertSchema,
  ActionTaskListSchema,
  ActionTaskExecuteResponseSchema,
} from './schemas/action-task.js';
export type {
  ActionTask,
  ActionTaskRelatedProduct,
  ActionTaskSourceAlert,
  ActionTaskList,
  ActionTaskExecuteResponse,
} from './schemas/action-task.js';

// Inspection
export { InspectionItemSchema, InspectionResultSchema } from './schemas/inspection.js';
export type { InspectionItem, InspectionResult } from './schemas/inspection.js';


// Feature Gate
export { FeatureGateSchema } from './schemas/feature-gate.js';
export type { FeatureGate } from './schemas/feature-gate.js';

// Agent Workflow
export { WorkflowStepSchema, AgentWorkflowSchema, WorkflowYieldSchema } from './schemas/agent-workflow.js';
export type { WorkflowStep, AgentWorkflow, WorkflowYield } from './schemas/agent-workflow.js';

// Errors
export { ErrorCodes } from './errors/codes.js';
export { AppException } from './errors/app-exception.js';

// Security
export { scrubSecrets, scrubDeep, REDACTED_PLACEHOLDER, SECRET_PATTERNS, SENSITIVE_FIELD_KEYS } from './security/index.js';

// Panel
export * from './panel/index.js';
