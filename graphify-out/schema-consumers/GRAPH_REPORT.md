# Graph Report - schema-consumers  (2026-05-06)

## Corpus Check
- 127 files · ~62,039 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1143 nodes · 4856 edges · 59 communities (56 shown, 3 thin omitted)
- Extraction: 44% EXTRACTED · 56% INFERRED · 0% AMBIGUOUS · INFERRED: 2708 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_code file dev-data-coupang.ts|code file: dev-data-coupang.ts]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_code file generate-prisma-erd.mjs|code file: generate-prisma-erd.mjs]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_prisma field channels — Coupang 통합 + Sync + Dashboard 도메인|prisma field: channels — Coupang 통합 + Sync + Dashboard 도메인]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_prisma field MasterProduct.barcode|prisma field: MasterProduct.barcode]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file import-baseline-planner.ts|code file: import-baseline-planner.ts]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_code file dev-data-profiles.spec.ts|code file: dev-data-profiles.spec.ts]]
- [[_COMMUNITY_code file coupang-date-range.dto.ts|code file: coupang-date-range.dto.ts]]
- [[_COMMUNITY_Community 58|Community 58]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 180 edges
2. `Organization` - 147 edges
3. `ChannelSyncService` - 130 edges
4. `prisma — Shared Schema` - 129 edges
5. `Inventory` - 127 edges
6. `channels — Coupang 통합 + Sync + Dashboard 도메인` - 121 edges
7. `ActionTask` - 90 edges
8. `ChannelDashboardService` - 82 edges
9. `Order` - 79 edges
10. `AgentDefinition` - 77 edges
11. `ChannelDashboardController` - 70 edges
12. `ChannelSyncController` - 69 edges

## Surprising Connections (you probably didn't know these)
- `ChannelSyncService` --references_field--> `AdAction.externalId`  [INFERRED]
  apps/server/src/channels/application/service/channel-sync.service.ts → prisma/models/advertising.prisma
- `ChannelSyncService` --references_field--> `AdAction.organization`  [INFERRED]
  apps/server/src/channels/application/service/channel-sync.service.ts → prisma/models/advertising.prisma
- `ChannelSyncService` --references_field--> `AdAction.listing`  [INFERRED]
  apps/server/src/channels/application/service/channel-sync.service.ts → prisma/models/advertising.prisma
- `ChannelSyncService` --references_field--> `ScrapeTarget.isActive`  [INFERRED]
  apps/server/src/channels/application/service/channel-sync.service.ts → prisma/models/advertising.prisma
- `ChannelSyncService` --references_field--> `ScrapeTarget.organization`  [INFERRED]
  apps/server/src/channels/application/service/channel-sync.service.ts → prisma/models/advertising.prisma
- `ChannelSyncService` --references_field--> `ExecutionWorker.organization`  [INFERRED]
  apps/server/src/channels/application/service/channel-sync.service.ts → prisma/models/advertising.prisma
- `ChannelDashboardController` --references_field--> `AgentDefinition`  [INFERRED]
  apps/server/src/channels/adapter/in/http/channel-dashboard.controller.ts → prisma/models/agents.prisma
- `ChannelSyncController` --references_field--> `AgentDefinition`  [INFERRED]
  apps/server/src/channels/adapter/in/http/channel-sync.controller.ts → prisma/models/agents.prisma

## Communities (59 total, 3 thin omitted)

### Community 0 - "Channels schema"
Cohesion: 0.13
Nodes (117): AppException, ActionTask.activityLog, ActionTask.apiCall, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.label, ActionTask.notes (+109 more)

### Community 1 - "code file: dev-data-coupang.ts"
Cohesion: 0.1
Nodes (75): appendFlag(), appendOption(), appendProjectReferenceDefaults(), appendValues(), archiveFileName(), archiveShaFileName(), assertSafeRelativePath(), bool() (+67 more)

### Community 2 - "Agents schema"
Cohesion: 0.05
Nodes (48): ActionTask.assigneeUser, HeartbeatRun.createdAt, HeartbeatRun.errorCode, HeartbeatRun.exitCode, HeartbeatRun.failureType, HeartbeatRun.finishedAt, HeartbeatRun.invocationSource, HeartbeatRun.nextSchedule (+40 more)

### Community 3 - "code file: generate-prisma-erd.mjs"
Cohesion: 0.08
Nodes (38): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), extractDocValue(), extractRelationFields(), generateDomainErdMarkdown(), generateErdMarkdown() (+30 more)

### Community 4 - "Channels schema"
Cohesion: 0.05
Nodes (42): Channels, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank (+34 more)

### Community 5 - "Supply schema"
Cohesion: 0.05
Nodes (42): Supply, PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.inspectedAt, PurchaseOrder.orderDate (+34 more)

