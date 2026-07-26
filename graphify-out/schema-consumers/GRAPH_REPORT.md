# Graph Report - schema-consumers  (2026-07-26)

## Corpus Check
- 410 files · ~217,884 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 6298 nodes · 36990 edges · 227 communities (204 shown, 23 thin omitted)
- Extraction: 31% EXTRACTED · 69% INFERRED · 0% AMBIGUOUS · INFERRED: 25610 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- prisma field: externalOptionId canonical option identity
- Community 1
- Community 2
- System schema
- AgentOS schema
- Community 5
- Core schema
- Core schema
- Community 8
- Community 9
- Core schema
- Orders schema
- prisma field: channels — Marketplace Sync + SKU Matching
- Community 13
- AI schema
- AI schema
- Core schema
- Supply schema
- Channels schema
- Community 19
- AgentOS schema
- Community 21
- Community 22
- Community 23
- AI schema
- Core schema
- AI schema
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- AI schema
- Community 33
- Sourcing schema
- AgentOS schema
- Community 36
- Community 37
- Core schema
- Community 39
- Channels schema
- Inventory schema
- AI schema
- Community 43
- AI schema
- Core schema
- Community 46
- Community 47
- Community 48
- Community 49
- AI schema
- Community 51
- Supply schema
- Core schema
- Sourcing schema
- Sourcing schema
- AI schema
- Community 57
- AgentOS schema
- AI schema
- System schema
- Supply schema
- Community 62
- Channels schema
- Channels schema
- Community 65
- Orders schema
- Community 67
- Community 68
- Community 69
- AgentOS schema
- AgentOS schema
- Community 72
- Community 73
- Channels schema
- Channels schema
- Community 76
- Community 77
- Channels schema
- Inventory schema
- Inventory schema
- Community 81
- Supply schema
- Community 83
- Community 84
- Community 85
- Core schema
- AgentOS schema
- Channels schema
- Finance schema
- Community 90
- Community 91
- Channels schema
- Community 93
- Community 94
- System schema
- Advertising schema
- Orders schema
- Community 98
- AgentOS schema
- Channels schema
- Sourcing schema
- Community 102
- Community 103
- AgentOS schema
- AI schema
- System schema
- Sourcing schema
- Orders schema
- Orders schema
- Sourcing schema
- AI schema
- Community 112
- Community 113
- Community 114
- AgentOS schema
- Finance schema
- Channels schema
- Sourcing schema
- Community 119
- Community 120
- AgentOS schema
- Channels schema
- Supply schema
- Inventory schema
- Community 125
- Community 126
- Community 127
- Community 128
- Sourcing schema
- Sourcing schema
- Channels schema
- Channels schema
- Inventory schema
- Community 134
- Community 135
- AgentOS schema
- Channels schema
- Community 138
- Community 139
- Core schema
- Channels schema
- Advertising schema
- Inventory schema
- Inventory schema
- Supply schema
- Inventory schema
- Supply schema
- Community 148
- Community 149
- Finance schema
- Orders schema
- System schema
- Sourcing schema
- Finance schema
- Finance schema
- Inventory schema
- Channels schema
- Inventory schema
- Community 159
- Community 160
- Advertising schema
- System schema
- Community 163
- Community 164
- Community 165
- Community 166
- Channels schema
- Channels schema
- Channels schema
- Community 170
- Inventory schema
- System schema
- Community 173
- Advertising schema
- Sourcing schema
- System schema
- Supply schema
- Sourcing schema
- Community 179
- Community 180
- Community 181
- Community 182
- System schema
- Community 184
- Community 185
- Community 186
- Advertising schema
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

## God Nodes (most connected - your core abstractions)
1. `Organization` - 459 edges
2. `Database ERD` - 376 edges
3. `ChannelAccount` - 202 edges
4. `ChannelListing` - 195 edges
5. `Order` - 185 edges
6. `ProductPreparation.organizationId` - 180 edges
7. `ContentWorkspace.organizationId` - 179 edges
8. `ChannelListing.organizationId` - 176 edges
9. `ProductRegistrationExecution.organizationId` - 175 edges
10. `ChannelAdTargetDailySnapshot.organizationId` - 174 edges
11. `SourceImportRun.organizationId` - 174 edges
12. `ContentWorkspaceThumbnailSelection.organizationId` - 173 edges

## Surprising Connections (you probably didn't know these)
- `packages/shared — @kiditem/shared` --mentions_domain--> `Inventory`  [EXTRACTED]
  packages/shared/AGENTS.md → prisma/models/inventory.prisma
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

## Communities (227 total, 23 thin omitted)

### Community 0 - "prisma field: externalOptionId canonical option identity"
Cohesion: 0.11
Nodes (353): UploadedWorkbookFile, HEADERS, USER, chunkSelect, ErrorInput, LockedRun, OwnedRunInput, PutChunkInput (+345 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (134): ActionTask, ActionTaskExecuteResponse, ActionTaskList, ActionTaskListSchema, ActionTaskRelatedProduct, ActionTaskRelatedProductSchema, ActionTaskSchema, ActionTaskSourceAlert (+126 more)

### Community 2 - "Community 2"
Cohesion: 0.02
Nodes (101): AgentApprovalRequestSummary, AgentApprovalRequestSummarySchema, AgentApprovalStatus, AgentApprovalStatusSchema, AgentArtifactHandoffSummary, AgentArtifactHandoffSummarySchema, AgentArtifactStatus, AgentArtifactStatusSchema (+93 more)

### Community 3 - "System schema"
Cohesion: 0.03
Nodes (71): ActionTask.targetId, ActionTask.targetType, AdAction.targetType, AgentArtifact.targetId, Alert.actionTask, Alert.actionTaskId, Alert.actorUser, Alert.actorUserId (+63 more)

### Community 4 - "AgentOS schema"
Cohesion: 0.03
Nodes (79): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+71 more)

### Community 5 - "Community 5"
Cohesion: 0.03
Nodes (75): AdMetricsDetail, AdMetricsDetailSchema, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary, DashboardAdSummarySchema (+67 more)

### Community 6 - "Core schema"
Cohesion: 0.03
Nodes (73): AdAction.listingOptionId, ChannelAdTargetDailySnapshot.listingOptionId, ChannelListingOption.attributesJson, ChannelListingOption.commissionRate, ChannelListingOption.costPriceOverride, ChannelListingOption.createdAt, ChannelListingOption.id, ChannelListingOption.itemName (+65 more)

### Community 7 - "Core schema"
Cohesion: 0.05
Nodes (42): Organization.createdAt, Organization.id, Organization.name, Organization.slug, Organization.updatedAt, Organization, DATA_MIGRATION_IDS, DATA_MIGRATION_RELEASES (+34 more)

