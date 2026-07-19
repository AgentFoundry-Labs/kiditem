# Graph Report - schema-consumers  (2026-07-19)

## Corpus Check
- 383 files · ~188,289 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5778 nodes · 31095 edges · 274 communities (257 shown, 17 thin omitted)
- Extraction: 33% EXTRACTED · 67% INFERRED · 0% AMBIGUOUS · INFERRED: 20952 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- prisma field: prisma — Shared Schema
- prisma field: AgentToolDefinition.isActive
- Community 2
- Core schema
- prisma field: channels — Marketplace Sync + SKU Matching
- prisma field: AdAction.externalId
- Community 6
- Community 7
- Orders schema
- Community 9
- Core schema
- Community 11
- Core schema
- Community 13
- Channels schema
- Community 15
- Community 16
- AI schema
- Community 18
- Community 19
- AI schema
- Community 21
- AgentOS schema
- Orders schema
- Community 24
- AgentOS schema
- Sourcing schema
- prisma field: externalOptionId canonical option identity
- Inventory schema
- AI schema
- Community 30
- Community 31
- Core schema
- Sourcing schema
- AI schema
- Community 35
- Community 36
- AI schema
- Core schema
- AI schema
- Community 40
- Channels schema
- AI schema
- Channels schema
- Community 44
- Community 45
- Community 46
- AgentOS schema
- AgentOS schema
- AI schema
- Core schema
- Community 51
- Channels schema
- Channels schema
- Community 54
- System schema
- Community 56
- AgentOS schema
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- AgentOS schema
- Channels schema
- Inventory schema
- Community 66
- AgentOS schema
- Advertising schema
- Supply schema
- Community 70
- System schema
- Community 72
- Channels schema
- AI schema
- Community 75
- Community 76
- Community 77
- Community 78
- AgentOS schema
- Channels schema
- Community 81
- System schema
- Advertising schema
- AgentOS schema
- Orders schema
- Supply schema
- Sourcing schema
- Channels schema
- Community 89
- Community 90
- Community 91
- AgentOS schema
- AI schema
- System schema
- Channels schema
- Sourcing schema
- Orders schema
- Sourcing schema
- AI schema
- Community 100
- AgentOS schema
- AgentOS schema
- Finance schema
- Supply schema
- Supply schema
- Channels schema
- Sourcing schema
- Community 108
- Community 109
- Supply schema
- Inventory schema
- Community 112
- Community 113
- Community 114
- Community 115
- Community 116
- AgentOS schema
- AI schema
- Sourcing schema
- Sourcing schema
- Channels schema
- Channels schema
- AI schema
- Community 124
- Community 125
- Community 126
- Community 127
- Community 128
- prisma field: ActionTask.targetId
- Inventory schema
- Community 131
- Community 132
- Community 133
- AgentOS schema
- Channels schema
- Inventory schema
- Inventory schema
- Inventory schema
- Inventory schema
- Inventory schema
- Supply schema
- Supply schema
- Orders schema
- Community 144
- Community 145
- Community 146
- Orders schema
- System schema
- Sourcing schema
- Finance schema
- Finance schema
- Channels schema
- Inventory schema
- Community 154
- Community 155
- Community 156
- Inventory schema
- Finance schema
- Advertising schema
- Finance schema
- Community 161
- Community 162
- Community 163
- Community 164
- Community 165
- Supply schema
- Channels schema
- Core schema
- Channels schema
- Community 170
- Community 171
- Community 172
- Community 173
- Community 174
- Channels schema
- System schema
- Community 177
- Community 178
- Community 179
- Community 180
- Community 181
- Advertising schema
- System schema
- System schema
- Supply schema
- Community 186
- Community 187
- Community 188
- Community 189
- Community 190
- System schema
- Community 192
- Community 193
- Community 194
- Community 195
- Community 196
- Community 197
- Channels schema
- Community 199
- Community 200
- Community 201
- Community 202
- Community 203
- Community 204
- Community 205
- Community 206
- Community 207
- Community 208
- Community 209
- Community 210
- Community 211
- Community 212
- Community 213
- Community 214
- Community 215
- Community 216
- Community 217
- Community 218
- Community 219
- Community 220
- Community 221
- Community 222
- Community 223
- Community 224
- Community 225
- Community 226
- Community 227
- Community 228
- Community 229

## God Nodes (most connected - your core abstractions)
1. `Organization` - 415 edges
2. `Database ERD` - 358 edges
3. `ChannelAccount` - 178 edges
4. `ChannelListing` - 175 edges
5. `Order` - 170 edges
6. `prisma — Shared Schema` - 162 edges
7. `ContentWorkspace.organizationId` - 156 edges
8. `ProductPreparation.organizationId` - 156 edges
9. `ChannelListing.organizationId` - 152 edges
10. `SourceImportRun.organizationId` - 151 edges
11. `ContentWorkspaceThumbnailSelection.organizationId` - 150 edges
12. `ChannelAdTargetDailySnapshot.organizationId` - 150 edges

## Surprising Connections (you probably didn't know these)
- `packages/shared — @kiditem/shared` --mentions_domain--> `AI`  [EXTRACTED]
  packages/shared/AGENTS.md → prisma/models/ai.prisma
- `distinctStrings()` --indirect_call--> `value()`  [INFERRED]
  apps/server/src/channels/adapter/out/repository/channel-product-matching.repository.adapter.ts → scripts/_shared/cli-args.ts
- `rankChannelProductCandidates()` --indirect_call--> `value()`  [INFERRED]
  apps/server/src/channels/domain/channel-product-candidate-ranking.ts → scripts/_shared/cli-args.ts
- `productSearchText()` --indirect_call--> `value()`  [INFERRED]
  apps/server/src/channels/domain/channel-product-candidate-ranking.ts → scripts/_shared/cli-args.ts
- `walk()` --indirect_call--> `item()`  [INFERRED]
  packages/shared/src/security/scrub.ts → apps/server/src/channels/domain/channel-recipe-automation-product-group.spec.ts
- `appendValues()` --indirect_call--> `item()`  [INFERRED]
  scripts/dev-data.ts → apps/server/src/channels/domain/channel-recipe-automation-product-group.spec.ts
- `sanitizeValue()` --indirect_call--> `item()`  [INFERRED]
  scripts/dev-data-coupang.ts → apps/server/src/channels/domain/channel-recipe-automation-product-group.spec.ts
- `prepareOptions()` --indirect_call--> `source()`  [INFERRED]
  apps/server/src/channels/domain/channel-recipe-name-matcher.ts → scripts/__tests__/guarded-authoritative-rebuild-workflow.test.mjs

## Import Cycles
- None detected.

## Communities (274 total, 17 thin omitted)

### Community 0 - "prisma field: prisma — Shared Schema"
Cohesion: 0.17
Nodes (220): UploadedWorkbookFile, HEADERS, USER, chunkSelect, ErrorInput, LockedRun, OwnedRunInput, PutChunkInput (+212 more)

### Community 1 - "prisma field: AgentToolDefinition.isActive"
Cohesion: 0.06
Nodes (73): ChannelCatalogPublicationRepositoryAdapter, Injectable, COMPLETED_CATALOG_SOURCE_TYPES, ListingRow, optionIdentity(), OptionRow, toOptionQueueRow(), TRANSACTION_OPTIONS (+65 more)

### Community 2 - "Community 2"
Cohesion: 0.02
Nodes (101): AgentApprovalRequestSummary, AgentApprovalRequestSummarySchema, AgentApprovalStatus, AgentApprovalStatusSchema, AgentArtifactHandoffSummary, AgentArtifactHandoffSummarySchema, AgentArtifactStatus, AgentArtifactStatusSchema (+93 more)

### Community 3 - "Core schema"
Cohesion: 0.03
Nodes (83): AVAILABILITY_STATUSES, ChannelRecipeAutomationProductTopology, classifyRecipeAutomationProductGroups(), groupDecision(), autoItem, configuredItem, reviewItem, ChannelListing.masterProductId (+75 more)

### Community 4 - "prisma field: channels — Marketplace Sync + SKU Matching"
Cohesion: 0.06
Nodes (75): ListingForProductSync, channels — Marketplace Sync + SKU Matching, Database ERD, Orders, AdAction.listingOptionId, AgentApprovalRequest.agentInstanceId, AgentArtifact.agentInstanceId, AgentAuthorizationEvent.agentInstanceId (+67 more)

### Community 5 - "prisma field: AdAction.externalId"
Cohesion: 0.11
Nodes (54): ListingRow, COUPANG_PROVIDER_PORT, CHANNEL_SYNC_REPOSITORY_PORT, ChannelAccountService, Injectable, accountIdFor(), seedOrderInline(), seedReturnInline() (+46 more)

