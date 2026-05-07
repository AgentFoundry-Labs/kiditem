# Graph Report - schema-consumers  (2026-05-07)

## Corpus Check
- 134 files · ~72,876 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1235 nodes · 5554 edges · 57 communities (56 shown, 1 thin omitted)
- Extraction: 43% EXTRACTED · 57% INFERRED · 0% AMBIGUOUS · INFERRED: 3141 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_code file dev-data-coupang.ts|code file: dev-data-coupang.ts]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file generate-prisma-erd.mjs|code file: generate-prisma-erd.mjs]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_code file coupang-client.ts|code file: coupang-client.ts]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_code file patterns.ts|code file: patterns.ts]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file coupang-date-range.dto.ts|code file: coupang-date-range.dto.ts]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 200 edges
2. `Organization` - 161 edges
3. `prisma — Shared Schema` - 148 edges
4. `ChannelReconciliationService` - 141 edges
5. `ChannelSyncService` - 141 edges
6. `Inventory` - 135 edges
7. `ChannelReconciliationRun` - 129 edges
8. `channels — Coupang 통합 + Sync + Dashboard 도메인` - 129 edges
9. `ActionTask` - 95 edges
10. `ChannelDashboardService` - 90 edges
11. `Order` - 81 edges
12. `ChannelDashboardController` - 78 edges

## Surprising Connections (you probably didn't know these)
- `ChannelReconciliationService` --references_field--> `AdAction.externalId`  [INFERRED]
  apps/server/src/channels/application/service/channel-reconciliation.service.ts → prisma/models/advertising.prisma
- `ChannelSyncService` --references_field--> `AdAction.externalId`  [INFERRED]
  apps/server/src/channels/application/service/channel-sync.service.ts → prisma/models/advertising.prisma
- `ChannelReconciliationService` --references_field--> `AdAction.organization`  [INFERRED]
  apps/server/src/channels/application/service/channel-reconciliation.service.ts → prisma/models/advertising.prisma
- `ChannelSyncService` --references_field--> `AdAction.organization`  [INFERRED]
  apps/server/src/channels/application/service/channel-sync.service.ts → prisma/models/advertising.prisma
- `ChannelReconciliationService` --references_field--> `AdAction.listing`  [INFERRED]
  apps/server/src/channels/application/service/channel-reconciliation.service.ts → prisma/models/advertising.prisma
- `ChannelSyncService` --references_field--> `AdAction.listing`  [INFERRED]
  apps/server/src/channels/application/service/channel-sync.service.ts → prisma/models/advertising.prisma
- `ChannelReconciliationService` --references_field--> `ScrapeTarget.isActive`  [INFERRED]
  apps/server/src/channels/application/service/channel-reconciliation.service.ts → prisma/models/advertising.prisma
- `ChannelReconciliationService` --references_field--> `ScrapeTarget.organization`  [INFERRED]
  apps/server/src/channels/application/service/channel-reconciliation.service.ts → prisma/models/advertising.prisma

## Communities (57 total, 1 thin omitted)

### Community 0 - "Channels schema"
Cohesion: 0.13
Nodes (139): CoupangReconciliationRowDto, CoupangReconciliationScanDto, ActionTask.activityLog, ActionTask.apiCall, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.label (+131 more)

### Community 1 - "code file: dev-data-coupang.ts"
Cohesion: 0.06
Nodes (97): appendFlag(), appendOption(), appendProjectReferenceDefaults(), appendValues(), archiveFileName(), archiveShaFileName(), assertSafeRelativePath(), bool() (+89 more)

### Community 2 - "Core schema"
Cohesion: 0.08
Nodes (55): externalOptionId canonical option identity, vendorItemId provider term, AdAction.externalId, AdAction.listing, ChannelAdTargetDailySnapshot.externalId, ChannelAdTargetDailySnapshot.listing, ChannelListing.channelPrice, ChannelListing.createdAt (+47 more)

### Community 3 - "Orders schema"
Cohesion: 0.12
Nodes (34): channels — Coupang 통합 + Sync + Dashboard 도메인, Database ERD, CategoryMapping.isActive, ChannelListing.master, ChannelListingOption.isUnmatched, ChannelReconciliationItem.legacyCode, MasterProduct.barcode, MasterProduct.isDeleted (+26 more)

