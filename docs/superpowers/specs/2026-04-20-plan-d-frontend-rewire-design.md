# Plan D — Frontend Rewire + Backend Refinement (v4)

**Date**: 2026-04-20 (v4 — Plan D.1 critic + architect 재검증 반영)
**Status**: DRAFT v4
**Depends on**: Plan B2c.orders (merged `d381859`), Plan B2c.dashboard (merged `335acee`)
**Follows**: `docs/superpowers/plans/2026-04-20-plan-b2c-dashboard.md`
**Supersedes**: v1 (never committed to main), v2 (707bb8e — H-1 unresolved), v3 (264874b — plan-level schema mismatch 발견)

## 1. Context & Goals

### Why this plan
B2c backend 은 완성했지만 apps/web 은 **main 에서 191 tsc errors** 상태. 주요 분포:
- `ad-ops/` — **147 errors** (advertising schema drift, pre-existing debt)
- `profit-loss/` — 11 (PLData schema rename: `costOfGoods→cogs`, `productName→masterName`, `id→listingId`, `sku→masterCode`, `company→channelName`)
- `products/` — 11, `inventory/` — 11 (B2a/B2b ripple)
- `panel/`, `thumbnail-editor/`, `orders/`, `image-hub/`, `hooks/useProductImages` — 11 합계

또한 B2c.dashboard 에서 Plan D 로 defer:
- **R-1** shipping per-lineItem over-count (profit-calculator)
- **R-2** returnRate same-period 부정확 (channel-dashboard.getReturnSummary)

### Goals
- apps/web 191 tsc errors → 0
- B2c backend 완성본이 실제 UI 에 반영 (각 page production quality: filter/sort/pagination/빈·에러·로딩 3-state)
- `npm run build --workspace=apps/web` 초록불 → 배포 가능
- R-1 / R-2 backend refinement 완료

### Non-goals
- 신규 feature — B2c API 대응 UI 만
- `agents/` python 변경
- Wing 이관 (Plan C)
- `channel-sync.syncProducts/syncInventory` rewrite (Plan B3)
- 다국어 (한국어 고정)
- ADR 변경 — B2c 확립 ADR-0013/0014/0015 준수

### What reviewer findings changed (cumulative v1 → v4)

**v1 → v2** (3-reviewer 1차):
- R-1 ratio 분배 제거 → `order.shippingPrice` 직접 사용 (schema `orders.prisma:27` 존재, channel-sync 가 write)
- R-3 제거 (`rangeKpi/trafficKpi` 이미 old dashboard 서비스에 존재)
- R-4 제거 (finance-hub endpoint 전부 존재)
- D.2 재정의 (신규 dashboard page 아님, 기존 `coupang/orders` + `coupang/returns` 보강)
- PLData field mapping 표 추가
- SortableHeader 기존 존재 인정 (extract)
- Query key 기존 convention 일치, Zod parse progressive

**v2 → v3** (3-reviewer 2차, 사용자 결정 반영):
- **🔴 ProfitLoss writer 존재 않음 확인** → Option B 채택: `/api/profit-loss` 를 **live aggregation** 으로 재작성. ProfitLoss 테이블은 deprecate (Plan E 에서 writer 신설 검토). § 4 "ProfitLoss Data Path Decision" 참조
- R-1 loop restructuring 명시 (inner shipping 제거, outer order 루프로 이동)
- SortButton 이름 → **SortableHeader** 로 통일 (컴포넌트 + 파일)
- Pagination: **client-side slice** 로 명시 (API 변경 없음)
- `apiClient.getParsed` error behavior 명시 (ZodError throw → React Query catch → `isError=true`)
- H-4 R-2 orphan return policy → **D.2 전 product sign-off 필수 (ADR 신설)**
- H-3 Zod sunset → Plan E 명시 후속 task
- D.4 arithmetic 정정 (33 tsc errors, finance-hub 6 files 는 0 error rewire)
- ADR 3개 candidate 신설 (§ 15)

