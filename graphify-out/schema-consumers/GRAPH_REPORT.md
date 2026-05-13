# Graph Report - schema-consumers  (2026-05-14)

## Corpus Check
- 190 files · ~87,033 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2013 nodes · 7661 edges · 89 communities (88 shown, 1 thin omitted)
- Extraction: 47% EXTRACTED · 53% INFERRED · 0% AMBIGUOUS · INFERRED: 4037 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_prisma field ProductOption.isActive|prisma field: ProductOption.isActive]]
- [[_COMMUNITY_code file generate-prisma-erd.mjs|code file: generate-prisma-erd.mjs]]
- [[_COMMUNITY_code file MasterProduct.barcode|code file: MasterProduct.barcode]]
- [[_COMMUNITY_code file dev-data.ts|code file: dev-data.ts]]
- [[_COMMUNITY_code file check-agents-hygiene.mjs|code file: check-agents-hygiene.mjs]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_code file staging-db-baseline.ts|code file: staging-db-baseline.ts]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_prisma field channel-reconciliation.types.ts|prisma field: channel-reconciliation.types.ts]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_code file dev-data-coupang.ts|code file: dev-data-coupang.ts]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file dashboard.ts|code file: dashboard.ts]]
- [[_COMMUNITY_code file lifecycle-state.ts|code file: lifecycle-state.ts]]
- [[_COMMUNITY_code file dev-data-profiles.spec.ts|code file: dev-data-profiles.spec.ts]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Sourcing schema|Sourcing schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_code file Order.status|code file: Order.status]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_code file run-data-migrations.ts|code file: run-data-migrations.ts]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_code file sources.ts|code file: sources.ts]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file channel-dashboard.pg.integration.spec.ts|code file: channel-dashboard.pg.integration.spec.ts]]
- [[_COMMUNITY_code file statistics.spec.ts|code file: statistics.spec.ts]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file patterns.ts|code file: patterns.ts]]
- [[_COMMUNITY_code file coupang-client.ts|code file: coupang-client.ts]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_code file channel-credential-crypto.ts|code file: channel-credential-crypto.ts]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_code file cli-args.ts|code file: cli-args.ts]]
- [[_COMMUNITY_code file prepare-coupang-extension.mjs|code file: prepare-coupang-extension.mjs]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file channel-dashboard.ts|code file: channel-dashboard.ts]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_prisma field ActionTask.targetId|prisma field: ActionTask.targetId]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_code file fs.ts|code file: fs.ts]]
- [[_COMMUNITY_code file ai.ts|code file: ai.ts]]
- [[_COMMUNITY_code file common.ts|code file: common.ts]]
- [[_COMMUNITY_code file reconciliation-action.dto.ts|code file: reconciliation-action.dto.ts]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_code file seed-agent-os.spec.ts|code file: seed-agent-os.spec.ts]]
- [[_COMMUNITY_code file inspection.ts|code file: inspection.ts]]
- [[_COMMUNITY_code file readiness.ts|code file: readiness.ts]]
- [[_COMMUNITY_code file thumbnails.spec.ts|code file: thumbnails.spec.ts]]
- [[_COMMUNITY_code file coupang-date-range.dto.ts|code file: coupang-date-range.dto.ts]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 212 edges
2. `Organization` - 183 edges
3. `Inventory` - 176 edges
4. `ChannelReconciliationRun` - 167 edges
5. `ChannelReconciliationService` - 167 edges
6. `ChannelSyncService` - 132 edges
7. `ActionTask` - 107 edges
8. `ChannelAccountService` - 106 edges
9. `ChannelDashboardService` - 105 edges
10. `prisma — Shared Schema` - 103 edges
11. `CoupangProviderPort` - 95 edges
12. `channels — Marketplace Sync And Reconciliation` - 94 edges

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

## Communities (89 total, 1 thin omitted)

### Community 0 - "Channels schema"
Cohesion: 0.06
Nodes (261): ChannelsModule, vendorItemId provider term, CoupangProviderAdapter, channels — Marketplace Sync And Reconciliation, prisma — Shared Schema, Channels, CoupangReconciliationRowDto, CoupangReconciliationScanDto (+253 more)

### Community 1 - "prisma field: ProductOption.isActive"
Cohesion: 0.04
Nodes (54): ProductOption.isActive, AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot (+46 more)

### Community 2 - "code file: generate-prisma-erd.mjs"
Cohesion: 0.08
Nodes (46): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, __dirname, extractDocValue() (+38 more)

### Community 3 - "code file: MasterProduct.barcode"
Cohesion: 0.06
Nodes (40): MasterProduct.barcode, row, clean(), HardConflict, KiditemPlan, NAME_FIELDS, normalizeForGroup(), planKiditemImport() (+32 more)

### Community 4 - "code file: dev-data.ts"
Cohesion: 0.11
Nodes (47): AdapterCommand, appendProjectReferenceDefaults(), archiveFileName(), archiveShaFileName(), BundlePackageIndex, cloudStorageRoot(), commandPack(), commandPublish() (+39 more)

### Community 5 - "code file: check-agents-hygiene.mjs"
Cohesion: 0.07
Nodes (34): checkClaudeShims(), checkTrackedClaudeDirectory(), findStaleInstructionLines(), git(), listTracked(), runChecks(), analyzeDirectoryArchitecture(), collectDirectoryArchitecture() (+26 more)

### Community 6 - "AI schema"
Cohesion: 0.06
Nodes (38): AI, ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height (+30 more)

### Community 7 - "code file: staging-db-baseline.ts"
Cohesion: 0.11
Nodes (39): commandExport(), referenceTypeFor(), execFileAsync, CliArgs, assertNonProductionTarget(), assertRestoreConfirmation(), assertSanitizedExportAcknowledged(), assertSha256() (+31 more)

### Community 8 - "Inventory schema"
Cohesion: 0.05
Nodes (39): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.reorderPoint, Inventory.reorderQuantity, Inventory.reservedStock (+31 more)

### Community 9 - "prisma field: channel-reconciliation.types.ts"
Cohesion: 0.08
Nodes (22): externalOptionId canonical option identity, ChannelListingOption.isUnmatched, ChannelReconciliationItem.legacyCode, MasterProduct.isDeleted, MasterProductImage.isDeleted, ReconciliationItem, Tx, collectIds() (+14 more)

### Community 10 - "Supply schema"
Cohesion: 0.06
Nodes (37): Supply, ChannelListing.master, MasterSupplierProduct.createdAt, MasterSupplierProduct.isPrimary, MasterSupplierProduct.updatedAt, ProcessingCost.master, PurchaseOrder.supplier, Supplier.address (+29 more)

### Community 11 - "code file: dev-data-coupang.ts"
Cohesion: 0.11
Nodes (38): appendFlag(), appendOption(), BundleManifest, BundlePayload, BundleReference, Command, commandReplay(), commandSanitize() (+30 more)

### Community 12 - "AI schema"
Cohesion: 0.05
Nodes (38): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.measuredAt, Thumbnail.prevClickRate, Thumbnail.status, Thumbnail.strategy (+30 more)

### Community 13 - "Core schema"
Cohesion: 0.06
Nodes (35): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.category, MasterProduct.costCny, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description, MasterProduct.detailPageUrl (+27 more)

### Community 14 - "AgentOS schema"
Cohesion: 0.06
Nodes (34): AgentRun.adapterType, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt, AgentRun.heartbeatAt (+26 more)

### Community 15 - "code file: dashboard.ts"
Cohesion: 0.06
Nodes (33): AdMetricsDetail, AdMetricsDetailSchema, AlertItemDashboard, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary (+25 more)

### Community 16 - "code file: lifecycle-state.ts"
Cohesion: 0.06
Nodes (31): ProductLifecycleState, BundleComponentSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, Master, MasterImageItem, MasterImageItemSchema, MasterImageRole (+23 more)

### Community 17 - "code file: dev-data-profiles.spec.ts"
Cohesion: 0.07
Nodes (31): bundleDir, consumerRoot, dataRoot, domainRoot, encryptedMirrorRoot, exportOutput, imageSyncPayloadPath, kiditemListPath (+23 more)

### Community 18 - "Advertising schema"
Cohesion: 0.07
Nodes (31): packages/shared — @kiditem/shared, Advertising, ExecutionLog.createdAt, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionTask.action, ExecutionTask.afterJson, ExecutionTask.attempt (+23 more)

### Community 19 - "Sourcing schema"
Cohesion: 0.07
Nodes (30): Sourcing, CandidateImage.candidate, CandidateImage.createdAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.isDeleted, CandidateImage.isPrimary, CandidateImage.mimeType (+22 more)

### Community 20 - "AgentOS schema"
Cohesion: 0.08
Nodes (27): AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name, AgentInstance.parent, AgentInstance.pausedAt, AgentInstance.pauseReason (+19 more)

### Community 21 - "Finance schema"
Cohesion: 0.07
Nodes (28): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdBy, ManualLedger.description, ManualLedger.memo, ProcessingCost.createdAt (+20 more)

### Community 22 - "Core schema"
Cohesion: 0.09
Nodes (28): BundleComponent.bundleOption, BundleComponent.componentOption, BundleComponent.createdAt, BundleComponent.updatedAt, ProductOption.availableStock, ProductOption.barcode, ProductOption.commissionRate, ProductOption.costPrice (+20 more)

### Community 23 - "Core schema"
Cohesion: 0.08
Nodes (27): ActionTask.assigneeUser, AgentRunRequest.sourceWorkflowRun, OrganizationMembership.invitedBy, ThumbnailGeneration.triggeredByUser, User.agentInstance, User.avatarUrl, User.createdAt, User.email (+19 more)

### Community 24 - "Orders schema"
Cohesion: 0.09
Nodes (25): SyncOrdersBodyDto, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.memo (+17 more)

### Community 25 - "Supply schema"
Cohesion: 0.08
Nodes (26): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.inspectedAt, PurchaseOrder.orderDate, PurchaseOrder.receivedAt (+18 more)

### Community 26 - "code file: Order.status"
Cohesion: 0.1
Nodes (23): Order.status, DeliveryCompanySchema, OrderActionResponse, OrderActionResponseSchema, OrderLineItemSchema, OrderListItem, OrderListItemSchema, OrderListLineItem (+15 more)

### Community 27 - "Finance schema"
Cohesion: 0.1
Nodes (24): ChannelAdTargetDailySnapshot.externalId, ChannelReconciliationItem.externalId, ProfitLoss.adCost, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit (+16 more)

### Community 28 - "System schema"
Cohesion: 0.08
Nodes (23): ErrorCodes, Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.installCount (+15 more)

### Community 29 - "System schema"
Cohesion: 0.09
Nodes (23): Alert.actorUser, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead, Alert.kind, Alert.message (+15 more)

### Community 30 - "code file: run-data-migrations.ts"
Cohesion: 0.22
Nodes (20): commandStatus(), createPrisma(), appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertMutatingTarget(), commandUp(), databaseUrl(), dataMigrationRunsTableExists() (+12 more)

### Community 31 - "System schema"
Cohesion: 0.1
Nodes (21): System, ActivityEvent.createdAt, ActivityEvent.eventType, ActivityEvent.objectId, ActivityEvent.source, ActivityEvent.title, FeatureGate.allowedOrganizations, FeatureGate.description (+13 more)

### Community 32 - "Inventory schema"
Cohesion: 0.12
Nodes (20): Shipment.warehouse, StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.notes, StockTransfer.quantity, StockTransfer.requestedBy, StockTransfer.toWarehouse (+12 more)

### Community 33 - "System schema"
Cohesion: 0.14
Nodes (15): DATA_MIGRATION_RELEASES, DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.prismaSchemaHash (+7 more)

### Community 34 - "code file: sources.ts"
Cohesion: 0.11
Nodes (18): MigrationResult, OrderSheetResponse, PanelRunSource, PanelRunSourceSchema, sourceKeys, PanelAlertItem, PanelDismissEvent, PanelEvent (+10 more)

### Community 35 - "Orders schema"
Cohesion: 0.11
Nodes (20): ChannelAdTargetDailySnapshot.listing, Order.listing, Review.content, Review.createdAt, Review.id, Review.listing, Review.platform, Review.rating (+12 more)

### Community 36 - "Advertising schema"
Cohesion: 0.11
Nodes (19): AdAction.actionType, AdAction.adTargetDaily, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt, AdAction.currentValue (+11 more)

### Community 37 - "Core schema"
Cohesion: 0.14
Nodes (18): Database ERD, Core, CategoryMapping.coupangCategoryId, CategoryMapping.createdAt, CategoryMapping.internalCategory, CategoryMapping.isActive, MasterCodeCounter.updatedAt, MasterCodeCounter.value (+10 more)

### Community 38 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentRunRequest.agentInstance, AgentRunRequest.claimedAt, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.createdAt, AgentRunRequest.finishedAt, AgentRunRequest.idempotencyKey, AgentRunRequest.lastErrorCode, AgentRunRequest.maxAttempts (+10 more)

### Community 39 - "Orders schema"
Cohesion: 0.12
Nodes (18): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+10 more)

