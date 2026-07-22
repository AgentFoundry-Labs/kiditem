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

### Browser Collection Session Boundary

`@kiditem/shared/browser-collection-session` is the focused public contract for
browser-owned collection runs. It defines the allowlisted producers, UUID run
identity, attempt/`updatedAt` ordering, bounded primitive input identity, public
progress/attention state, and explicit control commands. Public session views
never contain managed Chrome tab/window handles or raw response, HTML, payload,
file, row, credential, cookie, token, password, or secret material.

The canonical Manifest V3 session manager lives at
`extensions/shared/collection-session.js`; the sync gate generates identical
extension-local copies for the Coupang, sourcing, and order collectors. Each
extension persists its own private session map in `chrome.storage.local` so a
suspended service worker can recover `_managedTabId` and `_managedWindowId`.
Those handles stay private to the extension manager and are removed by the
public-view projection before events or command responses leave the extension.
Full-map mutations are serialized per adapter/storage key.

The authenticated app shell mounts one global `BrowserCollectionProvider`.
It validates extension events, orders them by attempt then `updatedAt`, updates
the matching React Query session cache only when newer, and serializes alert
synchronization across duplicate KidItem tabs. Polling and control responses
use the same monotonic cache policy, so restart/cancel responses replace stale
attention state without allowing an older attempt to overwrite it.

