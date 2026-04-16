# 테스트 코드 실효성 감사 보고서

- **일자**: 2026-04-17
- **감사 범위**: 전체 코드베이스 (server 67 + web 14 + shared 3 + agents-python 2 = 86 파일)
- **감사 기준**: ① 허수 Mock · ② 약한 Assertion · ③ Skipped/Todo · ④ 테스트 vs 코드 드리프트
- **방법**: 4개 도메인으로 분할 후 Explore 에이전트 병렬 감사

## Executive Summary

| 도메인 | 파일 | 활성 it | Skipped | P0 | P1 | P2 |
|---|---:|---:|---:|---:|---:|---:|
| agent-registry | 25 | 142 | 0 | 3 | 4 | 1 |
| panel/products/rules/action-task/feature-gate | 24 | 142 | 0 | 4 | 6 | 3 |
| server-misc (auth/common/workflows/adv/...) | 17 | ~195 | 0 | 3 | 8 | 2 |
| web/shared/python | 19 | 88 | 0 | 3 | 5 | 2 |
| **합계** | **86** | **~567** | **0** | **13** | **23** | **8** |

**핵심 시그널**:
- **Skip/Todo 잔존 0건** — 테스트는 전부 "실행은 되고 있음".
- 그러나 **P0 13건 중 3건은 실제 프로덕션 보안 버그(IDOR/Multitenancy)** — 테스트 허수가 CLAUDE.md 금지 패턴 위반을 **4번이나** 놓침.
- **Race guard mock 허수 패턴이 3개 파일에 걸쳐 존재** (panel-pr3, action-cap, action-task-claim) — 단일 인프라 투자로 동시 해결 가능.
- **Zod parse 누락으로 인한 응답 shape drift** — heartbeat, advertising, shared 등 여러 도메인에서 공통.

---

## 🚨 Critical: 프로덕션 보안 버그 (테스트가 놓쳤음)

이건 "테스트 강화" 영역이 아니라 **즉시 핫픽스** 대상입니다. 테스트 감사 결과 발견된 실제 소스 위반:

### CRIT-1. picking.service.ts:88 — IDOR
```ts
async complete(id: string) {
  const list = await this.prisma.pickingList.findUnique({ where: { id } });
```
- `apps/server/CLAUDE.md` 명시 금지: `findUnique({ where: { id } })` → IDOR
- **fix**: `findFirst({ where: { id, companyId } })`로 교체 + `companyId` 파라미터 추가
- **파일**: [apps/server/src/picking/picking.service.ts:88](apps/server/src/picking/picking.service.ts:88), [picking.controller.ts](apps/server/src/picking/)
- **테스트 gap**: [picking-flow.spec.ts:127-144](apps/server/src/picking/__tests__/picking-flow.spec.ts:127) cross-tenant 시나리오 없음

### CRIT-2. orders.service.ts — Multitenancy 전면 누락 (4 violations in one file)
```ts
// L26  findAll
const orders = await this.prisma.order.findMany({
  where: { status: dbStatus, ...orderedAtFilter },   // ❌ companyId 필터 없음
});
// L44  findOne
return this.prisma.order.findUnique({ where: { id } });   // ❌ IDOR

// L59-74  getStats
this.prisma.order.count(),                            // ❌ 전체 회사 합산
this.prisma.order.count({ where: { status: 'ACCEPT' } }),  // ❌ 동일
...
```
- **영향**: 한 회사 사용자가 `/api/orders`, `/api/orders/:id`, `/api/orders/stats` 호출 시 **다른 회사 주문까지 노출**
- **파일**: [apps/server/src/orders/services/orders.service.ts:26, 44, 59-74](apps/server/src/orders/services/orders.service.ts:26)
- **테스트 gap**: [order-flow.spec.ts:46-59, 120-143](apps/server/src/orders/services/__tests__/order-flow.spec.ts:46) — 모든 assertion이 `status` 필터만 검증, `companyId` 검증 없음

