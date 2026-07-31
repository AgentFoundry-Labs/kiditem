# Graph Report - schema-consumers  (2026-08-01)

## Corpus Check
- 433 files · ~229,138 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 6611 nodes · 39388 edges · 237 communities (217 shown, 20 thin omitted)
- Extraction: 30% EXTRACTED · 70% INFERRED · 0% AMBIGUOUS · INFERRED: 27509 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- prisma field: prisma — Shared Schema
- Community 1
- prisma field: externalOptionId canonical option identity
- Orders schema
- Community 4
- Core schema
- Community 6
- Core schema
- Community 8
- Community 9
- Core schema
- Community 11
- AI schema
- AI schema
- AI schema
- Community 15
- Channels schema
- Community 17
- Community 18
- Community 19
- Community 20
- AI schema
- Community 22
- prisma field: channels — Marketplace Sync + SKU Matching
- AI schema
- Community 25
- System schema
- AI schema
- Community 28
- AI schema
- AgentOS schema
- Orders schema
- AgentOS schema
- Orders schema
- Sourcing schema
- Channels schema
- Community 36
- Community 37
- AI schema
- Community 39
- Sourcing schema
- Sourcing schema
- Core schema
- Orders schema
- Community 44
- Community 45
- prisma field: ActionTask.targetId
- AI schema
- Channels schema
- Sourcing schema
- Community 50
- Community 51
- Core schema
- Community 53
- AgentOS schema
- AgentOS schema
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Channels schema
- Core schema
- Channels schema
- Supply schema
- Community 65
- Channels schema
- Community 67
- AgentOS schema
- Community 69
- Community 70
- System schema
- AgentOS schema
- AgentOS schema
- Channels schema
- Community 75
- Community 76
- Community 77
- Orders schema
- Channels schema
- Channels schema
- Inventory schema
- Community 82
- Community 83
- Community 84
- AgentOS schema
- Advertising schema
- Supply schema
- Community 88
- Channels schema
- Community 90
- AgentOS schema
- Core schema
- Community 93
- Community 94
- System schema
- Advertising schema
- Orders schema
- Community 98
- Community 99
- Community 100
- Community 101
- AgentOS schema
- Channels schema
- prisma field: PurchaseOrder.supplierId
- Supply schema
- Channels schema
- Sourcing schema
- AI schema
- System schema
- Channels schema
- Sourcing schema
- Orders schema
- Sourcing schema
- AI schema
- Community 115
- Community 116
- Community 117
- AgentOS schema
- Finance schema
- Sourcing schema
- Community 121
- Community 122
- Community 123
- AgentOS schema
- Orders schema
- Supply schema
- Inventory schema
- Community 128
- Community 129
- Community 130
- AgentOS schema
- Core schema
- Sourcing schema
- Sourcing schema
- Channels schema
- Channels schema
- Inventory schema
- Community 138
- Community 139
- Core schema
- Supply schema
- Community 142
- Community 143
- AgentOS schema
- Channels schema
- Inventory schema
- Inventory schema
- Supply schema
- Supply schema
- Supply schema
- Orders schema
- Community 152
- Community 153
- Community 154
- Orders schema
- System schema
- Finance schema
- Finance schema
- Inventory schema
- Channels schema
- Inventory schema
- Inventory schema
- Community 163
- Community 164
- Finance schema
- Advertising schema
- System schema
- Finance schema
- Community 169
- Supply schema
- Channels schema
- Core schema
- Channels schema
- Community 174
- Community 175
- Core schema
- Inventory schema
- Channels schema
- Inventory schema
- Core schema
- System schema
- Community 182
- Community 183
- System schema
- Supply schema
- Community 186
- Community 187
- Community 188
- Community 189
- Community 190
- Advertising schema
- System schema
- Community 193
- Community 194
- Community 195
- Community 196
- Community 197
- Channels schema
- Core schema
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
- Community 230
- Community 231
- Community 232
- Community 233

## God Nodes (most connected - your core abstractions)
1. `Organization` - 478 edges
2. `Database ERD` - 387 edges
3. `ChannelAccount` - 205 edges
4. `ChannelListing` - 198 edges
5. `Order` - 191 edges
6. `ProductPreparation.organizationId` - 188 edges
7. `ContentWorkspace.organizationId` - 187 edges
8. `ChannelListing.organizationId` - 184 edges
9. `ProductRegistrationExecution.organizationId` - 183 edges
10. `ChannelAdTargetDailySnapshot.organizationId` - 182 edges
11. `SourceImportRun.organizationId` - 182 edges
12. `ContentWorkspaceThumbnailSelection.organizationId` - 181 edges

## Surprising Connections (you probably didn't know these)
- `packages/shared — @kiditem/shared` --mentions_domain--> `Inventory`  [EXTRACTED]
  packages/shared/AGENTS.md → prisma/models/inventory.prisma
- `appendValues()` --indirect_call--> `item()`  [INFERRED]
  scripts/dev-data.ts → apps/server/src/channels/domain/channel-recipe-automation-product-group.spec.ts
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

## Communities (237 total, 20 thin omitted)

### Community 0 - "prisma field: prisma — Shared Schema"
Cohesion: 0.13
Nodes (296): UploadedWorkbookFile, HEADERS, USER, CHANNEL_ACCOUNT_LIST_SELECT, chunkSelect, ErrorInput, LockedRun, OwnedRunInput (+288 more)

### Community 1 - "Community 1"
Cohesion: 0.02
Nodes (260): ActionTask, ActionTaskExecuteResponse, ActionTaskList, ActionTaskListSchema, ActionTaskRelatedProduct, ActionTaskRelatedProductSchema, ActionTaskSchema, ActionTaskSourceAlert (+252 more)

### Community 2 - "prisma field: externalOptionId canonical option identity"
Cohesion: 0.07
Nodes (107): upsertChannelCatalogIdentities(), CanonicalParent, ClaimInput, LockedRunRow, TRANSACTION_OPTIONS, UpsertInput, LockedChunk, LockedCollectionRun (+99 more)

### Community 3 - "Orders schema"
Cohesion: 0.03
Nodes (126): ListingForProductSync, accountIdFor(), seedOrderInline(), seedReturnInline(), vendorItemId provider term, Database ERD, AdAction.listingOptionId, AgentApprovalRequest.agentInstanceId (+118 more)

### Community 4 - "Community 4"
Cohesion: 0.02
Nodes (101): AgentApprovalRequestSummary, AgentApprovalRequestSummarySchema, AgentApprovalStatus, AgentApprovalStatusSchema, AgentArtifactHandoffSummary, AgentArtifactHandoffSummarySchema, AgentArtifactStatus, AgentArtifactStatusSchema (+93 more)

### Community 5 - "Core schema"
Cohesion: 0.03
Nodes (86): ChannelRecipeAutomationProductTopology, classifyRecipeAutomationProductGroups(), groupDecision(), autoItem, configuredItem, quantityReviewItem, reviewItem, ChannelListing.masterProductId (+78 more)

### Community 6 - "Community 6"
Cohesion: 0.03
Nodes (57): ChannelCatalogImportController, Controller, Inject, ChannelSkuAvailabilityController, Controller, ChannelDashboardRepositoryAdapter, Injectable, ChannelRecipeAutomationContextRepositoryAdapter (+49 more)

### Community 7 - "Core schema"
Cohesion: 0.04
Nodes (44): Organization.createdAt, Organization.id, Organization.name, Organization.slug, Organization.updatedAt, Organization, DATA_MIGRATION_IDS, DATA_MIGRATION_RELEASES (+36 more)

### Community 8 - "Community 8"
Cohesion: 0.03
Nodes (71): CreateMasterProductInput, CreateMasterProductInputSchema, CreateProductVariantFieldsSchema, CreateProductVariantInput, CreateProductVariantInputSchema, CreateProductVariantRecipeIfEmptySchema, CreateProductVariantRecipesIfEmptyInput, CreateProductVariantRecipesIfEmptyInputSchema (+63 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (66): option(), AdapterCommand, appendFlag(), appendOption(), appendProjectReferenceDefaults(), archiveFileName(), archiveShaFileName(), Args (+58 more)

### Community 10 - "Core schema"
Cohesion: 0.04
Nodes (62): ContentGeneration.triggeredByUserId, InventoryCommitment.businessKey, InventoryCommitment.createdAt, InventoryCommitment.createdBy, InventoryCommitment.creator, InventoryCommitment.id, InventoryCommitment.inventoryGeneration, InventoryCommitment.kind (+54 more)

### Community 11 - "Community 11"
Cohesion: 0.03
Nodes (58): ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow, ProductRankingRowSchema, ReturnFaultSplit, ReturnFaultSplitSchema, ReturnReasonRow, ReturnReasonRowSchema (+50 more)

### Community 12 - "AI schema"
Cohesion: 0.04
Nodes (62): ProductPreparation.approvedAt, ProductPreparation.approvedByUser, ProductPreparation.channelAccount, ProductPreparation.channelAccountId, ProductPreparation.channelListing, ProductPreparation.channelListingId, ProductPreparation.createdAt, ProductPreparation.createdByUser (+54 more)

### Community 13 - "AI schema"
Cohesion: 0.04
Nodes (62): ContentAsset.originGenerationGroupId, ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.editedHtmlSavedAt (+54 more)

### Community 14 - "AI schema"
Cohesion: 0.04
Nodes (61): packages/shared — @kiditem/shared, AI, ProductPreparation.selectedThumbnailGenerationId, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.contentWorkspaceId, ThumbnailGeneration.createdAt, ThumbnailGeneration.deletedAt (+53 more)

### Community 15 - "Community 15"
Cohesion: 0.04
Nodes (54): ChunkRequestBaseSchema, COUPANG_CATALOG_BROWSER_FILE_NAME, COUPANG_CATALOG_COLLECTOR_VERSION, COUPANG_CATALOG_MAX_CHUNK_BYTES, COUPANG_CATALOG_MAX_MEDIA_PER_OWNER, COUPANG_CATALOG_MAX_OPTIONS_PER_PRODUCT, COUPANG_CATALOG_MAX_PRODUCT_BYTES, COUPANG_CATALOG_MAX_PRODUCTS_PER_CHUNK (+46 more)

### Community 16 - "Channels schema"
Cohesion: 0.04
Nodes (55): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+47 more)

