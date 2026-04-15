# Graph Report - graphify-out/.erd-corpus  (2026-04-15)

## Corpus Check
- Corpus is ~9,052 words - fits in a single context window. You may not need a graph.

## Summary
- 137 nodes · 268 edges · 17 communities detected
- Extraction: 63% EXTRACTED · 37% INFERRED · 0% AMBIGUOUS · INFERRED: 98 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_CoreStockSystem Domain|Core/Stock/System Domain]]
- [[_COMMUNITY_Architecture & Cross-Domain Rules|Architecture & Cross-Domain Rules]]
- [[_COMMUNITY_ThumbnailFinanceContent|Thumbnail/Finance/Content]]
- [[_COMMUNITY_Agent Runtime & Workflow|Agent Runtime & Workflow]]
- [[_COMMUNITY_Ads Automation Pipeline|Ads Automation Pipeline]]
- [[_COMMUNITY_Order Pipeline|Order Pipeline]]
- [[_COMMUNITY_SupplyPurchase Domain|Supply/Purchase Domain]]
- [[_COMMUNITY_System Topology (FEBEAgents)|System Topology (FE/BE/Agents)]]
- [[_COMMUNITY_Action Board & Alerts|Action Board & Alerts]]
- [[_COMMUNITY_Rule PascalCase Mapping|Rule: PascalCase Mapping]]
- [[_COMMUNITY_Rule UUID Primary Key|Rule: UUID Primary Key]]
- [[_COMMUNITY_Rule Timestamptz|Rule: Timestamptz]]
- [[_COMMUNITY_Rule Zod satisfies Pattern|Rule: Zod satisfies Pattern]]
- [[_COMMUNITY_Rule FK Index Required|Rule: FK Index Required]]
- [[_COMMUNITY_Rule Optional FK onDelete|Rule: Optional FK onDelete]]
- [[_COMMUNITY_DB Sync 3-Tier Model|DB Sync 3-Tier Model]]
- [[_COMMUNITY_init.sql.gz Fresh Volume Rule|init.sql.gz Fresh Volume Rule]]

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
- `Core Domain (Company/User/Product)` --references--> `Product`  [INFERRED]
  erd.md → schema-models.md
- `Order/Delivery Domain` --references--> `CoupangReturn`  [INFERRED]
  erd.md → schema-models.md
- `Order/Delivery Domain` --references--> `Settlement`  [INFERRED]
  erd.md → schema-models.md
- `Stock/Logistics Domain` --references--> `StockAudit`  [INFERRED]
  erd.md → schema-models.md

## Hyperedges (group relationships)
- **Panel visibility uses User-WorkflowRun relation** — erd_workflow_run, erd_workflow_run_triggered_by_user, erd_user_unified [EXTRACTED 0.90]
- **Ads execution pipeline (AdSnapshot -> AdAction -> ExecutionTask)** — erd_ad_snapshot, erd_ad_action, erd_execution_task [EXTRACTED 0.95]
- **Agent runtime state (AgentDefinition + HeartbeatRun + AgentEvent)** — erd_agent_definition, erd_heartbeat_run, erd_agent_event [EXTRACTED 0.90]

## Communities

### Community 0 - "Core/Stock/System Domain"
Cohesion: 0.11
Nodes (32): Core Domain (Company/User/Product), Stock/Logistics Domain, System/Settings Domain, Rationale: Json absorption (items[]) avoids child tables for small collections, Rationale: RLS isolates chatbot tenant data at DB layer, Rationale: Unify human+AI+system into users table, Rule: Json absorption pattern for embedded child items, Rule: RLS on chatbot_readonly user via app.company_id session var (+24 more)

### Community 1 - "Architecture & Cross-Domain Rules"
Cohesion: 0.09
Nodes (25): Agent Runtimes (claude_local | python_http), Chatbot vs Agent role boundary, @kiditem/shared (Zod schemas + satisfies pattern), Agent OS Phase 3+4 (8 patterns), RLS chatbot_readonly DB user (11 tables), Workflows must never call LLMs directly, AdAction, AdSnapshot (level: campaign|product|null) (+17 more)

### Community 2 - "Thumbnail/Finance/Content"
Cohesion: 0.21
Nodes (17): Concept: Thumbnail pipeline (analyze→generate→track), AI/Thumbnail Domain, Finance/Analytics Domain, CSRecord, ContentGeneration, GradeHistory, ManualLedger, ProcessingCost (+9 more)

### Community 3 - "Agent Runtime & Workflow"
Cohesion: 0.22
Nodes (15): Concept: Agent hierarchy (manager→specialist via reportsTo self-ref), Agent/Workflow Domain, Rationale: Agent OS Phase 3+4 — 8 new patterns (Token Escalation, Fallback, Cron...), Rationale: AgentDefinition.rt_* embedded to avoid table proliferation, Rationale: Workflows never call LLMs — delegate to agents, Rule: AgentDefinition.rt_* runtime state fields — no separate table, Rule: AgentEvent eventType discriminates permission_denied|action_snapshot, Rule: Marketplace.type discriminates agent|workflow (+7 more)

### Community 4 - "Ads Automation Pipeline"
Cohesion: 0.24
Nodes (14): Concept: Ad automation (Snapshot→Action→Task→Log), Ads/Marketing Domain, Rule: AdSnapshot.level discriminates campaign|product|null, Ad, AdAction, AdSnapshot, AgentLog, AgentTask (+6 more)

