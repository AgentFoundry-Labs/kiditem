Consult this document first instead of relying on memorized knowledge.

# web/supply - Suppliers and Purchase Orders

`app/(supply)/` owns supplier registry UI and purchase-order operations. It is
the frontend surface for procurement workflows and does not own inventory stock
state, finance settlement state, or catalog product editing.

## Owned Surfaces

- Supplier list/create/delete operations
- Purchase order list, status update, delete, and create modal
- Purchase-order counts and status filters
- Coupang Rocket collection, component-capacity preview, confirmation,
  workbook, and allocation-release workspace
- Supply-owned Rocket preview components and action contracts composed into the
  capacity-decision placeholder on the preserved `/rocket-orders` screen
- `/purchase-orders` remains the general supplier purchase-order workspace;
  Rocket review is not duplicated there.

## Data Flow

```text
React Query + apiClient
  -> /api/suppliers
  -> /api/purchase-orders
  -> queryKeys.suppliers and queryKeys.purchaseOrders

logged-in order-collector extension
  -> collectRocketPoRows with a browser-created runId
  -> POST /api/purchase-orders { action: 'previewRocket' | 'confirmRocket' |
     'releaseRocketConfirmation', ... }
  -> preview, internal capacity allocation, official workbook download, release
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
- General purchase filters and paging belong in the route and preserve
  `orderId`/`supplierId`; backend owns status transitions and totals.
- Keep purchase-order creation payloads aligned with backend DTO semantics.
- Rocket preview quantities are editable only up to the backend-recomputed
  maximum. Recalculation must collect a fresh evidence run instead of reusing
  stale browser rows.
- Every recollection first sends an unedited preview to learn the current gated
  backend maxima. Edit keys are intersected with the fresh PO line IDs, clamped
  to that response, and only then reapplied with the backend's explicit joint
  clamp mode when retained edits exist. UI state uses the effective edited
  quantities returned by that second preview because multiple rows may share
  the same component stock.
- Changing the selected Rocket ChannelAccount remounts the workspace so dates,
  errors, preview rows, and edits never cross account boundaries.
- Confirmation stays disabled until the backend has published a complete
  catalog, all rows include authoritative workbook fields, and the operator has
  reviewed every quantity/shortage reason.
- Confirmation uses a browser-created UUID idempotency key and downloads the
  workbook only after the server persists the allocation. Allocation release
  requires an explicit operator reason after cancellation or after the real
  stock movement appears in Sellpia, then requires a fresh preview before
  reconfirming.

## Boundary Rules

- Do not update inventory quantities directly from supply screens.
- Do not update supplier payments or settlements here; finance owns those
  workflows.
- Do not send `organizationId`; backend session scope owns tenancy.
- Do not add Rocket provider calls, `/api/orders/rocket/*` routes, or local
  stock deductions. Confirmation/reservation stays on the Supply action API and
  never represents provider acceptance.
