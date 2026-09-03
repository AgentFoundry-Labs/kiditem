# automation — Workflows, Alerts, Action Board, Panel

`src/automation/` owns workflow templates/runs, alert lifecycle, action-board
tasks, marketplace install orchestration, and Live Ops panel projection. It is
not the owner for downstream business mutations. Consume business-domain events
or ports and keep canonical writes with their owners.

## Browser Alert Lifecycle

Browser operation producer policy registers `inventory.sellpia` and stable
Sellpia quality-warning operation keys at the canonical `/inventory-hub`
workspace. Mall collection alerts return to
`/order-collection`; Coupang shipment-summary and Rocket PO alerts use distinct
producers returning to `/coupang-shipments` and `/rocket-orders`.

- Let the authenticated web freshness coordinator own live browser alert
  lifecycle transitions.
- Terminalize an expired Inventory Sellpia lease on the same operation key
  through Inventory's local operation-alert port, preserving the lease owner.
- Reconcile each browser run into one alert and carry monotonic
  collection-attempt ordering metadata on every transition.

Keep workflow nodes deterministic and free of LLM/provider SDK calls. Start LLM
judgment in Agent OS, which may call automation through published incoming ports
or registered workflow capabilities.

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
- Keep Panel as a read-only SSE projection over owner-domain events. Resolve
  links from owner data and keep provider/filesystem work outside Panel.
- Execute only slim-core, allowlisted workflow nodes backed by a domain contract.
- Keep `agent_task.create` and Agent OS runtime imports absent from automation;
  enforce the boundary with `automation-agent-os-boundary.spec.ts`.
- Re-bind `organizationId`, `_workflow_run_id`, and `_workflow_node_id` from
  trusted server state rather than client/template JSON.

## Transitional Exceptions

- `WorkflowRunnerService` still imports the executor registry and passes
  `PrismaService` to executor framework code.
- `adapter/out/panel-event/**`, `adapter/out/workflow-runner/**`, and
  `mapper/panel-event/**` are documented Prisma/projection carve-outs.
