# Plan F1 — Root Dashboard Rewire + dashboard-sales Implementation (Design Doc)

**Status**: Draft v2 (3-reviewer findings applied)
**Date**: 2026-04-21
**Predecessors**: Plan D.1 (profit-loss live aggregation, ADR-0016), Plan D.3, Plan E.1, Plan IDOR sweep (ADR-0018)
**Successors**: F2 (products frontend), F3 (inventory/orders frontend), D.3b
**Related ADRs**: ADR-0006, ADR-0016, ADR-0018

---

## Goal

루트 대시보드 (`apps/web/src/app/page.tsx` at `/`) 정상 동작 복구 + 중단된 `DashboardSalesService` 스텁 구현. 랜딩 페이지 KPI/차트/경고 위젯이 실제 수치로 렌더.

## Why now

1. **사용자 체감 최악**: 로그인 직후 첫 화면이 깨짐
2. ADR-0016 Scope 기준 dashboard-inventory + dashboard-trend 는 원래 D.4 범위. F1 = D.4 rebrand + dashboard-sales 구현 + frontend rewire 포함.
3. `PipelineCounts` drop 후 frontend stale call. E.1 의 `apiClient.getParsed` + Zod 패턴 drift 방지.

## v2 변경 요약 (3-reviewer 적용)

| # | 소스 | 변경 |
|---|---|---|
| R-02 CRITICAL / A-01 MED | code-reviewer + architect | `buildPerListingMetrics` 를 **`common/per-listing-profit.ts` 추출** — `profit-loss.service.findAll` 과 공유. Duplication 없이 both import. |
| R-07 CRITICAL | code-reviewer | Test seed 값 정확히 기재 (OrderLineItem.totalPrice + costPrice + commission + shipping). `profitRate` (percentage) vs `netProfit/revenue` (ratio) 구분. |
| C-02 MAJOR | critic | `monthlyTrend` 전략 = **per-month loop `calculateProfitForRange`** (avgRate 거부, ADR-0016 정신 따름) |
| C-03 MAJOR / R-04 LOW | both | `topProducts N = 10`, `TopProduct.company = ChannelListing.channelName` |
| R-01 HIGH | code-reviewer | `monthly.adRate` 공식 명시: `cur.revenue > 0 ? Math.round((cur.adCost / cur.revenue) * 1000) / 10 : 0` |
| R-05 HIGH | code-reviewer | `profitDetail` field subset 명시 (8 fields from RangeProfitMetrics) |
| R-09 MEDIUM | code-reviewer | `SectionError` props `{msg?, onRetry}` 확장 + 모든 call site 에 `friendlyError(err)` 전달 |
| Critic "missing" | critic | **dashboard-trend `SUM(orders.total_price)` I3 위반 F1 에서 같이 fix** → JOIN OrderLineItem + `SUM(oli.total_price)` |
| R-12 HIGH | code-reviewer | `planAchievement: null` 명시 반환 |
| R-03 MEDIUM | code-reviewer | `trafficKpi.adSummary = wing.rawAdSummary`, `lastSyncAt = wing.lastSyncAt.toISOString()` |
| R-06 MEDIUM | code-reviewer | Test seed `externalOrderId` 접두어 (`INV-/TREND-/SALES-`) + company prefix |
| A-12 LOW | architect | `DashboardSalesService` entry/exit `logger.debug` (dashboard-trend 패턴) |
| A-04 MEDIUM | architect | ADR-0016 reader count post-F1 업데이트 (8 → 6) in release note |

## Scope — In

**Server**:
- **`common/per-listing-profit.ts`** NEW — `buildPerListingMetrics(prisma, companyId, from, to) → Array<{listingId, channelName, masterName, revenue, costOfGoods, commission, shippingCost, adCost, otherCost, netProfit, profitRate, orderCount}>`. Shared between finance (`profit-loss.service.findAll`) + dashboard (F1 inventory).
  - 로직: `profit-loss.service.findAll:42-168` 의 per-listing 집계 루프 추출 (3-hop listingOption chain + resolvePricing + revenue-weighted shipping + ad.groupBy)
  - `profit-loss.service.findAll` 은 이 helper 호출 + 기존 추가 logic (filter/sort) 유지
