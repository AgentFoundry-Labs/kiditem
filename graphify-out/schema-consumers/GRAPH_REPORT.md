# Graph Report - schema-consumers  (2026-08-03)

## Corpus Check
- 431 files · ~221,634 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 6629 nodes · 38417 edges · 235 communities (216 shown, 19 thin omitted)
- Extraction: 31% EXTRACTED · 69% INFERRED · 0% AMBIGUOUS · INFERRED: 26657 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- prisma field: prisma — Shared Schema
- Community 1
- prisma field: externalOptionId canonical option identity
- prisma field: ActionTask.targetId
- prisma field: vendorItemId provider term
- Community 5
- AI schema
- Core schema
- prisma field: ChannelListingOption.barcode
- Orders schema
- Community 10
- Core schema
- Community 12
- Core schema
- AI schema
- Channels schema
- Community 16
- Community 17
- System schema
- Core schema
- Community 20
- AI schema
- Core schema
- Community 23
- Community 24
- AI schema
- Community 26
- AI schema
- Community 28
- Community 29
- Orders schema
- Community 31
- Supply schema
- Community 33
- AgentOS schema
- Core schema
- AgentOS schema
- Community 37
- Advertising schema
- Sourcing schema
- Inventory schema
- AI schema
- Supply schema
- Community 43
- Community 44
- Channels schema
- Core schema
- AI schema
- Community 48
- Community 49
- Sourcing schema
- Sourcing schema
- System schema
- Community 53
- Orders schema
- Community 55
- Community 56
- Community 57
- AI schema
- Community 59
- Community 60
- Sourcing schema
- Community 62
- Community 63
- AgentOS schema
- AgentOS schema
- Community 66
- Supply schema
- Advertising schema
- Channels schema
- Channels schema
- Inventory schema
- Community 72
- Channels schema
- Community 74
- System schema
- Community 76
- AgentOS schema
- AgentOS schema
- AgentOS schema
- Channels schema
- Finance schema
- Community 82
- Community 83
- Channels schema
- Channels schema
- Community 86
- Channels schema
- AgentOS schema
- AgentOS schema
- Channels schema
- Community 91
- Community 92
- Community 93
- Community 94
- System schema
- Advertising schema
- Community 97
- Community 98
- Channels schema
- Orders schema
- Sourcing schema
- Community 102
- Community 103
- AgentOS schema
- AI schema
- System schema
- Channels schema
- Sourcing schema
- Core schema
- Orders schema
- Sourcing schema
- Community 112
- Community 113
- AgentOS schema
- Finance schema
- Supply schema
- Sourcing schema
- Community 118
- Community 119
- AgentOS schema
- prisma field: ChannelAdTargetDailySnapshot.targetType
- Orders schema
- Channels schema
- Inventory schema
- Community 125
- Community 126
- Community 127
- Community 128
- Community 129
- AgentOS schema
- Sourcing schema
- Sourcing schema
- System schema
- Channels schema
- Inventory schema
- Community 136
- Core schema
- Community 138
- Community 139
- Community 140
- Community 141
- Finance schema
- AgentOS schema
- Channels schema
- Channels schema
- Inventory schema
- Inventory schema
- Supply schema
- Supply schema
- Supply schema
- Community 151
- Community 152
- Community 153
- System schema
- Finance schema
- Channels schema
- Channels schema
- Inventory schema
- Channels schema
- Inventory schema
- Inventory schema
- Community 162
- Community 163
- System schema
- Finance schema
- Community 166
- Community 167
- Channels schema
- Core schema
- Channels schema
- Community 171
- Community 172
- Community 173
- Community 174
- Inventory schema
- Supply schema
- Channels schema
- Core schema
- System schema
- Supply schema
- Community 181
- Community 182
- System schema
- Core schema
- Community 185
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
- Channels schema
- Core schema
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
- Community 230
- Community 231

## God Nodes (most connected - your core abstractions)
1. `Organization` - 474 edges
2. `Database ERD` - 390 edges
3. `ChannelAccount` - 197 edges
4. `Order` - 192 edges
5. `ChannelListing` - 189 edges
6. `ProductPreparation.organizationId` - 181 edges
7. `ContentWorkspace.organizationId` - 180 edges
8. `prisma — Shared Schema` - 178 edges
9. `ChannelListing.organizationId` - 177 edges
10. `ProductRegistrationExecution.organizationId` - 176 edges
11. `ChannelAdTargetDailySnapshot.organizationId` - 175 edges
12. `SourceImportRun.organizationId` - 175 edges

## Surprising Connections (you probably didn't know these)
- `packages/shared — @kiditem/shared` --mentions_domain--> `Inventory`  [EXTRACTED]
  packages/shared/AGENTS.md → prisma/models/inventory.prisma
- `assembleCompleteSnapshot()` --indirect_call--> `item()`  [INFERRED]
  apps/server/src/channels/application/service/channel-catalog-collection.service.ts → packages/shared/src/schemas/channel-sku-availability.spec.ts
- `appendValues()` --indirect_call--> `item()`  [INFERRED]
  scripts/dev-data.ts → packages/shared/src/schemas/channel-sku-availability.spec.ts
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

## Import Cycles
- None detected.

## Communities (235 total, 19 thin omitted)