### Community 6 - "Community 6"
Cohesion: 0.03
Nodes (74): AdMetricsDetail, AdMetricsDetailSchema, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary, DashboardAdSummarySchema (+66 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (69): option(), AdapterCommand, appendFlag(), appendOption(), appendProjectReferenceDefaults(), appendValues(), archiveFileName(), archiveShaFileName() (+61 more)

### Community 8 - "Orders schema"
Cohesion: 0.03
Nodes (65): OrderLineItem.createdAt, OrderLineItem.externalBarcode, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.metadata, OrderLineItem.optionName, OrderLineItem.order (+57 more)

### Community 9 - "Community 9"
Cohesion: 0.03
Nodes (63): CreateMasterProductInput, CreateMasterProductInputSchema, CreateProductVariantFieldsSchema, CreateProductVariantInput, CreateProductVariantInputSchema, MasterProductDisplayReference, MasterProductDisplayReferenceSchema, MasterProductMutationFieldsSchema (+55 more)

### Community 10 - "Core schema"
Cohesion: 0.05
Nodes (34): Organization.createdAt, Organization.id, Organization.name, Organization.slug, Organization.updatedAt, Organization, DATA_MIGRATION_RELEASES, DataMigration (+26 more)

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (61): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot, AdCampaignSnapshotSchema (+53 more)

### Community 12 - "Core schema"
Cohesion: 0.04
Nodes (59): Core, CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.keywords, CategoryMapping.organization (+51 more)

### Community 13 - "Community 13"
Cohesion: 0.06
Nodes (42): ChannelCatalogImportController, Controller, Inject, ChannelSkuAvailabilityController, Controller, ChannelListingRepositoryAdapter, Injectable, ChannelRecipeAutomationContextRepositoryAdapter (+34 more)

### Community 14 - "Channels schema"
Cohesion: 0.04
Nodes (55): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+47 more)

### Community 15 - "Community 15"
Cohesion: 0.07
Nodes (49): ActionTask, ActionTaskExecuteResponse, ActionTaskList, ActionTaskListSchema, ActionTaskRelatedProduct, ActionTaskRelatedProductSchema, ActionTaskSchema, ActionTaskSourceAlert (+41 more)

### Community 16 - "Community 16"
Cohesion: 0.09
Nodes (46): apiHeaders(), apiUrl(), Args, assertSafeDatasetId(), assertSupportedReplayPayloads(), BundleManifest, BundlePayload, BundleReference (+38 more)

### Community 17 - "AI schema"
Cohesion: 0.04
Nodes (46): ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.editedHtmlSavedAt, ContentGeneration.errorMessage (+38 more)

### Community 18 - "Community 18"
Cohesion: 0.10
Nodes (48): assertNonProductionTarget(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged(), assertSha256(), BaselineManifest, BaselineManifestExpectation, baselineObjectKeys, buildChecksumsFile() (+40 more)

### Community 19 - "Community 19"
Cohesion: 0.04
Nodes (47): deriveSellpiaInventoryFreshness(), FixedSellpiaAccountKeySchema, FixedSellpiaOriginSchema, IsoDateTimeStringSchema, SELLPIA_INVENTORY_FRESHNESS_STATUSES, SELLPIA_INVENTORY_REFRESH_REASONS, SellpiaFreshnessDerivationInput, SellpiaInventoryActiveSyncViewSchema (+39 more)

### Community 20 - "AI schema"
Cohesion: 0.05
Nodes (45): ContentGeneration.detailPageArtifactId, ContentWorkspace.currentDetailPageArtifactId, ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.contentWorkspaceId, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.createdByUserId (+37 more)

### Community 21 - "Community 21"
Cohesion: 0.09
Nodes (39): applyCacheControl(), ApplyResult, applyS3CacheControl(), applySupabaseCacheControl(), assertApplyAllowed(), buildCopyObjectInput(), CliArgs, CliConfig (+31 more)

### Community 22 - "AgentOS schema"
Cohesion: 0.05
Nodes (43): AgentRunRequest.agentInstance, AgentRunRequest.attempts, AgentRunRequest.claimedAt, AgentRunRequest.claimedBy, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.coalescedIntoRequestId, AgentRunRequest.conversation, AgentRunRequest.createdAt (+35 more)

### Community 23 - "Orders schema"
Cohesion: 0.05
Nodes (32): PARENT_COLUMN_INDEXES, REQUIRED_HEADERS, workbookBuffer(), WorkbookOptions, Order.channelAccount, Order.channelAccountId, Order.createdAt, Order.customerName (+24 more)

### Community 24 - "Community 24"
Cohesion: 0.05
Nodes (35): ChannelProductMatchingService, Injectable, ChannelMatchCandidateReason, ChannelMatchCandidateReasonSchema, ChannelMatchEvidence, ChannelMatchEvidenceSchema, ChannelMatchingAccount, ChannelMatchingAccountSchema (+27 more)

### Community 25 - "AgentOS schema"
Cohesion: 0.05
Nodes (42): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+34 more)

### Community 26 - "Sourcing schema"
Cohesion: 0.05
Nodes (41): CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id, CandidateImage.isPrimary (+33 more)

### Community 27 - "prisma field: externalOptionId canonical option identity"
Cohesion: 0.10
Nodes (30): assertExactProductGraph(), MarketplaceRegistrationRepositoryAdapter, Injectable, upsertExactOptionLinks(), asRecord(), KidItemFirstOptionLink, KidItemFirstRegistrationLinks, normalizedOptionId() (+22 more)

### Community 28 - "Inventory schema"
Cohesion: 0.06
Nodes (39): InventoryCommitment.businessKey, InventoryCommitment.createdAt, InventoryCommitment.createdBy, InventoryCommitment.creator, InventoryCommitment.id, InventoryCommitment.inventoryGeneration, InventoryCommitment.kind, InventoryCommitment.organization (+31 more)

### Community 29 - "AI schema"
Cohesion: 0.06
Nodes (40): ProductPreparation.selectedThumbnailGenerationId, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.contentWorkspaceId, ThumbnailGeneration.createdAt, ThumbnailGeneration.deletedAt, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.errorMessage (+32 more)

### Community 30 - "Community 30"
Cohesion: 0.05
Nodes (36): ChunkRequestBaseSchema, CoupangCatalogAttributeV1, CoupangCatalogAttributeV1Schema, CoupangCatalogBrowserCommand, CoupangCatalogBrowserCommandSchema, CoupangCatalogBrowserStatus, CoupangCatalogBrowserStatusSchema, CoupangCatalogChunkKind (+28 more)

### Community 31 - "Community 31"
Cohesion: 0.05
Nodes (36): boundedText(), isoDay, requiredText(), ROCKET_SHORTAGE_REASONS, RocketPoCatalogPublication, RocketPoCatalogPublicationSchema, RocketPoCatalogRow, RocketPoCatalogRowSchema (+28 more)

### Community 32 - "Core schema"
Cohesion: 0.06
Nodes (34): AgentApprovalRequest.approverUserId, AgentApprovalRequest.decidedByUserId, AgentApprovalRequest.requestedByUserId, AgentRunRequest.requestedByUserId, OrganizationMembership.createdAt, OrganizationMembership.id, OrganizationMembership.invitedBy, OrganizationMembership.invitedById (+26 more)

### Community 33 - "Sourcing schema"
Cohesion: 0.06
Nodes (34): ContentGeneration.sourceCandidateId, SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.id, SourcingCandidate.imageUrl (+26 more)

### Community 34 - "AI schema"
Cohesion: 0.06
Nodes (38): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+30 more)

### Community 35 - "Community 35"
Cohesion: 0.07
Nodes (26): aggregateMappingStatus(), contains(), firstPrice(), parseQueryDate(), positiveInteger(), toSummary(), lockChannelListingRow(), aiProductSuggestion() (+18 more)

### Community 36 - "Community 36"
Cohesion: 0.11
Nodes (35): DATA_MIGRATION_IDS, dataMigrations, DataMigrationContext, DataMigrationTarget, MigrationResult, appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertMutatingTarget() (+27 more)

### Community 37 - "AI schema"
Cohesion: 0.07
Nodes (36): AI, ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize (+28 more)

### Community 38 - "Core schema"
Cohesion: 0.07
Nodes (35): ChannelListing.lastImportRunId, ChannelListingOption.lastImportRunId, Order.sourceImportRunId, SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.createdAt, SourceImportRun.createdBy (+27 more)

### Community 39 - "AI schema"
Cohesion: 0.06
Nodes (36): ProductPreparation.channelAccount, ProductPreparation.channelAccountId, ProductPreparation.channelListing, ProductPreparation.channelListingId, ProductPreparation.createdAt, ProductPreparation.createdByUser, ProductPreparation.createdByUserId, ProductPreparation.deletedAt (+28 more)

### Community 40 - "Community 40"
Cohesion: 0.06
Nodes (28): ChannelAccountListItem, ChannelAccountListItemSchema, CoupangAccountSettings, CoupangAccountSettingsSchema, UpdateCoupangAccountSettings, ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow (+20 more)

