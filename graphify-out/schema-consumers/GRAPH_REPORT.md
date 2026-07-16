# Graph Report - schema-consumers  (2026-07-16)

## Corpus Check
- 337 files · ~156,277 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5027 nodes · 24392 edges · 237 communities (219 shown, 18 thin omitted)
- Extraction: 36% EXTRACTED · 64% INFERRED · 0% AMBIGUOUS · INFERRED: 15489 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- prisma field: prisma — Shared Schema
- Community 1
- AgentOS schema
- Community 3
- Orders schema
- System schema
- Community 6
- AI schema
- prisma field: AdAction.externalId
- Channels schema
- Advertising schema
- Community 11
- Community 12
- Community 13
- Channels schema
- Community 15
- Community 16
- Community 17
- Core schema
- Community 19
- AI schema
- AgentOS schema
- AgentOS schema
- AI schema
- Sourcing schema
- Core schema
- Community 26
- Community 27
- AI schema
- Community 29
- Core schema
- Community 31
- AI schema
- Community 33
- System schema
- AI schema
- Community 36
- Sourcing schema
- Community 38
- AI schema
- Channels schema
- Finance schema
- Orders schema
- Community 43
- Community 44
- AI schema
- AI schema
- Community 47
- Community 48
- AgentOS schema
- AgentOS schema
- Core schema
- Inventory schema
- Core schema
- Core schema
- Supply schema
- Community 56
- Channels schema
- Community 58
- Community 59
- AgentOS schema
- AgentOS schema
- AgentOS schema
- Community 63
- Community 64
- Community 65
- Channels schema
- Inventory schema
- Supply schema
- Community 69
- Community 70
- AgentOS schema
- Community 72
- Community 73
- Core schema
- Orders schema
- Community 76
- Community 77
- Sourcing schema
- Community 79
- AgentOS schema
- System schema
- Channels schema
- Sourcing schema
- Sourcing schema
- AI schema
- Community 86
- Community 87
- AgentOS schema
- Finance schema
- Orders schema
- Sourcing schema
- Community 92
- Community 93
- Community 94
- Community 95
- AgentOS schema
- Supply schema
- Inventory schema
- Community 99
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- AgentOS schema
- AI schema
- Sourcing schema
- Sourcing schema
- Channels schema
- Community 110
- Community 111
- Community 112
- Community 113
- AgentOS schema
- Channels schema
- Advertising schema
- Inventory schema
- Inventory schema
- Inventory schema
- Supply schema
- Community 121
- Community 122
- Community 123
- Community 124
- Community 125
- Finance schema
- Orders schema
- System schema
- Sourcing schema
- Finance schema
- Orders schema
- Finance schema
- Inventory schema
- Advertising schema
- Community 135
- Community 136
- Community 137
- Community 138
- Community 139
- Channels schema
- Channels schema
- Community 142
- Community 143
- Community 144
- Channels schema
- System schema
- Community 147
- Community 148
- Community 149
- Advertising schema
- System schema
- System schema
- Supply schema
- Community 154
- Community 155
- Community 156
- Community 157
- Community 158
- Advertising schema
- Community 160
- Community 161
- Community 162
- Community 163
- Community 164
- Community 165
- Community 166
- Community 167
- Community 168
- Community 169
- Community 170
- Community 171
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
- prisma field: ChannelListingDailySnapshot.businessDate
- prisma field: ChannelListingDailySnapshot.id
- Community 194
- Community 195
- Community 221

## God Nodes (most connected - your core abstractions)
1. `Organization` - 364 edges
2. `Database ERD` - 325 edges
3. `ChannelAccount` - 149 edges
4. `Order` - 146 edges
5. `ChannelListing` - 141 edges
6. `prisma — Shared Schema` - 141 edges
7. `User` - 138 edges
8. `ContentWorkspace.organizationId` - 134 edges
9. `ProductPreparation.organizationId` - 134 edges
10. `SourceImportRun.organizationId` - 129 edges
11. `ChannelListing.organizationId` - 129 edges
12. `ContentWorkspaceThumbnailSelection.organizationId` - 128 edges

## Surprising Connections (you probably didn't know these)
- `packages/shared — @kiditem/shared` --mentions_domain--> `Inventory`  [EXTRACTED]
  packages/shared/AGENTS.md → prisma/models/inventory.prisma
- `bootstrap()` --indirect_call--> `account()`  [INFERRED]
  scripts/authoritative-inventory-rebuild.ts → apps/server/src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts
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

## Import Cycles
- None detected.

## Communities (237 total, 18 thin omitted)

### Community 0 - "prisma field: prisma — Shared Schema"
Cohesion: 0.16
Nodes (208): UploadedWorkbookFile, HEADERS, USER, chunkSelect, ErrorInput, LockedRun, OwnedRunInput, PutChunkInput (+200 more)

### Community 1 - "Community 1"
Cohesion: 0.02
Nodes (101): AgentApprovalRequestSummary, AgentApprovalRequestSummarySchema, AgentApprovalStatus, AgentApprovalStatusSchema, AgentArtifactHandoffSummary, AgentArtifactHandoffSummarySchema, AgentArtifactStatus, AgentArtifactStatusSchema (+93 more)

