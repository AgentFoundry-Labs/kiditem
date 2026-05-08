# Graph Report - schema  (2026-05-08)

## Corpus Check
- 12 files · ~17,648 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 957 nodes · 1662 edges · 46 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 202 edges
2. `prisma — Shared Schema` - 150 edges
3. `Organization` - 126 edges
4. `MasterProduct` - 53 edges
5. `ProductOption` - 52 edges
6. `AgentRun` - 49 edges
7. `AgentInstance` - 41 edges
8. `Order` - 40 edges
9. `ChannelListing` - 39 edges
10. `User` - 35 edges
11. `AgentRunRequest` - 34 edges
12. `Alert` - 32 edges

## Surprising Connections (you probably didn't know these)
- `Database ERD` --mentions_field--> `AdAction.targetType`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `ScrapeTarget.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `WorkflowTemplate.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/agents.prisma
- `Database ERD` --mentions_field--> `ThumbnailRegistrationAttempt.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/ai.prisma
- `Database ERD` --mentions_field--> `ChannelAdTargetDailySnapshot.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/channels.prisma
- `Database ERD` --mentions_field--> `ChannelReconciliationItem.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/channels.prisma
- `Database ERD` --mentions_field--> `User.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/core.prisma

## Communities (46 total, 0 thin omitted)

### Community 0 - "Core schema"
Cohesion: 0.05
Nodes (49): BundleComponent.bundleOption, BundleComponent.componentOption, BundleComponent.createdAt, BundleComponent.organization, BundleComponent.updatedAt, ProductOption.availableStock, ProductOption.barcode, ProductOption.commissionRate (+41 more)

### Community 1 - "Orders schema"
Cohesion: 0.06
Nodes (49): CategoryMapping.coupangCategoryId, CategoryMapping.createdAt, CategoryMapping.internalCategory, CategoryMapping.isActive, CategoryMapping.organization, OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.metadata (+41 more)

### Community 2 - "AI schema"
Cohesion: 0.05
Nodes (48): AI, ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.method, ThumbnailAnalysis.organization, ThumbnailAnalysis.overallScore, ThumbnailAnalysis.qualityAnalyzedAt, ThumbnailAnalysis.recompose (+40 more)

### Community 3 - "Core schema"
Cohesion: 0.04
Nodes (48): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.barcode, MasterProduct.category, MasterProduct.costCny, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description (+40 more)

### Community 4 - "AgentOS schema"
Cohesion: 0.05
Nodes (47): AgentRun.adapterType, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt, AgentRun.heartbeatAt (+39 more)

### Community 5 - "Supply schema"
Cohesion: 0.05
Nodes (47): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.isPrimary, MasterSupplierProduct.updatedAt, PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectQty, PurchaseOrder.defectType (+39 more)

### Community 6 - "System schema"
Cohesion: 0.05
Nodes (45): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.label, ActionTask.notes (+37 more)

### Community 7 - "Inventory schema"
Cohesion: 0.06
Nodes (41): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.organization, Inventory.reorderPoint, Inventory.reorderQuantity (+33 more)

### Community 8 - "System schema"
Cohesion: 0.06
Nodes (35): System, ActivityEvent.createdAt, ActivityEvent.eventType, ActivityEvent.objectId, ActivityEvent.organization, ActivityEvent.source, ActivityEvent.title, BusinessRule.actionType (+27 more)

### Community 9 - "Finance schema"
Cohesion: 0.06
Nodes (33): Finance, GradeHistory.calculatedAt, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization, GradeHistory.reason, GradeHistory.revenueScore (+25 more)

### Community 10 - "Orders schema"
Cohesion: 0.1
Nodes (26): Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.memo, Order.metadata (+18 more)

### Community 11 - "System schema"
Cohesion: 0.08
Nodes (25): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.installCount, Marketplace.isPublished (+17 more)

### Community 12 - "Inventory schema"
Cohesion: 0.1
Nodes (23): PickingItem.createdAt, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.orderId, PickingItem.pickedAt, PickingItem.pickingList, PickingItem.productName (+15 more)

### Community 13 - "Advertising schema"
Cohesion: 0.1
Nodes (21): AdAction.actionType, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt, AdAction.currentValue, AdAction.errorMessage (+13 more)

### Community 14 - "AgentOS schema"
Cohesion: 0.12
Nodes (19): AgentRunRequest.agentInstance, AgentRunRequest.claimedAt, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.createdAt, AgentRunRequest.finishedAt, AgentRunRequest.idempotencyKey, AgentRunRequest.lastErrorCode, AgentRunRequest.maxAttempts (+11 more)

### Community 15 - "Orders schema"
Cohesion: 0.12
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 16 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentOS, AgentBlueprintToolPolicy.createdAt, AgentBlueprintToolPolicy.dryRunMode, AgentBlueprintToolPolicy.updatedAt, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentToolDefinition.createdAt (+10 more)

