# automation — Workflows, Alerts, Action Board, Panel

Automation owns workflow templates/runs, alert lifecycle, action board tasks,
marketplace install orchestration, and Live Ops panel projection. It is not an
owner for downstream business mutations; owner domains expose events or ports.

Automation is hexagonal-complete on the application/persistence boundary: 6
outgoing repository ports back the application services, `OPERATION_ALERT_PORT`
publishes the operation-alert lifecycle owner-side so cross-domain producers
can depend on a token instead of a concrete service, and the architecture
spec freezes both invariants. Application ports expose local structural record
types from `application/port/persistence-records.ts`; Prisma model/input types
stay behind outgoing adapters. The only documented carve-out is
`WorkflowRunnerService`, which still holds `PrismaService` because the
workflow executor framework (`adapter/out/workflow-runner/executors/*`) takes
prisma as an argument by design.

## Layout

```text
automation/
  automation.module.ts
  adapter/in/http/                /api/{workflows,workflow-runs,alerts,operation-alerts,action-tasks,marketplace/*,panel}/* route-family controllers + DTO
  adapter/out/repository/         6 *.repository.adapter.ts (PrismaService here only, plus carve-outs)
  adapter/out/panel-event/        SSE projection adapter (panel.service, panel-sse.service, panel-events constants)
  adapter/out/workflow-runner/    slim-core executor framework (executors/* take PrismaService directly)
  application/port/persistence-records.ts local structural row types shared by ports/services
  application/port/in/            owner-side incoming ports — OPERATION_ALERT_PORT published for cross-domain consumers
  application/port/out/           6 outgoing ports (Symbol tokens + interfaces)
  application/service/            orchestration services; WorkflowRunnerService carve-out for executor pass-through
  domain/policy/                  pure rules — action seeds, browser operation producers, slim-core allowlist
  domain/service/                 pure workflow DAG/context helpers
  mapper/                         row/shared/panel mapping (panel-event mapper takes PrismaService)
```

### Outgoing ports

| Port | Capability |
|---|---|
| `action-board.repository.port` | inventory/master-product reads for warnings; daily action seed upsert; claim/unclaim; list with assignee + source alerts |
| `alerts.repository.port` | unread feed; mark read/all-read; transactional promote-to-task with P2002 race guard + ownership claim; dismiss |
| `marketplace-catalog.repository.port` | published workflow + agent rows; per-org install lookup via `WorkflowTemplate` |
| `marketplace-install-store.port` | workflow install/uninstall + install-count delta |
| `operation-alert.repository.port` | Operation alert upsert, transitions, source/key lookups, and stale-close criteria |
| `workflow-orchestration.repository.port` | template CRUD; scoped run create + read; panel envelope hydration |

### Incoming port — owner-side publish

| Port | Capability |
|---|---|
| `application/port/in/operation-alert.port` | Operation lifecycle publish port for cross-owner-domain producers |

`operation-alert.repository.port` keys operation alerts by
`(organizationId, operationKey)`. Cross-owner producers bind their consumer-side
adapter to `OPERATION_ALERT_PORT` instead of injecting `OperationAlertService`.

## Architecture Guards

Invariants enforced by `__tests__/automation.architecture.spec.ts`:

- `PrismaService` is imported only under `adapter/out/repository/**` plus
  the documented carve-outs:
  - `application/service/workflow-runner.service.ts` (executor framework)
  - `adapter/out/panel-event/**` (SSE projection lane)
  - `adapter/out/workflow-runner/**` (executor framework)
  - `mapper/panel-event/**` (panel envelope mapper)
- No `*persistence.ts` files survive (migration-waypoint naming).
- `application/**` is Prisma-free (no `@prisma/client` or `Prisma.*` types)
  outside the `WorkflowRunnerService` carve-out.
- `application/port/**` contracts expose local structural records only; do
  not import Prisma model or input types into incoming/outgoing ports.
- `application/service/**` does not import `adapter/out/**`; concrete
  adapters reach application code only via Nest token bindings to
  `application/port/out/*`. WorkflowRunnerService is the carve-out — it
  imports the executor registry under `adapter/out/workflow-runner/` while
  that framework still requires direct PrismaService access.
- `adapter/in/http/**` does not import outgoing ports or repository
  adapters directly; application services own orchestration.
- `application/service/**` does not import other owner-domain services
  directly; cross-owner reach must go through `adapter/out/{owner}/`.
- `domain/**` is free of NestJS, Prisma, `PrismaService`, HTTP DTO
  classes, and incoming-adapter modules, and does not depend on
  application contracts.
- Outgoing port contracts keep local DTO/record shapes and do not import
  concrete helpers, adapter implementations, or ORM model/input types.
- No top-level `dto/`, `util/`, `services/`, or `adapter/out/prisma/`
  folders remain. Final shape uses `adapter/in/http/dto/`, `domain/util/`,
  and `adapter/out/repository/`.

`__tests__/automation.module.wiring.spec.ts` freezes the @Module()
metadata: imports, controllers (10), repository adapters (6) +
panel-event services, application services (8), 7 port bindings via
`useExisting` (6 outgoing + 1 incoming), the `OPERATION_ALERT_PORT`
export, and every controller's public `/api/...` route prefix.

## Boundary Rules

- Workflow nodes must not call LLMs or provider SDKs directly. AI work
  delegates through `agent_task.create` and Agent OS.
- Panel code is read-only projection. It must not create/update/delete
  owner-domain rows.
- Application services depend on `application/port/out/*` tokens, not
  concrete `adapter/out/**` files (WorkflowRunnerService carve-out
  documented above).
- Marketplace install code validates allowed workflow nodes (slim-core
  allowlist) via `domain/policy/slim-core-allowlist` before writing
  templates.
- Alerts are the user-facing signal store; personal work is promoted
  through `Alert -> ActionTask` with a transactional race guard owned
  by `alerts.repository.adapter`.
- Client/template JSON never supplies trusted `organizationId`,
  `_workflow_run_id`, or `_workflow_node_id`. The runner re-binds
  trusted scope on every Prisma read and write.

## Cross-Domain Boundary

Automation publishes the owner-side incoming port `OPERATION_ALERT_PORT`
from `application/port/in/operation-alert.port.ts` for cross-owner-domain
producers (advertising / ai / channels / finance / rules / sourcing /
analytics-traffic). The advertising domain's `adapter/out/automation/
operation-alert.adapter.ts` already binds to this token; the remaining
domains will swap their direct `OperationAlertService` imports as their
own reconstruction PRs land.

Until those swaps complete, `OperationAlertService`, `ActionBoardService`,
`PanelSseService`, and `WorkflowOrchestrationService` remain in the
module `exports` list as transitional class exports. Each consumer's
reconstruction PR must move to `OPERATION_ALERT_PORT` and drop its
direct class injection; once that completes the class exports retire.

## More Specific Guides

- [`adapter/out/panel-event/AGENTS.md`](adapter/out/panel-event/AGENTS.md)
- [`adapter/out/workflow-runner/AGENTS.md`](adapter/out/workflow-runner/AGENTS.md)

## Verification

```bash
npm exec --workspace=apps/server -- vitest run src/automation
npm run build --workspace=apps/server
npm run dev:server
```

Use integration tests when changing workflow execution persistence, Agent
OS delegation, alert/action promotion, panel visibility, or tenant
injection. The architecture + module wiring specs
(`automation.architecture.spec.ts`,
`automation.module.wiring.spec.ts`) must stay green.
