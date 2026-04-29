# Graph Report - schema  (2026-04-28)

## Corpus Check
- 12 files · ~13,896 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1455 nodes · 2256 edges · 28 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 239 edges
2. `prisma — Shared Schema` - 137 edges
3. `Company` - 129 edges
4. `AgentDefinition` - 66 edges
5. `ProductOption` - 66 edges
6. `ChannelListingDailySnapshot` - 64 edges
7. `MasterProduct` - 64 edges
8. `ChannelListing` - 54 edges
9. `ChannelAdTargetDailySnapshot` - 52 edges
10. `ChannelScrapeSnapshot` - 41 edges
11. `ChannelListingOptionDailySnapshot` - 40 edges
12. `HeartbeatRun` - 39 edges

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
- `Database ERD` --mentions_field--> `ChannelListingDailySnapshot.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/channels.prisma
- `Database ERD` --mentions_field--> `ChannelAdTargetDailySnapshot.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/channels.prisma

## Communities

### Community 0 - "AI schema"
Cohesion: 0.02
Nodes (106): AI, Company.businessNumber, Company.createdAt, Company.id, Company.isActive, Company.name, Company.slug, Company.updatedAt (+98 more)

### Community 1 - "Channels schema"
Cohesion: 0.03
Nodes (98): externalOptionId canonical option identity, vendorItemId provider term, Database ERD, Core, Alert.actionTask, Alert.actionTaskId, Alert.company, Alert.companyId (+90 more)

### Community 2 - "Supply schema"
Cohesion: 0.03
Nodes (96): Supply, MasterProduct.supplierId, MasterSupplierProduct.createdAt, MasterSupplierProduct.id, MasterSupplierProduct.isPrimary, MasterSupplierProduct.master, MasterSupplierProduct.masterId, MasterSupplierProduct.memo (+88 more)

### Community 3 - "Orders schema"
Cohesion: 0.03
Nodes (90): prisma — Shared Schema, Orders, ChannelAdTargetDailySnapshot.listingId, ChannelListing.channel, ChannelListing.channelName, ChannelListing.channelPrice, ChannelListing.company, ChannelListing.companyId (+82 more)

### Community 4 - "Orders schema"
Cohesion: 0.03
Nodes (88): Order.company, Order.companyId, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id (+80 more)

### Community 5 - "Finance schema"
Cohesion: 0.03
Nodes (78): GradeHistory.calculatedAt, GradeHistory.company, GradeHistory.companyId, GradeHistory.id, GradeHistory.marginScore, GradeHistory.master, GradeHistory.masterId, GradeHistory.newGrade (+70 more)

### Community 6 - "Agents schema"
Cohesion: 0.03
Nodes (83): Agents, AgentLog.createdAt, AgentLog.data, AgentLog.id, AgentLog.level, AgentLog.message, AgentLog.task, AgentLog.taskId (+75 more)

### Community 5 - "Core schema"
Cohesion: 0.03
Nodes (82): ContentGeneration.company, ContentGeneration.companyId, ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.generatedDescription, ContentGeneration.generatedTitle (+74 more)

### Community 6 - "Agents schema"
Cohesion: 0.03
Nodes (72): AgentDefinition.actionCap, AgentDefinition.adapterConfig, AgentDefinition.adapterType, AgentDefinition.allowedTools, AgentDefinition.budgetResetAt, AgentDefinition.company, AgentDefinition.companyId, AgentDefinition.contextStrategy (+64 more)

### Community 7 - "Inventory schema"
Cohesion: 0.03
Nodes (71): Inventory, Shipment.warehouseId, StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.company, StockAudit.companyId, StockAudit.completedAt, StockAudit.createdAt (+63 more)

### Community 8 - "Advertising schema"
Cohesion: 0.03
Nodes (68): Advertising, AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson (+60 more)

### Community 9 - "System schema"
Cohesion: 0.04
Nodes (67): System, ActivityEvent.company, ActivityEvent.companyId, ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId (+59 more)

### Community 10 - "Core schema"
Cohesion: 0.04
Nodes (63): BundleComponent.bundleOption, BundleComponent.bundleOptionId, BundleComponent.company, BundleComponent.companyId, BundleComponent.componentOption, BundleComponent.componentOptionId, BundleComponent.createdAt, BundleComponent.id (+55 more)

### Community 11 - "Agents schema"
Cohesion: 0.04
Nodes (58): AgentDefinition.marketplaceId, Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon (+50 more)

### Community 12 - "Channels schema"
Cohesion: 0.04
Nodes (58): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+50 more)

### Community 13 - "Agents schema"
Cohesion: 0.04
Nodes (54): AgentWakeupRequest.agent, AgentWakeupRequest.agentId, AgentWakeupRequest.claimedAt, AgentWakeupRequest.coalescedCount, AgentWakeupRequest.company, AgentWakeupRequest.companyId, AgentWakeupRequest.createdAt, AgentWakeupRequest.error (+46 more)

### Community 14 - "Finance schema"
Cohesion: 0.04
Nodes (54): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.company, ManualLedger.companyId, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy (+46 more)

