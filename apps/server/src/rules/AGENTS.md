# rules — Business Policy Rules

`src/rules/` owns business rule definitions, thresholds, evaluation result
post-processing, activity events, critical alerts, and panel emits. Actual rule
evaluation is asynchronous Agent OS work.

## Owned Surfaces

- Rule evaluation enqueue: `POST /api/rules/evaluate`
- Evaluation status polling: `GET /api/rules/evaluate/status/:requestId`
- Rule list/update: `GET /api/rules`, `PATCH /api/rules/:id`
- Threshold suggestion: `GET /api/rules/suggest-thresholds`
- Rule summary: `GET /api/rules/summary`

`GET/PATCH /api/rules/schedule` is removed. Reintroduce scheduling only through
a new Agent OS schedule surface and scoped plan.

## Main Data Models

- `BusinessRule` stores rule definitions and thresholds.
- `OperationRun` stores deterministic rule-evaluation execution state.
- Official AgentSession/task/execution resources store threshold-suggestion judgment state.
- `ActivityEvent`, `Alert`, and panel events are projections of results.

## Evaluation Flow

```text
POST /api/rules/evaluate
  -> Rules-owned `rules.evaluate` Operation
  -> client polls the owner Operation identity
  -> RulesEvaluationOperationHandler
  -> APPLY_RULES_EVALUATION_PORT
  -> healthScore update + ActivityEvent + Alert + panel emit
```

Threshold suggestion is human-originated judgment only:

```text
GET /api/rules/suggest-thresholds
  -> RULES_JUDGMENT_PORT
  -> Agent OS official judgment submission
  -> canonical session/task/execution/operation resources
```

Suggestions require an authenticated actor. Scheduled work must use the
Rules-owned Operation; Rules does not create generic runtime work.

## Cross-Domain Ports

- Rules evaluation starts through `OPERATION_RUNNER_PORT`; status reads use the
  same organization-scoped owner Operation.
- Rules threshold judgment uses `RULES_JUDGMENT_PORT`; its adapter alone may
  inject `AGENT_JUDGMENT_SUBMISSION_PORT`.
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
