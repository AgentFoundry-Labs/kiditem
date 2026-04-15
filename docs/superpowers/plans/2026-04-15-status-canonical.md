# Status Canonical Lifecycle — Phase 1 (WorkflowRun)

**Revision**: v2 of 2026-04-15. Supersedes v1 after critic + plan-eng-review flagged 5 CRITICAL + 8 MAJOR issues. v1 attempted all 3 domains in one PR; v2 narrows to WorkflowRun only. HeartbeatRun + ThumbnailGeneration deferred to Phase 2 / Phase 3 separate sessions.

**Branch**: `refactor/status-canonical-workflow`

**Goal**: WorkflowRun의 `status` 값 (그리고 JSON 내부 step `status` 값)을 shared Panel canonical enum (`pending|running|succeeded|failed|cancelled`)으로 정렬. `'completed'` 드리프트 제거. PR1에서 workflow-run-mapper에 넣은 normalizeWorkflowStatus 우회 코드 삭제.

**Why**: PR1 구현 중 발견된 드리프트 버그 (`workflow-runner` 'completed' 쓰는데 Panel canonical은 'succeeded') 근본 원인 제거. 매핑 테이블은 tech debt를 다른 곳에 숨기는 것뿐이었음. 어휘 통일이 root fix.

**Non-goals (Phase 2/3 deferral)**:
- HeartbeatRun `'timed_out'` → `{status:'failed', failureType:'timeout'}` (Phase 2 — 별도 session)
- ThumbnailGeneration `'ready'/'applied'/'skipped'/'generating'` → status + phase 컬럼 (Phase 3 — 별도 session)
- `agent_tasks.status='completed'` at `heartbeat.service.ts:528` (Phase 2 — AgentTask 도메인 별도 scope)
- Cost analytics raw SQL `'timed_out'` references (Phase 2)
- ESLint/CHECK regression guard (cross-phase — 전 3 phase 끝난 뒤 추가 task)

**Spec coverage**: Phase 1은 1 도메인이지만 **ADR-0011은 prescriptive for all future domains** — Phase 2/3/향후 신규 도메인까지 규칙 한 번에 법제화.

---

## Pre-flight (이미 완료)

**Scope 확정 grep 결과**:

| 사용처 | 파일 | 라인 |
|---|---|---|
| Writer (run status) | `apps/server/src/workflows/services/workflow-runner.service.ts` | 141 |
| Writer (step JSON status) | 동 | 201 |
| Reader switch case | `apps/web/src/app/workflows/lib/workflow-types.ts` | 21 |
| Normalizer (삭제 대상) | `apps/server/src/panel/adapters/workflow-run-mapper.ts` | 11 |
| Test assertions | `apps/server/src/workflows/services/__tests__/workflow-flow.spec.ts` | 151, 153, 161, 233, 284 |
| Test mocks | `apps/server/src/panel/__tests__/panel.service.spec.ts` | 79, 92, 93 |
| Shared Zod type | `packages/shared/src/schemas/workflow.ts` | 51 (`z.string()` → enum) |

**확정 파일 수**: 6 code + 1 shared + ADR + backfill SQL = **8 files + 1 migration**

**Blast radius**: 각 수정 독립, 라인 단위 revert 가능. critic의 C1 (file path fiction) 대응 — 모든 라인 번호 현재 코드에서 grep으로 확정됨.

---

## Task Order (critic C2 atomicity 해결)

핵심 원칙: **Writer change → backfill → normalizer delete**. 
- Writer 바꾸기 전에 backfill하면 구버전 코드가 새 row를 'completed'로 다시 쓰는 atomicity gap 발생.
- Backfill 전에 normalizer 삭제하면 legacy row가 'completed' 그대로 Panel에 노출.
- 순서 엄수: Task 2 (writer) → Task 3 (test 업데이트, writer와 같이 커밋) → Task 4 (backfill + JSON) → Task 5 (normalizer 삭제) → Task 6 (consumer 업데이트) → Task 7 (shared Zod) → Task 8 (검증).

---

## Task 1 — ADR-0011 작성 (prescriptive)

