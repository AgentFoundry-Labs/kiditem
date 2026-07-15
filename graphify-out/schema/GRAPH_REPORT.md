# Graph Report - schema  (2026-07-14)

## Corpus Check
- 13 files · ~22,272 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2367 nodes · 3813 edges · 112 communities (111 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Channels schema
- Sourcing schema
- AgentOS schema
- AgentOS schema
- AI schema
- Channels schema
- Channels schema
- AI schema
- Core schema
- Finance schema
- Channels schema
- AI schema
- AgentOS schema
- AI schema
- AI schema
- System schema
- Channels schema
- Advertising schema
- Orders schema
- Core schema
- System schema
- Channels schema
- Supply schema
- AgentOS schema
- AgentOS schema
- AgentOS schema
- Core schema
- AI schema
- Channels schema
- Orders schema
- AgentOS schema
- Sourcing schema
- Channels schema
- AI schema
- Channels schema
- AgentOS schema
- System schema
- Sourcing schema
- Sourcing schema
- System schema
- Orders schema
- Finance schema
- Sourcing schema
- AI schema
- AI schema
- AgentOS schema
- Inventory schema
- Sourcing schema
- Advertising schema
- AgentOS schema
- AI schema
- AI schema
- Orders schema
- AI schema
- AI schema
- Sourcing schema
- Core schema
- Channels schema
- Orders schema
- AI schema
- Orders schema
- Core schema
- AgentOS schema
- AgentOS schema
- AgentOS schema
- AgentOS schema
- Orders schema
- Inventory schema
- Supply schema
- Inventory schema
- Supply schema
- AgentOS schema
- Core schema
- AgentOS schema
- Inventory schema
- Core schema
- Channels schema
- AI schema
- Orders schema
- Inventory schema
- Finance schema
- Inventory schema
- Supply schema
- AI schema
- Advertising schema
- Core schema
- Inventory schema
- Channels schema
- System schema
- Advertising schema
- Finance schema
- AI schema
- Supply schema
- AgentOS schema
- Channels schema
- Channels schema
- AI schema
- Orders schema
- Core schema
- Channels schema
- System schema
- System schema
- Orders schema
- Advertising schema
- Channels schema
- System schema
- Sourcing schema
- System schema
- Core schema
- prisma field: SourcingCandidate.id
- prisma field: ChannelListingDailySnapshot.businessDate
- prisma field: ChannelListingDailySnapshot.id

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 321 edges
2. `Organization` - 218 edges
3. `prisma — Shared Schema` - 139 edges
4. `ChannelListing` - 80 edges
5. `AgentRunRequest` - 74 edges
6. `AgentRun` - 68 edges
7. `ChannelListingDailySnapshot` - 63 edges
8. `ContentWorkspace` - 60 edges
9. `User` - 60 edges
10. `ProductPreparation` - 57 edges
11. `AgentInstance` - 53 edges
12. `ChannelListingOption` - 53 edges

## Surprising Connections (you probably didn't know these)
- `Database ERD` --mentions_field--> `AdAction.targetType`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.externalId`  [EXTRACTED]
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
- `Database ERD` --mentions_field--> `ChannelListingDailySnapshot.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/channels.prisma

## Import Cycles
- None detected.

## Communities (112 total, 1 thin omitted)

### Community 0 - "Channels schema"
Cohesion: 0.04
Nodes (52): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+44 more)

### Community 1 - "Sourcing schema"
Cohesion: 0.05
Nodes (48): Sourcing, NaverKeywordDailySnapshot.averageAdRank, NaverKeywordDailySnapshot.businessDate, NaverKeywordDailySnapshot.capturedAt, NaverKeywordDailySnapshot.competitionIndex, NaverKeywordDailySnapshot.createdAt, NaverKeywordDailySnapshot.id, NaverKeywordDailySnapshot.keyword (+40 more)

### Community 2 - "AgentOS schema"
Cohesion: 0.05
Nodes (46): AgentRunRequest.agentInstance, AgentRunRequest.agentInstanceId, AgentRunRequest.attempts, AgentRunRequest.claimedAt, AgentRunRequest.claimedBy, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.coalescedIntoRequestId, AgentRunRequest.conversation (+38 more)

### Community 3 - "AgentOS schema"
Cohesion: 0.05
Nodes (43): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+35 more)

### Community 4 - "AI schema"
Cohesion: 0.06
Nodes (41): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+33 more)

### Community 5 - "Channels schema"
Cohesion: 0.06
Nodes (40): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel, ChannelAdTargetDailySnapshot.clicks (+32 more)

