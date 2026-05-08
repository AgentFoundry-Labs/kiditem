# Graph Report - schema-consumers  (2026-05-07)

## Corpus Check
- 135 files · ~73,396 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1743 nodes · 6264 edges · 80 communities (76 shown, 4 thin omitted)
- Extraction: 49% EXTRACTED · 51% INFERRED · 0% AMBIGUOUS · INFERRED: 3190 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_code file dev-data-coupang.ts|code file: dev-data-coupang.ts]]
- [[_COMMUNITY_code file generate-prisma-erd.mjs|code file: generate-prisma-erd.mjs]]
- [[_COMMUNITY_code file ads.ts|code file: ads.ts]]
- [[_COMMUNITY_code file MasterProductImage.isDeleted|code file: MasterProductImage.isDeleted]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_prisma field ChannelAdTargetDailySnapshot.externalId|prisma field: ChannelAdTargetDailySnapshot.externalId]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_code file dashboard.ts|code file: dashboard.ts]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_code file product.ts|code file: product.ts]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file Order.status|code file: Order.status]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_code file sources.ts|code file: sources.ts]]
- [[_COMMUNITY_code file coupang-client.ts|code file: coupang-client.ts]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_code file statistics.spec.ts|code file: statistics.spec.ts]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file patterns.ts|code file: patterns.ts]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file channel-dashboard.ts|code file: channel-dashboard.ts]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_code file common.ts|code file: common.ts]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_prisma field ActionTask.targetId|prisma field: ActionTask.targetId]]
- [[_COMMUNITY_prisma field CSRecord.order|prisma field: CSRecord.order]]
- [[_COMMUNITY_prisma field AgentInstance.lifecycleStatus|prisma field: AgentInstance.lifecycleStatus]]
- [[_COMMUNITY_code file reconciliation-action.dto.ts|code file: reconciliation-action.dto.ts]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file inspection.ts|code file: inspection.ts]]
- [[_COMMUNITY_code file readiness.ts|code file: readiness.ts]]
- [[_COMMUNITY_code file login-magiclink.mjs|code file: login-magiclink.mjs]]
- [[_COMMUNITY_code file dashboard.spec.ts|code file: dashboard.spec.ts]]
- [[_COMMUNITY_code file coupang-date-range.dto.ts|code file: coupang-date-range.dto.ts]]
- [[_COMMUNITY_code file codes.ts|code file: codes.ts]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 200 edges
2. `Inventory` - 163 edges
3. `Organization` - 162 edges
4. `ChannelReconciliationService` - 157 edges
5. `ChannelReconciliationRun` - 154 edges
6. `ChannelSyncService` - 149 edges
7. `prisma — Shared Schema` - 148 edges
8. `channels — Coupang 통합 + Sync + Dashboard 도메인` - 129 edges
9. `ActionTask` - 102 edges
10. `ChannelDashboardService` - 99 edges
11. `Order` - 81 edges
12. `ReconciliationRow` - 80 edges

## Surprising Connections (you probably didn't know these)
- `ReconciliationRow` --references_field--> `AdAction.externalId`  [INFERRED]
  packages/shared/src/schemas/channel-reconciliation.ts → prisma/models/advertising.prisma
- `ChannelReconciliationService` --references_field--> `AdAction.externalId`  [INFERRED]
  apps/server/src/channels/application/service/channel-reconciliation.service.ts → prisma/models/advertising.prisma
- `ChannelSyncService` --references_field--> `AdAction.externalId`  [INFERRED]
  apps/server/src/channels/application/service/channel-sync.service.ts → prisma/models/advertising.prisma
- `ChannelReconciliationService` --references_field--> `AdAction.organization`  [INFERRED]
  apps/server/src/channels/application/service/channel-reconciliation.service.ts → prisma/models/advertising.prisma
- `ChannelReconciliationService` --references_field--> `AdAction.listing`  [INFERRED]
  apps/server/src/channels/application/service/channel-reconciliation.service.ts → prisma/models/advertising.prisma
- `ChannelSyncService` --references_field--> `AdAction.listing`  [INFERRED]
  apps/server/src/channels/application/service/channel-sync.service.ts → prisma/models/advertising.prisma
- `ChannelReconciliationService` --references_field--> `ScrapeTarget.isActive`  [INFERRED]
  apps/server/src/channels/application/service/channel-reconciliation.service.ts → prisma/models/advertising.prisma
- `ChannelSyncService` --references_field--> `ScrapeTarget.isActive`  [INFERRED]
  apps/server/src/channels/application/service/channel-sync.service.ts → prisma/models/advertising.prisma

## Communities (80 total, 4 thin omitted)

### Community 0 - "Channels schema"
Cohesion: 0.06
Nodes (226): externalOptionId canonical option identity, vendorItemId provider term, channels — Coupang 통합 + Sync + Dashboard 도메인, prisma — Shared Schema, CoupangReconciliationRowDto, CoupangReconciliationScanDto, AppException, ActionTask.activityLog (+218 more)

### Community 1 - "code file: dev-data-coupang.ts"
Cohesion: 0.06
Nodes (106): AdapterCommand, appendFlag(), appendOption(), appendProjectReferenceDefaults(), appendValues(), archiveFileName(), archiveShaFileName(), Args (+98 more)

### Community 2 - "code file: generate-prisma-erd.mjs"
Cohesion: 0.08
Nodes (47): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), DEFAULT_DOMAIN_OUTPUT_DIR, DEFAULT_MODELS_DIR, DEFAULT_OUTPUT_PATH, __dirname (+39 more)

