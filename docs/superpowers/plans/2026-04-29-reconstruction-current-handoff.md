# Reconstruction Current Handoff - 2026-04-29

This handoff records the Codebase Reconstruction state after the Phase 2
shared root import migration and Phase 3A backend tenant-boundary hardening
wave completed. Use it as the first context file when continuing from another
computer or a fresh Codex/Claude session.

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

- #107 - `refactor: phase 2 closeout, shrink shared root barrel`
- #108 - `refactor: harden finance tenant boundaries`
- #109 - `Phase 4 foundation: frontend API client convention plan + first slice`
- #110 - `refactor: products masterProduct boundary slice 1 (findBySku IDOR + restore atomicity)`
- #111 - `build: stabilize knip baseline + plan Phase 5 dependency purge foundation`
- #112 - `refactor: harden channels / channelListing boundary (Phase 3 slot 5)`
- #113 - `refactor: harden products follow-up tenant boundary`
- #114 - `refactor: harden ai thumbnail tenant boundary`
- #115 - `refactor: harden workflows agent-task boundary`
- #116 - `refactor: harden advertising tenant boundary`

Local main was fast-forwarded to:

```text
e4df2f0 Merge pull request #116 from AgentFoundry-Labs/refactor/phase3-advertising-boundary
```

No schema changes or `init.sql.gz` changes were made in these reconstruction
batches.

## Phase Status

Phase 0 and Phase 1 are landed. Phase 2 root-import migration and root-barrel
shrink are complete: no file under `apps/server/src` or `apps/web/src` imports
from the `@kiditem/shared` root barrel.

Phase 3A backend tenant-boundary hardening is complete for the planned large
boundary wave that landed through #116:

- finance-related tenant boundaries
- products `masterProduct` / follow-up tenant boundaries
- channels `channelListing` boundary
- advertising backend boundary
- AI thumbnails tenant boundary
- workflows / agent-task boundary

The next backend work is not another document/test-heavy boundary audit. It is
Phase 3B: direct code-structure refactoring inside large bounded contexts.

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

Start Phase 3B: **large domain architecture refactor**.

This is pragmatic DDD, not a global repository mandate. The existing top-level
domain folders already act as bounded-context boundaries. Small CRUD domains
keep the current `Service -> PrismaService` shape. Large domains get internal
layers only where they remove real complexity:

- `services/` — application use-case orchestration
- `persistence/` or `repositories/` — tenant-scoped writes / entity access
- `read-models/` or `queries/` — reporting, raw SQL, hydration, read contracts
- `mappers/` — Prisma row / query row to shared contract shape
- `domain/` — pure business rules, calculators, thresholds, state transitions

Phase 3B priority order:

1. `advertising` — decompose fat services such as `ad-sync.service.ts`; continue
   the read-model extraction started in #116; isolate mappers and pure ad rules.
2. `ai` / thumbnails — split generation, analysis, recomposition, Wing
   registration, image resolution, and AI adapter orchestration.
3. `products` — selectively extract tenant-safe product persistence and shared
   hydrated read shapes; do not wrap Prisma 1:1.
4. `workflows` — clarify application service / runner / executor / agent-task
   boundary; keep public executor contract stable unless a separate contract PR
   changes it.
5. `dashboard` / `statistics` read models — isolate raw SQL and reporting query
   builders from controller-facing application services.

Phase 3B PRs should primarily move and simplify production code. Tests are a
risk-based safety net, not the main deliverable and not a file-count goal. Add
or keep tests for operating-critical behavior only: tenant isolation / IDOR,
raw SQL predicates, transaction or row-lock semantics, external side effects,
money/inventory/ad-budget calculations, and public API contract compatibility.
Do not add implementation-detail mock tests just because a helper was moved; use
existing coverage where it already protects the behavior. Phase 3B child plans
should also include a test cleanup pass: remove or collapse existing
implementation-detail tests when the same risk is already covered by a scanner,
build, integration test, or higher-value public-behavior test. Each PR should
identify the target fat service(s), the new internal layer layout, public API
compatibility, test cleanup/deletion rationale, and the measurable structure
improvement such as reduced service LOC, extracted query/read-model modules, or
pure domain helper coverage.

Phase 4 frontend rebuild continues in parallel only when it does not depend on
unstable backend shapes:

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
