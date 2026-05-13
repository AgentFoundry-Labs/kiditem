# Graph Report - schema-consumers  (2026-05-13)

## Corpus Check
- 187 files · ~84,284 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1976 nodes · 7501 edges · 88 communities (87 shown, 1 thin omitted)
- Extraction: 47% EXTRACTED · 53% INFERRED · 0% AMBIGUOUS · INFERRED: 3946 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file ads.ts|code file: ads.ts]]
- [[_COMMUNITY_code file generate-prisma-erd.mjs|code file: generate-prisma-erd.mjs]]
- [[_COMMUNITY_code file dev-data.ts|code file: dev-data.ts]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_code file staging-db-baseline.ts|code file: staging-db-baseline.ts]]
- [[_COMMUNITY_code file dev-data-coupang.ts|code file: dev-data-coupang.ts]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_code file dashboard.ts|code file: dashboard.ts]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_prisma field channel-reconciliation.types.ts|prisma field: channel-reconciliation.types.ts]]
- [[_COMMUNITY_code file lifecycle-state.ts|code file: lifecycle-state.ts]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file check-directory-architecture.mjs|code file: check-directory-architecture.mjs]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file import-baseline-planner.ts|code file: import-baseline-planner.ts]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_prisma field MasterProduct.barcode|prisma field: MasterProduct.barcode]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file sources.ts|code file: sources.ts]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_code file dev-data-profiles.spec.ts|code file: dev-data-profiles.spec.ts]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Sourcing schema|Sourcing schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_code file removed-legacy-scripts.spec.ts|code file: removed-legacy-scripts.spec.ts]]
- [[_COMMUNITY_code file check-agents-hygiene.mjs|code file: check-agents-hygiene.mjs]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Sourcing schema|Sourcing schema]]
- [[_COMMUNITY_code file patterns.ts|code file: patterns.ts]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file prepare-coupang-extension.mjs|code file: prepare-coupang-extension.mjs]]
- [[_COMMUNITY_code file check-pr-reconstruction-contract.mjs|code file: check-pr-reconstruction-contract.mjs]]
- [[_COMMUNITY_code file channel-credential-crypto.ts|code file: channel-credential-crypto.ts]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_code file cli-args.ts|code file: cli-args.ts]]
- [[_COMMUNITY_code file channel-dashboard.ts|code file: channel-dashboard.ts]]
- [[_COMMUNITY_code file coupang-client.ts|code file: coupang-client.ts]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file fs.ts|code file: fs.ts]]
- [[_COMMUNITY_code file common.ts|code file: common.ts]]
- [[_COMMUNITY_code file order.spec.ts|code file: order.spec.ts]]
- [[_COMMUNITY_code file ai.ts|code file: ai.ts]]
- [[_COMMUNITY_code file check-script-inventory.mjs|code file: check-script-inventory.mjs]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_code file inspection.ts|code file: inspection.ts]]
- [[_COMMUNITY_code file readiness.ts|code file: readiness.ts]]
- [[_COMMUNITY_code file seed-agent-os.spec.ts|code file: seed-agent-os.spec.ts]]
- [[_COMMUNITY_code file path.ts|code file: path.ts]]
- [[_COMMUNITY_code file coupang-date-range.dto.ts|code file: coupang-date-range.dto.ts]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 208 edges
2. `Organization` - 177 edges
3. `Inventory` - 175 edges
4. `ChannelReconciliationRun` - 165 edges
5. `ChannelReconciliationService` - 165 edges
6. `ChannelSyncService` - 130 edges
7. `ActionTask` - 105 edges
8. `ChannelAccountService` - 104 edges
9. `ChannelDashboardService` - 103 edges
10. `prisma — Shared Schema` - 100 edges
11. `CoupangProviderPort` - 93 edges
12. `channels — Marketplace Sync And Reconciliation` - 92 edges

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

## Communities (88 total, 1 thin omitted)

### Community 0 - "Channels schema"
Cohesion: 0.05
Nodes (274): ChannelsModule, CoupangProviderAdapter, channels — Marketplace Sync And Reconciliation, prisma — Shared Schema, Channels, CoupangReconciliationRowDto, CoupangReconciliationScanDto, AppException (+266 more)

### Community 1 - "Core schema"
Cohesion: 0.05
Nodes (70): AdAction.externalId, AdAction.listing, ChannelAdTargetDailySnapshot.externalId, ChannelAdTargetDailySnapshot.listing, ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt, ChannelListing.deliveryChargeType (+62 more)

### Community 2 - "Orders schema"
Cohesion: 0.06
Nodes (61): externalOptionId canonical option identity, vendorItemId provider term, Database ERD, ActionTask.targetId, AdAction.targetType, AgentApprovalRequest.agentInstance, AgentAuthorizationEvent.agentInstance, AgentCostEvent.agentInstance (+53 more)

### Community 3 - "code file: ads.ts"
Cohesion: 0.04
Nodes (53): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot, AdCollectStatus (+45 more)

### Community 4 - "code file: generate-prisma-erd.mjs"
Cohesion: 0.07
Nodes (46): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, __dirname, extractDocValue() (+38 more)

### Community 5 - "code file: dev-data.ts"
Cohesion: 0.11
Nodes (48): AdapterCommand, appendProjectReferenceDefaults(), archiveFileName(), archiveShaFileName(), BundlePackageIndex, cloudStorageRoot(), commandPack(), commandPublish() (+40 more)

### Community 6 - "Advertising schema"
Cohesion: 0.05
Nodes (47): Advertising, AdAction.actionType, AdAction.adTargetDaily, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+39 more)

