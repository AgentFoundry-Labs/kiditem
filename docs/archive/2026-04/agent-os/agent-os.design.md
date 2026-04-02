# Agent OS Design — Clean Architecture

> Selected: **Option B — Clean Architecture**. 기능별 모듈 완전 분리. safety, delegation, lifecycle을 독립 모듈로 추출.

## Context Anchor

| Anchor | Content |
|--------|---------|
| **WHY** | 에이전트가 프로덕션에서 자율 실행되려면 안전장치(위험 패턴 감지, 권한 분리, 검증 재시도)가 필수. 현재는 bypassPermissions로 무제한 실행 |
| **WHO** | KidItem 셀러 (에이전트 실행 결과를 신뢰해야 함), 개발팀 (에이전트 추가/운영) |
| **RISK** | 스키마 변경 시 하위 호환 깨짐, RulesScheduler 통합 시 기존 스케줄 유실, 병렬 실행 시 race condition |
| **SUCCESS** | Phase 1-2 전체 14건 구현 완료, agent-registry 핵심 모듈 테스트 커버리지 80%+, Gap Analysis 90%+ |
| **SCOPE** | agent-registry 모듈 중심. Frontend UI 변경 없음. Python agents 변경 없음. Phase 3-4 제외 |

---

## 1. Overview

### 1.1 Architecture Decision

Clean Architecture를 선택한 이유:
- **Phase 3 확장성**: 모델 폴백, Smart classifier 등 추가 시 기존 모듈 수정 없이 새 모듈 추가
- **독립 테스트**: safety, delegation, lifecycle 각각 독립 단위 테스트 가능
- **SRP 준수**: heartbeat.service.ts의 490줄 유지 (비대화 방지)
- **도메인 경계**: 안전장치(safety), 위임(delegation), 생명주기(lifecycle)가 명확한 관심사 분리

### 1.2 Module Dependency Graph

```
                    ┌──────────────────────┐
                    │  AgentRegistryModule  │
                    └──────────┬───────────┘
                               │ imports
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
   ┌─────────────┐   ┌──────────────┐   ┌────────────────┐
   │   Safety     │   │  Delegation   │   │   Lifecycle     │
   │   Module     │   │  Module       │   │   Module        │
   └──────┬──────┘   └──────┬───────┘   └───────┬────────┘
          │                  │                    │
          ▼                  ▼                    ▼
   ┌─────────────┐   ┌──────────────┐   ┌────────────────┐
   │ Heartbeat    │   │ Wakeup       │   │ Events         │
   │ Service      │   │ Service      │   │ (EventEmitter) │
   └─────────────┘   └──────────────┘   └────────────────┘
          │                  │
          ▼                  ▼
   ┌──────────────────────────────┐
   │       PrismaService          │
   └──────────────────────────────┘
```

---

## 2. Directory Structure

