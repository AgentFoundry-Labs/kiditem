# agent-registry — Agent OS

Agent orchestration platform. Claude CLI spawn-based.

## Owner domain — Automation / Agent OS

이 폴더는 `apps/server/AGENTS.md` Domain Topology Target 의 `automation` /
`agent-os` owner domain compatibility runtime surface 다. keep / delete /
rewrite / defer 분류와 hard-delete 기준은 이 파일과 sibling scoped
`automation`, `rules`, `marketplace` `AGENTS.md` 파일에 직접 보존한다.

핵심 contract:

- `agent-registry.service.ts` 는 Phase 3C-6 이후 compatibility facade 다.
  새 동작을 이 파일에 직접 추가하지 않는다. 실제 구현은
  `automation/application/service/agent-{crud,run,lifecycle,cost-analytics}.service.ts`
  로 들어간다.
- `AgentRegistryService.runByType` / `.run` 이 **유일한** AI/LLM 위임 경계.
  workflow 의 `agent_task.create` executor, rules 의 `evaluateAll`, sourcing /
  advertising / AI thumbnail / companies/agent-tasks 가 모두 이 boundary 만 사용한다.
- `AgentTask` 의 first-class trace columns (`companyId`, `workflowRunId`,
  `workflowNodeId`, `sourceDataId`) 는 production rewrite 까지 호환 보존.
- `domains/` (manager + ad-strategy post-processing) 는 owner domain 으로 모두
  이동 완료. `manager` 는 AO-3B 에서 `automation` (`apps/server/src/automation/adapter/in/http/manager.controller.ts`
  + `apps/server/src/automation/application/service/agent/manager.service.ts`) 로,
  `ad-strategy` 는 AO-3C 에서 `advertising`
  (`apps/server/src/advertising/adapter/in/http/ad-strategy-agent.controller.ts`
  + `apps/server/src/advertising/application/service/ad-strategy-agent.service.ts`) 로
  옮겨졌고 둘 다 `AGENT_RUNNER_PORT` 경유. `agent-registry/` 에는 더 이상
  `domains/{name}/` 를 두지 않는다 — 신규 custom post-processing 은 owner business
  domain 또는 `automation` 에 배치하고 Agent OS 는 ports 경유.

`business-safety/`, `context-manager/`, `delegation/`, `events/`, `heartbeat/`,
`lifecycle/`, `permissions/`, `safety/`, `schemas/`, `skills/`, `trace/`,
`wakeup/` 은 모두 Agent OS 내부 런타임. 실행 adapter 는
`automation/adapter/out/agent-runtime/` 으로 이동했다. 해당 hard-delete 후보 없음.

**Runtime state 모델**: 에이전트의 현재 상태는 **`AgentDefinition` (정의 + `rt_*` 내장 필드) + `HeartbeatRun` (safety pipeline 실행 이력) + `AgentEvent` (permission_denied / action_snapshot 이벤트)** 세 모델의 조합으로 표현. 별도 "AgentState" 테이블 없음. 상세 필드: [`prisma/models/agents.prisma`](../../../../prisma/models/agents.prisma).

## Execution boundary

`AgentRegistry` 는 Workflow 의 하위 executor 가 아니라 **독립 execution boundary** 다.

- Workflow `agent_task.create` 노드는 `AgentRegistryService.runByType` 를 호출만 한다 — runner 가 결과를 기다리지 않고 fire-and-forget 으로 위임. `AgentRegistry` 는 task 를 만들고 자체 heartbeat / safety pipeline 으로 실행한다.
- 따라서 workflow runner 가 죽어도 agent 는 계속 돌고, agent 가 실패해도 workflow 는 다음 노드로 넘어가지 않는다 (분리된 lifecycle).
- 반대 방향: `AgentRegistry` 는 workflow 의 내부를 모른다. `AgentTask.workflowRunId` / `workflowNodeId` 는 trace 용 first-class column 이고, executor 흐름 제어에는 사용되지 않는다.

## AgentDefinition tenant policy

`AgentDefinition.companyId` 는 nullable 이다.

| 값 | 의미 | Read/Run | Mutate (update / delete / pause / resume / resetSession) |
|---|---|---|---|
| `null` | 글로벌 catalog 템플릿 (시스템 시드) | 모든 tenant 허용 | **금지** — platform/seed 만 수정 |
| `<companyId>` | tenant 가 보유한 인스턴스 (marketplace hire 결과) | 해당 tenant 만 | 해당 tenant 만 |

