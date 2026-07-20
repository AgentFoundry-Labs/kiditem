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
- Sellpia 판매현황 몰별 매출: `POST /api/sellpia-sales/ingest`,
  `GET /api/sellpia-sales` (확장이 Sellpia sale_summary 를 몰별로 수집해 적재하는
  daily-fact ingest 레인 + 대시보드 read)
- Sellpia 상품별 소진(재고관리): `POST /api/sellpia-product-sales/ingest`,
  `GET /api/sellpia-product-sales`
  (확장이 Sellpia stat_prd_profit 을 상품×월별로 수집해 적재하는 monthly-fact
  ingest 레인 + Inventory가 소유하는 공통 가용재고 read + 상품별
  1/2개월 평균 소진량·ABC·악성재고·시즌·현재고·약정·가용재고·발주 read)

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
- 상품별 소진의 재고 매칭은 상품코드 exact → 옵션코드 exact → 유일한
  바코드 순서만 허용한다. 미수집, 미연결, inactive, 중복 바코드를 품절 0으로
  바꾸지 않으며, 발주·악성재고 계산은 확정 매칭된 공통 `availableStock`만 쓴다.
- 같은 Sellpia SKU로 resolve된 판매 행은 소진·발주 계산 전에 SKU 단위로 합산한다.
  `reorderCount`와 `deadStockCount`는 distinct SKU를 한 번만 센다.

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
