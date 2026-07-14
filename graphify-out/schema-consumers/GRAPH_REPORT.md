# Graph Report - schema-consumers  (2026-07-13)

## Corpus Check
- 300 files · ~130,418 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4275 nodes · 18347 edges · 206 communities (195 shown, 11 thin omitted)
- Extraction: 42% EXTRACTED · 58% INFERRED · 0% AMBIGUOUS · INFERRED: 10724 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Core schema
- Community 1
- AgentOS schema
- Community 3
- Community 4
- prisma field: AdAction.externalId
- AI schema
- Community 7
- Community 8
- Community 9
- prisma field: AgentToolDefinition.isActive
- Channels schema
- Community 12
- Community 13
- Community 14
- Community 15
- AI schema
- AI schema
- Core schema
- AgentOS schema
- AgentOS schema
- Sourcing schema
- Community 22
- Community 23
- AI schema
- AI schema
- Core schema
- Orders schema
- Channels schema
- AI schema
- Community 30
- Channels schema
- Sourcing schema
- AI schema
- AI schema
- System schema
- Community 36
- Community 37
- AgentOS schema
- AgentOS schema
- Community 40
- Inventory schema
- Community 42
- Orders schema
- AI schema
- Inventory schema
- Community 46
- System schema
- Core schema
- Orders schema
- AgentOS schema
- AgentOS schema
- AgentOS schema
- Community 53
- Channels schema
- Supply schema
- Channels schema
- Community 57
- Community 58
- AgentOS schema
- Channels schema
- Core schema
- Community 62
- System schema
- Advertising schema
- Orders schema
- Community 66
- Community 67
- Channels schema
- AI schema
- AgentOS schema
- System schema
- Orders schema
- AI schema
- Community 74
- AgentOS schema
- Finance schema
- Community 77
- prisma field: CandidateImage.isDeleted
- AgentOS schema
- Inventory schema
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- AgentOS schema
- Core schema
- Channels schema
- AI schema
- Community 94
- Community 95
- Inventory schema
- Supply schema
- Community 98
- AgentOS schema
- Advertising schema
- Inventory schema
- Supply schema
- Orders schema
- Community 104
- Community 105
- Community 106
- Orders schema
- System schema
- Finance schema
- Finance schema
- Inventory schema
- Supply schema
- Finance schema
- Advertising schema
- Finance schema
- Community 116
- Community 117
- Core schema
- Orders schema
- Channels schema
- Community 121
- Community 122
- Community 123
- Community 124
- Community 125
- Supply schema
- System schema
- Community 128
- Community 129
- System schema
- Core schema
- System schema
- Community 133
- Community 134
- Community 135
- Advertising schema
- System schema
- Advertising schema
- Sourcing schema
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
- prisma field: Organization.id
- Community 166
- Community 167
- Community 191