### Community 17 - "Community 17"
Cohesion: 0.07
Nodes (50): Lane, databaseUrl(), value(), APPLY_STORAGE_CACHE_CONTROL_CONFIRMATION, applyCacheControl(), ApplyResult, applyS3CacheControl(), applySupabaseCacheControl() (+42 more)

### Community 18 - "Community 18"
Cohesion: 0.06
Nodes (27): ChannelSyncController, Body, Controller, CurrentOrganization, CurrentUser, Get, Post, ChannelSyncRepositoryAdapter (+19 more)

### Community 19 - "Community 19"
Cohesion: 0.09
Nodes (52): assertNoLocalAuthSecrets(), assertNonProductionTarget(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged(), assertSha256(), BaselineManifest, BaselineManifestExpectation, baselineObjectKeys (+44 more)

### Community 20 - "Community 20"
Cohesion: 0.08
Nodes (47): apiHeaders(), apiUrl(), Args, assertSafeDatasetId(), assertSupportedReplayPayloads(), BundleManifest, BundlePayload, BundleReference (+39 more)

### Community 21 - "AI schema"
Cohesion: 0.04
Nodes (51): DetailPageImageArtifact.byteLength, DetailPageImageArtifact.contentType, DetailPageImageArtifact.createdAt, DetailPageImageArtifact.createdBy, DetailPageImageArtifact.createdByUserId, DetailPageImageArtifact.id, DetailPageImageArtifact.imageUrl, DetailPageImageArtifact.objectKey (+43 more)

### Community 22 - "Community 22"
Cohesion: 0.04
Nodes (49): boundedText(), isoDay, isRocketWorkbookBlockingReason(), requiredText(), ROCKET_PO_ROW_LIMIT, ROCKET_SAVED_PO_RESPONSE_PROFILE, ROCKET_SHORTAGE_REASONS, ROCKET_WORKBOOK_BLOCKING_REASONS (+41 more)

### Community 23 - "prisma field: channels — Marketplace Sync + SKU Matching"
Cohesion: 0.08
Nodes (28): MAX_COUPANG_WING_IMPORT_ROWS, PARENT_COLUMN_INDEXES, REQUIRED_HEADERS, workbookBuffer(), WorkbookOptions, ChannelProductCandidate, ChannelProductCandidateRankingInput, emptyEvidence() (+20 more)

### Community 24 - "AI schema"
Cohesion: 0.05
Nodes (47): ContentGeneration.detailPageArtifactId, ContentWorkspace.currentDetailPageArtifactId, ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.contentWorkspaceId, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.createdByUserId (+39 more)

### Community 25 - "Community 25"
Cohesion: 0.10
Nodes (47): dataMigrations, APPLY_DATA_MIGRATIONS_CONFIRMATION, appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertBaselineBinding(), assertBaselineCli(), assertMutatingTarget(), assertRebuildBaselineRestore() (+39 more)

### Community 26 - "System schema"
Cohesion: 0.05
Nodes (37): assertExactProductGraph(), MarketplaceRegistrationRepositoryAdapter, Injectable, upsertExactOptionLinks(), MarketplaceRegistrationRepositoryPort, asRecord(), KidItemFirstOptionLink, KidItemFirstRegistrationLinks (+29 more)

### Community 27 - "AI schema"
Cohesion: 0.05
Nodes (47): ContentGeneration.contentWorkspaceId, ContentWorkspace.channelListing, ContentWorkspace.channelListingId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.createdByUserId, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageRevision (+39 more)

### Community 28 - "Community 28"
Cohesion: 0.07
Nodes (22): ChannelRegistrationCapabilityAdapter, toSellpiaMatch(), Injectable, ChannelsMarketplaceRegistrationCapabilityPort, ExternalProductRegistrationMatchPreviewInput, ExternalProductRegistrationMatchPreviewResult, ExternalProductRegistrationPreflightInput, ExternalProductRegistrationPreflightResult (+14 more)

### Community 29 - "AI schema"
Cohesion: 0.05
Nodes (41): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt (+33 more)

### Community 30 - "AgentOS schema"
Cohesion: 0.05
Nodes (44): AgentRunRequest.agentInstance, AgentRunRequest.attempts, AgentRunRequest.claimedAt, AgentRunRequest.claimedBy, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.coalescedIntoRequestId, AgentRunRequest.conversation, AgentRunRequest.createdAt (+36 more)

### Community 31 - "Orders schema"
Cohesion: 0.06
Nodes (41): SellpiaOrderTransmissionIntent.abortedAt, SellpiaOrderTransmissionIntent.createdAt, SellpiaOrderTransmissionIntent.createdBy, SellpiaOrderTransmissionIntent.creator, SellpiaOrderTransmissionIntent.finalizedAt, SellpiaOrderTransmissionIntent.finalizedGeneration, SellpiaOrderTransmissionIntent.id, SellpiaOrderTransmissionIntent.intentKey (+33 more)

### Community 32 - "AgentOS schema"
Cohesion: 0.05
Nodes (42): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+34 more)

### Community 33 - "Orders schema"
Cohesion: 0.05
Nodes (39): Review.content, Review.createdAt, Review.externalProductId, Review.externalReviewId, Review.id, Review.imageCount, Review.isBlinded, Review.isDeleted (+31 more)

### Community 34 - "Sourcing schema"
Cohesion: 0.05
Nodes (41): CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id, CandidateImage.isPrimary (+33 more)

### Community 35 - "Channels schema"
Cohesion: 0.06
Nodes (39): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignIdentity, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel (+31 more)

### Community 36 - "Community 36"
Cohesion: 0.05
Nodes (38): ACCOUNT_AD_DAILY_DIGEST_KEYS, AD_ROW_KEYS, AD_SUMMARY_KEYS, ADS_DAILY_ROW_KEYS, ADS_KPI_KEYS, assertExactCount(), assertReadyCounts(), BootstrapPreflightManifest (+30 more)

### Community 37 - "Community 37"
Cohesion: 0.06
Nodes (13): CoupangProviderAdapter, Injectable, CoupangProviderPort, OrderSheetResponse, SellerProductExternalSkuResponse, ChannelSyncRepositoryPort, OrderSyncDeps, syncCoupangOrders() (+5 more)

### Community 38 - "AI schema"
Cohesion: 0.06
Nodes (38): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+30 more)

### Community 39 - "Community 39"
Cohesion: 0.10
Nodes (21): ChannelProductMatchingController, Body, Controller, CurrentOrganization, Get, Param, Post, Put (+13 more)

### Community 40 - "Sourcing schema"
Cohesion: 0.07
Nodes (37): Sourcing, NaverPopularKeywordDailySnapshot.boardKey, NaverPopularKeywordDailySnapshot.boardLabel, NaverPopularKeywordDailySnapshot.businessDate, NaverPopularKeywordDailySnapshot.capturedAt, NaverPopularKeywordDailySnapshot.cid, NaverPopularKeywordDailySnapshot.createdAt, NaverPopularKeywordDailySnapshot.id (+29 more)

### Community 41 - "Sourcing schema"
Cohesion: 0.06
Nodes (33): ContentGeneration.sourceCandidateId, SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.id, SourcingCandidate.imageUrl (+25 more)

### Community 42 - "Core schema"
Cohesion: 0.07
Nodes (36): ChannelListing.lastImportRunId, ChannelListingOption.lastImportRunId, Order.sourceImportRunId, SellpiaInventorySku.lastImportRunId, SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.createdAt (+28 more)

### Community 43 - "Orders schema"
Cohesion: 0.06
Nodes (32): Order.channelAccount, Order.channelAccountId, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id (+24 more)

### Community 44 - "Community 44"
Cohesion: 0.08
Nodes (33): ClientRenderArtifactSchema, ClientRenderContentTypeSchema, ClientRenderDateSchema, ClientRenderOutputWidthSchema, ClientRenderUuidSchema, ClientRenderVariantSchema, DETAIL_IMAGE_COUNTS, DETAIL_PAGE_AGE_GROUPS (+25 more)

