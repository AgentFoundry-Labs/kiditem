# Graph Report - schema-consumers  (2026-05-14)

## Corpus Check
- 190 files · ~87,019 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2015 nodes · 7666 edges · 84 communities (82 shown, 2 thin omitted)
- Extraction: 47% EXTRACTED · 53% INFERRED · 0% AMBIGUOUS · INFERRED: 4042 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_code file ads.ts|code file: ads.ts]]
- [[_COMMUNITY_code file generate-prisma-erd.mjs|code file: generate-prisma-erd.mjs]]
- [[_COMMUNITY_code file dev-data.ts|code file: dev-data.ts]]
- [[_COMMUNITY_prisma field ChannelReconciliationItem.legacyCode|prisma field: ChannelReconciliationItem.legacyCode]]
- [[_COMMUNITY_code file check-directory-architecture.mjs|code file: check-directory-architecture.mjs]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_code file dev-data-coupang.ts|code file: dev-data-coupang.ts]]
- [[_COMMUNITY_prisma field ActionTask.targetId|prisma field: ActionTask.targetId]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_code file staging-db-baseline.ts|code file: staging-db-baseline.ts]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file lifecycle-state.ts|code file: lifecycle-state.ts]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_code file channel-reconciliation.types.ts|code file: channel-reconciliation.types.ts]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Sourcing schema|Sourcing schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file Order.status|code file: Order.status]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_code file run-data-migrations.ts|code file: run-data-migrations.ts]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_code file sources.ts|code file: sources.ts]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_code file dev-data-profiles.spec.ts|code file: dev-data-profiles.spec.ts]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file removed-legacy-scripts.spec.ts|code file: removed-legacy-scripts.spec.ts]]
- [[_COMMUNITY_code file patterns.ts|code file: patterns.ts]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_code file coupang-client.ts|code file: coupang-client.ts]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_code file channel-credential-crypto.ts|code file: channel-credential-crypto.ts]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file channel-dashboard.ts|code file: channel-dashboard.ts]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_code file cli-args.ts|code file: cli-args.ts]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file ai.ts|code file: ai.ts]]
- [[_COMMUNITY_code file common.ts|code file: common.ts]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_code file seed-agent-os.spec.ts|code file: seed-agent-os.spec.ts]]
- [[_COMMUNITY_code file inspection.ts|code file: inspection.ts]]
- [[_COMMUNITY_code file readiness.ts|code file: readiness.ts]]
- [[_COMMUNITY_code file codes.ts|code file: codes.ts]]
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

## Communities (84 total, 2 thin omitted)

### Community 0 - "Channels schema"
Cohesion: 0.06
Nodes (258): ChannelsModule, CoupangProviderAdapter, channels — Marketplace Sync And Reconciliation, prisma — Shared Schema, Channels, CoupangReconciliationRowDto, CoupangReconciliationScanDto, AppException (+250 more)

### Community 1 - "Core schema"
Cohesion: 0.07
Nodes (69): externalOptionId canonical option identity, vendorItemId provider term, Database ERD, AdAction.externalId, AdAction.listing, AgentApprovalRequest.agentInstance, AgentAuthorizationEvent.agentInstance, AgentCostEvent.agentInstance (+61 more)

### Community 2 - "code file: ads.ts"
Cohesion: 0.04
Nodes (53): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot, AdCollectStatus (+45 more)

### Community 3 - "code file: generate-prisma-erd.mjs"
Cohesion: 0.07
Nodes (46): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, __dirname, extractDocValue() (+38 more)

### Community 4 - "code file: dev-data.ts"
Cohesion: 0.1
Nodes (47): AdapterCommand, appendProjectReferenceDefaults(), archiveFileName(), archiveShaFileName(), BundlePackageIndex, cloudStorageRoot(), commandPack(), commandPublish() (+39 more)

### Community 5 - "prisma field: ChannelReconciliationItem.legacyCode"
Cohesion: 0.06
Nodes (41): ChannelReconciliationItem.legacyCode, MasterProduct.barcode, MasterProduct.legacyCode, row, clean(), HardConflict, KiditemPlan, NAME_FIELDS (+33 more)

