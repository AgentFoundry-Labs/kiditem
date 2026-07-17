# Graph Report - schema-consumers  (2026-07-17)

## Corpus Check
- 346 files · ~163,644 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5199 nodes · 25901 edges · 250 communities (235 shown, 15 thin omitted)
- Extraction: 35% EXTRACTED · 65% INFERRED · 0% AMBIGUOUS · INFERRED: 16751 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Core schema
- AgentOS schema
- Community 2
- Orders schema
- Community 4
- System schema
- Community 6
- Community 7
- AI schema
- prisma field: AdAction.externalId
- Community 10
- Channels schema
- Core schema
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- AI schema
- AI schema
- AgentOS schema
- Community 21
- Community 22
- AgentOS schema
- Sourcing schema
- Community 25
- Community 26
- Community 27
- AI schema
- Community 29
- Community 30
- AI schema
- Community 32
- Core schema
- Supply schema
- Orders schema
- Sourcing schema
- Community 37
- Orders schema
- Channels schema
- AI schema
- AI schema
- Community 42
- AI schema
- Community 44
- Community 45
- Community 46
- AgentOS schema
- AgentOS schema
- Core schema
- AI schema
- Channels schema
- Community 52
- Community 53
- System schema
- AgentOS schema
- AgentOS schema
- AgentOS schema
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Channels schema
- Inventory schema
- Community 65
- Core schema
- Supply schema
- Community 68
- Channels schema
- Community 70
- Community 71
- Community 72
- AgentOS schema
- Channels schema
- Community 75
- Advertising schema
- Core schema
- Orders schema
- Community 79
- Channels schema
- AI schema
- Community 82
- AgentOS schema
- System schema
- Channels schema
- Sourcing schema
- Sourcing schema
- AI schema
- Community 89
- AgentOS schema
- Finance schema
- Sourcing schema
- Community 93
- Community 94
- Community 95
- Community 96
- AgentOS schema
- Channels schema
- Supply schema
- Inventory schema
- Community 101
- Community 102
- Community 103
- Community 104
- Community 105
- Community 106
- Community 107
- AgentOS schema
- Sourcing schema
- Sourcing schema
- Channels schema
- Community 112
- Community 113
- Community 114
- Inventory schema
- Inventory schema
- Community 117
- Community 118
- AgentOS schema
- Core schema
- Channels schema
- Channels schema
- Advertising schema
- Inventory schema
- Inventory schema
- Core schema
- Inventory schema
- Inventory schema
- Inventory schema
- Supply schema
- Orders schema
- Community 132
- Community 133
- Finance schema
- Orders schema
- System schema
- Sourcing schema
- Finance schema
- Finance schema
- Inventory schema
- Inventory schema
- Advertising schema
- Community 143
- Community 144
- Channels schema
- Finance schema
- Core schema
- Channels schema
- Community 149
- Community 150
- Community 151
- Core schema
- Channels schema
- System schema
- Community 155
- Community 156
- Community 157
- Advertising schema
- System schema
- System schema
- Supply schema
- Sourcing schema
- Community 163
- Community 164
- Community 165
- Community 166
- Community 167
- Advertising schema
- Sourcing schema
- Community 170
- Community 171
- Community 172
- Community 173
- Channels schema
- System schema
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
- Community 188
- Community 189
- Community 190
- Community 191
- Community 192
- Community 193
- Community 194
- Community 195
- Community 196
- Community 197
- Community 198
- Community 199
- Community 200
- Community 201
- Community 202
- Community 203
- Community 204
- prisma field: Organization.id
- Community 206
- Community 207

## God Nodes (most connected - your core abstractions)
1. `Organization` - 375 edges
2. `Database ERD` - 335 edges
3. `ChannelListing` - 154 edges
4. `Order` - 154 edges
5. `ChannelAccount` - 151 edges
6. `prisma — Shared Schema` - 149 edges
7. `ContentWorkspace.organizationId` - 137 edges
8. `ProductPreparation.organizationId` - 137 edges
9. `User` - 137 edges
10. `ChannelListing.organizationId` - 133 edges
11. `SourceImportRun.organizationId` - 132 edges
12. `ContentWorkspaceThumbnailSelection.organizationId` - 131 edges

## Surprising Connections (you probably didn't know these)
- `packages/shared — @kiditem/shared` --mentions_domain--> `AI`  [EXTRACTED]
  packages/shared/AGENTS.md → prisma/models/ai.prisma
- `distinctStrings()` --indirect_call--> `value()`  [INFERRED]
  apps/server/src/channels/adapter/out/repository/channel-product-matching.repository.adapter.ts → scripts/_shared/cli-args.ts
- `rankChannelProductCandidates()` --indirect_call--> `value()`  [INFERRED]
  apps/server/src/channels/domain/channel-product-candidate-ranking.ts → scripts/_shared/cli-args.ts
- `productSearchText()` --indirect_call--> `value()`  [INFERRED]
  apps/server/src/channels/domain/channel-product-candidate-ranking.ts → scripts/_shared/cli-args.ts
- `rankChannelVariantCandidates()` --indirect_call--> `value()`  [INFERRED]
  apps/server/src/channels/domain/channel-variant-candidate-ranking.ts → scripts/_shared/cli-args.ts
- `Database ERD` --mentions_domain--> `Advertising`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_model--> `AdAction`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.organizationId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma

## Import Cycles
- None detected.

## Communities (250 total, 15 thin omitted)

### Community 0 - "Core schema"
Cohesion: 0.16
Nodes (226): UploadedWorkbookFile, HEADERS, USER, chunkSelect, ErrorInput, LockedRun, OwnedRunInput, PutChunkInput (+218 more)

### Community 1 - "AgentOS schema"
Cohesion: 0.05
Nodes (100): ListingForProductSync, accountIdFor(), seedOrderInline(), seedReturnInline(), externalOptionId canonical option identity, vendorItemId provider term, channels — Marketplace Sync + SKU Matching, Database ERD (+92 more)

### Community 2 - "Community 2"
Cohesion: 0.02
Nodes (101): AgentApprovalRequestSummary, AgentApprovalRequestSummarySchema, AgentApprovalStatus, AgentApprovalStatusSchema, AgentArtifactHandoffSummary, AgentArtifactHandoffSummarySchema, AgentArtifactStatus, AgentArtifactStatusSchema (+93 more)

