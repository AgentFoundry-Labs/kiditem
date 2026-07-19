# Graph Report - schema-consumers  (2026-07-19)

## Corpus Check
- 393 files · ~199,453 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5902 nodes · 32775 edges · 265 communities (243 shown, 22 thin omitted)
- Extraction: 32% EXTRACTED · 68% INFERRED · 0% AMBIGUOUS · INFERRED: 22407 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- prisma field: prisma — Shared Schema
- Inventory schema
- Orders schema
- Community 3
- prisma field: vendorItemId provider term
- prisma field: AdAction.externalId
- Community 6
- Community 7
- Community 8
- Core schema
- Core schema
- Community 11
- Core schema
- Community 13
- Community 14
- AI schema
- AI schema
- AI schema
- Core schema
- Channels schema
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Core schema
- AI schema
- Community 29
- AgentOS schema
- AgentOS schema
- Sourcing schema
- Community 33
- Community 34
- Inventory schema
- AI schema
- Community 37
- Community 38
- Community 39
- AI schema
- Community 41
- Sourcing schema
- Inventory schema
- Core schema
- Channels schema
- AI schema
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- AgentOS schema
- AgentOS schema
- Inventory schema
- Channels schema
- Channels schema
- Inventory schema
- Community 58
- AgentOS schema
- Community 60
- System schema
- prisma field: externalOptionId canonical option identity
- AgentOS schema
- AgentOS schema
- Inventory schema
- Community 66
- Community 67
- Channels schema
- Community 69
- Community 70
- Community 71
- AgentOS schema
- Supply schema
- System schema
- Community 75
- Community 76
- Channels schema
- Community 78
- Community 79
- Community 80
- AgentOS schema
- Channels schema
- Community 83
- Community 84
- System schema
- Advertising schema
- Supply schema
- Channels schema
- Community 89
- AgentOS schema
- System schema
- Channels schema
- Sourcing schema
- Orders schema
- Sourcing schema
- AI schema
- Community 97
- Channels schema
- AgentOS schema
- Finance schema
- Supply schema
- Channels schema
- Sourcing schema
- Community 104
- AgentOS schema
- Channels schema
- Supply schema
- Inventory schema
- Community 109
- Community 110
- Community 111
- Community 112
- Community 113
- Community 114
- Community 115
- AgentOS schema
- Sourcing schema
- Sourcing schema
- Channels schema
- Channels schema
- Community 121
- Community 122
- Community 123
- Community 124
- Supply schema
- Community 126
- Community 127
- AgentOS schema
- Channels schema
- Channels schema
- Advertising schema
- Supply schema
- AI schema
- Community 134
- Community 135
- Community 136
- Orders schema
- System schema
- Sourcing schema
- Finance schema
- Finance schema
- Channels schema
- Inventory schema
- Supply schema
- Community 145
- Community 146
- Finance schema
- Advertising schema
- Finance schema
- Community 150
- Community 151
- Community 152
- Community 153
- Supply schema
- Channels schema
- Core schema
- Channels schema
- Community 158
- Community 159
- Community 160
- Channels schema
- System schema
- Community 163
- Community 164
- Advertising schema
- System schema
- Core schema
- System schema
- Supply schema
- Sourcing schema
- Community 171
- Community 172
- Community 173
- System schema
- Advertising schema
- Sourcing schema
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

## God Nodes (most connected - your core abstractions)
1. `Organization` - 424 edges
2. `Database ERD` - 359 edges
3. `ChannelAccount` - 184 edges
4. `ChannelListing` - 179 edges
5. `Order` - 177 edges
6. `ContentWorkspace.organizationId` - 166 edges
7. `ProductPreparation.organizationId` - 166 edges
8. `prisma — Shared Schema` - 163 edges
9. `ChannelListing.organizationId` - 162 edges
10. `SourceImportRun.organizationId` - 161 edges
11. `ContentWorkspaceThumbnailSelection.organizationId` - 160 edges
12. `ChannelAdTargetDailySnapshot.organizationId` - 160 edges

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

## Communities (265 total, 22 thin omitted)

### Community 0 - "prisma field: prisma — Shared Schema"
Cohesion: 0.16
Nodes (236): UploadedWorkbookFile, HEADERS, USER, chunkSelect, ErrorInput, LockedRun, OwnedRunInput, PutChunkInput (+228 more)

### Community 1 - "Inventory schema"
Cohesion: 0.04
Nodes (94): CanonicalParent, ClaimInput, LockedRunRow, TRANSACTION_OPTIONS, UpsertInput, buildCoupangWingSnapshotCoverage(), CoupangWingSnapshotCoverage, ChannelAvailabilityRepositoryRow (+86 more)

### Community 2 - "Orders schema"
Cohesion: 0.02
Nodes (113): formatKstIso(), CHANNELS_ROOT, REPO_ROOT, Orders, Order.channelAccount, Order.channelAccountId, Order.createdAt, Order.customerName (+105 more)

### Community 3 - "Community 3"
Cohesion: 0.02
Nodes (101): AgentApprovalRequestSummary, AgentApprovalRequestSummarySchema, AgentApprovalStatus, AgentApprovalStatusSchema, AgentArtifactHandoffSummary, AgentArtifactHandoffSummarySchema, AgentArtifactStatus, AgentArtifactStatusSchema (+93 more)

### Community 4 - "prisma field: vendorItemId provider term"
Cohesion: 0.05
Nodes (87): ListingForProductSync, vendorItemId provider term, channels — Marketplace Sync + SKU Matching, Database ERD, Sourcing, ActionTask.targetId, ActionTask.targetType, AdAction.listingOptionId (+79 more)

### Community 5 - "prisma field: AdAction.externalId"
Cohesion: 0.11
Nodes (58): ChannelCatalogPublicationRepositoryAdapter, Injectable, SellerProductDetailResponse, SellerProductListResponse, ChannelAccountService, Injectable, CHANNELS_CAPABILITIES, ChannelsCapabilityKey (+50 more)

### Community 6 - "Community 6"
Cohesion: 0.02
Nodes (80): AdMetricsDetail, AdMetricsDetailSchema, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary, DashboardAdSummarySchema (+72 more)

### Community 7 - "Community 7"
Cohesion: 0.05
Nodes (52): ChannelRegistrationCapabilityAdapter, Injectable, ChannelCatalogImportController, Controller, Inject, ChannelSkuAvailabilityController, Controller, ChannelRecipeAutomationContextRepositoryAdapter (+44 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (68): option(), AdapterCommand, appendFlag(), appendOption(), appendProjectReferenceDefaults(), appendValues(), archiveFileName(), archiveShaFileName() (+60 more)

### Community 9 - "Core schema"
Cohesion: 0.05
Nodes (38): Organization.createdAt, Organization.id, Organization.name, Organization.slug, Organization.updatedAt, Organization, DATA_MIGRATION_RELEASES, DataMigration (+30 more)

### Community 10 - "Core schema"
Cohesion: 0.04
Nodes (63): ChannelListing.brand, ChannelListing.category, ChannelListing.channelAccount, ChannelListing.channelAccountId, ChannelListing.channelName, ChannelListing.createdAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo (+55 more)

### Community 11 - "Community 11"
Cohesion: 0.03
Nodes (63): CreateMasterProductInput, CreateMasterProductInputSchema, CreateProductVariantFieldsSchema, CreateProductVariantInput, CreateProductVariantInputSchema, MasterProductDisplayReference, MasterProductDisplayReferenceSchema, MasterProductMutationFieldsSchema (+55 more)

### Community 12 - "Core schema"
Cohesion: 0.04
Nodes (60): ContentGeneration.triggeredByUserId, ContentWorkspace.createdByUserId, InventoryCommitment.businessKey, InventoryCommitment.createdAt, InventoryCommitment.createdBy, InventoryCommitment.creator, InventoryCommitment.id, InventoryCommitment.inventoryGeneration (+52 more)

### Community 13 - "Community 13"
Cohesion: 0.06
Nodes (61): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot, AdCampaignSnapshotSchema (+53 more)

### Community 14 - "Community 14"
Cohesion: 0.06
Nodes (57): ActionTask, ActionTaskExecuteResponse, ActionTaskList, ActionTaskListSchema, ActionTaskRelatedProduct, ActionTaskRelatedProductSchema, ActionTaskSchema, ActionTaskSourceAlert (+49 more)

### Community 15 - "AI schema"
Cohesion: 0.04
Nodes (63): ContentAsset.originGenerationGroupId, ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.contentWorkspaceId, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml (+55 more)

### Community 16 - "AI schema"
Cohesion: 0.04
Nodes (61): packages/shared — @kiditem/shared, AI, ProductPreparation.selectedThumbnailGenerationId, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.contentWorkspaceId, ThumbnailGeneration.createdAt, ThumbnailGeneration.deletedAt (+53 more)

### Community 17 - "AI schema"
Cohesion: 0.04
Nodes (58): ProductPreparation.channelAccount, ProductPreparation.channelAccountId, ProductPreparation.channelListing, ProductPreparation.channelListingId, ProductPreparation.createdAt, ProductPreparation.createdByUser, ProductPreparation.deletedAt, ProductPreparation.displayName (+50 more)

### Community 18 - "Core schema"
Cohesion: 0.04
Nodes (55): Core, ChannelListingOption.attributesJson, ChannelListingOption.commissionRate, ChannelListingOption.costPriceOverride, ChannelListingOption.createdAt, ChannelListingOption.id, ChannelListingOption.itemName, ChannelListingOption.lastImportRun (+47 more)

### Community 19 - "Channels schema"
Cohesion: 0.04
Nodes (55): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+47 more)

