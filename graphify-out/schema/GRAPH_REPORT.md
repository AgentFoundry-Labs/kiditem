# Graph Report - schema  (2026-07-26)

## Corpus Check
- 13 files · ~27,767 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2929 nodes · 4763 edges · 139 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Channels schema
- AgentOS schema
- AgentOS schema
- Channels schema
- AI schema
- Inventory schema
- AI schema
- Sourcing schema
- Inventory schema
- Channels schema
- Core schema
- AI schema
- Channels schema
- Supply schema
- AgentOS schema
- Orders schema
- Core schema
- AI schema
- AgentOS schema
- Orders schema
- Channels schema
- Channels schema
- Core schema
- Advertising schema
- System schema
- AI schema
- Inventory schema
- AgentOS schema
- Channels schema
- Core schema
- AI schema
- Supply schema
- System schema
- AgentOS schema
- AgentOS schema
- AI schema
- Orders schema
- AgentOS schema
- AI schema
- Channels schema
- AI schema
- Sourcing schema
- Sourcing schema
- Channels schema
- Channels schema
- Orders schema
- Supply schema
- Sourcing schema
- AgentOS schema
- AI schema
- System schema
- AI schema
- Sourcing schema
- System schema
- Finance schema
- Channels schema
- Sourcing schema
- AI schema
- AI schema
- AgentOS schema
- Inventory schema
- Sourcing schema
- Core schema
- AgentOS schema
- Channels schema
- Supply schema
- Channels schema
- Inventory schema
- Orders schema
- Core schema
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
- Core schema
- Channels schema
- Orders schema
- Inventory schema
- Supply schema
- Supply schema
- AgentOS schema
- Finance schema
- Channels schema
- AI schema
- Orders schema
- Inventory schema
- Supply schema
- Inventory schema
- Supply schema
- AI schema
- AI schema
- Advertising schema
- Sourcing schema
- Core schema
- Finance schema
- Channels schema
- Inventory schema
- System schema
- Advertising schema
- Finance schema
- Finance schema
- Core schema
- Inventory schema
- Core schema
- Supply schema
- Channels schema
- Channels schema
- Inventory schema
- Channels schema
- Core schema
- Core schema
- Supply schema
- Orders schema
- Sourcing schema
- System schema
- AI schema
- Core schema
- System schema
- Inventory schema
- Sourcing schema
- Advertising schema
- Channels schema
- System schema
- Advertising schema
- System schema
- Core schema
- prisma field: SourcingCandidate.id
- prisma field: prisma — Shared Schema
- prisma field: CoupangWingSalesRankDailySnapshot.businessDate
- prisma field: ChannelListingDailySnapshot.businessDate
- prisma field: RocketPoCatalogLine.poLineId

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 376 edges
2. `Organization` - 268 edges
3. `prisma — Shared Schema` - 171 edges
4. `ChannelListing` - 88 edges
5. `User` - 87 edges
6. `AgentRunRequest` - 74 edges
7. `AgentRun` - 68 edges
8. `ProductPreparation` - 66 edges
9. `SourceImportRun` - 64 edges
10. `ChannelListingDailySnapshot` - 63 edges
11. `ContentWorkspace` - 60 edges
12. `ChannelAccount` - 56 edges

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

## Communities (139 total, 0 thin omitted)

### Community 0 - "Channels schema"
Cohesion: 0.04
Nodes (54): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+46 more)

### Community 1 - "AgentOS schema"
Cohesion: 0.05
Nodes (46): AgentRunRequest.agentInstance, AgentRunRequest.agentInstanceId, AgentRunRequest.attempts, AgentRunRequest.claimedAt, AgentRunRequest.claimedBy, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.coalescedIntoRequestId, AgentRunRequest.conversation (+38 more)

### Community 2 - "AgentOS schema"
Cohesion: 0.05
Nodes (43): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+35 more)

### Community 3 - "Channels schema"
Cohesion: 0.06
Nodes (43): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignIdentity, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel (+35 more)

### Community 4 - "AI schema"
Cohesion: 0.06
Nodes (43): ProductPreparation.approvedAt, ProductPreparation.approvedByUser, ProductPreparation.approvedByUserId, ProductPreparation.channelAccount, ProductPreparation.channelAccountId, ProductPreparation.channelListing, ProductPreparation.channelListingId, ProductPreparation.createdAt (+35 more)

### Community 5 - "Inventory schema"
Cohesion: 0.06
Nodes (41): InventoryCommitment.businessKey, InventoryCommitment.createdAt, InventoryCommitment.createdBy, InventoryCommitment.creator, InventoryCommitment.id, InventoryCommitment.inventoryGeneration, InventoryCommitment.kind, InventoryCommitment.organization (+33 more)

### Community 6 - "AI schema"
Cohesion: 0.06
Nodes (41): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+33 more)

### Community 7 - "Sourcing schema"
Cohesion: 0.07
Nodes (36): ProductRegistrationExecution.channelAccount, ProductRegistrationExecution.channelAccountId, ProductRegistrationExecution.channelListing, ProductRegistrationExecution.channelListingId, ProductRegistrationExecution.completedAt, ProductRegistrationExecution.createdAt, ProductRegistrationExecution.executionKind, ProductRegistrationExecution.expectedProviderAccountId (+28 more)

### Community 8 - "Inventory schema"
Cohesion: 0.07
Nodes (36): Shipment.warehouseId, StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.fromWarehouseId, StockTransfer.id, StockTransfer.notes, StockTransfer.optionName (+28 more)

### Community 9 - "Channels schema"
Cohesion: 0.07
Nodes (35): Database ERD, ChannelAdTargetDailySnapshot.listingOptionId, ChannelListingOption.barcode, ChannelListingOption.isActive, ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.externalId (+27 more)

### Community 10 - "Core schema"
Cohesion: 0.09
Nodes (34): ChannelListing.lastImportRunId, SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.createdAt, SourceImportRun.createdBy, SourceImportRun.errorCode, SourceImportRun.errorMessage (+26 more)

### Community 11 - "AI schema"
Cohesion: 0.09
Nodes (33): ContentWorkspace.channelListing, ContentWorkspace.channelListingId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.createdByUserId, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageRevision, ContentWorkspace.currentThumbnailSelection (+25 more)

### Community 12 - "Channels schema"
Cohesion: 0.08
Nodes (32): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.channelAccount, ChannelScrapeRun.channelAccountId, ChannelScrapeRun.clientRunKey, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson (+24 more)

