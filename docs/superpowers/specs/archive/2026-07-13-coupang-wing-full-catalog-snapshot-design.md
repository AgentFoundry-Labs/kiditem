# Coupang Wing Full Catalog Snapshot Design

## Status and Authority

Approved by the user in the design conversation on 2026-07-13.

This work is part of the existing `VERSION 0.1.8` reconstruction. It does not
raise `VERSION` beyond `0.1.8`. The root `VERSION` file already contains
`0.1.8`, and this design records the persisted schema and data behavior that
must ship within that release.

### 2026-07-14 current-code amendment

The product goals, completeness rules, preservation rules, and failure
semantics in this design remain authoritative. The implementation plans below
supersede these specific staging/model details after review against the current
code:

- browser checkpoints use the existing Channels-owned `ChannelScrapeRun` plus
  a new `ChannelScrapeChunk`; `SourceImportRun` remains only the final
  deduplication/publication fence;
- validated `product_details` chunks publish additively as they arrive and
  carry a durable `publishedAt` fence; only the complete final snapshot may
  deactivate unseen rows;
- `SourceImportRun.fileName` stays required. A browser run stores the literal
  provenance label `browser-extension:coupang-wing:v1` in the database column
  `source_import_runs.file_name`; this is not a path, no snapshot file is
  created, and raw chunk payloads remain in `channel_scrape_chunks.payload`;
- listing media uses the existing
  `ContentGenerationGroup(groupType='workspace_assets') -> ContentAsset` path;
  no `ContentWorkspaceAsset` model is added;
- catalog publication stores provider URLs only. Image bytes are fetched
  lazily through the existing guarded image-fetch port when thumbnail or
  detail-page work actually needs them; catalog sync does not pre-download
  provider images;
- the registered-products route already reads `ChannelListing`, so the UI work
  adds account selection, import controls, progress, and invalidation rather
  than another read-model cutover;
- publication keeps the current organization/source sequence while the
  advisory lock becomes account-scoped by `channelAccountId`;
- the old backend image-sync path is already absent; only its remaining web,
  shared-contract, and extension surfaces are removed after live replacement
  acceptance.

This document extends
[`2026-07-12-sellpia-authoritative-inventory-cutover-design.md`](./2026-07-12-sellpia-authoritative-inventory-cutover-design.md).
For the scope covered here, it supersedes that document's non-goal of not
importing live Wing content that does not already exist in KidItem. The rest of
the Sellpia-authoritative inventory and channel-SKU reconstruction remains in
force.

## Context

KidItem currently has three different Coupang paths that look similar but do
not provide the required behavior:

1. The Chrome extension action `scrapeCoupangImageRows` extracts only a small
   image-oriented row shape.
2. The web image-sync path posts those rows to the thumbnail AI domain and
   attempts to attach images to already known products.
3. The channel sync service refreshes existing `ChannelListing` records but
   deliberately skips unknown Wing products.

None of these paths creates a complete registered-product catalog. A product
that exists only in Wing therefore cannot become a valid KidItem registered
product with parent metadata, sellable options, a content workspace, and
immediately usable image references.

The live Wing inspection performed for this design found:

- 1,227 products across 25 real list pages at the time of inspection;
- stable row discovery through `tr.inventory-line[data-inventory]`;
- stable title extraction through `a.ip-title`;
- 50 inventory IDs and 50 image URLs on the inspected 50-row page;
- no usable `legacyCode` values on that page;
- a broad pagination selector that could produce `8000` instead of the real
  page count;
- the current name extractor missing `a.ip-title` and including unrelated row
  metadata in names.

The observed count of 1,227 is acceptance evidence, not a hard-coded business
constant. Every import must use the current Wing manifest and validate the
count it observes.

The current local database also demonstrates the ownership mismatch:

- 1,225 active Coupang `ChannelListing` rows already exist from the Wing
  workbook import;
- those listings are not linked through the legacy `masterId` grouping
  expected by the registered-products screen;
- provider images and listing-owned content workspaces are not populated by
  the workbook catalog import;
- `MasterProduct` rows represent Sellpia physical product codes and must not be
  used as Coupang parent-product identities.

## Goals