### Community 7 - "AI schema"
Cohesion: 0.05
Nodes (41): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.measuredAt, Thumbnail.prevClickRate, Thumbnail.status, Thumbnail.strategy (+33 more)

### Community 8 - "code file: staging-db-baseline.ts"
Cohesion: 0.11
Nodes (40): Command, commandExport(), referenceTypeFor(), execFileAsync, CliArgs, assertNonProductionTarget(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged() (+32 more)

### Community 9 - "code file: dev-data-coupang.ts"
Cohesion: 0.11
Nodes (39): appendFlag(), appendOption(), BundleManifest, BundlePayload, BundleReference, commandReplay(), commandSanitize(), apiHeaders() (+31 more)

### Community 10 - "Inventory schema"
Cohesion: 0.05
Nodes (39): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.reorderPoint, Inventory.reorderQuantity, Inventory.reservedStock (+31 more)

### Community 11 - "code file: dashboard.ts"
Cohesion: 0.06
Nodes (34): AdMetricsDetail, AdMetricsDetailSchema, AlertItemDashboard, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary (+26 more)

### Community 12 - "Core schema"
Cohesion: 0.06
Nodes (35): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.category, MasterProduct.costCny, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description, MasterProduct.detailPageUrl (+27 more)

### Community 13 - "prisma field: channel-reconciliation.types.ts"
Cohesion: 0.09
Nodes (17): ChannelReconciliationItem.legacyCode, Shipment.option, Tx, collectIds(), ChannelReconciliationService, ChannelListingHandle, ChannelListingOptionHandle, MatchOutcome (+9 more)

### Community 14 - "code file: lifecycle-state.ts"
Cohesion: 0.06
Nodes (31): ProductLifecycleState, BundleComponentSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, Master, MasterImageItem, MasterImageItemSchema, MasterImageRole (+23 more)

### Community 15 - "AgentOS schema"
Cohesion: 0.06
Nodes (34): AgentRun.adapterType, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt, AgentRun.heartbeatAt (+26 more)

### Community 16 - "code file: check-directory-architecture.mjs"
Cohesion: 0.15
Nodes (27): DATA_MIGRATION_RELEASES, analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), listDirectories(), commandStatus(), createPrisma(), main(), applyWingPlan() (+19 more)

