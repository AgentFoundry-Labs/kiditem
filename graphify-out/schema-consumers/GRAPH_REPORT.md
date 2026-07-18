# Graph Report - schema-consumers  (2026-07-18)

## Corpus Check
- 376 files · ~182,150 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5693 nodes · 30561 edges · 253 communities (233 shown, 20 thin omitted)
- Extraction: 33% EXTRACTED · 67% INFERRED · 0% AMBIGUOUS · INFERRED: 20584 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- prisma field: externalOptionId canonical option identity
- Community 1
- AgentOS schema
- Community 3
- System schema
- Community 5
- Community 6
- Advertising schema
- Core schema
- Community 9
- Community 10
- Community 11
- AI schema
- AgentOS schema
- AI schema
- Community 15
- code file: channels — Marketplace Sync + SKU Matching
- Supply schema
- Channels schema
- AgentOS schema
- Community 20
- AI schema
- Community 22
- Community 23
- Channels schema
- Community 25
- prisma field: AdAction.externalId
- AI schema
- Finance schema
- AgentOS schema
- System schema
- Community 31
- Sourcing schema
- prisma field: CSRecord.orderId
- Community 34
- Core schema
- Inventory schema
- Community 37
- Sourcing schema
- Orders schema
- Orders schema
- Community 41
- AI schema
- Community 43
- Orders schema
- Orders schema
- AI schema
- Channels schema
- Community 48
- System schema
- AI schema
- Community 51
- Core schema
- Inventory schema
- AI schema
- Community 55
- Community 56
- Community 57
- AgentOS schema
- AI schema
- Inventory schema
- Channels schema
- Finance schema
- Inventory schema
- Community 64
- AgentOS schema
- Community 66
- Orders schema
- Core schema
- Channels schema
- Inventory schema
- Inventory schema
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Inventory schema
- Community 78
- Community 79
- Core schema
- Channels schema
- Supply schema
- Community 83
- Community 84
- Channels schema
- Core schema
- Community 87
- Community 88
- Community 89
- Core schema
- Core schema
- Community 92
- Community 93
- AgentOS schema
- Channels schema
- Channels schema
- Community 97
- Community 98
- System schema
- Sourcing schema
- Sourcing schema
- AI schema
- AI schema
- Community 104
- Community 105
- Finance schema
- Supply schema
- Channels schema
- Sourcing schema
- AgentOS schema
- Channels schema
- Supply schema
- Inventory schema
- Community 114
- Community 115
- Community 116
- Community 117
- Community 118
- Community 119
- Community 120
- Community 121
- Sourcing schema
- Sourcing schema
- Channels schema
- Community 125
- Community 126
- Community 127
- Community 128
- AgentOS schema
- Channels schema
- Community 131
- Community 132
- Community 133
- Channels schema
- Supply schema
- Supply schema
- Community 137
- Community 138
- System schema
- Sourcing schema
- Channels schema
- Inventory schema
- Community 143
- Community 144
- Community 145
- Community 146
- Channels schema
- Channels schema
- Core schema
- Channels schema
- Community 151
- Community 152
- Community 153
- Community 154
- Community 155
- Core schema
- Sourcing schema
- Community 158
- Community 159
- Community 160
- Community 161
- Community 162
- Community 163
- Community 164
- Advertising schema
- Sourcing schema
- Community 167
- Community 168
- Community 169
- Community 170
- Channels schema
- Community 172
- Community 173
- Community 174
- Community 175
- Community 176
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

## God Nodes (most connected - your core abstractions)
1. `Organization` - 411 edges
2. `Database ERD` - 356 edges
3. `ChannelAccount` - 177 edges
4. `ChannelListing` - 170 edges
5. `Order` - 168 edges
6. `prisma — Shared Schema` - 161 edges
7. `ContentWorkspace.organizationId` - 155 edges
8. `ProductPreparation.organizationId` - 155 edges
9. `ChannelListing.organizationId` - 151 edges
10. `SourceImportRun.organizationId` - 150 edges
11. `ContentWorkspaceThumbnailSelection.organizationId` - 149 edges
12. `ChannelAdTargetDailySnapshot.organizationId` - 149 edges

## Surprising Connections (you probably didn't know these)
- `distinctStrings()` --indirect_call--> `value()`  [INFERRED]
  apps/server/src/channels/adapter/out/repository/channel-product-matching.repository.adapter.ts → scripts/_shared/cli-args.ts
- `rankChannelProductCandidates()` --indirect_call--> `value()`  [INFERRED]
  apps/server/src/channels/domain/channel-product-candidate-ranking.ts → scripts/_shared/cli-args.ts
- `productSearchText()` --indirect_call--> `value()`  [INFERRED]
  apps/server/src/channels/domain/channel-product-candidate-ranking.ts → scripts/_shared/cli-args.ts
- `rankChannelVariantCandidates()` --indirect_call--> `value()`  [INFERRED]
  apps/server/src/channels/domain/channel-variant-candidate-ranking.ts → scripts/_shared/cli-args.ts
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

## Communities (253 total, 20 thin omitted)

### Community 0 - "prisma field: externalOptionId canonical option identity"
Cohesion: 0.16
Nodes (242): UploadedWorkbookFile, HEADERS, USER, chunkSelect, ErrorInput, LockedRun, OwnedRunInput, PutChunkInput (+234 more)

### Community 1 - "Community 1"
Cohesion: 0.02
Nodes (101): AgentApprovalRequestSummary, AgentApprovalRequestSummarySchema, AgentApprovalStatus, AgentApprovalStatusSchema, AgentArtifactHandoffSummary, AgentArtifactHandoffSummarySchema, AgentArtifactStatus, AgentArtifactStatusSchema (+93 more)

### Community 2 - "AgentOS schema"
Cohesion: 0.03
Nodes (78): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+70 more)

### Community 3 - "Community 3"
Cohesion: 0.03
Nodes (74): AdMetricsDetail, AdMetricsDetailSchema, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary, DashboardAdSummarySchema (+66 more)

### Community 4 - "System schema"
Cohesion: 0.05
Nodes (61): Database ERD, ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.date, ActionTask.detail (+53 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (67): AdapterCommand, appendFlag(), appendOption(), appendProjectReferenceDefaults(), archiveFileName(), archiveShaFileName(), Args, BundleManifest (+59 more)

### Community 6 - "Community 6"
Cohesion: 0.03
Nodes (63): CreateMasterProductInput, CreateMasterProductInputSchema, CreateProductVariantFieldsSchema, CreateProductVariantInput, CreateProductVariantInputSchema, MasterProductDisplayReference, MasterProductDisplayReferenceSchema, MasterProductMutationFieldsSchema (+55 more)

### Community 7 - "Advertising schema"
Cohesion: 0.04
Nodes (65): Advertising, AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson (+57 more)

### Community 8 - "Core schema"
Cohesion: 0.04
Nodes (61): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.agentInstanceId, AgentApprovalRequest.approver, AgentApprovalRequest.approverUserId, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy (+53 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (61): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot, AdCampaignSnapshotSchema (+53 more)

### Community 10 - "Community 10"
Cohesion: 0.06
Nodes (57): ActionTask, ActionTaskExecuteResponse, ActionTaskList, ActionTaskListSchema, ActionTaskRelatedProduct, ActionTaskRelatedProductSchema, ActionTaskSchema, ActionTaskSourceAlert (+49 more)

### Community 11 - "Community 11"
Cohesion: 0.07
Nodes (52): DATA_MIGRATION_IDS, DATA_MIGRATION_RELEASES, dataMigrations, DataMigration, DataMigrationContext, DataMigrationTarget, MigrationResult, isLegacyDetailEditorHref() (+44 more)

### Community 12 - "AI schema"
Cohesion: 0.04
Nodes (62): packages/shared — @kiditem/shared, AI, Inventory, ProductPreparation.selectedThumbnailGenerationId, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.contentWorkspaceId, ThumbnailGeneration.createdAt (+54 more)

### Community 13 - "AgentOS schema"
Cohesion: 0.04
Nodes (62): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+54 more)

### Community 14 - "AI schema"
Cohesion: 0.04
Nodes (56): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height (+48 more)

### Community 15 - "Community 15"
Cohesion: 0.05
Nodes (44): ChannelRegistrationCapabilityAdapter, Injectable, ChannelCatalogImportController, Controller, Inject, ChannelSkuAvailabilityController, Controller, ChannelRecipeAutomationContextRepositoryAdapter (+36 more)

### Community 16 - "code file: channels — Marketplace Sync + SKU Matching"
Cohesion: 0.09
Nodes (29): PARENT_COLUMN_INDEXES, REQUIRED_HEADERS, workbookBuffer(), WorkbookOptions, ChannelProductCandidate, ChannelProductCandidateRankingInput, emptyEvidence(), keep() (+21 more)

### Community 17 - "Supply schema"
Cohesion: 0.04
Nodes (56): Supply, RocketPurchaseConfirmation.channelAccount, RocketPurchaseConfirmation.channelAccountId, RocketPurchaseConfirmation.confirmedAt, RocketPurchaseConfirmation.confirmedBy, RocketPurchaseConfirmation.confirmer, RocketPurchaseConfirmation.createdAt, RocketPurchaseConfirmation.freshnessGeneration (+48 more)

### Community 18 - "Channels schema"
Cohesion: 0.04
Nodes (55): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+47 more)