- `dashboard-sales.service.ts` **전면 구현** (stub → live aggregation, D.1 패턴)
- `dashboard-inventory.service.ts` warnings block 교체 (`profitLoss.findMany` → `buildPerListingMetrics`)
- `dashboard-trend.service.ts`:
  - `profitLoss.aggregate` → `calculateProfitForRange` (avgProfitRate)
  - **I3 fix**: `SUM(orders.total_price)` → JOIN + `SUM(oli.total_price)` (B2c.dashboard canonical)
- `DashboardSalesSummary` Zod schema 변경 없음

**Server tests**:
- `dashboard-sales.pg.integration.spec.ts` NEW (6 tests)
- `dashboard-inventory.pg.integration.spec.ts` 재작성 (seed switch + warnings T5 추가)
- `dashboard-trend.pg.integration.spec.ts` 재작성 (seed switch + I3 assertion)
- Test seed `externalOrderId` 접두어: `SALES-T-1`, `INV-T-1`, `TREND-T-1` 등 — 충돌 방지

**Frontend**:
- `apps/web/src/app/page.tsx` 전면 rewire:
  - 8 `apiClient.get<T>` → `apiClient.getParsed(url, Schema)`
  - `pipelineStats` useQuery (L133-137) **삭제** + fallback 단순화
  - `SectionError` props 확장 `{ msg?: string; onRetry: () => void }` → `msg` render (hardcoded 문자열 대체), 기본값 `이 섹션을 불러올 수 없습니다`
  - 모든 SectionError call site 에 `msg={friendlyError(err) ?? undefined}` 전달
- `apps/web/src/app/__tests__/page.spec.tsx` NEW (6 tests)

## Scope — Out

- F2/F3/F4/Plan E/D.3b/D.5 영역 (메모리 handoff 참조)
- `DashboardSalesSummary` 스키마 필드 추가/변경 (구현만)
- URL state for `kpiRange` (F1.1)
- `calculateProfitForRange` 를 `common/` 이전 (이번은 `per-listing-profit.ts` 만)
- Root page sub-components 리팩터 (MetricCard, SidePanel, DashboardChart)
- `planAchievement` 필드 실제 구현 (null; D.3b 흡수)
- TrafficStats 실제 연동
- `SectionError` → `ErrorState` 통일 (UI refactor plan)
- Performance optimization (connection pool tuning, per-request memoization)

## Context (audit 확정 + v2 추가)

(기존 C.1-C.5 유지 — v1 과 동일. 아래는 v2 추가 발견사항)

### C.6 `dashboard-trend` 현재 I3 위반

`dashboard-trend.service.ts:28-34`:
```sql
SELECT TO_CHAR(ordered_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS date,
       COALESCE(SUM(total_price), 0)::int AS revenue
FROM orders
WHERE company_id = ${companyId}::uuid AND ordered_at >= ${since}
```

이는 `SUM(Order.totalPrice)` — 현재 B2c.dashboard I3 invariant ("revenue = SUM(lineItem.totalPrice), never SUM(order.totalPrice)") 위반. Plan B2c.dashboard 가 channel-dashboard 서비스에만 적용했으므로 legacy 상태.

**F1 T4 에서 같이 fix**:
```sql
SELECT TO_CHAR(o.ordered_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS date,
       COALESCE(SUM(oli.total_price), 0)::int AS revenue
FROM orders o
JOIN order_line_items oli ON oli.order_id = o.id
WHERE o.company_id = ${companyId}::uuid AND o.ordered_at >= ${since}
```

### C.7 `TopProduct.company` mapping

`packages/shared/src/schemas/dashboard.ts:23-31` `TopProductSchema.company: z.string()` 필수.
**F1 결정**: `company = ChannelListing.channelName ?? ChannelListing.channel ?? '미지정'`.

### C.8 ProfitLoss reader count post-F1

Pre-F1: 8 remaining (ADR-0016 Scope boundaries table)
Post-F1: 6 remaining (dashboard-inventory + dashboard-trend 제거)
Release note 에 update 반영.

---

## Architecture