### Community 17 - "Supply schema"
Cohesion: 0.07
Nodes (28): MasterSupplierProduct.createdAt, MasterSupplierProduct.isPrimary, MasterSupplierProduct.updatedAt, PickingItem.createdAt, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.pickedAt (+20 more)

### Community 18 - "Core schema"
Cohesion: 0.09
Nodes (29): BundleComponent.bundleOption, BundleComponent.componentOption, BundleComponent.createdAt, BundleComponent.updatedAt, ProductOption.availableStock, ProductOption.barcode, ProductOption.commissionRate, ProductOption.costPrice (+21 more)

### Community 19 - "Finance schema"
Cohesion: 0.07
Nodes (28): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdBy, ManualLedger.description, ManualLedger.memo, ProcessingCost.createdAt (+20 more)

### Community 20 - "Orders schema"
Cohesion: 0.09
Nodes (26): SyncOrdersBodyDto, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.memo (+18 more)

### Community 21 - "code file: import-baseline-planner.ts"
Cohesion: 0.1
Nodes (22): row, clean(), HardConflict, NAME_FIELDS, projectWingRow(), rowName(), rowOptionName(), toInt() (+14 more)

### Community 22 - "System schema"
Cohesion: 0.08
Nodes (23): ErrorCodes, Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.installCount (+15 more)

### Community 23 - "Orders schema"
Cohesion: 0.09
Nodes (20): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.isNotified, UnshippedItem.option, UnshippedItem.productName, UnshippedItem.quantity, UnshippedItem.reason, UnshippedItem (+12 more)

### Community 24 - "System schema"
Cohesion: 0.09
Nodes (23): Alert.actorUser, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead, Alert.kind, Alert.message (+15 more)

### Community 25 - "AgentOS schema"
Cohesion: 0.1
Nodes (22): ActionTask.assigneeUser, AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decisionReason, AgentApprovalRequest.status, AgentRunRequest.requestedBy, OrganizationMembership.invitedBy, ThumbnailGeneration.triggeredByUser (+14 more)

### Community 26 - "prisma field: MasterProduct.barcode"
Cohesion: 0.11
Nodes (16): MasterProduct.barcode, KiditemPlan, normalizeForGroup(), planKiditemImport(), PlannedMaster, PlannedOption, planWingMatches(), WingPlan (+8 more)

### Community 27 - "AI schema"
Cohesion: 0.1
Nodes (21): packages/shared — @kiditem/shared, AI, ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.originalImages, ContentGeneration.processedImages (+13 more)

### Community 28 - "AgentOS schema"
Cohesion: 0.1
Nodes (20): AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name, AgentInstance.parent, AgentInstance.pausedAt, AgentInstance.pauseReason (+12 more)

### Community 29 - "code file: sources.ts"
Cohesion: 0.1
Nodes (19): MigrationResult, OrderSheetResponse, PanelRunSource, PanelRunSourceSchema, sourceKeys, PanelAlertItem, PanelDismissEvent, PanelEvent (+11 more)

### Community 30 - "Core schema"
Cohesion: 0.11
Nodes (20): Core, CategoryMapping.coupangCategoryId, CategoryMapping.createdAt, CategoryMapping.internalCategory, LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt (+12 more)

### Community 31 - "Inventory schema"
Cohesion: 0.12
Nodes (19): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.notes, StockTransfer.quantity, StockTransfer.requestedBy, StockTransfer.toWarehouse, StockTransfer.updatedAt (+11 more)

### Community 32 - "Orders schema"
Cohesion: 0.12
Nodes (18): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+10 more)

### Community 33 - "Channels schema"
Cohesion: 0.12
Nodes (18): ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank, ChannelListingDailySnapshot.createdAt (+10 more)