### Community 6 - "Inventory schema"
Cohesion: 0.1
Nodes (28): externalOptionId canonical option identity, vendorItemId provider term, ActionTask.targetId, AdAction.targetType, Alert.actionTask, Alert.targetId, Alert.targetType, CSRecord.order (+20 more)

### Community 7 - "Orders schema"
Cohesion: 0.06
Nodes (34): SyncOrdersBodyDto, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.memo (+26 more)

### Community 8 - "System schema"
Cohesion: 0.07
Nodes (33): coupangRequest(), generateAuthorization(), getEnvOrThrow(), getVendorId(), CoupangProviderAdapter, approveReturn(), confirmOrderSheets(), getOrderSheets() (+25 more)

### Community 9 - "Agents schema"
Cohesion: 0.06
Nodes (35): AgentDefinition.actionCap, AgentDefinition.adapterConfig, AgentDefinition.adapterType, AgentDefinition.allowedTools, AgentDefinition.budgetResetAt, AgentDefinition.contextStrategy, AgentDefinition.createdAt, AgentDefinition.description (+27 more)

### Community 10 - "Core schema"
Cohesion: 0.06
Nodes (34): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.category, MasterProduct.costCny, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description, MasterProduct.detailPageUrl (+26 more)

### Community 11 - "Orders schema"
Cohesion: 0.11
Nodes (21): ChannelListing.master, OrderLineItem.option, OrderReturnLineItem.createdAt, OrderReturnLineItem.productName, ProcessingCost.master, ProductOption.master, PurchaseOrder.supplier, PurchaseOrderItem.option (+13 more)

### Community 12 - "prisma field: channels — Coupang 통합 + Sync + Dashboard 도메인"
Cohesion: 0.25
Nodes (26): channels — Coupang 통합 + Sync + Dashboard 도메인, Database ERD, Finance, AdAction.externalId, AdAction.listing, AgentDefinition.isActive, CategoryMapping.isActive, ChannelAdTargetDailySnapshot.externalId (+18 more)

### Community 13 - "Advertising schema"
Cohesion: 0.1
Nodes (22): ExecutionLog.createdAt, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionTask.action, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt (+14 more)

### Community 14 - "Inventory schema"
Cohesion: 0.1
Nodes (21): PickingItem.createdAt, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.pickedAt, PickingItem.pickingList, PickingItem.productName, PickingItem.quantity (+13 more)

### Community 15 - "Core schema"
Cohesion: 0.12
Nodes (20): ProductOption.availableStock, ProductOption.barcode, ProductOption.commissionRate, ProductOption.costPrice, ProductOption.createdAt, ProductOption.deletedAt, ProductOption.isBundle, ProductOption.isTemporary (+12 more)

### Community 16 - "Inventory schema"
Cohesion: 0.12
Nodes (20): Shipment.warehouse, StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.notes, StockTransfer.quantity, StockTransfer.requestedBy, StockTransfer.toWarehouse (+12 more)

### Community 17 - "AI schema"
Cohesion: 0.1
Nodes (19): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.measuredAt, Thumbnail.prevClickRate, Thumbnail.status, Thumbnail.strategy (+11 more)

### Community 18 - "Supply schema"
Cohesion: 0.11
Nodes (20): MasterSupplierProduct.createdAt, MasterSupplierProduct.isPrimary, MasterSupplierProduct.updatedAt, ProfitLoss.adCost, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.month, ProfitLoss.netProfit (+12 more)

### Community 19 - "Core schema"
Cohesion: 0.12
Nodes (19): ChannelListingOption.createdAt, ChannelListingOption.isUnmatched, ChannelListingOption.salePrice, OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.listingOption, OrderLineItem.metadata, OrderLineItem.productName (+11 more)

### Community 20 - "Advertising schema"
Cohesion: 0.11
Nodes (18): AdAction.actionType, AdAction.adTargetDaily, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt, AdAction.currentValue (+10 more)

### Community 21 - "prisma field: MasterProduct.barcode"
Cohesion: 0.15
Nodes (12): MasterProduct.barcode, normalizeForGroup(), planKiditemImport(), planWingMatches(), applyKiditemPlan(), applySupplierMappings(), applyWingPlan(), collectSupplierSeeds() (+4 more)

### Community 22 - "Orders schema"
Cohesion: 0.12
Nodes (18): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+10 more)

### Community 23 - "System schema"
Cohesion: 0.12
Nodes (17): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+9 more)

### Community 24 - "Agents schema"
Cohesion: 0.16
Nodes (16): packages/shared — @kiditem/shared, prisma — Shared Schema, Advertising, Agents, AI, AgentLog.createdAt, AgentLog.data, AgentLog.level (+8 more)

