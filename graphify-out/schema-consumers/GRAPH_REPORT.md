# Graph Report - schema-consumers  (2026-07-14)

## Corpus Check
- 261 files · ~117,691 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4551 nodes · 20426 edges · 202 communities (192 shown, 10 thin omitted)
- Extraction: 39% EXTRACTED · 61% INFERRED · 0% AMBIGUOUS · INFERRED: 12439 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Core schema
- Community 1
- Community 2
- Community 3
- prisma field: externalOptionId canonical option identity
- Orders schema
- Orders schema
- Community 7
- AI schema
- Community 9
- Community 10
- Channels schema
- prisma field: AdAction.externalId
- Community 13
- Supply schema
- Community 15
- Community 16
- Community 17
- Community 18
- Core schema
- Community 20
- Inventory schema
- Community 22
- Core schema
- AgentOS schema
- Community 25
- Community 26
- AgentOS schema
- AI schema
- Supply schema
- Community 30
- AI schema
- prisma field: index.ts
- AI schema
- AI schema
- Core schema
- Community 36
- Community 37
- Core schema
- Channels schema
- Core schema
- Orders schema
- AgentOS schema
- AI schema
- Community 44
- Community 45
- AgentOS schema
- Sourcing schema
- Inventory schema
- Community 49
- Sourcing schema
- Community 51
- prisma field: StockTransaction.warehouseId
- Community 53
- System schema
- AgentOS schema
- AgentOS schema
- AgentOS schema
- Inventory schema
- Community 59
- System schema
- Channels schema
- AI schema
- Channels schema
- AI schema
- Channels schema
- Advertising schema
- AgentOS schema
- AgentOS schema
- Channels schema
- Channels schema
- Inventory schema
- Inventory schema
- Community 73
- System schema
- Channels schema
- Inventory schema
- Community 77
- Community 78
- Advertising schema
- AgentOS schema
- AgentOS schema
- System schema
- Channels schema
- Channels schema
- Sourcing schema
- Orders schema
- Sourcing schema
- AgentOS schema
- Core schema
- Finance schema
- Sourcing schema
- AI schema
- AI schema
- Community 94
- Community 95
- Community 96
- AgentOS schema
- Channels schema
- Community 99
- Community 100
- Community 101
- Community 102
- AI schema
- Channels schema
- Sourcing schema
- Sourcing schema
- Inventory schema
- Channels schema
- Community 109
- Community 110
- Community 111
- Community 112
- prisma field: ActionTask.targetId
- AgentOS schema
- Channels schema
- Community 116
- System schema
- Sourcing schema
- Finance schema
- Finance schema
- Inventory schema
- Inventory schema
- Inventory schema
- Finance schema
- Advertising schema
- Finance schema
- Channels schema
- Core schema
- Channels schema
- Community 130
- Sourcing schema
- Channels schema
- System schema
- Community 134
- System schema
- Core schema
- System schema
- Community 138
- Community 139
- Community 140
- Advertising schema
- System schema
- Community 143
- Community 144
- Community 145
- Community 146
- Channels schema
- Community 148
- Community 149
- Community 150
- Community 151
- Community 152
- Community 153
- Community 154
- Community 155
- prisma field: ChannelReconciliationItem.channel
- Community 157
- Community 158
- Community 159
- Community 160
- Community 161
- Community 162
- Community 163
- prisma field: ChannelReconciliationItem.id
- prisma field: Organization.id
- Community 166
- Community 167

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 371 edges
2. `Organization` - 333 edges
3. `prisma — Shared Schema` - 152 edges
4. `Order` - 122 edges
5. `User` - 102 edges
6. `ProductOption` - 100 edges
7. `MasterProduct` - 99 edges
8. `ChannelListing` - 99 edges
9. `ContentWorkspace.organizationId` - 93 edges
10. `ProductPreparation.organizationId` - 92 edges
11. `ProductOption.organizationId` - 92 edges
12. `Order.organizationId` - 92 edges

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

## Communities (202 total, 10 thin omitted)

### Community 0 - "Core schema"
Cohesion: 0.29
Nodes (149): ConfirmedListingRegistrationInput, ConfirmedListingRegistrationOutput, ConfirmedListingRegistrationOutputSchema, CoupangListingSubmissionInput, CoupangListingSubmissionOutput, CoupangListingSubmissionOutputSchema, NonEmptyRecordSchema, USER (+141 more)