## God Nodes (most connected - your core abstractions)
1. `Organization` - 306 edges
2. `Database ERD` - 287 edges
3. `ChannelListing` - 131 edges
4. `Order` - 130 edges
5. `ChannelAccount` - 125 edges
6. `prisma — Shared Schema` - 124 edges
7. `User` - 111 edges
8. `ContentWorkspace.organizationId` - 109 edges
9. `ProductPreparation.organizationId` - 109 edges
10. `ChannelListing.organizationId` - 104 edges
11. `ContentWorkspaceThumbnailSelection.organizationId` - 103 edges
12. `ChannelAdTargetDailySnapshot.organizationId` - 103 edges

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
- `Database ERD` --mentions_field--> `AdAction.listingOptionId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma

## Import Cycles
- None detected.

## Communities (206 total, 11 thin omitted)

### Community 0 - "Core schema"
Cohesion: 0.21
Nodes (149): UploadedWorkbookFile, HEADERS, USER, ListingRow, ids, DefinitiveMarketplaceRegistrationError, OperationAlertSeverity, COUPANG_PROVIDER_PORT (+141 more)

### Community 1 - "Community 1"
Cohesion: 0.02
Nodes (101): AgentApprovalRequestSummary, AgentApprovalRequestSummarySchema, AgentApprovalStatus, AgentApprovalStatusSchema, AgentArtifactHandoffSummary, AgentArtifactHandoffSummarySchema, AgentArtifactStatus, AgentArtifactStatusSchema (+93 more)

### Community 2 - "AgentOS schema"
Cohesion: 0.05
Nodes (85): Database ERD, ActionTask.targetId, ActionTask.targetType, AdAction.targetType, AgentApprovalRequest.agentInstanceId, AgentArtifact.agentInstanceId, AgentArtifact.targetId, AgentAuthorizationEvent.agentInstanceId (+77 more)

### Community 3 - "Community 3"
Cohesion: 0.03
Nodes (50): ChannelRegistrationCapabilityAdapter, Injectable, ChannelCatalogImportController, Controller, Inject, ChannelSkuAvailabilityController, Controller, ChannelSkuMappingController (+42 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (71): AdapterCommand, appendFlag(), appendOption(), appendProjectReferenceDefaults(), appendValues(), archiveFileName(), archiveShaFileName(), Args (+63 more)

### Community 5 - "prisma field: AdAction.externalId"
Cohesion: 0.14
Nodes (42): CanonicalParent, ClaimInput, LockedRunRow, TRANSACTION_OPTIONS, UpsertInput, AvailabilityPageMetaRow, REPLACEMENT_TRANSACTION_OPTIONS, SelectedMappingRow (+34 more)

### Community 6 - "AI schema"
Cohesion: 0.05
Nodes (39): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt (+31 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (59): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot, AdCampaignSnapshotSchema (+51 more)

### Community 8 - "Community 8"
Cohesion: 0.06
Nodes (42): CurrentOrganization, CurrentUser, Param, Post, buildCoupangWingSnapshotCoverage(), CoupangWingSnapshotCoverage, ChannelCatalogImportRepositoryPort, Inject (+34 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (55): ComplianceScores, ComplianceScoresSchema, COUPANG_IMAGE_SYNC_ROW_SOURCES, CoupangImageSyncCapabilities, CoupangImageSyncCapabilitiesSchema, CoupangImageSyncRow, CoupangImageSyncRowSchema, CoupangImageSyncRowSource (+47 more)

### Community 10 - "prisma field: AgentToolDefinition.isActive"
Cohesion: 0.07
Nodes (43): ChannelSyncRepositoryAdapter, ListingForProductSync, Injectable, ProductListingSyncResult, AutomaticMatchEvidence, AutomaticMatchMaster, ChannelSkuAutomaticMatch, matched() (+35 more)

### Community 11 - "Channels schema"
Cohesion: 0.04
Nodes (55): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+47 more)

### Community 12 - "Community 12"
Cohesion: 0.09
Nodes (49): apiHeaders(), apiUrl(), Args, assertSafeDatasetId(), buildCoupangImageSyncRowsForListings(), BundleManifest, BundlePayload, BundleReference (+41 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (49): account(), asRecord(), assertExactCount(), assertPositiveIntegerText(), assertReadyCounts(), assertReplayCounts(), assertSharedRebuildGuard(), assertUuid() (+41 more)

### Community 14 - "Community 14"
Cohesion: 0.10
Nodes (48): assertNonProductionTarget(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged(), assertSha256(), BaselineManifest, BaselineManifestExpectation, baselineObjectKeys, buildChecksumsFile() (+40 more)

### Community 15 - "Community 15"
Cohesion: 0.08
Nodes (45): applyCacheControl(), ApplyResult, applyS3CacheControl(), applySupabaseCacheControl(), assertApplyAllowed(), buildCopyObjectInput(), CliArgs, CliConfig (+37 more)

### Community 16 - "AI schema"
Cohesion: 0.05
Nodes (45): ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.editedHtmlSavedAt, ContentGeneration.errorMessage (+37 more)

### Community 17 - "AI schema"
Cohesion: 0.05
Nodes (45): ContentGeneration.detailPageArtifactId, ContentWorkspace.currentDetailPageArtifactId, ContentWorkspace.currentDetailPageRevisionId, DetailPageArtifact.contentWorkspace, DetailPageArtifact.contentWorkspaceId, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.createdByUserId (+37 more)

### Community 18 - "Core schema"
Cohesion: 0.05
Nodes (44): ChannelListing.abcGrade, ChannelListing.adBudgetLimit, ChannelListing.adTier, ChannelListing.brand, ChannelListing.category, ChannelListing.channelAccount, ChannelListing.channelAccountId, ChannelListing.channelName (+36 more)

### Community 19 - "AgentOS schema"
Cohesion: 0.05
Nodes (44): AgentRunRequest.agentInstance, AgentRunRequest.attempts, AgentRunRequest.claimedAt, AgentRunRequest.claimedBy, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.coalescedIntoRequestId, AgentRunRequest.conversation, AgentRunRequest.createdAt (+36 more)

### Community 20 - "AgentOS schema"
Cohesion: 0.05
Nodes (42): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+34 more)

### Community 21 - "Sourcing schema"
Cohesion: 0.05
Nodes (41): CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id, CandidateImage.isPrimary (+33 more)

### Community 22 - "Community 22"
Cohesion: 0.05
Nodes (36): PANEL_RUN_SOURCES, PanelRunSource, PanelRunSourceSchema, sourceKeys, PANEL_ITEM_KINDS, PanelAlertItem, PanelAlertItemSchema, PanelDismissEventSchema (+28 more)

### Community 23 - "Community 23"
Cohesion: 0.05
Nodes (39): AdMetricsDetail, AdMetricsDetailSchema, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary, DashboardAdSummarySchema (+31 more)

### Community 24 - "AI schema"
Cohesion: 0.06
Nodes (36): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height (+28 more)

### Community 25 - "AI schema"
Cohesion: 0.06
Nodes (40): ProductPreparation.selectedThumbnailGenerationId, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.contentWorkspaceId, ThumbnailGeneration.createdAt, ThumbnailGeneration.deletedAt, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.errorMessage (+32 more)

### Community 26 - "Core schema"
Cohesion: 0.06
Nodes (36): ContentGeneration.triggeredByUserId, ContentWorkspace.createdByUserId, OrganizationMembership.createdAt, OrganizationMembership.id, OrganizationMembership.invitedBy, OrganizationMembership.invitedById, OrganizationMembership.joinedAt, OrganizationMembership.lastSelectedAt (+28 more)

### Community 27 - "Orders schema"
Cohesion: 0.06
Nodes (39): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.listingOptionId, OrderLineItem.metadata, OrderLineItem.optionName, OrderLineItem.order (+31 more)

### Community 28 - "Channels schema"
Cohesion: 0.07
Nodes (37): channels — Marketplace Sync + SKU Matching, packages/shared — @kiditem/shared, AI, Channels, Core, Inventory, Sourcing, ChannelSkuComponent.channelSku (+29 more)

### Community 29 - "AI schema"
Cohesion: 0.06
Nodes (38): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+30 more)

### Community 30 - "Community 30"
Cohesion: 0.06
Nodes (28): ChannelAccountListItem, ChannelAccountListItemSchema, CoupangAccountSettings, CoupangAccountSettingsSchema, UpdateCoupangAccountSettings, ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow (+20 more)

### Community 31 - "Channels schema"
Cohesion: 0.07
Nodes (35): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel, ChannelAdTargetDailySnapshot.clicks (+27 more)

### Community 32 - "Sourcing schema"
Cohesion: 0.07
Nodes (31): ContentGeneration.sourceCandidateId, SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.id, SourcingCandidate.imageUrl (+23 more)

### Community 33 - "AI schema"
Cohesion: 0.07
Nodes (35): ContentWorkspaceThumbnailSelection.contentAsset, ContentWorkspaceThumbnailSelection.contentAssetId, ContentWorkspaceThumbnailSelection.contentWorkspace, ContentWorkspaceThumbnailSelection.contentWorkspaceId, ContentWorkspaceThumbnailSelection.createdAt, ContentWorkspaceThumbnailSelection.createdByUser, ContentWorkspaceThumbnailSelection.createdByUserId, ContentWorkspaceThumbnailSelection.id (+27 more)

### Community 34 - "AI schema"
Cohesion: 0.06
Nodes (35): ProductPreparation.channelAccount, ProductPreparation.channelAccountId, ProductPreparation.channelListing, ProductPreparation.channelListingId, ProductPreparation.createdAt, ProductPreparation.createdByUser, ProductPreparation.deletedAt, ProductPreparation.displayName (+27 more)

### Community 35 - "System schema"
Cohesion: 0.06
Nodes (28): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon, Marketplace.id (+20 more)

### Community 36 - "Community 36"
Cohesion: 0.07
Nodes (31): DeliveryCompany, DeliveryCompanySchema, Order, OrderActionResponse, OrderActionResponseSchema, OrderLineItem, OrderLineItemSchema, OrderListItem (+23 more)

### Community 37 - "Community 37"
Cohesion: 0.12
Nodes (33): DataMigrationContext, DataMigrationTarget, MigrationResult, appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertMutatingTarget(), CliArgs, Command (+25 more)

### Community 38 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+25 more)

### Community 39 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.startedAt, WorkflowRun.status (+25 more)

### Community 40 - "Community 40"
Cohesion: 0.11
Nodes (25): ChannelSkuMappingCounts, capCandidateLimit(), ChannelSkuMappingService, dedupeCandidates(), distinctNormalizedIdentifiers(), distinctTrimmed(), exactCodeEvidence(), Injectable (+17 more)

### Community 41 - "Inventory schema"
Cohesion: 0.07
Nodes (32): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.masterProduct, PickingItem.masterProductId, PickingItem.organization (+24 more)

### Community 42 - "Community 42"
Cohesion: 0.06
Nodes (28): ChannelSkuAvailabilityItem, ChannelSkuAvailabilityListResponse, ChannelSkuAvailabilityListResponseSchema, ChannelSkuAvailabilityQuery, ChannelSkuAvailabilityQuerySchema, ChannelSkuAvailabilityStatus, ChannelSkuAvailabilityStatusSchema, ChannelSkuAvailabilitySummary (+20 more)

### Community 43 - "Orders schema"
Cohesion: 0.07
Nodes (27): Order.channelAccount, Order.channelAccountId, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id (+19 more)

### Community 44 - "AI schema"
Cohesion: 0.08
Nodes (30): ContentGeneration.contentWorkspaceId, ContentWorkspace.channelListing, ContentWorkspace.channelListingId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageRevision, ContentWorkspace.currentThumbnailSelection (+22 more)

### Community 45 - "Inventory schema"
Cohesion: 0.08
Nodes (26): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.sourceRef, SellpiaReceiptUploadBatch.sourceType (+18 more)

### Community 46 - "Community 46"
Cohesion: 0.12
Nodes (18): asMappingStatus(), availabilityStatusSql(), ChannelSkuMappingRepositoryAdapter, contains(), emptyAvailabilityPageMeta(), mappingRowSelect(), queueWhere(), toEvidenceRow() (+10 more)

### Community 47 - "System schema"
Cohesion: 0.07
Nodes (26): Alert.actionTask, Alert.actorUser, Alert.actorUserId, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead (+18 more)

### Community 48 - "Core schema"
Cohesion: 0.08
Nodes (29): externalOptionId canonical option identity, vendorItemId provider term, AdAction.listingOptionId, ChannelAdTargetDailySnapshot.listingOptionId, ChannelListingOption.attributesJson, ChannelListingOption.commissionRate, ChannelListingOption.costPriceOverride, ChannelListingOption.createdAt (+21 more)

### Community 49 - "Orders schema"
Cohesion: 0.09
Nodes (27): Orders, Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.id, Shipment.order (+19 more)

### Community 50 - "AgentOS schema"
Cohesion: 0.08
Nodes (28): AgentOS, AgentAuthorizationEvent.toolId, AgentInstanceToolPolicy.agentInstance, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentInstanceToolPolicy.dryRunMode, AgentInstanceToolPolicy.effect (+20 more)

### Community 51 - "AgentOS schema"
Cohesion: 0.07
Nodes (28): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.approver, AgentApprovalRequest.approverUserId, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy, AgentApprovalRequest.decidedByUserId (+20 more)

### Community 52 - "AgentOS schema"
Cohesion: 0.08
Nodes (28): AgentToolInvocation.agentInstance, AgentToolInvocation.approvalRequest, AgentToolInvocation.approvalRequestId, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt, AgentToolInvocation.errorCode (+20 more)

### Community 53 - "Community 53"
Cohesion: 0.14
Nodes (27): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+19 more)

### Community 54 - "Channels schema"
Cohesion: 0.08
Nodes (27): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.channelAccount, ChannelScrapeRun.channelAccountId, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt (+19 more)

### Community 55 - "Supply schema"
Cohesion: 0.08
Nodes (26): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+18 more)

### Community 56 - "Channels schema"
Cohesion: 0.09
Nodes (25): ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id, ChannelListingOptionDailySnapshot.isOfferWinner, ChannelListingOptionDailySnapshot.lastObservedAt, ChannelListingOptionDailySnapshot.listing (+17 more)

### Community 57 - "Community 57"
Cohesion: 0.08
Nodes (22): StatisticsCategoryRow, StatisticsCategoryRowSchema, StatisticsDeliveryDaily, StatisticsDeliveryDailySchema, StatisticsDeliveryResponse, StatisticsDeliveryResponseSchema, StatisticsGradeRow, StatisticsGradeRowSchema (+14 more)

### Community 58 - "Community 58"
Cohesion: 0.16
Nodes (16): CoupangCredentials, coupangRequest(), CoupangRequestOptions, generateAuthorization(), approveReturn(), confirmOrderSheets(), DELIVERY_COMPANIES, getOrderSheets() (+8 more)

### Community 59 - "AgentOS schema"
Cohesion: 0.09
Nodes (24): AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy, AgentAuthorizationEvent.decidedByUserId, AgentAuthorizationEvent.decision (+16 more)

### Community 60 - "Channels schema"
Cohesion: 0.09
Nodes (23): ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.channel, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.id, ChannelScrapeSnapshot.listing, ChannelScrapeSnapshot.listingOption (+15 more)

### Community 61 - "Core schema"
Cohesion: 0.12
Nodes (24): ChannelListing.lastImportRunId, ChannelListingOption.lastImportRunId, MasterProduct.lastImportRunId, SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.createdAt, SourceImportRun.createdBy (+16 more)

### Community 62 - "Community 62"
Cohesion: 0.20
Nodes (8): ChannelDashboardController, Controller, CurrentOrganization, Get, Query, CoupangDateRangeQueryDto, ChannelDashboardService, Injectable

### Community 63 - "System schema"
Cohesion: 0.10
Nodes (23): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.href (+15 more)

### Community 64 - "Advertising schema"
Cohesion: 0.09
Nodes (23): AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+15 more)

### Community 65 - "Orders schema"
Cohesion: 0.10
Nodes (23): OrderReturn.channelAccount, OrderReturn.channelAccountId, OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.id (+15 more)

### Community 66 - "Community 66"
Cohesion: 0.11
Nodes (18): IsOptional, IsString, UpdateCoupangAccountSettingsDto, MarketplaceRegistrationDto, IsInt, IsOptional, IsString, IsUUID (+10 more)

### Community 67 - "Community 67"
Cohesion: 0.10
Nodes (6): CoupangProviderPort, ChannelSyncRepositoryPort, OrderSyncDeps, ProductSyncDeps, Inject, Optional

### Community 68 - "Channels schema"
Cohesion: 0.11
Nodes (22): ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.channelAccount, ChannelAccountDailyKpiSnapshot.channelAccountId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+14 more)

### Community 69 - "AI schema"
Cohesion: 0.10
Nodes (19): ContentAsset.originGenerationGroupId, ContentGeneration.generationGroupId, ContentGenerationGroup.baseContentGeneration, ContentGenerationGroup.baseContentGenerationId, ContentGenerationGroup.contentWorkspace, ContentGenerationGroup.contentWorkspaceId, ContentGenerationGroup.createdAt, ContentGenerationGroup.createdByUserId (+11 more)

### Community 70 - "AgentOS schema"
Cohesion: 0.10
Nodes (21): AgentArtifact.agentInstance, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization, AgentArtifact.request (+13 more)

### Community 71 - "System schema"
Cohesion: 0.10
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+13 more)

### Community 72 - "Orders schema"
Cohesion: 0.10
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 73 - "AI schema"
Cohesion: 0.10
Nodes (21): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.contentWorkspace, ThumbnailAnalysis.contentWorkspaceId, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id (+13 more)

### Community 74 - "Community 74"
Cohesion: 0.11
Nodes (15): ChannelListingController, Controller, CurrentOrganization, Get, Param, Query, CHANNEL_LISTING_SORTS, CHANNEL_LISTING_TABS (+7 more)

### Community 75 - "AgentOS schema"
Cohesion: 0.11
Nodes (20): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id, AgentCostEvent.inputTokens (+12 more)

### Community 76 - "Finance schema"
Cohesion: 0.12
Nodes (20): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit (+12 more)

### Community 77 - "Community 77"
Cohesion: 0.18
Nodes (14): envelopeToJson(), maskAccessKey(), readCredentialsConfig(), stripLegacyCredentialKeys(), toJsonRecord(), toRecord(), trimToOptional(), CoupangCredentialCryptoError (+6 more)

### Community 78 - "prisma field: CandidateImage.isDeleted"
Cohesion: 0.12
Nodes (12): fileHash(), importInput(), makeRow(), representativeRows(), CandidateImage.isDeleted, ContentAsset.isDeleted, ContentGeneration.isDeleted, ContentWorkspace.isDeleted (+4 more)

### Community 79 - "AgentOS schema"
Cohesion: 0.12
Nodes (19): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError, AgentTaskSession.lastRun (+11 more)

### Community 80 - "Inventory schema"
Cohesion: 0.12
Nodes (19): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.masterProduct, ReturnTransfer.masterProductId, ReturnTransfer.notes (+11 more)

### Community 81 - "Community 81"
Cohesion: 0.15
Nodes (14): PRODUCT_LIFECYCLE_STATES, ProductLifecycleState, ProductLifecycleStateSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, MasterImageItem, MasterImageItemSchema, MasterImageRole (+6 more)

### Community 82 - "Community 82"
Cohesion: 0.12
Nodes (15): CoupangWingCatalogImportResponse, CoupangWingCatalogImportResponseSchema, ImportChanges, SellpiaInventoryImportResponse, SellpiaInventoryImportResponseSchema, SourceImportRun, SourceImportRunSchema, SourceImportStatus (+7 more)

### Community 83 - "Community 83"
Cohesion: 0.11
Nodes (17): SupplierHistoryItem, SupplierHistoryItemSchema, SupplierHistoryReport, SupplierHistoryReportSchema, SupplierHistorySummary, SupplierHistorySummarySchema, SupplierProductSalesReport, SupplierProductSalesRow (+9 more)

### Community 84 - "Community 84"
Cohesion: 0.22
Nodes (17): analyzePrReleaseContract(), changedFilesFromGit(), classifyFiles(), compareSemver(), ghPrBody(), git(), hasReleaseDecision(), isDevelopToMainPromotion() (+9 more)

### Community 85 - "Community 85"
Cohesion: 0.12
Nodes (12): ChannelAccountController, Body, Controller, CurrentOrganization, Get, CoupangCredentials, ChannelAccountService, Inject (+4 more)

### Community 86 - "Community 86"
Cohesion: 0.13
Nodes (8): Inject, ChannelSkuAvailabilityPort, ChannelSkuMappingListQuery, ChannelSkuAvailabilityService, hydrateChannelSkuAvailabilityRows(), Injectable, ChannelSkuStockComponent, projectChannelSkuSellableStock()

### Community 87 - "Community 87"
Cohesion: 0.11
Nodes (16): CurrentOrganization, Get, Query, AVAILABILITY_STATUSES, ChannelSkuAvailabilityQueryDto, IsIn, IsInt, IsOptional (+8 more)

### Community 88 - "Community 88"
Cohesion: 0.11
Nodes (4): ChannelDashboardRepositoryAdapter, Injectable, ChannelDashboardRepositoryPort, Inject

### Community 89 - "Community 89"
Cohesion: 0.18
Nodes (9): OperationAlertPort, SyncResult, isCoupangCredentialResolutionError(), syncCoupangOrders(), syncCoupangProducts(), ChannelSyncService, errorMessage(), resultMessage() (+1 more)

### Community 90 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.id, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.lastRunId (+10 more)

### Community 91 - "Core schema"
Cohesion: 0.14
Nodes (16): ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id, ChannelAccount.isPrimary, ChannelAccount.name, ChannelAccount.organization (+8 more)

### Community 92 - "Channels schema"
Cohesion: 0.12
Nodes (18): RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt, RocketPurchaseOrder.firstSkuName, RocketPurchaseOrder.id, RocketPurchaseOrder.items, RocketPurchaseOrder.orderAmount, RocketPurchaseOrder.orderedAt (+10 more)

### Community 93 - "AI schema"
Cohesion: 0.12
Nodes (18): ThumbnailGenerationEvent.actor, ThumbnailGenerationEvent.actorUserId, ThumbnailGenerationEvent.attemptNumber, ThumbnailGenerationEvent.createdAt, ThumbnailGenerationEvent.errorMessage, ThumbnailGenerationEvent.eventType, ThumbnailGenerationEvent.fromPhase, ThumbnailGenerationEvent.fromStatus (+10 more)

### Community 94 - "Community 94"
Cohesion: 0.11
Nodes (16): CANCEL_OPERATION_TARGET_TYPES, CancelOperationAffected, CancelOperationAffectedSchema, CancelOperationPreserved, CancelOperationPreservedSchema, CancelOperationResponse, CancelOperationResponseSchema, CancelOperationStatus (+8 more)

### Community 95 - "Community 95"
Cohesion: 0.12
Nodes (8): ChannelAccountListController, Controller, CurrentOrganization, Get, ChannelAccountRepositoryPort, ChannelAccountQueryService, Inject, Injectable

### Community 96 - "Inventory schema"
Cohesion: 0.14
Nodes (17): StockTransfer.fromWarehouseId, StockTransfer.toWarehouseId, Warehouse.address, Warehouse.code, Warehouse.createdAt, Warehouse.id, Warehouse.isDefault, Warehouse.manager (+9 more)

### Community 97 - "Supply schema"
Cohesion: 0.13
Nodes (16): Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.id, Supplier.leadTimeDays, Supplier.name, Supplier.notes (+8 more)

### Community 98 - "Community 98"
Cohesion: 0.20
Nodes (8): canonicalParentRows(), ChannelCatalogImportRepositoryAdapter, importResponse(), isUniqueConstraintError(), nextPublicationSequence(), Injectable, zeroChanges(), ChannelCatalogImportClaim

### Community 99 - "AgentOS schema"
Cohesion: 0.15
Nodes (16): AgentRunEvent.agentInstance, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message, AgentRunEvent.organization (+8 more)

### Community 100 - "Advertising schema"
Cohesion: 0.13
Nodes (16): ExecutionTask.action, ExecutionTask.actionId, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt, ExecutionTask.errorMessage, ExecutionTask.finishedAt (+8 more)

### Community 101 - "Inventory schema"
Cohesion: 0.13
Nodes (16): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.id, StockTransfer.masterProduct, StockTransfer.masterProductId, StockTransfer.notes, StockTransfer.optionName (+8 more)

### Community 102 - "Supply schema"
Cohesion: 0.13
Nodes (16): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.dueDate, SupplierPayment.id, SupplierPayment.notes, SupplierPayment.organization, SupplierPayment.paidAmount, SupplierPayment.paidDate (+8 more)

### Community 103 - "Orders schema"
Cohesion: 0.13
Nodes (16): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.externalSku, UnshippedItem.id, UnshippedItem.isNotified, UnshippedItem.notifiedAt, UnshippedItem.optionName, UnshippedItem.order (+8 more)

### Community 104 - "Community 104"
Cohesion: 0.24
Nodes (14): analyzeReconstructionTriggers(), changedFilesFromGit(), ghPrBody(), git(), isCrossLayerControlChange(), isHighRiskBoundary(), isLargeServiceOrComponent(), layerOf() (+6 more)

### Community 105 - "Community 105"
Cohesion: 0.21
Nodes (5): ChannelsSellpiaMasterProductReadAdapter, Inject, Injectable, ChannelsSellpiaMasterProductReadPort, CandidateSellpiaMasterProduct

### Community 106 - "Community 106"
Cohesion: 0.13
Nodes (3): ChannelSkuMappingRepositoryPort, Inject, Inject

### Community 107 - "Orders schema"
Cohesion: 0.14
Nodes (15): CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing (+7 more)

### Community 108 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 109 - "Finance schema"
Cohesion: 0.14
Nodes (15): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.id, ProcessingCost.master, ProcessingCost.notes, ProcessingCost.organization, ProcessingCost.processType, ProcessingCost.productName (+7 more)

### Community 110 - "Finance schema"
Cohesion: 0.15
Nodes (15): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.organization, SalesPlan.period (+7 more)

### Community 111 - "Inventory schema"
Cohesion: 0.15
Nodes (15): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items, StockAudit.matchedCount (+7 more)

### Community 112 - "Supply schema"
Cohesion: 0.16
Nodes (15): SupplierProduct.createdAt, SupplierProduct.id, SupplierProduct.isPrimary, SupplierProduct.masterProduct, SupplierProduct.masterProductId, SupplierProduct.memo, SupplierProduct.minOrderQty, SupplierProduct.organization (+7 more)

### Community 113 - "Finance schema"
Cohesion: 0.15
Nodes (14): Finance, GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.listing, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization (+6 more)

### Community 114 - "Advertising schema"
Cohesion: 0.15
Nodes (14): ExecutionTask.workerId, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentTaskRef, ExecutionWorker.currentUrl, ExecutionWorker.id, ExecutionWorker.label, ExecutionWorker.lastHeartbeatAt (+6 more)

### Community 115 - "Finance schema"
Cohesion: 0.15
Nodes (14): ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description, ManualLedger.id (+6 more)

### Community 116 - "Community 116"
Cohesion: 0.23
Nodes (11): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), main(), parseBaseline(), readFiles(), repoRoot(), walk() (+3 more)

### Community 117 - "Community 117"
Cohesion: 0.19
Nodes (12): ChannelSkuCandidateQueryDto, ChannelSkuMappingQueryDto, MAPPING_STATUSES, IsIn, IsInt, IsOptional, IsPositive, IsString (+4 more)

### Community 118 - "Core schema"
Cohesion: 0.17
Nodes (13): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+5 more)

### Community 119 - "Orders schema"
Cohesion: 0.17
Nodes (11): Review.content, Review.createdAt, Review.id, Review.listing, Review.organization, Review.platform, Review.rating, Review.reviewedAt (+3 more)

### Community 120 - "Channels schema"
Cohesion: 0.18
Nodes (13): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson, RocketSupplyDailySnapshot.revenueKrw (+5 more)

### Community 121 - "Community 121"
Cohesion: 0.31
Nodes (11): analyzeSchemaArtifactSync(), changedFilesFromGit(), changedFilesFromWorkingTree(), GENERATED_ARTIFACT_PATHS, git(), main(), matchesAnyPath(), mergeChangedFiles() (+3 more)

### Community 122 - "Community 122"
Cohesion: 0.23
Nodes (8): Body, CurrentOrganization, CurrentUser, Get, Param, Post, Query, Put

### Community 123 - "Community 123"
Cohesion: 0.26
Nodes (7): ChannelSyncController, Body, Controller, CurrentOrganization, CurrentUser, Get, Post

### Community 124 - "Community 124"
Cohesion: 0.17
Nodes (9): aggregateMappingStatus(), contains(), firstPrice(), parseQueryDate(), positiveInteger(), toSummary(), ChannelListingListResult, ChannelListingQuery (+1 more)

### Community 125 - "Community 125"
Cohesion: 0.17
Nodes (5): CoupangSyncOrderPayload, CoupangSyncReturnPayload, HealthResult, syncSingleCoupangOrder(), syncSingleCoupangReturn()

### Community 126 - "Supply schema"
Cohesion: 0.18
Nodes (12): Supply, PurchaseOrderItem.createdAt, PurchaseOrderItem.id, PurchaseOrderItem.masterProduct, PurchaseOrderItem.masterProductId, PurchaseOrderItem.order, PurchaseOrderItem.organization, PurchaseOrderItem.productName (+4 more)

### Community 127 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 128 - "Community 128"
Cohesion: 0.26
Nodes (9): DETAIL_IMAGE_COUNTS, DETAIL_PAGE_AGE_GROUPS, DETAIL_PAGE_TEMPLATE_IDS, DetailImageCount, DetailImageCountSchema, DetailPageAgeGroup, DetailPageAgeGroupSchema, DetailPageTemplateId (+1 more)

### Community 129 - "Community 129"
Cohesion: 0.18
Nodes (9): checkSellpiaCutoverPreflight(), createPrisma(), main(), ReadonlyQueryClient, runSellpiaCutoverPreflight(), toIssue(), cleanCounts, FakeQueryClient (+1 more)

### Community 130 - "System schema"
Cohesion: 0.20
Nodes (11): ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization, ActivityEvent.source (+3 more)

### Community 131 - "Core schema"
Cohesion: 0.22
Nodes (11): CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.keywords, CategoryMapping.organization, CategoryMapping.updatedAt (+3 more)

### Community 132 - "System schema"
Cohesion: 0.20
Nodes (10): FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name, FeatureGate.updatedAt (+2 more)

### Community 133 - "Community 133"
Cohesion: 0.18
Nodes (9): ActionTask, ActionTaskExecuteResponse, ActionTaskList, ActionTaskListSchema, ActionTaskRelatedProduct, ActionTaskRelatedProductSchema, ActionTaskSchema, ActionTaskSourceAlert (+1 more)

### Community 134 - "Community 134"
Cohesion: 0.35
Nodes (9): analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), directOutPortFiles(), FORBIDDEN_IN_PORT_FOLDER_NAMES, forbiddenInPortCallerFolders(), listDirectories(), listFiles(), main() (+1 more)

### Community 135 - "Community 135"
Cohesion: 0.31
Nodes (9): addUnique(), defaultOutputDir, defaultSourceDir, normalizeKiditemOrigin(), patchExtensionRuntimeFiles(), patchManifest(), prepareCoupangExtension(), repoRoot (+1 more)

### Community 136 - "Advertising schema"
Cohesion: 0.22
Nodes (10): Advertising, ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.id, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.url (+2 more)

### Community 137 - "System schema"
Cohesion: 0.24
Nodes (10): System, SystemSetting.createdAt, SystemSetting.id, SystemSetting.key, SystemSetting.organization, SystemSetting.updatedAt, SystemSetting.value, SystemSetting (+2 more)

### Community 138 - "Advertising schema"
Cohesion: 0.22
Nodes (10): ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task, ExecutionLog.taskId (+2 more)

### Community 139 - "Sourcing schema"
Cohesion: 0.27
Nodes (10): SourcingWorkspaceSnapshot.businessDate, SourcingWorkspaceSnapshot.createdAt, SourcingWorkspaceSnapshot.id, SourcingWorkspaceSnapshot.organization, SourcingWorkspaceSnapshot.payload, SourcingWorkspaceSnapshot.scope, SourcingWorkspaceSnapshot.updatedAt, SourcingWorkspaceSnapshot (+2 more)

### Community 140 - "Community 140"
Cohesion: 0.20
Nodes (8): ReviewFilter, ReviewFilterSchema, ReviewListItem, ReviewListItemSchema, ReviewListResponse, ReviewListResponseSchema, ReviewSummary, ReviewSummarySchema

### Community 141 - "Community 141"
Cohesion: 0.49
Nodes (6): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), scrubDeep(), scrubSecrets(), walk()

### Community 142 - "Community 142"
Cohesion: 0.31
Nodes (8): parseArgs(), ParsedArgs, parseRawArgs(), ParseRawArgsOptions, pushValue(), values(), COMMANDS, makeArgs()

### Community 143 - "Community 143"
Cohesion: 0.25
Nodes (5): ChannelsOperationAlertAdapter, Inject, Injectable, OperationLifecyclePatch, StartOperationAlertInput

### Community 144 - "Community 144"
Cohesion: 0.22
Nodes (4): Inject, ChannelAccountRepositoryAdapter, Injectable, CoupangCredentialsPort

### Community 145 - "Community 145"
Cohesion: 0.22
Nodes (9): assertLocalRebuildGuard(), assertLocalDevelopmentDatabase(), bootstrapAuthoritativeInventoryDevelopment(), buildBootstrapPlan(), LOCAL_HOSTS, main(), optionalUuid(), parseBootstrapArgs() (+1 more)

### Community 146 - "Community 146"
Cohesion: 0.47
Nodes (7): checkClaudeShims(), checkTrackedClaudeDirectory(), findStaleInstructionLines(), git(), listTracked(), main(), runChecks()

### Community 147 - "Community 147"
Cohesion: 0.25
Nodes (6): WorkflowRun, WorkflowRunSchema, WorkflowStepRun, WorkflowStepRunSchema, WorkflowTemplate, WorkflowTemplateSchema

### Community 148 - "Community 148"
Cohesion: 0.46
Nodes (6): analyzeInventory(), listTopLevelScriptFiles(), main(), repoRoot(), SCRIPT_INVENTORY, SUPPORT_FILES

### Community 149 - "Community 149"
Cohesion: 0.33
Nodes (7): asRecord(), extractNestedSellerProductId(), isExplicitProviderRejection(), listingPayloadFromFrozenSubmission(), recordedMarketplaceResult(), sellerProductIdFromResponse(), stringField()

### Community 150 - "Community 150"
Cohesion: 0.29
Nodes (5): AuthRequiredErrorBody, AuthUserPublic, AuthUserPublicSchema, LoginRequest, LoginRequestSchema

### Community 151 - "Community 151"
Cohesion: 0.29
Nodes (5): ReadinessCheck, ReadinessCheckSchema, ReadinessCheckStatusSchema, ReadinessResponse, ReadinessResponseSchema

### Community 152 - "Community 152"
Cohesion: 0.33
Nodes (4): isoDate, RangeSchema, SalesAnalysisDataSources, SalesAnalysisDataSourcesSchema

### Community 153 - "Community 153"
Cohesion: 0.33
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 154 - "Community 154"
Cohesion: 0.33
Nodes (4): SettlementReconcileDetail, SettlementReconcileDetailSchema, SettlementReconcileResponse, SettlementReconcileResponseSchema

### Community 161 - "Community 161"
Cohesion: 0.50
Nodes (4): is_allowlisted(), is_comment_line(), load_file_lines(), check-tenant-scope.sh script

### Community 162 - "Community 162"
Cohesion: 0.50
Nodes (3): repoRoot, seedPath, serverSeedPath

### Community 163 - "Community 163"
Cohesion: 0.67
Nodes (3): extractEnvKeys(), readModelFile(), redactEnvValues()

## Knowledge Gaps
- **1814 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+1809 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Core schema` to `Community 1`, `AgentOS schema`, `Community 4`, `prisma field: AdAction.externalId`, `AI schema`, `Community 9`, `prisma field: AgentToolDefinition.isActive`, `Channels schema`, `Community 12`, `Community 13`, `Community 14`, `AI schema`, `AI schema`, `Core schema`, `AgentOS schema`, `AgentOS schema`, `Sourcing schema`, `AI schema`, `AI schema`, `Core schema`, `Orders schema`, `Channels schema`, `AI schema`, `Channels schema`, `Sourcing schema`, `AI schema`, `AI schema`, `Community 36`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `Orders schema`, `AI schema`, `Inventory schema`, `System schema`, `Core schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Supply schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `Core schema`, `System schema`, `Advertising schema`, `Orders schema`, `Channels schema`, `AI schema`, `AgentOS schema`, `System schema`, `Orders schema`, `AI schema`, `AgentOS schema`, `Finance schema`, `prisma field: CandidateImage.isDeleted`, `AgentOS schema`, `Inventory schema`, `AgentOS schema`, `Core schema`, `Channels schema`, `AI schema`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `Inventory schema`, `Supply schema`, `Orders schema`, `Orders schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `Supply schema`, `Finance schema`, `Advertising schema`, `Finance schema`, `Core schema`, `Orders schema`, `Channels schema`, `Supply schema`, `Community 129`, `System schema`, `Core schema`, `System schema`, `Advertising schema`, `System schema`, `Sourcing schema`, `prisma field: Organization.id`?**
  _High betweenness centrality (0.235) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `AgentOS schema` to `Core schema`, `prisma field: AdAction.externalId`, `AI schema`, `prisma field: AgentToolDefinition.isActive`, `Channels schema`, `AI schema`, `AI schema`, `Core schema`, `AgentOS schema`, `AgentOS schema`, `Sourcing schema`, `AI schema`, `AI schema`, `Core schema`, `Orders schema`, `Channels schema`, `AI schema`, `Channels schema`, `Sourcing schema`, `AI schema`, `AI schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `Orders schema`, `AI schema`, `Inventory schema`, `System schema`, `Core schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Supply schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `Core schema`, `System schema`, `Advertising schema`, `Orders schema`, `Channels schema`, `AI schema`, `AgentOS schema`, `System schema`, `Orders schema`, `AI schema`, `AgentOS schema`, `Finance schema`, `prisma field: CandidateImage.isDeleted`, `AgentOS schema`, `Inventory schema`, `AgentOS schema`, `Core schema`, `Channels schema`, `AI schema`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `Advertising schema`, `Inventory schema`, `Supply schema`, `Orders schema`, `Orders schema`, `System schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `Supply schema`, `Finance schema`, `Advertising schema`, `Finance schema`, `Core schema`, `Orders schema`, `Channels schema`, `Supply schema`, `System schema`, `System schema`, `Core schema`, `System schema`, `Advertising schema`, `System schema`, `Advertising schema`, `Sourcing schema`?**
  _High betweenness centrality (0.172) - this node is a cross-community bridge._
- **Why does `Order` connect `Orders schema` to `Core schema`, `Community 1`, `AgentOS schema`, `Community 129`, `prisma field: AdAction.externalId`, `AI schema`, `Community 7`, `Community 8`, `Community 9`, `prisma field: AgentToolDefinition.isActive`, `Community 134`, `Community 12`, `Community 13`, `Community 15`, `AI schema`, `AI schema`, `Community 152`, `Orders schema`, `Community 155`, `Channels schema`, `Community 36`, `Orders schema`, `Community 57`, `Community 58`, `Orders schema`, `Community 66`, `Orders schema`, `prisma field: CandidateImage.isDeleted`, `Community 81`, `Core schema`, `Orders schema`, `Orders schema`, `Community 121`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **Are the 117 inferred relationships involving `Organization` (e.g. with `channel-account.controller.ts` and `channel-account-list.controller.ts`) actually correct?**
  _`Organization` has 117 INFERRED edges - model-reasoned connections that need verification._
- **Are the 50 inferred relationships involving `ChannelListing` (e.g. with `channel-registration-capability.adapter.ts` and `channel-listing.controller.ts`) actually correct?**
  _`ChannelListing` has 50 INFERRED edges - model-reasoned connections that need verification._
- **Are the 82 inferred relationships involving `Order` (e.g. with `channel-sync.controller.ts` and `index.ts`) actually correct?**
  _`Order` has 82 INFERRED edges - model-reasoned connections that need verification._
- **Are the 83 inferred relationships involving `ChannelAccount` (e.g. with `channel-account.controller.ts` and `channel-account-list.controller.ts`) actually correct?**
  _`ChannelAccount` has 83 INFERRED edges - model-reasoned connections that need verification._