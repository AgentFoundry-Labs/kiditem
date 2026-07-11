# Graph Report - schema-consumers  (2026-07-12)

## Corpus Check
- 292 files · ~124,599 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4343 nodes · 19294 edges · 215 communities (203 shown, 12 thin omitted)
- Extraction: 40% EXTRACTED · 60% INFERRED · 0% AMBIGUOUS · INFERRED: 11600 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Core schema
- Community 1
- prisma field: externalOptionId canonical option identity
- Community 3
- Community 4
- Community 5
- AI schema
- Community 7
- Community 8
- prisma field: vendorItemId provider term
- Channels schema
- Core schema
- Community 12
- Orders schema
- Community 14
- Community 15
- Orders schema
- Community 17
- AgentOS schema
- Community 19
- AI schema
- AgentOS schema
- Supply schema
- Community 23
- AI schema
- Core schema
- AI schema
- AI schema
- Supply schema
- AI schema
- Core schema
- Channels schema
- Sourcing schema
- prisma field: index.ts
- AgentOS schema
- Community 35
- Sourcing schema
- Inventory schema
- Community 38
- Community 39
- Community 40
- Channels schema
- Inventory schema
- Inventory schema
- Community 44
- AgentOS schema
- AgentOS schema
- Core schema
- AI schema
- Community 49
- Community 50
- AgentOS schema
- System schema
- Channels schema
- AI schema
- Community 55
- Community 56
- Channels schema
- Community 58
- AgentOS schema
- AgentOS schema
- Channels schema
- Channels schema
- System schema
- Community 64
- Community 65
- System schema
- Community 67
- Community 68
- Advertising schema
- AgentOS schema
- Core schema
- Core schema
- Orders schema
- Community 74
- AgentOS schema
- System schema
- Channels schema
- Orders schema
- Community 79
- Community 80
- AgentOS schema
- Channels schema
- Core schema
- Finance schema
- AI schema
- AI schema
- Community 87
- Community 88
- Community 89
- Community 90
- AgentOS schema
- Inventory schema
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Core schema
- AI schema
- Channels schema
- Community 102
- Community 103
- Community 104
- Community 105
- prisma field: ActionTask.targetId
- AgentOS schema
- Core schema
- AgentOS schema
- AgentOS schema
- Advertising schema
- Community 112
- Orders schema
- System schema
- Finance schema
- Orders schema
- Channels schema
- Finance schema
- Advertising schema
- Finance schema
- Core schema
- Community 122
- Community 123
- Community 124
- System schema
- Community 126
- Community 127
- Community 128
- System schema
- Core schema
- System schema
- Community 132
- Community 133
- Community 134
- Community 135
- Community 136
- Advertising schema
- System schema
- Advertising schema
- Community 140
- Community 141
- Community 142
- Community 143
- Community 144
- Community 145
- Community 146
- Community 147
- Community 148
- Community 149
- Community 150
- Community 151
- Community 152
- Community 153
- Community 154
- Community 155
- Community 156
- Community 157
- Community 158
- Community 159
- Community 160
- Community 161
- Community 162
- Community 163
- Community 164
- prisma field: ChannelReconciliationItem.channel
- Community 166
- Community 167
- Community 168
- Community 169
- Community 170
- Community 171
- Community 172
- Community 173
- prisma field: ChannelReconciliationItem.id
- Community 175
- Community 176
- Community 200

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 320 edges
2. `Organization` - 311 edges
3. `prisma — Shared Schema` - 131 edges
4. `Order` - 118 edges
5. `ChannelListing` - 112 edges
6. `User` - 109 edges
7. `ContentWorkspace.organizationId` - 105 edges
8. `SourceImportRun.organizationId` - 105 edges
9. `ChannelListingOption.organizationId` - 105 edges
10. `InventorySku.organizationId` - 105 edges
11. `ProductPreparation.organizationId` - 104 edges
12. `ChannelSkuComponent.organizationId` - 104 edges

## Surprising Connections (you probably didn't know these)
- `toEvidenceRow()` --indirect_call--> `value()`  [INFERRED]
  apps/server/src/channels/adapter/out/repository/channel-sku-mapping.repository.adapter.ts → scripts/_shared/cli-args.ts
- `distinctTrimmed()` --indirect_call--> `value()`  [INFERRED]
  apps/server/src/channels/application/service/channel-sku-mapping.service.ts → scripts/_shared/cli-args.ts
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

## Communities (215 total, 12 thin omitted)

### Community 0 - "Core schema"
Cohesion: 0.18
Nodes (173): ConfirmedListingRegistrationInput, ConfirmedListingRegistrationOutput, ConfirmedListingRegistrationOutputSchema, CoupangListingSubmissionInput, CoupangListingSubmissionOutput, CoupangListingSubmissionOutputSchema, NonEmptyRecordSchema, UploadedWorkbookFile (+165 more)

### Community 1 - "Community 1"
Cohesion: 0.02
Nodes (101): AgentApprovalRequestSummary, AgentApprovalRequestSummarySchema, AgentApprovalStatus, AgentApprovalStatusSchema, AgentArtifactHandoffSummary, AgentArtifactHandoffSummarySchema, AgentArtifactStatus, AgentArtifactStatusSchema (+93 more)

