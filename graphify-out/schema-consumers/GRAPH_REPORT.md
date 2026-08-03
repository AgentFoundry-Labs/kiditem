# Graph Report - schema-consumers  (2026-08-02)

## Corpus Check
- 444 files · ~234,065 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 6823 nodes · 40378 edges · 233 communities (216 shown, 17 thin omitted)
- Extraction: 30% EXTRACTED · 70% INFERRED · 0% AMBIGUOUS · INFERRED: 28204 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- prisma field: prisma — Shared Schema
- Community 1
- prisma field: externalOptionId canonical option identity
- Community 3
- Core schema
- Core schema
- prisma field: channels — Marketplace Sync + SKU Matching
- prisma field: vendorItemId provider term
- AI schema
- Community 9
- Community 10
- prisma field: CandidateImage.isDeleted
- Core schema
- Core schema
- Community 14
- Orders schema
- Channels schema
- Core schema
- AI schema
- Community 19
- Community 20
- Community 21
- prisma field: ActionTask.targetId
- Community 23
- Community 24
- System schema
- Community 26
- AI schema
- Community 28
- AI schema
- Community 30
- Orders schema
- Community 32
- Community 33
- Community 34
- Supply schema
- AgentOS schema
- Core schema
- Inventory schema
- Orders schema
- AgentOS schema
- Community 41
- Community 42
- Community 43
- Advertising schema
- Sourcing schema
- Community 46
- Supply schema
- Channels schema
- Inventory schema
- AI schema
- Community 51
- Community 52
- AI schema
- Community 54
- Sourcing schema
- Core schema
- Sourcing schema
- System schema
- Community 59
- Community 60
- AI schema
- Community 62
- Sourcing schema
- AgentOS schema
- AgentOS schema
- Community 66
- Community 67
- AI schema
- Supply schema
- Channels schema
- Community 71
- Community 72
- Channels schema
- Channels schema
- Inventory schema
- Channels schema
- AgentOS schema
- Community 78
- System schema
- AgentOS schema
- Channels schema
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Orders schema
- AgentOS schema
- Channels schema
- Channels schema
- Community 91
- Community 92
- Community 93
- Channels schema
- Community 95
- Channels schema
- AgentOS schema
- AgentOS schema
- Channels schema
- System schema
- Advertising schema
- Orders schema
- Community 103
- Community 104
- Community 105
- Community 106
- Channels schema
- Supply schema
- Sourcing schema
- Community 110
- Community 111
- AgentOS schema
- AI schema
- System schema
- Channels schema
- Sourcing schema
- Core schema
- Orders schema
- Sourcing schema
- AI schema
- Community 121
- Community 122
- AgentOS schema
- AgentOS schema
- Orders schema
- Finance schema
- Sourcing schema
- Community 128
- Community 129
- Orders schema
- Channels schema
- Inventory schema
- Community 133
- Community 134
- Community 135
- Community 136
- Community 137
- AgentOS schema
- AI schema
- Sourcing schema
- Sourcing schema
- Channels schema
- Inventory schema
- Community 144
- Core schema
- Community 146
- Community 147
- Community 148
- AgentOS schema
- Channels schema
- Channels schema
- Inventory schema
- Inventory schema
- Supply schema
- Supply schema
- Orders schema
- Community 157
- Community 158
- Finance schema
- Orders schema
- System schema
- Finance schema
- Finance schema
- Inventory schema
- Channels schema
- Inventory schema
- Supply schema
- Inventory schema
- Community 169
- Community 170
- Community 171
- System schema
- Community 173
- Channels schema
- Finance schema
- Core schema
- Orders schema
- Channels schema
- Community 179
- Community 180
- Inventory schema
- Supply schema
- Channels schema
- Core schema
- System schema
- Supply schema
- Community 187
- Community 188
- System schema
- Core schema
- Community 191
- Community 192
- Community 193
- System schema
- Community 195
- Channels schema
- Core schema
- Advertising schema
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
1. `Organization` - 485 edges
2. `Database ERD` - 393 edges
3. `ChannelAccount` - 206 edges
4. `Order` - 200 edges
5. `ChannelListing` - 198 edges
6. `ProductPreparation.organizationId` - 189 edges
7. `ContentWorkspace.organizationId` - 188 edges
8. `ChannelListing.organizationId` - 185 edges
9. `ProductRegistrationExecution.organizationId` - 184 edges
10. `ChannelAdTargetDailySnapshot.organizationId` - 183 edges
11. `SourceImportRun.organizationId` - 183 edges
12. `ContentWorkspaceThumbnailSelection.organizationId` - 182 edges

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

## Communities (233 total, 17 thin omitted)

