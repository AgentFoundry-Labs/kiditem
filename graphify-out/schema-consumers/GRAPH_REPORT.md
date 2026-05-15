# Graph Report - schema-consumers  (2026-05-15)

## Corpus Check
- 200 files · ~92,522 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2076 nodes · 7979 edges · 93 communities (92 shown, 1 thin omitted)
- Extraction: 47% EXTRACTED · 53% INFERRED · 0% AMBIGUOUS · INFERRED: 4198 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_code file ads.ts|code file: ads.ts]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_code file generate-prisma-erd.mjs|code file: generate-prisma-erd.mjs]]
- [[_COMMUNITY_code file check-directory-architecture.mjs|code file: check-directory-architecture.mjs]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_code file dev-data.ts|code file: dev-data.ts]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_code file import-baseline-planner.ts|code file: import-baseline-planner.ts]]
- [[_COMMUNITY_code file dev-data-coupang.ts|code file: dev-data-coupang.ts]]
- [[_COMMUNITY_prisma field channel-sync-order.service.ts|prisma field: channel-sync-order.service.ts]]
- [[_COMMUNITY_code file staging-db-baseline.ts|code file: staging-db-baseline.ts]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_prisma field ActionTask.targetId|prisma field: ActionTask.targetId]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file lifecycle-state.ts|code file: lifecycle-state.ts]]
- [[_COMMUNITY_code file dev-data-profiles.spec.ts|code file: dev-data-profiles.spec.ts]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file dashboard.ts|code file: dashboard.ts]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Sourcing schema|Sourcing schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_prisma field channel-sync-return.service.ts|prisma field: channel-sync-return.service.ts]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_code file run-data-migrations.ts|code file: run-data-migrations.ts]]
- [[_COMMUNITY_prisma field AgentApprovalRequest.organization|prisma field: AgentApprovalRequest.organization]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file fs.ts|code file: fs.ts]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_prisma field AgentRunEvent.organization|prisma field: AgentRunEvent.organization]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_code file patterns.ts|code file: patterns.ts]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file coupang-client.ts|code file: coupang-client.ts]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file prepare-coupang-extension.mjs|code file: prepare-coupang-extension.mjs]]
- [[_COMMUNITY_code file channel-credential-crypto.ts|code file: channel-credential-crypto.ts]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file channel-dashboard.ts|code file: channel-dashboard.ts]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_prisma field OrderLineItem.organization|prisma field: OrderLineItem.organization]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_code file check-agents-hygiene.mjs|code file: check-agents-hygiene.mjs]]
- [[_COMMUNITY_code file reconciliation-action.dto.ts|code file: reconciliation-action.dto.ts]]
- [[_COMMUNITY_code file ai.ts|code file: ai.ts]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_code file common.ts|code file: common.ts]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file inspection.ts|code file: inspection.ts]]
- [[_COMMUNITY_code file readiness.ts|code file: readiness.ts]]
- [[_COMMUNITY_code file coupang-date-range.dto.ts|code file: coupang-date-range.dto.ts]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 216 edges
2. `Organization` - 191 edges
3. `Inventory` - 179 edges
4. `ChannelReconciliationService` - 171 edges
5. `ChannelReconciliationRun` - 170 edges
6. `ChannelSyncService` - 135 edges
7. `ActionTask` - 110 edges
8. `ChannelAccountService` - 109 edges
9. `ChannelDashboardService` - 108 edges
10. `prisma — Shared Schema` - 107 edges
11. `CoupangProviderPort` - 98 edges
12. `channels — Marketplace Sync And Reconciliation` - 97 edges

## Surprising Connections (you probably didn't know these)
- `ReconciliationRow` --references_field--> `AdAction.externalId`  [INFERRED]
  packages/shared/src/schemas/channel-reconciliation.ts → prisma/models/advertising.prisma
- `ChannelReconciliationService` --references_field--> `AdAction.externalId`  [INFERRED]
  apps/server/src/channels/application/service/channel-reconciliation.service.ts → prisma/models/advertising.prisma
- `ChannelDashboardController` --references_field--> `AdAction.organization`  [INFERRED]
  apps/server/src/channels/adapter/in/http/channel-dashboard.controller.ts → prisma/models/advertising.prisma
- `ChannelSyncController` --references_field--> `AdAction.organization`  [INFERRED]
  apps/server/src/channels/adapter/in/http/channel-sync.controller.ts → prisma/models/advertising.prisma
- `ChannelDashboardService` --references_field--> `AdAction.organization`  [INFERRED]
  apps/server/src/channels/application/service/channel-dashboard.service.ts → prisma/models/advertising.prisma
- `ChannelReconciliationService` --references_field--> `AdAction.organization`  [INFERRED]
  apps/server/src/channels/application/service/channel-reconciliation.service.ts → prisma/models/advertising.prisma
- `ChannelSyncService` --references_field--> `AdAction.organization`  [INFERRED]
  apps/server/src/channels/application/service/channel-sync.service.ts → prisma/models/advertising.prisma
- `ChannelReconciliationService` --references_field--> `AdAction.listing`  [INFERRED]
  apps/server/src/channels/application/service/channel-reconciliation.service.ts → prisma/models/advertising.prisma

## Communities (93 total, 1 thin omitted)

### Community 0 - "Core schema"
Cohesion: 0.16
Nodes (86): ChannelsModule, CoupangProviderAdapter, channels — Marketplace Sync And Reconciliation, prisma — Shared Schema, CoupangReconciliationRowDto, CoupangReconciliationScanDto, ActivityEvent.organization, AdAction.organization (+78 more)

### Community 1 - "Core schema"
Cohesion: 0.04
Nodes (79): AdAction.listing, ChannelAdTargetDailySnapshot.listing, ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo, ChannelListing.exposureStatus (+71 more)

### Community 2 - "Supply schema"
Cohesion: 0.04
Nodes (61): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.isPrimary, MasterSupplierProduct.updatedAt, ProcessingCost.master, PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectQty (+53 more)

### Community 3 - "code file: ads.ts"
Cohesion: 0.04
Nodes (53): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot, AdCollectStatus (+45 more)

### Community 4 - "AI schema"
Cohesion: 0.05
Nodes (52): packages/shared — @kiditem/shared, AI, ContentGeneration.contentType, ContentGeneration.createdAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy (+44 more)

### Community 5 - "code file: generate-prisma-erd.mjs"
Cohesion: 0.07
Nodes (44): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, __dirname, extractDocValue() (+36 more)

### Community 6 - "code file: check-directory-architecture.mjs"
Cohesion: 0.07
Nodes (37): git(), analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), listDirectories(), analyzeReconstructionTriggers(), isCrossLayerControlChange(), missingBodyFields(), REQUIRED_LABELS (+29 more)

