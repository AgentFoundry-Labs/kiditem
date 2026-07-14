# Graph Report - schema  (2026-07-14)

## Corpus Check
- 13 files · ~24,017 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2555 nodes · 3969 edges · 125 communities (123 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Channels schema
- AgentOS schema
- AgentOS schema
- AgentOS schema
- Core schema
- AI schema
- Channels schema
- Inventory schema
- Inventory schema
- AgentOS schema
- Channels schema
- Core schema
- AI schema
- AgentOS schema
- Channels schema
- Sourcing schema
- AI schema
- Channels schema
- Orders schema
- AgentOS schema
- Channels schema
- Inventory schema
- AI schema
- Advertising schema
- AgentOS schema
- System schema
- Core schema
- Channels schema
- AI schema
- Supply schema
- Inventory schema
- AI schema
- Core schema
- AgentOS schema
- AI schema
- Orders schema
- System schema
- Sourcing schema
- Channels schema
- Core schema
- Orders schema
- AgentOS schema
- System schema
- Channels schema
- Sourcing schema
- System schema
- Finance schema
- Sourcing schema
- AI schema
- AI schema
- AgentOS schema
- Channels schema
- Channels schema
- Inventory schema
- Inventory schema
- Orders schema
- Sourcing schema
- AgentOS schema
- Channels schema
- Orders schema
- AI schema
- AI schema
- AI schema
- Sourcing schema
- Sourcing schema
- AI schema
- Channels schema
- AI schema
- Orders schema
- AgentOS schema
- AgentOS schema
- AgentOS schema
- AgentOS schema
- Channels schema
- Orders schema
- Inventory schema
- Inventory schema
- Inventory schema
- Supply schema
- AgentOS schema
- Finance schema
- Inventory schema
- Finance schema
- Supply schema
- Core schema
- Advertising schema
- Sourcing schema
- Core schema
- Inventory schema
- Inventory schema
- Core schema
- System schema
- Advertising schema
- Finance schema
- Finance schema
- Orders schema
- AI schema
- AI schema
- Channels schema
- Orders schema
- Channels schema
- Channels schema
- AI schema
- Sourcing schema
- Supply schema
- Core schema
- Core schema
- Supply schema
- System schema
- System schema
- Advertising schema
- System schema
- Supply schema
- Advertising schema
- Sourcing schema
- Channels schema
- System schema
- Core schema
- Core schema
- prisma field: ChannelReconciliationItem.channel
- prisma field: ActionTask.date
- prisma field: ChannelListingDailySnapshot.businessDate
- prisma field: Alert.operationKey
- prisma field: ChannelListingDailySnapshot.id
- prisma field: ChannelReconciliationItem.id

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 371 edges
2. `Organization` - 226 edges
3. `prisma — Shared Schema` - 152 edges
4. `AgentRunRequest` - 74 edges
5. `ProductOption` - 73 edges
6. `MasterProduct` - 70 edges
7. `AgentRun` - 68 edges
8. `ChannelListingDailySnapshot` - 63 edges
9. `User` - 58 edges
10. `ChannelListing` - 57 edges
11. `AgentInstance` - 53 edges
12. `ChannelAdTargetDailySnapshot` - 51 edges

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

## Communities (125 total, 2 thin omitted)

### Community 0 - "Channels schema"
Cohesion: 0.04
Nodes (52): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+44 more)

### Community 1 - "AgentOS schema"
Cohesion: 0.05
Nodes (47): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.approver, AgentApprovalRequest.approverUserId, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy, AgentApprovalRequest.decidedByUserId (+39 more)

### Community 2 - "AgentOS schema"
Cohesion: 0.05
Nodes (45): AgentRunRequest.agentInstance, AgentRunRequest.agentInstanceId, AgentRunRequest.attempts, AgentRunRequest.claimedAt, AgentRunRequest.claimedBy, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.coalescedIntoRequestId, AgentRunRequest.conversation (+37 more)

### Community 3 - "AgentOS schema"
Cohesion: 0.05
Nodes (44): AgentApprovalRequest.runId, AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode (+36 more)

### Community 4 - "Core schema"
Cohesion: 0.05
Nodes (41): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.adTier, MasterProduct.barcode, MasterProduct.brand, MasterProduct.category, MasterProduct.code, MasterProduct.costCny (+33 more)

### Community 5 - "AI schema"
Cohesion: 0.06
Nodes (41): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+33 more)

### Community 6 - "Channels schema"
Cohesion: 0.06
Nodes (40): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel, ChannelAdTargetDailySnapshot.clicks (+32 more)

### Community 7 - "Inventory schema"
Cohesion: 0.06
Nodes (34): SellpiaStockSnapshotItem.appliedTransactionId, SellpiaStockSnapshotItem.barcode, SellpiaStockSnapshotItem.blockingReasons, SellpiaStockSnapshotItem.createdAt, SellpiaStockSnapshotItem.diff, SellpiaStockSnapshotItem.diffRate, SellpiaStockSnapshotItem.id, SellpiaStockSnapshotItem.inventory (+26 more)

### Community 8 - "Inventory schema"
Cohesion: 0.07
Nodes (32): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.option, PickingItem.optionId, PickingItem.orderId (+24 more)

