# Graph Report - schema-consumers  (2026-07-13)

## Corpus Check
- 303 files · ~137,619 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4760 nodes · 22546 edges · 230 communities (215 shown, 15 thin omitted)
- Extraction: 38% EXTRACTED · 62% INFERRED · 0% AMBIGUOUS · INFERRED: 14022 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Core schema
- prisma field: externalOptionId canonical option identity
- Community 2
- prisma field: AdAction.externalId
- Community 4
- Orders schema
- Community 6
- Community 7
- Community 8
- Channels schema
- Community 10
- AgentOS schema
- AI schema
- Community 13
- Community 14
- Orders schema
- Supply schema
- Core schema
- AI schema
- AI schema
- Core schema
- AgentOS schema
- AI schema
- AgentOS schema
- Core schema
- AI schema
- Community 26
- AI schema
- Channels schema
- Core schema
- AI schema
- Sourcing schema
- Community 32
- Community 33
- AI schema
- Inventory schema
- AI schema
- Community 37
- Community 38
- Community 39
- AgentOS schema
- AgentOS schema
- Sourcing schema
- System schema
- AgentOS schema
- AgentOS schema
- Community 46
- Community 47
- Channels schema
- Core schema
- Channels schema
- System schema
- Inventory schema
- Community 53
- Community 54
- Channels schema
- Advertising schema
- Supply schema
- Inventory schema
- Channels schema
- Core schema
- Orders schema
- Core schema
- Inventory schema
- Community 64
- Community 65
- AI schema
- Community 67
- System schema
- Advertising schema
- AgentOS schema
- Channels schema
- Community 72
- Community 73
- Community 74
- AI schema
- Community 76
- Community 77
- AgentOS schema
- System schema
- Channels schema
- Inventory schema
- Orders schema
- Community 83
- AgentOS schema
- Finance schema
- AI schema
- Community 87
- Community 88
- Community 89
- Channels schema
- AgentOS schema
- Core schema
- Inventory schema
- Inventory schema
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- AgentOS schema
- Inventory schema
- Channels schema
- Orders schema
- Community 105
- Community 106
- Community 107
- prisma field: ActionTask.targetId
- Inventory schema
- Community 110
- AgentOS schema
- Inventory schema
- Inventory schema
- Inventory schema
- Supply schema
- Community 116
- Community 117
- Community 118
- Community 119
- Finance schema
- Orders schema
- System schema
- Finance schema
- Finance schema
- Inventory schema
- Inventory schema
- Community 127
- Community 128
- Advertising schema
- Inventory schema
- Finance schema
- Community 132
- Community 133
- Community 134
- Core schema
- Supply schema
- Orders schema
- Channels schema
- Community 139
- Community 140
- Community 141
- System schema
- Community 143
- Community 144
- System schema
- Core schema
- System schema
- Community 148
- Community 149
- Community 150
- Community 151
- Community 152
- Community 153
- Community 154
- Advertising schema
- System schema
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
- Community 173
- Community 174
- Community 175
- Community 176
- Community 177
- Community 178
- prisma field: ChannelReconciliationItem.channel
- Community 180
- Community 181
- Community 182
- Community 183
- Community 184
- Community 185
- Community 186
- Community 187
- Community 188
- Community 189
- prisma field: ChannelReconciliationItem.id
- prisma field: Organization.id
- Community 192
- Community 193
- Community 216

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 360 edges
2. `Organization` - 341 edges
3. `prisma — Shared Schema` - 147 edges
4. `ChannelListing` - 146 edges
5. `MasterProduct` - 143 edges
6. `ChannelAccount` - 133 edges
7. `Order` - 129 edges
8. `ProductPreparation.organizationId` - 120 edges
9. `ContentWorkspace.organizationId` - 119 edges
10. `ChannelListing.organizationId` - 112 edges
11. `ContentWorkspaceThumbnailSelection.organizationId` - 111 edges
12. `ChannelAdTargetDailySnapshot.organizationId` - 111 edges

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

## Communities (230 total, 15 thin omitted)

### Community 0 - "Core schema"
Cohesion: 0.18
Nodes (195): ConfirmedListingRegistrationInput, ConfirmedListingRegistrationOutput, ConfirmedListingRegistrationOutputSchema, CoupangListingSubmissionInput, CoupangListingSubmissionOutput, CoupangListingSubmissionOutputSchema, NonEmptyRecordSchema, UploadedWorkbookFile (+187 more)

### Community 1 - "prisma field: externalOptionId canonical option identity"
Cohesion: 0.07
Nodes (97): ListingForProductSync, CHANNEL_SYNC_REPOSITORY_PORT, fileHash(), importInput(), makeRow(), representativeRows(), externalOptionId canonical option identity, vendorItemId provider term (+89 more)

### Community 2 - "Community 2"
Cohesion: 0.02
Nodes (101): AgentApprovalRequestSummary, AgentApprovalRequestSummarySchema, AgentApprovalStatus, AgentApprovalStatusSchema, AgentArtifactHandoffSummary, AgentArtifactHandoffSummarySchema, AgentArtifactStatus, AgentArtifactStatusSchema (+93 more)

