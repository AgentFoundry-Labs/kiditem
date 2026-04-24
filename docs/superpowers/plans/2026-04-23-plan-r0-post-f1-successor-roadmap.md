# Plan R0 — Post-F1 Successor Roadmap Normalization

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mixed historical successor labels after Plan F1 with a canonical post-F1 roadmap that matches the actual remaining schema-migration debt, domain ownership boundaries, and verification requirements in the current repository.

**Architecture:** This is a docs-first control plan. Historical plans/specs (`D.3b`, `Plan E`, `D.5`, `F2/F3/F4`) remain evidence, but new execution must follow the successor taxonomy locked here. Split backend live-aggregation migrations, frontend typed-boundary rewires, and writer/cache strategy work into separate business-domain-local plans. Same-domain cross-layer slices remain allowed under ADR-0019; what stays forbidden is mixing unrelated business domains in one implementation unit. The frontend lane is now normalized around user-facing business areas instead of every small historical TypeScript bucket.

**Tech Stack:** Markdown planning docs under `docs/superpowers/` + existing NestJS / Next.js / Prisma codebase evidence (`apps/server/src/*`, `apps/web/src/app/*`).

---

## Why this replan exists

Plan F1 completed the root dashboard restore, but its successor labels are mixed:

- `D.3b` still means "statistics + settlements + sales-plans" in one stub file
- `Plan E` is used for both ad-strategy cleanup and the longer-term ProfitLoss writer/cache discussion
- `D.5` is a frontend ad-ops bucket, but release notes also route backend `action-task` debt there
- `F2/F3/F4` are historical frontend buckets, not execution-ready, owner-local plans

That mismatch was the initial planning bug. The backend live-aggregation lane has since been executed locally (`B1` through `B5`), while the active planning problem is now the frontend lane. The codebase already shows the remaining frontend debt concretely:

- `ad-ops` was triaged and then temporarily quarantined from the web build so product data work can proceed without the 147-error blocker
- Product data debt is broader than the original `products` row: historical `D.4` also included `image-hub`, `thumbnail-editor`, and `hooks/useProductImages`
- Frontend typed-boundary debt remains in product data UI, inventory, orders, root `/api/action-tasks`, and root `/api/agent-registry/org`
- The next repo-wide build blocker after ad-ops quarantine is product image management (`ProductImageItem` missing from `@kiditem/shared`)

This roadmap makes those debts executable.

## Source-of-truth evidence

- Root session rule: `AGENTS.md`
- Boundary ADR: `.claude/docs/decisions/0019-business-domain-scoped-session-boundary.md`
- Historical phase grouping: `docs/superpowers/specs/2026-04-20-plan-d-frontend-rewire-design.md`
- F1 successor labels: `docs/superpowers/plans/2026-04-22-plan-f1-root-dashboard.md`
- F1 deferred debt: `docs/release-notes/2026-04-root-dashboard-rewire.md`
- Existing stub to retire: `docs/superpowers/plans/2026-04-20-plan-d3b-statistics-settlements-sales-plans.md`

## Canonical successor taxonomy

| Canonical ID | Type | Owner domain | Replaces historical label(s) | Scope |
|---|---|---|---|---|
| `B1` | backend | `statistics` | part of `D.3b` | Remove 5 `profitLoss` reads from statistics service and page consumers |
| `B2` | backend | `sales-plans` | part of `D.3b` | Replace `actualProfit` sync from `profitLoss.aggregate` with live basis |
| `B3` | backend | `settlements` | part of `D.3b` | Replace reconcile-side `profitLoss.findMany` with live listing basis |
| `B4` | backend | `advertising` | `Plan E` (implementation slice) | Remove `ad-strategy` dependence on `profitLoss` rows |
| `B5` | backend | `action-task` | backend fragment incorrectly routed to `D.5` | Rebuild warning seed + related-product logic on live basis |
| `W1` | frontend + same-domain product contracts | `products` | `F2` plus `D.4` product-image fragments | Stabilize product data UI: products page, product selector, image-hub, `useProductImages`, and direct thumbnail-editor image-hub consumers |
| `W2` | frontend | `inventory` | `F3` inventory slice | Convert inventory pages/components to typed boundaries and current schema |
| `W3` | frontend | `orders` | `F3` orders slice | Convert orders page to typed boundaries and current schema |
| `W4` | frontend | `ad-ops` | pre-`D.5` | Completed triage artifact for the quarantined ad-ops implementation |
| `W5` | frontend | `ad-ops` | `D.5` | Re-enable and rewire ad-ops from the W4 triage output after product/inventory/order stability |
| `W6` | frontend | root page consumers | residual `F4` slice | Close root `/api/agent-registry/org` and `/api/action-tasks` typed-boundary debt |
| `S1` | strategy | finance + architecture | strategic half of `Plan E` | Decide whether ProfitLoss writer/cache returns, and under what invariants |

## Legacy label mapping

Use this mapping whenever old docs say "later in D.3b / Plan E / D.5 / F2 / F3 / F4":