### Community 17 - "Channels schema"
Cohesion: 0.11
Nodes (18): ChannelScrapeRun.businessDate, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.matchedCount, ChannelScrapeRun.metaJson, ChannelScrapeRun.organization (+10 more)

### Community 18 - "Channels schema"
Cohesion: 0.12
Nodes (18): ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank, ChannelListingDailySnapshot.createdAt (+10 more)

### Community 19 - "AgentOS schema"
Cohesion: 0.12
Nodes (17): AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name, AgentInstance.organization, AgentInstance.parent, AgentInstance.pausedAt (+9 more)

### Community 20 - "Channels schema"
Cohesion: 0.12
Nodes (17): ChannelReconciliationItem.channelProductName, ChannelReconciliationItem.confidence, ChannelReconciliationItem.externalId, ChannelReconciliationItem.ignoredReason, ChannelReconciliationItem.lastObservedAt, ChannelReconciliationItem.legacyCode, ChannelReconciliationItem.linkedListingId, ChannelReconciliationItem.linkedMasterProductId (+9 more)

### Community 21 - "Orders schema"
Cohesion: 0.15
Nodes (17): Database ERD, Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.listing, Shipment.option (+9 more)

### Community 22 - "Finance schema"
Cohesion: 0.15
Nodes (17): ProfitLoss.adCost, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit, ProfitLoss.orderCount, ProfitLoss.organization (+9 more)

### Community 23 - "Core schema"
Cohesion: 0.13
Nodes (16): Alert.actorUser, User.agentInstance, User.avatarUrl, User.createdAt, User.email, User.id, User.isActive, User.lastLoginAt (+8 more)

### Community 24 - "AgentOS schema"
Cohesion: 0.17
Nodes (15): prisma — Shared Schema, AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decisionReason, AgentApprovalRequest.organization, AgentApprovalRequest.status, AgentAuthorizationEvent.agentInstance (+7 more)

### Community 25 - "Core schema"
Cohesion: 0.14
Nodes (15): ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo, ChannelListing.exposureStatus, ChannelListing.externalId, ChannelListing.freeShipOverAmount (+7 more)

### Community 26 - "Advertising schema"
Cohesion: 0.14
Nodes (14): ExecutionLog.createdAt, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionTask.action, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt (+6 more)

### Community 27 - "AgentOS schema"
Cohesion: 0.14
Nodes (14): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.inputTokens, AgentCostEvent.metadata (+6 more)

### Community 28 - "Orders schema"
Cohesion: 0.15
Nodes (13): CSRecord.assignee, CSRecord.content, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing, CSRecord.order (+5 more)

### Community 29 - "Inventory schema"
Cohesion: 0.18
Nodes (13): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.items, StockAudit.matchedCount, StockAudit.notes (+5 more)

### Community 30 - "AgentOS schema"
Cohesion: 0.17
Nodes (12): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.organization, AgentRuntimeState.totalCostMicros (+4 more)

### Community 31 - "Core schema"
Cohesion: 0.17
Nodes (12): Core, MasterCodeCounter.updatedAt, MasterCodeCounter.value, OrganizationMembership.createdAt, OrganizationMembership.invitedBy, OrganizationMembership.joinedAt, OrganizationMembership.lastSelectedAt, OrganizationMembership.role (+4 more)

### Community 32 - "Core schema"
Cohesion: 0.17
Nodes (12): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name, LegalEntity.organization (+4 more)

### Community 33 - "AI schema"
Cohesion: 0.17
Nodes (12): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt, Thumbnail.organization, Thumbnail.prevClickRate (+4 more)

### Community 34 - "AgentOS schema"
Cohesion: 0.18
Nodes (11): AgentBlueprint.catalogStatus, AgentBlueprint.createdAt, AgentBlueprint.defaultCapabilities, AgentBlueprint.defaultModel, AgentBlueprint.defaultRuntimeConfig, AgentBlueprint.description, AgentBlueprint.marketplace, AgentBlueprint.promptPath (+3 more)

### Community 35 - "AI schema"
Cohesion: 0.18
Nodes (11): ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.organization, ContentGeneration.originalImages, ContentGeneration.processedImages, ContentGeneration.retryCount (+3 more)

### Community 36 - "Orders schema"
Cohesion: 0.2
Nodes (11): Review.content, Review.createdAt, Review.id, Review.listing, Review.organization, Review.platform, Review.rating, Review.reviewedAt (+3 more)

### Community 37 - "AgentOS schema"
Cohesion: 0.2
Nodes (10): AgentRunRequest.sourceWorkflowRun, WorkflowRun.contextData, WorkflowRun.error, WorkflowRun.organizationId, WorkflowRun.startedAt, WorkflowRun.status, WorkflowRun.steps, WorkflowRun.triggeredBy (+2 more)

