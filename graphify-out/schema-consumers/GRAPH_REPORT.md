# Graph Report - schema-consumers  (2026-05-08)

## Corpus Check
- 135 files · ~73,843 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1753 nodes · 6352 edges · 91 communities (87 shown, 4 thin omitted)
- Extraction: 49% EXTRACTED · 51% INFERRED · 0% AMBIGUOUS · INFERRED: 3257 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_code file dev-data-coupang.ts|code file: dev-data-coupang.ts]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_code file ads.ts|code file: ads.ts]]
- [[_COMMUNITY_code file generate-prisma-erd.mjs|code file: generate-prisma-erd.mjs]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_code file order.spec.ts|code file: order.spec.ts]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file dashboard.ts|code file: dashboard.ts]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_code file product.ts|code file: product.ts]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_prisma field ActionTask.targetId|prisma field: ActionTask.targetId]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_prisma field MasterProduct.barcode|prisma field: MasterProduct.barcode]]
- [[_COMMUNITY_code file import-baseline-planner.ts|code file: import-baseline-planner.ts]]
- [[_COMMUNITY_prisma field CategoryMapping.organization|prisma field: CategoryMapping.organization]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_code file coupang-client.ts|code file: coupang-client.ts]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file ProcessingCost.master|code file: ProcessingCost.master]]
- [[_COMMUNITY_prisma field channel-dashboard.pg.integration.spec.ts|prisma field: channel-dashboard.pg.integration.spec.ts]]
- [[_COMMUNITY_prisma field AgentRun.organization|prisma field: AgentRun.organization]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_code file patterns.ts|code file: patterns.ts]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file channel-dashboard.ts|code file: channel-dashboard.ts]]
- [[_COMMUNITY_prisma field Order.organization|prisma field: Order.organization]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_code file common.ts|code file: common.ts]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_prisma field AgentInstance.lifecycleStatus|prisma field: AgentInstance.lifecycleStatus]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_code file reconciliation-action.dto.ts|code file: reconciliation-action.dto.ts]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file inspection.ts|code file: inspection.ts]]
- [[_COMMUNITY_code file readiness.ts|code file: readiness.ts]]
- [[_COMMUNITY_code file login-magiclink.mjs|code file: login-magiclink.mjs]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_code file codes.ts|code file: codes.ts]]
- [[_COMMUNITY_code file coupang-date-range.dto.ts|code file: coupang-date-range.dto.ts]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 202 edges
2. `Inventory` - 165 edges
3. `Organization` - 164 edges
4. `ChannelReconciliationService` - 159 edges
5. `ChannelReconciliationRun` - 156 edges
6. `ChannelSyncService` - 151 edges
7. `prisma — Shared Schema` - 150 edges
8. `channels — Coupang 통합 + Sync + Dashboard 도메인` - 131 edges
9. `ActionTask` - 104 edges
10. `ChannelDashboardService` - 101 edges
11. `ReconciliationRow` - 82 edges
12. `Order` - 81 edges

## Surprising Connections (you probably didn't know these)
- `ReconciliationRow` --references_field--> `AdAction.externalId`  [INFERRED]
  packages/shared/src/schemas/channel-reconciliation.ts → prisma/models/advertising.prisma
- `ChannelReconciliationService` --references_field--> `AdAction.externalId`  [INFERRED]
  apps/server/src/channels/application/service/channel-reconciliation.service.ts → prisma/models/advertising.prisma
- `ChannelSyncService` --references_field--> `AdAction.externalId`  [INFERRED]
  apps/server/src/channels/application/service/channel-sync.service.ts → prisma/models/advertising.prisma
- `ChannelDashboardController` --references_field--> `AdAction.organization`  [INFERRED]
  apps/server/src/channels/adapter/in/http/channel-dashboard.controller.ts → prisma/models/advertising.prisma
- `ChannelSyncController` --references_field--> `AdAction.organization`  [INFERRED]
  apps/server/src/channels/adapter/in/http/channel-sync.controller.ts → prisma/models/advertising.prisma
- `ChannelDashboardService` --references_field--> `AdAction.organization`  [INFERRED]
  apps/server/src/channels/application/service/channel-dashboard.service.ts → prisma/models/advertising.prisma
- `ChannelReconciliationService` --references_field--> `AdAction.organization`  [INFERRED]
  apps/server/src/channels/application/service/channel-reconciliation.service.ts → prisma/models/advertising.prisma
- `ChannelSyncService` --references_field--> `AdAction.organization`  [INFERRED]
  apps/server/src/channels/application/service/channel-sync.service.ts → prisma/models/advertising.prisma

## Communities (91 total, 4 thin omitted)

### Community 0 - "code file: dev-data-coupang.ts"
Cohesion: 0.06
Nodes (106): AdapterCommand, appendFlag(), appendOption(), appendProjectReferenceDefaults(), appendValues(), archiveFileName(), archiveShaFileName(), Args (+98 more)

### Community 1 - "Core schema"
Cohesion: 0.2
Nodes (71): prisma — Shared Schema, CoupangReconciliationRowDto, CoupangReconciliationScanDto, ActivityEvent.organization, AdAction.organization, AgentApprovalRequest.organization, AgentAuthorizationEvent.organization, AgentCostEvent.organization (+63 more)

### Community 2 - "code file: ads.ts"
Cohesion: 0.04
Nodes (53): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot, AdCollectStatus (+45 more)

### Community 3 - "code file: generate-prisma-erd.mjs"
Cohesion: 0.07
Nodes (45): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+37 more)