### Community 2 - "prisma field: externalOptionId canonical option identity"
Cohesion: 0.15
Nodes (54): CanonicalParent, ClaimInput, LockedRunRow, TRANSACTION_OPTIONS, UpsertInput, AvailabilityPageMetaRow, REPLACEMENT_TRANSACTION_OPTIONS, SelectedMappingRow (+46 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (71): AdapterCommand, appendFlag(), appendOption(), appendProjectReferenceDefaults(), appendValues(), archiveFileName(), archiveShaFileName(), Args (+63 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (59): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot, AdCampaignSnapshotSchema (+51 more)

### Community 5 - "Community 5"
Cohesion: 0.07
Nodes (29): DATA_MIGRATION_IDS, DATA_MIGRATION_RELEASES, dataMigrations, DataMigration, backfillSourcingCandidatesFromMasterProducts, isLegacyDetailEditorHref(), rewriteLegacyDetailEditorAlertHrefs, rewriteLegacyDetailEditorHref() (+21 more)

### Community 6 - "AI schema"
Cohesion: 0.04
Nodes (60): packages/shared — @kiditem/shared, AI, Inventory, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.createdAt, ThumbnailGeneration.deletedAt, ThumbnailGeneration.editAnalysis (+52 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (55): ComplianceScores, ComplianceScoresSchema, COUPANG_IMAGE_SYNC_ROW_SOURCES, CoupangImageSyncCapabilities, CoupangImageSyncCapabilitiesSchema, CoupangImageSyncRow, CoupangImageSyncRowSchema, CoupangImageSyncRowSource (+47 more)

### Community 8 - "Community 8"
Cohesion: 0.04
Nodes (46): ChannelAccountListItem, ChannelAccountListItemSchema, CoupangAccountSettings, CoupangAccountSettingsSchema, UpdateCoupangAccountSettings, ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow (+38 more)

### Community 9 - "prisma field: vendorItemId provider term"
Cohesion: 0.11
Nodes (49): ListingForProductSync, vendorItemId provider term, Database ERD, AgentToolDefinition.isActive, CandidateImage.isDeleted, CategoryMapping.isActive, ChannelAdTargetDailySnapshot.listingOptionId, ChannelListing.isDeleted (+41 more)

### Community 10 - "Channels schema"
Cohesion: 0.04
Nodes (55): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+47 more)

### Community 11 - "Core schema"
Cohesion: 0.06
Nodes (45): channels — Marketplace Sync + SKU Matching, ChannelAdTargetDailySnapshot.optionId, ChannelListingOption.optionId, ChannelListingOptionDailySnapshot.optionId, ChannelScrapeSnapshot.optionId, OrderLineItem.optionId, OrderReturnLineItem.optionId, ProductOption.commissionRate (+37 more)

### Community 12 - "Community 12"
Cohesion: 0.09
Nodes (49): apiHeaders(), apiUrl(), Args, assertSafeDatasetId(), buildCoupangImageSyncRowsForListings(), BundleManifest, BundlePayload, BundleReference (+41 more)

### Community 13 - "Orders schema"
Cohesion: 0.04
Nodes (46): normalizeCoupangOrderStatus(), normalizeCoupangProductStatus(), Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id (+38 more)

### Community 14 - "Community 14"
Cohesion: 0.10
Nodes (48): assertNonProductionTarget(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged(), assertSha256(), BaselineManifest, BaselineManifestExpectation, baselineObjectKeys, buildChecksumsFile() (+40 more)

### Community 15 - "Community 15"
Cohesion: 0.08
Nodes (45): applyCacheControl(), ApplyResult, applyS3CacheControl(), applySupabaseCacheControl(), assertApplyAllowed(), buildCopyObjectInput(), CliArgs, CliConfig (+37 more)

### Community 16 - "Orders schema"
Cohesion: 0.05
Nodes (47): Orders, CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id (+39 more)

### Community 17 - "Community 17"
Cohesion: 0.05
Nodes (43): PRODUCT_LIFECYCLE_STATES, ProductLifecycleState, ProductLifecycleStateSchema, BundleComponent, BundleComponentSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, Master (+35 more)

### Community 18 - "AgentOS schema"
Cohesion: 0.05
Nodes (44): AgentRunRequest.agentInstance, AgentRunRequest.agentInstanceId, AgentRunRequest.attempts, AgentRunRequest.claimedAt, AgentRunRequest.claimedBy, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.coalescedIntoRequestId, AgentRunRequest.conversation (+36 more)

### Community 19 - "Community 19"
Cohesion: 0.07
Nodes (28): ChannelSkuAvailabilityController, Controller, ChannelsProductMasterBarcodeAdapter, Inject, Injectable, ChannelDashboardRepositoryAdapter, Injectable, MarketplaceRegistrationRepositoryAdapter (+20 more)

### Community 20 - "AI schema"
Cohesion: 0.05
Nodes (43): ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.editedHtmlSavedAt, ContentGeneration.errorMessage (+35 more)

### Community 21 - "AgentOS schema"
Cohesion: 0.05
Nodes (42): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+34 more)

### Community 22 - "Supply schema"
Cohesion: 0.05
Nodes (41): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+33 more)

### Community 23 - "Community 23"
Cohesion: 0.05
Nodes (39): AdMetricsDetail, AdMetricsDetailSchema, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary, DashboardAdSummarySchema (+31 more)

### Community 24 - "AI schema"
Cohesion: 0.06
Nodes (40): ContentGeneration.detailPageArtifactId, ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.createdByUserId, DetailPageArtifact.currentRevision, DetailPageArtifact.currentRevisionId (+32 more)

### Community 25 - "Core schema"
Cohesion: 0.06
Nodes (36): AgentApprovalRequest.approverUserId, AgentApprovalRequest.decidedByUserId, AgentApprovalRequest.requestedByUserId, AgentAuthorizationEvent.requestedByUserId, AgentRunRequest.requestedByUserId, OrganizationMembership.createdAt, OrganizationMembership.id, OrganizationMembership.invitedBy (+28 more)

### Community 26 - "AI schema"
Cohesion: 0.06
Nodes (35): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.generationGroup (+27 more)

### Community 27 - "AI schema"
Cohesion: 0.06
Nodes (39): ProductPreparation.selectedThumbnailGenerationCandidateId, ThumbnailGenerationCandidate.createdAt, ThumbnailGenerationCandidate.filename, ThumbnailGenerationCandidate.fileSize, ThumbnailGenerationCandidate.generation, ThumbnailGenerationCandidate.generationId, ThumbnailGenerationCandidate.height, ThumbnailGenerationCandidate.id (+31 more)

### Community 28 - "Supply schema"
Cohesion: 0.06
Nodes (37): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.id, MasterSupplierProduct.isPrimary, MasterSupplierProduct.master, MasterSupplierProduct.memo, MasterSupplierProduct.minOrderQty, MasterSupplierProduct.supplier (+29 more)

### Community 29 - "AI schema"
Cohesion: 0.06
Nodes (38): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+30 more)

