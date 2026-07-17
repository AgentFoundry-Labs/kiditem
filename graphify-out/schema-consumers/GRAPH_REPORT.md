# Graph Report - schema-consumers  (2026-07-17)

## Corpus Check
- 357 files · ~170,737 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5420 nodes · 27980 edges · 248 communities (233 shown, 15 thin omitted)
- Extraction: 34% EXTRACTED · 66% INFERRED · 0% AMBIGUOUS · INFERRED: 18467 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- prisma field: prisma — Shared Schema
- AgentOS schema
- Community 2
- prisma field: externalOptionId canonical option identity
- Community 4
- Core schema
- Core schema
- Community 7
- Core schema
- Community 9
- System schema
- Core schema
- Community 12
- Community 13
- Community 14
- Channels schema
- AgentOS schema
- Community 17
- Community 18
- Community 19
- Community 20
- AI schema
- System schema
- AI schema
- Community 24
- Orders schema
- AgentOS schema
- Community 27
- AgentOS schema
- Sourcing schema
- Community 30
- Community 31
- Community 32
- AI schema
- AI schema
- Community 35
- Community 36
- AI schema
- Sourcing schema
- AI schema
- Orders schema
- Community 41
- Core schema
- Orders schema
- Channels schema
- Core schema
- AI schema
- Orders schema
- Community 48
- Community 49
- Community 50
- AgentOS schema
- AgentOS schema
- Inventory schema
- Supply schema
- Channels schema
- AI schema
- AI schema
- Inventory schema
- Community 59
- AgentOS schema
- Inventory schema
- Community 62
- Community 63
- Community 64
- Channels schema
- Inventory schema
- AgentOS schema
- Supply schema
- Community 69
- Channels schema
- Finance schema
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Channels schema
- Community 78
- Community 79
- Advertising schema
- Supply schema
- Channels schema
- Community 83
- Community 84
- Channels schema
- AgentOS schema
- System schema
- Channels schema
- Sourcing schema
- Orders schema
- Sourcing schema
- AI schema
- AgentOS schema
- Finance schema
- Supply schema
- Channels schema
- Sourcing schema
- AgentOS schema
- Channels schema
- Supply schema
- Inventory schema
- Community 102
- Community 103
- Community 104
- Community 105
- Community 106
- Community 107
- Community 108
- AgentOS schema
- AI schema
- Sourcing schema
- Sourcing schema
- Channels schema
- AI schema
- Community 115
- Community 116
- Community 117
- Community 118
- Inventory schema
- Community 120
- Community 121
- Community 122
- AgentOS schema
- Channels schema
- Channels schema
- Advertising schema
- Inventory schema
- Inventory schema
- Supply schema
- Community 130
- Community 131
- Finance schema
- System schema
- Sourcing schema
- Finance schema
- Finance schema
- Channels schema
- Inventory schema
- Community 139
- Advertising schema
- Community 141
- Community 142
- Community 143
- Supply schema
- Channels schema
- Core schema
- Channels schema
- Community 148
- Community 149
- Community 150
- Community 151
- Community 152
- Sourcing schema
- System schema
- Community 155
- Community 156
- Community 157
- Advertising schema
- System schema
- System schema
- Supply schema
- Community 162
- Community 163
- Community 164
- Community 165
- Community 166
- System schema
- Advertising schema
- Sourcing schema
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
- Community 205

## God Nodes (most connected - your core abstractions)
1. `Organization` - 393 edges
2. `Database ERD` - 346 edges
3. `ChannelListing` - 162 edges
4. `ChannelAccount` - 156 edges
5. `Order` - 155 edges
6. `prisma — Shared Schema` - 155 edges
7. `ContentWorkspace.organizationId` - 145 edges
8. `ProductPreparation.organizationId` - 145 edges
9. `ChannelListing.organizationId` - 141 edges
10. `User` - 140 edges
11. `SourceImportRun.organizationId` - 140 edges
12. `ContentWorkspaceThumbnailSelection.organizationId` - 139 edges

## Surprising Connections (you probably didn't know these)
- `distinctStrings()` --indirect_call--> `value()`  [INFERRED]
  apps/server/src/channels/adapter/out/repository/channel-product-matching.repository.adapter.ts → scripts/_shared/cli-args.ts
- `rankChannelProductCandidates()` --indirect_call--> `value()`  [INFERRED]
  apps/server/src/channels/domain/channel-product-candidate-ranking.ts → scripts/_shared/cli-args.ts
- `productSearchText()` --indirect_call--> `value()`  [INFERRED]
  apps/server/src/channels/domain/channel-product-candidate-ranking.ts → scripts/_shared/cli-args.ts
- `classifyCodeEvidence()` --indirect_call--> `value()`  [INFERRED]
  apps/server/src/channels/domain/channel-recipe-suggestion.ts → scripts/_shared/cli-args.ts
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

## Communities (248 total, 15 thin omitted)

### Community 0 - "prisma field: prisma — Shared Schema"
Cohesion: 0.17
Nodes (223): UploadedWorkbookFile, HEADERS, USER, chunkSelect, ErrorInput, LockedRun, OwnedRunInput, PutChunkInput (+215 more)

### Community 1 - "AgentOS schema"
Cohesion: 0.04
Nodes (95): Database ERD, AgentApprovalRequest.agentInstanceId, AgentArtifact.agentInstanceId, AgentAuthorizationEvent.agentInstanceId, AgentCostEvent.agentInstanceId, AgentInstance.adapterConfig, AgentInstance.adapterType, AgentInstance.createdAt (+87 more)

### Community 2 - "Community 2"
Cohesion: 0.02
Nodes (101): AgentApprovalRequestSummary, AgentApprovalRequestSummarySchema, AgentApprovalStatus, AgentApprovalStatusSchema, AgentArtifactHandoffSummary, AgentArtifactHandoffSummarySchema, AgentArtifactStatus, AgentArtifactStatusSchema (+93 more)

### Community 3 - "prisma field: externalOptionId canonical option identity"
Cohesion: 0.12
Nodes (57): ListingForProductSync, ChannelAccountService, Injectable, accountIdFor(), seedOrderInline(), seedReturnInline(), CHANNELS_CAPABILITIES, ChannelsCapabilityKey (+49 more)

### Community 4 - "Community 4"
Cohesion: 0.03
Nodes (73): AdMetricsDetail, AdMetricsDetailSchema, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary, DashboardAdSummarySchema (+65 more)

### Community 5 - "Core schema"
Cohesion: 0.05
Nodes (55): ChannelProductCandidate, ChannelProductCandidateRankingInput, emptyEvidence(), keep(), normalizeChannelBarcode(), normalizeChannelMatchName(), productSearchText(), rankChannelProductCandidates() (+47 more)

### Community 6 - "Core schema"
Cohesion: 0.04
Nodes (69): Core, CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.keywords, CategoryMapping.organization (+61 more)

### Community 7 - "Community 7"
Cohesion: 0.04
Nodes (51): ChannelRegistrationCapabilityAdapter, Injectable, ChannelCatalogImportController, Controller, Inject, ChannelSkuAvailabilityController, Controller, SellpiaRecipeEvidenceAdapter (+43 more)