### Community 41 - "Channels schema"
Cohesion: 0.07
Nodes (35): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel, ChannelAdTargetDailySnapshot.clicks (+27 more)

### Community 42 - "AI schema"
Cohesion: 0.07
Nodes (35): ContentWorkspaceThumbnailSelection.contentAsset, ContentWorkspaceThumbnailSelection.contentAssetId, ContentWorkspaceThumbnailSelection.contentWorkspace, ContentWorkspaceThumbnailSelection.contentWorkspaceId, ContentWorkspaceThumbnailSelection.createdAt, ContentWorkspaceThumbnailSelection.createdByUser, ContentWorkspaceThumbnailSelection.createdByUserId, ContentWorkspaceThumbnailSelection.id (+27 more)

### Community 43 - "Channels schema"
Cohesion: 0.07
Nodes (35): CoupangWingTrackedProduct.brandName, CoupangWingTrackedProduct.categoryHierarchy, CoupangWingTrackedProduct.createdAt, CoupangWingTrackedProduct.enabled, CoupangWingTrackedProduct.id, CoupangWingTrackedProduct.imagePath, CoupangWingTrackedProduct.itemId, CoupangWingTrackedProduct.lastCapturedAt (+27 more)

### Community 44 - "Community 44"
Cohesion: 0.06
Nodes (34): ACCOUNT_AD_DAILY_DIGEST_KEYS, AD_ROW_KEYS, AD_SUMMARY_KEYS, ADS_DAILY_ROW_KEYS, ADS_KPI_KEYS, assertExactCount(), assertProtectedSupabaseDestination(), assertReadyCounts() (+26 more)

### Community 45 - "Community 45"
Cohesion: 0.07
Nodes (31): DeliveryCompany, DeliveryCompanySchema, Order, OrderActionResponse, OrderActionResponseSchema, OrderLineItem, OrderLineItemSchema, OrderListItem (+23 more)

### Community 46 - "Community 46"
Cohesion: 0.10
Nodes (31): automaticReason(), automaticStatus(), BarcodeEvidence, bestSimilarityPerSku(), ChannelRecipeAutomationDecision, ChannelRecipeSuggestionEvidenceKind, ChannelRecipeSuggestionInput, ChannelRecipeSuggestionResponse (+23 more)

### Community 47 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+25 more)

### Community 48 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.startedAt, WorkflowRun.status (+25 more)

### Community 49 - "AI schema"
Cohesion: 0.08
Nodes (31): ContentGeneration.contentWorkspaceId, ContentWorkspace.channelListing, ContentWorkspace.channelListingId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.createdByUserId, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageRevision (+23 more)

### Community 50 - "Core schema"
Cohesion: 0.08
Nodes (32): ProductVariantComponent.confirmedAt, ProductVariantComponent.confirmedBy, ProductVariantComponent.createdAt, ProductVariantComponent.id, ProductVariantComponent.organization, ProductVariantComponent.productVariant, ProductVariantComponent.productVariantId, ProductVariantComponent.quantity (+24 more)

### Community 51 - "Community 51"
Cohesion: 0.08
Nodes (14): Inject, ChannelSkuAvailabilityPort, ChannelProductMatchingQuery, ChannelProductMatchingRepositoryPort, Inject, ChannelSkuAvailabilityService, matchesStatus(), toAvailabilityItem() (+6 more)

### Community 52 - "Channels schema"
Cohesion: 0.08
Nodes (31): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.channelAccount, ChannelScrapeRun.channelAccountId, ChannelScrapeRun.clientRunKey, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson (+23 more)

### Community 53 - "Channels schema"
Cohesion: 0.07
Nodes (31): RocketPoCatalogLine.businessDateBasis, RocketPoCatalogLine.center, RocketPoCatalogLine.createdAt, RocketPoCatalogLine.hasConfirmation, RocketPoCatalogLine.id, RocketPoCatalogLine.inboundType, RocketPoCatalogLine.orderQty, RocketPoCatalogLine.organization (+23 more)

### Community 54 - "Community 54"
Cohesion: 0.08
Nodes (18): nextPublicationSequence(), productsFromRows(), resolveIdentities(), RocketPoCatalogRepositoryAdapter, toCompletedRun(), Inject, Injectable, zeroChanges() (+10 more)

### Community 55 - "System schema"
Cohesion: 0.08
Nodes (26): Alert.actionTask, Alert.actorUser, Alert.actorUserId, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead (+18 more)

### Community 56 - "Community 56"
Cohesion: 0.08
Nodes (23): automationReason(), countDecision(), emptyScopedResult(), proposalVersion(), requiredSuggestion(), toPreviewItem(), context(), suggestion() (+15 more)

### Community 57 - "AgentOS schema"
Cohesion: 0.08
Nodes (28): AgentOS, AgentAuthorizationEvent.toolId, AgentInstanceToolPolicy.agentInstance, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentInstanceToolPolicy.dryRunMode, AgentInstanceToolPolicy.effect (+20 more)

### Community 58 - "Community 58"
Cohesion: 0.09
Nodes (22): adapterPaths, BROWSER_COLLECTION_ATTENTION_REASONS, BROWSER_COLLECTION_PRODUCERS, BROWSER_COLLECTION_STATES, BrowserCollectionAttentionReasonSchema, BrowserCollectionClassificationSchema, BrowserCollectionCommand, BrowserCollectionCommandSchema (+14 more)

### Community 59 - "Community 59"
Cohesion: 0.09
Nodes (24): SellpiaInventoryGenerationSchema, SellpiaInventoryQualityReportSchema, SellpiaInventoryRefreshReasonSchema, CompletedSourceArtifactRun, CoupangWingCatalogImportResponse, CoupangWingCatalogImportResponseSchema, ImportChanges, SellpiaInventoryImportOutcome (+16 more)

### Community 60 - "Community 60"
Cohesion: 0.14
Nodes (27): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+19 more)

### Community 61 - "Community 61"
Cohesion: 0.08
Nodes (23): CHANNEL_LISTING_SORTS, CHANNEL_LISTING_TABS, ChannelListingQueryDto, IsIn, IsOptional, IsString, IsUUID, MaxLength (+15 more)

### Community 62 - "Community 62"
Cohesion: 0.15
Nodes (26): cellText(), collectParentMetadataConflicts(), decodeWorksheetRange(), expandMergedParentCells(), findHeaderRow(), formattedCellText(), hasCellValue(), headersForRow() (+18 more)

### Community 63 - "AgentOS schema"
Cohesion: 0.08
Nodes (27): AgentToolInvocation.agentInstance, AgentToolInvocation.approvalRequest, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt, AgentToolInvocation.errorCode, AgentToolInvocation.errorMessage (+19 more)

### Community 64 - "Channels schema"
Cohesion: 0.08
Nodes (27): CoupangWingSalesRankDailySnapshot.businessDate, CoupangWingSalesRankDailySnapshot.capturedAt, CoupangWingSalesRankDailySnapshot.categoryHierarchy, CoupangWingSalesRankDailySnapshot.collectedCount, CoupangWingSalesRankDailySnapshot.conversionRate28d, CoupangWingSalesRankDailySnapshot.createdAt, CoupangWingSalesRankDailySnapshot.id, CoupangWingSalesRankDailySnapshot.itemId (+19 more)

### Community 65 - "Inventory schema"
Cohesion: 0.07
Nodes (27): SellpiaInventoryState.activeGeneration, SellpiaInventoryState.activeSyncLeaseExpiresAt, SellpiaInventoryState.activeSyncOwner, SellpiaInventoryState.activeSyncOwnerUserId, SellpiaInventoryState.activeSyncStartedAt, SellpiaInventoryState.activeSyncToken, SellpiaInventoryState.createdAt, SellpiaInventoryState.failedGeneration (+19 more)

### Community 66 - "Community 66"
Cohesion: 0.07
Nodes (25): InventoryAvailabilityBatch, InventoryAvailabilityBatchSchema, InventoryCommitmentActorSchema, InventoryCommitmentAllocationRead, InventoryCommitmentAllocationReadSchema, InventoryCommitmentKind, InventoryCommitmentKindSchema, InventoryCommitmentRead (+17 more)

### Community 67 - "AgentOS schema"
Cohesion: 0.08
Nodes (26): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.approver, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy, AgentApprovalRequest.decisionReason, AgentApprovalRequest.expiresAt (+18 more)

### Community 68 - "Advertising schema"
Cohesion: 0.09
Nodes (26): ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task, ExecutionLog.taskId (+18 more)

### Community 69 - "Supply schema"
Cohesion: 0.08
Nodes (26): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+18 more)

### Community 70 - "Community 70"
Cohesion: 0.13
Nodes (14): ChannelRegistrationCapabilityAdapter, Injectable, ChannelsMarketplaceRegistrationCapabilityPort, ProductRegistrationSubmissionCapabilityInput, ResolveProductRegistrationCapabilityInput, asRecord(), extractNestedSellerProductId(), isExplicitProviderRejection() (+6 more)