### Community 9 - "AgentOS schema"
Cohesion: 0.08
Nodes (31): AgentOS, AgentAuthorizationEvent.toolId, AgentInstanceToolPolicy.agentInstance, AgentInstanceToolPolicy.agentInstanceId, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentInstanceToolPolicy.dryRunMode (+23 more)

### Community 10 - "Channels schema"
Cohesion: 0.07
Nodes (31): ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.externalId, ChannelListingOptionDailySnapshot.externalOptionId, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isActive (+23 more)

### Community 11 - "Core schema"
Cohesion: 0.08
Nodes (31): ProductOption.availableStock, ProductOption.barcode, ProductOption.commissionRate, ProductOption.costPrice, ProductOption.createdAt, ProductOption.deletedAt, ProductOption.id, ProductOption.isActive (+23 more)

### Community 12 - "AI schema"
Cohesion: 0.08
Nodes (31): ProductPreparation.appliedToMasterAt, ProductPreparation.contentWorkspace, ProductPreparation.createdAt, ProductPreparation.createdByUser, ProductPreparation.createdByUserId, ProductPreparation.deletedAt, ProductPreparation.displayName, ProductPreparation.id (+23 more)

### Community 13 - "AgentOS schema"
Cohesion: 0.08
Nodes (30): AgentToolInvocation.agentInstance, AgentToolInvocation.agentInstanceId, AgentToolInvocation.approvalRequest, AgentToolInvocation.approvalRequestId, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt (+22 more)

### Community 14 - "Channels schema"
Cohesion: 0.07
Nodes (30): ChannelReconciliationItem.channelImageUrl, ChannelReconciliationItem.channelOptionName, ChannelReconciliationItem.channelProductName, ChannelReconciliationItem.channelStatus, ChannelReconciliationItem.channelUrl, ChannelReconciliationItem.confidence, ChannelReconciliationItem.conflictJson, ChannelReconciliationItem.createdAt (+22 more)

### Community 15 - "Sourcing schema"
Cohesion: 0.07
Nodes (30): ContentGeneration.sourceCandidateId, SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.id, SourcingCandidate.imageUrl (+22 more)

### Community 16 - "AI schema"
Cohesion: 0.09
Nodes (29): ContentGeneration.contentWorkspaceId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.createdByUserId, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageArtifactId, ContentWorkspace.currentDetailPageRevision, ContentWorkspace.deletedAt (+21 more)

### Community 17 - "Channels schema"
Cohesion: 0.08
Nodes (29): CoupangWingSalesRankDailySnapshot.businessDate, CoupangWingSalesRankDailySnapshot.capturedAt, CoupangWingSalesRankDailySnapshot.categoryHierarchy, CoupangWingSalesRankDailySnapshot.collectedCount, CoupangWingSalesRankDailySnapshot.conversionRate28d, CoupangWingSalesRankDailySnapshot.createdAt, CoupangWingSalesRankDailySnapshot.id, CoupangWingSalesRankDailySnapshot.itemId (+21 more)

### Community 18 - "Orders schema"
Cohesion: 0.08
Nodes (29): Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.listing, Order.listingId (+21 more)

### Community 19 - "AgentOS schema"
Cohesion: 0.08
Nodes (27): AgentApprovalRequest.agentInstanceId, AgentInstance.adapterConfig, AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.icon, AgentInstance.id, AgentInstance.lifecycleStatus, AgentInstance.modelOverride (+19 more)

### Community 20 - "Channels schema"
Cohesion: 0.08
Nodes (27): ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelListingOptionDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.externalId, ChannelScrapeSnapshot.externalOptionId (+19 more)

### Community 21 - "Inventory schema"
Cohesion: 0.08
Nodes (27): SellpiaNewProductCandidate.barcode, SellpiaNewProductCandidate.createdAt, SellpiaNewProductCandidate.createdInventory, SellpiaNewProductCandidate.id, SellpiaNewProductCandidate.initialReceiveTransactionId, SellpiaNewProductCandidate.modelName, SellpiaNewProductCandidate.note, SellpiaNewProductCandidate.operatorInitialStock (+19 more)

### Community 22 - "AI schema"
Cohesion: 0.08
Nodes (27): ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.createdAt, ThumbnailGeneration.deletedAt, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.errorMessage, ThumbnailGeneration.grade, ThumbnailGeneration.id (+19 more)

### Community 23 - "Advertising schema"
Cohesion: 0.08
Nodes (26): AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+18 more)

### Community 24 - "AgentOS schema"
Cohesion: 0.08
Nodes (26): AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.agentInstanceId, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy, AgentAuthorizationEvent.decidedByUserId (+18 more)

### Community 25 - "System schema"
Cohesion: 0.08
Nodes (26): Alert.actionTask, Alert.actorUser, Alert.actorUserId, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead (+18 more)

### Community 26 - "Core schema"
Cohesion: 0.09
Nodes (26): ChannelAdTargetDailySnapshot.listingId, ChannelListing.channel, ChannelListing.channelAccount, ChannelListing.channelAccountId, ChannelListing.channelName, ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt (+18 more)

### Community 27 - "Channels schema"
Cohesion: 0.08
Nodes (26): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.id, ChannelScrapeRun.matchedCount (+18 more)

