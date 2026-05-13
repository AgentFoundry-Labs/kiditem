# Graph Report - schema-consumers  (2026-05-13)

## Corpus Check
- 188 files · ~85,552 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2012 nodes · 7663 edges · 90 communities (87 shown, 3 thin omitted)
- Extraction: 47% EXTRACTED · 53% INFERRED · 0% AMBIGUOUS · INFERRED: 4045 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_code file ads.ts|code file: ads.ts]]
- [[_COMMUNITY_code file dev-data.ts|code file: dev-data.ts]]
- [[_COMMUNITY_code file generate-prisma-erd.mjs|code file: generate-prisma-erd.mjs]]
- [[_COMMUNITY_prisma field MasterProduct.barcode|prisma field: MasterProduct.barcode]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file dev-data-coupang.ts|code file: dev-data-coupang.ts]]
- [[_COMMUNITY_code file check-agents-hygiene.mjs|code file: check-agents-hygiene.mjs]]
- [[_COMMUNITY_code file staging-db-baseline.ts|code file: staging-db-baseline.ts]]
- [[_COMMUNITY_prisma field channel-reconciliation.types.ts|prisma field: channel-reconciliation.types.ts]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file lifecycle-state.ts|code file: lifecycle-state.ts]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_code file Order.status|code file: Order.status]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_code file run-data-migrations.ts|code file: run-data-migrations.ts]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_code file sources.ts|code file: sources.ts]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_code file dev-data-profiles.spec.ts|code file: dev-data-profiles.spec.ts]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Sourcing schema|Sourcing schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_code file removed-legacy-scripts.spec.ts|code file: removed-legacy-scripts.spec.ts]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Sourcing schema|Sourcing schema]]
- [[_COMMUNITY_code file patterns.ts|code file: patterns.ts]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_code file coupang-client.ts|code file: coupang-client.ts]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file channel-credential-crypto.ts|code file: channel-credential-crypto.ts]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_code file cli-args.ts|code file: cli-args.ts]]
- [[_COMMUNITY_code file prepare-coupang-extension.mjs|code file: prepare-coupang-extension.mjs]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file channel-dashboard.ts|code file: channel-dashboard.ts]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_prisma field AgentInstance.lifecycleStatus|prisma field: AgentInstance.lifecycleStatus]]
- [[_COMMUNITY_code file ai.ts|code file: ai.ts]]
- [[_COMMUNITY_code file common.ts|code file: common.ts]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_code file reconciliation-action.dto.ts|code file: reconciliation-action.dto.ts]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_code file seed-agent-os.spec.ts|code file: seed-agent-os.spec.ts]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_code file inspection.ts|code file: inspection.ts]]
- [[_COMMUNITY_code file readiness.ts|code file: readiness.ts]]
- [[_COMMUNITY_code file thumbnails.spec.ts|code file: thumbnails.spec.ts]]
- [[_COMMUNITY_code file codes.ts|code file: codes.ts]]
- [[_COMMUNITY_code file coupang-date-range.dto.ts|code file: coupang-date-range.dto.ts]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 212 edges
2. `Organization` - 180 edges
3. `Inventory` - 177 edges
4. `ChannelReconciliationService` - 168 edges
5. `ChannelReconciliationRun` - 167 edges
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

## Communities (90 total, 3 thin omitted)

### Community 0 - "Channels schema"
Cohesion: 0.05
Nodes (292): ChannelsModule, CoupangProviderAdapter, channels — Marketplace Sync And Reconciliation, prisma — Shared Schema, Channels, CoupangReconciliationRowDto, CoupangReconciliationScanDto, AppException (+284 more)

### Community 1 - "Core schema"
Cohesion: 0.04
Nodes (73): AdAction.listing, ChannelAdTargetDailySnapshot.listing, ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo, ChannelListing.exposureStatus (+65 more)

### Community 2 - "code file: ads.ts"
Cohesion: 0.04
Nodes (53): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot, AdCollectStatus (+45 more)

### Community 3 - "code file: dev-data.ts"
Cohesion: 0.09
Nodes (49): AdapterCommand, appendProjectReferenceDefaults(), archiveFileName(), archiveShaFileName(), BundleManifest, BundlePackageIndex, BundlePayload, BundleReference (+41 more)

### Community 4 - "code file: generate-prisma-erd.mjs"
Cohesion: 0.07
Nodes (44): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, __dirname, extractDocValue() (+36 more)

### Community 5 - "prisma field: MasterProduct.barcode"
Cohesion: 0.06
Nodes (39): MasterProduct.barcode, MasterProductImage.isDeleted, row, clean(), HardConflict, KiditemPlan, NAME_FIELDS, normalizeForGroup() (+31 more)

### Community 6 - "Advertising schema"
Cohesion: 0.05
Nodes (47): Advertising, AdAction.actionType, AdAction.adTargetDaily, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt (+39 more)

### Community 7 - "Orders schema"
Cohesion: 0.09
Nodes (40): externalOptionId canonical option identity, vendorItemId provider term, Database ERD, ActionTask.targetId, AdAction.targetType, AgentApprovalRequest.agentInstance, AgentCostEvent.agentInstance, AgentRun.agentInstance (+32 more)

### Community 8 - "code file: dev-data-coupang.ts"
Cohesion: 0.11
Nodes (42): appendFlag(), appendOption(), commandReplay(), commandSanitize(), apiHeaders(), apiUrl(), assertSafeDatasetId(), buildCoupangImageSyncRowsForListings() (+34 more)

### Community 9 - "code file: check-agents-hygiene.mjs"
Cohesion: 0.08
Nodes (33): checkClaudeShims(), checkTrackedClaudeDirectory(), findStaleInstructionLines(), git(), listTracked(), runChecks(), analyzeDirectoryArchitecture(), collectDirectoryArchitecture() (+25 more)

### Community 10 - "code file: staging-db-baseline.ts"
Cohesion: 0.1
Nodes (41): Command, commandExport(), referenceTypeFor(), execFileAsync, extractZipArchive(), CliArgs, assertNonProductionTarget(), assertRestoreConfirmation() (+33 more)

### Community 11 - "prisma field: channel-reconciliation.types.ts"
Cohesion: 0.08
Nodes (24): AdAction.externalId, ChannelAdTargetDailySnapshot.externalId, ChannelReconciliationItem.externalId, ChannelReconciliationItem.legacyCode, OrderLineItem.option, PurchaseOrderItem.option, ReturnTransfer.option, Shipment.option (+16 more)

### Community 12 - "Inventory schema"
Cohesion: 0.05
Nodes (39): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.reorderPoint, Inventory.reorderQuantity, Inventory.reservedStock (+31 more)

### Community 13 - "AI schema"
Cohesion: 0.05
Nodes (38): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.measuredAt, Thumbnail.prevClickRate, Thumbnail.status, Thumbnail.strategy (+30 more)

### Community 14 - "Core schema"
Cohesion: 0.06
Nodes (35): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.category, MasterProduct.costCny, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description, MasterProduct.detailPageUrl (+27 more)

### Community 15 - "AgentOS schema"
Cohesion: 0.06
Nodes (34): AgentRun.adapterType, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt, AgentRun.heartbeatAt (+26 more)

### Community 16 - "code file: lifecycle-state.ts"
Cohesion: 0.06
Nodes (31): ProductLifecycleState, BundleComponentSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, Master, MasterImageItem, MasterImageItemSchema, MasterImageRole (+23 more)

### Community 17 - "Core schema"
Cohesion: 0.08
Nodes (33): Core, BundleComponent.bundleOption, BundleComponent.componentOption, BundleComponent.createdAt, BundleComponent.updatedAt, MasterCodeCounter.updatedAt, MasterCodeCounter.value, ProductOption.availableStock (+25 more)

### Community 18 - "Finance schema"
Cohesion: 0.07
Nodes (28): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdBy, ManualLedger.description, ManualLedger.memo, ProcessingCost.createdAt (+20 more)

### Community 19 - "Orders schema"
Cohesion: 0.09
Nodes (25): SyncOrdersBodyDto, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.memo (+17 more)

### Community 20 - "Inventory schema"
Cohesion: 0.09
Nodes (26): Shipment.warehouse, StockTransaction.createdBy, StockTransaction.relatedId, StockTransaction.totalCost, StockTransaction.unitCost, StockTransaction.warehouse, StockTransfer.completedAt, StockTransfer.createdAt (+18 more)

### Community 21 - "Inventory schema"
Cohesion: 0.08
Nodes (22): OrderLineItem.listingOption, PickingItem.createdAt, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.pickedAt, PickingItem.productName, PickingItem.quantity (+14 more)

### Community 22 - "Supply schema"
Cohesion: 0.09
Nodes (25): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.isPrimary, MasterSupplierProduct.updatedAt, ProcessingCost.master, PurchaseOrder.supplier, SupplierProduct.createdAt, SupplierProduct.option (+17 more)

### Community 23 - "code file: Order.status"
Cohesion: 0.1
Nodes (23): Order.status, DeliveryCompanySchema, OrderActionResponse, OrderActionResponseSchema, OrderLineItemSchema, OrderListItem, OrderListItemSchema, OrderListLineItem (+15 more)

### Community 24 - "AgentOS schema"
Cohesion: 0.09
Nodes (23): ActionTask.assigneeUser, AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decisionReason, AgentApprovalRequest.status, AgentRunRequest.requestedBy, ContentGeneration.triggeredByUser, OrganizationMembership.invitedBy (+15 more)

### Community 25 - "System schema"
Cohesion: 0.09
Nodes (23): Alert.actorUser, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead, Alert.kind, Alert.message (+15 more)

### Community 26 - "code file: run-data-migrations.ts"
Cohesion: 0.19
Nodes (21): DATA_MIGRATION_RELEASES, MigrationResult, commandStatus(), createPrisma(), appReleaseVersion(), assertApplyDataMigrationsConfirmation(), assertMutatingTarget(), commandUp() (+13 more)

### Community 27 - "AgentOS schema"
Cohesion: 0.1
Nodes (22): AgentOS, AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.modelOverride, AgentInstance.name, AgentInstance.parent, AgentInstance.pausedAt, AgentInstance.pauseReason (+14 more)

### Community 28 - "System schema"
Cohesion: 0.09
Nodes (22): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.installCount, Marketplace.isPublished (+14 more)

### Community 29 - "AI schema"
Cohesion: 0.1
Nodes (21): ContentAsset.assetKey, ContentAsset.assetType, ContentAsset.createdAt, ContentAsset.createdByUser, ContentAsset.deletedAt, ContentAsset.fileSize, ContentAsset.height, ContentAsset.label (+13 more)

### Community 30 - "AI schema"
Cohesion: 0.1
Nodes (20): packages/shared — @kiditem/shared, AI, ContentAsset.contentGeneration, ContentGeneration.contentType, ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.editedHtml, ContentGeneration.errorMessage (+12 more)

### Community 31 - "code file: sources.ts"
Cohesion: 0.11
Nodes (18): OrderSheetResponse, PanelRunSource, PanelRunSourceSchema, sourceKeys, PanelAlertItem, PanelDismissEvent, PanelEvent, PanelItem (+10 more)

### Community 32 - "Channels schema"
Cohesion: 0.12
Nodes (18): ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank, ChannelListingDailySnapshot.createdAt (+10 more)

### Community 33 - "code file: dev-data-profiles.spec.ts"
Cohesion: 0.11
Nodes (17): bundleDir, consumerRoot, domainRoot, encryptedMirrorRoot, imageSyncPayloadPath, kiditemListPath, latestJson, payloadPath (+9 more)

### Community 34 - "Supply schema"
Cohesion: 0.11
Nodes (18): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.inspectedAt, PurchaseOrder.orderDate, PurchaseOrder.receivedAt (+10 more)

### Community 35 - "Orders schema"
Cohesion: 0.12
Nodes (18): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+10 more)

