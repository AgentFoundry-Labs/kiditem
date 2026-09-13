# Extension Collection Deepening

**Status:** ACTIVE

**Parent:** `docs/superpowers/specs/2026-09-03-operation-automation-hard-cutover-design.md`

## Approved Scope

The September 8 user instruction expands the previous Wing-search pilot to
all extension data collection and directly connected owner contracts and
acceptance screens. Compare current code with the existing deep-module
direction, settle the responsibility layout, implement meaningful changes,
and verify collector by collector. Read-only investigation is not completion.
Unrelated domain cleanup, commerce actions, new generic execution runtimes,
commit, push, merge, deployment, and QA-data reset are excluded.

The primary responsibility is extension source collection. Advertising,
Analytics, Channels, Inventory, Orders and Sourcing owner interfaces and their
screens are in scope only where required to preserve or verify that contract.

## Approved September 9 Wing catalog and product-screen amendment

The user explicitly approved the side investigation's implementation proposal,
including staged catalog publication and product-management screen verification.
This replaces the earlier requirement that every basic catalog field must wait
for all detail requests. The user's later September 9 minimum-principles update
also replaces whole-detail atomic publication with complete-product enrichment.
Channels remains the source owner; AI remains the media writer. No new generic
runner, operating-data reset, deployment or commerce mutation is authorized.

**Collection and stage completion.** Reuse the catalog owner's existing attempt,
chunk, identity fence and publication ports for two named source stages:
complete listing basics and full detail traversal. Each stage has its own
server-authoritative attempt and completion evidence. Basics publishes only
after its whole listing manifest is complete. Details enriches each completely
captured product, with chunk receipt and product/media writes in the same owner
transaction; retries of accepted chunks are no-ops. A later failure retains
these successful enrichments and every failed/unobserved product's old detail.
A running or failed detail attempt is never represented as full catalog COMPLETE.
The detail plan references the completed basics manifest and traverses every
product, not only changed products. Reuse immutable accepted detail receipts
only while their exact same attempt, manifest and provider identity remain valid.
Newly completed basics do not certify detail freshness. A later basics
publication fences an older detail publication from overwriting newer fields.

The verified read-only listing request uses ALL filters,
`displayDeletedProduct=false` and 500 products per page. Require full page/count,
unique product/option identity and provider-account reconciliation before basic
publication. The observed September 9 baseline is 500+500+254 = 1,254 unique
products and 2,271 `vendorInventoryItems`, not an `items` array. Preserve list
product status independently from detail approval status. Preserve nullable
stock and nullable vendorItemId; use the validated inventory-item/detail-item
identity relation without labelling a fallback identity as a real vendorItemId.
Observed zero remains zero. Unknown/null source values remain exact in source
evidence, but null or empty values clear canonical fields only when their source
meaning is verified. In particular, the unverified Wing stock-null meaning does
not authorize clearing an existing stock value. Provider stock never replaces
Sellpia available stock or option-recipe inventory calculations.

The detail transport changes to the verified seller-product JSON request.
Use serial or narrowly bounded requests with an explicit inter-request interval.
HTTP 429 stops provider IO, records recoverable attention and a not-before time,
honors a valid Retry-After, and retains same-attempt progress. Explicit resume
must observe that not-before time and all normal owner expiry/freshness fences;
do not retry around the limit, hide it, or publish incomplete product detail. Do not raise
transaction/test timeouts or weaken completeness checks to pass acceptance.
Represent this bounded rate-limit pause as RUNNING with recoverable attention
and `notBefore`, not a terminal FAILED attempt that is later reopened. Reject
chunk/finalize while paused. Only explicit resume clears that attention after
the owner rechecks not-before, expiry and the pinned basic publication. All
ordinary failures, cancellation and expiration remain terminal.