### Community 4 - "code file: generate-prisma-erd.mjs"
Cohesion: 0.08
Nodes (38): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), extractDocValue(), extractRelationFields(), generateDomainErdMarkdown(), generateErdMarkdown() (+30 more)

### Community 5 - "Channels schema"
Cohesion: 0.06
Nodes (36): Channels, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank (+28 more)

### Community 6 - "Core schema"
Cohesion: 0.06
Nodes (35): Core, BundleComponent.bundleOption, BundleComponent.componentOption, BundleComponent.createdAt, BundleComponent.updatedAt, CategoryMapping.coupangCategoryId, CategoryMapping.createdAt, CategoryMapping.internalCategory (+27 more)

### Community 7 - "Supply schema"
Cohesion: 0.06
Nodes (36): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.inspectedAt, PurchaseOrder.orderDate, PurchaseOrder.receivedAt (+28 more)

### Community 8 - "AgentOS schema"
Cohesion: 0.06
Nodes (34): AgentRun.adapterType, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt, AgentRun.heartbeatAt (+26 more)

### Community 9 - "Core schema"
Cohesion: 0.06
Nodes (34): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.category, MasterProduct.costCny, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description, MasterProduct.detailPageUrl (+26 more)

### Community 10 - "Supply schema"
Cohesion: 0.08
Nodes (27): Supply, GradeHistory.calculatedAt, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.reason, GradeHistory.revenueScore, GradeHistory.score (+19 more)

### Community 11 - "System schema"
Cohesion: 0.08
Nodes (28): prisma — Shared Schema, System, ActivityEvent.createdAt, ActivityEvent.eventType, ActivityEvent.objectId, ActivityEvent.source, ActivityEvent.title, AgentRun.agentInstance (+20 more)

### Community 12 - "System schema"
Cohesion: 0.07
Nodes (24): AgentBlueprint.marketplace, Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.installCount (+16 more)

### Community 13 - "Finance schema"
Cohesion: 0.07
Nodes (28): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdBy, ManualLedger.description, ManualLedger.memo, ProcessingCost.createdAt (+20 more)

### Community 14 - "Orders schema"
Cohesion: 0.08
Nodes (26): SyncOrdersBodyDto, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.memo (+18 more)

### Community 15 - "AgentOS schema"
Cohesion: 0.09
Nodes (24): ActionTask.assigneeUser, AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decisionReason, AgentApprovalRequest.status, AgentRunRequest.requestedBy, OrganizationMembership.invitedBy (+16 more)

### Community 16 - "AgentOS schema"
Cohesion: 0.09
Nodes (23): AgentOS, AgentBlueprint.catalogStatus, AgentBlueprint.createdAt, AgentBlueprint.defaultCapabilities, AgentBlueprint.defaultModel, AgentBlueprint.defaultRuntimeConfig, AgentBlueprint.description, AgentBlueprint.promptPath (+15 more)

### Community 17 - "AgentOS schema"
Cohesion: 0.1
Nodes (21): AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decision, AgentAuthorizationEvent.policySnapshot, AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.lifecycleStatus, AgentInstance.modelOverride (+13 more)

### Community 18 - "Inventory schema"
Cohesion: 0.1
Nodes (21): PickingItem.createdAt, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.pickedAt, PickingItem.pickingList, PickingItem.productName, PickingItem.quantity (+13 more)

### Community 19 - "Inventory schema"
Cohesion: 0.12
Nodes (20): Shipment.warehouse, StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.notes, StockTransfer.quantity, StockTransfer.requestedBy, StockTransfer.toWarehouse (+12 more)

### Community 20 - "System schema"
Cohesion: 0.15
Nodes (14): ActionTask.targetId, AdAction.targetType, Alert.actionTask, Alert.createdAt, Alert.id, Alert.isRead, Alert.message, Alert.severity (+6 more)

### Community 21 - "Core schema"
Cohesion: 0.12
Nodes (20): ProductOption.availableStock, ProductOption.barcode, ProductOption.commissionRate, ProductOption.costPrice, ProductOption.createdAt, ProductOption.deletedAt, ProductOption.isBundle, ProductOption.isTemporary (+12 more)

### Community 22 - "Community 22"
Cohesion: 0.18
Nodes (3): AppException, ChannelReconciliationService, collectIds()