### Community 20 - "Community 20"
Cohesion: 0.04
Nodes (47): ChannelAccountListItem, ChannelAccountListItemSchema, CoupangAccountSettings, CoupangAccountSettingsSchema, UpdateCoupangAccountSettings, ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow (+39 more)

### Community 21 - "Community 21"
Cohesion: 0.09
Nodes (46): apiHeaders(), apiUrl(), Args, assertSafeDatasetId(), assertSupportedReplayPayloads(), BundleManifest, BundlePayload, BundleReference (+38 more)

### Community 22 - "Community 22"
Cohesion: 0.08
Nodes (47): Lane, value(), applyCacheControl(), ApplyResult, applyS3CacheControl(), applySupabaseCacheControl(), assertApplyAllowed(), buildCopyObjectInput() (+39 more)

### Community 23 - "Community 23"
Cohesion: 0.07
Nodes (50): ACCOUNT_AD_DAILY_DIGEST_KEYS, AD_ROW_KEYS, AD_SUMMARY_KEYS, ADS_DAILY_ROW_KEYS, ADS_KPI_KEYS, assertAllowedRecord(), assertAllowedRows(), assertAllowedScalarRecord() (+42 more)

### Community 24 - "Community 24"
Cohesion: 0.10
Nodes (48): assertNonProductionTarget(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged(), assertSha256(), BaselineManifest, BaselineManifestExpectation, baselineObjectKeys, buildChecksumsFile() (+40 more)

### Community 25 - "Community 25"
Cohesion: 0.06
Nodes (26): ChannelSyncController, Body, Controller, CurrentOrganization, CurrentUser, Get, Post, ChannelSyncRepositoryAdapter (+18 more)

### Community 26 - "Community 26"
Cohesion: 0.04
Nodes (47): deriveSellpiaInventoryFreshness(), FixedSellpiaAccountKeySchema, FixedSellpiaOriginSchema, IsoDateTimeStringSchema, SELLPIA_INVENTORY_FRESHNESS_STATUSES, SELLPIA_INVENTORY_REFRESH_REASONS, SellpiaFreshnessDerivationInput, SellpiaInventoryActiveSyncViewSchema (+39 more)

### Community 27 - "Core schema"
Cohesion: 0.05
Nodes (43): ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id, ChannelAccount.isPrimary, ChannelAccount.name, ChannelAccount.organization (+35 more)

### Community 28 - "AI schema"
Cohesion: 0.06
Nodes (45): ContentWorkspace.channelListing, ContentWorkspace.channelListingId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageRevision, ContentWorkspace.currentThumbnailSelection, ContentWorkspace.currentThumbnailSelectionId (+37 more)

### Community 29 - "Community 29"
Cohesion: 0.07
Nodes (28): lockChannelListingRow(), aiProductSuggestion(), aiVariantSuggestion(), asRecord(), availabilityListingWhere(), ChannelProductMatchingRepositoryAdapter, COMPLETED_CATALOG_SOURCE_TYPES, completedCatalogRunWhere() (+20 more)

### Community 30 - "AgentOS schema"
Cohesion: 0.05
Nodes (44): AgentRunRequest.agentInstance, AgentRunRequest.attempts, AgentRunRequest.claimedAt, AgentRunRequest.claimedBy, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.coalescedIntoRequestId, AgentRunRequest.conversation, AgentRunRequest.createdAt (+36 more)

### Community 31 - "AgentOS schema"
Cohesion: 0.05
Nodes (42): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+34 more)

### Community 32 - "Sourcing schema"
Cohesion: 0.05
Nodes (41): CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id, CandidateImage.isPrimary (+33 more)

### Community 33 - "Community 33"
Cohesion: 0.05
Nodes (36): PANEL_RUN_SOURCES, PanelRunSource, PanelRunSourceSchema, sourceKeys, PANEL_ITEM_KINDS, PanelAlertItem, PanelAlertItemSchema, PanelDismissEventSchema (+28 more)

### Community 34 - "Community 34"
Cohesion: 0.06
Nodes (31): ChannelRecipeAutomationContextRepositoryPort, automationReason(), ChannelRecipeAutomationService, countDecision(), emptyScopedResult(), proposalVersion(), requiredSuggestion(), toPreviewItem() (+23 more)

### Community 35 - "Inventory schema"
Cohesion: 0.05
Nodes (40): Inventory, InventoryCommitmentAllocation.commitment, InventoryCommitmentAllocation.commitmentId, InventoryCommitmentAllocation.createdAt, InventoryCommitmentAllocation.id, InventoryCommitmentAllocation.organization, InventoryCommitmentAllocation.quantity, InventoryCommitmentAllocation.sellpiaInventorySku (+32 more)

### Community 36 - "AI schema"
Cohesion: 0.06
Nodes (40): ContentGeneration.detailPageArtifactId, ContentWorkspace.currentDetailPageArtifactId, ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.contentWorkspaceId, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.createdByUserId (+32 more)

### Community 37 - "Community 37"
Cohesion: 0.05
Nodes (36): ChunkRequestBaseSchema, CoupangCatalogAttributeV1, CoupangCatalogAttributeV1Schema, CoupangCatalogBrowserCommand, CoupangCatalogBrowserCommandSchema, CoupangCatalogBrowserStatus, CoupangCatalogBrowserStatusSchema, CoupangCatalogChunkKind (+28 more)

### Community 38 - "Community 38"
Cohesion: 0.05
Nodes (36): boundedText(), isoDay, requiredText(), ROCKET_SHORTAGE_REASONS, RocketPoCatalogPublication, RocketPoCatalogPublicationSchema, RocketPoCatalogRow, RocketPoCatalogRowSchema (+28 more)

### Community 39 - "Community 39"
Cohesion: 0.05
Nodes (33): ChannelMatchCandidateReason, ChannelMatchCandidateReasonSchema, ChannelMatchEvidence, ChannelMatchEvidenceSchema, ChannelMatchingAccount, ChannelMatchingAccountSchema, ChannelOptionMatchingQueueRow, ChannelOptionMatchingQueueRowSchema (+25 more)

### Community 40 - "AI schema"
Cohesion: 0.06
Nodes (38): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+30 more)