Automation owns the canonical personal operation-alert boundary for browser
collections. The HTTP controller binds organization and actor from the auth
session, canonicalizes the producer title/link, and refuses another actor's
operation key. Repository ownership checks also cover existence races. Alert
metadata carries the collection attempt and update timestamp; Automation
rejects stale transitions and prevents a late running start from reopening a
terminal alert. Only a verified HTTP 404 authorizes web start-then-update
recovery.

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
| `apps/server/src/ai` | Owner Domain | Image/text/detail-page/thumbnail AI providers, durable direct-job execution, content-workspace ownership/branching, and Agent OS output boundaries. |
| `apps/server/src/analytics` | Owner Read Model | Dashboard, statistics, traffic, and supplier-stats reporting. |
| `apps/server/src/auth` | Platform Capability | Guards, decorators, middleware, and `/api/auth/me`. |
| `apps/server/src/automation` | Platform | Workflows, alerts, action board, marketplace install, and panel projection. |
| `apps/server/src/channels` | Owner Domain | Marketplace account, account-scoped listing/registration capability, durable listing-deletion operations, order, return, Wing/Rocket catalog identity, typed exact-evidence extraction, conditional product/variant link writes, linked-recipe diagnostics, and sellable-capacity projections. |
| `apps/server/src/chat` | Platform Capability | CopilotKit bridge and Claude CLI adapter. |
| `apps/server/src/common` | Platform Support | Shared backend DTOs, filters, KST/date helpers, security, storage, and pricing helpers. |
| `apps/server/src/feature-gate` | Platform Capability | Feature flag endpoint and config behavior. |
| `apps/server/src/finance` | Owner Domain | P&L, sales analysis, manual ledger, costs, payments, plans, settlements. |
| `apps/server/src/inventory` | Owner Domain | Sellpia-authoritative freshness state, browser claim lease, full-snapshot validation/publication, physical SellpiaInventorySku reads, purchase freshness gate, and record-only transfer/picking/receipt capabilities. |
| `apps/server/src/orders` | Owner Domain | Orders, returns, CS, reviews, and return-transfer operations. |
| `apps/server/src/organizations` | Platform Capability | Organization listing surface. |
| `apps/server/src/operation-cancellation` | Platform | Cross-owner durable cancellation endpoint and orchestration. |
| `apps/server/src/prisma` | Platform Support | `PrismaModule` and `PrismaService` only. |
| `apps/server/src/products` | Owner Domain | KidItem MasterProduct operations, reusable ProductVariant units, central ProductVariantComponent recipes, transaction-aware channel-origin identity provisioning, and `/api/categories` compatibility CRUD. |
| `apps/server/src/readiness` | Platform Capability | Readiness checks and health-style operational surface. |
| `apps/server/src/rules` | Owner Domain | Business rules HTTP orchestration and Agent OS delegation. |
| `apps/server/src/sourcing` | Owner Domain | Chinese new-product discovery (scraper ingest and SourcingCandidate inbox), reviewed ProductPreparation input, and authoritative ProductRegistrationExecution lifecycle. |
| `apps/server/src/supply` | Owner Domain | Supplier registry, SellpiaInventorySku supplier policy, freshness-fenced purchase submission attempts/reconciliation, and read-only Rocket capacity preview. |
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
| `apps/server/src/inventory` | Hexagonal | Sellpia freshness/publication single-writer, browser lease, full-snapshot and capacity reads, narrow purchase gate, and record-only operation capabilities behind ports/adapters. |
| `apps/server/src/orders` | Flat | controllers/services/DTO plus folded order capabilities. |
| `apps/server/src/organizations` | Flat | controller/service capability. |
| `apps/server/src/operation-cancellation` | Hexagonal | HTTP endpoint plus application service; consumes Automation, Agent OS, and AI owner-side ports only. |
| `apps/server/src/products/categories` | Flat | `/api/categories` compatibility capability under products ownership. |
| `apps/server/src/readiness` | Flat | readiness controller/service. |
| `apps/server/src/rules` | Flat | HTTP orchestration delegates execution to Agent OS ports. |
| `apps/server/src/sourcing` | Hexagonal | sourcing agent/products boundaries behind ports/adapters. |
| `apps/server/src/supply` | Hexagonal | Supplier/procurement persistence, idempotent external submission attempts, the narrow opaque Inventory-fence transaction adapter, and Rocket preview policy behind ports/adapters; architecture + module wiring specs freeze invariants. |
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
| `products` | Product operations, variants, central component recipes, channel-origin provenance, and category compatibility reads. | Product/variant validation, exact identity resolution, and recipe-capacity projections. | Product/variant lifecycle, transaction-aware channel-origin provisioning, and complete confirmed-recipe replacement. | MasterProduct, ProductVariant, and ProductVariantComponent writes; never channel links or physical stock publication. |
| `channels` | Channel account/listing/order/status, Wing/Rocket catalog identity, nullable product/variant links, and nullable SKU-availability reads. | Marketplace provider calls, listing validation, typed exact-evidence extraction, Wing/Coupang browser runtime steps, and linked-variant capacity calculation. | Product registration/listing sync, atomic catalog-to-Products publication, and operator correction flows. | Listing registration/update and still-null confirmed-link projection, channel order/status ingestion; never recipes or stock publication. |
| `rules` | Rule set and evaluation context reads. | Rule evaluation/suggestion tools that may invoke Agent OS from rules entrypoints. | Scheduled policy sweeps when deterministic. | Rule/action recommendation projection. |
| `advertising` | Ad account/campaign/daily fact reads. | Scrape ingest normalization, strategy metrics calculations. | Daily fact ingest and deterministic alert workflows. | Ad fact/action/strategy projections. |
| `supply` | Supplier, supplier-product, purchase-order, and submission-attempt reads. | Supplier matching, deterministic Rocket capacity preview, and procurement calculation helpers. | Freshness-fenced purchase submission and explicit provider reconciliation. | Supplier attach, purchase-order creation/update, and attempt terminal state; never freshness or stock. |
| `inventory` | Sellpia freshness/source binding/current basis/history, physical SellpiaInventorySku, warehouse, transfer, receipt, unshipped, and picking reads. | Workbook parsing, bounded quality evaluation, freshness/lease policy, and snapshot normalization. | Browser claim/heartbeat/failure/cancel, atomic full-snapshot publication, and record-only transfer/picking flows. | A completed valid Sellpia publication is the only physical `SellpiaInventorySku.currentStock` writer. |
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
| `apps/web/src/app/(catalog)` | Route Group | Preserved product operations center at `/product-hub`, backed by the read-only Sellpia snapshot; read-only snapshot detail; dedicated read-only `/product-hub/options`; Coupang ChannelSku-to-Sellpia component matching at `/product-hub/matching`. |
| `apps/web/src/app/(finance)` | Route Group | `_shared`, `finance-hub`, `profit-loss`, `reports`, `sales-analysis`, `supplier-hub` |
| `apps/web/src/app/(inventory)` | Route Group | Active `/inventory-hub`, `/inventory`, `/stock-ops`, and `/coupang-shipments` surfaces; Warehouse reads remain reference data for `StockTransfers`, with no standalone warehouse-management route. |
| `apps/web/src/app/(orders)` | Route Group | Active `/order-collection`, `/orders`, `/rocket-orders`, and `/reviews` surfaces; order collection and processing own their route-local workspaces, while the Rocket capacity placeholder consumes the shared preview contract. |
| `apps/web/src/app/(sourcing-ai)` | Route Group | `sourcing-ai`, `sourcing-ai/category-sourcing`, `sourcing-ai/competitor-analysis`, `sourcing-ai/final-selection`, `sourcing-ai/keywords`, `sourcing-ai/market`, `sourcing-ai/recommendations`, `sourcing-ai/settings`, `sourcing-ai/validation`, `sourcing-ai/wholesale-search`, `sourcing-ai/wing-catalog` |
| `apps/web/src/app/(product-pipeline)` | Route Group | `product-pipeline/collected-products`, `product-pipeline/collected-products/[id]`, `product-pipeline/collected-products/[id]/editor`, `product-pipeline/collected-products/[id]/templates`, `product-pipeline/detail-pages/[generationId]/editor`, `product-pipeline/detail-template-generation`, `product-pipeline/productgenerate`, `product-pipeline/registered-products`, `product-pipeline/registered-products/[workspaceId]`, `product-pipeline/thumbnail-ai`, `product-pipeline/thumbnail-generation`, `product-pipeline/thumbnail-generation/edit` |
| `apps/web/src/app/(supply)` | Route Group | `/purchase-orders` general purchasing with additive Rocket preview at `?tab=rocket`, plus `suppliers`; Supply owns the preview contract also consumed by `/rocket-orders`. |
| `apps/web/src/app/agent-os` | App Internal | Fullscreen visualization surfaces `/agent-os` and `/agent-os/network`, separate from `/agents`. |
| `apps/web/src/app/auth` | App Internal | Auth callback subtree. |
| `apps/web/src/app/fonts` | App Internal | Next font assets. |
| `apps/web/src/app/login` | Route Leaf | Login route. |
| `apps/web/src/app/settings` | Route Leaf | Operational settings route. |
| `apps/web/src/app/__tests__` | App Internal | App-route tests. |