**v3 → v4** (Plan D.1 critic + architect 재검증 — execution-level schema mismatch 발견):
- **🔴 T5 Prisma relation 경로 수정**: `OrderLineItem.option.channelListing` **존재하지 않음**. 올바른 경로: `OrderLineItem.listingOption` → `ChannelListingOption.listing` → `ChannelListing.master`
- **🔴 OrderReturn.listingId 없음**: `OrderReturnLineItem.orderLineItem.listingOption.listingId` 로 집계 (한 OrderReturn 이 여러 listing 에 걸칠 수 있음)
- **🟠 Shipping allocation → revenue-weighted**: `o.shippingPrice * (li.totalPrice / order.totalRevenue)` 비율 분배. "first listing 전액" heuristic 은 per-listing P&L 편향 (critic/architect H-2) → ADR-0016 에 명시
- **🟠 ADR-0016 범위 확장**: ProfitLoss 테이블 다른 reader 8 services (statistics × 5 call / settlements / sales-plans / sales-analysis / ad-strategy / dashboard-inventory / dashboard-trend / action-task × 2) 전부 empty state. Migration path = D.3/D.4 에서 동일 live aggregation pattern or Plan E writer 복원
- **🟠 profit-calculator.ts Ad fallback IDOR fix** (T4 scope 포함): `prisma.ad.aggregate` + `prisma.adSnapshot.findMany/aggregate` calls 에 `companyId` 필터 추가
- **🟠 adCost source = `Ad` 테이블** (not AdSnapshot): `Ad.companyId` + `Ad.listingId` 둘 다 non-null, `@@index([listingId, date])` 존재 → profit-calculator 와 same source. `prisma.ad.groupBy({ by: ['listingId'], _sum: { spend: true }, where: { companyId, date: { gte, lt } } })`
- **🟡 kstMonthStart 간결화**: helper 가 `month === 13` wrap 처리. `kstMonthStart(year, month + 1)` 그대로 (수동 wrap 불필요)
- **🟡 Promise.all 병렬화**: T5 의 3 query (order / orderReturnLineItem / ad) 는 data dep 없음 → parallel
- **🟡 finance/CLAUDE.md 업데이트** 플랜 포함 (ADR-0016 이후 "stub" 서술 무효)

## 2. Phase Decomposition

| Phase | 범위 | 주요 frontend | Backend refinement | 크기 |
|---|---|---|---|---|
| **D.1** | `profit-loss/` 재배선 + pagination(client-side) + polish | 3 files, 11 tsc errors, field 매핑 | **B-decision**: `profit-loss.service` live aggregation 재작성 (ProfitLoss 테이블 bypass). **R-1** Order.shippingPrice 적용 (profit-calculator + new live endpoint 양쪽) | 중 |
| **D.2** | `coupang/orders` + `coupang/returns` 보강 (기존 page) | 2 files (현재 tsc 0) | **R-2** returnRate order JOIN (ADR + orphan return policy product sign-off 선행) | 소~중 |
| **D.3** | `sales-analysis/` 재배선 | 7 files (SalesOverview/Statistics/Settlements/SalesPlans/WingDailySales/ChannelTable + page) | — (B2c.orders 재사용) | 중 |
| **D.4** | `finance-hub/` + 소규모 domain 재배선 | **finance-hub 6 files (0 tsc errors, rewire only)** + 33 tsc errors 대상 (products 11 / inventory 11 / panel 4 / orders 2 / image-hub 2 / thumbnail-editor 2 / useProductImages 1) | — (모든 endpoint 존재) | 중 |
| **D.5** | `ad-ops/` debt cleanup | 11 files, 147 tsc errors, advertising schema 정합 | advertising service return shape 확인 | 대 |

### 실행 순서 근거
**D.1 → D.2 → D.3 → D.4 → D.5** 유지:
- **D.1**: business value 가장 뚜렷, scope 가장 작음 (3 files), 이후 phase 의 patterns 확립 (PLData field mapping → 다른 schema 재배선 reference)
- **D.2**: coupang 두 page 이미 동작 가능성 — smoke verification → 필요시 R-2 적용 + 보강 (상대적으로 작은 작업)
- **D.3**: sales-analysis 7 file 중 여러 component 가 B2c.orders 의 새 schema 직접 소비 (SettlementRow/StatisticsOverview 등)
- **D.4**: finance-hub 6 components + 작은 domain 흩어진 tsc errors (39개) 정리
- **D.5**: 가장 큼. 별도 pre-D.5 exploration session 권장 (§9 Risks)

### Phase 독립 원칙
각 phase = 별도 implementation plan 문서 + 별도 PR. Umbrella spec (이 문서) 의 invariant 준수. 각 phase 가 frontend+backend 묶는 경우 single PR (B2c.dashboard 패턴).