### Community 34 - "code file: dev-data-profiles.spec.ts"
Cohesion: 0.11
Nodes (17): bundleDir, consumerRoot, domainRoot, encryptedMirrorRoot, imageSyncPayloadPath, kiditemListPath, latestJson, payloadPath (+9 more)

### Community 35 - "Supply schema"
Cohesion: 0.11
Nodes (18): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.inspectedAt, PurchaseOrder.orderDate, PurchaseOrder.receivedAt (+10 more)

### Community 36 - "Supply schema"
Cohesion: 0.12
Nodes (17): Supply, Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.leadTimeDays, Supplier.name, Supplier.notes (+9 more)

### Community 37 - "Channels schema"
Cohesion: 0.12
Nodes (17): ChannelScrapeRun.businessDate, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.matchedCount, ChannelScrapeRun.metaJson, ChannelScrapeRun.pageType (+9 more)

### Community 38 - "AgentOS schema"
Cohesion: 0.12
Nodes (17): AgentOS, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decision, AgentAuthorizationEvent.policySnapshot, AgentRunEvent.createdAt, AgentRunEvent.level, AgentRunEvent.logRef, AgentToolDefinition.createdAt (+9 more)

### Community 39 - "System schema"
Cohesion: 0.12
Nodes (17): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+9 more)

### Community 40 - "Core schema"
Cohesion: 0.15
Nodes (15): ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.isPrimary, ChannelAccount.sellerId, ChannelAccount.status, ChannelAccount.updatedAt, ChannelAccount.vendorId, ChannelAccount (+7 more)

### Community 41 - "AgentOS schema"
Cohesion: 0.13
Nodes (16): AgentRunRequest.claimedAt, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.createdAt, AgentRunRequest.finishedAt, AgentRunRequest.idempotencyKey, AgentRunRequest.lastErrorCode, AgentRunRequest.maxAttempts, AgentRunRequest.payload (+8 more)

### Community 42 - "Orders schema"
Cohesion: 0.15
Nodes (15): OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.metadata, OrderReturn.platform, OrderReturn.reason (+7 more)

### Community 43 - "Sourcing schema"
Cohesion: 0.14
Nodes (14): Sourcing, SourcingCandidate.costCny, SourcingCandidate.description, SourcingCandidate.imageUrl, SourcingCandidate.promotedMaster, SourcingCandidate.rawData, SourcingCandidate.rejectedAt, SourcingCandidate.sourcePlatform (+6 more)

### Community 44 - "System schema"
Cohesion: 0.13
Nodes (15): System, ActivityEvent.createdAt, ActivityEvent.eventType, ActivityEvent.objectId, ActivityEvent.source, ActivityEvent.title, MigrationCheckpoint.createdAt, MigrationCheckpoint.updatedAt (+7 more)

### Community 45 - "System schema"
Cohesion: 0.14
Nodes (13): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.prismaSchemaHash, DataMigrationRun.releaseVersion (+5 more)

### Community 46 - "code file: removed-legacy-scripts.spec.ts"
Cohesion: 0.13
Nodes (14): dataRoot, exportOutput, packageJson, payloadDir, runDevData(), tempRoot, absolutePath, deletedLegacyTables (+6 more)

### Community 47 - "code file: check-agents-hygiene.mjs"
Cohesion: 0.22
Nodes (11): checkClaudeShims(), checkTrackedClaudeDirectory(), findStaleInstructionLines(), git(), listTracked(), runChecks(), analyzeSchemaArtifactSync(), changedFilesFromGit() (+3 more)

### Community 48 - "Orders schema"
Cohesion: 0.14
Nodes (12): CoupangReconciliationIgnoreDto, CoupangReconciliationLinkDto, RESOLUTION_SOURCES, STATUSES, StatusFilter, Review.content, Review.createdAt, Review.platform (+4 more)

### Community 49 - "Sourcing schema"
Cohesion: 0.15
Nodes (13): CandidateImage.candidate, CandidateImage.createdAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.isPrimary, CandidateImage.mimeType, CandidateImage.sortOrder, CandidateImage.source (+5 more)

