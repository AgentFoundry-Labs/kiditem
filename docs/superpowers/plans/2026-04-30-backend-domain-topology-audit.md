# Backend Domain Topology Audit Child Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` only when a later implementation child plan is approved. This audit plan is documentation-only; it does not authorize code movement.

**Goal:** Audit `main` backend top-level topology against the Backend Architecture Contract and rank the next owner-domain fold candidates.

**Architecture:** This is a Phase 3B child audit. It classifies `apps/server/src` top-level folders as owner domain, capability, platform, or reporting read model, then compares the current `main` shape with the contract topology table. Follow-up implementation must keep one owner domain per PR.

**Tech Stack:** NestJS 11, Prisma 7, npm workspaces, Vitest, reconstruction scanners (`check:idor`, `check:tenant-scope`).

---

## Baseline

- Date: 2026-04-30.
- Branch baseline: local `main`, tracking `origin/main`.
- Baseline commit: `3bf4ef554418937c568004aa5961ea9bdc4a1728`.
- Scope: `apps/server/src` top-level folders only.
- Output: audit plan only. No code movement, no route move, no Prisma schema change, no shared package change.

Required documents read:

- `AGENTS.md`.
- `apps/server/AGENTS.md`.
- `docs/superpowers/plans/2026-04-28-codebase-reconstruction.md`.
- `docs/superpowers/plans/2026-04-29-backend-architecture-contract.md`.

Additional documents read because they govern candidate risk:

- `docs/superpowers/plans/2026-04-29-automation-agent-os-hard-delete.md`.
- `apps/server/src/agent-registry/CLAUDE.md`.
- `apps/server/src/automation/adapter/out/workflow-runner/CLAUDE.md`.
- `apps/server/src/rules/CLAUDE.md`.
- `apps/server/src/marketplace/CLAUDE.md`.
- `apps/server/src/finance/CLAUDE.md`.
- `apps/server/src/orders/CLAUDE.md`.
- `apps/server/src/chat/CLAUDE.md`.

Main top-level folders observed:

```text
activity-events
advertising
agent-registry
ai
auth
automation
channels
chat
common
companies
dashboard
feature-gate
finance
inventory
manual-ledger
marketplace
orders
prisma
processing-costs
procurement
products
return-transfers
rules
sales-plans
settlements
sourcing
statistics
supplier-payments
supplier-stats
suppliers
test-helpers
traffic
types
uploads
workflows
```

## Classification

Legend:

- **Owner domain**: a top-level folder that can remain a backend owner root.
- **Capability**: a table-shaped or workflow-shaped slice that should live under an owner domain/platform.
- **Platform**: backend infrastructure/runtime/shared service surface.
- **Reporting read model**: query/projection surface whose primary responsibility is reporting or analytics.