### Community 2 - "AgentOS schema"
Cohesion: 0.05
Nodes (92): ListingForProductSync, externalOptionId canonical option identity, vendorItemId provider term, Database ERD, AdAction.listingOptionId, AgentApprovalRequest.agentInstanceId, AgentArtifact.agentInstanceId, AgentAuthorizationEvent.agentInstanceId (+84 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (69): AdapterCommand, appendFlag(), appendOption(), appendProjectReferenceDefaults(), appendValues(), archiveFileName(), archiveShaFileName(), Args (+61 more)

### Community 4 - "Orders schema"
Cohesion: 0.04
Nodes (60): formatKstIso(), normalizeCoupangOrderStatus(), normalizeCoupangProductStatus(), channels — Marketplace Sync + SKU Matching, Inventory, Orders, Supply, Order.channelAccount (+52 more)

### Community 5 - "System schema"
Cohesion: 0.04
Nodes (57): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.href (+49 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (61): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot, AdCampaignSnapshotSchema (+53 more)

### Community 7 - "AI schema"
Cohesion: 0.04
Nodes (59): packages/shared — @kiditem/shared, AI, ProductPreparation.selectedThumbnailGenerationId, ThumbnailGeneration.attemptCount, ThumbnailGeneration.contentWorkspace, ThumbnailGeneration.contentWorkspaceId, ThumbnailGeneration.createdAt, ThumbnailGeneration.deletedAt (+51 more)

### Community 8 - "prisma field: AdAction.externalId"
Cohesion: 0.16
Nodes (40): accountIdFor(), seedOrderInline(), seedReturnInline(), CHANNELS_CAPABILITIES, ChannelsCapabilityKey, AdAction.externalId, AdAction.listingId, ChannelAdTargetDailySnapshot.externalId (+32 more)

### Community 9 - "Channels schema"
Cohesion: 0.04
Nodes (57): Channels, ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelListingOptionDailySnapshot.businessDate, ChannelListingOptionDailySnapshot.channel, ChannelListingOptionDailySnapshot.createdAt, ChannelListingOptionDailySnapshot.firstObservedAt, ChannelListingOptionDailySnapshot.id (+49 more)

### Community 10 - "Advertising schema"
Cohesion: 0.04
Nodes (58): AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+50 more)

### Community 11 - "Community 11"
Cohesion: 0.07
Nodes (49): ActionTask, ActionTaskExecuteResponse, ActionTaskList, ActionTaskListSchema, ActionTaskRelatedProduct, ActionTaskRelatedProductSchema, ActionTaskSchema, ActionTaskSourceAlert (+41 more)

### Community 12 - "Community 12"
Cohesion: 0.06
Nodes (40): CurrentOrganization, CurrentUser, Param, Post, buildCoupangWingSnapshotCoverage(), CoupangWingSnapshotCoverage, cellText(), collectParentMetadataConflicts() (+32 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (46): apiHeaders(), apiUrl(), Args, assertSafeDatasetId(), assertSupportedReplayPayloads(), BundleManifest, BundlePayload, BundleReference (+38 more)

### Community 14 - "Channels schema"
Cohesion: 0.04
Nodes (51): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+43 more)

### Community 15 - "Community 15"
Cohesion: 0.10
Nodes (49): value(), assertNonProductionTarget(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged(), assertSha256(), BaselineManifest, BaselineManifestExpectation, baselineObjectKeys (+41 more)

### Community 16 - "Community 16"
Cohesion: 0.07
Nodes (24): DATA_MIGRATION_RELEASES, DataMigration, backfillSourcingCandidatesFromMasterProducts, isLegacyDetailEditorHref(), rewriteLegacyDetailEditorAlertHrefs, rewriteLegacyDetailEditorHref(), relabelImageEditAgentInstancesToGeminiImage, backfillContentArchiveClassification (+16 more)

### Community 17 - "Community 17"
Cohesion: 0.08
Nodes (45): applyCacheControl(), ApplyResult, applyS3CacheControl(), applySupabaseCacheControl(), assertApplyAllowed(), buildCopyObjectInput(), CliArgs, CliConfig (+37 more)

### Community 18 - "Core schema"
Cohesion: 0.05
Nodes (44): CHANNEL_LISTING_SORTS, CHANNEL_LISTING_TABS, ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id, ChannelAccount.isPrimary (+36 more)

### Community 19 - "Community 19"
Cohesion: 0.07
Nodes (36): ChannelRegistrationCapabilityAdapter, Injectable, ChannelCatalogImportController, Controller, Inject, ChannelSkuAvailabilityController, Controller, CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT (+28 more)

### Community 20 - "AI schema"
Cohesion: 0.05
Nodes (47): ContentGeneration.contentType, ContentGeneration.contentWorkspace, ContentGeneration.createdAt, ContentGeneration.deletedAt, ContentGeneration.detailPageArtifact, ContentGeneration.detailPageArtifactId, ContentGeneration.editedHtml, ContentGeneration.editedHtmlSavedAt (+39 more)

### Community 21 - "AgentOS schema"
Cohesion: 0.05
Nodes (44): AgentRunRequest.agentInstance, AgentRunRequest.attempts, AgentRunRequest.claimedAt, AgentRunRequest.claimedBy, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.coalescedIntoRequestId, AgentRunRequest.conversation, AgentRunRequest.createdAt (+36 more)

### Community 22 - "AgentOS schema"
Cohesion: 0.05
Nodes (42): AgentRun.adapterType, AgentRun.agentInstance, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt (+34 more)

### Community 23 - "AI schema"
Cohesion: 0.06
Nodes (36): DetailPageArtifact.contentWorkspace, DetailPageArtifact.createdAt, DetailPageArtifact.createdByUser, DetailPageArtifact.currentRevision, DetailPageArtifact.currentRevisionId, DetailPageArtifact.deletedAt, DetailPageArtifact.id, DetailPageArtifact.metadata (+28 more)

### Community 24 - "Sourcing schema"
Cohesion: 0.05
Nodes (41): CandidateImage.candidate, CandidateImage.candidateId, CandidateImage.createdAt, CandidateImage.deletedAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.id, CandidateImage.isPrimary (+33 more)

### Community 25 - "Core schema"
Cohesion: 0.05
Nodes (38): ContentGeneration.triggeredByUserId, ContentWorkspace.createdByUserId, DetailPageArtifact.createdByUserId, DetailPageRevision.createdByUserId, OrganizationMembership.createdAt, OrganizationMembership.id, OrganizationMembership.invitedBy, OrganizationMembership.invitedById (+30 more)

### Community 26 - "Community 26"
Cohesion: 0.05
Nodes (36): PANEL_RUN_SOURCES, PanelRunSource, PanelRunSourceSchema, sourceKeys, PANEL_ITEM_KINDS, PanelAlertItem, PanelAlertItemSchema, PanelDismissEventSchema (+28 more)

### Community 27 - "Community 27"
Cohesion: 0.05
Nodes (39): AdMetricsDetail, AdMetricsDetailSchema, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary, DashboardAdSummarySchema (+31 more)

### Community 28 - "AI schema"
Cohesion: 0.06
Nodes (36): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.createdByUserId, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height (+28 more)

### Community 29 - "Community 29"
Cohesion: 0.05
Nodes (36): ChunkRequestBaseSchema, CoupangCatalogAttributeV1, CoupangCatalogAttributeV1Schema, CoupangCatalogBrowserCommand, CoupangCatalogBrowserCommandSchema, CoupangCatalogBrowserStatus, CoupangCatalogBrowserStatusSchema, CoupangCatalogChunkKind (+28 more)

### Community 30 - "Core schema"
Cohesion: 0.06
Nodes (37): ChannelListingOption.attributesJson, ChannelListingOption.commissionRate, ChannelListingOption.costPriceOverride, ChannelListingOption.createdAt, ChannelListingOption.id, ChannelListingOption.itemName, ChannelListingOption.lastImportRun, ChannelListingOption.lastImportRunId (+29 more)

### Community 31 - "Community 31"
Cohesion: 0.09
Nodes (22): CoupangCredentials, coupangRequest(), CoupangRequestOptions, generateAuthorization(), CoupangProviderAdapter, Injectable, approveReturn(), confirmOrderSheets() (+14 more)

### Community 32 - "AI schema"
Cohesion: 0.06
Nodes (38): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId, ThumbnailTracking.id, ThumbnailTracking.listing (+30 more)

### Community 33 - "Community 33"
Cohesion: 0.11
Nodes (36): DATA_MIGRATION_IDS, dataMigrations, DataMigrationContext, DataMigrationTarget, MigrationResult, appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertMutatingTarget() (+28 more)

### Community 34 - "System schema"
Cohesion: 0.06
Nodes (33): System, Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon (+25 more)

### Community 35 - "AI schema"
Cohesion: 0.06
Nodes (37): ProductPreparation.channelAccount, ProductPreparation.channelAccountId, ProductPreparation.channelListing, ProductPreparation.channelListingId, ProductPreparation.createdAt, ProductPreparation.createdByUser, ProductPreparation.deletedAt, ProductPreparation.displayName (+29 more)

### Community 36 - "Community 36"
Cohesion: 0.11
Nodes (28): ChannelSkuMappingCounts, capCandidateLimit(), ChannelSkuMappingService, dedupeCandidates(), distinctNormalizedIdentifiers(), distinctTrimmed(), exactCodeEvidence(), Injectable (+20 more)

### Community 37 - "Sourcing schema"
Cohesion: 0.07
Nodes (32): ContentGeneration.sourceCandidateId, SourcingCandidate.category, SourcingCandidate.costCny, SourcingCandidate.createdAt, SourcingCandidate.deletedAt, SourcingCandidate.description, SourcingCandidate.id, SourcingCandidate.imageUrl (+24 more)

### Community 38 - "Community 38"
Cohesion: 0.06
Nodes (28): ChannelAccountListItem, ChannelAccountListItemSchema, CoupangAccountSettings, CoupangAccountSettingsSchema, UpdateCoupangAccountSettings, ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow (+20 more)

### Community 39 - "AI schema"
Cohesion: 0.07
Nodes (35): ContentWorkspaceThumbnailSelection.contentAsset, ContentWorkspaceThumbnailSelection.contentAssetId, ContentWorkspaceThumbnailSelection.contentWorkspace, ContentWorkspaceThumbnailSelection.contentWorkspaceId, ContentWorkspaceThumbnailSelection.createdAt, ContentWorkspaceThumbnailSelection.createdByUser, ContentWorkspaceThumbnailSelection.createdByUserId, ContentWorkspaceThumbnailSelection.id (+27 more)

### Community 40 - "Channels schema"
Cohesion: 0.07
Nodes (35): CoupangWingTrackedProduct.brandName, CoupangWingTrackedProduct.categoryHierarchy, CoupangWingTrackedProduct.createdAt, CoupangWingTrackedProduct.enabled, CoupangWingTrackedProduct.id, CoupangWingTrackedProduct.imagePath, CoupangWingTrackedProduct.itemId, CoupangWingTrackedProduct.lastCapturedAt (+27 more)

### Community 41 - "Finance schema"
Cohesion: 0.06
Nodes (32): GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.listing, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.organization, GradeHistory.reason (+24 more)

### Community 42 - "Orders schema"
Cohesion: 0.06
Nodes (35): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.metadata, OrderLineItem.optionName, OrderLineItem.order, OrderLineItem.organization (+27 more)

### Community 43 - "Community 43"
Cohesion: 0.06
Nodes (33): deriveSellpiaInventoryFreshness(), FixedSellpiaAccountKeySchema, FixedSellpiaOriginSchema, IsoDateTimeStringSchema, SELLPIA_INVENTORY_FRESHNESS_STATUSES, SELLPIA_INVENTORY_REFRESH_REASONS, SellpiaFreshnessDerivationInput, SellpiaInventoryActiveSyncViewSchema (+25 more)

### Community 44 - "Community 44"
Cohesion: 0.06
Nodes (34): ACCOUNT_AD_DAILY_DIGEST_KEYS, AD_ROW_KEYS, AD_SUMMARY_KEYS, ADS_DAILY_ROW_KEYS, ADS_KPI_KEYS, assertExactCount(), assertProtectedSupabaseDestination(), assertReadyCounts() (+26 more)

### Community 45 - "AI schema"
Cohesion: 0.07
Nodes (33): ContentGeneration.contentWorkspaceId, ContentWorkspace.channelListing, ContentWorkspace.channelListingId, ContentWorkspace.createdAt, ContentWorkspace.createdByUser, ContentWorkspace.currentDetailPageArtifact, ContentWorkspace.currentDetailPageArtifactId, ContentWorkspace.currentDetailPageRevision (+25 more)

### Community 46 - "AI schema"
Cohesion: 0.07
Nodes (30): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt (+22 more)

### Community 47 - "Community 47"
Cohesion: 0.06
Nodes (30): ChannelSkuAvailabilityItem, ChannelSkuAvailabilityListResponse, ChannelSkuAvailabilityListResponseSchema, ChannelSkuAvailabilityQuery, ChannelSkuAvailabilityQuerySchema, ChannelSkuAvailabilityStatus, ChannelSkuAvailabilityStatusSchema, ChannelSkuAvailabilitySummary (+22 more)

### Community 48 - "Community 48"
Cohesion: 0.07
Nodes (31): DeliveryCompany, DeliveryCompanySchema, Order, OrderActionResponse, OrderActionResponseSchema, OrderLineItem, OrderLineItemSchema, OrderListItem (+23 more)

### Community 49 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentArtifact.conversationId, AgentConversation.createdAt, AgentConversation.createdBy, AgentConversation.createdByUserId, AgentConversation.id, AgentConversation.lastMessageAt, AgentConversation.metadata, AgentConversation.organization (+25 more)

### Community 50 - "AgentOS schema"
Cohesion: 0.07
Nodes (33): AgentRunRequest.sourceWorkflowRunId, WorkflowRun.completedAt, WorkflowRun.contextData, WorkflowRun.createdAt, WorkflowRun.error, WorkflowRun.id, WorkflowRun.startedAt, WorkflowRun.status (+25 more)

### Community 51 - "Core schema"
Cohesion: 0.08
Nodes (33): ChannelListing.lastImportRunId, SourceImportRun.attemptToken, SourceImportRun.channelAccount, SourceImportRun.channelAccountId, SourceImportRun.createdAt, SourceImportRun.createdBy, SourceImportRun.errorCode, SourceImportRun.errorMessage (+25 more)

### Community 52 - "Inventory schema"
Cohesion: 0.07
Nodes (33): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.fromWarehouseId, StockTransfer.id, StockTransfer.masterProduct, StockTransfer.masterProductId, StockTransfer.notes (+25 more)

### Community 53 - "Core schema"
Cohesion: 0.07
Nodes (32): Core, CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.keywords, CategoryMapping.organization (+24 more)

### Community 54 - "Core schema"
Cohesion: 0.07
Nodes (32): ChannelListing.abcGrade, ChannelListing.adBudgetLimit, ChannelListing.adTier, ChannelListing.brand, ChannelListing.category, ChannelListing.channelAccount, ChannelListing.channelAccountId, ChannelListing.channelName (+24 more)

### Community 55 - "Supply schema"
Cohesion: 0.07
Nodes (31): Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.id, Supplier.leadTimeDays, Supplier.name, Supplier.notes (+23 more)

### Community 56 - "Community 56"
Cohesion: 0.11
Nodes (18): ChannelSyncController, Body, Controller, CurrentOrganization, CurrentUser, Get, Post, CoupangSyncOrderPayload (+10 more)

### Community 57 - "Channels schema"
Cohesion: 0.08
Nodes (31): ChannelScrapeRun.businessDate, ChannelScrapeRun.channel, ChannelScrapeRun.channelAccount, ChannelScrapeRun.channelAccountId, ChannelScrapeRun.clientRunKey, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson (+23 more)

### Community 58 - "Community 58"
Cohesion: 0.13
Nodes (18): asMappingStatus(), availabilityStatusSql(), ChannelSkuMappingRepositoryAdapter, contains(), emptyAvailabilityPageMeta(), lockActiveMasterProducts(), mappingRowSelect(), queueWhere() (+10 more)

### Community 59 - "Community 59"
Cohesion: 0.11
Nodes (18): Inject, ChannelAccountRepositoryAdapter, envelopeToJson(), maskAccessKey(), readCredentialsConfig(), stripLegacyCredentialKeys(), toJsonRecord(), toRecord() (+10 more)

### Community 60 - "AgentOS schema"
Cohesion: 0.08
Nodes (28): AgentOS, AgentAuthorizationEvent.toolId, AgentInstanceToolPolicy.agentInstance, AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentInstanceToolPolicy.dryRunMode, AgentInstanceToolPolicy.effect (+20 more)

### Community 61 - "AgentOS schema"
Cohesion: 0.07
Nodes (28): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.approver, AgentApprovalRequest.approverUserId, AgentApprovalRequest.createdAt, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decidedBy, AgentApprovalRequest.decidedByUserId (+20 more)

### Community 62 - "AgentOS schema"
Cohesion: 0.08
Nodes (28): AgentToolInvocation.agentInstance, AgentToolInvocation.approvalRequest, AgentToolInvocation.approvalRequestId, AgentToolInvocation.capabilityKey, AgentToolInvocation.completedAt, AgentToolInvocation.conversation, AgentToolInvocation.createdAt, AgentToolInvocation.errorCode (+20 more)

### Community 63 - "Community 63"
Cohesion: 0.09
Nodes (22): adapterPaths, BROWSER_COLLECTION_ATTENTION_REASONS, BROWSER_COLLECTION_PRODUCERS, BROWSER_COLLECTION_STATES, BrowserCollectionAttentionReasonSchema, BrowserCollectionClassificationSchema, BrowserCollectionCommand, BrowserCollectionCommandSchema (+14 more)

### Community 64 - "Community 64"
Cohesion: 0.16
Nodes (24): Path, add_code_reference_edges(), add_document_mentions(), add_schema_graph(), camel(), collect_block(), collect_code(), collect_doc_comments() (+16 more)

### Community 65 - "Community 65"
Cohesion: 0.14
Nodes (27): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+19 more)

### Community 66 - "Channels schema"
Cohesion: 0.08
Nodes (27): CoupangWingSalesRankDailySnapshot.businessDate, CoupangWingSalesRankDailySnapshot.capturedAt, CoupangWingSalesRankDailySnapshot.categoryHierarchy, CoupangWingSalesRankDailySnapshot.collectedCount, CoupangWingSalesRankDailySnapshot.conversionRate28d, CoupangWingSalesRankDailySnapshot.createdAt, CoupangWingSalesRankDailySnapshot.id, CoupangWingSalesRankDailySnapshot.itemId (+19 more)

### Community 67 - "Inventory schema"
Cohesion: 0.07
Nodes (27): SellpiaInventoryState.activeGeneration, SellpiaInventoryState.activeSyncLeaseExpiresAt, SellpiaInventoryState.activeSyncOwner, SellpiaInventoryState.activeSyncOwnerUserId, SellpiaInventoryState.activeSyncStartedAt, SellpiaInventoryState.activeSyncToken, SellpiaInventoryState.createdAt, SellpiaInventoryState.failedGeneration (+19 more)

### Community 68 - "Supply schema"
Cohesion: 0.08
Nodes (26): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.externalOrderId, PurchaseOrder.externalOrderPlatform (+18 more)

### Community 69 - "Community 69"
Cohesion: 0.08
Nodes (22): RocketPoCatalogResolution, canonicalArtifactHash(), isCompleteCollection(), boundedText(), isoDay, requiredText(), RocketPoCatalogPublication, RocketPoCatalogPublicationSchema (+14 more)

### Community 70 - "Community 70"
Cohesion: 0.08
Nodes (22): StatisticsCategoryRow, StatisticsCategoryRowSchema, StatisticsDeliveryDaily, StatisticsDeliveryDailySchema, StatisticsDeliveryResponse, StatisticsDeliveryResponseSchema, StatisticsGradeRow, StatisticsGradeRowSchema (+14 more)

### Community 71 - "AgentOS schema"
Cohesion: 0.09
Nodes (24): AgentAuthorizationEvent.action, AgentAuthorizationEvent.actorId, AgentAuthorizationEvent.actorType, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decidedBy, AgentAuthorizationEvent.decidedByUserId, AgentAuthorizationEvent.decision (+16 more)

### Community 72 - "Community 72"
Cohesion: 0.11
Nodes (20): CompletedSourceArtifactRun, CoupangWingCatalogImportResponse, CoupangWingCatalogImportResponseSchema, ImportChanges, SellpiaInventoryImportOutcome, SellpiaInventoryImportOutcomeSchema, SellpiaInventoryImportResponse, SellpiaInventoryImportResponseSchema (+12 more)

### Community 73 - "Community 73"
Cohesion: 0.20
Nodes (8): ChannelDashboardController, Controller, CurrentOrganization, Get, Query, CoupangDateRangeQueryDto, ChannelDashboardService, Injectable

### Community 74 - "Core schema"
Cohesion: 0.10
Nodes (19): CHANNELS_ROOT, REPO_ROOT, MasterProduct.code, MasterProduct.createdAt, MasterProduct.currentStock, MasterProduct.id, MasterProduct.lastImportRun, MasterProduct.lastImportRunId (+11 more)

### Community 75 - "Orders schema"
Cohesion: 0.10
Nodes (23): OrderReturn.channelAccount, OrderReturn.channelAccountId, OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.id (+15 more)

### Community 76 - "Community 76"
Cohesion: 0.11
Nodes (18): IsOptional, IsString, UpdateCoupangAccountSettingsDto, MarketplaceRegistrationDto, IsInt, IsOptional, IsString, IsUUID (+10 more)

### Community 77 - "Community 77"
Cohesion: 0.10
Nodes (6): CoupangProviderPort, ChannelSyncRepositoryPort, OrderSyncDeps, ProductSyncDeps, Inject, Optional

### Community 78 - "Sourcing schema"
Cohesion: 0.11
Nodes (22): Sourcing, SourcingWorkspaceSnapshot.businessDate, SourcingWorkspaceSnapshot.createdAt, SourcingWorkspaceSnapshot.id, SourcingWorkspaceSnapshot.organization, SourcingWorkspaceSnapshot.payload, SourcingWorkspaceSnapshot.scope, SourcingWorkspaceSnapshot.updatedAt (+14 more)

### Community 79 - "Community 79"
Cohesion: 0.13
Nodes (21): assembleCompleteSnapshot(), assertSameManifest(), buildCollectionStatus(), countMedia(), countOptions(), derivePhase(), firstDate(), hashCatalogChunkPayload() (+13 more)

### Community 80 - "AgentOS schema"
Cohesion: 0.10
Nodes (21): AgentArtifact.agentInstance, AgentArtifact.artifactType, AgentArtifact.conversation, AgentArtifact.createdAt, AgentArtifact.href, AgentArtifact.id, AgentArtifact.organization, AgentArtifact.request (+13 more)

### Community 81 - "System schema"
Cohesion: 0.10
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+13 more)

