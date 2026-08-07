# Graph Report - schema  (2026-08-04)

## Corpus Check
- 13 files · ~32,564 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3460 nodes · 5558 edges · 151 communities (150 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Channels schema
- Sourcing schema
- Channels schema
- AgentOS schema
- Core schema
- Sourcing schema
- AgentOS schema
- AI schema
- Advertising schema
- Supply schema
- AI schema
- Channels schema
- Orders schema
- Channels schema
- System schema
- Sourcing schema
- Sourcing schema
- Sourcing schema
- Sourcing schema
- Supply schema
- Supply schema
- Core schema
- AI schema
- Sourcing schema
- Supply schema
- Channels schema
- AgentOS schema
- Core schema
- Inventory schema
- Core schema
- AgentOS schema
- Channels schema
- Orders schema
- AI schema
- AI schema
- Channels schema
- Channels schema
- Sourcing schema
- Channels schema
- AI schema
- Inventory schema
- Advertising schema
- AgentOS schema
- Channels schema
- Core schema
- Supply schema
- AgentOS schema
- AgentOS schema
- System schema
- AI schema
- Channels schema
- AI schema
- Orders schema
- AgentOS schema
- AI schema
- Orders schema
- System schema
- Sourcing schema
- Channels schema
- Channels schema
- Orders schema
- Inventory schema
- Sourcing schema
- AgentOS schema
- AI schema
- System schema
- Sourcing schema
- System schema
- Core schema
- Finance schema
- Sourcing schema
- AI schema
- System schema
- AgentOS schema
- Inventory schema
- Sourcing schema
- AI schema
- AgentOS schema
- Core schema
- AI schema
- AI schema
- Supply schema
- Channels schema
- Core schema
- AI schema
- AI schema
- Sourcing schema
- Sourcing schema
- System schema
- Supply schema
- Channels schema
- Inventory schema
- AI schema
- Orders schema
- AgentOS schema
- AgentOS schema
- AgentOS schema
- AgentOS schema
- Orders schema
- Inventory schema
- Orders schema
- AgentOS schema
- Advertising schema
- Supply schema
- Finance schema
- AI schema
- Core schema
- Orders schema
- Inventory schema
- Finance schema
- Supply schema
- Orders schema
- Inventory schema
- Supply schema
- AI schema
- Sourcing schema
- Core schema
- Inventory schema
- Channels schema
- Inventory schema
- Supply schema
- System schema
- Finance schema
- Finance schema
- AI schema
- Inventory schema
- Channels schema
- Core schema
- Supply schema
- Channels schema
- Sourcing schema
- AI schema
- Orders schema
- Core schema
- Core schema
- Channels schema
- Core schema
- Sourcing schema
- Inventory schema
- System schema
- Orders schema
- Sourcing schema
- Channels schema
- System schema
- System schema
- Core schema
- prisma field: ActionTask.date
- prisma field: ChannelListingDailySnapshot.businessDate
- prisma field: Alert.operationKey
- prisma field: RocketPoCatalogLine.poLineId
- prisma field: ChannelListingDailySnapshot.id

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 411 edges
2. `Organization` - 300 edges
3. `prisma — Shared Schema` - 188 edges
4. `User` - 104 edges
5. `ChannelListing` - 88 edges
6. `AgentRunRequest` - 74 edges
7. `AgentRun` - 68 edges
8. `ChannelListingDailySnapshot` - 67 edges
9. `ProductPreparation` - 66 edges
10. `SourceImportRun` - 66 edges
11. `SourcingLaunchCandidate` - 66 edges
12. `ContentWorkspace` - 60 edges

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
- `Database ERD` --mentions_field--> `ChannelScrapeSnapshot.externalOptionId`  [EXTRACTED]
  docs/ERD.md → prisma/models/channels.prisma

## Import Cycles
- None detected.

## Communities (151 total, 1 thin omitted)

### Community 0 - "Channels schema"
Cohesion: 0.04
Nodes (56): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adCoverageStatus, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d (+48 more)

### Community 1 - "Sourcing schema"
Cohesion: 0.05
Nodes (51): SourcingLaunchCandidate.blockingRiskCodes, SourcingLaunchCandidate.bundleSnapshot, SourcingLaunchCandidate.candidateSeriesKey, SourcingLaunchCandidate.complianceAssessmentVersionKey, SourcingLaunchCandidate.complianceSnapshot, SourcingLaunchCandidate.complianceStatus, SourcingLaunchCandidate.createdAt, SourcingLaunchCandidate.createdByUser (+43 more)

### Community 2 - "Channels schema"
Cohesion: 0.05
Nodes (50): ChannelScrapeChunk.checksum, ChannelScrapeChunk.createdAt, ChannelScrapeChunk.id, ChannelScrapeChunk.itemCount, ChannelScrapeChunk.kind, ChannelScrapeChunk.organization, ChannelScrapeChunk.organizationId, ChannelScrapeChunk.payload (+42 more)

### Community 3 - "AgentOS schema"
Cohesion: 0.05
Nodes (46): AgentRunRequest.agentInstance, AgentRunRequest.agentInstanceId, AgentRunRequest.attempts, AgentRunRequest.claimedAt, AgentRunRequest.claimedBy, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.coalescedIntoRequestId, AgentRunRequest.conversation (+38 more)

### Community 4 - "Core schema"
Cohesion: 0.05
Nodes (45): MasterProductAbcEvaluation.adjustedScore, MasterProductAbcEvaluation.advertisingCoverageEndDate, MasterProductAbcEvaluation.advertisingCoverageStartDate, MasterProductAbcEvaluation.advertisingSourceCapturedAt, MasterProductAbcEvaluation.advertisingSourceStatus, MasterProductAbcEvaluation.calculatedAt, MasterProductAbcEvaluation.calculationStatus, MasterProductAbcEvaluation.costComponentsJson (+37 more)

### Community 5 - "Sourcing schema"
Cohesion: 0.06
Nodes (44): SourcingSourceEntitlementVersion.accountCoverage, SourcingSourceEntitlementVersion.allowedMethod, SourcingSourceEntitlementVersion.categoryCoverage, SourcingSourceEntitlementVersion.coverageDefinition, SourcingSourceEntitlementVersion.createdAt, SourcingSourceEntitlementVersion.credentialRef, SourcingSourceEntitlementVersion.decisionImpact, SourcingSourceEntitlementVersion.denominatorDefinition (+36 more)

### Community 6 - "AgentOS schema"
Cohesion: 0.05
Nodes (43): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+35 more)

### Community 7 - "AI schema"
Cohesion: 0.06
Nodes (43): ProductPreparation.approvedAt, ProductPreparation.approvedByUser, ProductPreparation.approvedByUserId, ProductPreparation.channelAccount, ProductPreparation.channelAccountId, ProductPreparation.channelListing, ProductPreparation.channelListingId, ProductPreparation.createdAt (+35 more)

### Community 8 - "Advertising schema"
Cohesion: 0.06
Nodes (42): Advertising, ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task (+34 more)

### Community 9 - "Supply schema"
Cohesion: 0.05
Nodes (41): SourcingLaunchCandidate.supplierOfferSkuSnapshotId, SupplierOfferSkuSnapshot.capturedAt, SupplierOfferSkuSnapshot.createdAt, SupplierOfferSkuSnapshot.currency, SupplierOfferSkuSnapshot.dispatchLeadTimeDaysMax, SupplierOfferSkuSnapshot.dispatchLeadTimeDaysMin, SupplierOfferSkuSnapshot.domesticFreightCny, SupplierOfferSkuSnapshot.evidenceObservation (+33 more)