### Community 3 - "Orders schema"
Cohesion: 0.03
Nodes (67): formatKstIso(), normalizeCoupangOrderStatus(), Orders, OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.metadata (+59 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (67): AdapterCommand, appendFlag(), appendOption(), appendProjectReferenceDefaults(), archiveFileName(), archiveShaFileName(), Args, BundleManifest (+59 more)

### Community 5 - "System schema"
Cohesion: 0.04
Nodes (57): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.href (+49 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (61): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot, AdCampaignSnapshotSchema (+53 more)

### Community 7 - "Community 7"
Cohesion: 0.05
Nodes (46): ChannelRegistrationCapabilityAdapter, Injectable, ChannelCatalogImportController, Controller, Inject, ChannelSkuAvailabilityController, Controller, CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT (+38 more)

### Community 8 - "AI schema"
Cohesion: 0.04
Nodes (58): ProductPreparation.selectedThumbnailGenerationId, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.createdAt, ThumbnailGeneration.deletedAt, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.errorMessage, ThumbnailGeneration.grade (+50 more)

### Community 9 - "prisma field: AdAction.externalId"
Cohesion: 0.17
Nodes (38): CHANNELS_CAPABILITIES, ChannelsCapabilityKey, AdAction.externalId, AdAction.listingId, ChannelAdTargetDailySnapshot.externalId, ChannelAdTargetDailySnapshot.listingId, ChannelListing.externalId, ChannelListingDailySnapshot.externalId (+30 more)

### Community 10 - "Community 10"
Cohesion: 0.04
Nodes (53): CreateMasterProductInput, CreateMasterProductInputSchema, CreateProductVariantFieldsSchema, CreateProductVariantInput, CreateProductVariantInputSchema, MasterProductMutationFieldsSchema, MasterProductOperationsDetail, MasterProductOperationsDetailSchema (+45 more)

### Community 11 - "Channels schema"
Cohesion: 0.04
Nodes (55): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+47 more)

### Community 12 - "Core schema"
Cohesion: 0.05
Nodes (49): CHANNEL_LISTING_SORTS, CHANNEL_LISTING_TABS, ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id, ChannelAccount.isPrimary (+41 more)

### Community 13 - "Community 13"
Cohesion: 0.07
Nodes (49): ActionTask, ActionTaskExecuteResponse, ActionTaskList, ActionTaskListSchema, ActionTaskRelatedProduct, ActionTaskRelatedProductSchema, ActionTaskSchema, ActionTaskSourceAlert (+41 more)

### Community 14 - "Community 14"
Cohesion: 0.09
Nodes (45): apiHeaders(), apiUrl(), Args, assertSafeDatasetId(), assertSupportedReplayPayloads(), BundleManifest, BundlePayload, BundleReference (+37 more)

### Community 15 - "Community 15"
Cohesion: 0.07
Nodes (26): DATA_MIGRATION_IDS, DATA_MIGRATION_RELEASES, dataMigrations, DataMigration, backfillSourcingCandidatesFromMasterProducts, isLegacyDetailEditorHref(), rewriteLegacyDetailEditorAlertHrefs, rewriteLegacyDetailEditorHref() (+18 more)

### Community 16 - "Community 16"
Cohesion: 0.10
Nodes (48): assertNonProductionTarget(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged(), assertSha256(), BaselineManifest, BaselineManifestExpectation, baselineObjectKeys, buildChecksumsFile() (+40 more)

### Community 17 - "Community 17"
Cohesion: 0.04
Nodes (47): deriveSellpiaInventoryFreshness(), FixedSellpiaAccountKeySchema, FixedSellpiaOriginSchema, IsoDateTimeStringSchema, SELLPIA_INVENTORY_FRESHNESS_STATUSES, SELLPIA_INVENTORY_REFRESH_REASONS, SellpiaFreshnessDerivationInput, SellpiaInventoryActiveSyncViewSchema (+39 more)

### Community 18 - "AI schema"
Cohesion: 0.05
Nodes (45): ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.editedHtmlSavedAt, ContentGeneration.errorMessage (+37 more)

### Community 19 - "AI schema"
Cohesion: 0.05
Nodes (45): ContentGeneration.detailPageArtifactId, ContentWorkspace.currentDetailPageArtifactId, ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.contentWorkspaceId, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.createdByUserId (+37 more)

### Community 20 - "AgentOS schema"
Cohesion: 0.05
Nodes (44): AgentRunRequest.agentInstance, AgentRunRequest.attempts, AgentRunRequest.claimedAt, AgentRunRequest.claimedBy, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.coalescedIntoRequestId, AgentRunRequest.conversation, AgentRunRequest.createdAt (+36 more)

### Community 21 - "Community 21"
Cohesion: 0.09
Nodes (39): applyCacheControl(), ApplyResult, applyS3CacheControl(), applySupabaseCacheControl(), assertApplyAllowed(), buildCopyObjectInput(), CliArgs, CliConfig (+31 more)

### Community 22 - "Community 22"
Cohesion: 0.08
Nodes (21): ChannelSyncController, Body, Controller, CurrentOrganization, CurrentUser, Get, Post, OperationAlertPort (+13 more)

### Community 23 - "AgentOS schema"
Cohesion: 0.05
Nodes (42): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+34 more)

### Community 24 - "Sourcing schema"
Cohesion: 0.05
Nodes (41): CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id, CandidateImage.isPrimary (+33 more)

### Community 25 - "Community 25"
Cohesion: 0.05
Nodes (36): PANEL_RUN_SOURCES, PanelRunSource, PanelRunSourceSchema, sourceKeys, PANEL_ITEM_KINDS, PanelAlertItem, PanelAlertItemSchema, PanelDismissEventSchema (+28 more)

### Community 26 - "Community 26"
Cohesion: 0.05
Nodes (39): AdMetricsDetail, AdMetricsDetailSchema, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary, DashboardAdSummarySchema (+31 more)

### Community 27 - "Community 27"
Cohesion: 0.06
Nodes (29): ChannelListingController, Controller, CurrentOrganization, Get, Param, Query, ChannelListingQueryDto, IsIn (+21 more)

### Community 28 - "AI schema"
Cohesion: 0.06
Nodes (36): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height (+28 more)

### Community 29 - "Community 29"
Cohesion: 0.05
Nodes (36): ChunkRequestBaseSchema, CoupangCatalogAttributeV1, CoupangCatalogAttributeV1Schema, CoupangCatalogBrowserCommand, CoupangCatalogBrowserCommandSchema, CoupangCatalogBrowserStatus, CoupangCatalogBrowserStatusSchema, CoupangCatalogChunkKind (+28 more)

### Community 30 - "Community 30"
Cohesion: 0.06
Nodes (32): upsertChannelCatalogIdentities(), applyProductLinksInBatches(), applyVariantLinksInBatches(), buildCatalogProductProvisioningListings(), publishCatalogOperationalProducts(), unique(), validateProvisionedLinks(), assertActiveCoupangAccount() (+24 more)

### Community 31 - "AI schema"
Cohesion: 0.06
Nodes (38): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+30 more)

### Community 32 - "Community 32"
Cohesion: 0.09
Nodes (28): ChannelProductMatchingController, Body, Controller, CurrentOrganization, Get, Param, Put, Query (+20 more)

### Community 33 - "Core schema"
Cohesion: 0.06
Nodes (34): ContentGeneration.triggeredByUserId, ContentWorkspace.createdByUserId, OrganizationMembership.createdAt, OrganizationMembership.id, OrganizationMembership.invitedBy, OrganizationMembership.invitedById, OrganizationMembership.joinedAt, OrganizationMembership.lastSelectedAt (+26 more)

### Community 34 - "Supply schema"
Cohesion: 0.08
Nodes (34): PurchaseOrder.supplierId, Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.id, Supplier.leadTimeDays, Supplier.name (+26 more)

### Community 35 - "Orders schema"
Cohesion: 0.06
Nodes (31): AVAILABILITY_STATUSES, Review.content, Review.createdAt, Review.id, Review.listing, Review.organization, Review.platform, Review.rating (+23 more)

### Community 36 - "Sourcing schema"
Cohesion: 0.07
Nodes (32): ContentGeneration.sourceCandidateId, SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.id, SourcingCandidate.imageUrl (+24 more)

### Community 37 - "Community 37"
Cohesion: 0.06
Nodes (28): ChannelAccountListItem, ChannelAccountListItemSchema, CoupangAccountSettings, CoupangAccountSettingsSchema, UpdateCoupangAccountSettings, ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow (+20 more)

### Community 38 - "Orders schema"
Cohesion: 0.06
Nodes (29): CHANNELS_ROOT, REPO_ROOT, Order.channelAccount, Order.channelAccountId, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber (+21 more)

### Community 39 - "Channels schema"
Cohesion: 0.07
Nodes (35): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel, ChannelAdTargetDailySnapshot.clicks (+27 more)

