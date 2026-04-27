# Graph Report - schema-consumers  (2026-04-27)

## Corpus Check
- 93 files · ~55,417 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1646 nodes · 5782 edges · 27 communities detected
- Extraction: 45% EXTRACTED · 55% INFERRED · 0% AMBIGUOUS · INFERRED: 3157 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_code file coupang-client.ts|code file: coupang-client.ts]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_code file generate-prisma-erd.mjs|code file: generate-prisma-erd.mjs]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_code file app-exception.ts|code file: app-exception.ts]]
- [[_COMMUNITY_code file channels.module.ts|code file: channels.module.ts]]
- [[_COMMUNITY_code file coupang-date-range.dto.ts|code file: coupang-date-range.dto.ts]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 232 edges
2. `Company` - 167 edges
3. `channels — Coupang 통합 + Sync + Dashboard 도메인` - 141 edges
4. `prisma — Shared Schema` - 131 edges
5. `Order` - 79 edges
6. `ProductOption` - 75 edges
7. `MasterProduct` - 72 edges
8. `AgentDefinition` - 70 edges
9. `ChannelListing` - 67 edges
10. `ChannelListingDailySnapshot` - 65 edges
11. `ChannelAdTargetDailySnapshot` - 52 edges
12. `HeartbeatRun` - 46 edges

## Surprising Connections (you probably didn't know these)
- `Database ERD` --mentions_domain--> `Advertising`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `channels — Coupang 통합 + Sync + Dashboard 도메인` --mentions_domain--> `Advertising`  [EXTRACTED]
  apps/server/src/channels/CLAUDE.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_model--> `AdAction`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.companyId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `channels — Coupang 통합 + Sync + Dashboard 도메인` --mentions_field--> `AdAction.companyId`  [EXTRACTED]
  apps/server/src/channels/CLAUDE.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.targetType`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_model--> `ScrapeTarget`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `ScrapeTarget.companyId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma

## Communities

### Community 0 - "Core schema"
Cohesion: 0.05
Nodes (165): externalOptionId canonical option identity, vendorItemId provider term, channels — Coupang 통합 + Sync + Dashboard 도메인, Database ERD, AdAction.externalId, AdAction.listingId, AgentDefinition.isActive, CategoryMapping.isActive (+157 more)

### Community 1 - "Agents schema"
Cohesion: 0.01
Nodes (150): packages/shared — @kiditem/shared, Agents, AI, AgentDefinition.actionCap, AgentDefinition.adapterConfig, AgentDefinition.adapterType, AgentDefinition.allowedTools, AgentDefinition.budgetResetAt (+142 more)

### Community 2 - "Channels schema"
Cohesion: 0.02
Nodes (148): Channels, ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.company, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+140 more)

### Community 3 - "Inventory schema"
Cohesion: 0.02
Nodes (112): Inventory, PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.option, PickingItem.pickedAt (+104 more)

### Community 4 - "Advertising schema"
Cohesion: 0.02
Nodes (108): Advertising, AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson (+100 more)

### Community 5 - "Core schema"
Cohesion: 0.31
Nodes (70): prisma — Shared Schema, ActionTask.companyId, ActivityEvent.companyId, AdAction.companyId, AgentDefinition.companyId, AgentEvent.companyId, AgentTask.companyId, AgentWakeupRequest.companyId (+62 more)

### Community 6 - "Supply schema"
Cohesion: 0.03
Nodes (84): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.id, MasterSupplierProduct.isPrimary, MasterSupplierProduct.master, MasterSupplierProduct.memo, MasterSupplierProduct.minOrderQty, MasterSupplierProduct.supplier (+76 more)

### Community 7 - "System schema"
Cohesion: 0.03
Nodes (73): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.company, ActionTask.createdAt, ActionTask.date, ActionTask.detail (+65 more)

### Community 8 - "Orders schema"
Cohesion: 0.03
Nodes (80): Orders, CSRecord.assignee, CSRecord.company, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType (+72 more)

### Community 9 - "Finance schema"
Cohesion: 0.03
Nodes (78): Finance, GradeHistory.calculatedAt, GradeHistory.company, GradeHistory.id, GradeHistory.marginScore, GradeHistory.master, GradeHistory.newGrade, GradeHistory.oldGrade (+70 more)

### Community 10 - "AI schema"
Cohesion: 0.03
Nodes (73): Thumbnail.clicks, Thumbnail.company, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions, Thumbnail.listing (+65 more)

### Community 11 - "Agents schema"
Cohesion: 0.03
Nodes (71): AgentDefinition.marketplaceId, Inventory.company, Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.id, Inventory.lastRestockedAt, Inventory.leadTimeDays (+63 more)

### Community 12 - "AI schema"
Cohesion: 0.03
Nodes (69): ContentGeneration.company, ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.generatedDescription, ContentGeneration.generatedTitle, ContentGeneration.id (+61 more)

### Community 13 - "System schema"
Cohesion: 0.04
Nodes (64): System, ActivityEvent.company, ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType (+56 more)