### Community 19 - "AgentOS schema"
Cohesion: 0.04
Nodes (54): AgentOS, AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.agentInstanceId, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy (+46 more)

### Community 20 - "Community 20"
Cohesion: 0.04
Nodes (45): ChannelAccountListItem, ChannelAccountListItemSchema, CoupangAccountSettings, CoupangAccountSettingsSchema, UpdateCoupangAccountSettings, ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow (+37 more)

### Community 21 - "AI schema"
Cohesion: 0.04
Nodes (48): ContentAsset.originGenerationGroupId, ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.editedHtmlSavedAt (+40 more)

### Community 22 - "Community 22"
Cohesion: 0.09
Nodes (45): apiHeaders(), apiUrl(), Args, assertSafeDatasetId(), assertSupportedReplayPayloads(), BundleManifest, BundlePayload, BundleReference (+37 more)

### Community 23 - "Community 23"
Cohesion: 0.10
Nodes (48): assertNonProductionTarget(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged(), assertSha256(), BaselineManifest, BaselineManifestExpectation, baselineObjectKeys, buildChecksumsFile() (+40 more)

### Community 24 - "Channels schema"
Cohesion: 0.05
Nodes (49): RocketPoCatalogLine.businessDateBasis, RocketPoCatalogLine.center, RocketPoCatalogLine.createdAt, RocketPoCatalogLine.hasConfirmation, RocketPoCatalogLine.id, RocketPoCatalogLine.inboundType, RocketPoCatalogLine.orderQty, RocketPoCatalogLine.organization (+41 more)

### Community 25 - "Community 25"
Cohesion: 0.04
Nodes (47): deriveSellpiaInventoryFreshness(), FixedSellpiaAccountKeySchema, FixedSellpiaOriginSchema, IsoDateTimeStringSchema, SELLPIA_INVENTORY_FRESHNESS_STATUSES, SELLPIA_INVENTORY_REFRESH_REASONS, SellpiaFreshnessDerivationInput, SellpiaInventoryActiveSyncViewSchema (+39 more)

### Community 26 - "prisma field: AdAction.externalId"
Cohesion: 0.22
Nodes (30): CHANNELS_CAPABILITIES, ChannelsCapabilityKey, AdAction.externalId, AdAction.listingId, ChannelAdTargetDailySnapshot.externalId, ChannelAdTargetDailySnapshot.listingId, ChannelListing.externalId, ChannelListingDailySnapshot.externalId (+22 more)

### Community 27 - "AI schema"
Cohesion: 0.05
Nodes (43): ContentGeneration.detailPageArtifactId, ContentWorkspace.currentDetailPageArtifactId, ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.contentWorkspaceId, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.createdByUserId (+35 more)

### Community 28 - "Finance schema"
Cohesion: 0.05
Nodes (45): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description (+37 more)

### Community 29 - "AgentOS schema"
Cohesion: 0.05
Nodes (45): AgentCostEvent.agentInstance, AgentCostEvent.agentInstanceId, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id (+37 more)

### Community 30 - "System schema"
Cohesion: 0.05
Nodes (43): System, ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization (+35 more)

### Community 31 - "Community 31"
Cohesion: 0.09
Nodes (39): applyCacheControl(), ApplyResult, applyS3CacheControl(), applySupabaseCacheControl(), assertApplyAllowed(), buildCopyObjectInput(), CliArgs, CliConfig (+31 more)

### Community 32 - "Sourcing schema"
Cohesion: 0.05
Nodes (33): CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id, CandidateImage.isDeleted (+25 more)

### Community 33 - "prisma field: CSRecord.orderId"
Cohesion: 0.12
Nodes (35): CSRecord.orderId, OrderReturn.orderId, PickingItem.orderId, PurchaseOrderItem.orderId, ReturnTransfer.orderId, Shipment.orderId, UnshippedItem.orderId, ChannelAnalysis (+27 more)

### Community 34 - "Community 34"
Cohesion: 0.09
Nodes (36): CurrentOrganization, CurrentUser, Param, Post, buildCoupangWingSnapshotCoverage(), CoupangWingSnapshotCoverage, cellText(), collectParentMetadataConflicts() (+28 more)

### Community 35 - "Core schema"
Cohesion: 0.06
Nodes (32): AVAILABILITY_STATUSES, ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id, ChannelAccount.isPrimary, ChannelAccount.name (+24 more)

### Community 36 - "Inventory schema"
Cohesion: 0.06
Nodes (40): InventoryCommitmentAllocation.commitment, InventoryCommitmentAllocation.commitmentId, InventoryCommitmentAllocation.createdAt, InventoryCommitmentAllocation.id, InventoryCommitmentAllocation.organization, InventoryCommitmentAllocation.quantity, InventoryCommitmentAllocation.sellpiaInventorySku, InventoryCommitmentAllocation.sellpiaInventorySkuId (+32 more)

### Community 37 - "Community 37"
Cohesion: 0.05
Nodes (36): ChunkRequestBaseSchema, CoupangCatalogAttributeV1, CoupangCatalogAttributeV1Schema, CoupangCatalogBrowserCommand, CoupangCatalogBrowserCommandSchema, CoupangCatalogBrowserStatus, CoupangCatalogBrowserStatusSchema, CoupangCatalogChunkKind (+28 more)

### Community 38 - "Sourcing schema"
Cohesion: 0.06
Nodes (35): ContentGeneration.sourceCandidateId, SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.id, SourcingCandidate.imageUrl (+27 more)

### Community 39 - "Orders schema"
Cohesion: 0.06
Nodes (39): OrderLineItem.createdAt, OrderLineItem.externalBarcode, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.listingOptionId, OrderLineItem.metadata, OrderLineItem.optionName (+31 more)

### Community 40 - "Orders schema"
Cohesion: 0.06
Nodes (39): OrderReturn.channelAccount, OrderReturn.channelAccountId, OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.id (+31 more)

### Community 41 - "Community 41"
Cohesion: 0.05
Nodes (36): boundedText(), isoDay, requiredText(), ROCKET_SHORTAGE_REASONS, RocketPoCatalogPublication, RocketPoCatalogPublicationSchema, RocketPoCatalogRow, RocketPoCatalogRowSchema (+28 more)

### Community 42 - "AI schema"
Cohesion: 0.06
Nodes (38): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+30 more)

### Community 43 - "Community 43"
Cohesion: 0.06
Nodes (33): PANEL_RUN_SOURCES, PanelRunSource, PanelRunSourceSchema, sourceKeys, PANEL_ITEM_KINDS, PanelAlertItem, PanelDismissEventSchema, PanelEvent (+25 more)

