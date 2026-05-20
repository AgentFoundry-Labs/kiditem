# apps/server — NestJS Backend

`apps/server/` is the NestJS API on port 4000. It owns HTTP entrypoints,
organization-scoped application services, Prisma adapters, provider adapters,
and cross-domain backend ports.

## Folder Map

```text
apps/server/
├── src/
│   ├── {owner-domain}/       # business/platform owner modules
│   ├── auth/                 # authentication and organization context
│   ├── common/               # shared backend infrastructure
│   ├── prisma/               # PrismaService and DB module
│   └── main.ts               # app bootstrap
└── AGENTS.md                 # shared backend rules
```

Target structure for reconstructed owner domains:

```text
src/{owner-domain}/
├── {owner-domain}.module.ts
├── adapter/in/http/          # controllers + HTTP DTO binding
├── adapter/out/{lane}/       # DB/provider/runtime/storage/event adapters
├── application/
│   ├── port/in/              # incoming use-case ports when useful
│   ├── port/out/             # DB/cross-domain/provider/runtime ports
│   └── service/              # orchestration and transactions
├── domain/                   # pure model/policy/services; no IO
└── mapper/                   # row/DTO/domain mapping
```

Flat controller/service modules are valid for simple owner capabilities and
legacy CRUD. Convert to ports/adapters only when a real seam exists: provider
SDK, Agent OS/runtime, workflow integration, cross-domain mutation, raw SQL,
row-lock transaction, shared use-case consumer, meaningful pure policy,
LLM/media/storage/fetch boundary, or large-file pressure.

## Owner Domain Map

| Owner | Scope |
|---|---|
| `products` | catalog, options, categories compatibility, bundle stock |
| `sourcing` | Chinese product discovery, candidate inbox, promotion |
| `supply` | suppliers, master-supplier policy, purchase orders |
| `inventory` | inventory, warehouses, transfers, audits, picking |
| `orders` | orders, returns, CS/reviews, return-transfer surfaces |
| `finance` | P&L, settlements, supplier payments, cost/plan analytics |
| `advertising` | ad operations, scrape ingest, ad actions |
| `channels` | marketplace account/listing/order sync and reconciliation |
| `ai` | image/text/detail-page/thumbnail AI boundaries |
| `rules` | business policy definitions and Agent OS delegation |
| `agent-os` | agent catalog, queue, runtime, policy, cost, observability |
| `automation` | workflows, alerts, action board, panel projection |
| `analytics` | reporting/read models |
| `platform` | auth, organizations, feature gates, uploads, readiness, common infra |

Small table-shaped modules should fold into their owner domain during
reconstruction. `/api/categories` remains a products compatibility route.

## Scoped Guides

Read the nearest guide before editing:

| Path | Focus |
|---|---|
| [`src/advertising/AGENTS.md`](src/advertising/AGENTS.md) | ad operations and daily facts |
| [`src/agent-os/AGENTS.md`](src/agent-os/AGENTS.md) | Agent OS platform runtime |
| [`src/ai/AGENTS.md`](src/ai/AGENTS.md) | media AI, prompts, provider ports, sinks |
| [`src/analytics/AGENTS.md`](src/analytics/AGENTS.md) | reporting/read models |
| [`src/analytics/dashboard/AGENTS.md`](src/analytics/dashboard/AGENTS.md) | dashboard raw-SQL read model |
| [`src/automation/AGENTS.md`](src/automation/AGENTS.md) | workflows, alerts, action board, panel |
| [`src/auth/AGENTS.md`](src/auth/AGENTS.md) | guards, decorators, Supabase auth |
| [`src/channels/AGENTS.md`](src/channels/AGENTS.md) | marketplace sync and reconciliation |
| [`src/chat/AGENTS.md`](src/chat/AGENTS.md) | CopilotKit and Claude CLI adapter |
| [`src/finance/AGENTS.md`](src/finance/AGENTS.md) | finance aggregation and payments |
| [`src/inventory/AGENTS.md`](src/inventory/AGENTS.md) | stock single-writer and inventory ops |
| [`src/orders/AGENTS.md`](src/orders/AGENTS.md) | order/return channel-agnostic spine |
| [`src/products/AGENTS.md`](src/products/AGENTS.md) | catalog/options/bundle stock |
| [`src/rules/AGENTS.md`](src/rules/AGENTS.md) | rules evaluation and Agent OS delegation |
| [`src/sourcing/AGENTS.md`](src/sourcing/AGENTS.md) | discovery, candidate inbox, promotion |
| [`src/supply/AGENTS.md`](src/supply/AGENTS.md) | suppliers and procurement |

## Global HTTP Rules

- Global prefix is `/api`; do not add `/v1`.
- DTO validation uses the global `ValidationPipe({ whitelist: true, transform:
  true })`.
