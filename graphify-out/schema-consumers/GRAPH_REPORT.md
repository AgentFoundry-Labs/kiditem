# Graph Report - schema-consumers  (2026-07-31)

## Corpus Check
- 433 files · ~228,128 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 6558 nodes · 39147 edges · 229 communities (212 shown, 17 thin omitted)
- Extraction: 30% EXTRACTED · 70% INFERRED · 0% AMBIGUOUS · INFERRED: 27333 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- prisma field: prisma — Shared Schema
- Orders schema
- Community 2
- prisma field: externalOptionId canonical option identity
- prisma field: AdAction.listingId
- Community 5
- Core schema
- prisma field: channels — Marketplace Sync + SKU Matching
- Community 8
- Community 9
- Community 10
- Core schema
- Core schema
- Community 13
- AI schema
- Orders schema
- AI schema
- Community 17
- Inventory schema
- Core schema
- AI schema
- Channels schema
- Community 22
- Community 23
- Community 24
- AI schema
- AI schema
- Community 27
- Community 28
- Orders schema
- Community 30
- Community 31
- Inventory schema
- AgentOS schema
- AgentOS schema
- Sourcing schema
- Community 36
- System schema
- Community 38
- Channels schema
- AI schema
- Community 41
- AI schema
- Community 43
- Advertising schema
- Sourcing schema
- Community 46
- Community 47
- Community 48
- prisma field: ActionTask.targetId
- Core schema
- AI schema
- AI schema
- Channels schema
- Community 54
- Community 55
- Community 56
- Sourcing schema
- AgentOS schema
- AgentOS schema
- Inventory schema
- Community 61
- Community 62
- Supply schema
- Channels schema
- Channels schema
- Community 66
- Community 67
- Inventory schema
- Community 69
- Community 70
- AgentOS schema
- Community 72
- System schema
- AgentOS schema
- AgentOS schema
- Channels schema
- Community 77
- Community 78
- Community 79
- Channels schema
- Channels schema
- Inventory schema
- Community 83
- Community 84
- Community 85
- Supply schema
- Community 87
- Community 88
- Community 89
- Community 90
- Channels schema
- AgentOS schema
- Community 93
- Community 94
- System schema
- Advertising schema
- AgentOS schema
- Orders schema
- Community 99
- Community 100
- Community 101
- Channels schema
- Orders schema
- Supply schema
- Sourcing schema
- Community 106
- System schema
- AgentOS schema
- AI schema
- System schema
- Channels schema
- Sourcing schema
- Orders schema
- Sourcing schema
- Community 115
- Community 116
- Community 117
- Community 118
- AgentOS schema
- Finance schema
- Channels schema
- Sourcing schema
- Community 123
- Community 124
- Community 125
- AgentOS schema
- Orders schema
- Supply schema
- Inventory schema
- Community 130
- Community 131
- Community 132
- Community 133
- Community 134
- AgentOS schema
- Sourcing schema
- Sourcing schema
- Channels schema
- Channels schema
- Community 140
- Community 141
- Supply schema
- Community 143
- Community 144
- Community 145
- AgentOS schema
- Channels schema
- Supply schema
- Orders schema
- Supply schema
- Supply schema
- Orders schema
- Community 153
- Community 154
- Finance schema
- Orders schema
- System schema
- Core schema
- Sourcing schema
- Finance schema
- Finance schema
- Channels schema
- Channels schema
- Channels schema
- Inventory schema
- Advertising schema
- System schema
- Community 168
- Community 169
- Community 170
- Community 171
- Supply schema
- Channels schema
- Core schema
- Channels schema
- Community 176
- Community 177
- Orders schema
- Channels schema
- Inventory schema
- Core schema
- System schema
- Community 183
- Sourcing schema
- Core schema
- Supply schema
- Sourcing schema
- Community 188
- Community 189
- Community 190
- Community 191
- Community 192
- Community 193
- Community 194
- Community 195
- Channels schema
- Core schema
- Community 198
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

## God Nodes (most connected - your core abstractions)
1. `Organization` - 476 edges
2. `Database ERD` - 385 edges
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

## Communities (229 total, 17 thin omitted)

### Community 0 - "prisma field: prisma — Shared Schema"
Cohesion: 0.14
Nodes (285): UploadedWorkbookFile, HEADERS, USER, CHANNEL_ACCOUNT_LIST_SELECT, chunkSelect, ErrorInput, LockedRun, OwnedRunInput (+277 more)

### Community 1 - "Orders schema"
Cohesion: 0.03
Nodes (136): ListingForProductSync, normalizeCoupangOrderStatus(), normalizeCoupangProductStatus(), vendorItemId provider term, Database ERD, AdAction.listingOptionId, AgentApprovalRequest.agentInstanceId, AgentArtifact.agentInstanceId (+128 more)

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (138): ActionTask, ActionTaskExecuteResponse, ActionTaskList, ActionTaskListSchema, ActionTaskRelatedProduct, ActionTaskRelatedProductSchema, ActionTaskSchema, ActionTaskSourceAlert (+130 more)

### Community 3 - "prisma field: externalOptionId canonical option identity"
Cohesion: 0.06
Nodes (85): ChannelCatalogIdentityMedia, ChannelCatalogIdentityOption, ChannelCatalogIdentityProduct, ChannelCatalogIdentityUpsertInput, ChannelCatalogIdentityUpsertResult, PersistedChannelCatalogListing, upsertChannelCatalogIdentities(), CanonicalParent (+77 more)

### Community 4 - "prisma field: AdAction.listingId"
Cohesion: 0.05
Nodes (78): aggregateMappingStatus(), assertLockedListing(), assertOperationActor(), ChannelListingRepositoryAdapter, contains(), firstPrice(), isUniqueViolation(), ListingRow (+70 more)

### Community 5 - "Community 5"
Cohesion: 0.02
Nodes (101): AgentApprovalRequestSummary, AgentApprovalRequestSummarySchema, AgentApprovalStatus, AgentApprovalStatusSchema, AgentArtifactHandoffSummary, AgentArtifactHandoffSummarySchema, AgentArtifactStatus, AgentArtifactStatusSchema (+93 more)

### Community 6 - "Core schema"
Cohesion: 0.03
Nodes (61): Organization.createdAt, Organization.id, Organization.name, Organization.slug, Organization.updatedAt, Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr (+53 more)

### Community 7 - "prisma field: channels — Marketplace Sync + SKU Matching"
Cohesion: 0.04
Nodes (58): buildCoupangWingSnapshotCoverage(), CoupangWingSnapshotCoverage, ParsedWingCatalogRow, ParsedWingCatalogSkippedRow, ChannelProductCandidate, ChannelProductCandidateRankingInput, emptyEvidence(), keep() (+50 more)

### Community 8 - "Community 8"
Cohesion: 0.03
Nodes (78): AdMetricsDetail, AdMetricsDetailSchema, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary, DashboardAdSummarySchema (+70 more)

### Community 9 - "Community 9"
Cohesion: 0.03
Nodes (71): CreateMasterProductInput, CreateMasterProductInputSchema, CreateProductVariantFieldsSchema, CreateProductVariantInput, CreateProductVariantInputSchema, CreateProductVariantRecipeIfEmptySchema, CreateProductVariantRecipesIfEmptyInput, CreateProductVariantRecipesIfEmptyInputSchema (+63 more)

### Community 10 - "Community 10"
Cohesion: 0.07
Nodes (68): option(), AdapterCommand, appendFlag(), appendOption(), appendProjectReferenceDefaults(), appendValues(), archiveFileName(), archiveShaFileName() (+60 more)

### Community 11 - "Core schema"
Cohesion: 0.03
Nodes (63): ContentGeneration.triggeredByUserId, InventoryCommitment.businessKey, InventoryCommitment.createdAt, InventoryCommitment.createdBy, InventoryCommitment.creator, InventoryCommitment.id, InventoryCommitment.inventoryGeneration, InventoryCommitment.kind (+55 more)

### Community 12 - "Core schema"
Cohesion: 0.04
Nodes (64): ChannelRecipeAutomationProductTopology, classifyRecipeAutomationProductGroups(), groupDecision(), autoItem, configuredItem, quantityReviewItem, reviewItem, Core (+56 more)

### Community 13 - "Community 13"
Cohesion: 0.05
Nodes (47): ChannelCatalogImportController, Controller, Inject, ChannelSkuAvailabilityController, Controller, ChannelRecipeAutomationContextRepositoryAdapter, recipeSource(), Injectable (+39 more)

### Community 14 - "AI schema"
Cohesion: 0.04
Nodes (62): ContentAsset.originGenerationGroupId, ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.editedHtmlSavedAt (+54 more)

### Community 15 - "Orders schema"
Cohesion: 0.04
Nodes (56): GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.listing, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization, GradeHistory.reason (+48 more)

### Community 16 - "AI schema"
Cohesion: 0.04
Nodes (59): ProductPreparation.selectedThumbnailGenerationId, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.contentWorkspaceId, ThumbnailGeneration.createdAt, ThumbnailGeneration.deletedAt, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.errorMessage (+51 more)