## 3. Frontend Architecture (공통)

### Routing
- Next.js 16 App Router 기존 구조 유지
- **신규 page 없음** (v1 의 `dashboard/` 제안 철회)
- 기존 hub-style (`finance-hub`, `sales-analysis`) 유지

### Data fetching
- `@tanstack/react-query` v5.62 (기존)
- `apiClient` (`apps/web/src/lib/api-client.ts`) — **현재 Zod parse 안 함**, v2 에서 선택 wrapper 추가 검토 (§ I1 참조)
- `x-dev-user-id` 헤더 자동 주입 (dev-auth.middleware)

### Table pattern — 공용 DataTable 도입 안 함
- per-page table composition + 공용 primitives (Pagination, EmptyState, PageSkeleton, StatusBadge, PeriodSelector, DateRangePicker)
- **SortableHeader extract**: 이미 `apps/web/src/app/profit-loss/components/ProfitLossTable.tsx:134-156` 에 inline. D.1 에서 `apps/web/src/components/ui/SortableHeader.tsx` (파일 + 컴포넌트 이름 통일) 로 이동 + 공용화. `<th>` + 내부 button 구조 유지 (별도 `SortButton` 아님 — reviewer M-2/M-1 정합)
- **Pagination**: client-side slice — API 변경 없음. 한 달치 PLData 는 bounded (수백 행 이내) 가정

### Query key convention — 기존 유지
기존 `apps/web/src/lib/query-keys.ts` 패턴:
```ts
queryKeys.profitLoss.list(period)  // ['profitLoss', 'list', period]
queryKeys.dashboard.salesRange(range, from, to)  // ['dashboard', 'sales', 'range', ...]
```
companyId 미포함 (server-derived). Plan D 신규 key 도 이 패턴.

### Page shell
```
Page
├─ PageHeader (title + period/filter control + primary action)
├─ SummaryCards (KPI row)
├─ DataView (Table | Chart | List)
│  ├─ <PageSkeleton/> (loading)
│  ├─ <EmptyState/> (data.length === 0)
│  └─ ErrorBoundary fallback
└─ <Pagination/> (필요한 곳)
```

### Architecture invariants
- **I1 — Zod parse at boundary (점진 도입)**: 신규 page 와 rewire 하는 page 는 `Schema.parse()` 적용. 기존 page 는 건드리지 않을 때 그대로. **인프라 신규**: `apiClient.getParsed<T>(path, schema)` wrapper. **Error behavior**: parse 실패 시 `ZodError` throw → React Query 가 catch → `isError=true` + UI 는 §7 error contract 의 "데이터 형식 오류" 렌더 + `console.error(zodError.issues)`. D.1 에서 wrapper 구현 + pattern 확립 후 다른 phase 로 전파. **Plan E 후속**: 남은 `apiClient.get<T>` 사용처 sweep (§10 R-sunset)
- **I2 — URL state**: filter / sort / page / period 는 `useSearchParams` 로 URL 반영 (SSR 안전, 공유·북마크). 기존 page 의 `useState` 기반 구현은 rewire 시 마이그레이션
- **I3 — Query key**: `[resource, scope, filters]` (existing convention). `companyId` 포함 안 함
- **I4 — 3-state 필수**: loading / empty / error 세트
- **I5 — 접근성**: aria-sort, caption, 색 + 아이콘 병기

## 4. Backend Refinements

### R-1: Shipping over-count 보정 (D.1) — v3 final

**Reviewer finding** (code-reviewer B-1): `Order.shippingPrice` 이미 schema 에 존재 (`prisma/models/orders.prisma:27`), channel-sync 가 payload 에서 채움 (`channel-sync.service.ts:158, 179`). v1 ratio 분배 불필요.

**v3 Fix — loop restructuring 포함**:

Current `profit-calculator.ts:77-88` 의 구조:
```ts
for (const o of orders) {
  for (const li of o.lineItems) {
    ...
    shippingCost += resolved.shippingCost;  // ← remove (per-lineItem over-count)
    ...
  }
}
```

