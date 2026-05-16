# KidItem Architecture

KidItem is an ecommerce operations automation monorepo for kids' products:
sourcing, catalog, channel listings, media AI, inventory, orders, finance,
advertising, analytics, and Agent OS automation.

## Runtime Topology

```
Browser
  -> apps/web (Next.js 16, React 19)
  -> apps/server (NestJS 11, /api prefix)
  -> PostgreSQL 17 (Prisma v7)

apps/server
  -> Coupang Wing / channel providers
  -> Gemini / image providers
  -> Claude CLI Agent OS runtime
  -> Python sourcing/scraping agents
```

Frontend code never talks to the database directly. All app data flows through
NestJS APIs and shared Zod contracts from `@kiditem/shared`.

## Monorepo Shape

```
apps/web/            Next.js frontend, App Router route groups
apps/server/         NestJS backend API and Agent OS runtime
agents/              Python 3.11+ worker/server code
packages/shared/     Zod schemas, shared TypeScript types, error codes
packages/templates/  React detail-page templates
prisma/              Prisma multi-file schema source of truth
extensions/          Browser extensions for sourcing / marketplace ingest
```

## Shared Contract Architecture

`packages/shared` exposes frontend/backend contracts through focused subpath
exports. New or rebuilt domains add `@kiditem/shared/{domain}` entrypoints
instead of expanding the root barrel.

Exported Zod schema values use PascalCase `FooSchema`; exported TypeScript
types use `export type Foo = z.infer<typeof FooSchema>`. Existing violations
remain protected by the baseline checker until migrated, and new aliases should
not be added for them.

## Backend Directory Architecture

Backend folders are owner domains, owner capabilities, platforms, or support
folders. They are not DB-table mirrors or frontend page names. Implementation
structure has only two classifications for business/platform code:
`Hexagonal` or `Flat`. Flat is a valid structure, not merely a waiting room for
hexagonal conversion; when complexity appears, first make caller/route-family,
workflow-stage, and shared-interface names visible, then add ports only for
real seams. Support folders have no business implementation structure.

Kinds:

- `Owner Domain`: owns business invariants or mutation authority.
- `Owner Capability`: small capability with a bounded HTTP/service surface.
- `Owner Read Model`: reporting/projection capability.
- `Compatibility Lane`: legacy or shim surface kept under an owner folder.
- `Platform`: cross-domain runtime or orchestration owner.
- `Platform Capability`: small infrastructure endpoint or service.
- `Platform Support`: shared backend infrastructure or helpers.
- `Test Support`: test-only helpers.

Structures:

- `Hexagonal`: uses `adapter/`, `application/`, optional `domain/`, and optional
  `mapper/` lanes.
- `Flat`: controller/service/DTO or adjacent module/service files.

### Backend Directory Map

This map answers ownership first. If one folder owns multiple capabilities,
their implementation structures are listed in the Backend Implementation Map.