### Community 23 - "Advertising schema"
Cohesion: 0.11
Nodes (18): AdAction.actionType, AdAction.adTargetDaily, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt, AdAction.currentValue (+10 more)

### Community 24 - "AgentOS schema"
Cohesion: 0.12
Nodes (17): AgentRunRequest.agentInstance, AgentRunRequest.claimedAt, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.createdAt, AgentRunRequest.finishedAt, AgentRunRequest.idempotencyKey, AgentRunRequest.lastErrorCode, AgentRunRequest.maxAttempts (+9 more)

### Community 25 - "Orders schema"
Cohesion: 0.12
Nodes (18): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+10 more)

### Community 26 - "System schema"
Cohesion: 0.12
Nodes (17): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+9 more)

### Community 27 - "Inventory schema"
Cohesion: 0.18
Nodes (13): CSRecord.order, PickingItem.orderId, ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.disposedQty, ReturnTransfer.processedBy, ReturnTransfer.quantity, ReturnTransfer.restockedQty (+5 more)

### Community 28 - "Orders schema"
Cohesion: 0.15
Nodes (15): OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.metadata, OrderReturn.platform, OrderReturn.reason (+7 more)

### Community 29 - "Advertising schema"
Cohesion: 0.14
Nodes (14): ExecutionLog.createdAt, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionTask.action, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt (+6 more)

### Community 30 - "code file: coupang-client.ts"
Cohesion: 0.33
Nodes (11): ChannelsModule, coupangRequest(), generateAuthorization(), getEnvOrThrow(), getVendorId(), CoupangProviderAdapter, approveReturn(), confirmOrderSheets() (+3 more)

### Community 31 - "AgentOS schema"
Cohesion: 0.15
Nodes (13): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.inputTokens, AgentCostEvent.metadata (+5 more)

### Community 32 - "Orders schema"
Cohesion: 0.15
Nodes (10): CoupangReconciliationIgnoreDto, CoupangReconciliationLinkDto, Review.content, Review.createdAt, Review.id, Review.platform, Review.rating, Review.reviewedAt (+2 more)

### Community 33 - "Inventory schema"
Cohesion: 0.18
Nodes (12): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.items, StockAudit.matchedCount, StockAudit.notes (+4 more)

### Community 34 - "Orders schema"
Cohesion: 0.17
Nodes (11): Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.shippedAt, Shipment.status, Shipment.trackingNo (+3 more)

### Community 35 - "Orders schema"
Cohesion: 0.18
Nodes (12): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.metadata, OrderLineItem.productName, OrderLineItem.quantity, OrderLineItem.status, OrderLineItem.totalPrice, OrderLineItem.unitPrice (+4 more)

### Community 36 - "AI schema"
Cohesion: 0.18
Nodes (12): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.originalGrade, ThumbnailTracking.originalScore, ThumbnailTracking.reviewsAfter, ThumbnailTracking.salesAfter (+4 more)

### Community 37 - "AI schema"
Cohesion: 0.18
Nodes (10): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.measuredAt, Thumbnail.prevClickRate, Thumbnail.status, Thumbnail.strategy (+2 more)

### Community 38 - "AgentOS schema"
Cohesion: 0.22
Nodes (11): AgentRunRequest.taskSession, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.lastRun, AgentTaskSession.metadata, AgentTaskSession.sessionDisplay, AgentTaskSession.sessionParams (+3 more)

### Community 39 - "AgentOS schema"
Cohesion: 0.18
Nodes (11): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.totalCostMicros, AgentRuntimeState.totalInputTokens (+3 more)

### Community 40 - "Orders schema"
Cohesion: 0.2
Nodes (10): CSRecord.assignee, CSRecord.content, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.priority, CSRecord.resolution (+2 more)

### Community 41 - "Advertising schema"
Cohesion: 0.22
Nodes (9): packages/shared — @kiditem/shared, Advertising, AI, ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.url (+1 more)

### Community 42 - "AgentOS schema"
Cohesion: 0.22
Nodes (9): AgentRunRequest.sourceWorkflowRun, WorkflowRun.contextData, WorkflowRun.error, WorkflowRun.startedAt, WorkflowRun.status, WorkflowRun.steps, WorkflowRun.triggeredBy, WorkflowRun.updatedAt (+1 more)