### Community 5 - "Order Pipeline"
Cohesion: 0.42
Nodes (9): Concept: Order pipeline (Coupang intake → internal order → shipment), Order/Delivery Domain, Rule: No native PG enums — String + app-level validation, CoupangOrder, CoupangOrderItem, Order, Settlement, Shipment (+1 more)

### Community 6 - "Supply/Purchase Domain"
Cohesion: 0.54
Nodes (8): Supply/Purchase Domain, Rule: Currency — Int(KRW) or Decimal(12,2)(CNY), MasterSupplierProduct, PurchaseOrder, PurchaseOrderItem, Supplier, SupplierPayment, SupplierProduct

### Community 7 - "System Topology (FE/BE/Agents)"
Cohesion: 0.38
Nodes (7): Claude CLI Agents (spawn claude -p) — judgment/analysis, Python Agents (FastAPI HTTP) — generation/processing, Backend: NestJS (ValidationPipe/DTO/GlobalExceptionFilter), Chatbot (CopilotKit sidebar + ClaudeCliAdapter), DB: PostgreSQL (with RLS), Frontend: Next.js (apiClient + TanStack Query), @kiditem/shared Zod schemas (ESM+CJS)

### Community 8 - "Action Board & Alerts"
Cohesion: 1.0
Nodes (2): ActionTask (Action Board), Alert

### Community 9 - "Rule: PascalCase Mapping"
Cohesion: 1.0
Nodes (1): Rule: PascalCase model with @@map to snake_case table

### Community 10 - "Rule: UUID Primary Key"
Cohesion: 1.0
Nodes (1): Rule: UUID PK @default(uuid()) @db.Uuid

### Community 11 - "Rule: Timestamptz"
Cohesion: 1.0
Nodes (1): Rule: Timestamps use @db.Timestamptz

### Community 12 - "Rule: Zod satisfies Pattern"
Cohesion: 1.0
Nodes (1): Rule: satisfies z.infer<typeof Schema> pattern to detect drift

### Community 13 - "Rule: FK Index Required"
Cohesion: 1.0
Nodes (1): FK columns require explicit @@index

### Community 14 - "Rule: Optional FK onDelete"
Cohesion: 1.0
Nodes (1): Optional FK (Foo?) requires explicit onDelete

### Community 15 - "DB Sync 3-Tier Model"
Cohesion: 1.0
Nodes (1): DB sync 3-tier model (DDL | init.sql.gz | incremental)

### Community 16 - "init.sql.gz Fresh Volume Rule"
Cohesion: 1.0
Nodes (1): init.sql.gz loads on fresh volume only

## Knowledge Gaps
- **32 isolated node(s):** `FeatureGate`, `Rule: PascalCase model with @@map to snake_case table`, `Rule: UUID PK @default(uuid()) @db.Uuid`, `Rule: Timestamps use @db.Timestamptz`, `Rule: satisfies z.infer<typeof Schema> pattern to detect drift` (+27 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Action Board & Alerts`** (2 nodes): `ActionTask (Action Board)`, `Alert`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Rule: PascalCase Mapping`** (1 nodes): `Rule: PascalCase model with @@map to snake_case table`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Rule: UUID Primary Key`** (1 nodes): `Rule: UUID PK @default(uuid()) @db.Uuid`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Rule: Timestamptz`** (1 nodes): `Rule: Timestamps use @db.Timestamptz`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Rule: Zod satisfies Pattern`** (1 nodes): `Rule: satisfies z.infer<typeof Schema> pattern to detect drift`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Rule: FK Index Required`** (1 nodes): `FK columns require explicit @@index`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Rule: Optional FK onDelete`** (1 nodes): `Optional FK (Foo?) requires explicit onDelete`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `DB Sync 3-Tier Model`** (1 nodes): `DB sync 3-tier model (DDL | init.sql.gz | incremental)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `init.sql.gz Fresh Volume Rule`** (1 nodes): `init.sql.gz loads on fresh volume only`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Company` connect `Core/Stock/System Domain` to `Thumbnail/Finance/Content`, `Agent Runtime & Workflow`, `Ads Automation Pipeline`, `Order Pipeline`, `Supply/Purchase Domain`?**
  _High betweenness centrality (0.315) - this node is a cross-community bridge._
- **Why does `Product` connect `Thumbnail/Finance/Content` to `Core/Stock/System Domain`, `Ads Automation Pipeline`, `Order Pipeline`, `Supply/Purchase Domain`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **Why does `Agent/Workflow Domain` connect `Agent Runtime & Workflow` to `Core/Stock/System Domain`, `Ads Automation Pipeline`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Company` (e.g. with `Core Domain (Company/User/Product)` and `BusinessRule`) actually correct?**
  _`Company` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `Product` (e.g. with `Core Domain (Company/User/Product)` and `MasterProduct`) actually correct?**
  _`Product` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 11 inferred relationships involving `Stock/Logistics Domain` (e.g. with `Inventory` and `Warehouse`) actually correct?**
  _`Stock/Logistics Domain` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `Core Domain (Company/User/Product)` (e.g. with `Company` and `User`) actually correct?**
  _`Core Domain (Company/User/Product)` has 4 INFERRED edges - model-reasoned connections that need verification._