# Graph Report - schema-consumers  (2026-08-01)

## Corpus Check
- 436 files · ~231,206 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 6666 nodes · 39661 edges · 243 communities (222 shown, 21 thin omitted)
- Extraction: 30% EXTRACTED · 70% INFERRED · 0% AMBIGUOUS · INFERRED: 27691 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- prisma field: prisma — Shared Schema
- Community 1
- prisma field: externalOptionId canonical option identity
- Orders schema
- Community 4
- Core schema
- prisma field: channels — Marketplace Sync + SKU Matching
- AI schema
- Community 8
- Community 9
- Core schema
- Community 11
- AI schema
- Community 13
- Sourcing schema
- Community 15
- Community 16
- Orders schema
- Community 18
- prisma field: ActionTask.targetId
- Channels schema
- Core schema
- Community 22
- Community 23
- Core schema
- Channels schema
- Community 26
- AI schema
- Community 28
- Core schema
- AI schema
- Orders schema
- Orders schema
- Community 33
- Community 34
- AgentOS schema
- AI schema
- Core schema
- Orders schema
- AgentOS schema
- Community 40
- Channels schema
- AI schema
- System schema
- AI schema
- Community 45
- Community 46
- AI schema
- Community 48
- Community 49
- Core schema
- Community 51
- Community 52
- Sourcing schema
- Community 54
- Community 55
- AgentOS schema
- AgentOS schema
- Community 58
- Core schema
- Supply schema
- Channels schema
- Channels schema
- Community 63
- Inventory schema
- Community 65
- Community 66
- AgentOS schema
- Community 68
- System schema
- AgentOS schema
- AgentOS schema
- Channels schema
- Community 73
- Community 74
- Channels schema
- Inventory schema
- Community 77
- Community 78
- Community 79
- Community 80
- Supply schema
- Community 82
- Community 83
- Community 84
- AgentOS schema
- Channels schema
- Community 87
- Community 88
- System schema
- Advertising schema
- AgentOS schema
- Orders schema
- Community 93
- Community 94
- Community 95
- Channels schema
- Supply schema
- Sourcing schema
- Community 99
- AgentOS schema
- AI schema
- System schema
- Channels schema
- Sourcing schema
- Core schema
- Sourcing schema
- AI schema
- Community 108
- AgentOS schema
- Finance schema
- Orders schema
- Sourcing schema
- Community 113
- AgentOS schema
- Orders schema
- Channels schema
- Supply schema
- Inventory schema
- Community 119
- Community 120
- Community 121
- Community 122
- Community 123
- AgentOS schema
- Finance schema
- Sourcing schema
- Sourcing schema
- Channels schema
- Channels schema
- AI schema
- Community 131
- Core schema
- Inventory schema
- Supply schema
- Community 135
- Community 136
- Community 137
- AgentOS schema
- Channels schema
- Channels schema
- Advertising schema
- Inventory schema
- Inventory schema
- Supply schema
- Inventory schema
- Supply schema
- Community 147
- Community 148
- Community 149
- Community 150
- Finance schema
- System schema
- Sourcing schema
- Finance schema
- Finance schema
- Channels schema
- Channels schema
- Inventory schema
- Channels schema
- Inventory schema
- Supply schema
- Community 162
- Community 163
- Community 164
- Community 165
- Advertising schema
- System schema
- Supply schema
- Channels schema
- Core schema
- Channels schema
- Community 172
- Community 173
- Community 174
- Inventory schema
- Channels schema
- Inventory schema
- Core schema
- System schema
- Community 180
- Community 181
- Sourcing schema
- System schema
- Core schema
- Supply schema
- Sourcing schema
- Community 187
- Community 188
- Community 189
- Community 190
- Community 191
- Community 192
- Community 193
- Advertising schema
- System schema
- Advertising schema
- Community 197
- Community 198
- Community 199
- Community 200
- Community 201
- Community 202
- Channels schema
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
- Community 234
- Community 235
- Community 236
- Community 237
- Community 238
- Community 239

## God Nodes (most connected - your core abstractions)
1. `Organization` - 480 edges
2. `Database ERD` - 389 edges
3. `ChannelAccount` - 205 edges
4. `ChannelListing` - 198 edges
5. `Order` - 193 edges
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

## Communities (243 total, 21 thin omitted)

### Community 0 - "prisma field: prisma — Shared Schema"
Cohesion: 0.14
Nodes (291): UploadedWorkbookFile, HEADERS, USER, CHANNEL_ACCOUNT_LIST_SELECT, chunkSelect, ErrorInput, LockedRun, OwnedRunInput (+283 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (169): ActionTask, ActionTaskExecuteResponse, ActionTaskList, ActionTaskListSchema, ActionTaskRelatedProduct, ActionTaskRelatedProductSchema, ActionTaskSchema, ActionTaskSourceAlert (+161 more)

### Community 2 - "prisma field: externalOptionId canonical option identity"
Cohesion: 0.07
Nodes (100): ChannelCatalogIdentityMedia, ChannelCatalogIdentityOption, ChannelCatalogIdentityProduct, ChannelCatalogIdentityUpsertInput, ChannelCatalogIdentityUpsertResult, PersistedChannelCatalogListing, upsertChannelCatalogIdentities(), CanonicalParent (+92 more)

### Community 3 - "Orders schema"
Cohesion: 0.04
Nodes (114): ChannelSyncRepositoryAdapter, ListingForProductSync, reconcileProductDetailOption(), Injectable, ProductListingSyncResult, ChannelAccountService, Injectable, formatKstIso() (+106 more)

### Community 4 - "Community 4"
Cohesion: 0.02
Nodes (101): AgentApprovalRequestSummary, AgentApprovalRequestSummarySchema, AgentApprovalStatus, AgentApprovalStatusSchema, AgentArtifactHandoffSummary, AgentArtifactHandoffSummarySchema, AgentArtifactStatus, AgentArtifactStatusSchema (+93 more)

### Community 5 - "Core schema"
Cohesion: 0.02
Nodes (91): ChannelRecipeAutomationProductTopology, classifyRecipeAutomationProductGroups(), groupDecision(), autoItem, configuredItem, quantityReviewItem, reviewItem, ChannelListingOption.attributesJson (+83 more)

### Community 6 - "prisma field: channels — Marketplace Sync + SKU Matching"
Cohesion: 0.04
Nodes (75): buildCoupangWingSnapshotCoverage(), CoupangWingSnapshotCoverage, ParsedWingCatalogRow, ParsedWingCatalogSkippedRow, ChannelProductCandidate, ChannelProductCandidateRankingInput, emptyEvidence(), keep() (+67 more)

### Community 7 - "AI schema"
Cohesion: 0.03
Nodes (82): packages/shared — @kiditem/shared, AI, ProductPreparation.selectedThumbnailGenerationCandidateId, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.createdAt, ThumbnailGeneration.deletedAt, ThumbnailGeneration.editAnalysis (+74 more)

### Community 8 - "Community 8"
Cohesion: 0.03
Nodes (73): CreateMasterProductInput, CreateMasterProductInputSchema, CreateProductVariantFieldsSchema, CreateProductVariantInput, CreateProductVariantInputSchema, CreateProductVariantRecipeIfEmptySchema, CreateProductVariantRecipesIfEmptyInput, CreateProductVariantRecipesIfEmptyInputSchema (+65 more)

### Community 9 - "Community 9"
Cohesion: 0.03
Nodes (73): AdMetricsDetail, AdMetricsDetailSchema, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary, DashboardAdSummarySchema (+65 more)

### Community 10 - "Core schema"
Cohesion: 0.03
Nodes (71): ChannelListing.brand, ChannelListing.category, ChannelListing.channelAccount, ChannelListing.channelAccountId, ChannelListing.channelName, ChannelListing.createdAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo (+63 more)

### Community 11 - "Community 11"
Cohesion: 0.07
Nodes (70): option(), AdapterCommand, appendFlag(), appendOption(), appendProjectReferenceDefaults(), appendValues(), archiveFileName(), archiveShaFileName() (+62 more)

### Community 12 - "AI schema"
Cohesion: 0.03
Nodes (65): ContentAsset.originGenerationGroupId, ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.editedHtmlSavedAt (+57 more)

### Community 13 - "Community 13"
Cohesion: 0.06
Nodes (47): aggregateMappingStatus(), assertLockedListing(), assertOperationActor(), ChannelListingRepositoryAdapter, contains(), firstPrice(), isUniqueViolation(), ListingRow (+39 more)

### Community 14 - "Sourcing schema"
Cohesion: 0.04
Nodes (57): CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id, CandidateImage.isPrimary (+49 more)

### Community 15 - "Community 15"
Cohesion: 0.05
Nodes (45): ChannelCatalogImportController, Controller, Inject, ChannelSkuAvailabilityController, Controller, ChannelRecipeSuggestionContextRepositoryAdapter, recipeSource(), Injectable (+37 more)

### Community 16 - "Community 16"
Cohesion: 0.04
Nodes (54): ChunkRequestBaseSchema, COUPANG_CATALOG_BROWSER_FILE_NAME, COUPANG_CATALOG_COLLECTOR_VERSION, COUPANG_CATALOG_MAX_CHUNK_BYTES, COUPANG_CATALOG_MAX_MEDIA_PER_OWNER, COUPANG_CATALOG_MAX_OPTIONS_PER_PRODUCT, COUPANG_CATALOG_MAX_PRODUCT_BYTES, COUPANG_CATALOG_MAX_PRODUCTS_PER_CHUNK (+46 more)

### Community 17 - "Orders schema"
Cohesion: 0.04
Nodes (58): Orders, CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id (+50 more)

### Community 18 - "Community 18"
Cohesion: 0.04
Nodes (56): ACCOUNT_AD_DAILY_DIGEST_KEYS, AD_ROW_KEYS, AD_SUMMARY_KEYS, ADS_DAILY_ROW_KEYS, ADS_KPI_KEYS, assertExactCount(), assertIsoTimestamp(), assertLocalRebuildGuard() (+48 more)

### Community 19 - "prisma field: ActionTask.targetId"
Cohesion: 0.05
Nodes (47): ActionTask.targetId, ActionTask.targetType, AdAction.targetType, AgentArtifact.targetId, Alert.targetId, Alert.targetType, PANEL_RUN_SOURCES, PanelRunSource (+39 more)

### Community 20 - "Channels schema"
Cohesion: 0.04
Nodes (55): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+47 more)

