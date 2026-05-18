# workflow-runner — Slim-Core Executor Adapter

`src/automation/adapter/out/workflow-runner/` owns the Automation outgoing
workflow-runner adapter. It is a trusted DAG runner with `WorkflowRun` audit
records, panel projection, and Agent OS delegation. It is not a generic
DB/HTTP/LLM/data processing engine.

## Folder Map

```text
automation/
├── adapter/in/http/workflow-templates.controller.ts
├── adapter/in/http/workflow-run-commands.controller.ts
├── adapter/in/http/workflow-runs.controller.ts
├── adapter/in/http/dto/workflows/
├── application/service/workflow-orchestration.service.ts
├── application/service/workflow-runner.service.ts
├── domain/service/workflow-context.ts
├── domain/service/workflow-dag.ts
└── adapter/out/workflow-runner/executors/
```

## Owned Surfaces

- Slim-core executor registry
- Built-in executor implementations
- Tenant injection and step output/error contracts

## Survival Core

1. DAG traversal in `WorkflowRunnerService`.
2. `WorkflowRun` audit records scoped by `(id, organizationId)`.
3. Panel projection through `PANEL_EVENTS.UPSERT`.
4. Agent delegation through `agent_task.create` ->
   `AgentRunnerPort.runByType`.

## Built-In Executors

| Node type | Responsibility |
|---|---|
| `trigger.manual` | manual entry, no side effect |
| `trigger.schedule` | scheduled entry, no side effect |
| `condition.evaluate` | numeric comparison and branch |
| `notification.alert` | create `Alert` + `ActivityEvent` using trusted org |
| `agent_task.create` | delegate to Agent OS and return request/run metadata |

New executor types must be domain-specific. When catalog templates may use a
new executor, update `executors/slim-core-allowlist.ts` in the same PR.

## Boundary Rules

- No generic DB executor, arbitrary Prisma model access, generic HTTP executor,
  arbitrary URL fetch, or generic transform/action executor without a domain
  contract.
- No direct LLM/Claude/OpenAI/Gemini SDK calls. AI work must use
  `agent_task.create`.
- No compatibility aliases for removed node types.
- Executors must not trust `organization_id`, `_context`, `_workflow_run_id`,
  or `_workflow_node_id` from template/client JSON.
- Before each node executes, the runner strips untrusted scope fields and
  injects trusted organization, run, and node values.
- Executor files own their own output contract; no global `Standard*`
  normalization layer.

## Transitional Exceptions

- `WorkflowRunnerService` still passes Prisma into executor framework code by
  design. Do not expand this into arbitrary application-service Prisma access.
