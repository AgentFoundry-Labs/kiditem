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
  -> operations control plane (catalog, schedule, run ledger, dispatch)
  -> Coupang Wing / channel providers
  -> Gemini / image providers
  -> Chromium detail-page image rendering
  -> Agent OS CapabilityInvocation admission + CopilotKit + private MCP v2
  -> TS Playwright sourcing browser runtime
  -> Python worker/tools for analysis-heavy sourcing helpers

Native host apps/agent-gateway (macOS development, Windows Office)
  -> HTTP command long-poll + bounded event POST -> Nest private route
  -> deep native provider runtime -> Codex/Claude login, readiness, conversations, process trees
  -> Codex/Claude MCP v2 Streamable HTTP -> Nest loopback

Company Chrome extension
  -> authenticated Coupang Wing form automation
```

The Nest backend has static process roots; an environment flag never decides
whether a process owns Operations:

```text
main.ts            -> ApiApplicationModule         -> HTTP + owner domains + Operations
worker.ts          -> AgentWorkerApplicationModule -> Operations worker only
apps/agent-gateway -> native host process           -> provider conversations/CLI only
```

`AgentOsInteractionHttpModule` is the API-only Nest incoming adapter for
CopilotKit and authenticated conversation APIs. A native Agent Gateway polls
Nest for structured commands and posts bounded events; it exposes no inbound
listener and never accepts a raw shell command. Gateway-spawned Codex/Claude
processes call the private Nest MCP v2 Streamable HTTP adapter with one opaque
transport token generated per Gateway process. The provider MCP configuration
and token stay stable across ordinary turns. Each request authenticates that
transport, while an actual business tool call lazily resolves its static
`conversationId` locator against Nest's current active-turn record. The token
and locator grant no business authority. The adapter exposes exactly five
tools: `capability_catalog_search`, `capability_invoke`, `invocation_status`,
`operation_status`, and `readiness_probe`. Those tools expose the 17 code-owned
CapabilityDefinitions, including all ten Sourcing capabilities.

A cross-domain read may be invoked directly; a mutation is owned by the
explicitly selected domain Agent profile and retains the caller request key at
the final owner boundary. `approvalRisk` determines whether exact input must be
confirmed. Approval stores no separate role/grant model. Once an exact approval
is durably recorded, the API-owned `CapabilityMutationDispatcher`
deterministically executes the already-admitted receipt from its persisted
canonical input/hash and stable owner key. It never resumes provider reasoning.
On API bootstrap it performs one bounded sweep of at most 100
`pending`/`approved` receipts. An ambiguous owner outcome remains `pending` and
is reachable only through explicit same-request replay or the next
API-bootstrap sweep. There is no Invocation worker queue, lease, timer, or
retry loop. The MCP adapter never writes owner rows or creates Operations
except through the selected owner capability.

Production supports exactly one API instance. API replicas, rolling overlap,
and overlapping lifecycle ownership are unsupported. One native Gateway owns
provider conversations and host CLI process trees; the worker owns durable
Operations and never spawns a provider CLI. Gateway or API restart ends live
turns and clears in-memory commands, process registration, and active-turn
records without prompt replay, automatic Continue, or durable provider-session
recovery. A later protected Gateway poll re-registers the current process
transport; the user sends a normal new message to start reasoning again.

Frontend code never talks to the database directly. All app data flows through
NestJS APIs and shared Zod contracts from `@kiditem/shared`.

### Operation Control Plane And Manual Action Parity

`apps/server/src/operations` is the platform control plane for operational
work that needs a durable server-side run envelope: schedules, requests
originating from Agent capabilities, and Operation-backed manual actions.
Operations owns the code-owned catalog,
organization-scoped schedules, top-level `OperationRun` ledger, engine
dispatch, and browser-runtime leases; it does not write canonical business
rows and does not own or execute Agent capabilities.

Manual browser work has a stricter UI parity rule. The dashboard Agent OS
button and its individual domain-screen button call the same shared frontend
action. The trigger surface may differ, but extension command, account/date
defaults, empty-vs-login classification, persistence, generated artifacts, and
browser-session alerts do not. A dashboard button must not replace an existing
screen action with a count-only Operation handler.

The KID-25 target dependency direction is:

```text
dashboard button ─┐
                  ├─> shared manual action -> extension + owner API/sink
domain button ────┘

schedule / Operation-backed capability -> operations
                                       -> owner operation adapter
                                       -> owner input port
                                          | automation workflow port
                                          | owner capability port
                                          | ai direct-job port

approved non-Operation mutation -> CapabilityMutationDispatcher
                                -> owner input port