### Community 40 - "Channels schema"
Cohesion: 0.12
Nodes (18): ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank, ChannelListingDailySnapshot.createdAt (+10 more)

### Community 41 - "System schema"
Cohesion: 0.12
Nodes (17): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+9 more)

### Community 42 - "Channels schema"
Cohesion: 0.12
Nodes (17): ChannelScrapeRun.businessDate, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.matchedCount, ChannelScrapeRun.metaJson, ChannelScrapeRun.pageType (+9 more)

### Community 43 - "Orders schema"
Cohesion: 0.12
Nodes (17): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.listingOption, OrderLineItem.metadata, OrderLineItem.option, OrderLineItem.productName, OrderLineItem.quantity, OrderLineItem.status (+9 more)

### Community 44 - "Core schema"
Cohesion: 0.15
Nodes (15): ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.isPrimary, ChannelAccount.sellerId, ChannelAccount.status, ChannelAccount.updatedAt, ChannelAccount.vendorId, ChannelAccount (+7 more)

### Community 45 - "Orders schema"
Cohesion: 0.15
Nodes (16): CSRecord.order, PickingItem.orderId, Shipment.order, UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.isNotified, UnshippedItem.option, UnshippedItem.productName (+8 more)

### Community 46 - "code file: channel-dashboard.pg.integration.spec.ts"
Cohesion: 0.12
Nodes (12): byDay, byReason, day15, ids, linkedReturnData, orderData, orphanReturnData, start (+4 more)

