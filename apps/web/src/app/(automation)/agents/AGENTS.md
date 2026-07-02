Consult this document first instead of relying on memorized knowledge.

# web/agents - Agent OS Runtime Views

`agents/` owns automation-facing Agent OS read screens for instances, runs,
requests, events, traces, runtime state, and cost analytics.

## Owned Surfaces

- Agent instance summary lists
- Agent run/request/event readers
- Agent runtime state and trace readers

## State Rules

- Use route-local `lib/agent-os-api.ts` for `/api/agent-os/*` calls.
- Use `queryKeys.agents.*` for cache boundaries.
- Keep run/request filters in query params or local route state; backend owns
  run lifecycle and state transitions.

## Boundary Rules

- Do not create Agent OS runs from this UI unless the explicit backend endpoint
  models that action.
- Do not add deterministic workflow behavior here; workflows remain under
  `workflows/` and backend automation services.
- Do not bypass shared `apiClient` auth behavior.