Notable route subtrees:

- The current Frontend Route Map and nearest route guide are the preservation
  authority for active routes. Before retiring a public URL, add it to the
  central `src/app/__tests__/retired-sidebar-routes.spec.ts` scanner, relocate
  every active consumer, and only then delete its route-only subtree. An
  intentionally retired route has no compatibility redirect unless product
  names a canonical replacement.

- Product list, detail, matching, and options preserve their independent
  compositions. `/product-hub` is the staged product operations center backed
  by the read-only Sellpia snapshot, `/product-hub/[id]` is the read-only snapshot detail,
  `/product-hub/matching` is the Coupang ChannelSku component-recipe workspace,
  and `/product-hub/options` is the dedicated read-only Sellpia options table.
  Post-baseline Sellpia features may be added without replacing or rearranging
  those layouts.

- `/rocket-orders` remains the preserved Rocket operations screen and is not a
  compatibility redirect. Its existing `납품 수량 판단 추후 연동` placeholder
  consumes the deterministic Sellpia freshness/component-capacity preview and
  is the only operator-facing Rocket review route. `/purchase-orders` remains
  the general supplier purchase-order screen.

- Current tab ownership is exact: `/inventory-hub` has `status`,
  `sellpia-sync`, `rocket-events`, and `checks`; `/stock-ops` has
  `product-outflow` and `channel-zero`. Active Orders routes are independent
  workspaces and do not inherit tabs from retired hub screens.

- `apps/web/src/app/(product-pipeline)/product-pipeline/collected-products`
  owns `/product-pipeline/collected-products`, the 1688/imported plus manual
  product-registration `SourcingCandidate` inbox, candidate detail route
  entries, candidate-scoped generated content links, and the fixed WING category
  registry used at registration confirmation. WING category selection uses the
  saved `ProductPreparation.registrationInput.wingCategoryKey` or an exact
  source-category alias; it does not read registered `ChannelListing` rows or
  call a runtime category-suggestion API.
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

## Durable Direct AI Media Execution

Thumbnail generation, detail-page generation, image edit, and thumbnail
re-edit use the AI-owned `AiDirectJob` ledger. These fixed workflows do not
create Agent OS runs.

```text
request
  -> transaction: domain ledger + input provenance + held AiDirectJob
  -> operation alert / parent-child registration
  -> release to pending
  -> claim with FOR UPDATE SKIP LOCKED + lease
  -> provider and media execution with AbortSignal
  -> validated output checkpoint
  -> atomic domain sink projection
  -> succeeded
```

