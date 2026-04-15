# Status Canonical Lifecycle — Phase 2 (HeartbeatRun)

**Revision**: v1 of 2026-04-15. Awaiting adversarial review (critic + plan-eng-review) before execution.

**Branch**: `refactor/status-canonical-heartbeat`

**Goal**: ADR-0011 Phase 2. HeartbeatRun의 `'timed_out'` 값을 canonical enum 안으로 이동 — `status='failed'` + 새 sibling 컬럼 `failureType='timeout'`. Writer + Raw SQL + Prisma query + Web UI + Shared schema 모두 정렬. Schema default `"queued"` → `"pending"` 도 함께 교정.

**Why**: ADR-0011 Rule 1 위반 (`'timed_out'` is not canonical). Panel PR2의 agent adapter가 이 도메인 사용 예정 — adapter에서 매핑 금지 (Rule 4). Writer 레벨에서 정렬이 유일한 경로.

**Non-goals (Phase 3 / 별도)**:
- ThumbnailGeneration canonical (Phase 3 — `phase` 컬럼 신설)
- AgentTask status 정렬 — legacy wrapper, 별도 Phase로 분리 (사유: Web UI가 inventory/stock 등 다른 도메인의 'completed'와 혼합 사용, scope creep 위험)
- `failureType` 추가 값 (`'budget_exceeded'` 등) — 현재 writer가 안 씀. 필요 시 후속 ADR/추가 시점에 확장

---

## Pre-flight 완료 (2026-04-15)

### HeartbeatRun 현재 상태

| 영역 | 현재 |
|---|---|
| Schema default | `status @default("queued")` — canonical 아님 |
| Writer 실제 값 | `'running'`, `'succeeded'`, `'failed'`, `'timed_out'` |
| Writer 사이트 | `apps/server/src/agent-registry/heartbeat/heartbeat.service.ts` 4곳 (create @231, compute @333, update @395, branch @456) |
| triggeredByUserId | 없음 → company visibility only (Rule 5 준수) |

### 영향받는 파일 (11건)

| # | File | 변경 종류 |
|---|---|---|
| 1 | `prisma/schema.prisma` | `failureType` 컬럼 추가, default `"queued"` → `"pending"` |
| 2 | `apps/server/src/agent-registry/heartbeat/heartbeat.service.ts` | status 계산 로직 수정 (timed_out 분리), branch 조건 수정 |
| 3 | `apps/server/src/agent-registry/agent-registry.service.ts:331,362` | Raw SQL `status IN (...)` from WHERE 절 단순화 |
| 4 | `apps/server/src/agent-registry/context-manager/compressor.service.ts:24` | Prisma `status: { in: [...] }` 에서 'timed_out' 제거 |
| 5 | `apps/server/src/agent-registry/lifecycle/result-cleanup.service.ts:43` | `status: { not: 'running' }` 유지 (변경 불필요 — 확인만) |
| 6 | `packages/shared/src/schemas/agent.ts:78-107` | `HeartbeatRunSchema.status` → `z.enum(canonical)`, `failureType` optional enum 추가 |
| 7 | `apps/web/src/app/agents/activity/components/ActivityFilters.tsx:47` | 'timed_out' dropdown 옵션 제거 → failureType 기반 렌더 |
| 8 | `apps/web/src/app/agents/activity/components/ActivityFeed.tsx:38` | error detection `|| status === 'timed_out'` 제거, failureType 활용 |
| 9 | `apps/web/src/app/agents/activity/components/DashboardTab.tsx:33` | failed count 로직에 timed_out 포함된 부분 확인/정리 |
| 10 | (test files) | 관련 spec 업데이트 |
| 11 | `prisma/backfill-status-canonical-heartbeat.sql` | 새 파일 |

### Billable run SQL 변환 (cost analytics, 중요)

**Before** (`agent-registry.service.ts:331,362`):
```sql
WHERE status IN ('succeeded', 'failed', 'timed_out')
```

**After** (마이그레이션 후 `'timed_out'` 은 `status='failed', failureType='timeout'` 로 저장됨):
```sql
WHERE status IN ('succeeded', 'failed')
```

