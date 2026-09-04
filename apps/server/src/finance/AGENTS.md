# finance — P&L, Payments, Plans, Settlements

`src/finance/` owns live financial aggregation, supplier payments, sales plans,
settlement reconciliation, and the profitability evidence port consumed by
Products.
`Settlement` still lives in the Orders Prisma namespace and `SupplierPayment`
in Supply, but the backend capability owner is finance.

## Data Boundaries

- Live P&L reads aggregate orders, line items, returns, listing/options, and ad
  spend.
- Sales plans, settlements, and supplier payments back finance-owned
  operational views.
- Keep P&L, manual-ledger, and processing-cost reporting as live aggregation;
  introduce persistence only through a scoped finance design change.

## Aggregation Rules

- Period input is `YYYY-MM`; default is the current month.
- Monetary values are integer KRW.
- Shipping is allocated by line-item revenue share.
- Return/orphan semantics stay aligned with channel dashboard.
- Profit and return rates derive from raw values, not persisted rates.
- `common/option-pricing-resolver.ts`, `common/kst`, and
  `common/per-listing-profit` are shared finance helpers.

## Cross-Domain Ports

- Supplier-payment capability lives here even though supplier identity is owned
  by supply.
- Settlement reconciliation reads order-owned settlement tables through finance
  services.
- Product profitability evidence is assembled here from Analytics' exact Sellpia
  monthly facts and Advertising's listing-daily spend facts. Orders, order-line
  links, and Wing collection are not ABC inputs. Finance never calculates a
  formula, score, or ABC grade; Products is the sole
  formula/evaluation/grade owner.

## Boundary Rules

- Keep `/api/profit-loss` as live aggregation; do not add persisted P&L writes.
- Live channel-SKU pricing comes from `ChannelListingOption` and the shared
  pricing resolver. Component purchase cost comes from the mapped physical
  `SellpiaInventorySku.purchasePrice`; do not restore removed `ProductOption`
  reads.
- Add date-range support only as one coordinated DTO, service, test, and
  contract change.

## Transitional Exceptions

- Finance stays flat while it is live aggregation plus focused payment, plan,
  and settlement capabilities. Provider calls, raw SQL reporting, cross-domain
  mutations, or long transaction invariants require a scoped reconstruction
  plan.
