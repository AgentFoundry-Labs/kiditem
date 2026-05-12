# Graph Report - schema  (2026-05-12)

## Corpus Check
- 13 files · ~16,612 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 968 nodes · 1632 edges · 55 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Sourcing schema|Sourcing schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Sourcing schema|Sourcing schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 207 edges
2. `Organization` - 130 edges
3. `prisma — Shared Schema` - 98 edges
4. `ProductOption` - 52 edges
5. `MasterProduct` - 51 edges
6. `AgentRun` - 49 edges
7. `Order` - 40 edges
8. `AgentInstance` - 39 edges
9. `ChannelListing` - 39 edges
10. `User` - 38 edges
11. `AgentRunRequest` - 34 edges
12. `Alert` - 31 edges

## Surprising Connections (you probably didn't know these)
- `Database ERD` --mentions_field--> `AdAction.externalId`  [EXTRACTED]
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
- `Database ERD` --mentions_field--> `User.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/core.prisma
- `Database ERD` --mentions_field--> `CategoryMapping.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/core.prisma

## Communities (55 total, 0 thin omitted)

### Community 0 - "Core schema"
Cohesion: 0.06
Nodes (48): Core, BundleComponent.bundleOption, BundleComponent.componentOption, BundleComponent.createdAt, BundleComponent.organization, BundleComponent.updatedAt, CategoryMapping.coupangCategoryId, CategoryMapping.createdAt (+40 more)

### Community 1 - "System schema"
Cohesion: 0.05
Nodes (46): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.label, ActionTask.notes (+38 more)

### Community 2 - "Core schema"
Cohesion: 0.05
Nodes (44): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.barcode, MasterProduct.category, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description, MasterProduct.detailPageUrl (+36 more)

### Community 3 - "Inventory schema"
Cohesion: 0.06
Nodes (42): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.organization, Inventory.reorderPoint, Inventory.reorderQuantity (+34 more)

### Community 4 - "Core schema"
Cohesion: 0.07
Nodes (36): ProductOption.availableStock, ProductOption.barcode, ProductOption.commissionRate, ProductOption.costPrice, ProductOption.createdAt, ProductOption.deletedAt, ProductOption.isActive, ProductOption.isBundle (+28 more)

### Community 5 - "AgentOS schema"
Cohesion: 0.06
Nodes (35): AgentRun.adapterType, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt, AgentRun.heartbeatAt (+27 more)

### Community 6 - "System schema"
Cohesion: 0.06
Nodes (35): System, ActivityEvent.createdAt, ActivityEvent.eventType, ActivityEvent.objectId, ActivityEvent.organization, ActivityEvent.source, ActivityEvent.title, BusinessRule.actionType (+27 more)

### Community 7 - "Orders schema"
Cohesion: 0.07
Nodes (34): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.metadata, OrderLineItem.option, OrderLineItem.organization, OrderLineItem.productName, OrderLineItem.quantity, OrderLineItem.status (+26 more)

### Community 8 - "Finance schema"
Cohesion: 0.06
Nodes (33): Finance, GradeHistory.calculatedAt, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization, GradeHistory.reason, GradeHistory.revenueScore (+25 more)

### Community 9 - "Orders schema"
Cohesion: 0.1
Nodes (26): Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.memo, Order.metadata (+18 more)

### Community 10 - "System schema"
Cohesion: 0.08
Nodes (25): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.installCount, Marketplace.isPublished (+17 more)

### Community 11 - "Inventory schema"
Cohesion: 0.1
Nodes (23): PickingItem.createdAt, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.orderId, PickingItem.pickedAt, PickingItem.pickingList, PickingItem.productName (+15 more)

### Community 12 - "Supply schema"
Cohesion: 0.1
Nodes (20): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.inspectedAt, PurchaseOrder.orderDate, PurchaseOrder.organization (+12 more)

### Community 13 - "Advertising schema"
Cohesion: 0.11
Nodes (19): AdAction.actionType, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt, AdAction.currentValue, AdAction.errorMessage (+11 more)

### Community 14 - "AgentOS schema"
Cohesion: 0.12
Nodes (19): AgentOS, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decision, AgentAuthorizationEvent.organization, AgentAuthorizationEvent.policySnapshot, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints (+11 more)