### Community 6 - "Channels schema"
Cohesion: 0.06
Nodes (38): CoupangWingTrackedProduct.brandName, CoupangWingTrackedProduct.categoryHierarchy, CoupangWingTrackedProduct.createdAt, CoupangWingTrackedProduct.enabled, CoupangWingTrackedProduct.id, CoupangWingTrackedProduct.imagePath, CoupangWingTrackedProduct.itemId, CoupangWingTrackedProduct.lastCapturedAt (+30 more)

### Community 7 - "AI schema"
Cohesion: 0.06
Nodes (38): ProductPreparation.channelAccount, ProductPreparation.channelAccountId, ProductPreparation.channelListing, ProductPreparation.channelListingId, ProductPreparation.createdAt, ProductPreparation.createdByUser, ProductPreparation.createdByUserId, ProductPreparation.deletedAt (+30 more)

### Community 8 - "Core schema"
Cohesion: 0.07
Nodes (35): ChannelListing.abcGrade, ChannelListing.adBudgetLimit, ChannelListing.adTier, ChannelListing.brand, ChannelListing.category, ChannelListing.channelAccount, ChannelListing.channelAccountId, ChannelListing.channelName (+27 more)

### Community 9 - "Finance schema"
Cohesion: 0.07
Nodes (32): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description (+24 more)

### Community 10 - "Channels schema"
Cohesion: 0.08
Nodes (32): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.channelAccount, ChannelScrapeRun.channelAccountId, ChannelScrapeRun.clientRunKey, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson (+24 more)

### Community 11 - "AI schema"
Cohesion: 0.09
Nodes (32): ContentWorkspace.channelListing, ContentWorkspace.channelListingId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.createdByUserId, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageRevision, ContentWorkspace.currentThumbnailSelection (+24 more)

### Community 12 - "AgentOS schema"
Cohesion: 0.08
Nodes (30): AgentToolInvocation.agentInstance, AgentToolInvocation.agentInstanceId, AgentToolInvocation.approvalRequest, AgentToolInvocation.approvalRequestId, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt (+22 more)

### Community 13 - "AI schema"
Cohesion: 0.07
Nodes (30): ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.contentWorkspaceId, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.editedHtmlSavedAt (+22 more)

### Community 14 - "AI schema"
Cohesion: 0.07
Nodes (30): ProductPreparation.selectedThumbnailGenerationId, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.contentWorkspaceId, ThumbnailGeneration.createdAt, ThumbnailGeneration.deletedAt, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.errorMessage (+22 more)

### Community 15 - "System schema"
Cohesion: 0.08
Nodes (29): Alert.actionTask, Alert.actorUser, Alert.actorUserId, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead (+21 more)

### Community 16 - "Channels schema"
Cohesion: 0.08
Nodes (29): CoupangWingSalesRankDailySnapshot.businessDate, CoupangWingSalesRankDailySnapshot.capturedAt, CoupangWingSalesRankDailySnapshot.categoryHierarchy, CoupangWingSalesRankDailySnapshot.collectedCount, CoupangWingSalesRankDailySnapshot.conversionRate28d, CoupangWingSalesRankDailySnapshot.createdAt, CoupangWingSalesRankDailySnapshot.id, CoupangWingSalesRankDailySnapshot.itemId (+21 more)

### Community 17 - "Advertising schema"
Cohesion: 0.07
Nodes (28): AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+20 more)

### Community 18 - "Orders schema"
Cohesion: 0.09
Nodes (28): Order.channelAccount, Order.channelAccountId, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id (+20 more)

### Community 19 - "Core schema"
Cohesion: 0.09
Nodes (27): externalOptionId canonical option identity, vendorItemId provider term, ChannelListingOption.attributesJson, ChannelListingOption.commissionRate, ChannelListingOption.costPriceOverride, ChannelListingOption.createdAt, ChannelListingOption.externalOptionId, ChannelListingOption.id (+19 more)

### Community 20 - "System schema"
Cohesion: 0.09
Nodes (27): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.href (+19 more)

### Community 21 - "Channels schema"
Cohesion: 0.09
Nodes (27): ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.externalOptionId, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isOfferWinner, ChannelListingOptionDailySnapshot.lastObservedAt (+19 more)

### Community 22 - "Supply schema"
Cohesion: 0.08
Nodes (27): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+19 more)

### Community 23 - "AgentOS schema"
Cohesion: 0.08
Nodes (26): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.agentInstanceId, AgentApprovalRequest.approver, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy, AgentApprovalRequest.decisionReason (+18 more)

### Community 24 - "AgentOS schema"
Cohesion: 0.08
Nodes (26): AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.agentInstanceId, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy, AgentAuthorizationEvent.decidedByUserId (+18 more)

### Community 25 - "AgentOS schema"
Cohesion: 0.09
Nodes (26): AgentInstance.adapterConfig, AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.icon, AgentInstance.id, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name (+18 more)

