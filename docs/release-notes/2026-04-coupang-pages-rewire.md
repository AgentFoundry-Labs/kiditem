# Coupang Pages Rewire (2026-04-21, Plan E.1)

## What changed for users

- 쿠팡 대시보드 `주문` · `반품` 페이지가 새로고침 후에도 기간 필터 유지 (URL 상태 이전)
- 주문 원본이 없는 반품 (orphan return) 이 amber 배지로 표시 — 반품률 계산에서 제외됨을 명시 (ADR-0017)
- 서버 응답 형식 이상 시 `응답 형식 오류` 메시지 표시 (기존에는 빈 화면 또는 콘솔 에러)
- 네트워크 에러 시 `<ErrorState>` 컴포넌트로 통일된 에러 UI 표시

## 공유 URL 형태

- `?preset=7` / `?preset=30` / `?preset=90` — 프리셋
- `?from=YYYY-MM-DD&to=YYYY-MM-DD` — 커스텀 기간

## 백엔드 변경

기존 6개 `/api/coupang-dashboard/*` 엔드포인트 응답 형태 동일. 서비스 파일 1개 (`channel-dashboard.service.ts`) 에서 local interface 5개 삭제 후 `@kiditem/shared` 의 Zod-inferred 타입으로 교체 + `satisfies` 클로저 — pure type drift guard, 런타임 동작 불변.

## 개발자 변경

- `@kiditem/shared` 에 5개 Zod 스키마 추가 (`ChannelDashboardSummarySchema`, `RevenueTrendPointSchema`, `ProductRankingRowSchema`, `ReturnReasonRowSchema`, `ReturnFaultSplitSchema`)
- `apps/web/src/lib/api-error.ts` 에 `friendlyError(err)` 유틸 추가
- 기존 nested-ternary 2 call-sites (profit-loss / sales-analysis) `friendlyError` + `<ErrorState>` 로 마이그레이션
- `apps/web/src/app/coupang/lib/date-range-url.ts` 에 URL state 유틸 추출 (PRESETS, toParam, parseUrlState)

## 배포 순서 주의 (Deploy Coordination)

**중요**: `apiClient.getParsed` + Zod 스키마 도입으로, 서버 응답 shape 변경 시 클라이언트는 `ZodError` 를 감지하고 `응답 형식 오류` 를 사용자에 표시하는 fast-failure 모드로 전환됨.

- `@kiditem/shared` Zod 스키마 변경 시 **클라이언트 배포 먼저**, 서버 배포 나중
- 역순 배포 시 (서버 먼저, 클라이언트 나중) 배포 기간 중 사용자에게 `응답 형식 오류` 노출 가능
- 필드 이름 변경은 shared 패키지 bump → 클라이언트 deploy → 서버 deploy 순으로 진행

## 커밋 (squash 전)

- `3f774d3` T1: channel-dashboard schemas + server drift guard
- `68865e5` T2: friendlyError + date-range-url util + migrate 2 sites
- `7ef4825` + `e3d1082` T3: coupang/orders getParsed + URL state + ErrorState (+ quality fixup)
- `1a972e4` + `6ae0619` T4: coupang/returns getParsed + orphan badge + URL state (+ quality fixup)
- `08bc55b` T5: orders RTL (5 tests)
- `6563ec8` T6: returns RTL + orphan badge assertions (6 tests)

## 검증 결과 (배포 전)

- packages/shared: build OK
- apps/server: tsc clean (T1 drift guard 검증)
- apps/web: 수정 파일 tsc clean. 사전 존재 에러는 ad-ops / inventory / products / orders 등 다른 도메인 — E.1 범위 밖
- apps/web vitest: 11 새 테스트 (api-error 7 + orders page 5 + returns page 6 — 일부 중복) 모두 PASS

## 관련 문서

- ADR-0017 returnRate semantic unification
- `docs/superpowers/plans/2026-04-21-plan-e1-coupang-pages-boost.md`
