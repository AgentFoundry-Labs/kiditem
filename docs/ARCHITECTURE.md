# KidItem Architecture

KidItem is an ecommerce operations automation monorepo for kids' products:
sourcing, catalog, channel listings, media AI, inventory, orders, finance,
advertising, analytics, and Agent OS automation.

The source-attempt boundaries below follow the
[ACTIVE hard-cutover specification](superpowers/specs/2026-09-03-operation-automation-hard-cutover-design.md).
Implementation, schema cutover and QA evidence are tracked in its
[delivery plan](superpowers/plans/2026-09-03-operation-automation-legacy-removal.md);
this ownership map is not evidence that an Office deployment has occurred.

## Runtime Topology

```
Browser
  -> apps/web (Next.js 16, React 19)
  -> apps/server (NestJS 11, /api prefix)
  -> PostgreSQL 17 (Prisma v7)

apps/server
  -> domain-owned source attempts, publication and Alerts
  -> existing authenticated Wing browser adapters (not Coupang OpenAPI)
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

KidItem does not use Coupang OpenAPI. The hard-cutover contract removes direct
server product/order sync and remote mutation/verification calls, their API-key
settings and automatic UI/Agent triggers. ChannelAccount remains the store
identity for authenticated Wing/ad-center collection and internal owner HTTP.
Existing validated browser paths remain; capabilities without a replacement
are explicitly unsupported, not temporarily disconnected or falsely confirmed.

The supported application process roots are:

```text
main.ts            -> ApiApplicationModule         -> HTTP + owner domains + Alerts
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
`operation_status`, and `readiness_probe`. Those tools expose the code-owned
CapabilityDefinitions in the public capability catalog.

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
retry loop. The MCP adapter invokes the selected owner capability rather than
writing canonical owner rows directly.

Production supports exactly one API instance. API replicas, rolling overlap,
and overlapping lifecycle ownership are unsupported. One native Gateway owns
provider conversations and host CLI process trees. Source owners retain their
own durable attempts without an Operations worker. Gateway or API restart ends live
turns and clears in-memory commands, process registration, and active-turn
records without prompt replay, automatic Continue, or durable provider-session
recovery. A later protected Gateway poll re-registers the current process
transport; the user sends a normal new message to start reasoning again.

Frontend code never talks to the database directly. All app data flows through
NestJS APIs and shared Zod contracts from `@kiditem/shared`.

### Source Ownership And Manual Action Parity

Core's shared import history exposes last-completed timestamps through
`core/read/source-import-run.reader.ts`. Dashboard collection badges compose
this organization-scoped reader; failed or running attempts do not advance a
completed timestamp. This read-only metadata boundary adds no Nest module or
mutation authority. Source owners retain publication, current-generation, and
coverage gates in their own fact readers; a completion timestamp alone does
not establish measurement coverage.

Each source owner admits an idempotent attempt and freezes its collection
inputs. The extension sends captured data directly to that owner. Validated
facts, COMPLETE publication and the matching Alert change commit together;
failure retains the prior COMPLETE snapshot and its actual cutoff. There is
no generic Operation ledger, scheduler, browser lease or workflow dependency.

Manual browser work has a stricter UI parity rule. The dashboard Agent OS
button and its individual domain-screen button call the same shared frontend
action. The trigger surface may differ, but extension command, account/date
defaults, empty-vs-login classification, persistence, generated artifacts, and
source-failure alerts do not. Both entrypoints use the same owner interface.

The dependency direction is:

```text
dashboard control ─┐                    ┌─> extension start -> resource turn -> source owner begin
                   ├─> shared control ──┤
domain control ────┘                    └─> source owner begin -> extension hand-off
extension run -> source owner publication

approved capability mutation -> CapabilityMutationDispatcher -> owner input port

ABC screen explicit refresh -> Products -> COMPLETE source evidence -> publication
```

Browser collection starts share one web control: a per-source adapter for
`src/hooks/use-collection-source-control.ts`, rendered by
`src/components/collection/CollectionStartControl.tsx`, with starts in
`src/lib/collection-start.ts`. Running state comes from the owner status read,
and every mounted copy shares start, stop and notices. Collections that hold a
browser resource (the five Coupang collection-window producers) start through
the extension's `startCollection` contract: the
extension takes the resource's turn and opens the owner attempt, or refuses
with the holder's name, and nothing is queued
([ADR-0011](adr/0011-window-sharing-collections-start-through-the-extension.md)).
Other browser sources open their attempt from the page through
`startWebOpenedCollection`, which stops an attempt the extension does not take.
The Wing catalog is Channels-owned operation kinds (list → details chained by
`result.next`, workbook) started through the extension's `operation.start` and
read through `GET /api/operations` (KID-354). The Wing daily facts are
Advertising-owned operation kinds `advertising.wing_traffic` and
`advertising.wing_itemwinner` (KID-362): the extension service worker reads Wing
with its cookies, and each holds `account:<id>` plus `resource:wing-daily:<id>`.
read through `GET /api/operations` (KID-354). Sabangnet mall listings
(`resource:sabangnet:login`), first-batch mall admin listings (`account:<id>`)
and Sellpia manual-match evidence (`resource:sellpia:login`) are Channels
operation kinds too, and the Rocket-Sellpia matching CSV upload is one
server-produced `channels.rocket_matching_csv` operation (KID-363).
Every start uses a fresh idempotency key; there are no correlated retry keys.
Stop ends the extension session first, then the owner's organization-scoped
operator cancel. Competitor catalogs, 1688 trend, TikTok CC and browser live
commerce still start from their own screen actions;
the shared control shows their running collection and stop. Trend collection
runs on the server through the same control and has no stop. One start collects
one source: Product Management starts Sellpia inventory and Sellpia product
profitability from two separate controls. Profit collection keeps the 401-day
interval through yesterday. Collection does not refresh ABC. Order and Rocket PO collectors preserve their targets,
pagination and field mapping. Excel conversion runs on the server and returns
transient downloads; converted files do not acquire a database lifecycle.

Coupang shipment-summary lookup is the operation kind
`orders.coupang_shipment_summary` (ADR-0025, organization lock). The extension
reads the supplier parcel list and stages date items plus one scan proof; the
Orders finalize validates the proof and writes the date facts inside the finish
transaction. The calendar keeps, per date, the latest succeeded operation's
value; untagged existing dates remain unverified. Shipment PDF/file collection
remains a separate existing action.