### Community 26 - "Core schema"
Cohesion: 0.12
Nodes (26): ChannelListing.lastImportRunId, ChannelListingOption.lastImportRunId, ChannelScrapeRun.sourceImportRunId, MasterProduct.lastImportRunId, SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.createdAt (+18 more)

### Community 27 - "AI schema"
Cohesion: 0.09
Nodes (26): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height (+18 more)

### Community 28 - "Channels schema"
Cohesion: 0.09
Nodes (25): ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelListingOptionDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.externalId, ChannelScrapeSnapshot.id (+17 more)

### Community 29 - "Orders schema"
Cohesion: 0.10
Nodes (25): OrderReturn.channelAccount, OrderReturn.channelAccountId, OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.id (+17 more)

### Community 30 - "AgentOS schema"
Cohesion: 0.09
Nodes (24): AgentArtifact.agentInstance, AgentArtifact.agentInstanceId, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization (+16 more)

### Community 31 - "Sourcing schema"
Cohesion: 0.08
Nodes (24): ContentGeneration.sourceCandidateId, SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.imageUrl, SourcingCandidate.isDeleted (+16 more)

### Community 32 - "Channels schema"
Cohesion: 0.11
Nodes (23): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.channelAccount, ChannelAccountDailyKpiSnapshot.channelAccountId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+15 more)

### Community 33 - "AI schema"
Cohesion: 0.10
Nodes (23): ContentGeneration.detailPageArtifactId, ContentWorkspace.currentDetailPageArtifactId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.contentWorkspaceId, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.createdByUserId, DetailPageArtifact.currentRevision (+15 more)

### Community 34 - "Channels schema"
Cohesion: 0.11
Nodes (23): CoupangKeywordRankDailySnapshot.adRank, CoupangKeywordRankDailySnapshot.businessDate, CoupangKeywordRankDailySnapshot.capturedAt, CoupangKeywordRankDailySnapshot.createdAt, CoupangKeywordRankDailySnapshot.id, CoupangKeywordRankDailySnapshot.itemId, CoupangKeywordRankDailySnapshot.keyword, CoupangKeywordRankDailySnapshot.organicRank (+15 more)

### Community 35 - "AgentOS schema"
Cohesion: 0.10
Nodes (22): AgentCostEvent.agentInstance, AgentCostEvent.agentInstanceId, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id (+14 more)

### Community 36 - "System schema"
Cohesion: 0.10
Nodes (22): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+14 more)

### Community 37 - "Sourcing schema"
Cohesion: 0.10
Nodes (22): CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id, CandidateImage.isDeleted (+14 more)

### Community 38 - "Sourcing schema"
Cohesion: 0.11
Nodes (22): LiveCommerceBroadcastDailySnapshot.broadcasterId, LiveCommerceBroadcastDailySnapshot.broadcasterName, LiveCommerceBroadcastDailySnapshot.broadcastId, LiveCommerceBroadcastDailySnapshot.businessDate, LiveCommerceBroadcastDailySnapshot.capturedAt, LiveCommerceBroadcastDailySnapshot.coverImageUrl, LiveCommerceBroadcastDailySnapshot.createdAt, LiveCommerceBroadcastDailySnapshot.endedAt (+14 more)

### Community 39 - "System schema"
Cohesion: 0.10
Nodes (22): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon, Marketplace.id (+14 more)

### Community 40 - "Orders schema"
Cohesion: 0.11
Nodes (22): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.listingOptionId, OrderLineItem.metadata, OrderLineItem.optionName, OrderLineItem.order (+14 more)

### Community 41 - "Finance schema"
Cohesion: 0.11
Nodes (22): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.listingId, ProfitLoss.month (+14 more)

### Community 42 - "Sourcing schema"
Cohesion: 0.11
Nodes (22): ShortsTrendDailySnapshot.businessDate, ShortsTrendDailySnapshot.capturedAt, ShortsTrendDailySnapshot.channelName, ShortsTrendDailySnapshot.commentCount, ShortsTrendDailySnapshot.createdAt, ShortsTrendDailySnapshot.id, ShortsTrendDailySnapshot.keyword, ShortsTrendDailySnapshot.likeCount (+14 more)

### Community 43 - "AI schema"
Cohesion: 0.10
Nodes (22): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.contentWorkspace, ThumbnailAnalysis.contentWorkspaceId, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id (+14 more)

### Community 44 - "AI schema"
Cohesion: 0.10
Nodes (22): ThumbnailGenerationInputImage.candidateImage, ThumbnailGenerationInputImage.candidateImageId, ThumbnailGenerationInputImage.createdAt, ThumbnailGenerationInputImage.fileSize, ThumbnailGenerationInputImage.generation, ThumbnailGenerationInputImage.generationId, ThumbnailGenerationInputImage.height, ThumbnailGenerationInputImage.id (+14 more)