### Community 50 - "code file: patterns.ts"
Cohesion: 0.24
Nodes (10): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), scrubDeep(), scrubSecrets(), a, input, now (+2 more)

### Community 51 - "Inventory schema"
Cohesion: 0.18
Nodes (12): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.items, StockAudit.matchedCount, StockAudit.notes (+4 more)

### Community 52 - "Inventory schema"
Cohesion: 0.18
Nodes (12): PickingItem.pickingList, PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.listNumber, PickingList.pickedItems, PickingList.startedAt, PickingList.status (+4 more)

### Community 53 - "AI schema"
Cohesion: 0.18
Nodes (12): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.originalGrade, ThumbnailTracking.originalScore, ThumbnailTracking.reviewsAfter, ThumbnailTracking.salesAfter (+4 more)

### Community 54 - "AgentOS schema"
Cohesion: 0.17
Nodes (12): AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.inputTokens, AgentCostEvent.metadata, AgentCostEvent.model (+4 more)

### Community 55 - "code file: prepare-coupang-extension.mjs"
Cohesion: 0.18
Nodes (9): DEFAULT_OUTPUT_PATH, addUnique(), defaultSourceDir, patchManifest(), runtimeFiles, manifest, dir, files (+1 more)

### Community 56 - "code file: check-pr-reconstruction-contract.mjs"
Cohesion: 0.2
Nodes (7): analyzeReconstructionTriggers(), ghPrBody(), isCrossLayerControlChange(), missingBodyFields(), readPrBody(), REQUIRED_LABELS, triggers

### Community 57 - "code file: channel-credential-crypto.ts"
Cohesion: 0.27
Nodes (8): readCredentialsConfig(), toJsonRecord(), toRecord(), trimToOptional(), CoupangCredentialCryptoError, encryptCredential(), EncryptedCredentialEnvelope, resolveKey()

### Community 58 - "Community 58"
Cohesion: 0.2
Nodes (8): scanSummaryMessage(), errorMessage(), resultMessage(), isCoupangCredentialResolutionError(), syncCoupangOrders(), syncSingleCoupangOrder(), syncCoupangProducts(), syncSingleProductListing()

### Community 59 - "code file: cli-args.ts"
Cohesion: 0.24
Nodes (10): appendValues(), Args, COMMANDS, ParsedArgs, parseRawArgs(), ParseRawArgsOptions, pushValue(), values() (+2 more)

### Community 60 - "code file: channel-dashboard.ts"
Cohesion: 0.18
Nodes (10): ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow, ProductRankingRowSchema, ReturnFaultSplit, ReturnFaultSplitSchema, ReturnReasonRow, ReturnReasonRowSchema (+2 more)

### Community 61 - "code file: coupang-client.ts"
Cohesion: 0.36
Nodes (8): CoupangCredentials, coupangRequest(), generateAuthorization(), approveReturn(), confirmOrderSheets(), getOrderSheets(), uploadInvoice(), getSellerProduct()

### Community 62 - "Orders schema"
Cohesion: 0.18
Nodes (11): Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.shippedAt, Shipment.status, Shipment.trackingNo (+3 more)

### Community 63 - "Inventory schema"
Cohesion: 0.2
Nodes (11): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.disposedQty, ReturnTransfer.option, ReturnTransfer.processedBy, ReturnTransfer.quantity, ReturnTransfer.restockedQty, ReturnTransfer.rtNumber (+3 more)

### Community 64 - "AgentOS schema"
Cohesion: 0.22
Nodes (11): AgentRunRequest.taskSession, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.lastRun, AgentTaskSession.metadata, AgentTaskSession.sessionDisplay, AgentTaskSession.sessionParams (+3 more)

### Community 65 - "Orders schema"
Cohesion: 0.2
Nodes (10): CSRecord.assignee, CSRecord.content, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.priority, CSRecord.resolution (+2 more)