### Community 10 - "AI schema"
Cohesion: 0.06
Nodes (41): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+33 more)

### Community 11 - "Channels schema"
Cohesion: 0.06
Nodes (40): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignIdentity, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel (+32 more)

### Community 12 - "Orders schema"
Cohesion: 0.06
Nodes (40): CoupangDirectPoSnapshot.centerName, CoupangDirectPoSnapshot.channelAccountId, CoupangDirectPoSnapshot.collectedAt, CoupangDirectPoSnapshot.createdAt, CoupangDirectPoSnapshot.deliveryDate, CoupangDirectPoSnapshot.id, CoupangDirectPoSnapshot.isUrgent, CoupangDirectPoSnapshot.itemsJson (+32 more)

### Community 13 - "Channels schema"
Cohesion: 0.06
Nodes (38): CoupangWingTrackedProduct.brandName, CoupangWingTrackedProduct.categoryHierarchy, CoupangWingTrackedProduct.createdAt, CoupangWingTrackedProduct.enabled, CoupangWingTrackedProduct.id, CoupangWingTrackedProduct.imagePath, CoupangWingTrackedProduct.itemId, CoupangWingTrackedProduct.lastCapturedAt (+30 more)

### Community 14 - "System schema"
Cohesion: 0.06
Nodes (38): OperationRun.attempts, OperationRun.attemptToken, OperationRun.claimedAt, OperationRun.claimedBy, OperationRun.createdAt, OperationRun.definitionVersion, OperationRun.engineType, OperationRun.errorCode (+30 more)

### Community 15 - "Sourcing schema"
Cohesion: 0.06
Nodes (38): SourcingEvidenceObservation.availableAt, SourcingEvidenceObservation.businessDate, SourcingEvidenceObservation.conceptKey, SourcingEvidenceObservation.createdAt, SourcingEvidenceObservation.decisionImpact, SourcingEvidenceObservation.eventAt, SourcingEvidenceObservation.evidenceClass, SourcingEvidenceObservation.evidenceFamily (+30 more)

### Community 16 - "Sourcing schema"
Cohesion: 0.07
Nodes (36): ProductRegistrationExecution.channelAccount, ProductRegistrationExecution.channelAccountId, ProductRegistrationExecution.channelListing, ProductRegistrationExecution.channelListingId, ProductRegistrationExecution.completedAt, ProductRegistrationExecution.createdAt, ProductRegistrationExecution.executionKind, ProductRegistrationExecution.expectedProviderAccountId (+28 more)

### Community 17 - "Sourcing schema"
Cohesion: 0.06
Nodes (36): SourcingDecisionBatchItem.baselineDecision, SourcingDecisionBatchItem.capitalAtRiskKrw, SourcingDecisionBatchItem.confidenceKind, SourcingDecisionBatchItem.createdAt, SourcingDecisionBatchItem.decision, SourcingDecisionBatchItem.decisionBatch, SourcingDecisionBatchItem.decisionBatchId, SourcingDecisionBatchItem.decisionConfidence (+28 more)

### Community 18 - "Sourcing schema"
Cohesion: 0.06
Nodes (36): SourcingEvidenceIngestionRun.acceptedCount, SourcingEvidenceIngestionRun.collectorKey, SourcingEvidenceIngestionRun.collectorVersion, SourcingEvidenceIngestionRun.completedAt, SourcingEvidenceIngestionRun.coverageDenominator, SourcingEvidenceIngestionRun.coverageNumerator, SourcingEvidenceIngestionRun.createdAt, SourcingEvidenceIngestionRun.discoveredCount (+28 more)

### Community 19 - "Supply schema"
Cohesion: 0.07
Nodes (35): ProcurementTestIntent.createdAt, ProcurementTestIntent.currency, ProcurementTestIntent.decisionBatchItem, ProcurementTestIntent.decisionBatchItemId, ProcurementTestIntent.expectedGoodsTotalCny, ProcurementTestIntent.expiresAt, ProcurementTestIntent.id, ProcurementTestIntent.idempotencyKey (+27 more)

### Community 20 - "Supply schema"
Cohesion: 0.07
Nodes (35): RocketPurchaseConfirmationAllocation.confirmationLine, RocketPurchaseConfirmationAllocation.confirmationLineId, RocketPurchaseConfirmationAllocation.createdAt, RocketPurchaseConfirmationAllocation.id, RocketPurchaseConfirmationAllocation.organization, RocketPurchaseConfirmationAllocation.organizationId, RocketPurchaseConfirmationAllocation.quantity, RocketPurchaseConfirmationAllocation.sellpiaInventorySku (+27 more)

### Community 21 - "Core schema"
Cohesion: 0.09
Nodes (34): SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.coverageEndDate, SourceImportRun.coverageStartDate, SourceImportRun.createdAt, SourceImportRun.createdBy, SourceImportRun.errorCode (+26 more)

### Community 22 - "AI schema"
Cohesion: 0.09
Nodes (33): ContentGeneration.contentWorkspaceId, ContentWorkspace.channelListing, ContentWorkspace.channelListingId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.createdByUserId, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageRevision (+25 more)

### Community 23 - "Sourcing schema"
Cohesion: 0.07
Nodes (33): ContentGeneration.sourceCandidateId, SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.id, SourcingCandidate.imageUrl (+25 more)

### Community 24 - "Supply schema"
Cohesion: 0.07
Nodes (32): RocketPurchaseConfirmation.artifactBytes, RocketPurchaseConfirmation.artifactContentType, RocketPurchaseConfirmation.artifactFileName, RocketPurchaseConfirmation.artifactSha256, RocketPurchaseConfirmation.artifactStoredAt, RocketPurchaseConfirmation.channelAccount, RocketPurchaseConfirmation.completedAt, RocketPurchaseConfirmation.confirmedAt (+24 more)

### Community 25 - "Channels schema"
Cohesion: 0.08
Nodes (32): SellpiaManualMatchAlias.aliasTitle, SellpiaManualMatchAlias.createdAt, SellpiaManualMatchAlias.evidenceCount, SellpiaManualMatchAlias.id, SellpiaManualMatchAlias.itemCount, SellpiaManualMatchAlias.matchedType, SellpiaManualMatchAlias.normalizedAlias, SellpiaManualMatchAlias.organization (+24 more)

### Community 26 - "AgentOS schema"
Cohesion: 0.08
Nodes (31): AgentOS, AgentAuthorizationEvent.toolId, AgentInstanceToolPolicy.agentInstance, AgentInstanceToolPolicy.agentInstanceId, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentInstanceToolPolicy.dryRunMode (+23 more)

### Community 27 - "Core schema"
Cohesion: 0.09
Nodes (31): ChannelListing.brand, ChannelListing.category, ChannelListing.channelAccount, ChannelListing.channelAccountId, ChannelListing.channelName, ChannelListing.createdAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo (+23 more)

### Community 28 - "Inventory schema"
Cohesion: 0.07
Nodes (31): SellpiaInventoryState.activeGeneration, SellpiaInventoryState.activeSyncLeaseExpiresAt, SellpiaInventoryState.activeSyncOwner, SellpiaInventoryState.activeSyncOwnerUserId, SellpiaInventoryState.activeSyncScope, SellpiaInventoryState.activeSyncStartedAt, SellpiaInventoryState.activeSyncToken, SellpiaInventoryState.createdAt (+23 more)

