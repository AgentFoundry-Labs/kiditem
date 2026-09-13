Before working in this directory, always read this document first rather than relying on memory.

# finance — P&L, Payments, Plans, Settlements

`src/finance/` owns live financial aggregation, supplier payments, sales plans,
the manual settlement ledger, and the profitability evidence port consumed by
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

- Period queries and stored plan/settlement periods are `YYYY-MM` naming a
  real month (`2026-00`/`2026-13` answer 400); the settlement list filter also
  accepts a year prefix. The default is the KST month containing the request,
  statistics included. A month is evaluated over its closed KST days.
- Monetary values are integer KRW. Line costs stay exact; each published
  aggregate (listing row, channel row, window total) rounds its own sum once,
  so rows can differ from a total by a won.
- Shipping is allocated by line-item revenue share and rounded per line, so
  the rows can miss an order's shipping by up to a won.
- Window totals publish what no product row carries by cause, each rounded
  once from exact values: listing-grain spend on listings that sold nothing,
  the campaign-grain account spend minus listing-grain spend, and shipping no
  mapped line's revenue weighs. Rounding residue is never published as a part.
  `Order.shippingPrice` defaults to 0, so a collector that never fills it reads
  as measured zero shipping; a nullable column or collector provenance belongs
  to a schema cutover.
- Profit cost inputs (KID-114): purchase cost is the option recipe × mapped
  `SellpiaInventorySku.purchasePrice`. A sales commission and other per-sale
  cost apply by the order's channel account through `channelAccountSalesCosts`:
  Rocket direct purchase applies neither (Not applied, 0); any other account
  applies both, and without a source their value stays unknown, never 0. The
  finance basis publishes, per component, the lines each does not apply to and
  the lines nobody measured.
- Advertising applies by Advertising's rule (`advertisingAppliesToSale`):
  measured spend for a listing or channel always applies; otherwise it applies
  to a listing sold on an account the Coupang target-day sweep covers.
  Elsewhere it is Not applied (0), never unmeasured.
- Return/orphan semantics stay aligned with channel dashboard.
- Profit and return rates derive from raw values, not persisted rates.
- `common/option-pricing-resolver.ts`, `common/kst`, and
  `common/per-listing-profit` are shared finance helpers.

## Cross-Domain Ports

- Supplier-payment capability lives here even though supplier identity is owned
  by supply.
- The manual settlement ledger (list, create, deposit confirmation) reads and
  writes the Orders-namespace `Settlement` table through finance services.
  Reconciliation against order facts was removed (KID-113) until a settlement
  source exists (KID-115).
- Product profitability evidence is assembled here from Analytics' exact-period
  Sellpia facts and Advertising's listing-daily spend facts for identical dates.
  Keep partial-period totals intact rather than allocating monthly sums to days.
  Orders, order-line
  links, and Wing collection are not ABC inputs. Finance never calculates a
  formula, score, or ABC grade; Products is the sole
  formula/evaluation/grade owner.

## Boundary Rules

- Keep `/api/profit-loss` as live aggregation; do not add persisted P&L writes.
- Never read option `costPriceOverride`, `commissionRate`, `otherCost` or
  `shippingCost` in finance, the dashboard or `common`; shipping is the order's
  `shippingPrice`. Component purchase cost comes from the mapped physical
  `SellpiaInventorySku.purchasePrice`; do not restore removed `ProductOption`
  reads.
- Add date-range support only as one coordinated DTO, service, test, and
  contract change.

## Transitional Exceptions

- Finance stays flat while it is live aggregation plus focused payment, plan,
  and settlement capabilities. Provider calls, raw SQL reporting, cross-domain
  mutations, or long transaction invariants require a scoped reconstruction
  plan.
