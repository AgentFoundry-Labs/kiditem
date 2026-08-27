# agent-os — Provider-Native Conversation And Capability Platform

`src/agent-os/` owns the single-node provider conversation adapter and exact
capability-admission boundary, not downstream business aggregates. Its only
PostgreSQL durable model is `CapabilityInvocation`; completed canonical AG-UI
event history is adapter-local CopilotKit SQLite, while provider-local sessions
remain model continuity only and long deterministic work remains an
`OperationRun`.

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
- Conversation descriptors, native subagents, and provider-local sessions are
  Gateway/provider-local; provider-local sessions are model continuity only.
  Completed canonical AG-UI history is adapter-local SQLite, never a PostgreSQL
  transcript or execution authority. Nest keeps only live owner correlation,
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
KidItem session auth. CopilotKit's runner is the interaction-plane owner for
run, live stream, connect, and completed-event replay through the OSS SQLite
runner semantics. Use the upstream package directly only when subscriber,
restart, exact-stop, organization-namespace, and exact-delete characterization
passes; otherwise patch only a narrow, attributed sqlite-runner workspace fork.
Its authenticated adapter namespaces runner threads by the
server-derived organization, maps running/stop to Nest's exact active turn and
provider interrupt, and never treats a raw thread ID as authority. Interrupt
acknowledgement and browser unsubscribe are not provider terminal. Do not
replace the stock runner with a snapshot-only runner or a second Web turn state
machine. The local SQLite completed-event log is adapter-owned and never enters
Prisma;
it stores no credential, bearer/token, raw provider payload, or private
reasoning or becomes running authority; Nest's in-memory active turn is the
only execution authority. Provider-local sessions remain the model-continuity
owner. There is no paid CopilotKit service, interaction gateway application,
custom replay service, Agent publication/seed, generic Task, or persistent
provider session model in KidItem PostgreSQL.

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
