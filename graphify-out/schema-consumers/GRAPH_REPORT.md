# Graph Report - schema-consumers  (2026-07-16)

## Corpus Check
- 337 files · ~156,635 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5052 nodes · 24552 edges · 232 communities (217 shown, 15 thin omitted)
- Extraction: 36% EXTRACTED · 64% INFERRED · 0% AMBIGUOUS · INFERRED: 15610 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Core schema
- Community 1
- Core schema
- prisma field: Database ERD
- Core schema
- Community 5
- Community 6
- prisma field: AdAction.externalId
- Community 8
- AI schema
- Orders schema
- AI schema
- Supply schema
- Core schema
- Channels schema
- Community 15
- AgentOS schema
- Orders schema
- Community 18
- Community 19
- Community 20
- AI schema
- AI schema
- AI schema
- Community 24
- AgentOS schema
- Community 26
- Community 27
- Community 28
- Supply schema
- AgentOS schema
- Community 31
- Sourcing schema
- Community 33
- Community 34
- Core schema
- AI schema
- Community 37
- Core schema
- Community 39
- Channels schema
- AI schema
- AI schema
- Community 43
- Sourcing schema
- System schema
- Community 46
- AgentOS schema
- AgentOS schema
- Inventory schema
- Inventory schema
- Channels schema
- Inventory schema
- Community 53
- System schema
- AgentOS schema
- AgentOS schema
- Community 57
- Community 58
- Community 59
- Channels schema
- Inventory schema
- Community 62
- Community 63
- Community 64
- Supply schema
- Community 66
- Community 67
- Channels schema
- Community 69
- Community 70
- Channels schema
- System schema
- Advertising schema
- AgentOS schema
- Orders schema
- Community 76
- Community 77
- Channels schema
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- AgentOS schema
- System schema
- Channels schema
- Sourcing schema
- Orders schema
- Sourcing schema
- AI schema
- AgentOS schema
- AgentOS schema
- Finance schema
- Sourcing schema
- AI schema
- Community 96
- Channels schema
- Supply schema
- Inventory schema
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- AgentOS schema
- Sourcing schema
- Sourcing schema
- Channels schema
- Community 109
- Community 110
- Community 111
- Community 112
- Community 113
- Community 114
- Community 115
- AgentOS schema
- Channels schema
- Channels schema
- Advertising schema
- Inventory schema
- Supply schema
- Orders schema
- Community 123
- Community 124
- Community 125
- Orders schema
- System schema
- Sourcing schema
- Finance schema
- Finance schema
- Inventory schema
- Community 132
- Finance schema
- Advertising schema
- Finance schema
- Community 136
- Community 137
- Community 138
- Channels schema
- Core schema
- Channels schema
- Community 142
- Community 143
- Channels schema
- System schema
- Community 146
- Community 147
- Community 148
- Community 149
- Advertising schema
- System schema
- System schema
- Community 153
- Community 154
- Community 155
- Community 156
- System schema
- Advertising schema
- Sourcing schema
- Community 160
- Community 161
- Community 162
- Community 163
- Channels schema
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
- Community 179
- Community 180
- Community 181
- Community 182
- Community 183
- Community 184
- Community 185
- Community 186
- Community 187
- prisma field: Organization.id
- Community 189
- Community 190
- Community 216

## God Nodes (most connected - your core abstractions)
1. `Organization` - 366 edges
2. `Database ERD` - 327 edges
3. `ChannelAccount` - 149 edges
4. `Order` - 146 edges
5. `prisma — Shared Schema` - 142 edges
6. `ChannelListing` - 141 edges
7. `User` - 140 edges
8. `ContentWorkspace.organizationId` - 134 edges
9. `ProductPreparation.organizationId` - 134 edges
10. `SourceImportRun.organizationId` - 129 edges
11. `ChannelListing.organizationId` - 129 edges
12. `ContentWorkspaceThumbnailSelection.organizationId` - 128 edges

## Surprising Connections (you probably didn't know these)
- `packages/shared — @kiditem/shared` --mentions_domain--> `Inventory`  [EXTRACTED]
  packages/shared/AGENTS.md → prisma/models/inventory.prisma
- `bootstrap()` --indirect_call--> `account()`  [INFERRED]
  scripts/authoritative-inventory-rebuild.ts → apps/server/src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts
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

## Import Cycles
- None detected.

## Communities (232 total, 15 thin omitted)

### Community 0 - "Core schema"
Cohesion: 0.16
Nodes (196): UploadedWorkbookFile, HEADERS, USER, chunkSelect, ErrorInput, LockedRun, OwnedRunInput, PutChunkInput (+188 more)

### Community 1 - "Community 1"
Cohesion: 0.02
Nodes (101): AgentApprovalRequestSummary, AgentApprovalRequestSummarySchema, AgentApprovalStatus, AgentApprovalStatusSchema, AgentArtifactHandoffSummary, AgentArtifactHandoffSummarySchema, AgentArtifactStatus, AgentArtifactStatusSchema (+93 more)

### Community 2 - "Core schema"
Cohesion: 0.05
Nodes (81): ChannelSkuMappingCounts, ChannelSkuMappingListQuery, capCandidateLimit(), ChannelSkuMappingService, dedupeCandidates(), distinctNormalizedIdentifiers(), distinctTrimmed(), exactCodeEvidence() (+73 more)

### Community 3 - "prisma field: Database ERD"
Cohesion: 0.07
Nodes (63): ListingForProductSync, Database ERD, ActionTask.targetId, ActionTask.targetType, AdAction.listingOptionId, AdAction.targetType, AgentApprovalRequest.agentInstanceId, AgentArtifact.agentInstanceId (+55 more)

