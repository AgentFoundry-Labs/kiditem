# 테스트 코드 정리 감사 보고서

- **일자**: 2026-04-17 (Part 2 — cleanup perspective)
- **선행 문서**: `docs/TEST_AUDIT_2026-04-17.md` (강화 관점)
- **이번 목표**: 실효성 없는 테스트를 **삭제/축소/통합**하기 위한 대상 식별
- **방법**: 4개 Explore 에이전트 병렬 감사 + **재검증** (에이전트 판정의 근거 확인)

## Executive Summary

에이전트 4명이 제안한 총 **삭제/축소/통합 34건**을 재검증한 결과:

| 카테고리 | 에이전트 권장 | 재검증 결과 | 실제 안전 삭제 |
|---|---:|---:|---:|
| REMOVE | 15 | — | **2** (+ PR-B 조건부 4) |
| DOWNGRADE | 12 | — | **선택적, 강제 X** |
| MERGE | 4 | — | **0** (재검증 후 전부 부인) |

**핵심 발견**:
- 코드베이스는 **생각보다 건강함**. Skip/todo 0건, 보안 레이어(auth) 완전, 구현 디테일 테스트 거의 없음.
- "전체 파일 삭제" 권장 3건은 **근거 부정확**:
  - `product-images.spec` / `thumbnail-editor-generate.spec` — 에이전트는 "e2e가 대체"라 했으나 **실제 e2e 없음**
  - `PanelItemRow.spec` — "parent PanelSheet가 커버"라 했으나 **PanelSheet에 discriminator 테스트 없음**
- `panel-pr3` race mock 4건은 `panel-pr3.pg.integration.spec.ts`(PR-B)가 main 머지 이후 안전 삭제 가능

## 1. 안전 삭제 권장 (지금 실행 가능)

### CLEAN-1. `heartbeat/__tests__/dynamic-cron.spec.ts:L88-L97` — smoke 테스트

```ts
it('output without nextSchedule → no timer replacement, no DB update', async () => {
  // 아무것도 호출하지 않는다는 사실만 확인
  expect(prisma.agentDefinition.update).not.toHaveBeenCalled();
  expect(schedulerRegistry.addCronJob).not.toHaveBeenCalled();
});
```
- **이유**: "호출 안 됨" 확인만. 양의 경로가 다른 테스트에서 커버됨.
- **리스크**: low
- **감소**: ~10 lines

### CLEAN-2. `business-safety/__tests__/dry-run-gate.service.spec.ts:L22-L25` — trivial edge

```ts
it('does not force when dryRun=undefined', () => {
  const result = service.check(0, undefined);
  expect(result.forced).toBe(false);
});
```
- **이유**: `undefined` falsy는 JS 기본 동작. L17-L20 `dryRun=true` 테스트로 충분.
- **리스크**: low
- **감소**: ~4 lines

## 2. 조건부 삭제 (PR-B main 머지 후)

PR-B 브랜치(`test/infra-real-postgres-race`)에 real Postgres race 테스트가 있음. main 머지 완료 시 아래 mock race 테스트들은 안전 삭제 가능.

### COND-1. `panel/__tests__/panel-pr3.integration.spec.ts` race mock 4건
- **Scenario 2** (L197-L223) — promote race (updateMany count=0 mock)
- **Scenario 2b** (L226 근처) — promote P2002 mock
- **Scenario 4** (L282-L299) — claim race mock
- **Scenario 4b** — claim IDOR (mock) — ⚠️ cross-company 검증은 유지 가치 있음, 재검토 후 결정

**대체**: `panel-pr3.pg.integration.spec.ts` (PR-B, 6 tests) — real Postgres 동시 트랜잭션
**조건**: PR-B가 main에 머지된 상태여야 함 (현재 미머지)
**감소**: ~80 lines

### COND-2. `action-task/__tests__/action-task-claim.spec.ts` race mock
- L46-L68 근처 race 시나리오 (`updateMany count=0` mock)
- **대체**: `action-task-claim.pg.integration.spec.ts` (PR-B, 6 tests)
- **조건**: PR-B 머지 후
- **감소**: ~30 lines

## 3. 에이전트 권장을 **부인**한 것들 (근거 약함)

### 부인-1. agent-registry R-3, R-4 — secret scrub 관련 (`heartbeat.service.spec.ts:L198-L211`, `agent-trace.service.spec.ts:L296-L301`)
- **에이전트 주장**: "Phase 0.2 기능, 현재는 Phase 0.3+에서 변경됨"
- **재검증**: `heartbeat.service.ts`에 `scrubSecrets` 호출 **6개 지점** 여전히 활성 (L417, L473, L474, L491, L546, L557)
- **판정**: **KEEP** — 현재 운영 중인 보안 로직