### Community 3 - "code file: ads.ts"
Cohesion: 0.04
Nodes (53): AdAccountKpi, AdAccountKpiDayPoint, AdAccountKpiDayPointSchema, AdAccountKpiSchema, AdBenchmarkData, AdBenchmarkDataSchema, AdCampaignSnapshot, AdCollectStatus (+45 more)

### Community 4 - "code file: MasterProductImage.isDeleted"
Cohesion: 0.06
Nodes (41): MasterProductImage.isDeleted, row, clean(), HardConflict, KiditemPlan, NAME_FIELDS, normalizeForGroup(), planKiditemImport() (+33 more)

### Community 5 - "Advertising schema"
Cohesion: 0.05
Nodes (44): packages/shared — @kiditem/shared, Advertising, AI, AdAction.actionType, AdAction.adTargetDaily, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt (+36 more)

### Community 6 - "Inventory schema"
Cohesion: 0.05
Nodes (39): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.reorderPoint, Inventory.reorderQuantity, Inventory.reservedStock (+31 more)

### Community 7 - "prisma field: ChannelAdTargetDailySnapshot.externalId"
Cohesion: 0.06
Nodes (35): ChannelAdTargetDailySnapshot.externalId, ChannelReconciliationItem.legacyCode, bundleDir, consumerRoot, dataRoot, domainRoot, encryptedMirrorRoot, exportOutput (+27 more)

### Community 8 - "AI schema"
Cohesion: 0.05
Nodes (36): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.measuredAt, Thumbnail.prevClickRate, Thumbnail.status, Thumbnail.strategy (+28 more)

### Community 9 - "Channels schema"
Cohesion: 0.06
Nodes (36): Channels, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank (+28 more)

### Community 10 - "AgentOS schema"
Cohesion: 0.06
Nodes (34): AgentRun.adapterType, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt, AgentRun.heartbeatAt (+26 more)

### Community 11 - "Core schema"
Cohesion: 0.06
Nodes (34): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.category, MasterProduct.costCny, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description, MasterProduct.detailPageUrl (+26 more)

### Community 12 - "code file: dashboard.ts"
Cohesion: 0.06
Nodes (33): AdMetricsDetail, AdMetricsDetailSchema, AlertItemDashboard, DailyAdItem, DailyAdItemSchema, DailyRevenueItem, DailyRevenueItemSchema, DashboardAdSummary (+25 more)

