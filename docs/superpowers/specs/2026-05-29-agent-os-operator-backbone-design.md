# Agent OS Operator Backbone Design

Date: 2026-05-29
Status: Draft for user review, benchmark updated

## Purpose

Design the first durable Agent OS backbone for KidItem. The goal is to let a user
work inside KidItem by chatting with a user-facing Operator agent, while the
Operator delegates real work to domain agents that can reason, call approved
capabilities, create internal records, and report progress through Agent OS.

This is not a workflow-builder design. Agent OS should expose conversation,
execution status, approvals, policies, cost, and audit history. Users should not
manually wire agents and tools like an n8n canvas.

## Goals

- Let users start work from Agent OS chat.
- Treat every agent as a judgment-capable `AgentInstance`, not as a dumb worker.
- Make Operator a coordinator agent responsible for user conversation and
  cross-domain orchestration.
- Allow domain agents to reason within their own bounded context and call
  domain capabilities.
- Make actual data changes through domain-owned capabilities, not direct Agent
  OS database writes.
- Record a durable execution graph for read-only inspection.
- Support policies, approvals, retries, cost, and audit logs from the beginning.
- Validate the backbone with one end-to-end scenario:
  source product URL -> create product records -> generate detail and thumbnail
  drafts -> prepare a Coupang registration package.

## Non-Goals

- No external Coupang submit in the first slice.
- No n8n-style workflow editor.
- No project or workspace grouping model yet.
- No user-facing direct tool or agent picker in chat.
- No BYOK or personal Codex/Claude account connection in the first slice.
- No migration to an external workflow engine unless later evidence demands it.
- No direct product dependency on OpenClaw, Hermes, NemoClaw, Codex CLI, or
  Claude Code as the first Agent OS orchestrator.

## Existing Codebase Fit

The current codebase is a reasonable base for this design.

- `agent-os` already owns `AgentInstance`, `AgentRunRequest`, `AgentRun`,
  `AgentRunEvent`, approval, authorization, cost, observability, runtime
  handlers, and the runner port.
- Current `AgentRunRequest` behaves like a durable queued task request.
- Current `AgentRun` behaves like an execution attempt.
- `sourcing` already enters Agent OS through `AGENT_RUNNER_PORT.runByType` and
  has a runtime handler for scraping.
- `chat` is transitional. It currently shells out to Claude CLI for read/search
  style chat and should not become the core Agent OS conversation runtime.
- Domain ownership rules are compatible with this design: Agent OS orchestrates,
  while sourcing/products/channels/inventory/supply own their data mutations.

The design can preserve existing table names initially, but the domain language
should shift toward task/attempt/tool/artifact concepts.

## External Orchestrator Benchmark

OpenClaw, Hermes, and NemoClaw are useful design references, but they should not
own KidItem's production source of truth. KidItem Agent OS must own
conversation, task state, policy, approval, audit, cost, memory, and artifacts.

Reference sources:

- OpenClaw agents overview:
  https://openclawdoc.com/docs/agents/overview/
- OpenClaw repository and README:
  https://github.com/openclaw/openclaw
- OpenClaw skills documentation:
  https://github.com/openclaw/openclaw/blob/main/docs/tools/skills.md
- Hermes repository and README:
  https://github.com/NousResearch/hermes-agent
- NemoClaw Hermes quickstart:
  https://docs.nvidia.com/nemoclaw/get-started/quickstart-hermes
- NemoClaw runtime controls:
  https://docs.nvidia.com/nemoclaw/manage-sandboxes/runtime-controls

Benchmark summary:

| System | Useful pattern | KidItem interpretation |
|---|---|---|
| OpenClaw | Agent is a stateful, tool-using, multi-step workflow actor with model, memory, tool, and channel layers. | Keep every KidItem agent as a judgment-capable `AgentInstance` with explicit model, memory, tool, and UI/channel policy. |
| OpenClaw | Gateway controls sessions, channels, tools, events, multi-agent routing, per-agent workspaces, and skill allowlists. | Keep Agent OS as the control plane; route user work into Operator and child `AgentTask` records, with capability allowlists per agent. |
| OpenClaw | Unknown inbound DMs use pairing/allowlist before processing. | Treat future external channels as untrusted input; every non-Agent-OS channel needs pairing, organization binding, and audit. |
| OpenClaw | Non-main or remote sessions can run in sandboxed environments with restricted tools. | Add sandbox profiles to agent manifests; external browser/CLI workers should not get direct database access. |
| Hermes | Persistent memory, session search, user profiles, skills, scheduled automations, and isolated subagents. | Borrow memory and delegation concepts, but memory writes must be visible, scoped, redacted, and deletable inside KidItem. |
| Hermes | Skills can be created or improved from experience. | Production capability changes must remain code-defined; agents may propose skill/capability improvements as review artifacts only. |
| Hermes | Multiple terminal backends and gateway surfaces can run the same agent away from the user's laptop. | Runtime adapter abstraction should allow future hosted workers, but Agent OS state remains in KidItem. |
| NemoClaw | Sandbox setup bakes some choices at onboard time; network policies and allowlists can have separate runtime mutability. | Split runtime configuration into immutable sandbox profile, runtime policy, and hot-reloadable network allowlist. |
| NemoClaw | Hermes integration is documented as experimental. | Treat external autonomous runtimes as optional later adapters, not first-slice product infrastructure. |

The benchmark changes the design by making agent manifests, memory policy, and
sandbox policy first-class. It does not change the first-slice decision that
KidItem Agent OS is the orchestrator.

## Core Concepts

| Concept | Meaning |
|---|---|
| `AgentDefinition` | Code-defined agent type, such as `operator`, `sourcing`, `product`, or `channel_registration`. |
| `AgentInstance` | Organization-scoped configured agent instance. Every agent can reason within its responsibility boundary. |
| `Operator` | A special user-facing `AgentInstance` that coordinates conversation and cross-domain delegation. |
| `Domain Agent` | A bounded agent that reasons inside one domain and calls capabilities owned by that domain or allowed collaborators. |
| `AgentConversation` | User-facing chat thread in Agent OS. |
| `AgentMessage` | Visible user or assistant message in a conversation. |
| `AgentTask` | Logical task assigned to an agent. Existing `AgentRunRequest` can evolve into this role. |
| `AgentRunAttempt` | One execution attempt for an `AgentTask`. Existing `AgentRun` already fits this role. |
| `AgentToolInvocation` | Durable record of a capability/tool call, including policy, approval, input/output summary, and result. |
| `AgentArtifact` | Durable output card linked to a task/tool, such as a candidate, product, thumbnail draft, or channel package. |
| `AgentApprovalRequest` | User approval gate for risky or external side effects. |

## Agent Manifest Direction

OpenClaw and Hermes both make agent configuration explicit. KidItem should do
the same, but with SaaS-grade ownership boundaries and auditability.

`AgentDefinition` should be code-defined and versioned. It declares what an
agent type is allowed to be. `AgentInstance` should be organization-scoped and
stores only approved overrides.

Recommended manifest fields:

| Field | Purpose |
|---|---|
| `agentType` | Stable code-defined type, such as `operator` or `sourcing`. |
| `definitionVersion` | Version of the code-defined agent contract. |
| `displayName` | User-facing name in progress cards and inspector. |
| `role` | Short responsibility summary injected into the agent manual. |
| `runtimeAdapter` | Provider/runtime family, such as `openai_responses`, `anthropic_api`, `stub`, `replay`, or future `external_sandbox`. |
| `modelPolicy` | Allowed model family, reasoning effort, fallback policy, and missing-model behavior. |
| `promptManualKey` | Pointer to compact operating instructions, not a dump of all `AGENTS.md` files. |
| `capabilityAllowlist` | Capabilities this agent may request through Tool Router. |
| `delegationAllowlist` | Child agent types this agent may delegate to. Operator has the broadest set. |
| `memoryPolicy` | Allowed memory scopes, write types, retention, redaction, and deletion behavior. |
| `approvalPolicy` | Default mode per capability: `auto`, `approval_required`, or `disabled`. |
| `budgetPolicy` | Max turns, token budget, cost budget, timeout, and retry limits. |
| `sandboxProfile` | Optional execution isolation profile for browser, CLI, or external worker tasks. |
| `channelPolicy` | Agent OS chat by default; future external channels require pairing and org binding. |
| `artifactProjection` | Which artifacts the agent can emit and how they should appear in UI. |

