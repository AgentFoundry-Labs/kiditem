# Phase 3: Returns Dashboard - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

반품/교환 대시보드 페이지(`/coupang/returns`)를 구축한다. 반품률 KPI, 사유 분포 차트, CUSTOMER vs VENDOR 과실 비율 분석을 제공한다.

Requirements: RET-01, RET-02, RET-03

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion (전체)

Phase 2의 Orders Dashboard 패턴을 그대로 따른다:
- **반품 테이블:** DataTable 재사용, 상태/사유별 탭 필터
- **사유 분포 차트:** recharts BarChart (cancelReasonCategory1 기준 가로 바)
- **과실 비율:** faultByType 기준 도넛 차트 (PieChart) — CUSTOMER vs VENDOR 2색
- **KPI 카드:** KpiBar 패턴 재사용 — 총반품/반품률/고객과실/판매자과실
- **날짜 필터:** DateRangePicker + 프리셋 (Phase 1-2와 동일)
- **페이지 레이아웃:** KPI → 과실 도넛 + 사유 바 차트 (2열) → 반품 목록
- **API:** CoupangDashboardService에 getReturnReasonBreakdown + getReturnFaultSplit 메서드 추가
- **사이드바:** `/coupang/returns` "반품 대시보드" 네비 추가

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 1-2 산출물
- `apps/server/src/coupang-dashboard/coupang-dashboard.service.ts` — 기존 트렌드/랭킹 집계 패턴
- `apps/server/src/coupang-dashboard/coupang-dashboard.controller.ts` — 엔드포인트 패턴
- `apps/server/src/common/kst.ts` — kstDayStart()
- `apps/server/src/coupang/constants.ts` — RETURN_STATUSES
- `apps/web/src/app/coupang/orders/page.tsx` — 대시보드 페이지 패턴 (복사 기준)
- `apps/web/src/components/ui/KpiBar.tsx` — KPI 컴포넌트
- `apps/web/src/components/ui/DateRangePicker.tsx` — 날짜 필터
- `apps/web/src/components/layout/Sidebar.tsx` — 사이드바 (네비 추가 위치)

### 기존 패턴
- `apps/server/src/returns/returns.service.ts` — Prisma 반품 조회

### 리서치
- `.planning/research/PITFALLS.md` — KST 타임존, 순차 쿼리 주의

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `recharts` BarChart + PieChart — Phase 2에서 검증됨
- `KpiBar`, `DateRangePicker` — 재사용
- `$queryRaw` 패턴 — Phase 2 trend/ranking에서 검증됨
- `RETURN_STATUSES` — Phase 1에서 생성

### Established Patterns
- Phase 2 `/coupang/orders/page.tsx` — 동일 구조 복제
- `Promise.all` 팬아웃 — 서비스 + 프론트 모두
- KST DATE_TRUNC — 검증됨

### Integration Points
- `coupang-dashboard.service.ts` — 반품 집계 메서드 추가
- `coupang-dashboard.controller.ts` — /return-reasons, /fault-split 엔드포인트
- `apps/web/src/app/coupang/returns/page.tsx` — 신규
- `Sidebar.tsx` — 네비 아이템 추가

</code_context>

<specifics>
## Specific Ideas

No specific requirements — Phase 2 패턴 복제로 충분.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-returns-dashboard*
*Context gathered: 2026-03-26*