### Community 4 - "Core schema"
Cohesion: 0.03
Nodes (66): CHANNEL_LISTING_SORTS, CHANNEL_LISTING_TABS, Core, CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory (+58 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (67): AdapterCommand, appendFlag(), appendOption(), appendProjectReferenceDefaults(), archiveFileName(), archiveShaFileName(), Args, BundleManifest (+59 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (61): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot, AdCampaignSnapshotSchema (+53 more)

### Community 7 - "prisma field: AdAction.externalId"
Cohesion: 0.14
Nodes (46): aggregateMappingStatus(), contains(), firstPrice(), ListingRow, parseQueryDate(), positiveInteger(), toSummary(), ChannelListingListResult (+38 more)

### Community 8 - "Community 8"
Cohesion: 0.05
Nodes (26): ChannelsSellpiaMasterProductReadAdapter, Inject, Injectable, asMappingStatus(), availabilityStatusSql(), ChannelSkuMappingRepositoryAdapter, contains(), emptyAvailabilityPageMeta() (+18 more)

### Community 9 - "AI schema"
Cohesion: 0.04
Nodes (59): packages/shared — @kiditem/shared, AI, ProductPreparation.selectedThumbnailGenerationId, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.contentWorkspaceId, ThumbnailGeneration.createdAt, ThumbnailGeneration.deletedAt (+51 more)

### Community 10 - "Orders schema"
Cohesion: 0.04
Nodes (48): formatKstIso(), normalizeCoupangOrderStatus(), normalizeCoupangProductStatus(), CHANNELS_ROOT, REPO_ROOT, Order.channelAccount, Order.channelAccountId, Order.createdAt (+40 more)

### Community 11 - "AI schema"
Cohesion: 0.04
Nodes (54): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height (+46 more)

### Community 12 - "Supply schema"
Cohesion: 0.05
Nodes (52): PurchaseOrder.supplierId, Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.id, Supplier.leadTimeDays, Supplier.name (+44 more)

### Community 13 - "Core schema"
Cohesion: 0.05
Nodes (52): AvailabilityPageMetaRow, QUEUE_SOURCE_TYPES, REPLACEMENT_TRANSACTION_OPTIONS, SelectedMappingRow, ChannelSkuAvailabilityRepositorySummary, ChannelSkuMappingStatus, externalOptionId canonical option identity, vendorItemId provider term (+44 more)

### Community 14 - "Channels schema"
Cohesion: 0.04
Nodes (55): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+47 more)

### Community 15 - "Community 15"
Cohesion: 0.07
Nodes (49): ActionTask, ActionTaskExecuteResponse, ActionTaskList, ActionTaskListSchema, ActionTaskRelatedProduct, ActionTaskRelatedProductSchema, ActionTaskSchema, ActionTaskSourceAlert (+41 more)

### Community 16 - "AgentOS schema"
Cohesion: 0.04
Nodes (52): AgentOS, AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy, AgentAuthorizationEvent.decidedByUserId (+44 more)

### Community 17 - "Orders schema"
Cohesion: 0.05
Nodes (48): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.metadata, OrderLineItem.optionName, OrderLineItem.order, OrderLineItem.organization (+40 more)

### Community 18 - "Community 18"
Cohesion: 0.09
Nodes (45): apiHeaders(), apiUrl(), Args, assertSafeDatasetId(), assertSupportedReplayPayloads(), BundleManifest, BundlePayload, BundleReference (+37 more)

### Community 19 - "Community 19"
Cohesion: 0.07
Nodes (24): DATA_MIGRATION_RELEASES, DataMigration, backfillSourcingCandidatesFromMasterProducts, isLegacyDetailEditorHref(), rewriteLegacyDetailEditorAlertHrefs, rewriteLegacyDetailEditorHref(), relabelImageEditAgentInstancesToGeminiImage, backfillContentArchiveClassification (+16 more)

### Community 20 - "Community 20"
Cohesion: 0.10
Nodes (48): assertNonProductionTarget(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged(), assertSha256(), BaselineManifest, BaselineManifestExpectation, baselineObjectKeys, buildChecksumsFile() (+40 more)

### Community 21 - "AI schema"
Cohesion: 0.05
Nodes (45): ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.editedHtmlSavedAt, ContentGeneration.errorMessage (+37 more)

### Community 22 - "AI schema"
Cohesion: 0.05
Nodes (45): ContentGeneration.detailPageArtifactId, ContentWorkspace.currentDetailPageArtifactId, ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.contentWorkspaceId, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.createdByUserId (+37 more)

### Community 23 - "AI schema"
Cohesion: 0.05
Nodes (46): ContentGeneration.contentWorkspaceId, ContentWorkspace.channelListing, ContentWorkspace.channelListingId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageRevision, ContentWorkspace.currentThumbnailSelection (+38 more)

### Community 24 - "Community 24"
Cohesion: 0.04
Nodes (42): ChunkRequestBaseSchema, CoupangCatalogAttributeV1, CoupangCatalogAttributeV1Schema, CoupangCatalogBrowserCommand, CoupangCatalogBrowserCommandSchema, CoupangCatalogBrowserStatus, CoupangCatalogBrowserStatusSchema, CoupangCatalogChunkKind (+34 more)

### Community 25 - "AgentOS schema"
Cohesion: 0.05
Nodes (44): AgentRunRequest.agentInstance, AgentRunRequest.attempts, AgentRunRequest.claimedAt, AgentRunRequest.claimedBy, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.coalescedIntoRequestId, AgentRunRequest.conversation, AgentRunRequest.createdAt (+36 more)

### Community 26 - "Community 26"
Cohesion: 0.05
Nodes (42): deriveSellpiaInventoryFreshness(), FixedSellpiaAccountKeySchema, FixedSellpiaOriginSchema, IsoDateTimeStringSchema, SELLPIA_INVENTORY_FRESHNESS_STATUSES, SELLPIA_INVENTORY_REFRESH_REASONS, SellpiaFreshnessDerivationInput, SellpiaInventoryActiveSyncViewSchema (+34 more)

### Community 27 - "Community 27"
Cohesion: 0.09
Nodes (39): applyCacheControl(), ApplyResult, applyS3CacheControl(), applySupabaseCacheControl(), assertApplyAllowed(), buildCopyObjectInput(), CliArgs, CliConfig (+31 more)

### Community 28 - "Community 28"
Cohesion: 0.07
Nodes (35): ChannelCatalogImportController, Controller, Inject, ChannelSkuAvailabilityController, Controller, ChannelListingRepositoryAdapter, Injectable, CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT (+27 more)

### Community 29 - "Supply schema"
Cohesion: 0.05
Nodes (39): AVAILABILITY_STATUSES, channels — Marketplace Sync + SKU Matching, Inventory, Orders, Sourcing, Supply, PurchaseOrderItem.createdAt, PurchaseOrderItem.id (+31 more)

### Community 30 - "AgentOS schema"
Cohesion: 0.05
Nodes (42): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+34 more)

### Community 31 - "Community 31"
Cohesion: 0.08
Nodes (21): ChannelSyncController, Body, Controller, CurrentOrganization, CurrentUser, Get, Post, OperationAlertPort (+13 more)

### Community 32 - "Sourcing schema"
Cohesion: 0.05
Nodes (41): CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id, CandidateImage.isPrimary (+33 more)

### Community 33 - "Community 33"
Cohesion: 0.05
Nodes (36): PANEL_RUN_SOURCES, PanelRunSource, PanelRunSourceSchema, sourceKeys, PANEL_ITEM_KINDS, PanelAlertItem, PanelAlertItemSchema, PanelDismissEventSchema (+28 more)

### Community 34 - "Community 34"
Cohesion: 0.05
Nodes (39): AdMetricsDetail, AdMetricsDetailSchema, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary, DashboardAdSummarySchema (+31 more)

### Community 35 - "Core schema"
Cohesion: 0.06
Nodes (36): ContentGeneration.triggeredByUserId, ContentWorkspace.createdByUserId, OrganizationMembership.createdAt, OrganizationMembership.id, OrganizationMembership.invitedBy, OrganizationMembership.invitedById, OrganizationMembership.joinedAt, OrganizationMembership.lastSelectedAt (+28 more)

### Community 36 - "AI schema"
Cohesion: 0.06
Nodes (38): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+30 more)

