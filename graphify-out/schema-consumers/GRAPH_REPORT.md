# Graph Report - schema-consumers  (2026-07-23)

## Corpus Check
- 402 files · ~212,697 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 6080 nodes · 35212 edges · 220 communities (199 shown, 21 thin omitted)
- Extraction: 31% EXTRACTED · 69% INFERRED · 0% AMBIGUOUS · INFERRED: 24221 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- prisma field: externalOptionId canonical option identity
- Community 1
- AI schema
- Community 3
- prisma field: channels — Marketplace Sync + SKU Matching
- Community 5
- Community 6
- Community 7
- Community 8
- AI schema
- AI schema
- Community 11
- Community 12
- Supply schema
- Channels schema
- Orders schema
- Supply schema
- Community 17
- Core schema
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Supply schema
- Community 25
- Core schema
- AgentOS schema
- Community 28
- Core schema
- AgentOS schema
- Sourcing schema
- AI schema
- Advertising schema
- Community 34
- System schema
- Community 36
- Community 37
- Channels schema
- Inventory schema
- Community 40
- prisma field: AdAction.listingOptionId
- Orders schema
- Orders schema
- AI schema
- Inventory schema
- Sourcing schema
- Inventory schema
- Community 48
- System schema
- prisma field: ActionTask.targetId
- AI schema
- Channels schema
- Community 53
- Supply schema
- AI schema
- Sourcing schema
- AgentOS schema
- Core schema
- Inventory schema
- Community 60
- Community 61
- AI schema
- Core schema
- Orders schema
- Community 65
- Community 66
- Channels schema
- Channels schema
- Community 69
- AI schema
- AgentOS schema
- Inventory schema
- Community 73
- Community 74
- System schema
- Finance schema
- Orders schema
- AgentOS schema
- Channels schema
- Community 80
- Community 81
- Community 82
- AgentOS schema
- Channels schema
- Inventory schema
- Community 86
- Community 87
- Channels schema
- Orders schema
- Community 90
- Community 91
- Sourcing schema
- AgentOS schema
- Core schema
- Community 95
- Community 96
- Community 97
- Community 98
- AgentOS schema
- Channels schema
- System schema
- Advertising schema
- Community 103
- Community 104
- AgentOS schema
- Channels schema
- Channels schema
- Community 108
- Community 109
- Community 110
- Community 111
- Community 112
- AgentOS schema
- AI schema
- System schema
- Sourcing schema
- Sourcing schema
- AI schema
- Community 119
- AgentOS schema
- Finance schema
- Channels schema
- Sourcing schema
- Community 124
- Community 125
- Community 126
- AgentOS schema
- Supply schema
- Inventory schema
- Community 130
- Community 131
- Community 132
- Community 133
- AI schema
- Sourcing schema
- Sourcing schema
- Channels schema
- Channels schema
- Community 139
- Community 140
- AgentOS schema
- AgentOS schema
- Community 143
- Community 144
- Community 145
- AgentOS schema
- Channels schema
- Inventory schema
- Community 149
- Community 150
- Orders schema
- Sourcing schema
- Finance schema
- Finance schema
- Channels schema
- Inventory schema
- Community 157
- System schema
- Community 159
- Community 160
- Community 161
- Channels schema
- Channels schema
- Core schema
- Channels schema
- Community 166
- Community 167
- System schema
- Community 169
- Community 170
- Community 171
- Inventory schema
- Community 173
- Community 174
- Community 175
- Community 176
- Community 177
- Community 178
- Community 179
- Channels schema
- Advertising schema
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

## God Nodes (most connected - your core abstractions)
1. `Organization` - 443 edges
2. `Database ERD` - 364 edges
3. `ChannelAccount` - 201 edges
4. `ChannelListing` - 192 edges
5. `Order` - 181 edges
6. `ProductPreparation.organizationId` - 177 edges
7. `ContentWorkspace.organizationId` - 176 edges
8. `ChannelListing.organizationId` - 173 edges
9. `ProductRegistrationExecution.organizationId` - 172 edges
10. `ChannelAdTargetDailySnapshot.organizationId` - 171 edges
11. `SourceImportRun.organizationId` - 171 edges
12. `ContentWorkspaceThumbnailSelection.organizationId` - 170 edges

## Surprising Connections (you probably didn't know these)
- `distinctStrings()` --indirect_call--> `value()`  [INFERRED]
  apps/server/src/channels/adapter/out/repository/channel-product-matching.repository.adapter.ts → scripts/_shared/cli-args.ts
- `parseCoupangWingWorkbook()` --indirect_call--> `required()`  [INFERRED]
  apps/server/src/channels/application/service/coupang-wing-workbook.parser.ts → scripts/manage-extension-release.mjs
- `findHeaderRow()` --indirect_call--> `required()`  [INFERRED]
  apps/server/src/channels/application/service/coupang-wing-workbook.parser.ts → scripts/manage-extension-release.mjs
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

## Import Cycles
- None detected.

## Communities (220 total, 21 thin omitted)

### Community 0 - "prisma field: externalOptionId canonical option identity"
Cohesion: 0.11
Nodes (338): UploadedWorkbookFile, HEADERS, USER, chunkSelect, ErrorInput, LockedRun, OwnedRunInput, PutChunkInput (+330 more)

### Community 1 - "Community 1"
Cohesion: 0.02
Nodes (101): AgentApprovalRequestSummary, AgentApprovalRequestSummarySchema, AgentApprovalStatus, AgentApprovalStatusSchema, AgentArtifactHandoffSummary, AgentArtifactHandoffSummarySchema, AgentArtifactStatus, AgentArtifactStatusSchema (+93 more)

### Community 2 - "AI schema"
Cohesion: 0.03
Nodes (67): ContentAsset.originGenerationGroupId, ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.editedHtmlSavedAt (+59 more)

### Community 3 - "Community 3"
Cohesion: 0.03
Nodes (75): AdMetricsDetail, AdMetricsDetailSchema, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary, DashboardAdSummarySchema (+67 more)

### Community 4 - "prisma field: channels — Marketplace Sync + SKU Matching"
Cohesion: 0.05
Nodes (44): PARENT_COLUMN_INDEXES, REQUIRED_HEADERS, workbookBuffer(), WorkbookOptions, ChannelProductCandidate, ChannelProductCandidateRankingInput, emptyEvidence(), keep() (+36 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (66): option(), AdapterCommand, appendFlag(), appendOption(), appendProjectReferenceDefaults(), archiveFileName(), archiveShaFileName(), Args (+58 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (63): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignReportScope, AdCampaignReportScopeSchema (+55 more)

### Community 7 - "Community 7"
Cohesion: 0.05
Nodes (63): ActionTask, ActionTaskExecuteResponse, ActionTaskList, ActionTaskListSchema, ActionTaskRelatedProduct, ActionTaskRelatedProductSchema, ActionTaskSchema, ActionTaskSourceAlert (+55 more)

### Community 8 - "Community 8"
Cohesion: 0.03
Nodes (63): CreateMasterProductInput, CreateMasterProductInputSchema, CreateProductVariantFieldsSchema, CreateProductVariantInput, CreateProductVariantInputSchema, MasterProductDisplayReference, MasterProductDisplayReferenceSchema, MasterProductMutationFieldsSchema (+55 more)

### Community 9 - "AI schema"
Cohesion: 0.04
Nodes (62): packages/shared — @kiditem/shared, AI, Inventory, ProductPreparation.selectedThumbnailGenerationId, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.contentWorkspaceId, ThumbnailGeneration.createdAt (+54 more)

### Community 10 - "AI schema"
Cohesion: 0.04
Nodes (54): ContentGeneration.detailPageArtifactId, ContentWorkspace.currentDetailPageArtifactId, ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.contentWorkspaceId, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.createdByUserId (+46 more)

### Community 11 - "Community 11"
Cohesion: 0.05
Nodes (31): ChannelRegistrationCapabilityAdapter, Injectable, assertExactProductGraph(), MarketplaceRegistrationRepositoryAdapter, Injectable, upsertExactOptionLinks(), ChannelsMarketplaceRegistrationCapabilityPort, ProductRegistrationSubmissionCapabilityInput (+23 more)

### Community 12 - "Community 12"
Cohesion: 0.05
Nodes (51): importResponse(), InventorySkuLinkedProduct, InventorySkuLinkedProductSchema, InventorySkuLinkedVariant, InventorySkuLinkedVariantSchema, InventorySkuSnapshotItem, InventorySkuSnapshotItemSchema, InventorySkuSnapshotListResponse (+43 more)

### Community 13 - "Supply schema"
Cohesion: 0.05
Nodes (54): Database ERD, ProcessingCost.masterId, PurchaseOrder.supplierId, Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.id (+46 more)

### Community 14 - "Channels schema"
Cohesion: 0.04
Nodes (55): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+47 more)

### Community 15 - "Orders schema"
Cohesion: 0.05
Nodes (45): CHANNELS_ROOT, REPO_ROOT, CSRecord.orderId, Order.channelAccount, Order.channelAccountId, Order.createdAt, Order.customerName, Order.deliveredAt (+37 more)

### Community 16 - "Supply schema"
Cohesion: 0.04
Nodes (54): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+46 more)