### Community 8 - "Core schema"
Cohesion: 0.04
Nodes (62): CHANNEL_LISTING_SORTS, CHANNEL_LISTING_TABS, AVAILABILITY_STATUSES, ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id (+54 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (67): AdapterCommand, appendFlag(), appendOption(), appendProjectReferenceDefaults(), archiveFileName(), archiveShaFileName(), Args, BundleManifest (+59 more)

### Community 10 - "System schema"
Cohesion: 0.04
Nodes (57): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.href (+49 more)

### Community 11 - "Core schema"
Cohesion: 0.05
Nodes (35): Organization.createdAt, Organization.id, Organization.name, Organization.slug, Organization.updatedAt, Organization, DATA_MIGRATION_IDS, DATA_MIGRATION_RELEASES (+27 more)

### Community 12 - "Community 12"
Cohesion: 0.06
Nodes (61): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot, AdCampaignSnapshotSchema (+53 more)

### Community 13 - "Community 13"
Cohesion: 0.06
Nodes (57): ActionTask, ActionTaskExecuteResponse, ActionTaskList, ActionTaskListSchema, ActionTaskRelatedProduct, ActionTaskRelatedProductSchema, ActionTaskSchema, ActionTaskSourceAlert (+49 more)

### Community 14 - "Community 14"
Cohesion: 0.03
Nodes (61): CreateMasterProductInput, CreateMasterProductInputSchema, CreateProductVariantFieldsSchema, CreateProductVariantInput, CreateProductVariantInputSchema, MasterProductDisplayReference, MasterProductDisplayReferenceSchema, MasterProductMutationFieldsSchema (+53 more)

### Community 15 - "Channels schema"
Cohesion: 0.04
Nodes (55): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+47 more)

### Community 16 - "AgentOS schema"
Cohesion: 0.04
Nodes (52): AgentOS, AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy, AgentAuthorizationEvent.decidedByUserId (+44 more)

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (45): apiHeaders(), apiUrl(), Args, assertSafeDatasetId(), assertSupportedReplayPayloads(), BundleManifest, BundlePayload, BundleReference (+37 more)

### Community 18 - "Community 18"
Cohesion: 0.10
Nodes (48): assertNonProductionTarget(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged(), assertSha256(), BaselineManifest, BaselineManifestExpectation, baselineObjectKeys, buildChecksumsFile() (+40 more)

### Community 19 - "Community 19"
Cohesion: 0.04
Nodes (47): deriveSellpiaInventoryFreshness(), FixedSellpiaAccountKeySchema, FixedSellpiaOriginSchema, IsoDateTimeStringSchema, SELLPIA_INVENTORY_FRESHNESS_STATUSES, SELLPIA_INVENTORY_REFRESH_REASONS, SellpiaFreshnessDerivationInput, SellpiaInventoryActiveSyncViewSchema (+39 more)

### Community 20 - "Community 20"
Cohesion: 0.04
Nodes (40): ChannelAccountListItem, ChannelAccountListItemSchema, CoupangAccountSettings, CoupangAccountSettingsSchema, UpdateCoupangAccountSettings, ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow (+32 more)

### Community 21 - "AI schema"
Cohesion: 0.05
Nodes (46): ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.contentWorkspaceId, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.editedHtmlSavedAt (+38 more)

### Community 22 - "System schema"
Cohesion: 0.06
Nodes (35): assertExactProductGraph(), upsertExactOptionLinks(), asRecord(), KidItemFirstOptionLink, KidItemFirstRegistrationLinks, normalizedOptionId(), normalizeKidItemFirstRegistrationLinks(), parseKidItemFirstRegistrationLinks() (+27 more)

### Community 23 - "AI schema"
Cohesion: 0.05
Nodes (44): packages/shared — @kiditem/shared, AI, Inventory, ProductPreparation.selectedThumbnailGenerationId, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.contentWorkspaceId, ThumbnailGeneration.createdAt (+36 more)

### Community 24 - "Community 24"
Cohesion: 0.09
Nodes (39): applyCacheControl(), ApplyResult, applyS3CacheControl(), applySupabaseCacheControl(), assertApplyAllowed(), buildCopyObjectInput(), CliArgs, CliConfig (+31 more)

### Community 25 - "Orders schema"
Cohesion: 0.05
Nodes (42): Orders, CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id (+34 more)

### Community 26 - "AgentOS schema"
Cohesion: 0.05
Nodes (43): AgentRunRequest.agentInstance, AgentRunRequest.attempts, AgentRunRequest.claimedAt, AgentRunRequest.claimedBy, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.coalescedIntoRequestId, AgentRunRequest.conversation, AgentRunRequest.createdAt (+35 more)

### Community 27 - "Community 27"
Cohesion: 0.08
Nodes (21): ChannelSyncController, Body, Controller, CurrentOrganization, CurrentUser, Get, Post, OperationAlertPort (+13 more)

### Community 28 - "AgentOS schema"
Cohesion: 0.05
Nodes (42): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+34 more)

### Community 29 - "Sourcing schema"
Cohesion: 0.05
Nodes (41): CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id, CandidateImage.isPrimary (+33 more)

### Community 30 - "Community 30"
Cohesion: 0.05
Nodes (36): PANEL_RUN_SOURCES, PanelRunSource, PanelRunSourceSchema, sourceKeys, PANEL_ITEM_KINDS, PanelAlertItem, PanelAlertItemSchema, PanelDismissEventSchema (+28 more)

### Community 31 - "Community 31"
Cohesion: 0.06
Nodes (29): ChannelListingController, Controller, CurrentOrganization, Get, Param, Query, ChannelListingQueryDto, IsIn (+21 more)

### Community 32 - "Community 32"
Cohesion: 0.07
Nodes (22): Inject, ChannelAccountRepositoryAdapter, envelopeToJson(), maskAccessKey(), readCredentialsConfig(), stripLegacyCredentialKeys(), toJsonRecord(), toRecord() (+14 more)

### Community 33 - "AI schema"
Cohesion: 0.06
Nodes (36): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height (+28 more)

### Community 34 - "AI schema"
Cohesion: 0.06
Nodes (40): ContentGeneration.detailPageArtifactId, ContentWorkspace.currentDetailPageArtifactId, ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.contentWorkspaceId, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.createdByUserId (+32 more)

### Community 35 - "Community 35"
Cohesion: 0.05
Nodes (36): ChunkRequestBaseSchema, CoupangCatalogAttributeV1, CoupangCatalogAttributeV1Schema, CoupangCatalogBrowserCommand, CoupangCatalogBrowserCommandSchema, CoupangCatalogBrowserStatus, CoupangCatalogBrowserStatusSchema, CoupangCatalogChunkKind (+28 more)

### Community 36 - "Community 36"
Cohesion: 0.05
Nodes (34): RocketPoCatalogResolution, canonicalArtifactHash(), isCompleteCollection(), boundedText(), isoDay, requiredText(), ROCKET_SHORTAGE_REASONS, RocketPoCatalogPublication (+26 more)

### Community 37 - "AI schema"
Cohesion: 0.06
Nodes (38): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+30 more)

### Community 38 - "Sourcing schema"
Cohesion: 0.06
Nodes (33): ContentGeneration.sourceCandidateId, SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.id, SourcingCandidate.imageUrl (+25 more)

### Community 39 - "AI schema"
Cohesion: 0.06
Nodes (37): ProductPreparation.channelAccount, ProductPreparation.channelAccountId, ProductPreparation.channelListing, ProductPreparation.channelListingId, ProductPreparation.createdAt, ProductPreparation.createdByUser, ProductPreparation.createdByUserId, ProductPreparation.deletedAt (+29 more)