### Community 25 - "Channels schema"
Cohesion: 0.12
Nodes (16): ChannelReconciliationItem.channelProductName, ChannelReconciliationItem.confidence, ChannelReconciliationItem.ignoredReason, ChannelReconciliationItem.lastObservedAt, ChannelReconciliationItem.legacyCode, ChannelReconciliationItem.linkedListingId, ChannelReconciliationItem.linkedMasterProductId, ChannelReconciliationItem.matchReason (+8 more)

### Community 26 - "Agents schema"
Cohesion: 0.13
Nodes (15): AgentTask.agentType, AgentTask.completedAt, AgentTask.createdAt, AgentTask.error, AgentTask.input, AgentTask.output, AgentTask.priority, AgentTask.scheduledAt (+7 more)

### Community 27 - "Agents schema"
Cohesion: 0.14
Nodes (15): AgentEvent.action, AgentEvent.category, AgentEvent.createdAt, AgentEvent.detail, AgentEvent.eventType, AgentEvent.fieldName, AgentEvent.id, AgentEvent.recordId (+7 more)

### Community 28 - "Orders schema"
Cohesion: 0.15
Nodes (15): OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.metadata, OrderReturn.platform, OrderReturn.reason (+7 more)

### Community 29 - "System schema"
Cohesion: 0.14
Nodes (14): System, FeatureGate.allowedOrganizations, FeatureGate.description, FeatureGate.metadata, FeatureGate.updatedAt, MigrationCheckpoint.createdAt, MigrationCheckpoint.updatedAt, SystemSetting.createdAt (+6 more)

### Community 30 - "Finance schema"
Cohesion: 0.18
Nodes (12): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.notes, SalesPlan.period, SalesPlan.targetOrders, SalesPlan.targetProfit (+4 more)

### Community 31 - "Inventory schema"
Cohesion: 0.18
Nodes (12): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.items, StockAudit.matchedCount, StockAudit.notes (+4 more)

### Community 32 - "AI schema"
Cohesion: 0.18
Nodes (12): ThumbnailTracking.appliedAt, ThumbnailTracking.createdAt, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.originalGrade, ThumbnailTracking.originalScore, ThumbnailTracking.reviewsAfter, ThumbnailTracking.salesAfter (+4 more)

### Community 33 - "Core schema"
Cohesion: 0.17
Nodes (11): ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo, ChannelListing.exposureStatus, ChannelListing.freeShipOverAmount, ChannelListing.returnCharge (+3 more)

### Community 34 - "Orders schema"
Cohesion: 0.17
Nodes (11): Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.shippedAt, Shipment.status, Shipment.trackingNo (+3 more)

### Community 35 - "Core schema"
Cohesion: 0.18
Nodes (11): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name, LegalEntity.representativeName (+3 more)

### Community 36 - "Orders schema"
Cohesion: 0.2
Nodes (10): CSRecord.assignee, CSRecord.content, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.priority, CSRecord.resolution (+2 more)

### Community 37 - "code file: import-baseline-planner.ts"
Cohesion: 0.31
Nodes (6): clean(), projectWingRow(), rowName(), rowOptionName(), toInt(), toPositiveInt()

### Community 38 - "Finance schema"
Cohesion: 0.2
Nodes (10): GradeHistory.calculatedAt, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.reason, GradeHistory.revenueScore, GradeHistory.score, GradeHistory.velocityScore (+2 more)

### Community 39 - "Core schema"
Cohesion: 0.22
Nodes (9): ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.isPrimary, ChannelAccount.sellerId, ChannelAccount.status, ChannelAccount.updatedAt, ChannelAccount.vendorId, ChannelAccount (+1 more)

### Community 40 - "System schema"
Cohesion: 0.25
Nodes (9): Alert.createdAt, Alert.id, Alert.isRead, Alert.message, Alert.severity, Alert.title, Alert.type, Alert (+1 more)

### Community 41 - "AI schema"
Cohesion: 0.22
Nodes (9): ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.originalImages, ContentGeneration.processedImages, ContentGeneration.retryCount, ContentGeneration.updatedAt (+1 more)

### Community 42 - "Core schema"
Cohesion: 0.25
Nodes (9): Core, CategoryMapping.coupangCategoryId, CategoryMapping.createdAt, CategoryMapping.internalCategory, MasterCodeCounter.updatedAt, MasterCodeCounter.value, CategoryMapping, MasterCodeCounter (+1 more)

### Community 43 - "Finance schema"
Cohesion: 0.25
Nodes (8): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.processType, ProcessingCost.productName, ProcessingCost.quantity, ProcessingCost.totalCost, ProcessingCost.vendor, ProcessingCost