### Community 66 - "Finance schema"
Cohesion: 0.2
Nodes (10): GradeHistory.calculatedAt, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.reason, GradeHistory.revenueScore, GradeHistory.score, GradeHistory.velocityScore (+2 more)

### Community 67 - "AgentOS schema"
Cohesion: 0.2
Nodes (10): AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.totalCostMicros, AgentRuntimeState.totalInputTokens, AgentRuntimeState.totalRuns (+2 more)

### Community 68 - "AgentOS schema"
Cohesion: 0.22
Nodes (9): AgentRunRequest.sourceWorkflowRun, WorkflowRun.contextData, WorkflowRun.error, WorkflowRun.startedAt, WorkflowRun.status, WorkflowRun.steps, WorkflowRun.triggeredBy, WorkflowRun.updatedAt (+1 more)

### Community 69 - "code file: fs.ts"
Cohesion: 0.39
Nodes (5): fileSize(), readJson(), readTextIfExists(), sha256(), file

### Community 70 - "code file: common.ts"
Cohesion: 0.29
Nodes (5): ApiErrorResponse, ApiErrorResponseSchema, PaginatedResponse, SyncInfo, SyncInfoSchema

### Community 71 - "code file: order.spec.ts"
Cohesion: 0.29
Nodes (6): OrderActionResponseSchema, OrderListItemSchema, OrderListResponseSchema, OrderStatsResponseSchema, OrderStatusSchema, baseOrderListItem

### Community 72 - "code file: ai.ts"
Cohesion: 0.29
Nodes (5): DetailImageCount, DetailImageCountSchema, DetailPageAgeGroup, DetailPageTemplateId, DetailPageTemplateIdSchema

### Community 73 - "code file: check-script-inventory.mjs"
Cohesion: 0.38
Nodes (5): analyzeInventory(), listTopLevelScriptFiles(), SCRIPT_INVENTORY, SUPPORT_FILES, result

### Community 74 - "Supply schema"
Cohesion: 0.29
Nodes (7): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.paidDate, SupplierPayment.purchaseOrder, SupplierPayment.status, SupplierPayment.updatedAt, SupplierPayment

### Community 75 - "AgentOS schema"
Cohesion: 0.33
Nodes (6): WorkflowTemplate.createdAt, WorkflowTemplate.description, WorkflowTemplate.marketplace, WorkflowTemplate.triggerType, WorkflowTemplate.version, WorkflowTemplate

### Community 76 - "System schema"
Cohesion: 0.33
Nodes (6): FeatureGate.allowedOrganizations, FeatureGate.description, FeatureGate.metadata, FeatureGate.updatedAt, FeatureGate, FeatureGateSchema

### Community 77 - "code file: inspection.ts"
Cohesion: 0.4
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 78 - "code file: readiness.ts"
Cohesion: 0.4
Nodes (4): ReadinessCheck, ReadinessCheckSchema, ReadinessResponse, ReadinessResponseSchema

### Community 79 - "code file: seed-agent-os.spec.ts"
Cohesion: 0.4
Nodes (4): definitions, seedPath, serverSeedPath, types

### Community 80 - "code file: path.ts"
Cohesion: 0.7
Nodes (3): assertSafeRelativePath(), expandHome(), repoPath()

