# Graph Report - schema-consumers  (2026-05-12)

## Corpus Check
- 181 files · ~81,947 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1943 nodes · 7388 edges · 88 communities (86 shown, 2 thin omitted)
- Extraction: 47% EXTRACTED · 53% INFERRED · 0% AMBIGUOUS · INFERRED: 3932 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_code file ChannelListingOption.isUnmatched|code file: ChannelListingOption.isUnmatched]]
- [[_COMMUNITY_code file ads.ts|code file: ads.ts]]
- [[_COMMUNITY_code file dev-data-coupang.ts|code file: dev-data-coupang.ts]]
- [[_COMMUNITY_prisma field MasterProduct.barcode|prisma field: MasterProduct.barcode]]
- [[_COMMUNITY_code file dev-data.ts|code file: dev-data.ts]]
- [[_COMMUNITY_code file staging-db-baseline.ts|code file: staging-db-baseline.ts]]
- [[_COMMUNITY_code file check-agents-hygiene.mjs|code file: check-agents-hygiene.mjs]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_prisma field channel-reconciliation.types.ts|prisma field: channel-reconciliation.types.ts]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file dashboard.ts|code file: dashboard.ts]]
- [[_COMMUNITY_code file product.ts|code file: product.ts]]
- [[_COMMUNITY_Sourcing schema|Sourcing schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file Order.status|code file: Order.status]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_code file sources.ts|code file: sources.ts]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_code file dev-data-profiles.spec.ts|code file: dev-data-profiles.spec.ts]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file removed-legacy-scripts.spec.ts|code file: removed-legacy-scripts.spec.ts]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file patterns.ts|code file: patterns.ts]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_code file coupang-client.ts|code file: coupang-client.ts]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_code file prepare-coupang-extension.mjs|code file: prepare-coupang-extension.mjs]]
- [[_COMMUNITY_code file channel-credential-crypto.ts|code file: channel-credential-crypto.ts]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file channel-dashboard.ts|code file: channel-dashboard.ts]]
- [[_COMMUNITY_prisma field ActionTask.targetId|prisma field: ActionTask.targetId]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_code file fs.ts|code file: fs.ts]]
- [[_COMMUNITY_code file reconciliation-action.dto.ts|code file: reconciliation-action.dto.ts]]
- [[_COMMUNITY_code file common.ts|code file: common.ts]]
- [[_COMMUNITY_code file ai.ts|code file: ai.ts]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file inspection.ts|code file: inspection.ts]]
- [[_COMMUNITY_code file readiness.ts|code file: readiness.ts]]
- [[_COMMUNITY_code file seed-agent-os.spec.ts|code file: seed-agent-os.spec.ts]]
- [[_COMMUNITY_code file thumbnails.spec.ts|code file: thumbnails.spec.ts]]
- [[_COMMUNITY_code file lifecycle-state.ts|code file: lifecycle-state.ts]]
- [[_COMMUNITY_code file coupang-date-range.dto.ts|code file: coupang-date-range.dto.ts]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 207 edges
2. `Organization` - 176 edges
3. `Inventory` - 175 edges
4. `ChannelReconciliationRun` - 165 edges
5. `ChannelReconciliationService` - 165 edges
6. `ChannelSyncService` - 130 edges
7. `ActionTask` - 105 edges
8. `ChannelAccountService` - 104 edges
9. `ChannelDashboardService` - 103 edges
10. `prisma — Shared Schema` - 98 edges
11. `CoupangProviderPort` - 93 edges
12. `channels — Marketplace Sync And Reconciliation` - 92 edges

## Surprising Connections (you probably didn't know these)
- `ReconciliationRow` --references_field--> `AdAction.externalId`  [INFERRED]
  packages/shared/src/schemas/channel-reconciliation.ts → prisma/models/advertising.prisma
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
- `ChannelReconciliationService` --references_field--> `AgentRuntimeState.organization`  [INFERRED]
  apps/server/src/channels/application/service/channel-reconciliation.service.ts → prisma/models/agents.prisma

## Communities (88 total, 2 thin omitted)

### Community 0 - "Channels schema"
Cohesion: 0.06
Nodes (260): ChannelsModule, vendorItemId provider term, CoupangProviderAdapter, channels — Marketplace Sync And Reconciliation, prisma — Shared Schema, Channels, CoupangReconciliationRowDto, CoupangReconciliationScanDto (+252 more)

### Community 1 - "code file: ChannelListingOption.isUnmatched"
Cohesion: 0.08
Nodes (47): ChannelListingOption.isUnmatched, collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, __dirname (+39 more)

### Community 2 - "code file: ads.ts"
Cohesion: 0.04
Nodes (53): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot, AdCollectStatus (+45 more)

### Community 3 - "code file: dev-data-coupang.ts"
Cohesion: 0.09
Nodes (50): appendFlag(), appendOption(), Args, BundleManifest, BundlePayload, BundleReference, Command, commandReplay() (+42 more)

### Community 4 - "prisma field: MasterProduct.barcode"
Cohesion: 0.05
Nodes (43): MasterProduct.barcode, MasterProduct.isDeleted, MasterProductImage.isDeleted, row, clean(), HardConflict, KiditemPlan, NAME_FIELDS (+35 more)

### Community 5 - "code file: dev-data.ts"
Cohesion: 0.11
Nodes (45): AdapterCommand, appendProjectReferenceDefaults(), archiveFileName(), archiveShaFileName(), BundlePackageIndex, cloudStorageRoot(), commandPack(), commandPublish() (+37 more)

### Community 6 - "code file: staging-db-baseline.ts"
Cohesion: 0.09
Nodes (48): appendValues(), commandExport(), commandStatus(), referenceTypeFor(), createZipArchive(), execFileAsync, extractZipArchive(), assertNonProductionTarget() (+40 more)

### Community 7 - "code file: check-agents-hygiene.mjs"
Cohesion: 0.08
Nodes (30): checkClaudeShims(), checkTrackedClaudeDirectory(), findStaleInstructionLines(), git(), listTracked(), runChecks(), analyzeDirectoryArchitecture(), collectDirectoryArchitecture() (+22 more)

### Community 8 - "Inventory schema"
Cohesion: 0.05
Nodes (39): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.reorderPoint, Inventory.reorderQuantity, Inventory.reservedStock (+31 more)

### Community 9 - "Supply schema"
Cohesion: 0.06
Nodes (38): Supply, ChannelListing.master, MasterSupplierProduct.createdAt, MasterSupplierProduct.isPrimary, MasterSupplierProduct.updatedAt, OrderLineItem.option, PurchaseOrder.supplier, ReturnTransfer.option (+30 more)

### Community 10 - "System schema"
Cohesion: 0.05
Nodes (38): System, ActivityEvent.createdAt, ActivityEvent.eventType, ActivityEvent.objectId, ActivityEvent.source, ActivityEvent.title, BusinessRule.actionType, BusinessRule.active (+30 more)

### Community 11 - "AI schema"
Cohesion: 0.05
Nodes (38): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.measuredAt, Thumbnail.prevClickRate, Thumbnail.status, Thumbnail.strategy (+30 more)

### Community 12 - "prisma field: channel-reconciliation.types.ts"
Cohesion: 0.09
Nodes (20): AdAction.externalId, ChannelAdTargetDailySnapshot.externalId, ChannelReconciliationItem.legacyCode, ProcessingCost.master, Tx, collectIds(), ChannelReconciliationService, ChannelListingHandle (+12 more)

### Community 13 - "Core schema"
Cohesion: 0.06
Nodes (35): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.category, MasterProduct.costCny, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description, MasterProduct.detailPageUrl (+27 more)

### Community 14 - "AgentOS schema"
Cohesion: 0.06
Nodes (34): AgentRun.adapterType, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt, AgentRun.heartbeatAt (+26 more)

### Community 15 - "code file: dashboard.ts"
Cohesion: 0.06
Nodes (33): AdMetricsDetail, AdMetricsDetailSchema, AlertItemDashboard, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary (+25 more)

### Community 16 - "code file: product.ts"
Cohesion: 0.06
Nodes (30): BundleComponentSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, Master, MasterImageItem, MasterImageItemSchema, MasterImageRole, MasterImageRoleSchema (+22 more)

### Community 17 - "Sourcing schema"
Cohesion: 0.07
Nodes (29): Sourcing, CandidateImage.candidate, CandidateImage.createdAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.isDeleted, CandidateImage.isPrimary, CandidateImage.mimeType (+21 more)

### Community 18 - "Core schema"
Cohesion: 0.09
Nodes (30): BundleComponent.bundleOption, BundleComponent.componentOption, BundleComponent.createdAt, BundleComponent.updatedAt, ProductOption.availableStock, ProductOption.barcode, ProductOption.commissionRate, ProductOption.costPrice (+22 more)

### Community 19 - "AgentOS schema"
Cohesion: 0.08
Nodes (27): AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name, AgentInstance.parent, AgentInstance.pausedAt, AgentInstance.pauseReason (+19 more)

### Community 20 - "Orders schema"
Cohesion: 0.08
Nodes (26): Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.listing, Shipment.shippedAt, Shipment.status (+18 more)

### Community 21 - "Core schema"
Cohesion: 0.08
Nodes (27): ActionTask.assigneeUser, AgentRunRequest.sourceWorkflowRun, OrganizationMembership.invitedBy, ThumbnailGeneration.triggeredByUser, User.agentInstance, User.avatarUrl, User.createdAt, User.email (+19 more)

### Community 22 - "Orders schema"
Cohesion: 0.11
Nodes (24): AdAction.listing, ChannelAdTargetDailySnapshot.listing, Order.listing, Review.content, Review.createdAt, Review.id, Review.listing, Review.platform (+16 more)

### Community 23 - "Supply schema"
Cohesion: 0.08
Nodes (26): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.inspectedAt, PurchaseOrder.orderDate, PurchaseOrder.receivedAt (+18 more)

### Community 24 - "Orders schema"
Cohesion: 0.09
Nodes (25): SyncOrdersBodyDto, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.memo (+17 more)

### Community 25 - "code file: Order.status"
Cohesion: 0.1
Nodes (23): Order.status, DeliveryCompanySchema, OrderActionResponse, OrderActionResponseSchema, OrderLineItemSchema, OrderListItem, OrderListItemSchema, OrderListLineItem (+15 more)

### Community 26 - "System schema"
Cohesion: 0.08
Nodes (23): ErrorCodes, Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.installCount (+15 more)

### Community 27 - "Core schema"
Cohesion: 0.09
Nodes (24): ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo, ChannelListing.exposureStatus, ChannelListing.externalId, ChannelListing.freeShipOverAmount (+16 more)

### Community 28 - "Orders schema"
Cohesion: 0.09
Nodes (19): externalOptionId canonical option identity, ChannelReconciliationItem.externalId, OrderReturnLineItem.createdAt, OrderReturnLineItem.productName, ThumbnailRegistrationAttempt.externalId, UnshippedItem.option, OrderReturnLineItem, byDay (+11 more)

### Community 29 - "System schema"
Cohesion: 0.09
Nodes (23): Alert.actorUser, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead, Alert.kind, Alert.message (+15 more)

### Community 30 - "Inventory schema"
Cohesion: 0.12
Nodes (20): Shipment.warehouse, StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.notes, StockTransfer.quantity, StockTransfer.requestedBy, StockTransfer.toWarehouse (+12 more)

### Community 31 - "code file: sources.ts"
Cohesion: 0.11
Nodes (17): OrderSheetResponse, PanelRunSource, PanelRunSourceSchema, sourceKeys, PanelAlertItem, PanelDismissEvent, PanelEvent, PanelItem (+9 more)

### Community 32 - "Advertising schema"
Cohesion: 0.11
Nodes (18): AdAction.actionType, AdAction.adTargetDaily, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt, AdAction.currentValue (+10 more)

### Community 33 - "Orders schema"
Cohesion: 0.12
Nodes (18): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+10 more)

