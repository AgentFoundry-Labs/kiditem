# Graph Report - schema-consumers  (2026-07-11)

## Corpus Check
- 273 files · ~120,779 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4436 nodes · 19480 edges · 212 communities (200 shown, 12 thin omitted)
- Extraction: 40% EXTRACTED · 60% INFERRED · 0% AMBIGUOUS · INFERRED: 11666 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Core schema
- Community 1
- Community 2
- Community 3
- AgentOS schema
- Community 5
- Community 6
- Community 7
- prisma field: AdAction.externalId
- AI schema
- Orders schema
- prisma field: AgentToolDefinition.isActive
- Channels schema
- Community 13
- Orders schema
- Community 15
- Community 16
- Inventory schema
- Community 18
- AgentOS schema
- AI schema
- prisma field: index.ts
- AgentOS schema
- Community 23
- Community 24
- Supply schema
- AI schema
- AI schema
- Core schema
- AI schema
- System schema
- Core schema
- Channels schema
- Sourcing schema
- Core schema
- AI schema
- Community 36
- Sourcing schema
- AgentOS schema
- AgentOS schema
- Inventory schema
- Inventory schema
- Community 42
- Orders schema
- AI schema
- Community 45
- Community 46
- Inventory schema
- AgentOS schema
- AI schema
- Community 50
- AgentOS schema
- System schema
- Channels schema
- Channels schema
- AI schema
- AgentOS schema
- System schema
- Channels schema
- Core schema
- Supply schema
- Inventory schema
- Inventory schema
- Community 63
- Community 64
- Community 65
- AgentOS schema
- Channels schema
- Community 68
- Advertising schema
- Core schema
- Orders schema
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- AgentOS schema
- System schema
- Channels schema
- AgentOS schema
- Channels schema
- Core schema
- Core schema
- Finance schema
- AI schema
- Community 88
- Community 89
- Community 90
- AgentOS schema
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- AgentOS schema
- AI schema
- Inventory schema
- Channels schema
- Community 101
- Core schema
- Core schema
- Inventory schema
- Community 105
- AgentOS schema
- Advertising schema
- Supply schema
- Community 109
- Orders schema
- System schema
- Finance schema
- Finance schema
- Inventory schema
- Inventory schema
- Inventory schema
- Orders schema
- Community 118
- Finance schema
- Channels schema
- Advertising schema
- Finance schema
- Community 123
- Community 124
- Core schema
- Channels schema
- Community 127
- Community 128
- Community 129
- Core schema
- System schema
- Community 132
- Community 133
- System schema
- System schema
- Community 136
- Community 137
- Community 138
- Community 139
- Community 140
- Community 141
- Community 142
- Advertising schema
- System schema
- Advertising schema
- Community 146
- Community 147
- Community 148
- Community 149
- Community 150
- Community 151
- Community 152
- Community 153
- Community 154
- Supply schema
- Community 156
- Community 157
- Community 158
- Community 159
- Community 160
- Community 161
- Community 162
- prisma field: ChannelReconciliationItem.channel
- Community 164
- Community 165
- Community 166
- Community 167
- Community 168
- Community 169
- Community 170
- Community 171
- prisma field: ChannelReconciliationItem.id
- prisma field: Organization.id
- Community 174
- Community 175
- Community 176

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 343 edges
2. `Organization` - 315 edges
3. `prisma — Shared Schema` - 141 edges
4. `Order` - 122 edges
5. `ChannelListing` - 115 edges
6. `User` - 103 edges
7. `ProductOption` - 101 edges
8. `MasterProduct` - 100 edges
9. `ContentWorkspace.organizationId` - 95 edges
10. `ChannelListingOption.organizationId` - 95 edges
11. `ProductPreparation.organizationId` - 94 edges
12. `ChannelSkuComponent.organizationId` - 94 edges

## Surprising Connections (you probably didn't know these)
- `collectIds()` --indirect_call--> `value()`  [INFERRED]
  apps/server/src/channels/adapter/out/repository/channel-reconciliation-query.repository.adapter.ts → scripts/_shared/cli-args.ts
- `makeFakePrisma()` --indirect_call--> `row()`  [INFERRED]
  apps/server/src/channels/application/service/__tests__/channel-reconciliation.service.spec.ts → scripts/__tests__/import-baseline-planner.spec.ts
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

## Communities (212 total, 12 thin omitted)

### Community 0 - "Core schema"
Cohesion: 0.19
Nodes (185): USER, ListingForProductSync, OperationAlertSeverity, DeliveryCompany, ChannelAccountListRow, CoupangAccountConfigurationError, ChannelListingMarketCount, ChannelListingRepositoryPort (+177 more)