### Community 21 - "Core schema"
Cohesion: 0.04
Nodes (49): AVAILABILITY_STATUSES, ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id, ChannelAccount.isPrimary, ChannelAccount.name (+41 more)

### Community 22 - "Community 22"
Cohesion: 0.07
Nodes (49): Lane, value(), APPLY_STORAGE_CACHE_CONTROL_CONFIRMATION, applyCacheControl(), ApplyResult, applyS3CacheControl(), applySupabaseCacheControl(), assertApplyAllowed() (+41 more)

### Community 23 - "Community 23"
Cohesion: 0.09
Nodes (52): assertNoLocalAuthSecrets(), assertNonProductionTarget(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged(), assertSha256(), BaselineManifest, BaselineManifestExpectation, baselineObjectKeys (+44 more)

### Community 24 - "Core schema"
Cohesion: 0.05
Nodes (46): Core, AuthSession.createdAt, AuthSession.expiresAt, AuthSession.id, AuthSession.revokedAt, AuthSession.tokenHash, AuthSession.user, AuthSession.userId (+38 more)

### Community 25 - "Channels schema"
Cohesion: 0.04
Nodes (50): ChannelListingDailySnapshot.rawSnapshotId, ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isOfferWinner, ChannelListingOptionDailySnapshot.lastObservedAt (+42 more)

### Community 26 - "Community 26"
Cohesion: 0.09
Nodes (46): apiHeaders(), apiUrl(), Args, assertSafeDatasetId(), assertSupportedReplayPayloads(), BundleManifest, BundlePayload, BundleReference (+38 more)

### Community 27 - "AI schema"
Cohesion: 0.04
Nodes (51): DetailPageImageArtifact.byteLength, DetailPageImageArtifact.contentType, DetailPageImageArtifact.createdAt, DetailPageImageArtifact.createdBy, DetailPageImageArtifact.createdByUserId, DetailPageImageArtifact.id, DetailPageImageArtifact.imageUrl, DetailPageImageArtifact.objectKey (+43 more)

### Community 28 - "Community 28"
Cohesion: 0.04
Nodes (49): boundedText(), isoDay, isRocketWorkbookBlockingReason(), requiredText(), ROCKET_PO_ROW_LIMIT, ROCKET_SAVED_PO_RESPONSE_PROFILE, ROCKET_SHORTAGE_REASONS, ROCKET_WORKBOOK_BLOCKING_REASONS (+41 more)

### Community 29 - "Core schema"
Cohesion: 0.05
Nodes (48): ProductVariantComponent.confirmedAt, ProductVariantComponent.confirmedBy, ProductVariantComponent.createdAt, ProductVariantComponent.id, ProductVariantComponent.organization, ProductVariantComponent.productVariant, ProductVariantComponent.productVariantId, ProductVariantComponent.quantity (+40 more)

### Community 30 - "AI schema"
Cohesion: 0.05
Nodes (48): ContentGeneration.contentWorkspaceId, ContentWorkspace.channelListing, ContentWorkspace.channelListingId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.createdByUserId, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageRevision (+40 more)

### Community 31 - "Orders schema"
Cohesion: 0.04
Nodes (46): Review.content, Review.createdAt, Review.externalProductId, Review.externalReviewId, Review.id, Review.imageCount, Review.isBlinded, Review.itemName (+38 more)

### Community 32 - "Orders schema"
Cohesion: 0.05
Nodes (45): OrderLineItem.createdAt, OrderLineItem.externalBarcode, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.metadata, OrderLineItem.optionName, OrderLineItem.order (+37 more)

### Community 33 - "Community 33"
Cohesion: 0.07
Nodes (22): ChannelRegistrationCapabilityAdapter, toSellpiaMatch(), Injectable, ChannelsMarketplaceRegistrationCapabilityPort, ExternalProductRegistrationMatchPreviewInput, ExternalProductRegistrationMatchPreviewResult, ExternalProductRegistrationPreflightInput, ExternalProductRegistrationPreflightResult (+14 more)

### Community 34 - "Community 34"
Cohesion: 0.07
Nodes (37): CurrentOrganization, CurrentUser, Param, Post, cellText(), collectParentMetadataConflicts(), decodeWorksheetRange(), expandMergedParentCells() (+29 more)

### Community 35 - "AgentOS schema"
Cohesion: 0.05
Nodes (44): AgentRunRequest.agentInstance, AgentRunRequest.attempts, AgentRunRequest.claimedAt, AgentRunRequest.claimedBy, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.coalescedIntoRequestId, AgentRunRequest.conversation, AgentRunRequest.createdAt (+36 more)

### Community 36 - "AI schema"
Cohesion: 0.05
Nodes (42): ContentGeneration.detailPageArtifactId, ContentWorkspace.currentDetailPageArtifactId, ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.contentWorkspaceId, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.createdByUserId (+34 more)

### Community 37 - "Core schema"
Cohesion: 0.06
Nodes (35): Organization.createdAt, Organization.id, Organization.name, Organization.slug, Organization.updatedAt, Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr (+27 more)

### Community 38 - "Orders schema"
Cohesion: 0.06
Nodes (41): SellpiaOrderTransmissionIntent.abortedAt, SellpiaOrderTransmissionIntent.createdAt, SellpiaOrderTransmissionIntent.createdBy, SellpiaOrderTransmissionIntent.creator, SellpiaOrderTransmissionIntent.finalizedAt, SellpiaOrderTransmissionIntent.finalizedGeneration, SellpiaOrderTransmissionIntent.id, SellpiaOrderTransmissionIntent.intentKey (+33 more)

### Community 39 - "AgentOS schema"
Cohesion: 0.05
Nodes (42): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+34 more)

### Community 40 - "Community 40"
Cohesion: 0.08
Nodes (21): ChannelSyncController, Body, Controller, CurrentOrganization, CurrentUser, Get, Post, OperationAlertPort (+13 more)

### Community 41 - "Channels schema"
Cohesion: 0.06
Nodes (40): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignIdentity, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel (+32 more)

### Community 42 - "AI schema"
Cohesion: 0.06
Nodes (36): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height (+28 more)

### Community 43 - "System schema"
Cohesion: 0.05
Nodes (34): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon, Marketplace.id (+26 more)

### Community 44 - "AI schema"
Cohesion: 0.06
Nodes (40): ProductPreparation.approvedAt, ProductPreparation.approvedByUser, ProductPreparation.channelAccount, ProductPreparation.channelAccountId, ProductPreparation.channelListing, ProductPreparation.channelListingId, ProductPreparation.createdAt, ProductPreparation.createdByUser (+32 more)

### Community 45 - "Community 45"
Cohesion: 0.05
Nodes (38): CalendarDateSchema, ChecksumSchema, FiniteNumberSchema, NullableMetricSchema, ProductAbcAdvertisingSourceStatus, ProductAbcAdvertisingSourceStatusSchema, ProductAbcCalculationStatus, ProductAbcCalculationStatusSchema (+30 more)

### Community 46 - "Community 46"
Cohesion: 0.10
Nodes (21): ChannelProductMatchingController, Body, Controller, CurrentOrganization, Get, Param, Post, Put (+13 more)

### Community 47 - "AI schema"
Cohesion: 0.06
Nodes (38): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+30 more)

### Community 48 - "Community 48"
Cohesion: 0.05
Nodes (36): deriveSellpiaInventoryFreshness(), FixedSellpiaAccountKeySchema, FixedSellpiaOriginSchema, IsoDateTimeStringSchema, SELLPIA_INVENTORY_COLLECTION_FAILURE_CODES, SELLPIA_INVENTORY_FRESHNESS_STATUSES, SELLPIA_INVENTORY_REFRESH_REASONS, SellpiaFreshnessDerivationInput (+28 more)

### Community 49 - "Community 49"
Cohesion: 0.09
Nodes (26): DATA_MIGRATION_RELEASES, DataMigration, DataMigrationContext, DataMigrationTarget, MigrationResult, isLegacyDetailEditorHref(), rewriteLegacyDetailEditorAlertHrefs, rewriteLegacyDetailEditorHref() (+18 more)