### Community 1 - "Community 1"
Cohesion: 0.02
Nodes (101): AgentApprovalRequestSummary, AgentApprovalRequestSummarySchema, AgentApprovalStatus, AgentApprovalStatusSchema, AgentArtifactHandoffSummary, AgentArtifactHandoffSummarySchema, AgentArtifactStatus, AgentArtifactStatusSchema (+93 more)

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (76): AdjustStockInput, AdjustStockInputSchema, Inventory, InventoryAssetGradeSummary, InventoryAssetGradeSummarySchema, InventoryAssetItem, InventoryAssetItemSchema, InventoryAssetReport (+68 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (71): AdapterCommand, appendFlag(), appendOption(), appendProjectReferenceDefaults(), appendValues(), archiveFileName(), archiveShaFileName(), Args (+63 more)

### Community 4 - "prisma field: externalOptionId canonical option identity"
Cohesion: 0.14
Nodes (60): ListingForProductSync, ListingOptionRow, ListingRow, MasterProductRow, ProductOptionRow, ReconciliationItemRow, ReconciliationRunRow, externalOptionId canonical option identity (+52 more)

### Community 5 - "Orders schema"
Cohesion: 0.04
Nodes (59): formatKstIso(), normalizeCoupangProductStatus(), CSRecord.orderId, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId (+51 more)

### Community 6 - "Orders schema"
Cohesion: 0.03
Nodes (62): Orders, ChannelListing.channel, ChannelListing.channelAccount, ChannelListing.channelAccountId, ChannelListing.channelName, ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt (+54 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (59): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot, AdCampaignSnapshotSchema (+51 more)

### Community 8 - "AI schema"
Cohesion: 0.04
Nodes (60): channels — Marketplace Sync + Reconciliation, packages/shared — @kiditem/shared, AI, Inventory, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.createdAt, ThumbnailGeneration.deletedAt (+52 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (55): ComplianceScores, ComplianceScoresSchema, COUPANG_IMAGE_SYNC_ROW_SOURCES, CoupangImageSyncCapabilities, CoupangImageSyncCapabilitiesSchema, CoupangImageSyncRow, CoupangImageSyncRowSchema, CoupangImageSyncRowSource (+47 more)

### Community 10 - "Community 10"
Cohesion: 0.07
Nodes (25): DATA_MIGRATION_RELEASES, DataMigration, backfillSourcingCandidatesFromMasterProducts, isLegacyDetailEditorHref(), rewriteLegacyDetailEditorAlertHrefs, rewriteLegacyDetailEditorHref(), relabelImageEditAgentInstancesToGeminiImage, backfillContentArchiveClassification (+17 more)

### Community 11 - "Channels schema"
Cohesion: 0.04
Nodes (55): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+47 more)

### Community 12 - "prisma field: AdAction.externalId"
Cohesion: 0.22
Nodes (36): CHANNELS_CAPABILITIES, ChannelsCapabilityKey, AdAction.externalId, AdAction.listingId, ChannelAdTargetDailySnapshot.externalId, ChannelAdTargetDailySnapshot.listingId, ChannelListing.externalId, ChannelListing.masterId (+28 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (49): apiHeaders(), apiUrl(), Args, assertSafeDatasetId(), buildCoupangImageSyncRowsForListings(), BundleManifest, BundlePayload, BundleReference (+41 more)

### Community 14 - "Supply schema"
Cohesion: 0.05
Nodes (50): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.id, MasterSupplierProduct.isPrimary, MasterSupplierProduct.master, MasterSupplierProduct.memo, MasterSupplierProduct.minOrderQty, MasterSupplierProduct.supplier (+42 more)

### Community 15 - "Community 15"
Cohesion: 0.10
Nodes (48): assertNonProductionTarget(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged(), assertSha256(), BaselineManifest, BaselineManifestExpectation, baselineObjectKeys, buildChecksumsFile() (+40 more)

### Community 16 - "Community 16"
Cohesion: 0.08
Nodes (45): applyCacheControl(), ApplyResult, applyS3CacheControl(), applySupabaseCacheControl(), assertApplyAllowed(), buildCopyObjectInput(), CliArgs, CliConfig (+37 more)

### Community 17 - "Community 17"
Cohesion: 0.06
Nodes (24): ChannelReconciliationController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+16 more)

### Community 18 - "Community 18"
Cohesion: 0.05
Nodes (42): CHANNEL_LISTING_SORTS, CHANNEL_LISTING_TABS, IsOptional, IsString, UpdateCoupangAccountSettingsDto, MarketplaceRegistrationDto, IsOptional, IsString (+34 more)

### Community 19 - "Core schema"
Cohesion: 0.06
Nodes (34): Inject, ChannelAccountRepositoryAdapter, envelopeToJson(), maskAccessKey(), readCredentialsConfig(), stripLegacyCredentialKeys(), toJsonRecord(), toRecord() (+26 more)

### Community 20 - "Community 20"
Cohesion: 0.09
Nodes (44): makeFakePrisma(), clean(), HardConflict, KiditemPlan, masterImportKey(), NAME_FIELDS, normalizeForGroup(), planKiditemImport() (+36 more)

### Community 21 - "Inventory schema"
Cohesion: 0.05
Nodes (47): StockTransaction.createdAt, StockTransaction.createdBy, StockTransaction.id, StockTransaction.note, StockTransaction.option, StockTransaction.optionName, StockTransaction.organization, StockTransaction.quantity (+39 more)

### Community 22 - "Community 22"
Cohesion: 0.05
Nodes (43): PRODUCT_LIFECYCLE_STATES, ProductLifecycleState, ProductLifecycleStateSchema, BundleComponent, BundleComponentSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, Master (+35 more)

### Community 23 - "Core schema"
Cohesion: 0.06
Nodes (44): Core, BundleComponent.bundleOption, BundleComponent.bundleOptionId, BundleComponent.componentOption, BundleComponent.componentOptionId, BundleComponent.createdAt, BundleComponent.id, BundleComponent.organization (+36 more)

### Community 24 - "AgentOS schema"
Cohesion: 0.05
Nodes (44): AgentRunRequest.agentInstance, AgentRunRequest.agentInstanceId, AgentRunRequest.attempts, AgentRunRequest.claimedAt, AgentRunRequest.claimedBy, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.coalescedIntoRequestId, AgentRunRequest.conversation (+36 more)

### Community 25 - "Community 25"
Cohesion: 0.05
Nodes (33): CoupangAccountSettings, CoupangAccountSettingsSchema, UpdateCoupangAccountSettings, UpdateCoupangAccountSettingsSchema, ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow, ProductRankingRowSchema (+25 more)

### Community 26 - "Community 26"
Cohesion: 0.06
Nodes (26): ChannelListingController, Body, Controller, CurrentOrganization, Get, Param, Post, Query (+18 more)

### Community 27 - "AgentOS schema"
Cohesion: 0.05
Nodes (42): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+34 more)

### Community 28 - "AI schema"
Cohesion: 0.05
Nodes (42): ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.editedHtmlSavedAt, ContentGeneration.errorMessage (+34 more)

### Community 29 - "Supply schema"
Cohesion: 0.05
Nodes (41): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+33 more)

### Community 30 - "Community 30"
Cohesion: 0.05
Nodes (39): AdMetricsDetail, AdMetricsDetailSchema, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary, DashboardAdSummarySchema (+31 more)

### Community 31 - "AI schema"
Cohesion: 0.06
Nodes (40): ContentGeneration.detailPageArtifactId, ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.createdByUserId, DetailPageArtifact.currentRevision, DetailPageArtifact.currentRevisionId (+32 more)

### Community 32 - "prisma field: index.ts"
Cohesion: 0.09
Nodes (29): ChannelsProductMasterBarcodeAdapter, Inject, Injectable, ChannelReconciliationMatcherRepositoryAdapter, Injectable, MarketplaceRegistrationRepositoryAdapter, Injectable, ChannelRegistrationRuntimeHandler (+21 more)

### Community 33 - "AI schema"
Cohesion: 0.06
Nodes (39): ProductPreparation.selectedThumbnailGenerationCandidateId, ThumbnailGenerationCandidate.createdAt, ThumbnailGenerationCandidate.filename, ThumbnailGenerationCandidate.fileSize, ThumbnailGenerationCandidate.generation, ThumbnailGenerationCandidate.generationId, ThumbnailGenerationCandidate.height, ThumbnailGenerationCandidate.id (+31 more)

### Community 34 - "AI schema"
Cohesion: 0.06
Nodes (38): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+30 more)