### Community 28 - "AI schema"
Cohesion: 0.08
Nodes (26): ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.editedHtmlSavedAt, ContentGeneration.errorMessage (+18 more)

### Community 29 - "Supply schema"
Cohesion: 0.08
Nodes (26): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+18 more)

### Community 30 - "Inventory schema"
Cohesion: 0.09
Nodes (26): RocketInventoryLedger.createdAt, RocketInventoryLedger.createdBy, RocketInventoryLedger.eventType, RocketInventoryLedger.id, RocketInventoryLedger.inventory, RocketInventoryLedger.metaJson, RocketInventoryLedger.note, RocketInventoryLedger.occurredAt (+18 more)

### Community 31 - "AI schema"
Cohesion: 0.09
Nodes (25): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.generationGroup (+17 more)

### Community 32 - "Core schema"
Cohesion: 0.13
Nodes (24): externalOptionId canonical option identity, vendorItemId provider term, Database ERD, ChannelAdTargetDailySnapshot.listingOptionId, ChannelListingOption.createdAt, ChannelListingOption.externalOptionId, ChannelListingOption.id, ChannelListingOption.isActive (+16 more)

### Community 33 - "AgentOS schema"
Cohesion: 0.09
Nodes (24): AgentArtifact.agentInstance, AgentArtifact.agentInstanceId, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization (+16 more)

### Community 34 - "AI schema"
Cohesion: 0.09
Nodes (24): ContentGeneration.detailPageArtifactId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.createdByUserId, DetailPageArtifact.currentRevision, DetailPageArtifact.deletedAt, DetailPageArtifact.id (+16 more)

### Community 35 - "Orders schema"
Cohesion: 0.11
Nodes (24): OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.id, OrderReturn.metadata, OrderReturn.order (+16 more)

### Community 36 - "System schema"
Cohesion: 0.09
Nodes (23): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.detail, ActionTask.href, ActionTask.id (+15 more)

### Community 37 - "Sourcing schema"
Cohesion: 0.09
Nodes (23): CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id, CandidateImage.isDeleted (+15 more)

### Community 38 - "Channels schema"
Cohesion: 0.11
Nodes (23): CoupangKeywordRankDailySnapshot.adRank, CoupangKeywordRankDailySnapshot.businessDate, CoupangKeywordRankDailySnapshot.capturedAt, CoupangKeywordRankDailySnapshot.createdAt, CoupangKeywordRankDailySnapshot.id, CoupangKeywordRankDailySnapshot.itemId, CoupangKeywordRankDailySnapshot.keyword, CoupangKeywordRankDailySnapshot.organicRank (+15 more)

### Community 39 - "Core schema"
Cohesion: 0.09
Nodes (23): MasterProductImage.createdAt, MasterProductImage.deletedAt, MasterProductImage.fileSize, MasterProductImage.height, MasterProductImage.id, MasterProductImage.isDeleted, MasterProductImage.isPrimary, MasterProductImage.label (+15 more)

### Community 40 - "Orders schema"
Cohesion: 0.11
Nodes (23): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.metadata, OrderLineItem.option, OrderLineItem.optionId, OrderLineItem.optionName (+15 more)

### Community 41 - "AgentOS schema"
Cohesion: 0.10
Nodes (22): AgentCostEvent.agentInstance, AgentCostEvent.agentInstanceId, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id (+14 more)

### Community 42 - "System schema"
Cohesion: 0.10
Nodes (22): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+14 more)

### Community 43 - "Channels schema"
Cohesion: 0.10
Nodes (22): ChannelReconciliationItem.lastSeenRunId, ChannelReconciliationRun.alreadyLinkedCount, ChannelReconciliationRun.autoLinkedCount, ChannelReconciliationRun.channel, ChannelReconciliationRun.conflictCount, ChannelReconciliationRun.createdAt, ChannelReconciliationRun.errorCount, ChannelReconciliationRun.errorJson (+14 more)

### Community 44 - "Sourcing schema"
Cohesion: 0.11
Nodes (22): LiveCommerceBroadcastDailySnapshot.broadcasterId, LiveCommerceBroadcastDailySnapshot.broadcasterName, LiveCommerceBroadcastDailySnapshot.broadcastId, LiveCommerceBroadcastDailySnapshot.businessDate, LiveCommerceBroadcastDailySnapshot.capturedAt, LiveCommerceBroadcastDailySnapshot.coverImageUrl, LiveCommerceBroadcastDailySnapshot.createdAt, LiveCommerceBroadcastDailySnapshot.endedAt (+14 more)

### Community 45 - "System schema"
Cohesion: 0.10
Nodes (22): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon, Marketplace.id (+14 more)

### Community 46 - "Finance schema"
Cohesion: 0.11
Nodes (22): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.listingId, ProfitLoss.month (+14 more)

### Community 47 - "Sourcing schema"
Cohesion: 0.11
Nodes (22): ShortsTrendDailySnapshot.businessDate, ShortsTrendDailySnapshot.capturedAt, ShortsTrendDailySnapshot.channelName, ShortsTrendDailySnapshot.commentCount, ShortsTrendDailySnapshot.createdAt, ShortsTrendDailySnapshot.id, ShortsTrendDailySnapshot.keyword, ShortsTrendDailySnapshot.likeCount (+14 more)