**Files**: Create `.claude/docs/decisions/0011-status-canonical-lifecycle.md`

**Frontmatter**:
```yaml
---
id: 0011
title: Status canonical lifecycle
status: Accepted
date: 2026-04-15
supersedes: []
superseded-by: null
affects:
  - prisma
  - apps/server
  - apps/server/src/workflows
  - apps/server/src/agent-registry
  - apps/server/src/products
  - apps/web
  - packages/shared
---
```

**Sections**:

### Context
PR1 Panel Live Ops 구현 중 `workflow-runner.service.ts`가 `status: 'completed'`를 쓰는 반면 shared `PanelRunItem.status` enum은 `'succeeded'`를 요구함을 발견. Adapter 레벨 normalizer (`normalizeWorkflowStatus`) 로 우회했으나 이는 tech debt — 매 신규 도메인 adapter 작성 시 같은 드리프트가 반복될 위험. Cross-domain consumer(Panel, 향후 analytics)가 언제든 비일관된 어휘에 노출됨.

### Decision
**canonical lifecycle** 도입. 모든 async 작업 도메인은 다음 규칙 준수:

**Rule 1** — `status` 컬럼은 `@kiditem/shared` Panel enum의 부분집합만 사용:
- `pending` — 작업 생성됨, 아직 시작 안 함
- `running` — 실행 중
- `succeeded` — 정상 종료
- `failed` — 오류로 종료
- `cancelled` — 사용자/시스템 중단으로 종료

**Rule 2** — 도메인 고유 observability는 **별도 sibling 컬럼**으로 표현:
- 실패 원인 분류 → `failureType` (e.g., `'timeout' | 'error' | 'budget_exceeded'`)
- Lifecycle phase 세분화 → `phase` (e.g., ThumbnailGeneration: `'generating' | 'ready' | 'applied'`)
- 취소 원인 → `cancellationReason` (필요 시)

**Rule 3** — Sub-state 컬럼은 **typed union**으로 shared package에 선언:
```typescript
// packages/shared/src/{domain}/statuses.ts
export const WORKFLOW_FAILURE_TYPES = ['timeout', 'error', 'budget_exceeded'] as const;
export type WorkflowFailureType = typeof WORKFLOW_FAILURE_TYPES[number];
```

**Rule 4** — Cross-domain consumer (Panel, cost analytics, cross-domain UI)는 **매핑 테이블 작성 금지**. 도메인 vocab이 canonical과 다르면 writer를 고치는 것이 책임. 일시적 매핑이 불가피하면 별도 ADR로 예외 등록.

**Rule 5** — 기존 도메인은 본 ADR 이후 순차 정렬. 순서:
- Phase 1 (이 ADR과 함께): WorkflowRun
- Phase 2 (후속): HeartbeatRun — `timed_out` → `failed` + `failureType='timeout'`
- Phase 3 (후속): ThumbnailGeneration — `ready/applied/skipped/generating` → status + phase
- `agent_tasks.status` 는 Phase 2 진행 시 in-scope / out-of-scope 결정

### Alternatives Rejected

| 대안 | 기각 이유 |
|---|---|
| 도메인별 vocab 유지 + adapter 매핑 | PR1 경험상 드리프트 재발. Adapter 매 개마다 매핑 작성 + 유지. Tech debt |
| 단일 enum + 모든 sub-state 제거 | `timed_out`, `applied` 같은 의미 있는 상태 손실. Observability 약화 |
| JSON sub-state 컬럼 | Typed 아니라 app-level validation 불가. ADR-0001 (String + validation) 정신에 반함 |

### Consequences

**긍정**:
- Cross-domain consumer가 매핑 없이 직접 status 읽기 가능
- 신규 도메인은 canonical 기반으로 시작 (drift 생기지 않음)
- PR2 Panel adapter 구현이 단순해짐 (매핑 테이블 불필요)

**부정·트레이드오프**:
- 일회성 backfill 비용 × 도메인 수 (3개, Phase 1/2/3 분산)
- Writer 변경 시 consumer도 함께 업데이트 (한 PR 안에서 원자성 보장)
- Sub-state 컬럼 2개 이상 늘어남 (`failureType`, `phase`)