### Community 13 - "Supply schema"
Cohesion: 0.07
Nodes (32): RocketPurchaseConfirmation.artifactBytes, RocketPurchaseConfirmation.artifactContentType, RocketPurchaseConfirmation.artifactFileName, RocketPurchaseConfirmation.artifactSha256, RocketPurchaseConfirmation.artifactStoredAt, RocketPurchaseConfirmation.channelAccount, RocketPurchaseConfirmation.completedAt, RocketPurchaseConfirmation.confirmedAt (+24 more)

### Community 14 - "AgentOS schema"
Cohesion: 0.08
Nodes (31): AgentOS, AgentAuthorizationEvent.toolId, AgentInstanceToolPolicy.agentInstance, AgentInstanceToolPolicy.agentInstanceId, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentInstanceToolPolicy.dryRunMode (+23 more)

### Community 15 - "Orders schema"
Cohesion: 0.08
Nodes (31): Orders, Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.id, Shipment.order (+23 more)

### Community 16 - "Core schema"
Cohesion: 0.09
Nodes (31): ChannelListing.brand, ChannelListing.category, ChannelListing.channelAccount, ChannelListing.channelAccountId, ChannelListing.channelName, ChannelListing.createdAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo (+23 more)

### Community 17 - "AI schema"
Cohesion: 0.07
Nodes (31): ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.contentWorkspaceId, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.editedHtmlSavedAt (+23 more)

### Community 18 - "AgentOS schema"
Cohesion: 0.08
Nodes (30): AgentToolInvocation.agentInstance, AgentToolInvocation.agentInstanceId, AgentToolInvocation.approvalRequest, AgentToolInvocation.approvalRequestId, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt (+22 more)

### Community 19 - "Orders schema"
Cohesion: 0.08
Nodes (30): Order.channelAccount, Order.channelAccountId, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id (+22 more)

### Community 20 - "Channels schema"
Cohesion: 0.08
Nodes (29): ChannelListingDeletionOperation.authorizationExpiresAt, ChannelListingDeletionOperation.channelAccount, ChannelListingDeletionOperation.channelAccountId, ChannelListingDeletionOperation.channelListing, ChannelListingDeletionOperation.channelListingId, ChannelListingDeletionOperation.completedAt, ChannelListingDeletionOperation.createdAt, ChannelListingDeletionOperation.expectedProviderAccountId (+21 more)

### Community 21 - "Channels schema"
Cohesion: 0.07
Nodes (29): RocketPoCatalogLine.barcode, RocketPoCatalogLine.businessDateBasis, RocketPoCatalogLine.center, RocketPoCatalogLine.createdAt, RocketPoCatalogLine.hasConfirmation, RocketPoCatalogLine.id, RocketPoCatalogLine.inboundType, RocketPoCatalogLine.orderQty (+21 more)

### Community 22 - "Core schema"
Cohesion: 0.08
Nodes (28): externalOptionId canonical option identity, vendorItemId provider term, ChannelListingOption.attributesJson, ChannelListingOption.commissionRate, ChannelListingOption.costPriceOverride, ChannelListingOption.createdAt, ChannelListingOption.externalOptionId, ChannelListingOption.id (+20 more)

### Community 23 - "Advertising schema"
Cohesion: 0.07
Nodes (28): AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+20 more)

### Community 24 - "System schema"
Cohesion: 0.08
Nodes (28): Alert.actionTask, Alert.actorUser, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead, Alert.kind (+20 more)

### Community 25 - "AI schema"
Cohesion: 0.08
Nodes (28): ProductPreparation.selectedThumbnailGenerationId, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.createdAt, ThumbnailGeneration.deletedAt, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.errorMessage, ThumbnailGeneration.grade (+20 more)

### Community 26 - "Inventory schema"
Cohesion: 0.07
Nodes (28): SellpiaInventoryState.activeGeneration, SellpiaInventoryState.activeSyncLeaseExpiresAt, SellpiaInventoryState.activeSyncOwner, SellpiaInventoryState.activeSyncOwnerUserId, SellpiaInventoryState.activeSyncStartedAt, SellpiaInventoryState.activeSyncToken, SellpiaInventoryState.createdAt, SellpiaInventoryState.failedGeneration (+20 more)

### Community 27 - "AgentOS schema"
Cohesion: 0.08
Nodes (27): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.agentInstanceId, AgentApprovalRequest.approver, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy, AgentApprovalRequest.decisionReason (+19 more)

### Community 28 - "Channels schema"
Cohesion: 0.08
Nodes (27): ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.externalId, ChannelScrapeSnapshot.externalOptionId, ChannelScrapeSnapshot.id (+19 more)

### Community 29 - "Core schema"
Cohesion: 0.09
Nodes (27): ChannelListing.masterProductId, MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.adTier, MasterProduct.brand, MasterProduct.category, MasterProduct.code, MasterProduct.createdAt (+19 more)

### Community 30 - "AI schema"
Cohesion: 0.08
Nodes (27): DetailPageImageRenderIntent.attempt, DetailPageImageRenderIntent.claimedAt, DetailPageImageRenderIntent.claimedBy, DetailPageImageRenderIntent.claimedByUserId, DetailPageImageRenderIntent.completedArtifact, DetailPageImageRenderIntent.completedAt, DetailPageImageRenderIntent.createdAt, DetailPageImageRenderIntent.detailPageArtifact (+19 more)

### Community 31 - "Supply schema"
Cohesion: 0.08
Nodes (27): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+19 more)

### Community 32 - "System schema"
Cohesion: 0.09
Nodes (26): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.href, ActionTask.id (+18 more)

### Community 33 - "AgentOS schema"
Cohesion: 0.08
Nodes (26): AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.agentInstanceId, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy, AgentAuthorizationEvent.decidedByUserId (+18 more)

### Community 34 - "AgentOS schema"
Cohesion: 0.09
Nodes (26): AgentInstance.adapterConfig, AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.icon, AgentInstance.id, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name (+18 more)

### Community 35 - "AI schema"
Cohesion: 0.09
Nodes (26): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height (+18 more)

### Community 36 - "Orders schema"
Cohesion: 0.10
Nodes (25): OrderReturn.channelAccount, OrderReturn.channelAccountId, OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.id (+17 more)

### Community 37 - "AgentOS schema"
Cohesion: 0.09
Nodes (24): AgentArtifact.agentInstance, AgentArtifact.agentInstanceId, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization (+16 more)