### Community 29 - "Core schema"
Cohesion: 0.08
Nodes (30): externalOptionId canonical option identity, vendorItemId provider term, ChannelAdTargetDailySnapshot.listingOptionId, ChannelListingOption.attributesJson, ChannelListingOption.barcode, ChannelListingOption.commissionRate, ChannelListingOption.costPriceOverride, ChannelListingOption.createdAt (+22 more)

### Community 30 - "AgentOS schema"
Cohesion: 0.08
Nodes (30): AgentToolInvocation.agentInstance, AgentToolInvocation.agentInstanceId, AgentToolInvocation.approvalRequest, AgentToolInvocation.approvalRequestId, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt (+22 more)

### Community 31 - "Channels schema"
Cohesion: 0.08
Nodes (30): ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.externalId, ChannelListingOptionDailySnapshot.externalOptionId, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isActive (+22 more)

### Community 32 - "Orders schema"
Cohesion: 0.08
Nodes (30): Order.channelAccount, Order.channelAccountId, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id (+22 more)

### Community 33 - "AI schema"
Cohesion: 0.07
Nodes (30): ProductPreparation.selectedThumbnailGenerationId, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.contentWorkspaceId, ThumbnailGeneration.createdAt, ThumbnailGeneration.deletedAt, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.errorMessage (+22 more)

### Community 34 - "AI schema"
Cohesion: 0.08
Nodes (29): ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.editedHtmlSavedAt, ContentGeneration.errorMessage (+21 more)

### Community 35 - "Channels schema"
Cohesion: 0.08
Nodes (29): CoupangWingSalesRankDailySnapshot.businessDate, CoupangWingSalesRankDailySnapshot.capturedAt, CoupangWingSalesRankDailySnapshot.categoryHierarchy, CoupangWingSalesRankDailySnapshot.collectedCount, CoupangWingSalesRankDailySnapshot.conversionRate28d, CoupangWingSalesRankDailySnapshot.createdAt, CoupangWingSalesRankDailySnapshot.id, CoupangWingSalesRankDailySnapshot.itemId (+21 more)

### Community 36 - "Channels schema"
Cohesion: 0.07
Nodes (29): RocketPoCatalogLine.barcode, RocketPoCatalogLine.businessDateBasis, RocketPoCatalogLine.center, RocketPoCatalogLine.createdAt, RocketPoCatalogLine.hasConfirmation, RocketPoCatalogLine.id, RocketPoCatalogLine.inboundType, RocketPoCatalogLine.orderQty (+21 more)

### Community 37 - "Sourcing schema"
Cohesion: 0.08
Nodes (29): SourcingDecisionBatch.businessDate, SourcingDecisionBatch.capitalBudgetKrw, SourcingDecisionBatch.category, SourcingDecisionBatch.constraintSetHash, SourcingDecisionBatch.createdAt, SourcingDecisionBatch.decisionAt, SourcingDecisionBatch.decisionMode, SourcingDecisionBatch.evidenceCutoffAt (+21 more)

### Community 38 - "Channels schema"
Cohesion: 0.08
Nodes (28): ChannelListingDeletionOperation.authorizationExpiresAt, ChannelListingDeletionOperation.channelAccount, ChannelListingDeletionOperation.channelListing, ChannelListingDeletionOperation.channelListingId, ChannelListingDeletionOperation.completedAt, ChannelListingDeletionOperation.createdAt, ChannelListingDeletionOperation.expectedProviderAccountId, ChannelListingDeletionOperation.externalListingId (+20 more)

### Community 39 - "AI schema"
Cohesion: 0.07
Nodes (28): DetailPageImageRenderIntent.attempt, DetailPageImageRenderIntent.claimedAt, DetailPageImageRenderIntent.claimedBy, DetailPageImageRenderIntent.claimedByUserId, DetailPageImageRenderIntent.completedArtifact, DetailPageImageRenderIntent.completedAt, DetailPageImageRenderIntent.createdAt, DetailPageImageRenderIntent.detailPageArtifact (+20 more)

### Community 40 - "Inventory schema"
Cohesion: 0.09
Nodes (28): InventoryCommitment.businessKey, InventoryCommitment.createdAt, InventoryCommitment.createdBy, InventoryCommitment.creator, InventoryCommitment.id, InventoryCommitment.inventoryGeneration, InventoryCommitment.kind, InventoryCommitment.organization (+20 more)

### Community 41 - "Advertising schema"
Cohesion: 0.08
Nodes (27): AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+19 more)

### Community 42 - "AgentOS schema"
Cohesion: 0.08
Nodes (27): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.agentInstanceId, AgentApprovalRequest.approver, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy, AgentApprovalRequest.decisionReason (+19 more)

### Community 43 - "Channels schema"
Cohesion: 0.08
Nodes (27): ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelListingOptionDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.externalId, ChannelScrapeSnapshot.externalOptionId (+19 more)

### Community 44 - "Core schema"
Cohesion: 0.09
Nodes (27): ChannelListing.masterProductId, MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.adTier, MasterProduct.brand, MasterProduct.category, MasterProduct.code, MasterProduct.createdAt (+19 more)

### Community 45 - "Supply schema"
Cohesion: 0.08
Nodes (27): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+19 more)

### Community 46 - "AgentOS schema"
Cohesion: 0.08
Nodes (26): AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.agentInstanceId, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy, AgentAuthorizationEvent.decidedByUserId (+18 more)

### Community 47 - "AgentOS schema"
Cohesion: 0.09
Nodes (26): AgentInstance.adapterConfig, AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.icon, AgentInstance.id, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name (+18 more)

### Community 48 - "System schema"
Cohesion: 0.08
Nodes (26): Alert.actionTask, Alert.actorUser, Alert.actorUserId, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead (+18 more)

### Community 49 - "AI schema"
Cohesion: 0.09
Nodes (26): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height (+18 more)

### Community 50 - "Channels schema"
Cohesion: 0.09
Nodes (26): SellpiaProductMonthlySales.barcode, SellpiaProductMonthlySales.buyPrice, SellpiaProductMonthlySales.capturedAt, SellpiaProductMonthlySales.costBasis, SellpiaProductMonthlySales.coverageEndDate, SellpiaProductMonthlySales.coverageStartDate, SellpiaProductMonthlySales.createdAt, SellpiaProductMonthlySales.id (+18 more)

### Community 51 - "AI schema"
Cohesion: 0.09
Nodes (25): ContentGeneration.detailPageArtifactId, ContentWorkspace.currentDetailPageArtifactId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.contentWorkspaceId, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.createdByUserId, DetailPageArtifact.currentRevision (+17 more)

### Community 52 - "Orders schema"
Cohesion: 0.10
Nodes (25): OrderReturn.channelAccount, OrderReturn.channelAccountId, OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.id (+17 more)

### Community 53 - "AgentOS schema"
Cohesion: 0.09
Nodes (24): AgentArtifact.agentInstance, AgentArtifact.agentInstanceId, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization (+16 more)

### Community 54 - "AI schema"
Cohesion: 0.11
Nodes (24): DetailPageImageArtifact.byteLength, DetailPageImageArtifact.contentType, DetailPageImageArtifact.createdAt, DetailPageImageArtifact.createdBy, DetailPageImageArtifact.createdByUserId, DetailPageImageArtifact.id, DetailPageImageArtifact.imageUrl, DetailPageImageArtifact.objectKey (+16 more)

