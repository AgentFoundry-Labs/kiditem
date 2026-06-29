Consult this document first instead of relying on memorized knowledge.

# web/supply - Suppliers and Purchase Orders

`app/(supply)/` owns supplier registry UI and purchase-order operations. It is
the frontend surface for procurement workflows and does not own inventory stock
state, finance settlement state, or catalog product editing.

## Folder Map

```text
(supply)/
├── purchase-orders/
└── suppliers/
```

## Owned Surfaces

- Supplier list/create/delete operations
- Purchase order list, status update, delete, and create modal
- Purchase-order counts and status filters

## Data Flow

```text
React Query + apiClient
  -> /api/suppliers
  -> /api/purchase-orders
  -> queryKeys.suppliers and queryKeys.purchaseOrders
```

## State Rules

- Supplier mutations invalidate `queryKeys.suppliers.all`.
- Purchase-order mutations invalidate `queryKeys.purchaseOrders.all`.
- Filter/page state belongs in the route; backend owns status transitions and
  totals.
- Keep purchase-order creation payloads aligned with backend DTO semantics.

## Boundary Rules

- Do not update inventory quantities directly from supply screens.
- Do not update supplier payments or settlements here; finance owns those
  workflows.
- Do not send `organizationId`; backend session scope owns tenancy.

## Verification

```bash
npm run build --workspace=apps/web
```