v3 변경:
1. order select 에 `shippingPrice: true` 추가
2. **Inner loop** 에서 `shippingCost += resolved.shippingCost` **제거**
3. **Outer loop** 에 `shippingCost += o.shippingPrice` **추가** (order 단위 1회)
4. Unit/integration test 로 lineItem 수와 shipping 결과 비의존성 검증

**Fix scope**:
- `apps/server/src/dashboard/helpers/profit-calculator.ts` (주 대상, dashboard path)
- `apps/server/src/finance/services/profit-loss.service.ts` (**v3 신규**: B-decision 에 따라 live aggregation 으로 재작성 — 동일 pattern `order.shippingPrice` outer-loop)
- `apps/server/src/channels/services/channel-dashboard.service.ts` — shipping 합산 안 함 (architect 확인), 변경 없음

**검증**:
- Unit test: `profit-calculator` + 신규 `profit-loss.service.live` per-order shipping 합산
- PG integration: 1 order / 3 lineItem seed, shipping = `order.shippingPrice` (lineItem 수 무관)

### B-decision: ProfitLoss table bypass (v3 신규, D.1 핵심)

**Investigation 결과** (사용자 승인 후 확정):
- `prisma.profitLoss.(create|upsert|update)` production 코드 **0 건**
- `scripts/migrate-dashboard-data.ts` = historical one-time migration
- `init.sql.gz INSERT INTO profit_loss` = **0 건**
- `catalog.ts:373 calculate.profit_loss` node type 선언 (UI metadata), **executor 는 builtin.ts 에 미등록**
- dev DB `SELECT COUNT(*) FROM profit_loss` = **0 rows**

**결론**: ProfitLoss 테이블은 **실질적으로 orphan state**. 현재 `/api/profit-loss` 는 빈 배열 리턴. frontend rewire 만으로는 사용자 가치 zero.

**Option B 채택**: `/api/profit-loss` 를 **live aggregation** 으로 재작성.
- `profit-loss.service.findAll(companyId, year, month)` 가 `Order + OrderLineItem` groupby 로 PLData 생성 (기존 pre-aggregated read 폐기)
- 데이터 source: `Order` + `OrderLineItem` + `ChannelListing` + `MasterProduct` + `AdSnapshot` (ad cost)
- Aggregation pattern: B2c.orders 에서 확립한 I3 canonical (`SUM(OrderLineItem.totalPrice)`), I8 half-open, LISTING_WITH_MASTER_SELECT_EXTENDED
- KST month boundary: `kstMonthStart(year, month)` + `kstMonthStart(year, month+1)` (기존 common/kst.ts)
- Commission/cogs/shipping/otherCost: option-pricing-resolver 재사용
- ProfitRate / netProfit: 기존 계산식 유지

**ProfitLoss 테이블 처리**:
- 테이블 자체는 Plan D 에서 drop 안 함 (legacy data 보존, 추후 ADR 결정)
- `profit-loss.service` 는 테이블에 의존하지 않음 (read-through live)
- Plan E 에서 writer 신설 결정 시 테이블을 cache 로 재활용 가능

**Backward compat**:
- API 응답 shape = `PLDataSchema` (변경 없음 — 같은 PLData[] 리턴)
- Frontend consumer (`apps/web/src/app/profit-loss/`) 는 response shape 그대로 사용

**Performance**:
- 월 1 회 조회 기준. 한 회사 월간 order 수백~수천 건 예상 → single query + groupby 가능
- 추후 slow 해지면 Plan E 에서 cache (writer 신설 + table cache)

### R-2: returnRate 정확도 개선 (D.2) — ADR + product sign-off gate

**현재**: `channel-dashboard.getReturnSummary` = `count(returns IN period) / count(orders IN period)` same-period. Past-period order 의 return 이 current numerator 포함 → returnRate > 100% 가능.

**v3 Fix**: Return 을 원래 order 의 `orderedAt` 기준 grouping. `OrderReturn.orderId` **nullable** (`String?` in `prisma/models/orders.prisma:99`) 고려 필수.

**🔴 D.2 시작 전 blocker — product sign-off 필요 (ADR 대상)**:

| 옵션 | 설명 | 수치 예상 |
|---|---|---|
| **(a) Drop orphan** (INNER JOIN) | `orderId NULL` 분모·분자 제외 | 집계 일관. 고아 return 은 보고서에서 사라짐 |
| **(b) Group by requestedAt** | 고아는 `requested_at` 기준 period 배치 | 모든 return 카운트, 하지만 기준 혼합 |
| **(c) Side metric `orphanReturnCount`** | 메인 returnRate 는 (a) 로, 고아는 별도 노출 | 투명하지만 UI 복잡 |