### Community 82 - "Channels schema"
Cohesion: 0.11
Nodes (21): CoupangKeywordRankDailySnapshot.adRank, CoupangKeywordRankDailySnapshot.businessDate, CoupangKeywordRankDailySnapshot.capturedAt, CoupangKeywordRankDailySnapshot.createdAt, CoupangKeywordRankDailySnapshot.id, CoupangKeywordRankDailySnapshot.itemId, CoupangKeywordRankDailySnapshot.keyword, CoupangKeywordRankDailySnapshot.organicRank (+13 more)

### Community 83 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): LiveCommerceBroadcastDailySnapshot.broadcasterId, LiveCommerceBroadcastDailySnapshot.broadcasterName, LiveCommerceBroadcastDailySnapshot.broadcastId, LiveCommerceBroadcastDailySnapshot.businessDate, LiveCommerceBroadcastDailySnapshot.capturedAt, LiveCommerceBroadcastDailySnapshot.coverImageUrl, LiveCommerceBroadcastDailySnapshot.createdAt, LiveCommerceBroadcastDailySnapshot.endedAt (+13 more)

### Community 84 - "Sourcing schema"
Cohesion: 0.11
Nodes (21): ShortsTrendDailySnapshot.businessDate, ShortsTrendDailySnapshot.capturedAt, ShortsTrendDailySnapshot.channelName, ShortsTrendDailySnapshot.commentCount, ShortsTrendDailySnapshot.createdAt, ShortsTrendDailySnapshot.id, ShortsTrendDailySnapshot.keyword, ShortsTrendDailySnapshot.likeCount (+13 more)