### Community 71 - "System schema"
Cohesion: 0.08
Nodes (22): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon, Marketplace.id (+14 more)

### Community 72 - "Community 72"
Cohesion: 0.10
Nodes (12): SellpiaRecipeEvidenceAdapter, toEvidenceSku(), Inject, Injectable, ChannelRecipeSuggestionContextRepositoryAdapter, recipeSource(), Injectable, SellpiaRecipeEvidencePort (+4 more)

### Community 73 - "Channels schema"
Cohesion: 0.09
Nodes (25): ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isOfferWinner, ChannelListingOptionDailySnapshot.lastObservedAt, ChannelListingOptionDailySnapshot.listing (+17 more)

### Community 74 - "AI schema"
Cohesion: 0.08
Nodes (22): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt (+14 more)

### Community 75 - "Community 75"
Cohesion: 0.08
Nodes (23): ChannelSkuMappingComponent, ChannelSkuMappingComponentSchema, ChannelSkuMappingCounts, ChannelSkuMappingCountsSchema, ChannelSkuMappingListItem, ChannelSkuMappingListItemSchema, ChannelSkuMappingListResponse, ChannelSkuMappingListResponseSchema (+15 more)

### Community 76 - "Community 76"
Cohesion: 0.08
Nodes (22): StatisticsCategoryRow, StatisticsCategoryRowSchema, StatisticsDeliveryDaily, StatisticsDeliveryDailySchema, StatisticsDeliveryResponse, StatisticsDeliveryResponseSchema, StatisticsGradeRow, StatisticsGradeRowSchema (+14 more)

### Community 77 - "Community 77"
Cohesion: 0.18
Nodes (15): ChannelProductMatchingController, Body, Controller, CurrentOrganization, Get, Param, Post, Put (+7 more)

### Community 78 - "Community 78"
Cohesion: 0.17
Nodes (21): evidenceForCode(), bigrams(), ChannelRecipeNameEvidence, ChannelRecipeNameIndex, ChannelRecipeNameOption, ChannelRecipeNameSku, compareEvidence(), createChannelRecipeNameIndex() (+13 more)

### Community 79 - "AgentOS schema"
Cohesion: 0.09
Nodes (24): AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy, AgentAuthorizationEvent.decidedByUserId, AgentAuthorizationEvent.decision (+16 more)

### Community 80 - "Channels schema"
Cohesion: 0.09
Nodes (23): ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.id, ChannelScrapeSnapshot.listing, ChannelScrapeSnapshot.listingOption (+15 more)

### Community 81 - "Community 81"
Cohesion: 0.20
Nodes (8): ChannelDashboardController, Controller, CurrentOrganization, Get, Query, CoupangDateRangeQueryDto, ChannelDashboardService, Injectable

### Community 82 - "System schema"
Cohesion: 0.10
Nodes (23): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.href (+15 more)

### Community 83 - "Advertising schema"
Cohesion: 0.09
Nodes (23): AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+15 more)

### Community 84 - "AgentOS schema"
Cohesion: 0.09
Nodes (23): AgentInstance.adapterConfig, AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.icon, AgentInstance.id, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name (+15 more)

### Community 85 - "Orders schema"
Cohesion: 0.10
Nodes (23): OrderReturn.channelAccount, OrderReturn.channelAccountId, OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.id (+15 more)

### Community 86 - "Supply schema"
Cohesion: 0.10
Nodes (23): RocketPurchaseConfirmation.channelAccount, RocketPurchaseConfirmation.channelAccountId, RocketPurchaseConfirmation.confirmedAt, RocketPurchaseConfirmation.confirmedBy, RocketPurchaseConfirmation.confirmer, RocketPurchaseConfirmation.createdAt, RocketPurchaseConfirmation.freshnessGeneration, RocketPurchaseConfirmation.id (+15 more)

### Community 87 - "Sourcing schema"
Cohesion: 0.11
Nodes (22): Sourcing, SourcingWorkspaceSnapshot.businessDate, SourcingWorkspaceSnapshot.createdAt, SourcingWorkspaceSnapshot.id, SourcingWorkspaceSnapshot.organization, SourcingWorkspaceSnapshot.payload, SourcingWorkspaceSnapshot.scope, SourcingWorkspaceSnapshot.updatedAt (+14 more)

### Community 88 - "Channels schema"
Cohesion: 0.11
Nodes (22): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.channelAccount, ChannelAccountDailyKpiSnapshot.channelAccountId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+14 more)

### Community 89 - "Community 89"
Cohesion: 0.20
Nodes (14): CoupangCredentials, coupangRequest(), CoupangRequestOptions, generateAuthorization(), approveReturn(), confirmOrderSheets(), DELIVERY_COMPANIES, getOrderSheets() (+6 more)

### Community 90 - "Community 90"
Cohesion: 0.15
Nodes (15): envelopeToJson(), maskAccessKey(), readCredentialsConfig(), stripLegacyCredentialKeys(), toJsonRecord(), toRecord(), trimToOptional(), CoupangCredentials (+7 more)

### Community 91 - "Community 91"
Cohesion: 0.13
Nodes (21): assembleCompleteSnapshot(), assertSameManifest(), buildCollectionStatus(), countMedia(), countOptions(), derivePhase(), firstDate(), hashCatalogChunkPayload() (+13 more)

### Community 92 - "AgentOS schema"
Cohesion: 0.10
Nodes (21): AgentArtifact.agentInstance, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization, AgentArtifact.request (+13 more)

### Community 93 - "AI schema"
Cohesion: 0.11
Nodes (21): AiDirectJob.attempts, AiDirectJob.claimedAt, AiDirectJob.claimedBy, AiDirectJob.createdAt, AiDirectJob.finishedAt, AiDirectJob.id, AiDirectJob.jobType, AiDirectJob.lastErrorCode (+13 more)

### Community 94 - "System schema"
Cohesion: 0.10
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+13 more)

### Community 95 - "Channels schema"
Cohesion: 0.11
Nodes (21): CoupangKeywordRankDailySnapshot.adRank, CoupangKeywordRankDailySnapshot.businessDate, CoupangKeywordRankDailySnapshot.capturedAt, CoupangKeywordRankDailySnapshot.createdAt, CoupangKeywordRankDailySnapshot.id, CoupangKeywordRankDailySnapshot.itemId, CoupangKeywordRankDailySnapshot.keyword, CoupangKeywordRankDailySnapshot.organicRank (+13 more)

### Community 96 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): LiveCommerceBroadcastDailySnapshot.broadcasterId, LiveCommerceBroadcastDailySnapshot.broadcasterName, LiveCommerceBroadcastDailySnapshot.broadcastId, LiveCommerceBroadcastDailySnapshot.businessDate, LiveCommerceBroadcastDailySnapshot.capturedAt, LiveCommerceBroadcastDailySnapshot.coverImageUrl, LiveCommerceBroadcastDailySnapshot.createdAt, LiveCommerceBroadcastDailySnapshot.endedAt (+13 more)

### Community 97 - "Orders schema"
Cohesion: 0.10
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 98 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): ShortsTrendDailySnapshot.businessDate, ShortsTrendDailySnapshot.capturedAt, ShortsTrendDailySnapshot.channelName, ShortsTrendDailySnapshot.commentCount, ShortsTrendDailySnapshot.createdAt, ShortsTrendDailySnapshot.id, ShortsTrendDailySnapshot.keyword, ShortsTrendDailySnapshot.likeCount (+13 more)

### Community 99 - "AI schema"
Cohesion: 0.10
Nodes (21): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.contentWorkspace, ThumbnailAnalysis.contentWorkspaceId, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id (+13 more)

### Community 100 - "Community 100"
Cohesion: 0.10
Nodes (18): SupplierHistoryItem, SupplierHistoryItemSchema, SupplierHistoryReport, SupplierHistoryReportSchema, SupplierHistorySummary, SupplierHistorySummarySchema, SupplierProductSalesReport, SupplierProductSalesReportSchema (+10 more)

### Community 101 - "AgentOS schema"
Cohesion: 0.11
Nodes (20): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id, AgentCostEvent.inputTokens (+12 more)

### Community 102 - "AgentOS schema"
Cohesion: 0.12
Nodes (20): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.agentInstanceId, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError (+12 more)

### Community 103 - "Finance schema"
Cohesion: 0.12
Nodes (20): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit (+12 more)

### Community 104 - "Supply schema"
Cohesion: 0.12
Nodes (18): PurchaseOrder.supplierId, Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.id, Supplier.leadTimeDays, Supplier.name (+10 more)