### A.1 `common/per-listing-profit.ts` (NEW 공유 helper)

**Signature**:
```ts
export interface PerListingMetrics {
  listingId: string;
  channelName: string | null;
  channel: string;
  masterId: string;
  masterName: string;
  revenue: number;           // SUM(lineItem.totalPrice)
  costOfGoods: number;       // SUM(option.costPrice * quantity)
  commission: number;        // revenue * option.commissionRate
  shippingCost: number;      // revenue-weighted share of Order.shippingPrice
  adCost: number;            // sum of Ad.spend per listingId
  otherCost: number;         // SUM(option.otherCost * quantity)
  netProfit: number;         // revenue - costOfGoods - commission - shippingCost - adCost - otherCost
  profitRate: number;        // percentage, 1 decimal (30.0 == 30%)
  orderCount: number;        // DISTINCT order count per listing
}

export async function buildPerListingMetrics(
  prisma: PrismaService,
  companyId: string,
  from: Date,
  to: Date,
): Promise<PerListingMetrics[]>
```

**로직** (profit-loss.service.findAll 추출):
1. 3 Promise.all:
   - `prisma.order.findMany({ where: { companyId, orderedAt: [gte, lt), status notIn EXCLUDED }, include: { lineItems: { include: { option, listingOption: { include: { listing: { include: { master } } } } } } } })`
   - `prisma.orderReturnLineItem.findMany(...)` — v1 에서는 return-cost 제외 (D.3b 에서 추가)
   - `prisma.ad.groupBy({ by: ['listingId'], where: { companyId, date: [gte, lt) }, _sum: { spend } })`
2. Per-order revenue-weighted shipping distribution (R-1)
3. `resolvePricing(option)` 로 costPrice/commissionRate/otherCost 확정
4. Group by listingId → PerListingMetrics[]
5. **ADR-0018 compliance**: companyId scoped throughout

**`profit-loss.service.findAll` 변경**:
```ts
// BEFORE: inline per-listing loop
// AFTER: const metrics = await buildPerListingMetrics(this.prisma, companyId, from, to);
// then filter/sort per existing logic
```

**ADR-0006 self-contained 도메인**: helper 는 `common/` 에 위치 — finance/dashboard 둘 다 직접 import. Pure function + DI 인자 (no @Injectable). 기존 `calculateProfitForRange` 패턴 동일.

### A.2 `DashboardSalesService.getSummary(ctx, companyId)` 설계 (v2 상세)

**Promise.all 병렬 fetch** (9 tasks):
```
1. calculateProfitForRange(ctx.monthStart, ctx.monthEnd)         // 이번 달
2. calculateProfitForRange(ctx.prevMonthDate, ctx.monthStart)    // 전월
3. calculateProfitForRange(ctx.dateRange.start, ctx.dateRange.end)      // rangeKpi cur
4. calculateProfitForRange(ctx.dateRange.prevStart, ctx.dateRange.prevEnd) // rangeKpi prev
5. $queryRaw today KPIs (revenue, orderCount) — KST boundary, company_id 바인딩
6. $queryRaw topProducts — 10 rows, SUM(oli.total_price) DESC, JOIN listing + master + option
7. $queryRaw dailyRevenue — current month per-day, SUM(oli.total_price)
8. calculateProfitForRange loop × 6 months (monthlyTrend) — **Q2 결정: loop**
9. fetchWingAdSummary(year, month, monthStart)
```

**`monthly` 매핑 (R-01 explicit)**:
```ts
const cur = promise1Result; // RangeProfitMetrics
const prev = promise2Result;
monthly = {
  revenue: cur.revenue,
  profit: cur.netProfit,                                           // ratename
  adRate: cur.revenue > 0 ? Math.round((cur.adCost / cur.revenue) * 1000) / 10 : 0,  // percentage 1 decimal
  prevRevenue: prev.revenue,
  prevProfit: prev.netProfit,
  revenueChange: prev.revenue > 0 ? Math.round(((cur.revenue - prev.revenue) / prev.revenue) * 1000) / 10 : 0,
  profitChange: prev.netProfit !== 0 ? Math.round(((cur.netProfit - prev.netProfit) / Math.abs(prev.netProfit)) * 1000) / 10 : 0,
  prevAdRate: prev.revenue > 0 ? Math.round((prev.adCost / prev.revenue) * 1000) / 10 : 0,
};
```

