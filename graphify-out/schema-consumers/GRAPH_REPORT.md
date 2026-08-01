# Graph Report - schema-consumers  (2026-08-02)

## Corpus Check
- 442 files · ~232,729 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 6777 nodes · 40314 edges · 233 communities (215 shown, 18 thin omitted)
- Extraction: 30% EXTRACTED · 70% INFERRED · 0% AMBIGUOUS · INFERRED: 28196 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- prisma field: externalOptionId canonical option identity
- Community 1
- Community 2
- prisma field: CategoryMapping.isActive
- AgentOS schema
- Community 5
- Community 6
- Community 7
- Core schema
- Orders schema
- Advertising schema
- Community 11
- Community 12
- Orders schema
- Community 14
- AI schema
- System schema
- AI schema
- provider term: vendorItemId provider term
- AI schema
- Core schema
- Channels schema
- Community 22
- prisma field: channels — Marketplace Sync + SKU Matching
- AgentOS schema
- System schema
- Community 26
- Core schema
- Community 28
- Community 29
- Core schema
- AI schema
- AI schema
- Community 33
- Community 34
- Core schema
- AI schema
- Core schema
- Orders schema
- AgentOS schema
- AgentOS schema
- Community 41
- Supply schema
- Community 43
- Community 44
- Community 45
- Community 46
- Orders schema
- AI schema
- Community 49
- Channels schema
- Community 51
- System schema
- Community 53
- Core schema
- AI schema
- Sourcing schema
- Channels schema
- Community 58
- Sourcing schema
- AI schema
- AgentOS schema
- Community 62
- Core schema
- Supply schema
- Community 65
- Channels schema
- Core schema
- Channels schema
- Community 69
- Inventory schema
- Community 71
- Community 72
- Channels schema
- Community 74
- AgentOS schema
- AgentOS schema
- Community 77
- Community 78
- Community 79
- System schema
- Channels schema
- Channels schema
- Finance schema
- Community 84
- Community 85
- Community 86
- Community 87
- Inventory schema
- Orders schema
- Community 90
- Core schema
- Supply schema
- Orders schema
- Community 94
- Community 95
- Community 96
- Channels schema
- Community 98
- Community 99
- Channels schema
- Community 101
- Community 102
- Community 103
- AgentOS schema
- Channels schema
- Channels schema
- Supply schema
- Sourcing schema
- Community 109
- AgentOS schema
- AI schema
- System schema
- Sourcing schema
- Sourcing schema
- AI schema
- Community 116
- Community 117
- AgentOS schema
- Finance schema
- Inventory schema
- Sourcing schema
- AI schema
- Community 123
- Community 124
- Orders schema
- Supply schema
- Community 127
- Community 128
- Community 129
- Community 130
- Community 131
- Community 132
- Sourcing schema
- Sourcing schema
- System schema
- Channels schema
- Inventory schema
- AI schema
- Community 139
- Community 140
- Community 141
- Community 142
- AgentOS schema
- Inventory schema
- Community 145
- Community 146
- Channels schema
- Inventory schema
- Supply schema
- Inventory schema
- Supply schema
- Community 152
- Finance schema
- Orders schema
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
- Community 165
- Community 166
- Community 167
- System schema
- Community 169
- Channels schema
- Supply schema
- Channels schema
- Core schema
- Channels schema
- Community 175
- Community 176
- Inventory schema
- Inventory schema
- System schema
- Supply schema
- Community 181
- Sourcing schema
- System schema
- Core schema
- Sourcing schema
- Community 186
- Community 187
- Community 188
- Community 189
- Community 190
- System schema
- Community 192
- Community 193
- Community 194
- Channels schema
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
4. `ChannelListing` - 198 edges
5. `Order` - 198 edges
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
- `Database ERD` --mentions_domain--> `Advertising`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_model--> `AdAction`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.organizationId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.listingId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.listingOptionId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_model--> `ScrapeTarget`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma

## Import Cycles
- None detected.

## Communities (233 total, 18 thin omitted)

### Community 0 - "prisma field: externalOptionId canonical option identity"
Cohesion: 0.11
Nodes (358): UploadedWorkbookFile, HEADERS, USER, CHANNEL_ACCOUNT_LIST_SELECT, chunkSelect, ErrorInput, LockedRun, OwnedRunInput (+350 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (173): ActionTask, ActionTaskExecuteResponse, ActionTaskList, ActionTaskListSchema, ActionTaskRelatedProduct, ActionTaskRelatedProductSchema, ActionTaskSchema, ActionTaskSourceAlert (+165 more)

### Community 2 - "Community 2"
Cohesion: 0.02
Nodes (101): AgentApprovalRequestSummary, AgentApprovalRequestSummarySchema, AgentApprovalStatus, AgentApprovalStatusSchema, AgentArtifactHandoffSummary, AgentArtifactHandoffSummarySchema, AgentArtifactStatus, AgentArtifactStatusSchema (+93 more)

### Community 3 - "prisma field: CategoryMapping.isActive"
Cohesion: 0.04
Nodes (74): CategoryMapping.isActive, ChannelListingOption.isActive, MasterProduct.isActive, Organization.isActive, ScrapeTarget.isActive, SellpiaInventorySku.isActive, WorkflowTemplate.isActive, ChannelSkuAvailabilityComponent (+66 more)

### Community 4 - "AgentOS schema"
Cohesion: 0.03
Nodes (79): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+71 more)

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (34): ChannelSyncController, Body, Controller, CurrentOrganization, CurrentUser, Get, Post, ChannelSyncRepositoryAdapter (+26 more)

### Community 6 - "Community 6"
Cohesion: 0.03
Nodes (75): AdMetricsDetail, AdMetricsDetailSchema, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary, DashboardAdSummarySchema (+67 more)

### Community 7 - "Community 7"
Cohesion: 0.03
Nodes (73): CreateMasterProductInput, CreateMasterProductInputSchema, CreateProductVariantFieldsSchema, CreateProductVariantInput, CreateProductVariantInputSchema, CreateProductVariantRecipeIfEmptySchema, CreateProductVariantRecipesIfEmptyInput, CreateProductVariantRecipesIfEmptyInputSchema (+65 more)

### Community 8 - "Core schema"
Cohesion: 0.05
Nodes (40): Organization.createdAt, Organization.id, Organization.name, Organization.slug, Organization.updatedAt, Organization, DATA_MIGRATION_RELEASES, DataMigration (+32 more)

### Community 9 - "Orders schema"
Cohesion: 0.03
Nodes (59): CHANNELS_ROOT, REPO_ROOT, CSRecord.orderId, Order.channelAccount, Order.channelAccountId, Order.createdAt, Order.customerName, Order.deliveredAt (+51 more)

### Community 10 - "Advertising schema"
Cohesion: 0.03
Nodes (73): Advertising, AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson (+65 more)

### Community 11 - "Community 11"
Cohesion: 0.03
Nodes (65): importResponse(), deriveSellpiaInventoryFreshness(), FixedSellpiaAccountKeySchema, FixedSellpiaOriginSchema, IsoDateTimeStringSchema, SELLPIA_INVENTORY_COLLECTION_FAILURE_CODES, SELLPIA_INVENTORY_FRESHNESS_STATUSES, SELLPIA_INVENTORY_REFRESH_REASONS (+57 more)

### Community 12 - "Community 12"
Cohesion: 0.07
Nodes (68): option(), AdapterCommand, appendFlag(), appendOption(), appendProjectReferenceDefaults(), archiveFileName(), archiveShaFileName(), Args (+60 more)

### Community 13 - "Orders schema"
Cohesion: 0.04
Nodes (67): Orders, OrderLineItem.createdAt, OrderLineItem.externalBarcode, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.listingOptionId, OrderLineItem.metadata (+59 more)

### Community 14 - "Community 14"
Cohesion: 0.04
Nodes (48): ChannelCatalogImportController, Controller, Inject, ChannelSkuAvailabilityController, Controller, ChannelRecipeAutomationContextRepositoryAdapter, recipeSource(), Injectable (+40 more)

### Community 15 - "AI schema"
Cohesion: 0.04
Nodes (63): ContentAsset.originGenerationGroupId, ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.editedHtmlSavedAt (+55 more)

### Community 16 - "System schema"
Cohesion: 0.05
Nodes (55): Database ERD, ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.date, ActionTask.detail (+47 more)

### Community 17 - "AI schema"
Cohesion: 0.04
Nodes (61): CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id, CandidateImage.isDeleted (+53 more)

### Community 18 - "provider term: vendorItemId provider term"
Cohesion: 0.04
Nodes (55): vendorItemId provider term, ChunkRequestBaseSchema, COUPANG_CATALOG_BROWSER_FILE_NAME, COUPANG_CATALOG_COLLECTOR_VERSION, COUPANG_CATALOG_MAX_CHUNK_BYTES, COUPANG_CATALOG_MAX_MEDIA_PER_OWNER, COUPANG_CATALOG_MAX_OPTIONS_PER_PRODUCT, COUPANG_CATALOG_MAX_PRODUCT_BYTES (+47 more)

