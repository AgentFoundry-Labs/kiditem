# Graph Report - schema-consumers  (2026-05-12)

## Corpus Check
- 181 files · ~81,906 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1938 nodes · 7386 edges · 86 communities (84 shown, 2 thin omitted)
- Extraction: 47% EXTRACTED · 53% INFERRED · 0% AMBIGUOUS · INFERRED: 3933 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_code file ads.ts|code file: ads.ts]]
- [[_COMMUNITY_code file dev-data.ts|code file: dev-data.ts]]
- [[_COMMUNITY_prisma field CandidateImage.isDeleted|prisma field: CandidateImage.isDeleted]]
- [[_COMMUNITY_code file generate-prisma-erd.mjs|code file: generate-prisma-erd.mjs]]
- [[_COMMUNITY_code file staging-db-baseline.ts|code file: staging-db-baseline.ts]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_prisma field channel-reconciliation.types.ts|prisma field: channel-reconciliation.types.ts]]
- [[_COMMUNITY_code file dev-data-coupang.ts|code file: dev-data-coupang.ts]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_code file check-agents-hygiene.mjs|code file: check-agents-hygiene.mjs]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file dashboard.ts|code file: dashboard.ts]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file lifecycle-state.ts|code file: lifecycle-state.ts]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_code file dev-data-profiles.spec.ts|code file: dev-data-profiles.spec.ts]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Sourcing schema|Sourcing schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_code file Order.status|code file: Order.status]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_code file sources.ts|code file: sources.ts]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file fs.ts|code file: fs.ts]]
- [[_COMMUNITY_code file patterns.ts|code file: patterns.ts]]
- [[_COMMUNITY_code file coupang-client.ts|code file: coupang-client.ts]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_code file channel-credential-crypto.ts|code file: channel-credential-crypto.ts]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_code file prepare-coupang-extension.mjs|code file: prepare-coupang-extension.mjs]]
- [[_COMMUNITY_code file channel-dashboard.ts|code file: channel-dashboard.ts]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file common.ts|code file: common.ts]]
- [[_COMMUNITY_code file ai.ts|code file: ai.ts]]
- [[_COMMUNITY_code file reconciliation-action.dto.ts|code file: reconciliation-action.dto.ts]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_code file check-script-inventory.mjs|code file: check-script-inventory.mjs]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_code file seed-agent-os.spec.ts|code file: seed-agent-os.spec.ts]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_code file inspection.ts|code file: inspection.ts]]
- [[_COMMUNITY_code file readiness.ts|code file: readiness.ts]]
- [[_COMMUNITY_code file thumbnails.spec.ts|code file: thumbnails.spec.ts]]
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

## Communities (86 total, 2 thin omitted)

### Community 0 - "Channels schema"
Cohesion: 0.06
Nodes (260): ChannelsModule, vendorItemId provider term, CoupangProviderAdapter, channels — Marketplace Sync And Reconciliation, prisma — Shared Schema, Channels, CoupangReconciliationRowDto, CoupangReconciliationScanDto (+252 more)

### Community 1 - "Core schema"
Cohesion: 0.04
Nodes (71): AdAction.listing, ChannelAdTargetDailySnapshot.listing, ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo, ChannelListing.exposureStatus (+63 more)

### Community 2 - "code file: ads.ts"
Cohesion: 0.04
Nodes (53): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot, AdCollectStatus (+45 more)

### Community 3 - "code file: dev-data.ts"
Cohesion: 0.1
Nodes (49): AdapterCommand, appendFlag(), appendOption(), appendProjectReferenceDefaults(), archiveFileName(), archiveShaFileName(), BundlePackageIndex, cloudStorageRoot() (+41 more)

### Community 4 - "prisma field: CandidateImage.isDeleted"
Cohesion: 0.05
Nodes (42): CandidateImage.isDeleted, MasterProduct.barcode, MasterProduct.isDeleted, MasterProductImage.isDeleted, SourcingCandidate.isDeleted, row, clean(), HardConflict (+34 more)

### Community 5 - "code file: generate-prisma-erd.mjs"
Cohesion: 0.07
Nodes (44): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, __dirname, extractDocValue() (+36 more)