### Community 41 - "Community 41"
Cohesion: 0.11
Nodes (36): DATA_MIGRATION_IDS, dataMigrations, DataMigrationContext, DataMigrationTarget, MigrationResult, appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertMutatingTarget() (+28 more)

### Community 42 - "Sourcing schema"
Cohesion: 0.06
Nodes (33): ContentGeneration.sourceCandidateId, SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.id, SourcingCandidate.imageUrl (+25 more)

### Community 43 - "Inventory schema"
Cohesion: 0.07
Nodes (36): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.organization, PickingItem.pickedAt, PickingItem.pickingList (+28 more)

### Community 44 - "Core schema"
Cohesion: 0.07
Nodes (35): ChannelListing.lastImportRunId, ChannelListingOption.lastImportRunId, Order.sourceImportRunId, SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.createdAt, SourceImportRun.createdBy (+27 more)

### Community 45 - "Channels schema"
Cohesion: 0.07
Nodes (35): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel, ChannelAdTargetDailySnapshot.clicks (+27 more)

### Community 46 - "AI schema"
Cohesion: 0.07
Nodes (35): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height (+27 more)

### Community 47 - "Community 47"
Cohesion: 0.11
Nodes (32): CurrentOrganization, CurrentUser, Param, Post, cellText(), collectParentMetadataConflicts(), decodeWorksheetRange(), expandMergedParentCells() (+24 more)

### Community 48 - "Community 48"
Cohesion: 0.07
Nodes (29): CHANNEL_LISTING_SORTS, CHANNEL_LISTING_TABS, ChannelListingQueryDto, IsIn, IsOptional, IsString, IsUUID, MaxLength (+21 more)

### Community 49 - "Community 49"
Cohesion: 0.07
Nodes (31): DeliveryCompany, DeliveryCompanySchema, Order, OrderActionResponse, OrderActionResponseSchema, OrderLineItem, OrderLineItemSchema, OrderListItem (+23 more)

### Community 50 - "Community 50"
Cohesion: 0.07
Nodes (22): ChannelListingController, Controller, CurrentOrganization, Get, Param, Query, aggregateMappingStatus(), ChannelListingRepositoryAdapter (+14 more)

### Community 51 - "Community 51"
Cohesion: 0.10
Nodes (31): automaticReason(), automaticStatus(), BarcodeEvidence, bestSimilarityPerSku(), ChannelRecipeAutomationDecision, ChannelRecipeSuggestionEvidenceKind, ChannelRecipeSuggestionInput, ChannelRecipeSuggestionResponse (+23 more)

### Community 52 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+25 more)

### Community 53 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.startedAt, WorkflowRun.status (+25 more)

### Community 54 - "Inventory schema"
Cohesion: 0.07
Nodes (33): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.fromWarehouseId, StockTransfer.id, StockTransfer.notes, StockTransfer.optionName, StockTransfer.organization (+25 more)

### Community 55 - "Channels schema"
Cohesion: 0.08
Nodes (31): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.channelAccount, ChannelScrapeRun.channelAccountId, ChannelScrapeRun.clientRunKey, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson (+23 more)

### Community 56 - "Channels schema"
Cohesion: 0.07
Nodes (31): RocketPoCatalogLine.businessDateBasis, RocketPoCatalogLine.center, RocketPoCatalogLine.createdAt, RocketPoCatalogLine.hasConfirmation, RocketPoCatalogLine.id, RocketPoCatalogLine.inboundType, RocketPoCatalogLine.orderQty, RocketPoCatalogLine.organization (+23 more)

### Community 57 - "Inventory schema"
Cohesion: 0.08
Nodes (26): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.sourceRef, SellpiaReceiptUploadBatch.sourceType (+18 more)

### Community 58 - "Community 58"
Cohesion: 0.14
Nodes (30): assertCurrentRebuildBinding(), assertProtectedApiDestination(), assertProtectedSupabaseDestination(), assertReplayCounts(), assertReplayFactDigest(), assertSharedDatabaseIdentity(), assertSharedRebuildGuard(), assertUuid() (+22 more)

### Community 59 - "AgentOS schema"
Cohesion: 0.08
Nodes (29): AgentOS, AgentAuthorizationEvent.toolId, AgentInstanceToolPolicy.agentInstance, AgentInstanceToolPolicy.agentInstanceId, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentInstanceToolPolicy.dryRunMode (+21 more)

### Community 60 - "Community 60"
Cohesion: 0.09
Nodes (25): SellpiaInventoryGenerationSchema, SellpiaInventoryQualityReportSchema, SellpiaInventoryRefreshReasonSchema, CompletedSourceArtifactRun, CompletedSourceArtifactRunSchema, CoupangWingCatalogImportResponse, CoupangWingCatalogImportResponseSchema, ImportChanges (+17 more)

### Community 61 - "System schema"
Cohesion: 0.08
Nodes (26): Alert.actionTask, Alert.actorUser, Alert.actorUserId, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead (+18 more)

### Community 62 - "prisma field: externalOptionId canonical option identity"
Cohesion: 0.15
Nodes (23): asRecord(), KidItemFirstRegistrationLinks, normalizedOptionId(), normalizeKidItemFirstRegistrationLinks(), parseKidItemFirstRegistrationLinks(), providerOptionKey(), requiredString(), uuid() (+15 more)

### Community 63 - "AgentOS schema"
Cohesion: 0.07
Nodes (28): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.approver, AgentApprovalRequest.approverUserId, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy, AgentApprovalRequest.decidedByUserId (+20 more)

### Community 64 - "AgentOS schema"
Cohesion: 0.08
Nodes (28): AgentToolInvocation.agentInstance, AgentToolInvocation.approvalRequest, AgentToolInvocation.approvalRequestId, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt, AgentToolInvocation.errorCode (+20 more)

### Community 65 - "Inventory schema"
Cohesion: 0.09
Nodes (27): SellpiaOrderTransmissionIntent.abortedAt, SellpiaOrderTransmissionIntent.createdAt, SellpiaOrderTransmissionIntent.createdBy, SellpiaOrderTransmissionIntent.creator, SellpiaOrderTransmissionIntent.finalizedAt, SellpiaOrderTransmissionIntent.finalizedGeneration, SellpiaOrderTransmissionIntent.id, SellpiaOrderTransmissionIntent.intentKey (+19 more)

### Community 66 - "Community 66"
Cohesion: 0.09
Nodes (22): adapterPaths, BROWSER_COLLECTION_ATTENTION_REASONS, BROWSER_COLLECTION_PRODUCERS, BROWSER_COLLECTION_STATES, BrowserCollectionAttentionReasonSchema, BrowserCollectionClassificationSchema, BrowserCollectionCommand, BrowserCollectionCommandSchema (+14 more)

### Community 67 - "Community 67"
Cohesion: 0.14
Nodes (27): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+19 more)

### Community 68 - "Channels schema"
Cohesion: 0.08
Nodes (27): CoupangWingSalesRankDailySnapshot.businessDate, CoupangWingSalesRankDailySnapshot.capturedAt, CoupangWingSalesRankDailySnapshot.categoryHierarchy, CoupangWingSalesRankDailySnapshot.collectedCount, CoupangWingSalesRankDailySnapshot.conversionRate28d, CoupangWingSalesRankDailySnapshot.createdAt, CoupangWingSalesRankDailySnapshot.id, CoupangWingSalesRankDailySnapshot.itemId (+19 more)

### Community 69 - "Community 69"
Cohesion: 0.12
Nodes (23): AdCampaignAccountProjection, AdCampaignDailyRepairPlan, AdCampaignListingProjection, AdCampaignRepairRunInput, AdCampaignRepairSnapshotInput, AdCampaignTargetProjection, AdMetrics, asRecord() (+15 more)

### Community 70 - "Community 70"
Cohesion: 0.12
Nodes (17): ChannelAccountRepositoryAdapter, envelopeToJson(), maskAccessKey(), readCredentialsConfig(), stripLegacyCredentialKeys(), toJsonRecord(), toRecord(), trimToOptional() (+9 more)

