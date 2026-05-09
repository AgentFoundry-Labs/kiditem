# Graph Report - schema-consumers  (2026-05-09)

## Corpus Check
- 136 files · ~73,511 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1741 nodes · 6330 edges · 77 communities (73 shown, 4 thin omitted)
- Extraction: 49% EXTRACTED · 51% INFERRED · 0% AMBIGUOUS · INFERRED: 3256 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_code file dev-data-coupang.ts|code file: dev-data-coupang.ts]]
- [[_COMMUNITY_code file ads.ts|code file: ads.ts]]
- [[_COMMUNITY_prisma field AdAction.externalId|prisma field: AdAction.externalId]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_code file dev-data-profiles.spec.ts|code file: dev-data-profiles.spec.ts]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file generate-prisma-erd.mjs|code file: generate-prisma-erd.mjs]]
- [[_COMMUNITY_code file product.ts|code file: product.ts]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file Order.status|code file: Order.status]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_prisma field Database ERD|prisma field: Database ERD]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_code file coupang-client.ts|code file: coupang-client.ts]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_canonical concept externalOptionId canonical option identity|canonical concept: externalOptionId canonical option identity]]
- [[_COMMUNITY_code file sources.ts|code file: sources.ts]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_code file statistics.spec.ts|code file: statistics.spec.ts]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_code file patterns.ts|code file: patterns.ts]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file channel-dashboard.ts|code file: channel-dashboard.ts]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file common.ts|code file: common.ts]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file reconciliation-action.dto.ts|code file: reconciliation-action.dto.ts]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_code file readiness.ts|code file: readiness.ts]]
- [[_COMMUNITY_code file inspection.ts|code file: inspection.ts]]
- [[_COMMUNITY_code file login-magiclink.mjs|code file: login-magiclink.mjs]]
- [[_COMMUNITY_code file dashboard.spec.ts|code file: dashboard.spec.ts]]
- [[_COMMUNITY_code file codes.ts|code file: codes.ts]]
- [[_COMMUNITY_code file coupang-date-range.dto.ts|code file: coupang-date-range.dto.ts]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 200 edges
2. `Inventory` - 165 edges
3. `Organization` - 164 edges
4. `ChannelReconciliationService` - 159 edges
5. `ChannelReconciliationRun` - 156 edges
6. `ChannelSyncService` - 151 edges
7. `prisma — Shared Schema` - 149 edges
8. `channels — Coupang 통합 + Sync + Dashboard 도메인` - 131 edges
9. `ActionTask` - 104 edges
10. `ChannelDashboardService` - 101 edges
11. `ReconciliationRow` - 82 edges
12. `Order` - 81 edges

## Surprising Connections (you probably didn't know these)
- `ReconciliationRow` --references_field--> `AdAction.externalId`  [INFERRED]
  packages/shared/src/schemas/channel-reconciliation.ts → prisma/models/advertising.prisma
- `ChannelReconciliationService` --references_field--> `AdAction.externalId`  [INFERRED]
  apps/server/src/channels/application/service/channel-reconciliation.service.ts → prisma/models/advertising.prisma
- `ChannelSyncService` --references_field--> `AdAction.externalId`  [INFERRED]
  apps/server/src/channels/application/service/channel-sync.service.ts → prisma/models/advertising.prisma
- `ChannelReconciliationService` --references_field--> `AdAction.organization`  [INFERRED]
  apps/server/src/channels/application/service/channel-reconciliation.service.ts → prisma/models/advertising.prisma
- `ChannelSyncService` --references_field--> `AdAction.organization`  [INFERRED]
  apps/server/src/channels/application/service/channel-sync.service.ts → prisma/models/advertising.prisma
- `ChannelReconciliationService` --references_field--> `AdAction.listing`  [INFERRED]
  apps/server/src/channels/application/service/channel-reconciliation.service.ts → prisma/models/advertising.prisma
- `ChannelSyncService` --references_field--> `AdAction.listing`  [INFERRED]
  apps/server/src/channels/application/service/channel-sync.service.ts → prisma/models/advertising.prisma
- `ChannelReconciliationService` --references_field--> `ScrapeTarget.isActive`  [INFERRED]
  apps/server/src/channels/application/service/channel-reconciliation.service.ts → prisma/models/advertising.prisma

## Communities (77 total, 4 thin omitted)

### Community 0 - "Channels schema"
Cohesion: 0.05
Nodes (261): channels — Coupang 통합 + Sync + Dashboard 도메인, prisma — Shared Schema, AI, CoupangReconciliationRowDto, CoupangReconciliationScanDto, AppException, ActionTask.activityLog, ActionTask.apiCall (+253 more)

### Community 1 - "code file: dev-data-coupang.ts"
Cohesion: 0.06
Nodes (109): AdapterCommand, appendFlag(), appendOption(), appendProjectReferenceDefaults(), appendValues(), archiveFileName(), archiveShaFileName(), Args (+101 more)

### Community 2 - "code file: ads.ts"
Cohesion: 0.04
Nodes (53): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot, AdCollectStatus (+45 more)

### Community 3 - "prisma field: AdAction.externalId"
Cohesion: 0.05
Nodes (43): AdAction.externalId, ChannelAdTargetDailySnapshot.externalId, ChannelReconciliationItem.legacyCode, MasterProduct.barcode, MasterProduct.isDeleted, ThumbnailRegistrationAttempt.externalId, row, clean() (+35 more)

### Community 4 - "Advertising schema"
Cohesion: 0.04
Nodes (49): packages/shared — @kiditem/shared, Advertising, AdAction.actionType, AdAction.adTargetDaily, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson (+41 more)

### Community 5 - "Inventory schema"
Cohesion: 0.05
Nodes (39): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.reorderPoint, Inventory.reorderQuantity, Inventory.reservedStock (+31 more)

### Community 6 - "code file: dev-data-profiles.spec.ts"
Cohesion: 0.06
Nodes (36): bundleDir, consumerRoot, dataRoot, domainRoot, encryptedMirrorRoot, exportOutput, imageSyncPayloadPath, kiditemListPath (+28 more)

### Community 7 - "Finance schema"
Cohesion: 0.05
Nodes (38): Finance, GradeHistory.calculatedAt, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.reason, GradeHistory.revenueScore, GradeHistory.score (+30 more)

### Community 8 - "Core schema"
Cohesion: 0.07
Nodes (23): CategoryMapping.coupangCategoryId, CategoryMapping.createdAt, CategoryMapping.internalCategory, CategoryMapping.isActive, CategoryMapping, ReconciliationItem, Tx, ChannelListingHandle (+15 more)

### Community 9 - "AI schema"
Cohesion: 0.05
Nodes (36): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.measuredAt, Thumbnail.prevClickRate, Thumbnail.status, Thumbnail.strategy (+28 more)

### Community 10 - "Channels schema"
Cohesion: 0.06
Nodes (36): Channels, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank (+28 more)

### Community 11 - "Core schema"
Cohesion: 0.06
Nodes (35): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.category, MasterProduct.costCny, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description, MasterProduct.detailPageUrl (+27 more)

### Community 12 - "Core schema"
Cohesion: 0.07
Nodes (35): Core, BundleComponent.bundleOption, BundleComponent.componentOption, BundleComponent.createdAt, BundleComponent.updatedAt, MasterCodeCounter.updatedAt, MasterCodeCounter.value, OrderLineItem.option (+27 more)

### Community 13 - "AgentOS schema"
Cohesion: 0.06
Nodes (34): AgentRun.adapterType, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt, AgentRun.heartbeatAt (+26 more)

### Community 14 - "code file: generate-prisma-erd.mjs"
Cohesion: 0.1
Nodes (30): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+22 more)