automation -X-> provider conversation
operations -X-> agent capability registry
```

Trend collection and Sellpia refresh are Operation-backed shared manual
actions because their durable result already lives behind owner APIs. Order
collection, Coupang shipment-summary lookup, and Rocket PO collection keep
their existing browser action contracts so dashboard execution preserves the
same generated files, saved summaries/catalogs, and operator-facing results as
their screens. Scheduled variants may use Operations, but they do not redefine
manual-button behavior or browser-local artifact ownership.

Business owners register handlers and retain their own result sinks.
`OperationAlert` remains a personal notification projection, not the source of
truth for an operation run. Browser runtime attempts are fenced by an
`attemptToken` so stale extension reports cannot change a newer attempt.
The global notification sheet is one chronological list: Alert rows and run
projections share the same compact row presentation, with no separate Agent OS
or `내 작업` card section. Manual shipment and Rocket actions publish distinct
browser collection producers so their titles and return links remain stable.

Sourcing has one exact ownership flow:

```text
sourcing screen -> Operations start/read -> owner operation handler
browser handler -> KidItem OS claim -> fenced owner ingest
owner snapshot -> sourcing screen
Operations never owns sourcing or Ads canonical rows
```

Operations provides the run envelope, resource-class dispatch, lifecycle gate,
and browser lease only. The Sourcing or Advertising owner handler writes its
own canonical observations and exposes its own read model; no raw
`OperationRun.result` becomes a canonical row.

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

## Identifier And Resource-Name Architecture (KID-25 Target)

KID-25 establishes this boundary before its public interaction/runtime
contracts cut over. KidItem separates identity roles instead of exporting
arbitrary UUID strings:

- Prisma owner tables keep native UUID storage keys with
  `@default(uuid()) @db.Uuid`; the UUID generation algorithm is private to
  persistence and existing rows are not rekeyed.
- Application/domain/repository code uses Zod-branded owner IDs from the
  focused `@kiditem/shared/identifiers` contract. There is no generic `Id`
  alias and adapters parse before use.
- HTTP, AG-UI, event, and cross-domain references use typed hierarchical
  resource names such as
  `organizations/{organization}/agentSessions/{session}/tasks/{task}` and
  `organizations/{organization}/operations/{operation}`. Resource names have
  no `/api` prefix/version and are computed rather than persisted redundantly.
- `copilotThreadId`, `aguiRunId`, provider IDs, browser collection run IDs,
  runtime handles, and tool-call IDs are opaque external-protocol identities.
  A UUID-shaped external value is not a KidItem database ID.
- UUIDv4 request IDs correlate transport requests only. Scoped idempotency
  keys identify commands. Bigint sequences order aggregate events. Opaque
  tokens prove short-lived authority. SHA-256 digests identify canonical
  content/policy. None is interchangeable with a resource name.
- Parsing a resource name proves syntax and parent structure, not access.
  Controllers still derive organization/actor from authentication and owner
  services recheck the complete resource graph.

AgentOS resource patterns and the Operation relationship are normative in the
[Interaction OS design](docs/superpowers/specs/2026-08-13-ai-chat-interactive-response-design.md#71-identifier-and-resource-name-system).
The scheme follows Google AIP-122/123/133/151/155 resource and request
separation while retaining this repository's native Prisma UUID convention.

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
| `apps/agent-gateway/src/__tests__` | Test Support | Cross-component native Gateway contracts. |
| `apps/agent-gateway/src/config` | Platform Support | Strict absolute-path Gateway config and installation-token reader. |
| `apps/agent-gateway/src/control` | Platform | Outbound long-poll, bounded event outbox, command dispatch, internal four-slot active-turn registry, and control-loss shutdown. |
| `apps/agent-gateway/src/conversation` | Platform | Bounded conversation descriptors and provider conversation routing. |
| `apps/agent-gateway/src/platform` | Platform Support | macOS and Windows process supervision. |
| `apps/agent-gateway/src/profile` | Platform | Five Agent instruction profiles plus general chat. |
| `apps/agent-gateway/src/provider` | Platform | One deep native-provider-runtime Interface owns exact train/login/startup/readiness/close assembly; the shared `ProviderConversationPort` seam and provider-command rules remain here while provider-specific Implementations stay local to `codex/` and `claude/`. |
| `apps/agent-gateway/src/provider/codex` | Platform | Codex app-server Implementation and adjacent specs. |
| `apps/agent-gateway/src/provider/claude` | Platform | Claude CLI Implementation and adjacent specs. |
| `apps/agent-gateway/src/security` | Platform Support | Provider environment and local-path redaction/validation. |
| `apps/server/src/__tests__` | Test Support | Cross-root static architecture and process-composition policy checks. |
| `apps/server/src/activity-events` | Owner Capability | Activity event read endpoint. |
| `apps/server/src/advertising` | Owner Domain | Coupang ad operations, scrape ingest, authoritative exact-day profitability spend refresh/read evidence, daily facts, and strategy/action generation. |
| `apps/server/src/agent-os` | Platform | Agent/profile registry, transient Gateway control, conversation facade, stateless MCP, durable capability admission, and completed-event history composition. |
| `apps/server/src/agent-os/application/port/out/history` | Platform | Completed-event history Interface at the outgoing history seam. |
| `apps/server/src/agent-os/adapter/out/history/sqlite` | Platform | Outbound SQLite Adapter for the completed-event history Interface, with its Implementation and OSS characterization specs. |
| `apps/server/src/ai` | Owner Domain | Image/text/detail-page/thumbnail AI providers, durable direct-job execution, content-workspace ownership/branching, and Agent OS output boundaries. |
| `apps/server/src/analytics` | Owner Read Model | Dashboard, statistics, traffic, and supplier-stats reporting. |
| `apps/server/src/auth` | Platform Capability | Local password verification, durable hashed sessions, login/logout/me, guards, decorators, middleware, and auth operator CLI. |
| `apps/server/src/automation` | Platform | Workflows, alerts, action board, marketplace install, and panel projection. |
| `apps/server/src/channels` | Owner Domain | Marketplace account, account-scoped listing/registration capability, durable listing-deletion operations, order, return, Wing/Rocket catalog identity, typed exact-evidence extraction, option-to-inventory matching, derived listing-product summaries, direct option-component diagnostics, and sellable-capacity projections. |
| `apps/server/src/common` | Platform Support | Shared backend DTOs, filters, KST/date helpers, security, storage, and pricing helpers. |
| `apps/server/src/feature-gate` | Platform Capability | Feature flag endpoint and config behavior. |
| `apps/server/src/finance` | Owner Domain | Live P&L, sales analysis, supplier payments, sales plans, settlements, and the read-only contribution-profit evidence port consumed by Products' automatic ABC evaluation. |
| `apps/server/src/inventory` | Owner Domain | Sellpia-authoritative imports, freshness state, browser claim lease, full-snapshot validation/publication, physical SellpiaInventorySku availability, warehouse/transfer/return records, and matching/purchase-preview read boundaries. |
| `apps/server/src/orders` | Owner Domain | Orders, returns, reviews, return-transfer operations, Coupang directship collection conversion, and durable Sellpia workbook submission idempotency/audit. |
| `apps/server/src/operations` | Platform | Code-owned operation catalog, schedules, top-level run ledger, engine dispatch, and browser-runtime leases. |
| `apps/server/src/organizations` | Platform Capability | Organization listing surface. |
| `apps/server/src/operation-cancellation` | Platform | Cross-owner durable cancellation endpoint and orchestration. |
| `apps/server/src/prisma` | Platform Support | `PrismaModule` and `PrismaService` only. |
| `apps/server/src/products` | Owner Domain | Canonical KidItem inventory-product (`MasterProduct`) operations and ABC ownership, direct ChannelListingOption-to-SellpiaInventorySku component replacement/capacity, automatic profitability ABC formula/evaluation/publication, and `/api/categories` compatibility CRUD. |
| `apps/server/src/readiness` | Platform Capability | Readiness checks and health-style operational surface. |
| `apps/server/src/rules` | Owner Domain | Business rules HTTP orchestration and Agent OS delegation. |
| `apps/server/src/sourcing` | Owner Domain | Chinese new-product discovery, allowlisted collection controls, append-only evidence ingestion, exact LaunchCandidate identity, immutable recommendation decisions, reviewed ProductPreparation input, and authoritative ProductRegistrationExecution lifecycle. |
| `apps/server/src/supply` | Owner Domain | Supplier registry, immutable supplier-offer/price-tier snapshots, proposed procurement test intents, SellpiaInventorySku supplier policy, freshness-fenced purchase submission attempts/reconciliation, and read-only Rocket capacity preview. |
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
| `apps/server/src/agent-os` | Hexagonal | Capability admission, transient Gateway control/conversation, MCP, repository, completed-event-history Interface at `application/port/out/history/`, outbound SQLite Adapter at `adapter/out/history/sqlite/`, and owner composition behind ports/adapters. The two cross-cutting contracts `application/port/out/capability-invocation.repository.port.ts` and `application/port/out/gateway-conversation.port.ts` are exact direct-port exceptions fixed by the approved KID-25 plan; every new outgoing port still requires an explicit lane directory. |
| `apps/server/src/ai` | Hexagonal | provider, runtime handler, bridge, sink, media, fetch, and storage boundaries behind ports/adapters. |
| `apps/server/src/analytics/dashboard` | Hexagonal | port/adapter lanes complete; 8 outgoing ports + repository adapters cover Prisma reads, application services are Prisma-free, architecture + module wiring specs freeze invariants. |
| `apps/server/src/analytics/statistics` | Flat | Overview, product, category, grade, Pareto, and repurchase read service. |
| `apps/server/src/analytics/traffic` | Flat | read service plus operator upload mutation lane. |
| `apps/server/src/analytics/supplier-stats` | Flat | supplier report service. |
| `apps/server/src/auth` | Hexagonal | Auth service and repository port own password/session policy; Prisma and CLI/HTTP adapters own persistence and entrypoints. Guards and decorators remain infrastructure. |
| `apps/server/src/automation` | Hexagonal | port/adapter lanes complete; 6 outgoing repository ports + `OPERATION_ALERT_PORT` owner-side incoming port published from `application/port/in/` for cross-domain producers; architecture + module wiring specs freeze invariants; `WorkflowRunnerService` PrismaService carve-out documented for the executor framework. |
| `apps/server/src/operations` | Hexagonal | code-owned operation definitions, run/schedule repository ports, native-runtime ports, dispatcher, server queue worker, and browser lease APIs; canonical business writes remain in owner incoming capabilities. |
| `apps/server/src/channels` | Hexagonal | Provider APIs use `application/port/out` plus `adapter/out/coupang`; catalog import and matching use repository ports plus an Inventory-owned read-port bridge. |
| `apps/server/src/channels/adapters` | Flat | compatibility shims only; new provider work uses `adapter/out/coupang/`. |
| `apps/server/src/feature-gate` | Flat | endpoint/config capability. |
| `apps/server/src/finance` | Flat | controllers/services/DTO plus folded finance capabilities. |
| `apps/server/src/inventory` | Hexagonal | Sellpia freshness/publication single-writer, browser lease, snapshot-aware physical availability, narrow matching/purchase gates, and retained warehouse/transfer/return capabilities behind ports/adapters. |
| `apps/server/src/orders` | Flat | controllers/services/DTO plus folded order capabilities; Sellpia transmission fencing is a scoped `application/port` + `adapter/out/repository` sub-capability. |
| `apps/server/src/organizations` | Flat | controller/service capability. |
| `apps/server/src/operation-cancellation` | Hexagonal | HTTP endpoint plus application service; consumes Automation, Agent OS, and AI owner-side ports only. |
| `apps/server/src/products/categories` | Flat | `/api/categories` compatibility capability under products ownership. |
| `apps/server/src/readiness` | Flat | readiness controller/service. |
| `apps/server/src/rules` | Flat | HTTP orchestration delegates execution to Agent OS ports. |
| `apps/server/src/sourcing` | Hexagonal | Discovery, source/evidence ledger, launch identity, decision policy, and sourcing agent/products boundaries behind ports/adapters; Supply handoffs use only the exported incoming procurement port. |
| `apps/server/src/supply` | Hexagonal | Supplier/offer/procurement persistence, create-only pre-purchase intents, idempotent external submission attempts, the narrow opaque Inventory-fence transaction adapter, and Rocket preview policy behind ports/adapters; architecture + module wiring specs freeze invariants. |
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
  domain/capability/      owner-defined Agent capability contracts, when platform-visible
  application/service/    orchestration, transactions, organization context
  domain/                 pure policy/model/service code
  mapper/                 row/DTO/domain/shared contract mapping
```