| Path | Kind | Ownership / Surfaces |
|---|---|---|
| `apps/server/src/activity-events` | Owner Capability | Activity event read endpoint. |
| `apps/server/src/advertising` | Owner Domain | Coupang ad operations, scrape ingest, daily facts, strategy/action generation. |
| `apps/server/src/agent-os` | Platform | Agent catalog, queue, runtime, policy, cost, and observability. |
| `apps/server/src/ai` | Owner Domain | Image/text/detail-page/thumbnail AI provider and Agent OS output boundaries. |
| `apps/server/src/analytics` | Owner Read Model | Dashboard, statistics, traffic, and supplier-stats reporting. |
| `apps/server/src/auth` | Platform Capability | Guards, decorators, middleware, and `/api/auth/me`. |
| `apps/server/src/automation` | Platform | Workflows, alerts, action board, marketplace install, and panel projection. |
| `apps/server/src/channels` | Owner Domain | Marketplace account, listing, order, return, sync, and reconciliation provider boundaries. |
| `apps/server/src/chat` | Platform Capability | CopilotKit bridge and Claude CLI adapter. |
| `apps/server/src/common` | Platform Support | Shared backend DTOs, filters, KST/date helpers, security, storage, and pricing helpers. |
| `apps/server/src/feature-gate` | Platform Capability | Feature flag endpoint and config behavior. |
| `apps/server/src/finance` | Owner Domain | P&L, sales analysis, manual ledger, costs, payments, plans, settlements. |
| `apps/server/src/inventory` | Owner Domain | Stock, unshipped, warehouses, transfers, audits, and picking. |
| `apps/server/src/orders` | Owner Domain | Orders, returns, CS, reviews, and return-transfer operations. |
| `apps/server/src/organizations` | Platform Capability | Organization listing surface. |
| `apps/server/src/prisma` | Platform Support | `PrismaModule` and `PrismaService` only. |
| `apps/server/src/products` | Owner Domain | Catalog families, physical SKU options, bundle composition, categories compatibility. |
| `apps/server/src/readiness` | Platform Capability | Readiness checks and health-style operational surface. |
| `apps/server/src/rules` | Owner Domain | Business rules HTTP orchestration and Agent OS delegation. |
| `apps/server/src/sourcing` | Owner Domain | Chinese new-product discovery (scraper ingest, SourcingCandidate inbox, candidate→master promotion). |
| `apps/server/src/supply` | Owner Domain | Supplier registry, master-supplier policy, purchase-order procurement. Extracted from sourcing/ during issue #192 follow-up Track A PR 1. |
| `apps/server/src/test-helpers` | Test Support | Test-only Prisma and seed helpers. |
| `apps/server/src/types` | Platform Support | Ambient/server TypeScript types. |
| `apps/server/src/uploads` | Platform Capability | Upload endpoint and storage bridge. |

### Backend Implementation Map

Only `Hexagonal` and `Flat` are valid implementation structures. Support
folders are intentionally absent from this map.

| Path | Structure | Required / Optional Contract |
|---|---|---|
| `apps/server/src/activity-events` | Flat | module/controller/service/`dto/`. |
| `apps/server/src/advertising` | Hexagonal | port/adapter lanes complete; new ingest, daily-fact, and ad-action behavior uses `adapter/out/repository/` + `application/port/out/*` ports; architecture spec freezes invariants. |
| `apps/server/src/advertising/services` | Flat | compatibility facade lane only; no new business logic. |
| `apps/server/src/agent-os` | Hexagonal | runtime, queue, repository, policy, and event boundaries behind ports/adapters. |
| `apps/server/src/ai` | Hexagonal | provider, runtime handler, bridge, sink, media, fetch, and storage boundaries behind ports/adapters. |
| `apps/server/src/analytics/dashboard` | Hexagonal | port/adapter lanes complete; 8 outgoing ports + repository adapters cover Prisma reads, application services are Prisma-free, architecture + module wiring specs freeze invariants. |
| `apps/server/src/analytics/statistics` | Flat | read service. |
| `apps/server/src/analytics/traffic` | Flat | read service plus operator upload mutation lane. |
| `apps/server/src/analytics/supplier-stats` | Flat | supplier report service. |
| `apps/server/src/auth` | Flat | guards/decorators/middleware/controller. |
| `apps/server/src/automation` | Hexagonal | port/adapter lanes complete; 6 outgoing repository ports + `OPERATION_ALERT_PORT` owner-side incoming port published from `application/port/in/` for cross-domain producers; architecture + module wiring specs freeze invariants; `WorkflowRunnerService` PrismaService carve-out documented for the executor framework. |
| `apps/server/src/channels` | Hexagonal | provider APIs use `application/port/out` plus `adapter/out/coupang`. |
| `apps/server/src/channels/adapters` | Flat | compatibility shims only; new provider work uses `adapter/out/coupang/`. |
| `apps/server/src/chat` | Flat | controller/service/Claude CLI adapter. |
| `apps/server/src/feature-gate` | Flat | endpoint/config capability. |
| `apps/server/src/finance` | Flat | controllers/services/DTO plus folded finance capabilities. |
| `apps/server/src/inventory` | Hexagonal | reference owner-domain structure for stock mutations. |
| `apps/server/src/orders` | Flat | controllers/services/DTO plus folded order capabilities. |
| `apps/server/src/organizations` | Flat | controller/service capability. |
| `apps/server/src/products` | Hexagonal | catalog and bundle-stock behavior uses adapter/application/domain lanes. |
| `apps/server/src/products/categories` | Flat | `/api/categories` compatibility capability under products ownership. |
| `apps/server/src/readiness` | Flat | readiness controller/service. |
| `apps/server/src/rules` | Flat | HTTP orchestration delegates execution to Agent OS ports. |
| `apps/server/src/sourcing` | Hexagonal | sourcing agent/products boundaries behind ports/adapters. |
| `apps/server/src/supply` | Flat | supplier CRUD + purchase-order procurement (transitional flat capability services). |
| `apps/server/src/uploads` | Flat | upload controller/service/storage bridge. |

