# Graph Report - schema-consumers  (2026-04-26)

## Corpus Check
- 111 files · ~62,572 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1567 nodes · 6124 edges · 33 communities detected
- Extraction: 53% EXTRACTED · 47% INFERRED · 0% AMBIGUOUS · INFERRED: 2890 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_code file coupang-client.ts|code file: coupang-client.ts]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file generate-prisma-erd.mjs|code file: generate-prisma-erd.mjs]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_code file coupang-date-range.dto.ts|code file: coupang-date-range.dto.ts]]
- [[_COMMUNITY_code file channels.module.ts|code file: channels.module.ts]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 215 edges
2. `Company` - 162 edges
3. `prisma — Shared Schema` - 125 edges
4. `Ad` - 110 edges
5. `channels — Coupang 통합 + Sync + Dashboard 도메인` - 103 edges
6. `Order schema channel-agnostic unification` - 89 edges
7. `Order` - 86 edges
8. `profit-loss Live Aggregation (ProfitLoss Table Bypass)` - 86 edges
9. `Dashboard IDOR Sweep + $queryRaw Tenancy Guarantee` - 75 edges
10. `MasterProduct` - 74 edges
11. `ProductOption` - 74 edges
12. `AgentDefinition` - 70 edges

## Surprising Connections (you probably didn't know these)
- `Secret scrub — write / read / backfill` --mentions_domain--> `Advertising`  [EXTRACTED]
  .claude/docs/decisions/0007-secret-scrub-write-and-read.md → prisma/models/advertising.prisma
- `profit-loss Live Aggregation (ProfitLoss Table Bypass)` --mentions_domain--> `Advertising`  [EXTRACTED]
  .claude/docs/decisions/0016-profit-loss-live-aggregation.md → prisma/models/advertising.prisma
- `Business-domain scoped session boundary` --mentions_domain--> `Advertising`  [EXTRACTED]
  .claude/docs/decisions/0019-business-domain-scoped-session-boundary.md → prisma/models/advertising.prisma
- `Channel Option External ID Naming` --mentions_domain--> `Advertising`  [EXTRACTED]
  .claude/docs/decisions/0020-channel-option-external-id.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_domain--> `Advertising`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Meta: 왜 ADR 을 쓰는가` --mentions_model--> `Ad`  [EXTRACTED]
  .claude/docs/decisions/0000-meta-why-adr.md → prisma/models/advertising.prisma
- `profit-loss Live Aggregation (ProfitLoss Table Bypass)` --mentions_model--> `Ad`  [EXTRACTED]
  .claude/docs/decisions/0016-profit-loss-live-aggregation.md → prisma/models/advertising.prisma
- `Channel Option External ID Naming` --mentions_model--> `Ad`  [EXTRACTED]
  .claude/docs/decisions/0020-channel-option-external-id.md → prisma/models/advertising.prisma

## Communities

### Community 0 - "System schema"
Cohesion: 0.01
Nodes (177): No PG native enum, NestJS DTO 는 class-validator, Python agents communicate via DB, Agent pipeline event-driven, No silent model fallback, No $queryRawUnsafe, Panel 도메인 SSE 프론트엔드 예외, Status canonical lifecycle (+169 more)

### Community 1 - "Core schema"
Cohesion: 0.05
Nodes (157): externalOptionId canonical option identity, vendorItemId provider term, channels — Coupang 통합 + Sync + Dashboard 도메인, Database ERD, Ad.listingId, Ad.optionId, AdAction.externalId, AdAction.listingId (+149 more)

### Community 2 - "Agents schema"
Cohesion: 0.02
Nodes (121): AgentDefinition.actionCap, AgentDefinition.adapterConfig, AgentDefinition.adapterType, AgentDefinition.allowedTools, AgentDefinition.budgetResetAt, AgentDefinition.company, AgentDefinition.contextStrategy, AgentDefinition.createdAt (+113 more)

### Community 3 - "Core schema"
Cohesion: 0.39
Nodes (75): Meta: 왜 ADR 을 쓰는가, Authenticated company scope, Secret scrub — write / read / backfill, Admin role-gated observability, Product schema 3-layer redesign (non-coexistence), Order schema channel-agnostic unification, profit-loss Live Aggregation (ProfitLoss Table Bypass), returnRate Semantic Unification + Orphan Return Policy (+67 more)

### Community 4 - "Supply schema"
Cohesion: 0.02
Nodes (103): GradeHistory.calculatedAt, GradeHistory.company, GradeHistory.id, GradeHistory.marginScore, GradeHistory.master, GradeHistory.newGrade, GradeHistory.oldGrade, GradeHistory.reason (+95 more)

### Community 5 - "Inventory schema"
Cohesion: 0.02
Nodes (96): CategoryMapping.company, CategoryMapping.coupangCategoryId, CategoryMapping.coupangCategoryName, CategoryMapping.createdAt, CategoryMapping.id, CategoryMapping.internalCategory, CategoryMapping.keywords, CategoryMapping.updatedAt (+88 more)

### Community 6 - "Advertising schema"
Cohesion: 0.02
Nodes (99): AdAction.actionType, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson, AdAction.company, AdAction.createdAt, AdAction.currentValue (+91 more)

### Community 7 - "Advertising schema"
Cohesion: 0.02
Nodes (77): AppException, Ad.adGroup, Ad.adOptionId, Ad.adProductName, Ad.adType, Ad.billingType, Ad.campaignEndDate, Ad.campaignId (+69 more)

### Community 8 - "System schema"
Cohesion: 0.04
Nodes (69): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.company, ActionTask.createdAt, ActionTask.date, ActionTask.detail (+61 more)

### Community 9 - "AI schema"
Cohesion: 0.04
Nodes (58): ThumbnailAnalysis.company, ThumbnailAnalysis.complianceAnalyzedAt, ThumbnailAnalysis.complianceGrade, ThumbnailAnalysis.complianceScores, ThumbnailAnalysis.createdAt, ThumbnailAnalysis.grade, ThumbnailAnalysis.id, ThumbnailAnalysis.imageSpec (+50 more)

### Community 10 - "Agents schema"
Cohesion: 0.04
Nodes (55): AgentDefinition.marketplaceId, Marketplace.adapterType, Marketplace.category, Marketplace.configurableParams, Marketplace.createdAt, Marketplace.description, Marketplace.edgesJson, Marketplace.icon (+47 more)

### Community 11 - "Supply schema"
Cohesion: 0.05
Nodes (47): PurchaseOrder.company, PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.id (+39 more)

### Community 12 - "AI schema"
Cohesion: 0.06
Nodes (36): ChannelDashboardService, Thumbnail.clicks, Thumbnail.company, Thumbnail.createdAt, Thumbnail.ctr, Thumbnail.id, Thumbnail.imageUrl, Thumbnail.impressions (+28 more)

### Community 13 - "Finance schema"
Cohesion: 0.07
Nodes (29): SalesPlan.actualOrders, SalesPlan.actualProfit, SalesPlan.actualRevenue, SalesPlan.company, SalesPlan.createdAt, SalesPlan.id, SalesPlan.notes, SalesPlan.period (+21 more)

### Community 14 - "Inventory schema"
Cohesion: 0.08
Nodes (29): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.option, PickingItem.pickedAt, PickingItem.pickingList (+21 more)

### Community 15 - "code file: coupang-client.ts"
Cohesion: 0.14
Nodes (17): ChannelSyncService, formatKstIso(), coupangRequest(), generateAuthorization(), getEnvOrThrow(), getVendorId(), approveReturn(), confirmOrderSheets() (+9 more)

### Community 16 - "Community 16"
Cohesion: 0.13
Nodes (23): add_code_reference_edges(), add_document_mentions(), add_schema_graph(), camel(), collect_block(), collect_code(), collect_doc_comments(), community_labels() (+15 more)

### Community 17 - "Orders schema"
Cohesion: 0.11
Nodes (21): OrderReturn.company, OrderReturn.completedAt, OrderReturn.createdAt, OrderReturn.enclosePrice, OrderReturn.externalReturnId, OrderReturn.faultBy, OrderReturn.id, OrderReturn.metadata (+13 more)

### Community 18 - "System schema"
Cohesion: 0.1
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.company, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description (+13 more)

### Community 19 - "Orders schema"
Cohesion: 0.12
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.company, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id (+11 more)

### Community 20 - "code file: generate-prisma-erd.mjs"
Cohesion: 0.2
Nodes (17): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), extractDocValue(), extractRelationFields(), generateErdMarkdown(), generateMermaidErDiagram() (+9 more)

### Community 21 - "Inventory schema"
Cohesion: 0.12
Nodes (18): ReturnTransfer.company, ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty, ReturnTransfer.id, ReturnTransfer.notes, ReturnTransfer.option (+10 more)

### Community 22 - "Advertising schema"
Cohesion: 0.15
Nodes (16): TrafficStats.cartAdds, TrafficStats.company, TrafficStats.conversionRate, TrafficStats.createdAt, TrafficStats.date, TrafficStats.id, TrafficStats.listing, TrafficStats.orders (+8 more)

### Community 23 - "AI schema"
Cohesion: 0.13
Nodes (16): ContentGeneration.company, ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.generatedDescription, ContentGeneration.generatedTitle, ContentGeneration.id (+8 more)

### Community 24 - "Orders schema"
Cohesion: 0.15
Nodes (14): CSRecord.assignee, CSRecord.company, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType, CSRecord.id (+6 more)

### Community 25 - "Core schema"
Cohesion: 0.21
Nodes (12): BundleComponent.bundleOption, BundleComponent.bundleOptionId, BundleComponent.company, BundleComponent.componentOption, BundleComponent.componentOptionId, BundleComponent.createdAt, BundleComponent.id, BundleComponent.qty (+4 more)

### Community 26 - "Community 26"
Cohesion: 0.36
Nodes (1): ChannelDashboardController

### Community 27 - "Community 27"
Cohesion: 0.33
Nodes (1): ChannelSyncController

### Community 28 - "Community 28"
Cohesion: 0.33
Nodes (6): log(), main(), toDecimal(), toInt(), toTimestamptz(), toUUID()

### Community 29 - "Community 29"
Cohesion: 0.4
Nodes (5): makeEvent(), makeHeartbeat(), makeLog(), makeTask(), makeTrace()

### Community 30 - "Community 30"
Cohesion: 0.4
Nodes (5): main(), parse_schema(), Return (header_block_lines, dict[model_name -> block_lines]).      header = gene, Inject `/// @namespace <ns>` and optional `/// @describe <text>` above the model, render_model()

### Community 31 - "code file: coupang-date-range.dto.ts"
Cohesion: 1.0
Nodes (1): CoupangDateRangeQueryDto

### Community 32 - "code file: channels.module.ts"
Cohesion: 1.0
Nodes (1): ChannelsModule

## Knowledge Gaps
- **891 isolated node(s):** `Ad.platform`, `Ad.campaignName`, `Ad.dailyBudget`, `Ad.spend`, `Ad.impressions` (+886 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 26`** (9 nodes): `ChannelDashboardController`, `.constructor()`, `.getProductRanking()`, `.getReturnFaultSplit()`, `.getReturnReasonBreakdown()`, `.getReturnSummary()`, `.getRevenueTrend()`, `.getSummary()`, `.resolveDateRange()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (6 nodes): `ChannelSyncController`, `.checkHealth()`, `.constructor()`, `.syncInventory()`, `.syncOrders()`, `.syncProducts()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `code file: coupang-date-range.dto.ts`** (2 nodes): `coupang-date-range.dto.ts`, `CoupangDateRangeQueryDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `code file: channels.module.ts`** (2 nodes): `channels.module.ts`, `ChannelsModule`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Core schema` to `System schema`, `Agents schema`, `Core schema`, `Supply schema`, `Inventory schema`, `Advertising schema`, `Advertising schema`, `System schema`, `AI schema`, `Agents schema`, `Supply schema`, `AI schema`, `Finance schema`, `Inventory schema`, `Orders schema`, `System schema`, `Orders schema`, `Inventory schema`, `Advertising schema`, `AI schema`, `Orders schema`, `Core schema`?**
  _High betweenness centrality (0.209) - this node is a cross-community bridge._
- **Why does `Company` connect `Core schema` to `System schema`, `Core schema`, `Agents schema`, `Supply schema`, `Inventory schema`, `Advertising schema`, `Advertising schema`, `System schema`, `AI schema`, `Agents schema`, `Supply schema`, `AI schema`, `Finance schema`, `Inventory schema`, `code file: coupang-client.ts`, `Orders schema`, `System schema`, `Orders schema`, `Inventory schema`, `Advertising schema`, `AI schema`, `Orders schema`, `Core schema`?**
  _High betweenness centrality (0.151) - this node is a cross-community bridge._
- **Why does `Ad` connect `Advertising schema` to `System schema`, `Core schema`, `Core schema`, `Inventory schema`, `System schema`, `AI schema`, `AI schema`, `code file: coupang-client.ts`, `code file: generate-prisma-erd.mjs`?**
  _High betweenness centrality (0.121) - this node is a cross-community bridge._
- **Are the 42 inferred relationships involving `Company` (e.g. with `order-sync.pg.integration.spec.ts` and `orders.ts`) actually correct?**
  _`Company` has 42 INFERRED edges - model-reasoned connections that need verification._
- **Are the 48 inferred relationships involving `Ad` (e.g. with `order-sync.pg.integration.spec.ts` and `coupang-client.ts`) actually correct?**
  _`Ad` has 48 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Ad.platform`, `Ad.campaignName`, `Ad.dailyBudget` to the rest of the system?**
  _891 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `System schema` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._