### Community 45 - "Community 45"
Cohesion: 0.06
Nodes (34): deriveSellpiaInventoryFreshness(), FixedSellpiaAccountKeySchema, FixedSellpiaOriginSchema, IsoDateTimeStringSchema, SELLPIA_INVENTORY_COLLECTION_FAILURE_CODES, SELLPIA_INVENTORY_FRESHNESS_STATUSES, SELLPIA_INVENTORY_REFRESH_REASONS, SellpiaFreshnessDerivationInput (+26 more)

### Community 46 - "prisma field: ActionTask.targetId"
Cohesion: 0.08
Nodes (28): ActionTask.targetId, ActionTask.targetType, AdAction.targetType, Alert.targetId, Alert.targetType, PANEL_RUN_SOURCES, PanelRunSource, PanelRunSourceSchema (+20 more)

### Community 47 - "AI schema"
Cohesion: 0.07
Nodes (35): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height (+27 more)

### Community 48 - "Channels schema"
Cohesion: 0.07
Nodes (35): CoupangWingTrackedProduct.brandName, CoupangWingTrackedProduct.categoryHierarchy, CoupangWingTrackedProduct.createdAt, CoupangWingTrackedProduct.enabled, CoupangWingTrackedProduct.id, CoupangWingTrackedProduct.imagePath, CoupangWingTrackedProduct.itemId, CoupangWingTrackedProduct.lastCapturedAt (+27 more)

### Community 49 - "Sourcing schema"
Cohesion: 0.07
Nodes (35): ProductRegistrationExecution.channelAccount, ProductRegistrationExecution.channelAccountId, ProductRegistrationExecution.channelListing, ProductRegistrationExecution.channelListingId, ProductRegistrationExecution.completedAt, ProductRegistrationExecution.createdAt, ProductRegistrationExecution.executionKind, ProductRegistrationExecution.expectedProviderAccountId (+27 more)

### Community 50 - "Community 50"
Cohesion: 0.06
Nodes (19): loadSavedRocketCollection(), RocketPoCatalogIdentity, RocketPoCatalogPort, RocketPoCatalogResolution, RocketPoCatalogRepositoryPort, automationReason(), countDecision(), emptyScopedResult() (+11 more)

### Community 51 - "Community 51"
Cohesion: 0.10
Nodes (32): item(), automaticReason(), automaticStatus(), BarcodeEvidence, bestSimilarityPerSku(), ChannelRecipeAutomationDecision, ChannelRecipeSuggestionEvidenceKind, ChannelRecipeSuggestionResponse (+24 more)

### Community 52 - "Core schema"
Cohesion: 0.07
Nodes (32): ChannelListing.brand, ChannelListing.category, ChannelListing.channelAccount, ChannelListing.channelAccountId, ChannelListing.channelName, ChannelListing.createdAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo (+24 more)

### Community 53 - "Community 53"
Cohesion: 0.12
Nodes (30): buildCoupangWingSnapshotCoverage(), CoupangWingSnapshotCoverage, cellText(), collectParentMetadataConflicts(), decodeWorksheetRange(), expandMergedParentCells(), findHeaderRow(), formattedCellText() (+22 more)

### Community 54 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+25 more)

### Community 55 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.startedAt, WorkflowRun.status (+25 more)

### Community 56 - "Community 56"
Cohesion: 0.06
Nodes (30): DEFAULT_MASTER_PRODUCT_ABC_POLICY, MasterProductAbcConfidence, MasterProductAbcConfidenceSchema, MasterProductAbcEligibilityReason, MasterProductAbcEligibilityReasonSchema, MasterProductAbcEvaluation, MasterProductAbcEvaluationFieldsSchema, MasterProductAbcEvaluationSchema (+22 more)

### Community 57 - "Community 57"
Cohesion: 0.07
Nodes (29): SellpiaInventoryCollectionFailureCodeSchema, SellpiaInventoryQualityReportSchema, SellpiaInventoryRefreshReasonSchema, CompletedSourceArtifactRun, CoupangWingCatalogImportResponse, CoupangWingCatalogImportResponseSchema, ImportChanges, MAX_SELLPIA_INVENTORY_BROWSER_SNAPSHOT_ROWS (+21 more)

### Community 58 - "Community 58"
Cohesion: 0.09
Nodes (26): CHANNEL_LISTING_SORTS, CHANNEL_LISTING_TABS, ChannelListingDeletionDto, ChannelListingDeletionUnresolvedDto, ChannelListingQueryDto, IsIn, IsOptional, IsString (+18 more)

### Community 59 - "Community 59"
Cohesion: 0.09
Nodes (19): Inject, ChannelAccountRepositoryAdapter, envelopeToJson(), maskAccessKey(), readCredentialsConfig(), stripLegacyCredentialKeys(), toJsonRecord(), toRecord() (+11 more)

### Community 60 - "Community 60"
Cohesion: 0.13
Nodes (27): distinct(), evidenceForCode(), evidenceForNames(), normalizePhysicalBarcode(), bigrams(), ChannelRecipeNameEvidence, ChannelRecipeNameIndex, ChannelRecipeNameOption (+19 more)

### Community 61 - "Channels schema"
Cohesion: 0.08
Nodes (31): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.channelAccount, ChannelScrapeRun.channelAccountId, ChannelScrapeRun.clientRunKey, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson (+23 more)

### Community 62 - "Core schema"
Cohesion: 0.08
Nodes (31): ProductVariantComponent.confirmedAt, ProductVariantComponent.confirmedBy, ProductVariantComponent.createdAt, ProductVariantComponent.id, ProductVariantComponent.organization, ProductVariantComponent.productVariant, ProductVariantComponent.productVariantId, ProductVariantComponent.quantity (+23 more)

### Community 63 - "Channels schema"
Cohesion: 0.07
Nodes (31): RocketPoCatalogLine.businessDateBasis, RocketPoCatalogLine.center, RocketPoCatalogLine.createdAt, RocketPoCatalogLine.hasConfirmation, RocketPoCatalogLine.id, RocketPoCatalogLine.inboundType, RocketPoCatalogLine.orderQty, RocketPoCatalogLine.organization (+23 more)

### Community 64 - "Supply schema"
Cohesion: 0.07
Nodes (31): RocketPurchaseConfirmation.artifactBytes, RocketPurchaseConfirmation.artifactContentType, RocketPurchaseConfirmation.artifactFileName, RocketPurchaseConfirmation.artifactSha256, RocketPurchaseConfirmation.artifactStoredAt, RocketPurchaseConfirmation.channelAccount, RocketPurchaseConfirmation.completedAt, RocketPurchaseConfirmation.confirmedAt (+23 more)

### Community 65 - "Community 65"
Cohesion: 0.11
Nodes (20): aggregateMappingStatus(), assertLockedListing(), assertOperationActor(), ChannelListingRepositoryAdapter, contains(), firstPrice(), isUniqueViolation(), lockDeletionOperation() (+12 more)

### Community 66 - "Channels schema"
Cohesion: 0.08
Nodes (30): SellpiaManualMatchAlias.aliasTitle, SellpiaManualMatchAlias.createdAt, SellpiaManualMatchAlias.evidenceCount, SellpiaManualMatchAlias.id, SellpiaManualMatchAlias.itemCount, SellpiaManualMatchAlias.matchedType, SellpiaManualMatchAlias.normalizedAlias, SellpiaManualMatchAlias.organization (+22 more)

### Community 67 - "Community 67"
Cohesion: 0.14
Nodes (14): ChannelListingController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+6 more)

### Community 68 - "AgentOS schema"
Cohesion: 0.08
Nodes (29): AgentOS, AgentAuthorizationEvent.toolId, AgentInstanceToolPolicy.agentInstance, AgentInstanceToolPolicy.agentInstanceId, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentInstanceToolPolicy.dryRunMode (+21 more)

### Community 69 - "Community 69"
Cohesion: 0.09
Nodes (29): ChannelProductMatchingQueueResponseSchema, InventorySkuSnapshotListResponseSchema, CreateProductVariantRecipesIfEmptyResponseSchema, PlanProductVariantRecipesIfEmptyResponseSchema, artifact(), ApiClient, assertPartition(), assertPrivateOutputPath() (+21 more)

### Community 70 - "Community 70"
Cohesion: 0.10
Nodes (10): SellpiaRecipeEvidenceAdapter, toEvidenceSku(), Inject, Injectable, SellpiaRecipeEvidencePort, SellpiaRecipeEvidenceSku, ChannelRecipeSuggestionContextRepositoryPort, SellpiaManualMatchRepositoryPort (+2 more)

### Community 71 - "System schema"
Cohesion: 0.08
Nodes (26): Alert.actionTask, Alert.actorUser, Alert.actorUserId, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead (+18 more)

### Community 72 - "AgentOS schema"
Cohesion: 0.07
Nodes (28): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.approver, AgentApprovalRequest.approverUserId, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy, AgentApprovalRequest.decidedByUserId (+20 more)

