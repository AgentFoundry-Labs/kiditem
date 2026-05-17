# Graph Report - schema  (2026-05-17)

## Corpus Check
- 13 files · ~19,227 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1074 nodes · 1856 edges · 68 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Sourcing schema|Sourcing schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Sourcing schema|Sourcing schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_prisma field prisma — Shared Schema|prisma field: prisma — Shared Schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AI schema|AI schema]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 221 edges
2. `Organization` - 140 edges
3. `prisma — Shared Schema` - 110 edges
4. `MasterProduct` - 63 edges
5. `ProductOption` - 52 edges
6. `AgentRun` - 50 edges
7. `User` - 48 edges
8. `ChannelListing` - 41 edges
9. `Order` - 40 edges
10. `AgentInstance` - 39 edges
11. `ContentGeneration` - 37 edges
12. `AgentRunRequest` - 34 edges

## Surprising Connections (you probably didn't know these)
- `Database ERD` --mentions_field--> `AdAction.targetType`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
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

## Communities (68 total, 0 thin omitted)

### Community 0 - "System schema"
Cohesion: 0.05
Nodes (46): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.label, ActionTask.notes (+38 more)

### Community 1 - "Advertising schema"
Cohesion: 0.05
Nodes (45): AdAction.actionType, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt, AdAction.currentValue, AdAction.errorMessage (+37 more)

### Community 2 - "Core schema"
Cohesion: 0.06
Nodes (43): BundleComponent.bundleOption, BundleComponent.componentOption, BundleComponent.createdAt, BundleComponent.organization, BundleComponent.updatedAt, ProductOption.availableStock, ProductOption.barcode, ProductOption.commissionRate (+35 more)

### Community 3 - "System schema"
Cohesion: 0.05
Nodes (39): System, BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description (+31 more)

### Community 4 - "Core schema"
Cohesion: 0.05
Nodes (39): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.barcode, MasterProduct.category, MasterProduct.costCny, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description (+31 more)

### Community 5 - "AgentOS schema"
Cohesion: 0.06
Nodes (36): AgentRun.adapterType, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt, AgentRun.heartbeatAt (+28 more)

### Community 6 - "Core schema"
Cohesion: 0.07
Nodes (31): Core, CategoryMapping.coupangCategoryId, CategoryMapping.createdAt, CategoryMapping.internalCategory, CategoryMapping.isActive, CategoryMapping.organization, LegalEntity.address, LegalEntity.businessNumber (+23 more)

### Community 7 - "Orders schema"
Cohesion: 0.1
Nodes (26): Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.memo, Order.metadata (+18 more)

### Community 8 - "System schema"
Cohesion: 0.08
Nodes (25): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.installCount, Marketplace.isPublished (+17 more)

### Community 9 - "Inventory schema"
Cohesion: 0.1
Nodes (23): PickingItem.createdAt, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.orderId, PickingItem.pickedAt, PickingItem.pickingList, PickingItem.productName (+15 more)

### Community 10 - "Supply schema"
Cohesion: 0.1
Nodes (20): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.inspectedAt, PurchaseOrder.orderDate, PurchaseOrder.organization (+12 more)

### Community 11 - "AI schema"
Cohesion: 0.11
Nodes (20): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height, ContentAsset.isDeleted (+12 more)

### Community 12 - "AgentOS schema"
Cohesion: 0.11
Nodes (19): AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name, AgentInstance.organization, AgentInstance.parent, AgentInstance.pausedAt (+11 more)

### Community 13 - "AgentOS schema"
Cohesion: 0.12
Nodes (19): AgentRunRequest.agentInstance, AgentRunRequest.claimedAt, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.createdAt, AgentRunRequest.finishedAt, AgentRunRequest.idempotencyKey, AgentRunRequest.lastErrorCode, AgentRunRequest.maxAttempts (+11 more)

### Community 14 - "Orders schema"
Cohesion: 0.12
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 15 - "Channels schema"
Cohesion: 0.12
Nodes (18): ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank, ChannelListingDailySnapshot.createdAt (+10 more)