### Community 1 - "Community 1"
Cohesion: 0.02
Nodes (101): AgentApprovalRequestSummary, AgentApprovalRequestSummarySchema, AgentApprovalStatus, AgentApprovalStatusSchema, AgentArtifactHandoffSummary, AgentArtifactHandoffSummarySchema, AgentArtifactStatus, AgentArtifactStatusSchema (+93 more)

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (73): AdjustStockInput, AdjustStockInputSchema, Inventory, InventoryAssetGradeSummary, InventoryAssetGradeSummarySchema, InventoryAssetItem, InventoryAssetItemSchema, InventoryAssetReport (+65 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (71): AdapterCommand, appendFlag(), appendOption(), appendProjectReferenceDefaults(), appendValues(), archiveFileName(), archiveShaFileName(), Args (+63 more)

### Community 4 - "AgentOS schema"
Cohesion: 0.06
Nodes (68): Database ERD, AgentApprovalRequest.agentInstanceId, AgentArtifact.agentInstanceId, AgentAuthorizationEvent.agentInstanceId, AgentCostEvent.agentInstanceId, AgentInstance.adapterConfig, AgentInstance.adapterType, AgentInstance.createdAt (+60 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (63): ReviewFilter, ReviewFilterSchema, ReviewListItem, ReviewListItemSchema, ReviewListResponse, ReviewListResponseSchema, ReviewSummary, ReviewSummarySchema (+55 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (28): DATA_MIGRATION_IDS, DATA_MIGRATION_RELEASES, dataMigrations, DataMigration, backfillSourcingCandidatesFromMasterProducts, isLegacyDetailEditorHref(), rewriteLegacyDetailEditorAlertHrefs, rewriteLegacyDetailEditorHref() (+20 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (59): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot, AdCampaignSnapshotSchema (+51 more)

### Community 8 - "prisma field: AdAction.externalId"
Cohesion: 0.20
Nodes (44): ConfirmedListingRegistrationInput, ConfirmedListingRegistrationOutput, ConfirmedListingRegistrationOutputSchema, CoupangListingSubmissionInput, CoupangListingSubmissionOutput, CoupangListingSubmissionOutputSchema, NonEmptyRecordSchema, SubmittedCoupangMarketplaceListingResult (+36 more)

### Community 9 - "AI schema"
Cohesion: 0.04
Nodes (60): packages/shared — @kiditem/shared, AI, Inventory, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.createdAt, ThumbnailGeneration.deletedAt, ThumbnailGeneration.editAnalysis (+52 more)

### Community 10 - "Orders schema"
Cohesion: 0.05
Nodes (51): Review.content, Review.createdAt, Review.id, Review.listing, Review.organization, Review.platform, Review.rating, Review.reviewedAt (+43 more)

### Community 11 - "prisma field: AgentToolDefinition.isActive"
Cohesion: 0.04
Nodes (52): AgentToolDefinition.isActive, CategoryMapping.isActive, ChannelListingOption.isActive, ChannelListingOptionDailySnapshot.isActive, Organization.isActive, ProductOption.isActive, ScrapeTarget.isActive, User.isActive (+44 more)

### Community 12 - "Channels schema"
Cohesion: 0.04
Nodes (55): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+47 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (49): apiHeaders(), apiUrl(), Args, assertSafeDatasetId(), buildCoupangImageSyncRowsForListings(), BundleManifest, BundlePayload, BundleReference (+41 more)

### Community 14 - "Orders schema"
Cohesion: 0.05
Nodes (47): channels — Marketplace Sync + Reconciliation, Channels, Orders, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId (+39 more)

### Community 15 - "Community 15"
Cohesion: 0.10
Nodes (48): assertNonProductionTarget(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged(), assertSha256(), BaselineManifest, BaselineManifestExpectation, baselineObjectKeys, buildChecksumsFile() (+40 more)

### Community 16 - "Community 16"
Cohesion: 0.08
Nodes (45): applyCacheControl(), ApplyResult, applyS3CacheControl(), applySupabaseCacheControl(), assertApplyAllowed(), buildCopyObjectInput(), CliArgs, CliConfig (+37 more)

### Community 17 - "Inventory schema"
Cohesion: 0.05
Nodes (47): StockTransaction.createdAt, StockTransaction.createdBy, StockTransaction.id, StockTransaction.note, StockTransaction.option, StockTransaction.optionName, StockTransaction.organization, StockTransaction.quantity (+39 more)

### Community 18 - "Community 18"
Cohesion: 0.05
Nodes (34): ChannelAccountListItem, ChannelAccountListItemSchema, CoupangAccountSettings, CoupangAccountSettingsSchema, UpdateCoupangAccountSettings, ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow (+26 more)

### Community 19 - "AgentOS schema"
Cohesion: 0.05
Nodes (43): AgentRunRequest.agentInstance, AgentRunRequest.attempts, AgentRunRequest.claimedAt, AgentRunRequest.claimedBy, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.coalescedIntoRequestId, AgentRunRequest.conversation, AgentRunRequest.createdAt (+35 more)

### Community 20 - "AI schema"
Cohesion: 0.05
Nodes (43): ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.editedHtmlSavedAt, ContentGeneration.errorMessage (+35 more)

### Community 21 - "prisma field: index.ts"
Cohesion: 0.10
Nodes (37): makeFakePrisma(), ChannelListingOption.barcode, InventorySku.barcode, MasterProduct.barcode, ProductOption.barcode, SellpiaNewProductCandidate.barcode, SellpiaStockSnapshotItem.barcode, RocketInventoryEventInputSchema (+29 more)

### Community 22 - "AgentOS schema"
Cohesion: 0.05
Nodes (42): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+34 more)

### Community 23 - "Community 23"
Cohesion: 0.05
Nodes (36): PANEL_RUN_SOURCES, PanelRunSource, PanelRunSourceSchema, sourceKeys, PANEL_ITEM_KINDS, PanelAlertItem, PanelAlertItemSchema, PanelDismissEventSchema (+28 more)

### Community 24 - "Community 24"
Cohesion: 0.05
Nodes (39): AdMetricsDetail, AdMetricsDetailSchema, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary, DashboardAdSummarySchema (+31 more)

### Community 25 - "Supply schema"
Cohesion: 0.06
Nodes (39): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.id, MasterSupplierProduct.isPrimary, MasterSupplierProduct.master, MasterSupplierProduct.memo, MasterSupplierProduct.minOrderQty, MasterSupplierProduct.supplier (+31 more)

### Community 26 - "AI schema"
Cohesion: 0.06
Nodes (40): ContentGeneration.detailPageArtifactId, ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.createdByUserId, DetailPageArtifact.currentRevision, DetailPageArtifact.currentRevisionId (+32 more)

### Community 27 - "AI schema"
Cohesion: 0.06
Nodes (39): ProductPreparation.selectedThumbnailGenerationCandidateId, ThumbnailGenerationCandidate.createdAt, ThumbnailGenerationCandidate.filename, ThumbnailGenerationCandidate.fileSize, ThumbnailGenerationCandidate.generation, ThumbnailGenerationCandidate.generationId, ThumbnailGenerationCandidate.height, ThumbnailGenerationCandidate.id (+31 more)

### Community 28 - "Core schema"
Cohesion: 0.06
Nodes (35): AgentApprovalRequest.approverUserId, AgentApprovalRequest.decidedByUserId, AgentApprovalRequest.requestedByUserId, AgentAuthorizationEvent.requestedByUserId, AgentRunRequest.requestedByUserId, OrganizationMembership.createdAt, OrganizationMembership.id, OrganizationMembership.invitedBy (+27 more)

### Community 29 - "AI schema"
Cohesion: 0.06
Nodes (38): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+30 more)

### Community 30 - "System schema"
Cohesion: 0.09
Nodes (31): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.href (+23 more)

### Community 31 - "Core schema"
Cohesion: 0.06
Nodes (37): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.adTier, MasterProduct.brand, MasterProduct.category, MasterProduct.code, MasterProduct.costCny, MasterProduct.createdAt (+29 more)

### Community 32 - "Channels schema"
Cohesion: 0.06
Nodes (35): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel, ChannelAdTargetDailySnapshot.clicks (+27 more)

### Community 33 - "Sourcing schema"
Cohesion: 0.07
Nodes (31): ContentGeneration.sourceCandidateId, SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.id, SourcingCandidate.imageUrl (+23 more)

### Community 34 - "Core schema"
Cohesion: 0.07
Nodes (31): ChannelListing.brand, ChannelListing.category, ChannelListing.channel, ChannelListing.channelAccount, ChannelListing.channelAccountId, ChannelListing.channelName, ChannelListing.channelPrice, ChannelListing.createdAt (+23 more)

### Community 35 - "AI schema"
Cohesion: 0.07
Nodes (34): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.generationGroup (+26 more)

### Community 36 - "Community 36"
Cohesion: 0.07
Nodes (31): DeliveryCompany, DeliveryCompanySchema, Order, OrderActionResponse, OrderActionResponseSchema, OrderLineItem, OrderLineItemSchema, OrderListItem (+23 more)

### Community 37 - "Sourcing schema"
Cohesion: 0.07
Nodes (32): Sourcing, CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id (+24 more)

### Community 38 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+25 more)

### Community 39 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.startedAt, WorkflowRun.status (+25 more)

### Community 40 - "Inventory schema"
Cohesion: 0.07
Nodes (23): CHANNELS_ROOT, REPO_ROOT, Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.id, Inventory.lastRestockedAt, Inventory.leadTimeDays (+15 more)

### Community 41 - "Inventory schema"
Cohesion: 0.06
Nodes (32): SellpiaStockSnapshotItem.appliedTransactionId, SellpiaStockSnapshotItem.blockingReasons, SellpiaStockSnapshotItem.createdAt, SellpiaStockSnapshotItem.diff, SellpiaStockSnapshotItem.diffRate, SellpiaStockSnapshotItem.id, SellpiaStockSnapshotItem.inventory, SellpiaStockSnapshotItem.kiditemStockAtApply (+24 more)

### Community 42 - "Community 42"
Cohesion: 0.13
Nodes (31): MigrationResult, appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertMutatingTarget(), CliArgs, Command, COMMANDS, commandStatus() (+23 more)

### Community 43 - "Orders schema"
Cohesion: 0.07
Nodes (31): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.metadata, OrderLineItem.option, OrderLineItem.optionName, OrderLineItem.order (+23 more)

### Community 44 - "AI schema"
Cohesion: 0.08
Nodes (27): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt (+19 more)

### Community 45 - "Community 45"
Cohesion: 0.08
Nodes (21): ChannelRegistrationCapabilityAdapter, ConfirmedListingRegistrationInputSchema, CoupangListingSubmissionInputSchema, normalizeForHash(), stableHash(), Injectable, ChannelsMarketplaceRegistrationCapabilityPort, RegisterConfirmedMarketplaceListingCapabilityInput (+13 more)

### Community 46 - "Community 46"
Cohesion: 0.07
Nodes (28): ReconciliationChannel, ReconciliationChannelSchema, ReconciliationIgnoreRequest, ReconciliationIgnoreRequestSchema, ReconciliationItem, ReconciliationItemListResponse, ReconciliationItemListResponseSchema, ReconciliationItemSchema (+20 more)

### Community 47 - "Inventory schema"
Cohesion: 0.08
Nodes (29): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.option, PickingItem.pickedAt, PickingItem.pickingList (+21 more)

### Community 48 - "AgentOS schema"
Cohesion: 0.08
Nodes (28): AgentOS, AgentAuthorizationEvent.toolId, AgentInstanceToolPolicy.agentInstance, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentInstanceToolPolicy.dryRunMode, AgentInstanceToolPolicy.effect (+20 more)

### Community 49 - "AI schema"
Cohesion: 0.08
Nodes (28): ProductPreparation.appliedToMasterAt, ProductPreparation.contentWorkspace, ProductPreparation.createdAt, ProductPreparation.createdByUser, ProductPreparation.createdByUserId, ProductPreparation.deletedAt, ProductPreparation.displayName, ProductPreparation.id (+20 more)

### Community 50 - "Community 50"
Cohesion: 0.14
Nodes (27): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+19 more)

### Community 51 - "AgentOS schema"
Cohesion: 0.08
Nodes (27): AgentToolInvocation.agentInstance, AgentToolInvocation.approvalRequest, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt, AgentToolInvocation.errorCode, AgentToolInvocation.errorMessage (+19 more)

### Community 52 - "System schema"
Cohesion: 0.08
Nodes (26): Alert.actionTask, Alert.actorUser, Alert.actorUserId, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead (+18 more)

### Community 53 - "Channels schema"
Cohesion: 0.08
Nodes (27): ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isOfferWinner, ChannelListingOptionDailySnapshot.lastObservedAt, ChannelListingOptionDailySnapshot.listing (+19 more)

### Community 54 - "Channels schema"
Cohesion: 0.07
Nodes (27): ChannelReconciliationItem.channelImageUrl, ChannelReconciliationItem.channelOptionName, ChannelReconciliationItem.channelProductName, ChannelReconciliationItem.channelStatus, ChannelReconciliationItem.channelUrl, ChannelReconciliationItem.confidence, ChannelReconciliationItem.conflictJson, ChannelReconciliationItem.createdAt (+19 more)

### Community 55 - "AI schema"
Cohesion: 0.09
Nodes (27): ContentGeneration.contentWorkspaceId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.createdByUserId, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageArtifactId, ContentWorkspace.currentDetailPageRevision, ContentWorkspace.deletedAt (+19 more)

### Community 56 - "AgentOS schema"
Cohesion: 0.08
Nodes (26): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.approver, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy, AgentApprovalRequest.decisionReason, AgentApprovalRequest.expiresAt (+18 more)

### Community 57 - "System schema"
Cohesion: 0.08
Nodes (22): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon, Marketplace.id (+14 more)

### Community 58 - "Channels schema"
Cohesion: 0.08
Nodes (25): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.id, ChannelScrapeRun.matchedCount (+17 more)

### Community 59 - "Core schema"
Cohesion: 0.09
Nodes (25): ProductOption.availableStock, ProductOption.commissionRate, ProductOption.costPrice, ProductOption.createdAt, ProductOption.deletedAt, ProductOption.id, ProductOption.isBundle, ProductOption.isTemporary (+17 more)

### Community 60 - "Supply schema"
Cohesion: 0.08
Nodes (25): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+17 more)

### Community 61 - "Inventory schema"
Cohesion: 0.09
Nodes (25): RocketInventoryLedger.createdAt, RocketInventoryLedger.createdBy, RocketInventoryLedger.eventType, RocketInventoryLedger.id, RocketInventoryLedger.inventory, RocketInventoryLedger.inventoryId, RocketInventoryLedger.metaJson, RocketInventoryLedger.note (+17 more)

### Community 62 - "Inventory schema"
Cohesion: 0.08
Nodes (25): SellpiaNewProductCandidate.createdAt, SellpiaNewProductCandidate.createdInventory, SellpiaNewProductCandidate.id, SellpiaNewProductCandidate.initialReceiveTransactionId, SellpiaNewProductCandidate.modelName, SellpiaNewProductCandidate.note, SellpiaNewProductCandidate.operatorInitialStock, SellpiaNewProductCandidate.organization (+17 more)

### Community 63 - "Community 63"
Cohesion: 0.08
Nodes (22): StatisticsCategoryRow, StatisticsCategoryRowSchema, StatisticsDeliveryDaily, StatisticsDeliveryDailySchema, StatisticsDeliveryResponse, StatisticsDeliveryResponseSchema, StatisticsGradeRow, StatisticsGradeRowSchema (+14 more)

### Community 64 - "Community 64"
Cohesion: 0.20
Nodes (8): ChannelDashboardController, Controller, CurrentOrganization, Get, Query, CoupangDateRangeQueryDto, ChannelDashboardService, Injectable

### Community 65 - "Community 65"
Cohesion: 0.11
Nodes (11): OperationAlertPort, ChannelReconciliationResolutionService, Injectable, ChannelReconciliationScanService, Injectable, ChannelReconciliationService, errorMessage(), scanSummaryMessage() (+3 more)

### Community 66 - "AgentOS schema"
Cohesion: 0.09
Nodes (23): AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy, AgentAuthorizationEvent.decidedByUserId, AgentAuthorizationEvent.decision (+15 more)

### Community 67 - "Channels schema"
Cohesion: 0.09
Nodes (22): ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.id, ChannelScrapeSnapshot.listing, ChannelScrapeSnapshot.listingOption (+14 more)

### Community 68 - "Community 68"
Cohesion: 0.09
Nodes (21): ChannelSkuMappingComponent, ChannelSkuMappingComponentSchema, ChannelSkuMappingCounts, ChannelSkuMappingCountsSchema, ChannelSkuMappingListItem, ChannelSkuMappingListItemSchema, ChannelSkuMappingListResponse, ChannelSkuMappingListResponseSchema (+13 more)

### Community 69 - "Advertising schema"
Cohesion: 0.10
Nodes (22): AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+14 more)