**뒤따르는 제약**:
- 신규 도메인 추가 시 Rule 1~3 준수 의무. PR template에 "status 값이 canonical enum 부분집합인가?" 체크리스트 추가 권장
- Shared package에 sub-state typed union 선언 강제

### Related

- [ADR-0001](0001-no-pg-native-enum.md) — String + app validation (본 ADR의 Rule 3 기반)
- [ADR-0010](0010-panel-sse-frontend-exception.md) — Panel 도메인 (canonical enum의 첫 cross-domain consumer)
- PR1 post-merge 드리프트 발견 (commit `3ee73d0` PanelService snapshot 수정 커밋 메시지)
- [prisma/CLAUDE.md](../../../prisma/CLAUDE.md) — 스키마 네이밍 (snake_case @@map)
- PR1 plan v2: `docs/superpowers/plans/2026-04-15-panel-live-ops.md`

### 인덱스 업데이트

`.claude/docs/decisions/README.md` 인덱스 테이블 + By Domain 섹션에 0011 추가:
- 인덱스 row
- apps/server: 0011 추가
- apps/server/src/workflows: 0011 신설 (이전 없음)
- prisma: 0011 추가 (기존 0001, 0007 옆)

**Commit**: `docs(adr): ADR-0011 status canonical lifecycle`

---

## Task 2 — WorkflowRun Writer: `'completed'` → `'succeeded'`

**Files**: 
- Modify: `apps/server/src/workflows/services/workflow-runner.service.ts`

**Changes** (grep으로 확정된 라인):

1. **Line 141** (run status):
```typescript
// before
data: { status: 'completed', completedAt: new Date() },
// after
data: { status: 'succeeded', completedAt: new Date() },
```

2. **Line 201** (step JSON status):
```typescript
// before
stepEntry.status = 'completed';
// after
stepEntry.status = 'succeeded';
```

**Verification 지시**: 실제 라인 번호는 PR1 머지 후 이 plan 실행 시점에 드리프트할 수 있음. Implementer는 **literal `'completed'` 문자열 grep으로 위치 재확인 후 교체**.

**Related changes in same commit**:

테스트 업데이트 (grep 확정된 5 + 3 assertions):
- `workflow-flow.spec.ts` 라인 151, 153, 161, 233, 284 — `'completed'` → `'succeeded'`
- `panel.service.spec.ts` 라인 79, 92, 93 — `'completed'` → `'succeeded'`

**Run**:
```bash
cd apps/server && npx vitest run src/workflows/services/__tests__/workflow-flow.spec.ts src/panel/__tests__/panel.service.spec.ts
# 20/20 pass expected (15 + 5)
cd apps/server && npx tsc --noEmit
```

**Commit**: `refactor(workflows): write 'succeeded' not 'completed' for run + step status`

---

## Task 3 — Backfill (DB row + JSON step)

**Files**: Create `prisma/backfill-status-canonical-workflow.sql` (flat convention per prisma/CLAUDE.md — critic M2 해결)

**Content**:
```sql
-- ADR-0011 Phase 1: WorkflowRun status canonicalization
-- Pre-condition: Task 2 (writer change) already deployed.
-- Idempotent: running twice is no-op (only updates rows with 'completed').

BEGIN;

-- 1. Run-level status column
UPDATE workflow_runs 
  SET status = 'succeeded' 
  WHERE status = 'completed';

-- 2. Step JSON embedded status (critic M5)
UPDATE workflow_runs
SET steps = COALESCE(
  (SELECT jsonb_agg(
    CASE 
      WHEN step->>'status' = 'completed' 
        THEN jsonb_set(step, '{status}', '"succeeded"')
      ELSE step 
    END
  )
  FROM jsonb_array_elements(steps) AS step),
  steps
)
WHERE steps::text LIKE '%"completed"%';

-- 3. Sanity check — should print 0
SELECT 'run-level', COUNT(*) FROM workflow_runs WHERE status = 'completed'
UNION ALL SELECT 'step-json', COUNT(*) FROM workflow_runs WHERE steps::text LIKE '%"status":"completed"%';

COMMIT;
```