### Community 50 - "Core schema"
Cohesion: 0.07
Nodes (36): ChannelListing.lastImportRunId, ChannelListingOption.lastImportRunId, Order.sourceImportRunId, SellpiaInventorySku.lastImportRunId, SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.createdAt (+28 more)

### Community 51 - "Community 51"
Cohesion: 0.08
Nodes (33): ClientRenderArtifactSchema, ClientRenderContentTypeSchema, ClientRenderDateSchema, ClientRenderOutputWidthSchema, ClientRenderUuidSchema, ClientRenderVariantSchema, DETAIL_IMAGE_COUNTS, DETAIL_PAGE_AGE_GROUPS (+25 more)

### Community 52 - "Community 52"
Cohesion: 0.10
Nodes (33): item(), automaticReason(), automaticStatus(), BarcodeEvidence, bestSimilarityPerSku(), ChannelRecipeAutomationDecision, ChannelRecipeSuggestionEvidenceKind, ChannelRecipeSuggestionInput (+25 more)

### Community 53 - "Sourcing schema"
Cohesion: 0.07
Nodes (35): ProductRegistrationExecution.channelAccount, ProductRegistrationExecution.channelAccountId, ProductRegistrationExecution.channelListing, ProductRegistrationExecution.channelListingId, ProductRegistrationExecution.completedAt, ProductRegistrationExecution.createdAt, ProductRegistrationExecution.executionKind, ProductRegistrationExecution.expectedProviderAccountId (+27 more)

### Community 54 - "Community 54"
Cohesion: 0.13
Nodes (34): appReleaseVersion(), assertBaselineCli(), baselineRegistry(), CliArgs, Command, commandBaselineExport(), commandBaselineRestore(), COMMANDS (+26 more)

### Community 55 - "Community 55"
Cohesion: 0.07
Nodes (25): applyProductLinksInBatches(), applyVariantLinksInBatches(), buildCatalogProductProvisioningListings(), publishCatalogOperationalProducts(), unique(), validateProvisionedLinks(), nextPublicationSequence(), productsFromRows() (+17 more)

### Community 56 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+25 more)

### Community 57 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.startedAt, WorkflowRun.status (+25 more)

### Community 58 - "Community 58"
Cohesion: 0.07
Nodes (29): SellpiaInventoryCollectionFailureCodeSchema, SellpiaInventoryQualityReportSchema, SellpiaInventoryRefreshReasonSchema, CompletedSourceArtifactRun, CoupangWingCatalogImportResponse, CoupangWingCatalogImportResponseSchema, ImportChanges, MAX_SELLPIA_INVENTORY_BROWSER_SNAPSHOT_ROWS (+21 more)

### Community 59 - "Core schema"
Cohesion: 0.07
Nodes (32): MasterProductAbcEvaluation.adjustedScore, MasterProductAbcEvaluation.advertisingSourceCapturedAt, MasterProductAbcEvaluation.advertisingSourceStatus, MasterProductAbcEvaluation.calculatedAt, MasterProductAbcEvaluation.calculationStatus, MasterProductAbcEvaluation.costComponentsJson, MasterProductAbcEvaluation.firstValidPaidSaleAt, MasterProductAbcEvaluation.formulaVersion (+24 more)

### Community 60 - "Supply schema"
Cohesion: 0.07
Nodes (32): RocketPurchaseConfirmation.artifactBytes, RocketPurchaseConfirmation.artifactContentType, RocketPurchaseConfirmation.artifactFileName, RocketPurchaseConfirmation.artifactSha256, RocketPurchaseConfirmation.artifactStoredAt, RocketPurchaseConfirmation.channelAccount, RocketPurchaseConfirmation.channelAccountId, RocketPurchaseConfirmation.completedAt (+24 more)

### Community 61 - "Channels schema"
Cohesion: 0.08
Nodes (31): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.channelAccount, ChannelScrapeRun.channelAccountId, ChannelScrapeRun.clientRunKey, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson (+23 more)

### Community 62 - "Channels schema"
Cohesion: 0.07
Nodes (31): RocketPoCatalogLine.businessDateBasis, RocketPoCatalogLine.center, RocketPoCatalogLine.createdAt, RocketPoCatalogLine.hasConfirmation, RocketPoCatalogLine.id, RocketPoCatalogLine.inboundType, RocketPoCatalogLine.orderQty, RocketPoCatalogLine.organization (+23 more)

### Community 63 - "Community 63"
Cohesion: 0.09
Nodes (26): CHANNEL_LISTING_SORTS, CHANNEL_LISTING_TABS, ChannelListingDeletionDto, ChannelListingDeletionUnresolvedDto, ChannelListingQueryDto, IsIn, IsOptional, IsString (+18 more)

### Community 64 - "Inventory schema"
Cohesion: 0.07
Nodes (30): SellpiaInventoryState.activeGeneration, SellpiaInventoryState.activeSyncLeaseExpiresAt, SellpiaInventoryState.activeSyncOwner, SellpiaInventoryState.activeSyncOwnerUserId, SellpiaInventoryState.activeSyncScope, SellpiaInventoryState.activeSyncStartedAt, SellpiaInventoryState.activeSyncToken, SellpiaInventoryState.createdAt (+22 more)

### Community 65 - "Community 65"
Cohesion: 0.19
Nodes (30): assertCurrentRebuildBinding(), assertRebuildImportPrerequisites(), assertReplayCounts(), assertReplayFactDigest(), assertSharedDatabaseIdentity(), assertStoredImportBinding(), assertUuid(), bindRebuildImports() (+22 more)

### Community 66 - "Community 66"
Cohesion: 0.14
Nodes (14): ChannelListingController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+6 more)

### Community 67 - "AgentOS schema"
Cohesion: 0.08
Nodes (29): AgentOS, AgentAuthorizationEvent.toolId, AgentInstanceToolPolicy.agentInstance, AgentInstanceToolPolicy.agentInstanceId, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentInstanceToolPolicy.dryRunMode (+21 more)

### Community 68 - "Community 68"
Cohesion: 0.10
Nodes (10): SellpiaRecipeEvidenceAdapter, toEvidenceSku(), Inject, Injectable, SellpiaRecipeEvidencePort, SellpiaRecipeEvidenceSku, ChannelRecipeSuggestionContextRepositoryPort, SellpiaManualMatchRepositoryPort (+2 more)

### Community 69 - "System schema"
Cohesion: 0.08
Nodes (26): Alert.actionTask, Alert.actorUser, Alert.actorUserId, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead (+18 more)

### Community 70 - "AgentOS schema"
Cohesion: 0.07
Nodes (28): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.approver, AgentApprovalRequest.approverUserId, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy, AgentApprovalRequest.decidedByUserId (+20 more)

### Community 71 - "AgentOS schema"
Cohesion: 0.08
Nodes (28): AgentToolInvocation.agentInstance, AgentToolInvocation.approvalRequest, AgentToolInvocation.approvalRequestId, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt, AgentToolInvocation.errorCode (+20 more)

### Community 72 - "Channels schema"
Cohesion: 0.08
Nodes (28): ChannelListingDeletionOperation.authorizationExpiresAt, ChannelListingDeletionOperation.channelAccount, ChannelListingDeletionOperation.channelAccountId, ChannelListingDeletionOperation.channelListing, ChannelListingDeletionOperation.channelListingId, ChannelListingDeletionOperation.completedAt, ChannelListingDeletionOperation.createdAt, ChannelListingDeletionOperation.expectedProviderAccountId (+20 more)

### Community 73 - "Community 73"
Cohesion: 0.08
Nodes (22): ChannelAccountListItem, ChannelAccountListItemSchema, CoupangAccountSettings, CoupangAccountSettingsSchema, UpdateCoupangAccountSettings, ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow (+14 more)

### Community 74 - "Community 74"
Cohesion: 0.14
Nodes (27): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+19 more)

### Community 75 - "Channels schema"
Cohesion: 0.08
Nodes (27): CoupangWingSalesRankDailySnapshot.businessDate, CoupangWingSalesRankDailySnapshot.capturedAt, CoupangWingSalesRankDailySnapshot.categoryHierarchy, CoupangWingSalesRankDailySnapshot.collectedCount, CoupangWingSalesRankDailySnapshot.conversionRate28d, CoupangWingSalesRankDailySnapshot.createdAt, CoupangWingSalesRankDailySnapshot.id, CoupangWingSalesRankDailySnapshot.itemId (+19 more)

### Community 76 - "Inventory schema"
Cohesion: 0.09
Nodes (27): InventoryCommitment.businessKey, InventoryCommitment.createdAt, InventoryCommitment.createdBy, InventoryCommitment.creator, InventoryCommitment.id, InventoryCommitment.inventoryGeneration, InventoryCommitment.kind, InventoryCommitment.organization (+19 more)

### Community 77 - "Community 77"
Cohesion: 0.15
Nodes (27): asRecord(), assertAllowedRecord(), assertAllowedRows(), assertAllowedScalarRecord(), assertNoPii(), assertObservedMetrics(), assertOptionalScalar(), assertPlainRecord() (+19 more)

### Community 78 - "Community 78"
Cohesion: 0.12
Nodes (23): AdCampaignAccountProjection, AdCampaignDailyRepairPlan, AdCampaignListingProjection, AdCampaignRepairRunInput, AdCampaignRepairSnapshotInput, AdCampaignTargetProjection, AdMetrics, asRecord() (+15 more)