### Community 36 - "Orders schema"
Cohesion: 0.12
Nodes (18): CSRecord.assignee, CSRecord.content, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.order, CSRecord.priority (+10 more)

### Community 37 - "Sourcing schema"
Cohesion: 0.12
Nodes (15): CandidateImage.candidate, ContentGenerationSource.sourceCandidate, SourcingCandidate.costCny, SourcingCandidate.description, SourcingCandidate.imageUrl, SourcingCandidate.promotedMaster, SourcingCandidate.rawData, SourcingCandidate.rejectedAt (+7 more)

### Community 38 - "Channels schema"
Cohesion: 0.12
Nodes (17): ChannelScrapeRun.businessDate, ChannelScrapeRun.createdAt, ChannelScrapeRun.errorCount, ChannelScrapeRun.errorJson, ChannelScrapeRun.finishedAt, ChannelScrapeRun.matchedCount, ChannelScrapeRun.metaJson, ChannelScrapeRun.pageType (+9 more)

### Community 39 - "System schema"
Cohesion: 0.12
Nodes (17): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+9 more)

### Community 40 - "AgentOS schema"
Cohesion: 0.13
Nodes (16): AgentRunRequest.claimedAt, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.createdAt, AgentRunRequest.finishedAt, AgentRunRequest.idempotencyKey, AgentRunRequest.lastErrorCode, AgentRunRequest.maxAttempts, AgentRunRequest.payload (+8 more)