### Community 44 - "Orders schema"
Cohesion: 0.06
Nodes (30): CHANNELS_ROOT, REPO_ROOT, Order.channelAccount, Order.channelAccountId, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber (+22 more)

### Community 45 - "Orders schema"
Cohesion: 0.06
Nodes (35): Orders, CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id (+27 more)

### Community 46 - "AI schema"
Cohesion: 0.06
Nodes (37): ProductPreparation.channelAccount, ProductPreparation.channelAccountId, ProductPreparation.channelListing, ProductPreparation.channelListingId, ProductPreparation.createdAt, ProductPreparation.createdByUser, ProductPreparation.createdByUserId, ProductPreparation.deletedAt (+29 more)

### Community 47 - "Channels schema"
Cohesion: 0.06
Nodes (36): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel, ChannelAdTargetDailySnapshot.clicks (+28 more)

### Community 48 - "Community 48"
Cohesion: 0.07
Nodes (29): CHANNEL_LISTING_SORTS, CHANNEL_LISTING_TABS, ChannelListingQueryDto, IsIn, IsOptional, IsString, IsUUID, MaxLength (+21 more)

### Community 49 - "System schema"
Cohesion: 0.06
Nodes (28): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon, Marketplace.id (+20 more)

### Community 50 - "AI schema"
Cohesion: 0.07
Nodes (35): ContentWorkspaceThumbnailSelection.contentAsset, ContentWorkspaceThumbnailSelection.contentAssetId, ContentWorkspaceThumbnailSelection.contentWorkspace, ContentWorkspaceThumbnailSelection.contentWorkspaceId, ContentWorkspaceThumbnailSelection.createdAt, ContentWorkspaceThumbnailSelection.createdByUser, ContentWorkspaceThumbnailSelection.createdByUserId, ContentWorkspaceThumbnailSelection.id (+27 more)

### Community 51 - "Community 51"
Cohesion: 0.06
Nodes (34): ACCOUNT_AD_DAILY_DIGEST_KEYS, AD_ROW_KEYS, AD_SUMMARY_KEYS, ADS_DAILY_ROW_KEYS, ADS_KPI_KEYS, assertExactCount(), assertProtectedSupabaseDestination(), assertReadyCounts() (+26 more)

### Community 52 - "Core schema"
Cohesion: 0.08
Nodes (34): ChannelListing.lastImportRunId, Order.sourceImportRunId, SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.createdAt, SourceImportRun.createdBy, SourceImportRun.errorCode (+26 more)

### Community 53 - "Inventory schema"
Cohesion: 0.07
Nodes (34): Shipment.warehouseId, StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.fromWarehouseId, StockTransfer.id, StockTransfer.notes, StockTransfer.optionName (+26 more)

### Community 54 - "AI schema"
Cohesion: 0.07
Nodes (30): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt (+22 more)

### Community 55 - "Community 55"
Cohesion: 0.06
Nodes (31): ChannelMatchCandidateReason, ChannelMatchCandidateReasonSchema, ChannelMatchEvidence, ChannelMatchEvidenceSchema, ChannelMatchingAccount, ChannelMatchingAccountSchema, ChannelOptionMatchingQueueRow, ChannelOptionMatchingQueueRowSchema (+23 more)

### Community 56 - "Community 56"
Cohesion: 0.07
Nodes (31): DeliveryCompany, DeliveryCompanySchema, Order, OrderActionResponse, OrderActionResponseSchema, OrderLineItem, OrderLineItemSchema, OrderListItem (+23 more)

### Community 57 - "Community 57"
Cohesion: 0.07
Nodes (22): ChannelListingController, Controller, CurrentOrganization, Get, Param, Query, aggregateMappingStatus(), ChannelListingRepositoryAdapter (+14 more)

### Community 58 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.startedAt, WorkflowRun.status (+25 more)

### Community 59 - "AI schema"
Cohesion: 0.08
Nodes (32): ContentGeneration.contentWorkspaceId, ContentWorkspace.channelListing, ContentWorkspace.channelListingId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.createdByUserId, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageRevision (+24 more)

### Community 60 - "Inventory schema"
Cohesion: 0.07
Nodes (32): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.organization, PickingItem.pickedAt, PickingItem.pickingList (+24 more)

### Community 61 - "Channels schema"
Cohesion: 0.08
Nodes (31): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.channelAccount, ChannelScrapeRun.channelAccountId, ChannelScrapeRun.clientRunKey, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson (+23 more)

### Community 62 - "Finance schema"
Cohesion: 0.08
Nodes (27): GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.listing, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization, GradeHistory.reason (+19 more)

### Community 63 - "Inventory schema"
Cohesion: 0.08
Nodes (26): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.sourceRef, SellpiaReceiptUploadBatch.sourceType (+18 more)

### Community 64 - "Community 64"
Cohesion: 0.10
Nodes (14): OperationAlertPort, CoupangSyncOrderPayload, CoupangSyncReturnPayload, HealthResult, SyncResult, isCoupangCredentialResolutionError(), syncSingleCoupangOrder(), syncCoupangProducts() (+6 more)

### Community 65 - "AgentOS schema"
Cohesion: 0.08
Nodes (29): AgentToolInvocation.agentInstance, AgentToolInvocation.agentInstanceId, AgentToolInvocation.approvalRequest, AgentToolInvocation.approvalRequestId, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt (+21 more)

### Community 66 - "Community 66"
Cohesion: 0.09
Nodes (21): recipeSource(), ChannelRecipeAutomationContext, ChannelRecipeAutomationContextRepositoryPort, automationReason(), ChannelRecipeAutomationService, countDecision(), proposalVersion(), requiredSuggestion() (+13 more)

### Community 67 - "Orders schema"
Cohesion: 0.09
Nodes (27): Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.id, Shipment.order, Shipment.organization (+19 more)

### Community 68 - "Core schema"
Cohesion: 0.08
Nodes (27): ChannelListing.brand, ChannelListing.category, ChannelListing.channelAccount, ChannelListing.channelAccountId, ChannelListing.channelName, ChannelListing.createdAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo (+19 more)

### Community 69 - "Channels schema"
Cohesion: 0.08
Nodes (28): CoupangWingSalesRankDailySnapshot.businessDate, CoupangWingSalesRankDailySnapshot.capturedAt, CoupangWingSalesRankDailySnapshot.categoryHierarchy, CoupangWingSalesRankDailySnapshot.collectedCount, CoupangWingSalesRankDailySnapshot.conversionRate28d, CoupangWingSalesRankDailySnapshot.createdAt, CoupangWingSalesRankDailySnapshot.id, CoupangWingSalesRankDailySnapshot.itemId (+20 more)

### Community 70 - "Inventory schema"
Cohesion: 0.08
Nodes (27): InventoryCommitment.businessKey, InventoryCommitment.createdAt, InventoryCommitment.createdBy, InventoryCommitment.creator, InventoryCommitment.id, InventoryCommitment.inventoryGeneration, InventoryCommitment.kind, InventoryCommitment.organization (+19 more)

### Community 71 - "Inventory schema"
Cohesion: 0.09
Nodes (27): SellpiaOrderTransmissionIntent.abortedAt, SellpiaOrderTransmissionIntent.createdAt, SellpiaOrderTransmissionIntent.createdBy, SellpiaOrderTransmissionIntent.creator, SellpiaOrderTransmissionIntent.finalizedAt, SellpiaOrderTransmissionIntent.finalizedGeneration, SellpiaOrderTransmissionIntent.id, SellpiaOrderTransmissionIntent.intentKey (+19 more)

### Community 72 - "Community 72"
Cohesion: 0.09
Nodes (22): adapterPaths, BROWSER_COLLECTION_ATTENTION_REASONS, BROWSER_COLLECTION_PRODUCERS, BROWSER_COLLECTION_STATES, BrowserCollectionAttentionReasonSchema, BrowserCollectionClassificationSchema, BrowserCollectionCommand, BrowserCollectionCommandSchema (+14 more)

