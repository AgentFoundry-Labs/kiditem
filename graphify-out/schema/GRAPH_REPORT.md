# Graph Report - schema  (2026-05-14)

## Corpus Check
- 13 files · ~17,745 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1013 nodes · 1701 edges · 51 communities (50 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Sourcing schema|Sourcing schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AI schema|AI schema]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 212 edges
2. `Organization` - 133 edges
3. `prisma — Shared Schema` - 103 edges
4. `MasterProduct` - 57 edges
5. `ProductOption` - 52 edges
6. `AgentRun` - 49 edges
7. `User` - 40 edges
8. `Order` - 40 edges
9. `AgentInstance` - 39 edges
10. `ChannelListing` - 39 edges
11. `AgentRunRequest` - 34 edges
12. `Alert` - 31 edges

## Surprising Connections (you probably didn't know these)
- `Database ERD` --mentions_field--> `WorkflowTemplate.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/agents.prisma
- `Database ERD` --mentions_field--> `ThumbnailRegistrationAttempt.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/ai.prisma
- `Database ERD` --mentions_field--> `ChannelAdTargetDailySnapshot.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/channels.prisma
- `Database ERD` --mentions_field--> `ChannelReconciliationItem.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/channels.prisma
- `Database ERD` --mentions_field--> `ChannelReconciliationItem.legacyCode`  [EXTRACTED]
  docs/ERD.md → prisma/models/channels.prisma