### Community 15 - "AgentOS schema"
Cohesion: 0.12
Nodes (19): AgentRunRequest.agentInstance, AgentRunRequest.claimedAt, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.createdAt, AgentRunRequest.finishedAt, AgentRunRequest.idempotencyKey, AgentRunRequest.lastErrorCode, AgentRunRequest.maxAttempts (+11 more)

### Community 16 - "Orders schema"
Cohesion: 0.12
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 17 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name, AgentInstance.organization, AgentInstance.parent, AgentInstance.pausedAt (+10 more)

### Community 18 - "Channels schema"
Cohesion: 0.11
Nodes (18): ChannelScrapeRun.businessDate, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.matchedCount, ChannelScrapeRun.metaJson, ChannelScrapeRun.organization (+10 more)

### Community 19 - "Channels schema"
Cohesion: 0.12
Nodes (18): ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank, ChannelListingDailySnapshot.createdAt (+10 more)

### Community 20 - "Channels schema"
Cohesion: 0.12
Nodes (17): ChannelReconciliationItem.channelProductName, ChannelReconciliationItem.confidence, ChannelReconciliationItem.externalId, ChannelReconciliationItem.ignoredReason, ChannelReconciliationItem.lastObservedAt, ChannelReconciliationItem.legacyCode, ChannelReconciliationItem.linkedListingId, ChannelReconciliationItem.linkedMasterProductId (+9 more)

### Community 21 - "Finance schema"
Cohesion: 0.15
Nodes (17): ProfitLoss.adCost, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit, ProfitLoss.orderCount, ProfitLoss.organization (+9 more)

### Community 22 - "Sourcing schema"
Cohesion: 0.12
Nodes (16): Sourcing, CandidateImage.candidate, CandidateImage.createdAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.isDeleted, CandidateImage.isPrimary, CandidateImage.mimeType (+8 more)

### Community 23 - "Core schema"
Cohesion: 0.13
Nodes (16): ThumbnailGeneration.triggeredByUser, User.agentInstance, User.avatarUrl, User.createdAt, User.email, User.id, User.isActive, User.lastLoginAt (+8 more)

### Community 24 - "Core schema"
Cohesion: 0.14
Nodes (15): ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo, ChannelListing.exposureStatus, ChannelListing.externalId, ChannelListing.freeShipOverAmount (+7 more)

### Community 25 - "Orders schema"
Cohesion: 0.13
Nodes (15): Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.listing, Shipment.option, Shipment.order (+7 more)

### Community 26 - "Sourcing schema"
Cohesion: 0.15
Nodes (15): SourcingCandidate.costCny, SourcingCandidate.description, SourcingCandidate.imageUrl, SourcingCandidate.isDeleted, SourcingCandidate.organization, SourcingCandidate.promotedMaster, SourcingCandidate.rawData, SourcingCandidate.rejectedAt (+7 more)

### Community 27 - "Advertising schema"
Cohesion: 0.14
Nodes (14): ExecutionLog.createdAt, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionTask.action, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt (+6 more)

### Community 28 - "AgentOS schema"
Cohesion: 0.14
Nodes (14): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.inputTokens, AgentCostEvent.metadata (+6 more)

### Community 29 - "Inventory schema"
Cohesion: 0.18
Nodes (13): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.items, StockAudit.matchedCount, StockAudit.notes (+5 more)

### Community 30 - "Orders schema"
Cohesion: 0.15
Nodes (13): CSRecord.assignee, CSRecord.content, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing, CSRecord.order (+5 more)

### Community 31 - "Supply schema"
Cohesion: 0.15
Nodes (13): PurchaseOrder.supplier, Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.leadTimeDays, Supplier.name, Supplier.notes (+5 more)

### Community 32 - "Advertising schema"
Cohesion: 0.21
Nodes (12): Database ERD, Advertising, AdAction.organization, AdAction.targetType, ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.isActive, ScrapeTarget.label (+4 more)

### Community 33 - "AgentOS schema"
Cohesion: 0.17
Nodes (12): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.organization, AgentRuntimeState.totalCostMicros (+4 more)