Required: module file, `application/service/`, and a port/adapter boundary for
each DB, provider, runtime, storage, event, workflow, or cross-domain IO lane.
Optional: `adapter/in/http/` when no HTTP entrypoint exists, `application/port/in/`
when no other owner consumes the use case, `domain/` when no pure policy/model
exists yet, and `mapper/` when mapping is trivial.

Agent-facing capabilities use the neutral contract in
`apps/server/src/common/capability-definition.ts`. Each owner domain owns its
`CapabilityDefinition`, strict business input/output schemas, incoming port,
and production implementation. Agent OS only aggregates those definitions and
binds each exact `ownerInputPort`; it never defines or performs another
domain's canonical mutation.

A capability represents an independently useful business intent, not every
domain service method. Definitions retain precise effects, approval risk, and
idempotency metadata. Cross-domain routing is intentionally simple: the current
conversation Agent may run reads directly, while `db_write`, `external_write`,
and `job_enqueue` work is delegated through a provider-native explicitly
selected Agent profile responsible for the owner domain. No separate grant
record is created. Mutation capabilities require owner-enforced idempotency. Do not
reintroduce legacy `kind`, `visibility`, monetary `cost`, or
resource/tool/workflow/sink categories.

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

An Agent capability is therefore an `adapter/in/agent` implementation that
translates a policy-approved invocation into an owning-domain input port. It
does not own the business use case or durable lifecycle. An Operation handler
is another incoming adapter and calls the same owner input port when work needs
lease/checkpoint/retry/cancel semantics. Operations handlers never call the
Agent capability registry. Agent OS has no generic session-task Operation,
Task/Attempt recovery loop, or durable provider transcript.

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
- `App Internal`: Next/app shell, tests, fonts, or special app
  surfaces.