### Community 73 - "Community 73"
Cohesion: 0.09
Nodes (24): SellpiaInventoryGenerationSchema, SellpiaInventoryQualityReportSchema, SellpiaInventoryRefreshReasonSchema, CompletedSourceArtifactRun, CoupangWingCatalogImportResponse, CoupangWingCatalogImportResponseSchema, ImportChanges, SellpiaInventoryImportOutcome (+16 more)

### Community 74 - "Community 74"
Cohesion: 0.14
Nodes (27): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+19 more)

### Community 75 - "Community 75"
Cohesion: 0.14
Nodes (14): ChannelProductMatchingController, Body, Controller, CurrentOrganization, Get, Param, Post, Put (+6 more)

### Community 76 - "Community 76"
Cohesion: 0.11
Nodes (26): automaticReason(), automaticStatus(), BarcodeEvidence, ChannelRecipeAutomationDecision, ChannelRecipeSuggestionEvidenceKind, ChannelRecipeSuggestionInput, ChannelRecipeSuggestionResponse, ChannelRecipeSuggestionSku (+18 more)

### Community 77 - "Inventory schema"
Cohesion: 0.07
Nodes (27): SellpiaInventoryState.activeGeneration, SellpiaInventoryState.activeSyncLeaseExpiresAt, SellpiaInventoryState.activeSyncOwner, SellpiaInventoryState.activeSyncOwnerUserId, SellpiaInventoryState.activeSyncStartedAt, SellpiaInventoryState.activeSyncToken, SellpiaInventoryState.createdAt, SellpiaInventoryState.failedGeneration (+19 more)

### Community 78 - "Community 78"
Cohesion: 0.07
Nodes (25): InventoryAvailabilityBatch, InventoryAvailabilityBatchSchema, InventoryCommitmentActorSchema, InventoryCommitmentAllocationRead, InventoryCommitmentAllocationReadSchema, InventoryCommitmentKind, InventoryCommitmentKindSchema, InventoryCommitmentRead (+17 more)

### Community 79 - "Community 79"
Cohesion: 0.09
Nodes (17): nextPublicationSequence(), productsFromRows(), resolveIdentities(), RocketPoCatalogRepositoryAdapter, toCompletedRun(), Inject, Injectable, zeroChanges() (+9 more)

### Community 80 - "Core schema"
Cohesion: 0.12
Nodes (24): asRecord(), KidItemFirstRegistrationLinks, normalizedOptionId(), normalizeKidItemFirstRegistrationLinks(), parseKidItemFirstRegistrationLinks(), providerOptionKey(), requiredString(), uuid() (+16 more)

### Community 81 - "Channels schema"
Cohesion: 0.09
Nodes (26): ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isOfferWinner, ChannelListingOptionDailySnapshot.lastObservedAt, ChannelListingOptionDailySnapshot.listing (+18 more)

### Community 82 - "Supply schema"
Cohesion: 0.08
Nodes (26): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+18 more)

### Community 83 - "Community 83"
Cohesion: 0.09
Nodes (9): Inject, ChannelSkuAvailabilityPort, ChannelProductMatchingRepositoryPort, Inject, ChannelSkuAvailabilityService, matchesStatus(), toAvailabilityItem(), Inject (+1 more)

### Community 84 - "Community 84"
Cohesion: 0.12
Nodes (17): aiProductSuggestion(), aiVariantSuggestion(), asRecord(), availabilityListingWhere(), ChannelProductMatchingRepositoryAdapter, completedCatalogRunWhere(), componentSource(), distinctStrings() (+9 more)

### Community 85 - "Channels schema"
Cohesion: 0.09
Nodes (24): ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.id, ChannelScrapeSnapshot.listing, ChannelScrapeSnapshot.listingOption (+16 more)

### Community 86 - "Core schema"
Cohesion: 0.09
Nodes (25): ChannelListing.masterProductId, MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.adTier, MasterProduct.brand, MasterProduct.category, MasterProduct.code, MasterProduct.createdAt (+17 more)

### Community 87 - "Community 87"
Cohesion: 0.08
Nodes (22): StatisticsCategoryRow, StatisticsCategoryRowSchema, StatisticsDeliveryDaily, StatisticsDeliveryDailySchema, StatisticsDeliveryResponse, StatisticsDeliveryResponseSchema, StatisticsGradeRow, StatisticsGradeRowSchema (+14 more)

### Community 88 - "Community 88"
Cohesion: 0.13
Nodes (16): ChannelAccountRepositoryAdapter, envelopeToJson(), maskAccessKey(), readCredentialsConfig(), stripLegacyCredentialKeys(), toJsonRecord(), toRecord(), trimToOptional() (+8 more)

### Community 89 - "Community 89"
Cohesion: 0.09
Nodes (7): CoupangProviderPort, ChannelSyncRepositoryPort, OrderSyncDeps, syncCoupangOrders(), ProductSyncDeps, Inject, Optional

### Community 90 - "Core schema"
Cohesion: 0.09
Nodes (23): ChannelListingOption.attributesJson, ChannelListingOption.commissionRate, ChannelListingOption.costPriceOverride, ChannelListingOption.createdAt, ChannelListingOption.id, ChannelListingOption.itemName, ChannelListingOption.lastImportRun, ChannelListingOption.lastImportRunId (+15 more)

### Community 91 - "Core schema"
Cohesion: 0.12
Nodes (20): ProductVariantComponent.confirmedAt, ProductVariantComponent.confirmedBy, ProductVariantComponent.createdAt, ProductVariantComponent.id, ProductVariantComponent.organization, ProductVariantComponent.productVariant, ProductVariantComponent.productVariantId, ProductVariantComponent.quantity (+12 more)

### Community 92 - "Community 92"
Cohesion: 0.11
Nodes (21): InventorySkuLinkedProduct, InventorySkuLinkedProductSchema, InventorySkuLinkedVariant, InventorySkuLinkedVariantSchema, InventorySkuSnapshotItem, InventorySkuSnapshotItemSchema, InventorySkuSnapshotListResponse, InventorySkuSnapshotListResponseSchema (+13 more)

### Community 93 - "Community 93"
Cohesion: 0.22
Nodes (8): ChannelDashboardController, Controller, CurrentOrganization, Get, Query, CoupangDateRangeQueryDto, ChannelDashboardService, Injectable

### Community 94 - "AgentOS schema"
Cohesion: 0.10
Nodes (22): AgentArtifact.agentInstance, AgentArtifact.agentInstanceId, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization (+14 more)

### Community 95 - "Channels schema"
Cohesion: 0.11
Nodes (22): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.channelAccount, ChannelAccountDailyKpiSnapshot.channelAccountId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+14 more)

### Community 96 - "Channels schema"
Cohesion: 0.11
Nodes (22): CoupangKeywordRankDailySnapshot.adRank, CoupangKeywordRankDailySnapshot.businessDate, CoupangKeywordRankDailySnapshot.capturedAt, CoupangKeywordRankDailySnapshot.createdAt, CoupangKeywordRankDailySnapshot.id, CoupangKeywordRankDailySnapshot.itemId, CoupangKeywordRankDailySnapshot.keyword, CoupangKeywordRankDailySnapshot.organicRank (+14 more)

### Community 97 - "Community 97"
Cohesion: 0.20
Nodes (14): CoupangCredentials, coupangRequest(), CoupangRequestOptions, generateAuthorization(), approveReturn(), confirmOrderSheets(), DELIVERY_COMPANIES, getOrderSheets() (+6 more)

### Community 98 - "Community 98"
Cohesion: 0.10
Nodes (10): CoupangProviderAdapter, Inject, Injectable, CoupangCreateSellerProductResponse, CoupangSellerProductPayload, OrderSheetResponse, SellerProductDetailResponse, SellerProductExternalSkuResponse (+2 more)