### Community 0 - "prisma field: prisma — Shared Schema"
Cohesion: 0.14
Nodes (294): UploadedWorkbookFile, HEADERS, USER, CHANNEL_ACCOUNT_LIST_SELECT, chunkSelect, ErrorInput, LockedRun, OwnedRunInput (+286 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (138): ActionTask, ActionTaskExecuteResponse, ActionTaskList, ActionTaskListSchema, ActionTaskRelatedProduct, ActionTaskRelatedProductSchema, ActionTaskSchema, ActionTaskSourceAlert (+130 more)

### Community 2 - "prisma field: externalOptionId canonical option identity"
Cohesion: 0.08
Nodes (90): ChannelCatalogIdentityMedia, ChannelCatalogIdentityOption, ChannelCatalogIdentityProduct, ChannelCatalogIdentityUpsertInput, ChannelCatalogIdentityUpsertResult, PersistedChannelCatalogListing, upsertChannelCatalogIdentities(), CanonicalParent (+82 more)

### Community 3 - "Community 3"
Cohesion: 0.02
Nodes (101): AgentApprovalRequestSummary, AgentApprovalRequestSummarySchema, AgentApprovalStatus, AgentApprovalStatusSchema, AgentArtifactHandoffSummary, AgentArtifactHandoffSummarySchema, AgentArtifactStatus, AgentArtifactStatusSchema (+93 more)

### Community 4 - "Core schema"
Cohesion: 0.03
Nodes (83): CHANNEL_LISTING_SORTS, CHANNEL_LISTING_TABS, AVAILABILITY_STATUSES, ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id (+75 more)

### Community 5 - "Core schema"
Cohesion: 0.03
Nodes (81): ChannelRecipeAutomationProductTopology, classifyRecipeAutomationProductGroups(), groupDecision(), autoItem, configuredItem, quantityReviewItem, reviewItem, Core (+73 more)

### Community 6 - "prisma field: channels — Marketplace Sync + SKU Matching"
Cohesion: 0.04
Nodes (67): ChannelProductCandidate, ChannelProductCandidateRankingInput, emptyEvidence(), keep(), normalizeChannelBarcode(), normalizeChannelMatchName(), productSearchText(), rankChannelProductCandidates() (+59 more)

### Community 7 - "prisma field: vendorItemId provider term"
Cohesion: 0.07
Nodes (72): ListingForProductSync, COUPANG_WING_ORDER_SOURCE_TYPE, normalizeCoupangOrderStatus(), normalizeCoupangProductStatus(), vendorItemId provider term, Database ERD, AdAction.listingOptionId, AgentApprovalRequest.agentInstanceId (+64 more)

### Community 8 - "AI schema"
Cohesion: 0.03
Nodes (76): packages/shared — @kiditem/shared, AI, ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.detailPageArtifactId (+68 more)

### Community 9 - "Community 9"
Cohesion: 0.02
Nodes (78): CreateMasterProductInput, CreateMasterProductInputSchema, CreateProductVariantFieldsSchema, CreateProductVariantInput, CreateProductVariantInputSchema, CreateProductVariantRecipeIfEmptySchema, CreateProductVariantRecipesIfEmptyInput, CreateProductVariantRecipesIfEmptyInputSchema (+70 more)

### Community 10 - "Community 10"
Cohesion: 0.03
Nodes (77): AdMetricsDetail, AdMetricsDetailSchema, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary, DashboardAdSummarySchema (+69 more)

### Community 11 - "prisma field: CandidateImage.isDeleted"
Cohesion: 0.05
Nodes (49): aggregateMappingStatus(), assertLockedListing(), assertOperationActor(), ChannelListingRepositoryAdapter, contains(), firstPrice(), isUniqueViolation(), ListingRow (+41 more)

### Community 12 - "Core schema"
Cohesion: 0.03
Nodes (66): ChannelListingOption.attributesJson, ChannelListingOption.commissionRate, ChannelListingOption.costPriceOverride, ChannelListingOption.createdAt, ChannelListingOption.id, ChannelListingOption.itemName, ChannelListingOption.lastImportRun, ChannelListingOption.listing (+58 more)

### Community 13 - "Core schema"
Cohesion: 0.05
Nodes (38): Organization.createdAt, Organization.id, Organization.name, Organization.slug, Organization.updatedAt, Organization, DATA_MIGRATION_RELEASES, DataMigration (+30 more)

### Community 14 - "Community 14"
Cohesion: 0.06
Nodes (60): distinct(), evidenceForCode(), evidenceForNames(), normalizePhysicalBarcode(), item(), bigrams(), ChannelRecipeNameEvidence, ChannelRecipeNameIndex (+52 more)

### Community 15 - "Orders schema"
Cohesion: 0.04
Nodes (54): Order.channelAccount, Order.channelAccountId, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id (+46 more)

### Community 16 - "Channels schema"
Cohesion: 0.04
Nodes (59): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adCoverageStatus, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d (+51 more)

### Community 17 - "Core schema"
Cohesion: 0.04
Nodes (53): ContentGeneration.triggeredByUserId, OperationRun.scheduleId, OperationSchedule.createdAt, OperationSchedule.createdBy, OperationSchedule.createdByUserId, OperationSchedule.cronExpression, OperationSchedule.enabled, OperationSchedule.id (+45 more)

### Community 18 - "AI schema"
Cohesion: 0.04
Nodes (59): ProductPreparation.selectedThumbnailGenerationId, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.contentWorkspaceId, ThumbnailGeneration.createdAt, ThumbnailGeneration.deletedAt, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.errorMessage (+51 more)

### Community 19 - "Community 19"
Cohesion: 0.04
Nodes (54): ChunkRequestBaseSchema, COUPANG_CATALOG_BROWSER_FILE_NAME, COUPANG_CATALOG_COLLECTOR_VERSION, COUPANG_CATALOG_MAX_CHUNK_BYTES, COUPANG_CATALOG_MAX_MEDIA_PER_OWNER, COUPANG_CATALOG_MAX_OPTIONS_PER_PRODUCT, COUPANG_CATALOG_MAX_PRODUCT_BYTES, COUPANG_CATALOG_MAX_PRODUCTS_PER_CHUNK (+46 more)

### Community 20 - "Community 20"
Cohesion: 0.05
Nodes (45): ChannelCatalogImportController, Controller, Inject, ChannelSkuAvailabilityController, Controller, ChannelRecipeAutomationContextRepositoryAdapter, recipeSource(), Injectable (+37 more)

### Community 21 - "Community 21"
Cohesion: 0.08
Nodes (54): DATA_MIGRATION_IDS, dataMigrations, DataMigrationContext, DataMigrationTarget, MigrationResult, isLegacyDetailEditorHref(), rewriteLegacyDetailEditorAlertHrefs, rewriteLegacyDetailEditorHref() (+46 more)

### Community 22 - "prisma field: ActionTask.targetId"
Cohesion: 0.05
Nodes (47): ActionTask.targetId, ActionTask.targetType, AdAction.targetType, AgentArtifact.targetId, Alert.targetId, Alert.targetType, PANEL_RUN_SOURCES, PanelRunSource (+39 more)

### Community 23 - "Community 23"
Cohesion: 0.09
Nodes (53): AdapterCommand, archiveFileName(), archiveShaFileName(), Args, BundleManifest, BundlePackageIndex, BundlePayload, BundleReference (+45 more)

### Community 24 - "Community 24"
Cohesion: 0.09
Nodes (49): apiHeaders(), apiUrl(), Args, assertSafeDatasetId(), assertSupportedReplayPayloads(), BundleManifest, BundlePayload, BundleReference (+41 more)

### Community 25 - "System schema"
Cohesion: 0.05
Nodes (40): assertExactProductGraph(), MarketplaceRegistrationRepositoryAdapter, Injectable, upsertExactOptionLinks(), MarketplaceRegistrationRepositoryPort, asRecord(), KidItemFirstOptionLink, KidItemFirstRegistrationLinks (+32 more)

### Community 26 - "Community 26"
Cohesion: 0.09
Nodes (52): assertNoLocalAuthSecrets(), assertNonProductionTarget(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged(), assertSha256(), BaselineManifest, BaselineManifestExpectation, baselineObjectKeys (+44 more)

### Community 27 - "AI schema"
Cohesion: 0.04
Nodes (53): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height (+45 more)

### Community 28 - "Community 28"
Cohesion: 0.08
Nodes (47): APPLY_STORAGE_CACHE_CONTROL_CONFIRMATION, applyCacheControl(), ApplyResult, applyS3CacheControl(), applySupabaseCacheControl(), assertApplyAllowed(), buildCopyObjectInput(), CliArgs (+39 more)

### Community 29 - "AI schema"
Cohesion: 0.04
Nodes (51): DetailPageImageArtifact.byteLength, DetailPageImageArtifact.contentType, DetailPageImageArtifact.createdAt, DetailPageImageArtifact.createdBy, DetailPageImageArtifact.createdByUserId, DetailPageImageArtifact.id, DetailPageImageArtifact.imageUrl, DetailPageImageArtifact.objectKey (+43 more)

### Community 30 - "Community 30"
Cohesion: 0.04
Nodes (49): boundedText(), isoDay, isRocketWorkbookBlockingReason(), requiredText(), ROCKET_PO_ROW_LIMIT, ROCKET_SAVED_PO_RESPONSE_PROFILE, ROCKET_SHORTAGE_REASONS, ROCKET_WORKBOOK_BLOCKING_REASONS (+41 more)

### Community 31 - "Orders schema"
Cohesion: 0.04
Nodes (46): Review.content, Review.createdAt, Review.externalProductId, Review.externalReviewId, Review.id, Review.imageCount, Review.isBlinded, Review.itemName (+38 more)

### Community 32 - "Community 32"
Cohesion: 0.06
Nodes (24): ChannelRegistrationCapabilityAdapter, toSellpiaMatch(), Injectable, ChannelsMarketplaceRegistrationCapabilityPort, ExternalProductRegistrationMatchPreviewInput, ExternalProductRegistrationMatchPreviewResult, ExternalProductRegistrationPreflightInput, ExternalProductRegistrationPreflightResult (+16 more)

### Community 33 - "Community 33"
Cohesion: 0.04
Nodes (46): CalendarDateSchema, ChecksumSchema, dateRangeSourceFreshness(), FiniteNumberSchema, NullableMetricSchema, ProductAbcAdvertisingSourceFreshnessSchema, ProductAbcAdvertisingSourceStatus, ProductAbcAdvertisingSourceStatusSchema (+38 more)

### Community 34 - "Community 34"
Cohesion: 0.05
Nodes (17): ChannelsOperationAlertAdapter, Inject, Injectable, ChannelsDeletionPasswordAdapter, Injectable, ChannelsDeletionPasswordPort, OperationAlertPort, OperationLifecyclePatch (+9 more)

### Community 35 - "Supply schema"
Cohesion: 0.05
Nodes (45): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+37 more)

### Community 36 - "AgentOS schema"
Cohesion: 0.05
Nodes (44): AgentRunRequest.agentInstance, AgentRunRequest.attempts, AgentRunRequest.claimedAt, AgentRunRequest.claimedBy, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.coalescedIntoRequestId, AgentRunRequest.conversation, AgentRunRequest.createdAt (+36 more)

### Community 37 - "Core schema"
Cohesion: 0.05
Nodes (44): MasterProductAbcEvaluation.adjustedScore, MasterProductAbcEvaluation.advertisingCoverageEndDate, MasterProductAbcEvaluation.advertisingCoverageStartDate, MasterProductAbcEvaluation.advertisingSourceCapturedAt, MasterProductAbcEvaluation.advertisingSourceStatus, MasterProductAbcEvaluation.calculatedAt, MasterProductAbcEvaluation.calculationStatus, MasterProductAbcEvaluation.costComponentsJson (+36 more)

### Community 38 - "Inventory schema"
Cohesion: 0.05
Nodes (42): SellpiaInventorySku.code, SellpiaInventorySku.createdAt, SellpiaInventorySku.currentStock, SellpiaInventorySku.id, SellpiaInventorySku.lastImportRun, SellpiaInventorySku.lastImportRunId, SellpiaInventorySku.name, SellpiaInventorySku.optionName (+34 more)

### Community 39 - "Orders schema"
Cohesion: 0.06
Nodes (41): SellpiaOrderTransmissionIntent.abortedAt, SellpiaOrderTransmissionIntent.createdAt, SellpiaOrderTransmissionIntent.createdBy, SellpiaOrderTransmissionIntent.creator, SellpiaOrderTransmissionIntent.finalizedAt, SellpiaOrderTransmissionIntent.finalizedGeneration, SellpiaOrderTransmissionIntent.id, SellpiaOrderTransmissionIntent.intentKey (+33 more)

### Community 40 - "AgentOS schema"
Cohesion: 0.05
Nodes (42): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+34 more)

### Community 41 - "Community 41"
Cohesion: 0.05
Nodes (39): BrowserOperationClaim, BrowserOperationClaimRequest, BrowserOperationClaimRequestSchema, BrowserOperationClaimSchema, BrowserOperationHeartbeatRequest, BrowserOperationHeartbeatRequestSchema, BrowserOperationReportRequest, BrowserOperationReportRequestSchema (+31 more)

### Community 42 - "Community 42"
Cohesion: 0.09
Nodes (23): ChannelProductMatchingController, Body, Controller, CurrentOrganization, Get, Param, Post, Put (+15 more)

### Community 43 - "Community 43"
Cohesion: 0.08
Nodes (23): ChannelSyncController, Body, Controller, CurrentOrganization, CurrentUser, Get, Post, CoupangSyncOrderPayload (+15 more)