### Community 55 - "Orders schema"
Cohesion: 0.10
Nodes (24): Review.content, Review.createdAt, Review.externalOptionId, Review.externalProductId, Review.externalReviewId, Review.id, Review.imageCount, Review.isBlinded (+16 more)

### Community 56 - "System schema"
Cohesion: 0.09
Nodes (23): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.detail, ActionTask.href, ActionTask.id (+15 more)

### Community 57 - "Sourcing schema"
Cohesion: 0.09
Nodes (23): CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id, CandidateImage.isDeleted (+15 more)

### Community 58 - "Channels schema"
Cohesion: 0.11
Nodes (23): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.channelAccount, ChannelAccountDailyKpiSnapshot.channelAccountId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+15 more)

### Community 59 - "Channels schema"
Cohesion: 0.11
Nodes (23): CoupangKeywordRankDailySnapshot.adRank, CoupangKeywordRankDailySnapshot.businessDate, CoupangKeywordRankDailySnapshot.capturedAt, CoupangKeywordRankDailySnapshot.createdAt, CoupangKeywordRankDailySnapshot.id, CoupangKeywordRankDailySnapshot.itemId, CoupangKeywordRankDailySnapshot.keyword, CoupangKeywordRankDailySnapshot.organicRank (+15 more)

### Community 60 - "Orders schema"
Cohesion: 0.11
Nodes (23): OrderLineItem.createdAt, OrderLineItem.externalBarcode, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.listingOptionId, OrderLineItem.metadata, OrderLineItem.optionName (+15 more)

### Community 61 - "Inventory schema"
Cohesion: 0.11
Nodes (23): SellpiaInventorySku.barcode, SellpiaInventorySku.code, SellpiaInventorySku.createdAt, SellpiaInventorySku.currentStock, SellpiaInventorySku.id, SellpiaInventorySku.isActive, SellpiaInventorySku.lastImportRun, SellpiaInventorySku.lastImportRunId (+15 more)

### Community 62 - "Sourcing schema"
Cohesion: 0.11
Nodes (23): TiktokCreativeTrendDailySnapshot.businessDate, TiktokCreativeTrendDailySnapshot.capturedAt, TiktokCreativeTrendDailySnapshot.createdAt, TiktokCreativeTrendDailySnapshot.entityKey, TiktokCreativeTrendDailySnapshot.growthPct, TiktokCreativeTrendDailySnapshot.id, TiktokCreativeTrendDailySnapshot.industry, TiktokCreativeTrendDailySnapshot.label (+15 more)

### Community 63 - "AgentOS schema"
Cohesion: 0.10
Nodes (22): AgentCostEvent.agentInstance, AgentCostEvent.agentInstanceId, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id (+14 more)

### Community 64 - "AI schema"
Cohesion: 0.11
Nodes (22): AiDirectJob.attempts, AiDirectJob.claimedAt, AiDirectJob.claimedBy, AiDirectJob.createdAt, AiDirectJob.finishedAt, AiDirectJob.id, AiDirectJob.jobType, AiDirectJob.lastErrorCode (+14 more)

### Community 65 - "System schema"
Cohesion: 0.10
Nodes (22): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+14 more)

### Community 66 - "Sourcing schema"
Cohesion: 0.11
Nodes (22): LiveCommerceBroadcastDailySnapshot.broadcasterId, LiveCommerceBroadcastDailySnapshot.broadcasterName, LiveCommerceBroadcastDailySnapshot.broadcastId, LiveCommerceBroadcastDailySnapshot.businessDate, LiveCommerceBroadcastDailySnapshot.capturedAt, LiveCommerceBroadcastDailySnapshot.coverImageUrl, LiveCommerceBroadcastDailySnapshot.createdAt, LiveCommerceBroadcastDailySnapshot.endedAt (+14 more)

### Community 67 - "System schema"
Cohesion: 0.10
Nodes (22): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon, Marketplace.id (+14 more)

### Community 68 - "Core schema"
Cohesion: 0.13
Nodes (22): MasterProductAbcEvaluation.formulaVersionId, MasterProductAbcFormulaVersion.calculationCodeChecksum, MasterProductAbcFormulaVersion.calibrationMetricsJson, MasterProductAbcFormulaVersion.createdAt, MasterProductAbcFormulaVersion.firstActivatedAt, MasterProductAbcFormulaVersion.foldCount, MasterProductAbcFormulaVersion.formulaChecksum, MasterProductAbcFormulaVersion.formulaJson (+14 more)

### Community 69 - "Finance schema"
Cohesion: 0.11
Nodes (22): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.listingId, ProfitLoss.month (+14 more)

### Community 70 - "Sourcing schema"
Cohesion: 0.11
Nodes (22): ShortsTrendDailySnapshot.businessDate, ShortsTrendDailySnapshot.capturedAt, ShortsTrendDailySnapshot.channelName, ShortsTrendDailySnapshot.commentCount, ShortsTrendDailySnapshot.createdAt, ShortsTrendDailySnapshot.id, ShortsTrendDailySnapshot.keyword, ShortsTrendDailySnapshot.likeCount (+14 more)

### Community 71 - "AI schema"
Cohesion: 0.10
Nodes (22): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.contentWorkspace, ThumbnailAnalysis.contentWorkspaceId, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id (+14 more)

### Community 72 - "System schema"
Cohesion: 0.11
Nodes (21): ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization, ActivityEvent.organizationId (+13 more)

### Community 73 - "AgentOS schema"
Cohesion: 0.12
Nodes (21): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.agentInstanceId, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError (+13 more)

### Community 74 - "Inventory schema"
Cohesion: 0.11
Nodes (21): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.notes, ReturnTransfer.optionName, ReturnTransfer.orderId (+13 more)

### Community 75 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): Sourcing1688HotProductDailySnapshot.businessDate, Sourcing1688HotProductDailySnapshot.capturedAt, Sourcing1688HotProductDailySnapshot.createdAt, Sourcing1688HotProductDailySnapshot.id, Sourcing1688HotProductDailySnapshot.imageUrl, Sourcing1688HotProductDailySnapshot.monthlySales, Sourcing1688HotProductDailySnapshot.offerId, Sourcing1688HotProductDailySnapshot.organization (+13 more)

### Community 76 - "AI schema"
Cohesion: 0.10
Nodes (21): ThumbnailGenerationInputImage.candidateImage, ThumbnailGenerationInputImage.createdAt, ThumbnailGenerationInputImage.fileSize, ThumbnailGenerationInputImage.generation, ThumbnailGenerationInputImage.generationId, ThumbnailGenerationInputImage.height, ThumbnailGenerationInputImage.id, ThumbnailGenerationInputImage.label (+13 more)

### Community 77 - "AgentOS schema"
Cohesion: 0.11
Nodes (20): AgentRuntimeState.agentInstance, AgentRuntimeState.agentInstanceId, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.id, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun (+12 more)

### Community 78 - "Core schema"
Cohesion: 0.13
Nodes (20): ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id, ChannelAccount.isPrimary, ChannelAccount.name, ChannelAccount.organization (+12 more)

### Community 79 - "AI schema"
Cohesion: 0.12
Nodes (20): ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.currentRevisionId, DetailPageImageRenderIntent.revisionId, DetailPageRevision.artifact, DetailPageRevision.assetUrlMap, DetailPageRevision.contentGeneration, DetailPageRevision.contentGenerationId, DetailPageRevision.createdAt (+12 more)