### Community 99 - "System schema"
Cohesion: 0.10
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+13 more)

### Community 100 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): LiveCommerceBroadcastDailySnapshot.broadcasterId, LiveCommerceBroadcastDailySnapshot.broadcasterName, LiveCommerceBroadcastDailySnapshot.broadcastId, LiveCommerceBroadcastDailySnapshot.businessDate, LiveCommerceBroadcastDailySnapshot.capturedAt, LiveCommerceBroadcastDailySnapshot.coverImageUrl, LiveCommerceBroadcastDailySnapshot.createdAt, LiveCommerceBroadcastDailySnapshot.endedAt (+13 more)

### Community 101 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): ShortsTrendDailySnapshot.businessDate, ShortsTrendDailySnapshot.capturedAt, ShortsTrendDailySnapshot.channelName, ShortsTrendDailySnapshot.commentCount, ShortsTrendDailySnapshot.createdAt, ShortsTrendDailySnapshot.id, ShortsTrendDailySnapshot.keyword, ShortsTrendDailySnapshot.likeCount (+13 more)

### Community 102 - "AI schema"
Cohesion: 0.10
Nodes (21): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.contentWorkspace, ThumbnailAnalysis.contentWorkspaceId, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id (+13 more)

### Community 103 - "AI schema"
Cohesion: 0.10
Nodes (21): ThumbnailGenerationInputImage.candidateImage, ThumbnailGenerationInputImage.candidateImageId, ThumbnailGenerationInputImage.createdAt, ThumbnailGenerationInputImage.fileSize, ThumbnailGenerationInputImage.generation, ThumbnailGenerationInputImage.generationId, ThumbnailGenerationInputImage.height, ThumbnailGenerationInputImage.id (+13 more)

### Community 104 - "Community 104"
Cohesion: 0.10
Nodes (18): SupplierHistoryItem, SupplierHistoryItemSchema, SupplierHistoryReport, SupplierHistoryReportSchema, SupplierHistorySummary, SupplierHistorySummarySchema, SupplierProductSalesReport, SupplierProductSalesReportSchema (+10 more)

### Community 105 - "Community 105"
Cohesion: 0.14
Nodes (20): assembleCompleteSnapshot(), assertSameManifest(), buildCollectionStatus(), countMedia(), countOptions(), derivePhase(), firstDate(), hashCatalogChunkPayload() (+12 more)

### Community 106 - "Finance schema"
Cohesion: 0.12
Nodes (20): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit (+12 more)

### Community 107 - "Supply schema"
Cohesion: 0.12
Nodes (18): PurchaseOrder.supplierId, Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.id, Supplier.leadTimeDays, Supplier.name (+10 more)

### Community 108 - "Channels schema"
Cohesion: 0.12
Nodes (20): SellpiaProductMonthlySales.buyPrice, SellpiaProductMonthlySales.capturedAt, SellpiaProductMonthlySales.createdAt, SellpiaProductMonthlySales.id, SellpiaProductMonthlySales.inAmount, SellpiaProductMonthlySales.inQty, SellpiaProductMonthlySales.optionCode, SellpiaProductMonthlySales.optionName (+12 more)

### Community 109 - "Sourcing schema"
Cohesion: 0.12
Nodes (20): Sourcing1688HotProductDailySnapshot.businessDate, Sourcing1688HotProductDailySnapshot.capturedAt, Sourcing1688HotProductDailySnapshot.createdAt, Sourcing1688HotProductDailySnapshot.id, Sourcing1688HotProductDailySnapshot.imageUrl, Sourcing1688HotProductDailySnapshot.monthlySales, Sourcing1688HotProductDailySnapshot.offerId, Sourcing1688HotProductDailySnapshot.organization (+12 more)

### Community 110 - "AgentOS schema"
Cohesion: 0.11
Nodes (19): AgentRuntimeState.agentInstance, AgentRuntimeState.agentInstanceId, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.id, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun (+11 more)

### Community 111 - "Channels schema"
Cohesion: 0.12
Nodes (19): CoupangWingTrackedProductDailySnapshot.businessDate, CoupangWingTrackedProductDailySnapshot.capturedAt, CoupangWingTrackedProductDailySnapshot.conversionRate28d, CoupangWingTrackedProductDailySnapshot.createdAt, CoupangWingTrackedProductDailySnapshot.estimatedRevenue28d, CoupangWingTrackedProductDailySnapshot.id, CoupangWingTrackedProductDailySnapshot.organization, CoupangWingTrackedProductDailySnapshot.pvLast28Day (+11 more)

### Community 112 - "Supply schema"
Cohesion: 0.12
Nodes (19): PurchaseOrderSubmissionAttempt.createdAt, PurchaseOrderSubmissionAttempt.errorCode, PurchaseOrderSubmissionAttempt.errorMessage, PurchaseOrderSubmissionAttempt.freshnessGeneration, PurchaseOrderSubmissionAttempt.id, PurchaseOrderSubmissionAttempt.idempotencyKey, PurchaseOrderSubmissionAttempt.organization, PurchaseOrderSubmissionAttempt.providerReference (+11 more)

### Community 113 - "Inventory schema"
Cohesion: 0.12
Nodes (19): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.notes, ReturnTransfer.optionName, ReturnTransfer.organization (+11 more)

### Community 114 - "Community 114"
Cohesion: 0.11
Nodes (17): ChannelSkuAvailabilityComponent, ChannelSkuAvailabilityComponentSchema, ChannelSkuAvailabilityItem, ChannelSkuAvailabilityItemSchema, ChannelSkuAvailabilityListResponse, ChannelSkuAvailabilityListResponseSchema, ChannelSkuAvailabilityMappingStatusSchema, ChannelSkuAvailabilityQuery (+9 more)

### Community 115 - "Community 115"
Cohesion: 0.15
Nodes (14): PRODUCT_LIFECYCLE_STATES, ProductLifecycleState, ProductLifecycleStateSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, MasterImageItem, MasterImageItemSchema, MasterImageRole (+6 more)

### Community 116 - "Community 116"
Cohesion: 0.22
Nodes (17): analyzePrReleaseContract(), changedFilesFromGit(), classifyFiles(), compareSemver(), ghPrBody(), git(), hasReleaseDecision(), isDevelopToMainPromotion() (+9 more)

### Community 117 - "Community 117"
Cohesion: 0.16
Nodes (17): appendValues(), Lane, parseArgs(), ParsedArgs, parseRawArgs(), ParseRawArgsOptions, pushValue(), value() (+9 more)

### Community 118 - "Community 118"
Cohesion: 0.12
Nodes (12): ChannelAccountController, Body, Controller, CurrentOrganization, Get, CoupangCredentials, ChannelAccountService, Inject (+4 more)

### Community 119 - "Community 119"
Cohesion: 0.18
Nodes (10): assertCanonicalCoupangAccountIdentity(), canonicalParentRows(), ChannelCatalogImportRepositoryAdapter, importResponse(), isUniqueConstraintError(), nextPublicationSequence(), Injectable, zeroChanges() (+2 more)

### Community 120 - "Community 120"
Cohesion: 0.11
Nodes (4): ChannelDashboardRepositoryAdapter, Injectable, ChannelDashboardRepositoryPort, Inject

### Community 121 - "Community 121"
Cohesion: 0.12
Nodes (10): lockChannelListingRow(), assertExactProductGraph(), MarketplaceRegistrationRepositoryAdapter, Injectable, upsertExactOptionLinks(), MarketplaceRegistrationRepositoryPort, Inject, Optional (+2 more)

### Community 122 - "Sourcing schema"
Cohesion: 0.14
Nodes (18): LiveCommerceProductDailySnapshot.broadcastId, LiveCommerceProductDailySnapshot.businessDate, LiveCommerceProductDailySnapshot.capturedAt, LiveCommerceProductDailySnapshot.createdAt, LiveCommerceProductDailySnapshot.id, LiveCommerceProductDailySnapshot.imageUrl, LiveCommerceProductDailySnapshot.organization, LiveCommerceProductDailySnapshot.priceCny (+10 more)