### Community 105 - "Supply schema"
Cohesion: 0.12
Nodes (20): RocketPurchaseConfirmationLine.channelListingOption, RocketPurchaseConfirmationLine.channelListingOptionId, RocketPurchaseConfirmationLine.confirmation, RocketPurchaseConfirmationLine.confirmationId, RocketPurchaseConfirmationLine.confirmedQuantity, RocketPurchaseConfirmationLine.createdAt, RocketPurchaseConfirmationLine.id, RocketPurchaseConfirmationLine.orderQuantity (+12 more)

### Community 106 - "Channels schema"
Cohesion: 0.12
Nodes (20): SellpiaProductMonthlySales.buyPrice, SellpiaProductMonthlySales.capturedAt, SellpiaProductMonthlySales.createdAt, SellpiaProductMonthlySales.id, SellpiaProductMonthlySales.inAmount, SellpiaProductMonthlySales.inQty, SellpiaProductMonthlySales.optionCode, SellpiaProductMonthlySales.optionName (+12 more)

### Community 107 - "Sourcing schema"
Cohesion: 0.12
Nodes (20): Sourcing1688HotProductDailySnapshot.businessDate, Sourcing1688HotProductDailySnapshot.capturedAt, Sourcing1688HotProductDailySnapshot.createdAt, Sourcing1688HotProductDailySnapshot.id, Sourcing1688HotProductDailySnapshot.imageUrl, Sourcing1688HotProductDailySnapshot.monthlySales, Sourcing1688HotProductDailySnapshot.offerId, Sourcing1688HotProductDailySnapshot.organization (+12 more)

### Community 108 - "Community 108"
Cohesion: 0.11
Nodes (17): PANEL_RUN_SOURCES, PanelRunSource, PanelRunSourceSchema, sourceKeys, PANEL_ITEM_KINDS, PanelAlertItem, PanelDismissEventSchema, PanelEvent (+9 more)

### Community 109 - "Community 109"
Cohesion: 0.11
Nodes (4): CoupangProviderPort, ChannelSyncRepositoryPort, OrderSyncDeps, ProductSyncDeps

### Community 110 - "Supply schema"
Cohesion: 0.12
Nodes (19): PurchaseOrderSubmissionAttempt.createdAt, PurchaseOrderSubmissionAttempt.errorCode, PurchaseOrderSubmissionAttempt.errorMessage, PurchaseOrderSubmissionAttempt.freshnessGeneration, PurchaseOrderSubmissionAttempt.id, PurchaseOrderSubmissionAttempt.idempotencyKey, PurchaseOrderSubmissionAttempt.organization, PurchaseOrderSubmissionAttempt.providerReference (+11 more)

### Community 111 - "Inventory schema"
Cohesion: 0.12
Nodes (19): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.notes, ReturnTransfer.optionName, ReturnTransfer.organization (+11 more)

### Community 112 - "Community 112"
Cohesion: 0.11
Nodes (17): ChannelSkuAvailabilityComponent, ChannelSkuAvailabilityComponentSchema, ChannelSkuAvailabilityItem, ChannelSkuAvailabilityItemSchema, ChannelSkuAvailabilityListResponse, ChannelSkuAvailabilityListResponseSchema, ChannelSkuAvailabilityMappingStatusSchema, ChannelSkuAvailabilityQuery (+9 more)

### Community 113 - "Community 113"
Cohesion: 0.15
Nodes (14): PRODUCT_LIFECYCLE_STATES, ProductLifecycleState, ProductLifecycleStateSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, MasterImageItem, MasterImageItemSchema, MasterImageRole (+6 more)

### Community 114 - "Community 114"
Cohesion: 0.22
Nodes (17): analyzePrReleaseContract(), changedFilesFromGit(), classifyFiles(), compareSemver(), ghPrBody(), git(), hasReleaseDecision(), isDevelopToMainPromotion() (+9 more)

### Community 115 - "Community 115"
Cohesion: 0.18
Nodes (10): assertCanonicalCoupangAccountIdentity(), canonicalParentRows(), ChannelCatalogImportRepositoryAdapter, importResponse(), isUniqueConstraintError(), nextPublicationSequence(), Injectable, zeroChanges() (+2 more)

### Community 116 - "Community 116"
Cohesion: 0.11
Nodes (4): ChannelDashboardRepositoryAdapter, Injectable, ChannelDashboardRepositoryPort, Inject

### Community 117 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.id, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.lastRunId (+10 more)

### Community 118 - "AI schema"
Cohesion: 0.12
Nodes (18): ContentAsset.originGenerationGroupId, ContentGeneration.generationGroupId, ContentGenerationGroup.baseContentGeneration, ContentGenerationGroup.baseContentGenerationId, ContentGenerationGroup.contentWorkspace, ContentGenerationGroup.contentWorkspaceId, ContentGenerationGroup.createdAt, ContentGenerationGroup.createdByUserId (+10 more)

### Community 119 - "Sourcing schema"
Cohesion: 0.14
Nodes (18): LiveCommerceProductDailySnapshot.broadcastId, LiveCommerceProductDailySnapshot.businessDate, LiveCommerceProductDailySnapshot.capturedAt, LiveCommerceProductDailySnapshot.createdAt, LiveCommerceProductDailySnapshot.id, LiveCommerceProductDailySnapshot.imageUrl, LiveCommerceProductDailySnapshot.organization, LiveCommerceProductDailySnapshot.priceCny (+10 more)

### Community 120 - "Sourcing schema"
Cohesion: 0.13
Nodes (18): NaverKeywordDailySnapshot.averageAdRank, NaverKeywordDailySnapshot.businessDate, NaverKeywordDailySnapshot.capturedAt, NaverKeywordDailySnapshot.competitionIndex, NaverKeywordDailySnapshot.createdAt, NaverKeywordDailySnapshot.id, NaverKeywordDailySnapshot.keyword, NaverKeywordDailySnapshot.monthlyMobileSearchCount (+10 more)

### Community 121 - "Channels schema"
Cohesion: 0.14
Nodes (18): RocketPoCatalogSnapshot.channelAccount, RocketPoCatalogSnapshot.channelAccountId, RocketPoCatalogSnapshot.collectionRunId, RocketPoCatalogSnapshot.createdAt, RocketPoCatalogSnapshot.detailPoCount, RocketPoCatalogSnapshot.id, RocketPoCatalogSnapshot.listPagesRead, RocketPoCatalogSnapshot.organization (+10 more)

### Community 122 - "Channels schema"
Cohesion: 0.12
Nodes (18): RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt, RocketPurchaseOrder.firstSkuName, RocketPurchaseOrder.id, RocketPurchaseOrder.items, RocketPurchaseOrder.orderAmount, RocketPurchaseOrder.orderedAt (+10 more)

### Community 123 - "AI schema"
Cohesion: 0.12
Nodes (18): ThumbnailGenerationEvent.actor, ThumbnailGenerationEvent.actorUserId, ThumbnailGenerationEvent.attemptNumber, ThumbnailGenerationEvent.createdAt, ThumbnailGenerationEvent.errorMessage, ThumbnailGenerationEvent.eventType, ThumbnailGenerationEvent.fromPhase, ThumbnailGenerationEvent.fromStatus (+10 more)

### Community 124 - "Community 124"
Cohesion: 0.11
Nodes (16): ALERT_KINDS, ALERT_OPERATION_LIFECYCLE_STATUSES, ALERT_SEVERITIES, ALERT_STATUSES, AlertItem, AlertItemSchema, AlertKind, AlertOperationLifecycleStatus (+8 more)

### Community 125 - "Community 125"
Cohesion: 0.11
Nodes (16): CANCEL_OPERATION_TARGET_TYPES, CancelOperationAffected, CancelOperationAffectedSchema, CancelOperationPreserved, CancelOperationPreservedSchema, CancelOperationResponse, CancelOperationResponseSchema, CancelOperationStatus (+8 more)

### Community 126 - "Community 126"
Cohesion: 0.22
Nodes (18): assertCurrentRebuildBinding(), assertProtectedApiDestination(), assertReplayCounts(), assertReplayFactDigest(), bootstrap(), buildSharedBootstrapPlan(), cliValue(), createPrisma() (+10 more)

### Community 127 - "Community 127"
Cohesion: 0.14
Nodes (10): ChannelListingController, Controller, CurrentOrganization, Get, Param, Query, ChannelListingRepositoryPort, ChannelListingQueryService (+2 more)

### Community 128 - "Community 128"
Cohesion: 0.18
Nodes (8): ChannelCatalogCollectionRepositoryAdapter, isUniqueConstraintError(), ownedRunWhere(), Injectable, ChannelCatalogCollectionChunkRecord, ChannelCatalogCollectionRunRecord, ChannelCatalogCollectionWithChunks, startRun()

### Community 129 - "prisma field: ActionTask.targetId"
Cohesion: 0.24
Nodes (11): ActionTask.targetId, ActionTask.targetType, AdAction.targetType, AgentArtifact.targetId, Alert.actionTaskId, Alert.targetId, Alert.targetType, ChannelAdTargetDailySnapshot.targetType (+3 more)