### Community 45 - "AgentOS schema"
Cohesion: 0.12
Nodes (21): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.agentInstanceId, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError (+13 more)

### Community 46 - "Inventory schema"
Cohesion: 0.11
Nodes (21): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.masterProduct, ReturnTransfer.masterProductId, ReturnTransfer.notes (+13 more)

### Community 47 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): Sourcing1688HotProductDailySnapshot.businessDate, Sourcing1688HotProductDailySnapshot.capturedAt, Sourcing1688HotProductDailySnapshot.createdAt, Sourcing1688HotProductDailySnapshot.id, Sourcing1688HotProductDailySnapshot.imageUrl, Sourcing1688HotProductDailySnapshot.monthlySales, Sourcing1688HotProductDailySnapshot.offerId, Sourcing1688HotProductDailySnapshot.organization (+13 more)

### Community 48 - "Advertising schema"
Cohesion: 0.12
Nodes (20): Database ERD, ChannelAdTargetDailySnapshot.listingOptionId, ChannelListingOption.barcode, ChannelListingOption.isActive, ChannelListingOptionDailySnapshot.externalId, ChannelListingOptionDailySnapshot.isActive, ChannelListingOptionDailySnapshot.listingId, ChannelScrapeSnapshot.externalOptionId (+12 more)

### Community 49 - "AgentOS schema"
Cohesion: 0.11
Nodes (20): AgentRuntimeState.agentInstance, AgentRuntimeState.agentInstanceId, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.id, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun (+12 more)

### Community 50 - "AI schema"
Cohesion: 0.12
Nodes (20): ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.currentRevisionId, DetailPageRevision.artifact, DetailPageRevision.artifactId, DetailPageRevision.assetUrlMap, DetailPageRevision.contentGeneration, DetailPageRevision.contentGenerationId, DetailPageRevision.createdAt (+12 more)

### Community 51 - "AI schema"
Cohesion: 0.12
Nodes (20): ProductPreparation.selectedThumbnailGenerationCandidateId, ThumbnailGenerationCandidate.createdAt, ThumbnailGenerationCandidate.filename, ThumbnailGenerationCandidate.fileSize, ThumbnailGenerationCandidate.generation, ThumbnailGenerationCandidate.generationId, ThumbnailGenerationCandidate.height, ThumbnailGenerationCandidate.id (+12 more)

### Community 52 - "Orders schema"
Cohesion: 0.12
Nodes (20): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+12 more)

### Community 53 - "AI schema"
Cohesion: 0.12
Nodes (19): ContentAsset.originGenerationGroupId, ContentGeneration.generationGroupId, ContentGenerationGroup.baseContentGeneration, ContentGenerationGroup.baseContentGenerationId, ContentGenerationGroup.contentWorkspace, ContentGenerationGroup.contentWorkspaceId, ContentGenerationGroup.createdAt, ContentGenerationGroup.createdByUserId (+11 more)

### Community 54 - "AI schema"
Cohesion: 0.11
Nodes (19): ContentGenerationSource.contentAsset, ContentGenerationSource.contentAssetId, ContentGenerationSource.contentGeneration, ContentGenerationSource.contentGenerationId, ContentGenerationSource.createdAt, ContentGenerationSource.id, ContentGenerationSource.label, ContentGenerationSource.metadata (+11 more)

### Community 55 - "Sourcing schema"
Cohesion: 0.14
Nodes (19): LiveCommerceProductDailySnapshot.broadcastId, LiveCommerceProductDailySnapshot.businessDate, LiveCommerceProductDailySnapshot.capturedAt, LiveCommerceProductDailySnapshot.createdAt, LiveCommerceProductDailySnapshot.id, LiveCommerceProductDailySnapshot.imageUrl, LiveCommerceProductDailySnapshot.organization, LiveCommerceProductDailySnapshot.organizationId (+11 more)

### Community 56 - "Core schema"
Cohesion: 0.13
Nodes (19): MasterProduct.barcode, MasterProduct.code, MasterProduct.createdAt, MasterProduct.currentStock, MasterProduct.id, MasterProduct.isActive, MasterProduct.lastImportRun, MasterProduct.name (+11 more)

### Community 57 - "Channels schema"
Cohesion: 0.12
Nodes (19): RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt, RocketPurchaseOrder.firstSkuName, RocketPurchaseOrder.id, RocketPurchaseOrder.items, RocketPurchaseOrder.orderAmount, RocketPurchaseOrder.orderedAt (+11 more)

### Community 58 - "Orders schema"
Cohesion: 0.12
Nodes (19): Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.id, Shipment.order, Shipment.orderId (+11 more)