### Community 43 - "AI schema"
Cohesion: 0.22
Nodes (9): ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.originalImages, ContentGeneration.processedImages, ContentGeneration.retryCount, ContentGeneration.updatedAt (+1 more)

### Community 44 - "AI schema"
Cohesion: 0.22
Nodes (9): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.method, ThumbnailAnalysis.overallScore, ThumbnailAnalysis.qualityAnalyzedAt, ThumbnailAnalysis.recompose, ThumbnailAnalysis.scores, ThumbnailAnalysis.suggestions (+1 more)

### Community 45 - "Advertising schema"
Cohesion: 0.25
Nodes (8): ExecutionTask.worker, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentUrl, ExecutionWorker.lastHeartbeatAt, ExecutionWorker.metaJson, ExecutionWorker.status, ExecutionWorker

### Community 46 - "code file: patterns.ts"
Cohesion: 0.52
Nodes (4): isPlainObject(), scrubDeep(), scrubSecrets(), walk()

### Community 47 - "Orders schema"
Cohesion: 0.29
Nodes (7): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.isNotified, UnshippedItem.productName, UnshippedItem.quantity, UnshippedItem.reason, UnshippedItem

## Knowledge Gaps
- **644 isolated node(s):** `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority` (+639 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Channels schema` to `code file: dev-data-coupang.ts`, `Core schema`, `Orders schema`, `Channels schema`, `Core schema`, `Supply schema`, `AgentOS schema`, `Core schema`, `Supply schema`, `System schema`, `System schema`, `Finance schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `Inventory schema`, `System schema`, `Core schema`, `Community 22`, `Advertising schema`, `AgentOS schema`, `Orders schema`, `System schema`, `Inventory schema`, `Orders schema`, `AgentOS schema`, `Orders schema`, `Inventory schema`, `Orders schema`, `Orders schema`, `AI schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `Advertising schema`, `AI schema`, `AI schema`, `Advertising schema`, `Orders schema`?**
  _High betweenness centrality (0.190) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `Orders schema` to `Channels schema`, `Core schema`, `Channels schema`, `Core schema`, `Supply schema`, `AgentOS schema`, `Core schema`, `Supply schema`, `System schema`, `System schema`, `Finance schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `Inventory schema`, `System schema`, `Core schema`, `Advertising schema`, `AgentOS schema`, `Orders schema`, `System schema`, `Inventory schema`, `Orders schema`, `Advertising schema`, `AgentOS schema`, `Orders schema`, `Inventory schema`, `Orders schema`, `Orders schema`, `AI schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `Advertising schema`, `AgentOS schema`, `AI schema`, `AI schema`, `Advertising schema`, `Orders schema`?**
  _High betweenness centrality (0.189) - this node is a cross-community bridge._
- **Why does `prisma — Shared Schema` connect `System schema` to `Channels schema`, `Core schema`, `Orders schema`, `Channels schema`, `Core schema`, `Supply schema`, `AgentOS schema`, `Core schema`, `Supply schema`, `System schema`, `Finance schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `System schema`, `Core schema`, `Advertising schema`, `AgentOS schema`, `Orders schema`, `System schema`, `Inventory schema`, `Orders schema`, `Advertising schema`, `AgentOS schema`, `Orders schema`, `Orders schema`, `Orders schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `Advertising schema`, `AgentOS schema`, `AI schema`, `Advertising schema`, `Orders schema`?**
  _High betweenness centrality (0.119) - this node is a cross-community bridge._
- **Are the 41 inferred relationships involving `Organization` (e.g. with `Thumbnail` and `ChannelReconciliationRun`) actually correct?**
  _`Organization` has 41 INFERRED edges - model-reasoned connections that need verification._
- **Are the 120 inferred relationships involving `ChannelReconciliationService` (e.g. with `AdAction.organization` and `AdAction.listing`) actually correct?**
  _`ChannelReconciliationService` has 120 INFERRED edges - model-reasoned connections that need verification._
- **Are the 122 inferred relationships involving `ChannelSyncService` (e.g. with `AdAction.organization` and `ScrapeTarget.organization`) actually correct?**
  _`ChannelSyncService` has 122 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel` to the rest of the system?**
  _644 weakly-connected nodes found - possible documentation gaps or missing edges._