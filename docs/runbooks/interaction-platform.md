# Agent Interaction Platform Runbook

KidItem uses CopilotKit OSS `1.69.0` as a same-origin Nest incoming adapter.
Its API-local SQLite runner owns canonical completed AG-UI interaction events.
Codex or Claude provider-native sessions own model continuity, not browser
interaction history. KidItem owns business records, durable `OperationRun`s,
and exactly one Agent OS persistence model: `CapabilityInvocation`. There is no
CopilotKit thread service, generic durable work/process/version graph,
capability-grant store, KidItem transcript store, or PostgreSQL conversation/
preference/session model.

## Runtime shape

```text
browser /api/copilotkit
  -> authenticated Nest/CopilotKit adapter
  -> API-local CopilotKit SQLite completed-event runner
  -> outbound command queue
  -> native Agent Gateway
  -> Codex/Claude provider-native session + native subagents
  -> private Nest MCP 2026-07-28
  -> CapabilityDefinition -> owner-domain incoming port
  -> optional CapabilityInvocation approval / OperationRun
```

The Gateway is an always-on host process under the provider-login account. It
stores only bounded conversation descriptors needed to list and reopen provider
conversations and owns provider-native session continuity. The SQLite runner,
not the provider, is the canonical completed interaction-history source of
truth for the browser. The browser may start a general conversation or an
Agent-fixed domain conversation. Runtime is explicit at conversation creation,
while model and reasoning effort are explicit user choices for each turn.
Subagents are native Codex/Claude children, not KidItem conversations or
durable child tasks.

Opening the workspace, creating an empty draft, reloading, or inspecting history
starts no model turn. The Gateway's internal registry admits at most four native
parent turns, while Nest's exact in-memory active-turn record is the only
authority for whether a provider turn is running or may be stopped. A
browser/API/Gateway restart never resumes or automatically starts reasoning;
the user's next message starts a fresh turn through provider-native session
continuity.

## Capability and approval boundary

The private stateless MCP surface exposes exactly five tools:
`capability_catalog_search`, `capability_invoke`, `invocation_status`,
`operation_status`, and `readiness_probe`. The catalog contains five Agents,
fourteen domains, seventeen owner-local CapabilityDefinitions, including ten
Sourcing definitions. Profiles guide provider-native delegation; they do not
create grants. Every
invocation is authorized by current user/organization context, the selected
Agent profile, the exact capability contract, and server-owned routing policy.

Reads dispatch directly to the owner-domain incoming port. Mutations require an
owner idempotency key and persist the canonical input plus hash in
`CapabilityInvocation`. When approval is required, MCP returns `input_required`.
Recording an approval decision executes nothing; the provider must explicitly
retry the same request key and exact input. Same key/same input reuses the owner
result or Operation, while input drift conflicts. Long work returns an
`operationRef` immediately and the Operations worker owns completion without a
model restart.

The Gateway process owns one process-scoped MCP transport token. Provider
conversations reuse it across ordinary turns, while the static conversation ID
is only a routing locator. Nest resolves organization, user, turn, and fresh
execution authority from its current in-memory active-turn record at each MCP
callback. The installation bearer separately authenticates Gateway long-poll
and event traffic. Neither token is exposed to the browser or persisted.

Nest derives the current organization from authentication for each
Conversation-facing request. The Gateway stores that organization in its
bounded local descriptor and returns not-found for cross-organization access.
Users in the same organization share the Conversation; the current live Turn
remains fenced to its initiating user in Nest. This descriptor field is not
sent to providers and does not authorize MCP business tools.

## Readiness and verification

The API may be healthy while Gateway/provider readiness is unavailable. Starting
a conversation or turn must fail closed until the exact Gateway runtime train,
provider login, model catalog, and MCP `2026-07-28` canary are ready. There is no
legacy protocol fallback.

```bash
npm run check:copilotkit-train
npm run check:agent-os-contraction -- --enforce
npm run check:agent-os-hexagonal
npm run qa:agent-os:clean-cutover
npm run smoke:interaction-os
npm run build --workspace=apps/server
npm run build --workspace=apps/web
```

The clean-cutover helper accepts only its own generated Testcontainer database.
The interaction smoke exercises the authenticated conversation facade with an
exact disposable create replay/drift check, preferences, an empty disposable
SQLite `agent/connect` namespace, and provider-first cleanup. It never accepts
or impersonates the Gateway's MCP transport identity. Direct MCP admission is
covered by the Gateway loopback integration gate and the real provider-turn
browser QA.

For executable browser QA, run the helper from an interactive terminal and pass
the non-secret login email explicitly (or set `KIDITEM_BROWSER_QA_EMAIL`):

```bash
npm run qa:agent-os:clean-cutover -- --serve-browser-qa --email <email>
```

The helper injects its verified Testcontainer target into the built-in seed,
which creates only one active owner User/Organization/Membership and one
synthetic Sourcing candidate. It then prompts for the login password through
stdin; the seed accepts no password argument or environment variable. Running
the seed directly, using a non-interactive terminal, omitting the email, or
supplying a non-isolated target fails before it can write. Stop the helper with
SIGINT to stop the child processes and remove the disposable container; there
is no persistent-data rollback step.
Executable macOS QA uses the host's existing Codex login. Live Claude reply and
Windows ACL/Job Object/Task Scheduler execution remain explicit deferred gates
until those environments are available.

## Process ownership

The API owns authenticated HTTP, the completed-event SQLite runner, Nest's
in-memory active-turn authority, transient Gateway control state, MCP admission,
and `CapabilityInvocation`. The native Gateway owns provider processes,
provider-native sessions, bounded descriptors/preferences, its internal
four-slot parent-turn registry, and provider cleanup. The worker owns only
durable Operations and cannot import Agent transport, start a CLI, approve a
mutation, or wake reasoning. Preserve this split when adding a capability,
provider, controller, or deployment surface.
