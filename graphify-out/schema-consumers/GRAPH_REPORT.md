# Graph Report - schema-consumers  (2026-05-01)

## Corpus Check
- 119 files · ~56,870 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1836 nodes · 6076 edges · 29 communities detected
- Extraction: 50% EXTRACTED · 50% INFERRED · 0% AMBIGUOUS · INFERRED: 3052 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Inventory schema|Inventory schema]]
- [[_COMMUNITY_Supply schema|Supply schema]]
- [[_COMMUNITY_Agents schema|Agents schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Advertising schema|Advertising schema]]
- [[_COMMUNITY_AI schema|AI schema]]
- [[_COMMUNITY_Finance schema|Finance schema]]
- [[_COMMUNITY_System schema|System schema]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Channels schema|Channels schema]]
- [[_COMMUNITY_Orders schema|Orders schema]]
- [[_COMMUNITY_code file dev-data.ts|code file: dev-data.ts]]
- [[_COMMUNITY_Core schema|Core schema]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_code file generate-prisma-erd.mjs|code file: generate-prisma-erd.mjs]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_code file app-exception.ts|code file: app-exception.ts]]
- [[_COMMUNITY_code file coupang-date-range.dto.ts|code file: coupang-date-range.dto.ts]]
- [[_COMMUNITY_code file channels.module.ts|code file: channels.module.ts]]

## God Nodes (most connected - your core abstractions)
1. `Database ERD` - 243 edges
2. `Organization` - 171 edges
3. `channels — Coupang 통합 + Sync + Dashboard 도메인` - 155 edges
4. `prisma — Shared Schema` - 142 edges
5. `Order` - 87 edges
6. `ProductOption` - 76 edges
7. `MasterProduct` - 70 edges
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
- `Database ERD` --mentions_field--> `AdAction.organizationId`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `channels — Coupang 통합 + Sync + Dashboard 도메인` --mentions_field--> `AdAction.organizationId`  [EXTRACTED]
  apps/server/src/channels/AGENTS.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_field--> `AdAction.targetType`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma
- `Database ERD` --mentions_model--> `ScrapeTarget`  [EXTRACTED]
  docs/ERD.md → prisma/models/advertising.prisma

## Communities

### Community 0 - "Core schema"
Cohesion: 0.06
Nodes (146): externalOptionId canonical option identity, vendorItemId provider term, channels — Coupang 통합 + Sync + Dashboard 도메인, Database ERD, AdAction.externalId, AdAction.listingId, AgentDefinition.isActive, CategoryMapping.isActive (+138 more)

### Community 1 - "AI schema"
Cohesion: 0.01
Nodes (153): packages/shared — @kiditem/shared, Agents, AI, AgentLog.createdAt, AgentLog.data, AgentLog.id, AgentLog.level, AgentLog.message (+145 more)

### Community 2 - "Orders schema"
Cohesion: 0.02
Nodes (117): coupangRequest(), generateAuthorization(), getEnvOrThrow(), getVendorId(), CoupangProviderAdapter, approveReturn(), confirmOrderSheets(), getOrderSheets() (+109 more)

### Community 3 - "Channels schema"
Cohesion: 0.02
Nodes (128): Channels, ChannelAccountDailyKpiSnapshot.businessDate, ChannelAccountDailyKpiSnapshot.channel, ChannelAccountDailyKpiSnapshot.createdAt, ChannelAccountDailyKpiSnapshot.firstObservedAt, ChannelAccountDailyKpiSnapshot.id, ChannelAccountDailyKpiSnapshot.kpiType, ChannelAccountDailyKpiSnapshot.lastObservedAt (+120 more)

### Community 4 - "Agents schema"
Cohesion: 0.02
Nodes (121): AgentDefinition.actionCap, AgentDefinition.adapterConfig, AgentDefinition.adapterType, AgentDefinition.allowedTools, AgentDefinition.budgetResetAt, AgentDefinition.contextStrategy, AgentDefinition.createdAt, AgentDefinition.deniedSkills (+113 more)

### Community 5 - "System schema"
Cohesion: 0.24
Nodes (87): prisma — Shared Schema, ActionTask.organizationId, ActivityEvent.organizationId, AdAction.organizationId, AgentDefinition.organizationId, AgentEvent.organizationId, AgentTask.organizationId, AgentWakeupRequest.organizationId (+79 more)

### Community 6 - "Inventory schema"
Cohesion: 0.02
Nodes (112): Inventory, PickingItem.createdAt, PickingItem.id, PickingItem.isPicked, PickingItem.isVerified, PickingItem.location, PickingItem.option, PickingItem.pickedAt (+104 more)

