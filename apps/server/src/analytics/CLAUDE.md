Before working in this directory, always read this document first rather than relying on memory.

# analytics — Reporting + Read Models

`src/analytics/` owns dashboard, statistics, traffic, and supplier-stats read
models. It may read across owner-domain tables for reporting, but it does not
take mutation authority from them.

Analytics is one hexagonal owner (`npm run check:hexagonal`). Dashboard,
statistics, traffic, and supplier-stats code sits in a `<bundle>/` subfolder of
each root lane (`adapter/in/http/<bundle>/`, `application/service/<bundle>/`,
`__tests__/<bundle>/`, …) with `<bundle>.module.ts` at the analytics root. The
`sellpia-sales/` and `sellpia-product-sales/` bundles keep their own layout.
Documented legacy exception: the statistics and supplier-stats application
services inject `PrismaService` directly and read Orders through
`orders/adapter/out/persistence/read/order-facts.reader` (frozen in
`check:hexagonal` `KNOWN_VIOLATIONS`, removed with KID-334); the dashboard
architecture spec therefore scopes its Prisma-free rules to `*/dashboard/`.

## Ownership and source boundaries

- Analytics reads, but does not own, order, channel, product, inventory, alert,
  thumbnail, supplier, purchase, or payment facts. Dashboard raw SQL and
  report hydration stay behind analytics repository adapters.
- Source owners publish their own attempts, facts, coverage manifests, and
  `COMPLETE` snapshots; attempts terminate only as `COMPLETE` or `FAILED`.
  Source terminal handling never invokes ABC. Analytics never treats a partial,
  failed, missing, or stale source as a successful zero and does not initiate
  collection.
- Sellpia sales is the operation kind `analytics.sellpia_sales`
  (`adapter/in/operation/`, ADR-0025, lock `resource:sellpia:login`): finalize
  replaces the window's `SellpiaSalesDailySnapshot` rows inside the finish
  transaction and stamps `operationId`. A date counts as collected only when a
  succeeded operation's window covers it (`readSucceededOperationWindows`);
  rows without `operationId` are not read.
- Sellpia product profitability is the operation kind
  `analytics.sellpia_product_profitability` (same lock): plan fixes the 401-day
  window through yesterday and the product-mapping generation; finalize takes
  the `kiditem.product-mapping:<org>` transaction lock, refuses a changed
  mapping generation and inserts one immutable monthly fact set keyed by
  `operationId`. A generation is one succeeded operation; ABC provenance
  (`…SellpiaOperationId`) names it.
- Products owns `MasterProduct` ABC evaluation, publication, current grade, and
  history. Analytics may read the stored result and expose reporting views, but
  it does not calculate or store a second grade and does not trigger refresh.
- ABC profitability evidence uses only the latest compatible complete source
  periods, including an exact partial month through the selected cutoff.
  Sellpia rows are eligible only with explicit
  `ORDER_TIME_SUPPLY_COST` and VAT-included provenance; legacy or unknown-cost
  facts remain readable for depletion but are not ABC evidence.

## Reporting rules

- Metric formulas are changed only with a scoped plan and behavior tests. Raw
  snapshots are audit/replay evidence; reporting APIs read owner-published
  facts and projections.
- If an owner changes a read schema or mutation contract consumed by analytics,
  update the reader in the same change or record an explicit compatibility
  decision.
- Product depletion matching permits only product-code exact, option-code
  exact, or a unique barcode. Missing, inactive, disconnected, or duplicate
  matches are not converted to stock zero. Sum rows resolved to the same
  Sellpia SKU before counting reorder or dead stock.
- Product revenue, operating-profit contribution, rank, and cumulative share
  are reporting metrics only. They never alter the absolute ABC score or grade.

## Cross-domain reads

Analytics may read owner-published order, channel, product, inventory, alert,
ABC, thumbnail, supplier, purchase-order, and payment projections. Every
tenant-owned table in ORM or raw-SQL joins remains organization-fenced.

## Dashboard