### Community 40 - "AI schema"
Cohesion: 0.07
Nodes (35): ContentWorkspaceThumbnailSelection.contentAsset, ContentWorkspaceThumbnailSelection.contentAssetId, ContentWorkspaceThumbnailSelection.contentWorkspace, ContentWorkspaceThumbnailSelection.contentWorkspaceId, ContentWorkspaceThumbnailSelection.createdAt, ContentWorkspaceThumbnailSelection.createdByUser, ContentWorkspaceThumbnailSelection.createdByUserId, ContentWorkspaceThumbnailSelection.id (+27 more)

### Community 41 - "AI schema"
Cohesion: 0.06
Nodes (35): ProductPreparation.channelAccount, ProductPreparation.channelAccountId, ProductPreparation.channelListing, ProductPreparation.channelListingId, ProductPreparation.createdAt, ProductPreparation.createdByUser, ProductPreparation.deletedAt, ProductPreparation.displayName (+27 more)

### Community 42 - "Community 42"
Cohesion: 0.06
Nodes (34): ACCOUNT_AD_DAILY_DIGEST_KEYS, AD_ROW_KEYS, AD_SUMMARY_KEYS, ADS_DAILY_ROW_KEYS, ADS_KPI_KEYS, assertExactCount(), assertProtectedSupabaseDestination(), assertReadyCounts() (+26 more)

### Community 43 - "AI schema"
Cohesion: 0.07
Nodes (30): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt (+22 more)

### Community 44 - "Community 44"
Cohesion: 0.07
Nodes (31): DeliveryCompany, DeliveryCompanySchema, Order, OrderActionResponse, OrderActionResponseSchema, OrderLineItem, OrderLineItemSchema, OrderListItem (+23 more)

### Community 45 - "Community 45"
Cohesion: 0.12
Nodes (33): DataMigrationContext, DataMigrationTarget, MigrationResult, appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertMutatingTarget(), CliArgs, Command (+25 more)

### Community 46 - "Community 46"
Cohesion: 0.06
Nodes (28): ChannelMatchCandidateReason, ChannelMatchCandidateReasonSchema, ChannelMatchEvidence, ChannelMatchEvidenceSchema, ChannelMatchingAccount, ChannelMatchingAccountSchema, ChannelOptionMatchingQueueRow, ChannelOptionMatchingQueueRowSchema (+20 more)

### Community 47 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+25 more)

### Community 48 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.startedAt, WorkflowRun.status (+25 more)

### Community 49 - "Core schema"
Cohesion: 0.08
Nodes (33): ChannelListing.lastImportRunId, SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.createdAt, SourceImportRun.createdBy, SourceImportRun.errorCode, SourceImportRun.errorMessage (+25 more)

### Community 50 - "AI schema"
Cohesion: 0.08
Nodes (31): ContentGeneration.contentWorkspaceId, ContentWorkspace.channelListing, ContentWorkspace.channelListingId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageRevision, ContentWorkspace.currentThumbnailSelection (+23 more)

### Community 51 - "Channels schema"
Cohesion: 0.08
Nodes (31): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.channelAccount, ChannelScrapeRun.channelAccountId, ChannelScrapeRun.clientRunKey, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson (+23 more)

### Community 52 - "Community 52"
Cohesion: 0.07
Nodes (12): Inject, ChannelSkuAvailabilityPort, ChannelProductMatchingQuery, ChannelProductMatchingRepositoryPort, ChannelProductMatchingService, Inject, Injectable, ChannelSkuAvailabilityService (+4 more)

### Community 53 - "Community 53"
Cohesion: 0.07
Nodes (9): CoupangProviderPort, MarketplaceRegistrationRepositoryPort, ChannelSyncRepositoryPort, OrderSyncDeps, ProductSyncDeps, Inject, Optional, Inject (+1 more)

### Community 54 - "System schema"
Cohesion: 0.08
Nodes (23): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon, Marketplace.id (+15 more)

### Community 55 - "AgentOS schema"
Cohesion: 0.08
Nodes (28): AgentOS, AgentAuthorizationEvent.toolId, AgentInstanceToolPolicy.agentInstance, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentInstanceToolPolicy.dryRunMode, AgentInstanceToolPolicy.effect (+20 more)

### Community 56 - "AgentOS schema"
Cohesion: 0.07
Nodes (28): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.approver, AgentApprovalRequest.approverUserId, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy, AgentApprovalRequest.decidedByUserId (+20 more)

### Community 57 - "AgentOS schema"
Cohesion: 0.08
Nodes (28): AgentToolInvocation.agentInstance, AgentToolInvocation.approvalRequest, AgentToolInvocation.approvalRequestId, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt, AgentToolInvocation.errorCode (+20 more)

### Community 58 - "Community 58"
Cohesion: 0.09
Nodes (22): adapterPaths, BROWSER_COLLECTION_ATTENTION_REASONS, BROWSER_COLLECTION_PRODUCERS, BROWSER_COLLECTION_STATES, BrowserCollectionAttentionReasonSchema, BrowserCollectionClassificationSchema, BrowserCollectionCommand, BrowserCollectionCommandSchema (+14 more)

### Community 59 - "Community 59"
Cohesion: 0.09
Nodes (24): SellpiaInventoryGenerationSchema, SellpiaInventoryQualityReportSchema, SellpiaInventoryRefreshReasonSchema, CompletedSourceArtifactRun, CoupangWingCatalogImportResponse, CoupangWingCatalogImportResponseSchema, ImportChanges, SellpiaInventoryImportOutcome (+16 more)

### Community 60 - "Community 60"
Cohesion: 0.16
Nodes (24): Path, add_code_reference_edges(), add_document_mentions(), add_schema_graph(), camel(), collect_block(), collect_code(), collect_doc_comments() (+16 more)

### Community 61 - "Community 61"
Cohesion: 0.14
Nodes (27): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+19 more)

### Community 62 - "Community 62"
Cohesion: 0.15
Nodes (26): cellText(), collectParentMetadataConflicts(), decodeWorksheetRange(), expandMergedParentCells(), findHeaderRow(), formattedCellText(), hasCellValue(), headersForRow() (+18 more)

### Community 63 - "Channels schema"
Cohesion: 0.08
Nodes (27): CoupangWingSalesRankDailySnapshot.businessDate, CoupangWingSalesRankDailySnapshot.capturedAt, CoupangWingSalesRankDailySnapshot.categoryHierarchy, CoupangWingSalesRankDailySnapshot.collectedCount, CoupangWingSalesRankDailySnapshot.conversionRate28d, CoupangWingSalesRankDailySnapshot.createdAt, CoupangWingSalesRankDailySnapshot.id, CoupangWingSalesRankDailySnapshot.itemId (+19 more)

### Community 64 - "Inventory schema"
Cohesion: 0.07
Nodes (27): SellpiaInventoryState.activeGeneration, SellpiaInventoryState.activeSyncLeaseExpiresAt, SellpiaInventoryState.activeSyncOwner, SellpiaInventoryState.activeSyncOwnerUserId, SellpiaInventoryState.activeSyncStartedAt, SellpiaInventoryState.activeSyncToken, SellpiaInventoryState.createdAt, SellpiaInventoryState.failedGeneration (+19 more)

### Community 65 - "Community 65"
Cohesion: 0.17
Nodes (27): assertCurrentRebuildBinding(), assertProtectedApiDestination(), assertReplayCounts(), assertReplayFactDigest(), assertSharedDatabaseIdentity(), assertSharedRebuildGuard(), assertUuid(), bootstrap() (+19 more)

### Community 66 - "Core schema"
Cohesion: 0.09
Nodes (25): ChannelListing.masterProductId, MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.adTier, MasterProduct.brand, MasterProduct.category, MasterProduct.code, MasterProduct.createdAt (+17 more)

### Community 67 - "Supply schema"
Cohesion: 0.08
Nodes (26): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+18 more)