**Preservation and payload.** Basic publication updates only observed provider
basic fields/options and its representative-image URL. It preserves existing
detail attributes, model data, contents, notices, search tags, detail/option
media, confirmed recipes and user-owned metadata/images. Absence of a basic
field is not permission to blank a richer detail field. Operator MasterProduct
images and metadata retain priority. Neither publication writes physical stock,
period performance, advertising facts, profit or ABC. Scope deactivation to the
complete stage manifest and its provider-owned identities; do not remove BOMs.

Detail publication must retain exact provider contents, notices, search tags,
attributes and option-image associations. Deduplicate shared content/media by
value while retaining every option-to-content/media relationship. The observed
73-option product has 74 unique detail URLs but loses 71 option associations
under the existing 100-entry flattened cap. This is an association-loss defect,
not evidence of thousands of distinct missing images. Use a bounded normalized
document/association representation and deterministic byte-sized receipts;
do not truncate or place an entire 1.38 MB provider object in the 64 KiB raw
diagnostics field. Any still-unrepresentable input fails explicitly with no
destructive publication. Store image URLs, without bulk downloading files.

The user approved the September 9 media-bound correction after a 73-option
product failed the product-wide 100-entry check. Apply the existing 100-media
bound separately to each option owner, and separately to media with no option
owner; do not apply that bound to the union of distinct owners' media. A shared
media association counts for each referenced option, retaining URL/role and
every association. Keep the 512 KiB normalized-product and 1 MiB chunk byte
bounds, document bounds and fail-closed validation; do not truncate payloads.

Provider media passes through the existing AI catalog publication port. Basic
publication replaces only its basic representative-media scope, not detail or
operator media. Each successfully captured detail product atomically replaces
its own verified provider-detail scope; failed or missing products are untouched.
Image read fallbacks in Products, matching and registered products use
the published assets and preserve operator image priority. Provider HTML is
untrusted: retain the original as source evidence, render only escaped/sanitized
content, and never execute provider scripts or treat HTML as app instructions.

For thumbnail provenance, the existing AI-owned generation-group metadata may
record the exact automatic selection ID created by catalog publication. Under
the workspace lock, replace or clear only a pointer matching that marker;
markerless legacy pointers and subsequent operator selections are preserved.
An absent source asset still selected by the operator may become source-inactive
but retains its asset row, URL and storage for the explicit selection. Ordinary
provider fallbacks exclude source-inactive assets. This is internal provenance
in existing metadata, not a new table, worker or selection authority.

**Screens and acceptance.** Show basic and full-detail completion/failure,
counts, basis and resume state separately in existing collection screens.
Verify product management, matching, registered listing and selected detail
views for names, prices, category/status, images and retained source detail.
The current first non-null option price remains a representative price, not an
invented minimum or final purchase price. Traffic, Sellpia stock, advertising,
profitability and ABC retain their separate source owner and missing-value rules.

Required regression evidence covers complete/basic publication with failed
details, successful per-product detail replacement followed by failure,
accepted-chunk idempotency, old-value preservation, older-detail
fencing, null/zero and null-vendor identities, 500-page boundaries, exact shared
content reconstruction, all 73 option associations, deterministic byte bounds,
rate-limit stop/resume and operator-image/BOM preservation. Main reviews the
integrated contract and tests before new actual collection. Actual acceptance
must include full listing and full detail JSON -> owner -> publication -> all
three existing screens, with exact counts and sampled field comparisons.
Investigate the 539 Wing badge / 535 list-status / 525 existing KidItem
selling-count discrepancy by comparable filters and IDs; do not force equality.
Existing 440/1,254 HTTP 429 failure and sampled JSON success remain historical
evidence, not proof that the new full path has passed.

**Minimum-principles scope guard.** Block concurrent runs of the same account
and source kind and point to the existing attempt; add no queue or overlap
calculator. Update existing source identities and fence late results. Preserve
operator edits, selected images, confirmed matching and inventory recipes;
do not introduce dual storage for every field. Failed requests, parsing or
missing fields preserve existing values. Deactivate only after the complete
same-account/scope listing is known, never delete links, recipes or history.
Confirmed matching changes remain in the existing manual rematching flow;
add no conflict screen, change-history feature or reason-entry requirement.
Use resume only where needed, such as costly Wing details, and do not impose
Wing's stages or per-field freshness tracking on every collector. Verification
is duplicate prevention, old-value preservation, freshness fencing and honest
partial/failure display through tests and the existing screens.

