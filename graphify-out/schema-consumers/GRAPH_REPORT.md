# Graph Report - schema-consumers  (2026-05-14)

## Corpus Check
- 191 files · ~88,241 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2032 nodes · 7802 edges · 96 communities (92 shown, 4 thin omitted)
- Extraction: 47% EXTRACTED · 53% INFERRED · 0% AMBIGUOUS · INFERRED: 4125 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file ads.ts|code file: ads.ts]]
- [[_COMMUNITY_code file generate-prisma-erd.mjs|code file: generate-prisma-erd.mjs]]
- [[_COMMUNITY_code file fs.ts|code file: fs.ts]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_prisma field MasterProduct.barcode|prisma field: MasterProduct.barcode]]
- [[_COMMUNITY_code file dev-data.ts|code file: dev-data.ts]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_code file dev-data-coupang.ts|code file: dev-data-coupang.ts]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_code file check-directory-architecture.mjs|code file: check-directory-architecture.mjs]]
- [[_COMMUNITY_prisma field Thumbnail.organization|prisma field: Thumbnail.organization]]
- [[_COMMUNITY_code file run-data-migrations.ts|code file: run-data-migrations.ts]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Sourcing schema|Sourcing schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file Order.status|code file: Order.status]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_prisma field channel-sync-return.service.ts|prisma field: channel-sync-return.service.ts]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_prisma field BusinessRule.organization|prisma field: BusinessRule.organization]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_code file sources.ts|code file: sources.ts]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_code file dev-data-profiles.spec.ts|code file: dev-data-profiles.spec.ts]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_code file removed-legacy-scripts.spec.ts|code file: removed-legacy-scripts.spec.ts]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file patterns.ts|code file: patterns.ts]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file coupang-client.ts|code file: coupang-client.ts]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_code file prepare-coupang-extension.mjs|code file: prepare-coupang-extension.mjs]]
- [[_COMMUNITY_code file channel-credential-crypto.ts|code file: channel-credential-crypto.ts]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file channel-dashboard.ts|code file: channel-dashboard.ts]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_prisma field Alert.organization|prisma field: Alert.organization]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_code file check-agents-hygiene.mjs|code file: check-agents-hygiene.mjs]]
- [[_COMMUNITY_code file common.ts|code file: common.ts]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_code file ai.ts|code file: ai.ts]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_code file seed-agent-os.spec.ts|code file: seed-agent-os.spec.ts]]
- [[_COMMUNITY_code file inspection.ts|code file: inspection.ts]]
- [[_COMMUNITY_code file readiness.ts|code file: readiness.ts]]
- [[_COMMUNITY_code file thumbnails.spec.ts|code file: thumbnails.spec.ts]]
- [[_COMMUNITY_code file lifecycle-state.ts|code file: lifecycle-state.ts]]
- [[_COMMUNITY_code file coupang-date-range.dto.ts|code file: coupang-date-range.dto.ts]]
- [[_COMMUNITY_code file codes.ts|code file: codes.ts]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 215 edges
2. `Organization` - 187 edges
3. `Inventory` - 178 edges
4. `ChannelReconciliationRun` - 169 edges
5. `ChannelReconciliationService` - 169 edges
6. `ChannelSyncService` - 134 edges
7. `ActionTask` - 109 edges
8. `ChannelAccountService` - 108 edges
9. `ChannelDashboardService` - 107 edges
10. `prisma — Shared Schema` - 105 edges
11. `CoupangProviderPort` - 97 edges
12. `channels — Marketplace Sync And Reconciliation` - 96 edges

## Surprising Connections (you probably didn't know these)
- `ReconciliationRow` --references_field--> `AdAction.externalId`  [INFERRED]
  packages/shared/src/schemas/channel-reconciliation.ts → prisma/models/advertising.prisma
- `ChannelReconciliationService` --references_field--> `AdAction.externalId`  [INFERRED]
  apps/server/src/channels/application/service/channel-reconciliation.service.ts → prisma/models/advertising.prisma
- `ChannelAccountController` --references_field--> `AdAction.organization`  [INFERRED]
  apps/server/src/channels/adapter/in/http/channel-account.controller.ts → prisma/models/advertising.prisma
- `ChannelDashboardController` --references_field--> `AdAction.organization`  [INFERRED]
  apps/server/src/channels/adapter/in/http/channel-dashboard.controller.ts → prisma/models/advertising.prisma
- `ChannelReconciliationController` --references_field--> `AdAction.organization`  [INFERRED]
  apps/server/src/channels/adapter/in/http/channel-reconciliation.controller.ts → prisma/models/advertising.prisma
- `ReconciliationRow` --references_field--> `AdAction.organization`  [INFERRED]
  packages/shared/src/schemas/channel-reconciliation.ts → prisma/models/advertising.prisma
- `CoupangProviderAdapter` --references_field--> `AdAction.organization`  [INFERRED]
  apps/server/src/channels/adapter/out/coupang/coupang-provider.adapter.ts → prisma/models/advertising.prisma
- `CoupangProviderPort` --references_field--> `AdAction.organization`  [INFERRED]
  apps/server/src/channels/application/port/out/coupang-provider.port.ts → prisma/models/advertising.prisma

## Communities (96 total, 4 thin omitted)

### Community 0 - "Core schema"
Cohesion: 0.15
Nodes (92): ChannelsModule, CoupangProviderAdapter, prisma — Shared Schema, CoupangReconciliationRowDto, CoupangReconciliationScanDto, ActivityEvent.organization, AgentApprovalRequest.organization, AgentAuthorizationEvent.organization (+84 more)

### Community 1 - "Core schema"
Cohesion: 0.05
Nodes (68): AdAction.externalId, AdAction.listing, ChannelAdTargetDailySnapshot.externalId, ChannelAdTargetDailySnapshot.listing, ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt, ChannelListing.deliveryChargeType (+60 more)

### Community 2 - "Supply schema"
Cohesion: 0.04
Nodes (63): Supply, ChannelListing.master, MasterSupplierProduct.createdAt, MasterSupplierProduct.isPrimary, MasterSupplierProduct.updatedAt, OrderLineItem.option, PurchaseOrder.createdAt, PurchaseOrder.defectAction (+55 more)

### Community 3 - "Orders schema"
Cohesion: 0.06
Nodes (55): externalOptionId canonical option identity, vendorItemId provider term, Database ERD, ActionTask.targetId, AdAction.targetType, AgentApprovalRequest.agentInstance, AgentAuthorizationEvent.agentInstance, AgentCostEvent.agentInstance (+47 more)

### Community 4 - "code file: ads.ts"
Cohesion: 0.04
Nodes (53): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot, AdCollectStatus (+45 more)

### Community 5 - "code file: generate-prisma-erd.mjs"
Cohesion: 0.07
Nodes (44): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, __dirname, extractDocValue() (+36 more)

### Community 6 - "code file: fs.ts"
Cohesion: 0.09
Nodes (46): appendValues(), commandExport(), referenceTypeFor(), createZipArchive(), execFileAsync, extractZipArchive(), databaseUrl(), assertRestoreConfirmation() (+38 more)

### Community 7 - "Advertising schema"
Cohesion: 0.05
Nodes (48): packages/shared — @kiditem/shared, Advertising, AdAction.actionType, AdAction.adTargetDaily, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson (+40 more)

### Community 8 - "prisma field: MasterProduct.barcode"
Cohesion: 0.06
Nodes (39): MasterProduct.barcode, MasterProduct.isDeleted, row, clean(), HardConflict, KiditemPlan, NAME_FIELDS, normalizeForGroup() (+31 more)

### Community 9 - "code file: dev-data.ts"
Cohesion: 0.11
Nodes (46): AdapterCommand, appendProjectReferenceDefaults(), archiveFileName(), archiveShaFileName(), BundleManifest, BundlePackageIndex, BundlePayload, BundleReference (+38 more)

### Community 10 - "Inventory schema"
Cohesion: 0.06
Nodes (40): CSRecord.order, OrderLineItem.listingOption, PickingItem.orderId, ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.disposedQty, ReturnTransfer.option, ReturnTransfer.processedBy (+32 more)

### Community 11 - "code file: dev-data-coupang.ts"
Cohesion: 0.12
Nodes (39): appendFlag(), appendOption(), commandReplay(), commandSanitize(), apiHeaders(), apiUrl(), assertSafeDatasetId(), buildCoupangImageSyncRowsForListings() (+31 more)

### Community 12 - "AgentOS schema"
Cohesion: 0.05
Nodes (39): AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentInstanceToolPolicy, AdMetricsDetail, AdMetricsDetailSchema, AlertItemDashboard, DailyAdItem (+31 more)

### Community 13 - "Inventory schema"
Cohesion: 0.05
Nodes (39): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.reorderPoint, Inventory.reorderQuantity, Inventory.reservedStock (+31 more)

### Community 14 - "Orders schema"
Cohesion: 0.08
Nodes (21): ChannelListingOption.isUnmatched, ChannelReconciliationItem.legacyCode, MasterProduct.legacyCode, OrderReturnLineItem.createdAt, OrderReturnLineItem.productName, OrderReturnLineItem, Tx, collectIds() (+13 more)

### Community 15 - "Channels schema"
Cohesion: 0.05
Nodes (38): ChannelReconciliationItem.channelProductName, ChannelReconciliationItem.confidence, ChannelReconciliationItem.ignoredReason, ChannelReconciliationItem.lastObservedAt, ChannelReconciliationItem.linkedListingId, ChannelReconciliationItem.linkedMasterProductId, ChannelReconciliationItem.matchReason, ChannelReconciliationItem.resolutionSource (+30 more)

### Community 16 - "AI schema"
Cohesion: 0.05
Nodes (38): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.measuredAt, Thumbnail.prevClickRate, Thumbnail.status, Thumbnail.strategy (+30 more)

### Community 17 - "code file: check-directory-architecture.mjs"
Cohesion: 0.08
Nodes (28): git(), analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), listDirectories(), analyzeReconstructionTriggers(), ghPrBody(), isCrossLayerControlChange(), missingBodyFields() (+20 more)

