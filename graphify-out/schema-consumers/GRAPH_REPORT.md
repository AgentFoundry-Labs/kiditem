# Graph Report - schema-consumers  (2026-05-16)

## Corpus Check
- 200 files · ~92,430 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2091 nodes · 7996 edges · 84 communities (82 shown, 2 thin omitted)
- Extraction: 47% EXTRACTED · 53% INFERRED · 0% AMBIGUOUS · INFERRED: 4199 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_code file ads.ts|code file: ads.ts]]
- [[_COMMUNITY_code file dev-data.ts|code file: dev-data.ts]]
- [[_COMMUNITY_prisma field channel-sync-order.service.ts|prisma field: channel-sync-order.service.ts]]
- [[_COMMUNITY_code file generate-prisma-erd.mjs|code file: generate-prisma-erd.mjs]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_code file import-baseline-planner.ts|code file: import-baseline-planner.ts]]
- [[_COMMUNITY_code file check-directory-architecture.mjs|code file: check-directory-architecture.mjs]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file staging-db-baseline.ts|code file: staging-db-baseline.ts]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_code file dev-data-coupang.ts|code file: dev-data-coupang.ts]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file lifecycle-state.ts|code file: lifecycle-state.ts]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Sourcing schema|Sourcing schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_code file Order.status|code file: Order.status]]
- [[_COMMUNITY_code file run-data-migrations.ts|code file: run-data-migrations.ts]]
- [[_COMMUNITY_code file sources.ts|code file: sources.ts]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_code file patterns.ts|code file: patterns.ts]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_code file dev-data-profiles.spec.ts|code file: dev-data-profiles.spec.ts]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_code file removed-legacy-scripts.spec.ts|code file: removed-legacy-scripts.spec.ts]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_code file coupang-client.ts|code file: coupang-client.ts]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file prepare-coupang-extension.mjs|code file: prepare-coupang-extension.mjs]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_code file channel-credential-crypto.ts|code file: channel-credential-crypto.ts]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file channel-dashboard.ts|code file: channel-dashboard.ts]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file cli-args.ts|code file: cli-args.ts]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file common.ts|code file: common.ts]]
- [[_COMMUNITY_code file fs.ts|code file: fs.ts]]
- [[_COMMUNITY_code file ai.ts|code file: ai.ts]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file seed-agent-os.spec.ts|code file: seed-agent-os.spec.ts]]
- [[_COMMUNITY_code file inspection.ts|code file: inspection.ts]]
- [[_COMMUNITY_code file readiness.ts|code file: readiness.ts]]
- [[_COMMUNITY_code file thumbnails.spec.ts|code file: thumbnails.spec.ts]]
- [[_COMMUNITY_code file coupang-date-range.dto.ts|code file: coupang-date-range.dto.ts]]
- [[_COMMUNITY_code file codes.ts|code file: codes.ts]]

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
- `ChannelReconciliationService` --references_field--> `AdAction.organization`  [INFERRED]
  apps/server/src/channels/application/service/channel-reconciliation.service.ts → prisma/models/advertising.prisma
- `ChannelReconciliationService` --references_field--> `AdAction.listing`  [INFERRED]
  apps/server/src/channels/application/service/channel-reconciliation.service.ts → prisma/models/advertising.prisma
- `ChannelReconciliationService` --references_field--> `ScrapeTarget.isActive`  [INFERRED]
  apps/server/src/channels/application/service/channel-reconciliation.service.ts → prisma/models/advertising.prisma
- `ChannelReconciliationService` --references_field--> `ScrapeTarget.organization`  [INFERRED]
  apps/server/src/channels/application/service/channel-reconciliation.service.ts → prisma/models/advertising.prisma
- `ChannelReconciliationService` --references_field--> `ExecutionWorker.organization`  [INFERRED]
  apps/server/src/channels/application/service/channel-reconciliation.service.ts → prisma/models/advertising.prisma
- `ChannelReconciliationService` --references_field--> `AgentInstance.organization`  [INFERRED]
  apps/server/src/channels/application/service/channel-reconciliation.service.ts → prisma/models/agents.prisma

## Communities (84 total, 2 thin omitted)

### Community 0 - "Channels schema"
Cohesion: 0.05
Nodes (290): ChannelsModule, CoupangProviderAdapter, channels — Marketplace Sync And Reconciliation, prisma — Shared Schema, Channels, CoupangReconciliationRowDto, CoupangReconciliationScanDto, AppException (+282 more)