Business owners retain their own facts and source status. An Alert is a human
notification, not execution state. Owner attempts are fenced by an
`attemptToken` so stale extension reports cannot change a newer attempt.
The global notification view reads `/api/alerts` only, with ten-second
foreground polling, focus refetch, and dismissal invalidation. A kind moved to
the operation contract records its failure only on its operation row; the
alerts reader absorbs those failures (KID-355 policy B) and merges them with
the remaining `source_failure` rows of unmoved sources. It does not
merge run progress or replay an SSE stream. Source screens own their progress
and current-source reads.

Sourcing collection uses its source owners directly:

```text
screen / Agent -> Sourcing owner attempt + frozen plan
browser source -> extension operation.start -> runtime collector chunks -> owner finalize (ledger + publication); failure stays on the operation row
server source -> provider -> owner terminal + Alert
COMPLETE observations + latest attempt status -> source screen / Agent
```

Shadow uses this same Sourcing attempt ledger for paired Google/optional LinkFox
collection. It admits once per organization/KST day, including failure/expiry;
the original request key replays without provider IO. Successful full evaluation
payloads are immutable observations. Failure retains the previous COMPLETE
snapshot with stale status and actual cutoff. It has no Operation Worker or
mutable WorkspaceSnapshot claim. This does not change provider/evaluation rules.

The hard-cutover boundary has an executable guard at
`scripts/check-operation-automation-cutover.mjs`. It reads the checked-in
extension producer declarations and source-owner manifest, then reports
unowned producers, source-owner calls into Product ABC recalculation, and
explicit legacy Operation/Automation runtime or ActionTask references. The
guard is a regression contract for the staged removal plan; its presence does
not claim that the legacy runtime has already been removed.

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

`@kiditem/shared/errors` is the one error registry (ADR-0023): every code a
screen can see with its owner, kind, HTTP status and Korean sentence, the
response envelope, `KiditemError`, and `operatorErrorText`. The extension reads
the generated `extensions/kiditem-os/shared/operator-error.js`
(`npm run check:operator-error-sync`).

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
- HTTP and cross-domain owner references use their focused validated identity
  contracts. Source attempts expose the owner-issued `attemptId`; they do not
  mint a generic execution resource name.