### Community 13 - "System schema"
Cohesion: 0.07
Nodes (32): Database ERD, System, ActivityEvent.createdAt, ActivityEvent.eventType, ActivityEvent.objectId, ActivityEvent.source, ActivityEvent.title, FeatureGate.allowedOrganizations (+24 more)

### Community 14 - "Core schema"
Cohesion: 0.09
Nodes (29): AdAction.listing, ChannelAdTargetDailySnapshot.listing, ChannelListingOption.createdAt, ChannelListingOption.isUnmatched, ChannelListingOption.salePrice, ChannelReconciliationItem.externalId, ChannelScrapeSnapshot.businessDate, ChannelScrapeSnapshot.createdAt (+21 more)

### Community 15 - "code file: product.ts"
Cohesion: 0.06
Nodes (30): BundleComponentSchema, GetMasterImagesResponse, GetMasterImagesResponseSchema, Master, MasterImageItem, MasterImageItemSchema, MasterImageRole, MasterImageRoleSchema (+22 more)

### Community 16 - "Community 16"
Cohesion: 0.09
Nodes (16): ReconciliationItem, ChannelListingHandle, ChannelListingOptionHandle, ChannelReconciliationService, collectIds(), MatchOutcome, OptionLinkBackfillResult, PrismaLike (+8 more)

### Community 17 - "Core schema"
Cohesion: 0.09
Nodes (28): BundleComponent.bundleOption, BundleComponent.componentOption, BundleComponent.createdAt, BundleComponent.updatedAt, ProductOption.availableStock, ProductOption.barcode, ProductOption.commissionRate, ProductOption.costPrice (+20 more)

### Community 18 - "Supply schema"
Cohesion: 0.08
Nodes (26): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.inspectedAt, PurchaseOrder.orderDate, PurchaseOrder.receivedAt (+18 more)

### Community 19 - "Orders schema"
Cohesion: 0.09
Nodes (25): SyncOrdersBodyDto, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.memo (+17 more)

### Community 20 - "code file: Order.status"
Cohesion: 0.09
Nodes (24): Order.status, DeliveryCompanySchema, OrderActionResponse, OrderActionResponseSchema, OrderLineItemSchema, OrderListItem, OrderListItemSchema, OrderListLineItem (+16 more)

### Community 21 - "AgentOS schema"
Cohesion: 0.09
Nodes (25): ActionTask.assigneeUser, AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decisionReason, AgentApprovalRequest.status, AgentRunRequest.requestedBy, OrganizationMembership.invitedBy (+17 more)

### Community 22 - "Supply schema"
Cohesion: 0.09
Nodes (24): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.isPrimary, MasterSupplierProduct.updatedAt, PurchaseOrder.supplier, Supplier.address, Supplier.contactName, Supplier.createdAt (+16 more)

### Community 23 - "System schema"
Cohesion: 0.09
Nodes (23): Alert.actorUser, Alert.createdAt, Alert.finishedAt, Alert.href, Alert.id, Alert.isRead, Alert.kind, Alert.message (+15 more)

### Community 24 - "AgentOS schema"
Cohesion: 0.1
Nodes (22): AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.modelOverride, AgentInstance.name, AgentInstance.parent, AgentInstance.pausedAt, AgentInstance.pauseReason, AgentInstance.promptPathOverride (+14 more)

### Community 25 - "System schema"
Cohesion: 0.09
Nodes (22): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.installCount, Marketplace.isPublished (+14 more)

### Community 26 - "Core schema"
Cohesion: 0.1
Nodes (21): Core, CategoryMapping.coupangCategoryId, CategoryMapping.createdAt, CategoryMapping.internalCategory, CategoryMapping.isActive, LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode (+13 more)

