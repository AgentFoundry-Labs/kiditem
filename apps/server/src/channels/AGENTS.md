Consult this document first instead of relying on memorized knowledge.

# channels — Marketplace Sync + SKU Matching

`src/channels/` owns marketplace account settings, Coupang product/order/return
sync, Sellpia component matching, and channel dashboard reads. Provider calls are
isolated behind the Coupang provider adapter.

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
- Coupang product, order, return, and inventory sync entrypoints
- Registered-product listing read model: `/api/channels/listings`
- Channel SKU component matching: `/api/channels/sku-mappings/*`
- Channel dashboard read APIs

## Main Data Models

- `ChannelAccount` is the marketplace/store identity.
- In release `0.1.8`, logical `ChannelProduct` keeps the Prisma compatibility
  name `ChannelListing` and physical table `channel_listings`.
- In release `0.1.8`, logical `ChannelSku` keeps the Prisma compatibility name
  `ChannelListingOption` and physical table `channel_listing_options`. It
  stores marketplace SKU metadata and advisory matching status; its legacy
  `optionId` is not matching truth.
- `ChannelSkuComponent` is the confirmed mapping from one marketplace SKU to
  one or more Sellpia `InventorySku` rows and quantities.
- Channel daily snapshots and scrape audit rows support dashboard/reporting
  reads.
- Orders and returns sync into the channel-agnostic orders spine.

## Sync + Matching Flow

```text
Coupang provider
  -> COUPANG_PROVIDER_PORT
  -> sync application service
  -> channel repository ports
  -> ChannelListing / ChannelListingOption / Order / Return rows
  -> completed catalog SKU queue
  -> live InventorySku evidence/candidate reads
  -> operator-confirmed ChannelSkuComponent recipe
```

Sellpia component matching reads only completed `coupang_wing_catalog` rows.
Channels owns candidate ranking and atomic component replacement; Inventory
owns the exported read-only `INVENTORY_SKU_READ_PORT`. Candidate rows are live
suggestions only and are never persisted or auto-confirmed.

## Fixed Import + Matching APIs

- `POST /api/channels/accounts/:channelAccountId/catalog-imports/coupang-wing`
- `GET /api/channels/sku-mappings`
- `POST /api/channels/sku-mappings/status-refresh`
- `GET /api/channels/sku-mappings/:channelSkuId/candidates`
- `PUT /api/channels/sku-mappings/:channelSkuId/components`

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
  `CHANNELS_INVENTORY_SKU_READ_PORT` bridge to Inventory's owner port.

## Boundary Rules

- Services do not call raw `fetch`, `coupangRequest`, or adapter helpers
  directly.
- Organization-specific Coupang credentials come from primary
  `ChannelAccount(channel='coupang')`; server env must not be a credential
  fallback.
- New sync/matching paths must carry `channelAccountId` and must not
  create accountless `ChannelListing` rows.
- Dashboard SQL uses Prisma tagged templates and binds organization predicates
  on every tenant-owned table in the join path.
- Status mapping lives in `domain/coupang-normalization.ts`; add tests when
  semantics change.
- Per-listing sync transactions continue on individual failure and increment
  result errors.
- Confirmed ChannelSku component replacement validates tenant ownership before
  deletion, then locks, deletes, recreates, and updates status atomically. It
  never writes `InventorySku.reportedStock` or legacy inventory balances.
- Coupang image synchronization is a separate media workflow. It does not
  create, refresh, or confirm ChannelSku matching rows.
- Rocket catalog ingestion, purchase-order decisions, and order processing are
  outside the `0.1.8` matching surface. A future Rocket account uses
  `channel='rocket'`; never infer Wing or Rocket from the account name.

## Transitional Exceptions

- `adapters/coupang/` exists only for compatibility shims.
- `syncInventory()` remains a stub until the inventory single-writer flow is
  explicitly designed.
