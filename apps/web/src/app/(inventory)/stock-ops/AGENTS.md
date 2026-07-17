Consult this document first instead of relying on memorized knowledge.

# web/stock-ops - Preserved Inventory Analysis

`stock-ops/` owns the independently reachable inventory-analysis surface from
baseline commit `c9e7caf875ca82574ae566a27fe0afa35c988918`. Related
projections may also appear in `/inventory-hub`.

## State Rules

- Preserve `sellpia-zero`, `channel-zero`, `bottlenecks`,
  `mapping-attention`, `inventory-value`, `freshness`, `transfer`, and
  `return-transfer` plus their direct query entry points. Do not substitute a
  different historical tab set.
- Keep inactive workspaces from running unnecessary timers, requests, or
  toasts.
- Mapping recipe edits link to
  `/product-hub/matching`; the analysis page does not save recipes itself.

## Boundary Rules

- Do not replace this page with `/inventory-hub` or another route.
- Do not write Sellpia stock or duplicate backend capacity calculations.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(inventory\)/stock-ops
```
