# Graph Report - schema  (2026-05-13)

## Corpus Check
- 13 files · ~17,730 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1019 nodes · 1709 edges · 61 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Sourcing schema|Sourcing schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Sourcing schema|Sourcing schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 212 edges
2. `Organization` - 132 edges
3. `prisma — Shared Schema` - 103 edges
4. `MasterProduct` - 60 edges
5. `ProductOption` - 52 edges
6. `AgentRun` - 49 edges
7. `User` - 40 edges
8. `Order` - 40 edges
9. `AgentInstance` - 39 edges
10. `ChannelListing` - 39 edges
11. `AgentRunRequest` - 34 edges
12. `ContentAsset` - 32 edges

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
- `Database ERD` --mentions_field--> `ChannelReconciliationItem.legacyCode`  [EXTRACTED]
  docs/ERD.md → prisma/models/channels.prisma

## Communities (61 total, 0 thin omitted)

### Community 0 - "System schema"
Cohesion: 0.05
Nodes (46): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.label, ActionTask.notes (+38 more)

### Community 1 - "Core schema"
Cohesion: 0.06
Nodes (43): BundleComponent.bundleOption, BundleComponent.componentOption, BundleComponent.createdAt, BundleComponent.organization, BundleComponent.updatedAt, ProductOption.availableStock, ProductOption.barcode, ProductOption.commissionRate (+35 more)

### Community 2 - "Inventory schema"
Cohesion: 0.06
Nodes (41): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.organization, Inventory.reorderPoint, Inventory.reorderQuantity (+33 more)

### Community 3 - "Core schema"
Cohesion: 0.05
Nodes (39): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.barcode, MasterProduct.category, MasterProduct.costCny, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description (+31 more)

### Community 4 - "System schema"
Cohesion: 0.05
Nodes (39): System, BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description (+31 more)

### Community 5 - "AgentOS schema"
Cohesion: 0.06
Nodes (34): AgentRun.adapterType, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt, AgentRun.heartbeatAt (+26 more)

### Community 6 - "Orders schema"
Cohesion: 0.07
Nodes (34): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.metadata, OrderLineItem.option, OrderLineItem.organization, OrderLineItem.productName, OrderLineItem.quantity, OrderLineItem.status (+26 more)

### Community 7 - "Orders schema"
Cohesion: 0.1
Nodes (26): Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.memo, Order.metadata (+18 more)

### Community 8 - "System schema"
Cohesion: 0.08
Nodes (25): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.installCount, Marketplace.isPublished (+17 more)

### Community 9 - "AI schema"
Cohesion: 0.09
Nodes (23): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height, ContentAsset.isDeleted, ContentAsset.label (+15 more)

### Community 10 - "Inventory schema"
Cohesion: 0.1
Nodes (23): PickingItem.createdAt, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.orderId, PickingItem.pickedAt, PickingItem.pickingList, PickingItem.productName (+15 more)

### Community 11 - "Advertising schema"
Cohesion: 0.1
Nodes (21): AdAction.actionType, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt, AdAction.currentValue, AdAction.errorMessage (+13 more)

### Community 12 - "Core schema"
Cohesion: 0.12
Nodes (21): Database ERD, Core, MasterCodeCounter.updatedAt, MasterCodeCounter.value, Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt (+13 more)

### Community 13 - "Supply schema"
Cohesion: 0.1
Nodes (20): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.inspectedAt, PurchaseOrder.orderDate, PurchaseOrder.organization (+12 more)

### Community 14 - "AgentOS schema"
Cohesion: 0.12
Nodes (19): AgentRunRequest.agentInstance, AgentRunRequest.claimedAt, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.createdAt, AgentRunRequest.finishedAt, AgentRunRequest.idempotencyKey, AgentRunRequest.lastErrorCode, AgentRunRequest.maxAttempts (+11 more)

### Community 15 - "AgentOS schema"
Cohesion: 0.12
Nodes (19): AgentOS, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decision, AgentAuthorizationEvent.organization, AgentAuthorizationEvent.policySnapshot, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints (+11 more)

### Community 16 - "AI schema"
Cohesion: 0.15
Nodes (19): prisma — Shared Schema, AI, ThumbnailGeneration.attemptCount, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.inputMeta, ThumbnailGeneration.organization, ThumbnailGeneration.originalUrl, ThumbnailGeneration.status (+11 more)