- `copilotThreadId`, `aguiRunId`, provider IDs,
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
[Interaction OS design](docs/superpowers/specs/archive/2026-08-13-ai-chat-interactive-response-design.md#71-identifier-and-resource-name-system).
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
| `apps/server/src/advertising` | Owner Domain | Coupang ad operations, scrape ingest, authoritative exact-day profitability spend refresh/read evidence, daily facts, and strategy/action generation. Keyword and competitor collection are operation kinds (`advertising.wing_tracked_products`, `advertising.wing_rank`, `advertising.keyword_serp` → `advertising.competitor_seller_identity` → `advertising.competitor_catalog` chained by `result.next`; the last two share the lock `resource:competitor:serp-enrichment`, KID-362); readiness reads Wing rank coverage through `ADVERTISING_KEYWORD_RANK_READ_PORT`. |
| `apps/server/src/agent-os` | Platform | Agent/profile registry, transient Gateway control, conversation facade, stateless MCP, durable capability admission, and completed-event history composition. |
| `apps/server/src/agent-os/application/port/out/history` | Platform | Completed-event history Interface at the outgoing history seam. |
| `apps/server/src/agent-os/adapter/out/history/sqlite` | Platform | Outbound SQLite Adapter for the completed-event history Interface, with its Implementation and OSS characterization specs. |
| `apps/server/src/content` | Owner Domain | Image/text/detail-page/thumbnail AI providers, durable direct-job execution, content-workspace ownership/branching, and Agent OS output boundaries. |
| `apps/server/src/analytics` | Owner Read Model | Dashboard, statistics, traffic, and supplier-stats reporting. |
| `apps/server/src/alerts` | Owner Capability | Organization-scoped source-failure notifications. Unmoved source owners call its terminal-transaction API; for kinds moved to the operation contract the reader derives one alert per (kind, plan channel account/mall) from the newest failed operation through `common/operation/transaction/latest-operation-outcomes` and stores only operator dismissals (`operation_failure` rows). Consumers poll open/resolved alerts. Human notifications only, with transaction-scoped failure upsert/resolution and no execution or freshness state. The writer keeps a Korean producer sentence and otherwise derives the message from the terminal code (`operatorErrorText`); the title is the producer's Korean title or `<source> 실패`. |
| `apps/server/src/todo` | Owner Domain | Operator-written to-do list (`/api/todo`): who owes the work (operator or development), its area, and its status. Nothing derives it from other screens. |
| `apps/server/src/auth` | Platform Capability | Local password verification, durable hashed sessions, login/logout/me, guards, decorators, middleware, and auth operator CLI. |
| `apps/server/src/channels` | Owner Domain | Marketplace account, common selling products and options, persistent registration target settings ([ADR-0020](adr/0020-channels-owns-reusable-registration-targets.md)), account-scoped listing/registration capability, the registration execution fence (`ProductRegistrationExecution`: many immutable executions per persistent registration target, read through its public capability — [ADR-0014](adr/0014-channels-owns-the-registration-execution-fence.md)), one mall-neutral registration execution per target (`register` · `update` · `sold_out` · `resume` · `composition_change`) with channel adapters (`adapter/out/channel/<key>`) answering mall-specific identity, evidence and prepare-time facts, representative-image uploads as `thumbnail_update` executions on channels whose adapter supports them (Content supplies only the approved image), Wing/Rocket listing identity, typed exact-evidence extraction, option-to-MasterProduct recipes and matching, derived listing-product summaries, direct option-component diagnostics, sellable-capacity projections, and current browser login/form-fill results without a persisted observation log. |
| `apps/server/src/common` | Platform Support | Shared backend DTOs, filters, KST/date helpers, security, storage, and pricing helpers; `common/operation` is the sole writer of the operation contract (`operations`, `operation_chunks`, `operation_locks`: identity, token, lease, chunk staging, overlap locks and rejections) that owners join per kind through `plan`/`finalize` ([ADR-0025](adr/0025-operations-are-one-contract.md)). |
| `apps/server/src/core` | Platform Support | Pure transaction-client reads of shared source-import completion provenance; source owners retain publication and coverage authority. |
| `apps/server/src/feature-gate` | Platform Capability | Feature flag endpoint and config behavior. |
| `apps/server/src/finance` | Owner Domain | Live P&L, sales analysis, supplier payments, sales plans, settlements, and read-only profitability evidence consumed by Products' explicit ABC evaluation. |
| `apps/server/src/inventory` | Owner Domain | Warehouse and stock-transfer records plus read-only Rocket workbook progress; Products owns source collection/current stock, Orders owns return records. |
| `apps/server/src/orders` | Owner Domain | Orders, reviews (collected through the `orders.coupang_reviews` operation kind), Sellpia shipment tracking (the `orders.sellpia_shipment_tracking` operation kind) and first-batch mall orders (`orders.mall_orders`; other malls stay on the attempt path until the remaining malls move), both keeping captures in `OrderCollectionArtifact.operationId`, the today-orders capability shared with the dashboard, return-transfer operations, Coupang directship capture (the `orders.coupang_directship` operation kind) and its conversion, and durable Sellpia workbook submission idempotency/audit. |
| `apps/server/src/organizations` | Platform Capability | Organization listing surface. |
| `apps/server/src/prisma` | Platform Support | `PrismaModule` and `PrismaService` only. |
| `apps/server/src/products` | Owner Domain | Source-inventory `MasterProduct` identity/current stock/purchase price, Sellpia collection/publication, image metadata, reads/exports and explicit ABC evaluation; `/api/categories` compatibility CRUD. |
| `apps/server/src/readiness` | Platform Capability | Readiness checks and health-style operational surface. |
| `apps/server/src/sourcing` | Owner Domain | Chinese new-product discovery, allowlisted collection controls, append-only evidence ingestion, exact LaunchCandidate identity, immutable recommendation decisions, and candidate eligibility for Channels registration targets. Sourcing stops at the draft: the submission fence is owned by Channels and read back through its public capability ([ADR-0014](adr/0014-channels-owns-the-registration-execution-fence.md)). |
| `apps/server/src/supply` | Owner Domain | Supplier registry, immutable supplier-offer/price-tier snapshots, proposed procurement test intents, MasterProduct supplier policy, collected-inventory-fenced purchase submission attempts/reconciliation, and Rocket capacity preview after Sellpia publication. |
| `apps/server/src/test-helpers` | Test Support | Test-only Prisma and seed helpers. |
| `apps/server/src/types` | Platform Support | Ambient/server TypeScript types. |
| `apps/server/src/uploads` | Platform Capability | Upload endpoint and storage bridge. |

### Backend Implementation Map

Only `Hexagonal` and `Flat` are valid implementation structures. Support
folders are intentionally absent from this map.

| Path | Structure | Required / Optional Contract |
|---|---|---|
| `apps/server/src/advertising` | Hexagonal | port/adapter lanes complete; new ingest, daily-fact, and ad-action behavior uses `adapter/out/repository/` + `application/port/out/*` ports; ledger read helpers live in `adapter/out/persistence/read/` and pure mappers in `domain/`; architecture spec freezes invariants. |
| `apps/server/src/agent-os` | Hexagonal | Capability admission, transient Gateway control/conversation, MCP, repository, completed-event-history Interface at `application/port/out/history/`, outbound SQLite Adapter at `adapter/out/history/sqlite/`, and owner composition behind ports/adapters. The two cross-cutting contracts `application/port/out/capability-invocation.repository.port.ts` and `application/port/out/gateway-conversation.port.ts` are exact direct-port exceptions fixed by the approved KID-25 plan; every new outgoing port still requires an explicit lane directory. |
| `apps/server/src/content` | Hexagonal | provider, runtime handler, bridge, sink, media, fetch, and storage boundaries behind ports/adapters. |
| `apps/server/src/analytics` | Hexagonal | Dashboard, statistics, traffic, and supplier-stats code sits in a `<bundle>/` subfolder of each root lane (`adapter/in/http/<bundle>/`, `application/service/<bundle>/`, `__tests__/<bundle>/`, …) with `<bundle>.module.ts` at the root; dashboard adds outgoing repository ports and adapters so its application services stay Prisma-free, and its architecture + module wiring specs freeze those invariants. Documented legacy exception: statistics and supplier-stats services inject `PrismaService` and read the Orders `order-facts.reader` directly (`check:hexagonal` allowlist, KID-334). The `sellpia-sales/` and `sellpia-product-sales/` bundles keep their own layout. |
| `apps/server/src/auth` | Hexagonal | Auth service and repository port own password/session policy; Prisma and CLI/HTTP adapters own persistence and entrypoints. Guards and decorators remain infrastructure. |
| `apps/server/src/alerts` | Flat | controller/service/repository; source owners pass their transaction to the concrete failure upsert/resolution API. |
| `apps/server/src/channels` | Hexagonal | Account, sales-product, registration, listing and collection policies use `domain/<business>` and `application/service/<business>`, with NestJS providers permitted in both. Incoming adapters call input ports; modules bind services and outgoing adapters. Provider, documents, credentials and persistence IO stay outside the application. |
| `apps/server/src/feature-gate` | Flat | endpoint/config capability. |
| `apps/server/src/finance` | Hexagonal | Profit-loss, sales-analysis, report-export, sales-plan, settlement and supplier-payment folders under `adapter/in/web/` and `application/service/`; settlement facts stay in `adapter/out/persistence/read/`. |
| `apps/server/src/inventory` | Hexagonal | Retained warehouse, stock-transfer and return-record capabilities; source products, collection and current stock belong to Products. |
| `apps/server/src/orders` | Hexagonal | Controllers and DTOs under `adapter/in/web/`, services under `application/service/`, ledger read helpers in `adapter/out/persistence/read/`, pure mappers in `domain/`; Coupang shipments use a `shipments/` folder per layer and `coupang-directship/` stays at the root. Sellpia transmission fencing keeps its `application/port` + `adapter/out/repository` lanes. |
| `apps/server/src/organizations` | Flat | controller/service capability. |
| `apps/server/src/products` | Hexagonal | Source MasterProduct identity/current stock, Sellpia collection/publication, image metadata, exports and ABC; incoming ports, `application/service` orchestration, pure domain rules and outgoing adapters; the `/api/categories` compatibility capability sits in the `category/` folders. |
| `apps/server/src/readiness` | Flat | readiness controller/service. |
| `apps/server/src/sourcing` | Hexagonal | Discovery, source/evidence ledger, launch identity, decision policy, and sourcing agent/products boundaries behind ports/adapters; candidate/content provenance is provided to Channels-owned registration targets; Supply handoffs use only the exported incoming procurement port. The owner confirm report reaches Telegram only through `SOURCING_CONFIRM_MESSENGER_PORT` (long-polled answers, signed button values) and writes decisions through the existing final review selection. |
| `apps/server/src/supply` | Hexagonal | Supplier/offer/procurement persistence, create-only pre-purchase intents, idempotent external submission attempts, the narrow opaque Products-fence transaction adapter, and collect-before-calculation Rocket policy behind ports/adapters; architecture + module wiring specs freeze invariants. |
| `apps/server/src/uploads` | Flat | upload controller/service/storage bridge. |

### Backend Structure Contracts

Hexagonal owner capabilities use this shape:

```text
apps/server/src/{owner}/
  {owner}.module.ts
  adapter/in/web/         HTTP controllers and DTO binding; existing http lanes migrate with their owner
  adapter/out/{lane}/     DB/provider/runtime/storage/event adapters
  application/port/in/    incoming use-case ports, when other domains consume them
  application/port/out/   outgoing DB/cross-domain/provider/runtime contracts
  domain/capability/      owner-defined Agent capability contracts, when platform-visible
  application/usecase/   orchestration; existing application/service lanes follow owner guides
  domain/                 pure policy/model/service code
  mapper/                 row/DTO/domain/shared contract mapping
  read/                   transitional internal query helpers, when still needed
  transaction/            lock/fence functions for the caller's transaction (not a port lane)
```

Required: module file, orchestration in `application/usecase/` (or the owner's
existing `application/service/`), and a port/adapter boundary for
each DB, provider, runtime, storage, event, workflow, or cross-domain IO lane.
Optional: `adapter/in/web/` when no HTTP entrypoint exists, `application/port/in/`
when no other owner consumes the use case, `domain/` when no pure policy/model
exists yet, and `mapper/` when mapping is trivial.

Owner persistence adapters implement fact queries behind public capabilities
([ADR-0021](adr/0021-owner-capabilities-replace-dedicated-readers.md)). They
preserve organization scope, complete generations, coverage, and required
transaction evidence; one registered reader file per ledger is not required.
The access guard permits canonical owner persistence queries and restricts
writes to declared publication paths. Existing direct consumers are explicit
migration exceptions, not reusable patterns. The guard also resolves production
imports and rejects cross-owner implementation imports and inward
application/domain imports of output adapters. Existing edges are exact
`from`/`to` exceptions with a removal issue; deleted edges fail as stale.
`cross-owner-fk.json` declares every model owner explicitly, so schema file
moves cannot silently change a business boundary.

Existing `read/` helpers are internal pure transaction functions. The optional
`<owner>/transaction/` helpers preserve caller-owned locks and fences; they are
not the `application/port/out/transaction/` lane. Missing or conflicting facts
use `common/errors/fact-errors`, mapped by the global exception filter;
integrity failures remain plain errors.

Channels' migrated capabilities use `application/service/<business>` and
`application/port/in` for both reads and writes. Application services and domain
policies may use NestJS providers, injection, logging and lifecycle hooks;
persistence/provider IO remains in outgoing adapters. Ordinary policy functions
need no provider wrapper. Shared web/extension contracts remain framework-neutral.
Existing factory providers are supported NestJS DI, not a requirement to keep
services free of NestJS. The business
areas are account, sales-product, registration, listing, and collection. Only
implemented capabilities create directories; no parallel Marketplace business
layer exists. `ChannelCatalogModule` exports account, listing, composition and
catalog identity capabilities without starting external execution. AI's separate
content query module supplies workspace, thumbnail and provider-media facts by
scoped scalar listing IDs. Consumer adapters preserve the caller's transaction
through an issued opaque `OwnerTransaction`; persistence adapters alone unwrap it.

Cross-owner Channels references retain scalar IDs and indexes while consumers
move to owner input contracts through their own output adapters. Channels organization, user and source-attempt references are scalar logical
references too; same-owner FK and organization constraints remain. Other owners
still have explicitly inventoried migration exceptions. Removing a relation also
requires lifecycle, missing-reference, and concurrent-change coverage. Channels owns every ChannelAccount mutation, including the compatibility account
editor under Orders URLs. Orders owns Rocket PO collection (operation kind
`orders.coupang_rocket_po`), snapshots and lines and publishes observed listing identities through Channels' catalog
capability in the same transaction. Supply retains purchase judgment and
confirmation. The coordinated change follows
[the Channels redesign spec](https://linear.app/kiditem/issue/KID-286).

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
- `transaction/`: unit-of-work or row-lock transaction Interfaces. A plain
  function that runs inside the caller's transaction goes in the owner's
  `transaction/` folder instead.
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
| `apps/web/src/app/(analytics)` | Route Group | `dashboard`, `agents/[agent]` (agent home: AI cost) |
| `apps/web/src/app/(channels)` | Route Group | 몰별 상품등록·품절 송신(사이드바 '쇼핑몰 에이전트'). `/mall-home`(쇼핑몰 에이전트 홈 — 대시보드 3 : 쇼핑몰 알림판 1(몰별 상태 높이까지), 몰별 로그인 상태(누를 때 확장이 확인), 이번 달 AI 비용, 그 아래 에이전트 파이프라인과 단계별 일 · 미션), `/mall-channels`(연결된 몰 현황 허브 + 쇼핑몰 계정 설정 창 `?account=몰키|all`), `/mall-listings`(등록 현황 매트릭스 + 상품 N × 몰 M 새 등록), `/mall-availability`(일괄 품절·해제 dry-run), `/mall-tasks`(등록·품절 실행 기록). 몰 계정 편집 부품(설정 창 · 편집 훅)은 주문수집 자격증명을 편집하므로 `(orders)/mall-settings` 에 남고, 예전 주소 `/mall-settings` 는 `/mall-channels?account=all` 로 보낸다. |
| `apps/web/src/app/(catalog)` | Route Group | Canonical inventory-product operations center at `/product-hub`; direct channel-option inventory configuration on product detail; option-to-Sellpia matching with automatic MasterProduct derivation at `/product-hub/matching`; 판매상품 list, Sabangnet workbook import and the option-table editor at `/product-hub/sales-products` (사이드바 '쇼핑몰 에이전트 > 판매상품'). |
| `apps/web/src/app/(ops)` | Route Group | `/todo` — the TO DO LIST of what the operator owes and what development builds, grouped by area. |
| `apps/web/src/app/(finance)` | Route Group | Active `/profit-loss`, `/reports`, and `/sales-analysis` surfaces; settlement remains a tab inside sales analysis. |
| `apps/web/src/app/(inventory)` | Route Group | Active `/inventory-hub`, `/inventory`, `/stock-ops`, and `/coupang-shipments` surfaces; Warehouse reads remain reference data for `StockTransfers`, with no standalone warehouse-management route. |
| `apps/web/src/app/(orders)` | Route Group | Active `/order-collection`, `/orders`, `/rocket-orders`, and `/reviews` surfaces, plus the mall account editor that `/mall-channels` opens as a dialog (`/mall-settings` redirects there); order collection and processing own their route-local workspaces, while the Rocket capacity placeholder consumes the shared preview contract. |
| `apps/web/src/app/(sourcing-ai)` | Route Group | `sourcing-ai`, `sourcing-ai/category-sourcing`, `sourcing-ai/competitor-analysis`, `sourcing-ai/decision-center` (초기 진입 추천 표: 1688 신상품·키워드 트렌드·쿠팡 경쟁상품·쿠팡 급상승을 합쳐 상품을 직접 추천하고, 관심 키워드로 분류하며, 자사 데이터 RAG 어시스턴트를 곁들인다), `sourcing-ai/final-selection`, `sourcing-ai/keywords`, `sourcing-ai/market`, `sourcing-ai/recommendations`, `sourcing-ai/settings`, `sourcing-ai/validation`, `sourcing-ai/wholesale-search`, `sourcing-ai/wing-catalog` |
| `apps/web/src/app/(product-pipeline)` | Route Group | `detail-page-client-render` (fullscreen extension capture surface), `product-pipeline/collected-products`, `product-pipeline/collected-products/[id]`, `product-pipeline/collected-products/[id]/editor`, `product-pipeline/collected-products/[id]/templates`, `product-pipeline/detail-pages/[generationId]/editor`, `product-pipeline/detail-template-generation`, `product-pipeline/productgenerate`, `product-pipeline/registered-products`, `product-pipeline/registered-products/[workspaceId]`, `product-pipeline/thumbnail-ai`, `product-pipeline/thumbnail-generation`, `product-pipeline/thumbnail-generation/edit` |
| `apps/web/src/app/(supply)` | Route Group | `/purchase-orders` is the general purchasing surface only; Supply owns the Rocket preview and confirmation contracts consumed by `/rocket-orders`. |
| `apps/web/src/app/agent-org` | App Internal | Fullscreen dark `/agent-org` (Agent Org, linked from the workspace hub) in the former Agent OS frame: the pipeline canvas in the center with a floating agents list on the left (selecting an agent focuses its group), live activity (attention inbox + feed) on the right, and a bottom summary of agent health, monthly sales/profit/ROAS/CTR (same dashboard sales/ad queries), and open alerts. The canvas draws the sourcing-to-CS pipeline as one top-down architecture diagram whose stages are framed and colored by the owning agent (analysis, sourcing, owner confirm, product, mall, order, inventory, CS, and marketing with planned ads, reels, and blog stages), with external-service brand marks (`lib/brand-marks.ts`, Simple Icons paths), the marketplace box on the center axis, routed connectors, Sellpia/Telegram system boxes, oversight and memory panels, and canvas zoom and pan; coordinates in `lib/pipe-diagram-layout.ts` plus a root-cause attention inbox and a live feed. Reads the shared alert query (`/api/alerts`, polled every ten seconds), current source and registration state, Sellpia freshness, dashboard sales/ad summaries, and the sourcing confirm-report status; `lib/pipe-stages.ts` maps them to stages and a stage with no source says why instead of showing a number. Its only write is the person-pressed "지금 보고 보내기" Telegram confirm report. |
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
  owns `/product-pipeline/collected-products`, the inbox of `SalesProduct`
  drafts (collected ones point at an immutable `SourceRecord`, directly
  authored ones have none — KID-313), draft detail route entries, draft-scoped
  generated content links, and the fixed WING category
  registry used at registration confirmation. WING category selection uses the
  saved `RegistrationTarget.registrationInput.adapter.coupang.wingCategoryKey` or an exact
  source-category alias; it does not read registered `ChannelListing` rows or
  call a runtime category-suggestion API. Its mall bulk-sheet action creates
  sales products through the Products API and opens the shared
  `src/components/mall-sheet/` dialog.
- `apps/web/src/app/(product-pipeline)/product-pipeline/registered-products`
  owns `/product-pipeline/registered-products`, the marketplace registered
  product management surface backed by active `ChannelListing` rows with
  `ChannelAccount` and immutable source-candidate provenance. Generated content
  history lives in the sales-product draft's `ContentWorkspace`, which
  registration points at the listing; draft workspaces are reached from
  collected product detail instead of this list.
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
  owns listing thumbnail evaluation (the image a mall shows, scored with an
  operator-chosen model) and the AI edit job list where candidates are adopted.
- `apps/web/src/app/(product-pipeline)/product-pipeline/thumbnail-generation`
  owns the standalone thumbnail generation hub and edit flow. It is opened from
  product workspaces or direct URLs, not from the sidebar.

### Frontend Shared Map

| Path | Kind | Notes |
|---|---|---|
| `apps/web/src/__tests__` | Test Support | App-shell and proxy tests. |
| `apps/web/src/app/(product-pipeline)/product-pipeline/_shared` | Route-Group Shared | Product pipeline route constructors, shared detail-page editor/render helpers, product workspace screen/tabs/history/preview, inbox shells, hooks, and thumbnail UI shared by sibling product-pipeline routes. |
| `apps/web/src/components` | App-Wide Shared | Layout, panel, product, provider, chat, Coupang, and UI components. |
| `apps/web/src/hooks` | App-Wide Shared | Shared hooks used across routes, including `use-agent-org` / `use-confirm-report` for Agent Org and dashboard operational status. |
| `apps/web/src/lib` | App-Wide Shared | API client, query keys, opaque local-session state, extension auth sync, and formatting helpers. `agent-org/` owns the shared operational snapshot, stage/status mapping and confirmation API used by Agent Org and Dashboard; canvas coordinates and brand marks remain in the Agent Org route. `order-mall-account-api.ts` is the shared read client used by order collection and Agent status consumers. |
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
  CLAUDE.md       required for high-risk or complex route contracts
```

Required: `page.tsx`. Optional: route-local `components/`, `hooks/`, `lib/`, and
`__tests__/` when the route needs them. Add route-local `CLAUDE.md` for complex
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
`notifications | ai_chat | null` state renders `AlertsPopover` or
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
re-edit are server-driven operations (ADR-0025, KID-358): kinds
`content.thumbnail_generate`, `content.thumbnail_reedit`,
`content.detail_page_generate` and `content.image_edit`, each registered by a
Content owner port. These fixed workflows do not create Agent OS runs.

```text
request
  -> transaction: domain ledger + input provenance + prepared operation
     (lock resource:<job-type>:<source id>, three attempts)
  -> wake the worker after commit
  -> claim with FOR UPDATE SKIP LOCKED + kind lease (AI_DIRECT_JOB_LEASE_MS)
  -> provider and media execution with AbortSignal
  -> validated output staged as the operation's `result` chunk
     (progress.checkpoint = result_saved)
  -> finish(succeeded): owner finalize projects it through the domain sink
     inside the finish transaction, so the ledger row and the operation
     close together
  -> succeeded
```

A failure finishes with `retryAfterMs` (5s, 30s, 120s) while attempts remain,
which returns the same operation to `prepared` with its lock held; the last
failure, or one that is not retryable, closes it `failed` and the owner's
`onFailed` records the failure on the domain ledger. An expired lease is
reclaimed by the next claim; a saved result is reused without calling the model
again. Cancelling a generation locks its live operation before the ledger row (the
order finish uses) and cancels both in one transaction, and the lease heartbeat aborts in-flight provider and
image-download work. Gemini adapters receive the model captured at enqueue time
and never select an environment fallback during execution. The retired
`ai_direct_jobs` table is no longer read or written and is dropped separately.

## Detail-Page Client Rasterization

A channel adapter whose mall form takes the detail page as one image (today
the Coupang form adapter) requires one finalized 780px JPEG derived from the
sales product's current immutable `DetailPageRevision`. Rasterization is a
Content capability, not a mall lifecycle; it is intentionally not an
AI generation operation and never launches Chromium on the server.

```text
registration preparation
  -> server selects current DetailPageRevision
  -> reuse DetailPageImageArtifact, or issue DetailPageImageRenderIntent
  -> verified company extension claims the intent
  -> dedicated fullscreen web route renders scriptless HTML at 720 CSS px
  -> extension uses one CDP Page.captureScreenshot at 780 output px
  -> extension PUTs JPEG directly to the server-derived presigned object key
  -> server bounded-reads and verifies metadata, JPEG dimensions, bytes, SHA-256
  -> server finalizes DetailPageImageArtifact
  -> the form adapter receives exactly that one public object-storage URL
```

The browser never chooses organization, revision, variant, output width,
object key, or storage origin. IndexedDB is a bounded retry cache only; it is
not artifact authority. Capture failure does not fall back to server
Puppeteer, image splitting/stitching, a blob URL, or unrelated candidate
images. `DetailPageRevision` remains the source of truth even though the
server raster executor was removed.

## Sourcing Intelligence Evidence And Test-Intent Boundary

Sourcing intelligence is a truth-data and decision-audit capability, not an
LLM-generated ordering shortcut. Sourcing owns source permission, evidence,
candidate identity, and recommendation policy. Editing a collected item happens
on its Channels sales-product draft, not on the candidate. Supply owns observed supplier
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

## Account-Scoped Registration And Content Ownership (`0.1.8`–`0.1.26`)

Channels owns `SalesProduct` (the single editable draft of one item, including
options), reusable `RegistrationTarget` settings and their selected options.
A collected or authored item becomes a `draft` sales product immediately, and
every preparation step edits that draft; the sourcing candidate stays an
immutable source record whose id the draft carries. A product has at most one
active target per channel account, and a promotional listing is a separate sales
product sharing the same source stock. A target references a priced selling
product and active account. Archiving sets `archivedAt`; successful submission
leaves the target reusable ([ADR-0022](adr/0022-sales-product-draft-exists-from-collection.md)).

`ProductRegistrationExecution` freezes each intent's payload, hash, approval,
actor, account, idempotency key, lease and provider outcome. Changing a target
cannot change an existing execution. Only one unresolved execution may hold a
target or actual listing's active fence. Sourcing provides candidate eligibility
through its public contract; Content(AI) — the `content` directory — owns content
workspaces and assets, and one workspace belongs to one sales-product draft or
channel-listing branch.
Neither owner writes Channels targets or executions, and registration never
creates a source `MasterProduct`.

```text
optional SourceRecord provenance (immutable; deleted with its draft)
  -> Channels SalesProduct + options
  -> reusable RegistrationTarget + selected options
  -> frozen ProductRegistrationExecution + approval evidence
  -> executing/uncertain persisted before provider IO
  -> confirmed provider evidence
  -> Channels transaction publishes actual Listing/options/composition
```

Actual listings collected from a mall need no fabricated selling product or
registration target. Listing-only availability operations use the same execution
ledger. Registered views preserve these listings even without a Content(AI)
workspace.
Unregistered candidate views exclude provenance already represented by an active
listing, including provenance through the linked selling product.

A mall form fill or a generated bulk workbook is not a submission: no channel
account has received anything yet, so those paths return their current result
without storing an observation or opening an execution. A path that starts
submitting to an account enters the fence first.

The unpromoted `022_registration_target_cutover` was removed with KID-313; Office's
registration rows are discarded under ADR-0010. Listing deletion has no
ledger: `ChannelListingDeletionOperation` and its routes were removed with
KID-317, and a mall delete arrives only as a registration execution kind once a
mall adapter can delete (KID-321).

Sourcing keeps only the immutable source record, read at
`GET /api/sourcing/source-records/:id`. Collection (`POST /api/sourcing/scrape-url`,
the extension product-data attempts) and direct creation
(`POST /api/sourcing/product-generation`) admit the draft into Channels in the
same transaction; a repeated source is refused with 409 and names the existing
draft. The draft is a `SalesProduct` with `status = draft`, edited and deleted
through `/api/products/sales-products/:salesProductId` (`GET`, `PATCH`,
`PUT …/options`, `DELETE`); only a draft is deleted, and a selling product is
archived. Registration settings per channel account live under
`/api/channels/registration-targets`, one unarchived target per organization,
sales product, and account. The fence lifecycle — state, prepare, match
preview, start, status, unresolved, not-submitted, confirm — is Channels' own
route family, `/api/products/sales-products/:salesProductId/registration/*`
beside `/api/channels/registration-targets/:id/executions` and
`/api/channels/registration-executions/:id`, and the product-pipeline
registration screens and the mall wizard reach it through the one web client
`(channels)/_shared/registration-execution-api.ts`.

Historical sourcing migrations populated compatibility rows for older candidate
and content models. This reconstruction intentionally adds no registration or
deletion ledger backfill because the authoritative Office dataset has no legacy
marketplace operation history to preserve.

`ContentWorkspace.ownerType` is `sales_product`, `channel_listing`, or
`direct_detail_page`. A sales-product draft owns exactly one active workspace,
and registration records the listing on that same row instead of cloning
artifacts, revisions or generation jobs into a second workspace.
The representative image is `ContentWorkspace.currentThumbnailAssetId`, one
content asset of that workspace (an upload or an AI candidate); adoption checks
ownership. Asset deletion and GC must reject the current representative image
and images used by a current detail revision.

## Sellpia Current Inventory And Collection

Products owns the Sellpia inventory operation kind `products.sellpia_inventory`
(ADR-0025; lock key `resource:sellpia:login`, shared by every Sellpia-login
kind), the fixed source binding, the verified generation and
`lastCompletedOperationId`, and atomic publication of current stock inside the
operation's finish transaction. Its implementation
separates `domain/`, `application/usecase/`, `application/port/in|out/`,
`adapter/in/web/`, and `adapter/out/persistence/`; `products.module.ts` and its source runtime modules binds
contracts to implementations. Consumers use published Products contracts.
Products retains its canonical facts and lock authority behind those contracts;
a dedicated reader implementation is no longer an architectural requirement.
MasterProduct has fourteen scalar fields; source identity is stored directly as
organization/account/product-code/option-code, without a second source table or
per-product collection pointer. Operator metadata is images only. Unknown
purchase price remains null and is counted separately from priced asset totals.
See [ADR-0017](adr/0017-products-owns-source-products-channels-owns-recipes.md).

Successful full collection updates existing product codes with stable MasterProduct UUIDs and KID codes,
adds new codes, and sets missing codes to `currentStock = 0` while retaining rows
and product links. A verified empty complete collection sets all quantities to
zero. Incomplete, failed or cancelled operations preserve the previous rows.
Publication and the terminal state commit together; a late or repeated finish
cannot publish a second result. Failures stay on the operation row, and the
alerts reader shows the newest failure per source until a later success
resolves it. Cancellation is not a failure alert.

All organization-scoped current DB rows are available for listing, detail,
search, totals, Excel and barcode operations, regardless of per-row snapshot
membership. There is no duplicate `availableStock`, inventory active filter,
age-based stock gate, 30% loss rejection or channel-reference quality warning.
Basic shape, complete-source, organization and attempt checks remain mandatory.

Collection control reports the running operation and terminal outcome from
`GET /api/operations` and the last successful publication from the Products
collection-status read. Lease expiry protects abandoned browser execution, not
the age of usable stock. Extensions capture and transport facts; only Products publishes
physical quantities. Manual recovery upload and transfer-state PATCH are retired.

Before a purchase submission or Rocket calculation, the browser shared source
control starts or joins the Sellpia inventory operation and waits for that exact
operation to succeed. The calculation request names it (`inventoryOperationId`). Products
verifies the current completed generation; failed/cancelled collection cannot
fall back to old stock. Supply preserves recipe ratios, bottleneck allocation,
provider idempotency and explicit reconciliation. Ordinary inventory reads need
no new collection. Orders transmission to Sellpia does not write local stock.

Coupang shipment summary, files and the shipment-summary operation owner belong to Orders'
`shipments/` lanes (`orders/shipments.module.ts` plus a `shipments/` folder in each layer);
existing routes and PDF download/merge behavior remain available. Existing Rocket
workbook audit and Orders reconciliation are retained because they have active
internal callers; they do not reserve or change physical inventory.

Channels persists account-scoped Wing and Rocket identity. Catalog publication
upserts observed listings and options while preserving direct option-component
rows. It never creates a channel-origin MasterProduct. After recipe changes the
listing summary is derived: all options must be configured and resolve to one
canonical MasterProduct, otherwise `ChannelListing.masterProductId` is null.

The matching center owns direct option-component review. Its deterministic
command may fill only an empty option component list when organization-fenced
evidence uniquely selects one Sellpia SKU and a verified positive pack
quantity. Manual replacement is a complete,
expected-current-component-fenced write. Existing components, duplicate or
conflicting evidence, uncertain pack/BOM evidence, raw aliases, and AI remain
untouched until operator review. Products remains the sole physical-stock
writer.

Confirmed direct option components remain the capacity truth.
Actual `ChannelListingOption.safetyStock` is the stockout threshold (default 0).
The legacy `SalesProductOption.safetyStock` field is still accepted by selling
catalog import/edit paths but is ignored by operational stockout. Its nonzero
value report and removal of those old consumers are tracked by KID-309; do not
copy a common threshold to all observed mall options.

Capacity is `min(floor(currentStock / quantity))`. Channels and Products read
Products' organization-scoped current quantities. A missing or deleted SKU
remains absent (`currentStock: null`) and requires connection review; a retained
SKU with quantity zero is an observed zero. Consumers must not turn missing
identities into zero stock or silently restore an old ID by matching its code.

Rocket preview uses the same canonical physical availability batch. A complete
extension collection also carries allowlisted official-workbook fields. Supply
reruns the preview under an organization lock, fences the Products source generation
and completed source artifact, verifies that channel option and direct
component identities have not changed, and persists explicit line decisions
plus immutable component allocations. Those audit rows do not reserve capacity
or change physical availability. Idempotent replay returns the existing record;
input drift conflicts.

Confirmation creates the official workbook in the browser after the server
commit. It never submits to a marketplace provider or writes
`MasterProduct.currentStock`.

Coupang PA collection belongs to Orders. The selected Rocket account and
transport are validated, and `SourceImportRun`, `Order`, and `OrderLineItem`
are persisted with deterministic identities. In the same Prisma transaction,
Orders calls Supply's reconciliation port; Supply resolves exactly one active
confirmation line by account/PO/product without mutating Products current stock
or physical stock. A barcode mismatch, ambiguous confirmation, or persistence
failure rolls back the entire import and no Sellpia workbook is returned.
Replays are idempotent. A later completed Sellpia snapshot remains the only
source of any physical stock decrease.

Analytics owns direct Sellpia SKU sales facts and depletion policy, but reads
Products' canonical physical availability. Exact product code, exact option
code, and a unique normalized barcode are deterministic resolution signals; missing
or ambiguous candidates remain `mapping_required`, never synthetic
zero stock. Products reuses this projection for operating-product summary
badges while `/stock-ops?tab=product-outflow` preserves every linked product/
variant destination. Analytics persists raw Sellpia product-profit coverage
through the operation kind `analytics.sellpia_product_profitability` (one
immutable monthly fact set per succeeded operation, KID-361);
Finance assembles source-freshness and time-decayed contribution-profit
evidence; Products owns the absolute ABC formula, explicit evaluation,
publication and actual grade-transition history. Fixed anchors and thresholds
are versioned; other products' performance never affects a grade. Collection
and evaluation are independent: the ABC screen explicitly reads coherent
COMPLETE source evidence and publishes grade/evaluation/history atomically with
source, formula and publication fencing. Orders is not an ABC dependency.
Monthly evaluation remains in use until aligned product-level daily revenue,
order-time cost and advertising evidence can support a separately versioned
daily formula. No missing data is allocated or treated as zero. Product Hub,
product-outflow,
Dashboard, and Advertising consume the stored grade/evaluation snapshot;
missing evidence remains unclassified instead of C and stale source states
preserve the last published grade. Organization-locked publication fences stale
concurrent calculations. Listing thumbnail evaluation grades (Content, one row per listing image URL)
remain an independent signal. Product-outflow may display matched
active Coupang catalog media through AI's read-only media capability without
copying image URLs into source products.

Product Hub renders visit/view/cart/order/sales/revenue/ad-rate from existing
listing daily facts independently of ABC. Missing fields remain null instead
of becoming zero. One organization-wide conservative data-basis date appears
in the header; one status modal owns source-specific freshness, composite
progress/failure, and aggregate order/mapping recovery counts.

The frontend preserves the active route ownership and compositions recorded in
the Frontend Route Map and nearest route guides. The shared source control
supplies Sellpia collection state, while active pages may expose compact status and
sync controls without rearranging their documented layouts. Product list,
detail, and matching keep their exact ownership; Inventory owns the complete
read-only Sellpia SKU table. The
Supply-owned Rocket preview and confirmation workspace is wired only into the
existing decision placeholder on `/rocket-orders`; `/purchase-orders` remains
the general supplier purchase-order screen. Intentionally retired URLs remain
absent from sidebar navigation and the App Router unless product names a
canonical replacement. Marketplace provider submission remains disabled.

Exact operation and recovery steps live in the
[collection runbook](runbooks/sellpia-inventory-freshness.md),
[channel matching runbook](runbooks/channel-sellpia-matching.md), and
[Rocket confirmation boundary](runbooks/sellpia-rocket-inventory-sync.md).
Source/evidence onboarding through the non-ordering procurement handoff lives
in the [Sourcing Intelligence Phase 0–1 runbook](runbooks/sourcing-intelligence-phase0.md).

## Data And Tenant Rules

- Prisma schema source of truth lives under `prisma/models/`.
- Prisma schema is the only DB schema source of truth. After schema edits,
  `prisma db push` and a post-schema `data:migrate -- up` bring a database
  current. A database object Prisma cannot declare needs the owner that
  [prisma/CLAUDE.md](../prisma/CLAUDE.md#indexes-and-database-objects)
  requires. The only one is `source_import_runs_status_check`. Its owner is the
  `ensure:source_import_run_status_check` step, which re-applies it on every
  post-schema run ([ensure steps](../scripts/data-migrations/README.md#ensure-steps)).
- NestJS uses the owner DB role and must pass `organizationId` explicitly from
  `@CurrentOrganization()` into tenant-owned reads and writes.
- Chatbot/agent processes do not receive DB URLs. Business data reaches agents
  through backend application services/ports after organization scoping.
- Native PostgreSQL enums are not used; use `String` plus app-level validation.
- Unsafe raw SQL APIs are banned. Use Prisma tagged templates and tenant
  predicates for tenant-owned tables.

## Agent OS

Agent OS is the single-node backend execution boundary under
`apps/server/src/agent-os/`; its schema ownership is in `prisma/CLAUDE.md`.
Its only persistence model is `CapabilityInvocation`, which stores exact
request-driven mutation admission, approval fields, and the idempotent
result/error. Agent definitions and capability manifests are code-owned.
Provider-native conversation/session continuity is host-local, completed UI
event history is API-local SQLite. Deterministic source work uses its domain
owner attempt; fixed AI generation runs as `content.*` operations.

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
private Streamable HTTP. Source owners do not receive a CLI login profile.
A restart ends the
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