### Community 17 - "Community 17"
Cohesion: 0.04
Nodes (54): ChunkRequestBaseSchema, COUPANG_CATALOG_BROWSER_FILE_NAME, COUPANG_CATALOG_COLLECTOR_VERSION, COUPANG_CATALOG_MAX_CHUNK_BYTES, COUPANG_CATALOG_MAX_MEDIA_PER_OWNER, COUPANG_CATALOG_MAX_OPTIONS_PER_PRODUCT, COUPANG_CATALOG_MAX_PRODUCT_BYTES, COUPANG_CATALOG_MAX_PRODUCTS_PER_CHUNK (+46 more)

### Community 18 - "Inventory schema"
Cohesion: 0.04
Nodes (52): SellpiaInventorySku.code, SellpiaInventorySku.createdAt, SellpiaInventorySku.currentStock, SellpiaInventorySku.id, SellpiaInventorySku.lastImportRun, SellpiaInventorySku.lastImportRunId, SellpiaInventorySku.name, SellpiaInventorySku.optionName (+44 more)

### Community 19 - "Core schema"
Cohesion: 0.05
Nodes (51): ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id, ChannelAccount.isPrimary, ChannelAccount.name, ChannelAccount.organization (+43 more)

### Community 20 - "AI schema"
Cohesion: 0.05
Nodes (52): ContentGeneration.detailPageArtifactId, ContentWorkspace.currentDetailPageArtifactId, ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.contentWorkspaceId, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.createdByUserId (+44 more)

### Community 21 - "Channels schema"
Cohesion: 0.04
Nodes (55): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+47 more)

### Community 22 - "Community 22"
Cohesion: 0.07
Nodes (50): Lane, databaseUrl(), value(), APPLY_STORAGE_CACHE_CONTROL_CONFIRMATION, applyCacheControl(), ApplyResult, applyS3CacheControl(), applySupabaseCacheControl() (+42 more)

### Community 23 - "Community 23"
Cohesion: 0.09
Nodes (48): apiHeaders(), apiUrl(), Args, assertSafeDatasetId(), assertSupportedReplayPayloads(), BundleManifest, BundlePayload, BundleReference (+40 more)

### Community 24 - "Community 24"
Cohesion: 0.09
Nodes (52): assertNoLocalAuthSecrets(), assertNonProductionTarget(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged(), assertSha256(), BaselineManifest, BaselineManifestExpectation, baselineObjectKeys (+44 more)

### Community 25 - "AI schema"
Cohesion: 0.05
Nodes (52): ContentGeneration.contentWorkspaceId, ContentWorkspace.channelListing, ContentWorkspace.channelListingId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.createdByUserId, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageRevision (+44 more)

### Community 26 - "AI schema"
Cohesion: 0.04
Nodes (52): packages/shared — @kiditem/shared, AI, DetailPageImageArtifact.byteLength, DetailPageImageArtifact.contentType, DetailPageImageArtifact.createdAt, DetailPageImageArtifact.createdBy, DetailPageImageArtifact.createdByUserId, DetailPageImageArtifact.id (+44 more)

### Community 27 - "Community 27"
Cohesion: 0.04
Nodes (49): boundedText(), isoDay, isRocketWorkbookBlockingReason(), requiredText(), ROCKET_PO_ROW_LIMIT, ROCKET_SAVED_PO_RESPONSE_PROFILE, ROCKET_SHORTAGE_REASONS, ROCKET_WORKBOOK_BLOCKING_REASONS (+41 more)

### Community 28 - "Community 28"
Cohesion: 0.09
Nodes (49): DATA_MIGRATION_IDS, dataMigrations, APPLY_DATA_MIGRATIONS_CONFIRMATION, appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertBaselineBinding(), assertBaselineCli(), assertMutatingTarget() (+41 more)

### Community 29 - "Orders schema"
Cohesion: 0.05
Nodes (45): OrderLineItem.createdAt, OrderLineItem.externalBarcode, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.metadata, OrderLineItem.optionName, OrderLineItem.order (+37 more)

### Community 30 - "Community 30"
Cohesion: 0.05
Nodes (39): ChannelAccountListItem, ChannelAccountListItemSchema, CoupangAccountSettings, CoupangAccountSettingsSchema, UpdateCoupangAccountSettings, ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow (+31 more)

### Community 31 - "Community 31"
Cohesion: 0.07
Nodes (37): CurrentOrganization, CurrentUser, Param, Post, cellText(), collectParentMetadataConflicts(), decodeWorksheetRange(), expandMergedParentCells() (+29 more)

### Community 32 - "Inventory schema"
Cohesion: 0.05
Nodes (44): Inventory, CoupangShipmentDateSummary.boxes, CoupangShipmentDateSummary.capturedAt, CoupangShipmentDateSummary.count, CoupangShipmentDateSummary.createdAt, CoupangShipmentDateSummary.id, CoupangShipmentDateSummary.organization, CoupangShipmentDateSummary.shipmentDate (+36 more)

### Community 33 - "AgentOS schema"
Cohesion: 0.05
Nodes (44): AgentRunRequest.agentInstance, AgentRunRequest.attempts, AgentRunRequest.claimedAt, AgentRunRequest.claimedBy, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.coalescedIntoRequestId, AgentRunRequest.conversation, AgentRunRequest.createdAt (+36 more)

### Community 34 - "AgentOS schema"
Cohesion: 0.05
Nodes (42): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+34 more)

### Community 35 - "Sourcing schema"
Cohesion: 0.05
Nodes (41): CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id, CandidateImage.isPrimary (+33 more)

### Community 36 - "Community 36"
Cohesion: 0.05
Nodes (40): ACCOUNT_AD_DAILY_DIGEST_KEYS, AD_ROW_KEYS, AD_SUMMARY_KEYS, ADS_DAILY_ROW_KEYS, ADS_KPI_KEYS, assertExactCount(), assertReadyCounts(), assertRebuildImportPrerequisites() (+32 more)

### Community 37 - "System schema"
Cohesion: 0.05
Nodes (34): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon, Marketplace.id (+26 more)

### Community 38 - "Community 38"
Cohesion: 0.08
Nodes (19): ChannelRegistrationCapabilityAdapter, toSellpiaMatch(), Injectable, ChannelsMarketplaceRegistrationCapabilityPort, ExternalProductRegistrationMatchPreviewInput, ExternalProductRegistrationMatchPreviewResult, ExternalProductRegistrationPreflightInput, ExternalProductRegistrationPreflightResult (+11 more)

### Community 39 - "Channels schema"
Cohesion: 0.06
Nodes (39): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignIdentity, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel (+31 more)

### Community 40 - "AI schema"
Cohesion: 0.06
Nodes (39): ProductPreparation.approvedAt, ProductPreparation.approvedByUser, ProductPreparation.channelAccount, ProductPreparation.channelAccountId, ProductPreparation.channelListing, ProductPreparation.channelListingId, ProductPreparation.createdAt, ProductPreparation.createdByUser (+31 more)

### Community 41 - "Community 41"
Cohesion: 0.08
Nodes (32): CHANNEL_LISTING_SORTS, CHANNEL_LISTING_TABS, ChannelListingDeletionDto, ChannelListingDeletionUnresolvedDto, ChannelListingQueryDto, IsIn, IsOptional, IsString (+24 more)

### Community 42 - "AI schema"
Cohesion: 0.06
Nodes (38): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+30 more)

### Community 43 - "Community 43"
Cohesion: 0.09
Nodes (21): ChannelSyncController, Body, Controller, CurrentOrganization, CurrentUser, Get, Post, CoupangSyncOrderPayload (+13 more)

### Community 44 - "Advertising schema"
Cohesion: 0.06
Nodes (36): Advertising, ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task (+28 more)

### Community 45 - "Sourcing schema"
Cohesion: 0.07
Nodes (32): ContentGeneration.sourceCandidateId, SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.id, SourcingCandidate.imageUrl (+24 more)

### Community 46 - "Community 46"
Cohesion: 0.08
Nodes (33): ClientRenderArtifactSchema, ClientRenderContentTypeSchema, ClientRenderDateSchema, ClientRenderOutputWidthSchema, ClientRenderUuidSchema, ClientRenderVariantSchema, DETAIL_IMAGE_COUNTS, DETAIL_PAGE_AGE_GROUPS (+25 more)

### Community 47 - "Community 47"
Cohesion: 0.06
Nodes (34): deriveSellpiaInventoryFreshness(), FixedSellpiaAccountKeySchema, FixedSellpiaOriginSchema, IsoDateTimeStringSchema, SELLPIA_INVENTORY_COLLECTION_FAILURE_CODES, SELLPIA_INVENTORY_FRESHNESS_STATUSES, SELLPIA_INVENTORY_REFRESH_REASONS, SellpiaFreshnessDerivationInput (+26 more)

### Community 48 - "Community 48"
Cohesion: 0.10
Nodes (33): item(), automaticReason(), automaticStatus(), BarcodeEvidence, bestSimilarityPerSku(), ChannelRecipeAutomationDecision, ChannelRecipeSuggestionEvidenceKind, ChannelRecipeSuggestionInput (+25 more)