### Community 6 - "code file: check-directory-architecture.mjs"
Cohesion: 0.06
Nodes (36): git(), analyzeDirectoryArchitecture(), collectDirectoryArchitecture(), listDirectories(), analyzeReconstructionTriggers(), ghPrBody(), isCrossLayerControlChange(), missingBodyFields() (+28 more)

### Community 7 - "Advertising schema"
Cohesion: 0.05
Nodes (48): packages/shared — @kiditem/shared, Advertising, AdAction.actionType, AdAction.adTargetDaily, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson (+40 more)

### Community 8 - "code file: dev-data-coupang.ts"
Cohesion: 0.1
Nodes (43): appendFlag(), appendOption(), BundleManifest, BundlePayload, BundleReference, commandReplay(), commandSanitize(), apiHeaders() (+35 more)

### Community 9 - "prisma field: ActionTask.targetId"
Cohesion: 0.05
Nodes (40): ActionTask.targetId, AdAction.targetType, Alert.actionTask, Alert.targetId, Alert.targetType, AdMetricsDetail, AdMetricsDetailSchema, AlertItemDashboard (+32 more)

### Community 10 - "Finance schema"
Cohesion: 0.05
Nodes (42): ChannelListing.master, ProcessingCost.master, ProfitLoss.adCost, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.month, ProfitLoss.netProfit, ProfitLoss.orderCount (+34 more)

### Community 11 - "code file: staging-db-baseline.ts"
Cohesion: 0.1
Nodes (42): appendValues(), commandExport(), referenceTypeFor(), createZipArchive(), execFileAsync, extractZipArchive(), databaseUrl(), assertRestoreConfirmation() (+34 more)

### Community 12 - "AI schema"
Cohesion: 0.05
Nodes (40): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.measuredAt, Thumbnail.prevClickRate, Thumbnail.status, Thumbnail.strategy (+32 more)

### Community 13 - "Inventory schema"
Cohesion: 0.05
Nodes (39): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.reorderPoint, Inventory.reorderQuantity, Inventory.reservedStock (+31 more)

### Community 14 - "Supply schema"
Cohesion: 0.06
Nodes (34): MasterSupplierProduct.createdAt, MasterSupplierProduct.isPrimary, MasterSupplierProduct.updatedAt, OrderLineItem.option, OrderReturnLineItem.createdAt, OrderReturnLineItem.productName, PurchaseOrderItem.option, Shipment.option (+26 more)

### Community 15 - "System schema"
Cohesion: 0.05
Nodes (38): System, ActivityEvent.createdAt, ActivityEvent.eventType, ActivityEvent.objectId, ActivityEvent.source, ActivityEvent.title, BusinessRule.actionType, BusinessRule.active (+30 more)

### Community 16 - "AgentOS schema"
Cohesion: 0.06
Nodes (34): AgentRun.adapterType, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt, AgentRun.heartbeatAt (+26 more)

### Community 17 - "code file: lifecycle-state.ts"
Cohesion: 0.06
Nodes (31): ProductLifecycleState, BundleComponentSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, Master, MasterImageItem, MasterImageItemSchema, MasterImageRole (+23 more)

### Community 18 - "Core schema"
Cohesion: 0.06
Nodes (33): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.category, MasterProduct.costCny, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description, MasterProduct.detailPageUrl (+25 more)

### Community 19 - "code file: channel-reconciliation.types.ts"
Cohesion: 0.1
Nodes (16): SupplierProduct.option, Tx, collectIds(), ChannelReconciliationService, ChannelListingHandle, ChannelListingOptionHandle, MatchOutcome, OptionLinkBackfillResult (+8 more)

### Community 20 - "Orders schema"
Cohesion: 0.08
Nodes (28): CoupangReconciliationIgnoreDto, CoupangReconciliationLinkDto, RESOLUTION_SOURCES, STATUSES, StatusFilter, Review.content, Review.createdAt, Review.id (+20 more)

### Community 21 - "Core schema"
Cohesion: 0.08
Nodes (31): Core, BundleComponent.bundleOption, BundleComponent.componentOption, BundleComponent.createdAt, BundleComponent.updatedAt, MasterCodeCounter.updatedAt, MasterCodeCounter.value, ProductOption.availableStock (+23 more)