### Community 130 - "Inventory schema"
Cohesion: 0.14
Nodes (17): StockTransfer.fromWarehouseId, StockTransfer.toWarehouseId, Warehouse.address, Warehouse.code, Warehouse.createdAt, Warehouse.id, Warehouse.isDefault, Warehouse.manager (+9 more)

### Community 131 - "Community 131"
Cohesion: 0.21
Nodes (15): Lane, bool(), parseRawArgs(), ParseRawArgsOptions, pushValue(), value(), values(), normalizeDriver() (+7 more)

### Community 132 - "Community 132"
Cohesion: 0.23
Nodes (5): Inject, ChannelCatalogCollectionPort, ChannelCatalogCollectionService, parseRequest(), Injectable

### Community 133 - "Community 133"
Cohesion: 0.12
Nodes (15): CurrentOrganization, Get, Query, ChannelSkuAvailabilityQueryDto, IsIn, IsInt, IsOptional, IsString (+7 more)

### Community 134 - "AgentOS schema"
Cohesion: 0.15
Nodes (16): AgentRunEvent.agentInstance, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message, AgentRunEvent.organization (+8 more)

### Community 135 - "Channels schema"
Cohesion: 0.16
Nodes (16): ChannelScrapeChunk.checksum, ChannelScrapeChunk.createdAt, ChannelScrapeChunk.id, ChannelScrapeChunk.itemCount, ChannelScrapeChunk.kind, ChannelScrapeChunk.organization, ChannelScrapeChunk.payload, ChannelScrapeChunk.publicationJson (+8 more)

### Community 136 - "Inventory schema"
Cohesion: 0.13
Nodes (16): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.organization, PickingItem.pickedAt, PickingItem.pickingList (+8 more)

### Community 137 - "Inventory schema"
Cohesion: 0.15
Nodes (16): PickingItem.pickingListId, PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.id, PickingList.listNumber, PickingList.organization, PickingList.pickedItems (+8 more)

### Community 138 - "Inventory schema"
Cohesion: 0.15
Nodes (16): SellpiaOrderTransmissionIntent.abortedAt, SellpiaOrderTransmissionIntent.createdAt, SellpiaOrderTransmissionIntent.createdBy, SellpiaOrderTransmissionIntent.creator, SellpiaOrderTransmissionIntent.finalizedAt, SellpiaOrderTransmissionIntent.finalizedGeneration, SellpiaOrderTransmissionIntent.id, SellpiaOrderTransmissionIntent.intentKey (+8 more)

### Community 139 - "Inventory schema"
Cohesion: 0.13
Nodes (15): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.sourceRef, SellpiaReceiptUploadBatch.sourceType (+7 more)

### Community 140 - "Inventory schema"
Cohesion: 0.13
Nodes (16): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.id, StockTransfer.notes, StockTransfer.optionName, StockTransfer.organization, StockTransfer.quantity (+8 more)

### Community 141 - "Supply schema"
Cohesion: 0.13
Nodes (16): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.dueDate, SupplierPayment.id, SupplierPayment.notes, SupplierPayment.organization, SupplierPayment.paidAmount, SupplierPayment.paidDate (+8 more)

### Community 142 - "Supply schema"
Cohesion: 0.16
Nodes (16): SupplierProduct.createdAt, SupplierProduct.id, SupplierProduct.isPrimary, SupplierProduct.memo, SupplierProduct.minOrderQty, SupplierProduct.organization, SupplierProduct.sellpiaInventorySku, SupplierProduct.sellpiaInventorySkuId (+8 more)

### Community 143 - "Orders schema"
Cohesion: 0.13
Nodes (16): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.externalSku, UnshippedItem.id, UnshippedItem.isNotified, UnshippedItem.notifiedAt, UnshippedItem.optionName, UnshippedItem.order (+8 more)

### Community 144 - "Community 144"
Cohesion: 0.24
Nodes (14): analyzeReconstructionTriggers(), changedFilesFromGit(), ghPrBody(), git(), isCrossLayerControlChange(), isHighRiskBoundary(), isLargeServiceOrComponent(), layerOf() (+6 more)

### Community 145 - "Community 145"
Cohesion: 0.28
Nodes (10): ChannelCatalogCollectionController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+2 more)

### Community 146 - "Community 146"
Cohesion: 0.13
Nodes (6): CoupangProviderAdapter, Injectable, CoupangCreateSellerProductResponse, CoupangSellerProductPayload, OrderSheetResponse, SellerProductExternalSkuResponse

### Community 147 - "Orders schema"
Cohesion: 0.14
Nodes (15): CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing (+7 more)

### Community 148 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 149 - "Sourcing schema"
Cohesion: 0.17
Nodes (15): NaverPopularKeywordDailySnapshot.boardKey, NaverPopularKeywordDailySnapshot.boardLabel, NaverPopularKeywordDailySnapshot.businessDate, NaverPopularKeywordDailySnapshot.capturedAt, NaverPopularKeywordDailySnapshot.cid, NaverPopularKeywordDailySnapshot.createdAt, NaverPopularKeywordDailySnapshot.id, NaverPopularKeywordDailySnapshot.keyword (+7 more)

### Community 150 - "Finance schema"
Cohesion: 0.14
Nodes (15): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.id, ProcessingCost.master, ProcessingCost.notes, ProcessingCost.organization, ProcessingCost.processType, ProcessingCost.productName (+7 more)

### Community 151 - "Finance schema"
Cohesion: 0.15
Nodes (15): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.organization, SalesPlan.period (+7 more)

### Community 152 - "Channels schema"
Cohesion: 0.16
Nodes (15): SellpiaSalesDailySnapshot.businessDate, SellpiaSalesDailySnapshot.capturedAt, SellpiaSalesDailySnapshot.channelGroup, SellpiaSalesDailySnapshot.costKrw, SellpiaSalesDailySnapshot.createdAt, SellpiaSalesDailySnapshot.id, SellpiaSalesDailySnapshot.organization, SellpiaSalesDailySnapshot.qty (+7 more)

### Community 153 - "Inventory schema"
Cohesion: 0.15
Nodes (15): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items, StockAudit.matchedCount (+7 more)

### Community 154 - "Community 154"
Cohesion: 0.18
Nodes (12): assertActiveCoupangAccount(), assertCanonicalAccount(), completeCollectionRun(), completedCollectionResult(), jsonRecord(), lockAccount(), lockCollectionRun(), nextPublicationSequence() (+4 more)

### Community 155 - "Community 155"
Cohesion: 0.18
Nodes (7): ChannelSyncRepositoryAdapter, reconcileProductDetailOption(), Injectable, ProductListingSyncResult, formatKstIso(), normalizeCoupangOrderStatus(), normalizeCoupangProductStatus()

### Community 156 - "Community 156"
Cohesion: 0.26
Nodes (8): SyncResult, isCoupangCredentialResolutionError(), syncCoupangOrders(), syncCoupangProducts(), ChannelSyncService, errorMessage(), resultMessage(), Injectable

### Community 157 - "Inventory schema"
Cohesion: 0.15
Nodes (13): packages/shared — @kiditem/shared, Inventory, SellpiaOrderTransmissionIntentReconciliation.id, SellpiaOrderTransmissionIntentReconciliation.intent, SellpiaOrderTransmissionIntentReconciliation.intentId, SellpiaOrderTransmissionIntentReconciliation.note, SellpiaOrderTransmissionIntentReconciliation.organization, SellpiaOrderTransmissionIntentReconciliation.outcome (+5 more)

### Community 158 - "Finance schema"
Cohesion: 0.15
Nodes (14): Finance, GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.listing, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization (+6 more)

### Community 159 - "Advertising schema"
Cohesion: 0.15
Nodes (14): ExecutionTask.workerId, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentTaskRef, ExecutionWorker.currentUrl, ExecutionWorker.id, ExecutionWorker.label, ExecutionWorker.lastHeartbeatAt (+6 more)

### Community 160 - "Finance schema"
Cohesion: 0.15
Nodes (14): ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description, ManualLedger.id (+6 more)

### Community 161 - "Community 161"
Cohesion: 0.14
Nodes (12): CoupangDirectCenter, CoupangDirectCenterSchema, CoupangDirectOrderCollectionRequest, CoupangDirectOrderCollectionRequestSchema, CoupangDirectOrderItem, CoupangDirectOrderItemSchema, CoupangDirectOrderStatus, CoupangDirectOrderStatusSchema (+4 more)

### Community 162 - "Community 162"
Cohesion: 0.20
Nodes (11): SELLPIA_WORKBOOK_ACCEPT, SELLPIA_WORKBOOK_FILE_EXTENSIONS, SellpiaReceiptBatchCreateInput, SellpiaReceiptBatchCreateInputSchema, SellpiaReceiptBatchMarkUploadedInput, SellpiaReceiptBatchMarkUploadedInputSchema, SellpiaReceiptUploadBatch, SellpiaReceiptUploadBatchSchema (+3 more)

