# rules — Business Policy Rules

`src/rules/` owns business rule definitions, thresholds, evaluation result
post-processing, activity events, critical alerts, and panel emits. Actual rule
evaluation is deterministic Operations work.

Current deterministic evaluation runs through the Rules-owned Operation and
applies health-score updates plus user-facing projections through the Rules
result boundary. Keep removed schedule and threshold-suggestion routes absent;
new scheduling requires a scoped plan.

## Cross-Domain Ports

- Rules evaluation starts through `OPERATION_RUNNER_PORT`; status reads use the
  same organization-scoped owner Operation.
- Rules result application is published as `APPLY_RULES_EVALUATION_PORT` and
  receives the owner Operation identity, never legacy run/request identity.
- Operation-alert lifecycle writes go through `RULES_OPERATION_ALERT_PORT`.
- Alerts HTTP/API ownership is automation, not rules.

## Boundary Rules

- Rules application services must not import Agent OS, generic runner ports,
  legacy execution types, or finalized-event bridges.
- `healthScore` updates use tenant-scoped `updateMany` inside a transaction.
- Unsafe raw SQL APIs are forbidden.
- Critical violations create alerts; all violations create activity events.
- Panel emit failures are caught so alert/result persistence still completes.
- Rule logic lives in `BusinessRule` definitions plus agent prompt behavior, not
  hardcoded service branches.

## Transitional Exceptions

- Rules stays flat only around HTTP orchestration and result post-processing.
  Rule execution, scheduling, provider/runtime behavior, or sink/reconcile
  growth should move behind application ports and owner-domain adapters.