### Community 73 - "AgentOS schema"
Cohesion: 0.08
Nodes (28): AgentToolInvocation.agentInstance, AgentToolInvocation.approvalRequest, AgentToolInvocation.approvalRequestId, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt, AgentToolInvocation.errorCode (+20 more)

### Community 74 - "Channels schema"
Cohesion: 0.08
Nodes (26): ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.id, ChannelScrapeSnapshot.listing, ChannelScrapeSnapshot.listingOption (+18 more)

### Community 75 - "Community 75"
Cohesion: 0.07
Nodes (26): ChannelSkuMappingComponent, ChannelSkuMappingComponentSchema, ChannelSkuMappingCounts, ChannelSkuMappingCountsSchema, ChannelSkuMappingListItem, ChannelSkuMappingListItemSchema, ChannelSkuMappingListResponse, ChannelSkuMappingListResponseSchema (+18 more)

### Community 76 - "Community 76"
Cohesion: 0.14
Nodes (27): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+19 more)

### Community 77 - "Community 77"
Cohesion: 0.11
Nodes (19): aiProductSuggestion(), aiVariantSuggestion(), asRecord(), availabilityListingWhere(), ChannelProductMatchingRepositoryAdapter, completedCatalogRunWhere(), componentSource(), distinctStrings() (+11 more)

### Community 78 - "Orders schema"
Cohesion: 0.09
Nodes (27): Orders, Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.id, Shipment.order (+19 more)

### Community 79 - "Channels schema"
Cohesion: 0.08
Nodes (27): ChannelListingDeletionOperation.authorizationExpiresAt, ChannelListingDeletionOperation.channelAccount, ChannelListingDeletionOperation.channelListing, ChannelListingDeletionOperation.channelListingId, ChannelListingDeletionOperation.completedAt, ChannelListingDeletionOperation.createdAt, ChannelListingDeletionOperation.expectedProviderAccountId, ChannelListingDeletionOperation.externalListingId (+19 more)

### Community 80 - "Channels schema"
Cohesion: 0.08
Nodes (27): CoupangWingSalesRankDailySnapshot.businessDate, CoupangWingSalesRankDailySnapshot.capturedAt, CoupangWingSalesRankDailySnapshot.categoryHierarchy, CoupangWingSalesRankDailySnapshot.collectedCount, CoupangWingSalesRankDailySnapshot.conversionRate28d, CoupangWingSalesRankDailySnapshot.createdAt, CoupangWingSalesRankDailySnapshot.id, CoupangWingSalesRankDailySnapshot.itemId (+19 more)

### Community 81 - "Inventory schema"
Cohesion: 0.07
Nodes (27): SellpiaInventoryState.activeGeneration, SellpiaInventoryState.activeSyncLeaseExpiresAt, SellpiaInventoryState.activeSyncOwner, SellpiaInventoryState.activeSyncOwnerUserId, SellpiaInventoryState.activeSyncStartedAt, SellpiaInventoryState.activeSyncToken, SellpiaInventoryState.createdAt, SellpiaInventoryState.failedGeneration (+19 more)

### Community 82 - "Community 82"
Cohesion: 0.07
Nodes (25): InventoryAvailabilityBatch, InventoryAvailabilityBatchSchema, InventoryCommitmentActorSchema, InventoryCommitmentAllocationRead, InventoryCommitmentAllocationReadSchema, InventoryCommitmentKind, InventoryCommitmentKindSchema, InventoryCommitmentRead (+17 more)

### Community 83 - "Community 83"
Cohesion: 0.12
Nodes (23): AdCampaignAccountProjection, AdCampaignDailyRepairPlan, AdCampaignListingProjection, AdCampaignRepairRunInput, AdCampaignRepairSnapshotInput, AdCampaignTargetProjection, AdMetrics, asRecord() (+15 more)

### Community 84 - "Community 84"
Cohesion: 0.09
Nodes (19): manualMatchAliasCandidates(), aggregateRows(), sameStrings(), strongerMatchedType(), normalizeSellpiaManualMatchAlias(), MAX_SELLPIA_MANUAL_MATCH_ROWS, MAX_SELLPIA_MANUAL_MATCH_TARGETS, SellpiaManualMatchCodeSchema (+11 more)

### Community 85 - "AgentOS schema"
Cohesion: 0.08
Nodes (24): AgentInstance.adapterConfig, AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.icon, AgentInstance.id, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name (+16 more)

### Community 86 - "Advertising schema"
Cohesion: 0.09
Nodes (26): ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task, ExecutionLog.taskId (+18 more)

### Community 87 - "Supply schema"
Cohesion: 0.08
Nodes (26): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+18 more)

### Community 88 - "Community 88"
Cohesion: 0.09
Nodes (9): Inject, ChannelSkuAvailabilityPort, ChannelProductMatchingRepositoryPort, Inject, ChannelSkuAvailabilityService, matchesStatus(), toAvailabilityItem(), Inject (+1 more)

### Community 89 - "Channels schema"
Cohesion: 0.09
Nodes (25): ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isOfferWinner, ChannelListingOptionDailySnapshot.lastObservedAt, ChannelListingOptionDailySnapshot.listing (+17 more)

### Community 90 - "Community 90"
Cohesion: 0.16
Nodes (16): CoupangCredentials, coupangRequest(), CoupangRequestOptions, generateAuthorization(), approveReturn(), confirmOrderSheets(), DELIVERY_COMPANIES, getOrderSheets() (+8 more)

### Community 91 - "AgentOS schema"
Cohesion: 0.09
Nodes (24): AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy, AgentAuthorizationEvent.decidedByUserId, AgentAuthorizationEvent.decision (+16 more)

### Community 92 - "Core schema"
Cohesion: 0.09
Nodes (24): MasterProductAbcEvaluation.calculatedAt, MasterProductAbcEvaluation.confidence, MasterProductAbcEvaluation.contributionRate, MasterProductAbcEvaluation.cumulativeContributionRate, MasterProductAbcEvaluation.eligibilityReason, MasterProductAbcEvaluation.grossCost, MasterProductAbcEvaluation.grossMarginRate, MasterProductAbcEvaluation.grossProfit (+16 more)

### Community 93 - "Community 93"
Cohesion: 0.08
Nodes (22): CoupangDirectCenter, CoupangDirectCenterSchema, CoupangDirectOrderCollectionRequest, CoupangDirectOrderItem, CoupangDirectOrderItemSchema, CoupangDirectOrderStatus, CoupangDirectOrderStatusSchema, CoupangDirectPoSnapshotEntry (+14 more)

### Community 94 - "Community 94"
Cohesion: 0.13
Nodes (12): assertCanonicalCoupangAccountIdentity(), canonicalParentRows(), ChannelCatalogImportRepositoryAdapter, importResponse(), isUniqueConstraintError(), nextPublicationSequence(), Injectable, zeroChanges() (+4 more)

### Community 95 - "System schema"
Cohesion: 0.10
Nodes (23): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.href (+15 more)

### Community 96 - "Advertising schema"
Cohesion: 0.09
Nodes (23): AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+15 more)

### Community 97 - "Orders schema"
Cohesion: 0.10
Nodes (23): OrderReturn.channelAccount, OrderReturn.channelAccountId, OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.id (+15 more)

### Community 98 - "Community 98"
Cohesion: 0.09
Nodes (19): adapterPaths, BROWSER_COLLECTION_ATTENTION_REASONS, BROWSER_COLLECTION_PRODUCERS, BROWSER_COLLECTION_STATES, BrowserCollectionAttentionReasonSchema, BrowserCollectionClassificationSchema, BrowserCollectionCommand, BrowserCollectionCommandSchema (+11 more)

### Community 99 - "Community 99"
Cohesion: 0.22
Nodes (8): ChannelDashboardController, Controller, CurrentOrganization, Get, Query, CoupangDateRangeQueryDto, ChannelDashboardService, Injectable

### Community 100 - "Community 100"
Cohesion: 0.11
Nodes (18): assertActiveCoupangAccount(), assertCanonicalAccount(), ChannelCatalogPublicationRepositoryAdapter, completeCollectionRun(), completedCollectionResult(), flattenMedia(), jsonRecord(), lockAccount() (+10 more)

### Community 101 - "Community 101"
Cohesion: 0.13
Nodes (22): assembleCompleteSnapshot(), assertSameManifest(), buildCollectionStatus(), countMedia(), countOptions(), derivePhase(), firstDate(), hashCatalogChunkPayload() (+14 more)

### Community 102 - "AgentOS schema"
Cohesion: 0.10
Nodes (22): AgentArtifact.agentInstance, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization, AgentArtifact.request (+14 more)

### Community 103 - "Channels schema"
Cohesion: 0.11
Nodes (22): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.channelAccount, ChannelAccountDailyKpiSnapshot.channelAccountId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+14 more)

### Community 104 - "prisma field: PurchaseOrder.supplierId"
Cohesion: 0.11
Nodes (20): PurchaseOrder.supplierId, SupplierPayment.supplierId, SupplierHistoryItem, SupplierHistoryItemSchema, SupplierHistoryReport, SupplierHistoryReportSchema, SupplierHistorySummary, SupplierHistorySummarySchema (+12 more)

