# Agent OS

Agent OS is the platform owner for code-owned agent definitions,
organization-scoped instances, durable run requests, execution attempts, tool
policy, approvals, cost ledger, and run observability.

Agent OS is a platform owner, not a business aggregate owner. Runtime, queue,
repository, and event boundaries stay behind application ports and outgoing
adapters. Business side effects belong to owner-domain sinks.

## Boundary

- Business domains request work only through `AgentRunnerPort`
  (`AGENT_RUNNER_PORT`).
- Runtime execution belongs behind `application/port/out/*` contracts.
- Agent OS does not update downstream business rows. Owner domains listen for
  finalized runs and apply their own side effects.
- Prisma access stays in outgoing repository adapters.
- Application services must not import concrete adapters, `PrismaService`,
  Nest HTTP decorators, provider SDKs, filesystem APIs, or workflow internals.

## Data Contracts

- Every organization-scoped read/write includes `organizationId`.
- `AgentRunRequest` is the durable inbox, queue, retry, and coalescing owner.
- `AgentRun` records one accepted execution attempt and starts at `running`.
  Queue state does not belong in `AgentRun.status`.
- `AgentRunEvent`, `AgentAuthorizationEvent`, and `AgentCostEvent` are separate
  ledgers.
- Cost ledger inserts and `AgentRuntimeState.totalCostMicros` updates happen in
  one transaction.
- Agent OS ledgers are not a user notification inbox. User-facing signals are
  projected to `Alert`; personal work is `Alert -> ActionTask`.

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

Never add `queued` to `AgentRun.status`.

## Runtime Adapter

`AGENT_RUNTIME_PORT` is the executor's only provider path. The default binding
is `RoutingRuntimeAdapter`, which dispatches to handlers registered in
`AgentRuntimeHandlerRegistry`.

- Handler registered for `agentType` -> execute and return the handler result.
- No handler -> fail fast with `runtime_not_configured` on both
  `AgentRun.errorCode` and `AgentRunRequest.lastErrorCode`.
- Owner domains register handlers from Nest providers, usually in
  `onModuleInit`.
- `AGENT_RUNTIME_ALLOW_NOOP=1` is allowed only for isolated tests that need an
  empty synthetic runtime result. Never set it in shared environments.

## Worker

`AgentRunWorker` drains the queue by calling
`AgentRunExecutor.executeNextUnscoped(workerId)`.

- Default disabled. Enable explicitly with `AGENT_RUNTIME_WORKER_ENABLED=1`.
- `AGENT_RUNTIME_WORKER_INTERVAL_MS` controls the tick interval; `0` disables.
- One in-flight tick at a time.
- Empty queue is silent.
- Runtime exceptions are caught and logged.
- Multi-instance safe: claim uses `FOR UPDATE SKIP LOCKED`.

`POST /api/agent-os/executor/claim-and-run` remains the manual drain/debug
surface and does not replace the worker.

## Finalized Event Contract

The executor emits one global `agent.run.finalized` event. The event includes
`agentType`, `source`, `sourceResourceType`, and `sourceResourceId`; listeners
filter on metadata, not on in-band output payload, because failed runs may have
no output.

Owner domains should implement:

1. Zod input/output schema in their domain.
2. Runtime handler registered with `AgentRuntimeHandlerRegistry`.
3. Bridge that filters `agentType`, validates output, and calls a sink port.
4. Sink adapter that applies domain row updates idempotently.
5. Reconcile service that replays terminal runs through the same schema + sink
   path for rows still stuck in non-terminal state.

Bridges must route schema-invalid output to the sink as
`errorCode='agent_output_invalid'`; they must not throw at the event-bus level.

## Recovery

The bus event is a hot-path kick only. Durable truth is:

- success: `AgentRun.output`
- failure: `AgentRun.errorCode` and `AgentRunRequest.lastErrorCode`
- routing: `AgentRunRequest.sourceResourceType/sourceResourceId`

Reconcile jobs are the only code path that bypasses the event bus, and they
must feed terminal run data through the same output schema and sink port used by
the bridge.

Owner domains that need immediate user-visible progress may call
`AgentRunnerPort.executeRequest({ organizationId, requestId })` right after
`runByType` succeeds. This claims only that specific pending request through the
same executor path; it does not enable the global worker or drain unrelated
queues.

## Bootstrap

Fresh DBs need one `AgentInstance` per shipped code-owned definition and
organization.

```bash
npm run seed:agent-os
```

The seed reads `AGENT_<TYPE>_MODEL` or `AGENT_DEFAULT_MODEL` and throws if no
model is configured. Current shipped types include `manager`,
`rules_evaluation`, `rules_suggest`, `ad_strategy`, `sourcing`,
`thumbnail_analyst`, `image_edit`, `thumbnail_auto_edit`,
`detail_page_generate`, `thumbnail_generate`, and `chat`.

## Verification

```bash
npm exec --workspace=apps/server -- vitest run src/agent-os
npm run build --workspace=apps/server
npm run dev:server
```

Use integration tests when changing claim concurrency, event sequencing,
idempotency, cost aggregation, or owner-domain sink/reconcile contracts.
