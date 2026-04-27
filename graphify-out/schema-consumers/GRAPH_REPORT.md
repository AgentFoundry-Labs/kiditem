# Graph Report - schema-consumers  (2026-04-27)

## Corpus Check
- 93 files · ~56,104 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1774 nodes · 6258 edges · 28 communities detected
- Extraction: 45% EXTRACTED · 55% INFERRED · 0% AMBIGUOUS · INFERRED: 3439 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_code file coupang-client.ts|code file: coupang-client.ts]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_code file generate-prisma-erd.mjs|code file: generate-prisma-erd.mjs]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_code file channels.module.ts|code file: channels.module.ts]]
- [[_COMMUNITY_code file coupang-date-range.dto.ts|code file: coupang-date-range.dto.ts]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 248 edges
2. `Company` - 175 edges
3. `channels — Coupang 통합 + Sync + Dashboard 도메인` - 154 edges
4. `prisma — Shared Schema` - 139 edges
5. `Ad` - 111 edges
6. `ProductOption` - 79 edges
7. `Order` - 78 edges
8. `ChannelListing` - 75 edges
9. `MasterProduct` - 72 edges
10. `AgentDefinition` - 70 edges
11. `ChannelListingDailySnapshot` - 65 edges
12. `AdSnapshot` - 52 edges

## Surprising Connections (you probably didn't know these)
- `Database ERD` --mentions_domain--> `Advertising`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `channels — Coupang 통합 + Sync + Dashboard 도메인` --mentions_domain--> `Advertising`  [EXTRACTED]
  apps/server/src/channels/CLAUDE.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_model--> `Ad`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `channels — Coupang 통합 + Sync + Dashboard 도메인` --mentions_model--> `Ad`  [EXTRACTED]
  apps/server/src/channels/CLAUDE.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `Ad.companyId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `channels — Coupang 통합 + Sync + Dashboard 도메인` --mentions_field--> `Ad.companyId`  [EXTRACTED]
  apps/server/src/channels/CLAUDE.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_model--> `AdAction`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.companyId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma

## Communities

### Community 0 - "Channels schema"
Cohesion: 0.01
Nodes (184): Channels, ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.company, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+176 more)

### Community 1 - "Core schema"
Cohesion: 0.06
Nodes (144): externalOptionId canonical option identity, vendorItemId provider term, channels — Coupang 통합 + Sync + Dashboard 도메인, Database ERD, Ad.listingId, Ad.optionId, AdAction.externalId, AdAction.listingId (+136 more)

### Community 2 - "Agents schema"
Cohesion: 0.01
Nodes (150): packages/shared — @kiditem/shared, Agents, AI, AgentDefinition.actionCap, AgentDefinition.adapterConfig, AgentDefinition.adapterType, AgentDefinition.allowedTools, AgentDefinition.budgetResetAt (+142 more)

### Community 3 - "Advertising schema"
Cohesion: 0.02
Nodes (121): Advertising, AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson (+113 more)

### Community 4 - "Core schema"
Cohesion: 0.25
Nodes (87): prisma — Shared Schema, ActionTask.companyId, ActivityEvent.companyId, Ad.companyId, AdAction.companyId, AdSnapshot.companyId, AgentDefinition.companyId, AgentEvent.companyId (+79 more)

### Community 5 - "Inventory schema"
Cohesion: 0.02
Nodes (112): Inventory, PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.option, PickingItem.pickedAt (+104 more)

### Community 6 - "AI schema"
Cohesion: 0.02
Nodes (90): AppException, Ad.adGroup, Ad.adOptionId, Ad.adProductName, Ad.adType, Ad.billingType, Ad.campaignEndDate, Ad.campaignId (+82 more)

### Community 7 - "Orders schema"
Cohesion: 0.03
Nodes (84): CSRecord.assignee, CSRecord.company, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id (+76 more)

### Community 8 - "Orders schema"
Cohesion: 0.03
Nodes (83): Orders, OrderLineItem.company, OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.metadata, OrderLineItem.option (+75 more)

### Community 9 - "Supply schema"
Cohesion: 0.03
Nodes (82): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.id, MasterSupplierProduct.isPrimary, MasterSupplierProduct.master, MasterSupplierProduct.memo, MasterSupplierProduct.minOrderQty, MasterSupplierProduct.supplier (+74 more)

### Community 10 - "System schema"
Cohesion: 0.04
Nodes (69): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.company, ActionTask.createdAt, ActionTask.date, ActionTask.detail (+61 more)

### Community 11 - "AI schema"
Cohesion: 0.03
Nodes (70): ContentGeneration.company, ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.generatedDescription, ContentGeneration.generatedTitle, ContentGeneration.id (+62 more)

### Community 12 - "System schema"
Cohesion: 0.04
Nodes (64): System, ActivityEvent.company, ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType (+56 more)

### Community 13 - "Finance schema"
Cohesion: 0.04
Nodes (63): Finance, GradeHistory.calculatedAt, GradeHistory.company, GradeHistory.id, GradeHistory.marginScore, GradeHistory.master, GradeHistory.newGrade, GradeHistory.oldGrade (+55 more)

### Community 14 - "Agents schema"
Cohesion: 0.04
Nodes (55): AgentDefinition.marketplaceId, Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon (+47 more)

### Community 15 - "code file: coupang-client.ts"
Cohesion: 0.06
Nodes (38): ChannelDashboardService, ChannelSyncService, formatKstIso(), coupangRequest(), generateAuthorization(), getEnvOrThrow(), getVendorId(), planKiditemImport() (+30 more)

### Community 16 - "AI schema"
Cohesion: 0.06
Nodes (39): ThumbnailGeneration.candidates, ThumbnailGeneration.company, ThumbnailGeneration.createdAt, ThumbnailGeneration.editAnalysis, ThumbnailGeneration.grade, ThumbnailGeneration.id, ThumbnailGeneration.master, ThumbnailGeneration.method (+31 more)

### Community 17 - "Community 17"
Cohesion: 0.13
Nodes (23): add_code_reference_edges(), add_document_mentions(), add_schema_graph(), camel(), collect_block(), collect_code(), collect_doc_comments(), community_labels() (+15 more)

### Community 18 - "Core schema"
Cohesion: 0.1
Nodes (24): Core, BundleComponent.bundleOption, BundleComponent.bundleOptionId, BundleComponent.company, BundleComponent.componentOption, BundleComponent.componentOptionId, BundleComponent.createdAt, BundleComponent.id (+16 more)

### Community 19 - "code file: generate-prisma-erd.mjs"
Cohesion: 0.2
Nodes (17): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), extractDocValue(), extractRelationFields(), generateErdMarkdown(), generateMermaidErDiagram() (+9 more)

### Community 20 - "Advertising schema"
Cohesion: 0.15
Nodes (16): TrafficStats.cartAdds, TrafficStats.company, TrafficStats.conversionRate, TrafficStats.createdAt, TrafficStats.date, TrafficStats.id, TrafficStats.listing, TrafficStats.orders (+8 more)

### Community 21 - "Community 21"
Cohesion: 0.36
Nodes (1): ChannelDashboardController

### Community 22 - "Community 22"
Cohesion: 0.33
Nodes (1): ChannelSyncController

### Community 23 - "Community 23"
Cohesion: 0.33
Nodes (6): log(), main(), toDecimal(), toInt(), toTimestamptz(), toUUID()

### Community 24 - "Community 24"
Cohesion: 0.4
Nodes (5): makeEvent(), makeHeartbeat(), makeLog(), makeTask(), makeTrace()

### Community 25 - "Community 25"
Cohesion: 0.4
Nodes (5): main(), parse_schema(), Return (header_block_lines, dict[model_name -> block_lines]).      header = gene, Inject `/// @namespace <ns>` and optional `/// @describe <text>` above the model, render_model()

### Community 26 - "code file: channels.module.ts"
Cohesion: 1.0
Nodes (1): ChannelsModule

### Community 27 - "code file: coupang-date-range.dto.ts"
Cohesion: 1.0
Nodes (1): CoupangDateRangeQueryDto

## Knowledge Gaps
- **1034 isolated node(s):** `Ad.platform`, `Ad.campaignName`, `Ad.dailyBudget`, `Ad.spend`, `Ad.impressions` (+1029 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 21`** (9 nodes): `ChannelDashboardController`, `.constructor()`, `.getProductRanking()`, `.getReturnFaultSplit()`, `.getReturnReasonBreakdown()`, `.getReturnSummary()`, `.getRevenueTrend()`, `.getSummary()`, `.resolveDateRange()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (6 nodes): `ChannelSyncController`, `.checkHealth()`, `.constructor()`, `.syncInventory()`, `.syncOrders()`, `.syncProducts()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `code file: channels.module.ts`** (2 nodes): `channels.module.ts`, `ChannelsModule`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `code file: coupang-date-range.dto.ts`** (2 nodes): `coupang-date-range.dto.ts`, `CoupangDateRangeQueryDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Core schema` to `Channels schema`, `Agents schema`, `Advertising schema`, `Core schema`, `Inventory schema`, `AI schema`, `Orders schema`, `Orders schema`, `Supply schema`, `System schema`, `AI schema`, `System schema`, `Finance schema`, `Agents schema`, `AI schema`, `Core schema`, `Advertising schema`?**
  _High betweenness centrality (0.240) - this node is a cross-community bridge._
- **Why does `Company` connect `Core schema` to `Channels schema`, `Core schema`, `Agents schema`, `Advertising schema`, `Inventory schema`, `AI schema`, `Orders schema`, `Orders schema`, `Supply schema`, `System schema`, `AI schema`, `System schema`, `Finance schema`, `Agents schema`, `code file: coupang-client.ts`, `AI schema`, `Core schema`, `Advertising schema`?**
  _High betweenness centrality (0.168) - this node is a cross-community bridge._
- **Why does `prisma — Shared Schema` connect `Core schema` to `Channels schema`, `Core schema`, `Agents schema`, `Advertising schema`, `Inventory schema`, `AI schema`, `Orders schema`, `Orders schema`, `Supply schema`, `System schema`, `AI schema`, `System schema`, `Finance schema`, `Agents schema`, `Core schema`, `Advertising schema`?**
  _High betweenness centrality (0.109) - this node is a cross-community bridge._
- **Are the 43 inferred relationships involving `Company` (e.g. with `order-sync.pg.integration.spec.ts` and `product-sync.pg.integration.spec.ts`) actually correct?**
  _`Company` has 43 INFERRED edges - model-reasoned connections that need verification._
- **Are the 51 inferred relationships involving `Ad` (e.g. with `order-sync.pg.integration.spec.ts` and `product-sync.pg.integration.spec.ts`) actually correct?**
  _`Ad` has 51 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Ad.platform`, `Ad.campaignName`, `Ad.dailyBudget` to the rest of the system?**
  _1034 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Channels schema` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._