### Community 71 - "Community 71"
Cohesion: 0.09
Nodes (17): nextPublicationSequence(), productsFromRows(), resolveIdentities(), RocketPoCatalogRepositoryAdapter, toCompletedRun(), Inject, Injectable, zeroChanges() (+9 more)

### Community 72 - "AgentOS schema"
Cohesion: 0.08
Nodes (24): AgentInstance.adapterConfig, AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.icon, AgentInstance.id, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name (+16 more)

### Community 73 - "Supply schema"
Cohesion: 0.08
Nodes (26): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+18 more)

### Community 74 - "System schema"
Cohesion: 0.08
Nodes (22): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon, Marketplace.id (+14 more)

### Community 75 - "Community 75"
Cohesion: 0.10
Nodes (12): SellpiaRecipeEvidenceAdapter, toEvidenceSku(), Inject, Injectable, ChannelRecipeSuggestionContextRepositoryAdapter, recipeSource(), Injectable, SellpiaRecipeEvidencePort (+4 more)

### Community 76 - "Community 76"
Cohesion: 0.09
Nodes (8): CoupangProviderPort, ChannelSyncRepositoryPort, OrderSyncDeps, ProductSyncDeps, Inject, Optional, Inject, Optional

### Community 77 - "Channels schema"
Cohesion: 0.09
Nodes (25): ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isOfferWinner, ChannelListingOptionDailySnapshot.lastObservedAt, ChannelListingOptionDailySnapshot.listing (+17 more)

### Community 78 - "Community 78"
Cohesion: 0.08
Nodes (23): ChannelSkuMappingComponent, ChannelSkuMappingComponentSchema, ChannelSkuMappingCounts, ChannelSkuMappingCountsSchema, ChannelSkuMappingListItem, ChannelSkuMappingListItemSchema, ChannelSkuMappingListResponse, ChannelSkuMappingListResponseSchema (+15 more)

### Community 79 - "Community 79"
Cohesion: 0.08
Nodes (22): StatisticsCategoryRow, StatisticsCategoryRowSchema, StatisticsDeliveryDaily, StatisticsDeliveryDailySchema, StatisticsDeliveryResponse, StatisticsDeliveryResponseSchema, StatisticsGradeRow, StatisticsGradeRowSchema (+14 more)

### Community 80 - "Community 80"
Cohesion: 0.16
Nodes (16): CoupangCredentials, coupangRequest(), CoupangRequestOptions, generateAuthorization(), approveReturn(), confirmOrderSheets(), DELIVERY_COMPANIES, getOrderSheets() (+8 more)

### Community 81 - "AgentOS schema"
Cohesion: 0.09
Nodes (24): AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy, AgentAuthorizationEvent.decidedByUserId, AgentAuthorizationEvent.decision (+16 more)

### Community 82 - "Channels schema"
Cohesion: 0.09
Nodes (23): ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.id, ChannelScrapeSnapshot.listing, ChannelScrapeSnapshot.listingOption (+15 more)

### Community 83 - "Community 83"
Cohesion: 0.20
Nodes (8): ChannelDashboardController, Controller, CurrentOrganization, Get, Query, CoupangDateRangeQueryDto, ChannelDashboardService, Injectable

### Community 84 - "Community 84"
Cohesion: 0.19
Nodes (20): bigrams(), ChannelRecipeNameEvidence, ChannelRecipeNameIndex, ChannelRecipeNameOption, ChannelRecipeNameSku, compareEvidence(), createChannelRecipeNameIndex(), diceCoefficient() (+12 more)

### Community 85 - "System schema"
Cohesion: 0.10
Nodes (23): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.href (+15 more)

### Community 86 - "Advertising schema"
Cohesion: 0.09
Nodes (23): AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+15 more)

### Community 87 - "Supply schema"
Cohesion: 0.10
Nodes (23): RocketPurchaseConfirmation.channelAccount, RocketPurchaseConfirmation.channelAccountId, RocketPurchaseConfirmation.confirmedAt, RocketPurchaseConfirmation.confirmedBy, RocketPurchaseConfirmation.confirmer, RocketPurchaseConfirmation.createdAt, RocketPurchaseConfirmation.freshnessGeneration, RocketPurchaseConfirmation.id (+15 more)

### Community 88 - "Channels schema"
Cohesion: 0.11
Nodes (22): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.channelAccount, ChannelAccountDailyKpiSnapshot.channelAccountId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+14 more)

### Community 89 - "Community 89"
Cohesion: 0.13
Nodes (21): assembleCompleteSnapshot(), assertSameManifest(), buildCollectionStatus(), countMedia(), countOptions(), derivePhase(), firstDate(), hashCatalogChunkPayload() (+13 more)

### Community 90 - "AgentOS schema"
Cohesion: 0.10
Nodes (21): AgentArtifact.agentInstance, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization, AgentArtifact.request (+13 more)

### Community 91 - "System schema"
Cohesion: 0.10
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+13 more)

### Community 92 - "Channels schema"
Cohesion: 0.11
Nodes (21): CoupangKeywordRankDailySnapshot.adRank, CoupangKeywordRankDailySnapshot.businessDate, CoupangKeywordRankDailySnapshot.capturedAt, CoupangKeywordRankDailySnapshot.createdAt, CoupangKeywordRankDailySnapshot.id, CoupangKeywordRankDailySnapshot.itemId, CoupangKeywordRankDailySnapshot.keyword, CoupangKeywordRankDailySnapshot.organicRank (+13 more)

### Community 93 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): LiveCommerceBroadcastDailySnapshot.broadcasterId, LiveCommerceBroadcastDailySnapshot.broadcasterName, LiveCommerceBroadcastDailySnapshot.broadcastId, LiveCommerceBroadcastDailySnapshot.businessDate, LiveCommerceBroadcastDailySnapshot.capturedAt, LiveCommerceBroadcastDailySnapshot.coverImageUrl, LiveCommerceBroadcastDailySnapshot.createdAt, LiveCommerceBroadcastDailySnapshot.endedAt (+13 more)

### Community 94 - "Orders schema"
Cohesion: 0.10
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 95 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): ShortsTrendDailySnapshot.businessDate, ShortsTrendDailySnapshot.capturedAt, ShortsTrendDailySnapshot.channelName, ShortsTrendDailySnapshot.commentCount, ShortsTrendDailySnapshot.createdAt, ShortsTrendDailySnapshot.id, ShortsTrendDailySnapshot.keyword, ShortsTrendDailySnapshot.likeCount (+13 more)

### Community 96 - "AI schema"
Cohesion: 0.10
Nodes (21): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.contentWorkspace, ThumbnailAnalysis.contentWorkspaceId, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id (+13 more)

### Community 97 - "Community 97"
Cohesion: 0.10
Nodes (18): SupplierHistoryItem, SupplierHistoryItemSchema, SupplierHistoryReport, SupplierHistoryReportSchema, SupplierHistorySummary, SupplierHistorySummarySchema, SupplierProductSalesReport, SupplierProductSalesReportSchema (+10 more)

### Community 98 - "Channels schema"
Cohesion: 0.12
Nodes (20): Channels, CoupangRepresentativeKeywordOverride.createdAt, CoupangRepresentativeKeywordOverride.id, CoupangRepresentativeKeywordOverride.keyword, CoupangRepresentativeKeywordOverride.organization, CoupangRepresentativeKeywordOverride.updatedAt, RocketPoReservation.createdAt, RocketPoReservation.id (+12 more)

### Community 99 - "AgentOS schema"
Cohesion: 0.11
Nodes (20): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id, AgentCostEvent.inputTokens (+12 more)

### Community 100 - "Finance schema"
Cohesion: 0.12
Nodes (20): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit (+12 more)

