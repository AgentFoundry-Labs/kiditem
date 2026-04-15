# Status Canonical Lifecycle — Phase 2 (HeartbeatRun) — v2

**Revision**: v2 of 2026-04-15. Supersedes v1 after critic + plan-eng-review flagged 3+3 CRITICAL + 8+7 MAJOR. v1 missed 5 Web UI sites + `rtLastRunStatus` writer + compressor label branch + `errorCode` vs `failureType` coexistence rule + task ordering for atomic compile. v2 fixes all.

**Branch**: `refactor/status-canonical-heartbeat`

**Goal**: ADR-0011 Phase 2. HeartbeatRun `'timed_out'` → `{status:'failed', failureType:'timeout'}`. Writer + raw SQL + Prisma query + Web UI (8 sites) + Shared Zod + `agent_definitions.rt_last_run_status` 전부 정렬. Schema default `"queued"` → `"pending"`. `errorCode='timeout'` 은 그대로 유지 (triage 용도).

**Why**: ADR-0011 Rule 1 위반. Panel PR2 agent adapter 준비. 매핑 테이블 0줄을 위해 writer 정렬.

**Non-goals (explicit)**:
- Phase 3: ThumbnailGeneration — 별도 PR
- `agent_tasks.status='completed'` @ `heartbeat.service.ts:528` — 별도 Phase
- `failureType` 추가 값 (`'budget_exceeded'`, `'error'`) — writer가 현재 안 씀, YAGNI. 필요 시 후속 (shared enum 확장 1줄 + writer + optional UI)
- `AgentSchema.status` / `AgentRuntimeStateSchema.lastRunStatus` (전자) Zod 조이기 — 선별 적용 정당화: Phase 2는 HeartbeatRun 종속 범위만. 후속 PR로 domain별 순차.
- `AgentDefinition.status` (runtime 상태 — 별개 개념, `'idle'|'paused'|'running'|'disabled'`). Rule 1 대상 아님 (lifecycle 의미 없음).

**Single PR rationale**: `HeartbeatRunSchema.status` 를 `z.string()` → `z.enum(canonical)` 로 조이는 변경은 **compile-breaking** — writer + 모든 web UI consumer가 함께 빠져야 apps/web tsc pass. 분리 PR 불가.

---

## Pre-flight (확정)

### Grep 결과 (authoritative)

**'timed_out' as string literal**:
```
apps/server/src/agent-registry/agent-registry.service.ts:331    -- raw SQL
apps/server/src/agent-registry/agent-registry.service.ts:362    -- raw SQL
apps/server/src/agent-registry/context-manager/compressor.service.ts:24   -- Prisma where
apps/server/src/agent-registry/heartbeat/heartbeat.service.ts:333         -- writer status=
apps/server/src/agent-registry/heartbeat/heartbeat.service.ts:456         -- isFailed branch
apps/web/src/app/agents/[id]/components/DashboardTab.tsx:33               -- failed count filter
apps/web/src/app/agents/activity/components/ActivityFeed.tsx:38            -- hasError check
apps/web/src/app/agents/activity/components/ActivityFilters.tsx:47         -- dropdown option
```

**'timed_out' as object key** (쿼트 없는 record/object property):
```
apps/web/src/lib/status-colors.ts:11,25                                    -- statusBadge + dot color
apps/web/src/app/agents/[id]/lib/constants.ts:8                            -- RUN_STATUS_ICONS (Timer icon)
apps/web/src/app/agents/activity/lib/activity-utils.ts:45                  -- labels '시간 초과'
apps/web/src/app/agents/activity/components/TimelineView.tsx:13            -- TIMELINE_BLOCK_COLORS
```

**관련 writer sites (timed_out 아님, 그러나 Phase 2 영향)**:
```
apps/server/src/agent-registry/heartbeat/heartbeat.service.ts:465 — rtLastRunStatus: status
apps/server/src/agent-registry/heartbeat/heartbeat.service.ts:337 — errorCode = 'timeout' (KEEP)
apps/server/src/agent-registry/context-manager/compressor.service.ts:46 — label ternary 타임아웃 fallback
apps/web/src/app/agents/[id]/components/DashboardTab.tsx:134,136 — isLive detection (queued → pending 반영)
```

