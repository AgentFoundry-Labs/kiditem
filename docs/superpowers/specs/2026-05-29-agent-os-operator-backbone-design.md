# Agent OS Hermes Tool-Loop Design

Status: Living design, tool-loop target updated 2026-06-04

## Goal

KidItem Agent OS uses Hermes as the active Operator and Leaf Agent
orchestrator.

Hermes owns:

- deciding which Agent is needed
- deciding when a child Agent result is sufficient
- deciding whether another Agent, such as Listing, is needed
- selecting from the tools and skills exposed to the current Agent session
- requesting user input or approval when progress is blocked

KidItem remains the source of truth for:

- task graph and run status
- agent definitions and permissions
- approvals and user input pauses
- tool invocation audit
- artifacts
- domain side effects
- MCP adapters backed by reviewed KidItem domain code

Hermes output text is never authoritative. A Hermes-driven task is successful
only after a KidItem MCP finalization tool call records a KidItem event.

## Runtime Direction

| Runtime | Role |
|---|---|
| `hermes_tool_loop` | Current target runtime. Hermes runs the active tool loop with KidItem MCP tools. |
| `hermes` | Legacy/dev fallback. Hermes returns one strict `OperatorDecision`; useful for comparison only. |
| `openai_responses` | Hosted API fallback/eval path behind the legacy `OperatorDecision` contract. |

Codex or ChatGPT accounts are used through the Hermes model provider
configuration, such as `AGENT_OS_HERMES_PROVIDER=openai-codex`; they are not
separate KidItem Operator runtimes.

## Agent Roles

Operator is the only orchestrator. Every non-Operator agent is a Leaf Agent.

Operator sessions see:

- `agent_os_read_context`
- `agent_os_read_task_graph`
- `agent_os_read_artifacts`
- `agent_os_finalize_task`
- `agent_os_list_agents`
- `agent_os_create_task`
- `agent_os_request_user_input`

Leaf sessions see:

- common context/artifact/finalization tools
- first-class domain tools from the capability registry
- only tools allowed by that agent definition's default tool policies

Leaf agents cannot create child tasks. If a Leaf Agent wants another agent to
work, it emits handoff intent or finalization summary, and Operator creates the
next task.

## MCP Contract

Model-facing generic invocation is not exposed in normal Hermes sessions.
`kiditem_capability_invoke` may remain as an internal/debug path only.

Common result shape:

```json
{
  "status": "succeeded | failed | queued | running | waiting_approval",
  "taskId": "optional-task-id",
  "invocationId": "optional-tool-invocation-id",
  "artifactIds": ["optional-artifact-id"],
  "approvalRequestId": "optional-approval-request-id",
  "summary": {},
  "error": {}
}
```

Every Hermes tool-loop task must call:

```text
agent_os_finalize_task
```

Missing finalization fails closed with
`operator_runtime_finalization_missing`.

## Capability Exposure

First-class MCP names are generated from reviewed capability handlers, then
filtered by agent manifest.

Examples:

- Sourcing Agent: `sourcing_scrape_url`
- Listing Agent: `listing_create_generation_package`
- Listing Agent approval-gated external write:
  `listing_submit_wing_thumbnail`
- Order Agent: `order_create_purchase_order_draft`,
  `order_submit_purchase_order`
- Channel Registration Agent: `channel_register_confirmed_listing`,
  `channel_submit_coupang_listing`

Approval-required tools must return `waiting_approval` without executing the
side effect until the user approves inside KidItem.

## First Validation Scenario

Target user request:

```text
Use this 1688 URL and prepare the product up to the pre-Coupang-registration
state, including listing package, detail-page draft reference, and thumbnail
draft reference.
```

Expected Hermes behavior:

```text
User message with 1688 URL
  -> KidItem starts a neutral Operator task
  -> Hermes Operator reads context and agent manifests
  -> Hermes Operator decides a Sourcing Agent is needed
  -> Hermes Operator calls agent_os_create_task for Sourcing
  -> Hermes Sourcing Leaf uses sourcing_scrape_url
  -> Hermes Sourcing Leaf finalizes with a sourcing candidate artifact
  -> Hermes Operator reads artifacts and decides Listing is needed
  -> Hermes Operator calls agent_os_create_task for Listing
  -> Hermes Listing Leaf uses listing_create_generation_package
  -> Hermes Listing Leaf finalizes with a listing prep package artifact
  -> Hermes Operator finalizes with artifact references
```

No Coupang submission, marketplace registration, or supplier purchase order
submission runs in this scenario.

## Current Implementation Notes

- `AGENT_OS_OPERATOR_RUNTIME=hermes_tool_loop` runs Hermes with KidItem MCP
  enabled and requires `agent_os_finalize_task`.
- `AGENT_OS_OPERATOR_RUNTIME=hermes` remains as a legacy final-decision fallback.
- Missing `AGENT_OS_OPERATOR_RUNTIME` keeps the deterministic local path.
- `hermes_tool_loop` forces the `kiditem-agent-os` toolset and denies mixed
  Hermes toolsets with `operator_runtime_mixed_toolsets_denied`.
- Hermes subprocess env is intentionally narrow. Server secrets, raw provider
  keys, marketplace credentials, cookies, and database URLs are not forwarded.
- `AGENT_OS_HERMES_AUTH_HOME`, when set, is copied into the isolated Hermes
  profile as auth material; the original user-home auth path is not exposed to
  Hermes or the KidItem MCP server env. Nested Leaf Hermes sessions receive the
  isolated profile path as their auth source.
- KidItem MCP server env may include safe Hermes runtime controls, such as
  `AGENT_OS_HERMES_LEAF_AGENT_TYPES`, provider/model, Hermes path/home, timeout,
  output cap, and concurrency cap, so inline child tasks use the same
  Hermes-driven Leaf runtime.
- Operator MCP profile includes only control-plane tools.
- Leaf MCP profiles include common tools plus manifest-allowed domain tools.
- `agent_os_create_task` is denied for non-Operator agents.
- `agent_os_request_user_input` is a finalization pause that records
  `requires_approval` / `waiting_approval`.
- Approval resolution is owner/admin-only and requires both a pending approval
  row and a request currently in `requires_approval`.
- Tool invocation success and artifact creation are committed together; repeated
  idempotent calls reuse or materialize visible artifacts without linking a new
  conversation artifact to an old invocation id.
- `agent_os_finalize_task` accepts only artifacts visible to the current
  organization conversation.
- `listing` is a first-class Leaf Agent definition for listing prep packages.
- The current Listing Agent runtime path reuses the existing deterministic
  listing-prep capability handler while the Hermes Leaf runtime loop is being
  hardened.

## Verification Expectations

Unit/runtime coverage should prove:

- role-filtered MCP tools
- Operator-only delegation tools denied to Leaf Agents
- domain tools exposed only through manifest allowlists
- approval-required tools pause instead of executing side effects
- missing `agent_os_finalize_task` fails closed
- tool results project into `AgentToolInvocation` and `AgentArtifact`
- prompt/context/runtime diagnostics redact secrets and hidden reasoning
- approval resolve cannot be replayed against stale or already-decided requests
- finalization cannot reference artifacts from another conversation

Live validation should prove:

- the 1688 URL produces a sourcing candidate artifact
- listing prep package artifact contains detail/thumbnail draft references
- no external Coupang submit or supplier order submit is executed
