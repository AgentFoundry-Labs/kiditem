# agent-os — Durable Local-CLI Work Platform

`src/agent-os/` owns the single-node Agent Work platform, not downstream
business aggregates. The exact durable schema is six code-owned models:
`AgentVersion`, `AgentSession`, `AgentTask`, `AgentAttempt`,
`AgentCapabilityInvocation`, and `AgentCapabilityApproval`.

## Ownership And Direction

```text
Agent
  -> CapabilityDefinition
  -> owner-domain incoming port
  -> owner implementation
     -> AI / DB / provider / Operation when needed
```

- Capability definitions are domain-owned business intents with strict Zod
  input/output, stable owner ports, implementation, and idempotency; Agent OS
  aggregates and admits them but never writes owner-domain canonical rows.
- Incoming HTTP/MCP adapters inject only capability-named input ports, never
  concrete services. Agent OS may depend on an owner-domain incoming port;
  owner domains never import Agent OS application service types.
- MCP is a loopback-only Nest v2 Streamable HTTP adapter called directly by a
  Host Runner-owned local CLI Attempt. It revalidates the exact database
  Session/Task/Attempt/version/user/organization coordinate for every tool
  call. It has no internal signing layer, provider credential, provider session,
  durable MCP session, or direct Operations/repository bypass. It exposes
  exactly 11 MCP tools over the 18-definition catalog, including ten Sourcing
  capabilities.
- Only the native `apps/agent-runner` process may spawn Codex/Claude. It polls
  Nest for strict structured commands, posts bounded idempotent events, and
  exposes no inbound listener or raw-shell surface. Worker executes durable
  mutation/Operation recovery but has no CLI login profile. Windows Office runs
  one Task Scheduler-managed Runner; macOS development starts it explicitly.

## Lifecycle

- `AgentTask` owns only `open | completed | failed | cancelled` business
  lifecycle. `AgentAttempt` owns only `starting | running | succeeded | failed
  | process_interrupted | cancelled` CLI process lifecycle. Do not add schema,
  status, or continuation fields for interaction state.
- Work reads return source facts, never a presentation aggregate: Task status,
  latest Attempt, Approval and Invocation/Operation facts, child Tasks, and
  bounded result/resource/operation references including structured
  `result.needsInput` when present. The web derives its UI from those facts.
- Continue is an explicit action, never a state or refresh side effect. It is
  allowed only with no live Attempt and a non-cancelled Task; continuing a
  completed or failed Task atomically reopens it before creating one immutable
  Attempt. A cancelled Task requires explicit Reopen. No other event creates
  reasoning.
- Every CLI process uses a Runner-owned isolated per-Attempt home/workspace. It
  may reference the dedicated host account's persisted login artifact through
  the validated OS mechanism but never copies credential bytes into KidItem
  persistence. Reasoning is trusted but disposable: Runner loss, API restart,
  CLI exit, timeout, interruption, root/delegation replay, transport retry,
  Approval decision, Operation completion, and child Task completion never
  resume provider history or create/relaunch another Attempt.
- The protected installation bearer identifies one Runner installation. A
  cryptographically random per-Attempt bearer is short-lived, bound to one
  Attempt, revoked on terminal state, and never persisted or logged as raw
  control state.
- A mutation requiring approval stores its exact canonical input/hash and
  Approval durably before work can proceed. MCP returns a bounded current
  result and the CLI exits; it never waits for or is woken by a later Approval,
  Operation, or child completion. Approval may release only that admitted
  deterministic mutation/Operation. Durable worker recovery continues or
  retries ready/executing mutation work under its existing owner key, never
  reasoning.
- `AGENT_CLI_MAX_CONCURRENCY` is a process-local admission limit. There is no
  organization quota, provider budget, distributed lock, or provider resume
  contract in this release.

## Interaction Boundary

CopilotKit OSS is an API-local Nest incoming adapter at `/api/copilotkit`.
Browser traffic is same-origin and authenticated by ordinary KidItem session
auth. There is no interaction gateway, replay transcript service, or separate
control plane. Live output and ordinary user-message/interrupt delivery exist
only while the exact Attempt is running; database Task/Attempt and mutation
records are the durable recovery authority.

## Version Publication And Seed

`AgentVersion` snapshots agent key, assigned domains, capability keys, runtime
type, and instruction profile reference. It deliberately excludes models,
policy overrides, credentials, and provider session/history. The API bootstrap
and `npm run seed:agent-os` publish the six code-owned snapshots idempotently.
The seed requires `DATABASE_URL` through PrismaPg and one explicit
`AGENT_<TYPE>_MODEL` for each published version; it never falls back to
`AGENT_DEFAULT_MODEL` or direct `AI_*` configuration.

## Verification

Run focused Agent OS tests first, then the backend boot gate:

```bash
npm exec --workspace=apps/server vitest -- run src/agent-os
npm run check:agent-os-contraction -- --enforce
npm run dev:server
```

For schema/seed changes, use only an explicit disposable database; run
`db:push`, `prisma generate`, `npm run seed:agent-os` twice, and confirm six
active AgentVersions. Never run a destructive schema command against an Office
or development database from an agent session.