### Community 38 - "AI schema"
Cohesion: 0.09
Nodes (24): ContentGeneration.detailPageArtifactId, ContentWorkspace.currentDetailPageArtifactId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.contentWorkspaceId, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.createdByUserId, DetailPageArtifact.currentRevision (+16 more)

### Community 39 - "Channels schema"
Cohesion: 0.09
Nodes (24): CoupangWingSalesRankDailySnapshot.capturedAt, CoupangWingSalesRankDailySnapshot.categoryHierarchy, CoupangWingSalesRankDailySnapshot.collectedCount, CoupangWingSalesRankDailySnapshot.conversionRate28d, CoupangWingSalesRankDailySnapshot.createdAt, CoupangWingSalesRankDailySnapshot.id, CoupangWingSalesRankDailySnapshot.itemId, CoupangWingSalesRankDailySnapshot.keywordConversionRate28d (+16 more)

### Community 40 - "AI schema"
Cohesion: 0.11
Nodes (24): DetailPageImageArtifact.byteLength, DetailPageImageArtifact.contentType, DetailPageImageArtifact.createdAt, DetailPageImageArtifact.createdBy, DetailPageImageArtifact.createdByUserId, DetailPageImageArtifact.id, DetailPageImageArtifact.imageUrl, DetailPageImageArtifact.objectKey (+16 more)

### Community 41 - "Sourcing schema"
Cohesion: 0.08
Nodes (24): SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.imageUrl, SourcingCandidate.isDeleted, SourcingCandidate.name (+16 more)

### Community 42 - "Sourcing schema"
Cohesion: 0.09
Nodes (23): CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id, CandidateImage.isDeleted (+15 more)

### Community 43 - "Channels schema"
Cohesion: 0.11
Nodes (23): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.channelAccount, ChannelAccountDailyKpiSnapshot.channelAccountId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+15 more)

### Community 44 - "Channels schema"
Cohesion: 0.11
Nodes (23): CoupangKeywordRankDailySnapshot.adRank, CoupangKeywordRankDailySnapshot.businessDate, CoupangKeywordRankDailySnapshot.capturedAt, CoupangKeywordRankDailySnapshot.createdAt, CoupangKeywordRankDailySnapshot.id, CoupangKeywordRankDailySnapshot.itemId, CoupangKeywordRankDailySnapshot.keyword, CoupangKeywordRankDailySnapshot.organicRank (+15 more)

### Community 45 - "Orders schema"
Cohesion: 0.11
Nodes (23): OrderLineItem.createdAt, OrderLineItem.externalBarcode, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.listingOptionId, OrderLineItem.metadata, OrderLineItem.optionName (+15 more)

### Community 46 - "Supply schema"
Cohesion: 0.11
Nodes (23): RocketPurchaseConfirmationLine.barcode, RocketPurchaseConfirmationLine.channelListingOption, RocketPurchaseConfirmationLine.channelListingOptionId, RocketPurchaseConfirmationLine.collectedAt, RocketPurchaseConfirmationLine.collectedOrderLineItemId, RocketPurchaseConfirmationLine.confirmation, RocketPurchaseConfirmationLine.confirmationId, RocketPurchaseConfirmationLine.confirmedQuantity (+15 more)

### Community 47 - "Sourcing schema"
Cohesion: 0.11
Nodes (23): TiktokCreativeTrendDailySnapshot.businessDate, TiktokCreativeTrendDailySnapshot.capturedAt, TiktokCreativeTrendDailySnapshot.createdAt, TiktokCreativeTrendDailySnapshot.entityKey, TiktokCreativeTrendDailySnapshot.growthPct, TiktokCreativeTrendDailySnapshot.id, TiktokCreativeTrendDailySnapshot.industry, TiktokCreativeTrendDailySnapshot.label (+15 more)

### Community 48 - "AgentOS schema"
Cohesion: 0.10
Nodes (22): AgentCostEvent.agentInstance, AgentCostEvent.agentInstanceId, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id (+14 more)

### Community 49 - "AI schema"
Cohesion: 0.11
Nodes (22): AiDirectJob.attempts, AiDirectJob.claimedAt, AiDirectJob.claimedBy, AiDirectJob.createdAt, AiDirectJob.finishedAt, AiDirectJob.id, AiDirectJob.jobType, AiDirectJob.lastErrorCode (+14 more)

### Community 50 - "System schema"
Cohesion: 0.10
Nodes (22): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+14 more)

### Community 51 - "AI schema"
Cohesion: 0.10
Nodes (22): ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.currentRevisionId, DetailPageImageRenderIntent.organizationId, DetailPageImageRenderIntent.revisionId, DetailPageRevision.artifact, DetailPageRevision.artifactId, DetailPageRevision.assetUrlMap, DetailPageRevision.contentGeneration (+14 more)

### Community 52 - "Sourcing schema"
Cohesion: 0.11
Nodes (22): LiveCommerceBroadcastDailySnapshot.broadcasterId, LiveCommerceBroadcastDailySnapshot.broadcasterName, LiveCommerceBroadcastDailySnapshot.broadcastId, LiveCommerceBroadcastDailySnapshot.businessDate, LiveCommerceBroadcastDailySnapshot.capturedAt, LiveCommerceBroadcastDailySnapshot.coverImageUrl, LiveCommerceBroadcastDailySnapshot.createdAt, LiveCommerceBroadcastDailySnapshot.endedAt (+14 more)

### Community 53 - "System schema"
Cohesion: 0.10
Nodes (22): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon, Marketplace.id (+14 more)

### Community 54 - "Finance schema"
Cohesion: 0.11
Nodes (22): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.listingId, ProfitLoss.month (+14 more)

### Community 55 - "Channels schema"
Cohesion: 0.11
Nodes (22): SellpiaProductMonthlySales.barcode, SellpiaProductMonthlySales.buyPrice, SellpiaProductMonthlySales.capturedAt, SellpiaProductMonthlySales.createdAt, SellpiaProductMonthlySales.id, SellpiaProductMonthlySales.inAmount, SellpiaProductMonthlySales.inQty, SellpiaProductMonthlySales.optionCode (+14 more)

### Community 56 - "Sourcing schema"
Cohesion: 0.11
Nodes (22): ShortsTrendDailySnapshot.businessDate, ShortsTrendDailySnapshot.capturedAt, ShortsTrendDailySnapshot.channelName, ShortsTrendDailySnapshot.commentCount, ShortsTrendDailySnapshot.createdAt, ShortsTrendDailySnapshot.id, ShortsTrendDailySnapshot.keyword, ShortsTrendDailySnapshot.likeCount (+14 more)

