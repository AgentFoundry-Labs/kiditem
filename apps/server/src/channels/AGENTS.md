# channels — Marketplace Sync And Reconciliation

Channels owns marketplace account settings, Coupang product/order/return sync,
listing reconciliation, and channel dashboard reads. Coupang provider calls are
isolated under `adapter/out/coupang/`.

Coupang provider access is hexagonal through `COUPANG_PROVIDER_PORT` and
`adapter/out/coupang/`. Dashboard raw SQL and some reconciliation services are
transitional; new provider APIs, retries, queues, or cross-domain writes require
ports/adapters instead of direct service expansion.

## Layout

```text
channels/
  channels.module.ts
  adapter/in/http/          channel listing/account, sync, dashboard, reconciliation controllers
  adapter/out/automation/   operation-alert consumer adapter
  adapter/out/coupang/      client, products/orders APIs, provider adapter
  application/port/out/     COUPANG_PROVIDER_PORT + operation-alert consumer port
  application/service/      account, sync, dashboard, reconciliation services
  adapters/coupang/orders.ts  compat shim only
```

Do not add new files under `adapters/coupang/` except compatibility shims.

## Provider Boundary

- Services depend on `COUPANG_PROVIDER_PORT`, not raw `fetch` or provider
  helper functions.
- Operation-alert lifecycle writes depend on `CHANNELS_OPERATION_ALERT_PORT`;
  controllers and services must not inject automation's `OperationAlertService`
  directly.
- `coupang-client.ts` owns HMAC auth, timeout, response validation, and vendor
  id resolution.
- Organization-specific credentials come from primary
  `ChannelAccount(channel='coupang')`. Server env must not provide Coupang
  vendor/access/secret fallback values.
- No adapter-level retry. Callers decide retry/queue semantics.

## Sync Contracts

- `syncProducts(organizationId)` refreshes existing `ChannelListing` /
  `ChannelListingOption` rows. It must not auto-create `MasterProduct`.
- `/api/channels/listings` is the registered-product read model for product
  pipeline screens. It lists active `ChannelListing` rows with
  `ChannelAccount` and `MasterProduct` context; it must not list
  registration/content workspaces.
- `ChannelListing.externalId` uniqueness is scoped by
  `(organizationId, channelAccountId, externalId)` for active rows. Do not add
  organization+channel global uniqueness; one organization can connect multiple
  accounts on the same marketplace channel.
- Channel-listing writers must carry `channelAccountId` when the marketplace
  account is known. Accountless legacy rows are read-compatible only; new sync
  or reconciliation paths must not create accountless `ChannelListing` rows.
- `syncOrders` and `syncReturns` write the channel-agnostic order spine:
  `Order`, `OrderLineItem`, `OrderReturn`, `OrderReturnLineItem` with
  `platform='coupang'` and provider IDs in external fields.
- `syncInventory()` remains a stub until InventoryService single-writer flow is
  explicitly designed.
- Per-listing transactions continue on individual failure and increment
  `result.errors`.
- Missing Coupang `vendorItemId` is fail-fast for option/order-line upsert
  because line identity cannot be proven.

Status mapping lives in `application/service/channel-sync.service.ts`:

| Coupang | Internal |
|---|---|
| `APPROVED`, `ON_SALE` | `active` |
| `SUSPEND` | `paused` |
| `DELETED` | `deleted` |
| `UNDER_EXAMINATION`, `REJECTED` | `draft` |
| unknown | lowercased raw value |

Add mapping tests when status semantics change.

## Dashboard Raw SQL

`channel-dashboard.service.ts` is a read-only transitional service with direct
`PrismaService` and `$queryRaw`.

- Use Prisma tagged templates only; no string concatenation.
- Bind `organizationId` as an organization predicate.
- For joins across tenant-owned tables, include organization predicates on each
  joined table that can leak cross-organization rows.
- Return summary semantics: `returnRate = matched returns / matched orders`,
  filtered by `Order.orderedAt`; orphan returns are a side metric only.

## Reconciliation

`channel-reconciliation.service.ts` connects Coupang rows to KidItem
`MasterProduct` / `ProductOption`.

- Never auto-create `MasterProduct`.
- Match order:
  1. active `ChannelListing` by `externalId`
  2. exact single active `ProductOption.legacyCode` as a review candidate unless
     a channel-account scoped listing can be proven
  3. conflict on master mismatch or multiple legacy-code candidates
  4. otherwise `needs_review`
  5. user link -> `manual`; user ignore -> `ignored`
- `coupang_image_sync` is the active UI/default source. Legacy/manual sources
  are replay-only.
- All single-resource reads/writes use `{ id, organizationId }`.

## Hard Bans

- Service-layer direct `fetch`/`coupangRequest`.
- Direct import of `adapter/out/coupang/*` from services except through
  `COUPANG_PROVIDER_PORT`.
- Raw status stored without normalization.
- Cross-organization dashboard queries.
- Coupang credential env fallback.
- Master/listing creation from sync without the reconciliation/admin flow.

## Verification

```bash
npm exec --workspace=apps/server -- vitest run src/channels
npm run build --workspace=apps/server
npm run dev:server
```

Use integration tests when changing order/return transactions, reconciliation
matching, or organization-scoped dashboard SQL.