**Run command**:
```bash
docker exec -i kiditem-postgres psql -U kiditem kiditem < prisma/backfill-status-canonical-workflow.sql
```

**Expected output**: Sanity check 2 줄 모두 count=0.

**Rollback (critic C3) — 단, post-Phase 1 코드에서 새로 쓰인 `'succeeded'` row와 구분 불가능. 마이그레이션 완료 직후만 유효**:
```sql
-- DANGEROUS: only valid if NO new canonical 'succeeded' rows written since Phase 1 deploy.
-- Post-Phase 1 rollback requires re-running writer's OLD code + losing data since migration.
UPDATE workflow_runs SET status = 'completed' WHERE status = 'succeeded';
UPDATE workflow_runs SET steps = (... reverse jsonb_set ...) WHERE steps::text LIKE '%"status":"succeeded"%';
```

**Rollback invariant**: Rollback SQL 실행은 마이그레이션 직후 **새 code가 'succeeded'를 쓰기 전에만** 안전. 그 이후엔 롤백 대신 forward fix (코드에서 다시 'completed' 쓰는 롤백 PR) 사용.

**Commit**: `chore(db): backfill workflow_runs status 'completed' → 'succeeded' + JSON steps`

---

## Task 4 — Normalizer 삭제 (workflow-run-mapper)

**Files**:
- Modify: `apps/server/src/panel/adapters/workflow-run-mapper.ts` — `normalizeWorkflowStatus` export + 내부 호출 제거
- Modify: `apps/server/src/panel/panel.service.ts` — `normalizeWorkflowStatus` import + 호출 제거
- Modify: `apps/server/src/workflows/services/workflow-runner.service.ts` — `emitPanelUpsert` helper 내부에서 normalizer 호출 제거 (있으면)
- Modify: `apps/server/src/workflows/services/workflows.service.ts` — 동일

**Changes**:

`workflow-run-mapper.ts`:
```typescript
// BEFORE: exports normalizeWorkflowStatus helper
// AFTER: helper 제거. buildWorkflowPanelItem은 run.status 그대로 사용 (writer가 이미 canonical).
// 주석으로 이유 명시: "ADR-0011 이후 WorkflowRun.status는 canonical. 매핑 불필요."
```

`panel.service.ts` snapshot 메서드:
```typescript
// BEFORE
const steps = Array.isArray(run.steps) 
  ? run.steps.map(s => ({ status: normalizeWorkflowStatus(s?.status) }))
  : [];
// AFTER
const steps = Array.isArray(run.steps)
  ? (run.steps as Array<{ status?: string }>).map(s => ({ status: s?.status ?? 'pending' }))
  : [];
// run.status는 normalizeWorkflowStatus(run.status) → run.status 그대로
```

Workflows service의 `emitPanelUpsert` 내부도 동일 패턴 제거.

**Verification**:
```bash
cd apps/server && npx vitest run src/panel/__tests__/ src/workflows/services/__tests__/
# 모든 panel + workflow 테스트 pass
cd apps/server && npx tsc --noEmit
```

**Commit**: `refactor(panel): drop workflow status normalization (writer now canonical)`

---

## Task 5 — Frontend Reader 업데이트

**Files**:
- Modify: `apps/web/src/app/workflows/lib/workflow-types.ts` — 라인 21 `case 'completed':` → `case 'succeeded':`

**Changes** (grep으로 확정):
```typescript
// line 21 region
switch (status) {
  case 'succeeded':  // was 'completed'
    // ...
  case 'failed':
  // ...
}
```

**Verification**:
```bash
cd apps/web && npx tsc --noEmit
cd apps/web && npm run build
```

**Related tests**: 현재 이 파일의 unit test 없음. 빌드만 통과하면 됨. Smoke test는 Task 8 dev:server/dev:web 부트로.

**Commit**: `refactor(web/workflows): canonical 'succeeded' in status switch`

---

## Task 6 — Shared Zod 조이기

