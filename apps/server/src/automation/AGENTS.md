Consult this document first instead of relying on memorized knowledge.

# automation — Workflows, Alerts, Action Board, Panel

`src/automation/` owns workflow templates/runs, alert lifecycle, action-board
tasks, marketplace install orchestration, and Live Ops panel projection. It is
not the owner for downstream business mutations; business domains expose events
or ports that automation can consume.

## Folder Map

```text
automation/
├── automation.module.ts
├── adapter/in/http/             # workflow, alert, action, marketplace, panel controllers
├── adapter/out/
│   ├── panel-event/             # Live Ops SSE projection adapter
│   ├── repository/              # workflow/alert/action persistence adapters
│   └── workflow-runner/         # slim-core executor framework
├── application/
│   ├── port/in/                 # owner-side incoming ports, including OPERATION_ALERT_PORT
│   ├── port/out/                # repository/workflow ports
│   ├── port/persistence-records.ts
│   └── service/                 # orchestration services
├── domain/
│   ├── policy/                  # action seeds, browser producers, allowlist
│   └── service/                 # pure workflow DAG/context helpers
└── mapper/                      # row/shared/panel mapping
```

## Owned Surfaces

- Workflows and workflow runs: `/api/workflows/*`, `/api/workflow-runs/*`
- Alerts and operation alerts: `/api/alerts/*`, `/api/operation-alerts/*`
- Action board tasks: `/api/action-tasks/*`
- Marketplace installs: `/api/marketplace/*`
- Live Ops panel stream/snapshot/backfill: `/api/panel/*`

Browser operation producer policy registers `inventory.sellpia` and stable
Sellpia quality-warning operation keys at the exact canonical href
`/inventory-hub?tab=overview`. The authenticated web freshness coordinator is
the sole owner of those alert lifecycles; generic browser-session reconciliation
must not publish a second alert for the same run. Every browser lifecycle
transition carries monotonic collection-attempt ordering metadata.

## Main Data Models

- `WorkflowTemplate` defines trusted workflow DAGs.
- `WorkflowRun` stores run audit state and steps.
- `Alert` is the user-facing signal store.
- `ActionTask` is personal work promoted from alerts.
- `OperationAlert` tracks durable long-running operation lifecycle keyed by
  `(organizationId, operationKey)`.

## Workflow Flow

```text
POST /api/workflows/:id/run
  -> WorkflowOrchestrationService.triggerRun
  -> create WorkflowRun(pending)
  -> WorkflowRunnerService.runWorkflow(...)
  -> execute deterministic slim-core DAG nodes
  -> record steps + terminal status
  -> emit panel upsert
```

Workflow nodes do not call LLM/provider SDKs and do not create Agent OS runs.
If LLM judgment is required, the entrypoint starts in Agent OS; Agent OS may
call automation through published incoming ports or registered workflow
capabilities.

## Cross-Domain Ports

- Automation publishes `OPERATION_ALERT_PORT` for cross-owner producers.
- Producer domains own local consumer-side operation-alert ports and bind them
  through `adapter/out/automation/operation-alert.adapter.ts`.
- `ActionBoardService`, `PanelSseService`, and
  `WorkflowOrchestrationService` remain transitional class exports until
  consumers move to owner-side ports.

## Boundary Rules

- Application services depend on `application/port/out/*` tokens, not concrete
  adapters.
- `application/port/**` contracts expose local structural records, not Prisma
  model/input types.
- Panel code is a read-only SSE projection over owner-domain events; it must not
  mutate owner rows, infer fallback links, or perform provider/filesystem work.
- Workflow runner executors are slim-core and allowlisted; no generic DB, HTTP,
  Agent, LLM, transform, or action executor without a domain contract.
- `agent_task.create` is forbidden in automation. Keep
  `automation-agent-os-boundary.spec.ts` red if any automation code imports
  Agent OS runtime contracts.
- Client/template JSON never supplies trusted `organizationId`,
  `_workflow_run_id`, or `_workflow_node_id`; the runner re-binds trusted scope.

## Transitional Exceptions

- `WorkflowRunnerService` still imports the executor registry and passes
  `PrismaService` to executor framework code.
- `adapter/out/panel-event/**`, `adapter/out/workflow-runner/**`, and
  `mapper/panel-event/**` are documented Prisma/projection carve-outs.