### Community 7 - "Supply schema"
Cohesion: 0.03
Nodes (82): Supply, MasterSupplierProduct.createdAt, MasterSupplierProduct.id, MasterSupplierProduct.isPrimary, MasterSupplierProduct.master, MasterSupplierProduct.memo, MasterSupplierProduct.minOrderQty, MasterSupplierProduct.supplier (+74 more)

### Community 8 - "Agents schema"
Cohesion: 0.03
Nodes (71): AgentDefinition.marketplaceId, Inventory.createdAt, Inventory.currentStock, Inventory.dailySalesAvg, Inventory.id, Inventory.lastRestockedAt, Inventory.leadTimeDays, Inventory.option (+63 more)

### Community 9 - "Core schema"
Cohesion: 0.04
Nodes (65): ActionTask.activityLog, ActionTask.apiCall, ActionTask.assigneeUser, ActionTask.assigneeUserId, ActionTask.createdAt, ActionTask.date, ActionTask.detail, ActionTask.href (+57 more)

### Community 10 - "Advertising schema"
Cohesion: 0.03
Nodes (72): Advertising, AdAction.actionType, AdAction.adTargetDaily, AdAction.adTargetDailyId, AdAction.afterJson, AdAction.approvalStatus, AdAction.approvedAt, AdAction.beforeJson (+64 more)

### Community 11 - "AI schema"
Cohesion: 0.03
Nodes (66): ContentGeneration.createdAt, ContentGeneration.detailPageHtml, ContentGeneration.errorMessage, ContentGeneration.generatedCopy, ContentGeneration.generatedDescription, ContentGeneration.generatedTitle, ContentGeneration.id, ContentGeneration.master (+58 more)

### Community 12 - "Finance schema"
Cohesion: 0.03
Nodes (65): Finance, ManualLedger.amount, ManualLedger.category, ManualLedger.counterpart, ManualLedger.createdAt, ManualLedger.createdBy, ManualLedger.date, ManualLedger.description (+57 more)

### Community 13 - "System schema"
Cohesion: 0.04
Nodes (64): System, ActivityEvent.createdAt, ActivityEvent.data, ActivityEvent.eventType, ActivityEvent.id, ActivityEvent.objectId, ActivityEvent.objectType, ActivityEvent.organization (+56 more)

### Community 14 - "Core schema"
Cohesion: 0.04
Nodes (56): Core, BundleComponent.bundleOption, BundleComponent.bundleOptionId, BundleComponent.componentOption, BundleComponent.componentOptionId, BundleComponent.createdAt, BundleComponent.id, BundleComponent.organization (+48 more)

### Community 15 - "Channels schema"
Cohesion: 0.04
Nodes (55): ChannelListingDailySnapshot.adClicks, ChannelListingDailySnapshot.adConversions, ChannelListingDailySnapshot.adDirectOrders14d, ChannelListingDailySnapshot.adDirectOrders1d, ChannelListingDailySnapshot.adDirectQty14d, ChannelListingDailySnapshot.adDirectQty1d, ChannelListingDailySnapshot.adDirectRevenue14d, ChannelListingDailySnapshot.adDirectRevenue1d (+47 more)

### Community 16 - "Orders schema"
Cohesion: 0.04
Nodes (54): OrderLineItem.createdAt, OrderLineItem.externalLineId, OrderLineItem.id, OrderLineItem.listingOption, OrderLineItem.metadata, OrderLineItem.option, OrderLineItem.optionName, OrderLineItem.order (+46 more)

### Community 17 - "code file: dev-data.ts"
Cohesion: 0.12
Nodes (51): appendFlag(), appendOption(), appendValues(), archiveFileName(), archiveShaFileName(), assertSafeRelativePath(), bool(), commandExport() (+43 more)

### Community 18 - "Core schema"
Cohesion: 0.09
Nodes (47): ChannelAccount.channel, ChannelAccount.config, ChannelAccount.createdAt, ChannelAccount.externalAccountId, ChannelAccount.id, ChannelAccount.isPrimary, ChannelAccount.name, ChannelAccount.organization (+39 more)

### Community 19 - "Community 19"
Cohesion: 0.13
Nodes (23): add_code_reference_edges(), add_document_mentions(), add_schema_graph(), camel(), collect_block(), collect_code(), collect_doc_comments(), community_labels() (+15 more)

### Community 20 - "code file: generate-prisma-erd.mjs"
Cohesion: 0.18
Nodes (19): collectDocComments(), collectModelBlock(), collectUniqueSignatures(), countChar(), extractDocValue(), extractRelationFields(), generateDomainErdMarkdown(), generateErdMarkdown() (+11 more)