### Community 49 - "prisma field: ActionTask.targetId"
Cohesion: 0.09
Nodes (28): ActionTask.targetId, ActionTask.targetType, AdAction.targetType, AgentArtifact.targetId, Alert.targetId, Alert.targetType, PANEL_RUN_SOURCES, PanelRunSource (+20 more)

### Community 50 - "Core schema"
Cohesion: 0.08
Nodes (35): ChannelListing.lastImportRunId, ChannelListingOption.lastImportRunId, Order.sourceImportRunId, SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.createdAt, SourceImportRun.createdBy (+27 more)

### Community 51 - "AI schema"
Cohesion: 0.07
Nodes (35): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height (+27 more)

### Community 52 - "AI schema"
Cohesion: 0.07
Nodes (35): ContentWorkspaceThumbnailSelection.contentAsset, ContentWorkspaceThumbnailSelection.contentAssetId, ContentWorkspaceThumbnailSelection.contentWorkspace, ContentWorkspaceThumbnailSelection.contentWorkspaceId, ContentWorkspaceThumbnailSelection.createdAt, ContentWorkspaceThumbnailSelection.createdByUser, ContentWorkspaceThumbnailSelection.createdByUserId, ContentWorkspaceThumbnailSelection.id (+27 more)

### Community 53 - "Channels schema"
Cohesion: 0.07
Nodes (35): CoupangWingTrackedProduct.brandName, CoupangWingTrackedProduct.categoryHierarchy, CoupangWingTrackedProduct.createdAt, CoupangWingTrackedProduct.enabled, CoupangWingTrackedProduct.id, CoupangWingTrackedProduct.imagePath, CoupangWingTrackedProduct.itemId, CoupangWingTrackedProduct.lastCapturedAt (+27 more)

### Community 54 - "Community 54"
Cohesion: 0.07
Nodes (14): SellpiaRecipeEvidenceAdapter, toEvidenceSku(), Inject, Injectable, ChannelRecipeSuggestionContextRepositoryAdapter, recipeSource(), Injectable, SellpiaRecipeEvidencePort (+6 more)

### Community 55 - "Community 55"
Cohesion: 0.12
Nodes (25): aiProductSuggestion(), aiVariantSuggestion(), asRecord(), availabilityListingWhere(), ChannelProductMatchingRepositoryAdapter, COMPLETED_CATALOG_SOURCE_TYPES, completedCatalogRunWhere(), componentSource() (+17 more)

### Community 56 - "Community 56"
Cohesion: 0.07
Nodes (12): ChannelSyncRepositoryAdapter, reconcileProductDetailOption(), Injectable, CoupangProviderPort, ChannelSyncRepositoryPort, ProductListingSyncResult, OrderSyncDeps, ProductSyncDeps (+4 more)

### Community 57 - "Sourcing schema"
Cohesion: 0.07
Nodes (34): ProductRegistrationExecution.channelAccount, ProductRegistrationExecution.channelListing, ProductRegistrationExecution.channelListingId, ProductRegistrationExecution.completedAt, ProductRegistrationExecution.createdAt, ProductRegistrationExecution.executionKind, ProductRegistrationExecution.expectedProviderAccountId, ProductRegistrationExecution.externalListingId (+26 more)

### Community 58 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+25 more)

### Community 59 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.startedAt, WorkflowRun.status (+25 more)

### Community 60 - "Inventory schema"
Cohesion: 0.07
Nodes (33): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.fromWarehouseId, StockTransfer.id, StockTransfer.notes, StockTransfer.optionName, StockTransfer.organization (+25 more)

### Community 61 - "Community 61"
Cohesion: 0.07
Nodes (31): DeliveryCompany, DeliveryCompanySchema, Order, OrderActionResponse, OrderActionResponseSchema, OrderLineItem, OrderLineItemSchema, OrderListItem (+23 more)

### Community 62 - "Community 62"
Cohesion: 0.07
Nodes (29): SellpiaInventoryCollectionFailureCodeSchema, SellpiaInventoryGenerationSchema, SellpiaInventoryQualityReportSchema, SellpiaInventoryRefreshReasonSchema, CompletedSourceArtifactRun, CoupangWingCatalogImportResponse, CoupangWingCatalogImportResponseSchema, ImportChanges (+21 more)

### Community 63 - "Supply schema"
Cohesion: 0.07
Nodes (32): RocketPurchaseConfirmation.artifactBytes, RocketPurchaseConfirmation.artifactContentType, RocketPurchaseConfirmation.artifactFileName, RocketPurchaseConfirmation.artifactSha256, RocketPurchaseConfirmation.artifactStoredAt, RocketPurchaseConfirmation.channelAccount, RocketPurchaseConfirmation.channelAccountId, RocketPurchaseConfirmation.completedAt (+24 more)

### Community 64 - "Channels schema"
Cohesion: 0.08
Nodes (31): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.channelAccount, ChannelScrapeRun.channelAccountId, ChannelScrapeRun.clientRunKey, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson (+23 more)

### Community 65 - "Channels schema"
Cohesion: 0.07
Nodes (31): RocketPoCatalogLine.businessDateBasis, RocketPoCatalogLine.center, RocketPoCatalogLine.createdAt, RocketPoCatalogLine.hasConfirmation, RocketPoCatalogLine.id, RocketPoCatalogLine.inboundType, RocketPoCatalogLine.orderQty, RocketPoCatalogLine.organization (+23 more)

### Community 66 - "Community 66"
Cohesion: 0.14
Nodes (13): ChannelProductMatchingController, Body, Controller, CurrentOrganization, Get, Param, Post, Put (+5 more)

### Community 67 - "Community 67"
Cohesion: 0.13
Nodes (26): distinct(), evidenceForCode(), evidenceForNames(), normalizePhysicalBarcode(), bigrams(), ChannelRecipeNameEvidence, ChannelRecipeNameIndex, ChannelRecipeNameOption (+18 more)

### Community 68 - "Inventory schema"
Cohesion: 0.09
Nodes (27): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.sourceRef, SellpiaReceiptUploadBatch.sourceType (+19 more)

### Community 69 - "Community 69"
Cohesion: 0.17
Nodes (30): assertProtectedApiDestination(), assertReplayCounts(), assertReplayFactDigest(), assertSharedDatabaseIdentity(), assertSharedRebuildGuard(), assertUuid(), bootstrap(), bootstrapPlanFromCli() (+22 more)

### Community 70 - "Community 70"
Cohesion: 0.14
Nodes (14): ChannelListingController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+6 more)

### Community 71 - "AgentOS schema"
Cohesion: 0.08
Nodes (29): AgentOS, AgentAuthorizationEvent.toolId, AgentInstanceToolPolicy.agentInstance, AgentInstanceToolPolicy.agentInstanceId, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentInstanceToolPolicy.dryRunMode (+21 more)

### Community 72 - "Community 72"
Cohesion: 0.09
Nodes (29): ChannelProductMatchingQueueResponseSchema, InventorySkuSnapshotListResponseSchema, CreateProductVariantRecipesIfEmptyResponseSchema, PlanProductVariantRecipesIfEmptyResponseSchema, artifact(), ApiClient, assertPartition(), assertPrivateOutputPath() (+21 more)

### Community 73 - "System schema"
Cohesion: 0.08
Nodes (26): Alert.actionTask, Alert.actorUser, Alert.actorUserId, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead (+18 more)

### Community 74 - "AgentOS schema"
Cohesion: 0.07
Nodes (28): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.approver, AgentApprovalRequest.approverUserId, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy, AgentApprovalRequest.decidedByUserId (+20 more)

### Community 75 - "AgentOS schema"
Cohesion: 0.08
Nodes (28): AgentToolInvocation.agentInstance, AgentToolInvocation.approvalRequest, AgentToolInvocation.approvalRequestId, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt, AgentToolInvocation.errorCode (+20 more)

### Community 76 - "Channels schema"
Cohesion: 0.08
Nodes (26): ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.id, ChannelScrapeSnapshot.listing, ChannelScrapeSnapshot.listingOption (+18 more)

### Community 77 - "Community 77"
Cohesion: 0.07
Nodes (26): ChannelSkuMappingComponent, ChannelSkuMappingComponentSchema, ChannelSkuMappingCounts, ChannelSkuMappingCountsSchema, ChannelSkuMappingListItem, ChannelSkuMappingListItemSchema, ChannelSkuMappingListResponse, ChannelSkuMappingListResponseSchema (+18 more)

### Community 78 - "Community 78"
Cohesion: 0.14
Nodes (27): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+19 more)

### Community 79 - "Community 79"
Cohesion: 0.09
Nodes (16): ChannelAccountController, Body, Controller, CurrentOrganization, Get, RocketAccountController, Controller, CurrentOrganization (+8 more)

### Community 80 - "Channels schema"
Cohesion: 0.08
Nodes (27): ChannelListingDeletionOperation.authorizationExpiresAt, ChannelListingDeletionOperation.channelAccount, ChannelListingDeletionOperation.channelListing, ChannelListingDeletionOperation.channelListingId, ChannelListingDeletionOperation.completedAt, ChannelListingDeletionOperation.createdAt, ChannelListingDeletionOperation.expectedProviderAccountId, ChannelListingDeletionOperation.externalListingId (+19 more)

