Consult this document first instead of relying on memorized knowledge.

# web/inventory - Sellpia Snapshot And Inventory Operations

`app/(inventory)/` owns the active `/inventory-hub`, `/inventory`, `/stock-ops`,
and `/coupang-shipments` operational surfaces and their shared components.
Warehouse rows remain organization-scoped reference data for `StockTransfers`;
this group does not own a standalone warehouse-management route.
The displayed stock is the latest completed Sellpia snapshot stored on
physical `SellpiaInventorySku` rows.

## Owned Surfaces

- Sellpia snapshot list, import history, freshness, and inventory reporting
- Channel availability and bottleneck views
- Warehouse reference reads for `StockTransfers` and record-only transfer and
  return views
- Coupang shipment file helpers and browser print support

## Data Flow

```text
React Query + inventory API helpers
  -> /api/inventory/sellpia-skus
  -> /api/inventory/sellpia-sync/*
  -> /api/channels/sku-availability
  -> /api/stock-transfers
  -> /api/warehouses (reference reads for StockTransfers)
  -> /api/return-transfers
  -> queryKeys.inventory, queryKeys.stockTransfers, queryKeys.warehouses,
     queryKeys.returnTransfers, and channel availability keys
```

## State Rules

- Use `(inventory)/_shared/inventory-api.ts` for shared inventory API wrappers.
- A successful Sellpia import invalidates freshness/history, snapshot, asset,
  matching, channel-availability, product, and purchase-order query families.
- Barcode printing may use browser print APIs only in the existing inventory
  print helper.
- Keep projection helpers pure and covered by focused tests.
- Sellpia refresh requests are made through explicit action buttons as a
  server-owned `inventory.refresh_sellpia_snapshot` OperationRun. The extension
  browser runtime claims it; a web-tab lifecycle never owns collection or
  finalization. One user-requested synchronization collects both the physical
  inventory snapshot and product-level monthly depletion; users do not start
  those sources separately.
  TTL and post-order evidence refreshes remain inventory-only. There is no
  global freshness drawer, status entry, or manual-import UI. Completed
  automatic attempts share one import-run history.
- `/inventory-hub` owns exactly three tabs — `status`, `sellpia-sync`, and
  `rocket-events` — and has **no nested tab strip**. Related views
  stack as sections inside one tab (`status` contains the inventory snapshot
  and transfer/return records, but not purchase orders or stock assets). Do not
  reintroduce sub-tabs to make room for a new view; add a section or argue for
  a fourth tab. The retired `checks`, `sellpia-zero`, and `mapping-attention`
  deep links land on `status`. Every tab id retired by that collapse keeps an
  entry in the page's `LEGACY_TAB_TARGETS` so old deep links still land.
  The former checks-only `ZeroItems`, `MappingAttention`, and internal legacy
  workspace are deleted; do not restore a hidden rendering path for them.
- `/stock-ops` keeps only the two analysis views that are not inventory
  operations: `product-outflow` and `channel-zero`. The tabs it handed to
  `/inventory-hub` stay reachable through the page's `MOVED_TABS` redirect
  table.
- Tab moves are additive-compatible, never silent: a tab that changes route
  gets a `MOVED_TABS` entry, a tab that changes id gets a `LEGACY_TAB_TARGETS`
  entry, and both are covered by the page spec.
  `/stock-ops?tab=sellpia-zero` and `?tab=freshness` remain load-bearing for
  saved dashboard and server automation alerts even though new links use the
  canonical inventory-hub tabs.
- Both redirect tables are looked up with `Object.hasOwn`. Indexing a plain
  object literal with the raw `?tab=` value lets `constructor`/`toString`
  resolve to inherited members and hands `router.replace` a non-string.
- `InventoryLedgerWorkspace` (수불부) and `InventoryIoWorkspace` (입출고) were
  the same transfer/return records rendered twice, once read-only. There is
  now one io section. Do not re-add a read-only twin of it.
- `/inventory` keeps its own operator-facing composition. Shared projections
  may reuse components, but that route does not become a redirect.
- Do not add a shared freshness drawer or app-wide/inline status entry. Direct
  refresh actions start the shared OperationRun; the browser runtime owns
  claim, collection, upload, and finalization.
- Sellpia import-run history has exactly one screen (`?tab=sellpia-sync`). Do
  not reintroduce a separate audit or freshness tab rendering the same
  `ImportFreshness` projection.
- Prepared-but-unresolved order-transmission intents remain internal retry
  bookkeeping. Inventory management and analysis surfaces do not display or
  reconcile them; the order-collection resend flow owns any required recovery.
  An unresolved intent protects only that file and never changes freshness or
  blocks independent stock synchronization.
- Refresh buttons report request acceptance only; terminal success/failure is
  read from OperationRun and freshness history, never inferred from HTTP
  success.
- Stock asset reporting has exactly one component (`StockAssets`). Do not add
  a second, reduced asset projection alongside it.

## Boundary Rules

- Do not mutate order status from inventory screens unless the backend exposes a
  dedicated inventory operation for it.
- Do not add receive, issue, adjust, reserve, restock, or manual current-stock
  controls. `SellpiaInventorySku.currentStock` changes only through the
  Sellpia import.
- Do not compute channel capacity in UI code. Render the backend's nullable
  `sellableStock`, component capacities, and bottleneck flags.
- Transfer and return forms select a physical `SellpiaInventorySku` and create
  or update operational records only; completion does not imply a stock write.
- Coupang shipment extension/file behavior stays inside `coupang-shipments/`
  unless another inventory route imports it.
