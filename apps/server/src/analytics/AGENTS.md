Consult this document first instead of relying on memorized knowledge.

# analytics — Reporting + Read Models

`src/analytics/` owns dashboard, statistics, traffic, and supplier-stats read
models. It may read across owner-domain tables for reporting, but it does not
import owner-domain services or take mutation authority from them.

## Owned Surfaces

- Dashboard APIs: `/api/dashboard/sales`, `/api/dashboard/ad`,
  `/api/dashboard/inventory`, `/api/dashboard/trend`
- Statistics: `GET /api/statistics?type=...`
- Traffic summary/monthly/upload: `/api/traffic/*`
- Supplier reports: `GET /api/supplier-stats?type=...`

## Main Data Models

Analytics reads, but does not own, order, channel, product, inventory, alert,
thumbnail, supplier, purchase, payment, and shipment tables for reporting.
Dashboard is the strictest surface because it owns raw SQL and report
hydration.

## Reporting Rules

- Metric formulas must not change without a scoped plan and behavior tests.
- Raw snapshots are audit/debug/replay evidence only; reporting APIs read daily
  facts and product/listing/account projections.
- Traffic CSV upload stays separate from `/api/ads/extension/sync`.
- If an owner domain changes read schema or mutation semantics consumed by
  analytics, update analytics readers in the same PR or record an explicit
  compatibility decision.

## Cross-Domain Reads

Analytics may directly read:

- Orders and line items for revenue and repurchase.
- Channel listings/options/daily snapshots/account KPI/scrape audit rows.
- Products/options for metadata, grade, category, and pricing inputs.
- Inventory, alerts, grade history, and thumbnails for dashboard snapshots.
- Supplier, supplier product, purchase order, supplier payment, and shipment
  tables for supplier and delivery reports.

## Boundary Rules

- Controllers use `@CurrentOrganization()`.
- ORM reads include `organizationId` on every tenant-owned table.
- Raw SQL uses Prisma tagged templates and binds organization predicates on
  every tenant-owned hop.
- `@Body()` / `@Query()` organizationId is forbidden.
- New raw SQL/report hydration belongs behind dashboard repository adapters.
- Traffic upload operation alerts go through the traffic operation-alert port,
  not direct `OperationAlertService` injection.

## Transitional Exceptions

- `statistics/`, `traffic/`, and `supplier-stats/` may stay flat until they
  gain raw SQL complexity, mutation invariants, or 500+ line service pressure.