### Community 80 - "AI schema"
Cohesion: 0.12
Nodes (20): ProductPreparation.selectedThumbnailGenerationCandidateId, ThumbnailGenerationCandidate.createdAt, ThumbnailGenerationCandidate.filename, ThumbnailGenerationCandidate.fileSize, ThumbnailGenerationCandidate.generation, ThumbnailGenerationCandidate.generationId, ThumbnailGenerationCandidate.height, ThumbnailGenerationCandidate.id (+12 more)

### Community 81 - "Supply schema"
Cohesion: 0.12
Nodes (20): PurchaseOrderSubmissionAttempt.createdAt, PurchaseOrderSubmissionAttempt.errorCode, PurchaseOrderSubmissionAttempt.errorMessage, PurchaseOrderSubmissionAttempt.freshnessGeneration, PurchaseOrderSubmissionAttempt.id, PurchaseOrderSubmissionAttempt.idempotencyKey, PurchaseOrderSubmissionAttempt.organization, PurchaseOrderSubmissionAttempt.organizationId (+12 more)

### Community 82 - "Channels schema"
Cohesion: 0.14
Nodes (20): RocketPoCatalogLine.organizationId, RocketPoCatalogSnapshot.channelAccount, RocketPoCatalogSnapshot.channelAccountId, RocketPoCatalogSnapshot.collectionRunId, RocketPoCatalogSnapshot.createdAt, RocketPoCatalogSnapshot.detailPoCount, RocketPoCatalogSnapshot.id, RocketPoCatalogSnapshot.listPagesRead (+12 more)

### Community 83 - "Core schema"
Cohesion: 0.11
Nodes (19): AgentApprovalRequest.approverUserId, AgentApprovalRequest.decidedByUserId, AgentApprovalRequest.requestedByUserId, SourceImportRun.manualFreshExportConfirmedBy, User.agentInstance, User.avatarUrl, User.createdAt, User.email (+11 more)

### Community 84 - "AI schema"
Cohesion: 0.12
Nodes (19): ContentAsset.originGenerationGroupId, ContentGeneration.generationGroupId, ContentGenerationGroup.baseContentGeneration, ContentGenerationGroup.baseContentGenerationId, ContentGenerationGroup.contentWorkspace, ContentGenerationGroup.contentWorkspaceId, ContentGenerationGroup.createdAt, ContentGenerationGroup.createdByUserId (+11 more)

### Community 85 - "AI schema"
Cohesion: 0.11
Nodes (19): ContentGenerationSource.contentAsset, ContentGenerationSource.contentAssetId, ContentGenerationSource.contentGeneration, ContentGenerationSource.contentGenerationId, ContentGenerationSource.createdAt, ContentGenerationSource.id, ContentGenerationSource.label, ContentGenerationSource.metadata (+11 more)

### Community 86 - "Sourcing schema"
Cohesion: 0.14
Nodes (19): LiveCommerceProductDailySnapshot.broadcastId, LiveCommerceProductDailySnapshot.businessDate, LiveCommerceProductDailySnapshot.capturedAt, LiveCommerceProductDailySnapshot.createdAt, LiveCommerceProductDailySnapshot.id, LiveCommerceProductDailySnapshot.imageUrl, LiveCommerceProductDailySnapshot.organization, LiveCommerceProductDailySnapshot.organizationId (+11 more)

### Community 87 - "Sourcing schema"
Cohesion: 0.13
Nodes (19): NaverKeywordDailySnapshot.averageAdRank, NaverKeywordDailySnapshot.businessDate, NaverKeywordDailySnapshot.capturedAt, NaverKeywordDailySnapshot.competitionIndex, NaverKeywordDailySnapshot.createdAt, NaverKeywordDailySnapshot.id, NaverKeywordDailySnapshot.keyword, NaverKeywordDailySnapshot.monthlyMobileSearchCount (+11 more)

### Community 88 - "System schema"
Cohesion: 0.12
Nodes (19): OperationRun.scheduleId, OperationSchedule.createdAt, OperationSchedule.createdBy, OperationSchedule.createdByUserId, OperationSchedule.cronExpression, OperationSchedule.enabled, OperationSchedule.id, OperationSchedule.input (+11 more)

### Community 89 - "Supply schema"
Cohesion: 0.12
Nodes (19): PurchaseOrder.supplierId, Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.id, Supplier.leadTimeDays, Supplier.name (+11 more)

### Community 90 - "Channels schema"
Cohesion: 0.12
Nodes (19): RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt, RocketPurchaseOrder.firstSkuName, RocketPurchaseOrder.id, RocketPurchaseOrder.items, RocketPurchaseOrder.orderAmount, RocketPurchaseOrder.orderedAt (+11 more)

### Community 91 - "Inventory schema"
Cohesion: 0.13
Nodes (19): Shipment.warehouseId, StockTransfer.organizationId, StockTransfer.toWarehouseId, Warehouse.address, Warehouse.code, Warehouse.createdAt, Warehouse.id, Warehouse.isDefault (+11 more)

### Community 92 - "AI schema"
Cohesion: 0.11
Nodes (19): ThumbnailGenerationEvent.actor, ThumbnailGenerationEvent.actorUserId, ThumbnailGenerationEvent.attemptNumber, ThumbnailGenerationEvent.createdAt, ThumbnailGenerationEvent.errorMessage, ThumbnailGenerationEvent.eventType, ThumbnailGenerationEvent.fromPhase, ThumbnailGenerationEvent.fromStatus (+11 more)

### Community 93 - "Orders schema"
Cohesion: 0.11
Nodes (19): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.externalSku, UnshippedItem.id, UnshippedItem.isNotified, UnshippedItem.notifiedAt, UnshippedItem.optionName, UnshippedItem.order (+11 more)

### Community 94 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+10 more)

### Community 95 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentMessage.agentInstance, AgentMessage.agentInstanceId, AgentMessage.content, AgentMessage.conversation, AgentMessage.conversationId, AgentMessage.createdAt, AgentMessage.id, AgentMessage.metadata (+10 more)

### Community 96 - "AgentOS schema"
Cohesion: 0.13
Nodes (18): AgentRunEvent.agentInstance, AgentRunEvent.agentInstanceId, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message (+10 more)

### Community 97 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.organizationId, WorkflowRun.startedAt (+10 more)

### Community 98 - "Orders schema"
Cohesion: 0.12
Nodes (18): CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing (+10 more)

### Community 99 - "Inventory schema"
Cohesion: 0.14
Nodes (18): PickingItem.organizationId, PickingItem.pickingListId, PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.id, PickingList.listNumber, PickingList.organization (+10 more)

### Community 100 - "Orders schema"
Cohesion: 0.13
Nodes (18): Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.id, Shipment.order, Shipment.orderId (+10 more)

### Community 101 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): WorkflowTemplate.createdAt, WorkflowTemplate.description, WorkflowTemplate.edgesJson, WorkflowTemplate.id, WorkflowTemplate.isActive, WorkflowTemplate.marketplace, WorkflowTemplate.marketplaceId, WorkflowTemplate.module (+10 more)

### Community 102 - "Advertising schema"
Cohesion: 0.14
Nodes (17): Database ERD, AdAction.listingId, ChannelAdTargetDailySnapshot.externalId, ChannelAdTargetDailySnapshot.externalOptionId, ChannelAdTargetDailySnapshot.listingId, ChannelListing.isActive, ScrapeTarget.category, ScrapeTarget.createdAt (+9 more)