### Community 30 - "Core schema"
Cohesion: 0.06
Nodes (37): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.adTier, MasterProduct.brand, MasterProduct.category, MasterProduct.code, MasterProduct.costCny, MasterProduct.createdAt (+29 more)

### Community 31 - "Channels schema"
Cohesion: 0.06
Nodes (35): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel, ChannelAdTargetDailySnapshot.clicks (+27 more)

### Community 32 - "Sourcing schema"
Cohesion: 0.07
Nodes (31): ContentGeneration.sourceCandidateId, SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.id, SourcingCandidate.imageUrl (+23 more)

### Community 33 - "prisma field: index.ts"
Cohesion: 0.10
Nodes (22): PARENT_COLUMN_INDEXES, REQUIRED_HEADERS, workbookBuffer(), WorkbookOptions, baseEvidence, ChannelListingOption.barcode, InventorySku.barcode, MasterProduct.barcode (+14 more)

### Community 34 - "AgentOS schema"
Cohesion: 0.06
Nodes (34): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+26 more)

### Community 35 - "Community 35"
Cohesion: 0.07
Nodes (31): DeliveryCompany, DeliveryCompanySchema, Order, OrderActionResponse, OrderActionResponseSchema, OrderLineItem, OrderLineItemSchema, OrderListItem (+23 more)

### Community 36 - "Sourcing schema"
Cohesion: 0.07
Nodes (32): Sourcing, CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id (+24 more)

### Community 37 - "Inventory schema"
Cohesion: 0.07
Nodes (33): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.fromWarehouseId, StockTransfer.id, StockTransfer.inventorySku, StockTransfer.inventorySkuId, StockTransfer.notes (+25 more)

### Community 38 - "Community 38"
Cohesion: 0.11
Nodes (26): ChannelSkuMappingCounts, capCandidateLimit(), ChannelSkuMappingService, dedupeCandidates(), distinctNormalizedIdentifiers(), distinctTrimmed(), exactCodeEvidence(), Injectable (+18 more)

### Community 39 - "Community 39"
Cohesion: 0.06
Nodes (28): ChannelSkuAvailabilityItem, ChannelSkuAvailabilityListResponse, ChannelSkuAvailabilityListResponseSchema, ChannelSkuAvailabilityQuery, ChannelSkuAvailabilityQuerySchema, ChannelSkuAvailabilityStatus, ChannelSkuAvailabilityStatusSchema, ChannelSkuAvailabilitySummary (+20 more)

### Community 40 - "Community 40"
Cohesion: 0.13
Nodes (31): MigrationResult, appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertMutatingTarget(), CliArgs, Command, COMMANDS, commandStatus() (+23 more)

### Community 41 - "Channels schema"
Cohesion: 0.08
Nodes (30): ChannelSkuComponent.channelSku, ChannelSkuComponent.channelSkuId, ChannelSkuComponent.createdAt, ChannelSkuComponent.createdBy, ChannelSkuComponent.id, ChannelSkuComponent.inventorySku, ChannelSkuComponent.inventorySkuId, ChannelSkuComponent.mappingSource (+22 more)

### Community 42 - "Inventory schema"
Cohesion: 0.08
Nodes (30): PickingItem.createdAt, PickingItem.id, PickingItem.inventorySku, PickingItem.inventorySkuId, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.pickedAt (+22 more)

### Community 43 - "Inventory schema"
Cohesion: 0.08
Nodes (26): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.sourceRef, SellpiaReceiptUploadBatch.sourceType (+18 more)

### Community 44 - "Community 44"
Cohesion: 0.09
Nodes (8): ChannelsInventorySkuReadAdapter, Inject, Injectable, ChannelsInventorySkuReadPort, ChannelSkuMappingRepositoryPort, Inject, Inject, CandidateInventorySku

### Community 45 - "AgentOS schema"
Cohesion: 0.08
Nodes (29): AgentOS, AgentAuthorizationEvent.toolId, AgentInstanceToolPolicy.agentInstance, AgentInstanceToolPolicy.agentInstanceId, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentInstanceToolPolicy.dryRunMode (+21 more)

### Community 46 - "AgentOS schema"
Cohesion: 0.08
Nodes (28): AgentToolInvocation.agentInstance, AgentToolInvocation.agentInstanceId, AgentToolInvocation.approvalRequest, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt, AgentToolInvocation.errorCode (+20 more)

### Community 47 - "Core schema"
Cohesion: 0.08
Nodes (27): ChannelListing.brand, ChannelListing.category, ChannelListing.channel, ChannelListing.channelAccount, ChannelListing.channelAccountId, ChannelListing.channelName, ChannelListing.channelPrice, ChannelListing.createdAt (+19 more)

### Community 48 - "AI schema"
Cohesion: 0.08
Nodes (28): ProductPreparation.appliedToMasterAt, ProductPreparation.contentWorkspace, ProductPreparation.createdAt, ProductPreparation.createdByUser, ProductPreparation.createdByUserId, ProductPreparation.deletedAt, ProductPreparation.displayName, ProductPreparation.id (+20 more)

### Community 49 - "Community 49"
Cohesion: 0.16
Nodes (24): Path, add_code_reference_edges(), add_document_mentions(), add_schema_graph(), camel(), collect_block(), collect_code(), collect_doc_comments() (+16 more)

### Community 50 - "Community 50"
Cohesion: 0.14
Nodes (27): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+19 more)

### Community 51 - "AgentOS schema"
Cohesion: 0.08
Nodes (27): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.agentInstanceId, AgentApprovalRequest.approver, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy, AgentApprovalRequest.decisionReason (+19 more)

### Community 52 - "System schema"
Cohesion: 0.08
Nodes (26): Alert.actionTask, Alert.actorUser, Alert.actorUserId, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead (+18 more)