### Community 41 - "Core schema"
Cohesion: 0.15
Nodes (15): ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.isPrimary, ChannelAccount.sellerId, ChannelAccount.status, ChannelAccount.updatedAt, ChannelAccount.vendorId, ChannelAccount (+7 more)

### Community 42 - "code file: removed-legacy-scripts.spec.ts"
Cohesion: 0.13
Nodes (14): dataRoot, exportOutput, packageJson, payloadDir, runDevData(), tempRoot, absolutePath, deletedLegacyTables (+6 more)

### Community 43 - "System schema"
Cohesion: 0.14
Nodes (13): DataMigrationRun.affectedRows, DataMigrationRun.completedAt, DataMigrationRun.createdAt, DataMigrationRun.details, DataMigrationRun.gitSha, DataMigrationRun.migrationId, DataMigrationRun.prismaSchemaHash, DataMigrationRun.releaseVersion (+5 more)

### Community 44 - "Orders schema"
Cohesion: 0.15
Nodes (15): OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.metadata, OrderReturn.platform, OrderReturn.reason (+7 more)

### Community 45 - "Sourcing schema"
Cohesion: 0.14
Nodes (14): Sourcing, CandidateImage.createdAt, CandidateImage.fileSize, CandidateImage.height, CandidateImage.isPrimary, CandidateImage.mimeType, CandidateImage.sortOrder, CandidateImage.source (+6 more)