### Community 3 - "prisma field: AdAction.externalId"
Cohesion: 0.14
Nodes (54): CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT, CHANNELS_CAPABILITIES, ChannelsCapabilityKey, AdAction.externalId, AdAction.listingId, ChannelAdTargetDailySnapshot.externalId, ChannelAdTargetDailySnapshot.listingId, ChannelListing.externalId (+46 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (78): GetMasterImagesResponse, Master, MasterImageItem, MasterImageItemSchema, MasterImageRole, MasterSchema, MasterWithOptions, MasterWithOptionsSchema (+70 more)

### Community 5 - "Orders schema"
Cohesion: 0.03
Nodes (75): formatKstIso(), normalizeCoupangOrderStatus(), Orders, OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.metadata (+67 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (71): AdapterCommand, appendFlag(), appendOption(), appendProjectReferenceDefaults(), appendValues(), archiveFileName(), archiveShaFileName(), Args (+63 more)

### Community 7 - "Community 7"
Cohesion: 0.05
Nodes (66): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot, AdCampaignSnapshotSchema (+58 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (30): DATA_MIGRATION_IDS, DATA_MIGRATION_RELEASES, dataMigrations, DataMigration, backfillSourcingCandidatesFromMasterProducts, isLegacyDetailEditorHref(), rewriteLegacyDetailEditorAlertHrefs, rewriteLegacyDetailEditorHref() (+22 more)

### Community 9 - "Channels schema"
Cohesion: 0.04
Nodes (55): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+47 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (49): apiHeaders(), apiUrl(), Args, assertSafeDatasetId(), buildCoupangImageSyncRowsForListings(), BundleManifest, BundlePayload, BundleReference (+41 more)

### Community 11 - "AgentOS schema"
Cohesion: 0.04
Nodes (52): AgentOS, AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy, AgentAuthorizationEvent.decidedByUserId (+44 more)

### Community 12 - "AI schema"
Cohesion: 0.05
Nodes (48): ContentGeneration.detailPageArtifactId, ContentWorkspace.currentDetailPageArtifactId, ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.contentWorkspaceId, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.currentRevision (+40 more)

### Community 13 - "Community 13"
Cohesion: 0.10
Nodes (48): assertNonProductionTarget(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged(), assertSha256(), BaselineManifest, BaselineManifestExpectation, baselineObjectKeys, buildChecksumsFile() (+40 more)

### Community 14 - "Community 14"
Cohesion: 0.08
Nodes (45): applyCacheControl(), ApplyResult, applyS3CacheControl(), applySupabaseCacheControl(), assertApplyAllowed(), buildCopyObjectInput(), CliArgs, CliConfig (+37 more)

### Community 15 - "Orders schema"
Cohesion: 0.06
Nodes (42): CSRecord.orderId, Order.channelAccount, Order.channelAccountId, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId (+34 more)

### Community 16 - "Supply schema"
Cohesion: 0.05
Nodes (48): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.id, MasterSupplierProduct.isPrimary, MasterSupplierProduct.master, MasterSupplierProduct.memo, MasterSupplierProduct.minOrderQty, MasterSupplierProduct.supplier (+40 more)

### Community 17 - "Core schema"
Cohesion: 0.04
Nodes (48): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.adTier, MasterProduct.brand, MasterProduct.category, MasterProduct.code, MasterProduct.costCny, MasterProduct.createdAt (+40 more)

### Community 18 - "AI schema"
Cohesion: 0.05
Nodes (45): ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.editedHtmlSavedAt, ContentGeneration.errorMessage (+37 more)

### Community 19 - "AI schema"
Cohesion: 0.05
Nodes (44): packages/shared — @kiditem/shared, AI, Inventory, ProductPreparation.selectedThumbnailGenerationId, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.contentWorkspaceId, ThumbnailGeneration.createdAt (+36 more)

### Community 20 - "Core schema"
Cohesion: 0.06
Nodes (44): Core, BundleComponent.bundleOption, BundleComponent.bundleOptionId, BundleComponent.componentOption, BundleComponent.componentOptionId, BundleComponent.createdAt, BundleComponent.id, BundleComponent.organization (+36 more)

### Community 21 - "AgentOS schema"
Cohesion: 0.05
Nodes (44): AgentRunRequest.agentInstance, AgentRunRequest.attempts, AgentRunRequest.claimedAt, AgentRunRequest.claimedBy, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.coalescedIntoRequestId, AgentRunRequest.conversation, AgentRunRequest.createdAt (+36 more)

### Community 22 - "AI schema"
Cohesion: 0.05
Nodes (40): ContentGeneration.triggeredByUserId, ContentWorkspace.createdByUserId, DetailPageArtifact.createdByUserId, ProductPreparation.createdByUserId, SourcingCandidate.rejectedByUserId, SourcingCandidate.triggeredByUserId, ThumbnailGeneration.triggeredByUserId, ThumbnailGenerationEvent.actor (+32 more)

### Community 23 - "AgentOS schema"
Cohesion: 0.05
Nodes (42): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+34 more)

### Community 24 - "Core schema"
Cohesion: 0.05
Nodes (41): MasterProductImage.createdAt, MasterProductImage.deletedAt, MasterProductImage.fileSize, MasterProductImage.height, MasterProductImage.id, MasterProductImage.isPrimary, MasterProductImage.label, MasterProductImage.master (+33 more)

### Community 25 - "AI schema"
Cohesion: 0.05
Nodes (41): ProductPreparation.appliedToMasterAt, ProductPreparation.channelAccount, ProductPreparation.channelAccountId, ProductPreparation.channelListing, ProductPreparation.channelListingId, ProductPreparation.contentWorkspace, ProductPreparation.createdAt, ProductPreparation.createdByUser (+33 more)

### Community 26 - "Community 26"
Cohesion: 0.05
Nodes (39): AdMetricsDetail, AdMetricsDetailSchema, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary, DashboardAdSummarySchema (+31 more)

### Community 27 - "AI schema"
Cohesion: 0.06
Nodes (38): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+30 more)

### Community 28 - "Channels schema"
Cohesion: 0.06
Nodes (36): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel, ChannelAdTargetDailySnapshot.clicks (+28 more)

### Community 29 - "Core schema"
Cohesion: 0.06
Nodes (36): ChannelListing.abcGrade, ChannelListing.adBudgetLimit, ChannelListing.adTier, ChannelListing.brand, ChannelListing.category, ChannelListing.channel, ChannelListing.channelAccount, ChannelListing.channelAccountId (+28 more)

### Community 30 - "AI schema"
Cohesion: 0.07
Nodes (36): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.generationGroup (+28 more)

### Community 31 - "Sourcing schema"
Cohesion: 0.07
Nodes (32): SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.id, SourcingCandidate.imageUrl, SourcingCandidate.name (+24 more)

### Community 32 - "Community 32"
Cohesion: 0.06
Nodes (28): ChannelAccountListItem, ChannelAccountListItemSchema, CoupangAccountSettings, CoupangAccountSettingsSchema, UpdateCoupangAccountSettings, ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow (+20 more)

### Community 33 - "Community 33"
Cohesion: 0.11
Nodes (27): ChannelSkuMappingCounts, capCandidateLimit(), ChannelSkuMappingService, dedupeCandidates(), distinctNormalizedIdentifiers(), distinctTrimmed(), exactCodeEvidence(), Injectable (+19 more)

### Community 34 - "AI schema"
Cohesion: 0.07
Nodes (35): ContentWorkspaceThumbnailSelection.contentAsset, ContentWorkspaceThumbnailSelection.contentAssetId, ContentWorkspaceThumbnailSelection.contentWorkspace, ContentWorkspaceThumbnailSelection.contentWorkspaceId, ContentWorkspaceThumbnailSelection.createdAt, ContentWorkspaceThumbnailSelection.createdByUser, ContentWorkspaceThumbnailSelection.createdByUserId, ContentWorkspaceThumbnailSelection.id (+27 more)

### Community 35 - "Inventory schema"
Cohesion: 0.06
Nodes (35): SellpiaStockSnapshotItem.appliedTransactionId, SellpiaStockSnapshotItem.blockingReasons, SellpiaStockSnapshotItem.createdAt, SellpiaStockSnapshotItem.diff, SellpiaStockSnapshotItem.diffRate, SellpiaStockSnapshotItem.id, SellpiaStockSnapshotItem.inventory, SellpiaStockSnapshotItem.kiditemStockAtApply (+27 more)

### Community 36 - "AI schema"
Cohesion: 0.08
Nodes (34): ContentGeneration.contentWorkspaceId, ContentWorkspace.channelListing, ContentWorkspace.channelListingId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageRevision, ContentWorkspace.currentThumbnailSelection (+26 more)

### Community 37 - "Community 37"
Cohesion: 0.07
Nodes (31): DeliveryCompany, DeliveryCompanySchema, Order, OrderActionResponse, OrderActionResponseSchema, OrderLineItem, OrderLineItemSchema, OrderListItem (+23 more)

### Community 38 - "Community 38"
Cohesion: 0.07
Nodes (28): InventorySkuSnapshotItem, InventorySkuSnapshotItemSchema, InventorySkuSnapshotListResponse, InventorySkuSnapshotListResponseSchema, InventorySkuSnapshotSummary, InventorySkuSnapshotSummarySchema, InventorySkuStockStatus, InventorySkuStockStatusSchema (+20 more)

### Community 39 - "Community 39"
Cohesion: 0.12
Nodes (33): DataMigrationContext, DataMigrationTarget, MigrationResult, appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertMutatingTarget(), CliArgs, Command (+25 more)

### Community 40 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+25 more)

### Community 41 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.startedAt, WorkflowRun.status (+25 more)

### Community 42 - "Sourcing schema"
Cohesion: 0.07
Nodes (31): CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id, CandidateImage.isPrimary (+23 more)

### Community 43 - "System schema"
Cohesion: 0.08
Nodes (26): Alert.actionTask, Alert.actorUser, Alert.actorUserId, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead (+18 more)

### Community 44 - "AgentOS schema"
Cohesion: 0.07
Nodes (28): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.approver, AgentApprovalRequest.approverUserId, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy, AgentApprovalRequest.decidedByUserId (+20 more)

### Community 45 - "AgentOS schema"
Cohesion: 0.08
Nodes (28): AgentToolInvocation.agentInstance, AgentToolInvocation.approvalRequest, AgentToolInvocation.approvalRequestId, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt, AgentToolInvocation.errorCode (+20 more)

### Community 46 - "Community 46"
Cohesion: 0.16
Nodes (24): Path, add_code_reference_edges(), add_document_mentions(), add_schema_graph(), camel(), collect_block(), collect_code(), collect_doc_comments() (+16 more)

### Community 47 - "Community 47"
Cohesion: 0.14
Nodes (27): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+19 more)

### Community 48 - "Channels schema"
Cohesion: 0.08
Nodes (27): Channels, ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isOfferWinner, ChannelListingOptionDailySnapshot.lastObservedAt (+19 more)

### Community 49 - "Core schema"
Cohesion: 0.09
Nodes (27): ChannelListingOption.attributesJson, ChannelListingOption.channelAccount, ChannelListingOption.channelAccountId, ChannelListingOption.commissionRate, ChannelListingOption.costPriceOverride, ChannelListingOption.createdAt, ChannelListingOption.externalOptionId, ChannelListingOption.id (+19 more)

### Community 50 - "Channels schema"
Cohesion: 0.07
Nodes (27): ChannelReconciliationItem.channelImageUrl, ChannelReconciliationItem.channelOptionName, ChannelReconciliationItem.channelProductName, ChannelReconciliationItem.channelStatus, ChannelReconciliationItem.channelUrl, ChannelReconciliationItem.confidence, ChannelReconciliationItem.conflictJson, ChannelReconciliationItem.createdAt (+19 more)

### Community 51 - "System schema"
Cohesion: 0.08
Nodes (23): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon, Marketplace.id (+15 more)

### Community 52 - "Inventory schema"
Cohesion: 0.08
Nodes (27): RocketInventoryLedger.createdAt, RocketInventoryLedger.createdBy, RocketInventoryLedger.eventType, RocketInventoryLedger.id, RocketInventoryLedger.inventory, RocketInventoryLedger.inventoryId, RocketInventoryLedger.masterProduct, RocketInventoryLedger.masterProductId (+19 more)

### Community 53 - "Community 53"
Cohesion: 0.14
Nodes (16): asMappingStatus(), availabilityStatusSql(), ChannelSkuMappingRepositoryAdapter, contains(), emptyAvailabilityPageMeta(), mappingRowSelect(), queueWhere(), toEvidenceRow() (+8 more)

### Community 54 - "Community 54"
Cohesion: 0.15
Nodes (25): cellText(), collectParentMetadataConflicts(), decodeWorksheetRange(), expandMergedParentCells(), findHeaderRow(), formattedCellText(), hasCellValue(), headersForRow() (+17 more)

### Community 55 - "Channels schema"
Cohesion: 0.08
Nodes (26): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.channelAccount, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.id (+18 more)

### Community 56 - "Advertising schema"
Cohesion: 0.09
Nodes (26): ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task, ExecutionLog.taskId (+18 more)

### Community 57 - "Supply schema"
Cohesion: 0.08
Nodes (26): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+18 more)

