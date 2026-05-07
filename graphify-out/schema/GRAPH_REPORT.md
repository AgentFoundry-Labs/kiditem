# Graph Report - schema  (2026-05-07)

## Corpus Check
- 12 files · ~17,038 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 932 nodes · 1593 edges · 54 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_prisma field prisma — Shared Schema|prisma field: prisma — Shared Schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 191 edges
2. `prisma — Shared Schema` - 128 edges
3. `Organization` - 124 edges
4. `MasterProduct` - 52 edges
5. `ProductOption` - 52 edges
6. `AgentRun` - 48 edges
7. `AgentInstance` - 40 edges
8. `Order` - 40 edges
9. `ChannelListing` - 39 edges
10. `AgentRunRequest` - 33 edges
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

## Communities (54 total, 0 thin omitted)

### Community 0 - "System schema"
Cohesion: 0.05
Nodes (49): System, ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.label (+41 more)

### Community 1 - "Advertising schema"
Cohesion: 0.05
Nodes (44): AdAction.actionType, AdAction.adTargetDaily, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt, AdAction.currentValue (+36 more)

### Community 2 - "Core schema"
Cohesion: 0.06
Nodes (43): BundleComponent.bundleOption, BundleComponent.componentOption, BundleComponent.createdAt, BundleComponent.organization, BundleComponent.updatedAt, ProductOption.availableStock, ProductOption.barcode, ProductOption.commissionRate (+35 more)

### Community 3 - "Orders schema"
Cohesion: 0.06
Nodes (42): externalOptionId canonical option identity, vendorItemId provider term, ChannelListingOption.createdAt, ChannelListingOption.isUnmatched, ChannelListingOption.salePrice, OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.listingOption (+34 more)

### Community 4 - "Inventory schema"
Cohesion: 0.06
Nodes (41): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.organization, Inventory.reorderPoint, Inventory.reorderQuantity (+33 more)

### Community 5 - "AgentOS schema"
Cohesion: 0.06
Nodes (36): AgentBlueprint.catalogStatus, AgentBlueprint.createdAt, AgentBlueprint.defaultCapabilities, AgentBlueprint.defaultModel, AgentBlueprint.defaultRuntimeConfig, AgentBlueprint.description, AgentBlueprint.marketplace, AgentBlueprint.promptPath (+28 more)

### Community 6 - "AgentOS schema"
Cohesion: 0.06
Nodes (35): AgentRun.adapterType, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt, AgentRun.heartbeatAt (+27 more)

### Community 7 - "Core schema"
Cohesion: 0.07
Nodes (33): Core, CategoryMapping.coupangCategoryId, CategoryMapping.createdAt, CategoryMapping.internalCategory, CategoryMapping.isActive, CategoryMapping.organization, ChannelAccount.createdAt, ChannelAccount.externalAccountId (+25 more)

### Community 8 - "Core schema"
Cohesion: 0.06
Nodes (32): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.category, MasterProduct.costCny, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description, MasterProduct.detailPageUrl (+24 more)

### Community 9 - "Orders schema"
Cohesion: 0.1
Nodes (26): Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.memo, Order.metadata (+18 more)

### Community 10 - "Inventory schema"
Cohesion: 0.1
Nodes (23): PickingItem.createdAt, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.orderId, PickingItem.pickedAt, PickingItem.pickingList, PickingItem.productName (+15 more)

### Community 11 - "Supply schema"
Cohesion: 0.1
Nodes (20): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.inspectedAt, PurchaseOrder.orderDate, PurchaseOrder.organization (+12 more)

### Community 12 - "Orders schema"
Cohesion: 0.12
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 13 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentOS, AgentBlueprintToolPolicy.createdAt, AgentBlueprintToolPolicy.dryRunMode, AgentBlueprintToolPolicy.updatedAt, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentToolDefinition.createdAt (+10 more)

### Community 14 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name, AgentInstance.organization, AgentInstance.parent, AgentInstance.pausedAt (+10 more)