### Community 0 - "prisma field: prisma — Shared Schema"
Cohesion: 0.15
Nodes (287): UploadedWorkbookFile, HEADERS, USER, CHANNEL_ACCOUNT_LIST_SELECT, chunkSelect, ErrorInput, LockedRun, OwnedRunInput (+279 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (138): ActionTask, ActionTaskExecuteResponse, ActionTaskList, ActionTaskListSchema, ActionTaskRelatedProduct, ActionTaskRelatedProductSchema, ActionTaskSchema, ActionTaskSourceAlert (+130 more)

### Community 2 - "prisma field: externalOptionId canonical option identity"
Cohesion: 0.08
Nodes (88): CanonicalParent, ClaimInput, LockedRunRow, TRANSACTION_OPTIONS, UpsertInput, LockedChunk, LockedCollectionRun, PublishChunkInput (+80 more)

### Community 3 - "prisma field: ActionTask.targetId"
Cohesion: 0.02
Nodes (108): ActionTask.targetId, ActionTask.targetType, AdAction.targetType, AgentArtifact.targetId, Alert.targetId, Alert.targetType, PANEL_RUN_SOURCES, PanelRunSource (+100 more)

### Community 4 - "prisma field: vendorItemId provider term"
Cohesion: 0.05
Nodes (95): ListingForProductSync, COUPANG_WING_ORDER_SOURCE_TYPE, accountIdFor(), seedOrderInline(), seedReturnInline(), normalizeCoupangOrderStatus(), normalizeCoupangProductStatus(), vendorItemId provider term (+87 more)

### Community 5 - "Community 5"
Cohesion: 0.02
Nodes (101): AgentApprovalRequestSummary, AgentApprovalRequestSummarySchema, AgentApprovalStatus, AgentApprovalStatusSchema, AgentArtifactHandoffSummary, AgentArtifactHandoffSummarySchema, AgentArtifactStatus, AgentArtifactStatusSchema (+93 more)

### Community 6 - "AI schema"
Cohesion: 0.02
Nodes (98): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height (+90 more)

### Community 7 - "Core schema"
Cohesion: 0.03
Nodes (64): Organization.createdAt, Organization.id, Organization.name, Organization.slug, Organization.updatedAt, Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr (+56 more)

### Community 8 - "prisma field: ChannelListingOption.barcode"
Cohesion: 0.03
Nodes (69): buildCoupangWingSnapshotCoverage(), CoupangWingSnapshotCoverage, MAX_COUPANG_WING_IMPORT_ROWS, ParsedWingCatalogRow, ParsedWingCatalogSkippedRow, PARENT_COLUMN_INDEXES, REQUIRED_HEADERS, workbookBuffer() (+61 more)

### Community 9 - "Orders schema"
Cohesion: 0.03
Nodes (86): Orders, CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id (+78 more)

### Community 10 - "Community 10"
Cohesion: 0.04
Nodes (54): ChannelCatalogImportController, Controller, Inject, ChannelProductMatchingController, Body, Controller, CurrentOrganization, Get (+46 more)

### Community 11 - "Core schema"
Cohesion: 0.03
Nodes (70): Core, ChannelListingOption.attributesJson, ChannelListingOption.commissionRate, ChannelListingOption.costPriceOverride, ChannelListingOption.createdAt, ChannelListingOption.id, ChannelListingOption.itemName, ChannelListingOption.lastImportRun (+62 more)

### Community 12 - "Community 12"
Cohesion: 0.07
Nodes (67): AdapterCommand, appendFlag(), appendOption(), appendProjectReferenceDefaults(), appendValues(), archiveFileName(), archiveShaFileName(), Args (+59 more)

### Community 13 - "Core schema"
Cohesion: 0.04
Nodes (62): ContentGeneration.triggeredByUserId, OrganizationMembership.createdAt, OrganizationMembership.id, OrganizationMembership.invitedBy, OrganizationMembership.invitedById, OrganizationMembership.joinedAt, OrganizationMembership.lastSelectedAt, OrganizationMembership.organization (+54 more)

### Community 14 - "AI schema"
Cohesion: 0.04
Nodes (61): packages/shared — @kiditem/shared, AI, ProductPreparation.selectedThumbnailGenerationId, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.contentWorkspaceId, ThumbnailGeneration.createdAt, ThumbnailGeneration.deletedAt (+53 more)

### Community 15 - "Channels schema"
Cohesion: 0.04
Nodes (59): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adCoverageStatus, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d (+51 more)

### Community 16 - "Community 16"
Cohesion: 0.04
Nodes (54): ChunkRequestBaseSchema, COUPANG_CATALOG_BROWSER_FILE_NAME, COUPANG_CATALOG_COLLECTOR_VERSION, COUPANG_CATALOG_MAX_CHUNK_BYTES, COUPANG_CATALOG_MAX_MEDIA_PER_OWNER, COUPANG_CATALOG_MAX_OPTIONS_PER_PRODUCT, COUPANG_CATALOG_MAX_PRODUCT_BYTES, COUPANG_CATALOG_MAX_PRODUCTS_PER_CHUNK (+46 more)

### Community 17 - "Community 17"
Cohesion: 0.03
Nodes (56): ChannelOptionInventoryComponentInput, ChannelOptionInventoryComponentInputSchema, ChannelOptionSummary, ChannelOptionSummarySchema, CreateMasterProductInput, CreateMasterProductInputSchema, MasterProductDisplayReference, MasterProductDisplayReferenceSchema (+48 more)

### Community 18 - "System schema"
Cohesion: 0.05
Nodes (41): assertExactProductGraph(), MarketplaceRegistrationRepositoryAdapter, Injectable, upsertExactOptionLinks(), MarketplaceRegistrationRepositoryPort, asRecord(), KidItemFirstOptionLink, KidItemFirstRegistrationLinks (+33 more)

### Community 19 - "Core schema"
Cohesion: 0.04
Nodes (51): ChannelListing.masterProductId, MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.adTier, MasterProduct.brand, MasterProduct.category, MasterProduct.code, MasterProduct.createdAt (+43 more)

### Community 20 - "Community 20"
Cohesion: 0.09
Nodes (52): assertNoLocalAuthSecrets(), assertNonProductionTarget(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged(), assertSha256(), BaselineManifest, BaselineManifestExpectation, baselineObjectKeys (+44 more)

### Community 21 - "AI schema"
Cohesion: 0.05
Nodes (52): ContentGeneration.contentWorkspaceId, ContentWorkspace.channelListing, ContentWorkspace.channelListingId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.createdByUserId, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageRevision (+44 more)

### Community 22 - "Core schema"
Cohesion: 0.05
Nodes (50): ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id, ChannelAccount.isPrimary, ChannelAccount.name, ChannelAccount.organization (+42 more)

### Community 23 - "Community 23"
Cohesion: 0.08
Nodes (46): apiHeaders(), apiUrl(), Args, assertSafeDatasetId(), assertSupportedReplayPayloads(), BundleManifest, BundlePayload, BundleReference (+38 more)

### Community 24 - "Community 24"
Cohesion: 0.08
Nodes (47): APPLY_STORAGE_CACHE_CONTROL_CONFIRMATION, applyCacheControl(), ApplyResult, applyS3CacheControl(), applySupabaseCacheControl(), assertApplyAllowed(), buildCopyObjectInput(), CliArgs (+39 more)

### Community 25 - "AI schema"
Cohesion: 0.04
Nodes (51): DetailPageImageArtifact.byteLength, DetailPageImageArtifact.contentType, DetailPageImageArtifact.createdAt, DetailPageImageArtifact.createdBy, DetailPageImageArtifact.createdByUserId, DetailPageImageArtifact.id, DetailPageImageArtifact.imageUrl, DetailPageImageArtifact.objectKey (+43 more)

### Community 26 - "Community 26"
Cohesion: 0.04
Nodes (49): boundedText(), isoDay, isRocketWorkbookBlockingReason(), requiredText(), ROCKET_PO_ROW_LIMIT, ROCKET_SAVED_PO_RESPONSE_PROFILE, ROCKET_SHORTAGE_REASONS, ROCKET_WORKBOOK_BLOCKING_REASONS (+41 more)

### Community 27 - "AI schema"
Cohesion: 0.05
Nodes (46): ContentGeneration.detailPageArtifactId, ContentWorkspace.currentDetailPageArtifactId, ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.contentWorkspaceId, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.createdByUserId (+38 more)

### Community 28 - "Community 28"
Cohesion: 0.04
Nodes (46): CalendarDateSchema, ChecksumSchema, dateRangeSourceFreshness(), FiniteNumberSchema, NullableMetricSchema, ProductAbcAdvertisingSourceFreshnessSchema, ProductAbcAdvertisingSourceStatus, ProductAbcAdvertisingSourceStatusSchema (+38 more)

### Community 29 - "Community 29"
Cohesion: 0.10
Nodes (46): APPLY_DATA_MIGRATIONS_CONFIRMATION, appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertBaselineBinding(), assertMutatingTarget(), assertRebuildBaselineRestore(), assertUniqueIds(), baselineRegistry() (+38 more)

### Community 30 - "Orders schema"
Cohesion: 0.05
Nodes (45): OrderLineItem.createdAt, OrderLineItem.externalBarcode, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.metadata, OrderLineItem.optionName, OrderLineItem.order (+37 more)

### Community 31 - "Community 31"
Cohesion: 0.07
Nodes (24): ChannelSyncController, Body, Controller, CurrentOrganization, CurrentUser, Get, Post, OperationAlertPort (+16 more)

### Community 32 - "Supply schema"
Cohesion: 0.05
Nodes (45): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+37 more)

### Community 33 - "Community 33"
Cohesion: 0.07
Nodes (21): ChannelRegistrationCapabilityAdapter, toSellpiaMatch(), Injectable, ChannelsMarketplaceRegistrationCapabilityPort, ExternalProductRegistrationMatchPreviewInput, ExternalProductRegistrationMatchPreviewResult, ExternalProductRegistrationPreflightInput, ExternalProductRegistrationPreflightResult (+13 more)

### Community 34 - "AgentOS schema"
Cohesion: 0.05
Nodes (44): AgentRunRequest.agentInstance, AgentRunRequest.attempts, AgentRunRequest.claimedAt, AgentRunRequest.claimedBy, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.coalescedIntoRequestId, AgentRunRequest.conversation, AgentRunRequest.createdAt (+36 more)

### Community 35 - "Core schema"
Cohesion: 0.05
Nodes (44): MasterProductAbcEvaluation.adjustedScore, MasterProductAbcEvaluation.advertisingCoverageEndDate, MasterProductAbcEvaluation.advertisingCoverageStartDate, MasterProductAbcEvaluation.advertisingSourceCapturedAt, MasterProductAbcEvaluation.advertisingSourceStatus, MasterProductAbcEvaluation.calculatedAt, MasterProductAbcEvaluation.calculationStatus, MasterProductAbcEvaluation.costComponentsJson (+36 more)

### Community 36 - "AgentOS schema"
Cohesion: 0.05
Nodes (42): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+34 more)

### Community 37 - "Community 37"
Cohesion: 0.05
Nodes (39): BrowserOperationClaim, BrowserOperationClaimRequest, BrowserOperationClaimRequestSchema, BrowserOperationClaimSchema, BrowserOperationHeartbeatRequest, BrowserOperationHeartbeatRequestSchema, BrowserOperationReportRequest, BrowserOperationReportRequestSchema (+31 more)

### Community 38 - "Advertising schema"
Cohesion: 0.06
Nodes (41): Advertising, ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task (+33 more)

### Community 39 - "Sourcing schema"
Cohesion: 0.05
Nodes (41): CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id, CandidateImage.isPrimary (+33 more)

### Community 40 - "Inventory schema"
Cohesion: 0.06
Nodes (39): InventoryCommitment.businessKey, InventoryCommitment.createdAt, InventoryCommitment.createdBy, InventoryCommitment.creator, InventoryCommitment.id, InventoryCommitment.inventoryGeneration, InventoryCommitment.kind, InventoryCommitment.organization (+31 more)