구현: `automation/application/service/agent-registry.types.ts` +
`agent-{crud,run,lifecycle}.service.ts`
- 읽기/실행 (`tenantScopeFilter`): `OR: [{ companyId }, { companyId: null }]` — 글로벌 + 본인 tenant
- 쓰기 (`tenantOwnedFilter`): `{ companyId }` — 본인 tenant 전용. `updateMany` / `deleteMany` 의 actual mutation 에 binding (pre-read 만 scope 하는 패턴 금지).

글로벌 row 의 `rt_*` 필드는 모든 tenant 가 공유하기 때문에 `resetSession` / `pauseAgent` / `resumeAgent` 같은 lifecycle mutation 도 tenant-owned 만 허용한다. Marketplace 의 "hire" 흐름은 글로벌 정의를 tenant-owned row 로 clone 한다 — tenant 는 자기 clone 을 수정하지 upstream 을 건드리지 않는다.

## AgentTask trace contract

`run` / `runByType` 가 만드는 `AgentTask` 는 다음 first-class column 으로 trace 를 보존한다:

| Column | 의미 | 출처 |
|---|---|---|
| `companyId` | 이 실행의 tenant scope | controller `@CurrentCompany()` (trusted). 내부 caller 가 생략하면 `def.companyId` fallback. 글로벌 정의 + caller 미지정 → `null` (시스템 실행) |
| `workflowRunId` | Workflow 가 만든 task 면 그 run 의 id | runner 가 `agent_task.create` executor 에서 주입 |
| `workflowNodeId` | 동일 run 안에서 어떤 노드가 만들었는지 | runner 가 주입 |
| `sourceDataId` | 도메인 trigger 가 만든 task 면 origin row id | 도메인 service (예: `sourcing`, `rules`) 가 주입 |

`input.extra` 는 backward-compat envelope 다. legacy caller 가 임의 payload 를 넘길 수 있도록 `AgentTask.input` JSON 과 wakeup `payload` 에 머지된다. 새 caller 는 위 first-class column 을 쓴다.

`AgentTrace` 조회 (`agent-trace.service.ts`) 는 항상 tenant scope 로 묶인다:
- `agentTask.findFirst({ id, companyId })` — task 자체 tenant 검증
- `workflowRun.findFirst({ id: task.workflowRunId, companyId })` — task 의 workflowRunId 가 가리키는 run 도 동일 tenant 인지 이중 확인 (bare `findUnique` 금지)
- `heartbeatRun.findMany({ id: { in }, companyId })` / `agentEvent.findMany({ runId: { in }, companyId })` — IN 쿼리에도 companyId binding

## "No silent model fallback" vs "Adapter fallback chain"

비슷해 보이지만 다른 두 규칙이다.

**No silent model fallback** (root AGENTS.md Cross-Domain Rules)
- LLM 모델 식별자에 한정된 규칙. 호출 시점에 모델이 미지정이면 silent default (`model = model or 'claude-haiku'` 같은 패턴) 를 만들지 말 것.
- 모델은 명시적으로 정해지거나 실패해야 한다. 잘못된 모델로 조용히 빌링되는 것을 막는다.

