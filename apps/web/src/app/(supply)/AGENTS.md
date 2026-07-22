Consult this document first instead of relying on memorized knowledge.

# web/supply - Purchase Orders

`app/(supply)/` owns purchase-order operations and the Supply-side Rocket
procurement components composed into the preserved `/rocket-orders` screen. It
does not own a standalone supplier registry UI, inventory stock state, finance
settlement state, or catalog product editing.

## Owned Surfaces

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
  -> /api/purchase-orders
  -> queryKeys.purchaseOrders

logged-in order-collector extension
  -> collectRocketPoRows with a browser-created runId
-> POST /api/purchase-orders { action: 'previewRocket' | 'confirmRocket' |
'releaseRocketConfirmation' | 'listSavedRocketPos' |
'loadSavedRocketCollection' | 'listRocketCommitments' |
'settleRocketFinalOrderCommitments' | 'releaseRocketFinalOrderCommitments', ... }
  -> immutable PO catalog evidence, collection-scoped safe recipe automation,
     current-inventory preview, internal capacity allocation, official workbook
     download, release
```

## State Rules

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
- Keep purchase-order creation payloads aligned with backend DTO semantics,
  including free-text `supplierName` creation.
- Rocket preview quantities are editable only up to the backend-recomputed
  maximum. Explicit new collection creates fresh provider evidence. A completed
  persisted catalog snapshot may be reopened, but every reopen reruns Inventory
  freshness and capacity; persisted inventory quantities are never reused.
- Recollection intersects retained edit keys with fresh PO lines and sends all
  retained edits once using the backend's joint clamp mode. UI state uses the
  returned effective quantities because multiple rows may share component
  stock. Any later edit marks the preview dirty and confirmation stays disabled
  until one whole-preview revalidation succeeds.
- Changing the selected Rocket ChannelAccount remounts account-scoped errors,
  preview rows, and edits. The `/rocket-orders` calendar owns the date range,
  so that range remains unchanged while the selected account changes.
- Rocket's deterministic matching panel is read-only. It displays the safe
  recipes applied by the current completed collection and the remaining review
  or blocked counts. Each product-level status deep-links to
  `/product-hub/matching` with both `channelAccountId` and `status`; the product
  matching center owns explicit reruns and focused corrections.
- Confirmation stays disabled until the backend has published a complete
  catalog, all rows include authoritative workbook fields, and the operator has
  reviewed every quantity/shortage reason.
- Confirmation uses a browser-created UUID idempotency key and downloads the
  workbook only after the server persists the allocation. Persisted request/
  final commitments remain durable after refresh but are not rendered as a
  separate operator list on the Rocket review page. Provisional cancellation is a release;
  final-order settlement requires a newer Sellpia snapshot proving the
  movement, while final-order cancellation requires an explicit release
  reason.
- Commitment and preview tables use scoped horizontal overflow, explicit
  minimum widths, truncated product names, and non-wrapping identifiers/actions.
  Do not apply these rules to every table globally.

## Boundary Rules

- Do not update inventory quantities directly from supply screens.
- Do not update supplier payments or settlements here; finance owns those
  workflows.
- Do not recreate a standalone supplier registry route or browser-side supplier
  cache family; backend Supplier contracts remain owned by Supply.
- Do not send `organizationId`; backend session scope owns tenancy.
- Do not add Rocket provider calls, `/api/orders/rocket/*` routes, or local
  stock deductions. Confirmation/reservation stays on the Supply action API and
  never represents provider acceptance.