### Community 46 - "code file: patterns.ts"
Cohesion: 0.24
Nodes (10): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), scrubDeep(), scrubSecrets(), a, input, now (+2 more)

### Community 47 - "AgentOS schema"
Cohesion: 0.17
Nodes (12): AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decision, AgentAuthorizationEvent.policySnapshot, AgentToolDefinition.createdAt, AgentToolDefinition.credentialKind, AgentToolDefinition.description, AgentToolDefinition.inputSchemaJson (+4 more)

### Community 48 - "AgentOS schema"
Cohesion: 0.17
Nodes (12): AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.inputTokens, AgentCostEvent.metadata, AgentCostEvent.model (+4 more)

### Community 49 - "Inventory schema"
Cohesion: 0.18
Nodes (12): PickingItem.pickingList, PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.listNumber, PickingList.pickedItems, PickingList.startedAt, PickingList.status (+4 more)

### Community 50 - "Inventory schema"
Cohesion: 0.18
Nodes (12): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.items, StockAudit.matchedCount, StockAudit.notes (+4 more)

### Community 51 - "Supply schema"
Cohesion: 0.17
Nodes (11): Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.leadTimeDays, Supplier.name, Supplier.notes, Supplier.phone (+3 more)

### Community 52 - "code file: coupang-client.ts"
Cohesion: 0.32
Nodes (9): CoupangCredentials, coupangRequest(), generateAuthorization(), approveReturn(), confirmOrderSheets(), getOrderSheets(), uploadInvoice(), getSellerProduct() (+1 more)

