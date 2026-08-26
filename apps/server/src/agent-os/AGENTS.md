# agent-os — Provider-Native Conversation And Capability Platform

`src/agent-os/` owns the single-node provider conversation adapter and exact
capability-admission boundary, not downstream business aggregates. Its only
durable model is `CapabilityInvocation`; provider conversations and history
remain provider-local, while long deterministic work remains an `OperationRun`.

## Ownership And Direction

```text
Agent
  -> CapabilityDefinition
  -> owner-domain incoming port
  -> owner implementation
     -> AI / DB / provider / Operation when needed
```

- Capability definitions are domain-owned business intents with strict Zod
  input/output, stable owner ports, implementation, and idempotency. Agent OS
  aggregates and admits them but never writes owner-domain canonical rows.
- Incoming HTTP/MCP adapters inject only capability-named input ports, never
  concrete owner services. Owner domains never import Agent OS application
  service types.
- MCP is a private Nest MCP v2 Streamable HTTP adapter called by provider
  conversations. Every request authenticates the Gateway process transport
  token; business tool calls then resolve the static conversation locator
  against Nest's current active-turn map. The token and locator grant no
  Agent, capability, delegation, organization, or user authority. MCP has no
  durable session, provider credential, transcript store, internal signing
  layer, or repository bypass. The public tool surface is exactly five tools
  over the 17-definition catalog, including all ten Sourcing capabilities.
- Only the native `apps/agent-gateway` process may spawn Codex/Claude. It polls
  Nest for strict structured commands, posts bounded events, and exposes no
  inbound listener or raw-shell surface. Windows Office runs one Task
  Scheduler-managed Gateway; macOS development starts it explicitly.

## Lifecycle

- A conversation fixes its provider runtime and optional code-owned Agent key.
  Runtime, model, and reasoning effort are explicit; model/effort are selected
  for every turn and never silently defaulted.
- Conversation descriptors, transcripts, native subagents, and provider
  history are Gateway/provider-local. Nest keeps only live owner correlation,
  active turn streams, one process registration, per-conversation active-turn
  records, commands, and readiness in memory.
- API or Gateway restart ends live turns. It never persists/replays a prompt,
  resumes a provider run, synthesizes terminal database state, or starts
  reasoning. The user sends a normal new message if more reasoning is needed.
- The protected installation bearer authenticates the Gateway control plane.
  Separately, each running Gateway generates one opaque MCP transport token,
  registers it during protected polling, and reuses it across Conversations
  and turns. Nest activates at most one turn per Conversation with a fresh
  execution ID and derives organization/user/turn authority only from that
  server-owned record. Exact terminal events clear only their matching turn;
  Conversation deletion or Gateway loss clears the related live state. Neither
  token nor active-turn state is persisted or logged as raw control state.
- A mutation requiring approval stores its exact canonical input/hash and
  expiry on `CapabilityInvocation` before work can proceed. Approval only
  authorizes a later explicit retry of that exact request; it never resumes a
  provider turn or directly executes the owner mutation.
- Same request key and canonical input replay one receipt/result; input drift
  conflicts. Ambiguous owner outcomes remain pending for an explicit retry
  under the same owner idempotency key.

## Interaction Boundary

CopilotKit OSS 1.69 is an API-local Nest incoming adapter at
`/api/copilotkit`. Browser traffic is same-origin and authenticated by ordinary
KidItem session auth. Its runner is stateless: it stores/replays no transcript
and cannot stop or connect to a process-global thread by raw thread ID. There
is no interaction gateway application, replay service, Agent publication/seed,
generic Task, or persistent provider session model.

## Verification

Run focused Agent OS tests first, then the backend boot gate:

```bash
npm exec --workspace=apps/server vitest -- run src/agent-os
npm run check:agent-os-contraction -- --enforce
npm run check:agent-os-hexagonal
npm run dev:server
```

For schema changes, use only an explicit disposable database; run `db:push`,
`prisma generate`, and the shared build. Never run a destructive schema command
against an Office or development database from an agent session.