### Community 18 - "prisma field: Thumbnail.organization"
Cohesion: 0.07
Nodes (35): Thumbnail.organization, UnshippedItem.organization, BundleComponentSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, Master, MasterImageItem, MasterImageItemSchema (+27 more)

### Community 19 - "code file: run-data-migrations.ts"
Cohesion: 0.11
Nodes (32): DATA_MIGRATION_RELEASES, MigrationResult, Args, Command, COMMANDS, commandStatus(), appReleaseVersion(), assertApplyDataMigrationsConfirmation() (+24 more)

### Community 20 - "AgentOS schema"
Cohesion: 0.06
Nodes (34): AgentRun.adapterType, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt, AgentRun.heartbeatAt (+26 more)

### Community 21 - "Core schema"
Cohesion: 0.06
Nodes (34): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.category, MasterProduct.costCny, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description, MasterProduct.detailPageUrl (+26 more)

### Community 22 - "Sourcing schema"
Cohesion: 0.07
Nodes (29): Sourcing, CandidateImage.candidate, CandidateImage.createdAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.isPrimary, CandidateImage.mimeType, CandidateImage.sortOrder (+21 more)

### Community 23 - "AI schema"
Cohesion: 0.08
Nodes (29): AI, ContentGeneration.contentType, ContentGeneration.createdAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.generationInput (+21 more)

