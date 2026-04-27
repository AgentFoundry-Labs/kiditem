# Graph Report - schema-consumers  (2026-04-27)

## Corpus Check
- 92 files · ~53,080 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1675 nodes · 5799 edges · 29 communities detected
- Extraction: 45% EXTRACTED · 55% INFERRED · 0% AMBIGUOUS · INFERRED: 3169 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_code file coupang-client.ts|code file: coupang-client.ts]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file generate-prisma-erd.mjs|code file: generate-prisma-erd.mjs]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_code file channels.module.ts|code file: channels.module.ts]]
- [[_COMMUNITY_code file coupang-date-range.dto.ts|code file: coupang-date-range.dto.ts]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 238 edges
2. `Company` - 170 edges
3. `prisma — Shared Schema` - 131 edges
4. `channels — Coupang 통합 + Sync + Dashboard 도메인` - 113 edges
5. `Ad` - 109 edges
6. `Order` - 77 edges
7. `ProductOption` - 76 edges
8. `MasterProduct` - 71 edges
9. `ChannelListing` - 71 edges
10. `AgentDefinition` - 70 edges
11. `AdSnapshot` - 52 edges
12. `HeartbeatRun` - 46 edges

## Surprising Connections (you probably didn't know these)
- `Database ERD` --mentions_domain--> `Advertising`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_model--> `Ad`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `Ad.companyId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `channels — Coupang 통합 + Sync + Dashboard 도메인` --mentions_field--> `Ad.optionId`  [EXTRACTED]
  apps/server/src/channels/CLAUDE.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_model--> `AdAction`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.companyId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.targetType`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_model--> `AdSnapshot`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma

## Communities

### Community 0 - "Core schema"
Cohesion: 0.05
Nodes (150): externalOptionId canonical option identity, vendorItemId provider term, Database ERD, Ad.listingId, Ad.optionId, AdAction.externalId, AdAction.listingId, AdSnapshot.externalId (+142 more)

### Community 1 - "Agents schema"
Cohesion: 0.01
Nodes (150): packages/shared — @kiditem/shared, Agents, AI, AgentDefinition.actionCap, AgentDefinition.adapterConfig, AgentDefinition.adapterType, AgentDefinition.allowedTools, AgentDefinition.budgetResetAt (+142 more)

### Community 2 - "System schema"
Cohesion: 0.22
Nodes (95): channels — Coupang 통합 + Sync + Dashboard 도메인, prisma — Shared Schema, ActionTask.companyId, ActivityEvent.companyId, Ad.companyId, AdAction.companyId, AdSnapshot.companyId, AgentDefinition.companyId (+87 more)

### Community 3 - "Advertising schema"
Cohesion: 0.02
Nodes (119): Advertising, AdAction.actionType, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.company, AdAction.createdAt (+111 more)

### Community 4 - "Inventory schema"
Cohesion: 0.02
Nodes (111): Inventory, PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.option, PickingItem.pickedAt (+103 more)

### Community 5 - "Core schema"
Cohesion: 0.02
Nodes (101): Core, BundleComponent.bundleOption, BundleComponent.bundleOptionId, BundleComponent.company, BundleComponent.componentOption, BundleComponent.componentOptionId, BundleComponent.createdAt, BundleComponent.id (+93 more)

### Community 6 - "AI schema"
Cohesion: 0.02
Nodes (89): ChannelDashboardService, Thumbnail.clicks, Thumbnail.company, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions (+81 more)

### Community 7 - "Channels schema"
Cohesion: 0.02
Nodes (100): Channels, ChannelListingDailySnapshot.avgRating, ChannelListingDailySnapshot.businessDate, ChannelListingDailySnapshot.categoryRank, ChannelListingDailySnapshot.channel, ChannelListingDailySnapshot.channelPrice, ChannelListingDailySnapshot.company, ChannelListingDailySnapshot.createdAt (+92 more)

### Community 8 - "System schema"
Cohesion: 0.03
Nodes (91): System, ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.company, ActionTask.createdAt, ActionTask.date (+83 more)

### Community 9 - "Supply schema"
Cohesion: 0.03
Nodes (82): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.id, MasterSupplierProduct.isPrimary, MasterSupplierProduct.master, MasterSupplierProduct.memo, MasterSupplierProduct.minOrderQty, MasterSupplierProduct.supplier (+74 more)

### Community 10 - "Finance schema"
Cohesion: 0.03
Nodes (78): Finance, GradeHistory.calculatedAt, GradeHistory.company, GradeHistory.id, GradeHistory.marginScore, GradeHistory.master, GradeHistory.newGrade, GradeHistory.oldGrade (+70 more)

### Community 11 - "Agents schema"
Cohesion: 0.03
Nodes (71): AgentDefinition.marketplaceId, Inventory.company, Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.id, Inventory.lastRestockedAt, Inventory.leadTimeDays (+63 more)

### Community 12 - "Orders schema"
Cohesion: 0.03
Nodes (72): Orders, CSRecord.assignee, CSRecord.company, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType (+64 more)

### Community 13 - "Advertising schema"
Cohesion: 0.03
Nodes (66): AppException, Ad.adGroup, Ad.adOptionId, Ad.adProductName, Ad.adType, Ad.billingType, Ad.campaignEndDate, Ad.campaignId (+58 more)

### Community 14 - "code file: coupang-client.ts"
Cohesion: 0.14
Nodes (17): ChannelSyncService, formatKstIso(), coupangRequest(), generateAuthorization(), getEnvOrThrow(), getVendorId(), approveReturn(), confirmOrderSheets() (+9 more)

### Community 15 - "Community 15"
Cohesion: 0.13
Nodes (23): add_code_reference_edges(), add_document_mentions(), add_schema_graph(), camel(), collect_block(), collect_code(), collect_doc_comments(), community_labels() (+15 more)

### Community 16 - "System schema"
Cohesion: 0.1
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.company, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description (+13 more)

### Community 17 - "Orders schema"
Cohesion: 0.12
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.company, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id (+11 more)

### Community 18 - "code file: generate-prisma-erd.mjs"
Cohesion: 0.2
Nodes (17): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), extractDocValue(), extractRelationFields(), generateErdMarkdown(), generateMermaidErDiagram() (+9 more)