### Community 6 - "code file: staging-db-baseline.ts"
Cohesion: 0.09
Nodes (49): appendValues(), commandExport(), commandStatus(), referenceTypeFor(), createZipArchive(), execFileAsync, extractZipArchive(), assertNonProductionTarget() (+41 more)

### Community 7 - "Advertising schema"
Cohesion: 0.04
Nodes (49): packages/shared — @kiditem/shared, Advertising, AI, AdAction.actionType, AdAction.adTargetDaily, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt (+41 more)

### Community 8 - "prisma field: channel-reconciliation.types.ts"
Cohesion: 0.08
Nodes (26): externalOptionId canonical option identity, AdAction.externalId, ChannelAdTargetDailySnapshot.externalId, ChannelReconciliationItem.externalId, ChannelReconciliationItem.legacyCode, OrderLineItem.option, PurchaseOrderItem.option, ReturnTransfer.option (+18 more)

### Community 9 - "code file: dev-data-coupang.ts"
Cohesion: 0.1
Nodes (39): Args, BundleManifest, BundlePayload, BundleReference, Command, commandReplay(), COMMANDS, apiHeaders() (+31 more)

### Community 10 - "Inventory schema"
Cohesion: 0.05
Nodes (39): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.reorderPoint, Inventory.reorderQuantity, Inventory.reservedStock (+31 more)

### Community 11 - "AI schema"
Cohesion: 0.05
Nodes (38): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.measuredAt, Thumbnail.prevClickRate, Thumbnail.status, Thumbnail.strategy (+30 more)

### Community 12 - "code file: check-agents-hygiene.mjs"
Cohesion: 0.09
Nodes (27): checkClaudeShims(), checkTrackedClaudeDirectory(), findStaleInstructionLines(), git(), listTracked(), runChecks(), analyzeDirectoryArchitecture(), collectDirectoryArchitecture() (+19 more)

### Community 13 - "Orders schema"
Cohesion: 0.1
Nodes (31): Database ERD, ActionTask.targetId, AdAction.targetType, AgentApprovalRequest.agentInstance, AgentAuthorizationEvent.agentInstance, AgentCostEvent.agentInstance, AgentRun.agentInstance, AgentRunRequest.agentInstance (+23 more)

### Community 14 - "code file: dashboard.ts"
Cohesion: 0.06
Nodes (34): AdMetricsDetail, AdMetricsDetailSchema, AlertItemDashboard, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary (+26 more)

### Community 15 - "AgentOS schema"
Cohesion: 0.06
Nodes (34): AgentRun.adapterType, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt, AgentRun.heartbeatAt (+26 more)

### Community 16 - "code file: lifecycle-state.ts"
Cohesion: 0.06
Nodes (31): ProductLifecycleState, BundleComponentSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, Master, MasterImageItem, MasterImageItemSchema, MasterImageRole (+23 more)

### Community 17 - "Core schema"
Cohesion: 0.08
Nodes (33): Core, BundleComponent.bundleOption, BundleComponent.componentOption, BundleComponent.createdAt, BundleComponent.updatedAt, MasterCodeCounter.updatedAt, MasterCodeCounter.value, ProductOption.availableStock (+25 more)

### Community 18 - "code file: dev-data-profiles.spec.ts"
Cohesion: 0.07
Nodes (31): bundleDir, consumerRoot, dataRoot, domainRoot, encryptedMirrorRoot, exportOutput, imageSyncPayloadPath, kiditemListPath (+23 more)

### Community 19 - "Core schema"
Cohesion: 0.07
Nodes (30): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.category, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description, MasterProduct.detailPageUrl, MasterProduct.draftContent (+22 more)

### Community 20 - "Finance schema"
Cohesion: 0.07
Nodes (28): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdBy, ManualLedger.description, ManualLedger.memo, ProcessingCost.createdAt (+20 more)

### Community 21 - "AgentOS schema"
Cohesion: 0.08
Nodes (27): AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name, AgentInstance.parent, AgentInstance.pausedAt, AgentInstance.pauseReason (+19 more)

### Community 22 - "Sourcing schema"
Cohesion: 0.08
Nodes (27): Sourcing, CandidateImage.candidate, CandidateImage.createdAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.isPrimary, CandidateImage.mimeType, CandidateImage.sortOrder (+19 more)

### Community 23 - "Orders schema"
Cohesion: 0.09
Nodes (25): SyncOrdersBodyDto, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.memo (+17 more)

