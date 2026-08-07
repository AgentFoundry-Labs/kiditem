# Graph Report - schema-consumers  (2026-08-07)

## Corpus Check
- 437 files · ~203,071 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 6777 nodes · 39991 edges · 237 communities (215 shown, 22 thin omitted)
- Extraction: 29% EXTRACTED · 71% INFERRED · 0% AMBIGUOUS · INFERRED: 28277 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- prisma field: prisma — Shared Schema
- Community 1
- prisma field: Database ERD
- prisma field: AgentToolDefinition.isActive
- prisma field: externalOptionId canonical option identity
- Orders schema
- Community 6
- Orders schema
- AI schema
- AI schema
- Orders schema
- Core schema
- Core schema
- Community 13
- Sourcing schema
- AI schema
- Channels schema
- Core schema
- Community 18
- Community 19
- Community 20
- Sourcing schema
- AI schema
- Community 23
- System schema
- Community 25
- Community 26
- AgentOS schema
- Core schema
- Orders schema
- Community 30
- Community 31
- Sourcing schema
- AgentOS schema
- Supply schema
- Community 35
- AI schema
- AI schema
- Supply schema
- Community 39
- Supply schema
- Community 41
- AI schema
- Channels schema
- AI schema
- Community 45
- Community 46
- Core schema
- System schema
- Sourcing schema
- Community 50
- AI schema
- Channels schema
- Sourcing schema
- Sourcing schema
- Sourcing schema
- Community 56
- Supply schema
- AgentOS schema
- AgentOS schema
- Community 60
- Community 61
- AI schema
- Supply schema
- Channels schema
- Channels schema
- Inventory schema
- Community 67
- Channels schema
- AgentOS schema
- Community 70
- Community 71
- System schema
- AgentOS schema
- AgentOS schema
- Channels schema
- Channels schema
- Sourcing schema
- Community 78
- Community 79
- Community 80
- Channels schema
- Community 82
- Community 83
- AgentOS schema
- Community 85
- Community 86
- Community 87
- Channels schema
- Community 89
- AgentOS schema
- Channels schema
- Community 92
- Community 93
- System schema
- Advertising schema
- Community 96
- Community 97
- Sourcing schema
- AgentOS schema
- Channels schema
- Sourcing schema
- Community 102
- Community 103
- Community 104
- AgentOS schema
- AI schema
- System schema
- Channels schema
- Sourcing schema
- Core schema
- Sourcing schema
- AI schema
- Community 113
- Community 114
- AgentOS schema
- Finance schema
- Supply schema
- Sourcing schema
- AI schema
- Community 120
- Orders schema
- Supply schema
- Inventory schema
- Community 124
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
- AI schema
- Community 136
- Community 137
- Channels schema
- Core schema
- Inventory schema
- Community 141
- AgentOS schema
- Channels schema
- Advertising schema
- Inventory schema
- Inventory schema
- Supply schema
- Channels schema
- Inventory schema
- Community 150
- Community 151
- Finance schema
- System schema
- Sourcing schema
- Finance schema
- Finance schema
- Inventory schema
- Channels schema
- Inventory schema
- Supply schema
- Community 161
- Advertising schema
- System schema
- Community 164
- Inventory schema
- Channels schema
- Finance schema
- Core schema
- Supply schema
- Channels schema
- Sourcing schema
- Community 172
- Community 173
- Core schema
- Supply schema
- Channels schema
- Inventory schema
- Core schema
- System schema
- Supply schema
- Community 181
- Community 182
- Community 183
- System schema
- Community 185
- Community 186
- Community 187
- Community 188
- Community 189
- Advertising schema
- System schema
- Advertising schema
- Community 193
- Community 194
- Community 195
- Community 196
- Community 197
- Community 198
- Community 199
- Channels schema
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
1. `Organization` - 491 edges
2. `Database ERD` - 411 edges
3. `ChannelAccount` - 199 edges
4. `prisma — Shared Schema` - 188 edges
5. `ChannelListing` - 185 edges
6. `ProductPreparation.organizationId` - 182 edges
7. `User` - 182 edges
8. `ContentWorkspace.organizationId` - 181 edges
9. `Order` - 180 edges
10. `ChannelListing.organizationId` - 178 edges
11. `SourcingLaunchCandidate.organizationId` - 177 edges
12. `ProductRegistrationExecution.organizationId` - 177 edges

## Surprising Connections (you probably didn't know these)
- `packages/shared — @kiditem/shared` --mentions_domain--> `AI`  [EXTRACTED]
  packages/shared/AGENTS.md → prisma/models/ai.prisma
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
- `Database ERD` --mentions_field--> `AdAction.targetType`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma

## Import Cycles
- None detected.

## Communities (237 total, 22 thin omitted)

### Community 0 - "prisma field: prisma — Shared Schema"
Cohesion: 0.15
Nodes (312): UploadedWorkbookFile, UploadedCsvFile, HEADERS, USER, CHANNEL_ACCOUNT_LIST_SELECT, chunkSelect, ErrorInput, LockedRun (+304 more)

### Community 1 - "Community 1"
Cohesion: 0.02
Nodes (270): ActionTask, ActionTaskExecuteResponse, ActionTaskList, ActionTaskListSchema, ActionTaskRelatedProduct, ActionTaskRelatedProductSchema, ActionTaskSchema, ActionTaskSourceAlert (+262 more)

### Community 2 - "prisma field: Database ERD"
Cohesion: 0.05
Nodes (125): aggregateMappingStatus(), contains(), firstPrice(), ListingRow, parseQueryDate(), positiveInteger(), toSummary(), ListingForProductSync (+117 more)

### Community 3 - "prisma field: AgentToolDefinition.isActive"
Cohesion: 0.02
Nodes (135): AgentToolDefinition.isActive, CategoryMapping.isActive, ChannelListing.isActive, ChannelListingOption.isActive, ChannelListingOptionDailySnapshot.isActive, MasterProduct.isActive, Organization.isActive, ScrapeTarget.isActive (+127 more)

### Community 4 - "prisma field: externalOptionId canonical option identity"
Cohesion: 0.03
Nodes (108): ChannelCatalogIdentityProduct, ROCKET_SELLPIA_MATCHING_CSV_SOURCE_TYPE, RocketMatchingCsvCatalogRow, rocketMatchingCsvRowsToCatalogProducts(), isYes(), optionalText(), parseCsvRecords(), ParsedRocketSellpiaMatchingCsv (+100 more)

### Community 5 - "Orders schema"
Cohesion: 0.02
Nodes (98): ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id, ChannelAccount.isPrimary, ChannelAccount.name, ChannelAccount.organization (+90 more)

### Community 6 - "Community 6"
Cohesion: 0.02
Nodes (101): AgentApprovalRequestSummary, AgentApprovalRequestSummarySchema, AgentApprovalStatus, AgentApprovalStatusSchema, AgentArtifactHandoffSummary, AgentArtifactHandoffSummarySchema, AgentArtifactStatus, AgentArtifactStatusSchema (+93 more)

### Community 7 - "Orders schema"
Cohesion: 0.03
Nodes (92): formatKstIso(), Orders, CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType (+84 more)

### Community 8 - "AI schema"
Cohesion: 0.03
Nodes (75): ContentAsset.originGenerationGroupId, ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.editedHtmlSavedAt (+67 more)

### Community 9 - "AI schema"
Cohesion: 0.04
Nodes (71): ActionTask.targetId, ActionTask.targetType, AdAction.targetType, AgentArtifact.targetId, Alert.targetId, Alert.targetType, ChannelAdTargetDailySnapshot.targetType, Thumbnail.clicks (+63 more)

### Community 10 - "Orders schema"
Cohesion: 0.03
Nodes (69): Review.content, Review.createdAt, Review.externalProductId, Review.externalReviewId, Review.id, Review.imageCount, Review.isBlinded, Review.itemName (+61 more)

### Community 11 - "Core schema"
Cohesion: 0.03
Nodes (68): AuthSession.createdAt, AuthSession.expiresAt, AuthSession.id, AuthSession.revokedAt, AuthSession.tokenHash, AuthSession.user, AuthSession.userId, InventoryCommitment.businessKey (+60 more)

### Community 12 - "Core schema"
Cohesion: 0.04
Nodes (63): ChannelListing.brand, ChannelListing.category, ChannelListing.channelAccount, ChannelListing.channelAccountId, ChannelListing.channelName, ChannelListing.createdAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo (+55 more)

### Community 13 - "Community 13"
Cohesion: 0.03
Nodes (62): ChannelOptionInventoryComponentInput, ChannelOptionInventoryComponentInputSchema, ChannelOptionSummary, ChannelOptionSummarySchema, CreateMasterProductInput, CreateMasterProductInputSchema, MasterProductDisplayReference, MasterProductDisplayReferenceSchema (+54 more)

