# agent-os — Agent Runtime Platform

`src/agent-os/` owns code-defined agent definitions, organization-scoped agent
instances, durable run requests, execution attempts, tool policy, approvals,
cost ledger, and run observability. It is a platform owner, not a downstream
business aggregate owner.

## Folder Map

```text
agent-os/
├── adapter/in/http/          # run/observability/admin HTTP surfaces
├── adapter/out/              # repository, runtime, policy, event adapters
├── application/
│   ├── event/                # finalized event types/constants
│   ├── port/in/              # runner ports exposed to business domains
│   ├── port/out/             # repository/runtime/event/policy ports
│   └── service/              # queue, executor, runner, observability
└── domain/                   # pure status/policy/schema helpers
```

## Owned Surfaces

- Generic Agent OS run creation and observability APIs under `/api/agent-os/*`
- Manual drain/debug endpoint:
  `POST /api/agent-os/executor/claim-and-run`
- Code-owned agent catalog/bootstrap and runtime handler registration
- Organization-scoped interaction bootstrap, run authorization, AG-UI event
  persistence/replay/live join, and action reauthorization. Current module
  wiring is provisional until KID-24 lands; preserve the boundary contract when
  moving providers.

## Main Data Models

- `AgentInstance` is the organization-owned installed agent.
- `AgentRunRequest` is the durable inbox, queue, retry, and coalescing owner.
- `AgentRun` records one accepted execution attempt and starts at `running`.
- `AgentRunEvent`, `AgentAuthorizationEvent`, and `AgentCostEvent` are separate
  ledgers.
- `AgentRuntimeState` stores aggregate runtime state such as total cost.

## Runtime Flow

```text
business domain
  -> AGENT_RUNNER_PORT.runByType(...)
  -> AgentRunRequest
  -> AgentRunExecutor / worker claim
  -> AGENT_RUNTIME_PORT
  -> registered runtime handler
  -> owner-domain synchronous capability/write
  -> AgentRun terminal state
  -> global agent.run.finalized event
  -> non-authoritative alert/audit listeners
```

Agent OS does not update downstream business rows. When a run requires a
canonical business write, the owner-domain runtime/capability completes that
write before returning success to Agent OS. Finalized listeners are
non-authoritative alert/audit projections and cannot determine run success.
Agent OS may call deterministic automation workflows through automation-owned
incoming ports or registered workflow capabilities; automation must not call
back into Agent OS.

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

Never add `queued` to `AgentRun.status`; queue state belongs to
`AgentRunRequest`.

## Cross-Domain Ports

- Business domains request work through `AGENT_RUNNER_PORT`.
- Agent OS may consume automation-owned incoming ports from adapter/out lanes
  when it needs operation alerts or deterministic workflow execution.
- Runtime execution goes through `AGENT_RUNTIME_PORT`; default binding is
  `RoutingRuntimeAdapter`.
- Owner domains register runtime handlers by `agentType`, usually during
  module initialization.
- Finalized listeners filter by event metadata (`agentType`, `source`,
  `sourceResourceType`, `sourceResourceId`), not by output payload.

## Local Agent Runtime

- Agent OS owns local Claude/Codex process execution, code-owned prompt/skill
  resolution, scoped KidItem MCP sessions, structured-output verification, and
  detached process-group cancellation. Owner-domain runtime handlers retain
  deterministic actions; they do not implement a second local CLI boundary.
- Sourcing interactions use the code-owned `codex_cli` default. The Claude CLI
  remains a supported explicitly configured adapter and uses the operator's
  existing local login; neither provider requires an API key when its local
  CLI session is already authenticated.
- Each local run receives one child-only MCP session. The parent CLI process
  receives only local CLI session/auth discovery variables, never KidItem DB,
  Redis, commerce-provider, or server `.env` credentials.
- Generic background claims exclude `sourcing_dashboard`; only its inline
  request-id claim may execute that surface. Stale pending/claimed dashboard
  requests and running attempts fail with `process_interrupted` at startup and
  are never replayed. MCP child application contexts never run reconciliation
  or background workers.
- Local CLI/MCP processes are bound to the Nest process. Shutdown terminates
  them; restart only closes stale nonterminal rows as `process_interrupted`.
  It never resumes a process, replays a prompt, or publishes delayed output.

## Boundary Rules

- Cost ledger inserts and `AgentRuntimeState.totalCostMicros` updates happen
  in one transaction.
- Missing runtime handler fails fast with `runtime_not_configured`.
- `AGENT_RUNTIME_ALLOW_NOOP=1` is only for isolated tests.
- Reconciliation changes Agent OS ledger state only. It must not replay owner
  capabilities or synthesize a delayed business-domain result.
- Interaction analytics is metadata-only and non-authoritative. Never emit
  messages/model output, resource names, dashboard payloads, credentials,
  cookies, tokens, or raw organization/user identifiers.

## Bootstrap

Fresh DBs need one `AgentInstance` per shipped code-owned definition and
organization:

```bash
npm run seed:agent-os
```

The seed reads `AGENT_<TYPE>_MODEL` or `AGENT_DEFAULT_MODEL` for the primary
model and any code-owned auxiliary `AGENT_*` model envs declared by the
definition. It throws if any required Agent OS model is missing. Agent runtime
model plans do not fall back to direct `AI_*` provider defaults.