### Backend Structure Contracts

Hexagonal owner capabilities use this shape:

```text
apps/server/src/{owner}/
  {owner}.module.ts
  adapter/in/http/        HTTP controllers and DTO binding, when HTTP exists
  adapter/out/{lane}/     DB/provider/runtime/storage/event adapters
  application/port/in/    incoming use-case ports, when other domains consume them
  application/port/out/   outgoing DB/cross-domain/provider/runtime contracts
  application/service/    orchestration, transactions, organization context
  domain/                 pure policy/model/service code
  mapper/                 row/DTO/domain/shared contract mapping
```

Required: module file, `application/service/`, and a port/adapter boundary for
each DB, provider, runtime, storage, event, workflow, or cross-domain IO lane.
Optional: `adapter/in/http/` when no HTTP entrypoint exists, `application/port/in/`
when no other owner consumes the use case, `domain/` when no pure policy/model
exists yet, and `mapper/` when mapping is trivial.

Flat owner capabilities use this shape:

```text
apps/server/src/{capability}/
  {capability}.module.ts
  *.controller.ts or controllers/
  *.service.ts or services/
  dto/                    when HTTP input exists
  {sub-capability}/       allowed for folded capability surfaces
```

Required: module file plus controller/service files for HTTP capabilities.
Optional: `dto/` when there is no HTTP input contract and sub-capability folders
only when they remain owned by the same folder.

Flat capability code may stay flat until complexity creates a real boundary
seam: provider SDK, Agent OS runtime, workflow integration, cross-domain
mutation, raw SQL/row-lock transaction, shared use-case consumer, meaningful
pure domain policy, LLM/prompt/media/storage/fetch boundary, or 500+ line
service pressure. Adding one of those is a reconstruction trigger for the
touched capability, but the response is the smallest structure that exposes
the seam. Incoming controllers may split by route family or use case without
forcing a full `application/domain/port` structure.

Platform support folders do not own business workflows. New top-level backend
folders must be added to this directory map in the same PR and justified by
ownership, mutation authority, transaction boundary, and invariants.

## Frontend Directory Architecture

Next.js route groups organize frontend ownership only; they do not affect URLs.
For example, moving `app/ad-ops` to `app/(advertising)/ad-ops` preserves the
public `/ad-ops` URL.

Kinds:

- `Route Group`: ownership grouping under `app/(group)`.
- `Route Leaf`: URL-rendering route with a `page.tsx`.
- `Route Subtree`: nested URL segment such as `[id]`, `edit`, or `callback`.
- `Route-Group Shared`: `_shared` code used by 2+ sibling routes in a group.
- `App-Wide Shared`: code used by 2+ route groups or ungrouped routes.
- `App Internal`: Next/app shell, auth callback, tests, fonts, or special app
  surfaces.