## Approved September 9 web-app lifetime policy

This amendment applies across extension collectors, not only Wing catalog.
"Dashboard" means any KidItem web-app route in the verified local or Office
environment. Collection and durable local progress continue while at least one
such tab exists, including hidden, frozen, minimized or unresponsive tabs.
Best-effort UI hint delivery must not gate execution, state persistence or
owner acknowledgement. Returning to the web app rereads current state.

Closing the last web-app tab or window stops that environment's extension-owned
collection loops and follow-up requests through the existing producer-specific
cancellation/terminal paths. Closing one of several tabs does not stop work;
reload and internal route changes are not close events. Local and Office remain
isolated. Close only collector-owned resources, not user tabs or unrelated
server work, and preserve every already-saved canonical row.

Last-tab closure requires no checkpoint, safe-pause or continuation design.
Reopening the app does not restart collection automatically: the user starts a
new attempt explicitly. Existing terminal reconciliation must prevent stale
RUNNING state or locks from blocking that start. This closure policy does not
remove the separately approved Wing rate-limit pause or explicit same-attempt
resume while the web app remains open.

Reuse the environment adapter, domain registry, collection sessions and named
owner cancellation handlers. Do not introduce a generic execution framework.
The local stop fence must take effect before awaiting a delayed or unavailable
owner cancellation response. Retain only the existing attempt correlation and
local cancellation intent needed for terminal reconciliation; do not represent
an unacknowledged owner as terminal. A stopped attempt cannot acquire another
managed tab, continue provider IO or be automatically recovered. Its source
owner remains responsible for releasing the canonical attempt lock.
Verify tab switching/minimization/unresponsive hints, one-of-many closure,
last-tab and last-window closure, reload/internal navigation, explicit fresh
start after reopening, environment isolation and saved-data preservation.
Separate regression evidence from actual-browser evidence and unverified cases;
manually activating or closing a hung tab is not an accepted fix.

## Approved September 10 collection UI consolidation

The existing `상품 받기` entrypoint owns one user-visible Coupang catalog
refresh. Remove the added stage-specific collection UI after absorbing account
selection, required login actions, warnings, cancellation, progress and results
into that existing flow. Do not expose basics/details as separate screens or
execution buttons. Registered products and dashboard consume the same active
refresh and cannot start duplicate work by mounting, returning or double-clicking.

Keep the existing basics and details source-owner contracts and verified JSON
capture paths. The existing catalog importer connects a completed basics attempt
to a details attempt internally; a React effect does not launch the next stage.
Basics publication remains a valid saved partial result, never overall completion.
Overall success requires the linked details owner's COMPLETE receipt. Missing
details, login expiry and partial failure retain saved data and stay explicit.

The bounded implementation seam is the existing importer's environment-bound
state and owner admission APIs: retain non-secret root/current attempt linkage
and a preallocated details idempotency key, require the exact completed basics
basis when admitting details, and expose safe whole-flow progress through the
existing browser status bridge. Owner rows and receipts remain canonical; add no
generic runner, queue, execution table or parallel canonical status store.

The last-web-app-close fence spans the basics-to-details handoff. Reopening may
reconcile a previously issued cancellation but never launch the pending child.
A delayed child-admission ACK must be cancelled rather than captured; retries
reuse its original idempotency key. Keep tokens out of persisted linkage.
Explicit Wing rate-limit resume while the app remains open retains its existing
contract. A closed-and-reopened flow instead requires an explicit new attempt.