### Community 68 - "Community 68"
Cohesion: 0.12
Nodes (17): lockChannelListingRow(), aiProductSuggestion(), aiVariantSuggestion(), asRecord(), availabilityListingWhere(), ChannelProductMatchingRepositoryAdapter, completedCatalogRunWhere(), componentSource() (+9 more)

### Community 69 - "Channels schema"
Cohesion: 0.09
Nodes (25): ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isOfferWinner, ChannelListingOptionDailySnapshot.lastObservedAt, ChannelListingOptionDailySnapshot.listing (+17 more)

### Community 70 - "Community 70"
Cohesion: 0.08
Nodes (23): ChannelSkuMappingComponent, ChannelSkuMappingComponentSchema, ChannelSkuMappingCounts, ChannelSkuMappingCountsSchema, ChannelSkuMappingListItem, ChannelSkuMappingListItemSchema, ChannelSkuMappingListResponse, ChannelSkuMappingListResponseSchema (+15 more)

### Community 71 - "Community 71"
Cohesion: 0.08
Nodes (22): StatisticsCategoryRow, StatisticsCategoryRowSchema, StatisticsDeliveryDaily, StatisticsDeliveryDailySchema, StatisticsDeliveryResponse, StatisticsDeliveryResponseSchema, StatisticsGradeRow, StatisticsGradeRowSchema (+14 more)

### Community 72 - "Community 72"
Cohesion: 0.13
Nodes (16): ChannelAccountRepositoryAdapter, envelopeToJson(), maskAccessKey(), readCredentialsConfig(), stripLegacyCredentialKeys(), toJsonRecord(), toRecord(), trimToOptional() (+8 more)

### Community 73 - "AgentOS schema"
Cohesion: 0.09
Nodes (24): AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy, AgentAuthorizationEvent.decidedByUserId, AgentAuthorizationEvent.decision (+16 more)

### Community 74 - "Channels schema"
Cohesion: 0.09
Nodes (23): ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.id, ChannelScrapeSnapshot.listing, ChannelScrapeSnapshot.listingOption (+15 more)

### Community 75 - "Community 75"
Cohesion: 0.20
Nodes (8): ChannelDashboardController, Controller, CurrentOrganization, Get, Query, CoupangDateRangeQueryDto, ChannelDashboardService, Injectable

### Community 76 - "Advertising schema"
Cohesion: 0.09
Nodes (23): AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+15 more)

### Community 77 - "Core schema"
Cohesion: 0.09
Nodes (23): ChannelListingOption.attributesJson, ChannelListingOption.commissionRate, ChannelListingOption.costPriceOverride, ChannelListingOption.createdAt, ChannelListingOption.id, ChannelListingOption.itemName, ChannelListingOption.lastImportRun, ChannelListingOption.lastImportRunId (+15 more)

### Community 78 - "Orders schema"
Cohesion: 0.10
Nodes (23): OrderReturn.channelAccount, OrderReturn.channelAccountId, OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.id (+15 more)

### Community 79 - "Community 79"
Cohesion: 0.11
Nodes (21): InventorySkuLinkedProduct, InventorySkuLinkedProductSchema, InventorySkuLinkedVariant, InventorySkuLinkedVariantSchema, InventorySkuSnapshotItem, InventorySkuSnapshotItemSchema, InventorySkuSnapshotListResponse, InventorySkuSnapshotListResponseSchema (+13 more)

### Community 80 - "Channels schema"
Cohesion: 0.11
Nodes (22): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.channelAccount, ChannelAccountDailyKpiSnapshot.channelAccountId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+14 more)

### Community 81 - "AI schema"
Cohesion: 0.10
Nodes (19): ContentAsset.originGenerationGroupId, ContentGeneration.generationGroupId, ContentGenerationGroup.baseContentGeneration, ContentGenerationGroup.baseContentGenerationId, ContentGenerationGroup.contentWorkspace, ContentGenerationGroup.contentWorkspaceId, ContentGenerationGroup.createdAt, ContentGenerationGroup.createdByUserId (+11 more)

### Community 82 - "Community 82"
Cohesion: 0.20
Nodes (14): CoupangCredentials, coupangRequest(), CoupangRequestOptions, generateAuthorization(), approveReturn(), confirmOrderSheets(), DELIVERY_COMPANIES, getOrderSheets() (+6 more)

### Community 83 - "AgentOS schema"
Cohesion: 0.10
Nodes (21): AgentArtifact.agentInstance, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization, AgentArtifact.request (+13 more)

### Community 84 - "System schema"
Cohesion: 0.10
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+13 more)

### Community 85 - "Channels schema"
Cohesion: 0.11
Nodes (21): CoupangKeywordRankDailySnapshot.adRank, CoupangKeywordRankDailySnapshot.businessDate, CoupangKeywordRankDailySnapshot.capturedAt, CoupangKeywordRankDailySnapshot.createdAt, CoupangKeywordRankDailySnapshot.id, CoupangKeywordRankDailySnapshot.itemId, CoupangKeywordRankDailySnapshot.keyword, CoupangKeywordRankDailySnapshot.organicRank (+13 more)

### Community 86 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): LiveCommerceBroadcastDailySnapshot.broadcasterId, LiveCommerceBroadcastDailySnapshot.broadcasterName, LiveCommerceBroadcastDailySnapshot.broadcastId, LiveCommerceBroadcastDailySnapshot.businessDate, LiveCommerceBroadcastDailySnapshot.capturedAt, LiveCommerceBroadcastDailySnapshot.coverImageUrl, LiveCommerceBroadcastDailySnapshot.createdAt, LiveCommerceBroadcastDailySnapshot.endedAt (+13 more)

### Community 87 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): ShortsTrendDailySnapshot.businessDate, ShortsTrendDailySnapshot.capturedAt, ShortsTrendDailySnapshot.channelName, ShortsTrendDailySnapshot.commentCount, ShortsTrendDailySnapshot.createdAt, ShortsTrendDailySnapshot.id, ShortsTrendDailySnapshot.keyword, ShortsTrendDailySnapshot.likeCount (+13 more)

### Community 88 - "AI schema"
Cohesion: 0.10
Nodes (21): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.contentWorkspace, ThumbnailAnalysis.contentWorkspaceId, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id (+13 more)

### Community 89 - "Community 89"
Cohesion: 0.14
Nodes (20): assembleCompleteSnapshot(), assertSameManifest(), buildCollectionStatus(), countMedia(), countOptions(), derivePhase(), firstDate(), hashCatalogChunkPayload() (+12 more)

### Community 90 - "AgentOS schema"
Cohesion: 0.11
Nodes (20): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id, AgentCostEvent.inputTokens (+12 more)

### Community 91 - "Finance schema"
Cohesion: 0.12
Nodes (20): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit (+12 more)

### Community 92 - "Sourcing schema"
Cohesion: 0.12
Nodes (20): Sourcing1688HotProductDailySnapshot.businessDate, Sourcing1688HotProductDailySnapshot.capturedAt, Sourcing1688HotProductDailySnapshot.createdAt, Sourcing1688HotProductDailySnapshot.id, Sourcing1688HotProductDailySnapshot.imageUrl, Sourcing1688HotProductDailySnapshot.monthlySales, Sourcing1688HotProductDailySnapshot.offerId, Sourcing1688HotProductDailySnapshot.organization (+12 more)

### Community 93 - "Community 93"
Cohesion: 0.11
Nodes (18): boundedText(), isoDay, requiredText(), RocketPoCatalogPublication, RocketPoCatalogPublicationSchema, RocketPoCatalogRow, RocketPoCatalogRowSchema, RocketPoCollectionEvidence (+10 more)