### Community 79 - "Community 79"
Cohesion: 0.11
Nodes (15): assertExactProductGraph(), MarketplaceRegistrationRepositoryAdapter, Injectable, upsertExactOptionLinks(), MarketplaceRegistrationRepositoryPort, asRecord(), KidItemFirstOptionLink, KidItemFirstRegistrationLinks (+7 more)

### Community 80 - "Community 80"
Cohesion: 0.08
Nodes (17): RocketPoCatalogPort, RocketPoCatalogResolution, automationReason(), countDecision(), emptyScopedResult(), proposalVersion(), requiredSuggestion(), toPreviewItem() (+9 more)

### Community 81 - "Supply schema"
Cohesion: 0.08
Nodes (26): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+18 more)

### Community 82 - "Community 82"
Cohesion: 0.08
Nodes (23): StatisticsCategoryRow, StatisticsCategoryRowSchema, StatisticsDeliveryDaily, StatisticsDeliveryDailySchema, StatisticsDeliveryResponse, StatisticsDeliveryResponseSchema, StatisticsGradeRow, StatisticsGradeRowSchema (+15 more)

### Community 83 - "Community 83"
Cohesion: 0.09
Nodes (9): Inject, ChannelSkuAvailabilityPort, ChannelProductMatchingRepositoryPort, Inject, ChannelSkuAvailabilityService, matchesStatus(), toAvailabilityItem(), Inject (+1 more)

### Community 84 - "Community 84"
Cohesion: 0.09
Nodes (8): CoupangProviderPort, ChannelSyncRepositoryPort, OrderSyncDeps, ProductSyncDeps, Inject, Optional, Inject, Optional

### Community 85 - "AgentOS schema"
Cohesion: 0.09
Nodes (24): AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy, AgentAuthorizationEvent.decidedByUserId, AgentAuthorizationEvent.decision (+16 more)

### Community 86 - "Channels schema"
Cohesion: 0.10
Nodes (24): SellpiaProductMonthlySales.buyPrice, SellpiaProductMonthlySales.capturedAt, SellpiaProductMonthlySales.costBasis, SellpiaProductMonthlySales.coverageEndDate, SellpiaProductMonthlySales.coverageStartDate, SellpiaProductMonthlySales.createdAt, SellpiaProductMonthlySales.id, SellpiaProductMonthlySales.inAmount (+16 more)

### Community 87 - "Community 87"
Cohesion: 0.20
Nodes (8): ChannelDashboardController, Controller, CurrentOrganization, Get, Query, CoupangDateRangeQueryDto, ChannelDashboardService, Injectable

### Community 88 - "Community 88"
Cohesion: 0.19
Nodes (20): bigrams(), ChannelRecipeNameEvidence, ChannelRecipeNameIndex, ChannelRecipeNameOption, ChannelRecipeNameSku, compareEvidence(), createChannelRecipeNameIndex(), diceCoefficient() (+12 more)

### Community 89 - "System schema"
Cohesion: 0.10
Nodes (23): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.href (+15 more)

### Community 90 - "Advertising schema"
Cohesion: 0.09
Nodes (23): AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+15 more)

### Community 91 - "AgentOS schema"
Cohesion: 0.09
Nodes (23): AgentInstance.adapterConfig, AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.icon, AgentInstance.id, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name (+15 more)

### Community 92 - "Orders schema"
Cohesion: 0.10
Nodes (23): OrderReturn.channelAccount, OrderReturn.channelAccountId, OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.id (+15 more)

### Community 93 - "Community 93"
Cohesion: 0.09
Nodes (19): adapterPaths, BROWSER_COLLECTION_ATTENTION_REASONS, BROWSER_COLLECTION_PRODUCERS, BROWSER_COLLECTION_STATES, BrowserCollectionAttentionReasonSchema, BrowserCollectionClassificationSchema, BrowserCollectionCommand, BrowserCollectionCommandSchema (+11 more)

### Community 94 - "Community 94"
Cohesion: 0.11
Nodes (18): assertActiveCoupangAccount(), assertCanonicalAccount(), ChannelCatalogPublicationRepositoryAdapter, completeCollectionRun(), completedCollectionResult(), flattenMedia(), jsonRecord(), lockAccount() (+10 more)

### Community 95 - "Community 95"
Cohesion: 0.13
Nodes (22): assembleCompleteSnapshot(), assertSameManifest(), buildCollectionStatus(), countMedia(), countOptions(), derivePhase(), firstDate(), hashCatalogChunkPayload() (+14 more)

### Community 96 - "Channels schema"
Cohesion: 0.11
Nodes (22): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.channelAccount, ChannelAccountDailyKpiSnapshot.channelAccountId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+14 more)

### Community 97 - "Supply schema"
Cohesion: 0.11
Nodes (22): RocketPurchaseConfirmationLine.channelListingOption, RocketPurchaseConfirmationLine.channelListingOptionId, RocketPurchaseConfirmationLine.collectedAt, RocketPurchaseConfirmationLine.collectedOrderLineItemId, RocketPurchaseConfirmationLine.confirmation, RocketPurchaseConfirmationLine.confirmationId, RocketPurchaseConfirmationLine.confirmedQuantity, RocketPurchaseConfirmationLine.createdAt (+14 more)

### Community 98 - "Sourcing schema"
Cohesion: 0.11
Nodes (22): TiktokCreativeTrendDailySnapshot.businessDate, TiktokCreativeTrendDailySnapshot.capturedAt, TiktokCreativeTrendDailySnapshot.createdAt, TiktokCreativeTrendDailySnapshot.entityKey, TiktokCreativeTrendDailySnapshot.growthPct, TiktokCreativeTrendDailySnapshot.id, TiktokCreativeTrendDailySnapshot.industry, TiktokCreativeTrendDailySnapshot.label (+14 more)

### Community 99 - "Community 99"
Cohesion: 0.15
Nodes (15): envelopeToJson(), maskAccessKey(), readCredentialsConfig(), stripLegacyCredentialKeys(), toJsonRecord(), toRecord(), trimToOptional(), CoupangCredentials (+7 more)

### Community 100 - "AgentOS schema"
Cohesion: 0.10
Nodes (21): AgentArtifact.agentInstance, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization, AgentArtifact.request (+13 more)

### Community 101 - "AI schema"
Cohesion: 0.11
Nodes (21): AiDirectJob.attempts, AiDirectJob.claimedAt, AiDirectJob.claimedBy, AiDirectJob.createdAt, AiDirectJob.finishedAt, AiDirectJob.id, AiDirectJob.jobType, AiDirectJob.lastErrorCode (+13 more)

### Community 102 - "System schema"
Cohesion: 0.10
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+13 more)

### Community 103 - "Channels schema"
Cohesion: 0.11
Nodes (21): CoupangKeywordRankDailySnapshot.adRank, CoupangKeywordRankDailySnapshot.businessDate, CoupangKeywordRankDailySnapshot.capturedAt, CoupangKeywordRankDailySnapshot.createdAt, CoupangKeywordRankDailySnapshot.id, CoupangKeywordRankDailySnapshot.itemId, CoupangKeywordRankDailySnapshot.keyword, CoupangKeywordRankDailySnapshot.organicRank (+13 more)

### Community 104 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): LiveCommerceBroadcastDailySnapshot.broadcasterId, LiveCommerceBroadcastDailySnapshot.broadcasterName, LiveCommerceBroadcastDailySnapshot.broadcastId, LiveCommerceBroadcastDailySnapshot.businessDate, LiveCommerceBroadcastDailySnapshot.capturedAt, LiveCommerceBroadcastDailySnapshot.coverImageUrl, LiveCommerceBroadcastDailySnapshot.createdAt, LiveCommerceBroadcastDailySnapshot.endedAt (+13 more)

### Community 105 - "Core schema"
Cohesion: 0.12
Nodes (21): MasterProductAbcEvaluation.formulaVersionId, MasterProductAbcFormulaVersion.calculationCodeChecksum, MasterProductAbcFormulaVersion.calibrationMetricsJson, MasterProductAbcFormulaVersion.createdAt, MasterProductAbcFormulaVersion.firstActivatedAt, MasterProductAbcFormulaVersion.foldCount, MasterProductAbcFormulaVersion.formulaChecksum, MasterProductAbcFormulaVersion.formulaJson (+13 more)

### Community 106 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): ShortsTrendDailySnapshot.businessDate, ShortsTrendDailySnapshot.capturedAt, ShortsTrendDailySnapshot.channelName, ShortsTrendDailySnapshot.commentCount, ShortsTrendDailySnapshot.createdAt, ShortsTrendDailySnapshot.id, ShortsTrendDailySnapshot.keyword, ShortsTrendDailySnapshot.likeCount (+13 more)

### Community 107 - "AI schema"
Cohesion: 0.10
Nodes (21): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.contentWorkspace, ThumbnailAnalysis.contentWorkspaceId, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id (+13 more)

### Community 108 - "Community 108"
Cohesion: 0.10
Nodes (7): ChannelsDeletionPasswordAdapter, Injectable, ChannelsDeletionPasswordPort, ChannelListingRepositoryPort, Inject, Optional, Inject

### Community 109 - "AgentOS schema"
Cohesion: 0.11
Nodes (20): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id, AgentCostEvent.inputTokens (+12 more)

