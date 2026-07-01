Consult this document first instead of relying on memorized knowledge.

# web/stock-ops - Stock Operation Projections

`stock-ops/` owns stock operation views and local projection helpers that
combine inventory, order, and purchase-order read models for operator decisions.

## State Rules

- Keep projection helpers in `lib/` pure and tested.
- Use React Query for source read models; do not mirror server state in local
  stores.
- Inventory mutations invalidate `queryKeys.inventory.all` and any affected
  stock movement keys.

## Boundary Rules

- Do not make order lifecycle decisions in UI projections.
- Do not duplicate backend stock availability math inside components.
- If a projection becomes source-of-truth, move it to a backend read model
  before depending on it for mutations.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(inventory\)/stock-ops
```