### Community 53 - "Channels schema"
Cohesion: 0.07
Nodes (27): ChannelReconciliationItem.channelImageUrl, ChannelReconciliationItem.channelOptionName, ChannelReconciliationItem.channelProductName, ChannelReconciliationItem.channelStatus, ChannelReconciliationItem.channelUrl, ChannelReconciliationItem.confidence, ChannelReconciliationItem.conflictJson, ChannelReconciliationItem.createdAt (+19 more)

### Community 54 - "AI schema"
Cohesion: 0.09
Nodes (27): ContentGeneration.contentWorkspaceId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.createdByUserId, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageArtifactId, ContentWorkspace.currentDetailPageRevision, ContentWorkspace.deletedAt (+19 more)

### Community 55 - "Community 55"
Cohesion: 0.14
Nodes (16): asMappingStatus(), availabilityStatusSql(), ChannelSkuMappingRepositoryAdapter, contains(), emptyAvailabilityPageMeta(), mappingRowSelect(), queueWhere(), toEvidenceRow() (+8 more)

### Community 56 - "Community 56"
Cohesion: 0.15
Nodes (25): cellText(), collectParentMetadataConflicts(), decodeWorksheetRange(), expandMergedParentCells(), findHeaderRow(), formattedCellText(), hasCellValue(), headersForRow() (+17 more)

### Community 57 - "Channels schema"
Cohesion: 0.08
Nodes (26): ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isOfferWinner, ChannelListingOptionDailySnapshot.lastObservedAt, ChannelListingOptionDailySnapshot.listing (+18 more)

### Community 58 - "Community 58"
Cohesion: 0.08
Nodes (22): StatisticsCategoryRow, StatisticsCategoryRowSchema, StatisticsDeliveryDaily, StatisticsDeliveryDailySchema, StatisticsDeliveryResponse, StatisticsDeliveryResponseSchema, StatisticsGradeRow, StatisticsGradeRowSchema (+14 more)

### Community 59 - "AgentOS schema"
Cohesion: 0.09
Nodes (24): AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.agentInstanceId, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy, AgentAuthorizationEvent.decidedByUserId (+16 more)

### Community 60 - "AgentOS schema"
Cohesion: 0.09
Nodes (24): AgentInstance.adapterConfig, AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.icon, AgentInstance.id, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name (+16 more)

### Community 61 - "Channels schema"
Cohesion: 0.09
Nodes (23): ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.id, ChannelScrapeSnapshot.listing, ChannelScrapeSnapshot.listingOption (+15 more)

### Community 62 - "Channels schema"
Cohesion: 0.09
Nodes (24): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.id, ChannelScrapeRun.matchedCount (+16 more)

### Community 63 - "System schema"
Cohesion: 0.09
Nodes (22): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon, Marketplace.id (+14 more)

### Community 64 - "Community 64"
Cohesion: 0.20
Nodes (8): ChannelDashboardController, Controller, CurrentOrganization, Get, Query, CoupangDateRangeQueryDto, ChannelDashboardService, Injectable

### Community 65 - "Community 65"
Cohesion: 0.11
Nodes (12): ChannelListingRepositoryAdapter, parseQueryDate(), Injectable, ChannelListingGroupResult, ChannelListingListResult, ChannelListingQuery, ChannelListingRepositoryPort, ChannelListingSummary (+4 more)

### Community 66 - "System schema"
Cohesion: 0.10
Nodes (23): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.href (+15 more)

### Community 67 - "Community 67"
Cohesion: 0.11
Nodes (12): ChannelRegistrationCapabilityAdapter, ConfirmedListingRegistrationInputSchema, CoupangListingSubmissionInputSchema, normalizeForHash(), stableHash(), Injectable, ChannelsMarketplaceRegistrationCapabilityPort, RegisterConfirmedMarketplaceListingCapabilityResult (+4 more)

### Community 68 - "Community 68"
Cohesion: 0.10
Nodes (7): CoupangProviderPort, ChannelSyncRepositoryPort, OrderSyncDeps, syncCoupangOrders(), ProductSyncDeps, Inject, Optional

### Community 69 - "Advertising schema"
Cohesion: 0.10
Nodes (22): AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+14 more)

### Community 70 - "AgentOS schema"
Cohesion: 0.10
Nodes (22): AgentArtifact.agentInstance, AgentArtifact.agentInstanceId, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization (+14 more)

### Community 71 - "Core schema"
Cohesion: 0.12
Nodes (22): ChannelListing.lastImportRunId, ChannelListingOption.lastImportRunId, InventorySku.lastImportRunId, SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.createdAt, SourceImportRun.createdBy (+14 more)

### Community 72 - "Core schema"
Cohesion: 0.10
Nodes (22): ChannelListingOption.channelAccount, ChannelListingOption.channelAccountId, ChannelListingOption.createdAt, ChannelListingOption.id, ChannelListingOption.itemName, ChannelListingOption.lastImportRun, ChannelListingOption.listing, ChannelListingOption.mappingStatus (+14 more)

### Community 73 - "Orders schema"
Cohesion: 0.11
Nodes (22): OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.id, OrderReturn.metadata, OrderReturn.order (+14 more)

### Community 74 - "Community 74"
Cohesion: 0.14
Nodes (9): canonicalParentRows(), ChannelCatalogImportRepositoryAdapter, importResponse(), isUniqueConstraintError(), Injectable, zeroChanges(), ChannelCatalogImportClaim, ChannelCatalogImportRepositoryPort (+1 more)

### Community 75 - "AgentOS schema"
Cohesion: 0.10
Nodes (21): AgentCostEvent.agentInstance, AgentCostEvent.agentInstanceId, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id (+13 more)

### Community 76 - "System schema"
Cohesion: 0.10
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+13 more)

### Community 77 - "Channels schema"
Cohesion: 0.10
Nodes (21): ChannelReconciliationItem.lastSeenRunId, ChannelReconciliationRun.alreadyLinkedCount, ChannelReconciliationRun.autoLinkedCount, ChannelReconciliationRun.channel, ChannelReconciliationRun.conflictCount, ChannelReconciliationRun.createdAt, ChannelReconciliationRun.errorCount, ChannelReconciliationRun.errorJson (+13 more)