**`profitDetail` 매핑 (R-05 explicit 8 fields subset)**:
```ts
profitDetail = {
  revenue: cur.revenue,
  costOfGoods: cur.costOfGoods,
  commission: cur.commission,
  shippingCost: cur.shippingCost,
  adCost: cur.adCost,
  otherCost: cur.otherCost,
  netProfit: cur.netProfit,
  orderCount: cur.orderCount,
} satisfies ProfitBreakdown;
// profitRate, adRevenue, adImpressions, adClicks, adConversions 는 ProfitBreakdown 에 없음 — drop
```

**`topProducts` (N=10, company=channelName)**:
```sql
SELECT
  mp.id,
  mp.name,
  cl.channel_name AS company,    -- ChannelListing.channelName (null → '미지정')
  mp.abc_grade AS grade,
  SUM(oli.total_price)::int AS revenue,
  SUM(oli.quantity)::int AS quantity
FROM orders o
JOIN order_line_items oli ON oli.order_id = o.id
JOIN channel_listing_options clo ON clo.id = oli.listing_option_id
JOIN channel_listings cl ON cl.id = clo.listing_id
JOIN master_products mp ON mp.id = cl.master_id
WHERE o.company_id = ${companyId}::uuid
  AND o.ordered_at >= ${monthStart}
  AND o.ordered_at < ${monthEnd}
  AND o.status NOT IN (${...EXCLUDED_ORDER_STATUSES})
GROUP BY mp.id, mp.name, cl.channel_name, mp.abc_grade
ORDER BY revenue DESC
LIMIT 10
```
Then JS loop: 각 row 에 대해 `resolvePricing(option)` 로 netProfit 파생. Or 단순화: revenue-based netProfit 추정 (top10 는 요약 표시라 정밀도보다 빠른 렌더 중시).

**`monthlyTrend` (Q2 결정: loop)**:
```ts
const monthOffsets = [0, 1, 2, 3, 4, 5]; // 현재 + 이전 5개월
const trends = await Promise.all(monthOffsets.map(async (offset) => {
  const monthStart = subMonths(ctx.monthStart, offset);
  const monthEnd = addMonths(monthStart, 1);
  const metrics = await calculateProfitForRange(prisma, companyId, monthStart, monthEnd);
  return {
    period: format(monthStart, 'yyyy-MM'),
    revenue: metrics.revenue,
    profit: metrics.netProfit,
    adCost: metrics.adCost,
  };
}));
// Reverse to chronological order
monthlyTrend = trends.reverse();
```
- 성능: 6 × ~3 Prisma queries = ~18 queries 추가. Total F1 dashboard-sales = ~27 queries. Latency 추정 200-600ms (dev DB 작은 데이터셋). Observability 로 실측.

**`trafficKpi` 매핑 (R-03 explicit)**:
```ts
const wing = await fetchWingAdSummary(prisma, companyId, year, month, monthStart);
trafficKpi = wing ? {
  visitors: 0,  // Wing 데이터 없으면 0, TrafficStats 연동 별도 plan
  views: 0,
  orders: cur.orderCount,
  salesQty: 0,  // order quantity sum from raw SQL (optional)
  revenue: cur.revenue,
  cartAdds: 0,
  adSummary: wing.rawAdSummary ?? null,
  source: 'wing',
} : null;
```

**`planAchievement` (R-12 explicit)**:
```ts
planAchievement: null,  // F1 범위 밖 (D.3b 에서 연동)
```

**`lastSyncAt`**:
```ts
lastSyncAt: wing?.lastSyncAt?.toISOString() ?? null,
```

**`logger.debug` (A-12)**:
```ts
const startedAt = Date.now();
// ... all await ...
this.logger.debug({
  msg: 'dashboard-sales.getSummary',
  companyId,
  range: ctx.effectiveRange,
  latencyMs: Date.now() - startedAt,
  topProductsCount: topProducts.length,
  monthlyTrendMonths: monthlyTrend.length,
  hasWingOverride: wing !== null,
});
```