### Community 48 - "AI schema"
Cohesion: 0.10
Nodes (22): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id, ThumbnailAnalysis.imageSpec, ThumbnailAnalysis.imageUrl (+14 more)

### Community 49 - "AI schema"
Cohesion: 0.10
Nodes (22): ThumbnailGenerationInputImage.candidateImage, ThumbnailGenerationInputImage.createdAt, ThumbnailGenerationInputImage.fileSize, ThumbnailGenerationInputImage.generation, ThumbnailGenerationInputImage.generationId, ThumbnailGenerationInputImage.height, ThumbnailGenerationInputImage.id, ThumbnailGenerationInputImage.label (+14 more)

### Community 50 - "AgentOS schema"
Cohesion: 0.12
Nodes (21): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.agentInstanceId, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError (+13 more)

### Community 51 - "Channels schema"
Cohesion: 0.12
Nodes (21): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType, ChannelAccountDailyKpiSnapshot.lastObservedAt, ChannelAccountDailyKpiSnapshot.normalizedJson (+13 more)

### Community 52 - "Channels schema"
Cohesion: 0.11
Nodes (21): CoupangProductListing.barcode, CoupangProductListing.bundleOptionId, CoupangProductListing.category, CoupangProductListing.createdAt, CoupangProductListing.id, CoupangProductListing.matchedOptionId, CoupangProductListing.matchStatus, CoupangProductListing.normalizedName (+13 more)

### Community 53 - "Inventory schema"
Cohesion: 0.10
Nodes (21): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.id, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.option, Inventory.optionId (+13 more)

### Community 54 - "Inventory schema"
Cohesion: 0.11
Nodes (21): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.notes, ReturnTransfer.option, ReturnTransfer.optionId (+13 more)

### Community 55 - "Orders schema"
Cohesion: 0.10
Nodes (21): Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.id, Shipment.listing, Shipment.listingId (+13 more)

### Community 56 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): Sourcing1688HotProductDailySnapshot.businessDate, Sourcing1688HotProductDailySnapshot.capturedAt, Sourcing1688HotProductDailySnapshot.createdAt, Sourcing1688HotProductDailySnapshot.id, Sourcing1688HotProductDailySnapshot.imageUrl, Sourcing1688HotProductDailySnapshot.monthlySales, Sourcing1688HotProductDailySnapshot.offerId, Sourcing1688HotProductDailySnapshot.organization (+13 more)

### Community 57 - "AgentOS schema"
Cohesion: 0.11
Nodes (20): AgentRuntimeState.agentInstance, AgentRuntimeState.agentInstanceId, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.id, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun (+12 more)

### Community 58 - "Channels schema"
Cohesion: 0.12
Nodes (20): CoupangWingTrackedProductDailySnapshot.businessDate, CoupangWingTrackedProductDailySnapshot.capturedAt, CoupangWingTrackedProductDailySnapshot.conversionRate28d, CoupangWingTrackedProductDailySnapshot.createdAt, CoupangWingTrackedProductDailySnapshot.estimatedRevenue28d, CoupangWingTrackedProductDailySnapshot.id, CoupangWingTrackedProductDailySnapshot.organization, CoupangWingTrackedProductDailySnapshot.organizationId (+12 more)

### Community 59 - "Orders schema"
Cohesion: 0.12
Nodes (20): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+12 more)

### Community 60 - "AI schema"
Cohesion: 0.12
Nodes (19): ContentAsset.generationGroupId, ContentGeneration.generationGroupId, ContentGenerationGroup.baseContentGeneration, ContentGenerationGroup.baseContentGenerationId, ContentGenerationGroup.createdAt, ContentGenerationGroup.createdByUserId, ContentGenerationGroup.groupType, ContentGenerationGroup.id (+11 more)

### Community 61 - "AI schema"
Cohesion: 0.11
Nodes (19): ContentGenerationSource.contentAsset, ContentGenerationSource.contentAssetId, ContentGenerationSource.contentGeneration, ContentGenerationSource.contentGenerationId, ContentGenerationSource.createdAt, ContentGenerationSource.id, ContentGenerationSource.label, ContentGenerationSource.metadata (+11 more)

### Community 62 - "AI schema"
Cohesion: 0.11
Nodes (19): ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.currentRevisionId, DetailPageRevision.artifact, DetailPageRevision.artifactId, DetailPageRevision.assetUrlMap, DetailPageRevision.contentGeneration, DetailPageRevision.contentGenerationId, DetailPageRevision.createdAt (+11 more)

### Community 63 - "Sourcing schema"
Cohesion: 0.14
Nodes (19): LiveCommerceProductDailySnapshot.broadcastId, LiveCommerceProductDailySnapshot.businessDate, LiveCommerceProductDailySnapshot.capturedAt, LiveCommerceProductDailySnapshot.createdAt, LiveCommerceProductDailySnapshot.id, LiveCommerceProductDailySnapshot.imageUrl, LiveCommerceProductDailySnapshot.organization, LiveCommerceProductDailySnapshot.organizationId (+11 more)