### Community 78 - "Orders schema"
Cohesion: 0.10
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 79 - "Community 79"
Cohesion: 0.14
Nodes (14): ChannelSkuMappingController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+6 more)

### Community 80 - "Community 80"
Cohesion: 0.16
Nodes (9): CoupangSyncReturnPayload, HealthResult, SyncResult, syncSingleCoupangReturn(), ChannelSyncService, errorMessage(), resultMessage(), Injectable (+1 more)

### Community 81 - "AgentOS schema"
Cohesion: 0.12
Nodes (20): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.agentInstanceId, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError (+12 more)

### Community 82 - "Channels schema"
Cohesion: 0.13
Nodes (20): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType, ChannelAccountDailyKpiSnapshot.lastObservedAt, ChannelAccountDailyKpiSnapshot.normalizedJson (+12 more)

### Community 83 - "Core schema"
Cohesion: 0.11
Nodes (20): MasterProductImage.createdAt, MasterProductImage.deletedAt, MasterProductImage.fileSize, MasterProductImage.height, MasterProductImage.id, MasterProductImage.isPrimary, MasterProductImage.label, MasterProductImage.master (+12 more)

### Community 84 - "Finance schema"
Cohesion: 0.12
Nodes (20): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit (+12 more)

### Community 85 - "AI schema"
Cohesion: 0.11
Nodes (18): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt (+10 more)

### Community 86 - "AI schema"
Cohesion: 0.11
Nodes (20): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id, ThumbnailAnalysis.imageSpec, ThumbnailAnalysis.imageUrl (+12 more)

### Community 87 - "Community 87"
Cohesion: 0.11
Nodes (17): PANEL_RUN_SOURCES, PanelRunSource, PanelRunSourceSchema, sourceKeys, PANEL_ITEM_KINDS, PanelAlertItem, PanelDismissEventSchema, PanelEvent (+9 more)

### Community 88 - "Community 88"
Cohesion: 0.12
Nodes (9): Inject, ChannelSkuAvailabilityPort, ChannelSkuMappingListQuery, ChannelSkuAvailabilityService, hydrateChannelSkuAvailabilityRows(), Injectable, row(), ChannelSkuStockComponent (+1 more)

### Community 89 - "Community 89"
Cohesion: 0.12
Nodes (15): CHANNEL_LISTING_SORTS, CHANNEL_LISTING_TABS, ChannelListingQueryDto, IsIn, IsOptional, IsString, IsUUID, MaxLength (+7 more)

### Community 90 - "Community 90"
Cohesion: 0.18
Nodes (14): envelopeToJson(), maskAccessKey(), readCredentialsConfig(), stripLegacyCredentialKeys(), toJsonRecord(), toRecord(), trimToOptional(), CoupangCredentialCryptoError (+6 more)

### Community 91 - "AgentOS schema"
Cohesion: 0.11
Nodes (19): AgentRuntimeState.agentInstance, AgentRuntimeState.agentInstanceId, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.id, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun (+11 more)

### Community 92 - "Inventory schema"
Cohesion: 0.12
Nodes (19): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.inventorySku, ReturnTransfer.inventorySkuId, ReturnTransfer.notes (+11 more)

### Community 93 - "Community 93"
Cohesion: 0.12
Nodes (15): CoupangWingCatalogImportResponse, CoupangWingCatalogImportResponseSchema, ImportChanges, SellpiaInventoryImportResponse, SellpiaInventoryImportResponseSchema, SourceImportRun, SourceImportRunSchema, SourceImportStatus (+7 more)

### Community 94 - "Community 94"
Cohesion: 0.22
Nodes (17): analyzePrReleaseContract(), changedFilesFromGit(), classifyFiles(), compareSemver(), ghPrBody(), git(), hasReleaseDecision(), isDevelopToMainPromotion() (+9 more)

### Community 95 - "Community 95"
Cohesion: 0.12
Nodes (12): ChannelAccountController, Body, Controller, CurrentOrganization, Get, CoupangCredentials, ChannelAccountService, Inject (+4 more)

### Community 96 - "Community 96"
Cohesion: 0.11
Nodes (16): CurrentOrganization, Get, Query, AVAILABILITY_STATUSES, ChannelSkuAvailabilityQueryDto, IsIn, IsInt, IsOptional (+8 more)

### Community 97 - "Community 97"
Cohesion: 0.11
Nodes (8): CoupangProviderAdapter, Inject, Injectable, CoupangSellerProductPayload, SellerProductDetailResponse, SellerProductListResponse, CoupangCredentialsPort, SubmitCoupangMarketplaceListingInput

### Community 98 - "Community 98"
Cohesion: 0.18
Nodes (13): CHANNELS_ROOT, REPO_ROOT, analyzeSchemaArtifactSync(), changedFilesFromGit(), changedFilesFromWorkingTree(), GENERATED_ARTIFACT_PATHS, git(), main() (+5 more)

### Community 99 - "Core schema"
Cohesion: 0.14
Nodes (18): Core, BundleComponent.bundleOption, BundleComponent.bundleOptionId, BundleComponent.componentOption, BundleComponent.componentOptionId, BundleComponent.createdAt, BundleComponent.id, BundleComponent.organization (+10 more)

### Community 100 - "AI schema"
Cohesion: 0.12
Nodes (18): ContentAsset.generationGroupId, ContentGeneration.generationGroupId, ContentGenerationGroup.baseContentGeneration, ContentGenerationGroup.baseContentGenerationId, ContentGenerationGroup.createdAt, ContentGenerationGroup.createdByUserId, ContentGenerationGroup.groupType, ContentGenerationGroup.id (+10 more)

### Community 101 - "Channels schema"
Cohesion: 0.12
Nodes (18): RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt, RocketPurchaseOrder.firstSkuName, RocketPurchaseOrder.id, RocketPurchaseOrder.items, RocketPurchaseOrder.orderAmount, RocketPurchaseOrder.orderedAt (+10 more)