### Community 19 - "AI schema"
Cohesion: 0.04
Nodes (57): packages/shared — @kiditem/shared, AI, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.createdAt, ThumbnailGeneration.deletedAt, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.errorMessage (+49 more)

### Community 20 - "Core schema"
Cohesion: 0.04
Nodes (57): ChannelListing.brand, ChannelListing.category, ChannelListing.channelAccount, ChannelListing.channelAccountId, ChannelListing.channelName, ChannelListing.createdAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo (+49 more)

### Community 21 - "Channels schema"
Cohesion: 0.04
Nodes (55): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+47 more)

### Community 22 - "Community 22"
Cohesion: 0.07
Nodes (50): databaseUrl(), bool(), value(), APPLY_STORAGE_CACHE_CONTROL_CONFIRMATION, applyCacheControl(), ApplyResult, applyS3CacheControl(), applySupabaseCacheControl() (+42 more)

### Community 23 - "prisma field: channels — Marketplace Sync + SKU Matching"
Cohesion: 0.08
Nodes (32): MAX_COUPANG_WING_IMPORT_ROWS, PARENT_COLUMN_INDEXES, REQUIRED_HEADERS, workbookBuffer(), WorkbookOptions, ChannelProductCandidate, ChannelProductCandidateRankingInput, emptyEvidence() (+24 more)

### Community 24 - "AgentOS schema"
Cohesion: 0.04
Nodes (54): AgentOS, AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.agentInstanceId, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy (+46 more)

### Community 25 - "System schema"
Cohesion: 0.04
Nodes (48): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon, Marketplace.id (+40 more)

### Community 26 - "Community 26"
Cohesion: 0.09
Nodes (52): assertNoLocalAuthSecrets(), assertNonProductionTarget(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged(), assertSha256(), BaselineManifest, BaselineManifestExpectation, baselineObjectKeys (+44 more)

### Community 27 - "Core schema"
Cohesion: 0.04
Nodes (47): Core, AuthSession.createdAt, AuthSession.expiresAt, AuthSession.id, AuthSession.revokedAt, AuthSession.tokenHash, AuthSession.user, AuthSession.userId (+39 more)

### Community 28 - "Community 28"
Cohesion: 0.09
Nodes (51): DATA_MIGRATION_IDS, dataMigrations, DataMigrationContext, DataMigrationTarget, MigrationResult, APPLY_DATA_MIGRATIONS_CONFIRMATION, appReleaseVersion(), assertApplyDataMigrationsConfirmation() (+43 more)

### Community 29 - "Community 29"
Cohesion: 0.09
Nodes (47): apiHeaders(), apiUrl(), Args, assertSafeDatasetId(), assertSupportedReplayPayloads(), BundleManifest, BundlePayload, BundleReference (+39 more)

### Community 30 - "Core schema"
Cohesion: 0.05
Nodes (48): ChannelRecipeAutomationProductTopology, classifyRecipeAutomationProductGroups(), groupDecision(), autoItem, configuredItem, quantityReviewItem, reviewItem, ChannelListing.masterProductId (+40 more)

### Community 31 - "AI schema"
Cohesion: 0.05
Nodes (48): ContentGeneration.detailPageArtifactId, ContentWorkspace.currentDetailPageArtifactId, ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.contentWorkspaceId, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.createdByUserId (+40 more)

### Community 32 - "AI schema"
Cohesion: 0.04
Nodes (51): DetailPageImageArtifact.byteLength, DetailPageImageArtifact.contentType, DetailPageImageArtifact.createdAt, DetailPageImageArtifact.createdBy, DetailPageImageArtifact.createdByUserId, DetailPageImageArtifact.id, DetailPageImageArtifact.imageUrl, DetailPageImageArtifact.objectKey (+43 more)

### Community 33 - "Community 33"
Cohesion: 0.04
Nodes (49): boundedText(), isoDay, isRocketWorkbookBlockingReason(), requiredText(), ROCKET_PO_ROW_LIMIT, ROCKET_SAVED_PO_RESPONSE_PROFILE, ROCKET_SHORTAGE_REASONS, ROCKET_WORKBOOK_BLOCKING_REASONS (+41 more)

### Community 34 - "Community 34"
Cohesion: 0.06
Nodes (25): ChannelRegistrationCapabilityAdapter, toSellpiaMatch(), Injectable, ChannelsMarketplaceRegistrationCapabilityPort, ExternalProductRegistrationMatchPreviewInput, ExternalProductRegistrationMatchPreviewResult, ExternalProductRegistrationPreflightInput, ExternalProductRegistrationPreflightResult (+17 more)

### Community 35 - "Core schema"
Cohesion: 0.05
Nodes (48): MasterProductAbcEvaluation.formulaVersionId, MasterProductAbcFormulaState.activatedAt, MasterProductAbcFormulaState.activeFormulaVersion, MasterProductAbcFormulaState.activeFormulaVersionId, MasterProductAbcFormulaState.createdAt, MasterProductAbcFormulaState.organization, MasterProductAbcFormulaState.revision, MasterProductAbcFormulaState.updatedAt (+40 more)

### Community 36 - "AI schema"
Cohesion: 0.05
Nodes (48): ContentGeneration.contentWorkspaceId, ContentWorkspace.channelListing, ContentWorkspace.channelListingId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.createdByUserId, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageRevision (+40 more)

### Community 37 - "Core schema"
Cohesion: 0.06
Nodes (40): automationReason(), ChannelRecipeAutomationService, countDecision(), emptyScopedResult(), proposalVersion(), toPreviewItem(), Injectable, ChannelAccount.channel (+32 more)

### Community 38 - "Orders schema"
Cohesion: 0.05
Nodes (42): ContentWorkspace.isDeleted, ProductPreparation.isDeleted, Review.content, Review.createdAt, Review.externalProductId, Review.externalReviewId, Review.id, Review.imageCount (+34 more)

### Community 39 - "AgentOS schema"
Cohesion: 0.05
Nodes (44): AgentInstance.adapterConfig, AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.icon, AgentInstance.id, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name (+36 more)

### Community 40 - "AgentOS schema"
Cohesion: 0.05
Nodes (42): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+34 more)

### Community 41 - "Community 41"
Cohesion: 0.05
Nodes (39): BrowserOperationClaim, BrowserOperationClaimRequest, BrowserOperationClaimRequestSchema, BrowserOperationClaimSchema, BrowserOperationHeartbeatRequest, BrowserOperationHeartbeatRequestSchema, BrowserOperationReportRequest, BrowserOperationReportRequestSchema (+31 more)

### Community 42 - "Supply schema"
Cohesion: 0.06
Nodes (38): ProcessingCost.masterId, PurchaseOrder.supplierId, Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.id, Supplier.leadTimeDays (+30 more)

### Community 43 - "Community 43"
Cohesion: 0.09
Nodes (36): CurrentOrganization, CurrentUser, Param, Post, buildCoupangWingSnapshotCoverage(), CoupangWingSnapshotCoverage, cellText(), collectParentMetadataConflicts() (+28 more)

### Community 44 - "Community 44"
Cohesion: 0.10
Nodes (22): ChannelProductMatchingController, Body, Controller, CurrentOrganization, Get, Param, Post, Put (+14 more)

### Community 45 - "Community 45"
Cohesion: 0.05
Nodes (38): CalendarDateSchema, ChecksumSchema, FiniteNumberSchema, NullableMetricSchema, ProductAbcAdvertisingSourceStatus, ProductAbcAdvertisingSourceStatusSchema, ProductAbcCalculationStatus, ProductAbcCalculationStatusSchema (+30 more)

### Community 46 - "Community 46"
Cohesion: 0.06
Nodes (33): ChannelMatchCandidateReason, ChannelMatchCandidateReasonSchema, ChannelMatchEvidence, ChannelMatchEvidenceSchema, ChannelMatchingAccount, ChannelMatchingAccountSchema, ChannelOptionMatchingQueueRow, ChannelOptionMatchingQueueRowSchema (+25 more)

### Community 47 - "Orders schema"
Cohesion: 0.06
Nodes (39): OrderReturn.channelAccount, OrderReturn.channelAccountId, OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.id (+31 more)

### Community 48 - "AI schema"
Cohesion: 0.06
Nodes (39): ProductPreparation.approvedAt, ProductPreparation.approvedByUser, ProductPreparation.channelAccount, ProductPreparation.channelAccountId, ProductPreparation.channelListing, ProductPreparation.createdAt, ProductPreparation.createdByUser, ProductPreparation.deletedAt (+31 more)

### Community 49 - "Community 49"
Cohesion: 0.05
Nodes (38): ACCOUNT_AD_DAILY_DIGEST_KEYS, AD_ROW_KEYS, AD_SUMMARY_KEYS, ADS_DAILY_ROW_KEYS, ADS_KPI_KEYS, assertExactCount(), assertReadyCounts(), BootstrapPreflightManifest (+30 more)