### Community 44 - "Advertising schema"
Cohesion: 0.06
Nodes (41): Advertising, ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task (+33 more)

### Community 45 - "Sourcing schema"
Cohesion: 0.05
Nodes (41): CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id, CandidateImage.isPrimary (+33 more)

### Community 46 - "Community 46"
Cohesion: 0.08
Nodes (22): CoupangCredentials, coupangRequest(), CoupangRequestOptions, generateAuthorization(), CoupangProviderAdapter, Inject, Injectable, approveReturn() (+14 more)

### Community 47 - "Supply schema"
Cohesion: 0.07
Nodes (37): PurchaseOrder.supplierId, Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.id, Supplier.leadTimeDays, Supplier.name (+29 more)

### Community 48 - "Channels schema"
Cohesion: 0.06
Nodes (39): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignIdentity, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel (+31 more)

### Community 49 - "Inventory schema"
Cohesion: 0.06
Nodes (39): InventoryCommitment.businessKey, InventoryCommitment.createdAt, InventoryCommitment.createdBy, InventoryCommitment.creator, InventoryCommitment.id, InventoryCommitment.inventoryGeneration, InventoryCommitment.kind, InventoryCommitment.organization (+31 more)

### Community 50 - "AI schema"
Cohesion: 0.06
Nodes (39): ProductPreparation.approvedAt, ProductPreparation.approvedByUser, ProductPreparation.channelAccount, ProductPreparation.channelAccountId, ProductPreparation.channelListing, ProductPreparation.channelListingId, ProductPreparation.createdAt, ProductPreparation.createdByUser (+31 more)

### Community 51 - "Community 51"
Cohesion: 0.05
Nodes (38): ACCOUNT_AD_DAILY_DIGEST_KEYS, AD_ROW_KEYS, AD_SUMMARY_KEYS, ADS_DAILY_ROW_KEYS, ADS_KPI_KEYS, assertExactCount(), assertReadyCounts(), BootstrapPreflightManifest (+30 more)

### Community 52 - "Community 52"
Cohesion: 0.07
Nodes (15): SellpiaRecipeEvidenceAdapter, toEvidenceSku(), Inject, Injectable, checkedMatchedType(), SellpiaManualMatchRepositoryAdapter, toStatus(), Injectable (+7 more)

### Community 53 - "AI schema"
Cohesion: 0.06
Nodes (38): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+30 more)

### Community 54 - "Community 54"
Cohesion: 0.05
Nodes (36): deriveSellpiaInventoryFreshness(), FixedSellpiaAccountKeySchema, FixedSellpiaOriginSchema, IsoDateTimeStringSchema, SELLPIA_INVENTORY_COLLECTION_FAILURE_CODES, SELLPIA_INVENTORY_FRESHNESS_STATUSES, SELLPIA_INVENTORY_REFRESH_REASONS, SellpiaFreshnessDerivationInput (+28 more)

### Community 55 - "Sourcing schema"
Cohesion: 0.07
Nodes (37): Sourcing, NaverPopularKeywordDailySnapshot.boardKey, NaverPopularKeywordDailySnapshot.boardLabel, NaverPopularKeywordDailySnapshot.businessDate, NaverPopularKeywordDailySnapshot.capturedAt, NaverPopularKeywordDailySnapshot.cid, NaverPopularKeywordDailySnapshot.createdAt, NaverPopularKeywordDailySnapshot.id (+29 more)

### Community 56 - "Core schema"
Cohesion: 0.07
Nodes (37): ChannelListing.lastImportRunId, ChannelListingOption.lastImportRunId, Order.sourceImportRunId, SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.coverageEndDate, SourceImportRun.coverageStartDate (+29 more)

### Community 57 - "Sourcing schema"
Cohesion: 0.06
Nodes (33): ContentGeneration.sourceCandidateId, SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.id, SourcingCandidate.imageUrl (+25 more)

### Community 58 - "System schema"
Cohesion: 0.06
Nodes (37): OperationRun.attempts, OperationRun.attemptToken, OperationRun.claimedAt, OperationRun.claimedBy, OperationRun.createdAt, OperationRun.definitionVersion, OperationRun.engineType, OperationRun.errorCode (+29 more)

### Community 59 - "Community 59"
Cohesion: 0.06
Nodes (26): applyProductLinksInBatches(), applyVariantLinksInBatches(), buildCatalogProductProvisioningListings(), publishCatalogOperationalProducts(), unique(), validateProvisionedLinks(), nextPublicationSequence(), productsFromRows() (+18 more)

### Community 60 - "Community 60"
Cohesion: 0.08
Nodes (33): ClientRenderArtifactSchema, ClientRenderContentTypeSchema, ClientRenderDateSchema, ClientRenderOutputWidthSchema, ClientRenderUuidSchema, ClientRenderVariantSchema, DETAIL_IMAGE_COUNTS, DETAIL_PAGE_AGE_GROUPS (+25 more)

### Community 61 - "AI schema"
Cohesion: 0.07
Nodes (35): ContentWorkspaceThumbnailSelection.contentAsset, ContentWorkspaceThumbnailSelection.contentAssetId, ContentWorkspaceThumbnailSelection.contentWorkspace, ContentWorkspaceThumbnailSelection.contentWorkspaceId, ContentWorkspaceThumbnailSelection.createdAt, ContentWorkspaceThumbnailSelection.createdByUser, ContentWorkspaceThumbnailSelection.createdByUserId, ContentWorkspaceThumbnailSelection.id (+27 more)

### Community 62 - "Community 62"
Cohesion: 0.06
Nodes (28): ChannelAccountListItem, ChannelAccountListItemSchema, CoupangAccountSettings, CoupangAccountSettingsSchema, UpdateCoupangAccountSettings, ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow (+20 more)

### Community 63 - "Sourcing schema"
Cohesion: 0.07
Nodes (34): ProductRegistrationExecution.channelAccount, ProductRegistrationExecution.channelListing, ProductRegistrationExecution.channelListingId, ProductRegistrationExecution.completedAt, ProductRegistrationExecution.createdAt, ProductRegistrationExecution.executionKind, ProductRegistrationExecution.expectedProviderAccountId, ProductRegistrationExecution.externalListingId (+26 more)

### Community 64 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+25 more)

### Community 65 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.startedAt, WorkflowRun.status (+25 more)

### Community 66 - "Community 66"
Cohesion: 0.07
Nodes (31): DeliveryCompany, DeliveryCompanySchema, Order, OrderActionResponse, OrderActionResponseSchema, OrderLineItem, OrderLineItemSchema, OrderListItem (+23 more)

### Community 67 - "Community 67"
Cohesion: 0.07
Nodes (29): SellpiaInventoryCollectionFailureCodeSchema, SellpiaInventoryGenerationSchema, SellpiaInventoryQualityReportSchema, SellpiaInventoryRefreshReasonSchema, CompletedSourceArtifactRun, CoupangWingCatalogImportResponse, CoupangWingCatalogImportResponseSchema, ImportChanges (+21 more)

### Community 68 - "AI schema"
Cohesion: 0.08
Nodes (31): ContentGeneration.contentWorkspaceId, ContentWorkspace.channelListing, ContentWorkspace.channelListingId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.createdByUserId, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageRevision (+23 more)

### Community 69 - "Supply schema"
Cohesion: 0.07
Nodes (32): RocketPurchaseConfirmation.artifactBytes, RocketPurchaseConfirmation.artifactContentType, RocketPurchaseConfirmation.artifactFileName, RocketPurchaseConfirmation.artifactSha256, RocketPurchaseConfirmation.artifactStoredAt, RocketPurchaseConfirmation.channelAccount, RocketPurchaseConfirmation.channelAccountId, RocketPurchaseConfirmation.completedAt (+24 more)

### Community 70 - "Channels schema"
Cohesion: 0.07
Nodes (28): SellpiaManualMatchSnapshot.aliasCount, SellpiaManualMatchSnapshot.capturedAt, SellpiaManualMatchSnapshot.createdAt, SellpiaManualMatchSnapshot.id, SellpiaManualMatchSnapshot.matchedTargetCount, SellpiaManualMatchSnapshot.organization, SellpiaManualMatchSnapshot.schemaVersion, SellpiaManualMatchSnapshot.snapshotHash (+20 more)

### Community 71 - "Community 71"
Cohesion: 0.12
Nodes (15): ChannelListingController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+7 more)

### Community 72 - "Community 72"
Cohesion: 0.08
Nodes (12): Inject, ChannelProductMatchingRepositoryAdapter, lockChannelListing(), Injectable, ChannelSkuAvailabilityPort, ChannelProductMatchingRepositoryPort, Inject, ChannelSkuAvailabilityService (+4 more)

### Community 73 - "Channels schema"
Cohesion: 0.08
Nodes (31): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.channelAccount, ChannelScrapeRun.channelAccountId, ChannelScrapeRun.clientRunKey, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson (+23 more)

### Community 74 - "Channels schema"
Cohesion: 0.07
Nodes (31): RocketPoCatalogLine.businessDateBasis, RocketPoCatalogLine.center, RocketPoCatalogLine.createdAt, RocketPoCatalogLine.hasConfirmation, RocketPoCatalogLine.id, RocketPoCatalogLine.inboundType, RocketPoCatalogLine.orderQty, RocketPoCatalogLine.organization (+23 more)