### Community 14 - "Sourcing schema"
Cohesion: 0.04
Nodes (57): CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id, CandidateImage.isPrimary (+49 more)

### Community 15 - "AI schema"
Cohesion: 0.04
Nodes (55): ContentGeneration.detailPageArtifactId, ContentWorkspace.currentDetailPageArtifactId, ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.contentWorkspaceId, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.createdByUserId (+47 more)

### Community 16 - "Channels schema"
Cohesion: 0.04
Nodes (59): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adCoverageStatus, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d (+51 more)

### Community 17 - "Core schema"
Cohesion: 0.04
Nodes (57): ChannelListingOption.attributesJson, ChannelListingOption.commissionRate, ChannelListingOption.costPriceOverride, ChannelListingOption.createdAt, ChannelListingOption.id, ChannelListingOption.itemName, ChannelListingOption.lastImportRun, ChannelListingOption.lastImportRunId (+49 more)

### Community 18 - "Community 18"
Cohesion: 0.08
Nodes (49): apiHeaders(), apiUrl(), Args, assertSafeDatasetId(), assertSupportedReplayPayloads(), BundleManifest, BundlePayload, BundleReference (+41 more)

### Community 19 - "Community 19"
Cohesion: 0.07
Nodes (50): AdapterCommand, appendFlag(), appendOption(), appendProjectReferenceDefaults(), appendValues(), Args, BundleManifest, BundlePackageIndex (+42 more)

### Community 20 - "Community 20"
Cohesion: 0.07
Nodes (36): ChannelCatalogCollectionController, Body, Controller, CurrentOrganization, CurrentUser, Get, Inject, Param (+28 more)

### Community 21 - "Sourcing schema"
Cohesion: 0.04
Nodes (51): SourcingLaunchCandidate.blockingRiskCodes, SourcingLaunchCandidate.bundleSnapshot, SourcingLaunchCandidate.candidateSeriesKey, SourcingLaunchCandidate.complianceAssessmentVersionKey, SourcingLaunchCandidate.complianceSnapshot, SourcingLaunchCandidate.complianceStatus, SourcingLaunchCandidate.createdAt, SourcingLaunchCandidate.createdByUser (+43 more)

### Community 22 - "AI schema"
Cohesion: 0.05
Nodes (50): DetailPageImageArtifact.byteLength, DetailPageImageArtifact.contentType, DetailPageImageArtifact.createdAt, DetailPageImageArtifact.createdBy, DetailPageImageArtifact.createdByUserId, DetailPageImageArtifact.id, DetailPageImageArtifact.imageUrl, DetailPageImageArtifact.objectKey (+42 more)

### Community 23 - "Community 23"
Cohesion: 0.04
Nodes (48): CalendarDateSchema, ChecksumSchema, dateRangeSourceFreshness(), FiniteNumberSchema, NullableMetricSchema, ProductAbcAdvertisingSourceFreshnessSchema, ProductAbcAdvertisingSourceStatus, ProductAbcAdvertisingSourceStatusSchema (+40 more)

### Community 24 - "System schema"
Cohesion: 0.04
Nodes (44): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon, Marketplace.id (+36 more)

### Community 25 - "Community 25"
Cohesion: 0.07
Nodes (21): ChannelRegistrationCapabilityAdapter, toSellpiaMatch(), Injectable, ChannelsMarketplaceRegistrationCapabilityPort, ExternalProductRegistrationMatchPreviewInput, ExternalProductRegistrationMatchPreviewResult, ExternalProductRegistrationPreflightInput, ExternalProductRegistrationPreflightResult (+13 more)

### Community 26 - "Community 26"
Cohesion: 0.07
Nodes (37): ChannelCatalogImportController, Controller, Inject, ChannelProductMatchingController, Controller, ChannelSkuAvailabilityController, Controller, CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT (+29 more)

### Community 27 - "AgentOS schema"
Cohesion: 0.05
Nodes (44): AgentRunRequest.agentInstance, AgentRunRequest.attempts, AgentRunRequest.claimedAt, AgentRunRequest.claimedBy, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.coalescedIntoRequestId, AgentRunRequest.conversation, AgentRunRequest.createdAt (+36 more)

### Community 28 - "Core schema"
Cohesion: 0.05
Nodes (44): MasterProductAbcEvaluation.adjustedScore, MasterProductAbcEvaluation.advertisingCoverageEndDate, MasterProductAbcEvaluation.advertisingCoverageStartDate, MasterProductAbcEvaluation.advertisingSourceCapturedAt, MasterProductAbcEvaluation.advertisingSourceStatus, MasterProductAbcEvaluation.calculatedAt, MasterProductAbcEvaluation.calculationStatus, MasterProductAbcEvaluation.costComponentsJson (+36 more)

### Community 29 - "Orders schema"
Cohesion: 0.06
Nodes (41): SellpiaOrderTransmissionIntent.abortedAt, SellpiaOrderTransmissionIntent.createdAt, SellpiaOrderTransmissionIntent.createdBy, SellpiaOrderTransmissionIntent.creator, SellpiaOrderTransmissionIntent.finalizedAt, SellpiaOrderTransmissionIntent.finalizedGeneration, SellpiaOrderTransmissionIntent.id, SellpiaOrderTransmissionIntent.intentKey (+33 more)

### Community 30 - "Community 30"
Cohesion: 0.08
Nodes (29): DATA_MIGRATION_RELEASES, DataMigration, DataMigrationContext, DataMigrationTarget, MigrationResult, isLegacyDetailEditorHref(), rewriteLegacyDetailEditorAlertHrefs, rewriteLegacyDetailEditorHref() (+21 more)

### Community 31 - "Community 31"
Cohesion: 0.08
Nodes (34): assertLockedListing(), lockChannelListingRow(), ActiveSellpiaSku, aiProductSuggestion(), asRecord(), availabilityListingWhere(), COMPLETED_CATALOG_SOURCE_TYPES, completedCatalogRunWhere() (+26 more)

### Community 32 - "Sourcing schema"
Cohesion: 0.05
Nodes (43): SourcingSourceEntitlementVersion.accountCoverage, SourcingSourceEntitlementVersion.allowedMethod, SourcingSourceEntitlementVersion.categoryCoverage, SourcingSourceEntitlementVersion.coverageDefinition, SourcingSourceEntitlementVersion.createdAt, SourcingSourceEntitlementVersion.credentialRef, SourcingSourceEntitlementVersion.decisionImpact, SourcingSourceEntitlementVersion.denominatorDefinition (+35 more)

### Community 33 - "AgentOS schema"
Cohesion: 0.05
Nodes (42): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+34 more)

### Community 34 - "Supply schema"
Cohesion: 0.05
Nodes (42): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+34 more)

### Community 35 - "Community 35"
Cohesion: 0.05
Nodes (39): BrowserOperationClaim, BrowserOperationClaimRequest, BrowserOperationClaimRequestSchema, BrowserOperationClaimSchema, BrowserOperationHeartbeatRequest, BrowserOperationHeartbeatRequestSchema, BrowserOperationReportRequest, BrowserOperationReportRequestSchema (+31 more)

### Community 36 - "AI schema"
Cohesion: 0.06
Nodes (37): AI, ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize (+29 more)

### Community 37 - "AI schema"
Cohesion: 0.05
Nodes (41): ProductPreparation.selectedThumbnailGenerationId, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.contentWorkspaceId, ThumbnailGeneration.createdAt, ThumbnailGeneration.deletedAt, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.errorMessage (+33 more)

### Community 38 - "Supply schema"
Cohesion: 0.07
Nodes (38): PurchaseOrder.supplierId, Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.id, Supplier.leadTimeDays, Supplier.name (+30 more)

### Community 39 - "Community 39"
Cohesion: 0.08
Nodes (38): automaticReason(), automaticStatus(), BarcodeEvidence, bestSimilarityPerSku(), ChannelRecipeSuggestionDecision, ChannelRecipeSuggestionEvidenceKind, ChannelRecipeSuggestionInput, ChannelRecipeSuggestionResponse (+30 more)

### Community 40 - "Supply schema"
Cohesion: 0.05
Nodes (40): SourcingLaunchCandidate.supplierOfferSkuSnapshotId, SupplierOfferSkuSnapshot.capturedAt, SupplierOfferSkuSnapshot.createdAt, SupplierOfferSkuSnapshot.currency, SupplierOfferSkuSnapshot.dispatchLeadTimeDaysMax, SupplierOfferSkuSnapshot.dispatchLeadTimeDaysMin, SupplierOfferSkuSnapshot.domesticFreightCny, SupplierOfferSkuSnapshot.evidenceObservation (+32 more)

