# Graph Report - schema  (2026-05-01)

## Corpus Check
- 12 files · ~14,577 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1501 nodes · 2339 edges · 30 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 243 edges
2. `prisma — Shared Schema` - 142 edges
3. `Organization` - 132 edges
4. `AgentDefinition` - 66 edges
5. `ProductOption` - 66 edges
6. `ChannelListingDailySnapshot` - 64 edges
7. `MasterProduct` - 61 edges
8. `ChannelListing` - 54 edges
9. `ChannelAdTargetDailySnapshot` - 52 edges
10. `Order` - 46 edges
11. `ChannelScrapeSnapshot` - 41 edges
12. `ChannelListingOptionDailySnapshot` - 40 edges

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
Nodes (136): externalOptionId canonical option identity, vendorItemId provider term, Database ERD, Core, Alert.actionTask, Alert.actionTaskId, Alert.createdAt, Alert.id (+128 more)

### Community 1 - "AI schema"
Cohesion: 0.02
Nodes (118): AI, CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.isActive, CategoryMapping.keywords (+110 more)

### Community 2 - "Finance schema"
Cohesion: 0.02
Nodes (112): prisma — Shared Schema, Finance, GradeHistory.calculatedAt, GradeHistory.id, GradeHistory.marginScore, GradeHistory.master, GradeHistory.masterId, GradeHistory.newGrade (+104 more)

### Community 3 - "Supply schema"
Cohesion: 0.03
Nodes (95): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.id, MasterSupplierProduct.isPrimary, MasterSupplierProduct.master, MasterSupplierProduct.masterId, MasterSupplierProduct.memo, MasterSupplierProduct.minOrderQty (+87 more)

### Community 4 - "Orders schema"
Cohesion: 0.03
Nodes (86): Orders, CSRecord.assignee, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id (+78 more)

### Community 5 - "Agents schema"
Cohesion: 0.03
Nodes (72): AgentDefinition.actionCap, AgentDefinition.adapterConfig, AgentDefinition.adapterType, AgentDefinition.allowedTools, AgentDefinition.budgetResetAt, AgentDefinition.contextStrategy, AgentDefinition.createdAt, AgentDefinition.deniedSkills (+64 more)

### Community 6 - "Inventory schema"
Cohesion: 0.03
Nodes (71): Inventory, Shipment.warehouseId, StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id (+63 more)

### Community 7 - "Advertising schema"
Cohesion: 0.03
Nodes (68): Advertising, AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson (+60 more)

### Community 8 - "Orders schema"
Cohesion: 0.04
Nodes (62): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.metadata, OrderLineItem.option, OrderLineItem.optionId, OrderLineItem.optionName (+54 more)

### Community 9 - "Core schema"
Cohesion: 0.04
Nodes (60): BundleComponent.bundleOption, BundleComponent.bundleOptionId, BundleComponent.componentOption, BundleComponent.componentOptionId, BundleComponent.createdAt, BundleComponent.id, BundleComponent.organization, BundleComponent.organizationId (+52 more)

### Community 10 - "Core schema"
Cohesion: 0.04
Nodes (60): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.href (+52 more)

### Community 11 - "Agents schema"
Cohesion: 0.04
Nodes (58): AgentDefinition.marketplaceId, Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon (+50 more)

### Community 12 - "Channels schema"
Cohesion: 0.04
Nodes (58): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+50 more)

### Community 13 - "Agents schema"
Cohesion: 0.04
Nodes (54): AgentWakeupRequest.agent, AgentWakeupRequest.agentId, AgentWakeupRequest.claimedAt, AgentWakeupRequest.coalescedCount, AgentWakeupRequest.createdAt, AgentWakeupRequest.error, AgentWakeupRequest.finishedAt, AgentWakeupRequest.id (+46 more)

### Community 14 - "Channels schema"
Cohesion: 0.05
Nodes (48): Channels, ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType, ChannelAccountDailyKpiSnapshot.lastObservedAt (+40 more)

### Community 15 - "System schema"
Cohesion: 0.05
Nodes (45): System, ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization (+37 more)

### Community 16 - "Channels schema"
Cohesion: 0.06
Nodes (40): ChannelAdTargetDailySnapshot.adGroup, ChannelAdTargetDailySnapshot.adRevenue, ChannelAdTargetDailySnapshot.adSpend, ChannelAdTargetDailySnapshot.businessDate, ChannelAdTargetDailySnapshot.campaignId, ChannelAdTargetDailySnapshot.campaignName, ChannelAdTargetDailySnapshot.channel, ChannelAdTargetDailySnapshot.clicks (+32 more)

### Community 17 - "Inventory schema"
Cohesion: 0.07
Nodes (32): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.option, PickingItem.optionId, PickingItem.orderId (+24 more)