### Community 105 - "Supply schema"
Cohesion: 0.11
Nodes (22): RocketPurchaseConfirmationLine.channelListingOption, RocketPurchaseConfirmationLine.channelListingOptionId, RocketPurchaseConfirmationLine.collectedAt, RocketPurchaseConfirmationLine.collectedOrderLineItemId, RocketPurchaseConfirmationLine.confirmation, RocketPurchaseConfirmationLine.confirmationId, RocketPurchaseConfirmationLine.confirmedQuantity, RocketPurchaseConfirmationLine.createdAt (+14 more)

### Community 106 - "Channels schema"
Cohesion: 0.11
Nodes (22): SellpiaProductMonthlySales.buyPrice, SellpiaProductMonthlySales.capturedAt, SellpiaProductMonthlySales.costBasis, SellpiaProductMonthlySales.createdAt, SellpiaProductMonthlySales.id, SellpiaProductMonthlySales.inAmount, SellpiaProductMonthlySales.inQty, SellpiaProductMonthlySales.optionCode (+14 more)

### Community 107 - "Sourcing schema"
Cohesion: 0.11
Nodes (22): TiktokCreativeTrendDailySnapshot.businessDate, TiktokCreativeTrendDailySnapshot.capturedAt, TiktokCreativeTrendDailySnapshot.createdAt, TiktokCreativeTrendDailySnapshot.entityKey, TiktokCreativeTrendDailySnapshot.growthPct, TiktokCreativeTrendDailySnapshot.id, TiktokCreativeTrendDailySnapshot.industry, TiktokCreativeTrendDailySnapshot.label (+14 more)

### Community 108 - "AI schema"
Cohesion: 0.11
Nodes (21): AiDirectJob.attempts, AiDirectJob.claimedAt, AiDirectJob.claimedBy, AiDirectJob.createdAt, AiDirectJob.finishedAt, AiDirectJob.id, AiDirectJob.jobType, AiDirectJob.lastErrorCode (+13 more)

### Community 109 - "System schema"
Cohesion: 0.10
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+13 more)

### Community 110 - "Channels schema"
Cohesion: 0.11
Nodes (21): CoupangKeywordRankDailySnapshot.adRank, CoupangKeywordRankDailySnapshot.businessDate, CoupangKeywordRankDailySnapshot.capturedAt, CoupangKeywordRankDailySnapshot.createdAt, CoupangKeywordRankDailySnapshot.id, CoupangKeywordRankDailySnapshot.itemId, CoupangKeywordRankDailySnapshot.keyword, CoupangKeywordRankDailySnapshot.organicRank (+13 more)

### Community 111 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): LiveCommerceBroadcastDailySnapshot.broadcasterId, LiveCommerceBroadcastDailySnapshot.broadcasterName, LiveCommerceBroadcastDailySnapshot.broadcastId, LiveCommerceBroadcastDailySnapshot.businessDate, LiveCommerceBroadcastDailySnapshot.capturedAt, LiveCommerceBroadcastDailySnapshot.coverImageUrl, LiveCommerceBroadcastDailySnapshot.createdAt, LiveCommerceBroadcastDailySnapshot.endedAt (+13 more)

### Community 112 - "Orders schema"
Cohesion: 0.10
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 113 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): ShortsTrendDailySnapshot.businessDate, ShortsTrendDailySnapshot.capturedAt, ShortsTrendDailySnapshot.channelName, ShortsTrendDailySnapshot.commentCount, ShortsTrendDailySnapshot.createdAt, ShortsTrendDailySnapshot.id, ShortsTrendDailySnapshot.keyword, ShortsTrendDailySnapshot.likeCount (+13 more)

### Community 114 - "AI schema"
Cohesion: 0.10
Nodes (21): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.contentWorkspace, ThumbnailAnalysis.contentWorkspaceId, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id (+13 more)

### Community 115 - "Community 115"
Cohesion: 0.20
Nodes (21): assertSharedDatabaseIdentity(), assertSharedRebuildGuard(), bootstrap(), bootstrapPlanFromCli(), buildSharedBootstrapPlan(), cliValue(), createPrisma(), databaseProjectRef() (+13 more)

### Community 116 - "Community 116"
Cohesion: 0.11
Nodes (9): ChannelAccountListController, Controller, CurrentOrganization, Get, ChannelAccountRepositoryPort, ChannelAccountQueryService, Inject, Injectable (+1 more)

### Community 117 - "Community 117"
Cohesion: 0.10
Nodes (7): ChannelsDeletionPasswordAdapter, Injectable, ChannelsDeletionPasswordPort, ChannelListingRepositoryPort, Inject, Optional, Inject

### Community 118 - "AgentOS schema"
Cohesion: 0.11
Nodes (20): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id, AgentCostEvent.inputTokens (+12 more)

### Community 119 - "Finance schema"
Cohesion: 0.12
Nodes (20): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit (+12 more)

### Community 120 - "Sourcing schema"
Cohesion: 0.12
Nodes (20): Sourcing1688HotProductDailySnapshot.businessDate, Sourcing1688HotProductDailySnapshot.capturedAt, Sourcing1688HotProductDailySnapshot.createdAt, Sourcing1688HotProductDailySnapshot.id, Sourcing1688HotProductDailySnapshot.imageUrl, Sourcing1688HotProductDailySnapshot.monthlySales, Sourcing1688HotProductDailySnapshot.offerId, Sourcing1688HotProductDailySnapshot.organization (+12 more)

### Community 121 - "Community 121"
Cohesion: 0.17
Nodes (20): assertCurrentRebuildBinding(), assertProtectedApiDestination(), assertRebuildImportPrerequisites(), assertReplayCounts(), assertReplayFactDigest(), assertStoredImportBinding(), assertUuid(), bindRebuildImports() (+12 more)

### Community 122 - "Community 122"
Cohesion: 0.21
Nodes (18): analyzePrReleaseContract(), changedFilesFromGit(), classifyFiles(), compareSemver(), deletedFilesFromGit(), ghPrBody(), git(), hasReleaseDecision() (+10 more)

### Community 123 - "Community 123"
Cohesion: 0.11
Nodes (13): ChannelAccountController, Body, Controller, CurrentOrganization, Get, ChannelAccountListItem, ChannelAccountListItemSchema, CoupangAccountSettings (+5 more)

### Community 124 - "AgentOS schema"
Cohesion: 0.12
Nodes (19): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError, AgentTaskSession.lastRun (+11 more)

### Community 125 - "Orders schema"
Cohesion: 0.12
Nodes (19): CoupangDirectPoSnapshot.centerName, CoupangDirectPoSnapshot.channelAccountId, CoupangDirectPoSnapshot.collectedAt, CoupangDirectPoSnapshot.createdAt, CoupangDirectPoSnapshot.deliveryDate, CoupangDirectPoSnapshot.id, CoupangDirectPoSnapshot.isUrgent, CoupangDirectPoSnapshot.itemsJson (+11 more)

### Community 126 - "Supply schema"
Cohesion: 0.12
Nodes (19): PurchaseOrderSubmissionAttempt.createdAt, PurchaseOrderSubmissionAttempt.errorCode, PurchaseOrderSubmissionAttempt.errorMessage, PurchaseOrderSubmissionAttempt.freshnessGeneration, PurchaseOrderSubmissionAttempt.id, PurchaseOrderSubmissionAttempt.idempotencyKey, PurchaseOrderSubmissionAttempt.organization, PurchaseOrderSubmissionAttempt.providerReference (+11 more)

### Community 127 - "Inventory schema"
Cohesion: 0.12
Nodes (19): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.notes, ReturnTransfer.optionName, ReturnTransfer.organization (+11 more)

### Community 128 - "Community 128"
Cohesion: 0.16
Nodes (19): asRecord(), conversionRate(), dailyRawMetricsMatch(), dateStringMatches(), exactHeaderValues(), finiteNumber(), hasExactCoupangAdsDailyRawProvenance(), isExactWholeAccountCampaignRun() (+11 more)

### Community 129 - "Community 129"
Cohesion: 0.19
Nodes (18): assertAllowedArguments(), assertPublishableMain(), copyLoadableExtension(), createArchive(), environmentProfiles, githubReleaseCommand(), gitOutput(), gitSha() (+10 more)

### Community 130 - "Community 130"
Cohesion: 0.11
Nodes (16): CurrentOrganization, Get, Query, AVAILABILITY_STATUSES, ChannelSkuAvailabilityQueryDto, IsIn, IsInt, IsOptional (+8 more)

### Community 131 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.id, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.lastRunId (+10 more)

### Community 132 - "Core schema"
Cohesion: 0.14
Nodes (18): ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id, ChannelAccount.isPrimary, ChannelAccount.name, ChannelAccount.organization (+10 more)

### Community 133 - "Sourcing schema"
Cohesion: 0.14
Nodes (18): LiveCommerceProductDailySnapshot.broadcastId, LiveCommerceProductDailySnapshot.businessDate, LiveCommerceProductDailySnapshot.capturedAt, LiveCommerceProductDailySnapshot.createdAt, LiveCommerceProductDailySnapshot.id, LiveCommerceProductDailySnapshot.imageUrl, LiveCommerceProductDailySnapshot.organization, LiveCommerceProductDailySnapshot.priceCny (+10 more)