### Community 24 - "Supply schema"
Cohesion: 0.09
Nodes (25): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.isPrimary, MasterSupplierProduct.updatedAt, ProcessingCost.master, PurchaseOrder.supplier, SupplierProduct.createdAt, SupplierProduct.option (+17 more)

### Community 25 - "code file: Order.status"
Cohesion: 0.1
Nodes (23): Order.status, DeliveryCompanySchema, OrderActionResponse, OrderActionResponseSchema, OrderLineItemSchema, OrderListItem, OrderListItemSchema, OrderListLineItem (+15 more)

### Community 26 - "AI schema"
Cohesion: 0.08
Nodes (23): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.method, ThumbnailAnalysis.overallScore, ThumbnailAnalysis.qualityAnalyzedAt, ThumbnailAnalysis.recompose, ThumbnailAnalysis.scores, ThumbnailAnalysis.suggestions (+15 more)

### Community 27 - "System schema"
Cohesion: 0.08
Nodes (23): ErrorCodes, Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.installCount (+15 more)

### Community 28 - "System schema"
Cohesion: 0.09
Nodes (23): Alert.actorUser, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead, Alert.kind, Alert.message (+15 more)

### Community 29 - "AgentOS schema"
Cohesion: 0.1
Nodes (22): ActionTask.assigneeUser, AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decisionReason, AgentApprovalRequest.status, AgentRunRequest.requestedBy, OrganizationMembership.invitedBy, ThumbnailGeneration.triggeredByUser (+14 more)

### Community 30 - "Inventory schema"
Cohesion: 0.12
Nodes (20): Shipment.warehouse, StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.notes, StockTransfer.quantity, StockTransfer.requestedBy, StockTransfer.toWarehouse (+12 more)

### Community 31 - "code file: sources.ts"
Cohesion: 0.11
Nodes (17): OrderSheetResponse, PanelRunSource, PanelRunSourceSchema, sourceKeys, PanelAlertItem, PanelDismissEvent, PanelEvent, PanelItem (+9 more)

### Community 32 - "Channels schema"
Cohesion: 0.12
Nodes (18): ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank, ChannelListingDailySnapshot.createdAt (+10 more)

### Community 33 - "Orders schema"
Cohesion: 0.12
Nodes (18): CSRecord.assignee, CSRecord.content, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.order, CSRecord.priority (+10 more)

### Community 34 - "Orders schema"
Cohesion: 0.12
Nodes (18): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+10 more)

### Community 35 - "Supply schema"
Cohesion: 0.11
Nodes (18): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.inspectedAt, PurchaseOrder.orderDate, PurchaseOrder.receivedAt (+10 more)

### Community 36 - "System schema"
Cohesion: 0.12
Nodes (17): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+9 more)

### Community 37 - "Channels schema"
Cohesion: 0.12
Nodes (17): ChannelScrapeRun.businessDate, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.matchedCount, ChannelScrapeRun.metaJson, ChannelScrapeRun.pageType (+9 more)

### Community 38 - "Core schema"
Cohesion: 0.15
Nodes (15): ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.isPrimary, ChannelAccount.sellerId, ChannelAccount.status, ChannelAccount.updatedAt, ChannelAccount.vendorId, ChannelAccount (+7 more)

### Community 39 - "AgentOS schema"
Cohesion: 0.13
Nodes (16): AgentRunRequest.claimedAt, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.createdAt, AgentRunRequest.finishedAt, AgentRunRequest.idempotencyKey, AgentRunRequest.lastErrorCode, AgentRunRequest.maxAttempts, AgentRunRequest.payload (+8 more)

### Community 40 - "Orders schema"
Cohesion: 0.15
Nodes (15): OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.metadata, OrderReturn.platform, OrderReturn.reason (+7 more)

### Community 41 - "code file: fs.ts"
Cohesion: 0.22
Nodes (12): commandSanitize(), assertSafeDatasetId(), resolveDatasetId(), runCoupangDevData(), sanitizeValue(), loadManifest(), runCoupangAdapter(), fileSize() (+4 more)

### Community 42 - "code file: patterns.ts"
Cohesion: 0.24
Nodes (10): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), scrubDeep(), scrubSecrets(), a, input, now (+2 more)