### Community 50 - "Channels schema"
Cohesion: 0.06
Nodes (38): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignIdentity, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel (+30 more)

### Community 51 - "Community 51"
Cohesion: 0.08
Nodes (26): aggregateMappingStatus(), assertLockedListing(), assertOperationActor(), ChannelListingRepositoryAdapter, contains(), firstPrice(), isUniqueViolation(), lockDeletionOperation() (+18 more)

### Community 52 - "System schema"
Cohesion: 0.06
Nodes (37): OperationRun.attempts, OperationRun.attemptToken, OperationRun.claimedAt, OperationRun.claimedBy, OperationRun.createdAt, OperationRun.definitionVersion, OperationRun.engineType, OperationRun.errorCode (+29 more)

### Community 53 - "Community 53"
Cohesion: 0.09
Nodes (34): item(), automaticReason(), automaticStatus(), BarcodeEvidence, bestSimilarityPerSku(), ChannelRecipeAutomationDecision, ChannelRecipeSuggestionEvidenceKind, ChannelRecipeSuggestionInput (+26 more)

### Community 54 - "Core schema"
Cohesion: 0.07
Nodes (36): ChannelListing.lastImportRunId, ChannelListingOption.lastImportRunId, Order.sourceImportRunId, SellpiaInventorySku.lastImportRunId, SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.createdAt (+28 more)

### Community 55 - "AI schema"
Cohesion: 0.07
Nodes (36): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height (+28 more)

### Community 56 - "Sourcing schema"
Cohesion: 0.07
Nodes (34): ContentGeneration.sourceCandidateId, SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.id, SourcingCandidate.imageUrl (+26 more)

### Community 57 - "Channels schema"
Cohesion: 0.07
Nodes (36): CoupangWingTrackedProduct.brandName, CoupangWingTrackedProduct.categoryHierarchy, CoupangWingTrackedProduct.createdAt, CoupangWingTrackedProduct.enabled, CoupangWingTrackedProduct.id, CoupangWingTrackedProduct.imagePath, CoupangWingTrackedProduct.itemId, CoupangWingTrackedProduct.lastCapturedAt (+28 more)

### Community 58 - "Community 58"
Cohesion: 0.08
Nodes (33): ClientRenderArtifactSchema, ClientRenderContentTypeSchema, ClientRenderDateSchema, ClientRenderOutputWidthSchema, ClientRenderUuidSchema, ClientRenderVariantSchema, DETAIL_IMAGE_COUNTS, DETAIL_PAGE_AGE_GROUPS (+25 more)

### Community 59 - "Sourcing schema"
Cohesion: 0.07
Nodes (35): ProductRegistrationExecution.channelAccount, ProductRegistrationExecution.channelAccountId, ProductRegistrationExecution.channelListing, ProductRegistrationExecution.channelListingId, ProductRegistrationExecution.completedAt, ProductRegistrationExecution.createdAt, ProductRegistrationExecution.executionKind, ProductRegistrationExecution.expectedProviderAccountId (+27 more)

### Community 60 - "AI schema"
Cohesion: 0.07
Nodes (30): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt (+22 more)

### Community 61 - "AgentOS schema"
Cohesion: 0.06
Nodes (32): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.startedAt, WorkflowRun.status (+24 more)

### Community 62 - "Community 62"
Cohesion: 0.09
Nodes (26): CHANNEL_LISTING_SORTS, CHANNEL_LISTING_TABS, ChannelListingDeletionDto, ChannelListingDeletionUnresolvedDto, ChannelListingQueryDto, IsIn, IsOptional, IsString (+18 more)

### Community 63 - "Core schema"
Cohesion: 0.07
Nodes (32): MasterProductAbcEvaluation.adjustedScore, MasterProductAbcEvaluation.advertisingSourceCapturedAt, MasterProductAbcEvaluation.advertisingSourceStatus, MasterProductAbcEvaluation.calculatedAt, MasterProductAbcEvaluation.calculationStatus, MasterProductAbcEvaluation.costComponentsJson, MasterProductAbcEvaluation.firstValidPaidSaleAt, MasterProductAbcEvaluation.formulaVersion (+24 more)

### Community 64 - "Supply schema"
Cohesion: 0.07
Nodes (32): RocketPurchaseConfirmation.artifactBytes, RocketPurchaseConfirmation.artifactContentType, RocketPurchaseConfirmation.artifactFileName, RocketPurchaseConfirmation.artifactSha256, RocketPurchaseConfirmation.artifactStoredAt, RocketPurchaseConfirmation.channelAccount, RocketPurchaseConfirmation.channelAccountId, RocketPurchaseConfirmation.completedAt (+24 more)

### Community 65 - "Community 65"
Cohesion: 0.13
Nodes (27): distinct(), evidenceForCode(), evidenceForNames(), normalizePhysicalBarcode(), bigrams(), ChannelRecipeNameEvidence, ChannelRecipeNameIndex, ChannelRecipeNameOption (+19 more)

### Community 66 - "Channels schema"
Cohesion: 0.08
Nodes (31): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.channelAccount, ChannelScrapeRun.channelAccountId, ChannelScrapeRun.clientRunKey, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson (+23 more)

### Community 67 - "Core schema"
Cohesion: 0.08
Nodes (31): ProductVariantComponent.confirmedAt, ProductVariantComponent.confirmedBy, ProductVariantComponent.createdAt, ProductVariantComponent.id, ProductVariantComponent.organization, ProductVariantComponent.productVariant, ProductVariantComponent.productVariantId, ProductVariantComponent.quantity (+23 more)

### Community 68 - "Channels schema"
Cohesion: 0.07
Nodes (31): RocketPoCatalogLine.businessDateBasis, RocketPoCatalogLine.center, RocketPoCatalogLine.createdAt, RocketPoCatalogLine.hasConfirmation, RocketPoCatalogLine.id, RocketPoCatalogLine.inboundType, RocketPoCatalogLine.orderQty, RocketPoCatalogLine.organization (+23 more)

### Community 69 - "Community 69"
Cohesion: 0.09
Nodes (29): ChannelProductMatchingQueueResponseSchema, CreateProductVariantRecipesIfEmptyResponseSchema, PlanProductVariantRecipesIfEmptyResponseSchema, artifact(), ApiClient, assertPartition(), assertPrivateOutputPath(), assertTargetBaseUrl() (+21 more)

### Community 70 - "Inventory schema"
Cohesion: 0.07
Nodes (30): SellpiaInventoryState.activeGeneration, SellpiaInventoryState.activeSyncLeaseExpiresAt, SellpiaInventoryState.activeSyncOwner, SellpiaInventoryState.activeSyncOwnerUserId, SellpiaInventoryState.activeSyncScope, SellpiaInventoryState.activeSyncStartedAt, SellpiaInventoryState.activeSyncToken, SellpiaInventoryState.createdAt (+22 more)

### Community 71 - "Community 71"
Cohesion: 0.17
Nodes (30): assertProtectedApiDestination(), assertReplayCounts(), assertReplayFactDigest(), assertSharedDatabaseIdentity(), assertSharedRebuildGuard(), assertUuid(), bootstrap(), bootstrapPlanFromCli() (+22 more)

### Community 72 - "Community 72"
Cohesion: 0.14
Nodes (15): ChannelListingController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+7 more)

### Community 73 - "Channels schema"
Cohesion: 0.09
Nodes (23): CoupangRocketPurchaseOrderOperationHandler, Inject, Injectable, CHANNELS_OPERATIONS, CoupangRocketPurchaseOrderInputSchema, RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt (+15 more)

### Community 74 - "Community 74"
Cohesion: 0.10
Nodes (17): assertExactProductGraph(), MarketplaceRegistrationRepositoryAdapter, Injectable, upsertExactOptionLinks(), MarketplaceRegistrationRepositoryPort, Inject, Optional, asRecord() (+9 more)

### Community 75 - "AgentOS schema"
Cohesion: 0.07
Nodes (29): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.agentInstanceId, AgentApprovalRequest.approver, AgentApprovalRequest.approverUserId, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy (+21 more)

### Community 76 - "AgentOS schema"
Cohesion: 0.08
Nodes (29): AgentToolInvocation.agentInstance, AgentToolInvocation.agentInstanceId, AgentToolInvocation.approvalRequest, AgentToolInvocation.approvalRequestId, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt (+21 more)

### Community 77 - "Community 77"
Cohesion: 0.20
Nodes (24): Path, add_code_reference_edges(), add_document_mentions(), add_schema_graph(), camel(), collect_block(), collect_code(), collect_doc_comments() (+16 more)

### Community 78 - "Community 78"
Cohesion: 0.14
Nodes (27): asRecord(), CONVERSION_ORDER_HEADERS, CONVERSION_SALES_HEADERS, conversionRate(), CoupangAdsDailyCampaignEvidenceRun, CoupangAdsDailyCandidate, CoupangAdsDailyRawSnapshot, dailyRawMetricsMatch() (+19 more)