### Community 37 - "Community 37"
Cohesion: 0.11
Nodes (36): DATA_MIGRATION_IDS, dataMigrations, DataMigrationContext, DataMigrationTarget, MigrationResult, appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertMutatingTarget() (+28 more)

### Community 38 - "Core schema"
Cohesion: 0.07
Nodes (35): ChannelListing.lastImportRunId, ChannelListingOption.lastImportRunId, MasterProduct.lastImportRunId, SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.createdAt, SourceImportRun.createdBy (+27 more)

### Community 39 - "Community 39"
Cohesion: 0.06
Nodes (28): ChannelAccountListItem, ChannelAccountListItemSchema, CoupangAccountSettings, CoupangAccountSettingsSchema, UpdateCoupangAccountSettings, ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow (+20 more)

### Community 40 - "Channels schema"
Cohesion: 0.07
Nodes (35): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel, ChannelAdTargetDailySnapshot.clicks (+27 more)

### Community 41 - "AI schema"
Cohesion: 0.06
Nodes (35): ProductPreparation.channelAccount, ProductPreparation.channelAccountId, ProductPreparation.channelListing, ProductPreparation.channelListingId, ProductPreparation.createdAt, ProductPreparation.createdByUser, ProductPreparation.deletedAt, ProductPreparation.displayName (+27 more)

### Community 42 - "AI schema"
Cohesion: 0.07
Nodes (31): ProductPreparation.selectedThumbnailGenerationCandidateId, ThumbnailGenerationCandidate.createdAt, ThumbnailGenerationCandidate.filename, ThumbnailGenerationCandidate.fileSize, ThumbnailGenerationCandidate.generation, ThumbnailGenerationCandidate.generationId, ThumbnailGenerationCandidate.height, ThumbnailGenerationCandidate.id (+23 more)

### Community 43 - "Community 43"
Cohesion: 0.06
Nodes (34): ACCOUNT_AD_DAILY_DIGEST_KEYS, AD_ROW_KEYS, AD_SUMMARY_KEYS, ADS_DAILY_ROW_KEYS, ADS_KPI_KEYS, assertExactCount(), assertProtectedSupabaseDestination(), assertReadyCounts() (+26 more)

### Community 44 - "Sourcing schema"
Cohesion: 0.07
Nodes (32): ContentGeneration.sourceCandidateId, SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.id, SourcingCandidate.imageUrl (+24 more)

### Community 45 - "System schema"
Cohesion: 0.06
Nodes (28): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon, Marketplace.id (+20 more)

### Community 46 - "Community 46"
Cohesion: 0.07
Nodes (31): DeliveryCompany, DeliveryCompanySchema, Order, OrderActionResponse, OrderActionResponseSchema, OrderLineItem, OrderLineItemSchema, OrderListItem (+23 more)

### Community 47 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+25 more)

### Community 48 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.startedAt, WorkflowRun.status (+25 more)

### Community 49 - "Inventory schema"
Cohesion: 0.07
Nodes (33): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.fromWarehouseId, StockTransfer.id, StockTransfer.masterProduct, StockTransfer.masterProductId, StockTransfer.notes (+25 more)

### Community 50 - "Inventory schema"
Cohesion: 0.07
Nodes (32): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.masterProduct, PickingItem.masterProductId, PickingItem.organization (+24 more)

### Community 51 - "Channels schema"
Cohesion: 0.08
Nodes (31): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.channelAccount, ChannelScrapeRun.channelAccountId, ChannelScrapeRun.clientRunKey, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson (+23 more)

### Community 52 - "Inventory schema"
Cohesion: 0.08
Nodes (26): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.sourceRef, SellpiaReceiptUploadBatch.sourceType (+18 more)

### Community 53 - "Community 53"
Cohesion: 0.08
Nodes (24): upsertChannelCatalogIdentities(), assertActiveCoupangAccount(), assertCanonicalAccount(), ChannelCatalogPublicationRepositoryAdapter, completeCollectionRun(), completedCollectionResult(), flattenMedia(), jsonRecord() (+16 more)

### Community 54 - "System schema"
Cohesion: 0.07
Nodes (26): Alert.actionTask, Alert.actorUser, Alert.actorUserId, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead (+18 more)

### Community 55 - "AgentOS schema"
Cohesion: 0.07
Nodes (28): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.approver, AgentApprovalRequest.approverUserId, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy, AgentApprovalRequest.decidedByUserId (+20 more)

### Community 56 - "AgentOS schema"
Cohesion: 0.08
Nodes (28): AgentToolInvocation.agentInstance, AgentToolInvocation.approvalRequest, AgentToolInvocation.approvalRequestId, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt, AgentToolInvocation.errorCode (+20 more)

### Community 57 - "Community 57"
Cohesion: 0.09
Nodes (22): adapterPaths, BROWSER_COLLECTION_ATTENTION_REASONS, BROWSER_COLLECTION_PRODUCERS, BROWSER_COLLECTION_STATES, BrowserCollectionAttentionReasonSchema, BrowserCollectionClassificationSchema, BrowserCollectionCommand, BrowserCollectionCommandSchema (+14 more)

### Community 58 - "Community 58"
Cohesion: 0.14
Nodes (27): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+19 more)

### Community 59 - "Community 59"
Cohesion: 0.15
Nodes (26): cellText(), collectParentMetadataConflicts(), decodeWorksheetRange(), expandMergedParentCells(), findHeaderRow(), formattedCellText(), hasCellValue(), headersForRow() (+18 more)

### Community 60 - "Channels schema"
Cohesion: 0.08
Nodes (27): CoupangWingSalesRankDailySnapshot.businessDate, CoupangWingSalesRankDailySnapshot.capturedAt, CoupangWingSalesRankDailySnapshot.categoryHierarchy, CoupangWingSalesRankDailySnapshot.collectedCount, CoupangWingSalesRankDailySnapshot.conversionRate28d, CoupangWingSalesRankDailySnapshot.createdAt, CoupangWingSalesRankDailySnapshot.id, CoupangWingSalesRankDailySnapshot.itemId (+19 more)

### Community 61 - "Inventory schema"
Cohesion: 0.07
Nodes (27): SellpiaInventoryState.activeGeneration, SellpiaInventoryState.activeSyncLeaseExpiresAt, SellpiaInventoryState.activeSyncOwner, SellpiaInventoryState.activeSyncOwnerUserId, SellpiaInventoryState.activeSyncStartedAt, SellpiaInventoryState.activeSyncToken, SellpiaInventoryState.createdAt, SellpiaInventoryState.failedGeneration (+19 more)