### Community 75 - "Inventory schema"
Cohesion: 0.07
Nodes (30): SellpiaInventoryState.activeGeneration, SellpiaInventoryState.activeSyncLeaseExpiresAt, SellpiaInventoryState.activeSyncOwner, SellpiaInventoryState.activeSyncOwnerUserId, SellpiaInventoryState.activeSyncScope, SellpiaInventoryState.activeSyncStartedAt, SellpiaInventoryState.activeSyncToken, SellpiaInventoryState.createdAt (+22 more)

### Community 76 - "Channels schema"
Cohesion: 0.09
Nodes (23): CoupangRocketPurchaseOrderOperationHandler, Inject, Injectable, CHANNELS_OPERATIONS, CoupangRocketPurchaseOrderInputSchema, RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt (+15 more)

### Community 77 - "AgentOS schema"
Cohesion: 0.07
Nodes (29): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.approver, AgentApprovalRequest.approverUserId, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy, AgentApprovalRequest.decidedByUserId (+21 more)

### Community 78 - "Community 78"
Cohesion: 0.09
Nodes (24): ChannelListingDeletionDto, ChannelListingDeletionUnresolvedDto, ChannelListingQueryDto, IsIn, IsOptional, IsString, IsUUID, MaxLength (+16 more)

### Community 79 - "System schema"
Cohesion: 0.08
Nodes (26): Alert.actionTask, Alert.actorUser, Alert.actorUserId, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead (+18 more)

### Community 80 - "AgentOS schema"
Cohesion: 0.08
Nodes (28): AgentOS, AgentAuthorizationEvent.toolId, AgentInstanceToolPolicy.agentInstance, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentInstanceToolPolicy.dryRunMode, AgentInstanceToolPolicy.effect (+20 more)

### Community 81 - "Channels schema"
Cohesion: 0.08
Nodes (26): ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.id, ChannelScrapeSnapshot.listing, ChannelScrapeSnapshot.listingOption (+18 more)

### Community 82 - "Community 82"
Cohesion: 0.11
Nodes (24): AdCampaignAccountProjection, AdCampaignDailyRepairPlan, AdCampaignListingProjection, AdCampaignRepairRunInput, AdCampaignRepairSnapshotInput, AdCampaignTargetProjection, AdMetrics, asRecord() (+16 more)

### Community 83 - "Community 83"
Cohesion: 0.14
Nodes (27): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+19 more)

### Community 84 - "Community 84"
Cohesion: 0.08
Nodes (18): RocketPoCatalogPort, RocketPoCatalogResolution, automationReason(), countDecision(), emptyScopedResult(), proposalVersion(), requiredSuggestion(), toPreviewItem() (+10 more)

### Community 85 - "Community 85"
Cohesion: 0.15
Nodes (26): cellText(), collectParentMetadataConflicts(), decodeWorksheetRange(), expandMergedParentCells(), findHeaderRow(), formattedCellText(), hasCellValue(), headersForRow() (+18 more)

### Community 86 - "Community 86"
Cohesion: 0.11
Nodes (19): CHANNELS_ROOT, REPO_ROOT, analyzeSchemaArtifactSync(), changedFilesFromGit(), changedFilesFromWorkingTree(), GENERATED_ARTIFACT_PATHS, git(), main() (+11 more)

### Community 87 - "Orders schema"
Cohesion: 0.09
Nodes (27): Orders, Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.id, Shipment.order (+19 more)

### Community 88 - "AgentOS schema"
Cohesion: 0.08
Nodes (27): AgentToolInvocation.agentInstance, AgentToolInvocation.approvalRequest, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt, AgentToolInvocation.errorCode, AgentToolInvocation.errorMessage (+19 more)

### Community 89 - "Channels schema"
Cohesion: 0.08
Nodes (27): ChannelListingDeletionOperation.authorizationExpiresAt, ChannelListingDeletionOperation.channelAccount, ChannelListingDeletionOperation.channelListing, ChannelListingDeletionOperation.channelListingId, ChannelListingDeletionOperation.completedAt, ChannelListingDeletionOperation.createdAt, ChannelListingDeletionOperation.expectedProviderAccountId, ChannelListingDeletionOperation.externalListingId (+19 more)

### Community 90 - "Channels schema"
Cohesion: 0.08
Nodes (27): CoupangWingSalesRankDailySnapshot.businessDate, CoupangWingSalesRankDailySnapshot.capturedAt, CoupangWingSalesRankDailySnapshot.categoryHierarchy, CoupangWingSalesRankDailySnapshot.collectedCount, CoupangWingSalesRankDailySnapshot.conversionRate28d, CoupangWingSalesRankDailySnapshot.createdAt, CoupangWingSalesRankDailySnapshot.id, CoupangWingSalesRankDailySnapshot.itemId (+19 more)

### Community 91 - "Community 91"
Cohesion: 0.14
Nodes (24): option(), appendFlag(), appendOption(), appendProjectReferenceDefaults(), appendValues(), commandExport(), commandReplay(), commandSanitize() (+16 more)

### Community 92 - "Community 92"
Cohesion: 0.09
Nodes (16): ChannelAccountController, Body, Controller, CurrentOrganization, Get, RocketAccountController, Controller, CurrentOrganization (+8 more)

### Community 93 - "Community 93"
Cohesion: 0.13
Nodes (16): ChannelAccountRepositoryAdapter, envelopeToJson(), maskAccessKey(), readCredentialsConfig(), stripLegacyCredentialKeys(), toJsonRecord(), toRecord(), trimToOptional() (+8 more)

### Community 94 - "Channels schema"
Cohesion: 0.09
Nodes (25): ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isOfferWinner, ChannelListingOptionDailySnapshot.lastObservedAt, ChannelListingOptionDailySnapshot.listing (+17 more)

### Community 95 - "Community 95"
Cohesion: 0.10
Nodes (25): ChannelProductMatchingQueueResponseSchema, InventorySkuSnapshotListResponseSchema, CreateProductVariantRecipesIfEmptyResponseSchema, PlanProductVariantRecipesIfEmptyResponseSchema, artifact(), ApiClient, assertPartition(), assertPrivateOutputPath() (+17 more)

### Community 96 - "Channels schema"
Cohesion: 0.11
Nodes (21): manualMatchAliasCandidates(), aggregateRows(), sameStrings(), strongerMatchedType(), normalizeSellpiaManualMatchAlias(), SellpiaManualMatchAlias.aliasTitle, SellpiaManualMatchAlias.createdAt, SellpiaManualMatchAlias.evidenceCount (+13 more)

### Community 97 - "AgentOS schema"
Cohesion: 0.09
Nodes (24): AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy, AgentAuthorizationEvent.decidedByUserId, AgentAuthorizationEvent.decision (+16 more)

### Community 98 - "AgentOS schema"
Cohesion: 0.09
Nodes (24): AgentInstance.adapterConfig, AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.icon, AgentInstance.id, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name (+16 more)

### Community 99 - "Channels schema"
Cohesion: 0.10
Nodes (24): SellpiaProductMonthlySales.buyPrice, SellpiaProductMonthlySales.capturedAt, SellpiaProductMonthlySales.costBasis, SellpiaProductMonthlySales.coverageEndDate, SellpiaProductMonthlySales.coverageStartDate, SellpiaProductMonthlySales.createdAt, SellpiaProductMonthlySales.id, SellpiaProductMonthlySales.inAmount (+16 more)

### Community 100 - "System schema"
Cohesion: 0.10
Nodes (23): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.href (+15 more)

### Community 101 - "Advertising schema"
Cohesion: 0.09
Nodes (23): AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+15 more)

### Community 102 - "Orders schema"
Cohesion: 0.10
Nodes (23): OrderReturn.channelAccount, OrderReturn.channelAccountId, OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.id (+15 more)

### Community 103 - "Community 103"
Cohesion: 0.09
Nodes (19): adapterPaths, BROWSER_COLLECTION_ATTENTION_REASONS, BROWSER_COLLECTION_PRODUCERS, BROWSER_COLLECTION_STATES, BrowserCollectionAttentionReasonSchema, BrowserCollectionClassificationSchema, BrowserCollectionCommand, BrowserCollectionCommandSchema (+11 more)

### Community 104 - "Community 104"
Cohesion: 0.22
Nodes (8): ChannelDashboardController, Controller, CurrentOrganization, Get, Query, CoupangDateRangeQueryDto, ChannelDashboardService, Injectable

### Community 105 - "Community 105"
Cohesion: 0.11
Nodes (18): assertActiveCoupangAccount(), assertCanonicalAccount(), ChannelCatalogPublicationRepositoryAdapter, completeCollectionRun(), completedCollectionResult(), flattenMedia(), jsonRecord(), lockAccount() (+10 more)

### Community 106 - "Community 106"
Cohesion: 0.13
Nodes (22): assembleCompleteSnapshot(), assertSameManifest(), buildCollectionStatus(), countMedia(), countOptions(), derivePhase(), firstDate(), hashCatalogChunkPayload() (+14 more)