**추천**: (c) — 데이터 무결성 우선 + 운영 투명성. D.2 시작 전 사용자 결정 확인.

```sql
-- pseudo
SELECT
  (SELECT COUNT(*) FROM orders o WHERE o.company_id = $cid
   AND o.ordered_at >= $from AND o.ordered_at < $to) AS order_count,
  COUNT(*) AS return_count
FROM order_returns orr
INNER JOIN orders o ON orr.order_id = o.id
WHERE o.company_id = $cid
  AND o.ordered_at >= $from AND o.ordered_at < $to;
```

**Semantic 변경**: "이 기간 내 주문 → return 된 비율". 기존 same-period 와 수치 다름 — 문서화 필요. 고객 커뮤니케이션 담당자 (or 사용자) 합의 전에 D.2 시작 금지.

**검증**:
- PG integration edge case: "2026-03 주문 → 2026-04 에 return 요청" → 2026-04 returnRate 에서 제외, 2026-03 returnRate 에 반영
- Orphaned return (orderId null) exclusion 검증

### R-3: (Dropped)

v1 의 "신규 `getRangeKpi/getTrafficKpi` method 분리" 는 **이미 존재**하는 것으로 확인 (`packages/shared/src/schemas/dashboard.ts` 의 `DashboardSalesSummarySchema.rangeKpi`, `DashboardAdSummarySchema.rangeKpi`). User memory "rangeKpi, trafficKpi 10+ 필드 누락" 의 근거는 **field-within-kpi** 수준일 가능성 → D.4 frontend rewire 시 소비자 (home page + ad-ops) 가 실제 필요로 하는 field 조사 후 조각 단위로 scope 변경.

### R-4: (Dropped)

v1 의 "finance API gap" 은 존재하지 않음. finance-hub 소비 endpoint 전부 이미 server 에 존재:
- `/api/settlements` → `settlements.controller.ts`
- `/api/supplier-payments` → `supplier-payments.controller.ts`
- `/api/manual-ledger` → `manual-ledger.controller.ts`
- `/api/processing-costs` → `processing-costs.controller.ts`

D.4 = frontend rewire only. 필드 형식 mismatch 가 있으면 frontend 조정. server 변경 없음.

### Backend–Frontend 배포 순서
- D.1, D.2 는 backend refinement + frontend 같이 → single PR per phase 권장 (B2c.dashboard 패턴)
- D.3, D.4, D.5 는 frontend only → single PR per phase

## 5. PLData Field Mapping (D.1 주 작업)

현재 `ProfitLossTable.tsx` 가 참조하는 **old field** vs **current `PLDataSchema` (packages/shared/src/schemas/profit-loss.ts)** new field:

| Old field | New field | UI label | 비고 |
|---|---|---|---|
| `d.id` | `d.listingId` | — | primary key → listingId |
| `d.productName` | `d.masterName` | 상품명 | — |
| `d.company` | `d.channelName` | 채널 | — |
| `d.sku` | `d.masterCode` | 코드 | legacyCode fallback 이미 service 에서 처리 |
| `d.costOfGoods` | `d.cogs` | 원가 | — |
| `d.grade` | `d.grade` | 등급 | 유지 |
| `d.revenue` | `d.revenue` | 매출 | 유지 |
| `d.commission` | `d.commission` | 수수료 | 유지 |
| `d.shippingCost` | `d.shippingCost` | 배송비 | 유지 (R-1 적용 후 값 바뀜) |
| `d.adCost` | `d.adCost` | 광고비 | 유지 |
| `d.otherCost` | `d.otherCost` | 기타 | 유지 |
| `d.netProfit` | `d.netProfit` | 순이익 | 유지 |
| `d.profitRate` | `d.profitRate` | 이익률 | 유지 |
| `d.orderCount` | `d.orderCount` | 주문 수 | 유지 |
| — | `d.externalId` | 외부 ID | 신규 노출 (optional) |
| — | `d.category` | 카테고리 | 신규 필터링 가능 |
| — | `d.thumbnailUrl` | 썸네일 | 신규 row 시각화 |
| — | `d.returnCount` | 반품 수 | 신규 노출 |