### Community 43 - "code file: coupang-client.ts"
Cohesion: 0.32
Nodes (9): CoupangCredentials, coupangRequest(), generateAuthorization(), approveReturn(), confirmOrderSheets(), getOrderSheets(), uploadInvoice(), getSellerProduct() (+1 more)

### Community 44 - "Orders schema"
Cohesion: 0.18
Nodes (12): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.metadata, OrderLineItem.productName, OrderLineItem.quantity, OrderLineItem.status, OrderLineItem.totalPrice, OrderLineItem.unitPrice (+4 more)

### Community 45 - "AgentOS schema"
Cohesion: 0.17
Nodes (12): AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.inputTokens, AgentCostEvent.metadata, AgentCostEvent.model (+4 more)

### Community 46 - "AgentOS schema"
Cohesion: 0.18
Nodes (12): AgentOS, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decision, AgentAuthorizationEvent.policySnapshot, AgentToolDefinition.createdAt, AgentToolDefinition.credentialKind, AgentToolDefinition.description, AgentToolDefinition.inputSchemaJson (+4 more)

### Community 47 - "Supply schema"
Cohesion: 0.17
Nodes (11): Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.leadTimeDays, Supplier.name, Supplier.notes, Supplier.phone (+3 more)

### Community 48 - "AI schema"
Cohesion: 0.18
Nodes (12): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.originalGrade, ThumbnailTracking.originalScore, ThumbnailTracking.reviewsAfter, ThumbnailTracking.salesAfter (+4 more)

### Community 49 - "Inventory schema"
Cohesion: 0.18
Nodes (12): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.items, StockAudit.matchedCount, StockAudit.notes (+4 more)

### Community 50 - "code file: channel-credential-crypto.ts"
Cohesion: 0.27
Nodes (8): readCredentialsConfig(), toJsonRecord(), toRecord(), trimToOptional(), CoupangCredentialCryptoError, encryptCredential(), EncryptedCredentialEnvelope, resolveKey()

### Community 51 - "Community 51"
Cohesion: 0.2
Nodes (8): scanSummaryMessage(), errorMessage(), resultMessage(), isCoupangCredentialResolutionError(), syncCoupangOrders(), syncSingleCoupangOrder(), syncCoupangProducts(), syncSingleProductListing()

### Community 52 - "code file: prepare-coupang-extension.mjs"
Cohesion: 0.18
Nodes (9): DEFAULT_OUTPUT_PATH, addUnique(), defaultSourceDir, patchManifest(), runtimeFiles, manifest, dir, files (+1 more)

### Community 53 - "code file: channel-dashboard.ts"
Cohesion: 0.18
Nodes (10): ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow, ProductRankingRowSchema, ReturnFaultSplit, ReturnFaultSplitSchema, ReturnReasonRow, ReturnReasonRowSchema (+2 more)

### Community 54 - "Core schema"
Cohesion: 0.18
Nodes (11): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name, LegalEntity.representativeName (+3 more)

### Community 55 - "Orders schema"
Cohesion: 0.18
Nodes (11): Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.shippedAt, Shipment.status, Shipment.trackingNo (+3 more)

### Community 56 - "Inventory schema"
Cohesion: 0.2
Nodes (11): PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.listNumber, PickingList.pickedItems, PickingList.startedAt, PickingList.status, PickingList.totalItems (+3 more)

### Community 57 - "Inventory schema"
Cohesion: 0.22
Nodes (10): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.disposedQty, ReturnTransfer.processedBy, ReturnTransfer.quantity, ReturnTransfer.restockedQty, ReturnTransfer.rtNumber, ReturnTransfer.updatedAt (+2 more)

### Community 58 - "AgentOS schema"
Cohesion: 0.2
Nodes (10): AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.totalCostMicros, AgentRuntimeState.totalInputTokens, AgentRuntimeState.totalRuns (+2 more)

### Community 59 - "AgentOS schema"
Cohesion: 0.22
Nodes (10): AgentRunRequest.taskSession, AgentTaskSession.adapterType, AgentTaskSession.createdAt, AgentTaskSession.lastRun, AgentTaskSession.metadata, AgentTaskSession.sessionDisplay, AgentTaskSession.sessionParams, AgentTaskSession.updatedAt (+2 more)

### Community 60 - "Finance schema"
Cohesion: 0.2
Nodes (10): GradeHistory.calculatedAt, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.reason, GradeHistory.revenueScore, GradeHistory.score, GradeHistory.velocityScore (+2 more)