### Community 1 - "Supply schema"
Cohesion: 0.04
Nodes (62): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.isPrimary, MasterSupplierProduct.updatedAt, PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectQty, PurchaseOrder.defectType (+54 more)

### Community 2 - "Core schema"
Cohesion: 0.05
Nodes (50): AdAction.listing, ChannelAdTargetDailySnapshot.listing, ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo, ChannelListing.exposureStatus (+42 more)

### Community 3 - "Finance schema"
Cohesion: 0.04
Nodes (52): GradeHistory.calculatedAt, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.reason, GradeHistory.revenueScore, GradeHistory.score, GradeHistory.velocityScore (+44 more)

### Community 4 - "code file: ads.ts"
Cohesion: 0.04
Nodes (53): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot, AdCollectStatus (+45 more)

### Community 5 - "code file: dev-data.ts"
Cohesion: 0.1
Nodes (50): AdapterCommand, appendProjectReferenceDefaults(), archiveFileName(), archiveShaFileName(), BundlePackageIndex, cloudStorageRoot(), commandPack(), commandPublish() (+42 more)

### Community 6 - "prisma field: channel-sync-order.service.ts"
Cohesion: 0.09
Nodes (47): externalOptionId canonical option identity, vendorItemId provider term, Database ERD, ActionTask.targetId, AdAction.externalId, AdAction.targetType, AgentApprovalRequest.agentInstance, AgentAuthorizationEvent.agentInstance (+39 more)

### Community 7 - "code file: generate-prisma-erd.mjs"
Cohesion: 0.07
Nodes (46): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, __dirname, extractDocValue() (+38 more)

### Community 8 - "Advertising schema"
Cohesion: 0.05
Nodes (48): Advertising, AdAction.actionType, AdAction.adTargetDaily, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+40 more)

### Community 9 - "code file: import-baseline-planner.ts"
Cohesion: 0.06
Nodes (37): row, clean(), HardConflict, KiditemPlan, NAME_FIELDS, normalizeForGroup(), planKiditemImport(), PlannedMaster (+29 more)

### Community 10 - "code file: check-directory-architecture.mjs"
Cohesion: 0.08
Nodes (33): git(), analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), listDirectories(), analyzeReconstructionTriggers(), isCrossLayerControlChange(), missingBodyFields(), REQUIRED_LABELS (+25 more)

### Community 11 - "Orders schema"
Cohesion: 0.06
Nodes (38): CoupangReconciliationIgnoreDto, CoupangReconciliationLinkDto, RESOLUTION_SOURCES, STATUSES, StatusFilter, Review.content, Review.createdAt, Review.id (+30 more)