### Community 38 - "Core schema"
Cohesion: 0.24
Nodes (10): ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.isPrimary, ChannelAccount.organization, ChannelAccount.sellerId, ChannelAccount.status, ChannelAccount.updatedAt, ChannelAccount.vendorId (+2 more)

### Community 39 - "Advertising schema"
Cohesion: 0.22
Nodes (9): ExecutionTask.worker, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentUrl, ExecutionWorker.lastHeartbeatAt, ExecutionWorker.metaJson, ExecutionWorker.organization, ExecutionWorker.status (+1 more)

### Community 40 - "Advertising schema"
Cohesion: 0.22
Nodes (9): Advertising, ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.isActive, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.url (+1 more)

### Community 41 - "Channels schema"
Cohesion: 0.25
Nodes (9): Channels, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.matchStatus, ChannelScrapeSnapshot.observedAt, ChannelScrapeSnapshot.pageType, ChannelAccountDailyKpiSnapshot, ChannelScrapeSnapshot (+1 more)

### Community 42 - "Orders schema"
Cohesion: 0.22
Nodes (9): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.isNotified, UnshippedItem.option, UnshippedItem.organization, UnshippedItem.productName, UnshippedItem.quantity, UnshippedItem.reason (+1 more)

### Community 43 - "Channels schema"
Cohesion: 0.29
Nodes (8): AdAction.adTargetDaily, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.externalId, ChannelAdTargetDailySnapshot.firstObservedAt, ChannelAdTargetDailySnapshot.listing, ChannelAdTargetDailySnapshot.sampleCount, ChannelAdTargetDailySnapshot, ChannelAdTargetDailySnapshot unique(organizationId, channel, businessDate, targetType, targetKey)

### Community 44 - "Core schema"
Cohesion: 0.25
Nodes (8): externalOptionId canonical option identity, vendorItemId provider term, ChannelListingOption.createdAt, ChannelListingOption.isUnmatched, ChannelListingOption.salePrice, OrderLineItem.listingOption, ChannelListingOption, ChannelListingOption unique(listingId, externalOptionId)

### Community 45 - "AgentOS schema"
Cohesion: 0.29
Nodes (7): AgentRunEvent.agentInstance, AgentRunEvent.createdAt, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.organization, AgentRunEvent, AgentRunEvent unique(runId, seq)

## Knowledge Gaps
- **656 isolated node(s):** `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority` (+651 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Orders schema` to `Core schema`, `Orders schema`, `AI schema`, `Core schema`, `AgentOS schema`, `Supply schema`, `System schema`, `Inventory schema`, `System schema`, `Finance schema`, `Orders schema`, `System schema`, `Inventory schema`, `Advertising schema`, `AgentOS schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `Finance schema`, `Core schema`, `AgentOS schema`, `Core schema`, `Advertising schema`, `AgentOS schema`, `Orders schema`, `Inventory schema`, `AgentOS schema`, `Core schema`, `Core schema`, `AI schema`, `AgentOS schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `Core schema`, `Advertising schema`, `Advertising schema`, `Channels schema`, `Orders schema`, `Channels schema`, `Core schema`, `AgentOS schema`?**
  _High betweenness centrality (0.425) - this node is a cross-community bridge._
- **Why does `prisma — Shared Schema` connect `AgentOS schema` to `Core schema`, `Orders schema`, `AI schema`, `Core schema`, `AgentOS schema`, `Supply schema`, `System schema`, `Inventory schema`, `System schema`, `Finance schema`, `Orders schema`, `System schema`, `Inventory schema`, `Advertising schema`, `AgentOS schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `Orders schema`, `Finance schema`, `Core schema`, `Core schema`, `Advertising schema`, `AgentOS schema`, `Orders schema`, `Inventory schema`, `AgentOS schema`, `Core schema`, `Core schema`, `AI schema`, `AgentOS schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `Core schema`, `Advertising schema`, `Advertising schema`, `Channels schema`, `Orders schema`, `Channels schema`, `Core schema`, `AgentOS schema`?**
  _High betweenness centrality (0.246) - this node is a cross-community bridge._
- **Why does `Organization` connect `Orders schema` to `Core schema`, `AI schema`, `Core schema`, `AgentOS schema`, `Supply schema`, `System schema`, `Inventory schema`, `System schema`, `Finance schema`, `Orders schema`, `System schema`, `Inventory schema`, `Advertising schema`, `AgentOS schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `Orders schema`, `Finance schema`, `AgentOS schema`, `Core schema`, `AgentOS schema`, `Orders schema`, `Inventory schema`, `AgentOS schema`, `Core schema`, `Core schema`, `AI schema`, `AI schema`, `Orders schema`, `Core schema`, `Advertising schema`, `Advertising schema`, `Channels schema`, `Orders schema`, `Channels schema`, `Core schema`, `AgentOS schema`?**
  _High betweenness centrality (0.211) - this node is a cross-community bridge._
- **What connects `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel` to the rest of the system?**
  _656 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core schema` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Orders schema` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `AI schema` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._