# Graph Report - schema-consumers  (2026-05-15)

## Corpus Check
- 196 files · ~89,845 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2048 nodes · 7852 edges · 87 communities (86 shown, 1 thin omitted)
- Extraction: 47% EXTRACTED · 53% INFERRED · 0% AMBIGUOUS · INFERRED: 4131 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_code file ads.ts|code file: ads.ts]]
- [[_COMMUNITY_prisma field MasterProduct.barcode|prisma field: MasterProduct.barcode]]
- [[_COMMUNITY_code file dev-data.ts|code file: dev-data.ts]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_prisma field ActionTask.targetId|prisma field: ActionTask.targetId]]
- [[_COMMUNITY_code file check-agents-hygiene.mjs|code file: check-agents-hygiene.mjs]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file staging-db-baseline.ts|code file: staging-db-baseline.ts]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file dev-data-coupang.ts|code file: dev-data-coupang.ts]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file ChannelReconciliationItem.externalId|code file: ChannelReconciliationItem.externalId]]
- [[_COMMUNITY_Sourcing schema|Sourcing schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_code file generate-prisma-erd.mjs|code file: generate-prisma-erd.mjs]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_code file Order.status|code file: Order.status]]
- [[_COMMUNITY_code file generate-schema-graphify.py|code file: generate-schema-graphify.py]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_code file run-data-migrations.ts|code file: run-data-migrations.ts]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_code file sources.ts|code file: sources.ts]]
- [[_COMMUNITY_code file patterns.ts|code file: patterns.ts]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file coupang-client.ts|code file: coupang-client.ts]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_code file cli-args.ts|code file: cli-args.ts]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_code file prepare-coupang-extension.mjs|code file: prepare-coupang-extension.mjs]]
- [[_COMMUNITY_code file channel-credential-crypto.ts|code file: channel-credential-crypto.ts]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file channel-dashboard.ts|code file: channel-dashboard.ts]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_code file fs.ts|code file: fs.ts]]
- [[_COMMUNITY_code file reconciliation-action.dto.ts|code file: reconciliation-action.dto.ts]]
- [[_COMMUNITY_code file common.ts|code file: common.ts]]
- [[_COMMUNITY_code file ai.ts|code file: ai.ts]]
- [[_COMMUNITY_code file check-script-inventory.mjs|code file: check-script-inventory.mjs]]
- [[_COMMUNITY_code file seed-agent-os.spec.ts|code file: seed-agent-os.spec.ts]]
- [[_COMMUNITY_code file inspection.ts|code file: inspection.ts]]
- [[_COMMUNITY_code file readiness.ts|code file: readiness.ts]]
- [[_COMMUNITY_prisma field ChannelReconciliationItem.legacyCode|prisma field: ChannelReconciliationItem.legacyCode]]
- [[_COMMUNITY_code file coupang-date-range.dto.ts|code file: coupang-date-range.dto.ts]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 215 edges
2. `Organization` - 188 edges
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

## Communities (87 total, 1 thin omitted)

### Community 0 - "Channels schema"
Cohesion: 0.05
Nodes (276): ChannelsModule, vendorItemId provider term, CoupangProviderAdapter, channels — Marketplace Sync And Reconciliation, prisma — Shared Schema, Channels, CoupangReconciliationRowDto, CoupangReconciliationScanDto (+268 more)

### Community 1 - "code file: ads.ts"
Cohesion: 0.04
Nodes (53): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot, AdCollectStatus (+45 more)

### Community 2 - "prisma field: MasterProduct.barcode"
Cohesion: 0.05
Nodes (42): MasterProduct.barcode, MasterProduct.isDeleted, MasterProductImage.isDeleted, row, clean(), HardConflict, KiditemPlan, NAME_FIELDS (+34 more)

### Community 3 - "code file: dev-data.ts"
Cohesion: 0.1
Nodes (46): AdapterCommand, appendProjectReferenceDefaults(), archiveFileName(), archiveShaFileName(), BundlePackageIndex, cloudStorageRoot(), commandPack(), commandPublish() (+38 more)

### Community 4 - "Core schema"
Cohesion: 0.06
Nodes (45): externalOptionId canonical option identity, ChannelAdTargetDailySnapshot.externalId, ChannelAdTargetDailySnapshot.listing, ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo (+37 more)

### Community 5 - "prisma field: ActionTask.targetId"
Cohesion: 0.05
Nodes (40): ActionTask.targetId, AdAction.targetType, Alert.actionTask, Alert.targetId, Alert.targetType, AdMetricsDetail, AdMetricsDetailSchema, AlertItemDashboard (+32 more)

### Community 6 - "code file: check-agents-hygiene.mjs"
Cohesion: 0.08
Nodes (33): checkClaudeShims(), checkTrackedClaudeDirectory(), findStaleInstructionLines(), git(), listTracked(), runChecks(), analyzeDirectoryArchitecture(), collectDirectoryArchitecture() (+25 more)

### Community 7 - "Orders schema"
Cohesion: 0.06
Nodes (41): SyncOrdersBodyDto, CSRecord.order, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id (+33 more)

### Community 8 - "code file: staging-db-baseline.ts"
Cohesion: 0.1
Nodes (41): commandExport(), referenceTypeFor(), createZipArchive(), execFileAsync, extractZipArchive(), CliArgs, assertNonProductionTarget(), assertRestoreConfirmation() (+33 more)

### Community 9 - "Orders schema"
Cohesion: 0.08
Nodes (24): OrderReturnLineItem.createdAt, OrderReturnLineItem.productName, ProcessingCost.master, PurchaseOrderItem.option, ReturnTransfer.option, Shipment.option, OrderReturnLineItem, ReconciliationItem (+16 more)

### Community 10 - "code file: dev-data-coupang.ts"
Cohesion: 0.11
Nodes (39): appendFlag(), appendOption(), BundleManifest, BundlePayload, BundleReference, Command, commandReplay(), commandSanitize() (+31 more)

### Community 11 - "Inventory schema"
Cohesion: 0.05
Nodes (36): StockTransaction.createdBy, StockTransaction.relatedId, StockTransaction.totalCost, StockTransaction.unitCost, StockTransaction, ProductLifecycleState, BundleComponentSchema, GetMasterImagesResponse (+28 more)

### Community 12 - "Inventory schema"
Cohesion: 0.05
Nodes (39): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.reorderPoint, Inventory.reorderQuantity, Inventory.reservedStock (+31 more)

### Community 13 - "AI schema"
Cohesion: 0.05
Nodes (38): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.measuredAt, Thumbnail.prevClickRate, Thumbnail.status, Thumbnail.strategy (+30 more)

### Community 14 - "Supply schema"
Cohesion: 0.07
Nodes (35): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.isPrimary, MasterSupplierProduct.updatedAt, PurchaseOrder.supplier, Supplier.address, Supplier.contactName, Supplier.createdAt (+27 more)

### Community 15 - "Core schema"
Cohesion: 0.06
Nodes (35): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.category, MasterProduct.costCny, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description, MasterProduct.detailPageUrl (+27 more)

### Community 16 - "AgentOS schema"
Cohesion: 0.06
Nodes (34): AgentRun.adapterType, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt, AgentRun.heartbeatAt (+26 more)

### Community 17 - "code file: ChannelReconciliationItem.externalId"
Cohesion: 0.07
Nodes (32): ChannelReconciliationItem.externalId, bundleDir, consumerRoot, dataRoot, domainRoot, encryptedMirrorRoot, exportOutput, imageSyncPayloadPath (+24 more)

### Community 18 - "Sourcing schema"
Cohesion: 0.07
Nodes (31): Sourcing, CandidateImage.candidate, CandidateImage.createdAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.isDeleted, CandidateImage.isPrimary, CandidateImage.mimeType (+23 more)

### Community 19 - "AI schema"
Cohesion: 0.08
Nodes (30): AI, ContentGeneration.contentType, ContentGeneration.createdAt, ContentGeneration.detailPageArtifact, ContentGeneration.editedHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.generationInput (+22 more)

### Community 20 - "AgentOS schema"
Cohesion: 0.07
Nodes (28): AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name, AgentInstance.parent, AgentInstance.pausedAt, AgentInstance.pauseReason (+20 more)

### Community 21 - "Core schema"
Cohesion: 0.09
Nodes (29): BundleComponent.bundleOption, BundleComponent.componentOption, BundleComponent.createdAt, BundleComponent.updatedAt, ProductOption.availableStock, ProductOption.barcode, ProductOption.commissionRate, ProductOption.costPrice (+21 more)

### Community 22 - "code file: generate-prisma-erd.mjs"
Cohesion: 0.12
Nodes (26): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, __dirname, extractDocValue() (+18 more)

### Community 23 - "Inventory schema"
Cohesion: 0.09
Nodes (28): Database ERD, CategoryMapping.coupangCategoryId, CategoryMapping.createdAt, CategoryMapping.internalCategory, CategoryMapping.isActive, Shipment.warehouse, StockTransaction.warehouse, StockTransfer.completedAt (+20 more)

### Community 24 - "Orders schema"
Cohesion: 0.08
Nodes (26): Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.listing, Shipment.shippedAt, Shipment.status (+18 more)

### Community 25 - "System schema"
Cohesion: 0.11
Nodes (19): DATA_MIGRATION_RELEASES, DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.prismaSchemaHash (+11 more)

### Community 26 - "AgentOS schema"
Cohesion: 0.09
Nodes (25): ActionTask.assigneeUser, AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decisionReason, AgentApprovalRequest.status, AgentRunRequest.requestedBy, DetailPageRevision.createdByUser (+17 more)

### Community 27 - "Supply schema"
Cohesion: 0.08
Nodes (25): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.inspectedAt, PurchaseOrder.orderDate, PurchaseOrder.receivedAt (+17 more)

### Community 28 - "code file: Order.status"
Cohesion: 0.1
Nodes (23): Order.status, DeliveryCompanySchema, OrderActionResponse, OrderActionResponseSchema, OrderLineItemSchema, OrderListItem, OrderListItemSchema, OrderListLineItem (+15 more)

### Community 29 - "code file: generate-schema-graphify.py"
Cohesion: 0.2
Nodes (20): add_code_reference_edges(), add_document_mentions(), add_schema_graph(), camel(), collect_block(), collect_code(), community_labels(), doc_value() (+12 more)

### Community 30 - "System schema"
Cohesion: 0.08
Nodes (23): ErrorCodes, Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.installCount (+15 more)

### Community 31 - "System schema"
Cohesion: 0.09
Nodes (23): Alert.actorUser, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead, Alert.kind, Alert.message (+15 more)

### Community 32 - "code file: run-data-migrations.ts"
Cohesion: 0.22
Nodes (20): commandStatus(), createPrisma(), appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertMutatingTarget(), commandUp(), databaseUrl(), dataMigrationRunsTableExists() (+12 more)

### Community 33 - "System schema"
Cohesion: 0.1
Nodes (21): System, ActivityEvent.createdAt, ActivityEvent.eventType, ActivityEvent.objectId, ActivityEvent.source, ActivityEvent.title, FeatureGate.allowedOrganizations, FeatureGate.description (+13 more)

### Community 34 - "Inventory schema"
Cohesion: 0.1
Nodes (21): PickingItem.createdAt, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.pickedAt, PickingItem.pickingList, PickingItem.productName, PickingItem.quantity (+13 more)

### Community 35 - "code file: sources.ts"
Cohesion: 0.11
Nodes (18): MigrationResult, OrderSheetResponse, PanelRunSource, PanelRunSourceSchema, sourceKeys, PanelAlertItem, PanelDismissEvent, PanelEvent (+10 more)

### Community 36 - "code file: patterns.ts"
Cohesion: 0.16
Nodes (15): analyzeSharedInterfaceNames(), exportedZodContracts(), isVisibleContractName(), parseBaseline(), readFiles(), SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject() (+7 more)

### Community 37 - "Finance schema"
Cohesion: 0.11
Nodes (20): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdBy, ManualLedger.description, ManualLedger.memo, SalesPlan.actualOrders (+12 more)

### Community 38 - "Advertising schema"
Cohesion: 0.11
Nodes (19): AdAction.actionType, AdAction.adTargetDaily, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt, AdAction.currentValue (+11 more)

### Community 39 - "Orders schema"
Cohesion: 0.12
Nodes (18): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+10 more)