### Community 7 - "AI schema"
Cohesion: 0.04
Nodes (46): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.measuredAt, Thumbnail.prevClickRate, Thumbnail.status, Thumbnail.strategy (+38 more)

### Community 8 - "code file: dev-data.ts"
Cohesion: 0.11
Nodes (46): AdapterCommand, appendProjectReferenceDefaults(), archiveFileName(), archiveShaFileName(), BundlePackageIndex, cloudStorageRoot(), commandPack(), commandPublish() (+38 more)

### Community 9 - "Advertising schema"
Cohesion: 0.05
Nodes (47): Advertising, AdAction.actionType, AdAction.adTargetDaily, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+39 more)

### Community 10 - "code file: import-baseline-planner.ts"
Cohesion: 0.06
Nodes (37): row, clean(), HardConflict, KiditemPlan, NAME_FIELDS, normalizeForGroup(), planKiditemImport(), PlannedMaster (+29 more)

### Community 11 - "code file: dev-data-coupang.ts"
Cohesion: 0.09
Nodes (42): appendFlag(), appendOption(), Args, BundleManifest, BundlePayload, BundleReference, Command, commandReplay() (+34 more)

### Community 12 - "prisma field: channel-sync-order.service.ts"
Cohesion: 0.11
Nodes (41): externalOptionId canonical option identity, vendorItemId provider term, Database ERD, AdAction.externalId, AgentApprovalRequest.agentInstance, AgentAuthorizationEvent.agentInstance, AgentCostEvent.agentInstance, AgentRun.agentInstance (+33 more)

### Community 13 - "code file: staging-db-baseline.ts"
Cohesion: 0.1
Nodes (42): appendValues(), commandExport(), referenceTypeFor(), execFileAsync, CliArgs, printHelp(), assertNonProductionTarget(), assertRestoreConfirmation() (+34 more)

