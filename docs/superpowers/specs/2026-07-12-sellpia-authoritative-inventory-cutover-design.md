# Sellpia-Authoritative Inventory Cutover Design

## Status

Approved in the design conversation on 2026-07-12. Written-spec review is
pending before implementation planning.

This design extends the approved channel and Sellpia SKU matching design. It
replaces the temporary dual-inventory compatibility state with one inventory
truth while preserving useful operator routes and screen concepts.

## Context

KidItem currently has two incompatible inventory models:

- `InventorySku.reportedStock` is copied from a completed Sellpia workbook
  import and is already used by channel SKU matching;
- legacy `Inventory.currentStock` is linked one-to-one to `ProductOption` and
  is mutated by receipt, issue, adjustment, reservation, Rocket, and bundle
  workflows.

The inventory status screen, stock analysis screen, product projections,
dashboard, automation, and Rocket flows still read the legacy model. A Sellpia
import therefore does not update the inventory numbers shown across KidItem.

The business decision is now explicit:

> The most recently completed Sellpia inventory workbook is KidItem's only
> inventory quantity source. KidItem does not independently adjust stock.

Marketplace products remain independent channel metadata. Their relationship
to physical Sellpia inventory is defined only by `ChannelSkuComponent` rows.

## Goals

- Make the latest completed Sellpia snapshot the only current-stock truth.
- Keep existing user-facing inventory routes and useful screen concepts, but
  replace their data sources and behavior.
- Reuse established schema names when the new field has the same meaning.
- Calculate channel SKU availability from confirmed component recipes.
- Remove every executable path that mutates a separate KidItem stock balance.
- Remove legacy schema and contracts after all consumers have switched.
- Preserve historical business records that remain useful without treating
  them as stock truth.

## Non-goals

- Reconstructing historical receipt and issue events from Sellpia snapshots.
- Inferring why Sellpia stock changed.
- Adding safety-stock, reorder-point, reservation, or reconciliation logic.
- Making procurement or Rocket purchase-order decisions in this cutover.
- Uploading stock from KidItem back to Sellpia or a marketplace.
- Allocating Sellpia stock between marketplaces or reserving it for orders.

## Core Invariants

1. `InventorySku.currentStock` equals the value from the latest completed
   Sellpia full-snapshot import.
2. Only the Sellpia full-snapshot importer may write
   `InventorySku.currentStock`.
3. A channel mapping, order, return, transfer, picking action, Rocket action,
   or UI control never changes current stock.
4. `ChannelSkuComponent` remains the only confirmed channel-SKU-to-Sellpia-SKU
   recipe.
5. A screen may derive a projection from the current snapshot, but the
   projection is not another stored stock balance.
6. If the latest complete workbook omits a previously known Sellpia product
   code, that identity is retained for referential integrity and its current
   stock becomes zero.
7. KidItem does not present snapshot differences as verified receipt or issue
   events because Sellpia does not provide that causality.

## Target Data Model

### InventorySku

`InventorySku` remains one physical Sellpia product-code row per organization.
The stock property is renamed from `reportedStock` to the established
`currentStock` name because the value is the authoritative current quantity,
not a secondary report to reconcile.

```text
id                  UUID
organizationId      UUID
sellpiaProductCode  String
name                String
optionName          String?
barcode             String?
currentStock        Int
purchasePrice       Int?
salePrice           Int?
rawJson             Json?
lastImportRunId     UUID?
createdAt           Timestamptz
updatedAt           Timestamptz
```

Rules:

- keep unique `(organizationId, sellpiaProductCode)`;
- keep non-unique barcode behavior;
- map the Prisma property to physical column `current_stock`;
- rebuild the development database from the target schema instead of carrying
  forward the temporary `reported_stock` compatibility column;
- current stock and non-null prices are non-negative;
- `lastImportRunId` identifies the import that last updated or zeroed the row;
- no ProductOption, reservation, warehouse balance, or reorder relation is
  added.

### Naming Reuse

Reuse names only when meaning remains the same:

| Decision | Fields |
|---|---|
| Keep | `id`, `organizationId`, `name`, `optionName`, `barcode`, price fields, `createdAt`, `updatedAt` |
| Rename and reuse | `InventorySku.reportedStock` -> `InventorySku.currentStock` |
| Keep as new source identity | `sellpiaProductCode`, `lastImportRunId`, `rawJson` |
| Retire | `optionId`, `reservedStock`, `safetyStock`, `reorderPoint`, `reorderQuantity`, `dailySalesAvg`, `warehouseLocation`, `lastRestockedAt` |

The legacy `Inventory` model is not repurposed. Its ProductOption identity,
mutation semantics, and foreign keys would make the new model appear to support
behaviors that no longer exist.

### Channel Availability Projection

For a matched channel SKU, current sellable capacity is calculated at read
time:

```text
sellableStock = min(floor(component.inventorySku.currentStock / component.quantity))
```

Examples:

```text
single:       X stock 12, quantity 1              -> 12
eight-pack:   X stock 80, quantity 8              -> 10
mixed bundle: X stock 12, quantity 1; Y 9, qty 2  -> 4
```

An unmatched or needs-review channel SKU has no authoritative sellable-stock
projection. The API returns a mapping status instead of inventing zero.

The projection does not reserve or divide inventory between channels. Two
channel SKUs mapped to the same physical SKU each show capacity against the
same latest Sellpia snapshot.

## Import Behavior

The existing atomic full-snapshot behavior remains:

1. Parse and validate the complete workbook before writes.
2. Claim an organization-scoped idempotent `SourceImportRun`.
3. Upsert each Sellpia code and replace normalized metadata and current stock.
4. Set previously known codes absent from the file to zero without deleting
   them or their channel-component references.
5. Mark the import completed in the same transaction.
6. Invalidate every current-snapshot and derived-availability query in the web
   client after success.

A duplicate completed file returns its existing import result and does not
create a second snapshot mutation.

## Read APIs

Inventory owns a paginated, organization-scoped current-snapshot read:

```text
GET /api/inventory/sellpia-skus
  ?page=
  &limit=
  &query=
  &stockStatus=all|in_stock|out_of_stock
```

The response includes:

- Sellpia code, name, option, and barcode;
- `currentStock`, purchase price, and sale price;
- last import identifier and timestamp;
- stable product-code ordering;
- page, limit, and total.

Channels owns the mapping-aware read projection. It extends the existing
channel SKU mapping list with current sellable capacity and component current
stock. No inventory write capability is exported to Channels.

Import-run history is read from `SourceImportRun`. It shows file name, status,
row count, and completion time. It does not claim that a stock delta was a
receipt or issue.

## Screen Cutover

The product decision is **preserve the route and operator destination, replace
the implementation**. Legacy React components may be deleted when their
behavior is obsolete; the corresponding useful screen is rebuilt on the new
read contracts.

### `/inventory-hub`

- **재고 현황**: paginated `InventorySku` current snapshot with search and
  in-stock/out-of-stock filters.
- **Sellpia 재고 가져오기**: existing full-snapshot importer; success refreshes
  every dependent view immediately.
- **가져오기 이력**: completed, running, and failed Sellpia `SourceImportRun`
  rows.
- **재고자산**: read-only `currentStock * purchasePrice`; null purchase prices
  are listed as unpriced and excluded from valued totals.
- Mutation-oriented receipt, issue, adjustment, reservation, and Rocket manual
  stock controls are removed. Their screen positions may be renamed and
  rebuilt for the current-snapshot views above.
- The purchase-order screen remains a Supply capability, but this cutover does
  not use current stock to recommend or confirm an order.

### `/stock-ops`

The route and navigation entry remain. Its legacy projections are replaced by
current, explainable views:

- Sellpia SKUs with zero current stock;
- matched channel SKUs with zero sellable capacity;
- component bottlenecks for multipacks and mixed bundles;
- unmatched and needs-review channel SKUs;
- current stock value and unpriced inventory summaries;
- import freshness and failed-import warnings.

Dead-stock, retention, and zero-sales claims are not shown until mapped order
history is designed. Current stock alone cannot prove those concepts.

### Other Inventory-Facing Screens

- Product and channel screens show mapping status or channel sellable capacity,
  not a ProductOption-owned balance.
- Advertising may consume channel sellable capacity for the exact channel SKU;
  it does not read ProductOption bundle stock.
- Dashboard and automation replace reorder-point alerts with import freshness,
  out-of-stock, and mapping-attention projections. Procurement suggestions stay
  absent until separately designed.
- Warehouse transfer, return-transfer, and picking records that remain useful
  identify `InventorySku` rather than `ProductOption`. They record operations
  only and never mutate current stock.
- Rocket inventory screens use a Rocket `ChannelAccount`, parent
  `ChannelProduct`, option `ChannelSku`, and confirmed components. Old Rocket
  reservation and stock-ledger actions are removed.
- Order collection may later resolve ordered ChannelSku recipes against the
  latest snapshot. This cutover does not decide procurement quantities.

## Legacy Retirement

Retirement happens only after a regression gate proves no production consumer
still uses the legacy contract.

Remove:

- `Inventory`, `StockTransaction`, and `RocketInventoryLedger` models;
- obsolete Sellpia reconciliation snapshot and candidate models;
- ProductOption bundle-stock fields and the legacy bundle stock materializer;
- inventory receive, issue, adjust, metadata, transaction, asset, and Rocket
  mutation controllers and ports;
- shared contracts for legacy inventory balances, mutations, transactions,
  reconciliation, and Rocket inventory events;
- frontend hooks, dialogs, projections, and API wrappers backed by those
  contracts;