### Community 8 - "Community 8"
Cohesion: 0.03
Nodes (70): CreateMasterProductInput, CreateMasterProductInputSchema, CreateProductVariantFieldsSchema, CreateProductVariantInput, CreateProductVariantInputSchema, CreateProductVariantRecipeIfEmptySchema, CreateProductVariantRecipesIfEmptyInput, CreateProductVariantRecipesIfEmptyInputSchema (+62 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (68): option(), AdapterCommand, appendFlag(), appendOption(), appendProjectReferenceDefaults(), appendValues(), archiveFileName(), archiveShaFileName() (+60 more)

### Community 10 - "Core schema"
Cohesion: 0.03
Nodes (64): ContentGeneration.triggeredByUserId, InventoryCommitment.businessKey, InventoryCommitment.createdAt, InventoryCommitment.createdBy, InventoryCommitment.creator, InventoryCommitment.id, InventoryCommitment.inventoryGeneration, InventoryCommitment.kind (+56 more)

### Community 11 - "Orders schema"
Cohesion: 0.04
Nodes (66): Orders, OrderLineItem.createdAt, OrderLineItem.externalBarcode, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.listingOptionId, OrderLineItem.metadata (+58 more)

### Community 12 - "prisma field: channels — Marketplace Sync + SKU Matching"
Cohesion: 0.06
Nodes (44): PARENT_COLUMN_INDEXES, REQUIRED_HEADERS, workbookBuffer(), WorkbookOptions, ChannelProductCandidate, ChannelProductCandidateRankingInput, emptyEvidence(), keep() (+36 more)

### Community 13 - "Community 13"
Cohesion: 0.05
Nodes (47): ChannelCatalogImportController, Controller, Inject, ChannelSkuAvailabilityController, Controller, ChannelRecipeAutomationContextRepositoryAdapter, recipeSource(), Injectable (+39 more)

### Community 14 - "AI schema"
Cohesion: 0.04
Nodes (60): ProductPreparation.selectedThumbnailGenerationId, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.contentWorkspaceId, ThumbnailGeneration.createdAt, ThumbnailGeneration.deletedAt, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.errorMessage (+52 more)

### Community 15 - "AI schema"
Cohesion: 0.04
Nodes (55): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height (+47 more)

### Community 16 - "Core schema"
Cohesion: 0.04
Nodes (57): ChannelListing.brand, ChannelListing.category, ChannelListing.channelAccount, ChannelListing.channelAccountId, ChannelListing.channelName, ChannelListing.createdAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo (+49 more)

### Community 17 - "Supply schema"
Cohesion: 0.05
Nodes (53): ProcessingCost.masterId, PurchaseOrder.supplierId, Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.id, Supplier.leadTimeDays (+45 more)

### Community 18 - "Channels schema"
Cohesion: 0.04
Nodes (55): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+47 more)

### Community 19 - "Community 19"
Cohesion: 0.05
Nodes (49): InventorySkuLinkedProduct, InventorySkuLinkedProductSchema, InventorySkuLinkedVariant, InventorySkuLinkedVariantSchema, InventorySkuSnapshotItem, InventorySkuSnapshotItemSchema, InventorySkuSnapshotListResponse, InventorySkuSnapshotListResponseSchema (+41 more)

### Community 20 - "AgentOS schema"
Cohesion: 0.04
Nodes (54): AgentOS, AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.agentInstanceId, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy (+46 more)

### Community 21 - "Community 21"
Cohesion: 0.09
Nodes (47): apiHeaders(), apiUrl(), Args, assertSafeDatasetId(), assertSupportedReplayPayloads(), BundleManifest, BundlePayload, BundleReference (+39 more)

### Community 22 - "Community 22"
Cohesion: 0.04
Nodes (47): ChunkRequestBaseSchema, CoupangCatalogAttributeV1, CoupangCatalogAttributeV1Schema, CoupangCatalogBrowserCommand, CoupangCatalogBrowserCommandSchema, CoupangCatalogBrowserStatus, CoupangCatalogBrowserStatusSchema, CoupangCatalogChunkKind (+39 more)

### Community 23 - "Community 23"
Cohesion: 0.06
Nodes (27): ChannelSyncController, Body, Controller, CurrentOrganization, CurrentUser, Get, Post, ChannelSyncRepositoryAdapter (+19 more)

### Community 24 - "AI schema"
Cohesion: 0.04
Nodes (51): DetailPageImageArtifact.byteLength, DetailPageImageArtifact.contentType, DetailPageImageArtifact.createdAt, DetailPageImageArtifact.createdBy, DetailPageImageArtifact.createdByUserId, DetailPageImageArtifact.id, DetailPageImageArtifact.imageUrl, DetailPageImageArtifact.objectKey (+43 more)

### Community 25 - "Core schema"
Cohesion: 0.05
Nodes (49): ProductVariantComponent.confirmedAt, ProductVariantComponent.confirmedBy, ProductVariantComponent.createdAt, ProductVariantComponent.id, ProductVariantComponent.organization, ProductVariantComponent.productVariant, ProductVariantComponent.productVariantId, ProductVariantComponent.quantity (+41 more)

### Community 26 - "AI schema"
Cohesion: 0.05
Nodes (47): ContentGeneration.detailPageArtifactId, ContentWorkspace.currentDetailPageArtifactId, ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.contentWorkspaceId, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.createdByUserId (+39 more)

### Community 27 - "Community 27"
Cohesion: 0.10
Nodes (48): assertNonProductionTarget(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged(), assertSha256(), BaselineManifest, BaselineManifestExpectation, baselineObjectKeys, buildChecksumsFile() (+40 more)

### Community 28 - "Community 28"
Cohesion: 0.08
Nodes (45): applyCacheControl(), ApplyResult, applyS3CacheControl(), applySupabaseCacheControl(), assertApplyAllowed(), buildCopyObjectInput(), CliArgs, CliConfig (+37 more)

### Community 29 - "Community 29"
Cohesion: 0.04
Nodes (47): deriveSellpiaInventoryFreshness(), FixedSellpiaAccountKeySchema, FixedSellpiaOriginSchema, IsoDateTimeStringSchema, SELLPIA_INVENTORY_FRESHNESS_STATUSES, SELLPIA_INVENTORY_REFRESH_REASONS, SellpiaFreshnessDerivationInput, SellpiaInventoryActiveSyncViewSchema (+39 more)

### Community 30 - "Community 30"
Cohesion: 0.10
Nodes (46): DataMigrationContext, DataMigrationTarget, MigrationResult, appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertBaselineBinding(), assertBaselineCli(), assertMutatingTarget() (+38 more)

### Community 31 - "Community 31"
Cohesion: 0.05
Nodes (38): ChannelAccountListItem, ChannelAccountListItemSchema, CoupangAccountSettings, CoupangAccountSettingsSchema, UpdateCoupangAccountSettings, ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow (+30 more)

### Community 32 - "AI schema"
Cohesion: 0.05
Nodes (45): ContentAsset.originGenerationGroupId, ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.editedHtmlSavedAt (+37 more)

### Community 33 - "Community 33"
Cohesion: 0.05
Nodes (43): ACCOUNT_AD_DAILY_DIGEST_KEYS, AD_ROW_KEYS, AD_SUMMARY_KEYS, ADS_DAILY_ROW_KEYS, ADS_KPI_KEYS, assertExactCount(), assertProtectedSupabaseDestination(), assertReadyCounts() (+35 more)

### Community 34 - "Sourcing schema"
Cohesion: 0.05
Nodes (43): CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id, CandidateImage.isDeleted (+35 more)

### Community 35 - "AgentOS schema"
Cohesion: 0.05
Nodes (42): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+34 more)

### Community 36 - "Community 36"
Cohesion: 0.05
Nodes (39): boundedText(), isoDay, isRocketWorkbookBlockingReason(), requiredText(), ROCKET_SHORTAGE_REASONS, RocketPoCatalogPublication, RocketPoCatalogPublicationSchema, RocketPoCatalogRow (+31 more)

### Community 37 - "Community 37"
Cohesion: 0.06
Nodes (33): ChannelMatchCandidateReason, ChannelMatchCandidateReasonSchema, ChannelMatchEvidence, ChannelMatchEvidenceSchema, ChannelMatchingAccount, ChannelMatchingAccountSchema, ChannelOptionMatchingQueueRow, ChannelOptionMatchingQueueRowSchema (+25 more)

### Community 38 - "Core schema"
Cohesion: 0.06
Nodes (38): Core, CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.keywords, CategoryMapping.organization (+30 more)

### Community 39 - "Community 39"
Cohesion: 0.07
Nodes (32): CHANNEL_LISTING_SORTS, CHANNEL_LISTING_TABS, ChannelListingDeletionDto, ChannelListingDeletionUnresolvedDto, ChannelListingQueryDto, IsIn, IsOptional, IsString (+24 more)

### Community 40 - "Channels schema"
Cohesion: 0.06
Nodes (39): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignIdentity, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel (+31 more)

### Community 41 - "Inventory schema"
Cohesion: 0.06
Nodes (37): InventoryCommitmentAllocation.commitment, InventoryCommitmentAllocation.commitmentId, InventoryCommitmentAllocation.createdAt, InventoryCommitmentAllocation.id, InventoryCommitmentAllocation.organization, InventoryCommitmentAllocation.quantity, InventoryCommitmentAllocation.sellpiaInventorySku, InventoryCommitmentAllocation.sellpiaInventorySkuId (+29 more)

