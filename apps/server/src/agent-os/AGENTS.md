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
  -> AgentRun terminal state
  -> global agent.run.finalized event
  -> owner-domain bridge + sink
```

Agent OS does not update downstream business rows. Owner domains listen for
finalized runs and apply side effects through their own idempotent sinks.

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
- Runtime execution goes through `AGENT_RUNTIME_PORT`; default binding is
  `RoutingRuntimeAdapter`.
- Owner domains register runtime handlers by `agentType`, usually during
  module initialization.
- Finalized listeners filter by event metadata (`agentType`, `source`,
  `sourceResourceType`, `sourceResourceId`), not by output payload.

## Boundary Rules

- Application services must not import concrete adapters, `PrismaService`, Nest
  HTTP decorators, provider SDKs, filesystem APIs, or workflow internals.
- Prisma access stays in outgoing repository adapters.
- Cost ledger inserts and `AgentRuntimeState.totalCostMicros` updates happen
  in one transaction.
- Missing runtime handler fails fast with `runtime_not_configured`.
- `AGENT_RUNTIME_ALLOW_NOOP=1` is only for isolated tests.
- Reconcile jobs must feed terminal run data through the same output schema and
  sink port used by the hot-path bridge.

## Bootstrap

Fresh DBs need one `AgentInstance` per shipped code-owned definition and
organization:

```bash
npm run seed:agent-os
```

The seed reads `AGENT_<TYPE>_MODEL` or `AGENT_DEFAULT_MODEL` and throws if no
model is configured.