### CRIT-3. e2e marketplace — 멀티테넌시 검증 맹점
- [apps/server/e2e/marketplace.e2e.spec.ts:65-73](apps/server/e2e/marketplace.e2e.spec.ts:65) — 모든 Prisma mock이 고정 배열 반환하므로 `companyId` 필터 존재/부재 검증 불가
- **조치**: e2e setup에 companyId별 다른 결과 리턴 추가 + `toHaveBeenCalledWith({ where: objectContaining({ companyId }) })` assertion 강화

---

## 공통 테마 (횡단 이슈)

### T1. Race guard mock 허수 — "로직 존재 여부만 검증"
Mock Prisma는 동기이므로 `updateMany({ count: 0 })` 반환을 단순히 "count=0 분기 타는지"만 검증. 실제 Postgres 동시 update에서 count가 예상과 다르게 나오는 버그는 탐지 불가.

- [panel-pr3.integration.spec.ts:198-223](apps/server/src/panel/__tests__/panel-pr3.integration.spec.ts:198) — 스스로 `DONE_WITH_CONCERNS` 인정
- [action-cap.service.spec.ts:16-23](apps/server/src/agent-registry/business-safety/__tests__/action-cap.service.spec.ts:16)
- [action-task-claim.spec.ts:46-68](apps/server/src/action-task/__tests__/action-task-claim.spec.ts:46)

**해법**: 두 갈래.
1. **인프라 투자 (근본)**: `docker-compose.test.yml` + 테스트용 Postgres + Prisma migrate → 진짜 동시 트랜잭션 재현. `testcontainers-node` 같은 패턴.
2. **단기 완화**: "race guard mock"임을 명시한 주석 + "real Postgres 통합 테스트 필요" 태그를 일관 부착 + PR 템플릿에 flag 추가.

### T2. Zod parse 누락 (응답 shape drift 위험)
응답이 "필드 존재"만 검증, Zod schema parse 생략 → 타입 drift 못 잡음.

- [heartbeat-flow.spec.ts:277-298](apps/server/src/agent-registry/heartbeat/__tests__/heartbeat-flow.spec.ts:277) — `AGENT_OUTPUT_SCHEMAS.parse()` 생략
- [ad-flow.spec.ts:291-320](apps/server/src/advertising/services/__tests__/ad-flow.spec.ts:291) — `AdSnapshot.level` enum 검증 없음
- [rules.service.spec.ts:62-156](apps/server/src/rules/__tests__/rules.service.spec.ts:62) — `PanelAlertItem` adapter 통과 확인 없음
- [agent-trace.spec.ts:175-198](packages/shared/src/schemas/agent-trace.spec.ts:175) — nested type override 테스트 없음

**해법**: 각 서비스 spec에서 응답에 `Schema.parse(result)` 한 줄씩 추가. ROI 높음.

### T3. API/외부 클라이언트 overmock (에러 경로 커버리지 0)
`globalThis.fetch`, `apiClient`, Gemini SDK, asyncpg, Langfuse `@observe` 등을 전부 mock하여 **에러/재시도/timeout 경로**를 거의 테스트하지 않음.

- [useProductImages.test.ts:74-94](apps/web/src/hooks/__tests__/useProductImages.test.ts:74) — fetch 전면 mock
- [thumbnail-flow.spec.ts:281-400](apps/server/src/products/services/__tests__/thumbnail-flow.spec.ts:281) — Gemini timeout/quota 미커버
- [conftest.py + test_content_agent.py](agents/tests/) — `@observe` 데코레이터 통과 미검증
- [page.test.tsx:76-86 (agents/tasks)](apps/web/src/app/agents/tasks/__tests__/page.test.tsx:76) — 5xx 에러 경로 없음

**해법**: MSW(web) / 실제 Langfuse stub(python) / Gemini error 시나리오 fixture 추가.

### T4. React Query invalidation 미검증
Mutation onSuccess에서 `queryClient.invalidateQueries` 호출 여부를 검증 안 해, UI가 stale 상태 방치되는 버그 탐지 불가.

- [action-board/page.spec.tsx:83-99](apps/web/src/app/action-board/__tests__/page.spec.tsx:83)

---

## Findings by Domain

### A. agent-registry (25 파일)

