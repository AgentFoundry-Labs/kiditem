# channels — Marketplace Sync + SKU Matching

`src/channels/` owns marketplace accounts, listing/option metadata, Coupang
catalog/order/return sync, product/variant matching, channel sellable-capacity
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
- `ChannelListing.masterProductId` and
  `ChannelListingOption.productVariantId` are nullable confirmed identity links.
- A registration-created `ChannelListing.sourceCandidateId` is immutable
  provenance.
- Physical quantities come only from the linked Products-owned
  `ProductVariantComponent` recipe. Channels owns no recipe or stock table.
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
- Products transactionally creates or exactly reuses channel-origin products
  and variants. Channels writes only still-null links after organization and
  parent validation. A newer non-null manual link wins over stale registration
  intent and produces a conflict.

## Catalog, Matching, And Capacity Contract

- Matching reads completed Wing/Rocket catalogs plus product-detail chunks
  already atomically published by a running Wing collection. Only a complete
  full snapshot may drive absence or deactivation reconciliation.
- Candidate rows are live evidence and are never persisted or auto-confirmed.
  Catalog publication may reuse identity only from unique, non-conflicting typed
  seller-SKU or safely normalized physical-barcode evidence; names, raw aliases,
  and AI never confirm product or variant identity.
- Matching has one explicit version-fenced recipe command. It may create an
  empty central recipe with one active Sellpia SKU and the policy's verified
  positive integer channel-to-Sellpia pack ratio. It never overwrites an
  existing recipe or changes identity links.
- Automatic recipe evidence must be unique and non-conflicting. Name-compatible
  exact identifiers, unique exact names, and contained/fuzzy names that clear
  the policy thresholds may apply; unverifiable pack/BOM evidence, incompatible
  names, ambiguity, conflicts, close-ranked names, raw aliases, and AI require
  review. Read
  [`docs/runbooks/channel-sellpia-matching.md`](../../../../docs/runbooks/channel-sellpia-matching.md)
  before changing this policy or its operator workflow.
- Safe children apply independently while unresolved siblings remain under
  review. A complete Rocket publication invokes the same policy only for product
  groups published by that collection; incomplete or vendor-mismatched
  collections never invoke it.
- Confirmed recipes are the only capacity input. Unmatched, invalid, or
  review-required SKUs return `sellableStock = null`; zero means a valid recipe
  whose available component capacity is zero. Capacity exposes physical stock,
  active commitments, available stock, component capacities, and bottlenecks
  without reserving or writing stock.
- Matching state derives from nullable links and recipe validity. Do not restore
  persisted `mappingStatus`; recollection updates provider facts without clearing
  confirmed links.

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
- Status normalization lives in `domain/coupang-normalization.ts`; change its
  tests with semantics. Per-listing sync continues after individual failures and
  increments result errors.
- Wing publication may attach provider media, call Products provisioning, and
  fill still-null links in one transaction. It preserves confirmed links,
  content selection, recipes, physical stock, and quantities.
- Wing and Rocket channels are never inferred from display names. Their vendor
  IDs must agree; a missing value may claim the one vendor identity only from a
  complete authenticated Supplier Hub run under the publication lock.
- Rocket publication may publish identities and capacity previews. Reservation,
  confirmation, provider submission, physical-stock mutation, and special stock
  tables remain outside Channels.

## Transitional Exceptions

- `adapters/coupang/` exists only for compatibility shims.