### Community 24 - "Finance schema"
Cohesion: 0.07
Nodes (28): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdBy, ManualLedger.description, ManualLedger.memo, ProcessingCost.createdAt (+20 more)

### Community 25 - "Core schema"
Cohesion: 0.09
Nodes (26): Core, BundleComponent.bundleOption, BundleComponent.componentOption, BundleComponent.createdAt, BundleComponent.updatedAt, CategoryMapping.coupangCategoryId, CategoryMapping.createdAt, CategoryMapping.internalCategory (+18 more)

### Community 26 - "Orders schema"
Cohesion: 0.09
Nodes (25): SyncOrdersBodyDto, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.memo (+17 more)

### Community 27 - "code file: Order.status"
Cohesion: 0.1
Nodes (23): Order.status, DeliveryCompanySchema, OrderActionResponse, OrderActionResponseSchema, OrderLineItemSchema, OrderListItem, OrderListItemSchema, OrderListLineItem (+15 more)

### Community 28 - "System schema"
Cohesion: 0.12
Nodes (17): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.prismaSchemaHash, DataMigrationRun.releaseVersion (+9 more)

### Community 29 - "Core schema"
Cohesion: 0.1
Nodes (23): ProductOption.availableStock, ProductOption.barcode, ProductOption.commissionRate, ProductOption.costPrice, ProductOption.createdAt, ProductOption.deletedAt, ProductOption.isActive, ProductOption.isBundle (+15 more)