### Community 40 - "Orders schema"
Cohesion: 0.12
Nodes (19): AdAction.listing, Review.content, Review.createdAt, Review.id, Review.listing, Review.platform, Review.rating, Review.reviewedAt (+11 more)

### Community 41 - "Channels schema"
Cohesion: 0.12
Nodes (18): ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank, ChannelListingDailySnapshot.createdAt (+10 more)

### Community 42 - "AgentOS schema"
Cohesion: 0.13
Nodes (17): AgentRunRequest.agentInstance, AgentRunRequest.claimedAt, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.createdAt, AgentRunRequest.finishedAt, AgentRunRequest.idempotencyKey, AgentRunRequest.lastErrorCode, AgentRunRequest.maxAttempts (+9 more)

### Community 43 - "System schema"
Cohesion: 0.12
Nodes (17): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+9 more)

### Community 44 - "Channels schema"
Cohesion: 0.12
Nodes (17): ChannelScrapeRun.businessDate, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.matchedCount, ChannelScrapeRun.metaJson, ChannelScrapeRun.pageType (+9 more)

### Community 45 - "AI schema"
Cohesion: 0.12
Nodes (17): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height, ContentAsset.isDeleted (+9 more)

### Community 46 - "AgentOS schema"
Cohesion: 0.12
Nodes (16): AgentRunRequest.sourceWorkflowRun, WorkflowRun.contextData, WorkflowRun.error, WorkflowRun.startedAt, WorkflowRun.status, WorkflowRun.steps, WorkflowRun.triggeredBy, WorkflowRun.updatedAt (+8 more)