### Community 134 - "Sourcing schema"
Cohesion: 0.13
Nodes (18): NaverKeywordDailySnapshot.averageAdRank, NaverKeywordDailySnapshot.businessDate, NaverKeywordDailySnapshot.capturedAt, NaverKeywordDailySnapshot.competitionIndex, NaverKeywordDailySnapshot.createdAt, NaverKeywordDailySnapshot.id, NaverKeywordDailySnapshot.keyword, NaverKeywordDailySnapshot.monthlyMobileSearchCount (+10 more)

### Community 135 - "Channels schema"
Cohesion: 0.14
Nodes (18): RocketPoCatalogSnapshot.channelAccount, RocketPoCatalogSnapshot.channelAccountId, RocketPoCatalogSnapshot.collectionRunId, RocketPoCatalogSnapshot.createdAt, RocketPoCatalogSnapshot.detailPoCount, RocketPoCatalogSnapshot.id, RocketPoCatalogSnapshot.listPagesRead, RocketPoCatalogSnapshot.organization (+10 more)

### Community 136 - "Channels schema"
Cohesion: 0.12
Nodes (18): RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt, RocketPurchaseOrder.firstSkuName, RocketPurchaseOrder.id, RocketPurchaseOrder.items, RocketPurchaseOrder.orderAmount, RocketPurchaseOrder.orderedAt (+10 more)

### Community 137 - "Inventory schema"
Cohesion: 0.12
Nodes (18): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.fromWarehouseId, StockTransfer.id, StockTransfer.notes, StockTransfer.optionName, StockTransfer.organization (+10 more)

### Community 138 - "Community 138"
Cohesion: 0.11
Nodes (16): CANCEL_OPERATION_TARGET_TYPES, CancelOperationAffected, CancelOperationAffectedSchema, CancelOperationPreserved, CancelOperationPreservedSchema, CancelOperationResponse, CancelOperationResponseSchema, CancelOperationStatus (+8 more)

### Community 139 - "Community 139"
Cohesion: 0.18
Nodes (8): ChannelCatalogCollectionRepositoryAdapter, isUniqueConstraintError(), ownedRunWhere(), Injectable, ChannelCatalogCollectionChunkRecord, ChannelCatalogCollectionRunRecord, ChannelCatalogCollectionWithChunks, startRun()

### Community 140 - "Core schema"
Cohesion: 0.12
Nodes (15): MasterProductAbcPolicy.aCumulativeThreshold, MasterProductAbcPolicy.bCumulativeThreshold, MasterProductAbcPolicy.createdAt, MasterProductAbcPolicy.id, MasterProductAbcPolicy.lastCalculatedAt, MasterProductAbcPolicy.metric, MasterProductAbcPolicy.minClassifiedMonths, MasterProductAbcPolicy.minProvisionalMonths (+7 more)

### Community 141 - "Supply schema"
Cohesion: 0.13
Nodes (16): Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.id, Supplier.leadTimeDays, Supplier.name, Supplier.notes (+8 more)

### Community 142 - "Community 142"
Cohesion: 0.22
Nodes (17): assertBootstrapPreflightManifest(), assertIsoTimestamp(), assertPositiveIntegerText(), assertPostgresUuid(), assertStagingAccountBaselineManifest(), assertUnique(), buildBootstrapPreflightManifest(), buildChannelAccountFingerprint() (+9 more)

### Community 143 - "Community 143"
Cohesion: 0.23
Nodes (5): Inject, ChannelCatalogCollectionPort, ChannelCatalogCollectionService, parseRequest(), Injectable

### Community 144 - "AgentOS schema"
Cohesion: 0.15
Nodes (16): AgentRunEvent.agentInstance, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message, AgentRunEvent.organization (+8 more)

### Community 145 - "Channels schema"
Cohesion: 0.16
Nodes (16): ChannelScrapeChunk.checksum, ChannelScrapeChunk.createdAt, ChannelScrapeChunk.id, ChannelScrapeChunk.itemCount, ChannelScrapeChunk.kind, ChannelScrapeChunk.organization, ChannelScrapeChunk.payload, ChannelScrapeChunk.publicationJson (+8 more)

### Community 146 - "Inventory schema"
Cohesion: 0.13
Nodes (16): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.organization, PickingItem.pickedAt, PickingItem.pickingList (+8 more)

### Community 147 - "Inventory schema"
Cohesion: 0.15
Nodes (16): PickingItem.pickingListId, PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.id, PickingList.listNumber, PickingList.organization, PickingList.pickedItems (+8 more)

### Community 148 - "Supply schema"
Cohesion: 0.16
Nodes (16): RocketPurchaseConfirmationTransmission.confirmation, RocketPurchaseConfirmationTransmission.confirmationId, RocketPurchaseConfirmationTransmission.createdAt, RocketPurchaseConfirmationTransmission.id, RocketPurchaseConfirmationTransmission.intentKey, RocketPurchaseConfirmationTransmission.matchedLineCount, RocketPurchaseConfirmationTransmission.observedAt, RocketPurchaseConfirmationTransmission.organization (+8 more)

### Community 149 - "Supply schema"
Cohesion: 0.13
Nodes (16): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.dueDate, SupplierPayment.id, SupplierPayment.notes, SupplierPayment.organization, SupplierPayment.paidAmount, SupplierPayment.paidDate (+8 more)

### Community 150 - "Supply schema"
Cohesion: 0.16
Nodes (16): SupplierProduct.createdAt, SupplierProduct.id, SupplierProduct.isPrimary, SupplierProduct.memo, SupplierProduct.minOrderQty, SupplierProduct.organization, SupplierProduct.sellpiaInventorySku, SupplierProduct.sellpiaInventorySkuId (+8 more)

### Community 151 - "Orders schema"
Cohesion: 0.13
Nodes (16): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.externalSku, UnshippedItem.id, UnshippedItem.isNotified, UnshippedItem.notifiedAt, UnshippedItem.optionName, UnshippedItem.order (+8 more)

### Community 152 - "Community 152"
Cohesion: 0.24
Nodes (14): analyzeReconstructionTriggers(), changedFilesFromGit(), ghPrBody(), git(), isCrossLayerControlChange(), isHighRiskBoundary(), isLargeServiceOrComponent(), layerOf() (+6 more)

### Community 153 - "Community 153"
Cohesion: 0.28
Nodes (10): ChannelCatalogCollectionController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+2 more)

### Community 154 - "Community 154"
Cohesion: 0.14
Nodes (14): applyProductLinksInBatches(), applyVariantLinksInBatches(), buildCatalogProductProvisioningListings(), publishCatalogOperationalProducts(), unique(), validateProvisionedLinks(), nextPublicationSequence(), productsFromRows() (+6 more)

### Community 155 - "Orders schema"
Cohesion: 0.14
Nodes (15): CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing (+7 more)

### Community 156 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 157 - "Finance schema"
Cohesion: 0.14
Nodes (15): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.id, ProcessingCost.master, ProcessingCost.notes, ProcessingCost.organization, ProcessingCost.processType, ProcessingCost.productName (+7 more)

### Community 158 - "Finance schema"
Cohesion: 0.15
Nodes (15): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.organization, SalesPlan.period (+7 more)

### Community 159 - "Inventory schema"
Cohesion: 0.14
Nodes (15): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.sourceRef, SellpiaReceiptUploadBatch.sourceType (+7 more)

### Community 160 - "Channels schema"
Cohesion: 0.16
Nodes (15): SellpiaSalesDailySnapshot.businessDate, SellpiaSalesDailySnapshot.capturedAt, SellpiaSalesDailySnapshot.channelGroup, SellpiaSalesDailySnapshot.costKrw, SellpiaSalesDailySnapshot.createdAt, SellpiaSalesDailySnapshot.id, SellpiaSalesDailySnapshot.organization, SellpiaSalesDailySnapshot.qty (+7 more)

### Community 161 - "Inventory schema"
Cohesion: 0.15
Nodes (15): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items, StockAudit.matchedCount (+7 more)

### Community 162 - "Inventory schema"
Cohesion: 0.16
Nodes (15): Warehouse.address, Warehouse.code, Warehouse.createdAt, Warehouse.id, Warehouse.isDefault, Warehouse.manager, Warehouse.name, Warehouse.organization (+7 more)

### Community 163 - "Community 163"
Cohesion: 0.19
Nodes (12): SELLPIA_WORKBOOK_ACCEPT, SELLPIA_WORKBOOK_FILE_EXTENSIONS, SELLPIA_WORKBOOK_FORMAT_LABEL, SellpiaReceiptBatchCreateInput, SellpiaReceiptBatchCreateInputSchema, SellpiaReceiptBatchMarkUploadedInput, SellpiaReceiptBatchMarkUploadedInputSchema, SellpiaReceiptUploadBatch (+4 more)

### Community 164 - "Community 164"
Cohesion: 0.14
Nodes (12): checkSellpiaCutoverPreflight(), createPrisma(), main(), MAX_SELLPIA_CUTOVER_EXAMPLES, ReadonlyQueryClient, runSellpiaCutoverPreflight(), SELLPIA_CUTOVER_PREFLIGHT_SCHEMA_VERSION, SELLPIA_CUTOVER_TARGET_RELEASE (+4 more)

