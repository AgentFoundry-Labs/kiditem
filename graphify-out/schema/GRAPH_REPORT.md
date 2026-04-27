# Graph Report - schema  (2026-04-27)

## Corpus Check
- 12 files · ~13,127 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1392 nodes · 2166 edges · 28 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_System schema|System schema]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 232 edges
2. `prisma — Shared Schema` - 134 edges
3. `Company` - 123 edges
4. `AgentDefinition` - 66 edges
5. `ProductOption` - 66 edges
6. `ChannelListingDailySnapshot` - 64 edges
7. `MasterProduct` - 63 edges
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
- `Database ERD` --mentions_field--> `ChannelListingDailySnapshot.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/channels.prisma
- `Database ERD` --mentions_field--> `ChannelAdTargetDailySnapshot.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/channels.prisma
- `Database ERD` --mentions_field--> `ChannelAdTargetDailySnapshot.externalOptionId`  [EXTRACTED]
  docs/ERD.md → prisma/models/channels.prisma

## Communities

### Community 0 - "Supply schema"
Cohesion: 0.03
Nodes (96): Supply, MasterProduct.supplierId, MasterSupplierProduct.createdAt, MasterSupplierProduct.id, MasterSupplierProduct.isPrimary, MasterSupplierProduct.master, MasterSupplierProduct.masterId, MasterSupplierProduct.memo (+88 more)

### Community 1 - "Orders schema"
Cohesion: 0.03
Nodes (91): prisma — Shared Schema, AI, Orders, ChannelAdTargetDailySnapshot.listingId, ChannelListing.channel, ChannelListing.channelName, ChannelListing.channelPrice, ChannelListing.company (+83 more)

### Community 2 - "Channels schema"
Cohesion: 0.03
Nodes (83): externalOptionId canonical option identity, vendorItemId provider term, Database ERD, Core, ChannelAdTargetDailySnapshot.listingOptionId, ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListingDailySnapshot.rawSnapshotId, ChannelListingOption.company (+75 more)

### Community 3 - "Core schema"
Cohesion: 0.03
Nodes (80): MasterProduct.abcGrade, MasterProduct.adBudgetLimit, MasterProduct.adTier, MasterProduct.barcode, MasterProduct.brand, MasterProduct.category, MasterProduct.code, MasterProduct.company (+72 more)

### Community 4 - "Agents schema"
Cohesion: 0.03
Nodes (72): AgentDefinition.actionCap, AgentDefinition.adapterConfig, AgentDefinition.adapterType, AgentDefinition.allowedTools, AgentDefinition.budgetResetAt, AgentDefinition.company, AgentDefinition.companyId, AgentDefinition.contextStrategy (+64 more)

### Community 5 - "Inventory schema"
Cohesion: 0.03
Nodes (71): Inventory, Shipment.warehouseId, StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.company, StockAudit.companyId, StockAudit.completedAt, StockAudit.createdAt (+63 more)

### Community 6 - "Advertising schema"
Cohesion: 0.03
Nodes (68): Advertising, AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson (+60 more)

### Community 7 - "AI schema"
Cohesion: 0.04
Nodes (62): HeartbeatRun.triggeredByUserId, ThumbnailGeneration.candidates, ThumbnailGeneration.company, ThumbnailGeneration.companyId, ThumbnailGeneration.createdAt, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.grade, ThumbnailGeneration.id (+54 more)

### Community 8 - "Core schema"
Cohesion: 0.04
Nodes (60): BundleComponent.bundleOption, BundleComponent.bundleOptionId, BundleComponent.company, BundleComponent.companyId, BundleComponent.componentOption, BundleComponent.componentOptionId, BundleComponent.createdAt, BundleComponent.id (+52 more)

### Community 9 - "Orders schema"
Cohesion: 0.04
Nodes (60): OrderLineItem.company, OrderLineItem.companyId, OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.metadata, OrderLineItem.option (+52 more)

### Community 10 - "Channels schema"
Cohesion: 0.04
Nodes (58): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+50 more)

### Community 11 - "Agents schema"
Cohesion: 0.04
Nodes (58): AgentDefinition.marketplaceId, Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon (+50 more)

### Community 12 - "System schema"
Cohesion: 0.04
Nodes (55): ActivityEvent.company, ActivityEvent.companyId, ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType (+47 more)

### Community 13 - "Agents schema"
Cohesion: 0.04
Nodes (54): AgentWakeupRequest.agent, AgentWakeupRequest.agentId, AgentWakeupRequest.claimedAt, AgentWakeupRequest.coalescedCount, AgentWakeupRequest.company, AgentWakeupRequest.companyId, AgentWakeupRequest.createdAt, AgentWakeupRequest.error (+46 more)