### Community 16 - "Channels schema"
Cohesion: 0.11
Nodes (18): ChannelScrapeRun.businessDate, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.matchedCount, ChannelScrapeRun.metaJson, ChannelScrapeRun.organization (+10 more)

### Community 17 - "AI schema"
Cohesion: 0.12
Nodes (18): ContentGeneration.contentType, ContentGeneration.createdAt, ContentGeneration.editedHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.generationInput, ContentGeneration.generationResult, ContentGeneration.retryCount (+10 more)

### Community 18 - "Orders schema"
Cohesion: 0.13
Nodes (18): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.metadata, OrderLineItem.option, OrderLineItem.organization, OrderLineItem.productName, OrderLineItem.quantity, OrderLineItem.status (+10 more)

### Community 19 - "Finance schema"
Cohesion: 0.15
Nodes (17): ProfitLoss.adCost, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit, ProfitLoss.orderCount, ProfitLoss.organization (+9 more)

### Community 20 - "Channels schema"
Cohesion: 0.12
Nodes (17): ChannelReconciliationItem.channelProductName, ChannelReconciliationItem.confidence, ChannelReconciliationItem.externalId, ChannelReconciliationItem.ignoredReason, ChannelReconciliationItem.lastObservedAt, ChannelReconciliationItem.legacyCode, ChannelReconciliationItem.linkedListingId, ChannelReconciliationItem.linkedMasterProductId (+9 more)

### Community 21 - "Sourcing schema"
Cohesion: 0.13
Nodes (17): CandidateImage.candidate, ContentGeneration.sourceCandidate, SourcingCandidate.costCny, SourcingCandidate.description, SourcingCandidate.imageUrl, SourcingCandidate.isDeleted, SourcingCandidate.organization, SourcingCandidate.promotedMaster (+9 more)

### Community 22 - "AgentOS schema"
Cohesion: 0.17
Nodes (16): Database ERD, Advertising, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decision, AgentAuthorizationEvent.organization, AgentAuthorizationEvent.policySnapshot, ScrapeTarget.category (+8 more)

### Community 23 - "Core schema"
Cohesion: 0.14
Nodes (16): ChannelListing.channelAccount, ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo, ChannelListing.exposureStatus, ChannelListing.externalId (+8 more)

### Community 24 - "AI schema"
Cohesion: 0.2
Nodes (16): ContentGeneration.contentWorkspace, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.displayName, ContentWorkspace.isDeleted, ContentWorkspace.normalizedTitle, ContentWorkspace.organization, ContentWorkspace.ownerType (+8 more)

### Community 25 - "Orders schema"
Cohesion: 0.13
Nodes (16): Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.id, Shipment.listing, Shipment.option (+8 more)

### Community 26 - "Orders schema"
Cohesion: 0.16
Nodes (16): OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.metadata, OrderReturn.organization, OrderReturn.platform (+8 more)

### Community 27 - "Supply schema"
Cohesion: 0.14
Nodes (15): PurchaseOrder.supplier, Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.id, Supplier.leadTimeDays, Supplier.name (+7 more)

### Community 28 - "Core schema"
Cohesion: 0.14
Nodes (15): ContentGeneration.triggeredByUser, User.avatarUrl, User.createdAt, User.email, User.id, User.isActive, User.lastLoginAt, User.name (+7 more)

### Community 29 - "AgentOS schema"
Cohesion: 0.14
Nodes (14): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.inputTokens, AgentCostEvent.metadata (+6 more)

### Community 30 - "Finance schema"
Cohesion: 0.16
Nodes (14): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.notes, SalesPlan.organization, SalesPlan.period, SalesPlan.targetOrders (+6 more)

### Community 31 - "AI schema"
Cohesion: 0.19
Nodes (14): ProductPreparation.contentWorkspace, ProductPreparation.createdAt, ProductPreparation.createdByUser, ProductPreparation.displayName, ProductPreparation.isCurrentForMaster, ProductPreparation.master, ProductPreparation.organization, ProductPreparation.registrationInput (+6 more)

### Community 32 - "Orders schema"
Cohesion: 0.15
Nodes (14): CSRecord.assignee, CSRecord.content, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing, CSRecord.order (+6 more)