### Community 102 - "Community 102"
Cohesion: 0.11
Nodes (16): ALERT_KINDS, ALERT_OPERATION_LIFECYCLE_STATUSES, ALERT_SEVERITIES, ALERT_STATUSES, AlertItem, AlertItemSchema, AlertKind, AlertOperationLifecycleStatus (+8 more)

### Community 103 - "Community 103"
Cohesion: 0.11
Nodes (16): CANCEL_OPERATION_TARGET_TYPES, CancelOperationAffected, CancelOperationAffectedSchema, CancelOperationPreserved, CancelOperationPreservedSchema, CancelOperationResponse, CancelOperationResponseSchema, CancelOperationStatus (+8 more)

### Community 104 - "Community 104"
Cohesion: 0.25
Nodes (12): CoupangCredentials, coupangRequest(), CoupangRequestOptions, generateAuthorization(), approveReturn(), confirmOrderSheets(), DELIVERY_COMPANIES, getOrderSheets() (+4 more)

### Community 105 - "Community 105"
Cohesion: 0.12
Nodes (5): ChannelAccountRepositoryAdapter, Injectable, ChannelAccountRepositoryPort, Inject, KEY

### Community 106 - "prisma field: ActionTask.targetId"
Cohesion: 0.24
Nodes (11): ActionTask.targetId, ActionTask.targetType, AdAction.targetType, AgentArtifact.targetId, Alert.actionTaskId, Alert.targetId, Alert.targetType, ChannelAdTargetDailySnapshot.targetType (+3 more)

### Community 107 - "AgentOS schema"
Cohesion: 0.14
Nodes (17): AgentRunEvent.agentInstance, AgentRunEvent.agentInstanceId, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message (+9 more)

### Community 108 - "Core schema"
Cohesion: 0.14
Nodes (15): ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id, ChannelAccount.isPrimary, ChannelAccount.name, ChannelAccount.organization (+7 more)

### Community 109 - "AgentOS schema"
Cohesion: 0.12
Nodes (17): WorkflowRun.templateId, WorkflowTemplate.createdAt, WorkflowTemplate.description, WorkflowTemplate.edgesJson, WorkflowTemplate.id, WorkflowTemplate.marketplace, WorkflowTemplate.marketplaceId, WorkflowTemplate.module (+9 more)

### Community 110 - "AgentOS schema"
Cohesion: 0.13
Nodes (16): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.startedAt, WorkflowRun.status (+8 more)

### Community 111 - "Advertising schema"
Cohesion: 0.13
Nodes (16): ExecutionTask.action, ExecutionTask.actionId, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt, ExecutionTask.errorMessage, ExecutionTask.finishedAt (+8 more)

### Community 112 - "Community 112"
Cohesion: 0.24
Nodes (14): analyzeReconstructionTriggers(), changedFilesFromGit(), ghPrBody(), git(), isCrossLayerControlChange(), isHighRiskBoundary(), isLargeServiceOrComponent(), layerOf() (+6 more)

### Community 113 - "Orders schema"
Cohesion: 0.14
Nodes (12): MAPPING_STATUSES, Review.content, Review.createdAt, Review.id, Review.listing, Review.organization, Review.platform, Review.rating (+4 more)

### Community 114 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 115 - "Finance schema"
Cohesion: 0.15
Nodes (15): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.organization, SalesPlan.period (+7 more)

### Community 116 - "Orders schema"
Cohesion: 0.14
Nodes (15): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.id, UnshippedItem.isNotified, UnshippedItem.listing, UnshippedItem.notifiedAt, UnshippedItem.option, UnshippedItem.order (+7 more)

### Community 117 - "Channels schema"
Cohesion: 0.16
Nodes (14): Channels, RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson (+6 more)

### Community 118 - "Finance schema"
Cohesion: 0.15
Nodes (14): Finance, GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.marginScore, GradeHistory.master, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization (+6 more)

### Community 119 - "Advertising schema"
Cohesion: 0.15
Nodes (14): ExecutionTask.workerId, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentTaskRef, ExecutionWorker.currentUrl, ExecutionWorker.id, ExecutionWorker.label, ExecutionWorker.lastHeartbeatAt (+6 more)

### Community 120 - "Finance schema"
Cohesion: 0.15
Nodes (14): ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description, ManualLedger.id (+6 more)

### Community 121 - "Core schema"
Cohesion: 0.17
Nodes (13): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+5 more)

### Community 122 - "Community 122"
Cohesion: 0.26
Nodes (8): ChannelListingController, Body, Controller, CurrentOrganization, Get, Param, Post, Query

### Community 123 - "Community 123"
Cohesion: 0.26
Nodes (7): ChannelSyncController, Body, Controller, CurrentOrganization, CurrentUser, Get, Post

### Community 124 - "Community 124"
Cohesion: 0.20
Nodes (5): ChannelSyncRepositoryAdapter, Injectable, CoupangSyncOrderPayload, ProductListingSyncResult, syncSingleCoupangOrder()

### Community 125 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 126 - "Community 126"
Cohesion: 0.26
Nodes (9): DETAIL_IMAGE_COUNTS, DETAIL_PAGE_AGE_GROUPS, DETAIL_PAGE_TEMPLATE_IDS, DetailImageCount, DetailImageCountSchema, DetailPageAgeGroup, DetailPageAgeGroupSchema, DetailPageTemplateId (+1 more)

### Community 127 - "Community 127"
Cohesion: 0.18
Nodes (9): ChannelCatalogImportController, Controller, CurrentOrganization, CurrentUser, Inject, Param, Post, UploadedFile (+1 more)

### Community 128 - "Community 128"
Cohesion: 0.22
Nodes (11): ChannelSkuCandidateQueryDto, ChannelSkuMappingQueryDto, IsIn, IsInt, IsOptional, IsPositive, IsString, IsUUID (+3 more)

### Community 129 - "System schema"
Cohesion: 0.20
Nodes (11): ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization, ActivityEvent.source (+3 more)