### Community 41 - "AI schema"
Cohesion: 0.06
Nodes (39): ProductPreparation.approvedAt, ProductPreparation.approvedByUser, ProductPreparation.channelAccount, ProductPreparation.channelAccountId, ProductPreparation.channelListing, ProductPreparation.channelListingId, ProductPreparation.createdAt, ProductPreparation.createdByUser (+31 more)

### Community 42 - "Supply schema"
Cohesion: 0.06
Nodes (36): PurchaseOrder.supplierId, Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.id, Supplier.leadTimeDays, Supplier.name (+28 more)

### Community 43 - "Community 43"
Cohesion: 0.05
Nodes (38): ACCOUNT_AD_DAILY_DIGEST_KEYS, AD_ROW_KEYS, AD_SUMMARY_KEYS, ADS_DAILY_ROW_KEYS, ADS_KPI_KEYS, assertExactCount(), assertReadyCounts(), BootstrapPreflightManifest (+30 more)

### Community 44 - "Community 44"
Cohesion: 0.08
Nodes (32): CHANNEL_LISTING_SORTS, CHANNEL_LISTING_TABS, ChannelListingDeletionDto, ChannelListingDeletionUnresolvedDto, ChannelListingQueryDto, IsIn, IsOptional, IsString (+24 more)

### Community 45 - "Channels schema"
Cohesion: 0.06
Nodes (38): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignIdentity, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel (+30 more)

### Community 46 - "Core schema"
Cohesion: 0.07
Nodes (38): ChannelListing.lastImportRunId, ChannelListingOption.lastImportRunId, Order.sourceImportRunId, SellpiaInventorySku.lastImportRunId, SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.coverageEndDate (+30 more)

### Community 47 - "AI schema"
Cohesion: 0.06
Nodes (38): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+30 more)

### Community 48 - "Community 48"
Cohesion: 0.05
Nodes (36): deriveSellpiaInventoryFreshness(), FixedSellpiaAccountKeySchema, FixedSellpiaOriginSchema, IsoDateTimeStringSchema, SELLPIA_INVENTORY_COLLECTION_FAILURE_CODES, SELLPIA_INVENTORY_FRESHNESS_STATUSES, SELLPIA_INVENTORY_REFRESH_REASONS, SellpiaFreshnessDerivationInput (+28 more)

### Community 49 - "Community 49"
Cohesion: 0.06
Nodes (22): nextPublicationSequence(), productsFromRows(), publishIdentities(), resolveIdentities(), RocketPoCatalogRepositoryAdapter, toCompletedRun(), Injectable, zeroChanges() (+14 more)

### Community 50 - "Sourcing schema"
Cohesion: 0.07
Nodes (37): Sourcing, NaverPopularKeywordDailySnapshot.boardKey, NaverPopularKeywordDailySnapshot.boardLabel, NaverPopularKeywordDailySnapshot.businessDate, NaverPopularKeywordDailySnapshot.capturedAt, NaverPopularKeywordDailySnapshot.cid, NaverPopularKeywordDailySnapshot.createdAt, NaverPopularKeywordDailySnapshot.id (+29 more)

### Community 51 - "Sourcing schema"
Cohesion: 0.06
Nodes (33): ContentGeneration.sourceCandidateId, SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.id, SourcingCandidate.imageUrl (+25 more)

### Community 52 - "System schema"
Cohesion: 0.06
Nodes (37): OperationRun.attempts, OperationRun.attemptToken, OperationRun.claimedAt, OperationRun.claimedBy, OperationRun.createdAt, OperationRun.definitionVersion, OperationRun.engineType, OperationRun.errorCode (+29 more)

### Community 53 - "Community 53"
Cohesion: 0.11
Nodes (27): aggregateMappingStatus(), assertLockedListing(), assertOperationActor(), contains(), firstPrice(), isUniqueViolation(), ListingRow, lockDeletionOperation() (+19 more)

### Community 54 - "Orders schema"
Cohesion: 0.06
Nodes (36): OrderReturn.channelAccount, OrderReturn.channelAccountId, OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.id (+28 more)

### Community 55 - "Community 55"
Cohesion: 0.08
Nodes (33): ClientRenderArtifactSchema, ClientRenderContentTypeSchema, ClientRenderDateSchema, ClientRenderOutputWidthSchema, ClientRenderUuidSchema, ClientRenderVariantSchema, DETAIL_IMAGE_COUNTS, DETAIL_PAGE_AGE_GROUPS (+25 more)

### Community 56 - "Community 56"
Cohesion: 0.06
Nodes (31): ChannelMatchCandidateReason, ChannelMatchCandidateReasonSchema, ChannelMatchEvidence, ChannelMatchEvidenceSchema, ChannelMatchingAccount, ChannelMatchingAccountSchema, ChannelOptionInventoryComponent, ChannelOptionInventoryComponentSchema (+23 more)

### Community 57 - "Community 57"
Cohesion: 0.10
Nodes (33): automaticReason(), automaticStatus(), BarcodeEvidence, bestSimilarityPerSku(), ChannelRecipeSuggestionDecision, ChannelRecipeSuggestionEvidenceKind, ChannelRecipeSuggestionInput, ChannelRecipeSuggestionResponse (+25 more)

### Community 58 - "AI schema"
Cohesion: 0.07
Nodes (35): ContentWorkspaceThumbnailSelection.contentAsset, ContentWorkspaceThumbnailSelection.contentAssetId, ContentWorkspaceThumbnailSelection.contentWorkspace, ContentWorkspaceThumbnailSelection.contentWorkspaceId, ContentWorkspaceThumbnailSelection.createdAt, ContentWorkspaceThumbnailSelection.createdByUser, ContentWorkspaceThumbnailSelection.createdByUserId, ContentWorkspaceThumbnailSelection.id (+27 more)

### Community 59 - "Community 59"
Cohesion: 0.06
Nodes (28): ChannelAccountListItem, ChannelAccountListItemSchema, CoupangAccountSettings, CoupangAccountSettingsSchema, UpdateCoupangAccountSettings, ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow (+20 more)

### Community 60 - "Community 60"
Cohesion: 0.11
Nodes (32): CurrentOrganization, CurrentUser, Param, Post, cellText(), collectParentMetadataConflicts(), decodeWorksheetRange(), expandMergedParentCells() (+24 more)

### Community 61 - "Sourcing schema"
Cohesion: 0.07
Nodes (34): ProductRegistrationExecution.channelAccount, ProductRegistrationExecution.channelListing, ProductRegistrationExecution.channelListingId, ProductRegistrationExecution.completedAt, ProductRegistrationExecution.createdAt, ProductRegistrationExecution.executionKind, ProductRegistrationExecution.expectedProviderAccountId, ProductRegistrationExecution.externalListingId (+26 more)

### Community 62 - "Community 62"
Cohesion: 0.07
Nodes (30): SellpiaInventoryCollectionFailureCodeSchema, SellpiaInventoryGenerationSchema, SellpiaInventoryQualityReportSchema, SellpiaInventoryRefreshReasonSchema, CompletedSourceArtifactRun, CoupangWingCatalogImportResponse, CoupangWingCatalogImportResponseSchema, ImportChanges (+22 more)

### Community 63 - "Community 63"
Cohesion: 0.08
Nodes (13): SellpiaRecipeEvidenceAdapter, toEvidenceSku(), Inject, Injectable, ChannelRecipeSuggestionContextRepositoryAdapter, Injectable, SellpiaRecipeEvidencePort, SellpiaRecipeEvidenceSku (+5 more)

### Community 64 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+25 more)

### Community 65 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.startedAt, WorkflowRun.status (+25 more)

### Community 66 - "Community 66"
Cohesion: 0.07
Nodes (31): DeliveryCompany, DeliveryCompanySchema, Order, OrderActionResponse, OrderActionResponseSchema, OrderLineItem, OrderLineItemSchema, OrderListItem (+23 more)

### Community 67 - "Supply schema"
Cohesion: 0.07
Nodes (32): RocketPurchaseConfirmation.artifactBytes, RocketPurchaseConfirmation.artifactContentType, RocketPurchaseConfirmation.artifactFileName, RocketPurchaseConfirmation.artifactSha256, RocketPurchaseConfirmation.artifactStoredAt, RocketPurchaseConfirmation.channelAccount, RocketPurchaseConfirmation.channelAccountId, RocketPurchaseConfirmation.completedAt (+24 more)

### Community 68 - "Advertising schema"
Cohesion: 0.07
Nodes (28): ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.id, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.url, ScrapeTarget (+20 more)

### Community 69 - "Channels schema"
Cohesion: 0.08
Nodes (31): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.channelAccount, ChannelScrapeRun.channelAccountId, ChannelScrapeRun.clientRunKey, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson (+23 more)