### Community 34 - "Core schema"
Cohesion: 0.14
Nodes (18): Database ERD, Core, CategoryMapping.coupangCategoryId, CategoryMapping.createdAt, CategoryMapping.internalCategory, CategoryMapping.isActive, MasterCodeCounter.updatedAt, MasterCodeCounter.value (+10 more)

### Community 35 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentRunRequest.agentInstance, AgentRunRequest.claimedAt, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.createdAt, AgentRunRequest.finishedAt, AgentRunRequest.idempotencyKey, AgentRunRequest.lastErrorCode, AgentRunRequest.maxAttempts (+10 more)

### Community 36 - "Finance schema"
Cohesion: 0.13
Nodes (18): ProfitLoss.adCost, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit, ProfitLoss.orderCount, ProfitLoss.otherCost (+10 more)

### Community 37 - "Channels schema"
Cohesion: 0.12
Nodes (18): ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank, ChannelListingDailySnapshot.createdAt (+10 more)

### Community 38 - "code file: dev-data-profiles.spec.ts"
Cohesion: 0.11
Nodes (17): bundleDir, consumerRoot, domainRoot, encryptedMirrorRoot, imageSyncPayloadPath, kiditemListPath, latestJson, payloadPath (+9 more)

### Community 39 - "Channels schema"
Cohesion: 0.12
Nodes (17): ChannelScrapeRun.businessDate, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.matchedCount, ChannelScrapeRun.metaJson, ChannelScrapeRun.pageType (+9 more)