- Collect every currently registered Wing parent product and every sellable
  option without requiring an Excel export.
- Persist collection progress so an interrupted browser run resumes instead
  of restarting.
- Publish a new catalog only after proving that the snapshot is complete.
- Upsert canonical `ChannelListing` and `ChannelListingOption` rows without
  changing their stable KidItem IDs on ordinary re-import.
- Make newly discovered Wing products appear immediately on the registered
  products screen.
- Create or reuse one active `ContentWorkspace` for every published listing.
- Attach every provider image to that workspace immediately and select the
  primary provider image as the current thumbnail.
- Allow AI workflows to use provider images immediately after catalog
  publication.
- Keep provider originals as external URLs during catalog sync and fetch
  their bytes only when a thumbnail or detail-page operation needs them.
- Persist only the selected or derived managed asset required by the editing
  operation; do not pre-download the full provider catalog.
- Preserve KidItem-authored fields, content history, and confirmed
  `ChannelSkuComponent` recipes across imports.
- Mark listings and options missing from a successfully completed full
  snapshot inactive while preserving their history.
- Keep organization and channel-account boundaries enforced in every write
  and read.

## Non-goals

- Using the old Excel popup flow as the primary Chrome collection mechanism.
- Inferring Sellpia mappings from product names, barcodes, or images.
- Creating or modifying `ChannelSkuComponent` recipes during catalog import.
- Mutating marketplace stock or Sellpia stock.
- Pre-downloading provider images during or after catalog publication.
- Adding direct database access to the frontend or extension.
- Storing KidItem API credentials or database credentials in the extension.
- Making a private Wing endpoint or DOM selector silently authoritative when
  its contract no longer validates.
- Replacing unrelated advertising, order, or market-data snapshot flows.

## Approved Approach

The approved approach is a deep `Channel Catalog Snapshot` capability. The
extension is a collection adapter, not a database writer. It uploads durable,
idempotent chunks to a server-owned import run. The server validates and
publishes the complete snapshot into canonical channel and content owners.

The rejected alternatives were:

- a flat registered-products read fix that would make existing rows visible
  but still leave options and media incomplete;
- a media-only repair that would continue to require products to exist before
  collection;
- direct extension writes that would duplicate authentication, tenancy,
  validation, and transaction logic outside NestJS.

## Core Invariants

1. `ChannelAccount` is the marketplace/store boundary.
2. `ChannelListing` is the Wing parent-product identity.
3. `ChannelListingOption` is the Wing sellable-SKU identity.
4. `MasterProduct` remains one Sellpia physical product-code row and is never
   created or selected by the Wing catalog importer.
5. A listing is identified only by
   `(organizationId, channelAccountId, externalId)`.
6. A sellable option is identified by its external SKU ID within the same
   organization and channel account.
7. Names, image URLs, list-page positions, and `legacyCode` never identify a
   product.
8. Re-import updates existing canonical rows in place.
9. Channel collection never overwrites KidItem-authored operational fields,
   manually selected/generated content, or confirmed SKU component recipes.
10. Discovery alone never changes the live catalog. Each validated and
    durably stored detail chunk may add or update only the products contained
    in that chunk.
11. Only one successfully finalized full snapshot may deactivate unseen
    listings, options, or provider assets.
12. A later on-demand image-fetch failure cannot roll back or hide a valid
    catalog.
13. Every listing has at most one active listing-owned `ContentWorkspace`.
14. Every imported provider image is immediately available as a `ContentAsset`
    in the listing workspace's `workspace_assets` generation group.
15. All persisted status values remain `String` fields constrained by shared
    Zod/domain validation rather than native PostgreSQL enums.

## Architecture

```text
Wing authenticated tab
  -> Chrome collection adapter
  -> KidItem web bridge
  -> account-scoped NestJS import API
  -> ChannelScrapeRun + ChannelScrapeChunk staging
  -> per-detail-chunk validation and additive publication
       -> ChannelListing
       -> ChannelListingOption
       -> ContentWorkspace
       -> ContentGenerationGroup(groupType=workspace_assets)
       -> ContentAsset
       -> current thumbnail selection
  -> full-snapshot completeness validation
  -> final absence reconciliation + SourceImportRun completion
  -> registered-products ChannelListing read model
  -> thumbnail/detail operation
       -> guarded on-demand provider URL fetch
       -> selected or derived managed output when required
```

