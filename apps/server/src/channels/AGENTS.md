Consult this document first instead of relying on memorized knowledge.

# channels — Marketplace Sync + SKU Matching

`src/channels/` owns marketplace accounts, listing/option metadata, Coupang
catalog/order/return sync, listing-to-product matching, channel sellable-capacity
projections, account-scoped registration, and channel dashboard reads. Provider
calls stay behind provider adapters.

## Folder Map

```text
channels/
├── channels.module.ts
├── adapter/in/http/          # account, listing, sync, dashboard, matching APIs
├── adapter/out/
│   ├── automation/           # operation-alert adapter
│   ├── coupang/              # provider client and adapter
│   └── repository/           # Prisma/raw-SQL adapters
├── application/
│   ├── port/in/              # published channel capabilities
│   ├── port/out/             # provider, cross-domain, repository ports
│   └── service/              # sync, registration, matching orchestration
├── domain/                   # pure normalization and recipe policy
└── adapters/coupang/         # compatibility shims only
```

## Owned Surfaces

- Channel account/listing APIs under `/api/channels/*`
- Coupang Wing/Rocket catalog publication and Coupang order/return sync
- Registered-product read model at `/api/channels/listings`
- Product-first, option-second identity matching and deterministic recipe
  preview/apply
- Nullable common availability at `/api/channels/sku-availability`
- Account-scoped marketplace registration capability consumed by Sourcing
- Channel dashboard read APIs

## Source-Of-Truth Models

- `ChannelAccount` is the marketplace/store identity. Wing and Rocket are
  separate rows even when they share one Coupang vendor identity.
- Logical `ChannelProduct` is Prisma `ChannelListing`; logical `ChannelSku` is
  `ChannelListingOption`. Each option stores independent provider metadata for
  one account; `optionId` is not inventory truth.
- `ChannelListing.masterProductId` is a derived summary only when all listing
  options resolve to one canonical inventory product. `ChannelListingOption`
  remains the marketplace sellable option identity and its recipe is the
  matching source of truth.
- A registration-created `ChannelListing.sourceCandidateId` is immutable
  provenance.
- Physical quantities come only from the Products-owned direct
  `ChannelListingOptionInventoryComponent` relation to Inventory's
  `SellpiaInventorySku`. Channels owns no stock table.
- Daily snapshots and scrape audit rows support reporting reads.

## Registration Contract

- Missing or inactive selected accounts are explicit errors. Provider calls and
  listing identity use that account; primary-account lookup is legacy-only for
  callers that omit an account.
- Reconcile a recorded provider result before create. Provider calls run outside
  the DB transaction; listing resolution/reactivation runs in the caller-supplied
  finalization transaction.
- Coupang retries use the frozen first-item `externalVendorSku` and never issue
  another create while the earlier result is uncertain. Every frozen option has
  a deterministic `externalVendorSku`.
- A provisional KidItem-first option keeps that key in `sellerSku`. Product
  detail publication promotes the same row to immutable `vendorItemId` under the
  shared listing lock; a single source-fenced provisional may transfer its link
  when the actual row was published first. Multiple candidates are an error.
- Catalog publication never creates `MasterProduct` rows. It preserves existing
  listing links and direct option inventory compositions while refreshing
  provider identity and metadata.
- Registration resolves identity by organization, account, and external listing
  ID without creating a `MasterProduct`. Listing resolution/reactivation
  preserves recipe and content metadata and attaches the immutable
  `sourceCandidateId`.

## Catalog, Matching, And Capacity Contract

- Matching reads the organization's persisted `ChannelListing` and
  `ChannelListingOption` rows. Source-import completion and snapshot provenance
  must not filter the operator matching workspace; only a complete full
  snapshot may drive absence or deactivation reconciliation.
- Catalog media remains attached to the channel listing's AI-owned content
  workspace. Matching reads may return that media as a display fallback, but
  collection and matching never write it into `MasterProduct.imageUrls`.
- Candidate rows are live evidence and never persist. The automatic command
  may fill an empty option composition or recalculate a one-component quantity
  from common deterministic evidence; it never changes a SKU or multi-component
  composition.
- Automatic recipe evidence must be unique and non-conflicting. Exact
  identifiers/names or threshold-clearing names may apply; incompatible,
  ambiguous, unverifiable, raw-alias, and AI evidence requires review. Read
  [`docs/runbooks/channel-sellpia-matching.md`](../../../../docs/runbooks/channel-sellpia-matching.md)
  before changing this policy or its operator workflow.