### Community 18 - "Agents schema"
Cohesion: 0.08
Nodes (28): Agents, AgentLog.createdAt, AgentLog.data, AgentLog.id, AgentLog.level, AgentLog.message, AgentLog.task, AgentLog.taskId (+20 more)

### Community 19 - "AI schema"
Cohesion: 0.1
Nodes (22): ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id, ThumbnailAnalysis.imageSpec, ThumbnailAnalysis.imageUrl (+14 more)

### Community 20 - "Finance schema"
Cohesion: 0.11
Nodes (22): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.listingId, ProfitLoss.month (+14 more)

### Community 21 - "System schema"
Cohesion: 0.1
Nodes (22): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description, BusinessRule.displayName (+14 more)

### Community 22 - "Inventory schema"
Cohesion: 0.11
Nodes (21): ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.notes, ReturnTransfer.option, ReturnTransfer.optionId (+13 more)

### Community 23 - "Orders schema"
Cohesion: 0.12
Nodes (20): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id, Settlement.notes (+12 more)

### Community 24 - "AI schema"
Cohesion: 0.12
Nodes (18): ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.generatedDescription, ContentGeneration.generatedTitle, ContentGeneration.id, ContentGeneration.master (+10 more)

### Community 25 - "AI schema"
Cohesion: 0.12
Nodes (17): Thumbnail.clicks, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing, Thumbnail.listingId (+9 more)

### Community 26 - "Core schema"
Cohesion: 0.16
Nodes (16): ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id, ChannelAccount.isPrimary, ChannelAccount.name, ChannelAccount.organization (+8 more)

### Community 27 - "Finance schema"
Cohesion: 0.14
Nodes (15): ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description, ManualLedger.id (+7 more)

### Community 28 - "Core schema"
Cohesion: 0.15
Nodes (14): LegalEntity.address, LegalEntity.businessNumber, LegalEntity.countryCode, LegalEntity.createdAt, LegalEntity.id, LegalEntity.isPrimary, LegalEntity.metadata, LegalEntity.name (+6 more)

### Community 29 - "Advertising schema"
Cohesion: 0.2
Nodes (11): ScrapeTarget.category, ScrapeTarget.createdAt, ScrapeTarget.id, ScrapeTarget.isActive, ScrapeTarget.label, ScrapeTarget.lastScrapedAt, ScrapeTarget.organization, ScrapeTarget.organizationId (+3 more)

## Knowledge Gaps
- **1004 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+999 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Core schema` to `AI schema`, `Finance schema`, `Supply schema`, `Orders schema`, `Agents schema`, `Inventory schema`, `Advertising schema`, `Orders schema`, `Core schema`, `Core schema`, `Agents schema`, `Channels schema`, `Agents schema`, `Channels schema`, `System schema`, `Channels schema`, `Inventory schema`, `Agents schema`, `AI schema`, `Finance schema`, `System schema`, `Inventory schema`, `Orders schema`, `AI schema`, `AI schema`, `Core schema`, `Finance schema`, `Core schema`, `Advertising schema`?**
  _High betweenness centrality (0.449) - this node is a cross-community bridge._
- **Why does `Organization` connect `AI schema` to `Core schema`, `Finance schema`, `Supply schema`, `Orders schema`, `Agents schema`, `Inventory schema`, `Advertising schema`, `Orders schema`, `Core schema`, `Core schema`, `Agents schema`, `Channels schema`, `Agents schema`, `Channels schema`, `System schema`, `Channels schema`, `Inventory schema`, `AI schema`, `Finance schema`, `System schema`, `Inventory schema`, `Orders schema`, `AI schema`, `AI schema`, `Core schema`, `Finance schema`, `Core schema`, `Advertising schema`?**
  _High betweenness centrality (0.224) - this node is a cross-community bridge._
- **Why does `prisma — Shared Schema` connect `Finance schema` to `Core schema`, `AI schema`, `Supply schema`, `Orders schema`, `Agents schema`, `Inventory schema`, `Advertising schema`, `Orders schema`, `Core schema`, `Core schema`, `Agents schema`, `Channels schema`, `Agents schema`, `Channels schema`, `System schema`, `Channels schema`, `Inventory schema`, `Agents schema`, `AI schema`, `Finance schema`, `System schema`, `Inventory schema`, `Orders schema`, `AI schema`, `AI schema`, `Core schema`, `Finance schema`, `Core schema`, `Advertising schema`?**
  _High betweenness centrality (0.209) - this node is a cross-community bridge._
- **What connects `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason` to the rest of the system?**
  _1004 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core schema` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `AI schema` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `Finance schema` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._