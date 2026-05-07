# Graph Report - schema-consumers  (2026-05-07)

## Corpus Check
- 133 files · ~71,990 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1231 nodes · 5413 edges · 66 communities (64 shown, 2 thin omitted)
- Extraction: 44% EXTRACTED · 56% INFERRED · 0% AMBIGUOUS · INFERRED: 3035 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_code file dev-data-coupang.ts|code file: dev-data-coupang.ts]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_code file generate-prisma-erd.mjs|code file: generate-prisma-erd.mjs]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file import-product-baseline.ts|code file: import-product-baseline.ts]]
- [[_COMMUNITY_code file coupang-client.ts|code file: coupang-client.ts]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file import-baseline-planner.ts|code file: import-baseline-planner.ts]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_code file patterns.ts|code file: patterns.ts]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AgentOS schema|AgentOS schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_code file coupang-date-range.dto.ts|code file: coupang-date-range.dto.ts]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 191 edges
2. `Organization` - 160 edges
3. `ChannelReconciliationService` - 141 edges
4. `ChannelSyncService` - 141 edges
5. `Inventory` - 135 edges
6. `channels — Coupang 통합 + Sync + Dashboard 도메인` - 129 edges
7. `ChannelReconciliationRun` - 128 edges
8. `prisma — Shared Schema` - 128 edges
9. `ActionTask` - 95 edges
10. `ChannelDashboardService` - 90 edges
11. `Order` - 81 edges
12. `ChannelDashboardController` - 78 edges

## Surprising Connections (you probably didn't know these)
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
- `ChannelSyncService` --references_field--> `ScrapeTarget.isActive`  [INFERRED]
  apps/server/src/channels/application/service/channel-sync.service.ts → prisma/models/advertising.prisma

## Communities (66 total, 2 thin omitted)

### Community 0 - "Channels schema"
Cohesion: 0.12
Nodes (139): prisma — Shared Schema, CoupangReconciliationRowDto, CoupangReconciliationScanDto, AppException, ActionTask.activityLog, ActionTask.apiCall, ActionTask.createdAt, ActionTask.date (+131 more)

### Community 1 - "code file: dev-data-coupang.ts"
Cohesion: 0.08
Nodes (83): appendFlag(), appendOption(), appendProjectReferenceDefaults(), appendValues(), archiveFileName(), archiveShaFileName(), assertSafeRelativePath(), bool() (+75 more)

### Community 2 - "Advertising schema"
Cohesion: 0.04
Nodes (49): packages/shared — @kiditem/shared, Advertising, AI, AdAction.actionType, AdAction.adTargetDaily, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt (+41 more)

### Community 3 - "code file: generate-prisma-erd.mjs"
Cohesion: 0.08
Nodes (38): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), extractDocValue(), extractRelationFields(), generateDomainErdMarkdown(), generateErdMarkdown() (+30 more)

### Community 4 - "Core schema"
Cohesion: 0.05
Nodes (41): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.category, MasterProduct.costCny, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description, MasterProduct.detailPageUrl (+33 more)

### Community 5 - "Core schema"
Cohesion: 0.13
Nodes (32): AdAction.externalId, AdAction.listing, ChannelAdTargetDailySnapshot.externalId, ChannelAdTargetDailySnapshot.listing, ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt, ChannelListing.deliveryChargeType (+24 more)

### Community 6 - "Orders schema"
Cohesion: 0.18
Nodes (34): channels — Coupang 통합 + Sync + Dashboard 도메인, Database ERD, CategoryMapping.isActive, ChannelListing.master, ChannelReconciliationItem.legacyCode, MasterProduct.barcode, MasterProduct.isDeleted, MasterProduct.legacyCode (+26 more)

### Community 7 - "Channels schema"
Cohesion: 0.06
Nodes (36): Channels, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank (+28 more)

