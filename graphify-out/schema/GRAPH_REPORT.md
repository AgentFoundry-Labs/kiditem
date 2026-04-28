# Graph Report - schema  (2026-04-28)

## Corpus Check
- 12 files · ~13,821 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1468 nodes · 2278 edges · 27 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 243 edges
2. `prisma — Shared Schema` - 139 edges
3. `Company` - 131 edges
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

### Community 0 - "Core schema"
Cohesion: 0.02
Nodes (123): externalOptionId canonical option identity, vendorItemId provider term, Database ERD, Core, ChannelAdTargetDailySnapshot.listingId, ChannelAdTargetDailySnapshot.listingOptionId, ChannelAdTargetDailySnapshot.rawSnapshotId, ChannelListing.channel (+115 more)

### Community 1 - "Orders schema"
Cohesion: 0.02
Nodes (102): Orders, Order.company, Order.companyId, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId (+94 more)

### Community 2 - "Supply schema"
Cohesion: 0.03
Nodes (96): Supply, MasterProduct.supplierId, MasterSupplierProduct.createdAt, MasterSupplierProduct.id, MasterSupplierProduct.isPrimary, MasterSupplierProduct.master, MasterSupplierProduct.masterId, MasterSupplierProduct.memo (+88 more)

### Community 3 - "AI schema"
Cohesion: 0.02
Nodes (93): AI, ThumbnailGeneration.attemptCount, ThumbnailGeneration.company, ThumbnailGeneration.companyId, ThumbnailGeneration.createdAt, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.errorMessage, ThumbnailGeneration.grade (+85 more)

### Community 4 - "Agents schema"
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

### Community 9 - "Finance schema"
Cohesion: 0.04
Nodes (65): prisma — Shared Schema, Finance, GradeHistory.calculatedAt, GradeHistory.company, GradeHistory.companyId, GradeHistory.id, GradeHistory.marginScore, GradeHistory.master (+57 more)

### Community 10 - "Core schema"
Cohesion: 0.04
Nodes (63): CategoryMapping.company, CategoryMapping.companyId, CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.isActive (+55 more)

### Community 11 - "Core schema"
Cohesion: 0.04
Nodes (60): BundleComponent.bundleOption, BundleComponent.bundleOptionId, BundleComponent.company, BundleComponent.companyId, BundleComponent.componentOption, BundleComponent.componentOptionId, BundleComponent.createdAt, BundleComponent.id (+52 more)

### Community 12 - "Agents schema"
Cohesion: 0.04
Nodes (58): AgentDefinition.marketplaceId, Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon (+50 more)

### Community 13 - "Channels schema"
Cohesion: 0.04
Nodes (58): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+50 more)

### Community 14 - "Channels schema"
Cohesion: 0.05
Nodes (48): Channels, ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.company, ChannelAccountDailyKpiSnapshot.companyId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id (+40 more)

### Community 15 - "System schema"
Cohesion: 0.05
Nodes (45): System, ActivityEvent.company, ActivityEvent.companyId, ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId (+37 more)

### Community 16 - "System schema"
Cohesion: 0.06
Nodes (41): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.company, ActionTask.companyId, ActionTask.createdAt, ActionTask.date (+33 more)

### Community 17 - "Channels schema"
Cohesion: 0.06
Nodes (40): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel, ChannelAdTargetDailySnapshot.clicks (+32 more)

### Community 18 - "Inventory schema"
Cohesion: 0.07
Nodes (32): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.option, PickingItem.optionId, PickingItem.orderId (+24 more)

### Community 19 - "AI schema"
Cohesion: 0.1
Nodes (22): ThumbnailAnalysis.company, ThumbnailAnalysis.companyId, ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id (+14 more)

### Community 20 - "AI schema"
Cohesion: 0.1
Nodes (22): ThumbnailTracking.appliedAt, ThumbnailTracking.company, ThumbnailTracking.companyId, ThumbnailTracking.createdAt, ThumbnailTracking.ctrAfter, ThumbnailTracking.ctrBefore, ThumbnailTracking.generation, ThumbnailTracking.generationId (+14 more)

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
Cohesion: 0.1
Nodes (21): Shipment.company, Shipment.companyId, Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.id (+13 more)

### Community 25 - "Orders schema"
Cohesion: 0.12
Nodes (20): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.company, Settlement.companyId, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount (+12 more)

### Community 26 - "Orders schema"
Cohesion: 0.12
Nodes (18): UnshippedItem.company, UnshippedItem.companyId, UnshippedItem.createdAt, UnshippedItem.delayDays, UnshippedItem.id, UnshippedItem.isNotified, UnshippedItem.listing, UnshippedItem.listingId (+10 more)

## Knowledge Gaps
- **984 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+979 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Core schema` to `Orders schema`, `Supply schema`, `AI schema`, `Agents schema`, `Core schema`, `Agents schema`, `Inventory schema`, `Advertising schema`, `Finance schema`, `Core schema`, `Core schema`, `Agents schema`, `Channels schema`, `Channels schema`, `System schema`, `System schema`, `Channels schema`, `Inventory schema`, `AI schema`, `AI schema`, `Finance schema`, `System schema`, `Inventory schema`, `Orders schema`, `Orders schema`, `Orders schema`?**
  _High betweenness centrality (0.452) - this node is a cross-community bridge._
- **Why does `Company` connect `Core schema` to `Core schema`, `Orders schema`, `Supply schema`, `AI schema`, `Agents schema`, `Core schema`, `Agents schema`, `Inventory schema`, `Advertising schema`, `Finance schema`, `Core schema`, `Agents schema`, `Channels schema`, `Channels schema`, `System schema`, `System schema`, `Channels schema`, `Inventory schema`, `AI schema`, `AI schema`, `Finance schema`, `System schema`, `Inventory schema`, `Orders schema`, `Orders schema`, `Orders schema`?**
  _High betweenness centrality (0.213) - this node is a cross-community bridge._
- **Why does `prisma — Shared Schema` connect `Finance schema` to `Core schema`, `Orders schema`, `Supply schema`, `AI schema`, `Agents schema`, `Core schema`, `Agents schema`, `Inventory schema`, `Advertising schema`, `Core schema`, `Core schema`, `Agents schema`, `Channels schema`, `Channels schema`, `System schema`, `System schema`, `Channels schema`, `Inventory schema`, `AI schema`, `AI schema`, `Finance schema`, `System schema`, `Inventory schema`, `Orders schema`, `Orders schema`, `Orders schema`?**
  _High betweenness centrality (0.203) - this node is a cross-community bridge._
- **What connects `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason` to the rest of the system?**
  _984 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core schema` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `Orders schema` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `Supply schema` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._