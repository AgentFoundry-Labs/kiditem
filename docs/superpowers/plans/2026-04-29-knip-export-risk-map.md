# Knip Export Risk Map

Date: 2026-04-29
Baseline: `origin/main` at `1069909` (PR #98, server export cleanup merged after PR #96 web export cleanup)
Command: `DATABASE_URL=postgresql://kiditem:kiditem@localhost:5433/kiditem npm run knip:report`

## Scope Guard

This is a classification PR, not a code deletion PR. PR #96 and PR #98 consumed the broad safe-delete/safe-internalize export cleanup lanes. This document now tracks only the residual Knip export/type surface that should not be deleted by broad cleanup.

No schema, dependency, dev-data, or `init.sql.gz` changes are part of this lane.

## Buckets

Counts are symbol-level, not Knip line-level. After PR #96 and PR #98, Knip reports 2 unused-export lines and 1 unused-exported-type line, containing 11 symbols total.

| Bucket | Count | Meaning |
| --- | ---: | --- |
| `safe-internalize` | 0 | Broad internalization was consumed by PR #96/#98. |
| `safe-delete` | 0 | Broad deletion was consumed by PR #96/#98. |
| `defer-contract` | 11 | Treat as auth/workflow dynamic contract surface. Requires owner-domain decision before changing. |

## Symbol Map

| Path | Symbol(s) | Recommendation | `rg` basis summary | Next PR lane |
| --- | --- | --- | --- | --- |
| `apps/server/src/auth/decorators/skip-auth.decorator.ts` | `SkipAuth` | `defer-contract` | Scoped auth docs describe `@SkipAuth` as the public decorator even though current code imports only `SKIP_AUTH_KEY`. Removing it would be an auth API decision, not a dead-code sweep. | auth contract |
| `apps/server/src/workflows/executors/index.ts` | `getNodeDefinition`, `listNodeTypes`, `listNodeDefinitions` | `defer-contract` | Workflow executor registry accessors are currently unused by code but form the documented dynamic/introspection surface for node catalogs. Remove only with a workflow catalog contract replacement. | workflows contract |
| `apps/server/src/workflows/executors/types.ts` | `StandardOrder`, `StandardProduct`, `StandardInventory`, `StandardAd`, `StandardProfitLoss`, `StandardReview`, `StandardThumbnail` | `defer-contract` | Workflow standard data shapes are documented as executor output entity contracts. They should move or disappear only with the workflow executor/schema redesign. | workflows contract |

## Next Cleanup Shape

1. Do not chase these residual symbols in generic Knip cleanup PRs.
2. `SkipAuth` belongs to an auth/public-decorator decision: either keep it as the explicit route-level API or replace docs and call sites with a narrower metadata helper.
3. Workflow residuals belong to the workflow executor/schema redesign. Decide whether the catalog introspection functions and standard entity types are public contract, internal implementation, or obsolete.
4. Broad Knip export cleanup is otherwise complete at this baseline.