The worker reclaims held jobs after the recovery window and running or
projecting jobs after lease expiry. A projecting job reuses its checkpoint and
does not call the model again. Cancellation updates the direct-job queue before
the domain ledger or alert, and the lease heartbeat aborts in-flight provider
and image-download work. Gemini adapters receive the model captured at enqueue
time and never select an environment fallback during execution.

## Account-Scoped Registration And Content Ownership (`0.1.8`–`0.1.25`)

Sourcing owns reviewed registration input in `ProductPreparation` and every
registration side effect in `ProductRegistrationExecution`; Channels owns the
selected marketplace account, provider capability, resulting `ChannelListing`,
and `ChannelListingDeletionOperation`; AI owns candidate/listing content
workspaces. Registration no longer promotes a candidate into `MasterProduct`.

```text
SourcingCandidate (status: sourced | rejected)
  -> ProductPreparation draft for a selected ChannelAccount
  -> ProductRegistrationExecution freezes canonical payload JSON + SHA-256
     + stable submission key + actor/account evidence
  -> persist executing/uncertain before provider IO and reconcile by key/provider ID
  -> call provider outside the DB tx only when the execution remains
     prepared/not_attempted and reconciliation proves this is new
  -> one final DB tx resolves/reactivates the account-scoped ChannelListing,
     succeeds the execution,
     + branches selected content into a listing-owned ContentWorkspace
     + marks the ProductPreparation compatibility projection registered
```

No bulk cutover backfill copies legacy preparation or deletion rows into these
operation ledgers. The registration runtime may import one scoped legacy
preparation under its row lock when that row is actually claimed; it never
turns an uncertain legacy provider attempt into a fresh create.
The staging cutover rebuilds non-auth application data against the final schema,
and environments with data worth preserving require a separately reviewed,
hash-bound migration before adopting this ownership model. Listing deletion
authorization and uncertainty live in `ChannelListingDeletionOperation`; an
extension-observed success alone remains `reconciling/uncertain` and cannot
deactivate the listing until an independent provider verifier confirms it.

The canonical APIs are candidate preparation create, preparation update,
submit, and cancel. In 0.1.8, `POST /api/sourcing/candidates/:id/promote` is a
deprecated alias for draft creation and returns only
`{ preparationId, status: 'draft' }`. Active preparation uniqueness is scoped
to organization, candidate, and selected channel account. The same candidate
may therefore have one active draft per account, while duplicate active drafts
for the same account are rejected deterministically.

Historical sourcing migrations populated compatibility rows for older candidate
and content models. This reconstruction intentionally adds no registration or
deletion ledger backfill because staging application data is rebuilt and there
is no legacy marketplace operation history to preserve.

`ContentWorkspace.ownerType` is `sourcing_candidate`, `channel_listing`, or
`direct_detail_page`. Registration branches selected artifact/revision metadata
and HTML, reuses storage URLs and the same managed thumbnail asset, and does not
clone generation jobs/candidates. Current-thumbnail selection may adopt an
existing content asset, a succeeded generation candidate, or an external URL
that first passes the guarded fetch/storage boundary. Asset deletion and GC
must reject active generation usage or any thumbnail selection.

## Sellpia Freshness, Common Commitments, And Channel Capacity (`0.1.19`–`0.1.22`)

Sellpia is the upstream stock authority. Inventory owns one persisted
organization-scoped `SellpiaInventoryState`, the fixed source binding, server
clock freshness derivation, browser claim lease, validation/quality policy, and
atomic full-snapshot publication. Only that publication adapter may write
`SellpiaInventorySku.currentStock`; Products, orders, Supply, Channels, Rocket,
and web code do
not estimate, reserve, increment, or decrement it.

