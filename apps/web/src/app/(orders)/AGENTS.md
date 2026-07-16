Consult this document first instead of relying on memorized knowledge.

# web/orders - Orders, Returns, CS, Rocket PO Reads

`app/(orders)/` owns order operations UI: order pipeline, order status hub,
order collection, Rocket PO monitoring, returns, reviews, CS, picking, and
return scanning. It uses NestJS owner APIs and browser extension bridges where
explicitly documented.

## Owned Surfaces

- Order pipeline reads and order action mutations
- Order collection and generated-file download flows
- Read-only Rocket PO list/summaries and local legacy file history
- Returns, reviews, and CS operational screens
- Picking/outbound widgets used by order hub screens
- Preserved `/order-hub` composition and independently reachable
  `/order-collection`, `/orders`, `/outbound`, `/unshipped-items`, and
  `/order-status-hub` screens

## Data Flow

```text
React Query + apiClient
  -> /api/orders, /api/returns, /api/reviews, /api/cs
  -> /api/picking, /api/return-transfers, /api/orders/collection/*
  -> /api/channels/sku-availability for mapped order-line inventory evidence
  -> extensions/order-collector for browser-side collection
```

## State Rules

- Use `queryKeys.orders`, `returns`, `reviews`, and `cs` for server state.
- Mutations invalidate the affected query-key family, not broad unrelated app
  state.
- Generated Excel files may use `apiClient.fetchRaw()` because they are blob
  responses.
- Existing local Rocket file history may use browser storage for operator
  convenience; it is not server truth or evidence that confirmation is active.
- Preserve each route's pre-SDD page composition and URL. Shared extracted
  components may reduce duplication, but an independent route must not become a
  redirect merely because `/order-hub` also composes related functionality.
- Channel SKU recipe repair remains exclusively in
  `/product-hub/matching?view=channel-recipes`; the default matching URL keeps
  the preserved matching center.

## Boundary Rules

- Do not send `organizationId`; backend session scope owns order tenancy.
- Do not write directly to marketplace pages from the web app. Use the
  documented order-collector extension bridge.
- Do not persist return-scan logs from `return-scan/`; that route is local-only.
- Picking and return-transfer operations reference Sellpia `MasterProduct`
  rows and update operational records only; do not present them as direct
  Sellpia stock changes.
- Rocket purchase-order quantity decisions, confirmation file generation, and
  reservation are deferred. Do not call or restore `/api/orders/rocket/*`
  action endpoints.
- Extension-backed queries that render local error UI may suppress the global
  React Query error toast with query meta.
- A successful order-collector extension submit is a Sellpia transmission
  request, not proof of Sellpia acceptance. Only `{ success: true, submitted:
  true }` schedules `order_transmission_requested`; raw mall collection does
  not schedule inventory refresh or mutate stock locally.