First slice:

- Keep manifests in code and seed `AgentInstance` rows for the organization.
- Do not build a full manifest editor yet.
- Allow minimal settings UI for model, enable/disable, and capability policy.
- Validate every run against the resolved manifest snapshot and store the
  snapshot key on the task or run attempt.

## Architecture

All agents are judgment-capable instances. The key distinction is responsibility
scope, not intelligence level.

| Agent | Responsibility |
|---|---|
| Operator | Interpret the user request, choose playbook or dynamic plan, delegate tasks, ask for approvals, summarize results. |
| Domain Agent | Reason inside a bounded domain, choose allowed capabilities, execute through Tool Router, report structured output and risks. |
| Tool/Capability | Perform deterministic data reads or writes through domain-owned ports and services. |

Execution shape:

```text
AgentConversation
  -> User AgentMessage
     -> Operator AgentTask
        -> Operator AgentRunAttempt
           -> Sourcing AgentTask
           -> Product AgentTask
           -> Detail Content AgentTask
           -> Thumbnail AgentTask
           -> Channel Registration AgentTask
```

First scenario run tree:

```text
Operator Agent
  -> Sourcing Agent
     -> sourcing.scrape_and_assess_product
  -> Product Agent
     -> products.create_product_from_candidate
  -> Detail Content Agent
     -> ai.generate_detail_page_draft
  -> Thumbnail Agent
     -> ai.generate_thumbnail_draft
  -> Channel Registration Agent
     -> channels.prepare_coupang_registration_package
```

## Data Model Direction

Add new durable conversation and execution projection models:

- `AgentConversation`
- `AgentMessage`
- `AgentToolInvocation`
- `AgentArtifact`

Evolve existing models semantically:

- Treat `AgentRunRequest` as `AgentTask`.
- Treat `AgentRun` as `AgentRunAttempt`.
- Keep `AgentRunEvent` as the raw timeline/log stream.

Likely `AgentRunRequest` additions:

- `conversationId`
- `initiatedByMessageId`
- `parentRequestId`
- `delegatedByRunId`
- `playbookKey`
- `planStepKey`
- `displayName`
- `statusReason`
- dependency metadata for ordered or parallel child tasks

`AgentToolInvocation` should track:

- organization
- agent instance
- task/request
- run attempt
- capability key
- policy decision
- approval request, if any
- status
- redacted input summary
- redacted output summary
- error details
- idempotency key
- started/completed timestamps
- cost metadata when relevant

`AgentArtifact` should track:

- organization
- conversation
- task/request
- run attempt
- tool invocation
- artifact type
- target domain
- target model
- target id
- display title
- summary payload

Memory should be modeled separately from opaque agent-private notes.

Initial memory types:

| Memory type | Scope | First-slice behavior |
|---|---|---|
| Conversation context | Conversation | Use compact recent messages and selected artifacts. |
| Run summary | Task tree | Store audited summaries through run events/artifacts. |
| Organization knowledge | Organization | Defer autonomous writes; allow future curated, user-visible memory. |
| Agent operating memory | Agent definition/instance | Defer autonomous writes; use code-defined manuals first. |

Memory rules:

- No hidden, agent-private memory that can influence production actions without
  audit.
- Memory writes must be visible in Agent OS and tied to organization, agent,
  source run, and source artifact.
- Memory containing product, customer, supplier, or marketplace data must have
  retention and deletion behavior.