- Controllers pass `organizationId` from `@CurrentOrganization()`; body/query
  DTOs must not accept `organizationId`.
- Controllers do not use `as any`.
- Not found means `NotFoundException`; do not encode failures as `{ ok: false }`
  with HTTP 200.
- Single-resource GET/PATCH/DELETE uses `{ id, organizationId }` scope.
  `findUnique({ where: { id } })` is an IDOR bug.

## Boundary Rules

- Domain code is pure: no NestJS, Prisma, HTTP/provider SDKs, workflow runtime,
  AgentRegistry, filesystem, or panel/event infrastructure.
- Domain capability manifests live under `domain/capability/` and use the
  shared vocabulary in `src/common/capability-manifest.ts` to describe the
  owner-exposed `resource`, `tool`, `workflow`, and `sink` surface. Manifests do
  not execute work or bypass owner incoming ports.
- Reconstructed application services depend on `application/port/out/*`
  contracts for DB, cross-domain, provider, Agent OS, workflow, filesystem,
  event, raw-SQL, transaction, and row-lock boundaries.
- Do not import concrete `adapter/out/**` implementations or another owner
  domain service from `application/service/**`.
- Prisma belongs in outgoing repository/query adapters or documented legacy
  CRUD services.
- Production raw SQL uses Prisma tagged templates only. No
  `$queryRawUnsafe` or `$executeRawUnsafe`.
- Organization/customer boundary is `Organization` / `organizationId`; do not
  add `tenantId` to code, schema, DTOs, or routes.
- Use focused shared subpaths such as `@kiditem/shared/inventory`; do not
  expand the `@kiditem/shared` root barrel for new domains.
- Do not add substantial behavior to 700+ line services/components. Changes to
  500+ line files require explicit reconstruction classification in review.

## Port Directory Rules

Hexagonal owner modules classify ports by direction first. The second-level
folder is intentionally asymmetric: incoming ports are owner capability
Interfaces, while outgoing ports are driven Adapter family Interfaces.

Incoming ports live under `application/port/in/`. Keep them flat when the owner
publishes only one or two use-case Interfaces. Use a capability folder when
three or more incoming ports share one owner capability, when a capability is
published as an Agent/tool surface, or when the incoming Interface is exported
for multiple consuming owners.

Do not classify incoming ports by caller or entrypoint type. Folders such as
`application/port/in/agent/`, `application/port/in/http/`, and
`application/port/in/workflow/` are forbidden. HTTP, Agent, workflow, and CLI
entrypoints belong under `adapter/in/{http,agent,workflow,cli}/` and may share
the same incoming capability Interface.

Outgoing ports live under `application/port/out/`. Use these lane folders when
the lane exists:

- `repository/` for Prisma or raw-SQL persistence Interfaces.
- `transaction/` for unit-of-work or row-lock transaction Interfaces.
- `provider/` for external API, SDK, LLM, marketplace, scrape, fetch, or model
  provider Interfaces.
- `storage/` for object, file, image, or media storage Interfaces.
- `runtime/` for Agent OS, worker, browser, CLI, or execution runtime
  Interfaces.
- `event/` for event publication, audit, activity, panel, or ledger event
  Interfaces.
- `sink/` for finalized-output projection or event-consuming Interfaces.
- `workflow/` for workflow orchestration, cancellation, or workflow engine
  Interfaces.
- `cross-domain/` for anti-corruption Interfaces to another owner Module.

Outgoing port files do not stay directly under `application/port/out/`.
Domain-specific outgoing ports still use the narrowest lane that explains the
Adapter family. A direct `application/port/out/*.ts` exception requires both a
documented architecture note and an explicit checker change.

Cross-domain capabilities are not copied into `common` by default. The owning
Module publishes an incoming Interface from `application/port/in/`, and
consuming Modules depend on that Interface or define a narrow local outgoing
Interface only when they need an anti-corruption Seam.

Lane folders may export a local `index.ts`. Do not add broad barrels such as
`application/port/index.ts` or `application/index.ts`; those hide the IO lane
and weaken the Adapter Seam.

## Special Surfaces

- Panel is owned by automation:
  `src/automation/adapter/in/http/panel.controller.ts`,
  `src/automation/adapter/out/panel-event/`, and
  `src/automation/mapper/panel-event/`.
- Action board is owned by automation. `/api/action-tasks/*` lives in
  `automation/adapter/in/http/action-task.controller.ts`.
- `src/feature-gate/` owns feature flag endpoint/config behavior only.

## Verification

For backend changes, run the narrow domain test first when available, then:

```bash
npm run build --workspace=apps/server
npm run dev:server
```

Use `npm run check:idor` and `npm run check:tenant-scope` for
organization-owned services/controllers or raw SQL. Integration tests are
required for row locks, transaction invariants, Agent OS sink/reconcile paths,
and IDOR-sensitive behavior.