### Community 94 - "Community 94"
Cohesion: 0.10
Nodes (18): SupplierHistoryItem, SupplierHistoryItemSchema, SupplierHistoryReport, SupplierHistoryReportSchema, SupplierHistorySummary, SupplierHistorySummarySchema, SupplierProductSalesReport, SupplierProductSalesReportSchema (+10 more)

### Community 95 - "Community 95"
Cohesion: 0.11
Nodes (8): CoupangProviderAdapter, Inject, Injectable, CoupangCreateSellerProductResponse, CoupangSellerProductPayload, OrderSheetResponse, SellerProductExternalSkuResponse, CoupangCredentialsPort

### Community 96 - "Community 96"
Cohesion: 0.16
Nodes (14): assertExactProductGraph(), MarketplaceRegistrationRepositoryAdapter, Injectable, upsertExactOptionLinks(), asRecord(), KidItemFirstOptionLink, KidItemFirstRegistrationLinks, normalizedOptionId() (+6 more)

### Community 97 - "AgentOS schema"
Cohesion: 0.12
Nodes (19): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError, AgentTaskSession.lastRun (+11 more)

### Community 98 - "Channels schema"
Cohesion: 0.12
Nodes (19): CoupangWingTrackedProductDailySnapshot.businessDate, CoupangWingTrackedProductDailySnapshot.capturedAt, CoupangWingTrackedProductDailySnapshot.conversionRate28d, CoupangWingTrackedProductDailySnapshot.createdAt, CoupangWingTrackedProductDailySnapshot.estimatedRevenue28d, CoupangWingTrackedProductDailySnapshot.id, CoupangWingTrackedProductDailySnapshot.organization, CoupangWingTrackedProductDailySnapshot.pvLast28Day (+11 more)

### Community 99 - "Supply schema"
Cohesion: 0.12
Nodes (19): PurchaseOrderSubmissionAttempt.createdAt, PurchaseOrderSubmissionAttempt.errorCode, PurchaseOrderSubmissionAttempt.errorMessage, PurchaseOrderSubmissionAttempt.freshnessGeneration, PurchaseOrderSubmissionAttempt.id, PurchaseOrderSubmissionAttempt.idempotencyKey, PurchaseOrderSubmissionAttempt.organization, PurchaseOrderSubmissionAttempt.providerReference (+11 more)

### Community 100 - "Inventory schema"
Cohesion: 0.12
Nodes (19): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.notes, ReturnTransfer.optionName, ReturnTransfer.organization (+11 more)

### Community 101 - "Community 101"
Cohesion: 0.11
Nodes (17): ChannelSkuAvailabilityComponent, ChannelSkuAvailabilityComponentSchema, ChannelSkuAvailabilityItem, ChannelSkuAvailabilityItemSchema, ChannelSkuAvailabilityListResponse, ChannelSkuAvailabilityListResponseSchema, ChannelSkuAvailabilityMappingStatusSchema, ChannelSkuAvailabilityQuery (+9 more)

### Community 102 - "Community 102"
Cohesion: 0.15
Nodes (14): PRODUCT_LIFECYCLE_STATES, ProductLifecycleState, ProductLifecycleStateSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, MasterImageItem, MasterImageItemSchema, MasterImageRole (+6 more)

### Community 103 - "Community 103"
Cohesion: 0.22
Nodes (17): analyzePrReleaseContract(), changedFilesFromGit(), classifyFiles(), compareSemver(), ghPrBody(), git(), hasReleaseDecision(), isDevelopToMainPromotion() (+9 more)

### Community 104 - "Community 104"
Cohesion: 0.16
Nodes (17): appendValues(), Lane, parseArgs(), ParsedArgs, parseRawArgs(), ParseRawArgsOptions, pushValue(), value() (+9 more)

### Community 105 - "Community 105"
Cohesion: 0.12
Nodes (12): ChannelAccountController, Body, Controller, CurrentOrganization, Get, CoupangCredentials, ChannelAccountService, Inject (+4 more)

### Community 106 - "Community 106"
Cohesion: 0.18
Nodes (10): assertCanonicalCoupangAccountIdentity(), canonicalParentRows(), ChannelCatalogImportRepositoryAdapter, importResponse(), isUniqueConstraintError(), nextPublicationSequence(), Injectable, zeroChanges() (+2 more)

### Community 107 - "Community 107"
Cohesion: 0.11
Nodes (4): ChannelDashboardRepositoryAdapter, Injectable, ChannelDashboardRepositoryPort, Inject

### Community 108 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.id, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.lastRunId (+10 more)

### Community 109 - "Sourcing schema"
Cohesion: 0.14
Nodes (18): LiveCommerceProductDailySnapshot.broadcastId, LiveCommerceProductDailySnapshot.businessDate, LiveCommerceProductDailySnapshot.capturedAt, LiveCommerceProductDailySnapshot.createdAt, LiveCommerceProductDailySnapshot.id, LiveCommerceProductDailySnapshot.imageUrl, LiveCommerceProductDailySnapshot.organization, LiveCommerceProductDailySnapshot.priceCny (+10 more)

### Community 110 - "Sourcing schema"
Cohesion: 0.13
Nodes (18): NaverKeywordDailySnapshot.averageAdRank, NaverKeywordDailySnapshot.businessDate, NaverKeywordDailySnapshot.capturedAt, NaverKeywordDailySnapshot.competitionIndex, NaverKeywordDailySnapshot.createdAt, NaverKeywordDailySnapshot.id, NaverKeywordDailySnapshot.keyword, NaverKeywordDailySnapshot.monthlyMobileSearchCount (+10 more)

### Community 111 - "Channels schema"
Cohesion: 0.12
Nodes (18): RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt, RocketPurchaseOrder.firstSkuName, RocketPurchaseOrder.id, RocketPurchaseOrder.items, RocketPurchaseOrder.orderAmount, RocketPurchaseOrder.orderedAt (+10 more)

### Community 112 - "Community 112"
Cohesion: 0.11
Nodes (16): CANCEL_OPERATION_TARGET_TYPES, CancelOperationAffected, CancelOperationAffectedSchema, CancelOperationPreserved, CancelOperationPreservedSchema, CancelOperationResponse, CancelOperationResponseSchema, CancelOperationStatus (+8 more)

### Community 113 - "Community 113"
Cohesion: 0.12
Nodes (8): ChannelAccountListController, Controller, CurrentOrganization, Get, ChannelAccountRepositoryPort, ChannelAccountQueryService, Inject, Injectable

### Community 114 - "Community 114"
Cohesion: 0.18
Nodes (8): ChannelCatalogCollectionRepositoryAdapter, isUniqueConstraintError(), ownedRunWhere(), Injectable, ChannelCatalogCollectionChunkRecord, ChannelCatalogCollectionRunRecord, ChannelCatalogCollectionWithChunks, startRun()

### Community 115 - "Inventory schema"
Cohesion: 0.14
Nodes (17): SellpiaInventorySku.code, SellpiaInventorySku.createdAt, SellpiaInventorySku.currentStock, SellpiaInventorySku.id, SellpiaInventorySku.lastImportRun, SellpiaInventorySku.lastImportRunId, SellpiaInventorySku.name, SellpiaInventorySku.optionName (+9 more)

### Community 116 - "Inventory schema"
Cohesion: 0.14
Nodes (17): StockTransfer.fromWarehouseId, StockTransfer.toWarehouseId, Warehouse.address, Warehouse.code, Warehouse.createdAt, Warehouse.id, Warehouse.isDefault, Warehouse.manager (+9 more)

### Community 117 - "Community 117"
Cohesion: 0.23
Nodes (5): Inject, ChannelCatalogCollectionPort, ChannelCatalogCollectionService, parseRequest(), Injectable