- `Test Support`: test-only frontend helpers or specs.

### Frontend Route Map

| Path | Kind | Routes / Notes |
|---|---|---|
| `apps/web/src/app/(advertising)` | Route Group | `ad-ops` |
| `apps/web/src/app/(analytics)` | Route Group | `dashboard` |
| `apps/web/src/app/(automation)` | Route Group | `_shared`, `action-board`, `agents`, `marketplace`, `workflows` |
| `apps/web/src/app/(catalog)` | Route Group | `product-hub`, `products` |
| `apps/web/src/app/(finance)` | Route Group | `_shared`, `finance-hub`, `profit-loss`, `reports`, `sales-analysis`, `supplier-hub` |
| `apps/web/src/app/(inventory)` | Route Group | `_shared`, `inventory`, `inventory-hub`, `outbound`, `stock-ops`, `unshipped-items`, `warehouses` |
| `apps/web/src/app/(orders)` | Route Group | `_shared`, `cs-management`, `order-hub`, `order-status-hub`, `orders`, `return-scan`, `returns`, `reviews` |
| `apps/web/src/app/(sourcing-ai)` | Route Group | `sourcing-ai` |
| `apps/web/src/app/(product-pipeline)` | Route Group | `product-pipeline/collected-products`, `product-pipeline/registered-products`, `product-pipeline/productgenerate`, `product-pipeline/detailgenerate`, `product-pipeline/detail-template-generation` (legacy implementation path), `product-pipeline/thumbnail-ai`, `product-pipeline/thumbnail-generation`, `product-pipeline/thumbnail-generation/edit` |
| `apps/web/src/app/(supply)` | Route Group | `purchase-orders`, `suppliers` |
| `apps/web/src/app/agent-os` | App Internal | Fullscreen visualization surface, separate from `/agents`. |
| `apps/web/src/app/auth` | App Internal | Auth callback subtree. |
| `apps/web/src/app/fonts` | App Internal | Next font assets. |
| `apps/web/src/app/login` | Route Leaf | Login route. |
| `apps/web/src/app/settings` | Route Leaf | Operational settings route. |
| `apps/web/src/app/__tests__` | App Internal | App-route tests. |

Notable route subtrees:

- `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products`
  owns `/product-pipeline/collected-products`, the 1688/imported
  `SourcingCandidate` inbox, candidate detail route entries, and
  candidate-scoped generated content links.
- `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products`
  owns `/product-pipeline/registered-products`, the direct/master registration
  workspace inbox backed by `RegistrationWorkspace`; source-candidate
  workspaces are reached from collected product detail instead of this list.
- `apps/web/src/app/(product-pipeline)/product-pipeline/productgenerate`
  owns `/product-pipeline/productgenerate`, the sidebar product registration
  entrypoint. It has its own route page/workflow plus a forked copy of the
  detail generation form components for product-registration-specific design.
- `apps/web/src/app/(product-pipeline)/product-pipeline/detail-pages`
  owns the shared generated detail-page editor route
  `/product-pipeline/detail-pages/[generationId]/editor` for both collected and
  registered product workspaces.
- `apps/web/src/app/(product-pipeline)/product-pipeline/detailgenerate`
  owns `/product-pipeline/detailgenerate`, the independent detail generation
  tool. The older `detail-template-generation` folder remains as the shared
  implementation path while consumers migrate to the shorter route.
- `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-ai`
  owns the independent thumbnail AI analysis and batch UI.
- `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-generation`
  owns the standalone thumbnail generation hub and edit flow. It is opened from
  product workspaces or direct URLs, not from the sidebar.

### Frontend Shared Map