### Community 17 - "Community 17"
Cohesion: 0.06
Nodes (43): ChannelCatalogImportController, Controller, Inject, ChannelProductMatchingController, Controller, ChannelSkuAvailabilityController, Controller, ChannelRecipeAutomationContextRepositoryAdapter (+35 more)

### Community 18 - "Core schema"
Cohesion: 0.05
Nodes (50): AVAILABILITY_STATUSES, ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id, ChannelAccount.isPrimary, ChannelAccount.name (+42 more)

### Community 19 - "Community 19"
Cohesion: 0.09
Nodes (47): apiHeaders(), apiUrl(), Args, assertSafeDatasetId(), assertSupportedReplayPayloads(), BundleManifest, BundlePayload, BundleReference (+39 more)

### Community 20 - "Community 20"
Cohesion: 0.08
Nodes (47): bool(), value(), applyCacheControl(), ApplyResult, applyS3CacheControl(), applySupabaseCacheControl(), assertApplyAllowed(), buildCopyObjectInput() (+39 more)

### Community 21 - "Community 21"
Cohesion: 0.04
Nodes (46): ChunkRequestBaseSchema, CoupangCatalogAttributeV1, CoupangCatalogAttributeV1Schema, CoupangCatalogBrowserCommand, CoupangCatalogBrowserCommandSchema, CoupangCatalogBrowserStatus, CoupangCatalogBrowserStatusSchema, CoupangCatalogChunkKind (+38 more)

### Community 22 - "Community 22"
Cohesion: 0.10
Nodes (48): assertNonProductionTarget(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged(), assertSha256(), BaselineManifest, BaselineManifestExpectation, baselineObjectKeys, buildChecksumsFile() (+40 more)

### Community 23 - "Community 23"
Cohesion: 0.04
Nodes (47): deriveSellpiaInventoryFreshness(), FixedSellpiaAccountKeySchema, FixedSellpiaOriginSchema, IsoDateTimeStringSchema, SELLPIA_INVENTORY_FRESHNESS_STATUSES, SELLPIA_INVENTORY_REFRESH_REASONS, SellpiaFreshnessDerivationInput, SellpiaInventoryActiveSyncViewSchema (+39 more)

### Community 24 - "Supply schema"
Cohesion: 0.05
Nodes (48): RocketPurchaseConfirmation.artifactBytes, RocketPurchaseConfirmation.artifactContentType, RocketPurchaseConfirmation.artifactFileName, RocketPurchaseConfirmation.artifactSha256, RocketPurchaseConfirmation.artifactStoredAt, RocketPurchaseConfirmation.channelAccount, RocketPurchaseConfirmation.channelAccountId, RocketPurchaseConfirmation.completedAt (+40 more)

### Community 25 - "Community 25"
Cohesion: 0.10
Nodes (46): DATA_MIGRATION_IDS, dataMigrations, appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertBaselineBinding(), assertBaselineCli(), assertMutatingTarget(), assertRebuildBaselineRestore() (+38 more)

### Community 26 - "Core schema"
Cohesion: 0.06
Nodes (44): Core, CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.keywords, CategoryMapping.organization (+36 more)

### Community 27 - "AgentOS schema"
Cohesion: 0.05
Nodes (44): AgentRunRequest.agentInstance, AgentRunRequest.agentInstanceId, AgentRunRequest.attempts, AgentRunRequest.claimedAt, AgentRunRequest.claimedBy, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.coalescedIntoRequestId, AgentRunRequest.conversation (+36 more)

### Community 28 - "Community 28"
Cohesion: 0.05
Nodes (43): ACCOUNT_AD_DAILY_DIGEST_KEYS, AD_ROW_KEYS, AD_SUMMARY_KEYS, ADS_DAILY_ROW_KEYS, ADS_KPI_KEYS, assertExactCount(), assertProtectedSupabaseDestination(), assertReadyCounts() (+35 more)

### Community 29 - "Core schema"
Cohesion: 0.05
Nodes (37): AgentApprovalRequest.approverUserId, AgentApprovalRequest.decidedByUserId, AgentApprovalRequest.requestedByUserId, AgentRunRequest.requestedByUserId, OrganizationMembership.createdAt, OrganizationMembership.id, OrganizationMembership.invitedBy, OrganizationMembership.invitedById (+29 more)

### Community 30 - "AgentOS schema"
Cohesion: 0.05
Nodes (42): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+34 more)

### Community 31 - "Sourcing schema"
Cohesion: 0.05
Nodes (42): CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id, CandidateImage.isDeleted (+34 more)

### Community 32 - "AI schema"
Cohesion: 0.05
Nodes (42): ProductPreparation.approvedAt, ProductPreparation.approvedByUser, ProductPreparation.approvedByUserId, ProductPreparation.channelAccount, ProductPreparation.channelAccountId, ProductPreparation.channelListing, ProductPreparation.channelListingId, ProductPreparation.createdAt (+34 more)

### Community 33 - "Advertising schema"
Cohesion: 0.06
Nodes (41): Advertising, ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task (+33 more)

### Community 34 - "Community 34"
Cohesion: 0.08
Nodes (24): Body, CurrentOrganization, Get, Param, Post, Put, Query, ChannelRecipeAutomationContextRepositoryPort (+16 more)

### Community 35 - "System schema"
Cohesion: 0.05
Nodes (34): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon, Marketplace.id (+26 more)

### Community 36 - "Community 36"
Cohesion: 0.06
Nodes (35): ChannelMatchCandidateReason, ChannelMatchCandidateReasonSchema, ChannelMatchEvidence, ChannelMatchEvidenceSchema, ChannelMatchingAccount, ChannelMatchingAccountSchema, ChannelOptionMatchingQueueRow, ChannelOptionMatchingQueueRowSchema (+27 more)

### Community 37 - "Community 37"
Cohesion: 0.07
Nodes (32): CHANNEL_LISTING_SORTS, CHANNEL_LISTING_TABS, ChannelListingDeletionDto, ChannelListingDeletionUnresolvedDto, ChannelListingQueryDto, IsIn, IsOptional, IsString (+24 more)

### Community 38 - "Channels schema"
Cohesion: 0.06
Nodes (39): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignIdentity, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel (+31 more)

### Community 39 - "Inventory schema"
Cohesion: 0.06
Nodes (39): InventoryCommitment.businessKey, InventoryCommitment.createdAt, InventoryCommitment.createdBy, InventoryCommitment.creator, InventoryCommitment.id, InventoryCommitment.inventoryGeneration, InventoryCommitment.kind, InventoryCommitment.organization (+31 more)

### Community 40 - "Community 40"
Cohesion: 0.05
Nodes (37): boundedText(), isoDay, isRocketWorkbookBlockingReason(), requiredText(), ROCKET_SHORTAGE_REASONS, RocketPoCatalogPublication, RocketPoCatalogPublicationSchema, RocketPoCatalogRow (+29 more)