### Community 42 - "AI schema"
Cohesion: 0.06
Nodes (39): ProductPreparation.approvedAt, ProductPreparation.approvedByUser, ProductPreparation.channelAccount, ProductPreparation.channelAccountId, ProductPreparation.channelListing, ProductPreparation.createdAt, ProductPreparation.createdByUser, ProductPreparation.deletedAt (+31 more)

### Community 43 - "Community 43"
Cohesion: 0.08
Nodes (26): aggregateMappingStatus(), assertLockedListing(), assertOperationActor(), ChannelListingRepositoryAdapter, contains(), firstPrice(), isUniqueViolation(), lockDeletionOperation() (+18 more)

### Community 44 - "AI schema"
Cohesion: 0.06
Nodes (38): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+30 more)

### Community 45 - "Core schema"
Cohesion: 0.06
Nodes (37): ChannelListing.masterProductId, MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.adTier, MasterProduct.brand, MasterProduct.category, MasterProduct.code, MasterProduct.createdAt (+29 more)

### Community 46 - "Community 46"
Cohesion: 0.11
Nodes (30): buildCoupangWingSnapshotCoverage(), CoupangWingSnapshotCoverage, cellText(), collectParentMetadataConflicts(), decodeWorksheetRange(), expandMergedParentCells(), findHeaderRow(), formattedCellText() (+22 more)

### Community 47 - "Community 47"
Cohesion: 0.06
Nodes (21): nextPublicationSequence(), productsFromRows(), resolveIdentities(), RocketPoCatalogRepositoryAdapter, toCompletedRun(), Inject, Injectable, zeroChanges() (+13 more)

### Community 48 - "Community 48"
Cohesion: 0.07
Nodes (29): RocketPoCatalogResolution, automationReason(), countDecision(), emptyScopedResult(), proposalVersion(), requiredSuggestion(), toPreviewItem(), canonicalArtifactHash() (+21 more)

### Community 49 - "Community 49"
Cohesion: 0.09
Nodes (34): evidenceForNames(), automaticReason(), automaticStatus(), BarcodeEvidence, bestSimilarityPerSku(), ChannelRecipeAutomationDecision, ChannelRecipeSuggestionEvidenceKind, ChannelRecipeSuggestionInput (+26 more)

### Community 50 - "AI schema"
Cohesion: 0.07
Nodes (36): packages/shared — @kiditem/shared, AI, ContentWorkspaceThumbnailSelection.contentAsset, ContentWorkspaceThumbnailSelection.contentAssetId, ContentWorkspaceThumbnailSelection.contentWorkspace, ContentWorkspaceThumbnailSelection.contentWorkspaceId, ContentWorkspaceThumbnailSelection.createdAt, ContentWorkspaceThumbnailSelection.createdByUser (+28 more)

### Community 51 - "Community 51"
Cohesion: 0.06
Nodes (20): ChannelAccountController, Body, Controller, CurrentOrganization, Get, ChannelAccountListController, Controller, CurrentOrganization (+12 more)

### Community 52 - "Supply schema"
Cohesion: 0.07
Nodes (35): Supply, RocketPurchaseConfirmationAllocation.confirmationLine, RocketPurchaseConfirmationAllocation.confirmationLineId, RocketPurchaseConfirmationAllocation.createdAt, RocketPurchaseConfirmationAllocation.id, RocketPurchaseConfirmationAllocation.organization, RocketPurchaseConfirmationAllocation.quantity, RocketPurchaseConfirmationAllocation.sellpiaInventorySku (+27 more)

### Community 53 - "Core schema"
Cohesion: 0.08
Nodes (35): ChannelListing.lastImportRunId, ChannelListingOption.lastImportRunId, Order.sourceImportRunId, SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.createdAt, SourceImportRun.createdBy (+27 more)

### Community 54 - "Sourcing schema"
Cohesion: 0.07
Nodes (33): ContentGeneration.sourceCandidateId, SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.id, SourcingCandidate.imageUrl (+25 more)

### Community 55 - "Sourcing schema"
Cohesion: 0.07
Nodes (35): ProductRegistrationExecution.channelAccount, ProductRegistrationExecution.channelAccountId, ProductRegistrationExecution.channelListing, ProductRegistrationExecution.channelListingId, ProductRegistrationExecution.completedAt, ProductRegistrationExecution.createdAt, ProductRegistrationExecution.executionKind, ProductRegistrationExecution.expectedProviderAccountId (+27 more)

### Community 56 - "AI schema"
Cohesion: 0.07
Nodes (30): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt (+22 more)

### Community 57 - "Community 57"
Cohesion: 0.09
Nodes (31): ClientRenderArtifactSchema, ClientRenderContentTypeSchema, ClientRenderDateSchema, ClientRenderOutputWidthSchema, ClientRenderUuidSchema, ClientRenderVariantSchema, DETAIL_IMAGE_COUNTS, DETAIL_PAGE_AGE_GROUPS (+23 more)

### Community 58 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.startedAt, WorkflowRun.status (+25 more)

### Community 59 - "AI schema"
Cohesion: 0.08
Nodes (32): ContentGeneration.contentWorkspaceId, ContentWorkspace.channelListing, ContentWorkspace.channelListingId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.createdByUserId, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageRevision (+24 more)

### Community 60 - "System schema"
Cohesion: 0.06
Nodes (28): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon, Marketplace.id (+20 more)

### Community 61 - "Supply schema"
Cohesion: 0.07
Nodes (32): RocketPurchaseConfirmation.artifactBytes, RocketPurchaseConfirmation.artifactContentType, RocketPurchaseConfirmation.artifactFileName, RocketPurchaseConfirmation.artifactSha256, RocketPurchaseConfirmation.artifactStoredAt, RocketPurchaseConfirmation.channelAccount, RocketPurchaseConfirmation.channelAccountId, RocketPurchaseConfirmation.completedAt (+24 more)

### Community 62 - "Community 62"
Cohesion: 0.08
Nodes (14): Inject, ChannelSkuAvailabilityPort, ChannelProductMatchingQuery, ChannelProductMatchingRepositoryPort, Inject, ChannelSkuAvailabilityService, matchesStatus(), toAvailabilityItem() (+6 more)

### Community 63 - "Channels schema"
Cohesion: 0.08
Nodes (31): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.channelAccount, ChannelScrapeRun.channelAccountId, ChannelScrapeRun.clientRunKey, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson (+23 more)

### Community 64 - "Channels schema"
Cohesion: 0.07
Nodes (31): RocketPoCatalogLine.businessDateBasis, RocketPoCatalogLine.center, RocketPoCatalogLine.createdAt, RocketPoCatalogLine.hasConfirmation, RocketPoCatalogLine.id, RocketPoCatalogLine.inboundType, RocketPoCatalogLine.orderQty, RocketPoCatalogLine.organization (+23 more)

### Community 65 - "Community 65"
Cohesion: 0.10
Nodes (14): ChannelRegistrationCapabilityAdapter, Injectable, ChannelsMarketplaceRegistrationCapabilityPort, ProductRegistrationSubmissionCapabilityInput, ResolveProductRegistrationCapabilityInput, asRecord(), extractNestedSellerProductId(), isExplicitProviderRejection() (+6 more)

### Community 66 - "Orders schema"
Cohesion: 0.08
Nodes (28): Order.channelAccount, Order.channelAccountId, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id (+20 more)

### Community 67 - "Community 67"
Cohesion: 0.09
Nodes (28): ChannelProductMatchingQueueResponseSchema, CreateProductVariantRecipesIfEmptyResponseSchema, PlanProductVariantRecipesIfEmptyResponseSchema, artifact(), ApiClient, assertPartition(), assertPrivateOutputPath(), assertTargetBaseUrl() (+20 more)

### Community 68 - "Community 68"
Cohesion: 0.07
Nodes (9): CoupangProviderPort, MarketplaceRegistrationRepositoryPort, ChannelSyncRepositoryPort, OrderSyncDeps, ProductSyncDeps, Inject, Optional, Inject (+1 more)