### Community 33 - "AgentOS schema"
Cohesion: 0.17
Nodes (13): AgentOS, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentToolDefinition.createdAt, AgentToolDefinition.credentialKind, AgentToolDefinition.description, AgentToolDefinition.inputSchemaJson (+5 more)

### Community 34 - "Inventory schema"
Cohesion: 0.15
Nodes (13): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.organization, Inventory.reorderPoint, Inventory.reorderQuantity (+5 more)

### Community 35 - "Inventory schema"
Cohesion: 0.18
Nodes (13): Shipment.warehouse, Warehouse.address, Warehouse.code, Warehouse.createdAt, Warehouse.manager, Warehouse.name, Warehouse.organization, Warehouse.phone (+5 more)

### Community 36 - "Inventory schema"
Cohesion: 0.18
Nodes (13): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.items, StockAudit.matchedCount, StockAudit.notes (+5 more)

### Community 37 - "AgentOS schema"
Cohesion: 0.17
Nodes (12): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.organization, AgentRuntimeState.totalCostMicros (+4 more)

### Community 38 - "AgentOS schema"
Cohesion: 0.21
Nodes (12): AgentRunRequest.taskSession, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.lastRun, AgentTaskSession.metadata, AgentTaskSession.organization, AgentTaskSession.sessionDisplay (+4 more)

### Community 39 - "AI schema"
Cohesion: 0.17
Nodes (12): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt, Thumbnail.organization, Thumbnail.prevClickRate (+4 more)

### Community 40 - "Sourcing schema"
Cohesion: 0.17
Nodes (12): CandidateImage.createdAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.isPrimary, CandidateImage.mimeType, CandidateImage.sortOrder, CandidateImage.source, CandidateImage.storageKey (+4 more)

### Community 41 - "AI schema"
Cohesion: 0.18
Nodes (12): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.originalGrade, ThumbnailTracking.originalScore, ThumbnailTracking.reviewsAfter, ThumbnailTracking.salesAfter (+4 more)

### Community 42 - "Orders schema"
Cohesion: 0.2
Nodes (11): Review.content, Review.createdAt, Review.id, Review.listing, Review.organization, Review.platform, Review.rating, Review.reviewedAt (+3 more)

### Community 43 - "AI schema"
Cohesion: 0.18
Nodes (11): ThumbnailGeneration.attemptCount, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.originalUrl, ThumbnailGeneration.sourceCandidate, ThumbnailGeneration.status, ThumbnailGeneration.triggeredByUser, ThumbnailGenerationCandidate.height, ThumbnailGenerationEvent.attemptNumber (+3 more)

### Community 44 - "AI schema"
Cohesion: 0.18
Nodes (11): ContentWorkspace.currentDetailPageRevision, DetailPageArtifact.currentRevision, DetailPageRevision.artifact, DetailPageRevision.assetUrlMap, DetailPageRevision.contentGeneration, DetailPageRevision.createdAt, DetailPageRevision.createdByUser, DetailPageRevision.imageUrls (+3 more)

### Community 45 - "AgentOS schema"
Cohesion: 0.2
Nodes (10): AgentRunRequest.sourceWorkflowRun, WorkflowRun.contextData, WorkflowRun.error, WorkflowRun.organizationId, WorkflowRun.startedAt, WorkflowRun.status, WorkflowRun.steps, WorkflowRun.triggeredBy (+2 more)

### Community 46 - "Core schema"
Cohesion: 0.24
Nodes (10): ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.isPrimary, ChannelAccount.organization, ChannelAccount.sellerId, ChannelAccount.status, ChannelAccount.updatedAt, ChannelAccount.vendorId (+2 more)

### Community 47 - "Finance schema"
Cohesion: 0.2
Nodes (10): GradeHistory.calculatedAt, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.reason, GradeHistory.revenueScore, GradeHistory.score, GradeHistory.velocityScore (+2 more)

### Community 48 - "Core schema"
Cohesion: 0.24
Nodes (10): GradeHistory.organization, Organization.createdAt, Organization.updatedAt, ProcessingCost.organization, SystemSetting.createdAt, SystemSetting.organization, SystemSetting.updatedAt, Organization (+2 more)

