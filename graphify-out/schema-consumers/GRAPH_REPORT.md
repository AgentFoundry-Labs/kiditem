# Graph Report - schema-consumers  (2026-08-04)

## Corpus Check
- 447 files · ~224,442 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 7056 nodes · 41345 edges · 248 communities (230 shown, 18 thin omitted)
- Extraction: 30% EXTRACTED · 70% INFERRED · 0% AMBIGUOUS · INFERRED: 28916 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- prisma field: prisma — Shared Schema
- Community 1
- Orders schema
- prisma field: externalOptionId canonical option identity
- prisma field: AdAction.externalId
- prisma field: AgentToolDefinition.isActive
- Community 6
- Core schema
- Community 8
- Orders schema
- Community 10
- Core schema
- Community 12
- Community 13
- AI schema
- Channels schema
- Core schema
- Community 17
- AI schema
- Core schema
- Community 20
- Core schema
- Sourcing schema
- AI schema
- Community 24
- Community 25
- Community 26
- Community 27
- AgentOS schema
- AI schema
- Community 30
- AI schema
- Core schema
- Sourcing schema
- Community 34
- AgentOS schema
- Community 36
- Advertising schema
- Sourcing schema
- Community 39
- System schema
- Supply schema
- Channels schema
- Inventory schema
- AI schema
- Community 45
- Community 46
- Core schema
- Sourcing schema
- AI schema
- Community 50
- Community 51
- Orders schema
- System schema
- Sourcing schema
- Community 55
- prisma field: ActionTask.targetId
- Community 57
- Community 58
- Community 59
- AI schema
- AI schema
- Channels schema
- Sourcing schema
- Sourcing schema
- Community 65
- Supply schema
- Sourcing schema
- Community 68
- AgentOS schema
- AgentOS schema
- AI schema
- Inventory schema
- Community 73
- Community 74
- Inventory schema
- Supply schema
- Channels schema
- Channels schema
- Inventory schema
- Inventory schema
- Community 81
- Channels schema
- Community 83
- AgentOS schema
- Community 85
- Community 86
- System schema
- AgentOS schema
- AgentOS schema
- Channels schema
- Sourcing schema
- Community 92
- Community 93
- Community 94
- Community 95
- Orders schema
- Channels schema
- Channels schema
- Supply schema
- Community 100
- Channels schema
- Community 102
- Community 103
- AgentOS schema
- Channels schema
- AI schema
- Community 107
- Community 108
- Community 109
- System schema
- Advertising schema
- AgentOS schema
- Orders schema
- prisma field: PurchaseOrder.supplierId
- Community 115
- Community 116
- Community 117
- Sourcing schema
- Channels schema
- Sourcing schema
- Community 121
- AgentOS schema
- AI schema
- System schema
- Channels schema
- Sourcing schema
- Core schema
- Orders schema
- Sourcing schema
- Community 130
- Community 131
- Community 132
- AgentOS schema
- Orders schema
- Finance schema
- Supply schema
- Sourcing schema
- Community 138
- Community 139
- Finance schema
- AgentOS schema
- Orders schema
- Supply schema
- Inventory schema
- Community 145
- Community 146
- Community 147
- Community 148
- AgentOS schema
- Sourcing schema
- Sourcing schema
- System schema
- Channels schema
- Community 154
- Community 155
- Community 156
- Channels schema
- Core schema
- Supply schema
- Community 160
- Community 161
- Community 162
- Community 163
- AgentOS schema
- Channels schema
- Supply schema
- Channels schema
- Supply schema
- Supply schema
- Orders schema
- Community 171
- Community 172
- Community 173
- Orders schema
- System schema
- Sourcing schema
- Finance schema
- Finance schema
- Channels schema
- Inventory schema
- System schema
- Finance schema
- Community 183
- Supply schema
- Channels schema
- Core schema
- Supply schema
- Channels schema
- Sourcing schema
- Community 190
- Community 191
- Community 192
- Channels schema
- Core schema
- System schema
- Community 196
- System schema
- Core schema
- Inventory schema
- Supply schema
- Community 201
- Community 202
- Community 203
- Community 204
- Community 205
- Community 206
- System schema
- Community 208
- Community 209
- Community 210
- Channels schema
- Core schema
- Advertising schema
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
- Community 240
- Community 241
- Community 242
- Community 243
- Community 244

## God Nodes (most connected - your core abstractions)
1. `Organization` - 498 edges
2. `Database ERD` - 411 edges
3. `ChannelAccount` - 203 edges
4. `ChannelListing` - 189 edges
5. `Order` - 189 edges
6. `prisma — Shared Schema` - 188 edges
7. `User` - 187 edges
8. `ProductPreparation.organizationId` - 185 edges
9. `ContentWorkspace.organizationId` - 184 edges
10. `ChannelListing.organizationId` - 181 edges
11. `SourcingLaunchCandidate.organizationId` - 180 edges
12. `ProductRegistrationExecution.organizationId` - 180 edges

## Surprising Connections (you probably didn't know these)
- `packages/shared — @kiditem/shared` --mentions_domain--> `Inventory`  [EXTRACTED]
  packages/shared/AGENTS.md → prisma/models/inventory.prisma
- `assembleCompleteSnapshot()` --indirect_call--> `item()`  [INFERRED]
  apps/server/src/channels/application/service/channel-catalog-collection.service.ts → packages/shared/src/schemas/channel-sku-availability.spec.ts
- `packCounts()` --indirect_call--> `value()`  [INFERRED]
  apps/server/src/channels/domain/channel-recipe-suggestion.ts → scripts/_shared/cli-args.ts
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

## Import Cycles
- None detected.

## Communities (248 total, 18 thin omitted)