### Community 17 - "AI schema"
Cohesion: 0.11
Nodes (19): ContentAsset.contentGeneration, ContentGeneration.contentType, ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.editedHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.originalImages (+11 more)

### Community 18 - "Orders schema"
Cohesion: 0.12
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 19 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name, AgentInstance.organization, AgentInstance.parent, AgentInstance.pausedAt (+10 more)

### Community 20 - "Core schema"
Cohesion: 0.12
Nodes (18): ContentAsset.createdByUser, ContentGeneration.triggeredByUser, ThumbnailGeneration.triggeredByUser, User.agentInstance, User.avatarUrl, User.createdAt, User.email, User.id (+10 more)

### Community 21 - "Channels schema"
Cohesion: 0.12
Nodes (18): ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank, ChannelListingDailySnapshot.createdAt (+10 more)

### Community 22 - "Channels schema"
Cohesion: 0.11
Nodes (18): ChannelScrapeRun.businessDate, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.matchedCount, ChannelScrapeRun.metaJson, ChannelScrapeRun.organization (+10 more)

### Community 23 - "Sourcing schema"
Cohesion: 0.13
Nodes (17): Sourcing, ContentGenerationSource.sourceCandidate, SourcingCandidate.costCny, SourcingCandidate.description, SourcingCandidate.imageUrl, SourcingCandidate.isDeleted, SourcingCandidate.organization, SourcingCandidate.promotedMaster (+9 more)

### Community 24 - "Channels schema"
Cohesion: 0.12
Nodes (17): ChannelReconciliationItem.channelProductName, ChannelReconciliationItem.confidence, ChannelReconciliationItem.externalId, ChannelReconciliationItem.ignoredReason, ChannelReconciliationItem.lastObservedAt, ChannelReconciliationItem.legacyCode, ChannelReconciliationItem.linkedListingId, ChannelReconciliationItem.linkedMasterProductId (+9 more)

### Community 25 - "Finance schema"
Cohesion: 0.15
Nodes (17): ProfitLoss.adCost, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit, ProfitLoss.orderCount, ProfitLoss.organization (+9 more)

### Community 26 - "Sourcing schema"
Cohesion: 0.12
Nodes (16): CandidateImage.candidate, CandidateImage.createdAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.isDeleted, CandidateImage.isPrimary, CandidateImage.mimeType, CandidateImage.organization (+8 more)

### Community 27 - "Channels schema"
Cohesion: 0.14
Nodes (16): externalOptionId canonical option identity, vendorItemId provider term, AdAction.adTargetDaily, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.externalId, ChannelAdTargetDailySnapshot.firstObservedAt, ChannelAdTargetDailySnapshot.listing, ChannelAdTargetDailySnapshot.sampleCount (+8 more)

### Community 28 - "Core schema"
Cohesion: 0.14
Nodes (15): ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo, ChannelListing.exposureStatus, ChannelListing.externalId, ChannelListing.freeShipOverAmount (+7 more)

### Community 29 - "Advertising schema"
Cohesion: 0.14
Nodes (14): ExecutionLog.createdAt, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionTask.action, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt (+6 more)

### Community 30 - "AgentOS schema"
Cohesion: 0.14
Nodes (14): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.inputTokens, AgentCostEvent.metadata (+6 more)

### Community 31 - "AI schema"
Cohesion: 0.17
Nodes (13): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.organization, ThumbnailTracking.originalGrade, ThumbnailTracking.originalScore, ThumbnailTracking.reviewsAfter (+5 more)

### Community 32 - "Orders schema"
Cohesion: 0.15
Nodes (13): CSRecord.assignee, CSRecord.content, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing, CSRecord.order (+5 more)

### Community 33 - "Finance schema"
Cohesion: 0.18
Nodes (13): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.notes, SalesPlan.organization, SalesPlan.period, SalesPlan.targetOrders (+5 more)

### Community 34 - "Inventory schema"
Cohesion: 0.18
Nodes (13): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.items, StockAudit.matchedCount, StockAudit.notes (+5 more)

### Community 35 - "Supply schema"
Cohesion: 0.15
Nodes (13): PurchaseOrder.supplier, Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.leadTimeDays, Supplier.name, Supplier.notes (+5 more)

