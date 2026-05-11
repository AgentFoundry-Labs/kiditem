# apps/server — NestJS Backend

Backend API on port 4000.

## Run

```bash
npm run start:dev
npm run build
docker compose up -d
```

Env: `.env` -> `DATABASE_URL`, `CHANNEL_CREDENTIALS_ENCRYPTION_KEY`,
`GEMINI_API_KEY`, and domain-specific provider keys.

## Scope Instructions

- Read the nearest `AGENTS.md` before editing a domain.
- `CLAUDE.md` is only a Claude compatibility shim; shared rules live here or in
  the scoped `AGENTS.md`.
- Do not append historical notes. When adding a durable rule, replace or compact
  the adjacent rule set in the same change.

## Backend Architecture Contract

Target architecture for new or materially rewritten owner domains:

```text
src/{owner-domain}/
  {owner-domain}.module.ts
  adapter/in/http/        controllers + HTTP DTO binding
  adapter/out/{lane}/     DB/provider/runtime/storage/event adapters
  application/port/in/    incoming use-case ports, when useful
  application/port/out/   DB/cross-domain/provider/runtime ports
  application/service/    orchestration, transactions, organization context
  domain/                 pure model/policy/services; no IO
  mapper/                 row/DTO/domain mapping
```

Flat `controller -> service -> PrismaService` modules are tolerated only for
small legacy CRUD. A new top-level folder needs owner-domain justification:
data ownership, mutation authority, transaction boundary, and invariants.

## Architecture Modes

Each `src/{owner-domain}/AGENTS.md` declares one mode:

| Mode | Meaning |
|---|---|
| Reconstructed Hexagonal | Uses the owner-domain layout above; new behavior follows port/adapter boundaries. |
| Mixed Reconstruction | Some surfaces are hexagonal and named; remaining flat exceptions are listed and may not grow silently. |
| Transitional Flat | Current scope is small enough for controller/service/DTO, but expansion triggers require a reconstruction plan. |
| Platform / Projection Adapter | Infrastructure, runtime, auth, or read projection surface with a local boundary contract instead of business aggregate ownership. |

Flat folders stay flat only while they have no provider SDK, Agent OS/runtime,
workflow integration, cross-domain mutation, raw SQL/row-lock transaction,
shared use-case consumer, meaningful pure domain policy, LLM/prompt/media/
storage/fetch boundary, or 500+ line service pressure. Adding any of those is a
reconstruction trigger; do not grow the flat service in place.

Every scoped backend `AGENTS.md` should state: mode, local layout, allowed IO
lanes, forbidden imports, flat exceptions if any, and verification gates.

## Global HTTP Rules

- Global prefix is `/api`; do not add `/v1`.
- DTO validation uses the global `ValidationPipe({ whitelist: true, transform:
  true })`; new endpoints use class-validator DTOs.
- Controllers pass `organizationId` from `@CurrentOrganization()`; body/query
  DTOs must not accept `organizationId`.
- Controllers do not use `as any`. Service command types should match DTOs or a
  nearby application command interface.
- Not found means `NotFoundException`; do not encode failures as `{ ok: false }`
  with HTTP 200.
- Single-resource GET/PATCH/DELETE uses `{ id, organizationId }` scope.
  `findUnique({ where: { id } })` is an IDOR bug.

## Reconstruction Rules

- Domain code is pure: no NestJS, Prisma, HTTP/provider SDKs, workflow runtime,
  AgentRegistry, filesystem, or panel/event infrastructure.
- Reconstructed application services depend on `application/port/out/*`
  contracts for DB, cross-domain, provider, Agent OS, workflow, filesystem, and
  panel/event boundaries. Nest modules bind those ports to adapters.
- Do not import concrete `adapter/out/**` implementations or another owner
  domain service from `application/service/**`.
- Prisma belongs in outgoing repository/query adapters or transitional legacy
  CRUD services.
- Ports are mandatory for Agent OS/runtime, workflow/cron, external APIs, LLMs,
  browser/extension providers, filesystem/storage, event buses, raw SQL,
  transactions, row locks, core aggregate mutations, and use cases exposed by
  more than one incoming adapter.
- Ports may be deferred for tiny legacy CRUD and low-risk read-only endpoints
  that are not being reconstructed.
- Do not add substantial behavior to 700+ line services/components. Changes to
  500+ line files require explicit reconstruction classification in PR review.
- Review triggers: 10+ files, cross-layer controls, or LLM/provider/media/
  storage/fetch/runtime/sink/reconcile changes need explicit contract/test/gate
  classification before approval.

## Data Access And Naming

- Production raw SQL uses Prisma tagged templates only. No `$queryRawUnsafe` or
  `$executeRawUnsafe`.