### Community 107 - "Channels schema"
Cohesion: 0.11
Nodes (22): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.channelAccount, ChannelAccountDailyKpiSnapshot.channelAccountId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+14 more)

### Community 108 - "Supply schema"
Cohesion: 0.11
Nodes (22): RocketPurchaseConfirmationLine.channelListingOption, RocketPurchaseConfirmationLine.channelListingOptionId, RocketPurchaseConfirmationLine.collectedAt, RocketPurchaseConfirmationLine.collectedOrderLineItemId, RocketPurchaseConfirmationLine.confirmation, RocketPurchaseConfirmationLine.confirmationId, RocketPurchaseConfirmationLine.confirmedQuantity, RocketPurchaseConfirmationLine.createdAt (+14 more)

### Community 109 - "Sourcing schema"
Cohesion: 0.11
Nodes (22): TiktokCreativeTrendDailySnapshot.businessDate, TiktokCreativeTrendDailySnapshot.capturedAt, TiktokCreativeTrendDailySnapshot.createdAt, TiktokCreativeTrendDailySnapshot.entityKey, TiktokCreativeTrendDailySnapshot.growthPct, TiktokCreativeTrendDailySnapshot.id, TiktokCreativeTrendDailySnapshot.industry, TiktokCreativeTrendDailySnapshot.label (+14 more)

### Community 110 - "Community 110"
Cohesion: 0.20
Nodes (16): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), REDACTED_PLACEHOLDER, scrubDeep(), scrubSecrets(), walk(), checkTrackedClaudeDirectory() (+8 more)

### Community 111 - "Community 111"
Cohesion: 0.13
Nodes (16): aiProductSuggestion(), aiVariantSuggestion(), asRecord(), availabilityListingWhere(), completedCatalogRunWhere(), componentSource(), distinctStrings(), firstString() (+8 more)

### Community 112 - "AgentOS schema"
Cohesion: 0.10
Nodes (21): AgentArtifact.agentInstance, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization, AgentArtifact.request (+13 more)

### Community 113 - "AI schema"
Cohesion: 0.11
Nodes (21): AiDirectJob.attempts, AiDirectJob.claimedAt, AiDirectJob.claimedBy, AiDirectJob.createdAt, AiDirectJob.finishedAt, AiDirectJob.id, AiDirectJob.jobType, AiDirectJob.lastErrorCode (+13 more)

### Community 114 - "System schema"
Cohesion: 0.10
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+13 more)

### Community 115 - "Channels schema"
Cohesion: 0.11
Nodes (21): CoupangKeywordRankDailySnapshot.adRank, CoupangKeywordRankDailySnapshot.businessDate, CoupangKeywordRankDailySnapshot.capturedAt, CoupangKeywordRankDailySnapshot.createdAt, CoupangKeywordRankDailySnapshot.id, CoupangKeywordRankDailySnapshot.itemId, CoupangKeywordRankDailySnapshot.keyword, CoupangKeywordRankDailySnapshot.organicRank (+13 more)

### Community 116 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): LiveCommerceBroadcastDailySnapshot.broadcasterId, LiveCommerceBroadcastDailySnapshot.broadcasterName, LiveCommerceBroadcastDailySnapshot.broadcastId, LiveCommerceBroadcastDailySnapshot.businessDate, LiveCommerceBroadcastDailySnapshot.capturedAt, LiveCommerceBroadcastDailySnapshot.coverImageUrl, LiveCommerceBroadcastDailySnapshot.createdAt, LiveCommerceBroadcastDailySnapshot.endedAt (+13 more)

### Community 117 - "Core schema"
Cohesion: 0.12
Nodes (21): MasterProductAbcEvaluation.formulaVersionId, MasterProductAbcFormulaVersion.calculationCodeChecksum, MasterProductAbcFormulaVersion.calibrationMetricsJson, MasterProductAbcFormulaVersion.createdAt, MasterProductAbcFormulaVersion.firstActivatedAt, MasterProductAbcFormulaVersion.foldCount, MasterProductAbcFormulaVersion.formulaChecksum, MasterProductAbcFormulaVersion.formulaJson (+13 more)

### Community 118 - "Orders schema"
Cohesion: 0.10
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 119 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): ShortsTrendDailySnapshot.businessDate, ShortsTrendDailySnapshot.capturedAt, ShortsTrendDailySnapshot.channelName, ShortsTrendDailySnapshot.commentCount, ShortsTrendDailySnapshot.createdAt, ShortsTrendDailySnapshot.id, ShortsTrendDailySnapshot.keyword, ShortsTrendDailySnapshot.likeCount (+13 more)

### Community 120 - "AI schema"
Cohesion: 0.10
Nodes (21): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.contentWorkspace, ThumbnailAnalysis.contentWorkspaceId, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id (+13 more)

### Community 121 - "Community 121"
Cohesion: 0.20
Nodes (21): assertSharedDatabaseIdentity(), assertSharedRebuildGuard(), bootstrap(), bootstrapPlanFromCli(), buildSharedBootstrapPlan(), cliValue(), createPrisma(), databaseProjectRef() (+13 more)

### Community 122 - "Community 122"
Cohesion: 0.11
Nodes (9): ChannelAccountListController, Controller, CurrentOrganization, Get, ChannelAccountRepositoryPort, ChannelAccountQueryService, Inject, Injectable (+1 more)

### Community 123 - "AgentOS schema"
Cohesion: 0.11
Nodes (20): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id, AgentCostEvent.inputTokens (+12 more)

### Community 124 - "AgentOS schema"
Cohesion: 0.12
Nodes (20): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.agentInstanceId, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError (+12 more)

### Community 125 - "Orders schema"
Cohesion: 0.12
Nodes (20): OrderLineItem.createdAt, OrderLineItem.externalBarcode, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.metadata, OrderLineItem.optionName, OrderLineItem.order (+12 more)

### Community 126 - "Finance schema"
Cohesion: 0.12
Nodes (20): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit (+12 more)

### Community 127 - "Sourcing schema"
Cohesion: 0.12
Nodes (20): Sourcing1688HotProductDailySnapshot.businessDate, Sourcing1688HotProductDailySnapshot.capturedAt, Sourcing1688HotProductDailySnapshot.createdAt, Sourcing1688HotProductDailySnapshot.id, Sourcing1688HotProductDailySnapshot.imageUrl, Sourcing1688HotProductDailySnapshot.monthlySales, Sourcing1688HotProductDailySnapshot.offerId, Sourcing1688HotProductDailySnapshot.organization (+12 more)

### Community 128 - "Community 128"
Cohesion: 0.17
Nodes (20): assertCurrentRebuildBinding(), assertProtectedApiDestination(), assertRebuildImportPrerequisites(), assertReplayCounts(), assertReplayFactDigest(), assertStoredImportBinding(), assertUuid(), bindRebuildImports() (+12 more)

### Community 129 - "Community 129"
Cohesion: 0.21
Nodes (18): analyzePrReleaseContract(), changedFilesFromGit(), classifyFiles(), compareSemver(), deletedFilesFromGit(), ghPrBody(), git(), hasReleaseDecision() (+10 more)

### Community 130 - "Orders schema"
Cohesion: 0.12
Nodes (19): CoupangDirectPoSnapshot.centerName, CoupangDirectPoSnapshot.channelAccountId, CoupangDirectPoSnapshot.collectedAt, CoupangDirectPoSnapshot.createdAt, CoupangDirectPoSnapshot.deliveryDate, CoupangDirectPoSnapshot.id, CoupangDirectPoSnapshot.isUrgent, CoupangDirectPoSnapshot.itemsJson (+11 more)

### Community 131 - "Channels schema"
Cohesion: 0.12
Nodes (19): CoupangWingTrackedProductDailySnapshot.businessDate, CoupangWingTrackedProductDailySnapshot.capturedAt, CoupangWingTrackedProductDailySnapshot.conversionRate28d, CoupangWingTrackedProductDailySnapshot.createdAt, CoupangWingTrackedProductDailySnapshot.estimatedRevenue28d, CoupangWingTrackedProductDailySnapshot.id, CoupangWingTrackedProductDailySnapshot.organization, CoupangWingTrackedProductDailySnapshot.pvLast28Day (+11 more)

### Community 132 - "Inventory schema"
Cohesion: 0.12
Nodes (19): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.notes, ReturnTransfer.optionName, ReturnTransfer.organization (+11 more)

### Community 133 - "Community 133"
Cohesion: 0.15
Nodes (14): PRODUCT_LIFECYCLE_STATES, ProductLifecycleState, ProductLifecycleStateSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, MasterImageItem, MasterImageItemSchema, MasterImageRole (+6 more)

### Community 134 - "Community 134"
Cohesion: 0.16
Nodes (19): asRecord(), conversionRate(), dailyRawMetricsMatch(), dateStringMatches(), exactHeaderValues(), finiteNumber(), hasExactCoupangAdsDailyRawProvenance(), isExactWholeAccountCampaignRun() (+11 more)

### Community 135 - "Community 135"
Cohesion: 0.19
Nodes (18): assertAllowedArguments(), assertPublishableMain(), copyLoadableExtension(), createArchive(), environmentProfiles, githubReleaseCommand(), gitOutput(), gitSha() (+10 more)