### Community 4 - "Inventory schema"
Cohesion: 0.06
Nodes (38): externalOptionId canonical option identity, vendorItemId provider term, CSRecord.order, PickingItem.orderId, ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.disposedQty, ReturnTransfer.option (+30 more)

### Community 5 - "Core schema"
Cohesion: 0.06
Nodes (45): AdAction.listing, ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo, ChannelListing.exposureStatus, ChannelListing.freeShipOverAmount (+37 more)

### Community 6 - "code file: order.spec.ts"
Cohesion: 0.05
Nodes (40): OrderActionResponseSchema, OrderListItemSchema, OrderListResponseSchema, OrderStatsResponseSchema, OrderStatusSchema, baseOrderListItem, bundleDir, consumerRoot (+32 more)

### Community 7 - "Supply schema"
Cohesion: 0.05
Nodes (42): Supply, PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.inspectedAt, PurchaseOrder.orderDate (+34 more)

### Community 8 - "Inventory schema"
Cohesion: 0.05
Nodes (39): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.reorderPoint, Inventory.reorderQuantity, Inventory.reservedStock (+31 more)

### Community 9 - "Channels schema"
Cohesion: 0.05
Nodes (38): ChannelReconciliationItem.channelProductName, ChannelReconciliationItem.confidence, ChannelReconciliationItem.ignoredReason, ChannelReconciliationItem.lastObservedAt, ChannelReconciliationItem.linkedListingId, ChannelReconciliationItem.linkedMasterProductId, ChannelReconciliationItem.matchReason, ChannelReconciliationItem.resolutionSource (+30 more)

### Community 10 - "AI schema"
Cohesion: 0.05
Nodes (36): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.measuredAt, Thumbnail.prevClickRate, Thumbnail.status, Thumbnail.strategy (+28 more)

### Community 11 - "Core schema"
Cohesion: 0.06
Nodes (35): Core, BundleComponent.bundleOption, BundleComponent.componentOption, BundleComponent.createdAt, BundleComponent.updatedAt, CategoryMapping.coupangCategoryId, CategoryMapping.createdAt, CategoryMapping.internalCategory (+27 more)

### Community 12 - "AgentOS schema"
Cohesion: 0.06
Nodes (34): AgentRun.adapterType, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt, AgentRun.heartbeatAt (+26 more)

### Community 13 - "code file: dashboard.ts"
Cohesion: 0.06
Nodes (33): AdMetricsDetail, AdMetricsDetailSchema, AlertItemDashboard, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary (+25 more)

### Community 14 - "Core schema"
Cohesion: 0.06
Nodes (34): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.category, MasterProduct.costCny, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description, MasterProduct.detailPageUrl (+26 more)

### Community 15 - "code file: product.ts"
Cohesion: 0.06
Nodes (30): BundleComponentSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, Master, MasterImageItem, MasterImageItemSchema, MasterImageRole, MasterImageRoleSchema (+22 more)