### Community 81 - "Channels schema"
Cohesion: 0.08
Nodes (27): CoupangWingSalesRankDailySnapshot.businessDate, CoupangWingSalesRankDailySnapshot.capturedAt, CoupangWingSalesRankDailySnapshot.categoryHierarchy, CoupangWingSalesRankDailySnapshot.collectedCount, CoupangWingSalesRankDailySnapshot.conversionRate28d, CoupangWingSalesRankDailySnapshot.createdAt, CoupangWingSalesRankDailySnapshot.id, CoupangWingSalesRankDailySnapshot.itemId (+19 more)

### Community 82 - "Inventory schema"
Cohesion: 0.07
Nodes (27): SellpiaInventoryState.activeGeneration, SellpiaInventoryState.activeSyncLeaseExpiresAt, SellpiaInventoryState.activeSyncOwner, SellpiaInventoryState.activeSyncOwnerUserId, SellpiaInventoryState.activeSyncStartedAt, SellpiaInventoryState.activeSyncToken, SellpiaInventoryState.createdAt, SellpiaInventoryState.failedGeneration (+19 more)

### Community 83 - "Community 83"
Cohesion: 0.12
Nodes (23): AdCampaignAccountProjection, AdCampaignDailyRepairPlan, AdCampaignListingProjection, AdCampaignRepairRunInput, AdCampaignRepairSnapshotInput, AdCampaignTargetProjection, AdMetrics, asRecord() (+15 more)

### Community 84 - "Community 84"
Cohesion: 0.08
Nodes (14): day(), ensureRocketPoCatalogSnapshot(), isoDay(), listSavedRocketPos(), loadSavedRocketCollection(), requiredSavedValue(), ROCKET_CONFIRMATION_REQUEST_STATUSES, toCatalogRow() (+6 more)

### Community 85 - "Community 85"
Cohesion: 0.09
Nodes (18): RocketPoCatalogResolution, ChannelRecipeAutomationContextRepositoryPort, automationReason(), ChannelRecipeAutomationService, countDecision(), emptyScopedResult(), proposalVersion(), requiredSuggestion() (+10 more)

### Community 86 - "Supply schema"
Cohesion: 0.08
Nodes (26): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+18 more)

### Community 87 - "Community 87"
Cohesion: 0.08
Nodes (23): StatisticsCategoryRow, StatisticsCategoryRowSchema, StatisticsDeliveryDaily, StatisticsDeliveryDailySchema, StatisticsDeliveryResponse, StatisticsDeliveryResponseSchema, StatisticsGradeRow, StatisticsGradeRowSchema (+15 more)

### Community 88 - "Community 88"
Cohesion: 0.09
Nodes (9): Inject, ChannelSkuAvailabilityPort, ChannelProductMatchingRepositoryPort, Inject, ChannelSkuAvailabilityService, matchesStatus(), toAvailabilityItem(), Inject (+1 more)

### Community 89 - "Community 89"
Cohesion: 0.13
Nodes (16): ChannelAccountRepositoryAdapter, envelopeToJson(), maskAccessKey(), readCredentialsConfig(), stripLegacyCredentialKeys(), toJsonRecord(), toRecord(), trimToOptional() (+8 more)

### Community 90 - "Community 90"
Cohesion: 0.11
Nodes (15): assertExactProductGraph(), MarketplaceRegistrationRepositoryAdapter, Injectable, upsertExactOptionLinks(), MarketplaceRegistrationRepositoryPort, asRecord(), KidItemFirstOptionLink, KidItemFirstRegistrationLinks (+7 more)

### Community 91 - "Channels schema"
Cohesion: 0.09
Nodes (25): ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isOfferWinner, ChannelListingOptionDailySnapshot.lastObservedAt, ChannelListingOptionDailySnapshot.listing (+17 more)

### Community 92 - "AgentOS schema"
Cohesion: 0.09
Nodes (24): AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy, AgentAuthorizationEvent.decidedByUserId, AgentAuthorizationEvent.decision (+16 more)

### Community 93 - "Community 93"
Cohesion: 0.15
Nodes (24): assertBootstrapPreflightManifest(), assertCurrentRebuildBinding(), assertIsoTimestamp(), assertPositiveIntegerText(), assertPostgresUuid(), assertStagingAccountBaselineManifest(), assertStoredImportBinding(), assertUnique() (+16 more)

### Community 94 - "Community 94"
Cohesion: 0.13
Nodes (12): assertCanonicalCoupangAccountIdentity(), canonicalParentRows(), ChannelCatalogImportRepositoryAdapter, importResponse(), isUniqueConstraintError(), nextPublicationSequence(), Injectable, zeroChanges() (+4 more)

### Community 95 - "System schema"
Cohesion: 0.10
Nodes (23): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.href (+15 more)

### Community 96 - "Advertising schema"
Cohesion: 0.09
Nodes (23): AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+15 more)

### Community 97 - "AgentOS schema"
Cohesion: 0.09
Nodes (23): AgentInstance.adapterConfig, AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.icon, AgentInstance.id, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name (+15 more)

### Community 98 - "Orders schema"
Cohesion: 0.10
Nodes (23): OrderReturn.channelAccount, OrderReturn.channelAccountId, OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.id (+15 more)

### Community 99 - "Community 99"
Cohesion: 0.09
Nodes (19): adapterPaths, BROWSER_COLLECTION_ATTENTION_REASONS, BROWSER_COLLECTION_PRODUCERS, BROWSER_COLLECTION_STATES, BrowserCollectionAttentionReasonSchema, BrowserCollectionClassificationSchema, BrowserCollectionCommand, BrowserCollectionCommandSchema (+11 more)

### Community 100 - "Community 100"
Cohesion: 0.22
Nodes (8): ChannelDashboardController, Controller, CurrentOrganization, Get, Query, CoupangDateRangeQueryDto, ChannelDashboardService, Injectable

### Community 101 - "Community 101"
Cohesion: 0.13
Nodes (22): assembleCompleteSnapshot(), assertSameManifest(), buildCollectionStatus(), countMedia(), countOptions(), derivePhase(), firstDate(), hashCatalogChunkPayload() (+14 more)

### Community 102 - "Channels schema"
Cohesion: 0.11
Nodes (22): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.channelAccount, ChannelAccountDailyKpiSnapshot.channelAccountId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+14 more)

### Community 103 - "Orders schema"
Cohesion: 0.10
Nodes (20): Review.content, Review.createdAt, Review.externalProductId, Review.externalReviewId, Review.id, Review.imageCount, Review.isBlinded, Review.itemName (+12 more)

### Community 104 - "Supply schema"
Cohesion: 0.11
Nodes (22): RocketPurchaseConfirmationLine.channelListingOption, RocketPurchaseConfirmationLine.channelListingOptionId, RocketPurchaseConfirmationLine.collectedAt, RocketPurchaseConfirmationLine.collectedOrderLineItemId, RocketPurchaseConfirmationLine.confirmation, RocketPurchaseConfirmationLine.confirmationId, RocketPurchaseConfirmationLine.confirmedQuantity, RocketPurchaseConfirmationLine.createdAt (+14 more)

### Community 105 - "Sourcing schema"
Cohesion: 0.11
Nodes (22): TiktokCreativeTrendDailySnapshot.businessDate, TiktokCreativeTrendDailySnapshot.capturedAt, TiktokCreativeTrendDailySnapshot.createdAt, TiktokCreativeTrendDailySnapshot.entityKey, TiktokCreativeTrendDailySnapshot.growthPct, TiktokCreativeTrendDailySnapshot.id, TiktokCreativeTrendDailySnapshot.industry, TiktokCreativeTrendDailySnapshot.label (+14 more)

### Community 106 - "Community 106"
Cohesion: 0.20
Nodes (14): CoupangCredentials, coupangRequest(), CoupangRequestOptions, generateAuthorization(), approveReturn(), confirmOrderSheets(), DELIVERY_COMPANIES, getOrderSheets() (+6 more)

### Community 107 - "System schema"
Cohesion: 0.11
Nodes (21): System, ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization (+13 more)

### Community 108 - "AgentOS schema"
Cohesion: 0.10
Nodes (21): AgentArtifact.agentInstance, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization, AgentArtifact.request (+13 more)

### Community 109 - "AI schema"
Cohesion: 0.11
Nodes (21): AiDirectJob.attempts, AiDirectJob.claimedAt, AiDirectJob.claimedBy, AiDirectJob.createdAt, AiDirectJob.finishedAt, AiDirectJob.id, AiDirectJob.jobType, AiDirectJob.lastErrorCode (+13 more)

### Community 110 - "System schema"
Cohesion: 0.10
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+13 more)