### Community 70 - "Channels schema"
Cohesion: 0.07
Nodes (31): RocketPoCatalogLine.businessDateBasis, RocketPoCatalogLine.center, RocketPoCatalogLine.createdAt, RocketPoCatalogLine.hasConfirmation, RocketPoCatalogLine.id, RocketPoCatalogLine.inboundType, RocketPoCatalogLine.orderQty, RocketPoCatalogLine.organization (+23 more)

### Community 71 - "Inventory schema"
Cohesion: 0.07
Nodes (30): SellpiaInventoryState.activeGeneration, SellpiaInventoryState.activeSyncLeaseExpiresAt, SellpiaInventoryState.activeSyncOwner, SellpiaInventoryState.activeSyncOwnerUserId, SellpiaInventoryState.activeSyncScope, SellpiaInventoryState.activeSyncStartedAt, SellpiaInventoryState.activeSyncToken, SellpiaInventoryState.createdAt (+22 more)

### Community 72 - "Community 72"
Cohesion: 0.14
Nodes (14): ChannelListingController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+6 more)

### Community 73 - "Channels schema"
Cohesion: 0.09
Nodes (23): CoupangRocketPurchaseOrderOperationHandler, Inject, Injectable, CHANNELS_OPERATIONS, CoupangRocketPurchaseOrderInputSchema, RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt (+15 more)

### Community 74 - "Community 74"
Cohesion: 0.08
Nodes (11): Inject, ChannelProductMatchingRepositoryAdapter, Injectable, ChannelSkuAvailabilityPort, ChannelProductMatchingRepositoryPort, Inject, ChannelSkuAvailabilityService, matchesStatus() (+3 more)

### Community 75 - "System schema"
Cohesion: 0.08
Nodes (26): Alert.actionTask, Alert.actorUser, Alert.actorUserId, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead (+18 more)

### Community 76 - "Community 76"
Cohesion: 0.08
Nodes (8): CoupangProviderPort, ChannelSyncRepositoryPort, OrderSyncDeps, ProductSyncDeps, Inject, Optional, Inject, Optional

### Community 77 - "AgentOS schema"
Cohesion: 0.08
Nodes (28): AgentOS, AgentAuthorizationEvent.toolId, AgentInstanceToolPolicy.agentInstance, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentInstanceToolPolicy.dryRunMode, AgentInstanceToolPolicy.effect (+20 more)

### Community 78 - "AgentOS schema"
Cohesion: 0.07
Nodes (28): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.approver, AgentApprovalRequest.approverUserId, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy, AgentApprovalRequest.decidedByUserId (+20 more)

### Community 79 - "AgentOS schema"
Cohesion: 0.08
Nodes (28): AgentToolInvocation.agentInstance, AgentToolInvocation.approvalRequest, AgentToolInvocation.approvalRequestId, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt, AgentToolInvocation.errorCode (+20 more)

### Community 80 - "Channels schema"
Cohesion: 0.08
Nodes (26): ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.id, ChannelScrapeSnapshot.listing, ChannelScrapeSnapshot.listingOption (+18 more)

### Community 81 - "Finance schema"
Cohesion: 0.08
Nodes (25): GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.listing, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization, GradeHistory.reason (+17 more)

### Community 82 - "Community 82"
Cohesion: 0.11
Nodes (24): AdCampaignAccountProjection, AdCampaignDailyRepairPlan, AdCampaignListingProjection, AdCampaignRepairRunInput, AdCampaignRepairSnapshotInput, AdCampaignTargetProjection, AdMetrics, asRecord() (+16 more)

### Community 83 - "Community 83"
Cohesion: 0.14
Nodes (27): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+19 more)

### Community 84 - "Channels schema"
Cohesion: 0.08
Nodes (27): ChannelListingDeletionOperation.authorizationExpiresAt, ChannelListingDeletionOperation.channelAccount, ChannelListingDeletionOperation.channelListing, ChannelListingDeletionOperation.channelListingId, ChannelListingDeletionOperation.completedAt, ChannelListingDeletionOperation.createdAt, ChannelListingDeletionOperation.expectedProviderAccountId, ChannelListingDeletionOperation.externalListingId (+19 more)

### Community 85 - "Channels schema"
Cohesion: 0.08
Nodes (27): CoupangWingSalesRankDailySnapshot.businessDate, CoupangWingSalesRankDailySnapshot.capturedAt, CoupangWingSalesRankDailySnapshot.categoryHierarchy, CoupangWingSalesRankDailySnapshot.collectedCount, CoupangWingSalesRankDailySnapshot.conversionRate28d, CoupangWingSalesRankDailySnapshot.createdAt, CoupangWingSalesRankDailySnapshot.id, CoupangWingSalesRankDailySnapshot.itemId (+19 more)

### Community 86 - "Community 86"
Cohesion: 0.08
Nodes (23): StatisticsCategoryRow, StatisticsCategoryRowSchema, StatisticsDeliveryDaily, StatisticsDeliveryDailySchema, StatisticsDeliveryResponse, StatisticsDeliveryResponseSchema, StatisticsGradeRow, StatisticsGradeRowSchema (+15 more)

### Community 87 - "Channels schema"
Cohesion: 0.09
Nodes (25): ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isOfferWinner, ChannelListingOptionDailySnapshot.lastObservedAt, ChannelListingOptionDailySnapshot.listing (+17 more)

### Community 88 - "AgentOS schema"
Cohesion: 0.09
Nodes (24): AgentApprovalRequest.agentInstanceId, AgentInstance.adapterConfig, AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.icon, AgentInstance.id, AgentInstance.lifecycleStatus, AgentInstance.modelOverride (+16 more)

### Community 89 - "AgentOS schema"
Cohesion: 0.09
Nodes (24): AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy, AgentAuthorizationEvent.decidedByUserId, AgentAuthorizationEvent.decision (+16 more)

### Community 90 - "Channels schema"
Cohesion: 0.10
Nodes (24): SellpiaProductMonthlySales.buyPrice, SellpiaProductMonthlySales.capturedAt, SellpiaProductMonthlySales.costBasis, SellpiaProductMonthlySales.coverageEndDate, SellpiaProductMonthlySales.coverageStartDate, SellpiaProductMonthlySales.createdAt, SellpiaProductMonthlySales.id, SellpiaProductMonthlySales.inAmount (+16 more)

### Community 91 - "Community 91"
Cohesion: 0.11
Nodes (19): upsertChannelCatalogIdentities(), assertActiveCoupangAccount(), assertCanonicalAccount(), ChannelCatalogPublicationRepositoryAdapter, completeCollectionRun(), completedCollectionResult(), flattenMedia(), jsonRecord() (+11 more)

### Community 92 - "Community 92"
Cohesion: 0.13
Nodes (12): assertCanonicalCoupangAccountIdentity(), canonicalParentRows(), ChannelCatalogImportRepositoryAdapter, importResponse(), isUniqueConstraintError(), nextPublicationSequence(), Injectable, zeroChanges() (+4 more)

### Community 93 - "Community 93"
Cohesion: 0.11
Nodes (18): aiProductSuggestion(), asRecord(), availabilityListingWhere(), completedCatalogRunWhere(), distinctStrings(), exactAliasesForOption(), firstString(), groupIds() (+10 more)

### Community 94 - "Community 94"
Cohesion: 0.19
Nodes (20): bigrams(), ChannelRecipeNameEvidence, ChannelRecipeNameIndex, ChannelRecipeNameOption, ChannelRecipeNameSku, compareEvidence(), createChannelRecipeNameIndex(), diceCoefficient() (+12 more)

### Community 95 - "System schema"
Cohesion: 0.10
Nodes (23): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.href (+15 more)

### Community 96 - "Advertising schema"
Cohesion: 0.09
Nodes (23): AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+15 more)

### Community 97 - "Community 97"
Cohesion: 0.22
Nodes (8): ChannelDashboardController, Controller, CurrentOrganization, Get, Query, CoupangDateRangeQueryDto, ChannelDashboardService, Injectable

### Community 98 - "Community 98"
Cohesion: 0.13
Nodes (22): assembleCompleteSnapshot(), assertSameManifest(), buildCollectionStatus(), countMedia(), countOptions(), derivePhase(), firstDate(), hashCatalogChunkPayload() (+14 more)

### Community 99 - "Channels schema"
Cohesion: 0.11
Nodes (22): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.channelAccount, ChannelAccountDailyKpiSnapshot.channelAccountId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+14 more)

### Community 100 - "Orders schema"
Cohesion: 0.10
Nodes (20): Review.content, Review.createdAt, Review.externalProductId, Review.externalReviewId, Review.id, Review.imageCount, Review.isBlinded, Review.itemName (+12 more)