### Community 59 - "AI schema"
Cohesion: 0.11
Nodes (19): ThumbnailGenerationEvent.actor, ThumbnailGenerationEvent.actorUserId, ThumbnailGenerationEvent.attemptNumber, ThumbnailGenerationEvent.createdAt, ThumbnailGenerationEvent.errorMessage, ThumbnailGenerationEvent.eventType, ThumbnailGenerationEvent.fromPhase, ThumbnailGenerationEvent.fromStatus (+11 more)

### Community 60 - "Orders schema"
Cohesion: 0.11
Nodes (19): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.externalSku, UnshippedItem.id, UnshippedItem.isNotified, UnshippedItem.notifiedAt, UnshippedItem.optionName, UnshippedItem.order (+11 more)

### Community 61 - "Core schema"
Cohesion: 0.12
Nodes (18): AgentApprovalRequest.approverUserId, AgentApprovalRequest.decidedByUserId, AgentApprovalRequest.requestedByUserId, User.agentInstance, User.avatarUrl, User.createdAt, User.email, User.id (+10 more)

### Community 62 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+10 more)

### Community 63 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentMessage.agentInstance, AgentMessage.agentInstanceId, AgentMessage.content, AgentMessage.conversation, AgentMessage.conversationId, AgentMessage.createdAt, AgentMessage.id, AgentMessage.metadata (+10 more)

### Community 64 - "AgentOS schema"
Cohesion: 0.13
Nodes (18): AgentRunEvent.agentInstance, AgentRunEvent.agentInstanceId, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message (+10 more)

### Community 65 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.organizationId, WorkflowRun.startedAt (+10 more)

### Community 66 - "Orders schema"
Cohesion: 0.12
Nodes (18): CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing (+10 more)

### Community 67 - "Inventory schema"
Cohesion: 0.14
Nodes (18): PickingItem.organizationId, PickingItem.pickingListId, PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.id, PickingList.listNumber, PickingList.organization (+10 more)

### Community 68 - "Supply schema"
Cohesion: 0.13
Nodes (18): PurchaseOrder.supplierId, Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.id, Supplier.leadTimeDays, Supplier.name (+10 more)

### Community 69 - "Inventory schema"
Cohesion: 0.14
Nodes (18): StockTransfer.fromWarehouseId, StockTransfer.organizationId, Warehouse.address, Warehouse.code, Warehouse.createdAt, Warehouse.id, Warehouse.isDefault, Warehouse.manager (+10 more)

### Community 70 - "Supply schema"
Cohesion: 0.12
Nodes (18): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.dueDate, SupplierPayment.id, SupplierPayment.notes, SupplierPayment.organization, SupplierPayment.organizationId, SupplierPayment.paidAmount (+10 more)

### Community 71 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): WorkflowTemplate.createdAt, WorkflowTemplate.description, WorkflowTemplate.edgesJson, WorkflowTemplate.id, WorkflowTemplate.isActive, WorkflowTemplate.marketplace, WorkflowTemplate.marketplaceId, WorkflowTemplate.module (+10 more)

### Community 72 - "Core schema"
Cohesion: 0.14
Nodes (17): prisma — Shared Schema, Core, AgentApprovalRequest.organizationId, LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id (+9 more)

### Community 73 - "AgentOS schema"
Cohesion: 0.15
Nodes (17): AgentOS, AgentInstanceToolPolicy.agentInstance, AgentInstanceToolPolicy.agentInstanceId, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentInstanceToolPolicy.dryRunMode, AgentInstanceToolPolicy.effect (+9 more)

### Community 74 - "Inventory schema"
Cohesion: 0.14
Nodes (17): Inventory, StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items (+9 more)

### Community 75 - "Core schema"
Cohesion: 0.16
Nodes (17): ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id, ChannelAccount.isPrimary, ChannelAccount.name, ChannelAccount.organization (+9 more)

### Community 76 - "Channels schema"
Cohesion: 0.15
Nodes (17): ChannelScrapeChunk.checksum, ChannelScrapeChunk.createdAt, ChannelScrapeChunk.id, ChannelScrapeChunk.itemCount, ChannelScrapeChunk.kind, ChannelScrapeChunk.organization, ChannelScrapeChunk.organizationId, ChannelScrapeChunk.payload (+9 more)

### Community 77 - "AI schema"
Cohesion: 0.14
Nodes (17): ContentWorkspaceThumbnailSelection.contentAsset, ContentWorkspaceThumbnailSelection.contentAssetId, ContentWorkspaceThumbnailSelection.contentWorkspace, ContentWorkspaceThumbnailSelection.contentWorkspaceId, ContentWorkspaceThumbnailSelection.createdAt, ContentWorkspaceThumbnailSelection.createdByUser, ContentWorkspaceThumbnailSelection.createdByUserId, ContentWorkspaceThumbnailSelection.id (+9 more)