- User-editable/deletable memory is required before long-term autonomous memory
  is enabled.
- First slice should rely on conversation context, run summaries, and artifacts,
  not autonomous long-term memory.

## Runtime Flow

1. User sends a message in Agent OS.
2. Backend creates an `AgentMessage` and an Operator `AgentTask`.
3. Operator runtime runs as a normal `AgentInstance`.
4. Operator receives:
   - current message
   - compact conversation context
   - Agent OS operating manual
   - capability registry
   - policy envelope
   - relevant run state
5. Operator first tries to match a code-owned playbook.
6. If no playbook matches, Operator creates a structured dynamic plan.
7. Plan validator checks:
   - allowed agent types
   - allowed capabilities
   - input/output schemas
   - policy and approval requirements
   - dependency graph
   - organization boundary
   - idempotency requirements
8. Agent OS creates child `AgentTask` records.
9. Workers execute each child task through its assigned domain agent.
10. Domain agents call capabilities through Agent OS Tool Router.
11. Tool Router applies schema validation, policy checks, approval gates,
    idempotency, audit, and invocation logging.
12. Domain capability executes through domain-owned ports/services.
13. Tool outputs produce `AgentArtifact` records and run events.
14. Operator summarizes the final result into the conversation.

## Playbooks

Use Playbook First + Dynamic Fallback.

For known business flows, Agent OS owns the orchestration shell as code-defined
playbooks. Each playbook references domain capabilities but does not own their
business mutations.

Example:

```text
playbook: sourcing_to_channel_registration_v1
input: sourceUrl
steps:
  1. Sourcing Agent: scrape and assess product
  2. Product Agent: create catalog product
  3. Detail Content Agent: generate detail page draft
  4. Thumbnail Agent: generate thumbnail draft
  5. Channel Registration Agent: prepare Coupang package
```

If a user request does not match a playbook, Operator can propose a dynamic plan.
The plan must still pass the same validator and Tool Router policy checks.

## Tool And Capability Contract

Agent Runtime, Tool Router, and Domain Capability should be separate layers.

```text
Agent Runtime
  = reasoning, planning, tool selection, result interpretation

Agent OS Tool Router
  = schema validation, policy, approval, idempotency, audit, cost, invocation log

Domain Capability
  = deterministic reads/writes through domain-owned ports and services
```

Capability registration should include:

- capability key
- owning domain
- input schema
- output schema
- side-effect classification
- default policy scope
- approval risk level
- idempotency key recipe
- artifact mapping
- handler adapter

First scenario capabilities:

| Capability | Owner | Effect |
|---|---|---|
| `sourcing.scrape_and_assess_product` | sourcing | Scrape URL, assess product, create sourcing candidate. |
| `products.create_product_from_candidate` | products | Create `MasterProduct`, `ProductOption`, and `ProductPreparation`. |
| `ai.generate_detail_page_draft` | ai | Create or schedule a detail page draft through AI-owned content workspace rows. |
| `ai.generate_thumbnail_draft` | ai | Create or schedule a thumbnail draft through AI-owned thumbnail generation rows. |
| `channels.prepare_coupang_registration_package` | channels | Prepare internal Coupang registration draft data on the preparation record. |

Agents must not directly mutate another domain's tables. They call
capabilities; capabilities call domain-owned ports and services.

Detail-page and thumbnail work must reuse the existing AI domain model:
`ContentWorkspace`, `ContentGeneration`, `DetailPageArtifact`,
`DetailPageRevision`, `ThumbnailGeneration`, and
`ThumbnailGenerationCandidate`. The agent-facing capability is a Tool Router
entry, not a revival of retired Agent OS runtime types such as
`detail_page_generate` or `thumbnail_generate`.

## Sandbox And External Runtime Policy

NemoClaw and OpenClaw both show that sandbox policy becomes its own lifecycle.
KidItem should model this early, even if the first implementation only runs
local in-process API handlers and background workers.

Sandbox profile fields:

- profile key
- runtime adapter
- allowed network egress presets
- allowed secret mounts
- allowed tool families
- filesystem/storage scope
- timeout and idle limits
- snapshot/log retention
- rebuild required fields
- hot-reloadable fields

First-slice sandbox posture:

- Default domain capabilities run inside KidItem server/worker processes.
- External autonomous runtimes are not required.
- Browser automation and external web interaction should be designed as future
  sandbox worker tasks.
- Sandbox workers must call back through Tool Router or a narrow callback API;
  they must not receive direct database credentials.
- Network allowlists and external credentials should be explicit policy inputs,
  not hidden inside prompts.

Future runtime adapters may include:

| Adapter | Use |
|---|---|
| `openai_responses` | Default model/tool reasoning loop. |
| `anthropic_api` | Alternative model/tool reasoning loop. |
| `stub` | Deterministic local development without provider cost. |
| `replay` | Recorded provider/tool outputs for regression testing. |
| `external_sandbox` | Later OpenClaw/Hermes/NemoClaw-style worker bridge. |
| `codex_or_claude_cli` | Internal development/code worker only, not customer-facing product runtime. |

## First End-to-End Scenario

User request:

```text
Source this product URL and prepare it for Coupang registration.
```

Expected behavior:

1. Operator matches `sourcing_to_channel_registration_v1`.
2. Sourcing Agent scrapes the URL, assesses suitability, and creates a
   `SourcingCandidate`.
3. Product Agent creates `MasterProduct`, `ProductOption`, and
   `ProductPreparation`.
4. Detail Content Agent asks the AI capability to create or schedule a detail
   page draft and link the selected draft to `ProductPreparation`.
5. Thumbnail Agent asks the AI capability to create or schedule a thumbnail
   draft and link the selected draft to `ProductPreparation`.
6. Channel Registration Agent prepares an internal Coupang registration package
   in `ProductPreparation.registrationInput`.
7. Operator returns a summary and result cards.

Automatic in first slice:

- `SourcingCandidate` creation
- `MasterProduct` creation
- `ProductOption` creation
- `ProductPreparation` creation
- detail page draft creation
- thumbnail draft creation
- Coupang registration package draft creation

Out of scope for first slice:

- actual external Coupang submit
- inventory receiving
- purchase order creation

## Policy And Approval

Policies are scoped by Agent Instance x Capability.

Initial modes:

| Mode | Meaning |
|---|---|
| `auto` | Execute immediately. |
| `approval_required` | Pause and request user approval before execution. |
| `disabled` | Do not allow execution. |

First scenario defaults:

| Agent | Capability | Policy |
|---|---|---|
| Sourcing Agent | `sourcing.scrape_and_assess_product` | `auto` |
| Product Agent | `products.create_product_from_candidate` | `auto` |
| Detail Content Agent | `ai.generate_detail_page_draft` | `auto` |
| Thumbnail Agent | `ai.generate_thumbnail_draft` | `auto` |
| Channel Registration Agent | `channels.prepare_coupang_registration_package` | `auto` |
| Channel Registration Agent | `channels.submit_coupang_listing` | `approval_required` later |

Approval flow:

```text
Tool Router
  -> policy check
  -> approval required
  -> create AgentApprovalRequest
  -> pause task
  -> show approval card in chat and inspector
```

If approved, the task resumes. If rejected, the task becomes cancelled or
blocked depending on the reason.

## Failure And Retry

Task and attempt must stay separate.

```text
AgentTask: Product creation
  -> Attempt #1 failed
  -> Attempt #2 succeeded
```

Initial statuses:

| Status | Meaning |
|---|---|
| `queued` | Waiting to run. |
| `running` | Currently executing. |
| `waiting_approval` | Paused for user approval. |
| `succeeded` | Completed successfully. |
| `failed` | Attempt failed; task may be retried. |
| `cancelled` | User or system cancelled. |
| `blocked` | Missing input, policy, or external condition prevents progress. |

Retry behavior:

- Retry creates a new `AgentRunAttempt` under the same `AgentTask`.
- Existing artifacts are preserved.
- Domain capabilities must use idempotency keys to avoid duplicate creation.
- The UI should show attempts under the task rather than hiding failed work.

## Agent OS UI

Use a three-pane Agent OS workspace:

```text
Agent OS
  Left: Conversations
  Center: Operator Chat
  Right: Run Inspector
```

Conversations pane:

- new conversation
- conversation list
- status badges: running, needs approval, completed, failed
- no project grouping in the first slice

Operator Chat:

- user talks to Operator only
- progress cards show internal agent names
- result cards link to created artifacts
- approval cards appear inline when needed
- no direct agent/tool picker

Run Inspector:

- read-only execution graph
- root Operator task
- child agent tasks
- tool invocation timeline
- approval state
- generated artifacts
- duration, token, and cost metadata
- expandable raw logs

Agent OS tabs over time:

| Tab | Purpose |
|---|---|
| Conversations | Main user work surface. |
| Runs | Global execution history. |
| Approvals | Approval queue and history. |
| Agents | Agent instance settings. |
| Policies | Capability permission settings. |
| Cost | Token and tool cost view. |
| Logs | Operator/admin diagnostics. |

First UI slice should include Conversations, Chat, Run Inspector, approval cards,
and minimal Agent/Policy settings.

## Implementation Slice

Recommended first implementation slice:

1. Add conversation/message models.
2. Add tool invocation and artifact models.
3. Extend `AgentRunRequest` for parent task tree and conversation linkage.
4. Add Agent OS conversation APIs.
5. Add run graph projection API for the inspector.
6. Add Tool Router that wraps policy, approval, idempotency, and invocation
   logging.
7. Add manifest registry/resolver for code-defined agent contracts and
   organization-scoped instances.
8. Add playbook registry and validator.
9. Add `sourcing_to_channel_registration_v1` playbook.
10. Implement or adapt first scenario capabilities, reusing AI generation ports
   for detail and thumbnail work instead of adding Agent OS generation run
   definitions.
11. Replace the Agent OS first screen with the three-pane workspace.

Testing focus:

- plan validation rejects invalid agents, tools, schemas, and dependencies
- Tool Router enforces `auto`, `approval_required`, and `disabled`
- child task tree is persisted and projected correctly
- retry creates a new attempt without duplicating artifacts
- organization boundary is enforced on conversation, task, tool, and artifact
- manifest resolution prevents unauthorized delegation and tool use
- memory summaries are audited and do not create hidden production context
- sandbox/external runtime fields are modeled without requiring a first-slice
  external worker
- first scenario can run in stub or replay mode without provider API cost

## First-Slice Decisions

- Detail-page and thumbnail draft persistence is owned by the existing AI
  domain. Agent OS records task/tool/artifact lineage and calls AI capabilities.
- Database names should not be renamed in the first slice. Preserve
  `AgentRunRequest` and `AgentRun` physically, but use task/attempt language in
  Agent OS code and UI.
- Provider mode order should be stub first, replay second, real API third. This
  keeps development useful without forcing provider API spend.
- Current `apps/server/src/chat` should remain transitional and separate. The
  new Agent OS conversation runtime should not depend on the Claude CLI chat
  service.
- OpenClaw, Hermes, and NemoClaw are benchmark references for orchestrator
  design. They are not first-slice runtime dependencies.
- Agent manifests, memory policy, and sandbox profiles should be explicit in the
  design before adding external autonomous runtime adapters.

## Review Checklist

- Does the task/attempt/tool/artifact model match the intended Agent OS mental
  model?
- Does the Operator versus Domain Agent boundary feel right?
- Is the first scenario narrow enough for a first implementation while still
  proving cross-agent delegation?
- Is the three-pane UI the right first Agent OS surface?
- Are the first automatic changes acceptable without approval?
- Do the manifest, memory, and sandbox policies capture the right lessons from
  OpenClaw, Hermes, and NemoClaw without overfitting to them?