### Community 30 - "AgentOS schema"
Cohesion: 0.09
Nodes (23): ActionTask.assigneeUser, AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decisionReason, AgentApprovalRequest.status, AgentRunRequest.requestedBy, ContentGeneration.triggeredByUser, DetailPageRevision.createdByUser (+15 more)

### Community 31 - "prisma field: channel-sync-return.service.ts"
Cohesion: 0.15
Nodes (14): AdAction.organization, GradeHistory.organization, MasterProduct.organization, PurchaseOrder.organization, Supplier.organization, SystemSetting.organization, ChannelSyncController, ORDER_SYNC_ALERT (+6 more)

### Community 32 - "System schema"
Cohesion: 0.1
Nodes (23): ActionTask.activityLog, ActionTask.apiCall, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.label, ActionTask.notes, ActionTask.organization (+15 more)

### Community 33 - "System schema"
Cohesion: 0.09
Nodes (23): Alert.actorUser, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead, Alert.kind, Alert.message (+15 more)

### Community 34 - "AgentOS schema"
Cohesion: 0.1
Nodes (21): AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name, AgentInstance.parent, AgentInstance.pausedAt, AgentInstance.pauseReason (+13 more)

### Community 35 - "System schema"
Cohesion: 0.09
Nodes (22): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.installCount, Marketplace.isPublished (+14 more)

### Community 36 - "prisma field: BusinessRule.organization"
Cohesion: 0.16
Nodes (12): AppException, BusinessRule.organization, ContentAsset.organization, ExecutionWorker.organization, ChannelDashboardController, ChannelDashboardService, day, mockPrisma (+4 more)

### Community 37 - "Channels schema"
Cohesion: 0.13
Nodes (20): channels — Marketplace Sync And Reconciliation, Channels, BundleComponent.organization, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.firstObservedAt, ChannelAdTargetDailySnapshot.sampleCount, ChannelListingOption.createdAt, ChannelListingOption.salePrice (+12 more)

### Community 38 - "AI schema"
Cohesion: 0.1
Nodes (19): ThumbnailRegistrationAttempt.errorMessage, ThumbnailRegistrationAttempt.screenshotUrl, ThumbnailTracking.organization, ThumbnailRegistrationAttempt, AgentApprovalStatus, agentApprovalStatusSchema, AgentCostEventSummary, agentCostEventSummarySchema (+11 more)

### Community 39 - "code file: sources.ts"
Cohesion: 0.11
Nodes (18): OrderSheetResponse, PanelRunSource, PanelRunSourceSchema, sourceKeys, PanelAlertItem, PanelDismissEvent, PanelEvent, PanelItem (+10 more)

### Community 40 - "Inventory schema"
Cohesion: 0.12
Nodes (19): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.notes, StockTransfer.quantity, StockTransfer.requestedBy, StockTransfer.toWarehouse, StockTransfer.updatedAt (+11 more)

### Community 41 - "Channels schema"
Cohesion: 0.12
Nodes (18): ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank, ChannelListingDailySnapshot.createdAt (+10 more)