### Community 40 - "Orders schema"
Cohesion: 0.06
Nodes (29): CHANNELS_ROOT, REPO_ROOT, Order.channelAccount, Order.channelAccountId, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber (+21 more)

### Community 41 - "Community 41"
Cohesion: 0.06
Nodes (32): ChannelMatchCandidateReason, ChannelMatchCandidateReasonSchema, ChannelMatchEvidence, ChannelMatchEvidenceSchema, ChannelMatchingAccount, ChannelMatchingAccountSchema, ChannelOptionMatchingQueueRow, ChannelOptionMatchingQueueRowSchema (+24 more)

### Community 42 - "Core schema"
Cohesion: 0.06
Nodes (33): AgentApprovalRequest.decidedByUserId, AgentApprovalRequest.requestedByUserId, AgentRunRequest.requestedByUserId, OrganizationMembership.createdAt, OrganizationMembership.id, OrganizationMembership.invitedBy, OrganizationMembership.invitedById, OrganizationMembership.joinedAt (+25 more)

### Community 43 - "Orders schema"
Cohesion: 0.06
Nodes (36): OrderReturn.channelAccount, OrderReturn.channelAccountId, OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.id (+28 more)

### Community 44 - "Channels schema"
Cohesion: 0.07
Nodes (35): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel, ChannelAdTargetDailySnapshot.clicks (+27 more)

### Community 45 - "Core schema"
Cohesion: 0.08
Nodes (34): ChannelListing.lastImportRunId, ChannelListingOption.lastImportRunId, SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.createdAt, SourceImportRun.createdBy, SourceImportRun.errorCode (+26 more)

### Community 46 - "AI schema"
Cohesion: 0.07
Nodes (35): ContentWorkspaceThumbnailSelection.contentAsset, ContentWorkspaceThumbnailSelection.contentAssetId, ContentWorkspaceThumbnailSelection.contentWorkspace, ContentWorkspaceThumbnailSelection.contentWorkspaceId, ContentWorkspaceThumbnailSelection.createdAt, ContentWorkspaceThumbnailSelection.createdByUser, ContentWorkspaceThumbnailSelection.createdByUserId, ContentWorkspaceThumbnailSelection.id (+27 more)

### Community 47 - "Orders schema"
Cohesion: 0.06
Nodes (35): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.metadata, OrderLineItem.optionName, OrderLineItem.order, OrderLineItem.organization (+27 more)

### Community 48 - "Community 48"
Cohesion: 0.06
Nodes (34): ACCOUNT_AD_DAILY_DIGEST_KEYS, AD_ROW_KEYS, AD_SUMMARY_KEYS, ADS_DAILY_ROW_KEYS, ADS_KPI_KEYS, assertExactCount(), assertProtectedSupabaseDestination(), assertReadyCounts() (+26 more)

### Community 49 - "Community 49"
Cohesion: 0.07
Nodes (31): DeliveryCompany, DeliveryCompanySchema, Order, OrderActionResponse, OrderActionResponseSchema, OrderLineItem, OrderLineItemSchema, OrderListItem (+23 more)

### Community 50 - "Community 50"
Cohesion: 0.12
Nodes (33): DataMigrationContext, DataMigrationTarget, MigrationResult, appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertMutatingTarget(), CliArgs, Command (+25 more)

### Community 51 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+25 more)

### Community 52 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.startedAt, WorkflowRun.status (+25 more)

### Community 53 - "Inventory schema"
Cohesion: 0.07
Nodes (33): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.fromWarehouseId, StockTransfer.id, StockTransfer.notes, StockTransfer.optionName, StockTransfer.organization (+25 more)

### Community 54 - "Supply schema"
Cohesion: 0.07
Nodes (31): Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.id, Supplier.leadTimeDays, Supplier.name, Supplier.notes (+23 more)

### Community 55 - "Channels schema"
Cohesion: 0.08
Nodes (31): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.channelAccount, ChannelScrapeRun.channelAccountId, ChannelScrapeRun.clientRunKey, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson (+23 more)

### Community 56 - "AI schema"
Cohesion: 0.07
Nodes (28): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt (+20 more)

### Community 57 - "AI schema"
Cohesion: 0.09
Nodes (29): ContentWorkspace.channelListing, ContentWorkspace.channelListingId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.createdByUserId, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageRevision, ContentWorkspace.currentThumbnailSelection (+21 more)

### Community 58 - "Inventory schema"
Cohesion: 0.08
Nodes (26): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.sourceRef, SellpiaReceiptUploadBatch.sourceType (+18 more)

### Community 59 - "Community 59"
Cohesion: 0.07
Nodes (9): CoupangProviderPort, MarketplaceRegistrationRepositoryPort, ChannelSyncRepositoryPort, OrderSyncDeps, ProductSyncDeps, Inject, Optional, Inject (+1 more)

### Community 60 - "AgentOS schema"
Cohesion: 0.08
Nodes (28): AgentToolInvocation.agentInstance, AgentToolInvocation.approvalRequest, AgentToolInvocation.approvalRequestId, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt, AgentToolInvocation.errorCode (+20 more)

### Community 61 - "Inventory schema"
Cohesion: 0.09
Nodes (27): SellpiaOrderTransmissionIntent.abortedAt, SellpiaOrderTransmissionIntent.createdAt, SellpiaOrderTransmissionIntent.createdBy, SellpiaOrderTransmissionIntent.creator, SellpiaOrderTransmissionIntent.finalizedAt, SellpiaOrderTransmissionIntent.finalizedGeneration, SellpiaOrderTransmissionIntent.id, SellpiaOrderTransmissionIntent.intentKey (+19 more)

### Community 62 - "Community 62"
Cohesion: 0.09
Nodes (22): adapterPaths, BROWSER_COLLECTION_ATTENTION_REASONS, BROWSER_COLLECTION_PRODUCERS, BROWSER_COLLECTION_STATES, BrowserCollectionAttentionReasonSchema, BrowserCollectionClassificationSchema, BrowserCollectionCommand, BrowserCollectionCommandSchema (+14 more)

### Community 63 - "Community 63"
Cohesion: 0.14
Nodes (27): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+19 more)

### Community 64 - "Community 64"
Cohesion: 0.15
Nodes (26): cellText(), collectParentMetadataConflicts(), decodeWorksheetRange(), expandMergedParentCells(), findHeaderRow(), formattedCellText(), hasCellValue(), headersForRow() (+18 more)

### Community 65 - "Channels schema"
Cohesion: 0.08
Nodes (27): CoupangWingSalesRankDailySnapshot.businessDate, CoupangWingSalesRankDailySnapshot.capturedAt, CoupangWingSalesRankDailySnapshot.categoryHierarchy, CoupangWingSalesRankDailySnapshot.collectedCount, CoupangWingSalesRankDailySnapshot.conversionRate28d, CoupangWingSalesRankDailySnapshot.createdAt, CoupangWingSalesRankDailySnapshot.id, CoupangWingSalesRankDailySnapshot.itemId (+19 more)

### Community 66 - "Inventory schema"
Cohesion: 0.07
Nodes (27): SellpiaInventoryState.activeGeneration, SellpiaInventoryState.activeSyncLeaseExpiresAt, SellpiaInventoryState.activeSyncOwner, SellpiaInventoryState.activeSyncOwnerUserId, SellpiaInventoryState.activeSyncStartedAt, SellpiaInventoryState.activeSyncToken, SellpiaInventoryState.createdAt, SellpiaInventoryState.failedGeneration (+19 more)