### Community 8 - "Core schema"
Cohesion: 0.06
Nodes (35): Core, BundleComponent.bundleOption, BundleComponent.componentOption, BundleComponent.createdAt, BundleComponent.updatedAt, CategoryMapping.coupangCategoryId, CategoryMapping.createdAt, CategoryMapping.internalCategory (+27 more)

### Community 9 - "AgentOS schema"
Cohesion: 0.06
Nodes (34): AgentRun.adapterType, AgentRun.attempt, AgentRun.createdAt, AgentRun.errorCode, AgentRun.errorMessage, AgentRun.exitCode, AgentRun.finishedAt, AgentRun.heartbeatAt (+26 more)

### Community 10 - "Inventory schema"
Cohesion: 0.07
Nodes (31): Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.shippedAt, Shipment.status, Shipment.trackingNo (+23 more)

### Community 11 - "Orders schema"
Cohesion: 0.08
Nodes (25): SyncOrdersBodyDto, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.memo (+17 more)

### Community 12 - "Finance schema"
Cohesion: 0.09
Nodes (26): Finance, GradeHistory.calculatedAt, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.reason, GradeHistory.revenueScore, GradeHistory.score (+18 more)

### Community 13 - "AgentOS schema"
Cohesion: 0.09
Nodes (24): ActionTask.assigneeUser, AgentApprovalRequest.actionSnapshot, AgentApprovalRequest.agentInstance, AgentApprovalRequest.decidedAt, AgentApprovalRequest.decisionReason, AgentApprovalRequest.status, AgentRunRequest.requestedBy, OrganizationMembership.invitedBy (+16 more)

### Community 14 - "AgentOS schema"
Cohesion: 0.09
Nodes (23): AgentInstance.adapterType, AgentInstance.createdAt, AgentInstance.lifecycleStatus, AgentInstance.modelOverride, AgentInstance.name, AgentInstance.parent, AgentInstance.pausedAt, AgentInstance.pauseReason (+15 more)

### Community 15 - "Inventory schema"
Cohesion: 0.1
Nodes (21): PickingItem.createdAt, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.pickedAt, PickingItem.pickingList, PickingItem.productName, PickingItem.quantity (+13 more)

### Community 16 - "AI schema"
Cohesion: 0.1
Nodes (19): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.measuredAt, Thumbnail.prevClickRate, Thumbnail.status, Thumbnail.strategy (+11 more)

### Community 17 - "Core schema"
Cohesion: 0.13
Nodes (11): externalOptionId canonical option identity, vendorItemId provider term, ChannelListingOption.createdAt, ChannelListingOption.isUnmatched, ChannelListingOption.salePrice, OrderLineItem.listingOption, ChannelListingOption, ChannelSyncService (+3 more)

### Community 18 - "System schema"
Cohesion: 0.15
Nodes (14): ActionTask.targetId, AdAction.targetType, Alert.actionTask, Alert.createdAt, Alert.id, Alert.isRead, Alert.message, Alert.severity (+6 more)

### Community 19 - "Core schema"
Cohesion: 0.12
Nodes (19): ProductOption.availableStock, ProductOption.barcode, ProductOption.commissionRate, ProductOption.costPrice, ProductOption.createdAt, ProductOption.deletedAt, ProductOption.isBundle, ProductOption.isTemporary (+11 more)

### Community 20 - "AgentOS schema"
Cohesion: 0.12
Nodes (17): AgentRunRequest.agentInstance, AgentRunRequest.claimedAt, AgentRunRequest.coalescedIntoRequest, AgentRunRequest.createdAt, AgentRunRequest.finishedAt, AgentRunRequest.idempotencyKey, AgentRunRequest.lastErrorCode, AgentRunRequest.maxAttempts (+9 more)

### Community 21 - "Orders schema"
Cohesion: 0.12
Nodes (18): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+10 more)

### Community 22 - "System schema"
Cohesion: 0.11
Nodes (17): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.installCount, Marketplace.isPublished (+9 more)