### Community 118 - "Community 118"
Cohesion: 0.12
Nodes (15): CurrentOrganization, Get, Query, ChannelSkuAvailabilityQueryDto, IsIn, IsInt, IsOptional, IsString (+7 more)

### Community 119 - "AgentOS schema"
Cohesion: 0.15
Nodes (16): AgentRunEvent.agentInstance, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message, AgentRunEvent.organization (+8 more)

### Community 120 - "Core schema"
Cohesion: 0.16
Nodes (16): ChannelListingOption.productVariantId, ProductVariant.code, ProductVariant.createdAt, ProductVariant.id, ProductVariant.isDefault, ProductVariant.masterProduct, ProductVariant.masterProductId, ProductVariant.name (+8 more)

### Community 121 - "Channels schema"
Cohesion: 0.16
Nodes (16): ChannelScrapeChunk.checksum, ChannelScrapeChunk.createdAt, ChannelScrapeChunk.id, ChannelScrapeChunk.itemCount, ChannelScrapeChunk.kind, ChannelScrapeChunk.organization, ChannelScrapeChunk.payload, ChannelScrapeChunk.publicationJson (+8 more)

### Community 122 - "Channels schema"
Cohesion: 0.14
Nodes (16): CoupangWingTrackedProduct.brandName, CoupangWingTrackedProduct.categoryHierarchy, CoupangWingTrackedProduct.createdAt, CoupangWingTrackedProduct.enabled, CoupangWingTrackedProduct.id, CoupangWingTrackedProduct.imagePath, CoupangWingTrackedProduct.itemId, CoupangWingTrackedProduct.lastCapturedAt (+8 more)

### Community 123 - "Advertising schema"
Cohesion: 0.13
Nodes (16): ExecutionTask.action, ExecutionTask.actionId, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt, ExecutionTask.errorMessage, ExecutionTask.finishedAt (+8 more)

### Community 124 - "Inventory schema"
Cohesion: 0.13
Nodes (16): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.organization, PickingItem.pickedAt, PickingItem.pickingList (+8 more)

### Community 125 - "Inventory schema"
Cohesion: 0.15
Nodes (16): PickingItem.pickingListId, PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.id, PickingList.listNumber, PickingList.organization, PickingList.pickedItems (+8 more)

### Community 126 - "Core schema"
Cohesion: 0.15
Nodes (15): ProductVariantComponent.confirmedAt, ProductVariantComponent.confirmedBy, ProductVariantComponent.createdAt, ProductVariantComponent.id, ProductVariantComponent.organization, ProductVariantComponent.productVariant, ProductVariantComponent.productVariantId, ProductVariantComponent.quantity (+7 more)

### Community 127 - "Inventory schema"
Cohesion: 0.15
Nodes (16): SellpiaOrderTransmissionIntent.abortedAt, SellpiaOrderTransmissionIntent.createdAt, SellpiaOrderTransmissionIntent.createdBy, SellpiaOrderTransmissionIntent.creator, SellpiaOrderTransmissionIntent.finalizedAt, SellpiaOrderTransmissionIntent.finalizedGeneration, SellpiaOrderTransmissionIntent.id, SellpiaOrderTransmissionIntent.intentKey (+8 more)

### Community 128 - "Inventory schema"
Cohesion: 0.13
Nodes (15): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.sourceRef, SellpiaReceiptUploadBatch.sourceType (+7 more)

### Community 129 - "Inventory schema"
Cohesion: 0.13
Nodes (16): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.id, StockTransfer.notes, StockTransfer.optionName, StockTransfer.organization, StockTransfer.quantity (+8 more)

### Community 130 - "Supply schema"
Cohesion: 0.13
Nodes (16): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.dueDate, SupplierPayment.id, SupplierPayment.notes, SupplierPayment.organization, SupplierPayment.paidAmount, SupplierPayment.paidDate (+8 more)

### Community 131 - "Orders schema"
Cohesion: 0.13
Nodes (16): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.externalSku, UnshippedItem.id, UnshippedItem.isNotified, UnshippedItem.notifiedAt, UnshippedItem.optionName, UnshippedItem.order (+8 more)

### Community 132 - "Community 132"
Cohesion: 0.24
Nodes (14): analyzeReconstructionTriggers(), changedFilesFromGit(), ghPrBody(), git(), isCrossLayerControlChange(), isHighRiskBoundary(), isLargeServiceOrComponent(), layerOf() (+6 more)

### Community 133 - "Community 133"
Cohesion: 0.28
Nodes (10): ChannelCatalogCollectionController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+2 more)

### Community 134 - "Finance schema"
Cohesion: 0.14
Nodes (15): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description (+7 more)

### Community 135 - "Orders schema"
Cohesion: 0.14
Nodes (15): CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing (+7 more)

### Community 136 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 137 - "Sourcing schema"
Cohesion: 0.17
Nodes (15): NaverPopularKeywordDailySnapshot.boardKey, NaverPopularKeywordDailySnapshot.boardLabel, NaverPopularKeywordDailySnapshot.businessDate, NaverPopularKeywordDailySnapshot.capturedAt, NaverPopularKeywordDailySnapshot.cid, NaverPopularKeywordDailySnapshot.createdAt, NaverPopularKeywordDailySnapshot.id, NaverPopularKeywordDailySnapshot.keyword (+7 more)

### Community 138 - "Finance schema"
Cohesion: 0.14
Nodes (15): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.id, ProcessingCost.master, ProcessingCost.notes, ProcessingCost.organization, ProcessingCost.processType, ProcessingCost.productName (+7 more)

### Community 139 - "Finance schema"
Cohesion: 0.15
Nodes (15): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.organization, SalesPlan.period (+7 more)

### Community 140 - "Inventory schema"
Cohesion: 0.15
Nodes (15): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items, StockAudit.matchedCount (+7 more)

### Community 141 - "Inventory schema"
Cohesion: 0.15
Nodes (13): packages/shared — @kiditem/shared, Inventory, SellpiaOrderTransmissionIntentReconciliation.id, SellpiaOrderTransmissionIntentReconciliation.intent, SellpiaOrderTransmissionIntentReconciliation.intentId, SellpiaOrderTransmissionIntentReconciliation.note, SellpiaOrderTransmissionIntentReconciliation.organization, SellpiaOrderTransmissionIntentReconciliation.outcome (+5 more)

### Community 142 - "Advertising schema"
Cohesion: 0.15
Nodes (14): ExecutionTask.workerId, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentTaskRef, ExecutionWorker.currentUrl, ExecutionWorker.id, ExecutionWorker.label, ExecutionWorker.lastHeartbeatAt (+6 more)

### Community 143 - "Community 143"
Cohesion: 0.20
Nodes (11): SELLPIA_WORKBOOK_ACCEPT, SELLPIA_WORKBOOK_FILE_EXTENSIONS, SellpiaReceiptBatchCreateInput, SellpiaReceiptBatchCreateInputSchema, SellpiaReceiptBatchMarkUploadedInput, SellpiaReceiptBatchMarkUploadedInputSchema, SellpiaReceiptUploadBatch, SellpiaReceiptUploadBatchSchema (+3 more)

### Community 144 - "Community 144"
Cohesion: 0.23
Nodes (11): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), main(), parseBaseline(), readFiles(), repoRoot(), walk() (+3 more)

### Community 145 - "Channels schema"
Cohesion: 0.19
Nodes (13): CoupangKeywordSerpDailySnapshot.businessDate, CoupangKeywordSerpDailySnapshot.capturedAt, CoupangKeywordSerpDailySnapshot.createdAt, CoupangKeywordSerpDailySnapshot.id, CoupangKeywordSerpDailySnapshot.itemCount, CoupangKeywordSerpDailySnapshot.items, CoupangKeywordSerpDailySnapshot.keyword, CoupangKeywordSerpDailySnapshot.organization (+5 more)