### A.3 `dashboard-inventory.service.ts` warnings rewire (v2 상세)

**현재 (L57-60 + L117-135)**:
```ts
const allPLCurrentMonth = await prisma.profitLoss.findMany({...});
const minusProducts = allPLCurrentMonth.filter((pl) => pl.netProfit < 0).length;
// etc.
```

**F1 후**:
```ts
const perListingMetrics = await buildPerListingMetrics(this.prisma, companyId, monthStart, monthEnd);
// PerListingMetrics[]
const minusProducts = perListingMetrics.filter((m) => m.netProfit < 0).length;
const lowProfitProducts = perListingMetrics.filter((m) =>
  m.profitRate >= 0 && m.profitRate <= 3  // percentage
).length;
const highAdProducts = perListingMetrics.filter((m) =>
  m.revenue > 0 && m.adCost > 0 && (m.adCost / m.revenue) * 100 > 15
).length;
```

**주의**: `profitRate` 는 **percentage 1 decimal** (30.0 이 30%). 기존 PL table `netProfit/revenue * 100` 도 percentage 였음. Filter 조건 동일하게 유지.

### A.4 `dashboard-trend.service.ts` 2개 변경

**변경 1 — avgProfitRate**:
```ts
const profitMetrics = await calculateProfitForRange(prisma, companyId, since, new Date());
const avgProfitRate = profitMetrics.revenue > 0
  ? profitMetrics.netProfit / profitMetrics.revenue  // ratio (0.3)
  : 0;
// 주의: profitMetrics.profitRate 는 percentage (30.0). avgProfitRate 는 ratio — 곱셈 사용 목적에 맞게 ratio 유지.
```

**변경 2 — I3 fix raw SQL**:
```sql
-- BEFORE
SELECT TO_CHAR(ordered_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS date,
       COALESCE(SUM(total_price), 0)::int AS revenue
FROM orders
WHERE company_id = ${companyId}::uuid AND ordered_at >= ${since}
GROUP BY 1 ORDER BY 1

-- AFTER
SELECT TO_CHAR(o.ordered_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS date,
       COALESCE(SUM(oli.total_price), 0)::int AS revenue
FROM orders o
JOIN order_line_items oli ON oli.order_id = o.id
WHERE o.company_id = ${companyId}::uuid AND o.ordered_at >= ${since}
GROUP BY 1 ORDER BY 1
```

### A.5 루트 `page.tsx` rewire + `SectionError` 확장

**`SectionError` 변경 (L35-47)**:
```tsx
function SectionError({ msg, onRetry }: { msg?: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-slate-500">
      <AlertCircle className="w-8 h-8 text-amber-500" />
      <p className="text-sm">{msg ?? '이 섹션을 불러올 수 없습니다'}</p>
      <button onClick={onRetry} className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700">
        다시 시도
      </button>
    </div>
  );
}
```

**모든 call site 업데이트**:
```tsx
{salesBaselineError ? (
  <SectionError
    msg={friendlyError(salesBaselineError) ?? undefined}
    onRetry={refetchSalesBaseline}
  />
) : ...}
```

**Baseline query full-page fail 인정**: page.tsx L157-167 gate 은 유지. Zod drift on baseline = 전체 페이지 에러 block — pre-existing fail-closed behavior. Degraded rendering 은 out of F1.

### A.6 Wing snapshot 정책 (unchanged from v1)

- DashboardAdService: monthly ad metrics override (유지)
- DashboardSalesService: `trafficKpi.adSummary` + `lastSyncAt` 만 Wing passthrough. `monthly.revenue` 는 항상 Order 기반.

---

## Invariants

