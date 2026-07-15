Consult this document first instead of relying on memorized knowledge.

# web/supply - Suppliers and Purchase Orders

`app/(supply)/` owns supplier registry UI and purchase-order operations. It is
the frontend surface for procurement workflows and does not own inventory stock
state, finance settlement state, or catalog product editing.

## Owned Surfaces

- Supplier list/create/delete operations
- Purchase order list, status update, delete, and create modal
- Purchase-order counts and status filters
- Coupang Rocket collection and component-capacity preview workspace
- Active Rocket ChannelAccount selector on the real `/purchase-orders` route

## Data Flow

```text
React Query + apiClient
  -> /api/suppliers
  -> /api/purchase-orders
  -> queryKeys.suppliers and queryKeys.purchaseOrders

logged-in order-collector extension
  -> collectRocketPoRows with a browser-created runId
  -> POST /api/purchase-orders { action: 'previewRocket', ... }
  -> read-only quantity recommendations
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
- Submission settlement invalidates purchase-order queries on both success and
  error because provider failures may persist a terminal attempt before the API
  rejects.
- Filter/page state belongs in the route; backend owns status transitions and
  totals.
- Keep purchase-order creation payloads aligned with backend DTO semantics.
- Rocket preview quantities are editable only up to the backend-recomputed
  maximum. Recalculation must collect a fresh evidence run instead of reusing
  stale browser rows.
- Before a recollection is submitted, edit keys are intersected with the fresh
  PO line IDs and retained values are clamped to the latest known backend max;
  the returned backend maxima clamp retained UI state again.
- Release `0.1.19` keeps `로켓 발주 확정` visibly disabled and states that the
  workspace is review-only.

## Boundary Rules

- Do not update inventory quantities directly from supply screens.
- Do not update supplier payments or settlements here; finance owns those
  workflows.
- Do not send `organizationId`; backend session scope owns tenancy.
- Do not add Rocket provider calls, confirmation routes, reservations,
  workbooks, or local stock deductions to the preview workspace.
