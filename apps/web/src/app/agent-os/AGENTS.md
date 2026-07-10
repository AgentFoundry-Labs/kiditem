Consult this document first instead of relying on memorized knowledge.

# web/agent-os - Agent OS HQ

`agent-os/` owns the canonical fullscreen Agent OS HQ route at `/agent-os`.
The legacy `/agents` route redirects here and must not contain a second Agent
OS implementation.

## Owned Surfaces

- Virtual office view of Agent OS employees and attached capabilities
- Agent OS conversation command entry
- Agent instance, run, request, approval, cost, and authorization summaries

## State Rules

- Use route-local `lib/agent-os-api.ts` for `/api/agent-os/*` calls.
- Use `queryKeys.agents.*` for cache boundaries.
- Keep run/request filters in route-local state or query params; backend owns
  run lifecycle and state transitions.

## Boundary Rules

- Do not create Agent OS runs from this UI unless the explicit backend endpoint
  models that action.
- Do not add deterministic workflow behavior here; workflows remain under
  `app/(automation)/workflows/` and backend automation services.
- Do not bypass shared `apiClient` auth behavior.
- Do not add a second `/agents` implementation; keep it as redirect-only.
