# Agent OS

Agent OS owns code-owned agent definitions, organization-scoped instances,
durable run requests, run execution, tool policy, approvals, cost ledger, and
run observability. It replaces the legacy `AgentDefinition + AgentTask +
AgentWakeupRequest + HeartbeatRun + AgentEvent` runtime.

## Boundary

- Agent OS is a platform owner domain, not a business-domain module.
- Business domains request work through `AgentRunnerPort` (`AGENT_RUNNER_PORT`).
- Workflows and automation must not call runtime adapters directly.
- Runtime execution belongs behind `application/port/out/*` contracts.
- Prisma access stays in outgoing repository adapters.
- Application services must not import concrete adapters, `PrismaService`,
  Nest HTTP decorators, provider SDKs, filesystem APIs, or workflow internals.

## Data Contracts

- Use `organizationId` on every organization-scoped read and mutation.
- `AgentRunRequest` is the durable inbox and retry/coalescing owner.
- `AgentRun` starts at `running`; queue state belongs to `AgentRunRequest`.
- `AgentRunEvent`, `AgentAuthorizationEvent`, and `AgentCostEvent` remain
  separate ledgers.
- Agent OS ledgers are not a user-facing notification inbox. Runtime telemetry,
  approvals, policy audit, and cost events stay in Agent OS observability.
- User-facing Agent notifications must be projected into `Alert`; the dashboard
  Alerts tab is the single management surface for all alerts.
- `Alert` rows are organization-scoped. Personal work is represented by
  promoting an alert into an `ActionTask`, then using `ActionTask.assigneeUserId`
  / assigned-to filters for "my work" vs organization-wide visibility.
- Tool permission uses code-owned definition policy plus instance override.
- Bulk runtime logs are external; database rows store structured events,
  excerpts, and log references only.
- Cost ledger inserts and `AgentRuntimeState.totalCostMicros` updates run in a
  single transaction.

## Status Machines

```text
AgentRunRequest:
  pending -> claimed -> succeeded
                     -> failed
                     -> cancelled
          -> coalesced
          -> requires_approval -> pending
          -> skipped

AgentRun:
  running -> succeeded
          -> failed
          -> cancelled
```

`AgentRun` MUST start at `running`. Never introduce a `queued` value for
`AgentRun.status`. Queue state belongs to `AgentRunRequest`.

## Verification

- Unit: policy resolution, coordinator decisions, catalog invariants.
- Integration: request claim concurrency (`FOR UPDATE SKIP LOCKED`),
  run-event sequencing, idempotency, cost-ledger aggregate transaction.
- Boot: `npm run dev:server`

## Hard Bans

- No native Postgres enums (use String + Zod validation).
- No `$queryRawUnsafe` / `$executeRawUnsafe`. Tagged Prisma SQL only.
- No silent model fallback (`model = model || default`).
- No frontend direct DB access.
- No `tenantId` naming. Use `Organization` / `organizationId`.

## Runtime adapter contract

`AGENT_RUNTIME_PORT` is the only path the executor uses to invoke a real
provider. The default binding is `RoutingRuntimeAdapter`, which delegates
to per-agent-type handlers registered in `AgentRuntimeHandlerRegistry`.

- Registered handler for `agentType` → adapter forwards `execute(ctx)` and
  returns the handler's `AgentRuntimeResult`.
- No handler for `agentType` → adapter fails fast with
  `runtime_not_configured`:
  - `AgentRun.errorCode = 'runtime_not_configured'`
  - `AgentRunRequest.lastErrorCode = 'runtime_not_configured'`

The fail-fast contract is intentional — silent stub success would mask a
deployment gap and let consumers (sourcing detail-page generator, image
edit, ad-strategy) poll forever on empty output. Owner domains register
their handler when they are ready to serve traffic; until then the queue
fails the request loudly.

