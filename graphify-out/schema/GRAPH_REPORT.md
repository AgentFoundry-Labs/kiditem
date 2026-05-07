# Graph Report - schema  (2026-05-07)

## Corpus Check
- 12 files · ~17,064 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 932 nodes · 1622 edges · 45 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_System schema|System schema]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 200 edges
2. `prisma — Shared Schema` - 148 edges
3. `Organization` - 124 edges
4. `MasterProduct` - 52 edges
5. `ProductOption` - 52 edges
6. `AgentRun` - 49 edges
7. `AgentInstance` - 41 edges
8. `Order` - 40 edges
9. `ChannelListing` - 39 edges
10. `AgentRunRequest` - 34 edges
11. `User` - 31 edges
12. `AdAction` - 29 edges

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

## Communities (45 total, 0 thin omitted)

### Community 0 - "Finance schema"
Cohesion: 0.05
Nodes (50): prisma — Shared Schema, Advertising, Finance, AgentRunEvent.agentInstance, AgentRunEvent.createdAt, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.organization (+42 more)

### Community 1 - "System schema"
Cohesion: 0.05
Nodes (49): System, ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.label (+41 more)

### Community 2 - "Core schema"
Cohesion: 0.04
Nodes (48): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.barcode, MasterProduct.category, MasterProduct.costCny, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description (+40 more)

### Community 3 - "Advertising schema"
Cohesion: 0.05
Nodes (44): AdAction.actionType, AdAction.adTargetDaily, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt, AdAction.currentValue (+36 more)

### Community 4 - "Core schema"
Cohesion: 0.06
Nodes (43): BundleComponent.bundleOption, BundleComponent.componentOption, BundleComponent.createdAt, BundleComponent.organization, BundleComponent.updatedAt, ProductOption.availableStock, ProductOption.barcode, ProductOption.commissionRate (+35 more)

### Community 5 - "Orders schema"
Cohesion: 0.06
Nodes (42): externalOptionId canonical option identity, vendorItemId provider term, ChannelListingOption.createdAt, ChannelListingOption.isUnmatched, ChannelListingOption.salePrice, OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.listingOption (+34 more)

### Community 6 - "Inventory schema"
Cohesion: 0.06
Nodes (41): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.organization, Inventory.reorderPoint, Inventory.reorderQuantity (+33 more)

### Community 7 - "AgentOS schema"
Cohesion: 0.06
Nodes (40): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decisionReason, AgentApprovalRequest.organization, AgentApprovalRequest.status, AgentRunRequest.sourceWorkflowRun, OrganizationMembership.createdAt (+32 more)

### Community 8 - "AgentOS schema"
Cohesion: 0.06
Nodes (36): AgentBlueprint.catalogStatus, AgentBlueprint.createdAt, AgentBlueprint.defaultCapabilities, AgentBlueprint.defaultModel, AgentBlueprint.defaultRuntimeConfig, AgentBlueprint.description, AgentBlueprint.marketplace, AgentBlueprint.promptPath (+28 more)

### Community 9 - "AgentOS schema"
Cohesion: 0.06
Nodes (35): AgentRun.adapterType, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt, AgentRun.heartbeatAt (+27 more)

### Community 10 - "Core schema"
Cohesion: 0.07
Nodes (33): Core, CategoryMapping.coupangCategoryId, CategoryMapping.createdAt, CategoryMapping.internalCategory, CategoryMapping.isActive, CategoryMapping.organization, ChannelAccount.createdAt, ChannelAccount.externalAccountId (+25 more)

### Community 11 - "Orders schema"
Cohesion: 0.1
Nodes (26): Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.memo, Order.metadata (+18 more)

### Community 12 - "Inventory schema"
Cohesion: 0.1
Nodes (23): PickingItem.createdAt, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.orderId, PickingItem.pickedAt, PickingItem.pickingList, PickingItem.productName (+15 more)

### Community 13 - "Supply schema"
Cohesion: 0.1
Nodes (20): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.inspectedAt, PurchaseOrder.orderDate, PurchaseOrder.organization (+12 more)

### Community 14 - "AgentOS schema"
Cohesion: 0.12
Nodes (19): AgentRunRequest.agentInstance, AgentRunRequest.claimedAt, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.createdAt, AgentRunRequest.finishedAt, AgentRunRequest.idempotencyKey, AgentRunRequest.lastErrorCode, AgentRunRequest.maxAttempts (+11 more)