**Files**:
- Modify: `packages/shared/src/schemas/workflow.ts` — 라인 51 `status: z.string()` → `z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled'])`

**Changes**:
```typescript
// packages/shared/src/schemas/workflow.ts line 51
// BEFORE
status: z.string(),
// AFTER
status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled']),
```

**Verification**:
```bash
npm run build --workspace=@kiditem/shared
cd apps/server && npx tsc --noEmit   # uses shared types
cd apps/web && npx tsc --noEmit
```

**Potential break**: 서버/웹에서 `WorkflowRunSchema`를 사용하는 곳이 구 문자열로 mock/fixture 만들고 있었다면 tsc 에러. Implementer가 에러 추적해서 fixture 업데이트 (Task 2 테스트 업데이트로 대부분 커버되었어야 함). 새 에러 발견 시 같은 commit에 포함.

**Commit**: `refactor(shared): WorkflowRunSchema.status z.enum (canonical lifecycle)`

---

## Task 7 — Init.sql.gz 재생성 (critic M7 ordering 해결)

**When**: Task 2-6 전부 완료 후, Task 8 검증 전.

**Files**:
- Modify: `prisma/init.sql.gz` (regenerated)

**Commands**:
```bash
# Prereq: backfill 완료된 로컬 DB
docker exec kiditem-postgres pg_dump -U kiditem --data-only --column-inserts --no-owner --no-privileges kiditem | gzip > prisma/init.sql.gz
```

**Verification**:
```bash
# 재생성된 dump 안에 'completed' literal 없음 확인
gunzip -c prisma/init.sql.gz | grep -c "'completed'"
# expected: 0 (또는 workflow와 무관한 다른 테이블의 'completed'만 남아있음)
gunzip -c prisma/init.sql.gz | grep "workflow_run" | grep -c "completed"
# expected: 0
```

**Commit**: `chore(db): regenerate init.sql.gz after canonical workflow backfill`

---

## Task 8 — 전체 검증

**Steps**:

1. **tsc 전수**:
```bash
cd apps/server && npx tsc --noEmit
cd apps/web && npx tsc --noEmit
cd packages/shared && npx tsc --noEmit || npm run build --workspace=@kiditem/shared
```

2. **테스트 전수** (루트 vitest):
```bash
npx vitest run
# 112+ tests pass expected (PR1 baseline + 어느 쪽 테스트도 실패하지 않아야)
```

3. **빌드**:
```bash
npm run build --workspace=apps/server
npm run build --workspace=apps/web
```

4. **dev:server 부트** (NestJS DI 검증 — memory `feedback_nestjs_di_verification`):
```bash
cd apps/server && timeout 30 npm run start:dev 2>&1 | head -80
# "Nest application successfully started" + PanelModule + WorkflowModule 에러 없음
```

5. **DB sanity**:
```bash
docker exec kiditem-postgres psql -U kiditem -c \
  "SELECT status, COUNT(*) FROM workflow_runs GROUP BY status;
   SELECT COUNT(*) FROM workflow_runs WHERE steps::text LIKE '%\"completed\"%';" kiditem
# 전자: 'completed' 없어야 함
# 후자: 0
```

**Commit**: 별도 없음 (검증만). 실패 시 이전 task 커밋 수정.

---

## Task 9 — PR 생성

**Branch**: `refactor/status-canonical-workflow`

**PR title**: `refactor(workflows): canonicalize WorkflowRun status (ADR-0011 Phase 1)`

**PR body** (템플릿 기반):