### Community 41 - "prisma field: AdAction.listingOptionId"
Cohesion: 0.06
Nodes (36): AdAction.listingOptionId, ChannelAdTargetDailySnapshot.listingOptionId, ChannelScrapeSnapshot.listingOptionId, OrderLineItem.listingOptionId, OrderReturnLineItem.listingOptionId, DeliveryCompany, DeliveryCompanySchema, Order (+28 more)

### Community 42 - "Orders schema"
Cohesion: 0.06
Nodes (38): OrderLineItem.createdAt, OrderLineItem.externalBarcode, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.metadata, OrderLineItem.optionName, OrderLineItem.order (+30 more)

### Community 43 - "Orders schema"
Cohesion: 0.06
Nodes (38): OrderReturn.channelAccount, OrderReturn.channelAccountId, OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.id (+30 more)

### Community 44 - "AI schema"
Cohesion: 0.06
Nodes (38): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+30 more)

### Community 45 - "Inventory schema"
Cohesion: 0.07
Nodes (33): SellpiaInventorySku.code, SellpiaInventorySku.createdAt, SellpiaInventorySku.currentStock, SellpiaInventorySku.id, SellpiaInventorySku.lastImportRun, SellpiaInventorySku.lastImportRunId, SellpiaInventorySku.name, SellpiaInventorySku.optionName (+25 more)

### Community 46 - "Sourcing schema"
Cohesion: 0.06
Nodes (35): ContentGeneration.sourceCandidateId, SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.id, SourcingCandidate.imageUrl (+27 more)

### Community 47 - "Inventory schema"
Cohesion: 0.07
Nodes (36): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.organization, PickingItem.pickedAt, PickingItem.pickingList (+28 more)

### Community 48 - "Community 48"
Cohesion: 0.08
Nodes (25): aggregateMappingStatus(), assertLockedListing(), assertOperationActor(), ChannelListingRepositoryAdapter, contains(), firstPrice(), isUniqueViolation(), lockDeletionOperation() (+17 more)

### Community 49 - "System schema"
Cohesion: 0.06
Nodes (36): System, ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization (+28 more)

### Community 50 - "prisma field: ActionTask.targetId"
Cohesion: 0.08
Nodes (29): ActionTask.targetId, ActionTask.targetType, AdAction.targetType, AgentArtifact.targetId, Alert.actionTaskId, Alert.targetId, Alert.targetType, PANEL_RUN_SOURCES (+21 more)

### Community 51 - "AI schema"
Cohesion: 0.07
Nodes (36): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height (+28 more)

### Community 52 - "Channels schema"
Cohesion: 0.07
Nodes (36): CoupangWingTrackedProduct.brandName, CoupangWingTrackedProduct.categoryHierarchy, CoupangWingTrackedProduct.createdAt, CoupangWingTrackedProduct.enabled, CoupangWingTrackedProduct.id, CoupangWingTrackedProduct.imagePath, CoupangWingTrackedProduct.itemId, CoupangWingTrackedProduct.lastCapturedAt (+28 more)

### Community 53 - "Community 53"
Cohesion: 0.07
Nodes (29): upsertChannelCatalogIdentities(), applyProductLinksInBatches(), applyVariantLinksInBatches(), buildCatalogProductProvisioningListings(), publishCatalogOperationalProducts(), unique(), validateProvisionedLinks(), assertActiveCoupangAccount() (+21 more)

### Community 54 - "Supply schema"
Cohesion: 0.07
Nodes (35): Supply, RocketPurchaseConfirmationAllocation.confirmationLine, RocketPurchaseConfirmationAllocation.confirmationLineId, RocketPurchaseConfirmationAllocation.createdAt, RocketPurchaseConfirmationAllocation.id, RocketPurchaseConfirmationAllocation.organization, RocketPurchaseConfirmationAllocation.quantity, RocketPurchaseConfirmationAllocation.sellpiaInventorySku (+27 more)

### Community 55 - "AI schema"
Cohesion: 0.07
Nodes (35): ContentWorkspaceThumbnailSelection.contentAsset, ContentWorkspaceThumbnailSelection.contentAssetId, ContentWorkspaceThumbnailSelection.contentWorkspace, ContentWorkspaceThumbnailSelection.contentWorkspaceId, ContentWorkspaceThumbnailSelection.createdAt, ContentWorkspaceThumbnailSelection.createdByUser, ContentWorkspaceThumbnailSelection.createdByUserId, ContentWorkspaceThumbnailSelection.id (+27 more)

### Community 56 - "Sourcing schema"
Cohesion: 0.07
Nodes (35): ProductRegistrationExecution.channelAccount, ProductRegistrationExecution.channelAccountId, ProductRegistrationExecution.channelListing, ProductRegistrationExecution.channelListingId, ProductRegistrationExecution.completedAt, ProductRegistrationExecution.createdAt, ProductRegistrationExecution.executionKind, ProductRegistrationExecution.expectedProviderAccountId (+27 more)

### Community 57 - "AgentOS schema"
Cohesion: 0.06
Nodes (34): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+26 more)

### Community 58 - "Core schema"
Cohesion: 0.08
Nodes (34): ChannelListing.lastImportRunId, Order.sourceImportRunId, SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.createdAt, SourceImportRun.createdBy, SourceImportRun.errorCode (+26 more)

### Community 59 - "Inventory schema"
Cohesion: 0.07
Nodes (34): Shipment.warehouseId, StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.fromWarehouseId, StockTransfer.id, StockTransfer.notes, StockTransfer.optionName (+26 more)

### Community 60 - "Community 60"
Cohesion: 0.12
Nodes (30): buildCoupangWingSnapshotCoverage(), CoupangWingSnapshotCoverage, cellText(), collectParentMetadataConflicts(), decodeWorksheetRange(), expandMergedParentCells(), findHeaderRow(), formattedCellText() (+22 more)

### Community 61 - "Community 61"
Cohesion: 0.10
Nodes (31): automaticReason(), automaticStatus(), BarcodeEvidence, bestSimilarityPerSku(), ChannelRecipeAutomationDecision, ChannelRecipeSuggestionEvidenceKind, ChannelRecipeSuggestionInput, ChannelRecipeSuggestionResponse (+23 more)

### Community 62 - "AI schema"
Cohesion: 0.08
Nodes (32): ContentGeneration.contentWorkspaceId, ContentWorkspace.channelListing, ContentWorkspace.channelListingId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.createdByUserId, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageRevision (+24 more)

### Community 63 - "Core schema"
Cohesion: 0.07
Nodes (29): ChannelRecipeAutomationProductTopology, classifyRecipeAutomationProductGroups(), groupDecision(), autoItem, configuredItem, reviewItem, ChannelListingOption.attributesJson, ChannelListingOption.commissionRate (+21 more)

### Community 64 - "Orders schema"
Cohesion: 0.06
Nodes (28): Review.content, Review.createdAt, Review.id, Review.listing, Review.organization, Review.platform, Review.rating, Review.reviewedAt (+20 more)

### Community 65 - "Community 65"
Cohesion: 0.08
Nodes (14): Inject, ChannelSkuAvailabilityPort, ChannelProductMatchingQuery, ChannelProductMatchingRepositoryPort, Inject, ChannelSkuAvailabilityService, matchesStatus(), toAvailabilityItem() (+6 more)

### Community 66 - "Community 66"
Cohesion: 0.13
Nodes (27): ChannelRecipeAutomationContext, distinct(), evidenceForCode(), evidenceForNames(), normalizePhysicalBarcode(), bigrams(), ChannelRecipeNameEvidence, ChannelRecipeNameIndex (+19 more)

### Community 67 - "Channels schema"
Cohesion: 0.08
Nodes (31): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.channelAccount, ChannelScrapeRun.channelAccountId, ChannelScrapeRun.clientRunKey, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson (+23 more)