### Community 101 - "Sourcing schema"
Cohesion: 0.11
Nodes (22): TiktokCreativeTrendDailySnapshot.businessDate, TiktokCreativeTrendDailySnapshot.capturedAt, TiktokCreativeTrendDailySnapshot.createdAt, TiktokCreativeTrendDailySnapshot.entityKey, TiktokCreativeTrendDailySnapshot.growthPct, TiktokCreativeTrendDailySnapshot.id, TiktokCreativeTrendDailySnapshot.industry, TiktokCreativeTrendDailySnapshot.label (+14 more)

### Community 102 - "Community 102"
Cohesion: 0.20
Nodes (14): CoupangCredentials, coupangRequest(), CoupangRequestOptions, generateAuthorization(), approveReturn(), confirmOrderSheets(), DELIVERY_COMPANIES, getOrderSheets() (+6 more)

### Community 103 - "Community 103"
Cohesion: 0.15
Nodes (15): envelopeToJson(), maskAccessKey(), readCredentialsConfig(), stripLegacyCredentialKeys(), toJsonRecord(), toRecord(), trimToOptional(), CoupangCredentials (+7 more)

### Community 104 - "AgentOS schema"
Cohesion: 0.10
Nodes (21): AgentArtifact.agentInstance, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization, AgentArtifact.request (+13 more)

### Community 105 - "AI schema"
Cohesion: 0.11
Nodes (21): AiDirectJob.attempts, AiDirectJob.claimedAt, AiDirectJob.claimedBy, AiDirectJob.createdAt, AiDirectJob.finishedAt, AiDirectJob.id, AiDirectJob.jobType, AiDirectJob.lastErrorCode (+13 more)

### Community 106 - "System schema"
Cohesion: 0.10
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+13 more)

### Community 107 - "Channels schema"
Cohesion: 0.11
Nodes (21): CoupangKeywordRankDailySnapshot.adRank, CoupangKeywordRankDailySnapshot.businessDate, CoupangKeywordRankDailySnapshot.capturedAt, CoupangKeywordRankDailySnapshot.createdAt, CoupangKeywordRankDailySnapshot.id, CoupangKeywordRankDailySnapshot.itemId, CoupangKeywordRankDailySnapshot.keyword, CoupangKeywordRankDailySnapshot.organicRank (+13 more)

### Community 108 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): LiveCommerceBroadcastDailySnapshot.broadcasterId, LiveCommerceBroadcastDailySnapshot.broadcasterName, LiveCommerceBroadcastDailySnapshot.broadcastId, LiveCommerceBroadcastDailySnapshot.businessDate, LiveCommerceBroadcastDailySnapshot.capturedAt, LiveCommerceBroadcastDailySnapshot.coverImageUrl, LiveCommerceBroadcastDailySnapshot.createdAt, LiveCommerceBroadcastDailySnapshot.endedAt (+13 more)

### Community 109 - "Core schema"
Cohesion: 0.12
Nodes (21): MasterProductAbcEvaluation.formulaVersionId, MasterProductAbcFormulaVersion.calculationCodeChecksum, MasterProductAbcFormulaVersion.calibrationMetricsJson, MasterProductAbcFormulaVersion.createdAt, MasterProductAbcFormulaVersion.firstActivatedAt, MasterProductAbcFormulaVersion.foldCount, MasterProductAbcFormulaVersion.formulaChecksum, MasterProductAbcFormulaVersion.formulaJson (+13 more)

### Community 110 - "Orders schema"
Cohesion: 0.10
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 111 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): ShortsTrendDailySnapshot.businessDate, ShortsTrendDailySnapshot.capturedAt, ShortsTrendDailySnapshot.channelName, ShortsTrendDailySnapshot.commentCount, ShortsTrendDailySnapshot.createdAt, ShortsTrendDailySnapshot.id, ShortsTrendDailySnapshot.keyword, ShortsTrendDailySnapshot.likeCount (+13 more)

### Community 112 - "Community 112"
Cohesion: 0.20
Nodes (21): assertSharedDatabaseIdentity(), assertSharedRebuildGuard(), bootstrap(), bootstrapPlanFromCli(), buildSharedBootstrapPlan(), cliValue(), createPrisma(), databaseProjectRef() (+13 more)

### Community 113 - "Community 113"
Cohesion: 0.10
Nodes (7): ChannelsDeletionPasswordAdapter, Injectable, ChannelsDeletionPasswordPort, ChannelListingRepositoryPort, Inject, Optional, Inject

### Community 114 - "AgentOS schema"
Cohesion: 0.11
Nodes (20): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id, AgentCostEvent.inputTokens (+12 more)

### Community 115 - "Finance schema"
Cohesion: 0.12
Nodes (20): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit (+12 more)

### Community 116 - "Supply schema"
Cohesion: 0.12
Nodes (20): RocketPurchaseConfirmationLine.channelListingOption, RocketPurchaseConfirmationLine.channelListingOptionId, RocketPurchaseConfirmationLine.collectedAt, RocketPurchaseConfirmationLine.collectedOrderLineItemId, RocketPurchaseConfirmationLine.confirmation, RocketPurchaseConfirmationLine.confirmationId, RocketPurchaseConfirmationLine.confirmedQuantity, RocketPurchaseConfirmationLine.createdAt (+12 more)

### Community 117 - "Sourcing schema"
Cohesion: 0.12
Nodes (20): Sourcing1688HotProductDailySnapshot.businessDate, Sourcing1688HotProductDailySnapshot.capturedAt, Sourcing1688HotProductDailySnapshot.createdAt, Sourcing1688HotProductDailySnapshot.id, Sourcing1688HotProductDailySnapshot.imageUrl, Sourcing1688HotProductDailySnapshot.monthlySales, Sourcing1688HotProductDailySnapshot.offerId, Sourcing1688HotProductDailySnapshot.organization (+12 more)

### Community 118 - "Community 118"
Cohesion: 0.17
Nodes (20): assertCurrentRebuildBinding(), assertProtectedApiDestination(), assertRebuildImportPrerequisites(), assertReplayCounts(), assertReplayFactDigest(), assertStoredImportBinding(), assertUuid(), bindRebuildImports() (+12 more)

### Community 119 - "Community 119"
Cohesion: 0.21
Nodes (18): analyzePrReleaseContract(), changedFilesFromGit(), classifyFiles(), compareSemver(), deletedFilesFromGit(), ghPrBody(), git(), hasReleaseDecision() (+10 more)

### Community 120 - "AgentOS schema"
Cohesion: 0.12
Nodes (19): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError, AgentTaskSession.lastRun (+11 more)

### Community 121 - "prisma field: ChannelAdTargetDailySnapshot.targetType"
Cohesion: 0.11
Nodes (17): ChannelAdTargetDailySnapshot.targetType, CANCEL_OPERATION_TARGET_TYPES, CancelOperationAffected, CancelOperationAffectedSchema, CancelOperationPreserved, CancelOperationPreservedSchema, CancelOperationResponse, CancelOperationResponseSchema (+9 more)

### Community 122 - "Orders schema"
Cohesion: 0.12
Nodes (19): CoupangDirectPoSnapshot.centerName, CoupangDirectPoSnapshot.channelAccountId, CoupangDirectPoSnapshot.collectedAt, CoupangDirectPoSnapshot.createdAt, CoupangDirectPoSnapshot.deliveryDate, CoupangDirectPoSnapshot.id, CoupangDirectPoSnapshot.isUrgent, CoupangDirectPoSnapshot.itemsJson (+11 more)

### Community 123 - "Channels schema"
Cohesion: 0.12
Nodes (19): CoupangWingTrackedProductDailySnapshot.businessDate, CoupangWingTrackedProductDailySnapshot.capturedAt, CoupangWingTrackedProductDailySnapshot.conversionRate28d, CoupangWingTrackedProductDailySnapshot.createdAt, CoupangWingTrackedProductDailySnapshot.estimatedRevenue28d, CoupangWingTrackedProductDailySnapshot.id, CoupangWingTrackedProductDailySnapshot.organization, CoupangWingTrackedProductDailySnapshot.pvLast28Day (+11 more)

### Community 124 - "Inventory schema"
Cohesion: 0.12
Nodes (19): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.notes, ReturnTransfer.optionName, ReturnTransfer.organization (+11 more)

### Community 125 - "Community 125"
Cohesion: 0.15
Nodes (14): PRODUCT_LIFECYCLE_STATES, ProductLifecycleState, ProductLifecycleStateSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, MasterImageItem, MasterImageItemSchema, MasterImageRole (+6 more)