### Community 16 - "Community 16"
Cohesion: 0.1
Nodes (15): ChannelListingHandle, ChannelListingOptionHandle, ChannelReconciliationService, collectIds(), MatchOutcome, OptionLinkBackfillResult, PrismaLike, ProductOptionCandidate (+7 more)

### Community 17 - "Core schema"
Cohesion: 0.16
Nodes (28): channels — Coupang 통합 + Sync + Dashboard 도메인, Database ERD, AdAction.externalId, AgentRun.agentInstance, CategoryMapping.isActive, ChannelAdTargetDailySnapshot.externalId, ChannelAdTargetDailySnapshot.listing, ChannelListing.externalId (+20 more)

### Community 18 - "Finance schema"
Cohesion: 0.07
Nodes (28): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdBy, ManualLedger.description, ManualLedger.memo, ProcessingCost.createdAt (+20 more)

### Community 19 - "Core schema"
Cohesion: 0.08
Nodes (26): ActionTask.assigneeUser, AgentRunRequest.requestedBy, AgentRunRequest.sourceWorkflowRun, OrganizationMembership.invitedBy, ThumbnailGeneration.triggeredByUser, User.avatarUrl, User.createdAt, User.email (+18 more)

### Community 20 - "prisma field: ActionTask.targetId"
Cohesion: 0.09
Nodes (21): ActionTask.targetId, Alert.actionTask, Alert.targetId, Alert.targetType, PanelRunSource, PanelRunSourceSchema, sourceKeys, PanelAlertItem (+13 more)

### Community 21 - "System schema"
Cohesion: 0.08
Nodes (25): Alert.actorUser, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead, Alert.kind, Alert.message (+17 more)

### Community 22 - "Orders schema"
Cohesion: 0.09
Nodes (25): SyncOrdersBodyDto, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.memo (+17 more)

### Community 23 - "prisma field: MasterProduct.barcode"
Cohesion: 0.1
Nodes (19): MasterProduct.barcode, KiditemPlan, normalizeForGroup(), planKiditemImport(), PlannedMaster, PlannedOption, planWingMatches(), WingPlan (+11 more)

### Community 24 - "code file: import-baseline-planner.ts"
Cohesion: 0.1
Nodes (22): row, clean(), HardConflict, NAME_FIELDS, projectWingRow(), rowName(), rowOptionName(), toInt() (+14 more)

### Community 25 - "prisma field: CategoryMapping.organization"
Cohesion: 0.15
Nodes (13): AppException, CategoryMapping.organization, GradeHistory.organization, SalesPlan.organization, ChannelDashboardController, ChannelDashboardService, day, from (+5 more)

### Community 26 - "Core schema"
Cohesion: 0.1
Nodes (23): ProductOption.availableStock, ProductOption.barcode, ProductOption.commissionRate, ProductOption.costPrice, ProductOption.createdAt, ProductOption.deletedAt, ProductOption.isActive, ProductOption.isBundle (+15 more)

### Community 27 - "System schema"
Cohesion: 0.1
Nodes (22): ActionTask.activityLog, ActionTask.apiCall, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.label, ActionTask.notes, ActionTask.organization (+14 more)

### Community 28 - "System schema"
Cohesion: 0.09
Nodes (22): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.installCount, Marketplace.isPublished (+14 more)

### Community 29 - "AgentOS schema"
Cohesion: 0.1
Nodes (21): AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.modelOverride, AgentInstance.name, AgentInstance.parent, AgentInstance.pausedAt, AgentInstance.pauseReason, AgentInstance.promptPathOverride (+13 more)

### Community 30 - "Channels schema"
Cohesion: 0.1
Nodes (19): PickingList.organization, ChannelAccountDailyKpiSnapshot, DeliveryCompanySchema, OrderActionResponse, OrderLineItemSchema, OrderListItem, OrderListLineItem, OrderListLineItemSchema (+11 more)

### Community 31 - "Supply schema"
Cohesion: 0.1
Nodes (19): MasterSupplierProduct.createdAt, MasterSupplierProduct.isPrimary, MasterSupplierProduct.updatedAt, PurchaseOrder.supplier, PurchaseOrderItem.option, SupplierProduct.option, MasterSupplierProduct, SupplierHistoryItem (+11 more)