### Community 136 - "Community 136"
Cohesion: 0.18
Nodes (10): assertCanonicalCoupangAccountIdentity(), canonicalParentRows(), ChannelCatalogImportRepositoryAdapter, importResponse(), isUniqueConstraintError(), nextPublicationSequence(), Injectable, zeroChanges() (+2 more)

### Community 137 - "Community 137"
Cohesion: 0.11
Nodes (4): ChannelDashboardRepositoryAdapter, Injectable, ChannelDashboardRepositoryPort, Inject

### Community 138 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.id, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.lastRunId (+10 more)

### Community 139 - "AI schema"
Cohesion: 0.12
Nodes (18): ContentAsset.originGenerationGroupId, ContentGeneration.generationGroupId, ContentGenerationGroup.baseContentGeneration, ContentGenerationGroup.baseContentGenerationId, ContentGenerationGroup.contentWorkspace, ContentGenerationGroup.contentWorkspaceId, ContentGenerationGroup.createdAt, ContentGenerationGroup.createdByUserId (+10 more)

### Community 140 - "Sourcing schema"
Cohesion: 0.14
Nodes (18): LiveCommerceProductDailySnapshot.broadcastId, LiveCommerceProductDailySnapshot.businessDate, LiveCommerceProductDailySnapshot.capturedAt, LiveCommerceProductDailySnapshot.createdAt, LiveCommerceProductDailySnapshot.id, LiveCommerceProductDailySnapshot.imageUrl, LiveCommerceProductDailySnapshot.organization, LiveCommerceProductDailySnapshot.priceCny (+10 more)

### Community 141 - "Sourcing schema"
Cohesion: 0.13
Nodes (18): NaverKeywordDailySnapshot.averageAdRank, NaverKeywordDailySnapshot.businessDate, NaverKeywordDailySnapshot.capturedAt, NaverKeywordDailySnapshot.competitionIndex, NaverKeywordDailySnapshot.createdAt, NaverKeywordDailySnapshot.id, NaverKeywordDailySnapshot.keyword, NaverKeywordDailySnapshot.monthlyMobileSearchCount (+10 more)

### Community 142 - "Channels schema"
Cohesion: 0.14
Nodes (18): RocketPoCatalogSnapshot.channelAccount, RocketPoCatalogSnapshot.channelAccountId, RocketPoCatalogSnapshot.collectionRunId, RocketPoCatalogSnapshot.createdAt, RocketPoCatalogSnapshot.detailPoCount, RocketPoCatalogSnapshot.id, RocketPoCatalogSnapshot.listPagesRead, RocketPoCatalogSnapshot.organization (+10 more)

### Community 143 - "Inventory schema"
Cohesion: 0.12
Nodes (18): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.fromWarehouseId, StockTransfer.id, StockTransfer.notes, StockTransfer.optionName, StockTransfer.organization (+10 more)

### Community 144 - "Community 144"
Cohesion: 0.18
Nodes (8): ChannelCatalogCollectionRepositoryAdapter, isUniqueConstraintError(), ownedRunWhere(), Injectable, ChannelCatalogCollectionChunkRecord, ChannelCatalogCollectionRunRecord, ChannelCatalogCollectionWithChunks, startRun()

### Community 145 - "Core schema"
Cohesion: 0.12
Nodes (17): MasterProductAbcGradeHistory.adjustedScore, MasterProductAbcGradeHistory.calculatedAt, MasterProductAbcGradeHistory.calculationStatus, MasterProductAbcGradeHistory.formulaVersion, MasterProductAbcGradeHistory.formulaVersionId, MasterProductAbcGradeHistory.id, MasterProductAbcGradeHistory.masterProduct, MasterProductAbcGradeHistory.masterProductId (+9 more)

### Community 146 - "Community 146"
Cohesion: 0.22
Nodes (17): assertBootstrapPreflightManifest(), assertIsoTimestamp(), assertPositiveIntegerText(), assertPostgresUuid(), assertStagingAccountBaselineManifest(), assertUnique(), buildBootstrapPreflightManifest(), buildChannelAccountFingerprint() (+9 more)

### Community 147 - "Community 147"
Cohesion: 0.23
Nodes (5): Inject, ChannelCatalogCollectionPort, ChannelCatalogCollectionService, parseRequest(), Injectable

### Community 148 - "Community 148"
Cohesion: 0.12
Nodes (15): CurrentOrganization, Get, Query, ChannelSkuAvailabilityQueryDto, IsIn, IsInt, IsOptional, IsString (+7 more)

### Community 149 - "AgentOS schema"
Cohesion: 0.15
Nodes (16): AgentRunEvent.agentInstance, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message, AgentRunEvent.organization (+8 more)

### Community 150 - "Channels schema"
Cohesion: 0.16
Nodes (16): ChannelScrapeChunk.checksum, ChannelScrapeChunk.createdAt, ChannelScrapeChunk.id, ChannelScrapeChunk.itemCount, ChannelScrapeChunk.kind, ChannelScrapeChunk.organization, ChannelScrapeChunk.payload, ChannelScrapeChunk.publicationJson (+8 more)

### Community 151 - "Channels schema"
Cohesion: 0.14
Nodes (16): CoupangWingTrackedProduct.brandName, CoupangWingTrackedProduct.categoryHierarchy, CoupangWingTrackedProduct.createdAt, CoupangWingTrackedProduct.enabled, CoupangWingTrackedProduct.id, CoupangWingTrackedProduct.imagePath, CoupangWingTrackedProduct.itemId, CoupangWingTrackedProduct.lastCapturedAt (+8 more)

### Community 152 - "Inventory schema"
Cohesion: 0.13
Nodes (16): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.organization, PickingItem.pickedAt, PickingItem.pickingList (+8 more)

### Community 153 - "Inventory schema"
Cohesion: 0.15
Nodes (16): PickingItem.pickingListId, PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.id, PickingList.listNumber, PickingList.organization, PickingList.pickedItems (+8 more)

### Community 154 - "Supply schema"
Cohesion: 0.16
Nodes (16): RocketPurchaseConfirmationTransmission.confirmation, RocketPurchaseConfirmationTransmission.confirmationId, RocketPurchaseConfirmationTransmission.createdAt, RocketPurchaseConfirmationTransmission.id, RocketPurchaseConfirmationTransmission.intentKey, RocketPurchaseConfirmationTransmission.matchedLineCount, RocketPurchaseConfirmationTransmission.observedAt, RocketPurchaseConfirmationTransmission.organization (+8 more)

### Community 155 - "Supply schema"
Cohesion: 0.13
Nodes (16): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.dueDate, SupplierPayment.id, SupplierPayment.notes, SupplierPayment.organization, SupplierPayment.paidAmount, SupplierPayment.paidDate (+8 more)

### Community 156 - "Orders schema"
Cohesion: 0.13
Nodes (16): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.externalSku, UnshippedItem.id, UnshippedItem.isNotified, UnshippedItem.notifiedAt, UnshippedItem.optionName, UnshippedItem.order (+8 more)

### Community 157 - "Community 157"
Cohesion: 0.24
Nodes (14): analyzeReconstructionTriggers(), changedFilesFromGit(), ghPrBody(), git(), isCrossLayerControlChange(), isHighRiskBoundary(), isLargeServiceOrComponent(), layerOf() (+6 more)

### Community 158 - "Community 158"
Cohesion: 0.28
Nodes (10): ChannelCatalogCollectionController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+2 more)

### Community 159 - "Finance schema"
Cohesion: 0.14
Nodes (15): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description (+7 more)

### Community 160 - "Orders schema"
Cohesion: 0.14
Nodes (15): CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing (+7 more)

### Community 161 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 162 - "Finance schema"
Cohesion: 0.14
Nodes (15): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.id, ProcessingCost.master, ProcessingCost.notes, ProcessingCost.organization, ProcessingCost.processType, ProcessingCost.productName (+7 more)

### Community 163 - "Finance schema"
Cohesion: 0.15
Nodes (15): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.organization, SalesPlan.period (+7 more)

### Community 164 - "Inventory schema"
Cohesion: 0.14
Nodes (15): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.sourceRef, SellpiaReceiptUploadBatch.sourceType (+7 more)

### Community 165 - "Channels schema"
Cohesion: 0.16
Nodes (15): SellpiaSalesDailySnapshot.businessDate, SellpiaSalesDailySnapshot.capturedAt, SellpiaSalesDailySnapshot.channelGroup, SellpiaSalesDailySnapshot.costKrw, SellpiaSalesDailySnapshot.createdAt, SellpiaSalesDailySnapshot.id, SellpiaSalesDailySnapshot.organization, SellpiaSalesDailySnapshot.qty (+7 more)

### Community 166 - "Inventory schema"
Cohesion: 0.15
Nodes (15): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items, StockAudit.matchedCount (+7 more)

### Community 167 - "Supply schema"
Cohesion: 0.16
Nodes (15): SupplierProduct.createdAt, SupplierProduct.id, SupplierProduct.isPrimary, SupplierProduct.memo, SupplierProduct.minOrderQty, SupplierProduct.organization, SupplierProduct.sellpiaInventorySku, SupplierProduct.sellpiaInventorySkuId (+7 more)