### Community 70 - "Core schema"
Cohesion: 0.10
Nodes (22): ChannelListingOption.channelAccount, ChannelListingOption.channelAccountId, ChannelListingOption.createdAt, ChannelListingOption.id, ChannelListingOption.itemName, ChannelListingOption.lastImportRun, ChannelListingOption.listing, ChannelListingOption.mappingStatus (+14 more)

### Community 71 - "Orders schema"
Cohesion: 0.11
Nodes (22): OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.id, OrderReturn.metadata, OrderReturn.order (+14 more)

### Community 72 - "Community 72"
Cohesion: 0.22
Nodes (18): Path, add_code_reference_edges(), add_document_mentions(), add_schema_graph(), camel(), collect_code(), community_labels(), GraphBuilder (+10 more)

### Community 73 - "Community 73"
Cohesion: 0.18
Nodes (15): CoupangCredentials, coupangRequest(), CoupangRequestOptions, generateAuthorization(), approveReturn(), confirmOrderSheets(), DELIVERY_COMPANIES, getOrderSheets() (+7 more)

### Community 74 - "Community 74"
Cohesion: 0.17
Nodes (18): ChannelReconciliationMatcherRepositoryAdapter, Injectable, CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT, CHANNELS_OPERATION_ALERT_PORT, CHANNELS_PRODUCT_MASTER_BARCODE_PORT, COUPANG_PROVIDER_PORT, CHANNEL_ACCOUNT_REPOSITORY_PORT, COUPANG_CREDENTIALS_PORT (+10 more)