### Community 126 - "Community 126"
Cohesion: 0.16
Nodes (19): asRecord(), conversionRate(), dailyRawMetricsMatch(), dateStringMatches(), exactHeaderValues(), finiteNumber(), hasExactCoupangAdsDailyRawProvenance(), isExactWholeAccountCampaignRun() (+11 more)

### Community 127 - "Community 127"
Cohesion: 0.19
Nodes (18): assertAllowedArguments(), assertPublishableMain(), copyLoadableExtension(), createArchive(), environmentProfiles, githubReleaseCommand(), gitOutput(), gitSha() (+10 more)

### Community 128 - "Community 128"
Cohesion: 0.11
Nodes (16): CurrentOrganization, Get, Query, AVAILABILITY_STATUSES, ChannelSkuAvailabilityQueryDto, IsIn, IsInt, IsOptional (+8 more)

### Community 129 - "Community 129"
Cohesion: 0.11
Nodes (4): ChannelDashboardRepositoryAdapter, Injectable, ChannelDashboardRepositoryPort, Inject

### Community 130 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.id, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.lastRunId (+10 more)

### Community 131 - "Sourcing schema"
Cohesion: 0.14
Nodes (18): LiveCommerceProductDailySnapshot.broadcastId, LiveCommerceProductDailySnapshot.businessDate, LiveCommerceProductDailySnapshot.capturedAt, LiveCommerceProductDailySnapshot.createdAt, LiveCommerceProductDailySnapshot.id, LiveCommerceProductDailySnapshot.imageUrl, LiveCommerceProductDailySnapshot.organization, LiveCommerceProductDailySnapshot.priceCny (+10 more)

### Community 132 - "Sourcing schema"
Cohesion: 0.13
Nodes (18): NaverKeywordDailySnapshot.averageAdRank, NaverKeywordDailySnapshot.businessDate, NaverKeywordDailySnapshot.capturedAt, NaverKeywordDailySnapshot.competitionIndex, NaverKeywordDailySnapshot.createdAt, NaverKeywordDailySnapshot.id, NaverKeywordDailySnapshot.keyword, NaverKeywordDailySnapshot.monthlyMobileSearchCount (+10 more)

### Community 133 - "System schema"
Cohesion: 0.12
Nodes (18): OperationRun.scheduleId, OperationSchedule.createdAt, OperationSchedule.createdBy, OperationSchedule.createdByUserId, OperationSchedule.cronExpression, OperationSchedule.enabled, OperationSchedule.id, OperationSchedule.input (+10 more)

### Community 134 - "Channels schema"
Cohesion: 0.14
Nodes (18): RocketPoCatalogSnapshot.channelAccount, RocketPoCatalogSnapshot.channelAccountId, RocketPoCatalogSnapshot.collectionRunId, RocketPoCatalogSnapshot.createdAt, RocketPoCatalogSnapshot.detailPoCount, RocketPoCatalogSnapshot.id, RocketPoCatalogSnapshot.listPagesRead, RocketPoCatalogSnapshot.organization (+10 more)

### Community 135 - "Inventory schema"
Cohesion: 0.12
Nodes (18): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.fromWarehouseId, StockTransfer.id, StockTransfer.notes, StockTransfer.optionName, StockTransfer.organization (+10 more)

### Community 136 - "Community 136"
Cohesion: 0.18
Nodes (8): ChannelCatalogCollectionRepositoryAdapter, isUniqueConstraintError(), ownedRunWhere(), Injectable, ChannelCatalogCollectionChunkRecord, ChannelCatalogCollectionRunRecord, ChannelCatalogCollectionWithChunks, startRun()

### Community 137 - "Core schema"
Cohesion: 0.12
Nodes (17): MasterProductAbcGradeHistory.adjustedScore, MasterProductAbcGradeHistory.calculatedAt, MasterProductAbcGradeHistory.calculationStatus, MasterProductAbcGradeHistory.formulaVersion, MasterProductAbcGradeHistory.formulaVersionId, MasterProductAbcGradeHistory.id, MasterProductAbcGradeHistory.masterProduct, MasterProductAbcGradeHistory.masterProductId (+9 more)

### Community 138 - "Community 138"
Cohesion: 0.12
Nodes (13): MAX_SELLPIA_MANUAL_MATCH_ROWS, MAX_SELLPIA_MANUAL_MATCH_TARGETS, SellpiaManualMatchCodeSchema, SellpiaManualMatchCollectionFailureCode, SellpiaManualMatchCollectionFailureCodeSchema, SellpiaManualMatchImportResponse, SellpiaManualMatchRow, SellpiaManualMatchRowSchema (+5 more)

### Community 139 - "Community 139"
Cohesion: 0.15
Nodes (14): IsoDateTimeStringSchema, SellpiaOrderTransmissionIntentAbortResponse, SellpiaOrderTransmissionIntentAbortResponseSchema, SellpiaOrderTransmissionIntentFinalizeResponse, SellpiaOrderTransmissionIntentFinalizeResponseSchema, SellpiaOrderTransmissionIntentKeySchema, SellpiaOrderTransmissionIntentPrepareRequest, SellpiaOrderTransmissionIntentPrepareRequestSchema (+6 more)

### Community 140 - "Community 140"
Cohesion: 0.22
Nodes (17): assertBootstrapPreflightManifest(), assertIsoTimestamp(), assertPositiveIntegerText(), assertPostgresUuid(), assertStagingAccountBaselineManifest(), assertUnique(), buildBootstrapPreflightManifest(), buildChannelAccountFingerprint() (+9 more)

### Community 141 - "Community 141"
Cohesion: 0.23
Nodes (5): Inject, ChannelCatalogCollectionPort, ChannelCatalogCollectionService, parseRequest(), Injectable

### Community 142 - "Finance schema"
Cohesion: 0.14
Nodes (16): Finance, SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.organization (+8 more)

### Community 143 - "AgentOS schema"
Cohesion: 0.15
Nodes (16): AgentRunEvent.agentInstance, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message, AgentRunEvent.organization (+8 more)

### Community 144 - "Channels schema"
Cohesion: 0.16
Nodes (16): ChannelScrapeChunk.checksum, ChannelScrapeChunk.createdAt, ChannelScrapeChunk.id, ChannelScrapeChunk.itemCount, ChannelScrapeChunk.kind, ChannelScrapeChunk.organization, ChannelScrapeChunk.payload, ChannelScrapeChunk.publicationJson (+8 more)

### Community 145 - "Channels schema"
Cohesion: 0.14
Nodes (16): CoupangWingTrackedProduct.brandName, CoupangWingTrackedProduct.categoryHierarchy, CoupangWingTrackedProduct.createdAt, CoupangWingTrackedProduct.enabled, CoupangWingTrackedProduct.id, CoupangWingTrackedProduct.imagePath, CoupangWingTrackedProduct.itemId, CoupangWingTrackedProduct.lastCapturedAt (+8 more)

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

### Community 151 - "Community 151"
Cohesion: 0.24
Nodes (14): analyzeReconstructionTriggers(), changedFilesFromGit(), ghPrBody(), git(), isCrossLayerControlChange(), isHighRiskBoundary(), isLargeServiceOrComponent(), layerOf() (+6 more)

### Community 152 - "Community 152"
Cohesion: 0.28
Nodes (10): ChannelCatalogCollectionController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+2 more)

### Community 153 - "Community 153"
Cohesion: 0.13
Nodes (6): CoupangProviderAdapter, Injectable, CoupangCreateSellerProductResponse, CoupangSellerProductPayload, OrderSheetResponse, SellerProductExternalSkuResponse

### Community 154 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 155 - "Finance schema"
Cohesion: 0.14
Nodes (15): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.id, ProcessingCost.master, ProcessingCost.notes, ProcessingCost.organization, ProcessingCost.processType, ProcessingCost.productName (+7 more)

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

### Community 161 - "Inventory schema"
Cohesion: 0.16
Nodes (15): Warehouse.address, Warehouse.code, Warehouse.createdAt, Warehouse.id, Warehouse.isDefault, Warehouse.manager, Warehouse.name, Warehouse.organization (+7 more)

### Community 162 - "Community 162"
Cohesion: 0.19
Nodes (12): SELLPIA_WORKBOOK_ACCEPT, SELLPIA_WORKBOOK_FILE_EXTENSIONS, SELLPIA_WORKBOOK_FORMAT_LABEL, SellpiaReceiptBatchCreateInput, SellpiaReceiptBatchCreateInputSchema, SellpiaReceiptBatchMarkUploadedInput, SellpiaReceiptBatchMarkUploadedInputSchema, SellpiaReceiptUploadBatch (+4 more)

### Community 163 - "Community 163"
Cohesion: 0.14
Nodes (8): CHANNELS_ROOT, REPO_ROOT, extractFunction(), extractRetireFunction(), productionWrapper, remote, repoRoot, workflow