### Community 53 - "Orders schema"
Cohesion: 0.18
Nodes (12): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.metadata, OrderLineItem.productName, OrderLineItem.quantity, OrderLineItem.status, OrderLineItem.totalPrice, OrderLineItem.unitPrice (+4 more)

### Community 54 - "code file: channel-credential-crypto.ts"
Cohesion: 0.27
Nodes (8): readCredentialsConfig(), toJsonRecord(), toRecord(), trimToOptional(), CoupangCredentialCryptoError, encryptCredential(), EncryptedCredentialEnvelope, resolveKey()

### Community 55 - "Community 55"
Cohesion: 0.2
Nodes (8): scanSummaryMessage(), errorMessage(), resultMessage(), isCoupangCredentialResolutionError(), syncCoupangOrders(), syncSingleCoupangOrder(), syncCoupangProducts(), syncSingleProductListing()

### Community 56 - "AI schema"
Cohesion: 0.18
Nodes (12): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.originalGrade, ThumbnailTracking.originalScore, ThumbnailTracking.reviewsAfter, ThumbnailTracking.salesAfter (+4 more)

### Community 57 - "code file: cli-args.ts"
Cohesion: 0.24
Nodes (10): appendValues(), Args, COMMANDS, ParsedArgs, parseRawArgs(), ParseRawArgsOptions, pushValue(), values() (+2 more)

### Community 58 - "code file: prepare-coupang-extension.mjs"
Cohesion: 0.18
Nodes (9): DEFAULT_OUTPUT_PATH, addUnique(), defaultSourceDir, patchManifest(), runtimeFiles, manifest, dir, files (+1 more)

### Community 59 - "AgentOS schema"
Cohesion: 0.22
Nodes (11): AgentRunRequest.taskSession, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.lastRun, AgentTaskSession.metadata, AgentTaskSession.sessionDisplay, AgentTaskSession.sessionParams (+3 more)

### Community 60 - "code file: channel-dashboard.ts"
Cohesion: 0.18
Nodes (10): ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow, ProductRankingRowSchema, ReturnFaultSplit, ReturnFaultSplitSchema, ReturnReasonRow, ReturnReasonRowSchema (+2 more)

### Community 61 - "Core schema"
Cohesion: 0.18
Nodes (11): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name, LegalEntity.representativeName (+3 more)

### Community 62 - "Orders schema"
Cohesion: 0.18
Nodes (11): Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.shippedAt, Shipment.status, Shipment.trackingNo (+3 more)

### Community 63 - "AgentOS schema"
Cohesion: 0.2
Nodes (10): AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.totalCostMicros, AgentRuntimeState.totalInputTokens, AgentRuntimeState.totalRuns (+2 more)

### Community 64 - "Inventory schema"
Cohesion: 0.22
Nodes (10): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.disposedQty, ReturnTransfer.processedBy, ReturnTransfer.quantity, ReturnTransfer.restockedQty, ReturnTransfer.rtNumber, ReturnTransfer.updatedAt (+2 more)

### Community 65 - "Finance schema"
Cohesion: 0.2
Nodes (10): GradeHistory.calculatedAt, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.reason, GradeHistory.revenueScore, GradeHistory.score, GradeHistory.velocityScore (+2 more)