### Community 69 - "Community 69"
Cohesion: 0.14
Nodes (25): ChannelRecipeAutomationContext, distinct(), evidenceForCode(), normalizePhysicalBarcode(), bigrams(), ChannelRecipeNameEvidence, ChannelRecipeNameIndex, ChannelRecipeNameOption (+17 more)

### Community 70 - "AgentOS schema"
Cohesion: 0.07
Nodes (29): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.agentInstanceId, AgentApprovalRequest.approver, AgentApprovalRequest.approverUserId, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy (+21 more)

### Community 71 - "AgentOS schema"
Cohesion: 0.08
Nodes (29): AgentToolInvocation.agentInstance, AgentToolInvocation.agentInstanceId, AgentToolInvocation.approvalRequest, AgentToolInvocation.approvalRequestId, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt (+21 more)

### Community 72 - "Community 72"
Cohesion: 0.20
Nodes (24): Path, add_code_reference_edges(), add_document_mentions(), add_schema_graph(), camel(), collect_block(), collect_code(), collect_doc_comments() (+16 more)

### Community 73 - "Community 73"
Cohesion: 0.15
Nodes (15): ChannelListingController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+7 more)

### Community 74 - "Channels schema"
Cohesion: 0.08
Nodes (26): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.channelAccount, ChannelAccountDailyKpiSnapshot.channelAccountId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+18 more)

### Community 75 - "Channels schema"
Cohesion: 0.08
Nodes (28): CoupangWingSalesRankDailySnapshot.businessDate, CoupangWingSalesRankDailySnapshot.capturedAt, CoupangWingSalesRankDailySnapshot.categoryHierarchy, CoupangWingSalesRankDailySnapshot.collectedCount, CoupangWingSalesRankDailySnapshot.conversionRate28d, CoupangWingSalesRankDailySnapshot.createdAt, CoupangWingSalesRankDailySnapshot.id, CoupangWingSalesRankDailySnapshot.itemId (+20 more)

### Community 76 - "Community 76"
Cohesion: 0.09
Nodes (22): adapterPaths, BROWSER_COLLECTION_ATTENTION_REASONS, BROWSER_COLLECTION_PRODUCERS, BROWSER_COLLECTION_STATES, BrowserCollectionAttentionReasonSchema, BrowserCollectionClassificationSchema, BrowserCollectionCommand, BrowserCollectionCommandSchema (+14 more)

### Community 77 - "Community 77"
Cohesion: 0.14
Nodes (27): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+19 more)

### Community 78 - "Channels schema"
Cohesion: 0.12
Nodes (24): Database ERD, CoupangRepresentativeKeywordOverride.createdAt, CoupangRepresentativeKeywordOverride.id, CoupangRepresentativeKeywordOverride.keyword, CoupangRepresentativeKeywordOverride.organization, CoupangRepresentativeKeywordOverride.updatedAt, CoupangRepresentativeKeywordOverride.vendorItemId, CSRecord.orderId (+16 more)

### Community 79 - "Inventory schema"
Cohesion: 0.07
Nodes (27): SellpiaInventoryState.activeGeneration, SellpiaInventoryState.activeSyncLeaseExpiresAt, SellpiaInventoryState.activeSyncOwner, SellpiaInventoryState.activeSyncOwnerUserId, SellpiaInventoryState.activeSyncStartedAt, SellpiaInventoryState.activeSyncToken, SellpiaInventoryState.createdAt, SellpiaInventoryState.failedGeneration (+19 more)

### Community 80 - "Inventory schema"
Cohesion: 0.09
Nodes (27): SellpiaOrderTransmissionIntent.abortedAt, SellpiaOrderTransmissionIntent.createdAt, SellpiaOrderTransmissionIntent.createdBy, SellpiaOrderTransmissionIntent.creator, SellpiaOrderTransmissionIntent.finalizedAt, SellpiaOrderTransmissionIntent.finalizedGeneration, SellpiaOrderTransmissionIntent.id, SellpiaOrderTransmissionIntent.intentKey (+19 more)

### Community 81 - "Community 81"
Cohesion: 0.16
Nodes (25): CHANNEL_CATALOG_COLLECTION_REPOSITORY_PORT, CHANNEL_CATALOG_PUBLICATION_PORT, assembleCompleteSnapshot(), assertSameManifest(), buildCollectionStatus(), CanonicalProduct, CompleteSnapshot, countMedia() (+17 more)

### Community 82 - "Supply schema"
Cohesion: 0.08
Nodes (26): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+18 more)

### Community 83 - "Community 83"
Cohesion: 0.08
Nodes (23): StatisticsCategoryRow, StatisticsCategoryRowSchema, StatisticsDeliveryDaily, StatisticsDeliveryDailySchema, StatisticsDeliveryResponse, StatisticsDeliveryResponseSchema, StatisticsGradeRow, StatisticsGradeRowSchema (+15 more)

### Community 84 - "Community 84"
Cohesion: 0.18
Nodes (26): assertCurrentRebuildBinding(), assertProtectedApiDestination(), assertReplayCounts(), assertReplayFactDigest(), assertSharedRebuildGuard(), assertStoredImportBinding(), bindRebuildImports(), bootstrap() (+18 more)

### Community 85 - "Community 85"
Cohesion: 0.12
Nodes (17): aiProductSuggestion(), aiVariantSuggestion(), asRecord(), availabilityListingWhere(), ChannelProductMatchingRepositoryAdapter, completedCatalogRunWhere(), componentSource(), distinctStrings() (+9 more)

### Community 86 - "Core schema"
Cohesion: 0.11
Nodes (22): ChannelRecipeAutomationProductTopology, classifyRecipeAutomationProductGroups(), groupDecision(), autoItem, configuredItem, reviewItem, ChannelListingOption.productVariantId, ProductVariant.code (+14 more)

### Community 87 - "AgentOS schema"
Cohesion: 0.09
Nodes (25): AgentInstance.adapterConfig, AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.icon, AgentInstance.id, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name (+17 more)

### Community 88 - "Channels schema"
Cohesion: 0.09
Nodes (25): ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isOfferWinner, ChannelListingOptionDailySnapshot.lastObservedAt, ChannelListingOptionDailySnapshot.listing (+17 more)

### Community 89 - "Finance schema"
Cohesion: 0.09
Nodes (22): GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.listing, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization, GradeHistory.reason (+14 more)

### Community 90 - "Community 90"
Cohesion: 0.08
Nodes (23): ChannelSkuMappingComponent, ChannelSkuMappingComponentSchema, ChannelSkuMappingCounts, ChannelSkuMappingCountsSchema, ChannelSkuMappingListItem, ChannelSkuMappingListItemSchema, ChannelSkuMappingListResponse, ChannelSkuMappingListResponseSchema (+15 more)

### Community 91 - "Community 91"
Cohesion: 0.13
Nodes (16): ChannelAccountRepositoryAdapter, envelopeToJson(), maskAccessKey(), readCredentialsConfig(), stripLegacyCredentialKeys(), toJsonRecord(), toRecord(), trimToOptional() (+8 more)

### Community 92 - "Channels schema"
Cohesion: 0.09
Nodes (23): ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.id, ChannelScrapeSnapshot.listing, ChannelScrapeSnapshot.listingOption (+15 more)

### Community 93 - "Community 93"
Cohesion: 0.13
Nodes (12): assertCanonicalCoupangAccountIdentity(), canonicalParentRows(), ChannelCatalogImportRepositoryAdapter, importResponse(), isUniqueConstraintError(), nextPublicationSequence(), Injectable, zeroChanges() (+4 more)

### Community 94 - "Community 94"
Cohesion: 0.10
Nodes (17): assertActiveCoupangAccount(), assertCanonicalAccount(), ChannelCatalogPublicationRepositoryAdapter, completeCollectionRun(), completedCollectionResult(), jsonRecord(), lockAccount(), lockCollectionRun() (+9 more)

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
Cohesion: 0.22
Nodes (8): ChannelDashboardController, Controller, CurrentOrganization, Get, Query, CoupangDateRangeQueryDto, ChannelDashboardService, Injectable

