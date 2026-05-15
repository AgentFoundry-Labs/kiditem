# workflow-runner — Slim-Core Executor Adapter

This folder owns the Automation outgoing workflow-runner adapter. Public HTTP
workflow routes live in `automation/adapter/in/http/workflow-run-commands.controller.ts`
and `automation/adapter/in/http/workflow-runs.controller.ts`; template CRUD
lives in `automation/adapter/in/http/workflow-templates.controller.ts`.

The workflow engine is a trusted DAG runner with WorkflowRun audit records,
panel projection, and Agent OS delegation. It is not a generic DB/HTTP/LLM/data
processing engine.

## Survival Core

1. DAG traversal in `automation/application/service/workflow-runner.service.ts`
2. `WorkflowRun` audit records scoped by `(id, organizationId)`
3. Panel projection through `PANEL_EVENTS.UPSERT`
4. Agent delegation through `agent_task.create` -> `AgentRunnerPort.runByType`

## Layout

```text
automation/
  adapter/in/http/workflow-templates.controller.ts
  adapter/in/http/workflow-run-commands.controller.ts
  adapter/in/http/workflow-runs.controller.ts
  adapter/in/http/dto/workflows/
  application/service/workflow-orchestration.service.ts
  application/service/workflow-runner.service.ts
  domain/service/workflow-context.ts
  domain/service/workflow-dag.ts
  adapter/out/workflow-runner/executors/
```

## Hard Bans

- No generic DB executor (`internal.db_query`, arbitrary Prisma model access).
- No generic HTTP executor (`api_call`, arbitrary URL fetch).
- No generic transform/action executor without a domain contract.
- No direct LLM/Claude/OpenAI/Gemini SDK calls. AI work must use
  `agent_task.create`.
- No compatibility aliases for removed node types:
  `internal.db_query`, `api_call`, `action`, `data.filter`,
  `data_transform`, `ai_process`, `trigger`, `trigger.event`, `condition`,
  `notification`.
- Executors must not trust `organization_id`, `_context`, `_workflow_run_id`, or
  `_workflow_node_id` from template/client JSON.

Removed node types should fail as unknown executors and record the failure in
`WorkflowRun.error` / `WorkflowRun.steps[].error`.

## Built-In Executors

Only these slim-core node types are registered by default:

| Node type | Responsibility |
|---|---|
| `trigger.manual` | manual entry, no side effect |
| `trigger.schedule` | scheduled entry, no side effect |
| `condition.evaluate` | numeric comparison and branch |
| `notification.alert` | create `Alert` + `ActivityEvent` using trusted org |
| `agent_task.create` | delegate to Agent OS and return request/run metadata |

New executor types must be domain-specific, for example
`coupang.orders.fetch`. Do not add broad platform abstractions.

When catalog templates can use a new executor, update
`executors/slim-core-allowlist.ts` in the same PR so read-side filtering and
install write-side defense stay aligned.

## Tenant Injection

Before each node executes, the runner strips client/template-provided
`organization_id`, `_context`, `_workflow_run_id`, and `_workflow_node_id`, then
injects trusted values from the owning `WorkflowTemplate`, run context, run id,
and node id.

Side-effect executors must use these injected values only. `WorkflowRun` and
template reads/writes stay scoped by `{ id, organizationId }`.

## Execution Flow

```text
POST /api/workflows/:id/run
  -> WorkflowOrchestrationService.triggerRun
  -> create WorkflowRun(pending)
  -> WorkflowRunnerService.runWorkflow(runId, templateId, organizationId)
  -> execute DAG nodes
  -> record steps
  -> mark succeeded/failed
  -> emit panel upsert
```

Batch run executes workflow runs sequentially.

## Output And Errors

- Executor files own their own output contract. There is no global `Standard*`
  normalization layer.
- Common shapes: `{ rows, count }`, `{ orders, count }`, `{ success }`,
  `{ items, overThreshold, underThreshold }`.
- Throwing inside an executor records a user-readable Korean error and stops the
  workflow.
- No silent swallow and no executor-local retry.

## Verification

```bash
npm exec --workspace=apps/server -- vitest run src/automation
npm run build --workspace=apps/server
npm run dev:server
```