### Community 67 - "AgentOS schema"
Cohesion: 0.08
Nodes (26): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.approver, AgentApprovalRequest.approverUserId, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy, AgentApprovalRequest.decisionReason (+18 more)

### Community 68 - "Supply schema"
Cohesion: 0.08
Nodes (26): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+18 more)

### Community 69 - "Community 69"
Cohesion: 0.10
Nodes (22): SellpiaInventoryGenerationSchema, SellpiaInventoryQualityReportSchema, CompletedSourceArtifactRun, CoupangWingCatalogImportResponse, CoupangWingCatalogImportResponseSchema, ImportChanges, SellpiaInventoryImportOutcome, SellpiaInventoryImportOutcomeSchema (+14 more)

### Community 70 - "Channels schema"
Cohesion: 0.09
Nodes (25): ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isOfferWinner, ChannelListingOptionDailySnapshot.lastObservedAt, ChannelListingOptionDailySnapshot.listing (+17 more)

### Community 71 - "Finance schema"
Cohesion: 0.09
Nodes (22): GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.listing, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization, GradeHistory.reason (+14 more)

### Community 72 - "Community 72"
Cohesion: 0.08
Nodes (23): ChannelSkuMappingComponent, ChannelSkuMappingComponentSchema, ChannelSkuMappingCounts, ChannelSkuMappingCountsSchema, ChannelSkuMappingListItem, ChannelSkuMappingListItemSchema, ChannelSkuMappingListResponse, ChannelSkuMappingListResponseSchema (+15 more)

### Community 73 - "Community 73"
Cohesion: 0.10
Nodes (23): InventorySkuLinkedProduct, InventorySkuLinkedProductSchema, InventorySkuLinkedVariant, InventorySkuLinkedVariantSchema, InventorySkuSnapshotItem, InventorySkuSnapshotItemSchema, InventorySkuSnapshotListResponse, InventorySkuSnapshotListResponseSchema (+15 more)

### Community 74 - "Community 74"
Cohesion: 0.08
Nodes (22): StatisticsCategoryRow, StatisticsCategoryRowSchema, StatisticsDeliveryDaily, StatisticsDeliveryDailySchema, StatisticsDeliveryResponse, StatisticsDeliveryResponseSchema, StatisticsGradeRow, StatisticsGradeRowSchema (+14 more)

### Community 75 - "Community 75"
Cohesion: 0.09
Nodes (9): Inject, ChannelSkuAvailabilityPort, ChannelProductMatchingRepositoryPort, Inject, ChannelSkuAvailabilityService, matchesStatus(), toAvailabilityItem(), Inject (+1 more)

### Community 76 - "Community 76"
Cohesion: 0.11
Nodes (20): ChannelMatchCandidateQueryDto, ChannelProductMatchingQueryDto, IsOptional, IsString, IsUUID, MaxLength, IsOptional, IsString (+12 more)

### Community 77 - "Channels schema"
Cohesion: 0.09
Nodes (23): ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.id, ChannelScrapeSnapshot.listing, ChannelScrapeSnapshot.listingOption (+15 more)

### Community 78 - "Community 78"
Cohesion: 0.20
Nodes (8): ChannelDashboardController, Controller, CurrentOrganization, Get, Query, CoupangDateRangeQueryDto, ChannelDashboardService, Injectable

### Community 79 - "Community 79"
Cohesion: 0.14
Nodes (19): distinct(), evidenceForCode(), ChannelRecipeSuggestionEvidenceKind, ChannelRecipeSuggestionInput, ChannelRecipeSuggestionResponse, ChannelRecipeSuggestionSku, ChannelRecipeSuggestionStatus, classifyChannelRecipeSuggestion() (+11 more)

### Community 80 - "Advertising schema"
Cohesion: 0.09
Nodes (23): AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+15 more)

### Community 81 - "Supply schema"
Cohesion: 0.10
Nodes (23): RocketPurchaseConfirmation.channelAccount, RocketPurchaseConfirmation.channelAccountId, RocketPurchaseConfirmation.confirmedAt, RocketPurchaseConfirmation.confirmedBy, RocketPurchaseConfirmation.confirmer, RocketPurchaseConfirmation.createdAt, RocketPurchaseConfirmation.freshnessGeneration, RocketPurchaseConfirmation.id (+15 more)

### Community 82 - "Channels schema"
Cohesion: 0.11
Nodes (22): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.channelAccount, ChannelAccountDailyKpiSnapshot.channelAccountId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+14 more)

### Community 83 - "Community 83"
Cohesion: 0.20
Nodes (14): CoupangCredentials, coupangRequest(), CoupangRequestOptions, generateAuthorization(), approveReturn(), confirmOrderSheets(), DELIVERY_COMPANIES, getOrderSheets() (+6 more)

### Community 84 - "Community 84"
Cohesion: 0.13
Nodes (21): assembleCompleteSnapshot(), assertSameManifest(), buildCollectionStatus(), countMedia(), countOptions(), derivePhase(), firstDate(), hashCatalogChunkPayload() (+13 more)

### Community 85 - "Channels schema"
Cohesion: 0.11
Nodes (21): Channels, CoupangKeywordTracker.createdAt, CoupangKeywordTracker.enabled, CoupangKeywordTracker.id, CoupangKeywordTracker.keyword, CoupangKeywordTracker.lastCapturedAt, CoupangKeywordTracker.maxPages, CoupangKeywordTracker.organization (+13 more)

### Community 86 - "AgentOS schema"
Cohesion: 0.10
Nodes (21): AgentArtifact.agentInstance, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization, AgentArtifact.request (+13 more)

### Community 87 - "System schema"
Cohesion: 0.10
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+13 more)

### Community 88 - "Channels schema"
Cohesion: 0.11
Nodes (21): CoupangKeywordRankDailySnapshot.adRank, CoupangKeywordRankDailySnapshot.businessDate, CoupangKeywordRankDailySnapshot.capturedAt, CoupangKeywordRankDailySnapshot.createdAt, CoupangKeywordRankDailySnapshot.id, CoupangKeywordRankDailySnapshot.itemId, CoupangKeywordRankDailySnapshot.keyword, CoupangKeywordRankDailySnapshot.organicRank (+13 more)

### Community 89 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): LiveCommerceBroadcastDailySnapshot.broadcasterId, LiveCommerceBroadcastDailySnapshot.broadcasterName, LiveCommerceBroadcastDailySnapshot.broadcastId, LiveCommerceBroadcastDailySnapshot.businessDate, LiveCommerceBroadcastDailySnapshot.capturedAt, LiveCommerceBroadcastDailySnapshot.coverImageUrl, LiveCommerceBroadcastDailySnapshot.createdAt, LiveCommerceBroadcastDailySnapshot.endedAt (+13 more)

### Community 90 - "Orders schema"
Cohesion: 0.10
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 91 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): ShortsTrendDailySnapshot.businessDate, ShortsTrendDailySnapshot.capturedAt, ShortsTrendDailySnapshot.channelName, ShortsTrendDailySnapshot.commentCount, ShortsTrendDailySnapshot.createdAt, ShortsTrendDailySnapshot.id, ShortsTrendDailySnapshot.keyword, ShortsTrendDailySnapshot.likeCount (+13 more)

### Community 92 - "AI schema"
Cohesion: 0.10
Nodes (21): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.contentWorkspace, ThumbnailAnalysis.contentWorkspaceId, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id (+13 more)