### Community 41 - "Community 41"
Cohesion: 0.11
Nodes (38): DATA_MIGRATION_IDS, dataMigrations, APPLY_DATA_MIGRATIONS_CONFIRMATION, appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertMutatingTarget(), CliArgs, Command (+30 more)

### Community 42 - "AI schema"
Cohesion: 0.06
Nodes (39): ProductPreparation.approvedAt, ProductPreparation.approvedByUser, ProductPreparation.channelAccount, ProductPreparation.channelAccountId, ProductPreparation.channelListing, ProductPreparation.channelListingId, ProductPreparation.createdAt, ProductPreparation.createdByUser (+31 more)

### Community 43 - "Channels schema"
Cohesion: 0.06
Nodes (38): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignIdentity, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel (+30 more)

### Community 44 - "AI schema"
Cohesion: 0.06
Nodes (38): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+30 more)

### Community 45 - "Community 45"
Cohesion: 0.05
Nodes (36): deriveSellpiaInventoryFreshness(), FixedSellpiaAccountKeySchema, FixedSellpiaOriginSchema, IsoDateTimeStringSchema, SELLPIA_INVENTORY_COLLECTION_FAILURE_CODES, SELLPIA_INVENTORY_FRESHNESS_STATUSES, SELLPIA_INVENTORY_REFRESH_REASONS, SellpiaFreshnessDerivationInput (+28 more)

### Community 46 - "Community 46"
Cohesion: 0.08
Nodes (32): CHANNEL_LISTING_SORTS, CHANNEL_LISTING_TABS, ChannelListingDeletionDto, ChannelListingDeletionUnresolvedDto, ChannelListingQueryDto, IsIn, IsOptional, IsString (+24 more)

### Community 47 - "Core schema"
Cohesion: 0.07
Nodes (37): ChannelListing.lastImportRunId, Order.sourceImportRunId, SellpiaInventorySku.lastImportRunId, SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.coverageEndDate, SourceImportRun.coverageStartDate (+29 more)

### Community 48 - "System schema"
Cohesion: 0.06
Nodes (37): OperationRun.attempts, OperationRun.attemptToken, OperationRun.claimedAt, OperationRun.claimedBy, OperationRun.createdAt, OperationRun.definitionVersion, OperationRun.engineType, OperationRun.errorCode (+29 more)

### Community 49 - "Sourcing schema"
Cohesion: 0.06
Nodes (37): SourcingEvidenceObservation.availableAt, SourcingEvidenceObservation.businessDate, SourcingEvidenceObservation.conceptKey, SourcingEvidenceObservation.createdAt, SourcingEvidenceObservation.decisionImpact, SourcingEvidenceObservation.eventAt, SourcingEvidenceObservation.evidenceClass, SourcingEvidenceObservation.evidenceFamily (+29 more)

### Community 50 - "Community 50"
Cohesion: 0.08
Nodes (33): ClientRenderArtifactSchema, ClientRenderContentTypeSchema, ClientRenderDateSchema, ClientRenderOutputWidthSchema, ClientRenderUuidSchema, ClientRenderVariantSchema, DETAIL_IMAGE_COUNTS, DETAIL_PAGE_AGE_GROUPS (+25 more)

### Community 51 - "AI schema"
Cohesion: 0.07
Nodes (35): ContentWorkspaceThumbnailSelection.contentAsset, ContentWorkspaceThumbnailSelection.contentAssetId, ContentWorkspaceThumbnailSelection.contentWorkspace, ContentWorkspaceThumbnailSelection.contentWorkspaceId, ContentWorkspaceThumbnailSelection.createdAt, ContentWorkspaceThumbnailSelection.createdByUser, ContentWorkspaceThumbnailSelection.createdByUserId, ContentWorkspaceThumbnailSelection.id (+27 more)

### Community 52 - "Channels schema"
Cohesion: 0.07
Nodes (35): CoupangWingTrackedProduct.brandName, CoupangWingTrackedProduct.categoryHierarchy, CoupangWingTrackedProduct.createdAt, CoupangWingTrackedProduct.enabled, CoupangWingTrackedProduct.id, CoupangWingTrackedProduct.imagePath, CoupangWingTrackedProduct.itemId, CoupangWingTrackedProduct.lastCapturedAt (+27 more)

### Community 53 - "Sourcing schema"
Cohesion: 0.07
Nodes (35): ProductRegistrationExecution.channelAccount, ProductRegistrationExecution.channelAccountId, ProductRegistrationExecution.channelListing, ProductRegistrationExecution.channelListingId, ProductRegistrationExecution.completedAt, ProductRegistrationExecution.createdAt, ProductRegistrationExecution.executionKind, ProductRegistrationExecution.expectedProviderAccountId (+27 more)

### Community 54 - "Sourcing schema"
Cohesion: 0.06
Nodes (35): SourcingDecisionBatchItem.baselineDecision, SourcingDecisionBatchItem.capitalAtRiskKrw, SourcingDecisionBatchItem.confidenceKind, SourcingDecisionBatchItem.createdAt, SourcingDecisionBatchItem.decision, SourcingDecisionBatchItem.decisionBatch, SourcingDecisionBatchItem.decisionBatchId, SourcingDecisionBatchItem.decisionConfidence (+27 more)

### Community 55 - "Sourcing schema"
Cohesion: 0.06
Nodes (35): SourcingEvidenceIngestionRun.acceptedCount, SourcingEvidenceIngestionRun.collectorKey, SourcingEvidenceIngestionRun.collectorVersion, SourcingEvidenceIngestionRun.completedAt, SourcingEvidenceIngestionRun.coverageDenominator, SourcingEvidenceIngestionRun.coverageNumerator, SourcingEvidenceIngestionRun.createdAt, SourcingEvidenceIngestionRun.discoveredCount (+27 more)

### Community 56 - "Community 56"
Cohesion: 0.07
Nodes (31): SellpiaInventoryCollectionFailureCodeSchema, SellpiaInventoryGenerationSchema, SellpiaInventoryQualityReportSchema, SellpiaInventoryRefreshReasonSchema, CompletedSourceArtifactRun, CoupangRocketMatchingCsvImportResponse, CoupangWingCatalogImportResponse, CoupangWingCatalogImportResponseSchema (+23 more)

### Community 57 - "Supply schema"
Cohesion: 0.06
Nodes (34): ProcurementTestIntent.createdAt, ProcurementTestIntent.currency, ProcurementTestIntent.decisionBatchItem, ProcurementTestIntent.decisionBatchItemId, ProcurementTestIntent.expectedGoodsTotalCny, ProcurementTestIntent.expiresAt, ProcurementTestIntent.id, ProcurementTestIntent.idempotencyKey (+26 more)

### Community 58 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+25 more)

### Community 59 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.startedAt, WorkflowRun.status (+25 more)

### Community 60 - "Community 60"
Cohesion: 0.12
Nodes (17): ChannelListingController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+9 more)

### Community 61 - "Community 61"
Cohesion: 0.07
Nodes (13): ChannelRecipeSuggestionContextRepositoryAdapter, Injectable, checkedMatchedType(), SellpiaManualMatchRepositoryAdapter, toStatus(), Injectable, SellpiaRecipeEvidencePort, ChannelRecipeSuggestionContext (+5 more)

### Community 62 - "AI schema"
Cohesion: 0.08
Nodes (31): ContentGeneration.contentWorkspaceId, ContentWorkspace.channelListing, ContentWorkspace.channelListingId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.createdByUserId, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageRevision (+23 more)

### Community 63 - "Supply schema"
Cohesion: 0.07
Nodes (32): RocketPurchaseConfirmation.artifactBytes, RocketPurchaseConfirmation.artifactContentType, RocketPurchaseConfirmation.artifactFileName, RocketPurchaseConfirmation.artifactSha256, RocketPurchaseConfirmation.artifactStoredAt, RocketPurchaseConfirmation.channelAccount, RocketPurchaseConfirmation.channelAccountId, RocketPurchaseConfirmation.completedAt (+24 more)

### Community 64 - "Channels schema"
Cohesion: 0.08
Nodes (31): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.channelAccount, ChannelScrapeRun.channelAccountId, ChannelScrapeRun.clientRunKey, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson (+23 more)

### Community 65 - "Channels schema"
Cohesion: 0.07
Nodes (31): RocketPoCatalogLine.businessDateBasis, RocketPoCatalogLine.center, RocketPoCatalogLine.createdAt, RocketPoCatalogLine.hasConfirmation, RocketPoCatalogLine.id, RocketPoCatalogLine.inboundType, RocketPoCatalogLine.orderQty, RocketPoCatalogLine.organization (+23 more)

