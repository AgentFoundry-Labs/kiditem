# Graph Report - schema-consumers  (2026-07-12)

## Corpus Check
- 275 files · ~122,060 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4452 nodes · 19596 edges · 216 communities (203 shown, 13 thin omitted)
- Extraction: 40% EXTRACTED · 60% INFERRED · 0% AMBIGUOUS · INFERRED: 11728 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Inventory schema
- Community 1
- Community 2
- prisma field: Database ERD
- Community 4
- prisma field: AdAction.externalId
- Community 6
- Community 7
- prisma field: ChannelReconciliationItem.legacyCode
- Community 9
- Orders schema
- Channels schema
- Core schema
- Orders schema
- Core schema
- Community 15
- Community 16
- Supply schema
- Community 18
- AgentOS schema
- Community 20
- AgentOS schema
- AI schema
- Supply schema
- Community 24
- AI schema
- AI schema
- Core schema
- AI schema
- AI schema
- Core schema
- AI schema
- Channels schema
- Community 33
- Sourcing schema
- AgentOS schema
- Channels schema
- Sourcing schema
- Inventory schema
- Community 39
- Inventory schema
- Inventory schema
- AgentOS schema
- AgentOS schema
- AgentOS schema
- Core schema
- Community 46
- Inventory schema
- System schema
- AI schema
- AI schema
- Community 51
- Channels schema
- Channels schema
- Inventory schema
- Inventory schema
- Community 56
- AgentOS schema
- System schema
- Community 59
- System schema
- AgentOS schema
- Channels schema
- Community 63
- Community 64
- Community 65
- Advertising schema
- Community 67
- Community 68
- AgentOS schema
- System schema
- Core schema
- Channels schema
- Orders schema
- Community 74
- Community 75
- AgentOS schema
- AgentOS schema
- Channels schema
- Core schema
- Finance schema
- AI schema
- AI schema
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Core schema
- AgentOS schema
- AI schema
- Inventory schema
- Channels schema
- AI schema
- Community 98
- Community 99
- Community 100
- Community 101
- Community 102
- Community 103
- prisma field: ActionTask.targetId
- AgentOS schema
- Core schema
- AgentOS schema
- Advertising schema
- Inventory schema
- AgentOS schema
- Community 111
- Community 112
- Community 113
- Channels schema
- Community 115
- Community 116
- Orders schema
- System schema
- Finance schema
- Finance schema
- Inventory schema
- Inventory schema
- Inventory schema
- Orders schema
- Channels schema
- Finance schema
- Advertising schema
- Finance schema
- Community 129
- Community 130
- Community 131
- Community 132
- Core schema
- Community 134
- Community 135
- System schema
- Orders schema
- Community 138
- System schema
- Core schema
- System schema
- Community 142
- Community 143
- Community 144
- Community 145
- Community 146
- Community 147
- Advertising schema
- System schema
- Advertising schema
- Community 151
- Community 152
- Community 153
- Community 154
- Community 155
- Community 156
- Community 157
- Community 158
- Community 159
- Community 160
- Community 161
- Community 162
- Community 163
- Community 164
- Community 165
- Community 166
- Community 167
- Community 168
- Community 169
- Community 170
- Community 171
- Community 172
- prisma field: InventorySku.id
- Community 174
- Community 175
- Community 176
- Community 177
- prisma field: Organization.id
- Community 179
- Community 180
- Community 181

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 343 edges
2. `Organization` - 318 edges
3. `prisma — Shared Schema` - 141 edges
4. `Order` - 119 edges
5. `ChannelListing` - 112 edges
6. `User` - 110 edges
7. `ContentWorkspace.organizationId` - 98 edges
8. `ChannelListingOption.organizationId` - 98 edges
9. `ProductPreparation.organizationId` - 97 edges
10. `ChannelSkuComponent.organizationId` - 97 edges
11. `SourceImportRun.organizationId` - 97 edges
12. `ProductOption.organizationId` - 97 edges

## Surprising Connections (you probably didn't know these)
- `toEvidenceRow()` --indirect_call--> `value()`  [INFERRED]
  apps/server/src/channels/adapter/out/repository/channel-sku-mapping.repository.adapter.ts → scripts/_shared/cli-args.ts
- `distinctTrimmed()` --indirect_call--> `value()`  [INFERRED]
  apps/server/src/channels/application/service/channel-sku-mapping.service.ts → scripts/_shared/cli-args.ts