| # | Invariant | 검증 |
|---|---|---|
| I1 | `DashboardSalesService` returns valid `DashboardSalesSummary` | `satisfies` + client Zod parse |
| I2 | 모든 쿼리 companyId scoped | ADR-0018 + `npm run check:idor` |
| I3 | ProfitLoss 테이블 read 불가 (3 dashboard services + profit-loss.service) | post-F1 grep = 0 (dashboard domain) |
| I4 | warnings.minusProduct = count(netProfit<0) per-listing | integration test explicit seed |
| I5 | avgProfitRate = netProfit/revenue over trend window (ratio) | integration test math |
| I6 | Pipeline-stats 호출 0건 in root page | grep = 0 |
| I7 | apiClient.get → getParsed migration (root page) | grep `apiClient\.get<` = 0 (PATCH/POST 제외) |
| I8 | Wing override = ad-domain only; sales = trafficKpi only | code review |
| I9 | 기존 188+ tests green post-rewrite | `npm run test:integration` |
| I10 | **dashboard-trend raw SQL revenue = SUM(oli.total_price), NOT SUM(o.total_price)** | integration test assertion |
| I11 | `buildPerListingMetrics` 는 `common/` 위치 + finance + dashboard 양쪽 consumer | grep 확인 |
| I12 | `profit-loss.service.findAll` 은 `buildPerListingMetrics` 사용 (no inline 중복) | code review |

---

## Data flow

(v1 과 동일, dashboard-sales Promise.all 9 item 으로 명시)

---

## Test plan (v2 detail)

### Tier 1 — `common/per-listing-profit.ts` 단위 테스트

`common/__tests__/per-listing-profit.pg.integration.spec.ts` NEW:
- T1: 단일 listing, 1 order, 1 lineItem (costPrice=50_000, totalPrice=100_000, commission 10%, shipping 10_000) → expected metrics
- T2: 2 orders 1 listing, shipping 분배 weighted 검증
- T3: 광고비 포함 (1 ad spend=20_000 for listing) → adCost=20_000 반영
- T4: cross-company isolation (IDOR_SENTINEL)

### Tier 2 — `profit-loss.service.ts` 회귀 테스트

기존 tests 가 `buildPerListingMetrics` 경유로 동일 결과 반환 검증.

### Tier 3 — Dashboard integration tests (재작성)

**`dashboard-sales.pg.integration.spec.ts`** NEW (6 tests, 모든 seed `SALES-T-*` 접두어):
- T1: baseline monthly — seed 1 order → revenue=100_000, profit=30_000 (math verified)
- T2: IDOR isolation — OTHER with `SALES-O-*` + IDOR_SENTINEL excluded
- T3: rangeKpi week — seed with dateRange window
- T4: empty company → zero-valued structure, no error
- T5: Wing override — seeded wing AdSnapshot → trafficKpi.adSummary
- T6: topProducts N=10 ordering — 12 masters seeded, top 10 by revenue DESC

**`dashboard-inventory.pg.integration.spec.ts`** 재작성 (5 tests):
- T1-T3: IDOR / empty (seed Order/LineItem/Ad, `INV-T-*` 접두어, no profitLoss.create)
- T4: minusProduct — seed 1 order `INV-T-LOSS-1` with option costPrice=80_000 + totalPrice=50_000 + commission 10% + shipping=5_000 → netProfit = 50k - 80k - 5k - 5k = -40k → minusProducts=1
- T5: 3 warnings — seed 3 separate listings with minus + lowProfit + highAd signals → warnings counts (1, 1, 1)

**`dashboard-trend.pg.integration.spec.ts`** 재작성 (4 tests):
- T1-T2: IDOR (seed `TREND-T-*` / `TREND-O-*`, no profitLoss.create)
- T3: fresh company empty []
- T4: avgProfitRate + I3 — seed 1 order with `Order.totalPrice=999_999_999` (INTENTIONALLY WRONG sentinel) + `OrderLineItem.totalPrice=100_000`. Assert `revenue === 100_000` (NOT 999_999_999) — proves I3 fix. Assert `avgProfitRate ≈ 0.3`, daily profit = 30_000.

### Tier 4 — Frontend RTL

`apps/web/src/app/__tests__/page.spec.tsx` NEW (6 tests):
- T1: loading → PageSkeleton
- T2: success → KPI cards render
- T3: 502 on ONE non-baseline query → `<SectionError msg="502 Bad Gateway" />`
- T4: 502 on BASELINE sales query → full-page "대시보드 데이터를 불러오는데 실패했습니다" block
- T5: Zod drift on non-baseline → `<SectionError msg="응답 형식 오류..." />`
- T6: pipeline-stats NOT called → `vi.spyOn(apiClient, 'get')` 검증