### Community 111 - "Channels schema"
Cohesion: 0.11
Nodes (21): CoupangKeywordRankDailySnapshot.adRank, CoupangKeywordRankDailySnapshot.businessDate, CoupangKeywordRankDailySnapshot.capturedAt, CoupangKeywordRankDailySnapshot.createdAt, CoupangKeywordRankDailySnapshot.id, CoupangKeywordRankDailySnapshot.itemId, CoupangKeywordRankDailySnapshot.keyword, CoupangKeywordRankDailySnapshot.organicRank (+13 more)

### Community 112 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): LiveCommerceBroadcastDailySnapshot.broadcasterId, LiveCommerceBroadcastDailySnapshot.broadcasterName, LiveCommerceBroadcastDailySnapshot.broadcastId, LiveCommerceBroadcastDailySnapshot.businessDate, LiveCommerceBroadcastDailySnapshot.capturedAt, LiveCommerceBroadcastDailySnapshot.coverImageUrl, LiveCommerceBroadcastDailySnapshot.createdAt, LiveCommerceBroadcastDailySnapshot.endedAt (+13 more)

### Community 113 - "Orders schema"
Cohesion: 0.10
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 114 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): ShortsTrendDailySnapshot.businessDate, ShortsTrendDailySnapshot.capturedAt, ShortsTrendDailySnapshot.channelName, ShortsTrendDailySnapshot.commentCount, ShortsTrendDailySnapshot.createdAt, ShortsTrendDailySnapshot.id, ShortsTrendDailySnapshot.keyword, ShortsTrendDailySnapshot.likeCount (+13 more)

### Community 115 - "Community 115"
Cohesion: 0.11
Nodes (9): ChannelAccountListController, Controller, CurrentOrganization, Get, ChannelAccountRepositoryPort, ChannelAccountQueryService, Inject, Injectable (+1 more)

### Community 116 - "Community 116"
Cohesion: 0.10
Nodes (7): ChannelsDeletionPasswordAdapter, Injectable, ChannelsDeletionPasswordPort, ChannelListingRepositoryPort, Inject, Optional, Inject

### Community 117 - "Community 117"
Cohesion: 0.12
Nodes (16): assertActiveCoupangAccount(), assertCanonicalAccount(), ChannelCatalogPublicationRepositoryAdapter, completeCollectionRun(), completedCollectionResult(), jsonRecord(), lockAccount(), lockCollectionRun() (+8 more)

### Community 118 - "Community 118"
Cohesion: 0.12
Nodes (16): ApplyChannelRecipeAutomationInput, ApplyChannelRecipeAutomationInputSchema, ApplyChannelRecipeAutomationResponse, ApplyChannelRecipeAutomationResponseSchema, ChannelRecipeAutomationDecision, ChannelRecipeAutomationDecisionSchema, ChannelRecipeAutomationItem, ChannelRecipeAutomationItemSchema (+8 more)

### Community 119 - "AgentOS schema"
Cohesion: 0.11
Nodes (20): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id, AgentCostEvent.inputTokens (+12 more)

### Community 120 - "Finance schema"
Cohesion: 0.12
Nodes (20): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit (+12 more)

### Community 121 - "Channels schema"
Cohesion: 0.12
Nodes (20): SellpiaProductMonthlySales.buyPrice, SellpiaProductMonthlySales.capturedAt, SellpiaProductMonthlySales.createdAt, SellpiaProductMonthlySales.id, SellpiaProductMonthlySales.inAmount, SellpiaProductMonthlySales.inQty, SellpiaProductMonthlySales.optionCode, SellpiaProductMonthlySales.optionName (+12 more)

### Community 122 - "Sourcing schema"
Cohesion: 0.12
Nodes (20): Sourcing1688HotProductDailySnapshot.businessDate, Sourcing1688HotProductDailySnapshot.capturedAt, Sourcing1688HotProductDailySnapshot.createdAt, Sourcing1688HotProductDailySnapshot.id, Sourcing1688HotProductDailySnapshot.imageUrl, Sourcing1688HotProductDailySnapshot.monthlySales, Sourcing1688HotProductDailySnapshot.offerId, Sourcing1688HotProductDailySnapshot.organization (+12 more)

### Community 123 - "Community 123"
Cohesion: 0.11
Nodes (18): SupplierHistoryItem, SupplierHistoryItemSchema, SupplierHistoryReport, SupplierHistoryReportSchema, SupplierHistorySummary, SupplierHistorySummarySchema, SupplierProductSalesReport, SupplierProductSalesReportSchema (+10 more)

### Community 124 - "Community 124"
Cohesion: 0.21
Nodes (18): analyzePrReleaseContract(), changedFilesFromGit(), classifyFiles(), compareSemver(), deletedFilesFromGit(), ghPrBody(), git(), hasReleaseDecision() (+10 more)

### Community 125 - "Community 125"
Cohesion: 0.11
Nodes (8): CoupangProviderAdapter, Inject, Injectable, CoupangCreateSellerProductResponse, CoupangSellerProductPayload, OrderSheetResponse, SellerProductExternalSkuResponse, CoupangCredentialsPort

### Community 126 - "AgentOS schema"
Cohesion: 0.12
Nodes (19): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError, AgentTaskSession.lastRun (+11 more)

### Community 127 - "Orders schema"
Cohesion: 0.12
Nodes (19): CoupangDirectPoSnapshot.centerName, CoupangDirectPoSnapshot.channelAccountId, CoupangDirectPoSnapshot.collectedAt, CoupangDirectPoSnapshot.createdAt, CoupangDirectPoSnapshot.deliveryDate, CoupangDirectPoSnapshot.id, CoupangDirectPoSnapshot.isUrgent, CoupangDirectPoSnapshot.itemsJson (+11 more)

### Community 128 - "Supply schema"
Cohesion: 0.12
Nodes (19): PurchaseOrderSubmissionAttempt.createdAt, PurchaseOrderSubmissionAttempt.errorCode, PurchaseOrderSubmissionAttempt.errorMessage, PurchaseOrderSubmissionAttempt.freshnessGeneration, PurchaseOrderSubmissionAttempt.id, PurchaseOrderSubmissionAttempt.idempotencyKey, PurchaseOrderSubmissionAttempt.organization, PurchaseOrderSubmissionAttempt.providerReference (+11 more)

### Community 129 - "Inventory schema"
Cohesion: 0.12
Nodes (19): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.notes, ReturnTransfer.optionName, ReturnTransfer.organization (+11 more)

### Community 130 - "Community 130"
Cohesion: 0.15
Nodes (14): PRODUCT_LIFECYCLE_STATES, ProductLifecycleState, ProductLifecycleStateSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, MasterImageItem, MasterImageItemSchema, MasterImageRole (+6 more)

### Community 131 - "Community 131"
Cohesion: 0.16
Nodes (19): asRecord(), conversionRate(), dailyRawMetricsMatch(), dateStringMatches(), exactHeaderValues(), finiteNumber(), hasExactCoupangAdsDailyRawProvenance(), isExactWholeAccountCampaignRun() (+11 more)

### Community 132 - "Community 132"
Cohesion: 0.19
Nodes (18): assertAllowedArguments(), assertPublishableMain(), copyLoadableExtension(), createArchive(), environmentProfiles, githubReleaseCommand(), gitOutput(), gitSha() (+10 more)

### Community 133 - "Community 133"
Cohesion: 0.11
Nodes (16): CurrentOrganization, Get, Query, AVAILABILITY_STATUSES, ChannelSkuAvailabilityQueryDto, IsIn, IsInt, IsOptional (+8 more)

### Community 134 - "Community 134"
Cohesion: 0.11
Nodes (4): ChannelDashboardRepositoryAdapter, Injectable, ChannelDashboardRepositoryPort, Inject

### Community 135 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.id, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.lastRunId (+10 more)

### Community 136 - "Sourcing schema"
Cohesion: 0.14
Nodes (18): LiveCommerceProductDailySnapshot.broadcastId, LiveCommerceProductDailySnapshot.businessDate, LiveCommerceProductDailySnapshot.capturedAt, LiveCommerceProductDailySnapshot.createdAt, LiveCommerceProductDailySnapshot.id, LiveCommerceProductDailySnapshot.imageUrl, LiveCommerceProductDailySnapshot.organization, LiveCommerceProductDailySnapshot.priceCny (+10 more)

### Community 137 - "Sourcing schema"
Cohesion: 0.13
Nodes (18): NaverKeywordDailySnapshot.averageAdRank, NaverKeywordDailySnapshot.businessDate, NaverKeywordDailySnapshot.capturedAt, NaverKeywordDailySnapshot.competitionIndex, NaverKeywordDailySnapshot.createdAt, NaverKeywordDailySnapshot.id, NaverKeywordDailySnapshot.keyword, NaverKeywordDailySnapshot.monthlyMobileSearchCount (+10 more)

### Community 138 - "Channels schema"
Cohesion: 0.14
Nodes (18): RocketPoCatalogSnapshot.channelAccount, RocketPoCatalogSnapshot.channelAccountId, RocketPoCatalogSnapshot.collectionRunId, RocketPoCatalogSnapshot.createdAt, RocketPoCatalogSnapshot.detailPoCount, RocketPoCatalogSnapshot.id, RocketPoCatalogSnapshot.listPagesRead, RocketPoCatalogSnapshot.organization (+10 more)

