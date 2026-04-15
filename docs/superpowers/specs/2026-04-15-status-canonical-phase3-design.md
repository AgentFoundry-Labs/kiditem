# Status Canonical Lifecycle — Phase 3 (ThumbnailGeneration) Design

**Date**: 2026-04-15  
**ADR**: [0011 Status canonical lifecycle](../../../.claude/docs/decisions/0011-status-canonical-lifecycle.md)  
**Branch (target)**: `refactor/status-canonical-thumbnail`  
**Status**: Design approved, pending plan

## Context

ADR-0011 prescriptively unifies async-task `status` vocabulary to `pending | running | succeeded | failed | cancelled` across all async domains, with domain-specific sub-states split into sibling columns (`failureType`, `phase`, `cancellationReason`). Phase 1 (WorkflowRun) merged as PR #9. Phase 2 (HeartbeatRun + `failureType='timeout'`) merged as PR #11 (commit `5ed570d`).

Phase 3 migrates **ThumbnailGeneration** — currently the only remaining legacy vocabulary (`pending | generating | ready | applied | skipped | failed`) — to canonical status + a new `phase` sibling column.

The current vocabulary conflates two orthogonal axes:
- **Execution status**: `pending → generating → [succeeded|failed|cancelled]`
- **Post-execution disposition**: `ready → applied` (for succeeded jobs)

Without ADR-0011 canonicalization, cross-domain consumers (Panel, future analytics) would need to memorize 6 domain-specific values. The Phase 1/2 precedent plus Phase 3 will complete the prescriptive rule across all three existing async domains.

## Goal

Migrate ThumbnailGeneration `status` vocabulary to the ADR-0011 canonical enum, add a `phase` sibling column for post-succeeded disposition, and migrate all backend writers, frontend readers, and the shared Zod schema to the new shape. Single atomic PR (compile-breaking change across shared package).

## Non-goals (explicit)

"Non-goals" = work that could reasonably be done alongside Phase 3 but is intentionally deferred for scope. "Pre-existing concerns" (see below) = **bugs left in place** because fixing them would expand scope. The two lists are distinct categories:

- `applyGeneration` 2-table atomicity (Product + ThumbnailGeneration) — pre-existing race condition. Deferred to follow-up PR + ADR (would require exception to `products/CLAUDE.md` $transaction ban). Also listed under Pre-existing concerns.
- `processEditJob` double-fire race (reEditJob → setImmediate can overlap with in-flight processEditJob) — pre-existing race. Deferred to follow-up PR. Also listed under Pre-existing concerns.
- `THUMBNAIL_FAILURE_TYPES` sibling column (e.g., `'timeout' | 'no_candidates' | 'error'`) — YAGNI. Current writer does not distinguish failure causes. Add when a UI/analytics requirement emerges.
- `useThumbnailGenerations.ts` duplicate-file cleanup (`/hooks/` and `/app/thumbnails/hooks/`) — out of scope. Both files canonicalized in Phase 3, consolidation in follow-up.
- `ThumbnailTracking` — no `status` column, unrelated to Phase 3.
- Phase 4 canonicalization of `AgentTask.status` (`heartbeat.service.ts:528`) — separate ADR scope decision.

## Design decisions

### Decision 1 — Value mapping

| Legacy value | Canonical `status` | `phase` | Rationale |
|---|---|---|---|
| `pending` | `pending` | `null` | Identity — already canonical |
| `generating` | `running` | `null` | "AI editing in progress" fits canonical `running` |
| `ready` | `succeeded` | `'ready'` | Candidates generated successfully; awaiting user selection/application |
| `applied` | `succeeded` | `'applied'` | Final disposition reached (Product.imageUrl updated) |
| `skipped` | `cancelled` | `null` | User explicitly abandoned the generation (matches Rule 1 `cancelled` = "user/system interrupt") |
| `failed` | `failed` | `null` | Identity — already canonical |

**Invariant**: `status = 'succeeded'` ⇔ `phase ∈ {'ready', 'applied'}`. For all other statuses, `phase = null`.

### Decision 2 — `phase` enum scope