### Community 36 - "AgentOS schema"
Cohesion: 0.21
Nodes (12): AgentRunRequest.taskSession, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.lastRun, AgentTaskSession.metadata, AgentTaskSession.organization, AgentTaskSession.sessionDisplay (+4 more)

### Community 37 - "AgentOS schema"
Cohesion: 0.17
Nodes (12): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.organization, AgentRuntimeState.totalCostMicros (+4 more)

### Community 38 - "Core schema"
Cohesion: 0.17
Nodes (12): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name, LegalEntity.organization (+4 more)

### Community 39 - "AI schema"
Cohesion: 0.17
Nodes (12): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt, Thumbnail.organization, Thumbnail.prevClickRate (+4 more)

### Community 40 - "Orders schema"
Cohesion: 0.2
Nodes (11): Review.content, Review.createdAt, Review.id, Review.listing, Review.organization, Review.platform, Review.rating, Review.reviewedAt (+3 more)

### Community 41 - "AgentOS schema"
Cohesion: 0.2
Nodes (10): AgentRunRequest.sourceWorkflowRun, WorkflowRun.contextData, WorkflowRun.error, WorkflowRun.organizationId, WorkflowRun.startedAt, WorkflowRun.status, WorkflowRun.steps, WorkflowRun.triggeredBy (+2 more)

### Community 42 - "AI schema"
Cohesion: 0.2
Nodes (10): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.method, ThumbnailAnalysis.organization, ThumbnailAnalysis.overallScore, ThumbnailAnalysis.qualityAnalyzedAt, ThumbnailAnalysis.recompose, ThumbnailAnalysis.scores (+2 more)

### Community 43 - "Core schema"
Cohesion: 0.24
Nodes (10): ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.isPrimary, ChannelAccount.organization, ChannelAccount.sellerId, ChannelAccount.status, ChannelAccount.updatedAt, ChannelAccount.vendorId (+2 more)

### Community 44 - "Finance schema"
Cohesion: 0.2
Nodes (10): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.master, ProcessingCost.organization, ProcessingCost.processType, ProcessingCost.productName, ProcessingCost.quantity, ProcessingCost.totalCost (+2 more)

### Community 45 - "Finance schema"
Cohesion: 0.2
Nodes (10): GradeHistory.calculatedAt, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.reason, GradeHistory.revenueScore, GradeHistory.score, GradeHistory.velocityScore (+2 more)

### Community 46 - "Core schema"
Cohesion: 0.24
Nodes (10): AgentRun.organization, GradeHistory.organization, Organization.createdAt, Organization.updatedAt, SystemSetting.createdAt, SystemSetting.organization, SystemSetting.updatedAt, Organization (+2 more)

### Community 47 - "Advertising schema"
Cohesion: 0.22
Nodes (9): Advertising, ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.isActive, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.url (+1 more)

### Community 48 - "Advertising schema"
Cohesion: 0.22
Nodes (9): ExecutionTask.worker, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentUrl, ExecutionWorker.lastHeartbeatAt, ExecutionWorker.metaJson, ExecutionWorker.organization, ExecutionWorker.status (+1 more)

### Community 49 - "Channels schema"
Cohesion: 0.25
Nodes (9): Channels, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.matchStatus, ChannelScrapeSnapshot.observedAt, ChannelScrapeSnapshot.pageType, ChannelAccountDailyKpiSnapshot, ChannelScrapeSnapshot (+1 more)

### Community 50 - "Orders schema"
Cohesion: 0.22
Nodes (9): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.isNotified, UnshippedItem.option, UnshippedItem.organization, UnshippedItem.productName, UnshippedItem.quantity, UnshippedItem.reason (+1 more)

### Community 51 - "Finance schema"
Cohesion: 0.22
Nodes (9): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdBy, ManualLedger.description, ManualLedger.memo, ManualLedger.organization (+1 more)

### Community 52 - "Core schema"
Cohesion: 0.25
Nodes (8): OrganizationMembership.createdAt, OrganizationMembership.invitedBy, OrganizationMembership.joinedAt, OrganizationMembership.lastSelectedAt, OrganizationMembership.role, OrganizationMembership.status, OrganizationMembership, OrganizationMembership unique(organizationId, userId)

### Community 53 - "Supply schema"
Cohesion: 0.25
Nodes (8): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.organization, SupplierPayment.paidDate, SupplierPayment.purchaseOrder, SupplierPayment.status, SupplierPayment.updatedAt, SupplierPayment