### Community 27 - "Orders schema"
Cohesion: 0.1
Nodes (19): ChannelListing.master, OrderLineItem.option, OrderReturnLineItem.createdAt, OrderReturnLineItem.productName, ReturnTransfer.option, Shipment.option, UnshippedItem.option, OrderReturnLineItem (+11 more)

### Community 28 - "Finance schema"
Cohesion: 0.11
Nodes (20): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdBy, ManualLedger.description, ManualLedger.memo, SalesPlan.actualOrders (+12 more)

### Community 29 - "code file: sources.ts"
Cohesion: 0.11
Nodes (17): PanelRunSource, PanelRunSourceSchema, sourceKeys, PanelAlertItem, PanelDismissEvent, PanelEvent, PanelItem, PanelItemBase (+9 more)

### Community 30 - "code file: coupang-client.ts"
Cohesion: 0.23
Nodes (16): ChannelsModule, coupangRequest(), generateAuthorization(), getEnvOrThrow(), getVendorId(), CoupangProviderAdapter, approveReturn(), confirmOrderSheets() (+8 more)

### Community 31 - "AgentOS schema"
Cohesion: 0.12
Nodes (18): AgentOS, AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decision, AgentAuthorizationEvent.policySnapshot, AgentBlueprintToolPolicy.createdAt, AgentBlueprintToolPolicy.dryRunMode, AgentBlueprintToolPolicy.updatedAt (+10 more)

### Community 32 - "Orders schema"
Cohesion: 0.12
Nodes (18): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+10 more)

### Community 33 - "Finance schema"
Cohesion: 0.13
Nodes (18): ProfitLoss.adCost, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit, ProfitLoss.orderCount, ProfitLoss.otherCost (+10 more)

### Community 34 - "AgentOS schema"
Cohesion: 0.13
Nodes (17): AgentRunRequest.agentInstance, AgentRunRequest.claimedAt, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.createdAt, AgentRunRequest.finishedAt, AgentRunRequest.idempotencyKey, AgentRunRequest.lastErrorCode, AgentRunRequest.maxAttempts (+9 more)

### Community 35 - "System schema"
Cohesion: 0.12
Nodes (17): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+9 more)

### Community 36 - "Inventory schema"
Cohesion: 0.13
Nodes (17): Shipment.warehouse, StockTransaction.createdBy, StockTransaction.relatedId, StockTransaction.totalCost, StockTransaction.unitCost, StockTransaction.warehouse, Warehouse.address, Warehouse.code (+9 more)

### Community 37 - "code file: statistics.spec.ts"
Cohesion: 0.13
Nodes (14): StatisticsCategoryRow, StatisticsCategoryRowSchema, StatisticsDeliveryDaily, StatisticsDeliveryDailySchema, StatisticsDeliveryResponse, StatisticsGradeRow, StatisticsOverview, StatisticsOverviewSchema (+6 more)

### Community 38 - "Orders schema"
Cohesion: 0.15
Nodes (15): OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.metadata, OrderReturn.platform, OrderReturn.reason (+7 more)

### Community 39 - "Core schema"
Cohesion: 0.15
Nodes (14): ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo, ChannelListing.exposureStatus, ChannelListing.externalId, ChannelListing.freeShipOverAmount (+6 more)

### Community 40 - "AgentOS schema"
Cohesion: 0.15
Nodes (13): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.inputTokens, AgentCostEvent.metadata (+5 more)

### Community 41 - "Orders schema"
Cohesion: 0.17
Nodes (13): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.listingOption, OrderLineItem.metadata, OrderLineItem.productName, OrderLineItem.quantity, OrderLineItem.status, OrderLineItem.totalPrice (+5 more)

### Community 42 - "code file: patterns.ts"
Cohesion: 0.24
Nodes (10): SECRET_PATTERNS, SENSITIVE_FIELD_KEYS, isPlainObject(), scrubDeep(), scrubSecrets(), a, input, now (+2 more)