### Community 23 - "Supply schema"
Cohesion: 0.11
Nodes (18): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.inspectedAt, PurchaseOrder.orderDate, PurchaseOrder.receivedAt (+10 more)

### Community 24 - "AgentOS schema"
Cohesion: 0.12
Nodes (17): AgentOS, AgentBlueprint.catalogStatus, AgentBlueprint.createdAt, AgentBlueprint.defaultCapabilities, AgentBlueprint.defaultModel, AgentBlueprint.defaultRuntimeConfig, AgentBlueprint.description, AgentBlueprint.marketplace (+9 more)

### Community 25 - "System schema"
Cohesion: 0.12
Nodes (17): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+9 more)

### Community 27 - "Inventory schema"
Cohesion: 0.18
Nodes (13): CSRecord.order, PickingItem.orderId, ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.disposedQty, ReturnTransfer.processedBy, ReturnTransfer.quantity, ReturnTransfer.restockedQty (+5 more)

### Community 28 - "Orders schema"
Cohesion: 0.15
Nodes (15): OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.metadata, OrderReturn.platform, OrderReturn.reason (+7 more)

### Community 29 - "code file: import-product-baseline.ts"
Cohesion: 0.18
Nodes (9): normalizeForGroup(), planKiditemImport(), planWingMatches(), applyKiditemPlan(), applySupplierMappings(), applyWingPlan(), collectSupplierSeeds(), readSheetRows() (+1 more)

### Community 30 - "code file: coupang-client.ts"
Cohesion: 0.33
Nodes (11): ChannelsModule, coupangRequest(), generateAuthorization(), getEnvOrThrow(), getVendorId(), CoupangProviderAdapter, approveReturn(), confirmOrderSheets() (+3 more)

### Community 31 - "AgentOS schema"
Cohesion: 0.15
Nodes (13): AgentCostEvent.agentInstance, AgentCostEvent.biller, AgentCostEvent.billingType, AgentCostEvent.cachedInputTokens, AgentCostEvent.costMicros, AgentCostEvent.createdAt, AgentCostEvent.inputTokens, AgentCostEvent.metadata (+5 more)

### Community 32 - "Orders schema"
Cohesion: 0.15
Nodes (10): CoupangReconciliationIgnoreDto, CoupangReconciliationLinkDto, Review.content, Review.createdAt, Review.id, Review.platform, Review.rating, Review.reviewedAt (+2 more)

### Community 33 - "AgentOS schema"
Cohesion: 0.17
Nodes (12): AgentAuthorizationEvent.agentInstance, AgentAuthorizationEvent.createdAt, AgentAuthorizationEvent.decision, AgentAuthorizationEvent.policySnapshot, AgentToolDefinition.createdAt, AgentToolDefinition.credentialKind, AgentToolDefinition.description, AgentToolDefinition.inputSchemaJson (+4 more)

### Community 34 - "Finance schema"
Cohesion: 0.18
Nodes (12): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.notes, SalesPlan.period, SalesPlan.targetOrders, SalesPlan.targetProfit (+4 more)

### Community 35 - "Inventory schema"
Cohesion: 0.18
Nodes (12): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.items, StockAudit.matchedCount, StockAudit.notes (+4 more)

### Community 36 - "AI schema"
Cohesion: 0.18
Nodes (12): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.originalGrade, ThumbnailTracking.originalScore, ThumbnailTracking.reviewsAfter, ThumbnailTracking.salesAfter (+4 more)

### Community 37 - "Orders schema"
Cohesion: 0.18
Nodes (12): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.metadata, OrderLineItem.productName, OrderLineItem.quantity, OrderLineItem.status, OrderLineItem.totalPrice, OrderLineItem.unitPrice (+4 more)

