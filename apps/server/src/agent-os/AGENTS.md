# Agent OS

Agent OS owns agent blueprints, organization-scoped instances, durable run
requests, run execution, tool policy, approvals, cost ledger, and run
observability. It replaces the legacy `AgentDefinition + AgentTask +
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
- Tool permission uses blueprint default policy plus instance override.
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
provider. Until a provider adapter (Claude CLI / Python HTTP / hosted
gateway) replaces the default `LocalRuntimeAdapter`, every claimed request
fails fast with `runtime_not_configured`:

- `AgentRun.errorCode = 'runtime_not_configured'`
- `AgentRunRequest.lastErrorCode = 'runtime_not_configured'`

This is intentional — silent stub success would mask a deployment gap and
let consumers (sourcing detail-page generator, image edit, ad-strategy)
poll forever on empty output. Real adapters must be wired before consumer
HTTP routes are reopened beyond their current draft state.

For isolated unit/integration runs that need the queue path exercised
without a provider, set `AGENT_RUNTIME_ALLOW_NOOP=1` in `.env`. Never set
this in shared environments.

## Worker contract

`AgentRunWorker` (`application/service/agent-run-worker.service.ts`) is an
in-process timer that drains the queue by calling
`AgentRunExecutor.executeNextUnscoped(workerId)` on each tick. Without it,
requests enqueued via `AgentRunnerPort` would sit `pending` forever
(historic behaviour: the HTTP `claim-and-run` route is per-organization and
was meant to be called by an external orchestrator that never shipped).

Defaults:

- Enabled in dev/prod, disabled in `NODE_ENV=test` (vitest sets that
  automatically). Override with `AGENT_RUNTIME_WORKER_ENABLED=0|1`.
- Tick every `AGENT_RUNTIME_WORKER_INTERVAL_MS` (default `2000`). Setting
  `0` disables the timer.
- Single in-flight tick at a time (`busy` guard) so a slow runtime call
  does not stack ticks.
- Errors are caught and logged so a bad request does not stop the loop.

Multi-instance: `claimNextRunRequest` uses `FOR UPDATE SKIP LOCKED`, so
multiple replicas are safe. KidItem runs a single backend instance today;
the worker scales naturally if that changes.

The HTTP `POST /api/agent-os/executor/claim-and-run` route stays for
explicit per-organization triggers (ops drains, tests, panel debug). It
does not replace the worker — it complements it.

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

## Bootstrap

Fresh DBs need at least one `AgentBlueprint` per shipped agent type and one
`AgentInstance` per organization, otherwise every consumer hits
`agent_instance_not_found`. Run `npm run seed:agent-os` after `db:push`.
The seed reads default model from `AGENT_<TYPE>_MODEL` per blueprint with
`AGENT_DEFAULT_MODEL` as a single shared fallback (and throws if neither
is set — no silent default).

Currently seeded agent types: `manager`, `rules_evaluation`, `rules_suggest`,
`ad_strategy`, `thumbnail_analyst`, `image_edit`, `thumbnail_auto_edit`,
`detail_page_generate`, `thumbnail_generate`, `chat`. The two `*_generate`
types are Phase 1 placeholders — blueprint + prompt + AI bridge skeleton
are wired, but production endpoints (`/api/ai/detail-page/generate`,
`/api/thumbnail-editor/generate`) still run the synchronous AI service
paths until Phase 2 swaps them onto Agent OS.
