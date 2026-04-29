# Reconstruction Current Handoff - 2026-04-29

This handoff records the Codebase Reconstruction state after PRs #104, #105,
and #106 were reviewed and merged. Use it as the first context file when
continuing from another computer or a fresh Codex session.

## Source Documents

- Root rules: [`AGENTS.md`](../../../AGENTS.md)
- Master reconstruction plan: [`2026-04-28-codebase-reconstruction.md`](2026-04-28-codebase-reconstruction.md)
- Shared package rules: [`packages/shared/AGENTS.md`](../../../packages/shared/AGENTS.md)
- Server rules: [`apps/server/AGENTS.md`](../../../apps/server/AGENTS.md)
- Web rules: [`apps/web/AGENTS.md`](../../../apps/web/AGENTS.md)
- Knip/dependency risk map: [`2026-04-29-knip-export-risk-map.md`](2026-04-29-knip-export-risk-map.md)

## Current Main

Latest merged reconstruction PRs:

- #104 - `refactor: migrate apps/web @kiditem/shared imports to existing subpaths`
- #105 - `refactor: complete shared subpath topology for remaining domains`
- #106 - `refactor(server): migrate @kiditem/shared root imports to existing subpaths`

Local main was fast-forwarded to:

```text
5bd911b Merge pull request #106 from AgentFoundry-Labs/codex/server-shared-existing-subpaths
```

No schema changes or `init.sql.gz` changes were made in this import-topology
batch.

## Phase Status

Phase 0 and Phase 1 are landed enough to keep enforcing reconstruction gates.
The active work is Phase 2: shared package rebuild and root barrel reduction.

Important landed pieces:

- `AppException` was removed from the shared root surface and moved behind
  `@kiditem/shared/server-errors`.
- Existing domain subpath exports are now used by many server and web imports.
- Additional shared subpaths were added for the remaining root-import domains:
  `agent`, `agent-trace`, `workflow`, `common`, `reviews`, `statistics`,
  `settlements`, `alerts`, `return-summary`, `feature-gate`, and `inspection`.
- `scripts/check-shared-root-imports.sh` is the ratchet gate for root-barrel
  usage.

Current shared-root gate after #104-#106:

```text
baseline: 54 root import line(s) across 50 file(s)
current : 31 root import line(s) across 29 file(s)
PASS: no new root @kiditem/shared imports above baseline
```

The baseline is intentionally looser than current usage by 23 lines because
#104 and #106 were reviewed as independent migration PRs. The next Phase 2 PR
should migrate the remaining 31 root imports and regenerate the baseline.

## Remaining Root Imports

The remaining `from '@kiditem/shared'` imports are:

```text
apps/server/src/channels/services/channel-dashboard.service.ts
apps/server/src/workflows/services/workflows.service.ts
apps/web/src/app/reviews/page.tsx
apps/web/src/app/reviews/components/ReviewTable.tsx
apps/server/src/statistics/statistics.service.ts
apps/server/src/settlements/settlements.service.ts
apps/server/src/agent-registry/agent-registry.service.ts
apps/server/src/agent-registry/trace/__tests__/agent-trace.controller.spec.ts
apps/server/src/orders/services/reviews.service.ts
apps/server/src/orders/controllers/reviews.controller.ts
apps/server/src/agent-registry/trace/agent-trace.service.ts
apps/server/src/agent-registry/trace/agent-trace.controller.ts
apps/web/src/app/profit-loss/page.tsx
apps/server/src/rules/services/alerts.service.ts
apps/web/src/app/agents/hooks/useAgents.ts
apps/web/src/app/agents/tasks/[id]/trace/components/TraceTimeline.tsx
apps/web/src/app/agents/tasks/[id]/trace/components/EventDetailModal.tsx
apps/web/src/app/agents/tasks/[id]/trace/components/TraceHeader.tsx
apps/web/src/app/agents/tasks/[id]/trace/components/AgentLogsSection.tsx
apps/web/src/app/agents/tasks/[id]/trace/TraceView.tsx
apps/web/src/app/agents/lib/agent-api.ts
apps/web/src/app/agents/lib/agent-types.ts
apps/web/src/app/workflows/hooks/useWorkflows.ts
apps/web/src/app/inventory/page.tsx
apps/web/src/app/workflows/lib/workflow-api.ts
apps/web/src/app/workflows/components/MyWorkflowsSection.tsx
apps/web/src/app/workflows/lib/workflow-types.ts
apps/web/src/app/sales-analysis/components/Statistics.tsx
apps/web/src/app/inventory/components/InventoryToolbar.tsx
```

Use the new subpaths from #105 first. Do not add any new exports to the shared
root barrel.

## Next Work

The next PR should be a larger Phase 2 completion PR:

1. Migrate all remaining root imports listed above to domain subpaths.
2. Regenerate `scripts/.shared-root-imports-baseline.txt` so the current usage
   is ratcheted down.
3. Keep the work import-only unless a missing subpath reveals an actual shared
   topology defect.
4. Run and report:
   - `npm run check:shared-root-imports`
   - `cd packages/shared && npm run build`
   - `npm run build --workspace=apps/server`
   - `npm run build --workspace=apps/web`
   - `npm run dev:server`

After the root imports are gone, do a separate Phase 2 cleanup PR to decide how
far to shrink `packages/shared/src/index.ts` and `packages/shared/src/schemas/index.ts`.
Do not remove root exports in the same PR as the final consumer migration unless
the diff remains small and both server/web builds prove it.

Then move to Phase 3 backend domain rewrite in this order:

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

The three PRs were integration-tested together before merge on a temporary
branch:

```text
git merge --no-edit \
  origin/codex/shared-final-subpath-topology \
  origin/codex/web-shared-existing-subpaths \
  origin/codex/server-shared-existing-subpaths
```

Verified:

```text
npm run check:shared-root-imports
cd packages/shared && npm run build
git diff --check origin/main...HEAD
npm run build --workspace=apps/server
npm run build --workspace=apps/web
npm run dev:server
```

`npm run dev:server` reached `Server running on http://localhost:4000` after a
stale process on port 4000 was killed.

## Local Workspace Notes

Do not touch these untracked local files unless the user explicitly asks:

```text
kiditem_list (1) 2.xlsx
wing-inventory-matched 2.xlsx
```