### Community 66 - "Inventory schema"
Cohesion: 0.07
Nodes (30): SellpiaInventoryState.activeGeneration, SellpiaInventoryState.activeSyncLeaseExpiresAt, SellpiaInventoryState.activeSyncOwner, SellpiaInventoryState.activeSyncOwnerUserId, SellpiaInventoryState.activeSyncScope, SellpiaInventoryState.activeSyncStartedAt, SellpiaInventoryState.activeSyncToken, SellpiaInventoryState.createdAt (+22 more)

### Community 67 - "Community 67"
Cohesion: 0.08
Nodes (12): Inject, ChannelProductMatchingRepositoryAdapter, Injectable, ChannelSkuAvailabilityPort, ChannelAvailabilityRepositoryRow, ChannelProductMatchingRepositoryPort, Inject, ChannelSkuAvailabilityService (+4 more)

### Community 68 - "Channels schema"
Cohesion: 0.09
Nodes (23): CoupangRocketPurchaseOrderOperationHandler, Inject, Injectable, CHANNELS_OPERATIONS, CoupangRocketPurchaseOrderInputSchema, RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt (+15 more)

### Community 69 - "AgentOS schema"
Cohesion: 0.08
Nodes (29): AgentOS, AgentAuthorizationEvent.toolId, AgentInstanceToolPolicy.agentInstance, AgentInstanceToolPolicy.agentInstanceId, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentInstanceToolPolicy.dryRunMode (+21 more)

### Community 70 - "Community 70"
Cohesion: 0.09
Nodes (19): RocketSellpiaMatchingCsvImportController, Controller, CurrentOrganization, CurrentUser, Inject, Param, Post, UploadedFile (+11 more)

### Community 71 - "Community 71"
Cohesion: 0.09
Nodes (20): assertActiveCoupangAccount(), assertCanonicalAccount(), ChannelCatalogPublicationRepositoryAdapter, completeCollectionRun(), completedCollectionResult(), jsonRecord(), lockAccount(), lockCollectionRun() (+12 more)

### Community 72 - "System schema"
Cohesion: 0.08
Nodes (26): Alert.actionTask, Alert.actorUser, Alert.actorUserId, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead (+18 more)

### Community 73 - "AgentOS schema"
Cohesion: 0.07
Nodes (28): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.approver, AgentApprovalRequest.approverUserId, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy, AgentApprovalRequest.decidedByUserId (+20 more)

### Community 74 - "AgentOS schema"
Cohesion: 0.08
Nodes (28): AgentToolInvocation.agentInstance, AgentToolInvocation.approvalRequest, AgentToolInvocation.approvalRequestId, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt, AgentToolInvocation.errorCode (+20 more)

### Community 75 - "Channels schema"
Cohesion: 0.08
Nodes (26): ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.id, ChannelScrapeSnapshot.listing, ChannelScrapeSnapshot.listingOption (+18 more)

### Community 76 - "Channels schema"
Cohesion: 0.08
Nodes (28): ChannelListingDeletionOperation.authorizationExpiresAt, ChannelListingDeletionOperation.channelAccount, ChannelListingDeletionOperation.channelAccountId, ChannelListingDeletionOperation.channelListing, ChannelListingDeletionOperation.channelListingId, ChannelListingDeletionOperation.completedAt, ChannelListingDeletionOperation.createdAt, ChannelListingDeletionOperation.expectedProviderAccountId (+20 more)

### Community 77 - "Sourcing schema"
Cohesion: 0.08
Nodes (28): SourcingDecisionBatch.businessDate, SourcingDecisionBatch.capitalBudgetKrw, SourcingDecisionBatch.category, SourcingDecisionBatch.constraintSetHash, SourcingDecisionBatch.createdAt, SourcingDecisionBatch.decisionAt, SourcingDecisionBatch.decisionMode, SourcingDecisionBatch.evidenceCutoffAt (+20 more)

### Community 78 - "Community 78"
Cohesion: 0.16
Nodes (24): Path, add_code_reference_edges(), add_document_mentions(), add_schema_graph(), camel(), collect_block(), collect_code(), collect_doc_comments() (+16 more)

### Community 79 - "Community 79"
Cohesion: 0.14
Nodes (27): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+19 more)

### Community 80 - "Community 80"
Cohesion: 0.15
Nodes (26): cellText(), collectParentMetadataConflicts(), decodeWorksheetRange(), expandMergedParentCells(), findHeaderRow(), formattedCellText(), hasCellValue(), headersForRow() (+18 more)

### Community 81 - "Channels schema"
Cohesion: 0.08
Nodes (27): CoupangWingSalesRankDailySnapshot.businessDate, CoupangWingSalesRankDailySnapshot.capturedAt, CoupangWingSalesRankDailySnapshot.categoryHierarchy, CoupangWingSalesRankDailySnapshot.collectedCount, CoupangWingSalesRankDailySnapshot.conversionRate28d, CoupangWingSalesRankDailySnapshot.createdAt, CoupangWingSalesRankDailySnapshot.id, CoupangWingSalesRankDailySnapshot.itemId (+19 more)

### Community 82 - "Community 82"
Cohesion: 0.09
Nodes (11): ChannelSyncRepositoryAdapter, reconcileProductDetailOption(), Injectable, CoupangSyncOrderPayload, CoupangSyncReturnPayload, HealthResult, ProductListingSyncResult, syncSingleCoupangOrder() (+3 more)

### Community 83 - "Community 83"
Cohesion: 0.09
Nodes (17): nextPublicationSequence(), productsFromRows(), resolveIdentities(), RocketPoCatalogRepositoryAdapter, toCompletedRun(), Injectable, zeroChanges(), day() (+9 more)

### Community 84 - "AgentOS schema"
Cohesion: 0.08
Nodes (24): AgentInstance.adapterConfig, AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.icon, AgentInstance.id, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name (+16 more)

### Community 85 - "Community 85"
Cohesion: 0.19
Nodes (26): archiveFileName(), archiveShaFileName(), commandPack(), commandPublish(), commandPull(), commandSync(), driveBundleDir(), driveLaneDir() (+18 more)

### Community 86 - "Community 86"
Cohesion: 0.13
Nodes (16): ChannelAccountRepositoryAdapter, envelopeToJson(), maskAccessKey(), readCredentialsConfig(), stripLegacyCredentialKeys(), toJsonRecord(), toRecord(), trimToOptional() (+8 more)

### Community 87 - "Community 87"
Cohesion: 0.09
Nodes (6): CoupangProviderPort, ChannelSyncRepositoryPort, OrderSyncDeps, ProductSyncDeps, Inject, Optional

### Community 88 - "Channels schema"
Cohesion: 0.09
Nodes (25): ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isOfferWinner, ChannelListingOptionDailySnapshot.lastObservedAt, ChannelListingOptionDailySnapshot.listing (+17 more)

### Community 89 - "Community 89"
Cohesion: 0.12
Nodes (12): Body, CurrentOrganization, Get, Param, Post, Put, Query, ChannelProductMatchingQuery (+4 more)

### Community 90 - "AgentOS schema"
Cohesion: 0.09
Nodes (24): AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy, AgentAuthorizationEvent.decidedByUserId, AgentAuthorizationEvent.decision (+16 more)

### Community 91 - "Channels schema"
Cohesion: 0.10
Nodes (24): SellpiaProductMonthlySales.buyPrice, SellpiaProductMonthlySales.capturedAt, SellpiaProductMonthlySales.costBasis, SellpiaProductMonthlySales.coverageEndDate, SellpiaProductMonthlySales.coverageStartDate, SellpiaProductMonthlySales.createdAt, SellpiaProductMonthlySales.id, SellpiaProductMonthlySales.inAmount (+16 more)

### Community 92 - "Community 92"
Cohesion: 0.20
Nodes (8): ChannelDashboardController, Controller, CurrentOrganization, Get, Query, CoupangDateRangeQueryDto, ChannelDashboardService, Injectable

### Community 93 - "Community 93"
Cohesion: 0.19
Nodes (20): bigrams(), ChannelRecipeNameEvidence, ChannelRecipeNameIndex, ChannelRecipeNameOption, ChannelRecipeNameSku, compareEvidence(), createChannelRecipeNameIndex(), diceCoefficient() (+12 more)

### Community 94 - "System schema"
Cohesion: 0.10
Nodes (23): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.href (+15 more)

### Community 95 - "Advertising schema"
Cohesion: 0.09
Nodes (23): AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+15 more)

### Community 96 - "Community 96"
Cohesion: 0.09
Nodes (19): adapterPaths, BROWSER_COLLECTION_ATTENTION_REASONS, BROWSER_COLLECTION_PRODUCERS, BROWSER_COLLECTION_STATES, BrowserCollectionAttentionReasonSchema, BrowserCollectionClassificationSchema, BrowserCollectionCommand, BrowserCollectionCommandSchema (+11 more)