## Knowledge Gaps
- **1119 isolated node(s):** `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority` (+1114 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Channels schema` to `Core schema`, `Orders schema`, `code file: ads.ts`, `code file: dev-data.ts`, `Advertising schema`, `AI schema`, `code file: staging-db-baseline.ts`, `code file: dev-data-coupang.ts`, `Inventory schema`, `code file: dashboard.ts`, `Core schema`, `prisma field: channel-reconciliation.types.ts`, `code file: lifecycle-state.ts`, `AgentOS schema`, `Core schema`, `Finance schema`, `Orders schema`, `Orders schema`, `System schema`, `AgentOS schema`, `prisma field: MasterProduct.barcode`, `AI schema`, `AgentOS schema`, `code file: sources.ts`, `Core schema`, `Inventory schema`, `Orders schema`, `Channels schema`, `Supply schema`, `Supply schema`, `Channels schema`, `AgentOS schema`, `System schema`, `Core schema`, `AgentOS schema`, `Orders schema`, `Sourcing schema`, `System schema`, `System schema`, `Orders schema`, `Sourcing schema`, `Inventory schema`, `Inventory schema`, `AI schema`, `AgentOS schema`, `Orders schema`, `Inventory schema`, `AgentOS schema`, `Orders schema`, `Finance schema`, `AgentOS schema`, `code file: order.spec.ts`, `Supply schema`, `AgentOS schema`, `System schema`?**
  _High betweenness centrality (0.181) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `Orders schema` to `Channels schema`, `Core schema`, `Advertising schema`, `AI schema`, `Inventory schema`, `Core schema`, `prisma field: channel-reconciliation.types.ts`, `AgentOS schema`, `Supply schema`, `Core schema`, `Finance schema`, `Orders schema`, `System schema`, `Orders schema`, `System schema`, `AgentOS schema`, `prisma field: MasterProduct.barcode`, `AI schema`, `AgentOS schema`, `Core schema`, `Inventory schema`, `Orders schema`, `Channels schema`, `Supply schema`, `Supply schema`, `Channels schema`, `AgentOS schema`, `System schema`, `Core schema`, `AgentOS schema`, `Orders schema`, `Sourcing schema`, `System schema`, `System schema`, `Orders schema`, `Sourcing schema`, `Inventory schema`, `Inventory schema`, `AI schema`, `AgentOS schema`, `Orders schema`, `Inventory schema`, `AgentOS schema`, `Orders schema`, `Finance schema`, `AgentOS schema`, `AgentOS schema`, `Supply schema`, `AgentOS schema`, `System schema`?**
  _High betweenness centrality (0.139) - this node is a cross-community bridge._
- **Why does `Inventory` connect `Inventory schema` to `Channels schema`, `Core schema`, `Orders schema`, `code file: dev-data.ts`, `AI schema`, `code file: dev-data-coupang.ts`, `code file: dashboard.ts`, `Core schema`, `prisma field: channel-reconciliation.types.ts`, `code file: lifecycle-state.ts`, `code file: check-directory-architecture.mjs`, `Supply schema`, `Core schema`, `Orders schema`, `code file: import-baseline-planner.ts`, `System schema`, `Orders schema`, `prisma field: MasterProduct.barcode`, `AI schema`, `Inventory schema`, `Channels schema`, `code file: dev-data-profiles.spec.ts`, `Supply schema`, `Core schema`, `code file: removed-legacy-scripts.spec.ts`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `Finance schema`, `code file: common.ts`, `code file: check-script-inventory.mjs`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Are the 50 inferred relationships involving `Organization` (e.g. with `Thumbnail` and `ChannelReconciliationRun`) actually correct?**
  _`Organization` has 50 INFERRED edges - model-reasoned connections that need verification._
- **Are the 125 inferred relationships involving `Inventory` (e.g. with `Inventory.organization` and `StockTransfer`) actually correct?**
  _`Inventory` has 125 INFERRED edges - model-reasoned connections that need verification._
- **Are the 120 inferred relationships involving `ChannelReconciliationRun` (e.g. with `ChannelReconciliationItem.externalId` and `ChannelReconciliationItem.legacyCode`) actually correct?**
  _`ChannelReconciliationRun` has 120 INFERRED edges - model-reasoned connections that need verification._
- **Are the 124 inferred relationships involving `ChannelReconciliationService` (e.g. with `AdAction.organization` and `AdAction.listing`) actually correct?**
  _`ChannelReconciliationService` has 124 INFERRED edges - model-reasoned connections that need verification._