### Community 32 - "Advertising schema"
Cohesion: 0.11
Nodes (19): AdAction.actionType, AdAction.adTargetDaily, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt, AdAction.currentValue (+11 more)

### Community 33 - "code file: coupang-client.ts"
Cohesion: 0.23
Nodes (16): ChannelsModule, coupangRequest(), generateAuthorization(), getEnvOrThrow(), getVendorId(), CoupangProviderAdapter, approveReturn(), confirmOrderSheets() (+8 more)

### Community 34 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentOS, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decision, AgentAuthorizationEvent.policySnapshot, AgentBlueprintToolPolicy.createdAt, AgentBlueprintToolPolicy.dryRunMode, AgentBlueprintToolPolicy.updatedAt (+10 more)

### Community 35 - "Channels schema"
Cohesion: 0.12
Nodes (18): ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank, ChannelListingDailySnapshot.createdAt (+10 more)

### Community 36 - "Orders schema"
Cohesion: 0.12
Nodes (18): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+10 more)

### Community 37 - "AgentOS schema"
Cohesion: 0.13
Nodes (17): AgentRunRequest.agentInstance, AgentRunRequest.claimedAt, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.createdAt, AgentRunRequest.finishedAt, AgentRunRequest.idempotencyKey, AgentRunRequest.lastErrorCode, AgentRunRequest.maxAttempts (+9 more)

### Community 38 - "AI schema"
Cohesion: 0.15
Nodes (17): ThumbnailGeneration.attemptCount, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.inputMeta, ThumbnailGeneration.organization, ThumbnailGeneration.originalUrl, ThumbnailGeneration.status, ThumbnailGenerationCandidate.height, ThumbnailGenerationEvent.attemptNumber (+9 more)

### Community 39 - "Channels schema"
Cohesion: 0.12
Nodes (17): ChannelScrapeRun.businessDate, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.matchedCount, ChannelScrapeRun.metaJson, ChannelScrapeRun.pageType (+9 more)

### Community 40 - "System schema"
Cohesion: 0.12
Nodes (17): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+9 more)

### Community 41 - "Orders schema"
Cohesion: 0.13
Nodes (17): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.metadata, OrderLineItem.option, OrderLineItem.productName, OrderLineItem.quantity, OrderLineItem.status, OrderLineItem.totalPrice (+9 more)

### Community 42 - "code file: ProcessingCost.master"
Cohesion: 0.12
Nodes (15): ProcessingCost.master, StatisticsCategoryRow, StatisticsCategoryRowSchema, StatisticsDeliveryDaily, StatisticsDeliveryDailySchema, StatisticsDeliveryResponse, StatisticsGradeRow, StatisticsOverview (+7 more)

### Community 43 - "prisma field: channel-dashboard.pg.integration.spec.ts"
Cohesion: 0.12
Nodes (12): ProductOption.organization, Review.organization, byDay, byReason, day15, ids, linkedReturnData, orderData (+4 more)

### Community 44 - "prisma field: AgentRun.organization"
Cohesion: 0.12
Nodes (15): AgentRun.organization, OrderLineItem.organization, AgentApprovalStatus, agentApprovalStatusSchema, AgentCostEventSummary, agentCostEventSummarySchema, agentRunEventSummarySchema, AgentRunnerResult (+7 more)

### Community 45 - "Inventory schema"
Cohesion: 0.14
Nodes (16): StockTransaction.createdBy, StockTransaction.relatedId, StockTransaction.totalCost, StockTransaction.unitCost, StockTransaction.warehouse, Warehouse.address, Warehouse.code, Warehouse.createdAt (+8 more)

### Community 46 - "Orders schema"
Cohesion: 0.15
Nodes (15): OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.metadata, OrderReturn.platform, OrderReturn.reason (+7 more)

### Community 47 - "Advertising schema"
Cohesion: 0.14
Nodes (14): ExecutionLog.createdAt, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionTask.action, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt (+6 more)

### Community 48 - "Orders schema"
Cohesion: 0.14
Nodes (14): Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.listing, Shipment.option, Shipment.shippedAt (+6 more)

### Community 49 - "AgentOS schema"
Cohesion: 0.15
Nodes (13): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.inputTokens, AgentCostEvent.metadata (+5 more)