### Community 47 - "code file: statistics.spec.ts"
Cohesion: 0.13
Nodes (14): StatisticsCategoryRow, StatisticsCategoryRowSchema, StatisticsDeliveryDaily, StatisticsDeliveryDailySchema, StatisticsDeliveryResponse, StatisticsGradeRow, StatisticsOverview, StatisticsOverviewSchema (+6 more)

### Community 48 - "Orders schema"
Cohesion: 0.15
Nodes (15): OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.metadata, OrderReturn.platform, OrderReturn.reason (+7 more)

### Community 49 - "Core schema"
Cohesion: 0.15
Nodes (14): AdAction.listing, ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo, ChannelListing.exposureStatus, ChannelListing.externalId (+6 more)

### Community 50 - "AgentOS schema"
Cohesion: 0.15
Nodes (13): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.inputTokens, AgentCostEvent.metadata (+5 more)

### Community 51 - "AgentOS schema"
Cohesion: 0.17
Nodes (13): AgentOS, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decision, AgentAuthorizationEvent.policySnapshot, AgentToolDefinition.createdAt, AgentToolDefinition.credentialKind, AgentToolDefinition.description (+5 more)

### Community 52 - "Orders schema"
Cohesion: 0.15
Nodes (13): Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.listing, Shipment.option, Shipment.shippedAt (+5 more)

