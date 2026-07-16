Consult this document first instead of relying on memorized knowledge.

# web/stock-ops - Preserved Inventory Analysis

`stock-ops/` owns the independently reachable pre-SDD inventory-analysis
surface. Sellpia freshness and mapping-attention capabilities are additive to
its existing tabs; related projections may also appear in `/inventory-hub`.

## State Rules

- Preserve the existing analysis tabs and their direct query entry points.
- Keep inactive workspaces from running unnecessary timers, requests, or
  toasts.
- Mapping recipe edits link to
  `/product-hub/matching?view=channel-recipes`; the analysis page does not save
  recipes itself.

## Boundary Rules

- Do not replace this page with `/inventory-hub` or another route.
- Do not write Sellpia stock or duplicate backend capacity calculations.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(inventory\)/stock-ops
```