### Community 68 - "Channels schema"
Cohesion: 0.07
Nodes (31): RocketPoCatalogLine.businessDateBasis, RocketPoCatalogLine.center, RocketPoCatalogLine.createdAt, RocketPoCatalogLine.hasConfirmation, RocketPoCatalogLine.id, RocketPoCatalogLine.inboundType, RocketPoCatalogLine.orderQty, RocketPoCatalogLine.organization (+23 more)

### Community 69 - "Community 69"
Cohesion: 0.14
Nodes (16): ChannelListingController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+8 more)

### Community 70 - "AI schema"
Cohesion: 0.09
Nodes (27): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt (+19 more)

### Community 71 - "AgentOS schema"
Cohesion: 0.08
Nodes (29): AgentOS, AgentAuthorizationEvent.toolId, AgentInstanceToolPolicy.agentInstance, AgentInstanceToolPolicy.agentInstanceId, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentInstanceToolPolicy.dryRunMode (+21 more)

### Community 72 - "Inventory schema"
Cohesion: 0.09
Nodes (26): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.sourceRef, SellpiaReceiptUploadBatch.sourceType (+18 more)

### Community 73 - "Community 73"
Cohesion: 0.20
Nodes (24): Path, add_code_reference_edges(), add_document_mentions(), add_schema_graph(), camel(), collect_block(), collect_code(), collect_doc_comments() (+16 more)

### Community 74 - "Community 74"
Cohesion: 0.08
Nodes (18): nextPublicationSequence(), productsFromRows(), resolveIdentities(), RocketPoCatalogRepositoryAdapter, toCompletedRun(), Inject, Injectable, zeroChanges() (+10 more)

### Community 75 - "System schema"
Cohesion: 0.08
Nodes (26): Alert.actionTask, Alert.actorUser, Alert.actorUserId, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead (+18 more)

### Community 76 - "Finance schema"
Cohesion: 0.08
Nodes (28): Finance, GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.listing, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization (+20 more)

### Community 77 - "Orders schema"
Cohesion: 0.09
Nodes (28): Orders, Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.id, Shipment.order (+20 more)

### Community 78 - "AgentOS schema"
Cohesion: 0.08
Nodes (28): AgentToolInvocation.agentInstance, AgentToolInvocation.agentInstanceId, AgentToolInvocation.approvalRequest, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt, AgentToolInvocation.errorCode (+20 more)

### Community 79 - "Channels schema"
Cohesion: 0.08
Nodes (28): CoupangWingSalesRankDailySnapshot.businessDate, CoupangWingSalesRankDailySnapshot.capturedAt, CoupangWingSalesRankDailySnapshot.categoryHierarchy, CoupangWingSalesRankDailySnapshot.collectedCount, CoupangWingSalesRankDailySnapshot.conversionRate28d, CoupangWingSalesRankDailySnapshot.createdAt, CoupangWingSalesRankDailySnapshot.id, CoupangWingSalesRankDailySnapshot.itemId (+20 more)

### Community 80 - "Community 80"
Cohesion: 0.09
Nodes (22): adapterPaths, BROWSER_COLLECTION_ATTENTION_REASONS, BROWSER_COLLECTION_PRODUCERS, BROWSER_COLLECTION_STATES, BrowserCollectionAttentionReasonSchema, BrowserCollectionClassificationSchema, BrowserCollectionCommand, BrowserCollectionCommandSchema (+14 more)

### Community 81 - "Community 81"
Cohesion: 0.08
Nodes (22): ChannelAccountListItem, ChannelAccountListItemSchema, CoupangAccountSettings, CoupangAccountSettingsSchema, UpdateCoupangAccountSettings, ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow (+14 more)

### Community 82 - "Community 82"
Cohesion: 0.14
Nodes (27): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+19 more)

### Community 83 - "AgentOS schema"
Cohesion: 0.08
Nodes (27): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.agentInstanceId, AgentApprovalRequest.approver, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy, AgentApprovalRequest.decisionReason (+19 more)

### Community 84 - "Channels schema"
Cohesion: 0.08
Nodes (27): ChannelListingDeletionOperation.authorizationExpiresAt, ChannelListingDeletionOperation.channelAccount, ChannelListingDeletionOperation.channelListing, ChannelListingDeletionOperation.channelListingId, ChannelListingDeletionOperation.completedAt, ChannelListingDeletionOperation.createdAt, ChannelListingDeletionOperation.expectedProviderAccountId, ChannelListingDeletionOperation.externalListingId (+19 more)

### Community 85 - "Inventory schema"
Cohesion: 0.07
Nodes (27): SellpiaInventoryState.activeGeneration, SellpiaInventoryState.activeSyncLeaseExpiresAt, SellpiaInventoryState.activeSyncOwner, SellpiaInventoryState.activeSyncOwnerUserId, SellpiaInventoryState.activeSyncStartedAt, SellpiaInventoryState.activeSyncToken, SellpiaInventoryState.createdAt, SellpiaInventoryState.failedGeneration (+19 more)

### Community 86 - "Community 86"
Cohesion: 0.07
Nodes (25): InventoryAvailabilityBatch, InventoryAvailabilityBatchSchema, InventoryCommitmentActorSchema, InventoryCommitmentAllocationRead, InventoryCommitmentAllocationReadSchema, InventoryCommitmentKind, InventoryCommitmentKindSchema, InventoryCommitmentRead (+17 more)

### Community 87 - "Community 87"
Cohesion: 0.14
Nodes (23): checkTrackedClaudeDirectory(), findClaudeShimFindings(), findInstructionChainSizeFindings(), findStaleInstructionLines(), git(), listRepositoryFiles(), listTracked(), main() (+15 more)

### Community 88 - "Channels schema"
Cohesion: 0.09
Nodes (26): ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isOfferWinner, ChannelListingOptionDailySnapshot.lastObservedAt, ChannelListingOptionDailySnapshot.listing (+18 more)

### Community 89 - "Orders schema"
Cohesion: 0.09
Nodes (23): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+15 more)

### Community 90 - "Community 90"
Cohesion: 0.18
Nodes (26): assertCurrentRebuildBinding(), assertProtectedApiDestination(), assertReplayCounts(), assertReplayFactDigest(), assertSharedRebuildGuard(), assertStoredImportBinding(), bindRebuildImports(), bootstrap() (+18 more)

### Community 91 - "Community 91"
Cohesion: 0.12
Nodes (17): aiProductSuggestion(), aiVariantSuggestion(), asRecord(), availabilityListingWhere(), ChannelProductMatchingRepositoryAdapter, completedCatalogRunWhere(), componentSource(), distinctStrings() (+9 more)

### Community 92 - "Sourcing schema"
Cohesion: 0.10
Nodes (23): Sourcing, SourcingWorkspaceSnapshot.businessDate, SourcingWorkspaceSnapshot.createdAt, SourcingWorkspaceSnapshot.id, SourcingWorkspaceSnapshot.organization, SourcingWorkspaceSnapshot.payload, SourcingWorkspaceSnapshot.scope, SourcingWorkspaceSnapshot.updatedAt (+15 more)

### Community 93 - "AgentOS schema"
Cohesion: 0.08
Nodes (25): AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.agentInstanceId, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy, AgentAuthorizationEvent.decidedByUserId (+17 more)

### Community 94 - "Core schema"
Cohesion: 0.09
Nodes (25): ChannelListing.masterProductId, MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.adTier, MasterProduct.brand, MasterProduct.category, MasterProduct.code, MasterProduct.createdAt (+17 more)

### Community 95 - "Community 95"
Cohesion: 0.08
Nodes (23): ChannelSkuMappingComponent, ChannelSkuMappingComponentSchema, ChannelSkuMappingCounts, ChannelSkuMappingCountsSchema, ChannelSkuMappingListItem, ChannelSkuMappingListItemSchema, ChannelSkuMappingListResponse, ChannelSkuMappingListResponseSchema (+15 more)