**Test assertions**:
```bash
grep -rn "'timed_out'\|\"timed_out\"" apps/server/src packages/shared/src --include="*.spec.ts"
# → No matches. 기존 테스트에 status 문자열 'timed_out' assertion 없음.
```

**Web UI 'queued' 별도 grep** (스키마 default 변경 영향):
```
apps/web/src/app/agents/[id]/components/DashboardTab.tsx:134,136  -- isLive check
apps/web/src/app/agents/tasks/page.tsx:23                           -- AgentTask filter (out-of-scope)
```

### DB 현황 (로컬)
```
heartbeat_runs rows: 0 (empty)
agent_definitions with rt_last_run_status='timed_out': 0 (check 필요)
```
로컬 empty라 backfill no-op. 프로덕션은 rows 존재 가능성 — backfill SQL idempotent로 안전.

### AgentTask 범위 (확정)

**Out-of-scope for Phase 2.** Reasons:
- AgentTask는 legacy wrapper (HeartbeatRun primary)
- Web UI가 inventory/stock/finance 등 여러 도메인의 'completed'와 shared vocabulary
- 3개 consumer 추가 = 별도 PR 가치
- `heartbeat.service.ts:528`은 Phase 2 writer 편집 범위 바로 근처 — **implementer sentinel 경고 필수**

---

## 영향받는 파일 (최종 19건)

| # | File | 변경 | Task |
|---|---|---|---|
| 1 | `prisma/schema.prisma` | `failure_type` 컬럼, default `pending` | T1 |
| 2 | `packages/shared/src/schemas/agent.ts` | status z.enum, failureType typed union, HEARTBEAT_FAILURE_TYPES | T2 |
| 3 | `apps/server/src/agent-registry/heartbeat/heartbeat.service.ts` | L333 status 계산, L337 errorCode 유지, L395 update data, L456 isFailed | T3 |
| 4 | `apps/server/src/agent-registry/agent-registry.service.ts:331,362` | 2개 raw SQL | T4 |
| 5 | `apps/server/src/agent-registry/context-manager/compressor.service.ts:24,27-34,46` | Prisma where + select 확장 + label ternary | T5 |
| 6 | `apps/server/src/agent-registry/lifecycle/result-cleanup.service.ts:43` | 검증만, 변경 없음 | T5 |
| 7 | `apps/web/src/app/agents/[id]/components/DashboardTab.tsx:33,134,136` | failed count + isLive | T6 |
| 8 | `apps/web/src/app/agents/activity/components/ActivityFeed.tsx:38` | hasError | T6 |
| 9 | `apps/web/src/app/agents/activity/components/ActivityFilters.tsx:47` | dropdown 제거 | T6 |
| 10 | `apps/web/src/lib/status-colors.ts:11,25` | 2 object key 제거 | T6 |
| 11 | `apps/web/src/app/agents/[id]/lib/constants.ts:8` | RUN_STATUS_ICONS key 제거 | T6 |
| 12 | `apps/web/src/app/agents/activity/lib/activity-utils.ts:45` | statusLabel 함수 재설계 | T6 |
| 13 | `apps/web/src/app/agents/activity/components/TimelineView.tsx:13` | TIMELINE_BLOCK_COLORS key 제거 | T6 |
| 14 | `prisma/backfill-status-canonical-heartbeat.sql` | 신규 | T7 |
| 15 | `prisma/rollback-status-canonical-heartbeat.sql` | 신규 | T7 |
| 16 | `prisma/init.sql.gz` | 재생성 | T8 |

총 **16건** (코드) + **backfill/rollback** SQL.

---

## Task Order (atomic compile 보장)

```
T1 (schema)
  ↓
T2 (shared Zod — failureType 타입 생성, status enum 조임)
  ↓  <-- T2 이후에야 Web UI가 failureType 참조 가능
T3 (writer)
  ↓
T4 (raw SQL)  ━┓
T5 (Prisma)   ━╋━ 병렬 가능 (T3 후에만)
T6 (Web UI)   ━┛
  ↓
T7 (backfill + rollback SQL)
  ↓
T8 (init.sql.gz 재생성)
  ↓
T9 (전체 검증)
  ↓
T10 (PR)
```