### Community 47 - "Core schema"
Cohesion: 0.15
Nodes (15): ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.isPrimary, ChannelAccount.sellerId, ChannelAccount.status, ChannelAccount.updatedAt, ChannelAccount.vendorId, ChannelAccount (+7 more)

### Community 48 - "Core schema"
Cohesion: 0.13
Nodes (15): Core, LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+7 more)

### Community 49 - "Orders schema"
Cohesion: 0.15
Nodes (15): OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.metadata, OrderReturn.platform, OrderReturn.reason (+7 more)

### Community 50 - "Advertising schema"
Cohesion: 0.14
Nodes (14): ExecutionLog.createdAt, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionTask.action, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt (+6 more)

### Community 51 - "Orders schema"
Cohesion: 0.15
Nodes (14): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.listingOption, OrderLineItem.metadata, OrderLineItem.option, OrderLineItem.productName, OrderLineItem.quantity, OrderLineItem.status (+6 more)

### Community 52 - "AgentOS schema"
Cohesion: 0.15
Nodes (13): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.inputTokens, AgentCostEvent.metadata (+5 more)

### Community 53 - "AgentOS schema"
Cohesion: 0.17
Nodes (13): AgentOS, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decision, AgentAuthorizationEvent.policySnapshot, AgentToolDefinition.createdAt, AgentToolDefinition.credentialKind, AgentToolDefinition.description (+5 more)