### Community 54 - "AgentOS schema"
Cohesion: 0.29
Nodes (7): AgentRunEvent.agentInstance, AgentRunEvent.createdAt, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.organization, AgentRunEvent, AgentRunEvent unique(runId, seq)

### Community 55 - "AgentOS schema"
Cohesion: 0.29
Nodes (7): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decisionReason, AgentApprovalRequest.organization, AgentApprovalRequest.status, AgentApprovalRequest

### Community 56 - "Core schema"
Cohesion: 0.38
Nodes (7): CategoryMapping.coupangCategoryId, CategoryMapping.createdAt, CategoryMapping.internalCategory, CategoryMapping.isActive, CategoryMapping.organization, CategoryMapping, CategoryMapping unique(organizationId, internalCategory)

### Community 57 - "System schema"
Cohesion: 0.29
Nodes (7): ActivityEvent.createdAt, ActivityEvent.eventType, ActivityEvent.objectId, ActivityEvent.organization, ActivityEvent.source, ActivityEvent.title, ActivityEvent

### Community 58 - "Supply schema"
Cohesion: 0.33
Nodes (7): Supply, SupplierProduct.createdAt, SupplierProduct.option, SupplierProduct.supplyPrice, SupplierProduct.updatedAt, SupplierProduct, SupplierProduct unique(supplierId, optionId)

### Community 59 - "AI schema"
Cohesion: 0.4
Nodes (6): ThumbnailTrackingDailySnapshot.capturedAt, ThumbnailTrackingDailySnapshot.rawCellTexts, ThumbnailTrackingDailySnapshot.reviewCount, ThumbnailTrackingDailySnapshot.scrapeStatus, ThumbnailTrackingDailySnapshot, ThumbnailTrackingDailySnapshot unique(trackingId, capturedDate)

### Community 60 - "Supply schema"
Cohesion: 0.4
Nodes (5): MasterSupplierProduct.createdAt, MasterSupplierProduct.isPrimary, MasterSupplierProduct.updatedAt, MasterSupplierProduct, MasterSupplierProduct unique(masterId, supplierId)

## Knowledge Gaps
- **696 isolated node(s):** `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority` (+691 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Core schema` to `System schema`, `Core schema`, `Inventory schema`, `Core schema`, `System schema`, `AgentOS schema`, `Orders schema`, `Orders schema`, `System schema`, `AI schema`, `Inventory schema`, `Advertising schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `Core schema`, `Channels schema`, `Channels schema`, `Sourcing schema`, `Channels schema`, `Finance schema`, `Sourcing schema`, `Channels schema`, `Core schema`, `Advertising schema`, `AgentOS schema`, `AI schema`, `Orders schema`, `Finance schema`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `AI schema`, `Core schema`, `Finance schema`, `Finance schema`, `Core schema`, `Advertising schema`, `Advertising schema`, `Channels schema`, `Orders schema`, `Finance schema`, `Core schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `System schema`, `Supply schema`, `AI schema`, `Supply schema`?**
  _High betweenness centrality (0.538) - this node is a cross-community bridge._
- **Why does `Organization` connect `Core schema` to `System schema`, `Core schema`, `Inventory schema`, `Core schema`, `System schema`, `AgentOS schema`, `Orders schema`, `Orders schema`, `System schema`, `AI schema`, `Inventory schema`, `Advertising schema`, `Core schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Sourcing schema`, `Channels schema`, `Finance schema`, `Sourcing schema`, `Channels schema`, `Core schema`, `AgentOS schema`, `AI schema`, `Orders schema`, `Finance schema`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `AI schema`, `Orders schema`, `AI schema`, `Core schema`, `Finance schema`, `Finance schema`, `Advertising schema`, `Advertising schema`, `Channels schema`, `Orders schema`, `Finance schema`, `Core schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `System schema`, `AI schema`?**
  _High betweenness centrality (0.285) - this node is a cross-community bridge._
- **Why does `MasterProduct` connect `Core schema` to `Core schema`, `AI schema`, `AI schema`, `Core schema`, `Finance schema`, `Core schema`, `Finance schema`, `AI schema`, `AI schema`, `Supply schema`, `Sourcing schema`, `Core schema`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **What connects `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel` to the rest of the system?**
  _696 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `System schema` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Core schema` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Inventory schema` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._