### Community 75 - "Community 75"
Cohesion: 0.11
Nodes (12): Inject, ChannelListingHandle, ChannelListingOptionHandle, ChannelReconciliationMatcherPort, MatchOutcome, OptionLinkBackfillResult, PrismaLike, ProductOptionCandidate (+4 more)

### Community 76 - "Community 76"
Cohesion: 0.10
Nodes (9): ChannelReconciliationQueryRepositoryAdapter, collectIds(), Injectable, Inject, ChannelReconciliationQueryRepositoryPort, ReconciliationRepositoryItemRow, ChannelReconciliationQueryService, Inject (+1 more)

### Community 77 - "Community 77"
Cohesion: 0.11
Nodes (10): ChannelSyncRepositoryAdapter, Injectable, CoupangSyncOrderPayload, CoupangSyncReturnPayload, ProductListingSyncResult, syncSingleCoupangOrder(), syncSingleCoupangReturn(), formatKstIso() (+2 more)

### Community 78 - "Community 78"
Cohesion: 0.10
Nodes (6): CoupangProviderPort, ChannelSyncRepositoryPort, OrderSyncDeps, ProductSyncDeps, Inject, Optional

### Community 79 - "AgentOS schema"
Cohesion: 0.10
Nodes (21): AgentArtifact.agentInstance, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization, AgentArtifact.request (+13 more)