### Community 54 - "code file: coupang-client.ts"
Cohesion: 0.32
Nodes (9): CoupangCredentials, coupangRequest(), generateAuthorization(), approveReturn(), confirmOrderSheets(), getOrderSheets(), uploadInvoice(), getSellerProduct() (+1 more)

### Community 55 - "AI schema"
Cohesion: 0.18
Nodes (12): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.originalGrade, ThumbnailTracking.originalScore, ThumbnailTracking.reviewsAfter, ThumbnailTracking.salesAfter (+4 more)

### Community 56 - "code file: cli-args.ts"
Cohesion: 0.24
Nodes (10): appendValues(), Args, COMMANDS, ParsedArgs, parseRawArgs(), ParseRawArgsOptions, pushValue(), values() (+2 more)

### Community 57 - "Inventory schema"
Cohesion: 0.18
Nodes (12): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.items, StockAudit.matchedCount, StockAudit.notes (+4 more)

### Community 58 - "code file: prepare-coupang-extension.mjs"
Cohesion: 0.18
Nodes (9): DEFAULT_OUTPUT_PATH, addUnique(), defaultSourceDir, patchManifest(), runtimeFiles, manifest, dir, files (+1 more)

### Community 59 - "code file: channel-credential-crypto.ts"
Cohesion: 0.27
Nodes (8): readCredentialsConfig(), toJsonRecord(), toRecord(), trimToOptional(), CoupangCredentialCryptoError, encryptCredential(), EncryptedCredentialEnvelope, resolveKey()

### Community 60 - "Community 60"
Cohesion: 0.2
Nodes (8): scanSummaryMessage(), errorMessage(), resultMessage(), isCoupangCredentialResolutionError(), syncCoupangOrders(), syncSingleCoupangOrder(), syncCoupangProducts(), syncSingleProductListing()