### Community 53 - "code file: patterns.ts"
Cohesion: 0.24
Nodes (10): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), scrubDeep(), scrubSecrets(), a, input, now (+2 more)

### Community 54 - "code file: coupang-client.ts"
Cohesion: 0.32
Nodes (9): CoupangCredentials, coupangRequest(), generateAuthorization(), approveReturn(), confirmOrderSheets(), getOrderSheets(), uploadInvoice(), getSellerProduct() (+1 more)

### Community 55 - "Inventory schema"
Cohesion: 0.18
Nodes (12): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.items, StockAudit.matchedCount, StockAudit.notes (+4 more)

### Community 56 - "code file: channel-credential-crypto.ts"
Cohesion: 0.27
Nodes (8): readCredentialsConfig(), toJsonRecord(), toRecord(), trimToOptional(), CoupangCredentialCryptoError, encryptCredential(), EncryptedCredentialEnvelope, resolveKey()

### Community 57 - "AI schema"
Cohesion: 0.18
Nodes (12): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.originalGrade, ThumbnailTracking.originalScore, ThumbnailTracking.reviewsAfter, ThumbnailTracking.salesAfter (+4 more)

### Community 58 - "Community 58"
Cohesion: 0.2
Nodes (8): scanSummaryMessage(), errorMessage(), resultMessage(), isCoupangCredentialResolutionError(), syncCoupangOrders(), syncSingleCoupangOrder(), syncCoupangProducts(), syncSingleProductListing()