**P0**:
- **P0-1** [agent-registry.service.spec.ts:117-128](apps/server/src/agent-registry/__tests__/agent-registry.service.spec.ts:117) — `run()` budget 검증만 있고 `wakeAgent()`엔 미러 테스트 없음. "budget check는 한 곳에만" CLAUDE.md 규칙 감지 못함.
- **P0-2** [heartbeat-flow.spec.ts:277-298](apps/server/src/agent-registry/heartbeat/__tests__/heartbeat-flow.spec.ts:277) — success stdout이 `AGENT_OUTPUT_SCHEMAS['ad_strategy']`로 Zod parse되지 않음. T2.
- **P0-3** [action-cap.service.spec.ts:16-23](apps/server/src/agent-registry/business-safety/__tests__/action-cap.service.spec.ts:16) — T1.

**P1**: heartbeat-panel-emit 순서 검증 부족 / compressor truncation 내용 검증 없음 / agent-trace secret scrub 단일 패턴만 / ad-strategy onResultReady 에러 silent 확인만.

**P2**: retry.service title 고정.

**Healthy**: `fallback-chain.spec.ts`, `agent-trace.spec.ts` 일부, `permission-hierarchy.spec.ts` — 벤치마크로 삼을 만함.

### B. panel + products + rules + action-task + feature-gate (24 파일)

**P0**:
- **P0-1** [panel-pr3.integration.spec.ts:198-223](apps/server/src/panel/__tests__/panel-pr3.integration.spec.ts:198) — T1 (race mock 허수). 사용자 지적한 "DONE_WITH_CONCERNS" 자인 사례.
- **P0-2** [thumbnail-flow.spec.ts:281-400](apps/server/src/products/services/__tests__/thumbnail-flow.spec.ts:281) — Gemini 실패 경로 제로. T3.
- **P0-3** [thumbnail-editor-generate.spec.ts:32-45](apps/server/src/products/__tests__/thumbnail-editor-generate.spec.ts:32) — `aiService.fetchImageAsBase64Public` mock 뒤에서 data:URL → HTTP fetch 변환 로직이 never executed.
- **P0-4** [rules.service.spec.ts:62-156](apps/server/src/rules/__tests__/rules.service.spec.ts:62) — `alertPanelAdapter.mapToItem` 호출 검증 없음. adapter 빠져도 테스트 pass.

**P1**: 색상 variant label 일부만 / setImmediate 비동기 미대기 / claim race mock / grade 분포 부분만 / promote transaction 내부 순서 없음 / feature-gate 배열 중복·순서 미검증.

**P2**: panel service happy path만 / thumbnail include forwarding만 / DB 예외 로그 검증 없음.

**Healthy**: `alert-schema-drift.spec.ts`, `agent.adapter.spec.ts`, thumbnail-flow 일부.

### C. server-misc (17 파일)

**P0** (3건 **전부 위 CRIT과 연결됨**):
- **P0-1** [picking-flow.spec.ts:127-144](apps/server/src/picking/__tests__/picking-flow.spec.ts:127) → CRIT-1
- **P0-2** [order-flow.spec.ts:46-59, 120-143](apps/server/src/orders/services/__tests__/order-flow.spec.ts:46) → CRIT-2
- **P0-3** [marketplace.e2e.spec.ts:65-73](apps/server/e2e/marketplace.e2e.spec.ts:65) → CRIT-3

**P1**: advertising `AdSnapshot.level` enum Zod 없음 / workflow context.getOutput 에러 경로 없음 / workflow error 메시지 partial match / finance profitRate division-by-zero 미커버 / sourcing search response shape 부분만 / orders getStats 호출 순서 미검증 / settlements invalid period 미커버 / dev-auth middleware DB 에러 로그 미검증.

**P2**: storage env 복원 스타일 / dto-validation 사소한 누락.

**Healthy**: auth 가드/데코레이터, GlobalExceptionFilter (Prisma 에러 코드 매핑), StorageService (env + S3 comprehensive), procurement state machine, DTO validation, DevAuthMiddleware.

### D. web + shared + agents(python) (19 파일)