### Community 34 - "AgentOS schema"
Cohesion: 0.21
Nodes (12): AgentRunRequest.taskSession, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.lastRun, AgentTaskSession.metadata, AgentTaskSession.organization, AgentTaskSession.sessionDisplay (+4 more)

### Community 35 - "AI schema"
Cohesion: 0.18
Nodes (12): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.originalGrade, ThumbnailTracking.originalScore, ThumbnailTracking.reviewsAfter, ThumbnailTracking.salesAfter (+4 more)

### Community 36 - "AI schema"
Cohesion: 0.2
Nodes (12): prisma — Shared Schema, AI, Thumbnail.organization, ThumbnailGeneration.inputMeta, ThumbnailGeneration.organization, ThumbnailGenerationEvent.organization, ThumbnailGenerationInputImage.mimeType, ThumbnailRegistrationAttempt.errorMessage (+4 more)

### Community 37 - "AI schema"
Cohesion: 0.18
Nodes (11): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt, Thumbnail.prevClickRate, Thumbnail.status (+3 more)

### Community 38 - "Orders schema"
Cohesion: 0.2
Nodes (11): Review.content, Review.createdAt, Review.id, Review.listing, Review.organization, Review.platform, Review.rating, Review.reviewedAt (+3 more)

### Community 39 - "AI schema"
Cohesion: 0.18
Nodes (11): ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.organization, ContentGeneration.originalImages, ContentGeneration.processedImages, ContentGeneration.retryCount (+3 more)

### Community 40 - "AgentOS schema"
Cohesion: 0.2
Nodes (10): AgentRunRequest.sourceWorkflowRun, WorkflowRun.contextData, WorkflowRun.error, WorkflowRun.organizationId, WorkflowRun.startedAt, WorkflowRun.status, WorkflowRun.steps, WorkflowRun.triggeredBy (+2 more)

### Community 41 - "AI schema"
Cohesion: 0.2
Nodes (10): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.method, ThumbnailAnalysis.organization, ThumbnailAnalysis.overallScore, ThumbnailAnalysis.qualityAnalyzedAt, ThumbnailAnalysis.recompose, ThumbnailAnalysis.scores (+2 more)

### Community 42 - "Advertising schema"
Cohesion: 0.22
Nodes (9): ExecutionTask.worker, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentUrl, ExecutionWorker.lastHeartbeatAt, ExecutionWorker.metaJson, ExecutionWorker.organization, ExecutionWorker.status (+1 more)

### Community 43 - "Core schema"
Cohesion: 0.22
Nodes (9): externalOptionId canonical option identity, vendorItemId provider term, ChannelAdTargetDailySnapshot.listing, ChannelListingOption.createdAt, ChannelListingOption.isUnmatched, ChannelListingOption.salePrice, OrderLineItem.listingOption, ChannelListingOption (+1 more)

### Community 44 - "AI schema"
Cohesion: 0.22
Nodes (9): ThumbnailGeneration.attemptCount, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.originalUrl, ThumbnailGeneration.status, ThumbnailGenerationCandidate.height, ThumbnailGenerationEvent.attemptNumber, ThumbnailGenerationEvent.eventType, ThumbnailGenerationEvent.toStatus (+1 more)

### Community 45 - "Channels schema"
Cohesion: 0.25
Nodes (9): Channels, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.matchStatus, ChannelScrapeSnapshot.observedAt, ChannelScrapeSnapshot.pageType, ChannelAccountDailyKpiSnapshot, ChannelScrapeSnapshot (+1 more)

### Community 46 - "Orders schema"
Cohesion: 0.22
Nodes (9): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.isNotified, UnshippedItem.option, UnshippedItem.organization, UnshippedItem.productName, UnshippedItem.quantity, UnshippedItem.reason (+1 more)

### Community 47 - "Core schema"
Cohesion: 0.25
Nodes (8): OrganizationMembership.createdAt, OrganizationMembership.invitedBy, OrganizationMembership.joinedAt, OrganizationMembership.lastSelectedAt, OrganizationMembership.role, OrganizationMembership.status, OrganizationMembership, OrganizationMembership unique(organizationId, userId)