### Community 64 - "Sourcing schema"
Cohesion: 0.13
Nodes (19): NaverKeywordDailySnapshot.averageAdRank, NaverKeywordDailySnapshot.businessDate, NaverKeywordDailySnapshot.capturedAt, NaverKeywordDailySnapshot.competitionIndex, NaverKeywordDailySnapshot.createdAt, NaverKeywordDailySnapshot.id, NaverKeywordDailySnapshot.keyword, NaverKeywordDailySnapshot.monthlyMobileSearchCount (+11 more)

### Community 65 - "AI schema"
Cohesion: 0.11
Nodes (19): ProductPreparation.selectedThumbnailGenerationCandidateId, ThumbnailGenerationCandidate.createdAt, ThumbnailGenerationCandidate.filename, ThumbnailGenerationCandidate.fileSize, ThumbnailGenerationCandidate.generation, ThumbnailGenerationCandidate.generationId, ThumbnailGenerationCandidate.height, ThumbnailGenerationCandidate.id (+11 more)

### Community 66 - "Channels schema"
Cohesion: 0.12
Nodes (19): RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt, RocketPurchaseOrder.firstSkuName, RocketPurchaseOrder.id, RocketPurchaseOrder.items, RocketPurchaseOrder.orderAmount, RocketPurchaseOrder.orderedAt (+11 more)

### Community 67 - "AI schema"
Cohesion: 0.11
Nodes (19): ThumbnailGenerationEvent.actor, ThumbnailGenerationEvent.actorUserId, ThumbnailGenerationEvent.attemptNumber, ThumbnailGenerationEvent.createdAt, ThumbnailGenerationEvent.errorMessage, ThumbnailGenerationEvent.eventType, ThumbnailGenerationEvent.fromPhase, ThumbnailGenerationEvent.fromStatus (+11 more)

### Community 68 - "Orders schema"
Cohesion: 0.11
Nodes (19): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.id, UnshippedItem.isNotified, UnshippedItem.listing, UnshippedItem.listingId, UnshippedItem.notifiedAt, UnshippedItem.option (+11 more)

### Community 69 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+10 more)

### Community 70 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentMessage.agentInstance, AgentMessage.agentInstanceId, AgentMessage.content, AgentMessage.conversation, AgentMessage.conversationId, AgentMessage.createdAt, AgentMessage.id, AgentMessage.metadata (+10 more)

### Community 71 - "AgentOS schema"
Cohesion: 0.13
Nodes (18): AgentRunEvent.agentInstance, AgentRunEvent.agentInstanceId, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message (+10 more)

### Community 72 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.organizationId, WorkflowRun.startedAt (+10 more)

### Community 73 - "Channels schema"
Cohesion: 0.13
Nodes (18): CoupangWingTrackedProduct.brandName, CoupangWingTrackedProduct.categoryHierarchy, CoupangWingTrackedProduct.createdAt, CoupangWingTrackedProduct.enabled, CoupangWingTrackedProduct.id, CoupangWingTrackedProduct.imagePath, CoupangWingTrackedProduct.itemId, CoupangWingTrackedProduct.lastCapturedAt (+10 more)

### Community 74 - "Orders schema"
Cohesion: 0.12
Nodes (18): CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing (+10 more)

### Community 75 - "Inventory schema"
Cohesion: 0.13
Nodes (18): Shipment.warehouseId, StockTransaction.warehouseId, StockTransfer.toWarehouseId, Warehouse.address, Warehouse.code, Warehouse.createdAt, Warehouse.id, Warehouse.isDefault (+10 more)

### Community 76 - "Inventory schema"
Cohesion: 0.12
Nodes (18): StockTransaction.createdAt, StockTransaction.createdBy, StockTransaction.id, StockTransaction.note, StockTransaction.option, StockTransaction.optionId, StockTransaction.optionName, StockTransaction.organization (+10 more)

### Community 77 - "Inventory schema"
Cohesion: 0.12
Nodes (18): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.fromWarehouseId, StockTransfer.id, StockTransfer.notes, StockTransfer.option, StockTransfer.optionId (+10 more)

### Community 78 - "Supply schema"
Cohesion: 0.12
Nodes (18): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.dueDate, SupplierPayment.id, SupplierPayment.notes, SupplierPayment.organization, SupplierPayment.organizationId, SupplierPayment.paidAmount (+10 more)

### Community 79 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): WorkflowTemplate.createdAt, WorkflowTemplate.description, WorkflowTemplate.edgesJson, WorkflowTemplate.id, WorkflowTemplate.isActive, WorkflowTemplate.marketplace, WorkflowTemplate.marketplaceId, WorkflowTemplate.module (+10 more)

### Community 80 - "Finance schema"
Cohesion: 0.14
Nodes (17): Finance, SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.organization (+9 more)

### Community 81 - "Inventory schema"
Cohesion: 0.14
Nodes (17): Inventory, StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items (+9 more)

### Community 82 - "Finance schema"
Cohesion: 0.12
Nodes (17): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.id, ProcessingCost.master, ProcessingCost.masterId, ProcessingCost.notes, ProcessingCost.organization, ProcessingCost.organizationId (+9 more)

### Community 83 - "Supply schema"
Cohesion: 0.12
Nodes (17): PurchaseOrder.supplierId, Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.id, Supplier.leadTimeDays, Supplier.name (+9 more)