### Community 80 - "System schema"
Cohesion: 0.10
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+13 more)

### Community 81 - "Channels schema"
Cohesion: 0.10
Nodes (21): ChannelReconciliationItem.lastSeenRunId, ChannelReconciliationRun.alreadyLinkedCount, ChannelReconciliationRun.autoLinkedCount, ChannelReconciliationRun.channel, ChannelReconciliationRun.conflictCount, ChannelReconciliationRun.createdAt, ChannelReconciliationRun.errorCount, ChannelReconciliationRun.errorJson (+13 more)

### Community 82 - "AgentOS schema"
Cohesion: 0.11
Nodes (20): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id, AgentCostEvent.inputTokens (+12 more)

### Community 83 - "Channels schema"
Cohesion: 0.13
Nodes (20): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType, ChannelAccountDailyKpiSnapshot.lastObservedAt, ChannelAccountDailyKpiSnapshot.normalizedJson (+12 more)

### Community 84 - "Core schema"
Cohesion: 0.13
Nodes (20): ChannelListing.lastImportRunId, ChannelListingOption.lastImportRunId, SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.createdAt, SourceImportRun.createdBy, SourceImportRun.fileHash (+12 more)

### Community 85 - "Core schema"
Cohesion: 0.11
Nodes (20): MasterProductImage.createdAt, MasterProductImage.deletedAt, MasterProductImage.fileSize, MasterProductImage.height, MasterProductImage.id, MasterProductImage.isPrimary, MasterProductImage.label, MasterProductImage.master (+12 more)

### Community 86 - "Finance schema"
Cohesion: 0.12
Nodes (20): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit (+12 more)

### Community 87 - "AI schema"
Cohesion: 0.11
Nodes (20): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id, ThumbnailAnalysis.imageSpec, ThumbnailAnalysis.imageUrl (+12 more)

### Community 88 - "Community 88"
Cohesion: 0.10
Nodes (18): SupplierHistoryItem, SupplierHistoryItemSchema, SupplierHistoryReport, SupplierHistoryReportSchema, SupplierHistorySummary, SupplierHistorySummarySchema, SupplierProductSalesReport, SupplierProductSalesReportSchema (+10 more)

### Community 89 - "Community 89"
Cohesion: 0.12
Nodes (12): ChannelAccountController, Body, Controller, CurrentOrganization, Get, CoupangCredentials, HealthResult, ChannelAccountService (+4 more)

### Community 90 - "Community 90"
Cohesion: 0.18
Nodes (14): envelopeToJson(), maskAccessKey(), readCredentialsConfig(), stripLegacyCredentialKeys(), toJsonRecord(), toRecord(), trimToOptional(), CoupangCredentialCryptoError (+6 more)

### Community 91 - "AgentOS schema"
Cohesion: 0.12
Nodes (19): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError, AgentTaskSession.lastRun (+11 more)

### Community 92 - "Community 92"
Cohesion: 0.12
Nodes (15): CoupangWingCatalogImportResponse, CoupangWingCatalogImportResponseSchema, ImportChanges, SellpiaInventoryImportResponse, SellpiaInventoryImportResponseSchema, SourceImportRun, SourceImportRunSchema, SourceImportStatus (+7 more)

### Community 93 - "Community 93"
Cohesion: 0.22
Nodes (17): analyzePrReleaseContract(), changedFilesFromGit(), classifyFiles(), compareSemver(), ghPrBody(), git(), hasReleaseDecision(), isDevelopToMainPromotion() (+9 more)

### Community 94 - "Community 94"
Cohesion: 0.16
Nodes (10): ChannelListingController, Controller, CurrentOrganization, Get, Param, Query, ChannelListingQuery, ChannelListingQueryService (+2 more)

### Community 95 - "Community 95"
Cohesion: 0.19
Nodes (9): ChannelReconciliationController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+1 more)

### Community 96 - "Community 96"
Cohesion: 0.11
Nodes (9): ChannelsProductMasterBarcodeAdapter, Inject, Injectable, MarketplaceRegistrationRepositoryAdapter, Injectable, ChannelsProductMasterBarcodePort, MarketplaceRegistrationRepositoryPort, Inject (+1 more)

### Community 97 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.id, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.lastRunId (+10 more)

### Community 98 - "AI schema"
Cohesion: 0.12
Nodes (18): ContentAsset.generationGroupId, ContentGeneration.generationGroupId, ContentGenerationGroup.baseContentGeneration, ContentGenerationGroup.baseContentGenerationId, ContentGenerationGroup.createdAt, ContentGenerationGroup.createdByUserId, ContentGenerationGroup.groupType, ContentGenerationGroup.id (+10 more)

### Community 99 - "Inventory schema"
Cohesion: 0.12
Nodes (18): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.notes, ReturnTransfer.option, ReturnTransfer.optionName (+10 more)

### Community 100 - "Channels schema"
Cohesion: 0.12
Nodes (18): RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt, RocketPurchaseOrder.firstSkuName, RocketPurchaseOrder.id, RocketPurchaseOrder.items, RocketPurchaseOrder.orderAmount, RocketPurchaseOrder.orderedAt (+10 more)

### Community 101 - "Community 101"
Cohesion: 0.11
Nodes (16): CANCEL_OPERATION_TARGET_TYPES, CancelOperationAffected, CancelOperationAffectedSchema, CancelOperationPreserved, CancelOperationPreservedSchema, CancelOperationResponse, CancelOperationResponseSchema, CancelOperationStatus (+8 more)