### Community 14 - "Inventory schema"
Cohesion: 0.05
Nodes (39): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.reorderPoint, Inventory.reorderQuantity, Inventory.reservedStock (+31 more)

### Community 15 - "Inventory schema"
Cohesion: 0.08
Nodes (22): ChannelReconciliationItem.legacyCode, MasterProduct.legacyCode, StockTransaction.createdBy, StockTransaction.relatedId, StockTransaction.totalCost, StockTransaction.unitCost, StockTransaction, Tx (+14 more)

### Community 16 - "Channels schema"
Cohesion: 0.05
Nodes (38): ChannelReconciliationItem.channelProductName, ChannelReconciliationItem.confidence, ChannelReconciliationItem.ignoredReason, ChannelReconciliationItem.lastObservedAt, ChannelReconciliationItem.linkedListingId, ChannelReconciliationItem.linkedMasterProductId, ChannelReconciliationItem.matchReason, ChannelReconciliationItem.resolutionSource (+30 more)

### Community 17 - "Inventory schema"
Cohesion: 0.06
Nodes (34): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.disposedQty, ReturnTransfer.option, ReturnTransfer.processedBy, ReturnTransfer.quantity, ReturnTransfer.restockedQty, ReturnTransfer.rtNumber (+26 more)

### Community 18 - "Core schema"
Cohesion: 0.06
Nodes (34): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.category, MasterProduct.costCny, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description, MasterProduct.detailPageUrl (+26 more)

### Community 19 - "prisma field: ActionTask.targetId"
Cohesion: 0.07
Nodes (28): MigrationResult, ActionTask.targetId, AdAction.targetType, Alert.actionTask, Alert.targetId, Alert.targetType, OrderSheetResponse, PanelRunSource (+20 more)

### Community 20 - "AgentOS schema"
Cohesion: 0.06
Nodes (34): AgentRun.adapterType, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt, AgentRun.heartbeatAt (+26 more)

### Community 21 - "code file: lifecycle-state.ts"
Cohesion: 0.06
Nodes (31): ProductLifecycleState, BundleComponentSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, Master, MasterImageItem, MasterImageItemSchema, MasterImageRole (+23 more)

### Community 22 - "code file: dev-data-profiles.spec.ts"
Cohesion: 0.07
Nodes (32): bundleDir, consumerRoot, dataRoot, domainRoot, encryptedMirrorRoot, exportOutput, imageSyncPayloadPath, kiditemListPath (+24 more)

### Community 23 - "Orders schema"
Cohesion: 0.07
Nodes (31): SyncOrdersBodyDto, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.memo (+23 more)

### Community 24 - "code file: dashboard.ts"
Cohesion: 0.06
Nodes (32): AdMetricsDetail, AdMetricsDetailSchema, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary, DashboardAlertItem (+24 more)

### Community 25 - "System schema"
Cohesion: 0.08
Nodes (30): Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead, Alert.kind, Alert.message, Alert.metadata (+22 more)

### Community 26 - "Core schema"
Cohesion: 0.08
Nodes (31): Core, BundleComponent.bundleOption, BundleComponent.componentOption, BundleComponent.createdAt, BundleComponent.updatedAt, MasterCodeCounter.updatedAt, MasterCodeCounter.value, ProductOption.availableStock (+23 more)

### Community 27 - "Sourcing schema"
Cohesion: 0.08
Nodes (28): Sourcing, CandidateImage.candidate, CandidateImage.createdAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.isPrimary, CandidateImage.mimeType, CandidateImage.sortOrder (+20 more)

### Community 28 - "System schema"
Cohesion: 0.11
Nodes (20): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.prismaSchemaHash, DataMigrationRun.releaseVersion (+12 more)

### Community 29 - "Finance schema"
Cohesion: 0.07
Nodes (28): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdBy, ManualLedger.description, ManualLedger.memo, ProcessingCost.createdAt (+20 more)

### Community 30 - "AI schema"
Cohesion: 0.08
Nodes (27): ActionTask.assigneeUser, Alert.actorUser, OrganizationMembership.invitedBy, ThumbnailGeneration.attemptCount, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.originalUrl, ThumbnailGeneration.sourceCandidate, ThumbnailGeneration.status (+19 more)

### Community 31 - "System schema"
Cohesion: 0.08
Nodes (23): ErrorCodes, Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.installCount (+15 more)