### Community 85 - "AI schema"
Cohesion: 0.10
Nodes (21): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.contentWorkspace, ThumbnailAnalysis.contentWorkspaceId, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id (+13 more)

### Community 86 - "Community 86"
Cohesion: 0.12
Nodes (19): InventorySkuSnapshotItem, InventorySkuSnapshotItemSchema, InventorySkuSnapshotListResponse, InventorySkuSnapshotListResponseSchema, InventorySkuSnapshotSummary, InventorySkuSnapshotSummarySchema, InventorySkuStockStatus, InventorySkuStockStatusSchema (+11 more)

### Community 87 - "Community 87"
Cohesion: 0.11
Nodes (13): aggregateMappingStatus(), ChannelListingRepositoryAdapter, contains(), firstPrice(), parseQueryDate(), positiveInteger(), toSummary(), Injectable (+5 more)

### Community 88 - "AgentOS schema"
Cohesion: 0.11
Nodes (20): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.id, AgentCostEvent.inputTokens (+12 more)

### Community 89 - "Finance schema"
Cohesion: 0.12
Nodes (20): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit (+12 more)

### Community 90 - "Orders schema"
Cohesion: 0.11
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 91 - "Sourcing schema"
Cohesion: 0.12
Nodes (20): Sourcing1688HotProductDailySnapshot.businessDate, Sourcing1688HotProductDailySnapshot.capturedAt, Sourcing1688HotProductDailySnapshot.createdAt, Sourcing1688HotProductDailySnapshot.id, Sourcing1688HotProductDailySnapshot.imageUrl, Sourcing1688HotProductDailySnapshot.monthlySales, Sourcing1688HotProductDailySnapshot.offerId, Sourcing1688HotProductDailySnapshot.organization (+12 more)