### Community 57 - "AI schema"
Cohesion: 0.10
Nodes (22): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.contentWorkspace, ThumbnailAnalysis.contentWorkspaceId, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id (+14 more)

### Community 58 - "AI schema"
Cohesion: 0.10
Nodes (22): ThumbnailGenerationInputImage.candidateImage, ThumbnailGenerationInputImage.createdAt, ThumbnailGenerationInputImage.fileSize, ThumbnailGenerationInputImage.generation, ThumbnailGenerationInputImage.generationId, ThumbnailGenerationInputImage.height, ThumbnailGenerationInputImage.id, ThumbnailGenerationInputImage.label (+14 more)

### Community 59 - "AgentOS schema"
Cohesion: 0.12
Nodes (21): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.agentInstanceId, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError (+13 more)

### Community 60 - "Inventory schema"
Cohesion: 0.11
Nodes (21): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.notes, ReturnTransfer.optionName, ReturnTransfer.orderId (+13 more)

### Community 61 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): Sourcing1688HotProductDailySnapshot.businessDate, Sourcing1688HotProductDailySnapshot.capturedAt, Sourcing1688HotProductDailySnapshot.createdAt, Sourcing1688HotProductDailySnapshot.id, Sourcing1688HotProductDailySnapshot.imageUrl, Sourcing1688HotProductDailySnapshot.monthlySales, Sourcing1688HotProductDailySnapshot.offerId, Sourcing1688HotProductDailySnapshot.organization (+13 more)

### Community 62 - "Core schema"
Cohesion: 0.11
Nodes (20): ActionTask.assigneeUserId, AgentApprovalRequest.approverUserId, AgentApprovalRequest.decidedByUserId, AgentApprovalRequest.requestedByUserId, Alert.actorUserId, User.agentInstance, User.avatarUrl, User.createdAt (+12 more)

### Community 63 - "AgentOS schema"
Cohesion: 0.11
Nodes (20): AgentRuntimeState.agentInstance, AgentRuntimeState.agentInstanceId, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.id, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun (+12 more)

### Community 64 - "Channels schema"
Cohesion: 0.12
Nodes (20): CoupangWingTrackedProductDailySnapshot.businessDate, CoupangWingTrackedProductDailySnapshot.capturedAt, CoupangWingTrackedProductDailySnapshot.conversionRate28d, CoupangWingTrackedProductDailySnapshot.createdAt, CoupangWingTrackedProductDailySnapshot.estimatedRevenue28d, CoupangWingTrackedProductDailySnapshot.id, CoupangWingTrackedProductDailySnapshot.organization, CoupangWingTrackedProductDailySnapshot.organizationId (+12 more)

### Community 65 - "Supply schema"
Cohesion: 0.12
Nodes (20): PurchaseOrderSubmissionAttempt.createdAt, PurchaseOrderSubmissionAttempt.errorCode, PurchaseOrderSubmissionAttempt.errorMessage, PurchaseOrderSubmissionAttempt.freshnessGeneration, PurchaseOrderSubmissionAttempt.id, PurchaseOrderSubmissionAttempt.idempotencyKey, PurchaseOrderSubmissionAttempt.organization, PurchaseOrderSubmissionAttempt.organizationId (+12 more)

### Community 66 - "Channels schema"
Cohesion: 0.14
Nodes (20): RocketPoCatalogLine.organizationId, RocketPoCatalogSnapshot.channelAccount, RocketPoCatalogSnapshot.channelAccountId, RocketPoCatalogSnapshot.collectionRunId, RocketPoCatalogSnapshot.createdAt, RocketPoCatalogSnapshot.detailPoCount, RocketPoCatalogSnapshot.id, RocketPoCatalogSnapshot.listPagesRead (+12 more)

### Community 67 - "Inventory schema"
Cohesion: 0.13
Nodes (20): SellpiaInventorySku.barcode, SellpiaInventorySku.code, SellpiaInventorySku.createdAt, SellpiaInventorySku.currentStock, SellpiaInventorySku.id, SellpiaInventorySku.isActive, SellpiaInventorySku.lastImportRun, SellpiaInventorySku.lastImportRunId (+12 more)

### Community 68 - "Orders schema"
Cohesion: 0.12
Nodes (20): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+12 more)

### Community 69 - "Core schema"
Cohesion: 0.14
Nodes (19): ChannelListingOption.productVariantId, ProductVariant.code, ProductVariant.createdAt, ProductVariant.id, ProductVariant.isActive, ProductVariant.isDefault, ProductVariant.masterProduct, ProductVariant.masterProductId (+11 more)

### Community 70 - "AI schema"
Cohesion: 0.12
Nodes (19): ContentAsset.originGenerationGroupId, ContentGeneration.generationGroupId, ContentGenerationGroup.baseContentGeneration, ContentGenerationGroup.baseContentGenerationId, ContentGenerationGroup.contentWorkspace, ContentGenerationGroup.contentWorkspaceId, ContentGenerationGroup.createdAt, ContentGenerationGroup.createdByUserId (+11 more)

### Community 71 - "AI schema"
Cohesion: 0.11
Nodes (19): ContentGenerationSource.contentAsset, ContentGenerationSource.contentAssetId, ContentGenerationSource.contentGeneration, ContentGenerationSource.contentGenerationId, ContentGenerationSource.createdAt, ContentGenerationSource.id, ContentGenerationSource.label, ContentGenerationSource.metadata (+11 more)

### Community 72 - "Sourcing schema"
Cohesion: 0.14
Nodes (19): LiveCommerceProductDailySnapshot.broadcastId, LiveCommerceProductDailySnapshot.businessDate, LiveCommerceProductDailySnapshot.capturedAt, LiveCommerceProductDailySnapshot.createdAt, LiveCommerceProductDailySnapshot.id, LiveCommerceProductDailySnapshot.imageUrl, LiveCommerceProductDailySnapshot.organization, LiveCommerceProductDailySnapshot.organizationId (+11 more)

### Community 73 - "Sourcing schema"
Cohesion: 0.13
Nodes (19): NaverKeywordDailySnapshot.averageAdRank, NaverKeywordDailySnapshot.businessDate, NaverKeywordDailySnapshot.capturedAt, NaverKeywordDailySnapshot.competitionIndex, NaverKeywordDailySnapshot.createdAt, NaverKeywordDailySnapshot.id, NaverKeywordDailySnapshot.keyword, NaverKeywordDailySnapshot.monthlyMobileSearchCount (+11 more)