### Community 42 - "code file: dev-data-profiles.spec.ts"
Cohesion: 0.11
Nodes (17): bundleDir, consumerRoot, domainRoot, encryptedMirrorRoot, imageSyncPayloadPath, kiditemListPath, latestJson, payloadPath (+9 more)

### Community 43 - "Orders schema"
Cohesion: 0.12
Nodes (18): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+10 more)

### Community 44 - "AgentOS schema"
Cohesion: 0.12
Nodes (17): AgentOS, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decision, AgentAuthorizationEvent.policySnapshot, AgentRunEvent.createdAt, AgentRunEvent.level, AgentRunEvent.logRef, AgentToolDefinition.createdAt (+9 more)

### Community 45 - "Channels schema"
Cohesion: 0.12
Nodes (17): ChannelScrapeRun.businessDate, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.matchedCount, ChannelScrapeRun.metaJson, ChannelScrapeRun.pageType (+9 more)

### Community 46 - "System schema"
Cohesion: 0.12
Nodes (17): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+9 more)

### Community 47 - "AgentOS schema"
Cohesion: 0.13
Nodes (16): AgentRunRequest.claimedAt, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.createdAt, AgentRunRequest.finishedAt, AgentRunRequest.idempotencyKey, AgentRunRequest.lastErrorCode, AgentRunRequest.maxAttempts, AgentRunRequest.payload (+8 more)

### Community 48 - "Core schema"
Cohesion: 0.15
Nodes (15): ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.isPrimary, ChannelAccount.sellerId, ChannelAccount.status, ChannelAccount.updatedAt, ChannelAccount.vendorId, ChannelAccount (+7 more)

### Community 49 - "AI schema"
Cohesion: 0.13
Nodes (16): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height, ContentAsset.label (+8 more)

### Community 50 - "code file: removed-legacy-scripts.spec.ts"
Cohesion: 0.13
Nodes (14): dataRoot, exportOutput, packageJson, payloadDir, runDevData(), tempRoot, absolutePath, deletedLegacyTables (+6 more)

### Community 51 - "Orders schema"
Cohesion: 0.15
Nodes (15): OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.metadata, OrderReturn.platform, OrderReturn.reason (+7 more)

### Community 52 - "Orders schema"
Cohesion: 0.14
Nodes (12): CoupangReconciliationIgnoreDto, CoupangReconciliationLinkDto, RESOLUTION_SOURCES, STATUSES, StatusFilter, Review.content, Review.createdAt, Review.platform (+4 more)

### Community 53 - "code file: patterns.ts"
Cohesion: 0.24
Nodes (10): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), scrubDeep(), scrubSecrets(), a, input, now (+2 more)

### Community 54 - "Inventory schema"
Cohesion: 0.18
Nodes (12): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.items, StockAudit.matchedCount, StockAudit.notes (+4 more)

### Community 55 - "Inventory schema"
Cohesion: 0.18
Nodes (12): PickingItem.pickingList, PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.listNumber, PickingList.pickedItems, PickingList.startedAt, PickingList.status (+4 more)

### Community 56 - "AgentOS schema"
Cohesion: 0.17
Nodes (12): AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.inputTokens, AgentCostEvent.metadata, AgentCostEvent.model (+4 more)

### Community 57 - "code file: coupang-client.ts"
Cohesion: 0.32
Nodes (9): CoupangCredentials, coupangRequest(), generateAuthorization(), approveReturn(), confirmOrderSheets(), getOrderSheets(), uploadInvoice(), getSellerProduct() (+1 more)

### Community 58 - "Orders schema"
Cohesion: 0.18
Nodes (12): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.metadata, OrderLineItem.productName, OrderLineItem.quantity, OrderLineItem.status, OrderLineItem.totalPrice, OrderLineItem.unitPrice (+4 more)

### Community 59 - "AI schema"
Cohesion: 0.18
Nodes (12): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.originalGrade, ThumbnailTracking.originalScore, ThumbnailTracking.reviewsAfter, ThumbnailTracking.salesAfter (+4 more)