### Community 22 - "Sourcing schema"
Cohesion: 0.08
Nodes (28): Sourcing, CandidateImage.candidate, CandidateImage.createdAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.isPrimary, CandidateImage.mimeType, CandidateImage.sortOrder (+20 more)

### Community 23 - "Finance schema"
Cohesion: 0.07
Nodes (28): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdBy, ManualLedger.description, ManualLedger.memo, ProcessingCost.createdAt (+20 more)

### Community 24 - "Orders schema"
Cohesion: 0.09
Nodes (25): SyncOrdersBodyDto, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.memo (+17 more)

### Community 25 - "code file: Order.status"
Cohesion: 0.1
Nodes (23): Order.status, DeliveryCompanySchema, OrderActionResponse, OrderActionResponseSchema, OrderLineItemSchema, OrderListItem, OrderListItemSchema, OrderListLineItem (+15 more)

### Community 26 - "Inventory schema"
Cohesion: 0.09
Nodes (25): StockTransaction.createdBy, StockTransaction.relatedId, StockTransaction.totalCost, StockTransaction.unitCost, StockTransaction.warehouse, StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse (+17 more)

### Community 27 - "code file: run-data-migrations.ts"
Cohesion: 0.17
Nodes (22): Command, COMMANDS, commandStatus(), appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertMutatingTarget(), CliArgs, commandUp() (+14 more)

### Community 28 - "AgentOS schema"
Cohesion: 0.09
Nodes (23): ActionTask.assigneeUser, AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decisionReason, AgentApprovalRequest.status, AgentRunRequest.requestedBy, ContentGeneration.triggeredByUser, OrganizationMembership.invitedBy (+15 more)

### Community 29 - "AI schema"
Cohesion: 0.1
Nodes (19): AI, ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height (+11 more)

### Community 30 - "System schema"
Cohesion: 0.09
Nodes (23): Alert.actorUser, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead, Alert.kind, Alert.message (+15 more)

### Community 31 - "AgentOS schema"
Cohesion: 0.1
Nodes (21): AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name, AgentInstance.parent, AgentInstance.pausedAt, AgentInstance.pauseReason (+13 more)

### Community 32 - "System schema"
Cohesion: 0.09
Nodes (22): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.installCount, Marketplace.isPublished (+14 more)

### Community 33 - "code file: sources.ts"
Cohesion: 0.1
Nodes (19): MigrationResult, OrderSheetResponse, PanelRunSource, PanelRunSourceSchema, sourceKeys, PanelAlertItem, PanelDismissEvent, PanelEvent (+11 more)

### Community 34 - "System schema"
Cohesion: 0.14
Nodes (15): DATA_MIGRATION_RELEASES, DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.prismaSchemaHash (+7 more)

### Community 35 - "AI schema"
Cohesion: 0.11
Nodes (20): ContentGeneration.contentType, ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.editedHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.generationInput, ContentGeneration.generationResult (+12 more)

### Community 36 - "Channels schema"
Cohesion: 0.12
Nodes (18): ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank, ChannelListingDailySnapshot.createdAt (+10 more)

### Community 37 - "code file: dev-data-profiles.spec.ts"
Cohesion: 0.11
Nodes (17): bundleDir, consumerRoot, domainRoot, encryptedMirrorRoot, imageSyncPayloadPath, kiditemListPath, latestJson, payloadPath (+9 more)

### Community 38 - "Orders schema"
Cohesion: 0.12
Nodes (18): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+10 more)

### Community 39 - "Supply schema"
Cohesion: 0.11
Nodes (18): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.inspectedAt, PurchaseOrder.orderDate, PurchaseOrder.receivedAt (+10 more)

### Community 40 - "AgentOS schema"
Cohesion: 0.12
Nodes (17): AgentOS, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decision, AgentAuthorizationEvent.policySnapshot, AgentRunEvent.createdAt, AgentRunEvent.level, AgentRunEvent.logRef, AgentToolDefinition.createdAt (+9 more)