의미론 동일 — timed_out이 failed 밑에 합쳐졌으니 cost 집계 결과 불변. 간단화만 발생.

---

## Task 1 — Schema: failureType 컬럼 + default 교정

**Files**: `prisma/schema.prisma`

**Changes**:
```prisma
model HeartbeatRun {
  // ...existing
  status        String  @default("pending") @map("status")   // was: "queued"
  failureType   String? @map("failure_type")                   // NEW — 'timeout' | null (PR2 scope)
  // ...existing indexes
  @@index([status])   // 기존 유지
}
```

**Verification**:
```bash
cd /Users/yhc125/workspace/kiditem
npm run db:push
npx prisma generate
npm run build --workspace=@kiditem/shared
```

**Commit**: `feat(prisma): add HeartbeatRun.failureType + default → 'pending'`

---

## Task 2 — Writer: heartbeat.service.ts 정렬

**Files**: `apps/server/src/agent-registry/heartbeat/heartbeat.service.ts`

**Changes**:

1. **Line ~333** — status 계산 로직:
```typescript
// BEFORE
const status = result.timedOut ? 'timed_out'
  : result.exitCode === 0 ? 'succeeded'
  : 'failed';

// AFTER
const status = result.exitCode === 0 ? 'succeeded' : 'failed';
const failureType = result.timedOut ? 'timeout' : null;
```

2. **Line ~395** — update data에 failureType 추가:
```typescript
await this.prisma.heartbeatRun.update({
  where: { id: run.id },
  data: { status, failureType, finishedAt, exitCode, errorCode, ... },
});
```

3. **Line ~456** — branch 조건 교정:
```typescript
// BEFORE
const isFailed = status === 'failed' || status === 'timed_out';

// AFTER
const isFailed = status === 'failed';   // 'timed_out'은 이제 status='failed'의 subset
```

**Tests**: heartbeat 관련 spec (`heartbeat.service.spec.ts` 또는 `__tests__/heartbeat-flow.spec.ts`)에 'timed_out' assertion 있으면 `{status:'failed', failureType:'timeout'}` 로 업데이트.

**Verification**:
```bash
cd apps/server && npx vitest run src/agent-registry
cd apps/server && npx tsc --noEmit
```

**Commit**: `refactor(agent-registry): split heartbeat 'timed_out' into status='failed' + failureType='timeout'`

---

## Task 3 — Raw SQL: cost analytics 업데이트

**Files**: `apps/server/src/agent-registry/agent-registry.service.ts` (라인 331, 362 근처)

**Changes**:
```sql
-- BEFORE (both queries)
WHERE status IN ('succeeded', 'failed', 'timed_out')
  AND usage_json IS NOT NULL

-- AFTER
WHERE status IN ('succeeded', 'failed')
  AND usage_json IS NOT NULL
```

**Rationale**: 마이그레이션 후 'timed_out'은 `status='failed'`로 저장. `'failed'`만 IN 절에 두면 timeout 집계 누락 없음.

**Commit**: `refactor(agent-registry): canonical status in cost analytics raw SQL`

---

## Task 4 — Prisma query: compressor + result-cleanup

**Files**: 
- `apps/server/src/agent-registry/context-manager/compressor.service.ts:24`
- `apps/server/src/agent-registry/lifecycle/result-cleanup.service.ts:43` (검증만, 변경 없음 예상)

**Changes (compressor.service.ts:24)**:
```typescript
// BEFORE
where: { agentId, status: { in: ['succeeded', 'failed', 'timed_out'] } }

// AFTER
where: { agentId, status: { in: ['succeeded', 'failed'] } }
```

**Changes (result-cleanup.service.ts:43)**: 
```typescript
// 현재 status: { not: 'running' } — 'failed' + 'succeeded' + 'timed_out' + 'queued' 포함
// 마이그레이션 후 'timed_out' 사라지고 'failed'+'succeeded'+'queued' 커버. 동일. 변경 없음.
```

**Commit**: `refactor(agent-registry): canonical status in compressor query`

---

## Task 5 — Web UI: ActivityFilters/Feed/DashboardTab 업데이트