### Community 62 - "Community 62"
Cohesion: 0.09
Nodes (23): SellpiaInventoryQualityReportSchema, SellpiaInventoryRefreshReasonSchema, CompletedSourceArtifactRun, CoupangWingCatalogImportResponse, CoupangWingCatalogImportResponseSchema, ImportChanges, SellpiaInventoryImportOutcome, SellpiaInventoryImportOutcomeSchema (+15 more)

### Community 63 - "Community 63"
Cohesion: 0.13
Nodes (23): analyzeReconstructionTriggers(), changedFilesFromGit(), ghPrBody(), git(), isCrossLayerControlChange(), isHighRiskBoundary(), isLargeServiceOrComponent(), layerOf() (+15 more)

### Community 64 - "Community 64"
Cohesion: 0.09
Nodes (18): ChannelListingController, Controller, CurrentOrganization, Get, Param, Query, ChannelListingQueryDto, IsIn (+10 more)

### Community 65 - "Supply schema"
Cohesion: 0.08
Nodes (26): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+18 more)

### Community 66 - "Community 66"
Cohesion: 0.13
Nodes (14): ChannelRegistrationCapabilityAdapter, Injectable, ChannelsMarketplaceRegistrationCapabilityPort, ProductRegistrationSubmissionCapabilityInput, ResolveProductRegistrationCapabilityInput, asRecord(), extractNestedSellerProductId(), isExplicitProviderRejection() (+6 more)

### Community 67 - "Community 67"
Cohesion: 0.08
Nodes (22): RocketPoCatalogResolution, canonicalArtifactHash(), isCompleteCollection(), boundedText(), isoDay, requiredText(), RocketPoCatalogPublication, RocketPoCatalogPublicationSchema (+14 more)

### Community 68 - "Channels schema"
Cohesion: 0.09
Nodes (25): ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isOfferWinner, ChannelListingOptionDailySnapshot.lastObservedAt, ChannelListingOptionDailySnapshot.listing (+17 more)

### Community 69 - "Community 69"
Cohesion: 0.08
Nodes (22): StatisticsCategoryRow, StatisticsCategoryRowSchema, StatisticsDeliveryDaily, StatisticsDeliveryDailySchema, StatisticsDeliveryResponse, StatisticsDeliveryResponseSchema, StatisticsGradeRow, StatisticsGradeRowSchema (+14 more)

### Community 70 - "Community 70"
Cohesion: 0.13
Nodes (16): ChannelAccountRepositoryAdapter, envelopeToJson(), maskAccessKey(), readCredentialsConfig(), stripLegacyCredentialKeys(), toJsonRecord(), toRecord(), trimToOptional() (+8 more)

### Community 71 - "Channels schema"
Cohesion: 0.09
Nodes (23): ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.id, ChannelScrapeSnapshot.listing, ChannelScrapeSnapshot.listingOption (+15 more)

### Community 72 - "System schema"
Cohesion: 0.10
Nodes (23): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.href (+15 more)

### Community 73 - "Advertising schema"
Cohesion: 0.09
Nodes (23): AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+15 more)

### Community 74 - "AgentOS schema"
Cohesion: 0.09
Nodes (23): AgentInstance.adapterConfig, AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.icon, AgentInstance.id, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name (+15 more)

### Community 75 - "Orders schema"
Cohesion: 0.10
Nodes (23): OrderReturn.channelAccount, OrderReturn.channelAccountId, OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.id (+15 more)

### Community 76 - "Community 76"
Cohesion: 0.22
Nodes (8): ChannelDashboardController, Controller, CurrentOrganization, Get, Query, CoupangDateRangeQueryDto, ChannelDashboardService, Injectable

### Community 77 - "Community 77"
Cohesion: 0.10
Nodes (6): CoupangProviderPort, ChannelSyncRepositoryPort, OrderSyncDeps, ProductSyncDeps, Inject, Optional

### Community 78 - "Channels schema"
Cohesion: 0.11
Nodes (22): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.channelAccount, ChannelAccountDailyKpiSnapshot.channelAccountId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+14 more)

### Community 79 - "Community 79"
Cohesion: 0.09
Nodes (20): ChannelSkuMappingComponent, ChannelSkuMappingComponentSchema, ChannelSkuMappingCounts, ChannelSkuMappingCountsSchema, ChannelSkuMappingListItem, ChannelSkuMappingListResponse, ChannelSkuMappingListResponseSchema, ChannelSkuMappingStatus (+12 more)

### Community 80 - "Community 80"
Cohesion: 0.22
Nodes (18): Path, add_code_reference_edges(), add_document_mentions(), add_schema_graph(), camel(), collect_code(), community_labels(), GraphBuilder (+10 more)

### Community 81 - "Community 81"
Cohesion: 0.20
Nodes (14): CoupangCredentials, coupangRequest(), CoupangRequestOptions, generateAuthorization(), approveReturn(), confirmOrderSheets(), DELIVERY_COMPANIES, getOrderSheets() (+6 more)

### Community 82 - "Community 82"
Cohesion: 0.10
Nodes (10): CoupangProviderAdapter, Inject, Injectable, CoupangCreateSellerProductResponse, CoupangSellerProductPayload, OrderSheetResponse, SellerProductDetailResponse, SellerProductExternalSkuResponse (+2 more)

### Community 83 - "Community 83"
Cohesion: 0.13
Nodes (21): assembleCompleteSnapshot(), assertSameManifest(), buildCollectionStatus(), countMedia(), countOptions(), derivePhase(), firstDate(), hashCatalogChunkPayload() (+13 more)

### Community 84 - "AgentOS schema"
Cohesion: 0.10
Nodes (21): AgentArtifact.agentInstance, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization, AgentArtifact.request (+13 more)

### Community 85 - "System schema"
Cohesion: 0.10
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+13 more)

### Community 86 - "Channels schema"
Cohesion: 0.11
Nodes (21): CoupangKeywordRankDailySnapshot.adRank, CoupangKeywordRankDailySnapshot.businessDate, CoupangKeywordRankDailySnapshot.capturedAt, CoupangKeywordRankDailySnapshot.createdAt, CoupangKeywordRankDailySnapshot.id, CoupangKeywordRankDailySnapshot.itemId, CoupangKeywordRankDailySnapshot.keyword, CoupangKeywordRankDailySnapshot.organicRank (+13 more)

### Community 87 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): LiveCommerceBroadcastDailySnapshot.broadcasterId, LiveCommerceBroadcastDailySnapshot.broadcasterName, LiveCommerceBroadcastDailySnapshot.broadcastId, LiveCommerceBroadcastDailySnapshot.businessDate, LiveCommerceBroadcastDailySnapshot.capturedAt, LiveCommerceBroadcastDailySnapshot.coverImageUrl, LiveCommerceBroadcastDailySnapshot.createdAt, LiveCommerceBroadcastDailySnapshot.endedAt (+13 more)

