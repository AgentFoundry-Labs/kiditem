# Graph Report - schema  (2026-07-13)

## Corpus Check
- 13 files · ~24,026 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2535 nodes · 4132 edges · 117 communities (115 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Core schema
- Channels schema
- AgentOS schema
- AI schema
- AgentOS schema
- Channels schema
- Core schema
- AI schema
- AgentOS schema
- Inventory schema
- Inventory schema
- AI schema
- Sourcing schema
- Sourcing schema
- Core schema
- AgentOS schema
- Channels schema
- AI schema
- AgentOS schema
- Channels schema
- AI schema
- Channels schema
- Core schema
- Orders schema
- Advertising schema
- Channels schema
- Inventory schema
- AgentOS schema
- AI schema
- AI schema
- Orders schema
- Supply schema
- Inventory schema
- AgentOS schema
- AgentOS schema
- System schema
- Core schema
- Inventory schema
- AgentOS schema
- Channels schema
- Orders schema
- System schema
- Core schema
- AI schema
- Orders schema
- AgentOS schema
- System schema
- Channels schema
- System schema
- Inventory schema
- Finance schema
- Orders schema
- AI schema
- AI schema
- Orders schema
- AgentOS schema
- Inventory schema
- Core schema
- Inventory schema
- Supply schema
- AI schema
- Inventory schema
- AI schema
- Orders schema
- AI schema
- Channels schema
- AI schema
- AgentOS schema
- AgentOS schema
- AgentOS schema
- Core schema
- Channels schema
- Orders schema
- Inventory schema
- Supply schema
- Supply schema
- AgentOS schema
- Finance schema
- AI schema
- Finance schema
- Finance schema
- Inventory schema
- Advertising schema
- Core schema
- Supply schema
- Inventory schema
- Inventory schema
- AI schema
- System schema
- Advertising schema
- Finance schema
- Inventory schema
- AI schema
- Supply schema
- Channels schema
- AI schema
- Orders schema
- Core schema
- Core schema
- Orders schema
- System schema
- Core schema
- System schema
- Advertising schema
- System schema
- Advertising schema
- System schema
- Core schema
- prisma field: Order.channelAccountId
- prisma field: prisma — Shared Schema
- Core schema
- prisma field: ChannelReconciliationItem.channel
- prisma field: ActionTask.date
- prisma field: ChannelListingDailySnapshot.businessDate
- prisma field: Alert.operationKey
- prisma field: ChannelListingDailySnapshot.id
- prisma field: ChannelReconciliationItem.id

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 360 edges
2. `Organization` - 214 edges
3. `prisma — Shared Schema` - 147 edges
4. `MasterProduct` - 115 edges
5. `ChannelListing` - 93 edges
6. `AgentRunRequest` - 74 edges
7. `ProductOption` - 73 edges
8. `AgentRun` - 68 edges
9. `ProductPreparation` - 66 edges
10. `ChannelListingDailySnapshot` - 63 edges
11. `ChannelListingOption` - 61 edges
12. `User` - 60 edges

## Surprising Connections (you probably didn't know these)
- `Database ERD` --mentions_field--> `AdAction.targetType`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `ScrapeTarget.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AgentToolDefinition.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/agents.prisma
- `Database ERD` --mentions_field--> `AgentArtifact.targetId`  [EXTRACTED]
  docs/ERD.md → prisma/models/agents.prisma
- `Database ERD` --mentions_field--> `WorkflowTemplate.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/agents.prisma
- `Database ERD` --mentions_field--> `ThumbnailRegistrationAttempt.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/ai.prisma
- `Database ERD` --mentions_field--> `ChannelScrapeSnapshot.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/channels.prisma

## Import Cycles
- None detected.

## Communities (117 total, 2 thin omitted)

### Community 0 - "Core schema"
Cohesion: 0.04
Nodes (53): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.adTier, MasterProduct.barcode, MasterProduct.brand, MasterProduct.category, MasterProduct.code, MasterProduct.costCny (+45 more)

### Community 1 - "Channels schema"
Cohesion: 0.04
Nodes (52): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+44 more)

### Community 2 - "AgentOS schema"
Cohesion: 0.05
Nodes (45): AgentRunRequest.agentInstance, AgentRunRequest.agentInstanceId, AgentRunRequest.attempts, AgentRunRequest.claimedAt, AgentRunRequest.claimedBy, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.coalescedIntoRequestId, AgentRunRequest.conversation (+37 more)

### Community 3 - "AI schema"
Cohesion: 0.06
Nodes (44): ProductPreparation.appliedToMasterAt, ProductPreparation.channelAccount, ProductPreparation.channelAccountId, ProductPreparation.channelListing, ProductPreparation.channelListingId, ProductPreparation.contentWorkspace, ProductPreparation.createdAt, ProductPreparation.createdByUser (+36 more)

