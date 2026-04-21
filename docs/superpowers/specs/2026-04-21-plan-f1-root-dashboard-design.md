# Plan F1 — Root Dashboard Rewire + dashboard-sales Implementation (Design Doc)

**Status**: Draft v1
**Date**: 2026-04-21
**Predecessors**: Plan D.1 (profit-loss live aggregation, ADR-0016), Plan D.3 (sales-analysis live aggregation), Plan E.1 (apiClient.getParsed pattern), Plan IDOR sweep (ADR-0018)
**Successors**: F2 (products frontend rewire), F3 (inventory/orders frontend), D.3b (`/sales-analysis` subtabs)
**Related ADRs**: ADR-0006, ADR-0016, ADR-0018

---

## Goal

루트 대시보드 (`apps/web/src/app/page.tsx` at `/`) 정상 동작 복구 + 중단된 `DashboardSalesService` 스텁 구현. 랜딩 페이지 KPI/차트/경고 위젯이 실제 수치로 렌더.

## Why now

1. **사용자 체감 최악**: 로그인 직후 첫 화면이 깨짐
   - `Cannot GET /api/products/pipeline-stats` (404)
   - `Not implemented: Plan B2c migration` (500 on `/api/dashboard/sales`)
   - `dashboard-inventory.warnings` 3 필드 모두 0
   - `dashboard-trend.avgProfitRate` = 0
2. ADR-0016 Scope 기준 dashboard-inventory + dashboard-trend 는 원래 D.4 범위. F1 이 D.4 를 rebrand + 확장 (dashboard-sales 구현 + frontend rewire).
3. `PipelineCounts` shared drop 후 frontend 가 stale call 유지. E.1 의 `apiClient.getParsed` + Zod 로 drift 재발 방지.

## Scope — In

**Server**:
- `dashboard-sales.service.ts` 전면 구현 (현재 stub)
- `dashboard-inventory.service.ts` warnings block 교체 (profitLoss.findMany → live aggregation)
- `dashboard-trend.service.ts` avgProfitRate 교체 (profitLoss.aggregate → calculateProfitForRange)
- `DashboardSalesSummary` Zod schema 는 이미 shared 에 존재 — 변경 없음

**Server tests**:
- `dashboard-sales.pg.integration.spec.ts` NEW (~6 tests)
- `dashboard-inventory.pg.integration.spec.ts` 재작성 (seed Order/LineItem/Ad → warnings)
- `dashboard-trend.pg.integration.spec.ts` 재작성 (seed Order → avgProfitRate)

**Frontend**:
- `apps/web/src/app/page.tsx` 전면 rewire — `apiClient.getParsed` + Zod + pipelineStats 삭제
- `apps/web/src/app/__tests__/page.spec.tsx` NEW (5-6 tests)

## Scope — Out

- `/products` page (F2), `/inventory /orders /image-hub /thumbnail-editor` (F3), `/ad-ops` (F4/Plan E)
- `action-task.service` profitLoss readers (D.5)
- `statistics`, `settlements`, `sales-plans` services (D.3b)
- `ad-strategy.service` (Plan E)
- `DashboardSalesSummary` 스키마 필드 추가/변경 (구현만)
- URL state for `kpiRange` (local state 유지; F1.1 후속)
- Root page sub-components 구조 리팩터 (MetricCard, SidePanel, DashboardChart)
- `planAchievement` 필드 실제 구현 (null 반환; D.3b 후 F1.2 또는 D.3b 흡수)
- `traffic.service.ts` IDOR 수정 (별도 domain plan)

## Context (audit 확정)

### C.1 루트 페이지 useQuery 8개

| # | 엔드포인트 | 현재 | F1 후 |
|---|---|---|---|
| 1 | `GET /api/dashboard/sales` (baseline) | 500 stub | 정상 live agg |
| 2 | `GET /api/dashboard/ad` (baseline) | ✅ | unchanged |
| 3 | `GET /api/dashboard/inventory` | warnings=0 | warnings 실수치 |
| 4 | `GET /api/dashboard/trend?range=30d` | avgProfitRate=0 | 실수치 |
| 5 | `GET /api/dashboard/sales?range=...` | 500 | 정상 |
| 6 | `GET /api/dashboard/ad?range=...` | ✅ | unchanged |
| 7 | `GET /api/action-tasks` | ✅ | unchanged |
| 8 | `GET /api/products/pipeline-stats` | **404 drop** | **삭제** |
| + | `GET /api/agent-registry/org` | ✅ | unchanged |

### C.2 `PipelineCounts` drop 상태