### Community 96 - "Community 96"
Cohesion: 0.08
Nodes (22): StatisticsCategoryRow, StatisticsCategoryRowSchema, StatisticsDeliveryDaily, StatisticsDeliveryDailySchema, StatisticsDeliveryResponse, StatisticsDeliveryResponseSchema, StatisticsGradeRow, StatisticsGradeRowSchema (+14 more)

### Community 97 - "Community 97"
Cohesion: 0.13
Nodes (19): DATA_MIGRATION_RELEASES, DataMigration, isLegacyDetailEditorHref(), rewriteLegacyDetailEditorAlertHrefs, rewriteLegacyDetailEditorHref(), migrateRepresentativeKeywordOverrides, sellpiaInventoryFreshnessMigration, isProductContentRouteHrefRewriteNeeded() (+11 more)

### Community 98 - "Community 98"
Cohesion: 0.13
Nodes (16): ChannelAccountRepositoryAdapter, envelopeToJson(), maskAccessKey(), readCredentialsConfig(), stripLegacyCredentialKeys(), toJsonRecord(), toRecord(), trimToOptional() (+8 more)

### Community 99 - "AgentOS schema"
Cohesion: 0.09
Nodes (24): AgentInstance.adapterConfig, AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.icon, AgentInstance.id, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name (+16 more)

### Community 100 - "Channels schema"
Cohesion: 0.09
Nodes (23): ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.id, ChannelScrapeSnapshot.listing, ChannelScrapeSnapshot.listingOption (+15 more)

### Community 101 - "System schema"
Cohesion: 0.10
Nodes (23): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.href (+15 more)

### Community 102 - "Advertising schema"
Cohesion: 0.09
Nodes (23): AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+15 more)

### Community 103 - "Community 103"
Cohesion: 0.22
Nodes (8): ChannelDashboardController, Controller, CurrentOrganization, Get, Query, CoupangDateRangeQueryDto, ChannelDashboardService, Injectable

### Community 104 - "Community 104"
Cohesion: 0.10
Nodes (6): CoupangProviderPort, ChannelSyncRepositoryPort, OrderSyncDeps, ProductSyncDeps, Inject, Optional

### Community 105 - "AgentOS schema"
Cohesion: 0.10
Nodes (22): AgentArtifact.agentInstance, AgentArtifact.agentInstanceId, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization (+14 more)

### Community 106 - "Channels schema"
Cohesion: 0.11
Nodes (22): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.channelAccount, ChannelAccountDailyKpiSnapshot.channelAccountId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+14 more)

### Community 107 - "Channels schema"
Cohesion: 0.11
Nodes (22): CoupangKeywordRankDailySnapshot.adRank, CoupangKeywordRankDailySnapshot.businessDate, CoupangKeywordRankDailySnapshot.capturedAt, CoupangKeywordRankDailySnapshot.createdAt, CoupangKeywordRankDailySnapshot.id, CoupangKeywordRankDailySnapshot.itemId, CoupangKeywordRankDailySnapshot.keyword, CoupangKeywordRankDailySnapshot.organicRank (+14 more)

### Community 108 - "Community 108"
Cohesion: 0.16
Nodes (21): assertPublishableMain(), copyLoadableExtension(), createArchive(), githubReleaseCommand(), gitOutput(), gitSha(), main(), normalizeOrigin() (+13 more)

### Community 109 - "Community 109"
Cohesion: 0.20
Nodes (14): CoupangCredentials, coupangRequest(), CoupangRequestOptions, generateAuthorization(), approveReturn(), confirmOrderSheets(), DELIVERY_COMPANIES, getOrderSheets() (+6 more)

### Community 110 - "Community 110"
Cohesion: 0.10
Nodes (10): CoupangProviderAdapter, Inject, Injectable, CoupangCreateSellerProductResponse, CoupangSellerProductPayload, OrderSheetResponse, SellerProductDetailResponse, SellerProductExternalSkuResponse (+2 more)

### Community 111 - "Community 111"
Cohesion: 0.14
Nodes (10): assertCanonicalCoupangAccountIdentity(), canonicalParentRows(), ChannelCatalogImportRepositoryAdapter, isUniqueConstraintError(), nextPublicationSequence(), Injectable, zeroChanges(), ChannelCatalogImportClaim (+2 more)

### Community 112 - "Community 112"
Cohesion: 0.13
Nodes (21): assembleCompleteSnapshot(), assertSameManifest(), buildCollectionStatus(), countMedia(), countOptions(), derivePhase(), firstDate(), hashCatalogChunkPayload() (+13 more)

### Community 113 - "AgentOS schema"
Cohesion: 0.10
Nodes (21): AgentCostEvent.agentInstance, AgentCostEvent.agentInstanceId, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id (+13 more)

### Community 114 - "AI schema"
Cohesion: 0.11
Nodes (21): AiDirectJob.attempts, AiDirectJob.claimedAt, AiDirectJob.claimedBy, AiDirectJob.createdAt, AiDirectJob.finishedAt, AiDirectJob.id, AiDirectJob.jobType, AiDirectJob.lastErrorCode (+13 more)

### Community 115 - "System schema"
Cohesion: 0.10
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+13 more)

### Community 116 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): LiveCommerceBroadcastDailySnapshot.broadcasterId, LiveCommerceBroadcastDailySnapshot.broadcasterName, LiveCommerceBroadcastDailySnapshot.broadcastId, LiveCommerceBroadcastDailySnapshot.businessDate, LiveCommerceBroadcastDailySnapshot.capturedAt, LiveCommerceBroadcastDailySnapshot.coverImageUrl, LiveCommerceBroadcastDailySnapshot.createdAt, LiveCommerceBroadcastDailySnapshot.endedAt (+13 more)

### Community 117 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): ShortsTrendDailySnapshot.businessDate, ShortsTrendDailySnapshot.capturedAt, ShortsTrendDailySnapshot.channelName, ShortsTrendDailySnapshot.commentCount, ShortsTrendDailySnapshot.createdAt, ShortsTrendDailySnapshot.id, ShortsTrendDailySnapshot.keyword, ShortsTrendDailySnapshot.likeCount (+13 more)

### Community 118 - "AI schema"
Cohesion: 0.10
Nodes (21): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.contentWorkspace, ThumbnailAnalysis.contentWorkspaceId, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id (+13 more)

### Community 119 - "Community 119"
Cohesion: 0.10
Nodes (7): ChannelsDeletionPasswordAdapter, Injectable, ChannelsDeletionPasswordPort, ChannelListingRepositoryPort, Inject, Optional, Inject

### Community 120 - "AgentOS schema"
Cohesion: 0.12
Nodes (20): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.agentInstanceId, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError (+12 more)

### Community 121 - "Finance schema"
Cohesion: 0.12
Nodes (20): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit (+12 more)

### Community 122 - "Channels schema"
Cohesion: 0.12
Nodes (20): SellpiaProductMonthlySales.buyPrice, SellpiaProductMonthlySales.capturedAt, SellpiaProductMonthlySales.createdAt, SellpiaProductMonthlySales.id, SellpiaProductMonthlySales.inAmount, SellpiaProductMonthlySales.inQty, SellpiaProductMonthlySales.optionCode, SellpiaProductMonthlySales.optionName (+12 more)

### Community 123 - "Sourcing schema"
Cohesion: 0.12
Nodes (20): Sourcing1688HotProductDailySnapshot.businessDate, Sourcing1688HotProductDailySnapshot.capturedAt, Sourcing1688HotProductDailySnapshot.createdAt, Sourcing1688HotProductDailySnapshot.id, Sourcing1688HotProductDailySnapshot.imageUrl, Sourcing1688HotProductDailySnapshot.monthlySales, Sourcing1688HotProductDailySnapshot.offerId, Sourcing1688HotProductDailySnapshot.organization (+12 more)

### Community 124 - "Community 124"
Cohesion: 0.21
Nodes (18): analyzePrReleaseContract(), changedFilesFromGit(), classifyFiles(), compareSemver(), deletedFilesFromGit(), ghPrBody(), git(), hasReleaseDecision() (+10 more)