### Community 4 - "AgentOS schema"
Cohesion: 0.05
Nodes (43): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+35 more)

### Community 5 - "Channels schema"
Cohesion: 0.06
Nodes (42): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel, ChannelAdTargetDailySnapshot.clicks (+34 more)

### Community 6 - "Core schema"
Cohesion: 0.06
Nodes (41): ChannelListing.abcGrade, ChannelListing.adBudgetLimit, ChannelListing.adTier, ChannelListing.brand, ChannelListing.category, ChannelListing.channel, ChannelListing.channelAccount, ChannelListing.channelAccountId (+33 more)

### Community 7 - "AI schema"
Cohesion: 0.06
Nodes (41): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+33 more)

### Community 8 - "AgentOS schema"
Cohesion: 0.06
Nodes (38): AgentRunEvent.agentInstance, AgentRunEvent.agentInstanceId, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message (+30 more)

### Community 9 - "Inventory schema"
Cohesion: 0.06
Nodes (38): Shipment.warehouseId, StockTransaction.createdAt, StockTransaction.createdBy, StockTransaction.id, StockTransaction.note, StockTransaction.option, StockTransaction.optionId, StockTransaction.optionName (+30 more)

### Community 10 - "Inventory schema"
Cohesion: 0.06
Nodes (37): SellpiaStockSnapshotItem.appliedTransactionId, SellpiaStockSnapshotItem.barcode, SellpiaStockSnapshotItem.blockingReasons, SellpiaStockSnapshotItem.createdAt, SellpiaStockSnapshotItem.diff, SellpiaStockSnapshotItem.diffRate, SellpiaStockSnapshotItem.id, SellpiaStockSnapshotItem.inventory (+29 more)

### Community 11 - "AI schema"
Cohesion: 0.08
Nodes (36): ContentWorkspace.channelListing, ContentWorkspace.channelListingId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageRevision, ContentWorkspace.currentThumbnailSelection, ContentWorkspace.currentThumbnailSelectionId (+28 more)

### Community 12 - "Sourcing schema"
Cohesion: 0.07
Nodes (35): Sourcing, CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id (+27 more)

### Community 13 - "Sourcing schema"
Cohesion: 0.08
Nodes (32): SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.id, SourcingCandidate.imageUrl, SourcingCandidate.isDeleted (+24 more)

### Community 14 - "Core schema"
Cohesion: 0.08
Nodes (31): externalOptionId canonical option identity, vendorItemId provider term, ChannelListingOption.attributesJson, ChannelListingOption.channelAccount, ChannelListingOption.channelAccountId, ChannelListingOption.commissionRate, ChannelListingOption.costPriceOverride, ChannelListingOption.createdAt (+23 more)

### Community 15 - "AgentOS schema"
Cohesion: 0.08
Nodes (31): AgentOS, AgentAuthorizationEvent.toolId, AgentInstanceToolPolicy.agentInstance, AgentInstanceToolPolicy.agentInstanceId, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentInstanceToolPolicy.dryRunMode (+23 more)

### Community 16 - "Channels schema"
Cohesion: 0.07
Nodes (31): ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.externalId, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isActive, ChannelListingOptionDailySnapshot.isOfferWinner (+23 more)

### Community 17 - "AI schema"
Cohesion: 0.07
Nodes (31): ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.contentWorkspaceId, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.editedHtmlSavedAt (+23 more)

### Community 18 - "AgentOS schema"
Cohesion: 0.08
Nodes (30): AgentToolInvocation.agentInstance, AgentToolInvocation.agentInstanceId, AgentToolInvocation.approvalRequest, AgentToolInvocation.approvalRequestId, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt (+22 more)

### Community 19 - "Channels schema"
Cohesion: 0.07
Nodes (30): ChannelReconciliationItem.channelImageUrl, ChannelReconciliationItem.channelOptionName, ChannelReconciliationItem.channelProductName, ChannelReconciliationItem.channelStatus, ChannelReconciliationItem.channelUrl, ChannelReconciliationItem.confidence, ChannelReconciliationItem.conflictJson, ChannelReconciliationItem.createdAt (+22 more)

### Community 20 - "AI schema"
Cohesion: 0.07
Nodes (30): ProductPreparation.selectedThumbnailGenerationId, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.createdAt, ThumbnailGeneration.deletedAt, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.errorMessage, ThumbnailGeneration.grade (+22 more)

### Community 21 - "Channels schema"
Cohesion: 0.08
Nodes (29): Channels, ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelListingOptionDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.externalId (+21 more)

### Community 22 - "Core schema"
Cohesion: 0.09
Nodes (29): ProductOption.availableStock, ProductOption.barcode, ProductOption.commissionRate, ProductOption.costPrice, ProductOption.createdAt, ProductOption.deletedAt, ProductOption.id, ProductOption.isActive (+21 more)