- `$queryRaw` over organization-owned tables must bind an organization predicate
  such as `organization_id = ${organizationId}::uuid`.
- `Organization` / `organizationId` is the SaaS/customer boundary. Do not add
  `tenantId` to code, schema, DTOs, or routes.
- `OrganizationMembership` is the source of truth for the active organization
  and role. `User.organizationId` must not be reintroduced.
- Use focused shared subpaths such as `@kiditem/shared/inventory`; do not expand
  the `@kiditem/shared` root barrel for new domains.
- DB-backed reconstructed adapters usually live under
  `adapter/out/repository/*.repository.adapter.ts`. Do not make DAO/Repository/
  Prisma a global naming dogma, and do not use `*persistence.ts` for final
  naming in new reconstructed code.

## Owner Domain Map

| Owner | Notes |
|---|---|
| `products` | catalog, categories compatibility, bundle stock writer |
| `sourcing` | sourcing ingest/scrape, suppliers, procurement |
| `inventory` | inventory, unshipped, warehouses, stock transfers/audits, picking |
| `orders` | orders, returns, CS/reviews, return-transfer surfaces |
| `finance` | P&L, settlements, supplier payments, cost/plan analytics |
| `advertising` | ad operations, scrape ingest, ad-action execution |
| `channels` | marketplace account/listing/order sync and reconciliation |
| `ai` | image/text/detail-page/thumbnail AI provider boundaries |
| `rules` | business policy definitions and Agent OS delegation |
| `agent-os` | platform runtime for agent catalog, queue, execution, policy, cost |
| `automation` | workflows, alerts, action board, panel projection |
| `analytics` | reporting/read models |
| `platform` | auth, organizations, feature-gate, common, prisma |

Small table-shaped modules should fold into their owner domain during
reconstruction. `/api/categories` remains a products/catalog compatibility
route implemented under `src/products/categories/`.

## Domain Guides

Read these before editing the matching path.

| Path | Focus |
|---|---|
| [`src/advertising/AGENTS.md`](src/advertising/AGENTS.md) | ad operations, scrape ingest, daily facts |
| [`src/agent-os/AGENTS.md`](src/agent-os/AGENTS.md) | Agent OS platform runtime |
| [`src/ai/AGENTS.md`](src/ai/AGENTS.md) | media AI, prompts, provider ports, Agent OS sinks |
| [`src/analytics/AGENTS.md`](src/analytics/AGENTS.md) | reporting/read models |
| [`src/automation/AGENTS.md`](src/automation/AGENTS.md) | workflows, alerts, action board, panel projection |
| [`src/auth/AGENTS.md`](src/auth/AGENTS.md) | auth guards, current org/user decorators |
| [`src/channels/AGENTS.md`](src/channels/AGENTS.md) | Coupang sync/reconciliation/provider boundary |
| [`src/chat/AGENTS.md`](src/chat/AGENTS.md) | CopilotKit runtime and Claude CLI adapter |
| [`src/finance/AGENTS.md`](src/finance/AGENTS.md) | finance analytics and KST windows |
| [`src/inventory/AGENTS.md`](src/inventory/AGENTS.md) | inventory owner domain and single writer |
| [`src/orders/AGENTS.md`](src/orders/AGENTS.md) | order/return channel-agnostic spine |
| [`src/products/AGENTS.md`](src/products/AGENTS.md) | products/catalog and bundle stock |
| [`src/rules/AGENTS.md`](src/rules/AGENTS.md) | rules evaluation and Agent OS delegation |
| [`src/sourcing/AGENTS.md`](src/sourcing/AGENTS.md) | sourcing/procurement state machine |
| [`src/automation/adapter/out/panel-event/AGENTS.md`](src/automation/adapter/out/panel-event/AGENTS.md) | Live Ops SSE projection |
| [`src/automation/adapter/out/workflow-runner/AGENTS.md`](src/automation/adapter/out/workflow-runner/AGENTS.md) | workflow executor adapter |

## Special Surfaces

- Panel is owned by automation:
  `src/automation/adapter/in/http/panel.controller.ts`,
  `src/automation/adapter/out/panel-event/`, and
  `src/automation/mapper/panel-event/`. It is an SSE projection, not a
  standalone owner domain.
- Action board is owned by automation. `/api/action-tasks/*` lives in
  `automation/adapter/in/http/action-task.controller.ts`.
- `src/feature-gate/` owns feature flag endpoint/config behavior only.

## Verification

```bash
npx vitest run
npm run build --workspace=apps/server
npm run dev:server
```

Use `npm run check:idor` and `npm run check:tenant-scope` for PRs touching
organization-owned services/controllers or raw SQL. Integration tests are
required for row-locks, transaction invariants, Agent OS sink/reconcile paths,
and IDOR-sensitive behavior.