### Community 103 - "Supply schema"
Cohesion: 0.13
Nodes (17): prisma — Shared Schema, Supply, PurchaseOrderItem.createdAt, PurchaseOrderItem.id, PurchaseOrderItem.order, PurchaseOrderItem.orderId, PurchaseOrderItem.organization, PurchaseOrderItem.organizationId (+9 more)

### Community 104 - "Finance schema"
Cohesion: 0.14
Nodes (17): Finance, SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.organization (+9 more)

### Community 105 - "AI schema"
Cohesion: 0.14
Nodes (17): ContentWorkspaceThumbnailSelection.contentAsset, ContentWorkspaceThumbnailSelection.contentAssetId, ContentWorkspaceThumbnailSelection.contentWorkspace, ContentWorkspaceThumbnailSelection.contentWorkspaceId, ContentWorkspaceThumbnailSelection.createdAt, ContentWorkspaceThumbnailSelection.createdByUser, ContentWorkspaceThumbnailSelection.createdByUserId, ContentWorkspaceThumbnailSelection.id (+9 more)

### Community 106 - "Core schema"
Cohesion: 0.12
Nodes (17): MasterProductAbcGradeHistory.adjustedScore, MasterProductAbcGradeHistory.calculatedAt, MasterProductAbcGradeHistory.calculationStatus, MasterProductAbcGradeHistory.formulaVersion, MasterProductAbcGradeHistory.formulaVersionId, MasterProductAbcGradeHistory.id, MasterProductAbcGradeHistory.masterProduct, MasterProductAbcGradeHistory.masterProductId (+9 more)

### Community 107 - "Orders schema"
Cohesion: 0.12
Nodes (17): OrderReturnLineItem.createdAt, OrderReturnLineItem.externalSku, OrderReturnLineItem.id, OrderReturnLineItem.listingOption, OrderReturnLineItem.listingOptionId, OrderReturnLineItem.metadata, OrderReturnLineItem.optionName, OrderReturnLineItem.orderLineItem (+9 more)

### Community 108 - "Inventory schema"
Cohesion: 0.12
Nodes (17): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.orderId, PickingItem.organization, PickingItem.pickedAt (+9 more)

### Community 109 - "Finance schema"
Cohesion: 0.12
Nodes (17): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.id, ProcessingCost.master, ProcessingCost.masterId, ProcessingCost.notes, ProcessingCost.organization, ProcessingCost.organizationId (+9 more)

### Community 110 - "Supply schema"
Cohesion: 0.15
Nodes (17): RocketPurchaseConfirmationTransmission.confirmation, RocketPurchaseConfirmationTransmission.confirmationId, RocketPurchaseConfirmationTransmission.createdAt, RocketPurchaseConfirmationTransmission.id, RocketPurchaseConfirmationTransmission.intentKey, RocketPurchaseConfirmationTransmission.matchedLineCount, RocketPurchaseConfirmationTransmission.observedAt, RocketPurchaseConfirmationTransmission.organization (+9 more)

### Community 111 - "Orders schema"
Cohesion: 0.15
Nodes (17): SellpiaOrderTransmissionIntent.abortedAt, SellpiaOrderTransmissionIntent.createdAt, SellpiaOrderTransmissionIntent.createdBy, SellpiaOrderTransmissionIntent.creator, SellpiaOrderTransmissionIntent.finalizedAt, SellpiaOrderTransmissionIntent.finalizedGeneration, SellpiaOrderTransmissionIntent.id, SellpiaOrderTransmissionIntent.intentKey (+9 more)

### Community 112 - "Inventory schema"
Cohesion: 0.12
Nodes (17): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.fromWarehouseId, StockTransfer.id, StockTransfer.notes, StockTransfer.optionName, StockTransfer.organization (+9 more)

### Community 113 - "Supply schema"
Cohesion: 0.12
Nodes (17): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.dueDate, SupplierPayment.id, SupplierPayment.notes, SupplierPayment.organization, SupplierPayment.paidAmount, SupplierPayment.paidDate (+9 more)

### Community 114 - "AI schema"
Cohesion: 0.12
Nodes (17): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.listingId (+9 more)

### Community 115 - "Sourcing schema"
Cohesion: 0.17
Nodes (16): NaverPopularKeywordDailySnapshot.boardKey, NaverPopularKeywordDailySnapshot.boardLabel, NaverPopularKeywordDailySnapshot.businessDate, NaverPopularKeywordDailySnapshot.capturedAt, NaverPopularKeywordDailySnapshot.cid, NaverPopularKeywordDailySnapshot.createdAt, NaverPopularKeywordDailySnapshot.id, NaverPopularKeywordDailySnapshot.keyword (+8 more)

### Community 116 - "Core schema"
Cohesion: 0.15
Nodes (16): OrganizationMembership.createdAt, OrganizationMembership.id, OrganizationMembership.invitedBy, OrganizationMembership.invitedById, OrganizationMembership.joinedAt, OrganizationMembership.lastSelectedAt, OrganizationMembership.organization, OrganizationMembership.organizationId (+8 more)

### Community 117 - "Inventory schema"
Cohesion: 0.13
Nodes (16): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.organizationId, SellpiaReceiptUploadBatch.sourceRef (+8 more)

### Community 118 - "Channels schema"
Cohesion: 0.16
Nodes (16): SellpiaSalesDailySnapshot.businessDate, SellpiaSalesDailySnapshot.capturedAt, SellpiaSalesDailySnapshot.channelGroup, SellpiaSalesDailySnapshot.costKrw, SellpiaSalesDailySnapshot.createdAt, SellpiaSalesDailySnapshot.id, SellpiaSalesDailySnapshot.organization, SellpiaSalesDailySnapshot.organizationId (+8 more)

### Community 119 - "Inventory schema"
Cohesion: 0.15
Nodes (16): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items, StockAudit.matchedCount (+8 more)

### Community 120 - "Supply schema"
Cohesion: 0.16
Nodes (16): SupplierProduct.createdAt, SupplierProduct.id, SupplierProduct.isPrimary, SupplierProduct.memo, SupplierProduct.minOrderQty, SupplierProduct.organization, SupplierProduct.sellpiaInventorySku, SupplierProduct.sellpiaInventorySkuId (+8 more)

### Community 121 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 122 - "Finance schema"
Cohesion: 0.14
Nodes (15): GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.listing, GradeHistory.listingId, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization (+7 more)

### Community 123 - "Finance schema"
Cohesion: 0.14
Nodes (15): ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description, ManualLedger.id (+7 more)

### Community 124 - "AI schema"
Cohesion: 0.14
Nodes (15): ThumbnailRegistrationAttempt.createdAt, ThumbnailRegistrationAttempt.errorMessage, ThumbnailRegistrationAttempt.externalId, ThumbnailRegistrationAttempt.finishedAt, ThumbnailRegistrationAttempt.generation, ThumbnailRegistrationAttempt.generationId, ThumbnailRegistrationAttempt.id, ThumbnailRegistrationAttempt.organization (+7 more)

### Community 125 - "Inventory schema"
Cohesion: 0.18
Nodes (14): Inventory, InventoryCommitmentAllocation.commitment, InventoryCommitmentAllocation.commitmentId, InventoryCommitmentAllocation.createdAt, InventoryCommitmentAllocation.id, InventoryCommitmentAllocation.organization, InventoryCommitmentAllocation.organizationId, InventoryCommitmentAllocation.quantity (+6 more)