**Adapter fallback chain** (#6, `automation/adapter/out/agent-runtime/fallback-chain.ts`)
- 어댑터 (= 실행 런타임: Claude CLI / Python HTTP / 다른 SDK 래퍼) 레벨의 레질리언스.
- `AgentDefinition.fallbackChain: String[]` 에 명시된 어댑터들을 순서대로 시도. 첫 번째가 process exit / network error 로 실패 → 다음 어댑터.
- 모델 선택과 무관하다. 같은 모델을 다른 런타임으로 부르는 것 (예: `claude_local` ↔ `python_http`).
- 매 fallback 발생 시 `agent.fallback` 이벤트 emit — silent 가 아니라 observable 하다. operator 가 보고 트리거 처리 가능.

요약: model 은 explicit, adapter 는 chain (단 chain 도 observable).

## Patterns

### 1. Strategy — AdapterModule

Add new runtimes (HTTP, Python, etc.) by implementing an adapter only.

```
automation/adapter/out/agent-runtime/types.ts      — ExecutionContext (Readonly) + AdapterModule interface
automation/adapter/out/agent-runtime/registry.ts   — type → implementation Map
automation/adapter/out/agent-runtime/claude-local/ — Claude CLI spawn implementation
```

Adding an adapter: implement `automation/adapter/out/agent-runtime/{name}/execute.ts`
→ register in `registry.ts` Map. Done.

### 2. Observer/Pub-Sub — EventEmitter2 + SSE

Agent state changes → emit events → SSE to frontend.

Three event types (`events/agent-events.ts`):
- `agent.status.changed` — running/succeeded/failed/paused/idle transitions
- `agent.budget.warning` — 80%/95%/100% budget thresholds
- `agent.auto.paused` — auto-pause after 3 consecutive failures

**Rule:** Every new state transition must include `eventEmitter.emit(AGENT_EVENTS.STATUS_CHANGED, ...)`.

### 3. Async Generator — Manager Workflow

Manager orchestrates specialists with human-in-the-loop approval.

```
startWorkflow() → executeUntilPause() → stops at approval_needed → persist to DB
resumeWorkflow() → approve/reject → execute remaining steps
```

States: `running` → `awaiting_approval` → `running` → `completed` / `failed` / `cancelled`

### 4. Feature Gate — DB-Based Runtime Gate

Check `FeatureGateService.isEnabled('agent:{type}', companyId)` before agent execution.

- No gate in DB → default **allow** (backward compatible)
- `enabled: false` → block
- `enabled: true` + `allowedCompanies: []` → allow all
- `enabled: true` + `allowedCompanies: ['uuid']` → specific companies only
- Gate naming: `agent:{type}`

### 5. Immutable ExecutionContext

All `ExecutionContext` properties are `readonly`. `Object.freeze()` applied in heartbeat assembly.

```typescript
// ✗ Never mutate ctx directly
ctx.sessionId = undefined;

// ✓ Create new object + freeze
const retryCtx: ExecutionContext = { ...ctx, sessionId: undefined };
Object.freeze(retryCtx);
```

## Error Recovery Cascade

```
Execution failure
  → session conflict? → retry with new ctx (no session)
  → consecutive failure? → AgentRuntimeState.consecutiveFailCount++
  → 3 consecutive? → auto-pause (pauseReason: 'consecutive_failures(N)')
  → success? → consecutiveFailCount = 0 reset
  → resumeAgent()? → reset both consecutiveFailCount + lastFailedAt
```

## Cost Warning Levels

| Ratio | Action |
|---|---|
| < 80% | Normal |
| >= 80% | Warning event (warn) |
| >= 95% | Urgent warning event (error) |
| >= 100% | Block execution (error) |

Applied in two places: `heartbeat.service.ts:wakeAgent()` +
`automation/application/service/agent-run.service.ts:run()`

## Phase 3 Patterns (2026-04-13)

### 6. Token Escalation (#21)

출력이 `maxOutputTokens`에 잘리면 (stop_reason=max_tokens) 자동 2배 확장 후 재실행. 최대 65536, 1회만.

- `AgentDefinition.maxOutputTokens` (default 16000)
- `claude-local/execute.ts` — `--max-tokens` 플래그 전달
- `heartbeat.service.ts` — truncation 감지 → escalated ctx 생성 → 재실행

### 7. Dynamic Cron (#30)

에이전트가 output에 `nextSchedule` 포함 → 해당 에이전트의 cron timer만 교체.

- `heartbeat.service.ts:replaceAgentTimer()` — per-agent timer 교체 (syncTimers() 미호출, race-free)
- `HeartbeatRun.nextSchedule` — 에이전트가 반환한 cron 문자열 기록
- 공통 output 스키마에 `nextSchedule: z.string().optional()` 포함

### 8. Permission Hierarchy (#8)

5-layer 퍼미션 해석: global → company → agentType → instance → runtime.

```
permissions/hierarchy.validator.ts
  resolvePermissions(layers) → { allowedTools, deniedSkills, permissionMode }
  - deniedSkills: UNION (누적)
  - allowedTools: INTERSECTION (교집합, 가장 제한적)
  - permissionMode: 마지막 non-undefined 레이어 우선
```

`delegation/hierarchy.validator.ts`와는 별개 관심사 (delegation = "누가 누구에게 위임", permission = "어떤 도구 사용 가능").

### 9. Adapter Streaming (#4)

`AdapterModule.execute()` → `AsyncGenerator<StreamEvent, ExecutionResult>`.

```
automation/adapter/out/agent-runtime/types.ts
  StreamEvent: { type: 'token_count' | 'content' | 'error', data: unknown }
  collectResult(gen): Promise<ExecutionResult>  — 기존 호환 헬퍼
```

- `claude-local/execute.ts` — `--output-format stream-json`, 라인별 이벤트 yield
- `python-http/execute.ts` — 단일 이벤트 yield (호환성)
- Diminishing returns: 연속 3회 delta < 500 tokens → 조기 중단 (미래 연결)

### 10. Model Fallback (#6)

Adapter 실패 시 체인 순서대로 다음 adapter 시도.

```
automation/adapter/out/agent-runtime/fallback-chain.ts
  executeFallbackChain(adapterTypes[], ctx, eventEmitter)
  - 에러 계약: 첫 번째 adapter의 에러 타입 throw (3-strike cascade 호환)
  - 성공 시 agent.fallback 이벤트 발행
```

- `AgentDefinition.fallbackChain` (String[], default ["claude_local"])
- HeartbeatService의 4개 실행 경로 모두 fallback chain 경유

### 11. Smart Classifier (#12)

도구 접근 규칙 기반 분류. v1은 LLM 없이 규칙만.

```
permissions/classifier.ts
  classifyToolRequest(tool, resolved) → 'allow' | 'deny'
  filterTools(tools, resolved) → string[]
  - deniedSkills 매칭 → deny (와일드카드 지원)
  - allowedTools 화이트리스트 → 목록에 없으면 deny
  - 빈 allowedTools → 전부 allow (permissive default)
```

`safety/skill-filter.service.ts:filterWithClassifier()` — 기존 필터 + classifier 통합.

## Phase 4 Patterns (2026-04-13, 인프라만)

### 12. Selective Result Clearing (#10)

오래된 실행 결과를 규칙 기반 요약으로 압축, 스토리지 절감.

```
lifecycle/result-cleanup.service.ts
  cleanupAgent(agentId, retentionDays) — retentionDays 초과 → 요약 생성 + excerpts null
  cleanupAll() — 전체 에이전트 정리 (daily cron 연결 준비)
  generateSummary(resultJson, errorCode) — 규칙 기반 (LLM 없음)
```

- `AgentDefinition.resultRetentionDays` (default 30)
- `HeartbeatRun.isSummarized` + `summary` 필드

### 13. Message Compression (#3, 인프라만)

멀티턴 컨텍스트 압축. 실제 연결은 미래.

```
context-manager/compressor.service.ts
  buildCompressedContext(agentId, maxTokens) → string
  - Layer 1 (최근 3개): full resultJson
  - Layer 2 (4~10번째): summary만
  - Layer 3 (11+): 스킵
  - Layer 4: 토큰 예산 내 truncation
```

- `AgentDefinition.contextStrategy` (default "single-shot", 미래 "multi-turn")
- `ContextManagerModule` → agent-registry.module에 등록

## Module Structure

```
automation/application/service/
  agent-crud.service.ts            — catalog/tenant-owned CRUD + org tree
  agent-run.service.ts             — AgentTask creation + heartbeat wakeup boundary
  agent-lifecycle.service.ts       — run lookup/history/runtime state/pause/resume/session reset
  agent-cost-analytics.service.ts  — budget reset + cost analytics raw SQL
automation/adapter/out/agent-runtime/
  types.ts              — ExecutionContext, StreamEvent, AsyncGenerator, collectResult
  registry.ts           — adapter Map + getFallbackChain()
  fallback-chain.ts     — #6 fallback execution
  claude-local/         — Claude CLI (stream-json)
  python-http/          — HTTP adapter
permissions/            — #8 + #12
  hierarchy.validator.ts — 5-layer resolver
  classifier.ts         — rule-based tool classifier
  permissions.module.ts
context-manager/        — #3
  compressor.service.ts — 4-layer context compression
  context-manager.module.ts
lifecycle/              — #10 + retry + transcript
  result-cleanup.service.ts — selective clearing
  retry.service.ts
  transcript.service.ts
  lifecycle.module.ts
```

## Modification Map

| When modifying | Also check |
|---|---|
| `automation/adapter/out/agent-runtime/types.ts` (ExecutionContext, StreamEvent) | `heartbeat.service.ts` (ctx assembly + freeze), 모든 adapter execute(), `fallback-chain.ts` |
| `heartbeat.service.ts` (constructor) | `__tests__/heartbeat.service.spec.ts` (mock args), `agent-registry.module.ts` (providers) |
| `seed-agents.ts` (agent type) | `schemas/agent-output-schemas.ts` (Zod schema + AGENT_OUTPUT_SCHEMAS map) |
| `events/agent-events.ts` (events) | `events/agent-sse.service.ts` (@OnEvent), `apps/web/src/hooks/useAgentEvents.ts` |
| `prisma/schema.prisma` (Agent-related) | `packages/shared/src/schemas/agent.ts`, run `npx prisma generate` |
| `automation/application/service/agent-run.service.ts` budget logic | `heartbeat.service.ts:wakeAgent()` (keep identical pattern) |
| `automation/application/service/agent-lifecycle.service.ts:resumeAgent()` | Verify failCount reset code is preserved |
| `permissions/hierarchy.validator.ts` | `heartbeat.service.ts` (resolvePermissions), `classifier.ts` |
| `automation/adapter/out/agent-runtime/fallback-chain.ts` | `heartbeat.service.ts` (4개 실행 경로 모두 fallback chain 경유) |
| `context-manager/compressor.service.ts` | `lifecycle/result-cleanup.service.ts` (summary 필드 의존) |
| `lifecycle/result-cleanup.service.ts` | `heartbeat.service.ts:runDailyCleanup()` |

## Adding a New Agent

1. Add definition in `seed-agents.ts` (or register dynamically via `POST /api/agent-registry`)
2. Write rules file in `agent-config/rules/{name}.md`
3. Add result Zod schema in `schemas/agent-output-schemas.ts` + register in `AGENT_OUTPUT_SCHEMAS` map
4. If custom post-processing needed → place controller + service under the owner
   business domain (e.g. `advertising/`) or `automation/`, and reach Agent OS
   through `AGENT_RUNNER_PORT`. Do not create `agent-registry/domains/{name}/`.
5. If no custom processing → use generic `receiveResults()`, no extra code needed

## Domain Post-Processing

`agent-registry/domains/` no longer exists. Both former post-processing surfaces
moved out to their owner domain and now reach Agent OS through
`AGENT_RUNNER_PORT` (`AutomationModule`):

- `manager` (`@Controller('manager')`, `/api/manager/*`) — moved to automation
  in AO-3B: `apps/server/src/automation/adapter/in/http/manager.controller.ts`
  + `apps/server/src/automation/application/service/agent/manager.service.ts`.
  Manager + workflow (Async Generator) lifecycle preserved.
- `ad-strategy` (`@Controller('ad-agent')`, `/api/ad-agent/*`) — moved to
  advertising in AO-3C: `apps/server/src/advertising/adapter/in/http/ad-strategy-agent.controller.ts`
  + `apps/server/src/advertising/application/service/ad-strategy-agent.service.ts`.

New custom post-processing surfaces follow the same pattern: place them under
the owner business domain or `automation`, and call Agent OS through ports.
Adding a new `agent-registry/domains/{name}/` folder is rejected during review.

## Agent Data Access

- Agents use `psql "$AGENT_DATABASE_URL"` for DB queries (read-only role: `chatbot_readonly`, scoped by `app.company_id` RLS)
- `AGENT_DATABASE_URL` is injected via ExecutionContext env. 프롬프트에서 `$AGENT_DATABASE_URL`로 직접 참조.
- Prompts are loaded from `agent-config/prompts/agents/{type}.md` files (git-tracked)
- DB `prompt_template` stores file path (e.g., 'agent-config/prompts/agents/ad-strategy.md')
- Operational params (company_id, task_id, dry_run) are still {{key}} substituted
- Business data is NOT injected — agents query autonomously

## Prohibited

- Mutating ExecutionContext directly → create new object + Object.freeze
- Modifying budget check in only one place → keep wakeAgent + run in sync
- State transitions without events → every status change must include eventEmitter.emit
- Adding agent type without Zod schema → must register in agent-output-schemas.ts
- Not persisting workflow state to DB → resume impossible after server restart
- Caching feature gate results → always query DB (guarantee real-time toggle)