### Community 49 - "AI schema"
Cohesion: 0.2
Nodes (10): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.method, ThumbnailAnalysis.organization, ThumbnailAnalysis.overallScore, ThumbnailAnalysis.qualityAnalyzedAt, ThumbnailAnalysis.recompose, ThumbnailAnalysis.scores (+2 more)

### Community 50 - "AI schema"
Cohesion: 0.2
Nodes (10): ContentGeneration.detailPageArtifact, ContentWorkspace.currentDetailPageArtifact, DetailPageArtifact.contentWorkspace, DetailPageArtifact.createdAt, DetailPageArtifact.organization, DetailPageArtifact.sourceCandidate, DetailPageArtifact.sourceContentGeneration, DetailPageArtifact.targetMaster (+2 more)

### Community 51 - "Inventory schema"
Cohesion: 0.2
Nodes (10): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.notes, StockTransfer.organization, StockTransfer.quantity, StockTransfer.requestedBy, StockTransfer.toWarehouse (+2 more)

### Community 52 - "Finance schema"
Cohesion: 0.22
Nodes (9): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdBy, ManualLedger.description, ManualLedger.memo, ManualLedger.organization (+1 more)

### Community 53 - "Finance schema"
Cohesion: 0.22
Nodes (9): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.master, ProcessingCost.processType, ProcessingCost.productName, ProcessingCost.quantity, ProcessingCost.totalCost, ProcessingCost.vendor (+1 more)

### Community 54 - "Channels schema"
Cohesion: 0.25
Nodes (9): Channels, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.matchStatus, ChannelScrapeSnapshot.observedAt, ChannelScrapeSnapshot.pageType, ChannelAccountDailyKpiSnapshot, ChannelScrapeSnapshot (+1 more)

### Community 55 - "Orders schema"
Cohesion: 0.22
Nodes (9): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.isNotified, UnshippedItem.option, UnshippedItem.organization, UnshippedItem.productName, UnshippedItem.quantity, UnshippedItem.reason (+1 more)

### Community 56 - "Supply schema"
Cohesion: 0.25
Nodes (8): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.organization, SupplierPayment.paidDate, SupplierPayment.purchaseOrder, SupplierPayment.status, SupplierPayment.updatedAt, SupplierPayment

### Community 57 - "Channels schema"
Cohesion: 0.29
Nodes (8): AdAction.adTargetDaily, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.externalId, ChannelAdTargetDailySnapshot.firstObservedAt, ChannelAdTargetDailySnapshot.listing, ChannelAdTargetDailySnapshot.sampleCount, ChannelAdTargetDailySnapshot, ChannelAdTargetDailySnapshot unique(organizationId, channel, businessDate, targetType, targetKey)

### Community 58 - "Core schema"
Cohesion: 0.25
Nodes (8): externalOptionId canonical option identity, vendorItemId provider term, ChannelListingOption.createdAt, ChannelListingOption.isUnmatched, ChannelListingOption.salePrice, OrderLineItem.listingOption, ChannelListingOption, ChannelListingOption unique(listingId, externalOptionId)

### Community 59 - "AgentOS schema"
Cohesion: 0.29
Nodes (7): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decisionReason, AgentApprovalRequest.organization, AgentApprovalRequest.status, AgentApprovalRequest

### Community 60 - "AgentOS schema"
Cohesion: 0.29
Nodes (7): AgentRunEvent.agentInstance, AgentRunEvent.createdAt, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.organization, AgentRunEvent, AgentRunEvent unique(runId, seq)

### Community 61 - "System schema"
Cohesion: 0.29
Nodes (7): ActivityEvent.createdAt, ActivityEvent.eventType, ActivityEvent.objectId, ActivityEvent.organization, ActivityEvent.source, ActivityEvent.title, ActivityEvent

### Community 62 - "prisma field: prisma — Shared Schema"
Cohesion: 0.29
Nodes (7): prisma — Shared Schema, Sourcing, CandidateImage.isDeleted, CandidateImage.organization, ThumbnailGeneration.organization, ThumbnailGenerationEvent.organization, ThumbnailTracking.organization