### Community 40 - "Finance schema"
Cohesion: 0.12
Nodes (16): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdBy, ManualLedger.description, ManualLedger.memo, ProcessingCost.createdAt (+8 more)

### Community 41 - "Core schema"
Cohesion: 0.15
Nodes (15): ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.isPrimary, ChannelAccount.sellerId, ChannelAccount.status, ChannelAccount.updatedAt, ChannelAccount.vendorId, ChannelAccount (+7 more)

### Community 42 - "Orders schema"
Cohesion: 0.16
Nodes (15): CSRecord.order, PickingItem.orderId, Shipment.order, UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.isNotified, UnshippedItem.productName, UnshippedItem.quantity (+7 more)

### Community 43 - "Orders schema"
Cohesion: 0.15
Nodes (15): OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.metadata, OrderReturn.platform, OrderReturn.reason (+7 more)

### Community 44 - "code file: removed-legacy-scripts.spec.ts"
Cohesion: 0.13
Nodes (14): dataRoot, exportOutput, packageJson, payloadDir, runDevData(), tempRoot, absolutePath, deletedLegacyTables (+6 more)

### Community 45 - "Advertising schema"
Cohesion: 0.14
Nodes (14): ExecutionLog.createdAt, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionTask.action, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt (+6 more)

### Community 46 - "AgentOS schema"
Cohesion: 0.17
Nodes (13): AgentOS, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decision, AgentAuthorizationEvent.policySnapshot, AgentToolDefinition.createdAt, AgentToolDefinition.credentialKind, AgentToolDefinition.description (+5 more)