### Community 130 - "Core schema"
Cohesion: 0.22
Nodes (11): CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.keywords, CategoryMapping.organization, CategoryMapping.updatedAt (+3 more)

### Community 131 - "System schema"
Cohesion: 0.20
Nodes (10): FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name, FeatureGate.updatedAt (+2 more)

### Community 132 - "Community 132"
Cohesion: 0.18
Nodes (9): ActionTask, ActionTaskExecuteResponse, ActionTaskList, ActionTaskListSchema, ActionTaskRelatedProduct, ActionTaskRelatedProductSchema, ActionTaskSchema, ActionTaskSourceAlert (+1 more)

### Community 133 - "Community 133"
Cohesion: 0.35
Nodes (9): analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), directOutPortFiles(), FORBIDDEN_IN_PORT_FOLDER_NAMES, forbiddenInPortCallerFolders(), listDirectories(), listFiles(), main() (+1 more)

### Community 134 - "Community 134"
Cohesion: 0.31
Nodes (9): addUnique(), defaultOutputDir, defaultSourceDir, normalizeKiditemOrigin(), patchExtensionRuntimeFiles(), patchManifest(), prepareCoupangExtension(), repoRoot (+1 more)

### Community 135 - "Community 135"
Cohesion: 0.20
Nodes (8): filesDefiningModel(), inventoryImporter, matchingFiles(), persistentCutoverGate, prismaFiles, repoRoot, serverFiles, sharedFiles

### Community 136 - "Community 136"
Cohesion: 0.29
Nodes (7): assertToolInvocationDidNotFail(), ChannelRegistrationRuntimeHandler, coupangSubmissionInput(), optionalStringField(), registrationInput(), stringField(), Injectable

### Community 137 - "Advertising schema"
Cohesion: 0.22
Nodes (10): Advertising, ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.id, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.url (+2 more)

### Community 138 - "System schema"
Cohesion: 0.24
Nodes (10): System, SystemSetting.createdAt, SystemSetting.id, SystemSetting.key, SystemSetting.organization, SystemSetting.updatedAt, SystemSetting.value, SystemSetting (+2 more)

### Community 139 - "Advertising schema"
Cohesion: 0.22
Nodes (10): ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task, ExecutionLog.taskId (+2 more)

### Community 140 - "Community 140"
Cohesion: 0.20
Nodes (8): ReviewFilter, ReviewFilterSchema, ReviewListItem, ReviewListItemSchema, ReviewListResponse, ReviewListResponseSchema, ReviewSummary, ReviewSummarySchema

### Community 141 - "Community 141"
Cohesion: 0.49
Nodes (6): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), scrubDeep(), scrubSecrets(), walk()

### Community 142 - "Community 142"
Cohesion: 0.38
Nodes (8): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), main(), parseBaseline(), readFiles(), repoRoot(), walk()

### Community 143 - "Community 143"
Cohesion: 0.31
Nodes (8): parseArgs(), ParsedArgs, parseRawArgs(), ParseRawArgsOptions, pushValue(), values(), COMMANDS, makeArgs()

### Community 144 - "Community 144"
Cohesion: 0.25
Nodes (6): ChannelAccountListController, Controller, CurrentOrganization, Get, ChannelAccountQueryService, Injectable

### Community 145 - "Community 145"
Cohesion: 0.25
Nodes (5): ChannelsOperationAlertAdapter, Inject, Injectable, OperationLifecyclePatch, StartOperationAlertInput

### Community 147 - "Community 147"
Cohesion: 0.47
Nodes (7): checkClaudeShims(), checkTrackedClaudeDirectory(), findStaleInstructionLines(), git(), listTracked(), main(), runChecks()

### Community 148 - "Community 148"
Cohesion: 0.25
Nodes (8): MarketplaceRegistrationDto, IsInt, IsOptional, IsString, IsUUID, MaxLength, Type, Min

### Community 149 - "Community 149"
Cohesion: 0.25
Nodes (6): WorkflowRun, WorkflowRunSchema, WorkflowStepRun, WorkflowStepRunSchema, WorkflowTemplate, WorkflowTemplateSchema

### Community 150 - "Community 150"
Cohesion: 0.25
Nodes (8): assertLocalDevelopmentDatabase(), bootstrapAuthoritativeInventoryDevelopment(), buildBootstrapPlan(), LOCAL_HOSTS, main(), optionalUuid(), parseBootstrapArgs(), slugify()

### Community 151 - "Community 151"
Cohesion: 0.39
Nodes (5): assertSafeChannelSkuDbPushWarnings(), main(), normalizeWarning(), UNIQUE_WARNING_SIGNATURES, warningSignatures

### Community 152 - "Community 152"
Cohesion: 0.46
Nodes (6): analyzeInventory(), listTopLevelScriptFiles(), main(), repoRoot(), SCRIPT_INVENTORY, SUPPORT_FILES

### Community 153 - "Community 153"
Cohesion: 0.33
Nodes (6): extractNestedSellerProductId(), firstSalePrice(), numberField(), sellerProductIdFromResponse(), sellerProductName(), stringField()

### Community 154 - "Community 154"
Cohesion: 0.29
Nodes (5): AuthRequiredErrorBody, AuthUserPublic, AuthUserPublicSchema, LoginRequest, LoginRequestSchema

### Community 155 - "Community 155"
Cohesion: 0.29
Nodes (5): ReadinessCheck, ReadinessCheckSchema, ReadinessCheckStatusSchema, ReadinessResponse, ReadinessResponseSchema

### Community 156 - "Community 156"
Cohesion: 0.29
Nodes (5): deletedLegacyTables, repoRoot, retiredBaselineScript, retiredImporterFile, retiredPlannerFile

### Community 157 - "Community 157"
Cohesion: 0.33
Nodes (3): ChannelsProductMasterBarcodePort, Inject, Optional

### Community 158 - "Community 158"
Cohesion: 0.33
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 159 - "Community 159"
Cohesion: 0.33
Nodes (4): SettlementReconcileDetail, SettlementReconcileDetailSchema, SettlementReconcileResponse, SettlementReconcileResponseSchema

