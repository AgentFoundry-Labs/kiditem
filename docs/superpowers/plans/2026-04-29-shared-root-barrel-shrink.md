# Shared Root Barrel Shrink — Phase 2 Closeout

Date: 2026-04-29
Branch: `refactor/phase2-shared-closeout`
Baseline: `origin/main` at `b94317b` (Phase 2 root-import migration sweep)

## Scope Guard

This is the "separate Phase 2 cleanup PR" called out by the master plan
(`docs/superpowers/plans/2026-04-28-codebase-reconstruction.md`) and the
2026-04-29 handoff: after every consumer under `apps/server/src` and
`apps/web/src` migrated to subpath imports, decide how far to shrink
`packages/shared/src/index.ts` and `packages/shared/src/schemas/index.ts`.

This plan is import-topology only. No schema, dependency, dev-data, or
`init.sql.gz` changes are part of this lane. Tier 1 removals are applied
in the same PR; Tier 2 (`defer-contract`) entries are documented here for a
focused follow-up.

## Inputs

- `npm run check:shared-root-imports` — baseline 0 / current 0 (PASS).
- `rg -n "from ['\"]@kiditem/shared['\"]" apps/server/src apps/web/src
  packages/shared/src` — 0 hits.
- `rg -n "from ['\"]@kiditem/shared['\"]"` repo-wide (excluding
  `packages/shared/dist/**` and `node_modules/**`) — only archived plan/spec
  docs, the `packages/shared/AGENTS.md` example block, and the gate script
  itself reference the root specifier.
- `rg -n "from ['\"]@kiditem/shared/schemas['\"]"` repo-wide — only the
  `packages/shared/AGENTS.md` example block and one archived plan reference
  the schemas barrel.
- `packages/shared/package.json` — every domain in the root barrel already
  has a registered subpath export and `typesVersions` mapping.
- Wrapper files (`packages/shared/src/{domain}.ts`) re-export
  `./schemas/{domain}.js` 1:1, so subpath consumers see the same symbols
  the root barrel re-exports.

## Buckets

| Bucket | Count | Meaning |
| --- | ---: | --- |
| `safe-remove` (Tier 1, this PR) | 15 sections | Wrapper-or-subpath replacement is exact and the section is small or clearly redundant. Removed from `packages/shared/src/index.ts`; mirrored in `packages/shared/src/schemas/index.ts` where the section also exists there. |
| `defer-contract` (Tier 2, follow-up) | 13 sections | Larger sections widely cited in archived plans/specs, or whose single-file removal would dominate the diff. Kept as a compatibility surface until a focused batch removes them with explicit replacement guidance. |

## Tier 1 — Safe-remove in this PR

Each section below is removed from `packages/shared/src/index.ts`. Where
the same section also lives in `packages/shared/src/schemas/index.ts` it is
removed there too.