### Community 15 - "Channels schema"
Cohesion: 0.12
Nodes (18): ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank, ChannelListingDailySnapshot.createdAt (+10 more)

### Community 16 - "Channels schema"
Cohesion: 0.11
Nodes (18): ChannelScrapeRun.businessDate, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.matchedCount, ChannelScrapeRun.metaJson, ChannelScrapeRun.organization (+10 more)

### Community 17 - "AgentOS schema"
Cohesion: 0.13
Nodes (18): AgentRunRequest.agentInstance, AgentRunRequest.claimedAt, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.createdAt, AgentRunRequest.finishedAt, AgentRunRequest.idempotencyKey, AgentRunRequest.lastErrorCode, AgentRunRequest.maxAttempts (+10 more)

### Community 18 - "System schema"
Cohesion: 0.12
Nodes (18): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+10 more)

### Community 19 - "Channels schema"
Cohesion: 0.12
Nodes (17): ChannelReconciliationItem.channelProductName, ChannelReconciliationItem.confidence, ChannelReconciliationItem.externalId, ChannelReconciliationItem.ignoredReason, ChannelReconciliationItem.lastObservedAt, ChannelReconciliationItem.legacyCode, ChannelReconciliationItem.linkedListingId, ChannelReconciliationItem.linkedMasterProductId (+9 more)

### Community 20 - "Orders schema"
Cohesion: 0.15
Nodes (17): Database ERD, Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.listing, Shipment.option (+9 more)

### Community 21 - "Finance schema"
Cohesion: 0.15
Nodes (17): ProfitLoss.adCost, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit, ProfitLoss.orderCount, ProfitLoss.organization (+9 more)

### Community 22 - "Core schema"
Cohesion: 0.13
Nodes (16): AgentRunRequest.requestedBy, User.agentInstance, User.avatarUrl, User.createdAt, User.email, User.id, User.isActive, User.lastLoginAt (+8 more)

### Community 23 - "AI schema"
Cohesion: 0.15
Nodes (15): AI, ThumbnailGeneration.attemptCount, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.inputMeta, ThumbnailGeneration.organization, ThumbnailGeneration.originalUrl, ThumbnailGeneration.status, ThumbnailGeneration.triggeredByUser (+7 more)

### Community 24 - "Core schema"
Cohesion: 0.14
Nodes (15): ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo, ChannelListing.exposureStatus, ChannelListing.externalId, ChannelListing.freeShipOverAmount (+7 more)

### Community 25 - "AgentOS schema"
Cohesion: 0.14
Nodes (14): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.inputTokens, AgentCostEvent.metadata (+6 more)

### Community 26 - "Orders schema"
Cohesion: 0.15
Nodes (13): CSRecord.assignee, CSRecord.content, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing, CSRecord.order (+5 more)

### Community 27 - "Finance schema"
Cohesion: 0.18
Nodes (13): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.notes, SalesPlan.organization, SalesPlan.period, SalesPlan.targetOrders (+5 more)

### Community 28 - "Inventory schema"
Cohesion: 0.18
Nodes (13): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.items, StockAudit.matchedCount, StockAudit.notes (+5 more)

### Community 29 - "Supply schema"
Cohesion: 0.15
Nodes (13): PurchaseOrder.supplier, Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.leadTimeDays, Supplier.name, Supplier.notes (+5 more)

### Community 30 - "AgentOS schema"
Cohesion: 0.17
Nodes (12): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.organization, AgentRuntimeState.totalCostMicros (+4 more)

### Community 31 - "AgentOS schema"
Cohesion: 0.21
Nodes (12): AgentRunRequest.taskSession, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.lastRun, AgentTaskSession.metadata, AgentTaskSession.organization, AgentTaskSession.sessionDisplay (+4 more)

### Community 32 - "AI schema"
Cohesion: 0.18
Nodes (12): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.originalGrade, ThumbnailTracking.originalScore, ThumbnailTracking.reviewsAfter, ThumbnailTracking.salesAfter (+4 more)

### Community 33 - "AI schema"
Cohesion: 0.17
Nodes (12): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt, Thumbnail.organization, Thumbnail.prevClickRate (+4 more)

