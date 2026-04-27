# Graph Report - schema  (2026-04-27)

## Corpus Check
- 12 files · ~13,233 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1427 nodes · 2205 edges · 26 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Core schema|Core schema]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 238 edges
2. `prisma — Shared Schema` - 131 edges
3. `Company` - 127 edges
4. `ProductOption` - 68 edges
5. `AgentDefinition` - 66 edges
6. `MasterProduct` - 63 edges
7. `ChannelListing` - 60 edges
8. `Ad` - 59 edges
9. `AdSnapshot` - 49 edges
10. `HeartbeatRun` - 39 edges
11. `ChannelListingOptionDailySnapshot` - 39 edges
12. `Order` - 38 edges

## Surprising Connections (you probably didn't know these)
- `Database ERD` --mentions_field--> `AdAction.targetType`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdSnapshot.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdSnapshot.vendorItemId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `ScrapeTarget.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AgentDefinition.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/agents.prisma
- `Database ERD` --mentions_field--> `WorkflowTemplate.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/agents.prisma
- `Database ERD` --mentions_field--> `ChannelScrapeSnapshot.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/channels.prisma

## Communities

### Community 0 - "Orders schema"
Cohesion: 0.02
Nodes (128): externalOptionId canonical option identity, vendorItemId provider term, Database ERD, Core, Orders, Ad.listingId, AdSnapshot.listingId, ChannelListing.channel (+120 more)

### Community 1 - "Supply schema"
Cohesion: 0.03
Nodes (96): Supply, MasterProduct.supplierId, MasterSupplierProduct.createdAt, MasterSupplierProduct.id, MasterSupplierProduct.isPrimary, MasterSupplierProduct.master, MasterSupplierProduct.masterId, MasterSupplierProduct.memo (+88 more)

### Community 2 - "Channels schema"
Cohesion: 0.03
Nodes (84): Channels, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank, ChannelListingDailySnapshot.channel, ChannelListingDailySnapshot.channelPrice, ChannelListingDailySnapshot.company, ChannelListingDailySnapshot.companyId (+76 more)

### Community 3 - "Finance schema"
Cohesion: 0.03
Nodes (81): Finance, ActivityEvent.company, ActivityEvent.companyId, ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId (+73 more)

### Community 4 - "Core schema"
Cohesion: 0.03
Nodes (80): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.adTier, MasterProduct.barcode, MasterProduct.brand, MasterProduct.category, MasterProduct.code, MasterProduct.company (+72 more)

### Community 5 - "Agents schema"
Cohesion: 0.03
Nodes (72): AgentDefinition.actionCap, AgentDefinition.adapterConfig, AgentDefinition.adapterType, AgentDefinition.allowedTools, AgentDefinition.budgetResetAt, AgentDefinition.company, AgentDefinition.companyId, AgentDefinition.contextStrategy (+64 more)

### Community 6 - "Inventory schema"
Cohesion: 0.03
Nodes (71): Inventory, Shipment.warehouseId, StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.company, StockAudit.companyId, StockAudit.completedAt, StockAudit.createdAt (+63 more)

### Community 7 - "Advertising schema"
Cohesion: 0.03
Nodes (67): AdAction.actionType, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.company, AdAction.companyId, AdAction.createdAt (+59 more)

### Community 8 - "Agents schema"
Cohesion: 0.04
Nodes (63): Agents, AgentLog.createdAt, AgentLog.data, AgentLog.id, AgentLog.level, AgentLog.message, AgentLog.task, AgentLog.taskId (+55 more)

### Community 9 - "AI schema"
Cohesion: 0.04
Nodes (61): prisma — Shared Schema, Advertising, AI, ContentGeneration.company, ContentGeneration.companyId, ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage (+53 more)

### Community 10 - "Core schema"
Cohesion: 0.04
Nodes (61): Ad.optionId, BundleComponent.bundleOption, BundleComponent.bundleOptionId, BundleComponent.company, BundleComponent.companyId, BundleComponent.componentOption, BundleComponent.componentOptionId, BundleComponent.createdAt (+53 more)

### Community 11 - "Orders schema"
Cohesion: 0.04
Nodes (60): OrderLineItem.company, OrderLineItem.companyId, OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.metadata, OrderLineItem.option (+52 more)

### Community 12 - "System schema"
Cohesion: 0.04
Nodes (60): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.company, ActionTask.companyId, ActionTask.createdAt, ActionTask.date (+52 more)

### Community 13 - "System schema"
Cohesion: 0.04
Nodes (55): System, BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.company, BusinessRule.companyId, BusinessRule.conditions (+47 more)

### Community 14 - "Agents schema"
Cohesion: 0.04
Nodes (54): AgentWakeupRequest.agent, AgentWakeupRequest.agentId, AgentWakeupRequest.claimedAt, AgentWakeupRequest.coalescedCount, AgentWakeupRequest.company, AgentWakeupRequest.companyId, AgentWakeupRequest.createdAt, AgentWakeupRequest.error (+46 more)

### Community 15 - "Advertising schema"
Cohesion: 0.04
Nodes (52): Ad.adGroup, Ad.adOptionId, Ad.adProductName, Ad.adType, Ad.billingType, Ad.campaignEndDate, Ad.campaignId, Ad.campaignName (+44 more)

### Community 16 - "Orders schema"
Cohesion: 0.05
Nodes (49): Order.company, Order.companyId, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id (+41 more)

### Community 17 - "AI schema"
Cohesion: 0.05
Nodes (43): ThumbnailGeneration.candidates, ThumbnailGeneration.company, ThumbnailGeneration.companyId, ThumbnailGeneration.createdAt, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.grade, ThumbnailGeneration.id, ThumbnailGeneration.master (+35 more)

### Community 18 - "Advertising schema"
Cohesion: 0.05
Nodes (41): ExecutionLog.createdAt, ExecutionLog.id, ExecutionLog.level, ExecutionLog.message, ExecutionLog.payloadJson, ExecutionLog.step, ExecutionLog.task, ExecutionLog.taskId (+33 more)

### Community 19 - "Inventory schema"
Cohesion: 0.07
Nodes (32): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.option, PickingItem.optionId, PickingItem.orderId (+24 more)

### Community 20 - "System schema"
Cohesion: 0.09
Nodes (23): AgentDefinition.marketplaceId, Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon (+15 more)

### Community 21 - "Finance schema"
Cohesion: 0.11
Nodes (22): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.company, ProfitLoss.companyId, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing (+14 more)

### Community 22 - "Inventory schema"
Cohesion: 0.11
Nodes (21): ReturnTransfer.company, ReturnTransfer.companyId, ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.notes (+13 more)

### Community 23 - "Orders schema"
Cohesion: 0.12
Nodes (20): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.company, Settlement.companyId, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount (+12 more)

### Community 24 - "Advertising schema"
Cohesion: 0.14
Nodes (18): TrafficStats.cartAdds, TrafficStats.company, TrafficStats.companyId, TrafficStats.conversionRate, TrafficStats.createdAt, TrafficStats.date, TrafficStats.id, TrafficStats.listing (+10 more)

### Community 25 - "Core schema"
Cohesion: 0.19
Nodes (13): CategoryMapping.company, CategoryMapping.companyId, CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.isActive (+5 more)

## Knowledge Gaps
- **963 isolated node(s):** `Ad.platform`, `Ad.campaignName`, `Ad.dailyBudget`, `Ad.spend`, `Ad.impressions` (+958 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Orders schema` to `Supply schema`, `Channels schema`, `Finance schema`, `Core schema`, `Agents schema`, `Inventory schema`, `Advertising schema`, `Agents schema`, `AI schema`, `Core schema`, `Orders schema`, `System schema`, `System schema`, `Agents schema`, `Advertising schema`, `Orders schema`, `AI schema`, `Advertising schema`, `Inventory schema`, `System schema`, `Finance schema`, `Inventory schema`, `Orders schema`, `Advertising schema`, `Core schema`?**
  _High betweenness centrality (0.477) - this node is a cross-community bridge._