### Community 23 - "Orders schema"
Cohesion: 0.09
Nodes (28): Database ERD, ChannelAdTargetDailySnapshot.listingOptionId, ChannelListingOption.barcode, ChannelListingOption.isActive, ChannelListingOption.isUnmatched, ChannelListingOption.optionId, ChannelListingOptionDailySnapshot.externalOptionId, ChannelScrapeSnapshot.externalOptionId (+20 more)

### Community 24 - "Advertising schema"
Cohesion: 0.07
Nodes (28): AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+20 more)

### Community 25 - "Channels schema"
Cohesion: 0.08
Nodes (28): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.channelAccount, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.id (+20 more)

### Community 26 - "Inventory schema"
Cohesion: 0.08
Nodes (28): RocketInventoryLedger.createdAt, RocketInventoryLedger.createdBy, RocketInventoryLedger.eventType, RocketInventoryLedger.id, RocketInventoryLedger.inventory, RocketInventoryLedger.masterProduct, RocketInventoryLedger.masterProductId, RocketInventoryLedger.metaJson (+20 more)

### Community 27 - "AgentOS schema"
Cohesion: 0.08
Nodes (27): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.agentInstanceId, AgentApprovalRequest.approver, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy, AgentApprovalRequest.decisionReason (+19 more)

### Community 28 - "AI schema"
Cohesion: 0.09
Nodes (27): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.generationGroup (+19 more)

### Community 29 - "AI schema"
Cohesion: 0.08
Nodes (27): ContentGeneration.detailPageArtifactId, ContentWorkspace.currentDetailPageArtifactId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.contentWorkspaceId, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.createdByUserId, DetailPageArtifact.currentRevision (+19 more)

### Community 30 - "Orders schema"
Cohesion: 0.10
Nodes (27): OrderReturn.channelAccount, OrderReturn.channelAccountId, OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.id (+19 more)

### Community 31 - "Supply schema"
Cohesion: 0.08
Nodes (27): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+19 more)

### Community 32 - "Inventory schema"
Cohesion: 0.08
Nodes (27): SellpiaNewProductCandidate.barcode, SellpiaNewProductCandidate.createdAt, SellpiaNewProductCandidate.createdInventory, SellpiaNewProductCandidate.id, SellpiaNewProductCandidate.initialReceiveTransactionId, SellpiaNewProductCandidate.modelName, SellpiaNewProductCandidate.note, SellpiaNewProductCandidate.operatorInitialStock (+19 more)

### Community 33 - "AgentOS schema"
Cohesion: 0.08
Nodes (26): AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.agentInstanceId, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy, AgentAuthorizationEvent.decidedByUserId (+18 more)

### Community 34 - "AgentOS schema"
Cohesion: 0.09
Nodes (26): AgentInstance.adapterConfig, AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.icon, AgentInstance.id, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name (+18 more)

### Community 35 - "System schema"
Cohesion: 0.08
Nodes (26): Alert.actionTask, Alert.actorUser, Alert.actorUserId, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead (+18 more)

### Community 36 - "Core schema"
Cohesion: 0.12
Nodes (25): ChannelListing.lastImportRunId, ChannelListingOption.lastImportRunId, MasterProduct.lastImportRunId, SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.createdAt, SourceImportRun.createdBy (+17 more)

### Community 37 - "Inventory schema"
Cohesion: 0.09
Nodes (25): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.inventorySku, ReturnTransfer.inventorySkuId, ReturnTransfer.masterProduct (+17 more)

### Community 38 - "AgentOS schema"
Cohesion: 0.09
Nodes (24): AgentArtifact.agentInstance, AgentArtifact.agentInstanceId, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization (+16 more)

### Community 39 - "Channels schema"
Cohesion: 0.12
Nodes (24): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.channelAccount, ChannelAccountDailyKpiSnapshot.channelAccountId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+16 more)

### Community 40 - "Orders schema"
Cohesion: 0.10
Nodes (24): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.metadata, OrderLineItem.option, OrderLineItem.optionId, OrderLineItem.optionName (+16 more)

### Community 41 - "System schema"
Cohesion: 0.09
Nodes (23): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.detail, ActionTask.href, ActionTask.id (+15 more)

### Community 42 - "Core schema"
Cohesion: 0.09
Nodes (23): AgentApprovalRequest.approverUserId, AgentApprovalRequest.decidedByUserId, AgentApprovalRequest.requestedByUserId, AgentRunRequest.requestedByUserId, ContentWorkspace.createdByUserId, ProductPreparation.createdByUserId, SourcingCandidate.rejectedByUserId, ThumbnailGeneration.triggeredByUserId (+15 more)