### Community 47 - "AgentOS schema"
Cohesion: 0.15
Nodes (13): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.inputTokens, AgentCostEvent.metadata (+5 more)

### Community 48 - "Orders schema"
Cohesion: 0.17
Nodes (13): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.listingOption, OrderLineItem.metadata, OrderLineItem.productName, OrderLineItem.quantity, OrderLineItem.status, OrderLineItem.totalPrice (+5 more)

### Community 49 - "code file: patterns.ts"
Cohesion: 0.24
Nodes (10): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), scrubDeep(), scrubSecrets(), a, input, now (+2 more)

### Community 50 - "Finance schema"
Cohesion: 0.18
Nodes (12): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.notes, SalesPlan.period, SalesPlan.targetOrders, SalesPlan.targetProfit (+4 more)

### Community 51 - "Inventory schema"
Cohesion: 0.18
Nodes (12): PickingItem.pickingList, PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.listNumber, PickingList.pickedItems, PickingList.startedAt, PickingList.status (+4 more)

### Community 52 - "Inventory schema"
Cohesion: 0.18
Nodes (12): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.items, StockAudit.matchedCount, StockAudit.notes (+4 more)

### Community 53 - "code file: coupang-client.ts"
Cohesion: 0.32
Nodes (9): CoupangCredentials, coupangRequest(), generateAuthorization(), approveReturn(), confirmOrderSheets(), getOrderSheets(), uploadInvoice(), getSellerProduct() (+1 more)