### Community 146 - "Finance schema"
Cohesion: 0.17
Nodes (13): GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.listing, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization, GradeHistory.reason (+5 more)

### Community 147 - "Core schema"
Cohesion: 0.17
Nodes (13): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+5 more)

### Community 148 - "Channels schema"
Cohesion: 0.18
Nodes (13): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson, RocketSupplyDailySnapshot.revenueKrw (+5 more)

### Community 149 - "Community 149"
Cohesion: 0.29
Nodes (13): asRecord(), assertNoPii(), buildReplayBody(), buildReplayKpis(), cloneReplayValue(), containsPiiValue(), copyString(), dateOnly() (+5 more)

### Community 150 - "Community 150"
Cohesion: 0.31
Nodes (11): analyzeSchemaArtifactSync(), changedFilesFromGit(), changedFilesFromWorkingTree(), GENERATED_ARTIFACT_PATHS, git(), main(), matchesAnyPath(), mergeChangedFiles() (+3 more)

### Community 151 - "Community 151"
Cohesion: 0.27
Nodes (8): ChannelProductCandidate, ChannelProductCandidateRankingInput, emptyEvidence(), keep(), normalizeChannelMatchName(), productSearchText(), rankChannelProductCandidates(), REASON_PRIORITY

### Community 152 - "Core schema"
Cohesion: 0.20
Nodes (12): Core, CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.keywords, CategoryMapping.organization (+4 more)

### Community 153 - "Channels schema"
Cohesion: 0.20
Nodes (12): CoupangKeywordTracker.createdAt, CoupangKeywordTracker.enabled, CoupangKeywordTracker.id, CoupangKeywordTracker.keyword, CoupangKeywordTracker.lastCapturedAt, CoupangKeywordTracker.maxPages, CoupangKeywordTracker.organization, CoupangKeywordTracker.updatedAt (+4 more)

### Community 154 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 155 - "Community 155"
Cohesion: 0.26
Nodes (9): DETAIL_IMAGE_COUNTS, DETAIL_PAGE_AGE_GROUPS, DETAIL_PAGE_TEMPLATE_IDS, DetailImageCount, DetailImageCountSchema, DetailPageAgeGroup, DetailPageAgeGroupSchema, DetailPageTemplateId (+1 more)

### Community 156 - "Community 156"
Cohesion: 0.30
Nodes (12): assertAllowedRecord(), assertAllowedRows(), assertAllowedScalarRecord(), assertOptionalScalar(), assertPlainRecord(), assertReplayBundle(), assertReplayFactCounts(), assertReplayKpis() (+4 more)

### Community 157 - "Community 157"
Cohesion: 0.27
Nodes (7): normalizeChannelBarcode(), ChannelVariantCandidate, ChannelVariantCandidateRankingInput, emptyEvidence(), keep(), rankChannelVariantCandidates(), REASON_PRIORITY

### Community 158 - "Advertising schema"
Cohesion: 0.20
Nodes (10): Advertising, ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.id, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.url (+2 more)

### Community 159 - "System schema"
Cohesion: 0.20
Nodes (11): ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization, ActivityEvent.source (+3 more)

### Community 160 - "System schema"
Cohesion: 0.20
Nodes (10): FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name, FeatureGate.updatedAt (+2 more)

### Community 161 - "Supply schema"
Cohesion: 0.20
Nodes (11): PurchaseOrderItem.createdAt, PurchaseOrderItem.id, PurchaseOrderItem.order, PurchaseOrderItem.organization, PurchaseOrderItem.productName, PurchaseOrderItem.quantity, PurchaseOrderItem.sellpiaInventorySku, PurchaseOrderItem.sellpiaInventorySkuId (+3 more)

### Community 162 - "Sourcing schema"
Cohesion: 0.22
Nodes (11): TrendSeedKeyword.createdAt, TrendSeedKeyword.enabled, TrendSeedKeyword.id, TrendSeedKeyword.keyword, TrendSeedKeyword.keywordCn, TrendSeedKeyword.organization, TrendSeedKeyword.sources, TrendSeedKeyword.updatedAt (+3 more)

### Community 163 - "Community 163"
Cohesion: 0.35
Nodes (9): analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), directOutPortFiles(), FORBIDDEN_IN_PORT_FOLDER_NAMES, forbiddenInPortCallerFolders(), listDirectories(), listFiles(), main() (+1 more)

### Community 164 - "Community 164"
Cohesion: 0.31
Nodes (9): addUnique(), defaultOutputDir, defaultSourceDir, normalizeKiditemOrigin(), patchExtensionRuntimeFiles(), patchManifest(), prepareCoupangExtension(), repoRoot (+1 more)

### Community 165 - "Community 165"
Cohesion: 0.24
Nodes (5): ChannelSyncRepositoryAdapter, reconcileProductDetailOption(), Injectable, ProductListingSyncResult, normalizeCoupangProductStatus()

### Community 166 - "Community 166"
Cohesion: 0.20
Nodes (5): RocketPoCatalogRepositoryAdapter, Injectable, RocketPoCatalogIdentity, RocketPoCatalogRepositoryPort, Inject

### Community 167 - "Community 167"
Cohesion: 0.22
Nodes (4): PARENT_COLUMN_INDEXES, REQUIRED_HEADERS, workbookBuffer(), WorkbookOptions

### Community 168 - "Advertising schema"
Cohesion: 0.22
Nodes (10): ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task, ExecutionLog.taskId (+2 more)

### Community 169 - "Sourcing schema"
Cohesion: 0.27
Nodes (10): SourcingWorkspaceSnapshot.businessDate, SourcingWorkspaceSnapshot.createdAt, SourcingWorkspaceSnapshot.id, SourcingWorkspaceSnapshot.organization, SourcingWorkspaceSnapshot.payload, SourcingWorkspaceSnapshot.scope, SourcingWorkspaceSnapshot.updatedAt, SourcingWorkspaceSnapshot (+2 more)

### Community 170 - "Community 170"
Cohesion: 0.20
Nodes (8): ReviewFilter, ReviewFilterSchema, ReviewListItem, ReviewListItemSchema, ReviewListResponse, ReviewListResponseSchema, ReviewSummary, ReviewSummarySchema

### Community 171 - "Community 171"
Cohesion: 0.49
Nodes (6): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), scrubDeep(), scrubSecrets(), walk()

### Community 172 - "Community 172"
Cohesion: 0.25
Nodes (5): ChannelsOperationAlertAdapter, Inject, Injectable, OperationLifecyclePatch, StartOperationAlertInput

### Community 173 - "Community 173"
Cohesion: 0.33
Nodes (4): buildCoupangWingSnapshotCoverage(), CoupangWingSnapshotCoverage, ParsedWingCatalogRow, ParsedWingCatalogSkippedRow

### Community 174 - "Channels schema"
Cohesion: 0.25
Nodes (9): Channels, CoupangRepresentativeKeywordOverride.createdAt, CoupangRepresentativeKeywordOverride.id, CoupangRepresentativeKeywordOverride.keyword, CoupangRepresentativeKeywordOverride.organization, CoupangRepresentativeKeywordOverride.updatedAt, CoupangRepresentativeKeywordOverride, coupang_representative_keyword_overrides (+1 more)

### Community 175 - "System schema"
Cohesion: 0.28
Nodes (9): SystemSetting.createdAt, SystemSetting.id, SystemSetting.key, SystemSetting.organization, SystemSetting.updatedAt, SystemSetting.value, SystemSetting, system_settings (+1 more)

### Community 176 - "Community 176"
Cohesion: 0.22
Nodes (7): ReadinessCheck, ReadinessCheckSchema, ReadinessCheckStatusSchema, ReadinessResponse, ReadinessResponseSchema, RebuildReadinessResponse, RebuildReadinessResponseSchema