### Community 139 - "Channels schema"
Cohesion: 0.12
Nodes (18): RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt, RocketPurchaseOrder.firstSkuName, RocketPurchaseOrder.id, RocketPurchaseOrder.items, RocketPurchaseOrder.orderAmount, RocketPurchaseOrder.orderedAt (+10 more)

### Community 140 - "Community 140"
Cohesion: 0.11
Nodes (16): CANCEL_OPERATION_TARGET_TYPES, CancelOperationAffected, CancelOperationAffectedSchema, CancelOperationPreserved, CancelOperationPreservedSchema, CancelOperationResponse, CancelOperationResponseSchema, CancelOperationStatus (+8 more)

### Community 141 - "Community 141"
Cohesion: 0.18
Nodes (8): ChannelCatalogCollectionRepositoryAdapter, isUniqueConstraintError(), ownedRunWhere(), Injectable, ChannelCatalogCollectionChunkRecord, ChannelCatalogCollectionRunRecord, ChannelCatalogCollectionWithChunks, startRun()

### Community 142 - "Supply schema"
Cohesion: 0.13
Nodes (16): Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.id, Supplier.leadTimeDays, Supplier.name, Supplier.notes (+8 more)

### Community 143 - "Community 143"
Cohesion: 0.12
Nodes (13): MAX_SELLPIA_MANUAL_MATCH_ROWS, MAX_SELLPIA_MANUAL_MATCH_TARGETS, SellpiaManualMatchCodeSchema, SellpiaManualMatchCollectionFailureCode, SellpiaManualMatchCollectionFailureCodeSchema, SellpiaManualMatchImportResponse, SellpiaManualMatchRow, SellpiaManualMatchRowSchema (+5 more)

### Community 144 - "Community 144"
Cohesion: 0.15
Nodes (14): IsoDateTimeStringSchema, SellpiaOrderTransmissionIntentAbortResponse, SellpiaOrderTransmissionIntentAbortResponseSchema, SellpiaOrderTransmissionIntentFinalizeResponse, SellpiaOrderTransmissionIntentFinalizeResponseSchema, SellpiaOrderTransmissionIntentKeySchema, SellpiaOrderTransmissionIntentPrepareRequest, SellpiaOrderTransmissionIntentPrepareRequestSchema (+6 more)

### Community 145 - "Community 145"
Cohesion: 0.23
Nodes (5): Inject, ChannelCatalogCollectionPort, ChannelCatalogCollectionService, parseRequest(), Injectable

### Community 146 - "AgentOS schema"
Cohesion: 0.15
Nodes (16): AgentRunEvent.agentInstance, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message, AgentRunEvent.organization (+8 more)

### Community 147 - "Channels schema"
Cohesion: 0.16
Nodes (16): ChannelScrapeChunk.checksum, ChannelScrapeChunk.createdAt, ChannelScrapeChunk.id, ChannelScrapeChunk.itemCount, ChannelScrapeChunk.kind, ChannelScrapeChunk.organization, ChannelScrapeChunk.payload, ChannelScrapeChunk.publicationJson (+8 more)

### Community 148 - "Supply schema"
Cohesion: 0.16
Nodes (16): RocketPurchaseConfirmationTransmission.confirmation, RocketPurchaseConfirmationTransmission.confirmationId, RocketPurchaseConfirmationTransmission.createdAt, RocketPurchaseConfirmationTransmission.id, RocketPurchaseConfirmationTransmission.intentKey, RocketPurchaseConfirmationTransmission.matchedLineCount, RocketPurchaseConfirmationTransmission.observedAt, RocketPurchaseConfirmationTransmission.organization (+8 more)

### Community 149 - "Orders schema"
Cohesion: 0.15
Nodes (16): SellpiaOrderTransmissionIntent.abortedAt, SellpiaOrderTransmissionIntent.createdAt, SellpiaOrderTransmissionIntent.createdBy, SellpiaOrderTransmissionIntent.creator, SellpiaOrderTransmissionIntent.finalizedAt, SellpiaOrderTransmissionIntent.finalizedGeneration, SellpiaOrderTransmissionIntent.id, SellpiaOrderTransmissionIntent.intentKey (+8 more)

### Community 150 - "Supply schema"
Cohesion: 0.13
Nodes (16): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.dueDate, SupplierPayment.id, SupplierPayment.notes, SupplierPayment.organization, SupplierPayment.paidAmount, SupplierPayment.paidDate (+8 more)

### Community 151 - "Supply schema"
Cohesion: 0.16
Nodes (16): SupplierProduct.createdAt, SupplierProduct.id, SupplierProduct.isPrimary, SupplierProduct.memo, SupplierProduct.minOrderQty, SupplierProduct.organization, SupplierProduct.sellpiaInventorySku, SupplierProduct.sellpiaInventorySkuId (+8 more)

### Community 152 - "Orders schema"
Cohesion: 0.13
Nodes (16): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.externalSku, UnshippedItem.id, UnshippedItem.isNotified, UnshippedItem.notifiedAt, UnshippedItem.optionName, UnshippedItem.order (+8 more)

### Community 153 - "Community 153"
Cohesion: 0.24
Nodes (14): analyzeReconstructionTriggers(), changedFilesFromGit(), ghPrBody(), git(), isCrossLayerControlChange(), isHighRiskBoundary(), isLargeServiceOrComponent(), layerOf() (+6 more)

### Community 154 - "Community 154"
Cohesion: 0.28
Nodes (10): ChannelCatalogCollectionController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+2 more)

### Community 155 - "Finance schema"
Cohesion: 0.14
Nodes (15): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description (+7 more)

### Community 156 - "Orders schema"
Cohesion: 0.14
Nodes (15): CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing (+7 more)

### Community 157 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 158 - "Core schema"
Cohesion: 0.14
Nodes (13): MasterProductAbcPolicy.aCumulativeThreshold, MasterProductAbcPolicy.bCumulativeThreshold, MasterProductAbcPolicy.createdAt, MasterProductAbcPolicy.id, MasterProductAbcPolicy.lastCalculatedAt, MasterProductAbcPolicy.metric, MasterProductAbcPolicy.organization, MasterProductAbcPolicy.periodDays (+5 more)

### Community 159 - "Sourcing schema"
Cohesion: 0.17
Nodes (15): NaverPopularKeywordDailySnapshot.boardKey, NaverPopularKeywordDailySnapshot.boardLabel, NaverPopularKeywordDailySnapshot.businessDate, NaverPopularKeywordDailySnapshot.capturedAt, NaverPopularKeywordDailySnapshot.cid, NaverPopularKeywordDailySnapshot.createdAt, NaverPopularKeywordDailySnapshot.id, NaverPopularKeywordDailySnapshot.keyword (+7 more)

### Community 160 - "Finance schema"
Cohesion: 0.14
Nodes (15): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.id, ProcessingCost.master, ProcessingCost.notes, ProcessingCost.organization, ProcessingCost.processType, ProcessingCost.productName (+7 more)

### Community 161 - "Finance schema"
Cohesion: 0.15
Nodes (15): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.organization, SalesPlan.period (+7 more)

### Community 162 - "Channels schema"
Cohesion: 0.17
Nodes (15): SellpiaManualMatchAlias.aliasTitle, SellpiaManualMatchAlias.createdAt, SellpiaManualMatchAlias.evidenceCount, SellpiaManualMatchAlias.id, SellpiaManualMatchAlias.itemCount, SellpiaManualMatchAlias.matchedType, SellpiaManualMatchAlias.normalizedAlias, SellpiaManualMatchAlias.organization (+7 more)

### Community 163 - "Channels schema"
Cohesion: 0.15
Nodes (15): SellpiaManualMatchSnapshot.aliasCount, SellpiaManualMatchSnapshot.capturedAt, SellpiaManualMatchSnapshot.createdAt, SellpiaManualMatchSnapshot.id, SellpiaManualMatchSnapshot.matchedTargetCount, SellpiaManualMatchSnapshot.organization, SellpiaManualMatchSnapshot.schemaVersion, SellpiaManualMatchSnapshot.snapshotHash (+7 more)

### Community 164 - "Channels schema"
Cohesion: 0.16
Nodes (15): SellpiaSalesDailySnapshot.businessDate, SellpiaSalesDailySnapshot.capturedAt, SellpiaSalesDailySnapshot.channelGroup, SellpiaSalesDailySnapshot.costKrw, SellpiaSalesDailySnapshot.createdAt, SellpiaSalesDailySnapshot.id, SellpiaSalesDailySnapshot.organization, SellpiaSalesDailySnapshot.qty (+7 more)

### Community 165 - "Inventory schema"
Cohesion: 0.15
Nodes (15): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items, StockAudit.matchedCount (+7 more)

### Community 166 - "Advertising schema"
Cohesion: 0.15
Nodes (14): ExecutionTask.workerId, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentTaskRef, ExecutionWorker.currentUrl, ExecutionWorker.id, ExecutionWorker.label, ExecutionWorker.lastHeartbeatAt (+6 more)

