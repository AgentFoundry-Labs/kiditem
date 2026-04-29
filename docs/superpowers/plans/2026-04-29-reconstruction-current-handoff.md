# Reconstruction Current Handoff - 2026-04-29

This handoff records the Codebase Reconstruction state after the Phase 2
shared root import migration completed. Use it as the first context file
when continuing from another computer or a fresh Codex/Claude session.

## Source Documents

- Root rules: [`AGENTS.md`](../../../AGENTS.md)
- Master reconstruction plan: [`2026-04-28-codebase-reconstruction.md`](2026-04-28-codebase-reconstruction.md)
- Shared package rules: [`packages/shared/AGENTS.md`](../../../packages/shared/AGENTS.md)
- Server rules: [`apps/server/AGENTS.md`](../../../apps/server/AGENTS.md)
- Web rules: [`apps/web/AGENTS.md`](../../../apps/web/AGENTS.md)
- Knip/dependency risk map: [`2026-04-29-knip-export-risk-map.md`](2026-04-29-knip-export-risk-map.md)
- Shared root barrel shrink plan: [`2026-04-29-shared-root-barrel-shrink.md`](2026-04-29-shared-root-barrel-shrink.md)

## Current Main

Latest merged reconstruction PRs:

- #104 - `refactor: migrate apps/web @kiditem/shared imports to existing subpaths`
- #105 - `refactor: complete shared subpath topology for remaining domains`
- #106 - `refactor(server): migrate @kiditem/shared root imports to existing subpaths`

A subsequent local-only consolidation merge `b94317b` completed the migration
sweep (commit `9361d38 refactor: complete shared root import migration`),
ratcheting `scripts/.shared-root-imports-baseline.txt` down to zero.

Local main was fast-forwarded to:

```text
b94317b Merge branch 'fix/shared-root-import-phase2'
```

No schema changes or `init.sql.gz` changes were made in this import-topology
batch.

## Phase Status

Phase 0 and Phase 1 are landed. Phase 2 root-import migration is complete:
no file under `apps/server/src` or `apps/web/src` imports from the
`@kiditem/shared` root barrel.

Important landed pieces:

- `AppException` was removed from the shared root surface and moved behind
  `@kiditem/shared/server-errors`.
- All domain consumers now use subpath imports (`@kiditem/shared/product`,
  `@kiditem/shared/order`, `@kiditem/shared/inventory`,
  `@kiditem/shared/ai`, `@kiditem/shared/advertising`,
  `@kiditem/shared/errors`, `@kiditem/shared/security`,
  `@kiditem/shared/panel`, `@kiditem/shared/dashboard`,
  `@kiditem/shared/finance`, `@kiditem/shared/marketplace`,
  `@kiditem/shared/rules`, `@kiditem/shared/action-task`,
  `@kiditem/shared/supplier-stats`, `@kiditem/shared/channel-dashboard`,
  `@kiditem/shared/agent`, `@kiditem/shared/agent-trace`,
  `@kiditem/shared/workflow`, `@kiditem/shared/common`,
  `@kiditem/shared/reviews`, `@kiditem/shared/statistics`,
  `@kiditem/shared/settlements`, `@kiditem/shared/alerts`,
  `@kiditem/shared/return-summary`, `@kiditem/shared/feature-gate`,
  `@kiditem/shared/inspection`).
- `scripts/check-shared-root-imports.sh` is the ratchet gate for root-barrel
  usage and is now baselined at zero.

Current shared-root gate after the migration sweep:

```text
baseline: 0 root import line(s) across 0 file(s)
current : 0 root import line(s) across 0 file(s)
PASS: no new root @kiditem/shared imports above baseline
```

The baseline is at the floor. Any new file or new line that adds
`from '@kiditem/shared'` (root) under `apps/server/src` or `apps/web/src` is
a hard regression and will fail the gate.

## Remaining Root Imports

There are no remaining `from '@kiditem/shared'` root imports under
`apps/server/src` or `apps/web/src`. The only references to the root
specifier elsewhere in the repo are:

- Archived plan/spec docs under `docs/superpowers/plans/**` and
  `docs/superpowers/specs/**` (historical context only — do not use as
  current API).
- The example block inside `packages/shared/AGENTS.md` (which describes
  the `from '@kiditem/shared'` surface that the package still re-exports
  for compatibility).
- The scanner `scripts/check-shared-root-imports.sh` itself.

## Next Work

The next Phase 2 PR is the **root-barrel shrink** captured in
[`2026-04-29-shared-root-barrel-shrink.md`](2026-04-29-shared-root-barrel-shrink.md).
That plan classifies each root export as `safe-remove` (already done in
the closeout PR) or `defer-contract` (kept for now, with a documented
follow-up batch). The shrink does not regenerate the baseline because the
baseline already sits at zero.

After the root-barrel shrink, move to Phase 3 backend domain rewrite in
this order:

1. `manual-ledger`
2. `processing-costs`
3. `supplier-payments`
4. `products` / `masterProduct` query boundary
5. `channels` / `channelListing`
6. `advertising`
7. `ai` / thumbnails
8. `workflows` / agent-task boundary

Phase 4 starts after the backend boundary work is stable:

1. API client/fetch convention
2. Thumbnail editor
3. Sourcing editor, especially `DetailPageEditor.tsx`
4. Dashboard/action-board and remaining domain pages

Phase 5 dependency cleanup should use the knip/export risk map linked above.

## Verification Evidence

The migration sweep was integration-verified before the consolidation merge:

```text
npm run check:shared-root-imports
cd packages/shared && npm run build
git diff --check origin/main...HEAD
npm run build --workspace=apps/server
npm run build --workspace=apps/web
npm run dev:server
```

`npm run dev:server` reached `Server running on http://localhost:4000`.
Full evidence of the closeout PR's verification is captured in the shrink
plan linked above.

## Local Workspace Notes

Do not touch these untracked local files unless the user explicitly asks:

```text
kiditem_list (1) 2.xlsx
wing-inventory-matched 2.xlsx
```
