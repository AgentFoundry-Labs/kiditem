# Graph Report - schema-consumers  (2026-07-30)

## Corpus Check
- 419 files · ~222,220 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 6357 nodes · 37205 edges · 214 communities (196 shown, 18 thin omitted)
- Extraction: 31% EXTRACTED · 69% INFERRED · 0% AMBIGUOUS · INFERRED: 25739 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- prisma field: prisma — Shared Schema
- prisma field: externalOptionId canonical option identity
- System schema
- Core schema
- Community 4
- Orders schema
- AgentOS schema
- Community 7
- prisma field: channels — Marketplace Sync + SKU Matching
- Core schema
- Supply schema
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- AI schema
- AgentOS schema
- AI schema
- Community 19
- Supply schema
- Channels schema
- AgentOS schema
- Core schema
- AI schema
- Community 25
- prisma field: CoupangWingTrackedProduct.vendorItemId
- Community 27
- prisma field: AdAction.listingOptionId
- AgentOS schema
- AI schema
- Community 31
- Core schema
- AI schema
- Community 34
- Community 35
- Community 36
- AgentOS schema
- Inventory schema
- Community 39
- Community 40
- Sourcing schema
- Community 42
- System schema
- prisma field: SourcingCandidate.isDeleted
- Inventory schema
- Orders schema
- AI schema
- Community 48
- Channels schema
- AI schema
- Community 51
- Sourcing schema
- Community 53
- Inventory schema
- Core schema
- AI schema
- AI schema
- Channels schema
- Sourcing schema
- Community 60
- Community 61
- Core schema
- Community 63
- Community 64
- AgentOS schema
- Community 66
- Orders schema
- Inventory schema
- Supply schema
- Community 70
- Community 71
- Channels schema
- Channels schema
- Community 74
- Community 75
- Community 76
- Community 77
- AgentOS schema
- Inventory schema
- Community 80
- Channels schema
- Channels schema
- Channels schema
- Community 84
- Community 85
- Channels schema
- Inventory schema
- Inventory schema
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Channels schema
- Community 95
- Community 96
- AI schema
- Community 98
- Community 99
- Community 100
- Community 101
- Advertising schema
- Supply schema
- Sourcing schema
- Community 105
- AgentOS schema
- AI schema
- System schema
- Channels schema
- Sourcing schema
- Orders schema
- Sourcing schema
- Community 113
- Community 114
- Finance schema
- Channels schema
- Sourcing schema
- Community 118
- Community 119
- Community 120
- Inventory schema
- Community 122
- Community 123
- Community 124
- Community 125
- Community 126
- Community 127
- Sourcing schema
- Sourcing schema
- Channels schema
- Channels schema
- Community 132
- AgentOS schema
- Community 134
- Channels schema
- Advertising schema
- Supply schema
- Community 138
- Community 139
- Orders schema
- System schema
- Core schema
- Sourcing schema
- Finance schema
- Finance schema
- Channels schema
- Inventory schema
- Community 148
- Finance schema
- Advertising schema
- System schema
- Finance schema
- Community 153
- Channels schema
- Core schema
- Channels schema
- Community 157
- Community 158
- Channels schema
- Core schema
- System schema
- Supply schema
- Community 163
- Advertising schema
- Sourcing schema
- System schema
- Core schema
- Inventory schema
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
- Advertising schema
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
- Community 206
- Community 207
- Community 208
- Community 209
- Community 210

## God Nodes (most connected - your core abstractions)
1. `Organization` - 463 edges
2. `Database ERD` - 377 edges
3. `ChannelAccount` - 204 edges
4. `ChannelListing` - 195 edges
5. `Order` - 189 edges
6. `ProductPreparation.organizationId` - 181 edges
7. `ContentWorkspace.organizationId` - 180 edges
8. `ChannelListing.organizationId` - 177 edges
9. `ProductRegistrationExecution.organizationId` - 176 edges
10. `ChannelAdTargetDailySnapshot.organizationId` - 175 edges
11. `SourceImportRun.organizationId` - 175 edges
12. `ContentWorkspaceThumbnailSelection.organizationId` - 174 edges