### Community 101 - "Supply schema"
Cohesion: 0.12
Nodes (20): RocketPurchaseConfirmationLine.channelListingOption, RocketPurchaseConfirmationLine.channelListingOptionId, RocketPurchaseConfirmationLine.confirmation, RocketPurchaseConfirmationLine.confirmationId, RocketPurchaseConfirmationLine.confirmedQuantity, RocketPurchaseConfirmationLine.createdAt, RocketPurchaseConfirmationLine.id, RocketPurchaseConfirmationLine.orderQuantity (+12 more)

### Community 102 - "Channels schema"
Cohesion: 0.12
Nodes (20): SellpiaProductMonthlySales.buyPrice, SellpiaProductMonthlySales.capturedAt, SellpiaProductMonthlySales.createdAt, SellpiaProductMonthlySales.id, SellpiaProductMonthlySales.inAmount, SellpiaProductMonthlySales.inQty, SellpiaProductMonthlySales.optionCode, SellpiaProductMonthlySales.optionName (+12 more)

### Community 103 - "Sourcing schema"
Cohesion: 0.12
Nodes (20): Sourcing1688HotProductDailySnapshot.businessDate, Sourcing1688HotProductDailySnapshot.capturedAt, Sourcing1688HotProductDailySnapshot.createdAt, Sourcing1688HotProductDailySnapshot.id, Sourcing1688HotProductDailySnapshot.imageUrl, Sourcing1688HotProductDailySnapshot.monthlySales, Sourcing1688HotProductDailySnapshot.offerId, Sourcing1688HotProductDailySnapshot.organization (+12 more)

### Community 104 - "Community 104"
Cohesion: 0.11
Nodes (9): ChannelAccountListController, Controller, CurrentOrganization, Get, ChannelAccountRepositoryPort, ChannelAccountQueryService, Inject, Injectable (+1 more)

### Community 105 - "AgentOS schema"
Cohesion: 0.12
Nodes (19): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError, AgentTaskSession.lastRun (+11 more)

### Community 106 - "Channels schema"
Cohesion: 0.12
Nodes (19): CoupangWingTrackedProductDailySnapshot.businessDate, CoupangWingTrackedProductDailySnapshot.capturedAt, CoupangWingTrackedProductDailySnapshot.conversionRate28d, CoupangWingTrackedProductDailySnapshot.createdAt, CoupangWingTrackedProductDailySnapshot.estimatedRevenue28d, CoupangWingTrackedProductDailySnapshot.id, CoupangWingTrackedProductDailySnapshot.organization, CoupangWingTrackedProductDailySnapshot.pvLast28Day (+11 more)

### Community 107 - "Supply schema"
Cohesion: 0.12
Nodes (19): PurchaseOrderSubmissionAttempt.createdAt, PurchaseOrderSubmissionAttempt.errorCode, PurchaseOrderSubmissionAttempt.errorMessage, PurchaseOrderSubmissionAttempt.freshnessGeneration, PurchaseOrderSubmissionAttempt.id, PurchaseOrderSubmissionAttempt.idempotencyKey, PurchaseOrderSubmissionAttempt.organization, PurchaseOrderSubmissionAttempt.providerReference (+11 more)

### Community 108 - "Inventory schema"
Cohesion: 0.12
Nodes (19): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.notes, ReturnTransfer.optionName, ReturnTransfer.organization (+11 more)

### Community 109 - "Community 109"
Cohesion: 0.11
Nodes (17): ChannelSkuAvailabilityComponent, ChannelSkuAvailabilityComponentSchema, ChannelSkuAvailabilityItem, ChannelSkuAvailabilityItemSchema, ChannelSkuAvailabilityListResponse, ChannelSkuAvailabilityListResponseSchema, ChannelSkuAvailabilityMappingStatusSchema, ChannelSkuAvailabilityQuery (+9 more)

### Community 110 - "Community 110"
Cohesion: 0.15
Nodes (14): PRODUCT_LIFECYCLE_STATES, ProductLifecycleState, ProductLifecycleStateSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, MasterImageItem, MasterImageItemSchema, MasterImageRole (+6 more)

### Community 111 - "Community 111"
Cohesion: 0.22
Nodes (17): analyzePrReleaseContract(), changedFilesFromGit(), classifyFiles(), compareSemver(), ghPrBody(), git(), hasReleaseDecision(), isDevelopToMainPromotion() (+9 more)

### Community 112 - "Community 112"
Cohesion: 0.16
Nodes (19): asRecord(), conversionRate(), dailyRawMetricsMatch(), dateStringMatches(), exactHeaderValues(), finiteNumber(), hasExactCoupangAdsDailyRawProvenance(), isExactWholeAccountCampaignRun() (+11 more)

### Community 113 - "Community 113"
Cohesion: 0.25
Nodes (9): ChannelProductMatchingController, Body, Controller, CurrentOrganization, Get, Param, Post, Put (+1 more)

### Community 114 - "Community 114"
Cohesion: 0.11
Nodes (16): CurrentOrganization, Get, Query, AVAILABILITY_STATUSES, ChannelSkuAvailabilityQueryDto, IsIn, IsInt, IsOptional (+8 more)

### Community 115 - "Community 115"
Cohesion: 0.11
Nodes (4): ChannelDashboardRepositoryAdapter, Injectable, ChannelDashboardRepositoryPort, Inject

### Community 116 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.id, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.lastRunId (+10 more)

### Community 117 - "Sourcing schema"
Cohesion: 0.14
Nodes (18): LiveCommerceProductDailySnapshot.broadcastId, LiveCommerceProductDailySnapshot.businessDate, LiveCommerceProductDailySnapshot.capturedAt, LiveCommerceProductDailySnapshot.createdAt, LiveCommerceProductDailySnapshot.id, LiveCommerceProductDailySnapshot.imageUrl, LiveCommerceProductDailySnapshot.organization, LiveCommerceProductDailySnapshot.priceCny (+10 more)

### Community 118 - "Sourcing schema"
Cohesion: 0.13
Nodes (18): NaverKeywordDailySnapshot.averageAdRank, NaverKeywordDailySnapshot.businessDate, NaverKeywordDailySnapshot.capturedAt, NaverKeywordDailySnapshot.competitionIndex, NaverKeywordDailySnapshot.createdAt, NaverKeywordDailySnapshot.id, NaverKeywordDailySnapshot.keyword, NaverKeywordDailySnapshot.monthlyMobileSearchCount (+10 more)

### Community 119 - "Channels schema"
Cohesion: 0.14
Nodes (18): RocketPoCatalogSnapshot.channelAccount, RocketPoCatalogSnapshot.channelAccountId, RocketPoCatalogSnapshot.collectionRunId, RocketPoCatalogSnapshot.createdAt, RocketPoCatalogSnapshot.detailPoCount, RocketPoCatalogSnapshot.id, RocketPoCatalogSnapshot.listPagesRead, RocketPoCatalogSnapshot.organization (+10 more)

### Community 120 - "Channels schema"
Cohesion: 0.12
Nodes (18): RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt, RocketPurchaseOrder.firstSkuName, RocketPurchaseOrder.id, RocketPurchaseOrder.items, RocketPurchaseOrder.orderAmount, RocketPurchaseOrder.orderedAt (+10 more)

### Community 121 - "Community 121"
Cohesion: 0.11
Nodes (16): CANCEL_OPERATION_TARGET_TYPES, CancelOperationAffected, CancelOperationAffectedSchema, CancelOperationPreserved, CancelOperationPreservedSchema, CancelOperationResponse, CancelOperationResponseSchema, CancelOperationStatus (+8 more)

### Community 122 - "Community 122"
Cohesion: 0.12
Nodes (5): Inject, ChannelSkuAvailabilityPort, ChannelProductMatchingRepositoryPort, Inject, Inject

### Community 123 - "Community 123"
Cohesion: 0.18
Nodes (8): ChannelCatalogCollectionRepositoryAdapter, isUniqueConstraintError(), ownedRunWhere(), Injectable, ChannelCatalogCollectionChunkRecord, ChannelCatalogCollectionRunRecord, ChannelCatalogCollectionWithChunks, startRun()