### Community 32 - "prisma field: channel-sync-return.service.ts"
Cohesion: 0.15
Nodes (14): AgentAuthorizationEvent.organization, AgentRunRequest.organization, BundleComponent.organization, CandidateImage.organization, Review.organization, Supplier.organization, ChannelSyncController, ORDER_SYNC_ALERT (+6 more)

### Community 33 - "System schema"
Cohesion: 0.1
Nodes (23): ActionTask.activityLog, ActionTask.apiCall, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.label, ActionTask.notes, ActionTask.organization (+15 more)

### Community 34 - "code file: run-data-migrations.ts"
Cohesion: 0.2
Nodes (21): DATA_MIGRATION_RELEASES, commandStatus(), createPrisma(), appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertMutatingTarget(), commandUp(), databaseUrl() (+13 more)

### Community 35 - "prisma field: AgentApprovalRequest.organization"
Cohesion: 0.16
Nodes (12): AppException, AgentApprovalRequest.organization, Settlement.organization, StockTransfer.organization, ChannelDashboardController, ChannelDashboardService, day, mockPrisma (+4 more)

### Community 36 - "AgentOS schema"
Cohesion: 0.1
Nodes (20): AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name, AgentInstance.parent, AgentInstance.pausedAt, AgentInstance.pauseReason (+12 more)

### Community 37 - "AI schema"
Cohesion: 0.1
Nodes (20): AgentRuntimeState.organization, ThumbnailRegistrationAttempt.errorMessage, ThumbnailRegistrationAttempt.screenshotUrl, ThumbnailRegistrationAttempt, DeliveryCompanySchema, OrderActionResponse, OrderLineItemSchema, OrderListItem (+12 more)

### Community 38 - "Channels schema"
Cohesion: 0.12
Nodes (19): Channels, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank (+11 more)

### Community 39 - "Orders schema"
Cohesion: 0.12
Nodes (18): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+10 more)

### Community 40 - "code file: fs.ts"
Cohesion: 0.19
Nodes (13): commandSanitize(), assertSafeDatasetId(), resolveDatasetId(), sanitizeValue(), verifyBundle(), fileSize(), readJson(), readTextIfExists() (+5 more)

### Community 41 - "Channels schema"
Cohesion: 0.12
Nodes (17): ChannelScrapeRun.businessDate, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.matchedCount, ChannelScrapeRun.metaJson, ChannelScrapeRun.pageType (+9 more)

### Community 42 - "AgentOS schema"
Cohesion: 0.12
Nodes (17): AgentOS, AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decisionReason, AgentApprovalRequest.status, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decision, AgentAuthorizationEvent.policySnapshot (+9 more)

### Community 43 - "AgentOS schema"
Cohesion: 0.12
Nodes (17): AgentRunRequest.claimedAt, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.createdAt, AgentRunRequest.finishedAt, AgentRunRequest.idempotencyKey, AgentRunRequest.lastErrorCode, AgentRunRequest.maxAttempts, AgentRunRequest.payload (+9 more)

### Community 44 - "prisma field: AgentRunEvent.organization"
Cohesion: 0.12
Nodes (16): AgentRunEvent.organization, ProductOption.organization, AgentApprovalStatus, AgentApprovalStatusSchema, AgentCostEventSummary, AgentCostEventSummarySchema, AgentDefinitionRuntimeKind, AgentDefinitionSummary (+8 more)

### Community 45 - "System schema"
Cohesion: 0.12
Nodes (17): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+9 more)

### Community 46 - "Orders schema"
Cohesion: 0.13
Nodes (17): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.metadata, OrderLineItem.option, OrderLineItem.productName, OrderLineItem.quantity, OrderLineItem.status, OrderLineItem.totalPrice (+9 more)

### Community 47 - "AI schema"
Cohesion: 0.13
Nodes (16): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height, ContentAsset.label (+8 more)

### Community 48 - "Core schema"
Cohesion: 0.12
Nodes (16): CategoryMapping.coupangCategoryId, CategoryMapping.createdAt, CategoryMapping.internalCategory, LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.isPrimary (+8 more)

### Community 49 - "Core schema"
Cohesion: 0.15
Nodes (15): ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.isPrimary, ChannelAccount.sellerId, ChannelAccount.status, ChannelAccount.updatedAt, ChannelAccount.vendorId, ChannelAccount (+7 more)

