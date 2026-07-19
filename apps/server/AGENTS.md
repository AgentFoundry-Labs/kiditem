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
| `products` | product operations, variants, central Sellpia-SKU recipes, and `/api/categories` compatibility |
| `sourcing` | Chinese product discovery, candidate inbox, account-scoped registration preparation |
| `supply` | suppliers, SellpiaInventorySku supplier policy, purchase orders |
| `inventory` | SellpiaInventorySku snapshot, warehouses, transfer/picking records |
| `orders` | orders, returns, CS/reviews, return-transfer surfaces |
| `finance` | P&L, settlements, supplier payments, cost/plan analytics |
| `advertising` | ad operations, scrape ingest, ad actions |
| `channels` | marketplace accounts, listing/option catalog import, product/variant matching, and order sync |
| `ai` | image/text/detail-page/thumbnail AI boundaries |
| `rules` | business policy definitions and Agent OS delegation |
| `agent-os` | agent catalog, queue, runtime, policy, cost, observability |
| `automation` | workflows, alerts, action board, panel projection |
| `analytics` | reporting/read models |
| `platform` | auth, organizations, feature gates, uploads, readiness, common infra |

Small table-shaped modules should fold into their owner domain during
reconstruction. `/api/categories` remains a products compatibility route.
Products owns `MasterProduct`, `ProductVariant`, and the central
`ProductVariantComponent` recipe. Inventory alone owns physical
`SellpiaInventorySku.currentStock`; Channels may link listings/options to
products/variants but must not persist a second recipe or stock balance.

## Scoped Guide Discovery

Do not rely on remembered backend rules as a complete index.
Before editing a backend file, use `rg --files -g AGENTS.md apps/server/src`
and read every applicable guide in path order: `apps/server/AGENTS.md`, then
the nearest owner-domain or nested surface guide that contains the target file.
If the work expands into another owner domain or nested surface, rerun
discovery and read the newly applicable guide before editing there.

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

Scoped server guides inherit this section unless they document a different
gate. For backend domain changes, run the narrow suite first when it exists:

```bash
npm exec --workspace=apps/server vitest -- run src/<domain-or-path>
```

Then run the backend gates:

```bash
npm run build --workspace=apps/server
npm run dev:server
```

Use `npm run check:idor` and `npm run check:tenant-scope` for
organization-owned services/controllers or raw SQL. Integration tests are
required for row locks, transaction invariants, Agent OS sink/reconcile paths,
and IDOR-sensitive behavior.