### Community 12 - "code file: staging-db-baseline.ts"
Cohesion: 0.11
Nodes (40): appendValues(), commandExport(), referenceTypeFor(), execFileAsync, databaseUrl(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged(), assertSha256() (+32 more)

### Community 13 - "Inventory schema"
Cohesion: 0.05
Nodes (39): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.reorderPoint, Inventory.reorderQuantity, Inventory.reservedStock (+31 more)

### Community 14 - "System schema"
Cohesion: 0.05
Nodes (38): System, ActivityEvent.createdAt, ActivityEvent.eventType, ActivityEvent.objectId, ActivityEvent.source, ActivityEvent.title, BusinessRule.actionType, BusinessRule.active (+30 more)

### Community 15 - "AI schema"
Cohesion: 0.05
Nodes (38): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.measuredAt, Thumbnail.prevClickRate, Thumbnail.status, Thumbnail.strategy (+30 more)

### Community 16 - "code file: dev-data-coupang.ts"
Cohesion: 0.12
Nodes (37): appendFlag(), appendOption(), BundleManifest, BundlePayload, BundleReference, commandReplay(), commandSanitize(), apiHeaders() (+29 more)

### Community 17 - "Orders schema"
Cohesion: 0.09
Nodes (20): ChannelReconciliationItem.legacyCode, MasterProduct.legacyCode, OrderReturnLineItem.createdAt, OrderReturnLineItem.productName, OrderReturnLineItem, Tx, collectIds(), ChannelReconciliationService (+12 more)

### Community 18 - "AgentOS schema"
Cohesion: 0.06
Nodes (35): AgentRun.adapterType, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt, AgentRun.heartbeatAt (+27 more)

### Community 19 - "code file: lifecycle-state.ts"
Cohesion: 0.06
Nodes (31): ProductLifecycleState, BundleComponentSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, Master, MasterImageItem, MasterImageItemSchema, MasterImageRole (+23 more)

### Community 20 - "Core schema"
Cohesion: 0.06
Nodes (34): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.category, MasterProduct.costCny, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description, MasterProduct.detailPageUrl (+26 more)

### Community 21 - "AI schema"
Cohesion: 0.1
Nodes (22): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.prismaSchemaHash, DataMigrationRun.releaseVersion (+14 more)

### Community 22 - "Sourcing schema"
Cohesion: 0.07
Nodes (29): Sourcing, CandidateImage.candidate, CandidateImage.createdAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.isPrimary, CandidateImage.mimeType, CandidateImage.sortOrder (+21 more)

### Community 23 - "Finance schema"
Cohesion: 0.07
Nodes (29): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdBy, ManualLedger.description, ManualLedger.memo, ProcessingCost.createdAt (+21 more)

### Community 24 - "Core schema"
Cohesion: 0.09
Nodes (26): Core, BundleComponent.bundleOption, BundleComponent.componentOption, BundleComponent.createdAt, BundleComponent.updatedAt, CategoryMapping.coupangCategoryId, CategoryMapping.createdAt, CategoryMapping.internalCategory (+18 more)

### Community 25 - "Orders schema"
Cohesion: 0.09
Nodes (25): SyncOrdersBodyDto, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.memo (+17 more)

### Community 26 - "Inventory schema"
Cohesion: 0.09
Nodes (25): StockTransaction.createdBy, StockTransaction.relatedId, StockTransaction.totalCost, StockTransaction.unitCost, StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.notes (+17 more)

### Community 27 - "code file: Order.status"
Cohesion: 0.1
Nodes (23): Order.status, DeliveryCompanySchema, OrderActionResponse, OrderActionResponseSchema, OrderLineItemSchema, OrderListItem, OrderListItemSchema, OrderListLineItem (+15 more)

### Community 28 - "code file: run-data-migrations.ts"
Cohesion: 0.17
Nodes (23): DATA_MIGRATION_RELEASES, Command, commandStatus(), createPrisma(), appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertMutatingTarget(), CliArgs (+15 more)

### Community 29 - "code file: sources.ts"
Cohesion: 0.09
Nodes (21): MigrationResult, OrderSheetResponse, PanelRunSource, PanelRunSourceSchema, sourceKeys, PanelAlertItem, PanelAlertItemSchema, PanelDismissEventSchema (+13 more)

### Community 30 - "System schema"
Cohesion: 0.09
Nodes (23): Alert.actorUser, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead, Alert.kind, Alert.message (+15 more)

### Community 31 - "System schema"
Cohesion: 0.09
Nodes (22): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.installCount, Marketplace.isPublished (+14 more)

### Community 32 - "Core schema"
Cohesion: 0.11
Nodes (21): ProductOption.availableStock, ProductOption.barcode, ProductOption.commissionRate, ProductOption.costPrice, ProductOption.createdAt, ProductOption.deletedAt, ProductOption.isBundle, ProductOption.isTemporary (+13 more)

### Community 33 - "Channels schema"
Cohesion: 0.1
Nodes (20): ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank, ChannelListingDailySnapshot.createdAt (+12 more)

### Community 34 - "AgentOS schema"
Cohesion: 0.1
Nodes (20): AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name, AgentInstance.parent, AgentInstance.pausedAt, AgentInstance.pauseReason (+12 more)

### Community 35 - "AI schema"
Cohesion: 0.1
Nodes (21): ContentGeneration.contentType, ContentGeneration.createdAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.generationInput, ContentGeneration.generationResult (+13 more)

### Community 36 - "AI schema"
Cohesion: 0.15
Nodes (19): packages/shared — @kiditem/shared, AI, DetailPageArtifact.currentRevision, DetailPageArtifact.registrationWorkspace, DetailPageArtifact.targetMaster, DetailPageRevision.artifact, RegistrationWorkspace.currentDetailPageArtifact, RegistrationWorkspace.currentDetailPageRevision (+11 more)

### Community 37 - "code file: patterns.ts"
Cohesion: 0.16
Nodes (15): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), parseBaseline(), readFiles(), SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject() (+7 more)