### Community 79 - "Community 79"
Cohesion: 0.11
Nodes (20): aiProductSuggestion(), aiVariantSuggestion(), asRecord(), availabilityListingWhere(), ChannelProductMatchingRepositoryAdapter, completedCatalogRunWhere(), componentSource(), distinctStrings() (+12 more)

### Community 80 - "System schema"
Cohesion: 0.08
Nodes (26): Alert.actionTask, Alert.actorUser, Alert.actorUserId, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead (+18 more)

### Community 81 - "Channels schema"
Cohesion: 0.08
Nodes (26): ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.id, ChannelScrapeSnapshot.listing, ChannelScrapeSnapshot.listingOption (+18 more)

### Community 82 - "Channels schema"
Cohesion: 0.08
Nodes (28): CoupangWingSalesRankDailySnapshot.businessDate, CoupangWingSalesRankDailySnapshot.capturedAt, CoupangWingSalesRankDailySnapshot.categoryHierarchy, CoupangWingSalesRankDailySnapshot.collectedCount, CoupangWingSalesRankDailySnapshot.conversionRate28d, CoupangWingSalesRankDailySnapshot.createdAt, CoupangWingSalesRankDailySnapshot.id, CoupangWingSalesRankDailySnapshot.itemId (+20 more)

### Community 83 - "Finance schema"
Cohesion: 0.08
Nodes (25): GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.listing, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization, GradeHistory.reason (+17 more)

### Community 84 - "Community 84"
Cohesion: 0.07
Nodes (26): ChannelSkuMappingComponent, ChannelSkuMappingComponentSchema, ChannelSkuMappingCounts, ChannelSkuMappingCountsSchema, ChannelSkuMappingListItem, ChannelSkuMappingListItemSchema, ChannelSkuMappingListResponse, ChannelSkuMappingListResponseSchema (+18 more)

### Community 85 - "Community 85"
Cohesion: 0.14
Nodes (27): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+19 more)

### Community 86 - "Community 86"
Cohesion: 0.08
Nodes (17): ChannelAccountController, Body, Controller, CurrentOrganization, Get, RocketAccountController, Controller, CurrentOrganization (+9 more)

### Community 87 - "Community 87"
Cohesion: 0.08
Nodes (10): checkedMatchedType(), SellpiaManualMatchRepositoryAdapter, toStatus(), Injectable, SellpiaRecipeEvidencePort, ChannelRecipeSuggestionContextRepositoryPort, SellpiaManualMatchAliasRecord, SellpiaManualMatchRepositoryPort (+2 more)

### Community 88 - "Inventory schema"
Cohesion: 0.09
Nodes (27): InventoryCommitment.businessKey, InventoryCommitment.createdAt, InventoryCommitment.createdBy, InventoryCommitment.creator, InventoryCommitment.id, InventoryCommitment.inventoryGeneration, InventoryCommitment.kind, InventoryCommitment.organization (+19 more)

### Community 89 - "Orders schema"
Cohesion: 0.09
Nodes (27): SellpiaOrderTransmissionIntent.abortedAt, SellpiaOrderTransmissionIntent.createdAt, SellpiaOrderTransmissionIntent.createdBy, SellpiaOrderTransmissionIntent.creator, SellpiaOrderTransmissionIntent.finalizedAt, SellpiaOrderTransmissionIntent.finalizedGeneration, SellpiaOrderTransmissionIntent.id, SellpiaOrderTransmissionIntent.intentKey (+19 more)

### Community 90 - "Community 90"
Cohesion: 0.14
Nodes (23): checkTrackedClaudeDirectory(), findClaudeShimFindings(), findInstructionChainSizeFindings(), findStaleInstructionLines(), git(), listRepositoryFiles(), listTracked(), main() (+15 more)

### Community 91 - "Core schema"
Cohesion: 0.08
Nodes (26): AdAction.listingOptionId, ChannelAdTargetDailySnapshot.listingOptionId, ChannelListingOption.attributesJson, ChannelListingOption.commissionRate, ChannelListingOption.costPriceOverride, ChannelListingOption.createdAt, ChannelListingOption.id, ChannelListingOption.itemName (+18 more)

### Community 92 - "Supply schema"
Cohesion: 0.08
Nodes (26): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+18 more)

### Community 93 - "Orders schema"
Cohesion: 0.09
Nodes (23): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+15 more)

### Community 94 - "Community 94"
Cohesion: 0.08
Nodes (23): StatisticsCategoryRow, StatisticsCategoryRowSchema, StatisticsDeliveryDaily, StatisticsDeliveryDailySchema, StatisticsDeliveryResponse, StatisticsDeliveryResponseSchema, StatisticsGradeRow, StatisticsGradeRowSchema (+15 more)

### Community 95 - "Community 95"
Cohesion: 0.09
Nodes (9): Inject, ChannelSkuAvailabilityPort, ChannelProductMatchingRepositoryPort, Inject, ChannelSkuAvailabilityService, matchesStatus(), toAvailabilityItem(), Inject (+1 more)

### Community 96 - "Community 96"
Cohesion: 0.13
Nodes (16): ChannelAccountRepositoryAdapter, envelopeToJson(), maskAccessKey(), readCredentialsConfig(), stripLegacyCredentialKeys(), toJsonRecord(), toRecord(), trimToOptional() (+8 more)

### Community 97 - "Channels schema"
Cohesion: 0.09
Nodes (25): ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isOfferWinner, ChannelListingOptionDailySnapshot.lastObservedAt, ChannelListingOptionDailySnapshot.listing (+17 more)

### Community 98 - "Community 98"
Cohesion: 0.08
Nodes (23): CoupangDirectCenter, CoupangDirectCenterSchema, CoupangDirectOrderCollectionRequest, CoupangDirectOrderCollectionRequestSchema, CoupangDirectOrderItem, CoupangDirectOrderItemSchema, CoupangDirectOrderStatus, CoupangDirectOrderStatusSchema (+15 more)

### Community 99 - "Community 99"
Cohesion: 0.16
Nodes (16): CoupangCredentials, coupangRequest(), CoupangRequestOptions, generateAuthorization(), approveReturn(), confirmOrderSheets(), DELIVERY_COMPANIES, getOrderSheets() (+8 more)

### Community 100 - "Channels schema"
Cohesion: 0.10
Nodes (24): SellpiaProductMonthlySales.buyPrice, SellpiaProductMonthlySales.capturedAt, SellpiaProductMonthlySales.costBasis, SellpiaProductMonthlySales.coverageEndDate, SellpiaProductMonthlySales.coverageStartDate, SellpiaProductMonthlySales.createdAt, SellpiaProductMonthlySales.id, SellpiaProductMonthlySales.inAmount (+16 more)

### Community 101 - "Community 101"
Cohesion: 0.09
Nodes (19): adapterPaths, BROWSER_COLLECTION_ATTENTION_REASONS, BROWSER_COLLECTION_PRODUCERS, BROWSER_COLLECTION_STATES, BrowserCollectionAttentionReasonSchema, BrowserCollectionClassificationSchema, BrowserCollectionCommand, BrowserCollectionCommandSchema (+11 more)

### Community 102 - "Community 102"
Cohesion: 0.22
Nodes (8): ChannelDashboardController, Controller, CurrentOrganization, Get, Query, CoupangDateRangeQueryDto, ChannelDashboardService, Injectable

### Community 103 - "Community 103"
Cohesion: 0.13
Nodes (22): assembleCompleteSnapshot(), assertSameManifest(), buildCollectionStatus(), countMedia(), countOptions(), derivePhase(), firstDate(), hashCatalogChunkPayload() (+14 more)

### Community 104 - "AgentOS schema"
Cohesion: 0.10
Nodes (22): AgentArtifact.agentInstance, AgentArtifact.agentInstanceId, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization (+14 more)

### Community 105 - "Channels schema"
Cohesion: 0.11
Nodes (22): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.channelAccount, ChannelAccountDailyKpiSnapshot.channelAccountId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+14 more)

### Community 106 - "Channels schema"
Cohesion: 0.11
Nodes (22): CoupangKeywordRankDailySnapshot.adRank, CoupangKeywordRankDailySnapshot.businessDate, CoupangKeywordRankDailySnapshot.capturedAt, CoupangKeywordRankDailySnapshot.createdAt, CoupangKeywordRankDailySnapshot.id, CoupangKeywordRankDailySnapshot.itemId, CoupangKeywordRankDailySnapshot.keyword, CoupangKeywordRankDailySnapshot.organicRank (+14 more)

