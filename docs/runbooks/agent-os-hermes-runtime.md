# Agent OS Hermes Tool-Loop Runtime Runbook

## Purpose

Run KidItem Agent OS through Hermes tool-loop sessions while KidItem owns task
state, permissions, approvals, artifacts, audit, and domain side effects.

Hermes final text is non-authoritative. A Hermes run is complete only when
KidItem records `agent_os.task_finalized` from `agent_os_finalize_task` or a
durable pause through `agent_os_request_user_input`.

## Required Setup

- Install Hermes so `hermes chat -q` is available, or set
  `AGENT_OS_HERMES_PATH`.
- Configure the Hermes provider account/model.
- For ChatGPT/Codex OAuth provider testing, run `hermes auth add openai-codex`
  and use a model exposed by that account.
- Build the server before MCP-enabled Hermes runs:

```bash
rtk npm run build --workspace=apps/server
```

- Seed Agent OS data:

```bash
rtk npm run seed:agent-os
```

## Runtime Env

```bash
AGENT_OS_OPERATOR_RUNTIME=hermes_tool_loop
AGENT_OS_HERMES_MODEL=<explicit-hermes-model>
```

Optional:

```bash
AGENT_OS_HERMES_PROVIDER=openai-codex
AGENT_OS_HERMES_LEAF_AGENT_TYPES=sourcing,listing
AGENT_OS_HERMES_PATH=hermes
AGENT_OS_HERMES_HOME=/tmp/kiditem-agent-os-hermes
AGENT_OS_HERMES_AUTH_HOME=/Users/<user>/.hermes
AGENT_OS_HERMES_TIMEOUT_MS=60000
AGENT_OS_HERMES_MAX_OUTPUT_BYTES=262144
AGENT_OS_HERMES_MAX_CONCURRENT_RUNS=1
```

Do not pass marketplace credentials, cookies, raw API keys, database URLs, or
user secrets into Hermes prompts. Hermes subprocess env passthrough is narrow:
basic process env, the selected model/provider, `HERMES_HOME`, and KidItem
Agent OS context ids. The KidItem MCP server receives KidItem Agent OS context
ids plus safe Hermes runtime controls so inline child tasks use the configured
Hermes Leaf runtime.

`AGENT_OS_HERMES_AUTH_HOME` is optional. When set, KidItem copies `auth.json`
into the isolated `HERMES_HOME`; the original auth-home path is not forwarded
to Hermes or the MCP server. Nested Leaf Hermes sessions receive the isolated
profile path as their auth source. `hermes_tool_loop` force-enables the
`kiditem-agent-os` toolset and rejects mixed toolsets.

## Tool Exposure

Operator sessions include common context/finalization tools plus:

- `agent_os_list_agents`
- `agent_os_create_task`
- `agent_os_request_user_input`

Leaf sessions include common tools plus manifest-allowed first-class domain
tools. `agent_os_create_task` is denied for every non-Operator agent.

Normal Hermes sessions do not expose `kiditem_capability_invoke`.

## Roster and Runtime State

- The Agent Definition Registry is the shipped Hermes organization roster.
- `GET /api/agent-os/roster` always returns every active definition in canonical order.
- `AgentInstance` is organization-owned runtime state and may be absent or unconfigured.
- Missing instances remain visible as `instance_missing`; unresolved models remain visible as `model_plan_incomplete`.
- `npm run seed:agent-os` creates missing runtime rows with compound upserts but never overwrites existing organization runtime settings.
- Git pull and `db:push` do not install runtime instances. Run the seed explicitly when a runnable local environment is required.

## Expected Flow

First live validation:

```text
1688 URL
  -> Operator task
  -> Sourcing task with sourcing_scrape_url
  -> sourcing candidate artifact
  -> Listing task with listing_create_generation_package
  -> listing_prep_package artifact with detail/thumbnail draft refs
  -> Operator agent_os_finalize_task
```

No Coupang listing submission, confirmed marketplace registration, or supplier
purchase order submission should run in this validation.

## Live E2E Harness

Use the checked-in harness when validating the first 1688 URL scenario through
Agent OS conversation entrypoint:

```bash
AGENT_OS_OPERATOR_RUNTIME=hermes_tool_loop \
AGENT_OS_HERMES_LEAF_AGENT_TYPES=sourcing,listing \
AGENT_OS_HERMES_PROVIDER=openai-codex \
AGENT_OS_HERMES_MODEL=<explicit-hermes-model> \
AGENT_OS_HERMES_HOME=/tmp/kiditem-agent-os-hermes \
AGENT_OS_HERMES_TIMEOUT_MS=180000 \
AGENT_OS_HERMES_MAX_CONCURRENT_RUNS=1 \
AGENT_OS_E2E_ORGANIZATION_ID=<organization-id> \
AGENT_OS_E2E_USER_ID=<user-id> \
rtk npm run agent-os:e2e:hermes-tool-loop
```

The harness creates a neutral Agent OS conversation, asks Hermes Operator to
decide the needed Agent sequence, and executes only the Operator root request.
It fails closed if no Operator root request is created, if the run pauses for
approval, or if the graph does not contain both a sourcing candidate artifact
and a listing prep package with detail/thumbnail draft references. The expected
output includes `conversationId`, `rootRequestId`, `result`, `artifactSummary`,
and an `inspectPath`.

## Failure Modes

| Failure | Expected behavior |
|---|---|
| Missing model | `operator_runtime_model_required` |
| Missing Hermes binary | `operator_runtime_unavailable` |
| Timeout | `operator_runtime_timeout` |
| Non-zero Hermes exit | `operator_runtime_failed` |
| No `agent_os_finalize_task` | `operator_runtime_finalization_missing` |
| Leaf calls `agent_os_create_task` | `mcp_operator_tool_denied` |
| Approval-required tool | Returns `waiting_approval`; side effect is not executed |
| Mixed `kiditem-agent-os` with other Hermes toolsets | `operator_runtime_mixed_toolsets_denied` |
| Finalization references foreign artifacts | `mcp_finalize_artifact_not_visible` |
| Stale approval resolve | `approval_request_not_pending` or `approval_request_not_awaiting_request` |
| Missing e2e sourcing candidate | Harness exits with "did not create a sourcing candidate artifact" |
| Missing e2e listing draft ref | Harness exits with the missing detail/thumbnail reference message |

## Verification Report

Use this format:

```text
Status: DONE | DONE_WITH_CONCERNS | BLOCKED
Scenario:
Artifacts:
Approvals:
External writes:
Tests:
Concerns:
```