### Community 15 - "code file: product.ts"
Cohesion: 0.06
Nodes (30): BundleComponentSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, Master, MasterImageItem, MasterImageItemSchema, MasterImageRole, MasterImageRoleSchema (+22 more)

### Community 16 - "Core schema"
Cohesion: 0.1
Nodes (27): AdAction.listing, ChannelAdTargetDailySnapshot.listing, ChannelListingOption.createdAt, ChannelListingOption.salePrice, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.createdAt, ChannelScrapeSnapshot.matchStatus, ChannelScrapeSnapshot.observedAt (+19 more)

### Community 17 - "Orders schema"
Cohesion: 0.09
Nodes (25): SyncOrdersBodyDto, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.memo (+17 more)

### Community 18 - "code file: Order.status"
Cohesion: 0.09
Nodes (24): Order.status, DeliveryCompanySchema, OrderActionResponse, OrderActionResponseSchema, OrderLineItemSchema, OrderListItem, OrderListItemSchema, OrderListLineItem (+16 more)

### Community 19 - "Inventory schema"
Cohesion: 0.09
Nodes (26): Shipment.warehouse, StockTransaction.createdBy, StockTransaction.relatedId, StockTransaction.totalCost, StockTransaction.unitCost, StockTransaction.warehouse, StockTransfer.completedAt, StockTransfer.createdAt (+18 more)