### Community 93 - "AgentOS schema"
Cohesion: 0.11
Nodes (20): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id, AgentCostEvent.inputTokens (+12 more)

### Community 94 - "Finance schema"
Cohesion: 0.12
Nodes (20): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit (+12 more)

### Community 95 - "Supply schema"
Cohesion: 0.12
Nodes (20): RocketPurchaseConfirmationLine.channelListingOption, RocketPurchaseConfirmationLine.channelListingOptionId, RocketPurchaseConfirmationLine.confirmation, RocketPurchaseConfirmationLine.confirmationId, RocketPurchaseConfirmationLine.confirmedQuantity, RocketPurchaseConfirmationLine.createdAt, RocketPurchaseConfirmationLine.id, RocketPurchaseConfirmationLine.orderQuantity (+12 more)

### Community 96 - "Channels schema"
Cohesion: 0.12
Nodes (20): SellpiaProductMonthlySales.buyPrice, SellpiaProductMonthlySales.capturedAt, SellpiaProductMonthlySales.createdAt, SellpiaProductMonthlySales.id, SellpiaProductMonthlySales.inAmount, SellpiaProductMonthlySales.inQty, SellpiaProductMonthlySales.optionCode, SellpiaProductMonthlySales.optionName (+12 more)

### Community 97 - "Sourcing schema"
Cohesion: 0.12
Nodes (20): Sourcing1688HotProductDailySnapshot.businessDate, Sourcing1688HotProductDailySnapshot.capturedAt, Sourcing1688HotProductDailySnapshot.createdAt, Sourcing1688HotProductDailySnapshot.id, Sourcing1688HotProductDailySnapshot.imageUrl, Sourcing1688HotProductDailySnapshot.monthlySales, Sourcing1688HotProductDailySnapshot.offerId, Sourcing1688HotProductDailySnapshot.organization (+12 more)

### Community 98 - "AgentOS schema"
Cohesion: 0.12
Nodes (19): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError, AgentTaskSession.lastRun (+11 more)

### Community 99 - "Channels schema"
Cohesion: 0.12
Nodes (19): CoupangWingTrackedProductDailySnapshot.businessDate, CoupangWingTrackedProductDailySnapshot.capturedAt, CoupangWingTrackedProductDailySnapshot.conversionRate28d, CoupangWingTrackedProductDailySnapshot.createdAt, CoupangWingTrackedProductDailySnapshot.estimatedRevenue28d, CoupangWingTrackedProductDailySnapshot.id, CoupangWingTrackedProductDailySnapshot.organization, CoupangWingTrackedProductDailySnapshot.pvLast28Day (+11 more)

### Community 100 - "Supply schema"
Cohesion: 0.12
Nodes (19): PurchaseOrderSubmissionAttempt.createdAt, PurchaseOrderSubmissionAttempt.errorCode, PurchaseOrderSubmissionAttempt.errorMessage, PurchaseOrderSubmissionAttempt.freshnessGeneration, PurchaseOrderSubmissionAttempt.id, PurchaseOrderSubmissionAttempt.idempotencyKey, PurchaseOrderSubmissionAttempt.organization, PurchaseOrderSubmissionAttempt.providerReference (+11 more)

### Community 101 - "Inventory schema"
Cohesion: 0.12
Nodes (19): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.notes, ReturnTransfer.optionName, ReturnTransfer.organization (+11 more)

### Community 102 - "Community 102"
Cohesion: 0.11
Nodes (17): ChannelSkuAvailabilityComponent, ChannelSkuAvailabilityComponentSchema, ChannelSkuAvailabilityItem, ChannelSkuAvailabilityItemSchema, ChannelSkuAvailabilityListResponse, ChannelSkuAvailabilityListResponseSchema, ChannelSkuAvailabilityMappingStatusSchema, ChannelSkuAvailabilityQuery (+9 more)

### Community 103 - "Community 103"
Cohesion: 0.15
Nodes (14): PRODUCT_LIFECYCLE_STATES, ProductLifecycleState, ProductLifecycleStateSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, MasterImageItem, MasterImageItemSchema, MasterImageRole (+6 more)

### Community 104 - "Community 104"
Cohesion: 0.22
Nodes (17): analyzePrReleaseContract(), changedFilesFromGit(), classifyFiles(), compareSemver(), ghPrBody(), git(), hasReleaseDecision(), isDevelopToMainPromotion() (+9 more)

### Community 105 - "Community 105"
Cohesion: 0.16
Nodes (17): appendValues(), Lane, parseArgs(), ParsedArgs, parseRawArgs(), ParseRawArgsOptions, pushValue(), value() (+9 more)

### Community 106 - "Community 106"
Cohesion: 0.18
Nodes (10): assertCanonicalCoupangAccountIdentity(), canonicalParentRows(), ChannelCatalogImportRepositoryAdapter, importResponse(), isUniqueConstraintError(), nextPublicationSequence(), Injectable, zeroChanges() (+2 more)

### Community 107 - "Community 107"
Cohesion: 0.11
Nodes (4): ChannelDashboardRepositoryAdapter, Injectable, ChannelDashboardRepositoryPort, Inject

### Community 108 - "Community 108"
Cohesion: 0.14
Nodes (12): lockChannelListingRow(), availabilityListingWhere(), ChannelProductMatchingRepositoryAdapter, completedCatalogRunWhere(), componentSource(), lockChannelListing(), matchingListingWhere(), optionIdentity() (+4 more)

### Community 109 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.id, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.lastRunId (+10 more)

### Community 110 - "AI schema"
Cohesion: 0.12
Nodes (18): ContentAsset.originGenerationGroupId, ContentGeneration.generationGroupId, ContentGenerationGroup.baseContentGeneration, ContentGenerationGroup.baseContentGenerationId, ContentGenerationGroup.contentWorkspace, ContentGenerationGroup.contentWorkspaceId, ContentGenerationGroup.createdAt, ContentGenerationGroup.createdByUserId (+10 more)

### Community 111 - "Sourcing schema"
Cohesion: 0.14
Nodes (18): LiveCommerceProductDailySnapshot.broadcastId, LiveCommerceProductDailySnapshot.businessDate, LiveCommerceProductDailySnapshot.capturedAt, LiveCommerceProductDailySnapshot.createdAt, LiveCommerceProductDailySnapshot.id, LiveCommerceProductDailySnapshot.imageUrl, LiveCommerceProductDailySnapshot.organization, LiveCommerceProductDailySnapshot.priceCny (+10 more)

### Community 112 - "Sourcing schema"
Cohesion: 0.13
Nodes (18): NaverKeywordDailySnapshot.averageAdRank, NaverKeywordDailySnapshot.businessDate, NaverKeywordDailySnapshot.capturedAt, NaverKeywordDailySnapshot.competitionIndex, NaverKeywordDailySnapshot.createdAt, NaverKeywordDailySnapshot.id, NaverKeywordDailySnapshot.keyword, NaverKeywordDailySnapshot.monthlyMobileSearchCount (+10 more)

### Community 113 - "Channels schema"
Cohesion: 0.12
Nodes (18): RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt, RocketPurchaseOrder.firstSkuName, RocketPurchaseOrder.id, RocketPurchaseOrder.items, RocketPurchaseOrder.orderAmount, RocketPurchaseOrder.orderedAt (+10 more)