### Community 107 - "Supply schema"
Cohesion: 0.11
Nodes (22): RocketPurchaseConfirmationLine.channelListingOption, RocketPurchaseConfirmationLine.channelListingOptionId, RocketPurchaseConfirmationLine.collectedAt, RocketPurchaseConfirmationLine.collectedOrderLineItemId, RocketPurchaseConfirmationLine.confirmation, RocketPurchaseConfirmationLine.confirmationId, RocketPurchaseConfirmationLine.confirmedQuantity, RocketPurchaseConfirmationLine.createdAt (+14 more)

### Community 108 - "Sourcing schema"
Cohesion: 0.11
Nodes (22): TiktokCreativeTrendDailySnapshot.businessDate, TiktokCreativeTrendDailySnapshot.capturedAt, TiktokCreativeTrendDailySnapshot.createdAt, TiktokCreativeTrendDailySnapshot.entityKey, TiktokCreativeTrendDailySnapshot.growthPct, TiktokCreativeTrendDailySnapshot.id, TiktokCreativeTrendDailySnapshot.industry, TiktokCreativeTrendDailySnapshot.label (+14 more)

### Community 109 - "Community 109"
Cohesion: 0.14
Nodes (10): assertCanonicalCoupangAccountIdentity(), canonicalParentRows(), ChannelCatalogImportRepositoryAdapter, isUniqueConstraintError(), nextPublicationSequence(), Injectable, zeroChanges(), ChannelCatalogImportClaim (+2 more)

### Community 110 - "AgentOS schema"
Cohesion: 0.10
Nodes (21): AgentCostEvent.agentInstance, AgentCostEvent.agentInstanceId, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id (+13 more)

### Community 111 - "AI schema"
Cohesion: 0.11
Nodes (21): AiDirectJob.attempts, AiDirectJob.claimedAt, AiDirectJob.claimedBy, AiDirectJob.createdAt, AiDirectJob.finishedAt, AiDirectJob.id, AiDirectJob.jobType, AiDirectJob.lastErrorCode (+13 more)

### Community 112 - "System schema"
Cohesion: 0.10
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+13 more)

### Community 113 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): LiveCommerceBroadcastDailySnapshot.broadcasterId, LiveCommerceBroadcastDailySnapshot.broadcasterName, LiveCommerceBroadcastDailySnapshot.broadcastId, LiveCommerceBroadcastDailySnapshot.businessDate, LiveCommerceBroadcastDailySnapshot.capturedAt, LiveCommerceBroadcastDailySnapshot.coverImageUrl, LiveCommerceBroadcastDailySnapshot.createdAt, LiveCommerceBroadcastDailySnapshot.endedAt (+13 more)

### Community 114 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): ShortsTrendDailySnapshot.businessDate, ShortsTrendDailySnapshot.capturedAt, ShortsTrendDailySnapshot.channelName, ShortsTrendDailySnapshot.commentCount, ShortsTrendDailySnapshot.createdAt, ShortsTrendDailySnapshot.id, ShortsTrendDailySnapshot.keyword, ShortsTrendDailySnapshot.likeCount (+13 more)

### Community 115 - "AI schema"
Cohesion: 0.10
Nodes (21): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.contentWorkspace, ThumbnailAnalysis.contentWorkspaceId, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id (+13 more)

### Community 116 - "Community 116"
Cohesion: 0.18
Nodes (21): assertBootstrapPreflightManifest(), assertIsoTimestamp(), assertPositiveIntegerText(), assertPostgresUuid(), assertStagingAccountBaselineManifest(), assertUnique(), buildBootstrapPreflightManifest(), buildChannelAccountFingerprint() (+13 more)

### Community 117 - "Community 117"
Cohesion: 0.10
Nodes (7): ChannelsDeletionPasswordAdapter, Injectable, ChannelsDeletionPasswordPort, ChannelListingRepositoryPort, Inject, Optional, Inject

### Community 118 - "AgentOS schema"
Cohesion: 0.12
Nodes (20): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.agentInstanceId, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError (+12 more)

### Community 119 - "Finance schema"
Cohesion: 0.12
Nodes (20): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit (+12 more)

### Community 120 - "Inventory schema"
Cohesion: 0.11
Nodes (20): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.notes, ReturnTransfer.optionName, ReturnTransfer.orderId (+12 more)

### Community 121 - "Sourcing schema"
Cohesion: 0.12
Nodes (20): Sourcing1688HotProductDailySnapshot.businessDate, Sourcing1688HotProductDailySnapshot.capturedAt, Sourcing1688HotProductDailySnapshot.createdAt, Sourcing1688HotProductDailySnapshot.id, Sourcing1688HotProductDailySnapshot.imageUrl, Sourcing1688HotProductDailySnapshot.monthlySales, Sourcing1688HotProductDailySnapshot.offerId, Sourcing1688HotProductDailySnapshot.organization (+12 more)

### Community 122 - "AI schema"
Cohesion: 0.11
Nodes (20): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+12 more)

### Community 123 - "Community 123"
Cohesion: 0.10
Nodes (16): ChannelAccountListItem, ChannelAccountListItemSchema, CoupangAccountSettings, CoupangAccountSettingsSchema, UpdateCoupangAccountSettings, ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow (+8 more)

### Community 124 - "Community 124"
Cohesion: 0.21
Nodes (18): analyzePrReleaseContract(), changedFilesFromGit(), classifyFiles(), compareSemver(), deletedFilesFromGit(), ghPrBody(), git(), hasReleaseDecision() (+10 more)

### Community 125 - "Orders schema"
Cohesion: 0.12
Nodes (19): CoupangDirectPoSnapshot.centerName, CoupangDirectPoSnapshot.channelAccountId, CoupangDirectPoSnapshot.collectedAt, CoupangDirectPoSnapshot.createdAt, CoupangDirectPoSnapshot.deliveryDate, CoupangDirectPoSnapshot.id, CoupangDirectPoSnapshot.isUrgent, CoupangDirectPoSnapshot.itemsJson (+11 more)

### Community 126 - "Supply schema"
Cohesion: 0.12
Nodes (19): PurchaseOrderSubmissionAttempt.createdAt, PurchaseOrderSubmissionAttempt.errorCode, PurchaseOrderSubmissionAttempt.errorMessage, PurchaseOrderSubmissionAttempt.freshnessGeneration, PurchaseOrderSubmissionAttempt.id, PurchaseOrderSubmissionAttempt.idempotencyKey, PurchaseOrderSubmissionAttempt.organization, PurchaseOrderSubmissionAttempt.providerReference (+11 more)

### Community 127 - "Community 127"
Cohesion: 0.15
Nodes (14): PRODUCT_LIFECYCLE_STATES, ProductLifecycleState, ProductLifecycleStateSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, MasterImageItem, MasterImageItemSchema, MasterImageRole (+6 more)

### Community 128 - "Community 128"
Cohesion: 0.19
Nodes (18): assertAllowedArguments(), assertPublishableMain(), copyLoadableExtension(), createArchive(), environmentProfiles, githubReleaseCommand(), gitOutput(), gitSha() (+10 more)

### Community 129 - "Community 129"
Cohesion: 0.12
Nodes (8): ChannelAccountListController, Controller, CurrentOrganization, Get, ChannelAccountRepositoryPort, ChannelAccountQueryService, Inject, Injectable

### Community 130 - "Community 130"
Cohesion: 0.11
Nodes (16): CurrentOrganization, Get, Query, AVAILABILITY_STATUSES, ChannelSkuAvailabilityQueryDto, IsIn, IsInt, IsOptional (+8 more)

### Community 131 - "Community 131"
Cohesion: 0.11
Nodes (8): CoupangProviderAdapter, Inject, Injectable, OrderSheetResponse, SellerProductDetailResponse, SellerProductExternalSkuResponse, SellerProductListResponse, CoupangCredentialsPort

### Community 132 - "Community 132"
Cohesion: 0.11
Nodes (4): ChannelDashboardRepositoryAdapter, Injectable, ChannelDashboardRepositoryPort, Inject

### Community 133 - "Sourcing schema"
Cohesion: 0.14
Nodes (18): LiveCommerceProductDailySnapshot.broadcastId, LiveCommerceProductDailySnapshot.businessDate, LiveCommerceProductDailySnapshot.capturedAt, LiveCommerceProductDailySnapshot.createdAt, LiveCommerceProductDailySnapshot.id, LiveCommerceProductDailySnapshot.imageUrl, LiveCommerceProductDailySnapshot.organization, LiveCommerceProductDailySnapshot.priceCny (+10 more)

### Community 134 - "Sourcing schema"
Cohesion: 0.13
Nodes (18): NaverKeywordDailySnapshot.averageAdRank, NaverKeywordDailySnapshot.businessDate, NaverKeywordDailySnapshot.capturedAt, NaverKeywordDailySnapshot.competitionIndex, NaverKeywordDailySnapshot.createdAt, NaverKeywordDailySnapshot.id, NaverKeywordDailySnapshot.keyword, NaverKeywordDailySnapshot.monthlyMobileSearchCount (+10 more)

