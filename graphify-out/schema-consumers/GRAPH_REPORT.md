# Graph Report - schema-consumers  (2026-05-01)

## Corpus Check
- 119 files · ~56,306 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1790 nodes · 5948 edges · 31 communities detected
- Extraction: 49% EXTRACTED · 51% INFERRED · 0% AMBIGUOUS · INFERRED: 3009 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_code file dev-data.ts|code file: dev-data.ts]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_code file generate-prisma-erd.mjs|code file: generate-prisma-erd.mjs]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_code file app-exception.ts|code file: app-exception.ts]]
- [[_COMMUNITY_code file coupang-date-range.dto.ts|code file: coupang-date-range.dto.ts]]
- [[_COMMUNITY_code file channels.module.ts|code file: channels.module.ts]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 239 edges
2. `Company` - 173 edges
3. `channels — Coupang 통합 + Sync + Dashboard 도메인` - 153 edges
4. `prisma — Shared Schema` - 137 edges
5. `Order` - 79 edges
6. `ProductOption` - 76 edges
7. `MasterProduct` - 73 edges
8. `AgentDefinition` - 68 edges
9. `ChannelListing` - 68 edges
10. `ChannelListingDailySnapshot` - 67 edges
11. `ChannelAdTargetDailySnapshot` - 54 edges
12. `HeartbeatRun` - 44 edges

## Surprising Connections (you probably didn't know these)
- `Database ERD` --mentions_domain--> `Advertising`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `channels — Coupang 통합 + Sync + Dashboard 도메인` --mentions_domain--> `Advertising`  [EXTRACTED]
  apps/server/src/channels/AGENTS.md → prisma/models/advertising.prisma
- `packages/shared — @kiditem/shared` --mentions_domain--> `Advertising`  [EXTRACTED]
  packages/shared/AGENTS.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_model--> `AdAction`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.companyId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `channels — Coupang 통합 + Sync + Dashboard 도메인` --mentions_field--> `AdAction.companyId`  [EXTRACTED]
  apps/server/src/channels/AGENTS.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.targetType`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_model--> `ScrapeTarget`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma

## Communities

### Community 0 - "Agents schema"
Cohesion: 0.01
Nodes (203): Agents, AgentDefinition.actionCap, AgentDefinition.adapterConfig, AgentDefinition.adapterType, AgentDefinition.allowedTools, AgentDefinition.budgetResetAt, AgentDefinition.company, AgentDefinition.contextStrategy (+195 more)

### Community 1 - "Core schema"
Cohesion: 0.06
Nodes (145): externalOptionId canonical option identity, vendorItemId provider term, channels — Coupang 통합 + Sync + Dashboard 도메인, Database ERD, AdAction.externalId, AdAction.listingId, AgentDefinition.isActive, CategoryMapping.isActive (+137 more)

### Community 2 - "Inventory schema"
Cohesion: 0.19
Nodes (102): prisma — Shared Schema, ActionTask.companyId, ActivityEvent.companyId, AdAction.companyId, AgentDefinition.companyId, AgentEvent.companyId, AgentTask.companyId, AgentWakeupRequest.companyId (+94 more)

### Community 3 - "Channels schema"
Cohesion: 0.02
Nodes (128): Channels, ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.company, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType (+120 more)

### Community 4 - "AI schema"
Cohesion: 0.02
Nodes (126): packages/shared — @kiditem/shared, AI, Inventory, ReturnTransfer.company, ReturnTransfer.completedAt, ReturnTransfer.condition, ReturnTransfer.createdAt, ReturnTransfer.disposedQty (+118 more)

### Community 5 - "System schema"
Cohesion: 0.02
Nodes (105): System, ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.company, ActionTask.createdAt, ActionTask.date (+97 more)

### Community 6 - "Orders schema"
Cohesion: 0.02
Nodes (100): Orders, CSRecord.assignee, CSRecord.company, CSRecord.content, CSRecord.createdAt, CSRecord.createdBy, CSRecord.csStatus, CSRecord.csType (+92 more)

### Community 7 - "Core schema"
Cohesion: 0.02
Nodes (97): Core, BundleComponent.bundleOption, BundleComponent.bundleOptionId, BundleComponent.company, BundleComponent.componentOption, BundleComponent.componentOptionId, BundleComponent.createdAt, BundleComponent.id (+89 more)

### Community 8 - "Supply schema"
Cohesion: 0.03
Nodes (84): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.id, MasterSupplierProduct.isPrimary, MasterSupplierProduct.master, MasterSupplierProduct.memo, MasterSupplierProduct.minOrderQty, MasterSupplierProduct.supplier (+76 more)

### Community 9 - "Finance schema"
Cohesion: 0.03
Nodes (78): Finance, GradeHistory.calculatedAt, GradeHistory.company, GradeHistory.id, GradeHistory.marginScore, GradeHistory.master, GradeHistory.newGrade, GradeHistory.oldGrade (+70 more)

### Community 10 - "Advertising schema"
Cohesion: 0.03
Nodes (72): Advertising, AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson (+64 more)

### Community 11 - "Orders schema"
Cohesion: 0.04
Nodes (55): coupangRequest(), generateAuthorization(), getEnvOrThrow(), getVendorId(), CoupangProviderAdapter, approveReturn(), confirmOrderSheets(), getOrderSheets() (+47 more)

### Community 12 - "Channels schema"
Cohesion: 0.04
Nodes (55): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+47 more)

### Community 13 - "code file: dev-data.ts"
Cohesion: 0.12
Nodes (51): appendFlag(), appendOption(), appendValues(), archiveFileName(), archiveShaFileName(), assertSafeRelativePath(), bool(), commandExport() (+43 more)

### Community 14 - "AI schema"
Cohesion: 0.04
Nodes (46): Review.company, Review.content, Review.createdAt, Review.id, Review.listing, Review.platform, Review.rating, Review.reviewedAt (+38 more)

### Community 15 - "Community 15"
Cohesion: 0.11
Nodes (32): assertSafeDatasetId(), assertSafeRelativePath(), bool(), cleanupLegacySeedRows(), commandExport(), commandReplay(), commandSanitize(), createPrisma() (+24 more)

### Community 16 - "Inventory schema"
Cohesion: 0.08
Nodes (29): PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.option, PickingItem.pickedAt, PickingItem.pickingList (+21 more)

### Community 17 - "Community 17"
Cohesion: 0.13
Nodes (23): add_code_reference_edges(), add_document_mentions(), add_schema_graph(), camel(), collect_block(), collect_code(), collect_doc_comments(), community_labels() (+15 more)

### Community 18 - "code file: generate-prisma-erd.mjs"
Cohesion: 0.18
Nodes (19): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), extractDocValue(), extractRelationFields(), generateDomainErdMarkdown(), generateErdMarkdown() (+11 more)

### Community 19 - "System schema"
Cohesion: 0.1
Nodes (21): BusinessRule.actionType, BusinessRule.active, BusinessRule.autoExecute, BusinessRule.category, BusinessRule.company, BusinessRule.conditions, BusinessRule.createdAt, BusinessRule.description (+13 more)

### Community 20 - "Inventory schema"
Cohesion: 0.12
Nodes (17): StockTransfer.company, StockTransfer.completedAt, StockTransfer.createdAt, StockTransfer.fromWarehouse, StockTransfer.fromWarehouseId, StockTransfer.id, StockTransfer.notes, StockTransfer.option (+9 more)

### Community 21 - "Inventory schema"
Cohesion: 0.15
Nodes (15): StockAudit.auditedBy, StockAudit.auditNumber, StockAudit.company, StockAudit.completedAt, StockAudit.createdAt, StockAudit.diffCount, StockAudit.id, StockAudit.items (+7 more)

### Community 22 - "Community 22"
Cohesion: 0.24
Nodes (2): ChannelSyncService, formatKstIso()

### Community 23 - "Community 23"
Cohesion: 0.36
Nodes (1): ChannelDashboardController

### Community 24 - "Community 24"
Cohesion: 0.25
Nodes (1): ChannelDashboardService

### Community 25 - "Community 25"
Cohesion: 0.29
Nodes (7): planKiditemImport(), planWingMatches(), applyKiditemPlan(), applyWingPlan(), main(), parseArgs(), readSheetRows()

### Community 26 - "Community 26"
Cohesion: 0.33
Nodes (1): ChannelSyncController

### Community 27 - "Community 27"
Cohesion: 0.4
Nodes (5): makeEvent(), makeHeartbeat(), makeLog(), makeTask(), makeTrace()

### Community 28 - "code file: app-exception.ts"
Cohesion: 0.67
Nodes (1): AppException

### Community 30 - "code file: coupang-date-range.dto.ts"
Cohesion: 1.0
Nodes (1): CoupangDateRangeQueryDto

### Community 31 - "code file: channels.module.ts"
Cohesion: 1.0
Nodes (1): ChannelsModule

## Knowledge Gaps
- **979 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+974 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 22`** (10 nodes): `ChannelSyncService`, `.checkHealth()`, `.constructor()`, `.syncInventory()`, `.syncOrders()`, `.syncProducts()`, `.syncSingleOrder()`, `.syncSingleProductListing()`, `.syncSingleReturn()`, `formatKstIso()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (9 nodes): `ChannelDashboardController`, `.constructor()`, `.getProductRanking()`, `.getReturnFaultSplit()`, `.getReturnReasonBreakdown()`, `.getReturnSummary()`, `.getRevenueTrend()`, `.getSummary()`, `.resolveDateRange()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (8 nodes): `ChannelDashboardService`, `.constructor()`, `.getProductRanking()`, `.getReturnFaultSplit()`, `.getReturnReasonBreakdown()`, `.getReturnSummary()`, `.getRevenueTrend()`, `.getSummary()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (6 nodes): `ChannelSyncController`, `.checkHealth()`, `.constructor()`, `.syncInventory()`, `.syncOrders()`, `.syncProducts()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `code file: app-exception.ts`** (3 nodes): `AppException`, `.constructor()`, `app-exception.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `code file: coupang-date-range.dto.ts`** (2 nodes): `coupang-date-range.dto.ts`, `CoupangDateRangeQueryDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `code file: channels.module.ts`** (2 nodes): `channels.module.ts`, `ChannelsModule`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Core schema` to `Agents schema`, `Inventory schema`, `Channels schema`, `AI schema`, `System schema`, `Orders schema`, `Core schema`, `Supply schema`, `Finance schema`, `Advertising schema`, `Orders schema`, `Channels schema`, `AI schema`, `Inventory schema`, `System schema`, `Inventory schema`, `Inventory schema`?**
  _High betweenness centrality (0.287) - this node is a cross-community bridge._
- **Why does `Company` connect `Inventory schema` to `Agents schema`, `Core schema`, `Channels schema`, `AI schema`, `System schema`, `Orders schema`, `Core schema`, `Supply schema`, `Finance schema`, `Advertising schema`, `Orders schema`, `Channels schema`, `code file: dev-data.ts`, `AI schema`, `Inventory schema`, `System schema`, `Inventory schema`, `Inventory schema`?**
  _High betweenness centrality (0.247) - this node is a cross-community bridge._
- **Why does `prisma — Shared Schema` connect `Inventory schema` to `Agents schema`, `Core schema`, `Channels schema`, `AI schema`, `System schema`, `Orders schema`, `Core schema`, `Supply schema`, `Finance schema`, `Advertising schema`, `Orders schema`, `Channels schema`, `AI schema`, `System schema`?**
  _High betweenness centrality (0.137) - this node is a cross-community bridge._
- **Are the 43 inferred relationships involving `Company` (e.g. with `order-sync.pg.integration.spec.ts` and `product-sync.pg.integration.spec.ts`) actually correct?**
  _`Company` has 43 INFERRED edges - model-reasoned connections that need verification._
- **Are the 40 inferred relationships involving `Order` (e.g. with `order-sync.pg.integration.spec.ts` and `product-sync.pg.integration.spec.ts`) actually correct?**
  _`Order` has 40 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason` to the rest of the system?**
  _979 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Agents schema` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._