```
apps/server/src/agent-registry/
├── adapters/                          (기존 유지)
│   ├── types.ts
│   ├── registry.ts
│   └── claude-local/
│       └── execute.ts
│
├── heartbeat/                         (기존 — 순수 오케스트레이션)
│   ├── heartbeat.service.ts           ← Modify: prefetch + safety/lifecycle 호출
│   └── __tests__/
│       └── heartbeat.service.spec.ts
│
├── safety/                            ← NEW MODULE
│   ├── safety.module.ts               ← NestJS 모듈 정의
│   ├── dangerous-patterns.ts          ← validateAllowedTools() 순수 함수
│   ├── skill-filter.service.ts        ← 스킬 deny rules + 정렬
│   ├── denial-tracker.service.ts      ← 거부 기록 + 조회
│   └── __tests__/
│       ├── dangerous-patterns.spec.ts
│       ├── skill-filter.service.spec.ts
│       └── denial-tracker.service.spec.ts
│
├── delegation/                        ← NEW MODULE
│   ├── delegation.module.ts
│   ├── delegation.service.ts          ← Operator→Specialist 위임
│   ├── hierarchy.validator.ts         ← reportsTo 관계 검증 순수 함수
│   └── __tests__/
│       ├── delegation.service.spec.ts
│       └── hierarchy.validator.spec.ts
│
├── lifecycle/                         ← NEW MODULE
│   ├── lifecycle.module.ts
│   ├── retry.service.ts               ← Validation retry 로직
│   ├── transcript.service.ts          ← Async recording (fire-and-forget)
│   └── __tests__/
│       ├── retry.service.spec.ts
│       └── transcript.service.spec.ts
│
├── skills/                            (기존 — 마운트 전담)
│   └── skills.service.ts              ← Modify: sort 추가 (deny는 safety로 이동)
│
├── wakeup/                            (기존 유지)
│   └── wakeup.service.ts
│
├── schemas/                           (기존 유지)
│   ├── agent-output-schemas.ts
│   └── validate-output.ts
│
├── events/                            (기존 유지)
│   ├── agent-events.ts                ← Modify: denial 이벤트 추가
│   └── agent-sse.service.ts
│
├── domains/                           (기존 유지)
│   ├── ad-strategy/
│   └── manager/
│
├── dto/                               (기존 유지)
├── agent-registry.module.ts           ← Modify: 신규 모듈 imports
├── agent-registry.controller.ts       ← Modify: delegation, denial 엔드포인트
├── agent-registry.service.ts          ← Modify: safety 검증 호출
└── seed-agents.ts                     ← Modify: 권한 매트릭스 + schedule

agent-config/skills/                   ← NEW (프로젝트 루트)
├── db-query/SKILL.md
├── result-callback/SKILL.md
└── kiditem-api/SKILL.md

apps/server/src/workflows/
├── workflow-runner.service.ts          ← Modify: parallelExecute()
└── context.ts                         ← Modify: Object.freeze

apps/server/src/rules/
├── rules.module.ts                    ← Modify: RulesSchedulerService 제거
├── services/
│   ├── rules.service.ts               ← Modify: schedule API 전환
│   ├── rules-scheduler.service.ts     ← DELETE
│   └── alerts.service.ts
└── controllers/
    └── rules.controller.ts            ← Modify: schedule 엔드포인트 전환
```

---

## 3. Schema Changes

### 3.1 AgentDefinition 확장

```prisma
model AgentDefinition {
  // ... 기존 필드 유지 ...

  // NEW: Skill Safety Filtering (#28)
  deniedSkills String[] @default([]) @map("denied_skills")
}
```

### 3.2 AgentPermissionDenial (신규 테이블)

```prisma
model AgentPermissionDenial {
  id        String   @id @default(uuid()) @db.Uuid
  companyId String   @map("company_id") @db.Uuid
  agentId   String   @map("agent_id") @db.Uuid
  runId     String?  @map("run_id") @db.Uuid
  category  String                                    // 'dangerous_tool' | 'budget_exceeded' | 'feature_gate' | 'skill_denied'
  detail    String                                    // 구체적 내용 (e.g., "Bash(rm:*)")
  action    String   @default("blocked")              // 'blocked' | 'warned'
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz

  agent   AgentDefinition @relation(fields: [agentId], references: [id])
  company Company         @relation(fields: [companyId], references: [id])

  @@index([companyId, agentId, createdAt])
  @@map("agent_permission_denials")
}
```

### 3.3 마이그레이션 전략

- `deniedSkills`: `@default([])` — 기존 에이전트 영향 없음
- `AgentPermissionDenial`: 신규 테이블 — 기존 데이터 영향 없음
- `npm run db:push` 1회로 적용 가능 (비파괴)

---

## 4. Module Design

### 4.1 Safety Module

**책임**: 에이전트 실행 전 안전성 검증 + 거부 기록

#### 4.1.1 dangerous-patterns.ts

```typescript
// 순수 함수 — DI 불필요

const BLOCKED_PATTERNS = [
  /^python:\*$/,
  /^Bash\(rm:/,
  /^Bash\(sudo:/,
  /^Bash\(kill:/,
  /^Bash\(chmod:/,
  /^Bash\(chown:/,
  /^node:\*$/,
  /^Bash\(\*\)$/,           // 전체 Bash 와일드카드
];

export function validateAllowedTools(tools: string): { valid: boolean; blocked: string[] } {
  const toolList = tools.split(/\s+/);
  const blocked = toolList.filter(t => BLOCKED_PATTERNS.some(p => p.test(t)));
  return { valid: blocked.length === 0, blocked };
}
```