### Community 97 - "Community 97"
Cohesion: 0.10
Nodes (17): aggregateRows(), sameStrings(), strongerMatchedType(), MAX_SELLPIA_MANUAL_MATCH_ROWS, MAX_SELLPIA_MANUAL_MATCH_TARGETS, SellpiaManualMatchCodeSchema, SellpiaManualMatchCollectionFailureCode, SellpiaManualMatchCollectionFailureCodeSchema (+9 more)

### Community 98 - "Sourcing schema"
Cohesion: 0.11
Nodes (22): Sourcing, SourcingWorkspaceSnapshot.businessDate, SourcingWorkspaceSnapshot.createdAt, SourcingWorkspaceSnapshot.id, SourcingWorkspaceSnapshot.organization, SourcingWorkspaceSnapshot.payload, SourcingWorkspaceSnapshot.scope, SourcingWorkspaceSnapshot.updatedAt (+14 more)

### Community 99 - "AgentOS schema"
Cohesion: 0.10
Nodes (22): AgentArtifact.agentInstance, AgentArtifact.agentInstanceId, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization (+14 more)

### Community 100 - "Channels schema"
Cohesion: 0.11
Nodes (22): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.channelAccount, ChannelAccountDailyKpiSnapshot.channelAccountId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+14 more)

### Community 101 - "Sourcing schema"
Cohesion: 0.11
Nodes (22): TiktokCreativeTrendDailySnapshot.businessDate, TiktokCreativeTrendDailySnapshot.capturedAt, TiktokCreativeTrendDailySnapshot.createdAt, TiktokCreativeTrendDailySnapshot.entityKey, TiktokCreativeTrendDailySnapshot.growthPct, TiktokCreativeTrendDailySnapshot.id, TiktokCreativeTrendDailySnapshot.industry, TiktokCreativeTrendDailySnapshot.label (+14 more)

### Community 102 - "Community 102"
Cohesion: 0.20
Nodes (14): CoupangCredentials, coupangRequest(), CoupangRequestOptions, generateAuthorization(), approveReturn(), confirmOrderSheets(), DELIVERY_COMPANIES, getOrderSheets() (+6 more)

### Community 103 - "Community 103"
Cohesion: 0.10
Nodes (10): CoupangProviderAdapter, Inject, Injectable, CoupangCreateSellerProductResponse, CoupangSellerProductPayload, OrderSheetResponse, SellerProductDetailResponse, SellerProductExternalSkuResponse (+2 more)

### Community 104 - "Community 104"
Cohesion: 0.15
Nodes (13): assertOperationActor(), ChannelListingRepositoryAdapter, isUniqueViolation(), lockDeletionOperation(), toAuthorizationResult(), Injectable, ChannelListingDeletionAuthorizationInput, ChannelListingDeletionCompletionInput (+5 more)

### Community 105 - "AgentOS schema"
Cohesion: 0.11
Nodes (20): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError, AgentTaskSession.lastRun (+12 more)

### Community 106 - "AI schema"
Cohesion: 0.11
Nodes (21): AiDirectJob.attempts, AiDirectJob.claimedAt, AiDirectJob.claimedBy, AiDirectJob.createdAt, AiDirectJob.finishedAt, AiDirectJob.id, AiDirectJob.jobType, AiDirectJob.lastErrorCode (+13 more)

### Community 107 - "System schema"
Cohesion: 0.10
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+13 more)

### Community 108 - "Channels schema"
Cohesion: 0.11
Nodes (21): CoupangKeywordRankDailySnapshot.adRank, CoupangKeywordRankDailySnapshot.businessDate, CoupangKeywordRankDailySnapshot.capturedAt, CoupangKeywordRankDailySnapshot.createdAt, CoupangKeywordRankDailySnapshot.id, CoupangKeywordRankDailySnapshot.itemId, CoupangKeywordRankDailySnapshot.keyword, CoupangKeywordRankDailySnapshot.organicRank (+13 more)

### Community 109 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): LiveCommerceBroadcastDailySnapshot.broadcasterId, LiveCommerceBroadcastDailySnapshot.broadcasterName, LiveCommerceBroadcastDailySnapshot.broadcastId, LiveCommerceBroadcastDailySnapshot.businessDate, LiveCommerceBroadcastDailySnapshot.capturedAt, LiveCommerceBroadcastDailySnapshot.coverImageUrl, LiveCommerceBroadcastDailySnapshot.createdAt, LiveCommerceBroadcastDailySnapshot.endedAt (+13 more)

### Community 110 - "Core schema"
Cohesion: 0.12
Nodes (21): MasterProductAbcEvaluation.formulaVersionId, MasterProductAbcFormulaVersion.calculationCodeChecksum, MasterProductAbcFormulaVersion.calibrationMetricsJson, MasterProductAbcFormulaVersion.createdAt, MasterProductAbcFormulaVersion.firstActivatedAt, MasterProductAbcFormulaVersion.foldCount, MasterProductAbcFormulaVersion.formulaChecksum, MasterProductAbcFormulaVersion.formulaJson (+13 more)

### Community 111 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): ShortsTrendDailySnapshot.businessDate, ShortsTrendDailySnapshot.capturedAt, ShortsTrendDailySnapshot.channelName, ShortsTrendDailySnapshot.commentCount, ShortsTrendDailySnapshot.createdAt, ShortsTrendDailySnapshot.id, ShortsTrendDailySnapshot.keyword, ShortsTrendDailySnapshot.likeCount (+13 more)

### Community 112 - "AI schema"
Cohesion: 0.10
Nodes (21): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.contentWorkspace, ThumbnailAnalysis.contentWorkspaceId, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id (+13 more)

### Community 113 - "Community 113"
Cohesion: 0.10
Nodes (7): ChannelsDeletionPasswordAdapter, Injectable, ChannelsDeletionPasswordPort, ChannelListingRepositoryPort, Inject, Optional, Inject

### Community 114 - "Community 114"
Cohesion: 0.16
Nodes (11): OperationAlertPort, SyncResult, isCoupangCredentialResolutionError(), completeKstCalendarCoverage(), kstParts(), syncCoupangOrders(), syncCoupangProducts(), ChannelSyncService (+3 more)

### Community 115 - "AgentOS schema"
Cohesion: 0.11
Nodes (20): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id, AgentCostEvent.inputTokens (+12 more)

### Community 116 - "Finance schema"
Cohesion: 0.12
Nodes (20): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit (+12 more)

### Community 117 - "Supply schema"
Cohesion: 0.12
Nodes (20): RocketPurchaseConfirmationLine.channelListingOption, RocketPurchaseConfirmationLine.channelListingOptionId, RocketPurchaseConfirmationLine.collectedAt, RocketPurchaseConfirmationLine.collectedOrderLineItemId, RocketPurchaseConfirmationLine.confirmation, RocketPurchaseConfirmationLine.confirmationId, RocketPurchaseConfirmationLine.confirmedQuantity, RocketPurchaseConfirmationLine.createdAt (+12 more)

### Community 118 - "Sourcing schema"
Cohesion: 0.12
Nodes (20): Sourcing1688HotProductDailySnapshot.businessDate, Sourcing1688HotProductDailySnapshot.capturedAt, Sourcing1688HotProductDailySnapshot.createdAt, Sourcing1688HotProductDailySnapshot.id, Sourcing1688HotProductDailySnapshot.imageUrl, Sourcing1688HotProductDailySnapshot.monthlySales, Sourcing1688HotProductDailySnapshot.offerId, Sourcing1688HotProductDailySnapshot.organization (+12 more)

### Community 119 - "AI schema"
Cohesion: 0.11
Nodes (20): ThumbnailGenerationInputImage.candidateImage, ThumbnailGenerationInputImage.createdAt, ThumbnailGenerationInputImage.fileSize, ThumbnailGenerationInputImage.generation, ThumbnailGenerationInputImage.generationId, ThumbnailGenerationInputImage.height, ThumbnailGenerationInputImage.id, ThumbnailGenerationInputImage.label (+12 more)

### Community 120 - "Community 120"
Cohesion: 0.21
Nodes (18): analyzePrReleaseContract(), changedFilesFromGit(), classifyFiles(), compareSemver(), deletedFilesFromGit(), ghPrBody(), git(), hasReleaseDecision() (+10 more)

### Community 121 - "Orders schema"
Cohesion: 0.12
Nodes (19): CoupangDirectPoSnapshot.centerName, CoupangDirectPoSnapshot.channelAccountId, CoupangDirectPoSnapshot.collectedAt, CoupangDirectPoSnapshot.createdAt, CoupangDirectPoSnapshot.deliveryDate, CoupangDirectPoSnapshot.id, CoupangDirectPoSnapshot.isUrgent, CoupangDirectPoSnapshot.itemsJson (+11 more)