**P0**:
- **P0-1** [useProductImages.test.ts:74-94](apps/web/src/hooks/__tests__/useProductImages.test.ts:74) — `globalThis.fetch` 전면 mock, blob 변환 실패 경로 없음.
- **P0-2** [agents/tasks/page.test.tsx:76-86](apps/web/src/app/agents/tasks/__tests__/page.test.tsx:76) — status filter 변경 시 에러 경로 미커버.
- **P0-3** [conftest.py + test_content_agent.py](agents/tests/) — Langfuse `@observe` decorator chain 깨져도 green.

**P1**: action-board mutation invalidation 검증 없음 / api-client text() 재실패 경로 / shared agent-trace nested type drift / trace fallback ANSI escape 미테스트 / panel-store seq ordering race.

**P2**: timeAgo 타임존 / panel types enum value 검증.

**Healthy**: `api-client.test.ts`, `PanelAlertRow.spec.tsx`, `agent-trace.spec.ts` (대부분), `panel-store.spec.ts`.

---

## Fix Strategy — 단계별 PR 제안

### PR-A. 🔴 Security hotfix (즉시, 단일 PR)
**Scope**: CRIT-1 + CRIT-2 + 관련 테스트 강화
- `picking.service.ts::complete()` — `companyId` 파라미터 + `findFirst({ id, companyId })`
- `picking.controller.ts` — `@CurrentCompany()` 전달
- `orders.service.ts::findAll/findOne/getStats` — 전부 `companyId` 파라미터 + where 필터
- `orders.controller.ts` — `@CurrentCompany()` 전달
- 테스트: cross-company IDOR 시나리오 추가 (picking-flow, order-flow) — 같은 id인데 다른 companyId → NotFound 검증
- e2e marketplace: `toHaveBeenCalledWith({ where: objectContaining({ companyId }) })` 강화

**규모**: 4-6 파일 수정 + 2-3 테스트 추가. 반나절.

### PR-B. 🟡 Race guard 허수 완화 (선택 — 인프라 투자)
**Option B1 (단기)**: mock race 테스트에 `// RACE-GUARD-MOCK: real Postgres 재현 불가` 마커 일관 부착 + 팀 인지용 `docs/TESTING.md` 한 문단.
**Option B2 (근본)**: `docker-compose.test.yml` + vitest projects로 real Postgres 통합 스위트 추가. T1 전부 변환.

PR-A 진행 후 사용자 결정.

### PR-C. 🟡 Zod parse 체계화 (T2)
**Scope**: 응답 검증 보강
- heartbeat-flow.spec — `AGENT_OUTPUT_SCHEMAS.parse()` 추가
- ad-flow.spec — `AdSnapshotSchema.parse()` 추가
- rules.service.spec — `PanelAlertItemSchema.parse()` 추가
- shared agent-trace.spec — invalid type override 시나리오 추가

**규모**: 4-6 테스트 수정 + 필요시 schema export. 1-2시간.

### PR-D. 🟢 Error path 커버리지 (T3) — 선택
- thumbnail-flow: Gemini timeout/quota/malformed fixture
- useProductImages: blob() reject 시나리오
- agents/tasks/page: 5xx API error toast 경로

**규모**: 점진 적용. 단일 PR보다는 도메인별 커밋.

### PR-E. 🟢 Misc assertion 강화 (P1 나머지 + P2)
통합이 아닌 **도메인별 소규모 PR 시리즈** 권장 (잘못된 한 번의 거대 PR 위험 높음).

---

## 최종 권장

**지금 당장**:
1. **PR-A (Security hotfix)** 실행 → 프로덕션 IDOR/multitenancy 차단.

**PR-A 머지 후 결정**:
2. T1 처리 방식 선택 (B1 단기 vs B2 인프라) — 사용자 결정 필요.
3. PR-C (Zod parse) 실행.
4. PR-D/E는 우선순위에 따라 개별 실행.

**하지 말아야 할 것**:
- "전체 픽스 한 PR로" — 보안 hotfix와 assertion 강화가 섞이면 리뷰 지옥. PR-A는 반드시 단독.