### Community 125 - "Community 125"
Cohesion: 0.14
Nodes (8): SellpiaRecipeEvidenceAdapter, toEvidenceSku(), Inject, Injectable, SellpiaRecipeEvidencePort, SellpiaRecipeEvidenceSku, ChannelRecipeSuggestionContextRepositoryPort, Inject

### Community 126 - "Community 126"
Cohesion: 0.17
Nodes (10): OperationAlertPort, SyncResult, isCoupangCredentialResolutionError(), syncCoupangOrders(), syncCoupangProducts(), ChannelSyncService, errorMessage(), resultMessage() (+2 more)

### Community 127 - "AgentOS schema"
Cohesion: 0.11
Nodes (19): AgentRuntimeState.agentInstance, AgentRuntimeState.agentInstanceId, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.id, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun (+11 more)

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
Cohesion: 0.12
Nodes (12): ChannelAccountController, Body, Controller, CurrentOrganization, Get, CoupangCredentials, ChannelAccountService, Inject (+4 more)

### Community 133 - "Community 133"
Cohesion: 0.11
Nodes (4): ChannelDashboardRepositoryAdapter, Injectable, ChannelDashboardRepositoryPort, Inject

### Community 134 - "AI schema"
Cohesion: 0.12
Nodes (18): ContentGenerationSource.contentAsset, ContentGenerationSource.contentAssetId, ContentGenerationSource.contentGeneration, ContentGenerationSource.contentGenerationId, ContentGenerationSource.createdAt, ContentGenerationSource.id, ContentGenerationSource.label, ContentGenerationSource.metadata (+10 more)

### Community 135 - "Sourcing schema"
Cohesion: 0.14
Nodes (18): LiveCommerceProductDailySnapshot.broadcastId, LiveCommerceProductDailySnapshot.businessDate, LiveCommerceProductDailySnapshot.capturedAt, LiveCommerceProductDailySnapshot.createdAt, LiveCommerceProductDailySnapshot.id, LiveCommerceProductDailySnapshot.imageUrl, LiveCommerceProductDailySnapshot.organization, LiveCommerceProductDailySnapshot.priceCny (+10 more)

### Community 136 - "Sourcing schema"
Cohesion: 0.13
Nodes (18): NaverKeywordDailySnapshot.averageAdRank, NaverKeywordDailySnapshot.businessDate, NaverKeywordDailySnapshot.capturedAt, NaverKeywordDailySnapshot.competitionIndex, NaverKeywordDailySnapshot.createdAt, NaverKeywordDailySnapshot.id, NaverKeywordDailySnapshot.keyword, NaverKeywordDailySnapshot.monthlyMobileSearchCount (+10 more)

### Community 137 - "Channels schema"
Cohesion: 0.14
Nodes (18): RocketPoCatalogSnapshot.channelAccount, RocketPoCatalogSnapshot.channelAccountId, RocketPoCatalogSnapshot.collectionRunId, RocketPoCatalogSnapshot.createdAt, RocketPoCatalogSnapshot.detailPoCount, RocketPoCatalogSnapshot.id, RocketPoCatalogSnapshot.listPagesRead, RocketPoCatalogSnapshot.organization (+10 more)

### Community 138 - "Channels schema"
Cohesion: 0.12
Nodes (18): RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt, RocketPurchaseOrder.firstSkuName, RocketPurchaseOrder.id, RocketPurchaseOrder.items, RocketPurchaseOrder.orderAmount, RocketPurchaseOrder.orderedAt (+10 more)

### Community 139 - "Community 139"
Cohesion: 0.11
Nodes (16): CANCEL_OPERATION_TARGET_TYPES, CancelOperationAffected, CancelOperationAffectedSchema, CancelOperationPreserved, CancelOperationPreservedSchema, CancelOperationResponse, CancelOperationResponseSchema, CancelOperationStatus (+8 more)

### Community 140 - "Community 140"
Cohesion: 0.18
Nodes (8): ChannelCatalogCollectionRepositoryAdapter, isUniqueConstraintError(), ownedRunWhere(), Injectable, ChannelCatalogCollectionChunkRecord, ChannelCatalogCollectionRunRecord, ChannelCatalogCollectionWithChunks, startRun()

### Community 141 - "AgentOS schema"
Cohesion: 0.14
Nodes (17): AgentRunEvent.agentInstance, AgentRunEvent.agentInstanceId, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message (+9 more)

### Community 142 - "AgentOS schema"
Cohesion: 0.12
Nodes (17): WorkflowRun.templateId, WorkflowTemplate.createdAt, WorkflowTemplate.description, WorkflowTemplate.edgesJson, WorkflowTemplate.id, WorkflowTemplate.marketplace, WorkflowTemplate.marketplaceId, WorkflowTemplate.module (+9 more)

### Community 143 - "Community 143"
Cohesion: 0.23
Nodes (5): Inject, ChannelCatalogCollectionPort, ChannelCatalogCollectionService, parseRequest(), Injectable

### Community 144 - "Community 144"
Cohesion: 0.12
Nodes (15): CurrentOrganization, Get, Query, ChannelSkuAvailabilityQueryDto, IsIn, IsInt, IsOptional, IsString (+7 more)

### Community 145 - "Community 145"
Cohesion: 0.15
Nodes (8): ChannelSyncRepositoryAdapter, reconcileProductDetailOption(), Injectable, CoupangSyncOrderPayload, ProductListingSyncResult, syncSingleCoupangOrder(), normalizeCoupangOrderStatus(), normalizeCoupangProductStatus()

### Community 146 - "AgentOS schema"
Cohesion: 0.13
Nodes (16): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.startedAt, WorkflowRun.status (+8 more)

### Community 147 - "Channels schema"
Cohesion: 0.16
Nodes (16): ChannelScrapeChunk.checksum, ChannelScrapeChunk.createdAt, ChannelScrapeChunk.id, ChannelScrapeChunk.itemCount, ChannelScrapeChunk.kind, ChannelScrapeChunk.organization, ChannelScrapeChunk.payload, ChannelScrapeChunk.publicationJson (+8 more)

### Community 148 - "Inventory schema"
Cohesion: 0.15
Nodes (16): SellpiaOrderTransmissionIntent.abortedAt, SellpiaOrderTransmissionIntent.createdAt, SellpiaOrderTransmissionIntent.createdBy, SellpiaOrderTransmissionIntent.creator, SellpiaOrderTransmissionIntent.finalizedAt, SellpiaOrderTransmissionIntent.finalizedGeneration, SellpiaOrderTransmissionIntent.id, SellpiaOrderTransmissionIntent.intentKey (+8 more)

### Community 149 - "Community 149"
Cohesion: 0.23
Nodes (16): assertBootstrapPreflightManifest(), assertPositiveIntegerText(), assertSharedDatabaseIdentity(), assertUuid(), buildBootstrapPreflightManifest(), buildChannelAccountFingerprint(), buildCoupangReplayBundle(), buildCoupangReplayScope() (+8 more)

### Community 150 - "Community 150"
Cohesion: 0.28
Nodes (10): ChannelCatalogCollectionController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+2 more)

### Community 151 - "Orders schema"
Cohesion: 0.14
Nodes (15): CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing (+7 more)

### Community 152 - "Sourcing schema"
Cohesion: 0.17
Nodes (15): NaverPopularKeywordDailySnapshot.boardKey, NaverPopularKeywordDailySnapshot.boardLabel, NaverPopularKeywordDailySnapshot.businessDate, NaverPopularKeywordDailySnapshot.capturedAt, NaverPopularKeywordDailySnapshot.cid, NaverPopularKeywordDailySnapshot.createdAt, NaverPopularKeywordDailySnapshot.id, NaverPopularKeywordDailySnapshot.keyword (+7 more)

### Community 153 - "Finance schema"
Cohesion: 0.14
Nodes (15): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.id, ProcessingCost.master, ProcessingCost.notes, ProcessingCost.organization, ProcessingCost.processType, ProcessingCost.productName (+7 more)

### Community 154 - "Finance schema"
Cohesion: 0.15
Nodes (15): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.organization, SalesPlan.period (+7 more)