### Community 92 - "Community 92"
Cohesion: 0.10
Nodes (18): SupplierHistoryItem, SupplierHistoryItemSchema, SupplierHistoryReport, SupplierHistoryReportSchema, SupplierHistorySummary, SupplierHistorySummarySchema, SupplierProductSalesReport, SupplierProductSalesReportSchema (+10 more)

### Community 93 - "Community 93"
Cohesion: 0.11
Nodes (9): ChannelAccountListController, Controller, CurrentOrganization, Get, ChannelAccountRepositoryPort, ChannelAccountQueryService, Inject, Injectable (+1 more)

### Community 94 - "Community 94"
Cohesion: 0.12
Nodes (15): ChannelListingController, Controller, CurrentOrganization, Get, Param, Query, ChannelListingQueryDto, IsIn (+7 more)

### Community 95 - "Community 95"
Cohesion: 0.16
Nodes (11): assertCanonicalCoupangAccountIdentity(), canonicalParentRows(), ChannelCatalogImportRepositoryAdapter, importResponse(), isUniqueConstraintError(), nextPublicationSequence(), Injectable, zeroChanges() (+3 more)

### Community 96 - "AgentOS schema"
Cohesion: 0.12
Nodes (19): AgentRun.taskSessionId, AgentRunRequest.taskSessionId, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.id, AgentTaskSession.lastError, AgentTaskSession.lastRun (+11 more)

### Community 97 - "Supply schema"
Cohesion: 0.12
Nodes (19): PurchaseOrderSubmissionAttempt.createdAt, PurchaseOrderSubmissionAttempt.errorCode, PurchaseOrderSubmissionAttempt.errorMessage, PurchaseOrderSubmissionAttempt.freshnessGeneration, PurchaseOrderSubmissionAttempt.id, PurchaseOrderSubmissionAttempt.idempotencyKey, PurchaseOrderSubmissionAttempt.organization, PurchaseOrderSubmissionAttempt.providerReference (+11 more)

### Community 98 - "Inventory schema"
Cohesion: 0.12
Nodes (19): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.masterProduct, ReturnTransfer.masterProductId, ReturnTransfer.notes (+11 more)

### Community 99 - "Community 99"
Cohesion: 0.15
Nodes (14): PRODUCT_LIFECYCLE_STATES, ProductLifecycleState, ProductLifecycleStateSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, MasterImageItem, MasterImageItemSchema, MasterImageRole (+6 more)

### Community 100 - "Community 100"
Cohesion: 0.22
Nodes (17): analyzePrReleaseContract(), changedFilesFromGit(), classifyFiles(), compareSemver(), ghPrBody(), git(), hasReleaseDecision(), isDevelopToMainPromotion() (+9 more)

### Community 101 - "Community 101"
Cohesion: 0.16
Nodes (11): ProductRegistrationSubmissionCapabilityInput, ResolveProductRegistrationCapabilityInput, asRecord(), extractNestedSellerProductId(), isExplicitProviderRejection(), listingPayloadFromFrozenSubmission(), MarketplaceRegistrationService, recordedMarketplaceResult() (+3 more)

### Community 102 - "Community 102"
Cohesion: 0.13
Nodes (11): ChannelAccountController, Body, Controller, CurrentOrganization, Get, CoupangCredentials, ChannelAccountService, Injectable (+3 more)

### Community 103 - "Community 103"
Cohesion: 0.13
Nodes (8): Inject, ChannelSkuAvailabilityPort, ChannelSkuMappingListQuery, ChannelSkuAvailabilityService, hydrateChannelSkuAvailabilityRows(), Injectable, ChannelSkuStockComponent, projectChannelSkuSellableStock()

### Community 104 - "Community 104"
Cohesion: 0.11
Nodes (16): CurrentOrganization, Get, Query, AVAILABILITY_STATUSES, ChannelSkuAvailabilityQueryDto, IsIn, IsInt, IsOptional (+8 more)

### Community 105 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.id, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.lastRunId (+10 more)

### Community 106 - "AI schema"
Cohesion: 0.12
Nodes (18): ContentAsset.originGenerationGroupId, ContentGeneration.generationGroupId, ContentGenerationGroup.baseContentGeneration, ContentGenerationGroup.baseContentGenerationId, ContentGenerationGroup.contentWorkspace, ContentGenerationGroup.contentWorkspaceId, ContentGenerationGroup.createdAt, ContentGenerationGroup.createdByUserId (+10 more)

### Community 107 - "Sourcing schema"
Cohesion: 0.14
Nodes (18): LiveCommerceProductDailySnapshot.broadcastId, LiveCommerceProductDailySnapshot.businessDate, LiveCommerceProductDailySnapshot.capturedAt, LiveCommerceProductDailySnapshot.createdAt, LiveCommerceProductDailySnapshot.id, LiveCommerceProductDailySnapshot.imageUrl, LiveCommerceProductDailySnapshot.organization, LiveCommerceProductDailySnapshot.priceCny (+10 more)

### Community 108 - "Sourcing schema"
Cohesion: 0.13
Nodes (18): NaverKeywordDailySnapshot.averageAdRank, NaverKeywordDailySnapshot.businessDate, NaverKeywordDailySnapshot.capturedAt, NaverKeywordDailySnapshot.competitionIndex, NaverKeywordDailySnapshot.createdAt, NaverKeywordDailySnapshot.id, NaverKeywordDailySnapshot.keyword, NaverKeywordDailySnapshot.monthlyMobileSearchCount (+10 more)