### Community 38 - "Core schema"
Cohesion: 0.11
Nodes (19): ActionTask.assigneeUser, ContentGeneration.triggeredByUser, DetailPageArtifact.createdAt, DetailPageRevision.createdByUser, OrganizationMembership.invitedBy, RegistrationWorkspace.createdAt, User.avatarUrl, User.createdAt (+11 more)

### Community 39 - "code file: dev-data-profiles.spec.ts"
Cohesion: 0.11
Nodes (17): bundleDir, consumerRoot, domainRoot, encryptedMirrorRoot, imageSyncPayloadPath, kiditemListPath, latestJson, payloadPath (+9 more)

### Community 40 - "AgentOS schema"
Cohesion: 0.12
Nodes (17): AgentRunRequest.claimedAt, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.createdAt, AgentRunRequest.finishedAt, AgentRunRequest.idempotencyKey, AgentRunRequest.lastErrorCode, AgentRunRequest.maxAttempts, AgentRunRequest.payload (+9 more)

### Community 41 - "AI schema"
Cohesion: 0.12
Nodes (16): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height, ContentAsset.label (+8 more)

### Community 42 - "Channels schema"
Cohesion: 0.12
Nodes (17): ChannelScrapeRun.businessDate, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.matchedCount, ChannelScrapeRun.metaJson, ChannelScrapeRun.pageType (+9 more)

### Community 43 - "code file: removed-legacy-scripts.spec.ts"
Cohesion: 0.12
Nodes (15): dataRoot, exportOutput, packageJson, payloadDir, runDevData(), tempRoot, absolutePath, deletedLegacyTables (+7 more)

### Community 44 - "Orders schema"
Cohesion: 0.15
Nodes (15): OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.metadata, OrderReturn.platform, OrderReturn.reason (+7 more)

### Community 45 - "Inventory schema"
Cohesion: 0.15
Nodes (14): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.disposedQty, ReturnTransfer.option, ReturnTransfer.processedBy, ReturnTransfer.quantity, ReturnTransfer.restockedQty, ReturnTransfer.rtNumber (+6 more)

### Community 46 - "Orders schema"
Cohesion: 0.15
Nodes (14): Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.id, Shipment.listing, Shipment.option (+6 more)

### Community 47 - "Core schema"
Cohesion: 0.18
Nodes (13): ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.isPrimary, ChannelAccount.sellerId, ChannelAccount.status, ChannelAccount.updatedAt, ChannelAccount.vendorId, ChannelAccount (+5 more)

### Community 48 - "AI schema"
Cohesion: 0.18
Nodes (12): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.originalGrade, ThumbnailTracking.originalScore, ThumbnailTracking.reviewsAfter, ThumbnailTracking.salesAfter (+4 more)

### Community 49 - "AgentOS schema"
Cohesion: 0.18
Nodes (12): AgentOS, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decision, AgentAuthorizationEvent.policySnapshot, AgentToolDefinition.createdAt, AgentToolDefinition.credentialKind, AgentToolDefinition.description, AgentToolDefinition.inputSchemaJson (+4 more)

### Community 50 - "AgentOS schema"
Cohesion: 0.17
Nodes (12): AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.inputTokens, AgentCostEvent.metadata, AgentCostEvent.model (+4 more)

### Community 51 - "AI schema"
Cohesion: 0.17
Nodes (12): ThumbnailGeneration.attemptCount, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.originalUrl, ThumbnailGeneration.registrationWorkspace, ThumbnailGeneration.sourceCandidate, ThumbnailGeneration.status, ThumbnailGeneration.triggeredByUser, ThumbnailGenerationCandidate.height (+4 more)

### Community 52 - "Inventory schema"
Cohesion: 0.18
Nodes (12): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.items, StockAudit.matchedCount, StockAudit.notes (+4 more)

### Community 53 - "Inventory schema"
Cohesion: 0.18
Nodes (12): PickingItem.pickingList, PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.listNumber, PickingList.pickedItems, PickingList.startedAt, PickingList.status (+4 more)

### Community 54 - "code file: coupang-client.ts"
Cohesion: 0.32
Nodes (9): CoupangCredentials, coupangRequest(), generateAuthorization(), approveReturn(), confirmOrderSheets(), getOrderSheets(), uploadInvoice(), getSellerProduct() (+1 more)

