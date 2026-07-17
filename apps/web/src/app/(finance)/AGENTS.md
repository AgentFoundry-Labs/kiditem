Consult this document first instead of relying on memorized knowledge.

# web/finance - P&L, Settlements, Costs, Payments

`app/(finance)/` owns financial read and operations UI: P&L, sales analysis,
supplier payments, manual ledger, processing costs, settlements, receivables,
and reports. It presents backend-calculated money views and should not recreate
accounting logic in the browser.

## Owned Surfaces

- Profit/loss period views
- Manual ledger and manual settlement entry
- Processing cost and payment schedule operations
- Supplier sales, payment, settlement, and history reports
- Sales analysis tabs and downloadable report composition
- Supplier-filtered purchase lists remain in the canonical Supply workspace at
  `/purchase-orders?supplierId=...`; finance does not duplicate that table.

## Data Flow

```text
React Query + apiClient
  -> /api/profit-loss
  -> /api/sales-analysis, /api/dashboard/rocket-sales
  -> /api/manual-ledger, /api/processing-costs
  -> /api/supplier-payments, /api/supplier-stats, /api/settlements
```

## State Rules

- Use `queryKeys.profitLoss`, `salesAnalysis`, `manualLedger`,
  `processingCosts`, and related settlement/payment keys for cache boundaries.
- Prefer `apiClient.getParsed()` for financial summary shapes when schemas
  exist.
- Period selection is UI state; totals, allocation, and reconciliation remain
  backend-owned.
- Keep finance-only shared types under `(finance)/_shared/`.

## Boundary Rules

- Do not compute settlement, tax, fee, or P&L source-of-truth values in UI code.
- Do not mutate catalog, inventory, or order state from finance screens except
  through explicit finance backend endpoints.
- Reports may aggregate multiple APIs for display/export, but durable
  calculations remain server-side.