Owner domains register handlers via the registry's `register(agentType,
handler)` method, typically from a Nest provider's `onModuleInit`. The
registry lives in `application/service/agent-runtime-handler-registry.service.ts`
and the per-type handler interface is `application/port/out/agent-runtime-handler.port.ts`.
The AI domain ships the first real handler — `detail_page_generate`.

For isolated unit/integration runs that need the queue path exercised
without a handler, set `AGENT_RUNTIME_ALLOW_NOOP=1` in `.env`. The routing
adapter then returns a synthetic stub result. Never set this in shared
environments — the synthetic output is empty and downstream sinks cannot
apply it.

## Worker contract

`AgentRunWorker` (`application/service/agent-run-worker.service.ts`) is an
in-process timer that drains the queue by calling
`AgentRunExecutor.executeNextUnscoped(workerId)` on each tick. Without it,
requests enqueued via `AgentRunnerPort` sit `pending` until the HTTP
`claim-and-run` route is invoked.

**Default: disabled. Explicit opt-in only.** The default `LocalRuntimeAdapter`
fail-fasts every claim with `runtime_not_configured`. Auto-enabling the
worker under that adapter would silently flip every existing Agent OS
consumer (`/api/image-ai/edit`, rules evaluation, advertising strategy,
sourcing scrape) from "request stays pending" to "request fails fast" — a
production semantic change that does not belong in any PR labelled
"production endpoints unchanged". The operator turns the worker on
explicitly via `AGENT_RUNTIME_WORKER_ENABLED=1` once a real runtime
adapter is bound.

Configuration:

- `AGENT_RUNTIME_WORKER_ENABLED=1|true` enables the timer (default
  disabled regardless of `NODE_ENV`). `0` / unset / empty keep it off.
- `AGENT_RUNTIME_WORKER_INTERVAL_MS` overrides the tick interval (default
  `2000`). Setting `0` disables the timer.

Behavior when enabled:

- Single in-flight tick at a time (`busy` guard) so a slow runtime call
  does not stack ticks.
- Empty-queue ticks (`no_pending_request`) are silent — idle queue is
  normal.
- Runtime exceptions are caught and logged so a bad request does not stop
  the loop.

Multi-instance: `claimNextRunRequest` uses `FOR UPDATE SKIP LOCKED`, so
multiple replicas are safe. KidItem runs a single backend instance today;
the worker scales naturally if that changes.

The HTTP `POST /api/agent-os/executor/claim-and-run` route stays for
explicit per-organization triggers (ops drains, tests, panel debug). It
does not replace the worker — it complements it, and is also the supported
"how do I drain manually before the worker is opted in" surface.

Owner domains that need immediate user-visible progress may call
`AgentRunnerPort.executeRequest({ organizationId, requestId })` right after
`runByType` succeeds. This claims only that specific pending request through
the same executor path; it does not enable the global worker or drain unrelated
queues.

## AI domain bridge contract

The Agent OS executor never updates downstream domain rows. The AI domain
owns its agent output contracts and listens for the global
`agent.run.finalized` event:

- Output schemas (Zod) live in
  `apps/server/src/ai/domain/agent-output/*.schema.ts` per agent type.
- Bridges live in
  `apps/server/src/ai/application/service/*-agent-output.bridge.ts`,
  filter the event, validate the output, and call a sink port.
- Sink ports
  (`apps/server/src/ai/application/port/out/*-agent-output-sink.port.ts`)
  isolate the DB write surface. Phase 1 ships no-op adapters; Phase 2
  swaps them for real `ContentGeneration` / `ThumbnailGeneration` writers
  via a one-line `useClass` change.
- Schema-invalid outputs are routed to the sink as `applyFailure` with
  `errorCode='agent_output_invalid'`. The bridge never throws at the bus
  level so listeners outside the AI domain (operation alerts) keep firing.

When adding a new AI agent type, register its schema in
`ai/domain/agent-output/index.ts` (`AI_AGENT_OUTPUT_SCHEMAS`) and add a
bridge that subscribes to FINALIZED. Do not invent a per-type event name
on the bus — there is one finalized event for the whole platform.

### Event routing metadata

`AgentRunFinalizedEvent` carries `agentType`, `source`, `sourceResourceType`,
and `sourceResourceId` in addition to the request/run identifiers. Listeners
**must filter on `agentType`**, not on the in-band `output` payload, because
failure events have no output. Routing the failure path symmetrically with
the success path is the whole reason the metadata moved from an
`output.__envelope` convention onto the bus payload.

## Recovery contract

The bus event is **hot-path only**. `AgentRun.output` (succeeded) /
`AgentRun.errorCode` + `AgentRunRequest.lastErrorCode` (failed) are the
durable record. Listeners (operation-alert bridge, AI bridges) treat the
event as a best-effort kick to apply downstream side effects, never as the
source of truth.

Loss modes the executor and listeners do **not** prevent on their own:

- Process restart between `repository.finalizeRun(...)` and a slow
  listener's sink call.
- Listener exception that the bridge swallows (intentional — bridges must
  not crash the bus).
- Event bus drop in a future multi-instance / external-bus deployment.

Phase 2 recovery contract for AI domain rows
(`ContentGeneration` / `ThumbnailGeneration`):

1. Producer side stamps `AgentRunRequest.sourceResourceType` +
   `sourceResourceId` with the downstream row's primary key when enqueuing.
2. The bridge sink updates the downstream row keyed on
   `sourceResourceId` when the bus event fires.
3. A reconcile job (separate Phase 2 follow-up) reads
   `AgentRunRequest`s in terminal state (`succeeded`/`failed`) joined to
   the downstream row by `sourceResourceId`, and replays the sink for any
   row that is still in a non-terminal state (`PROCESSING` for
   `ContentGeneration`, `pending`/`running` for `ThumbnailGeneration`).
4. The reconcile job is the only thing that may bypass the event bus. It
   reads `AgentRun.output` and feeds it through the same Zod schema +
   sink port so the recovery code path is the same as the hot path.

Phase 1 ships only steps 1 and 2's wiring (sink port + no-op adapter).
Step 3's reconcile job and step 4's replay surface land with the Phase 2
producer flip.

## Bootstrap

Fresh DBs need one `AgentInstance` per shipped code-owned definition and
organization, otherwise every consumer hits `agent_instance_not_found`. Run
`npm run seed:agent-os` after `db:push`. The seed reads default model from
`AGENT_<TYPE>_MODEL` per definition with `AGENT_DEFAULT_MODEL` as a single
shared fallback (and throws if neither is set — no silent default).

Currently seeded agent types: `manager`, `rules_evaluation`, `rules_suggest`,
`ad_strategy`, `sourcing`, `thumbnail_analyst`, `image_edit`, `thumbnail_auto_edit`,
`detail_page_generate`, `thumbnail_generate`, `chat`. Fixed one-call AI jobs
that do not yet plan dynamically are classified as `tool_wrapper` definitions;
true agents remain reserved for subjects with flexible action selection.