The web application owns KidItem authentication and the selected channel
account. The extension owns interaction with the authenticated Wing tab. The
server owns durable state, validation, canonical writes, and recovery.

The existing `ChannelCatalogImportService` remains the workbook entrypoint.
`ChannelCatalogCollectionService` owns resumable browser collection and hands
the completed shared snapshot to the same canonical listing model.

Because the existing channel catalog repository is already large, resumable
run storage, pure snapshot validation, and canonical publication must remain
separate units rather than adding all behavior to one adapter.

## Shared Snapshot Contract

Both transports normalize into a versioned `CoupangCatalogSnapshot` contract.
The contract contains three logical collections:

### Parent products

Each parent record includes:

- `externalProductId`;
- registered name;
- Coupang display name;
- category;
- manufacturer;
- brand;
- product approval/exposure state;
- provider raw JSON.

### Sellable SKU rows

The SKU-normalized view is `CoupangCatalogSnapshotRow`. Each row includes:

- `externalProductId`;
- `externalSkuId`;
- option name;
- sale state;
- sale price when available;
- seller SKU when available;
- model number;
- barcode;
- search attributes;
- provider raw JSON.

The workbook adapter may continue to begin with `ParsedWingCatalogRow`, but it
must map that parser result into the shared snapshot contract before calling
the publisher.

### Provider media

Each media record includes:

- `externalProductId`;
- normalized absolute source URL;
- `role`, using `primary`, `detail`, or `option`;
- stable `sortOrder`;
- optional external option ID for option-specific media;
- provider raw metadata when available.

Media is not repeated on every SKU row. It is joined to the parent listing by
`externalProductId` during publication.

The shared schema rejects unknown contract versions, blank external IDs,
negative sort orders, duplicate SKU IDs, and a SKU assigned to multiple
parents.

## Resumable Import Models

### ChannelScrapeRun and ChannelScrapeChunk

`ChannelScrapeRun` owns browser collection progress. Its `metaJson` stores the
versioned manifest, browser `clientRunKey`, phase, canonical snapshot hash,
bounded error, and completed publication summary. The database enforces one
run per organization, account, source, and client key.

`ChannelScrapeChunk` stores collection progress and the durable publication
fence for each detail batch:

```text
id
organizationId
runId
kind             discovery_page | product_details | manifest_confirmation
sequence
checksum         SHA-256
payload          JsonB
itemCount
publishedAt      nullable; set after canonical detail-chunk publication
createdAt
updatedAt
```

Rules:

- unique `(runId, kind, sequence)`;
- every chunk relation is organization-safe;
- replaying the same key and checksum is a successful no-op;
- replaying an unpublished detail chunk retries its idempotent canonical
  publication;
- replaying the same key with a different checksum returns a conflict;
- chunks are append-only while the run is collecting;
- completed runs reject new chunks;
- chunks remain available for audit and retry retention, then may be cleaned
  according to an explicit retention policy without deleting canonical data.

The initial implementation uses bounded JSONB chunks instead of normalized
staging tables. `publishedAt` is the durable fence between “detail stored” and
“visible in registered products.” A detail chunk is not reported as published
until its listing, option, workspace, and provider-asset transaction commits.

Only during successful final reconciliation does publication create a
`SourceImportRun` as the durable final provenance and deduplication fence.
Browser publication stores `browser-extension:coupang-wing:v1` in required
`fileName` and the canonical snapshot hash in required `fileHash`; it does not
create a file.

## Content Ownership and Media Models

`ContentWorkspace` already supports a listing owner and enforces one active
workspace per listing. Catalog publication ensures that workspace exists and
reuses it on later imports.

Provider images reuse the existing workspace-owned
`ContentGenerationGroup(groupType='workspace_assets')`. Provider
`ContentAsset` rows use stable keys derived from workspace, role, optional
external option ID, and normalized source URL. Their metadata holds
`sourceType`, `sourceUrl`, `externalOptionId`, `lastImportRunId`, and active
state. For a provider original, `url` remains the normalized external URL and
`storageKey`, MIME type, dimensions, and file size remain null because catalog
publication has not fetched the bytes.