| Section | Lines (root) | Mirrored in `schemas/index.ts`? | Replacement subpath |
| --- | ---: | --- | --- |
| `Errors` (`ErrorCodes`) | 1 | No | `@kiditem/shared/errors` |
| `Security` (`scrubSecrets`, `scrubDeep`, `REDACTED_PLACEHOLDER`, `SECRET_PATTERNS`, `SENSITIVE_FIELD_KEYS`) | 1 | No | `@kiditem/shared/security` |
| `Panel` (wildcard `export * from './panel/index.js'`) | 1 | No | `@kiditem/shared/panel` |
| `Profit & Loss` (`PLDataSchema`, `PLData`) | 3 | Yes | `@kiditem/shared/finance` (or `@kiditem/shared/profit-loss`) |
| `Sales Analysis` (`SalesAnalysisDataSchema`, `ChannelAnalysisSchema`, types) | 3 | No | `@kiditem/shared/finance` |
| `Channel Dashboard — Return` (`ReturnSummarySchema`, `ReturnSummary`) | 3 | No | `@kiditem/shared/return-summary` |
| `Channel Dashboard` (`ChannelDashboardSummarySchema`, `RevenueTrendPointSchema`, `ProductRankingRowSchema`, `ReturnReasonRowSchema`, `ReturnFaultSplitSchema`, types) | 15 | No | `@kiditem/shared/channel-dashboard` |
| `Statistics` (`StatisticsOverviewSchema` … `StatisticsDeliveryResponseSchema`, types) | 27 | No | `@kiditem/shared/statistics` |
| `Settlements` (`SettlementReconcileDetailSchema`, `SettlementReconcileResponseSchema`, types) | 9 | No | `@kiditem/shared/settlements` |
| `Supplier Stats` (`SupplierSalesRowSchema`, `SupplierProductSalesRowSchema`, types) | 9 | No | `@kiditem/shared/supplier-stats` |
| `Agent Workflow` (`WorkflowStepSchema`, `AgentWorkflowSchema`, `WorkflowYieldSchema`, types) | 3 | Yes | `@kiditem/shared/workflow` (wrapper re-exports `agent-workflow`) |
| `Alerts` (`AlertItemSchema`, `AlertItem`) | 3 | Yes | `@kiditem/shared/alerts` |
| `Rules` (`RuleItemSchema`, `RuleItem`) | 3 | Yes | `@kiditem/shared/rules` |
| `Inspection` (`InspectionItemSchema`, `InspectionResultSchema`, types) | 3 | Yes | `@kiditem/shared/inspection` |
| `Feature Gate` (`FeatureGateSchema`, `FeatureGate`) | 3 | Yes | `@kiditem/shared/feature-gate` |

Why these are safe:

- All listed symbols reach consumers through registered subpath exports
  whose wrapper files re-export the same `schemas/{domain}.ts` module the
  root barrel pulled from.
- Repo-wide `rg` confirms zero remaining root-specifier consumers; the
  only references are docs and the gate itself.
- The package is workspace-private (`"private": true` in
  `packages/shared/package.json`), so there is no published-API surface to
  break by removing a redundant root re-export.

## Tier 2 — Defer-contract (kept for a follow-up batch)

These sections remain in `packages/shared/src/index.ts` after this PR. They
are still compatibility-only — every consumer in the repo already imports
the equivalent subpath — but they are deferred for one of the listed
reasons.

| Section | Lines (root) | Replacement subpath | Defer reason |
| --- | ---: | --- | --- |
| `Common` (`PaginatedResponseSchema`, `ApiErrorResponseSchema`, `SyncInfoSchema`, types) | 3 | `@kiditem/shared/common` | Cross-domain primitives; downstream projects often grep for these names from the root specifier in archived recipes. Strip with explicit "use subpath" callout in the follow-up. |
| `Product` (`MasterImageRoleSchema` … `ProductCatalogListResponseSchema`, types) | 36 | `@kiditem/shared/product` | Largest catalog-domain block, widely cited across docs/specs/plans. Removal deserves its own diff so reviewers can audit each symbol. |
| `Order` (`OrderSchema` … `OrderPipelineResponseSchema`, types) | 35 | `@kiditem/shared/order` | Same as Product — high citation density; removal deserves a focused review window. |
| `Inventory` (`InventorySchema` … `UpdateInventoryMetadataInputSchema`, types) | 35 | `@kiditem/shared/inventory` | Inventory ledger contract is being touched by Plan B2a follow-ups; defer to avoid colliding with that lane. |
| `Workflow` (`WorkflowTemplateSchema`, `WorkflowRunSchema`, `WorkflowStepRunSchema`, types) | 3 | `@kiditem/shared/workflow` | Workflow boundary will be reshaped in Phase 3 (`workflows / agent-task boundary`). Drop the root entry as part of that phase, not before. |
| `Agent` (`AgentSchema` … `CostAnalyticsSchema`, types) | 19 | `@kiditem/shared/agent` | Agent admin schema is in active use; remove with the agent boundary rewrite to keep the diff coherent. |
| `Agent Trace` (`AgentTaskSchema` … `AgentTaskListResponseSchema`, types) | 23 | `@kiditem/shared/agent-trace` | Same coupling to the agent boundary rewrite. |
| `Marketplace` (`ConfigurableParamSchema`, `MarketplaceCatalogItemSchema`, types) | 3 | `@kiditem/shared/marketplace` | Marketplace contract is referenced by both server and web hubs; keep until a marketplace-focused PR. |
| `Dashboard` (full block: sales/ad/inventory summaries, KPI sub-schemas, types) | 42 | `@kiditem/shared/dashboard` | Largest aggregate block. Remove in a focused batch to keep diff legibility. |
| `Reviews` (`ReviewFilterSchema`, `ReviewListItemSchema`, `ReviewListResponseSchema`, `ReviewSummarySchema`, types) | 14 | `@kiditem/shared/reviews` | Reviews surface still being shaped (orders/reviews controller); keep until that domain settles. |
| `Thumbnails` (full block: list/summary/scores, generation, tracking, edit/recompose, constants, types) | 49 | `@kiditem/shared/ai` | Largest single block. Defer with the `ai / thumbnails` Phase 3 rewrite. |
| `Ads` (full block: listing/metrics/hub, campaign/product/trends, strategy/tier/issues, exposure, channel, status, types) | 58 | `@kiditem/shared/advertising` | Largest single block, paired with the advertising Phase 3 rewrite. |
| `Action Task` (`ActionTaskSchema`, `ActionTaskRelatedProductSchema`, `ActionTaskSourceAlertSchema`, `ActionTaskListSchema`, types) | 14 | `@kiditem/shared/action-task` | Action-task surface couples with the action-board page; defer to a focused follow-up. |