### Community 54 - "AI schema"
Cohesion: 0.18
Nodes (12): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.originalGrade, ThumbnailTracking.originalScore, ThumbnailTracking.reviewsAfter, ThumbnailTracking.salesAfter (+4 more)

### Community 55 - "code file: prepare-coupang-extension.mjs"
Cohesion: 0.18
Nodes (9): DEFAULT_OUTPUT_PATH, addUnique(), defaultSourceDir, patchManifest(), runtimeFiles, manifest, dir, files (+1 more)

### Community 56 - "code file: channel-credential-crypto.ts"
Cohesion: 0.27
Nodes (8): readCredentialsConfig(), toJsonRecord(), toRecord(), trimToOptional(), CoupangCredentialCryptoError, encryptCredential(), EncryptedCredentialEnvelope, resolveKey()

### Community 57 - "Community 57"
Cohesion: 0.2
Nodes (8): scanSummaryMessage(), errorMessage(), resultMessage(), isCoupangCredentialResolutionError(), syncCoupangOrders(), syncSingleCoupangOrder(), syncCoupangProducts(), syncSingleProductListing()

### Community 58 - "Core schema"
Cohesion: 0.18
Nodes (11): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name, LegalEntity.representativeName (+3 more)

### Community 59 - "AgentOS schema"
Cohesion: 0.18
Nodes (11): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.totalCostMicros, AgentRuntimeState.totalInputTokens (+3 more)

### Community 60 - "AgentOS schema"
Cohesion: 0.22
Nodes (11): AgentRunRequest.taskSession, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.lastRun, AgentTaskSession.metadata, AgentTaskSession.sessionDisplay, AgentTaskSession.sessionParams (+3 more)

### Community 61 - "code file: channel-dashboard.ts"
Cohesion: 0.18
Nodes (10): ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow, ProductRankingRowSchema, ReturnFaultSplit, ReturnFaultSplitSchema, ReturnReasonRow, ReturnReasonRowSchema (+2 more)

### Community 62 - "prisma field: ActionTask.targetId"
Cohesion: 0.24
Nodes (7): ActionTask.targetId, AdAction.targetType, Alert.actionTask, Alert.targetId, Alert.targetType, DashboardInventorySummary, summary

### Community 63 - "Advertising schema"
Cohesion: 0.2
Nodes (10): packages/shared — @kiditem/shared, Advertising, AI, ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.isActive, ScrapeTarget.label, ScrapeTarget.lastScrapedAt (+2 more)

### Community 64 - "Inventory schema"
Cohesion: 0.22
Nodes (10): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.disposedQty, ReturnTransfer.processedBy, ReturnTransfer.quantity, ReturnTransfer.restockedQty, ReturnTransfer.rtNumber, ReturnTransfer.updatedAt (+2 more)

### Community 65 - "AI schema"
Cohesion: 0.2
Nodes (10): ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.originalImages, ContentGeneration.processedImages, ContentGeneration.retryCount, ContentGeneration.triggeredByUser (+2 more)