Reduce dashboard collection panels and modal friction without hiding required
actions or warnings. Group ads by business purpose and retain required/optional
distinctions; do not force every advertising collector into one sweep. Put
sentence-length calculation/collection explanations behind an information button
and move attempt/publication internals to diagnostics. Collection absence must
not block dashboard reading, and readiness counts must match the displayed scope.

Acceptance covers one-start basics-to-details success, shared entrypoint state,
duplicate clicks, mount/re-entry without start, login expiry, partial failure,
cancel during admission/ACK loss, last-close/reopen, preserved canonical data,
and actual screen review after removal of the duplicate UI.

## Current Collection Inventory

Paths below are relative to `extensions/kiditem-os/`. Aliases and manual
entrypoints are included; a producer label alone is not a complete inventory.

| Source family / entrypoints | Capture responsibility today | Owner / consumer | Disposition |
|---|---|---|---|
| Ads keyword: `collectAdvertisingKeywords` | `content/coupang/ads-report.js`: campaign/group JSON, keyword `tableMetric`, frozen group budget | `background/coupang/ad-keyword-source-owner.js`; Advertising keyword screens | Keep verified request and owner; remove source knowledge from shared window |
| Ads campaign/product sweep and manual popup: `collectAdvertisingCampaigns`, `collectAdvertisingCampaignsFromPopup` | `ads-report.js`: campaign DOM metadata, date picker, product tables, pagination; `collection-window.js`: sweep resume | `ad-campaign-source-owner.js`; Advertising campaign/product screens | Deepen capture; replace only verified campaign/product metric paths |
| Ads account daily: `collectAdvertisingAccountDailyKpis` | `ads-report.js` account daily capture; window carries frozen target date | `ad-account-daily-kpi-source-owner.js`; Dashboard account-day evidence | Preserve v2 daily contract; actual acceptance required |
| Ads profitability: `collectAdvertisingProfitability` | `content/coupang/profitability-report.js`; worker `collectAdvertisingProfitabilitySlice` | `profitability-source-owner.js`; profitability evidence/ABC inputs | Keep existing report JSON and separate grain |
| Wing traffic: `collectAdvertisingWingTraffic`, popup, `monthlyScrape` | `wing-read-api.js`, `wing-unified.js`; worker `doMonthlyScrape` still calls v1 directly | `wing-traffic-source-owner.js` v1/v2; Dashboard daily and period views | Preserve v2; route new monthly requests through existing v2 owner entrypoint |
| Wing itemwinner: `collectAdvertisingWingItemwinner`, popup | `wing-read-api.js` getProductList with unique-coverage proof | `wing-itemwinner-source-owner.js`; Dashboard current-state classification | Preserve; revalidate when shared browser wiring changes |
| Wing full catalog: `startCoupangCatalogImport` | `coupang-catalog-import.js`: discovery, manifest, detail; `shared/coupang-catalog-collector.js`: normalization | Channels catalog owner; Product Hub matching/catalog | Keep discovery JSON and detail embedded JSON; complete actual import acceptance |
| Wing inventory workbook: `scrapeInventoryList` → `exportWingInventoryWorkbook` | `content/coupang/wing-inventory-scraper.js` | `/api/channels/coupang-wing/inventory-export`; file download | Export-only, not a canonical catalog publication; label distinctly |
| Wing search sales: `collectSourcingWingCatalog`, `collectAdvertisingWingRank`, rank batch, `collectAdvertisingTrackedWingProducts` | worker `searchWingCatalogProducts`, request/retry/cursor/normalization helpers | `wing-catalog-source-owner.js`, `keyword-rank-source-owner.js`, `tracked-wing-products-source-owner.js`; Sourcing search and Advertising rank/tracked views | Concentrate capture behind one Wing-specific interface; retain separate owners |
| Public keyword suggestions: `collectSourcingKeywordSuggestions` | worker `searchCoupangKeywordSuggestions` and sourcing attempt lifecycle | `/api/sourcing/workspace/keyword-suggestions/attempts`; Sourcing keyword suggestions | Move source-specific capture/lifecycle out of unrelated worker responsibilities where it creates locality |
| Public SERP: `collectAdvertisingKeywordSerp`, SERP batch | worker `captureCoupangKeywordSerp`, extraction/pagination | `keyword-rank-source-owner.js`; Advertising rank screens | Preserve public-search semantics; concentrate cohesive capture helpers |
| Seller identity: `collectAdvertisingSellerIdentities`, SERP enrichment | worker `captureSellerIdentities`, product-detail resolution | `keyword-rank-source-owner.js`; competitor identity views | Keep bounded discovered-URL scope; no arbitrary URL interface |
| Competitor catalog: `collectAdvertisingCompetitorCatalog`, enrichment | worker `collectAdvertisingCompetitorCatalogTarget`, seller-store sort/extraction | `competitor-catalog-source-owner.js`; competitor catalog views | Concentrate seller-store policy without combining it with SERP policy |
| Reviews: `runCoupangReviewCollection` | `coupang-review-collector.js` | Orders review owner; review screens | Keep existing cohesive collector; verify if browser dependency changes |
| Marketplace orders: Icecream, Kidsnote, Kkomangse, Onchannel, Kidkids, Haebeop, Lotteon, Gsshop, Alwayz, Kakao, Boribori, Teacherville, Art09, Domeggook | `background/orders/worker.js` named per-market collectors and download/parsing functions | `order-collection-source-owner.js`, `order-collection-lifecycle.js`; `/order-collection` | Preserve frozen mall plan and per-market behavior; deepen only cohesive market capture, not generic order runner |
| Rocket PO: `collectRocketPoRows` | `rocket-po-collection.js`: list JSON, detail HTML; `coupang-po-session.js`: supplier session | `rocket-po-source-owner.js`; `/rocket-orders` | Keep transport; strengthen per-PO completeness before any accepted result |
| Coupang directship: `collectCoupangDirectOrders` | Orders worker directship capture | `coupang-directship-source-owner.js`; `/order-collection` | Preserve distinct directship contract, no PO confirmation |
| Shipment date summary: `collectCoupangShipmentDateSummary` | Orders worker summary capture and supplier session | `coupang-shipment-summary-source-owner.js`; inventory/shipment views | Keep existing collect seam; source-specific completeness remains local |
| Shipment list/files: `collectCoupangShipmentList`, `fetchCoupangShipmentPdfBatch`, download actions | Orders worker authenticated list/PDF capture | Existing shipment/file consumers | Evidence/file paths, not independent canonical complete snapshots |
| Sellpia inventory: `collectSellpiaInventory` | `sellpia-inventory.js` JSON snapshot | `sellpia-inventory-source-owner.js`; `/inventory-hub` | Preserve existing deep collector |
| Sellpia sales: `collectSellpiaSaleSummary` | Orders worker fixed sales JSON and seller/date normalization | `sellpia-sales-source-owner.js`; Dashboard/stock outflow | Concentrate source capture behind existing collect seam |
| Sellpia product profit: `collectSellpiaProductProfit` | Orders worker fixed product-profit JSON and month/row validation | `sellpia-product-profitability-source-owner.js`; Dashboard/product profitability | Concentrate source capture; retain order-time supply-cost semantics |
| Sellpia tracking: `collectSellpiaDeliTracking` | Orders worker tracking read and normalization | `sellpia-shipment-tracking-source-owner.js`; order tracking | Keep read capture separate from confirmed tracking uploads |
| Sellpia manual match: `collectSellpiaManualMatch` / external port | `sellpia-manual-match.js` fixed read requests | `sellpia-manual-match-source-owner.js`; matching screens | Preserve existing deep collector and exact target plan |
| Sellpia order snapshot/reconciliation: `collectSellpiaOrderSnapshot` | Orders worker read-only submitted-file reconciliation | Order transmission consumer | Preserve evidence-only lookup; uploads/post-transfer/invoice mutations excluded |
| Supplier product: `COLLECT_CURRENT` | `background/sourcing/product-extension-collector.js`, content/extractors, worker injection and enrichment | Sourcing product-data attempt owner; popup/Sourcing candidates | Preserve attempt-correlated events and owner COMPLETE requirement |
| 1688 trend: `collectSourcing1688Trends` | `1688-trend-collector.js`, 1688 search extractor | Sourcing trend owner; trend screens | Preserve cohesive source module and source wire |
| Live commerce: `collectSourcingLiveCommerce` | `live-commerce-collector.js`, room extractor | Sourcing live-commerce owner; live-commerce screens | Preserve source-specific URL, attention and extraction policy |
| TikTok Creative Center: `collectSourcingTiktokCcTrends` | `tiktok-cc-collector.js`, Creative Center hook/extractor | Sourcing TikTok owner; trend screens | Preserve region, target and capture semantics |