### Community 44 - "Finance schema"
Cohesion: 0.29
Nodes (7): ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdBy, ManualLedger.description, ManualLedger.memo, ManualLedger

### Community 45 - "System schema"
Cohesion: 0.33
Nodes (6): ActivityEvent.createdAt, ActivityEvent.eventType, ActivityEvent.objectId, ActivityEvent.source, ActivityEvent.title, ActivityEvent

### Community 46 - "Core schema"
Cohesion: 0.47
Nodes (6): BundleComponent.bundleOption, BundleComponent.componentOption, BundleComponent.createdAt, BundleComponent.updatedAt, BundleComponent, BundleComponent unique(bundleOptionId, componentOptionId)

### Community 47 - "Community 47"
Cohesion: 0.4
Nodes (5): makeEvent(), makeHeartbeat(), makeLog(), makeTask(), makeTrace()

## Knowledge Gaps
- **617 isolated node(s):** `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority` (+612 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `prisma field: channels — Coupang 통합 + Sync + Dashboard 도메인` to `Channels schema`, `Agents schema`, `Channels schema`, `Supply schema`, `Inventory schema`, `Orders schema`, `System schema`, `Agents schema`, `Core schema`, `Orders schema`, `Advertising schema`, `Inventory schema`, `Core schema`, `Inventory schema`, `AI schema`, `Supply schema`, `Core schema`, `Advertising schema`, `prisma field: MasterProduct.barcode`, `Orders schema`, `System schema`, `Agents schema`, `Channels schema`, `Agents schema`, `Agents schema`, `Orders schema`, `System schema`, `Finance schema`, `Inventory schema`, `AI schema`, `Core schema`, `Orders schema`, `Core schema`, `Orders schema`, `Finance schema`, `Core schema`, `System schema`, `AI schema`, `Core schema`, `Finance schema`, `Finance schema`, `System schema`, `Core schema`?**
  _High betweenness centrality (0.187) - this node is a cross-community bridge._
- **Why does `Organization` connect `Channels schema` to `code file: dev-data-coupang.ts`, `Agents schema`, `Channels schema`, `Supply schema`, `Inventory schema`, `Orders schema`, `System schema`, `Agents schema`, `Core schema`, `Orders schema`, `prisma field: channels — Coupang 통합 + Sync + Dashboard 도메인`, `Advertising schema`, `Inventory schema`, `Core schema`, `Inventory schema`, `AI schema`, `Supply schema`, `Core schema`, `Advertising schema`, `prisma field: MasterProduct.barcode`, `Orders schema`, `System schema`, `Agents schema`, `Channels schema`, `Agents schema`, `Orders schema`, `System schema`, `Finance schema`, `Inventory schema`, `AI schema`, `Core schema`, `Orders schema`, `Core schema`, `Orders schema`, `Finance schema`, `Core schema`, `System schema`, `AI schema`, `Core schema`, `Finance schema`, `Finance schema`, `System schema`, `Core schema`?**
  _High betweenness centrality (0.151) - this node is a cross-community bridge._
- **Why does `prisma — Shared Schema` connect `Agents schema` to `Channels schema`, `Agents schema`, `Channels schema`, `Supply schema`, `Inventory schema`, `Orders schema`, `System schema`, `Agents schema`, `Core schema`, `Orders schema`, `prisma field: channels — Coupang 통합 + Sync + Dashboard 도메인`, `Advertising schema`, `Core schema`, `Inventory schema`, `AI schema`, `Supply schema`, `Core schema`, `Advertising schema`, `prisma field: MasterProduct.barcode`, `Orders schema`, `System schema`, `Channels schema`, `Agents schema`, `Agents schema`, `Orders schema`, `System schema`, `Finance schema`, `Core schema`, `Orders schema`, `Core schema`, `Orders schema`, `Finance schema`, `Core schema`, `System schema`, `AI schema`, `Core schema`, `Finance schema`, `Finance schema`, `System schema`, `Core schema`?**
  _High betweenness centrality (0.104) - this node is a cross-community bridge._
- **Are the 39 inferred relationships involving `Organization` (e.g. with `Thumbnail` and `ProfitLoss`) actually correct?**
  _`Organization` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 117 inferred relationships involving `ChannelSyncService` (e.g. with `AdAction.organization` and `ScrapeTarget.organization`) actually correct?**
  _`ChannelSyncService` has 117 INFERRED edges - model-reasoned connections that need verification._
- **Are the 106 inferred relationships involving `Inventory` (e.g. with `Inventory.organization` and `StockTransaction`) actually correct?**
  _`Inventory` has 106 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel` to the rest of the system?**
  _617 weakly-connected nodes found - possible documentation gaps or missing edges._