Dashboard owns `/api/dashboard/*` read endpoints for the analytics domain. Its
code sits in each analytics lane's `dashboard/` subfolder
(`adapter/in/http/dashboard/`, `application/service/dashboard/`,
`domain/dashboard/`, …) beside the root `dashboard.module.ts` and
`dashboard-capability.module.ts`. It hydrates report KPIs from order rows, listing-day traffic
facts, and the advertising target-day ledger through the Orders, Channels,
Advertising, Inventory, and Products canonical readers. Cross-owner values are
composed inside one dashboard adapter-owned Repeatable Read transaction. It
falls back to Wing/Drive replay revenue when complete Order revenue is absent. Advertising has one
ledger, the campaign sweep's target-day rows. Keep this as a read-only reporting
boundary with HTTP and persistence adapters around Prisma-free orchestration.

### Period Resolution

- `domain/dashboard/period/dashboard-period` owns every selection-to-window decision.
  Services and adapters read a resolved period; they do not re-derive
  business-date keys, enumerate dates, or clip a window of their own.
- `DashboardSourceClass` enumerates the closure rules — `order_timestamps`,
  `closed_day_clipped`, `closed_day_month`. Add a class there rather than a
  switch in a service.
- Every month window is the anchor's calendar month. `closed_day_clipped` and
  `closed_day_month` clip it forward to the last closed KST business day, so on
  the 1st it is empty and the affected cards publish an unavailable value. Do
  not widen that window, fall back to the previous month, or special-case the
  1st ([ADR 0001](../../../../docs/adr/0001-dashboard-month-window-is-anchor-clipped.md)).
- The window cutoff comes from `DashboardContext.anchor` through
  `ResolvedDashboardPeriod`. Period-aware code never reads the wall clock, so
  an injected anchor stays authoritative down to the outgoing adapter.

### Calculation Evidence

- Build every published `metricBasis` entry with the `@kiditem/shared/dashboard`
  builders through `domain/dashboard/evidence`. A basis carries only measured facts:
  the requested range, the dates measured, the dates read and refused, the
  sources, and any failed read. The status word, the missing dates and
  whether a snapshot is stale or partial are functions of those, exported
  beside the builders (`periodBasisStatus`, `periodBasisMissingDates`,
  `snapshotBasisStatus`, `snapshotBasisPartial`); never hand-assemble a basis
  literal, publish a status, or re-derive one in a service or a component.
- `domain/dashboard/evidence/dashboard-source` owns the source vocabulary. Add a name
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

### Source-Of-Truth Rules

- Compute revenue as `SUM(OrderLineItem.totalPrice)`; `Order.totalPrice` and
  `Order.quantity` are not revenue sources.
- Shipping cost accumulates from `Order.shippingPrice` once per order.
- Ad metrics aggregate additive columns; ratios recompute caller-side through
  `domain/dashboard/util/percent`, which returns `null` when a ratio has no measurable
  base. Publish that as unavailable; a missing base is never a measured `0`.
- Top-N profit reads `buildPerListingProfit` for the selected window, matching
  `/api/profit-loss`; insufficient evidence leaves profit and margin `null`
  ([ADR 0006](../../../../docs/adr/0006-a-displayed-number-is-a-measurement-or-nothing.md)).
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
- Findings (`/api/dashboard/findings`) pick owner verdicts and never make
  their own: declining products are key products whose Sellpia depletion
  `trend` is `down`, reorder suggestions are its `needsReorder` SKUs that still
  have stock (read through `SELLPIA_PRODUCT_SALES_SUMMARY_READ_PORT`), and a
  failed registration is a listing the mall listing state reads as `error`
  (`channels/adapter/out/repository/mall-listing-errors.reader.ts`).
- Rocket sales splits use Sellpia daily sales facts. `/rocket-orders` uses the
  current Rocket PO catalog; there is no `dashboard.rocket_sales` source.
- Omit the retired Delivery Statistics surface until an Order-backed owner is
  explicitly introduced.

### Transitional Exceptions

- `application/port/in/dashboard/` holds only the analytics overview
  capability port; the controller injects application services directly.