### Community 88 - "Orders schema"
Cohesion: 0.10
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 89 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): ShortsTrendDailySnapshot.businessDate, ShortsTrendDailySnapshot.capturedAt, ShortsTrendDailySnapshot.channelName, ShortsTrendDailySnapshot.commentCount, ShortsTrendDailySnapshot.createdAt, ShortsTrendDailySnapshot.id, ShortsTrendDailySnapshot.keyword, ShortsTrendDailySnapshot.likeCount (+13 more)

### Community 90 - "AI schema"
Cohesion: 0.10
Nodes (21): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.contentWorkspace, ThumbnailAnalysis.contentWorkspaceId, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id (+13 more)

### Community 91 - "AgentOS schema"
Cohesion: 0.11
Nodes (20): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id, AgentCostEvent.inputTokens (+12 more)

### Community 92 - "AgentOS schema"
Cohesion: 0.12
Nodes (20): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.agentInstanceId, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError (+12 more)

### Community 93 - "Finance schema"
Cohesion: 0.12
Nodes (20): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit (+12 more)

### Community 94 - "Sourcing schema"
Cohesion: 0.12
Nodes (20): Sourcing1688HotProductDailySnapshot.businessDate, Sourcing1688HotProductDailySnapshot.capturedAt, Sourcing1688HotProductDailySnapshot.createdAt, Sourcing1688HotProductDailySnapshot.id, Sourcing1688HotProductDailySnapshot.imageUrl, Sourcing1688HotProductDailySnapshot.monthlySales, Sourcing1688HotProductDailySnapshot.offerId, Sourcing1688HotProductDailySnapshot.organization (+12 more)

### Community 95 - "AI schema"
Cohesion: 0.11
Nodes (18): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt (+10 more)

### Community 96 - "Community 96"
Cohesion: 0.16
Nodes (11): assertCanonicalCoupangAccountIdentity(), canonicalParentRows(), ChannelCatalogImportRepositoryAdapter, importResponse(), isUniqueConstraintError(), nextPublicationSequence(), Injectable, zeroChanges() (+3 more)

### Community 97 - "Channels schema"
Cohesion: 0.12
Nodes (19): CoupangWingTrackedProductDailySnapshot.businessDate, CoupangWingTrackedProductDailySnapshot.capturedAt, CoupangWingTrackedProductDailySnapshot.conversionRate28d, CoupangWingTrackedProductDailySnapshot.createdAt, CoupangWingTrackedProductDailySnapshot.estimatedRevenue28d, CoupangWingTrackedProductDailySnapshot.id, CoupangWingTrackedProductDailySnapshot.organization, CoupangWingTrackedProductDailySnapshot.pvLast28Day (+11 more)

### Community 98 - "Supply schema"
Cohesion: 0.12
Nodes (19): PurchaseOrderSubmissionAttempt.createdAt, PurchaseOrderSubmissionAttempt.errorCode, PurchaseOrderSubmissionAttempt.errorMessage, PurchaseOrderSubmissionAttempt.freshnessGeneration, PurchaseOrderSubmissionAttempt.id, PurchaseOrderSubmissionAttempt.idempotencyKey, PurchaseOrderSubmissionAttempt.organization, PurchaseOrderSubmissionAttempt.providerReference (+11 more)

### Community 99 - "Inventory schema"
Cohesion: 0.12
Nodes (19): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.masterProduct, ReturnTransfer.masterProductId, ReturnTransfer.notes (+11 more)

### Community 100 - "Community 100"
Cohesion: 0.15
Nodes (14): PRODUCT_LIFECYCLE_STATES, ProductLifecycleState, ProductLifecycleStateSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, MasterImageItem, MasterImageItemSchema, MasterImageRole (+6 more)

### Community 101 - "Community 101"
Cohesion: 0.23
Nodes (13): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), scrubDeep(), scrubSecrets(), walk(), checkClaudeShims(), checkTrackedClaudeDirectory() (+5 more)

### Community 102 - "Community 102"
Cohesion: 0.22
Nodes (17): analyzePrReleaseContract(), changedFilesFromGit(), classifyFiles(), compareSemver(), ghPrBody(), git(), hasReleaseDecision(), isDevelopToMainPromotion() (+9 more)

### Community 103 - "Community 103"
Cohesion: 0.16
Nodes (17): appendValues(), Lane, parseArgs(), ParsedArgs, parseRawArgs(), ParseRawArgsOptions, pushValue(), value() (+9 more)

### Community 104 - "Community 104"
Cohesion: 0.12
Nodes (12): ChannelAccountController, Body, Controller, CurrentOrganization, Get, CoupangCredentials, ChannelAccountService, Inject (+4 more)

### Community 105 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.id, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.lastRunId (+10 more)

### Community 106 - "Sourcing schema"
Cohesion: 0.14
Nodes (18): LiveCommerceProductDailySnapshot.broadcastId, LiveCommerceProductDailySnapshot.businessDate, LiveCommerceProductDailySnapshot.capturedAt, LiveCommerceProductDailySnapshot.createdAt, LiveCommerceProductDailySnapshot.id, LiveCommerceProductDailySnapshot.imageUrl, LiveCommerceProductDailySnapshot.organization, LiveCommerceProductDailySnapshot.priceCny (+10 more)

### Community 107 - "Sourcing schema"
Cohesion: 0.13
Nodes (18): NaverKeywordDailySnapshot.averageAdRank, NaverKeywordDailySnapshot.businessDate, NaverKeywordDailySnapshot.capturedAt, NaverKeywordDailySnapshot.competitionIndex, NaverKeywordDailySnapshot.createdAt, NaverKeywordDailySnapshot.id, NaverKeywordDailySnapshot.keyword, NaverKeywordDailySnapshot.monthlyMobileSearchCount (+10 more)

### Community 108 - "Channels schema"
Cohesion: 0.12
Nodes (18): RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt, RocketPurchaseOrder.firstSkuName, RocketPurchaseOrder.id, RocketPurchaseOrder.items, RocketPurchaseOrder.orderAmount, RocketPurchaseOrder.orderedAt (+10 more)

### Community 109 - "Community 109"
Cohesion: 0.11
Nodes (16): CANCEL_OPERATION_TARGET_TYPES, CancelOperationAffected, CancelOperationAffectedSchema, CancelOperationPreserved, CancelOperationPreservedSchema, CancelOperationResponse, CancelOperationResponseSchema, CancelOperationStatus (+8 more)

### Community 110 - "Community 110"
Cohesion: 0.22
Nodes (18): assertCurrentRebuildBinding(), assertProtectedApiDestination(), assertReplayCounts(), assertReplayFactDigest(), bootstrap(), buildSharedBootstrapPlan(), cliValue(), createPrisma() (+10 more)