### Community 167 - "System schema"
Cohesion: 0.15
Nodes (12): FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name, FeatureGate.updatedAt (+4 more)

### Community 168 - "Community 168"
Cohesion: 0.26
Nodes (14): asRecord(), assertNoPii(), boundedReplayScope(), buildReplayBody(), buildReplayKpis(), cloneReplayValue(), containsPiiValue(), copyString() (+6 more)

### Community 169 - "Community 169"
Cohesion: 0.17
Nodes (6): ChannelsOperationAlertAdapter, Inject, Injectable, OperationAlertPort, OperationLifecyclePatch, StartOperationAlertInput

### Community 170 - "Community 170"
Cohesion: 0.17
Nodes (12): applyProductLinksInBatches(), applyVariantLinksInBatches(), buildCatalogProductProvisioningListings(), publishCatalogOperationalProducts(), unique(), validateProvisionedLinks(), nextPublicationSequence(), productsFromRows() (+4 more)

### Community 171 - "Community 171"
Cohesion: 0.22
Nodes (8): CHANNELS_ROOT, REPO_ROOT, analyzeInventory(), listTopLevelScriptFiles(), main(), repoRoot(), SCRIPT_INVENTORY, SUPPORT_FILES

### Community 172 - "Supply schema"
Cohesion: 0.19
Nodes (13): Supply, RocketPurchaseConfirmationAllocation.confirmationLine, RocketPurchaseConfirmationAllocation.confirmationLineId, RocketPurchaseConfirmationAllocation.createdAt, RocketPurchaseConfirmationAllocation.id, RocketPurchaseConfirmationAllocation.organization, RocketPurchaseConfirmationAllocation.quantity, RocketPurchaseConfirmationAllocation.sellpiaInventorySku (+5 more)

### Community 173 - "Channels schema"
Cohesion: 0.19
Nodes (13): CoupangKeywordSerpDailySnapshot.businessDate, CoupangKeywordSerpDailySnapshot.capturedAt, CoupangKeywordSerpDailySnapshot.createdAt, CoupangKeywordSerpDailySnapshot.id, CoupangKeywordSerpDailySnapshot.itemCount, CoupangKeywordSerpDailySnapshot.items, CoupangKeywordSerpDailySnapshot.keyword, CoupangKeywordSerpDailySnapshot.organization (+5 more)

### Community 174 - "Core schema"
Cohesion: 0.17
Nodes (13): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+5 more)

### Community 175 - "Channels schema"
Cohesion: 0.18
Nodes (13): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson, RocketSupplyDailySnapshot.revenueKrw (+5 more)

### Community 176 - "Community 176"
Cohesion: 0.29
Nodes (13): assertAllowedRecord(), assertAllowedRows(), assertAllowedScalarRecord(), assertObservedMetrics(), assertOptionalScalar(), assertPlainRecord(), assertReplayBundle(), assertReplayFactCounts() (+5 more)

### Community 177 - "Community 177"
Cohesion: 0.31
Nodes (11): analyzeSchemaArtifactSync(), changedFilesFromGit(), changedFilesFromWorkingTree(), GENERATED_ARTIFACT_PATHS, git(), main(), matchesAnyPath(), mergeChangedFiles() (+3 more)

### Community 178 - "Orders schema"
Cohesion: 0.18
Nodes (12): Orders, SellpiaOrderTransmissionIntentReconciliation.id, SellpiaOrderTransmissionIntentReconciliation.intent, SellpiaOrderTransmissionIntentReconciliation.intentId, SellpiaOrderTransmissionIntentReconciliation.note, SellpiaOrderTransmissionIntentReconciliation.organization, SellpiaOrderTransmissionIntentReconciliation.outcome, SellpiaOrderTransmissionIntentReconciliation.reconciledAt (+4 more)

### Community 179 - "Channels schema"
Cohesion: 0.20
Nodes (12): CoupangKeywordTracker.createdAt, CoupangKeywordTracker.enabled, CoupangKeywordTracker.id, CoupangKeywordTracker.keyword, CoupangKeywordTracker.lastCapturedAt, CoupangKeywordTracker.maxPages, CoupangKeywordTracker.organization, CoupangKeywordTracker.updatedAt (+4 more)

### Community 180 - "Inventory schema"
Cohesion: 0.21
Nodes (12): InventoryCommitmentAllocation.commitment, InventoryCommitmentAllocation.commitmentId, InventoryCommitmentAllocation.createdAt, InventoryCommitmentAllocation.id, InventoryCommitmentAllocation.organization, InventoryCommitmentAllocation.quantity, InventoryCommitmentAllocation.sellpiaInventorySku, InventoryCommitmentAllocation.sellpiaInventorySkuId (+4 more)

### Community 181 - "Core schema"
Cohesion: 0.18
Nodes (12): MasterProductAbcGradeHistory.calculatedAt, MasterProductAbcGradeHistory.id, MasterProductAbcGradeHistory.masterProduct, MasterProductAbcGradeHistory.masterProductId, MasterProductAbcGradeHistory.metric, MasterProductAbcGradeHistory.metricValue, MasterProductAbcGradeHistory.newGrade, MasterProductAbcGradeHistory.oldGrade (+4 more)

### Community 182 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 183 - "Community 183"
Cohesion: 0.18
Nodes (3): ChannelCatalogCollectionRepositoryPort, ChannelCatalogPublicationPort, Inject

### Community 184 - "Sourcing schema"
Cohesion: 0.24
Nodes (11): Sourcing, SourcingWorkspaceSnapshot.businessDate, SourcingWorkspaceSnapshot.createdAt, SourcingWorkspaceSnapshot.id, SourcingWorkspaceSnapshot.organization, SourcingWorkspaceSnapshot.payload, SourcingWorkspaceSnapshot.scope, SourcingWorkspaceSnapshot.updatedAt (+3 more)

### Community 185 - "Core schema"
Cohesion: 0.22
Nodes (11): CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.keywords, CategoryMapping.organization, CategoryMapping.updatedAt (+3 more)

### Community 186 - "Supply schema"
Cohesion: 0.20
Nodes (11): PurchaseOrderItem.createdAt, PurchaseOrderItem.id, PurchaseOrderItem.order, PurchaseOrderItem.organization, PurchaseOrderItem.productName, PurchaseOrderItem.quantity, PurchaseOrderItem.sellpiaInventorySku, PurchaseOrderItem.sellpiaInventorySkuId (+3 more)

### Community 187 - "Sourcing schema"
Cohesion: 0.22
Nodes (11): TrendSeedKeyword.createdAt, TrendSeedKeyword.enabled, TrendSeedKeyword.id, TrendSeedKeyword.keyword, TrendSeedKeyword.keywordCn, TrendSeedKeyword.organization, TrendSeedKeyword.sources, TrendSeedKeyword.updatedAt (+3 more)

### Community 188 - "Community 188"
Cohesion: 0.20
Nodes (10): canRetryChannelListingDeletionProviderSideEffect(), canRetryProviderSideEffect(), isOperationTerminal(), OPERATION_STATUSES, OperationStatus, OperationStatusSchema, PROVIDER_OUTCOMES, ProviderOutcome (+2 more)

### Community 189 - "Community 189"
Cohesion: 0.22
Nodes (8): CoupangCategorySuggestion, CoupangCategorySuggestionRequest, CoupangCategorySuggestionRequestSchema, CoupangCategorySuggestionResponse, CoupangCategorySuggestionResponseSchema, CoupangCategorySuggestionResult, CoupangCategorySuggestionResultSchema, CoupangCategorySuggestionSchema

### Community 190 - "Community 190"
Cohesion: 0.45
Nodes (7): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), REDACTED_PLACEHOLDER, scrubDeep(), scrubSecrets(), walk()

### Community 191 - "Community 191"
Cohesion: 0.38
Nodes (9): checkTrackedClaudeDirectory(), findClaudeShimFindings(), findInstructionChainSizeFindings(), findStaleInstructionLines(), git(), listRepositoryFiles(), listTracked(), main() (+1 more)

### Community 192 - "Community 192"
Cohesion: 0.35
Nodes (9): analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), directOutPortFiles(), FORBIDDEN_IN_PORT_FOLDER_NAMES, forbiddenInPortCallerFolders(), listDirectories(), listFiles(), main() (+1 more)

### Community 193 - "Community 193"
Cohesion: 0.38
Nodes (8): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), main(), parseBaseline(), readFiles(), repoRoot(), walk()

### Community 194 - "Community 194"
Cohesion: 0.33
Nodes (8): parseArgs(), bool(), parseRawArgs(), ParseRawArgsOptions, pushValue(), values(), COMMANDS, makeArgs()

### Community 195 - "Community 195"
Cohesion: 0.28
Nodes (6): manualMatchAliasCandidates(), aggregateRows(), sameStrings(), strongerMatchedType(), normalizeSellpiaManualMatchAlias(), SellpiaManualMatchImportResponseSchema