### Community 126 - "Channels schema"
Cohesion: 0.19
Nodes (14): CoupangKeywordSerpDailySnapshot.businessDate, CoupangKeywordSerpDailySnapshot.capturedAt, CoupangKeywordSerpDailySnapshot.createdAt, CoupangKeywordSerpDailySnapshot.id, CoupangKeywordSerpDailySnapshot.itemCount, CoupangKeywordSerpDailySnapshot.items, CoupangKeywordSerpDailySnapshot.keyword, CoupangKeywordSerpDailySnapshot.organization (+6 more)

### Community 127 - "Core schema"
Cohesion: 0.15
Nodes (14): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+6 more)

### Community 128 - "Supply schema"
Cohesion: 0.20
Nodes (14): ProcurementTestIntent.selectedPriceTierId, SupplierOfferPriceTier.createdAt, SupplierOfferPriceTier.id, SupplierOfferPriceTier.maxQuantity, SupplierOfferPriceTier.minQuantity, SupplierOfferPriceTier.organization, SupplierOfferPriceTier.organizationId, SupplierOfferPriceTier.supplierOfferSkuSnapshot (+6 more)

### Community 129 - "Channels schema"
Cohesion: 0.18
Nodes (14): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.organizationId, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson (+6 more)

### Community 130 - "Sourcing schema"
Cohesion: 0.21
Nodes (14): SourcingDecisionEvidence.createdAt, SourcingDecisionEvidence.decisionBatchItem, SourcingDecisionEvidence.decisionBatchItemId, SourcingDecisionEvidence.evidenceObservation, SourcingDecisionEvidence.evidenceObservationId, SourcingDecisionEvidence.id, SourcingDecisionEvidence.ordinal, SourcingDecisionEvidence.organization (+6 more)

### Community 131 - "AI schema"
Cohesion: 0.19
Nodes (13): AI, ContentGenerationAssetUsage.contentAsset, ContentGenerationAssetUsage.contentAssetId, ContentGenerationAssetUsage.contentGeneration, ContentGenerationAssetUsage.contentGenerationId, ContentGenerationAssetUsage.createdAt, ContentGenerationAssetUsage.id, ContentGenerationAssetUsage.organization (+5 more)

### Community 132 - "Orders schema"
Cohesion: 0.19
Nodes (13): Orders, ShipmentItem.createdAt, ShipmentItem.id, ShipmentItem.orderLineItem, ShipmentItem.orderLineItemId, ShipmentItem.organization, ShipmentItem.organizationId, ShipmentItem.quantity (+5 more)

### Community 133 - "Core schema"
Cohesion: 0.19
Nodes (13): CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.isActive, CategoryMapping.keywords, CategoryMapping.organization (+5 more)

### Community 134 - "Core schema"
Cohesion: 0.19
Nodes (13): ChannelListingOptionInventoryComponent.channelListingOption, ChannelListingOptionInventoryComponent.channelListingOptionId, ChannelListingOptionInventoryComponent.createdAt, ChannelListingOptionInventoryComponent.id, ChannelListingOptionInventoryComponent.organization, ChannelListingOptionInventoryComponent.organizationId, ChannelListingOptionInventoryComponent.quantity, ChannelListingOptionInventoryComponent.sellpiaInventorySku (+5 more)

### Community 135 - "Channels schema"
Cohesion: 0.19
Nodes (13): CoupangKeywordTracker.createdAt, CoupangKeywordTracker.enabled, CoupangKeywordTracker.id, CoupangKeywordTracker.keyword, CoupangKeywordTracker.lastCapturedAt, CoupangKeywordTracker.maxPages, CoupangKeywordTracker.organization, CoupangKeywordTracker.organizationId (+5 more)

### Community 136 - "Core schema"
Cohesion: 0.21
Nodes (12): Core, MasterProductAbcFormulaState.activatedAt, MasterProductAbcFormulaState.activeFormulaVersion, MasterProductAbcFormulaState.activeFormulaVersionId, MasterProductAbcFormulaState.createdAt, MasterProductAbcFormulaState.organization, MasterProductAbcFormulaState.organizationId, MasterProductAbcFormulaState.revision (+4 more)

### Community 137 - "Sourcing schema"
Cohesion: 0.23
Nodes (12): Sourcing, SourcingWorkspaceSnapshot.businessDate, SourcingWorkspaceSnapshot.createdAt, SourcingWorkspaceSnapshot.id, SourcingWorkspaceSnapshot.organization, SourcingWorkspaceSnapshot.organizationId, SourcingWorkspaceSnapshot.payload, SourcingWorkspaceSnapshot.scope (+4 more)

### Community 138 - "Inventory schema"
Cohesion: 0.21
Nodes (12): CoupangShipmentDateSummary.boxes, CoupangShipmentDateSummary.capturedAt, CoupangShipmentDateSummary.count, CoupangShipmentDateSummary.createdAt, CoupangShipmentDateSummary.id, CoupangShipmentDateSummary.organization, CoupangShipmentDateSummary.organizationId, CoupangShipmentDateSummary.shipmentDate (+4 more)

### Community 139 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 140 - "Orders schema"
Cohesion: 0.18
Nodes (12): SellpiaOrderTransmissionIntentReconciliation.id, SellpiaOrderTransmissionIntentReconciliation.intent, SellpiaOrderTransmissionIntentReconciliation.intentId, SellpiaOrderTransmissionIntentReconciliation.note, SellpiaOrderTransmissionIntentReconciliation.organization, SellpiaOrderTransmissionIntentReconciliation.organizationId, SellpiaOrderTransmissionIntentReconciliation.outcome, SellpiaOrderTransmissionIntentReconciliation.reconciledAt (+4 more)

### Community 141 - "Sourcing schema"
Cohesion: 0.21
Nodes (12): TrendSeedKeyword.createdAt, TrendSeedKeyword.enabled, TrendSeedKeyword.id, TrendSeedKeyword.keyword, TrendSeedKeyword.keywordCn, TrendSeedKeyword.organization, TrendSeedKeyword.organizationId, TrendSeedKeyword.sources (+4 more)

### Community 142 - "Channels schema"
Cohesion: 0.24
Nodes (11): Channels, CoupangRepresentativeKeywordOverride.createdAt, CoupangRepresentativeKeywordOverride.id, CoupangRepresentativeKeywordOverride.keyword, CoupangRepresentativeKeywordOverride.organization, CoupangRepresentativeKeywordOverride.organizationId, CoupangRepresentativeKeywordOverride.updatedAt, CoupangRepresentativeKeywordOverride.vendorItemId (+3 more)

### Community 143 - "System schema"
Cohesion: 0.24
Nodes (11): System, SystemSetting.createdAt, SystemSetting.id, SystemSetting.key, SystemSetting.organization, SystemSetting.organizationId, SystemSetting.updatedAt, SystemSetting.value (+3 more)

### Community 144 - "System schema"
Cohesion: 0.22
Nodes (10): FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name, FeatureGate.updatedAt (+2 more)

### Community 145 - "Core schema"
Cohesion: 0.25
Nodes (9): AuthSession.createdAt, AuthSession.expiresAt, AuthSession.id, AuthSession.revokedAt, AuthSession.tokenHash, AuthSession.user, AuthSession.userId, AuthSession (+1 more)

### Community 146 - "prisma field: ActionTask.date"
Cohesion: 0.50
Nodes (4): ActionTask.date, ActionTask.organizationId, ActionTask.taskKey, ActionTask unique(organizationId, taskKey, date)

