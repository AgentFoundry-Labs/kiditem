# Graph Report - schema  (2026-04-27)

## Corpus Check
- 12 files · ~14,103 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1520 nodes · 2344 edges · 30 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_System schema|System schema]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 248 edges
2. `prisma — Shared Schema` - 139 edges
3. `Company` - 131 edges
4. `ProductOption` - 70 edges
5. `AgentDefinition` - 66 edges
6. `ChannelListingDailySnapshot` - 64 edges
7. `MasterProduct` - 63 edges
8. `ChannelListing` - 62 edges
9. `Ad` - 59 edges
10. `ChannelAdTargetDailySnapshot` - 52 edges
11. `AdSnapshot` - 49 edges
12. `ChannelScrapeSnapshot` - 41 edges

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
- `Database ERD` --mentions_field--> `ChannelListingDailySnapshot.externalId`  [EXTRACTED]
  docs/ERD.md → prisma/models/channels.prisma

## Communities

### Community 0 - "Channels schema"
Cohesion: 0.03
Nodes (98): externalOptionId canonical option identity, vendorItemId provider term, Database ERD, Core, Alert.actionTask, Alert.actionTaskId, Alert.company, Alert.companyId (+90 more)

### Community 1 - "Supply schema"
Cohesion: 0.03
Nodes (96): Supply, MasterProduct.supplierId, MasterSupplierProduct.createdAt, MasterSupplierProduct.id, MasterSupplierProduct.isPrimary, MasterSupplierProduct.master, MasterSupplierProduct.masterId, MasterSupplierProduct.memo (+88 more)

### Community 2 - "Orders schema"
Cohesion: 0.03
Nodes (88): Order.company, Order.companyId, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id (+80 more)

### Community 3 - "Orders schema"
Cohesion: 0.03
Nodes (86): prisma — Shared Schema, Orders, Ad.listingId, AdSnapshot.listingId, ChannelListing.channel, ChannelListing.channelName, ChannelListing.channelPrice, ChannelListing.company (+78 more)

### Community 4 - "Agents schema"
Cohesion: 0.03
Nodes (82): Agents, AgentLog.createdAt, AgentLog.data, AgentLog.id, AgentLog.level, AgentLog.message, AgentLog.task, AgentLog.taskId (+74 more)

### Community 5 - "AI schema"
Cohesion: 0.03
Nodes (75): ContentGeneration.company, ContentGeneration.companyId, ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.generatedDescription, ContentGeneration.generatedTitle (+67 more)

### Community 6 - "Agents schema"
Cohesion: 0.03
Nodes (72): AgentDefinition.actionCap, AgentDefinition.adapterConfig, AgentDefinition.adapterType, AgentDefinition.allowedTools, AgentDefinition.budgetResetAt, AgentDefinition.company, AgentDefinition.companyId, AgentDefinition.contextStrategy (+64 more)

### Community 7 - "Inventory schema"
Cohesion: 0.03
Nodes (71): Inventory, Shipment.warehouseId, StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.company, StockAudit.companyId, StockAudit.completedAt, StockAudit.createdAt (+63 more)

### Community 8 - "Advertising schema"
Cohesion: 0.03
Nodes (70): Advertising, AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson (+62 more)

### Community 9 - "System schema"
Cohesion: 0.04
Nodes (69): System, ActivityEvent.company, ActivityEvent.companyId, ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId (+61 more)

### Community 10 - "Core schema"
Cohesion: 0.04
Nodes (64): Ad.optionId, BundleComponent.bundleOption, BundleComponent.bundleOptionId, BundleComponent.company, BundleComponent.companyId, BundleComponent.componentOption, BundleComponent.componentOptionId, BundleComponent.createdAt (+56 more)

### Community 11 - "AI schema"
Cohesion: 0.04
Nodes (61): AI, Thumbnail.clicks, Thumbnail.company, Thumbnail.companyId, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl (+53 more)

### Community 12 - "Agents schema"
Cohesion: 0.04
Nodes (58): AgentDefinition.marketplaceId, Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon (+50 more)

### Community 13 - "Channels schema"
Cohesion: 0.04
Nodes (58): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+50 more)

### Community 14 - "Advertising schema"
Cohesion: 0.04
Nodes (52): Ad.adGroup, Ad.adOptionId, Ad.adProductName, Ad.adType, Ad.billingType, Ad.campaignEndDate, Ad.campaignId, Ad.campaignName (+44 more)

### Community 15 - "Finance schema"
Cohesion: 0.05
Nodes (49): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.company, ManualLedger.companyId, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy (+41 more)

### Community 16 - "Channels schema"
Cohesion: 0.05
Nodes (48): Channels, ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.company, ChannelAccountDailyKpiSnapshot.companyId, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id (+40 more)

### Community 17 - "System schema"
Cohesion: 0.05
Nodes (45): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.company, ActionTask.companyId, ActionTask.createdAt, ActionTask.date (+37 more)

### Community 18 - "Channels schema"
Cohesion: 0.06
Nodes (41): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel, ChannelAdTargetDailySnapshot.clicks (+33 more)