### Community 0 - "prisma field: prisma — Shared Schema"
Cohesion: 0.16
Nodes (299): UploadedWorkbookFile, UploadedCsvFile, HEADERS, USER, CHANNEL_ACCOUNT_LIST_SELECT, chunkSelect, ErrorInput, LockedRun (+291 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (138): ActionTask, ActionTaskExecuteResponse, ActionTaskList, ActionTaskListSchema, ActionTaskRelatedProduct, ActionTaskRelatedProductSchema, ActionTaskSchema, ActionTaskSourceAlert (+130 more)

### Community 2 - "Orders schema"
Cohesion: 0.04
Nodes (113): ListingForProductSync, COUPANG_WING_ORDER_SOURCE_TYPE, isYes(), optionalText(), parseCsvRecords(), ParsedRocketSellpiaMatchingCsv, ParsedRocketSellpiaMatchingCsvRow, parseRocketSellpiaMatchingCsv() (+105 more)

### Community 3 - "prisma field: externalOptionId canonical option identity"
Cohesion: 0.03
Nodes (101): ChannelCatalogIdentityProduct, ROCKET_SELLPIA_MATCHING_CSV_SOURCE_TYPE, RocketMatchingCsvCatalogRow, rocketMatchingCsvRowsToCatalogProducts(), ChannelProductCandidate, ChannelProductCandidateRankingInput, emptyEvidence(), keep() (+93 more)

### Community 4 - "prisma field: AdAction.externalId"
Cohesion: 0.06
Nodes (81): ChannelCatalogIdentityMedia, ChannelCatalogIdentityOption, ChannelCatalogIdentityUpsertInput, ChannelCatalogIdentityUpsertResult, PersistedChannelCatalogListing, CanonicalParent, ClaimInput, LockedRunRow (+73 more)

### Community 5 - "prisma field: AgentToolDefinition.isActive"
Cohesion: 0.04
Nodes (84): AgentToolDefinition.isActive, CategoryMapping.isActive, ChannelListing.isActive, ChannelListingOption.isActive, ChannelListingOptionDailySnapshot.isActive, MasterProduct.isActive, Organization.isActive, ScrapeTarget.isActive (+76 more)

### Community 6 - "Community 6"
Cohesion: 0.02
Nodes (101): AgentApprovalRequestSummary, AgentApprovalRequestSummarySchema, AgentApprovalStatus, AgentApprovalStatusSchema, AgentArtifactHandoffSummary, AgentArtifactHandoffSummarySchema, AgentArtifactStatus, AgentArtifactStatusSchema (+93 more)

### Community 7 - "Core schema"
Cohesion: 0.04
Nodes (47): Organization.createdAt, Organization.id, Organization.name, Organization.slug, Organization.updatedAt, Organization, DATA_MIGRATION_IDS, DATA_MIGRATION_RELEASES (+39 more)

### Community 8 - "Community 8"
Cohesion: 0.02
Nodes (80): AdMetricsDetail, AdMetricsDetailSchema, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary, DashboardAdSummarySchema (+72 more)

### Community 9 - "Orders schema"
Cohesion: 0.03
Nodes (70): AVAILABILITY_STATUSES, Review.content, Review.createdAt, Review.externalProductId, Review.externalReviewId, Review.id, Review.imageCount, Review.isBlinded (+62 more)

### Community 10 - "Community 10"
Cohesion: 0.04
Nodes (53): ChannelCatalogImportController, Controller, Inject, ChannelProductMatchingController, Body, Controller, CurrentOrganization, Get (+45 more)

### Community 11 - "Core schema"
Cohesion: 0.04
Nodes (62): ContentGeneration.triggeredByUserId, OrganizationMembership.createdAt, OrganizationMembership.id, OrganizationMembership.invitedBy, OrganizationMembership.invitedById, OrganizationMembership.joinedAt, OrganizationMembership.lastSelectedAt, OrganizationMembership.organization (+54 more)

### Community 12 - "Community 12"
Cohesion: 0.03
Nodes (62): ChannelOptionInventoryComponentInput, ChannelOptionInventoryComponentInputSchema, ChannelOptionSummary, ChannelOptionSummarySchema, CreateMasterProductInput, CreateMasterProductInputSchema, MasterProductDisplayReference, MasterProductDisplayReferenceSchema (+54 more)

### Community 13 - "Community 13"
Cohesion: 0.08
Nodes (60): AdapterCommand, archiveFileName(), archiveShaFileName(), Args, BundleManifest, BundlePackageIndex, BundlePayload, BundleReference (+52 more)

### Community 14 - "AI schema"
Cohesion: 0.04
Nodes (61): packages/shared — @kiditem/shared, AI, ProductPreparation.selectedThumbnailGenerationId, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.contentWorkspaceId, ThumbnailGeneration.createdAt, ThumbnailGeneration.deletedAt (+53 more)

### Community 15 - "Channels schema"
Cohesion: 0.04
Nodes (59): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adCoverageStatus, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d (+51 more)

### Community 16 - "Core schema"
Cohesion: 0.04
Nodes (57): Core, ChannelListingOption.attributesJson, ChannelListingOption.commissionRate, ChannelListingOption.costPriceOverride, ChannelListingOption.createdAt, ChannelListingOption.id, ChannelListingOption.itemName, ChannelListingOption.lastImportRun (+49 more)

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (52): assertNoLocalAuthSecrets(), assertNonProductionTarget(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged(), assertSha256(), BaselineManifest, BaselineManifestExpectation, baselineObjectKeys (+44 more)

### Community 18 - "AI schema"
Cohesion: 0.05
Nodes (52): ContentGeneration.contentWorkspaceId, ContentWorkspace.channelListing, ContentWorkspace.channelListingId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.createdByUserId, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageRevision (+44 more)

### Community 19 - "Core schema"
Cohesion: 0.05
Nodes (50): ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id, ChannelAccount.isPrimary, ChannelAccount.name, ChannelAccount.organization (+42 more)

### Community 20 - "Community 20"
Cohesion: 0.08
Nodes (47): APPLY_STORAGE_CACHE_CONTROL_CONFIRMATION, applyCacheControl(), ApplyResult, applyS3CacheControl(), applySupabaseCacheControl(), assertApplyAllowed(), buildCopyObjectInput(), CliArgs (+39 more)

### Community 21 - "Core schema"
Cohesion: 0.05
Nodes (40): assertExactProductGraph(), MarketplaceRegistrationRepositoryAdapter, Injectable, upsertExactOptionLinks(), MarketplaceRegistrationRepositoryPort, asRecord(), KidItemFirstOptionLink, KidItemFirstRegistrationLinks (+32 more)

### Community 22 - "Sourcing schema"
Cohesion: 0.04
Nodes (51): SourcingLaunchCandidate.blockingRiskCodes, SourcingLaunchCandidate.bundleSnapshot, SourcingLaunchCandidate.candidateSeriesKey, SourcingLaunchCandidate.complianceAssessmentVersionKey, SourcingLaunchCandidate.complianceSnapshot, SourcingLaunchCandidate.complianceStatus, SourcingLaunchCandidate.createdAt, SourcingLaunchCandidate.createdByUser (+43 more)

### Community 23 - "AI schema"
Cohesion: 0.05
Nodes (50): DetailPageImageArtifact.byteLength, DetailPageImageArtifact.contentType, DetailPageImageArtifact.createdAt, DetailPageImageArtifact.createdBy, DetailPageImageArtifact.createdByUserId, DetailPageImageArtifact.id, DetailPageImageArtifact.imageUrl, DetailPageImageArtifact.objectKey (+42 more)

### Community 24 - "Community 24"
Cohesion: 0.04
Nodes (48): CalendarDateSchema, ChecksumSchema, dateRangeSourceFreshness(), FiniteNumberSchema, NullableMetricSchema, ProductAbcAdvertisingSourceFreshnessSchema, ProductAbcAdvertisingSourceStatus, ProductAbcAdvertisingSourceStatusSchema (+40 more)

### Community 25 - "Community 25"
Cohesion: 0.10
Nodes (47): APPLY_DATA_MIGRATIONS_CONFIRMATION, appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertBaselineBinding(), assertBaselineCli(), assertMutatingTarget(), assertRebuildBaselineRestore(), assertUniqueIds() (+39 more)

### Community 26 - "Community 26"
Cohesion: 0.06
Nodes (23): ChannelRegistrationCapabilityAdapter, toSellpiaMatch(), Injectable, ChannelsMarketplaceRegistrationCapabilityPort, ExternalProductRegistrationMatchPreviewInput, ExternalProductRegistrationMatchPreviewResult, ExternalProductRegistrationPreflightInput, ExternalProductRegistrationPreflightResult (+15 more)

### Community 27 - "Community 27"
Cohesion: 0.07
Nodes (37): CurrentOrganization, CurrentUser, Param, Post, UploadedFile, UseInterceptors, cellText(), collectParentMetadataConflicts() (+29 more)

### Community 28 - "AgentOS schema"
Cohesion: 0.05
Nodes (45): AgentRunRequest.agentInstance, AgentRunRequest.agentInstanceId, AgentRunRequest.attempts, AgentRunRequest.claimedAt, AgentRunRequest.claimedBy, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.coalescedIntoRequestId, AgentRunRequest.conversation (+37 more)

### Community 29 - "AI schema"
Cohesion: 0.05
Nodes (43): ContentGeneration.detailPageArtifactId, ContentWorkspace.currentDetailPageArtifactId, ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.contentWorkspaceId, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.createdByUserId (+35 more)

### Community 30 - "Community 30"
Cohesion: 0.09
Nodes (42): apiHeaders(), apiUrl(), Args, assertSafeDatasetId(), assertSupportedReplayPayloads(), BundleManifest, BundlePayload, BundleReference (+34 more)

### Community 31 - "AI schema"
Cohesion: 0.05
Nodes (44): ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.editedHtmlSavedAt, ContentGeneration.errorMessage (+36 more)

### Community 32 - "Core schema"
Cohesion: 0.05
Nodes (44): MasterProductAbcEvaluation.adjustedScore, MasterProductAbcEvaluation.advertisingCoverageEndDate, MasterProductAbcEvaluation.advertisingCoverageStartDate, MasterProductAbcEvaluation.advertisingSourceCapturedAt, MasterProductAbcEvaluation.advertisingSourceStatus, MasterProductAbcEvaluation.calculatedAt, MasterProductAbcEvaluation.calculationStatus, MasterProductAbcEvaluation.costComponentsJson (+36 more)

### Community 33 - "Sourcing schema"
Cohesion: 0.05
Nodes (43): SourcingSourceEntitlementVersion.accountCoverage, SourcingSourceEntitlementVersion.allowedMethod, SourcingSourceEntitlementVersion.categoryCoverage, SourcingSourceEntitlementVersion.coverageDefinition, SourcingSourceEntitlementVersion.createdAt, SourcingSourceEntitlementVersion.credentialRef, SourcingSourceEntitlementVersion.decisionImpact, SourcingSourceEntitlementVersion.denominatorDefinition (+35 more)

### Community 34 - "Community 34"
Cohesion: 0.07
Nodes (23): ChannelSyncController, Body, Controller, CurrentOrganization, CurrentUser, Get, Post, OperationAlertPort (+15 more)

### Community 35 - "AgentOS schema"
Cohesion: 0.05
Nodes (42): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+34 more)

### Community 36 - "Community 36"
Cohesion: 0.05
Nodes (39): BrowserOperationClaim, BrowserOperationClaimRequest, BrowserOperationClaimRequestSchema, BrowserOperationClaimSchema, BrowserOperationHeartbeatRequest, BrowserOperationHeartbeatRequestSchema, BrowserOperationReportRequest, BrowserOperationReportRequestSchema (+31 more)

### Community 37 - "Advertising schema"
Cohesion: 0.06
Nodes (41): Advertising, ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task (+33 more)

### Community 38 - "Sourcing schema"
Cohesion: 0.05
Nodes (41): CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id, CandidateImage.isPrimary (+33 more)

### Community 39 - "Community 39"
Cohesion: 0.08
Nodes (38): automaticReason(), automaticStatus(), BarcodeEvidence, bestSimilarityPerSku(), ChannelRecipeSuggestionDecision, ChannelRecipeSuggestionEvidenceKind, ChannelRecipeSuggestionInput, ChannelRecipeSuggestionResponse (+30 more)

### Community 40 - "System schema"
Cohesion: 0.05
Nodes (34): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon, Marketplace.id (+26 more)

### Community 41 - "Supply schema"
Cohesion: 0.05
Nodes (40): SourcingLaunchCandidate.supplierOfferSkuSnapshotId, SupplierOfferSkuSnapshot.capturedAt, SupplierOfferSkuSnapshot.createdAt, SupplierOfferSkuSnapshot.currency, SupplierOfferSkuSnapshot.dispatchLeadTimeDaysMax, SupplierOfferSkuSnapshot.dispatchLeadTimeDaysMin, SupplierOfferSkuSnapshot.domesticFreightCny, SupplierOfferSkuSnapshot.evidenceObservation (+32 more)

### Community 42 - "Channels schema"
Cohesion: 0.06
Nodes (39): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignIdentity, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel (+31 more)

### Community 43 - "Inventory schema"
Cohesion: 0.06
Nodes (39): InventoryCommitment.businessKey, InventoryCommitment.createdAt, InventoryCommitment.createdBy, InventoryCommitment.creator, InventoryCommitment.id, InventoryCommitment.inventoryGeneration, InventoryCommitment.kind, InventoryCommitment.organization (+31 more)

### Community 44 - "AI schema"
Cohesion: 0.06
Nodes (39): ProductPreparation.approvedAt, ProductPreparation.approvedByUser, ProductPreparation.channelAccount, ProductPreparation.channelAccountId, ProductPreparation.channelListing, ProductPreparation.channelListingId, ProductPreparation.createdAt, ProductPreparation.createdByUser (+31 more)

### Community 45 - "Community 45"
Cohesion: 0.05
Nodes (38): ACCOUNT_AD_DAILY_DIGEST_KEYS, AD_ROW_KEYS, AD_SUMMARY_KEYS, ADS_DAILY_ROW_KEYS, ADS_KPI_KEYS, assertExactCount(), assertReadyCounts(), BootstrapPreflightManifest (+30 more)

### Community 46 - "Community 46"
Cohesion: 0.11
Nodes (27): aggregateMappingStatus(), assertLockedListing(), assertOperationActor(), ChannelListingRepositoryAdapter, contains(), firstPrice(), isUniqueViolation(), ListingRow (+19 more)

### Community 47 - "Core schema"
Cohesion: 0.07
Nodes (38): ChannelListing.lastImportRunId, ChannelListingOption.lastImportRunId, Order.sourceImportRunId, SellpiaInventorySku.lastImportRunId, SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.coverageEndDate (+30 more)

### Community 48 - "Sourcing schema"
Cohesion: 0.06
Nodes (34): ContentGeneration.sourceCandidateId, SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.id, SourcingCandidate.imageUrl (+26 more)

### Community 49 - "AI schema"
Cohesion: 0.06
Nodes (38): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+30 more)