### Community 58 - "Inventory schema"
Cohesion: 0.08
Nodes (20): CHANNELS_ROOT, REPO_ROOT, Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.id, Inventory.lastRestockedAt, Inventory.leadTimeDays (+12 more)

### Community 59 - "Channels schema"
Cohesion: 0.09
Nodes (24): ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.id, ChannelScrapeSnapshot.listing, ChannelScrapeSnapshot.listingOption (+16 more)

### Community 60 - "Core schema"
Cohesion: 0.11
Nodes (25): ChannelListing.lastImportRunId, ChannelListingOption.lastImportRunId, InventorySku.lastImportRunId, MasterProduct.lastImportRunId, SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.createdAt (+17 more)

### Community 61 - "Orders schema"
Cohesion: 0.10
Nodes (25): OrderReturn.channelAccount, OrderReturn.channelAccountId, OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.id (+17 more)

### Community 62 - "Core schema"
Cohesion: 0.13
Nodes (21): OrganizationMembership.createdAt, OrganizationMembership.id, OrganizationMembership.invitedBy, OrganizationMembership.invitedById, OrganizationMembership.joinedAt, OrganizationMembership.lastSelectedAt, OrganizationMembership.organization, OrganizationMembership.role (+13 more)

### Community 63 - "Inventory schema"
Cohesion: 0.08
Nodes (25): SellpiaNewProductCandidate.createdAt, SellpiaNewProductCandidate.createdInventory, SellpiaNewProductCandidate.id, SellpiaNewProductCandidate.initialReceiveTransactionId, SellpiaNewProductCandidate.modelName, SellpiaNewProductCandidate.note, SellpiaNewProductCandidate.operatorInitialStock, SellpiaNewProductCandidate.organization (+17 more)

