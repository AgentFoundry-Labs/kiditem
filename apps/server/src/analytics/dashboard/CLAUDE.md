# analytics/dashboard — Reporting Read Model

`src/analytics/dashboard/` owns `/api/dashboard/*` read endpoints for the
analytics domain. It hydrates report KPIs from order/listing/account daily-fact
rows plus raw SQL on order line items, and falls back to Wing/Drive replay
daily facts when order data is absent. Keep this as a read-only reporting
boundary with HTTP and persistence adapters around Prisma-free orchestration.

## Period Resolution

- `domain/period/dashboard-period` owns every selection-to-window decision.
  Services and adapters read a resolved period; they do not re-derive
  business-date keys, enumerate dates, or clip a window of their own.
- `DashboardSourceClass` enumerates the closure rules — `order_timestamps`,
  `closed_day_clipped`. Add a class there rather than a switch in a service.
- Every month window is the anchor's calendar month. `closed_day_clipped` clips
  it forward to the last closed KST business day, so on the 1st it is empty and
  the affected cards publish an unavailable value. Do not widen that window,
  fall back to the previous month, or special-case the 1st
  ([ADR 0001](../../../../../docs/adr/0001-dashboard-month-window-is-anchor-clipped.md)).
- The window cutoff comes from `DashboardContext.anchor` through
  `ResolvedDashboardPeriod`. Period-aware code never reads the wall clock, so
  an injected anchor stays authoritative down to the outgoing adapter.

## Calculation Evidence

- Build every published `metricBasis` entry with the `@kiditem/shared/dashboard`
  builders through `domain/evidence`. A basis carries only measured facts:
  the requested range, the dates measured, the dates read and refused, the
  sources, and any failed read. The status word, the missing dates and
  whether a snapshot is stale or partial are functions of those, exported
  beside the builders (`periodBasisStatus`, `periodBasisMissingDates`,
  `snapshotBasisStatus`, `snapshotBasisPartial`); never hand-assemble a basis
  literal, publish a status, or re-derive one in a service or a component.
- `domain/evidence/dashboard-source` owns the source vocabulary. Add a name
  there rather than repeating a string literal in a service.
- A metric uses the maximal valid dates of its own required sources;
  a multi-source metric uses `intersectBases`, and a ratio uses one basis for
  numerator and denominator.
- Read `ProfitSourceCoverage.hasAdAccount`, not `adDates.length`: with no
  advertising account the basis names orders alone.
- `unverified` means a required read failed. Evidence read and refused is
  `invalidDates`; nothing collected is simply absent from `includedDates`.
- A published basis describes the value actually published. A source this
  read model refused contributes no included date.
- Inventory, product-count, warning and ABC values publish a `snapshot` basis
  through `snapshotEvidence`, carrying the owner result's actual as-of against
  the as-of the read needed. Do not give them a period basis.
- A snapshot value counts a population. Pass `withheldCount` for the members
  the owner could not measure, which makes the basis partial without ageing
  it, and `measured: false` when none were measurable so the card blanks
  instead of publishing an uncounted zero.
- Publish a key for every value a reader displays. A value with no owner
  evidence publishes an `unavailable` snapshot; an omitted key and an absent
  basis are indistinguishable to the reader, which blanks the card.

## Source-Of-Truth Rules

- Compute revenue as `SUM(OrderLineItem.totalPrice)`; `Order.totalPrice` and
  `Order.quantity` are not revenue sources.
- Shipping cost accumulates from `Order.shippingPrice` once per order.
- Ad metrics aggregate additive columns; ratios recompute caller-side through
  `domain/util/percent`, which returns `null` when a ratio has no measurable
  base. Publish that as unavailable; a missing base is never a measured `0`.
- Wing/Drive replay fallback only activates when the order-based path produces
  zero revenue.
- Top-N ranking uses the documented 30% margin approximation; precise
  per-listing math lives in `/api/profit-loss`.
- Inventory ABC counts, calculation statuses, contribution-profit totals,
  formula context, and Top Products read Products' stored
  `MasterProduct.abcGrade` plus current evaluation snapshot. Display statuses
  come from Products through `PRODUCT_ABC_READ_PORT`; this read model names the
  product population and counts the published answer, and never chooses an ABC
  evidence cutoff. A/B/C ratios use
  classified products only; observation, source-stale, mapping, recalculation,
  and calculation-error states do not become C or unclassified. Dashboard never
  recalculates contribution profit or owns ABC policy mutations.
- Thumbnail analysis quality grades remain AI-owned product-registration
  evidence and are not a fallback or input for inventory ABC.
- Rocket sales splits use Sellpia daily sales facts. `/rocket-orders` uses the
  current Rocket PO catalog; there is no `dashboard.rocket_sales` source.
- Omit the retired Delivery Statistics surface until an Order-backed owner is
  explicitly introduced.

## Transitional Exceptions

- `application/port/in/**` is intentionally omitted because no other owner
  domain consumes dashboard use cases today.