- Safe options apply independently. Complete, vendor-matched Rocket publication
  may reuse the same stored channel identities; incomplete collections may not
  invent matches.
- Direct option compositions alone drive capacity. Invalid components return
  `null`; zero means valid capacity is exhausted. Reads never reserve stock.
- Matching state derives from recipe validity. Do not restore persisted
  `mappingStatus`; recollection updates provider facts without clearing
  confirmed recipes. A null listing summary is valid for incomplete or
  multi-inventory-product listings.
- Common availability resolves as
  `sellableStock = min(floor(component.availableStock / component.quantity))`
  over the option's direct components.

## Listing Deletion Contract

- Actor-bound `ChannelListingDeletionOperation` is persisted under the scoped
  listing lock before browser mutation and owns authorization/uncertainty.
- Extension evidence (including DOM/meta/URL identity) is not server-verifiable:
  keep `reconciling/uncertain` and the listing active until an independent
  provider verifier confirms deletion. Succeeded deletion fences reactivation.

## Import + Matching APIs

- `POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing`
- `GET /api/channels/sku-availability`
- `GET /api/channels/product-mappings`
- `POST /api/channels/product-mappings/auto-match`
- Matching queue reads retain product and option relations, while the operator
  workspace groups option rows beneath their product.
- The legacy product-link command may clear all recipes. A non-null value is
  accepted only when the saved recipes already derive that
  exact MasterProduct; it cannot create an independent identity link.

Products owns direct option component replacement and derived listing-summary
recalculation. Channels owns listing/option identities and its conservative
automatic option-to-Sellpia matching transaction.

## Cross-Domain Ports

- Provider access goes through `COUPANG_PROVIDER_PORT`; operation-alert writes
  go through `CHANNELS_OPERATION_ALERT_PORT`.
- Orders/returns write to the channel-agnostic order spine through owned ports,
  not direct provider HTTP from Orders.
- Sellpia evidence uses the Channels-local anti-corruption bridge to Inventory.
- `ChannelsModule` exports `CHANNEL_SKU_AVAILABILITY_PORT` for the common nullable
  capacity projection and `ROCKET_PO_CATALOG_PORT` for complete account/vendor-
  scoped Rocket publication.
- `CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT` is the only registration
  capability for consumers; do not import the concrete service.

## Boundary Rules

- Services do not call raw `fetch`, `coupangRequest`, or concrete adapter
  helpers. Organization-specific credentials come from the selected active
  `ChannelAccount`; server env is not a credential fallback.
- New sync/matching paths carry `channelAccountId` and never create accountless
  listings. Product/option link commands validate organization ownership and
  parent-child consistency atomically.
- Dashboard SQL uses Prisma tagged templates and binds organization predicates
  on every tenant-owned table in the join path.
- Status normalization lives in `domain/coupang-normalization.ts`; add or change
  its tests when semantics change.
- Per-listing sync transactions continue on individual failure and increment
  result errors.
- Explicit product-link commands never create a composition or write
  `SellpiaInventorySku.currentStock`. `auto-match` may fill a null link/empty
  composition or recalculate one component quantity under the policy above.
- Wing catalog collection attaches provider media to the listing content
  workspace and refreshes only Channels-owned listing/option identities. It
  preserves existing product links and direct option compositions and never
  creates `MasterProduct` rows, changes physical stock, or infers quantities.
- Wing/Rocket use separate `ChannelAccount` rows (`coupang` / `rocket`); never
  infer a channel from an account display name.
- Wing and Rocket currently share one Coupang vendor identity even though their
  operational accounts remain separate rows. A Rocket publication checks both
  active primary Wing and selected Rocket `vendorId` values. Missing values may
  claim the single vendor identity from one complete authenticated Supplier Hub
  PO evidence run inside the account-scoped publication lock; any mismatch
  conflicts.
- Rocket PO publication replaces the account raw snapshot
  and prunes prior payload/lines while retaining `SourceImportRun` and Supply
  workbook evidence. It may publish identities/capacity, but never
  reserve, confirm, submit, mutate stock, or expose a history picker.

## Transitional Exceptions

- `adapters/coupang/` exists only for compatibility shims.