### Community 55 - "Orders schema"
Cohesion: 0.18
Nodes (12): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.metadata, OrderLineItem.productName, OrderLineItem.quantity, OrderLineItem.status, OrderLineItem.totalPrice, OrderLineItem.unitPrice (+4 more)

### Community 56 - "code file: prepare-coupang-extension.mjs"
Cohesion: 0.18
Nodes (9): DEFAULT_OUTPUT_PATH, addUnique(), defaultSourceDir, patchManifest(), runtimeFiles, manifest, dir, files (+1 more)

### Community 57 - "Community 57"
Cohesion: 0.2
Nodes (8): scanSummaryMessage(), errorMessage(), resultMessage(), isCoupangCredentialResolutionError(), syncCoupangOrders(), syncSingleCoupangOrder(), syncCoupangProducts(), syncSingleProductListing()

### Community 58 - "code file: channel-credential-crypto.ts"
Cohesion: 0.27
Nodes (8): readCredentialsConfig(), toJsonRecord(), toRecord(), trimToOptional(), CoupangCredentialCryptoError, encryptCredential(), EncryptedCredentialEnvelope, resolveKey()

### Community 59 - "AgentOS schema"
Cohesion: 0.22
Nodes (11): AgentRunRequest.taskSession, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.lastRun, AgentTaskSession.metadata, AgentTaskSession.sessionDisplay, AgentTaskSession.sessionParams (+3 more)

### Community 60 - "code file: channel-dashboard.ts"
Cohesion: 0.18
Nodes (10): ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow, ProductRankingRowSchema, ReturnFaultSplit, ReturnFaultSplitSchema, ReturnReasonRow, ReturnReasonRowSchema (+2 more)

### Community 61 - "Orders schema"
Cohesion: 0.2
Nodes (11): CSRecord.assignee, CSRecord.content, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.priority, CSRecord.resolution (+3 more)

### Community 62 - "AgentOS schema"
Cohesion: 0.2
Nodes (10): AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.totalCostMicros, AgentRuntimeState.totalInputTokens, AgentRuntimeState.totalRuns (+2 more)

### Community 63 - "code file: cli-args.ts"
Cohesion: 0.29
Nodes (8): Args, COMMANDS, ParsedArgs, parseRawArgs(), ParseRawArgsOptions, pushValue(), makeArgs(), map

### Community 64 - "Inventory schema"
Cohesion: 0.22
Nodes (9): PickingItem.createdAt, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.pickedAt, PickingItem.productName, PickingItem.quantity, PickingItem.verifiedAt (+1 more)

### Community 65 - "AgentOS schema"
Cohesion: 0.22
Nodes (9): AgentRunRequest.sourceWorkflowRun, WorkflowRun.contextData, WorkflowRun.error, WorkflowRun.startedAt, WorkflowRun.status, WorkflowRun.steps, WorkflowRun.triggeredBy, WorkflowRun.updatedAt (+1 more)

### Community 66 - "code file: common.ts"
Cohesion: 0.25
Nodes (6): ApiErrorResponse, ApiErrorResponseSchema, PaginatedResponse, SyncInfo, SyncInfoSchema, zIsoDate

### Community 67 - "code file: fs.ts"
Cohesion: 0.39
Nodes (5): fileSize(), readJson(), readTextIfExists(), sha256(), file

### Community 68 - "code file: ai.ts"
Cohesion: 0.29
Nodes (5): DetailImageCount, DetailImageCountSchema, DetailPageAgeGroup, DetailPageTemplateId, DetailPageTemplateIdSchema

### Community 69 - "AgentOS schema"
Cohesion: 0.33
Nodes (6): WorkflowTemplate.createdAt, WorkflowTemplate.description, WorkflowTemplate.marketplace, WorkflowTemplate.triggerType, WorkflowTemplate.version, WorkflowTemplate

### Community 70 - "AgentOS schema"
Cohesion: 0.4
Nodes (5): AgentRunEvent.createdAt, AgentRunEvent.level, AgentRunEvent.logRef, AgentRunEvent, AgentRunEvent unique(runId, seq)

### Community 71 - "AgentOS schema"
Cohesion: 0.4
Nodes (5): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decisionReason, AgentApprovalRequest.status, AgentApprovalRequest

### Community 72 - "code file: seed-agent-os.spec.ts"
Cohesion: 0.4
Nodes (4): definitions, seedPath, serverSeedPath, types