### Community 64 - "Community 64"
Cohesion: 0.08
Nodes (22): StatisticsCategoryRow, StatisticsCategoryRowSchema, StatisticsDeliveryDaily, StatisticsDeliveryDailySchema, StatisticsDeliveryResponse, StatisticsDeliveryResponseSchema, StatisticsGradeRow, StatisticsGradeRowSchema (+14 more)

### Community 65 - "Community 65"
Cohesion: 0.13
Nodes (16): ChannelAccountRepositoryAdapter, envelopeToJson(), maskAccessKey(), readCredentialsConfig(), stripLegacyCredentialKeys(), toJsonRecord(), toRecord(), trimToOptional() (+8 more)

### Community 66 - "AI schema"
Cohesion: 0.09
Nodes (21): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt (+13 more)

### Community 67 - "Community 67"
Cohesion: 0.09
Nodes (11): CoupangProviderAdapter, Inject, Injectable, CoupangCreateSellerProductResponse, CoupangSellerProductPayload, OrderSheetResponse, SellerProductDetailResponse, SellerProductExternalSkuResponse (+3 more)

### Community 68 - "System schema"
Cohesion: 0.10
Nodes (23): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.href (+15 more)

### Community 69 - "Advertising schema"
Cohesion: 0.09
Nodes (23): AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+15 more)

### Community 70 - "AgentOS schema"
Cohesion: 0.09
Nodes (23): AgentInstance.adapterConfig, AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.icon, AgentInstance.id, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name (+15 more)

### Community 71 - "Channels schema"
Cohesion: 0.12
Nodes (23): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.channelAccount, ChannelAccountDailyKpiSnapshot.channelAccountId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+15 more)

### Community 72 - "Community 72"
Cohesion: 0.22
Nodes (8): ChannelDashboardController, Controller, CurrentOrganization, Get, Query, CoupangDateRangeQueryDto, ChannelDashboardService, Injectable

### Community 73 - "Community 73"
Cohesion: 0.11
Nodes (12): ChannelListingRepositoryAdapter, parseQueryDate(), Injectable, ChannelListingGroupResult, ChannelListingListResult, ChannelListingQuery, ChannelListingRepositoryPort, ChannelListingSummary (+4 more)

### Community 74 - "Community 74"
Cohesion: 0.10
Nodes (6): CoupangProviderPort, ChannelSyncRepositoryPort, OrderSyncDeps, ProductSyncDeps, Inject, Optional

### Community 75 - "AI schema"
Cohesion: 0.10
Nodes (22): ContentAsset.generationGroupId, ContentAsset.originGenerationGroupId, ContentGeneration.generationGroupId, ContentGenerationGroup.baseContentGeneration, ContentGenerationGroup.baseContentGenerationId, ContentGenerationGroup.contentWorkspace, ContentGenerationGroup.contentWorkspaceId, ContentGenerationGroup.createdAt (+14 more)

### Community 76 - "Community 76"
Cohesion: 0.13
Nodes (15): ChannelListingController, Body, Controller, CurrentOrganization, Get, Param, Post, Query (+7 more)

### Community 77 - "Community 77"
Cohesion: 0.11
Nodes (9): ChannelSyncRepositoryAdapter, Injectable, CoupangSyncOrderPayload, CoupangSyncReturnPayload, HealthResult, ProductListingSyncResult, syncSingleCoupangOrder(), syncSingleCoupangReturn() (+1 more)

### Community 78 - "AgentOS schema"
Cohesion: 0.10
Nodes (21): AgentArtifact.agentInstance, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization, AgentArtifact.request (+13 more)

### Community 79 - "System schema"
Cohesion: 0.10
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+13 more)

### Community 80 - "Channels schema"
Cohesion: 0.10
Nodes (21): ChannelReconciliationItem.lastSeenRunId, ChannelReconciliationRun.alreadyLinkedCount, ChannelReconciliationRun.autoLinkedCount, ChannelReconciliationRun.channel, ChannelReconciliationRun.conflictCount, ChannelReconciliationRun.createdAt, ChannelReconciliationRun.errorCount, ChannelReconciliationRun.errorJson (+13 more)

### Community 81 - "Inventory schema"
Cohesion: 0.10
Nodes (21): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.inventorySku, ReturnTransfer.masterProduct, ReturnTransfer.masterProductId (+13 more)

### Community 82 - "Orders schema"
Cohesion: 0.10
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 83 - "Community 83"
Cohesion: 0.21
Nodes (14): CoupangCredentials, coupangRequest(), CoupangRequestOptions, generateAuthorization(), approveReturn(), confirmOrderSheets(), DELIVERY_COMPANIES, getOrderSheets() (+6 more)

### Community 84 - "AgentOS schema"
Cohesion: 0.11
Nodes (20): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id, AgentCostEvent.inputTokens (+12 more)

### Community 85 - "Finance schema"
Cohesion: 0.12
Nodes (20): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit (+12 more)

### Community 86 - "AI schema"
Cohesion: 0.11
Nodes (20): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id, ThumbnailAnalysis.imageSpec, ThumbnailAnalysis.imageUrl (+12 more)

### Community 87 - "Community 87"
Cohesion: 0.10
Nodes (18): ChannelSkuMappingComponent, ChannelSkuMappingComponentSchema, ChannelSkuMappingCounts, ChannelSkuMappingCountsSchema, ChannelSkuMappingListItem, ChannelSkuMappingListResponse, ChannelSkuMappingListResponseSchema, ChannelSkuMappingStatus (+10 more)

### Community 88 - "Community 88"
Cohesion: 0.11
Nodes (17): PANEL_RUN_SOURCES, PanelRunSource, PanelRunSourceSchema, sourceKeys, PANEL_ITEM_KINDS, PanelAlertItem, PanelDismissEventSchema, PanelEvent (+9 more)

### Community 89 - "Community 89"
Cohesion: 0.10
Nodes (18): SupplierHistoryItem, SupplierHistoryItemSchema, SupplierHistoryReport, SupplierHistoryReportSchema, SupplierHistorySummary, SupplierHistorySummarySchema, SupplierProductSalesReport, SupplierProductSalesReportSchema (+10 more)

### Community 90 - "Channels schema"
Cohesion: 0.13
Nodes (17): ChannelSkuComponent.channelSku, ChannelSkuComponent.channelSkuId, ChannelSkuComponent.createdAt, ChannelSkuComponent.createdBy, ChannelSkuComponent.id, ChannelSkuComponent.inventorySku, ChannelSkuComponent.inventorySkuId, ChannelSkuComponent.mappingSource (+9 more)