Thumbnail and detail-page operations resolve the provider URL through the
existing guarded image-fetch port only when bytes are required. They validate
the fetched content and persist a selected or derived managed asset when that
operation requires a durable output. The provider source asset itself remains
URL-backed, so synchronizing 1,000 products does not create 1,000 speculative
downloads.

The first active `primary` media record becomes the current workspace
thumbnail selection during the same publication transaction. Existing manual
or generated selections are not replaced on later imports unless the current
selection is itself the prior provider-primary selection. This preserves
operator intent while still giving a newly imported listing an immediate
thumbnail.

If a provider URL disappears in a later complete snapshot, its provider
`ContentAsset` is soft-deleted and marked inactive. Historical thumbnail and
content references are not hard-deleted.

## Chrome Collection Algorithm

Collection is deliberately split into discovery and hydration.

### Discovery

1. Confirm that the selected tab is an authenticated Coupang Wing inventory
   list page.
2. Read only exact product rows using
   `tr.inventory-line[data-inventory]`.
3. Read names using `a.ip-title` and fail contract validation if the selector
   no longer produces the corresponding title.
4. Read the Wing total item count and page size.
5. Calculate expected pages as `ceil(totalItems / pageSize)`; never infer the
   maximum from every numeric element in the pagination container.
6. Visit each expected page and persist a discovery chunk containing the page
   number and product IDs.
7. Reject duplicate product IDs across pages.
8. Re-read the first-page manifest after the final page. If the total,
   pagination shape, or first-page fingerprint changed, mark the discovery
   stale and repeat it instead of publishing a mixed-time list.

`legacyCode` is diagnostic metadata only. Its absence cannot prevent product
discovery and it can never replace the registered-product ID.

### Hydration

For every discovered parent ID, the collector obtains structured parent,
option, and image data in the authenticated Wing page context. Structured page
state or same-origin response data is preferred where available; precise DOM
extraction is the fallback. Both extraction paths must produce the same shared
Zod contract.

Hydration is checkpointed in bounded product-detail chunks. A navigation,
session, or network failure records the failed product ID and stops forward
publication. Resume begins with the first product that does not already have a
valid detail chunk.

Selectors and structured response mappings are versioned collector adapters
with fixture tests. Contract drift fails loudly. The collector must never turn
a selector failure into an empty option or image set and then declare the
snapshot complete.

### Completeness validation

`finalize` is allowed only when:

- every expected discovery page exists;
- discovery product count matches the Wing manifest;
- the stable discovery fingerprint check passed;
- every discovered product has a valid detail result;
- every SKU has a nonblank external ID;
- no SKU appears twice or belongs to multiple parents;
- all media refer to discovered parent IDs;
- the client-supplied snapshot hash matches the server's canonical hash.

A missing or invalid image does not invalidate product identity. Its URL-level
error is recorded for media handling. A missing parent/SKU identity or missing
detail result prevents publication.

## API and Browser Bridge

The account-scoped server API consists of:

```text
POST /channels/accounts/:channelAccountId/catalog-imports/coupang-wing/runs
GET  /channels/accounts/:channelAccountId/catalog-imports/coupang-wing/runs/:runId
PUT  /channels/accounts/:channelAccountId/catalog-imports/coupang-wing/runs/:runId/chunks/:kind/:sequence
POST /channels/accounts/:channelAccountId/catalog-imports/coupang-wing/runs/:runId/finalize
```

The start endpoint creates or resumes a run using `clientRunKey`. The status
endpoint returns manifest progress, missing chunk sequences, phase, error, and
the completed change summary. The chunk endpoint validates its checksum and
shared payload schema. For a `product_details` chunk it then performs
idempotent additive publication and sets `publishedAt`. The finalize endpoint
performs completeness validation, absence reconciliation, and final provenance
publication.

The registered-products web route invokes these authenticated APIs. It sends
collection commands to the extension and receives progress through the
existing browser bridge. The extension never receives a database connection
or a long-lived backend secret. A simple status poll is sufficient for the
initial UI; no new SSE subsystem is required.