- shared 에서 drop 확인 (grep 0 hits)
- 루트 페이지 inline subset `{gradeA, gradeB, gradeC, total}` 선언
- 대체: `DashboardInventorySummary.gradeCount: Record<string,number>` + `.totalProducts` (이미 fallback 로직 L463-467 존재)
- `/products` 페이지 의 동일 엔드포인트 호출은 F2 — 본 F1 건드리지 않음

### C.3 ProfitLoss readers (dashboard)

1. `dashboard-inventory.service.ts:57` — `findMany({ where: { companyId, year, month }, select: { netProfit, revenue, adCost } })` → warnings 카운트 (빈 테이블 → 0)
2. `dashboard-trend.service.ts:18` — `aggregate({ where: { companyId }, _sum: { revenue, netProfit } })` → avgProfitRate (빈 테이블 → 0)
3. `dashboard-sales.service.ts` — stub (profitLoss 안 읽음)

### C.4 재사용 helpers

- `dashboard/helpers/profit-calculator.ts:calculateProfitForRange(prisma, companyId, from, to) → RangeProfitMetrics`
- `dashboard/helpers/ad-aggregator.ts:aggregateAdForRange`
- `dashboard/helpers/wing-ad-summary.ts:fetchWingAdSummary`
- `dashboard/helpers/percent.ts` (pct1/pct2)

### C.5 기존 integration test

- `dashboard-inventory.pg.integration.spec.ts` (4 tests, IDOR T4) — seed 에 `profitLoss.create` 사용 → rewrite 필요
- `dashboard-trend.pg.integration.spec.ts` (4 tests, IDOR T2) — 동일

IDOR_SENTINEL + cross-tenant isolation 로직 유지, 값 assertion 만 live aggregation 기반 재계산.

---

## Architecture

### A.1 `DashboardSalesService.getSummary(ctx, companyId)` 설계

**입력**: `DashboardContext` + `companyId: string`
- `ctx.{monthStart, monthEnd, prevMonthDate, dateRange, now, year, month}` 사용

**Promise.all 병렬 fetch**:
1. `calculateProfitForRange(monthStart, monthEnd)` — 이번 달 metrics
2. `calculateProfitForRange(prevMonthDate, monthStart)` — 전월
3. `calculateProfitForRange(dateRange.start, dateRange.end)` — rangeKpi current
4. `calculateProfitForRange(dateRange.prevStart, dateRange.prevEnd)` — rangeKpi prev
5. `$queryRaw today` — KST boundary, `{revenue, orderCount}`
6. `$queryRaw topProducts` — monthly top-N (JOIN listing + master + option), top 5-10 per revenue
7. `$queryRaw dailyRevenue` — current month per-day buckets
8. `$queryRaw monthlyTrend` — last 6 months buckets (revenue + orderCount; profit 계산은 `calculateProfitForRange` per-month 로 derive)
9. `fetchWingAdSummary(year, month, monthStart)` — optional Wing override (trafficKpi.adSummary + lastSyncAt)

**모든 $queryRaw 는 ADR-0018 Rule 2 준수**: `WHERE company_id = ${companyId}::uuid`

**Return mapping** → `DashboardSalesSummary` (shared 스키마 준수):
- `today` = raw SQL today result
- `monthly` = cur/prev `calculateProfitForRange` 비교 (revenue, profit, adRate, changes)
- `topProducts` = raw SQL + resolvePricing 파생 costPrice → `TopProduct[]`
- `monthlyTrend` = 6-month buckets + per-month `calculateProfitForRange` (loop) OR raw SQL + avgRate 적용 (성능 trade-off 결정 필요)
- `profitDetail` = current month RangeProfitMetrics → ProfitBreakdown shape (필드 일치)
- `rangeKpi` = range cur/prev 비교
- `dailyRevenue` = per-day raw SQL
- `trafficKpi` = Wing passthrough + Order 기반 orders/visitors 집계 (또는 Wing only)
- `planAchievement = null` (F1 범위 밖)
- `lastSyncAt` = Wing.lastSyncAt fallback null

### A.2 `dashboard-inventory.service.ts` warnings rewire

**현재**: `profitLoss.findMany` → 3 JS filter counters → 0
**F1 후**: `buildPerListingMetrics(monthStart, monthEnd)` → per-listing 배열 → 동일 3 counters