### Community 38 - "AgentOS schema"
Cohesion: 0.18
Nodes (11): AgentRuntimeState.agentInstance, AgentRuntimeState.consecutiveFailureCount, AgentRuntimeState.createdAt, AgentRuntimeState.lastError, AgentRuntimeState.lastHeartbeatAt, AgentRuntimeState.lastRun, AgentRuntimeState.totalCostMicros, AgentRuntimeState.totalInputTokens (+3 more)

### Community 39 - "AgentOS schema"
Cohesion: 0.22
Nodes (11): AgentRunRequest.taskSession, AgentTaskSession.adapterType, AgentTaskSession.agentInstance, AgentTaskSession.createdAt, AgentTaskSession.lastRun, AgentTaskSession.metadata, AgentTaskSession.sessionDisplay, AgentTaskSession.sessionParams (+3 more)

### Community 40 - "Supply schema"
Cohesion: 0.18
Nodes (11): Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.leadTimeDays, Supplier.name, Supplier.notes, Supplier.phone (+3 more)

### Community 41 - "Orders schema"
Cohesion: 0.2
Nodes (10): CSRecord.assignee, CSRecord.content, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.priority, CSRecord.resolution (+2 more)

### Community 42 - "code file: import-baseline-planner.ts"
Cohesion: 0.31
Nodes (6): clean(), projectWingRow(), rowName(), rowOptionName(), toInt(), toPositiveInt()

### Community 43 - "AgentOS schema"
Cohesion: 0.22
Nodes (9): AgentRunRequest.sourceWorkflowRun, WorkflowRun.contextData, WorkflowRun.error, WorkflowRun.startedAt, WorkflowRun.status, WorkflowRun.steps, WorkflowRun.triggeredBy, WorkflowRun.updatedAt (+1 more)

### Community 44 - "System schema"
Cohesion: 0.22
Nodes (9): System, MigrationCheckpoint.createdAt, MigrationCheckpoint.updatedAt, SystemSetting.createdAt, SystemSetting.updatedAt, MigrationCheckpoint, SystemSetting, MigrationCheckpoint unique(scriptName, stepName, entityKey) (+1 more)

### Community 45 - "AI schema"
Cohesion: 0.22
Nodes (9): ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.originalImages, ContentGeneration.processedImages, ContentGeneration.retryCount, ContentGeneration.updatedAt (+1 more)

### Community 46 - "code file: patterns.ts"
Cohesion: 0.52
Nodes (4): isPlainObject(), scrubDeep(), scrubSecrets(), walk()

### Community 47 - "Finance schema"
Cohesion: 0.29
Nodes (7): ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdBy, ManualLedger.description, ManualLedger.memo, ManualLedger

### Community 48 - "Orders schema"
Cohesion: 0.29
Nodes (7): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.isNotified, UnshippedItem.productName, UnshippedItem.quantity, UnshippedItem.reason, UnshippedItem

### Community 49 - "Supply schema"
Cohesion: 0.29
Nodes (7): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.paidDate, SupplierPayment.purchaseOrder, SupplierPayment.status, SupplierPayment.updatedAt, SupplierPayment

### Community 50 - "AgentOS schema"
Cohesion: 0.33
Nodes (6): WorkflowTemplate.createdAt, WorkflowTemplate.description, WorkflowTemplate.marketplace, WorkflowTemplate.triggerType, WorkflowTemplate.version, WorkflowTemplate

### Community 51 - "System schema"
Cohesion: 0.33
Nodes (6): ActivityEvent.createdAt, ActivityEvent.eventType, ActivityEvent.objectId, ActivityEvent.source, ActivityEvent.title, ActivityEvent

### Community 52 - "Supply schema"
Cohesion: 0.33
Nodes (6): Supply, SupplierProduct.createdAt, SupplierProduct.supplyPrice, SupplierProduct.updatedAt, SupplierProduct, SupplierProduct unique(supplierId, optionId)

### Community 53 - "System schema"
Cohesion: 0.4
Nodes (5): FeatureGate.allowedOrganizations, FeatureGate.description, FeatureGate.metadata, FeatureGate.updatedAt, FeatureGate