### Community 78 - "Orders schema"
Cohesion: 0.12
Nodes (17): OrderReturnLineItem.createdAt, OrderReturnLineItem.externalSku, OrderReturnLineItem.id, OrderReturnLineItem.listingOption, OrderReturnLineItem.listingOptionId, OrderReturnLineItem.metadata, OrderReturnLineItem.optionName, OrderReturnLineItem.orderLineItem (+9 more)

### Community 79 - "Inventory schema"
Cohesion: 0.12
Nodes (17): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.masterProduct, PickingItem.masterProductId, PickingItem.orderId (+9 more)

### Community 80 - "Finance schema"
Cohesion: 0.12
Nodes (17): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.id, ProcessingCost.master, ProcessingCost.masterId, ProcessingCost.notes, ProcessingCost.organization, ProcessingCost.organizationId (+9 more)

### Community 81 - "Inventory schema"
Cohesion: 0.12
Nodes (17): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.id, StockTransfer.masterProduct, StockTransfer.masterProductId, StockTransfer.notes, StockTransfer.optionName (+9 more)

### Community 82 - "Supply schema"
Cohesion: 0.15
Nodes (17): SupplierProduct.createdAt, SupplierProduct.id, SupplierProduct.isPrimary, SupplierProduct.masterProduct, SupplierProduct.masterProductId, SupplierProduct.memo, SupplierProduct.minOrderQty, SupplierProduct.organization (+9 more)

### Community 83 - "AI schema"
Cohesion: 0.12
Nodes (17): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.listingId (+9 more)

### Community 84 - "Advertising schema"
Cohesion: 0.13
Nodes (16): ExecutionTask.action, ExecutionTask.actionId, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt, ExecutionTask.errorMessage, ExecutionTask.finishedAt (+8 more)

### Community 85 - "Core schema"
Cohesion: 0.15
Nodes (16): OrganizationMembership.createdAt, OrganizationMembership.id, OrganizationMembership.invitedBy, OrganizationMembership.invitedById, OrganizationMembership.joinedAt, OrganizationMembership.lastSelectedAt, OrganizationMembership.organization, OrganizationMembership.organizationId (+8 more)

### Community 86 - "Inventory schema"
Cohesion: 0.13
Nodes (16): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.organizationId, SellpiaReceiptUploadBatch.sourceRef (+8 more)

### Community 87 - "Channels schema"
Cohesion: 0.16
Nodes (15): ChannelSkuComponent.channelSku, ChannelSkuComponent.channelSkuId, ChannelSkuComponent.createdAt, ChannelSkuComponent.createdBy, ChannelSkuComponent.id, ChannelSkuComponent.mappingSource, ChannelSkuComponent.masterProduct, ChannelSkuComponent.masterProductId (+7 more)

### Community 88 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 89 - "Advertising schema"
Cohesion: 0.14
Nodes (15): ExecutionTask.workerId, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentTaskRef, ExecutionWorker.currentUrl, ExecutionWorker.id, ExecutionWorker.label, ExecutionWorker.lastHeartbeatAt (+7 more)

### Community 90 - "Finance schema"
Cohesion: 0.14
Nodes (15): GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.listing, GradeHistory.listingId, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization (+7 more)

### Community 91 - "AI schema"
Cohesion: 0.14
Nodes (15): ThumbnailRegistrationAttempt.createdAt, ThumbnailRegistrationAttempt.errorMessage, ThumbnailRegistrationAttempt.externalId, ThumbnailRegistrationAttempt.finishedAt, ThumbnailRegistrationAttempt.generation, ThumbnailRegistrationAttempt.generationId, ThumbnailRegistrationAttempt.id, ThumbnailRegistrationAttempt.organization (+7 more)

### Community 92 - "Supply schema"
Cohesion: 0.15
Nodes (14): Supply, PurchaseOrderItem.createdAt, PurchaseOrderItem.id, PurchaseOrderItem.masterProduct, PurchaseOrderItem.masterProductId, PurchaseOrderItem.order, PurchaseOrderItem.orderId, PurchaseOrderItem.organization (+6 more)

### Community 93 - "AgentOS schema"
Cohesion: 0.15
Nodes (14): AgentAuthorizationEvent.toolId, AgentToolDefinition.createdAt, AgentToolDefinition.credentialKind, AgentToolDefinition.description, AgentToolDefinition.id, AgentToolDefinition.inputSchemaJson, AgentToolDefinition.isActive, AgentToolDefinition.key (+6 more)