### Community 124 - "Community 124"
Cohesion: 0.19
Nodes (9): assertCanonicalCoupangAccountIdentity(), canonicalParentRows(), ChannelCatalogImportRepositoryAdapter, importResponse(), isUniqueConstraintError(), nextPublicationSequence(), Injectable, zeroChanges() (+1 more)

### Community 125 - "Supply schema"
Cohesion: 0.13
Nodes (16): Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.id, Supplier.leadTimeDays, Supplier.name, Supplier.notes (+8 more)

### Community 126 - "Community 126"
Cohesion: 0.23
Nodes (5): Inject, ChannelCatalogCollectionPort, ChannelCatalogCollectionService, parseRequest(), Injectable

### Community 127 - "Community 127"
Cohesion: 0.12
Nodes (6): CoupangProviderAdapter, Inject, Injectable, OrderSheetResponse, SellerProductExternalSkuResponse, CoupangCredentialsPort

### Community 128 - "AgentOS schema"
Cohesion: 0.15
Nodes (16): AgentRunEvent.agentInstance, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message, AgentRunEvent.organization (+8 more)

### Community 129 - "Channels schema"
Cohesion: 0.16
Nodes (16): ChannelScrapeChunk.checksum, ChannelScrapeChunk.createdAt, ChannelScrapeChunk.id, ChannelScrapeChunk.itemCount, ChannelScrapeChunk.kind, ChannelScrapeChunk.organization, ChannelScrapeChunk.payload, ChannelScrapeChunk.publicationJson (+8 more)

### Community 130 - "Channels schema"
Cohesion: 0.14
Nodes (16): CoupangWingTrackedProduct.brandName, CoupangWingTrackedProduct.categoryHierarchy, CoupangWingTrackedProduct.createdAt, CoupangWingTrackedProduct.enabled, CoupangWingTrackedProduct.id, CoupangWingTrackedProduct.imagePath, CoupangWingTrackedProduct.itemId, CoupangWingTrackedProduct.lastCapturedAt (+8 more)

### Community 131 - "Advertising schema"
Cohesion: 0.13
Nodes (16): ExecutionTask.action, ExecutionTask.actionId, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt, ExecutionTask.errorMessage, ExecutionTask.finishedAt (+8 more)

### Community 132 - "Supply schema"
Cohesion: 0.13
Nodes (16): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.dueDate, SupplierPayment.id, SupplierPayment.notes, SupplierPayment.organization, SupplierPayment.paidAmount, SupplierPayment.paidDate (+8 more)

### Community 133 - "AI schema"
Cohesion: 0.13
Nodes (15): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt (+7 more)

### Community 134 - "Community 134"
Cohesion: 0.24
Nodes (14): analyzeReconstructionTriggers(), changedFilesFromGit(), ghPrBody(), git(), isCrossLayerControlChange(), isHighRiskBoundary(), isLargeServiceOrComponent(), layerOf() (+6 more)

### Community 135 - "Community 135"
Cohesion: 0.28
Nodes (10): ChannelCatalogCollectionController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+2 more)

### Community 136 - "Community 136"
Cohesion: 0.13
Nodes (8): RocketPoCatalogPort, RocketPoCatalogResolution, canonicalArtifactHash(), isCompleteCollection(), RocketPoCatalogService, Inject, Injectable, RocketPurchasePreviewRequestSchema

### Community 137 - "Orders schema"
Cohesion: 0.14
Nodes (15): CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing (+7 more)

### Community 138 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 139 - "Sourcing schema"
Cohesion: 0.17
Nodes (15): NaverPopularKeywordDailySnapshot.boardKey, NaverPopularKeywordDailySnapshot.boardLabel, NaverPopularKeywordDailySnapshot.businessDate, NaverPopularKeywordDailySnapshot.capturedAt, NaverPopularKeywordDailySnapshot.cid, NaverPopularKeywordDailySnapshot.createdAt, NaverPopularKeywordDailySnapshot.id, NaverPopularKeywordDailySnapshot.keyword (+7 more)

### Community 140 - "Finance schema"
Cohesion: 0.14
Nodes (15): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.id, ProcessingCost.master, ProcessingCost.notes, ProcessingCost.organization, ProcessingCost.processType, ProcessingCost.productName (+7 more)

### Community 141 - "Finance schema"
Cohesion: 0.15
Nodes (15): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.organization, SalesPlan.period (+7 more)

### Community 142 - "Channels schema"
Cohesion: 0.16
Nodes (15): SellpiaSalesDailySnapshot.businessDate, SellpiaSalesDailySnapshot.capturedAt, SellpiaSalesDailySnapshot.channelGroup, SellpiaSalesDailySnapshot.costKrw, SellpiaSalesDailySnapshot.createdAt, SellpiaSalesDailySnapshot.id, SellpiaSalesDailySnapshot.organization, SellpiaSalesDailySnapshot.qty (+7 more)

### Community 143 - "Inventory schema"
Cohesion: 0.15
Nodes (15): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items, StockAudit.matchedCount (+7 more)

### Community 144 - "Supply schema"
Cohesion: 0.16
Nodes (15): SupplierProduct.createdAt, SupplierProduct.id, SupplierProduct.isPrimary, SupplierProduct.memo, SupplierProduct.minOrderQty, SupplierProduct.organization, SupplierProduct.sellpiaInventorySku, SupplierProduct.sellpiaInventorySkuId (+7 more)

### Community 145 - "Community 145"
Cohesion: 0.18
Nodes (12): assertActiveCoupangAccount(), assertCanonicalAccount(), completeCollectionRun(), completedCollectionResult(), jsonRecord(), lockAccount(), lockCollectionRun(), nextPublicationSequence() (+4 more)

### Community 146 - "Community 146"
Cohesion: 0.20
Nodes (9): ChannelProductMatchingQuery, ChannelSkuAvailabilityService, matchesStatus(), toAvailabilityItem(), Injectable, item(), createDetailChunk(), publish() (+1 more)

### Community 147 - "Finance schema"
Cohesion: 0.15
Nodes (14): Finance, GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.listing, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization (+6 more)

### Community 148 - "Advertising schema"
Cohesion: 0.15
Nodes (14): ExecutionTask.workerId, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentTaskRef, ExecutionWorker.currentUrl, ExecutionWorker.id, ExecutionWorker.label, ExecutionWorker.lastHeartbeatAt (+6 more)

### Community 149 - "Finance schema"
Cohesion: 0.15
Nodes (14): ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description, ManualLedger.id (+6 more)

### Community 150 - "Community 150"
Cohesion: 0.14
Nodes (12): CoupangDirectCenter, CoupangDirectCenterSchema, CoupangDirectOrderCollectionRequest, CoupangDirectOrderCollectionRequestSchema, CoupangDirectOrderItem, CoupangDirectOrderItemSchema, CoupangDirectOrderStatus, CoupangDirectOrderStatusSchema (+4 more)

### Community 151 - "Community 151"
Cohesion: 0.27
Nodes (12): analyzeSchemaArtifactSync(), changedFilesFromGit(), changedFilesFromWorkingTree(), GENERATED_ARTIFACT_PATHS, git(), main(), matchesAnyPath(), mergeChangedFiles() (+4 more)

### Community 152 - "Community 152"
Cohesion: 0.23
Nodes (11): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), main(), parseBaseline(), readFiles(), repoRoot(), walk() (+3 more)

### Community 153 - "Community 153"
Cohesion: 0.17
Nodes (6): ChannelsOperationAlertAdapter, Inject, Injectable, OperationAlertPort, OperationLifecyclePatch, StartOperationAlertInput