**Type / sort 관련 변경** (v3 명시):
- `SortField` union 타입 (`ProfitLossTable.tsx:9`): `'costOfGoods'` → `'cogs'` 변경 필수 (code-reviewer I-1)
- `<tr key={d.id}>` → `<tr key={d.listingId}>` (code-reviewer m-1)
- `getGradeColor(d.grade)` null 처리: `d.grade` 는 `string | null` → helper 에서 null fallback or nullish 체크 (code-reviewer m-1)
- `profit-loss/page.tsx` excel export (line 89-90): `d.productName`, `d.sku`, `d.company`, `d.costOfGoods` 전부 rename (code-reviewer m-4)

D.1 implementation plan 은 이 매핑 표 + 타입 변경 목록을 기반으로 task 설계.

## 6. Data Flow

```
User action (filter/sort/page)
  → URL search params update (useSearchParams)
  → React Query key 변경 — [resource, scope, filters] (existing convention)
  → apiClient.get('/api/...')
    ↓
    [신규 또는 rewire page]: apiClient.getParsed(path, Schema) 래퍼 사용 (Zod parse)
    [기존 유지 page]: apiClient.get<T>(path) generic cast (parse 없음 — 점진 도입)
  → NestJS controller @CurrentCompany() + DTO validation
  → service method
  → Prisma findMany/$queryRaw (I3 canonical / I8 half-open)
  → Response → (신규/rewire) zod parse / (기존) pass-through
  → DataView render (Table/Chart) or EmptyState/ErrorBoundary
```

## 7. Error / Loading / Empty State Contract

| 상태 | Source | UI | Retry |
|---|---|---|---|
| Loading | `isLoading` | `<PageSkeleton>` | — |
| Error | `isError` | 구체적 메시지 + retry button | `refetch()` |
| Empty | `data.length === 0` | `<EmptyState>` + 설명 + CTA | page context |
| Stale/refetching | `isFetching && !isLoading` | 상단 progress bar | 자동 |

**에러 번역**:
- 4xx → 사용자 친화 한국어 (403 → "권한이 없습니다")
- 5xx → "잠시 후 다시 시도" + retry + Sentry (있으면)
- Zod parse error → "데이터 형식 오류, 개발팀 문의" + console.error 상세

## 8. Testing Strategy

| Tier | Tool | 대상 | Plan D 추가 |
|---|---|---|---|
| Unit (server) | vitest + mock prisma | service 메서드 | R-1 per-order shipping / R-2 returnRate JOIN |
| **Integration (server)** | vitest + real Postgres | service + raw SQL + IDOR + edge | R-1 / R-2 refinement 검증 필수 |
| Unit (web) | vitest + RTL (infra 이미 설정, 기존 zero tests) | component rendering / sort / pagination | 각 page first RTL test |
| e2e (web) | **없음** (playwright 미설치) | — | Plan D scope 밖, 별도 plan 가능 |

**Coverage 기준**:
- 새 service method: integration + unit 둘 다
- 재배선 page: 최소 RTL loading/empty/error state 커버
- D.5 ad-ops 재배선: 최소 smoke render

## 9. Design System + UX Invariants

### Design source
`DESIGN.md` — 색상, typography, spacing, Tailwind + Lucide.

### Page shell 통일
- Header 좌측: title + period picker
- Header 우측: 필요 시 primary action
- Body: SummaryCards → DataView → Pagination
- Padding/gap: `p-4 lg:p-6`, `gap-4`

### UX invariants
- **U1 — URL-first period**: `?period=YYYY-MM` URL 반영
- **U2 — Filter reset page**: sort/filter 변경 시 page=1 reset
- **U3 — 한국어 포맷**: Decimal → `1,234,567원`, 비율 → `99.9%`
- **U4 — 색 + 아이콘 병기**: badge 에 color 만으로 정보 전달 금지
- **U5 — Skeleton layout**: 실제 layout 크기 (layout shift 방지)
- **U6 — 한국어 고정**: 다국어 Plan 밖

## 10. Risks & Open Questions

