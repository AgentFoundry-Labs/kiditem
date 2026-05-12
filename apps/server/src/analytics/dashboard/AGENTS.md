# analytics/dashboard — Reporting Read Model

Dashboard owns the `/api/dashboard/*` read endpoints (sales, ad, inventory,
trend) for the analytics owner domain. It hydrates report KPIs from
order/listing/account daily-fact rows + raw SQL on order line items, and
falls back to Wing/Drive replay daily facts when order data is absent. No
mutation lives here.

Dashboard is hexagonal-complete: outgoing ports + repository adapters cover
every Prisma read, application services are Prisma-free, and pure helpers
live under `domain/`. The architecture spec freezes these invariants.

## Layout

```text
dashboard/
  adapter/in/http/                /api/dashboard/* controller + DTO
  adapter/out/repository/         8 *.repository.adapter.ts (PrismaService here only)
  application/port/out/           8 outgoing ports (Symbol tokens + interfaces)
  application/service/            orchestration (Prisma-free); 4 services
  domain/                         pure context builder + util/effective-period + util/percent
  dashboard.module.ts             PrismaModule import + port useExisting bindings
```

The 8 ports / adapters:

| Port | Capability |
|---|---|
| `profit-calculation.repository.port` | Period profit aggregate (revenue/COGS/commission/shipping/ad/net) over a half-open `[from, to)` window. |
| `ad-aggregation.repository.port` | Listing daily-fact ad metric sums for a period. |
| `wing-ad-summary.repository.port` | Current-month Wing adSummary snapshot lookup with payload parsing. |
| `dashboard-sales.repository.port` | Today KPI + top-N product ranking + per-day month revenue raw SQL. |
| `dashboard-ad.repository.port` | 30-day daily ad cost window raw SQL. |
| `dashboard-trend.repository.port` | Per-day revenue + per-day ad cost trend series. |
| `wing-traffic-aggregation.repository.port` | Wing traffic + Coupang ads daily aggregations, latest data date, daily trend/ads series. |
| `dashboard-inventory.repository.port` | Grade counts, alerts, active product counts, per-listing metrics, inventory stock rows, grade history, low-CTR thumbnails, A-grade review counts. |

## Architecture Guards

Invariants enforced by `__tests__/dashboard.architecture.spec.ts`:

- `PrismaService` is imported only under `adapter/out/repository/**`.
- No `*persistence.ts` files survive (migration-waypoint naming).
- `application/**` is Prisma-free (no `@prisma/client` or `Prisma.*` types).
- `application/service/**` does not import `adapter/out/**`; concrete
  adapters reach services only via Nest token bindings to
  `application/port/out/*`.
- `application/service/**` does not import other owner-domain services
  directly; if cross-owner reach appears it must go through an
  `adapter/out/{owner}/` port + adapter pair.
- `domain/**` is free of NestJS, Prisma, `PrismaService`, HTTP DTO classes,
  and incoming-adapter modules. The pure `buildDashboardContext()` and
  `buildEffectivePeriod()` helpers live here.
- No top-level `dto/`, `util/`, `helpers/`, `services/`, or
  `adapter/out/prisma/` folders remain. Final shape uses
  `adapter/in/http/dto/`, `domain/util/`, and `adapter/out/repository/`.

`application/port/in/**` is intentionally omitted because no other owner
domain consumes dashboard use cases today; the controller injects
application services directly while that remains true.

## Cross-Domain Reads

Dashboard reads these tables directly per analytics' charter:

- `Order` + `OrderLineItem` → revenue + line-item canonical (I3).
- `ChannelListingDailySnapshot` → ad metrics, traffic, daily snapshots.
- `ChannelAccountDailyKpiSnapshot` → Wing adSummary + Coupang ads daily.
- `MasterProduct` + `ChannelListing` + `ChannelListingOption` →
  top-N product ranking, grade counts, A-grade review counts.
- `Inventory`, `Alert`, `GradeHistory`, `Thumbnail` → inventory tile inputs.

If an owner domain changes read schema or mutation semantics for any of
those tables, update the relevant dashboard repository adapter in the same
PR or record an explicit compatibility decision.

## Tenant Predicate Contract

- Controller uses `@CurrentOrganization()` for every endpoint.
- Every Prisma read in `adapter/out/repository/**` binds `organizationId`.
- Raw SQL (`$queryRaw` tagged templates) binds `${organizationId}::uuid`
  on every tenant-owned table including 2-hop joins through
  `orders → order_line_items → channel_listing_options →
  channel_listings → master_products`.
- `@Body()` / `@Query()` organizationId is forbidden.

## Source-Of-Truth Rules

- `revenue = SUM(OrderLineItem.totalPrice)` per I3 — never `Order.totalPrice`
  or `Order.quantity`.
- `shippingCost` accumulates from `Order.shippingPrice` once per order
  (Plan D.1 R-1). `ProductOption.shippingCost` is not summed inside the
  line-item loop.
- Ad metrics aggregate additive columns from `ChannelListingDailySnapshot`;
  ratios (ROAS/CTR/CVR) recompute caller-side via `domain/util/percent`.
- Wing/Drive replay fallback only activates when the order-based path
  produces zero revenue — `effectivePeriod.revenueSource` reports which
  source fed the numbers (`orders` / `wing` / `mixed` / `none`).
- Top-N ranking uses a documented 30% margin approximation
  (`dashboard-sales.repository.adapter`) — precise per-listing math lives
  in `/api/profit-loss`.

## Verification

```bash
npm exec --workspace=apps/server -- vitest run src/analytics/dashboard
npm run build --workspace=apps/server
npm run dev:server
```

Use integration tests for IDOR, raw SQL tenant predicates, and any new
report metric or daily-fact source. The architecture + module wiring
specs (`dashboard.architecture.spec.ts`,
`dashboard.module.wiring.spec.ts`) must stay green.
