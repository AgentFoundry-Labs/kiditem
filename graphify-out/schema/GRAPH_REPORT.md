# Graph Report - schema  (2026-05-06)

## Corpus Check
- 12 files · ~15,402 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 875 nodes · 1468 edges · 54 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_prisma field prisma — Shared Schema|prisma field: prisma — Shared Schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_System schema|System schema]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 180 edges
2. `prisma — Shared Schema` - 129 edges
3. `Organization` - 111 edges
4. `MasterProduct` - 52 edges
5. `ProductOption` - 52 edges
6. `AgentDefinition` - 46 edges
7. `Order` - 40 edges
8. `ChannelListing` - 39 edges
9. `AdAction` - 29 edges
10. `HeartbeatRun` - 28 edges
11. `User` - 28 edges
12. `PurchaseOrder` - 28 edges

## Surprising Connections (you probably didn't know these)
- `Database ERD` --mentions_field--> `AdAction.targetType`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `ScrapeTarget.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AgentDefinition.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/agents.prisma
- `Database ERD` --mentions_field--> `WorkflowTemplate.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/agents.prisma
- `Database ERD` --mentions_field--> `ThumbnailRegistrationAttempt.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/ai.prisma
- `Database ERD` --mentions_field--> `ChannelAdTargetDailySnapshot.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/channels.prisma
- `Database ERD` --mentions_field--> `ChannelReconciliationItem.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/channels.prisma

## Communities (54 total, 0 thin omitted)

### Community 0 - "AI schema"
Cohesion: 0.05
Nodes (51): AI, ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.organization, ContentGeneration.originalImages, ContentGeneration.processedImages (+43 more)

### Community 1 - "Channels schema"
Cohesion: 0.05
Nodes (45): Channels, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adImpressions, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank (+37 more)

### Community 2 - "Core schema"
Cohesion: 0.06
Nodes (40): Core, BundleComponent.bundleOption, BundleComponent.componentOption, BundleComponent.createdAt, BundleComponent.organization, BundleComponent.updatedAt, CategoryMapping.coupangCategoryId, CategoryMapping.createdAt (+32 more)

### Community 3 - "Agents schema"
Cohesion: 0.06
Nodes (36): AgentDefinition.actionCap, AgentDefinition.adapterConfig, AgentDefinition.adapterType, AgentDefinition.allowedTools, AgentDefinition.budgetResetAt, AgentDefinition.contextStrategy, AgentDefinition.createdAt, AgentDefinition.description (+28 more)

### Community 4 - "Core schema"
Cohesion: 0.07
Nodes (36): ProductOption.availableStock, ProductOption.barcode, ProductOption.commissionRate, ProductOption.costPrice, ProductOption.createdAt, ProductOption.deletedAt, ProductOption.isActive, ProductOption.isBundle (+28 more)

### Community 5 - "Inventory schema"
Cohesion: 0.06
Nodes (36): Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.organization, Inventory.reorderPoint, Inventory.reorderQuantity (+28 more)

### Community 6 - "Core schema"
Cohesion: 0.06
Nodes (32): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.category, MasterProduct.costCny, MasterProduct.createdAt, MasterProduct.deletedAt, MasterProduct.description, MasterProduct.detailPageUrl (+24 more)

### Community 7 - "Orders schema"
Cohesion: 0.1
Nodes (26): Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.memo, Order.metadata (+18 more)

### Community 8 - "System schema"
Cohesion: 0.08
Nodes (25): Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.installCount, Marketplace.isPublished (+17 more)

### Community 9 - "Advertising schema"
Cohesion: 0.1
Nodes (21): AdAction.actionType, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.createdAt, AdAction.currentValue, AdAction.errorMessage (+13 more)

### Community 10 - "Agents schema"
Cohesion: 0.1
Nodes (20): HeartbeatRun.createdAt, HeartbeatRun.errorCode, HeartbeatRun.exitCode, HeartbeatRun.failureType, HeartbeatRun.finishedAt, HeartbeatRun.invocationSource, HeartbeatRun.nextSchedule, HeartbeatRun.organization (+12 more)

### Community 11 - "Supply schema"
Cohesion: 0.1
Nodes (20): PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.inspectedAt, PurchaseOrder.orderDate, PurchaseOrder.organization (+12 more)

### Community 12 - "Orders schema"
Cohesion: 0.12
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+11 more)

### Community 13 - "System schema"
Cohesion: 0.12
Nodes (19): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.label, ActionTask.notes (+11 more)

### Community 14 - "Orders schema"
Cohesion: 0.13
Nodes (18): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.metadata, OrderLineItem.option, OrderLineItem.organization, OrderLineItem.productName, OrderLineItem.quantity, OrderLineItem.status (+10 more)

### Community 15 - "System schema"
Cohesion: 0.12
Nodes (18): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+10 more)

### Community 16 - "Channels schema"
Cohesion: 0.12
Nodes (17): ChannelReconciliationItem.channelProductName, ChannelReconciliationItem.confidence, ChannelReconciliationItem.externalId, ChannelReconciliationItem.ignoredReason, ChannelReconciliationItem.lastObservedAt, ChannelReconciliationItem.legacyCode, ChannelReconciliationItem.linkedListingId, ChannelReconciliationItem.linkedMasterProductId (+9 more)

### Community 17 - "Finance schema"
Cohesion: 0.15
Nodes (17): ProfitLoss.adCost, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.listing, ProfitLoss.month, ProfitLoss.netProfit, ProfitLoss.orderCount, ProfitLoss.organization (+9 more)

### Community 18 - "Agents schema"
Cohesion: 0.12
Nodes (16): AgentTask.agentType, AgentTask.completedAt, AgentTask.createdAt, AgentTask.error, AgentTask.input, AgentTask.organizationId, AgentTask.output, AgentTask.priority (+8 more)

### Community 19 - "Agents schema"
Cohesion: 0.13
Nodes (16): AgentEvent.action, AgentEvent.category, AgentEvent.createdAt, AgentEvent.detail, AgentEvent.eventType, AgentEvent.fieldName, AgentEvent.id, AgentEvent.organization (+8 more)

### Community 20 - "Orders schema"
Cohesion: 0.16
Nodes (16): OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.metadata, OrderReturn.organization, OrderReturn.platform (+8 more)

### Community 21 - "Core schema"
Cohesion: 0.13
Nodes (16): HeartbeatRun.triggeredByUser, User.agentDefinition, User.avatarUrl, User.createdAt, User.email, User.id, User.isActive, User.lastLoginAt (+8 more)

### Community 22 - "Core schema"
Cohesion: 0.14
Nodes (15): ChannelListing.channelPrice, ChannelListing.createdAt, ChannelListing.deletedAt, ChannelListing.deliveryChargeType, ChannelListing.deliveryInfo, ChannelListing.exposureStatus, ChannelListing.externalId, ChannelListing.freeShipOverAmount (+7 more)

### Community 23 - "Orders schema"
Cohesion: 0.13
Nodes (15): Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.listing, Shipment.option, Shipment.order (+7 more)

### Community 24 - "Advertising schema"
Cohesion: 0.14
Nodes (14): ExecutionLog.createdAt, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionTask.action, ExecutionTask.afterJson, ExecutionTask.attempt, ExecutionTask.beforeJson, ExecutionTask.createdAt (+6 more)

### Community 25 - "System schema"
Cohesion: 0.2
Nodes (14): Database ERD, Alert.actionTask, Alert.createdAt, Alert.id, Alert.isRead, Alert.message, Alert.organization, Alert.severity (+6 more)

### Community 26 - "Finance schema"
Cohesion: 0.18
Nodes (13): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.createdAt, SalesPlan.notes, SalesPlan.organization, SalesPlan.period, SalesPlan.targetOrders (+5 more)

### Community 27 - "Inventory schema"
Cohesion: 0.18
Nodes (13): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.items, StockAudit.matchedCount, StockAudit.notes (+5 more)

### Community 28 - "Orders schema"
Cohesion: 0.15
Nodes (13): CSRecord.assignee, CSRecord.content, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id, CSRecord.listing, CSRecord.order (+5 more)

### Community 29 - "Supply schema"
Cohesion: 0.15
Nodes (13): PurchaseOrder.supplier, Supplier.address, Supplier.contactName, Supplier.createdAt, Supplier.email, Supplier.leadTimeDays, Supplier.name, Supplier.notes (+5 more)

### Community 30 - "AI schema"
Cohesion: 0.17
Nodes (12): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.measuredAt, Thumbnail.organization, Thumbnail.prevClickRate (+4 more)

### Community 31 - "Inventory schema"
Cohesion: 0.2
Nodes (12): Shipment.warehouse, Warehouse.address, Warehouse.code, Warehouse.createdAt, Warehouse.manager, Warehouse.name, Warehouse.organization, Warehouse.phone (+4 more)

### Community 32 - "Orders schema"
Cohesion: 0.2
Nodes (11): Review.content, Review.createdAt, Review.id, Review.listing, Review.organization, Review.platform, Review.rating, Review.reviewedAt (+3 more)

### Community 33 - "Finance schema"
Cohesion: 0.2
Nodes (10): ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.master, ProcessingCost.organization, ProcessingCost.processType, ProcessingCost.productName, ProcessingCost.quantity, ProcessingCost.totalCost (+2 more)

### Community 34 - "Finance schema"
Cohesion: 0.2
Nodes (10): GradeHistory.calculatedAt, GradeHistory.marginScore, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.reason, GradeHistory.revenueScore, GradeHistory.score, GradeHistory.velocityScore (+2 more)

### Community 35 - "Inventory schema"
Cohesion: 0.2
Nodes (10): StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.notes, StockTransfer.organization, StockTransfer.quantity, StockTransfer.requestedBy, StockTransfer.toWarehouse (+2 more)

### Community 36 - "System schema"
Cohesion: 0.2
Nodes (10): System, FeatureGate.allowedOrganizations, FeatureGate.description, FeatureGate.metadata, FeatureGate.updatedAt, MigrationCheckpoint.createdAt, MigrationCheckpoint.updatedAt, FeatureGate (+2 more)

### Community 37 - "Advertising schema"
Cohesion: 0.22
Nodes (9): Advertising, ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.isActive, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.url (+1 more)

### Community 38 - "Advertising schema"
Cohesion: 0.22
Nodes (9): ExecutionTask.worker, ExecutionWorker.createdAt, ExecutionWorker.currentPageType, ExecutionWorker.currentUrl, ExecutionWorker.lastHeartbeatAt, ExecutionWorker.metaJson, ExecutionWorker.organization, ExecutionWorker.status (+1 more)

### Community 39 - "Core schema"
Cohesion: 0.22
Nodes (9): externalOptionId canonical option identity, vendorItemId provider term, ChannelAdTargetDailySnapshot.listing, ChannelListingOption.createdAt, ChannelListingOption.isUnmatched, ChannelListingOption.salePrice, OrderLineItem.listingOption, ChannelListingOption (+1 more)

### Community 40 - "Finance schema"
Cohesion: 0.22
Nodes (9): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdBy, ManualLedger.description, ManualLedger.memo, ManualLedger.organization (+1 more)

### Community 41 - "Orders schema"
Cohesion: 0.22
Nodes (9): UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.isNotified, UnshippedItem.option, UnshippedItem.organization, UnshippedItem.productName, UnshippedItem.quantity, UnshippedItem.reason (+1 more)

### Community 42 - "Agents schema"
Cohesion: 0.22
Nodes (9): WorkflowRun.contextData, WorkflowRun.error, WorkflowRun.organizationId, WorkflowRun.startedAt, WorkflowRun.status, WorkflowRun.steps, WorkflowRun.triggeredBy, WorkflowRun.updatedAt (+1 more)

### Community 43 - "Agents schema"
Cohesion: 0.25
Nodes (8): AgentWakeupRequest.claimedAt, AgentWakeupRequest.coalescedCount, AgentWakeupRequest.finishedAt, AgentWakeupRequest.legacyTaskId, AgentWakeupRequest.source, AgentWakeupRequest.updatedAt, HeartbeatRun.wakeupRequest, AgentWakeupRequest

### Community 44 - "prisma field: prisma — Shared Schema"
Cohesion: 0.29
Nodes (8): prisma — Shared Schema, GradeHistory.organization, MasterProduct.barcode, MasterProduct.isDeleted, MasterProduct.legacyCode, MasterProduct.organization, MasterProductImage.isDeleted, MasterProduct unique(organizationId, legacyCode)

### Community 45 - "Supply schema"
Cohesion: 0.25
Nodes (8): SupplierPayment.amount, SupplierPayment.createdAt, SupplierPayment.organization, SupplierPayment.paidDate, SupplierPayment.purchaseOrder, SupplierPayment.status, SupplierPayment.updatedAt, SupplierPayment

### Community 46 - "Core schema"
Cohesion: 0.25
Nodes (8): OrganizationMembership.createdAt, OrganizationMembership.invitedBy, OrganizationMembership.joinedAt, OrganizationMembership.lastSelectedAt, OrganizationMembership.role, OrganizationMembership.status, OrganizationMembership, OrganizationMembership unique(organizationId, userId)

### Community 47 - "Channels schema"
Cohesion: 0.33
Nodes (7): AdAction.adTargetDaily, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.externalId, ChannelAdTargetDailySnapshot.firstObservedAt, ChannelAdTargetDailySnapshot.sampleCount, ChannelAdTargetDailySnapshot, ChannelAdTargetDailySnapshot unique(organizationId, channel, businessDate, targetType, targetKey)

### Community 48 - "System schema"
Cohesion: 0.29
Nodes (7): ActivityEvent.createdAt, ActivityEvent.eventType, ActivityEvent.objectId, ActivityEvent.organization, ActivityEvent.source, ActivityEvent.title, ActivityEvent

### Community 49 - "Inventory schema"
Cohesion: 0.29
Nodes (7): StockTransaction.createdBy, StockTransaction.organization, StockTransaction.relatedId, StockTransaction.totalCost, StockTransaction.unitCost, StockTransaction.warehouse, StockTransaction

### Community 50 - "Agents schema"
Cohesion: 0.33
Nodes (6): Agents, AgentLog.createdAt, AgentLog.data, AgentLog.level, AgentLog.message, AgentLog

### Community 51 - "Supply schema"
Cohesion: 0.4
Nodes (6): SupplierProduct.createdAt, SupplierProduct.option, SupplierProduct.supplyPrice, SupplierProduct.updatedAt, SupplierProduct, SupplierProduct unique(supplierId, optionId)

### Community 52 - "Supply schema"
Cohesion: 0.33
Nodes (6): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.isPrimary, MasterSupplierProduct.updatedAt, MasterSupplierProduct, MasterSupplierProduct unique(masterId, supplierId)

### Community 53 - "System schema"
Cohesion: 0.5
Nodes (5): SystemSetting.createdAt, SystemSetting.organization, SystemSetting.updatedAt, SystemSetting, SystemSetting unique(organizationId, key)

## Knowledge Gaps
- **614 isolated node(s):** `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority` (+609 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `System schema` to `AI schema`, `Channels schema`, `Core schema`, `Agents schema`, `Core schema`, `Inventory schema`, `Core schema`, `Orders schema`, `System schema`, `Advertising schema`, `Agents schema`, `Supply schema`, `Orders schema`, `System schema`, `Orders schema`, `System schema`, `Channels schema`, `Finance schema`, `Agents schema`, `Agents schema`, `Orders schema`, `Core schema`, `Core schema`, `Orders schema`, `Advertising schema`, `Finance schema`, `Inventory schema`, `Orders schema`, `Supply schema`, `AI schema`, `Inventory schema`, `Orders schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `System schema`, `Advertising schema`, `Advertising schema`, `Core schema`, `Finance schema`, `Orders schema`, `Agents schema`, `Agents schema`, `prisma field: prisma — Shared Schema`, `Supply schema`, `Core schema`, `Channels schema`, `System schema`, `Inventory schema`, `Agents schema`, `Supply schema`, `Supply schema`, `System schema`?**
  _High betweenness centrality (0.428) - this node is a cross-community bridge._