### Community 35 - "Core schema"
Cohesion: 0.06
Nodes (37): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.adTier, MasterProduct.brand, MasterProduct.category, MasterProduct.code, MasterProduct.costCny, MasterProduct.createdAt (+29 more)

### Community 36 - "Community 36"
Cohesion: 0.08
Nodes (17): ChannelReconciliationScanRepositoryAdapter, Inject, Injectable, ChannelListingHandle, ChannelListingOptionHandle, ChannelReconciliationMatcherPort, ChannelReconciliationScanRepositoryPort, MatchOutcome (+9 more)

### Community 37 - "Community 37"
Cohesion: 0.12
Nodes (34): DATA_MIGRATION_IDS, dataMigrations, MigrationResult, appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertMutatingTarget(), CliArgs, Command (+26 more)

### Community 38 - "Core schema"
Cohesion: 0.07
Nodes (35): AgentRunRequest.requestedByUserId, ContentGeneration.triggeredByUserId, OrganizationMembership.createdAt, OrganizationMembership.id, OrganizationMembership.invitedBy, OrganizationMembership.invitedById, OrganizationMembership.joinedAt, OrganizationMembership.lastSelectedAt (+27 more)

### Community 39 - "Channels schema"
Cohesion: 0.06
Nodes (35): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel, ChannelAdTargetDailySnapshot.clicks (+27 more)

### Community 40 - "Core schema"
Cohesion: 0.07
Nodes (35): ChannelAdTargetDailySnapshot.listingOptionId, ChannelListingOption.createdAt, ChannelListingOption.id, ChannelListingOption.itemName, ChannelListingOption.listing, ChannelListingOption.option, ChannelListingOption.organization, ChannelListingOption.salePrice (+27 more)

### Community 41 - "Orders schema"
Cohesion: 0.07
Nodes (35): OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.id, OrderReturn.metadata, OrderReturn.order (+27 more)

### Community 42 - "AgentOS schema"
Cohesion: 0.06
Nodes (34): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+26 more)

### Community 43 - "AI schema"
Cohesion: 0.07
Nodes (34): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.generationGroup (+26 more)

### Community 44 - "Community 44"
Cohesion: 0.07
Nodes (31): DeliveryCompany, DeliveryCompanySchema, Order, OrderActionResponse, OrderActionResponseSchema, OrderLineItem, OrderLineItemSchema, OrderListItem (+23 more)

### Community 45 - "Community 45"
Cohesion: 0.10
Nodes (17): ChannelSyncController, Body, Controller, CurrentOrganization, CurrentUser, Get, Post, CoupangSyncOrderPayload (+9 more)

### Community 46 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.startedAt, WorkflowRun.status (+25 more)

### Community 47 - "Sourcing schema"
Cohesion: 0.07
Nodes (29): ContentGeneration.sourceCandidateId, SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.id, SourcingCandidate.imageUrl (+21 more)

### Community 48 - "Inventory schema"
Cohesion: 0.06
Nodes (33): SellpiaStockSnapshotItem.appliedTransactionId, SellpiaStockSnapshotItem.blockingReasons, SellpiaStockSnapshotItem.createdAt, SellpiaStockSnapshotItem.diff, SellpiaStockSnapshotItem.diffRate, SellpiaStockSnapshotItem.id, SellpiaStockSnapshotItem.inventory, SellpiaStockSnapshotItem.kiditemStockAtApply (+25 more)

### Community 49 - "Community 49"
Cohesion: 0.08
Nodes (21): ChannelRegistrationCapabilityAdapter, ConfirmedListingRegistrationInputSchema, CoupangListingSubmissionInputSchema, normalizeForHash(), stableHash(), Injectable, ChannelsMarketplaceRegistrationCapabilityPort, RegisterConfirmedMarketplaceListingCapabilityInput (+13 more)

### Community 50 - "Sourcing schema"
Cohesion: 0.07
Nodes (31): CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id, CandidateImage.isPrimary (+23 more)

### Community 51 - "Community 51"
Cohesion: 0.07
Nodes (11): ChannelsProductMasterBarcodePort, CoupangProviderPort, MarketplaceRegistrationRepositoryPort, ChannelSyncRepositoryPort, OrderSyncDeps, syncCoupangOrders(), ProductSyncDeps, Inject (+3 more)

### Community 52 - "prisma field: StockTransaction.warehouseId"
Cohesion: 0.19
Nodes (25): StockTransaction.warehouseId, Path, add_code_reference_edges(), add_document_mentions(), add_schema_graph(), camel(), collect_block(), collect_code() (+17 more)

### Community 53 - "Community 53"
Cohesion: 0.07
Nodes (28): ReconciliationChannel, ReconciliationChannelSchema, ReconciliationIgnoreRequest, ReconciliationIgnoreRequestSchema, ReconciliationItem, ReconciliationItemListResponse, ReconciliationItemListResponseSchema, ReconciliationItemSchema (+20 more)

### Community 54 - "System schema"
Cohesion: 0.07
Nodes (24): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon, Marketplace.id (+16 more)

### Community 55 - "AgentOS schema"
Cohesion: 0.08
Nodes (29): AgentOS, AgentAuthorizationEvent.toolId, AgentInstanceToolPolicy.agentInstance, AgentInstanceToolPolicy.agentInstanceId, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentInstanceToolPolicy.dryRunMode (+21 more)

### Community 56 - "AgentOS schema"
Cohesion: 0.07
Nodes (29): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.agentInstanceId, AgentApprovalRequest.approver, AgentApprovalRequest.approverUserId, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy (+21 more)

