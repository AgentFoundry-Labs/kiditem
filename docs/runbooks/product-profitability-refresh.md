# Product Profitability Refresh

This runbook operates the automatic `ABC_V1` profitability refresh without
changing mappings or ABC criteria. Orders, order lines, paid timestamps, and
Wing collection are outside the ABC calculation boundary.

## Prerequisites

- Run from the KidItem repository root on the open release train.
- Apply the current Prisma schema and registered data migrations.
- Run the API on port 4000 and web app on port 3000.
- Prefer `npm run dev:all` for local QA. It enables the domain/composite
  OperationRun worker while leaving the scheduler disabled.
- Load the unpacked extension from `extensions/kiditem-os` and reload it after
  extension code changes.
- Sign in to the intended KidItem organization, Sellpia account, and Coupang
  advertising account in Chrome. Never copy session credentials to the server.
- Confirm the extension ping exposes the exact
  `profitabilityAdvertisingRefreshV1` capability.

## Ownership And Sequence

`products.refresh_profitability_evidence` is one composite OperationRun:

1. `inventory.refresh_sellpia_snapshot` with `scope: full` collects Sellpia
   identity/current-stock and the continuous product-profit range.
2. `advertising.refresh_profitability_spend` uses the code-owned Coupang
   **광고 보고서** route and creates one all-campaign, daily,
   campaign→ad-group→product report per calendar-month slice. It reads every
   virtualized report row, verifies its count and daily spend against the
   provider summary, and continues until the approximately 400-day range has
   authoritative listing-day coverage. Generic configured dashboard targets
   cannot replace this fixed profitability contract. One owned report window
   is reused across slices, and the server plans from at most one aggregate
   coverage row per day instead of loading the full listing-day matrix.
3. `products.recalculate_profitability_abc` reads the completed evidence and
   publishes one evaluation per currently selling product. A selling product
   has an active master, active marketplace account, and active catalog
   listing/option without an explicit stopped/deleted/rejected sale status.
   Grades left on products that leave this cohort are cleared during the same
   publication.

The separate Product Management **재고 동기화** button starts only
`inventory.refresh_sellpia_snapshot` with `scope: inventory`. It must not
change `MasterProductAbcEvaluation.calculatedAt`.

Mapping is a read-only identity input. The refresh never changes a recipe or
creates a product mapping. Unresolved identity produces `SOURCE_UNMAPPED`. A
stale Sellpia or Advertising source preserves the last normal A/B/C grade and
records the current abnormal status. Paid-order coverage does not affect ABC.

## Operator Flow

1. Open `/product-hub` and select the `데이터 기준` chip.
2. In `상품 운영 데이터 현황`, inspect Traffic, Advertising, Sellpia profit,
   and ABC coverage/capture times. Review aggregate mapping blockers.
3. Choose **수익성 데이터 갱신** once. Do not start a duplicate parent while
   the modal shows `갱신 중`.
4. Keep the authenticated provider tabs and extension enabled. The browser
   worker resumes bounded advertising slices after suspension or navigation.
   Initial history collection creates the missing monthly reports; later runs
   reuse completed coverage and recollect only the correction window.
5. Wait for the parent to finish. Values and the header date advance only
   after durable producer publication; starting or failing a run does not
   blank existing Product Management values.
6. Confirm Dashboard, Product Management, and Product Outflow show the same
   stored grade/status.

## Evidence Checks

- Sellpia coverage is gap-free through yesterday KST and uses
  `ORDER_TIME_SUPPLY_COST` with explicit VAT provenance.
- Advertising coverage is `OBSERVED` or `CONFIRMED_ZERO` for every expected
  active mapped listing-day. A traffic-created numeric zero is not ad evidence.
- Mapping is unique and verified at the recorded inventory generation.
- Observation duration starts at the earliest nonzero Sellpia product-profit
  bucket and affects score shrinkage only; it never delays grade publication.
- Product Management displays existing daily facts. A metric with no producer
  evidence is `—`; only an explicitly covered zero is `0`.
- The evaluation persists the cutoff, independent source ranges/timestamps,
  formula checksum, cost components, and status.

## Recovery

| Symptom | Safe action |
|---|---|
| Sellpia login or contract failure | Restore the intended Sellpia session, reload the extension, and retry the failed parent. |
| Advertising login required | Sign in to Coupang Ads in Chrome, then retry; do not publish a manual zero. |
| Advertising slice incomplete | Leave the provider tab available and retry the parent. Completed slices are not repeated. |
| `SOURCE_UNMAPPED` | Inspect `/product-hub/matching`; correct the mapping through its owning operator flow, then start a new refresh. |
| Parent cancelled | Confirm the active child is cancelled, then start a new parent. |
| Inventory only required | Use **재고 동기화**, not the profitability refresh. |

## Verification

```bash
rtk npm run db:push
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk npm run test:scripts
rtk npm run db:erd
rtk node --test extensions/tests/coupang-ads-scraper/ads-report.test.mjs extensions/tests/coupang-ads-scraper/profitability-report.test.mjs extensions/tests/coupang-ads-scraper/collection-window.test.mjs extensions/tests/kiditem-os-service-worker-boot.test.mjs
```

Boot `OPERATION_RUNTIME_WORKER_ENABLED=1 rtk npm run dev:server` only when
another API listener is not already running. For a live QA, report OperationRun identifiers, sanitized coverage
dates/statuses, counts, and checksums only. Never paste provider payloads,
cookies, tokens, HTML, workbook content, or extension-private tab identifiers.

## Blockers

Stop when the active organization/provider account is ambiguous, the provider
cannot prove complete coverage, a source would require fabricated timestamps or
zeroes, a required schema/build/test gate fails, or recovery would require a
direct database mutation.

## Final Report

Report the parent and child statuses, Sellpia/Advertising/Mapping
coverage state, classified/retained/unclassified counts, inventory-only
independence, exact automated gates, live Chrome checks, and any blocker. Do
not include raw business rows or authentication material.