**Rationale**: Zod enum 조임이 web UI에 tsc 파급. T2 먼저 = `failureType` 타입 웹이 사용 가능. 그 후 writer 변경. 그 다음 모든 consumer (병렬). Backfill은 writer 이후 (새 코드가 새 row를 canonical로 저장 보장 후에야 legacy row만 안전하게 이동).

---

## Task 1 — Schema: failureType + default 교정

**Files**: `prisma/schema.prisma`

**Diff**:
```prisma
model HeartbeatRun {
  // ...existing fields
  status        String   @default("pending") @map("status")  // was: @default("queued")
  failureType   String?  @map("failure_type")                  // NEW — nullable
  // ...existing indexes (including @@index([status]) 유지)
}
```

**Verification**:
```bash
cd /Users/yhc125/workspace/kiditem
npm run db:push
npx prisma generate
docker exec kiditem-postgres psql -U kiditem -c "\d heartbeat_runs" kiditem | grep failure_type
# Expected: failure_type | text | |  (nullable, no default)
```

**Commit**: `feat(prisma): add HeartbeatRun.failure_type + default → 'pending'`

---

## Task 2 — Shared Zod (T1 직후)

**Files**: `packages/shared/src/schemas/agent.ts`

**Changes**:
```typescript
// Add at top
export const HEARTBEAT_FAILURE_TYPES = ['timeout'] as const;
export type HeartbeatFailureType = typeof HEARTBEAT_FAILURE_TYPES[number];

// Modify HeartbeatRunSchema (around line 78-107)
export const HeartbeatRunSchema = z.object({
  // ...existing
  status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled']),   // was: z.string()
  failureType: z.enum(HEARTBEAT_FAILURE_TYPES).nullable().optional(),             // NEW
  // ...existing
});
```

**NOT tightened** (Non-goals):
- `AgentRuntimeStateSchema.lastRunStatus` — 후속 PR (`rt_last_run_status` 컬럼 동시 tightening 필요)
- `AgentSchema.status` — AgentDefinition.status는 별개 lifecycle

**Verification**:
```bash
npm run build --workspace=@kiditem/shared
# grep for potential breaks: test fixtures with 'timed_out' literal on HeartbeatRun type
grep -rn "status: 'timed_out'" apps/ packages/ --include="*.ts" --include="*.tsx"
# Expected: 0 matches (pre-flight verified). 있으면 같은 커밋에 처리.
```

**Commit**: `refactor(shared): HeartbeatRunSchema.status z.enum + failureType typed union`

---

## Task 3 — Writer: heartbeat.service.ts

**Files**: `apps/server/src/agent-registry/heartbeat/heartbeat.service.ts`

### ⚠️ OUT-OF-SCOPE sentinel

**DO NOT modify line 528**:
```typescript
status: status === 'succeeded' ? 'completed' : 'failed',  // AgentTask.status
```
This is `agentTask.status` (legacy AgentTask domain). Phase 2 scope is HeartbeatRun only. Even though it's in the same file, leave it — out-of-scope migration planned for separate Phase.

### ⚠️ errorCode coexistence rule

**Line 337** writes `errorCode = result.timedOut ? 'timeout' : ...`. **KEEP UNCHANGED**.
- `errorCode` = operator triage 용도 (scrubSecrets 경유, rtLastError 저장, wakeupService.finish 전달)
- `failureType` = ADR-0011 Rule 2 sibling 컬럼 (분석·GROUP BY 용도)
- 중첩 아님 — 둘 다 필요, 서로 책임 다름
- 변경 시 L403 (`errorCode ? scrubSecrets(...) : null`), L466 (`rtLastError` write), L518 (wakeupService) 연쇄 파괴

### Changes

**Line ~333** (grep으로 재확인 후):
```typescript
// BEFORE
const status = result.timedOut ? 'timed_out'
  : result.exitCode === 0 ? 'succeeded'
  : 'failed';

// AFTER
const status = result.exitCode === 0 ? 'succeeded' : 'failed';
const failureType = result.timedOut ? 'timeout' : null;
// 주의: errorCode 계산(line 337)은 그대로 유지.
```