### Community 74 - "AI schema"
Cohesion: 0.12
Nodes (19): ProductPreparation.selectedThumbnailGenerationCandidateId, ThumbnailGenerationCandidate.createdAt, ThumbnailGenerationCandidate.filename, ThumbnailGenerationCandidate.fileSize, ThumbnailGenerationCandidate.generation, ThumbnailGenerationCandidate.generationId, ThumbnailGenerationCandidate.height, ThumbnailGenerationCandidate.id (+11 more)

### Community 75 - "Channels schema"
Cohesion: 0.12
Nodes (19): RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt, RocketPurchaseOrder.firstSkuName, RocketPurchaseOrder.id, RocketPurchaseOrder.items, RocketPurchaseOrder.orderAmount, RocketPurchaseOrder.orderedAt (+11 more)

### Community 76 - "AI schema"
Cohesion: 0.11
Nodes (19): ThumbnailGenerationEvent.actor, ThumbnailGenerationEvent.actorUserId, ThumbnailGenerationEvent.attemptNumber, ThumbnailGenerationEvent.createdAt, ThumbnailGenerationEvent.errorMessage, ThumbnailGenerationEvent.eventType, ThumbnailGenerationEvent.fromPhase, ThumbnailGenerationEvent.fromStatus (+11 more)

### Community 77 - "Orders schema"
Cohesion: 0.11
Nodes (19): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.externalSku, UnshippedItem.id, UnshippedItem.isNotified, UnshippedItem.notifiedAt, UnshippedItem.optionName, UnshippedItem.order (+11 more)

### Community 78 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+10 more)

### Community 79 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentMessage.agentInstance, AgentMessage.agentInstanceId, AgentMessage.content, AgentMessage.conversation, AgentMessage.conversationId, AgentMessage.createdAt, AgentMessage.id, AgentMessage.metadata (+10 more)

### Community 80 - "AgentOS schema"
Cohesion: 0.13
Nodes (18): AgentRunEvent.agentInstance, AgentRunEvent.agentInstanceId, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message (+10 more)

### Community 81 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.organizationId, WorkflowRun.startedAt (+10 more)

### Community 82 - "Core schema"
Cohesion: 0.15
Nodes (18): ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id, ChannelAccount.isPrimary, ChannelAccount.name, ChannelAccount.organization (+10 more)

### Community 83 - "Channels schema"
Cohesion: 0.13
Nodes (18): CoupangWingTrackedProduct.brandName, CoupangWingTrackedProduct.categoryHierarchy, CoupangWingTrackedProduct.createdAt, CoupangWingTrackedProduct.enabled, CoupangWingTrackedProduct.id, CoupangWingTrackedProduct.imagePath, CoupangWingTrackedProduct.itemId, CoupangWingTrackedProduct.lastCapturedAt (+10 more)

### Community 84 - "Orders schema"
Cohesion: 0.12
Nodes (18): CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing (+10 more)

### Community 85 - "Inventory schema"
Cohesion: 0.14
Nodes (18): PickingItem.organizationId, PickingItem.pickingListId, PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.id, PickingList.listNumber, PickingList.organization (+10 more)

### Community 86 - "Supply schema"
Cohesion: 0.13
Nodes (18): PurchaseOrder.supplierId, Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.id, Supplier.leadTimeDays, Supplier.name (+10 more)

### Community 87 - "Supply schema"
Cohesion: 0.12
Nodes (18): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.dueDate, SupplierPayment.id, SupplierPayment.notes, SupplierPayment.organization, SupplierPayment.organizationId, SupplierPayment.paidAmount (+10 more)

### Community 88 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): WorkflowTemplate.createdAt, WorkflowTemplate.description, WorkflowTemplate.edgesJson, WorkflowTemplate.id, WorkflowTemplate.isActive, WorkflowTemplate.marketplace, WorkflowTemplate.marketplaceId, WorkflowTemplate.module (+10 more)

### Community 89 - "Finance schema"
Cohesion: 0.14
Nodes (17): Finance, SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.organization (+9 more)

### Community 90 - "Channels schema"
Cohesion: 0.15
Nodes (17): ChannelScrapeChunk.checksum, ChannelScrapeChunk.createdAt, ChannelScrapeChunk.id, ChannelScrapeChunk.itemCount, ChannelScrapeChunk.kind, ChannelScrapeChunk.organization, ChannelScrapeChunk.organizationId, ChannelScrapeChunk.payload (+9 more)

### Community 91 - "AI schema"
Cohesion: 0.14
Nodes (17): ContentWorkspaceThumbnailSelection.contentAsset, ContentWorkspaceThumbnailSelection.contentAssetId, ContentWorkspaceThumbnailSelection.contentWorkspace, ContentWorkspaceThumbnailSelection.contentWorkspaceId, ContentWorkspaceThumbnailSelection.createdAt, ContentWorkspaceThumbnailSelection.createdByUser, ContentWorkspaceThumbnailSelection.createdByUserId, ContentWorkspaceThumbnailSelection.id (+9 more)

### Community 92 - "Orders schema"
Cohesion: 0.12
Nodes (17): OrderReturnLineItem.createdAt, OrderReturnLineItem.externalSku, OrderReturnLineItem.id, OrderReturnLineItem.listingOption, OrderReturnLineItem.listingOptionId, OrderReturnLineItem.metadata, OrderReturnLineItem.optionName, OrderReturnLineItem.orderLineItem (+9 more)

### Community 93 - "Inventory schema"
Cohesion: 0.12
Nodes (17): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.orderId, PickingItem.organization, PickingItem.pickedAt (+9 more)

### Community 94 - "Supply schema"
Cohesion: 0.15
Nodes (17): RocketPurchaseConfirmationTransmission.confirmation, RocketPurchaseConfirmationTransmission.confirmationId, RocketPurchaseConfirmationTransmission.createdAt, RocketPurchaseConfirmationTransmission.id, RocketPurchaseConfirmationTransmission.intentKey, RocketPurchaseConfirmationTransmission.matchedLineCount, RocketPurchaseConfirmationTransmission.observedAt, RocketPurchaseConfirmationTransmission.organization (+9 more)

### Community 95 - "Inventory schema"
Cohesion: 0.15
Nodes (17): SellpiaOrderTransmissionIntent.abortedAt, SellpiaOrderTransmissionIntent.createdAt, SellpiaOrderTransmissionIntent.createdBy, SellpiaOrderTransmissionIntent.creator, SellpiaOrderTransmissionIntent.finalizedAt, SellpiaOrderTransmissionIntent.finalizedGeneration, SellpiaOrderTransmissionIntent.id, SellpiaOrderTransmissionIntent.intentKey (+9 more)