### Community 135 - "System schema"
Cohesion: 0.12
Nodes (18): OperationRun.scheduleId, OperationSchedule.createdAt, OperationSchedule.createdBy, OperationSchedule.createdByUserId, OperationSchedule.cronExpression, OperationSchedule.enabled, OperationSchedule.id, OperationSchedule.input (+10 more)

### Community 136 - "Channels schema"
Cohesion: 0.14
Nodes (18): RocketPoCatalogSnapshot.channelAccount, RocketPoCatalogSnapshot.channelAccountId, RocketPoCatalogSnapshot.collectionRunId, RocketPoCatalogSnapshot.createdAt, RocketPoCatalogSnapshot.detailPoCount, RocketPoCatalogSnapshot.id, RocketPoCatalogSnapshot.listPagesRead, RocketPoCatalogSnapshot.organization (+10 more)

### Community 137 - "Inventory schema"
Cohesion: 0.13
Nodes (18): Shipment.warehouseId, StockTransfer.fromWarehouseId, StockTransfer.toWarehouseId, Warehouse.address, Warehouse.code, Warehouse.createdAt, Warehouse.id, Warehouse.isDefault (+10 more)

### Community 138 - "AI schema"
Cohesion: 0.13
Nodes (18): ThumbnailTrackingDailySnapshot.capturedAt, ThumbnailTrackingDailySnapshot.capturedDate, ThumbnailTrackingDailySnapshot.createdAt, ThumbnailTrackingDailySnapshot.errorMessage, ThumbnailTrackingDailySnapshot.id, ThumbnailTrackingDailySnapshot.organization, ThumbnailTrackingDailySnapshot.ratingAvg, ThumbnailTrackingDailySnapshot.rawCellTexts (+10 more)

### Community 139 - "Community 139"
Cohesion: 0.18
Nodes (8): ChannelCatalogCollectionRepositoryAdapter, isUniqueConstraintError(), ownedRunWhere(), Injectable, ChannelCatalogCollectionChunkRecord, ChannelCatalogCollectionRunRecord, ChannelCatalogCollectionWithChunks, startRun()

### Community 140 - "Community 140"
Cohesion: 0.13
Nodes (16): upsertChannelCatalogIdentities(), applyProductLinksInBatches(), applyVariantLinksInBatches(), buildCatalogProductProvisioningListings(), publishCatalogOperationalProducts(), unique(), validateProvisionedLinks(), flattenMedia() (+8 more)

### Community 141 - "Community 141"
Cohesion: 0.12
Nodes (7): ChannelCatalogPublicationRepositoryAdapter, Inject, Injectable, CatalogMediaPublicationPort, ChannelCatalogCollectionRepositoryPort, ChannelCatalogPublicationPort, Inject

### Community 142 - "Community 142"
Cohesion: 0.12
Nodes (10): day(), isoDay(), listSavedRocketPos(), loadSavedRocketCollection(), requiredSavedValue(), ROCKET_CONFIRMATION_REQUEST_STATUSES, toCatalogRow(), RocketPoCatalogIdentity (+2 more)

### Community 143 - "AgentOS schema"
Cohesion: 0.14
Nodes (17): AgentRunEvent.agentInstance, AgentRunEvent.agentInstanceId, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message (+9 more)

### Community 144 - "Inventory schema"
Cohesion: 0.12
Nodes (17): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.orderId, PickingItem.organization, PickingItem.pickedAt (+9 more)

### Community 145 - "Community 145"
Cohesion: 0.12
Nodes (13): MAX_SELLPIA_MANUAL_MATCH_ROWS, MAX_SELLPIA_MANUAL_MATCH_TARGETS, SellpiaManualMatchCodeSchema, SellpiaManualMatchCollectionFailureCode, SellpiaManualMatchCollectionFailureCodeSchema, SellpiaManualMatchImportResponse, SellpiaManualMatchRow, SellpiaManualMatchRowSchema (+5 more)

### Community 146 - "Community 146"
Cohesion: 0.23
Nodes (5): Inject, ChannelCatalogCollectionPort, ChannelCatalogCollectionService, parseRequest(), Injectable

### Community 147 - "Channels schema"
Cohesion: 0.16
Nodes (16): ChannelScrapeChunk.checksum, ChannelScrapeChunk.createdAt, ChannelScrapeChunk.id, ChannelScrapeChunk.itemCount, ChannelScrapeChunk.kind, ChannelScrapeChunk.organization, ChannelScrapeChunk.payload, ChannelScrapeChunk.publicationJson (+8 more)

### Community 148 - "Inventory schema"
Cohesion: 0.15
Nodes (16): PickingItem.pickingListId, PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.id, PickingList.listNumber, PickingList.organization, PickingList.pickedItems (+8 more)

### Community 149 - "Supply schema"
Cohesion: 0.16
Nodes (16): RocketPurchaseConfirmationTransmission.confirmation, RocketPurchaseConfirmationTransmission.confirmationId, RocketPurchaseConfirmationTransmission.createdAt, RocketPurchaseConfirmationTransmission.id, RocketPurchaseConfirmationTransmission.intentKey, RocketPurchaseConfirmationTransmission.matchedLineCount, RocketPurchaseConfirmationTransmission.observedAt, RocketPurchaseConfirmationTransmission.organization (+8 more)

### Community 150 - "Inventory schema"
Cohesion: 0.13
Nodes (16): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.id, StockTransfer.notes, StockTransfer.optionName, StockTransfer.organization, StockTransfer.quantity (+8 more)

### Community 151 - "Supply schema"
Cohesion: 0.13
Nodes (16): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.dueDate, SupplierPayment.id, SupplierPayment.notes, SupplierPayment.organization, SupplierPayment.paidAmount, SupplierPayment.paidDate (+8 more)

### Community 152 - "Community 152"
Cohesion: 0.28
Nodes (10): ChannelCatalogCollectionController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+2 more)

### Community 153 - "Finance schema"
Cohesion: 0.14
Nodes (15): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description (+7 more)

### Community 154 - "Orders schema"
Cohesion: 0.14
Nodes (15): CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing (+7 more)

### Community 155 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 156 - "Sourcing schema"
Cohesion: 0.17
Nodes (15): NaverPopularKeywordDailySnapshot.boardKey, NaverPopularKeywordDailySnapshot.boardLabel, NaverPopularKeywordDailySnapshot.businessDate, NaverPopularKeywordDailySnapshot.capturedAt, NaverPopularKeywordDailySnapshot.cid, NaverPopularKeywordDailySnapshot.createdAt, NaverPopularKeywordDailySnapshot.id, NaverPopularKeywordDailySnapshot.keyword (+7 more)

### Community 157 - "Finance schema"
Cohesion: 0.14
Nodes (15): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.id, ProcessingCost.master, ProcessingCost.notes, ProcessingCost.organization, ProcessingCost.processType, ProcessingCost.productName (+7 more)

### Community 158 - "Finance schema"
Cohesion: 0.15
Nodes (15): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.organization, SalesPlan.period (+7 more)

### Community 159 - "Channels schema"
Cohesion: 0.17
Nodes (15): SellpiaManualMatchAlias.aliasTitle, SellpiaManualMatchAlias.createdAt, SellpiaManualMatchAlias.evidenceCount, SellpiaManualMatchAlias.id, SellpiaManualMatchAlias.itemCount, SellpiaManualMatchAlias.matchedType, SellpiaManualMatchAlias.normalizedAlias, SellpiaManualMatchAlias.organization (+7 more)

### Community 160 - "Channels schema"
Cohesion: 0.15
Nodes (15): SellpiaManualMatchSnapshot.aliasCount, SellpiaManualMatchSnapshot.capturedAt, SellpiaManualMatchSnapshot.createdAt, SellpiaManualMatchSnapshot.id, SellpiaManualMatchSnapshot.matchedTargetCount, SellpiaManualMatchSnapshot.organization, SellpiaManualMatchSnapshot.schemaVersion, SellpiaManualMatchSnapshot.snapshotHash (+7 more)

### Community 161 - "Inventory schema"
Cohesion: 0.14
Nodes (15): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.sourceRef, SellpiaReceiptUploadBatch.sourceType (+7 more)

### Community 162 - "Channels schema"
Cohesion: 0.16
Nodes (15): SellpiaSalesDailySnapshot.businessDate, SellpiaSalesDailySnapshot.capturedAt, SellpiaSalesDailySnapshot.channelGroup, SellpiaSalesDailySnapshot.costKrw, SellpiaSalesDailySnapshot.createdAt, SellpiaSalesDailySnapshot.id, SellpiaSalesDailySnapshot.organization, SellpiaSalesDailySnapshot.qty (+7 more)

### Community 163 - "Inventory schema"
Cohesion: 0.15
Nodes (15): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items, StockAudit.matchedCount (+7 more)

### Community 164 - "Supply schema"
Cohesion: 0.16
Nodes (15): SupplierProduct.createdAt, SupplierProduct.id, SupplierProduct.isPrimary, SupplierProduct.memo, SupplierProduct.minOrderQty, SupplierProduct.organization, SupplierProduct.sellpiaInventorySku, SupplierProduct.sellpiaInventorySkuId (+7 more)

