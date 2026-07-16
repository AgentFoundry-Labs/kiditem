Consult this document first instead of relying on memorized knowledge.

# channels — Marketplace Sync + SKU Matching

`src/channels/` owns marketplace account settings, marketplace product/option
metadata, Coupang order/return sync, product/variant matching, channel option
sellable-capacity projections, account-scoped product registration, and channel
dashboard reads. Provider calls are isolated behind provider adapters.

## Folder Map

```text
channels/
├── channels.module.ts
├── adapter/in/http/          # listing/account, sync, dashboard, SKU-matching controllers
├── adapter/out/
│   ├── automation/           # operation-alert adapter
│   ├── coupang/              # HMAC client, provider APIs, provider adapter
│   └── repository/           # Prisma/raw-SQL repository adapters
├── application/
│   ├── port/out/             # provider, operation-alert, repository ports
│   └── service/              # sync/matching orchestration
├── domain/                   # pure credential and normalization helpers
└── adapters/coupang/         # compatibility shims only
```

## Owned Surfaces

- Channel account/listing APIs under `/api/channels/*`
- Coupang product, order, and return sync entrypoints
- Registered-product listing read model: `/api/channels/listings`
- Channel product and option matching capabilities
- Channel SKU availability: `GET /api/channels/sku-availability`
- Channel dashboard read APIs
- The `CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT` consumed by Sourcing
  for account-scoped submission, reconciliation, and listing resolution

## Main Data Models

- `ChannelAccount` is the marketplace/store identity.
- Logical `ChannelProduct` uses the existing Prisma name `ChannelListing` and
  physical table `channel_listings`.
- Logical `ChannelSku` uses the existing Prisma name `ChannelListingOption` and
  physical table `channel_listing_options`. It stores independent metadata for
  one SKU in one `ChannelAccount`; `optionId` is not inventory matching truth.
- `ChannelListing.masterProductId` and
  `ChannelListingOption.productVariantId` are nullable confirmed links.
- Physical component quantities come only from the linked
  `ProductVariantComponent` recipe; Channels owns no recipe table.
- Channel daily snapshots and scrape audit rows support dashboard/reporting
  reads.
- A registration-created `ChannelListing.sourceCandidateId` is immutable
  provenance. Registration resolves identity by organization, account, and
  external listing ID without creating a `MasterProduct`.

## Product Registration Flow

```text
frozen ProductPreparation submission
  -> account-specific provider credentials
  -> reconcile recorded provider result before create
  -> provider call outside the database transaction
  -> resolve/reactivate ChannelListing in the sourcing finalization transaction
  -> preserve recipe/content metadata and attach immutable sourceCandidateId
```

Missing or inactive `ChannelAccount` is an explicit error. Provider calls and
listing identity are scoped to the selected account; primary-account lookup is
only for legacy callers that omit an account.
For Coupang, the frozen submission key is the first item's
`externalVendorSku`; retries query the provider by that key and never issue a
second create while the prior outcome is uncertain.
Each frozen option index receives a deterministic `externalVendorSku`. A
KidItem-first provisional option keeps that key in `sellerSku`; product-detail
collection promotes the same row to Coupang's immutable `vendorItemId` under
the shared listing row lock, preserving its confirmed variant link. If a full
catalog publication created the actual option first and inactivated the
provisional row, detail sync may transfer the link only from one
organization/listing/source-fenced provisional with that deterministic key.
Multiple candidates are an explicit sync error; the system never guesses.
If registration finalization observes a different non-null product or variant
link confirmed by the manual path, it fails with a conflict and preserves the
newer manual confirmation instead of applying stale registration intent.
- Orders and returns sync into the channel-agnostic orders spine.

## Sync + Matching Flow

```text
Coupang provider
  -> COUPANG_PROVIDER_PORT
  -> sync application service
  -> channel repository ports
  -> ChannelListing / ChannelListingOption / Order / Return rows
  -> completed catalog SKU queue
  -> product and variant evidence/candidate reads
  -> operator-confirmed product and variant links
  -> linked ProductVariantComponent recipe
  -> sellableStock = min(floor(component.currentStock / component.quantity))
```