### Community 43 - "AI schema"
Cohesion: 0.11
Nodes (23): ContentAsset.generationGroupId, ContentAsset.originGenerationGroupId, ContentGeneration.generationGroupId, ContentGenerationGroup.baseContentGeneration, ContentGenerationGroup.baseContentGenerationId, ContentGenerationGroup.contentWorkspace, ContentGenerationGroup.contentWorkspaceId, ContentGenerationGroup.createdAt (+15 more)

### Community 44 - "Orders schema"
Cohesion: 0.09
Nodes (23): Order.channelAccount, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.listing, Order.listingId, Order.memo (+15 more)

### Community 45 - "AgentOS schema"
Cohesion: 0.10
Nodes (22): AgentCostEvent.agentInstance, AgentCostEvent.agentInstanceId, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id (+14 more)

### Community 46 - "System schema"
Cohesion: 0.10
Nodes (22): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+14 more)

### Community 47 - "Channels schema"
Cohesion: 0.10
Nodes (22): ChannelReconciliationItem.lastSeenRunId, ChannelReconciliationRun.alreadyLinkedCount, ChannelReconciliationRun.autoLinkedCount, ChannelReconciliationRun.channel, ChannelReconciliationRun.conflictCount, ChannelReconciliationRun.createdAt, ChannelReconciliationRun.errorCount, ChannelReconciliationRun.errorJson (+14 more)

### Community 48 - "System schema"
Cohesion: 0.10
Nodes (22): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon, Marketplace.id (+14 more)

### Community 49 - "Inventory schema"
Cohesion: 0.10
Nodes (22): PickingItem.createdAt, PickingItem.id, PickingItem.inventorySku, PickingItem.inventorySkuId, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.masterProduct (+14 more)

### Community 50 - "Finance schema"
Cohesion: 0.11
Nodes (22): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.listingId, ProfitLoss.month (+14 more)

### Community 51 - "Orders schema"
Cohesion: 0.10
Nodes (22): Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.id, Shipment.listing, Shipment.listingId (+14 more)

### Community 52 - "AI schema"
Cohesion: 0.10
Nodes (22): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id, ThumbnailAnalysis.imageSpec, ThumbnailAnalysis.imageUrl (+14 more)

### Community 53 - "AI schema"
Cohesion: 0.10
Nodes (22): ThumbnailGenerationInputImage.candidateImage, ThumbnailGenerationInputImage.createdAt, ThumbnailGenerationInputImage.fileSize, ThumbnailGenerationInputImage.generation, ThumbnailGenerationInputImage.generationId, ThumbnailGenerationInputImage.height, ThumbnailGenerationInputImage.id, ThumbnailGenerationInputImage.label (+14 more)

### Community 54 - "Orders schema"
Cohesion: 0.10
Nodes (22): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.externalSku, UnshippedItem.id, UnshippedItem.isNotified, UnshippedItem.listing, UnshippedItem.listingId, UnshippedItem.notifiedAt (+14 more)

### Community 55 - "AgentOS schema"
Cohesion: 0.12
Nodes (21): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.agentInstanceId, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError (+13 more)

### Community 56 - "Inventory schema"
Cohesion: 0.10
Nodes (21): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.id, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.option, Inventory.optionId (+13 more)

### Community 57 - "Core schema"
Cohesion: 0.10
Nodes (21): MasterProductImage.createdAt, MasterProductImage.deletedAt, MasterProductImage.fileSize, MasterProductImage.height, MasterProductImage.id, MasterProductImage.isPrimary, MasterProductImage.label, MasterProductImage.master (+13 more)

### Community 58 - "Inventory schema"
Cohesion: 0.10
Nodes (21): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.id, StockTransfer.inventorySku, StockTransfer.inventorySkuId, StockTransfer.masterProduct, StockTransfer.masterProductId (+13 more)

### Community 59 - "Supply schema"
Cohesion: 0.12
Nodes (21): SupplierProduct.createdAt, SupplierProduct.id, SupplierProduct.isPrimary, SupplierProduct.masterProduct, SupplierProduct.masterProductId, SupplierProduct.memo, SupplierProduct.minOrderQty, SupplierProduct.option (+13 more)

### Community 60 - "AI schema"
Cohesion: 0.12
Nodes (20): ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.currentRevisionId, DetailPageRevision.artifact, DetailPageRevision.artifactId, DetailPageRevision.assetUrlMap, DetailPageRevision.contentGeneration, DetailPageRevision.contentGenerationId, DetailPageRevision.createdAt (+12 more)

### Community 61 - "Inventory schema"
Cohesion: 0.13
Nodes (20): InventorySku.barcode, InventorySku.createdAt, InventorySku.currentStock, InventorySku.id, InventorySku.isActive, InventorySku.lastImportRun, InventorySku.lastImportRunId, InventorySku.name (+12 more)