The source-owner manifest also contains historical `dashboard.coupang_ads`
and `dashboard.coupang_products` labels. Neither is a newly enabled collection
entrypoint; do not create an execution path merely to match inventory labels.
Registration, deletion, approved advertising actions, order upload, tracking
upload, invoice generation and PO confirmation are not collector refactors.

## Responsibility Layout

1. **Browser resource module:** owned tab/window identity, environment binding,
   readiness, bounded resource recovery and cleanup. It knows no campaign,
   product metric, business date, SKU completeness or source terminal state.
2. **Source capture module:** interprets the frozen source input, owns allowed
   provider requests, parsing, pagination, normalization, missing-value policy,
   provider retry and capture proof. Its small interface is also the behavior
   test surface. A browser adapter and a fixture adapter justify the seam.
3. **Source owner transport module:** retain the existing named owner contract,
   attempt/token/expiry fence, exact receipt bytes, uncertain-ACK reconciliation,
   and source-specific submission. It invokes the existing `collect` seam;
   it never makes browser observations canonical by itself.
4. **Server owner:** unchanged canonical writer and terminal authority. Previous
   complete snapshots survive failure; source completion never starts ABC.
5. **Popup/screen:** explicit start and owner observation. Local progress is
   transient, never evidence of canonical completion. A file-export result is
   labeled as a file export, not owner collection success.

