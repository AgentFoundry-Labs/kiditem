Consult this document first instead of relying on memorized knowledge.

# web/orders - Orders, Returns, CS, Rocket PO

`app/(orders)/` owns order operations UI: order pipeline, order status hub,
order collection, Rocket PO confirmation, returns, reviews, CS, picking, and
return scanning. It uses NestJS order APIs and browser extension bridges where
explicitly documented.

## Folder Map

```text
(orders)/
├── _shared/
├── cs-management/
├── order-collection/
├── order-hub/
├── order-status-hub/
├── orders/
├── return-scan/
├── returns/
├── reviews/
└── rocket-orders/
```

## Owned Surfaces

- Order pipeline reads and order action mutations
- Order collection and generated-file download flows
- Rocket PO list, preview, confirm-file generation, and local file history
- Returns, reviews, and CS operational screens
- Picking/outbound widgets used by order hub screens

## Data Flow

```text
React Query + apiClient
  -> /api/orders, /api/returns, /api/reviews, /api/cs
  -> /api/picking, /api/orders/collection/*, /api/orders/rocket/*
  -> extensions/order-collector for browser-side collection
```

## State Rules

- Use `queryKeys.orders`, `returns`, `reviews`, and `cs` for server state.
- Mutations invalidate the affected query-key family, not broad unrelated app
  state.
- Generated Excel files may use `apiClient.fetchRaw()` because they are blob
  responses.
- Local order/rocket generated file history may use browser storage only for
  operator convenience; it is not a durable source of truth.

## Boundary Rules

- Do not send `organizationId`; backend session scope owns order tenancy.
- Do not write directly to marketplace pages from the web app. Use the
  documented order-collector extension bridge.
- Do not persist return-scan logs from `return-scan/`; that route is local-only.
- Extension-backed queries that render local error UI may suppress the global
  React Query error toast with query meta.

## Verification

```bash
npm run build --workspace=apps/web
```