### Community 122 - "Supply schema"
Cohesion: 0.12
Nodes (19): PurchaseOrderSubmissionAttempt.createdAt, PurchaseOrderSubmissionAttempt.errorCode, PurchaseOrderSubmissionAttempt.errorMessage, PurchaseOrderSubmissionAttempt.freshnessGeneration, PurchaseOrderSubmissionAttempt.id, PurchaseOrderSubmissionAttempt.idempotencyKey, PurchaseOrderSubmissionAttempt.organization, PurchaseOrderSubmissionAttempt.providerReference (+11 more)

### Community 123 - "Inventory schema"
Cohesion: 0.12
Nodes (19): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.notes, ReturnTransfer.optionName, ReturnTransfer.organization (+11 more)

### Community 124 - "Community 124"
Cohesion: 0.16
Nodes (19): asRecord(), conversionRate(), dailyRawMetricsMatch(), dateStringMatches(), exactHeaderValues(), finiteNumber(), hasExactCoupangAdsDailyRawProvenance(), isExactWholeAccountCampaignRun() (+11 more)

### Community 125 - "Community 125"
Cohesion: 0.19
Nodes (18): assertAllowedArguments(), assertPublishableOffice(), copyLoadableExtension(), createArchive(), environmentProfiles, githubReleaseCommand(), gitOutput(), gitSha() (+10 more)

### Community 126 - "Community 126"
Cohesion: 0.12
Nodes (13): ChannelAccountController, Body, Controller, CurrentOrganization, Get, ChannelAccountListItem, ChannelAccountListItemSchema, CoupangAccountSettings (+5 more)

### Community 127 - "Community 127"
Cohesion: 0.11
Nodes (16): CurrentOrganization, Get, Query, AVAILABILITY_STATUSES, ChannelSkuAvailabilityQueryDto, IsIn, IsInt, IsOptional (+8 more)

### Community 128 - "Community 128"
Cohesion: 0.18
Nodes (10): assertCanonicalCoupangAccountIdentity(), canonicalParentRows(), ChannelCatalogImportRepositoryAdapter, importResponse(), isUniqueConstraintError(), nextPublicationSequence(), Injectable, zeroChanges() (+2 more)

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

### Community 135 - "AI schema"
Cohesion: 0.12
Nodes (18): ThumbnailGenerationEvent.actor, ThumbnailGenerationEvent.actorUserId, ThumbnailGenerationEvent.attemptNumber, ThumbnailGenerationEvent.createdAt, ThumbnailGenerationEvent.errorMessage, ThumbnailGenerationEvent.eventType, ThumbnailGenerationEvent.fromPhase, ThumbnailGenerationEvent.fromStatus (+10 more)

### Community 136 - "Community 136"
Cohesion: 0.11
Nodes (16): CANCEL_OPERATION_TARGET_TYPES, CancelOperationAffected, CancelOperationAffectedSchema, CancelOperationPreserved, CancelOperationPreservedSchema, CancelOperationResponse, CancelOperationResponseSchema, CancelOperationStatus (+8 more)

### Community 137 - "Community 137"
Cohesion: 0.18
Nodes (8): ChannelCatalogCollectionRepositoryAdapter, isUniqueConstraintError(), ownedRunWhere(), Injectable, ChannelCatalogCollectionChunkRecord, ChannelCatalogCollectionRunRecord, ChannelCatalogCollectionWithChunks, startRun()

### Community 138 - "Channels schema"
Cohesion: 0.16
Nodes (15): normalizeSellpiaManualMatchAlias(), SellpiaManualMatchAlias.aliasTitle, SellpiaManualMatchAlias.createdAt, SellpiaManualMatchAlias.evidenceCount, SellpiaManualMatchAlias.id, SellpiaManualMatchAlias.itemCount, SellpiaManualMatchAlias.matchedType, SellpiaManualMatchAlias.normalizedAlias (+7 more)

### Community 139 - "Core schema"
Cohesion: 0.12
Nodes (17): MasterProductAbcGradeHistory.adjustedScore, MasterProductAbcGradeHistory.calculatedAt, MasterProductAbcGradeHistory.calculationStatus, MasterProductAbcGradeHistory.formulaVersion, MasterProductAbcGradeHistory.formulaVersionId, MasterProductAbcGradeHistory.id, MasterProductAbcGradeHistory.masterProduct, MasterProductAbcGradeHistory.masterProductId (+9 more)

### Community 140 - "Inventory schema"
Cohesion: 0.14
Nodes (17): StockTransfer.fromWarehouseId, StockTransfer.toWarehouseId, Warehouse.address, Warehouse.code, Warehouse.createdAt, Warehouse.id, Warehouse.isDefault, Warehouse.manager (+9 more)

### Community 141 - "Community 141"
Cohesion: 0.13
Nodes (9): RocketAccountController, Controller, CurrentOrganization, Post, ChannelAccountListRow, CoupangCredentials, ChannelAccountService, Inject (+1 more)

### Community 142 - "AgentOS schema"
Cohesion: 0.15
Nodes (16): AgentRunEvent.agentInstance, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message, AgentRunEvent.organization (+8 more)

### Community 143 - "Channels schema"
Cohesion: 0.16
Nodes (16): ChannelScrapeChunk.checksum, ChannelScrapeChunk.createdAt, ChannelScrapeChunk.id, ChannelScrapeChunk.itemCount, ChannelScrapeChunk.kind, ChannelScrapeChunk.organization, ChannelScrapeChunk.payload, ChannelScrapeChunk.publicationJson (+8 more)

### Community 144 - "Advertising schema"
Cohesion: 0.13
Nodes (16): ExecutionTask.action, ExecutionTask.actionId, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt, ExecutionTask.errorMessage, ExecutionTask.finishedAt (+8 more)

### Community 145 - "Inventory schema"
Cohesion: 0.13
Nodes (16): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.organization, PickingItem.pickedAt, PickingItem.pickingList (+8 more)

### Community 146 - "Inventory schema"
Cohesion: 0.15
Nodes (16): PickingItem.pickingListId, PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.id, PickingList.listNumber, PickingList.organization, PickingList.pickedItems (+8 more)

### Community 147 - "Supply schema"
Cohesion: 0.16
Nodes (16): RocketPurchaseConfirmationTransmission.confirmation, RocketPurchaseConfirmationTransmission.confirmationId, RocketPurchaseConfirmationTransmission.createdAt, RocketPurchaseConfirmationTransmission.id, RocketPurchaseConfirmationTransmission.intentKey, RocketPurchaseConfirmationTransmission.matchedLineCount, RocketPurchaseConfirmationTransmission.observedAt, RocketPurchaseConfirmationTransmission.organization (+8 more)

### Community 148 - "Channels schema"
Cohesion: 0.14
Nodes (16): SellpiaManualMatchAlias.snapshotId, SellpiaManualMatchSnapshot.aliasCount, SellpiaManualMatchSnapshot.capturedAt, SellpiaManualMatchSnapshot.createdAt, SellpiaManualMatchSnapshot.id, SellpiaManualMatchSnapshot.matchedTargetCount, SellpiaManualMatchSnapshot.organization, SellpiaManualMatchSnapshot.schemaVersion (+8 more)

### Community 149 - "Inventory schema"
Cohesion: 0.13
Nodes (16): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.id, StockTransfer.notes, StockTransfer.optionName, StockTransfer.organization, StockTransfer.quantity (+8 more)

### Community 150 - "Community 150"
Cohesion: 0.24
Nodes (14): analyzeReconstructionTriggers(), changedFilesFromGit(), ghPrBody(), git(), isCrossLayerControlChange(), isHighRiskBoundary(), isLargeServiceOrComponent(), layerOf() (+6 more)

### Community 151 - "Community 151"
Cohesion: 0.13
Nodes (8): RocketPoCatalogPort, RocketPoCatalogResolution, canonicalArtifactHash(), isCompleteCollection(), RocketPoCatalogService, Inject, Injectable, RocketPurchasePreviewRequestSchema

### Community 152 - "Finance schema"
Cohesion: 0.14
Nodes (15): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description (+7 more)

### Community 153 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 154 - "Sourcing schema"
Cohesion: 0.17
Nodes (15): NaverPopularKeywordDailySnapshot.boardKey, NaverPopularKeywordDailySnapshot.boardLabel, NaverPopularKeywordDailySnapshot.businessDate, NaverPopularKeywordDailySnapshot.capturedAt, NaverPopularKeywordDailySnapshot.cid, NaverPopularKeywordDailySnapshot.createdAt, NaverPopularKeywordDailySnapshot.id, NaverPopularKeywordDailySnapshot.keyword (+7 more)

### Community 155 - "Finance schema"
Cohesion: 0.14
Nodes (15): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.id, ProcessingCost.master, ProcessingCost.notes, ProcessingCost.organization, ProcessingCost.processType, ProcessingCost.productName (+7 more)