### Community 43 - "Inventory schema"
Cohesion: 0.18
Nodes (12): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.items, StockAudit.matchedCount, StockAudit.notes (+4 more)

### Community 44 - "AI schema"
Cohesion: 0.18
Nodes (12): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.originalGrade, ThumbnailTracking.originalScore, ThumbnailTracking.reviewsAfter, ThumbnailTracking.salesAfter (+4 more)

### Community 45 - "AgentOS schema"
Cohesion: 0.18
Nodes (11): AgentBlueprint.catalogStatus, AgentBlueprint.createdAt, AgentBlueprint.defaultCapabilities, AgentBlueprint.defaultModel, AgentBlueprint.defaultRuntimeConfig, AgentBlueprint.description, AgentBlueprint.marketplace, AgentBlueprint.promptPath (+3 more)

### Community 46 - "AgentOS schema"
Cohesion: 0.22
Nodes (11): AgentRunRequest.taskSession, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.lastRun, AgentTaskSession.metadata, AgentTaskSession.sessionDisplay, AgentTaskSession.sessionParams (+3 more)

### Community 47 - "AgentOS schema"
Cohesion: 0.18
Nodes (11): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.totalCostMicros, AgentRuntimeState.totalInputTokens (+3 more)

### Community 48 - "Inventory schema"
Cohesion: 0.2
Nodes (11): PickingList.assignedTo, PickingList.completedAt, PickingList.createdAt, PickingList.listNumber, PickingList.pickedItems, PickingList.startedAt, PickingList.status, PickingList.totalItems (+3 more)

### Community 49 - "Orders schema"
Cohesion: 0.18
Nodes (11): Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.shippedAt, Shipment.status, Shipment.trackingNo (+3 more)

### Community 50 - "code file: channel-dashboard.ts"
Cohesion: 0.18
Nodes (10): ChannelDashboardSummary, ChannelDashboardSummarySchema, ProductRankingRow, ProductRankingRowSchema, ReturnFaultSplit, ReturnFaultSplitSchema, ReturnReasonRow, ReturnReasonRowSchema (+2 more)

### Community 51 - "Finance schema"
Cohesion: 0.2
Nodes (10): GradeHistory.calculatedAt, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.reason, GradeHistory.revenueScore, GradeHistory.score, GradeHistory.velocityScore (+2 more)

### Community 52 - "AI schema"
Cohesion: 0.2
Nodes (10): ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.originalImages, ContentGeneration.processedImages, ContentGeneration.retryCount, ContentGeneration.triggeredByUser (+2 more)

### Community 53 - "Inventory schema"
Cohesion: 0.2
Nodes (10): PickingItem.createdAt, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.pickedAt, PickingItem.pickingList, PickingItem.productName, PickingItem.quantity (+2 more)

### Community 54 - "Orders schema"
Cohesion: 0.2
Nodes (10): CSRecord.assignee, CSRecord.content, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.priority, CSRecord.resolution (+2 more)

### Community 55 - "Inventory schema"
Cohesion: 0.22
Nodes (10): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.disposedQty, ReturnTransfer.processedBy, ReturnTransfer.quantity, ReturnTransfer.restockedQty, ReturnTransfer.rtNumber, ReturnTransfer.updatedAt (+2 more)

### Community 56 - "code file: common.ts"
Cohesion: 0.2
Nodes (7): ApiErrorResponse, ApiErrorResponseSchema, PaginatedResponse, SyncInfo, SyncInfoSchema, zIsoDate, RangeSchema

### Community 57 - "Orders schema"
Cohesion: 0.2
Nodes (9): Review.content, Review.createdAt, Review.id, Review.listing, Review.platform, Review.rating, Review.reviewedAt, Review.reviewerName (+1 more)

### Community 58 - "AgentOS schema"
Cohesion: 0.22
Nodes (9): AgentRunRequest.sourceWorkflowRun, WorkflowRun.contextData, WorkflowRun.error, WorkflowRun.startedAt, WorkflowRun.status, WorkflowRun.steps, WorkflowRun.triggeredBy, WorkflowRun.updatedAt (+1 more)