### Community 50 - "Community 50"
Cohesion: 0.05
Nodes (36): deriveSellpiaInventoryFreshness(), FixedSellpiaAccountKeySchema, FixedSellpiaOriginSchema, IsoDateTimeStringSchema, SELLPIA_INVENTORY_COLLECTION_FAILURE_CODES, SELLPIA_INVENTORY_FRESHNESS_STATUSES, SELLPIA_INVENTORY_REFRESH_REASONS, SellpiaFreshnessDerivationInput (+28 more)

### Community 51 - "Community 51"
Cohesion: 0.08
Nodes (32): CHANNEL_LISTING_SORTS, CHANNEL_LISTING_TABS, ChannelListingDeletionDto, ChannelListingDeletionUnresolvedDto, ChannelListingQueryDto, IsIn, IsOptional, IsString (+24 more)

### Community 52 - "Orders schema"
Cohesion: 0.06
Nodes (31): CHANNELS_ROOT, REPO_ROOT, Order.channelAccount, Order.channelAccountId, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber (+23 more)

### Community 53 - "System schema"
Cohesion: 0.06
Nodes (37): OperationRun.attempts, OperationRun.attemptToken, OperationRun.claimedAt, OperationRun.claimedBy, OperationRun.createdAt, OperationRun.definitionVersion, OperationRun.engineType, OperationRun.errorCode (+29 more)

### Community 54 - "Sourcing schema"
Cohesion: 0.06
Nodes (37): SourcingEvidenceObservation.availableAt, SourcingEvidenceObservation.businessDate, SourcingEvidenceObservation.conceptKey, SourcingEvidenceObservation.createdAt, SourcingEvidenceObservation.decisionImpact, SourcingEvidenceObservation.eventAt, SourcingEvidenceObservation.evidenceClass, SourcingEvidenceObservation.evidenceFamily (+29 more)

### Community 55 - "Community 55"
Cohesion: 0.10
Nodes (29): ActiveSellpiaSku, aiProductSuggestion(), asRecord(), availabilityListingWhere(), COMPLETED_CATALOG_SOURCE_TYPES, completedCatalogRunWhere(), distinctStrings(), exactAliasesForOption() (+21 more)

### Community 56 - "prisma field: ActionTask.targetId"
Cohesion: 0.08
Nodes (29): ActionTask.targetId, ActionTask.targetType, AdAction.targetType, AgentArtifact.targetId, Alert.targetId, Alert.targetType, PANEL_RUN_SOURCES, PanelRunSource (+21 more)

### Community 57 - "Community 57"
Cohesion: 0.08
Nodes (33): ClientRenderArtifactSchema, ClientRenderContentTypeSchema, ClientRenderDateSchema, ClientRenderOutputWidthSchema, ClientRenderUuidSchema, ClientRenderVariantSchema, DETAIL_IMAGE_COUNTS, DETAIL_PAGE_AGE_GROUPS (+25 more)

### Community 58 - "Community 58"
Cohesion: 0.10
Nodes (28): upsertChannelCatalogIdentities(), assertActiveCoupangAccount(), assertCanonicalAccount(), ChannelCatalogPublicationRepositoryAdapter, completeCollectionRun(), completedCollectionResult(), flattenMedia(), jsonRecord() (+20 more)

### Community 59 - "Community 59"
Cohesion: 0.06
Nodes (31): ChannelMatchCandidateReason, ChannelMatchCandidateReasonSchema, ChannelMatchEvidence, ChannelMatchEvidenceSchema, ChannelMatchingAccount, ChannelMatchingAccountSchema, ChannelOptionInventoryComponent, ChannelOptionInventoryComponentSchema (+23 more)

### Community 60 - "AI schema"
Cohesion: 0.07
Nodes (35): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height (+27 more)

### Community 61 - "AI schema"
Cohesion: 0.07
Nodes (35): ContentWorkspaceThumbnailSelection.contentAsset, ContentWorkspaceThumbnailSelection.contentAssetId, ContentWorkspaceThumbnailSelection.contentWorkspace, ContentWorkspaceThumbnailSelection.contentWorkspaceId, ContentWorkspaceThumbnailSelection.createdAt, ContentWorkspaceThumbnailSelection.createdByUser, ContentWorkspaceThumbnailSelection.createdByUserId, ContentWorkspaceThumbnailSelection.id (+27 more)

### Community 62 - "Channels schema"
Cohesion: 0.07
Nodes (35): CoupangWingTrackedProduct.brandName, CoupangWingTrackedProduct.categoryHierarchy, CoupangWingTrackedProduct.createdAt, CoupangWingTrackedProduct.enabled, CoupangWingTrackedProduct.id, CoupangWingTrackedProduct.imagePath, CoupangWingTrackedProduct.itemId, CoupangWingTrackedProduct.lastCapturedAt (+27 more)

### Community 63 - "Sourcing schema"
Cohesion: 0.06
Nodes (35): SourcingDecisionBatchItem.baselineDecision, SourcingDecisionBatchItem.capitalAtRiskKrw, SourcingDecisionBatchItem.confidenceKind, SourcingDecisionBatchItem.createdAt, SourcingDecisionBatchItem.decision, SourcingDecisionBatchItem.decisionBatch, SourcingDecisionBatchItem.decisionBatchId, SourcingDecisionBatchItem.decisionConfidence (+27 more)

### Community 64 - "Sourcing schema"
Cohesion: 0.06
Nodes (35): SourcingEvidenceIngestionRun.acceptedCount, SourcingEvidenceIngestionRun.collectorKey, SourcingEvidenceIngestionRun.collectorVersion, SourcingEvidenceIngestionRun.completedAt, SourcingEvidenceIngestionRun.coverageDenominator, SourcingEvidenceIngestionRun.coverageNumerator, SourcingEvidenceIngestionRun.createdAt, SourcingEvidenceIngestionRun.discoveredCount (+27 more)

### Community 65 - "Community 65"
Cohesion: 0.07
Nodes (31): SellpiaInventoryCollectionFailureCodeSchema, SellpiaInventoryGenerationSchema, SellpiaInventoryQualityReportSchema, SellpiaInventoryRefreshReasonSchema, CompletedSourceArtifactRun, CoupangRocketMatchingCsvImportResponse, CoupangWingCatalogImportResponse, CoupangWingCatalogImportResponseSchema (+23 more)

### Community 66 - "Supply schema"
Cohesion: 0.06
Nodes (34): ProcurementTestIntent.createdAt, ProcurementTestIntent.currency, ProcurementTestIntent.decisionBatchItem, ProcurementTestIntent.decisionBatchItemId, ProcurementTestIntent.expectedGoodsTotalCny, ProcurementTestIntent.expiresAt, ProcurementTestIntent.id, ProcurementTestIntent.idempotencyKey (+26 more)

### Community 67 - "Sourcing schema"
Cohesion: 0.07
Nodes (34): ProductRegistrationExecution.channelAccount, ProductRegistrationExecution.channelListing, ProductRegistrationExecution.channelListingId, ProductRegistrationExecution.completedAt, ProductRegistrationExecution.createdAt, ProductRegistrationExecution.executionKind, ProductRegistrationExecution.expectedProviderAccountId, ProductRegistrationExecution.externalListingId (+26 more)

### Community 68 - "Community 68"
Cohesion: 0.08
Nodes (23): RocketSellpiaMatchingCsvImportController, Controller, CurrentOrganization, CurrentUser, Inject, Param, Post, UploadedFile (+15 more)

### Community 69 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+25 more)

### Community 70 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.startedAt, WorkflowRun.status (+25 more)

### Community 71 - "AI schema"
Cohesion: 0.07
Nodes (30): ContentAsset.originGenerationGroupId, ContentGeneration.generationGroupId, ContentGenerationGroup.baseContentGeneration, ContentGenerationGroup.baseContentGenerationId, ContentGenerationGroup.contentWorkspace, ContentGenerationGroup.contentWorkspaceId, ContentGenerationGroup.createdAt, ContentGenerationGroup.createdByUserId (+22 more)

### Community 72 - "Inventory schema"
Cohesion: 0.07
Nodes (33): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.fromWarehouseId, StockTransfer.id, StockTransfer.notes, StockTransfer.optionName, StockTransfer.organization (+25 more)

### Community 73 - "Community 73"
Cohesion: 0.07
Nodes (31): DeliveryCompany, DeliveryCompanySchema, Order, OrderActionResponse, OrderActionResponseSchema, OrderLineItem, OrderLineItemSchema, OrderListItem (+23 more)

### Community 74 - "Community 74"
Cohesion: 0.09
Nodes (16): assertCanonicalCoupangAccountIdentity(), canonicalParentRows(), ChannelCatalogImportRepositoryAdapter, importResponse(), isUniqueConstraintError(), nextPublicationSequence(), Injectable, zeroChanges() (+8 more)

### Community 75 - "Inventory schema"
Cohesion: 0.07
Nodes (32): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.organization, PickingItem.pickedAt, PickingItem.pickingList (+24 more)

### Community 76 - "Supply schema"
Cohesion: 0.07
Nodes (32): RocketPurchaseConfirmation.artifactBytes, RocketPurchaseConfirmation.artifactContentType, RocketPurchaseConfirmation.artifactFileName, RocketPurchaseConfirmation.artifactSha256, RocketPurchaseConfirmation.artifactStoredAt, RocketPurchaseConfirmation.channelAccount, RocketPurchaseConfirmation.channelAccountId, RocketPurchaseConfirmation.completedAt (+24 more)