### Community 111 - "Community 111"
Cohesion: 0.12
Nodes (8): ChannelAccountListController, Controller, CurrentOrganization, Get, ChannelAccountRepositoryPort, ChannelAccountQueryService, Inject, Injectable

### Community 112 - "Community 112"
Cohesion: 0.18
Nodes (8): ChannelCatalogCollectionRepositoryAdapter, isUniqueConstraintError(), ownedRunWhere(), Injectable, ChannelCatalogCollectionChunkRecord, ChannelCatalogCollectionRunRecord, ChannelCatalogCollectionWithChunks, startRun()

### Community 113 - "Community 113"
Cohesion: 0.23
Nodes (5): Inject, ChannelCatalogCollectionPort, ChannelCatalogCollectionService, parseRequest(), Injectable

### Community 114 - "Community 114"
Cohesion: 0.15
Nodes (7): Inject, ChannelSkuAvailabilityPort, ChannelSkuAvailabilityService, hydrateChannelSkuAvailabilityRows(), Injectable, ChannelSkuStockComponent, projectChannelSkuSellableStock()

### Community 115 - "Community 115"
Cohesion: 0.12
Nodes (15): CurrentOrganization, Get, Query, ChannelSkuAvailabilityQueryDto, IsIn, IsInt, IsOptional, IsPositive (+7 more)

### Community 116 - "AgentOS schema"
Cohesion: 0.15
Nodes (16): AgentRunEvent.agentInstance, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message, AgentRunEvent.organization (+8 more)

### Community 117 - "Channels schema"
Cohesion: 0.16
Nodes (16): ChannelScrapeChunk.checksum, ChannelScrapeChunk.createdAt, ChannelScrapeChunk.id, ChannelScrapeChunk.itemCount, ChannelScrapeChunk.kind, ChannelScrapeChunk.organization, ChannelScrapeChunk.payload, ChannelScrapeChunk.publicationJson (+8 more)

### Community 118 - "Channels schema"
Cohesion: 0.14
Nodes (16): CoupangWingTrackedProduct.brandName, CoupangWingTrackedProduct.categoryHierarchy, CoupangWingTrackedProduct.createdAt, CoupangWingTrackedProduct.enabled, CoupangWingTrackedProduct.id, CoupangWingTrackedProduct.imagePath, CoupangWingTrackedProduct.itemId, CoupangWingTrackedProduct.lastCapturedAt (+8 more)

### Community 119 - "Advertising schema"
Cohesion: 0.13
Nodes (16): ExecutionTask.action, ExecutionTask.actionId, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt, ExecutionTask.errorMessage, ExecutionTask.finishedAt (+8 more)

### Community 120 - "Inventory schema"
Cohesion: 0.14
Nodes (15): SellpiaOrderTransmissionIntent.abortedAt, SellpiaOrderTransmissionIntent.createdAt, SellpiaOrderTransmissionIntent.createdBy, SellpiaOrderTransmissionIntent.creator, SellpiaOrderTransmissionIntent.finalizedAt, SellpiaOrderTransmissionIntent.finalizedGeneration, SellpiaOrderTransmissionIntent.id, SellpiaOrderTransmissionIntent.intentKey (+7 more)

### Community 121 - "Supply schema"
Cohesion: 0.13
Nodes (16): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.dueDate, SupplierPayment.id, SupplierPayment.notes, SupplierPayment.organization, SupplierPayment.paidAmount, SupplierPayment.paidDate (+8 more)

### Community 122 - "Orders schema"
Cohesion: 0.13
Nodes (16): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.externalSku, UnshippedItem.id, UnshippedItem.isNotified, UnshippedItem.notifiedAt, UnshippedItem.optionName, UnshippedItem.order (+8 more)

### Community 123 - "Community 123"
Cohesion: 0.28
Nodes (10): ChannelCatalogCollectionController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+2 more)

### Community 124 - "Community 124"
Cohesion: 0.20
Nodes (10): ChannelSkuMappingController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+2 more)

### Community 125 - "Community 125"
Cohesion: 0.17
Nodes (10): IsOptional, IsString, UpdateCoupangAccountSettingsDto, parseRefreshChannelSkuMappingStatusDto(), parseReplaceChannelSkuComponentsDto(), SyncOrdersBodyDto, IsOptional, IsString (+2 more)

### Community 126 - "Orders schema"
Cohesion: 0.14
Nodes (15): CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing (+7 more)

### Community 127 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 128 - "Sourcing schema"
Cohesion: 0.17
Nodes (15): NaverPopularKeywordDailySnapshot.boardKey, NaverPopularKeywordDailySnapshot.boardLabel, NaverPopularKeywordDailySnapshot.businessDate, NaverPopularKeywordDailySnapshot.capturedAt, NaverPopularKeywordDailySnapshot.cid, NaverPopularKeywordDailySnapshot.createdAt, NaverPopularKeywordDailySnapshot.id, NaverPopularKeywordDailySnapshot.keyword (+7 more)

### Community 129 - "Finance schema"
Cohesion: 0.14
Nodes (15): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.id, ProcessingCost.master, ProcessingCost.notes, ProcessingCost.organization, ProcessingCost.processType, ProcessingCost.productName (+7 more)

### Community 130 - "Finance schema"
Cohesion: 0.15
Nodes (15): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.organization, SalesPlan.period (+7 more)

### Community 131 - "Inventory schema"
Cohesion: 0.15
Nodes (15): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items, StockAudit.matchedCount (+7 more)

### Community 132 - "Community 132"
Cohesion: 0.19
Nodes (6): buildCoupangWingSnapshotCoverage(), CoupangWingSnapshotCoverage, ChannelCatalogImportRepositoryPort, Inject, ParsedWingCatalogRow, ParsedWingCatalogSkippedRow

### Community 133 - "Finance schema"
Cohesion: 0.15
Nodes (14): Finance, GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.listing, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization (+6 more)

### Community 134 - "Advertising schema"
Cohesion: 0.15
Nodes (14): ExecutionTask.workerId, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentTaskRef, ExecutionWorker.currentUrl, ExecutionWorker.id, ExecutionWorker.label, ExecutionWorker.lastHeartbeatAt (+6 more)

### Community 135 - "Finance schema"
Cohesion: 0.15
Nodes (14): ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description, ManualLedger.id (+6 more)

### Community 136 - "Community 136"
Cohesion: 0.25
Nodes (14): assertPositiveIntegerText(), assertSharedDatabaseIdentity(), assertUuid(), buildChannelAccountFingerprint(), buildCoupangReplayBundle(), buildCoupangReplayScope(), computeReplayFactDigest(), databaseProjectRef() (+6 more)

### Community 137 - "Community 137"
Cohesion: 0.23
Nodes (11): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), main(), parseBaseline(), readFiles(), repoRoot(), walk() (+3 more)

