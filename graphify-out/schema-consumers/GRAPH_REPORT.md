# Graph Report - schema-consumers  (2026-04-28)

## Corpus Check
- 93 files · ~52,565 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1720 nodes · 5983 edges · 28 communities detected
- Extraction: 46% EXTRACTED · 54% INFERRED · 0% AMBIGUOUS · INFERRED: 3230 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file generate-prisma-erd.mjs|code file: generate-prisma-erd.mjs]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_code file app-exception.ts|code file: app-exception.ts]]
- [[_COMMUNITY_code file channels.module.ts|code file: channels.module.ts]]
- [[_COMMUNITY_code file coupang-date-range.dto.ts|code file: coupang-date-range.dto.ts]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 243 edges
2. `Company` - 174 edges
3. `channels — Coupang 통합 + Sync + Dashboard 도메인` - 152 edges
4. `prisma — Shared Schema` - 139 edges
5. `Order` - 79 edges
6. `ProductOption` - 75 edges
7. `MasterProduct` - 74 edges
8. `AgentDefinition` - 69 edges
9. `ChannelListing` - 68 edges
10. `ChannelListingDailySnapshot` - 67 edges
11. `ChannelAdTargetDailySnapshot` - 54 edges
12. `HeartbeatRun` - 45 edges

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
Cohesion: 0.04
Nodes (194): externalOptionId canonical option identity, vendorItemId provider term, channels — Coupang 통합 + Sync + Dashboard 도메인, Database ERD, Supply, AdAction.externalId, AdAction.listingId, AgentDefinition.isActive (+186 more)

### Community 1 - "Channels schema"
Cohesion: 0.02
Nodes (148): Channels, ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.company, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+140 more)

### Community 2 - "Agents schema"
Cohesion: 0.02
Nodes (121): AgentDefinition.actionCap, AgentDefinition.adapterConfig, AgentDefinition.adapterType, AgentDefinition.allowedTools, AgentDefinition.budgetResetAt, AgentDefinition.company, AgentDefinition.contextStrategy, AgentDefinition.createdAt (+113 more)

### Community 3 - "AI schema"
Cohesion: 0.02
Nodes (118): packages/shared — @kiditem/shared, Agents, AI, AgentLog.createdAt, AgentLog.data, AgentLog.id, AgentLog.level, AgentLog.message (+110 more)

### Community 4 - "Inventory schema"
Cohesion: 0.02
Nodes (112): Inventory, PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.option, PickingItem.pickedAt (+104 more)

### Community 5 - "Advertising schema"
Cohesion: 0.02
Nodes (107): Advertising, AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson (+99 more)

### Community 6 - "Core schema"
Cohesion: 0.32
Nodes (71): prisma — Shared Schema, ActionTask.companyId, ActivityEvent.companyId, AdAction.companyId, AgentDefinition.companyId, AgentEvent.companyId, AgentTask.companyId, AgentWakeupRequest.companyId (+63 more)

### Community 7 - "Core schema"
Cohesion: 0.02
Nodes (98): Core, BundleComponent.bundleOption, BundleComponent.bundleOptionId, BundleComponent.company, BundleComponent.componentOption, BundleComponent.componentOptionId, BundleComponent.createdAt, BundleComponent.id (+90 more)

### Community 8 - "System schema"
Cohesion: 0.03
Nodes (74): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.company, ActionTask.createdAt, ActionTask.date, ActionTask.detail (+66 more)

### Community 9 - "Orders schema"
Cohesion: 0.03
Nodes (82): Orders, CSRecord.assignee, CSRecord.company, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType (+74 more)

### Community 10 - "Finance schema"
Cohesion: 0.03
Nodes (78): Finance, GradeHistory.calculatedAt, GradeHistory.company, GradeHistory.id, GradeHistory.marginScore, GradeHistory.master, GradeHistory.newGrade, GradeHistory.oldGrade (+70 more)

### Community 11 - "Orders schema"
Cohesion: 0.04
Nodes (61): ChannelSyncService, formatKstIso(), coupangRequest(), generateAuthorization(), getEnvOrThrow(), getVendorId(), Order.company, Order.createdAt (+53 more)

### Community 12 - "Agents schema"
Cohesion: 0.03
Nodes (71): AgentDefinition.marketplaceId, Inventory.company, Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.id, Inventory.lastRestockedAt, Inventory.leadTimeDays (+63 more)

### Community 13 - "System schema"
Cohesion: 0.04
Nodes (64): System, ActivityEvent.company, ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType (+56 more)

### Community 14 - "AI schema"
Cohesion: 0.04
Nodes (56): Review.company, Review.content, Review.createdAt, Review.id, Review.listing, Review.platform, Review.rating, Review.reviewedAt (+48 more)

### Community 15 - "Supply schema"
Cohesion: 0.05
Nodes (47): PurchaseOrder.company, PurchaseOrder.createdAt, PurchaseOrder.defectAction, PurchaseOrder.defectNote, PurchaseOrder.defectQty, PurchaseOrder.defectType, PurchaseOrder.expectedDeliveryDate, PurchaseOrder.id (+39 more)