### Community 99 - "AgentOS schema"
Cohesion: 0.10
Nodes (22): AgentArtifact.agentInstance, AgentArtifact.agentInstanceId, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization (+14 more)

### Community 100 - "Channels schema"
Cohesion: 0.11
Nodes (22): CoupangKeywordRankDailySnapshot.adRank, CoupangKeywordRankDailySnapshot.businessDate, CoupangKeywordRankDailySnapshot.capturedAt, CoupangKeywordRankDailySnapshot.createdAt, CoupangKeywordRankDailySnapshot.id, CoupangKeywordRankDailySnapshot.itemId, CoupangKeywordRankDailySnapshot.keyword, CoupangKeywordRankDailySnapshot.organicRank (+14 more)

### Community 101 - "Sourcing schema"
Cohesion: 0.11
Nodes (22): TiktokCreativeTrendDailySnapshot.businessDate, TiktokCreativeTrendDailySnapshot.capturedAt, TiktokCreativeTrendDailySnapshot.createdAt, TiktokCreativeTrendDailySnapshot.entityKey, TiktokCreativeTrendDailySnapshot.growthPct, TiktokCreativeTrendDailySnapshot.id, TiktokCreativeTrendDailySnapshot.industry, TiktokCreativeTrendDailySnapshot.label (+14 more)

### Community 102 - "Community 102"
Cohesion: 0.20
Nodes (14): CoupangCredentials, coupangRequest(), CoupangRequestOptions, generateAuthorization(), approveReturn(), confirmOrderSheets(), DELIVERY_COMPANIES, getOrderSheets() (+6 more)

### Community 103 - "Community 103"
Cohesion: 0.10
Nodes (10): CoupangProviderAdapter, Inject, Injectable, CoupangCreateSellerProductResponse, CoupangSellerProductPayload, OrderSheetResponse, SellerProductDetailResponse, SellerProductExternalSkuResponse (+2 more)

### Community 104 - "AgentOS schema"
Cohesion: 0.10
Nodes (21): AgentCostEvent.agentInstance, AgentCostEvent.agentInstanceId, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id (+13 more)

### Community 105 - "AI schema"
Cohesion: 0.11
Nodes (21): AiDirectJob.attempts, AiDirectJob.claimedAt, AiDirectJob.claimedBy, AiDirectJob.createdAt, AiDirectJob.finishedAt, AiDirectJob.id, AiDirectJob.jobType, AiDirectJob.lastErrorCode (+13 more)

### Community 106 - "System schema"
Cohesion: 0.10
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+13 more)

### Community 107 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): LiveCommerceBroadcastDailySnapshot.broadcasterId, LiveCommerceBroadcastDailySnapshot.broadcasterName, LiveCommerceBroadcastDailySnapshot.broadcastId, LiveCommerceBroadcastDailySnapshot.businessDate, LiveCommerceBroadcastDailySnapshot.capturedAt, LiveCommerceBroadcastDailySnapshot.coverImageUrl, LiveCommerceBroadcastDailySnapshot.createdAt, LiveCommerceBroadcastDailySnapshot.endedAt (+13 more)

### Community 108 - "Orders schema"
Cohesion: 0.13
Nodes (17): Review.content, Review.createdAt, Review.id, Review.listing, Review.organization, Review.platform, Review.rating, Review.reviewedAt (+9 more)

### Community 109 - "Orders schema"
Cohesion: 0.10
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 110 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): ShortsTrendDailySnapshot.businessDate, ShortsTrendDailySnapshot.capturedAt, ShortsTrendDailySnapshot.channelName, ShortsTrendDailySnapshot.commentCount, ShortsTrendDailySnapshot.createdAt, ShortsTrendDailySnapshot.id, ShortsTrendDailySnapshot.keyword, ShortsTrendDailySnapshot.likeCount (+13 more)

### Community 111 - "AI schema"
Cohesion: 0.10
Nodes (21): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.contentWorkspace, ThumbnailAnalysis.contentWorkspaceId, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id (+13 more)

### Community 112 - "Community 112"
Cohesion: 0.21
Nodes (9): ChannelProductMatchingController, Body, Controller, CurrentOrganization, Get, Param, Post, Put (+1 more)

### Community 113 - "Community 113"
Cohesion: 0.10
Nodes (7): ChannelsDeletionPasswordAdapter, Injectable, ChannelsDeletionPasswordPort, ChannelListingRepositoryPort, Inject, Optional, Inject

### Community 114 - "Community 114"
Cohesion: 0.16
Nodes (14): assertExactProductGraph(), MarketplaceRegistrationRepositoryAdapter, Injectable, upsertExactOptionLinks(), asRecord(), KidItemFirstOptionLink, KidItemFirstRegistrationLinks, normalizedOptionId() (+6 more)

### Community 115 - "AgentOS schema"
Cohesion: 0.12
Nodes (20): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.agentInstanceId, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError (+12 more)

### Community 116 - "Finance schema"
Cohesion: 0.12
Nodes (20): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit (+12 more)

### Community 117 - "Channels schema"
Cohesion: 0.12
Nodes (20): SellpiaProductMonthlySales.buyPrice, SellpiaProductMonthlySales.capturedAt, SellpiaProductMonthlySales.createdAt, SellpiaProductMonthlySales.id, SellpiaProductMonthlySales.inAmount, SellpiaProductMonthlySales.inQty, SellpiaProductMonthlySales.optionCode, SellpiaProductMonthlySales.optionName (+12 more)

### Community 118 - "Sourcing schema"
Cohesion: 0.12
Nodes (20): Sourcing1688HotProductDailySnapshot.businessDate, Sourcing1688HotProductDailySnapshot.capturedAt, Sourcing1688HotProductDailySnapshot.createdAt, Sourcing1688HotProductDailySnapshot.id, Sourcing1688HotProductDailySnapshot.imageUrl, Sourcing1688HotProductDailySnapshot.monthlySales, Sourcing1688HotProductDailySnapshot.offerId, Sourcing1688HotProductDailySnapshot.organization (+12 more)

### Community 119 - "Community 119"
Cohesion: 0.21
Nodes (18): analyzePrReleaseContract(), changedFilesFromGit(), classifyFiles(), compareSemver(), deletedFilesFromGit(), ghPrBody(), git(), hasReleaseDecision() (+10 more)

### Community 120 - "Community 120"
Cohesion: 0.14
Nodes (8): SellpiaRecipeEvidenceAdapter, toEvidenceSku(), Inject, Injectable, SellpiaRecipeEvidencePort, SellpiaRecipeEvidenceSku, ChannelRecipeSuggestionContextRepositoryPort, Inject

### Community 121 - "AgentOS schema"
Cohesion: 0.11
Nodes (19): AgentRuntimeState.agentInstance, AgentRuntimeState.agentInstanceId, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.id, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun (+11 more)

### Community 122 - "Channels schema"
Cohesion: 0.12
Nodes (19): CoupangWingTrackedProductDailySnapshot.businessDate, CoupangWingTrackedProductDailySnapshot.capturedAt, CoupangWingTrackedProductDailySnapshot.conversionRate28d, CoupangWingTrackedProductDailySnapshot.createdAt, CoupangWingTrackedProductDailySnapshot.estimatedRevenue28d, CoupangWingTrackedProductDailySnapshot.id, CoupangWingTrackedProductDailySnapshot.organization, CoupangWingTrackedProductDailySnapshot.pvLast28Day (+11 more)

### Community 123 - "Supply schema"
Cohesion: 0.12
Nodes (19): PurchaseOrderSubmissionAttempt.createdAt, PurchaseOrderSubmissionAttempt.errorCode, PurchaseOrderSubmissionAttempt.errorMessage, PurchaseOrderSubmissionAttempt.freshnessGeneration, PurchaseOrderSubmissionAttempt.id, PurchaseOrderSubmissionAttempt.idempotencyKey, PurchaseOrderSubmissionAttempt.organization, PurchaseOrderSubmissionAttempt.providerReference (+11 more)

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
Cohesion: 0.11
Nodes (16): CurrentOrganization, Get, Query, AVAILABILITY_STATUSES, ChannelSkuAvailabilityQueryDto, IsIn, IsInt, IsOptional (+8 more)