`phase = ['ready', 'applied']` (2 values, succeeded-disposition only).

Rejected: ADR example listed `['generating', 'ready', 'applied']`. `'generating'` was dropped because it duplicates information already encoded in `status='running'`. Keeping phase as "post-succeeded disposition only" gives it a single responsibility.

### Decision 3 — `skipped` mapping

`skipped → status='cancelled', phase=null`.

Rejected alternative: `skipped → status='succeeded', phase='skipped'`. The "disposition" axis interpretation was coherent but required 2-column predicates at every query site (`status='succeeded' AND phase='skipped'`) and didn't use ADR Rule 1's `cancelled` value. Chose simpler mapping where single-column equality (`status='cancelled'`) suffices.

### Decision 4 — No `failureType` column

Rejected. Current writer does not distinguish failure causes (timeout vs no-candidates vs generic error). Adding the column would result in all-null fills. Phase 2 added `failureType` only because existing writer already emitted timeout information. When ThumbnailGeneration UI or analytics gains a real requirement for failure discrimination, add in a follow-up ADR.

### Decision 5 — Schema shape

```prisma
model ThumbnailGeneration {
  // ...existing fields unchanged
  status      String  @default("pending")
  phase       String? @map("phase")        // NEW nullable, no default, no index
  // ...existing
  
  @@index([companyId])
  @@index([productId])
  @@index([status])
  @@index([method])
  @@map("thumbnail_generations")
}
```

- `status` default `"pending"` unchanged (already canonical; Phase 2 flipped `"queued"` → `"pending"`, Phase 3 needs no default change).
- `phase` nullable, no default. Writer sets it on the `succeeded` transition.
- **No `@@index([phase])`**. Rejected because: (a) cardinality is 2 values + null — B-tree has poor effectiveness, Postgres planner likely picks seq scan; (b) inconsistent with Phase 2 `failureType` (no index); (c) dominant queries are `productId + method + status` composites where productId is already selective. If a `phase='applied'`-only query emerges, consider a partial index via raw migration (Prisma does not support `where:` on `@@index`).
- **No DB CHECK constraint**. Per ADR-0001 (no native PG enums/constraints), invariant enforced at app layer (writer helpers + Zod + tests).

### Decision 6 — Writer helpers

Introduce 3 helper functions in a new file `apps/server/src/products/services/thumbnail-status.helpers.ts`:

```typescript
import type { Prisma, PrismaClient } from '@prisma/client';

type Client = PrismaClient | Prisma.TransactionClient;

// Semantics: status='succeeded', phase='ready'. Existing fields untouched unless passed in `extras`.
// `extras` is a partial update — undefined fields are not written (Prisma `update` semantics).
// Used at: selectCandidate (extras.selectedUrl), saveEditorResult (extras = all payload fields), processEditJob ready (extras.candidates + editAnalysis).
export async function markReady(
  prisma: Client,
  id: string,
  extras?: Partial<Pick<Prisma.ThumbnailGenerationUpdateInput, 'selectedUrl' | 'candidates' | 'editAnalysis'>>,
): Promise<ThumbnailGenerationRow>;

// Semantics: status='succeeded', phase='applied'. No other fields touched.
export async function markApplied(prisma: Client, id: string): Promise<ThumbnailGenerationRow>;

// Semantics: status='pending', phase=null. Also resets candidates=[] and selectedUrl=null when called via reEditJob path.
export async function resetToPending(
  prisma: Client,
  id: string,
  extras?: Partial<Pick<Prisma.ThumbnailGenerationUpdateInput, 'candidates' | 'selectedUrl'>>,
): Promise<ThumbnailGenerationRow>;
```