### Community 59 - "Finance schema"
Cohesion: 0.22
Nodes (9): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.master, ProcessingCost.processType, ProcessingCost.productName, ProcessingCost.quantity, ProcessingCost.totalCost, ProcessingCost.vendor (+1 more)

### Community 60 - "AI schema"
Cohesion: 0.22
Nodes (9): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.method, ThumbnailAnalysis.overallScore, ThumbnailAnalysis.qualityAnalyzedAt, ThumbnailAnalysis.recompose, ThumbnailAnalysis.scores, ThumbnailAnalysis.suggestions (+1 more)

### Community 61 - "Inventory schema"
Cohesion: 0.22
Nodes (9): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.notes, StockTransfer.quantity, StockTransfer.requestedBy, StockTransfer.toWarehouse, StockTransfer.updatedAt (+1 more)

### Community 62 - "Core schema"
Cohesion: 0.25
Nodes (9): ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.isPrimary, ChannelAccount.sellerId, ChannelAccount.status, ChannelAccount.updatedAt, ChannelAccount.vendorId, ChannelAccount (+1 more)

### Community 63 - "prisma field: ActionTask.targetId"
Cohesion: 0.25
Nodes (5): ActionTask.targetId, AdAction.targetType, Alert.actionTask, Alert.targetId, Alert.targetType

### Community 64 - "prisma field: CSRecord.order"
Cohesion: 0.32
Nodes (8): CSRecord.order, PickingItem.orderId, Shipment.order, ReturnSummary, ReturnSummarySchema, ChannelAnalysis, ChannelAnalysisSchema, SalesAnalysisData

### Community 65 - "prisma field: AgentInstance.lifecycleStatus"
Cohesion: 0.29
Nodes (6): AgentInstance.lifecycleStatus, agentRunRequestStatusSchema, agentRunStatusSchema, agentToolPolicyEffectSchema, createAgentRunRequestSchema, parsed

### Community 66 - "code file: reconciliation-action.dto.ts"
Cohesion: 0.29
Nodes (5): CoupangReconciliationIgnoreDto, CoupangReconciliationLinkDto, RESOLUTION_SOURCES, STATUSES, StatusFilter

### Community 67 - "AgentOS schema"
Cohesion: 0.29
Nodes (7): WorkflowTemplate.createdAt, WorkflowTemplate.description, WorkflowTemplate.isActive, WorkflowTemplate.marketplace, WorkflowTemplate.triggerType, WorkflowTemplate.version, WorkflowTemplate

### Community 68 - "Orders schema"
Cohesion: 0.29
Nodes (7): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.isNotified, UnshippedItem.productName, UnshippedItem.quantity, UnshippedItem.reason, UnshippedItem

### Community 69 - "code file: inspection.ts"
Cohesion: 0.4
Nodes (4): InspectionItem, InspectionItemSchema, InspectionResult, InspectionResultSchema

### Community 70 - "code file: readiness.ts"
Cohesion: 0.4
Nodes (4): ReadinessCheck, ReadinessCheckSchema, ReadinessResponse, ReadinessResponseSchema