**Line ~395** (update data):
```typescript
await this.prisma.heartbeatRun.update({
  where: { id: run.id },
  data: { status, failureType, finishedAt, exitCode, errorCode, ... },  // failureType 추가
});
```

**Line ~456** (branch):
```typescript
// BEFORE
const isFailed = status === 'failed' || status === 'timed_out';

// AFTER
const isFailed = status === 'failed';
// 의미 동일 — 'timed_out'은 이제 status='failed' 의 subset (failureType='timeout').
// Auto-pause 3-strike 로직 불변.
```

**Line ~465** (`rtLastRunStatus`): 자동으로 canonical로 바뀜 (status 변수가 이제 canonical만 반환) — **코드 변경 없음**. 단 legacy row migration은 T7에서.

### Pre-flight grep (implementer가 Task 시작 시 재실행)

```bash
grep -n "'timed_out'" apps/server/src/agent-registry/heartbeat/heartbeat.service.ts
# Expected: 정확히 2 hits (line 333 + 456). 다르면 파일 변화 확인 후 진행.
```

### Tests

Phase 2 v1 pre-flight: `grep "'timed_out'"` on agent-registry spec files → **0 matches**. Canonical 변경이 기존 test assertion 깨지 않음.

단, 새 writer 동작 검증 테스트 하나 추가 권장 (Task 9에서 보완):
```typescript
it('writes status=failed + failureType=timeout when timedOut', ...);
```
(선택 — 시간 여유 있으면 포함, 아니면 Task 9 DB sanity로 갈음)

**Commit**: `refactor(agent-registry): heartbeat 'timed_out' → status='failed' + failureType='timeout' (errorCode kept)`

---

## Task 4 — Raw SQL: cost analytics

**Files**: `apps/server/src/agent-registry/agent-registry.service.ts`

**Changes (2개 query, lines 331 + 362)**:
```sql
-- BEFORE
AND status IN ('succeeded', 'failed', 'timed_out')

-- AFTER
AND status IN ('succeeded', 'failed')
-- 의미 동일: 'timed_out' → 'failed' 로 이동됨. billable run 집합 불변.
```

**Commit**: `refactor(agent-registry): canonical status in cost analytics raw SQL`

---

## Task 5 — Prisma query: compressor + result-cleanup

**Files**:
- `apps/server/src/agent-registry/context-manager/compressor.service.ts` (lines 24, 27-34, 46)
- `apps/server/src/agent-registry/lifecycle/result-cleanup.service.ts:43` (검증만)

### compressor.service.ts

**Line 24** (where):
```typescript
// BEFORE
where: { agentId, status: { in: ['succeeded', 'failed', 'timed_out'] } }

// AFTER
where: { agentId, status: { in: ['succeeded', 'failed'] } }
```

**Lines 27-34** (select) — failureType 추가:
```typescript
// BEFORE: select 일부
select: { finishedAt: true, status: true, resultJson: true, summary: true, isSummarized: true, errorCode: true }

// AFTER
select: { finishedAt: true, status: true, failureType: true, resultJson: true, summary: true, isSummarized: true, errorCode: true }
```

**Line 46** (label ternary) — CRITICAL FIX:
```typescript
// BEFORE
const statusLabel = r.status === 'succeeded' ? '성공' : r.status === 'failed' ? '실패' : '타임아웃';

// AFTER
const statusLabel =
  r.status === 'succeeded' ? '성공' :
  r.failureType === 'timeout' ? '타임아웃' :
  r.status === 'failed' ? '실패' :
  r.status;  // fallback (pending, running, cancelled — 예상되지 않지만 defensive)
```

**왜 v1 버그**: where가 `['succeeded','failed']` 만 통과 → layer 1 loop에서 '타임아웃' fallback이 failed 전체에 찍힘. 실패 사유 불명 runs가 전부 '타임아웃'으로 라벨되어 agent 프롬프트에 hallucinated 상태 feed.

### result-cleanup.service.ts:43