### Community 15 - "Orders schema"
Cohesion: 0.12
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 16 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentOS, AgentBlueprintToolPolicy.createdAt, AgentBlueprintToolPolicy.dryRunMode, AgentBlueprintToolPolicy.updatedAt, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentToolDefinition.createdAt (+10 more)

### Community 17 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name, AgentInstance.organization, AgentInstance.parent, AgentInstance.pausedAt (+10 more)

### Community 18 - "Channels schema"
Cohesion: 0.11
Nodes (18): ChannelScrapeRun.businessDate, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.matchedCount, ChannelScrapeRun.metaJson, ChannelScrapeRun.organization (+10 more)

### Community 19 - "Channels schema"
Cohesion: 0.12
Nodes (18): ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank, ChannelListingDailySnapshot.createdAt (+10 more)

### Community 20 - "System schema"
Cohesion: 0.12
Nodes (18): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+10 more)

### Community 21 - "Channels schema"
Cohesion: 0.12
Nodes (17): ChannelReconciliationItem.channelProductName, ChannelReconciliationItem.confidence, ChannelReconciliationItem.externalId, ChannelReconciliationItem.ignoredReason, ChannelReconciliationItem.lastObservedAt, ChannelReconciliationItem.legacyCode, ChannelReconciliationItem.linkedListingId, ChannelReconciliationItem.linkedMasterProductId (+9 more)

### Community 22 - "Orders schema"
Cohesion: 0.15
Nodes (17): Database ERD, Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.listing, Shipment.option (+9 more)

### Community 23 - "Finance schema"
Cohesion: 0.15
Nodes (17): ProfitLoss.adCost, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit, ProfitLoss.orderCount, ProfitLoss.organization (+9 more)

### Community 24 - "AI schema"
Cohesion: 0.15
Nodes (15): AI, ThumbnailGeneration.attemptCount, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.inputMeta, ThumbnailGeneration.organization, ThumbnailGeneration.originalUrl, ThumbnailGeneration.status, ThumbnailGeneration.triggeredByUser (+7 more)

### Community 25 - "Core schema"
Cohesion: 0.14
Nodes (15): ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo, ChannelListing.exposureStatus, ChannelListing.externalId, ChannelListing.freeShipOverAmount (+7 more)

### Community 26 - "AgentOS schema"
Cohesion: 0.14
Nodes (14): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.inputTokens, AgentCostEvent.metadata (+6 more)

### Community 27 - "AI schema"
Cohesion: 0.17
Nodes (13): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.organization, ThumbnailTracking.originalGrade, ThumbnailTracking.originalScore, ThumbnailTracking.reviewsAfter (+5 more)

### Community 28 - "Orders schema"
Cohesion: 0.15
Nodes (13): CSRecord.assignee, CSRecord.content, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing, CSRecord.order (+5 more)

### Community 29 - "Inventory schema"
Cohesion: 0.18
Nodes (13): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.items, StockAudit.matchedCount, StockAudit.notes (+5 more)

### Community 30 - "Supply schema"
Cohesion: 0.15
Nodes (13): PurchaseOrder.supplier, Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.leadTimeDays, Supplier.name, Supplier.notes (+5 more)

### Community 31 - "AgentOS schema"
Cohesion: 0.21
Nodes (12): AgentRunRequest.taskSession, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.lastRun, AgentTaskSession.metadata, AgentTaskSession.organization, AgentTaskSession.sessionDisplay (+4 more)

### Community 32 - "AgentOS schema"
Cohesion: 0.17
Nodes (12): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.organization, AgentRuntimeState.totalCostMicros (+4 more)

### Community 33 - "AI schema"
Cohesion: 0.17
Nodes (12): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt, Thumbnail.organization, Thumbnail.prevClickRate (+4 more)

### Community 34 - "Advertising schema"
Cohesion: 0.2
Nodes (11): ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentUrl, ExecutionWorker.lastHeartbeatAt, ExecutionWorker.metaJson, ExecutionWorker.organization, ExecutionWorker.status, Organization.createdAt (+3 more)

### Community 35 - "Orders schema"
Cohesion: 0.2
Nodes (11): Review.content, Review.createdAt, Review.id, Review.listing, Review.organization, Review.platform, Review.rating, Review.reviewedAt (+3 more)