### Community 123 - "Sourcing schema"
Cohesion: 0.13
Nodes (18): NaverKeywordDailySnapshot.averageAdRank, NaverKeywordDailySnapshot.businessDate, NaverKeywordDailySnapshot.capturedAt, NaverKeywordDailySnapshot.competitionIndex, NaverKeywordDailySnapshot.createdAt, NaverKeywordDailySnapshot.id, NaverKeywordDailySnapshot.keyword, NaverKeywordDailySnapshot.monthlyMobileSearchCount (+10 more)

### Community 124 - "Channels schema"
Cohesion: 0.12
Nodes (18): RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt, RocketPurchaseOrder.firstSkuName, RocketPurchaseOrder.id, RocketPurchaseOrder.items, RocketPurchaseOrder.orderAmount, RocketPurchaseOrder.orderedAt (+10 more)

### Community 125 - "Community 125"
Cohesion: 0.11
Nodes (16): CANCEL_OPERATION_TARGET_TYPES, CancelOperationAffected, CancelOperationAffectedSchema, CancelOperationPreserved, CancelOperationPreservedSchema, CancelOperationResponse, CancelOperationResponseSchema, CancelOperationStatus (+8 more)

### Community 126 - "Community 126"
Cohesion: 0.22
Nodes (18): assertCurrentRebuildBinding(), assertProtectedApiDestination(), assertReplayCounts(), assertReplayFactDigest(), bootstrap(), buildSharedBootstrapPlan(), cliValue(), createPrisma() (+10 more)

### Community 127 - "Community 127"
Cohesion: 0.15
Nodes (8): SellpiaRecipeEvidenceAdapter, toEvidenceSku(), Inject, Injectable, SellpiaRecipeEvidencePort, SellpiaRecipeEvidenceSku, ChannelRecipeSuggestionContextRepositoryPort, Inject

### Community 128 - "Community 128"
Cohesion: 0.18
Nodes (8): ChannelCatalogCollectionRepositoryAdapter, isUniqueConstraintError(), ownedRunWhere(), Injectable, ChannelCatalogCollectionChunkRecord, ChannelCatalogCollectionRunRecord, ChannelCatalogCollectionWithChunks, startRun()

### Community 129 - "AgentOS schema"
Cohesion: 0.14
Nodes (17): AgentRunEvent.agentInstance, AgentRunEvent.agentInstanceId, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message (+9 more)

### Community 130 - "Channels schema"
Cohesion: 0.13
Nodes (17): CoupangWingTrackedProduct.brandName, CoupangWingTrackedProduct.categoryHierarchy, CoupangWingTrackedProduct.createdAt, CoupangWingTrackedProduct.enabled, CoupangWingTrackedProduct.id, CoupangWingTrackedProduct.imagePath, CoupangWingTrackedProduct.itemId, CoupangWingTrackedProduct.lastCapturedAt (+9 more)

### Community 131 - "Community 131"
Cohesion: 0.23
Nodes (5): Inject, ChannelCatalogCollectionPort, ChannelCatalogCollectionService, parseRequest(), Injectable

### Community 132 - "Community 132"
Cohesion: 0.12
Nodes (15): CurrentOrganization, Get, Query, ChannelSkuAvailabilityQueryDto, IsIn, IsInt, IsOptional, IsString (+7 more)

### Community 133 - "Community 133"
Cohesion: 0.15
Nodes (12): ApplyChannelRecipeAutomationInput, ApplyChannelRecipeAutomationInputSchema, ApplyChannelRecipeAutomationResponse, ApplyChannelRecipeAutomationResponseSchema, ChannelRecipeAutomationDecision, ChannelRecipeAutomationDecisionSchema, ChannelRecipeAutomationItem, ChannelRecipeAutomationItemSchema (+4 more)

### Community 134 - "Channels schema"
Cohesion: 0.16
Nodes (16): ChannelScrapeChunk.checksum, ChannelScrapeChunk.createdAt, ChannelScrapeChunk.id, ChannelScrapeChunk.itemCount, ChannelScrapeChunk.kind, ChannelScrapeChunk.organization, ChannelScrapeChunk.payload, ChannelScrapeChunk.publicationJson (+8 more)

### Community 135 - "Supply schema"
Cohesion: 0.13
Nodes (16): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.dueDate, SupplierPayment.id, SupplierPayment.notes, SupplierPayment.organization, SupplierPayment.paidAmount, SupplierPayment.paidDate (+8 more)

### Community 136 - "Supply schema"
Cohesion: 0.16
Nodes (16): SupplierProduct.createdAt, SupplierProduct.id, SupplierProduct.isPrimary, SupplierProduct.memo, SupplierProduct.minOrderQty, SupplierProduct.organization, SupplierProduct.sellpiaInventorySku, SupplierProduct.sellpiaInventorySkuId (+8 more)

### Community 137 - "Community 137"
Cohesion: 0.24
Nodes (14): analyzeReconstructionTriggers(), changedFilesFromGit(), ghPrBody(), git(), isCrossLayerControlChange(), isHighRiskBoundary(), isLargeServiceOrComponent(), layerOf() (+6 more)

### Community 138 - "Community 138"
Cohesion: 0.28
Nodes (10): ChannelCatalogCollectionController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+2 more)

### Community 139 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 140 - "Sourcing schema"
Cohesion: 0.17
Nodes (15): NaverPopularKeywordDailySnapshot.boardKey, NaverPopularKeywordDailySnapshot.boardLabel, NaverPopularKeywordDailySnapshot.businessDate, NaverPopularKeywordDailySnapshot.capturedAt, NaverPopularKeywordDailySnapshot.cid, NaverPopularKeywordDailySnapshot.createdAt, NaverPopularKeywordDailySnapshot.id, NaverPopularKeywordDailySnapshot.keyword (+7 more)

### Community 141 - "Channels schema"
Cohesion: 0.16
Nodes (15): SellpiaSalesDailySnapshot.businessDate, SellpiaSalesDailySnapshot.capturedAt, SellpiaSalesDailySnapshot.channelGroup, SellpiaSalesDailySnapshot.costKrw, SellpiaSalesDailySnapshot.createdAt, SellpiaSalesDailySnapshot.id, SellpiaSalesDailySnapshot.organization, SellpiaSalesDailySnapshot.qty (+7 more)

### Community 142 - "Inventory schema"
Cohesion: 0.15
Nodes (15): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items, StockAudit.matchedCount (+7 more)

### Community 143 - "Community 143"
Cohesion: 0.14
Nodes (12): CoupangDirectCenter, CoupangDirectCenterSchema, CoupangDirectOrderCollectionRequest, CoupangDirectOrderCollectionRequestSchema, CoupangDirectOrderItem, CoupangDirectOrderItemSchema, CoupangDirectOrderStatus, CoupangDirectOrderStatusSchema (+4 more)

### Community 144 - "Community 144"
Cohesion: 0.25
Nodes (14): assertPositiveIntegerText(), assertSharedDatabaseIdentity(), assertUuid(), buildChannelAccountFingerprint(), buildCoupangReplayBundle(), buildCoupangReplayScope(), computeReplayFactDigest(), databaseProjectRef() (+6 more)

### Community 145 - "Community 145"
Cohesion: 0.23
Nodes (11): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), main(), parseBaseline(), readFiles(), repoRoot(), walk() (+3 more)

### Community 146 - "Community 146"
Cohesion: 0.19
Nodes (6): ChannelSyncRepositoryAdapter, reconcileProductDetailOption(), Injectable, ProductListingSyncResult, normalizeCoupangOrderStatus(), normalizeCoupangProductStatus()

### Community 147 - "Channels schema"
Cohesion: 0.18
Nodes (13): Channels, CoupangKeywordTracker.createdAt, CoupangKeywordTracker.enabled, CoupangKeywordTracker.id, CoupangKeywordTracker.keyword, CoupangKeywordTracker.lastCapturedAt, CoupangKeywordTracker.maxPages, CoupangKeywordTracker.organization (+5 more)