### Community 14 - "code file: coupang-client.ts"
Cohesion: 0.07
Nodes (33): ChannelDashboardService, ChannelSyncService, formatKstIso(), coupangRequest(), generateAuthorization(), getEnvOrThrow(), getVendorId(), main() (+25 more)

### Community 15 - "Orders schema"
Cohesion: 0.05
Nodes (44): Order.company, Order.createdAt, Order.customerName, Order.deliveredAt, Order.externalNumber, Order.externalOrderId, Order.id, Order.listing (+36 more)

### Community 16 - "Community 16"
Cohesion: 0.13
Nodes (23): add_code_reference_edges(), add_document_mentions(), add_schema_graph(), camel(), collect_block(), collect_code(), collect_doc_comments(), community_labels() (+15 more)

### Community 17 - "Core schema"
Cohesion: 0.1
Nodes (24): Core, BundleComponent.bundleOption, BundleComponent.bundleOptionId, BundleComponent.company, BundleComponent.componentOption, BundleComponent.componentOptionId, BundleComponent.createdAt, BundleComponent.id (+16 more)

### Community 18 - "code file: generate-prisma-erd.mjs"
Cohesion: 0.2
Nodes (17): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), extractDocValue(), extractRelationFields(), generateErdMarkdown(), generateMermaidErDiagram() (+9 more)

### Community 19 - "Community 19"
Cohesion: 0.36
Nodes (1): ChannelDashboardController

### Community 20 - "Community 20"
Cohesion: 0.33
Nodes (1): ChannelSyncController

### Community 21 - "Community 21"
Cohesion: 0.33
Nodes (6): log(), main(), toDecimal(), toInt(), toTimestamptz(), toUUID()

### Community 22 - "Community 22"
Cohesion: 0.4
Nodes (5): makeEvent(), makeHeartbeat(), makeLog(), makeTask(), makeTrace()

### Community 23 - "Community 23"
Cohesion: 0.4
Nodes (5): main(), parse_schema(), Return (header_block_lines, dict[model_name -> block_lines]).      header = gene, Inject `/// @namespace <ns>` and optional `/// @describe <text>` above the model, render_model()

### Community 24 - "code file: app-exception.ts"
Cohesion: 0.67
Nodes (1): AppException

### Community 25 - "code file: channels.module.ts"
Cohesion: 1.0
Nodes (1): ChannelsModule

### Community 26 - "code file: coupang-date-range.dto.ts"
Cohesion: 1.0
Nodes (1): CoupangDateRangeQueryDto

## Knowledge Gaps
- **934 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+929 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 19`** (9 nodes): `ChannelDashboardController`, `.constructor()`, `.getProductRanking()`, `.getReturnFaultSplit()`, `.getReturnReasonBreakdown()`, `.getReturnSummary()`, `.getRevenueTrend()`, `.getSummary()`, `.resolveDateRange()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (6 nodes): `ChannelSyncController`, `.checkHealth()`, `.constructor()`, `.syncInventory()`, `.syncOrders()`, `.syncProducts()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `code file: app-exception.ts`** (3 nodes): `AppException`, `.constructor()`, `app-exception.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `code file: channels.module.ts`** (2 nodes): `channels.module.ts`, `ChannelsModule`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `code file: coupang-date-range.dto.ts`** (2 nodes): `coupang-date-range.dto.ts`, `CoupangDateRangeQueryDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Core schema` to `Agents schema`, `Channels schema`, `Inventory schema`, `Advertising schema`, `Core schema`, `Supply schema`, `System schema`, `Orders schema`, `Finance schema`, `AI schema`, `Agents schema`, `AI schema`, `System schema`, `Orders schema`, `Core schema`?**
  _High betweenness centrality (0.252) - this node is a cross-community bridge._
- **Why does `Company` connect `Core schema` to `Core schema`, `Agents schema`, `Channels schema`, `Inventory schema`, `Advertising schema`, `Supply schema`, `System schema`, `Orders schema`, `Finance schema`, `AI schema`, `Agents schema`, `AI schema`, `System schema`, `code file: coupang-client.ts`, `Orders schema`, `Core schema`?**
  _High betweenness centrality (0.196) - this node is a cross-community bridge._
- **Why does `prisma — Shared Schema` connect `Core schema` to `Core schema`, `Agents schema`, `Channels schema`, `Inventory schema`, `Advertising schema`, `Supply schema`, `System schema`, `Orders schema`, `Finance schema`, `AI schema`, `Agents schema`, `AI schema`, `System schema`, `Orders schema`, `Core schema`?**
  _High betweenness centrality (0.111) - this node is a cross-community bridge._
- **Are the 43 inferred relationships involving `Company` (e.g. with `order-sync.pg.integration.spec.ts` and `product-sync.pg.integration.spec.ts`) actually correct?**
  _`Company` has 43 INFERRED edges - model-reasoned connections that need verification._
- **Are the 40 inferred relationships involving `Order` (e.g. with `order-sync.pg.integration.spec.ts` and `product-sync.pg.integration.spec.ts`) actually correct?**
  _`Order` has 40 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason` to the rest of the system?**
  _934 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core schema` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._