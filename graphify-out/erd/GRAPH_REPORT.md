# Graph Report - /tmp/kiditem-erd-corpus  (2026-04-14)

## Corpus Check
- Corpus is ~8,633 words - fits in a single context window. You may not need a graph.

## Summary
- 106 nodes · 239 edges · 13 communities detected
- Extraction: 62% EXTRACTED · 38% INFERRED · 0% AMBIGUOUS · INFERRED: 90 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Thumbnail AI & Finance|Thumbnail AI & Finance]]
- [[_COMMUNITY_Stock & Master Catalog|Stock & Master Catalog]]
- [[_COMMUNITY_Agent Runtime|Agent Runtime]]
- [[_COMMUNITY_Ads Automation|Ads Automation]]
- [[_COMMUNITY_System & Config|System & Config]]
- [[_COMMUNITY_Order Pipeline (Coupang)|Order Pipeline (Coupang)]]
- [[_COMMUNITY_Supply Chain|Supply Chain]]
- [[_COMMUNITY_Stack Components|Stack Components]]
- [[_COMMUNITY_Core Tenancy (CompanyUser)|Core Tenancy (Company/User)]]
- [[_COMMUNITY_Rule PascalCase mapping|Rule: PascalCase mapping]]
- [[_COMMUNITY_Rule UUID PK|Rule: UUID PK]]
- [[_COMMUNITY_Rule Timestamptz|Rule: Timestamptz]]
- [[_COMMUNITY_Rule satisfies drift detection|Rule: satisfies drift detection]]

## God Nodes (most connected - your core abstractions)
1. `Company` - 51 edges
2. `Product` - 32 edges
3. `Stock/Logistics Domain` - 14 edges
4. `AgentDefinition` - 14 edges
5. `Core Domain (Company/User/Product)` - 12 edges
6. `Ads/Marketing Domain` - 11 edges
7. `System/Settings Domain` - 11 edges
8. `Agent/Workflow Domain` - 10 edges
9. `Order/Delivery Domain` - 9 edges
10. `Supply/Purchase Domain` - 8 edges

## Surprising Connections (you probably didn't know these)
- `System/Settings Domain` --references--> `ProductMemo`  [INFERRED]
  erd.md → schema-models.md
- `Core Domain (Company/User/Product)` --references--> `Company`  [INFERRED]
  erd.md → schema-models.md
- `Core Domain (Company/User/Product)` --references--> `Product`  [INFERRED]
  erd.md → schema-models.md
- `Core Domain (Company/User/Product)` --references--> `MasterProduct`  [INFERRED]
  erd.md → schema-models.md
- `Order/Delivery Domain` --references--> `CoupangReturn`  [INFERRED]
  erd.md → schema-models.md

