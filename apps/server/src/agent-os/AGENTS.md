# agent-os — Agent Runtime Platform

`src/agent-os/` owns code-defined agent definitions, organization-scoped agent
instances, durable run requests, execution attempts, tool policy, approvals,
cost ledger, and run observability. It is a platform owner, not a downstream
business aggregate owner.

## Folder Map

```text
agent-os/
├── adapter/
│   ├── in/{http,operation,agent,mcp}/<capability>/
│   └── out/{repository,transaction,runtime,event,cross-domain}/<capability>/
├── application/
│   ├── event/                # finalized event types/constants
│   ├── port/in/<capability>/
│   ├── port/out/<lane>/<capability>/
│   └── service/<capability>/
└── domain/<aggregate-or-policy>/
```

Agent OS is lane-first and capability-second: it remains one platform hexagon,
not a top-level hexagon per feature. Incoming adapters inject only
capability-named `application/port/in` tokens; they never import a concrete
`application/service` implementation. Official session/KID-25 input ports live
inside a capability folder. The retained generic `AgentRun` input ports are a
narrow, explicitly classified compatibility exception while migration is in
progress.

## Owned Surfaces

- Generic Agent OS run creation and observability APIs under `/api/agent-os/*`
- Manual drain/debug endpoint:
  `POST /api/agent-os/executor/claim-and-run`
- Code-owned agent catalog/bootstrap and runtime handler registration
- Organization-scoped interaction bootstrap, run authorization, AG-UI event
  persistence/replay/live join, and action reauthorization. `AgentOsModule`
  is the controller-free facade over catalog, capability, and session
  composition; `AgentOsLegacyRunModule` temporarily quarantines retained
  generic AgentRun providers. `AgentOsHttpModule` owns the HTTP
  controllers, guards, secrets, AG-UI producers, and Operations-backed session
  controls. Worker and MCP roots must not reach that HTTP wrapper transitively.
- Complete AgentSession deletion and canonical session-task cancellation are
  API-root-only: `AgentOsApiExecutionModule` owns their controller-free input
  ports, deletion execution service, one Operations handler, and the two
  post-accepting recovery hooks; `AgentOsHttpModule` owns the controller.
  `AgentOsSessionModule` exports only controller-free transaction seams.
  Worker and MCP may verify fenced credentials but never compose deletion HTTP,
  handler, finalizer, recovery, or Operations worker providers.

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

## Local Agent Runtime And Official Durable Runtimes

- The retained generic `AgentRun` local CLI lane below is compatibility-only.
  Do not add behavior to it: the KID-25 target routes Agent judgment through an
  official `AgentSession` task/execution and `AgentRuntimeAdapterRegistry`.
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
- Official durable Hermes and isolated CLI adapters are a separate task-runtime
  boundary. They persist only an encrypted native/reconnect reference, inspect
  it before reconnecting, regenerate the same execution/attempt-scoped
  credential, and never fall back to a different runtime or a new external
  run. Their `home`, `work`, and `state` paths are worker-owned and owner-only;
  gateway and web processes must never spawn those executables.
- Hermes production output is resource-reference-only: it may emit a canonical
  `resource_ref`, never inline artifact bytes or an `artifact_candidate`.
  Reject unsupported inline envelopes before the artifact writer, persistence,
  or storage provider boundary.

## Boundary Rules

- Cost ledger inserts and `AgentRuntimeState.totalCostMicros` updates happen
  in one transaction.
- Atomic session authorization, event append, delegation, approval continuation,
  attempt binding, and lifecycle transitions use transaction ports and outgoing
  Prisma transaction adapters; do not split one lifecycle transaction into
  table-shaped CRUD calls.
- Missing runtime handler fails fast with `runtime_not_configured`.
- Durable runtime tests inject explicit fake adapters; production has no no-op
  or fallback runtime path.
- Reconciliation changes Agent OS ledger state only. It must not replay owner
  capabilities or synthesize a delayed business-domain result.
- Interaction analytics is metadata-only and non-authoritative. Never emit
  messages/model output, resource names, dashboard payloads, credentials,
  cookies, tokens, or raw organization/user identifiers.
- A production application or adapter file over 700 lines is a non-blocking
  responsibility/cohesion review smell, not an architecture violation. Split
  only at a real capability, transaction, or adapter seam; do not accumulate
  behavior without that review merely because the scanner does not fail. Tests,
  generated code, and temporary `legacy-run` files are omitted from smell
  reporting but still obey incoming-adapter dependency direction.
  `npm run check:agent-os-hexagonal` is intentionally a standalone failing
  migration baseline until Tasks 12–14 remove its hard dependency and input-port
  violations; only then may it join `check:conventions`.

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