**호출 지점**:
- `agent-registry.service.ts` — create/update 시
- `seed-agents.ts` — 시드 등록 시 (개발 시점 검증)

#### 4.1.2 skill-filter.service.ts

```typescript
@Injectable()
export class SkillFilterService {
  /**
   * 에이전트의 요청 스킬에서 denied 목록 제거 + 알파벳 정렬
   */
  filterAndSort(requestedSkills: string[], deniedSkills: string[]): string[] {
    const denied = new Set(deniedSkills);
    return requestedSkills
      .filter(s => !denied.has(s))
      .sort();  // #11 Skill Pool Ordering
  }
}
```

**기존 SkillsService와의 관계**:
- `SkillsService.buildSkillsDir(skills)` 는 마운트 전담 (symlink 생성)
- `SkillFilterService.filterAndSort()` 는 skills 전처리 (필터 + 정렬)
- heartbeat에서: `filterAndSort() → buildSkillsDir()` 순서로 호출

#### 4.1.3 denial-tracker.service.ts

```typescript
@Injectable()
export class DenialTrackerService {
  constructor(private readonly prisma: PrismaService) {}

  async recordDenial(input: {
    companyId: string;
    agentId: string;
    runId?: string;
    category: 'dangerous_tool' | 'budget_exceeded' | 'feature_gate' | 'skill_denied';
    detail: string;
    action?: 'blocked' | 'warned';
  }): Promise<void> {
    await this.prisma.agentPermissionDenial.create({
      data: {
        company: { connect: { id: input.companyId } },
        agent: { connect: { id: input.agentId } },
        runId: input.runId,
        category: input.category,
        detail: input.detail,
        action: input.action ?? 'blocked',
      },
    });
  }

  async listDenials(agentId: string, options?: { limit?: number }) {
    return this.prisma.agentPermissionDenial.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 50,
    });
  }
}
```

**이벤트 통합**: `recordDenial()` 후 `eventEmitter.emit(AGENT_EVENTS.PERMISSION_DENIED, ...)` → SSE

---

### 4.2 Delegation Module

**책임**: Operator→Specialist 위임 + 계층 검증

#### 4.2.1 hierarchy.validator.ts

```typescript
// 순수 함수

export function validateDelegation(
  parent: { id: string; role: string },
  child: { id: string; reportsTo: string | null },
): { valid: boolean; reason?: string } {
  // 자기 자신에게 위임 불가
  if (parent.id === child.id) {
    return { valid: false, reason: 'self_delegation' };
  }
  // 하위 에이전트만 위임 가능 (reportsTo 관계)
  if (child.reportsTo !== parent.id) {
    return { valid: false, reason: 'not_subordinate' };
  }
  // Manager/Operator만 위임 가능
  if (parent.role !== 'manager' && parent.role !== 'operator') {
    return { valid: false, reason: 'insufficient_role' };
  }
  return { valid: true };
}
```

#### 4.2.2 delegation.service.ts

```typescript
@Injectable()
export class DelegationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wakeupService: WakeupService,
    private readonly denialTracker: DenialTrackerService,
  ) {}

  /**
   * 상위 에이전트가 하위 에이전트에게 작업 위임.
   * parentRunId: 현재 실행 중인 상위 에이전트의 run ID (감사 추적용)
   */
  async delegate(input: {
    parentAgentId: string;
    childAgentType: string;
    parentRunId: string;
    companyId: string;
    payload?: Record<string, unknown>;
    reason?: string;
  }) {
    const parent = await this.prisma.agentDefinition.findUnique({
      where: { id: input.parentAgentId },
    });
    const child = await this.prisma.agentDefinition.findUnique({
      where: { type: input.childAgentType },
    });
    if (!parent || !child) throw new Error('Agent not found');

    const validation = validateDelegation(parent, child);
    if (!validation.valid) {
      await this.denialTracker.recordDenial({
        companyId: input.companyId,
        agentId: input.parentAgentId,
        runId: input.parentRunId,
        category: 'delegation_denied' as any,
        detail: `${parent.name} → ${child.name}: ${validation.reason}`,
      });
      return { ok: false, error: validation.reason };
    }

    const wakeup = await this.wakeupService.requestWakeup({
      agentId: child.id,
      companyId: input.companyId,
      source: 'assignment',
      reason: input.reason ?? `Delegated by ${parent.name}`,
      payload: {
        ...input.payload,
        _delegatedBy: input.parentAgentId,
        _parentRunId: input.parentRunId,
      },
      requestedByType: 'agent',
      requestedById: input.parentAgentId,
    });

    return { ok: true, wakeupId: wakeup.id, childAgentId: child.id };
  }
}
```