### Community 114 - "AI schema"
Cohesion: 0.12
Nodes (18): ThumbnailGenerationEvent.actor, ThumbnailGenerationEvent.actorUserId, ThumbnailGenerationEvent.attemptNumber, ThumbnailGenerationEvent.createdAt, ThumbnailGenerationEvent.errorMessage, ThumbnailGenerationEvent.eventType, ThumbnailGenerationEvent.fromPhase, ThumbnailGenerationEvent.fromStatus (+10 more)

### Community 115 - "Community 115"
Cohesion: 0.11
Nodes (16): CANCEL_OPERATION_TARGET_TYPES, CancelOperationAffected, CancelOperationAffectedSchema, CancelOperationPreserved, CancelOperationPreservedSchema, CancelOperationResponse, CancelOperationResponseSchema, CancelOperationStatus (+8 more)

### Community 116 - "Community 116"
Cohesion: 0.22
Nodes (18): assertCurrentRebuildBinding(), assertProtectedApiDestination(), assertReplayCounts(), assertReplayFactDigest(), bootstrap(), buildSharedBootstrapPlan(), cliValue(), createPrisma() (+10 more)

### Community 117 - "Community 117"
Cohesion: 0.12
Nodes (8): CoupangProviderAdapter, Injectable, CoupangCreateSellerProductResponse, CoupangSellerProductPayload, OrderSheetResponse, SellerProductDetailResponse, SellerProductExternalSkuResponse, SellerProductListResponse

### Community 118 - "Community 118"
Cohesion: 0.18
Nodes (8): ChannelCatalogCollectionRepositoryAdapter, isUniqueConstraintError(), ownedRunWhere(), Injectable, ChannelCatalogCollectionChunkRecord, ChannelCatalogCollectionRunRecord, ChannelCatalogCollectionWithChunks, startRun()

### Community 119 - "Inventory schema"
Cohesion: 0.14
Nodes (17): SellpiaInventorySku.code, SellpiaInventorySku.createdAt, SellpiaInventorySku.currentStock, SellpiaInventorySku.id, SellpiaInventorySku.lastImportRun, SellpiaInventorySku.lastImportRunId, SellpiaInventorySku.name, SellpiaInventorySku.optionName (+9 more)

### Community 120 - "Community 120"
Cohesion: 0.23
Nodes (5): Inject, ChannelCatalogCollectionPort, ChannelCatalogCollectionService, parseRequest(), Injectable

### Community 121 - "Community 121"
Cohesion: 0.26
Nodes (9): ChannelProductMatchingController, Body, Controller, CurrentOrganization, Get, Param, Put, Query (+1 more)

### Community 122 - "Community 122"
Cohesion: 0.12
Nodes (15): CurrentOrganization, Get, Query, ChannelSkuAvailabilityQueryDto, IsIn, IsInt, IsOptional, IsString (+7 more)

### Community 123 - "AgentOS schema"
Cohesion: 0.15
Nodes (16): AgentRunEvent.agentInstance, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message, AgentRunEvent.organization (+8 more)

### Community 124 - "Channels schema"
Cohesion: 0.16
Nodes (16): ChannelScrapeChunk.checksum, ChannelScrapeChunk.createdAt, ChannelScrapeChunk.id, ChannelScrapeChunk.itemCount, ChannelScrapeChunk.kind, ChannelScrapeChunk.organization, ChannelScrapeChunk.payload, ChannelScrapeChunk.publicationJson (+8 more)

### Community 125 - "Channels schema"
Cohesion: 0.14
Nodes (16): CoupangWingTrackedProduct.brandName, CoupangWingTrackedProduct.categoryHierarchy, CoupangWingTrackedProduct.createdAt, CoupangWingTrackedProduct.enabled, CoupangWingTrackedProduct.id, CoupangWingTrackedProduct.imagePath, CoupangWingTrackedProduct.itemId, CoupangWingTrackedProduct.lastCapturedAt (+8 more)

### Community 126 - "Advertising schema"
Cohesion: 0.13
Nodes (16): ExecutionTask.action, ExecutionTask.actionId, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt, ExecutionTask.errorMessage, ExecutionTask.finishedAt (+8 more)

### Community 127 - "Inventory schema"
Cohesion: 0.13
Nodes (16): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.organization, PickingItem.pickedAt, PickingItem.pickingList (+8 more)

### Community 128 - "Inventory schema"
Cohesion: 0.15
Nodes (16): PickingItem.pickingListId, PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.id, PickingList.listNumber, PickingList.organization, PickingList.pickedItems (+8 more)

### Community 129 - "Supply schema"
Cohesion: 0.13
Nodes (16): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.dueDate, SupplierPayment.id, SupplierPayment.notes, SupplierPayment.organization, SupplierPayment.paidAmount, SupplierPayment.paidDate (+8 more)

### Community 130 - "Community 130"
Cohesion: 0.24
Nodes (14): analyzeReconstructionTriggers(), changedFilesFromGit(), ghPrBody(), git(), isCrossLayerControlChange(), isHighRiskBoundary(), isLargeServiceOrComponent(), layerOf() (+6 more)

### Community 131 - "Community 131"
Cohesion: 0.28
Nodes (10): ChannelCatalogCollectionController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+2 more)

### Community 132 - "Finance schema"
Cohesion: 0.14
Nodes (15): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description (+7 more)

### Community 133 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 134 - "Sourcing schema"
Cohesion: 0.17
Nodes (15): NaverPopularKeywordDailySnapshot.boardKey, NaverPopularKeywordDailySnapshot.boardLabel, NaverPopularKeywordDailySnapshot.businessDate, NaverPopularKeywordDailySnapshot.capturedAt, NaverPopularKeywordDailySnapshot.cid, NaverPopularKeywordDailySnapshot.createdAt, NaverPopularKeywordDailySnapshot.id, NaverPopularKeywordDailySnapshot.keyword (+7 more)

### Community 135 - "Finance schema"
Cohesion: 0.14
Nodes (15): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.id, ProcessingCost.master, ProcessingCost.notes, ProcessingCost.organization, ProcessingCost.processType, ProcessingCost.productName (+7 more)

### Community 136 - "Finance schema"
Cohesion: 0.15
Nodes (15): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.organization, SalesPlan.period (+7 more)

### Community 137 - "Channels schema"
Cohesion: 0.16
Nodes (15): SellpiaSalesDailySnapshot.businessDate, SellpiaSalesDailySnapshot.capturedAt, SellpiaSalesDailySnapshot.channelGroup, SellpiaSalesDailySnapshot.costKrw, SellpiaSalesDailySnapshot.createdAt, SellpiaSalesDailySnapshot.id, SellpiaSalesDailySnapshot.organization, SellpiaSalesDailySnapshot.qty (+7 more)

### Community 138 - "Inventory schema"
Cohesion: 0.15
Nodes (15): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items, StockAudit.matchedCount (+7 more)

### Community 139 - "Community 139"
Cohesion: 0.18
Nodes (12): assertActiveCoupangAccount(), assertCanonicalAccount(), completeCollectionRun(), completedCollectionResult(), jsonRecord(), lockAccount(), lockCollectionRun(), nextPublicationSequence() (+4 more)

### Community 140 - "Advertising schema"
Cohesion: 0.15
Nodes (14): ExecutionTask.workerId, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentTaskRef, ExecutionWorker.currentUrl, ExecutionWorker.id, ExecutionWorker.label, ExecutionWorker.lastHeartbeatAt (+6 more)