### Community 96 - "Supply schema"
Cohesion: 0.15
Nodes (17): SupplierProduct.createdAt, SupplierProduct.id, SupplierProduct.isPrimary, SupplierProduct.memo, SupplierProduct.minOrderQty, SupplierProduct.organization, SupplierProduct.organizationId, SupplierProduct.sellpiaInventorySku (+9 more)

### Community 97 - "AI schema"
Cohesion: 0.12
Nodes (17): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.listingId (+9 more)

### Community 98 - "AI schema"
Cohesion: 0.13
Nodes (16): AI, ThumbnailRegistrationAttempt.createdAt, ThumbnailRegistrationAttempt.errorMessage, ThumbnailRegistrationAttempt.externalId, ThumbnailRegistrationAttempt.finishedAt, ThumbnailRegistrationAttempt.generation, ThumbnailRegistrationAttempt.generationId, ThumbnailRegistrationAttempt.id (+8 more)

### Community 99 - "Advertising schema"
Cohesion: 0.13
Nodes (16): ExecutionTask.action, ExecutionTask.actionId, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt, ExecutionTask.errorMessage, ExecutionTask.finishedAt (+8 more)

### Community 100 - "Sourcing schema"
Cohesion: 0.17
Nodes (16): NaverPopularKeywordDailySnapshot.boardKey, NaverPopularKeywordDailySnapshot.boardLabel, NaverPopularKeywordDailySnapshot.businessDate, NaverPopularKeywordDailySnapshot.capturedAt, NaverPopularKeywordDailySnapshot.cid, NaverPopularKeywordDailySnapshot.createdAt, NaverPopularKeywordDailySnapshot.id, NaverPopularKeywordDailySnapshot.keyword (+8 more)

### Community 101 - "Core schema"
Cohesion: 0.15
Nodes (16): OrganizationMembership.createdAt, OrganizationMembership.id, OrganizationMembership.invitedBy, OrganizationMembership.invitedById, OrganizationMembership.joinedAt, OrganizationMembership.lastSelectedAt, OrganizationMembership.organization, OrganizationMembership.organizationId (+8 more)

### Community 102 - "Finance schema"
Cohesion: 0.13
Nodes (16): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.id, ProcessingCost.master, ProcessingCost.masterId, ProcessingCost.notes, ProcessingCost.organization, ProcessingCost.processType (+8 more)

### Community 103 - "Channels schema"
Cohesion: 0.16
Nodes (16): SellpiaSalesDailySnapshot.businessDate, SellpiaSalesDailySnapshot.capturedAt, SellpiaSalesDailySnapshot.channelGroup, SellpiaSalesDailySnapshot.costKrw, SellpiaSalesDailySnapshot.createdAt, SellpiaSalesDailySnapshot.id, SellpiaSalesDailySnapshot.organization, SellpiaSalesDailySnapshot.organizationId (+8 more)

### Community 104 - "Inventory schema"
Cohesion: 0.15
Nodes (16): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items, StockAudit.matchedCount (+8 more)

### Community 105 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 106 - "Advertising schema"
Cohesion: 0.14
Nodes (15): ExecutionTask.workerId, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentTaskRef, ExecutionWorker.currentUrl, ExecutionWorker.id, ExecutionWorker.label, ExecutionWorker.lastHeartbeatAt (+7 more)

### Community 107 - "Finance schema"
Cohesion: 0.14
Nodes (15): GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.listing, GradeHistory.listingId, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization (+7 more)

### Community 108 - "Finance schema"
Cohesion: 0.14
Nodes (15): ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description, ManualLedger.id (+7 more)

### Community 109 - "Core schema"
Cohesion: 0.16
Nodes (15): ProductVariantComponent.confirmedAt, ProductVariantComponent.confirmedBy, ProductVariantComponent.createdAt, ProductVariantComponent.id, ProductVariantComponent.organization, ProductVariantComponent.productVariant, ProductVariantComponent.productVariantId, ProductVariantComponent.quantity (+7 more)

### Community 110 - "Inventory schema"
Cohesion: 0.14
Nodes (15): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.sourceRef, SellpiaReceiptUploadBatch.sourceType (+7 more)

### Community 111 - "Core schema"
Cohesion: 0.18
Nodes (14): Core, CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.isActive, CategoryMapping.keywords (+6 more)

### Community 112 - "Supply schema"
Cohesion: 0.18
Nodes (14): Supply, RocketPurchaseConfirmationAllocation.confirmationLine, RocketPurchaseConfirmationAllocation.confirmationLineId, RocketPurchaseConfirmationAllocation.createdAt, RocketPurchaseConfirmationAllocation.id, RocketPurchaseConfirmationAllocation.organization, RocketPurchaseConfirmationAllocation.organizationId, RocketPurchaseConfirmationAllocation.quantity (+6 more)

### Community 113 - "Channels schema"
Cohesion: 0.19
Nodes (14): CoupangKeywordSerpDailySnapshot.businessDate, CoupangKeywordSerpDailySnapshot.capturedAt, CoupangKeywordSerpDailySnapshot.createdAt, CoupangKeywordSerpDailySnapshot.id, CoupangKeywordSerpDailySnapshot.itemCount, CoupangKeywordSerpDailySnapshot.items, CoupangKeywordSerpDailySnapshot.keyword, CoupangKeywordSerpDailySnapshot.organization (+6 more)

### Community 114 - "Channels schema"
Cohesion: 0.18
Nodes (14): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.organizationId, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson (+6 more)

### Community 115 - "Inventory schema"
Cohesion: 0.19
Nodes (13): Inventory, CoupangShipmentDateSummary.boxes, CoupangShipmentDateSummary.capturedAt, CoupangShipmentDateSummary.count, CoupangShipmentDateSummary.createdAt, CoupangShipmentDateSummary.id, CoupangShipmentDateSummary.organization, CoupangShipmentDateSummary.organizationId (+5 more)

### Community 116 - "Channels schema"
Cohesion: 0.19
Nodes (13): CoupangKeywordTracker.createdAt, CoupangKeywordTracker.enabled, CoupangKeywordTracker.id, CoupangKeywordTracker.keyword, CoupangKeywordTracker.lastCapturedAt, CoupangKeywordTracker.maxPages, CoupangKeywordTracker.organization, CoupangKeywordTracker.organizationId (+5 more)