### Community 66 - "AgentOS schema"
Cohesion: 0.22
Nodes (9): AgentRunRequest.sourceWorkflowRun, WorkflowRun.contextData, WorkflowRun.error, WorkflowRun.startedAt, WorkflowRun.status, WorkflowRun.steps, WorkflowRun.triggeredBy, WorkflowRun.updatedAt (+1 more)

### Community 67 - "System schema"
Cohesion: 0.22
Nodes (9): System, MigrationCheckpoint.createdAt, MigrationCheckpoint.updatedAt, SystemSetting.createdAt, SystemSetting.updatedAt, MigrationCheckpoint, SystemSetting, MigrationCheckpoint unique(scriptName, stepName, entityKey) (+1 more)

### Community 68 - "AI schema"
Cohesion: 0.22
Nodes (9): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.method, ThumbnailAnalysis.overallScore, ThumbnailAnalysis.qualityAnalyzedAt, ThumbnailAnalysis.recompose, ThumbnailAnalysis.scores, ThumbnailAnalysis.suggestions (+1 more)

### Community 69 - "prisma field: AgentInstance.lifecycleStatus"
Cohesion: 0.29
Nodes (6): AgentInstance.lifecycleStatus, agentRunRequestStatusSchema, agentRunStatusSchema, agentToolPolicyEffectSchema, createAgentRunRequestSchema, parsed

### Community 70 - "code file: ai.ts"
Cohesion: 0.29
Nodes (5): DetailImageCount, DetailImageCountSchema, DetailPageAgeGroup, DetailPageTemplateId, DetailPageTemplateIdSchema

### Community 71 - "code file: common.ts"
Cohesion: 0.29
Nodes (5): ApiErrorResponse, ApiErrorResponseSchema, PaginatedResponse, SyncInfo, SyncInfoSchema

### Community 72 - "Supply schema"
Cohesion: 0.29
Nodes (7): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.paidDate, SupplierPayment.purchaseOrder, SupplierPayment.status, SupplierPayment.updatedAt, SupplierPayment

### Community 73 - "code file: reconciliation-action.dto.ts"
Cohesion: 0.29
Nodes (5): CoupangReconciliationIgnoreDto, CoupangReconciliationLinkDto, RESOLUTION_SOURCES, STATUSES, StatusFilter

### Community 74 - "AgentOS schema"
Cohesion: 0.33
Nodes (6): WorkflowTemplate.createdAt, WorkflowTemplate.description, WorkflowTemplate.marketplace, WorkflowTemplate.triggerType, WorkflowTemplate.version, WorkflowTemplate

### Community 75 - "System schema"
Cohesion: 0.33
Nodes (6): FeatureGate.allowedOrganizations, FeatureGate.description, FeatureGate.metadata, FeatureGate.updatedAt, FeatureGate, FeatureGateSchema

### Community 76 - "System schema"
Cohesion: 0.33
Nodes (6): ActivityEvent.createdAt, ActivityEvent.eventType, ActivityEvent.objectId, ActivityEvent.source, ActivityEvent.title, ActivityEvent

### Community 77 - "code file: seed-agent-os.spec.ts"
Cohesion: 0.4
Nodes (4): definitions, seedPath, serverSeedPath, types

### Community 78 - "Core schema"
Cohesion: 0.5
Nodes (5): CategoryMapping.coupangCategoryId, CategoryMapping.createdAt, CategoryMapping.internalCategory, CategoryMapping, CategoryMapping unique(organizationId, internalCategory)

### Community 79 - "code file: inspection.ts"
Cohesion: 0.4
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 80 - "code file: readiness.ts"
Cohesion: 0.4
Nodes (4): ReadinessCheck, ReadinessCheckSchema, ReadinessResponse, ReadinessResponseSchema

