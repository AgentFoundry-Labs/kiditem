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
- Version-fenced deterministic recipe preview/apply commands for already-linked
  variants whose central recipe is still empty
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
- Wing publication may consume Products' transaction-aware provisioning port
  and conditionally fill still-null product/variant links in the same catalog
  publication transaction.
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
  -> InventoryAvailabilityPort common availability batch
  -> sellableStock = min(floor(component.availableStock / component.quantity))
```

Matching reads completed `coupang_wing_catalog` and `coupang_rocket_po_catalog`
rows plus product-detail chunks already atomically published by the running Wing
browser collection. An incomplete workbook import remains excluded, and only a
complete full snapshot may drive absence/deactivation reconciliation. Channels
owns candidate ranking and atomic product/variant link updates.
Candidate rows are live identity suggestions only and are never persisted or
auto-confirmed. Wing publication may reuse an existing Products identity only
from a unique, non-conflicting typed seller SKU or safely normalized typed
barcode; names, raw aliases, and AI never confirm an identity link.

Recipe automation keeps the separate, explicitly invoked account command for
operator reruns and review. In addition, a complete Rocket PO catalog
publication immediately runs the same deterministic policy, scoped only to
product groups containing options published by that collection, before Supply
reads capacity. The Rocket path recomputes fresh evidence server-side and
reports applied/review/blocked counts in the catalog response; incomplete or
vendor-mismatched collections never invoke it. The version-fenced preview
remains the operator command read model, and the web does not require a second
confirmation dialog. Channels may ask Products to create an empty central
`ProductVariantComponent` recipe when one linked variant selects one active
Sellpia SKU without conflict. Automatic evidence includes an exact code
or unique physical barcode that also passes product-name cross-checking, a
unique exact normalized name, or a unique high-confidence contained/fuzzy name
whose score and runner-up margin pass the domain thresholds. An explicit,
integer channel-pack to Sellpia-unit ratio may produce a positive quantity;
unverifiable multi-pack and BOM composition remain review-only. Safe child
variants are applied even when a sibling remains unresolved, and the product
row retains its review/blocked status. Neither entrypoint overwrites an existing
recipe. Duplicate identifiers, conflicting or close-ranked evidence, raw
aliases, and AI are never automatic.

A linked variant's confirmed recipe is the only capacity input. An unmatched,
configuration-required, or review-required
SKU has `sellableStock = null`; zero is reserved for a mapped recipe whose
available Sellpia component capacity is zero. Mixed recipes expose physical
stock, active commitments, available stock, component capacities, and
bottlenecks. Capacity is a read projection and never reserves or deducts
physical stock.

Matching state is derived from nullable links and linked-recipe validity. Do not
restore persisted `mappingStatus`. Recollection updates provider facts without
clearing confirmed product or variant links.

## Import + Matching APIs

- `POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing`
- `GET /api/channels/sku-availability`
- `GET /api/channels/product-mappings/recipe-automation/preview`
- `POST /api/channels/product-mappings/recipe-automation/apply`
- matching queue reads retain product and option relations, while the operator
  workspace groups option rows beneath their product;
- product link commands accept only nullable `masterProductId`;
- option link commands accept only nullable `productVariantId`.

Channel component replacement endpoints are not a final ownership surface.
Products owns complete recipe replacement and the narrow create-if-empty recipe
writer. Channels owns identity links and orchestrates the version-fenced,
explicit deterministic command through that Products port.

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
  inventory mutation, or special stock tables to this module.

## Transitional Exceptions

- `adapters/coupang/` exists only for compatibility shims.