### Community 62 - "AI schema"
Cohesion: 0.12
Nodes (20): ProductPreparation.selectedThumbnailGenerationCandidateId, ThumbnailGenerationCandidate.createdAt, ThumbnailGenerationCandidate.filename, ThumbnailGenerationCandidate.fileSize, ThumbnailGenerationCandidate.generation, ThumbnailGenerationCandidate.generationId, ThumbnailGenerationCandidate.height, ThumbnailGenerationCandidate.id (+12 more)

### Community 63 - "Orders schema"
Cohesion: 0.12
Nodes (20): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+12 more)

### Community 64 - "AI schema"
Cohesion: 0.11
Nodes (19): ContentGenerationSource.contentAsset, ContentGenerationSource.contentAssetId, ContentGenerationSource.contentGeneration, ContentGenerationSource.contentGenerationId, ContentGenerationSource.createdAt, ContentGenerationSource.id, ContentGenerationSource.label, ContentGenerationSource.metadata (+11 more)

### Community 65 - "Channels schema"
Cohesion: 0.12
Nodes (19): RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt, RocketPurchaseOrder.firstSkuName, RocketPurchaseOrder.id, RocketPurchaseOrder.items, RocketPurchaseOrder.orderAmount, RocketPurchaseOrder.orderedAt (+11 more)

### Community 66 - "AI schema"
Cohesion: 0.11
Nodes (19): ThumbnailGenerationEvent.actor, ThumbnailGenerationEvent.actorUserId, ThumbnailGenerationEvent.attemptNumber, ThumbnailGenerationEvent.createdAt, ThumbnailGenerationEvent.errorMessage, ThumbnailGenerationEvent.eventType, ThumbnailGenerationEvent.fromPhase, ThumbnailGenerationEvent.fromStatus (+11 more)

### Community 67 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+10 more)

### Community 68 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentMessage.agentInstance, AgentMessage.agentInstanceId, AgentMessage.content, AgentMessage.conversation, AgentMessage.conversationId, AgentMessage.createdAt, AgentMessage.id, AgentMessage.metadata (+10 more)

### Community 69 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.organizationId, WorkflowRun.startedAt (+10 more)

### Community 70 - "Core schema"
Cohesion: 0.15
Nodes (18): ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id, ChannelAccount.isPrimary, ChannelAccount.name, ChannelAccount.organization (+10 more)

### Community 71 - "Channels schema"
Cohesion: 0.14
Nodes (18): ChannelSkuComponent.channelSku, ChannelSkuComponent.channelSkuId, ChannelSkuComponent.createdAt, ChannelSkuComponent.createdBy, ChannelSkuComponent.id, ChannelSkuComponent.inventorySku, ChannelSkuComponent.inventorySkuId, ChannelSkuComponent.mappingSource (+10 more)

### Community 72 - "Orders schema"
Cohesion: 0.12
Nodes (18): CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing (+10 more)

### Community 73 - "Inventory schema"
Cohesion: 0.14
Nodes (18): PickingItem.organizationId, PickingItem.pickingListId, PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.id, PickingList.listNumber, PickingList.organization (+10 more)

### Community 74 - "Supply schema"
Cohesion: 0.13
Nodes (18): PurchaseOrder.supplierId, Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.id, Supplier.leadTimeDays, Supplier.name (+10 more)

### Community 75 - "Supply schema"
Cohesion: 0.12
Nodes (18): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.dueDate, SupplierPayment.id, SupplierPayment.notes, SupplierPayment.organization, SupplierPayment.organizationId, SupplierPayment.paidAmount (+10 more)

### Community 76 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): WorkflowTemplate.createdAt, WorkflowTemplate.description, WorkflowTemplate.edgesJson, WorkflowTemplate.id, WorkflowTemplate.isActive, WorkflowTemplate.marketplace, WorkflowTemplate.marketplaceId, WorkflowTemplate.module (+10 more)

### Community 77 - "Finance schema"
Cohesion: 0.14
Nodes (17): Finance, SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.organization (+9 more)

### Community 78 - "AI schema"
Cohesion: 0.14
Nodes (17): ContentWorkspaceThumbnailSelection.contentAsset, ContentWorkspaceThumbnailSelection.contentAssetId, ContentWorkspaceThumbnailSelection.contentWorkspace, ContentWorkspaceThumbnailSelection.contentWorkspaceId, ContentWorkspaceThumbnailSelection.createdAt, ContentWorkspaceThumbnailSelection.createdByUser, ContentWorkspaceThumbnailSelection.createdByUserId, ContentWorkspaceThumbnailSelection.id (+9 more)