### Community 50 - "Channels schema"
Cohesion: 0.18
Nodes (12): Channels, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.firstObservedAt, ChannelAdTargetDailySnapshot.sampleCount, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.matchStatus, ChannelScrapeSnapshot.observedAt (+4 more)

### Community 51 - "code file: patterns.ts"
Cohesion: 0.24
Nodes (10): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), scrubDeep(), scrubSecrets(), a, input, now (+2 more)

### Community 52 - "Inventory schema"
Cohesion: 0.18
Nodes (12): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.items, StockAudit.matchedCount, StockAudit.notes (+4 more)

### Community 53 - "Inventory schema"
Cohesion: 0.18
Nodes (12): PickingItem.pickingList, PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.listNumber, PickingList.pickedItems, PickingList.startedAt, PickingList.status (+4 more)

### Community 54 - "AI schema"
Cohesion: 0.18
Nodes (12): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.originalGrade, ThumbnailTracking.originalScore, ThumbnailTracking.reviewsAfter, ThumbnailTracking.salesAfter (+4 more)

### Community 55 - "AgentOS schema"
Cohesion: 0.18
Nodes (11): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.totalCostMicros, AgentRuntimeState.totalInputTokens (+3 more)

### Community 56 - "AgentOS schema"
Cohesion: 0.18
Nodes (11): AgentBlueprint.catalogStatus, AgentBlueprint.createdAt, AgentBlueprint.defaultCapabilities, AgentBlueprint.defaultModel, AgentBlueprint.defaultRuntimeConfig, AgentBlueprint.description, AgentBlueprint.marketplace, AgentBlueprint.promptPath (+3 more)

### Community 57 - "AgentOS schema"
Cohesion: 0.22
Nodes (11): AgentRunRequest.taskSession, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.lastRun, AgentTaskSession.metadata, AgentTaskSession.sessionDisplay, AgentTaskSession.sessionParams (+3 more)

### Community 58 - "code file: channel-dashboard.ts"
Cohesion: 0.18
Nodes (10): ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow, ProductRankingRowSchema, ReturnFaultSplit, ReturnFaultSplitSchema, ReturnReasonRow, ReturnReasonRowSchema (+2 more)

### Community 59 - "prisma field: Order.organization"
Cohesion: 0.2
Nodes (9): Order.organization, Thumbnail.organization, domainOutputDir, fixture, markdown, mermaid, modelsDir, outputPath (+1 more)

### Community 60 - "Orders schema"
Cohesion: 0.2
Nodes (10): CSRecord.assignee, CSRecord.content, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.priority, CSRecord.resolution (+2 more)

### Community 61 - "Finance schema"
Cohesion: 0.2
Nodes (10): GradeHistory.calculatedAt, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.reason, GradeHistory.revenueScore, GradeHistory.score, GradeHistory.velocityScore (+2 more)

### Community 62 - "AI schema"
Cohesion: 0.2
Nodes (10): ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.originalImages, ContentGeneration.processedImages, ContentGeneration.retryCount, ContentGeneration.triggeredByUser (+2 more)

### Community 63 - "code file: common.ts"
Cohesion: 0.2
Nodes (7): ApiErrorResponse, ApiErrorResponseSchema, PaginatedResponse, SyncInfo, SyncInfoSchema, zIsoDate, RangeSchema

### Community 64 - "Advertising schema"
Cohesion: 0.22
Nodes (9): packages/shared — @kiditem/shared, Advertising, AI, ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.url (+1 more)

### Community 65 - "Inventory schema"
Cohesion: 0.22
Nodes (9): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.notes, StockTransfer.quantity, StockTransfer.requestedBy, StockTransfer.toWarehouse, StockTransfer.updatedAt (+1 more)

### Community 66 - "System schema"
Cohesion: 0.22
Nodes (9): System, MigrationCheckpoint.createdAt, MigrationCheckpoint.updatedAt, SystemSetting.createdAt, SystemSetting.updatedAt, MigrationCheckpoint, SystemSetting, MigrationCheckpoint unique(scriptName, stepName, entityKey) (+1 more)

### Community 67 - "AI schema"
Cohesion: 0.22
Nodes (9): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.method, ThumbnailAnalysis.overallScore, ThumbnailAnalysis.qualityAnalyzedAt, ThumbnailAnalysis.recompose, ThumbnailAnalysis.scores, ThumbnailAnalysis.suggestions (+1 more)