- **Why does `prisma — Shared Schema` connect `prisma field: prisma — Shared Schema` to `AI schema`, `Channels schema`, `Core schema`, `Agents schema`, `Core schema`, `Inventory schema`, `Core schema`, `Orders schema`, `System schema`, `Advertising schema`, `Agents schema`, `Supply schema`, `Orders schema`, `System schema`, `Orders schema`, `System schema`, `Channels schema`, `Finance schema`, `Agents schema`, `Agents schema`, `Orders schema`, `Core schema`, `Core schema`, `Orders schema`, `Advertising schema`, `System schema`, `Finance schema`, `Inventory schema`, `Orders schema`, `Supply schema`, `AI schema`, `Inventory schema`, `Orders schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `System schema`, `Advertising schema`, `Advertising schema`, `Core schema`, `Finance schema`, `Orders schema`, `Agents schema`, `Agents schema`, `Supply schema`, `Core schema`, `Channels schema`, `System schema`, `Inventory schema`, `Agents schema`, `Supply schema`, `System schema`?**
  _High betweenness centrality (0.243) - this node is a cross-community bridge._
- **Why does `Organization` connect `AI schema` to `Channels schema`, `Core schema`, `Agents schema`, `Core schema`, `Inventory schema`, `Core schema`, `Orders schema`, `System schema`, `Advertising schema`, `Agents schema`, `Supply schema`, `Orders schema`, `System schema`, `Orders schema`, `System schema`, `Channels schema`, `Finance schema`, `Agents schema`, `Orders schema`, `Core schema`, `Orders schema`, `System schema`, `Finance schema`, `Inventory schema`, `Orders schema`, `Supply schema`, `AI schema`, `Inventory schema`, `Orders schema`, `Finance schema`, `Finance schema`, `Inventory schema`, `Advertising schema`, `Advertising schema`, `Core schema`, `Finance schema`, `Orders schema`, `Agents schema`, `prisma field: prisma — Shared Schema`, `Supply schema`, `Core schema`, `Channels schema`, `System schema`, `Inventory schema`, `System schema`?**
  _High betweenness centrality (0.209) - this node is a cross-community bridge._
- **What connects `AdAction.id`, `AdAction.actionType`, `AdAction.targetLabel` to the rest of the system?**
  _614 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `AI schema` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Channels schema` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Core schema` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._