Consult this document first instead of relying on memorized knowledge.

# web/rocket-orders - Read-Only Coupang Rocket PO Monitoring

`app/(orders)/rocket-orders/` preserves `/rocket-orders` as a read-only operator
view of Coupang Rocket purchase-order summaries collected through the logged-in
order-collector extension. Inventory-based delivery decisions are deferred.

## Owned Surfaces

- PO list query by ETA range and Coupang Rocket status
- Week, month, and chart summaries over extension-returned PO rows
- Expandable read-only PO summary rows
- Read/download/delete access to any pre-existing local IndexedDB file history

## Data Flow

```text
order-collector extension
  -> listRocketPos
  -> local read-only summaries and calendars
```

## State Rules

- `page.tsx` keeps date/status/view/open-row state local.
- The automatic PO list query is extension-backed and renders local errors, so
  it uses `meta: { suppressGlobalErrorToast: true }`.
- `rocket-confirm-file-store.ts` is browser-only legacy history and must no-op
  when IndexedDB is unavailable.

## Boundary Rules

- Do not call Coupang supplier pages directly from the web app. Collection goes
  through `extensions/order-collector` capabilities.
- Do not calculate or display confirm quantities, shortage reasons, reservations,
  or stock deductions. The purchase-order decision flow is not implemented.
- Do not call or recreate backend Rocket confirmation/generation endpoints.
- Rocket is a channel identity (`channel='rocket'`), not a separate inventory
  balance. Future decisions must use account-scoped ChannelSku recipes and the
  Sellpia-authoritative availability projection.
- Do not move local file history into server persistence without a scoped data
  model and retention plan.
- Do not show the generic global query toast for expected extension-availability
  errors on the initial page render.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run 'src/app/(orders)/rocket-orders/lib/rocket-purchase-decision-boundary.spec.ts'
```