### Community 77 - "Channels schema"
Cohesion: 0.08
Nodes (31): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.channelAccount, ChannelScrapeRun.channelAccountId, ChannelScrapeRun.clientRunKey, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson (+23 more)

### Community 78 - "Channels schema"
Cohesion: 0.07
Nodes (31): RocketPoCatalogLine.businessDateBasis, RocketPoCatalogLine.center, RocketPoCatalogLine.createdAt, RocketPoCatalogLine.hasConfirmation, RocketPoCatalogLine.id, RocketPoCatalogLine.inboundType, RocketPoCatalogLine.orderQty, RocketPoCatalogLine.organization (+23 more)

### Community 79 - "Inventory schema"
Cohesion: 0.07
Nodes (30): SellpiaInventoryState.activeGeneration, SellpiaInventoryState.activeSyncLeaseExpiresAt, SellpiaInventoryState.activeSyncOwner, SellpiaInventoryState.activeSyncOwnerUserId, SellpiaInventoryState.activeSyncScope, SellpiaInventoryState.activeSyncStartedAt, SellpiaInventoryState.activeSyncToken, SellpiaInventoryState.createdAt (+22 more)

### Community 80 - "Inventory schema"
Cohesion: 0.09
Nodes (27): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.sourceRef, SellpiaReceiptUploadBatch.sourceType (+19 more)

### Community 81 - "Community 81"
Cohesion: 0.14
Nodes (14): ChannelListingController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+6 more)

### Community 82 - "Channels schema"
Cohesion: 0.09
Nodes (23): CoupangRocketPurchaseOrderOperationHandler, Inject, Injectable, CHANNELS_OPERATIONS, CoupangRocketPurchaseOrderInputSchema, RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt (+15 more)

### Community 83 - "Community 83"
Cohesion: 0.10
Nodes (18): Inject, ChannelAccountRepositoryAdapter, envelopeToJson(), maskAccessKey(), readCredentialsConfig(), stripLegacyCredentialKeys(), toJsonRecord(), toRecord() (+10 more)

### Community 84 - "AgentOS schema"
Cohesion: 0.08
Nodes (29): AgentOS, AgentAuthorizationEvent.toolId, AgentInstanceToolPolicy.agentInstance, AgentInstanceToolPolicy.agentInstanceId, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentInstanceToolPolicy.dryRunMode (+21 more)

### Community 85 - "Community 85"
Cohesion: 0.08
Nodes (17): ChannelAccountController, Body, Controller, CurrentOrganization, Get, RocketAccountController, Controller, CurrentOrganization (+9 more)

### Community 86 - "Community 86"
Cohesion: 0.10
Nodes (10): SellpiaRecipeEvidenceAdapter, toEvidenceSku(), Inject, Injectable, SellpiaRecipeEvidencePort, SellpiaRecipeEvidenceSku, ChannelRecipeSuggestionContextRepositoryPort, SellpiaManualMatchRepositoryPort (+2 more)

### Community 87 - "System schema"
Cohesion: 0.08
Nodes (26): Alert.actionTask, Alert.actorUser, Alert.actorUserId, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead (+18 more)

### Community 88 - "AgentOS schema"
Cohesion: 0.07
Nodes (28): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.approver, AgentApprovalRequest.approverUserId, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy, AgentApprovalRequest.decidedByUserId (+20 more)

### Community 89 - "AgentOS schema"
Cohesion: 0.08
Nodes (28): AgentToolInvocation.agentInstance, AgentToolInvocation.approvalRequest, AgentToolInvocation.approvalRequestId, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt, AgentToolInvocation.errorCode (+20 more)

### Community 90 - "Channels schema"
Cohesion: 0.08
Nodes (26): ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.id, ChannelScrapeSnapshot.listing, ChannelScrapeSnapshot.listingOption (+18 more)

### Community 91 - "Sourcing schema"
Cohesion: 0.08
Nodes (28): SourcingDecisionBatch.businessDate, SourcingDecisionBatch.capitalBudgetKrw, SourcingDecisionBatch.category, SourcingDecisionBatch.constraintSetHash, SourcingDecisionBatch.createdAt, SourcingDecisionBatch.decisionAt, SourcingDecisionBatch.decisionMode, SourcingDecisionBatch.evidenceCutoffAt (+20 more)

### Community 92 - "Community 92"
Cohesion: 0.08
Nodes (22): ChannelAccountListItem, ChannelAccountListItemSchema, CoupangAccountSettings, CoupangAccountSettingsSchema, UpdateCoupangAccountSettings, ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow (+14 more)

### Community 93 - "Community 93"
Cohesion: 0.11
Nodes (24): AdCampaignAccountProjection, AdCampaignDailyRepairPlan, AdCampaignListingProjection, AdCampaignRepairRunInput, AdCampaignRepairSnapshotInput, AdCampaignTargetProjection, AdMetrics, asRecord() (+16 more)

### Community 94 - "Community 94"
Cohesion: 0.14
Nodes (27): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+19 more)

### Community 95 - "Community 95"
Cohesion: 0.09
Nodes (18): nextPublicationSequence(), productsFromRows(), publishIdentities(), resolveIdentities(), RocketPoCatalogRepositoryAdapter, toCompletedRun(), Injectable, zeroChanges() (+10 more)

### Community 96 - "Orders schema"
Cohesion: 0.09
Nodes (27): Orders, Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.id, Shipment.order (+19 more)

### Community 97 - "Channels schema"
Cohesion: 0.08
Nodes (27): ChannelListingDeletionOperation.authorizationExpiresAt, ChannelListingDeletionOperation.channelAccount, ChannelListingDeletionOperation.channelListing, ChannelListingDeletionOperation.channelListingId, ChannelListingDeletionOperation.completedAt, ChannelListingDeletionOperation.createdAt, ChannelListingDeletionOperation.expectedProviderAccountId, ChannelListingDeletionOperation.externalListingId (+19 more)

### Community 98 - "Channels schema"
Cohesion: 0.08
Nodes (27): CoupangWingSalesRankDailySnapshot.businessDate, CoupangWingSalesRankDailySnapshot.capturedAt, CoupangWingSalesRankDailySnapshot.categoryHierarchy, CoupangWingSalesRankDailySnapshot.collectedCount, CoupangWingSalesRankDailySnapshot.conversionRate28d, CoupangWingSalesRankDailySnapshot.createdAt, CoupangWingSalesRankDailySnapshot.id, CoupangWingSalesRankDailySnapshot.itemId (+19 more)

### Community 99 - "Supply schema"
Cohesion: 0.08
Nodes (26): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+18 more)

### Community 100 - "Community 100"
Cohesion: 0.09
Nodes (6): CoupangProviderPort, ChannelSyncRepositoryPort, OrderSyncDeps, ProductSyncDeps, Inject, Optional

### Community 101 - "Channels schema"
Cohesion: 0.09
Nodes (25): ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isOfferWinner, ChannelListingOptionDailySnapshot.lastObservedAt, ChannelListingOptionDailySnapshot.listing (+17 more)

### Community 102 - "Community 102"
Cohesion: 0.08
Nodes (23): CoupangDirectCenter, CoupangDirectCenterSchema, CoupangDirectOrderCollectionRequest, CoupangDirectOrderCollectionRequestSchema, CoupangDirectOrderItem, CoupangDirectOrderItemSchema, CoupangDirectOrderStatus, CoupangDirectOrderStatusSchema (+15 more)

### Community 103 - "Community 103"
Cohesion: 0.09
Nodes (9): Inject, ChannelSkuAvailabilityPort, ChannelProductMatchingRepositoryPort, Inject, ChannelSkuAvailabilityService, matchesStatus(), toAvailabilityItem(), Inject (+1 more)

### Community 104 - "AgentOS schema"
Cohesion: 0.09
Nodes (24): AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy, AgentAuthorizationEvent.decidedByUserId, AgentAuthorizationEvent.decision (+16 more)

### Community 105 - "Channels schema"
Cohesion: 0.10
Nodes (24): SellpiaProductMonthlySales.buyPrice, SellpiaProductMonthlySales.capturedAt, SellpiaProductMonthlySales.costBasis, SellpiaProductMonthlySales.coverageEndDate, SellpiaProductMonthlySales.coverageStartDate, SellpiaProductMonthlySales.createdAt, SellpiaProductMonthlySales.id, SellpiaProductMonthlySales.inAmount (+16 more)

### Community 106 - "AI schema"
Cohesion: 0.09
Nodes (22): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt (+14 more)

### Community 107 - "Community 107"
Cohesion: 0.16
Nodes (22): appendFlag(), appendOption(), appendProjectReferenceDefaults(), appendValues(), commandExport(), commandReplay(), commandSanitize(), parseArgs() (+14 more)

### Community 108 - "Community 108"
Cohesion: 0.20
Nodes (8): ChannelDashboardController, Controller, CurrentOrganization, Get, Query, CoupangDateRangeQueryDto, ChannelDashboardService, Injectable

### Community 109 - "Community 109"
Cohesion: 0.19
Nodes (20): bigrams(), ChannelRecipeNameEvidence, ChannelRecipeNameIndex, ChannelRecipeNameOption, ChannelRecipeNameSku, compareEvidence(), createChannelRecipeNameIndex(), diceCoefficient() (+12 more)

### Community 110 - "System schema"
Cohesion: 0.10
Nodes (23): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.href (+15 more)

### Community 111 - "Advertising schema"
Cohesion: 0.09
Nodes (23): AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+15 more)

### Community 112 - "AgentOS schema"
Cohesion: 0.09
Nodes (23): AgentInstance.adapterConfig, AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.icon, AgentInstance.id, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name (+15 more)

### Community 113 - "Orders schema"
Cohesion: 0.10
Nodes (23): OrderReturn.channelAccount, OrderReturn.channelAccountId, OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.id (+15 more)

### Community 114 - "prisma field: PurchaseOrder.supplierId"
Cohesion: 0.11
Nodes (21): PurchaseOrder.supplierId, SupplierOfferSkuSnapshot.supplierId, SupplierPayment.supplierId, SupplierHistoryItem, SupplierHistoryItemSchema, SupplierHistoryReport, SupplierHistoryReportSchema, SupplierHistorySummary (+13 more)