### Community 196 - "Channels schema"
Cohesion: 0.25
Nodes (9): Channels, CoupangRepresentativeKeywordOverride.createdAt, CoupangRepresentativeKeywordOverride.id, CoupangRepresentativeKeywordOverride.keyword, CoupangRepresentativeKeywordOverride.organization, CoupangRepresentativeKeywordOverride.updatedAt, CoupangRepresentativeKeywordOverride, coupang_representative_keyword_overrides (+1 more)

### Community 197 - "Core schema"
Cohesion: 0.25
Nodes (9): AuthSession.createdAt, AuthSession.expiresAt, AuthSession.id, AuthSession.revokedAt, AuthSession.tokenHash, AuthSession.user, AuthSession.userId, AuthSession (+1 more)

### Community 198 - "Community 198"
Cohesion: 0.22
Nodes (7): ReadinessCheck, ReadinessCheckSchema, ReadinessCheckStatusSchema, ReadinessResponse, ReadinessResponseSchema, RebuildReadinessResponse, RebuildReadinessResponseSchema

### Community 199 - "Community 199"
Cohesion: 0.22
Nodes (9): assertLocalRebuildGuard(), assertLocalDevelopmentDatabase(), bootstrapAuthoritativeInventoryDevelopment(), buildBootstrapPlan(), LOCAL_HOSTS, main(), optionalUuid(), parseBootstrapArgs() (+1 more)

### Community 200 - "Community 200"
Cohesion: 0.31
Nodes (9): addExactHeaderEvidence(), asRecord(), CONVERSION_COUNT_HEADERS, normalizeHeader(), parseObservedCount(), recoverObservedCampaignTargetConversions(), resolveRevenueShapedCampaignTargetConversion(), roundedNumber() (+1 more)

### Community 201 - "Community 201"
Cohesion: 0.25
Nodes (6): extractFunction(), extractRetireFunction(), productionWrapper, remote, repoRoot, workflow

### Community 202 - "Community 202"
Cohesion: 0.25
Nodes (4): repoRoot, scriptPath, supportedExtensions, temporaryDirectories

### Community 203 - "Community 203"
Cohesion: 0.33
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 204 - "Community 204"
Cohesion: 0.40
Nodes (5): asRecord(), buildCampaignQualifiedProductTargetKeys(), cleanString(), rawCampaignAnchor(), rawProductAnchor()

### Community 207 - "Community 207"
Cohesion: 0.50
Nodes (4): is_allowlisted(), is_comment_line(), load_file_lines(), check-tenant-scope.sh script

### Community 208 - "Community 208"
Cohesion: 0.50
Nodes (4): extractEnvKeys(), readModelFile(), redactEnvText(), redactEnvValues()

### Community 209 - "Community 209"
Cohesion: 1.00
Nodes (3): makeRepository(), runRecord(), runWithChunks()

### Community 210 - "Community 210"
Cohesion: 0.67
Nodes (3): accountIdFor(), seedOrderInline(), seedReturnInline()

## Knowledge Gaps
- **2882 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+2877 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Core schema` to `prisma field: prisma — Shared Schema`, `Orders schema`, `prisma field: externalOptionId canonical option identity`, `prisma field: AdAction.listingId`, `Community 5`, `prisma field: channels — Marketplace Sync + SKU Matching`, `Community 8`, `Community 10`, `Core schema`, `Core schema`, `Community 13`, `AI schema`, `Orders schema`, `AI schema`, `Inventory schema`, `Core schema`, `AI schema`, `Channels schema`, `Community 23`, `Community 24`, `AI schema`, `AI schema`, `Orders schema`, `Inventory schema`, `AgentOS schema`, `AgentOS schema`, `Sourcing schema`, `Community 36`, `Channels schema`, `AI schema`, `AI schema`, `Advertising schema`, `Sourcing schema`, `prisma field: ActionTask.targetId`, `Core schema`, `AI schema`, `AI schema`, `Channels schema`, `Community 55`, `Sourcing schema`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `Community 61`, `Supply schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `AgentOS schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Community 79`, `Channels schema`, `Channels schema`, `Inventory schema`, `Community 83`, `Supply schema`, `Channels schema`, `AgentOS schema`, `System schema`, `Advertising schema`, `AgentOS schema`, `Orders schema`, `Channels schema`, `Orders schema`, `Supply schema`, `Sourcing schema`, `System schema`, `AgentOS schema`, `AI schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Orders schema`, `Sourcing schema`, `AgentOS schema`, `Finance schema`, `Channels schema`, `Sourcing schema`, `AgentOS schema`, `Orders schema`, `Supply schema`, `Inventory schema`, `AgentOS schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `Channels schema`, `Supply schema`, `AgentOS schema`, `Channels schema`, `Supply schema`, `Orders schema`, `Supply schema`, `Supply schema`, `Orders schema`, `Finance schema`, `Orders schema`, `Core schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Channels schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Advertising schema`, `System schema`, `Supply schema`, `Channels schema`, `Core schema`, `Channels schema`, `Orders schema`, `Channels schema`, `Inventory schema`, `Core schema`, `Sourcing schema`, `Core schema`, `Supply schema`, `Sourcing schema`, `Channels schema`?**
  _High betweenness centrality (0.211) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `Orders schema` to `prisma field: prisma — Shared Schema`, `prisma field: externalOptionId canonical option identity`, `prisma field: AdAction.listingId`, `Core schema`, `prisma field: channels — Marketplace Sync + SKU Matching`, `Core schema`, `Core schema`, `AI schema`, `Orders schema`, `AI schema`, `Inventory schema`, `Core schema`, `AI schema`, `Channels schema`, `AI schema`, `AI schema`, `Orders schema`, `Inventory schema`, `AgentOS schema`, `AgentOS schema`, `Sourcing schema`, `System schema`, `Channels schema`, `AI schema`, `AI schema`, `Advertising schema`, `Sourcing schema`, `prisma field: ActionTask.targetId`, `Core schema`, `AI schema`, `AI schema`, `Channels schema`, `Sourcing schema`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `Supply schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `AgentOS schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Supply schema`, `Channels schema`, `AgentOS schema`, `System schema`, `Advertising schema`, `AgentOS schema`, `Orders schema`, `Channels schema`, `Orders schema`, `Supply schema`, `Sourcing schema`, `System schema`, `AgentOS schema`, `AI schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Orders schema`, `Sourcing schema`, `AgentOS schema`, `Finance schema`, `Channels schema`, `Sourcing schema`, `AgentOS schema`, `Orders schema`, `Supply schema`, `Inventory schema`, `AgentOS schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `Channels schema`, `Supply schema`, `AgentOS schema`, `Channels schema`, `Supply schema`, `Orders schema`, `Supply schema`, `Supply schema`, `Orders schema`, `Finance schema`, `Orders schema`, `System schema`, `Core schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Channels schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Advertising schema`, `System schema`, `Supply schema`, `Channels schema`, `Core schema`, `Channels schema`, `Orders schema`, `Channels schema`, `Inventory schema`, `Core schema`, `System schema`, `Sourcing schema`, `Core schema`, `Supply schema`, `Sourcing schema`, `Channels schema`, `Core schema`?**
  _High betweenness centrality (0.176) - this node is a cross-community bridge._
- **Why does `Order` connect `Orders schema` to `prisma field: prisma — Shared Schema`, `Community 2`, `prisma field: externalOptionId canonical option identity`, `prisma field: AdAction.listingId`, `Community 5`, `Core schema`, `prisma field: channels — Marketplace Sync + SKU Matching`, `Community 8`, `Community 9`, `Community 130`, `Core schema`, `Orders schema`, `Community 144`, `Community 17`, `Core schema`, `AI schema`, `Community 22`, `Community 23`, `Orders schema`, `Community 27`, `Orders schema`, `Orders schema`, `Community 30`, `Community 31`, `Community 28`, `Community 36`, `Community 41`, `Community 43`, `Community 171`, `Community 47`, `prisma field: ActionTask.targetId`, `Orders schema`, `Core schema`, `Community 177`, `Community 55`, `Community 61`, `Community 192`, `Community 201`, `Community 83`, `Community 87`, `Orders schema`, `Community 99`, `Community 106`, `Orders schema`, `Community 123`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **Are the 201 inferred relationships involving `Organization` (e.g. with `channel-registration-capability.adapter.spec.ts` and `channel-registration-capability.adapter.ts`) actually correct?**
  _`Organization` has 201 INFERRED edges - model-reasoned connections that need verification._
- **Are the 148 inferred relationships involving `ChannelAccount` (e.g. with `channel-registration-capability.adapter.spec.ts` and `channel-registration-capability.adapter.ts`) actually correct?**
  _`ChannelAccount` has 148 INFERRED edges - model-reasoned connections that need verification._
- **Are the 109 inferred relationships involving `ChannelListing` (e.g. with `channel-registration-capability.adapter.ts` and `channel-listing.controller.ts`) actually correct?**
  _`ChannelListing` has 109 INFERRED edges - model-reasoned connections that need verification._
- **Are the 141 inferred relationships involving `Order` (e.g. with `channel-sync.controller.ts` and `dto/index.ts`) actually correct?**
  _`Order` has 141 INFERRED edges - model-reasoned connections that need verification._