- `Test Support`: test-only frontend helpers or specs.

### Frontend Route Map

| Path | Kind | Routes / Notes |
|---|---|---|
| `apps/web/src/app/(advertising)` | Route Group | `ad-ops`, `rank-tracking` |
| `apps/web/src/app/(analytics)` | Route Group | `dashboard` |
| `apps/web/src/app/(automation)` | Route Group | `_shared`, `action-board`, `agents`, `marketplace`, `workflows` |
| `apps/web/src/app/(catalog)` | Route Group | Canonical inventory-product operations center at `/product-hub`; direct channel-option inventory configuration on product detail; option-to-Sellpia matching with automatic MasterProduct derivation at `/product-hub/matching`. |
| `apps/web/src/app/(finance)` | Route Group | Active `/profit-loss`, `/reports`, and `/sales-analysis` surfaces; settlement remains a tab inside sales analysis. |
| `apps/web/src/app/(inventory)` | Route Group | Active `/inventory-hub`, `/inventory`, `/stock-ops`, and `/coupang-shipments` surfaces; Warehouse reads remain reference data for `StockTransfers`, with no standalone warehouse-management route. |
| `apps/web/src/app/(orders)` | Route Group | Active `/order-collection`, `/orders`, `/rocket-orders`, and `/reviews` surfaces; order collection and processing own their route-local workspaces, while the Rocket capacity placeholder consumes the shared preview contract. |
| `apps/web/src/app/(sourcing-ai)` | Route Group | `sourcing-ai`, `sourcing-ai/category-sourcing`, `sourcing-ai/competitor-analysis`, `sourcing-ai/decision-center` (초기 진입 추천 표: 1688 신상품·키워드 트렌드·쿠팡 경쟁상품·쿠팡 급상승을 합쳐 상품을 직접 추천하고, 관심 키워드로 분류하며, 자사 데이터 RAG 어시스턴트를 곁들인다), `sourcing-ai/final-selection`, `sourcing-ai/keywords`, `sourcing-ai/market`, `sourcing-ai/recommendations`, `sourcing-ai/settings`, `sourcing-ai/validation`, `sourcing-ai/wholesale-search`, `sourcing-ai/wing-catalog` |
| `apps/web/src/app/(product-pipeline)` | Route Group | `detail-page-client-render` (fullscreen extension capture surface), `product-pipeline/collected-products`, `product-pipeline/collected-products/[id]`, `product-pipeline/collected-products/[id]/editor`, `product-pipeline/collected-products/[id]/templates`, `product-pipeline/detail-pages/[generationId]/editor`, `product-pipeline/detail-template-generation`, `product-pipeline/productgenerate`, `product-pipeline/registered-products`, `product-pipeline/registered-products/[workspaceId]`, `product-pipeline/thumbnail-ai`, `product-pipeline/thumbnail-generation`, `product-pipeline/thumbnail-generation/edit` |
| `apps/web/src/app/(supply)` | Route Group | `/purchase-orders` is the general purchasing surface only; Supply owns the Rocket preview and confirmation contracts consumed by `/rocket-orders`. |
| `apps/web/src/app/agent-os` | App Internal | Fullscreen visualization surfaces `/agent-os` and `/agent-os/network`, separate from `/agents`. |
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

- Product list, detail, and matching preserve their independent compositions.
  `/product-hub` is the staged product operations center backed by the
  read-only Sellpia snapshot, `/product-hub/[id]` is the read-only snapshot
  detail, and `/product-hub/matching` is the Coupang ChannelSku
  component-recipe workspace. `/inventory-hub` owns the tabless, complete
  read-only Sellpia SKU workspace with inventory actions, URL-authoritative
  filters, connection destinations, and transfer/return records.

- `/rocket-orders` remains the preserved Rocket operations screen and is not a
  compatibility redirect. Its existing `납품 수량 판단 추후 연동` placeholder
  consumes the deterministic Sellpia freshness/component-capacity preview and
  is the only operator-facing Rocket review route. `/purchase-orders` remains
  the general supplier purchase-order screen.

- Current composition ownership is exact: `/inventory-hub` has no tabs and
  owns one Sellpia inventory workspace; `/stock-ops` has `product-outflow` and
  `channel-zero`. Active Orders routes are independent workspaces and do not
  inherit tabs from retired hub screens.

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
| `apps/web/src/lib` | App-Wide Shared | API client, query keys, opaque local-session state, extension auth sync, and formatting helpers. |
| `apps/web/src/test` | Test Support | Shared web test fixtures and domain-contract builders. |
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

### Global Conversation Workspace

The authenticated app shell mounts one route-stable `ConversationProvider` and
`RuntimeHost`. The global AI chat panel is one presentation of that runtime;
Agent OS presents the same conversation history and workspace, suppressing
only the duplicate chat body while preserving the live runtime.