### Community 57 - "AgentOS schema"
Cohesion: 0.08
Nodes (29): AgentToolInvocation.agentInstance, AgentToolInvocation.agentInstanceId, AgentToolInvocation.approvalRequest, AgentToolInvocation.approvalRequestId, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt (+21 more)

### Community 58 - "Inventory schema"
Cohesion: 0.08
Nodes (29): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.option, PickingItem.pickedAt, PickingItem.pickingList (+21 more)

### Community 59 - "Community 59"
Cohesion: 0.14
Nodes (27): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+19 more)

### Community 60 - "System schema"
Cohesion: 0.08
Nodes (26): Alert.actionTask, Alert.actorUser, Alert.actorUserId, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead (+18 more)

### Community 61 - "Channels schema"
Cohesion: 0.07
Nodes (27): ChannelReconciliationItem.channelImageUrl, ChannelReconciliationItem.channelOptionName, ChannelReconciliationItem.channelProductName, ChannelReconciliationItem.channelStatus, ChannelReconciliationItem.channelUrl, ChannelReconciliationItem.confidence, ChannelReconciliationItem.conflictJson, ChannelReconciliationItem.createdAt (+19 more)

### Community 62 - "AI schema"
Cohesion: 0.09
Nodes (27): ContentGeneration.contentWorkspaceId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.createdByUserId, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageArtifactId, ContentWorkspace.currentDetailPageRevision, ContentWorkspace.deletedAt (+19 more)

### Community 63 - "Channels schema"
Cohesion: 0.08
Nodes (27): CoupangWingSalesRankDailySnapshot.businessDate, CoupangWingSalesRankDailySnapshot.capturedAt, CoupangWingSalesRankDailySnapshot.categoryHierarchy, CoupangWingSalesRankDailySnapshot.collectedCount, CoupangWingSalesRankDailySnapshot.conversionRate28d, CoupangWingSalesRankDailySnapshot.createdAt, CoupangWingSalesRankDailySnapshot.id, CoupangWingSalesRankDailySnapshot.itemId (+19 more)

### Community 64 - "AI schema"
Cohesion: 0.08
Nodes (27): ProductPreparation.appliedToMasterAt, ProductPreparation.contentWorkspace, ProductPreparation.createdAt, ProductPreparation.createdByUser, ProductPreparation.deletedAt, ProductPreparation.displayName, ProductPreparation.id, ProductPreparation.isCurrentForMaster (+19 more)

### Community 65 - "Channels schema"
Cohesion: 0.08
Nodes (26): ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isOfferWinner, ChannelListingOptionDailySnapshot.lastObservedAt, ChannelListingOptionDailySnapshot.listing (+18 more)

### Community 66 - "Advertising schema"
Cohesion: 0.09
Nodes (26): ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task, ExecutionLog.taskId (+18 more)

### Community 67 - "AgentOS schema"
Cohesion: 0.08
Nodes (25): AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.agentInstanceId, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy, AgentAuthorizationEvent.decidedByUserId (+17 more)

### Community 68 - "AgentOS schema"
Cohesion: 0.09
Nodes (25): AgentInstance.adapterConfig, AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.icon, AgentInstance.id, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name (+17 more)

### Community 69 - "Channels schema"
Cohesion: 0.10
Nodes (24): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType, ChannelAccountDailyKpiSnapshot.lastObservedAt, ChannelAccountDailyKpiSnapshot.normalizedJson (+16 more)

### Community 70 - "Channels schema"
Cohesion: 0.08
Nodes (25): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.id, ChannelScrapeRun.matchedCount (+17 more)

### Community 71 - "Inventory schema"
Cohesion: 0.09
Nodes (25): RocketInventoryLedger.createdAt, RocketInventoryLedger.createdBy, RocketInventoryLedger.eventType, RocketInventoryLedger.id, RocketInventoryLedger.inventory, RocketInventoryLedger.inventoryId, RocketInventoryLedger.metaJson, RocketInventoryLedger.note (+17 more)

### Community 72 - "Inventory schema"
Cohesion: 0.08
Nodes (25): SellpiaNewProductCandidate.createdAt, SellpiaNewProductCandidate.createdInventory, SellpiaNewProductCandidate.id, SellpiaNewProductCandidate.initialReceiveTransactionId, SellpiaNewProductCandidate.modelName, SellpiaNewProductCandidate.note, SellpiaNewProductCandidate.operatorInitialStock, SellpiaNewProductCandidate.organization (+17 more)

### Community 73 - "Community 73"
Cohesion: 0.08
Nodes (22): StatisticsCategoryRow, StatisticsCategoryRowSchema, StatisticsDeliveryDaily, StatisticsDeliveryDailySchema, StatisticsDeliveryResponse, StatisticsDeliveryResponseSchema, StatisticsGradeRow, StatisticsGradeRowSchema (+14 more)

### Community 74 - "System schema"
Cohesion: 0.10
Nodes (23): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.href (+15 more)

### Community 75 - "Channels schema"
Cohesion: 0.09
Nodes (22): ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.id, ChannelScrapeSnapshot.listing, ChannelScrapeSnapshot.listingOption (+14 more)

### Community 76 - "Inventory schema"
Cohesion: 0.09
Nodes (19): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.id, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.option, Inventory.organization (+11 more)

### Community 77 - "Community 77"
Cohesion: 0.22
Nodes (8): ChannelDashboardController, Controller, CurrentOrganization, Get, Query, CoupangDateRangeQueryDto, ChannelDashboardService, Injectable

### Community 78 - "Community 78"
Cohesion: 0.10
Nodes (9): ChannelReconciliationQueryRepositoryAdapter, collectIds(), Injectable, ChannelReconciliationResolutionRepositoryAdapter, Inject, Injectable, ChannelReconciliationQueryRepositoryPort, ChannelReconciliationResolutionRepositoryPort (+1 more)

### Community 79 - "Advertising schema"
Cohesion: 0.10
Nodes (22): AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+14 more)

### Community 80 - "AgentOS schema"
Cohesion: 0.10
Nodes (22): AgentArtifact.agentInstance, AgentArtifact.agentInstanceId, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization (+14 more)

### Community 81 - "AgentOS schema"
Cohesion: 0.10
Nodes (21): AgentCostEvent.agentInstance, AgentCostEvent.agentInstanceId, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id (+13 more)