### Community 156 - "Finance schema"
Cohesion: 0.15
Nodes (15): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.organization, SalesPlan.period (+7 more)

### Community 157 - "Inventory schema"
Cohesion: 0.14
Nodes (15): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.sourceRef, SellpiaReceiptUploadBatch.sourceType (+7 more)

### Community 158 - "Channels schema"
Cohesion: 0.16
Nodes (15): SellpiaSalesDailySnapshot.businessDate, SellpiaSalesDailySnapshot.capturedAt, SellpiaSalesDailySnapshot.channelGroup, SellpiaSalesDailySnapshot.costKrw, SellpiaSalesDailySnapshot.createdAt, SellpiaSalesDailySnapshot.id, SellpiaSalesDailySnapshot.organization, SellpiaSalesDailySnapshot.qty (+7 more)

### Community 159 - "Inventory schema"
Cohesion: 0.15
Nodes (15): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items, StockAudit.matchedCount (+7 more)

### Community 160 - "Supply schema"
Cohesion: 0.16
Nodes (15): SupplierProduct.createdAt, SupplierProduct.id, SupplierProduct.isPrimary, SupplierProduct.memo, SupplierProduct.minOrderQty, SupplierProduct.organization, SupplierProduct.sellpiaInventorySku, SupplierProduct.sellpiaInventorySkuId (+7 more)

### Community 161 - "Community 161"
Cohesion: 0.19
Nodes (12): SELLPIA_WORKBOOK_ACCEPT, SELLPIA_WORKBOOK_FILE_EXTENSIONS, SELLPIA_WORKBOOK_FORMAT_LABEL, SellpiaReceiptBatchCreateInput, SellpiaReceiptBatchCreateInputSchema, SellpiaReceiptBatchMarkUploadedInput, SellpiaReceiptBatchMarkUploadedInputSchema, SellpiaReceiptUploadBatch (+4 more)

### Community 162 - "Advertising schema"
Cohesion: 0.15
Nodes (14): ExecutionTask.workerId, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentTaskRef, ExecutionWorker.currentUrl, ExecutionWorker.id, ExecutionWorker.label, ExecutionWorker.lastHeartbeatAt (+6 more)

### Community 163 - "System schema"
Cohesion: 0.15
Nodes (12): FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name, FeatureGate.updatedAt (+4 more)

### Community 164 - "Community 164"
Cohesion: 0.15
Nodes (5): MarketplaceRegistrationRepositoryAdapter, Injectable, MarketplaceRegistrationRepositoryPort, Inject, Optional

### Community 165 - "Inventory schema"
Cohesion: 0.18
Nodes (13): packages/shared — @kiditem/shared, Inventory, CoupangShipmentDateSummary.boxes, CoupangShipmentDateSummary.capturedAt, CoupangShipmentDateSummary.count, CoupangShipmentDateSummary.createdAt, CoupangShipmentDateSummary.id, CoupangShipmentDateSummary.organization (+5 more)

### Community 166 - "Channels schema"
Cohesion: 0.19
Nodes (13): CoupangKeywordSerpDailySnapshot.businessDate, CoupangKeywordSerpDailySnapshot.capturedAt, CoupangKeywordSerpDailySnapshot.createdAt, CoupangKeywordSerpDailySnapshot.id, CoupangKeywordSerpDailySnapshot.itemCount, CoupangKeywordSerpDailySnapshot.items, CoupangKeywordSerpDailySnapshot.keyword, CoupangKeywordSerpDailySnapshot.organization (+5 more)

### Community 167 - "Finance schema"
Cohesion: 0.17
Nodes (13): GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.listing, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization, GradeHistory.reason (+5 more)

### Community 168 - "Core schema"
Cohesion: 0.17
Nodes (13): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+5 more)

### Community 169 - "Supply schema"
Cohesion: 0.21
Nodes (13): ProcurementTestIntent.selectedPriceTierId, SupplierOfferPriceTier.createdAt, SupplierOfferPriceTier.id, SupplierOfferPriceTier.maxQuantity, SupplierOfferPriceTier.minQuantity, SupplierOfferPriceTier.organization, SupplierOfferPriceTier.supplierOfferSkuSnapshot, SupplierOfferPriceTier.supplierOfferSkuSnapshotId (+5 more)

### Community 170 - "Channels schema"
Cohesion: 0.18
Nodes (13): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson, RocketSupplyDailySnapshot.revenueKrw (+5 more)

### Community 171 - "Sourcing schema"
Cohesion: 0.22
Nodes (13): SourcingDecisionEvidence.createdAt, SourcingDecisionEvidence.decisionBatchItem, SourcingDecisionEvidence.decisionBatchItemId, SourcingDecisionEvidence.evidenceObservation, SourcingDecisionEvidence.evidenceObservationId, SourcingDecisionEvidence.id, SourcingDecisionEvidence.ordinal, SourcingDecisionEvidence.organization (+5 more)

### Community 172 - "Community 172"
Cohesion: 0.31
Nodes (11): analyzeSchemaArtifactSync(), changedFilesFromGit(), changedFilesFromWorkingTree(), GENERATED_ARTIFACT_PATHS, git(), main(), matchesAnyPath(), mergeChangedFiles() (+3 more)

### Community 173 - "Community 173"
Cohesion: 0.26
Nodes (7): ChannelSyncController, Body, Controller, CurrentOrganization, CurrentUser, Get, Post

### Community 174 - "Core schema"
Cohesion: 0.20
Nodes (12): Core, CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.keywords, CategoryMapping.organization (+4 more)

### Community 175 - "Supply schema"
Cohesion: 0.18
Nodes (12): Supply, PurchaseOrderItem.createdAt, PurchaseOrderItem.id, PurchaseOrderItem.order, PurchaseOrderItem.organization, PurchaseOrderItem.productName, PurchaseOrderItem.quantity, PurchaseOrderItem.sellpiaInventorySku (+4 more)

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

### Community 180 - "Supply schema"
Cohesion: 0.21
Nodes (12): RocketPurchaseConfirmationAllocation.confirmationLine, RocketPurchaseConfirmationAllocation.confirmationLineId, RocketPurchaseConfirmationAllocation.createdAt, RocketPurchaseConfirmationAllocation.id, RocketPurchaseConfirmationAllocation.organization, RocketPurchaseConfirmationAllocation.quantity, RocketPurchaseConfirmationAllocation.sellpiaInventorySku, RocketPurchaseConfirmationAllocation.sellpiaInventorySkuId (+4 more)

### Community 181 - "Community 181"
Cohesion: 0.33
Nodes (5): SellpiaRecipeEvidenceAdapter, toEvidenceSku(), Inject, Injectable, SellpiaRecipeEvidenceSku

### Community 182 - "Community 182"
Cohesion: 0.20
Nodes (6): buildCoupangWingSnapshotCoverage(), CoupangWingSnapshotCoverage, ChannelCatalogImportRepositoryPort, Inject, ParsedWingCatalogRow, ParsedWingCatalogSkippedRow

### Community 183 - "Community 183"
Cohesion: 0.20
Nodes (5): MAX_COUPANG_WING_IMPORT_ROWS, PARENT_COLUMN_INDEXES, REQUIRED_HEADERS, workbookBuffer(), WorkbookOptions

### Community 184 - "System schema"
Cohesion: 0.20
Nodes (11): ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization, ActivityEvent.source (+3 more)

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

### Community 190 - "Advertising schema"
Cohesion: 0.22
Nodes (10): Advertising, ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.id, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.url (+2 more)

### Community 191 - "System schema"
Cohesion: 0.24
Nodes (10): System, SystemSetting.createdAt, SystemSetting.id, SystemSetting.key, SystemSetting.organization, SystemSetting.updatedAt, SystemSetting.value, SystemSetting (+2 more)

### Community 192 - "Advertising schema"
Cohesion: 0.22
Nodes (10): ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task, ExecutionLog.taskId (+2 more)

### Community 193 - "Community 193"
Cohesion: 0.20
Nodes (6): ErrorCodes, deletedLegacyTables, repoRoot, retiredBaselineScript, retiredImporterFile, retiredPlannerFile

### Community 194 - "Community 194"
Cohesion: 0.38
Nodes (8): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), main(), parseBaseline(), readFiles(), repoRoot(), walk()

### Community 195 - "Community 195"
Cohesion: 0.25
Nodes (6): ChannelAccountListController, Controller, CurrentOrganization, Get, ChannelAccountQueryService, Injectable

### Community 196 - "Community 196"
Cohesion: 0.25
Nodes (5): ChannelsOperationAlertAdapter, Inject, Injectable, OperationLifecyclePatch, StartOperationAlertInput