### Community 50 - "System schema"
Cohesion: 0.13
Nodes (15): System, ActivityEvent.createdAt, ActivityEvent.eventType, ActivityEvent.objectId, ActivityEvent.source, ActivityEvent.title, MigrationCheckpoint.createdAt, MigrationCheckpoint.updatedAt (+7 more)

### Community 51 - "Orders schema"
Cohesion: 0.15
Nodes (15): OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.metadata, OrderReturn.platform, OrderReturn.reason (+7 more)

### Community 52 - "Channels schema"
Cohesion: 0.15
Nodes (13): ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.firstObservedAt, ChannelAdTargetDailySnapshot.sampleCount, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.matchStatus, ChannelScrapeSnapshot.observedAt, ChannelScrapeSnapshot.pageType (+5 more)

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
Cohesion: 0.17
Nodes (12): Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.option, Shipment.shippedAt, Shipment.status (+4 more)

### Community 59 - "code file: prepare-coupang-extension.mjs"
Cohesion: 0.18
Nodes (9): DEFAULT_OUTPUT_PATH, addUnique(), defaultSourceDir, patchManifest(), runtimeFiles, manifest, dir, files (+1 more)

### Community 60 - "code file: channel-credential-crypto.ts"
Cohesion: 0.27
Nodes (8): readCredentialsConfig(), toJsonRecord(), toRecord(), trimToOptional(), CoupangCredentialCryptoError, encryptCredential(), EncryptedCredentialEnvelope, resolveKey()

### Community 61 - "Community 61"
Cohesion: 0.2
Nodes (8): scanSummaryMessage(), errorMessage(), resultMessage(), isCoupangCredentialResolutionError(), syncCoupangOrders(), syncSingleCoupangOrder(), syncCoupangProducts(), syncSingleProductListing()

### Community 62 - "Inventory schema"
Cohesion: 0.2
Nodes (11): Shipment.warehouse, Warehouse.address, Warehouse.code, Warehouse.createdAt, Warehouse.manager, Warehouse.name, Warehouse.phone, Warehouse.status (+3 more)

### Community 63 - "AgentOS schema"
Cohesion: 0.22
Nodes (11): AgentRunRequest.taskSession, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.lastRun, AgentTaskSession.metadata, AgentTaskSession.sessionDisplay, AgentTaskSession.sessionParams (+3 more)

### Community 64 - "code file: channel-dashboard.ts"
Cohesion: 0.18
Nodes (10): ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow, ProductRankingRowSchema, ReturnFaultSplit, ReturnFaultSplitSchema, ReturnReasonRow, ReturnReasonRowSchema (+2 more)

### Community 65 - "AI schema"
Cohesion: 0.2
Nodes (11): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.originalGrade, ThumbnailTracking.originalScore, ThumbnailTracking.reviewsAfter, ThumbnailTracking.salesAfter (+3 more)

### Community 66 - "Orders schema"
Cohesion: 0.2
Nodes (10): CSRecord.assignee, CSRecord.content, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.priority, CSRecord.resolution (+2 more)

### Community 67 - "AgentOS schema"
Cohesion: 0.2
Nodes (10): AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.totalCostMicros, AgentRuntimeState.totalInputTokens, AgentRuntimeState.totalRuns (+2 more)

### Community 68 - "prisma field: OrderLineItem.organization"
Cohesion: 0.2
Nodes (9): OrderLineItem.organization, ThumbnailGeneration.organization, domainOutputDir, fixture, markdown, mermaid, modelsDir, outputPath (+1 more)

### Community 69 - "Finance schema"
Cohesion: 0.2
Nodes (10): GradeHistory.calculatedAt, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.reason, GradeHistory.revenueScore, GradeHistory.score, GradeHistory.velocityScore (+2 more)

### Community 70 - "Inventory schema"
Cohesion: 0.22
Nodes (9): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.notes, StockTransfer.quantity, StockTransfer.requestedBy, StockTransfer.toWarehouse, StockTransfer.updatedAt (+1 more)

### Community 71 - "AgentOS schema"
Cohesion: 0.22
Nodes (9): AgentRunRequest.sourceWorkflowRun, WorkflowRun.contextData, WorkflowRun.error, WorkflowRun.startedAt, WorkflowRun.status, WorkflowRun.steps, WorkflowRun.triggeredBy, WorkflowRun.updatedAt (+1 more)