### Community 91 - "AgentOS schema"
Cohesion: 0.12
Nodes (19): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError, AgentTaskSession.lastRun (+11 more)

### Community 92 - "Core schema"
Cohesion: 0.13
Nodes (17): ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id, ChannelAccount.isPrimary, ChannelAccount.name, ChannelAccount.organization (+9 more)

### Community 93 - "Inventory schema"
Cohesion: 0.11
Nodes (19): PickingItem.createdAt, PickingItem.id, PickingItem.inventorySku, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.masterProduct, PickingItem.masterProductId (+11 more)

### Community 94 - "Inventory schema"
Cohesion: 0.11
Nodes (19): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.id, StockTransfer.inventorySku, StockTransfer.inventorySkuId, StockTransfer.masterProduct, StockTransfer.masterProductId (+11 more)

### Community 95 - "Community 95"
Cohesion: 0.22
Nodes (17): analyzePrReleaseContract(), changedFilesFromGit(), classifyFiles(), compareSemver(), ghPrBody(), git(), hasReleaseDecision(), isDevelopToMainPromotion() (+9 more)

### Community 96 - "Community 96"
Cohesion: 0.12
Nodes (12): ChannelAccountController, Body, Controller, CurrentOrganization, Get, CoupangCredentials, ChannelAccountService, Inject (+4 more)

### Community 97 - "Community 97"
Cohesion: 0.11
Nodes (16): CurrentOrganization, Get, Query, AVAILABILITY_STATUSES, ChannelSkuAvailabilityQueryDto, IsIn, IsInt, IsOptional (+8 more)

### Community 98 - "Community 98"
Cohesion: 0.14
Nodes (12): CHANNEL_LISTING_SORTS, CHANNEL_LISTING_TABS, IsOptional, IsString, UpdateCoupangAccountSettingsDto, parseRefreshChannelSkuMappingStatusDto(), parseReplaceChannelSkuComponentsDto(), SyncOrdersBodyDto (+4 more)

### Community 99 - "Community 99"
Cohesion: 0.11
Nodes (4): ChannelDashboardRepositoryAdapter, Injectable, ChannelDashboardRepositoryPort, Inject

### Community 100 - "Community 100"
Cohesion: 0.18
Nodes (9): OperationAlertPort, SyncResult, isCoupangCredentialResolutionError(), syncCoupangOrders(), syncCoupangProducts(), ChannelSyncService, errorMessage(), resultMessage() (+1 more)

### Community 101 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.id, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.lastRunId (+10 more)

### Community 102 - "Inventory schema"
Cohesion: 0.13
Nodes (18): InventorySku.createdAt, InventorySku.currentStock, InventorySku.id, InventorySku.lastImportRun, InventorySku.name, InventorySku.optionName, InventorySku.organization, InventorySku.purchasePrice (+10 more)

### Community 103 - "Channels schema"
Cohesion: 0.12
Nodes (18): RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt, RocketPurchaseOrder.firstSkuName, RocketPurchaseOrder.id, RocketPurchaseOrder.items, RocketPurchaseOrder.orderAmount, RocketPurchaseOrder.orderedAt (+10 more)

### Community 104 - "Orders schema"
Cohesion: 0.12
Nodes (18): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.externalSku, UnshippedItem.id, UnshippedItem.isNotified, UnshippedItem.listing, UnshippedItem.notifiedAt, UnshippedItem.option (+10 more)

### Community 105 - "Community 105"
Cohesion: 0.11
Nodes (16): ALERT_KINDS, ALERT_OPERATION_LIFECYCLE_STATUSES, ALERT_SEVERITIES, ALERT_STATUSES, AlertItem, AlertItemSchema, AlertKind, AlertOperationLifecycleStatus (+8 more)

### Community 106 - "Community 106"
Cohesion: 0.11
Nodes (16): CANCEL_OPERATION_TARGET_TYPES, CancelOperationAffected, CancelOperationAffectedSchema, CancelOperationPreserved, CancelOperationPreservedSchema, CancelOperationResponse, CancelOperationResponseSchema, CancelOperationStatus (+8 more)

### Community 107 - "Community 107"
Cohesion: 0.12
Nodes (8): ChannelAccountListController, Controller, CurrentOrganization, Get, ChannelAccountRepositoryPort, ChannelAccountQueryService, Inject, Injectable

### Community 108 - "prisma field: ActionTask.targetId"
Cohesion: 0.24
Nodes (11): ActionTask.targetId, ActionTask.targetType, AdAction.targetType, AgentArtifact.targetId, Alert.actionTaskId, Alert.targetId, Alert.targetType, ChannelAdTargetDailySnapshot.targetType (+3 more)

### Community 109 - "Inventory schema"
Cohesion: 0.14
Nodes (17): StockTransfer.fromWarehouseId, StockTransfer.toWarehouseId, Warehouse.address, Warehouse.code, Warehouse.createdAt, Warehouse.id, Warehouse.isDefault, Warehouse.manager (+9 more)

### Community 110 - "Community 110"
Cohesion: 0.20
Nodes (8): canonicalParentRows(), ChannelCatalogImportRepositoryAdapter, importResponse(), isUniqueConstraintError(), nextPublicationSequence(), Injectable, zeroChanges(), ChannelCatalogImportClaim

### Community 111 - "AgentOS schema"
Cohesion: 0.15
Nodes (16): AgentRunEvent.agentInstance, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message, AgentRunEvent.organization (+8 more)

### Community 112 - "Inventory schema"
Cohesion: 0.15
Nodes (16): PickingItem.pickingListId, PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.id, PickingList.listNumber, PickingList.organization, PickingList.pickedItems (+8 more)

### Community 113 - "Inventory schema"
Cohesion: 0.13
Nodes (15): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.sourceRef, SellpiaReceiptUploadBatch.sourceType (+7 more)

### Community 114 - "Inventory schema"
Cohesion: 0.13
Nodes (16): StockTransaction.createdAt, StockTransaction.createdBy, StockTransaction.id, StockTransaction.note, StockTransaction.option, StockTransaction.optionName, StockTransaction.organization, StockTransaction.quantity (+8 more)

### Community 115 - "Supply schema"
Cohesion: 0.13
Nodes (16): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.dueDate, SupplierPayment.id, SupplierPayment.notes, SupplierPayment.organization, SupplierPayment.paidAmount, SupplierPayment.paidDate (+8 more)