### Community 66 - "Finance schema"
Cohesion: 0.2
Nodes (10): GradeHistory.calculatedAt, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.reason, GradeHistory.revenueScore, GradeHistory.score, GradeHistory.velocityScore (+2 more)

### Community 67 - "Inventory schema"
Cohesion: 0.22
Nodes (9): PickingItem.createdAt, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.pickedAt, PickingItem.productName, PickingItem.quantity, PickingItem.verifiedAt (+1 more)

### Community 68 - "AI schema"
Cohesion: 0.22
Nodes (9): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.method, ThumbnailAnalysis.overallScore, ThumbnailAnalysis.qualityAnalyzedAt, ThumbnailAnalysis.recompose, ThumbnailAnalysis.scores, ThumbnailAnalysis.suggestions (+1 more)

### Community 69 - "Advertising schema"
Cohesion: 0.25
Nodes (8): ExecutionTask.worker, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentUrl, ExecutionWorker.lastHeartbeatAt, ExecutionWorker.metaJson, ExecutionWorker.status, ExecutionWorker

### Community 70 - "code file: fs.ts"
Cohesion: 0.39
Nodes (5): fileSize(), readJson(), readTextIfExists(), sha256(), file

### Community 71 - "code file: reconciliation-action.dto.ts"
Cohesion: 0.29
Nodes (5): CoupangReconciliationIgnoreDto, CoupangReconciliationLinkDto, RESOLUTION_SOURCES, STATUSES, StatusFilter

### Community 72 - "code file: common.ts"
Cohesion: 0.29
Nodes (5): ApiErrorResponse, ApiErrorResponseSchema, PaginatedResponse, SyncInfo, SyncInfoSchema

### Community 73 - "code file: ai.ts"
Cohesion: 0.29
Nodes (5): DetailImageCount, DetailImageCountSchema, DetailPageAgeGroup, DetailPageTemplateId, DetailPageTemplateIdSchema

### Community 74 - "Inventory schema"
Cohesion: 0.33
Nodes (6): StockTransaction.createdBy, StockTransaction.relatedId, StockTransaction.totalCost, StockTransaction.unitCost, StockTransaction.warehouse, StockTransaction

### Community 75 - "AgentOS schema"
Cohesion: 0.33
Nodes (6): AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decisionReason, AgentApprovalRequest.status, AgentApprovalRequest

### Community 76 - "code file: inspection.ts"
Cohesion: 0.4
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 77 - "code file: readiness.ts"
Cohesion: 0.4
Nodes (4): ReadinessCheck, ReadinessCheckSchema, ReadinessResponse, ReadinessResponseSchema

### Community 78 - "code file: seed-agent-os.spec.ts"
Cohesion: 0.4
Nodes (4): definitions, seedPath, serverSeedPath, types

### Community 79 - "code file: thumbnails.spec.ts"
Cohesion: 0.5
Nodes (3): parsed, CoupangImageSyncCapabilities, CoupangImageSyncRowSchema