## Knowledge Gaps
- **1063 isolated node(s):** `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority` (+1058 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Organization` connect `Channels schema` to `code file: dev-data-coupang.ts`, `code file: generate-prisma-erd.mjs`, `code file: ads.ts`, `code file: MasterProductImage.isDeleted`, `Advertising schema`, `Inventory schema`, `AI schema`, `Channels schema`, `AgentOS schema`, `Core schema`, `code file: dashboard.ts`, `System schema`, `Core schema`, `code file: product.ts`, `Community 16`, `Core schema`, `Supply schema`, `Orders schema`, `code file: Order.status`, `AgentOS schema`, `Supply schema`, `System schema`, `AgentOS schema`, `Core schema`, `Orders schema`, `Finance schema`, `code file: sources.ts`, `AgentOS schema`, `Orders schema`, `Finance schema`, `AgentOS schema`, `System schema`, `Inventory schema`, `Orders schema`, `Core schema`, `AgentOS schema`, `Orders schema`, `Inventory schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `Orders schema`, `Finance schema`, `AI schema`, `Orders schema`, `Inventory schema`, `Orders schema`, `Finance schema`, `AI schema`, `Inventory schema`, `Core schema`, `prisma field: ActionTask.targetId`, `AgentOS schema`, `Orders schema`?**
  _High betweenness centrality (0.158) - this node is a cross-community bridge._
- **Why does `Database ERD` connect `System schema` to `Channels schema`, `code file: MasterProductImage.isDeleted`, `Advertising schema`, `Inventory schema`, `prisma field: ChannelAdTargetDailySnapshot.externalId`, `AI schema`, `Channels schema`, `AgentOS schema`, `Core schema`, `Core schema`, `Core schema`, `Supply schema`, `Orders schema`, `AgentOS schema`, `Supply schema`, `System schema`, `AgentOS schema`, `System schema`, `Core schema`, `Orders schema`, `Finance schema`, `AgentOS schema`, `Orders schema`, `Finance schema`, `AgentOS schema`, `System schema`, `Inventory schema`, `Orders schema`, `Core schema`, `AgentOS schema`, `Orders schema`, `Inventory schema`, `AI schema`, `AgentOS schema`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `Orders schema`, `Finance schema`, `AI schema`, `Inventory schema`, `Orders schema`, `Inventory schema`, `Orders schema`, `AgentOS schema`, `Finance schema`, `AI schema`, `Inventory schema`, `Core schema`, `prisma field: ActionTask.targetId`, `prisma field: CSRecord.order`, `AgentOS schema`, `Orders schema`?**
  _High betweenness centrality (0.142) - this node is a cross-community bridge._
- **Why does `Inventory` connect `Inventory schema` to `Channels schema`, `code file: dev-data-coupang.ts`, `code file: generate-prisma-erd.mjs`, `code file: MasterProductImage.isDeleted`, `Advertising schema`, `prisma field: ChannelAdTargetDailySnapshot.externalId`, `Channels schema`, `Core schema`, `code file: dashboard.ts`, `System schema`, `Core schema`, `code file: product.ts`, `Community 16`, `Core schema`, `Supply schema`, `Orders schema`, `code file: Order.status`, `Supply schema`, `Orders schema`, `Inventory schema`, `Inventory schema`, `Inventory schema`, `Finance schema`, `AI schema`, `Inventory schema`, `Inventory schema`, `code file: common.ts`, `Orders schema`, `Finance schema`, `AI schema`, `Inventory schema`, `code file: dashboard.spec.ts`, `code file: codes.ts`?**
  _High betweenness centrality (0.102) - this node is a cross-community bridge._
- **Are the 113 inferred relationships involving `Inventory` (e.g. with `Inventory.organization` and `StockTransfer`) actually correct?**
  _`Inventory` has 113 INFERRED edges - model-reasoned connections that need verification._
- **Are the 41 inferred relationships involving `Organization` (e.g. with `Thumbnail` and `ChannelReconciliationRun`) actually correct?**
  _`Organization` has 41 INFERRED edges - model-reasoned connections that need verification._
- **Are the 118 inferred relationships involving `ChannelReconciliationService` (e.g. with `AdAction.organization` and `AdAction.listing`) actually correct?**
  _`ChannelReconciliationService` has 118 INFERRED edges - model-reasoned connections that need verification._
- **Are the 109 inferred relationships involving `ChannelReconciliationRun` (e.g. with `ChannelReconciliationItem.externalId` and `ChannelReconciliationItem.legacyCode`) actually correct?**
  _`ChannelReconciliationRun` has 109 INFERRED edges - model-reasoned connections that need verification._