`RightAuxiliaryPanel` is the only right-side surface. Its mutually exclusive
`notifications | ai_chat | null` state renders `NotificationPanelContent` or
`ConversationPanel`; there is no `PanelSheet` shell or panel-open store. At
1536 pixels and above (`2xl`) it is a 352-pixel push dock that reduces the
work-surface width; from 768 through 1535 pixels it is the same 352-pixel
overlay, and below 768 pixels it is a full-width modal drawer. Agent OS uses
the same route-stable runtime plus shared conversation-flow, composer,
empty-state, and business-evidence presentation primitives in its history
workspace; it does not mount a second chat runtime. Dashboard and Agent OS use
the same 256-pixel expanded / 64-pixel collapsed sidebar shell and desktop
preference while retaining different navigation bodies.

The native Gateway serializes conversation descriptors and preferences in its
local state, owns provider-native session continuity, and deletes the exact
provider conversation before removing its descriptor. The API-local CopilotKit
OSS SQLite runner owns canonical completed AG-UI event history. Nest exposes
the authenticated facade only; PostgreSQL has no conversation, preference,
transcript, or provider-session model.

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

## Wing Detail-Page Client Rasterization

Wing direct registration requires one finalized 780px JPEG derived from the
candidate's current immutable `DetailPageRevision`. It is intentionally not an
`AiDirectJob` and never launches Chromium on the server.

```text
Wing preparation
  -> server selects current DetailPageRevision
  -> reuse DetailPageImageArtifact, or issue DetailPageImageRenderIntent
  -> verified company extension claims the intent
  -> dedicated fullscreen web route renders scriptless HTML at 720 CSS px
  -> extension uses one CDP Page.captureScreenshot at 780 output px
  -> extension PUTs JPEG directly to the server-derived presigned object key
  -> server bounded-reads and verifies metadata, JPEG dimensions, bytes, SHA-256
  -> server finalizes DetailPageImageArtifact
  -> Wing form handoff receives exactly that one public object-storage URL
```

The browser never chooses organization, revision, variant, output width,
object key, or storage origin. IndexedDB is a bounded retry cache only; it is
not artifact authority. Capture failure does not fall back to server
Puppeteer, image splitting/stitching, a blob URL, or unrelated candidate
images. `DetailPageRevision` remains the source of truth even though the Wing
raster executor was removed.

## Sourcing Intelligence Evidence And Test-Intent Boundary

Sourcing intelligence is a truth-data and decision-audit capability, not an
LLM-generated ordering shortcut. Sourcing owns source permission, evidence,
candidate identity, and recommendation policy. Supply owns observed supplier
commercial terms and every pre-purchase intent. The only cross-owner mutation
is `SOURCING_SUPPLY_INTELLIGENCE_PORT` backed by Supply's exported
`SUPPLY_SOURCING_PROCUREMENT_PORT`; Sourcing never writes Supply models.

```text
allowlisted source + optional organization enabled override
  -> SourcingEvidenceIngestionRun
  -> append-only SourcingEvidenceObservation
  -> immutable SupplierOfferSkuSnapshot + SupplierOfferPriceTier (Supply)
  -> exact SourcingLaunchCandidate
  -> SourcingDecisionBatch + item/evidence ledger
  -> proposed ProcurementTestIntent (Supply)
  -X-> PurchaseOrder or provider submission
```

Collection control is deliberately small: source keys are an explicit server
allowlist and an organization may write one `enabled` override. Absent override
means enabled. The claim and commit transactions recheck that control, while
lease, idempotency, cancellation, freshness and observation identity stay in
the collection/evidence model. There are no source review versions, expiry
dates, lifecycle states, or policy histories in this runtime.

Extension product ingest follows the same collection gate as provider IO. The
deployed v1 KidItem OS payload remains a validated snake_case compatibility
wire; v2 obtains its collection session before browser IO and carries the
external offer identity, capture time, extractor version, and payload hash
explicitly. Both flows claim an allowlisted, enabled lane before any durable write, recheck it
at commit, append an immutable observation,
then project a candidate using `(platform, externalOfferId, normalizedVariant)`
rather than a title, URL tracking parameter, or result index. The assistant
adjacent to Entry is retrieval-first: without explicit server configuration it
returns only organization-scoped internal evidence. Its optional single
generation port accepts server-selected `claude` or `codex`, never client
provider/model input, and has bounded prompt/output/time/concurrency. Claude
has an empty actual tool list; Codex uses ephemeral read-only non-interactive
execution with every local execution, browser, plugin/app, image, and web
search surface disabled. Either runtime failure remains a retrieval-only
answer and neither may write sourcing or Supply records.

`SourcingEvidenceObservation` is revision-aware and append-only. Every decision
freezes the exact observation IDs that were available at its cutoff, while the
repository preserves event, observation, availability, revision, ingestion,
payload-hash, and source provenance. A client cannot submit model
versions, scores, canonical decisions, calibrated probabilities, or policy
propensities. Those fields are server-derived.

One observation series has sequential revisions and an immutable source,
scope, platform, concept, entity, schema, granularity, and signal-role envelope.
Only the absolute latest revision from a completed, fresh ingestion run may
support a positive decision. Partial, superseded, failed, or quarantined
evidence remains context only. A positive recommendation requires
the exact role pair `Coupang + demand` and `1688 + supply`, at least three
evidence families, and at least two platforms; risk or compliance observations
cannot be relabeled as positive demand or supply.

Run coverage is server-derived from distinct first-revision observation series
over the frozen expected denominator; correction revisions never increase it,
and a conflicting collector-supplied percentage is rejected. Decision-batch
commit locks each supporting observation series, then rechecks the completed
run, freshness, and absolute latest revision before persisting any `support:*`
evidence.

