# Graph Report - schema  (2026-06-03)

## Corpus Check
- 13 files · ~20,035 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1133 nodes · 1976 edges · 66 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Sourcing schema|Sourcing schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Sourcing schema|Sourcing schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 234 edges
2. `Organization` - 149 edges
3. `prisma — Shared Schema` - 115 edges
4. `MasterProduct` - 63 edges
5. `AgentRun` - 55 edges
6. `ProductOption` - 52 edges
7. `User` - 50 edges
8. `AgentRunRequest` - 47 edges
9. `AgentInstance` - 45 edges
10. `ChannelListing` - 41 edges
11. `Order` - 40 edges
12. `ContentGeneration` - 37 edges

## Surprising Connections (you probably didn't know these)
- `Database ERD` --mentions_field--> `AgentArtifact.targetId`  [EXTRACTED]
  docs/ERD.md → prisma/models/agents.prisma
- `Database ERD` --mentions_field--> `WorkflowTemplate.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/agents.prisma
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

## Import Cycles
- None detected.

## Communities (66 total, 0 thin omitted)

### Community 0 - "Core schema"
Cohesion: 0.04
Nodes (49): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.barcode, MasterProduct.category, MasterProduct.costCny, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description (+41 more)

### Community 1 - "System schema"
Cohesion: 0.05
Nodes (46): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.label, ActionTask.notes (+38 more)

### Community 2 - "System schema"
Cohesion: 0.05
Nodes (44): System, BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description (+36 more)

### Community 3 - "Sourcing schema"
Cohesion: 0.05
Nodes (41): prisma — Shared Schema, Sourcing, CandidateImage.candidate, CandidateImage.createdAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.isDeleted, CandidateImage.isPrimary (+33 more)

### Community 4 - "AgentOS schema"
Cohesion: 0.06
Nodes (36): AgentRun.adapterType, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt, AgentRun.heartbeatAt (+28 more)

### Community 5 - "AgentOS schema"
Cohesion: 0.08
Nodes (26): AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name, AgentInstance.organization, AgentInstance.parent, AgentInstance.pausedAt (+18 more)

### Community 6 - "Orders schema"
Cohesion: 0.10
Nodes (26): Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.memo, Order.metadata (+18 more)

### Community 7 - "System schema"
Cohesion: 0.08
Nodes (25): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.installCount, Marketplace.isPublished (+17 more)

### Community 8 - "Core schema"
Cohesion: 0.11
Nodes (24): ProductOption.availableStock, ProductOption.barcode, ProductOption.commissionRate, ProductOption.costPrice, ProductOption.createdAt, ProductOption.deletedAt, ProductOption.isActive, ProductOption.isBundle (+16 more)

### Community 9 - "AgentOS schema"
Cohesion: 0.10
Nodes (23): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decisionReason, AgentApprovalRequest.organization, AgentApprovalRequest.status, AgentToolInvocation.agentInstance, AgentToolInvocation.approvalRequest (+15 more)

### Community 10 - "AgentOS schema"
Cohesion: 0.09
Nodes (23): AgentConversation.createdAt, AgentConversation.createdByUserId, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization, AgentConversation.rootRequest, AgentConversation.status, AgentConversation.title (+15 more)

### Community 11 - "AgentOS schema"
Cohesion: 0.10
Nodes (23): AgentRunRequest.agentInstance, AgentRunRequest.claimedAt, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.createdAt, AgentRunRequest.delegatedByRun, AgentRunRequest.dependencyKeys, AgentRunRequest.displayName, AgentRunRequest.finishedAt (+15 more)

### Community 12 - "Advertising schema"
Cohesion: 0.09
Nodes (23): ExecutionLog.createdAt, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionTask.action, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt (+15 more)

### Community 13 - "Inventory schema"
Cohesion: 0.10
Nodes (23): PickingItem.createdAt, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.orderId, PickingItem.pickedAt, PickingItem.pickingList, PickingItem.productName (+15 more)

### Community 14 - "AI schema"
Cohesion: 0.10
Nodes (21): AI, ContentGeneration.contentType, ContentGeneration.createdAt, ContentGeneration.editedHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.generationInput, ContentGeneration.generationResult (+13 more)

### Community 15 - "Supply schema"
Cohesion: 0.10
Nodes (21): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.inspectedAt, PurchaseOrder.orderDate (+13 more)

### Community 16 - "AgentOS schema"
Cohesion: 0.12
Nodes (19): AgentOS, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decision, AgentAuthorizationEvent.organization, AgentAuthorizationEvent.policySnapshot, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints (+11 more)

### Community 17 - "Orders schema"
Cohesion: 0.12
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 18 - "AI schema"
Cohesion: 0.12
Nodes (19): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.organization, ThumbnailTracking.originalGrade, ThumbnailTracking.originalScore, ThumbnailTracking.reviewsAfter (+11 more)

### Community 19 - "Advertising schema"
Cohesion: 0.14
Nodes (18): Database ERD, Advertising, AdAction.externalId, AdAction.organization, AdAction.targetType, ChannelListing.master, ScrapeTarget.category, ScrapeTarget.createdAt (+10 more)

### Community 20 - "Advertising schema"
Cohesion: 0.12
Nodes (18): AdAction.actionType, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt, AdAction.currentValue, AdAction.errorMessage (+10 more)

### Community 21 - "Channels schema"
Cohesion: 0.12
Nodes (18): ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank, ChannelListingDailySnapshot.createdAt (+10 more)

### Community 22 - "Channels schema"
Cohesion: 0.11
Nodes (18): ChannelScrapeRun.businessDate, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.matchedCount, ChannelScrapeRun.metaJson, ChannelScrapeRun.organization (+10 more)

### Community 23 - "AI schema"
Cohesion: 0.12
Nodes (18): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height, ContentAsset.isDeleted (+10 more)

### Community 24 - "Orders schema"
Cohesion: 0.13
Nodes (18): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.metadata, OrderLineItem.option, OrderLineItem.organization, OrderLineItem.productName, OrderLineItem.quantity, OrderLineItem.status (+10 more)

### Community 25 - "Channels schema"
Cohesion: 0.12
Nodes (17): ChannelReconciliationItem.channelProductName, ChannelReconciliationItem.confidence, ChannelReconciliationItem.externalId, ChannelReconciliationItem.ignoredReason, ChannelReconciliationItem.lastObservedAt, ChannelReconciliationItem.legacyCode, ChannelReconciliationItem.linkedListingId, ChannelReconciliationItem.linkedMasterProductId (+9 more)

### Community 26 - "Finance schema"
Cohesion: 0.15
Nodes (17): ProfitLoss.adCost, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit, ProfitLoss.orderCount, ProfitLoss.organization (+9 more)

### Community 27 - "Channels schema"
Cohesion: 0.14
Nodes (16): externalOptionId canonical option identity, vendorItemId provider term, AdAction.adTargetDaily, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.externalId, ChannelAdTargetDailySnapshot.firstObservedAt, ChannelAdTargetDailySnapshot.listing, ChannelAdTargetDailySnapshot.sampleCount (+8 more)

### Community 28 - "Core schema"
Cohesion: 0.14
Nodes (16): AdAction.listing, ChannelListing.channelAccount, ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo, ChannelListing.exposureStatus (+8 more)

### Community 29 - "Core schema"
Cohesion: 0.13
Nodes (16): AgentRunRequest.requestedBy, ContentGeneration.triggeredByUser, User.avatarUrl, User.createdAt, User.email, User.id, User.isActive, User.lastLoginAt (+8 more)

### Community 30 - "Sourcing schema"
Cohesion: 0.14
Nodes (16): ContentGeneration.sourceCandidate, SourcingCandidate.costCny, SourcingCandidate.description, SourcingCandidate.imageUrl, SourcingCandidate.isDeleted, SourcingCandidate.organization, SourcingCandidate.promotedMaster, SourcingCandidate.rawData (+8 more)

### Community 31 - "Orders schema"
Cohesion: 0.16
Nodes (16): OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.metadata, OrderReturn.organization, OrderReturn.platform (+8 more)

### Community 32 - "Orders schema"
Cohesion: 0.13
Nodes (16): Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.id, Shipment.listing, Shipment.option (+8 more)

### Community 33 - "AI schema"
Cohesion: 0.22
Nodes (15): ContentGeneration.contentWorkspace, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.displayName, ContentWorkspace.isDeleted, ContentWorkspace.normalizedTitle, ContentWorkspace.organization, ContentWorkspace.ownerType (+7 more)

### Community 34 - "Supply schema"
Cohesion: 0.14
Nodes (15): PurchaseOrder.supplier, Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.id, Supplier.leadTimeDays, Supplier.name (+7 more)

### Community 35 - "AgentOS schema"
Cohesion: 0.14
Nodes (14): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.inputTokens, AgentCostEvent.metadata (+6 more)

### Community 36 - "Orders schema"
Cohesion: 0.15
Nodes (14): CSRecord.assignee, CSRecord.content, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing, CSRecord.order (+6 more)

### Community 37 - "AI schema"
Cohesion: 0.19
Nodes (14): ProductPreparation.contentWorkspace, ProductPreparation.createdAt, ProductPreparation.createdByUser, ProductPreparation.displayName, ProductPreparation.isCurrentForMaster, ProductPreparation.master, ProductPreparation.organization, ProductPreparation.registrationInput (+6 more)

### Community 38 - "Finance schema"
Cohesion: 0.16
Nodes (14): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.notes, SalesPlan.organization, SalesPlan.period, SalesPlan.targetOrders (+6 more)

### Community 39 - "AI schema"
Cohesion: 0.14
Nodes (14): ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.organization, ThumbnailGeneration.originalUrl, ThumbnailGeneration.sourceCandidate, ThumbnailGeneration.status, ThumbnailGeneration.triggeredByUser (+6 more)

### Community 40 - "Inventory schema"
Cohesion: 0.18
Nodes (13): Shipment.warehouse, Warehouse.address, Warehouse.code, Warehouse.createdAt, Warehouse.manager, Warehouse.name, Warehouse.organization, Warehouse.phone (+5 more)

### Community 41 - "Inventory schema"
Cohesion: 0.18
Nodes (13): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.items, StockAudit.matchedCount, StockAudit.notes (+5 more)

### Community 42 - "System schema"
Cohesion: 0.18
Nodes (12): ActivityEvent.createdAt, ActivityEvent.eventType, ActivityEvent.objectId, ActivityEvent.organization, ActivityEvent.source, ActivityEvent.title, Inventory.organization, Organization.createdAt (+4 more)

### Community 43 - "AgentOS schema"
Cohesion: 0.17
Nodes (12): AgentArtifact.agentInstance, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.organization, AgentArtifact.targetDomain, AgentArtifact.targetId, AgentArtifact.targetModel (+4 more)

### Community 44 - "AgentOS schema"
Cohesion: 0.21
Nodes (12): AgentRunRequest.taskSession, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.lastRun, AgentTaskSession.metadata, AgentTaskSession.organization, AgentTaskSession.sessionDisplay (+4 more)

### Community 45 - "AgentOS schema"
Cohesion: 0.17
Nodes (12): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.organization, AgentRuntimeState.totalCostMicros (+4 more)

### Community 46 - "Inventory schema"
Cohesion: 0.17
Nodes (12): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.reorderPoint, Inventory.reorderQuantity, Inventory.reservedStock (+4 more)

### Community 47 - "Inventory schema"
Cohesion: 0.20
Nodes (12): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.disposedQty, ReturnTransfer.option, ReturnTransfer.organization, ReturnTransfer.processedBy, ReturnTransfer.quantity, ReturnTransfer.restockedQty (+4 more)

### Community 48 - "AI schema"
Cohesion: 0.17
Nodes (12): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt, Thumbnail.organization, Thumbnail.prevClickRate (+4 more)

### Community 49 - "Core schema"
Cohesion: 0.22
Nodes (11): Core, CategoryMapping.coupangCategoryId, CategoryMapping.createdAt, CategoryMapping.internalCategory, CategoryMapping.isActive, CategoryMapping.organization, MasterCodeCounter.updatedAt, MasterCodeCounter.value (+3 more)

### Community 50 - "AI schema"
Cohesion: 0.18
Nodes (11): ContentWorkspace.currentDetailPageRevision, DetailPageArtifact.currentRevision, DetailPageRevision.artifact, DetailPageRevision.assetUrlMap, DetailPageRevision.contentGeneration, DetailPageRevision.createdAt, DetailPageRevision.createdByUser, DetailPageRevision.imageUrls (+3 more)

### Community 51 - "Finance schema"
Cohesion: 0.18
Nodes (11): GradeHistory.calculatedAt, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization, GradeHistory.reason, GradeHistory.revenueScore, GradeHistory.score (+3 more)

### Community 52 - "Orders schema"
Cohesion: 0.20
Nodes (11): Review.content, Review.createdAt, Review.id, Review.listing, Review.organization, Review.platform, Review.rating, Review.reviewedAt (+3 more)

### Community 53 - "AgentOS schema"
Cohesion: 0.20
Nodes (10): AgentRunRequest.sourceWorkflowRun, WorkflowRun.contextData, WorkflowRun.error, WorkflowRun.organizationId, WorkflowRun.startedAt, WorkflowRun.status, WorkflowRun.steps, WorkflowRun.triggeredBy (+2 more)

### Community 54 - "Core schema"
Cohesion: 0.24
Nodes (10): ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.isPrimary, ChannelAccount.organization, ChannelAccount.sellerId, ChannelAccount.status, ChannelAccount.updatedAt, ChannelAccount.vendorId (+2 more)

### Community 55 - "AI schema"
Cohesion: 0.20
Nodes (10): ContentGeneration.detailPageArtifact, ContentWorkspace.currentDetailPageArtifact, DetailPageArtifact.contentWorkspace, DetailPageArtifact.createdAt, DetailPageArtifact.organization, DetailPageArtifact.sourceCandidate, DetailPageArtifact.sourceContentGeneration, DetailPageArtifact.targetMaster (+2 more)

### Community 56 - "AI schema"
Cohesion: 0.20
Nodes (10): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.method, ThumbnailAnalysis.organization, ThumbnailAnalysis.overallScore, ThumbnailAnalysis.qualityAnalyzedAt, ThumbnailAnalysis.recompose, ThumbnailAnalysis.scores (+2 more)

### Community 57 - "Channels schema"
Cohesion: 0.25
Nodes (9): Channels, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.matchStatus, ChannelScrapeSnapshot.observedAt, ChannelScrapeSnapshot.pageType, ChannelAccountDailyKpiSnapshot, ChannelScrapeSnapshot (+1 more)

### Community 58 - "Finance schema"
Cohesion: 0.22
Nodes (9): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdBy, ManualLedger.description, ManualLedger.memo, ManualLedger.organization (+1 more)

### Community 59 - "Inventory schema"
Cohesion: 0.22
Nodes (9): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.notes, StockTransfer.quantity, StockTransfer.requestedBy, StockTransfer.toWarehouse, StockTransfer.updatedAt (+1 more)

### Community 60 - "Orders schema"
Cohesion: 0.22
Nodes (9): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.isNotified, UnshippedItem.option, UnshippedItem.organization, UnshippedItem.productName, UnshippedItem.quantity, UnshippedItem.reason (+1 more)

### Community 61 - "Supply schema"
Cohesion: 0.25
Nodes (8): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.organization, SupplierPayment.paidDate, SupplierPayment.purchaseOrder, SupplierPayment.status, SupplierPayment.updatedAt, SupplierPayment

### Community 62 - "Core schema"
Cohesion: 0.38
Nodes (7): BundleComponent.bundleOption, BundleComponent.componentOption, BundleComponent.createdAt, BundleComponent.organization, BundleComponent.updatedAt, BundleComponent, BundleComponent unique(bundleOptionId, componentOptionId)

### Community 63 - "Inventory schema"
Cohesion: 0.29
Nodes (7): StockTransaction.createdBy, StockTransaction.organization, StockTransaction.relatedId, StockTransaction.totalCost, StockTransaction.unitCost, StockTransaction.warehouse, StockTransaction

### Community 64 - "Supply schema"
Cohesion: 0.33
Nodes (6): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.isPrimary, MasterSupplierProduct.updatedAt, MasterSupplierProduct, MasterSupplierProduct unique(masterId, supplierId)

### Community 65 - "Supply schema"
Cohesion: 0.40
Nodes (6): SupplierProduct.createdAt, SupplierProduct.option, SupplierProduct.supplyPrice, SupplierProduct.updatedAt, SupplierProduct, SupplierProduct unique(supplierId, optionId)

## Knowledge Gaps
- **732 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+727 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Advertising schema` to `Core schema`, `System schema`, `System schema`, `Sourcing schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `System schema`, `Core schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Advertising schema`, `Inventory schema`, `AI schema`, `Supply schema`, `AgentOS schema`, `Orders schema`, `AI schema`, `Advertising schema`, `Channels schema`, `Channels schema`, `AI schema`, `Orders schema`, `Channels schema`, `Finance schema`, `Channels schema`, `Core schema`, `Core schema`, `Sourcing schema`, `Orders schema`, `Orders schema`, `AI schema`, `Supply schema`, `AgentOS schema`, `Orders schema`, `AI schema`, `Finance schema`, `AI schema`, `Inventory schema`, `Inventory schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `Inventory schema`, `AI schema`, `Core schema`, `AI schema`, `Finance schema`, `Orders schema`, `AgentOS schema`, `Core schema`, `AI schema`, `AI schema`, `Channels schema`, `Finance schema`, `Inventory schema`, `Orders schema`, `Supply schema`, `Core schema`, `Inventory schema`, `Supply schema`, `Supply schema`?**
  _High betweenness centrality (0.523) - this node is a cross-community bridge._