### Community 73 - "code file: inspection.ts"
Cohesion: 0.4
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 74 - "code file: readiness.ts"
Cohesion: 0.4
Nodes (4): ReadinessCheck, ReadinessCheckSchema, ReadinessResponse, ReadinessResponseSchema

### Community 75 - "code file: thumbnails.spec.ts"
Cohesion: 0.5
Nodes (3): parsed, CoupangImageSyncCapabilities, CoupangImageSyncRowSchema

## Knowledge Gaps
- **1153 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+1148 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Channels schema` to `Supply schema`, `Core schema`, `Finance schema`, `code file: ads.ts`, `code file: dev-data.ts`, `prisma field: channel-sync-order.service.ts`, `Advertising schema`, `code file: import-baseline-planner.ts`, `Orders schema`, `code file: staging-db-baseline.ts`, `Inventory schema`, `System schema`, `AI schema`, `code file: dev-data-coupang.ts`, `Orders schema`, `AgentOS schema`, `code file: lifecycle-state.ts`, `Core schema`, `AI schema`, `Sourcing schema`, `Finance schema`, `Core schema`, `Orders schema`, `Inventory schema`, `code file: Order.status`, `code file: sources.ts`, `System schema`, `Core schema`, `Channels schema`, `AgentOS schema`, `AI schema`, `AI schema`, `AgentOS schema`, `AI schema`, `Channels schema`, `Orders schema`, `Inventory schema`, `Orders schema`, `Core schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Inventory schema`, `Inventory schema`, `Orders schema`, `AgentOS schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`?**
  _High betweenness centrality (0.205) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `prisma field: channel-sync-order.service.ts` to `Channels schema`, `Supply schema`, `Core schema`, `Finance schema`, `Advertising schema`, `Orders schema`, `Inventory schema`, `System schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `Core schema`, `AI schema`, `Sourcing schema`, `Finance schema`, `Core schema`, `Orders schema`, `Inventory schema`, `System schema`, `System schema`, `Core schema`, `Channels schema`, `AgentOS schema`, `AI schema`, `AI schema`, `Core schema`, `AgentOS schema`, `AI schema`, `Channels schema`, `Orders schema`, `Inventory schema`, `Orders schema`, `Core schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Inventory schema`, `Inventory schema`, `Orders schema`, `AgentOS schema`, `Orders schema`, `AgentOS schema`, `Inventory schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`?**
  _High betweenness centrality (0.131) - this node is a cross-community bridge._
- **Why does `Inventory` connect `Inventory schema` to `Channels schema`, `Supply schema`, `Core schema`, `Finance schema`, `code file: dev-data.ts`, `prisma field: channel-sync-order.service.ts`, `code file: import-baseline-planner.ts`, `code file: check-directory-architecture.mjs`, `Orders schema`, `AI schema`, `code file: dev-data-coupang.ts`, `Orders schema`, `code file: lifecycle-state.ts`, `Core schema`, `AI schema`, `Orders schema`, `Inventory schema`, `code file: Order.status`, `Core schema`, `Channels schema`, `AI schema`, `AI schema`, `code file: dev-data-profiles.spec.ts`, `code file: removed-legacy-scripts.spec.ts`, `Inventory schema`, `Orders schema`, `AI schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `code file: common.ts`, `code file: thumbnails.spec.ts`, `code file: codes.ts`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **Are the 57 inferred relationships involving `Organization` (e.g. with `Thumbnail` and `ChannelReconciliationRun`) actually correct?**
  _`Organization` has 57 INFERRED edges - model-reasoned connections that need verification._
- **Are the 129 inferred relationships involving `Inventory` (e.g. with `Inventory.organization` and `StockTransfer`) actually correct?**
  _`Inventory` has 129 INFERRED edges - model-reasoned connections that need verification._
- **Are the 130 inferred relationships involving `ChannelReconciliationService` (e.g. with `AdAction.organization` and `AdAction.listing`) actually correct?**
  _`ChannelReconciliationService` has 130 INFERRED edges - model-reasoned connections that need verification._
- **Are the 125 inferred relationships involving `ChannelReconciliationRun` (e.g. with `ChannelReconciliationItem.externalId` and `ChannelReconciliationItem.legacyCode`) actually correct?**
  _`ChannelReconciliationRun` has 125 INFERRED edges - model-reasoned connections that need verification._