### Community 117 - "Core schema"
Cohesion: 0.17
Nodes (13): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+5 more)

### Community 118 - "Core schema"
Cohesion: 0.17
Nodes (13): MasterProductAbcPolicy.aCumulativeThreshold, MasterProductAbcPolicy.bCumulativeThreshold, MasterProductAbcPolicy.createdAt, MasterProductAbcPolicy.id, MasterProductAbcPolicy.lastCalculatedAt, MasterProductAbcPolicy.metric, MasterProductAbcPolicy.organization, MasterProductAbcPolicy.periodDays (+5 more)

### Community 119 - "Supply schema"
Cohesion: 0.17
Nodes (13): PurchaseOrderItem.createdAt, PurchaseOrderItem.id, PurchaseOrderItem.order, PurchaseOrderItem.orderId, PurchaseOrderItem.organization, PurchaseOrderItem.organizationId, PurchaseOrderItem.productName, PurchaseOrderItem.quantity (+5 more)

### Community 120 - "Orders schema"
Cohesion: 0.17
Nodes (13): Review.content, Review.createdAt, Review.id, Review.listing, Review.listingId, Review.organization, Review.organizationId, Review.platform (+5 more)

### Community 121 - "Sourcing schema"
Cohesion: 0.23
Nodes (12): Sourcing, SourcingWorkspaceSnapshot.businessDate, SourcingWorkspaceSnapshot.createdAt, SourcingWorkspaceSnapshot.id, SourcingWorkspaceSnapshot.organization, SourcingWorkspaceSnapshot.organizationId, SourcingWorkspaceSnapshot.payload, SourcingWorkspaceSnapshot.scope (+4 more)

### Community 122 - "System schema"
Cohesion: 0.18
Nodes (12): ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization, ActivityEvent.organizationId (+4 more)

### Community 123 - "AI schema"
Cohesion: 0.21
Nodes (12): ContentGenerationAssetUsage.contentAsset, ContentGenerationAssetUsage.contentAssetId, ContentGenerationAssetUsage.contentGeneration, ContentGenerationAssetUsage.contentGenerationId, ContentGenerationAssetUsage.createdAt, ContentGenerationAssetUsage.id, ContentGenerationAssetUsage.organization, ContentGenerationAssetUsage.organizationId (+4 more)

### Community 124 - "Core schema"
Cohesion: 0.18
Nodes (12): MasterProductAbcGradeHistory.calculatedAt, MasterProductAbcGradeHistory.id, MasterProductAbcGradeHistory.masterProduct, MasterProductAbcGradeHistory.masterProductId, MasterProductAbcGradeHistory.metric, MasterProductAbcGradeHistory.metricValue, MasterProductAbcGradeHistory.newGrade, MasterProductAbcGradeHistory.oldGrade (+4 more)

### Community 125 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 126 - "Inventory schema"
Cohesion: 0.18
Nodes (12): SellpiaOrderTransmissionIntentReconciliation.id, SellpiaOrderTransmissionIntentReconciliation.intent, SellpiaOrderTransmissionIntentReconciliation.intentId, SellpiaOrderTransmissionIntentReconciliation.note, SellpiaOrderTransmissionIntentReconciliation.organization, SellpiaOrderTransmissionIntentReconciliation.organizationId, SellpiaOrderTransmissionIntentReconciliation.outcome, SellpiaOrderTransmissionIntentReconciliation.reconciledAt (+4 more)

### Community 127 - "Sourcing schema"
Cohesion: 0.21
Nodes (12): TrendSeedKeyword.createdAt, TrendSeedKeyword.enabled, TrendSeedKeyword.id, TrendSeedKeyword.keyword, TrendSeedKeyword.keywordCn, TrendSeedKeyword.organization, TrendSeedKeyword.organizationId, TrendSeedKeyword.sources (+4 more)

### Community 128 - "Advertising schema"
Cohesion: 0.20
Nodes (11): Advertising, ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task (+3 more)

### Community 129 - "Channels schema"
Cohesion: 0.24
Nodes (11): Channels, CoupangRepresentativeKeywordOverride.createdAt, CoupangRepresentativeKeywordOverride.id, CoupangRepresentativeKeywordOverride.keyword, CoupangRepresentativeKeywordOverride.organization, CoupangRepresentativeKeywordOverride.organizationId, CoupangRepresentativeKeywordOverride.updatedAt, CoupangRepresentativeKeywordOverride.vendorItemId (+3 more)

### Community 130 - "System schema"
Cohesion: 0.20
Nodes (11): System, FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name (+3 more)

### Community 131 - "Advertising schema"
Cohesion: 0.20
Nodes (11): ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.id, ScrapeTarget.isActive, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.organizationId (+3 more)

### Community 132 - "System schema"
Cohesion: 0.27
Nodes (10): SystemSetting.createdAt, SystemSetting.id, SystemSetting.key, SystemSetting.organization, SystemSetting.organizationId, SystemSetting.updatedAt, SystemSetting.value, SystemSetting (+2 more)

### Community 133 - "Core schema"
Cohesion: 0.25
Nodes (9): Organization.createdAt, Organization.id, Organization.isActive, Organization.name, Organization.slug, Organization.updatedAt, SellpiaReceiptUploadBatch.organizationId, Organization (+1 more)

### Community 134 - "prisma field: SourcingCandidate.id"
Cohesion: 0.25
Nodes (8): SourcingCandidate.id, SourcingCandidate.organizationId, SourcingCandidate.provenanceMasterProductId, SourcingCandidate.sourceUrl, sourcing_candidates, SourcingCandidate unique(id, organizationId), SourcingCandidate unique(organizationId, sourceUrl), SourcingCandidate unique(provenanceMasterProductId, organizationId)

### Community 135 - "prisma field: prisma — Shared Schema"
Cohesion: 0.33
Nodes (6): prisma — Shared Schema, LegalEntity.organizationId, MasterProductAbcGradeHistory.organizationId, MasterProductAbcPolicy.organizationId, ProcessingCost.organizationId, ProductVariantComponent.organizationId

### Community 136 - "prisma field: CoupangWingSalesRankDailySnapshot.businessDate"
Cohesion: 0.40
Nodes (5): CoupangWingSalesRankDailySnapshot.businessDate, CoupangWingSalesRankDailySnapshot.keyword, CoupangWingSalesRankDailySnapshot.organizationId, CoupangWingSalesRankDailySnapshot.vendorItemId, CoupangWingSalesRankDailySnapshot unique(organizationId, keyword, vendorItemId, businessDate)