### Community 59 - "code file: cli-args.ts"
Cohesion: 0.24
Nodes (10): appendValues(), Args, COMMANDS, ParsedArgs, parseRawArgs(), ParseRawArgsOptions, pushValue(), values() (+2 more)

### Community 60 - "code file: prepare-coupang-extension.mjs"
Cohesion: 0.18
Nodes (9): DEFAULT_OUTPUT_PATH, addUnique(), defaultSourceDir, patchManifest(), runtimeFiles, manifest, dir, files (+1 more)

### Community 61 - "Core schema"
Cohesion: 0.18
Nodes (11): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name, LegalEntity.representativeName (+3 more)

### Community 62 - "AgentOS schema"
Cohesion: 0.18
Nodes (11): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.totalCostMicros, AgentRuntimeState.totalInputTokens (+3 more)

### Community 63 - "AgentOS schema"
Cohesion: 0.22
Nodes (11): AgentRunRequest.taskSession, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.lastRun, AgentTaskSession.metadata, AgentTaskSession.sessionDisplay, AgentTaskSession.sessionParams (+3 more)

### Community 64 - "code file: channel-dashboard.ts"
Cohesion: 0.18
Nodes (10): ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow, ProductRankingRowSchema, ReturnFaultSplit, ReturnFaultSplitSchema, ReturnReasonRow, ReturnReasonRowSchema (+2 more)

### Community 65 - "Inventory schema"
Cohesion: 0.2
Nodes (11): PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.listNumber, PickingList.pickedItems, PickingList.startedAt, PickingList.status, PickingList.totalItems (+3 more)

### Community 66 - "prisma field: ActionTask.targetId"
Cohesion: 0.24
Nodes (7): ActionTask.targetId, AdAction.targetType, Alert.actionTask, Alert.targetId, Alert.targetType, DashboardInventorySummary, summary

