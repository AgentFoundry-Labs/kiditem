Consult this document first instead of relying on memorized knowledge.

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
- Registration resolves identity by organization, account, and external listing
  ID without creating a `MasterProduct`. Listing resolution/reactivation
  preserves recipe and content metadata and attaches the immutable
  `sourceCandidateId`.

## Catalog, Matching, And Capacity Contract

- Matching reads completed Wing/Rocket catalogs plus product-detail chunks
  already atomically published by a running Wing collection. An incomplete
  workbook import stays excluded, and only a complete full snapshot may drive
  absence or deactivation reconciliation.
- Candidate rows are live evidence and are never persisted or auto-confirmed.
  Catalog publication may reuse identity only from unique, non-conflicting typed
  seller-SKU or safely normalized physical-barcode evidence; names, raw aliases,
  and AI never confirm product or variant identity.
- Matching has one explicit version-fenced recipe command. It may create an
  empty central recipe with one active Sellpia SKU and the policy's verified
  positive integer channel-to-Sellpia pack ratio. It never overwrites an
  existing recipe or changes identity links.
- Automatic recipe evidence must be unique and non-conflicting. Exact
  identifiers/names or threshold-clearing names may apply; incompatible,
  ambiguous, unverifiable, raw-alias, and AI evidence requires review. Read
  [`docs/runbooks/channel-sellpia-matching.md`](../../../../docs/runbooks/channel-sellpia-matching.md)
  before changing this policy or its operator workflow.
- Safe children apply independently. Complete, vendor-matched Rocket
  publication may invoke the same server-recomputed policy for its published
  groups; incomplete/mismatched collections may not.
- Confirmed recipes alone drive capacity. Invalid/review-required SKUs return
  `null`; zero means valid capacity is exhausted. Reads never reserve stock.
- Matching state derives from nullable links and recipe validity. Do not restore
  persisted `mappingStatus`; recollection updates provider facts without clearing
  confirmed links.
- Common availability resolves as
  `sellableStock = min(floor(component.availableStock / component.quantity))`
  over the linked recipe components.

## Listing Deletion Contract

- Actor-bound `ChannelListingDeletionOperation` is persisted under the scoped
  listing lock before browser mutation and owns authorization/uncertainty.
- Extension evidence (including DOM/meta/URL identity) is not server-verifiable:
  keep `reconciling/uncertain` and the listing active until an independent
  provider verifier confirms deletion. Succeeded deletion fences reactivation.

## Import + Matching APIs

- `POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing`
- `GET /api/channels/sku-availability`
- `GET /api/channels/product-mappings/recipe-automation/preview`
- `POST /api/channels/product-mappings/recipe-automation/apply`
- Matching queue reads retain product and option relations, while the operator
  workspace groups option rows beneath their product.
- Product link commands accept only nullable `masterProductId`; option link
  commands accept only nullable `productVariantId`.

Channel component replacement endpoints are not a final ownership surface.
Products owns complete recipe replacement and the narrow create-if-empty recipe
writer. Channels owns identity links and orchestrates the version-fenced,
explicit deterministic command through that Products port.

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
- Product and option link commands validate tenant ownership and parent-child
  consistency atomically. They never create a recipe or write
  `SellpiaInventorySku.currentStock`; only the separate version-fenced recipe
  automation command may invoke Products' create-if-empty writer under the
  deterministic policy above.
- Wing catalog collection attaches provider media to the listing content
  workspace. In the same publication transaction it may call Products to
  create/reuse channel-origin identities, then write only still-null listing
  and option links after tenant and parent validation. It preserves existing
  links and content selection and never creates or changes component recipes,
  physical stock, or inferred quantities.
- Wing and Rocket are separate `ChannelAccount` rows (`channel='coupang'` and
  `channel='rocket'`). Never infer the channel from an account display name.
- Wing and Rocket currently share one Coupang vendor identity even though their
  operational accounts remain separate rows. A Rocket publication checks both
  active primary Wing and selected Rocket `vendorId` values. Missing values may
  claim the single vendor identity from one complete authenticated Supplier Hub
  PO evidence run inside the account-scoped publication lock; any non-empty
  mismatch remains a conflict.
- Rocket purchase-order collection may publish completed account-scoped
  `ChannelProduct`/`ChannelSku` identities and calculate component-capacity
  previews. It must not add reservation, confirmation, provider submission,
  inventory mutation, physical-stock mutation, or special stock tables to this
  module.

## Transitional Exceptions

- `adapters/coupang/` exists only for compatibility shims.