### Community 138 - "Community 138"
Cohesion: 0.19
Nodes (12): ChannelSkuCandidateQueryDto, ChannelSkuMappingQueryDto, MAPPING_STATUSES, IsIn, IsInt, IsOptional, IsPositive, IsString (+4 more)

### Community 139 - "Channels schema"
Cohesion: 0.19
Nodes (13): CoupangKeywordSerpDailySnapshot.businessDate, CoupangKeywordSerpDailySnapshot.capturedAt, CoupangKeywordSerpDailySnapshot.createdAt, CoupangKeywordSerpDailySnapshot.id, CoupangKeywordSerpDailySnapshot.itemCount, CoupangKeywordSerpDailySnapshot.items, CoupangKeywordSerpDailySnapshot.keyword, CoupangKeywordSerpDailySnapshot.organization (+5 more)

### Community 140 - "Core schema"
Cohesion: 0.17
Nodes (13): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+5 more)

### Community 141 - "Channels schema"
Cohesion: 0.18
Nodes (13): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson, RocketSupplyDailySnapshot.revenueKrw (+5 more)

### Community 142 - "Community 142"
Cohesion: 0.29
Nodes (13): asRecord(), assertNoPii(), buildReplayBody(), buildReplayKpis(), cloneReplayValue(), containsPiiValue(), copyString(), dateOnly() (+5 more)

### Community 143 - "Community 143"
Cohesion: 0.31
Nodes (11): analyzeSchemaArtifactSync(), changedFilesFromGit(), changedFilesFromWorkingTree(), GENERATED_ARTIFACT_PATHS, git(), main(), matchesAnyPath(), mergeChangedFiles() (+3 more)

### Community 144 - "Channels schema"
Cohesion: 0.20
Nodes (12): CoupangKeywordTracker.createdAt, CoupangKeywordTracker.enabled, CoupangKeywordTracker.id, CoupangKeywordTracker.keyword, CoupangKeywordTracker.lastCapturedAt, CoupangKeywordTracker.maxPages, CoupangKeywordTracker.organization, CoupangKeywordTracker.updatedAt (+4 more)

### Community 145 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 146 - "Community 146"
Cohesion: 0.26
Nodes (9): DETAIL_IMAGE_COUNTS, DETAIL_PAGE_AGE_GROUPS, DETAIL_PAGE_TEMPLATE_IDS, DetailImageCount, DetailImageCountSchema, DetailPageAgeGroup, DetailPageAgeGroupSchema, DetailPageTemplateId (+1 more)

### Community 147 - "Community 147"
Cohesion: 0.17
Nodes (10): ChannelSkuAvailabilityItem, ChannelSkuAvailabilityListResponse, ChannelSkuAvailabilityListResponseSchema, ChannelSkuAvailabilityQuery, ChannelSkuAvailabilityQuerySchema, ChannelSkuAvailabilityStatus, ChannelSkuAvailabilityStatusSchema, ChannelSkuAvailabilitySummary (+2 more)

### Community 148 - "Community 148"
Cohesion: 0.30
Nodes (12): assertAllowedRecord(), assertAllowedRows(), assertAllowedScalarRecord(), assertOptionalScalar(), assertPlainRecord(), assertReplayBundle(), assertReplayFactCounts(), assertReplayKpis() (+4 more)

### Community 149 - "Community 149"
Cohesion: 0.18
Nodes (5): MarketplaceRegistrationRepositoryAdapter, Injectable, MarketplaceRegistrationRepositoryPort, Inject, Optional

### Community 150 - "Advertising schema"
Cohesion: 0.20
Nodes (10): Advertising, ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.id, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.url (+2 more)

### Community 151 - "System schema"
Cohesion: 0.20
Nodes (11): ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization, ActivityEvent.source (+3 more)

### Community 152 - "System schema"
Cohesion: 0.20
Nodes (10): FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name, FeatureGate.updatedAt (+2 more)

### Community 153 - "Community 153"
Cohesion: 0.18
Nodes (11): assertLocalRebuildGuard(), assertSharedRebuildGuard(), guardFromCli(), assertLocalDevelopmentDatabase(), bootstrapAuthoritativeInventoryDevelopment(), buildBootstrapPlan(), LOCAL_HOSTS, main() (+3 more)

### Community 154 - "Community 154"
Cohesion: 0.35
Nodes (9): analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), directOutPortFiles(), FORBIDDEN_IN_PORT_FOLDER_NAMES, forbiddenInPortCallerFolders(), listDirectories(), listFiles(), main() (+1 more)

### Community 155 - "Community 155"
Cohesion: 0.20
Nodes (5): RocketPoCatalogRepositoryAdapter, Injectable, RocketPoCatalogIdentity, RocketPoCatalogRepositoryPort, Inject

### Community 156 - "Community 156"
Cohesion: 0.22
Nodes (4): PARENT_COLUMN_INDEXES, REQUIRED_HEADERS, workbookBuffer(), WorkbookOptions

### Community 157 - "System schema"
Cohesion: 0.24
Nodes (10): System, SystemSetting.createdAt, SystemSetting.id, SystemSetting.key, SystemSetting.organization, SystemSetting.updatedAt, SystemSetting.value, SystemSetting (+2 more)

### Community 158 - "Advertising schema"
Cohesion: 0.22
Nodes (10): ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task, ExecutionLog.taskId (+2 more)

### Community 159 - "Sourcing schema"
Cohesion: 0.27
Nodes (10): SourcingWorkspaceSnapshot.businessDate, SourcingWorkspaceSnapshot.createdAt, SourcingWorkspaceSnapshot.id, SourcingWorkspaceSnapshot.organization, SourcingWorkspaceSnapshot.payload, SourcingWorkspaceSnapshot.scope, SourcingWorkspaceSnapshot.updatedAt, SourcingWorkspaceSnapshot (+2 more)

### Community 160 - "Community 160"
Cohesion: 0.20
Nodes (8): ReviewFilter, ReviewFilterSchema, ReviewListItem, ReviewListItemSchema, ReviewListResponse, ReviewListResponseSchema, ReviewSummary, ReviewSummarySchema

### Community 161 - "Community 161"
Cohesion: 0.25
Nodes (5): ChannelsOperationAlertAdapter, Inject, Injectable, OperationLifecyclePatch, StartOperationAlertInput

### Community 164 - "Channels schema"
Cohesion: 0.25
Nodes (9): Channels, CoupangRepresentativeKeywordOverride.createdAt, CoupangRepresentativeKeywordOverride.id, CoupangRepresentativeKeywordOverride.keyword, CoupangRepresentativeKeywordOverride.organization, CoupangRepresentativeKeywordOverride.updatedAt, CoupangRepresentativeKeywordOverride, coupang_representative_keyword_overrides (+1 more)