### Community 41 - "Channels schema"
Cohesion: 0.12
Nodes (17): ChannelScrapeRun.businessDate, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.matchedCount, ChannelScrapeRun.metaJson, ChannelScrapeRun.pageType (+9 more)

### Community 42 - "AgentOS schema"
Cohesion: 0.13
Nodes (16): AgentRunRequest.claimedAt, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.createdAt, AgentRunRequest.finishedAt, AgentRunRequest.idempotencyKey, AgentRunRequest.lastErrorCode, AgentRunRequest.maxAttempts, AgentRunRequest.payload (+8 more)

### Community 43 - "Core schema"
Cohesion: 0.15
Nodes (15): ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.isPrimary, ChannelAccount.sellerId, ChannelAccount.status, ChannelAccount.updatedAt, ChannelAccount.vendorId, ChannelAccount (+7 more)

### Community 44 - "Core schema"
Cohesion: 0.12
Nodes (16): CategoryMapping.coupangCategoryId, CategoryMapping.createdAt, CategoryMapping.internalCategory, LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.isPrimary (+8 more)

### Community 45 - "Orders schema"
Cohesion: 0.15
Nodes (15): OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.metadata, OrderReturn.platform, OrderReturn.reason (+7 more)

### Community 46 - "code file: removed-legacy-scripts.spec.ts"
Cohesion: 0.13
Nodes (14): dataRoot, exportOutput, packageJson, payloadDir, runDevData(), tempRoot, absolutePath, deletedLegacyTables (+6 more)

### Community 47 - "code file: patterns.ts"
Cohesion: 0.24
Nodes (10): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), scrubDeep(), scrubSecrets(), a, input, now (+2 more)

### Community 48 - "AgentOS schema"
Cohesion: 0.17
Nodes (12): AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.inputTokens, AgentCostEvent.metadata, AgentCostEvent.model (+4 more)

### Community 49 - "Inventory schema"
Cohesion: 0.18
Nodes (12): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.items, StockAudit.matchedCount, StockAudit.notes (+4 more)

### Community 50 - "Inventory schema"
Cohesion: 0.18
Nodes (12): PickingItem.pickingList, PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.listNumber, PickingList.pickedItems, PickingList.startedAt, PickingList.status (+4 more)

### Community 51 - "code file: coupang-client.ts"
Cohesion: 0.32
Nodes (9): CoupangCredentials, coupangRequest(), generateAuthorization(), approveReturn(), confirmOrderSheets(), getOrderSheets(), uploadInvoice(), getSellerProduct() (+1 more)

### Community 52 - "Orders schema"
Cohesion: 0.18
Nodes (12): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.metadata, OrderLineItem.productName, OrderLineItem.quantity, OrderLineItem.status, OrderLineItem.totalPrice, OrderLineItem.unitPrice (+4 more)

### Community 53 - "AI schema"
Cohesion: 0.18
Nodes (12): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.originalGrade, ThumbnailTracking.originalScore, ThumbnailTracking.reviewsAfter, ThumbnailTracking.salesAfter (+4 more)

### Community 54 - "code file: channel-credential-crypto.ts"
Cohesion: 0.27
Nodes (8): readCredentialsConfig(), toJsonRecord(), toRecord(), trimToOptional(), CoupangCredentialCryptoError, encryptCredential(), EncryptedCredentialEnvelope, resolveKey()

### Community 55 - "Supply schema"
Cohesion: 0.17
Nodes (11): Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.leadTimeDays, Supplier.name, Supplier.notes, Supplier.phone (+3 more)

### Community 56 - "AgentOS schema"
Cohesion: 0.22
Nodes (11): AgentRunRequest.taskSession, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.lastRun, AgentTaskSession.metadata, AgentTaskSession.sessionDisplay, AgentTaskSession.sessionParams (+3 more)

### Community 57 - "code file: channel-dashboard.ts"
Cohesion: 0.18
Nodes (10): ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow, ProductRankingRowSchema, ReturnFaultSplit, ReturnFaultSplitSchema, ReturnReasonRow, ReturnReasonRowSchema (+2 more)

### Community 58 - "Orders schema"
Cohesion: 0.18
Nodes (11): Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.shippedAt, Shipment.status, Shipment.trackingNo (+3 more)