### Community 102 - "Core schema"
Cohesion: 0.14
Nodes (17): Core, CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.keywords, CategoryMapping.organization (+9 more)

### Community 103 - "Core schema"
Cohesion: 0.14
Nodes (15): ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id, ChannelAccount.isPrimary, ChannelAccount.name, ChannelAccount.organization (+7 more)

### Community 104 - "Inventory schema"
Cohesion: 0.14
Nodes (17): InventorySku.createdAt, InventorySku.id, InventorySku.lastImportRun, InventorySku.lastImportRunId, InventorySku.name, InventorySku.optionName, InventorySku.organization, InventorySku.purchasePrice (+9 more)

### Community 105 - "Community 105"
Cohesion: 0.16
Nodes (12): IsOptional, IsString, UpdateCoupangAccountSettingsDto, CoupangReconciliationIgnoreDto, CoupangReconciliationLinkDto, IsOptional, IsString, IsUUID (+4 more)

### Community 106 - "AgentOS schema"
Cohesion: 0.15
Nodes (16): AgentRunEvent.agentInstance, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message, AgentRunEvent.organization (+8 more)

### Community 107 - "Advertising schema"
Cohesion: 0.13
Nodes (16): ExecutionTask.action, ExecutionTask.actionId, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt, ExecutionTask.errorMessage, ExecutionTask.finishedAt (+8 more)

### Community 108 - "Supply schema"
Cohesion: 0.13
Nodes (16): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.dueDate, SupplierPayment.id, SupplierPayment.notes, SupplierPayment.organization, SupplierPayment.paidAmount, SupplierPayment.paidDate (+8 more)

### Community 109 - "Community 109"
Cohesion: 0.20
Nodes (5): ChannelReconciliationScanRepositoryAdapter, Injectable, ChannelReconciliationScanRepositoryPort, ReconciliationRowInput, Inject

### Community 110 - "Orders schema"
Cohesion: 0.14
Nodes (15): CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing (+7 more)

### Community 111 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 112 - "Finance schema"
Cohesion: 0.14
Nodes (15): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.id, ProcessingCost.master, ProcessingCost.notes, ProcessingCost.organization, ProcessingCost.processType, ProcessingCost.productName (+7 more)

### Community 113 - "Finance schema"
Cohesion: 0.15
Nodes (15): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.organization, SalesPlan.period (+7 more)

### Community 114 - "Inventory schema"
Cohesion: 0.14
Nodes (15): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.sourceRef, SellpiaReceiptUploadBatch.sourceType (+7 more)

### Community 115 - "Inventory schema"
Cohesion: 0.14
Nodes (15): SellpiaStockSnapshot.createdAt, SellpiaStockSnapshot.createdBy, SellpiaStockSnapshot.effectiveExportedAt, SellpiaStockSnapshot.fileHash, SellpiaStockSnapshot.fileName, SellpiaStockSnapshot.id, SellpiaStockSnapshot.metaJson, SellpiaStockSnapshot.organization (+7 more)

### Community 116 - "Inventory schema"
Cohesion: 0.15
Nodes (15): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items, StockAudit.matchedCount (+7 more)

### Community 117 - "Orders schema"
Cohesion: 0.14
Nodes (15): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.id, UnshippedItem.isNotified, UnshippedItem.listing, UnshippedItem.notifiedAt, UnshippedItem.option, UnshippedItem.order (+7 more)

### Community 118 - "Community 118"
Cohesion: 0.26
Nodes (8): SyncResult, isCoupangCredentialResolutionError(), syncCoupangOrders(), syncCoupangProducts(), ChannelSyncService, errorMessage(), resultMessage(), Injectable

### Community 119 - "Finance schema"
Cohesion: 0.15
Nodes (14): Finance, GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.marginScore, GradeHistory.master, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization (+6 more)

### Community 120 - "Channels schema"
Cohesion: 0.18
Nodes (14): ChannelSkuComponent.channelSku, ChannelSkuComponent.channelSkuId, ChannelSkuComponent.createdAt, ChannelSkuComponent.createdBy, ChannelSkuComponent.id, ChannelSkuComponent.inventorySku, ChannelSkuComponent.inventorySkuId, ChannelSkuComponent.mappingSource (+6 more)

### Community 121 - "Advertising schema"
Cohesion: 0.15
Nodes (14): ExecutionTask.workerId, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentTaskRef, ExecutionWorker.currentUrl, ExecutionWorker.id, ExecutionWorker.label, ExecutionWorker.lastHeartbeatAt (+6 more)

### Community 122 - "Finance schema"
Cohesion: 0.15
Nodes (14): ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description, ManualLedger.id (+6 more)

### Community 123 - "Community 123"
Cohesion: 0.15
Nodes (11): Body, Post, MarketplaceRegistrationDto, IsOptional, IsString, IsUUID, MaxLength, Type (+3 more)

### Community 124 - "Community 124"
Cohesion: 0.15
Nodes (5): Inject, ChannelAccountRepositoryAdapter, Injectable, CoupangCredentialsPort, KEY

### Community 125 - "Core schema"
Cohesion: 0.17
Nodes (13): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+5 more)

### Community 126 - "Channels schema"
Cohesion: 0.18
Nodes (13): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson, RocketSupplyDailySnapshot.revenueKrw (+5 more)

### Community 127 - "Community 127"
Cohesion: 0.31
Nodes (11): analyzeSchemaArtifactSync(), changedFilesFromGit(), changedFilesFromWorkingTree(), GENERATED_ARTIFACT_PATHS, git(), main(), matchesAnyPath(), mergeChangedFiles() (+3 more)

### Community 128 - "Community 128"
Cohesion: 0.26
Nodes (7): ChannelSyncController, Body, Controller, CurrentOrganization, CurrentUser, Get, Post

### Community 129 - "Community 129"
Cohesion: 0.17
Nodes (5): CoupangProviderAdapter, Injectable, OrderSheetResponse, SellerProductDetailResponse, SellerProductListResponse