### Community 116 - "Community 116"
Cohesion: 0.24
Nodes (14): analyzeReconstructionTriggers(), changedFilesFromGit(), ghPrBody(), git(), isCrossLayerControlChange(), isHighRiskBoundary(), isLargeServiceOrComponent(), layerOf() (+6 more)

### Community 117 - "Community 117"
Cohesion: 0.20
Nodes (10): ChannelSkuMappingController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+2 more)

### Community 118 - "Community 118"
Cohesion: 0.21
Nodes (5): ChannelsInventorySkuReadAdapter, Inject, Injectable, ChannelsInventorySkuReadPort, CandidateInventorySku

### Community 119 - "Community 119"
Cohesion: 0.13
Nodes (6): MarketplaceRegistrationRepositoryAdapter, Injectable, ChannelsProductMasterBarcodePort, MarketplaceRegistrationRepositoryPort, Inject, Optional

### Community 120 - "Finance schema"
Cohesion: 0.14
Nodes (15): Finance, GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.listing, GradeHistory.marginScore, GradeHistory.master, GradeHistory.newGrade, GradeHistory.oldGrade (+7 more)

### Community 121 - "Orders schema"
Cohesion: 0.14
Nodes (15): CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing (+7 more)

### Community 122 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 123 - "Finance schema"
Cohesion: 0.14
Nodes (15): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.id, ProcessingCost.master, ProcessingCost.notes, ProcessingCost.organization, ProcessingCost.processType, ProcessingCost.productName (+7 more)

### Community 124 - "Finance schema"
Cohesion: 0.15
Nodes (15): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.organization, SalesPlan.period (+7 more)

### Community 125 - "Inventory schema"
Cohesion: 0.14
Nodes (15): SellpiaStockSnapshot.createdAt, SellpiaStockSnapshot.createdBy, SellpiaStockSnapshot.effectiveExportedAt, SellpiaStockSnapshot.fileHash, SellpiaStockSnapshot.fileName, SellpiaStockSnapshot.id, SellpiaStockSnapshot.metaJson, SellpiaStockSnapshot.organization (+7 more)

### Community 126 - "Inventory schema"
Cohesion: 0.15
Nodes (15): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items, StockAudit.matchedCount (+7 more)

### Community 127 - "Community 127"
Cohesion: 0.21
Nodes (7): ProductRegistrationSubmissionCapabilityInput, ResolveProductRegistrationCapabilityInput, asRecord(), listingPayloadFromFrozenSubmission(), MarketplaceRegistrationService, recordedMarketplaceResult(), Injectable

### Community 128 - "Community 128"
Cohesion: 0.14
Nodes (3): ChannelSkuMappingRepositoryPort, Inject, Inject

### Community 129 - "Advertising schema"
Cohesion: 0.15
Nodes (14): ExecutionTask.workerId, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentTaskRef, ExecutionWorker.currentUrl, ExecutionWorker.id, ExecutionWorker.label, ExecutionWorker.lastHeartbeatAt (+6 more)

### Community 130 - "Inventory schema"
Cohesion: 0.18
Nodes (14): InventorySkuMasterProductMap.createdAt, InventorySkuMasterProductMap.details, InventorySkuMasterProductMap.id, InventorySkuMasterProductMap.inventorySku, InventorySkuMasterProductMap.inventorySkuId, InventorySkuMasterProductMap.masterProduct, InventorySkuMasterProductMap.masterProductId, InventorySkuMasterProductMap.organization (+6 more)

### Community 131 - "Finance schema"
Cohesion: 0.15
Nodes (14): ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description, ManualLedger.id (+6 more)

### Community 132 - "Community 132"
Cohesion: 0.20
Nodes (11): SELLPIA_WORKBOOK_ACCEPT, SELLPIA_WORKBOOK_FILE_EXTENSIONS, SellpiaReceiptBatchCreateInput, SellpiaReceiptBatchCreateInputSchema, SellpiaReceiptBatchMarkUploadedInput, SellpiaReceiptBatchMarkUploadedInputSchema, SellpiaReceiptUploadBatch, SellpiaReceiptUploadBatchSchema (+3 more)

### Community 133 - "Community 133"
Cohesion: 0.19
Nodes (12): ChannelSkuCandidateQueryDto, ChannelSkuMappingQueryDto, MAPPING_STATUSES, IsIn, IsInt, IsOptional, IsPositive, IsString (+4 more)

### Community 134 - "Community 134"
Cohesion: 0.19
Nodes (7): ChannelSkuMappingListQuery, ChannelSkuAvailabilityService, hydrateChannelSkuAvailabilityRows(), Injectable, row(), ChannelSkuStockComponent, projectChannelSkuSellableStock()

### Community 135 - "Core schema"
Cohesion: 0.17
Nodes (13): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+5 more)

### Community 136 - "Supply schema"
Cohesion: 0.17
Nodes (13): PurchaseOrderItem.createdAt, PurchaseOrderItem.id, PurchaseOrderItem.masterProduct, PurchaseOrderItem.masterProductId, PurchaseOrderItem.option, PurchaseOrderItem.order, PurchaseOrderItem.organization, PurchaseOrderItem.productName (+5 more)

### Community 137 - "Orders schema"
Cohesion: 0.17
Nodes (11): Review.content, Review.createdAt, Review.id, Review.listing, Review.organization, Review.platform, Review.rating, Review.reviewedAt (+3 more)

### Community 138 - "Channels schema"
Cohesion: 0.18
Nodes (13): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson, RocketSupplyDailySnapshot.revenueKrw (+5 more)

### Community 139 - "Community 139"
Cohesion: 0.31
Nodes (11): analyzeSchemaArtifactSync(), changedFilesFromGit(), changedFilesFromWorkingTree(), GENERATED_ARTIFACT_PATHS, git(), main(), matchesAnyPath(), mergeChangedFiles() (+3 more)

### Community 140 - "Community 140"
Cohesion: 0.21
Nodes (8): ChannelRegistrationCapabilityAdapter, ConfirmedListingRegistrationInputSchema, CoupangListingSubmissionInputSchema, normalizeForHash(), stableHash(), Injectable, SubmitCoupangMarketplaceListingCapabilityInput, SubmitCoupangMarketplaceListingCapabilityResult

### Community 141 - "Community 141"
Cohesion: 0.26
Nodes (7): ChannelSyncController, Body, Controller, CurrentOrganization, CurrentUser, Get, Post

### Community 142 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 143 - "Community 143"
Cohesion: 0.26
Nodes (9): DETAIL_IMAGE_COUNTS, DETAIL_PAGE_AGE_GROUPS, DETAIL_PAGE_TEMPLATE_IDS, DetailImageCount, DetailImageCountSchema, DetailPageAgeGroup, DetailPageAgeGroupSchema, DetailPageTemplateId (+1 more)