### Community 61 - "AI schema"
Cohesion: 0.2
Nodes (10): ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.originalImages, ContentGeneration.processedImages, ContentGeneration.retryCount, ContentGeneration.triggeredByUser (+2 more)

### Community 62 - "Inventory schema"
Cohesion: 0.2
Nodes (10): PickingItem.createdAt, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.pickedAt, PickingItem.pickingList, PickingItem.productName, PickingItem.quantity (+2 more)

### Community 63 - "AgentOS schema"
Cohesion: 0.22
Nodes (9): AgentRunRequest.sourceWorkflowRun, WorkflowRun.contextData, WorkflowRun.error, WorkflowRun.startedAt, WorkflowRun.status, WorkflowRun.steps, WorkflowRun.triggeredBy, WorkflowRun.updatedAt (+1 more)

### Community 64 - "System schema"
Cohesion: 0.22
Nodes (9): System, MigrationCheckpoint.createdAt, MigrationCheckpoint.updatedAt, SystemSetting.createdAt, SystemSetting.updatedAt, MigrationCheckpoint, SystemSetting, MigrationCheckpoint unique(scriptName, stepName, entityKey) (+1 more)

### Community 65 - "Orders schema"
Cohesion: 0.25
Nodes (8): Review.content, Review.createdAt, Review.id, Review.platform, Review.rating, Review.reviewedAt, Review.reviewerName, Review

### Community 66 - "code file: common.ts"
Cohesion: 0.29
Nodes (5): ApiErrorResponse, ApiErrorResponseSchema, PaginatedResponse, SyncInfo, SyncInfoSchema

### Community 67 - "code file: ai.ts"
Cohesion: 0.29
Nodes (5): DetailImageCount, DetailImageCountSchema, DetailPageAgeGroup, DetailPageTemplateId, DetailPageTemplateIdSchema

### Community 68 - "code file: reconciliation-action.dto.ts"
Cohesion: 0.29
Nodes (5): CoupangReconciliationIgnoreDto, CoupangReconciliationLinkDto, RESOLUTION_SOURCES, STATUSES, StatusFilter

### Community 69 - "Supply schema"
Cohesion: 0.29
Nodes (7): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.paidDate, SupplierPayment.purchaseOrder, SupplierPayment.status, SupplierPayment.updatedAt, SupplierPayment

### Community 70 - "code file: check-script-inventory.mjs"
Cohesion: 0.38
Nodes (5): analyzeInventory(), listTopLevelScriptFiles(), SCRIPT_INVENTORY, SUPPORT_FILES, result

### Community 71 - "AgentOS schema"
Cohesion: 0.33
Nodes (6): WorkflowTemplate.createdAt, WorkflowTemplate.description, WorkflowTemplate.marketplace, WorkflowTemplate.triggerType, WorkflowTemplate.version, WorkflowTemplate

### Community 72 - "System schema"
Cohesion: 0.33
Nodes (6): ActivityEvent.createdAt, ActivityEvent.eventType, ActivityEvent.objectId, ActivityEvent.source, ActivityEvent.title, ActivityEvent

### Community 73 - "System schema"
Cohesion: 0.33
Nodes (6): FeatureGate.allowedOrganizations, FeatureGate.description, FeatureGate.metadata, FeatureGate.updatedAt, FeatureGate, FeatureGateSchema

### Community 74 - "code file: seed-agent-os.spec.ts"
Cohesion: 0.4
Nodes (4): definitions, seedPath, serverSeedPath, types

### Community 75 - "Core schema"
Cohesion: 0.5
Nodes (5): CategoryMapping.coupangCategoryId, CategoryMapping.createdAt, CategoryMapping.internalCategory, CategoryMapping, CategoryMapping unique(organizationId, internalCategory)

### Community 76 - "code file: inspection.ts"
Cohesion: 0.4
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 77 - "code file: readiness.ts"
Cohesion: 0.4
Nodes (4): ReadinessCheck, ReadinessCheckSchema, ReadinessResponse, ReadinessResponseSchema