### Community 19 - "Inventory schema"
Cohesion: 0.12
Nodes (18): ReturnTransfer.company, ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.notes, ReturnTransfer.option (+10 more)

### Community 20 - "Advertising schema"
Cohesion: 0.15
Nodes (16): TrafficStats.cartAdds, TrafficStats.company, TrafficStats.conversionRate, TrafficStats.createdAt, TrafficStats.date, TrafficStats.id, TrafficStats.listing, TrafficStats.orders (+8 more)

### Community 21 - "AI schema"
Cohesion: 0.13
Nodes (16): ContentGeneration.company, ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.generatedDescription, ContentGeneration.generatedTitle, ContentGeneration.id (+8 more)

### Community 22 - "Community 22"
Cohesion: 0.36
Nodes (1): ChannelDashboardController

### Community 23 - "Community 23"
Cohesion: 0.33
Nodes (1): ChannelSyncController

### Community 24 - "Community 24"
Cohesion: 0.33
Nodes (6): log(), main(), toDecimal(), toInt(), toTimestamptz(), toUUID()

### Community 25 - "Community 25"
Cohesion: 0.4
Nodes (5): makeEvent(), makeHeartbeat(), makeLog(), makeTask(), makeTrace()

### Community 26 - "Community 26"
Cohesion: 0.4
Nodes (5): main(), parse_schema(), Return (header_block_lines, dict[model_name -> block_lines]).      header = gene, Inject `/// @namespace <ns>` and optional `/// @describe <text>` above the model, render_model()

### Community 27 - "code file: channels.module.ts"
Cohesion: 1.0
Nodes (1): ChannelsModule

### Community 28 - "code file: coupang-date-range.dto.ts"
Cohesion: 1.0
Nodes (1): CoupangDateRangeQueryDto

## Knowledge Gaps
- **967 isolated node(s):** `Ad.platform`, `Ad.campaignName`, `Ad.dailyBudget`, `Ad.spend`, `Ad.impressions` (+962 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 22`** (9 nodes): `ChannelDashboardController`, `.constructor()`, `.getProductRanking()`, `.getReturnFaultSplit()`, `.getReturnReasonBreakdown()`, `.getReturnSummary()`, `.getRevenueTrend()`, `.getSummary()`, `.resolveDateRange()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (6 nodes): `ChannelSyncController`, `.checkHealth()`, `.constructor()`, `.syncInventory()`, `.syncOrders()`, `.syncProducts()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `code file: channels.module.ts`** (2 nodes): `channels.module.ts`, `ChannelsModule`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `code file: coupang-date-range.dto.ts`** (2 nodes): `coupang-date-range.dto.ts`, `CoupangDateRangeQueryDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Core schema` to `Agents schema`, `System schema`, `Advertising schema`, `Inventory schema`, `Core schema`, `AI schema`, `Channels schema`, `System schema`, `Supply schema`, `Finance schema`, `Agents schema`, `Orders schema`, `Advertising schema`, `System schema`, `Orders schema`, `Inventory schema`, `Advertising schema`, `AI schema`?**
  _High betweenness centrality (0.246) - this node is a cross-community bridge._
- **Why does `Company` connect `System schema` to `Core schema`, `Agents schema`, `Advertising schema`, `Inventory schema`, `Core schema`, `AI schema`, `Channels schema`, `System schema`, `Supply schema`, `Finance schema`, `Agents schema`, `Orders schema`, `Advertising schema`, `code file: coupang-client.ts`, `System schema`, `Orders schema`, `Inventory schema`, `Advertising schema`, `AI schema`?**
  _High betweenness centrality (0.171) - this node is a cross-community bridge._
- **Why does `Ad` connect `Advertising schema` to `Core schema`, `System schema`, `Advertising schema`, `Inventory schema`, `Core schema`, `AI schema`, `System schema`, `Agents schema`, `code file: coupang-client.ts`, `code file: generate-prisma-erd.mjs`?**
  _High betweenness centrality (0.118) - this node is a cross-community bridge._
- **Are the 42 inferred relationships involving `Company` (e.g. with `order-sync.pg.integration.spec.ts` and `orders.ts`) actually correct?**
  _`Company` has 42 INFERRED edges - model-reasoned connections that need verification._
- **Are the 50 inferred relationships involving `Ad` (e.g. with `order-sync.pg.integration.spec.ts` and `coupang-client.ts`) actually correct?**
  _`Ad` has 50 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Ad.platform`, `Ad.campaignName`, `Ad.dailyBudget` to the rest of the system?**
  _967 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core schema` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._