### Community 109 - "Channels schema"
Cohesion: 0.12
Nodes (18): RocketPurchaseOrder.businessDate, RocketPurchaseOrder.centerName, RocketPurchaseOrder.createdAt, RocketPurchaseOrder.firstSkuName, RocketPurchaseOrder.id, RocketPurchaseOrder.items, RocketPurchaseOrder.orderAmount, RocketPurchaseOrder.orderedAt (+10 more)

### Community 110 - "Community 110"
Cohesion: 0.11
Nodes (16): CANCEL_OPERATION_TARGET_TYPES, CancelOperationAffected, CancelOperationAffectedSchema, CancelOperationPreserved, CancelOperationPreservedSchema, CancelOperationResponse, CancelOperationResponseSchema, CancelOperationStatus (+8 more)

### Community 111 - "Community 111"
Cohesion: 0.22
Nodes (18): assertCurrentRebuildBinding(), assertProtectedApiDestination(), assertReplayCounts(), assertReplayFactDigest(), bootstrap(), buildSharedBootstrapPlan(), cliValue(), createPrisma() (+10 more)

### Community 112 - "Community 112"
Cohesion: 0.19
Nodes (5): ChannelsSellpiaMasterProductReadAdapter, Inject, Injectable, ChannelsSellpiaMasterProductReadPort, CandidateSellpiaMasterProduct

### Community 113 - "Community 113"
Cohesion: 0.23
Nodes (5): Inject, ChannelCatalogCollectionPort, ChannelCatalogCollectionService, parseRequest(), Injectable

### Community 114 - "AgentOS schema"
Cohesion: 0.15
Nodes (16): AgentRunEvent.agentInstance, AgentRunEvent.createdAt, AgentRunEvent.data, AgentRunEvent.id, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent.message, AgentRunEvent.organization (+8 more)

### Community 115 - "Channels schema"
Cohesion: 0.16
Nodes (16): ChannelScrapeChunk.checksum, ChannelScrapeChunk.createdAt, ChannelScrapeChunk.id, ChannelScrapeChunk.itemCount, ChannelScrapeChunk.kind, ChannelScrapeChunk.organization, ChannelScrapeChunk.payload, ChannelScrapeChunk.publicationJson (+8 more)

### Community 116 - "Advertising schema"
Cohesion: 0.13
Nodes (16): ExecutionTask.action, ExecutionTask.actionId, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt, ExecutionTask.errorMessage, ExecutionTask.finishedAt (+8 more)

### Community 117 - "Inventory schema"
Cohesion: 0.13
Nodes (16): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.masterProduct, PickingItem.masterProductId, PickingItem.organization (+8 more)

### Community 118 - "Inventory schema"
Cohesion: 0.15
Nodes (16): PickingItem.pickingListId, PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.id, PickingList.listNumber, PickingList.organization, PickingList.pickedItems (+8 more)

### Community 119 - "Inventory schema"
Cohesion: 0.13
Nodes (15): SellpiaReceiptUploadBatch.createdAt, SellpiaReceiptUploadBatch.createdBy, SellpiaReceiptUploadBatch.id, SellpiaReceiptUploadBatch.metaJson, SellpiaReceiptUploadBatch.note, SellpiaReceiptUploadBatch.organization, SellpiaReceiptUploadBatch.sourceRef, SellpiaReceiptUploadBatch.sourceType (+7 more)

### Community 120 - "Supply schema"
Cohesion: 0.13
Nodes (16): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.dueDate, SupplierPayment.id, SupplierPayment.notes, SupplierPayment.organization, SupplierPayment.paidAmount, SupplierPayment.paidDate (+8 more)

### Community 121 - "Community 121"
Cohesion: 0.24
Nodes (14): analyzeReconstructionTriggers(), changedFilesFromGit(), ghPrBody(), git(), isCrossLayerControlChange(), isHighRiskBoundary(), isLargeServiceOrComponent(), layerOf() (+6 more)

### Community 122 - "Community 122"
Cohesion: 0.28
Nodes (10): ChannelCatalogCollectionController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+2 more)

### Community 123 - "Community 123"
Cohesion: 0.20
Nodes (10): ChannelSkuMappingController, Body, Controller, CurrentOrganization, CurrentUser, Get, Param, Post (+2 more)

### Community 124 - "Community 124"
Cohesion: 0.22
Nodes (7): ChannelCatalogCollectionRepositoryAdapter, isUniqueConstraintError(), ownedRunWhere(), Injectable, ChannelCatalogCollectionRunRecord, ChannelCatalogCollectionWithChunks, startRun()

### Community 125 - "Community 125"
Cohesion: 0.13
Nodes (3): ChannelSkuMappingRepositoryPort, Inject, Inject

### Community 126 - "Finance schema"
Cohesion: 0.14
Nodes (15): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description (+7 more)

### Community 127 - "Orders schema"
Cohesion: 0.14
Nodes (15): CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing (+7 more)

### Community 128 - "System schema"
Cohesion: 0.14
Nodes (15): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.error, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.name (+7 more)

### Community 129 - "Sourcing schema"
Cohesion: 0.17
Nodes (15): NaverPopularKeywordDailySnapshot.boardKey, NaverPopularKeywordDailySnapshot.boardLabel, NaverPopularKeywordDailySnapshot.businessDate, NaverPopularKeywordDailySnapshot.capturedAt, NaverPopularKeywordDailySnapshot.cid, NaverPopularKeywordDailySnapshot.createdAt, NaverPopularKeywordDailySnapshot.id, NaverPopularKeywordDailySnapshot.keyword (+7 more)

### Community 130 - "Finance schema"
Cohesion: 0.14
Nodes (15): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.id, ProcessingCost.master, ProcessingCost.notes, ProcessingCost.organization, ProcessingCost.processType, ProcessingCost.productName (+7 more)

### Community 131 - "Orders schema"
Cohesion: 0.14
Nodes (11): Review.content, Review.createdAt, Review.id, Review.listing, Review.organization, Review.platform, Review.rating, Review.reviewedAt (+3 more)

### Community 132 - "Finance schema"
Cohesion: 0.15
Nodes (15): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.organization, SalesPlan.period (+7 more)

### Community 133 - "Inventory schema"
Cohesion: 0.15
Nodes (15): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items, StockAudit.matchedCount (+7 more)

### Community 134 - "Advertising schema"
Cohesion: 0.15
Nodes (14): ExecutionTask.workerId, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentTaskRef, ExecutionWorker.currentUrl, ExecutionWorker.id, ExecutionWorker.label, ExecutionWorker.lastHeartbeatAt (+6 more)

### Community 135 - "Community 135"
Cohesion: 0.20
Nodes (11): SELLPIA_WORKBOOK_ACCEPT, SELLPIA_WORKBOOK_FILE_EXTENSIONS, SellpiaReceiptBatchCreateInput, SellpiaReceiptBatchCreateInputSchema, SellpiaReceiptBatchMarkUploadedInput, SellpiaReceiptBatchMarkUploadedInputSchema, SellpiaReceiptUploadBatch, SellpiaReceiptUploadBatchSchema (+3 more)