### Community 155 - "Channels schema"
Cohesion: 0.16
Nodes (15): SellpiaSalesDailySnapshot.businessDate, SellpiaSalesDailySnapshot.capturedAt, SellpiaSalesDailySnapshot.channelGroup, SellpiaSalesDailySnapshot.costKrw, SellpiaSalesDailySnapshot.createdAt, SellpiaSalesDailySnapshot.id, SellpiaSalesDailySnapshot.organization, SellpiaSalesDailySnapshot.qty (+7 more)

### Community 156 - "Inventory schema"
Cohesion: 0.15
Nodes (15): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items, StockAudit.matchedCount (+7 more)

### Community 157 - "Community 157"
Cohesion: 0.15
Nodes (15): asRecord(), buildAdCampaignDailyRepairPlan(), buildTargetKey(), cleanString(), dateKey(), hasNonCampaignListingSignal(), hasOtherAdvertisingMeta(), maxDate() (+7 more)

### Community 158 - "System schema"
Cohesion: 0.15
Nodes (12): FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name, FeatureGate.updatedAt (+4 more)

### Community 159 - "Community 159"
Cohesion: 0.26
Nodes (14): asRecord(), assertNoPii(), boundedReplayScope(), buildReplayBody(), buildReplayKpis(), cloneReplayValue(), containsPiiValue(), copyString() (+6 more)

### Community 160 - "Community 160"
Cohesion: 0.27
Nodes (12): analyzeSchemaArtifactSync(), changedFilesFromGit(), changedFilesFromWorkingTree(), GENERATED_ARTIFACT_PATHS, git(), main(), matchesAnyPath(), mergeChangedFiles() (+4 more)

### Community 161 - "Community 161"
Cohesion: 0.15
Nodes (7): RocketPoCatalogPort, RocketPoCatalogResolution, canonicalArtifactHash(), isCompleteCollection(), RocketPoCatalogService, Injectable, RocketPurchasePreviewRequestSchema

### Community 162 - "Channels schema"
Cohesion: 0.18
Nodes (13): Channels, CoupangKeywordTracker.createdAt, CoupangKeywordTracker.enabled, CoupangKeywordTracker.id, CoupangKeywordTracker.keyword, CoupangKeywordTracker.lastCapturedAt, CoupangKeywordTracker.maxPages, CoupangKeywordTracker.organization (+5 more)

### Community 163 - "Channels schema"
Cohesion: 0.19
Nodes (13): CoupangKeywordSerpDailySnapshot.businessDate, CoupangKeywordSerpDailySnapshot.capturedAt, CoupangKeywordSerpDailySnapshot.createdAt, CoupangKeywordSerpDailySnapshot.id, CoupangKeywordSerpDailySnapshot.itemCount, CoupangKeywordSerpDailySnapshot.items, CoupangKeywordSerpDailySnapshot.keyword, CoupangKeywordSerpDailySnapshot.organization (+5 more)

### Community 164 - "Core schema"
Cohesion: 0.17
Nodes (13): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+5 more)

### Community 165 - "Channels schema"
Cohesion: 0.18
Nodes (13): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson, RocketSupplyDailySnapshot.revenueKrw (+5 more)

### Community 166 - "Community 166"
Cohesion: 0.29
Nodes (13): assertAllowedRecord(), assertAllowedRows(), assertAllowedScalarRecord(), assertObservedMetrics(), assertOptionalScalar(), assertPlainRecord(), assertReplayBundle(), assertReplayFactCounts() (+5 more)

### Community 167 - "Community 167"
Cohesion: 0.26
Nodes (7): ChannelSyncController, Body, Controller, CurrentOrganization, CurrentUser, Get, Post

### Community 168 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 169 - "Community 169"
Cohesion: 0.26
Nodes (9): DETAIL_IMAGE_COUNTS, DETAIL_PAGE_AGE_GROUPS, DETAIL_PAGE_TEMPLATE_IDS, DetailImageCount, DetailImageCountSchema, DetailPageAgeGroup, DetailPageAgeGroupSchema, DetailPageTemplateId (+1 more)

### Community 170 - "Community 170"
Cohesion: 0.24
Nodes (12): assertIsoTimestamp(), assertPostgresUuid(), assertStagingAccountBaselineManifest(), assertUnique(), buildStagingAccountBaselineManifest(), optionalDate(), readStagingAccountBaseline(), requiredDate() (+4 more)

### Community 171 - "Community 171"
Cohesion: 0.18
Nodes (9): checkSellpiaCutoverPreflight(), createPrisma(), main(), ReadonlyQueryClient, runSellpiaCutoverPreflight(), toIssue(), cleanCounts, FakeQueryClient (+1 more)

### Community 172 - "Inventory schema"
Cohesion: 0.20
Nodes (11): SellpiaOrderTransmissionIntentReconciliation.id, SellpiaOrderTransmissionIntentReconciliation.intent, SellpiaOrderTransmissionIntentReconciliation.intentId, SellpiaOrderTransmissionIntentReconciliation.note, SellpiaOrderTransmissionIntentReconciliation.organization, SellpiaOrderTransmissionIntentReconciliation.outcome, SellpiaOrderTransmissionIntentReconciliation.reconciledAt, SellpiaOrderTransmissionIntentReconciliation.reconciledBy (+3 more)

### Community 173 - "Community 173"
Cohesion: 0.20
Nodes (10): canRetryChannelListingDeletionProviderSideEffect(), canRetryProviderSideEffect(), isOperationTerminal(), OPERATION_STATUSES, OperationStatus, OperationStatusSchema, PROVIDER_OUTCOMES, ProviderOutcome (+2 more)

### Community 174 - "Community 174"
Cohesion: 0.35
Nodes (9): analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), directOutPortFiles(), FORBIDDEN_IN_PORT_FOLDER_NAMES, forbiddenInPortCallerFolders(), listDirectories(), listFiles(), main() (+1 more)

### Community 175 - "Community 175"
Cohesion: 0.33
Nodes (9): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), main(), parseBaseline(), readFiles(), repoRoot(), walk() (+1 more)

### Community 176 - "Community 176"
Cohesion: 0.49
Nodes (6): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), scrubDeep(), scrubSecrets(), walk()

### Community 177 - "Community 177"
Cohesion: 0.31
Nodes (8): appendValues(), parseArgs(), parseRawArgs(), ParseRawArgsOptions, pushValue(), values(), COMMANDS, makeArgs()

### Community 178 - "Community 178"
Cohesion: 0.25
Nodes (6): ChannelAccountListController, Controller, CurrentOrganization, Get, ChannelAccountQueryService, Injectable

### Community 179 - "Community 179"
Cohesion: 0.25
Nodes (5): ChannelsOperationAlertAdapter, Inject, Injectable, OperationLifecyclePatch, StartOperationAlertInput

### Community 180 - "Channels schema"
Cohesion: 0.28
Nodes (9): CoupangRepresentativeKeywordOverride.createdAt, CoupangRepresentativeKeywordOverride.id, CoupangRepresentativeKeywordOverride.keyword, CoupangRepresentativeKeywordOverride.organization, CoupangRepresentativeKeywordOverride.updatedAt, CoupangRepresentativeKeywordOverride.vendorItemId, CoupangRepresentativeKeywordOverride, coupang_representative_keyword_overrides (+1 more)

### Community 181 - "Advertising schema"
Cohesion: 0.25
Nodes (9): ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.id, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.url, ScrapeTarget (+1 more)

### Community 182 - "Community 182"
Cohesion: 0.22
Nodes (7): ReadinessCheck, ReadinessCheckSchema, ReadinessCheckStatusSchema, ReadinessResponse, ReadinessResponseSchema, RebuildReadinessResponse, RebuildReadinessResponseSchema

### Community 183 - "Community 183"
Cohesion: 0.22
Nodes (9): assertLocalRebuildGuard(), assertLocalDevelopmentDatabase(), bootstrapAuthoritativeInventoryDevelopment(), buildBootstrapPlan(), LOCAL_HOSTS, main(), optionalUuid(), parseBootstrapArgs() (+1 more)