### Community 177 - "Community 177"
Cohesion: 0.22
Nodes (9): assertLocalRebuildGuard(), assertLocalDevelopmentDatabase(), bootstrapAuthoritativeInventoryDevelopment(), buildBootstrapPlan(), LOCAL_HOSTS, main(), optionalUuid(), parseBootstrapArgs() (+1 more)

### Community 178 - "Community 178"
Cohesion: 0.47
Nodes (7): checkClaudeShims(), checkTrackedClaudeDirectory(), findStaleInstructionLines(), git(), listTracked(), main(), runChecks()

### Community 180 - "Community 180"
Cohesion: 0.25
Nodes (6): AgentCatalogItem, ConfigurableParam, ConfigurableParamSchema, MarketplaceCatalogItem, MarketplaceCatalogItemSchema, WorkflowCatalogItem

### Community 181 - "Community 181"
Cohesion: 0.46
Nodes (6): analyzeInventory(), listTopLevelScriptFiles(), main(), repoRoot(), SCRIPT_INVENTORY, SUPPORT_FILES

### Community 182 - "Community 182"
Cohesion: 0.29
Nodes (6): CurrentOrganization, CurrentUser, Param, Post, UploadedFile, UseInterceptors

### Community 183 - "Community 183"
Cohesion: 0.29
Nodes (5): AuthRequiredErrorBody, AuthUserPublic, AuthUserPublicSchema, LoginRequest, LoginRequestSchema

### Community 184 - "Community 184"
Cohesion: 0.43
Nodes (7): assertPositiveIntegerText(), buildChannelAccountFingerprint(), buildCoupangReplayBundle(), computeReplayFactDigest(), normalizeDigestValue(), sha256(), stableStringify()

### Community 185 - "Community 185"
Cohesion: 0.29
Nodes (5): deletedLegacyTables, repoRoot, retiredBaselineScript, retiredImporterFile, retiredPlannerFile

### Community 186 - "Community 186"
Cohesion: 0.33
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 187 - "Community 187"
Cohesion: 0.33
Nodes (4): SettlementReconcileDetail, SettlementReconcileDetailSchema, SettlementReconcileResponse, SettlementReconcileResponseSchema

### Community 188 - "Community 188"
Cohesion: 0.40
Nodes (4): RocketPoCatalogResolution, canonicalArtifactHash(), isCompleteCollection(), RocketPurchasePreviewRequestSchema

### Community 190 - "Community 190"
Cohesion: 0.50
Nodes (4): fileHash(), importInput(), makeRow(), representativeRows()

### Community 196 - "Community 196"
Cohesion: 0.50
Nodes (4): is_allowlisted(), is_comment_line(), load_file_lines(), check-tenant-scope.sh script

### Community 197 - "Community 197"
Cohesion: 1.00
Nodes (3): makeRepository(), runRecord(), runWithChunks()

### Community 198 - "Community 198"
Cohesion: 0.67
Nodes (3): detailOk(), listOk(), mockProductDetail()

### Community 200 - "Community 200"
Cohesion: 0.67
Nodes (3): extractEnvKeys(), readModelFile(), redactEnvValues()

## Knowledge Gaps
- **2276 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+2271 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Core schema` to `AgentOS schema`, `Community 2`, `Orders schema`, `Community 4`, `System schema`, `AI schema`, `prisma field: AdAction.externalId`, `Channels schema`, `Core schema`, `Community 14`, `Community 15`, `Community 16`, `AI schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `Sourcing schema`, `AI schema`, `AI schema`, `Core schema`, `Supply schema`, `Orders schema`, `Sourcing schema`, `Orders schema`, `Channels schema`, `AI schema`, `AI schema`, `Community 42`, `AI schema`, `Community 44`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `AI schema`, `Channels schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Inventory schema`, `Core schema`, `Supply schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `Advertising schema`, `Core schema`, `Orders schema`, `Channels schema`, `AI schema`, `AgentOS schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `Finance schema`, `Sourcing schema`, `AgentOS schema`, `Channels schema`, `Supply schema`, `Inventory schema`, `AgentOS schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `AgentOS schema`, `Core schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Core schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Orders schema`, `Finance schema`, `Orders schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `Inventory schema`, `Advertising schema`, `Channels schema`, `Finance schema`, `Core schema`, `Channels schema`, `Core schema`, `Channels schema`, `Advertising schema`, `System schema`, `System schema`, `Supply schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `System schema`, `prisma field: Organization.id`?**
  _High betweenness centrality (0.254) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `AgentOS schema` to `Core schema`, `Orders schema`, `System schema`, `AI schema`, `prisma field: AdAction.externalId`, `Channels schema`, `Core schema`, `AI schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `Sourcing schema`, `AI schema`, `AI schema`, `Core schema`, `Supply schema`, `Orders schema`, `Sourcing schema`, `Orders schema`, `Channels schema`, `AI schema`, `AI schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `AI schema`, `Channels schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Inventory schema`, `Core schema`, `Supply schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `Advertising schema`, `Core schema`, `Orders schema`, `Channels schema`, `AI schema`, `AgentOS schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `Finance schema`, `Sourcing schema`, `AgentOS schema`, `Channels schema`, `Supply schema`, `Inventory schema`, `AgentOS schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `AgentOS schema`, `Core schema`, `Channels schema`, `Channels schema`, `Advertising schema`, `Inventory schema`, `Inventory schema`, `Core schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Orders schema`, `Finance schema`, `Orders schema`, `System schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `Inventory schema`, `Advertising schema`, `Channels schema`, `Finance schema`, `Core schema`, `Channels schema`, `Core schema`, `Channels schema`, `System schema`, `Advertising schema`, `System schema`, `System schema`, `Supply schema`, `Sourcing schema`, `Advertising schema`, `Sourcing schema`, `Channels schema`, `System schema`?**
  _High betweenness centrality (0.182) - this node is a cross-community bridge._
- **Why does `Order` connect `Orders schema` to `Core schema`, `AgentOS schema`, `Community 2`, `Orders schema`, `Orders schema`, `System schema`, `Community 6`, `Orders schema`, `prisma field: AdAction.externalId`, `Core schema`, `Inventory schema`, `Community 13`, `Community 15`, `Community 14`, `Community 144`, `AI schema`, `AI schema`, `Community 21`, `Community 150`, `Community 151`, `Community 157`, `Advertising schema`, `Community 32`, `Supply schema`, `Orders schema`, `Community 163`, `Community 167`, `Community 42`, `Community 44`, `System schema`, `Community 58`, `Community 71`, `Orders schema`, `Community 82`, `Community 102`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Are the 144 inferred relationships involving `Organization` (e.g. with `channel-account.controller.ts` and `channel-account-list.controller.ts`) actually correct?**
  _`Organization` has 144 INFERRED edges - model-reasoned connections that need verification._
- **Are the 74 inferred relationships involving `ChannelListing` (e.g. with `channel-registration-capability.adapter.ts` and `channel-listing.controller.ts`) actually correct?**
  _`ChannelListing` has 74 INFERRED edges - model-reasoned connections that need verification._
- **Are the 106 inferred relationships involving `Order` (e.g. with `channel-sync.controller.ts` and `index.ts`) actually correct?**
  _`Order` has 106 INFERRED edges - model-reasoned connections that need verification._
- **Are the 109 inferred relationships involving `ChannelAccount` (e.g. with `channel-account.controller.ts` and `channel-account-list.controller.ts`) actually correct?**
  _`ChannelAccount` has 109 INFERRED edges - model-reasoned connections that need verification._