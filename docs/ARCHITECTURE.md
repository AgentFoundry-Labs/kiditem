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
  -> TS Playwright sourcing browser runtime
  -> Python worker/tools for analysis-heavy sourcing helpers
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
| `apps/server/src/ai` | Owner Domain | Image/text/detail-page/thumbnail AI provider, content-workspace ownership/branching, and Agent OS output boundaries. |
| `apps/server/src/analytics` | Owner Read Model | Dashboard, statistics, traffic, and supplier-stats reporting. |
| `apps/server/src/auth` | Platform Capability | Guards, decorators, middleware, and `/api/auth/me`. |
| `apps/server/src/automation` | Platform | Workflows, alerts, action board, marketplace install, and panel projection. |
| `apps/server/src/channels` | Owner Domain | Marketplace account, account-scoped registration/listing, order, return, catalog import, ChannelSku-to-Sellpia component matching, and sellable-capacity projection boundaries. |
| `apps/server/src/chat` | Platform Capability | CopilotKit bridge and Claude CLI adapter. |
| `apps/server/src/common` | Platform Support | Shared backend DTOs, filters, KST/date helpers, security, storage, and pricing helpers. |
| `apps/server/src/feature-gate` | Platform Capability | Feature flag endpoint and config behavior. |
| `apps/server/src/finance` | Owner Domain | P&L, sales analysis, manual ledger, costs, payments, plans, settlements. |
| `apps/server/src/inventory` | Owner Domain | Sellpia-authoritative physical MasterProduct snapshot import/read plus unshipped, warehouses, and record-only transfer/picking/receipt capabilities. |
| `apps/server/src/orders` | Owner Domain | Orders, returns, CS, reviews, and return-transfer operations. |
| `apps/server/src/organizations` | Platform Capability | Organization listing surface. |
| `apps/server/src/operation-cancellation` | Platform | Cross-owner durable cancellation endpoint and orchestration. |
| `apps/server/src/prisma` | Platform Support | `PrismaModule` and `PrismaService` only. |
| `apps/server/src/products` | Compatibility Lane | `/api/categories` compatibility CRUD only; catalog identities belong to Channels and Inventory. |
| `apps/server/src/readiness` | Platform Capability | Readiness checks and health-style operational surface. |
| `apps/server/src/rules` | Owner Domain | Business rules HTTP orchestration and Agent OS delegation. |
| `apps/server/src/sourcing` | Owner Domain | Chinese new-product discovery (scraper ingest and SourcingCandidate inbox) plus the account-scoped ProductPreparation registration state machine. |
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
| `apps/server/src/channels` | Hexagonal | Provider APIs use `application/port/out` plus `adapter/out/coupang`; catalog import and matching use repository ports plus an Inventory-owned read-port bridge. |
| `apps/server/src/channels/adapters` | Flat | compatibility shims only; new provider work uses `adapter/out/coupang/`. |
| `apps/server/src/chat` | Flat | controller/service/Claude CLI adapter. |
| `apps/server/src/feature-gate` | Flat | endpoint/config capability. |
| `apps/server/src/finance` | Flat | controllers/services/DTO plus folded finance capabilities. |
| `apps/server/src/inventory` | Hexagonal | Sellpia snapshot single-writer, read projections, and record-only operation capabilities behind ports/adapters. |
| `apps/server/src/orders` | Flat | controllers/services/DTO plus folded order capabilities. |
| `apps/server/src/organizations` | Flat | controller/service capability. |
| `apps/server/src/operation-cancellation` | Hexagonal | HTTP endpoint plus application service; consumes Automation, Agent OS, and AI owner-side ports only. |
| `apps/server/src/products/categories` | Flat | `/api/categories` compatibility capability under products ownership. |
| `apps/server/src/readiness` | Flat | readiness controller/service. |
| `apps/server/src/rules` | Flat | HTTP orchestration delegates execution to Agent OS ports. |
| `apps/server/src/sourcing` | Hexagonal | sourcing agent/products boundaries behind ports/adapters. |
| `apps/server/src/supply` | Hexagonal | supplier/procurement persistence behind repository ports/adapters; architecture + module wiring specs freeze invariants. |
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
  domain/capability/      resource/tool/workflow/sink manifests, when platform-visible
  application/service/    orchestration, transactions, organization context
  domain/                 pure policy/model/service code
  mapper/                 row/DTO/domain/shared contract mapping