| Historical label | Canonical meaning after this roadmap |
|---|---|
| `D.3b` | `B1 + B2 + B3` |
| `Plan E` | `B4 + S1` (plus any explicit typed-boundary sunset work, if still needed) |
| `D.5` | `W4 + W5` only. `B5` is explicitly split out |
| `F2` | `W1` |
| `F3` | `W2 + W3` |
| `F4` | `W6` plus any remaining root typed-boundary residue not owned by product/inventory/orders/ad-ops |
| `D.4` product-image fragments | `W1` (`image-hub`, `thumbnail-editor` direct image import, `hooks/useProductImages`) |

## Execution order

### Lane A — backend live-aggregation closure

1. `B1 statistics-live-aggregation`
2. `B2 sales-plans-actuals-live`
3. `B3 settlements-reconcile-live`
4. `B4 ad-strategy-profit-basis`
5. `B5 action-task-profit-basis`

Reasoning:

- `statistics` is the largest remaining reader count, but semantically the simplest aggregation replacement
- `sales-plans` is narrower and can reuse the same period parsing + profit basis decisions from `B1`
- `settlements` is more sensitive because it is reconcile logic, so it should run after the shared live basis pattern is already proven twice
- `ad-strategy` and `action-task` are domain-specific consumers and should migrate after the finance/statistics basis is stable

### Lane B — frontend typed-boundary closure

0. `W4 ad-ops-triage` — completed evidence, not the next implementation target
1. `W1 product-data-ui`
2. `W2 inventory-ui`
3. `W3 orders-ui`
4. `W6 root-boundaries`
5. `W5 ad-ops-rewire`

Reasoning:

- `ad-ops` was the largest blocker, but quarantine moved it out of the immediate repo-wide build path
- Product data should go first because `image-hub` is now the next web build blocker and product image management was missing from the original successor map
- Inventory and orders are still separate business areas with smaller typed-boundary scope
- Root boundaries are isolated and should not block core commerce pages
- `W5` is intentionally deferred until product/inventory/order data contracts are stable, because ad-ops consumes product/listing-derived fields heavily

### Lane C — strategy gate

1. `S1 profit-snapshot-writer-decision`

Reasoning:

- Writer/cache restoration is not a prerequisite for closing the remaining read-path debt
- The current codebase can continue on live aggregation while the decision remains open
- Reopening a writer before the remaining readers are migrated risks locking a half-old, half-new data path back into place

## Required child plan files

These are the plan documents that should exist after roadmap normalization. Do not create new implementation plans under the legacy labels.

| ID | Suggested file path |
|---|---|
| `B1` | `docs/superpowers/plans/2026-04-23-plan-b1-statistics-live-aggregation.md` |
| `B2` | `docs/superpowers/plans/2026-04-23-plan-b2-sales-plans-actuals-live.md` |
| `B3` | `docs/superpowers/plans/2026-04-23-plan-b3-settlements-reconcile-live.md` |
| `B4` | `docs/superpowers/plans/2026-04-23-plan-b4-ad-strategy-profit-basis.md` |
| `B5` | `docs/superpowers/plans/2026-04-23-plan-b5-action-task-profit-basis.md` |
| `W1` | `docs/superpowers/plans/2026-04-23-plan-w1-product-data-ui.md` |
| `W2` | `docs/superpowers/plans/2026-04-23-plan-w2-inventory-ui.md` |
| `W3` | `docs/superpowers/plans/2026-04-23-plan-w3-orders-ui.md` |
| `W4` | `docs/superpowers/plans/2026-04-23-plan-w4-ad-ops-triage.md` |
| `W5` | `docs/superpowers/plans/2026-04-23-plan-w5-ad-ops-rewire.md` |
| `W6` | `docs/superpowers/plans/2026-04-23-plan-w6-root-boundaries.md` |
| `S1` | `docs/superpowers/specs/2026-04-23-plan-s1-profit-snapshot-writer-decision.md` |

## Acceptance criteria for roadmap normalization

- All future execution conversations refer to `B*`, `W*`, and `S1`, not only to `D.3b / Plan E / D.5 / F2/F3/F4`
- No new plan doc is created that mixes multiple business domains in one implementation unit
- Same-business-domain cross-layer slices are allowed, but must still name one owner domain
- `action-task` is no longer hidden inside `D.5`
- root `/api/action-tasks` typed-boundary debt has an explicit owner (`W6`)
- product image management is no longer omitted from the successor taxonomy
- `Plan E` is no longer used to mean both "ad-strategy implementation" and "writer/cache architecture decision" at the same time
- The next child plan to write after this frontend normalization is `W1`

## Out of scope

- Rewriting or deleting historical plan/spec documents
- Editing application code
- Deciding the final ProfitLoss writer/cache architecture (`S1` owns that)
- Executing any child plan in this document

## Recommended next move

Write `W1` next. It has the best risk/reward ratio:

- it owns the current web build blocker after ad-ops quarantine
- it closes the omitted product image management lane from historical `D.4`
- it stabilizes the product data contract before inventory, orders, and ad-ops depend on it again

Keep the existing `W4` triage document as evidence for later `W5`, but do not re-enable ad-ops until the commerce data UI lanes are stable.