### Community 165 - "Community 165"
Cohesion: 0.19
Nodes (12): SELLPIA_WORKBOOK_ACCEPT, SELLPIA_WORKBOOK_FILE_EXTENSIONS, SELLPIA_WORKBOOK_FORMAT_LABEL, SellpiaReceiptBatchCreateInput, SellpiaReceiptBatchCreateInputSchema, SellpiaReceiptBatchMarkUploadedInput, SellpiaReceiptBatchMarkUploadedInputSchema, SellpiaReceiptUploadBatch (+4 more)

### Community 166 - "Community 166"
Cohesion: 0.15
Nodes (15): asRecord(), buildAdCampaignDailyRepairPlan(), buildTargetKey(), cleanString(), dateKey(), hasNonCampaignListingSignal(), hasOtherAdvertisingMeta(), maxDate() (+7 more)

### Community 167 - "Community 167"
Cohesion: 0.18
Nodes (12): assertActiveCoupangAccount(), assertCanonicalAccount(), completeCollectionRun(), completedCollectionResult(), jsonRecord(), lockAccount(), lockCollectionRun(), nextPublicationSequence() (+4 more)

### Community 168 - "System schema"
Cohesion: 0.15
Nodes (12): FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name, FeatureGate.updatedAt (+4 more)

### Community 169 - "Community 169"
Cohesion: 0.26
Nodes (14): asRecord(), assertNoPii(), boundedReplayScope(), buildReplayBody(), buildReplayKpis(), cloneReplayValue(), containsPiiValue(), copyString() (+6 more)

### Community 170 - "Channels schema"
Cohesion: 0.18
Nodes (13): Channels, CoupangKeywordTracker.createdAt, CoupangKeywordTracker.enabled, CoupangKeywordTracker.id, CoupangKeywordTracker.keyword, CoupangKeywordTracker.lastCapturedAt, CoupangKeywordTracker.maxPages, CoupangKeywordTracker.organization (+5 more)

### Community 171 - "Supply schema"
Cohesion: 0.19
Nodes (13): Supply, RocketPurchaseConfirmationAllocation.confirmationLine, RocketPurchaseConfirmationAllocation.confirmationLineId, RocketPurchaseConfirmationAllocation.createdAt, RocketPurchaseConfirmationAllocation.id, RocketPurchaseConfirmationAllocation.organization, RocketPurchaseConfirmationAllocation.quantity, RocketPurchaseConfirmationAllocation.sellpiaInventorySku (+5 more)

### Community 172 - "Channels schema"
Cohesion: 0.19
Nodes (13): CoupangKeywordSerpDailySnapshot.businessDate, CoupangKeywordSerpDailySnapshot.capturedAt, CoupangKeywordSerpDailySnapshot.createdAt, CoupangKeywordSerpDailySnapshot.id, CoupangKeywordSerpDailySnapshot.itemCount, CoupangKeywordSerpDailySnapshot.items, CoupangKeywordSerpDailySnapshot.keyword, CoupangKeywordSerpDailySnapshot.organization (+5 more)

### Community 173 - "Core schema"
Cohesion: 0.17
Nodes (13): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+5 more)

### Community 174 - "Channels schema"
Cohesion: 0.18
Nodes (13): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson, RocketSupplyDailySnapshot.revenueKrw (+5 more)

### Community 175 - "Community 175"
Cohesion: 0.29
Nodes (13): assertAllowedRecord(), assertAllowedRows(), assertAllowedScalarRecord(), assertObservedMetrics(), assertOptionalScalar(), assertPlainRecord(), assertReplayBundle(), assertReplayFactCounts() (+5 more)

### Community 176 - "Community 176"
Cohesion: 0.31
Nodes (11): analyzeSchemaArtifactSync(), changedFilesFromGit(), changedFilesFromWorkingTree(), GENERATED_ARTIFACT_PATHS, git(), main(), matchesAnyPath(), mergeChangedFiles() (+3 more)

### Community 177 - "Inventory schema"
Cohesion: 0.20
Nodes (12): Inventory, CoupangShipmentDateSummary.boxes, CoupangShipmentDateSummary.capturedAt, CoupangShipmentDateSummary.count, CoupangShipmentDateSummary.createdAt, CoupangShipmentDateSummary.id, CoupangShipmentDateSummary.organization, CoupangShipmentDateSummary.shipmentDate (+4 more)

### Community 178 - "Inventory schema"
Cohesion: 0.21
Nodes (12): InventoryCommitmentAllocation.commitment, InventoryCommitmentAllocation.commitmentId, InventoryCommitmentAllocation.createdAt, InventoryCommitmentAllocation.id, InventoryCommitmentAllocation.organization, InventoryCommitmentAllocation.quantity, InventoryCommitmentAllocation.sellpiaInventorySku, InventoryCommitmentAllocation.sellpiaInventorySkuId (+4 more)

### Community 179 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 180 - "Supply schema"
Cohesion: 0.18
Nodes (12): PurchaseOrderItem.createdAt, PurchaseOrderItem.id, PurchaseOrderItem.order, PurchaseOrderItem.orderId, PurchaseOrderItem.organization, PurchaseOrderItem.productName, PurchaseOrderItem.quantity, PurchaseOrderItem.sellpiaInventorySku (+4 more)

### Community 181 - "Community 181"
Cohesion: 0.33
Nodes (5): SellpiaRecipeEvidenceAdapter, toEvidenceSku(), Inject, Injectable, SellpiaRecipeEvidenceSku

### Community 182 - "Sourcing schema"
Cohesion: 0.24
Nodes (11): Sourcing, SourcingWorkspaceSnapshot.businessDate, SourcingWorkspaceSnapshot.createdAt, SourcingWorkspaceSnapshot.id, SourcingWorkspaceSnapshot.organization, SourcingWorkspaceSnapshot.payload, SourcingWorkspaceSnapshot.scope, SourcingWorkspaceSnapshot.updatedAt (+3 more)

### Community 183 - "System schema"
Cohesion: 0.20
Nodes (11): ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization, ActivityEvent.source (+3 more)

### Community 184 - "Core schema"
Cohesion: 0.22
Nodes (11): CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.keywords, CategoryMapping.organization, CategoryMapping.updatedAt (+3 more)

### Community 185 - "Sourcing schema"
Cohesion: 0.22
Nodes (11): TrendSeedKeyword.createdAt, TrendSeedKeyword.enabled, TrendSeedKeyword.id, TrendSeedKeyword.keyword, TrendSeedKeyword.keywordCn, TrendSeedKeyword.organization, TrendSeedKeyword.sources, TrendSeedKeyword.updatedAt (+3 more)

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
Cohesion: 0.35
Nodes (9): analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), directOutPortFiles(), FORBIDDEN_IN_PORT_FOLDER_NAMES, forbiddenInPortCallerFolders(), listDirectories(), listFiles(), main() (+1 more)

### Community 190 - "Community 190"
Cohesion: 0.27
Nodes (9): parseArgs(), parseArgs(), ParsedArgs, parseRawArgs(), ParseRawArgsOptions, pushValue(), values(), COMMANDS (+1 more)

### Community 191 - "System schema"
Cohesion: 0.24
Nodes (10): System, SystemSetting.createdAt, SystemSetting.id, SystemSetting.key, SystemSetting.organization, SystemSetting.updatedAt, SystemSetting.value, SystemSetting (+2 more)

### Community 192 - "Community 192"
Cohesion: 0.38
Nodes (8): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), main(), parseBaseline(), readFiles(), repoRoot(), walk()

### Community 193 - "Community 193"
Cohesion: 0.25
Nodes (5): ChannelsOperationAlertAdapter, Inject, Injectable, OperationLifecyclePatch, StartOperationAlertInput

### Community 194 - "Community 194"
Cohesion: 0.28
Nodes (6): manualMatchAliasCandidates(), aggregateRows(), sameStrings(), strongerMatchedType(), normalizeSellpiaManualMatchAlias(), SellpiaManualMatchImportResponseSchema

### Community 195 - "Channels schema"
Cohesion: 0.28
Nodes (9): CoupangRepresentativeKeywordOverride.createdAt, CoupangRepresentativeKeywordOverride.id, CoupangRepresentativeKeywordOverride.keyword, CoupangRepresentativeKeywordOverride.organization, CoupangRepresentativeKeywordOverride.updatedAt, CoupangRepresentativeKeywordOverride.vendorItemId, CoupangRepresentativeKeywordOverride, coupang_representative_keyword_overrides (+1 more)

### Community 196 - "Community 196"
Cohesion: 0.22
Nodes (7): ReadinessCheck, ReadinessCheckSchema, ReadinessCheckStatusSchema, ReadinessResponse, ReadinessResponseSchema, RebuildReadinessResponse, RebuildReadinessResponseSchema