### Community 68 - "Inventory schema"
Cohesion: 0.22
Nodes (9): PickingItem.createdAt, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.pickedAt, PickingItem.productName, PickingItem.quantity, PickingItem.verifiedAt (+1 more)

### Community 69 - "Advertising schema"
Cohesion: 0.25
Nodes (8): ExecutionTask.worker, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentUrl, ExecutionWorker.lastHeartbeatAt, ExecutionWorker.metaJson, ExecutionWorker.status, ExecutionWorker

### Community 70 - "Orders schema"
Cohesion: 0.25
Nodes (7): Review.content, Review.createdAt, Review.platform, Review.rating, Review.reviewedAt, Review.reviewerName, Review

### Community 71 - "prisma field: AgentInstance.lifecycleStatus"
Cohesion: 0.29
Nodes (6): AgentInstance.lifecycleStatus, agentRunRequestStatusSchema, agentRunStatusSchema, agentToolPolicyEffectSchema, createAgentRunRequestSchema, parsed

### Community 72 - "Core schema"
Cohesion: 0.29
Nodes (7): OrganizationMembership.createdAt, OrganizationMembership.joinedAt, OrganizationMembership.lastSelectedAt, OrganizationMembership.role, OrganizationMembership.status, OrganizationMembership, OrganizationMembership unique(organizationId, userId)

### Community 73 - "code file: reconciliation-action.dto.ts"
Cohesion: 0.29
Nodes (5): CoupangReconciliationIgnoreDto, CoupangReconciliationLinkDto, RESOLUTION_SOURCES, STATUSES, StatusFilter

### Community 74 - "AgentOS schema"
Cohesion: 0.33
Nodes (6): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decisionReason, AgentApprovalRequest.status, AgentApprovalRequest

### Community 75 - "AI schema"
Cohesion: 0.4
Nodes (6): ThumbnailTrackingDailySnapshot.capturedAt, ThumbnailTrackingDailySnapshot.rawCellTexts, ThumbnailTrackingDailySnapshot.reviewCount, ThumbnailTrackingDailySnapshot.scrapeStatus, ThumbnailTrackingDailySnapshot, ThumbnailTrackingDailySnapshot unique(trackingId, capturedDate)

### Community 76 - "System schema"
Cohesion: 0.33
Nodes (6): FeatureGate.allowedOrganizations, FeatureGate.description, FeatureGate.metadata, FeatureGate.updatedAt, FeatureGate, FeatureGateSchema

### Community 77 - "System schema"
Cohesion: 0.33
Nodes (6): ActivityEvent.createdAt, ActivityEvent.eventType, ActivityEvent.objectId, ActivityEvent.source, ActivityEvent.title, ActivityEvent

### Community 78 - "AgentOS schema"
Cohesion: 0.33
Nodes (6): WorkflowTemplate.createdAt, WorkflowTemplate.description, WorkflowTemplate.marketplace, WorkflowTemplate.triggerType, WorkflowTemplate.version, WorkflowTemplate

### Community 79 - "AgentOS schema"
Cohesion: 0.4
Nodes (5): AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentInstanceToolPolicy, AgentInstanceToolPolicy unique(organizationId, agentInstanceId, toolId)

### Community 80 - "code file: inspection.ts"
Cohesion: 0.4
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 81 - "code file: readiness.ts"
Cohesion: 0.4
Nodes (4): ReadinessCheck, ReadinessCheckSchema, ReadinessResponse, ReadinessResponseSchema

