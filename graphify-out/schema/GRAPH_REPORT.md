# Graph Report - schema  (2026-04-26)

## Corpus Check
- 35 files · ~26,171 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1334 nodes · 2900 edges · 26 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Core schema|Core schema]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 216 edges
2. `prisma — Shared Schema` - 126 edges
3. `Company` - 119 edges
4. `Order schema channel-agnostic unification` - 89 edges
5. `profit-loss Live Aggregation (ProfitLoss Table Bypass)` - 86 edges
6. `Dashboard IDOR Sweep + $queryRaw Tenancy Guarantee` - 75 edges
7. `Product schema 3-layer redesign (non-coexistence)` - 70 edges
8. `MasterProduct` - 69 edges
9. `ProductOption` - 69 edges
10. `returnRate Semantic Unification + Orphan Return Policy` - 69 edges
11. `AgentDefinition` - 66 edges
12. `Channel Option External ID Naming` - 66 edges

## Surprising Connections (you probably didn't know these)
- `Database ERD` --mentions_field--> `AdAction.targetType`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `ScrapeTarget.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AgentDefinition.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/agents.prisma
- `Database ERD` --mentions_field--> `WorkflowTemplate.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/agents.prisma
- `Python agents communicate via DB` --mentions_domain--> `Core`  [EXTRACTED]
  .claude/docs/decisions/0003-python-agents-communicate-via-db.md → prisma/models/core.prisma
- `Database ERD` --mentions_field--> `User.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/core.prisma
- `Database ERD` --mentions_field--> `CategoryMapping.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/core.prisma
- `Database ERD` --mentions_field--> `ProductOption.isActive`  [EXTRACTED]
  docs/ERD.md → prisma/models/core.prisma

## Communities

### Community 0 - "Agents schema"
Cohesion: 0.02
Nodes (122): AgentDefinition.actionCap, AgentDefinition.adapterConfig, AgentDefinition.adapterType, AgentDefinition.allowedTools, AgentDefinition.budgetResetAt, AgentDefinition.company, AgentDefinition.contextStrategy, AgentDefinition.createdAt (+114 more)

### Community 1 - "AI schema"
Cohesion: 0.02
Nodes (107): ContentGeneration.company, ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.generatedDescription, ContentGeneration.generatedTitle, ContentGeneration.id (+99 more)

### Community 2 - "Core schema"
Cohesion: 0.16
Nodes (103): Meta: 왜 ADR 을 쓰는가, Authenticated company scope, Secret scrub — write / read / backfill, Admin role-gated observability, Product schema 3-layer redesign (non-coexistence), Order schema channel-agnostic unification, profit-loss Live Aggregation (ProfitLoss Table Bypass), returnRate Semantic Unification + Orphan Return Policy (+95 more)

### Community 3 - "Core schema"
Cohesion: 0.03
Nodes (93): externalOptionId canonical option identity, vendorItemId provider term, Database ERD, Core, Ad.listingId, AdAction.listingId, AdSnapshot.listingId, ChannelListing.channel (+85 more)

### Community 4 - "Supply schema"
Cohesion: 0.03
Nodes (93): Supply, MasterProduct.supplierId, MasterSupplierProduct.createdAt, MasterSupplierProduct.id, MasterSupplierProduct.isPrimary, MasterSupplierProduct.master, MasterSupplierProduct.masterId, MasterSupplierProduct.memo (+85 more)

### Community 5 - "Inventory schema"
Cohesion: 0.03
Nodes (76): No PG native enum, NestJS DTO 는 class-validator, Python agents communicate via DB, Agent pipeline event-driven, No silent model fallback, No $queryRawUnsafe, Panel 도메인 SSE 프론트엔드 예외, Status canonical lifecycle (+68 more)

### Community 6 - "System schema"
Cohesion: 0.03
Nodes (76): System, ActivityEvent.company, ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType (+68 more)

### Community 7 - "Advertising schema"
Cohesion: 0.03
Nodes (75): Advertising, AdAction.actionType, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.company, AdAction.createdAt (+67 more)

### Community 8 - "Core schema"
Cohesion: 0.03
Nodes (75): Ad.optionId, BundleComponent.bundleOption, BundleComponent.bundleOptionId, BundleComponent.company, BundleComponent.componentOption, BundleComponent.componentOptionId, BundleComponent.createdAt, BundleComponent.id (+67 more)

### Community 9 - "Inventory schema"
Cohesion: 0.03
Nodes (70): Shipment.company, Shipment.courierCode, Shipment.courierName, Shipment.createdAt, Shipment.deliveredAt, Shipment.deliveryDays, Shipment.id, Shipment.listing (+62 more)

### Community 10 - "Agents schema"
Cohesion: 0.04
Nodes (56): AgentDefinition.marketplaceId, Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon (+48 more)

### Community 11 - "Advertising schema"
Cohesion: 0.04
Nodes (51): Ad.adGroup, Ad.adOptionId, Ad.adProductName, Ad.adType, Ad.billingType, Ad.campaignEndDate, Ad.campaignId, Ad.campaignName (+43 more)