`SourcingLaunchCandidate` requires an unexpired `exact_variant` supplier offer,
known order-unit conversion, opaque product-concept and Korean sellable-bundle
version keys, target channel account, launch quantity/price/fulfillment, and
versioned compliance, IP, quality, and launch-plan snapshots. It is the stable
identity for later outcome labels; a broad 1688 offer or a visually similar
Coupang item is not a launch identity.

For a test-order intent, the launch's initial order quantity is the requested
purchase-unit quantity. Supply freezes the selected offer's physical units per
purchase unit and the launch's physical units per Korean sellable bundle, then
requires exact quantity conservation:

```text
requestedSellableUnits
  = requestedPurchaseUnits * unitsPerPurchaseUnit / unitsPerSellableBundle
```

The division must be exact. These conversion inputs and outputs are part of the
immutable request hash and are recomputed under the transaction lock before the
intent is inserted. RFQ/sample records without a LaunchCandidate do not invent
a sellable-unit quantity.

The current discovery model is a deterministic Phase 0 baseline. Its
`confidence` is source coverage, not purchase-success probability, so decision
batches are persisted as `shadow` and the canonical policy keeps them on
`hold` (or `reject` for hard gates/non-positive P10 economics). It never
fabricates `policyProbability`, and cannot create a `test_order` intent. RFQ or
sample intents may be proposed only when their Supply identity rules pass.
Actual contextual-bandit or reinforcement learning starts only after immutable
assignment/exposure and outcome ledgers produce calibrated labels; no such
training or automatic provider action is enabled by this foundation.

## Account-Scoped Registration And Content Ownership (`0.1.8`–`0.1.25`)

Sourcing owns reviewed registration input in `ProductPreparation` and the
frozen provider-execution/provenance fence in
`ProductRegistrationExecution`. The Agent-facing mutation terminates at a
Channels-owned incoming port: it loads that frozen state only through the
Sourcing read boundary, then Channels owns provider submission, the resulting
`ChannelListing`, its minimal owner-idempotency receipt, and
`ChannelListingDeletionOperation`. Provider state is never accepted as Agent
business input. AI owns candidate/listing content workspaces. Registration no
longer promotes a candidate into `MasterProduct`.

```text
SourcingCandidate (status: sourced | rejected)
  -> ProductPreparation draft for a selected ChannelAccount
  -> ProductRegistrationExecution freezes canonical payload JSON + SHA-256
     + stable submission key + actor/account evidence
  -> persist executing/uncertain before provider IO and reconcile by key/provider ID
  -> call provider outside the DB tx only when the execution remains
     prepared/not_attempted and reconciliation proves this is new
  -> persist the fenced provider outcome
  -> one Channels DB tx resolves/reactivates the account-scoped ChannelListing
     + claims exact owner key/request hash in
       ChannelRegistrationOwnerIdempotencyReceipt
     + replays the minimal listing result or rejects changed canonical input
```

No bulk cutover backfill copies legacy preparation or deletion rows into these
operation ledgers. The registration runtime may import one scoped legacy
preparation under its row lock when that row is actually claimed; it never
turns an uncertain legacy provider attempt into a fresh create.
The retired hosted database was not authoritative and was deleted without a
cutover. Environments with data worth preserving require a separately reviewed,
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
deletion ledger backfill because the authoritative Office dataset has no legacy
marketplace operation history to preserve.

`ContentWorkspace.ownerType` is `sourcing_candidate`, `channel_listing`, or
`direct_detail_page`. Registration branches selected artifact/revision metadata
and HTML, reuses storage URLs and the same managed thumbnail asset, and does not
clone generation jobs/candidates. Current-thumbnail selection may adopt an
existing content asset, a succeeded generation candidate, or an external URL
that first passes the guarded fetch/storage boundary. Asset deletion and GC
must reject active generation usage or any thumbnail selection.

## Sellpia Freshness, Physical Availability, And Channel Capacity (`0.1.19`–`0.1.22`)

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
| Canonical inventory product | `MasterProduct` | `master_products` | Organization-scoped inventory-product identity, metadata, active state, and sole ABC grade. It may have one source row per provider type and any number of consuming channel options; it never owns provider stock facts. |
| Physical Sellpia source SKU | `SellpiaInventorySku` | `sellpia_inventory_skus` | Organization + Sellpia product code and a unique canonical `masterProductId`. Only a completed valid Inventory publication writes active state and `current_stock`, and that publication atomically provisions/updates the canonical MasterProduct. |
| Channel product/option | `ChannelListing` / `ChannelListingOption` | `channel_listings` / `channel_listing_options` | Organization + ChannelAccount + provider identity. An option is the sellable channel identity and may consume source SKUs. A listing's nullable MasterProduct is only a derived summary when every option resolves to the same product. Provider metadata is never inventory truth. |
| Option inventory consumption | `ChannelListingOptionInventoryComponent` | `channel_listing_option_inventory_components` | Positive quantity of one SellpiaInventorySku consumed by one channel-option sale; every cross-model relation is organization-fenced. |
| External submission intent | `PurchaseOrderSubmissionAttempt` | `purchase_order_submission_attempts` | Organization + purchase order + idempotency key; records freshness generation, provider terminal/unknown outcome, and authenticated reconciliation. |
| Sellpia order submission fence | `SellpiaOrderTransmissionIntent` / `SellpiaOrderTransmissionIntentReconciliation` | `sellpia_order_transmission_intents` / `sellpia_order_transmission_intent_reconciliations` | Orders-owned organization + stable workbook intent key. Prevents duplicate browser submission and audits explicit reconciliation without reading or advancing Inventory freshness. |
| Rocket confirmation | `RocketPurchaseConfirmation` / `RocketPurchaseConfirmationLine` | `rocket_purchase_confirmations` / `rocket_purchase_confirmation_lines` | Organization + Rocket account + completed source run + UUID idempotency key; records every explicit line decision and confirmation/release actor. |
| Rocket component allocation | `RocketPurchaseConfirmationAllocation` | `rocket_purchase_confirmation_allocations` | Immutable Supply audit snapshot for one confirmed line; not a second capacity ledger. |

