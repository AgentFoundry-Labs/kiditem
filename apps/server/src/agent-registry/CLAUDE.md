# agent-registry — Agent OS

Agent orchestration platform. Claude CLI spawn-based.

## Patterns

### 1. Strategy — AdapterModule

Add new runtimes (HTTP, Python, etc.) by implementing an adapter only.

```
adapters/types.ts      — ExecutionContext (Readonly) + AdapterModule interface
adapters/registry.ts   — type → implementation Map
adapters/claude-local/ — Claude CLI spawn implementation
```

Adding an adapter: implement `adapters/{name}/execute.ts` → register in `registry.ts` Map. Done.

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

Applied in two places: `heartbeat.service.ts:wakeAgent()` + `agent-registry.service.ts:run()`

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
adapters/types.ts
  StreamEvent: { type: 'token_count' | 'content' | 'error', data: unknown }
  collectResult(gen): Promise<ExecutionResult>  — 기존 호환 헬퍼
```

- `claude-local/execute.ts` — `--output-format stream-json`, 라인별 이벤트 yield
- `python-http/execute.ts` — 단일 이벤트 yield (호환성)
- Diminishing returns: 연속 3회 delta < 500 tokens → 조기 중단 (미래 연결)

### 10. Model Fallback (#6)

Adapter 실패 시 체인 순서대로 다음 adapter 시도.

```
adapters/fallback-chain.ts
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
adapters/
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
| `adapters/types.ts` (ExecutionContext, StreamEvent) | `heartbeat.service.ts` (ctx assembly + freeze), 모든 adapter execute(), `fallback-chain.ts` |
| `heartbeat.service.ts` (constructor) | `__tests__/heartbeat.service.spec.ts` (mock args), `agent-registry.module.ts` (providers) |
| `seed-agents.ts` (agent type) | `schemas/agent-output-schemas.ts` (Zod schema + AGENT_OUTPUT_SCHEMAS map) |
| `events/agent-events.ts` (events) | `events/agent-sse.service.ts` (@OnEvent), `apps/web/src/hooks/useAgentEvents.ts` |
| `prisma/schema.prisma` (Agent-related) | `packages/shared/src/schemas/agent.ts`, run `npx prisma generate` |
| `agent-registry.service.ts:run()` budget logic | `heartbeat.service.ts:wakeAgent()` (keep identical pattern) |
| `agent-registry.service.ts:resumeAgent()` | Verify failCount reset code is preserved |
| `permissions/hierarchy.validator.ts` | `heartbeat.service.ts` (resolvePermissions), `classifier.ts` |
| `adapters/fallback-chain.ts` | `heartbeat.service.ts` (4개 실행 경로 모두 fallback chain 경유) |
| `context-manager/compressor.service.ts` | `lifecycle/result-cleanup.service.ts` (summary 필드 의존) |
| `lifecycle/result-cleanup.service.ts` | `heartbeat.service.ts:runDailyCleanup()` |

## Adding a New Agent

1. Add definition in `seed-agents.ts` (or register dynamically via `POST /api/agent-registry`)
2. Write rules file in `agent-config/rules/{name}.md`
3. Add result Zod schema in `schemas/agent-output-schemas.ts` + register in `AGENT_OUTPUT_SCHEMAS` map
4. If custom post-processing needed → create `domains/{name}/` (controller + service)
5. If no custom processing → use generic `receiveResults()`, no extra code needed

## Domain Post-Processing

- `domains/ad-strategy/` — Ad strategy. `@Controller('ad-agent')`.
- `domains/manager/` — Manager + workflow (Async Generator). `@Controller('manager')`.

## Agent Data Access

- Agents use `psql "$AGENT_DATABASE_URL"` for DB queries (read-only role: agent_reader)
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