`schemas/index.ts` mirrors most of these sections (Common, Product, Order,
Inventory, Workflow, Agent, Agent Trace, Marketplace, Dashboard, Reviews,
Thumbnails, Ads, Action Task). They stay in lockstep with `index.ts` and
will be removed together in the follow-up batch.

## Follow-up Batches (after this PR)

The Tier 2 sections should be removed in two follow-up PRs to keep diffs
reviewable:

1. **Compat shrink batch A** — small/medium sections that are not blocked
   by an active Phase 3 rewrite: `Common`, `Marketplace`, `Reviews`,
   `Action Task`. These are short and have no schema rewrite in flight.
2. **Compat shrink batch B** — large or rewrite-blocked sections, removed
   alongside the Phase 3 owner-domain plan: `Product`, `Order`,
   `Inventory`, `Workflow`, `Agent`, `Agent Trace`, `Dashboard`,
   `Thumbnails`, `Ads`. Each owner domain's child plan should drop the
   root entry as part of its rewrite, so the root barrel ends up empty
   the same week the corresponding domain rewrite lands.

Both batches use the same "Tier 1" shape: subpaths already exist; the
removal is a delete-only change with no schema, dependency, or generated-
file movement.

## Migration Rule (do-not-add)

- New code must not import from `@kiditem/shared` (root) under
  `apps/server/src` or `apps/web/src`. The gate is now floored at zero;
  the next PR introducing a root import would have to also raise the
  baseline, and that is not allowed without an explicit child plan.
- New domain contracts add a `src/{domain}.ts` entrypoint plus a
  `package.json` subpath export. Do not append new sections to either
  compatibility barrel.

## Verification (this PR)

```bash
rtk npm run check:shared-root-imports
cd packages/shared && rtk npm run build
rtk npm run build --workspace=apps/server
rtk npm run build --workspace=apps/web
rtk git diff --check
```

Expected: all four green; current root-import count remains zero.

## Out of Scope

- Schema files (`prisma/models/**`, `prisma/schema.prisma`,
  `prisma/init.sql.gz`).
- Dev-data bundles and Drive sync.
- Workspace dependency removals.
- Any change to `apps/server/src/**` or `apps/web/src/**` beyond what an
  accidental import-audit regression would force.
- Tier 2 removals (covered by follow-up batches above).