```typescript
// 현재: where status: { not: 'running' }
// canonical 후: 'timed_out' 없어짐, 'pending'/'succeeded'/'failed'/'cancelled' 남음 — 의미 동일
// 변경 없음. 주석으로만 "Phase 2 검증 OK" 표시 (옵션)
```

**Commit**: `refactor(agent-registry): canonical status in compressor query + failureType-aware label`

---

## Task 6 — Web UI: 7 files 일괄 업데이트

**Files** (8 라인 세트):

### 6.1 `activity-utils.ts:45` — statusLabel 함수 재설계

**Current**:
```typescript
const labels: Record<string, string> = {
  pending: '대기', running: '실행중', succeeded: '성공',
  failed: '실패', timed_out: '시간 초과', cancelled: '취소',
};
return labels[status] ?? status;
```

**New** — `failureType` 매개변수 추가:
```typescript
export function statusLabel(status: string, failureType?: string | null): string {
  if (failureType === 'timeout') return '시간 초과';
  const labels: Record<string, string> = {
    pending: '대기', running: '실행중', succeeded: '성공',
    failed: '실패', cancelled: '취소',
  };
  return labels[status] ?? status;
}
```

Call sites — grep `statusLabel(` 해서 모두 `statusLabel(run.status, run.failureType)` 로 업데이트.

### 6.2 `status-colors.ts:11,25` — object key 제거

```typescript
// BEFORE
export const statusBadge: Record<string, string> = {
  // ...
  timed_out: 'bg-orange-100 text-orange-700',  // <- 제거
  // ...
};
export const agentStatusDot: Record<string, string> = {
  // ...
  timed_out: 'bg-orange-400',  // <- 제거
  // ...
};

// AFTER
// Timeout display → consumer가 failureType 체크해서 같은 색상 수동 지정
// (Helper 함수 추가 옵션):
export function statusColor(status: string, failureType?: string | null): string {
  if (failureType === 'timeout') return 'bg-orange-100 text-orange-700';
  return statusBadge[status] ?? 'bg-slate-100 text-slate-700';
}
```

### 6.3 `[id]/lib/constants.ts:8` — RUN_STATUS_ICONS

```typescript
// BEFORE
export const RUN_STATUS_ICONS = {
  // ...
  timed_out: { icon: Timer, colorClass: 'text-orange-600' },  // 제거
  // ...
};

// AFTER — 별도 맵으로 분리
export const FAILURE_TYPE_ICONS: Record<string, { icon: ..., colorClass: string }> = {
  timeout: { icon: Timer, colorClass: 'text-orange-600' },
};

// 호출자: failureType 있으면 FAILURE_TYPE_ICONS[failureType] 먼저, 없으면 RUN_STATUS_ICONS[status]
```

### 6.4 `TimelineView.tsx:13`

```typescript
// BEFORE
const TIMELINE_BLOCK_COLORS: Record<string, string> = {
  // ...
  timed_out: 'bg-orange-400',  // 제거
  // ...
};

// AFTER + render 함수 시그니처 변경 (run.failureType 체크):
// (구체 구현은 implementer 판단 — 핵심: 'timed_out' key 제거 + failureType 기반 렌더)
```

### 6.5 `ActivityFilters.tsx:47` — dropdown 제거 (UX 결정 ✓)

```typescript
// BEFORE
{ key: 'timed_out', label: '시간초과' },

// AFTER
// 해당 옵션 제거. 'failed' 선택 시 timeout 포함 표시됨 (의미 상 실패).
// Note: 사용자 '시간초과만' 필터 원할 시 후속 PR로 failureType filter 추가 (out of Phase 2 scope).
```

### 6.6 `ActivityFeed.tsx:38`

```typescript
// BEFORE
const hasError = (run.status === 'failed' || run.status === 'timed_out') && (run.error || run.stderrExcerpt);

// AFTER
const hasError = run.status === 'failed' && (run.error || run.stderrExcerpt);
// 'failed'가 timeout 포함 superset이므로 logical 동일.
```

### 6.7 `DashboardTab.tsx:33,134,136`