### Community 72 - "AI schema"
Cohesion: 0.22
Nodes (9): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.method, ThumbnailAnalysis.overallScore, ThumbnailAnalysis.qualityAnalyzedAt, ThumbnailAnalysis.recompose, ThumbnailAnalysis.scores, ThumbnailAnalysis.suggestions (+1 more)

### Community 73 - "Inventory schema"
Cohesion: 0.22
Nodes (9): PickingItem.createdAt, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.pickedAt, PickingItem.productName, PickingItem.quantity, PickingItem.verifiedAt (+1 more)

### Community 74 - "code file: check-agents-hygiene.mjs"
Cohesion: 0.5
Nodes (6): checkClaudeShims(), checkTrackedClaudeDirectory(), findStaleInstructionLines(), listTracked(), runChecks(), findings

### Community 75 - "code file: reconciliation-action.dto.ts"
Cohesion: 0.29
Nodes (5): CoupangReconciliationIgnoreDto, CoupangReconciliationLinkDto, RESOLUTION_SOURCES, STATUSES, StatusFilter

### Community 76 - "code file: ai.ts"
Cohesion: 0.29
Nodes (5): DetailImageCount, DetailImageCountSchema, DetailPageAgeGroup, DetailPageTemplateId, DetailPageTemplateIdSchema

### Community 77 - "Core schema"
Cohesion: 0.29
Nodes (7): OrganizationMembership.createdAt, OrganizationMembership.joinedAt, OrganizationMembership.lastSelectedAt, OrganizationMembership.role, OrganizationMembership.status, OrganizationMembership, OrganizationMembership unique(organizationId, userId)

### Community 78 - "code file: common.ts"
Cohesion: 0.29
Nodes (5): ApiErrorResponse, ApiErrorResponseSchema, PaginatedResponse, SyncInfo, SyncInfoSchema

### Community 79 - "AI schema"
Cohesion: 0.4
Nodes (6): ThumbnailTrackingDailySnapshot.capturedAt, ThumbnailTrackingDailySnapshot.rawCellTexts, ThumbnailTrackingDailySnapshot.reviewCount, ThumbnailTrackingDailySnapshot.scrapeStatus, ThumbnailTrackingDailySnapshot, ThumbnailTrackingDailySnapshot unique(trackingId, capturedDate)

### Community 80 - "System schema"
Cohesion: 0.33
Nodes (6): FeatureGate.allowedOrganizations, FeatureGate.description, FeatureGate.metadata, FeatureGate.updatedAt, FeatureGate, FeatureGateSchema

### Community 81 - "AgentOS schema"
Cohesion: 0.33
Nodes (6): WorkflowTemplate.createdAt, WorkflowTemplate.description, WorkflowTemplate.marketplace, WorkflowTemplate.triggerType, WorkflowTemplate.version, WorkflowTemplate

### Community 82 - "AgentOS schema"
Cohesion: 0.4
Nodes (5): AgentRunEvent.createdAt, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent, AgentRunEvent unique(runId, seq)

### Community 83 - "AgentOS schema"
Cohesion: 0.4
Nodes (5): AgentInstanceToolPolicy.approvalMode, AgentInstanceToolPolicy.constraints, AgentInstanceToolPolicy.createdAt, AgentInstanceToolPolicy, AgentInstanceToolPolicy unique(organizationId, agentInstanceId, toolId)

### Community 84 - "code file: inspection.ts"
Cohesion: 0.4
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 85 - "code file: readiness.ts"
Cohesion: 0.4
Nodes (4): ReadinessCheck, ReadinessCheckSchema, ReadinessResponse, ReadinessResponseSchema