### Community 154 - "Supply schema"
Cohesion: 0.19
Nodes (13): Supply, RocketPurchaseConfirmationAllocation.confirmationLine, RocketPurchaseConfirmationAllocation.confirmationLineId, RocketPurchaseConfirmationAllocation.createdAt, RocketPurchaseConfirmationAllocation.id, RocketPurchaseConfirmationAllocation.organization, RocketPurchaseConfirmationAllocation.quantity, RocketPurchaseConfirmationAllocation.sellpiaInventorySku (+5 more)

### Community 155 - "Channels schema"
Cohesion: 0.19
Nodes (13): CoupangKeywordSerpDailySnapshot.businessDate, CoupangKeywordSerpDailySnapshot.capturedAt, CoupangKeywordSerpDailySnapshot.createdAt, CoupangKeywordSerpDailySnapshot.id, CoupangKeywordSerpDailySnapshot.itemCount, CoupangKeywordSerpDailySnapshot.items, CoupangKeywordSerpDailySnapshot.keyword, CoupangKeywordSerpDailySnapshot.organization (+5 more)

### Community 156 - "Core schema"
Cohesion: 0.17
Nodes (13): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+5 more)

### Community 157 - "Channels schema"
Cohesion: 0.18
Nodes (13): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson, RocketSupplyDailySnapshot.revenueKrw (+5 more)

### Community 158 - "Community 158"
Cohesion: 0.29
Nodes (13): asRecord(), assertNoPii(), buildReplayBody(), buildReplayKpis(), cloneReplayValue(), containsPiiValue(), copyString(), dateOnly() (+5 more)

### Community 159 - "Community 159"
Cohesion: 0.18
Nodes (8): ChannelAccountController, Body, Controller, CurrentOrganization, Get, UpdateCoupangAccountSettingsSchema, Patch, Roles

### Community 160 - "Community 160"
Cohesion: 0.23
Nodes (12): upsertChannelCatalogIdentities(), applyProductLinksInBatches(), applyVariantLinksInBatches(), buildCatalogProductProvisioningListings(), publishCatalogOperationalProducts(), unique(), validateProvisionedLinks(), flattenMedia() (+4 more)

### Community 161 - "Channels schema"
Cohesion: 0.20
Nodes (12): CoupangKeywordTracker.createdAt, CoupangKeywordTracker.enabled, CoupangKeywordTracker.id, CoupangKeywordTracker.keyword, CoupangKeywordTracker.lastCapturedAt, CoupangKeywordTracker.maxPages, CoupangKeywordTracker.organization, CoupangKeywordTracker.updatedAt (+4 more)

### Community 162 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 163 - "Community 163"
Cohesion: 0.26
Nodes (9): DETAIL_IMAGE_COUNTS, DETAIL_PAGE_AGE_GROUPS, DETAIL_PAGE_TEMPLATE_IDS, DetailImageCount, DetailImageCountSchema, DetailPageAgeGroup, DetailPageAgeGroupSchema, DetailPageTemplateId (+1 more)

### Community 164 - "Community 164"
Cohesion: 0.18
Nodes (3): ChannelCatalogCollectionRepositoryPort, ChannelCatalogPublicationPort, Inject

### Community 165 - "Advertising schema"
Cohesion: 0.20
Nodes (10): Advertising, ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.id, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.url (+2 more)

### Community 166 - "System schema"
Cohesion: 0.20
Nodes (11): ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization, ActivityEvent.source (+3 more)

### Community 167 - "Core schema"
Cohesion: 0.22
Nodes (11): CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.keywords, CategoryMapping.organization, CategoryMapping.updatedAt (+3 more)

### Community 168 - "System schema"
Cohesion: 0.20
Nodes (10): FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name, FeatureGate.updatedAt (+2 more)

### Community 169 - "Supply schema"
Cohesion: 0.20
Nodes (11): PurchaseOrderItem.createdAt, PurchaseOrderItem.id, PurchaseOrderItem.order, PurchaseOrderItem.organization, PurchaseOrderItem.productName, PurchaseOrderItem.quantity, PurchaseOrderItem.sellpiaInventorySku, PurchaseOrderItem.sellpiaInventorySkuId (+3 more)

### Community 170 - "Sourcing schema"
Cohesion: 0.22
Nodes (11): TrendSeedKeyword.createdAt, TrendSeedKeyword.enabled, TrendSeedKeyword.id, TrendSeedKeyword.keyword, TrendSeedKeyword.keywordCn, TrendSeedKeyword.organization, TrendSeedKeyword.sources, TrendSeedKeyword.updatedAt (+3 more)

### Community 171 - "Community 171"
Cohesion: 0.38
Nodes (9): checkTrackedClaudeDirectory(), findClaudeShimFindings(), findInstructionChainSizeFindings(), findStaleInstructionLines(), git(), listRepositoryFiles(), listTracked(), main() (+1 more)

### Community 172 - "Community 172"
Cohesion: 0.35
Nodes (9): analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), directOutPortFiles(), FORBIDDEN_IN_PORT_FOLDER_NAMES, forbiddenInPortCallerFolders(), listDirectories(), listFiles(), main() (+1 more)

### Community 173 - "Community 173"
Cohesion: 0.31
Nodes (9): addUnique(), defaultOutputDir, defaultSourceDir, normalizeKiditemOrigin(), patchExtensionRuntimeFiles(), patchManifest(), prepareCoupangExtension(), repoRoot (+1 more)

### Community 174 - "System schema"
Cohesion: 0.24
Nodes (10): System, SystemSetting.createdAt, SystemSetting.id, SystemSetting.key, SystemSetting.organization, SystemSetting.updatedAt, SystemSetting.value, SystemSetting (+2 more)

### Community 175 - "Advertising schema"
Cohesion: 0.22
Nodes (10): ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task, ExecutionLog.taskId (+2 more)

### Community 176 - "Sourcing schema"
Cohesion: 0.27
Nodes (10): SourcingWorkspaceSnapshot.businessDate, SourcingWorkspaceSnapshot.createdAt, SourcingWorkspaceSnapshot.id, SourcingWorkspaceSnapshot.organization, SourcingWorkspaceSnapshot.payload, SourcingWorkspaceSnapshot.scope, SourcingWorkspaceSnapshot.updatedAt, SourcingWorkspaceSnapshot (+2 more)

### Community 177 - "Community 177"
Cohesion: 0.20
Nodes (8): CoupangCategorySuggestion, CoupangCategorySuggestionRequest, CoupangCategorySuggestionRequestSchema, CoupangCategorySuggestionResponse, CoupangCategorySuggestionResponseSchema, CoupangCategorySuggestionResult, CoupangCategorySuggestionResultSchema, CoupangCategorySuggestionSchema

### Community 178 - "Community 178"
Cohesion: 0.20
Nodes (6): ErrorCodes, deletedLegacyTables, repoRoot, retiredBaselineScript, retiredImporterFile, retiredPlannerFile

### Community 179 - "Community 179"
Cohesion: 0.49
Nodes (6): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), scrubDeep(), scrubSecrets(), walk()

### Community 180 - "Community 180"
Cohesion: 0.31
Nodes (8): parseArgs(), ParsedArgs, parseRawArgs(), ParseRawArgsOptions, pushValue(), values(), COMMANDS, makeArgs()

### Community 181 - "Community 181"
Cohesion: 0.25
Nodes (7): distinct(), evidenceForCode(), evidenceForNames(), normalizePhysicalBarcode(), normalizeRecipeIdentityText(), normalizeRecipeSuggestionName(), ChannelRecipeSuggestionResponseSchema

### Community 182 - "Community 182"
Cohesion: 0.31
Nodes (6): ChannelRecipeAutomationProductTopology, classifyRecipeAutomationProductGroups(), groupDecision(), autoItem, configuredItem, reviewItem

### Community 183 - "Community 183"
Cohesion: 0.22
Nodes (7): ReadinessCheck, ReadinessCheckSchema, ReadinessCheckStatusSchema, ReadinessResponse, ReadinessResponseSchema, RebuildReadinessResponse, RebuildReadinessResponseSchema