### Community 14 - "System schema"
Cohesion: 0.04
Nodes (52): System, ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.company, ActionTask.companyId, ActionTask.createdAt (+44 more)

### Community 15 - "Orders schema"
Cohesion: 0.05
Nodes (49): Order.company, Order.companyId, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id (+41 more)

### Community 16 - "Channels schema"
Cohesion: 0.05
Nodes (48): Channels, ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.company, ChannelAccountDailyKpiSnapshot.companyId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id (+40 more)

### Community 17 - "Finance schema"
Cohesion: 0.05
Nodes (47): Finance, GradeHistory.calculatedAt, GradeHistory.company, GradeHistory.companyId, GradeHistory.id, GradeHistory.marginScore, GradeHistory.master, GradeHistory.masterId (+39 more)

### Community 18 - "Channels schema"
Cohesion: 0.06
Nodes (40): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel, ChannelAdTargetDailySnapshot.clicks (+32 more)

### Community 19 - "Inventory schema"
Cohesion: 0.07
Nodes (32): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.option, PickingItem.optionId, PickingItem.orderId (+24 more)

### Community 20 - "Agents schema"
Cohesion: 0.08
Nodes (28): Agents, AgentLog.createdAt, AgentLog.data, AgentLog.id, AgentLog.level, AgentLog.message, AgentLog.task, AgentLog.taskId (+20 more)

### Community 21 - "Finance schema"
Cohesion: 0.11
Nodes (22): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.company, ProfitLoss.companyId, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing (+14 more)

### Community 22 - "System schema"
Cohesion: 0.1
Nodes (22): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.company, BusinessRule.companyId, BusinessRule.conditions, BusinessRule.createdAt (+14 more)

### Community 23 - "Inventory schema"
Cohesion: 0.11
Nodes (21): ReturnTransfer.company, ReturnTransfer.companyId, ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.notes (+13 more)

### Community 24 - "Orders schema"
Cohesion: 0.12
Nodes (20): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.company, Settlement.companyId, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount (+12 more)

### Community 25 - "AI schema"
Cohesion: 0.12
Nodes (18): ContentGeneration.company, ContentGeneration.companyId, ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.generatedDescription, ContentGeneration.generatedTitle (+10 more)

### Community 26 - "Core schema"
Cohesion: 0.19
Nodes (13): CategoryMapping.company, CategoryMapping.companyId, CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.isActive (+5 more)

### Community 27 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

## Knowledge Gaps
- **930 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+925 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Channels schema` to `Supply schema`, `Orders schema`, `Core schema`, `Agents schema`, `Inventory schema`, `Advertising schema`, `AI schema`, `Core schema`, `Orders schema`, `Channels schema`, `Agents schema`, `System schema`, `Agents schema`, `System schema`, `Orders schema`, `Channels schema`, `Finance schema`, `Channels schema`, `Inventory schema`, `Agents schema`, `Finance schema`, `System schema`, `Inventory schema`, `Orders schema`, `AI schema`, `Core schema`, `System schema`?**
  _High betweenness centrality (0.453) - this node is a cross-community bridge._
- **Why does `prisma — Shared Schema` connect `Orders schema` to `Supply schema`, `Channels schema`, `Core schema`, `Agents schema`, `Inventory schema`, `Advertising schema`, `AI schema`, `Core schema`, `Orders schema`, `Channels schema`, `Agents schema`, `System schema`, `Agents schema`, `System schema`, `Orders schema`, `Channels schema`, `Finance schema`, `Channels schema`, `Inventory schema`, `Agents schema`, `Finance schema`, `System schema`, `Inventory schema`, `Orders schema`, `AI schema`, `Core schema`, `System schema`?**
  _High betweenness centrality (0.225) - this node is a cross-community bridge._
- **Why does `Company` connect `System schema` to `Supply schema`, `Orders schema`, `Channels schema`, `Core schema`, `Agents schema`, `Inventory schema`, `Advertising schema`, `AI schema`, `Core schema`, `Orders schema`, `Channels schema`, `Agents schema`, `Agents schema`, `System schema`, `Orders schema`, `Channels schema`, `Finance schema`, `Channels schema`, `Inventory schema`, `Finance schema`, `System schema`, `Inventory schema`, `Orders schema`, `AI schema`, `Core schema`?**
  _High betweenness centrality (0.202) - this node is a cross-community bridge._
- **What connects `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason` to the rest of the system?**
  _930 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Supply schema` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Orders schema` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Channels schema` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._