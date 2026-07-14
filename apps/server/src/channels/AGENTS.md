Consult this document first instead of relying on memorized knowledge.

# channels — Marketplace Sync + SKU Matching

`src/channels/` owns marketplace account settings, marketplace product/SKU
metadata, Coupang order/return sync, Sellpia component matching, channel SKU
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
- Channel SKU component matching: `/api/channels/sku-mappings/*`
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
- `ChannelSkuComponent` is the confirmed mapping from one marketplace SKU to
  one or more physical Sellpia `MasterProduct` rows with the exact positive quantity
  consumed by one sale.
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
- Orders and returns sync into the channel-agnostic orders spine.

## Sync + Matching Flow

```text
Coupang provider
  -> COUPANG_PROVIDER_PORT
  -> sync application service
  -> channel repository ports
  -> ChannelListing / ChannelListingOption / Order / Return rows
  -> completed catalog SKU queue
  -> live physical MasterProduct evidence/candidate reads
  -> operator-confirmed ChannelSkuComponent recipe
  -> sellableStock = min(floor(component.currentStock / component.quantity))
```

Sellpia component matching reads only completed `coupang_wing_catalog` rows.
Channels owns candidate ranking and atomic component replacement; Inventory
owns the exported read-only `SELLPIA_MASTER_PRODUCT_READ_PORT`. Candidate rows
are live suggestions only and are never persisted or auto-confirmed.

A confirmed recipe is the only capacity input. An unmapped or review-required
SKU has `sellableStock = null`; zero is reserved for a mapped recipe whose
current Sellpia component capacity is zero. Mixed recipes expose all component
capacities and bottlenecks. Capacity is a read projection and never reserves or
deducts stock.

## Fixed Import + Matching APIs

- `POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing`
- `GET /api/channels/sku-mappings`
- `POST /api/channels/sku-mappings/status-refresh`
- `GET /api/channels/sku-mappings/:channelSkuId/candidates`
- `PUT /api/channels/sku-mappings/:channelSkuId/components`
- `GET /api/channels/sku-availability`

`PUT .../components` replaces the complete recipe. A nonempty recipe is
confirmed truth; an empty recipe is the explicit unmap operation. See the
[operator runbook](../../../../docs/runbooks/channel-sellpia-matching.md) for
the supported workflow and verification counts.

## Cross-Domain Ports

- Provider access goes through `COUPANG_PROVIDER_PORT`.
- Operation-alert lifecycle writes go through
  `CHANNELS_OPERATION_ALERT_PORT`.
- Orders/returns are written to the order spine; provider actions should be
  exposed through channels-owned ports/adapters instead of direct provider HTTP
  from orders services.
- Sellpia candidate reads use the Channels-local
  `CHANNELS_SELLPIA_MASTER_PRODUCT_READ_PORT` anti-corruption bridge to
  Inventory's physical MasterProduct owner port.
- `ChannelsModule` exports `CHANNEL_SKU_AVAILABILITY_PORT` for server consumers
  that need the same nullable capacity projection.
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
- Confirmed ChannelSku component replacement validates tenant ownership before
  deletion, then locks, deletes, recreates, and updates status atomically. It
  never writes `MasterProduct.currentStock`.
- Wing catalog collection attaches provider media to the listing content
  workspace. It preserves existing content selection and never creates,
  refreshes, or confirms ChannelSku component recipes.
- Wing and Rocket are separate `ChannelAccount` rows (`channel='coupang'` and
  `channel='rocket'`). Never infer the channel from an account display name.
- Rocket purchase-order quantity decisions are deferred. Do not add Rocket
  reservation, confirmation, inventory mutation, or special stock tables to
  this module; future Rocket SKU metadata uses the same account-scoped
  `ChannelProduct`/`ChannelSku`/`ChannelSkuComponent` model.

## Transitional Exceptions

- `adapters/coupang/` exists only for compatibility shims.