```

Required: module file, `application/service/`, and a port/adapter boundary for
each DB, provider, runtime, storage, event, workflow, or cross-domain IO lane.
Optional: `adapter/in/http/` when no HTTP entrypoint exists, `application/port/in/`
when no other owner consumes the use case, `domain/` when no pure policy/model
exists yet, and `mapper/` when mapping is trivial.

Domain capability manifests use the shared vocabulary in
`apps/server/src/common/capability-manifest.ts`. They describe owner-exposed
`resource`, `tool`, `workflow`, and `sink` surfaces for Agent OS and
automation, but they do not execute work. Canonical DB writes stay behind
owner-domain sinks/incoming ports.

Initial domain capability targets:

| Owner | Resources | Tools | Workflows | Sinks |
|---|---|---|---|---|
| `sourcing` | Duplicate URL/candidate/preparation lookup and read context. | Product URL scrape through browser/runtime, search result scrape. | Duplicate-check → scrape → candidate ingest → preparation → account registration. | Candidate ingest/rejection and preparation lifecycle/finalization. |
| `ai` | Workspace/generation/detail-page read context. | OCR, image classification, image/text/detail generation, vision analysis. | Media generation jobs and candidate-to-listing content branching. | Generation output, asset usage, current-thumbnail, and workspace archive projections. |
| `finance` | Margin, commission, cost, settlement, and plan lookups. | Margin/category profitability calculations, pandas-style research adapters when needed. | Reconciliation and profitability analysis runs. | Manual ledger entries, settlement/payment projections. |
| `products` | Category compatibility reads. | Category normalization helpers. | Category compatibility flows when deterministic. | Category compatibility writes only; never catalog identity, stock, or registration-state writes. |
| `channels` | Channel account/listing/order/status and nullable SKU-availability reads. | Marketplace provider calls, listing validation, Wing/Coupang browser runtime steps, component-capacity calculation. | Product registration/listing sync and ChannelSku component-matching flows. | Listing registration/update projection, channel order/status ingestion. |
| `rules` | Rule set and evaluation context reads. | Rule evaluation/suggestion tools that may invoke Agent OS from rules entrypoints. | Scheduled policy sweeps when deterministic. | Rule/action recommendation projection. |
| `advertising` | Ad account/campaign/daily fact reads. | Scrape ingest normalization, strategy metrics calculations. | Daily fact ingest and deterministic alert workflows. | Ad fact/action/strategy projections. |
| `supply` | Supplier, supplier-product, and purchase-order reads. | Supplier matching, procurement calculation helpers. | Purchase-order preparation/approval flows. | Supplier attach, purchase-order creation/update. |
| `inventory` | Sellpia physical MasterProduct snapshot/history, warehouse, transfer, receipt, unshipped, and picking reads. | Workbook parsing and snapshot normalization. | Atomic Sellpia full-snapshot replacement and record-only transfer/picking flows. | A completed Sellpia import is the only physical `MasterProduct.currentStock` writer. |
| `orders` | Order, return, CS, review, and return-transfer reads. | Return/CS classification helpers, channel-agnostic order calculations. | Return and CS operational workflows. | Order/return status projections through order-owned commands. |

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

### Backend Port Lane Rules

Port folders are Interface seams, not decoration. `application/port/in/` and
`application/port/out/` are the first-level direction split. The second-level
folder is intentionally asymmetric: incoming ports are owner capability
Interfaces, while outgoing ports are driven Adapter family Interfaces.

Incoming ports stay flat while the owner publishes one or two use-case
Interfaces. Use a capability folder under `application/port/in/` when three or
more incoming ports share one owner capability, when a capability is published
as an Agent/tool surface, or when the same incoming capability is exported for
multiple consuming owners.

Incoming ports are never grouped by caller or entrypoint type. Folders such as
`application/port/in/agent/`, `application/port/in/http/`, and
`application/port/in/workflow/` are forbidden. HTTP, Agent, workflow, and CLI
entrypoints live under `adapter/in/{http,agent,workflow,cli}/` and may call the
same incoming capability Interface.

Outgoing ports use these lane folders when the lane exists:

- `repository/`: Prisma or raw-SQL persistence Interfaces.
- `transaction/`: unit-of-work or row-lock transaction Interfaces.
- `provider/`: external API, SDK, LLM, marketplace, scrape, fetch, or model
  provider Interfaces.
- `storage/`: object, file, image, or media storage Interfaces.
- `runtime/`: Agent OS, worker, browser, CLI, or execution runtime Interfaces.
- `event/`: event publication, audit, activity, panel, or ledger event
  Interfaces.
- `sink/`: finalized-output projection or event-consuming Interfaces.
- `workflow/`: workflow orchestration, cancellation, or workflow engine
  Interfaces.
- `cross-domain/`: anti-corruption Interfaces to another owner Module.

Group ports into a lane directory when any of these are true:

- The owner has three or more ports in the same IO lane.
- The port name or capability appears in three or more owner modules.
- The Adapter is owned by a platform, runtime, provider, storage, workflow, or
  cross-domain concern.
- The Interface represents persistence, transaction, storage, provider,
  runtime, event, sink, workflow, or cross-domain IO.
- Keeping the port flat makes callers learn infrastructure details instead of
  the domain language.

Incoming ports may stay flat when all of these are true:

- The Interface is unique to the owner domain.
- The owner has only one or two incoming ports.
- The port name is already domain-language specific.
- There is no likely second Adapter and no cross-domain consumer.
- The capability is not being published as an Agent/tool surface.

Outgoing port files do not stay directly under `application/port/out/` in
reconstructed owner modules. Domain-specific outgoing ports still use the
narrowest lane that explains the Adapter family. A direct
`application/port/out/*.ts` exception requires both a documented architecture
note and an explicit checker change.

Lane folders may provide a local `index.ts` import surface. Broad barrels such
as `application/port/index.ts` or `application/index.ts` are not part of the
backend architecture because they hide direction and lane information from the
caller.

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
| `apps/web/src/app/(advertising)` | Route Group | `ad-ops`, `rank-tracking` |
| `apps/web/src/app/(analytics)` | Route Group | `dashboard` |
| `apps/web/src/app/(automation)` | Route Group | `_shared`, `action-board`, `agents`, `marketplace`, `workflows` |
| `apps/web/src/app/(catalog)` | Route Group | `product-hub`, `product-hub/[id]`, `product-hub/matching`, `product-hub/options`; product hub implementation code lives under `product-hub/`. |
| `apps/web/src/app/(finance)` | Route Group | `_shared`, `finance-hub`, `profit-loss`, `reports`, `sales-analysis`, `supplier-hub` |
| `apps/web/src/app/(inventory)` | Route Group | `_shared`, `coupang-shipments`, `inventory`, `inventory-hub`, `outbound`, `stock-ops`, `unshipped-items`, `warehouses` |
| `apps/web/src/app/(orders)` | Route Group | `_shared`, `cs-management`, `order-collection`, `order-hub`, `order-status-hub`, `orders`, `return-scan`, `returns`, `reviews`, `rocket-orders` |
| `apps/web/src/app/(sourcing-ai)` | Route Group | `sourcing-ai`, `sourcing-ai/category-sourcing`, `sourcing-ai/competitor-analysis`, `sourcing-ai/final-selection`, `sourcing-ai/keywords`, `sourcing-ai/market`, `sourcing-ai/recommendations`, `sourcing-ai/settings`, `sourcing-ai/validation`, `sourcing-ai/wholesale-search`, `sourcing-ai/wing-catalog` |
| `apps/web/src/app/(product-pipeline)` | Route Group | `product-pipeline/collected-products`, `product-pipeline/collected-products/[id]`, `product-pipeline/collected-products/[id]/editor`, `product-pipeline/collected-products/[id]/templates`, `product-pipeline/detail-pages/[generationId]/editor`, `product-pipeline/detail-template-generation`, `product-pipeline/productgenerate`, `product-pipeline/registered-products`, `product-pipeline/registered-products/[workspaceId]`, `product-pipeline/thumbnail-ai`, `product-pipeline/thumbnail-generation`, `product-pipeline/thumbnail-generation/edit` |
| `apps/web/src/app/(supply)` | Route Group | `purchase-orders`, `suppliers` |
| `apps/web/src/app/agent-os` | App Internal | Fullscreen visualization surfaces `/agent-os` and `/agent-os/network`, separate from `/agents`. |
| `apps/web/src/app/auth` | App Internal | Auth callback subtree. |
| `apps/web/src/app/fonts` | App Internal | Next font assets. |
| `apps/web/src/app/login` | Route Leaf | Login route. |
| `apps/web/src/app/settings` | Route Leaf | Operational settings route. |
| `apps/web/src/app/__tests__` | App Internal | App-route tests. |

Notable route subtrees:

- `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products`
  owns `/product-pipeline/collected-products`, the 1688/imported plus manual
  product-registration `SourcingCandidate` inbox, candidate detail route
  entries, and candidate-scoped generated content links.
- `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products`
  owns `/product-pipeline/registered-products`, the marketplace registered
  product management surface backed by active `ChannelListing` rows with
  `ChannelAccount` and immutable source-candidate provenance. Generated content
  history lives in listing-owned `ContentWorkspace` rows; source-candidate
  workspaces are reached from collected product detail instead of this list.
- `apps/web/src/app/(product-pipeline)/product-pipeline/productgenerate`
  owns `/product-pipeline/productgenerate`, the sidebar product registration
  entrypoint. This is the only product-pipeline route that creates collected
  product candidates from manual operator input.
- `apps/web/src/app/(product-pipeline)/product-pipeline/detail-pages`
  owns the shared generated detail-page editor route
  `/product-pipeline/detail-pages/[generationId]/editor` for both collected and
  registered product workspaces.
- `apps/web/src/app/(product-pipeline)/product-pipeline/detail-template-generation`
  owns `/product-pipeline/detail-template-generation`, the independent detail
  generation tool. Outputs do not create collected product candidates, and
  product-bound detail generation links should enter through the shared
  product-pipeline route helpers instead of ad hoc path strings.
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

## Account-Scoped Registration And Content Ownership (`0.1.8`)

Sourcing owns registration intent and state in `ProductPreparation`; Channels
owns the selected marketplace account, provider submission, and resulting
`ChannelListing`; AI owns candidate/listing content workspaces. Registration no
longer promotes a candidate into `MasterProduct`.

```text
SourcingCandidate (status: sourced | rejected)
  -> ProductPreparation draft for a selected ChannelAccount
  -> canonical payload JSON + SHA-256 + stable submission key are frozen
  -> persist the key as Coupang externalVendorSku and reconcile by key/provider ID
  -> call provider outside the DB tx only when reconciliation proves this is new
  -> one final DB tx resolves/reactivates the account-scoped ChannelListing
     + branches selected content into a listing-owned ContentWorkspace
     + marks ProductPreparation registered
```

The canonical APIs are candidate preparation create, preparation update,
submit, and cancel. In 0.1.8, `POST /api/sourcing/candidates/:id/promote` is a
deprecated alias for draft creation and returns only
`{ preparationId, status: 'draft' }`. Active preparation uniqueness is scoped
to organization, candidate, and selected channel account. The same candidate
may therefore have one active draft per account, while duplicate active drafts
for the same account are rejected deterministically.

The release data-migration chain rewrites only legacy `promoted` candidate rows
to `sourced`; rolling-deploy read projections perform the same normalization
until every environment has recorded the migration.

`ContentWorkspace.ownerType` is `sourcing_candidate`, `channel_listing`, or
`direct_detail_page`. Registration branches selected artifact/revision metadata
and HTML, reuses storage URLs and the same managed thumbnail asset, and does not
clone generation jobs/candidates. Current-thumbnail selection may adopt an
existing content asset, a succeeded generation candidate, or an external URL
that first passes the guarded fetch/storage boundary. Asset deletion and GC
must reject active generation usage or any thumbnail selection.

## Sellpia-Authoritative Inventory And Channel Capacity (`0.1.8`)

Sellpia is the upstream inventory service and a completed full-workbook import
is KidItem's only stock writer. Inventory owns the physical Sellpia
`MasterProduct.currentStock` snapshot;
Channels owns each marketplace account's independent product/SKU metadata,
explicit component recipes, and sellable-capacity projection. The Products
module retains category compatibility only and owns neither catalog identities
nor stock.

Existing channel Prisma/table names remain stable while the logical contracts
are explicit:

| Logical contract | Prisma model | Physical table | Identity / authority |
|---|---|---|---|
| `ChannelProduct` | `ChannelListing` | `channel_listings` | Organization + ChannelAccount + external product ID; channel price/name metadata is account-specific. |
| `ChannelSku` | `ChannelListingOption` | `channel_listing_options` | Organization + ChannelAccount + external SKU ID; marketplace option metadata is not inventory truth. |
| Physical Sellpia product | `MasterProduct` | `master_products` | Organization + Sellpia product code; `current_stock` is written only by a completed Sellpia snapshot import. |
| `ChannelSkuComponent` | `ChannelSkuComponent` | `channel_sku_components` | Exact positive quantity of one physical MasterProduct consumed by one sale of one ChannelSku. |
| `SourceImportRun` | `SourceImportRun` | `source_import_runs` | Workbook provenance, SHA-256 idempotency, and attempt fencing scoped by organization/source/account. |

Release `0.1.8` cuts directly to this final schema. Removed legacy inventory
owners and mapping tables are not dual-written or retained as runtime shadows.

```text
Sellpia complete export
  -> POST /api/inventory/sellpia-sync/import
  -> atomic physical MasterProduct full snapshot replacement
  -> absent known Sellpia codes inactive + currentStock = 0
  -> GET /api/inventory/sellpia-skus and /sellpia-sync/import-runs

Marketplace catalog export + selected ChannelAccount
  -> account-scoped ChannelProduct / ChannelSku metadata upsert
  -> operator confirms the complete ChannelSkuComponent recipe
  -> GET /api/channels/sku-availability
  -> sellableStock = min(floor(component.currentStock / component.quantity))
```

A confirmed recipe is the only mapping truth. Candidate ranking is live
evidence and never auto-confirms. A recipe such as one Sellpia SKU times eight
has capacity `floor(currentStock / 8)`; a mixed recipe uses the minimum of all
component capacities. Unmapped and review-required Channel SKUs return
`sellableStock = null`; a mapped recipe with no capacity returns zero. The
projection exposes component capacities and bottlenecks but never reserves or
deducts stock.

KidItem has no internal `ProductOption` or bundle-stock owner. Marketplace
option metadata lives on `ChannelListingOption`; bundle consumption exists only
as the exact `ChannelSkuComponent` recipe. A bundle has no separately maintained
stock. `StockTransfer`, `PickingItem`, and `ReturnTransfer` reference the
physical `MasterProduct` only to record operations; their create/update/complete
flows do not change `currentStock`.

The existing `/inventory`, `/inventory-hub`, and `/stock-ops` routes are
preserved as views over Sellpia snapshots, import history, assets, channel
availability, mapping attention, and record-only operations. Manual receive,
issue, adjust, reserve, release, restock, stock-ledger, and Rocket inventory
mutation surfaces are not part of the architecture.

Rocket is another channel account (`channel='rocket'`), not a special inventory
balance. `/rocket-orders` currently performs read-only PO summary collection
through the operator extension. Delivery/confirmation quantity decisions and
server-side confirm/reserve/generate actions are explicitly deferred; a future
implementation must use Rocket ChannelSku recipes and the same nullable
Sellpia-backed capacity projection.

The approved development workbook imports 1,964 physical Sellpia
MasterProducts and 1,225 Wing ChannelProducts / 2,241 ChannelSkus, with three
invalid Wing rows skipped on a clean first import. Shared environments use the
guarded `0.1.8` final-schema rebuild: exact environment-bound reset token,
sanitized private Coupang replay artifact, traffic quiesce, minimum auth/account
bootstrap, authenticated Sellpia-then-Wing imports, authenticated replay, and
exact acceptance checks. The application remains `snapshot_required` until
those checks mark the environment ready; there is no legacy inventory mapping
backfill or warning-accepted transition path.

Operational upload order, recovery rules, exact baseline counts, and local
reset/bootstrap steps live in the
[channel/Sellpia matching runbook](runbooks/channel-sellpia-matching.md) and
[inventory/Rocket boundary runbook](runbooks/sellpia-rocket-inventory-sync.md).

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
- Automation workflows are deterministic and must not create Agent OS runs. If
  LLM judgment is required, the entrypoint starts in Agent OS; Agent OS may call
  deterministic workflows through automation-owned incoming ports or registered
  workflow capabilities.

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