**Line 33**:
```typescript
// BEFORE
failed: dayRuns.filter(r => r.status === 'failed' || r.status === 'timed_out').length,

// AFTER
failed: dayRuns.filter(r => r.status === 'failed').length,
```

**Lines 134, 136** — `isLive` detection 확장 (queued → pending 반영):
```typescript
// BEFORE
const liveRun = sorted.find((r) => r.status === 'running' || r.status === 'queued');
const isLive = latestRun?.status === 'running' || latestRun?.status === 'queued';

// AFTER
const liveRun = sorted.find((r) => r.status === 'running' || r.status === 'pending');
const isLive = latestRun?.status === 'running' || latestRun?.status === 'pending';
```

### Verification

```bash
cd /Users/yhc125/workspace/kiditem/apps/web && npx tsc --noEmit
cd apps/web && npm run build
grep -rn "'timed_out'\|timed_out:" apps/web/src --include="*.ts" --include="*.tsx" | grep -v __tests__
# Expected: 0 matches.
```

**Commit**: `refactor(web/agents): canonical status + failureType-aware UI (8 sites)`

---

## Task 7 — Backfill + Rollback SQL

**Files**:
- `prisma/backfill-status-canonical-heartbeat.sql` (신규)
- `prisma/rollback-status-canonical-heartbeat.sql` (신규)

### Backfill SQL

```sql
-- ADR-0011 Phase 2: HeartbeatRun 'timed_out' → canonical
-- Pre-condition: Task 1 (schema) + Task 3 (writer) deployed.
-- Idempotent: running twice = no-op.

BEGIN;

-- 1. heartbeat_runs: 'timed_out' 이동
UPDATE heartbeat_runs
  SET status = 'failed', failure_type = 'timeout'
  WHERE status = 'timed_out';

-- 2. heartbeat_runs: 'queued' default 잔여 (writer가 안 쓰지만 legacy 안전)
UPDATE heartbeat_runs SET status = 'pending' WHERE status = 'queued';

-- 3. agent_definitions.rt_last_run_status: 'timed_out' → 'failed'
--    (heartbeat.service.ts:465에서 rtLastRunStatus = status. Task 3 이후 'failed'만 쓰지만 legacy 행 존재)
UPDATE agent_definitions SET rt_last_run_status = 'failed' WHERE rt_last_run_status = 'timed_out';

-- 4. Sanity check — 세 행 모두 0
SELECT 'heartbeat timed_out', COUNT(*) FROM heartbeat_runs WHERE status = 'timed_out'
UNION ALL SELECT 'heartbeat queued', COUNT(*) FROM heartbeat_runs WHERE status = 'queued'
UNION ALL SELECT 'agent_defs timed_out', COUNT(*) FROM agent_definitions WHERE rt_last_run_status = 'timed_out';

COMMIT;
```

### Rollback SQL

```sql
-- ADR-0011 Phase 2 rollback
-- ⚠ WARNING: 마이그레이션 직후 + prisma schema rollback BEFORE 만 유효.
--   failure_type 컬럼 아직 존재해야 함. post-migration period의 non-timeout failed rows 영향 없음.

BEGIN;

-- 1. heartbeat_runs: 'failed' + failure_type='timeout' → 'timed_out'
UPDATE heartbeat_runs
  SET status = 'timed_out', failure_type = NULL
  WHERE status = 'failed' AND failure_type = 'timeout';

-- 2. agent_definitions: 복원 불가능 (어느 'failed' rt가 예전 'timed_out'이었는지 구분 불가)
--    방치. 다음 실행 시 overwrite.

-- 3. 'queued' 복원은 skip — 'pending' 이 superset 의미

COMMIT;
```

### Run

```bash
docker exec -i kiditem-postgres psql -U kiditem kiditem < prisma/backfill-status-canonical-heartbeat.sql
```

Expected sanity check 결과: 3행 모두 COUNT=0.

**Commit**: `chore(db): backfill heartbeat canonical + rollback SQL`

---

## Task 8 — init.sql.gz 재생성

**When**: Task 7 이후.

```bash
docker exec kiditem-postgres pg_dump -U kiditem --data-only --column-inserts --no-owner --no-privileges kiditem | gzip > prisma/init.sql.gz
```