### Community 164 - "System schema"
Cohesion: 0.15
Nodes (12): FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name, FeatureGate.updatedAt (+4 more)

### Community 165 - "Finance schema"
Cohesion: 0.15
Nodes (14): ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description, ManualLedger.id (+6 more)

### Community 166 - "Community 166"
Cohesion: 0.26
Nodes (14): asRecord(), assertNoPii(), boundedReplayScope(), buildReplayBody(), buildReplayKpis(), cloneReplayValue(), containsPiiValue(), copyString() (+6 more)

### Community 167 - "Community 167"
Cohesion: 0.25
Nodes (12): commandPull(), Lane, assertBaselineCli(), ParsedArgs, parseRawArgs(), ParseRawArgsOptions, pushValue(), requiredValue() (+4 more)

### Community 168 - "Channels schema"
Cohesion: 0.19
Nodes (13): CoupangKeywordSerpDailySnapshot.businessDate, CoupangKeywordSerpDailySnapshot.capturedAt, CoupangKeywordSerpDailySnapshot.createdAt, CoupangKeywordSerpDailySnapshot.id, CoupangKeywordSerpDailySnapshot.itemCount, CoupangKeywordSerpDailySnapshot.items, CoupangKeywordSerpDailySnapshot.keyword, CoupangKeywordSerpDailySnapshot.organization (+5 more)

### Community 169 - "Core schema"
Cohesion: 0.17
Nodes (13): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+5 more)

### Community 170 - "Channels schema"
Cohesion: 0.18
Nodes (13): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson, RocketSupplyDailySnapshot.revenueKrw (+5 more)

### Community 171 - "Community 171"
Cohesion: 0.29
Nodes (13): assertAllowedRecord(), assertAllowedRows(), assertAllowedScalarRecord(), assertObservedMetrics(), assertOptionalScalar(), assertPlainRecord(), assertReplayBundle(), assertReplayFactCounts() (+5 more)

### Community 172 - "Community 172"
Cohesion: 0.31
Nodes (11): analyzeSchemaArtifactSync(), changedFilesFromGit(), changedFilesFromWorkingTree(), GENERATED_ARTIFACT_PATHS, git(), main(), matchesAnyPath(), mergeChangedFiles() (+3 more)

### Community 173 - "Community 173"
Cohesion: 0.18
Nodes (8): ChannelAccountController, Body, Controller, CurrentOrganization, Get, UpdateCoupangAccountSettingsSchema, Patch, Roles

### Community 174 - "Community 174"
Cohesion: 0.20
Nodes (4): ChannelSyncRepositoryAdapter, reconcileProductDetailOption(), Injectable, ProductListingSyncResult

### Community 175 - "Inventory schema"
Cohesion: 0.20
Nodes (12): Inventory, CoupangShipmentDateSummary.boxes, CoupangShipmentDateSummary.capturedAt, CoupangShipmentDateSummary.count, CoupangShipmentDateSummary.createdAt, CoupangShipmentDateSummary.id, CoupangShipmentDateSummary.organization, CoupangShipmentDateSummary.shipmentDate (+4 more)

### Community 176 - "Supply schema"
Cohesion: 0.18
Nodes (12): Supply, PurchaseOrderItem.createdAt, PurchaseOrderItem.id, PurchaseOrderItem.order, PurchaseOrderItem.organization, PurchaseOrderItem.productName, PurchaseOrderItem.quantity, PurchaseOrderItem.sellpiaInventorySku (+4 more)

### Community 177 - "Channels schema"
Cohesion: 0.20
Nodes (12): CoupangKeywordTracker.createdAt, CoupangKeywordTracker.enabled, CoupangKeywordTracker.id, CoupangKeywordTracker.keyword, CoupangKeywordTracker.lastCapturedAt, CoupangKeywordTracker.maxPages, CoupangKeywordTracker.organization, CoupangKeywordTracker.updatedAt (+4 more)

### Community 178 - "Core schema"
Cohesion: 0.18
Nodes (10): MasterProductAbcFormulaState.activatedAt, MasterProductAbcFormulaState.activeFormulaVersion, MasterProductAbcFormulaState.activeFormulaVersionId, MasterProductAbcFormulaState.createdAt, MasterProductAbcFormulaState.organization, MasterProductAbcFormulaState.revision, MasterProductAbcFormulaState.updatedAt, MasterProductAbcFormulaState (+2 more)

### Community 179 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 180 - "Supply schema"
Cohesion: 0.21
Nodes (12): RocketPurchaseConfirmationAllocation.confirmationLine, RocketPurchaseConfirmationAllocation.confirmationLineId, RocketPurchaseConfirmationAllocation.createdAt, RocketPurchaseConfirmationAllocation.id, RocketPurchaseConfirmationAllocation.organization, RocketPurchaseConfirmationAllocation.quantity, RocketPurchaseConfirmationAllocation.sellpiaInventorySku, RocketPurchaseConfirmationAllocation.sellpiaInventorySkuId (+4 more)

### Community 181 - "Community 181"
Cohesion: 0.18
Nodes (3): ChannelAccountRepositoryPort, Inject, Inject

### Community 182 - "Community 182"
Cohesion: 0.18
Nodes (3): ChannelCatalogCollectionRepositoryPort, ChannelCatalogPublicationPort, Inject

### Community 183 - "System schema"
Cohesion: 0.20
Nodes (11): ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization, ActivityEvent.source (+3 more)

### Community 184 - "Core schema"
Cohesion: 0.22
Nodes (11): CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.keywords, CategoryMapping.organization, CategoryMapping.updatedAt (+3 more)

### Community 185 - "Community 185"
Cohesion: 0.20
Nodes (10): canRetryChannelListingDeletionProviderSideEffect(), canRetryProviderSideEffect(), isOperationTerminal(), OPERATION_STATUSES, OperationStatus, OperationStatusSchema, PROVIDER_OUTCOMES, ProviderOutcome (+2 more)

### Community 186 - "Community 186"
Cohesion: 0.22
Nodes (8): CoupangCategorySuggestion, CoupangCategorySuggestionRequest, CoupangCategorySuggestionRequestSchema, CoupangCategorySuggestionResponse, CoupangCategorySuggestionResponseSchema, CoupangCategorySuggestionResult, CoupangCategorySuggestionResultSchema, CoupangCategorySuggestionSchema

### Community 187 - "Community 187"
Cohesion: 0.45
Nodes (7): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), REDACTED_PLACEHOLDER, scrubDeep(), scrubSecrets(), walk()

### Community 188 - "Community 188"
Cohesion: 0.38
Nodes (9): checkTrackedClaudeDirectory(), findClaudeShimFindings(), findInstructionChainSizeFindings(), findStaleInstructionLines(), git(), listRepositoryFiles(), listTracked(), main() (+1 more)

### Community 189 - "Community 189"
Cohesion: 0.35
Nodes (9): analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), directOutPortFiles(), FORBIDDEN_IN_PORT_FOLDER_NAMES, forbiddenInPortCallerFolders(), listDirectories(), listFiles(), main() (+1 more)

### Community 190 - "Community 190"
Cohesion: 0.20
Nodes (4): Inject, ChannelAccountRepositoryAdapter, Injectable, CoupangCredentialsPort

### Community 191 - "System schema"
Cohesion: 0.24
Nodes (10): System, SystemSetting.createdAt, SystemSetting.id, SystemSetting.key, SystemSetting.organization, SystemSetting.updatedAt, SystemSetting.value, SystemSetting (+2 more)

### Community 192 - "Community 192"
Cohesion: 0.38
Nodes (8): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), main(), parseBaseline(), readFiles(), repoRoot(), walk()

### Community 193 - "Community 193"
Cohesion: 0.25
Nodes (6): ChannelAccountListController, Controller, CurrentOrganization, Get, ChannelAccountQueryService, Injectable

### Community 194 - "Community 194"
Cohesion: 0.22
Nodes (5): RocketAccountController, Controller, CurrentOrganization, Post, ChannelAccountListRow

### Community 195 - "Community 195"
Cohesion: 0.25
Nodes (5): ChannelsOperationAlertAdapter, Inject, Injectable, OperationLifecyclePatch, StartOperationAlertInput

### Community 196 - "Community 196"
Cohesion: 0.28
Nodes (6): manualMatchAliasCandidates(), aggregateRows(), sameStrings(), strongerMatchedType(), normalizeSellpiaManualMatchAlias(), SellpiaManualMatchImportResponseSchema

### Community 197 - "Channels schema"
Cohesion: 0.25
Nodes (9): Channels, CoupangRepresentativeKeywordOverride.createdAt, CoupangRepresentativeKeywordOverride.id, CoupangRepresentativeKeywordOverride.keyword, CoupangRepresentativeKeywordOverride.organization, CoupangRepresentativeKeywordOverride.updatedAt, CoupangRepresentativeKeywordOverride, coupang_representative_keyword_overrides (+1 more)