## Hyperedges (group relationships)
- **Order Pipeline (Coupang intake → internal order → shipment → unshipped/settlement)** — schema_CoupangOrder, schema_CoupangOrderItem, schema_Order, schema_Shipment, schema_UnshippedItem, schema_Settlement, schema_Inventory [INFERRED 0.85]
- **Ad Automation Pipeline (Snapshot → Action → ExecutionTask → ExecutionLog, Worker)** — schema_AdSnapshot, schema_AdAction, schema_ExecutionTask, schema_ExecutionWorker, schema_ExecutionLog [EXTRACTED 1.00]
- **Thumbnail AI Pipeline (Analysis → Generation → Tracking → Thumbnail CTR)** — schema_Thumbnail, schema_ThumbnailAnalysis, schema_ThumbnailGeneration, schema_ThumbnailTracking [EXTRACTED 1.00]
- **Agent Runtime Loop (Definition → WakeupRequest → HeartbeatRun → AgentEvent)** — schema_AgentDefinition, schema_AgentWakeupRequest, schema_HeartbeatRun, schema_AgentEvent [EXTRACTED 1.00]
- **Workflow Execution (Template → Run, delegates to AgentTask)** — schema_WorkflowTemplate, schema_WorkflowRun, schema_AgentTask, schema_AgentLog [INFERRED 0.80]
- **Purchase Receiving (Supplier → PurchaseOrder → PurchaseOrderItem → SupplierPayment → Inventory/StockTransaction)** — schema_Supplier, schema_PurchaseOrder, schema_PurchaseOrderItem, schema_SupplierPayment, schema_StockTransaction [INFERRED 0.85]
- **Warehouse Movement (Warehouse → StockTransfer from/to → StockTransaction → Inventory)** — schema_Warehouse, schema_StockTransfer, schema_StockTransaction, schema_Inventory [EXTRACTED 1.00]
- **Picking Fulfillment (PickingList → PickingItem → Shipment)** — schema_PickingList, schema_PickingItem, schema_Shipment [INFERRED 0.80]
- **Master normalization layer (Master* tables shadow operational)** — schema_MasterProduct, schema_MasterInventory, schema_MasterSupplierProduct, schema_Product, schema_Inventory, schema_SupplierProduct [INFERRED 0.70]
- **Marketplace distribution (type=agent|workflow, publishes AgentDefinition + WorkflowTemplate)** — schema_Marketplace, schema_AgentDefinition, schema_WorkflowTemplate [EXTRACTED 1.00]
- **Nine-domain partition of 67 models** — erd_domain_core, erd_domain_order, erd_domain_stock, erd_domain_supply, erd_domain_ads, erd_domain_finance, erd_domain_ai, erd_domain_agent, erd_domain_system [EXTRACTED 1.00]

## Communities

### Community 0 - "Thumbnail AI & Finance"
Cohesion: 0.21
Nodes (17): Concept: Thumbnail pipeline (analyze→generate→track), AI/Thumbnail Domain, Finance/Analytics Domain, CSRecord, ContentGeneration, GradeHistory, ManualLedger, ProcessingCost (+9 more)

### Community 1 - "Stock & Master Catalog"
Cohesion: 0.17
Nodes (16): Stock/Logistics Domain, Rationale: Json absorption (items[]) avoids child tables for small collections, Rule: Json absorption pattern for embedded child items, BundleProduct, CoupangReturn, Inventory, MasterInventory, MasterProduct (+8 more)

### Community 2 - "Agent Runtime"
Cohesion: 0.22
Nodes (15): Concept: Agent hierarchy (manager→specialist via reportsTo self-ref), Agent/Workflow Domain, Rationale: Agent OS Phase 3+4 — 8 new patterns (Token Escalation, Fallback, Cron...), Rationale: AgentDefinition.rt_* embedded to avoid table proliferation, Rationale: Workflows never call LLMs — delegate to agents, Rule: AgentDefinition.rt_* runtime state fields — no separate table, Rule: AgentEvent eventType discriminates permission_denied|action_snapshot, Rule: Marketplace.type discriminates agent|workflow (+7 more)

### Community 3 - "Ads Automation"
Cohesion: 0.24
Nodes (14): Concept: Ad automation (Snapshot→Action→Task→Log), Ads/Marketing Domain, Rule: AdSnapshot.level discriminates campaign|product|null, Ad, AdAction, AdSnapshot, AgentLog, AgentTask (+6 more)

### Community 4 - "System & Config"
Cohesion: 0.26
Nodes (12): System/Settings Domain, Rationale: RLS isolates chatbot tenant data at DB layer, Rule: RLS on chatbot_readonly user via app.company_id session var, ActionTask, ActivityEvent, Alert, BusinessRule, CategoryMapping (+4 more)

### Community 5 - "Order Pipeline (Coupang)"
Cohesion: 0.42
Nodes (9): Concept: Order pipeline (Coupang intake → internal order → shipment), Order/Delivery Domain, Rule: No native PG enums — String + app-level validation, CoupangOrder, CoupangOrderItem, Order, Settlement, Shipment (+1 more)

