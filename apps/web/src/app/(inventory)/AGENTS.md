Consult this document first instead of relying on memorized knowledge.

# web/inventory - Sellpia Snapshot, Warehouses, Fulfillment Records

`app/(inventory)/` owns canonical `/inventory-hub`, query-aware redirects for
legacy `/inventory`, `/stock-ops`, `/unshipped-items`, and `/outbound` URLs,
warehouses, and Coupang shipment support.
The displayed stock is the latest completed Sellpia snapshot stored on
physical `MasterProduct` rows.

## Owned Surfaces

- Sellpia snapshot list, import history, freshness, and asset reporting
- Channel availability, zero-stock, bottleneck, and mapping-attention views
- Warehouse metadata and record-only transfer/picking/return views
- Query-aware unshipped/outbound redirects; canonical composition is owned by
  `/order-hub`
- Coupang shipment file helpers and browser print support

## Data Flow

```text
React Query + inventory API helpers
  -> /api/inventory/sellpia-skus
  -> /api/inventory/sellpia-sync/*
  -> /api/channels/sku-availability
  -> /api/stock-transfers
  -> /api/warehouses
  -> /api/unshipped
  -> queryKeys.inventory and channel availability keys
```

## State Rules

- Use `(inventory)/_shared/inventory-api.ts` for shared inventory API wrappers.
- A successful Sellpia import invalidates freshness/history, snapshot, asset,
  matching, channel-availability, product, and purchase-order query families.
- Barcode printing may use browser print APIs only in the existing inventory
  print helper.
- Keep projection helpers pure and covered by focused tests.
- Sellpia automatic and manual attempts share the global freshness drawer and
  one import-run history. Manual upload requires explicit fresh-export
  attestation bound to the currently selected file, and pre-download failures
  render without file provenance.
- `/inventory-hub` owns `tab=overview|inventory|attention|history`; history owns
  `view=assets|transfer|return`. Both selectors preserve unrelated URL state
  and unmount inactive workspaces.
- The inventory table is implemented once in `InventoryWorkspace`; `/inventory`
  redirects to `/inventory-hub?tab=inventory` while preserving unrelated query
  state.
- The canonical header renders compact freshness; import attempts and history
  remain in the single shared freshness drawer rather than route-local panels.

## Boundary Rules

- Do not mutate order status from inventory screens unless the backend exposes a
  dedicated inventory operation for it.
- Do not add receive, issue, adjust, reserve, restock, or manual current-stock
  controls. Physical `MasterProduct.currentStock` changes only through the
  Sellpia import.
- Do not compute channel capacity in UI code. Render the backend's nullable
  `sellableStock`, component capacities, and bottleneck flags.
- Transfer, picking, and return forms select a physical Sellpia `MasterProduct`
  and create or update operational records only; completion does not imply a
  stock write.
- Coupang shipment extension/file behavior stays inside `coupang-shipments/`
  unless another inventory route imports it.