### Community 198 - "Core schema"
Cohesion: 0.25
Nodes (9): AuthSession.createdAt, AuthSession.expiresAt, AuthSession.id, AuthSession.revokedAt, AuthSession.tokenHash, AuthSession.user, AuthSession.userId, AuthSession (+1 more)

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
Cohesion: 0.29
Nodes (7): distinct(), evidenceForCode(), evidenceForNames(), normalizePhysicalBarcode(), normalizeRecipeIdentityText(), normalizeRecipeSuggestionName(), ChannelRecipeSuggestionResponseSchema

### Community 203 - "Community 203"
Cohesion: 0.46
Nodes (6): analyzeInventory(), listTopLevelScriptFiles(), main(), repoRoot(), SCRIPT_INVENTORY, SUPPORT_FILES

### Community 204 - "Community 204"
Cohesion: 0.25
Nodes (4): repoRoot, scriptPath, supportedExtensions, temporaryDirectories

### Community 205 - "Community 205"
Cohesion: 0.29
Nodes (5): deletedLegacyTables, repoRoot, retiredBaselineScript, retiredImporterFile, retiredPlannerFile

### Community 206 - "Community 206"
Cohesion: 0.33
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 207 - "Community 207"
Cohesion: 0.40
Nodes (4): RocketPoCatalogResolution, canonicalArtifactHash(), isCompleteCollection(), RocketPurchasePreviewRequestSchema

### Community 208 - "Community 208"
Cohesion: 0.40
Nodes (5): asRecord(), buildCampaignQualifiedProductTargetKeys(), cleanString(), rawCampaignAnchor(), rawProductAnchor()

### Community 209 - "Community 209"
Cohesion: 0.40
Nodes (4): channelsSchema, coreSchema, packageJson, repoRoot

### Community 212 - "Community 212"
Cohesion: 0.50
Nodes (4): is_allowlisted(), is_comment_line(), load_file_lines(), check-tenant-scope.sh script

### Community 213 - "Community 213"
Cohesion: 0.50
Nodes (4): extractEnvKeys(), readModelFile(), redactEnvText(), redactEnvValues()

### Community 214 - "Community 214"
Cohesion: 1.00
Nodes (3): makeRepository(), runRecord(), runWithChunks()

## Knowledge Gaps
- **3009 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+3004 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Core schema` to `prisma field: prisma — Shared Schema`, `prisma field: externalOptionId canonical option identity`, `prisma field: ActionTask.targetId`, `prisma field: vendorItemId provider term`, `Community 5`, `AI schema`, `Orders schema`, `Community 10`, `Core schema`, `Community 12`, `Core schema`, `AI schema`, `Channels schema`, `Core schema`, `Community 20`, `AI schema`, `Core schema`, `Community 23`, `AI schema`, `AI schema`, `Orders schema`, `Supply schema`, `AgentOS schema`, `Core schema`, `AgentOS schema`, `Advertising schema`, `Sourcing schema`, `Inventory schema`, `AI schema`, `Supply schema`, `Community 43`, `Channels schema`, `Core schema`, `AI schema`, `Sourcing schema`, `Sourcing schema`, `System schema`, `Community 53`, `Orders schema`, `AI schema`, `Sourcing schema`, `AgentOS schema`, `AgentOS schema`, `Community 66`, `Supply schema`, `Advertising schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Channels schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Finance schema`, `Community 82`, `Channels schema`, `Channels schema`, `Channels schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `System schema`, `Advertising schema`, `Channels schema`, `Orders schema`, `Sourcing schema`, `AgentOS schema`, `AI schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Core schema`, `Orders schema`, `Sourcing schema`, `AgentOS schema`, `Finance schema`, `Supply schema`, `Sourcing schema`, `AgentOS schema`, `Orders schema`, `Channels schema`, `Inventory schema`, `AgentOS schema`, `Sourcing schema`, `Sourcing schema`, `System schema`, `Channels schema`, `Inventory schema`, `Core schema`, `Finance schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Supply schema`, `Supply schema`, `Finance schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `System schema`, `Finance schema`, `Channels schema`, `Core schema`, `Channels schema`, `Inventory schema`, `Supply schema`, `Channels schema`, `Core schema`, `Supply schema`, `System schema`, `Core schema`, `System schema`, `Community 194`, `Channels schema`?**
  _High betweenness centrality (0.214) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `prisma field: vendorItemId provider term` to `prisma field: prisma — Shared Schema`, `prisma field: externalOptionId canonical option identity`, `prisma field: ActionTask.targetId`, `AI schema`, `Core schema`, `prisma field: ChannelListingOption.barcode`, `Orders schema`, `Core schema`, `Core schema`, `AI schema`, `Channels schema`, `System schema`, `Core schema`, `AI schema`, `Core schema`, `AI schema`, `AI schema`, `Orders schema`, `Supply schema`, `AgentOS schema`, `Core schema`, `AgentOS schema`, `Advertising schema`, `Sourcing schema`, `Inventory schema`, `AI schema`, `Supply schema`, `Channels schema`, `Core schema`, `AI schema`, `Sourcing schema`, `Sourcing schema`, `System schema`, `Orders schema`, `AI schema`, `Sourcing schema`, `AgentOS schema`, `AgentOS schema`, `Supply schema`, `Advertising schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Channels schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Finance schema`, `Channels schema`, `Channels schema`, `Channels schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `System schema`, `Advertising schema`, `Channels schema`, `Orders schema`, `Sourcing schema`, `AgentOS schema`, `AI schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Core schema`, `Orders schema`, `Sourcing schema`, `AgentOS schema`, `Finance schema`, `Supply schema`, `Sourcing schema`, `AgentOS schema`, `prisma field: ChannelAdTargetDailySnapshot.targetType`, `Orders schema`, `Channels schema`, `Inventory schema`, `AgentOS schema`, `Sourcing schema`, `Sourcing schema`, `System schema`, `Channels schema`, `Inventory schema`, `Core schema`, `Finance schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Supply schema`, `Supply schema`, `System schema`, `Finance schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `System schema`, `Finance schema`, `Channels schema`, `Core schema`, `Channels schema`, `Inventory schema`, `Supply schema`, `Channels schema`, `Core schema`, `System schema`, `Supply schema`, `System schema`, `Core schema`, `System schema`, `Channels schema`, `Core schema`?**
  _High betweenness centrality (0.178) - this node is a cross-community bridge._
- **Why does `Order` connect `Orders schema` to `prisma field: prisma — Shared Schema`, `Community 1`, `prisma field: externalOptionId canonical option identity`, `prisma field: ActionTask.targetId`, `prisma field: vendorItemId provider term`, `Community 5`, `Core schema`, `prisma field: ChannelListingOption.barcode`, `Community 10`, `Community 139`, `Core schema`, `Community 16`, `Community 17`, `System schema`, `Core schema`, `Community 23`, `Community 24`, `Community 26`, `AI schema`, `Community 28`, `Community 29`, `Orders schema`, `Community 31`, `Community 163`, `Supply schema`, `Community 43`, `Community 44`, `Community 172`, `Core schema`, `Community 48`, `Community 53`, `Orders schema`, `Community 59`, `Community 189`, `Community 66`, `Advertising schema`, `Channels schema`, `Community 203`, `Finance schema`, `Community 82`, `Community 209`, `Community 86`, `Community 102`, `Orders schema`, `Community 125`?**
  _High betweenness centrality (0.093) - this node is a cross-community bridge._
- **Are the 193 inferred relationships involving `Organization` (e.g. with `channel-registration-capability.adapter.spec.ts` and `channel-registration-capability.adapter.ts`) actually correct?**
  _`Organization` has 193 INFERRED edges - model-reasoned connections that need verification._
- **Are the 140 inferred relationships involving `ChannelAccount` (e.g. with `channel-registration-capability.adapter.spec.ts` and `channel-registration-capability.adapter.ts`) actually correct?**
  _`ChannelAccount` has 140 INFERRED edges - model-reasoned connections that need verification._
- **Are the 142 inferred relationships involving `Order` (e.g. with `channel-sync.controller.ts` and `dto/index.ts`) actually correct?**
  _`Order` has 142 INFERRED edges - model-reasoned connections that need verification._
- **Are the 100 inferred relationships involving `ChannelListing` (e.g. with `channel-registration-capability.adapter.ts` and `channel-listing.controller.ts`) actually correct?**
  _`ChannelListing` has 100 INFERRED edges - model-reasoned connections that need verification._