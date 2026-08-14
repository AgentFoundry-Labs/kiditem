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
policy snapshot, the session task, execution, attempt, Operation run, and
canonical event stream are correlated by KidItem resource names. `copilotThreadId`
and `aguiRunId` are opaque transport correlations only; request IDs, runtime
handles, tokens, and raw provider IDs are never accepted in a resource-name
field.

The Operations handler persists an opaque encrypted runtime-handle reference
before it connects. A reclaimed worker inspects that handle before reconnecting
and never creates a replacement external run when the original handle is
unknown. Approval, retry, cancel, progress, artifact, and delegation state are
written to the canonical event/control graph before live publication. Browser
disconnect only detaches its SSE subscriber; it does not cancel the durable
producer.

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
```

The acceptance harness owns and stops only the exact child processes it starts.
It uses disposable PostgreSQL 17 and a deterministic fake runtime, while keeping
the real Nest, gateway, persistence, and browser boundaries.

`smoke-official-recovery.mjs` refuses production-like environments. It runs the
real PostgreSQL detached-runtime recovery test (including persisted opaque
handle reuse and worker recreation) and the gateway restart/reconnect contract.
It does not contact Hermes, Codex, Claude, or a production database/runtime.

## KID-24 boundary caution

Interaction controllers are provisionally wired by `AgentOsModule`. KID-24's
long-running operation module is expected to become the durable operations
owner; move provider wiring only after that branch lands, without deleting or
rewriting InventoryCommitment behavior in this change.