### Community 84 - "Core schema"
Cohesion: 0.16
Nodes (16): ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id, ChannelAccount.isPrimary, ChannelAccount.name, ChannelAccount.organization (+8 more)

### Community 85 - "Advertising schema"
Cohesion: 0.13
Nodes (16): ExecutionTask.action, ExecutionTask.actionId, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt, ExecutionTask.errorMessage, ExecutionTask.finishedAt (+8 more)

### Community 86 - "Sourcing schema"
Cohesion: 0.17
Nodes (16): NaverPopularKeywordDailySnapshot.boardKey, NaverPopularKeywordDailySnapshot.boardLabel, NaverPopularKeywordDailySnapshot.businessDate, NaverPopularKeywordDailySnapshot.capturedAt, NaverPopularKeywordDailySnapshot.cid, NaverPopularKeywordDailySnapshot.createdAt, NaverPopularKeywordDailySnapshot.id, NaverPopularKeywordDailySnapshot.keyword (+8 more)

### Community 87 - "Core schema"
Cohesion: 0.15
Nodes (16): OrganizationMembership.createdAt, OrganizationMembership.id, OrganizationMembership.invitedBy, OrganizationMembership.invitedById, OrganizationMembership.joinedAt, OrganizationMembership.lastSelectedAt, OrganizationMembership.organization, OrganizationMembership.organizationId (+8 more)

### Community 88 - "Inventory schema"
Cohesion: 0.13
Nodes (16): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.organizationId, SellpiaReceiptUploadBatch.sourceRef (+8 more)

### Community 89 - "Inventory schema"
Cohesion: 0.13
Nodes (16): SellpiaStockSnapshot.createdAt, SellpiaStockSnapshot.createdBy, SellpiaStockSnapshot.effectiveExportedAt, SellpiaStockSnapshot.fileHash, SellpiaStockSnapshot.fileName, SellpiaStockSnapshot.id, SellpiaStockSnapshot.metaJson, SellpiaStockSnapshot.organization (+8 more)

### Community 90 - "Core schema"
Cohesion: 0.15
Nodes (15): prisma — Shared Schema, LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata (+7 more)

### Community 91 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 92 - "Advertising schema"
Cohesion: 0.14
Nodes (15): ExecutionTask.workerId, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentTaskRef, ExecutionWorker.currentUrl, ExecutionWorker.id, ExecutionWorker.label, ExecutionWorker.lastHeartbeatAt (+7 more)

### Community 93 - "Finance schema"
Cohesion: 0.14
Nodes (15): GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.marginScore, GradeHistory.master, GradeHistory.masterId, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization (+7 more)

### Community 94 - "Finance schema"
Cohesion: 0.14
Nodes (15): ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description, ManualLedger.id (+7 more)

### Community 95 - "Orders schema"
Cohesion: 0.14
Nodes (15): OrderReturnLineItem.createdAt, OrderReturnLineItem.id, OrderReturnLineItem.metadata, OrderReturnLineItem.option, OrderReturnLineItem.optionId, OrderReturnLineItem.orderLineItem, OrderReturnLineItem.orderLineItemId, OrderReturnLineItem.organization (+7 more)

### Community 96 - "AI schema"
Cohesion: 0.14
Nodes (15): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt (+7 more)

### Community 97 - "AI schema"
Cohesion: 0.14
Nodes (15): ThumbnailRegistrationAttempt.createdAt, ThumbnailRegistrationAttempt.errorMessage, ThumbnailRegistrationAttempt.externalId, ThumbnailRegistrationAttempt.finishedAt, ThumbnailRegistrationAttempt.generation, ThumbnailRegistrationAttempt.generationId, ThumbnailRegistrationAttempt.id, ThumbnailRegistrationAttempt.organization (+7 more)

### Community 98 - "Channels schema"
Cohesion: 0.18
Nodes (14): Channels, CoupangKeywordTracker.createdAt, CoupangKeywordTracker.enabled, CoupangKeywordTracker.id, CoupangKeywordTracker.keyword, CoupangKeywordTracker.lastCapturedAt, CoupangKeywordTracker.maxPages, CoupangKeywordTracker.organization (+6 more)

### Community 99 - "Orders schema"
Cohesion: 0.15
Nodes (14): Orders, Review.content, Review.createdAt, Review.id, Review.listing, Review.listingId, Review.organization, Review.organizationId (+6 more)

### Community 100 - "Channels schema"
Cohesion: 0.19
Nodes (14): CoupangKeywordSerpDailySnapshot.businessDate, CoupangKeywordSerpDailySnapshot.capturedAt, CoupangKeywordSerpDailySnapshot.createdAt, CoupangKeywordSerpDailySnapshot.id, CoupangKeywordSerpDailySnapshot.itemCount, CoupangKeywordSerpDailySnapshot.items, CoupangKeywordSerpDailySnapshot.keyword, CoupangKeywordSerpDailySnapshot.organization (+6 more)

### Community 101 - "Channels schema"
Cohesion: 0.18
Nodes (14): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.organizationId, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson (+6 more)

### Community 102 - "AI schema"
Cohesion: 0.19
Nodes (13): AI, ContentGenerationAssetUsage.contentAsset, ContentGenerationAssetUsage.contentAssetId, ContentGenerationAssetUsage.contentGeneration, ContentGenerationAssetUsage.contentGenerationId, ContentGenerationAssetUsage.createdAt, ContentGenerationAssetUsage.id, ContentGenerationAssetUsage.organization (+5 more)