## Knowledge Gaps
- **1102 isolated node(s):** `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority` (+1097 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Channels schema` to `Core schema`, `code file: ads.ts`, `code file: dev-data.ts`, `prisma field: CandidateImage.isDeleted`, `code file: staging-db-baseline.ts`, `Advertising schema`, `prisma field: channel-reconciliation.types.ts`, `code file: dev-data-coupang.ts`, `Inventory schema`, `AI schema`, `Orders schema`, `code file: dashboard.ts`, `AgentOS schema`, `code file: lifecycle-state.ts`, `Core schema`, `Core schema`, `Finance schema`, `AgentOS schema`, `Sourcing schema`, `Orders schema`, `code file: Order.status`, `AI schema`, `System schema`, `AgentOS schema`, `Inventory schema`, `code file: sources.ts`, `Channels schema`, `Orders schema`, `Orders schema`, `Supply schema`, `System schema`, `Channels schema`, `Core schema`, `AgentOS schema`, `Orders schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `Supply schema`, `AI schema`, `Inventory schema`, `Core schema`, `Orders schema`, `Inventory schema`, `Inventory schema`, `AgentOS schema`, `AgentOS schema`, `Finance schema`, `AI schema`, `System schema`, `Orders schema`, `Supply schema`, `AgentOS schema`, `System schema`, `System schema`, `Core schema`?**
  _High betweenness centrality (0.201) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `Orders schema` to `Channels schema`, `Core schema`, `prisma field: CandidateImage.isDeleted`, `Advertising schema`, `prisma field: channel-reconciliation.types.ts`, `Inventory schema`, `AI schema`, `AgentOS schema`, `Core schema`, `Core schema`, `Finance schema`, `AgentOS schema`, `Sourcing schema`, `Orders schema`, `Supply schema`, `AI schema`, `System schema`, `System schema`, `AgentOS schema`, `Inventory schema`, `Channels schema`, `Orders schema`, `Orders schema`, `Supply schema`, `System schema`, `Channels schema`, `Core schema`, `AgentOS schema`, `Orders schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `Supply schema`, `AI schema`, `Inventory schema`, `Core schema`, `Orders schema`, `Inventory schema`, `Inventory schema`, `AgentOS schema`, `AgentOS schema`, `Finance schema`, `AI schema`, `Inventory schema`, `AgentOS schema`, `System schema`, `Orders schema`, `Supply schema`, `AgentOS schema`, `System schema`, `System schema`, `Core schema`?**
  _High betweenness centrality (0.138) - this node is a cross-community bridge._
- **Why does `Inventory` connect `Inventory schema` to `Channels schema`, `Core schema`, `code file: dev-data.ts`, `prisma field: CandidateImage.isDeleted`, `Advertising schema`, `prisma field: channel-reconciliation.types.ts`, `code file: dev-data-coupang.ts`, `AI schema`, `code file: check-agents-hygiene.mjs`, `Orders schema`, `code file: dashboard.ts`, `code file: lifecycle-state.ts`, `Core schema`, `code file: dev-data-profiles.spec.ts`, `Core schema`, `Orders schema`, `Supply schema`, `code file: Order.status`, `AI schema`, `System schema`, `Inventory schema`, `Channels schema`, `Core schema`, `Supply schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `Finance schema`, `AI schema`, `Inventory schema`, `code file: common.ts`, `code file: check-script-inventory.mjs`, `code file: thumbnails.spec.ts`?**
  _High betweenness centrality (0.131) - this node is a cross-community bridge._
- **Are the 49 inferred relationships involving `Organization` (e.g. with `Thumbnail` and `ChannelReconciliationRun`) actually correct?**
  _`Organization` has 49 INFERRED edges - model-reasoned connections that need verification._
- **Are the 125 inferred relationships involving `Inventory` (e.g. with `Inventory.organization` and `StockTransfer`) actually correct?**
  _`Inventory` has 125 INFERRED edges - model-reasoned connections that need verification._
- **Are the 120 inferred relationships involving `ChannelReconciliationRun` (e.g. with `ChannelReconciliationItem.externalId` and `ChannelReconciliationItem.legacyCode`) actually correct?**
  _`ChannelReconciliationRun` has 120 INFERRED edges - model-reasoned connections that need verification._
- **Are the 124 inferred relationships involving `ChannelReconciliationService` (e.g. with `AdAction.organization` and `AdAction.listing`) actually correct?**
  _`ChannelReconciliationService` has 124 INFERRED edges - model-reasoned connections that need verification._