### Community 59 - "Inventory schema"
Cohesion: 0.2
Nodes (11): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.disposedQty, ReturnTransfer.option, ReturnTransfer.processedBy, ReturnTransfer.quantity, ReturnTransfer.restockedQty, ReturnTransfer.rtNumber (+3 more)

### Community 60 - "AgentOS schema"
Cohesion: 0.2
Nodes (10): AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.totalCostMicros, AgentRuntimeState.totalInputTokens, AgentRuntimeState.totalRuns (+2 more)

### Community 61 - "Orders schema"
Cohesion: 0.2
Nodes (10): CSRecord.assignee, CSRecord.content, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.priority, CSRecord.resolution (+2 more)

### Community 62 - "Finance schema"
Cohesion: 0.2
Nodes (10): GradeHistory.calculatedAt, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.reason, GradeHistory.revenueScore, GradeHistory.score, GradeHistory.velocityScore (+2 more)

### Community 63 - "AgentOS schema"
Cohesion: 0.22
Nodes (9): AgentRunRequest.sourceWorkflowRun, WorkflowRun.contextData, WorkflowRun.error, WorkflowRun.startedAt, WorkflowRun.status, WorkflowRun.steps, WorkflowRun.triggeredBy, WorkflowRun.updatedAt (+1 more)

### Community 64 - "Inventory schema"
Cohesion: 0.22
Nodes (9): PickingItem.createdAt, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.pickedAt, PickingItem.productName, PickingItem.quantity, PickingItem.verifiedAt (+1 more)

### Community 65 - "code file: cli-args.ts"
Cohesion: 0.36
Nodes (7): Args, parseRawArgs(), ParseRawArgsOptions, pushValue(), requiredValue(), makeArgs(), map

### Community 66 - "Orders schema"
Cohesion: 0.25
Nodes (8): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.isNotified, UnshippedItem.option, UnshippedItem.productName, UnshippedItem.quantity, UnshippedItem.reason, UnshippedItem

### Community 67 - "code file: ai.ts"
Cohesion: 0.29
Nodes (5): DetailImageCount, DetailImageCountSchema, DetailPageAgeGroup, DetailPageTemplateId, DetailPageTemplateIdSchema

### Community 68 - "code file: common.ts"
Cohesion: 0.29
Nodes (5): ApiErrorResponse, ApiErrorResponseSchema, PaginatedResponse, SyncInfo, SyncInfoSchema

### Community 69 - "Supply schema"
Cohesion: 0.29
Nodes (7): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.paidDate, SupplierPayment.purchaseOrder, SupplierPayment.status, SupplierPayment.updatedAt, SupplierPayment

### Community 70 - "AgentOS schema"
Cohesion: 0.33
Nodes (6): WorkflowTemplate.createdAt, WorkflowTemplate.description, WorkflowTemplate.marketplace, WorkflowTemplate.triggerType, WorkflowTemplate.version, WorkflowTemplate

### Community 71 - "Community 71"
Cohesion: 0.4
Nodes (3): scanSummaryMessage(), errorMessage(), resultMessage()

### Community 72 - "Supply schema"
Cohesion: 0.33
Nodes (6): Supply, SupplierProduct.createdAt, SupplierProduct.supplyPrice, SupplierProduct.updatedAt, SupplierProduct, SupplierProduct unique(supplierId, optionId)

### Community 73 - "code file: seed-agent-os.spec.ts"
Cohesion: 0.4
Nodes (4): definitions, seedPath, serverSeedPath, types

### Community 74 - "code file: inspection.ts"
Cohesion: 0.4
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 75 - "code file: readiness.ts"
Cohesion: 0.4
Nodes (4): ReadinessCheck, ReadinessCheckSchema, ReadinessResponse, ReadinessResponseSchema

