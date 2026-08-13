# web/inventory — Snapshot And Inventory Operations

`app/(inventory)/` owns inventory-hub operations, the independent inventory
screen, analysis under stock-ops, and Coupang shipment helpers. Displayed
physical stock is the latest completed Sellpia snapshot.

## Route Contract

- `/inventory-hub` has exactly status, sellpia-sync, and rocket-events tabs,
  without a nested tab strip. Status stacks snapshot and transfer/return
  records; import history has one screen.
- Retired or moved tab IDs stay in `LEGACY_TAB_TARGETS` or `MOVED_TABS` so
  saved links continue to land. Use `Object.hasOwn` for raw query-key lookup.
- `/stock-ops` keeps product-outflow and channel-zero only.
  `/inventory` retains its own operator composition rather than redirecting.
- One IO section owns transfer/return records and one StockAssets component owns
  asset reporting; do not restore duplicate projections.

## State And Refresh

- Shared API wrappers live in `(inventory)/_shared/inventory-api.ts`.
  Server state uses the Inventory, transfer, warehouse, return, matching,
  channel, product, and purchase query families as owned by each projection.
- Explicit actions create the server-owned
  `inventory.refresh_sellpia_snapshot` run. The extension runtime claims,
  collects, uploads, and finalizes it; a web tab does not.
- Inventory actions request physical-snapshot scope. Product Management alone
  requests full scope with product-profit evidence and ABC recalculation.
- Refresh acceptance is not completion; render terminal state from OperationRun
  and freshness history. Do not add a global/shared freshness drawer.
- Prepared order transmissions remain an Orders retry concern and neither block
  nor appear in Inventory.

## Boundaries

- Physical stock changes only through Sellpia import. UI does not add receive,
  issue, adjust, reserve, restock, or manual current-stock controls.
- Capacity, depletion, reorder, and bottleneck calculations come from backend
  projections.
- Transfer and return forms select physical SKU identities and mutate
  operational records only.
- Shipment extension/file behavior stays in the shipment route.

Focused specs beneath this group own exact tab redirects, composition, refresh
scope, invalidation, and OperationRun state.