### Community 67 - "Inventory schema"
Cohesion: 0.2
Nodes (11): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.disposedQty, ReturnTransfer.option, ReturnTransfer.processedBy, ReturnTransfer.quantity, ReturnTransfer.restockedQty, ReturnTransfer.rtNumber (+3 more)

### Community 68 - "Orders schema"
Cohesion: 0.18
Nodes (11): CSRecord.assignee, CSRecord.content, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing, CSRecord.priority (+3 more)

### Community 69 - "Inventory schema"
Cohesion: 0.2
Nodes (10): PickingItem.createdAt, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.pickedAt, PickingItem.pickingList, PickingItem.productName, PickingItem.quantity (+2 more)

### Community 70 - "Finance schema"
Cohesion: 0.2
Nodes (10): GradeHistory.calculatedAt, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.reason, GradeHistory.revenueScore, GradeHistory.score, GradeHistory.velocityScore (+2 more)

### Community 71 - "AI schema"
Cohesion: 0.22
Nodes (9): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.method, ThumbnailAnalysis.overallScore, ThumbnailAnalysis.qualityAnalyzedAt, ThumbnailAnalysis.recompose, ThumbnailAnalysis.scores, ThumbnailAnalysis.suggestions (+1 more)

### Community 72 - "code file: fs.ts"
Cohesion: 0.39
Nodes (5): fileSize(), readJson(), readTextIfExists(), sha256(), file

### Community 73 - "code file: ai.ts"
Cohesion: 0.29
Nodes (5): DetailImageCount, DetailImageCountSchema, DetailPageAgeGroup, DetailPageTemplateId, DetailPageTemplateIdSchema

### Community 74 - "code file: common.ts"
Cohesion: 0.29
Nodes (5): ApiErrorResponse, ApiErrorResponseSchema, PaginatedResponse, SyncInfo, SyncInfoSchema

### Community 75 - "code file: reconciliation-action.dto.ts"
Cohesion: 0.29
Nodes (5): CoupangReconciliationIgnoreDto, CoupangReconciliationLinkDto, RESOLUTION_SOURCES, STATUSES, StatusFilter

### Community 76 - "AgentOS schema"
Cohesion: 0.33
Nodes (6): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decisionReason, AgentApprovalRequest.status, AgentApprovalRequest

### Community 77 - "Inventory schema"
Cohesion: 0.33
Nodes (6): StockTransaction.createdBy, StockTransaction.relatedId, StockTransaction.totalCost, StockTransaction.unitCost, StockTransaction.warehouse, StockTransaction

### Community 78 - "code file: seed-agent-os.spec.ts"
Cohesion: 0.4
Nodes (4): definitions, seedPath, serverSeedPath, types

### Community 79 - "code file: inspection.ts"
Cohesion: 0.4
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 80 - "code file: readiness.ts"
Cohesion: 0.4
Nodes (4): ReadinessCheck, ReadinessCheckSchema, ReadinessResponse, ReadinessResponseSchema

### Community 81 - "code file: thumbnails.spec.ts"
Cohesion: 0.5
Nodes (3): parsed, CoupangImageSyncCapabilities, CoupangImageSyncRowSchema