### Community 82 - "System schema"
Cohesion: 0.10
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+13 more)

### Community 83 - "Channels schema"
Cohesion: 0.10
Nodes (21): ChannelReconciliationItem.lastSeenRunId, ChannelReconciliationRun.alreadyLinkedCount, ChannelReconciliationRun.autoLinkedCount, ChannelReconciliationRun.channel, ChannelReconciliationRun.conflictCount, ChannelReconciliationRun.createdAt, ChannelReconciliationRun.errorCount, ChannelReconciliationRun.errorJson (+13 more)

### Community 84 - "Channels schema"
Cohesion: 0.11
Nodes (21): CoupangKeywordRankDailySnapshot.adRank, CoupangKeywordRankDailySnapshot.businessDate, CoupangKeywordRankDailySnapshot.capturedAt, CoupangKeywordRankDailySnapshot.createdAt, CoupangKeywordRankDailySnapshot.id, CoupangKeywordRankDailySnapshot.itemId, CoupangKeywordRankDailySnapshot.keyword, CoupangKeywordRankDailySnapshot.organicRank (+13 more)

### Community 85 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): LiveCommerceBroadcastDailySnapshot.broadcasterId, LiveCommerceBroadcastDailySnapshot.broadcasterName, LiveCommerceBroadcastDailySnapshot.broadcastId, LiveCommerceBroadcastDailySnapshot.businessDate, LiveCommerceBroadcastDailySnapshot.capturedAt, LiveCommerceBroadcastDailySnapshot.coverImageUrl, LiveCommerceBroadcastDailySnapshot.createdAt, LiveCommerceBroadcastDailySnapshot.endedAt (+13 more)

### Community 86 - "Orders schema"
Cohesion: 0.10
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 87 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): ShortsTrendDailySnapshot.businessDate, ShortsTrendDailySnapshot.capturedAt, ShortsTrendDailySnapshot.channelName, ShortsTrendDailySnapshot.commentCount, ShortsTrendDailySnapshot.createdAt, ShortsTrendDailySnapshot.id, ShortsTrendDailySnapshot.keyword, ShortsTrendDailySnapshot.likeCount (+13 more)

### Community 88 - "AgentOS schema"
Cohesion: 0.12
Nodes (20): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.agentInstanceId, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError (+12 more)

### Community 89 - "Core schema"
Cohesion: 0.11
Nodes (20): MasterProductImage.createdAt, MasterProductImage.deletedAt, MasterProductImage.fileSize, MasterProductImage.height, MasterProductImage.id, MasterProductImage.isPrimary, MasterProductImage.label, MasterProductImage.master (+12 more)

### Community 90 - "Finance schema"
Cohesion: 0.12
Nodes (20): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit (+12 more)

### Community 91 - "Sourcing schema"
Cohesion: 0.12
Nodes (20): Sourcing1688HotProductDailySnapshot.businessDate, Sourcing1688HotProductDailySnapshot.capturedAt, Sourcing1688HotProductDailySnapshot.createdAt, Sourcing1688HotProductDailySnapshot.id, Sourcing1688HotProductDailySnapshot.imageUrl, Sourcing1688HotProductDailySnapshot.monthlySales, Sourcing1688HotProductDailySnapshot.offerId, Sourcing1688HotProductDailySnapshot.organization (+12 more)

### Community 92 - "AI schema"
Cohesion: 0.11
Nodes (18): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt (+10 more)

### Community 93 - "AI schema"
Cohesion: 0.11
Nodes (20): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id, ThumbnailAnalysis.imageSpec, ThumbnailAnalysis.imageUrl (+12 more)

### Community 94 - "Community 94"
Cohesion: 0.11
Nodes (17): PANEL_RUN_SOURCES, PanelRunSource, PanelRunSourceSchema, sourceKeys, PANEL_ITEM_KINDS, PanelAlertItem, PanelDismissEventSchema, PanelEvent (+9 more)

### Community 95 - "Community 95"
Cohesion: 0.10
Nodes (18): SupplierHistoryItem, SupplierHistoryItemSchema, SupplierHistoryReport, SupplierHistoryReportSchema, SupplierHistorySummary, SupplierHistorySummarySchema, SupplierProductSalesReport, SupplierProductSalesReportSchema (+10 more)

### Community 96 - "Community 96"
Cohesion: 0.11
Nodes (9): ChannelAccountListController, Controller, CurrentOrganization, Get, ChannelAccountRepositoryPort, ChannelAccountQueryService, Inject, Injectable (+1 more)

### Community 97 - "AgentOS schema"
Cohesion: 0.11
Nodes (19): AgentRuntimeState.agentInstance, AgentRuntimeState.agentInstanceId, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.id, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun (+11 more)

### Community 98 - "Channels schema"
Cohesion: 0.12
Nodes (19): CoupangWingTrackedProductDailySnapshot.businessDate, CoupangWingTrackedProductDailySnapshot.capturedAt, CoupangWingTrackedProductDailySnapshot.conversionRate28d, CoupangWingTrackedProductDailySnapshot.createdAt, CoupangWingTrackedProductDailySnapshot.estimatedRevenue28d, CoupangWingTrackedProductDailySnapshot.id, CoupangWingTrackedProductDailySnapshot.organization, CoupangWingTrackedProductDailySnapshot.pvLast28Day (+11 more)

### Community 99 - "Community 99"
Cohesion: 0.23
Nodes (13): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), scrubDeep(), scrubSecrets(), walk(), checkClaudeShims(), checkTrackedClaudeDirectory() (+5 more)

### Community 100 - "Community 100"
Cohesion: 0.22
Nodes (17): analyzePrReleaseContract(), changedFilesFromGit(), classifyFiles(), compareSemver(), ghPrBody(), git(), hasReleaseDecision(), isDevelopToMainPromotion() (+9 more)

### Community 101 - "Community 101"
Cohesion: 0.13
Nodes (11): ChannelAccountController, Body, Controller, CurrentOrganization, Get, CoupangCredentials, HealthResult, ChannelAccountService (+3 more)

### Community 102 - "Community 102"
Cohesion: 0.11
Nodes (4): ChannelDashboardRepositoryAdapter, Injectable, ChannelDashboardRepositoryPort, Inject

