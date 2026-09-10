# analytics/dashboard — Reporting Read Model

`src/analytics/dashboard/` owns `/api/dashboard/*` read endpoints for the
analytics domain. It hydrates report KPIs from order/listing/account daily-fact
rows plus raw SQL on order line items, and falls back to Wing/Drive replay
daily facts when order data is absent. Keep this as a read-only reporting
boundary with HTTP and persistence adapters around Prisma-free orchestration.

## Source-Of-Truth Rules

- Compute revenue as `SUM(OrderLineItem.totalPrice)`; `Order.totalPrice` and
  `Order.quantity` are not revenue sources.
- Shipping cost accumulates from `Order.shippingPrice` once per order.
- Ad metrics aggregate additive columns; ratios recompute caller-side through
  `domain/util/percent`.
- Wing/Drive replay fallback only activates when the order-based path produces
  zero revenue.
- Top-N ranking uses the documented 30% margin approximation; precise
  per-listing math lives in `/api/profit-loss`.
- Inventory ABC counts, calculation statuses, contribution-profit totals,
  formula context, and Top Products read Products' stored
  `MasterProduct.abcGrade` plus current evaluation snapshot. A/B/C ratios use
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