## Knowledge Gaps
- **1146 isolated node(s):** `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority` (+1141 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Core schema` to `Core schema`, `Supply schema`, `code file: ads.ts`, `AI schema`, `AI schema`, `code file: dev-data.ts`, `Advertising schema`, `code file: import-baseline-planner.ts`, `code file: dev-data-coupang.ts`, `prisma field: channel-sync-order.service.ts`, `code file: staging-db-baseline.ts`, `Inventory schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Core schema`, `prisma field: ActionTask.targetId`, `AgentOS schema`, `code file: lifecycle-state.ts`, `Orders schema`, `code file: dashboard.ts`, `System schema`, `Core schema`, `Sourcing schema`, `System schema`, `Finance schema`, `AI schema`, `prisma field: channel-sync-return.service.ts`, `System schema`, `prisma field: AgentApprovalRequest.organization`, `AgentOS schema`, `AI schema`, `Channels schema`, `Orders schema`, `Channels schema`, `AgentOS schema`, `AgentOS schema`, `prisma field: AgentRunEvent.organization`, `System schema`, `Orders schema`, `AI schema`, `Core schema`, `Core schema`, `System schema`, `Orders schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `AgentOS schema`, `Orders schema`, `Inventory schema`, `AgentOS schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `prisma field: OrderLineItem.organization`, `Finance schema`, `Inventory schema`, `AI schema`, `Core schema`, `AI schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`?**
  _High betweenness centrality (0.233) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `prisma field: channel-sync-order.service.ts` to `Core schema`, `Core schema`, `Supply schema`, `AI schema`, `AI schema`, `Advertising schema`, `Inventory schema`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Core schema`, `prisma field: ActionTask.targetId`, `AgentOS schema`, `Orders schema`, `System schema`, `Core schema`, `Sourcing schema`, `System schema`, `Finance schema`, `AI schema`, `System schema`, `prisma field: channel-sync-return.service.ts`, `System schema`, `prisma field: AgentApprovalRequest.organization`, `AgentOS schema`, `AI schema`, `Channels schema`, `Orders schema`, `Channels schema`, `AgentOS schema`, `AgentOS schema`, `prisma field: AgentRunEvent.organization`, `System schema`, `Orders schema`, `AI schema`, `Core schema`, `Core schema`, `System schema`, `Orders schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `AgentOS schema`, `Orders schema`, `Inventory schema`, `AgentOS schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `prisma field: OrderLineItem.organization`, `Finance schema`, `Inventory schema`, `AgentOS schema`, `AI schema`, `Inventory schema`, `Core schema`, `AI schema`, `System schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`?**
  _High betweenness centrality (0.123) - this node is a cross-community bridge._
- **Why does `Inventory` connect `Inventory schema` to `Core schema`, `Core schema`, `Supply schema`, `AI schema`, `code file: check-directory-architecture.mjs`, `AI schema`, `code file: dev-data.ts`, `code file: import-baseline-planner.ts`, `code file: dev-data-coupang.ts`, `prisma field: channel-sync-order.service.ts`, `Inventory schema`, `Channels schema`, `Inventory schema`, `Core schema`, `prisma field: ActionTask.targetId`, `code file: lifecycle-state.ts`, `code file: dev-data-profiles.spec.ts`, `Orders schema`, `code file: dashboard.ts`, `System schema`, `Core schema`, `System schema`, `AI schema`, `System schema`, `prisma field: channel-sync-return.service.ts`, `System schema`, `prisma field: AgentApprovalRequest.organization`, `AI schema`, `Channels schema`, `prisma field: AgentRunEvent.organization`, `Orders schema`, `Core schema`, `Channels schema`, `Inventory schema`, `Inventory schema`, `Orders schema`, `Inventory schema`, `prisma field: OrderLineItem.organization`, `Finance schema`, `Inventory schema`, `AI schema`, `Inventory schema`, `Core schema`, `code file: common.ts`, `AI schema`, `AgentOS schema`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Are the 57 inferred relationships involving `Organization` (e.g. with `Thumbnail` and `ChannelReconciliationRun`) actually correct?**
  _`Organization` has 57 INFERRED edges - model-reasoned connections that need verification._
- **Are the 129 inferred relationships involving `Inventory` (e.g. with `Inventory.organization` and `StockTransfer`) actually correct?**
  _`Inventory` has 129 INFERRED edges - model-reasoned connections that need verification._
- **Are the 130 inferred relationships involving `ChannelReconciliationService` (e.g. with `AdAction.organization` and `AdAction.listing`) actually correct?**
  _`ChannelReconciliationService` has 130 INFERRED edges - model-reasoned connections that need verification._
- **Are the 125 inferred relationships involving `ChannelReconciliationRun` (e.g. with `ChannelReconciliationItem.externalId` and `ChannelReconciliationItem.legacyCode`) actually correct?**
  _`ChannelReconciliationRun` has 125 INFERRED edges - model-reasoned connections that need verification._