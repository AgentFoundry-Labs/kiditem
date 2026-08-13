# interaction-gateway — CopilotKit OSS / AG-UI Edge

This workspace owns the browser-facing CopilotKit Runtime v2 endpoint and the
private AG-UI bridge into KidItem Agent OS.

## Boundaries

- Use only the exact repository-locked CopilotKit OSS and AG-UI package train.
- KidItem owns sessions, replay, execution durability, and authorization. The
  gateway must not introduce a vendor transcript or managed-thread store.
- Browser identity is an opaque session cookie. Never forward browser
  `authorization`, organization, role, model, policy, capability, or arbitrary
  `x-*` headers downstream.
- Every run obtains a browser-authenticated intent, exchanges it through the
  service-authenticated control plane, and only then calls the private AG-UI
  route.
- Reconnect is read-only: authorize ownership, replay validated KidItem events,
  then join the private live stream at the server-issued boundary.
- Stop re-authorizes ownership and targets the exact active execution.
- Do not use CopilotKit Intelligence, Enterprise configuration, `useThreads`,
  or managed thread endpoints.

## Verification

```bash
npm test --workspace=apps/interaction-gateway
npm run build --workspace=apps/interaction-gateway
npm run check:copilotkit-train
```
