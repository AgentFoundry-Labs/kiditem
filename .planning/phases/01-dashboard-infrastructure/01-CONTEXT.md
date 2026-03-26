# Phase 1: Dashboard Infrastructure - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

쿼리 정확성 보장 인프라를 구축한다. KST 타임존 헬퍼, 상태 상수, Promise.all 병렬 패턴, DateRangePicker, CoupangDashboardModule 기초를 만들어 후속 Phase 2/3가 첫 줄부터 정확한 데이터를 반환하도록 한다.

Requirements: INFRA-01, INFRA-02

</domain>

<decisions>
## Implementation Decisions

### 날짜 필터 UI
- **D-01:** 프리셋 버튼(7일/30일/90일) + 캘린더 팝업(커스텀 범위) 조합. 쿠팡 WING 스타일.
- **D-02:** `react-day-picker@9` 설치. Radix Popover 안에 DateRangePicker 렌더링.
- **D-03:** DateRangePicker는 `apps/web/src/components/ui/DateRangePicker.tsx`에 공유 컴포넌트로 생성.

### 페이지 구조
- **D-04:** 별도 `/coupang/*` 라우트 사용. `/coupang/orders`, `/coupang/returns` 분리.
- **D-05:** 기존 `/orders`, `/returns` 페이지는 그대로 유지 (호환성).

### KPI 카드 레이아웃
- **D-06:** 4열 그리드로 KPI 카드 배치. 기존 dashboard 페이지 패턴 따르기.

### Claude's Discretion
- KST 헬퍼 함수 구현 방식 (date-fns vs 직접 구현)
- constants.ts 상태 상수 구조
- CoupangDashboardModule 서비스 메서드 시그니처
- Promise.all 패턴 적용 방식

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 기존 코드 패턴
- `apps/server/src/dashboard/dashboard.service.ts` — 기존 대시보드 서비스 (집계 쿼리 패턴)
- `apps/server/src/orders/orders.service.ts` — Prisma 기반 주문 조회 (방금 전환)
- `apps/server/src/returns/returns.service.ts` — Prisma 기반 반품 조회 (방금 전환)
- `apps/web/src/app/dashboard/page.tsx` — 기존 대시보드 프론트엔드 (KPI 카드 + recharts 차트 패턴)

### 리서치
- `.planning/research/STACK.md` — react-day-picker 설치, recharts 이미 있음
- `.planning/research/PITFALLS.md` — KST 타임존, 순차 쿼리, join 키 주의사항

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `recharts` (v3.8.0) — BarChart, LineChart, PieChart 이미 사용 중
- `date-fns` (v4.1.0) — 날짜 포매팅/연산 이미 설치됨
- `DataTable` component — 페이지네이션, 검색, 행 클릭 지원
- `apps/web/src/components/ui/` — 기존 UI 컴포넌트 디렉토리

### Established Patterns
- NestJS: `{domain}.module.ts` + `controller.ts` + `service.ts` 3파일 패턴
- Frontend: `'use client'`, `API_BASE` fetch, 라이트 테마
- DB aggregation: `prisma.coupangOrder.count()`, `prisma.aggregate()`

### Integration Points
- `apps/server/src/app.module.ts` — CoupangDashboardModule 등록
- `apps/web/src/app/` — `/coupang/orders/page.tsx`, `/coupang/returns/page.tsx` 신규

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. 쿠팡 WING 스타일 날짜 필터 참고.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-dashboard-infrastructure*
*Context gathered: 2026-03-26*