| Risk | 영향 | 대응 |
|---|---|---|
| R-2 returnRate 의미 변경 → 기존 차트·지표와 불일치 | 운영 혼란 | D.2 시작 전 ADR + product sign-off. Before/After snapshot 비교 |
| Profit-loss live aggregation 성능 (월별 수천 orders) | 조회 지연 | D.1 PG integration 측정. slow 해지면 Plan E 에서 cache 도입 (writer 신설) |
| D.5 ad-ops 147 errors scope 미정 | D.5 예상 "대" 가 실제 XL 가능성 | **Pre-D.5 exploration session 권장** — 147 errors 를 category 별로 triage (stale prop / new schema drift / removed field) |
| `apiClient.getParsed` wrapper 신규 infra | D.1 scope 증가 | D.1 Step 0 에 wrapper + unit test 로 배치. 이후 phase 재사용. **Plan E 후속 (R-sunset)**: 남은 `apiClient.get<T>` 사용처 sweep |
| SortableHeader extract 과정 중 breaking | profit-loss 외 page 에도 영향 가능 | D.1 안에서 extract + 현재 사용처 (`ProfitLossTable.tsx`) 만 마이그레이션. 다른 page 는 각 phase 에서 개별 전환 |
| R-3 user memory (rangeKpi/trafficKpi 10+ 필드 누락) 와 실제 상태 불일치 | 결정 공백 | D.4 시작 시 home page + ad-ops 소비 필드 diff, 필요시 backend method 추가 |
| sales-analysis `returnRate` 제3의 구현 | D.2 와 diverge 가능 | R-2 ADR 이 3 구현 (channel-dashboard, sales-analysis, 미래 reconcile) 수렴 정책 포함 |

### Open questions
1. **D.5 ad-ops error triage**: 147 errors 의 root cause 가 (a) shared schema drift (b) advertising service return shape change (c) removed field 중 무엇이 주? → Pre-D.5 exploration session 에서 triage
2. **Home page `/` 재배선**: `apps/web/src/app/page.tsx` 가 `/api/dashboard/*` 소비. tsc 0 errors (정상 동작) 이므로 **Plan D scope 밖** (Plan E 또는 별도 UX 개선 plan)
3. **R-2 orphan return policy**: (a) drop / (b) requestedAt grouping / (c) side metric — product 결정 D.2 전 필수

## 11. Dependencies

### Prerequisites
- Plan B2c.orders merged (main `d381859`) ✅
- Plan B2c.dashboard merged (main `335acee`) ✅
- `@kiditem/shared` dist up-to-date in `node_modules/@kiditem/shared` (worktree symlink)

### External
- `DESIGN.md` (existing)
- `@tanstack/react-query@5.62.0` (existing)
- `packages/shared` schemas: `PLDataSchema`, `DashboardSalesSummarySchema`, `DashboardAdSummarySchema`, `SettlementReconcileResponseSchema`, `StatisticsOverviewSchema`, `SupplierStatsSchema`

### Downstream blockers
- Plan C (Wing 이관) — Plan D 완료 후
- Production deploy — 각 phase merge 후 staging → prod

## 12. Success Criteria

Plan D 완료:
- [ ] `npm run build --workspace=apps/web` → 0 errors
- [ ] `apps/server` tsc → 0 errors (유지)
- [ ] 모든 integration test PASS (B2c.dashboard 161 + D 추가분)
- [ ] 5 phase PR merged
- [ ] profit-loss / coupang/orders / coupang/returns / sales-analysis / finance-hub / ad-ops 실제 데이터 조회·filter/sort/pagination 동작 (manual QA)

## 13. 다음 단계

이 spec 승인 후:
1. `superpowers:writing-plans` 로 **Phase D.1 implementation plan** 먼저 작성
   - profit-loss page rewire + R-1 shipping 보정 + PLData field mapping
   - SortableHeader extract
   - `apiClient.getParsed` wrapper 신규
2. D.1 execute → PR → merge → D.2 plan 작성 → 반복
3. 각 phase plan 은 이 umbrella spec 의 invariant section 참조

## 14. Changelog

### v2 → v3 (이번 iteration, 3-reviewer 2차 반영)