### Community 54 - "Supply schema"
Cohesion: 0.4
Nodes (5): MasterSupplierProduct.createdAt, MasterSupplierProduct.isPrimary, MasterSupplierProduct.updatedAt, MasterSupplierProduct, MasterSupplierProduct unique(masterId, supplierId)

### Community 55 - "Community 55"
Cohesion: 0.67
Nodes (4): parseArgs(), pushValue(), requireExistingFile(), resolveInputPath()

## Knowledge Gaps
- **644 isolated node(s):** `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority` (+639 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Orders schema` to `Channels schema`, `Advertising schema`, `Core schema`, `Core schema`, `Channels schema`, `Core schema`, `AgentOS schema`, `Inventory schema`, `Orders schema`, `Finance schema`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `AI schema`, `Core schema`, `System schema`, `Core schema`, `AgentOS schema`, `Orders schema`, `System schema`, `Supply schema`, `AgentOS schema`, `System schema`, `Inventory schema`, `Orders schema`, `AgentOS schema`, `Orders schema`, `AgentOS schema`, `Finance schema`, `Inventory schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `Supply schema`, `Orders schema`, `AgentOS schema`, `System schema`, `AI schema`, `Finance schema`, `Orders schema`, `Supply schema`, `AgentOS schema`, `System schema`, `Supply schema`, `System schema`, `Supply schema`?**
  _High betweenness centrality (0.222) - this node is a cross-community bridge._
- **Why does `Organization` connect `Channels schema` to `code file: dev-data-coupang.ts`, `Advertising schema`, `Core schema`, `Core schema`, `Orders schema`, `Channels schema`, `Core schema`, `AgentOS schema`, `Inventory schema`, `Orders schema`, `Finance schema`, `AgentOS schema`, `AgentOS schema`, `Inventory schema`, `AI schema`, `Core schema`, `System schema`, `Core schema`, `AgentOS schema`, `Orders schema`, `Supply schema`, `System schema`, `Community 26`, `Inventory schema`, `Orders schema`, `code file: import-product-baseline.ts`, `AgentOS schema`, `Orders schema`, `AgentOS schema`, `Finance schema`, `Inventory schema`, `AI schema`, `Orders schema`, `AgentOS schema`, `AgentOS schema`, `Supply schema`, `Orders schema`, `System schema`, `AI schema`, `Finance schema`, `Orders schema`, `Supply schema`, `AgentOS schema`, `System schema`, `System schema`?**
  _High betweenness centrality (0.218) - this node is a cross-community bridge._
- **Why does `MasterProduct` connect `Core schema` to `Channels schema`, `Core schema`, `Orders schema`, `Core schema`, `code file: import-baseline-planner.ts`, `Finance schema`, `AI schema`, `AI schema`, `Core schema`, `Core schema`, `Supply schema`, `Community 26`, `code file: import-product-baseline.ts`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Are the 40 inferred relationships involving `Organization` (e.g. with `Thumbnail` and `ChannelReconciliationRun`) actually correct?**
  _`Organization` has 40 INFERRED edges - model-reasoned connections that need verification._
- **Are the 120 inferred relationships involving `ChannelReconciliationService` (e.g. with `AdAction.organization` and `AdAction.listing`) actually correct?**
  _`ChannelReconciliationService` has 120 INFERRED edges - model-reasoned connections that need verification._
- **Are the 122 inferred relationships involving `ChannelSyncService` (e.g. with `AdAction.organization` and `ScrapeTarget.organization`) actually correct?**
  _`ChannelSyncService` has 122 INFERRED edges - model-reasoned connections that need verification._
- **Are the 114 inferred relationships involving `Inventory` (e.g. with `Inventory.organization` and `StockTransaction`) actually correct?**
  _`Inventory` has 114 INFERRED edges - model-reasoned connections that need verification._