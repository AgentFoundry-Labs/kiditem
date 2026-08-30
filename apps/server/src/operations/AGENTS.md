# operations — Unified Operation Control Plane

`operations/` is the platform owner for the code-owned operation catalog,
organization-scoped schedules, top-level execution ledger, engine dispatch,
and browser-runtime leases.

## Boundary

- Operations never writes canonical business rows. Owner modules register
  handlers that call their own incoming capabilities and persist their own
  results.
- Screens, schedules, and Agent OS share the Operations incoming port.
- Operations may invoke Automation workflow, owner handlers, or AI direct-job
  ports. Deterministic automation must never create provider conversations.
- `OperationAlert` is a notification projection, not the execution ledger.
- Browser leases are fenced by `attemptToken`; stale heartbeat/report attempts
  are rejected.
- Every mutation and every single-run read is organization-scoped.
- Only the API application graph reaches OperationsModule. Production has
  exactly one API lifecycle; no API replica or rolling overlap is supported.
  The private MCP adapter may read one organization-scoped `OperationRun`
  through `OPERATION_RUNNER_PORT`; it never queries the repository directly or
  turns a status read into polling/reasoning. Owner capabilities enqueue work
  with their exact idempotency key.
- Code-owned `ephemeral_on_success` definitions are excluded by the repository
  query before a public-list `limit` is applied. The service's defensive filter
  is not sufficient because newer hidden rows must not starve retained rows.
- A retry requeue clears `deadline_at`; the next database claim establishes its
  own attempt deadline from database time. Never carry a predecessor attempt's
  deadline into the successor queue row.
- The API gate progresses BOOTSTRAPPING -> ACCEPTING -> STOPPING -> STOPPED.
  Startup cleanup is fail-closed and bounded to 30s; graceful cancellation and
  handler cleanup are bounded to 5s. Startup uses
  operation_server_lifecycle_expired and graceful shutdown uses
  operation_server_shutdown.
- A lifecycle-cancelled row is immutable audit history. Never reclaim, requeue,
  decrement attempts, or reactivate it; an explicit retry after ACCEPTING starts
  a new row.
- OPERATION_RESOURCE_CLASS_LIMITS, when set, is a complete strict positive JSON
  map for default, naver_api, playwright_1688, snapshot_compute, and
  extension_coupang. Invalid or partial configuration must fail API boot.

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