```markdown
## 변경 요약

ADR-0011 Phase 1. WorkflowRun의 status 어휘를 shared Panel canonical enum으로 정렬.
- `'completed'` → `'succeeded'` (run level + step JSON level)
- workflow-run-mapper의 normalizeWorkflowStatus 우회 코드 삭제
- shared WorkflowRunSchema.status를 z.enum으로 조이기
- Phase 2 (HeartbeatRun), Phase 3 (ThumbnailGeneration)는 별도 PR

## DB 변경
- [x] `prisma/schema.prisma` 변경 **없음** — 컬럼 추가 없음, 기존 String 컬럼의 값만 backfill
- [x] backfill SQL 있음 → `prisma/backfill-status-canonical-workflow.sql`
- [x] `prisma/init.sql.gz` 갱신함

## 테스트
- [x] `npx vitest run` 통과 (112+ tests)
- [x] `npm run build -w apps/server` + `apps/web` 빌드 성공
- [x] `npm run dev:server` 부트 확인

## 아키텍처 결정
- [x] ADR 신규 발행 → `.claude/docs/decisions/0011-status-canonical-lifecycle.md`

## Post-pull instructions (for teammates)

이 PR 머지 후 로컬 동기화 시:
```bash
git pull
npm run build -w packages/shared
docker exec -i kiditem-postgres psql -U kiditem kiditem < prisma/backfill-status-canonical-workflow.sql
# 또는 init.sql.gz 재로드 (destructive) — kiditem-sync skill
```

backfill 스킵 시 Panel UI에서 완료된 workflow가 계속 "pending"으로 표시됩니다.
```

**After merge**: kiditem-sync skill로 팀원 동기화 가이드.

---

## Self-Review

### Critic v1 findings 대응
| # | v1 이슈 | v2 해결 |
|---|---|---|
| C1 | File path fiction (heartbeat/services 없음) | Phase 2로 연기. Phase 1은 grep 확정된 workflow 라인만 사용 |
| C2 | Atomicity window | Task 2 (writer) → Task 3 (backfill) 순서 엄수. writer 먼저 |
| C3 | Rollback non-idempotent | Task 3에 rollback invariant 문서화 + deadline 명시 |
| C4 | agent_tasks drift 누락 | Non-goals에 명시적으로 Phase 2 deferral |
| C5 | Raw SQL 'timed_out' 누락 | Non-goals Phase 2 (WorkflowRun raw SQL은 scope 내 없음) |

### Planner v1 findings 대응
| # | v1 이슈 | v2 해결 |
|---|---|---|
| 1 | Task 9 unbounded consumer scope | Pre-flight로 6 파일 확정. Task 5 단독으로 충분 |
| 2 | phase typed union 누락 | Phase 1 scope엔 새 컬럼 없음. ADR Rule 3으로 Phase 2/3 대비 법제화 |
| 3 | Regression guard 없음 | Task 8 DB sanity check로 1회 검증. ESLint rule은 Phase 3 완료 후 별도 task |
| 5 | ADR prescriptive 부족 | v2 ADR은 5 Rule로 prescriptive + Phase 2/3 계획 명시 |
| 6 | init.sql.gz 타이밍 | Task 7에서 Task 6 이후로 순서 고정 |
| 7 | Task 9 split | Phase 1 scope이 작아 split 불필요 |
| 8 | Single PR vs multi | 이미 phased — Phase 1 단독 PR |
| 9 | Tests hand-wavy | Task 2에서 8 assertions 파일+라인 명시 |

### Spec coverage
- 실버그 (WorkflowRun 드리프트) 완전 제거: Task 2 + 3
- 향후 드리프트 차단 (shared Zod enum): Task 6
- 향후 도메인 규칙 법제화 (ADR prescriptive): Task 1
- Phase 2/3 scope 명시: Non-goals

### Placeholder scan
- 라인 번호들: grep으로 확정 (PR1 머지 후 시점). Task 2 verification note에서 "실행 시점 재확인" 안내.
- Rollback SQL의 `(... reverse jsonb_set ...)` 한 곳: 필요할 때 detail. Phase 1 실행 시엔 필요 없음.

### Type consistency
- `succeeded` 문자열: canonical enum 값. shared Zod enum 정의와 일치.
- `@kiditem/shared` Panel + Workflow schemas 같은 canonical 공유.

---

## Execution Handoff

이 plan은 **subagent-driven-development** 로 실행. Task 1~8을 순차, 각 task 당 implementer → spec reviewer → code quality reviewer (graphify rules injection 포함) 2단계 리뷰.

Phase 2/3는 별도 세션에서 각자의 plan + 리뷰로 진행.