## Publication Timing Decision

Three approaches were considered:

1. keep full-snapshot atomic publication: strongest all-or-nothing visibility,
   but a 40–50 minute Wing hydration looks stalled and completed products are
   unavailable;
2. publish each validated detail chunk, then reconcile absence only after the
   full snapshot: selected because cards and images appear progressively while
   deletion safety remains tied to complete evidence;
3. render staging-only preview cards: preserves full atomic publication but
   duplicates the registered-product read model and does not make the products
   usable elsewhere.

The selected approach changes the transaction boundary, not the identity
contract. Each detail chunk is independently atomic and idempotent. It may
only upsert or reactivate identities present in that chunk. It may not
deactivate anything.

## Incremental Publication and Final Reconciliation

Each chunk publication uses one transaction and an advisory lock scoped by
`organizationId`, `sourceType`, and `channelAccountId`. Different Coupang
accounts may publish independently.

Within a detail-chunk transaction the application:

1. validates the active organization, channel account, run ownership, status,
   checksum, and detail payload;
2. returns successfully when the same chunk was already published;
3. upserts parent listings in bounded batches;
4. resolves persisted listing IDs by external product ID;
5. verifies that an existing external SKU is not moving to a different parent;
6. upserts the chunk's options in bounded batches;
7. ensures listing-owned content workspaces;
8. upserts provider assets in each workspace's `workspace_assets` group;
9. establishes the initial provider-primary thumbnail selection where
   appropriate;
10. marks the stored chunk `publishedAt` and records cumulative created,
    updated, option, and media counts.

The registered-products query is invalidated whenever `publishedProducts`
increases, so newly created cards and updated data appear without waiting for
the remaining catalog.

Final reconciliation runs only after every discovered product has a valid
detail record, every detail chunk has `publishedAt`, and the manifest
confirmation and canonical snapshot hash match. It creates the final
`SourceImportRun`, repeats the full upsert idempotently to attach final
provenance, deactivates only identities absent from the complete snapshot,
assigns the next account-scoped publication sequence, and marks the collection
completed.

If a chunk transaction fails, that chunk remains unpublished and is retryable;
previously published chunks remain visible. If final reconciliation fails, no
absence changes commit and the published chunks remain usable. External image
fetching and storage are never performed in either transaction.

The channels application service coordinates channel and AI ownership through
transaction-aware ports. The channel repository does not write AI tables
directly, and the AI module does not take over channel identity.

## Lazy Provider Image Fetching

The publication transaction inserts provider assets with the external URL.
This is the complete catalog-media write: it does not enqueue a background
copy, write a managed storage object, or add materialization state.

When a thumbnail selection, thumbnail edit, crop, AI image operation, or
detail-page image operation needs bytes, it first uses a managed storage image
when the selected input already has one. Otherwise it fetches the provider URL
through the existing guarded image-fetch port, including URL safety, response
size, and MIME validation. The operation then stores only the durable selected
or derived output required by its own contract.

An on-demand fetch failure is reported by that editing operation and does not
change catalog publication state or hide the registered-product card. No
background worker, asset queue, or catalog-wide retry loop is introduced for
provider originals in this release.

## Registered Products Experience

The registered-products screen remains on its existing `ChannelListing` read
model. The new work adds account-scoped import controls and invalidates that
query immediately after publication.

The primary interaction is:

1. select a Coupang channel account;
2. click `쿠팡 전체 상품 가져오기`;
3. connect to the authenticated Wing tab through the extension;
4. display discovery, detail hydration, chunk upload, validation, publication,
   and provider-image URL attachment progress;
5. invalidate and refetch the listing query whenever another detail chunk is
   published and once more after final reconciliation.

Progress includes:

- discovered pages over expected pages;
- hydrated products over discovered products;
- DB-published products over discovered products;
- accumulated SKU count;
- stored chunks over expected chunks;
- latest publication time, processing rate, and estimated remaining time;
- current phase and recoverable error;
- created, updated, and inactivated listing/SKU counts;
- attached provider image URL count.

The listing UI contract is:

- one card per `ChannelListing`;
- `listingId` is the card and detail-route identifier;
- active tab uses `isActive = true`;
- deleted/inactive tab uses `isActive = false`;
- each card shows current thumbnail, display or registered name, external
  product ID, channel account, state, and option count;
- external provider URL is rendered directly until an explicit content
  operation selects or creates a separate managed asset;
- no manual image-sync button is required for imported catalog images;
- cards published by an active run show `쿠팡 동기화 중` until final
  reconciliation completes.

The extension popup may show diagnostics and the current run, but it is not
the owner of channel-account selection, KidItem authentication, or canonical
state.

## Absence and Preservation Rules

After a complete successful snapshot:

- previously known listings absent from the manifest become
  `isActive = false`;
- previously known options absent from the snapshot become
  `isActive = false`;
- provider assets absent from the new snapshot become inactive;
- reappearing listings, options, and provider assets reuse and reactivate
  existing rows where identity matches.

The importer preserves:

- stable listing and option IDs during ordinary upsert-based imports;
- `sourceCandidateId`;
- confirmed `ChannelSkuComponent` rows;
- mapping status unless source identity invalidates it under an existing
  explicit policy;
- advertising grades, budgets, health fields, and other KidItem-authored
  operational data;
- content workspace history, generated assets, manual selections, and detail
  page artifacts.

This feature does not itself delete and recreate current listings. The broader
0.1.8 reconstruction still has authority to reset an environment and replay
approved source data. Pre-reset UUID preservation is not guaranteed by this
feature. Once listings exist in the final 0.1.8 schema, every later full
snapshot preserves their IDs by external identity.

## Failure and Recovery Semantics

| Failure | Required behavior |
|---|---|
| Chrome closes or network fails | Resume from persisted missing chunks |
| Same chunk and checksum replayed | Return idempotent success |
| Same chunk key with different checksum | Return conflict and keep prior chunk |
| Wing session expires | Pause with an authentication error; keep chunks |
| List changes during discovery | Discard the unstable manifest and rediscover |
| Product detail cannot be hydrated | Keep prior published chunks visible; block finalize and resume that product |
| Missing page, product, or SKU identity | Block final reconciliation; do not deactivate anything |
| Server exits during chunk publication | Chunk transaction rolls back, `publishedAt` stays null, and replay retries it |
| Server exits during final reconciliation | Final transaction rolls back; no absence changes commit |
| Completed snapshot is submitted again | Return the prior completed result |
| Provider image fetch fails | Keep external URL, mark asset failed, retry only that asset |
| Selector or response contract drifts | Fail loudly with collector version and field diagnostics |

Recoverable collection errors keep the run resumable. Terminal validation
conflicts mark the run failed with structured diagnostics. A retry creates or
reclaims an attempt without reverting detail chunks that were already
published successfully.

## Tenancy and Security

- Every mutating service receives `organizationId` from
  `@CurrentOrganization()` and never trusts it from the request body.
- Every run, chunk, listing, option, workspace, and asset query is scoped by
  organization and channel account where applicable.
- The selected account must be active and have `channel = "coupang"`.
- Run and chunk IDs cannot be used to cross tenant or account boundaries.
- The extension sends only scraped provider data and opaque run progress; it
  does not store KidItem database credentials.
- Provider HTML, JSON, names, and URLs are untrusted input and pass through
  shared validation and existing URL/image fetch safety controls.
- Raw provider payloads are bounded before persistence.

## Release 0.1.8 Data Strategy

This persisted behavior is part of the already-open 0.1.8 reconstruction, so
the root `VERSION` stays `0.1.8`.

The implementation sequence is:

1. add shared snapshot/chunk contracts and regression tests;
2. add `ChannelScrapeChunk` and browser progress fields to
   `ChannelScrapeRun`;
3. implement resumable run storage and completeness validation;
4. add idempotent per-detail-chunk publication into existing channel listing
   and option models;
5. attach URL-only media through existing workspace generation groups and
   assets, and verify on-demand image fetching in thumbnail/detail operations;
6. remove catalog-wide provider-image materialization and its worker;
7. implement the extension discovery/hydration/resume collector;
8. add import controls, stored/published progress, ETA, and per-chunk live
   query invalidation to registered products;