### Community 34 - "Orders schema"
Cohesion: 0.2
Nodes (11): Review.content, Review.createdAt, Review.id, Review.listing, Review.organization, Review.platform, Review.rating, Review.reviewedAt (+3 more)

### Community 35 - "Finance schema"
Cohesion: 0.18
Nodes (11): GradeHistory.calculatedAt, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization, GradeHistory.reason, GradeHistory.revenueScore, GradeHistory.score (+3 more)

### Community 36 - "AI schema"
Cohesion: 0.2
Nodes (10): ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.organization, ContentGeneration.originalImages, ContentGeneration.processedImages, ContentGeneration.retryCount (+2 more)

### Community 37 - "AI schema"
Cohesion: 0.2
Nodes (10): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.method, ThumbnailAnalysis.organization, ThumbnailAnalysis.overallScore, ThumbnailAnalysis.qualityAnalyzedAt, ThumbnailAnalysis.recompose, ThumbnailAnalysis.scores (+2 more)

### Community 38 - "AgentOS schema"
Cohesion: 0.2
Nodes (10): AgentRunRequest.sourceWorkflowRun, WorkflowRun.contextData, WorkflowRun.error, WorkflowRun.organizationId, WorkflowRun.startedAt, WorkflowRun.status, WorkflowRun.steps, WorkflowRun.triggeredBy (+2 more)

### Community 39 - "Finance schema"
Cohesion: 0.2
Nodes (10): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.master, ProcessingCost.organization, ProcessingCost.processType, ProcessingCost.productName, ProcessingCost.quantity, ProcessingCost.totalCost (+2 more)

### Community 40 - "Core schema"
Cohesion: 0.28
Nodes (9): Organization.createdAt, Organization.updatedAt, SystemSetting.createdAt, SystemSetting.organization, SystemSetting.updatedAt, ThumbnailTracking.organization, Organization, SystemSetting (+1 more)

### Community 41 - "Channels schema"
Cohesion: 0.25
Nodes (9): Channels, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.matchStatus, ChannelScrapeSnapshot.observedAt, ChannelScrapeSnapshot.pageType, ChannelAccountDailyKpiSnapshot, ChannelScrapeSnapshot (+1 more)

### Community 42 - "Orders schema"
Cohesion: 0.22
Nodes (9): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.isNotified, UnshippedItem.option, UnshippedItem.organization, UnshippedItem.productName, UnshippedItem.quantity, UnshippedItem.reason (+1 more)

### Community 43 - "Finance schema"
Cohesion: 0.22
Nodes (9): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdBy, ManualLedger.description, ManualLedger.memo, ManualLedger.organization (+1 more)

### Community 44 - "Advertising schema"
Cohesion: 0.22
Nodes (9): Advertising, ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.isActive, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.url (+1 more)

### Community 45 - "Advertising schema"
Cohesion: 0.25
Nodes (8): ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentUrl, ExecutionWorker.lastHeartbeatAt, ExecutionWorker.metaJson, ExecutionWorker.organization, ExecutionWorker.status, ExecutionWorker

### Community 46 - "Core schema"
Cohesion: 0.25
Nodes (8): OrganizationMembership.createdAt, OrganizationMembership.invitedBy, OrganizationMembership.joinedAt, OrganizationMembership.lastSelectedAt, OrganizationMembership.role, OrganizationMembership.status, OrganizationMembership, OrganizationMembership unique(organizationId, userId)

### Community 47 - "Supply schema"
Cohesion: 0.25
Nodes (8): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.organization, SupplierPayment.paidDate, SupplierPayment.purchaseOrder, SupplierPayment.status, SupplierPayment.updatedAt, SupplierPayment

### Community 48 - "AgentOS schema"
Cohesion: 0.29
Nodes (7): AgentRunEvent.agentInstance, AgentRunEvent.createdAt, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.organization, AgentRunEvent, AgentRunEvent unique(runId, seq)