### Community 48 - "Supply schema"
Cohesion: 0.25
Nodes (8): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.organization, SupplierPayment.paidDate, SupplierPayment.purchaseOrder, SupplierPayment.status, SupplierPayment.updatedAt, SupplierPayment

### Community 49 - "Channels schema"
Cohesion: 0.33
Nodes (7): AdAction.adTargetDaily, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.externalId, ChannelAdTargetDailySnapshot.firstObservedAt, ChannelAdTargetDailySnapshot.sampleCount, ChannelAdTargetDailySnapshot, ChannelAdTargetDailySnapshot unique(organizationId, channel, businessDate, targetType, targetKey)

### Community 50 - "AgentOS schema"
Cohesion: 0.29
Nodes (7): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decisionReason, AgentApprovalRequest.organization, AgentApprovalRequest.status, AgentApprovalRequest

### Community 51 - "AgentOS schema"
Cohesion: 0.29
Nodes (7): AgentRunEvent.agentInstance, AgentRunEvent.createdAt, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.organization, AgentRunEvent, AgentRunEvent unique(runId, seq)

### Community 52 - "AI schema"
Cohesion: 0.4
Nodes (6): ThumbnailTrackingDailySnapshot.capturedAt, ThumbnailTrackingDailySnapshot.rawCellTexts, ThumbnailTrackingDailySnapshot.reviewCount, ThumbnailTrackingDailySnapshot.scrapeStatus, ThumbnailTrackingDailySnapshot, ThumbnailTrackingDailySnapshot unique(trackingId, capturedDate)

### Community 53 - "Supply schema"
Cohesion: 0.33
Nodes (6): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.isPrimary, MasterSupplierProduct.updatedAt, MasterSupplierProduct, MasterSupplierProduct unique(masterId, supplierId)

### Community 54 - "Supply schema"
Cohesion: 0.4
Nodes (6): SupplierProduct.createdAt, SupplierProduct.option, SupplierProduct.supplyPrice, SupplierProduct.updatedAt, SupplierProduct, SupplierProduct unique(supplierId, optionId)

## Knowledge Gaps
- **658 isolated node(s):** `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority` (+653 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Advertising schema` to `Core schema`, `System schema`, `Core schema`, `Inventory schema`, `Core schema`, `AgentOS schema`, `System schema`, `Orders schema`, `Finance schema`, `Orders schema`, `System schema`, `Inventory schema`, `Supply schema`, `Advertising schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Channels schema`, `Finance schema`, `Sourcing schema`, `Core schema`, `Core schema`, `Orders schema`, `Sourcing schema`, `Advertising schema`, `AgentOS schema`, `Inventory schema`, `Orders schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `AI schema`, `AI schema`, `Orders schema`, `AI schema`, `AgentOS schema`, `AI schema`, `Advertising schema`, `Core schema`, `AI schema`, `Channels schema`, `Orders schema`, `Core schema`, `Supply schema`, `Channels schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Supply schema`, `Supply schema`?**
  _High betweenness centrality (0.541) - this node is a cross-community bridge._
- **Why does `Organization` connect `Core schema` to `System schema`, `Core schema`, `Inventory schema`, `Core schema`, `AgentOS schema`, `System schema`, `Orders schema`, `Finance schema`, `Orders schema`, `System schema`, `Inventory schema`, `Supply schema`, `Advertising schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Channels schema`, `Finance schema`, `Sourcing schema`, `Core schema`, `Orders schema`, `Sourcing schema`, `AgentOS schema`, `Inventory schema`, `Orders schema`, `Supply schema`, `Advertising schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `AI schema`, `AI schema`, `Orders schema`, `AI schema`, `AI schema`, `Advertising schema`, `Core schema`, `AI schema`, `Channels schema`, `Orders schema`, `Core schema`, `Supply schema`, `Channels schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`?**
  _High betweenness centrality (0.286) - this node is a cross-community bridge._
- **Why does `AgentRun` connect `AgentOS schema` to `Core schema`, `AgentOS schema`, `AgentOS schema`, `Advertising schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **What connects `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel` to the rest of the system?**
  _658 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core schema` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `System schema` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Core schema` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._