### Community 110 - "Finance schema"
Cohesion: 0.12
Nodes (20): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit (+12 more)

### Community 111 - "Orders schema"
Cohesion: 0.11
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 112 - "Sourcing schema"
Cohesion: 0.12
Nodes (20): Sourcing1688HotProductDailySnapshot.businessDate, Sourcing1688HotProductDailySnapshot.capturedAt, Sourcing1688HotProductDailySnapshot.createdAt, Sourcing1688HotProductDailySnapshot.id, Sourcing1688HotProductDailySnapshot.imageUrl, Sourcing1688HotProductDailySnapshot.monthlySales, Sourcing1688HotProductDailySnapshot.offerId, Sourcing1688HotProductDailySnapshot.organization (+12 more)

### Community 113 - "Community 113"
Cohesion: 0.21
Nodes (18): analyzePrReleaseContract(), changedFilesFromGit(), classifyFiles(), compareSemver(), deletedFilesFromGit(), ghPrBody(), git(), hasReleaseDecision() (+10 more)

### Community 114 - "AgentOS schema"
Cohesion: 0.12
Nodes (19): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError, AgentTaskSession.lastRun (+11 more)

### Community 115 - "Orders schema"
Cohesion: 0.12
Nodes (19): CoupangDirectPoSnapshot.centerName, CoupangDirectPoSnapshot.channelAccountId, CoupangDirectPoSnapshot.collectedAt, CoupangDirectPoSnapshot.createdAt, CoupangDirectPoSnapshot.deliveryDate, CoupangDirectPoSnapshot.id, CoupangDirectPoSnapshot.isUrgent, CoupangDirectPoSnapshot.itemsJson (+11 more)

### Community 116 - "Channels schema"
Cohesion: 0.12
Nodes (19): CoupangWingTrackedProductDailySnapshot.businessDate, CoupangWingTrackedProductDailySnapshot.capturedAt, CoupangWingTrackedProductDailySnapshot.conversionRate28d, CoupangWingTrackedProductDailySnapshot.createdAt, CoupangWingTrackedProductDailySnapshot.estimatedRevenue28d, CoupangWingTrackedProductDailySnapshot.id, CoupangWingTrackedProductDailySnapshot.organization, CoupangWingTrackedProductDailySnapshot.pvLast28Day (+11 more)

### Community 117 - "Supply schema"
Cohesion: 0.12
Nodes (19): PurchaseOrderSubmissionAttempt.createdAt, PurchaseOrderSubmissionAttempt.errorCode, PurchaseOrderSubmissionAttempt.errorMessage, PurchaseOrderSubmissionAttempt.freshnessGeneration, PurchaseOrderSubmissionAttempt.id, PurchaseOrderSubmissionAttempt.idempotencyKey, PurchaseOrderSubmissionAttempt.organization, PurchaseOrderSubmissionAttempt.providerReference (+11 more)

### Community 118 - "Inventory schema"
Cohesion: 0.12
Nodes (19): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.notes, ReturnTransfer.optionName, ReturnTransfer.organization (+11 more)

### Community 119 - "Community 119"
Cohesion: 0.15
Nodes (14): PRODUCT_LIFECYCLE_STATES, ProductLifecycleState, ProductLifecycleStateSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, MasterImageItem, MasterImageItemSchema, MasterImageRole (+6 more)

### Community 120 - "Community 120"
Cohesion: 0.16
Nodes (19): asRecord(), conversionRate(), dailyRawMetricsMatch(), dateStringMatches(), exactHeaderValues(), finiteNumber(), hasExactCoupangAdsDailyRawProvenance(), isExactWholeAccountCampaignRun() (+11 more)

### Community 121 - "Community 121"
Cohesion: 0.19
Nodes (18): assertAllowedArguments(), assertPublishableMain(), copyLoadableExtension(), createArchive(), environmentProfiles, githubReleaseCommand(), gitOutput(), gitSha() (+10 more)

### Community 122 - "Community 122"
Cohesion: 0.18
Nodes (10): assertCanonicalCoupangAccountIdentity(), canonicalParentRows(), ChannelCatalogImportRepositoryAdapter, importResponse(), isUniqueConstraintError(), nextPublicationSequence(), Injectable, zeroChanges() (+2 more)

### Community 123 - "Community 123"
Cohesion: 0.11
Nodes (4): ChannelDashboardRepositoryAdapter, Injectable, ChannelDashboardRepositoryPort, Inject

### Community 124 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.id, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.lastRunId (+10 more)

### Community 125 - "Finance schema"
Cohesion: 0.12
Nodes (16): GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.listing, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization, GradeHistory.reason (+8 more)

### Community 126 - "Sourcing schema"
Cohesion: 0.14
Nodes (18): LiveCommerceProductDailySnapshot.broadcastId, LiveCommerceProductDailySnapshot.businessDate, LiveCommerceProductDailySnapshot.capturedAt, LiveCommerceProductDailySnapshot.createdAt, LiveCommerceProductDailySnapshot.id, LiveCommerceProductDailySnapshot.imageUrl, LiveCommerceProductDailySnapshot.organization, LiveCommerceProductDailySnapshot.priceCny (+10 more)

### Community 127 - "Sourcing schema"
Cohesion: 0.13
Nodes (18): NaverKeywordDailySnapshot.averageAdRank, NaverKeywordDailySnapshot.businessDate, NaverKeywordDailySnapshot.capturedAt, NaverKeywordDailySnapshot.competitionIndex, NaverKeywordDailySnapshot.createdAt, NaverKeywordDailySnapshot.id, NaverKeywordDailySnapshot.keyword, NaverKeywordDailySnapshot.monthlyMobileSearchCount (+10 more)

### Community 128 - "Channels schema"
Cohesion: 0.14
Nodes (18): RocketPoCatalogSnapshot.channelAccount, RocketPoCatalogSnapshot.channelAccountId, RocketPoCatalogSnapshot.collectionRunId, RocketPoCatalogSnapshot.createdAt, RocketPoCatalogSnapshot.detailPoCount, RocketPoCatalogSnapshot.id, RocketPoCatalogSnapshot.listPagesRead, RocketPoCatalogSnapshot.organization (+10 more)

### Community 129 - "Channels schema"
Cohesion: 0.12
Nodes (18): RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt, RocketPurchaseOrder.firstSkuName, RocketPurchaseOrder.id, RocketPurchaseOrder.items, RocketPurchaseOrder.orderAmount, RocketPurchaseOrder.orderedAt (+10 more)

### Community 130 - "AI schema"
Cohesion: 0.12
Nodes (18): ThumbnailGenerationEvent.actor, ThumbnailGenerationEvent.actorUserId, ThumbnailGenerationEvent.attemptNumber, ThumbnailGenerationEvent.createdAt, ThumbnailGenerationEvent.errorMessage, ThumbnailGenerationEvent.eventType, ThumbnailGenerationEvent.fromPhase, ThumbnailGenerationEvent.fromStatus (+10 more)

### Community 131 - "Community 131"
Cohesion: 0.18
Nodes (8): ChannelCatalogCollectionRepositoryAdapter, isUniqueConstraintError(), ownedRunWhere(), Injectable, ChannelCatalogCollectionChunkRecord, ChannelCatalogCollectionRunRecord, ChannelCatalogCollectionWithChunks, startRun()

### Community 132 - "Core schema"
Cohesion: 0.12
Nodes (17): MasterProductAbcGradeHistory.adjustedScore, MasterProductAbcGradeHistory.calculatedAt, MasterProductAbcGradeHistory.calculationStatus, MasterProductAbcGradeHistory.formulaVersion, MasterProductAbcGradeHistory.formulaVersionId, MasterProductAbcGradeHistory.id, MasterProductAbcGradeHistory.masterProduct, MasterProductAbcGradeHistory.masterProductId (+9 more)

### Community 133 - "Inventory schema"
Cohesion: 0.14
Nodes (17): StockTransfer.fromWarehouseId, StockTransfer.toWarehouseId, Warehouse.address, Warehouse.code, Warehouse.createdAt, Warehouse.id, Warehouse.isDefault, Warehouse.manager (+9 more)

### Community 134 - "Supply schema"
Cohesion: 0.13
Nodes (16): Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.id, Supplier.leadTimeDays, Supplier.name, Supplier.notes (+8 more)

### Community 135 - "Community 135"
Cohesion: 0.12
Nodes (13): MAX_SELLPIA_MANUAL_MATCH_ROWS, MAX_SELLPIA_MANUAL_MATCH_TARGETS, SellpiaManualMatchCodeSchema, SellpiaManualMatchCollectionFailureCode, SellpiaManualMatchCollectionFailureCodeSchema, SellpiaManualMatchImportResponse, SellpiaManualMatchRow, SellpiaManualMatchRowSchema (+5 more)

### Community 136 - "Community 136"
Cohesion: 0.23
Nodes (5): Inject, ChannelCatalogCollectionPort, ChannelCatalogCollectionService, parseRequest(), Injectable

### Community 137 - "Community 137"
Cohesion: 0.12
Nodes (15): CurrentOrganization, Get, Query, ChannelSkuAvailabilityQueryDto, IsIn, IsInt, IsOptional, IsString (+7 more)

### Community 138 - "AgentOS schema"
Cohesion: 0.15
Nodes (16): AgentRunEvent.agentInstance, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message, AgentRunEvent.organization (+8 more)