### Community 20 - "Supply schema"
Cohesion: 0.09
Nodes (25): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.isPrimary, MasterSupplierProduct.updatedAt, PurchaseOrder.supplier, Supplier.address, Supplier.contactName, Supplier.createdAt (+17 more)

### Community 21 - "AgentOS schema"
Cohesion: 0.09
Nodes (23): ActionTask.assigneeUser, AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decisionReason, AgentApprovalRequest.status, AgentRunRequest.requestedBy, OrganizationMembership.invitedBy, ThumbnailGeneration.triggeredByUser (+15 more)

### Community 22 - "System schema"
Cohesion: 0.09
Nodes (23): Alert.actorUser, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead, Alert.kind, Alert.message (+15 more)

### Community 23 - "prisma field: Database ERD"
Cohesion: 0.17
Nodes (19): Database ERD, ActionTask.targetId, AdAction.targetType, AgentApprovalRequest.agentInstance, AgentAuthorizationEvent.agentInstance, AgentCostEvent.agentInstance, AgentRun.agentInstance, AgentRunEvent.agentInstance (+11 more)

### Community 24 - "Supply schema"
Cohesion: 0.09
Nodes (22): ChannelListing.master, ProcessingCost.master, PurchaseOrderItem.option, ReturnTransfer.option, Shipment.option, SupplierProduct.createdAt, SupplierProduct.option, SupplierProduct.supplyPrice (+14 more)

### Community 25 - "AgentOS schema"
Cohesion: 0.1
Nodes (21): AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name, AgentInstance.parent, AgentInstance.pausedAt, AgentInstance.pauseReason (+13 more)

### Community 26 - "System schema"
Cohesion: 0.09
Nodes (22): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.installCount, Marketplace.isPublished (+14 more)

### Community 27 - "code file: coupang-client.ts"
Cohesion: 0.23
Nodes (16): ChannelsModule, coupangRequest(), generateAuthorization(), getEnvOrThrow(), getVendorId(), CoupangProviderAdapter, approveReturn(), confirmOrderSheets() (+8 more)

### Community 28 - "Community 28"
Cohesion: 0.2
Nodes (15): add_code_reference_edges(), add_document_mentions(), add_schema_graph(), camel(), community_labels(), GraphBuilder, make_schema_consumers_graph(), make_schema_graph() (+7 more)

### Community 29 - "Finance schema"
Cohesion: 0.13
Nodes (18): ProfitLoss.adCost, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit, ProfitLoss.orderCount, ProfitLoss.otherCost (+10 more)

### Community 30 - "canonical concept: externalOptionId canonical option identity"
Cohesion: 0.14
Nodes (9): externalOptionId canonical option identity, vendorItemId provider term, ChannelSyncService, formatKstIso(), HealthResult, coupangPortStub, dateFrom, dateTo (+1 more)

### Community 31 - "code file: sources.ts"
Cohesion: 0.12
Nodes (16): PanelRunSource, PanelRunSourceSchema, sourceKeys, PanelAlertItem, PanelDismissEvent, PanelEvent, PanelItem, PanelItemBase (+8 more)

### Community 32 - "Supply schema"
Cohesion: 0.11
Nodes (18): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.inspectedAt, PurchaseOrder.orderDate, PurchaseOrder.receivedAt (+10 more)

