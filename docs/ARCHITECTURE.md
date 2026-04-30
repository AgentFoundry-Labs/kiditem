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
  -> Python agents for generation/processing tasks
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

## Backend Boundaries

Backend folders are owner domains or platforms, not DB-table mirrors or
frontend page names. Reconstructed domains use domain-first modular
architecture with application orchestration and selective hexagonal ports:

```
apps/server/src/{owner}/
  adapter/in/http/      controllers and class-validator DTO binding
  adapter/out/          Prisma/provider/runtime/panel adapters
  application/port/     use-case input and output contracts
  application/service/  orchestration, transactions, tenant context
  domain/               pure models, policies, and domain services
  mapper/               row/DTO/domain mapping
```

Small legacy CRUD modules may stay flat until their owner domain is actively
reconstructed. New or materially rewritten behavior should follow the target
shape above.

Current top-level backend owners/platforms:

```
activity-events  advertising  agent-registry  ai  analytics  auth
automation       channels     chat            common
companies        feature-gate finance         inventory
orders           prisma       products        rules
sourcing         test-helpers types           uploads
```

Important ownership decisions:

- `automation/` owns Agent OS application services, workflow HTTP routes,
  action-board/action-task routes, marketplace install, manager routes, and
  panel event projection.
- `agent-registry/` remains the compatibility/facade surface for Agent OS
  registry, lifecycle, heartbeat, wakeup, safety, trace, and delegation.
- `rules/` owns business policy definitions and rule evaluation results, but
  delegates Agent OS execution through automation ports.
- `sourcing/` folds supplier and purchase-order/procurement capabilities while
  preserving public routes `/api/suppliers/*` and `/api/purchase-orders/*`.
- `analytics/` folds dashboard, statistics, traffic, and supplier-stats
  read-model surfaces.
- `products/` owns catalog/master/option/bundle behavior and the
  `/api/categories` compatibility capability.

## Frontend Boundaries

Next.js route groups organize code for ownership only; they do not affect URLs.

```
apps/web/src/app/(automation)/  agents, workflows, marketplace, action-board
apps/web/src/app/(catalog)/     products, product-hub
apps/web/src/app/(sourcing)/    sourcing, suppliers
apps/web/src/app/(inventory)/   inventory, inventory-hub, stock-ops, warehouses
apps/web/src/app/(orders)/      orders, returns, reviews, return-scan
apps/web/src/app/(finance)/     finance-hub, profit-loss, sales-analysis
apps/web/src/app/(media-ai)/    thumbnails, thumbnail-editor, image-hub, generate
```

Ungrouped operational routes remain at `apps/web/src/app/{route}` when they
are still shared or not yet folded into a group, for example `ad-ops`,
`cs-management`, `purchase-orders`, `reports`, and `settings`.

## Data And Tenant Rules

- Prisma schema source of truth lives under `prisma/models/`.
- Prisma `db push` does not express every operational constraint. Re-run
  `npm run db:3layer-setup` when schema sync needs partial indexes, CHECK
  constraints, or chatbot/agent RLS policies.
- NestJS uses the owner DB role and must pass `companyId` explicitly from
  `@CurrentCompany()` into tenant-owned reads and writes.
- Chatbot/agent read-only DB access uses `chatbot_readonly`/agent read URLs
  with `app.company_id` RLS policies where configured.
- Native PostgreSQL enums are not used; use `String` plus app-level validation.
- Unsafe raw SQL APIs are banned. Use Prisma tagged templates and tenant
  predicates for tenant-owned tables.

## Agent OS

Agent OS is a backend platform capability:

- Public workflow routes live under
  `apps/server/src/automation/adapter/in/http/workflows.controller.ts`.
- Public action-board routes live under
  `apps/server/src/automation/adapter/in/http/action-task.controller.ts`.
- Manager routes live under
  `apps/server/src/automation/adapter/in/http/manager.controller.ts`.
- Agent execution ultimately passes through the Agent Registry compatibility
  boundary, but reconstructed business domains should depend on automation
  ports such as `AGENT_RUNNER_PORT`, not import runtime services directly.

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