**API 엔드포인트**:
```
POST /api/agent-registry/:parentId/delegate
Body: { childAgentType, reason, payload }
```

Manager 에이전트가 `curl POST /api/agent-registry/{parentId}/delegate` 로 호출.

---

### 4.3 Lifecycle Module

**책임**: 실행 후 생명주기 관리 (재시도, 기록)

#### 4.3.1 retry.service.ts

```typescript
@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name);

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Zod 검증 실패 시 에러 피드백으로 1회 재시도.
   * 반환: 재시도 프롬프트 (재시도 필요 시) 또는 null (재시도 불필요/불가)
   */
  buildRetryPrompt(
    originalPrompt: string,
    validationErrors: string[],
    currentRetryCount: number,
  ): string | null {
    // 최대 1회
    if (currentRetryCount >= 1) return null;

    const errorFeedback = validationErrors.join('; ');
    return `${originalPrompt}\n\n---\nPREVIOUS OUTPUT WAS INVALID. Fix these errors:\n${errorFeedback}\n\nOutput the corrected JSON only.`;
  }

  /**
   * 재시도 카운트를 HeartbeatRun에 기록
   */
  async recordRetry(runId: string, retryCount: number): Promise<void> {
    await this.prisma.heartbeatRun.update({
      where: { id: runId },
      data: {
        usageJson: {
          // 기존 usage에 retry 정보 추가
          // Prisma의 Json 타입이므로 전체 교체
        },
      },
    });
    this.logger.warn(`Validation retry #${retryCount} for run ${runId}`);
  }
}
```

**heartbeat 통합 흐름**:
```
adapter.execute(ctx) → stdout 파싱 → Zod 검증
  → 성공: 결과 저장
  → 실패 + retryCount < 1: retryService.buildRetryPrompt()
    → 새 ctx 생성 (immutable) → adapter.execute(retryCtx)
    → 재검증 → 성공/최종실패
  → 실패 + retryCount >= 1: validation_failed 최종 처리
```

#### 4.3.2 transcript.service.ts

```typescript
@Injectable()
export class TranscriptService {
  private readonly logger = new Logger(TranscriptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    // 비동기 기록 이벤트 리스닝
    this.eventEmitter.on('agent.run.transcript', (data) => {
      this.recordAsync(data).catch(err =>
        this.logger.error(`Async transcript failed: ${err}`),
      );
    });
  }

  /**
   * Fire-and-forget 기록. heartbeat에서 setImmediate로 호출.
   * blocking 저장(status, exitCode, resultJson)과 분리.
   */
  private async recordAsync(data: {
    runId: string;
    stdoutExcerpt: string;
    stderrExcerpt: string;
    usageJson: Record<string, unknown> | null;
    sessionIdAfter?: string;
  }): Promise<void> {
    await this.prisma.heartbeatRun.update({
      where: { id: data.runId },
      data: {
        stdoutExcerpt: data.stdoutExcerpt,
        stderrExcerpt: data.stderrExcerpt,
        usageJson: data.usageJson as any,
        sessionIdAfter: data.sessionIdAfter,
      },
    });
  }
}
```

**heartbeat 통합**:
```typescript
// heartbeat.service.ts — executeHeartbeat() 결과 저장 부분

// Step 1: Blocking — 즉시 저장 (응답 지연 최소화)
await this.prisma.heartbeatRun.update({
  where: { id: run.id },
  data: { status, finishedAt: new Date(), exitCode, error, resultJson },
});

