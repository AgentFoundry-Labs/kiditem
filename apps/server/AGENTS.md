# apps/server — NestJS Backend

`apps/server/` owns HTTP entrypoints, organization-scoped application services,
Prisma adapters, provider adapters, and cross-domain backend ports. The local
API runs on port 4000.

## Ownership

| Owner | Scope |
|---|---|
| `products` | canonical `MasterProduct`, categories compatibility, ABC, listing-option inventory composition |
| `sourcing` | Chinese discovery, candidate inbox, account-scoped registration preparation |
| `supply` | suppliers, inventory-SKU supplier policy, purchase orders |
| `inventory` | physical inventory-SKU snapshot, warehouses, transfer/picking |
| `orders` | orders, returns, CS/reviews, return-transfer surfaces |
| `finance` | P&L, settlements, supplier payments, cost/plan analytics |
| `advertising` | ad operations, scrape ingest, ad actions |
| `channels` | marketplace accounts, listing/option import and inventory matching |
| `ai` | image, text, detail-page, and thumbnail AI boundaries |
| `rules` | business policies and Agent OS delegation |
| `agent-os` | agent catalog, queue, runtime, policy, cost, observability |
| `automation` | workflows, alerts, action board, panel projection |
| `analytics` | reporting and read models |
| platform modules | auth, organizations, feature gates, uploads, readiness, common infrastructure |

Domain guides own the detailed identity and mutation rules. In particular,
inventory owns physical stock, products owns canonical product metadata and the
consumption recipe, and channels owns listing/option identity; do not recreate
an operating variant layer, second recipe, or stock balance.

## HTTP Contracts

- The global prefix is `/api`; do not add `/v1`.
- Global DTO validation uses `ValidationPipe({ whitelist: true, transform:
  true })`.
- Controllers pass `organizationId` from `@CurrentOrganization()`; request DTOs
  never accept it.
- Controllers do not use `as any`. Missing resources throw
  `NotFoundException`, not an HTTP-200 failure object.
- Single-resource GET/PATCH/DELETE uses `{ id, organizationId }` scope;
  `findUnique({ where: { id } })` is an IDOR defect.

## Module Boundaries

- Flat controller/service modules remain valid for simple CRUD. Introduce
  ports/adapters for a real IO seam, cross-domain mutation, transaction/row
  lock, shared use case, meaningful pure policy, or large-file pressure.
- Domain code is pure: no NestJS, Prisma, HTTP/provider SDK, workflow/Agent OS
  runtime, filesystem, or panel/event infrastructure.
- Entry adapters live under `adapter/in/{http,agent,workflow,cli}`. Shared use
  cases may publish capability-oriented interfaces under
  `application/port/in`; never classify incoming ports by caller type.
- Application services depend on `application/port/out/<lane>` interfaces. Use
  the narrowest applicable lane: `repository`, `transaction`, `provider`,
  `storage`, `runtime`, `event`, `sink`, `workflow`, or `cross-domain`.
  Direct `application/port/out/*.ts` requires an architecture note and checker
  change.
- Application services never import concrete `adapter/out/**` implementations
  or another owner's service. Prisma belongs in outgoing persistence adapters
  or explicitly documented legacy CRUD services.
- The owning module publishes cross-domain capability. Consumers use that
  incoming interface or a narrow local anti-corruption port; do not move domain
  behavior into `common` merely for reuse.
- Capability manifests under `domain/capability/` describe `resource`, `tool`,
  `workflow`, and `sink` surfaces with the shared vocabulary; they do not
  execute work or bypass incoming ports.
- Lane-local barrels are allowed. Broad `application/index.ts` or
  `application/port/index.ts` barrels are not.

## Special Surfaces

- Automation owns panel endpoints/projection and the action board, including
  `/api/action-tasks/*`.
- `src/feature-gate/` owns feature endpoint/config behavior only.
- `/api/categories` remains a products compatibility route.

## Verification

Run the narrow domain suite first when one exists:

```bash
npm exec --workspace=apps/server vitest -- run src/<domain-or-path>
```

Then run:

```bash
npm run build --workspace=apps/server
npm run dev:server
```

Organization-owned controllers/services or raw SQL also require
`npm run check:idor` and `npm run check:tenant-scope`. Use integration tests for
row locks, transaction invariants, Agent OS sink/reconcile paths, and
IDOR-sensitive behavior.