**`buildPerListingMetrics`** (신규 helper `dashboard/helpers/per-listing-metrics.ts`):
- 시그니처: `(prisma, companyId, from, to) → Array<{listingId, revenue, costOfGoods, commission, shippingCost, adCost, otherCost, netProfit, profitRate, orderCount}>`
- 내부 쿼리: `profit-loss.service.ts:findAll` 의 per-listing 루프 재구현
  - `order.findMany` with nested `lineItems.{option.{costPrice, commissionRate, otherCost}, listingOption.listing}`
  - `ad.groupBy({ by: ['listingId'], _sum: { spend } })`
  - Revenue-weighted shipping 분배 (R-1)
- Return 미포함 (v1) — D.3b 재검토

**단일 요청 중복 호출 주의**: dashboard-sales.topProducts 도 per-listing 필요 → F1 에서는 각 service 에서 독립 호출 (별도 optimization plan). 성능 issue 발현 시 재검토.

### A.3 `dashboard-trend.service.ts` avgProfitRate rewire

**현재**: company lifetime 전체 aggregate → 항상 0
**F1 후**: `calculateProfitForRange(since, now)` → trend 윈도우 내 평균

```ts
const profitMetrics = await calculateProfitForRange(prisma, companyId, since, new Date());
const avgProfitRate = profitMetrics.revenue > 0
  ? profitMetrics.netProfit / profitMetrics.revenue
  : 0;
```

**Semantic 변경**: lifetime → 윈도우 내. 정확도 개선. 릴리스 노트 문서화.

### A.4 루트 `page.tsx` rewire 원칙

1. **Data 경로 유지** — 컴포넌트 props 동일, Zod 파싱 레이어만 삽입
2. **Section-level error 유지** — per-widget retry UX 필요해서 `SectionError` 유지. 단 `friendlyError` 로 에러 문자열 생성 일관화
3. **pipelineStats 삭제** — L133-137 useQuery 제거 + L463-467 fallback 단순화
4. **Local state 유지** — `kpiRange`/`dateFrom`/`dateTo` useState 그대로. URL migration 은 F1.1

### A.5 Wing snapshot override

- DashboardAd: monthly ad metrics override (IDOR T3 에서 companyId bound, 유지)
- DashboardSales: trafficKpi 섹션에서만 Wing 참조. monthly.revenue 는 항상 Order 기반

---

## Invariants

| # | Invariant | 검증 |
|---|---|---|
| I1 | `DashboardSalesService` returns valid `DashboardSalesSummary` shape | `satisfies DashboardSalesSummary` + client Zod parse |
| I2 | 모든 쿼리 companyId scoped | ADR-0018 + `npm run check:idor` |
| I3 | ProfitLoss 테이블 read 불가 (3 dashboard services) | grep post-F1 = 0 |
| I4 | warnings.minusProduct = count(netProfit<0) per-listing | integration test explicit count |
| I5 | avgProfitRate = netProfit/revenue over trend window | integration test math |
| I6 | Pipeline-stats 호출 0건 in root page | grep = 0 |
| I7 | apiClient.get → getParsed migration (root page) | grep `apiClient\.get<` = 0 (PATCH/POST 제외) |
| I8 | Wing override 는 ad-domain only (sales 는 trafficKpi 만) | code review |
| I9 | 기존 tests green post-rewrite | 188+ pass |

---

## Data flow

```
Root page (page.tsx)
  ├─ kpiRange local state
  └─ 8 × apiClient.getParsed(url, Schema)
      ├─ /api/dashboard/sales (baseline+range) ─┐
      ├─ /api/dashboard/ad (baseline+range) ────┤
      ├─ /api/dashboard/inventory ──────────────┤
      ├─ /api/dashboard/trend?range=30d ────────┼─→ NestJS services
      ├─ /api/action-tasks ─────────────────────┤   (dashboard module)
      └─ /api/agent-registry/org ───────────────┘

NestJS services
  ├─ DashboardSalesService ← calculateProfitForRange×4 + raw SQL×4 + fetchWingAdSummary
  ├─ DashboardInventoryService ← buildPerListingMetrics (NEW) + existing 8 queries
  ├─ DashboardTrendService ← calculateProfitForRange + existing per-day raw SQL
  └─ DashboardAdService ← unchanged

Prisma live aggregation (Order + LineItem + Ad)
  NO ProfitLoss reads (ADR-0016 bypass)
```

---

## Test plan

### Tier 1 — Server integration (real PG)

**`dashboard-sales.pg.integration.spec.ts`** NEW:
- T1: baseline monthly KPIs — TEST seeded Order+LineItem+Ad → revenue/profit correct
- T2: IDOR isolation — OTHER IDOR_SENTINEL excluded
- T3: rangeKpi week — prev comparison correct
- T4: empty company — zero-valued structure, no error
- T5: Wing override — seeded wing AdSnapshot → trafficKpi.adSummary + lastSyncAt
- T6: topProducts DESC ordering