### 부인-2. panel R-5 `product-images.spec.ts` 전체 파일 삭제
- **에이전트 주장**: "mock Prisma 테스트는 의미 없음, e2e에서 커버됨"
- **재검증**: `apps/server/e2e`에 products/thumbnail 관련 e2e 없음 (marketplace.e2e, products.e2e 두 개뿐이며 products.e2e는 CRUD만)
- **판정**: **KEEP** — 삭제 시 `updateImages` validation 커버리지 0
- **근거**: 
  ```bash
  $ grep "updateImages\|product-images" apps/server/e2e/*.spec.ts → 결과 없음
  ```

### 부인-3. panel R-6 `thumbnail-editor-generate.spec.ts` 전체 (14 tests)
- **에이전트 주장**: "controller routing mock만, e2e에서 더 나음"
- **재검증**: thumbnail-editor e2e 없음
- **판정**: **KEEP** — color variant label 매핑 등 실제 비즈 로직 검증

### 부인-4. panel R-7 `alert-schema-drift.spec.ts` 전체
- **에이전트 주장**: "tsc가 담당하므로 runtime 테스트 불필요"
- **재검증**: Prisma `findMany` 결과는 런타임 shape이 DB 설정에 따라 달라질 수 있음 (컴파일 타입과 다를 수 있음). Zod runtime parse가 유일한 방어선.
- **판정**: **KEEP** — 런타임 drift 감지 가치 있음

### 부인-5. web M-1 `PanelItemRow.spec.tsx` 통합 삭제
- **에이전트 주장**: "PanelSheet.spec에서 이미 discriminator 커버"
- **재검증**: PanelSheet에는 `kind: 'run'`/`'alert'` fixture만 사용. discriminator 로직(PanelItemRow가 kind에 따라 다른 컴포넌트 렌더)을 직접 검증하는 테스트는 PanelItemRow.spec만 있음.
- **판정**: **KEEP**

### 부인-6. web R-2 `agents/tasks debounce 300ms` (L88-L97)
- **에이전트 주장**: "flaky timing 테스트"
- **재검증**: 현재 pass 중. 실제로 debounce 동작(입력 변화 → 300ms 대기 → 재요청)은 UX-critical. `{ timeout: 2000 }`로 flakiness 이미 완화.
- **판정**: **KEEP**

### 부인-7. web R-3 `panel/types.spec phase/failureType 허용` (L142-L161)
- **에이전트 주장**: "Zod optional 문법 반복"
- **재검증**: `phase: undefined|null|string` 모두 허용은 **도메인 규칙**(workflow vs image vs agent source의 phase 의미 차이). 단순 Zod 문법 검증 아님.
- **판정**: **KEEP**

## 4. 선택적 축소 (DOWNGRADE, 강제 X)

당장 할 필요 없지만 리팩터 기회 있으면 고려:

- agent-registry `action-cap.service.spec` (6 it → 3 it 통합)
- common `dto-validation.spec` shipmentBoxIds 중복 (2 it → 1 it)
- finance `pl-flow.spec` period vs shape 중복 (2 it → 1 it)
- e2e `products.e2e` pagination 이중 검증
- e2e `marketplace.e2e` agents installed 상태 (2 it → 1 it)
- 기타 ~5건

**총 예상 감소 (선택적 축소 전부)**: ~50 lines

## 5. 실행 플랜

### Stage 1 (안전 — 지금 실행 가능)
- CLEAN-1 + CLEAN-2 실행 → ~14 lines 삭제
- 커밋 1개: `test: remove smoke/trivial tests (audit Part 2)`

### Stage 2 (PR-B 머지 후)
- COND-1 + COND-2 실행 → ~110 lines 삭제
- 선행 조건: `test/infra-real-postgres-race` 브랜치가 main 머지
- 커밋: `test: remove mock race tests (replaced by real PG integration)`

### Stage 3 (선택 — 리팩터 기회 있을 때)
- DOWNGRADE 5건 검토 → ~50 lines
- 강제 아님. 각 파일 리팩터 시 자연스럽게 통합

## 6. 최종 권고

**지금 당장 실행 안전**: Stage 1 (2건, 14 lines)

**PR-B 머지 의존**: Stage 2 (4-5건, 110 lines)

**나머지**: 에이전트 권장을 재검증한 결과 대부분 근거 약함. 현재 코드베이스의 테스트는 "정리 관점"에서도 **생각보다 건강**.

### 에이전트 활용 교훈
공격적 삭제 권장 시 반드시 재검증 필요:
1. "대체 커버리지 있다" → 실제 파일 경로 확인
2. "구현 디테일만 검증" → public behavior 검증 여부 확인
3. "더 나은 테스트로 대체됨" → 대체 테스트 실재 확인

에이전트 4명이 권장한 "전체 파일 삭제" 3건 중 **3건 모두 부인** (e2e 없음 / parent 커버 안 함).