| Path | Kind | Notes |
|---|---|---|
| `apps/web/src/__tests__` | Test Support | App-shell and proxy tests. |
| `apps/web/src/app/(product-pipeline)/product-pipeline/_shared` | Route-Group Shared | Product pipeline route constructors, shared detail-page editor/render helpers, product workspace screen/tabs/history/preview, inbox shells, hooks, and thumbnail UI shared by sibling product-pipeline routes. |
| `apps/web/src/components` | App-Wide Shared | Layout, panel, product, provider, chat, Coupang, and UI components. |
| `apps/web/src/hooks` | App-Wide Shared | Shared hooks used across routes. |
| `apps/web/src/lib` | App-Wide Shared | API client, query keys, auth, formatting, Supabase helpers. |
| `apps/web/src/store` | App-Wide Shared | Client-only UI state stores. |
| `apps/web/src/types` | App-Wide Shared | Frontend shared TypeScript types. |

### Frontend Structure Contracts

Route leaves use this shape:

```text
apps/web/src/app/(group)/{route}/
  page.tsx
  components/     route-local UI pieces
  hooks/          route-local query/mutation/state orchestration
  lib/            route-local pure helpers and payload builders
  __tests__/      route-local tests for complex flows
  AGENTS.md       required for high-risk or complex route contracts
```

Required: `page.tsx`. Optional: route-local `components/`, `hooks/`, `lib/`, and
`__tests__/` when the route needs them. Add route-local `AGENTS.md` for complex
or high-risk route contracts.

Route-local folders may group components, hooks, and helpers by workflow stage
or route family when complexity already exists. Keep these groupings local until
2+ routes need the same interface; app-wide abstractions are for shared
interfaces, not single-route tidying.

Route-group shared code lives only in `app/(group)/_shared/` and only when 2+
sibling routes use it. App-wide shared code lives only in `src/components`,
`src/hooks`, `src/lib`, `src/store`, or `src/types` and must be used by 2+
groups or ungrouped routes.

Frontend route code must not add `app/api/**/route.ts`, import Prisma/`pg`/DB
clients, send `organizationId` in API payloads, or call backend APIs with raw
`fetch`.

## Data And Tenant Rules

- Prisma schema source of truth lives under `prisma/models/`.
- Prisma schema is the only DB schema source of truth. `prisma db push`
  should be sufficient after schema edits; do not add SQL overlays for RLS,
  CHECK constraints, expression indexes, or standalone sequences.
- NestJS uses the owner DB role and must pass `organizationId` explicitly from
  `@CurrentOrganization()` into tenant-owned reads and writes.
- Chatbot/agent processes do not receive DB URLs. Business data reaches agents
  through backend application services/ports after organization scoping.
- Native PostgreSQL enums are not used; use `String` plus app-level validation.
- Unsafe raw SQL APIs are banned. Use Prisma tagged templates and tenant
  predicates for tenant-owned tables.

## Agent OS

Agent OS is a backend platform capability. Runtime execution and run accounting
live under `apps/server/src/agent-os/`; schema ownership is documented in
`prisma/AGENTS.md`:

- Public workflow routes live under the route-family controllers in
  `apps/server/src/automation/adapter/in/http/workflow-templates.controller.ts`,
  `workflow-run-commands.controller.ts`, and
  `workflow-runs.controller.ts`.
- Public action-board routes live under
  `apps/server/src/automation/adapter/in/http/action-task.controller.ts`.
- Manager routes live under
  `apps/server/src/automation/adapter/in/http/manager.controller.ts`.
- Business domains depend on Agent OS ports such as `AgentRunnerPort`; they do
  not import runtime services or adapters directly.

Workflow nodes must not call LLMs directly. AI work is delegated through
`agent_task.create` into Agent OS.

## Verification Baseline

Common gates for architecture/refactor work:

```bash
git diff --check
npm run check:idor
npm run check:tenant-scope
npm exec --workspace=apps/server -- vitest run src/<touched-domain>
npm run build --workspace=apps/server
npm run build --workspace=apps/web
```

Backend module or DI changes should also boot `npm run dev:server` and confirm
the route map starts cleanly.
