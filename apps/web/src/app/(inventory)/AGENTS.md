Consult this document first instead of relying on memorized knowledge.

# web/inventory - Stock, Warehouses, Fulfillment

`app/(inventory)/` owns inventory list/detail operations, stock movements,
warehouses, unshipped items, outbound views, inventory hub widgets, and
Coupang shipment support. It consumes inventory/order read APIs and does not own
order lifecycle decisions.

## Folder Map

```text
(inventory)/
├── _shared/
│   └── inventory-api.ts
├── coupang-shipments/
├── inventory/
├── inventory-hub/
├── outbound/
├── stock-ops/
├── unshipped-items/
└── warehouses/
```

## Owned Surfaces

- Inventory list, receive, issue, adjust, and asset reporting
- Stock operation projections and movement summaries
- Warehouse and stock audit views
- Unshipped/outbound operational read views
- Coupang shipment file helpers and browser print support

## Data Flow

```text
React Query + inventory API helpers
  -> /api/inventory/*
  -> /api/stock-*
  -> /api/warehouses
  -> /api/unshipped
  -> queryKeys.inventory and related stock keys
```

## State Rules

- Use `(inventory)/_shared/inventory-api.ts` for shared inventory API wrappers.
- Inventory mutations invalidate `queryKeys.inventory.all` plus any affected
  stock movement or order-status read keys.
- Barcode printing may use browser print APIs only in the existing inventory
  print helper.
- Keep projection helpers pure and covered by focused tests.

## Boundary Rules

- Do not mutate order status from inventory screens unless the backend exposes a
  dedicated inventory operation for it.
- Do not duplicate stock availability math in UI components; put projections in
  tested `lib/` helpers or backend read models.
- Coupang shipment extension/file behavior stays inside `coupang-shipments/`
  unless another inventory route imports it.

## Verification

```bash
npm run build --workspace=apps/web
```