### Community 6 - "Supply Chain"
Cohesion: 0.54
Nodes (8): Supply/Purchase Domain, Rule: Currency — Int(KRW) or Decimal(12,2)(CNY), MasterSupplierProduct, PurchaseOrder, PurchaseOrderItem, Supplier, SupplierPayment, SupplierProduct

### Community 7 - "Stack Components"
Cohesion: 0.38
Nodes (7): Claude CLI Agents (spawn claude -p) — judgment/analysis, Python Agents (FastAPI HTTP) — generation/processing, Backend: NestJS (ValidationPipe/DTO/GlobalExceptionFilter), Chatbot (CopilotKit sidebar + ClaudeCliAdapter), DB: PostgreSQL (with RLS), Frontend: Next.js (apiClient + TanStack Query), @kiditem/shared Zod schemas (ESM+CJS)

### Community 8 - "Core Tenancy (Company/User)"
Cohesion: 0.5
Nodes (4): Core Domain (Company/User/Product), Rationale: Unify human+AI+system into users table, Rule: User.type unifies human|agent|system, User

### Community 9 - "Rule: PascalCase mapping"
Cohesion: 1.0
Nodes (1): Rule: PascalCase model with @@map to snake_case table

### Community 10 - "Rule: UUID PK"
Cohesion: 1.0
Nodes (1): Rule: UUID PK @default(uuid()) @db.Uuid

### Community 11 - "Rule: Timestamptz"
Cohesion: 1.0
Nodes (1): Rule: Timestamps use @db.Timestamptz

### Community 12 - "Rule: satisfies drift detection"
Cohesion: 1.0
Nodes (1): Rule: satisfies z.infer<typeof Schema> pattern to detect drift

## Knowledge Gaps
- **15 isolated node(s):** `FeatureGate`, `Rule: PascalCase model with @@map to snake_case table`, `Rule: UUID PK @default(uuid()) @db.Uuid`, `Rule: Timestamps use @db.Timestamptz`, `Rule: satisfies z.infer<typeof Schema> pattern to detect drift` (+10 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Rule: PascalCase mapping`** (1 nodes): `Rule: PascalCase model with @@map to snake_case table`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Rule: UUID PK`** (1 nodes): `Rule: UUID PK @default(uuid()) @db.Uuid`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Rule: Timestamptz`** (1 nodes): `Rule: Timestamps use @db.Timestamptz`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Rule: satisfies drift detection`** (1 nodes): `Rule: satisfies z.infer<typeof Schema> pattern to detect drift`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Company` connect `System & Config` to `Thumbnail AI & Finance`, `Stock & Master Catalog`, `Agent Runtime`, `Ads Automation`, `Order Pipeline (Coupang)`, `Supply Chain`, `Core Tenancy (Company/User)`?**
  _High betweenness centrality (0.529) - this node is a cross-community bridge._
- **Why does `Product` connect `Thumbnail AI & Finance` to `Stock & Master Catalog`, `Ads Automation`, `System & Config`, `Order Pipeline (Coupang)`, `Supply Chain`, `Core Tenancy (Company/User)`?**
  _High betweenness centrality (0.160) - this node is a cross-community bridge._
- **Why does `Agent/Workflow Domain` connect `Agent Runtime` to `Core Tenancy (Company/User)`, `Ads Automation`?**
  _High betweenness centrality (0.135) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Company` (e.g. with `Core Domain (Company/User/Product)` and `BusinessRule`) actually correct?**
  _`Company` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `Product` (e.g. with `Core Domain (Company/User/Product)` and `MasterProduct`) actually correct?**
  _`Product` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 11 inferred relationships involving `Stock/Logistics Domain` (e.g. with `Inventory` and `Warehouse`) actually correct?**
  _`Stock/Logistics Domain` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `Core Domain (Company/User/Product)` (e.g. with `Company` and `User`) actually correct?**
  _`Core Domain (Company/User/Product)` has 4 INFERRED edges - model-reasoned connections that need verification._