### Community 103 - "AI schema"
Cohesion: 0.12
Nodes (18): ContentAsset.generationGroupId, ContentGeneration.generationGroupId, ContentGenerationGroup.baseContentGeneration, ContentGenerationGroup.baseContentGenerationId, ContentGenerationGroup.createdAt, ContentGenerationGroup.createdByUserId, ContentGenerationGroup.groupType, ContentGenerationGroup.id (+10 more)

### Community 104 - "Channels schema"
Cohesion: 0.12
Nodes (18): CoupangProductListing.bundleOptionId, CoupangProductListing.category, CoupangProductListing.createdAt, CoupangProductListing.id, CoupangProductListing.matchedOptionId, CoupangProductListing.matchStatus, CoupangProductListing.normalizedName, CoupangProductListing.organization (+10 more)

### Community 105 - "Sourcing schema"
Cohesion: 0.14
Nodes (18): LiveCommerceProductDailySnapshot.broadcastId, LiveCommerceProductDailySnapshot.businessDate, LiveCommerceProductDailySnapshot.capturedAt, LiveCommerceProductDailySnapshot.createdAt, LiveCommerceProductDailySnapshot.id, LiveCommerceProductDailySnapshot.imageUrl, LiveCommerceProductDailySnapshot.organization, LiveCommerceProductDailySnapshot.priceCny (+10 more)

### Community 106 - "Sourcing schema"
Cohesion: 0.13
Nodes (18): NaverKeywordDailySnapshot.averageAdRank, NaverKeywordDailySnapshot.businessDate, NaverKeywordDailySnapshot.capturedAt, NaverKeywordDailySnapshot.competitionIndex, NaverKeywordDailySnapshot.createdAt, NaverKeywordDailySnapshot.id, NaverKeywordDailySnapshot.keyword, NaverKeywordDailySnapshot.monthlyMobileSearchCount (+10 more)

### Community 107 - "Inventory schema"
Cohesion: 0.12
Nodes (18): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.notes, ReturnTransfer.option, ReturnTransfer.optionName (+10 more)

### Community 108 - "Channels schema"
Cohesion: 0.12
Nodes (18): RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt, RocketPurchaseOrder.firstSkuName, RocketPurchaseOrder.id, RocketPurchaseOrder.items, RocketPurchaseOrder.orderAmount, RocketPurchaseOrder.orderedAt (+10 more)

### Community 109 - "Community 109"
Cohesion: 0.11
Nodes (16): ALERT_KINDS, ALERT_OPERATION_LIFECYCLE_STATUSES, ALERT_SEVERITIES, ALERT_STATUSES, AlertItem, AlertItemSchema, AlertKind, AlertOperationLifecycleStatus (+8 more)

### Community 110 - "Community 110"
Cohesion: 0.11
Nodes (16): CANCEL_OPERATION_TARGET_TYPES, CancelOperationAffected, CancelOperationAffectedSchema, CancelOperationPreserved, CancelOperationPreservedSchema, CancelOperationResponse, CancelOperationResponseSchema, CancelOperationStatus (+8 more)

### Community 111 - "Community 111"
Cohesion: 0.25
Nodes (12): CoupangCredentials, coupangRequest(), CoupangRequestOptions, generateAuthorization(), approveReturn(), confirmOrderSheets(), DELIVERY_COMPANIES, getOrderSheets() (+4 more)

### Community 112 - "Community 112"
Cohesion: 0.12
Nodes (9): CoupangProviderAdapter, Injectable, SubmitCoupangMarketplaceListingCapabilityInput, CoupangCreateSellerProductResponse, CoupangSellerProductPayload, OrderSheetResponse, SellerProductDetailResponse, SellerProductListResponse (+1 more)

### Community 113 - "prisma field: ActionTask.targetId"
Cohesion: 0.24
Nodes (11): ActionTask.targetId, ActionTask.targetType, AdAction.targetType, AgentArtifact.targetId, Alert.actionTaskId, Alert.targetId, Alert.targetType, ChannelAdTargetDailySnapshot.targetType (+3 more)

### Community 114 - "AgentOS schema"
Cohesion: 0.14
Nodes (17): AgentRunEvent.agentInstance, AgentRunEvent.agentInstanceId, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message (+9 more)

### Community 115 - "Channels schema"
Cohesion: 0.14
Nodes (16): CoupangWingTrackedProduct.brandName, CoupangWingTrackedProduct.categoryHierarchy, CoupangWingTrackedProduct.createdAt, CoupangWingTrackedProduct.enabled, CoupangWingTrackedProduct.id, CoupangWingTrackedProduct.imagePath, CoupangWingTrackedProduct.itemId, CoupangWingTrackedProduct.lastCapturedAt (+8 more)

### Community 116 - "Community 116"
Cohesion: 0.24
Nodes (14): analyzeReconstructionTriggers(), changedFilesFromGit(), ghPrBody(), git(), isCrossLayerControlChange(), isHighRiskBoundary(), isLargeServiceOrComponent(), layerOf() (+6 more)

### Community 117 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 118 - "Sourcing schema"
Cohesion: 0.17
Nodes (15): NaverPopularKeywordDailySnapshot.boardKey, NaverPopularKeywordDailySnapshot.boardLabel, NaverPopularKeywordDailySnapshot.businessDate, NaverPopularKeywordDailySnapshot.capturedAt, NaverPopularKeywordDailySnapshot.cid, NaverPopularKeywordDailySnapshot.createdAt, NaverPopularKeywordDailySnapshot.id, NaverPopularKeywordDailySnapshot.keyword (+7 more)

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

### Community 124 - "Finance schema"
Cohesion: 0.15
Nodes (14): Finance, GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.marginScore, GradeHistory.master, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization (+6 more)

### Community 125 - "Advertising schema"
Cohesion: 0.15
Nodes (14): ExecutionTask.workerId, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentTaskRef, ExecutionWorker.currentUrl, ExecutionWorker.id, ExecutionWorker.label, ExecutionWorker.lastHeartbeatAt (+6 more)

### Community 126 - "Finance schema"
Cohesion: 0.15
Nodes (14): ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description, ManualLedger.id (+6 more)