### Community 139 - "Channels schema"
Cohesion: 0.16
Nodes (16): ChannelScrapeChunk.checksum, ChannelScrapeChunk.createdAt, ChannelScrapeChunk.id, ChannelScrapeChunk.itemCount, ChannelScrapeChunk.kind, ChannelScrapeChunk.organization, ChannelScrapeChunk.payload, ChannelScrapeChunk.publicationJson (+8 more)

### Community 140 - "Channels schema"
Cohesion: 0.14
Nodes (16): CoupangWingTrackedProduct.brandName, CoupangWingTrackedProduct.categoryHierarchy, CoupangWingTrackedProduct.createdAt, CoupangWingTrackedProduct.enabled, CoupangWingTrackedProduct.id, CoupangWingTrackedProduct.imagePath, CoupangWingTrackedProduct.itemId, CoupangWingTrackedProduct.lastCapturedAt (+8 more)

### Community 141 - "Advertising schema"
Cohesion: 0.13
Nodes (16): ExecutionTask.action, ExecutionTask.actionId, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt, ExecutionTask.errorMessage, ExecutionTask.finishedAt (+8 more)

### Community 142 - "Inventory schema"
Cohesion: 0.13
Nodes (16): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.organization, PickingItem.pickedAt, PickingItem.pickingList (+8 more)

### Community 143 - "Inventory schema"
Cohesion: 0.15
Nodes (16): PickingItem.pickingListId, PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.id, PickingList.listNumber, PickingList.organization, PickingList.pickedItems (+8 more)

### Community 144 - "Supply schema"
Cohesion: 0.16
Nodes (16): RocketPurchaseConfirmationTransmission.confirmation, RocketPurchaseConfirmationTransmission.confirmationId, RocketPurchaseConfirmationTransmission.createdAt, RocketPurchaseConfirmationTransmission.id, RocketPurchaseConfirmationTransmission.intentKey, RocketPurchaseConfirmationTransmission.matchedLineCount, RocketPurchaseConfirmationTransmission.observedAt, RocketPurchaseConfirmationTransmission.organization (+8 more)

### Community 145 - "Inventory schema"
Cohesion: 0.13
Nodes (16): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.id, StockTransfer.notes, StockTransfer.optionName, StockTransfer.organization, StockTransfer.quantity (+8 more)

### Community 146 - "Supply schema"
Cohesion: 0.13
Nodes (16): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.dueDate, SupplierPayment.id, SupplierPayment.notes, SupplierPayment.organization, SupplierPayment.paidAmount, SupplierPayment.paidDate (+8 more)

### Community 147 - "Community 147"
Cohesion: 0.24
Nodes (14): analyzeReconstructionTriggers(), changedFilesFromGit(), ghPrBody(), git(), isCrossLayerControlChange(), isHighRiskBoundary(), isLargeServiceOrComponent(), layerOf() (+6 more)

### Community 148 - "Community 148"
Cohesion: 0.16
Nodes (15): DATA_MIGRATION_IDS, dataMigrations, APPLY_DATA_MIGRATIONS_CONFIRMATION, assertApplyDataMigrationsConfirmation(), assertBaselineBinding(), assertMutatingTarget(), assertRebuildBaselineRestore(), assertUniqueIds() (+7 more)

### Community 149 - "Community 149"
Cohesion: 0.28
Nodes (10): ChannelCatalogCollectionController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+2 more)

### Community 150 - "Community 150"
Cohesion: 0.13
Nodes (6): CoupangProviderAdapter, Injectable, CoupangCreateSellerProductResponse, CoupangSellerProductPayload, OrderSheetResponse, SellerProductExternalSkuResponse

### Community 151 - "Finance schema"
Cohesion: 0.14
Nodes (15): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description (+7 more)

### Community 152 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 153 - "Sourcing schema"
Cohesion: 0.17
Nodes (15): NaverPopularKeywordDailySnapshot.boardKey, NaverPopularKeywordDailySnapshot.boardLabel, NaverPopularKeywordDailySnapshot.businessDate, NaverPopularKeywordDailySnapshot.capturedAt, NaverPopularKeywordDailySnapshot.cid, NaverPopularKeywordDailySnapshot.createdAt, NaverPopularKeywordDailySnapshot.id, NaverPopularKeywordDailySnapshot.keyword (+7 more)

### Community 154 - "Finance schema"
Cohesion: 0.14
Nodes (15): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.id, ProcessingCost.master, ProcessingCost.notes, ProcessingCost.organization, ProcessingCost.processType, ProcessingCost.productName (+7 more)

### Community 155 - "Finance schema"
Cohesion: 0.15
Nodes (15): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.organization, SalesPlan.period (+7 more)

### Community 156 - "Channels schema"
Cohesion: 0.17
Nodes (15): SellpiaManualMatchAlias.aliasTitle, SellpiaManualMatchAlias.createdAt, SellpiaManualMatchAlias.evidenceCount, SellpiaManualMatchAlias.id, SellpiaManualMatchAlias.itemCount, SellpiaManualMatchAlias.matchedType, SellpiaManualMatchAlias.normalizedAlias, SellpiaManualMatchAlias.organization (+7 more)

### Community 157 - "Channels schema"
Cohesion: 0.15
Nodes (15): SellpiaManualMatchSnapshot.aliasCount, SellpiaManualMatchSnapshot.capturedAt, SellpiaManualMatchSnapshot.createdAt, SellpiaManualMatchSnapshot.id, SellpiaManualMatchSnapshot.matchedTargetCount, SellpiaManualMatchSnapshot.organization, SellpiaManualMatchSnapshot.schemaVersion, SellpiaManualMatchSnapshot.snapshotHash (+7 more)

### Community 158 - "Inventory schema"
Cohesion: 0.14
Nodes (15): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.sourceRef, SellpiaReceiptUploadBatch.sourceType (+7 more)

### Community 159 - "Channels schema"
Cohesion: 0.16
Nodes (15): SellpiaSalesDailySnapshot.businessDate, SellpiaSalesDailySnapshot.capturedAt, SellpiaSalesDailySnapshot.channelGroup, SellpiaSalesDailySnapshot.costKrw, SellpiaSalesDailySnapshot.createdAt, SellpiaSalesDailySnapshot.id, SellpiaSalesDailySnapshot.organization, SellpiaSalesDailySnapshot.qty (+7 more)

### Community 160 - "Inventory schema"
Cohesion: 0.15
Nodes (15): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items, StockAudit.matchedCount (+7 more)

### Community 161 - "Supply schema"
Cohesion: 0.16
Nodes (15): SupplierProduct.createdAt, SupplierProduct.id, SupplierProduct.isPrimary, SupplierProduct.memo, SupplierProduct.minOrderQty, SupplierProduct.organization, SupplierProduct.sellpiaInventorySku, SupplierProduct.sellpiaInventorySkuId (+7 more)

### Community 162 - "Community 162"
Cohesion: 0.19
Nodes (12): SELLPIA_WORKBOOK_ACCEPT, SELLPIA_WORKBOOK_FILE_EXTENSIONS, SELLPIA_WORKBOOK_FORMAT_LABEL, SellpiaReceiptBatchCreateInput, SellpiaReceiptBatchCreateInputSchema, SellpiaReceiptBatchMarkUploadedInput, SellpiaReceiptBatchMarkUploadedInputSchema, SellpiaReceiptUploadBatch (+4 more)

### Community 163 - "Community 163"
Cohesion: 0.17
Nodes (15): ChannelProductMatchingQueueResponseSchema, InventorySkuSnapshotListResponseSchema, CreateProductVariantRecipesIfEmptyResponseSchema, PlanProductVariantRecipesIfEmptyResponseSchema, ApiClient, assertPartition(), assertTargetBaseUrl(), authorizationHeaders() (+7 more)

### Community 164 - "Community 164"
Cohesion: 0.14
Nodes (12): checkSellpiaCutoverPreflight(), createPrisma(), main(), MAX_SELLPIA_CUTOVER_EXAMPLES, ReadonlyQueryClient, runSellpiaCutoverPreflight(), SELLPIA_CUTOVER_PREFLIGHT_SCHEMA_VERSION, SELLPIA_CUTOVER_TARGET_RELEASE (+4 more)

### Community 165 - "Community 165"
Cohesion: 0.26
Nodes (9): CoupangCredentials, coupangRequest(), CoupangRequestOptions, generateAuthorization(), createSellerProduct(), getSellerProduct(), getSellerProducts(), getSellerProductsByExternalVendorSku() (+1 more)

### Community 166 - "Advertising schema"
Cohesion: 0.15
Nodes (14): ExecutionTask.workerId, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentTaskRef, ExecutionWorker.currentUrl, ExecutionWorker.id, ExecutionWorker.label, ExecutionWorker.lastHeartbeatAt (+6 more)

### Community 167 - "System schema"
Cohesion: 0.15
Nodes (12): FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name, FeatureGate.updatedAt (+4 more)

### Community 168 - "Supply schema"
Cohesion: 0.19
Nodes (13): Supply, RocketPurchaseConfirmationAllocation.confirmationLine, RocketPurchaseConfirmationAllocation.confirmationLineId, RocketPurchaseConfirmationAllocation.createdAt, RocketPurchaseConfirmationAllocation.id, RocketPurchaseConfirmationAllocation.organization, RocketPurchaseConfirmationAllocation.quantity, RocketPurchaseConfirmationAllocation.sellpiaInventorySku (+5 more)

