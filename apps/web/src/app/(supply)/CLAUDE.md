Before working in this directory, always read this document first rather than relying on memory.

# web/supply - Purchase Orders

`app/(supply)/` owns purchase-order operations and the Supply-side Rocket
procurement components composed into the preserved `/rocket-orders` screen. It
does not own a standalone supplier registry UI, inventory stock state, finance
settlement state, or catalog product editing.

## Owned Surfaces

- Purchase order list, status update, delete, and create modal
- Purchase-order counts and status filters
- Coupang Rocket collection, current-stock preview, quantity review, and direct
  workbook download
- Supply-owned Rocket preview hook (`useRocketPurchaseWorkflow`), API client and
  workbook builder, composed by `RocketConfirmPanel` into `/rocket-orders`
- `/purchase-orders` remains the general supplier purchase-order workspace;
  Rocket review is not duplicated there.

## Data Flow

```text
React Query + apiClient
  -> /api/purchase-orders
  -> queryKeys.purchaseOrders

explicit Rocket collection -> Channels source attempt
-> extension reads frozen plan and uploads directly to Channels
-> read COMPLETE source -> Supply preview by sourceImportRunId

fresh preview -> browser workbook generation -> direct download
```

## State Rules

- Rocket collection status comes from the account-scoped Channels source read,
  independently of PO rows. Keep the prior COMPLETE on failure, and clear older
  current rows after a verified empty COMPLETE. Preview/download failure does
  not fail a completed source. Send source references, not rows, to preview.
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
  persisted catalog snapshot may be reopened. Collected rows render immediately
  from the pending checkpoint while the shared coordinator synchronizes Sellpia;
  the UI labels those quantities as prior-snapshot advisory values, keeps export
  disabled, and replaces them with the fresh-generation comparison before
  review completes. An unresolved order-file intent never blocks this refresh.
- Recollection intersects retained edit keys with fresh PO lines and sends all
  retained edits once using the backend's joint clamp mode. UI state uses the
  returned effective quantities because multiple rows may share component
  stock. Any later edit marks the preview dirty and workbook export stays disabled
  until one whole-preview revalidation succeeds.
- Changing the selected Rocket ChannelAccount resets account-scoped errors,
  preview rows, and edits. The `/rocket-orders` calendar owns the date range,
  so that range remains unchanged while the selected account changes.
- Rocket review has no Supply-side matching panel. `RocketMatchStatusModal`
  deep-links a blocked line to `/product-hub/matching` with `focusOptionId`;
  after the mapping is fixed, re-preview the same saved collection without
  recollecting from Coupang.
- Workbook export stays disabled until the backend has published a complete
  catalog, all rows include authoritative workbook fields and confirmed active
  recipes, and the operator has reviewed every quantity/shortage reason.
  Product/option identity blockers must be resolved in Product Hub. A confirmed
  variant's empty or incorrect Sellpia recipe may be created or explicitly
  replaced inline in Rocket review through Products-owned APIs. Only
  recipe-backed insufficient capacity may proceed with an explicit shortage
  reason.
- Workbook download reruns the fresh preview, builds the reviewed workbook in
  the browser, and downloads it directly. The UI performs no upload, active
  workbook lookup, exact re-download, abandonment, or completion tracking after
  download.
- Rocket preview tables use scoped horizontal overflow, explicit
  minimum widths, truncated product names, and non-wrapping identifiers/actions.
  Do not apply these rules to every table globally.

## Boundary Rules

- Do not update inventory quantities directly from supply screens.
- Do not update supplier payments or settlements here; finance owns those
  workflows.
- Do not recreate a standalone supplier registry route or browser-side supplier
  cache family; backend Supplier contracts remain owned by Supply.
- Do not add Rocket provider calls, `/api/orders/rocket/*` routes, local stock
  deductions, Rocket-specific commitment/available-stock projections, or a
  post-download workbook workflow.