### Community 33 - "Inventory schema"
Cohesion: 0.14
Nodes (18): CSRecord.order, PickingItem.orderId, ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.disposedQty, ReturnTransfer.processedBy, ReturnTransfer.quantity, ReturnTransfer.restockedQty (+10 more)

### Community 34 - "Orders schema"
Cohesion: 0.12
Nodes (18): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+10 more)

### Community 35 - "AgentOS schema"
Cohesion: 0.12
Nodes (17): AgentOS, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decision, AgentAuthorizationEvent.policySnapshot, AgentRunEvent.createdAt, AgentRunEvent.level, AgentRunEvent.logRef, AgentToolDefinition.createdAt (+9 more)

### Community 36 - "System schema"
Cohesion: 0.12
Nodes (17): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+9 more)

### Community 37 - "AgentOS schema"
Cohesion: 0.13
Nodes (16): AgentRunRequest.claimedAt, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.createdAt, AgentRunRequest.finishedAt, AgentRunRequest.idempotencyKey, AgentRunRequest.lastErrorCode, AgentRunRequest.maxAttempts, AgentRunRequest.payload (+8 more)

### Community 38 - "code file: statistics.spec.ts"
Cohesion: 0.13
Nodes (14): StatisticsCategoryRow, StatisticsCategoryRowSchema, StatisticsDeliveryDaily, StatisticsDeliveryDailySchema, StatisticsDeliveryResponse, StatisticsGradeRow, StatisticsOverview, StatisticsOverviewSchema (+6 more)

### Community 39 - "Orders schema"
Cohesion: 0.14
Nodes (15): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.metadata, OrderLineItem.productName, OrderLineItem.quantity, OrderLineItem.status, OrderLineItem.totalPrice, OrderLineItem.unitPrice (+7 more)

### Community 40 - "Orders schema"
Cohesion: 0.15
Nodes (15): OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.metadata, OrderReturn.platform, OrderReturn.reason (+7 more)

### Community 41 - "Core schema"
Cohesion: 0.17
Nodes (13): ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo, ChannelListing.exposureStatus, ChannelListing.externalId, ChannelListing.freeShipOverAmount (+5 more)

### Community 42 - "code file: patterns.ts"
Cohesion: 0.24
Nodes (10): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), scrubDeep(), scrubSecrets(), a, input, now (+2 more)

### Community 43 - "AgentOS schema"
Cohesion: 0.17
Nodes (12): AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.inputTokens, AgentCostEvent.metadata, AgentCostEvent.model (+4 more)

### Community 44 - "AI schema"
Cohesion: 0.18
Nodes (12): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.originalGrade, ThumbnailTracking.originalScore, ThumbnailTracking.reviewsAfter, ThumbnailTracking.salesAfter (+4 more)

### Community 45 - "Inventory schema"
Cohesion: 0.18
Nodes (12): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.items, StockAudit.matchedCount, StockAudit.notes (+4 more)

### Community 46 - "AgentOS schema"
Cohesion: 0.22
Nodes (11): AgentRunRequest.taskSession, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.lastRun, AgentTaskSession.metadata, AgentTaskSession.sessionDisplay, AgentTaskSession.sessionParams (+3 more)

### Community 47 - "Core schema"
Cohesion: 0.18
Nodes (11): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name, LegalEntity.representativeName (+3 more)

### Community 48 - "Inventory schema"
Cohesion: 0.2
Nodes (11): PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.listNumber, PickingList.pickedItems, PickingList.startedAt, PickingList.status, PickingList.totalItems (+3 more)

### Community 49 - "Orders schema"
Cohesion: 0.18
Nodes (11): Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.shippedAt, Shipment.status, Shipment.trackingNo (+3 more)

### Community 50 - "code file: channel-dashboard.ts"
Cohesion: 0.18
Nodes (10): ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow, ProductRankingRowSchema, ReturnFaultSplit, ReturnFaultSplitSchema, ReturnReasonRow, ReturnReasonRowSchema (+2 more)

### Community 51 - "AgentOS schema"
Cohesion: 0.2
Nodes (10): AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.totalCostMicros, AgentRuntimeState.totalInputTokens, AgentRuntimeState.totalRuns (+2 more)