### Community 12 - "Advertising schema"
Cohesion: 0.05
Nodes (40): AdSnapshot.adConversions, AdSnapshot.adRevenue, AdSnapshot.adSpend, AdSnapshot.budget, AdSnapshot.campaignName, AdSnapshot.capturedAt, AdSnapshot.clicks, AdSnapshot.collectedAt (+32 more)

### Community 13 - "AI schema"
Cohesion: 0.06
Nodes (40): ThumbnailGeneration.candidates, ThumbnailGeneration.company, ThumbnailGeneration.createdAt, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.grade, ThumbnailGeneration.id, ThumbnailGeneration.master, ThumbnailGeneration.masterId (+32 more)

### Community 14 - "System schema"
Cohesion: 0.06
Nodes (39): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.company, ActionTask.createdAt, ActionTask.date, ActionTask.detail (+31 more)

### Community 15 - "Orders schema"
Cohesion: 0.07
Nodes (35): OrderLineItem.company, OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.metadata, OrderLineItem.option, OrderLineItem.optionId (+27 more)

### Community 16 - "Inventory schema"
Cohesion: 0.08
Nodes (30): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.option, PickingItem.optionId, PickingItem.pickedAt (+22 more)

### Community 17 - "Agents schema"
Cohesion: 0.09
Nodes (26): AgentLog.createdAt, AgentLog.data, AgentLog.id, AgentLog.level, AgentLog.message, AgentLog.task, AgentLog.taskId, AgentTask.agentType (+18 more)

### Community 18 - "Finance schema"
Cohesion: 0.12
Nodes (20): ProfitLoss.adCost, ProfitLoss.cogs, ProfitLoss.commission, ProfitLoss.company, ProfitLoss.createdAt, ProfitLoss.id, ProfitLoss.listing, ProfitLoss.month (+12 more)

### Community 19 - "Orders schema"
Cohesion: 0.12
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.company, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id (+11 more)

### Community 20 - "Agents schema"
Cohesion: 0.12
Nodes (18): AgentEvent.action, AgentEvent.agent, AgentEvent.agentId, AgentEvent.category, AgentEvent.company, AgentEvent.createdAt, AgentEvent.detail, AgentEvent.eventType (+10 more)

### Community 21 - "Finance schema"
Cohesion: 0.15
Nodes (15): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.company, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.period (+7 more)

### Community 22 - "Inventory schema"
Cohesion: 0.15
Nodes (15): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.company, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items (+7 more)

### Community 23 - "Finance schema"
Cohesion: 0.15
Nodes (14): ManualLedger.amount, ManualLedger.category, ManualLedger.company, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description (+6 more)

### Community 24 - "Orders schema"
Cohesion: 0.15
Nodes (14): CSRecord.assignee, CSRecord.company, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id (+6 more)

### Community 25 - "Core schema"
Cohesion: 0.2
Nodes (12): CategoryMapping.company, CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.isActive, CategoryMapping.keywords (+4 more)

## Knowledge Gaps
- **887 isolated node(s):** `Ad.platform`, `Ad.campaignName`, `Ad.dailyBudget`, `Ad.spend`, `Ad.impressions` (+882 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Core schema` to `Agents schema`, `AI schema`, `Core schema`, `Supply schema`, `Inventory schema`, `System schema`, `Advertising schema`, `Core schema`, `Inventory schema`, `Agents schema`, `Advertising schema`, `Advertising schema`, `AI schema`, `System schema`, `Orders schema`, `Inventory schema`, `Agents schema`, `Finance schema`, `Orders schema`, `Agents schema`, `Finance schema`, `Inventory schema`, `Finance schema`, `Orders schema`, `Core schema`?**
  _High betweenness centrality (0.438) - this node is a cross-community bridge._
- **Why does `Company` connect `Core schema` to `Agents schema`, `AI schema`, `Core schema`, `Supply schema`, `Inventory schema`, `System schema`, `Advertising schema`, `Core schema`, `Inventory schema`, `Agents schema`, `Advertising schema`, `Advertising schema`, `AI schema`, `System schema`, `Orders schema`, `Inventory schema`, `Finance schema`, `Orders schema`, `Agents schema`, `Finance schema`, `Inventory schema`, `Finance schema`, `Orders schema`, `Core schema`?**
  _High betweenness centrality (0.210) - this node is a cross-community bridge._
- **Why does `prisma — Shared Schema` connect `Core schema` to `Agents schema`, `AI schema`, `Core schema`, `Supply schema`, `Inventory schema`, `System schema`, `Advertising schema`, `Core schema`, `Inventory schema`, `Agents schema`, `Advertising schema`, `Advertising schema`, `System schema`, `Orders schema`, `Agents schema`, `Finance schema`, `Orders schema`, `Agents schema`, `Finance schema`, `Finance schema`, `Orders schema`, `Core schema`?**
  _High betweenness centrality (0.158) - this node is a cross-community bridge._
- **What connects `Ad.platform`, `Ad.campaignName`, `Ad.dailyBudget` to the rest of the system?**
  _887 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Agents schema` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `AI schema` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._
- **Should `Core schema` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._