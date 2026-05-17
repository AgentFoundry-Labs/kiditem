# rules — Business Policy Rules

Rules owns business rule definitions, thresholds, evaluation result
post-processing, activity events, critical alerts, and panel emits. Actual rule
evaluation is asynchronous Agent OS work.

Rules stays flat only around HTTP orchestration and result post-processing.
Async evaluation must go through Agent OS ports. If rule execution, scheduling,
provider/runtime behavior, or sink/reconcile logic grows here, split it behind
application ports and owner-domain adapters.

## Boundary

- Controllers depend on `RulesService`.
- `RulesService` uses `AGENT_RUNNER_PORT` and `AgentObservabilityService`
  through `RulesModule.imports = [AgentOsModule]`.
- Rules code must not import Agent OS runtime adapters or legacy
  agent-registry modules.
- Alerts HTTP/API ownership is automation, not rules.
- Operation-alert lifecycle writes go through `RULES_OPERATION_ALERT_PORT` and
  `adapter/out/automation/operation-alert.adapter.ts`; rules code must not
  inject automation's `OperationAlertService` directly.

## Routes

| Route | Responsibility |
|---|---|
| `POST /api/rules/evaluate` | enqueue `rules_evaluation`, return request status |
| `GET /api/rules/evaluate/status/:requestId` | poll Agent OS request |
| `GET /api/rules` | organization/category rule list |
| `PATCH /api/rules/:id` | tenant-scoped rule update |
| `GET /api/rules/suggest-thresholds` | enqueue `rules_suggest` |
| `GET /api/rules/summary` | healthScore distribution and top critical |

`GET/PATCH /api/rules/schedule` is removed. Reintroduce scheduling only through
a new Agent OS schedule surface and scoped plan.

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

## Result Processing

- `healthScore` updates use `updateMany({ where: { id, organizationId } })`
  inside `prisma.$transaction(...)`.
- Unsafe raw SQL APIs are forbidden.
- Critical violations create alerts; all violations create activity events.
- `PANEL_EMIT_BATCH_CAP = 50`; larger batches emit one summary item.
- Panel emit failures are caught so alert/result persistence still completes.

## Hard Bans

- Synchronous rule evaluation.
- Hardcoded rule logic in service code; definitions live in `BusinessRule` plus
  agent prompt behavior.
- `$queryRawUnsafe` / `$executeRawUnsafe`.
- Legacy agent models or imports:
  `AgentTask`, `AgentDefinition`, `HeartbeatRun`, `AgentEvent`, `AgentLog`,
  `AgentWakeupRequest`, `agent-registry/*`.
- `@OnEvent(AGENT_EVENTS.RESULT_READY)`.

## Change Map

| Change | Also update |
|---|---|
| agent result shape | prompt + `processEvaluationResult` + tests + bridge |
| rule category | seed/data migration + list filter + frontend enum |
| bulk update | transaction scope + service/controller tests |
| schedule surface | Agent OS schedule plan + backend/frontend contracts |

## Verification

```bash
npm exec --workspace=apps/server -- vitest run src/rules
npm run build --workspace=apps/server
npm run dev:server
```
