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
- Active `/order-hub`, `/order-collection`, `/orders`, `/order-status-hub`, and
  `/rocket-orders` screens

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
- Order-transmission status and Sellpia freshness scheduling are wired into the
  baseline generated-file flow; do not replace the order-collection layout with
  a separate synchronization workspace.
- Existing local Rocket file history may use browser storage for operator
  convenience; it is not server truth or evidence that confirmation is active.
- `/order-collection` and `/orders` own their live workspaces and remain
  independent active routes; `/order-hub` may compose them by import.
- `/order-hub` is the current live consumer of the `outbound` tab and its
  `OutboundWorkspace`. Retain both while that page renders the outbound
  workflow; remove them only when `/order-hub` no longer exposes it and no
  other active route imports the workspace. This consumer does not restore
  `/outbound` as an independent URL.
- `/order-hub` preserves the baseline `orders`, `collection`, `picking`,
  `outbound`, and `matching` tabs. `/order-status-hub` preserves `inventory`,
  `delivery`, `compare`, and `sync`.
- Channel SKU recipe repair remains exclusively in the independently reachable
  `/product-hub/matching` route.
- `/rocket-orders` keeps the baseline calendar/list/file-history composition.
  Its calendar and reopened evidence use the account-scoped Supply catalog
  snapshot actions, and it injects `RocketConfirmPanel` through the workspace
  `decisionWorkspace` render prop. Confirmation is read-only with respect to
  provider and physical Sellpia stock actions.

## Boundary Rules

- Do not send `organizationId`; backend session scope owns order tenancy.
- Do not write directly to marketplace pages from the web app. Use the
  documented order-collector extension bridge.
- Do not persist return-scan logs from `return-scan/`; that route is local-only.
- Picking and return-transfer operations reference physical
  `SellpiaInventorySku` rows and update operational records only; do not
  present them as direct Sellpia stock changes.
- Rocket catalog listing, saved evidence load, preview, confirmation, workbook,
  and release use the shared Supply `/api/purchase-orders` action contract.
  `InventoryCommitment` is the only active stock hold ledger.
- Extension-backed queries that render local error UI may suppress the global
  React Query error toast with query meta.
- A successful order-collector extension submit is a Sellpia transmission
  request, not proof of Sellpia acceptance. The web app durably prepares an
  organization-scoped intent before invoking that irreversible submit and
  blocks submission if preparation fails or the same intent is unresolved.
  `{ success: true, submitted: true }` immediately finalizes the intent into a
  post-submit generation; only explicit non-submission aborts it. Raw mall
  collection does not schedule inventory refresh or mutate stock locally.
