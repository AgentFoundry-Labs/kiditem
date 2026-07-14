Consult this document first instead of relying on memorized knowledge.

# finance — P&L, Costs, Payments, Settlements

`src/finance/` owns live financial aggregation plus manual ledger, processing
costs, supplier payments, sales plans, and settlement reconciliation.
`Settlement` still lives in the Orders Prisma namespace and `SupplierPayment`
in Supply, but the backend capability owner is finance.

## Owned Surfaces

- Company P&L: `GET /api/profit-loss`
- Sales analysis: `GET /api/sales-analysis`
- Manual ledger: `/api/manual-ledger/*`
- Processing costs: `/api/processing-costs/*`
- Supplier payments: `/api/supplier-payments/*`
- Sales plans: `/api/sales-plans/*`
- Settlements: `/api/settlements/*`

## Main Data Models

- Live P&L reads aggregate orders, line items, returns, listing/options, and ad
  spend.
- `ManualLedger`, processing cost rows, sales plans, settlements, and supplier
  payments back finance-owned operational views.
- `ProfitLoss` may remain as legacy/cache data, but is not the live read source
  of truth.

## Aggregation Rules

- Period input is `YYYY-MM`; default is the current month.
- Monetary values are integer KRW.
- Shipping is allocated by line-item revenue share.
- Return/orphan semantics stay aligned with channel dashboard.
- Profit and return rates derive from raw values, not persisted rates.
- `common/option-pricing-resolver.ts`, `common/kst`, and
  `common/per-listing-profit` are shared finance helpers.

## Cross-Domain Ports

- Finance operation alerts go through `FINANCE_OPERATION_ALERT_PORT`.
- Supplier-payment capability lives here even though supplier identity is owned
  by supply.
- Settlement reconciliation reads order-owned settlement tables through finance
  services.

## Boundary Rules

- Do not use `prisma.profitLoss.*` in live read paths.
- Live channel-SKU pricing comes from `ChannelListingOption` and the shared
  pricing resolver. Component purchase cost falls back to mapped
  `MasterProduct.purchasePrice`; do not restore removed `ProductOption` reads.
- Do not add date-range support without updating DTOs, services, tests, and
  this contract.
- Raw SQL uses Prisma tagged templates only.
- All reads/writes remain organization-scoped.
- Do not inject automation's `OperationAlertService` directly.

## Transitional Exceptions

- Finance stays flat while it is live aggregation plus CRUD. Provider calls,
  raw SQL reporting, cross-domain mutations, or long transaction invariants
  require a scoped reconstruction plan.