**Signature rationale**:
- `prisma: Client` accepts either the shared `PrismaClient` or a `TransactionClient`, preserving ability to compose in a `$transaction` later (follow-up PR).
- `extras` is always `Partial<Pick<...UpdateInput, ...>>` — optional, omitted fields not written. Matches Prisma `update()` semantics.
- All helpers return the updated row (Prisma's default `update` return). Callers that need `include: { product: ... }` add it in a subsequent select or refetch — helper signature intentionally minimal.
- No `upsert` or `create` semantics — `saveEditorResult`'s cold-start path creates the row directly with `create({ data: {..., status: 'succeeded', phase: 'ready'} })`, does not call `markReady`.

Simple terminals (`failed`, `cancelled`, `running`) are written inline via `prisma.thumbnailGeneration.update({ data: { status: 'failed', phase: null } })` — matches Phase 2 pattern for single-status transitions.

`failed`, `cancelled`, and `running` transitions are written inline (single status change, no phase semantics) — matches Phase 2 pattern for simple terminals.

Rejected alternative: no helpers (Phase 2 pattern). Phase 2's sibling `failureType` has no transitions (only set on `failed`). Phase 3's `phase` has a transition (`ready → applied`) plus a reset path (`ready|applied → pending` via reEditJob). 8 of 13 writer sites set phase — high surface area for silent drift. Helpers centralize the invariant obligation.

### Decision 7 — Shared Zod shape

Simple enum + nullable phase (Phase 2 pattern):

```typescript
// packages/shared/src/schemas/thumbnails.ts
export const THUMBNAIL_PHASES = ['ready', 'applied'] as const;
export type ThumbnailPhase = typeof THUMBNAIL_PHASES[number];

export const ThumbnailGenerationItemSchema = z.object({
  // ...existing
  status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled']),
  phase: z.enum(THUMBNAIL_PHASES).nullable().optional(),
});
```

Rejected alternative: discriminated union (`z.discriminatedUnion('status', [...])`). Would provide type-level invariant enforcement but: (a) breaks `.omit()` / `.extend()` derivation patterns used elsewhere; (b) requires narrowing code (`if (g.status === 'succeeded')`) before `g.phase` access at 15+ web sites — out-of-scope migration burden; (c) diverges from Phase 2 `HeartbeatRunSchema` shape. Invariant enforcement handled by writer helpers + test helper + backend `satisfies`.

Rejected alternative: `.refine()` soft invariant. Runtime-only, does not help frontend narrowing. Worth revisiting only if mock fixture drift becomes a real problem.

### Decision 8 — Frontend helpers

Introduce `apps/web/src/lib/thumbnail-status.ts`:

```typescript
import type { ThumbnailGenerationItem } from '@kiditem/shared';

export const isReady = (g: ThumbnailGenerationItem) => g.status === 'succeeded' && g.phase === 'ready';
export const isApplied = (g: ThumbnailGenerationItem) => g.status === 'succeeded' && g.phase === 'applied';
export const isActive = (g: ThumbnailGenerationItem) => g.status === 'pending' || g.status === 'running';
```

All 11 web consumers migrate to helpers. Rejected `packages/shared/src/utils/thumbnails.ts` (shared location) — shared package convention is Zod + types only, not utility helpers. Backend uses Prisma where-clauses directly rather than frontend helpers (different shape).

## Affected files

### Backend (6 files)

| # | File | Change | Sites |
|---|---|---|---|
| 1 | `prisma/schema.prisma` | Add `phase String?` to ThumbnailGeneration model | 1 model |
| 2 | `packages/shared/src/schemas/thumbnails.ts` | `THUMBNAIL_PHASES` + `status` enum + `phase` nullable in `ThumbnailGenerationItemSchema` | Line 40, 133-152 |
| 3 | `apps/server/src/products/services/thumbnail-status.helpers.ts` | **NEW** — 3 helper functions | 0 → new |
| 4 | `apps/server/src/products/services/thumbnail-generation.service.ts` | 5 writer sites via helpers + 1 raw SQL rewrite | L40-49, 91, 112, 139, 175 |
| 5 | `apps/server/src/products/services/thumbnail-edit.service.ts` | 8 writer sites via helpers or inline | L25, 56, 61, 125, 153, 165, 196, 204 |
| 6 | `apps/server/src/products/CLAUDE.md` | Update "Status flow" line from `pending → generating → ready → applied` to canonical `pending → running → succeeded({ready→applied})` + note `skipped` → `cancelled` | 1 doc line |

### Tests (2 files)

| # | File | Change |
|---|---|---|
| 6 | `apps/server/src/products/services/__tests__/thumbnail-flow.spec.ts` | Update 8+ legacy-literal assertions; add 2 new: `saveEditorResult` cold-start, `skipGeneration` cancelled+null |
| 7 | `apps/server/src/products/services/__tests__/thumbnail-edit.spec.ts` | Update 8+ legacy-literal assertions; add 1 new: `reEditJob` terminal→pending phase reset |
| - | `apps/server/src/products/services/__tests__/helpers.ts` | **NEW** — `expectValidInvariant(row)` shared helper |

### Frontend (12 files)

| # | File | Change |
|---|---|---|
| 8 | `apps/web/src/lib/thumbnail-status.ts` | **NEW** — `isReady / isApplied / isActive` |
| 9 | `apps/web/src/hooks/useThumbnailGenerations.ts` | Optimistic writer + polling guard (L17, 33, 90) |
| 10 | `apps/web/src/app/thumbnails/hooks/useThumbnailGenerations.ts` | Same as #9 (duplicate; consolidate in follow-up) |
| 11 | `apps/web/src/components/thumbnails/ThumbnailStatusBadge.tsx` | Label map + icon map via phase-aware derive (L12-15) |
| 12 | `apps/web/src/components/thumbnails/ProductCard.tsx` | Keep `overlay` prop type; caller translates status+phase → overlay value (L14, 104, 131, 138) |
| 13 | `apps/web/src/components/thumbnails/DetailModal.tsx` | 3 status checks via helpers (L118, 123, 298) |
| 14 | `apps/web/src/app/thumbnails/page.tsx` | 15+ sites via helpers (L106, 151, 213-215, 268, 479, 502, 506, 1035, 1140, 1201-1203, 1616, 1639-1643, 1802-1803, 1878-1887, 1966, 1992, 2129, 2220-2226) |
| 15 | `apps/web/src/app/thumbnails/components/GenerationQueue.tsx` | Label map + overlay (L11-14, 149) |
| 16 | `apps/web/src/app/thumbnails/components/GenerationHistory.tsx` | Label map + overlay (L11-14, 69) |
| 17 | `apps/web/src/app/thumbnails/components/RegenerationPipeline.tsx` | `applied` counts via helper (L33, 84) |
| 18 | `apps/web/src/app/thumbnail-editor/components/EditorHistoryTab.tsx` | Overlay adapter (L44, 92-98) |
| 19 | `apps/web/src/app/thumbnail-editor/components/ThumbnailEditorView.tsx` | Re-verify at plan time (grep) |

### Database (3 files)

| # | File | Change |
|---|---|---|
| 20 | `prisma/backfill-status-canonical-thumbnail.sql` | **NEW** — 4 UPDATE + sanity check |
| 21 | `prisma/rollback-status-canonical-thumbnail.sql` | **NEW** — inverse UPDATE, valid only pre-new-writes |
| 22 | `prisma/init.sql.gz` | Regenerated after local backfill |

**Total**: 23 files.

Breakdown:
- **Modified (18)**: #1, #2, #4, #5, #6, #7, #9, #10, #11, #12, #13, #14, #15, #16, #17, #18, #19, #22 (`init.sql.gz` treated as modified — file already exists)
- **New (5)**: #3 (backend helper), `__tests__/helpers.ts` (test helper — tracked under Tests section), #8 (web helper), #20 (backfill SQL), #21 (rollback SQL)

The line grep hotspots (especially `page.tsx` 15+ sites) are **listed as of the current HEAD of branch `claude/focused-euler`**. Plan stage MUST re-grep (`rg "'ready'|'applied'|'skipped'|'generating'" apps/web/src/app/thumbnails/page.tsx`) to confirm line numbers haven't drifted and the list is exhaustive. Treat the spec's line numbers as a snapshot, not contract.

## Task order (atomic compile)

```
T1. Schema           prisma/schema.prisma + db:push + prisma generate
T2. Shared Zod       packages/shared/src/schemas/thumbnails.ts + `npm run build -w @kiditem/shared`
       └── @kiditem/shared dist/ must be rebuilt BEFORE T3 AND T5 start
           (both backend services and web consumers import from it).
T3. Writer           thumbnail-status.helpers.ts (new) + 2 service files + backend `satisfies`
T4. Tests            __tests__/helpers.ts (new invariant helper) + updated assertions + 3 new cases
T5. Frontend         apps/web/src/lib/thumbnail-status.ts (new) + 11 consumers (files parallel-safe within T5)
T6. Backfill         SQL + rollback SQL
T7. init.sql.gz      pg_dump regeneration
T8. Verification     tsc + vitest + build + dev:server + DB sanity
T9. PR               single atomic PR per Phase 2 precedent
```

**Rationale**:
- T2 propagates: `@kiditem/shared` dist must be rebuilt after Zod change, and BOTH T3 (server tsc) and T5 (web tsc) depend on the new types. T3 and T5 can run in any order after T2 completes its build.
- Writer (T3) deploys canonical values before backfill (T6) — prevents race where in-flight `generating` writes coexist with backfill UPDATEs.
- T6 backfill is idempotent (re-run is no-op), so a few racing `generating` writes landing after writer rollout and before backfill execution are fine — backfill's next pass catches them. Still, deploy gap should be minimized.
- Frontend (T5) + Zod tighten (T2) atomic with writer (T3) because the shared package compile-break propagates to web; split PRs would leave web un-buildable.
- `satisfies` pattern applies in services that build response payloads from Prisma rows (e.g., `toGeneration()` in `thumbnail-generation.service.ts:10-16`): `return { ... } satisfies ThumbnailGenerationItem` catches Prisma↔Zod drift at tsc time. Preserved as-is; no new `satisfies` added.

## Migration SQL

### Backfill

```sql
-- ADR-0011 Phase 3: ThumbnailGeneration status canonicalization
-- Idempotent: re-running is no-op.
BEGIN;

UPDATE thumbnail_generations SET status = 'running'                       WHERE status = 'generating';
UPDATE thumbnail_generations SET status = 'succeeded', phase = 'ready'    WHERE status = 'ready';
UPDATE thumbnail_generations SET status = 'succeeded', phase = 'applied'  WHERE status = 'applied';
UPDATE thumbnail_generations SET status = 'cancelled'                     WHERE status = 'skipped';

-- Sanity: both must be 0
SELECT 'legacy-remaining', COUNT(*) FROM thumbnail_generations
  WHERE status IN ('generating', 'ready', 'applied', 'skipped')
UNION ALL
SELECT 'invariant-violation', COUNT(*) FROM thumbnail_generations
  WHERE (status = 'succeeded' AND phase IS NULL)
     OR (status != 'succeeded' AND phase IS NOT NULL);

COMMIT;
```

### Rollback

```sql
-- DANGEROUS: safe only before new canonical writes land post-Phase 3.
BEGIN;

UPDATE thumbnail_generations SET status = 'generating', phase = NULL WHERE status = 'running';
UPDATE thumbnail_generations SET status = 'ready',      phase = NULL WHERE status = 'succeeded' AND phase = 'ready';
UPDATE thumbnail_generations SET status = 'applied',    phase = NULL WHERE status = 'succeeded' AND phase = 'applied';
UPDATE thumbnail_generations SET status = 'skipped',    phase = NULL WHERE status = 'cancelled';

COMMIT;
```

**Rollback invariant** (Phase 1/2 precedent): This rollback is safe ONLY if executed immediately after Phase 3 deploy, BEFORE any new writes land that use the canonical vocabulary. Once the new writer code starts producing `succeeded`/`cancelled`/`running`/`failed` rows that were never legacy values, rolling back collapses legitimate new data into legacy values (e.g., a genuine `cancelled` row would be mapped back to `skipped` even if it was never skipped in the legacy sense). Post-deploy rollback requires forward-fix (a PR that re-reverts to legacy writer + legacy web + drops `phase` column) instead of running this SQL.

### PR template requirements

Per [root CLAUDE.md](../../../CLAUDE.md) + `.github/PULL_REQUEST_TEMPLATE.md`, the Phase 3 PR body must include the full template checklist. At minimum:
- [ ] `prisma/schema.prisma` 변경 있음 — `phase` 컬럼 추가
- [ ] backfill SQL 있음 → `prisma/backfill-status-canonical-thumbnail.sql`
- [ ] rollback SQL 있음 → `prisma/rollback-status-canonical-thumbnail.sql`
- [ ] `prisma/init.sql.gz` 갱신함
- [ ] `npx vitest run` 통과
- [ ] `npm run build -w apps/server` + `apps/web` 빌드 성공
- [ ] `npm run start:dev` 부트 확인 (NestJS DI)
- [ ] ADR-0011 Rule 1~5 준수 (prescriptive ADR)

### Post-pull instructions for teammates

After PR merges, teammates need to sync local DB + rebuild shared types. Add to PR body:

```markdown
## Post-pull instructions

```bash
git pull
npm run build -w packages/shared
npx prisma generate
docker exec -i kiditem-postgres psql -U kiditem kiditem < prisma/backfill-status-canonical-thumbnail.sql
# or: reload init.sql.gz via kiditem-sync skill (destructive)
```

Skipping the backfill → legacy `'ready'/'applied'` rows remain in DB; frontend (post-Zod-tighten) rejects them as invalid enum values and runs fail Zod parse with "Invalid enum value" errors on list fetch.
```

## Test strategy

- **Update** existing assertions in `thumbnail-flow.spec.ts` + `thumbnail-edit.spec.ts` to match canonical writes (`status: 'succeeded', phase: 'ready'` etc.).
- **Introduce** `expectValidInvariant(row)` helper in a new `__tests__/helpers.ts`. Invoke from every writer test that inspects a row's `status + phase`.
- **New** tests:
  - `saveEditorResult` cold-start path (pending → direct succeeded+phase='ready'; bypasses running transition).
  - `reEditJob` terminal→pending reset (status='succeeded'+phase='ready' → status='pending'+phase=null).
  - `skipGeneration` produces `status='cancelled'+phase=null` (not `status='succeeded'+phase='skipped'`).

No E2E additions — current flow has no E2E harness for thumbnails; invariant is fully expressible in unit + integration tests.

## Architecture decisions (ADR-0011 alignment)

- **Rule 1** (canonical status): satisfied — all 6 legacy values mapped to canonical enum.
- **Rule 2** (sibling columns): satisfied — `phase` sibling for disposition sub-state; no `failureType` added (YAGNI).
- **Rule 3** (typed union in shared): satisfied — `THUMBNAIL_PHASES` exported from `packages/shared/src/schemas/thumbnails.ts`.
- **Rule 4** (no mapping tables at consumers): satisfied — frontend helpers compose canonical fields directly; no normalization layer.
- **Rule 5** (phased rollout): Phase 3 completes the sequence (WorkflowRun → HeartbeatRun → ThumbnailGeneration).

## Pre-existing concerns (Phase 3 leaves untouched, tracked for follow-up)

1. `applyGeneration` non-atomic 2-table write (`Product.imageUrl` then `ThumbnailGeneration.status`) — ADR exception required if fixed with `$transaction`.
2. `processEditJob` double-fire race (reEditJob → setImmediate overlap with in-flight edit).
3. `useThumbnailGenerations.ts` duplicated at two paths.

## Open questions (for plan stage)

- `ThumbnailEditorView.tsx` may have additional status literals — verify at plan grep stage.
- Backfill timing in production: row count in prod DB unknown at design time. Phase 2 precedent suggests sub-second on typical volumes.

## References

- [ADR-0011](../../../.claude/docs/decisions/0011-status-canonical-lifecycle.md)
- [Phase 1 plan](./2026-04-15-status-canonical.md)
- [Phase 2 plan (v2)](./2026-04-15-status-canonical-phase2.md)
- Phase 2 PR #11 (merge commit `5ed570d`)
- [prisma/CLAUDE.md](../../../prisma/CLAUDE.md) — snake_case @@map, String + app validation
- [products/CLAUDE.md](../../../apps/server/src/products/CLAUDE.md) — thumbnail pipeline, `$transaction` ban
