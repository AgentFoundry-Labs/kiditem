# Dashboard IDOR Sweep (2026-04-21, Plan IDOR)

## 요약 — Security 수정 (Multi-tenant data isolation)

ADR-0018 에 근거하여 dashboard 도메인의 residual IDOR 4 건을 닫았다. 멀티테넌트 환경에서 해당 엔드포인트가 **모든 테넌트의 데이터를 집계하여 반환**하던 문제를 해결.

## Impact

Pre-fix 환경에서 아래 엔드포인트 응답 수치가 **실제 값보다 부풀려진 상태**로 노출되었을 가능성:
- `GET /api/dashboard/trend` — 매출·이익·광고비 트렌드
- `GET /api/dashboard/ad` — 광고 일별 집계 (dailyAd) + Wing 연동 (wingAdData)
- `GET /api/dashboard/inventory` — 재고/알림/등급/썸네일 요약

단일 테넌트 환경 (현재 dev / 초기 stg) 에서는 `organizationId` 가 1 개뿐이므로 **실질적인 data leak 없음**. 멀티테넌트 SaaS 전환 이후 (최소 2 회사 row 존재) 부터 영향 발생.

## 수정 사이트

1. `dashboard.controller.ts` — `@Get('trend')` + `@Get('inventory')` + `@Get('sales')` (preemptive) 에 `@CurrentOrganization()` 추가
2. `dashboard-trend.service.ts` — 3 개 쿼리 (profitLoss.aggregate + orders $queryRaw + ads $queryRaw) 에 `organizationId` 바인딩
3. Historical `dashboard/helpers/wing-ad-summary.ts` path — helper signature 에 `organizationId` 2 nd positional 추가 + Wing summary queries 에 적용
4. `dashboard-ad.service.ts` — dailyAdRows `$queryRaw` 에 `organization_id = ${organizationId}::uuid` 바인딩
5. `dashboard-inventory.service.ts` — 8 개 Prisma 쿼리 (masterProduct.groupBy/count/findMany, alert.findMany, profitLoss.findMany, inventory.findMany, gradeHistory.findMany, thumbnail.count) 에 `where: { organizationId }` 추가, `masterProduct.findMany` 의 `include: { listings }` 에 2-hop `where: { organizationId }` 추가

## Enforcement

- 새 규칙: `scripts/check-queryraw-tenancy.sh` — 모든 `$queryRaw` 가 `organization_id` 바인딩 포함 확인
- `npm run check:idor` 로 로컬 실행
- Auto-exemptions: `FOR UPDATE` row-lock on UUID PK + `nextval()` sequence (structurally safe — tenancy enforced elsewhere)
- CI 통합은 별도 Plan

## 관련 문서

- Historical plan/ADR scratch docs were pruned during the instruction cleanup.
  Durable tenancy and raw SQL contracts now live in `AGENTS.md`, scoped
  `AGENTS.md` files, and this release note.

## 배포 order

본 sweep 은 서버-side 만 수정 (API response shape 불변). 클라이언트 deploy 순서 제약 없음. Feature flag 불필요 — multi-tenant 환경에서도 pre-fix 대비 동일 사용자에게 동일 numbers (또는 적게 노출된 실제 값) 표시.

## 테스트 커버리지

- `dashboard-trend.pg.integration.spec.ts` — 4 tests (TEST/OTHER isolation, empty, avgProfitRate)
- `wing-ad-summary.pg.integration.spec.ts` — 4 tests (TEST/OTHER, null, lastSyncAt)
- `dashboard-ad.pg.integration.spec.ts` — 3 tests (TEST dailyAd, OTHER dailyAd, monthly)
- `dashboard-inventory.pg.integration.spec.ts` — 4 tests (TEST/OTHER visibility, fresh, needReorder)

**총 15 integration tests** — all PASS, `IDOR_SENTINEL` + positive value assertion 패턴으로 partial leak 도 감지.

## 미준수 (Deferred, Cross-Domain)

`npm run check:idor` 는 ontology + traffic 도메인에서 추가 IDOR 2건을 surfacing 했으나 "one domain per session" 규칙에 따라 별도 플랜으로 분리. ADR-0018 미준수 목록 섹션 참조.