- `Database ERD` --mentions_field--> `User.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/core.prisma
- `Database ERD` --mentions_field--> `CategoryMapping.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/core.prisma
- `Database ERD` --mentions_field--> `ProductOption.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/core.prisma

## Communities (51 total, 1 thin omitted)

### Community 0 - "Core schema"
Cohesion: 0.05
Nodes (55): Core, ActivityEvent.createdAt, ActivityEvent.eventType, ActivityEvent.objectId, ActivityEvent.organization, ActivityEvent.source, ActivityEvent.title, BundleComponent.bundleOption (+47 more)

### Community 1 - "Core schema"
Cohesion: 0.04
Nodes (49): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.barcode, MasterProduct.category, MasterProduct.costCny, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description (+41 more)

### Community 2 - "AI schema"
Cohesion: 0.05
Nodes (48): prisma — Shared Schema, AI, ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.method, ThumbnailAnalysis.organization, ThumbnailAnalysis.overallScore, ThumbnailAnalysis.qualityAnalyzedAt (+40 more)

### Community 3 - "System schema"
Cohesion: 0.05
Nodes (45): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.label, ActionTask.notes (+37 more)

### Community 4 - "Inventory schema"
Cohesion: 0.06
Nodes (42): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.organization, Inventory.reorderPoint, Inventory.reorderQuantity (+34 more)

### Community 5 - "System schema"
Cohesion: 0.05
Nodes (39): System, BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description (+31 more)

### Community 6 - "Core schema"
Cohesion: 0.07
Nodes (37): ProductOption.availableStock, ProductOption.barcode, ProductOption.commissionRate, ProductOption.costPrice, ProductOption.createdAt, ProductOption.deletedAt, ProductOption.isActive, ProductOption.isBundle (+29 more)

### Community 7 - "AgentOS schema"
Cohesion: 0.06
Nodes (35): AgentRun.adapterType, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt, AgentRun.heartbeatAt (+27 more)

### Community 8 - "Orders schema"
Cohesion: 0.07
Nodes (34): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.metadata, OrderLineItem.option, OrderLineItem.organization, OrderLineItem.productName, OrderLineItem.quantity, OrderLineItem.status (+26 more)

### Community 9 - "Finance schema"
Cohesion: 0.06
Nodes (33): Finance, GradeHistory.calculatedAt, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization, GradeHistory.reason, GradeHistory.revenueScore (+25 more)

### Community 10 - "Sourcing schema"
Cohesion: 0.07
Nodes (32): Sourcing, CandidateImage.candidate, CandidateImage.createdAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.isDeleted, CandidateImage.isPrimary, CandidateImage.mimeType (+24 more)

### Community 11 - "System schema"
Cohesion: 0.08
Nodes (25): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.installCount, Marketplace.isPublished (+17 more)

### Community 12 - "Orders schema"
Cohesion: 0.1
Nodes (24): Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.memo, Order.metadata, Order.orderedAt (+16 more)

### Community 13 - "Advertising schema"
Cohesion: 0.09
Nodes (23): ExecutionLog.createdAt, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionTask.action, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt (+15 more)

### Community 14 - "Inventory schema"
Cohesion: 0.1
Nodes (23): PickingItem.createdAt, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.orderId, PickingItem.pickedAt, PickingItem.pickingList, PickingItem.productName (+15 more)

### Community 15 - "Supply schema"
Cohesion: 0.1
Nodes (20): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.inspectedAt, PurchaseOrder.orderDate, PurchaseOrder.organization (+12 more)

### Community 16 - "AgentOS schema"
Cohesion: 0.11
Nodes (19): AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name, AgentInstance.organization, AgentInstance.parent, AgentInstance.pausedAt (+11 more)

### Community 17 - "AgentOS schema"
Cohesion: 0.12
Nodes (19): AgentRunRequest.agentInstance, AgentRunRequest.claimedAt, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.createdAt, AgentRunRequest.finishedAt, AgentRunRequest.idempotencyKey, AgentRunRequest.lastErrorCode, AgentRunRequest.maxAttempts (+11 more)

### Community 18 - "AgentOS schema"
Cohesion: 0.12
Nodes (19): AgentOS, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decision, AgentAuthorizationEvent.organization, AgentAuthorizationEvent.policySnapshot, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints (+11 more)

### Community 19 - "AI schema"
Cohesion: 0.11
Nodes (19): ContentGeneration.contentType, ContentGeneration.createdAt, ContentGeneration.editedHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.generationInput, ContentGeneration.generationResult, ContentGeneration.retryCount (+11 more)

### Community 20 - "Orders schema"
Cohesion: 0.12
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 21 - "AI schema"
Cohesion: 0.12
Nodes (18): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height, ContentAsset.isDeleted (+10 more)

### Community 22 - "Channels schema"
Cohesion: 0.12
Nodes (18): ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank, ChannelListingDailySnapshot.createdAt (+10 more)

### Community 23 - "Channels schema"
Cohesion: 0.11
Nodes (18): ChannelScrapeRun.businessDate, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.matchedCount, ChannelScrapeRun.metaJson, ChannelScrapeRun.organization (+10 more)

### Community 24 - "Channels schema"
Cohesion: 0.12
Nodes (17): ChannelReconciliationItem.channelProductName, ChannelReconciliationItem.confidence, ChannelReconciliationItem.externalId, ChannelReconciliationItem.ignoredReason, ChannelReconciliationItem.lastObservedAt, ChannelReconciliationItem.legacyCode, ChannelReconciliationItem.linkedListingId, ChannelReconciliationItem.linkedMasterProductId (+9 more)

### Community 25 - "Advertising schema"
Cohesion: 0.12
Nodes (17): AdAction.actionType, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt, AdAction.currentValue, AdAction.errorMessage (+9 more)

### Community 26 - "Finance schema"
Cohesion: 0.15
Nodes (17): ProfitLoss.adCost, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit, ProfitLoss.orderCount, ProfitLoss.organization (+9 more)

### Community 27 - "Core schema"
Cohesion: 0.13
Nodes (16): Alert.actorUser, ThumbnailGeneration.triggeredByUser, User.avatarUrl, User.createdAt, User.email, User.id, User.isActive, User.lastLoginAt (+8 more)

### Community 28 - "Advertising schema"
Cohesion: 0.16
Nodes (15): Database ERD, Advertising, AdAction.externalId, AdAction.listing, AdAction.organization, AdAction.targetType, ChannelListing.master, ScrapeTarget.category (+7 more)

### Community 29 - "Orders schema"
Cohesion: 0.13
Nodes (15): Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.listing, Shipment.option, Shipment.order (+7 more)

### Community 30 - "AgentOS schema"
Cohesion: 0.14
Nodes (14): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.inputTokens, AgentCostEvent.metadata (+6 more)

### Community 31 - "Core schema"
Cohesion: 0.15
Nodes (14): ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo, ChannelListing.exposureStatus, ChannelListing.externalId, ChannelListing.freeShipOverAmount (+6 more)

### Community 32 - "Inventory schema"
Cohesion: 0.18
Nodes (13): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.items, StockAudit.matchedCount, StockAudit.notes (+5 more)

### Community 33 - "Orders schema"
Cohesion: 0.15
Nodes (13): CSRecord.assignee, CSRecord.content, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing, CSRecord.order (+5 more)

### Community 34 - "Supply schema"
Cohesion: 0.15
Nodes (13): PurchaseOrder.supplier, Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.leadTimeDays, Supplier.name, Supplier.notes (+5 more)

### Community 35 - "AgentOS schema"
Cohesion: 0.21
Nodes (12): AgentRunRequest.taskSession, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.lastRun, AgentTaskSession.metadata, AgentTaskSession.organization, AgentTaskSession.sessionDisplay (+4 more)

### Community 36 - "AgentOS schema"
Cohesion: 0.17
Nodes (12): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.organization, AgentRuntimeState.totalCostMicros (+4 more)

### Community 37 - "AI schema"
Cohesion: 0.17
Nodes (12): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt, Thumbnail.organization, Thumbnail.prevClickRate (+4 more)

### Community 38 - "Orders schema"
Cohesion: 0.2
Nodes (11): Review.content, Review.createdAt, Review.id, Review.listing, Review.organization, Review.platform, Review.rating, Review.reviewedAt (+3 more)

### Community 39 - "AgentOS schema"
Cohesion: 0.2
Nodes (10): AgentRunRequest.sourceWorkflowRun, WorkflowRun.contextData, WorkflowRun.error, WorkflowRun.organizationId, WorkflowRun.startedAt, WorkflowRun.status, WorkflowRun.steps, WorkflowRun.triggeredBy (+2 more)

### Community 40 - "Orders schema"
Cohesion: 0.2
Nodes (10): Order.id, UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.isNotified, UnshippedItem.organization, UnshippedItem.productName, UnshippedItem.quantity, UnshippedItem.reason (+2 more)

### Community 41 - "Channels schema"
Cohesion: 0.25
Nodes (9): Channels, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.matchStatus, ChannelScrapeSnapshot.observedAt, ChannelScrapeSnapshot.pageType, ChannelAccountDailyKpiSnapshot, ChannelScrapeSnapshot (+1 more)

### Community 42 - "Core schema"
Cohesion: 0.25
Nodes (8): OrganizationMembership.createdAt, OrganizationMembership.invitedBy, OrganizationMembership.joinedAt, OrganizationMembership.lastSelectedAt, OrganizationMembership.role, OrganizationMembership.status, OrganizationMembership, OrganizationMembership unique(organizationId, userId)

### Community 43 - "Channels schema"
Cohesion: 0.29
Nodes (8): AdAction.adTargetDaily, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.externalId, ChannelAdTargetDailySnapshot.firstObservedAt, ChannelAdTargetDailySnapshot.listing, ChannelAdTargetDailySnapshot.sampleCount, ChannelAdTargetDailySnapshot, ChannelAdTargetDailySnapshot unique(organizationId, channel, businessDate, targetType, targetKey)

### Community 44 - "Core schema"
Cohesion: 0.25
Nodes (8): externalOptionId canonical option identity, vendorItemId provider term, ChannelListingOption.createdAt, ChannelListingOption.isUnmatched, ChannelListingOption.salePrice, OrderLineItem.listingOption, ChannelListingOption, ChannelListingOption unique(listingId, externalOptionId)

### Community 45 - "Supply schema"
Cohesion: 0.25
Nodes (8): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.organization, SupplierPayment.paidDate, SupplierPayment.purchaseOrder, SupplierPayment.status, SupplierPayment.updatedAt, SupplierPayment

### Community 46 - "AgentOS schema"
Cohesion: 0.29
Nodes (7): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decisionReason, AgentApprovalRequest.organization, AgentApprovalRequest.status, AgentApprovalRequest

### Community 47 - "AgentOS schema"
Cohesion: 0.29
Nodes (7): AgentRunEvent.agentInstance, AgentRunEvent.createdAt, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.organization, AgentRunEvent, AgentRunEvent unique(runId, seq)

### Community 48 - "Supply schema"
Cohesion: 0.33
Nodes (7): Supply, SupplierProduct.createdAt, SupplierProduct.option, SupplierProduct.supplyPrice, SupplierProduct.updatedAt, SupplierProduct, SupplierProduct unique(supplierId, optionId)

### Community 49 - "Supply schema"
Cohesion: 0.4
Nodes (5): MasterSupplierProduct.createdAt, MasterSupplierProduct.isPrimary, MasterSupplierProduct.updatedAt, MasterSupplierProduct, MasterSupplierProduct unique(masterId, supplierId)

## Knowledge Gaps
- **692 isolated node(s):** `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority` (+687 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Advertising schema` to `Core schema`, `Core schema`, `AI schema`, `System schema`, `Inventory schema`, `System schema`, `Core schema`, `AgentOS schema`, `Orders schema`, `Finance schema`, `Sourcing schema`, `System schema`, `Orders schema`, `Advertising schema`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Orders schema`, `AI schema`, `Channels schema`, `Channels schema`, `Channels schema`, `Advertising schema`, `Finance schema`, `Core schema`, `Orders schema`, `AgentOS schema`, `Core schema`, `Inventory schema`, `Orders schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `Orders schema`, `Channels schema`, `Core schema`, `Channels schema`, `Core schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `Supply schema`, `Supply schema`, `AI schema`?**
  _High betweenness centrality (0.550) - this node is a cross-community bridge._
- **Why does `Organization` connect `Core schema` to `Core schema`, `AI schema`, `System schema`, `Inventory schema`, `System schema`, `Core schema`, `AgentOS schema`, `Orders schema`, `Finance schema`, `Sourcing schema`, `System schema`, `Orders schema`, `Advertising schema`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Orders schema`, `AI schema`, `Channels schema`, `Channels schema`, `Channels schema`, `Advertising schema`, `Finance schema`, `Advertising schema`, `Orders schema`, `AgentOS schema`, `Core schema`, `Inventory schema`, `Orders schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Orders schema`, `Orders schema`, `Channels schema`, `Core schema`, `Channels schema`, `Core schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`?**
  _High betweenness centrality (0.281) - this node is a cross-community bridge._
- **Why does `MasterProduct` connect `Core schema` to `Core schema`, `AI schema`, `Core schema`, `Finance schema`, `Sourcing schema`, `Supply schema`, `AI schema`, `Advertising schema`, `Core schema`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **What connects `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel` to the rest of the system?**
  _692 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core schema` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Core schema` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `AI schema` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._