### Community 79 - "Finance schema"
Cohesion: 0.12
Nodes (17): GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.listing, GradeHistory.listingId, GradeHistory.marginScore, GradeHistory.master, GradeHistory.masterId, GradeHistory.newGrade (+9 more)

### Community 80 - "Finance schema"
Cohesion: 0.12
Nodes (17): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.id, ProcessingCost.master, ProcessingCost.masterId, ProcessingCost.notes, ProcessingCost.organization, ProcessingCost.organizationId (+9 more)

### Community 81 - "Inventory schema"
Cohesion: 0.17
Nodes (16): Inventory, InventorySkuMasterProductMap.createdAt, InventorySkuMasterProductMap.details, InventorySkuMasterProductMap.id, InventorySkuMasterProductMap.inventorySku, InventorySkuMasterProductMap.inventorySkuId, InventorySkuMasterProductMap.masterProduct, InventorySkuMasterProductMap.masterProductId (+8 more)

### Community 82 - "Advertising schema"
Cohesion: 0.13
Nodes (16): ExecutionTask.action, ExecutionTask.actionId, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt, ExecutionTask.errorMessage, ExecutionTask.finishedAt (+8 more)

### Community 83 - "Core schema"
Cohesion: 0.15
Nodes (16): OrganizationMembership.createdAt, OrganizationMembership.id, OrganizationMembership.invitedBy, OrganizationMembership.invitedById, OrganizationMembership.joinedAt, OrganizationMembership.lastSelectedAt, OrganizationMembership.organization, OrganizationMembership.organizationId (+8 more)

### Community 84 - "Supply schema"
Cohesion: 0.13
Nodes (16): PurchaseOrderItem.createdAt, PurchaseOrderItem.id, PurchaseOrderItem.masterProduct, PurchaseOrderItem.masterProductId, PurchaseOrderItem.option, PurchaseOrderItem.optionId, PurchaseOrderItem.order, PurchaseOrderItem.orderId (+8 more)

### Community 85 - "Inventory schema"
Cohesion: 0.13
Nodes (16): SellpiaStockSnapshot.createdAt, SellpiaStockSnapshot.createdBy, SellpiaStockSnapshot.effectiveExportedAt, SellpiaStockSnapshot.fileHash, SellpiaStockSnapshot.fileName, SellpiaStockSnapshot.id, SellpiaStockSnapshot.metaJson, SellpiaStockSnapshot.organization (+8 more)

### Community 86 - "Inventory schema"
Cohesion: 0.15
Nodes (16): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items, StockAudit.matchedCount (+8 more)

### Community 87 - "AI schema"
Cohesion: 0.13
Nodes (16): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.listingId (+8 more)

### Community 88 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 89 - "Advertising schema"
Cohesion: 0.14
Nodes (15): ExecutionTask.workerId, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentTaskRef, ExecutionWorker.currentUrl, ExecutionWorker.id, ExecutionWorker.label, ExecutionWorker.lastHeartbeatAt (+7 more)

### Community 90 - "Finance schema"
Cohesion: 0.14
Nodes (15): ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description, ManualLedger.id (+7 more)

### Community 91 - "Inventory schema"
Cohesion: 0.14
Nodes (15): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.sourceRef, SellpiaReceiptUploadBatch.sourceType (+7 more)

### Community 92 - "AI schema"
Cohesion: 0.14
Nodes (15): ThumbnailRegistrationAttempt.createdAt, ThumbnailRegistrationAttempt.errorMessage, ThumbnailRegistrationAttempt.externalId, ThumbnailRegistrationAttempt.finishedAt, ThumbnailRegistrationAttempt.generation, ThumbnailRegistrationAttempt.generationId, ThumbnailRegistrationAttempt.id, ThumbnailRegistrationAttempt.organization (+7 more)

### Community 93 - "Supply schema"
Cohesion: 0.18
Nodes (14): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.id, MasterSupplierProduct.isPrimary, MasterSupplierProduct.master, MasterSupplierProduct.masterId, MasterSupplierProduct.memo, MasterSupplierProduct.minOrderQty (+6 more)

### Community 94 - "Channels schema"
Cohesion: 0.18
Nodes (14): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.organizationId, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson (+6 more)

### Community 95 - "AI schema"
Cohesion: 0.19
Nodes (13): AI, ContentGenerationAssetUsage.contentAsset, ContentGenerationAssetUsage.contentAssetId, ContentGenerationAssetUsage.contentGeneration, ContentGenerationAssetUsage.contentGenerationId, ContentGenerationAssetUsage.createdAt, ContentGenerationAssetUsage.id, ContentGenerationAssetUsage.organization (+5 more)

### Community 96 - "Orders schema"
Cohesion: 0.19
Nodes (13): Orders, ShipmentItem.createdAt, ShipmentItem.id, ShipmentItem.orderLineItem, ShipmentItem.orderLineItemId, ShipmentItem.organization, ShipmentItem.organizationId, ShipmentItem.quantity (+5 more)