### Community 169 - "Channels schema"
Cohesion: 0.19
Nodes (13): CoupangKeywordSerpDailySnapshot.businessDate, CoupangKeywordSerpDailySnapshot.capturedAt, CoupangKeywordSerpDailySnapshot.createdAt, CoupangKeywordSerpDailySnapshot.id, CoupangKeywordSerpDailySnapshot.itemCount, CoupangKeywordSerpDailySnapshot.items, CoupangKeywordSerpDailySnapshot.keyword, CoupangKeywordSerpDailySnapshot.organization (+5 more)

### Community 170 - "Core schema"
Cohesion: 0.17
Nodes (13): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+5 more)

### Community 171 - "Channels schema"
Cohesion: 0.18
Nodes (13): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson, RocketSupplyDailySnapshot.revenueKrw (+5 more)

### Community 172 - "Community 172"
Cohesion: 0.29
Nodes (13): assertBootstrapPreflightManifest(), assertPositiveIntegerText(), assertStagingAccountBaselineManifest(), buildBootstrapPreflightManifest(), buildChannelAccountFingerprint(), buildCoupangReplayBundle(), buildStagingAccountBaselineManifest(), computeReplayFactDigest() (+5 more)

### Community 173 - "Community 173"
Cohesion: 0.31
Nodes (11): analyzeSchemaArtifactSync(), changedFilesFromGit(), changedFilesFromWorkingTree(), GENERATED_ARTIFACT_PATHS, git(), main(), matchesAnyPath(), mergeChangedFiles() (+3 more)

### Community 174 - "Community 174"
Cohesion: 0.18
Nodes (8): ChannelAccountController, Body, Controller, CurrentOrganization, Get, UpdateCoupangAccountSettingsSchema, Patch, Roles

### Community 175 - "Inventory schema"
Cohesion: 0.20
Nodes (12): Inventory, CoupangShipmentDateSummary.boxes, CoupangShipmentDateSummary.capturedAt, CoupangShipmentDateSummary.count, CoupangShipmentDateSummary.createdAt, CoupangShipmentDateSummary.id, CoupangShipmentDateSummary.organization, CoupangShipmentDateSummary.shipmentDate (+4 more)

### Community 176 - "Channels schema"
Cohesion: 0.20
Nodes (12): CoupangKeywordTracker.createdAt, CoupangKeywordTracker.enabled, CoupangKeywordTracker.id, CoupangKeywordTracker.keyword, CoupangKeywordTracker.lastCapturedAt, CoupangKeywordTracker.maxPages, CoupangKeywordTracker.organization, CoupangKeywordTracker.updatedAt (+4 more)

### Community 177 - "Inventory schema"
Cohesion: 0.21
Nodes (12): InventoryCommitmentAllocation.commitment, InventoryCommitmentAllocation.commitmentId, InventoryCommitmentAllocation.createdAt, InventoryCommitmentAllocation.id, InventoryCommitmentAllocation.organization, InventoryCommitmentAllocation.quantity, InventoryCommitmentAllocation.sellpiaInventorySku, InventoryCommitmentAllocation.sellpiaInventorySkuId (+4 more)

### Community 178 - "Core schema"
Cohesion: 0.18
Nodes (10): MasterProductAbcFormulaState.activatedAt, MasterProductAbcFormulaState.activeFormulaVersion, MasterProductAbcFormulaState.activeFormulaVersionId, MasterProductAbcFormulaState.createdAt, MasterProductAbcFormulaState.organization, MasterProductAbcFormulaState.revision, MasterProductAbcFormulaState.updatedAt, MasterProductAbcFormulaState (+2 more)

### Community 179 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 180 - "Community 180"
Cohesion: 0.20
Nodes (7): ChannelAccountListController, Controller, CurrentOrganization, Get, ChannelAccountQueryService, Inject, Injectable

### Community 181 - "Community 181"
Cohesion: 0.18
Nodes (3): ChannelCatalogCollectionRepositoryPort, ChannelCatalogPublicationPort, Inject

### Community 182 - "Sourcing schema"
Cohesion: 0.24
Nodes (11): Sourcing, SourcingWorkspaceSnapshot.businessDate, SourcingWorkspaceSnapshot.createdAt, SourcingWorkspaceSnapshot.id, SourcingWorkspaceSnapshot.organization, SourcingWorkspaceSnapshot.payload, SourcingWorkspaceSnapshot.scope, SourcingWorkspaceSnapshot.updatedAt (+3 more)

### Community 183 - "System schema"
Cohesion: 0.20
Nodes (11): ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization, ActivityEvent.source (+3 more)

### Community 184 - "Core schema"
Cohesion: 0.22
Nodes (11): CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.keywords, CategoryMapping.organization, CategoryMapping.updatedAt (+3 more)

### Community 185 - "Supply schema"
Cohesion: 0.20
Nodes (11): PurchaseOrderItem.createdAt, PurchaseOrderItem.id, PurchaseOrderItem.order, PurchaseOrderItem.organization, PurchaseOrderItem.productName, PurchaseOrderItem.quantity, PurchaseOrderItem.sellpiaInventorySku, PurchaseOrderItem.sellpiaInventorySkuId (+3 more)

### Community 186 - "Sourcing schema"
Cohesion: 0.22
Nodes (11): TrendSeedKeyword.createdAt, TrendSeedKeyword.enabled, TrendSeedKeyword.id, TrendSeedKeyword.keyword, TrendSeedKeyword.keywordCn, TrendSeedKeyword.organization, TrendSeedKeyword.sources, TrendSeedKeyword.updatedAt (+3 more)

### Community 187 - "Community 187"
Cohesion: 0.20
Nodes (10): canRetryChannelListingDeletionProviderSideEffect(), canRetryProviderSideEffect(), isOperationTerminal(), OPERATION_STATUSES, OperationStatus, OperationStatusSchema, PROVIDER_OUTCOMES, ProviderOutcome (+2 more)

### Community 188 - "Community 188"
Cohesion: 0.22
Nodes (8): CoupangCategorySuggestion, CoupangCategorySuggestionRequest, CoupangCategorySuggestionRequestSchema, CoupangCategorySuggestionResponse, CoupangCategorySuggestionResponseSchema, CoupangCategorySuggestionResult, CoupangCategorySuggestionResultSchema, CoupangCategorySuggestionSchema

### Community 189 - "Community 189"
Cohesion: 0.45
Nodes (7): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), REDACTED_PLACEHOLDER, scrubDeep(), scrubSecrets(), walk()

### Community 190 - "Community 190"
Cohesion: 0.38
Nodes (9): checkTrackedClaudeDirectory(), findClaudeShimFindings(), findInstructionChainSizeFindings(), findStaleInstructionLines(), git(), listRepositoryFiles(), listTracked(), main() (+1 more)

### Community 191 - "Community 191"
Cohesion: 0.35
Nodes (9): analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), directOutPortFiles(), FORBIDDEN_IN_PORT_FOLDER_NAMES, forbiddenInPortCallerFolders(), listDirectories(), listFiles(), main() (+1 more)

### Community 192 - "Community 192"
Cohesion: 0.20
Nodes (4): Inject, ChannelAccountRepositoryAdapter, Injectable, CoupangCredentialsPort

### Community 193 - "Community 193"
Cohesion: 0.20
Nodes (6): ChannelRecipeAutomationContextRepositoryAdapter, recipeSource(), Injectable, ChannelRecipeAutomationAccountContext, ChannelRecipeAutomationContextRepositoryPort, Inject

### Community 194 - "Advertising schema"
Cohesion: 0.22
Nodes (10): Advertising, ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.id, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.url (+2 more)

### Community 195 - "System schema"
Cohesion: 0.24
Nodes (10): System, SystemSetting.createdAt, SystemSetting.id, SystemSetting.key, SystemSetting.organization, SystemSetting.updatedAt, SystemSetting.value, SystemSetting (+2 more)

### Community 196 - "Advertising schema"
Cohesion: 0.22
Nodes (10): ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task, ExecutionLog.taskId (+2 more)

### Community 197 - "Community 197"
Cohesion: 0.38
Nodes (8): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), main(), parseBaseline(), readFiles(), repoRoot(), walk()

### Community 198 - "Community 198"
Cohesion: 0.22
Nodes (10): artifact(), assertPrivateOutputPath(), ChannelRecipeTransferArtifactSchema, createPrisma(), exportArtifact(), main(), parseArgs(), readArtifact() (+2 more)

### Community 199 - "Community 199"
Cohesion: 0.22
Nodes (5): RocketAccountController, Controller, CurrentOrganization, Post, ChannelAccountListRow

### Community 200 - "Community 200"
Cohesion: 0.25
Nodes (5): ChannelsOperationAlertAdapter, Inject, Injectable, OperationLifecyclePatch, StartOperationAlertInput

### Community 202 - "Community 202"
Cohesion: 0.28
Nodes (6): manualMatchAliasCandidates(), aggregateRows(), sameStrings(), strongerMatchedType(), normalizeSellpiaManualMatchAlias(), SellpiaManualMatchImportResponseSchema

