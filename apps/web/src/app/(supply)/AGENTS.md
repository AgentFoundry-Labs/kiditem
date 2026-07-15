Consult this document first instead of relying on memorized knowledge.

# web/supply - Suppliers and Purchase Orders

`app/(supply)/` owns supplier registry UI and purchase-order operations. It is
the frontend surface for procurement workflows and does not own inventory stock
state, finance settlement state, or catalog product editing.

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
- `pending -> ordered` uses the submission hook with a browser-created stable
  idempotency key; it never uses generic status mutation.
- Only `SELLPIA_SYNC_REQUIRED` may request/join a Sellpia refresh, wait for one
  completed fresh generation, and retry exactly once with the same key. A
  second gate error, provider/identity/inactive/login/quality failure, or
  reconciliation-required result is never auto-retried.
- `provider_unknown` is displayed as an explicit reconciliation state; the UI
  records operator-confirmed success/failure through `reconcileSubmission`.
- Filter/page state belongs in the route; backend owns status transitions and
  totals.
- Keep purchase-order creation payloads aligned with backend DTO semantics.

## Boundary Rules

- Do not update inventory quantities directly from supply screens.
- Do not update supplier payments or settlements here; finance owns those
  workflows.
- Do not send `organizationId`; backend session scope owns tenancy.