This is a responsibility model, not a mandatory class hierarchy or universal
runner. Existing Sourcing and Sellpia modules that already concentrate their
policy remain intact. Similar code alone does not justify shared policy.

The public CollectionSession view intentionally excludes managed tab identity.
For public-source collectors reusing a supplied tab, a narrow internal
`ownsTab(attemptId, environmentId, producer, tabId)` read checks the existing
private managed-tab record. Do not add a second ownership map, expose private
fields in the public view, or guess alternate session shapes. Detach and cancel
must immediately invalidate this check.

For marketplace order capture, the named per-mall collect functions remain
the interface: they already hide each provider's request, export and parser
policy. A file per mall would not by itself add depth. Managed collection must
nevertheless acquire its own inactive tab and acknowledge attachment before
readiness or capture; discovering an existing provider tab does not establish
ownership. Keep explicit upload/tracking helpers outside this read-collection
change. Reuse the existing order lifecycle for local ownership checks, without
adding a second canonical lifecycle or altering the frozen mall plan.

## Source-Specific Contracts

### Wing search and public evidence

Keep the Wing search input/output, last28d meaning, producer allowlist,
per-page retries, caller-level whole-search retry, cancellation and proof.
Do not merge search sales with account traffic or full inventory. Characterize
all three callers before moving implementation. Incomplete cursor/request
proof must not disappear when tracked-product rows are filtered. The current
worker declares `waitForTabComplete` twice; remove implicit shadowed dependency
from the collector without changing unrelated registration behavior.

Public SERP, seller identity, seller-store catalog and keyword suggestions have
different traversal and evidence policies. Their capture modules may reuse
existing browser mechanics but do not share a speculative provider runner.

