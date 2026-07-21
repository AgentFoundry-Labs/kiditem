Consult this document first instead of relying on memorized knowledge.

# web/rocket-orders - Preserved Rocket Operations

`app/(orders)/rocket-orders/` owns the independently reachable Rocket
operations UI from `c9e7caf8`. The `RocketOrdersWorkspace` renders the shared
Supply preview and injects the user's original confirmation panel
(`RocketConfirmPanel`) through the `decisionWorkspace` render prop.
`/rocket-orders` is the only operator-facing Rocket review route.

The month calendar's per-day counts come from the user's original data path
(commit `03123c2f`): saved Rocket POs (`rocket_purchase_orders`) served by
`POST /api/orders/rocket/saved-pos`, merged over the Supply catalog-snapshot
list as `mergedMonthData = { ...savedDays, ...dayDataRecord }` so real-time
rows win and saved rows backfill empty days. The Supply catalog-snapshot path
stays available for the collection flow; do not delete it.

## State Rules

- Preserve Rocket collection and local file-history composition. The calendar
  merges saved `rocket_purchase_orders` (via `/api/orders/rocket/saved-pos`)
  with the Supply catalog-snapshot list; an operator may reopen one saved
  snapshot/collection without recollecting provider evidence.
- Wire freshness, account selection, collection completeness, capacity reasons,
  editable quantities, confirmation/workbook, and allocation release into the
  existing decision placeholder.
- A quantity edit makes the preview dirty and disables confirmation. The
  operator must run one whole-preview revalidation; retained edits are sent
  together and the server returns the effective shared-capacity allocation.
- Persist commitments independently of transient workbook state. Do not render
  the separate commitment-history list on the operator page; the active
  confirmation state keeps release controls in the decision workspace.

## Boundary Rules

- The saved-PO calendar and the confirmation panel use the restored
  `/api/orders/rocket/*` endpoints (`saved-pos`, `confirm-preview[-saved]`,
  `confirm-generate`, `confirm-fill`, `confirm-commit`). The product-centered
  Supply preview keeps using the Supply `/api/purchase-orders` action contract.
- Confirmation must not call a marketplace provider or mutate Sellpia physical
  stock. Rocket reservations persist to the orders-owned `RocketPoReservation`
  table on top of the single Sellpia stock owner, which is read-only here.
- Reopening saved PO evidence must always rerun current Inventory freshness and
  capacity; never reuse stored inventory quantities.
- Display `currentStock`, `activeCommitmentQuantity`, and `availableStock`
  separately. Final-order settlement is enabled only after a newer verified
  Sellpia generation.
- Do not replace or rearrange the preserved shell when integrating the shared
  preview.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(orders\)/rocket-orders
```
