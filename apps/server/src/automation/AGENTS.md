# automation — Workflows, Alerts, Action Board, Panel

Automation owns workflow templates/runs, alert lifecycle, action board tasks,
marketplace install orchestration, and Live Ops panel projection. It is not an
owner for downstream business mutations; owner domains expose events or ports.

## Architecture Mode

Mode: Reconstructed Hexagonal / Projection Adapter.

Workflow orchestration, alert/action services, and marketplace install flows use
application services, outgoing adapters, domain policies, and mappers. Panel is
a read-only projection adapter with its own more-specific instructions under
`adapter/out/panel-event/`.

## Layout

```text
automation/
  automation.module.ts
  adapter/in/http/              workflows, alerts, action tasks, panel routes
  adapter/out/prisma/           repository/query adapters
  adapter/out/panel-event/      SSE projection adapter
  adapter/out/workflow-runner/  slim-core executor adapter
  application/port/out/         runner/repository/cross-domain ports
  application/service/          orchestration and lifecycle services
  domain/policy/                pure action/workflow seed policies
  domain/service/               pure workflow DAG/context helpers
  mapper/                       row/shared/panel mapping
```

## Boundary Rules

- Workflow nodes must not call LLMs or provider SDKs directly. AI work delegates
  through `agent_task.create` and Agent OS.
- Panel code is read-only projection. It must not create/update/delete owner
  domain rows.
- Application services must not import concrete `adapter/out/**`
  implementations.
- Marketplace install code validates allowed workflow nodes before writing
  templates.
- Alerts are the user-facing signal store; personal work is promoted through
  `Alert -> ActionTask`.
- Client/template JSON never supplies trusted `organizationId`,
  `_workflow_run_id`, or `_workflow_node_id`.

## More Specific Guides

- [`adapter/out/panel-event/AGENTS.md`](adapter/out/panel-event/AGENTS.md)
- [`adapter/out/workflow-runner/AGENTS.md`](adapter/out/workflow-runner/AGENTS.md)

## Verification

```bash
npm exec --workspace=apps/server -- vitest run src/automation
npm run build --workspace=apps/server
npm run dev:server
```

Use integration tests when changing workflow execution persistence, Agent OS
delegation, alert/action promotion, panel visibility, or tenant injection.