// Step 2: Fire-and-forget — 비동기 기록
this.eventEmitter.emit('agent.run.transcript', {
  runId: run.id,
  stdoutExcerpt: result.stdout.slice(0, 5000),
  stderrExcerpt: result.stderr.slice(0, 2000),
  usageJson: result.usage,
  sessionIdAfter: result.sessionIdAfter,
});
```

---

### 4.4 HeartbeatService 변경 (Prefetch + 모듈 통합)

```typescript
// heartbeat.service.ts — executeHeartbeat() 변경 부분

private async executeHeartbeat(agentId: string) {
  const agent = await this.prisma.agentDefinition.findUnique({ where: { id: agentId } });
  if (!agent) return;

  const wakeup = await this.wakeupService.claimNext(agentId);
  if (!wakeup) return;

  // ── #24 Prefetch + Harvest (병렬 준비) ──
  const [runtimeState, skillsDir] = await Promise.all([
    this.prisma.agentRuntimeState.findUnique({ where: { agentId } }),
    this.skillFilterService
      .filterAndSort(agent.skills, agent.deniedSkills ?? [])
      .then(filtered => this.skillsService.buildSkillsDir(filtered)),
  ]);

  // ... HeartbeatRun 생성, ctx 조립, adapter.execute() ...

  // ── #19 Validation Retry ──
  if (status === 'succeeded' && resultJson) {
    const validation = validateAgentOutput(agent.type, resultJson);
    if (!validation.valid) {
      const retryPrompt = this.retryService.buildRetryPrompt(
        ctx.prompt, validation.errors ?? [], 0,
      );
      if (retryPrompt) {
        // 새 immutable ctx 생성 + 재실행
        const retryCtx = Object.freeze({ ...ctx, prompt: retryPrompt });
        const retryResult = await adapter.execute(retryCtx);
        // 재검증...
      }
    }
  }

  // ── #17 Async Transcript ──
  // Step 1: Blocking save (status, exitCode, resultJson)
  await this.prisma.heartbeatRun.update({ ... });
  // Step 2: Fire-and-forget (stdout, stderr, usage)
  this.eventEmitter.emit('agent.run.transcript', { ... });
}
```

---

### 4.5 Workflow Parallel Execution

#### workflow-runner.service.ts 변경

```typescript
// 기존 순차 실행에 병렬 분기 추가

private async executeNodes(
  dag: DAG,
  context: WorkflowContext,
  runId: string,
): Promise<void> {
  const readyNodes = dag.getStartNodes();
  const completed = new Set<string>();

  while (readyNodes.length > 0) {
    // 독립 노드 감지: 서로 의존하지 않는 ready 노드들
    const parallelGroup = this.findParallelGroup(readyNodes, dag);

    if (parallelGroup.length > 1 && this.allConcurrencySafe(parallelGroup)) {
      // 병렬 실행
      await Promise.all(
        parallelGroup.map(nodeId => this.executeNode(nodeId, dag, context, runId)),
      );
    } else {
      // 순차 실행 (기본)
      await this.executeNode(parallelGroup[0], dag, context, runId);
    }

    for (const nodeId of parallelGroup) {
      completed.add(nodeId);
      // context snapshot: 이전 step의 output을 freeze
      const output = context.getOutput(nodeId);
      if (output) Object.freeze(output);  // #2 Immutable

      // 다음 ready 노드 추가
      const nextNodes = dag.getNextNodes(nodeId);
      for (const next of nextNodes) {
        const deps = dag.getIncoming(next);
        if (deps.every(d => completed.has(d))) {
          readyNodes.push(next);
        }
      }
    }

    // 처리된 노드 제거
    for (const nodeId of parallelGroup) {
      const idx = readyNodes.indexOf(nodeId);
      if (idx >= 0) readyNodes.splice(idx, 1);
    }
  }
}