### Community 94 - "Channels schema"
Cohesion: 0.19
Nodes (14): CoupangKeywordSerpDailySnapshot.businessDate, CoupangKeywordSerpDailySnapshot.capturedAt, CoupangKeywordSerpDailySnapshot.createdAt, CoupangKeywordSerpDailySnapshot.id, CoupangKeywordSerpDailySnapshot.itemCount, CoupangKeywordSerpDailySnapshot.items, CoupangKeywordSerpDailySnapshot.keyword, CoupangKeywordSerpDailySnapshot.organization (+6 more)

### Community 95 - "Channels schema"
Cohesion: 0.18
Nodes (14): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.organizationId, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson (+6 more)

### Community 96 - "AI schema"
Cohesion: 0.19
Nodes (13): AI, ContentGenerationAssetUsage.contentAsset, ContentGenerationAssetUsage.contentAssetId, ContentGenerationAssetUsage.contentGeneration, ContentGenerationAssetUsage.contentGenerationId, ContentGenerationAssetUsage.createdAt, ContentGenerationAssetUsage.id, ContentGenerationAssetUsage.organization (+5 more)

### Community 97 - "Orders schema"
Cohesion: 0.19
Nodes (13): Orders, ShipmentItem.createdAt, ShipmentItem.id, ShipmentItem.orderLineItem, ShipmentItem.orderLineItemId, ShipmentItem.organization, ShipmentItem.organizationId, ShipmentItem.quantity (+5 more)

### Community 98 - "Core schema"
Cohesion: 0.19
Nodes (13): CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.isActive, CategoryMapping.keywords, CategoryMapping.organization (+5 more)

### Community 99 - "Channels schema"
Cohesion: 0.19
Nodes (13): CoupangKeywordTracker.createdAt, CoupangKeywordTracker.enabled, CoupangKeywordTracker.id, CoupangKeywordTracker.keyword, CoupangKeywordTracker.lastCapturedAt, CoupangKeywordTracker.maxPages, CoupangKeywordTracker.organization, CoupangKeywordTracker.organizationId (+5 more)

### Community 100 - "System schema"
Cohesion: 0.18
Nodes (12): ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization, ActivityEvent.organizationId (+4 more)

### Community 101 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 102 - "Orders schema"
Cohesion: 0.18
Nodes (12): Review.content, Review.createdAt, Review.id, Review.listing, Review.listingId, Review.organization, Review.platform, Review.rating (+4 more)

### Community 103 - "Advertising schema"
Cohesion: 0.20
Nodes (11): Advertising, ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task (+3 more)

### Community 104 - "Channels schema"
Cohesion: 0.24
Nodes (11): Channels, CoupangRepresentativeKeywordOverride.createdAt, CoupangRepresentativeKeywordOverride.id, CoupangRepresentativeKeywordOverride.keyword, CoupangRepresentativeKeywordOverride.organization, CoupangRepresentativeKeywordOverride.organizationId, CoupangRepresentativeKeywordOverride.updatedAt, CoupangRepresentativeKeywordOverride.vendorItemId (+3 more)

### Community 105 - "System schema"
Cohesion: 0.20
Nodes (11): System, FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name (+3 more)

### Community 106 - "Sourcing schema"
Cohesion: 0.25
Nodes (11): SourcingWorkspaceSnapshot.businessDate, SourcingWorkspaceSnapshot.createdAt, SourcingWorkspaceSnapshot.id, SourcingWorkspaceSnapshot.organization, SourcingWorkspaceSnapshot.organizationId, SourcingWorkspaceSnapshot.payload, SourcingWorkspaceSnapshot.scope, SourcingWorkspaceSnapshot.updatedAt (+3 more)

### Community 107 - "System schema"
Cohesion: 0.27
Nodes (10): SystemSetting.createdAt, SystemSetting.id, SystemSetting.key, SystemSetting.organization, SystemSetting.organizationId, SystemSetting.updatedAt, SystemSetting.value, SystemSetting (+2 more)

### Community 108 - "Core schema"
Cohesion: 0.25
Nodes (9): Organization.createdAt, Organization.id, Organization.isActive, Organization.name, Organization.slug, Organization.updatedAt, Review.organizationId, Organization (+1 more)

### Community 109 - "prisma field: SourcingCandidate.id"
Cohesion: 0.25
Nodes (8): SourcingCandidate.id, SourcingCandidate.organizationId, SourcingCandidate.provenanceMasterProductId, SourcingCandidate.sourceUrl, sourcing_candidates, SourcingCandidate unique(id, organizationId), SourcingCandidate unique(organizationId, sourceUrl), SourcingCandidate unique(provenanceMasterProductId, organizationId)