### Community 52 - "Orders schema"
Cohesion: 0.2
Nodes (9): Review.content, Review.createdAt, Review.id, Review.listing, Review.platform, Review.rating, Review.reviewedAt, Review.reviewerName (+1 more)

### Community 53 - "Inventory schema"
Cohesion: 0.2
Nodes (10): PickingItem.createdAt, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.pickedAt, PickingItem.pickingList, PickingItem.productName, PickingItem.quantity (+2 more)

### Community 54 - "Orders schema"
Cohesion: 0.2
Nodes (10): CSRecord.assignee, CSRecord.content, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.priority, CSRecord.resolution (+2 more)

### Community 55 - "code file: common.ts"
Cohesion: 0.2
Nodes (7): ApiErrorResponse, ApiErrorResponseSchema, PaginatedResponse, SyncInfo, SyncInfoSchema, zIsoDate, RangeSchema

### Community 56 - "AI schema"
Cohesion: 0.2
Nodes (10): ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.originalImages, ContentGeneration.processedImages, ContentGeneration.retryCount, ContentGeneration.triggeredByUser (+2 more)

### Community 57 - "AgentOS schema"
Cohesion: 0.22
Nodes (9): AgentRunRequest.sourceWorkflowRun, WorkflowRun.contextData, WorkflowRun.error, WorkflowRun.startedAt, WorkflowRun.status, WorkflowRun.steps, WorkflowRun.triggeredBy, WorkflowRun.updatedAt (+1 more)

### Community 58 - "AI schema"
Cohesion: 0.22
Nodes (9): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.method, ThumbnailAnalysis.overallScore, ThumbnailAnalysis.qualityAnalyzedAt, ThumbnailAnalysis.recompose, ThumbnailAnalysis.scores, ThumbnailAnalysis.suggestions (+1 more)

### Community 59 - "System schema"
Cohesion: 0.22
Nodes (9): System, MigrationCheckpoint.createdAt, MigrationCheckpoint.updatedAt, SystemSetting.createdAt, SystemSetting.updatedAt, MigrationCheckpoint, SystemSetting, MigrationCheckpoint unique(scriptName, stepName, entityKey) (+1 more)

### Community 60 - "Core schema"
Cohesion: 0.25
Nodes (9): ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.isPrimary, ChannelAccount.sellerId, ChannelAccount.status, ChannelAccount.updatedAt, ChannelAccount.vendorId, ChannelAccount (+1 more)

### Community 61 - "Orders schema"
Cohesion: 0.29
Nodes (7): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.isNotified, UnshippedItem.productName, UnshippedItem.quantity, UnshippedItem.reason, UnshippedItem

### Community 62 - "code file: reconciliation-action.dto.ts"
Cohesion: 0.29
Nodes (5): CoupangReconciliationIgnoreDto, CoupangReconciliationLinkDto, RESOLUTION_SOURCES, STATUSES, StatusFilter

### Community 63 - "AgentOS schema"
Cohesion: 0.29
Nodes (7): WorkflowTemplate.createdAt, WorkflowTemplate.description, WorkflowTemplate.isActive, WorkflowTemplate.marketplace, WorkflowTemplate.triggerType, WorkflowTemplate.version, WorkflowTemplate

### Community 64 - "System schema"
Cohesion: 0.33
Nodes (6): FeatureGate.allowedOrganizations, FeatureGate.description, FeatureGate.metadata, FeatureGate.updatedAt, FeatureGate, FeatureGateSchema

### Community 65 - "System schema"
Cohesion: 0.33
Nodes (6): ActivityEvent.createdAt, ActivityEvent.eventType, ActivityEvent.objectId, ActivityEvent.source, ActivityEvent.title, ActivityEvent

### Community 66 - "code file: readiness.ts"
Cohesion: 0.4
Nodes (4): ReadinessCheck, ReadinessCheckSchema, ReadinessResponse, ReadinessResponseSchema

### Community 67 - "code file: inspection.ts"
Cohesion: 0.4
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