## Knowledge Gaps
- **1141 isolated node(s):** `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority` (+1136 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Channels schema` to `Core schema`, `code file: ads.ts`, `code file: dev-data.ts`, `prisma field: ChannelReconciliationItem.legacyCode`, `Advertising schema`, `code file: dev-data-coupang.ts`, `prisma field: ActionTask.targetId`, `Finance schema`, `code file: staging-db-baseline.ts`, `AI schema`, `Inventory schema`, `Supply schema`, `System schema`, `AgentOS schema`, `code file: lifecycle-state.ts`, `Core schema`, `code file: channel-reconciliation.types.ts`, `Orders schema`, `Core schema`, `Sourcing schema`, `Finance schema`, `Orders schema`, `code file: Order.status`, `Inventory schema`, `AgentOS schema`, `AI schema`, `System schema`, `AgentOS schema`, `code file: sources.ts`, `System schema`, `AI schema`, `Channels schema`, `Orders schema`, `Supply schema`, `AgentOS schema`, `Channels schema`, `AgentOS schema`, `Core schema`, `Core schema`, `Orders schema`, `AgentOS schema`, `Inventory schema`, `Inventory schema`, `Orders schema`, `AI schema`, `Supply schema`, `AgentOS schema`, `Orders schema`, `Inventory schema`, `AgentOS schema`, `Orders schema`, `Finance schema`, `Orders schema`, `Supply schema`, `AgentOS schema`?**
  _High betweenness centrality (0.192) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `Core schema` to `Channels schema`, `prisma field: ChannelReconciliationItem.legacyCode`, `Advertising schema`, `prisma field: ActionTask.targetId`, `Finance schema`, `AI schema`, `Inventory schema`, `Supply schema`, `System schema`, `AgentOS schema`, `Core schema`, `code file: channel-reconciliation.types.ts`, `Orders schema`, `Core schema`, `Sourcing schema`, `Finance schema`, `Orders schema`, `Inventory schema`, `AgentOS schema`, `AI schema`, `System schema`, `AgentOS schema`, `System schema`, `System schema`, `AI schema`, `Channels schema`, `Orders schema`, `Supply schema`, `AgentOS schema`, `Channels schema`, `AgentOS schema`, `Core schema`, `Core schema`, `Orders schema`, `AgentOS schema`, `Inventory schema`, `Inventory schema`, `Orders schema`, `AI schema`, `Supply schema`, `AgentOS schema`, `Orders schema`, `Inventory schema`, `AgentOS schema`, `Orders schema`, `Finance schema`, `AgentOS schema`, `Inventory schema`, `Orders schema`, `Supply schema`, `AgentOS schema`, `Supply schema`?**
  _High betweenness centrality (0.148) - this node is a cross-community bridge._
- **Why does `Order` connect `Orders schema` to `Channels schema`, `Core schema`, `code file: ads.ts`, `prisma field: ChannelReconciliationItem.legacyCode`, `code file: check-directory-architecture.mjs`, `code file: dev-data-coupang.ts`, `prisma field: ActionTask.targetId`, `Finance schema`, `AI schema`, `Inventory schema`, `Supply schema`, `code file: lifecycle-state.ts`, `code file: channel-reconciliation.types.ts`, `Orders schema`, `code file: Order.status`, `code file: sources.ts`, `System schema`, `code file: dev-data-profiles.spec.ts`, `Core schema`, `Orders schema`, `code file: coupang-client.ts`, `Orders schema`, `Supply schema`, `code file: channel-dashboard.ts`, `Orders schema`, `Orders schema`, `Orders schema`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Are the 53 inferred relationships involving `Organization` (e.g. with `Thumbnail` and `ChannelReconciliationRun`) actually correct?**
  _`Organization` has 53 INFERRED edges - model-reasoned connections that need verification._
- **Are the 126 inferred relationships involving `Inventory` (e.g. with `Inventory.organization` and `StockTransfer`) actually correct?**
  _`Inventory` has 126 INFERRED edges - model-reasoned connections that need verification._
- **Are the 122 inferred relationships involving `ChannelReconciliationRun` (e.g. with `ChannelReconciliationItem.externalId` and `ChannelReconciliationItem.legacyCode`) actually correct?**
  _`ChannelReconciliationRun` has 122 INFERRED edges - model-reasoned connections that need verification._
- **Are the 126 inferred relationships involving `ChannelReconciliationService` (e.g. with `AdAction.organization` and `AdAction.listing`) actually correct?**
  _`ChannelReconciliationService` has 126 INFERRED edges - model-reasoned connections that need verification._