Matching reads completed `coupang_wing_catalog` and `coupang_rocket_po_catalog`
rows. Channels owns candidate ranking and atomic product/variant link updates.
Candidate rows are live suggestions only and are never persisted or
auto-confirmed; normalized names, barcodes, rank, and AI are evidence only.

A linked variant's confirmed recipe is the only capacity input. An unmatched,
configuration-required, or review-required
SKU has `sellableStock = null`; zero is reserved for a mapped recipe whose
current Sellpia component capacity is zero. Mixed recipes expose all component
capacities and bottlenecks. Capacity is a read projection and never reserves or
deducts stock.

Matching state is derived from nullable links and linked-recipe validity. Do not
restore persisted `mappingStatus`. Recollection updates provider facts without
clearing confirmed product or variant links.

## Import + Matching APIs

- `POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing`
- `GET /api/channels/sku-availability`
- matching queue reads expose product-level and option-level rows separately;
- product link commands accept only nullable `masterProductId`;
- option link commands accept only nullable `productVariantId`.

Channel component replacement endpoints are not a final ownership surface.
Products owns complete recipe replacement; Channels only confirms or clears
product and variant links.

## Cross-Domain Ports

- Provider access goes through `COUPANG_PROVIDER_PORT`.
- Operation-alert lifecycle writes go through
  `CHANNELS_OPERATION_ALERT_PORT`.
- Orders/returns are written to the order spine; provider actions should be
  exposed through channels-owned ports/adapters instead of direct provider HTTP
  from orders services.
- Sellpia candidate evidence uses a Channels-local anti-corruption bridge to
  Inventory's physical `SellpiaInventorySku` read capability.
- `ChannelsModule` exports `CHANNEL_SKU_AVAILABILITY_PORT` for server consumers
  that need the same nullable capacity projection.
- `ChannelsModule` exports `ROCKET_PO_CATALOG_PORT` for Supply to validate a
  complete, account/vendor-scoped collection and publish its identities before
  resolving the common ChannelSku availability projection.
- `ChannelsModule` exports
  `CHANNELS_MARKETPLACE_REGISTRATION_CAPABILITY_PORT`; consumers must use that
  incoming capability instead of importing the registration service.

## Boundary Rules

- Services do not call raw `fetch`, `coupangRequest`, or adapter helpers
  directly.
- Organization-specific Coupang credentials come from primary
  `ChannelAccount(channel='coupang')`; server env must not be a credential
  fallback.
- New sync/matching paths must carry `channelAccountId` and must not
  create accountless `ChannelListing` rows.
- Registration retries reconcile recorded provider identity/submission result
  before create, and listing resolution must run inside the caller-supplied
  finalization transaction.
- Dashboard SQL uses Prisma tagged templates and binds organization predicates
  on every tenant-owned table in the join path.
- Status mapping lives in `domain/coupang-normalization.ts`; add tests when
  semantics change.
- Per-listing sync transactions continue on individual failure and increment
  result errors.
- Product and option link commands validate tenant ownership and parent-child
  consistency atomically. They never create a recipe or write
  `SellpiaInventorySku.currentStock`.
- Wing catalog collection attaches provider media to the listing content
  workspace. It preserves existing content selection and never creates,
  refreshes, or confirms product links, variant links, or component recipes.
- Wing and Rocket are separate `ChannelAccount` rows (`channel='coupang'` and
  `channel='rocket'`). Never infer the channel from an account display name.
- Rocket purchase-order collection may publish completed account-scoped
  `ChannelProduct`/`ChannelSku` identities and calculate component-capacity
  previews. It must not add reservation, confirmation, provider submission,
  inventory mutation, or special stock tables to this module.

## Transitional Exceptions

- `adapters/coupang/` exists only for compatibility shims.