### Community 60 - "code file: prepare-coupang-extension.mjs"
Cohesion: 0.18
Nodes (9): DEFAULT_OUTPUT_PATH, addUnique(), defaultSourceDir, patchManifest(), runtimeFiles, manifest, dir, files (+1 more)

### Community 61 - "code file: channel-credential-crypto.ts"
Cohesion: 0.27
Nodes (8): readCredentialsConfig(), toJsonRecord(), toRecord(), trimToOptional(), CoupangCredentialCryptoError, encryptCredential(), EncryptedCredentialEnvelope, resolveKey()

### Community 62 - "AgentOS schema"
Cohesion: 0.22
Nodes (11): AgentRunRequest.taskSession, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.lastRun, AgentTaskSession.metadata, AgentTaskSession.sessionDisplay, AgentTaskSession.sessionParams (+3 more)

### Community 63 - "code file: channel-dashboard.ts"
Cohesion: 0.18
Nodes (10): ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow, ProductRankingRowSchema, ReturnFaultSplit, ReturnFaultSplitSchema, ReturnReasonRow, ReturnReasonRowSchema (+2 more)

### Community 64 - "Finance schema"
Cohesion: 0.2
Nodes (10): GradeHistory.calculatedAt, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.reason, GradeHistory.revenueScore, GradeHistory.score, GradeHistory.velocityScore (+2 more)

### Community 65 - "AgentOS schema"
Cohesion: 0.2
Nodes (10): AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.totalCostMicros, AgentRuntimeState.totalInputTokens, AgentRuntimeState.totalRuns (+2 more)

### Community 66 - "prisma field: Alert.organization"
Cohesion: 0.2
Nodes (9): Alert.organization, ManualLedger.organization, domainOutputDir, fixture, markdown, mermaid, modelsDir, outputPath (+1 more)

### Community 67 - "Orders schema"
Cohesion: 0.2
Nodes (10): CSRecord.assignee, CSRecord.content, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.priority, CSRecord.resolution (+2 more)

### Community 68 - "AI schema"
Cohesion: 0.2
Nodes (10): ThumbnailGeneration.attemptCount, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.originalUrl, ThumbnailGeneration.status, ThumbnailGeneration.triggeredByUser, ThumbnailGenerationCandidate.height, ThumbnailGenerationEvent.attemptNumber, ThumbnailGenerationEvent.eventType (+2 more)

### Community 69 - "AI schema"
Cohesion: 0.22
Nodes (9): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.method, ThumbnailAnalysis.overallScore, ThumbnailAnalysis.qualityAnalyzedAt, ThumbnailAnalysis.recompose, ThumbnailAnalysis.scores, ThumbnailAnalysis.suggestions (+1 more)

### Community 70 - "Inventory schema"
Cohesion: 0.22
Nodes (9): PickingItem.createdAt, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.pickedAt, PickingItem.productName, PickingItem.quantity, PickingItem.verifiedAt (+1 more)

### Community 71 - "AgentOS schema"
Cohesion: 0.22
Nodes (9): AgentRunRequest.sourceWorkflowRun, WorkflowRun.contextData, WorkflowRun.error, WorkflowRun.startedAt, WorkflowRun.status, WorkflowRun.steps, WorkflowRun.triggeredBy, WorkflowRun.updatedAt (+1 more)

### Community 72 - "System schema"
Cohesion: 0.22
Nodes (9): System, MigrationCheckpoint.createdAt, MigrationCheckpoint.updatedAt, SystemSetting.createdAt, SystemSetting.updatedAt, MigrationCheckpoint, SystemSetting, MigrationCheckpoint unique(scriptName, stepName, entityKey) (+1 more)

### Community 73 - "code file: check-agents-hygiene.mjs"
Cohesion: 0.5
Nodes (6): checkClaudeShims(), checkTrackedClaudeDirectory(), findStaleInstructionLines(), listTracked(), runChecks(), findings