### Community 115 - "Community 115"
Cohesion: 0.09
Nodes (19): adapterPaths, BROWSER_COLLECTION_ATTENTION_REASONS, BROWSER_COLLECTION_PRODUCERS, BROWSER_COLLECTION_STATES, BrowserCollectionAttentionReasonSchema, BrowserCollectionClassificationSchema, BrowserCollectionCommand, BrowserCollectionCommandSchema (+11 more)

### Community 116 - "Community 116"
Cohesion: 0.13
Nodes (22): assembleCompleteSnapshot(), assertSameManifest(), buildCollectionStatus(), countMedia(), countOptions(), derivePhase(), firstDate(), hashCatalogChunkPayload() (+14 more)

### Community 117 - "Community 117"
Cohesion: 0.10
Nodes (17): aggregateRows(), sameStrings(), strongerMatchedType(), MAX_SELLPIA_MANUAL_MATCH_ROWS, MAX_SELLPIA_MANUAL_MATCH_TARGETS, SellpiaManualMatchCodeSchema, SellpiaManualMatchCollectionFailureCode, SellpiaManualMatchCollectionFailureCodeSchema (+9 more)

### Community 118 - "Sourcing schema"
Cohesion: 0.11
Nodes (22): Sourcing, SourcingWorkspaceSnapshot.businessDate, SourcingWorkspaceSnapshot.createdAt, SourcingWorkspaceSnapshot.id, SourcingWorkspaceSnapshot.organization, SourcingWorkspaceSnapshot.payload, SourcingWorkspaceSnapshot.scope, SourcingWorkspaceSnapshot.updatedAt (+14 more)

### Community 119 - "Channels schema"
Cohesion: 0.11
Nodes (22): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.channelAccount, ChannelAccountDailyKpiSnapshot.channelAccountId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+14 more)

### Community 120 - "Sourcing schema"
Cohesion: 0.11
Nodes (22): TiktokCreativeTrendDailySnapshot.businessDate, TiktokCreativeTrendDailySnapshot.capturedAt, TiktokCreativeTrendDailySnapshot.createdAt, TiktokCreativeTrendDailySnapshot.entityKey, TiktokCreativeTrendDailySnapshot.growthPct, TiktokCreativeTrendDailySnapshot.id, TiktokCreativeTrendDailySnapshot.industry, TiktokCreativeTrendDailySnapshot.label (+14 more)

### Community 121 - "Community 121"
Cohesion: 0.20
Nodes (14): CoupangCredentials, coupangRequest(), CoupangRequestOptions, generateAuthorization(), approveReturn(), confirmOrderSheets(), DELIVERY_COMPANIES, getOrderSheets() (+6 more)

### Community 122 - "AgentOS schema"
Cohesion: 0.10
Nodes (21): AgentArtifact.agentInstance, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization, AgentArtifact.request (+13 more)

### Community 123 - "AI schema"
Cohesion: 0.11
Nodes (21): AiDirectJob.attempts, AiDirectJob.claimedAt, AiDirectJob.claimedBy, AiDirectJob.createdAt, AiDirectJob.finishedAt, AiDirectJob.id, AiDirectJob.jobType, AiDirectJob.lastErrorCode (+13 more)

### Community 124 - "System schema"
Cohesion: 0.10
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+13 more)

### Community 125 - "Channels schema"
Cohesion: 0.11
Nodes (21): CoupangKeywordRankDailySnapshot.adRank, CoupangKeywordRankDailySnapshot.businessDate, CoupangKeywordRankDailySnapshot.capturedAt, CoupangKeywordRankDailySnapshot.createdAt, CoupangKeywordRankDailySnapshot.id, CoupangKeywordRankDailySnapshot.itemId, CoupangKeywordRankDailySnapshot.keyword, CoupangKeywordRankDailySnapshot.organicRank (+13 more)

### Community 126 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): LiveCommerceBroadcastDailySnapshot.broadcasterId, LiveCommerceBroadcastDailySnapshot.broadcasterName, LiveCommerceBroadcastDailySnapshot.broadcastId, LiveCommerceBroadcastDailySnapshot.businessDate, LiveCommerceBroadcastDailySnapshot.capturedAt, LiveCommerceBroadcastDailySnapshot.coverImageUrl, LiveCommerceBroadcastDailySnapshot.createdAt, LiveCommerceBroadcastDailySnapshot.endedAt (+13 more)

### Community 127 - "Core schema"
Cohesion: 0.12
Nodes (21): MasterProductAbcEvaluation.formulaVersionId, MasterProductAbcFormulaVersion.calculationCodeChecksum, MasterProductAbcFormulaVersion.calibrationMetricsJson, MasterProductAbcFormulaVersion.createdAt, MasterProductAbcFormulaVersion.firstActivatedAt, MasterProductAbcFormulaVersion.foldCount, MasterProductAbcFormulaVersion.formulaChecksum, MasterProductAbcFormulaVersion.formulaJson (+13 more)

### Community 128 - "Orders schema"
Cohesion: 0.10
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 129 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): ShortsTrendDailySnapshot.businessDate, ShortsTrendDailySnapshot.capturedAt, ShortsTrendDailySnapshot.channelName, ShortsTrendDailySnapshot.commentCount, ShortsTrendDailySnapshot.createdAt, ShortsTrendDailySnapshot.id, ShortsTrendDailySnapshot.keyword, ShortsTrendDailySnapshot.likeCount (+13 more)

### Community 130 - "Community 130"
Cohesion: 0.20
Nodes (21): assertSharedDatabaseIdentity(), assertSharedRebuildGuard(), bootstrap(), bootstrapPlanFromCli(), buildSharedBootstrapPlan(), cliValue(), createPrisma(), databaseProjectRef() (+13 more)

### Community 131 - "Community 131"
Cohesion: 0.11
Nodes (9): ChannelAccountListController, Controller, CurrentOrganization, Get, ChannelAccountRepositoryPort, ChannelAccountQueryService, Inject, Injectable (+1 more)

### Community 132 - "Community 132"
Cohesion: 0.10
Nodes (7): ChannelsDeletionPasswordAdapter, Injectable, ChannelsDeletionPasswordPort, ChannelListingRepositoryPort, Inject, Optional, Inject

### Community 133 - "AgentOS schema"
Cohesion: 0.11
Nodes (20): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id, AgentCostEvent.inputTokens (+12 more)

### Community 134 - "Orders schema"
Cohesion: 0.12
Nodes (20): OrderLineItem.createdAt, OrderLineItem.externalBarcode, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.metadata, OrderLineItem.optionName, OrderLineItem.order (+12 more)

### Community 135 - "Finance schema"
Cohesion: 0.12
Nodes (20): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit (+12 more)

### Community 136 - "Supply schema"
Cohesion: 0.12
Nodes (20): RocketPurchaseConfirmationLine.channelListingOption, RocketPurchaseConfirmationLine.channelListingOptionId, RocketPurchaseConfirmationLine.collectedAt, RocketPurchaseConfirmationLine.collectedOrderLineItemId, RocketPurchaseConfirmationLine.confirmation, RocketPurchaseConfirmationLine.confirmationId, RocketPurchaseConfirmationLine.confirmedQuantity, RocketPurchaseConfirmationLine.createdAt (+12 more)

### Community 137 - "Sourcing schema"
Cohesion: 0.12
Nodes (20): Sourcing1688HotProductDailySnapshot.businessDate, Sourcing1688HotProductDailySnapshot.capturedAt, Sourcing1688HotProductDailySnapshot.createdAt, Sourcing1688HotProductDailySnapshot.id, Sourcing1688HotProductDailySnapshot.imageUrl, Sourcing1688HotProductDailySnapshot.monthlySales, Sourcing1688HotProductDailySnapshot.offerId, Sourcing1688HotProductDailySnapshot.organization (+12 more)

### Community 138 - "Community 138"
Cohesion: 0.17
Nodes (20): assertCurrentRebuildBinding(), assertProtectedApiDestination(), assertRebuildImportPrerequisites(), assertReplayCounts(), assertReplayFactDigest(), assertStoredImportBinding(), assertUuid(), bindRebuildImports() (+12 more)

### Community 139 - "Community 139"
Cohesion: 0.21
Nodes (18): analyzePrReleaseContract(), changedFilesFromGit(), classifyFiles(), compareSemver(), deletedFilesFromGit(), ghPrBody(), git(), hasReleaseDecision() (+10 more)

### Community 140 - "Finance schema"
Cohesion: 0.11
Nodes (17): Finance, GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.listing, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization (+9 more)

### Community 141 - "AgentOS schema"
Cohesion: 0.12
Nodes (19): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError, AgentTaskSession.lastRun (+11 more)

### Community 142 - "Orders schema"
Cohesion: 0.12
Nodes (19): CoupangDirectPoSnapshot.centerName, CoupangDirectPoSnapshot.channelAccountId, CoupangDirectPoSnapshot.collectedAt, CoupangDirectPoSnapshot.createdAt, CoupangDirectPoSnapshot.deliveryDate, CoupangDirectPoSnapshot.id, CoupangDirectPoSnapshot.isUrgent, CoupangDirectPoSnapshot.itemsJson (+11 more)

### Community 143 - "Supply schema"
Cohesion: 0.12
Nodes (19): PurchaseOrderSubmissionAttempt.createdAt, PurchaseOrderSubmissionAttempt.errorCode, PurchaseOrderSubmissionAttempt.errorMessage, PurchaseOrderSubmissionAttempt.freshnessGeneration, PurchaseOrderSubmissionAttempt.id, PurchaseOrderSubmissionAttempt.idempotencyKey, PurchaseOrderSubmissionAttempt.organization, PurchaseOrderSubmissionAttempt.providerReference (+11 more)

### Community 144 - "Inventory schema"
Cohesion: 0.12
Nodes (19): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.notes, ReturnTransfer.optionName, ReturnTransfer.organization (+11 more)

### Community 145 - "Community 145"
Cohesion: 0.15
Nodes (14): PRODUCT_LIFECYCLE_STATES, ProductLifecycleState, ProductLifecycleStateSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, MasterImageItem, MasterImageItemSchema, MasterImageRole (+6 more)