### Community 127 - "Channels schema"
Cohesion: 0.19
Nodes (13): CoupangKeywordSerpDailySnapshot.businessDate, CoupangKeywordSerpDailySnapshot.capturedAt, CoupangKeywordSerpDailySnapshot.createdAt, CoupangKeywordSerpDailySnapshot.id, CoupangKeywordSerpDailySnapshot.itemCount, CoupangKeywordSerpDailySnapshot.items, CoupangKeywordSerpDailySnapshot.keyword, CoupangKeywordSerpDailySnapshot.organization (+5 more)

### Community 128 - "Core schema"
Cohesion: 0.17
Nodes (13): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+5 more)

### Community 129 - "Channels schema"
Cohesion: 0.18
Nodes (13): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson, RocketSupplyDailySnapshot.revenueKrw (+5 more)

### Community 130 - "Community 130"
Cohesion: 0.31
Nodes (11): analyzeSchemaArtifactSync(), changedFilesFromGit(), changedFilesFromWorkingTree(), GENERATED_ARTIFACT_PATHS, git(), main(), matchesAnyPath(), mergeChangedFiles() (+3 more)

### Community 131 - "Sourcing schema"
Cohesion: 0.20
Nodes (12): Sourcing, TrendSeedKeyword.createdAt, TrendSeedKeyword.enabled, TrendSeedKeyword.id, TrendSeedKeyword.keyword, TrendSeedKeyword.keywordCn, TrendSeedKeyword.organization, TrendSeedKeyword.sources (+4 more)

### Community 132 - "Channels schema"
Cohesion: 0.20
Nodes (12): CoupangKeywordTracker.createdAt, CoupangKeywordTracker.enabled, CoupangKeywordTracker.id, CoupangKeywordTracker.keyword, CoupangKeywordTracker.lastCapturedAt, CoupangKeywordTracker.maxPages, CoupangKeywordTracker.organization, CoupangKeywordTracker.updatedAt (+4 more)

### Community 133 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 134 - "Community 134"
Cohesion: 0.26
Nodes (9): DETAIL_IMAGE_COUNTS, DETAIL_PAGE_AGE_GROUPS, DETAIL_PAGE_TEMPLATE_IDS, DetailImageCount, DetailImageCountSchema, DetailPageAgeGroup, DetailPageAgeGroupSchema, DetailPageTemplateId (+1 more)

### Community 135 - "System schema"
Cohesion: 0.20
Nodes (11): ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization, ActivityEvent.source (+3 more)

### Community 136 - "Core schema"
Cohesion: 0.22
Nodes (11): CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.keywords, CategoryMapping.organization, CategoryMapping.updatedAt (+3 more)

### Community 137 - "System schema"
Cohesion: 0.20
Nodes (10): FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name, FeatureGate.updatedAt (+2 more)

### Community 138 - "Community 138"
Cohesion: 0.18
Nodes (9): ActionTask, ActionTaskExecuteResponse, ActionTaskList, ActionTaskListSchema, ActionTaskRelatedProduct, ActionTaskRelatedProductSchema, ActionTaskSchema, ActionTaskSourceAlert (+1 more)

### Community 139 - "Community 139"
Cohesion: 0.35
Nodes (9): analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), directOutPortFiles(), FORBIDDEN_IN_PORT_FOLDER_NAMES, forbiddenInPortCallerFolders(), listDirectories(), listFiles(), main() (+1 more)

### Community 140 - "Community 140"
Cohesion: 0.31
Nodes (9): addUnique(), defaultOutputDir, defaultSourceDir, normalizeKiditemOrigin(), patchExtensionRuntimeFiles(), patchManifest(), prepareCoupangExtension(), repoRoot (+1 more)

### Community 141 - "Advertising schema"
Cohesion: 0.22
Nodes (10): Advertising, ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.id, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.url (+2 more)

### Community 142 - "System schema"
Cohesion: 0.24
Nodes (10): System, SystemSetting.createdAt, SystemSetting.id, SystemSetting.key, SystemSetting.organization, SystemSetting.updatedAt, SystemSetting.value, SystemSetting (+2 more)

### Community 143 - "Community 143"
Cohesion: 0.20
Nodes (8): ReviewFilter, ReviewFilterSchema, ReviewListItem, ReviewListItemSchema, ReviewListResponse, ReviewListResponseSchema, ReviewSummary, ReviewSummarySchema

### Community 144 - "Community 144"
Cohesion: 0.38
Nodes (8): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), main(), parseBaseline(), readFiles(), repoRoot(), walk()

### Community 145 - "Community 145"
Cohesion: 0.31
Nodes (8): parseArgs(), ParsedArgs, parseRawArgs(), ParseRawArgsOptions, pushValue(), values(), COMMANDS, makeArgs()

### Community 146 - "Community 146"
Cohesion: 0.25
Nodes (5): ChannelsOperationAlertAdapter, Inject, Injectable, OperationLifecyclePatch, StartOperationAlertInput

### Community 147 - "Channels schema"
Cohesion: 0.25
Nodes (9): Channels, CoupangRepresentativeKeywordOverride.createdAt, CoupangRepresentativeKeywordOverride.id, CoupangRepresentativeKeywordOverride.keyword, CoupangRepresentativeKeywordOverride.organization, CoupangRepresentativeKeywordOverride.updatedAt, CoupangRepresentativeKeywordOverride, coupang_representative_keyword_overrides (+1 more)

### Community 148 - "Community 148"
Cohesion: 0.32
Nodes (3): ChannelSyncRepositoryAdapter, Injectable, ProductListingSyncResult

### Community 149 - "Community 149"
Cohesion: 0.46
Nodes (6): analyzeInventory(), listTopLevelScriptFiles(), main(), repoRoot(), SCRIPT_INVENTORY, SUPPORT_FILES

### Community 150 - "Community 150"
Cohesion: 0.29
Nodes (5): AuthRequiredErrorBody, AuthUserPublic, AuthUserPublicSchema, LoginRequest, LoginRequestSchema

### Community 151 - "Community 151"
Cohesion: 0.29
Nodes (5): ReadinessCheck, ReadinessCheckSchema, ReadinessCheckStatusSchema, ReadinessResponse, ReadinessResponseSchema

