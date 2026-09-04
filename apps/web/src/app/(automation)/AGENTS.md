# web/automation - Agent OS UI

`app/(automation)/` owns the Agent OS instance and run screens under `agents/`.
It presents backend-owned automation state; deterministic execution remains in
the backend.

## Owned Surfaces

- Agent OS instance/run/request read screens

## Data Flow

```text
React Query + route-local hooks
  -> /api/agent-os/*
```

## State Rules

- Use `queryKeys.agents` for Agent OS cache boundaries.

## Boundary Rules

- Start Agent OS runs through the backend API and preserve its organization
  scope.
- Keep API calls in route-local hooks/lib rather than inlining them in
  `page.tsx`.
