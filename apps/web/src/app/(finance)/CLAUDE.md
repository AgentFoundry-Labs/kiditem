Before working in this directory, always read this document first rather than relying on memory.

# web/finance - P&L, Sales Analysis, and Reports

`app/(finance)/` owns the active `/profit-loss`, `/reports`, and
`/sales-analysis` routes. The sales-analysis workspace includes the settlement
tab. These surfaces present backend-calculated money views and do not recreate
accounting logic in the browser.

## Owned Surfaces

- Profit/loss period views
- Sales analysis, overview/product/category/grade/Pareto/repurchase statistics,
  sales-plan, Sellpia-backed channel analysis, and Wing daily-sales tabs
- Settlement list, reconciliation, and confirmation inside `/sales-analysis`
- Downloadable product, P&L, inventory, and advertising reports

## Data Flow

```text
React Query + apiClient
  -> /api/profit-loss, /api/sales-analysis, /api/statistics
  -> /api/sales-plans, /api/settlements
  -> /api/sellpia-sales, /api/traffic/monthly, /api/readiness
  -> active product, inventory, and advertising report adapters
```

Rocket channel analysis uses Sellpia sales daily snapshots. `/rocket-orders`
is a separate Orders operator workspace for Rocket catalog snapshots and PO
confirmation; it is not a Finance revenue endpoint.

## State Rules

- Use `queryKeys.profitLoss`, `salesAnalysis`, `salesPlans`, and `settlements`
  for their active cache boundaries.
- Prefer `apiClient.getParsed()` for financial summary shapes when schemas
  exist.
- Period selection is UI state; totals, allocation, and reconciliation remain
  backend-owned.
- Keep types local when only one active Finance component consumes them.

## Boundary Rules

- Do not compute settlement, tax, fee, or P&L source-of-truth values in UI code.
- Do not mutate catalog, inventory, or order state from finance screens except
  through explicit finance backend endpoints.
- Reports may aggregate multiple APIs for display/export, but durable
  calculations remain server-side.
