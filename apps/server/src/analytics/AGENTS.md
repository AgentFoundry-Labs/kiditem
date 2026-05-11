# analytics — Reporting / Read-Model Owner Domain

Analytics owns dashboard, statistics, traffic, and supplier-stats read models.
It may read across owner-domain tables for reporting, but it does not import
other owner-domain services or take mutation authority from them.

## Architecture Mode

Mode: Mixed Read-Model / Projection Adapter.

Dashboard is reconstructed because it owns raw SQL and report hydration.
Statistics, traffic, and supplier-stats may stay flat read services until they
gain raw SQL complexity, mutation invariants, or 500+ line service pressure.

## Public Routes

| Route | Capability |
|---|---|
| `GET /api/dashboard/sales` | sales summary, trends, range KPI, plan achievement |
| `GET /api/dashboard/ad` | ad summary, ad KPI, benchmark, saving |
| `GET /api/dashboard/inventory` | inventory snapshot and grade changes |
| `GET /api/dashboard/trend` | revenue + ad cost trend |
| `GET /api/statistics?type=...` | overview/products/categories/delivery/grades/pareto/repurchase |
| `GET /api/traffic/summary` | traffic summary over daily facts |
| `GET /api/traffic/monthly` | daily traffic + KST month aggregate |
| `POST /api/traffic/upload` | operator CSV/XLSX traffic upload |
| `GET /api/supplier-stats?type=...` | supplier sales/history reports |

## Layout

| Path | Shape |
|---|---|
| `dashboard/` | reconstructed: HTTP adapters, repository adapters, application services, pure helpers |
| `statistics/` | transitional flat read service |
| `traffic/` | transitional flat read service plus upload mutation lane |
| `supplier-stats/` | transitional flat read service |

Dashboard is the strictest surface because it owns raw SQL and report hydration.
New dashboard raw SQL goes through `adapter/out/repository/`. The other
capabilities may stay flat until a concrete invariant, raw SQL, or fat-service
driver appears.

## Tenant Predicate Contract

- Controllers use `@CurrentOrganization()`.
- ORM reads include `organizationId` on every tenant-owned table.
- Dashboard raw SQL uses Prisma tagged templates and binds
  `${organizationId}::uuid`.
- Multi-hop joins include organization predicates on every tenant-owned hop.
- `@Body()` / `@Query()` organizationId is forbidden.
- Traffic upload scopes scrape-run and daily-fact writes with the controller's
  organization id.

## Cross-Domain Reads

Analytics may read these tables directly for reporting:

- Orders and line items for revenue and repurchase.
- Channel listings/options/daily snapshots/account KPI/scrape audit rows for
  listing and channel facts.
- Products/options for metadata, grade, category, and pricing inputs.
- Inventory, alerts, grade history, and thumbnails for dashboard snapshots.
- Supplier, supplier product, purchase order, supplier payment, and shipment
  tables for supplier and delivery reports.

If an owner domain changes read schema or mutation semantics used by analytics,
the same PR should update analytics readers or record an explicit compatibility
decision.

## Rules

- Do not change metric formulas without a scoped plan and behavior tests.
- Raw snapshots are audit/debug/replay evidence only; reporting APIs read daily
  facts and product/listing/account projections.
- No `$queryRawUnsafe` / `$executeRawUnsafe`.
- New raw SQL/report hydration belongs behind dashboard repository adapters.
- Do not merge traffic CSV upload with `/api/ads/extension/sync`; one is
  operator-driven, the other provider/extension-driven.

## Verification

```bash
npm exec --workspace=apps/server -- vitest run src/analytics
npm run build --workspace=apps/server
npm run dev:server
```

Use integration tests for IDOR, raw SQL tenant predicates, traffic upload, and
cross-domain report semantics.