### Community 61 - "AgentOS schema"
Cohesion: 0.18
Nodes (11): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.totalCostMicros, AgentRuntimeState.totalInputTokens (+3 more)

### Community 62 - "AgentOS schema"
Cohesion: 0.22
Nodes (11): AgentRunRequest.taskSession, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.lastRun, AgentTaskSession.metadata, AgentTaskSession.sessionDisplay, AgentTaskSession.sessionParams (+3 more)

### Community 63 - "code file: channel-dashboard.ts"
Cohesion: 0.18
Nodes (10): ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow, ProductRankingRowSchema, ReturnFaultSplit, ReturnFaultSplitSchema, ReturnReasonRow, ReturnReasonRowSchema (+2 more)

### Community 64 - "Orders schema"
Cohesion: 0.18
Nodes (11): CSRecord.assignee, CSRecord.content, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing, CSRecord.priority (+3 more)

### Community 65 - "Inventory schema"
Cohesion: 0.22
Nodes (10): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.disposedQty, ReturnTransfer.processedBy, ReturnTransfer.quantity, ReturnTransfer.restockedQty, ReturnTransfer.rtNumber, ReturnTransfer.updatedAt (+2 more)

### Community 66 - "Finance schema"
Cohesion: 0.2
Nodes (10): GradeHistory.calculatedAt, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.reason, GradeHistory.revenueScore, GradeHistory.score, GradeHistory.velocityScore (+2 more)

### Community 67 - "Advertising schema"
Cohesion: 0.22
Nodes (9): packages/shared — @kiditem/shared, Advertising, ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.isActive, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.url (+1 more)

### Community 68 - "AI schema"
Cohesion: 0.22
Nodes (9): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.method, ThumbnailAnalysis.overallScore, ThumbnailAnalysis.qualityAnalyzedAt, ThumbnailAnalysis.recompose, ThumbnailAnalysis.scores, ThumbnailAnalysis.suggestions (+1 more)

### Community 69 - "Advertising schema"
Cohesion: 0.25
Nodes (8): ExecutionTask.worker, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentUrl, ExecutionWorker.lastHeartbeatAt, ExecutionWorker.metaJson, ExecutionWorker.status, ExecutionWorker

### Community 70 - "Finance schema"
Cohesion: 0.25
Nodes (8): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.processType, ProcessingCost.productName, ProcessingCost.quantity, ProcessingCost.totalCost, ProcessingCost.vendor, ProcessingCost

### Community 71 - "code file: fs.ts"
Cohesion: 0.39
Nodes (5): fileSize(), readJson(), readTextIfExists(), writeJson(), file

### Community 72 - "code file: reconciliation-action.dto.ts"
Cohesion: 0.29
Nodes (5): CoupangReconciliationIgnoreDto, CoupangReconciliationLinkDto, RESOLUTION_SOURCES, STATUSES, StatusFilter

### Community 73 - "code file: common.ts"
Cohesion: 0.29
Nodes (5): ApiErrorResponse, ApiErrorResponseSchema, PaginatedResponse, SyncInfo, SyncInfoSchema

### Community 74 - "code file: ai.ts"
Cohesion: 0.29
Nodes (5): DetailImageCount, DetailImageCountSchema, DetailPageAgeGroup, DetailPageTemplateId, DetailPageTemplateIdSchema

### Community 75 - "code file: check-script-inventory.mjs"
Cohesion: 0.38
Nodes (5): analyzeInventory(), listTopLevelScriptFiles(), SCRIPT_INVENTORY, SUPPORT_FILES, result

### Community 76 - "code file: seed-agent-os.spec.ts"
Cohesion: 0.4
Nodes (4): definitions, seedPath, serverSeedPath, types

### Community 77 - "code file: inspection.ts"
Cohesion: 0.4
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 78 - "code file: readiness.ts"
Cohesion: 0.4
Nodes (4): ReadinessCheck, ReadinessCheckSchema, ReadinessResponse, ReadinessResponseSchema

### Community 79 - "prisma field: ChannelReconciliationItem.legacyCode"
Cohesion: 0.5
Nodes (3): ChannelReconciliationItem.legacyCode, CoupangImageSyncCapabilities, CoupangImageSyncRowSchema