private allConcurrencySafe(nodeIds: string[]): boolean {
  return nodeIds.every(id => {
    const def = this.getNodeDefinition(id);
    return def?.isConcurrencySafe ?? false;
  });
}
```

**Executor 태그**:
```typescript
// executors/builtin.ts — 기존 executor에 태그 추가
registerNode('trigger.manual', triggerManual, { isConcurrencySafe: true });
registerNode('condition.evaluate', conditionEvaluate, { isConcurrencySafe: true });
registerNode('data.filter', dataFilter, { isConcurrencySafe: true });
registerNode('notification.alert', notificationAlert, { isConcurrencySafe: false }); // DB write
registerNode('internal.db_query', dbQuery, { isConcurrencySafe: false }); // DB write
```

---

### 4.6 WorkflowContext Immutable (#2)

```typescript
// context.ts 변경

export class WorkflowContext {
  private readonly outputs: Map<string, Readonly<Record<string, any>>> = new Map();

  setOutput(nodeId: string, data: Record<string, any>): void {
    // 저장 시 freeze — 이후 수정 불가
    this.outputs.set(nodeId, Object.freeze({ ...data }));
  }

  getOutput(nodeId: string): Readonly<Record<string, any>> | undefined {
    return this.outputs.get(nodeId);
  }

  // resolve()는 기존 로직 유지 — 읽기 전용이므로 immutable과 호환
}
```

---

### 4.7 Scratch Workspace (#15)

```typescript
// delegation.service.ts에 추가

async createScratchWorkspace(workflowId: string): Promise<string> {
  const dir = path.join(os.tmpdir(), 'kiditem-scratch', workflowId);
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
}

async cleanupScratchWorkspace(workflowId: string): Promise<void> {
  const dir = path.join(os.tmpdir(), 'kiditem-scratch', workflowId);
  try {
    await fs.promises.rm(dir, { recursive: true, force: true });
  } catch { /* ignore */ }
}
```

**전달 방식**: ExecutionContext.env에 `KIDITEM_SCRATCH_DIR` 추가
```typescript
env: Object.freeze({
  KIDITEM_AGENT_ID: agent.id,
  KIDITEM_COMPANY_ID: companyId,
  KIDITEM_RUN_ID: run.id,
  KIDITEM_SCRATCH_DIR: scratchDir ?? '',  // 워크플로우 내일 때만 설정
}),
```

---

## 5. RulesScheduler Migration

### 5.1 변경 전/후

| 항목 | Before | After |
|------|--------|-------|
| 스케줄 실행 | `RulesSchedulerService` 자체 cron | `HeartbeatService.syncTimers()` — `rules_evaluation` agent의 `schedule` 필드 |
| 스케줄 변경 API | `PATCH /api/rules/schedule` → SystemSetting | `PATCH /api/agent-registry/:id` → AgentDefinition.schedule |
| 스케줄 조회 API | `GET /api/rules/schedule` | `GET /api/agent-registry/:id` → schedule 필드 |
| 평가 트리거 | `rulesService.evaluateAll()` 직접 호출 | `heartbeat.wakeAgent()` → adapter → Claude CLI → callback |

### 5.2 Seed 변경

```typescript
// seed-agents.ts — rules_evaluation 에이전트
{
  name: '건강도 평가 에이전트',
  type: 'rules_evaluation',
  schedule: '0 9,18 * * *',  // ← 기존 twice_daily 기본값 명시
  // ... 나머지 동일
}
```

### 5.3 Rules Controller 전환

```typescript
// rules.controller.ts — 스케줄 관련 엔드포인트 전환

// Before:
@Get('schedule')
getSchedule() { return this.schedulerService.getSchedule(); }

// After:
@Get('schedule')
async getSchedule() {
  const agent = await this.agentRegistry.findByType('rules_evaluation');
  return {
    schedule: agent.schedule ?? 'disabled',
    options: ['0 9 * * *', '0 9,18 * * *', '0 */6 * * *', 'disabled'],
  };
}

@Patch('schedule')
async setSchedule(@Body() dto: UpdateScheduleDto) {
  const agent = await this.agentRegistry.findByType('rules_evaluation');
  await this.agentRegistry.update(agent.id, { schedule: dto.schedule });
  await this.heartbeat.syncTimers();  // 즉시 반영
  return { ok: true, schedule: dto.schedule };
}
```

### 5.4 삭제 대상

- `apps/server/src/rules/services/rules-scheduler.service.ts` — DELETE
- `rules.module.ts` — providers에서 `RulesSchedulerService` 제거

---

## 6. Seed Agents Permission Matrix (#14)

```typescript
// seed-agents.ts — role별 권한 매트릭스