| Folder | Class | Contract target | Current role / audit note |
|---|---|---|---|
| `activity-events` | Platform | `automation` / platform event log | Thin `ActivityEvent` writer/read surface. System model, used by automation/rules style flows. |
| `advertising` | Owner domain | `advertising` | Topology-aligned owner. Still has transitional `services/` shape, but not a top-level fold problem. |
| `agent-registry` | Capability | `automation` / `agent-os` | Public compatibility facade and live Agent OS internals. Implementation is partly under `automation/application/service/agent-*`. |
| `ai` | Owner domain | `ai` / `media-ai` | Topology-aligned media AI owner. |
| `auth` | Platform | `platform` | Auth/current-company/guards. |
| `automation` | Platform | `automation` / `agent-os` | Canonical automation root now exists and owns panel, action-board, workflow runner, marketplace install, and agent application/runtime adapters. |
| `channels` | Owner domain | `channels` | Topology-aligned external marketplace/channel spine. |
| `chat` | Platform | platform or future Agent OS decision | CopilotKit + Claude CLI runtime, independent from `agent-registry`. Not in topology table; needs a boundary decision before any fold. |
| `common` | Platform | `platform` | Filters, storage, shared backend utilities. |
| `companies` | Platform | `platform` | Company/user platform surface. Contains `agent-tasks` compatibility routes that call Agent OS. |
| `dashboard` | Reporting read model | `analytics` | Analytics read model. Separate from `statistics`, `traffic`, `supplier-stats`. |
| `feature-gate` | Platform | `platform` | Runtime feature flags. |
| `finance` | Owner domain | `finance` | P&L and sales-analysis live aggregation owner. Satellite finance capabilities remain separate top-level folders. |
| `inventory` | Owner domain | `inventory` | Topology-aligned reconstructed owner; already contains warehouses, stock transfers, audits, picking, unshipped. |
| `manual-ledger` | Capability | `finance` | Small finance CRUD capability. Good fold candidate. |
| `marketplace` | Capability | `automation` / `agent-os` | Read-only catalog remains top-level by current contract; install/uninstall moved to `automation`. |
| `orders` | Owner domain | `orders` | Order/returns/CS/reviews owner root. `return-transfers` still separate. |
| `prisma` | Platform | `platform` | Global Prisma module/service. |
| `processing-costs` | Capability | `finance` | Finance CRUD capability tied to product cost basis. Good fold candidate. |
| `procurement` | Capability | `sourcing` / `procurement` | Purchase order state machine. Stronger invariant than `suppliers`, but still a fragment of the supply owner. |
| `products` | Owner domain | `products` / `catalog` | Topology-aligned owner. Former categories top-level already lives under `products/categories`. |
| `return-transfers` | Capability | `orders` target, inventory schema tension | Contract targets orders, while Prisma namespace places `ReturnTransfer` in Inventory. Needs owner decision before fold. |
| `rules` | Capability | `automation` / `agent-os` | Event-driven agent callback and alerts. Schedule control already ported through `automation`. |
| `sales-plans` | Capability | `finance` | Finance planning capability. Not listed in finance convergence row, but Prisma namespace is Finance. |
| `settlements` | Capability | `finance` target, orders schema tension | Contract targets finance, while Prisma namespace places `Settlement` in Orders. Raw SQL/reporting risk makes this a separate step inside finance. |
| `sourcing` | Owner domain | `sourcing` / `procurement` | Extension product ingest plus AgentRegistry delegation. The canonical root name is not yet settled. |
| `statistics` | Reporting read model | `analytics` | Analytics projection. |
| `supplier-payments` | Capability | `finance` | Finance/supply payment capability. Good fold candidate, but references suppliers and purchase orders. |
| `supplier-stats` | Reporting read model | `analytics` | Supplier reporting projection. |
| `suppliers` | Capability | `sourcing` / `procurement` | Supplier CRUD capability. Good fold candidate after canonical owner root is chosen. |
| `test-helpers` | Platform | test infrastructure | Server test fixtures/helpers. |
| `traffic` | Reporting read model | `analytics` | Traffic read model; large service and separate analytics fold candidate after requested candidates. |
| `types` | Platform | platform | Server-local types. |
| `uploads` | Platform | uploads/platform infra | Upload endpoint infrastructure; ad CSV path is a 501 compatibility stub. |
| `workflows` | Capability | `automation` / `agent-os` | HTTP compatibility route surface only; runner/orchestration moved under `automation`. |

## Contract Comparison