## Knowledge Gaps
- **1142 isolated node(s):** `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority` (+1137 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Channels schema` to `Core schema`, `code file: ads.ts`, `code file: dev-data.ts`, `prisma field: MasterProduct.barcode`, `Advertising schema`, `Orders schema`, `code file: dev-data-coupang.ts`, `code file: staging-db-baseline.ts`, `prisma field: channel-reconciliation.types.ts`, `Inventory schema`, `AI schema`, `Core schema`, `AgentOS schema`, `code file: lifecycle-state.ts`, `Core schema`, `Finance schema`, `Orders schema`, `Inventory schema`, `Inventory schema`, `code file: Order.status`, `AgentOS schema`, `System schema`, `AgentOS schema`, `AI schema`, `AI schema`, `code file: sources.ts`, `Channels schema`, `Supply schema`, `Orders schema`, `Orders schema`, `Sourcing schema`, `Channels schema`, `System schema`, `AgentOS schema`, `Core schema`, `System schema`, `Orders schema`, `Sourcing schema`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Orders schema`, `AI schema`, `AgentOS schema`, `Core schema`, `Orders schema`, `AgentOS schema`, `Inventory schema`, `Finance schema`, `System schema`, `AI schema`, `Supply schema`, `AgentOS schema`, `System schema`, `System schema`, `Core schema`?**
  _High betweenness centrality (0.196) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `Orders schema` to `Channels schema`, `Core schema`, `prisma field: MasterProduct.barcode`, `Advertising schema`, `prisma field: channel-reconciliation.types.ts`, `Inventory schema`, `AI schema`, `Core schema`, `AgentOS schema`, `Core schema`, `Finance schema`, `Orders schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `System schema`, `AgentOS schema`, `System schema`, `AI schema`, `AI schema`, `Channels schema`, `Supply schema`, `Orders schema`, `Orders schema`, `Sourcing schema`, `Channels schema`, `System schema`, `AgentOS schema`, `Core schema`, `System schema`, `Orders schema`, `Sourcing schema`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Orders schema`, `AI schema`, `AgentOS schema`, `Core schema`, `Orders schema`, `AgentOS schema`, `Inventory schema`, `Finance schema`, `AgentOS schema`, `System schema`, `AI schema`, `Supply schema`, `AgentOS schema`, `System schema`, `System schema`, `Core schema`?**
  _High betweenness centrality (0.140) - this node is a cross-community bridge._
- **Why does `Inventory` connect `Inventory schema` to `Channels schema`, `Core schema`, `code file: dev-data.ts`, `prisma field: MasterProduct.barcode`, `Orders schema`, `code file: dev-data-coupang.ts`, `code file: check-agents-hygiene.mjs`, `prisma field: channel-reconciliation.types.ts`, `AI schema`, `Core schema`, `code file: lifecycle-state.ts`, `Core schema`, `Orders schema`, `Inventory schema`, `Inventory schema`, `Supply schema`, `code file: Order.status`, `AI schema`, `Channels schema`, `code file: dev-data-profiles.spec.ts`, `Core schema`, `code file: removed-legacy-scripts.spec.ts`, `Inventory schema`, `Inventory schema`, `Supply schema`, `Inventory schema`, `Finance schema`, `AI schema`, `code file: common.ts`, `code file: thumbnails.spec.ts`, `code file: codes.ts`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Are the 51 inferred relationships involving `Organization` (e.g. with `Thumbnail` and `ChannelReconciliationRun`) actually correct?**
  _`Organization` has 51 INFERRED edges - model-reasoned connections that need verification._
- **Are the 127 inferred relationships involving `Inventory` (e.g. with `Inventory.organization` and `StockTransfer`) actually correct?**
  _`Inventory` has 127 INFERRED edges - model-reasoned connections that need verification._
- **Are the 127 inferred relationships involving `ChannelReconciliationService` (e.g. with `AdAction.organization` and `AdAction.listing`) actually correct?**
  _`ChannelReconciliationService` has 127 INFERRED edges - model-reasoned connections that need verification._
- **Are the 122 inferred relationships involving `ChannelReconciliationRun` (e.g. with `ChannelReconciliationItem.externalId` and `ChannelReconciliationItem.legacyCode`) actually correct?**
  _`ChannelReconciliationRun` has 122 INFERRED edges - model-reasoned connections that need verification._