### Community 137 - "prisma field: ChannelListingDailySnapshot.businessDate"
Cohesion: 0.50
Nodes (4): ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.listingId, ChannelListingDailySnapshot.organizationId, ChannelListingDailySnapshot unique(organizationId, listingId, businessDate)

### Community 138 - "prisma field: RocketPoCatalogLine.poLineId"
Cohesion: 0.67
Nodes (3): RocketPoCatalogLine.poLineId, RocketPoCatalogLine.snapshotId, RocketPoCatalogLine unique(snapshotId, poLineId)

## Knowledge Gaps
- **1832 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+1827 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Channels schema` to `Channels schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `AI schema`, `Inventory schema`, `AI schema`, `Sourcing schema`, `Inventory schema`, `Core schema`, `AI schema`, `Channels schema`, `Supply schema`, `AgentOS schema`, `Orders schema`, `Core schema`, `AI schema`, `AgentOS schema`, `Orders schema`, `Channels schema`, `Channels schema`, `Core schema`, `Advertising schema`, `System schema`, `AI schema`, `Inventory schema`, `AgentOS schema`, `Channels schema`, `Core schema`, `AI schema`, `Supply schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `AI schema`, `Channels schema`, `AI schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `Channels schema`, `Orders schema`, `Supply schema`, `Sourcing schema`, `AgentOS schema`, `AI schema`, `System schema`, `AI schema`, `Sourcing schema`, `System schema`, `Finance schema`, `Channels schema`, `Sourcing schema`, `AI schema`, `AI schema`, `AgentOS schema`, `Inventory schema`, `Sourcing schema`, `Core schema`, `AgentOS schema`, `Channels schema`, `Supply schema`, `Channels schema`, `Inventory schema`, `Orders schema`, `Core schema`, `AI schema`, `AI schema`, `Sourcing schema`, `Sourcing schema`, `AI schema`, `Channels schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `Channels schema`, `Orders schema`, `Inventory schema`, `Supply schema`, `Supply schema`, `AgentOS schema`, `Finance schema`, `Channels schema`, `AI schema`, `Orders schema`, `Inventory schema`, `Supply schema`, `Inventory schema`, `Supply schema`, `AI schema`, `AI schema`, `Advertising schema`, `Sourcing schema`, `Core schema`, `Finance schema`, `Channels schema`, `Inventory schema`, `System schema`, `Advertising schema`, `Finance schema`, `Finance schema`, `Core schema`, `Inventory schema`, `Core schema`, `Supply schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Channels schema`, `Core schema`, `Core schema`, `Supply schema`, `Orders schema`, `Sourcing schema`, `System schema`, `AI schema`, `Core schema`, `System schema`, `Inventory schema`, `Sourcing schema`, `Advertising schema`, `Channels schema`, `System schema`, `Advertising schema`, `System schema`, `Core schema`, `prisma field: SourcingCandidate.id`, `prisma field: prisma — Shared Schema`, `prisma field: CoupangWingSalesRankDailySnapshot.businessDate`, `prisma field: ChannelListingDailySnapshot.businessDate`?**
  _High betweenness centrality (0.499) - this node is a cross-community bridge._
- **Why does `Organization` connect `Core schema` to `Channels schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `AI schema`, `Inventory schema`, `AI schema`, `Sourcing schema`, `Inventory schema`, `Channels schema`, `Core schema`, `AI schema`, `Channels schema`, `Supply schema`, `AgentOS schema`, `Orders schema`, `Core schema`, `AI schema`, `AgentOS schema`, `Orders schema`, `Channels schema`, `Channels schema`, `Core schema`, `Advertising schema`, `System schema`, `AI schema`, `Inventory schema`, `AgentOS schema`, `Channels schema`, `Core schema`, `AI schema`, `Supply schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `AI schema`, `Channels schema`, `AI schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `Channels schema`, `Orders schema`, `Supply schema`, `Sourcing schema`, `AgentOS schema`, `AI schema`, `System schema`, `AI schema`, `Sourcing schema`, `Finance schema`, `Channels schema`, `Sourcing schema`, `AI schema`, `AI schema`, `AgentOS schema`, `Inventory schema`, `Sourcing schema`, `AgentOS schema`, `Channels schema`, `Supply schema`, `Channels schema`, `Inventory schema`, `Orders schema`, `Core schema`, `AI schema`, `AI schema`, `Sourcing schema`, `Sourcing schema`, `AI schema`, `Channels schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `Channels schema`, `Orders schema`, `Inventory schema`, `Supply schema`, `Supply schema`, `AgentOS schema`, `Finance schema`, `Channels schema`, `AI schema`, `Orders schema`, `Inventory schema`, `Supply schema`, `Inventory schema`, `Supply schema`, `AI schema`, `AI schema`, `Sourcing schema`, `Core schema`, `Finance schema`, `Channels schema`, `Inventory schema`, `Advertising schema`, `Finance schema`, `Finance schema`, `Core schema`, `Inventory schema`, `Core schema`, `Supply schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Channels schema`, `Core schema`, `Core schema`, `Supply schema`, `Orders schema`, `Sourcing schema`, `System schema`, `AI schema`, `Core schema`, `Inventory schema`, `Sourcing schema`, `Channels schema`, `Advertising schema`, `System schema`, `prisma field: SourcingCandidate.id`, `prisma field: prisma — Shared Schema`, `prisma field: CoupangWingSalesRankDailySnapshot.businessDate`, `prisma field: ChannelListingDailySnapshot.businessDate`?**
  _High betweenness centrality (0.359) - this node is a cross-community bridge._
- **Why does `ChannelListingDailySnapshot` connect `Channels schema` to `Channels schema`, `Core schema`, `Channels schema`, `prisma field: ChannelListingDailySnapshot.businessDate`, `Core schema`, `Channels schema`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **What connects `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason` to the rest of the system?**
  _1832 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Channels schema` be split into smaller, more focused modules?**
  _Cohesion score 0.03773584905660377 - nodes in this community are weakly interconnected._
- **Should `AgentOS schema` be split into smaller, more focused modules?**
  _Cohesion score 0.04734299516908213 - nodes in this community are weakly interconnected._
- **Should `AgentOS schema` be split into smaller, more focused modules?**
  _Cohesion score 0.04983388704318937 - nodes in this community are weakly interconnected._