### Community 165 - "Finance schema"
Cohesion: 0.15
Nodes (14): Finance, GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.listing, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization (+6 more)

### Community 166 - "Advertising schema"
Cohesion: 0.15
Nodes (14): ExecutionTask.workerId, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentTaskRef, ExecutionWorker.currentUrl, ExecutionWorker.id, ExecutionWorker.label, ExecutionWorker.lastHeartbeatAt (+6 more)

### Community 167 - "System schema"
Cohesion: 0.15
Nodes (12): FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name, FeatureGate.updatedAt (+4 more)

### Community 168 - "Finance schema"
Cohesion: 0.15
Nodes (14): ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description, ManualLedger.id (+6 more)

### Community 169 - "Community 169"
Cohesion: 0.26
Nodes (14): asRecord(), assertNoPii(), boundedReplayScope(), buildReplayBody(), buildReplayKpis(), cloneReplayValue(), containsPiiValue(), copyString() (+6 more)

### Community 170 - "Supply schema"
Cohesion: 0.19
Nodes (13): Supply, RocketPurchaseConfirmationAllocation.confirmationLine, RocketPurchaseConfirmationAllocation.confirmationLineId, RocketPurchaseConfirmationAllocation.createdAt, RocketPurchaseConfirmationAllocation.id, RocketPurchaseConfirmationAllocation.organization, RocketPurchaseConfirmationAllocation.quantity, RocketPurchaseConfirmationAllocation.sellpiaInventorySku (+5 more)

### Community 171 - "Channels schema"
Cohesion: 0.19
Nodes (13): CoupangKeywordSerpDailySnapshot.businessDate, CoupangKeywordSerpDailySnapshot.capturedAt, CoupangKeywordSerpDailySnapshot.createdAt, CoupangKeywordSerpDailySnapshot.id, CoupangKeywordSerpDailySnapshot.itemCount, CoupangKeywordSerpDailySnapshot.items, CoupangKeywordSerpDailySnapshot.keyword, CoupangKeywordSerpDailySnapshot.organization (+5 more)

### Community 172 - "Core schema"
Cohesion: 0.17
Nodes (13): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+5 more)

### Community 173 - "Channels schema"
Cohesion: 0.18
Nodes (13): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson, RocketSupplyDailySnapshot.revenueKrw (+5 more)

### Community 174 - "Community 174"
Cohesion: 0.29
Nodes (13): assertAllowedRecord(), assertAllowedRows(), assertAllowedScalarRecord(), assertObservedMetrics(), assertOptionalScalar(), assertPlainRecord(), assertReplayBundle(), assertReplayFactCounts() (+5 more)

### Community 175 - "Community 175"
Cohesion: 0.31
Nodes (11): analyzeSchemaArtifactSync(), changedFilesFromGit(), changedFilesFromWorkingTree(), GENERATED_ARTIFACT_PATHS, git(), main(), matchesAnyPath(), mergeChangedFiles() (+3 more)

### Community 176 - "Core schema"
Cohesion: 0.20
Nodes (12): Core, CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.keywords, CategoryMapping.organization (+4 more)

### Community 177 - "Inventory schema"
Cohesion: 0.20
Nodes (12): Inventory, CoupangShipmentDateSummary.boxes, CoupangShipmentDateSummary.capturedAt, CoupangShipmentDateSummary.count, CoupangShipmentDateSummary.createdAt, CoupangShipmentDateSummary.id, CoupangShipmentDateSummary.organization, CoupangShipmentDateSummary.shipmentDate (+4 more)

### Community 178 - "Channels schema"
Cohesion: 0.20
Nodes (12): CoupangKeywordTracker.createdAt, CoupangKeywordTracker.enabled, CoupangKeywordTracker.id, CoupangKeywordTracker.keyword, CoupangKeywordTracker.lastCapturedAt, CoupangKeywordTracker.maxPages, CoupangKeywordTracker.organization, CoupangKeywordTracker.updatedAt (+4 more)

### Community 179 - "Inventory schema"
Cohesion: 0.21
Nodes (12): InventoryCommitmentAllocation.commitment, InventoryCommitmentAllocation.commitmentId, InventoryCommitmentAllocation.createdAt, InventoryCommitmentAllocation.id, InventoryCommitmentAllocation.organization, InventoryCommitmentAllocation.quantity, InventoryCommitmentAllocation.sellpiaInventorySku, InventoryCommitmentAllocation.sellpiaInventorySkuId (+4 more)

### Community 180 - "Core schema"
Cohesion: 0.18
Nodes (12): MasterProductAbcGradeHistory.calculatedAt, MasterProductAbcGradeHistory.id, MasterProductAbcGradeHistory.masterProduct, MasterProductAbcGradeHistory.masterProductId, MasterProductAbcGradeHistory.metric, MasterProductAbcGradeHistory.metricValue, MasterProductAbcGradeHistory.newGrade, MasterProductAbcGradeHistory.oldGrade (+4 more)

### Community 181 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 182 - "Community 182"
Cohesion: 0.24
Nodes (10): appendValues(), parseArgs(), parseArgs(), ParsedArgs, parseRawArgs(), ParseRawArgsOptions, pushValue(), values() (+2 more)

### Community 183 - "Community 183"
Cohesion: 0.18
Nodes (3): ChannelCatalogCollectionRepositoryPort, ChannelCatalogPublicationPort, Inject

### Community 184 - "System schema"
Cohesion: 0.20
Nodes (11): ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization, ActivityEvent.source (+3 more)

### Community 185 - "Supply schema"
Cohesion: 0.20
Nodes (11): PurchaseOrderItem.createdAt, PurchaseOrderItem.id, PurchaseOrderItem.order, PurchaseOrderItem.organization, PurchaseOrderItem.productName, PurchaseOrderItem.quantity, PurchaseOrderItem.sellpiaInventorySku, PurchaseOrderItem.sellpiaInventorySkuId (+3 more)

### Community 186 - "Community 186"
Cohesion: 0.20
Nodes (10): canRetryChannelListingDeletionProviderSideEffect(), canRetryProviderSideEffect(), isOperationTerminal(), OPERATION_STATUSES, OperationStatus, OperationStatusSchema, PROVIDER_OUTCOMES, ProviderOutcome (+2 more)

### Community 187 - "Community 187"
Cohesion: 0.22
Nodes (8): CoupangCategorySuggestion, CoupangCategorySuggestionRequest, CoupangCategorySuggestionRequestSchema, CoupangCategorySuggestionResponse, CoupangCategorySuggestionResponseSchema, CoupangCategorySuggestionResult, CoupangCategorySuggestionResultSchema, CoupangCategorySuggestionSchema

### Community 188 - "Community 188"
Cohesion: 0.45
Nodes (7): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), REDACTED_PLACEHOLDER, scrubDeep(), scrubSecrets(), walk()

### Community 189 - "Community 189"
Cohesion: 0.38
Nodes (9): checkTrackedClaudeDirectory(), findClaudeShimFindings(), findInstructionChainSizeFindings(), findStaleInstructionLines(), git(), listRepositoryFiles(), listTracked(), main() (+1 more)

### Community 190 - "Community 190"
Cohesion: 0.35
Nodes (9): analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), directOutPortFiles(), FORBIDDEN_IN_PORT_FOLDER_NAMES, forbiddenInPortCallerFolders(), listDirectories(), listFiles(), main() (+1 more)

### Community 191 - "Advertising schema"
Cohesion: 0.22
Nodes (10): Advertising, ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.id, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.url (+2 more)

### Community 192 - "System schema"
Cohesion: 0.24
Nodes (10): System, SystemSetting.createdAt, SystemSetting.id, SystemSetting.key, SystemSetting.organization, SystemSetting.updatedAt, SystemSetting.value, SystemSetting (+2 more)

### Community 193 - "Community 193"
Cohesion: 0.20
Nodes (6): ErrorCodes, deletedLegacyTables, repoRoot, retiredBaselineScript, retiredImporterFile, retiredPlannerFile

### Community 194 - "Community 194"
Cohesion: 0.38
Nodes (8): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), main(), parseBaseline(), readFiles(), repoRoot(), walk()

### Community 195 - "Community 195"
Cohesion: 0.22
Nodes (5): RocketAccountController, Controller, CurrentOrganization, Post, ChannelAccountListRow

### Community 196 - "Community 196"
Cohesion: 0.25
Nodes (5): ChannelsOperationAlertAdapter, Inject, Injectable, OperationLifecyclePatch, StartOperationAlertInput

### Community 198 - "Channels schema"
Cohesion: 0.25
Nodes (9): Channels, CoupangRepresentativeKeywordOverride.createdAt, CoupangRepresentativeKeywordOverride.id, CoupangRepresentativeKeywordOverride.keyword, CoupangRepresentativeKeywordOverride.organization, CoupangRepresentativeKeywordOverride.updatedAt, CoupangRepresentativeKeywordOverride, coupang_representative_keyword_overrides (+1 more)