| 영역 | v2 | v3 | 이유 |
|---|---|---|---|
| **ProfitLoss table** | open question (writer 미확인) | **B-decision: live aggregation**. 테이블 bypass, service 재작성 | Investigation 결과 writer 부재 + dev DB 0 rows. Plan E 에서 writer 재검토 (architect H-1, code-reviewer I-4/I-5) |
| R-1 | 필드 추가만 언급 | loop restructuring 명시 (inner 제거 + outer 추가) | R-1 구조 변경 필요 (critic M-3) |
| SortButton/SortableHeader | 양쪽 이름 혼재 | SortableHeader 통일 | 네이밍 일관 (critic M-2, architect M-1) |
| Pagination | 모호 | client-side slice 명시 | 스펙 명확 (code-reviewer I-3) |
| `apiClient.getParsed` | wrapper 있음 | **error behavior 명시** (ZodError throw → React Query catch) | Implementer 판단 여지 제거 (code-reviewer I-6) |
| R-2 orphan policy | SQL 내 INNER JOIN 주석 | **ADR blocker + 3 옵션 제시** + 추천 (c) side metric | 비즈니스 결정 명시 (architect H-4) |
| D.4 arithmetic | "39 tsc errors" | 33 tsc errors + finance-hub 6 rewire files | 계산 오류 (critic M-1) |
| `SortField` type | 매핑 표 없음 | 타입 변경 목록 § 5 추가 | missed item (code-reviewer I-1) |
| H-3 Zod sunset | 미언급 | § 10 Plan E 후속 task (R-sunset) 명시 | drift 방지 (architect H-3) |
| ADR candidates | 없음 | § 15 3-ADR 신설 | architect 권고 |

### v1 → v2 (직전 iteration)

| 영역 | v1 | v2 | 이유 |
|---|---|---|---|
| R-1 | lineItem ratio 분배 | `order.shippingPrice` 직접 사용 | Schema field 존재 (code-reviewer B-1) |
| R-3 | `getRangeKpi/getTrafficKpi` 신규 method | 드랍 — 이미 존재 | 조사로 확인 |
| R-4 | finance API gap "조사 필요" | 드랍 — 모든 endpoint 존재 | 조사로 확인 |
| D.2 | 신규 `dashboard/` page | 기존 `coupang/orders` + `coupang/returns` 보강 | `/api/coupang-dashboard/*` = channel-dashboard.service 확인 |
| PLData 필드 | 설명만 | 명시 매핑 표 | critic MAJOR 1, code-reviewer B-3 |
| SortButton | 신규 shared | extract (기존 SortableHeader) | 기존 존재 |
| Query key | `[resource, companyId, ...]` | `[resource, scope, ...]` | existing convention |
| I1 Zod parse | 전부 mandatory | 신규/rewire 점진 도입 | 현재 apiClient 미적용 |

## 15. ADR Candidates (architect 권고)

D.1 시작 전:
- **ADR-NNNN: profit-loss live aggregation** — ProfitLoss table 을 read-path 에서 제거, `/api/profit-loss` 는 Order + OrderLineItem live 집계. 테이블은 legacy data 보존용 (추후 cache 재활용 Plan E). Shipping source-of-truth = `Order.shippingPrice`

D.2 시작 전:
- **ADR-NNNN: returnRate 의미 통일** — `channel-dashboard.getReturnSummary` 를 "이 기간 내 주문 중 return 비율" 로 재정의 (current same-period 폐기). Orphan return (OrderReturn.orderId null) policy = (c) side metric `orphanReturnCount` (추천). `sales-analysis.service.ts:70` 의 returnRate 도 동일 의미로 수렴 (divergence 금지)

D.2 (optional, strongly recommended):
- **ADR-NNNN: dashboard 서비스 구조 (coexistence 공식화)** — `/api/dashboard/*` (home aggregator) vs `/api/coupang-dashboard/*` (channel-scoped). 후자는 장기적 channel-scoped view 패턴 (Naver/11st 예정). 두 서비스는 같은 Order/OrderLineItem source 를 읽고, KPI overlap 은 의도적

## Reference
- Plan B2c.orders: `docs/superpowers/plans/2026-04-19-plan-b2c-orders-domain-rewire.md`
- Plan B2c.dashboard spec: `docs/superpowers/specs/2026-04-20-plan-b2c-dashboard-design.md`
- Plan B2c.dashboard plan: `docs/superpowers/plans/2026-04-20-plan-b2c-dashboard.md`
- ADR-0006 (multi-tenant IDOR), ADR-0013 (3-layer schema), ADR-0014 (single writer), ADR-0015 (Order schema unification)
- `DESIGN.md` (project root)
- `CLAUDE.md` (project root + per-domain)