### Tier 5 — Manual smoke

- dev:server + web dev
- Visit `/` — KPI/차트/warnings 실수치 + DevTools Network 에 `/api/products/pipeline-stats` 없음

---

## Execution strategy

| Task | Scope | Files | Review |
|---|---|---|---|
| **T1** | `common/per-listing-profit.ts` extract + `profit-loss.service.findAll` refactor + 단위 integration spec | 3 files: new helper + service + spec | 2-stage (shared helper, cross-domain impact) |
| **T2** | `DashboardSalesService` full impl + spec NEW | 2 files: service + spec | 2-stage |
| **T3** | `DashboardInventoryService` warnings rewire + spec rewrite | 2 files: service + spec | 2-stage |
| **T4** | `DashboardTrendService` avgProfitRate + I3 fix + spec rewrite | 2 files: service + spec | 2-stage |
| **T5** | Root `page.tsx` rewire + `SectionError` 확장 + RTL spec NEW | 2 files: page + RTL | 2-stage |
| **T6** | Verification + release note (ADR-0016 reader count update note) | 1 file: release-note | no review |

예상: 6 tasks, 6-8 commits, ~24 subagent dispatches (T1-T5 × 2-stage + T6 none + fixups).

---

## Review cadence

- T1 (NEW shared helper + finance refactor): **2-stage** (cross-domain impact, 승격)
- T2 (service + integration spec, 2 files): **2-stage**
- T3 (service + spec rewrite): **2-stage**
- T4 (service + spec + I3 fix): **2-stage**
- T5 (frontend + RTL): **2-stage**
- T6 (verification + release note): no review

Plan-level 5-reviewer 유지 (이후 plan writing 단계).

## Deferred / Successors

- **URL state for kpiRange** → F1.1
- **`planAchievement` 실제 구현** → D.3b 흡수
- **`calculateProfitForRange` → `common/` 이전** → 후속 cleanup plan
- **TrafficStats 연동** → traffic domain plan
- **`SectionError` → `ErrorState` 통일** → UI refactor plan
- **per-request memoization** — 성능 이슈 발현 시
- **Root page mobile layout** → UI refactor plan
- **Connection pool tuning** — 다중 사용자 부하 측정 후

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| `buildPerListingMetrics` extract 실패 시 profit-loss.service 동작 변경 | High | T1 2-stage + finance 기존 tests 재실행 (regression guard) |
| `monthlyTrend` 6 loop 성능 (300-600ms 추가) | Medium | logger.debug latency 측정. 발현 시 F1.1 cache. |
| 기존 IDOR tests (IDOR T2/T4) seed 교체 후 semantic drift | High | 새 assertion 계산 → seed 값 역산 → old assertion 값 매칭 확인 |
| dashboard-trend I3 fix 가 daily revenue 값 변경 | Medium | integration test T4 에서 `Order.totalPrice=999M` + `lineItem.totalPrice=100K` sentinel 로 명시 검증 |
| ZodError on baseline → full-page crash | Low | pre-existing fail-closed. 문서화만. |
| RTL dynamic import (`DashboardCharts`) | Medium | `vi.mock('next/dynamic', () => ...)` pattern |

---

## Open questions (v2 모두 해결)

(v1 의 6개 open questions 모두 v2 에서 pin-down. 남은 없음.)

1. ~~`planAchievement` null UI~~ → null safe, 명시 반환 (R-12)
2. ~~`buildPerListingMetrics` 파일 위치~~ → `common/per-listing-profit.ts` (Q1)
3. ~~`TopProduct.company` 필드~~ → `ChannelListing.channelName` (C-03)
4. ~~Wing snapshot override 테스트 범위~~ → passthrough 검증 (T5)
5. ~~`monthlyTrend` per-month profit 계산~~ → loop `calculateProfitForRange` (Q2)
6. ~~`SectionError` + `friendlyError` 조합~~ → props 확장 (R-09)

---

**Next step**: Plan writing → 5-reviewer → subagent execution.