9. verify the replacement before removing legacy extension/image-sync
   surfaces;
10. run the first complete Wing snapshot against the final 0.1.8 schema.

For an existing populated final-schema database, matching external product and
SKU IDs are updated in place. Missing workspaces and provider assets are
created. For an environment rebuilt as part of the broader 0.1.8 cutover, the
first full snapshot becomes the authoritative channel catalog seed after
approved account data is restored.

No data migration invents images or mappings that were not observed in Wing.
No automatic Sellpia mapping is performed.

## Testing Strategy

### Shared contract tests

- valid parent, SKU, media, manifest, chunk, and progress payloads;
- blank IDs, unknown versions, invalid roles, negative sort order, oversized
  payloads, duplicate SKU IDs, and parent conflicts;
- canonical sorting and hashing independent of collection chunk order.

### Extension fixture tests

- exact list row and title selectors;
- page count derived from total and page size;
- rejection of the old broad pagination result;
- no dependency on `legacyCode`;
- first-page stability fingerprint;
- structured response and DOM fallback normalization equivalence;
- selector/response drift fails the run instead of emitting empty arrays;
- resume skips already accepted chunks.

### Server unit tests

- start versus resume by `clientRunKey`;
- checksum replay and conflict;
- stored-versus-published progress and unpublished-chunk retry;
- missing chunk reporting;
- canonical snapshot hashing;
- completeness validation;
- image failure classification;
- application port orchestration without cross-domain direct writes.

### PostgreSQL integration tests

- organization and channel-account isolation;
- active Coupang account requirement;
- parent and SKU upsert ID preservation;
- detail-chunk publication exposes cards without deactivating unseen rows;
- failed chunk publication remains retryable and idempotent;
- existing SKU cannot silently move to a different parent;
- full rollback within each chunk and final reconciliation transaction;
- concurrent finalize serialization per account;
- stale attempt rejection and failed-run reclaim;
- account-scoped publication ordering;
- absent listing/SKU/media deactivation and later reactivation;
- KidItem-authored operational fields and component recipes remain unchanged;
- one active listing workspace;
- all provider asset URLs attach immediately without managed storage writes;
- initial provider primary selection and manual-selection preservation;
- duplicate completed snapshot is a no-op;
- thumbnail/detail operations fetch an external source lazily and persist only
  their selected or derived managed output;
- an on-demand fetch failure leaves the catalog asset URL and publication
  state unchanged.

### Web tests

- account selection and Wing-tab connection errors;
- collection progress and recoverable resume state;
- every increase in published-product count invalidates the listing query;
- discovery, detail-stored, DB-published, processing-rate, and ETA progress;
- one card per listing using `listingId`;
- active and inactive tabs;
- provider URL thumbnail rendering without a catalog-time download;
- no legacy `masterId` group dependency.

### Required repository gates

- `npm run db:push`;
- `npx prisma generate`;
- `cd packages/shared && npm run build`;
- `npm run dev:server` and confirm NestJS boot;
- `npm run build --workspace=apps/web`;
- scoped extension, server, shared, and web unit/integration test commands
  introduced by the implementation plan.

## Acceptance Criteria

1. With a logged-in Wing inventory tab open, a user can start the full import
   from KidItem without downloading an Excel file.
2. Closing or interrupting collection and starting again resumes from the last
   accepted chunk.
3. An incomplete or internally inconsistent snapshot never changes live
   listings.
4. A successful snapshot creates or updates every observed parent listing and
   sellable option.
5. The observed Wing product count, published active listing count, and
   registered-products result agree for the selected account, subject only to
   explicitly reported validation failures that prevent publication.
6. Newly discovered products appear on registered-products immediately after
   each committed detail chunk.
7. Primary and additional provider images are immediately visible and
   available by URL through the listing workspace, with no catalog-wide
   pre-download.
8. Thumbnail and detail-page operations fetch provider bytes only on demand;
   a fetch failure affects only that requested operation.
9. A later complete snapshot inactivates absent listings/options without
   deleting mappings or content history.
10. No registered-products path depends on legacy `masterId` groups or a
    separate catalog image-sync action.
11. The feature ships inside `VERSION 0.1.8` without changing the version to a
    later release.