const ROLE_PERMISSIONS = {
  manager: {
    allowedTools: 'Read Bash(curl:*)',
    permissions: { canSpawnSubAgents: true, canAccessBrowser: false, canModifyData: false },
  },
  operator: {
    allowedTools: 'Read Bash(curl:*)',
    permissions: { canSpawnSubAgents: true, canAccessBrowser: false, canModifyData: false },
  },
  specialist: {
    allowedTools: 'Bash(psql:*) Bash(curl:*) Read',
    permissions: { canSpawnSubAgents: false, canAccessBrowser: false, canModifyData: false },
  },
} as const;
```

Manager/Operator는 DB 직접 접근 불가 → delegation API로 specialist에게 위임.

---

## 7. Event System Extension

```typescript
// events/agent-events.ts — 신규 이벤트

export const AGENT_EVENTS = {
  STATUS_CHANGED: 'agent.status.changed',
  BUDGET_WARNING: 'agent.budget.warning',
  AUTO_PAUSED: 'agent.auto.paused',
  PERMISSION_DENIED: 'agent.permission.denied',    // NEW
  DELEGATION_REQUESTED: 'agent.delegation.requested', // NEW
  VALIDATION_RETRY: 'agent.validation.retry',       // NEW
} as const;

// 신규 이벤트 클래스
export class AgentPermissionDeniedEvent {
  constructor(
    public readonly agentId: string,
    public readonly agentName: string,
    public readonly category: string,
    public readonly detail: string,
  ) {}
}

export class AgentDelegationEvent {
  constructor(
    public readonly parentAgentId: string,
    public readonly childAgentId: string,
    public readonly reason: string,
  ) {}
}
```

---

## 8. API Endpoints (신규/변경)

| Method | Path | 용도 | Module |
|--------|------|------|--------|
| POST | `/api/agent-registry/:parentId/delegate` | Operator→Specialist 위임 | Delegation |
| GET | `/api/agent-registry/:id/denials` | 에이전트별 거부 이력 조회 | Safety |
| GET | `/api/agent-registry/denials/summary` | 전체 거부 요약 (대시보드용) | Safety |

---

## 9. Test Plan

| Module | Test File | Cases | Priority |
|--------|-----------|-------|----------|
| Safety | `dangerous-patterns.spec.ts` | 블랙리스트 매칭, 안전한 패턴 통과, 빈 문자열 | High |
| Safety | `skill-filter.service.spec.ts` | 정렬 확인, deny 필터, 빈 배열 | High |
| Safety | `denial-tracker.service.spec.ts` | 기록 생성, 조회, 페이지네이션 | Medium |
| Delegation | `hierarchy.validator.spec.ts` | reportsTo 검증, 자기 위임, 역할 검증 | High |
| Delegation | `delegation.service.spec.ts` | 위임 성공, 거부 기록, 에이전트 없음 | High |
| Lifecycle | `retry.service.spec.ts` | 재시도 프롬프트 생성, 최대 1회, 빈 에러 | High |
| Lifecycle | `transcript.service.spec.ts` | 비동기 기록, 에러 시 로그만 | Medium |
| Heartbeat | `heartbeat.service.spec.ts` (기존 수정) | prefetch 병렬, safety 통합 | High |
| Workflow | `workflow-runner.spec.ts` | 병렬 실행, immutable context | Medium |

**테스트 패턴**: 기존 `makePrisma()` + `vi.fn()` 패턴 유지.

---

## 10. Skill Files Content

### 10.1 db-query/SKILL.md

```yaml
---
name: db-query
description: PostgreSQL 쿼리 실행. psql CLI로 KidItem DB 조회.
---
```
- DB 연결: `psql "$DATABASE_URL" -t -A -F '|' -c "..."`
- 주요 테이블/컬럼 요약 (products, inventory, ads, profit_loss, reviews, orders, alerts)
- 조인 관계 + 필수 조건 (`is_deleted = false`, `company_id` 필터)

### 10.2 result-callback/SKILL.md

```yaml
---
name: result-callback
description: NestJS API 결과 콜백 규칙. JSON 형식, 에러 처리 패턴.
---
```
- 콜백 URL: `{{result_api}}`
- curl 형식: `curl -s -X POST {{result_api}} -H "Content-Type: application/json" -d '{...}'`
- 에러 시: HTTP 200 + `{ "error": "message" }` 형식

### 10.3 kiditem-api/SKILL.md

```yaml
---
name: kiditem-api
description: KidItem 내부 API 엔드포인트 목록. Manager 에이전트용.
---
```
- 엔드포인트 목록 (products, inventory, ads, rules, agent-registry)
- 인증: 내부 서비스 간 통신 (auth 없음)
- delegation API: `POST /api/agent-registry/:parentId/delegate`

---

## 11. Implementation Guide

### 11.1 Implementation Order

```
1. Schema changes (prisma/schema.prisma)
   └→ npm run db:push