## Knowledge Gaps
- **1107 isolated node(s):** `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority` (+1102 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Channels schema` to `code file: ChannelListingOption.isUnmatched`, `code file: ads.ts`, `code file: dev-data-coupang.ts`, `prisma field: MasterProduct.barcode`, `code file: dev-data.ts`, `code file: staging-db-baseline.ts`, `Inventory schema`, `Supply schema`, `System schema`, `AI schema`, `prisma field: channel-reconciliation.types.ts`, `Core schema`, `AgentOS schema`, `code file: dashboard.ts`, `code file: product.ts`, `Sourcing schema`, `Core schema`, `AgentOS schema`, `Orders schema`, `Orders schema`, `Supply schema`, `Orders schema`, `code file: Order.status`, `Core schema`, `Orders schema`, `System schema`, `Inventory schema`, `code file: sources.ts`, `Advertising schema`, `Orders schema`, `Core schema`, `AgentOS schema`, `Finance schema`, `Channels schema`, `Channels schema`, `Finance schema`, `Core schema`, `Orders schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `Finance schema`, `Inventory schema`, `Inventory schema`, `AI schema`, `Core schema`, `AgentOS schema`, `AgentOS schema`, `prisma field: ActionTask.targetId`, `Advertising schema`, `Inventory schema`, `AI schema`, `Finance schema`, `AI schema`, `Advertising schema`, `Inventory schema`, `AgentOS schema`?**
  _High betweenness centrality (0.181) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `Core schema` to `Channels schema`, `code file: ChannelListingOption.isUnmatched`, `prisma field: MasterProduct.barcode`, `Inventory schema`, `Supply schema`, `System schema`, `AI schema`, `prisma field: channel-reconciliation.types.ts`, `Core schema`, `AgentOS schema`, `Sourcing schema`, `Core schema`, `AgentOS schema`, `Orders schema`, `Core schema`, `Orders schema`, `Supply schema`, `Orders schema`, `System schema`, `Core schema`, `Orders schema`, `System schema`, `Inventory schema`, `Advertising schema`, `Orders schema`, `AgentOS schema`, `Finance schema`, `Channels schema`, `Channels schema`, `Finance schema`, `Core schema`, `Orders schema`, `Orders schema`, `Advertising schema`, `AgentOS schema`, `AgentOS schema`, `Orders schema`, `Finance schema`, `Inventory schema`, `Inventory schema`, `AI schema`, `Core schema`, `AgentOS schema`, `AgentOS schema`, `prisma field: ActionTask.targetId`, `Advertising schema`, `Inventory schema`, `AI schema`, `Finance schema`, `Inventory schema`, `AI schema`, `Advertising schema`, `Inventory schema`, `AgentOS schema`?**
  _High betweenness centrality (0.139) - this node is a cross-community bridge._
- **Why does `Inventory` connect `Inventory schema` to `Channels schema`, `code file: ChannelListingOption.isUnmatched`, `code file: dev-data-coupang.ts`, `prisma field: MasterProduct.barcode`, `code file: dev-data.ts`, `code file: check-agents-hygiene.mjs`, `Supply schema`, `AI schema`, `prisma field: channel-reconciliation.types.ts`, `Core schema`, `code file: dashboard.ts`, `code file: product.ts`, `Core schema`, `Orders schema`, `Supply schema`, `Orders schema`, `code file: Order.status`, `System schema`, `Orders schema`, `Inventory schema`, `Core schema`, `Channels schema`, `code file: dev-data-profiles.spec.ts`, `Core schema`, `code file: removed-legacy-scripts.spec.ts`, `Inventory schema`, `Inventory schema`, `prisma field: ActionTask.targetId`, `Advertising schema`, `Inventory schema`, `AI schema`, `Finance schema`, `Inventory schema`, `AI schema`, `code file: common.ts`, `Inventory schema`, `code file: thumbnails.spec.ts`?**
  _High betweenness centrality (0.110) - this node is a cross-community bridge._
- **Are the 49 inferred relationships involving `Organization` (e.g. with `Thumbnail` and `ChannelReconciliationRun`) actually correct?**
  _`Organization` has 49 INFERRED edges - model-reasoned connections that need verification._
- **Are the 125 inferred relationships involving `Inventory` (e.g. with `Inventory.organization` and `StockTransfer`) actually correct?**
  _`Inventory` has 125 INFERRED edges - model-reasoned connections that need verification._
- **Are the 120 inferred relationships involving `ChannelReconciliationRun` (e.g. with `ChannelReconciliationItem.externalId` and `ChannelReconciliationItem.legacyCode`) actually correct?**
  _`ChannelReconciliationRun` has 120 INFERRED edges - model-reasoned connections that need verification._
- **Are the 124 inferred relationships involving `ChannelReconciliationService` (e.g. with `AdAction.organization` and `AdAction.listing`) actually correct?**
  _`ChannelReconciliationService` has 124 INFERRED edges - model-reasoned connections that need verification._