The commitment, Picking, Unshipped, and Sellpia receipt-batch application
capabilities and persistence models are retired. Availability is physical:
`availableStock === currentStock`.

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
10–30% churn, and inactive confirmed-component references are bounded warnings.
The first post-order identical hash schedules one three-minute confirmation;
the next identical file verifies it without a third loop. An attested manual
fresh export uses the same validation/publication path and records actor/time.

Sellpia order-workbook submission is independent from Inventory freshness.
Orders prepares and finalizes a stable transmission intent only to fence an
irreversible browser submission. KidItem does not pre-check local stock for the
upload; Sellpia accepts or rejects the workbook and its exact provider error is
shown to the operator. Preparation, acceptance, rejection, and reconciliation
never request or advance an Inventory generation, invalidate Inventory queries,
or expose an Inventory recovery action.

Supply consumes only Inventory's narrow gate. Before any real `pending ->
ordered` transition, it checks fresh active product identities, then locks the
Sellpia state and purchase order together and compares the opaque fence. A
providerless transition commits atomically. External checkout creates one
durable `prepared` attempt before the provider call and reuses the caller's
idempotency key. Ambiguous response or an unresolved 15-minute prepared attempt
becomes `provider_unknown`; it requires explicit authenticated reconciliation
and cannot call the provider again. The web may auto-refresh and retry once only
for `SELLPIA_SYNC_REQUIRED`, with the same key.

Channels persists account-scoped Wing and Rocket identity. Catalog publication
upserts observed listings and options while preserving direct option-component
rows. It never creates a channel-origin MasterProduct. After recipe changes the
listing summary is derived: all options must be configured and resolve to one
canonical MasterProduct, otherwise `ChannelListing.masterProductId` is null.

The matching center owns direct option-component review. Its deterministic
command may fill only an empty option component list when organization-fenced
evidence uniquely selects one active Sellpia SKU and a verified positive pack
quantity. Manual replacement is a complete,
expected-current-component-fenced write. Existing components, duplicate or
conflicting evidence, uncertain pack/BOM evidence, raw aliases, and AI remain
untouched until operator review. Inventory remains the sole physical-stock
writer.

Confirmed direct option components remain the capacity truth.
Capacity is
`min(floor(availableStock / quantity))`, where
`availableStock === currentStock`. Channels and Products obtain that value from
Inventory's organization-scoped availability batch rather than reading stock
from recipe persistence. An uncollected snapshot publishes no SKU availability;
configured components therefore remain visible with zero stock, inactive state,
and null capacity until collection. Inactive components keep their stored rule
visible in `needs_review` instead of being silently removed.

Rocket preview uses the same canonical physical availability batch. A complete
extension collection also carries allowlisted official-workbook fields. Supply
reruns the preview under an organization lock, fences the Inventory generation
and completed source artifact, verifies that channel option and direct
component identities have not changed, and persists explicit line decisions
plus immutable component allocations. Those audit rows do not reserve capacity
or change physical availability. Idempotent replay returns the existing record;
input drift conflicts.

Confirmation creates the official workbook in the browser after the server
commit. It never submits to a marketplace provider or writes
`SellpiaInventorySku.currentStock`.

Coupang PA collection belongs to Orders. The selected Rocket account and
transport are validated, and `SourceImportRun`, `Order`, and `OrderLineItem`
are persisted with deterministic identities. In the same Prisma transaction,
Orders calls Supply's reconciliation port; Supply resolves exactly one active
confirmation line by account/PO/product without mutating Inventory availability
or physical stock. A barcode mismatch, ambiguous confirmation, or persistence
failure rolls back the entire import and no Sellpia workbook is returned.
Replays are idempotent. A later completed Sellpia snapshot remains the only
source of any physical stock decrease.

Analytics owns direct Sellpia SKU sales facts and depletion policy, but reads
Inventory's canonical physical availability. Exact product code, exact option
code, and a unique normalized barcode are deterministic resolution signals; missing,
inactive, or ambiguous candidates remain `mapping_required`, never synthetic
zero stock. Products reuses this projection for operating-product summary
badges while `/stock-ops?tab=product-outflow` preserves every linked product/
variant destination. Analytics persists raw Sellpia product-profit coverage;
Finance assembles source-freshness and time-decayed contribution-profit
evidence; Products owns the automatic ABC formula calibration, evaluation,
publication, and changed-grade history. The formula persists its checksum,
normalization knots, and version. Product Hub's Products-owned composite runs
the `full` Sellpia evidence child, the Advertising exact-day backfill child,
and one Products calculation child in order. The separate `inventory` action
collects only physical stock and never recalculates ABC. Orders and mapping are
read-only readiness inputs; the composite never repairs either. Product Hub,
product-outflow,
Dashboard, and Advertising consume the stored grade/evaluation snapshot;
missing evidence remains unclassified instead of C and stale source states
preserve the last published grade. Organization-locked publication fences stale
concurrent calculations. AI thumbnail analysis quality grades remain an
independent product-registration signal. Product-outflow may display matched
active Coupang catalog media through AI's read-only media capability without
copying image URLs into Inventory.

Product Hub renders visit/view/cart/order/sales/revenue/ad-rate from existing
listing daily facts independently of ABC. Missing fields remain null instead
of becoming zero. One organization-wide conservative data-basis date appears
in the header; one status modal owns source-specific freshness, composite
progress/failure, and aggregate order/mapping recovery counts.

The frontend preserves the active route ownership and compositions recorded in
the Frontend Route Map and nearest route guides. One shared coordinator/drawer
supplies Sellpia freshness, while active pages may expose compact status and
sync controls without rearranging their documented layouts. Product list,
detail, and matching keep their exact ownership; Inventory owns the complete
read-only Sellpia SKU table. The
Supply-owned Rocket preview and confirmation workspace is wired only into the
existing decision placeholder on `/rocket-orders`; `/purchase-orders` remains
the general supplier purchase-order screen. Intentionally retired URLs remain
absent from sidebar navigation and the App Router unless product names a
canonical replacement. Marketplace provider submission remains disabled.

Exact operation and recovery steps live in the
[freshness runbook](runbooks/sellpia-inventory-freshness.md),
[channel matching runbook](runbooks/channel-sellpia-matching.md), and
[Rocket confirmation boundary](runbooks/sellpia-rocket-inventory-sync.md).
Source/evidence onboarding through the non-ordering procurement handoff lives
in the [Sourcing Intelligence Phase 0–1 runbook](runbooks/sourcing-intelligence-phase0.md).

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

Agent OS is the single-node backend execution boundary under
`apps/server/src/agent-os/`; its schema ownership is in `prisma/AGENTS.md`.
Its only persistence model is `CapabilityInvocation`, which stores exact
request-driven mutation admission, approval fields, and the idempotent
result/error. Agent definitions and capability manifests are code-owned.
Provider-native conversation/session continuity is host-local, completed UI
event history is API-local SQLite, and long work remains an Operations-owned
`OperationRun`.

Completed canonical AG-UI event history has one outbound SQLite Adapter at
`apps/server/src/agent-os/adapter/out/history/sqlite/`, behind the unchanged
Interface at `application/port/out/history/`. Its `ConversationSqliteEventHistory`
Implementation is not part of the incoming CopilotKit transport seam. It uses
the attributed package-level fork of `@copilotkit/sqlite-runner@1.69.0`; the
delta is limited to process-local active-run serialization, exact-run stop
semantics, and exact completed-thread deletion. Upstream AG-UI compaction,
replay, and connection behavior remain intact. No CopilotKit cloud service or
PostgreSQL conversation/preferences model is used.

The browser reaches the Nest CopilotKit incoming adapter at same-origin
`/api/copilotkit`. The API authorizes the current user and sends only structured
conversation commands to the native Agent Gateway. The Gateway is the only
process that starts Codex/Claude and owns provider-native sessions plus bounded
conversation descriptors. Each live turn reaches the Nest MCP adapter through
private Streamable HTTP. The worker executes durable Operations but never
receives a CLI login profile or imports the HTTP adapter. A restart ends the
live turn without replay; a later normal user message starts new reasoning
against the provider-native session continuity.

The runtime keeps only the boundaries that own live correctness:

- the CopilotKit OSS runner and its authenticated SQLite Adapter own canonical
  completed AG-UI event recording/replay plus run, stream, and connect
  transport. They do not project provider-local history or persist a live lock;
  `isRunning` and `stop` delegate to Nest's exact in-memory active-turn record;
- one API-side Gateway control session owns command delivery, event fencing,
  readiness, one process-scoped MCP transport registration, and exact
  per-Conversation active-turn activation/deactivation;
- one native Gateway control session owns polling, command dispatch, bounded
  event retry, its internal four-slot provider-turn registry, and control-loss
  transition;
- one deep native provider runtime Module owns exact package-train validation,
  boolean-only login probes, Codex/Claude startup, readiness projection, and
  idempotent complete provider-tree shutdown behind the existing provider map;
- one authenticated conversation facade derives the organization from Nest
  authentication; Gateway descriptors persist that organization and fence
  create/list/rename/delete/turn start/input/interrupt without exposing it to
  browser DTOs or provider metadata;
- one request-driven CapabilityInvocation repository owns request-key
  uniqueness, input-drift conflict, exact approval, and result replay;
- the API-owned `CapabilityMutationDispatcher` revalidates the persisted
  receipt and stable owner key before owner execution, and performs only one
  bounded bootstrap sweep of at most 100 `pending`/`approved` receipts.

The installation bearer authenticates protected Gateway polling and event
delivery. The distinct process-scoped MCP token authenticates only the private
MCP transport. Nest derives organization, user, turn, and fresh execution ID
from its in-memory active-turn map; `conversationId` is only a lookup key.
Descriptor organization is a Conversation access fence shared by users in the
same organization, not MCP business authority. Provider terminal, process, and
Gateway-registration lifecycle messages carry no organization. At
most one turn is active per Conversation. An exact terminal event removes only
its matching record, so a stale terminal cannot clear a newer turn. Idle MCP
discovery may remain connected, but business tool calls fail closed when no
turn is active. There is no turn bearer rotation, binding TTL, durable runtime
session, unsubscribe barrier, cold resume, or automatic model recovery.

Web keeps one route-stable CopilotKit presentation adapter for the selected
Conversation. It does not independently own active-turn admission, interrupt
acknowledgement, stale settlement, or provider-history reconciliation. Its
completed-event replay and connection mechanics come from CopilotKit; Nest's
active-turn map remains the only run/stop authority and the Gateway remains the
provider process/session owner.

Owner domains pair their own `CapabilityDefinition`, incoming port, and
implementation in owner-local composition adapters. Agent OS only aggregates
those compositions and rejects duplicate, missing, unexpected, or mismatched
registrations. The 17-entry catalog, Zod schemas, and Gateway wire DTOs stay
flat declarations; wrapping them in stateful service classes would add no
invariant ownership.

Each public capability is defined by its owner domain with strict business Zod
input/output contracts. Agent OS aggregates definitions. Reads call the
owner-domain incoming port directly. Mutations only admit the exact durable
receipt; after durable approval, `CapabilityMutationDispatcher` calls the
owner-domain incoming port from that persisted receipt. There is no ephemeral
grant or database Agent version. An owner implementation may use AI, DB, an
external provider, or an Operation; Agent OS does not write owner-domain
canonical rows. Deterministic workflows remain native workflows and do not
create provider conversations merely for bookkeeping.

Official Codex/Claude execution uses only the dedicated Agent Gateway service
account's persisted local login. KidItem does not issue, copy, inject, log, or
persist provider credentials. The API remains unavailable until the Gateway
proves the required runtime/version, model/effort matrix, MCP contract, and
login readiness. Conversation runtime is fixed at creation; the user explicitly
selects model and effort for each turn. Provider credential and history bytes
remain owned by the host account/provider runtime on both macOS and Windows.

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
