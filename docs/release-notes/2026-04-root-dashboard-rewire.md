# Root Dashboard Rewire (2026-04-22, Plan F1)

## What changed for users

- 루트 대시보드 (`/`) 가 정상 작동 — 로그인 직후 첫 화면 KPI / 차트 / 경고 위젯이 실제 수치 표시
- 매출 요약 (`monthly.revenue` / `profit` / `adRate` / 상위 10 상품) 라이브 집계로 표시 (이전: stub throw)
- 적자 / 저이익 / 광고비 초과 경고 카드 가 실제 주문 데이터 기반으로 카운트 (이전: profit_loss 빈 테이블 → 항상 0)
- 일별 매출 트렌드 차트 가 실제 매출 (라인아이템 합계) 표시 — 이전 버그: `Order.totalPrice` 합계로 라인아이템 변경 후 부정확
- 서버 응답 형식 이상 시 `응답 형식 오류` 메시지 (Zod 검증 실패) 표시
- 네트워크 / 서버 에러 시 `다시 시도` 버튼 + 친화적 메시지

## 백엔드 변경

- **신규 공유 helper** `apps/server/src/common/per-listing-profit.ts:buildPerListingMetrics` — `profit-loss.service.findAll` 의 per-listing 집계 코어 추출. Finance + dashboard 양쪽 consumer.
- **`DashboardSalesService` 전면 구현** — `Not implemented: Plan B2c migration` stub 제거. 9 promise 병렬 (calculateProfitForRange × 4 + raw KPI × 3 + monthlyTrend loop + Wing override).
- **`DashboardInventoryService.warnings`** — `prisma.profitLoss.findMany` → `buildPerListingMetrics`. 임계 동일 (적자 < 0, 저이익 0–3%, 고광고 > 15%).
- **`DashboardTrendService.avgProfitRate`** — `prisma.profitLoss.aggregate` → `calculateProfitForRange`. 빈 테이블에 의존하지 않음.
- **`DashboardTrendService` raw SQL revenue I3 fix** — `SUM(orders.total_price)` → `JOIN order_line_items + SUM(oli.total_price)`. Plan A.5 이후 잠재 버그 해소.
- **`profit-loss.service.findAll`** — helper 호출 + return-rows 머지 (PLData.returnCount 유지). 동작 동일.

## 프론트엔드 변경

- **`apps/web/src/app/page.tsx`**:
  - 5개 `apiClient.get<T>` → `apiClient.getParsed(url, Schema)` (Zod 검증)
  - `/api/products/pipeline-stats` (404) 호출 제거 — `inventoryData.gradeCount` 폴백
  - `SectionError` props `{ msg?: string; onRetry: () => void }` 확장
  - 4개 SectionError 호출 site 에 `friendlyError(err)` 전달
- **신규 RTL 스펙** `apps/web/src/app/__tests__/page.spec.tsx` — 6 테스트 (loading, success, 502 non-baseline, 502 baseline, Zod drift, pipeline-stats not called)

## 배포 순서 주의 (Deploy Coordination)

`apiClient.getParsed` + Zod 도입으로 서버 응답 shape 변경 시 클라이언트는 `ZodError` 를 감지하고 `응답 형식 오류` 를 표시하는 fast-failure 모드로 전환됨. 따라서:

- `@kiditem/shared` Zod 스키마 변경 시 **클라이언트 배포 먼저**, 서버 배포 나중
- 역순 배포 시 (서버 먼저, 클라이언트 나중) 배포 기간 중 사용자에게 `응답 형식 오류` 노출 가능
- 필드 이름 변경은 shared 패키지 bump → 클라이언트 deploy → 서버 deploy 순으로 진행

## Known limitations (F1-scope deferred)