### Community 146 - "Community 146"
Cohesion: 0.16
Nodes (19): asRecord(), conversionRate(), dailyRawMetricsMatch(), dateStringMatches(), exactHeaderValues(), finiteNumber(), hasExactCoupangAdsDailyRawProvenance(), isExactWholeAccountCampaignRun() (+11 more)

### Community 147 - "Community 147"
Cohesion: 0.19
Nodes (18): assertAllowedArguments(), assertPublishableMain(), copyLoadableExtension(), createArchive(), environmentProfiles, githubReleaseCommand(), gitOutput(), gitSha() (+10 more)

### Community 148 - "Community 148"
Cohesion: 0.11
Nodes (4): ChannelDashboardRepositoryAdapter, Injectable, ChannelDashboardRepositoryPort, Inject

### Community 149 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.id, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.lastRunId (+10 more)

### Community 150 - "Sourcing schema"
Cohesion: 0.14
Nodes (18): LiveCommerceProductDailySnapshot.broadcastId, LiveCommerceProductDailySnapshot.businessDate, LiveCommerceProductDailySnapshot.capturedAt, LiveCommerceProductDailySnapshot.createdAt, LiveCommerceProductDailySnapshot.id, LiveCommerceProductDailySnapshot.imageUrl, LiveCommerceProductDailySnapshot.organization, LiveCommerceProductDailySnapshot.priceCny (+10 more)

### Community 151 - "Sourcing schema"
Cohesion: 0.13
Nodes (18): NaverKeywordDailySnapshot.averageAdRank, NaverKeywordDailySnapshot.businessDate, NaverKeywordDailySnapshot.capturedAt, NaverKeywordDailySnapshot.competitionIndex, NaverKeywordDailySnapshot.createdAt, NaverKeywordDailySnapshot.id, NaverKeywordDailySnapshot.keyword, NaverKeywordDailySnapshot.monthlyMobileSearchCount (+10 more)

### Community 152 - "System schema"
Cohesion: 0.12
Nodes (18): OperationRun.scheduleId, OperationSchedule.createdAt, OperationSchedule.createdBy, OperationSchedule.createdByUserId, OperationSchedule.cronExpression, OperationSchedule.enabled, OperationSchedule.id, OperationSchedule.input (+10 more)

### Community 153 - "Channels schema"
Cohesion: 0.14
Nodes (18): RocketPoCatalogSnapshot.channelAccount, RocketPoCatalogSnapshot.channelAccountId, RocketPoCatalogSnapshot.collectionRunId, RocketPoCatalogSnapshot.createdAt, RocketPoCatalogSnapshot.detailPoCount, RocketPoCatalogSnapshot.id, RocketPoCatalogSnapshot.listPagesRead, RocketPoCatalogSnapshot.organization (+10 more)

### Community 154 - "Community 154"
Cohesion: 0.11
Nodes (16): CANCEL_OPERATION_TARGET_TYPES, CancelOperationAffected, CancelOperationAffectedSchema, CancelOperationPreserved, CancelOperationPreservedSchema, CancelOperationResponse, CancelOperationResponseSchema, CancelOperationStatus (+8 more)

### Community 155 - "Community 155"
Cohesion: 0.12
Nodes (8): CoupangProviderAdapter, Injectable, CoupangCreateSellerProductResponse, CoupangSellerProductPayload, OrderSheetResponse, SellerProductDetailResponse, SellerProductExternalSkuResponse, SellerProductListResponse

### Community 156 - "Community 156"
Cohesion: 0.18
Nodes (8): ChannelCatalogCollectionRepositoryAdapter, isUniqueConstraintError(), ownedRunWhere(), Injectable, ChannelCatalogCollectionChunkRecord, ChannelCatalogCollectionRunRecord, ChannelCatalogCollectionWithChunks, startRun()

### Community 157 - "Channels schema"
Cohesion: 0.16
Nodes (15): normalizeSellpiaManualMatchAlias(), SellpiaManualMatchAlias.aliasTitle, SellpiaManualMatchAlias.createdAt, SellpiaManualMatchAlias.evidenceCount, SellpiaManualMatchAlias.id, SellpiaManualMatchAlias.itemCount, SellpiaManualMatchAlias.matchedType, SellpiaManualMatchAlias.normalizedAlias (+7 more)

### Community 158 - "Core schema"
Cohesion: 0.12
Nodes (17): MasterProductAbcGradeHistory.adjustedScore, MasterProductAbcGradeHistory.calculatedAt, MasterProductAbcGradeHistory.calculationStatus, MasterProductAbcGradeHistory.formulaVersion, MasterProductAbcGradeHistory.formulaVersionId, MasterProductAbcGradeHistory.id, MasterProductAbcGradeHistory.masterProduct, MasterProductAbcGradeHistory.masterProductId (+9 more)

### Community 159 - "Supply schema"
Cohesion: 0.13
Nodes (16): Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.id, Supplier.leadTimeDays, Supplier.name, Supplier.notes (+8 more)

### Community 160 - "Community 160"
Cohesion: 0.15
Nodes (14): IsoDateTimeStringSchema, SellpiaOrderTransmissionIntentAbortResponse, SellpiaOrderTransmissionIntentAbortResponseSchema, SellpiaOrderTransmissionIntentFinalizeResponse, SellpiaOrderTransmissionIntentFinalizeResponseSchema, SellpiaOrderTransmissionIntentKeySchema, SellpiaOrderTransmissionIntentPrepareRequest, SellpiaOrderTransmissionIntentPrepareRequestSchema (+6 more)

### Community 161 - "Community 161"
Cohesion: 0.22
Nodes (17): assertBootstrapPreflightManifest(), assertIsoTimestamp(), assertPositiveIntegerText(), assertPostgresUuid(), assertStagingAccountBaselineManifest(), assertUnique(), buildBootstrapPreflightManifest(), buildChannelAccountFingerprint() (+9 more)

### Community 162 - "Community 162"
Cohesion: 0.23
Nodes (5): Inject, ChannelCatalogCollectionPort, ChannelCatalogCollectionService, parseRequest(), Injectable

### Community 163 - "Community 163"
Cohesion: 0.12
Nodes (15): CurrentOrganization, Get, Query, ChannelSkuAvailabilityQueryDto, IsIn, IsInt, IsOptional, IsString (+7 more)

### Community 164 - "AgentOS schema"
Cohesion: 0.15
Nodes (16): AgentRunEvent.agentInstance, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message, AgentRunEvent.organization (+8 more)

### Community 165 - "Channels schema"
Cohesion: 0.16
Nodes (16): ChannelScrapeChunk.checksum, ChannelScrapeChunk.createdAt, ChannelScrapeChunk.id, ChannelScrapeChunk.itemCount, ChannelScrapeChunk.kind, ChannelScrapeChunk.organization, ChannelScrapeChunk.payload, ChannelScrapeChunk.publicationJson (+8 more)

### Community 166 - "Supply schema"
Cohesion: 0.16
Nodes (16): RocketPurchaseConfirmationTransmission.confirmation, RocketPurchaseConfirmationTransmission.confirmationId, RocketPurchaseConfirmationTransmission.createdAt, RocketPurchaseConfirmationTransmission.id, RocketPurchaseConfirmationTransmission.intentKey, RocketPurchaseConfirmationTransmission.matchedLineCount, RocketPurchaseConfirmationTransmission.observedAt, RocketPurchaseConfirmationTransmission.organization (+8 more)

### Community 167 - "Channels schema"
Cohesion: 0.14
Nodes (16): SellpiaManualMatchAlias.snapshotId, SellpiaManualMatchSnapshot.aliasCount, SellpiaManualMatchSnapshot.capturedAt, SellpiaManualMatchSnapshot.createdAt, SellpiaManualMatchSnapshot.id, SellpiaManualMatchSnapshot.matchedTargetCount, SellpiaManualMatchSnapshot.organization, SellpiaManualMatchSnapshot.schemaVersion (+8 more)

### Community 168 - "Supply schema"
Cohesion: 0.13
Nodes (16): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.dueDate, SupplierPayment.id, SupplierPayment.notes, SupplierPayment.organization, SupplierPayment.paidAmount, SupplierPayment.paidDate (+8 more)

### Community 169 - "Supply schema"
Cohesion: 0.16
Nodes (16): SupplierProduct.createdAt, SupplierProduct.id, SupplierProduct.isPrimary, SupplierProduct.memo, SupplierProduct.minOrderQty, SupplierProduct.organization, SupplierProduct.sellpiaInventorySku, SupplierProduct.sellpiaInventorySkuId (+8 more)

### Community 170 - "Orders schema"
Cohesion: 0.13
Nodes (16): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.externalSku, UnshippedItem.id, UnshippedItem.isNotified, UnshippedItem.notifiedAt, UnshippedItem.optionName, UnshippedItem.order (+8 more)

### Community 171 - "Community 171"
Cohesion: 0.24
Nodes (14): analyzeReconstructionTriggers(), changedFilesFromGit(), ghPrBody(), git(), isCrossLayerControlChange(), isHighRiskBoundary(), isLargeServiceOrComponent(), layerOf() (+6 more)

### Community 172 - "Community 172"
Cohesion: 0.28
Nodes (10): ChannelCatalogCollectionController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+2 more)

### Community 173 - "Community 173"
Cohesion: 0.13
Nodes (8): RocketPoCatalogPort, RocketPoCatalogResolution, canonicalArtifactHash(), isCompleteCollection(), RocketPoCatalogService, Inject, Injectable, RocketPurchasePreviewRequestSchema

### Community 174 - "Orders schema"
Cohesion: 0.14
Nodes (15): CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing (+7 more)

### Community 175 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 176 - "Sourcing schema"
Cohesion: 0.17
Nodes (15): NaverPopularKeywordDailySnapshot.boardKey, NaverPopularKeywordDailySnapshot.boardLabel, NaverPopularKeywordDailySnapshot.businessDate, NaverPopularKeywordDailySnapshot.capturedAt, NaverPopularKeywordDailySnapshot.cid, NaverPopularKeywordDailySnapshot.createdAt, NaverPopularKeywordDailySnapshot.id, NaverPopularKeywordDailySnapshot.keyword (+7 more)