| Contract target | Expected convergence | Main status | Gap / decision |
|---|---|---|---|
| `products` / `catalog` | `products`, `categories` | Aligned. `categories` is under `products/categories`; no top-level `categories`. | No topology action. |
| `sourcing` / `procurement` | `sourcing`, `suppliers`, `procurement` | Not folded. Three separate modules remain in `AppModule`. | Choose canonical root, then fold one owner domain PR. |
| `inventory` | `inventory`, warehouses, stock-transfers, stock-audits, picking | Aligned. Capabilities live under reconstructed `inventory`. | Preserve as reference pattern. |
| `orders` | `orders`, `return-transfers`, CS/review/order-adjacent surfaces | Partially aligned. CS/reviews are inside `orders`; `return-transfers` remains top-level. | Resolve `return-transfers` owner tension before moving. |
| `finance` | `finance`, `manual-ledger`, `processing-costs`, `supplier-payments`, `settlements` | Not folded. Also has `sales-plans` as an unlisted finance-model capability. | Highest practical fold candidate. |
| `advertising` | advertising operations, ad action execution, ad metrics | Aligned at top level. | Continue Phase 3B service/layer refactors separately. |
| `channels` | channel listings, channel sync, external marketplace spine | Aligned at top level. | No topology action. |
| `ai` / `media-ai` | thumbnails, image AI, provider adapters | Aligned at top level. | Continue Phase 3B service/layer refactors separately. |
| `automation` / `agent-os` | `agent-registry`, `workflows`, `rules`, `action-task`, `marketplace`, `panel` | Partially folded by current hard-delete contract. `panel` and `action-task` are under `automation`; `agent-registry`, `workflows`, `rules`, `marketplace` remain top-level compatibility/capability surfaces. | Do not bulk fold. Continue narrow, survival-core-preserving PRs. |
| `analytics` | `dashboard`, `statistics`, `traffic`, `supplier-stats` | Not folded. Four read-model roots remain. | Lower priority than requested candidate domains; consider read-model consolidation later. |
| `platform` | `auth`, `companies`, `feature-gate`, `common`, `prisma`, uploads/platform infra | Mostly aligned. Extra platform-ish roots: `chat`, `activity-events`, `types`, `test-helpers`. | Record explicit platform classification before moving any of these. |

## Priority

### 1. Finance capability fold

Recommended next fold lane:

- `manual-ledger` -> `finance/manual-ledger` or `finance/adapter/in/http/manual-ledger`.
- `processing-costs` -> `finance/processing-costs` or finance application/service slice.
- `supplier-payments` -> `finance/supplier-payments`.
- `sales-plans` -> finance planning slice.
- `settlements` -> finance settlement/reconcile slice, after recording the Orders namespace tension.

Why first:

- The contract explicitly names most of these folders as finance convergence targets.
- Service sizes are modest except reporting/integration surfaces, so route-preserving moves are reviewable.
- Existing tests already cover tenant scoped mutations and settlement/finance integration behavior.
- Folding these reduces `AppModule` top-level noise without crossing into Agent OS survival core.

Scope rule:

- Keep the PR finance-only. Do not combine with `sourcing`, `orders`, analytics, or automation moves.
- If `settlements` moves in the same finance PR, explicitly preserve the `Settlement` read/write contract and note that Prisma currently namespaces it under Orders.

### 2. Sourcing / procurement owner decision and fold

Recommended next fold lane:

- Decide canonical root for the owner domain: `sourcing` or `procurement`.
- Fold `suppliers` under that root first.
- Fold `procurement` purchase-order state machine only after preserving its state-transition tests.
- Keep `sourcing` extension ingest and AgentRegistry delegation behind a clear incoming adapter/application service boundary.

Why second:

- The contract explicitly groups `sourcing`, `suppliers`, and `procurement`.
- `suppliers` is small CRUD; `procurement` has a concrete state machine.
- `sourcing` is externally pushed by browser extensions and delegates AI work, so it should not be mixed with finance/order folds.

Scope rule:

- Keep the PR within `sourcing` / `procurement` only.
- Do not move `supplier-payments` with this lane; the contract targets it to finance.

### 3. Orders return-transfer boundary

Recommended next fold lane:

- Write a small boundary note inside the orders child plan before moving `return-transfers`.
- If order/return lifecycle owns the business language, fold it under `orders`.
- If stock movement owns the invariant, update the topology contract before moving it under `inventory`.

Why third:

- `orders` already owns orders, returns, CS, and reviews.
- `return-transfers` is small, but its Prisma namespace is Inventory while the backend topology table points to Orders.
- Moving it without the owner decision risks weakening inventory stock movement invariants.

Scope rule:

- Keep the PR orders-only if it moves under `orders`.
- If the decision changes target ownership to inventory, make it an inventory-only PR and update the active topology contract first.

### 4. Automation / Agent OS remaining compatibility surfaces

Recommended next fold lane:

- Continue only narrow follow-up PRs from the existing hard-delete contract.
- Do not bulk move `agent-registry`, `workflows`, `rules`, and `marketplace` together.
- Prefer one survival-core-adjacent surface per PR: agent runtime internals, workflow HTTP compatibility, rules alerts/promotion, marketplace catalog read, or AgentRegistry domain post-processing.

Why fourth:

- It has the highest blast radius: workflow runner, AgentTask lifecycle, panel SSE, marketplace catalog install, rules callback, and agent runtime all share the same execution boundary.
- Current main already moved `panel`, `action-task`, workflow runner/orchestration, marketplace install, and agent application services under `automation`.
- Remaining top-level folders are compatibility or live runtime surfaces by contract, not simple table-shaped CRUD.

Scope rule:

- Keep every PR inside `automation` / `agent-os`.
- Preserve public route shapes and `AgentRegistryService` public injection token unless the child plan explicitly replaces them in the same PR.

### 5. Analytics read-model consolidation

Recommended later lane:

- `dashboard`, `statistics`, `traffic`, `supplier-stats` can converge under an `analytics` read-model owner.
- Defer until requested candidates above have an approved sequence.

Why later:

- Reporting read models have large raw SQL / aggregation surfaces.
- They are less urgent for owner-domain mutation topology than finance, supply, orders, and automation.

## Candidate Risks And Gates

### Automation / Agent OS

Primary risks:

- Breaking the survival core: DAG runner, WorkflowRun audit record, panel event projection, AgentRegistry delegation boundary, AgentTask lifecycle, adapter runtime boundary.
- Reintroducing direct LLM/provider calls in workflow/rules code instead of `agent_task.create` or `AgentRegistryService.runByType`.
- Weakening trusted tenant injection in `WorkflowRunnerService` or tenant-owned `AgentDefinition` mutation rules.
- Losing `EventEmitter2` panel/agent/rules event ordering or per-user panel visibility.
- Adding behavior to `agent-registry.service.ts` facade instead of `automation/application/service/agent-*`.
- Desynchronizing marketplace slim-core allowlist and workflow executor registration.
- Weakening rules schedule control through direct `HeartbeatService` / `AgentRegistryService` injection.

Required gates for an implementation PR:

```bash
git diff --check
npm run build --workspace=apps/server
npm run check:idor
npm run check:tenant-scope
npm run dev:server
npm exec --workspace=apps/server -- vitest run src/automation src/agent-registry src/rules src/marketplace
```

Add real-Postgres integration when moving panel snapshot/backfill, action-board claims/mutations, workflow run persistence, or AgentTask persistence:

```bash
npm run db:test:up
npm run db:test:prepare
DATABASE_URL=postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test npm exec --workspace=apps/server -- vitest run --config vitest.config.integration.ts src/automation
```

### Finance

Primary risks:

- Monetary calculation drift in P&L, sales analysis, settlements reconcile, supplier payments, and processing costs.
- Raw SQL tenant predicate regression in `settlements`.
- Moving finance satellites while their Prisma models span Finance, Supply, and Orders namespaces.
- Accidentally restoring `ProfitLoss` table reads in live aggregation paths.
- Weakening scoped mutation patterns in `manual-ledger`, `processing-costs`, `supplier-payments`, or `settlements`.
- Breaking downstream reporting consumers such as dashboard, statistics, sales-plans, and action-board metrics.

Required gates for an implementation PR:

```bash
git diff --check
npm run build --workspace=apps/server
npm run check:idor
npm run check:tenant-scope
npm run dev:server
npm exec --workspace=apps/server -- vitest run src/finance src/manual-ledger src/processing-costs src/supplier-payments src/settlements src/sales-plans
```

Add real-Postgres integration when moving live aggregation, settlement reconcile, or money-source joins:

```bash
npm run db:test:up
npm run db:test:prepare
DATABASE_URL=postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test npm exec --workspace=apps/server -- vitest run --config vitest.config.integration.ts src/finance src/settlements src/sales-plans
```

### Sourcing / Procurement

Primary risks:

- Breaking extension push routes: `/api/sourcing/extension/product-data`, `/api/sourcing/scrape-url`, `/api/sourcing/extension/products`.
- Losing idempotency around existing `MasterProduct` checks in `sourcing.service.ts`.
- Breaking Agent OS delegation from sourcing (`agentRegistry.runByType('sourcing', ...)`).
- Weakening purchase order state transitions: `draft -> pending -> ordered -> shipped -> received`.
- Folding `suppliers` without preserving tenant-scoped supplier reads/writes.
- Accidentally pulling `supplier-payments` into this PR even though the contract targets it to finance.

Required gates for an implementation PR:

```bash
git diff --check
npm run build --workspace=apps/server
npm run check:idor
npm run check:tenant-scope
npm run dev:server
npm exec --workspace=apps/server -- vitest run src/sourcing src/procurement src/suppliers
```

Add finance/supply regression tests only if the PR touches purchase-order payment references:

```bash
npm exec --workspace=apps/server -- vitest run src/supplier-payments src/procurement
```

### Orders

Primary risks:

- Breaking the channel-agnostic `Order` / `OrderLineItem` / `OrderReturn` / `OrderReturnLineItem` contract.
- Mixing `Order.status` and `OrderLineItem.status`, which have separate meanings.
- Bypassing channel adapters for confirmation or invoice upload.
- Breaking CS `productId` backward-compat alias before the frontend safe window is closed.
- Moving `return-transfers` without resolving whether Orders or Inventory owns the invariant.
- Breaking downstream finance/reporting paths that read order/return/settlement data.

Required gates for an implementation PR:

```bash
git diff --check
npm run build --workspace=apps/server
npm run check:idor
npm run check:tenant-scope
npm run dev:server
npm exec --workspace=apps/server -- vitest run src/orders src/return-transfers
```

Add real-Postgres integration when order import/sync, returns, settlement reads, or return-transfer stock movement is affected:

```bash
npm run db:test:up
npm run db:test:prepare
DATABASE_URL=postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test npm exec --workspace=apps/server -- vitest run --config vitest.config.integration.ts src/channels src/orders src/settlements
```

## Child Plan Checklist For Follow-Up Implementation

Each implementation child plan produced from this audit must include:

- [ ] One owner domain only: finance, sourcing/procurement, orders, automation/agent-os, analytics, or platform.
- [ ] Exact current route list and route-compatibility statement.
- [ ] Exact source and destination file map.
- [ ] Explicit decision on whether the target folder is owner domain, capability, platform, or reporting read model.
- [ ] Existing tests that stay load-bearing.
- [ ] Tests that may be collapsed because they only assert implementation placement.
- [ ] Domain-specific gates from this audit plus the Phase 3B gates from the master reconstruction plan.
- [ ] A statement that no Prisma schema gates run unless `prisma/models/**`, `prisma/schema.prisma`, or generated Prisma artifacts change.
- [ ] A statement that no `@kiditem/shared` root barrel expansion is allowed.

## Non-Goals

- No code movement in this audit plan.
- No folder rename in this audit plan.
- No schema change.
- No route change.
- No shared package change.
- No cross-owner implementation PR.
- No bulk automation fold.
- No analytics consolidation before the requested candidate domains have a signed sequence.