- **Top Revenue Products 의 `netProfit`/`profitRate`** — 모든 행이 `revenue × 30%` 근사값 사용 (`profitRate=30.0` 고정). 정확한 per-listing 마진은 `/profit-loss` (좌측 메뉴) 에서 확인. 사용자 노출 위젯이지만 요약 시각화 목적 — 재무 보고서 아님. 정밀 계산은 `buildPerListingMetrics` 호출 추가 필요 (성능 trade-off — F1.1 후속 검토).
- **`calculateProfitForRange` 의 `isCurrentPeriod` 타이밍 엣지** — `dashboard-trend` 가 `to = new Date()` 를 helper 로 넘기고, helper 내부에서 다시 `now = new Date()` 를 만드는 구조. `to > now` 비교가 sub-millisecond 타이밍에 의존 → 현재 월 호출 시 AdSnapshot pro-rata 분기 vs Ad fallback 분기가 비결정적으로 선택됨. 두 분기의 결과 차이는 1% 미만 (실측 안 됨, 추정). 수정은 helper 시그니처에 `now: Date` 파라미터 추가 — F1 범위 외 helper 변경이라 후속 plan 으로 이연.
- **`apiClient.get<T>` 잔존 2건** — `/api/action-tasks` (page L127), `/api/agent-registry/org` (DashboardChart L780). 둘 다 별도 shared Zod 스키마 필요 + 서버 controller drift 가드 필요 → F2/F4 범위. F1 의 I7 invariant 는 dashboard 5 endpoint 에만 적용.

## ADR-0016 reader-count update

ADR-0016 § Scope boundaries 의 8 ProfitLoss readers 중 **2건이 F1 으로 close**:

| Service | Pre-F1 status | Post-F1 status |
|---|---|---|
| dashboard-inventory | findMany (D.4 검토) | **buildPerListingMetrics 경유 — close** |
| dashboard-trend | aggregate (D.4 검토) | **calculateProfitForRange 경유 — close** |

남은 6 readers: statistics × 5, settlements, sales-plans, sales-analysis (이미 D.3 에서 close 됨 — count 5), ad-strategy, action-task × 2. Plan D.3b (statistics + settlements + sales-plans), Plan E (ad-strategy), Plan D.5 (action-task) 가 후속 close 예정.

ADR-0016 본문은 **수정하지 않음** (ADR immutable). 본 release note 가 supersession 기록.

## 커밋 (squash 전)

- T1 `16fb411`: `common/per-listing-profit.ts` extract + profit-loss refactor + integration spec (5 tests)
- T2 `3d4b90f` + fixup `26889fe`: DashboardSalesService full impl + integration spec (6 tests) + satisfies/pct1 quality fixup
- T3 `0202da6` + fixup `2132179`: dashboard-inventory warnings rewire + spec rewrite (5 tests) + unused import drop
- T4 `d431ceb`: dashboard-trend live aggregation + I3 SQL fix + spec rewrite (4 tests)
- T5 `7016bf1`: page.tsx rewire (getParsed + SectionError + friendlyError) + RTL spec (6 tests)
- T6 (this commit): release note

## 검증 결과 (배포 전)

- **backend integration**: **200/200 PASS** (26 test files, 36.91s) — F1 contributed 20 tests (T1: 5 + T2: 6 + T3: 5 + T4: 4)
- **frontend tsc / build**: `app/page.tsx` clean (Next.js compiled successfully). 사전 존재 에러 1건 — `apps/web/src/app/ad-ops/components/AdSidePanel.tsx:19 strategy.adIssues` (F2/ad-ops 범위). 그 외 ad-ops / products / inventory / orders / image-hub / thumbnail-editor 사전 결함은 `project_next_session_handoff.md` 참조 — F2/F3/F4 에서 처리 예정.
- **frontend RTL** (`page.spec.tsx`): **6/6 PASS** (2.41s)
- **dev:server boot**: PASS (`Nest application successfully started`, F1 worktree build, 모든 Controller route 매핑 완료)
- **`GET /api/dashboard/sales` smoke** (`x-dev-user-id=00000000-0000-0000-0000-00000000d001`): HTTP 200, 정상 JSON 응답 (today / monthly / topProducts / monthlyTrend × 6 / profitDetail / rangeKpi 모두 zero-valued struct — 빈 dev DB 기준). No 500.

## 관련 문서

- Spec: `docs/superpowers/specs/2026-04-21-plan-f1-root-dashboard-design.md`
- Plan: `docs/superpowers/plans/2026-04-22-plan-f1-root-dashboard.md`
- ADR-0016: `.claude/docs/decisions/0016-profit-loss-live-aggregation.md`
- ADR-0018: `.claude/docs/decisions/0018-dashboard-idor-sweep-raw-sql-tenancy.md`