### Community 177 - "Finance schema"
Cohesion: 0.14
Nodes (15): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.id, ProcessingCost.master, ProcessingCost.notes, ProcessingCost.organization, ProcessingCost.processType, ProcessingCost.productName (+7 more)

### Community 178 - "Finance schema"
Cohesion: 0.15
Nodes (15): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.organization, SalesPlan.period (+7 more)

### Community 179 - "Channels schema"
Cohesion: 0.16
Nodes (15): SellpiaSalesDailySnapshot.businessDate, SellpiaSalesDailySnapshot.capturedAt, SellpiaSalesDailySnapshot.channelGroup, SellpiaSalesDailySnapshot.costKrw, SellpiaSalesDailySnapshot.createdAt, SellpiaSalesDailySnapshot.id, SellpiaSalesDailySnapshot.organization, SellpiaSalesDailySnapshot.qty (+7 more)

### Community 180 - "Inventory schema"
Cohesion: 0.15
Nodes (15): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items, StockAudit.matchedCount (+7 more)

### Community 181 - "System schema"
Cohesion: 0.15
Nodes (12): FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name, FeatureGate.updatedAt (+4 more)

### Community 182 - "Finance schema"
Cohesion: 0.15
Nodes (14): ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description, ManualLedger.id (+6 more)

### Community 183 - "Community 183"
Cohesion: 0.26
Nodes (14): asRecord(), assertNoPii(), boundedReplayScope(), buildReplayBody(), buildReplayKpis(), cloneReplayValue(), containsPiiValue(), copyString() (+6 more)

### Community 184 - "Supply schema"
Cohesion: 0.19
Nodes (13): Supply, RocketPurchaseConfirmationAllocation.confirmationLine, RocketPurchaseConfirmationAllocation.confirmationLineId, RocketPurchaseConfirmationAllocation.createdAt, RocketPurchaseConfirmationAllocation.id, RocketPurchaseConfirmationAllocation.organization, RocketPurchaseConfirmationAllocation.quantity, RocketPurchaseConfirmationAllocation.sellpiaInventorySku (+5 more)

### Community 185 - "Channels schema"
Cohesion: 0.19
Nodes (13): CoupangKeywordSerpDailySnapshot.businessDate, CoupangKeywordSerpDailySnapshot.capturedAt, CoupangKeywordSerpDailySnapshot.createdAt, CoupangKeywordSerpDailySnapshot.id, CoupangKeywordSerpDailySnapshot.itemCount, CoupangKeywordSerpDailySnapshot.items, CoupangKeywordSerpDailySnapshot.keyword, CoupangKeywordSerpDailySnapshot.organization (+5 more)

### Community 186 - "Core schema"
Cohesion: 0.17
Nodes (13): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+5 more)

### Community 187 - "Supply schema"
Cohesion: 0.21
Nodes (13): ProcurementTestIntent.selectedPriceTierId, SupplierOfferPriceTier.createdAt, SupplierOfferPriceTier.id, SupplierOfferPriceTier.maxQuantity, SupplierOfferPriceTier.minQuantity, SupplierOfferPriceTier.organization, SupplierOfferPriceTier.supplierOfferSkuSnapshot, SupplierOfferPriceTier.supplierOfferSkuSnapshotId (+5 more)

### Community 188 - "Channels schema"
Cohesion: 0.18
Nodes (13): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson, RocketSupplyDailySnapshot.revenueKrw (+5 more)

### Community 189 - "Sourcing schema"
Cohesion: 0.22
Nodes (13): SourcingDecisionEvidence.createdAt, SourcingDecisionEvidence.decisionBatchItem, SourcingDecisionEvidence.decisionBatchItemId, SourcingDecisionEvidence.evidenceObservation, SourcingDecisionEvidence.evidenceObservationId, SourcingDecisionEvidence.id, SourcingDecisionEvidence.ordinal, SourcingDecisionEvidence.organization (+5 more)

### Community 190 - "Community 190"
Cohesion: 0.29
Nodes (13): assertAllowedRecord(), assertAllowedRows(), assertAllowedScalarRecord(), assertObservedMetrics(), assertOptionalScalar(), assertPlainRecord(), assertReplayBundle(), assertReplayFactCounts() (+5 more)

### Community 191 - "Community 191"
Cohesion: 0.31
Nodes (11): analyzeSchemaArtifactSync(), changedFilesFromGit(), changedFilesFromWorkingTree(), GENERATED_ARTIFACT_PATHS, git(), main(), matchesAnyPath(), mergeChangedFiles() (+3 more)

### Community 192 - "Community 192"
Cohesion: 0.20
Nodes (4): ChannelSyncRepositoryAdapter, reconcileProductDetailOption(), Injectable, ProductListingSyncResult

### Community 193 - "Channels schema"
Cohesion: 0.20
Nodes (12): CoupangKeywordTracker.createdAt, CoupangKeywordTracker.enabled, CoupangKeywordTracker.id, CoupangKeywordTracker.keyword, CoupangKeywordTracker.lastCapturedAt, CoupangKeywordTracker.maxPages, CoupangKeywordTracker.organization, CoupangKeywordTracker.updatedAt (+4 more)

### Community 194 - "Core schema"
Cohesion: 0.18
Nodes (10): MasterProductAbcFormulaState.activatedAt, MasterProductAbcFormulaState.activeFormulaVersion, MasterProductAbcFormulaState.activeFormulaVersionId, MasterProductAbcFormulaState.createdAt, MasterProductAbcFormulaState.organization, MasterProductAbcFormulaState.revision, MasterProductAbcFormulaState.updatedAt, MasterProductAbcFormulaState (+2 more)

### Community 195 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 196 - "Community 196"
Cohesion: 0.18
Nodes (3): ChannelCatalogCollectionRepositoryPort, ChannelCatalogPublicationPort, Inject

### Community 197 - "System schema"
Cohesion: 0.20
Nodes (11): ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization, ActivityEvent.source (+3 more)

### Community 198 - "Core schema"
Cohesion: 0.22
Nodes (11): CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.keywords, CategoryMapping.organization, CategoryMapping.updatedAt (+3 more)

### Community 199 - "Inventory schema"
Cohesion: 0.22
Nodes (11): CoupangShipmentDateSummary.boxes, CoupangShipmentDateSummary.capturedAt, CoupangShipmentDateSummary.count, CoupangShipmentDateSummary.createdAt, CoupangShipmentDateSummary.id, CoupangShipmentDateSummary.organization, CoupangShipmentDateSummary.shipmentDate, CoupangShipmentDateSummary.updatedAt (+3 more)

### Community 200 - "Supply schema"
Cohesion: 0.20
Nodes (11): PurchaseOrderItem.createdAt, PurchaseOrderItem.id, PurchaseOrderItem.order, PurchaseOrderItem.organization, PurchaseOrderItem.productName, PurchaseOrderItem.quantity, PurchaseOrderItem.sellpiaInventorySku, PurchaseOrderItem.sellpiaInventorySkuId (+3 more)

### Community 201 - "Community 201"
Cohesion: 0.20
Nodes (10): canRetryChannelListingDeletionProviderSideEffect(), canRetryProviderSideEffect(), isOperationTerminal(), OPERATION_STATUSES, OperationStatus, OperationStatusSchema, PROVIDER_OUTCOMES, ProviderOutcome (+2 more)

### Community 202 - "Community 202"
Cohesion: 0.22
Nodes (8): CoupangCategorySuggestion, CoupangCategorySuggestionRequest, CoupangCategorySuggestionRequestSchema, CoupangCategorySuggestionResponse, CoupangCategorySuggestionResponseSchema, CoupangCategorySuggestionResult, CoupangCategorySuggestionResultSchema, CoupangCategorySuggestionSchema

### Community 203 - "Community 203"
Cohesion: 0.45
Nodes (7): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), REDACTED_PLACEHOLDER, scrubDeep(), scrubSecrets(), walk()

### Community 204 - "Community 204"
Cohesion: 0.38
Nodes (9): checkTrackedClaudeDirectory(), findClaudeShimFindings(), findInstructionChainSizeFindings(), findStaleInstructionLines(), git(), listRepositoryFiles(), listTracked(), main() (+1 more)

### Community 205 - "Community 205"
Cohesion: 0.35
Nodes (9): analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), directOutPortFiles(), FORBIDDEN_IN_PORT_FOLDER_NAMES, forbiddenInPortCallerFolders(), listDirectories(), listFiles(), main() (+1 more)

### Community 206 - "Community 206"
Cohesion: 0.22
Nodes (5): checkedMatchedType(), SellpiaManualMatchRepositoryAdapter, toStatus(), Injectable, SellpiaManualMatchAliasRecord

### Community 207 - "System schema"
Cohesion: 0.24
Nodes (10): System, SystemSetting.createdAt, SystemSetting.id, SystemSetting.key, SystemSetting.organization, SystemSetting.updatedAt, SystemSetting.value, SystemSetting (+2 more)

### Community 208 - "Community 208"
Cohesion: 0.38
Nodes (8): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), main(), parseBaseline(), readFiles(), repoRoot(), walk()

### Community 209 - "Community 209"
Cohesion: 0.25
Nodes (5): ChannelsOperationAlertAdapter, Inject, Injectable, OperationLifecyclePatch, StartOperationAlertInput

### Community 210 - "Community 210"
Cohesion: 0.25
Nodes (8): distinct(), evidenceForCode(), evidenceForNames(), manualMatchAliasCandidates(), normalizePhysicalBarcode(), normalizeRecipeIdentityText(), normalizeRecipeSuggestionName(), ChannelRecipeSuggestionResponseSchema

### Community 211 - "Channels schema"
Cohesion: 0.25
Nodes (9): Channels, CoupangRepresentativeKeywordOverride.createdAt, CoupangRepresentativeKeywordOverride.id, CoupangRepresentativeKeywordOverride.keyword, CoupangRepresentativeKeywordOverride.organization, CoupangRepresentativeKeywordOverride.updatedAt, CoupangRepresentativeKeywordOverride, coupang_representative_keyword_overrides (+1 more)