### Community 163 - "Community 163"
Cohesion: 0.25
Nodes (14): assertPositiveIntegerText(), assertSharedDatabaseIdentity(), assertUuid(), buildChannelAccountFingerprint(), buildCoupangReplayBundle(), buildCoupangReplayScope(), computeReplayFactDigest(), databaseProjectRef() (+6 more)

### Community 164 - "Community 164"
Cohesion: 0.23
Nodes (11): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), main(), parseBaseline(), readFiles(), repoRoot(), walk() (+3 more)

### Community 165 - "Community 165"
Cohesion: 0.15
Nodes (7): RocketPoCatalogPort, RocketPoCatalogResolution, canonicalArtifactHash(), isCompleteCollection(), RocketPoCatalogService, Injectable, RocketPurchasePreviewRequestSchema

### Community 166 - "Supply schema"
Cohesion: 0.19
Nodes (13): Supply, RocketPurchaseConfirmationAllocation.confirmationLine, RocketPurchaseConfirmationAllocation.confirmationLineId, RocketPurchaseConfirmationAllocation.createdAt, RocketPurchaseConfirmationAllocation.id, RocketPurchaseConfirmationAllocation.organization, RocketPurchaseConfirmationAllocation.quantity, RocketPurchaseConfirmationAllocation.sellpiaInventorySku (+5 more)

### Community 167 - "Channels schema"
Cohesion: 0.19
Nodes (13): CoupangKeywordSerpDailySnapshot.businessDate, CoupangKeywordSerpDailySnapshot.capturedAt, CoupangKeywordSerpDailySnapshot.createdAt, CoupangKeywordSerpDailySnapshot.id, CoupangKeywordSerpDailySnapshot.itemCount, CoupangKeywordSerpDailySnapshot.items, CoupangKeywordSerpDailySnapshot.keyword, CoupangKeywordSerpDailySnapshot.organization (+5 more)

### Community 168 - "Core schema"
Cohesion: 0.17
Nodes (13): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+5 more)

### Community 169 - "Channels schema"
Cohesion: 0.18
Nodes (13): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson, RocketSupplyDailySnapshot.revenueKrw (+5 more)

### Community 170 - "Community 170"
Cohesion: 0.29
Nodes (13): asRecord(), assertNoPii(), buildReplayBody(), buildReplayKpis(), cloneReplayValue(), containsPiiValue(), copyString(), dateOnly() (+5 more)

### Community 171 - "Community 171"
Cohesion: 0.31
Nodes (11): analyzeSchemaArtifactSync(), changedFilesFromGit(), changedFilesFromWorkingTree(), GENERATED_ARTIFACT_PATHS, git(), main(), matchesAnyPath(), mergeChangedFiles() (+3 more)

### Community 172 - "Community 172"
Cohesion: 0.18
Nodes (8): ChannelAccountController, Body, Controller, CurrentOrganization, Get, UpdateCoupangAccountSettingsSchema, Patch, Roles

### Community 173 - "Community 173"
Cohesion: 0.26
Nodes (7): ChannelSyncController, Body, Controller, CurrentOrganization, CurrentUser, Get, Post

### Community 174 - "Community 174"
Cohesion: 0.23
Nodes (12): upsertChannelCatalogIdentities(), applyProductLinksInBatches(), applyVariantLinksInBatches(), buildCatalogProductProvisioningListings(), publishCatalogOperationalProducts(), unique(), validateProvisionedLinks(), flattenMedia() (+4 more)

### Community 175 - "Channels schema"
Cohesion: 0.20
Nodes (12): CoupangKeywordTracker.createdAt, CoupangKeywordTracker.enabled, CoupangKeywordTracker.id, CoupangKeywordTracker.keyword, CoupangKeywordTracker.lastCapturedAt, CoupangKeywordTracker.maxPages, CoupangKeywordTracker.organization, CoupangKeywordTracker.updatedAt (+4 more)

### Community 176 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 177 - "Community 177"
Cohesion: 0.26
Nodes (9): DETAIL_IMAGE_COUNTS, DETAIL_PAGE_AGE_GROUPS, DETAIL_PAGE_TEMPLATE_IDS, DetailImageCount, DetailImageCountSchema, DetailPageAgeGroup, DetailPageAgeGroupSchema, DetailPageTemplateId (+1 more)

### Community 178 - "Community 178"
Cohesion: 0.30
Nodes (12): assertAllowedRecord(), assertAllowedRows(), assertAllowedScalarRecord(), assertOptionalScalar(), assertPlainRecord(), assertReplayBundle(), assertReplayFactCounts(), assertReplayKpis() (+4 more)

### Community 179 - "Community 179"
Cohesion: 0.18
Nodes (5): CoupangSyncOrderPayload, CoupangSyncReturnPayload, HealthResult, syncSingleCoupangOrder(), syncSingleCoupangReturn()

### Community 180 - "Community 180"
Cohesion: 0.20
Nodes (6): buildCoupangWingSnapshotCoverage(), CoupangWingSnapshotCoverage, ChannelCatalogImportRepositoryPort, Inject, ParsedWingCatalogRow, ParsedWingCatalogSkippedRow

### Community 181 - "Community 181"
Cohesion: 0.18
Nodes (3): ChannelCatalogCollectionRepositoryPort, ChannelCatalogPublicationPort, Inject

### Community 182 - "Advertising schema"
Cohesion: 0.20
Nodes (10): Advertising, ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.id, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.url (+2 more)

### Community 183 - "System schema"
Cohesion: 0.20
Nodes (11): ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization, ActivityEvent.source (+3 more)

### Community 184 - "System schema"
Cohesion: 0.20
Nodes (10): FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name, FeatureGate.updatedAt (+2 more)

### Community 185 - "Supply schema"
Cohesion: 0.20
Nodes (11): PurchaseOrderItem.createdAt, PurchaseOrderItem.id, PurchaseOrderItem.order, PurchaseOrderItem.organization, PurchaseOrderItem.productName, PurchaseOrderItem.quantity, PurchaseOrderItem.sellpiaInventorySku, PurchaseOrderItem.sellpiaInventorySkuId (+3 more)

### Community 186 - "Community 186"
Cohesion: 0.18
Nodes (11): assertLocalRebuildGuard(), assertSharedRebuildGuard(), guardFromCli(), assertLocalDevelopmentDatabase(), bootstrapAuthoritativeInventoryDevelopment(), buildBootstrapPlan(), LOCAL_HOSTS, main() (+3 more)

### Community 187 - "Community 187"
Cohesion: 0.38
Nodes (9): checkTrackedClaudeDirectory(), findClaudeShimFindings(), findInstructionChainSizeFindings(), findStaleInstructionLines(), git(), listRepositoryFiles(), listTracked(), main() (+1 more)

### Community 188 - "Community 188"
Cohesion: 0.35
Nodes (9): analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), directOutPortFiles(), FORBIDDEN_IN_PORT_FOLDER_NAMES, forbiddenInPortCallerFolders(), listDirectories(), listFiles(), main() (+1 more)

### Community 189 - "Community 189"
Cohesion: 0.31
Nodes (9): addUnique(), defaultOutputDir, defaultSourceDir, normalizeKiditemOrigin(), patchExtensionRuntimeFiles(), patchManifest(), prepareCoupangExtension(), repoRoot (+1 more)

### Community 190 - "Community 190"
Cohesion: 0.20
Nodes (3): ChannelAccountRepositoryPort, Inject, Inject

### Community 191 - "System schema"
Cohesion: 0.24
Nodes (10): System, SystemSetting.createdAt, SystemSetting.id, SystemSetting.key, SystemSetting.organization, SystemSetting.updatedAt, SystemSetting.value, SystemSetting (+2 more)

### Community 192 - "Community 192"
Cohesion: 0.20
Nodes (6): ErrorCodes, deletedLegacyTables, repoRoot, retiredBaselineScript, retiredImporterFile, retiredPlannerFile

### Community 193 - "Community 193"
Cohesion: 0.20
Nodes (8): ReviewFilter, ReviewFilterSchema, ReviewListItem, ReviewListItemSchema, ReviewListResponse, ReviewListResponseSchema, ReviewSummary, ReviewSummarySchema

### Community 194 - "Community 194"
Cohesion: 0.49
Nodes (6): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), scrubDeep(), scrubSecrets(), walk()

### Community 195 - "Community 195"
Cohesion: 0.25
Nodes (6): ChannelAccountListController, Controller, CurrentOrganization, Get, ChannelAccountQueryService, Injectable

### Community 196 - "Community 196"
Cohesion: 0.25
Nodes (5): ChannelsOperationAlertAdapter, Inject, Injectable, OperationLifecyclePatch, StartOperationAlertInput

