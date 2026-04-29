# Backend Architecture Contract

**Date:** 2026-04-29
**Scope:** `apps/server/src/**` reconstruction rules.
**Status:** Governing contract for Phase 3B+ backend reconstruction.

## Goal

Define the backend target architecture before moving folders or rewriting large
domains. This prevents the reconstruction from becoming another round of small
file splits that preserve old coupling.

KidItem backend uses:

> Domain-first modular architecture with Application orchestration and
> selective Hexagonal Ports.

This is not full Clean Architecture everywhere. It is a practical target for
large domains, Agent OS/runtime boundaries, workflow/cron/agent entrypoints,
external providers, complex DB/DAO work, raw SQL, and core aggregate mutation
paths.

## Non-goals for the Contract PR

- No production behavior changes.
- No Prisma schema changes.
- No folder moves.
- No scanner additions unless separately planned.
- No attempt to retrofit every legacy CRUD service in one PR.
- No ADR documents. Permanent rules live in `AGENTS.md`, scoped `CLAUDE.md`,
  and active reconstruction plans.

## Reference Inputs

- `apps/server/AGENTS.md` and root `AGENTS.md` reconstruction rules.
- [`docs/superpowers/plans/2026-04-28-codebase-reconstruction.md`](2026-04-28-codebase-reconstruction.md).
- [`wikibook/clean-architecture`](https://github.com/wikibook/clean-architecture) — companion code describing a domain-centric hexagonal approach.
- [`Spring Guide - Directory`](https://cheese10yun.github.io/spring-guide-directory/) — domain-oriented package structure, domain/application/dao/global/infra tradeoffs.
- `/Users/dev125/Downloads/ㅇㅇㅇ.pdf` — local reference notes on DDD, Clean Architecture, hexagonal ports/adapters, and expressive package structure.

## Target Module Shape

New or materially rewritten owner domains converge toward:

```
src/{owner-domain}/
├── {owner-domain}.module.ts
├── adapter/
│   ├── in/
│   │   ├── http/
│   │   │   └── dto/
│   │   ├── workflow/
│   │   ├── cron/
│   │   └── agent/
│   └── out/
│       ├── prisma/
│       └── {provider}/
├── application/
│   ├── port/
│   │   ├── in/
│   │   └── out/
│   └── service/
├── domain/
│   ├── model/
│   ├── policy/
│   ├── repository/
│   └── service/
└── mapper/
```

HTTP DTOs live under `adapter/in/http/dto/`. Folders are created when needed. A
simple domain should not get empty layers.

Legacy flat CRUD may remain temporarily:

```
src/{legacy-domain}/
├── {legacy-domain}.module.ts
├── {legacy-domain}.controller.ts
├── {legacy-domain}.service.ts
└── dto/
```

That shape is tolerated legacy, not the target for reconstructed domains.

## Layer Rules

### Domain

Domain code contains business rules, policies, calculators, thresholds, state
transitions, domain models, and domain services.

Domain code must not import or depend on:

- NestJS decorators/classes.
- Prisma client/types.
- HTTP clients, provider SDKs, browser/extension SDKs, or filesystem APIs.
- AgentRegistry, workflow runtime, panel events, EventEmitter, queues, or cron.
- Environment variables or process-level configuration.

### Application

Application services own:

- Use-case orchestration.
- Transaction boundaries.
- Tenant context propagation.
- Idempotency and side-effect ordering.
- Calls to domain services and out ports.
- Composition across DAO, repository, provider clients, panel events, and
  Agent OS.
- Business-rule validation that needs current domain state before mutation.

Application services may depend on domain code and port interfaces. They should
not depend directly on Prisma, provider SDKs, concrete `adapter/out/**`
implementations, or another owner domain's service once the use case is
reconstructed. A reconstructed use case that needs DB, cross-domain, provider,
workflow, Agent OS, filesystem, or panel/event access defines an
`application/port/out/*` contract and lets the Nest module bind that contract to
the DAO/gateway/client adapter.

Application services should make use cases visible by name. Prefer
`ApproveAdActionService`, `SyncChannelMarketDataService`, or
`RecomputeBundleStockService` over generic `ManagerService` or table-shaped
CRUD services when the behavior has business meaning.

### Adapter In

Incoming adapters translate external entrypoints into application use cases:

- `adapter/in/http` — controllers and request binding.
- `adapter/in/workflow` — workflow runner entrypoints.
- `adapter/in/cron` — scheduled entrypoints.
- `adapter/in/agent` — Agent OS/runtime entrypoints.

Controllers validate DTOs and call application services. They do not hold
business rules.

HTTP DTO validation is syntactic input validation. Semantic validation that
requires domain state belongs in application/domain code.

### Adapter Out

Outgoing adapters implement external or infrastructure access:

- `adapter/out/prisma` — Prisma DAO implementations, query projections, raw
  SQL, tenant predicates, transactions, row locks, and hydration.
- `adapter/out/{provider}` — external APIs, LLM/model providers, browser or
  extension providers, filesystem/storage, panel/event bus, and runtime clients.

### DTO and Mapper

- `adapter/in/http/dto/` is for HTTP request/response DTOs and
  class-validator decorators.
- `mapper/` converts between Prisma/query rows, domain objects, and API/shared
  contracts.
- Do not let Prisma rows become the domain model by accident.

## When Ports Are Mandatory

Ports are mandatory for:

1. Agent OS/runtime delegation.
2. Workflow, cron, or agent entrypoints.
3. External APIs, model/LLM providers, browser/extension providers, filesystem,
   storage, panel events, or event buses.
4. Raw SQL, complex tenant predicates, row locks, transactions, and core
   aggregate mutations.
5. Use cases exposed by more than one incoming adapter.
6. Cross-runtime behavior that must be testable without the runtime present.
7. Cross-owner-domain collaboration that would otherwise import another
   domain's service or adapter directly.

Ports are optional/deferred for tiny legacy CRUD and low-risk read-only endpoints
that are not being reconstructed.

## DAO, Repository, Query Adapter

`DAO` is the target name for Prisma/DB access in reconstructed NestJS owner
domains. Use DAO classes for table/projection reads, DB writes, row mapping,
tenant predicates, raw SQL, row locks, and transaction helpers. DAO
implementations live under `adapter/out/prisma/*dao.ts`:

- `inventory.dao.ts`
- `inventory-query.dao.ts`
- `warehouses.dao.ts`
- `confirmed-orders-for-picking.dao.ts`

Application services do not import DAO implementations directly. They depend on
`application/port/out/*` contracts, and the owner module binds those contracts to
DAO providers. This keeps the orchestration layer testable with mock adapters and
keeps DB details out of application use-case code.

Use `Repository` only when it represents a domain collection abstraction:
preparing aggregates, enforcing repeated invariants, or hiding collection-level
complexity from the application layer. Repository names are not for 1:1 Prisma
wrappers. Put repository interfaces under `domain/repository/` when they are
pure domain collection contracts, or expose them as application out ports when
they need a Nest adapter binding.

If the object is mostly query or storage plumbing, prefer explicit DAO/gateway
adapter names:

- `*dao.ts`
- `*query-dao.ts`
- `*store.ts`
- `*gateway.ts`
- `*client.ts`

`persistence` is no longer the target naming convention. Existing
`persistence/` directories or `*persistence.ts` files are migration waypoints
only; do not copy that naming into new or materially rewritten code.

## Conscious Shortcuts

Some legacy or low-risk paths may intentionally remain flat. That is allowed
only when the shortcut is explicit:

- The scoped plan or instruction file says the path is transitional.
- The shortcut does not cross Agent OS, workflow, provider, filesystem, raw SQL,
  transaction, or core aggregate boundaries.
- The shortcut does not add new coupling to pure domain code.
- The shortcut does not make reconstructed application services import concrete
  `adapter/out/**` implementations or other owner-domain services directly.
- The follow-up reconstruction target is clear enough that future agents do not
  copy the shortcut as the standard.

Because ADR files are no longer used in KidItem, shortcut rationale is recorded
in `AGENTS.md`, scoped `CLAUDE.md`, or active reconstruction plans.

## Test Strategy

Architecture refactors should prefer tests that protect operating behavior, not
file placement:

- Pure domain rules: focused unit tests.
- Application use cases: unit tests with ports/fakes when side-effect ordering,
  state validation, or branching is important.
- Prisma adapters: integration tests when mapping, raw SQL, tenant predicates,
  row locks, transactions, or DB invariants are the risk.
- HTTP adapters: controller/e2e tests only when DTO mapping, auth/current-company
  propagation, or route contract is the risk.

Do not add implementation-detail mock tests just because code moved between
files. Use the existing repo gates from the master reconstruction plan.

## Backend Domain Topology

Frontend screens help discover workflows, but they do not define backend owner
domains. Backend owner domains are decided by data ownership, mutation
authority, transaction boundary, and invariants.

| Target owner domain/platform | Current folders likely to converge |
|---|---|
| `products` / `catalog` | `products`, `categories` |
| `sourcing` / `procurement` | `sourcing`, `suppliers`, `procurement` |
| `inventory` | `inventory`, `warehouses`, `stock-transfers`, `stock-audits`, `picking` |
| `orders` | `orders`, `return-transfers`, CS/review/order-adjacent surfaces |
| `finance` | `finance`, `manual-ledger`, `processing-costs`, `supplier-payments`, `settlements` |
| `advertising` | advertising operations, ad-action execution, ad metrics |
| `channels` | channel listings, channel sync, external marketplace spine |
| `ai` / `media-ai` | thumbnails, image analysis/generation, provider adapters |
| `automation` / `agent-os` | `agent-registry`, `workflows`, `rules`, `action-task`, `marketplace`, `panel` |
| `analytics` | `dashboard`, `statistics`, `traffic`, `supplier-stats` |
| `platform` | `auth`, `companies`, `feature-gate`, `common`, `prisma`, uploads/platform infra |

Adding a new top-level backend folder requires a scoped plan explaining why it is
an owner domain or platform concern, not just a table, feature tab, or page.

## Application Strength by Area

| Area | Target posture |
|---|---|
| Agent OS, workflows, advertising, AI, channels | Strong application + ports/adapters. These cross runtimes, providers, raw SQL, or external systems. |
| Products, inventory | Strong domain-first. Core aggregate mutation, stock, bundle, SKU, and row-lock rules belong in pure domain/application boundaries. |
| Orders, rules, action-task, marketplace, procurement, picking | Medium. Use application orchestration and ports when state transitions, agent/workflow delegation, or external side effects appear. |
| Dashboard, finance reports, statistics, traffic, supplier-stats | Query adapter/read contract focus. Keep raw SQL and report hydration out of controllers. |
| Suppliers, warehouses, categories, manual-ledger, processing-costs, supplier-payments | Transitional legacy CRUD until folded into owner domains or given a concrete invariant/transaction reason to reconstruct. |

## Follow-up PR Order

1. Align existing Phase 3B child plans with this contract before more folder
   moves. Advertising plans should stop treating `ingest`, `read-models`, and
   `persistence` as the final standard.
2. Create a lightweight domain-purity scanner only after the contract lands.
3. Run one owner-domain architecture PR at a time unless the work is a documented
   platform-boundary exception.
4. Treat `automation` / `agent-os` as the next architecture decision surface
   before deleting workflow/agent logic.

## Verification for This PR

This contract PR is instruction-only:

```bash
git diff --check
```

No backend/frontend/schema build is required unless production code changes in
the same PR.