### Community 160 - "Community 160"
Cohesion: 0.33
Nodes (6): bounded(), checkChannelSkuIdentity(), createPrisma(), main(), ReadonlyQueryClient, runChannelSkuIdentityPreflight()

### Community 161 - "Community 161"
Cohesion: 0.40
Nodes (4): isoDate, RangeSchema, SalesAnalysisDataSources, SalesAnalysisDataSourcesSchema

### Community 162 - "Community 162"
Cohesion: 0.50
Nodes (3): RegisterConfirmedMarketplaceListingCapabilityInput, RegisterConfirmedListingInput, RegisterConfirmedMarketplaceListingInput

### Community 164 - "Community 164"
Cohesion: 0.50
Nodes (4): fileHash(), importInput(), makeRow(), representativeRows()

### Community 165 - "prisma field: ChannelReconciliationItem.channel"
Cohesion: 0.50
Nodes (4): ChannelReconciliationItem.channel, ChannelReconciliationItem.itemKey, ChannelReconciliationItem.source, ChannelReconciliationItem unique(organizationId, channel, source, itemKey)

### Community 171 - "Community 171"
Cohesion: 0.50
Nodes (4): is_allowlisted(), is_comment_line(), load_file_lines(), check-tenant-scope.sh script

### Community 173 - "Community 173"
Cohesion: 0.67
Nodes (3): extractEnvKeys(), readModelFile(), redactEnvValues()

## Knowledge Gaps
- **1861 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+1856 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Core schema` to `Community 1`, `prisma field: externalOptionId canonical option identity`, `Community 3`, `Community 5`, `AI schema`, `Community 7`, `prisma field: vendorItemId provider term`, `Channels schema`, `Core schema`, `Community 12`, `Orders schema`, `Community 14`, `Orders schema`, `Community 17`, `AgentOS schema`, `AI schema`, `AgentOS schema`, `Supply schema`, `AI schema`, `Core schema`, `AI schema`, `AI schema`, `Supply schema`, `AI schema`, `Core schema`, `Channels schema`, `Sourcing schema`, `AgentOS schema`, `Community 35`, `Sourcing schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `AI schema`, `AgentOS schema`, `System schema`, `Channels schema`, `AI schema`, `Channels schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `System schema`, `Advertising schema`, `AgentOS schema`, `Core schema`, `Core schema`, `Orders schema`, `AgentOS schema`, `System schema`, `Channels schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `Core schema`, `Finance schema`, `AI schema`, `AI schema`, `AgentOS schema`, `Inventory schema`, `Core schema`, `AI schema`, `Channels schema`, `prisma field: ActionTask.targetId`, `AgentOS schema`, `Core schema`, `AgentOS schema`, `Orders schema`, `Finance schema`, `Orders schema`, `Channels schema`, `Finance schema`, `Advertising schema`, `Finance schema`, `Core schema`, `System schema`, `Core schema`, `System schema`, `Advertising schema`, `System schema`, `Community 151`?**
  _High betweenness centrality (0.235) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `prisma field: vendorItemId provider term` to `Core schema`, `prisma field: externalOptionId canonical option identity`, `AI schema`, `Channels schema`, `Core schema`, `Orders schema`, `Orders schema`, `AgentOS schema`, `AI schema`, `AgentOS schema`, `Supply schema`, `AI schema`, `Core schema`, `AI schema`, `AI schema`, `Supply schema`, `AI schema`, `Core schema`, `Channels schema`, `Sourcing schema`, `prisma field: index.ts`, `AgentOS schema`, `Sourcing schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `AI schema`, `AgentOS schema`, `System schema`, `Channels schema`, `AI schema`, `Channels schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `System schema`, `System schema`, `Advertising schema`, `AgentOS schema`, `Core schema`, `Core schema`, `Orders schema`, `AgentOS schema`, `System schema`, `Channels schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `Core schema`, `Finance schema`, `AI schema`, `AI schema`, `AgentOS schema`, `Inventory schema`, `Core schema`, `AI schema`, `Channels schema`, `prisma field: ActionTask.targetId`, `AgentOS schema`, `Core schema`, `AgentOS schema`, `AgentOS schema`, `Advertising schema`, `Orders schema`, `System schema`, `Finance schema`, `Orders schema`, `Channels schema`, `Finance schema`, `Advertising schema`, `Finance schema`, `Core schema`, `System schema`, `System schema`, `Core schema`, `System schema`, `Advertising schema`, `System schema`, `Advertising schema`?**
  _High betweenness centrality (0.225) - this node is a cross-community bridge._
- **Why does `MasterProduct` connect `Core schema` to `Core schema`, `prisma field: externalOptionId canonical option identity`, `Community 4`, `Community 5`, `AI schema`, `prisma field: vendorItemId provider term`, `Core schema`, `Community 17`, `AI schema`, `AI schema`, `Supply schema`, `Sourcing schema`, `prisma field: index.ts`, `Sourcing schema`, `Core schema`, `AI schema`, `AI schema`, `Core schema`, `AI schema`, `Core schema`, `AI schema`, `Finance schema`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Are the 122 inferred relationships involving `Organization` (e.g. with `channel-registration-capability.adapter.ts` and `channel-registration-capability.adapter.spec.ts`) actually correct?**
  _`Organization` has 122 INFERRED edges - model-reasoned connections that need verification._
- **Are the 71 inferred relationships involving `Order` (e.g. with `channel-sync.controller.ts` and `index.ts`) actually correct?**
  _`Order` has 71 INFERRED edges - model-reasoned connections that need verification._
- **Are the 43 inferred relationships involving `ChannelListing` (e.g. with `channel-registration-capability.adapter.ts` and `channel-registration-capability.adapter.spec.ts`) actually correct?**
  _`ChannelListing` has 43 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason` to the rest of the system?**
  _1862 weakly-connected nodes found - possible documentation gaps or missing edges._