### Community 49 - "AgentOS schema"
Cohesion: 0.29
Nodes (7): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decisionReason, AgentApprovalRequest.organization, AgentApprovalRequest.status, AgentApprovalRequest

### Community 50 - "prisma field: prisma — Shared Schema"
Cohesion: 0.33
Nodes (7): prisma — Shared Schema, MasterProduct.barcode, MasterProduct.isDeleted, MasterProduct.legacyCode, MasterProduct.organization, MasterProductImage.isDeleted, MasterProduct unique(organizationId, legacyCode)

### Community 51 - "Supply schema"
Cohesion: 0.33
Nodes (7): Supply, SupplierProduct.createdAt, SupplierProduct.option, SupplierProduct.supplyPrice, SupplierProduct.updatedAt, SupplierProduct, SupplierProduct unique(supplierId, optionId)

### Community 52 - "AgentOS schema"
Cohesion: 0.33
Nodes (6): AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decision, AgentAuthorizationEvent.organization, AgentAuthorizationEvent.policySnapshot, AgentAuthorizationEvent

### Community 53 - "Supply schema"
Cohesion: 0.4
Nodes (5): MasterSupplierProduct.createdAt, MasterSupplierProduct.isPrimary, MasterSupplierProduct.updatedAt, MasterSupplierProduct, MasterSupplierProduct unique(masterId, supplierId)

## Knowledge Gaps
- **639 isolated node(s):** `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority` (+634 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Orders schema` to `System schema`, `Advertising schema`, `Core schema`, `Orders schema`, `Inventory schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `Core schema`, `Orders schema`, `Inventory schema`, `Supply schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `AgentOS schema`, `System schema`, `Channels schema`, `Finance schema`, `Core schema`, `AI schema`, `Core schema`, `AgentOS schema`, `Orders schema`, `Finance schema`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `AI schema`, `Orders schema`, `Finance schema`, `AI schema`, `AI schema`, `AgentOS schema`, `Finance schema`, `Core schema`, `Channels schema`, `Orders schema`, `Finance schema`, `Advertising schema`, `Advertising schema`, `Core schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `prisma field: prisma — Shared Schema`, `Supply schema`, `AgentOS schema`, `Supply schema`?**
  _High betweenness centrality (0.471) - this node is a cross-community bridge._
- **Why does `Organization` connect `Core schema` to `System schema`, `Advertising schema`, `Core schema`, `Orders schema`, `Inventory schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `Core schema`, `Orders schema`, `Inventory schema`, `Supply schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `AgentOS schema`, `System schema`, `Channels schema`, `Orders schema`, `Finance schema`, `AI schema`, `Core schema`, `AgentOS schema`, `Orders schema`, `Finance schema`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `AI schema`, `Orders schema`, `Finance schema`, `AI schema`, `AI schema`, `Finance schema`, `Channels schema`, `Orders schema`, `Finance schema`, `Advertising schema`, `Advertising schema`, `Core schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `prisma field: prisma — Shared Schema`, `AgentOS schema`?**
  _High betweenness centrality (0.240) - this node is a cross-community bridge._
- **Why does `prisma — Shared Schema` connect `prisma field: prisma — Shared Schema` to `System schema`, `Advertising schema`, `Core schema`, `Orders schema`, `Inventory schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `Core schema`, `Orders schema`, `Inventory schema`, `Supply schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `AgentOS schema`, `System schema`, `Channels schema`, `Orders schema`, `Finance schema`, `Core schema`, `AI schema`, `Core schema`, `AgentOS schema`, `Orders schema`, `Finance schema`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Orders schema`, `Finance schema`, `AI schema`, `AI schema`, `AgentOS schema`, `Finance schema`, `Core schema`, `Channels schema`, `Orders schema`, `Finance schema`, `Advertising schema`, `Advertising schema`, `Core schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `Supply schema`, `AgentOS schema`?**
  _High betweenness centrality (0.167) - this node is a cross-community bridge._
- **What connects `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel` to the rest of the system?**
  _639 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `System schema` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Advertising schema` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Core schema` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._