### Community 110 - "prisma field: ChannelListingDailySnapshot.businessDate"
Cohesion: 0.50
Nodes (4): ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.listingId, ChannelListingDailySnapshot.organizationId, ChannelListingDailySnapshot unique(organizationId, listingId, businessDate)

## Knowledge Gaps
- **1496 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+1491 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Advertising schema` to `Channels schema`, `Sourcing schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Channels schema`, `Channels schema`, `AI schema`, `Core schema`, `Finance schema`, `Channels schema`, `AI schema`, `AgentOS schema`, `AI schema`, `AI schema`, `System schema`, `Channels schema`, `Advertising schema`, `Orders schema`, `Core schema`, `System schema`, `Channels schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `AI schema`, `Channels schema`, `Orders schema`, `AgentOS schema`, `Sourcing schema`, `Channels schema`, `AI schema`, `Channels schema`, `AgentOS schema`, `System schema`, `Sourcing schema`, `Sourcing schema`, `System schema`, `Orders schema`, `Finance schema`, `Sourcing schema`, `AI schema`, `AI schema`, `AgentOS schema`, `Inventory schema`, `Sourcing schema`, `AgentOS schema`, `AI schema`, `AI schema`, `Orders schema`, `AI schema`, `AI schema`, `Sourcing schema`, `Core schema`, `Channels schema`, `Orders schema`, `AI schema`, `Orders schema`, `Core schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `Inventory schema`, `Supply schema`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `Core schema`, `AgentOS schema`, `Inventory schema`, `Core schema`, `Channels schema`, `AI schema`, `Orders schema`, `Inventory schema`, `Finance schema`, `Inventory schema`, `Supply schema`, `AI schema`, `Advertising schema`, `Core schema`, `Inventory schema`, `Channels schema`, `System schema`, `Advertising schema`, `Finance schema`, `AI schema`, `Supply schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `AI schema`, `Orders schema`, `Core schema`, `Channels schema`, `System schema`, `System schema`, `Orders schema`, `Advertising schema`, `Channels schema`, `System schema`, `Sourcing schema`, `System schema`, `Core schema`, `prisma field: SourcingCandidate.id`, `prisma field: ChannelListingDailySnapshot.businessDate`?**
  _High betweenness centrality (0.505) - this node is a cross-community bridge._
- **Why does `Organization` connect `Core schema` to `Channels schema`, `Sourcing schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Channels schema`, `Channels schema`, `AI schema`, `Core schema`, `Finance schema`, `Channels schema`, `AI schema`, `AgentOS schema`, `AI schema`, `AI schema`, `System schema`, `Channels schema`, `Advertising schema`, `Orders schema`, `Core schema`, `System schema`, `Channels schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `AI schema`, `Channels schema`, `Orders schema`, `AgentOS schema`, `Sourcing schema`, `Channels schema`, `AI schema`, `Channels schema`, `AgentOS schema`, `System schema`, `Sourcing schema`, `Sourcing schema`, `Orders schema`, `Finance schema`, `Sourcing schema`, `AI schema`, `AI schema`, `AgentOS schema`, `Inventory schema`, `Sourcing schema`, `Advertising schema`, `AgentOS schema`, `AI schema`, `AI schema`, `Orders schema`, `AI schema`, `AI schema`, `Sourcing schema`, `Core schema`, `Channels schema`, `Orders schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `Inventory schema`, `Supply schema`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `Core schema`, `AgentOS schema`, `Inventory schema`, `Core schema`, `Channels schema`, `AI schema`, `Orders schema`, `Inventory schema`, `Finance schema`, `Inventory schema`, `Supply schema`, `AI schema`, `Core schema`, `Inventory schema`, `Channels schema`, `Advertising schema`, `Finance schema`, `AI schema`, `Supply schema`, `Channels schema`, `Channels schema`, `AI schema`, `Orders schema`, `Core schema`, `Channels schema`, `System schema`, `Orders schema`, `Channels schema`, `Sourcing schema`, `System schema`, `prisma field: SourcingCandidate.id`, `prisma field: ChannelListingDailySnapshot.businessDate`?**
  _High betweenness centrality (0.356) - this node is a cross-community bridge._
- **Why does `AgentRunRequest` connect `AgentOS schema` to `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `Advertising schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `AgentOS schema`, `AgentOS schema`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **What connects `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason` to the rest of the system?**
  _1496 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Channels schema` be split into smaller, more focused modules?**
  _Cohesion score 0.038461538461538464 - nodes in this community are weakly interconnected._
- **Should `Sourcing schema` be split into smaller, more focused modules?**
  _Cohesion score 0.05230496453900709 - nodes in this community are weakly interconnected._
- **Should `AgentOS schema` be split into smaller, more focused modules?**
  _Cohesion score 0.04734299516908213 - nodes in this community are weakly interconnected._