### Community 97 - "Core schema"
Cohesion: 0.19
Nodes (13): CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.isActive, CategoryMapping.keywords, CategoryMapping.organization (+5 more)

### Community 98 - "Core schema"
Cohesion: 0.17
Nodes (13): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+5 more)

### Community 99 - "Orders schema"
Cohesion: 0.17
Nodes (13): Review.content, Review.createdAt, Review.id, Review.listing, Review.listingId, Review.organization, Review.organizationId, Review.platform (+5 more)

### Community 100 - "System schema"
Cohesion: 0.18
Nodes (12): ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization, ActivityEvent.organizationId (+4 more)

### Community 101 - "Core schema"
Cohesion: 0.21
Nodes (12): BundleComponent.bundleOption, BundleComponent.bundleOptionId, BundleComponent.componentOption, BundleComponent.componentOptionId, BundleComponent.createdAt, BundleComponent.id, BundleComponent.organization, BundleComponent.qty (+4 more)

### Community 102 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 103 - "Advertising schema"
Cohesion: 0.20
Nodes (11): Advertising, ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task (+3 more)

### Community 104 - "System schema"
Cohesion: 0.24
Nodes (11): System, SystemSetting.createdAt, SystemSetting.id, SystemSetting.key, SystemSetting.organization, SystemSetting.organizationId, SystemSetting.updatedAt, SystemSetting.value (+3 more)

### Community 105 - "Advertising schema"
Cohesion: 0.20
Nodes (11): ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.id, ScrapeTarget.isActive, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.organizationId (+3 more)

### Community 106 - "System schema"
Cohesion: 0.22
Nodes (10): FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name, FeatureGate.updatedAt (+2 more)

### Community 107 - "Core schema"
Cohesion: 0.22
Nodes (10): Organization.createdAt, Organization.id, Organization.isActive, Organization.name, Organization.slug, Organization.updatedAt, SellpiaReceiptUploadBatch.organizationId, Thumbnail.organizationId (+2 more)

### Community 108 - "prisma field: Order.channelAccountId"
Cohesion: 0.25
Nodes (9): Order.channelAccountId, Order.externalOrderId, Order.id, Order.organizationId, Order.platform, orders, Order unique(id, organizationId), Order unique(organizationId, channelAccountId, externalOrderId) (+1 more)

### Community 109 - "prisma field: prisma — Shared Schema"
Cohesion: 0.33
Nodes (6): prisma — Shared Schema, BundleComponent.organizationId, LegalEntity.organizationId, MasterProductImage.isDeleted, MasterProductImage.organizationId, ProductOption.isDeleted

### Community 110 - "Core schema"
Cohesion: 0.40
Nodes (6): Core, MasterCodeCounter.key, MasterCodeCounter.updatedAt, MasterCodeCounter.value, MasterCodeCounter, master_code_counters

### Community 111 - "prisma field: ChannelReconciliationItem.channel"
Cohesion: 0.40
Nodes (5): ChannelReconciliationItem.channel, ChannelReconciliationItem.itemKey, ChannelReconciliationItem.organizationId, ChannelReconciliationItem.source, ChannelReconciliationItem unique(organizationId, channel, source, itemKey)

### Community 112 - "prisma field: ActionTask.date"
Cohesion: 0.50
Nodes (4): ActionTask.date, ActionTask.organizationId, ActionTask.taskKey, ActionTask unique(organizationId, taskKey, date)

### Community 113 - "prisma field: ChannelListingDailySnapshot.businessDate"
Cohesion: 0.50
Nodes (4): ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.listingId, ChannelListingDailySnapshot.organizationId, ChannelListingDailySnapshot unique(organizationId, listingId, businessDate)

### Community 114 - "prisma field: Alert.operationKey"
Cohesion: 0.67
Nodes (3): Alert.operationKey, Alert.organizationId, Alert unique(organizationId, operationKey)

