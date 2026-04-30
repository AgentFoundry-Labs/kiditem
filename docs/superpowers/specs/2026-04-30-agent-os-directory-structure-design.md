# Agent OS Directory Structure Design

**Date:** 2026-04-30
**Scope:** `apps/server/src/{automation,agent-registry,rules,advertising}` and direct imports that depend on the Agent OS runtime.
**Status:** Approved direction for the next backend cleanup lane.

## Goal

Make the backend folder topology express ownership clearly before importing code from remote branches. Public API paths can remain compatibility surfaces, but physical folders should describe the owner domain or platform boundary.

## Ownership Model

Backend top-level folders are owner domains or platform roots, not URL names.

Business owner domains:

```text
products/
sourcing/
inventory/
orders/
finance/
channels/
advertising/
ai/
analytics/
rules/
```

Platform and infrastructure roots:

```text
auth/
companies/
common/
prisma/
feature-gate/
uploads/
chat/
activity-events/
```

Agent OS / automation root:

```text
automation/
```

`rules/` remains a business policy domain. It owns rule definitions, thresholds, evaluation state, and result post-processing. It may request Agent OS work through an explicit automation port, but it must not directly inject Agent Registry runtime services.

`automation/` is the single physical owner for Agent OS runtime capabilities: workflow runner, agent task runner, agent registry compatibility API, action board, alerts, marketplace install/catalog, panel events, heartbeat, wakeup, safety, permissions, delegation, and trace.

## Target Automation Layout

```text
apps/server/src/automation/
  automation.module.ts

  adapter/
    in/
      http/
        agent-registry.controller.ts
        agent-trace.controller.ts
        manager.controller.ts
        workflows.controller.ts
        action-task.controller.ts
        alerts.controller.ts
        marketplace.controller.ts
        panel.controller.ts
        dto/
          agent-registry/
          agent-trace/
          manager/
          workflows/
    out/
      agent-runtime/
        agent-runner.adapter.ts
        agent-schedule-control.adapter.ts
        agent-events.ts
        registry.ts
        fallback-chain.ts
        types.ts
      workflow-runner/
      repository/
      panel-event/

  application/
    port/
      in/
        agent-runner.port.ts
        agent-schedule-control.port.ts
      out/
        marketplace-install-store.port.ts
    service/
      agent/
        agent-registry.service.ts
        agent-crud.service.ts
        agent-run.service.ts
        agent-lifecycle.service.ts
        agent-cost-analytics.service.ts
        heartbeat.service.ts
        wakeup.service.ts
        manager.service.ts
        trace.service.ts
      workflow/
      action-board/
      alerts/
      marketplace/
      panel/

  domain/
    model/
    policy/
      action-seeds.ts
      permissions/
      safety/
      business-safety/
    service/
      workflow-context.ts
      workflow-dag.ts

  mapper/
    panel-event/
```

Folders are created only when code moves into them. Empty target folders are not added.

## Compatibility Policy

Public routes must stay stable:

- `/api/agent-registry/*`
- `/api/agent-registry/tasks/:id/trace`
- `/api/manager/*`
- `/api/ad-agent/*`
- `/api/rules/*`
- `/api/workflows/*`
- `/api/workflow-runs/*`
- `/api/action-tasks/*`
- `/api/alerts/*`
- `/api/marketplace/*`
- `/api/panel/*`

The top-level `agent-registry/` folder may temporarily remain as a compatibility shim while imports migrate. That shim may re-export the automation-owned service and host `AgentRegistryModule` until the module registration can be collapsed safely. It must not grow new implementation code.

## Boundary Decisions

1. `rules/` is not folded into `automation/`.
   It is a business policy domain. Agent execution is a runtime dependency reached through an automation port.

2. `agent-registry/domains/manager` belongs to `automation/`.
   It is an Agent OS operator surface that dispatches other agents and records manager responses.

3. `agent-registry/domains/ad-strategy` belongs to `advertising/`.
   The public `/api/ad-agent/*` route can remain, but the physical implementation is advertising-owned because it records advertising strategy runs and activity events.

4. `AgentRegistryService` remains a compatibility token during migration.
   Its implementation can move to `automation/application/service/agent/agent-registry.service.ts`, while the old path re-exports it until all direct imports are replaced by explicit ports.

5. Cross-domain business services should not directly inject `AgentRegistryService`.
   They should inject a domain-local port or an automation-owned Agent Runner port. Existing reconstructed ports in sourcing are the preferred pattern.

## Non-Goals

- No Prisma schema changes.
- No public route renames.
- No workflow runner behavior changes.
- No marketplace catalog behavior changes.
- No bulk Agent OS move in a single PR.
- No frontend changes unless a moved route accidentally exposes a contract mismatch.

## Verification

Every implementation PR in this lane must run:

```bash
git diff --check
npm run check:idor
npm run check:tenant-scope
npm exec --workspace=apps/server -- vitest run src/automation src/agent-registry src/rules src/advertising
npm run build --workspace=apps/server
```

If a PR only touches documentation, `git diff --check` is sufficient.