### Community 103 - "Sourcing schema"
Cohesion: 0.19
Nodes (13): Sourcing, TrendSeedKeyword.createdAt, TrendSeedKeyword.enabled, TrendSeedKeyword.id, TrendSeedKeyword.keyword, TrendSeedKeyword.keywordCn, TrendSeedKeyword.organization, TrendSeedKeyword.organizationId (+5 more)

### Community 104 - "Supply schema"
Cohesion: 0.19
Nodes (13): Supply, SupplierProduct.createdAt, SupplierProduct.id, SupplierProduct.minOrderQty, SupplierProduct.option, SupplierProduct.optionId, SupplierProduct.supplier, SupplierProduct.supplierId (+5 more)

### Community 105 - "Core schema"
Cohesion: 0.19
Nodes (13): BundleComponent.bundleOption, BundleComponent.bundleOptionId, BundleComponent.componentOption, BundleComponent.componentOptionId, BundleComponent.createdAt, BundleComponent.id, BundleComponent.organization, BundleComponent.organizationId (+5 more)

### Community 106 - "Core schema"
Cohesion: 0.19
Nodes (13): CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.isActive, CategoryMapping.keywords, CategoryMapping.organization (+5 more)

### Community 107 - "Supply schema"
Cohesion: 0.19
Nodes (13): MasterSupplierProduct.createdAt, MasterSupplierProduct.id, MasterSupplierProduct.isPrimary, MasterSupplierProduct.master, MasterSupplierProduct.masterId, MasterSupplierProduct.memo, MasterSupplierProduct.minOrderQty, MasterSupplierProduct.supplier (+5 more)

### Community 108 - "System schema"
Cohesion: 0.18
Nodes (12): ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization, ActivityEvent.organizationId (+4 more)

### Community 109 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 110 - "Advertising schema"
Cohesion: 0.20
Nodes (11): Advertising, ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task (+3 more)

### Community 111 - "System schema"
Cohesion: 0.24
Nodes (11): System, SystemSetting.createdAt, SystemSetting.id, SystemSetting.key, SystemSetting.organization, SystemSetting.organizationId, SystemSetting.updatedAt, SystemSetting.value (+3 more)

### Community 112 - "Supply schema"
Cohesion: 0.20
Nodes (11): PurchaseOrderItem.createdAt, PurchaseOrderItem.id, PurchaseOrderItem.option, PurchaseOrderItem.optionId, PurchaseOrderItem.order, PurchaseOrderItem.orderId, PurchaseOrderItem.productName, PurchaseOrderItem.quantity (+3 more)

### Community 113 - "Advertising schema"
Cohesion: 0.20
Nodes (11): ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.id, ScrapeTarget.isActive, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.organizationId (+3 more)

### Community 114 - "Sourcing schema"
Cohesion: 0.25
Nodes (11): SourcingWorkspaceSnapshot.businessDate, SourcingWorkspaceSnapshot.createdAt, SourcingWorkspaceSnapshot.id, SourcingWorkspaceSnapshot.organization, SourcingWorkspaceSnapshot.organizationId, SourcingWorkspaceSnapshot.payload, SourcingWorkspaceSnapshot.scope, SourcingWorkspaceSnapshot.updatedAt (+3 more)

### Community 115 - "Channels schema"
Cohesion: 0.27
Nodes (10): CoupangRepresentativeKeywordOverride.createdAt, CoupangRepresentativeKeywordOverride.id, CoupangRepresentativeKeywordOverride.keyword, CoupangRepresentativeKeywordOverride.organization, CoupangRepresentativeKeywordOverride.organizationId, CoupangRepresentativeKeywordOverride.updatedAt, CoupangRepresentativeKeywordOverride.vendorItemId, CoupangRepresentativeKeywordOverride (+2 more)

### Community 116 - "System schema"
Cohesion: 0.22
Nodes (10): FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name, FeatureGate.updatedAt (+2 more)

### Community 117 - "Core schema"
Cohesion: 0.25
Nodes (9): Organization.createdAt, Organization.id, Organization.isActive, Organization.name, Organization.slug, Organization.updatedAt, Thumbnail.organizationId, Organization (+1 more)

### Community 118 - "Core schema"
Cohesion: 0.40
Nodes (6): Core, MasterCodeCounter.key, MasterCodeCounter.updatedAt, MasterCodeCounter.value, MasterCodeCounter, master_code_counters

### Community 119 - "prisma field: ChannelReconciliationItem.channel"
Cohesion: 0.40
Nodes (5): ChannelReconciliationItem.channel, ChannelReconciliationItem.itemKey, ChannelReconciliationItem.organizationId, ChannelReconciliationItem.source, ChannelReconciliationItem unique(organizationId, channel, source, itemKey)

### Community 120 - "prisma field: ActionTask.date"
Cohesion: 0.50
Nodes (4): ActionTask.date, ActionTask.organizationId, ActionTask.taskKey, ActionTask unique(organizationId, taskKey, date)

