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

## Modification Map

| When modifying | Also check |
|---|---|
| `adapters/types.ts` (ExecutionContext fields) | `heartbeat.service.ts` (ctx assembly + freeze), `claude-local/execute.ts` (field usage) |
| `heartbeat.service.ts` (constructor) | `__tests__/heartbeat.service.spec.ts` (mock args), `agent-registry.module.ts` (providers) |
| `seed-agents.ts` (agent type) | `schemas/agent-output-schemas.ts` (Zod schema + AGENT_OUTPUT_SCHEMAS map) |
| `events/agent-events.ts` (events) | `events/agent-sse.service.ts` (@OnEvent), `apps/web/src/hooks/useAgentEvents.ts` |
| `prisma/schema.prisma` (Agent-related) | `packages/shared/src/schemas/agent.ts`, run `npx prisma generate` |
| `agent-registry.service.ts:run()` budget logic | `heartbeat.service.ts:wakeAgent()` (keep identical pattern) |
| `agent-registry.service.ts:resumeAgent()` | Verify failCount reset code is preserved |

## Adding a New Agent

1. Add definition in `seed-agents.ts` (or register dynamically via `POST /api/agent-registry`)
2. Write rules file in `agent-config/rules/{name}.md`
3. Add result Zod schema in `schemas/agent-output-schemas.ts` + register in `AGENT_OUTPUT_SCHEMAS` map
4. If custom post-processing needed → create `domains/{name}/` (controller + service)
5. If no custom processing → use generic `receiveResults()`, no extra code needed

## Domain Post-Processing

- `domains/ad-strategy/` — Ad strategy. `@Controller('ad-agent')`.
- `domains/manager/` — Manager + workflow (Async Generator). `@Controller('manager')`.

## Prohibited

- Mutating ExecutionContext directly → create new object + Object.freeze
- Modifying budget check in only one place → keep wakeAgent + run in sync
- State transitions without events → every status change must include eventEmitter.emit
- Adding agent type without Zod schema → must register in agent-output-schemas.ts
- Not persisting workflow state to DB → resume impossible after server restart
- Caching feature gate results → always query DB (guarantee real-time toggle)