## Knowledge Gaps
- **1069 isolated node(s):** `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority` (+1064 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Core schema` to `code file: dev-data-coupang.ts`, `code file: ads.ts`, `Inventory schema`, `Core schema`, `code file: order.spec.ts`, `Supply schema`, `Inventory schema`, `Channels schema`, `AI schema`, `Core schema`, `AgentOS schema`, `code file: dashboard.ts`, `Core schema`, `code file: product.ts`, `Community 16`, `Core schema`, `Finance schema`, `prisma field: ActionTask.targetId`, `System schema`, `Orders schema`, `prisma field: MasterProduct.barcode`, `prisma field: CategoryMapping.organization`, `Core schema`, `System schema`, `AgentOS schema`, `Channels schema`, `Advertising schema`, `AgentOS schema`, `Channels schema`, `Orders schema`, `AgentOS schema`, `AI schema`, `Channels schema`, `System schema`, `Orders schema`, `prisma field: channel-dashboard.pg.integration.spec.ts`, `prisma field: AgentRun.organization`, `Inventory schema`, `Orders schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `prisma field: Order.organization`, `Orders schema`, `Finance schema`, `AI schema`, `Advertising schema`, `Inventory schema`, `System schema`, `AI schema`, `Advertising schema`, `Orders schema`, `Core schema`, `AgentOS schema`, `AI schema`, `System schema`, `System schema`, `AgentOS schema`, `AgentOS schema`?**
  _High betweenness centrality (0.155) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `Core schema` to `Core schema`, `Inventory schema`, `Core schema`, `Supply schema`, `Inventory schema`, `Channels schema`, `AI schema`, `Core schema`, `AgentOS schema`, `Core schema`, `Finance schema`, `Core schema`, `prisma field: ActionTask.targetId`, `System schema`, `Orders schema`, `prisma field: MasterProduct.barcode`, `prisma field: CategoryMapping.organization`, `Core schema`, `System schema`, `System schema`, `AgentOS schema`, `Channels schema`, `Supply schema`, `Advertising schema`, `AgentOS schema`, `Channels schema`, `Orders schema`, `AgentOS schema`, `AI schema`, `Channels schema`, `System schema`, `Orders schema`, `code file: ProcessingCost.master`, `prisma field: channel-dashboard.pg.integration.spec.ts`, `prisma field: AgentRun.organization`, `Inventory schema`, `Orders schema`, `Advertising schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `prisma field: Order.organization`, `Orders schema`, `Finance schema`, `AI schema`, `Advertising schema`, `Inventory schema`, `System schema`, `AI schema`, `Inventory schema`, `Advertising schema`, `Orders schema`, `Core schema`, `AgentOS schema`, `AI schema`, `System schema`, `System schema`, `AgentOS schema`, `AgentOS schema`?**
  _High betweenness centrality (0.130) - this node is a cross-community bridge._
- **Why does `prisma — Shared Schema` connect `Core schema` to `Inventory schema`, `Core schema`, `Supply schema`, `Inventory schema`, `Channels schema`, `AI schema`, `Core schema`, `AgentOS schema`, `Core schema`, `Core schema`, `Finance schema`, `Core schema`, `System schema`, `Orders schema`, `prisma field: MasterProduct.barcode`, `prisma field: CategoryMapping.organization`, `Core schema`, `System schema`, `System schema`, `AgentOS schema`, `Channels schema`, `Advertising schema`, `AgentOS schema`, `Channels schema`, `Orders schema`, `AgentOS schema`, `AI schema`, `Channels schema`, `System schema`, `Orders schema`, `prisma field: channel-dashboard.pg.integration.spec.ts`, `prisma field: AgentRun.organization`, `Inventory schema`, `Orders schema`, `Advertising schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `prisma field: Order.organization`, `Orders schema`, `Finance schema`, `AI schema`, `Advertising schema`, `System schema`, `Advertising schema`, `Orders schema`, `Core schema`, `AgentOS schema`, `AI schema`, `System schema`, `System schema`, `AgentOS schema`, `AgentOS schema`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Are the 115 inferred relationships involving `Inventory` (e.g. with `Inventory.organization` and `StockTransfer`) actually correct?**
  _`Inventory` has 115 INFERRED edges - model-reasoned connections that need verification._
- **Are the 41 inferred relationships involving `Organization` (e.g. with `Thumbnail` and `ChannelReconciliationRun`) actually correct?**
  _`Organization` has 41 INFERRED edges - model-reasoned connections that need verification._
- **Are the 120 inferred relationships involving `ChannelReconciliationService` (e.g. with `AdAction.organization` and `AdAction.listing`) actually correct?**
  _`ChannelReconciliationService` has 120 INFERRED edges - model-reasoned connections that need verification._
- **Are the 111 inferred relationships involving `ChannelReconciliationRun` (e.g. with `ChannelReconciliationItem.externalId` and `ChannelReconciliationItem.legacyCode`) actually correct?**
  _`ChannelReconciliationRun` has 111 INFERRED edges - model-reasoned connections that need verification._