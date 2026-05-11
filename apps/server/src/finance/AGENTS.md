# finance — P&L, Sales Analysis, And Finance Capabilities

Finance owns live financial aggregation plus manual ledger, processing costs,
supplier payments, sales plans, and settlement reconciliation. `Settlement`
still lives in the Orders Prisma namespace and `SupplierPayment` in Supply; the
backend owner module is finance.

## Architecture Mode

Mode: Transitional Flat.

Finance keeps flat controllers/services while it is live aggregation plus CRUD
over finance-owned capabilities. Do not add provider calls, raw SQL reporting,
cross-domain mutations, or long transaction invariants into the flat services;
those changes require a scoped reconstruction plan.

## Layout

```text
finance/
  controllers/          profit-loss, sales-analysis
  services/             profit-loss, sales-analysis
  dto/
  manual-ledger/
  processing-costs/
  supplier-payments/
  sales-plans/
  settlements/
  finance.module.ts
```

## Routes

| Route | Responsibility |
|---|---|
| `GET /api/profit-loss` | company-level P&L by month |
| `GET /api/sales-analysis` | channel revenue/cost/profit breakdown |
| `/api/manual-ledger` | manual transaction records |
| `/api/processing-costs` | processing cost CRUD and monthly aggregate |
| `/api/supplier-payments` | supplier payment CRUD |
| `/api/sales-plans` | sales plan CRUD and `syncActuals` |
| `/api/settlements` | settlement CRUD and monthly reconcile |

## Live Aggregation Contract

Finance read paths do not use `ProfitLoss` as the source of truth. The table may
remain for legacy/cache reuse, but new readers/writers require a scoped plan.

`profit-loss.service.ts` aggregates from:

- `Order.shippingPrice`
- `OrderLineItem.quantity/totalPrice`
- `ChannelListingOption -> ChannelListing -> MasterProduct`
- `OrderReturnLineItem`
- `ChannelListingDailySnapshot.adSpend`

`sales-analysis.service.ts` uses the same live order/return/ad-spend sources and
groups by `ChannelListing.channel`.

Rules:

- Period input is `YYYY-MM` only. No date range API.
- Default period is the current month.
- Monetary values are integer KRW.
- Shipping is allocated by line-item revenue share; denominator zero drops
  shipping for that order.
- Return/orphan semantics stay aligned with channel dashboard:
  matched returns count in return rate; orphan returns are side metrics.
- Profit/return rates are derived from raw values, not persisted rates.

## Shared Helpers

- `common/option-pricing-resolver.ts` for option pricing.
- `common/kst` for KST month windows.
- `common/per-listing-profit` for sales-plan actuals and settlement reconcile.

## Hard Bans

- `prisma.profitLoss.*` in live read paths.
- `ProductOption.shippingCost` as live shipping source.
- Date-range query support without changing DTOs, services, tests, and this
  contract.
- `$queryRaw` string concatenation.
- Cross-organization reads/writes.

## Change Map

| Change | Also update |
|---|---|
| new metric | service aggregation + response type + tests |
| pricing logic | option-pricing resolver + finance callers |
| date range support | DTO + period parser + scoped plan |
| new channel | schema/seed implications + sales-analysis grouping |

## Verification

```bash
npm exec --workspace=apps/server -- vitest run src/finance
npm run build --workspace=apps/server
npm run dev:server
```
