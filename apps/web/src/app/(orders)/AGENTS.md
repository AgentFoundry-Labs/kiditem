Consult this document first instead of relying on memorized knowledge.

# web/orders - Order Collection, Processing, Rocket PO Reads, Reviews

`app/(orders)/` owns the active order collection, processing, Rocket PO
monitoring, and review screens. It uses NestJS owner APIs and browser extension
bridges where explicitly documented.

## Owned Surfaces

- Order pipeline reads and order action mutations
- Order collection and generated-file download flows
- Read-only Rocket PO list/summaries and local legacy file history
- Review operations
- Active `/order-collection`, `/orders`, `/rocket-orders`, and `/reviews`
  screens

## Data Flow

```text
React Query + apiClient
  -> /api/orders, /api/reviews, /api/orders/collection/*
  -> extensions/order-collector for browser-side collection
```

## State Rules

- Use `queryKeys.orders` and `queryKeys.reviews` for server state.
- Mutations invalidate the affected query-key family, not broad unrelated app
  state.
- Generated Excel files may use `apiClient.fetchRaw()` because they are blob
  responses.
- Order-transmission status and Sellpia freshness scheduling are wired into the
  baseline generated-file flow; do not replace the order-collection layout with
  a separate synchronization workspace.
- `/order-collection` and `/orders` own their live workspaces and remain
  independent active routes.
- Channel product/option identity repair remains in the independently reachable
  `/product-hub/matching` route. A Rocket row whose identity is already confirmed
  may create or explicitly correct its Sellpia recipe inline in `/rocket-orders`.
  Empty recipes use the Products-owned create-if-empty API; existing recipes use
  Products' complete replacement API with the current recipe as optimistic
  evidence. Neither path edits Sellpia physical stock.
- `/rocket-orders` keeps the baseline calendar composition. The per-date PO
  list is absorbed into the preview table; do not re-add a separate one.
  Its calendar and reopened evidence use the account-scoped Supply catalog
  snapshot actions, and it injects `RocketConfirmPanel` through the workspace
  `decisionWorkspace` render prop. The operator flow ends when the reviewed
  workbook is downloaded; it does not expose a post-download workflow.

## Boundary Rules

- Do not send `organizationId`; backend session scope owns order tenancy.
- Do not write directly to marketplace pages from the web app. Use the
  documented order-collector extension bridge.
- Rocket catalog listing, saved evidence load, and preview use the shared Supply
  `/api/purchase-orders` action contract. The browser generates and downloads
  the reviewed workbook after a fresh preview. Rocket does not create or
  project inventory commitments.
- Extension-backed queries that render local error UI may suppress the global
  React Query error toast with query meta.
- A successful order-collector extension submit requires observed Sellpia
  upload evidence and remains a transmission request rather than final order
  registration. The web app durably prepares an
  organization-scoped intent keyed by Rocket workbook export and transport
  before invoking that irreversible submit and
  blocks submission if preparation fails or the same intent is unresolved.
  `{ success: true, submitted: true }` immediately finalizes the intent into a
  post-submit generation; only explicit non-submission aborts it. Raw mall
  collection does not schedule inventory refresh or mutate stock locally.