### Community 74 - "code file: common.ts"
Cohesion: 0.29
Nodes (5): ApiErrorResponse, ApiErrorResponseSchema, PaginatedResponse, SyncInfo, SyncInfoSchema

### Community 75 - "Core schema"
Cohesion: 0.29
Nodes (7): OrganizationMembership.createdAt, OrganizationMembership.joinedAt, OrganizationMembership.lastSelectedAt, OrganizationMembership.role, OrganizationMembership.status, OrganizationMembership, OrganizationMembership unique(organizationId, userId)

### Community 76 - "code file: ai.ts"
Cohesion: 0.29
Nodes (5): DetailImageCount, DetailImageCountSchema, DetailPageAgeGroup, DetailPageTemplateId, DetailPageTemplateIdSchema

### Community 77 - "Community 77"
Cohesion: 0.4
Nodes (3): scanSummaryMessage(), errorMessage(), resultMessage()

### Community 78 - "AgentOS schema"
Cohesion: 0.33
Nodes (6): WorkflowTemplate.createdAt, WorkflowTemplate.description, WorkflowTemplate.marketplace, WorkflowTemplate.triggerType, WorkflowTemplate.version, WorkflowTemplate

### Community 79 - "AI schema"
Cohesion: 0.4
Nodes (6): ThumbnailTrackingDailySnapshot.capturedAt, ThumbnailTrackingDailySnapshot.rawCellTexts, ThumbnailTrackingDailySnapshot.reviewCount, ThumbnailTrackingDailySnapshot.scrapeStatus, ThumbnailTrackingDailySnapshot, ThumbnailTrackingDailySnapshot unique(trackingId, capturedDate)

### Community 80 - "System schema"
Cohesion: 0.33
Nodes (6): ActivityEvent.createdAt, ActivityEvent.eventType, ActivityEvent.objectId, ActivityEvent.source, ActivityEvent.title, ActivityEvent

### Community 81 - "System schema"
Cohesion: 0.33
Nodes (6): FeatureGate.allowedOrganizations, FeatureGate.description, FeatureGate.metadata, FeatureGate.updatedAt, FeatureGate, FeatureGateSchema

### Community 82 - "AI schema"
Cohesion: 0.4
Nodes (5): DetailPageRevision.assetUrlMap, DetailPageRevision.createdAt, DetailPageRevision.imageUrls, DetailPageRevision.revisionType, DetailPageRevision

### Community 83 - "code file: seed-agent-os.spec.ts"
Cohesion: 0.4
Nodes (4): definitions, seedPath, serverSeedPath, types

### Community 84 - "code file: inspection.ts"
Cohesion: 0.4
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 85 - "code file: readiness.ts"
Cohesion: 0.4
Nodes (4): ReadinessCheck, ReadinessCheckSchema, ReadinessResponse, ReadinessResponseSchema