### Community 184 - "Community 184"
Cohesion: 0.22
Nodes (9): assertLocalRebuildGuard(), assertLocalDevelopmentDatabase(), bootstrapAuthoritativeInventoryDevelopment(), buildBootstrapPlan(), LOCAL_HOSTS, main(), optionalUuid(), parseBootstrapArgs() (+1 more)

### Community 185 - "Community 185"
Cohesion: 0.31
Nodes (9): addExactHeaderEvidence(), asRecord(), CONVERSION_COUNT_HEADERS, normalizeHeader(), parseObservedCount(), recoverObservedCampaignTargetConversions(), resolveRevenueShapedCampaignTargetConversion(), roundedNumber() (+1 more)

### Community 186 - "Community 186"
Cohesion: 0.25
Nodes (6): AgentCatalogItem, ConfigurableParam, ConfigurableParamSchema, MarketplaceCatalogItem, MarketplaceCatalogItemSchema, WorkflowCatalogItem

### Community 187 - "Community 187"
Cohesion: 0.25
Nodes (6): WorkflowRun, WorkflowRunSchema, WorkflowStepRun, WorkflowStepRunSchema, WorkflowTemplate, WorkflowTemplateSchema

### Community 188 - "Community 188"
Cohesion: 0.46
Nodes (6): analyzeInventory(), listTopLevelScriptFiles(), main(), repoRoot(), SCRIPT_INVENTORY, SUPPORT_FILES

### Community 189 - "Community 189"
Cohesion: 0.29
Nodes (5): AuthRequiredErrorBody, AuthUserPublic, AuthUserPublicSchema, LoginRequest, LoginRequestSchema

### Community 190 - "Community 190"
Cohesion: 0.33
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 191 - "Community 191"
Cohesion: 0.33
Nodes (4): SettlementReconcileDetail, SettlementReconcileDetailSchema, SettlementReconcileResponse, SettlementReconcileResponseSchema

### Community 193 - "Community 193"
Cohesion: 0.40
Nodes (5): asRecord(), buildCampaignQualifiedProductTargetKeys(), cleanString(), rawCampaignAnchor(), rawProductAnchor()

### Community 200 - "Community 200"
Cohesion: 0.50
Nodes (4): is_allowlisted(), is_comment_line(), load_file_lines(), check-tenant-scope.sh script

### Community 201 - "Community 201"
Cohesion: 0.50
Nodes (3): repoRoot, seedPath, serverSeedPath

### Community 202 - "Community 202"
Cohesion: 1.00
Nodes (3): makeRepository(), runRecord(), runWithChunks()

### Community 203 - "Community 203"
Cohesion: 0.67
Nodes (3): accountIdFor(), seedOrderInline(), seedReturnInline()

### Community 205 - "Community 205"
Cohesion: 0.67
Nodes (3): extractEnvKeys(), readModelFile(), redactEnvValues()

## Knowledge Gaps
- **2559 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+2554 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Core schema` to `prisma field: prisma — Shared Schema`, `Inventory schema`, `Orders schema`, `Community 3`, `prisma field: vendorItemId provider term`, `prisma field: AdAction.externalId`, `Community 8`, `Core schema`, `Core schema`, `AI schema`, `AI schema`, `AI schema`, `Core schema`, `Channels schema`, `Community 21`, `Community 23`, `Community 24`, `Core schema`, `AI schema`, `Community 29`, `AgentOS schema`, `AgentOS schema`, `Sourcing schema`, `Inventory schema`, `AI schema`, `AI schema`, `Sourcing schema`, `Inventory schema`, `Core schema`, `Channels schema`, `AI schema`, `Community 49`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `AgentOS schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `Channels schema`, `Community 69`, `AgentOS schema`, `Supply schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `System schema`, `Advertising schema`, `Supply schema`, `Channels schema`, `AgentOS schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Orders schema`, `Sourcing schema`, `AI schema`, `Channels schema`, `AgentOS schema`, `Finance schema`, `Supply schema`, `Channels schema`, `Sourcing schema`, `AgentOS schema`, `Channels schema`, `Supply schema`, `Inventory schema`, `AgentOS schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `Channels schema`, `Supply schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Supply schema`, `AI schema`, `Orders schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Channels schema`, `Inventory schema`, `Supply schema`, `Finance schema`, `Advertising schema`, `Finance schema`, `Supply schema`, `Channels schema`, `Core schema`, `Channels schema`, `Channels schema`, `Advertising schema`, `System schema`, `Core schema`, `System schema`, `Supply schema`, `Sourcing schema`, `System schema`, `Sourcing schema`?**
  _High betweenness centrality (0.218) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `prisma field: vendorItemId provider term` to `prisma field: prisma — Shared Schema`, `Inventory schema`, `Orders schema`, `prisma field: AdAction.externalId`, `Core schema`, `Core schema`, `Core schema`, `AI schema`, `AI schema`, `AI schema`, `Core schema`, `Channels schema`, `Core schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `Sourcing schema`, `Inventory schema`, `AI schema`, `AI schema`, `Sourcing schema`, `Inventory schema`, `Core schema`, `Channels schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `AgentOS schema`, `System schema`, `prisma field: externalOptionId canonical option identity`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `Channels schema`, `AgentOS schema`, `Supply schema`, `System schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `System schema`, `Advertising schema`, `Supply schema`, `Channels schema`, `AgentOS schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Orders schema`, `Sourcing schema`, `AI schema`, `Channels schema`, `AgentOS schema`, `Finance schema`, `Supply schema`, `Channels schema`, `Sourcing schema`, `AgentOS schema`, `Channels schema`, `Supply schema`, `Inventory schema`, `AgentOS schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `Channels schema`, `Supply schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Advertising schema`, `Supply schema`, `AI schema`, `Orders schema`, `System schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Channels schema`, `Inventory schema`, `Supply schema`, `Finance schema`, `Advertising schema`, `Finance schema`, `Supply schema`, `Channels schema`, `Core schema`, `Channels schema`, `Channels schema`, `System schema`, `Advertising schema`, `System schema`, `Core schema`, `System schema`, `Supply schema`, `Sourcing schema`, `System schema`, `Advertising schema`, `Sourcing schema`?**
  _High betweenness centrality (0.149) - this node is a cross-community bridge._
- **Why does `Order` connect `Orders schema` to `prisma field: prisma — Shared Schema`, `Inventory schema`, `Community 3`, `prisma field: vendorItemId provider term`, `prisma field: AdAction.externalId`, `Orders schema`, `Core schema`, `Core schema`, `Community 13`, `Community 14`, `Core schema`, `Community 21`, `Community 22`, `Community 23`, `Community 151`, `Community 152`, `Core schema`, `Community 29`, `Advertising schema`, `Inventory schema`, `Core schema`, `Community 172`, `Community 48`, `Community 49`, `prisma field: externalOptionId canonical option identity`, `Inventory schema`, `Community 66`, `Community 69`, `System schema`, `Community 79`, `Community 80`, `Orders schema`, `Community 97`, `Community 110`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Are the 173 inferred relationships involving `Organization` (e.g. with `channel-account.controller.ts` and `channel-account-list.controller.ts`) actually correct?**
  _`Organization` has 173 INFERRED edges - model-reasoned connections that need verification._
- **Are the 136 inferred relationships involving `ChannelAccount` (e.g. with `channel-account.controller.ts` and `channel-account-list.controller.ts`) actually correct?**
  _`ChannelAccount` has 136 INFERRED edges - model-reasoned connections that need verification._
- **Are the 99 inferred relationships involving `ChannelListing` (e.g. with `channel-registration-capability.adapter.ts` and `channel-listing.controller.ts`) actually correct?**
  _`ChannelListing` has 99 INFERRED edges - model-reasoned connections that need verification._
- **Are the 127 inferred relationships involving `Order` (e.g. with `channel-sync.controller.ts` and `index.ts`) actually correct?**
  _`Order` has 127 INFERRED edges - model-reasoned connections that need verification._