### Community 19 - "Advertising schema"
Cohesion: 0.05
Nodes (41): AdSnapshot.adConversions, AdSnapshot.adRevenue, AdSnapshot.adSpend, AdSnapshot.budget, AdSnapshot.campaignName, AdSnapshot.capturedAt, AdSnapshot.clicks, AdSnapshot.collectedAt (+33 more)

### Community 20 - "Inventory schema"
Cohesion: 0.07
Nodes (32): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.option, PickingItem.optionId, PickingItem.orderId (+24 more)

### Community 21 - "Finance schema"
Cohesion: 0.11
Nodes (22): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.company, ProfitLoss.companyId, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing (+14 more)

### Community 22 - "System schema"
Cohesion: 0.1
Nodes (22): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.company, BusinessRule.companyId, BusinessRule.conditions, BusinessRule.createdAt (+14 more)

### Community 23 - "AI schema"
Cohesion: 0.1
Nodes (21): ThumbnailAnalysis.company, ThumbnailAnalysis.companyId, ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id (+13 more)

### Community 24 - "Orders schema"
Cohesion: 0.1
Nodes (21): Shipment.company, Shipment.companyId, Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.id (+13 more)

### Community 25 - "Orders schema"
Cohesion: 0.12
Nodes (20): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.company, Settlement.companyId, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount (+12 more)

### Community 26 - "Advertising schema"
Cohesion: 0.14
Nodes (18): TrafficStats.cartAdds, TrafficStats.company, TrafficStats.companyId, TrafficStats.conversionRate, TrafficStats.createdAt, TrafficStats.date, TrafficStats.id, TrafficStats.listing (+10 more)

### Community 27 - "Inventory schema"
Cohesion: 0.12
Nodes (18): Inventory.company, Inventory.companyId, Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.id, Inventory.lastRestockedAt, Inventory.leadTimeDays (+10 more)

### Community 28 - "System schema"
Cohesion: 0.23
Nodes (12): MigrationCheckpoint.createdAt, MigrationCheckpoint.entityKey, MigrationCheckpoint.error, MigrationCheckpoint.id, MigrationCheckpoint.payload, MigrationCheckpoint.scriptName, MigrationCheckpoint.status, MigrationCheckpoint.stepName (+4 more)

### Community 29 - "System schema"
Cohesion: 0.22
Nodes (10): FeatureGate.allowedCompanies, FeatureGate.createdAt, FeatureGate.description, FeatureGate.enabled, FeatureGate.id, FeatureGate.metadata, FeatureGate.name, FeatureGate.updatedAt (+2 more)

## Knowledge Gaps
- **1030 isolated node(s):** `Ad.platform`, `Ad.campaignName`, `Ad.dailyBudget`, `Ad.spend`, `Ad.impressions` (+1025 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Channels schema` to `Supply schema`, `Orders schema`, `Orders schema`, `Agents schema`, `AI schema`, `Agents schema`, `Inventory schema`, `Advertising schema`, `System schema`, `Core schema`, `AI schema`, `Agents schema`, `Channels schema`, `Advertising schema`, `Finance schema`, `Channels schema`, `System schema`, `Channels schema`, `Advertising schema`, `Inventory schema`, `Finance schema`, `System schema`, `AI schema`, `Orders schema`, `Orders schema`, `Advertising schema`, `Inventory schema`, `System schema`, `System schema`?**
  _High betweenness centrality (0.457) - this node is a cross-community bridge._
- **Why does `Company` connect `System schema` to `Channels schema`, `Supply schema`, `Orders schema`, `Orders schema`, `Agents schema`, `AI schema`, `Agents schema`, `Inventory schema`, `Advertising schema`, `Core schema`, `AI schema`, `Agents schema`, `Channels schema`, `Advertising schema`, `Finance schema`, `Channels schema`, `System schema`, `Channels schema`, `Advertising schema`, `Inventory schema`, `Finance schema`, `System schema`, `AI schema`, `Orders schema`, `Orders schema`, `Advertising schema`, `Inventory schema`?**
  _High betweenness centrality (0.224) - this node is a cross-community bridge._
- **Why does `prisma — Shared Schema` connect `Orders schema` to `Channels schema`, `Supply schema`, `Orders schema`, `Agents schema`, `AI schema`, `Agents schema`, `Inventory schema`, `Advertising schema`, `System schema`, `Core schema`, `AI schema`, `Agents schema`, `Channels schema`, `Advertising schema`, `Finance schema`, `Channels schema`, `System schema`, `Channels schema`, `Advertising schema`, `Inventory schema`, `Finance schema`, `System schema`, `AI schema`, `Orders schema`, `Orders schema`, `Advertising schema`, `Inventory schema`, `System schema`, `System schema`?**
  _High betweenness centrality (0.192) - this node is a cross-community bridge._
- **What connects `Ad.platform`, `Ad.campaignName`, `Ad.dailyBudget` to the rest of the system?**
  _1030 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Channels schema` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Supply schema` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Orders schema` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._