### Community 165 - "Community 165"
Cohesion: 0.22
Nodes (7): ReadinessCheck, ReadinessCheckSchema, ReadinessCheckStatusSchema, ReadinessResponse, ReadinessResponseSchema, RebuildReadinessResponse, RebuildReadinessResponseSchema

### Community 166 - "Community 166"
Cohesion: 0.25
Nodes (8): MarketplaceRegistrationDto, IsInt, IsOptional, IsString, IsUUID, MaxLength, Type, Min

### Community 167 - "Community 167"
Cohesion: 0.32
Nodes (3): ChannelSyncRepositoryAdapter, Injectable, ProductListingSyncResult

### Community 169 - "Community 169"
Cohesion: 0.25
Nodes (6): AgentCatalogItem, ConfigurableParam, ConfigurableParamSchema, MarketplaceCatalogItem, MarketplaceCatalogItemSchema, WorkflowCatalogItem

### Community 170 - "Community 170"
Cohesion: 0.46
Nodes (6): analyzeInventory(), listTopLevelScriptFiles(), main(), repoRoot(), SCRIPT_INVENTORY, SUPPORT_FILES

### Community 171 - "Community 171"
Cohesion: 0.29
Nodes (6): CurrentOrganization, CurrentUser, Param, Post, UploadedFile, UseInterceptors

### Community 172 - "Community 172"
Cohesion: 0.29
Nodes (5): AuthRequiredErrorBody, AuthUserPublic, AuthUserPublicSchema, LoginRequest, LoginRequestSchema

### Community 173 - "Community 173"
Cohesion: 0.33
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 174 - "Community 174"
Cohesion: 0.33
Nodes (4): SettlementReconcileDetail, SettlementReconcileDetailSchema, SettlementReconcileResponse, SettlementReconcileResponseSchema

### Community 175 - "Community 175"
Cohesion: 0.50
Nodes (4): fileHash(), importInput(), makeRow(), representativeRows()

### Community 181 - "Community 181"
Cohesion: 0.50
Nodes (4): is_allowlisted(), is_comment_line(), load_file_lines(), check-tenant-scope.sh script

### Community 182 - "Community 182"
Cohesion: 1.00
Nodes (3): makeRepository(), runRecord(), runWithChunks()

### Community 183 - "Community 183"
Cohesion: 0.67
Nodes (3): accountIdFor(), seedOrderInline(), seedReturnInline()

### Community 184 - "Community 184"
Cohesion: 0.67
Nodes (3): extractEnvKeys(), readModelFile(), redactEnvValues()

## Knowledge Gaps
- **2169 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+2164 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Core schema` to `Community 1`, `Core schema`, `prisma field: Database ERD`, `Core schema`, `Community 5`, `prisma field: AdAction.externalId`, `AI schema`, `Orders schema`, `AI schema`, `Supply schema`, `Core schema`, `Channels schema`, `AgentOS schema`, `Orders schema`, `Community 18`, `Community 19`, `Community 20`, `AI schema`, `AI schema`, `AI schema`, `AgentOS schema`, `Supply schema`, `AgentOS schema`, `Sourcing schema`, `Core schema`, `AI schema`, `Core schema`, `Channels schema`, `AI schema`, `AI schema`, `Community 43`, `Sourcing schema`, `Community 46`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Inventory schema`, `Supply schema`, `Channels schema`, `Channels schema`, `System schema`, `Advertising schema`, `AgentOS schema`, `Orders schema`, `Channels schema`, `AgentOS schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Orders schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `Finance schema`, `Sourcing schema`, `AI schema`, `Channels schema`, `Supply schema`, `Inventory schema`, `AgentOS schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Supply schema`, `Orders schema`, `Orders schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `Finance schema`, `Advertising schema`, `Finance schema`, `Channels schema`, `Core schema`, `Channels schema`, `Channels schema`, `Advertising schema`, `System schema`, `System schema`, `System schema`, `Sourcing schema`, `Channels schema`, `prisma field: Organization.id`?**
  _High betweenness centrality (0.237) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `prisma field: Database ERD` to `Core schema`, `Core schema`, `Core schema`, `prisma field: AdAction.externalId`, `AI schema`, `Orders schema`, `AI schema`, `Supply schema`, `Core schema`, `Channels schema`, `AgentOS schema`, `Orders schema`, `AI schema`, `AI schema`, `AI schema`, `AgentOS schema`, `Supply schema`, `AgentOS schema`, `Sourcing schema`, `Core schema`, `AI schema`, `Core schema`, `Channels schema`, `AI schema`, `AI schema`, `Sourcing schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Inventory schema`, `Supply schema`, `Channels schema`, `Channels schema`, `System schema`, `Advertising schema`, `AgentOS schema`, `Orders schema`, `Channels schema`, `AgentOS schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Orders schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `Finance schema`, `Sourcing schema`, `AI schema`, `Channels schema`, `Supply schema`, `Inventory schema`, `AgentOS schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Advertising schema`, `Inventory schema`, `Supply schema`, `Orders schema`, `Orders schema`, `System schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `Finance schema`, `Advertising schema`, `Finance schema`, `Channels schema`, `Core schema`, `Channels schema`, `Channels schema`, `System schema`, `Advertising schema`, `System schema`, `System schema`, `System schema`, `Advertising schema`, `Sourcing schema`, `Channels schema`?**
  _High betweenness centrality (0.180) - this node is a cross-community bridge._
- **Why does `Order` connect `Orders schema` to `Core schema`, `Community 1`, `Core schema`, `prisma field: Database ERD`, `Core schema`, `Community 6`, `prisma field: AdAction.externalId`, `Community 137`, `Supply schema`, `Core schema`, `Community 15`, `Community 143`, `Orders schema`, `Community 18`, `Community 19`, `AI schema`, `Advertising schema`, `AI schema`, `Community 154`, `Community 27`, `Community 156`, `Supply schema`, `Community 43`, `Community 46`, `Community 57`, `Community 69`, `Orders schema`, `Community 81`, `Orders schema`, `Community 100`, `Inventory schema`, `Orders schema`, `Community 125`, `Orders schema`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Are the 141 inferred relationships involving `Organization` (e.g. with `channel-account.controller.ts` and `channel-account-list.controller.ts`) actually correct?**
  _`Organization` has 141 INFERRED edges - model-reasoned connections that need verification._
- **Are the 107 inferred relationships involving `ChannelAccount` (e.g. with `channel-account.controller.ts` and `channel-account-list.controller.ts`) actually correct?**
  _`ChannelAccount` has 107 INFERRED edges - model-reasoned connections that need verification._
- **Are the 98 inferred relationships involving `Order` (e.g. with `channel-sync.controller.ts` and `index.ts`) actually correct?**
  _`Order` has 98 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason` to the rest of the system?**
  _2169 weakly-connected nodes found - possible documentation gaps or missing edges._