### Community 148 - "Channels schema"
Cohesion: 0.19
Nodes (13): CoupangKeywordSerpDailySnapshot.businessDate, CoupangKeywordSerpDailySnapshot.capturedAt, CoupangKeywordSerpDailySnapshot.createdAt, CoupangKeywordSerpDailySnapshot.id, CoupangKeywordSerpDailySnapshot.itemCount, CoupangKeywordSerpDailySnapshot.items, CoupangKeywordSerpDailySnapshot.keyword, CoupangKeywordSerpDailySnapshot.organization (+5 more)

### Community 149 - "Core schema"
Cohesion: 0.17
Nodes (13): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+5 more)

### Community 150 - "Channels schema"
Cohesion: 0.18
Nodes (13): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson, RocketSupplyDailySnapshot.revenueKrw (+5 more)

### Community 151 - "Community 151"
Cohesion: 0.29
Nodes (13): asRecord(), assertNoPii(), buildReplayBody(), buildReplayKpis(), cloneReplayValue(), containsPiiValue(), copyString(), dateOnly() (+5 more)

### Community 152 - "Community 152"
Cohesion: 0.31
Nodes (11): analyzeSchemaArtifactSync(), changedFilesFromGit(), changedFilesFromWorkingTree(), GENERATED_ARTIFACT_PATHS, git(), main(), matchesAnyPath(), mergeChangedFiles() (+3 more)

### Community 153 - "Community 153"
Cohesion: 0.24
Nodes (8): ProductRegistrationSubmissionCapabilityInput, asRecord(), extractNestedSellerProductId(), isExplicitProviderRejection(), listingPayloadFromFrozenSubmission(), recordedMarketplaceResult(), sellerProductIdFromResponse(), stringField()

### Community 154 - "Community 154"
Cohesion: 0.26
Nodes (7): ChannelSyncController, Body, Controller, CurrentOrganization, CurrentUser, Get, Post

### Community 155 - "Community 155"
Cohesion: 0.23
Nodes (12): upsertChannelCatalogIdentities(), applyProductLinksInBatches(), applyVariantLinksInBatches(), buildCatalogProductProvisioningListings(), publishCatalogOperationalProducts(), unique(), validateProvisionedLinks(), flattenMedia() (+4 more)

### Community 156 - "Core schema"
Cohesion: 0.20
Nodes (12): Core, CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.keywords, CategoryMapping.organization (+4 more)

### Community 157 - "Sourcing schema"
Cohesion: 0.20
Nodes (12): Sourcing, TrendSeedKeyword.createdAt, TrendSeedKeyword.enabled, TrendSeedKeyword.id, TrendSeedKeyword.keyword, TrendSeedKeyword.keywordCn, TrendSeedKeyword.organization, TrendSeedKeyword.sources (+4 more)

### Community 158 - "Community 158"
Cohesion: 0.26
Nodes (9): DETAIL_IMAGE_COUNTS, DETAIL_PAGE_AGE_GROUPS, DETAIL_PAGE_TEMPLATE_IDS, DetailImageCount, DetailImageCountSchema, DetailPageAgeGroup, DetailPageAgeGroupSchema, DetailPageTemplateId (+1 more)

### Community 159 - "Community 159"
Cohesion: 0.17
Nodes (11): CoupangCatalogCollectionRunSchema, CoupangCatalogDiscoveryPageV1Schema, CoupangCatalogManifestConfirmationV1Schema, CoupangCatalogProductDetailsChunkV1Schema, CoupangCatalogProductV1Schema, PutCoupangCatalogChunkRequestSchema, checksum, manifest (+3 more)

### Community 160 - "Community 160"
Cohesion: 0.30
Nodes (12): assertAllowedRecord(), assertAllowedRows(), assertAllowedScalarRecord(), assertOptionalScalar(), assertPlainRecord(), assertReplayBundle(), assertReplayFactCounts(), assertReplayKpis() (+4 more)

### Community 161 - "Community 161"
Cohesion: 0.18
Nodes (11): assertLocalRebuildGuard(), assertSharedRebuildGuard(), guardFromCli(), assertLocalDevelopmentDatabase(), bootstrapAuthoritativeInventoryDevelopment(), buildBootstrapPlan(), LOCAL_HOSTS, main() (+3 more)

### Community 162 - "Community 162"
Cohesion: 0.35
Nodes (9): analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), directOutPortFiles(), FORBIDDEN_IN_PORT_FOLDER_NAMES, forbiddenInPortCallerFolders(), listDirectories(), listFiles(), main() (+1 more)

### Community 163 - "Community 163"
Cohesion: 0.31
Nodes (9): addUnique(), defaultOutputDir, defaultSourceDir, normalizeKiditemOrigin(), patchExtensionRuntimeFiles(), patchManifest(), prepareCoupangExtension(), repoRoot (+1 more)

### Community 164 - "Community 164"
Cohesion: 0.20
Nodes (4): RocketPoCatalogPort, RocketPoCatalogService, Inject, Injectable

### Community 165 - "Advertising schema"
Cohesion: 0.22
Nodes (9): ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.id, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.url, ScrapeTarget (+1 more)

### Community 166 - "Sourcing schema"
Cohesion: 0.27
Nodes (10): SourcingWorkspaceSnapshot.businessDate, SourcingWorkspaceSnapshot.createdAt, SourcingWorkspaceSnapshot.id, SourcingWorkspaceSnapshot.organization, SourcingWorkspaceSnapshot.payload, SourcingWorkspaceSnapshot.scope, SourcingWorkspaceSnapshot.updatedAt, SourcingWorkspaceSnapshot (+2 more)

### Community 167 - "Community 167"
Cohesion: 0.49
Nodes (6): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), scrubDeep(), scrubSecrets(), walk()

### Community 168 - "Community 168"
Cohesion: 0.25
Nodes (6): ChannelAccountListController, Controller, CurrentOrganization, Get, ChannelAccountQueryService, Injectable

### Community 169 - "Community 169"
Cohesion: 0.25
Nodes (5): ChannelsOperationAlertAdapter, Inject, Injectable, OperationLifecyclePatch, StartOperationAlertInput

### Community 170 - "Community 170"
Cohesion: 0.22
Nodes (5): ChannelCatalogPublicationRepositoryAdapter, Inject, Injectable, CatalogMediaPublicationPort, ChannelCatalogPublicationPort

### Community 171 - "Channels schema"
Cohesion: 0.28
Nodes (9): CoupangRepresentativeKeywordOverride.createdAt, CoupangRepresentativeKeywordOverride.id, CoupangRepresentativeKeywordOverride.keyword, CoupangRepresentativeKeywordOverride.organization, CoupangRepresentativeKeywordOverride.updatedAt, CoupangRepresentativeKeywordOverride.vendorItemId, CoupangRepresentativeKeywordOverride, coupang_representative_keyword_overrides (+1 more)

### Community 172 - "Community 172"
Cohesion: 0.22
Nodes (7): ReadinessCheck, ReadinessCheckSchema, ReadinessCheckStatusSchema, ReadinessResponse, ReadinessResponseSchema, RebuildReadinessResponse, RebuildReadinessResponseSchema

### Community 173 - "Community 173"
Cohesion: 0.47
Nodes (7): checkClaudeShims(), checkTrackedClaudeDirectory(), findStaleInstructionLines(), git(), listTracked(), main(), runChecks()

### Community 174 - "Community 174"
Cohesion: 0.32
Nodes (7): completeCollectionRun(), completedCollectionResult(), jsonRecord(), nextPublicationSequence(), numberRecord(), zeroChanges(), ChannelCatalogPublicationResult

### Community 177 - "Community 177"
Cohesion: 0.25
Nodes (6): AgentCatalogItem, ConfigurableParam, ConfigurableParamSchema, MarketplaceCatalogItem, MarketplaceCatalogItemSchema, WorkflowCatalogItem