**Files**:
- `apps/web/src/app/agents/activity/components/ActivityFilters.tsx:47`
- `apps/web/src/app/agents/activity/components/ActivityFeed.tsx:38`
- `apps/web/src/app/agents/activity/components/DashboardTab.tsx:33`
- `apps/web/src/app/agents/tasks/[id]/trace/lib/trace-utils.ts:59` (검증 필요)

**Changes**:

**ActivityFilters.tsx:47** — dropdown 옵션에서 'timed_out' 제거. '시간초과' 라벨은 `{status:'failed', failureType:'timeout'}` 필터로 표현:
```tsx
// BEFORE
<option value="timed_out">시간초과</option>

// AFTER
// 옵션은 canonical 5개만. 시간초과 전용 필터가 필요하면 별도 조합 UI
// (실제 UI 요구사항에 따라 — 플랜 실행 시 결정. 기본: 단순히 해당 옵션 제거)
```

**ActivityFeed.tsx:38**:
```tsx
// BEFORE
const hasError = run.status === 'failed' || run.status === 'timed_out';

// AFTER
const hasError = run.status === 'failed';   // timeout도 포함됨 (canonical 후)
// 필요하면 timeout 표시:
const isTimeout = run.status === 'failed' && run.failureType === 'timeout';
```

**DashboardTab.tsx:33**: failed count 집계 — 현재 'timed_out'을 `|| status === 'timed_out'` 로 포함하고 있으면 단순화.

**Commit**: `refactor(web/agents): canonical status in activity filters + feed + dashboard`

---

## Task 6 — Shared Zod: HeartbeatRunSchema 조이기

**Files**: `packages/shared/src/schemas/agent.ts`

**Changes**:
```typescript
export const HEARTBEAT_FAILURE_TYPES = ['timeout'] as const;
export type HeartbeatFailureType = typeof HEARTBEAT_FAILURE_TYPES[number];

export const HeartbeatRunSchema = z.object({
  // ...existing
  status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled']),   // was: z.string()
  failureType: z.enum(HEARTBEAT_FAILURE_TYPES).nullable().optional(),            // NEW
  // ...existing
});
```

`HEARTBEAT_FAILURE_TYPES` 를 별도 export해서 ADR-0011 Rule 3 (typed union in shared) 준수.

**Verification**:
```bash
npm run build --workspace=@kiditem/shared
cd apps/server && npx tsc --noEmit
cd apps/web && npx tsc --noEmit
```

**Commit**: `refactor(shared): HeartbeatRunSchema.status z.enum + failureType typed union`

---

## Task 7 — Backfill SQL

**Files**: `prisma/backfill-status-canonical-heartbeat.sql`

**Content**:
```sql
-- ADR-0011 Phase 2: HeartbeatRun 'timed_out' canonical migration
-- Pre-condition: Task 1 (schema add) + Task 2 (writer change) deployed.
-- Idempotent: running twice = no-op.

BEGIN;

-- Migrate 'timed_out' → status='failed', failureType='timeout'
UPDATE heartbeat_runs
  SET status = 'failed', failure_type = 'timeout'
  WHERE status = 'timed_out';

-- (Optional) Migrate stale 'queued' rows (if any legacy default-only rows) → 'pending'
-- 현재 writer가 'queued' 를 안 쓰므로 존재할 row 드묾. 안전을 위해 포함.
UPDATE heartbeat_runs SET status = 'pending' WHERE status = 'queued';

-- Sanity check — should all return 0
SELECT 'timed_out-remaining', COUNT(*) FROM heartbeat_runs WHERE status = 'timed_out'
UNION ALL SELECT 'queued-remaining', COUNT(*) FROM heartbeat_runs WHERE status = 'queued';

COMMIT;
```

**Run**:
```bash
docker exec -i kiditem-postgres psql -U kiditem kiditem < prisma/backfill-status-canonical-heartbeat.sql
```

**Expected**: 2 sanity check rows both 0.

**Rollback invariant**: 마이그레이션 직후 유효, 이후 새 `status='failed'` row들이 쌓이면 rollback 시 timeout 여부 구분 불가. 시각 window 제한.

**Commit**: `chore(db): backfill heartbeat_runs 'timed_out' → failed+failureType`

