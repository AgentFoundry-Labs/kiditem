# Agent Interaction Platform Runbook

KidItem uses CopilotKit OSS v2 as a same-origin Nest incoming adapter. KidItem
PostgreSQL is the source of truth for durable Session/Task/Attempt, capability
invocation and approval records. No CopilotKit Premium or Enterprise thread
service is required.

## Runtime shape

```text
browser /api/copilotkit
  -> Nest authenticated CopilotKit incoming adapter
  -> Agent Work admission and native Host Runner command
  -> direct loopback MCP v2 Streamable HTTP + owner-domain capability ports
  -> PostgreSQL durable work state
```

Opening the panel, choosing an agent, starting an empty conversation, or
reloading performs no control write. The browser supplies an opaque CopilotKit
thread id; Nest creates `AgentSession`, a Task, and an immutable Attempt only
on first submit. Output is future-only: provider history and replay transcripts
are not restored after a restart.

One ephemeral interaction-state module owns the selected Agent, one-time draft,
thread URL, and open/new/select/close actions for the global FAB, domain entry
points, and workspace. New work uses that selected Agent. Once a durable
Session is loaded, the root Task projection pins its immutable Agent definition
and a stale browser selection cannot replace it.

## Durable task controls

AgentOS owns durable work independently from CopilotKit. `AgentVersion`,
`AgentSession`, `AgentTask`, `AgentAttempt`, `AgentCapabilityInvocation`, and
`AgentCapabilityApproval` are the complete persistence graph. Task records only
`open | completed | failed | cancelled`; approval, Operation, child Task and
Continue waits are projections from their current records, never duplicated on
Task. `copilotThreadId` is opaque transport correlation only; request IDs,
provider sessions, runtime handles, tokens, and raw provider IDs are not
durable public identifiers.

An approval first stores its exact canonical input/hash durably. A live CLI
Attempt may wait for bounded HITL; timeout, CLI exit, or API restart leaves the
durable mutation/approval state to the worker. Later reasoning creates an
immutable successor Attempt and never resumes provider session/history. Browser
disconnect detaches only the future-output subscriber; it does not cancel the
durable producer.

Agent versions are immutable. Publishing an identical manifest reuses the active
version, while a changed capability/domain/runtime-profile manifest creates a
later version and retires the previous active row. Models, credentials, and
provider session/history never belong to AgentVersion; models are explicit API
runtime configuration. Existing Tasks remain pinned to their selected version.

## Readiness and verification

Probe authenticated Nest interaction/readiness routes before sending browser
traffic. There is no intermediary service, service credential, internal-signing
envelope, browser-provided organization identity, Hermes runtime, deletion
graph, or provider-session resume.

```bash
npm run build --workspace=apps/server
npm run build --workspace=apps/web
npm run smoke:interaction-os
```

`npm run smoke:interaction-os` refuses production-like environments, builds the
exact API/Web artifacts, and runs focused admission, direct-MCP, restart, and
Runner-control suites. It does not contact Codex, Claude, or any production
database/runtime. Full schema and seed acceptance uses only a named disposable
PostgreSQL instance as defined in [Agent OS Clean Cutover](agent-os-clean-cutover.md).

## Process-root boundary

The API root routes both REST and CopilotKit through one Agent Work intake
Module, and exposes narrow views of one Host Runner control session to HTTP,
MCP, launch, readiness, and live-input adapters. The native Host Runner owns
poll/dispatch/outbox/control-loss in one native control session and keeps its
HTTP client and CLI supervisor as adapters. The worker owns durable
mutation/Operation recovery but never imports API transport or a CLI provider.
Preserve this split when adding a capability, runtime, or controller.
