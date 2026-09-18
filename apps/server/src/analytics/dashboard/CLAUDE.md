Before working in this directory, always read this document first rather than relying on memory.

# analytics/dashboard — Reporting Read Model

`src/analytics/dashboard/` owns `/api/dashboard/*` read endpoints for the
analytics domain. It hydrates report KPIs from order rows, listing-day traffic
facts, and the advertising target-day ledger through the Orders, Channels,
Advertising, Inventory, and Products canonical readers. Cross-owner values are
composed inside one dashboard adapter-owned Repeatable Read transaction. It
falls back to Wing/Drive replay revenue when complete Order revenue is absent. Advertising has one
ledger, the campaign sweep's target-day rows. Keep this as a read-only reporting
boundary with HTTP and persistence adapters around Prisma-free orchestration.

## Period Resolution

- `domain/period/dashboard-period` owns every selection-to-window decision.
  Services and adapters read a resolved period; they do not re-derive
  business-date keys, enumerate dates, or clip a window of their own.
- `DashboardSourceClass` enumerates the closure rules — `order_timestamps`,
  `closed_day_clipped`, `closed_day_month`. Add a class there rather than a
  switch in a service.
- Every month window is the anchor's calendar month. `closed_day_clipped` and
  `closed_day_month` clip it forward to the last closed KST business day, so on
  the 1st it is empty and the affected cards publish an unavailable value. Do
  not widen that window, fall back to the previous month, or special-case the
  1st ([ADR 0001](../../../../../docs/adr/0001-dashboard-month-window-is-anchor-clipped.md)).
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
  a multi-source metric first limits both numeric inputs to their exact
  listing/date intersection, then uses `intersectBases` for the matching wire
  evidence. A ratio uses one population and one basis for numerator and
  denominator; intersecting basis labels after aggregating different windows
  is invalid.
- Read `ProfitSourceCoverage.hasAdAccount`, not `adDates.length`: with no
  Coupang channel account the basis names orders alone. `adDates` are the
  dates the campaign sweep measured (its declared window), not dates that
  happen to carry rows.
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
- Top-N profit reads `buildPerListingProfit` for the selected window, matching
  `/api/profit-loss`; insufficient evidence leaves profit and margin `null`
  ([ADR 0006](../../../../../docs/adr/0006-a-displayed-number-is-a-measurement-or-nothing.md)).
- A selection that is one whole calendar month (`wholeCalendarMonth`) ranks
  Top Products from Sellpia's per-product monthly facts through their
  registered reader: one row per Sellpia product, options summed, named from
  its first option, graded only when every mapped master product agrees, and
  with no profit. With no facts, or facts over different coverage windows, and
  for every other window, the ranking reads Orders. The published basis names
  whichever source ranked the rows.
- Wing/Drive replay revenue fallback activates only when complete Order
  revenue is absent. Funnel order, quantity, and revenue stages use canonical
  Order line facts at the active listing/date intersection and never provider
  traffic order fields.
- Advertising-rate fallback reads Wing revenue over the same closed-day dates
  as Advertising. It never divides a closed-day numerator by today's revenue.
- Channel linkage is a current Products/Channels CONFIG
  fact. Stock snapshot completeness and `currentStock` affect availability
  metrics such as out-of-stock only, never whether a configured link exists.
- Inventory ABC counts, calculation statuses, contribution-profit totals,
  formula context, and Top Products read Products' retained official evaluation
  through its publication reader. Calculation statuses are counted from
  Products' published per-product view (`PRODUCT_ABC_READ_PORT`) with the
  shared `productAbcDisplayStatus`; this read model names the product
  population and counts that derived word, never publishes or re-derives a
  status of its own, and never chooses an ABC evidence cutoff. A/B/C ratios use
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
