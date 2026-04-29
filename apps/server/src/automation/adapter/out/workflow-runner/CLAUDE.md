# workflow-runner — slim-core workflow executor adapter

이 폴더는 Automation / Agent OS owner domain 의 outgoing workflow-runner
adapter 다. Public HTTP route 는 `src/workflows/` 가 유지하고, 실제 runner
와 executor 구현은 Phase 3C-5 이후 `automation/` 이 소유한다.

## Layout

```
automation/
├── application/service/
│   ├── workflow-orchestration.service.ts  # template CRUD + run creation
│   └── workflow-runner.service.ts         # trusted DAG execution
├── domain/service/
│   ├── workflow-context.ts                # pure output/template context
│   └── workflow-dag.ts                    # pure DAG traversal helper
└── adapter/out/workflow-runner/
    └── executors/
        ├── index.ts                       # registry + executor services
        └── builtin.ts                     # slim-core node registrations
```

## Hard Bans

- No generic DB / HTTP / transform / LLM executor.
- No direct OpenAI, Gemini, Claude, browser, filesystem, or provider SDK calls.
- AI work must use `agent_task.create` and delegate to `AgentRegistryService.runByType`.
- Executors must not trust `company_id`, `_context`, `_workflow_run_id`, or
  `_workflow_node_id` from template/client JSON. The runner strips those keys
  and injects trusted values immediately before execution.
- Do not reintroduce legacy aliases:
  `internal.db_query`, `api_call`, `action`, `data.filter`, `data_transform`,
  `ai_process`, `trigger`, `trigger.event`, `condition`, `notification`.

## Slim-Core Executors

`executors/builtin.ts` may register only:

- `trigger.manual`
- `trigger.schedule`
- `condition.evaluate`
- `notification.alert`
- `agent_task.create`

Adding a new executor must be domain-specific, live next to its input/output
contract, and update `marketplace/workflow-slim-core.ts` in the same PR if
catalog templates are allowed to use it.
