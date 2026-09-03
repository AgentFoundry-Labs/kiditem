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
- Sellpia 상품별 소진(재고관리): `POST /api/sellpia-product-sales/attempts`,
  `POST /api/sellpia-product-sales/attempts/:attemptId`,
  `POST /api/sellpia-product-sales/attempts/:attemptId/fail`,
  `GET /api/sellpia-product-sales/status`, `GET /api/sellpia-product-sales`
  (Sellpia owner attempt가 stat_prd_profit 을 상품×월별 immutable generation으로 적재하는 monthly-fact
  ingest 레인 + Inventory가 소유하는 공통 가용재고 read + 상품별
  1/2개월 평균 소진량·악성재고·시즌·현재고·가용재고
  (`availableStock === currentStock`)·발주 read)

## Main Data Models

Analytics reads, but does not own, order, channel, product, inventory, alert,
thumbnail, supplier, purchase, and payment tables for reporting.
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
- 상품 ABC 계산용 Analytics 포트는 현재 진행 월을 제외한 완결 월 facts를
  Products에 제공한다. Products가 평가 정책, 현재 평가 스냅샷, 계산, 이력, 최종
  `MasterProduct.abcGrade`를 소유하며 Analytics는 별도 상품 등급을 만들거나
  저장하지 않는다.
- Sellpia `stat_prd_profit` facts drive gross-profit ABC only when every
  ingested monthly row carries explicit `ORDER_TIME_SUPPLY_COST` and
  VAT-included provenance. Legacy or unknown-cost facts remain readable for
  depletion but are ineligible for gross-profit ABC.

## Cross-Domain Reads

Analytics may directly read:

- Orders and line items for revenue and repurchase.
- Channel listings/options/daily snapshots/account KPI/scrape audit rows.
- Products/options for metadata, grade, category, and pricing inputs.
- Inventory, alerts, current Products-owned ABC grade history, and thumbnails
  for dashboard snapshots.
- Supplier, supplier product, purchase order, and supplier payment tables for
  supplier reports.

## Boundary Rules

- Every tenant-owned table in an ORM or raw-SQL join remains
  organization-fenced. New report hydration belongs behind dashboard
  repository adapters.
- Traffic upload operation alerts go through the traffic operation-alert port,
  not direct `OperationAlertService` injection.

## Transitional Exceptions

- `statistics/`, `traffic/`, and `supplier-stats/` may stay flat until they
  gain raw SQL complexity, mutation invariants, or 500+ line service pressure.