### Community 199 - "Core schema"
Cohesion: 0.25
Nodes (9): AuthSession.createdAt, AuthSession.expiresAt, AuthSession.id, AuthSession.revokedAt, AuthSession.tokenHash, AuthSession.user, AuthSession.userId, AuthSession (+1 more)

### Community 200 - "Community 200"
Cohesion: 0.22
Nodes (7): ReadinessCheck, ReadinessCheckSchema, ReadinessCheckStatusSchema, ReadinessResponse, ReadinessResponseSchema, RebuildReadinessResponse, RebuildReadinessResponseSchema

### Community 201 - "Community 201"
Cohesion: 0.22
Nodes (9): assertLocalRebuildGuard(), assertLocalDevelopmentDatabase(), bootstrapAuthoritativeInventoryDevelopment(), buildBootstrapPlan(), LOCAL_HOSTS, main(), optionalUuid(), parseBootstrapArgs() (+1 more)

### Community 202 - "Community 202"
Cohesion: 0.31
Nodes (9): addExactHeaderEvidence(), asRecord(), CONVERSION_COUNT_HEADERS, normalizeHeader(), parseObservedCount(), recoverObservedCampaignTargetConversions(), resolveRevenueShapedCampaignTargetConversion(), roundedNumber() (+1 more)

### Community 203 - "Community 203"
Cohesion: 0.25
Nodes (6): extractFunction(), extractRetireFunction(), productionWrapper, remote, repoRoot, workflow

### Community 204 - "Community 204"
Cohesion: 0.46
Nodes (6): analyzeInventory(), listTopLevelScriptFiles(), main(), repoRoot(), SCRIPT_INVENTORY, SUPPORT_FILES

### Community 205 - "Community 205"
Cohesion: 0.25
Nodes (4): repoRoot, scriptPath, supportedExtensions, temporaryDirectories

### Community 206 - "Community 206"
Cohesion: 0.29
Nodes (6): CurrentOrganization, CurrentUser, Param, Post, UploadedFile, UseInterceptors

### Community 207 - "Community 207"
Cohesion: 0.33
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 208 - "Community 208"
Cohesion: 0.47
Nodes (3): PRODUCT_LIFECYCLE_STATES, ProductLifecycleState, ProductLifecycleStateSchema

### Community 209 - "Community 209"
Cohesion: 0.40
Nodes (5): isoDay(), listSavedRocketPos(), requiredSavedValue(), ROCKET_CONFIRMATION_REQUEST_STATUSES, toCatalogRow()

### Community 211 - "Community 211"
Cohesion: 0.40
Nodes (5): asRecord(), buildCampaignQualifiedProductTargetKeys(), cleanString(), rawCampaignAnchor(), rawProductAnchor()

### Community 212 - "Community 212"
Cohesion: 0.50
Nodes (4): fileHash(), importInput(), makeRow(), representativeRows()

### Community 215 - "Community 215"
Cohesion: 0.50
Nodes (4): is_allowlisted(), is_comment_line(), load_file_lines(), check-tenant-scope.sh script

### Community 216 - "Community 216"
Cohesion: 0.50
Nodes (4): extractEnvKeys(), readModelFile(), redactEnvText(), redactEnvValues()

### Community 217 - "Community 217"
Cohesion: 1.00
Nodes (3): makeRepository(), runRecord(), runWithChunks()

## Knowledge Gaps
- **2927 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+2922 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Core schema` to `prisma field: prisma — Shared Schema`, `Community 1`, `prisma field: externalOptionId canonical option identity`, `Orders schema`, `Community 4`, `Core schema`, `Community 6`, `Community 9`, `Core schema`, `AI schema`, `AI schema`, `AI schema`, `Channels schema`, `Community 19`, `Community 20`, `AI schema`, `prisma field: channels — Marketplace Sync + SKU Matching`, `AI schema`, `AI schema`, `AI schema`, `AgentOS schema`, `Orders schema`, `AgentOS schema`, `Orders schema`, `Sourcing schema`, `Channels schema`, `Community 36`, `AI schema`, `Sourcing schema`, `Sourcing schema`, `Core schema`, `Orders schema`, `prisma field: ActionTask.targetId`, `AI schema`, `Channels schema`, `Sourcing schema`, `Core schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Core schema`, `Channels schema`, `Supply schema`, `Channels schema`, `AgentOS schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Orders schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Community 83`, `AgentOS schema`, `Supply schema`, `Channels schema`, `AgentOS schema`, `Core schema`, `System schema`, `Advertising schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `Supply schema`, `Channels schema`, `Sourcing schema`, `AI schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Orders schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `Finance schema`, `Sourcing schema`, `AgentOS schema`, `Orders schema`, `Supply schema`, `Inventory schema`, `AgentOS schema`, `Core schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Core schema`, `Supply schema`, `AgentOS schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Supply schema`, `Supply schema`, `Orders schema`, `Orders schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Community 164`, `Finance schema`, `Advertising schema`, `System schema`, `Finance schema`, `Supply schema`, `Channels schema`, `Core schema`, `Channels schema`, `Core schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Core schema`, `System schema`, `Supply schema`, `Advertising schema`, `System schema`, `Community 195`, `Channels schema`?**
  _High betweenness centrality (0.214) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `Orders schema` to `prisma field: prisma — Shared Schema`, `prisma field: externalOptionId canonical option identity`, `Core schema`, `Core schema`, `Core schema`, `AI schema`, `AI schema`, `AI schema`, `Channels schema`, `AI schema`, `prisma field: channels — Marketplace Sync + SKU Matching`, `AI schema`, `System schema`, `AI schema`, `AI schema`, `AgentOS schema`, `Orders schema`, `AgentOS schema`, `Orders schema`, `Sourcing schema`, `Channels schema`, `AI schema`, `Sourcing schema`, `Sourcing schema`, `Core schema`, `Orders schema`, `prisma field: ActionTask.targetId`, `AI schema`, `Channels schema`, `Sourcing schema`, `Core schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Core schema`, `Channels schema`, `Supply schema`, `Channels schema`, `AgentOS schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Orders schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `AgentOS schema`, `Advertising schema`, `Supply schema`, `Channels schema`, `AgentOS schema`, `Core schema`, `System schema`, `Advertising schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `prisma field: PurchaseOrder.supplierId`, `Supply schema`, `Channels schema`, `Sourcing schema`, `AI schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Orders schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `Finance schema`, `Sourcing schema`, `AgentOS schema`, `Orders schema`, `Supply schema`, `Inventory schema`, `AgentOS schema`, `Core schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Core schema`, `Supply schema`, `AgentOS schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Supply schema`, `Supply schema`, `Orders schema`, `Orders schema`, `System schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Finance schema`, `Advertising schema`, `System schema`, `Finance schema`, `Supply schema`, `Channels schema`, `Core schema`, `Channels schema`, `Core schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Core schema`, `System schema`, `System schema`, `Supply schema`, `Advertising schema`, `System schema`, `Channels schema`, `Core schema`?**
  _High betweenness centrality (0.170) - this node is a cross-community bridge._
- **Why does `Order` connect `Orders schema` to `prisma field: prisma — Shared Schema`, `Community 1`, `prisma field: externalOptionId canonical option identity`, `Orders schema`, `Core schema`, `Community 4`, `Core schema`, `Community 8`, `Core schema`, `Community 11`, `Community 15`, `Community 17`, `Community 18`, `Community 20`, `Community 22`, `prisma field: channels — Marketplace Sync + SKU Matching`, `Orders schema`, `AI schema`, `System schema`, `Orders schema`, `Community 25`, `AI schema`, `Orders schema`, `Orders schema`, `Community 36`, `Community 164`, `Core schema`, `Community 45`, `prisma field: ActionTask.targetId`, `Community 175`, `Core schema`, `Community 58`, `Community 190`, `Community 203`, `Community 204`, `Orders schema`, `Community 210`, `Community 82`, `Community 83`, `Community 90`, `Community 93`, `Orders schema`, `Community 98`, `prisma field: PurchaseOrder.supplierId`, `Orders schema`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Are the 201 inferred relationships involving `Organization` (e.g. with `channel-registration-capability.adapter.spec.ts` and `channel-registration-capability.adapter.ts`) actually correct?**
  _`Organization` has 201 INFERRED edges - model-reasoned connections that need verification._
- **Are the 148 inferred relationships involving `ChannelAccount` (e.g. with `channel-registration-capability.adapter.spec.ts` and `channel-registration-capability.adapter.ts`) actually correct?**
  _`ChannelAccount` has 148 INFERRED edges - model-reasoned connections that need verification._
- **Are the 109 inferred relationships involving `ChannelListing` (e.g. with `channel-registration-capability.adapter.ts` and `channel-listing.controller.ts`) actually correct?**
  _`ChannelListing` has 109 INFERRED edges - model-reasoned connections that need verification._
- **Are the 141 inferred relationships involving `Order` (e.g. with `channel-sync.controller.ts` and `dto/index.ts`) actually correct?**
  _`Order` has 141 INFERRED edges - model-reasoned connections that need verification._