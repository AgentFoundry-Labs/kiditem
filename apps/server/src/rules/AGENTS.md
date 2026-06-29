Consult this document first instead of relying on memorized knowledge.

# rules — Business Policy Rules

`src/rules/` owns business rule definitions, thresholds, evaluation result
post-processing, activity events, critical alerts, and panel emits. Actual rule
evaluation is asynchronous Agent OS work.

## Folder Map

```text
rules/
├── rules.module.ts
├── rules.controller.ts
├── rules.service.ts
├── dto/
├── adapter/out/automation/   # operation-alert adapter
└── application/port/out/     # rules-local operation-alert port
```

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
- Agent OS run rows store asynchronous evaluation/suggestion execution state.
- `ActivityEvent`, `Alert`, and panel events are projections of results.

## Evaluation Flow

```text
POST /api/rules/evaluate
  -> AGENT_RUNNER_PORT.runByType('rules_evaluation')
  -> AgentRunRequest
  -> client polls AgentObservabilityService
  -> Agent OS run writes resultJson
  -> bridge invokes RulesService.processEvaluationResult
  -> healthScore update + ActivityEvent + Alert + panel emit
```

Synchronous in-service evaluation is forbidden.

## Cross-Domain Ports

- Rules delegates agent work through `AGENT_RUNNER_PORT`.
- Rules reads Agent OS status through `AgentObservabilityService`.
- Operation-alert lifecycle writes go through `RULES_OPERATION_ALERT_PORT`.
- Alerts HTTP/API ownership is automation, not rules.

## Boundary Rules

- Rules code must not import Agent OS runtime adapters or legacy
  agent-registry modules.
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