---

## Task 8 — init.sql.gz 재생성

**When**: Task 1-7 완료 후, Task 9 검증 전

**Commands**:
```bash
docker exec kiditem-postgres pg_dump -U kiditem --data-only --column-inserts --no-owner --no-privileges kiditem | gzip > prisma/init.sql.gz
```

**Verification**:
```bash
gunzip -c prisma/init.sql.gz | grep "heartbeat_runs" | grep -c "timed_out"  # expected: 0
gunzip -c prisma/init.sql.gz | grep "INSERT INTO public.heartbeat_runs" | head -2  # sanity
```

**Commit**: `chore(db): regenerate init.sql.gz after heartbeat canonical backfill`

---

## Task 9 — 전체 검증

**Steps**:
1. `cd apps/server && npx tsc --noEmit` — clean
2. `cd apps/web && npx tsc --noEmit` — clean
3. `npm run build --workspace=apps/server` — success
4. `npm run build --workspace=apps/web` — success
5. `npx vitest run` (루트에서) — 전수 pass
6. `cd apps/server && timeout 25 npm run start:dev 2>&1 | grep -E "Mapped|Error|Nest.*started"` — panel + agent-registry 모듈 부트 OK
7. DB sanity:
   ```sql
   SELECT status, failure_type, COUNT(*) FROM heartbeat_runs GROUP BY status, failure_type;
   ```
   Expected: `'timed_out'` 행 없음, `'failed' + failure_type='timeout'` 로 이동됨.

**Commit**: 별도 없음 (검증만)

---

## Task 10 — PR 생성

**Branch**: `refactor/status-canonical-heartbeat`

**PR title**: `refactor(agent-registry): canonicalize HeartbeatRun status (ADR-0011 Phase 2)`

**Body** (템플릿):
- 변경 요약: Phase 2 — HeartbeatRun 'timed_out' → failed + failureType 분리
- DB 변경: schema.prisma 변경 있음 (failureType 컬럼 + default 교정)
- Backfill SQL 포함
- init.sql.gz 갱신
- 테스트 + 빌드 + dev:server boot 체크리스트
- ADR 해당 없음 (ADR-0011 Phase 2 진행일 뿐, 새 ADR 아님)
- Post-pull 지침: `/kiditem-sync` + backfill 실행

---

## Self-Review

### ADR-0011 Rule 준수
- Rule 1 (canonical enum only): ✅ status가 5 canonical 값만 씀
- Rule 2 (sibling columns for sub-state): ✅ failureType 신설
- Rule 3 (typed union in shared): ✅ HEARTBEAT_FAILURE_TYPES export
- Rule 4 (no mapping in consumers): ✅ writer 레벨에서 정렬, Panel adapter는 직접 사용 가능해짐
- Rule 5 (phased rollout): Phase 2 실행 중

### Phase 1 교훈 반영
- ✅ File path + line numbers pre-flight에서 확정 (heartbeat.service.ts 실제 경로 `agent-registry/heartbeat/` 확인)
- ✅ Writer 변경 먼저 → backfill → consumer 업데이트 순서
- ✅ Consumer scope 사전 enumerate (11 파일)
- ✅ Raw SQL 사이트 명시적 (agent-registry.service.ts:331,362)
- ✅ Shared Zod 조이기 포함
- ✅ Backfill 역방향 구분 곤란성 rollback invariant로 문서화

### Critic 예상 발견 가능성
- ThumbnailGeneration `.status = 'completed'` heartbeat.service.ts:528 (AgentTask 처리) — 현재 Non-goals로 명시. critic이 "scope창 여닫기" 지적할 수 있음
- Rollback deadline 더 명확히 필요?
- Cost analytics 재검증 (billable run semantic 보존?)

### Placeholder scan
- Task 2 라인 번호 (~333, ~395, ~456): 실제 grep으로 재확인 지시 포함
- Task 5 UI 변경: 구체 UX 요구사항은 실행 시 결정 (dropdown 제거 vs 재정의)

---

## Revision Notes

v1 아직 review 안 됨. critic + plan-eng-review 후 v2 발행 예정.