**`dashboard-inventory.pg.integration.spec.ts`** rewrite (4 tests + 1 new):
- T1-T3: same IDOR + empty (seed switch: no profitLoss rows; use Order/LineItem/Ad)
- T4: warnings semantics — seed 1 order with costPrice>revenue → minusProducts=1 (replaces current profitLoss-based T4)
- T5 NEW: multi-warning seed — minus + lowProfit + highAd = 3 separate warnings

**`dashboard-trend.pg.integration.spec.ts`** rewrite (4 tests):
- T1-T2: IDOR (unchanged structurally; seed switch)
- T3: fresh company returns []
- T4: avgProfitRate math — seed 1 order (totalPrice=100_000, option costPrice=50_000, commissionRate=0.1, shippingPrice=10_000, no ad) → netProfit=30_000, rate=0.3, day's profit=9_000

### Tier 2 — Frontend RTL

**`apps/web/src/app/__tests__/page.spec.tsx`** NEW (5-6 tests):
- T1: loading — `getParsed` hang → `PageSkeleton variant="dashboard"`
- T2: success — stubbed Zod-valid data → KPI cards render
- T3: 502 on one query → SectionError for that widget only
- T4: Zod drift → 응답 형식 오류
- T5: pipeline-stats NOT called — spy on apiClient.get asserts no call with that URL
- T6 (optional): gradeCount → Grade cards mapping correctness

### Tier 3 — Manual smoke

- dev:server + web dev
- Visit `/` — all widgets render, no 404/500
- DevTools Network: no `/api/products/pipeline-stats`

---

## Execution strategy

| Task | Scope | Review |
|---|---|---|
| T1 | `buildPerListingMetrics` helper extraction | 1 combined |
| T2 | `DashboardSalesService` full implementation + integration spec (NEW) | 2-stage |
| T3 | `DashboardInventoryService` warnings rewire + spec rewrite | 2-stage |
| T4 | `DashboardTrendService` avgProfitRate rewire + spec rewrite | 2-stage |
| T5 | Root `page.tsx` rewire + RTL tests (NEW) | 2-stage |
| T6 | Verification (full test suite + check:idor + dev:server) + release note | no review |

예상: 6 tasks, 6-8 commits, ~20 subagent dispatches.

---

## Review cadence

- T1: 1 combined (docs/trivial helper)
- T2-T5: 2-stage (service/UI changes)
- T6: no review (self-evidencing)
- Plan writing 5-reviewer: 유지

---

## Deferred / Successors

- **URL state** for kpiRange — F1.1
- **`planAchievement` 실제 구현** — D.3b 후 F1.2 또는 D.3b 흡수
- **TrafficStats 연동** — traffic domain plan
- **`SectionError` → `ErrorState` 통일** — UI refactor plan
- **per-request memoization** (buildPerListingMetrics 중복 호출 최적화) — 성능 이슈 발현 시
- **Root page mobile layout** — UI refactor plan

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| `buildPerListingMetrics` ↔ `profit-loss.service.findAll` 로직 중복 | Medium | Code review 에서 decide: extract shared vs. accept duplication. 현재 선택: 가능하면 shared. |
| 10-query Promise.all 성능 | Medium | dashboard-ad 이미 유사 패턴. latency log 추가. |
| 기존 test rewrite 시 semantic drift | High | 새 assertion 작성 → 기존 assertion 값 재계산 → old spec 삭제 순 |
| Wing override semantic drift | Low | F1 결정 고정 (sales trafficKpi only) |
| RTL test dynamic import 처리 | Medium | `vi.mock('next/dynamic')` 패턴 적용 |
| ProfitLoss writer 영원히 부재 | Low | ADR-0016 이미 문서화, Plan E 에서 검토 |

---

## Open questions

1. `planAchievement` null UI 영향 (page.tsx L604 inspect 필요)
2. `buildPerListingMetrics` 파일 위치 (`dashboard/helpers/` vs. `finance/` 공유)
3. `TopProduct.company` 필드 의미 (ChannelListing.channel? 다른 이름?)
4. Wing snapshot override 테스트 범위 (passthrough vs. override logic)
5. `dashboard-sales.monthlyTrend` 의 per-month profit 계산 방식 (loop `calculateProfitForRange` vs. avgRate 곱하기)
6. `SectionError` 안에서 `friendlyError` 조합 구체화

---

**Next step**: 3-reviewer adversarial (critic + architect + code-reviewer) on this spec → v2 → plan writing.