- tests that assert retired behavior, replacing them with cutover regression
  tests.

Do not remove merely because it is located in the inventory domain:

- `SourceImportRun` and Sellpia import provenance;
- `InventorySku` and channel components;
- Warehouse identity and operational records that remain valid after their
  item relation is migrated;
- fulfillment and return records that do not claim to own current stock;
- Sellpia receipt-upload records if they remain part of an external upload
  workflow.

## Migration Strategy

This is one cohesive reconstruction with three implementation phases and one
final cross-phase review, rather than many overlapping micro-reviews.

### Phase 1: Owner Contract and Current Snapshot

- rename the InventorySku Prisma/API property and physical column to
  `currentStock` / `current_stock`;
- add shared current-snapshot and import-run read contracts;
- add tenant-scoped paginated Inventory reads;
- add mapping-aware channel availability projection;
- add regression gates that forbid new legacy stock consumers.

### Phase 2: Consumer and Screen Cutover

- rebuild `/inventory-hub` and `/stock-ops` on the new reads;
- update product, advertising, analytics, automation, order, finance, return,
  transfer, picking, and Rocket consumers as specified above;
- remove all UI mutation controls and invalidate projections after import;
- retain routes and navigation destinations.

### Phase 3: Contract and Schema Removal

- prove the legacy consumer count is zero;
- remove legacy services, controllers, ports, policies, shared schemas, and
  frontend code;
- migrate or remove legacy foreign keys;
- remove the retired models, tables, and columns from the target development
  schema;
- update architecture, ERD, runbooks, and schema guards.

The release migration must preserve Sellpia InventorySku identities,
ChannelSkuComponent recipes, current quantities, source import runs, and
historical business records selected for retention.

## Error Handling

- A malformed or incomplete Sellpia workbook fails before snapshot writes.
- A failed import leaves the previous completed snapshot visible.
- A list read is always organization-scoped and rejects invalid page, limit, or
  stock-status values.
- A channel availability response distinguishes unmatched mapping from genuine
  zero capacity.
- A missing component target is an integrity error, not zero stock.
- Null purchase price produces an explicit unpriced state, not a zero-valued
  unit price.
- UI loading, empty, failed-import, stale-import, and no-active-channel states
  are distinct.

## Verification

### Contract and Database

- the clean target schema contains `inventory_skus.current_stock` and does not
  contain `inventory_skus.reported_stock`;
- one valid Sellpia code remains one InventorySku;
- importing the approved workbook produces 1,964 current snapshot rows in a
  clean organization;
- absent known codes become zero without deleting component recipes;
- no non-import path can update `InventorySku.currentStock`;
- every single-resource and list read is organization-scoped;
- legacy inventory models and tables are absent after the development reset.

### Availability

- single, same-SKU multipack, and mixed-bundle formulas return expected
  capacities;
- zero component stock yields zero capacity;
- unmatched and missing-component states do not masquerade as zero capacity;
- changing a Sellpia name or channel name does not break a confirmed recipe.

### Web

- inventory status displays current Sellpia rows, prices, and import time;
- successful import invalidates current snapshot, assets, stock-ops, and
  channel availability queries;
- no receive, issue, adjust, reservation, or Rocket stock-mutation action is
  rendered;
- `/inventory-hub` and `/stock-ops` remain reachable through existing
  navigation;
- empty, loading, pagination, search, failure, and stale import states work;
- asset totals handle null prices explicitly.

### Reconstruction Gates

- no production import of legacy inventory mutation contracts remains;
- no production read of `Inventory.currentStock`, `reservedStock`, or
  ProductOption materialized bundle stock remains;
- no legacy stock API route remains registered;
- server, shared, web, tenant-scope, schema, and browser verification gates
  pass together after final deletion.

## Final Decisions

- Screen destinations are preserved; legacy implementations are not.
- `InventorySku.currentStock` is the single authoritative stock property.
- Sellpia import is the single stock writer.
- Channel availability is a read-time recipe projection.
- No internal inventory mutation, reconciliation, reservation, or procurement
  decision remains in this cutover.
- No historical movement model is introduced merely to imitate the old
  receipt/issue screens.

## Development Database Reset

This cutover targets a disposable development database. It deliberately uses a
clean database rebuild instead of a backward-compatible production migration.

Safety requirements:

- inspect the effective `DATABASE_URL` immediately before reset;
- refuse hosts or database names that look like staging or production;
- reset only the explicitly confirmed local/development database;
- never use `git reset --hard`; this decision concerns database data only;
- preserve the source workbook files outside the database;
- after schema creation, import the approved Sellpia and Coupang workbooks
  through the real application import paths;
- verify expected counts and the rendered screens after import.

If this work is later promoted to a persistent shared environment, it requires
a separate deployment design. The destructive development reset is not a
production migration procedure.
