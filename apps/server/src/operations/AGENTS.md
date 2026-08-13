# operations — Unified Operation Control Plane

`operations/` is the platform owner for the code-owned operation catalog,
organization-scoped schedules, top-level execution ledger, engine dispatch,
and browser-runtime leases.

## Boundary

- Operations never writes canonical business rows. Owner modules register
  handlers that call their own incoming capabilities and persist their own
  results.
- Screens, schedules, and Agent OS share the Operations incoming port.
- Operations may invoke Automation workflow, Agent OS runner, or AI direct-job
  ports. Automation must never create Agent OS runs.
- `OperationAlert` is a notification projection, not the execution ledger.
- Browser leases are fenced by `attemptToken`; stale heartbeat/report attempts
  are rejected.
- Every mutation and every single-run read is organization-scoped.

## Layout

```text
operations/
├── adapter/in/http/        # operation, schedule, browser-runtime APIs
├── adapter/out/            # repository, panel projection adapters
├── application/port/in/    # common runner and handler registration ports
├── application/port/out/   # repository and native-runtime ports
├── application/service/    # dispatch, schedule, run, and worker orchestration
├── domain/                 # pure state-transition and scheduling policies
└── operations.module.ts    # public platform wiring
```