## Knowledge Gaps
- **1142 isolated node(s):** `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority` (+1137 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Channels schema` to `code file: ads.ts`, `prisma field: MasterProduct.barcode`, `code file: dev-data.ts`, `Core schema`, `prisma field: ActionTask.targetId`, `Orders schema`, `code file: staging-db-baseline.ts`, `Orders schema`, `code file: dev-data-coupang.ts`, `Inventory schema`, `Inventory schema`, `AI schema`, `Supply schema`, `Core schema`, `AgentOS schema`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `Core schema`, `Inventory schema`, `Orders schema`, `System schema`, `AgentOS schema`, `Supply schema`, `code file: Order.status`, `code file: generate-schema-graphify.py`, `System schema`, `System schema`, `Inventory schema`, `code file: sources.ts`, `Finance schema`, `Advertising schema`, `Orders schema`, `Orders schema`, `Channels schema`, `AgentOS schema`, `System schema`, `Channels schema`, `AI schema`, `AgentOS schema`, `Core schema`, `Core schema`, `Orders schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Inventory schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `Inventory schema`, `Finance schema`, `Advertising schema`, `AI schema`, `Advertising schema`, `Finance schema`?**
  _High betweenness centrality (0.197) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `Inventory schema` to `Channels schema`, `prisma field: MasterProduct.barcode`, `Core schema`, `prisma field: ActionTask.targetId`, `Orders schema`, `Orders schema`, `Inventory schema`, `Inventory schema`, `AI schema`, `Supply schema`, `Core schema`, `AgentOS schema`, `code file: ChannelReconciliationItem.externalId`, `Sourcing schema`, `AI schema`, `AgentOS schema`, `Core schema`, `Orders schema`, `System schema`, `AgentOS schema`, `Supply schema`, `System schema`, `System schema`, `System schema`, `Inventory schema`, `Finance schema`, `Advertising schema`, `Orders schema`, `Orders schema`, `Channels schema`, `AgentOS schema`, `System schema`, `Channels schema`, `AI schema`, `AgentOS schema`, `Core schema`, `Core schema`, `Orders schema`, `Advertising schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `AI schema`, `Inventory schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `Inventory schema`, `Finance schema`, `Advertising schema`, `AI schema`, `Advertising schema`, `Finance schema`, `prisma field: ChannelReconciliationItem.legacyCode`?**
  _High betweenness centrality (0.142) - this node is a cross-community bridge._
- **Why does `Inventory` connect `Inventory schema` to `Channels schema`, `prisma field: MasterProduct.barcode`, `code file: dev-data.ts`, `Core schema`, `prisma field: ActionTask.targetId`, `code file: check-agents-hygiene.mjs`, `Orders schema`, `Orders schema`, `code file: dev-data-coupang.ts`, `Inventory schema`, `AI schema`, `Supply schema`, `Core schema`, `code file: ChannelReconciliationItem.externalId`, `AI schema`, `Core schema`, `Inventory schema`, `System schema`, `code file: Order.status`, `code file: generate-schema-graphify.py`, `System schema`, `Inventory schema`, `Orders schema`, `Channels schema`, `Core schema`, `Orders schema`, `Inventory schema`, `Inventory schema`, `Finance schema`, `Advertising schema`, `AI schema`, `code file: common.ts`, `code file: check-script-inventory.mjs`, `prisma field: ChannelReconciliationItem.legacyCode`?**
  _High betweenness centrality (0.109) - this node is a cross-community bridge._
- **Are the 55 inferred relationships involving `Organization` (e.g. with `Thumbnail` and `ChannelReconciliationRun`) actually correct?**
  _`Organization` has 55 INFERRED edges - model-reasoned connections that need verification._
- **Are the 128 inferred relationships involving `Inventory` (e.g. with `Inventory.organization` and `StockTransfer`) actually correct?**
  _`Inventory` has 128 INFERRED edges - model-reasoned connections that need verification._
- **Are the 124 inferred relationships involving `ChannelReconciliationRun` (e.g. with `ChannelReconciliationItem.externalId` and `ChannelReconciliationItem.legacyCode`) actually correct?**
  _`ChannelReconciliationRun` has 124 INFERRED edges - model-reasoned connections that need verification._
- **Are the 128 inferred relationships involving `ChannelReconciliationService` (e.g. with `AdAction.organization` and `AdAction.listing`) actually correct?**
  _`ChannelReconciliationService` has 128 INFERRED edges - model-reasoned connections that need verification._