### Community 136 - "Community 136"
Cohesion: 0.25
Nodes (14): assertPositiveIntegerText(), assertSharedDatabaseIdentity(), assertUuid(), buildChannelAccountFingerprint(), buildCoupangReplayBundle(), buildCoupangReplayScope(), computeReplayFactDigest(), databaseProjectRef() (+6 more)

### Community 137 - "Community 137"
Cohesion: 0.23
Nodes (11): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), main(), parseBaseline(), readFiles(), repoRoot(), walk() (+3 more)

### Community 138 - "Community 138"
Cohesion: 0.19
Nodes (12): ChannelSkuCandidateQueryDto, ChannelSkuMappingQueryDto, MAPPING_STATUSES, IsIn, IsInt, IsOptional, IsPositive, IsString (+4 more)

### Community 139 - "Community 139"
Cohesion: 0.17
Nodes (6): ChannelsOperationAlertAdapter, Inject, Injectable, OperationAlertPort, OperationLifecyclePatch, StartOperationAlertInput

### Community 140 - "Channels schema"
Cohesion: 0.19
Nodes (13): CoupangKeywordSerpDailySnapshot.businessDate, CoupangKeywordSerpDailySnapshot.capturedAt, CoupangKeywordSerpDailySnapshot.createdAt, CoupangKeywordSerpDailySnapshot.id, CoupangKeywordSerpDailySnapshot.itemCount, CoupangKeywordSerpDailySnapshot.items, CoupangKeywordSerpDailySnapshot.keyword, CoupangKeywordSerpDailySnapshot.organization (+5 more)

### Community 141 - "Channels schema"
Cohesion: 0.18
Nodes (13): RocketSupplyDailySnapshot.businessDate, RocketSupplyDailySnapshot.createdAt, RocketSupplyDailySnapshot.id, RocketSupplyDailySnapshot.itemQty, RocketSupplyDailySnapshot.organization, RocketSupplyDailySnapshot.poCount, RocketSupplyDailySnapshot.rawJson, RocketSupplyDailySnapshot.revenueKrw (+5 more)

### Community 142 - "Community 142"
Cohesion: 0.29
Nodes (13): asRecord(), assertNoPii(), buildReplayBody(), buildReplayKpis(), cloneReplayValue(), containsPiiValue(), copyString(), dateOnly() (+5 more)

### Community 143 - "Community 143"
Cohesion: 0.31
Nodes (11): analyzeSchemaArtifactSync(), changedFilesFromGit(), changedFilesFromWorkingTree(), GENERATED_ARTIFACT_PATHS, git(), main(), matchesAnyPath(), mergeChangedFiles() (+3 more)

### Community 144 - "Community 144"
Cohesion: 0.20
Nodes (5): ChannelSyncRepositoryAdapter, Injectable, CoupangSyncReturnPayload, ProductListingSyncResult, syncSingleCoupangReturn()

### Community 145 - "Channels schema"
Cohesion: 0.20
Nodes (12): CoupangKeywordTracker.createdAt, CoupangKeywordTracker.enabled, CoupangKeywordTracker.id, CoupangKeywordTracker.keyword, CoupangKeywordTracker.lastCapturedAt, CoupangKeywordTracker.maxPages, CoupangKeywordTracker.organization, CoupangKeywordTracker.updatedAt (+4 more)

### Community 146 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 147 - "Community 147"
Cohesion: 0.26
Nodes (9): DETAIL_IMAGE_COUNTS, DETAIL_PAGE_AGE_GROUPS, DETAIL_PAGE_TEMPLATE_IDS, DetailImageCount, DetailImageCountSchema, DetailPageAgeGroup, DetailPageAgeGroupSchema, DetailPageTemplateId (+1 more)

### Community 148 - "Community 148"
Cohesion: 0.30
Nodes (12): assertAllowedRecord(), assertAllowedRows(), assertAllowedScalarRecord(), assertOptionalScalar(), assertPlainRecord(), assertReplayBundle(), assertReplayFactCounts(), assertReplayKpis() (+4 more)

### Community 149 - "Community 149"
Cohesion: 0.18
Nodes (5): MarketplaceRegistrationRepositoryAdapter, Injectable, MarketplaceRegistrationRepositoryPort, Inject, Optional

### Community 150 - "Advertising schema"
Cohesion: 0.20
Nodes (10): Advertising, ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.id, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.url (+2 more)

### Community 151 - "System schema"
Cohesion: 0.20
Nodes (11): ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization, ActivityEvent.source (+3 more)

### Community 152 - "System schema"
Cohesion: 0.20
Nodes (10): FeatureGate.allowedOrganizations, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name, FeatureGate.updatedAt (+2 more)

### Community 153 - "Supply schema"
Cohesion: 0.20
Nodes (11): PurchaseOrderItem.createdAt, PurchaseOrderItem.id, PurchaseOrderItem.masterProduct, PurchaseOrderItem.masterProductId, PurchaseOrderItem.order, PurchaseOrderItem.organization, PurchaseOrderItem.productName, PurchaseOrderItem.quantity (+3 more)

### Community 154 - "Community 154"
Cohesion: 0.18
Nodes (11): assertLocalRebuildGuard(), assertSharedRebuildGuard(), guardFromCli(), assertLocalDevelopmentDatabase(), bootstrapAuthoritativeInventoryDevelopment(), buildBootstrapPlan(), LOCAL_HOSTS, main() (+3 more)

### Community 155 - "Community 155"
Cohesion: 0.35
Nodes (9): analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), directOutPortFiles(), FORBIDDEN_IN_PORT_FOLDER_NAMES, forbiddenInPortCallerFolders(), listDirectories(), listFiles(), main() (+1 more)

### Community 156 - "Community 156"
Cohesion: 0.31
Nodes (9): addUnique(), defaultOutputDir, defaultSourceDir, normalizeKiditemOrigin(), patchExtensionRuntimeFiles(), patchManifest(), prepareCoupangExtension(), repoRoot (+1 more)

### Community 157 - "Community 157"
Cohesion: 0.20
Nodes (5): RocketPoCatalogRepositoryAdapter, Injectable, RocketPoCatalogIdentity, RocketPoCatalogRepositoryPort, Inject

### Community 158 - "Community 158"
Cohesion: 0.31
Nodes (8): AutomaticMatchEvidence, AutomaticMatchMaster, ChannelSkuAutomaticMatch, matched(), normalizedBarcode(), normalizedValue(), resolveChannelSkuAutomaticMatch(), activeMasters

### Community 159 - "Advertising schema"
Cohesion: 0.22
Nodes (10): ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task, ExecutionLog.taskId (+2 more)

### Community 160 - "Community 160"
Cohesion: 0.20
Nodes (8): ReviewFilter, ReviewFilterSchema, ReviewListItem, ReviewListItemSchema, ReviewListResponse, ReviewListResponseSchema, ReviewSummary, ReviewSummarySchema

### Community 161 - "Community 161"
Cohesion: 0.49
Nodes (6): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), scrubDeep(), scrubSecrets(), walk()

### Community 162 - "Community 162"
Cohesion: 0.22
Nodes (8): upsertChannelCatalogIdentities(), flattenMedia(), upsertCoupangCatalogRows(), nextPublicationSequence(), productsFromRows(), resolveIdentities(), toCompletedRun(), zeroChanges()

### Community 163 - "Community 163"
Cohesion: 0.22
Nodes (5): ChannelCatalogPublicationRepositoryAdapter, Inject, Injectable, CatalogMediaPublicationPort, ChannelCatalogPublicationPort