## Surprising Connections (you probably didn't know these)
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
- `Database ERD` --mentions_field--> `AdAction.listingOptionId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_model--> `ScrapeTarget`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma

## Import Cycles
- None detected.

## Communities (214 total, 18 thin omitted)

### Community 0 - "prisma field: prisma — Shared Schema"
Cohesion: 0.14
Nodes (286): UploadedWorkbookFile, HEADERS, USER, CHANNEL_ACCOUNT_LIST_SELECT, chunkSelect, ErrorInput, LockedRun, OwnedRunInput (+278 more)

### Community 1 - "prisma field: externalOptionId canonical option identity"
Cohesion: 0.07
Nodes (105): CanonicalParent, ClaimInput, LockedRunRow, TRANSACTION_OPTIONS, UpsertInput, LockedChunk, LockedCollectionRun, PublishChunkInput (+97 more)

### Community 2 - "System schema"
Cohesion: 0.03
Nodes (94): Database ERD, ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.date, ActionTask.detail (+86 more)

### Community 3 - "Core schema"
Cohesion: 0.03
Nodes (95): ChannelRecipeAutomationProductTopology, classifyRecipeAutomationProductGroups(), groupDecision(), autoItem, configuredItem, reviewItem, ChannelListing.masterProductId, ChannelListingOption.attributesJson (+87 more)

### Community 4 - "Community 4"
Cohesion: 0.02
Nodes (101): AgentApprovalRequestSummary, AgentApprovalRequestSummarySchema, AgentApprovalStatus, AgentApprovalStatusSchema, AgentArtifactHandoffSummary, AgentArtifactHandoffSummarySchema, AgentArtifactStatus, AgentArtifactStatusSchema (+93 more)

### Community 5 - "Orders schema"
Cohesion: 0.03
Nodes (77): Orders, OrderLineItem.createdAt, OrderLineItem.externalBarcode, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.listingOptionId, OrderLineItem.metadata (+69 more)

### Community 6 - "AgentOS schema"
Cohesion: 0.03
Nodes (79): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+71 more)

### Community 7 - "Community 7"
Cohesion: 0.03
Nodes (77): AdMetricsDetail, AdMetricsDetailSchema, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary, DashboardAdSummarySchema (+69 more)

### Community 8 - "prisma field: channels — Marketplace Sync + SKU Matching"
Cohesion: 0.05
Nodes (48): buildCoupangWingSnapshotCoverage(), CoupangWingSnapshotCoverage, ParsedWingCatalogRow, ParsedWingCatalogSkippedRow, PARENT_COLUMN_INDEXES, REQUIRED_HEADERS, workbookBuffer(), WorkbookOptions (+40 more)

### Community 9 - "Core schema"
Cohesion: 0.04
Nodes (40): Organization.createdAt, Organization.id, Organization.name, Organization.slug, Organization.updatedAt, Organization, DATA_MIGRATION_RELEASES, DataMigration (+32 more)

### Community 10 - "Supply schema"
Cohesion: 0.03
Nodes (73): Supply, PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId (+65 more)

### Community 11 - "Community 11"
Cohesion: 0.03
Nodes (70): CreateMasterProductInput, CreateMasterProductInputSchema, CreateProductVariantFieldsSchema, CreateProductVariantInput, CreateProductVariantInputSchema, CreateProductVariantRecipeIfEmptySchema, CreateProductVariantRecipesIfEmptyInput, CreateProductVariantRecipesIfEmptyInputSchema (+62 more)

### Community 12 - "Community 12"
Cohesion: 0.07
Nodes (70): option(), AdapterCommand, appendFlag(), appendOption(), appendProjectReferenceDefaults(), appendValues(), archiveFileName(), archiveShaFileName() (+62 more)

### Community 13 - "Community 13"
Cohesion: 0.05
Nodes (65): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignReportScope, AdCampaignReportScopeSchema (+57 more)

### Community 14 - "Community 14"
Cohesion: 0.05
Nodes (63): ActionTask, ActionTaskExecuteResponse, ActionTaskList, ActionTaskListSchema, ActionTaskRelatedProduct, ActionTaskRelatedProductSchema, ActionTaskSchema, ActionTaskSourceAlert (+55 more)

### Community 15 - "Community 15"
Cohesion: 0.06
Nodes (59): distinct(), evidenceForCode(), evidenceForNames(), normalizePhysicalBarcode(), item(), bigrams(), ChannelRecipeNameEvidence, ChannelRecipeNameIndex (+51 more)

### Community 16 - "AI schema"
Cohesion: 0.04
Nodes (63): ContentAsset.originGenerationGroupId, ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.editedHtmlSavedAt (+55 more)

### Community 17 - "AgentOS schema"
Cohesion: 0.04
Nodes (62): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+54 more)

### Community 18 - "AI schema"
Cohesion: 0.04
Nodes (59): ProductPreparation.selectedThumbnailGenerationId, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.contentWorkspaceId, ThumbnailGeneration.createdAt, ThumbnailGeneration.deletedAt, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.errorMessage (+51 more)

### Community 19 - "Community 19"
Cohesion: 0.05
Nodes (45): ChannelCatalogImportController, Controller, Inject, ChannelSkuAvailabilityController, Controller, ChannelRecipeAutomationContextRepositoryAdapter, recipeSource(), Injectable (+37 more)

### Community 20 - "Supply schema"
Cohesion: 0.05
Nodes (53): ProcessingCost.masterId, PurchaseOrder.supplierId, Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.id, Supplier.leadTimeDays (+45 more)

### Community 21 - "Channels schema"
Cohesion: 0.04
Nodes (55): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+47 more)

### Community 22 - "AgentOS schema"
Cohesion: 0.04
Nodes (54): AgentOS, AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.agentInstanceId, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy (+46 more)

### Community 23 - "Core schema"
Cohesion: 0.05
Nodes (52): ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id, ChannelAccount.isPrimary, ChannelAccount.name, ChannelAccount.organization (+44 more)

### Community 24 - "AI schema"
Cohesion: 0.05
Nodes (52): ContentGeneration.contentWorkspaceId, ContentWorkspace.channelListing, ContentWorkspace.channelListingId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.createdByUserId, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageRevision (+44 more)

### Community 25 - "Community 25"
Cohesion: 0.04
Nodes (51): deriveSellpiaInventoryFreshness(), FixedSellpiaAccountKeySchema, FixedSellpiaOriginSchema, IsoDateTimeStringSchema, SELLPIA_INVENTORY_FRESHNESS_STATUSES, SELLPIA_INVENTORY_REFRESH_REASONS, SellpiaFreshnessDerivationInput, SellpiaInventoryActiveSyncViewSchema (+43 more)

### Community 26 - "prisma field: CoupangWingTrackedProduct.vendorItemId"
Cohesion: 0.04
Nodes (47): CoupangWingTrackedProduct.vendorItemId, ChunkRequestBaseSchema, CoupangCatalogAttributeV1, CoupangCatalogAttributeV1Schema, CoupangCatalogBrowserCommand, CoupangCatalogBrowserCommandSchema, CoupangCatalogBrowserStatus, CoupangCatalogBrowserStatusSchema (+39 more)

### Community 27 - "Community 27"
Cohesion: 0.09
Nodes (46): apiHeaders(), apiUrl(), Args, assertSafeDatasetId(), assertSupportedReplayPayloads(), BundleManifest, BundlePayload, BundleReference (+38 more)

### Community 28 - "prisma field: AdAction.listingOptionId"
Cohesion: 0.09
Nodes (43): AdAction.listingOptionId, ChannelAdTargetDailySnapshot.listingOptionId, ChannelListingOptionDailySnapshot.listingOptionId, ChannelScrapeSnapshot.listingOptionId, CoupangKeywordRankDailySnapshot.vendorItemId, CoupangWingSalesRankDailySnapshot.vendorItemId, CSRecord.orderId, OrderReturn.orderId (+35 more)

### Community 29 - "AgentOS schema"
Cohesion: 0.04
Nodes (51): AgentArtifact.agentInstance, AgentArtifact.agentInstanceId, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization (+43 more)

### Community 30 - "AI schema"
Cohesion: 0.04
Nodes (51): DetailPageImageArtifact.byteLength, DetailPageImageArtifact.contentType, DetailPageImageArtifact.createdAt, DetailPageImageArtifact.createdBy, DetailPageImageArtifact.createdByUserId, DetailPageImageArtifact.id, DetailPageImageArtifact.imageUrl, DetailPageImageArtifact.objectKey (+43 more)

### Community 31 - "Community 31"
Cohesion: 0.10
Nodes (49): assertNoLocalAuthSecrets(), assertNonProductionTarget(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged(), assertSha256(), BaselineManifest, BaselineManifestExpectation, baselineObjectKeys (+41 more)

### Community 32 - "Core schema"
Cohesion: 0.05
Nodes (44): Core, AuthSession.createdAt, AuthSession.expiresAt, AuthSession.id, AuthSession.revokedAt, AuthSession.tokenHash, AuthSession.user, AuthSession.userId (+36 more)

### Community 33 - "AI schema"
Cohesion: 0.05
Nodes (46): ContentGeneration.detailPageArtifactId, ContentWorkspace.currentDetailPageArtifactId, ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.contentWorkspaceId, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.createdByUserId (+38 more)

### Community 34 - "Community 34"
Cohesion: 0.10
Nodes (47): DATA_MIGRATION_IDS, dataMigrations, DataMigrationContext, DataMigrationTarget, MigrationResult, appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertBaselineBinding() (+39 more)

### Community 35 - "Community 35"
Cohesion: 0.04
Nodes (46): boundedText(), isoDay, isRocketWorkbookBlockingReason(), requiredText(), ROCKET_SHORTAGE_REASONS, RocketPoCatalogPublication, RocketPoCatalogPublicationSchema, RocketPoCatalogRow (+38 more)

### Community 36 - "Community 36"
Cohesion: 0.05
Nodes (38): ChannelAccountListItem, ChannelAccountListItemSchema, CoupangAccountSettings, CoupangAccountSettingsSchema, UpdateCoupangAccountSettings, ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow (+30 more)

### Community 37 - "AgentOS schema"
Cohesion: 0.05
Nodes (44): AgentInstance.adapterConfig, AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.icon, AgentInstance.id, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name (+36 more)

### Community 38 - "Inventory schema"
Cohesion: 0.05
Nodes (42): SellpiaInventorySku.code, SellpiaInventorySku.createdAt, SellpiaInventorySku.currentStock, SellpiaInventorySku.id, SellpiaInventorySku.lastImportRun, SellpiaInventorySku.lastImportRunId, SellpiaInventorySku.name, SellpiaInventorySku.optionName (+34 more)

### Community 39 - "Community 39"
Cohesion: 0.09
Nodes (39): applyCacheControl(), ApplyResult, applyS3CacheControl(), applySupabaseCacheControl(), assertApplyAllowed(), buildCopyObjectInput(), CliArgs, CliConfig (+31 more)

### Community 40 - "Community 40"
Cohesion: 0.08
Nodes (21): ChannelSyncController, Body, Controller, CurrentOrganization, CurrentUser, Get, Post, OperationAlertPort (+13 more)

### Community 41 - "Sourcing schema"
Cohesion: 0.05
Nodes (41): CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id, CandidateImage.isPrimary (+33 more)

### Community 42 - "Community 42"
Cohesion: 0.05
Nodes (40): ACCOUNT_AD_DAILY_DIGEST_KEYS, AD_ROW_KEYS, AD_SUMMARY_KEYS, ADS_DAILY_ROW_KEYS, ADS_KPI_KEYS, assertExactCount(), assertReadyCounts(), assertRebuildImportPrerequisites() (+32 more)

### Community 43 - "System schema"
Cohesion: 0.05
Nodes (34): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon, Marketplace.id (+26 more)

### Community 44 - "prisma field: SourcingCandidate.isDeleted"
Cohesion: 0.11
Nodes (28): aggregateMappingStatus(), assertLockedListing(), assertOperationActor(), ChannelListingRepositoryAdapter, contains(), firstPrice(), isUniqueViolation(), ListingRow (+20 more)

### Community 45 - "Inventory schema"
Cohesion: 0.06
Nodes (39): InventoryCommitment.businessKey, InventoryCommitment.createdAt, InventoryCommitment.createdBy, InventoryCommitment.creator, InventoryCommitment.id, InventoryCommitment.inventoryGeneration, InventoryCommitment.kind, InventoryCommitment.organization (+31 more)

### Community 46 - "Orders schema"
Cohesion: 0.06
Nodes (39): OrderReturn.channelAccount, OrderReturn.channelAccountId, OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.id (+31 more)

### Community 47 - "AI schema"
Cohesion: 0.06
Nodes (39): ProductPreparation.approvedAt, ProductPreparation.approvedByUser, ProductPreparation.channelAccount, ProductPreparation.channelAccountId, ProductPreparation.channelListing, ProductPreparation.channelListingId, ProductPreparation.createdAt, ProductPreparation.createdByUser (+31 more)

### Community 48 - "Community 48"
Cohesion: 0.06
Nodes (12): CoupangProviderAdapter, Inject, Injectable, CoupangProviderPort, OrderSheetResponse, SellerProductExternalSkuResponse, CoupangCredentialsPort, ChannelSyncRepositoryPort (+4 more)

### Community 49 - "Channels schema"
Cohesion: 0.06
Nodes (38): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignIdentity, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel (+30 more)

### Community 50 - "AI schema"
Cohesion: 0.06
Nodes (38): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+30 more)

### Community 51 - "Community 51"
Cohesion: 0.08
Nodes (32): CHANNEL_LISTING_SORTS, CHANNEL_LISTING_TABS, ChannelListingDeletionDto, ChannelListingDeletionUnresolvedDto, ChannelListingQueryDto, IsIn, IsOptional, IsString (+24 more)

### Community 52 - "Sourcing schema"
Cohesion: 0.06
Nodes (33): ContentGeneration.sourceCandidateId, SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.id, SourcingCandidate.imageUrl (+25 more)

### Community 53 - "Community 53"
Cohesion: 0.06
Nodes (32): ChannelMatchCandidateReason, ChannelMatchCandidateReasonSchema, ChannelMatchEvidence, ChannelMatchEvidenceSchema, ChannelMatchingAccount, ChannelMatchingAccountSchema, ChannelOptionMatchingQueueRow, ChannelOptionMatchingQueueRowSchema (+24 more)

### Community 54 - "Inventory schema"
Cohesion: 0.07
Nodes (36): packages/shared — @kiditem/shared, AI, Inventory, StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.fromWarehouseId, StockTransfer.id (+28 more)

### Community 55 - "Core schema"
Cohesion: 0.08
Nodes (35): ChannelListing.lastImportRunId, ChannelListingOption.lastImportRunId, Order.sourceImportRunId, SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.createdAt, SourceImportRun.createdBy (+27 more)

### Community 56 - "AI schema"
Cohesion: 0.07
Nodes (35): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height (+27 more)

### Community 57 - "AI schema"
Cohesion: 0.07
Nodes (35): ContentWorkspaceThumbnailSelection.contentAsset, ContentWorkspaceThumbnailSelection.contentAssetId, ContentWorkspaceThumbnailSelection.contentWorkspace, ContentWorkspaceThumbnailSelection.contentWorkspaceId, ContentWorkspaceThumbnailSelection.createdAt, ContentWorkspaceThumbnailSelection.createdByUser, ContentWorkspaceThumbnailSelection.createdByUserId, ContentWorkspaceThumbnailSelection.id (+27 more)

### Community 58 - "Channels schema"
Cohesion: 0.07
Nodes (35): CoupangWingTrackedProduct.brandName, CoupangWingTrackedProduct.categoryHierarchy, CoupangWingTrackedProduct.createdAt, CoupangWingTrackedProduct.enabled, CoupangWingTrackedProduct.id, CoupangWingTrackedProduct.imagePath, CoupangWingTrackedProduct.itemId, CoupangWingTrackedProduct.lastCapturedAt (+27 more)

### Community 59 - "Sourcing schema"
Cohesion: 0.07
Nodes (35): ProductRegistrationExecution.channelAccount, ProductRegistrationExecution.channelAccountId, ProductRegistrationExecution.channelListing, ProductRegistrationExecution.channelListingId, ProductRegistrationExecution.completedAt, ProductRegistrationExecution.createdAt, ProductRegistrationExecution.executionKind, ProductRegistrationExecution.expectedProviderAccountId (+27 more)

### Community 60 - "Community 60"
Cohesion: 0.11
Nodes (32): CurrentOrganization, CurrentUser, Param, Post, cellText(), collectParentMetadataConflicts(), decodeWorksheetRange(), expandMergedParentCells() (+24 more)

### Community 61 - "Community 61"
Cohesion: 0.07
Nodes (25): applyProductLinksInBatches(), applyVariantLinksInBatches(), buildCatalogProductProvisioningListings(), publishCatalogOperationalProducts(), unique(), validateProvisionedLinks(), nextPublicationSequence(), productsFromRows() (+17 more)

### Community 62 - "Core schema"
Cohesion: 0.06
Nodes (32): ProductVariantComponent.confirmedAt, ProductVariantComponent.confirmedBy, ProductVariantComponent.createdAt, ProductVariantComponent.id, ProductVariantComponent.organization, ProductVariantComponent.productVariant, ProductVariantComponent.productVariantId, ProductVariantComponent.quantity (+24 more)

### Community 63 - "Community 63"
Cohesion: 0.09
Nodes (31): ClientRenderArtifactSchema, ClientRenderContentTypeSchema, ClientRenderDateSchema, ClientRenderOutputWidthSchema, ClientRenderUuidSchema, ClientRenderVariantSchema, DETAIL_IMAGE_COUNTS, DETAIL_PAGE_AGE_GROUPS (+23 more)

### Community 64 - "Community 64"
Cohesion: 0.09
Nodes (16): ChannelRegistrationCapabilityAdapter, Injectable, ChannelsMarketplaceRegistrationCapabilityPort, ProductRegistrationSubmissionCapabilityInput, ResolveProductRegistrationCapabilityInput, asRecord(), extractNestedSellerProductId(), isExplicitProviderRejection() (+8 more)

### Community 65 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.startedAt, WorkflowRun.status (+25 more)

### Community 66 - "Community 66"
Cohesion: 0.07
Nodes (31): DeliveryCompany, DeliveryCompanySchema, Order, OrderActionResponse, OrderActionResponseSchema, OrderLineItem, OrderLineItemSchema, OrderListItem (+23 more)

### Community 67 - "Orders schema"
Cohesion: 0.07
Nodes (29): Order.channelAccount, Order.channelAccountId, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id (+21 more)

### Community 68 - "Inventory schema"
Cohesion: 0.07
Nodes (32): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.organization, PickingItem.pickedAt, PickingItem.pickingList (+24 more)

### Community 69 - "Supply schema"
Cohesion: 0.07
Nodes (32): RocketPurchaseConfirmation.artifactBytes, RocketPurchaseConfirmation.artifactContentType, RocketPurchaseConfirmation.artifactFileName, RocketPurchaseConfirmation.artifactSha256, RocketPurchaseConfirmation.artifactStoredAt, RocketPurchaseConfirmation.channelAccount, RocketPurchaseConfirmation.channelAccountId, RocketPurchaseConfirmation.completedAt (+24 more)

### Community 70 - "Community 70"
Cohesion: 0.08
Nodes (28): SellpiaInventoryGenerationSchema, SellpiaInventoryQualityReportSchema, SellpiaInventoryRefreshReasonSchema, CompletedSourceArtifactRun, CoupangWingCatalogImportResponse, CoupangWingCatalogImportResponseSchema, ImportChanges, SellpiaInventoryBrowserSnapshot (+20 more)

### Community 71 - "Community 71"
Cohesion: 0.08
Nodes (12): Inject, ChannelProductMatchingRepositoryAdapter, lockChannelListing(), Injectable, ChannelSkuAvailabilityPort, ChannelProductMatchingRepositoryPort, Inject, ChannelSkuAvailabilityService (+4 more)

### Community 72 - "Channels schema"
Cohesion: 0.08
Nodes (31): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.channelAccount, ChannelScrapeRun.channelAccountId, ChannelScrapeRun.clientRunKey, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson (+23 more)

### Community 73 - "Channels schema"
Cohesion: 0.07
Nodes (31): RocketPoCatalogLine.businessDateBasis, RocketPoCatalogLine.center, RocketPoCatalogLine.createdAt, RocketPoCatalogLine.hasConfirmation, RocketPoCatalogLine.id, RocketPoCatalogLine.inboundType, RocketPoCatalogLine.orderQty, RocketPoCatalogLine.organization (+23 more)

### Community 74 - "Community 74"
Cohesion: 0.17
Nodes (30): assertProtectedApiDestination(), assertReplayCounts(), assertReplayFactDigest(), assertSharedDatabaseIdentity(), assertSharedRebuildGuard(), assertUuid(), bootstrap(), bootstrapPlanFromCli() (+22 more)

### Community 75 - "Community 75"
Cohesion: 0.14
Nodes (14): ChannelListingController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+6 more)

### Community 76 - "Community 76"
Cohesion: 0.13
Nodes (14): ChannelProductMatchingController, Body, Controller, CurrentOrganization, Get, Param, Post, Put (+6 more)

### Community 77 - "Community 77"
Cohesion: 0.08
Nodes (19): RocketPoCatalogPort, RocketPoCatalogResolution, automationReason(), ChannelRecipeAutomationService, countDecision(), emptyScopedResult(), proposalVersion(), requiredSuggestion() (+11 more)

### Community 78 - "AgentOS schema"
Cohesion: 0.07
Nodes (29): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.agentInstanceId, AgentApprovalRequest.approver, AgentApprovalRequest.approverUserId, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy (+21 more)

### Community 79 - "Inventory schema"
Cohesion: 0.09
Nodes (26): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.sourceRef, SellpiaReceiptUploadBatch.sourceType (+18 more)

### Community 80 - "Community 80"
Cohesion: 0.09
Nodes (29): ChannelProductMatchingQueueResponseSchema, InventorySkuSnapshotListResponseSchema, CreateProductVariantRecipesIfEmptyResponseSchema, PlanProductVariantRecipesIfEmptyResponseSchema, artifact(), ApiClient, assertPartition(), assertPrivateOutputPath() (+21 more)

### Community 81 - "Channels schema"
Cohesion: 0.08
Nodes (26): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.channelAccount, ChannelAccountDailyKpiSnapshot.channelAccountId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+18 more)

### Community 82 - "Channels schema"
Cohesion: 0.08
Nodes (26): ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.id, ChannelScrapeSnapshot.listing, ChannelScrapeSnapshot.listingOption (+18 more)

### Community 83 - "Channels schema"
Cohesion: 0.08
Nodes (28): ChannelListingDeletionOperation.authorizationExpiresAt, ChannelListingDeletionOperation.channelAccount, ChannelListingDeletionOperation.channelAccountId, ChannelListingDeletionOperation.channelListing, ChannelListingDeletionOperation.channelListingId, ChannelListingDeletionOperation.completedAt, ChannelListingDeletionOperation.createdAt, ChannelListingDeletionOperation.expectedProviderAccountId (+20 more)

### Community 84 - "Community 84"
Cohesion: 0.09
Nodes (22): adapterPaths, BROWSER_COLLECTION_ATTENTION_REASONS, BROWSER_COLLECTION_PRODUCERS, BROWSER_COLLECTION_STATES, BrowserCollectionAttentionReasonSchema, BrowserCollectionClassificationSchema, BrowserCollectionCommand, BrowserCollectionCommandSchema (+14 more)

### Community 85 - "Community 85"
Cohesion: 0.14
Nodes (27): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+19 more)

### Community 86 - "Channels schema"
Cohesion: 0.08
Nodes (27): CoupangWingSalesRankDailySnapshot.businessDate, CoupangWingSalesRankDailySnapshot.capturedAt, CoupangWingSalesRankDailySnapshot.categoryHierarchy, CoupangWingSalesRankDailySnapshot.collectedCount, CoupangWingSalesRankDailySnapshot.conversionRate28d, CoupangWingSalesRankDailySnapshot.createdAt, CoupangWingSalesRankDailySnapshot.id, CoupangWingSalesRankDailySnapshot.itemId (+19 more)

### Community 87 - "Inventory schema"
Cohesion: 0.07
Nodes (27): SellpiaInventoryState.activeGeneration, SellpiaInventoryState.activeSyncLeaseExpiresAt, SellpiaInventoryState.activeSyncOwner, SellpiaInventoryState.activeSyncOwnerUserId, SellpiaInventoryState.activeSyncStartedAt, SellpiaInventoryState.activeSyncToken, SellpiaInventoryState.createdAt, SellpiaInventoryState.failedGeneration (+19 more)

### Community 88 - "Inventory schema"
Cohesion: 0.09
Nodes (27): SellpiaOrderTransmissionIntent.abortedAt, SellpiaOrderTransmissionIntent.createdAt, SellpiaOrderTransmissionIntent.createdBy, SellpiaOrderTransmissionIntent.creator, SellpiaOrderTransmissionIntent.finalizedAt, SellpiaOrderTransmissionIntent.finalizedGeneration, SellpiaOrderTransmissionIntent.id, SellpiaOrderTransmissionIntent.intentKey (+19 more)

### Community 89 - "Community 89"
Cohesion: 0.12
Nodes (23): AdCampaignAccountProjection, AdCampaignDailyRepairPlan, AdCampaignListingProjection, AdCampaignRepairRunInput, AdCampaignRepairSnapshotInput, AdCampaignTargetProjection, AdMetrics, asRecord() (+15 more)

### Community 90 - "Community 90"
Cohesion: 0.08
Nodes (23): StatisticsCategoryRow, StatisticsCategoryRowSchema, StatisticsDeliveryDaily, StatisticsDeliveryDailySchema, StatisticsDeliveryResponse, StatisticsDeliveryResponseSchema, StatisticsGradeRow, StatisticsGradeRowSchema (+15 more)

### Community 91 - "Community 91"
Cohesion: 0.09
Nodes (16): ChannelAccountController, Body, Controller, CurrentOrganization, Get, RocketAccountController, Controller, CurrentOrganization (+8 more)

### Community 92 - "Community 92"
Cohesion: 0.13
Nodes (16): ChannelAccountRepositoryAdapter, envelopeToJson(), maskAccessKey(), readCredentialsConfig(), stripLegacyCredentialKeys(), toJsonRecord(), toRecord(), trimToOptional() (+8 more)

### Community 93 - "Community 93"
Cohesion: 0.12
Nodes (16): lockChannelListingRow(), assertExactProductGraph(), MarketplaceRegistrationRepositoryAdapter, Injectable, upsertExactOptionLinks(), MarketplaceRegistrationRepositoryPort, asRecord(), KidItemFirstOptionLink (+8 more)

### Community 94 - "Channels schema"
Cohesion: 0.09
Nodes (25): ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isOfferWinner, ChannelListingOptionDailySnapshot.lastObservedAt, ChannelListingOptionDailySnapshot.listing (+17 more)

### Community 95 - "Community 95"
Cohesion: 0.08
Nodes (23): ChannelSkuMappingComponent, ChannelSkuMappingComponentSchema, ChannelSkuMappingCounts, ChannelSkuMappingCountsSchema, ChannelSkuMappingListItem, ChannelSkuMappingListItemSchema, ChannelSkuMappingListResponse, ChannelSkuMappingListResponseSchema (+15 more)

### Community 96 - "Community 96"
Cohesion: 0.16
Nodes (16): CoupangCredentials, coupangRequest(), CoupangRequestOptions, generateAuthorization(), approveReturn(), confirmOrderSheets(), DELIVERY_COMPANIES, getOrderSheets() (+8 more)

### Community 97 - "AI schema"
Cohesion: 0.09
Nodes (22): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt (+14 more)

### Community 98 - "Community 98"
Cohesion: 0.15
Nodes (24): assertBootstrapPreflightManifest(), assertCurrentRebuildBinding(), assertIsoTimestamp(), assertPositiveIntegerText(), assertPostgresUuid(), assertStagingAccountBaselineManifest(), assertStoredImportBinding(), assertUnique() (+16 more)

### Community 99 - "Community 99"
Cohesion: 0.20
Nodes (8): ChannelDashboardController, Controller, CurrentOrganization, Get, Query, CoupangDateRangeQueryDto, ChannelDashboardService, Injectable

### Community 100 - "Community 100"
Cohesion: 0.11
Nodes (19): upsertChannelCatalogIdentities(), assertActiveCoupangAccount(), assertCanonicalAccount(), ChannelCatalogPublicationRepositoryAdapter, completeCollectionRun(), completedCollectionResult(), flattenMedia(), jsonRecord() (+11 more)

### Community 101 - "Community 101"
Cohesion: 0.13
Nodes (12): assertCanonicalCoupangAccountIdentity(), canonicalParentRows(), ChannelCatalogImportRepositoryAdapter, importResponse(), isUniqueConstraintError(), nextPublicationSequence(), Injectable, zeroChanges() (+4 more)

### Community 102 - "Advertising schema"
Cohesion: 0.09
Nodes (23): AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+15 more)

### Community 103 - "Supply schema"
Cohesion: 0.11
Nodes (22): RocketPurchaseConfirmationLine.channelListingOption, RocketPurchaseConfirmationLine.channelListingOptionId, RocketPurchaseConfirmationLine.collectedAt, RocketPurchaseConfirmationLine.collectedOrderLineItemId, RocketPurchaseConfirmationLine.confirmation, RocketPurchaseConfirmationLine.confirmationId, RocketPurchaseConfirmationLine.confirmedQuantity, RocketPurchaseConfirmationLine.createdAt (+14 more)

### Community 104 - "Sourcing schema"
Cohesion: 0.11
Nodes (22): TiktokCreativeTrendDailySnapshot.businessDate, TiktokCreativeTrendDailySnapshot.capturedAt, TiktokCreativeTrendDailySnapshot.createdAt, TiktokCreativeTrendDailySnapshot.entityKey, TiktokCreativeTrendDailySnapshot.growthPct, TiktokCreativeTrendDailySnapshot.id, TiktokCreativeTrendDailySnapshot.industry, TiktokCreativeTrendDailySnapshot.label (+14 more)

### Community 105 - "Community 105"
Cohesion: 0.13
Nodes (21): assembleCompleteSnapshot(), assertSameManifest(), buildCollectionStatus(), countMedia(), countOptions(), derivePhase(), firstDate(), hashCatalogChunkPayload() (+13 more)

### Community 106 - "AgentOS schema"
Cohesion: 0.10
Nodes (21): AgentCostEvent.agentInstance, AgentCostEvent.agentInstanceId, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id (+13 more)

### Community 107 - "AI schema"
Cohesion: 0.11
Nodes (21): AiDirectJob.attempts, AiDirectJob.claimedAt, AiDirectJob.claimedBy, AiDirectJob.createdAt, AiDirectJob.finishedAt, AiDirectJob.id, AiDirectJob.jobType, AiDirectJob.lastErrorCode (+13 more)

### Community 108 - "System schema"
Cohesion: 0.10
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+13 more)

### Community 109 - "Channels schema"
Cohesion: 0.11
Nodes (21): CoupangKeywordRankDailySnapshot.adRank, CoupangKeywordRankDailySnapshot.businessDate, CoupangKeywordRankDailySnapshot.capturedAt, CoupangKeywordRankDailySnapshot.createdAt, CoupangKeywordRankDailySnapshot.id, CoupangKeywordRankDailySnapshot.itemId, CoupangKeywordRankDailySnapshot.keyword, CoupangKeywordRankDailySnapshot.organicRank (+13 more)

### Community 110 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): LiveCommerceBroadcastDailySnapshot.broadcasterId, LiveCommerceBroadcastDailySnapshot.broadcasterName, LiveCommerceBroadcastDailySnapshot.broadcastId, LiveCommerceBroadcastDailySnapshot.businessDate, LiveCommerceBroadcastDailySnapshot.capturedAt, LiveCommerceBroadcastDailySnapshot.coverImageUrl, LiveCommerceBroadcastDailySnapshot.createdAt, LiveCommerceBroadcastDailySnapshot.endedAt (+13 more)

### Community 111 - "Orders schema"
Cohesion: 0.10
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 112 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): ShortsTrendDailySnapshot.businessDate, ShortsTrendDailySnapshot.capturedAt, ShortsTrendDailySnapshot.channelName, ShortsTrendDailySnapshot.commentCount, ShortsTrendDailySnapshot.createdAt, ShortsTrendDailySnapshot.id, ShortsTrendDailySnapshot.keyword, ShortsTrendDailySnapshot.likeCount (+13 more)

### Community 113 - "Community 113"
Cohesion: 0.11
Nodes (9): ChannelAccountListController, Controller, CurrentOrganization, Get, ChannelAccountRepositoryPort, ChannelAccountQueryService, Inject, Injectable (+1 more)

### Community 114 - "Community 114"
Cohesion: 0.10
Nodes (7): ChannelsDeletionPasswordAdapter, Injectable, ChannelsDeletionPasswordPort, ChannelListingRepositoryPort, Inject, Optional, Inject

### Community 115 - "Finance schema"
Cohesion: 0.12
Nodes (20): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit (+12 more)

### Community 116 - "Channels schema"
Cohesion: 0.12
Nodes (20): SellpiaProductMonthlySales.buyPrice, SellpiaProductMonthlySales.capturedAt, SellpiaProductMonthlySales.createdAt, SellpiaProductMonthlySales.id, SellpiaProductMonthlySales.inAmount, SellpiaProductMonthlySales.inQty, SellpiaProductMonthlySales.optionCode, SellpiaProductMonthlySales.optionName (+12 more)

### Community 117 - "Sourcing schema"
Cohesion: 0.12
Nodes (20): Sourcing1688HotProductDailySnapshot.businessDate, Sourcing1688HotProductDailySnapshot.capturedAt, Sourcing1688HotProductDailySnapshot.createdAt, Sourcing1688HotProductDailySnapshot.id, Sourcing1688HotProductDailySnapshot.imageUrl, Sourcing1688HotProductDailySnapshot.monthlySales, Sourcing1688HotProductDailySnapshot.offerId, Sourcing1688HotProductDailySnapshot.organization (+12 more)

### Community 118 - "Community 118"
Cohesion: 0.21
Nodes (18): analyzePrReleaseContract(), changedFilesFromGit(), classifyFiles(), compareSemver(), deletedFilesFromGit(), ghPrBody(), git(), hasReleaseDecision() (+10 more)

### Community 119 - "Community 119"
Cohesion: 0.15
Nodes (18): Lane, parseArgs(), databaseUrl(), parseArgs(), ParsedArgs, parseRawArgs(), ParseRawArgsOptions, pushValue() (+10 more)

### Community 120 - "Community 120"
Cohesion: 0.14
Nodes (8): SellpiaRecipeEvidenceAdapter, toEvidenceSku(), Inject, Injectable, SellpiaRecipeEvidencePort, SellpiaRecipeEvidenceSku, ChannelRecipeSuggestionContextRepositoryPort, Inject

### Community 121 - "Inventory schema"
Cohesion: 0.12
Nodes (19): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.notes, ReturnTransfer.optionName, ReturnTransfer.organization (+11 more)

### Community 122 - "Community 122"
Cohesion: 0.15
Nodes (14): PRODUCT_LIFECYCLE_STATES, ProductLifecycleState, ProductLifecycleStateSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, MasterImageItem, MasterImageItemSchema, MasterImageRole (+6 more)

### Community 123 - "Community 123"
Cohesion: 0.16
Nodes (19): asRecord(), conversionRate(), dailyRawMetricsMatch(), dateStringMatches(), exactHeaderValues(), finiteNumber(), hasExactCoupangAdsDailyRawProvenance(), isExactWholeAccountCampaignRun() (+11 more)

### Community 124 - "Community 124"
Cohesion: 0.19
Nodes (18): assertAllowedArguments(), assertPublishableMain(), copyLoadableExtension(), createArchive(), environmentProfiles, githubReleaseCommand(), gitOutput(), gitSha() (+10 more)

### Community 125 - "Community 125"
Cohesion: 0.11
Nodes (16): CurrentOrganization, Get, Query, AVAILABILITY_STATUSES, ChannelSkuAvailabilityQueryDto, IsIn, IsInt, IsOptional (+8 more)

### Community 126 - "Community 126"
Cohesion: 0.11
Nodes (4): ChannelDashboardRepositoryAdapter, Injectable, ChannelDashboardRepositoryPort, Inject

### Community 127 - "Community 127"
Cohesion: 0.15
Nodes (13): aiProductSuggestion(), aiVariantSuggestion(), asRecord(), availabilityListingWhere(), completedCatalogRunWhere(), componentSource(), distinctStrings(), firstString() (+5 more)

### Community 128 - "Sourcing schema"
Cohesion: 0.14
Nodes (18): LiveCommerceProductDailySnapshot.broadcastId, LiveCommerceProductDailySnapshot.businessDate, LiveCommerceProductDailySnapshot.capturedAt, LiveCommerceProductDailySnapshot.createdAt, LiveCommerceProductDailySnapshot.id, LiveCommerceProductDailySnapshot.imageUrl, LiveCommerceProductDailySnapshot.organization, LiveCommerceProductDailySnapshot.priceCny (+10 more)

### Community 129 - "Sourcing schema"
Cohesion: 0.13
Nodes (18): NaverKeywordDailySnapshot.averageAdRank, NaverKeywordDailySnapshot.businessDate, NaverKeywordDailySnapshot.capturedAt, NaverKeywordDailySnapshot.competitionIndex, NaverKeywordDailySnapshot.createdAt, NaverKeywordDailySnapshot.id, NaverKeywordDailySnapshot.keyword, NaverKeywordDailySnapshot.monthlyMobileSearchCount (+10 more)

### Community 130 - "Channels schema"
Cohesion: 0.14
Nodes (18): RocketPoCatalogSnapshot.channelAccount, RocketPoCatalogSnapshot.channelAccountId, RocketPoCatalogSnapshot.collectionRunId, RocketPoCatalogSnapshot.createdAt, RocketPoCatalogSnapshot.detailPoCount, RocketPoCatalogSnapshot.id, RocketPoCatalogSnapshot.listPagesRead, RocketPoCatalogSnapshot.organization (+10 more)

### Community 131 - "Channels schema"
Cohesion: 0.12
Nodes (18): RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt, RocketPurchaseOrder.firstSkuName, RocketPurchaseOrder.id, RocketPurchaseOrder.items, RocketPurchaseOrder.orderAmount, RocketPurchaseOrder.orderedAt (+10 more)

### Community 132 - "Community 132"
Cohesion: 0.18
Nodes (8): ChannelCatalogCollectionRepositoryAdapter, isUniqueConstraintError(), ownedRunWhere(), Injectable, ChannelCatalogCollectionChunkRecord, ChannelCatalogCollectionRunRecord, ChannelCatalogCollectionWithChunks, startRun()

### Community 133 - "AgentOS schema"
Cohesion: 0.14
Nodes (17): AgentRunEvent.agentInstance, AgentRunEvent.agentInstanceId, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message (+9 more)

### Community 134 - "Community 134"
Cohesion: 0.23
Nodes (5): Inject, ChannelCatalogCollectionPort, ChannelCatalogCollectionService, parseRequest(), Injectable

### Community 135 - "Channels schema"
Cohesion: 0.16
Nodes (16): ChannelScrapeChunk.checksum, ChannelScrapeChunk.createdAt, ChannelScrapeChunk.id, ChannelScrapeChunk.itemCount, ChannelScrapeChunk.kind, ChannelScrapeChunk.organization, ChannelScrapeChunk.payload, ChannelScrapeChunk.publicationJson (+8 more)

### Community 136 - "Advertising schema"
Cohesion: 0.13
Nodes (16): ExecutionTask.action, ExecutionTask.actionId, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt, ExecutionTask.errorMessage, ExecutionTask.finishedAt (+8 more)

### Community 137 - "Supply schema"
Cohesion: 0.16
Nodes (16): RocketPurchaseConfirmationTransmission.confirmation, RocketPurchaseConfirmationTransmission.confirmationId, RocketPurchaseConfirmationTransmission.createdAt, RocketPurchaseConfirmationTransmission.id, RocketPurchaseConfirmationTransmission.intentKey, RocketPurchaseConfirmationTransmission.matchedLineCount, RocketPurchaseConfirmationTransmission.observedAt, RocketPurchaseConfirmationTransmission.organization (+8 more)

### Community 138 - "Community 138"
Cohesion: 0.24
Nodes (14): analyzeReconstructionTriggers(), changedFilesFromGit(), ghPrBody(), git(), isCrossLayerControlChange(), isHighRiskBoundary(), isLargeServiceOrComponent(), layerOf() (+6 more)

### Community 139 - "Community 139"
Cohesion: 0.28
Nodes (10): ChannelCatalogCollectionController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+2 more)

### Community 140 - "Orders schema"
Cohesion: 0.14
Nodes (15): CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing (+7 more)

### Community 141 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 142 - "Core schema"
Cohesion: 0.14
Nodes (13): MasterProductAbcPolicy.aCumulativeThreshold, MasterProductAbcPolicy.bCumulativeThreshold, MasterProductAbcPolicy.createdAt, MasterProductAbcPolicy.id, MasterProductAbcPolicy.lastCalculatedAt, MasterProductAbcPolicy.metric, MasterProductAbcPolicy.organization, MasterProductAbcPolicy.periodDays (+5 more)

### Community 143 - "Sourcing schema"
Cohesion: 0.17
Nodes (15): NaverPopularKeywordDailySnapshot.boardKey, NaverPopularKeywordDailySnapshot.boardLabel, NaverPopularKeywordDailySnapshot.businessDate, NaverPopularKeywordDailySnapshot.capturedAt, NaverPopularKeywordDailySnapshot.cid, NaverPopularKeywordDailySnapshot.createdAt, NaverPopularKeywordDailySnapshot.id, NaverPopularKeywordDailySnapshot.keyword (+7 more)

### Community 144 - "Finance schema"
Cohesion: 0.14
Nodes (15): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.id, ProcessingCost.master, ProcessingCost.notes, ProcessingCost.organization, ProcessingCost.processType, ProcessingCost.productName (+7 more)

### Community 145 - "Finance schema"
Cohesion: 0.15
Nodes (15): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.organization, SalesPlan.period (+7 more)

### Community 146 - "Channels schema"
Cohesion: 0.16
Nodes (15): SellpiaSalesDailySnapshot.businessDate, SellpiaSalesDailySnapshot.capturedAt, SellpiaSalesDailySnapshot.channelGroup, SellpiaSalesDailySnapshot.costKrw, SellpiaSalesDailySnapshot.createdAt, SellpiaSalesDailySnapshot.id, SellpiaSalesDailySnapshot.organization, SellpiaSalesDailySnapshot.qty (+7 more)

### Community 147 - "Inventory schema"
Cohesion: 0.15
Nodes (15): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items, StockAudit.matchedCount (+7 more)

### Community 148 - "Community 148"
Cohesion: 0.18
Nodes (7): ChannelSyncRepositoryAdapter, reconcileProductDetailOption(), Injectable, ProductListingSyncResult, formatKstIso(), normalizeCoupangOrderStatus(), normalizeCoupangProductStatus()

### Community 149 - "Finance schema"
Cohesion: 0.15
Nodes (14): Finance, GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.listing, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization (+6 more)

### Community 150 - "Advertising schema"
Cohesion: 0.15
Nodes (14): ExecutionTask.workerId, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentTaskRef, ExecutionWorker.currentUrl, ExecutionWorker.id, ExecutionWorker.label, ExecutionWorker.lastHeartbeatAt (+6 more)

### Community 151 - "System schema"
Cohesion: 0.15
Nodes (12): FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name, FeatureGate.updatedAt (+4 more)

### Community 152 - "Finance schema"
Cohesion: 0.15
Nodes (14): ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description, ManualLedger.id (+6 more)

### Community 153 - "Community 153"
Cohesion: 0.26
Nodes (14): asRecord(), assertNoPii(), boundedReplayScope(), buildReplayBody(), buildReplayKpis(), cloneReplayValue(), containsPiiValue(), copyString() (+6 more)

### Community 154 - "Channels schema"
Cohesion: 0.19
Nodes (13): CoupangKeywordSerpDailySnapshot.businessDate, CoupangKeywordSerpDailySnapshot.capturedAt, CoupangKeywordSerpDailySnapshot.createdAt, CoupangKeywordSerpDailySnapshot.id, CoupangKeywordSerpDailySnapshot.itemCount, CoupangKeywordSerpDailySnapshot.items, CoupangKeywordSerpDailySnapshot.keyword, CoupangKeywordSerpDailySnapshot.organization (+5 more)

### Community 155 - "Core schema"
Cohesion: 0.17
Nodes (13): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+5 more)

### Community 156 - "Channels schema"
Cohesion: 0.18
Nodes (13): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson, RocketSupplyDailySnapshot.revenueKrw (+5 more)

### Community 157 - "Community 157"
Cohesion: 0.29
Nodes (13): assertAllowedRecord(), assertAllowedRows(), assertAllowedScalarRecord(), assertObservedMetrics(), assertOptionalScalar(), assertPlainRecord(), assertReplayBundle(), assertReplayFactCounts() (+5 more)

### Community 158 - "Community 158"
Cohesion: 0.31
Nodes (11): analyzeSchemaArtifactSync(), changedFilesFromGit(), changedFilesFromWorkingTree(), GENERATED_ARTIFACT_PATHS, git(), main(), matchesAnyPath(), mergeChangedFiles() (+3 more)

### Community 159 - "Channels schema"
Cohesion: 0.20
Nodes (12): CoupangKeywordTracker.createdAt, CoupangKeywordTracker.enabled, CoupangKeywordTracker.id, CoupangKeywordTracker.keyword, CoupangKeywordTracker.lastCapturedAt, CoupangKeywordTracker.maxPages, CoupangKeywordTracker.organization, CoupangKeywordTracker.updatedAt (+4 more)

### Community 160 - "Core schema"
Cohesion: 0.18
Nodes (12): MasterProductAbcGradeHistory.calculatedAt, MasterProductAbcGradeHistory.id, MasterProductAbcGradeHistory.masterProduct, MasterProductAbcGradeHistory.masterProductId, MasterProductAbcGradeHistory.metric, MasterProductAbcGradeHistory.metricValue, MasterProductAbcGradeHistory.newGrade, MasterProductAbcGradeHistory.oldGrade (+4 more)

### Community 161 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 162 - "Supply schema"
Cohesion: 0.21
Nodes (12): RocketPurchaseConfirmationAllocation.confirmationLine, RocketPurchaseConfirmationAllocation.confirmationLineId, RocketPurchaseConfirmationAllocation.createdAt, RocketPurchaseConfirmationAllocation.id, RocketPurchaseConfirmationAllocation.organization, RocketPurchaseConfirmationAllocation.quantity, RocketPurchaseConfirmationAllocation.sellpiaInventorySku, RocketPurchaseConfirmationAllocation.sellpiaInventorySkuId (+4 more)

### Community 163 - "Community 163"
Cohesion: 0.18
Nodes (3): ChannelCatalogCollectionRepositoryPort, ChannelCatalogPublicationPort, Inject

### Community 164 - "Advertising schema"
Cohesion: 0.20
Nodes (11): Advertising, ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task (+3 more)

### Community 165 - "Sourcing schema"
Cohesion: 0.24
Nodes (11): Sourcing, SourcingWorkspaceSnapshot.businessDate, SourcingWorkspaceSnapshot.createdAt, SourcingWorkspaceSnapshot.id, SourcingWorkspaceSnapshot.organization, SourcingWorkspaceSnapshot.payload, SourcingWorkspaceSnapshot.scope, SourcingWorkspaceSnapshot.updatedAt (+3 more)

### Community 166 - "System schema"
Cohesion: 0.20
Nodes (11): ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization, ActivityEvent.source (+3 more)

### Community 167 - "Core schema"
Cohesion: 0.22
Nodes (11): CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.keywords, CategoryMapping.organization, CategoryMapping.updatedAt (+3 more)

### Community 168 - "Inventory schema"
Cohesion: 0.22
Nodes (11): CoupangShipmentDateSummary.boxes, CoupangShipmentDateSummary.capturedAt, CoupangShipmentDateSummary.count, CoupangShipmentDateSummary.createdAt, CoupangShipmentDateSummary.id, CoupangShipmentDateSummary.organization, CoupangShipmentDateSummary.shipmentDate, CoupangShipmentDateSummary.updatedAt (+3 more)

### Community 169 - "Sourcing schema"
Cohesion: 0.22
Nodes (11): TrendSeedKeyword.createdAt, TrendSeedKeyword.enabled, TrendSeedKeyword.id, TrendSeedKeyword.keyword, TrendSeedKeyword.keywordCn, TrendSeedKeyword.organization, TrendSeedKeyword.sources, TrendSeedKeyword.updatedAt (+3 more)

### Community 170 - "Community 170"
Cohesion: 0.20
Nodes (10): canRetryChannelListingDeletionProviderSideEffect(), canRetryProviderSideEffect(), isOperationTerminal(), OPERATION_STATUSES, OperationStatus, OperationStatusSchema, PROVIDER_OUTCOMES, ProviderOutcome (+2 more)

### Community 171 - "Community 171"
Cohesion: 0.22
Nodes (8): CoupangCategorySuggestion, CoupangCategorySuggestionRequest, CoupangCategorySuggestionRequestSchema, CoupangCategorySuggestionResponse, CoupangCategorySuggestionResponseSchema, CoupangCategorySuggestionResult, CoupangCategorySuggestionResultSchema, CoupangCategorySuggestionSchema

### Community 172 - "Community 172"
Cohesion: 0.38
Nodes (9): checkTrackedClaudeDirectory(), findClaudeShimFindings(), findInstructionChainSizeFindings(), findStaleInstructionLines(), git(), listRepositoryFiles(), listTracked(), main() (+1 more)

### Community 173 - "Community 173"
Cohesion: 0.35
Nodes (9): analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), directOutPortFiles(), FORBIDDEN_IN_PORT_FOLDER_NAMES, forbiddenInPortCallerFolders(), listDirectories(), listFiles(), main() (+1 more)

### Community 174 - "Channels schema"
Cohesion: 0.24
Nodes (10): Channels, CoupangRepresentativeKeywordOverride.createdAt, CoupangRepresentativeKeywordOverride.id, CoupangRepresentativeKeywordOverride.keyword, CoupangRepresentativeKeywordOverride.organization, CoupangRepresentativeKeywordOverride.updatedAt, CoupangRepresentativeKeywordOverride.vendorItemId, CoupangRepresentativeKeywordOverride (+2 more)

### Community 175 - "System schema"
Cohesion: 0.24
Nodes (10): System, SystemSetting.createdAt, SystemSetting.id, SystemSetting.key, SystemSetting.organization, SystemSetting.updatedAt, SystemSetting.value, SystemSetting (+2 more)

### Community 176 - "Community 176"
Cohesion: 0.49
Nodes (6): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), scrubDeep(), scrubSecrets(), walk()

### Community 177 - "Community 177"
Cohesion: 0.38
Nodes (8): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), main(), parseBaseline(), readFiles(), repoRoot(), walk()

### Community 178 - "Community 178"
Cohesion: 0.25
Nodes (5): ChannelsOperationAlertAdapter, Inject, Injectable, OperationLifecyclePatch, StartOperationAlertInput

### Community 179 - "Advertising schema"
Cohesion: 0.25
Nodes (9): ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.id, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.url, ScrapeTarget (+1 more)

### Community 180 - "Community 180"
Cohesion: 0.22
Nodes (7): ReadinessCheck, ReadinessCheckSchema, ReadinessCheckStatusSchema, ReadinessResponse, ReadinessResponseSchema, RebuildReadinessResponse, RebuildReadinessResponseSchema

### Community 181 - "Community 181"
Cohesion: 0.22
Nodes (9): assertLocalRebuildGuard(), assertLocalDevelopmentDatabase(), bootstrapAuthoritativeInventoryDevelopment(), buildBootstrapPlan(), LOCAL_HOSTS, main(), optionalUuid(), parseBootstrapArgs() (+1 more)

### Community 182 - "Community 182"
Cohesion: 0.31
Nodes (9): addExactHeaderEvidence(), asRecord(), CONVERSION_COUNT_HEADERS, normalizeHeader(), parseObservedCount(), recoverObservedCampaignTargetConversions(), resolveRevenueShapedCampaignTargetConversion(), roundedNumber() (+1 more)

### Community 183 - "Community 183"
Cohesion: 0.25
Nodes (6): extractFunction(), extractRetireFunction(), productionWrapper, remote, repoRoot, workflow

### Community 184 - "Community 184"
Cohesion: 0.46
Nodes (6): analyzeInventory(), listTopLevelScriptFiles(), main(), repoRoot(), SCRIPT_INVENTORY, SUPPORT_FILES

### Community 185 - "Community 185"
Cohesion: 0.25
Nodes (4): repoRoot, scriptPath, supportedExtensions, temporaryDirectories

### Community 186 - "Community 186"
Cohesion: 0.33
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 188 - "Community 188"
Cohesion: 0.40
Nodes (5): asRecord(), buildCampaignQualifiedProductTargetKeys(), cleanString(), rawCampaignAnchor(), rawProductAnchor()

### Community 189 - "Community 189"
Cohesion: 0.50
Nodes (4): fileHash(), importInput(), makeRow(), representativeRows()

### Community 192 - "Community 192"
Cohesion: 0.50
Nodes (4): is_allowlisted(), is_comment_line(), load_file_lines(), check-tenant-scope.sh script

### Community 193 - "Community 193"
Cohesion: 0.50
Nodes (4): extractEnvKeys(), readModelFile(), redactEnvText(), redactEnvValues()

### Community 194 - "Community 194"
Cohesion: 1.00
Nodes (3): makeRepository(), runRecord(), runWithChunks()

### Community 195 - "Community 195"
Cohesion: 0.67
Nodes (3): accountIdFor(), seedOrderInline(), seedReturnInline()

## Knowledge Gaps
- **2791 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+2786 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Core schema` to `prisma field: prisma — Shared Schema`, `prisma field: externalOptionId canonical option identity`, `System schema`, `Core schema`, `Community 4`, `Orders schema`, `AgentOS schema`, `Community 7`, `prisma field: channels — Marketplace Sync + SKU Matching`, `Supply schema`, `Community 12`, `AI schema`, `AgentOS schema`, `AI schema`, `Community 19`, `Supply schema`, `Channels schema`, `AgentOS schema`, `Core schema`, `AI schema`, `Community 27`, `prisma field: AdAction.listingOptionId`, `AgentOS schema`, `AI schema`, `Community 31`, `Core schema`, `AI schema`, `AgentOS schema`, `Inventory schema`, `Sourcing schema`, `Community 42`, `prisma field: SourcingCandidate.isDeleted`, `Inventory schema`, `Orders schema`, `AI schema`, `Channels schema`, `AI schema`, `Sourcing schema`, `Inventory schema`, `Core schema`, `AI schema`, `AI schema`, `Channels schema`, `Sourcing schema`, `Core schema`, `AgentOS schema`, `Community 66`, `Orders schema`, `Inventory schema`, `Supply schema`, `Channels schema`, `Channels schema`, `AgentOS schema`, `Inventory schema`, `Channels schema`, `Channels schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Community 89`, `Community 91`, `Channels schema`, `AI schema`, `Advertising schema`, `Supply schema`, `Sourcing schema`, `AgentOS schema`, `AI schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Orders schema`, `Sourcing schema`, `Finance schema`, `Channels schema`, `Sourcing schema`, `Inventory schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `Supply schema`, `Orders schema`, `Core schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Channels schema`, `Inventory schema`, `Finance schema`, `Advertising schema`, `System schema`, `Finance schema`, `Channels schema`, `Core schema`, `Channels schema`, `Channels schema`, `Core schema`, `Supply schema`, `Sourcing schema`, `System schema`, `Core schema`, `Inventory schema`, `Sourcing schema`, `Channels schema`, `System schema`, `Advertising schema`?**
  _High betweenness centrality (0.230) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `System schema` to `prisma field: prisma — Shared Schema`, `prisma field: externalOptionId canonical option identity`, `Core schema`, `Orders schema`, `AgentOS schema`, `prisma field: channels — Marketplace Sync + SKU Matching`, `Core schema`, `Supply schema`, `AI schema`, `AgentOS schema`, `AI schema`, `Supply schema`, `Channels schema`, `AgentOS schema`, `Core schema`, `AI schema`, `prisma field: CoupangWingTrackedProduct.vendorItemId`, `prisma field: AdAction.listingOptionId`, `AgentOS schema`, `AI schema`, `Core schema`, `AI schema`, `AgentOS schema`, `Inventory schema`, `Sourcing schema`, `System schema`, `prisma field: SourcingCandidate.isDeleted`, `Inventory schema`, `Orders schema`, `AI schema`, `Channels schema`, `AI schema`, `Sourcing schema`, `Inventory schema`, `Core schema`, `AI schema`, `AI schema`, `Channels schema`, `Sourcing schema`, `Core schema`, `AgentOS schema`, `Orders schema`, `Inventory schema`, `Supply schema`, `Channels schema`, `Channels schema`, `AgentOS schema`, `Inventory schema`, `Channels schema`, `Channels schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Channels schema`, `AI schema`, `Advertising schema`, `Supply schema`, `Sourcing schema`, `AgentOS schema`, `AI schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Orders schema`, `Sourcing schema`, `Finance schema`, `Channels schema`, `Sourcing schema`, `Inventory schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `Advertising schema`, `Supply schema`, `Orders schema`, `System schema`, `Core schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Channels schema`, `Inventory schema`, `Finance schema`, `Advertising schema`, `System schema`, `Finance schema`, `Channels schema`, `Core schema`, `Channels schema`, `Channels schema`, `Core schema`, `System schema`, `Supply schema`, `Advertising schema`, `Sourcing schema`, `System schema`, `Core schema`, `Inventory schema`, `Sourcing schema`, `Channels schema`, `System schema`, `Advertising schema`?**
  _High betweenness centrality (0.174) - this node is a cross-community bridge._