### Community 168 - "Inventory schema"
Cohesion: 0.16
Nodes (15): Warehouse.address, Warehouse.code, Warehouse.createdAt, Warehouse.id, Warehouse.isDefault, Warehouse.manager, Warehouse.name, Warehouse.organization (+7 more)

### Community 169 - "Community 169"
Cohesion: 0.19
Nodes (12): SELLPIA_WORKBOOK_ACCEPT, SELLPIA_WORKBOOK_FILE_EXTENSIONS, SELLPIA_WORKBOOK_FORMAT_LABEL, SellpiaReceiptBatchCreateInput, SellpiaReceiptBatchCreateInputSchema, SellpiaReceiptBatchMarkUploadedInput, SellpiaReceiptBatchMarkUploadedInputSchema, SellpiaReceiptUploadBatch (+4 more)

### Community 170 - "Community 170"
Cohesion: 0.14
Nodes (12): checkSellpiaCutoverPreflight(), createPrisma(), main(), MAX_SELLPIA_CUTOVER_EXAMPLES, ReadonlyQueryClient, runSellpiaCutoverPreflight(), SELLPIA_CUTOVER_PREFLIGHT_SCHEMA_VERSION, SELLPIA_CUTOVER_TARGET_RELEASE (+4 more)

### Community 171 - "Community 171"
Cohesion: 0.19
Nodes (6): buildCoupangWingSnapshotCoverage(), CoupangWingSnapshotCoverage, ChannelCatalogImportRepositoryPort, Inject, ParsedWingCatalogRow, ParsedWingCatalogSkippedRow

### Community 172 - "System schema"
Cohesion: 0.15
Nodes (12): FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name, FeatureGate.updatedAt (+4 more)

### Community 173 - "Community 173"
Cohesion: 0.26
Nodes (14): asRecord(), assertNoPii(), boundedReplayScope(), buildReplayBody(), buildReplayKpis(), cloneReplayValue(), containsPiiValue(), copyString() (+6 more)

### Community 174 - "Channels schema"
Cohesion: 0.19
Nodes (13): CoupangKeywordSerpDailySnapshot.businessDate, CoupangKeywordSerpDailySnapshot.capturedAt, CoupangKeywordSerpDailySnapshot.createdAt, CoupangKeywordSerpDailySnapshot.id, CoupangKeywordSerpDailySnapshot.itemCount, CoupangKeywordSerpDailySnapshot.items, CoupangKeywordSerpDailySnapshot.keyword, CoupangKeywordSerpDailySnapshot.organization (+5 more)

### Community 175 - "Finance schema"
Cohesion: 0.17
Nodes (13): GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.listing, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization, GradeHistory.reason (+5 more)

### Community 176 - "Core schema"
Cohesion: 0.17
Nodes (13): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+5 more)

### Community 177 - "Orders schema"
Cohesion: 0.17
Nodes (13): OrderReturnLineItem.createdAt, OrderReturnLineItem.externalSku, OrderReturnLineItem.id, OrderReturnLineItem.listingOption, OrderReturnLineItem.metadata, OrderReturnLineItem.optionName, OrderReturnLineItem.orderLineItem, OrderReturnLineItem.organization (+5 more)

### Community 178 - "Channels schema"
Cohesion: 0.18
Nodes (13): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson, RocketSupplyDailySnapshot.revenueKrw (+5 more)

### Community 179 - "Community 179"
Cohesion: 0.29
Nodes (13): assertAllowedRecord(), assertAllowedRows(), assertAllowedScalarRecord(), assertObservedMetrics(), assertOptionalScalar(), assertPlainRecord(), assertReplayBundle(), assertReplayFactCounts() (+5 more)

### Community 180 - "Community 180"
Cohesion: 0.20
Nodes (4): ChannelSyncRepositoryAdapter, reconcileProductDetailOption(), Injectable, ProductListingSyncResult

### Community 181 - "Inventory schema"
Cohesion: 0.20
Nodes (12): Inventory, CoupangShipmentDateSummary.boxes, CoupangShipmentDateSummary.capturedAt, CoupangShipmentDateSummary.count, CoupangShipmentDateSummary.createdAt, CoupangShipmentDateSummary.id, CoupangShipmentDateSummary.organization, CoupangShipmentDateSummary.shipmentDate (+4 more)

### Community 182 - "Supply schema"
Cohesion: 0.18
Nodes (12): Supply, PurchaseOrderItem.createdAt, PurchaseOrderItem.id, PurchaseOrderItem.order, PurchaseOrderItem.organization, PurchaseOrderItem.productName, PurchaseOrderItem.quantity, PurchaseOrderItem.sellpiaInventorySku (+4 more)

### Community 183 - "Channels schema"
Cohesion: 0.20
Nodes (12): CoupangKeywordTracker.createdAt, CoupangKeywordTracker.enabled, CoupangKeywordTracker.id, CoupangKeywordTracker.keyword, CoupangKeywordTracker.lastCapturedAt, CoupangKeywordTracker.maxPages, CoupangKeywordTracker.organization, CoupangKeywordTracker.updatedAt (+4 more)

### Community 184 - "Core schema"
Cohesion: 0.18
Nodes (10): MasterProductAbcFormulaState.activatedAt, MasterProductAbcFormulaState.activeFormulaVersion, MasterProductAbcFormulaState.activeFormulaVersionId, MasterProductAbcFormulaState.createdAt, MasterProductAbcFormulaState.organization, MasterProductAbcFormulaState.revision, MasterProductAbcFormulaState.updatedAt, MasterProductAbcFormulaState (+2 more)

### Community 185 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 186 - "Supply schema"
Cohesion: 0.21
Nodes (12): RocketPurchaseConfirmationAllocation.confirmationLine, RocketPurchaseConfirmationAllocation.confirmationLineId, RocketPurchaseConfirmationAllocation.createdAt, RocketPurchaseConfirmationAllocation.id, RocketPurchaseConfirmationAllocation.organization, RocketPurchaseConfirmationAllocation.quantity, RocketPurchaseConfirmationAllocation.sellpiaInventorySku, RocketPurchaseConfirmationAllocation.sellpiaInventorySkuId (+4 more)

### Community 187 - "Community 187"
Cohesion: 0.18
Nodes (3): ChannelCatalogCollectionRepositoryPort, ChannelCatalogPublicationPort, Inject

### Community 188 - "Community 188"
Cohesion: 0.20
Nodes (5): MAX_COUPANG_WING_IMPORT_ROWS, PARENT_COLUMN_INDEXES, REQUIRED_HEADERS, workbookBuffer(), WorkbookOptions

### Community 189 - "System schema"
Cohesion: 0.20
Nodes (11): ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization, ActivityEvent.source (+3 more)

### Community 190 - "Core schema"
Cohesion: 0.22
Nodes (11): CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.keywords, CategoryMapping.organization, CategoryMapping.updatedAt (+3 more)

### Community 191 - "Community 191"
Cohesion: 0.20
Nodes (10): canRetryChannelListingDeletionProviderSideEffect(), canRetryProviderSideEffect(), isOperationTerminal(), OPERATION_STATUSES, OperationStatus, OperationStatusSchema, PROVIDER_OUTCOMES, ProviderOutcome (+2 more)

### Community 192 - "Community 192"
Cohesion: 0.22
Nodes (8): CoupangCategorySuggestion, CoupangCategorySuggestionRequest, CoupangCategorySuggestionRequestSchema, CoupangCategorySuggestionResponse, CoupangCategorySuggestionResponseSchema, CoupangCategorySuggestionResult, CoupangCategorySuggestionResultSchema, CoupangCategorySuggestionSchema

### Community 193 - "Community 193"
Cohesion: 0.35
Nodes (9): analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), directOutPortFiles(), FORBIDDEN_IN_PORT_FOLDER_NAMES, forbiddenInPortCallerFolders(), listDirectories(), listFiles(), main() (+1 more)

### Community 194 - "System schema"
Cohesion: 0.24
Nodes (10): System, SystemSetting.createdAt, SystemSetting.id, SystemSetting.key, SystemSetting.organization, SystemSetting.updatedAt, SystemSetting.value, SystemSetting (+2 more)

### Community 195 - "Community 195"
Cohesion: 0.38
Nodes (8): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), main(), parseBaseline(), readFiles(), repoRoot(), walk()

### Community 196 - "Channels schema"
Cohesion: 0.25
Nodes (9): Channels, CoupangRepresentativeKeywordOverride.createdAt, CoupangRepresentativeKeywordOverride.id, CoupangRepresentativeKeywordOverride.keyword, CoupangRepresentativeKeywordOverride.organization, CoupangRepresentativeKeywordOverride.updatedAt, CoupangRepresentativeKeywordOverride, coupang_representative_keyword_overrides (+1 more)

### Community 197 - "Core schema"
Cohesion: 0.25
Nodes (9): AuthSession.createdAt, AuthSession.expiresAt, AuthSession.id, AuthSession.revokedAt, AuthSession.tokenHash, AuthSession.user, AuthSession.userId, AuthSession (+1 more)

### Community 198 - "Advertising schema"
Cohesion: 0.25
Nodes (9): ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.id, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.url, ScrapeTarget (+1 more)

