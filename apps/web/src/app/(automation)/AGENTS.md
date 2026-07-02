Consult this document first instead of relying on memorized knowledge.

# web/automation - Workflows, Agents, Marketplace, Action Board

`app/(automation)/` owns workflow management UI, agent runtime lists, workflow
and agent marketplace screens, and the action board. It presents backend-owned
automation state; deterministic workflow execution remains in the backend.

## Owned Surfaces

- Workflow list, activation, deletion, and run navigation
- Agent OS instance/run/request read screens
- Marketplace install/uninstall for workflows and agents
- Action task claim, note, execute, and status updates

## Data Flow

```text
React Query + route-local hooks
  -> /api/workflows, /api/workflow-runs
  -> /api/agent-os/*
  -> /api/marketplace/*
  -> /api/action-tasks
```

## State Rules

- Use `queryKeys.workflows`, `queryKeys.agents`, `queryKeys.marketplace`, and
  `queryKeys.actionTasks` for cache boundaries.
- Marketplace install/uninstall invalidates both marketplace keys and the
  installed domain keys (`workflows` or `agents`).
- Action board mutations invalidate `queryKeys.actionTasks.all`.
- Keep marketplace API/types/hooks in `_shared/marketplace/` while only
  automation routes consume them.

## Boundary Rules

- Do not create Agent OS runs from deterministic workflow code unless the
  backend API explicitly models that action.
- Do not inline workflow API calls in `page.tsx`; use route-local hooks/lib.
- Do not add polling or streaming to workflow pages without documenting the
  query key and backend event source.