### Community 128 - "Community 128"
Cohesion: 0.11
Nodes (4): ChannelDashboardRepositoryAdapter, Injectable, ChannelDashboardRepositoryPort, Inject

### Community 129 - "Sourcing schema"
Cohesion: 0.14
Nodes (18): LiveCommerceProductDailySnapshot.broadcastId, LiveCommerceProductDailySnapshot.businessDate, LiveCommerceProductDailySnapshot.capturedAt, LiveCommerceProductDailySnapshot.createdAt, LiveCommerceProductDailySnapshot.id, LiveCommerceProductDailySnapshot.imageUrl, LiveCommerceProductDailySnapshot.organization, LiveCommerceProductDailySnapshot.priceCny (+10 more)

### Community 130 - "Sourcing schema"
Cohesion: 0.13
Nodes (18): NaverKeywordDailySnapshot.averageAdRank, NaverKeywordDailySnapshot.businessDate, NaverKeywordDailySnapshot.capturedAt, NaverKeywordDailySnapshot.competitionIndex, NaverKeywordDailySnapshot.createdAt, NaverKeywordDailySnapshot.id, NaverKeywordDailySnapshot.keyword, NaverKeywordDailySnapshot.monthlyMobileSearchCount (+10 more)

### Community 131 - "Channels schema"
Cohesion: 0.14
Nodes (18): RocketPoCatalogSnapshot.channelAccount, RocketPoCatalogSnapshot.channelAccountId, RocketPoCatalogSnapshot.collectionRunId, RocketPoCatalogSnapshot.createdAt, RocketPoCatalogSnapshot.detailPoCount, RocketPoCatalogSnapshot.id, RocketPoCatalogSnapshot.listPagesRead, RocketPoCatalogSnapshot.organization (+10 more)

### Community 132 - "Channels schema"
Cohesion: 0.12
Nodes (18): RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt, RocketPurchaseOrder.firstSkuName, RocketPurchaseOrder.id, RocketPurchaseOrder.items, RocketPurchaseOrder.orderAmount, RocketPurchaseOrder.orderedAt (+10 more)

### Community 133 - "Inventory schema"
Cohesion: 0.13
Nodes (18): Shipment.warehouseId, StockTransfer.fromWarehouseId, StockTransfer.toWarehouseId, Warehouse.address, Warehouse.code, Warehouse.createdAt, Warehouse.id, Warehouse.isDefault (+10 more)

### Community 134 - "Community 134"
Cohesion: 0.23
Nodes (11): ChannelCatalogCollectionController, Body, Controller, CurrentOrganization, CurrentUser, Get, Inject, Param (+3 more)

### Community 135 - "Community 135"
Cohesion: 0.18
Nodes (8): ChannelCatalogCollectionRepositoryAdapter, isUniqueConstraintError(), ownedRunWhere(), Injectable, ChannelCatalogCollectionChunkRecord, ChannelCatalogCollectionRunRecord, ChannelCatalogCollectionWithChunks, startRun()

### Community 136 - "AgentOS schema"
Cohesion: 0.14
Nodes (17): AgentRunEvent.agentInstance, AgentRunEvent.agentInstanceId, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message (+9 more)

### Community 137 - "Channels schema"
Cohesion: 0.13
Nodes (17): CoupangWingTrackedProduct.brandName, CoupangWingTrackedProduct.categoryHierarchy, CoupangWingTrackedProduct.createdAt, CoupangWingTrackedProduct.enabled, CoupangWingTrackedProduct.id, CoupangWingTrackedProduct.imagePath, CoupangWingTrackedProduct.itemId, CoupangWingTrackedProduct.lastCapturedAt (+9 more)

### Community 138 - "Community 138"
Cohesion: 0.21
Nodes (16): assertAllowedArguments(), assertPublishableMain(), copyLoadableExtension(), createArchive(), environmentProfiles, githubReleaseCommand(), gitOutput(), gitSha() (+8 more)

### Community 139 - "Community 139"
Cohesion: 0.16
Nodes (16): upsertChannelCatalogIdentities(), applyProductLinksInBatches(), applyVariantLinksInBatches(), buildCatalogProductProvisioningListings(), compareProductMedia(), isHttpUrl(), mediaRolePriority(), publishCatalogOperationalProducts() (+8 more)

### Community 140 - "Core schema"
Cohesion: 0.16
Nodes (16): ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id, ChannelAccount.isPrimary, ChannelAccount.name, ChannelAccount.organization (+8 more)

### Community 141 - "Channels schema"
Cohesion: 0.16
Nodes (16): ChannelScrapeChunk.checksum, ChannelScrapeChunk.createdAt, ChannelScrapeChunk.id, ChannelScrapeChunk.itemCount, ChannelScrapeChunk.kind, ChannelScrapeChunk.organization, ChannelScrapeChunk.payload, ChannelScrapeChunk.publicationJson (+8 more)

### Community 142 - "Advertising schema"
Cohesion: 0.13
Nodes (16): ExecutionTask.action, ExecutionTask.actionId, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt, ExecutionTask.errorMessage, ExecutionTask.finishedAt (+8 more)

### Community 143 - "Inventory schema"
Cohesion: 0.13
Nodes (16): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.organization, PickingItem.pickedAt, PickingItem.pickingList (+8 more)

### Community 144 - "Inventory schema"
Cohesion: 0.15
Nodes (16): PickingItem.pickingListId, PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.id, PickingList.listNumber, PickingList.organization, PickingList.pickedItems (+8 more)

### Community 145 - "Supply schema"
Cohesion: 0.16
Nodes (16): RocketPurchaseConfirmationTransmission.confirmation, RocketPurchaseConfirmationTransmission.confirmationId, RocketPurchaseConfirmationTransmission.createdAt, RocketPurchaseConfirmationTransmission.id, RocketPurchaseConfirmationTransmission.intentKey, RocketPurchaseConfirmationTransmission.matchedLineCount, RocketPurchaseConfirmationTransmission.observedAt, RocketPurchaseConfirmationTransmission.organization (+8 more)

### Community 146 - "Inventory schema"
Cohesion: 0.13
Nodes (16): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.id, StockTransfer.notes, StockTransfer.optionName, StockTransfer.organization, StockTransfer.quantity (+8 more)

### Community 147 - "Supply schema"
Cohesion: 0.13
Nodes (16): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.dueDate, SupplierPayment.id, SupplierPayment.notes, SupplierPayment.organization, SupplierPayment.paidAmount, SupplierPayment.paidDate (+8 more)

### Community 148 - "Community 148"
Cohesion: 0.23
Nodes (16): assertBootstrapPreflightManifest(), assertPositiveIntegerText(), assertSharedDatabaseIdentity(), assertUuid(), buildBootstrapPreflightManifest(), buildChannelAccountFingerprint(), buildCoupangReplayBundle(), buildCoupangReplayScope() (+8 more)

### Community 149 - "Community 149"
Cohesion: 0.24
Nodes (14): analyzeReconstructionTriggers(), changedFilesFromGit(), ghPrBody(), git(), isCrossLayerControlChange(), isHighRiskBoundary(), isLargeServiceOrComponent(), layerOf() (+6 more)

### Community 150 - "Finance schema"
Cohesion: 0.14
Nodes (15): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description (+7 more)

### Community 151 - "Orders schema"
Cohesion: 0.14
Nodes (15): CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing (+7 more)

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

### Community 156 - "Inventory schema"
Cohesion: 0.14
Nodes (15): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.sourceRef, SellpiaReceiptUploadBatch.sourceType (+7 more)

### Community 157 - "Channels schema"
Cohesion: 0.16
Nodes (15): SellpiaSalesDailySnapshot.businessDate, SellpiaSalesDailySnapshot.capturedAt, SellpiaSalesDailySnapshot.channelGroup, SellpiaSalesDailySnapshot.costKrw, SellpiaSalesDailySnapshot.createdAt, SellpiaSalesDailySnapshot.id, SellpiaSalesDailySnapshot.organization, SellpiaSalesDailySnapshot.qty (+7 more)