### Community 141 - "Community 141"
Cohesion: 0.25
Nodes (14): assertPositiveIntegerText(), assertSharedDatabaseIdentity(), assertUuid(), buildChannelAccountFingerprint(), buildCoupangReplayBundle(), buildCoupangReplayScope(), computeReplayFactDigest(), databaseProjectRef() (+6 more)

### Community 142 - "Community 142"
Cohesion: 0.23
Nodes (11): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), main(), parseBaseline(), readFiles(), repoRoot(), walk() (+3 more)

### Community 143 - "Community 143"
Cohesion: 0.18
Nodes (7): ChannelSyncRepositoryAdapter, reconcileProductDetailOption(), Injectable, ProductListingSyncResult, formatKstIso(), normalizeCoupangOrderStatus(), normalizeCoupangProductStatus()

### Community 144 - "Supply schema"
Cohesion: 0.19
Nodes (13): Supply, RocketPurchaseConfirmationAllocation.confirmationLine, RocketPurchaseConfirmationAllocation.confirmationLineId, RocketPurchaseConfirmationAllocation.createdAt, RocketPurchaseConfirmationAllocation.id, RocketPurchaseConfirmationAllocation.organization, RocketPurchaseConfirmationAllocation.quantity, RocketPurchaseConfirmationAllocation.sellpiaInventorySku (+5 more)

### Community 145 - "Channels schema"
Cohesion: 0.19
Nodes (13): CoupangKeywordSerpDailySnapshot.businessDate, CoupangKeywordSerpDailySnapshot.capturedAt, CoupangKeywordSerpDailySnapshot.createdAt, CoupangKeywordSerpDailySnapshot.id, CoupangKeywordSerpDailySnapshot.itemCount, CoupangKeywordSerpDailySnapshot.items, CoupangKeywordSerpDailySnapshot.keyword, CoupangKeywordSerpDailySnapshot.organization (+5 more)

### Community 146 - "Core schema"
Cohesion: 0.17
Nodes (13): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+5 more)

### Community 147 - "Channels schema"
Cohesion: 0.18
Nodes (13): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson, RocketSupplyDailySnapshot.revenueKrw (+5 more)

### Community 148 - "Community 148"
Cohesion: 0.29
Nodes (13): asRecord(), assertNoPii(), buildReplayBody(), buildReplayKpis(), cloneReplayValue(), containsPiiValue(), copyString(), dateOnly() (+5 more)

### Community 149 - "Community 149"
Cohesion: 0.31
Nodes (11): analyzeSchemaArtifactSync(), changedFilesFromGit(), changedFilesFromWorkingTree(), GENERATED_ARTIFACT_PATHS, git(), main(), matchesAnyPath(), mergeChangedFiles() (+3 more)

### Community 150 - "Community 150"
Cohesion: 0.24
Nodes (8): ProductRegistrationSubmissionCapabilityInput, asRecord(), extractNestedSellerProductId(), isExplicitProviderRejection(), listingPayloadFromFrozenSubmission(), recordedMarketplaceResult(), sellerProductIdFromResponse(), stringField()

### Community 151 - "Community 151"
Cohesion: 0.18
Nodes (8): ChannelAccountController, Body, Controller, CurrentOrganization, Get, UpdateCoupangAccountSettingsSchema, Patch, Roles

### Community 152 - "Community 152"
Cohesion: 0.17
Nodes (6): ChannelRecipeSuggestionContextRepositoryAdapter, Injectable, SellpiaRecipeEvidencePort, ChannelRecipeSuggestionContext, ChannelRecipeSuggestionContextRepositoryPort, Inject

### Community 153 - "Sourcing schema"
Cohesion: 0.20
Nodes (12): Sourcing, TrendSeedKeyword.createdAt, TrendSeedKeyword.enabled, TrendSeedKeyword.id, TrendSeedKeyword.keyword, TrendSeedKeyword.keywordCn, TrendSeedKeyword.organization, TrendSeedKeyword.sources (+4 more)

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
Cohesion: 0.20
Nodes (6): buildCoupangWingSnapshotCoverage(), CoupangWingSnapshotCoverage, ChannelCatalogImportRepositoryPort, Inject, ParsedWingCatalogRow, ParsedWingCatalogSkippedRow

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

### Community 162 - "Community 162"
Cohesion: 0.18
Nodes (11): assertLocalRebuildGuard(), assertSharedRebuildGuard(), guardFromCli(), assertLocalDevelopmentDatabase(), bootstrapAuthoritativeInventoryDevelopment(), buildBootstrapPlan(), LOCAL_HOSTS, main() (+3 more)

### Community 163 - "Community 163"
Cohesion: 0.35
Nodes (9): analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), directOutPortFiles(), FORBIDDEN_IN_PORT_FOLDER_NAMES, forbiddenInPortCallerFolders(), listDirectories(), listFiles(), main() (+1 more)

### Community 164 - "Community 164"
Cohesion: 0.31
Nodes (9): addUnique(), defaultOutputDir, defaultSourceDir, normalizeKiditemOrigin(), patchExtensionRuntimeFiles(), patchManifest(), prepareCoupangExtension(), repoRoot (+1 more)

### Community 165 - "Community 165"
Cohesion: 0.20
Nodes (5): RocketPoCatalogRepositoryAdapter, Injectable, RocketPoCatalogIdentity, RocketPoCatalogRepositoryPort, Inject

### Community 166 - "Community 166"
Cohesion: 0.22
Nodes (4): PARENT_COLUMN_INDEXES, REQUIRED_HEADERS, workbookBuffer(), WorkbookOptions

### Community 167 - "System schema"
Cohesion: 0.24
Nodes (10): System, SystemSetting.createdAt, SystemSetting.id, SystemSetting.key, SystemSetting.organization, SystemSetting.updatedAt, SystemSetting.value, SystemSetting (+2 more)

### Community 168 - "Advertising schema"
Cohesion: 0.22
Nodes (10): ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task, ExecutionLog.taskId (+2 more)

### Community 169 - "Sourcing schema"
Cohesion: 0.27
Nodes (10): SourcingWorkspaceSnapshot.businessDate, SourcingWorkspaceSnapshot.createdAt, SourcingWorkspaceSnapshot.id, SourcingWorkspaceSnapshot.organization, SourcingWorkspaceSnapshot.payload, SourcingWorkspaceSnapshot.scope, SourcingWorkspaceSnapshot.updatedAt, SourcingWorkspaceSnapshot (+2 more)

### Community 170 - "Community 170"
Cohesion: 0.49
Nodes (6): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), scrubDeep(), scrubSecrets(), walk()

### Community 171 - "Community 171"
Cohesion: 0.25
Nodes (6): ChannelAccountListController, Controller, CurrentOrganization, Get, ChannelAccountQueryService, Injectable

### Community 172 - "Community 172"
Cohesion: 0.25
Nodes (5): ChannelsOperationAlertAdapter, Inject, Injectable, OperationLifecyclePatch, StartOperationAlertInput

### Community 173 - "Community 173"
Cohesion: 0.22
Nodes (8): upsertChannelCatalogIdentities(), flattenMedia(), upsertCoupangCatalogRows(), nextPublicationSequence(), productsFromRows(), resolveIdentities(), toCompletedRun(), zeroChanges()

### Community 174 - "Community 174"
Cohesion: 0.22
Nodes (5): ChannelCatalogPublicationRepositoryAdapter, Inject, Injectable, CatalogMediaPublicationPort, ChannelCatalogPublicationPort

