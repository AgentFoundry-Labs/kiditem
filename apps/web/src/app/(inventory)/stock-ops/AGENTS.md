Consult this document first instead of relying on memorized knowledge.

# web/stock-ops - Legacy Inventory Redirect

`stock-ops/` preserves old bookmarks as a query-aware server redirect. The
canonical Sellpia and channel inventory projections live under
`/inventory-hub`; mapping attention lives under `/product-hub/matching`.

## Redirect Rules

- `page.tsx` remains a server component with no hooks, API calls, timers, or
  workspace content.
- Preserve unrelated query values while consuming legacy `tab` and `view`.
- Both `return` and the deployed `return-transfer` alias resolve to the
  canonical return-history view.

## Boundary Rules

- Do not restore route-local projections or import canonical workspace
  components into this compatibility page.
- Redirect behavior is owned by `src/lib/operations-navigation.ts` so all
  legacy pages share one mapping contract.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(inventory\)/stock-ops
```