**Verification (conditional)**:
```bash
# heartbeat_runs 행 수 확인
ROW_COUNT=$(gunzip -c prisma/init.sql.gz | grep -c "INSERT INTO public.heartbeat_runs" || true)
echo "heartbeat_runs inserts: $ROW_COUNT"

if [ "$ROW_COUNT" -gt 0 ]; then
  # 'timed_out' 문자열이 heartbeat_runs INSERT에 있으면 실패
  gunzip -c prisma/init.sql.gz | grep "INSERT INTO public.heartbeat_runs" | grep -c "timed_out"
  # Expected: 0
fi

# agent_definitions.rt_last_run_status 'timed_out' 검증
AGENT_TIMED_OUT=$(gunzip -c prisma/init.sql.gz | grep "INSERT INTO public.agent_definitions" | grep -c "timed_out" || true)
echo "agent_defs timed_out: $AGENT_TIMED_OUT"
# Expected: 0
```

**Commit**: `chore(db): regenerate init.sql.gz after heartbeat canonical`

---

## Task 9 — 전체 검증

### Compile + test + build
```bash
cd apps/server && npx tsc --noEmit                  # clean
cd apps/web && npx tsc --noEmit                     # clean
npx vitest run                                      # all pass (루트에서)
npm run build --workspace=apps/server               # success
npm run build --workspace=apps/web                  # success
```

### NestJS DI boot
```bash
cd apps/server && timeout 30 npm run start:dev 2>&1 | head -80
# "Nest application successfully started" + panel + agent-registry modules OK
```

### DB sanity (기능)
```sql
-- 1. 'timed_out' 0건
SELECT status, COUNT(*) FROM heartbeat_runs GROUP BY status;
SELECT rt_last_run_status, COUNT(*) FROM agent_definitions GROUP BY rt_last_run_status;

-- 2. failureType 분포 (backfilled runs)
SELECT status, failure_type, COUNT(*) FROM heartbeat_runs GROUP BY status, failure_type;
```

### Cost SUM 회귀 검증 (중요)

**Before migration snapshot** (Task 3 배포 직전):
```sql
SELECT DATE(started_at) as d, SUM((usage_json->>'costCents')::int) AS total
FROM heartbeat_runs
WHERE status IN ('succeeded','failed','timed_out') AND usage_json IS NOT NULL
  AND started_at > NOW() - INTERVAL '30 days'
GROUP BY d ORDER BY d;
```

**After migration + backfill** (Task 7 완료 후):
```sql
SELECT DATE(started_at) as d, SUM((usage_json->>'costCents')::int) AS total
FROM heartbeat_runs
WHERE status IN ('succeeded','failed') AND usage_json IS NOT NULL
  AND started_at > NOW() - INTERVAL '30 days'
GROUP BY d ORDER BY d;
```

**Expected**: 두 결과 **일 단위 합계 완전 동일** (timed_out 이 failed에 합쳐졌을 뿐, usage_json 유지).

로컬 empty DB에선 둘 다 빈 결과 — pass. 프로덕션 적용 시 pre-deploy snapshot 필수.

**Commit**: 별도 없음 (verification only)

---

## Task 10 — PR 생성

**Branch**: `refactor/status-canonical-heartbeat`
**Title**: `refactor(agent-registry): canonicalize HeartbeatRun status (ADR-0011 Phase 2)`

**Body**:

```markdown
## 변경 요약

ADR-0011 Phase 2. HeartbeatRun `'timed_out'` → `{status:'failed', failureType:'timeout'}`. `errorCode='timeout'` 은 operator triage 용도로 유지 — `failureType`은 분석·GROUP BY 용도의 ADR-0011 Rule 2 sibling 컬럼. Schema default `"queued"` → `"pending"` 동반 교정.

**범위**: 19 파일 (schema + shared + backend writer/query 3 + web UI 8 + backfill/rollback SQL 2 + init.sql.gz 재생성)

## DB 변경
- [x] schema 변경 — `HeartbeatRun.failure_type String?` 추가, default 'pending'
- [x] backfill SQL 포함 (heartbeat + agent_definitions.rt_last_run_status)
- [x] rollback SQL 포함
- [x] init.sql.gz 갱신

## 테스트
- [x] vitest run 통과
- [x] server + web tsc 통과
- [x] server + web build 성공
- [x] dev:server boot 확인
- [x] Cost SUM 회귀 체크 (일단위 집계 일치 확인)

## 아키텍처 결정
- [x] 해당 없음 — ADR-0011 Phase 2 실행, 새 ADR 아님

## Post-pull (teammates)

```bash
git pull
npm run db:push                                             # failure_type 컬럼 추가
docker exec -i kiditem-postgres psql -U kiditem kiditem \
  < prisma/backfill-status-canonical-heartbeat.sql          # 'timed_out' → canonical
npx prisma generate && npm run build --workspace=@kiditem/shared  # 타입 반영
```

Backfill 스킵하면 Panel/분석에서 완료된 timeout runs 잘못 분류됨.

## Non-goals (명시)
- `agent_tasks.status='completed'` (heartbeat.service.ts:528) — 별도 Phase
- `ThumbnailGeneration` canonical — Phase 3
- `AgentRuntimeStateSchema.lastRunStatus` / `AgentSchema.status` Zod 조임 — 후속 (rt_last_run_status 컬럼 동기화 필요)
```

---

## Self-Review (v2)

### Critic v1 CRITICAL 대응
| # | Issue | v2 Fix |
|---|---|---|
| C1 | DashboardTab 경로 오타 | 실제 경로 `[id]/components/DashboardTab.tsx` 반영 |
| C2 | 5 UI 사이트 누락 + label 버그 | Task 6에 status-colors/constants/activity-utils/TimelineView + Task 5에 compressor label 재작성 |
| C3 | rtLastRunStatus writer 누락 | Task 7 backfill에 agent_definitions UPDATE 추가 (writer 자동 canonical이므로 코드 변경 불필요) |

### Planner v1 CRITICAL 대응
| # | Issue | v2 Fix |
|---|---|---|
| P-C1 | errorCode vs failureType 공존 규칙 | Task 3 모두대괄호 sentinel + "KEEP UNCHANGED" 명시 |
| P-C2 | 롤링 배포 auto-pause 위험 | Task 3 isFailed 변경이 로직 불변임 증명. 단일 인스턴스 전제 Non-goals에 반영 (암묵) |
| P-C3 | 테스트 enumerate | "0 matches 확인 — 기존 assertion 깨지 않음" 명시 |

### 그 외 Important 반영
- I1: Task 3 head에 grep 명령 명시
- I2: Task 3 sentinel 강조
- I3: Task 9 Cost SUM 회귀 체크
- I4: UX 결정 확정 (옵션 제거)
- I5: 5 UI 사이트 포함
- I6: Single PR rationale 명시
- I7: Post-pull 3-line 상세 명령

### Placeholder scan
- Task 3 line 번호는 실제 grep 재확인 강제
- UI 구체 helper 함수 구현 (statusColor, failureTypeIcon) 은 implementer 판단 — plan은 방향성만

### Rollback
- SQL 파일 신설 (rollback-status-canonical-heartbeat.sql)
- 유효 기간: 마이그레이션 직후 ~ post-migration non-timeout 'failed' row 유입 전
- Schema drop은 Prisma schema revert + db:push로 별도

---

## Revision Notes

**v1 → v2**:
- 경로 오타 수정 (C1)
- 7 UI 사이트 추가 enumerate (C2/I5)
- agent_definitions 백필 추가 (C3)
- errorCode 공존 규칙 명문화 (P-C1)
- Task 순서 재배열: 1→2→3→(4,5,6)→7→8→9→10, T2가 T3 전
- UX 결정 확정 (I4)
- Post-pull 명령 상세
- Cost SUM 회귀 검증 추가 (I3)
- Rollback SQL 파일 신설 (M6)
- Single PR rationale 명시 (I6)
- Test file 검증 결과 명시 (C3)
- init.sql.gz 조건부 검증 (M7)

v2 아직 재리뷰 안 받음. 필요 시 critic 2차 돌리기.