### Community 203 - "Channels schema"
Cohesion: 0.25
Nodes (9): Channels, CoupangRepresentativeKeywordOverride.createdAt, CoupangRepresentativeKeywordOverride.id, CoupangRepresentativeKeywordOverride.keyword, CoupangRepresentativeKeywordOverride.organization, CoupangRepresentativeKeywordOverride.updatedAt, CoupangRepresentativeKeywordOverride, coupang_representative_keyword_overrides (+1 more)

### Community 204 - "Community 204"
Cohesion: 0.22
Nodes (7): ReadinessCheck, ReadinessCheckSchema, ReadinessCheckStatusSchema, ReadinessResponse, ReadinessResponseSchema, RebuildReadinessResponse, RebuildReadinessResponseSchema

### Community 205 - "Community 205"
Cohesion: 0.31
Nodes (9): addExactHeaderEvidence(), asRecord(), CONVERSION_COUNT_HEADERS, normalizeHeader(), parseObservedCount(), recoverObservedCampaignTargetConversions(), resolveRevenueShapedCampaignTargetConversion(), roundedNumber() (+1 more)

### Community 206 - "Community 206"
Cohesion: 0.36
Nodes (7): ParsedArgs, parseRawArgs(), ParseRawArgsOptions, pushValue(), values(), COMMANDS, makeArgs()

### Community 207 - "Community 207"
Cohesion: 0.25
Nodes (6): extractFunction(), extractRetireFunction(), productionWrapper, remote, repoRoot, workflow

### Community 208 - "Community 208"
Cohesion: 0.29
Nodes (7): distinct(), evidenceForCode(), evidenceForNames(), normalizePhysicalBarcode(), normalizeRecipeIdentityText(), normalizeRecipeSuggestionName(), ChannelRecipeSuggestionResponseSchema

### Community 209 - "Community 209"
Cohesion: 0.46
Nodes (6): analyzeInventory(), listTopLevelScriptFiles(), main(), repoRoot(), SCRIPT_INVENTORY, SUPPORT_FILES

### Community 210 - "Community 210"
Cohesion: 0.25
Nodes (4): repoRoot, scriptPath, supportedExtensions, temporaryDirectories

### Community 211 - "Community 211"
Cohesion: 0.52
Nodes (5): approveReturn(), confirmOrderSheets(), DELIVERY_COMPANIES, getOrderSheets(), uploadInvoice()

### Community 212 - "Community 212"
Cohesion: 0.33
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 213 - "Community 213"
Cohesion: 0.33
Nodes (6): bootstrapAuthoritativeInventoryDevelopment(), buildBootstrapPlan(), main(), optionalUuid(), parseBootstrapArgs(), slugify()

### Community 216 - "Community 216"
Cohesion: 0.40
Nodes (5): asRecord(), buildCampaignQualifiedProductTargetKeys(), cleanString(), rawCampaignAnchor(), rawProductAnchor()

### Community 219 - "Community 219"
Cohesion: 0.50
Nodes (4): is_allowlisted(), is_comment_line(), load_file_lines(), check-tenant-scope.sh script

### Community 221 - "Community 221"
Cohesion: 0.50
Nodes (4): extractEnvKeys(), readModelFile(), redactEnvText(), redactEnvValues()

### Community 222 - "Community 222"
Cohesion: 0.67
Nodes (4): canonicalComponents(), recipeKey(), resolveArtifactRecipes(), sameComponents()

### Community 223 - "Community 223"
Cohesion: 1.00
Nodes (3): makeRepository(), runRecord(), runWithChunks()

### Community 224 - "Community 224"
Cohesion: 0.67
Nodes (3): accountIdFor(), seedOrderInline(), seedReturnInline()

## Knowledge Gaps
- **2958 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+2953 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Core schema` to `prisma field: prisma — Shared Schema`, `Community 1`, `prisma field: externalOptionId canonical option identity`, `Orders schema`, `Community 4`, `Core schema`, `prisma field: channels — Marketplace Sync + SKU Matching`, `AI schema`, `Community 9`, `Core schema`, `Community 11`, `AI schema`, `Community 13`, `Sourcing schema`, `Community 15`, `Orders schema`, `Community 18`, `prisma field: ActionTask.targetId`, `Channels schema`, `Core schema`, `Community 23`, `Core schema`, `Channels schema`, `Community 26`, `AI schema`, `Core schema`, `AI schema`, `Orders schema`, `Orders schema`, `AgentOS schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `AI schema`, `AI schema`, `AI schema`, `Community 49`, `Core schema`, `Sourcing schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `Supply schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `AgentOS schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Community 78`, `Supply schema`, `AgentOS schema`, `Channels schema`, `System schema`, `Advertising schema`, `AgentOS schema`, `Orders schema`, `Channels schema`, `Supply schema`, `Sourcing schema`, `AgentOS schema`, `AI schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Core schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `Finance schema`, `Orders schema`, `Sourcing schema`, `AgentOS schema`, `Orders schema`, `Channels schema`, `Supply schema`, `Inventory schema`, `AgentOS schema`, `Finance schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `Channels schema`, `AI schema`, `Core schema`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Inventory schema`, `Supply schema`, `Finance schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Supply schema`, `Community 164`, `Advertising schema`, `System schema`, `Supply schema`, `Channels schema`, `Core schema`, `Channels schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Core schema`, `Sourcing schema`, `System schema`, `Core schema`, `Supply schema`, `Sourcing schema`, `Advertising schema`, `System schema`, `Community 199`, `Channels schema`, `Community 220`?**
  _High betweenness centrality (0.205) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `Orders schema` to `prisma field: prisma — Shared Schema`, `prisma field: externalOptionId canonical option identity`, `Core schema`, `prisma field: channels — Marketplace Sync + SKU Matching`, `AI schema`, `Core schema`, `AI schema`, `Sourcing schema`, `Orders schema`, `prisma field: ActionTask.targetId`, `Channels schema`, `Core schema`, `Core schema`, `Channels schema`, `AI schema`, `Core schema`, `AI schema`, `Orders schema`, `Orders schema`, `AgentOS schema`, `AI schema`, `Core schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `AI schema`, `System schema`, `AI schema`, `AI schema`, `Core schema`, `Sourcing schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `Supply schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `AgentOS schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `Channels schema`, `System schema`, `Advertising schema`, `AgentOS schema`, `Orders schema`, `Channels schema`, `Supply schema`, `Sourcing schema`, `AgentOS schema`, `AI schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Core schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `Finance schema`, `Orders schema`, `Sourcing schema`, `AgentOS schema`, `Orders schema`, `Channels schema`, `Supply schema`, `Inventory schema`, `AgentOS schema`, `Finance schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `Channels schema`, `AI schema`, `Core schema`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Advertising schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Inventory schema`, `Supply schema`, `Finance schema`, `System schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Supply schema`, `Advertising schema`, `System schema`, `Supply schema`, `Channels schema`, `Core schema`, `Channels schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Core schema`, `System schema`, `Sourcing schema`, `System schema`, `Core schema`, `Supply schema`, `Sourcing schema`, `Advertising schema`, `System schema`, `Advertising schema`, `Channels schema`?**
  _High betweenness centrality (0.168) - this node is a cross-community bridge._
- **Why does `Order` connect `Core schema` to `prisma field: prisma — Shared Schema`, `Community 1`, `prisma field: externalOptionId canonical option identity`, `Orders schema`, `Community 4`, `prisma field: channels — Marketplace Sync + SKU Matching`, `Supply schema`, `Community 8`, `Community 9`, `Core schema`, `AI schema`, `Community 13`, `Sourcing schema`, `Community 16`, `Orders schema`, `Community 18`, `prisma field: ActionTask.targetId`, `Community 148`, `Community 22`, `Core schema`, `Community 26`, `Community 28`, `Orders schema`, `Community 34`, `Community 164`, `Community 165`, `Core schema`, `Orders schema`, `Community 40`, `Community 45`, `Community 173`, `Community 48`, `Community 49`, `Core schema`, `Community 54`, `Community 63`, `Community 191`, `Community 73`, `Community 78`, `Community 79`, `Community 207`, `Community 209`, `Community 82`, `Community 211`, `Community 215`, `Orders schema`, `Community 93`, `Community 119`, `Finance schema`?**
  _High betweenness centrality (0.098) - this node is a cross-community bridge._
- **Are the 201 inferred relationships involving `Organization` (e.g. with `channel-registration-capability.adapter.spec.ts` and `channel-registration-capability.adapter.ts`) actually correct?**
  _`Organization` has 201 INFERRED edges - model-reasoned connections that need verification._
- **Are the 148 inferred relationships involving `ChannelAccount` (e.g. with `channel-registration-capability.adapter.spec.ts` and `channel-registration-capability.adapter.ts`) actually correct?**
  _`ChannelAccount` has 148 INFERRED edges - model-reasoned connections that need verification._
- **Are the 109 inferred relationships involving `ChannelListing` (e.g. with `channel-registration-capability.adapter.ts` and `channel-listing.controller.ts`) actually correct?**
  _`ChannelListing` has 109 INFERRED edges - model-reasoned connections that need verification._
- **Are the 143 inferred relationships involving `Order` (e.g. with `channel-sync.controller.ts` and `dto/index.ts`) actually correct?**
  _`Order` has 143 INFERRED edges - model-reasoned connections that need verification._