### Community 197 - "Community 197"
Cohesion: 0.22
Nodes (8): upsertChannelCatalogIdentities(), flattenMedia(), upsertCoupangCatalogRows(), publishIdentities(), nextPublicationSequence(), toCompletedRun(), zeroChanges(), CoupangRocketMatchingCsvImportResponseSchema

### Community 199 - "Community 199"
Cohesion: 0.25
Nodes (8): distinct(), evidenceForCode(), evidenceForNames(), manualMatchAliasCandidates(), normalizePhysicalBarcode(), normalizeRecipeIdentityText(), normalizeRecipeSuggestionName(), ChannelRecipeSuggestionResponseSchema

### Community 200 - "Channels schema"
Cohesion: 0.25
Nodes (9): Channels, CoupangRepresentativeKeywordOverride.createdAt, CoupangRepresentativeKeywordOverride.id, CoupangRepresentativeKeywordOverride.keyword, CoupangRepresentativeKeywordOverride.organization, CoupangRepresentativeKeywordOverride.updatedAt, CoupangRepresentativeKeywordOverride, coupang_representative_keyword_overrides (+1 more)

### Community 201 - "Community 201"
Cohesion: 0.22
Nodes (7): ReadinessCheck, ReadinessCheckSchema, ReadinessCheckStatusSchema, ReadinessResponse, ReadinessResponseSchema, RebuildReadinessResponse, RebuildReadinessResponseSchema

### Community 202 - "Community 202"
Cohesion: 0.31
Nodes (9): addExactHeaderEvidence(), asRecord(), CONVERSION_COUNT_HEADERS, normalizeHeader(), parseObservedCount(), recoverObservedCampaignTargetConversions(), resolveRevenueShapedCampaignTargetConversion(), roundedNumber() (+1 more)

### Community 204 - "Community 204"
Cohesion: 0.25
Nodes (8): assertLocalDevelopmentDatabase(), bootstrapAuthoritativeInventoryDevelopment(), buildBootstrapPlan(), LOCAL_HOSTS, main(), optionalUuid(), parseBootstrapArgs(), slugify()

### Community 205 - "Community 205"
Cohesion: 0.46
Nodes (6): analyzeInventory(), listTopLevelScriptFiles(), main(), repoRoot(), SCRIPT_INVENTORY, SUPPORT_FILES

### Community 206 - "Community 206"
Cohesion: 0.25
Nodes (4): repoRoot, scriptPath, supportedExtensions, temporaryDirectories

### Community 207 - "Community 207"
Cohesion: 0.29
Nodes (6): CurrentOrganization, CurrentUser, Param, Post, UploadedFile, UseInterceptors

### Community 208 - "Community 208"
Cohesion: 0.33
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 209 - "Community 209"
Cohesion: 0.47
Nodes (3): PRODUCT_LIFECYCLE_STATES, ProductLifecycleState, ProductLifecycleStateSchema

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
Cohesion: 1.00
Nodes (3): makeRepository(), runRecord(), runWithChunks()

## Knowledge Gaps
- **3202 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+3197 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `AI schema` to `prisma field: prisma — Shared Schema`, `Community 1`, `prisma field: Database ERD`, `prisma field: AgentToolDefinition.isActive`, `prisma field: externalOptionId canonical option identity`, `Orders schema`, `Community 6`, `Orders schema`, `AI schema`, `Orders schema`, `Core schema`, `Core schema`, `Sourcing schema`, `AI schema`, `Channels schema`, `Core schema`, `Community 18`, `Community 19`, `Sourcing schema`, `AI schema`, `System schema`, `Community 26`, `AgentOS schema`, `Core schema`, `Orders schema`, `Community 30`, `Community 31`, `Sourcing schema`, `AgentOS schema`, `Supply schema`, `AI schema`, `AI schema`, `Supply schema`, `Supply schema`, `AI schema`, `Channels schema`, `AI schema`, `Core schema`, `System schema`, `Sourcing schema`, `AI schema`, `Channels schema`, `Sourcing schema`, `Sourcing schema`, `Sourcing schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Supply schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Channels schema`, `AgentOS schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Sourcing schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `System schema`, `Advertising schema`, `Sourcing schema`, `AgentOS schema`, `Channels schema`, `Sourcing schema`, `AgentOS schema`, `AI schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Core schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `Finance schema`, `Supply schema`, `Sourcing schema`, `AI schema`, `Orders schema`, `Supply schema`, `Inventory schema`, `AgentOS schema`, `Sourcing schema`, `Sourcing schema`, `System schema`, `Channels schema`, `AI schema`, `Channels schema`, `Core schema`, `Inventory schema`, `Community 141`, `AgentOS schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Channels schema`, `Inventory schema`, `Finance schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Supply schema`, `Advertising schema`, `System schema`, `Inventory schema`, `Channels schema`, `Finance schema`, `Core schema`, `Supply schema`, `Channels schema`, `Sourcing schema`, `Core schema`, `Supply schema`, `Channels schema`, `Inventory schema`, `Core schema`, `Supply schema`, `System schema`, `Advertising schema`, `System schema`, `Channels schema`?**
  _High betweenness centrality (0.246) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `prisma field: Database ERD` to `prisma field: prisma — Shared Schema`, `prisma field: AgentToolDefinition.isActive`, `prisma field: externalOptionId canonical option identity`, `Orders schema`, `Orders schema`, `AI schema`, `AI schema`, `Orders schema`, `Core schema`, `Core schema`, `Sourcing schema`, `AI schema`, `Channels schema`, `Core schema`, `Sourcing schema`, `AI schema`, `System schema`, `AgentOS schema`, `Core schema`, `Orders schema`, `Sourcing schema`, `AgentOS schema`, `Supply schema`, `AI schema`, `AI schema`, `Supply schema`, `Supply schema`, `AI schema`, `Channels schema`, `AI schema`, `Core schema`, `System schema`, `Sourcing schema`, `AI schema`, `Channels schema`, `Sourcing schema`, `Sourcing schema`, `Sourcing schema`, `Supply schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Supply schema`, `Channels schema`, `Channels schema`, `Inventory schema`, `Channels schema`, `AgentOS schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Sourcing schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `System schema`, `Advertising schema`, `Sourcing schema`, `AgentOS schema`, `Channels schema`, `Sourcing schema`, `AgentOS schema`, `AI schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Core schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `Finance schema`, `Supply schema`, `Sourcing schema`, `AI schema`, `Orders schema`, `Supply schema`, `Inventory schema`, `AgentOS schema`, `Sourcing schema`, `Sourcing schema`, `System schema`, `Channels schema`, `AI schema`, `Channels schema`, `Core schema`, `Inventory schema`, `AgentOS schema`, `Channels schema`, `Advertising schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Channels schema`, `Inventory schema`, `Finance schema`, `System schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Supply schema`, `Advertising schema`, `System schema`, `Inventory schema`, `Channels schema`, `Finance schema`, `Core schema`, `Supply schema`, `Channels schema`, `Sourcing schema`, `Core schema`, `Supply schema`, `Channels schema`, `Inventory schema`, `Core schema`, `System schema`, `Supply schema`, `System schema`, `Advertising schema`, `System schema`, `Advertising schema`, `Channels schema`?**
  _High betweenness centrality (0.209) - this node is a cross-community bridge._
- **Why does `Order` connect `Orders schema` to `prisma field: prisma — Shared Schema`, `Community 1`, `prisma field: Database ERD`, `prisma field: AgentToolDefinition.isActive`, `prisma field: externalOptionId canonical option identity`, `Community 6`, `Orders schema`, `AI schema`, `AI schema`, `Orders schema`, `Core schema`, `Community 13`, `Sourcing schema`, `Community 18`, `Community 23`, `System schema`, `Community 26`, `Orders schema`, `Community 30`, `Community 31`, `Supply schema`, `Community 41`, `Community 172`, `Community 45`, `Community 46`, `Core schema`, `Community 183`, `Community 189`, `Channels schema`, `Community 205`, `Community 82`, `Community 210`, `Community 96`, `Community 102`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Are the 190 inferred relationships involving `Organization` (e.g. with `channel-registration-capability.adapter.spec.ts` and `channel-registration-capability.adapter.ts`) actually correct?**
  _`Organization` has 190 INFERRED edges - model-reasoned connections that need verification._
- **Are the 139 inferred relationships involving `ChannelAccount` (e.g. with `channel-registration-capability.adapter.spec.ts` and `channel-registration-capability.adapter.ts`) actually correct?**
  _`ChannelAccount` has 139 INFERRED edges - model-reasoned connections that need verification._
- **Are the 96 inferred relationships involving `ChannelListing` (e.g. with `channel-registration-capability.adapter.ts` and `channel-listing.controller.ts`) actually correct?**
  _`ChannelListing` has 96 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason` to the rest of the system?**
  _3202 weakly-connected nodes found - possible documentation gaps or missing edges._