2. Skill files (agent-config/skills/)
   └→ db-query, result-callback, kiditem-api

3. Safety module (agent-registry/safety/)
   └→ dangerous-patterns → skill-filter → denial-tracker

4. Lifecycle module (agent-registry/lifecycle/)
   └→ transcript.service → retry.service

5. Delegation module (agent-registry/delegation/)
   └→ hierarchy.validator → delegation.service

6. HeartbeatService integration
   └→ prefetch + safety + lifecycle + delegation 호출

7. RulesScheduler migration
   └→ seed 변경 → controller 전환 → 파일 삭제

8. Workflow changes
   └→ context immutable → parallel execution

9. Seed agents update
   └→ permission matrix + schedule

10. Tests for all modules
```

### 11.2 Module Map

| Module | Key | Files | Dependencies |
|--------|-----|-------|-------------|
| Schema | `module-0` | `prisma/schema.prisma` | None |
| Skills | `module-1` | `agent-config/skills/` (3 files) | None |
| Safety | `module-2` | `safety/` (4 files + tests) | Prisma, EventEmitter |
| Lifecycle | `module-3` | `lifecycle/` (3 files + tests) | Prisma, EventEmitter |
| Delegation | `module-4` | `delegation/` (3 files + tests) | Prisma, WakeupService, DenialTracker |
| Heartbeat Integration | `module-5` | `heartbeat/heartbeat.service.ts` | Safety, Lifecycle, Skills |
| Rules Migration | `module-6` | `rules/` (3 files modify/delete) | HeartbeatService |
| Workflow | `module-7` | `workflows/` (2 files) | None |
| Seed Update | `module-8` | `seed-agents.ts` | Safety (validation) |
| TODOS Cleanup | `module-9` | `agents/` (9 files) | None |

### 11.3 Session Guide

**권장 세션 분할** (Team Swarm 기준):

| Session | Modules | 예상 시간 | 비고 |
|---------|---------|-----------|------|
| **S1** | module-0 + module-1 + module-9 | 30분 | Prerequisites: 스키마, 스킬, TODOS |
| **S2** | module-2 (Safety) | 1시간 | 독립 모듈 + 테스트 |
| **S3** | module-3 (Lifecycle) | 1시간 | 독립 모듈 + 테스트 |
| **S4** | module-4 (Delegation) | 1시간 | module-2 의존 (DenialTracker) |
| **S5** | module-5 + module-8 (Heartbeat + Seed) | 1.5시간 | 통합: S2+S3+S4 완료 후 |
| **S6** | module-6 (Rules Migration) | 30분 | module-5 완료 후 |
| **S7** | module-7 (Workflow) | 1시간 | 독립 |

**Swarm 병렬화**: S1 완료 후 S2, S3, S7은 동시 실행 가능. S4는 S2 이후. S5는 S2+S3+S4 이후.

```
S1 (prerequisites) ──┬──→ S2 (safety) ──┬──→ S4 (delegation) ──┐
                     ├──→ S3 (lifecycle) ┤                      ├──→ S5 (heartbeat) ──→ S6 (rules)
                     └──→ S7 (workflow)  ┘                      │
                                                                 └──→ S8 (seed)
```