### Community 147 - "prisma field: ChannelListingDailySnapshot.businessDate"
Cohesion: 0.50
Nodes (4): ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.listingId, ChannelListingDailySnapshot.organizationId, ChannelListingDailySnapshot unique(organizationId, listingId, businessDate)

### Community 148 - "prisma field: Alert.operationKey"
Cohesion: 0.67
Nodes (3): Alert.operationKey, Alert.organizationId, Alert unique(organizationId, operationKey)

### Community 149 - "prisma field: RocketPoCatalogLine.poLineId"
Cohesion: 0.67
Nodes (3): RocketPoCatalogLine.poLineId, RocketPoCatalogLine.snapshotId, RocketPoCatalogLine unique(snapshotId, poLineId)

## Knowledge Gaps
- **2203 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+2198 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Advertising schema` to `Channels schema`, `Sourcing schema`, `Channels schema`, `AgentOS schema`, `Core schema`, `Sourcing schema`, `AgentOS schema`, `AI schema`, `Advertising schema`, `Supply schema`, `AI schema`, `Channels schema`, `Orders schema`, `Channels schema`, `System schema`, `Sourcing schema`, `Sourcing schema`, `Sourcing schema`, `Sourcing schema`, `Supply schema`, `Supply schema`, `Core schema`, `AI schema`, `Sourcing schema`, `Supply schema`, `Channels schema`, `AgentOS schema`, `Core schema`, `Inventory schema`, `Core schema`, `AgentOS schema`, `Channels schema`, `Orders schema`, `AI schema`, `AI schema`, `Channels schema`, `Channels schema`, `Sourcing schema`, `Channels schema`, `AI schema`, `Inventory schema`, `Advertising schema`, `AgentOS schema`, `Channels schema`, `Core schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `System schema`, `AI schema`, `Channels schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `AI schema`, `Orders schema`, `System schema`, `Sourcing schema`, `Channels schema`, `Channels schema`, `Orders schema`, `Inventory schema`, `Sourcing schema`, `AgentOS schema`, `AI schema`, `System schema`, `Sourcing schema`, `System schema`, `Core schema`, `Finance schema`, `Sourcing schema`, `AI schema`, `System schema`, `AgentOS schema`, `Inventory schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `Core schema`, `AI schema`, `AI schema`, `Supply schema`, `Channels schema`, `Core schema`, `AI schema`, `AI schema`, `Sourcing schema`, `Sourcing schema`, `System schema`, `Supply schema`, `Channels schema`, `Inventory schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `Inventory schema`, `Orders schema`, `AgentOS schema`, `Supply schema`, `Finance schema`, `AI schema`, `Core schema`, `Orders schema`, `Inventory schema`, `Finance schema`, `Supply schema`, `Orders schema`, `Inventory schema`, `Supply schema`, `AI schema`, `Sourcing schema`, `Core schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Supply schema`, `System schema`, `Finance schema`, `Finance schema`, `AI schema`, `Inventory schema`, `Channels schema`, `Core schema`, `Supply schema`, `Channels schema`, `Sourcing schema`, `AI schema`, `Orders schema`, `Core schema`, `Core schema`, `Channels schema`, `Core schema`, `Sourcing schema`, `Inventory schema`, `System schema`, `Orders schema`, `Sourcing schema`, `Channels schema`, `System schema`, `System schema`, `Core schema`, `prisma field: ActionTask.date`, `prisma field: ChannelListingDailySnapshot.businessDate`, `prisma field: Alert.operationKey`?**
  _High betweenness centrality (0.485) - this node is a cross-community bridge._
- **Why does `Organization` connect `System schema` to `Channels schema`, `Sourcing schema`, `Channels schema`, `AgentOS schema`, `Core schema`, `Sourcing schema`, `AgentOS schema`, `AI schema`, `Advertising schema`, `Supply schema`, `AI schema`, `Channels schema`, `Orders schema`, `Channels schema`, `System schema`, `Sourcing schema`, `Sourcing schema`, `Sourcing schema`, `Sourcing schema`, `Supply schema`, `Supply schema`, `Core schema`, `AI schema`, `Sourcing schema`, `Supply schema`, `Channels schema`, `AgentOS schema`, `Core schema`, `Inventory schema`, `Core schema`, `AgentOS schema`, `Channels schema`, `Orders schema`, `AI schema`, `AI schema`, `Channels schema`, `Channels schema`, `Sourcing schema`, `Channels schema`, `AI schema`, `Inventory schema`, `Advertising schema`, `AgentOS schema`, `Channels schema`, `Core schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `System schema`, `AI schema`, `Channels schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `AI schema`, `Orders schema`, `System schema`, `Sourcing schema`, `Channels schema`, `Channels schema`, `Orders schema`, `Inventory schema`, `Sourcing schema`, `AgentOS schema`, `AI schema`, `System schema`, `Sourcing schema`, `Core schema`, `Finance schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `Inventory schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `Core schema`, `AI schema`, `AI schema`, `Supply schema`, `Channels schema`, `AI schema`, `AI schema`, `Sourcing schema`, `Sourcing schema`, `System schema`, `Supply schema`, `Channels schema`, `Inventory schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `Inventory schema`, `Orders schema`, `AgentOS schema`, `Advertising schema`, `Supply schema`, `Finance schema`, `AI schema`, `Core schema`, `Orders schema`, `Inventory schema`, `Finance schema`, `Supply schema`, `Orders schema`, `Inventory schema`, `Supply schema`, `AI schema`, `Sourcing schema`, `Core schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Supply schema`, `Finance schema`, `Finance schema`, `AI schema`, `Inventory schema`, `Channels schema`, `Core schema`, `Supply schema`, `Channels schema`, `Sourcing schema`, `AI schema`, `Orders schema`, `Core schema`, `Core schema`, `Channels schema`, `Core schema`, `Sourcing schema`, `Inventory schema`, `Orders schema`, `Sourcing schema`, `Channels schema`, `System schema`, `prisma field: ActionTask.date`, `prisma field: ChannelListingDailySnapshot.businessDate`, `prisma field: Alert.operationKey`?**
  _High betweenness centrality (0.383) - this node is a cross-community bridge._
- **Why does `User` connect `Core schema` to `Sourcing schema`, `AgentOS schema`, `Sourcing schema`, `AI schema`, `Core schema`, `Orders schema`, `System schema`, `Sourcing schema`, `Core schema`, `Sourcing schema`, `Supply schema`, `Core schema`, `AI schema`, `Sourcing schema`, `Supply schema`, `Inventory schema`, `AI schema`, `AI schema`, `Sourcing schema`, `Channels schema`, `AI schema`, `Inventory schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `System schema`, `AI schema`, `AI schema`, `AI schema`, `System schema`, `AI schema`, `Supply schema`, `System schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `Advertising schema`, `Supply schema`, `AI schema`, `Orders schema`, `Core schema`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **What connects `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason` to the rest of the system?**
  _2203 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Channels schema` be split into smaller, more focused modules?**
  _Cohesion score 0.03571428571428571 - nodes in this community are weakly interconnected._
- **Should `Sourcing schema` be split into smaller, more focused modules?**
  _Cohesion score 0.047058823529411764 - nodes in this community are weakly interconnected._
- **Should `Channels schema` be split into smaller, more focused modules?**
  _Cohesion score 0.05061224489795919 - nodes in this community are weakly interconnected._