## Knowledge Gaps
- **1138 isolated node(s):** `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority` (+1133 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Channels schema` to `prisma field: ProductOption.isActive`, `code file: generate-prisma-erd.mjs`, `code file: MasterProduct.barcode`, `code file: dev-data.ts`, `AI schema`, `code file: staging-db-baseline.ts`, `Inventory schema`, `prisma field: channel-reconciliation.types.ts`, `Supply schema`, `code file: dev-data-coupang.ts`, `AI schema`, `Core schema`, `AgentOS schema`, `code file: dashboard.ts`, `code file: lifecycle-state.ts`, `Advertising schema`, `Sourcing schema`, `AgentOS schema`, `Finance schema`, `Core schema`, `Orders schema`, `Supply schema`, `code file: Order.status`, `Finance schema`, `System schema`, `System schema`, `Inventory schema`, `System schema`, `code file: sources.ts`, `Orders schema`, `Advertising schema`, `Core schema`, `AgentOS schema`, `Orders schema`, `Channels schema`, `System schema`, `Channels schema`, `Orders schema`, `Core schema`, `Orders schema`, `code file: channel-dashboard.pg.integration.spec.ts`, `Orders schema`, `Core schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `Inventory schema`, `AI schema`, `Core schema`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `prisma field: ActionTask.targetId`, `Inventory schema`, `Orders schema`, `Finance schema`, `AI schema`, `AgentOS schema`, `Inventory schema`?**
  _High betweenness centrality (0.185) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `Core schema` to `Channels schema`, `prisma field: ProductOption.isActive`, `code file: MasterProduct.barcode`, `AI schema`, `Inventory schema`, `prisma field: channel-reconciliation.types.ts`, `Supply schema`, `AI schema`, `Core schema`, `AgentOS schema`, `Advertising schema`, `Sourcing schema`, `AgentOS schema`, `Finance schema`, `Core schema`, `Core schema`, `Orders schema`, `Supply schema`, `Finance schema`, `System schema`, `System schema`, `System schema`, `Inventory schema`, `System schema`, `Orders schema`, `Advertising schema`, `AgentOS schema`, `Orders schema`, `Channels schema`, `System schema`, `Channels schema`, `Orders schema`, `Core schema`, `Orders schema`, `Orders schema`, `Core schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `Inventory schema`, `AI schema`, `Core schema`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `prisma field: ActionTask.targetId`, `Inventory schema`, `Orders schema`, `Inventory schema`, `Finance schema`, `AI schema`, `AgentOS schema`, `Inventory schema`?**
  _High betweenness centrality (0.139) - this node is a cross-community bridge._
- **Why does `Inventory` connect `Inventory schema` to `Channels schema`, `code file: generate-prisma-erd.mjs`, `code file: MasterProduct.barcode`, `code file: dev-data.ts`, `code file: check-agents-hygiene.mjs`, `AI schema`, `prisma field: channel-reconciliation.types.ts`, `Supply schema`, `code file: dev-data-coupang.ts`, `AI schema`, `Core schema`, `code file: dashboard.ts`, `code file: lifecycle-state.ts`, `code file: dev-data-profiles.spec.ts`, `Advertising schema`, `Core schema`, `Orders schema`, `Supply schema`, `code file: Order.status`, `System schema`, `Inventory schema`, `System schema`, `Core schema`, `Channels schema`, `Orders schema`, `Core schema`, `Orders schema`, `code file: channel-dashboard.pg.integration.spec.ts`, `Orders schema`, `Inventory schema`, `Inventory schema`, `prisma field: ActionTask.targetId`, `Inventory schema`, `Inventory schema`, `Finance schema`, `AI schema`, `code file: common.ts`, `Inventory schema`, `code file: thumbnails.spec.ts`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Are the 53 inferred relationships involving `Organization` (e.g. with `Thumbnail` and `ChannelReconciliationRun`) actually correct?**
  _`Organization` has 53 INFERRED edges - model-reasoned connections that need verification._
- **Are the 126 inferred relationships involving `Inventory` (e.g. with `Inventory.organization` and `StockTransfer`) actually correct?**
  _`Inventory` has 126 INFERRED edges - model-reasoned connections that need verification._
- **Are the 122 inferred relationships involving `ChannelReconciliationRun` (e.g. with `ChannelReconciliationItem.externalId` and `ChannelReconciliationItem.legacyCode`) actually correct?**
  _`ChannelReconciliationRun` has 122 INFERRED edges - model-reasoned connections that need verification._
- **Are the 126 inferred relationships involving `ChannelReconciliationService` (e.g. with `AdAction.organization` and `AdAction.listing`) actually correct?**
  _`ChannelReconciliationService` has 126 INFERRED edges - model-reasoned connections that need verification._