- **Why does `Company` connect `Finance schema` to `Orders schema`, `Supply schema`, `Channels schema`, `Core schema`, `Agents schema`, `Inventory schema`, `Advertising schema`, `Agents schema`, `AI schema`, `Core schema`, `Orders schema`, `System schema`, `System schema`, `Agents schema`, `Advertising schema`, `Orders schema`, `AI schema`, `Advertising schema`, `Inventory schema`, `Finance schema`, `Inventory schema`, `Orders schema`, `Advertising schema`, `Core schema`?**
  _High betweenness centrality (0.235) - this node is a cross-community bridge._
- **Why does `prisma — Shared Schema` connect `AI schema` to `Orders schema`, `Supply schema`, `Channels schema`, `Finance schema`, `Core schema`, `Agents schema`, `Inventory schema`, `Advertising schema`, `Agents schema`, `Core schema`, `Orders schema`, `System schema`, `System schema`, `Agents schema`, `Advertising schema`, `Orders schema`, `AI schema`, `Advertising schema`, `Inventory schema`, `System schema`, `Finance schema`, `Inventory schema`, `Orders schema`, `Advertising schema`, `Core schema`?**
  _High betweenness centrality (0.155) - this node is a cross-community bridge._
- **What connects `Ad.platform`, `Ad.campaignName`, `Ad.dailyBudget` to the rest of the system?**
  _963 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Orders schema` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `Supply schema` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Channels schema` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._