### Advertising

Keep keyword and profitability integrations. The already-observed manual
product request uses `tableType: product_sales`, exact campaign/group/ad IDs,
`creativeId: null`, `isMatchTypeEnabled: false`, and equal KST-midnight epochs
for a single business day. All requested response keys and six additive
metrics must be present; explicit numeric zero survives. Keep current metadata
fields with a bounded metadata observation where JSON does not provide them.
Campaign/account summaries are not interchangeable with product sums.

Retain the existing strict DOM-page proof for previously captured receipts.
New manual product JSON receipts carry a distinct `product_sales_api` proof:
campaign/group identity, exact day and KST request epochs, fixed request mode,
enumerated ad/vendor-item identities and the exact observed response-key set.
The owner checks those identities against the frozen campaign and submitted
rows, including all six finite observed metrics. Do not manufacture DOM page
numbers for a JSON request. Only explicitly observed `MANUAL_SELECTION`
groups use this path; empty or unknown group classification fails closed.
The verified initial path has one group per campaign. Prove the complete group
roster contains that exact group and reconcile campaign ad count, enumerated
ad identities and metadata rows. Multiple/unobserved groups remain explicitly
unsupported by this path; a single visible group cannot certify a campaign day.
Provider roster reads may resolve groups for a frozen dashboard campaign but
must not replace the dashboard's already-frozen campaign roster.
Initial metadata may come from the existing bounded DOM observation, but its
displayed-period metrics and ratios must not leak into an exact-day payload.

AUTO_SELECTION `adGroup.ads: []` is not proof of zero. Its separately observed
ads-with-metrics route has incomplete historical screen verification and
pagination instability in one sample. Do not claim that path accepted or
silently replace the existing metadata-only behavior. Record any remaining
coverage as unavailable. API implementation absence does not invalidate the
previously verified manual-product request evidence.

Move advertising resume/identity/date/message policy out of CollectionWindow
into the advertising capture module. Wing commands remain Wing-specific.

### Rocket

Keep list JSON plus detail HTML. The 13/1/46-SKU PA/RP observations are the
baseline, not a replacement JSON contract. Parse each PO into temporary rows;
validate required identities/fields, unique line identities, observed SKU
count and comparable status quantity totals before accepting its rows.
Do not coerce an absent required numeric field to zero. A bounded detail retry
may recover a transient mismatch; otherwise return explicit failure with no
usable partial rows. Preserve supplier vendor scope, detail concurrency five,
and the existing one-fresh-tab session recovery. Owner validation remains a
second gate. No physical inventory or provider confirmation action occurs.

### Popup and monthly collection

Read source status and latest complete evidence from existing owner reads,
independently per source and selected environment. Show running/failed/missing
and prior complete separately. Ignore stale responses after an environment
switch. Local last_sync must not certify completion. New monthly Wing actions
use the existing range-capable daily-v2 owner route for closed business days,
not a separate per-day v1 loop or local terminal ledger. Existing immutable v1
evidence remains readable; no data rewrite or migration is required.

The Sellpia sales summary remains an independent source read: missing account
advertising coverage does not hide observed sales, costs or quantity. Its
advertising cost, net profit and profit rate are nullable when the requested
account advertising range is incomplete. Consumers must preserve those nulls
instead of substituting zero or recalculating profit locally. A complete
explicit zero-cost range still produces numeric zero and a calculable profit.

## Verification And Evidence

Before changes: full extension suite **898/898 passed** on the current task
worktree. Each change needs tests through the same interface as production,
not extracted worker source strings. Replace superseded low-level tests only
after equivalent behavior is covered. Retain owner/fence integration tests.

Per collector, record implementation, regression result, actual extension
attempt identity, owner state/count/coverage, screen result and preservation
evidence. A successful fixture or provider request alone is not E2E acceptance.
Authentication or unavailable source data is held explicitly while independent
collectors continue. No repeated uncontrolled retry or access-control bypass.