### Community 16 - "Community 16"
Cohesion: 0.13
Nodes (23): add_code_reference_edges(), add_document_mentions(), add_schema_graph(), camel(), collect_block(), collect_code(), collect_doc_comments(), community_labels() (+15 more)

### Community 17 - "Orders schema"
Cohesion: 0.12
Nodes (19): Settlement.actualAmount, Settlement.adjustments, Settlement.commission, Settlement.company, Settlement.createdAt, Settlement.difference, Settlement.expectedAmount, Settlement.id (+11 more)

### Community 18 - "code file: generate-prisma-erd.mjs"
Cohesion: 0.2
Nodes (17): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), extractDocValue(), extractRelationFields(), generateErdMarkdown(), generateMermaidErDiagram() (+9 more)

### Community 19 - "Community 19"
Cohesion: 0.36
Nodes (1): ChannelDashboardController

### Community 20 - "Community 20"
Cohesion: 0.25
Nodes (1): ChannelDashboardService

### Community 21 - "Community 21"
Cohesion: 0.29
Nodes (7): planKiditemImport(), planWingMatches(), applyKiditemPlan(), applyWingPlan(), main(), parseArgs(), readSheetRows()

### Community 22 - "Community 22"
Cohesion: 0.33
Nodes (1): ChannelSyncController

### Community 23 - "Community 23"
Cohesion: 0.4
Nodes (5): makeEvent(), makeHeartbeat(), makeLog(), makeTask(), makeTrace()

### Community 24 - "Community 24"
Cohesion: 0.4
Nodes (5): main(), parse_schema(), Return (header_block_lines, dict[model_name -> block_lines]).      header = gene, Inject `/// @namespace <ns>` and optional `/// @describe <text>` above the model, render_model()

### Community 25 - "code file: app-exception.ts"
Cohesion: 0.67
Nodes (1): AppException

### Community 26 - "code file: channels.module.ts"
Cohesion: 1.0
Nodes (1): ChannelsModule

### Community 27 - "code file: coupang-date-range.dto.ts"
Cohesion: 1.0
Nodes (1): CoupangDateRangeQueryDto

## Knowledge Gaps
- **988 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+983 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 19`** (9 nodes): `ChannelDashboardController`, `.constructor()`, `.getProductRanking()`, `.getReturnFaultSplit()`, `.getReturnReasonBreakdown()`, `.getReturnSummary()`, `.getRevenueTrend()`, `.getSummary()`, `.resolveDateRange()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (8 nodes): `ChannelDashboardService`, `.constructor()`, `.getProductRanking()`, `.getReturnFaultSplit()`, `.getReturnReasonBreakdown()`, `.getReturnSummary()`, `.getRevenueTrend()`, `.getSummary()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (6 nodes): `ChannelSyncController`, `.checkHealth()`, `.constructor()`, `.syncInventory()`, `.syncOrders()`, `.syncProducts()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `code file: app-exception.ts`** (3 nodes): `AppException`, `.constructor()`, `app-exception.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `code file: channels.module.ts`** (2 nodes): `channels.module.ts`, `ChannelsModule`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `code file: coupang-date-range.dto.ts`** (2 nodes): `coupang-date-range.dto.ts`, `CoupangDateRangeQueryDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Core schema` to `Channels schema`, `Agents schema`, `AI schema`, `Inventory schema`, `Advertising schema`, `Core schema`, `Core schema`, `System schema`, `Orders schema`, `Finance schema`, `Orders schema`, `Agents schema`, `System schema`, `AI schema`, `Supply schema`, `Orders schema`?**
  _High betweenness centrality (0.266) - this node is a cross-community bridge._
- **Why does `Company` connect `Core schema` to `Core schema`, `Channels schema`, `Agents schema`, `AI schema`, `Inventory schema`, `Advertising schema`, `Core schema`, `System schema`, `Orders schema`, `Finance schema`, `Orders schema`, `Agents schema`, `System schema`, `AI schema`, `Supply schema`, `Orders schema`?**
  _High betweenness centrality (0.194) - this node is a cross-community bridge._
- **Why does `prisma — Shared Schema` connect `Core schema` to `Core schema`, `Channels schema`, `Agents schema`, `AI schema`, `Inventory schema`, `Advertising schema`, `Core schema`, `System schema`, `Orders schema`, `Finance schema`, `Orders schema`, `Agents schema`, `System schema`, `AI schema`, `Supply schema`, `Orders schema`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **Are the 42 inferred relationships involving `Company` (e.g. with `order-sync.pg.integration.spec.ts` and `product-sync.pg.integration.spec.ts`) actually correct?**
  _`Company` has 42 INFERRED edges - model-reasoned connections that need verification._
- **Are the 40 inferred relationships involving `Order` (e.g. with `order-sync.pg.integration.spec.ts` and `product-sync.pg.integration.spec.ts`) actually correct?**
  _`Order` has 40 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason` to the rest of the system?**
  _988 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core schema` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._