### Community 130 - "Core schema"
Cohesion: 0.21
Nodes (12): BundleComponent.bundleOption, BundleComponent.bundleOptionId, BundleComponent.componentOption, BundleComponent.componentOptionId, BundleComponent.createdAt, BundleComponent.id, BundleComponent.organization, BundleComponent.qty (+4 more)

### Community 131 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 132 - "Community 132"
Cohesion: 0.26
Nodes (9): DETAIL_IMAGE_COUNTS, DETAIL_PAGE_AGE_GROUPS, DETAIL_PAGE_TEMPLATE_IDS, DetailImageCount, DetailImageCountSchema, DetailPageAgeGroup, DetailPageAgeGroupSchema, DetailPageTemplateId (+1 more)

### Community 133 - "Community 133"
Cohesion: 0.18
Nodes (11): CoupangReconciliationRowDto, CoupangReconciliationScanDto, IsIn, IsOptional, IsString, MaxLength, Type, ArrayMaxSize (+3 more)

### Community 134 - "System schema"
Cohesion: 0.20
Nodes (11): ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization, ActivityEvent.source (+3 more)

### Community 135 - "System schema"
Cohesion: 0.20
Nodes (10): FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name, FeatureGate.updatedAt (+2 more)

### Community 136 - "Community 136"
Cohesion: 0.18
Nodes (9): ActionTask, ActionTaskExecuteResponse, ActionTaskList, ActionTaskListSchema, ActionTaskRelatedProduct, ActionTaskRelatedProductSchema, ActionTaskSchema, ActionTaskSourceAlert (+1 more)

### Community 137 - "Community 137"
Cohesion: 0.35
Nodes (9): analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), directOutPortFiles(), FORBIDDEN_IN_PORT_FOLDER_NAMES, forbiddenInPortCallerFolders(), listDirectories(), listFiles(), main() (+1 more)

### Community 138 - "Community 138"
Cohesion: 0.20
Nodes (9): CHANNEL_LISTING_SORTS, CHANNEL_LISTING_TABS, ChannelListingQueryDto, IsIn, IsOptional, IsString, IsUUID, MaxLength (+1 more)

### Community 139 - "Community 139"
Cohesion: 0.20
Nodes (9): CoupangReconciliationListQueryDto, RESOLUTION_SOURCES, ResolutionSourceFilter, STATUSES, StatusFilter, IsIn, IsOptional, IsString (+1 more)

### Community 140 - "Community 140"
Cohesion: 0.22
Nodes (6): ChannelListingRepositoryAdapter, parseQueryDate(), Injectable, ChannelListingGroupResult, ChannelListingListResult, ChannelListingSummary

### Community 141 - "Community 141"
Cohesion: 0.29
Nodes (7): assertToolInvocationDidNotFail(), ChannelRegistrationRuntimeHandler, coupangSubmissionInput(), optionalStringField(), registrationInput(), stringField(), Injectable

### Community 142 - "Community 142"
Cohesion: 0.20
Nodes (3): ChannelAccountRepositoryPort, Inject, Inject

### Community 143 - "Advertising schema"
Cohesion: 0.22
Nodes (10): Advertising, ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.id, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.url (+2 more)

### Community 144 - "System schema"
Cohesion: 0.24
Nodes (10): System, SystemSetting.createdAt, SystemSetting.id, SystemSetting.key, SystemSetting.organization, SystemSetting.updatedAt, SystemSetting.value, SystemSetting (+2 more)

### Community 145 - "Advertising schema"
Cohesion: 0.22
Nodes (10): ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task, ExecutionLog.taskId (+2 more)

### Community 146 - "Community 146"
Cohesion: 0.49
Nodes (6): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), scrubDeep(), scrubSecrets(), walk()

### Community 147 - "Community 147"
Cohesion: 0.38
Nodes (8): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), main(), parseBaseline(), readFiles(), repoRoot(), walk()

### Community 148 - "Community 148"
Cohesion: 0.31
Nodes (8): parseArgs(), ParsedArgs, parseRawArgs(), ParseRawArgsOptions, pushValue(), values(), COMMANDS, makeArgs()

### Community 149 - "Community 149"
Cohesion: 0.24
Nodes (10): normalizeForGroup(), applyKiditemPlan(), applySupplierMappings(), buildRawData(), buildSupplierNotes(), collectSupplierSeeds(), findImportedOption(), nextMasterCode() (+2 more)

### Community 150 - "Community 150"
Cohesion: 0.25
Nodes (6): ChannelAccountListController, Controller, CurrentOrganization, Get, ChannelAccountQueryService, Injectable

### Community 151 - "Community 151"
Cohesion: 0.25
Nodes (5): ChannelsOperationAlertAdapter, Inject, Injectable, OperationLifecyclePatch, StartOperationAlertInput

### Community 153 - "Community 153"
Cohesion: 0.22
Nodes (4): ChannelReconciliationResolutionRepositoryAdapter, Injectable, ChannelReconciliationResolutionRepositoryPort, Inject

### Community 155 - "Supply schema"
Cohesion: 0.25
Nodes (9): PurchaseOrderItem.createdAt, PurchaseOrderItem.id, PurchaseOrderItem.option, PurchaseOrderItem.order, PurchaseOrderItem.productName, PurchaseOrderItem.quantity, PurchaseOrderItem.unitPriceCny, PurchaseOrderItem (+1 more)

### Community 156 - "Community 156"
Cohesion: 0.39
Nodes (5): assertSafeChannelSkuDbPushWarnings(), main(), normalizeWarning(), UNIQUE_WARNING_SIGNATURES, warningSignatures

### Community 157 - "Community 157"
Cohesion: 0.46
Nodes (6): analyzeInventory(), listTopLevelScriptFiles(), main(), repoRoot(), SCRIPT_INVENTORY, SUPPORT_FILES

### Community 158 - "Community 158"
Cohesion: 0.29
Nodes (5): AuthRequiredErrorBody, AuthUserPublic, AuthUserPublicSchema, LoginRequest, LoginRequestSchema

### Community 159 - "Community 159"
Cohesion: 0.29
Nodes (5): ReadinessCheck, ReadinessCheckSchema, ReadinessCheckStatusSchema, ReadinessResponse, ReadinessResponseSchema