### Community 175 - "Community 175"
Cohesion: 0.22
Nodes (7): ReadinessCheck, ReadinessCheckSchema, ReadinessCheckStatusSchema, ReadinessResponse, ReadinessResponseSchema, RebuildReadinessResponse, RebuildReadinessResponseSchema

### Community 176 - "Community 176"
Cohesion: 0.47
Nodes (7): checkClaudeShims(), checkTrackedClaudeDirectory(), findStaleInstructionLines(), git(), listTracked(), main(), runChecks()

### Community 177 - "Community 177"
Cohesion: 0.36
Nodes (8): applyProductLinksInBatches(), applyVariantLinksInBatches(), buildCatalogProductProvisioningListings(), publishCatalogOperationalProducts(), unique(), validateProvisionedLinks(), listing(), prisma

### Community 178 - "Community 178"
Cohesion: 0.39
Nodes (6): aiProductSuggestion(), aiVariantSuggestion(), asRecord(), distinctStrings(), firstString(), nullableScore()

### Community 180 - "Community 180"
Cohesion: 0.25
Nodes (6): AgentCatalogItem, ConfigurableParam, ConfigurableParamSchema, MarketplaceCatalogItem, MarketplaceCatalogItemSchema, WorkflowCatalogItem

### Community 181 - "Community 181"
Cohesion: 0.25
Nodes (6): WorkflowRun, WorkflowRunSchema, WorkflowStepRun, WorkflowStepRunSchema, WorkflowTemplate, WorkflowTemplateSchema

### Community 182 - "Community 182"
Cohesion: 0.46
Nodes (6): analyzeInventory(), listTopLevelScriptFiles(), main(), repoRoot(), SCRIPT_INVENTORY, SUPPORT_FILES

### Community 183 - "Community 183"
Cohesion: 0.29
Nodes (6): CurrentOrganization, CurrentUser, Param, Post, UploadedFile, UseInterceptors

### Community 184 - "Community 184"
Cohesion: 0.29
Nodes (5): AuthRequiredErrorBody, AuthUserPublic, AuthUserPublicSchema, LoginRequest, LoginRequestSchema

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
Cohesion: 0.50
Nodes (4): fileHash(), importInput(), makeRow(), representativeRows()

### Community 194 - "Community 194"
Cohesion: 0.50
Nodes (4): is_allowlisted(), is_comment_line(), load_file_lines(), check-tenant-scope.sh script

### Community 195 - "Community 195"
Cohesion: 1.00
Nodes (3): makeRepository(), runRecord(), runWithChunks()

### Community 197 - "Community 197"
Cohesion: 0.67
Nodes (3): extractEnvKeys(), readModelFile(), redactEnvValues()

## Knowledge Gaps
- **2390 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+2385 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Core schema` to `prisma field: prisma — Shared Schema`, `AgentOS schema`, `Community 2`, `prisma field: externalOptionId canonical option identity`, `Core schema`, `Core schema`, `Core schema`, `Community 9`, `System schema`, `Channels schema`, `AgentOS schema`, `Community 17`, `Community 18`, `AI schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `Sourcing schema`, `AI schema`, `AI schema`, `AI schema`, `Sourcing schema`, `AI schema`, `Orders schema`, `Core schema`, `Orders schema`, `Channels schema`, `Core schema`, `AI schema`, `Orders schema`, `Community 48`, `Community 49`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `Supply schema`, `Channels schema`, `AI schema`, `AI schema`, `Inventory schema`, `AgentOS schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `AgentOS schema`, `Supply schema`, `Channels schema`, `Finance schema`, `Channels schema`, `Advertising schema`, `Supply schema`, `Channels schema`, `Channels schema`, `AgentOS schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Orders schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `Finance schema`, `Supply schema`, `Channels schema`, `Sourcing schema`, `AgentOS schema`, `Channels schema`, `Supply schema`, `Inventory schema`, `AgentOS schema`, `AI schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `AI schema`, `Inventory schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Finance schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Channels schema`, `Inventory schema`, `Advertising schema`, `Supply schema`, `Channels schema`, `Core schema`, `Channels schema`, `Sourcing schema`, `Advertising schema`, `System schema`, `System schema`, `Supply schema`, `System schema`, `Sourcing schema`?**
  _High betweenness centrality (0.242) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `AgentOS schema` to `prisma field: prisma — Shared Schema`, `prisma field: externalOptionId canonical option identity`, `Core schema`, `Core schema`, `Core schema`, `System schema`, `Core schema`, `Channels schema`, `AgentOS schema`, `AI schema`, `System schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `Sourcing schema`, `AI schema`, `AI schema`, `AI schema`, `Sourcing schema`, `AI schema`, `Orders schema`, `Core schema`, `Orders schema`, `Channels schema`, `Core schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `Supply schema`, `Channels schema`, `AI schema`, `AI schema`, `Inventory schema`, `AgentOS schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `AgentOS schema`, `Supply schema`, `Channels schema`, `Finance schema`, `Channels schema`, `Advertising schema`, `Supply schema`, `Channels schema`, `Channels schema`, `AgentOS schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Orders schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `Finance schema`, `Supply schema`, `Channels schema`, `Sourcing schema`, `AgentOS schema`, `Channels schema`, `Supply schema`, `Inventory schema`, `AgentOS schema`, `AI schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `AI schema`, `Inventory schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Advertising schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Finance schema`, `System schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Channels schema`, `Inventory schema`, `Advertising schema`, `Supply schema`, `Channels schema`, `Core schema`, `Channels schema`, `Sourcing schema`, `System schema`, `Advertising schema`, `System schema`, `System schema`, `Supply schema`, `System schema`, `Advertising schema`, `Sourcing schema`?**
  _High betweenness centrality (0.190) - this node is a cross-community bridge._
- **Why does `Order` connect `Orders schema` to `prisma field: prisma — Shared Schema`, `AgentOS schema`, `Community 2`, `prisma field: externalOptionId canonical option identity`, `Core schema`, `Core schema`, `Core schema`, `System schema`, `Core schema`, `Community 12`, `Community 13`, `Community 142`, `Community 143`, `Community 17`, `Community 149`, `System schema`, `Community 24`, `Orders schema`, `Advertising schema`, `Community 163`, `Community 166`, `Orders schema`, `Orders schema`, `Community 48`, `Community 49`, `AI schema`, `Inventory schema`, `Community 62`, `Finance schema`, `Community 74`, `Community 76`, `Community 83`, `Orders schema`, `Community 103`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Are the 152 inferred relationships involving `Organization` (e.g. with `channel-account.controller.ts` and `channel-account-list.controller.ts`) actually correct?**
  _`Organization` has 152 INFERRED edges - model-reasoned connections that need verification._
- **Are the 82 inferred relationships involving `ChannelListing` (e.g. with `channel-registration-capability.adapter.ts` and `channel-listing.controller.ts`) actually correct?**
  _`ChannelListing` has 82 INFERRED edges - model-reasoned connections that need verification._
- **Are the 111 inferred relationships involving `ChannelAccount` (e.g. with `channel-account.controller.ts` and `channel-account-list.controller.ts`) actually correct?**
  _`ChannelAccount` has 111 INFERRED edges - model-reasoned connections that need verification._
- **Are the 107 inferred relationships involving `Order` (e.g. with `channel-sync.controller.ts` and `index.ts`) actually correct?**
  _`Order` has 107 INFERRED edges - model-reasoned connections that need verification._