## Knowledge Gaps
- **1614 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+1609 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Orders schema` to `Core schema`, `Channels schema`, `AgentOS schema`, `AI schema`, `AgentOS schema`, `Channels schema`, `Core schema`, `AI schema`, `AgentOS schema`, `Inventory schema`, `Inventory schema`, `AI schema`, `Sourcing schema`, `Sourcing schema`, `Core schema`, `AgentOS schema`, `Channels schema`, `AI schema`, `AgentOS schema`, `Channels schema`, `AI schema`, `Channels schema`, `Core schema`, `Advertising schema`, `Channels schema`, `Inventory schema`, `AgentOS schema`, `AI schema`, `AI schema`, `Orders schema`, `Supply schema`, `Inventory schema`, `AgentOS schema`, `AgentOS schema`, `System schema`, `Core schema`, `Inventory schema`, `AgentOS schema`, `Channels schema`, `Orders schema`, `System schema`, `Core schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `System schema`, `Channels schema`, `System schema`, `Inventory schema`, `Finance schema`, `Orders schema`, `AI schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `Inventory schema`, `Core schema`, `Inventory schema`, `Supply schema`, `AI schema`, `Inventory schema`, `AI schema`, `Orders schema`, `AI schema`, `Channels schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `Channels schema`, `Orders schema`, `Inventory schema`, `Supply schema`, `Supply schema`, `AgentOS schema`, `Finance schema`, `AI schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `Advertising schema`, `Core schema`, `Supply schema`, `Inventory schema`, `Inventory schema`, `AI schema`, `System schema`, `Advertising schema`, `Finance schema`, `Inventory schema`, `AI schema`, `Supply schema`, `Channels schema`, `AI schema`, `Orders schema`, `Core schema`, `Core schema`, `Orders schema`, `System schema`, `Core schema`, `System schema`, `Advertising schema`, `System schema`, `Advertising schema`, `System schema`, `Core schema`, `prisma field: Order.channelAccountId`, `prisma field: prisma — Shared Schema`, `Core schema`, `prisma field: ChannelReconciliationItem.channel`, `prisma field: ActionTask.date`, `prisma field: ChannelListingDailySnapshot.businessDate`, `prisma field: Alert.operationKey`?**
  _High betweenness centrality (0.476) - this node is a cross-community bridge._
- **Why does `Organization` connect `Core schema` to `Core schema`, `Channels schema`, `AgentOS schema`, `AI schema`, `AgentOS schema`, `Channels schema`, `Core schema`, `AI schema`, `AgentOS schema`, `Inventory schema`, `Inventory schema`, `AI schema`, `Sourcing schema`, `Sourcing schema`, `Core schema`, `AgentOS schema`, `Channels schema`, `AI schema`, `AgentOS schema`, `Channels schema`, `AI schema`, `Channels schema`, `Core schema`, `Orders schema`, `Advertising schema`, `Channels schema`, `Inventory schema`, `AgentOS schema`, `AI schema`, `AI schema`, `Orders schema`, `Supply schema`, `Inventory schema`, `AgentOS schema`, `AgentOS schema`, `System schema`, `Core schema`, `Inventory schema`, `AgentOS schema`, `Channels schema`, `Orders schema`, `System schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `System schema`, `Channels schema`, `Inventory schema`, `Finance schema`, `Orders schema`, `AI schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `Inventory schema`, `Core schema`, `Inventory schema`, `Supply schema`, `AI schema`, `Inventory schema`, `AI schema`, `Orders schema`, `AI schema`, `Channels schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `Channels schema`, `Orders schema`, `Inventory schema`, `Supply schema`, `Supply schema`, `AgentOS schema`, `Finance schema`, `AI schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `Core schema`, `Supply schema`, `Inventory schema`, `Inventory schema`, `AI schema`, `Advertising schema`, `Finance schema`, `Inventory schema`, `AI schema`, `Channels schema`, `AI schema`, `Orders schema`, `Core schema`, `Core schema`, `Orders schema`, `System schema`, `Core schema`, `System schema`, `Advertising schema`, `prisma field: Order.channelAccountId`, `prisma field: prisma — Shared Schema`, `Core schema`, `prisma field: ChannelReconciliationItem.channel`, `prisma field: ActionTask.date`, `prisma field: ChannelListingDailySnapshot.businessDate`, `prisma field: Alert.operationKey`?**
  _High betweenness centrality (0.328) - this node is a cross-community bridge._
- **Why does `MasterProduct` connect `Core schema` to `AI schema`, `Core schema`, `Inventory schema`, `AI schema`, `Sourcing schema`, `AI schema`, `Core schema`, `Orders schema`, `Inventory schema`, `AI schema`, `Core schema`, `Inventory schema`, `AI schema`, `Inventory schema`, `AI schema`, `Core schema`, `Inventory schema`, `Supply schema`, `Channels schema`, `Inventory schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `Supply schema`, `Supply schema`, `Core schema`, `prisma field: prisma — Shared Schema`, `Core schema`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **What connects `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason` to the rest of the system?**
  _1614 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core schema` be split into smaller, more focused modules?**
  _Cohesion score 0.04281567489114659 - nodes in this community are weakly interconnected._
- **Should `Channels schema` be split into smaller, more focused modules?**
  _Cohesion score 0.038461538461538464 - nodes in this community are weakly interconnected._
- **Should `AgentOS schema` be split into smaller, more focused modules?**
  _Cohesion score 0.048484848484848485 - nodes in this community are weakly interconnected._