### Community 121 - "prisma field: ChannelListingDailySnapshot.businessDate"
Cohesion: 0.50
Nodes (4): ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.listingId, ChannelListingDailySnapshot.organizationId, ChannelListingDailySnapshot unique(organizationId, listingId, businessDate)

### Community 122 - "prisma field: Alert.operationKey"
Cohesion: 0.67
Nodes (3): Alert.operationKey, Alert.organizationId, Alert unique(organizationId, operationKey)

## Knowledge Gaps
- **1655 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+1650 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Core schema` to `Channels schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `AI schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `AgentOS schema`, `Channels schema`, `Core schema`, `AI schema`, `AgentOS schema`, `Channels schema`, `Sourcing schema`, `AI schema`, `Channels schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `Inventory schema`, `AI schema`, `Advertising schema`, `AgentOS schema`, `System schema`, `Core schema`, `Channels schema`, `AI schema`, `Supply schema`, `Inventory schema`, `AI schema`, `AgentOS schema`, `AI schema`, `Orders schema`, `System schema`, `Sourcing schema`, `Channels schema`, `Core schema`, `Orders schema`, `AgentOS schema`, `System schema`, `Channels schema`, `Sourcing schema`, `System schema`, `Finance schema`, `Sourcing schema`, `AI schema`, `AI schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Orders schema`, `Sourcing schema`, `AgentOS schema`, `Channels schema`, `Orders schema`, `AI schema`, `AI schema`, `AI schema`, `Sourcing schema`, `Sourcing schema`, `AI schema`, `Channels schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Orders schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `Finance schema`, `Inventory schema`, `Finance schema`, `Supply schema`, `Core schema`, `Advertising schema`, `Sourcing schema`, `Core schema`, `Inventory schema`, `Inventory schema`, `Core schema`, `System schema`, `Advertising schema`, `Finance schema`, `Finance schema`, `Orders schema`, `AI schema`, `AI schema`, `Channels schema`, `Orders schema`, `Channels schema`, `Channels schema`, `AI schema`, `Sourcing schema`, `Supply schema`, `Core schema`, `Core schema`, `Supply schema`, `System schema`, `System schema`, `Advertising schema`, `System schema`, `Supply schema`, `Advertising schema`, `Sourcing schema`, `Channels schema`, `System schema`, `Core schema`, `Core schema`, `prisma field: ChannelReconciliationItem.channel`, `prisma field: ActionTask.date`, `prisma field: ChannelListingDailySnapshot.businessDate`, `prisma field: Alert.operationKey`?**
  _High betweenness centrality (0.534) - this node is a cross-community bridge._
- **Why does `Organization` connect `Core schema` to `Channels schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `AI schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `AgentOS schema`, `Channels schema`, `Core schema`, `AI schema`, `AgentOS schema`, `Channels schema`, `Sourcing schema`, `AI schema`, `Channels schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `Inventory schema`, `AI schema`, `Advertising schema`, `AgentOS schema`, `System schema`, `Core schema`, `Channels schema`, `AI schema`, `Supply schema`, `Inventory schema`, `AI schema`, `Core schema`, `AgentOS schema`, `AI schema`, `Orders schema`, `System schema`, `Sourcing schema`, `Channels schema`, `Core schema`, `Orders schema`, `AgentOS schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Finance schema`, `Sourcing schema`, `AI schema`, `AI schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Orders schema`, `Sourcing schema`, `AgentOS schema`, `Channels schema`, `Orders schema`, `AI schema`, `AI schema`, `AI schema`, `Sourcing schema`, `Sourcing schema`, `AI schema`, `Channels schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Orders schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `Finance schema`, `Inventory schema`, `Finance schema`, `Supply schema`, `Core schema`, `Sourcing schema`, `Core schema`, `Inventory schema`, `Inventory schema`, `Core schema`, `Advertising schema`, `Finance schema`, `Finance schema`, `Orders schema`, `AI schema`, `AI schema`, `Channels schema`, `Orders schema`, `Channels schema`, `Channels schema`, `AI schema`, `Sourcing schema`, `Core schema`, `Core schema`, `System schema`, `System schema`, `Advertising schema`, `Sourcing schema`, `Channels schema`, `Core schema`, `prisma field: ChannelReconciliationItem.channel`, `prisma field: ActionTask.date`, `prisma field: ChannelListingDailySnapshot.businessDate`, `prisma field: Alert.operationKey`?**
  _High betweenness centrality (0.354) - this node is a cross-community bridge._
- **Why does `ChannelListingDailySnapshot` connect `Channels schema` to `Core schema`, `Channels schema`, `Channels schema`, `Core schema`, `prisma field: ChannelListingDailySnapshot.businessDate`, `Core schema`, `prisma field: ChannelListingDailySnapshot.id`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **What connects `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason` to the rest of the system?**
  _1655 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Channels schema` be split into smaller, more focused modules?**
  _Cohesion score 0.038461538461538464 - nodes in this community are weakly interconnected._
- **Should `AgentOS schema` be split into smaller, more focused modules?**
  _Cohesion score 0.04717853839037928 - nodes in this community are weakly interconnected._
- **Should `AgentOS schema` be split into smaller, more focused modules?**
  _Cohesion score 0.048484848484848485 - nodes in this community are weakly interconnected._