### Community 158 - "Inventory schema"
Cohesion: 0.15
Nodes (15): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items, StockAudit.matchedCount (+7 more)

### Community 159 - "Community 159"
Cohesion: 0.15
Nodes (15): asRecord(), buildAdCampaignDailyRepairPlan(), buildTargetKey(), cleanString(), dateKey(), hasNonCampaignListingSignal(), hasOtherAdvertisingMeta(), maxDate() (+7 more)

### Community 160 - "Community 160"
Cohesion: 0.27
Nodes (4): ChannelCatalogCollectionPort, ChannelCatalogCollectionService, parseRequest(), Injectable

### Community 161 - "Advertising schema"
Cohesion: 0.15
Nodes (14): ExecutionTask.workerId, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentTaskRef, ExecutionWorker.currentUrl, ExecutionWorker.id, ExecutionWorker.label, ExecutionWorker.lastHeartbeatAt (+6 more)

### Community 162 - "System schema"
Cohesion: 0.15
Nodes (12): FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name, FeatureGate.updatedAt (+4 more)

### Community 163 - "Community 163"
Cohesion: 0.20
Nodes (11): SELLPIA_WORKBOOK_ACCEPT, SELLPIA_WORKBOOK_FILE_EXTENSIONS, SellpiaReceiptBatchCreateInput, SellpiaReceiptBatchCreateInputSchema, SellpiaReceiptBatchMarkUploadedInput, SellpiaReceiptBatchMarkUploadedInputSchema, SellpiaReceiptUploadBatch, SellpiaReceiptUploadBatchSchema (+3 more)

### Community 164 - "Community 164"
Cohesion: 0.26
Nodes (14): asRecord(), assertNoPii(), boundedReplayScope(), buildReplayBody(), buildReplayKpis(), cloneReplayValue(), containsPiiValue(), copyString() (+6 more)

### Community 165 - "Community 165"
Cohesion: 0.27
Nodes (12): analyzeSchemaArtifactSync(), changedFilesFromGit(), changedFilesFromWorkingTree(), GENERATED_ARTIFACT_PATHS, git(), main(), matchesAnyPath(), mergeChangedFiles() (+4 more)

### Community 166 - "Community 166"
Cohesion: 0.17
Nodes (6): ChannelsOperationAlertAdapter, Inject, Injectable, OperationAlertPort, OperationLifecyclePatch, StartOperationAlertInput

### Community 167 - "Channels schema"
Cohesion: 0.18
Nodes (13): Channels, CoupangKeywordTracker.createdAt, CoupangKeywordTracker.enabled, CoupangKeywordTracker.id, CoupangKeywordTracker.keyword, CoupangKeywordTracker.lastCapturedAt, CoupangKeywordTracker.maxPages, CoupangKeywordTracker.organization (+5 more)

### Community 168 - "Channels schema"
Cohesion: 0.19
Nodes (13): CoupangKeywordSerpDailySnapshot.businessDate, CoupangKeywordSerpDailySnapshot.capturedAt, CoupangKeywordSerpDailySnapshot.createdAt, CoupangKeywordSerpDailySnapshot.id, CoupangKeywordSerpDailySnapshot.itemCount, CoupangKeywordSerpDailySnapshot.items, CoupangKeywordSerpDailySnapshot.keyword, CoupangKeywordSerpDailySnapshot.organization (+5 more)

### Community 169 - "Channels schema"
Cohesion: 0.18
Nodes (13): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson, RocketSupplyDailySnapshot.revenueKrw (+5 more)

### Community 170 - "Community 170"
Cohesion: 0.29
Nodes (13): assertAllowedRecord(), assertAllowedRows(), assertAllowedScalarRecord(), assertObservedMetrics(), assertOptionalScalar(), assertPlainRecord(), assertReplayBundle(), assertReplayFactCounts() (+5 more)

### Community 171 - "Inventory schema"
Cohesion: 0.20
Nodes (12): Inventory, CoupangShipmentDateSummary.boxes, CoupangShipmentDateSummary.capturedAt, CoupangShipmentDateSummary.count, CoupangShipmentDateSummary.createdAt, CoupangShipmentDateSummary.id, CoupangShipmentDateSummary.organization, CoupangShipmentDateSummary.shipmentDate (+4 more)

### Community 172 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 173 - "Community 173"
Cohesion: 0.24
Nodes (12): assertIsoTimestamp(), assertPostgresUuid(), assertStagingAccountBaselineManifest(), assertUnique(), buildStagingAccountBaselineManifest(), optionalDate(), readStagingAccountBaseline(), requiredDate() (+4 more)

### Community 174 - "Advertising schema"
Cohesion: 0.20
Nodes (11): Advertising, ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task (+3 more)

### Community 175 - "Sourcing schema"
Cohesion: 0.24
Nodes (11): Sourcing, SourcingWorkspaceSnapshot.businessDate, SourcingWorkspaceSnapshot.createdAt, SourcingWorkspaceSnapshot.id, SourcingWorkspaceSnapshot.organization, SourcingWorkspaceSnapshot.payload, SourcingWorkspaceSnapshot.scope, SourcingWorkspaceSnapshot.updatedAt (+3 more)

### Community 176 - "System schema"
Cohesion: 0.20
Nodes (11): ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization, ActivityEvent.source (+3 more)

### Community 177 - "Supply schema"
Cohesion: 0.20
Nodes (11): PurchaseOrderItem.createdAt, PurchaseOrderItem.id, PurchaseOrderItem.order, PurchaseOrderItem.organization, PurchaseOrderItem.productName, PurchaseOrderItem.quantity, PurchaseOrderItem.sellpiaInventorySku, PurchaseOrderItem.sellpiaInventorySkuId (+3 more)

### Community 178 - "Sourcing schema"
Cohesion: 0.22
Nodes (11): TrendSeedKeyword.createdAt, TrendSeedKeyword.enabled, TrendSeedKeyword.id, TrendSeedKeyword.keyword, TrendSeedKeyword.keywordCn, TrendSeedKeyword.organization, TrendSeedKeyword.sources, TrendSeedKeyword.updatedAt (+3 more)

### Community 179 - "Community 179"
Cohesion: 0.20
Nodes (10): canRetryChannelListingDeletionProviderSideEffect(), canRetryProviderSideEffect(), isOperationTerminal(), OPERATION_STATUSES, OperationStatus, OperationStatusSchema, PROVIDER_OUTCOMES, ProviderOutcome (+2 more)

### Community 180 - "Community 180"
Cohesion: 0.22
Nodes (8): CoupangCategorySuggestion, CoupangCategorySuggestionRequest, CoupangCategorySuggestionRequestSchema, CoupangCategorySuggestionResponse, CoupangCategorySuggestionResponseSchema, CoupangCategorySuggestionResult, CoupangCategorySuggestionResultSchema, CoupangCategorySuggestionSchema

### Community 181 - "Community 181"
Cohesion: 0.38
Nodes (9): checkTrackedClaudeDirectory(), findClaudeShimFindings(), findInstructionChainSizeFindings(), findStaleInstructionLines(), git(), listRepositoryFiles(), listTracked(), main() (+1 more)

### Community 182 - "Community 182"
Cohesion: 0.35
Nodes (9): analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), directOutPortFiles(), FORBIDDEN_IN_PORT_FOLDER_NAMES, forbiddenInPortCallerFolders(), listDirectories(), listFiles(), main() (+1 more)

### Community 183 - "System schema"
Cohesion: 0.24
Nodes (10): System, SystemSetting.createdAt, SystemSetting.id, SystemSetting.key, SystemSetting.organization, SystemSetting.updatedAt, SystemSetting.value, SystemSetting (+2 more)

### Community 184 - "Community 184"
Cohesion: 0.49
Nodes (6): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), scrubDeep(), scrubSecrets(), walk()

### Community 185 - "Community 185"
Cohesion: 0.38
Nodes (8): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), main(), parseBaseline(), readFiles(), repoRoot(), walk()