### Community 21 - "Community 21"
Cohesion: 0.24
Nodes (2): ChannelSyncService, formatKstIso()

### Community 22 - "Community 22"
Cohesion: 0.36
Nodes (1): ChannelDashboardController

### Community 23 - "Community 23"
Cohesion: 0.25
Nodes (1): ChannelDashboardService

### Community 24 - "Community 24"
Cohesion: 0.29
Nodes (7): planKiditemImport(), planWingMatches(), applyKiditemPlan(), applyWingPlan(), main(), parseArgs(), readSheetRows()

### Community 25 - "Community 25"
Cohesion: 0.33
Nodes (1): ChannelSyncController

### Community 26 - "code file: app-exception.ts"
Cohesion: 0.67
Nodes (1): AppException

### Community 27 - "code file: coupang-date-range.dto.ts"
Cohesion: 1.0
Nodes (1): CoupangDateRangeQueryDto

### Community 28 - "code file: channels.module.ts"
Cohesion: 1.0
Nodes (1): ChannelsModule

## Knowledge Gaps
- **1006 isolated node(s):** `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason`, `AdAction.priority`, `AdAction.currentValue` (+1001 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 21`** (10 nodes): `ChannelSyncService`, `.checkHealth()`, `.constructor()`, `.syncInventory()`, `.syncOrders()`, `.syncProducts()`, `.syncSingleOrder()`, `.syncSingleProductListing()`, `.syncSingleReturn()`, `formatKstIso()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (9 nodes): `ChannelDashboardController`, `.constructor()`, `.getProductRanking()`, `.getReturnFaultSplit()`, `.getReturnReasonBreakdown()`, `.getReturnSummary()`, `.getRevenueTrend()`, `.getSummary()`, `.resolveDateRange()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (8 nodes): `ChannelDashboardService`, `.constructor()`, `.getProductRanking()`, `.getReturnFaultSplit()`, `.getReturnReasonBreakdown()`, `.getReturnSummary()`, `.getRevenueTrend()`, `.getSummary()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (6 nodes): `ChannelSyncController`, `.checkHealth()`, `.constructor()`, `.syncInventory()`, `.syncOrders()`, `.syncProducts()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `code file: app-exception.ts`** (3 nodes): `AppException`, `.constructor()`, `app-exception.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `code file: coupang-date-range.dto.ts`** (2 nodes): `coupang-date-range.dto.ts`, `CoupangDateRangeQueryDto`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `code file: channels.module.ts`** (2 nodes): `channels.module.ts`, `ChannelsModule`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database ERD` connect `Core schema` to `AI schema`, `Orders schema`, `Channels schema`, `Agents schema`, `System schema`, `Inventory schema`, `Supply schema`, `Agents schema`, `Core schema`, `Advertising schema`, `AI schema`, `Finance schema`, `System schema`, `Core schema`, `Channels schema`, `Orders schema`, `Core schema`?**
  _High betweenness centrality (0.286) - this node is a cross-community bridge._
- **Why does `Organization` connect `System schema` to `Core schema`, `AI schema`, `Orders schema`, `Channels schema`, `Agents schema`, `Inventory schema`, `Supply schema`, `Agents schema`, `Core schema`, `Advertising schema`, `AI schema`, `Finance schema`, `System schema`, `Core schema`, `Channels schema`, `Orders schema`, `code file: dev-data.ts`, `Core schema`?**
  _High betweenness centrality (0.241) - this node is a cross-community bridge._
- **Why does `prisma — Shared Schema` connect `System schema` to `Core schema`, `AI schema`, `Orders schema`, `Channels schema`, `Agents schema`, `Inventory schema`, `Supply schema`, `Agents schema`, `Core schema`, `Advertising schema`, `AI schema`, `Finance schema`, `System schema`, `Core schema`, `Channels schema`, `Orders schema`, `Core schema`?**
  _High betweenness centrality (0.143) - this node is a cross-community bridge._
- **Are the 38 inferred relationships involving `Organization` (e.g. with `order-sync.pg.integration.spec.ts` and `product-sync.pg.integration.spec.ts`) actually correct?**
  _`Organization` has 38 INFERRED edges - model-reasoned connections that need verification._
- **Are the 40 inferred relationships involving `Order` (e.g. with `order-sync.pg.integration.spec.ts` and `product-sync.pg.integration.spec.ts`) actually correct?**
  _`Order` has 40 INFERRED edges - model-reasoned connections that need verification._
- **What connects `AdAction.actionType`, `AdAction.targetLabel`, `AdAction.reason` to the rest of the system?**
  _1006 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core schema` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._