### Community 152 - "Community 152"
Cohesion: 0.60
Nodes (5): assertToolInvocationDidNotFail(), coupangSubmissionInput(), optionalStringField(), registrationInput(), stringField()

### Community 153 - "Community 153"
Cohesion: 0.33
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 154 - "Community 154"
Cohesion: 0.33
Nodes (4): SettlementReconcileDetail, SettlementReconcileDetailSchema, SettlementReconcileResponse, SettlementReconcileResponseSchema

### Community 156 - "prisma field: ChannelReconciliationItem.channel"
Cohesion: 0.50
Nodes (4): ChannelReconciliationItem.channel, ChannelReconciliationItem.itemKey, ChannelReconciliationItem.source, ChannelReconciliationItem unique(organizationId, channel, source, itemKey)

### Community 162 - "Community 162"
Cohesion: 0.50
Nodes (4): is_allowlisted(), is_comment_line(), load_file_lines(), check-tenant-scope.sh script

### Community 163 - "Community 163"
Cohesion: 0.67
Nodes (3): extractEnvKeys(), readModelFile(), redactEnvValues()

## Knowledge Gaps
- **2090 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+2085 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Core schema` to `Community 3`, `prisma field: externalOptionId canonical option identity`, `Orders schema`, `Orders schema`, `AI schema`, `Community 9`, `Community 10`, `Channels schema`, `prisma field: AdAction.externalId`, `Community 13`, `Supply schema`, `Community 15`, `Core schema`, `Community 20`, `Inventory schema`, `Community 22`, `Core schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Supply schema`, `AI schema`, `AI schema`, `AI schema`, `Core schema`, `Core schema`, `Channels schema`, `Core schema`, `Orders schema`, `AgentOS schema`, `AI schema`, `Community 44`, `AgentOS schema`, `Sourcing schema`, `Inventory schema`, `Sourcing schema`, `prisma field: StockTransaction.warehouseId`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `System schema`, `Channels schema`, `AI schema`, `Channels schema`, `AI schema`, `Channels schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `System schema`, `Channels schema`, `Inventory schema`, `Advertising schema`, `AgentOS schema`, `AgentOS schema`, `System schema`, `Channels schema`, `Channels schema`, `Sourcing schema`, `Orders schema`, `Sourcing schema`, `AgentOS schema`, `Core schema`, `Finance schema`, `Sourcing schema`, `AI schema`, `AI schema`, `AgentOS schema`, `Channels schema`, `AI schema`, `Channels schema`, `Sourcing schema`, `Sourcing schema`, `Inventory schema`, `Channels schema`, `prisma field: ActionTask.targetId`, `AgentOS schema`, `Channels schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `Finance schema`, `Advertising schema`, `Finance schema`, `Channels schema`, `Core schema`, `Channels schema`, `Sourcing schema`, `Channels schema`, `System schema`, `Core schema`, `System schema`, `Advertising schema`, `System schema`, `Channels schema`, `prisma field: Organization.id`?**
  _High betweenness centrality (0.304) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `prisma field: externalOptionId canonical option identity` to `Core schema`, `Orders schema`, `Orders schema`, `AI schema`, `Channels schema`, `prisma field: AdAction.externalId`, `Supply schema`, `Core schema`, `Inventory schema`, `Core schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Supply schema`, `AI schema`, `prisma field: index.ts`, `AI schema`, `AI schema`, `Core schema`, `Core schema`, `Channels schema`, `Core schema`, `Orders schema`, `AgentOS schema`, `AI schema`, `AgentOS schema`, `Sourcing schema`, `Inventory schema`, `Sourcing schema`, `prisma field: StockTransaction.warehouseId`, `System schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `System schema`, `Channels schema`, `AI schema`, `Channels schema`, `AI schema`, `Channels schema`, `Advertising schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `System schema`, `Channels schema`, `Inventory schema`, `Advertising schema`, `AgentOS schema`, `AgentOS schema`, `System schema`, `Channels schema`, `Channels schema`, `Sourcing schema`, `Orders schema`, `Sourcing schema`, `AgentOS schema`, `Core schema`, `Finance schema`, `Sourcing schema`, `AI schema`, `AI schema`, `AgentOS schema`, `Channels schema`, `AI schema`, `Channels schema`, `Sourcing schema`, `Sourcing schema`, `Inventory schema`, `Channels schema`, `prisma field: ActionTask.targetId`, `AgentOS schema`, `Channels schema`, `System schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `Finance schema`, `Advertising schema`, `Finance schema`, `Channels schema`, `Core schema`, `Channels schema`, `Sourcing schema`, `Channels schema`, `System schema`, `System schema`, `Core schema`, `System schema`, `Advertising schema`, `System schema`, `Channels schema`?**
  _High betweenness centrality (0.229) - this node is a cross-community bridge._
- **Why does `Order` connect `Orders schema` to `Core schema`, `Community 130`, `prisma field: externalOptionId canonical option identity`, `Orders schema`, `Community 7`, `AI schema`, `Community 9`, `Community 10`, `Community 139`, `prisma field: AdAction.externalId`, `Community 13`, `Community 16`, `Community 18`, `Community 20`, `Community 22`, `Community 155`, `Core schema`, `Orders schema`, `Community 44`, `prisma field: StockTransaction.warehouseId`, `System schema`, `Channels schema`, `Community 73`, `Orders schema`, `prisma field: ActionTask.targetId`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Are the 106 inferred relationships involving `Organization` (e.g. with `channel-registration-capability.adapter.ts` and `channel-registration-capability.adapter.spec.ts`) actually correct?**
  _`Organization` has 106 INFERRED edges - model-reasoned connections that need verification._
- **Are the 75 inferred relationships involving `Order` (e.g. with `channel-sync.controller.ts` and `index.ts`) actually correct?**
  _`Order` has 75 INFERRED edges - model-reasoned connections that need verification._
- **Are the 43 inferred relationships involving `User` (e.g. with `channel-registration-capability.adapter.spec.ts` and `channel-reconciliation.controller.ts`) actually correct?**
  _`User` has 43 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason` to the rest of the system?**
  _2090 weakly-connected nodes found - possible documentation gaps or missing edges._