### Community 178 - "Community 178"
Cohesion: 0.25
Nodes (6): WorkflowRun, WorkflowRunSchema, WorkflowStepRun, WorkflowStepRunSchema, WorkflowTemplate, WorkflowTemplateSchema

### Community 179 - "Community 179"
Cohesion: 0.46
Nodes (6): analyzeInventory(), listTopLevelScriptFiles(), main(), repoRoot(), SCRIPT_INVENTORY, SUPPORT_FILES

### Community 180 - "Community 180"
Cohesion: 0.29
Nodes (5): AuthRequiredErrorBody, AuthUserPublic, AuthUserPublicSchema, LoginRequest, LoginRequestSchema

### Community 181 - "Community 181"
Cohesion: 0.33
Nodes (5): assertActiveCoupangAccount(), assertCanonicalAccount(), lockAccount(), lockCollectionRun(), ChannelCatalogChunkPublicationResult

### Community 182 - "Community 182"
Cohesion: 0.33
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 183 - "Community 183"
Cohesion: 0.33
Nodes (4): SettlementReconcileDetail, SettlementReconcileDetailSchema, SettlementReconcileResponse, SettlementReconcileResponseSchema

### Community 184 - "Community 184"
Cohesion: 0.40
Nodes (4): RocketPoCatalogResolution, canonicalArtifactHash(), isCompleteCollection(), RocketPurchasePreviewRequestSchema

### Community 186 - "Community 186"
Cohesion: 0.50
Nodes (4): fileHash(), importInput(), makeRow(), representativeRows()

### Community 192 - "Community 192"
Cohesion: 0.50
Nodes (4): is_allowlisted(), is_comment_line(), load_file_lines(), check-tenant-scope.sh script

### Community 193 - "Community 193"
Cohesion: 1.00
Nodes (3): makeRepository(), runRecord(), runWithChunks()

### Community 194 - "Community 194"
Cohesion: 0.67
Nodes (3): accountIdFor(), seedOrderInline(), seedReturnInline()

### Community 195 - "Community 195"
Cohesion: 0.67
Nodes (3): detailOk(), listOk(), mockProductDetail()

### Community 197 - "Community 197"
Cohesion: 0.67
Nodes (3): extractEnvKeys(), readModelFile(), redactEnvValues()

## Knowledge Gaps
- **2505 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+2500 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Sourcing schema` to `prisma field: externalOptionId canonical option identity`, `Community 1`, `AgentOS schema`, `System schema`, `Community 5`, `Advertising schema`, `Core schema`, `AI schema`, `AgentOS schema`, `AI schema`, `code file: channels — Marketplace Sync + SKU Matching`, `Supply schema`, `Channels schema`, `AgentOS schema`, `AI schema`, `Community 22`, `Community 23`, `Channels schema`, `prisma field: AdAction.externalId`, `AI schema`, `Finance schema`, `AgentOS schema`, `System schema`, `prisma field: CSRecord.orderId`, `Core schema`, `Inventory schema`, `Sourcing schema`, `Orders schema`, `Orders schema`, `AI schema`, `Orders schema`, `Orders schema`, `AI schema`, `Channels schema`, `AI schema`, `Community 51`, `Core schema`, `Inventory schema`, `AI schema`, `Community 56`, `AgentOS schema`, `AI schema`, `Inventory schema`, `Channels schema`, `Finance schema`, `Inventory schema`, `AgentOS schema`, `Orders schema`, `Core schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `Core schema`, `Channels schema`, `Supply schema`, `Channels schema`, `Core schema`, `Core schema`, `Core schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `System schema`, `Sourcing schema`, `Sourcing schema`, `AI schema`, `AI schema`, `Finance schema`, `Supply schema`, `Channels schema`, `Sourcing schema`, `AgentOS schema`, `Channels schema`, `Supply schema`, `Inventory schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Supply schema`, `Supply schema`, `Sourcing schema`, `Channels schema`, `Inventory schema`, `Channels schema`, `Channels schema`, `Core schema`, `Channels schema`, `Core schema`, `Sourcing schema`, `Advertising schema`, `Sourcing schema`, `Channels schema`?**
  _High betweenness centrality (0.247) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `System schema` to `prisma field: externalOptionId canonical option identity`, `AgentOS schema`, `Advertising schema`, `Core schema`, `AI schema`, `AgentOS schema`, `AI schema`, `code file: channels — Marketplace Sync + SKU Matching`, `Supply schema`, `Channels schema`, `AgentOS schema`, `AI schema`, `Channels schema`, `prisma field: AdAction.externalId`, `AI schema`, `Finance schema`, `AgentOS schema`, `System schema`, `Sourcing schema`, `prisma field: CSRecord.orderId`, `Core schema`, `Inventory schema`, `Sourcing schema`, `Orders schema`, `Orders schema`, `AI schema`, `Orders schema`, `Orders schema`, `AI schema`, `Channels schema`, `System schema`, `AI schema`, `Core schema`, `Inventory schema`, `AI schema`, `AgentOS schema`, `AI schema`, `Inventory schema`, `Channels schema`, `Finance schema`, `Inventory schema`, `AgentOS schema`, `Orders schema`, `Core schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `Core schema`, `Channels schema`, `Supply schema`, `Channels schema`, `Core schema`, `Core schema`, `Core schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `System schema`, `Sourcing schema`, `Sourcing schema`, `AI schema`, `AI schema`, `Finance schema`, `Supply schema`, `Channels schema`, `Sourcing schema`, `AgentOS schema`, `Channels schema`, `Supply schema`, `Inventory schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `Channels schema`, `Supply schema`, `Supply schema`, `System schema`, `Sourcing schema`, `Channels schema`, `Inventory schema`, `Channels schema`, `Channels schema`, `Core schema`, `Channels schema`, `Core schema`, `Sourcing schema`, `Advertising schema`, `Sourcing schema`, `Channels schema`?**
  _High betweenness centrality (0.167) - this node is a cross-community bridge._
- **Why does `Order` connect `Orders schema` to `prisma field: externalOptionId canonical option identity`, `Community 1`, `System schema`, `Community 9`, `Community 10`, `Community 11`, `AI schema`, `code file: channels — Marketplace Sync + SKU Matching`, `Community 145`, `Community 146`, `AI schema`, `Community 22`, `Community 152`, `prisma field: AdAction.externalId`, `AI schema`, `Community 159`, `Sourcing schema`, `prisma field: CSRecord.orderId`, `Community 31`, `Core schema`, `Community 162`, `Advertising schema`, `Orders schema`, `Orders schema`, `Orders schema`, `Community 48`, `System schema`, `Community 51`, `Core schema`, `Community 56`, `Finance schema`, `Orders schema`, `Core schema`, `Inventory schema`, `Community 72`, `Core schema`, `Community 87`, `Core schema`, `Community 97`, `Community 104`, `Supply schema`, `Community 115`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **Are the 162 inferred relationships involving `Organization` (e.g. with `channel-account.controller.ts` and `channel-account-list.controller.ts`) actually correct?**
  _`Organization` has 162 INFERRED edges - model-reasoned connections that need verification._
- **Are the 129 inferred relationships involving `ChannelAccount` (e.g. with `channel-account.controller.ts` and `channel-account-list.controller.ts`) actually correct?**
  _`ChannelAccount` has 129 INFERRED edges - model-reasoned connections that need verification._
- **Are the 90 inferred relationships involving `ChannelListing` (e.g. with `channel-registration-capability.adapter.ts` and `channel-listing.controller.ts`) actually correct?**
  _`ChannelListing` has 90 INFERRED edges - model-reasoned connections that need verification._
- **Are the 117 inferred relationships involving `Order` (e.g. with `channel-sync.controller.ts` and `index.ts`) actually correct?**
  _`Order` has 117 INFERRED edges - model-reasoned connections that need verification._