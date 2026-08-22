# Agent Interaction Platform Runbook

KidItem uses CopilotKit OSS v2 and AG-UI for the interaction surface. KidItem
PostgreSQL is the source of truth for sessions, executions, conversation events,
outbox delivery, replay, and reconnect. No CopilotKit Premium or Enterprise
thread service is required.

## Runtime shape

```text
browser /api/copilotkit
  -> Next server-only rewrite
  -> interaction gateway
  -> Nest authorize/dispatch/replay/live boundary
  -> deterministic or configured AG-UI runtime
  -> PostgreSQL canonical graph and outbox
```

Opening the panel, choosing an agent, starting an empty conversation, reading
history, reconnecting, or reloading must perform no control write. The browser
creates an external thread UUID locally; Nest creates `AgentSession` and the
first execution only on first submit. An existing session locks its primary
agent. Replay is read-only and a terminal replay completes so a later run is not
blocked; a live join is held only while KidItem has an active grant.

## Durable task controls

AgentOS owns durable work independently from CopilotKit. An `AgentVersion`, its
policy snapshot, the session task, execution, immutable attempt, immutable
OperationRun envelope, and canonical event stream are correlated by KidItem
resource names. `copilotThreadId` and `aguiRunId` are opaque transport
correlations only; request IDs, runtime handles, tokens, and raw provider IDs
are never accepted in a resource-name field.

The Operations handler persists an opaque encrypted runtime-handle reference
before it connects. The `AgentExecutionAttempt` owns that stable external
handle; it is never replaced merely because an Operations envelope is
cancelled. Each envelope is a distinct immutable `OperationRun` connected to
the attempt by an explicit binding. A continuation atomically creates a
successor queued envelope, binding, and initial handle checkpoint, with a
recorded predecessor and an organization/attempt-scoped continuation key. It
never requeues or resurrects the predecessor. Lifecycle recovery runs only
after the Operations lifecycle gate accepts work: candidate discovery first
deterministically selects the current/latest binding for each attempt, then
applies the lifecycle-cancellation predicate and bounded batch limit. The
selected binding supplies the recorded predecessor for its successor.

Approval, retry, cancel, progress, artifact, and delegation state are written
to the canonical event/control graph before live publication. An approval
stores its exact immutable source binding/run when requested; approval
continuation never infers that predecessor from a latest-binding query. For an
approved HITL request, first persist the decision and its outbox record, then
create the approval-keyed successor envelope and persist interrupt-delivery
state before issuing the exact-handle runtime interrupt. Those writes are
idempotent. On API
startup, pending conversation outbox and interrupt deliveries are retried from
their durable state; a delivery failure must not reverse the decision, mutate a
predecessor envelope, or start a second external run. Browser disconnect only
detaches its SSE subscriber; it does not cancel the durable producer.

Agent runtime versions are immutable. Publishing an identical manifest reuses
the active version, while a changed manifest creates a later version and retires
the previous active row. Existing sessions remain pinned to the version selected
on their first submit.

## Safe UI and analytics

Only the strict shared renderer kinds are accepted. Renderers use a static map;
model output cannot select components, CSS, raw URLs, or actions. Navigation is
an `actionId` minted by Nest and reauthorized against the current actor/version
before returning an allowlisted href. Suggested replies are latest-message only,
bounded to three, and consume all siblings after one send.

Product analytics is metadata-only. Allowed fields are hashed organization,
session/execution identifiers, agent key, surface, duration, outcome, and
renderer kinds. Never emit message or model output, resource names, dashboard
payloads, tokens, cookies, or raw organization/user identifiers. Analytics sink
failure never changes the canonical run result.

## Readiness and verification

Probe Nest interaction health and gateway `/health/ready` before sending browser
traffic. A gateway readiness failure is authoritative: do not bypass it or point
the browser directly at Nest replay endpoints.

```bash
npm run build --workspace=apps/server
npm run build --workspace=apps/interaction-gateway
npm run build --workspace=apps/web
npx playwright test apps/web/e2e/agent-session-interaction.spec.ts
npx playwright test apps/web/e2e/interaction-os/durable-session.spec.ts
node deploy/interaction-gateway/smoke-official-recovery.mjs
node scripts/verify-agent-session-deletion-process-roots.mjs
```

The acceptance harness owns and stops only the exact child processes it starts.
It uses disposable PostgreSQL 17 and a deterministic fake runtime, while keeping
the real Nest, gateway, persistence, and browser boundaries.

Official Hermes runtime output cannot carry inline artifact bytes. Its only
artifact-adjacent output contract is a canonical `resource_ref`; a provider
`artifact_candidate` is rejected before writer, database, or storage work.
Deletion acceptance may use a narrow fake solely to control deletion erase
state. That fake is not evidence that production storage supports artifact
materialization.

For complete-deletion launch verification, use only the bounded process-root
verifier. It creates one labelled disposable PostgreSQL 17 container, verifies
its identity before `db push --accept-data-loss`, and removes only that exact
container plus the child PIDs/listeners it recorded. Do not point it at
`kiditem-postgres` or `kiditem-minio`; there is no backfill and the release
train `VERSION` remains unchanged.

`smoke-official-recovery.mjs` refuses production-like environments. It builds
the exact server, gateway, and web artifacts, then runs the real browser
harness (gateway restart, reconnect, approval, cancel, and canonical resource
correlation) plus the real PostgreSQL detached-runtime recovery suite
(persisted opaque-handle reuse, immutable OperationRun successor lineage,
approval continuation/outbox retry, and Operations worker/runtime-adapter
recreation). It does not contact Hermes, Codex, Claude, or a production
database/runtime.

## Process-root boundary

The API root is the only owner of the Operations lifecycle. It composes
`AgentOsHttpModule`, whose interaction controllers, guards, HMAC secrets,
AG-UI producers, and Operations-backed session controls wrap the
controller-free `AgentOsModule`. The Agent worker and MCP/CLI roots import only
the controller-free runtime graph: they must boot without interaction HTTP
secrets and must not reach `OperationsModule` transitively. Preserve this split
when adding a runtime, capability, controller, or control service.