### Community 144 - "Community 144"
Cohesion: 0.17
Nodes (10): ChannelSkuAvailabilityItem, ChannelSkuAvailabilityListResponse, ChannelSkuAvailabilityListResponseSchema, ChannelSkuAvailabilityQuery, ChannelSkuAvailabilityQuerySchema, ChannelSkuAvailabilityStatus, ChannelSkuAvailabilityStatusSchema, ChannelSkuAvailabilitySummary (+2 more)

### Community 145 - "System schema"
Cohesion: 0.20
Nodes (11): ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization, ActivityEvent.source (+3 more)

### Community 146 - "Core schema"
Cohesion: 0.22
Nodes (11): CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.keywords, CategoryMapping.organization, CategoryMapping.updatedAt (+3 more)

### Community 147 - "System schema"
Cohesion: 0.20
Nodes (10): FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name, FeatureGate.updatedAt (+2 more)

### Community 148 - "Community 148"
Cohesion: 0.18
Nodes (9): ActionTask, ActionTaskExecuteResponse, ActionTaskList, ActionTaskListSchema, ActionTaskRelatedProduct, ActionTaskRelatedProductSchema, ActionTaskSchema, ActionTaskSourceAlert (+1 more)

### Community 149 - "Community 149"
Cohesion: 0.35
Nodes (9): analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), directOutPortFiles(), FORBIDDEN_IN_PORT_FOLDER_NAMES, forbiddenInPortCallerFolders(), listDirectories(), listFiles(), main() (+1 more)

### Community 150 - "Community 150"
Cohesion: 0.31
Nodes (9): addUnique(), defaultOutputDir, defaultSourceDir, normalizeKiditemOrigin(), patchExtensionRuntimeFiles(), patchManifest(), prepareCoupangExtension(), repoRoot (+1 more)

### Community 151 - "Community 151"
Cohesion: 0.20
Nodes (8): filesDefiningModel(), inventoryImporter, matchingFiles(), migrationRegistry, prismaFiles, repoRoot, serverFiles, sharedFiles

### Community 152 - "Community 152"
Cohesion: 0.20
Nodes (6): Inject, ChannelCatalogImportPort, ImportCoupangWingCatalogInput, ChannelCatalogImportService, Inject, Injectable

### Community 153 - "Community 153"
Cohesion: 0.29
Nodes (7): assertToolInvocationDidNotFail(), ChannelRegistrationRuntimeHandler, coupangSubmissionInput(), optionalStringField(), registrationInput(), stringField(), Injectable

### Community 154 - "Community 154"
Cohesion: 0.22
Nodes (4): PARENT_COLUMN_INDEXES, REQUIRED_HEADERS, workbookBuffer(), WorkbookOptions

### Community 155 - "Advertising schema"
Cohesion: 0.22
Nodes (10): Advertising, ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.id, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.url (+2 more)

### Community 156 - "System schema"
Cohesion: 0.24
Nodes (10): System, SystemSetting.createdAt, SystemSetting.id, SystemSetting.key, SystemSetting.organization, SystemSetting.updatedAt, SystemSetting.value, SystemSetting (+2 more)

### Community 157 - "Community 157"
Cohesion: 0.20
Nodes (8): ReviewFilter, ReviewFilterSchema, ReviewListItem, ReviewListItemSchema, ReviewListResponse, ReviewListResponseSchema, ReviewSummary, ReviewSummarySchema

### Community 158 - "Community 158"
Cohesion: 0.38
Nodes (8): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), main(), parseBaseline(), readFiles(), repoRoot(), walk()

### Community 159 - "Community 159"
Cohesion: 0.31
Nodes (8): parseArgs(), ParsedArgs, parseRawArgs(), ParseRawArgsOptions, pushValue(), values(), COMMANDS, makeArgs()

### Community 160 - "Community 160"
Cohesion: 0.22
Nodes (8): ChannelCatalogImportController, Controller, CurrentOrganization, CurrentUser, Param, Post, UploadedFile, UseInterceptors

### Community 161 - "Community 161"
Cohesion: 0.25
Nodes (5): ChannelsOperationAlertAdapter, Inject, Injectable, OperationLifecyclePatch, StartOperationAlertInput

### Community 162 - "Community 162"
Cohesion: 0.33
Nodes (4): buildCoupangWingSnapshotCoverage(), CoupangWingSnapshotCoverage, ParsedWingCatalogRow, ParsedWingCatalogSkippedRow

### Community 163 - "Community 163"
Cohesion: 0.47
Nodes (7): checkClaudeShims(), checkTrackedClaudeDirectory(), findStaleInstructionLines(), git(), listTracked(), main(), runChecks()

### Community 164 - "Community 164"
Cohesion: 0.29
Nodes (5): RegisterConfirmedMarketplaceListingCapabilityInput, RegisterConfirmedMarketplaceListingCapabilityResult, RegisterConfirmedListingInput, RegisteredMarketplaceListingResult, RegisterConfirmedMarketplaceListingInput

### Community 165 - "Community 165"
Cohesion: 0.25
Nodes (8): MarketplaceRegistrationDto, IsInt, IsOptional, IsString, IsUUID, MaxLength, Type, Min

### Community 166 - "Community 166"
Cohesion: 0.32
Nodes (7): extractNestedSellerProductId(), firstSalePrice(), isExplicitProviderRejection(), numberField(), sellerProductIdFromResponse(), sellerProductName(), stringField()

### Community 167 - "Community 167"
Cohesion: 0.25
Nodes (6): AgentCatalogItem, ConfigurableParam, ConfigurableParamSchema, MarketplaceCatalogItem, MarketplaceCatalogItemSchema, WorkflowCatalogItem

### Community 168 - "Community 168"
Cohesion: 0.25
Nodes (8): assertLocalDevelopmentDatabase(), bootstrapAuthoritativeInventoryDevelopment(), buildBootstrapPlan(), LOCAL_HOSTS, main(), optionalUuid(), parseBootstrapArgs(), slugify()

### Community 169 - "Community 169"
Cohesion: 0.46
Nodes (6): analyzeInventory(), listTopLevelScriptFiles(), main(), repoRoot(), SCRIPT_INVENTORY, SUPPORT_FILES

### Community 170 - "Community 170"
Cohesion: 0.29
Nodes (5): AuthRequiredErrorBody, AuthUserPublic, AuthUserPublicSchema, LoginRequest, LoginRequestSchema

### Community 171 - "Community 171"
Cohesion: 0.29
Nodes (5): ReadinessCheck, ReadinessCheckSchema, ReadinessCheckStatusSchema, ReadinessResponse, ReadinessResponseSchema