### Community 197 - "Community 197"
Cohesion: 0.22
Nodes (9): assertLocalRebuildGuard(), assertLocalDevelopmentDatabase(), bootstrapAuthoritativeInventoryDevelopment(), buildBootstrapPlan(), LOCAL_HOSTS, main(), optionalUuid(), parseBootstrapArgs() (+1 more)

### Community 198 - "Community 198"
Cohesion: 0.31
Nodes (9): addExactHeaderEvidence(), asRecord(), CONVERSION_COUNT_HEADERS, normalizeHeader(), parseObservedCount(), recoverObservedCampaignTargetConversions(), resolveRevenueShapedCampaignTargetConversion(), roundedNumber() (+1 more)

### Community 199 - "Community 199"
Cohesion: 0.25
Nodes (6): extractFunction(), extractRetireFunction(), productionWrapper, remote, repoRoot, workflow

### Community 200 - "Community 200"
Cohesion: 0.46
Nodes (6): analyzeInventory(), listTopLevelScriptFiles(), main(), repoRoot(), SCRIPT_INVENTORY, SUPPORT_FILES

### Community 201 - "Community 201"
Cohesion: 0.25
Nodes (4): repoRoot, scriptPath, supportedExtensions, temporaryDirectories

### Community 202 - "Community 202"
Cohesion: 0.33
Nodes (5): RocketPoCatalogResolution, canonicalArtifactHash(), emptyRecipeAutomationResult(), isCompleteCollection(), RocketPurchasePreviewRequestSchema

### Community 203 - "Community 203"
Cohesion: 0.33
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 204 - "Community 204"
Cohesion: 0.40
Nodes (5): assertCurrentRebuildBinding(), assertRebuildImportPrerequisites(), assertStoredImportBinding(), bindRebuildImports(), readRebuildImportEvidence()

### Community 205 - "Community 205"
Cohesion: 0.40
Nodes (5): asRecord(), buildCampaignQualifiedProductTargetKeys(), cleanString(), rawCampaignAnchor(), rawProductAnchor()

### Community 206 - "Community 206"
Cohesion: 0.50
Nodes (4): fileHash(), importInput(), makeRow(), representativeRows()

### Community 209 - "Community 209"
Cohesion: 0.50
Nodes (4): is_allowlisted(), is_comment_line(), load_file_lines(), check-tenant-scope.sh script

### Community 210 - "Community 210"
Cohesion: 0.50
Nodes (4): extractEnvKeys(), readModelFile(), redactEnvText(), redactEnvValues()

### Community 211 - "Community 211"
Cohesion: 1.00
Nodes (3): makeRepository(), runRecord(), runWithChunks()

### Community 212 - "Community 212"
Cohesion: 0.67
Nodes (3): accountIdFor(), seedOrderInline(), seedReturnInline()

### Community 213 - "Community 213"
Cohesion: 0.67
Nodes (3): detailOk(), listOk(), mockProductDetail()

## Knowledge Gaps
- **3034 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+3029 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Core schema` to `prisma field: externalOptionId canonical option identity`, `Community 1`, `Community 2`, `prisma field: CategoryMapping.isActive`, `AgentOS schema`, `Community 6`, `Orders schema`, `Advertising schema`, `Community 12`, `Orders schema`, `Community 14`, `AI schema`, `System schema`, `AI schema`, `AI schema`, `Core schema`, `Channels schema`, `prisma field: channels — Marketplace Sync + SKU Matching`, `AgentOS schema`, `System schema`, `Community 26`, `Core schema`, `Community 29`, `Core schema`, `AI schema`, `AI schema`, `Core schema`, `AI schema`, `Core schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `Supply schema`, `Orders schema`, `AI schema`, `Community 49`, `Channels schema`, `System schema`, `Core schema`, `AI schema`, `Sourcing schema`, `Channels schema`, `Sourcing schema`, `AI schema`, `Core schema`, `Supply schema`, `Channels schema`, `Core schema`, `Channels schema`, `Inventory schema`, `Channels schema`, `AgentOS schema`, `AgentOS schema`, `Community 77`, `Community 78`, `System schema`, `Channels schema`, `Channels schema`, `Finance schema`, `Community 86`, `Inventory schema`, `Orders schema`, `Core schema`, `Supply schema`, `Orders schema`, `Channels schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Supply schema`, `Sourcing schema`, `AgentOS schema`, `AI schema`, `System schema`, `Sourcing schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `Finance schema`, `Inventory schema`, `Sourcing schema`, `AI schema`, `Orders schema`, `Supply schema`, `Sourcing schema`, `Sourcing schema`, `System schema`, `Channels schema`, `Inventory schema`, `AI schema`, `AgentOS schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Supply schema`, `Inventory schema`, `Supply schema`, `Finance schema`, `Orders schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Supply schema`, `System schema`, `Channels schema`, `Supply schema`, `Channels schema`, `Core schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Sourcing schema`, `System schema`, `Core schema`, `Sourcing schema`, `System schema`, `Channels schema`?**
  _High betweenness centrality (0.201) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `System schema` to `prisma field: externalOptionId canonical option identity`, `prisma field: CategoryMapping.isActive`, `AgentOS schema`, `Core schema`, `Orders schema`, `Advertising schema`, `Orders schema`, `AI schema`, `AI schema`, `AI schema`, `Core schema`, `Channels schema`, `prisma field: channels — Marketplace Sync + SKU Matching`, `AgentOS schema`, `System schema`, `Core schema`, `Core schema`, `AI schema`, `AI schema`, `Core schema`, `AI schema`, `Core schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `Supply schema`, `Orders schema`, `AI schema`, `Channels schema`, `System schema`, `Core schema`, `AI schema`, `Sourcing schema`, `Channels schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `Core schema`, `Supply schema`, `Channels schema`, `Core schema`, `Channels schema`, `Inventory schema`, `Channels schema`, `AgentOS schema`, `AgentOS schema`, `System schema`, `Channels schema`, `Channels schema`, `Finance schema`, `Inventory schema`, `Orders schema`, `Core schema`, `Supply schema`, `Orders schema`, `Channels schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Supply schema`, `Sourcing schema`, `AgentOS schema`, `AI schema`, `System schema`, `Sourcing schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `Finance schema`, `Inventory schema`, `Sourcing schema`, `AI schema`, `Orders schema`, `Supply schema`, `Sourcing schema`, `Sourcing schema`, `System schema`, `Channels schema`, `Inventory schema`, `AI schema`, `AgentOS schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Supply schema`, `Inventory schema`, `Supply schema`, `Finance schema`, `Orders schema`, `System schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Supply schema`, `System schema`, `Channels schema`, `Supply schema`, `Channels schema`, `Core schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `System schema`, `Supply schema`, `Sourcing schema`, `System schema`, `Core schema`, `Sourcing schema`, `System schema`, `Channels schema`?**
  _High betweenness centrality (0.191) - this node is a cross-community bridge._
- **Why does `Order` connect `Orders schema` to `prisma field: externalOptionId canonical option identity`, `Community 1`, `Community 2`, `prisma field: CategoryMapping.isActive`, `Community 5`, `Community 6`, `Community 7`, `Core schema`, `Community 11`, `Orders schema`, `Community 14`, `System schema`, `provider term: vendorItemId provider term`, `Community 22`, `prisma field: channels — Marketplace Sync + SKU Matching`, `System schema`, `Orders schema`, `Core schema`, `Community 28`, `Community 29`, `AI schema`, `Community 33`, `Core schema`, `Orders schema`, `Supply schema`, `Community 45`, `Orders schema`, `Community 176`, `Community 49`, `Core schema`, `Community 189`, `Community 62`, `Community 69`, `Community 199`, `Community 200`, `Channels schema`, `Community 74`, `Community 77`, `Community 78`, `Finance schema`, `Orders schema`, `Community 94`, `Community 98`, `Community 99`, `Community 101`, `Community 123`, `Community 127`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **Are the 202 inferred relationships involving `Organization` (e.g. with `channel-registration-capability.adapter.spec.ts` and `channel-registration-capability.adapter.ts`) actually correct?**
  _`Organization` has 202 INFERRED edges - model-reasoned connections that need verification._
- **Are the 149 inferred relationships involving `ChannelAccount` (e.g. with `channel-registration-capability.adapter.spec.ts` and `channel-registration-capability.adapter.ts`) actually correct?**
  _`ChannelAccount` has 149 INFERRED edges - model-reasoned connections that need verification._
- **Are the 109 inferred relationships involving `ChannelListing` (e.g. with `channel-registration-capability.adapter.ts` and `channel-listing.controller.ts`) actually correct?**
  _`ChannelListing` has 109 INFERRED edges - model-reasoned connections that need verification._
- **Are the 148 inferred relationships involving `Order` (e.g. with `channel-sync.controller.ts` and `dto/index.ts`) actually correct?**
  _`Order` has 148 INFERRED edges - model-reasoned connections that need verification._