| Logical contract | Prisma model | Physical table | Identity / authority |
|---|---|---|---|
| Sellpia trust state | `SellpiaInventoryState` | `sellpia_inventory_states` | Exactly one per organization; fixed origin/account binding, requested/verified/failed generations, 90-second owner lease, timestamps, last attempt, and opaque UUID fence. |
| Import/attempt history | `SourceImportRun` | `source_import_runs` | Unified completed workbook and pre-download failure provenance; hash/idempotency, generation, trigger, verification, attestation, bounded quality, and sanitized failure fields. |
| KidItem operating product | `MasterProduct` | `master_products` | Organization-scoped stable code, product metadata, operating settings, variants, and channel product links; never physical stock or source-import data. |
| Reusable sellable unit | `ProductVariant` | `product_variants` | Organization-scoped stable code beneath one MasterProduct; channel options link here. |
| Confirmed central recipe | `ProductVariantComponent` | `product_variant_components` | Positive quantity of one SellpiaInventorySku consumed by one variant; every cross-model relation is organization-fenced. |
| Physical Sellpia SKU | `SellpiaInventorySku` | `sellpia_inventory_skus` | Organization + Sellpia product code. Only a completed valid Inventory publication writes active state and `current_stock`. |
| Channel product/option | `ChannelListing` / `ChannelListingOption` | `channel_listings` / `channel_listing_options` | Organization + ChannelAccount + provider identity, with nullable links to MasterProduct/ProductVariant. Provider metadata is never inventory truth. |
| External submission intent | `PurchaseOrderSubmissionAttempt` | `purchase_order_submission_attempts` | Organization + purchase order + idempotency key; records freshness generation, provider terminal/unknown outcome, and authenticated reconciliation. |
| Rocket confirmation | `RocketPurchaseConfirmation` / `RocketPurchaseConfirmationLine` | `rocket_purchase_confirmations` / `rocket_purchase_confirmation_lines` | Organization + Rocket account + completed source run + UUID idempotency key; records every explicit line decision and confirmation/release actor. |
| Rocket component allocation | `RocketPurchaseConfirmationAllocation` | `rocket_purchase_confirmation_allocations` | Immutable Supply audit snapshot for one confirmed line; not a second capacity ledger. |
| Common inventory commitment | `InventoryCommitment` / `InventoryCommitmentAllocation` | `inventory_commitments` / `inventory_commitment_allocations` | Inventory-owned logical hold and component quantities. Active rows reduce common available capacity without writing physical stock; request rows may be replaced by final-order rows, released, or settled. |

Freshness has four public states: `fresh`, `refresh_required`, `syncing`, and
`failed`. A verified snapshot is fresh for strictly less than 10 minutes;
exactly 10 minutes is stale. The authenticated web coordinator polls and uses a
per-organization browser lock plus the server's atomic 90-second claim. The
owner heartbeats every 20 seconds; only that owner may cancel. A dead owner is
reclaimable after server expiry, never merely because another tab closes.

```text
fixed source binding confirmed by owner/admin
  -> web claims due generation
  -> extension uses authenticated Chrome session without focus theft
  -> direct option-product Excel request (no visible button click)
  -> KidItem uploads raw bytes with claim/generation/source evidence
  -> Inventory validates + quality-checks + publishes one full transaction
  -> freshness and unified history update
```

Hard quality loss preserves the previous completed snapshot. Row loss or active
code loss of at least 30% is blocked; missing fields, duplicate barcodes,
10–30% churn, and inactive confirmed-recipe references are bounded warnings.
The first post-order identical hash schedules one three-minute confirmation;
the next identical file verifies it without a third loop. An attested manual
fresh export uses the same validation/publication path and records actor/time.

A successful Sellpia order-transmission request schedules an Inventory-owned
refresh after a two-minute settle delay. Repeated successful transmissions
coalesce and the server caps the wait at five minutes from the first request.
Raw mall collection creates no refresh, and a transmission request does not
claim Sellpia accepted the order; the later full snapshot is the stock evidence.