- **Why does `Order` connect `Orders schema` to `prisma field: prisma — Shared Schema`, `prisma field: externalOptionId canonical option identity`, `System schema`, `Community 4`, `Orders schema`, `Community 7`, `prisma field: channels — Marketplace Sync + SKU Matching`, `Core schema`, `Community 11`, `Orders schema`, `Community 13`, `Community 14`, `Community 148`, `Supply schema`, `Core schema`, `Community 25`, `prisma field: CoupangWingTrackedProduct.vendorItemId`, `Community 27`, `prisma field: AdAction.listingOptionId`, `Community 158`, `Core schema`, `AI schema`, `Community 34`, `Community 35`, `Community 36`, `Inventory schema`, `Community 39`, `Community 40`, `Community 42`, `prisma field: SourcingCandidate.isDeleted`, `Community 173`, `Orders schema`, `Community 51`, `Core schema`, `Community 184`, `Community 185`, `Community 183`, `Community 187`, `Community 66`, `Channels schema`, `Community 84`, `Community 89`, `Community 90`, `Community 93`, `Community 96`, `Orders schema`, `Community 122`, `Community 124`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Are the 194 inferred relationships involving `Organization` (e.g. with `channel-registration-capability.adapter.ts` and `channel-account.controller.ts`) actually correct?**
  _`Organization` has 194 INFERRED edges - model-reasoned connections that need verification._
- **Are the 147 inferred relationships involving `ChannelAccount` (e.g. with `channel-registration-capability.adapter.ts` and `channel-account.controller.ts`) actually correct?**
  _`ChannelAccount` has 147 INFERRED edges - model-reasoned connections that need verification._
- **Are the 106 inferred relationships involving `ChannelListing` (e.g. with `channel-registration-capability.adapter.ts` and `channel-listing.controller.ts`) actually correct?**
  _`ChannelListing` has 106 INFERRED edges - model-reasoned connections that need verification._
- **Are the 139 inferred relationships involving `Order` (e.g. with `channel-sync.controller.ts` and `dto/index.ts`) actually correct?**
  _`Order` has 139 INFERRED edges - model-reasoned connections that need verification._