### Community 212 - "Core schema"
Cohesion: 0.25
Nodes (9): AuthSession.createdAt, AuthSession.expiresAt, AuthSession.id, AuthSession.revokedAt, AuthSession.tokenHash, AuthSession.user, AuthSession.userId, AuthSession (+1 more)

### Community 213 - "Advertising schema"
Cohesion: 0.25
Nodes (9): ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.id, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.url, ScrapeTarget (+1 more)

### Community 214 - "Community 214"
Cohesion: 0.22
Nodes (7): ReadinessCheck, ReadinessCheckSchema, ReadinessCheckStatusSchema, ReadinessResponse, ReadinessResponseSchema, RebuildReadinessResponse, RebuildReadinessResponseSchema

### Community 215 - "Community 215"
Cohesion: 0.22
Nodes (9): assertLocalRebuildGuard(), assertLocalDevelopmentDatabase(), bootstrapAuthoritativeInventoryDevelopment(), buildBootstrapPlan(), LOCAL_HOSTS, main(), optionalUuid(), parseBootstrapArgs() (+1 more)

### Community 216 - "Community 216"
Cohesion: 0.31
Nodes (9): addExactHeaderEvidence(), asRecord(), CONVERSION_COUNT_HEADERS, normalizeHeader(), parseObservedCount(), recoverObservedCampaignTargetConversions(), resolveRevenueShapedCampaignTargetConversion(), roundedNumber() (+1 more)

### Community 217 - "Community 217"
Cohesion: 0.25
Nodes (6): extractFunction(), extractRetireFunction(), productionWrapper, remote, repoRoot, workflow

### Community 218 - "Community 218"
Cohesion: 0.46
Nodes (6): analyzeInventory(), listTopLevelScriptFiles(), main(), repoRoot(), SCRIPT_INVENTORY, SUPPORT_FILES

### Community 219 - "Community 219"
Cohesion: 0.25
Nodes (4): repoRoot, scriptPath, supportedExtensions, temporaryDirectories

### Community 220 - "Community 220"
Cohesion: 0.33
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 221 - "Community 221"
Cohesion: 0.40
Nodes (5): asRecord(), buildCampaignQualifiedProductTargetKeys(), cleanString(), rawCampaignAnchor(), rawProductAnchor()

### Community 222 - "Community 222"
Cohesion: 0.40
Nodes (4): channelsSchema, coreSchema, packageJson, repoRoot

### Community 225 - "Community 225"
Cohesion: 0.50
Nodes (4): is_allowlisted(), is_comment_line(), load_file_lines(), check-tenant-scope.sh script

### Community 226 - "Community 226"
Cohesion: 0.50
Nodes (4): extractEnvKeys(), readModelFile(), redactEnvText(), redactEnvValues()

### Community 227 - "Community 227"
Cohesion: 1.00
Nodes (3): makeRepository(), runRecord(), runWithChunks()

### Community 228 - "Community 228"
Cohesion: 0.67
Nodes (3): accountIdFor(), seedOrderInline(), seedReturnInline()

## Knowledge Gaps
- **3274 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+3269 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Core schema` to `prisma field: prisma — Shared Schema`, `Orders schema`, `prisma field: AdAction.externalId`, `prisma field: AgentToolDefinition.isActive`, `Community 6`, `Community 8`, `Orders schema`, `Community 10`, `Core schema`, `Community 13`, `AI schema`, `Channels schema`, `Core schema`, `Community 17`, `AI schema`, `Core schema`, `Core schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `AI schema`, `Community 30`, `AI schema`, `Core schema`, `Sourcing schema`, `AgentOS schema`, `Advertising schema`, `Sourcing schema`, `Supply schema`, `Channels schema`, `Inventory schema`, `AI schema`, `Community 45`, `Community 46`, `Core schema`, `Sourcing schema`, `AI schema`, `Orders schema`, `System schema`, `Sourcing schema`, `Community 55`, `prisma field: ActionTask.targetId`, `Community 58`, `AI schema`, `AI schema`, `Channels schema`, `Sourcing schema`, `Sourcing schema`, `Supply schema`, `Sourcing schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Inventory schema`, `Community 73`, `Inventory schema`, `Supply schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Channels schema`, `AgentOS schema`, `Community 85`, `System schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Sourcing schema`, `Community 93`, `Orders schema`, `Channels schema`, `Channels schema`, `Supply schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `AI schema`, `System schema`, `Advertising schema`, `AgentOS schema`, `Orders schema`, `Sourcing schema`, `Channels schema`, `Sourcing schema`, `AgentOS schema`, `AI schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Core schema`, `Orders schema`, `Sourcing schema`, `AgentOS schema`, `Orders schema`, `Finance schema`, `Supply schema`, `Sourcing schema`, `Finance schema`, `AgentOS schema`, `Orders schema`, `Supply schema`, `Inventory schema`, `AgentOS schema`, `Sourcing schema`, `Sourcing schema`, `System schema`, `Channels schema`, `Channels schema`, `Core schema`, `Supply schema`, `AgentOS schema`, `Channels schema`, `Supply schema`, `Channels schema`, `Supply schema`, `Supply schema`, `Orders schema`, `Orders schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Channels schema`, `Inventory schema`, `System schema`, `Finance schema`, `Supply schema`, `Channels schema`, `Core schema`, `Supply schema`, `Channels schema`, `Sourcing schema`, `Channels schema`, `Core schema`, `System schema`, `Core schema`, `Inventory schema`, `Supply schema`, `System schema`, `Channels schema`, `Advertising schema`?**
  _High betweenness centrality (0.225) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `Orders schema` to `prisma field: prisma — Shared Schema`, `prisma field: externalOptionId canonical option identity`, `prisma field: AdAction.externalId`, `prisma field: AgentToolDefinition.isActive`, `Core schema`, `Orders schema`, `Core schema`, `AI schema`, `Channels schema`, `Core schema`, `AI schema`, `Core schema`, `Core schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `AI schema`, `AI schema`, `Core schema`, `Sourcing schema`, `AgentOS schema`, `Advertising schema`, `Sourcing schema`, `System schema`, `Supply schema`, `Channels schema`, `Inventory schema`, `AI schema`, `Core schema`, `Sourcing schema`, `AI schema`, `Orders schema`, `System schema`, `Sourcing schema`, `prisma field: ActionTask.targetId`, `AI schema`, `AI schema`, `Channels schema`, `Sourcing schema`, `Sourcing schema`, `Supply schema`, `Sourcing schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Channels schema`, `AgentOS schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Sourcing schema`, `Orders schema`, `Channels schema`, `Channels schema`, `Supply schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `AI schema`, `System schema`, `Advertising schema`, `AgentOS schema`, `Orders schema`, `prisma field: PurchaseOrder.supplierId`, `Sourcing schema`, `Channels schema`, `Sourcing schema`, `AgentOS schema`, `AI schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Core schema`, `Orders schema`, `Sourcing schema`, `AgentOS schema`, `Orders schema`, `Finance schema`, `Supply schema`, `Sourcing schema`, `Finance schema`, `AgentOS schema`, `Orders schema`, `Supply schema`, `Inventory schema`, `AgentOS schema`, `Sourcing schema`, `Sourcing schema`, `System schema`, `Channels schema`, `Channels schema`, `Core schema`, `Supply schema`, `AgentOS schema`, `Channels schema`, `Supply schema`, `Channels schema`, `Supply schema`, `Supply schema`, `Orders schema`, `Orders schema`, `System schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Channels schema`, `Inventory schema`, `System schema`, `Finance schema`, `Supply schema`, `Channels schema`, `Core schema`, `Supply schema`, `Channels schema`, `Sourcing schema`, `Channels schema`, `Core schema`, `System schema`, `System schema`, `Core schema`, `Inventory schema`, `Supply schema`, `System schema`, `Channels schema`, `Core schema`, `Advertising schema`?**
  _High betweenness centrality (0.197) - this node is a cross-community bridge._
- **Why does `Order` connect `Orders schema` to `prisma field: prisma — Shared Schema`, `Community 1`, `Orders schema`, `prisma field: externalOptionId canonical option identity`, `prisma field: AdAction.externalId`, `prisma field: AgentToolDefinition.isActive`, `Orders schema`, `Core schema`, `Community 6`, `Community 8`, `Community 10`, `Orders schema`, `Finance schema`, `Community 12`, `Orders schema`, `Core schema`, `Community 145`, `Core schema`, `Community 20`, `Community 24`, `Community 25`, `Community 27`, `Community 30`, `Community 160`, `Community 34`, `Orders schema`, `Community 45`, `Community 46`, `Orders schema`, `Core schema`, `Community 50`, `Community 51`, `Community 55`, `prisma field: ActionTask.targetId`, `Community 191`, `AI schema`, `Community 73`, `Community 205`, `Channels schema`, `Community 217`, `Community 218`, `Community 92`, `Community 93`, `Community 222`, `Orders schema`, `Community 102`, `Orders schema`, `prisma field: PurchaseOrder.supplierId`, `Community 115`, `Community 121`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **Are the 197 inferred relationships involving `Organization` (e.g. with `channel-registration-capability.adapter.spec.ts` and `channel-registration-capability.adapter.ts`) actually correct?**
  _`Organization` has 197 INFERRED edges - model-reasoned connections that need verification._
- **Are the 143 inferred relationships involving `ChannelAccount` (e.g. with `channel-registration-capability.adapter.spec.ts` and `channel-registration-capability.adapter.ts`) actually correct?**
  _`ChannelAccount` has 143 INFERRED edges - model-reasoned connections that need verification._
- **Are the 100 inferred relationships involving `ChannelListing` (e.g. with `channel-registration-capability.adapter.ts` and `channel-listing.controller.ts`) actually correct?**
  _`ChannelListing` has 100 INFERRED edges - model-reasoned connections that need verification._
- **Are the 139 inferred relationships involving `Order` (e.g. with `channel-sync.controller.ts` and `dto/index.ts`) actually correct?**
  _`Order` has 139 INFERRED edges - model-reasoned connections that need verification._