# Phase 2: Orders Dashboard - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

주문 대시보드 페이지(`/coupang/orders`)를 구축한다. KPI 통계 카드, 상태별 주문 목록, 일별 매출 트렌드 차트, 상품별 매출 랭킹, 주문 상세보기를 제공한다.

Requirements: ORD-01, ORD-02, ORD-03, ORD-04, ORD-05

</domain>

<decisions>
## Implementation Decisions

### 주문 테이블
- **D-01:** 핵심 5칼럼: 주문번호, 주문자, 상품명(첫 아이템), 금액, 상태
- **D-02:** 기존 DataTable 컴포넌트 재사용. 행 클릭 시 상세 모달 또는 페이지.
- **D-03:** 상태별 탭 필터 (ACCEPT/INSTRUCT/DELIVERY/FINAL_DELIVERY/전체)

### 트렌드 차트
- **D-04:** 라인 + 바 병합 차트. 매출액은 에어리어(Area), 주문건수는 바(Bar). 쿠팡 WING 스타일.
- **D-05:** recharts ComposedChart 사용. 30일 기본, DateRangePicker로 변경 가능.
- **D-06:** KST DATE_TRUNC 일별 버케팅 ($queryRaw 사용)

### 상품 랭킹
- **D-07:** 테이블 TOP 10. 칼럼: 순위, 상품명, 판매량, 매출액.
- **D-08:** `sellerProductId` 기준 GROUP BY (vendorItemId 아님 — PITFALLS 참고)

### KPI 카드
- **D-09:** 4열 그리드 (Phase 1에서 결정). 총주문/매출/대기건수/완료건수.

### 페이지 구조
- **D-10:** `/coupang/orders` 라우트 (Phase 1에서 결정)
- **D-11:** 레이아웃: KPI 카드 → 트렌드 차트 → 상태 탭 + 주문 목록 + 상품 랭킹

### Claude's Discretion
- 주문 상세보기 형태 (모달 vs 별도 페이지)
- 빈 상태(empty state) 디자인
- 로딩 스켈레톤 패턴
- API 엔드포인트 설계 (단일 vs 분리)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 1 산출물
- `apps/server/src/common/kst.ts` — kstDayStart() 헬퍼
- `apps/server/src/coupang/constants.ts` — ORDER_STATUSES, RETURN_STATUSES
- `apps/server/src/coupang-dashboard/coupang-dashboard.service.ts` — 기존 집계 패턴
- `apps/web/src/components/ui/DateRangePicker.tsx` — 날짜 필터 컴포넌트

### 기존 패턴
- `apps/server/src/orders/orders.service.ts` — Prisma 주문 조회 (findMany + include orderItems)
- `apps/web/src/app/dashboard/page.tsx` — recharts 차트 + KPI 카드 패턴
- `apps/web/src/app/orders/page.tsx` — 기존 주문 페이지 (참고용)

### 리서치
- `.planning/research/PITFALLS.md` — sellerProductId JOIN 키, KST 타임존, 순차 쿼리 주의

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `recharts` ComposedChart/AreaChart/BarChart — 이미 사용 중
- `DataTable` — 페이지네이션, 검색, 행 클릭
- `DateRangePicker` — Phase 1에서 생성
- `kstDayStart()` — KST 날짜 변환
- `ORDER_STATUSES` — 상태 상수

### Established Patterns
- NestJS: `prisma.coupangOrder.findMany({ include: { orderItems: true } })`
- Frontend: `fetch(API_BASE + '/api/...')`, `'use client'`
- Charts: recharts v3 import pattern (`import { BarChart } from 'recharts'`)

### Integration Points
- `apps/server/src/coupang-dashboard/coupang-dashboard.service.ts` — 트렌드/랭킹 집계 메서드 추가
- `apps/web/src/app/coupang/orders/page.tsx` — 신규 프론트 페이지

</code_context>

<specifics>
## Specific Ideas

- 쿠팡 WING 스타일 참고 (날짜 필터 + 라인/바 차트 조합)
- 상태 탭은 뱃지로 건수 표시

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-orders-dashboard*
*Context gathered: 2026-03-26*