## Knowledge Gaps
- **1142 isolated node(s):** `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority` (+1137 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Core schema` to `Core schema`, `Supply schema`, `Orders schema`, `code file: ads.ts`, `code file: fs.ts`, `Advertising schema`, `prisma field: MasterProduct.barcode`, `code file: dev-data.ts`, `Inventory schema`, `code file: dev-data-coupang.ts`, `AgentOS schema`, `Inventory schema`, `Orders schema`, `Channels schema`, `AI schema`, `prisma field: Thumbnail.organization`, `AgentOS schema`, `Core schema`, `Sourcing schema`, `AI schema`, `Finance schema`, `Core schema`, `Orders schema`, `code file: Order.status`, `System schema`, `Core schema`, `AgentOS schema`, `prisma field: channel-sync-return.service.ts`, `System schema`, `System schema`, `AgentOS schema`, `prisma field: BusinessRule.organization`, `Channels schema`, `AI schema`, `code file: sources.ts`, `Inventory schema`, `Channels schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `System schema`, `AgentOS schema`, `Core schema`, `AI schema`, `Orders schema`, `Orders schema`, `Inventory schema`, `Inventory schema`, `AgentOS schema`, `Orders schema`, `AI schema`, `AgentOS schema`, `Finance schema`, `AgentOS schema`, `prisma field: Alert.organization`, `Orders schema`, `AI schema`, `AI schema`, `System schema`, `Core schema`, `AgentOS schema`, `AI schema`, `System schema`, `System schema`, `AI schema`?**
  _High betweenness centrality (0.181) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `Orders schema` to `Core schema`, `Core schema`, `Supply schema`, `Advertising schema`, `prisma field: MasterProduct.barcode`, `Inventory schema`, `AgentOS schema`, `Inventory schema`, `Orders schema`, `Channels schema`, `AI schema`, `prisma field: Thumbnail.organization`, `AgentOS schema`, `Core schema`, `Sourcing schema`, `AI schema`, `Finance schema`, `Core schema`, `Orders schema`, `System schema`, `Core schema`, `AgentOS schema`, `prisma field: channel-sync-return.service.ts`, `System schema`, `System schema`, `AgentOS schema`, `System schema`, `prisma field: BusinessRule.organization`, `Channels schema`, `AI schema`, `Inventory schema`, `Channels schema`, `Orders schema`, `AgentOS schema`, `Channels schema`, `System schema`, `AgentOS schema`, `Core schema`, `AI schema`, `Orders schema`, `Orders schema`, `Inventory schema`, `Inventory schema`, `AgentOS schema`, `Orders schema`, `AI schema`, `AgentOS schema`, `Finance schema`, `AgentOS schema`, `prisma field: Alert.organization`, `Orders schema`, `AI schema`, `AI schema`, `Inventory schema`, `AgentOS schema`, `System schema`, `Core schema`, `AgentOS schema`, `AI schema`, `System schema`, `System schema`, `AI schema`?**
  _High betweenness centrality (0.151) - this node is a cross-community bridge._
- **Why does `Inventory` connect `Inventory schema` to `Core schema`, `Core schema`, `Supply schema`, `Orders schema`, `Advertising schema`, `prisma field: MasterProduct.barcode`, `code file: dev-data.ts`, `Inventory schema`, `code file: dev-data-coupang.ts`, `AgentOS schema`, `Orders schema`, `Channels schema`, `AI schema`, `code file: check-directory-architecture.mjs`, `prisma field: Thumbnail.organization`, `Core schema`, `AI schema`, `Orders schema`, `code file: Order.status`, `System schema`, `Core schema`, `prisma field: channel-sync-return.service.ts`, `System schema`, `prisma field: BusinessRule.organization`, `Channels schema`, `AI schema`, `Inventory schema`, `Channels schema`, `code file: dev-data-profiles.spec.ts`, `Core schema`, `code file: removed-legacy-scripts.spec.ts`, `Inventory schema`, `Inventory schema`, `Finance schema`, `prisma field: Alert.organization`, `AI schema`, `AI schema`, `Inventory schema`, `code file: common.ts`, `Core schema`, `AI schema`, `AI schema`, `code file: thumbnails.spec.ts`, `code file: codes.ts`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Are the 54 inferred relationships involving `Organization` (e.g. with `Thumbnail` and `ChannelReconciliationRun`) actually correct?**
  _`Organization` has 54 INFERRED edges - model-reasoned connections that need verification._
- **Are the 128 inferred relationships involving `Inventory` (e.g. with `Inventory.organization` and `StockTransfer`) actually correct?**
  _`Inventory` has 128 INFERRED edges - model-reasoned connections that need verification._
- **Are the 124 inferred relationships involving `ChannelReconciliationRun` (e.g. with `ChannelReconciliationItem.externalId` and `ChannelReconciliationItem.legacyCode`) actually correct?**
  _`ChannelReconciliationRun` has 124 INFERRED edges - model-reasoned connections that need verification._
- **Are the 128 inferred relationships involving `ChannelReconciliationService` (e.g. with `AdAction.organization` and `AdAction.listing`) actually correct?**
  _`ChannelReconciliationService` has 128 INFERRED edges - model-reasoned connections that need verification._