### Community 172 - "Community 172"
Cohesion: 0.29
Nodes (5): deletedLegacyTables, repoRoot, retiredBaselineScript, retiredImporterFile, retiredPlannerFile

### Community 174 - "Community 174"
Cohesion: 0.33
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 175 - "Community 175"
Cohesion: 0.47
Nodes (3): PRODUCT_LIFECYCLE_STATES, ProductLifecycleState, ProductLifecycleStateSchema

### Community 176 - "Community 176"
Cohesion: 0.33
Nodes (4): SettlementReconcileDetail, SettlementReconcileDetailSchema, SettlementReconcileResponse, SettlementReconcileResponseSchema

### Community 177 - "Community 177"
Cohesion: 0.40
Nodes (4): isoDate, RangeSchema, SalesAnalysisDataSources, SalesAnalysisDataSourcesSchema

### Community 179 - "prisma field: ChannelReconciliationItem.channel"
Cohesion: 0.50
Nodes (4): ChannelReconciliationItem.channel, ChannelReconciliationItem.itemKey, ChannelReconciliationItem.source, ChannelReconciliationItem unique(organizationId, channel, source, itemKey)

### Community 185 - "Community 185"
Cohesion: 0.50
Nodes (4): is_allowlisted(), is_comment_line(), load_file_lines(), check-tenant-scope.sh script

### Community 186 - "Community 186"
Cohesion: 0.67
Nodes (3): extractEnvKeys(), readModelFile(), redactEnvValues()

## Knowledge Gaps
- **2080 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+2075 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Core schema` to `prisma field: externalOptionId canonical option identity`, `Community 2`, `prisma field: AdAction.externalId`, `Community 4`, `Orders schema`, `Community 6`, `Community 8`, `Channels schema`, `Community 10`, `AgentOS schema`, `AI schema`, `Community 13`, `Orders schema`, `Supply schema`, `Core schema`, `AI schema`, `AI schema`, `Core schema`, `AgentOS schema`, `AI schema`, `AgentOS schema`, `Core schema`, `AI schema`, `AI schema`, `Channels schema`, `Core schema`, `AI schema`, `Sourcing schema`, `AI schema`, `Inventory schema`, `AI schema`, `Community 37`, `AgentOS schema`, `AgentOS schema`, `Sourcing schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Core schema`, `Channels schema`, `Inventory schema`, `Channels schema`, `Supply schema`, `Inventory schema`, `Channels schema`, `Core schema`, `Orders schema`, `Core schema`, `Inventory schema`, `AI schema`, `System schema`, `Advertising schema`, `AgentOS schema`, `Channels schema`, `AI schema`, `AgentOS schema`, `System schema`, `Channels schema`, `Inventory schema`, `Orders schema`, `AgentOS schema`, `Finance schema`, `AI schema`, `Channels schema`, `AgentOS schema`, `Core schema`, `Inventory schema`, `Inventory schema`, `AgentOS schema`, `Inventory schema`, `Channels schema`, `Orders schema`, `prisma field: ActionTask.targetId`, `Inventory schema`, `AgentOS schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Finance schema`, `Orders schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `Inventory schema`, `Advertising schema`, `Inventory schema`, `Finance schema`, `Core schema`, `Supply schema`, `Orders schema`, `Channels schema`, `System schema`, `Core schema`, `System schema`, `Advertising schema`, `System schema`, `prisma field: Organization.id`?**
  _High betweenness centrality (0.221) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `prisma field: externalOptionId canonical option identity` to `Core schema`, `prisma field: AdAction.externalId`, `Orders schema`, `Channels schema`, `AgentOS schema`, `AI schema`, `Orders schema`, `Supply schema`, `Core schema`, `AI schema`, `AI schema`, `Core schema`, `AgentOS schema`, `AI schema`, `AgentOS schema`, `Core schema`, `AI schema`, `AI schema`, `Channels schema`, `Core schema`, `AI schema`, `Sourcing schema`, `AI schema`, `Inventory schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `Sourcing schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Core schema`, `Channels schema`, `System schema`, `Inventory schema`, `Channels schema`, `Advertising schema`, `Supply schema`, `Inventory schema`, `Channels schema`, `Core schema`, `Orders schema`, `Core schema`, `Inventory schema`, `AI schema`, `System schema`, `Advertising schema`, `AgentOS schema`, `Channels schema`, `AI schema`, `AgentOS schema`, `System schema`, `Channels schema`, `Inventory schema`, `Orders schema`, `AgentOS schema`, `Finance schema`, `AI schema`, `Channels schema`, `AgentOS schema`, `Core schema`, `Inventory schema`, `Inventory schema`, `AgentOS schema`, `Inventory schema`, `Channels schema`, `Orders schema`, `prisma field: ActionTask.targetId`, `Inventory schema`, `AgentOS schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Finance schema`, `Orders schema`, `System schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `Inventory schema`, `Advertising schema`, `Inventory schema`, `Finance schema`, `Core schema`, `Supply schema`, `Orders schema`, `Channels schema`, `System schema`, `System schema`, `Core schema`, `System schema`, `Advertising schema`, `System schema`?**
  _High betweenness centrality (0.159) - this node is a cross-community bridge._
- **Why does `Order` connect `Orders schema` to `Core schema`, `prisma field: externalOptionId canonical option identity`, `Community 2`, `prisma field: AdAction.externalId`, `Community 4`, `Orders schema`, `Community 7`, `Community 8`, `Community 10`, `Community 139`, `AI schema`, `Community 14`, `Community 149`, `Core schema`, `Community 33`, `Community 37`, `Community 177`, `Inventory schema`, `Orders schema`, `Community 64`, `Orders schema`, `Channels schema`, `Core schema`, `Community 98`, `Orders schema`, `prisma field: ActionTask.targetId`, `Orders schema`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Are the 126 inferred relationships involving `Organization` (e.g. with `channel-registration-capability.adapter.ts` and `channel-registration-capability.adapter.spec.ts`) actually correct?**
  _`Organization` has 126 INFERRED edges - model-reasoned connections that need verification._
- **Are the 52 inferred relationships involving `ChannelListing` (e.g. with `channel-registration-capability.adapter.ts` and `channel-registration-capability.adapter.spec.ts`) actually correct?**
  _`ChannelListing` has 52 INFERRED edges - model-reasoned connections that need verification._
- **Are the 27 inferred relationships involving `MasterProduct` (e.g. with `channel-dashboard.repository.adapter.ts` and `channel-listing.repository.adapter.ts`) actually correct?**
  _`MasterProduct` has 27 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason` to the rest of the system?**
  _2080 weakly-connected nodes found - possible documentation gaps or missing edges._