### Community 160 - "Community 160"
Cohesion: 0.33
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 161 - "Community 161"
Cohesion: 0.33
Nodes (4): SettlementReconcileDetail, SettlementReconcileDetailSchema, SettlementReconcileResponse, SettlementReconcileResponseSchema

### Community 162 - "Community 162"
Cohesion: 0.33
Nodes (6): bounded(), checkChannelSkuIdentity(), createPrisma(), main(), ReadonlyQueryClient, runChannelSkuIdentityPreflight()

### Community 163 - "prisma field: ChannelReconciliationItem.channel"
Cohesion: 0.50
Nodes (4): ChannelReconciliationItem.channel, ChannelReconciliationItem.itemKey, ChannelReconciliationItem.source, ChannelReconciliationItem unique(organizationId, channel, source, itemKey)

### Community 169 - "Community 169"
Cohesion: 0.50
Nodes (4): is_allowlisted(), is_comment_line(), load_file_lines(), check-tenant-scope.sh script

### Community 170 - "Community 170"
Cohesion: 0.67
Nodes (4): expandHome(), parseArgs(), requireExistingFile(), resolveInputPath()

### Community 171 - "Community 171"
Cohesion: 0.67
Nodes (3): extractEnvKeys(), readModelFile(), redactEnvValues()

## Knowledge Gaps
- **2005 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+2000 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Core schema` to `Community 3`, `AgentOS schema`, `Community 5`, `Community 6`, `prisma field: AdAction.externalId`, `AI schema`, `Orders schema`, `prisma field: AgentToolDefinition.isActive`, `Channels schema`, `Community 13`, `Orders schema`, `Community 15`, `Inventory schema`, `AgentOS schema`, `AI schema`, `AgentOS schema`, `Supply schema`, `AI schema`, `AI schema`, `Core schema`, `AI schema`, `System schema`, `Core schema`, `Channels schema`, `Sourcing schema`, `Core schema`, `AI schema`, `Community 36`, `Sourcing schema`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `Inventory schema`, `Orders schema`, `AI schema`, `Inventory schema`, `AgentOS schema`, `AI schema`, `AgentOS schema`, `System schema`, `Channels schema`, `Channels schema`, `AI schema`, `AgentOS schema`, `Channels schema`, `Core schema`, `Supply schema`, `Inventory schema`, `Inventory schema`, `AgentOS schema`, `Channels schema`, `Advertising schema`, `Core schema`, `Orders schema`, `AgentOS schema`, `System schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `Core schema`, `Core schema`, `Finance schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Inventory schema`, `Channels schema`, `Core schema`, `Core schema`, `Inventory schema`, `AgentOS schema`, `Supply schema`, `Orders schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `Orders schema`, `Finance schema`, `Channels schema`, `Advertising schema`, `Finance schema`, `Core schema`, `Channels schema`, `Core schema`, `System schema`, `System schema`, `Advertising schema`, `System schema`, `Community 156`, `prisma field: Organization.id`?**
  _High betweenness centrality (0.278) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `AgentOS schema` to `Core schema`, `prisma field: AdAction.externalId`, `AI schema`, `Orders schema`, `prisma field: AgentToolDefinition.isActive`, `Channels schema`, `Orders schema`, `Inventory schema`, `AgentOS schema`, `AI schema`, `prisma field: index.ts`, `AgentOS schema`, `Supply schema`, `AI schema`, `AI schema`, `Core schema`, `AI schema`, `System schema`, `Core schema`, `Channels schema`, `Sourcing schema`, `Core schema`, `AI schema`, `Sourcing schema`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `Inventory schema`, `Orders schema`, `AI schema`, `Inventory schema`, `AgentOS schema`, `AI schema`, `AgentOS schema`, `System schema`, `Channels schema`, `Channels schema`, `AI schema`, `AgentOS schema`, `System schema`, `Channels schema`, `Core schema`, `Supply schema`, `Inventory schema`, `Inventory schema`, `AgentOS schema`, `Channels schema`, `Advertising schema`, `Core schema`, `Orders schema`, `AgentOS schema`, `System schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `Core schema`, `Core schema`, `Finance schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Inventory schema`, `Channels schema`, `Core schema`, `Core schema`, `Inventory schema`, `AgentOS schema`, `Advertising schema`, `Supply schema`, `Orders schema`, `System schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `Orders schema`, `Finance schema`, `Channels schema`, `Advertising schema`, `Finance schema`, `Core schema`, `Channels schema`, `Core schema`, `System schema`, `System schema`, `System schema`, `Advertising schema`, `System schema`, `Advertising schema`, `Supply schema`?**
  _High betweenness centrality (0.202) - this node is a cross-community bridge._
- **Why does `Order` connect `Orders schema` to `Core schema`, `AgentOS schema`, `Community 5`, `Community 6`, `Community 7`, `prisma field: AdAction.externalId`, `Community 137`, `Orders schema`, `prisma field: AgentToolDefinition.isActive`, `Community 13`, `Community 16`, `prisma field: index.ts`, `System schema`, `Core schema`, `Community 36`, `Inventory schema`, `Orders schema`, `System schema`, `Community 63`, `Orders schema`, `Community 77`, `Community 105`, `Orders schema`, `Orders schema`, `Community 127`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Are the 112 inferred relationships involving `Organization` (e.g. with `channel-registration-capability.adapter.ts` and `channel-registration-capability.adapter.spec.ts`) actually correct?**
  _`Organization` has 112 INFERRED edges - model-reasoned connections that need verification._
- **Are the 75 inferred relationships involving `Order` (e.g. with `channel-sync.controller.ts` and `index.ts`) actually correct?**
  _`Order` has 75 INFERRED edges - model-reasoned connections that need verification._
- **Are the 46 inferred relationships involving `ChannelListing` (e.g. with `channel-registration-capability.adapter.ts` and `channel-registration-capability.adapter.spec.ts`) actually correct?**
  _`ChannelListing` has 46 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason` to the rest of the system?**
  _2006 weakly-connected nodes found - possible documentation gaps or missing edges._