The main session alone operates the browser. Common browser changes require
actual Wing traffic and itemwinner revalidation; preserve the verified 534-row
September 1–6 / GMV 363200 / 58 orders / 173 units and 747-itemwinner baselines.
Unchanged collectors can reuse their existing evidence; do not recollect them
just because another collector changed. Backend changes require focused tests
and actual Nest boot; web changes require a production build. No destructive
PG tests use the preserved screen-QA database.

## Process Decisions

The latest user clarification makes this spec the collection work's acceptance
authority. A separate execution plan and strict task sequence are not required;
the generated plan is superseded. Main decomposes and adjusts work directly
against these criteria, without adding plan-writing or approval ceremonies.

Code implementation agents use **Luna/max**. The **inline main model** owns
overall architecture judgment, contract review, work decomposition, integration
review and final QA. Investigation may inform main judgment but cannot replace
it. There is no separately delegated architecture approver or final QA owner.

The user has selected the whole collection scope and requested design through
implementation; do not re-open the earlier pilot-choice question. The prior
`CollectionSession` / `collect` / owner design is accepted. Main performs
integration and review, with Luna/max implementation allocation as already
approved. No separate reviewer agent or whole-branch re-review is added for
unchanged prior work. Skill suggestions to commit, push or clean a workspace
do not override the user's explicit prohibition.

## Approved Marketplace Continuation Seam — 2026-09-10

The user approved moving mandatory marketplace collection follow-up into the
existing Orders collection module. This is an extension of the accepted owner
and web-app lifetime contracts, not a replacement collection engine.

- A real marketplace capture dispatch owns capture, server conversion request,
  source submission and authoritative terminal acknowledgement without a
  responding web page. The page observes the owner and presents the result.
  A successful provider read alone is not collection completion. Login
  preflight and explicit operator-attention outcomes remain nonterminal and
  must not be mistaken for captures to convert.
- Preserve each named collector's HTML, JSON, CSV or workbook acquisition and
  parser; reuse the existing server converter for its exact mall. Do not
  normalize every provider into JSON or invent Kakao conversion. Unsupported
  Kakao capture retains the original with the existing unsupported outcome.
- Preserve manual all-row collection and Icecream automatic new-row selection.
  Freeze the caller's existing seen-row criterion at attempt admission, using
  the same trimmed-cell/row-separator comparison. It is an immutable input to
  this attempt, not a new server-owned global seen-order registry. Retain the
  full captured original and the frozen selection criterion so delayed UI
  recovery does not lose delivery-index coverage or recompute a different
  subset. Preserve explicit NO_NEW_ORDERS handling; missing evidence is never
  fabricated as an empty capture.
- Use the existing Orders owner/artifact state and exact-input replay fences.
  A lost submission acknowledgement reconciles the same owner/input and does
  not recollect, invent success, or send a contradictory failure. Cancellation
  prevents subsequent provider and normal completion requests; prior saved
  source data remains retained. A second local terminal ledger is not added.
- Converted files remain server-generated download results, not persistent
  database blobs. Reopening the UI may regenerate from the retained source
  through a scoped server read/conversion path; it must not create a new
  source attempt. Keep existing automatic-versus-explicit download behavior,
  previews, filenames and field mapping. Do not move or execute actual order
  submission, shipment/tracking changes, or directship transmission intent
  behavior as part of this change.
- Retain runId input compatibility only by validating that identity through
  the same server owner control as attemptId. Conflicting IDs, foreign/missing
  owners and incompatible plans fail before provider access. Unrelated runId
  meanings elsewhere are not renamed or conflated.
- Regression acceptance covers a frozen/absent response consumer, delayed
  owner ACK, cancellation between capture and submission, partial/source
  retention, duplicate dispatch, full versus new rows, zero-new-row behavior,
  all affected named mall conversion inputs and unchanged explicit download
  and order-transmission contracts. Main owns integration review and actual QA.