Supply consumes only Inventory's narrow gate. Before any real `pending ->
ordered` transition, it checks fresh active product identities, then locks the
Sellpia state and purchase order together and compares the opaque fence. A
providerless transition commits atomically. External checkout creates one
durable `prepared` attempt before the provider call and reuses the caller's
idempotency key. Ambiguous response or an unresolved 15-minute prepared attempt
becomes `provider_unknown`; it requires explicit authenticated reconciliation
and cannot call the provider again. The web may auto-refresh and retry once only
for `SELLPIA_SYNC_REQUIRED`, with the same key.

Channels persists account-scoped Wing and Rocket identity. During Wing detail
publication, Channels calls Products' transaction-aware provisioning
capability: a unique typed seller SKU or safely normalized typed barcode may
reuse an active product/variant, otherwise Products creates deterministic
channel-origin identities with no component recipe. Channels then writes only
still-null listing/option links in the same transaction. Raw aliases,
normalized names, similarity/AI, and manual-search results never auto-confirm
an identity link.

In `0.1.22`, Channels also owns a read-only deterministic recipe preview and an
explicit version-fenced apply command for already-linked variants. The preview
batches organization/account-fenced evidence and classifies exact code, unique
physical barcode, and strict exact normalized product-name plus option matches.
Only when every deterministic identifier agrees on one active Sellpia SKU, pack
signatures do not require quantity review, and the central recipe is empty may
Channels invoke Products' locked create-if-empty port. Products writes exactly
one `ProductVariantComponent` with quantity `1`, deterministic source, and no
actor confirmation; it skips and preserves recipes created before or during
the command. Existing recipes, duplicate or conflicting evidence, pack/BOM
uncertainty, product-name-only matches, similarity, rank, raw aliases, and AI
remain non-automatic. Inventory remains the sole physical-stock writer.

Confirmed manual or deterministic recipes remain the capacity truth.
Capacity is
`min(floor(availableStock / quantity))`, where
`availableStock = max(currentStock - activeCommitmentQuantity, 0)`; inactive components keep their stored
recipe visible in `needs_review` instead of being silently removed.

Rocket `0.1.19` introduced preview-only allocation. In `0.1.20`, a complete
extension collection also carries allowlisted official-workbook fields. Supply
reruns the canonical preview under an organization lock, fences the Inventory
generation and completed source artifact, verifies that channel/variant recipe
identity has not changed, and persists explicit line decisions plus immutable
component allocations. In `0.1.21`, the same transaction creates an
Inventory-owned `rocket_request` commitment. Active common commitments—not
Supply allocation aggregation—are subtracted from every Inventory, Products,
Channels, Analytics, and Rocket availability projection.
Idempotent replay returns the existing record; input drift conflicts. An
authenticated provisional release with an explicit reason restores capacity by
status only.
Confirmation creates the official workbook in the browser after the server
commit. It never submits to a marketplace provider or writes
`SellpiaInventorySku.currentStock`.

Coupang PA collection belongs to Orders. The selected Rocket account and
transport are validated, and `SourceImportRun`, `Order`, and `OrderLineItem`
are persisted with deterministic identities. In the same Prisma transaction,
Orders calls Supply's reconciliation port; Supply resolves exactly one active
confirmation line by account/PO/product and asks Inventory to replace the
request commitment with `rocket_final_order`. A barcode mismatch, ambiguous
confirmation, capacity conflict, or persistence failure rolls back the entire
import and no Sellpia workbook is returned. Replays are idempotent.

A final-order commitment is not a physical stock decrement. After Sellpia
shows the actual shipment in a strictly newer verified full snapshot, the
operator settles that commitment; cancellation releases it with an audit
reason. Settlement removes the logical hold while the newer `currentStock`
already contains the physical decrease, preventing double subtraction.

Analytics owns direct Sellpia SKU sales facts and depletion policy, but reads
Inventory's common availability. Exact product code, exact option code, and a
unique normalized barcode are deterministic resolution signals; missing,
inactive, or ambiguous candidates remain `mapping_required`, never synthetic
zero stock. Products reuses this projection for operating-product summary
badges while `/stock-ops?tab=product-outflow` preserves every linked product/
variant destination. The screens remain separate and manual
`MasterProduct.abcGrade` is not overwritten by sales-derived ABC.

The frontend preserves the active route ownership and compositions recorded in
the Frontend Route Map and nearest route guides. One shared coordinator/drawer
supplies Sellpia freshness, while active pages may expose compact status and
sync controls without rearranging their documented layouts. Product list,
detail, matching, and read-only options keep their exact ownership. The
Supply-owned Rocket preview and confirmation workspace is wired only into the
existing decision placeholder on `/rocket-orders`; `/purchase-orders` remains
the general supplier purchase-order screen. Intentionally retired URLs remain
absent from sidebar navigation and the App Router unless product names a
canonical replacement. Marketplace provider submission remains disabled.

Exact operation and recovery steps live in the
[freshness runbook](runbooks/sellpia-inventory-freshness.md),
[channel matching runbook](runbooks/channel-sellpia-matching.md), and
[Rocket confirmation boundary](runbooks/sellpia-rocket-inventory-sync.md).

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
