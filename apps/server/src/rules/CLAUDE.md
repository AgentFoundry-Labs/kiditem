Before working in this directory, always read this document first rather than relying on memory.

# rules — Business Policy Rules

`src/rules/` owns business rule definitions, thresholds, deterministic
evaluation, result post-processing, activity events, and critical alerts.

Current deterministic evaluation runs synchronously through the Rules service
and applies health-score updates plus user-facing projections in one
organization-scoped transaction. Keep removed schedule and threshold-suggestion
routes absent; new scheduling requires a scoped plan.

## Cross-Domain Ports

- Rules evaluation consumes the authenticated organization/user and HTTP
  idempotency key; `RulesEvaluationApplication.requestId` is the stable
  Rules-owned receipt identity.
- Rules writes critical Alert projections in the same transaction as its receipt;
  the focused Alerts owner remains responsible for the Alert HTTP surface and
  source-failure lifecycle.
- Alerts HTTP/API ownership is the focused `alerts/` owner, not rules.

## Boundary Rules

- Keep Rules application services synchronous and use the Rules evaluator,
  persistence, and Alerts capabilities for their respective responsibilities.
- `healthScore` updates use organization-scoped `updateMany` inside a transaction.
- Raw SQL uses tagged templates with whitelisted identifiers; prefer Prisma
  queries for ordinary persistence.
- Critical violations create alerts; all violations create activity events.
- Rule logic lives in `BusinessRule` definitions and the pure evaluator; keep
  HTTP and persistence orchestration in the application service.

## Transitional Exceptions

- Rules stays flat only around HTTP orchestration and result post-processing.
  Rule execution, scheduling, provider/runtime behavior, or sink/reconcile
  growth should move behind application ports and owner-domain adapters.