### Community 184 - "Community 184"
Cohesion: 0.31
Nodes (9): addExactHeaderEvidence(), asRecord(), CONVERSION_COUNT_HEADERS, normalizeHeader(), parseObservedCount(), recoverObservedCampaignTargetConversions(), resolveRevenueShapedCampaignTargetConversion(), roundedNumber() (+1 more)

### Community 185 - "Community 185"
Cohesion: 0.25
Nodes (3): CoupangSyncReturnPayload, HealthResult, syncSingleCoupangReturn()

### Community 188 - "Community 188"
Cohesion: 0.46
Nodes (6): analyzeInventory(), listTopLevelScriptFiles(), main(), repoRoot(), SCRIPT_INVENTORY, SUPPORT_FILES

### Community 189 - "Community 189"
Cohesion: 0.29
Nodes (6): CurrentOrganization, CurrentUser, Param, Post, UploadedFile, UseInterceptors

### Community 190 - "Community 190"
Cohesion: 0.33
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 191 - "Community 191"
Cohesion: 0.40
Nodes (5): asRecord(), buildCampaignQualifiedProductTargetKeys(), cleanString(), rawCampaignAnchor(), rawProductAnchor()

### Community 192 - "Community 192"
Cohesion: 0.50
Nodes (4): fileHash(), importInput(), makeRow(), representativeRows()

### Community 195 - "Community 195"
Cohesion: 0.50
Nodes (4): is_allowlisted(), is_comment_line(), load_file_lines(), check-tenant-scope.sh script

### Community 196 - "Community 196"
Cohesion: 1.00
Nodes (3): makeRepository(), runRecord(), runWithChunks()

### Community 197 - "Community 197"
Cohesion: 0.67
Nodes (3): accountIdFor(), seedOrderInline(), seedReturnInline()

### Community 198 - "Community 198"
Cohesion: 0.67
Nodes (3): detailOk(), listOk(), mockProductDetail()

### Community 200 - "Community 200"
Cohesion: 0.67
Nodes (3): extractEnvKeys(), readModelFile(), redactEnvValues()

## Knowledge Gaps
- **2649 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+2644 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `AI schema` to `prisma field: externalOptionId canonical option identity`, `Community 1`, `Community 3`, `prisma field: channels — Marketplace Sync + SKU Matching`, `Community 5`, `Community 7`, `AI schema`, `AI schema`, `Supply schema`, `Channels schema`, `Orders schema`, `Supply schema`, `Community 17`, `Core schema`, `Community 19`, `Community 22`, `Supply schema`, `Core schema`, `AgentOS schema`, `Community 28`, `Core schema`, `AgentOS schema`, `Sourcing schema`, `AI schema`, `Advertising schema`, `Channels schema`, `Inventory schema`, `prisma field: AdAction.listingOptionId`, `Orders schema`, `Orders schema`, `AI schema`, `Inventory schema`, `Sourcing schema`, `Inventory schema`, `System schema`, `prisma field: ActionTask.targetId`, `AI schema`, `Channels schema`, `Supply schema`, `AI schema`, `Sourcing schema`, `AgentOS schema`, `Core schema`, `Inventory schema`, `AI schema`, `Core schema`, `Orders schema`, `Channels schema`, `Channels schema`, `AI schema`, `AgentOS schema`, `Inventory schema`, `Community 73`, `System schema`, `Finance schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `Inventory schema`, `Channels schema`, `Orders schema`, `Sourcing schema`, `AgentOS schema`, `Core schema`, `AgentOS schema`, `Channels schema`, `System schema`, `Advertising schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `AgentOS schema`, `AI schema`, `System schema`, `Sourcing schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `Finance schema`, `Channels schema`, `Sourcing schema`, `AgentOS schema`, `Supply schema`, `Inventory schema`, `AI schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `Channels schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Inventory schema`, `Orders schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Channels schema`, `Inventory schema`, `System schema`, `Channels schema`, `Channels schema`, `Core schema`, `Channels schema`, `Community 171`, `Inventory schema`, `Channels schema`, `Advertising schema`?**
  _High betweenness centrality (0.232) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `Supply schema` to `prisma field: externalOptionId canonical option identity`, `AI schema`, `prisma field: channels — Marketplace Sync + SKU Matching`, `AI schema`, `AI schema`, `Channels schema`, `Orders schema`, `Supply schema`, `Core schema`, `Supply schema`, `Core schema`, `AgentOS schema`, `Core schema`, `AgentOS schema`, `Sourcing schema`, `AI schema`, `Advertising schema`, `System schema`, `Channels schema`, `Inventory schema`, `prisma field: AdAction.listingOptionId`, `Orders schema`, `Orders schema`, `AI schema`, `Inventory schema`, `Sourcing schema`, `Inventory schema`, `System schema`, `prisma field: ActionTask.targetId`, `AI schema`, `Channels schema`, `Supply schema`, `AI schema`, `Sourcing schema`, `AgentOS schema`, `Core schema`, `Inventory schema`, `AI schema`, `Core schema`, `Orders schema`, `Channels schema`, `Channels schema`, `AI schema`, `AgentOS schema`, `Inventory schema`, `System schema`, `Finance schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `Inventory schema`, `Channels schema`, `Orders schema`, `Sourcing schema`, `AgentOS schema`, `Core schema`, `AgentOS schema`, `Channels schema`, `System schema`, `Advertising schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `AgentOS schema`, `AI schema`, `System schema`, `Sourcing schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `Finance schema`, `Channels schema`, `Sourcing schema`, `AgentOS schema`, `Supply schema`, `Inventory schema`, `AI schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `Channels schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Inventory schema`, `Orders schema`, `Sourcing schema`, `Finance schema`, `Finance schema`, `Channels schema`, `Inventory schema`, `System schema`, `Channels schema`, `Channels schema`, `Core schema`, `Channels schema`, `System schema`, `Inventory schema`, `Channels schema`, `Advertising schema`?**
  _High betweenness centrality (0.160) - this node is a cross-community bridge._
- **Why does `Order` connect `Orders schema` to `prisma field: externalOptionId canonical option identity`, `Community 1`, `AI schema`, `Community 3`, `prisma field: channels — Marketplace Sync + SKU Matching`, `Community 130`, `Community 6`, `Community 7`, `Community 8`, `Community 11`, `Supply schema`, `Community 145`, `Core schema`, `Community 19`, `Community 20`, `Community 21`, `Orders schema`, `Community 23`, `Community 25`, `Core schema`, `Community 28`, `Core schema`, `Community 160`, `Community 37`, `Community 40`, `prisma field: AdAction.listingOptionId`, `Orders schema`, `Orders schema`, `Community 171`, `Community 174`, `Inventory schema`, `prisma field: ActionTask.targetId`, `Community 185`, `Core schema`, `Community 73`, `Orders schema`, `Community 80`, `Community 81`, `Community 86`, `Orders schema`, `Community 96`, `Community 97`, `Community 108`, `Community 109`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Are the 186 inferred relationships involving `Organization` (e.g. with `channel-registration-capability.adapter.ts` and `channel-account.controller.ts`) actually correct?**
  _`Organization` has 186 INFERRED edges - model-reasoned connections that need verification._
- **Are the 144 inferred relationships involving `ChannelAccount` (e.g. with `channel-registration-capability.adapter.ts` and `channel-account.controller.ts`) actually correct?**
  _`ChannelAccount` has 144 INFERRED edges - model-reasoned connections that need verification._
- **Are the 103 inferred relationships involving `ChannelListing` (e.g. with `channel-registration-capability.adapter.ts` and `channel-listing.controller.ts`) actually correct?**
  _`ChannelListing` has 103 INFERRED edges - model-reasoned connections that need verification._
- **Are the 131 inferred relationships involving `Order` (e.g. with `channel-sync.controller.ts` and `dto/index.ts`) actually correct?**
  _`Order` has 131 INFERRED edges - model-reasoned connections that need verification._