### Community 63 - "AI schema"
Cohesion: 0.29
Nodes (7): AI, ThumbnailGeneration.inputMeta, ThumbnailGenerationInputImage.mimeType, ThumbnailRegistrationAttempt.errorMessage, ThumbnailRegistrationAttempt.externalId, ThumbnailRegistrationAttempt.screenshotUrl, ThumbnailRegistrationAttempt

### Community 64 - "Inventory schema"
Cohesion: 0.29
Nodes (7): StockTransaction.createdBy, StockTransaction.organization, StockTransaction.relatedId, StockTransaction.totalCost, StockTransaction.unitCost, StockTransaction.warehouse, StockTransaction

### Community 65 - "Supply schema"
Cohesion: 0.33
Nodes (6): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.isPrimary, MasterSupplierProduct.updatedAt, MasterSupplierProduct, MasterSupplierProduct unique(masterId, supplierId)

### Community 66 - "Supply schema"
Cohesion: 0.4
Nodes (6): SupplierProduct.createdAt, SupplierProduct.option, SupplierProduct.supplyPrice, SupplierProduct.updatedAt, SupplierProduct, SupplierProduct unique(supplierId, optionId)

### Community 67 - "AI schema"
Cohesion: 0.4
Nodes (6): ThumbnailTrackingDailySnapshot.capturedAt, ThumbnailTrackingDailySnapshot.rawCellTexts, ThumbnailTrackingDailySnapshot.reviewCount, ThumbnailTrackingDailySnapshot.scrapeStatus, ThumbnailTrackingDailySnapshot, ThumbnailTrackingDailySnapshot unique(trackingId, capturedDate)

## Knowledge Gaps
- **701 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+696 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `AgentOS schema` to `System schema`, `Advertising schema`, `Core schema`, `System schema`, `Core schema`, `AgentOS schema`, `Core schema`, `Orders schema`, `System schema`, `Inventory schema`, `Supply schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `Channels schema`, `Channels schema`, `AI schema`, `Orders schema`, `Finance schema`, `Channels schema`, `Sourcing schema`, `Core schema`, `AI schema`, `Orders schema`, `Orders schema`, `Supply schema`, `Core schema`, `AgentOS schema`, `Finance schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Sourcing schema`, `AI schema`, `Orders schema`, `AI schema`, `AI schema`, `AgentOS schema`, `Core schema`, `Finance schema`, `Core schema`, `AI schema`, `AI schema`, `Inventory schema`, `Finance schema`, `Finance schema`, `Channels schema`, `Orders schema`, `Supply schema`, `Channels schema`, `Core schema`, `AgentOS schema`, `AgentOS schema`, `System schema`, `prisma field: prisma — Shared Schema`, `AI schema`, `Inventory schema`, `Supply schema`, `Supply schema`, `AI schema`?**
  _High betweenness centrality (0.515) - this node is a cross-community bridge._
- **Why does `Organization` connect `Core schema` to `System schema`, `Advertising schema`, `Core schema`, `System schema`, `Core schema`, `AgentOS schema`, `Core schema`, `Orders schema`, `System schema`, `Inventory schema`, `Supply schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `Channels schema`, `Channels schema`, `AI schema`, `Orders schema`, `Finance schema`, `Channels schema`, `Sourcing schema`, `AgentOS schema`, `Core schema`, `AI schema`, `Orders schema`, `Orders schema`, `Supply schema`, `AgentOS schema`, `Finance schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Sourcing schema`, `AI schema`, `Orders schema`, `AI schema`, `AI schema`, `Core schema`, `Finance schema`, `AI schema`, `AI schema`, `Inventory schema`, `Finance schema`, `Finance schema`, `Channels schema`, `Orders schema`, `Supply schema`, `Channels schema`, `Core schema`, `AgentOS schema`, `AgentOS schema`, `System schema`, `prisma field: prisma — Shared Schema`, `AI schema`, `Inventory schema`, `AI schema`?**
  _High betweenness centrality (0.273) - this node is a cross-community bridge._
- **Why does `AgentRun` connect `AgentOS schema` to `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `prisma field: prisma — Shared Schema`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **What connects `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason` to the rest of the system?**
  _702 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `System schema` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Advertising schema` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Core schema` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._