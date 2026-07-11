Consult this document first instead of relying on memorized knowledge.

# web/stock-ops - Sellpia And Channel Inventory Projections

`stock-ops/` preserves `/stock-ops` as an operational view over Sellpia
`InventorySku` snapshots, channel availability, and record-only transfer/return
workflows. It is not a stock ledger or reorder planner.

## State Rules

- Use React Query for source read models; do not mirror server state in local
  stores.
- Render Sellpia zero stock, channel zero capacity, component bottlenecks,
  mapping attention, asset value, and import freshness from owner APIs.
- Transfer and return record mutations invalidate their record lists, not the
  Sellpia snapshot as though stock changed.

## Boundary Rules

- Do not make order lifecycle decisions in UI projections.
- Do not duplicate `min(floor(currentStock / quantity))` or infer bundle
  quantities from names. Render backend availability evidence.
- Do not expose manual `InventorySku.currentStock` mutation controls.
- Record forms use `inventorySkuId`; do not restore ProductOption-based stock
  selectors.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(inventory\)/stock-ops
```
