# analytics/dashboard — Reporting Read Model

`src/analytics/dashboard/` owns `/api/dashboard/*` read endpoints for the
analytics domain. It hydrates report KPIs from order/listing/account daily-fact
rows plus raw SQL on order line items, and falls back to Wing/Drive replay
daily facts when order data is absent. No mutation lives here.

## Folder Map

```text
dashboard/
├── dashboard.module.ts
├── adapter/in/http/          # /api/dashboard/* controller + DTOs
├── adapter/out/repository/   # Prisma/raw-SQL repository adapters
├── application/
│   ├── port/out/             # dashboard repository ports
│   └── service/              # Prisma-free report orchestration
└── domain/                   # pure context builder and utilities
```

## Owned Surfaces

- `GET /api/dashboard/sales`
- `GET /api/dashboard/ad`
- `GET /api/dashboard/inventory`
- `GET /api/dashboard/trend`

## Main Data Sources

- `Order` + `OrderLineItem` for revenue and line-item canonical facts.
- `ChannelListingDailySnapshot` for ad metrics, traffic, and daily snapshots.
- `ChannelAccountDailyKpiSnapshot` for Wing adSummary/Coupang ads daily facts.
- `MasterProduct`, `ChannelListing`, and `ChannelListingOption` for ranking and
  grade/listing context.
- `Inventory`, `Alert`, `GradeHistory`, and `Thumbnail` for inventory tiles.

## Source-Of-Truth Rules

- Revenue is `SUM(OrderLineItem.totalPrice)`, never `Order.totalPrice` or
  `Order.quantity`.
- Shipping cost accumulates from `Order.shippingPrice` once per order.
- Ad metrics aggregate additive columns; ratios recompute caller-side through
  `domain/util/percent`.
- Wing/Drive replay fallback only activates when the order-based path produces
  zero revenue.
- Top-N ranking uses the documented 30% margin approximation; precise
  per-listing math lives in `/api/profit-loss`.

## Boundary Rules

- `PrismaService` imports stay under `adapter/out/repository/**`.
- Application services are Prisma-free and depend on repository ports.
- HTTP adapters do not import outgoing ports or repository adapters directly.
- `domain/` is pure and does not depend on NestJS, Prisma, DTOs, incoming
  adapters, or application contracts.
- Raw SQL uses Prisma tagged templates and binds `${organizationId}::uuid` on
  every tenant-owned table in join paths.
- `@Body()` / `@Query()` organizationId is forbidden.

## Transitional Exceptions

- `application/port/in/**` is intentionally omitted because no other owner
  domain consumes dashboard use cases today.