### Community 197 - "Community 197"
Cohesion: 0.22
Nodes (4): Inject, ChannelAccountRepositoryAdapter, Injectable, CoupangCredentialsPort

### Community 198 - "Channels schema"
Cohesion: 0.25
Nodes (9): Channels, CoupangRepresentativeKeywordOverride.createdAt, CoupangRepresentativeKeywordOverride.id, CoupangRepresentativeKeywordOverride.keyword, CoupangRepresentativeKeywordOverride.organization, CoupangRepresentativeKeywordOverride.updatedAt, CoupangRepresentativeKeywordOverride, coupang_representative_keyword_overrides (+1 more)

### Community 199 - "Community 199"
Cohesion: 0.22
Nodes (7): ReadinessCheck, ReadinessCheckSchema, ReadinessCheckStatusSchema, ReadinessResponse, ReadinessResponseSchema, RebuildReadinessResponse, RebuildReadinessResponseSchema

### Community 200 - "Community 200"
Cohesion: 0.25
Nodes (6): WorkflowRun, WorkflowRunSchema, WorkflowStepRun, WorkflowStepRunSchema, WorkflowTemplate, WorkflowTemplateSchema

### Community 201 - "Community 201"
Cohesion: 0.46
Nodes (6): analyzeInventory(), listTopLevelScriptFiles(), main(), repoRoot(), SCRIPT_INVENTORY, SUPPORT_FILES

### Community 202 - "Community 202"
Cohesion: 0.29
Nodes (6): CurrentOrganization, CurrentUser, Param, Post, UploadedFile, UseInterceptors

### Community 203 - "Community 203"
Cohesion: 0.29
Nodes (3): OperationAlertPort, Inject, Optional

### Community 204 - "Community 204"
Cohesion: 0.29
Nodes (3): MarketplaceRegistrationRepositoryPort, Inject, Optional

### Community 205 - "Community 205"
Cohesion: 0.33
Nodes (6): distinct(), evidenceForNames(), normalizePhysicalBarcode(), normalizeRecipeIdentityText(), normalizeRecipeSuggestionName(), ChannelRecipeSuggestionResponseSchema

### Community 206 - "Community 206"
Cohesion: 0.29
Nodes (5): AuthRequiredErrorBody, AuthUserPublic, AuthUserPublicSchema, LoginRequest, LoginRequestSchema

### Community 207 - "Community 207"
Cohesion: 0.33
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 208 - "Community 208"
Cohesion: 0.33
Nodes (4): SettlementReconcileDetail, SettlementReconcileDetailSchema, SettlementReconcileResponse, SettlementReconcileResponseSchema

### Community 211 - "Community 211"
Cohesion: 0.50
Nodes (4): fileHash(), importInput(), makeRow(), representativeRows()

### Community 217 - "Community 217"
Cohesion: 0.50
Nodes (4): is_allowlisted(), is_comment_line(), load_file_lines(), check-tenant-scope.sh script

### Community 218 - "Community 218"
Cohesion: 1.00
Nodes (3): makeRepository(), runRecord(), runWithChunks()

### Community 220 - "Community 220"
Cohesion: 0.67
Nodes (3): extractEnvKeys(), readModelFile(), redactEnvValues()

## Knowledge Gaps
- **2533 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+2528 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Core schema` to `prisma field: prisma — Shared Schema`, `prisma field: AgentToolDefinition.isActive`, `Community 2`, `Core schema`, `prisma field: channels — Marketplace Sync + SKU Matching`, `prisma field: AdAction.externalId`, `Community 7`, `Orders schema`, `Core schema`, `Channels schema`, `Community 16`, `AI schema`, `Community 18`, `AI schema`, `AgentOS schema`, `Orders schema`, `AgentOS schema`, `Sourcing schema`, `prisma field: externalOptionId canonical option identity`, `Inventory schema`, `AI schema`, `Core schema`, `Sourcing schema`, `AI schema`, `AI schema`, `Core schema`, `AI schema`, `Channels schema`, `AI schema`, `Channels schema`, `Community 44`, `Community 45`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Core schema`, `Channels schema`, `Channels schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Inventory schema`, `AgentOS schema`, `Supply schema`, `Channels schema`, `AI schema`, `AgentOS schema`, `Channels schema`, `System schema`, `Advertising schema`, `AgentOS schema`, `Orders schema`, `Supply schema`, `Sourcing schema`, `Channels schema`, `AgentOS schema`, `AI schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Orders schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `Finance schema`, `Supply schema`, `Supply schema`, `Channels schema`, `Sourcing schema`, `Supply schema`, `Inventory schema`, `AgentOS schema`, `AI schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `Channels schema`, `AI schema`, `prisma field: ActionTask.targetId`, `Inventory schema`, `AgentOS schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Supply schema`, `Orders schema`, `Orders schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Finance schema`, `Advertising schema`, `Finance schema`, `Supply schema`, `Channels schema`, `Core schema`, `Channels schema`, `Channels schema`, `Advertising schema`, `System schema`, `System schema`, `Supply schema`, `System schema`, `Channels schema`?**
  _High betweenness centrality (0.221) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `prisma field: channels — Marketplace Sync + SKU Matching` to `prisma field: prisma — Shared Schema`, `prisma field: AgentToolDefinition.isActive`, `Core schema`, `prisma field: AdAction.externalId`, `Orders schema`, `Core schema`, `Core schema`, `Channels schema`, `AI schema`, `AI schema`, `AgentOS schema`, `Orders schema`, `AgentOS schema`, `Sourcing schema`, `prisma field: externalOptionId canonical option identity`, `Inventory schema`, `AI schema`, `Core schema`, `Sourcing schema`, `AI schema`, `AI schema`, `Core schema`, `AI schema`, `Channels schema`, `AI schema`, `Channels schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Core schema`, `Channels schema`, `Channels schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Inventory schema`, `AgentOS schema`, `Advertising schema`, `Supply schema`, `System schema`, `Channels schema`, `AI schema`, `AgentOS schema`, `Channels schema`, `System schema`, `Advertising schema`, `AgentOS schema`, `Orders schema`, `Supply schema`, `Sourcing schema`, `Channels schema`, `AgentOS schema`, `AI schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Orders schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `Finance schema`, `Supply schema`, `Supply schema`, `Channels schema`, `Sourcing schema`, `Supply schema`, `Inventory schema`, `AgentOS schema`, `AI schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `Channels schema`, `AI schema`, `prisma field: ActionTask.targetId`, `Inventory schema`, `AgentOS schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Supply schema`, `Orders schema`, `Orders schema`, `System schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Finance schema`, `Advertising schema`, `Finance schema`, `Supply schema`, `Channels schema`, `Core schema`, `Channels schema`, `Channels schema`, `System schema`, `Advertising schema`, `System schema`, `System schema`, `Supply schema`, `System schema`, `Channels schema`?**
  _High betweenness centrality (0.150) - this node is a cross-community bridge._
- **Why does `Order` connect `Orders schema` to `prisma field: prisma — Shared Schema`, `prisma field: AgentToolDefinition.isActive`, `Community 2`, `prisma field: ActionTask.targetId`, `prisma field: channels — Marketplace Sync + SKU Matching`, `prisma field: AdAction.externalId`, `Orders schema`, `Core schema`, `Community 11`, `Core schema`, `Orders schema`, `Community 15`, `Community 16`, `Orders schema`, `AI schema`, `Community 21`, `Community 155`, `prisma field: externalOptionId canonical option identity`, `Inventory schema`, `Community 164`, `Community 36`, `Core schema`, `Community 171`, `Community 44`, `Community 45`, `Advertising schema`, `Community 58`, `Community 188`, `Community 61`, `System schema`, `Community 76`, `Community 209`, `Orders schema`, `Community 89`, `Orders schema`, `Community 100`, `Supply schema`, `Community 113`?**
  _High betweenness centrality (0.101) - this node is a cross-community bridge._
- **Are the 164 inferred relationships involving `Organization` (e.g. with `channel-account.controller.ts` and `channel-account-list.controller.ts`) actually correct?**
  _`Organization` has 164 INFERRED edges - model-reasoned connections that need verification._
- **Are the 130 inferred relationships involving `ChannelAccount` (e.g. with `channel-account.controller.ts` and `channel-account-list.controller.ts`) actually correct?**
  _`ChannelAccount` has 130 INFERRED edges - model-reasoned connections that need verification._
- **Are the 95 inferred relationships involving `ChannelListing` (e.g. with `channel-registration-capability.adapter.ts` and `channel-listing.controller.ts`) actually correct?**
  _`ChannelListing` has 95 INFERRED edges - model-reasoned connections that need verification._
- **Are the 120 inferred relationships involving `Order` (e.g. with `channel-sync.controller.ts` and `index.ts`) actually correct?**
  _`Order` has 120 INFERRED edges - model-reasoned connections that need verification._