### Community 36 - "AI schema"
Cohesion: 0.2
Nodes (10): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.method, ThumbnailAnalysis.organization, ThumbnailAnalysis.overallScore, ThumbnailAnalysis.qualityAnalyzedAt, ThumbnailAnalysis.recompose, ThumbnailAnalysis.scores (+2 more)

### Community 37 - "AI schema"
Cohesion: 0.2
Nodes (10): ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.organization, ContentGeneration.originalImages, ContentGeneration.processedImages, ContentGeneration.retryCount (+2 more)

### Community 38 - "Channels schema"
Cohesion: 0.25
Nodes (9): Channels, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.matchStatus, ChannelScrapeSnapshot.observedAt, ChannelScrapeSnapshot.pageType, ChannelAccountDailyKpiSnapshot, ChannelScrapeSnapshot (+1 more)

### Community 39 - "Orders schema"
Cohesion: 0.22
Nodes (9): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.isNotified, UnshippedItem.option, UnshippedItem.organization, UnshippedItem.productName, UnshippedItem.quantity, UnshippedItem.reason (+1 more)

### Community 40 - "Supply schema"
Cohesion: 0.25
Nodes (8): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.organization, SupplierPayment.paidDate, SupplierPayment.purchaseOrder, SupplierPayment.status, SupplierPayment.updatedAt, SupplierPayment

### Community 41 - "AgentOS schema"
Cohesion: 0.33
Nodes (6): AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decision, AgentAuthorizationEvent.organization, AgentAuthorizationEvent.policySnapshot, AgentAuthorizationEvent

### Community 42 - "Supply schema"
Cohesion: 0.4
Nodes (6): SupplierProduct.createdAt, SupplierProduct.option, SupplierProduct.supplyPrice, SupplierProduct.updatedAt, SupplierProduct, SupplierProduct unique(supplierId, optionId)

### Community 43 - "Supply schema"
Cohesion: 0.33
Nodes (6): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.isPrimary, MasterSupplierProduct.updatedAt, MasterSupplierProduct, MasterSupplierProduct unique(masterId, supplierId)

### Community 44 - "System schema"
Cohesion: 0.5
Nodes (5): SystemSetting.createdAt, SystemSetting.organization, SystemSetting.updatedAt, SystemSetting, SystemSetting unique(organizationId, key)

## Knowledge Gaps
- **639 isolated node(s):** `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority` (+634 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Orders schema` to `Finance schema`, `System schema`, `Core schema`, `Advertising schema`, `Core schema`, `Orders schema`, `Inventory schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `Orders schema`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `System schema`, `Channels schema`, `Finance schema`, `AI schema`, `Core schema`, `AgentOS schema`, `AI schema`, `Orders schema`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Advertising schema`, `Orders schema`, `AI schema`, `AI schema`, `Channels schema`, `Orders schema`, `Supply schema`, `AgentOS schema`, `Supply schema`, `Supply schema`, `System schema`?**
  _High betweenness centrality (0.428) - this node is a cross-community bridge._
- **Why does `prisma — Shared Schema` connect `Finance schema` to `System schema`, `Core schema`, `Advertising schema`, `Core schema`, `Orders schema`, `Inventory schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `Orders schema`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `System schema`, `Channels schema`, `Orders schema`, `Finance schema`, `AI schema`, `Core schema`, `AgentOS schema`, `AI schema`, `Orders schema`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Advertising schema`, `Orders schema`, `AI schema`, `AI schema`, `Channels schema`, `Orders schema`, `Supply schema`, `AgentOS schema`, `Supply schema`, `System schema`?**
  _High betweenness centrality (0.245) - this node is a cross-community bridge._
- **Why does `Organization` connect `Advertising schema` to `Finance schema`, `System schema`, `Core schema`, `Advertising schema`, `Core schema`, `Orders schema`, `Inventory schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `Orders schema`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `System schema`, `Channels schema`, `Orders schema`, `Finance schema`, `AI schema`, `Core schema`, `AgentOS schema`, `AI schema`, `Orders schema`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Orders schema`, `AI schema`, `AI schema`, `Channels schema`, `Orders schema`, `Supply schema`, `AgentOS schema`, `System schema`?**
  _High betweenness centrality (0.209) - this node is a cross-community bridge._
- **What connects `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel` to the rest of the system?**
  _639 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Finance schema` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `System schema` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Core schema` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._