### Community 199 - "Community 199"
Cohesion: 0.22
Nodes (7): ReadinessCheck, ReadinessCheckSchema, ReadinessCheckStatusSchema, ReadinessResponse, ReadinessResponseSchema, RebuildReadinessResponse, RebuildReadinessResponseSchema

### Community 200 - "Community 200"
Cohesion: 0.22
Nodes (9): assertLocalRebuildGuard(), assertLocalDevelopmentDatabase(), bootstrapAuthoritativeInventoryDevelopment(), buildBootstrapPlan(), LOCAL_HOSTS, main(), optionalUuid(), parseBootstrapArgs() (+1 more)

### Community 201 - "Community 201"
Cohesion: 0.31
Nodes (9): addExactHeaderEvidence(), asRecord(), CONVERSION_COUNT_HEADERS, normalizeHeader(), parseObservedCount(), recoverObservedCampaignTargetConversions(), resolveRevenueShapedCampaignTargetConversion(), roundedNumber() (+1 more)

### Community 202 - "Community 202"
Cohesion: 0.46
Nodes (6): analyzeInventory(), listTopLevelScriptFiles(), main(), repoRoot(), SCRIPT_INVENTORY, SUPPORT_FILES

### Community 203 - "Community 203"
Cohesion: 0.25
Nodes (4): repoRoot, scriptPath, supportedExtensions, temporaryDirectories

### Community 204 - "Community 204"
Cohesion: 0.29
Nodes (6): CurrentOrganization, CurrentUser, Param, Post, UploadedFile, UseInterceptors

### Community 205 - "Community 205"
Cohesion: 0.29
Nodes (5): deletedLegacyTables, repoRoot, retiredBaselineScript, retiredImporterFile, retiredPlannerFile

### Community 206 - "Community 206"
Cohesion: 0.33
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 207 - "Community 207"
Cohesion: 0.40
Nodes (5): asRecord(), buildCampaignQualifiedProductTargetKeys(), cleanString(), rawCampaignAnchor(), rawProductAnchor()

### Community 210 - "Community 210"
Cohesion: 0.50
Nodes (4): is_allowlisted(), is_comment_line(), load_file_lines(), check-tenant-scope.sh script

### Community 211 - "Community 211"
Cohesion: 0.50
Nodes (4): extractEnvKeys(), readModelFile(), redactEnvText(), redactEnvValues()

### Community 212 - "Community 212"
Cohesion: 0.67
Nodes (4): canonicalComponents(), recipeKey(), resolveArtifactRecipes(), sameComponents()

### Community 213 - "Community 213"
Cohesion: 1.00
Nodes (3): makeRepository(), runRecord(), runWithChunks()

### Community 214 - "Community 214"
Cohesion: 0.67
Nodes (3): accountIdFor(), seedOrderInline(), seedReturnInline()

## Knowledge Gaps
- **3064 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+3059 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Core schema` to `prisma field: prisma — Shared Schema`, `prisma field: externalOptionId canonical option identity`, `Community 3`, `Core schema`, `Core schema`, `prisma field: channels — Marketplace Sync + SKU Matching`, `prisma field: vendorItemId provider term`, `AI schema`, `Community 10`, `prisma field: CandidateImage.isDeleted`, `Core schema`, `Orders schema`, `Channels schema`, `Core schema`, `AI schema`, `Community 20`, `prisma field: ActionTask.targetId`, `Community 23`, `Community 24`, `Community 26`, `AI schema`, `AI schema`, `Orders schema`, `Supply schema`, `AgentOS schema`, `Core schema`, `Inventory schema`, `Orders schema`, `AgentOS schema`, `Advertising schema`, `Sourcing schema`, `Supply schema`, `Channels schema`, `Inventory schema`, `AI schema`, `Community 51`, `AI schema`, `Sourcing schema`, `Core schema`, `Sourcing schema`, `System schema`, `AI schema`, `Sourcing schema`, `AgentOS schema`, `AgentOS schema`, `Community 66`, `AI schema`, `Supply schema`, `Channels schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Channels schema`, `AgentOS schema`, `System schema`, `AgentOS schema`, `Channels schema`, `Community 82`, `Orders schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Community 92`, `Channels schema`, `Channels schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `System schema`, `Advertising schema`, `Orders schema`, `Channels schema`, `Supply schema`, `Sourcing schema`, `AgentOS schema`, `AI schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Core schema`, `Orders schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `Finance schema`, `Sourcing schema`, `Orders schema`, `Channels schema`, `Inventory schema`, `AgentOS schema`, `AI schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `Inventory schema`, `Core schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Supply schema`, `Orders schema`, `Finance schema`, `Orders schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Supply schema`, `Inventory schema`, `Community 170`, `System schema`, `Channels schema`, `Finance schema`, `Core schema`, `Orders schema`, `Channels schema`, `Inventory schema`, `Supply schema`, `Channels schema`, `Core schema`, `Supply schema`, `System schema`, `Core schema`, `System schema`, `Channels schema`, `Advertising schema`?**
  _High betweenness centrality (0.212) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `prisma field: vendorItemId provider term` to `prisma field: prisma — Shared Schema`, `prisma field: externalOptionId canonical option identity`, `Core schema`, `Core schema`, `prisma field: channels — Marketplace Sync + SKU Matching`, `AI schema`, `prisma field: CandidateImage.isDeleted`, `Core schema`, `Core schema`, `Orders schema`, `Channels schema`, `Core schema`, `AI schema`, `prisma field: ActionTask.targetId`, `System schema`, `AI schema`, `AI schema`, `Orders schema`, `Supply schema`, `AgentOS schema`, `Core schema`, `Inventory schema`, `Orders schema`, `AgentOS schema`, `Advertising schema`, `Sourcing schema`, `Supply schema`, `Channels schema`, `Inventory schema`, `AI schema`, `AI schema`, `Sourcing schema`, `Core schema`, `Sourcing schema`, `System schema`, `AI schema`, `Sourcing schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Supply schema`, `Channels schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Channels schema`, `AgentOS schema`, `System schema`, `AgentOS schema`, `Channels schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Channels schema`, `Channels schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `System schema`, `Advertising schema`, `Orders schema`, `Channels schema`, `Supply schema`, `Sourcing schema`, `AgentOS schema`, `AI schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Core schema`, `Orders schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `Finance schema`, `Sourcing schema`, `Orders schema`, `Channels schema`, `Inventory schema`, `AgentOS schema`, `AI schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `Inventory schema`, `Core schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Supply schema`, `Orders schema`, `Finance schema`, `Orders schema`, `System schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Supply schema`, `Inventory schema`, `System schema`, `Channels schema`, `Finance schema`, `Core schema`, `Orders schema`, `Channels schema`, `Inventory schema`, `Supply schema`, `Channels schema`, `Core schema`, `System schema`, `Supply schema`, `System schema`, `Core schema`, `System schema`, `Channels schema`, `Core schema`, `Advertising schema`?**
  _High betweenness centrality (0.194) - this node is a cross-community bridge._
- **Why does `Order` connect `Orders schema` to `prisma field: prisma — Shared Schema`, `Community 1`, `prisma field: externalOptionId canonical option identity`, `Community 3`, `Core schema`, `Community 133`, `prisma field: channels — Marketplace Sync + SKU Matching`, `prisma field: vendorItemId provider term`, `AI schema`, `Community 9`, `Community 10`, `prisma field: CandidateImage.isDeleted`, `Core schema`, `Core schema`, `Community 19`, `Community 20`, `Community 21`, `prisma field: ActionTask.targetId`, `Community 24`, `System schema`, `Orders schema`, `Community 28`, `Community 30`, `Orders schema`, `Community 33`, `Inventory schema`, `Orders schema`, `Community 170`, `Community 43`, `Community 46`, `Supply schema`, `Community 51`, `Community 54`, `Core schema`, `Community 188`, `Community 62`, `Community 193`, `Community 66`, `Community 202`, `Channels schema`, `Community 78`, `Community 82`, `Community 86`, `Orders schema`, `Orders schema`, `Community 103`, `Orders schema`, `Orders schema`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **Are the 202 inferred relationships involving `Organization` (e.g. with `channel-registration-capability.adapter.spec.ts` and `channel-registration-capability.adapter.ts`) actually correct?**
  _`Organization` has 202 INFERRED edges - model-reasoned connections that need verification._
- **Are the 149 inferred relationships involving `ChannelAccount` (e.g. with `channel-registration-capability.adapter.spec.ts` and `channel-registration-capability.adapter.ts`) actually correct?**
  _`ChannelAccount` has 149 INFERRED edges - model-reasoned connections that need verification._
- **Are the 150 inferred relationships involving `Order` (e.g. with `channel-sync.controller.ts` and `dto/index.ts`) actually correct?**
  _`Order` has 150 INFERRED edges - model-reasoned connections that need verification._
- **Are the 109 inferred relationships involving `ChannelListing` (e.g. with `channel-registration-capability.adapter.ts` and `channel-listing.controller.ts`) actually correct?**
  _`ChannelListing` has 109 INFERRED edges - model-reasoned connections that need verification._