- `Database ERD` --mentions_domain--> `Advertising`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_model--> `AdAction`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.organizationId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.listingId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.targetType`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma

## Import Cycles
- None detected.

## Communities (216 total, 13 thin omitted)

### Community 0 - "Inventory schema"
Cohesion: 0.16
Nodes (203): ConfirmedListingRegistrationInput, ConfirmedListingRegistrationOutput, ConfirmedListingRegistrationOutputSchema, CoupangListingSubmissionInput, CoupangListingSubmissionOutput, CoupangListingSubmissionOutputSchema, NonEmptyRecordSchema, ChannelCatalogImportController (+195 more)

### Community 1 - "Community 1"
Cohesion: 0.02
Nodes (101): AgentApprovalRequestSummary, AgentApprovalRequestSummarySchema, AgentApprovalStatus, AgentApprovalStatusSchema, AgentArtifactHandoffSummary, AgentArtifactHandoffSummarySchema, AgentArtifactStatus, AgentArtifactStatusSchema (+93 more)

### Community 2 - "Community 2"
Cohesion: 0.02
Nodes (79): AdjustStockInput, AdjustStockInputSchema, Inventory, InventoryAssetGradeSummary, InventoryAssetGradeSummarySchema, InventoryAssetItem, InventoryAssetItemSchema, InventoryAssetReport (+71 more)

### Community 3 - "prisma field: Database ERD"
Cohesion: 0.07
Nodes (65): Database ERD, AgentApprovalRequest.agentInstanceId, AgentArtifact.agentInstanceId, AgentAuthorizationEvent.agentInstanceId, AgentCostEvent.agentInstanceId, AgentInstanceToolPolicy.agentInstanceId, AgentMessage.agentInstanceId, AgentRun.agentInstanceId (+57 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (65): AdapterCommand, appendFlag(), appendOption(), archiveFileName(), archiveShaFileName(), Args, BundleManifest, BundlePackageIndex (+57 more)

### Community 5 - "prisma field: AdAction.externalId"
Cohesion: 0.18
Nodes (41): CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT, CHANNELS_CAPABILITIES, ChannelsCapabilityKey, fileHash(), importInput(), makeRow(), representativeRows(), AdAction.externalId (+33 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (28): DATA_MIGRATION_IDS, DATA_MIGRATION_RELEASES, dataMigrations, DataMigration, backfillSourcingCandidatesFromMasterProducts, isLegacyDetailEditorHref(), rewriteLegacyDetailEditorAlertHrefs, rewriteLegacyDetailEditorHref() (+20 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (59): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot, AdCampaignSnapshotSchema (+51 more)

### Community 8 - "prisma field: ChannelReconciliationItem.legacyCode"
Cohesion: 0.06
Nodes (58): ChannelReconciliationItem.legacyCode, MasterProduct.legacyCode, ComplianceScores, ComplianceScoresSchema, COUPANG_IMAGE_SYNC_ROW_SOURCES, CoupangImageSyncCapabilities, CoupangImageSyncCapabilitiesSchema, CoupangImageSyncRow (+50 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (54): appendProjectReferenceDefaults(), configuredDriveRoot(), apiHeaders(), apiUrl(), Args, assertSafeDatasetId(), buildCoupangImageSyncRowsForListings(), BundleManifest (+46 more)

### Community 10 - "Orders schema"
Cohesion: 0.04
Nodes (49): formatKstIso(), Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.listing (+41 more)

### Community 11 - "Channels schema"
Cohesion: 0.04
Nodes (55): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+47 more)

### Community 12 - "Core schema"
Cohesion: 0.08
Nodes (46): ListingForProductSync, externalOptionId canonical option identity, vendorItemId provider term, ChannelAdTargetDailySnapshot.externalOptionId, ChannelAdTargetDailySnapshot.listingOptionId, ChannelListingOption.channelAccount, ChannelListingOption.channelAccountId, ChannelListingOption.createdAt (+38 more)

### Community 13 - "Orders schema"
Cohesion: 0.04
Nodes (54): Orders, OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.metadata, OrderLineItem.option, OrderLineItem.optionName (+46 more)

### Community 14 - "Core schema"
Cohesion: 0.09
Nodes (42): channels — Marketplace Sync + SKU Matching, ChannelAdTargetDailySnapshot.optionId, ChannelListingOption.optionId, ChannelListingOptionDailySnapshot.optionId, ChannelScrapeSnapshot.optionId, Inventory.optionId, OrderLineItem.optionId, OrderReturnLineItem.optionId (+34 more)

### Community 15 - "Community 15"
Cohesion: 0.10
Nodes (48): assertNonProductionTarget(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged(), assertSha256(), BaselineManifest, BaselineManifestExpectation, baselineObjectKeys, buildChecksumsFile() (+40 more)

### Community 16 - "Community 16"
Cohesion: 0.08
Nodes (45): applyCacheControl(), ApplyResult, applyS3CacheControl(), applySupabaseCacheControl(), assertApplyAllowed(), buildCopyObjectInput(), CliArgs, CliConfig (+37 more)

### Community 17 - "Supply schema"
Cohesion: 0.05
Nodes (48): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.id, MasterSupplierProduct.isPrimary, MasterSupplierProduct.master, MasterSupplierProduct.memo, MasterSupplierProduct.minOrderQty, MasterSupplierProduct.supplier (+40 more)

### Community 18 - "Community 18"
Cohesion: 0.05
Nodes (43): PRODUCT_LIFECYCLE_STATES, ProductLifecycleState, ProductLifecycleStateSchema, BundleComponent, BundleComponentSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, Master (+35 more)

### Community 19 - "AgentOS schema"
Cohesion: 0.05
Nodes (44): AgentRunRequest.agentInstance, AgentRunRequest.attempts, AgentRunRequest.claimedAt, AgentRunRequest.claimedBy, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.coalescedIntoRequestId, AgentRunRequest.conversation, AgentRunRequest.createdAt (+36 more)

### Community 20 - "Community 20"
Cohesion: 0.05
Nodes (34): ChannelAccountListItem, ChannelAccountListItemSchema, CoupangAccountSettings, CoupangAccountSettingsSchema, UpdateCoupangAccountSettings, ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow (+26 more)

### Community 21 - "AgentOS schema"
Cohesion: 0.05
Nodes (42): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+34 more)

### Community 22 - "AI schema"
Cohesion: 0.05
Nodes (42): ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.editedHtmlSavedAt, ContentGeneration.errorMessage (+34 more)

### Community 23 - "Supply schema"
Cohesion: 0.05
Nodes (41): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+33 more)

### Community 24 - "Community 24"
Cohesion: 0.05
Nodes (39): AdMetricsDetail, AdMetricsDetailSchema, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary, DashboardAdSummarySchema (+31 more)

### Community 25 - "AI schema"
Cohesion: 0.06
Nodes (40): ContentGeneration.detailPageArtifactId, ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.createdByUserId, DetailPageArtifact.currentRevision, DetailPageArtifact.currentRevisionId (+32 more)

### Community 26 - "AI schema"
Cohesion: 0.06
Nodes (39): ProductPreparation.selectedThumbnailGenerationCandidateId, ThumbnailGenerationCandidate.createdAt, ThumbnailGenerationCandidate.filename, ThumbnailGenerationCandidate.fileSize, ThumbnailGenerationCandidate.generation, ThumbnailGenerationCandidate.generationId, ThumbnailGenerationCandidate.height, ThumbnailGenerationCandidate.id (+31 more)

### Community 27 - "Core schema"
Cohesion: 0.06
Nodes (35): ContentGeneration.triggeredByUserId, OrganizationMembership.createdAt, OrganizationMembership.id, OrganizationMembership.invitedBy, OrganizationMembership.invitedById, OrganizationMembership.joinedAt, OrganizationMembership.lastSelectedAt, OrganizationMembership.organization (+27 more)

### Community 28 - "AI schema"
Cohesion: 0.06
Nodes (38): ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.createdAt, ThumbnailGeneration.deletedAt, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.errorMessage, ThumbnailGeneration.grade, ThumbnailGeneration.id (+30 more)

### Community 29 - "AI schema"
Cohesion: 0.06
Nodes (38): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+30 more)

### Community 30 - "Core schema"
Cohesion: 0.06
Nodes (36): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.adTier, MasterProduct.brand, MasterProduct.category, MasterProduct.code, MasterProduct.costCny, MasterProduct.createdAt (+28 more)

### Community 31 - "AI schema"
Cohesion: 0.07
Nodes (35): AI, ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize (+27 more)

### Community 32 - "Channels schema"
Cohesion: 0.06
Nodes (35): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel, ChannelAdTargetDailySnapshot.clicks (+27 more)

### Community 33 - "Community 33"
Cohesion: 0.07
Nodes (31): DeliveryCompany, DeliveryCompanySchema, Order, OrderActionResponse, OrderActionResponseSchema, OrderLineItem, OrderLineItemSchema, OrderListItem (+23 more)

### Community 34 - "Sourcing schema"
Cohesion: 0.07
Nodes (32): Sourcing, CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id (+24 more)

### Community 35 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+25 more)

### Community 36 - "Channels schema"
Cohesion: 0.07
Nodes (33): ChannelReconciliationItem.channel, ChannelReconciliationItem.channelImageUrl, ChannelReconciliationItem.channelOptionName, ChannelReconciliationItem.channelProductName, ChannelReconciliationItem.channelStatus, ChannelReconciliationItem.channelUrl, ChannelReconciliationItem.confidence, ChannelReconciliationItem.conflictJson (+25 more)

### Community 37 - "Sourcing schema"
Cohesion: 0.07
Nodes (29): ContentGeneration.sourceCandidateId, SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.id, SourcingCandidate.imageUrl (+21 more)

### Community 38 - "Inventory schema"
Cohesion: 0.06
Nodes (33): SellpiaStockSnapshotItem.appliedTransactionId, SellpiaStockSnapshotItem.blockingReasons, SellpiaStockSnapshotItem.createdAt, SellpiaStockSnapshotItem.diff, SellpiaStockSnapshotItem.diffRate, SellpiaStockSnapshotItem.id, SellpiaStockSnapshotItem.inventory, SellpiaStockSnapshotItem.kiditemStockAtApply (+25 more)

### Community 39 - "Community 39"
Cohesion: 0.13
Nodes (31): MigrationResult, appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertMutatingTarget(), CliArgs, Command, COMMANDS, commandStatus() (+23 more)

### Community 40 - "Inventory schema"
Cohesion: 0.08
Nodes (31): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.fromWarehouseId, StockTransfer.id, StockTransfer.notes, StockTransfer.option, StockTransfer.optionName (+23 more)

### Community 41 - "Inventory schema"
Cohesion: 0.08
Nodes (29): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.option, PickingItem.pickedAt, PickingItem.pickingList (+21 more)

### Community 42 - "AgentOS schema"
Cohesion: 0.08
Nodes (28): AgentOS, AgentAuthorizationEvent.toolId, AgentInstanceToolPolicy.agentInstance, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentInstanceToolPolicy.dryRunMode, AgentInstanceToolPolicy.effect (+20 more)

### Community 43 - "AgentOS schema"
Cohesion: 0.07
Nodes (28): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.approver, AgentApprovalRequest.approverUserId, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy, AgentApprovalRequest.decidedByUserId (+20 more)

### Community 44 - "AgentOS schema"
Cohesion: 0.08
Nodes (28): AgentToolInvocation.agentInstance, AgentToolInvocation.approvalRequest, AgentToolInvocation.approvalRequestId, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt, AgentToolInvocation.errorCode (+20 more)

### Community 45 - "Core schema"
Cohesion: 0.08
Nodes (27): ChannelListing.brand, ChannelListing.category, ChannelListing.channel, ChannelListing.channelAccount, ChannelListing.channelAccountId, ChannelListing.channelName, ChannelListing.channelPrice, ChannelListing.createdAt (+19 more)

### Community 46 - "Community 46"
Cohesion: 0.14
Nodes (27): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+19 more)

### Community 47 - "Inventory schema"
Cohesion: 0.08
Nodes (22): CHANNELS_ROOT, REPO_ROOT, packages/shared — @kiditem/shared, Inventory, Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.id (+14 more)

### Community 48 - "System schema"
Cohesion: 0.08
Nodes (26): Alert.actionTask, Alert.actorUser, Alert.actorUserId, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead (+18 more)

### Community 49 - "AI schema"
Cohesion: 0.09
Nodes (27): ContentGeneration.contentWorkspaceId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.createdByUserId, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageArtifactId, ContentWorkspace.currentDetailPageRevision, ContentWorkspace.deletedAt (+19 more)

### Community 50 - "AI schema"
Cohesion: 0.08
Nodes (27): ProductPreparation.appliedToMasterAt, ProductPreparation.contentWorkspace, ProductPreparation.createdAt, ProductPreparation.createdByUser, ProductPreparation.deletedAt, ProductPreparation.displayName, ProductPreparation.id, ProductPreparation.isCurrentForMaster (+19 more)

### Community 51 - "Community 51"
Cohesion: 0.15
Nodes (25): cellText(), collectParentMetadataConflicts(), decodeWorksheetRange(), expandMergedParentCells(), findHeaderRow(), formattedCellText(), hasCellValue(), headersForRow() (+17 more)

### Community 52 - "Channels schema"
Cohesion: 0.08
Nodes (26): ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isOfferWinner, ChannelListingOptionDailySnapshot.lastObservedAt, ChannelListingOptionDailySnapshot.listing (+18 more)

### Community 53 - "Channels schema"
Cohesion: 0.08
Nodes (25): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.id, ChannelScrapeRun.matchedCount (+17 more)

### Community 54 - "Inventory schema"
Cohesion: 0.09
Nodes (25): RocketInventoryLedger.createdAt, RocketInventoryLedger.createdBy, RocketInventoryLedger.eventType, RocketInventoryLedger.id, RocketInventoryLedger.inventory, RocketInventoryLedger.inventoryId, RocketInventoryLedger.metaJson, RocketInventoryLedger.note (+17 more)

### Community 55 - "Inventory schema"
Cohesion: 0.08
Nodes (25): SellpiaNewProductCandidate.createdAt, SellpiaNewProductCandidate.createdInventory, SellpiaNewProductCandidate.id, SellpiaNewProductCandidate.initialReceiveTransactionId, SellpiaNewProductCandidate.modelName, SellpiaNewProductCandidate.note, SellpiaNewProductCandidate.operatorInitialStock, SellpiaNewProductCandidate.organization (+17 more)

### Community 56 - "Community 56"
Cohesion: 0.08
Nodes (22): StatisticsCategoryRow, StatisticsCategoryRowSchema, StatisticsDeliveryDaily, StatisticsDeliveryDailySchema, StatisticsDeliveryResponse, StatisticsDeliveryResponseSchema, StatisticsGradeRow, StatisticsGradeRowSchema (+14 more)

### Community 57 - "AgentOS schema"
Cohesion: 0.09
Nodes (24): AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy, AgentAuthorizationEvent.decidedByUserId, AgentAuthorizationEvent.decision (+16 more)

### Community 58 - "System schema"
Cohesion: 0.09
Nodes (22): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon, Marketplace.id (+14 more)

### Community 59 - "Community 59"
Cohesion: 0.20
Nodes (8): ChannelDashboardController, Controller, CurrentOrganization, Get, Query, CoupangDateRangeQueryDto, ChannelDashboardService, Injectable

### Community 60 - "System schema"
Cohesion: 0.10
Nodes (23): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.href (+15 more)

### Community 61 - "AgentOS schema"
Cohesion: 0.09
Nodes (23): AgentInstance.adapterConfig, AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.icon, AgentInstance.id, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name (+15 more)

### Community 62 - "Channels schema"
Cohesion: 0.09
Nodes (22): ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.id, ChannelScrapeSnapshot.listing, ChannelScrapeSnapshot.listingOption (+14 more)

### Community 63 - "Community 63"
Cohesion: 0.11
Nodes (13): ChannelRegistrationCapabilityAdapter, ConfirmedListingRegistrationInputSchema, CoupangListingSubmissionInputSchema, normalizeForHash(), stableHash(), Injectable, ChannelsMarketplaceRegistrationCapabilityPort, RegisterConfirmedMarketplaceListingCapabilityInput (+5 more)

### Community 64 - "Community 64"
Cohesion: 0.11
Nodes (12): ChannelListingRepositoryAdapter, parseQueryDate(), Injectable, ChannelListingGroupResult, ChannelListingListResult, ChannelListingQuery, ChannelListingRepositoryPort, ChannelListingSummary (+4 more)

### Community 65 - "Community 65"
Cohesion: 0.10
Nodes (7): CoupangProviderPort, ChannelSyncRepositoryPort, OrderSyncDeps, syncCoupangOrders(), ProductSyncDeps, Inject, Optional

### Community 66 - "Advertising schema"
Cohesion: 0.10
Nodes (22): AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+14 more)

### Community 67 - "Community 67"
Cohesion: 0.13
Nodes (15): ChannelListingController, Body, Controller, CurrentOrganization, Get, Param, Post, Query (+7 more)

### Community 68 - "Community 68"
Cohesion: 0.15
Nodes (10): CoupangSyncOrderPayload, CoupangSyncReturnPayload, SyncResult, syncSingleCoupangOrder(), syncSingleCoupangReturn(), ChannelSyncService, errorMessage(), resultMessage() (+2 more)

### Community 69 - "AgentOS schema"
Cohesion: 0.10
Nodes (21): AgentArtifact.agentInstance, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization, AgentArtifact.request (+13 more)

### Community 70 - "System schema"
Cohesion: 0.10
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+13 more)

### Community 71 - "Core schema"
Cohesion: 0.12
Nodes (21): ChannelListing.lastImportRunId, ChannelListingOption.lastImportRunId, InventorySku.lastImportRunId, SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.createdAt, SourceImportRun.createdBy (+13 more)

### Community 72 - "Channels schema"
Cohesion: 0.10
Nodes (21): ChannelReconciliationItem.lastSeenRunId, ChannelReconciliationRun.alreadyLinkedCount, ChannelReconciliationRun.autoLinkedCount, ChannelReconciliationRun.channel, ChannelReconciliationRun.conflictCount, ChannelReconciliationRun.createdAt, ChannelReconciliationRun.errorCount, ChannelReconciliationRun.errorJson (+13 more)

### Community 73 - "Orders schema"
Cohesion: 0.10
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 74 - "Community 74"
Cohesion: 0.10
Nodes (19): ChannelSkuMappingComponent, ChannelSkuMappingComponentSchema, ChannelSkuMappingCounts, ChannelSkuMappingCountsSchema, ChannelSkuMappingListItem, ChannelSkuMappingListItemSchema, ChannelSkuMappingListResponse, ChannelSkuMappingListResponseSchema (+11 more)

### Community 75 - "Community 75"
Cohesion: 0.17
Nodes (17): exactCodeEvidence(), CandidateMatch, compareMatches(), compareStrength(), compareText(), dedupeCandidates(), exactSellpiaCodeEvidence(), extractExplicitOptionCodeTokens() (+9 more)

### Community 76 - "AgentOS schema"
Cohesion: 0.11
Nodes (20): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id, AgentCostEvent.inputTokens (+12 more)

### Community 77 - "AgentOS schema"
Cohesion: 0.12
Nodes (20): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.agentInstanceId, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError (+12 more)

### Community 78 - "Channels schema"
Cohesion: 0.13
Nodes (20): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType, ChannelAccountDailyKpiSnapshot.lastObservedAt, ChannelAccountDailyKpiSnapshot.normalizedJson (+12 more)

### Community 79 - "Core schema"
Cohesion: 0.11
Nodes (20): MasterProductImage.createdAt, MasterProductImage.deletedAt, MasterProductImage.fileSize, MasterProductImage.height, MasterProductImage.id, MasterProductImage.isPrimary, MasterProductImage.label, MasterProductImage.master (+12 more)

### Community 80 - "Finance schema"
Cohesion: 0.12
Nodes (20): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit (+12 more)

### Community 81 - "AI schema"
Cohesion: 0.11
Nodes (18): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt (+10 more)

### Community 82 - "AI schema"
Cohesion: 0.11
Nodes (20): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id, ThumbnailAnalysis.imageSpec, ThumbnailAnalysis.imageUrl (+12 more)

### Community 83 - "Community 83"
Cohesion: 0.11
Nodes (17): PANEL_RUN_SOURCES, PanelRunSource, PanelRunSourceSchema, sourceKeys, PANEL_ITEM_KINDS, PanelAlertItem, PanelDismissEventSchema, PanelEvent (+9 more)

### Community 84 - "Community 84"
Cohesion: 0.10
Nodes (18): SupplierHistoryItem, SupplierHistoryItemSchema, SupplierHistoryReport, SupplierHistoryReportSchema, SupplierHistorySummary, SupplierHistorySummarySchema, SupplierProductSalesReport, SupplierProductSalesReportSchema (+10 more)

### Community 85 - "Community 85"
Cohesion: 0.12
Nodes (12): ChannelAccountController, Body, Controller, CurrentOrganization, Get, CoupangCredentials, HealthResult, ChannelAccountService (+4 more)

### Community 86 - "Community 86"
Cohesion: 0.11
Nodes (9): ChannelAccountListController, Controller, CurrentOrganization, Get, ChannelAccountRepositoryPort, ChannelAccountQueryService, Inject, Injectable (+1 more)

### Community 87 - "Community 87"
Cohesion: 0.18
Nodes (14): envelopeToJson(), maskAccessKey(), readCredentialsConfig(), stripLegacyCredentialKeys(), toJsonRecord(), toRecord(), trimToOptional(), CoupangCredentialCryptoError (+6 more)

### Community 88 - "Community 88"
Cohesion: 0.15
Nodes (12): asMappingStatus(), ChannelSkuMappingRepositoryAdapter, contains(), queueWhere(), toEvidenceRow(), toMappingRow(), Injectable, withStatus() (+4 more)

### Community 89 - "Community 89"
Cohesion: 0.12
Nodes (15): CoupangWingCatalogImportResponse, CoupangWingCatalogImportResponseSchema, ImportChanges, SellpiaInventoryImportResponse, SellpiaInventoryImportResponseSchema, SourceImportRun, SourceImportRunSchema, SourceImportStatus (+7 more)

### Community 90 - "Community 90"
Cohesion: 0.22
Nodes (17): analyzePrReleaseContract(), changedFilesFromGit(), classifyFiles(), compareSemver(), ghPrBody(), git(), hasReleaseDecision(), isDevelopToMainPromotion() (+9 more)

### Community 91 - "Community 91"
Cohesion: 0.11
Nodes (4): ChannelDashboardRepositoryAdapter, Injectable, ChannelDashboardRepositoryPort, Inject

### Community 92 - "Core schema"
Cohesion: 0.14
Nodes (18): Core, BundleComponent.bundleOption, BundleComponent.bundleOptionId, BundleComponent.componentOption, BundleComponent.componentOptionId, BundleComponent.createdAt, BundleComponent.id, BundleComponent.organization (+10 more)

### Community 93 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.id, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.lastRunId (+10 more)

### Community 94 - "AI schema"
Cohesion: 0.12
Nodes (18): ContentAsset.generationGroupId, ContentGeneration.generationGroupId, ContentGenerationGroup.baseContentGeneration, ContentGenerationGroup.baseContentGenerationId, ContentGenerationGroup.createdAt, ContentGenerationGroup.createdByUserId, ContentGenerationGroup.groupType, ContentGenerationGroup.id (+10 more)

### Community 95 - "Inventory schema"
Cohesion: 0.12
Nodes (18): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.notes, ReturnTransfer.option, ReturnTransfer.optionName (+10 more)

### Community 96 - "Channels schema"
Cohesion: 0.12
Nodes (18): RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt, RocketPurchaseOrder.firstSkuName, RocketPurchaseOrder.id, RocketPurchaseOrder.items, RocketPurchaseOrder.orderAmount, RocketPurchaseOrder.orderedAt (+10 more)

### Community 97 - "AI schema"
Cohesion: 0.12
Nodes (18): ThumbnailGenerationEvent.actor, ThumbnailGenerationEvent.actorUserId, ThumbnailGenerationEvent.attemptNumber, ThumbnailGenerationEvent.createdAt, ThumbnailGenerationEvent.errorMessage, ThumbnailGenerationEvent.eventType, ThumbnailGenerationEvent.fromPhase, ThumbnailGenerationEvent.fromStatus (+10 more)

### Community 98 - "Community 98"
Cohesion: 0.11
Nodes (16): ALERT_KINDS, ALERT_OPERATION_LIFECYCLE_STATUSES, ALERT_SEVERITIES, ALERT_STATUSES, AlertItem, AlertItemSchema, AlertKind, AlertOperationLifecycleStatus (+8 more)

### Community 99 - "Community 99"
Cohesion: 0.11
Nodes (16): CANCEL_OPERATION_TARGET_TYPES, CancelOperationAffected, CancelOperationAffectedSchema, CancelOperationPreserved, CancelOperationPreservedSchema, CancelOperationResponse, CancelOperationResponseSchema, CancelOperationStatus (+8 more)

### Community 100 - "Community 100"
Cohesion: 0.15
Nodes (12): CHANNEL_LISTING_SORTS, CHANNEL_LISTING_TABS, IsOptional, IsString, UpdateCoupangAccountSettingsDto, parseRefreshChannelSkuMappingStatusDto(), parseReplaceChannelSkuComponentsDto(), SyncOrdersBodyDto (+4 more)

### Community 101 - "Community 101"
Cohesion: 0.25
Nodes (12): CoupangCredentials, coupangRequest(), CoupangRequestOptions, generateAuthorization(), approveReturn(), confirmOrderSheets(), DELIVERY_COMPANIES, getOrderSheets() (+4 more)

### Community 102 - "Community 102"
Cohesion: 0.12
Nodes (9): CoupangProviderAdapter, Injectable, SubmitCoupangMarketplaceListingCapabilityInput, CoupangCreateSellerProductResponse, CoupangSellerProductPayload, OrderSheetResponse, SellerProductDetailResponse, SellerProductListResponse (+1 more)

### Community 103 - "Community 103"
Cohesion: 0.18
Nodes (10): ChannelSkuMappingCounts, capCandidateLimit(), ChannelSkuMappingService, dedupeCandidates(), distinctNormalizedIdentifiers(), distinctTrimmed(), Injectable, evidence() (+2 more)

### Community 104 - "prisma field: ActionTask.targetId"
Cohesion: 0.24
Nodes (11): ActionTask.targetId, ActionTask.targetType, AdAction.targetType, AgentArtifact.targetId, Alert.actionTaskId, Alert.targetId, Alert.targetType, ChannelAdTargetDailySnapshot.targetType (+3 more)

### Community 105 - "AgentOS schema"
Cohesion: 0.12
Nodes (17): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.startedAt, WorkflowRun.status (+9 more)

### Community 106 - "Core schema"
Cohesion: 0.14
Nodes (15): ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id, ChannelAccount.isPrimary, ChannelAccount.name, ChannelAccount.organization (+7 more)

### Community 107 - "AgentOS schema"
Cohesion: 0.15
Nodes (16): AgentRunEvent.agentInstance, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message, AgentRunEvent.organization (+8 more)

### Community 108 - "Advertising schema"
Cohesion: 0.13
Nodes (16): ExecutionTask.action, ExecutionTask.actionId, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt, ExecutionTask.errorMessage, ExecutionTask.finishedAt (+8 more)

### Community 109 - "Inventory schema"
Cohesion: 0.13
Nodes (16): StockTransaction.createdAt, StockTransaction.createdBy, StockTransaction.id, StockTransaction.note, StockTransaction.option, StockTransaction.optionName, StockTransaction.organization, StockTransaction.quantity (+8 more)

### Community 110 - "AgentOS schema"
Cohesion: 0.13
Nodes (16): WorkflowTemplate.createdAt, WorkflowTemplate.description, WorkflowTemplate.edgesJson, WorkflowTemplate.id, WorkflowTemplate.marketplace, WorkflowTemplate.marketplaceId, WorkflowTemplate.module, WorkflowTemplate.name (+8 more)

### Community 111 - "Community 111"
Cohesion: 0.24
Nodes (14): analyzeReconstructionTriggers(), changedFilesFromGit(), ghPrBody(), git(), isCrossLayerControlChange(), isHighRiskBoundary(), isLargeServiceOrComponent(), layerOf() (+6 more)

### Community 112 - "Community 112"
Cohesion: 0.13
Nodes (8): Inject, ChannelCatalogImportPort, ImportCoupangWingCatalogInput, ChannelCatalogImportRepositoryPort, ChannelCatalogImportService, Inject, Injectable, ParsedWingCatalogRow

### Community 113 - "Community 113"
Cohesion: 0.20
Nodes (10): ChannelSkuMappingController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+2 more)

### Community 114 - "Channels schema"
Cohesion: 0.16
Nodes (14): ChannelSkuComponent.channelSku, ChannelSkuComponent.channelSkuId, ChannelSkuComponent.createdAt, ChannelSkuComponent.createdBy, ChannelSkuComponent.id, ChannelSkuComponent.inventorySku, ChannelSkuComponent.inventorySkuId, ChannelSkuComponent.mappingSource (+6 more)

### Community 115 - "Community 115"
Cohesion: 0.21
Nodes (5): ChannelsInventorySkuReadAdapter, Inject, Injectable, ChannelsInventorySkuReadPort, CandidateInventorySku

### Community 116 - "Community 116"
Cohesion: 0.22
Nodes (7): canonicalParentRows(), ChannelCatalogImportRepositoryAdapter, importResponse(), isUniqueConstraintError(), Injectable, zeroChanges(), ChannelCatalogImportClaim

### Community 117 - "Orders schema"
Cohesion: 0.14
Nodes (15): CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing (+7 more)

### Community 118 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 119 - "Finance schema"
Cohesion: 0.14
Nodes (15): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.id, ProcessingCost.master, ProcessingCost.notes, ProcessingCost.organization, ProcessingCost.processType, ProcessingCost.productName (+7 more)

### Community 120 - "Finance schema"
Cohesion: 0.15
Nodes (15): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.organization, SalesPlan.period (+7 more)

### Community 121 - "Inventory schema"
Cohesion: 0.14
Nodes (15): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.sourceRef, SellpiaReceiptUploadBatch.sourceType (+7 more)

### Community 122 - "Inventory schema"
Cohesion: 0.14
Nodes (15): SellpiaStockSnapshot.createdAt, SellpiaStockSnapshot.createdBy, SellpiaStockSnapshot.effectiveExportedAt, SellpiaStockSnapshot.fileHash, SellpiaStockSnapshot.fileName, SellpiaStockSnapshot.id, SellpiaStockSnapshot.metaJson, SellpiaStockSnapshot.organization (+7 more)

### Community 123 - "Inventory schema"
Cohesion: 0.15
Nodes (15): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items, StockAudit.matchedCount (+7 more)

### Community 124 - "Orders schema"
Cohesion: 0.14
Nodes (15): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.id, UnshippedItem.isNotified, UnshippedItem.listing, UnshippedItem.notifiedAt, UnshippedItem.option, UnshippedItem.order (+7 more)

### Community 125 - "Channels schema"
Cohesion: 0.16
Nodes (14): Channels, RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson (+6 more)

### Community 126 - "Finance schema"
Cohesion: 0.15
Nodes (14): Finance, GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.marginScore, GradeHistory.master, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization (+6 more)

### Community 127 - "Advertising schema"
Cohesion: 0.15
Nodes (14): ExecutionTask.workerId, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentTaskRef, ExecutionWorker.currentUrl, ExecutionWorker.id, ExecutionWorker.label, ExecutionWorker.lastHeartbeatAt (+6 more)

### Community 128 - "Finance schema"
Cohesion: 0.15
Nodes (14): ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description, ManualLedger.id (+6 more)

### Community 129 - "Community 129"
Cohesion: 0.17
Nodes (10): extractNestedSellerProductId(), firstSalePrice(), MarketplaceRegistrationService, numberField(), sellerProductIdFromResponse(), sellerProductName(), stringField(), Inject (+2 more)

### Community 130 - "Community 130"
Cohesion: 0.19
Nodes (12): ChannelSkuCandidateQueryDto, ChannelSkuMappingQueryDto, MAPPING_STATUSES, IsIn, IsInt, IsOptional, IsString, IsUUID (+4 more)

### Community 131 - "Community 131"
Cohesion: 0.17
Nodes (6): ChannelsOperationAlertAdapter, Inject, Injectable, OperationAlertPort, OperationLifecyclePatch, StartOperationAlertInput

### Community 132 - "Community 132"
Cohesion: 0.15
Nodes (5): Inject, ChannelAccountRepositoryAdapter, Injectable, CoupangCredentialsPort, KEY

### Community 133 - "Core schema"
Cohesion: 0.17
Nodes (13): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+5 more)

### Community 134 - "Community 134"
Cohesion: 0.31
Nodes (11): analyzeSchemaArtifactSync(), changedFilesFromGit(), changedFilesFromWorkingTree(), GENERATED_ARTIFACT_PATHS, git(), main(), matchesAnyPath(), mergeChangedFiles() (+3 more)

### Community 135 - "Community 135"
Cohesion: 0.26
Nodes (7): ChannelSyncController, Body, Controller, CurrentOrganization, CurrentUser, Get, Post

### Community 136 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 137 - "Orders schema"
Cohesion: 0.18
Nodes (11): Review.content, Review.createdAt, Review.id, Review.listing, Review.organization, Review.platform, Review.rating, Review.reviewedAt (+3 more)

### Community 138 - "Community 138"
Cohesion: 0.26
Nodes (9): DETAIL_IMAGE_COUNTS, DETAIL_PAGE_AGE_GROUPS, DETAIL_PAGE_TEMPLATE_IDS, DetailImageCount, DetailImageCountSchema, DetailPageAgeGroup, DetailPageAgeGroupSchema, DetailPageTemplateId (+1 more)

### Community 139 - "System schema"
Cohesion: 0.20
Nodes (11): ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization, ActivityEvent.source (+3 more)

### Community 140 - "Core schema"
Cohesion: 0.22
Nodes (11): CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.keywords, CategoryMapping.organization, CategoryMapping.updatedAt (+3 more)

### Community 141 - "System schema"
Cohesion: 0.20
Nodes (10): FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name, FeatureGate.updatedAt (+2 more)

### Community 142 - "Community 142"
Cohesion: 0.18
Nodes (9): ActionTask, ActionTaskExecuteResponse, ActionTaskList, ActionTaskListSchema, ActionTaskRelatedProduct, ActionTaskRelatedProductSchema, ActionTaskSchema, ActionTaskSourceAlert (+1 more)

### Community 143 - "Community 143"
Cohesion: 0.35
Nodes (9): analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), directOutPortFiles(), FORBIDDEN_IN_PORT_FOLDER_NAMES, forbiddenInPortCallerFolders(), listDirectories(), listFiles(), main() (+1 more)

### Community 144 - "Community 144"
Cohesion: 0.27
Nodes (9): appendValues(), parseArgs(), ParsedArgs, parseRawArgs(), ParseRawArgsOptions, pushValue(), values(), COMMANDS (+1 more)

### Community 145 - "Community 145"
Cohesion: 0.31
Nodes (9): addUnique(), defaultOutputDir, defaultSourceDir, normalizeKiditemOrigin(), patchExtensionRuntimeFiles(), patchManifest(), prepareCoupangExtension(), repoRoot (+1 more)

### Community 146 - "Community 146"
Cohesion: 0.29
Nodes (7): assertToolInvocationDidNotFail(), ChannelRegistrationRuntimeHandler, coupangSubmissionInput(), optionalStringField(), registrationInput(), stringField(), Injectable

### Community 147 - "Community 147"
Cohesion: 0.22
Nodes (4): PARENT_COLUMN_INDEXES, REQUIRED_HEADERS, workbookBuffer(), WorkbookOptions

### Community 148 - "Advertising schema"
Cohesion: 0.22
Nodes (10): Advertising, ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.id, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.url (+2 more)

### Community 149 - "System schema"
Cohesion: 0.24
Nodes (10): System, SystemSetting.createdAt, SystemSetting.id, SystemSetting.key, SystemSetting.organization, SystemSetting.updatedAt, SystemSetting.value, SystemSetting (+2 more)

### Community 150 - "Advertising schema"
Cohesion: 0.22
Nodes (10): ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task, ExecutionLog.taskId (+2 more)

### Community 151 - "Community 151"
Cohesion: 0.20
Nodes (8): ReviewFilter, ReviewFilterSchema, ReviewListItem, ReviewListItemSchema, ReviewListResponse, ReviewListResponseSchema, ReviewSummary, ReviewSummarySchema

### Community 152 - "Community 152"
Cohesion: 0.49
Nodes (6): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), scrubDeep(), scrubSecrets(), walk()

### Community 153 - "Community 153"
Cohesion: 0.38
Nodes (8): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), main(), parseBaseline(), readFiles(), repoRoot(), walk()

### Community 154 - "Community 154"
Cohesion: 0.28
Nodes (4): ChannelSyncRepositoryAdapter, Injectable, ProductListingSyncResult, normalizeCoupangProductStatus()

### Community 156 - "Community 156"
Cohesion: 0.47
Nodes (7): checkClaudeShims(), checkTrackedClaudeDirectory(), findStaleInstructionLines(), git(), listTracked(), main(), runChecks()

### Community 157 - "Community 157"
Cohesion: 0.25
Nodes (8): MarketplaceRegistrationDto, IsInt, IsOptional, IsString, IsUUID, MaxLength, Type, Min

### Community 158 - "Community 158"
Cohesion: 0.39
Nodes (5): assertSafeChannelSkuDbPushWarnings(), main(), normalizeWarning(), UNIQUE_WARNING_SIGNATURES, warningSignatures

### Community 159 - "Community 159"
Cohesion: 0.46
Nodes (6): analyzeInventory(), listTopLevelScriptFiles(), main(), repoRoot(), SCRIPT_INVENTORY, SUPPORT_FILES

### Community 160 - "Community 160"
Cohesion: 0.29
Nodes (6): CurrentOrganization, CurrentUser, Param, Post, UploadedFile, UseInterceptors

### Community 161 - "Community 161"
Cohesion: 0.29
Nodes (5): AuthRequiredErrorBody, AuthUserPublic, AuthUserPublicSchema, LoginRequest, LoginRequestSchema

### Community 162 - "Community 162"
Cohesion: 0.29
Nodes (5): ReadinessCheck, ReadinessCheckSchema, ReadinessCheckStatusSchema, ReadinessResponse, ReadinessResponseSchema

### Community 163 - "Community 163"
Cohesion: 0.29
Nodes (5): deletedLegacyTables, repoRoot, retiredBaselineScript, retiredImporterFile, retiredPlannerFile

### Community 164 - "Community 164"
Cohesion: 0.33
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 165 - "Community 165"
Cohesion: 0.33
Nodes (4): SettlementReconcileDetail, SettlementReconcileDetailSchema, SettlementReconcileResponse, SettlementReconcileResponseSchema

### Community 166 - "Community 166"
Cohesion: 0.33
Nodes (6): bounded(), checkChannelSkuIdentity(), createPrisma(), main(), ReadonlyQueryClient, runChannelSkuIdentityPreflight()

### Community 172 - "Community 172"
Cohesion: 0.50
Nodes (4): is_allowlisted(), is_comment_line(), load_file_lines(), check-tenant-scope.sh script

### Community 173 - "prisma field: InventorySku.id"
Cohesion: 0.67
Nodes (3): InventorySku.id, inventory_skus, InventorySku unique(id, organizationId)

### Community 175 - "Community 175"
Cohesion: 0.67
Nodes (3): extractEnvKeys(), readModelFile(), redactEnvValues()

## Knowledge Gaps
- **1989 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+1984 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Inventory schema` to `Community 1`, `prisma field: Database ERD`, `Community 4`, `prisma field: AdAction.externalId`, `Community 6`, `prisma field: ChannelReconciliationItem.legacyCode`, `Community 9`, `Orders schema`, `Channels schema`, `Core schema`, `Orders schema`, `Core schema`, `Community 15`, `Supply schema`, `Community 18`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Supply schema`, `AI schema`, `AI schema`, `Core schema`, `AI schema`, `AI schema`, `Core schema`, `AI schema`, `Channels schema`, `Community 33`, `Sourcing schema`, `AgentOS schema`, `Channels schema`, `Sourcing schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `Inventory schema`, `System schema`, `AI schema`, `AI schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `AgentOS schema`, `System schema`, `AgentOS schema`, `Channels schema`, `Advertising schema`, `AgentOS schema`, `System schema`, `Core schema`, `Channels schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Core schema`, `Finance schema`, `AI schema`, `AI schema`, `Core schema`, `AgentOS schema`, `AI schema`, `Inventory schema`, `Channels schema`, `AI schema`, `prisma field: ActionTask.targetId`, `Core schema`, `AgentOS schema`, `Inventory schema`, `AgentOS schema`, `Channels schema`, `Orders schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `Orders schema`, `Channels schema`, `Finance schema`, `Advertising schema`, `Finance schema`, `Core schema`, `Orders schema`, `System schema`, `Core schema`, `System schema`, `Advertising schema`, `System schema`, `Community 158`, `prisma field: Organization.id`?**
  _High betweenness centrality (0.254) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `prisma field: Database ERD` to `Inventory schema`, `prisma field: AdAction.externalId`, `prisma field: ChannelReconciliationItem.legacyCode`, `Orders schema`, `Channels schema`, `Core schema`, `Orders schema`, `Core schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Supply schema`, `AI schema`, `AI schema`, `Core schema`, `AI schema`, `AI schema`, `Core schema`, `AI schema`, `Channels schema`, `Sourcing schema`, `AgentOS schema`, `Channels schema`, `Sourcing schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `Inventory schema`, `System schema`, `AI schema`, `AI schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `AgentOS schema`, `System schema`, `System schema`, `AgentOS schema`, `Channels schema`, `Advertising schema`, `AgentOS schema`, `System schema`, `Core schema`, `Channels schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Core schema`, `Finance schema`, `AI schema`, `AI schema`, `Core schema`, `AgentOS schema`, `AI schema`, `Inventory schema`, `Channels schema`, `AI schema`, `prisma field: ActionTask.targetId`, `AgentOS schema`, `Core schema`, `AgentOS schema`, `Advertising schema`, `Inventory schema`, `AgentOS schema`, `Channels schema`, `Orders schema`, `System schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `Orders schema`, `Channels schema`, `Finance schema`, `Advertising schema`, `Finance schema`, `Core schema`, `System schema`, `Orders schema`, `System schema`, `Core schema`, `System schema`, `Advertising schema`, `System schema`, `Advertising schema`?**
  _High betweenness centrality (0.211) - this node is a cross-community bridge._
- **Why does `Order` connect `Orders schema` to `Inventory schema`, `Community 1`, `prisma field: Database ERD`, `prisma field: AdAction.externalId`, `Community 6`, `Community 7`, `prisma field: ChannelReconciliationItem.legacyCode`, `Community 9`, `Community 134`, `Core schema`, `Orders schema`, `Core schema`, `Community 143`, `Community 16`, `Community 18`, `Community 33`, `Core schema`, `Inventory schema`, `Community 56`, `Orders schema`, `Community 75`, `Community 100`, `prisma field: ActionTask.targetId`, `Channels schema`, `Orders schema`, `Orders schema`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Are the 115 inferred relationships involving `Organization` (e.g. with `channel-registration-capability.adapter.ts` and `channel-registration-capability.adapter.spec.ts`) actually correct?**
  _`Organization` has 115 INFERRED edges - model-reasoned connections that need verification._
- **Are the 72 inferred relationships involving `Order` (e.g. with `channel-sync.controller.ts` and `index.ts`) actually correct?**
  _`Order` has 72 INFERRED edges - model-reasoned connections that need verification._
- **Are the 43 inferred relationships involving `ChannelListing` (e.g. with `channel-registration-capability.adapter.ts` and `channel-registration-capability.adapter.spec.ts`) actually correct?**
  _`ChannelListing` has 43 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason` to the rest of the system?**
  _1990 weakly-connected nodes found - possible documentation gaps or missing edges._