### Community 15 - "Channels schema"
Cohesion: 0.05
Nodes (48): Channels, ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.company, ChannelAccountDailyKpiSnapshot.companyId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id (+40 more)

### Community 16 - "System schema"
Cohesion: 0.05
Nodes (46): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.company, ActionTask.companyId, ActionTask.createdAt, ActionTask.date (+38 more)

### Community 17 - "Channels schema"
Cohesion: 0.06
Nodes (40): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel, ChannelAdTargetDailySnapshot.clicks (+32 more)

### Community 18 - "Inventory schema"
Cohesion: 0.07
Nodes (32): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.option, PickingItem.optionId, PickingItem.orderId (+24 more)

### Community 19 - "Agents schema"
Cohesion: 0.08
Nodes (28): Agents, AgentLog.createdAt, AgentLog.data, AgentLog.id, AgentLog.level, AgentLog.message, AgentLog.task, AgentLog.taskId (+20 more)

### Community 20 - "Core schema"
Cohesion: 0.1
Nodes (22): MasterProductImage.company, MasterProductImage.companyId, MasterProductImage.createdAt, MasterProductImage.deletedAt, MasterProductImage.fileSize, MasterProductImage.height, MasterProductImage.id, MasterProductImage.isDeleted (+14 more)

### Community 21 - "Orders schema"
Cohesion: 0.1
Nodes (21): Shipment.company, Shipment.companyId, Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.id (+13 more)

### Community 22 - "Orders schema"
Cohesion: 0.12
Nodes (20): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.company, Settlement.companyId, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount (+12 more)

### Community 23 - "AI schema"
Cohesion: 0.12
Nodes (18): ContentGeneration.company, ContentGeneration.companyId, ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.generatedDescription, ContentGeneration.generatedTitle (+10 more)

### Community 24 - "Inventory schema"
Cohesion: 0.12
Nodes (18): Inventory.company, Inventory.companyId, Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.id, Inventory.lastRestockedAt, Inventory.leadTimeDays (+10 more)

### Community 25 - "Finance schema"
Cohesion: 0.12
Nodes (17): ProcessingCost.company, ProcessingCost.companyId, ProcessingCost.createdAt, ProcessingCost.date, ProcessingCost.id, ProcessingCost.master, ProcessingCost.masterId, ProcessingCost.notes (+9 more)

### Community 26 - "Core schema"
Cohesion: 0.19
Nodes (13): CategoryMapping.company, CategoryMapping.companyId, CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.isActive (+5 more)

### Community 27 - "Advertising schema"
Cohesion: 0.2
Nodes (11): ScrapeTarget.category, ScrapeTarget.company, ScrapeTarget.companyId, ScrapeTarget.createdAt, ScrapeTarget.id, ScrapeTarget.isActive, ScrapeTarget.label, ScrapeTarget.lastScrapedAt (+3 more)

## Knowledge Gaps
- **977 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+972 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Channels schema` to `AI schema`, `Supply schema`, `Orders schema`, `Orders schema`, `Finance schema`, `Agents schema`, `Inventory schema`, `Advertising schema`, `System schema`, `Core schema`, `Agents schema`, `Channels schema`, `Agents schema`, `Finance schema`, `Channels schema`, `System schema`, `Channels schema`, `Inventory schema`, `Agents schema`, `Core schema`, `Orders schema`, `Orders schema`, `AI schema`, `Inventory schema`, `Finance schema`, `Core schema`, `Advertising schema`?**
  _High betweenness centrality (0.453) - this node is a cross-community bridge._
- **Why does `Company` connect `AI schema` to `Channels schema`, `Supply schema`, `Orders schema`, `Orders schema`, `Finance schema`, `Agents schema`, `Inventory schema`, `Advertising schema`, `System schema`, `Core schema`, `Agents schema`, `Channels schema`, `Agents schema`, `Finance schema`, `Channels schema`, `System schema`, `Channels schema`, `Inventory schema`, `Core schema`, `Orders schema`, `Orders schema`, `AI schema`, `Inventory schema`, `Finance schema`, `Core schema`, `Advertising schema`?**
  _High betweenness centrality (0.213) - this node is a cross-community bridge._
- **Why does `prisma — Shared Schema` connect `Orders schema` to `AI schema`, `Channels schema`, `Supply schema`, `Orders schema`, `Finance schema`, `Agents schema`, `Inventory schema`, `Advertising schema`, `System schema`, `Core schema`, `Agents schema`, `Channels schema`, `Agents schema`, `Finance schema`, `Channels schema`, `System schema`, `Channels schema`, `Inventory schema`, `Agents schema`, `Core schema`, `Orders schema`, `Orders schema`, `AI schema`, `Inventory schema`, `Finance schema`, `Core schema`, `Advertising schema`?**
  _High betweenness centrality (0.206) - this node is a cross-community bridge._
- **What connects `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason` to the rest of the system?**
  _977 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `AI schema` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `Channels schema` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Supply schema` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._