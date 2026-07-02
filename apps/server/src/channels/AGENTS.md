Consult this document first instead of relying on memorized knowledge.

# channels — Marketplace Sync + Reconciliation

`src/channels/` owns marketplace account settings, Coupang product/order/return
sync, listing reconciliation, and channel dashboard reads. Provider calls are
isolated behind the Coupang provider adapter.

## Folder Map

```text
channels/
├── channels.module.ts
├── adapter/in/http/          # listing/account, sync, dashboard, reconciliation controllers
├── adapter/out/
│   ├── automation/           # operation-alert adapter
│   ├── coupang/              # HMAC client, provider APIs, provider adapter
│   └── repository/           # Prisma/raw-SQL repository adapters
├── application/
│   ├── port/out/             # provider, operation-alert, repository ports
│   └── service/              # sync/reconcile orchestration
├── domain/                   # pure credential and normalization helpers
└── adapters/coupang/         # compatibility shims only
```

## Owned Surfaces

- Channel account/listing APIs under `/api/channels/*`
- Coupang product, order, return, and inventory sync entrypoints
- Registered-product listing read model: `/api/channels/listings`
- Reconciliation APIs under `/api/channels/reconciliation/*`
- Channel dashboard read APIs

## Main Data Models

- `ChannelAccount` is the marketplace/store identity.
- `ChannelListing` connects marketplace products to `MasterProduct`.
- `ChannelListingOption` connects marketplace option rows to `ProductOption`.
- Channel daily snapshots and scrape audit rows support dashboard/reporting
  reads.
- Orders and returns sync into the channel-agnostic orders spine.

## Sync + Reconciliation Flow

```text
Coupang provider
  -> COUPANG_PROVIDER_PORT
  -> sync application service
  -> channel repository ports
  -> ChannelListing / ChannelListingOption / Order / Return rows
  -> reconciliation service links unresolved rows to products/options
```

Reconciliation never auto-creates `MasterProduct`. User-approved links create
the missing `ChannelListing`/option association through the reconciliation
flow.

## Cross-Domain Ports

- Provider access goes through `COUPANG_PROVIDER_PORT`.
- Operation-alert lifecycle writes go through
  `CHANNELS_OPERATION_ALERT_PORT`.
- Orders/returns are written to the order spine; provider actions should be
  exposed through channels-owned ports/adapters instead of direct provider HTTP
  from orders services.

## Boundary Rules

- Services do not call raw `fetch`, `coupangRequest`, or adapter helpers
  directly.
- Organization-specific Coupang credentials come from primary
  `ChannelAccount(channel='coupang')`; server env must not be a credential
  fallback.
- New sync/reconciliation paths must carry `channelAccountId` and must not
  create accountless `ChannelListing` rows.
- Dashboard SQL uses Prisma tagged templates and binds organization predicates
  on every tenant-owned table in the join path.
- Status mapping lives in `domain/coupang-normalization.ts`; add tests when
  semantics change.
- Per-listing sync transactions continue on individual failure and increment
  result errors.

## Transitional Exceptions

- `adapters/coupang/` exists only for compatibility shims.
- `syncInventory()` remains a stub until the inventory single-writer flow is
  explicitly designed.