## Knowledge Gaps
- **1060 isolated node(s):** `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority` (+1055 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Channels schema` to `code file: dev-data-coupang.ts`, `code file: ads.ts`, `prisma field: AdAction.externalId`, `Advertising schema`, `Inventory schema`, `Finance schema`, `Core schema`, `AI schema`, `Channels schema`, `Core schema`, `Core schema`, `AgentOS schema`, `code file: product.ts`, `Core schema`, `Orders schema`, `code file: Order.status`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `System schema`, `prisma field: Database ERD`, `AgentOS schema`, `Finance schema`, `canonical concept: externalOptionId canonical option identity`, `code file: sources.ts`, `Supply schema`, `Inventory schema`, `Orders schema`, `AgentOS schema`, `System schema`, `AgentOS schema`, `Orders schema`, `Orders schema`, `Core schema`, `AgentOS schema`, `AI schema`, `Inventory schema`, `AgentOS schema`, `Core schema`, `Inventory schema`, `Orders schema`, `AgentOS schema`, `Orders schema`, `Orders schema`, `AI schema`, `AI schema`, `System schema`, `Core schema`, `Orders schema`, `AgentOS schema`, `System schema`, `System schema`?**
  _High betweenness centrality (0.150) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `prisma field: Database ERD` to `Channels schema`, `prisma field: AdAction.externalId`, `Advertising schema`, `Inventory schema`, `Finance schema`, `Core schema`, `AI schema`, `Channels schema`, `Core schema`, `Core schema`, `AgentOS schema`, `Core schema`, `Orders schema`, `Inventory schema`, `Supply schema`, `AgentOS schema`, `System schema`, `Supply schema`, `AgentOS schema`, `System schema`, `Finance schema`, `Supply schema`, `Inventory schema`, `Orders schema`, `AgentOS schema`, `System schema`, `AgentOS schema`, `Orders schema`, `Orders schema`, `Core schema`, `AgentOS schema`, `AI schema`, `Inventory schema`, `AgentOS schema`, `Core schema`, `Inventory schema`, `Orders schema`, `AgentOS schema`, `Orders schema`, `Inventory schema`, `Orders schema`, `AI schema`, `AgentOS schema`, `AI schema`, `System schema`, `Core schema`, `Orders schema`, `AgentOS schema`, `System schema`, `System schema`?**
  _High betweenness centrality (0.124) - this node is a cross-community bridge._
- **Why does `Inventory` connect `Inventory schema` to `Channels schema`, `code file: dev-data-coupang.ts`, `prisma field: AdAction.externalId`, `Advertising schema`, `code file: dev-data-profiles.spec.ts`, `Finance schema`, `Core schema`, `Channels schema`, `Core schema`, `Core schema`, `code file: product.ts`, `Core schema`, `Orders schema`, `code file: Order.status`, `Inventory schema`, `Supply schema`, `prisma field: Database ERD`, `Supply schema`, `canonical concept: externalOptionId canonical option identity`, `Inventory schema`, `Orders schema`, `Inventory schema`, `Inventory schema`, `Orders schema`, `Inventory schema`, `code file: common.ts`, `AI schema`, `AI schema`, `code file: dashboard.spec.ts`, `code file: codes.ts`?**
  _High betweenness centrality (0.102) - this node is a cross-community bridge._
- **Are the 115 inferred relationships involving `Inventory` (e.g. with `Inventory.organization` and `StockTransfer`) actually correct?**
  _`Inventory` has 115 INFERRED edges - model-reasoned connections that need verification._
- **Are the 41 inferred relationships involving `Organization` (e.g. with `Thumbnail` and `ChannelReconciliationRun`) actually correct?**
  _`Organization` has 41 INFERRED edges - model-reasoned connections that need verification._
- **Are the 120 inferred relationships involving `ChannelReconciliationService` (e.g. with `AdAction.organization` and `AdAction.listing`) actually correct?**
  _`ChannelReconciliationService` has 120 INFERRED edges - model-reasoned connections that need verification._
- **Are the 111 inferred relationships involving `ChannelReconciliationRun` (e.g. with `ChannelReconciliationItem.externalId` and `ChannelReconciliationItem.legacyCode`) actually correct?**
  _`ChannelReconciliationRun` has 111 INFERRED edges - model-reasoned connections that need verification._