### Community 166 - "Community 166"
Cohesion: 0.22
Nodes (7): ReadinessCheck, ReadinessCheckSchema, ReadinessCheckStatusSchema, ReadinessResponse, ReadinessResponseSchema, RebuildReadinessResponse, RebuildReadinessResponseSchema

### Community 167 - "Community 167"
Cohesion: 0.47
Nodes (7): checkClaudeShims(), checkTrackedClaudeDirectory(), findStaleInstructionLines(), git(), listTracked(), main(), runChecks()

### Community 168 - "Community 168"
Cohesion: 0.36
Nodes (7): ParsedArgs, parseRawArgs(), ParseRawArgsOptions, pushValue(), values(), COMMANDS, makeArgs()

### Community 169 - "Community 169"
Cohesion: 0.32
Nodes (7): completeCollectionRun(), completedCollectionResult(), jsonRecord(), nextPublicationSequence(), numberRecord(), zeroChanges(), ChannelCatalogPublicationResult

### Community 171 - "Community 171"
Cohesion: 0.25
Nodes (6): AgentCatalogItem, ConfigurableParam, ConfigurableParamSchema, MarketplaceCatalogItem, MarketplaceCatalogItemSchema, WorkflowCatalogItem

### Community 172 - "Community 172"
Cohesion: 0.46
Nodes (6): analyzeInventory(), listTopLevelScriptFiles(), main(), repoRoot(), SCRIPT_INVENTORY, SUPPORT_FILES

### Community 173 - "Community 173"
Cohesion: 0.29
Nodes (5): AuthRequiredErrorBody, AuthUserPublic, AuthUserPublicSchema, LoginRequest, LoginRequestSchema

### Community 174 - "Community 174"
Cohesion: 0.29
Nodes (5): deletedLegacyTables, repoRoot, retiredBaselineScript, retiredImporterFile, retiredPlannerFile

### Community 175 - "Community 175"
Cohesion: 0.33
Nodes (5): assertActiveCoupangAccount(), assertCanonicalAccount(), lockAccount(), lockCollectionRun(), ChannelCatalogChunkPublicationResult

### Community 176 - "Community 176"
Cohesion: 0.33
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 177 - "Community 177"
Cohesion: 0.33
Nodes (4): SettlementReconcileDetail, SettlementReconcileDetailSchema, SettlementReconcileResponse, SettlementReconcileResponseSchema

### Community 179 - "Community 179"
Cohesion: 0.50
Nodes (4): fileHash(), importInput(), makeRow(), representativeRows()

### Community 185 - "Community 185"
Cohesion: 0.50
Nodes (4): is_allowlisted(), is_comment_line(), load_file_lines(), check-tenant-scope.sh script

### Community 186 - "Community 186"
Cohesion: 1.00
Nodes (3): makeRepository(), runRecord(), runWithChunks()

### Community 187 - "Community 187"
Cohesion: 0.67
Nodes (3): extractEnvKeys(), readModelFile(), redactEnvValues()

## Knowledge Gaps
- **2155 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+2150 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Core schema` to `prisma field: prisma — Shared Schema`, `Community 1`, `AgentOS schema`, `Community 3`, `Orders schema`, `System schema`, `AI schema`, `prisma field: AdAction.externalId`, `Channels schema`, `Advertising schema`, `Community 13`, `Channels schema`, `Community 15`, `Community 16`, `Core schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Sourcing schema`, `Core schema`, `AI schema`, `Core schema`, `AI schema`, `System schema`, `AI schema`, `Sourcing schema`, `AI schema`, `Channels schema`, `Finance schema`, `Orders schema`, `Community 44`, `AI schema`, `AI schema`, `Community 48`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `Inventory schema`, `Core schema`, `Supply schema`, `Channels schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `Core schema`, `Orders schema`, `Sourcing schema`, `AgentOS schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `Finance schema`, `Orders schema`, `Sourcing schema`, `AgentOS schema`, `Supply schema`, `Inventory schema`, `AgentOS schema`, `AI schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Finance schema`, `Orders schema`, `Sourcing schema`, `Finance schema`, `Orders schema`, `Finance schema`, `Inventory schema`, `Advertising schema`, `Channels schema`, `Channels schema`, `Channels schema`, `Advertising schema`, `System schema`, `System schema`, `Supply schema`?**
  _High betweenness centrality (0.214) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `AgentOS schema` to `prisma field: prisma — Shared Schema`, `Orders schema`, `System schema`, `AI schema`, `prisma field: AdAction.externalId`, `Channels schema`, `Advertising schema`, `Channels schema`, `Core schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Sourcing schema`, `Core schema`, `AI schema`, `Core schema`, `AI schema`, `System schema`, `AI schema`, `Sourcing schema`, `AI schema`, `Channels schema`, `Finance schema`, `Orders schema`, `AI schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `Core schema`, `Inventory schema`, `Core schema`, `Core schema`, `Supply schema`, `Channels schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Channels schema`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `Core schema`, `Orders schema`, `Sourcing schema`, `AgentOS schema`, `System schema`, `Channels schema`, `Sourcing schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `Finance schema`, `Orders schema`, `Sourcing schema`, `AgentOS schema`, `Supply schema`, `Inventory schema`, `AgentOS schema`, `AI schema`, `Sourcing schema`, `Sourcing schema`, `Channels schema`, `AgentOS schema`, `Channels schema`, `Advertising schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Finance schema`, `Orders schema`, `System schema`, `Sourcing schema`, `Finance schema`, `Orders schema`, `Finance schema`, `Inventory schema`, `Advertising schema`, `Channels schema`, `Channels schema`, `Channels schema`, `System schema`, `Advertising schema`, `System schema`, `System schema`, `Supply schema`, `Advertising schema`?**
  _High betweenness centrality (0.187) - this node is a cross-community bridge._
- **Why does `Order` connect `Orders schema` to `prisma field: prisma — Shared Schema`, `Community 1`, `AgentOS schema`, `Orders schema`, `System schema`, `Community 6`, `prisma field: AdAction.externalId`, `Community 137`, `Community 11`, `Community 12`, `Community 13`, `Community 143`, `Community 16`, `Community 17`, `Core schema`, `Advertising schema`, `AI schema`, `Community 155`, `Core schema`, `Community 31`, `Community 36`, `Finance schema`, `Orders schema`, `Community 44`, `Community 48`, `Core schema`, `Community 63`, `Community 70`, `Core schema`, `Orders schema`, `Community 76`, `Community 99`, `Orders schema`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Are the 141 inferred relationships involving `Organization` (e.g. with `channel-account.controller.ts` and `channel-account-list.controller.ts`) actually correct?**
  _`Organization` has 141 INFERRED edges - model-reasoned connections that need verification._
- **Are the 107 inferred relationships involving `ChannelAccount` (e.g. with `channel-account.controller.ts` and `channel-account-list.controller.ts`) actually correct?**
  _`ChannelAccount` has 107 INFERRED edges - model-reasoned connections that need verification._
- **Are the 98 inferred relationships involving `Order` (e.g. with `channel-sync.controller.ts` and `index.ts`) actually correct?**
  _`Order` has 98 INFERRED edges - model-reasoned connections that need verification._
- **Are the 60 inferred relationships involving `ChannelListing` (e.g. with `channel-registration-capability.adapter.ts` and `channel-listing.controller.ts`) actually correct?**
  _`ChannelListing` has 60 INFERRED edges - model-reasoned connections that need verification._