### Community 186 - "Community 186"
Cohesion: 0.33
Nodes (8): parseArgs(), bool(), parseRawArgs(), ParseRawArgsOptions, pushValue(), values(), COMMANDS, makeArgs()

### Community 187 - "Advertising schema"
Cohesion: 0.25
Nodes (9): ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.id, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.url, ScrapeTarget (+1 more)

### Community 188 - "Community 188"
Cohesion: 0.22
Nodes (7): ReadinessCheck, ReadinessCheckSchema, ReadinessCheckStatusSchema, ReadinessResponse, ReadinessResponseSchema, RebuildReadinessResponse, RebuildReadinessResponseSchema

### Community 189 - "Community 189"
Cohesion: 0.22
Nodes (9): assertLocalRebuildGuard(), assertLocalDevelopmentDatabase(), bootstrapAuthoritativeInventoryDevelopment(), buildBootstrapPlan(), LOCAL_HOSTS, main(), optionalUuid(), parseBootstrapArgs() (+1 more)

### Community 190 - "Community 190"
Cohesion: 0.31
Nodes (9): addExactHeaderEvidence(), asRecord(), CONVERSION_COUNT_HEADERS, normalizeHeader(), parseObservedCount(), recoverObservedCampaignTargetConversions(), resolveRevenueShapedCampaignTargetConversion(), roundedNumber() (+1 more)

### Community 191 - "Community 191"
Cohesion: 0.22
Nodes (4): repoRoot, scriptPath, supportedExtensions, temporaryDirectories

### Community 193 - "Community 193"
Cohesion: 0.29
Nodes (6): CurrentOrganization, CurrentUser, Param, Post, UploadedFile, UseInterceptors

### Community 194 - "Community 194"
Cohesion: 0.33
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 196 - "Community 196"
Cohesion: 0.40
Nodes (5): asRecord(), buildCampaignQualifiedProductTargetKeys(), cleanString(), rawCampaignAnchor(), rawProductAnchor()

### Community 197 - "Community 197"
Cohesion: 0.50
Nodes (4): fileHash(), importInput(), makeRow(), representativeRows()

### Community 200 - "Community 200"
Cohesion: 0.50
Nodes (4): is_allowlisted(), is_comment_line(), load_file_lines(), check-tenant-scope.sh script

### Community 201 - "Community 201"
Cohesion: 1.00
Nodes (3): makeRepository(), runRecord(), runWithChunks()

### Community 202 - "Community 202"
Cohesion: 0.67
Nodes (3): accountIdFor(), seedOrderInline(), seedReturnInline()

### Community 203 - "Community 203"
Cohesion: 0.67
Nodes (3): detailOk(), listOk(), mockProductDetail()

### Community 206 - "Community 206"
Cohesion: 0.67
Nodes (3): extractEnvKeys(), readModelFile(), redactEnvValues()

## Knowledge Gaps
- **2765 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+2760 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **23 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Core schema` to `prisma field: externalOptionId canonical option identity`, `Community 1`, `Community 2`, `System schema`, `AgentOS schema`, `Community 5`, `Core schema`, `Community 9`, `Core schema`, `Orders schema`, `prisma field: channels — Marketplace Sync + SKU Matching`, `Community 13`, `AI schema`, `AI schema`, `Core schema`, `Supply schema`, `Channels schema`, `AgentOS schema`, `Community 21`, `AI schema`, `Core schema`, `AI schema`, `Community 27`, `AI schema`, `Community 33`, `Sourcing schema`, `AgentOS schema`, `Core schema`, `Channels schema`, `Inventory schema`, `AI schema`, `AI schema`, `Core schema`, `AI schema`, `Supply schema`, `Core schema`, `Sourcing schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `AI schema`, `Supply schema`, `Channels schema`, `Channels schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `Community 72`, `Channels schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Community 81`, `Supply schema`, `Core schema`, `AgentOS schema`, `Channels schema`, `Finance schema`, `Channels schema`, `System schema`, `Advertising schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `Sourcing schema`, `AgentOS schema`, `AI schema`, `System schema`, `Sourcing schema`, `Orders schema`, `Orders schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `Finance schema`, `Channels schema`, `Sourcing schema`, `AgentOS schema`, `Channels schema`, `Supply schema`, `Inventory schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `AgentOS schema`, `Channels schema`, `Core schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Inventory schema`, `Supply schema`, `Finance schema`, `Orders schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Advertising schema`, `System schema`, `Channels schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Sourcing schema`, `System schema`, `Supply schema`, `Sourcing schema`, `System schema`, `Advertising schema`?**
  _High betweenness centrality (0.223) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `Channels schema` to `prisma field: externalOptionId canonical option identity`, `System schema`, `AgentOS schema`, `Core schema`, `Core schema`, `Core schema`, `Orders schema`, `prisma field: channels — Marketplace Sync + SKU Matching`, `AI schema`, `AI schema`, `Core schema`, `Supply schema`, `Channels schema`, `AgentOS schema`, `AI schema`, `Core schema`, `AI schema`, `AI schema`, `Sourcing schema`, `AgentOS schema`, `Core schema`, `Channels schema`, `Inventory schema`, `AI schema`, `AI schema`, `Core schema`, `AI schema`, `Supply schema`, `Core schema`, `Sourcing schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `AI schema`, `System schema`, `Supply schema`, `Channels schema`, `Channels schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Core schema`, `AgentOS schema`, `Channels schema`, `Finance schema`, `Channels schema`, `System schema`, `Advertising schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `Sourcing schema`, `AgentOS schema`, `AI schema`, `System schema`, `Sourcing schema`, `Orders schema`, `Orders schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `Finance schema`, `Channels schema`, `Sourcing schema`, `AgentOS schema`, `Channels schema`, `Supply schema`, `Inventory schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `AgentOS schema`, `Channels schema`, `Core schema`, `Channels schema`, `Advertising schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Inventory schema`, `Supply schema`, `Finance schema`, `Orders schema`, `System schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Advertising schema`, `System schema`, `Channels schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `System schema`, `Advertising schema`, `Sourcing schema`, `System schema`, `Supply schema`, `Sourcing schema`, `System schema`, `Advertising schema`?**
  _High betweenness centrality (0.167) - this node is a cross-community bridge._
- **Why does `Order` connect `Orders schema` to `prisma field: externalOptionId canonical option identity`, `Community 1`, `Community 2`, `System schema`, `Community 5`, `Core schema`, `Core schema`, `Community 8`, `Community 138`, `Orders schema`, `prisma field: channels — Marketplace Sync + SKU Matching`, `Core schema`, `Core schema`, `Supply schema`, `Community 21`, `Community 22`, `Community 23`, `Orders schema`, `AI schema`, `Community 28`, `Community 29`, `Community 30`, `Community 31`, `Community 33`, `Community 36`, `Community 165`, `Community 39`, `Inventory schema`, `Core schema`, `Community 182`, `Community 191`, `Community 195`, `Community 67`, `Community 72`, `Channels schema`, `Community 76`, `Channels schema`, `Community 83`, `Finance schema`, `Orders schema`, `Community 102`, `Orders schema`, `Community 114`, `Community 125`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Are the 190 inferred relationships involving `Organization` (e.g. with `channel-registration-capability.adapter.ts` and `channel-account.controller.ts`) actually correct?**
  _`Organization` has 190 INFERRED edges - model-reasoned connections that need verification._
- **Are the 145 inferred relationships involving `ChannelAccount` (e.g. with `channel-registration-capability.adapter.ts` and `channel-account.controller.ts`) actually correct?**
  _`ChannelAccount` has 145 INFERRED edges - model-reasoned connections that need verification._
- **Are the 106 inferred relationships involving `ChannelListing` (e.g. with `channel-registration-capability.adapter.ts` and `channel-listing.controller.ts`) actually correct?**
  _`ChannelListing` has 106 INFERRED edges - model-reasoned connections that need verification._
- **Are the 135 inferred relationships involving `Order` (e.g. with `channel-sync.controller.ts` and `dto/index.ts`) actually correct?**
  _`Order` has 135 INFERRED edges - model-reasoned connections that need verification._