- **Why does `Organization` connect `System schema` to `Core schema`, `System schema`, `System schema`, `Sourcing schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `System schema`, `Core schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Advertising schema`, `Inventory schema`, `AI schema`, `Supply schema`, `AgentOS schema`, `Orders schema`, `AI schema`, `Advertising schema`, `Advertising schema`, `Channels schema`, `Channels schema`, `AI schema`, `Orders schema`, `Channels schema`, `Finance schema`, `Channels schema`, `Core schema`, `Sourcing schema`, `Orders schema`, `Orders schema`, `AI schema`, `Supply schema`, `AgentOS schema`, `Orders schema`, `AI schema`, `Finance schema`, `AI schema`, `Inventory schema`, `Inventory schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `Inventory schema`, `AI schema`, `Core schema`, `AI schema`, `Finance schema`, `Orders schema`, `Core schema`, `AI schema`, `AI schema`, `Channels schema`, `Finance schema`, `Inventory schema`, `Orders schema`, `Supply schema`, `Core schema`, `Inventory schema`?**
  _High betweenness centrality (0.282) - this node is a cross-community bridge._
- **Why does `AgentRun` connect `AgentOS schema` to `Sourcing schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `System schema`, `AgentOS schema`, `Advertising schema`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **What connects `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason` to the rest of the system?**
  _733 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core schema` be split into smaller, more focused modules?**
  _Cohesion score 0.04336734693877551 - nodes in this community are weakly interconnected._
- **Should `System schema` be split into smaller, more focused modules?**
  _Cohesion score 0.050241545893719805 - nodes in this community are weakly interconnected._
- **Should `System schema` be split into smaller, more focused modules?**
  _Cohesion score 0.04756871035940803 - nodes in this community are weakly interconnected._