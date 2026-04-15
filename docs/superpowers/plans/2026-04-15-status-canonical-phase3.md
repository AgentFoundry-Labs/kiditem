# Status Canonical Phase 3 (ThumbnailGeneration) Implementation Plan — v2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Revision**: v2 of 2026-04-15. Supersedes v1 after critic + plan-eng-review flagged 1 CRITICAL + 4 MAJOR + 5 MINOR. v1 misclassified a web hook re-export as a duplicate file, missed two inline `StatusBadge` components, ordered backfill after Zod tighten (dev-gap risk), and omitted helper + cold-start + frontend-helper tests. v2 fixes all + reorders tasks for dev-gap-free sequencing + adds state-machine ASCII diagram per eng-manager preference.

**Goal:** Migrate ThumbnailGeneration status vocabulary to ADR-0011 canonical enum (`pending|running|succeeded|failed|cancelled`) with a new `phase` sibling column for post-succeeded disposition (`ready|applied`).

**Architecture:** Single atomic PR. Order: schema → local backfill (ordering fix) → shared Zod → backend helpers → backend writer migration → backend tests (including helper unit + cold-start + invariant) → frontend helpers → frontend helper tests → frontend consumers → SQL files → init.sql.gz → docs → verification (with grep sweep) → PR. Writer helpers centralize status+phase co-write invariant with optional `include` for single-roundtrip updates. Frontend helpers centralize 2-column status+phase predicates.

**Tech Stack:** Prisma (schema), Zod + TypeScript (shared types), NestJS (backend), Next.js + React Query (frontend), Vitest (tests), Postgres (DB), raw SQL backfill.

**Spec:** [docs/superpowers/specs/2026-04-15-status-canonical-phase3-design.md](../specs/2026-04-15-status-canonical-phase3-design.md)  
**ADR:** [.claude/docs/decisions/0011-status-canonical-lifecycle.md](../../../.claude/docs/decisions/0011-status-canonical-lifecycle.md)  
**Branch:** `refactor/status-canonical-thumbnail` (current worktree: `claude/focused-euler` — rename before PR)  
**Precedent:** Phase 1 PR #9, Phase 2 PR #11 (`5ed570d`)

---

## State machine (canonical)

```
                  markReady(extras?)              markApplied()
   ┌───────┐     ┌─────────────────┐            ┌─────────────────┐
   │pending├────►│  succeeded      │───────────►│  succeeded      │
   │       │     │  + phase='ready'│            │  + phase='applied'
   └───┬───┘     └────────┬────────┘            └────────┬────────┘
       │                  │                              │
       ▼                  │  skipGeneration              │ reEditJob (re-edit)
   ┌───────┐              ▼                              ▼
   │running│     ┌─────────────────┐            ┌────────────────┐
   │       │     │  cancelled      │            │ resetToPending │
   └───┬───┘     │  + phase=null   │            │  → pending     │
       │         └─────────────────┘            │  + phase=null  │
       ▼                                        └────────────────┘
   ┌───────┐     cold-start via saveEditorResult:  create({status:'succeeded', phase:'ready'})
   │failed │
   │+phase=null│
   └───────┘

Invariants (enforced by writer helpers + Zod + expectValidInvariant):
  status = 'succeeded'  ⇔  phase ∈ {'ready', 'applied'}
  status ≠ 'succeeded'  ⇔  phase = null
```

---

## Non-goals

- `applyGeneration` 2-table atomicity — deferred follow-up PR (would need `$transaction` exception ADR)
- `processEditJob` double-fire race — deferred follow-up PR
- `THUMBNAIL_FAILURE_TYPES` sibling column — YAGNI
- `useThumbnailGenerations.ts` duplicate consolidation (turns out `app/thumbnails/hooks/*` is a 1-line re-export, not a true duplicate — critic correction)
- Phase 4 `AgentTask.status` canonicalization — separate ADR decision

## Pre-flight (line numbers verified on `claude/focused-euler` at commit 56ddcb9)

Backend writer sites (13 total):
- `apps/server/src/products/services/thumbnail-generation.service.ts`: L40, 42 (raw SQL), 91, 112, 139, 175
- `apps/server/src/products/services/thumbnail-edit.service.ts`: L25, 56, 61, 125, 153, 165, 196, 204

Frontend sites (11 files, 1 of which is a 1-line re-export):
- `apps/web/src/hooks/useThumbnailGenerations.ts`: L17, 33, 90 — canonical hook
- `apps/web/src/app/thumbnails/hooks/useThumbnailGenerations.ts`: **1-line re-export** (`export * from '@/hooks/useThumbnailGenerations'`) — NO edits needed
- `apps/web/src/components/thumbnails/ThumbnailStatusBadge.tsx`: L12–15, 22
- `apps/web/src/components/thumbnails/ProductCard.tsx`: L14, 104, 131, 138
- `apps/web/src/components/thumbnails/DetailModal.tsx`: L118, 123, 298
- `apps/web/src/app/thumbnails/page.tsx`: L106, 151, 213, 215, 268, 479, 502, 506, 1035, 1140, 1201, 1203, 1616, 1639, 1643, 1802, 1803, 1814, **1825**, 1878–1880, 1885–1887, 1966, 1992, 2129, 2220–2226
- `apps/web/src/app/thumbnails/components/GenerationQueue.tsx`: L8–22 (own inline StatusBadge), L149
- `apps/web/src/app/thumbnails/components/GenerationHistory.tsx`: L8–24 (own inline StatusBadge), L69
- `apps/web/src/app/thumbnails/components/RegenerationPipeline.tsx`: L33, 84
- `apps/web/src/app/thumbnail-editor/components/EditorHistoryTab.tsx`: L44, 92–98

Tests (2 files + 3 new):
- `apps/server/src/products/services/__tests__/thumbnail-flow.spec.ts`: L515, 525, 540, 555, 565, 578, 580, 592, 602, 615, 617
- `apps/server/src/products/services/__tests__/thumbnail-edit.spec.ts`: L49, 64, 67, 84, 119, 124, 138, 150
- NEW: `apps/server/src/products/services/__tests__/helpers.ts` (invariant helper)
- NEW: `apps/server/src/products/services/__tests__/thumbnail-status.helpers.spec.ts` (helper unit tests)
- NEW: `apps/web/src/lib/__tests__/thumbnail-status.test.ts` (frontend helper tests)

`ThumbnailEditorView.tsx` verified — no legacy literals, not in scope.

---

## Task 1: Prisma schema — add `phase` column

**Files:**
- Modify: `prisma/schema.prisma` (model `ThumbnailGeneration`, around L658–685)

- [ ] **Step 1: Add `phase` field**

Edit `prisma/schema.prisma` — inside `model ThumbnailGeneration`, insert `phase` right after `status`:

```prisma
model ThumbnailGeneration {
  // ...existing fields
  originalUrl String? @map("original_url")
  candidates  Json    @default("[]")
  selectedUrl String? @map("selected_url")
  status      String  @default("pending")
  phase       String? @map("phase")
  grade       String  @default("F")
  // ...rest unchanged

  @@index([companyId])
  @@index([productId])
  @@index([status])
  @@index([method])
  @@map("thumbnail_generations")
}
```

Do NOT add `@@index([phase])` — cardinality 2-value + null has poor B-tree effectiveness.

- [ ] **Step 2: Apply schema to DB + regenerate Prisma client**

```bash
npm run db:push
npx prisma generate
```

Expected:
- `db:push` reports "Your database is now in sync with your Prisma schema."
- `prisma generate` reports "Generated Prisma Client".

- [ ] **Step 3: Verify column exists**

```bash
docker exec kiditem-postgres psql -U kiditem -c "\d thumbnail_generations" kiditem | grep phase
```
Expected: `phase | text |  |` (nullable, no default).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(prisma): add ThumbnailGeneration.phase sibling column (ADR-0011 Phase 3)"
```

---

## Task 2: Local DB backfill (moved from later — prevents Zod tighten dev gap)

**Files:**
- Create: `prisma/backfill-status-canonical-thumbnail.sql`

**Why first (not last):** v1 ran backfill after Zod tighten (Task 14 after Task 2). Between commits, dev server list-fetch would Zod-fail on legacy rows. v2 runs local backfill immediately after schema push so DB is canonical before Zod tighten lands.

- [ ] **Step 1: Create backfill SQL**

Create `prisma/backfill-status-canonical-thumbnail.sql`:

```sql
-- ADR-0011 Phase 3: ThumbnailGeneration status canonicalization
-- Pre-condition: Task 1 schema (phase column) deployed.
-- Idempotent: running twice is a no-op.

BEGIN;

-- 1. generating → running
UPDATE thumbnail_generations SET status = 'running'                       WHERE status = 'generating';

-- 2. ready → succeeded + phase='ready'
UPDATE thumbnail_generations SET status = 'succeeded', phase = 'ready'    WHERE status = 'ready';

-- 3. applied → succeeded + phase='applied'
UPDATE thumbnail_generations SET status = 'succeeded', phase = 'applied'  WHERE status = 'applied';

-- 4. skipped → cancelled
UPDATE thumbnail_generations SET status = 'cancelled'                     WHERE status = 'skipped';

-- Sanity checks — both must return 0
SELECT 'legacy-remaining' AS check_name, COUNT(*) AS n FROM thumbnail_generations
  WHERE status IN ('generating', 'ready', 'applied', 'skipped')
UNION ALL
SELECT 'invariant-violation' AS check_name, COUNT(*) AS n FROM thumbnail_generations
  WHERE (status = 'succeeded' AND phase IS NULL)
     OR (status <> 'succeeded' AND phase IS NOT NULL);

COMMIT;
```

- [ ] **Step 2: Run backfill on local DB**

```bash
docker exec -i kiditem-postgres psql -U kiditem kiditem < prisma/backfill-status-canonical-thumbnail.sql
```
Expected: both sanity checks return `n = 0`.

- [ ] **Step 3: Verify DB state**

```bash
docker exec kiditem-postgres psql -U kiditem -c \
  "SELECT status, phase, COUNT(*) FROM thumbnail_generations GROUP BY status, phase ORDER BY status, phase;" kiditem
```
Expected: all canonical status values; succeeded rows have phase set; others have phase null.

- [ ] **Step 4: Commit**

```bash
git add prisma/backfill-status-canonical-thumbnail.sql
git commit -m "chore(db): backfill ThumbnailGeneration status canonical + phase (ADR-0011 Phase 3)"
```

---

## Task 3: Rollback SQL (create now, before more commits)

**Files:**
- Create: `prisma/rollback-status-canonical-thumbnail.sql`

- [ ] **Step 1: Create rollback SQL**

Create `prisma/rollback-status-canonical-thumbnail.sql`:

```sql
-- ADR-0011 Phase 3 rollback.
-- DANGEROUS: safe ONLY immediately after Phase 3 deploy, BEFORE any new canonical
-- writes land that were never legacy values. Post-deploy rollback requires forward-fix
-- PR (revert writer + drop phase column) instead of this SQL — running it after new
-- writes collapses legitimate canonical rows into arbitrary legacy values.

BEGIN;

UPDATE thumbnail_generations SET status = 'generating', phase = NULL WHERE status = 'running';
UPDATE thumbnail_generations SET status = 'ready',      phase = NULL WHERE status = 'succeeded' AND phase = 'ready';
UPDATE thumbnail_generations SET status = 'applied',    phase = NULL WHERE status = 'succeeded' AND phase = 'applied';
UPDATE thumbnail_generations SET status = 'skipped',    phase = NULL WHERE status = 'cancelled';

COMMIT;
```

- [ ] **Step 2: Commit**

```bash
git add prisma/rollback-status-canonical-thumbnail.sql
git commit -m "chore(db): rollback SQL for Phase 3 thumbnail canonical (Phase 1/2 precedent)"
```

---

## Task 4: Shared Zod — status enum + phase + `THUMBNAIL_PHASES`

**Files:**
- Modify: `packages/shared/src/schemas/thumbnails.ts`

- [ ] **Step 1: Add `THUMBNAIL_PHASES` constant + type**

Insert at end of `packages/shared/src/schemas/thumbnails.ts`:

```typescript
// ─── ADR-0011 Phase 3: Canonical status + phase ─────────────────────────
export const THUMBNAIL_PHASES = ['ready', 'applied'] as const;
export type ThumbnailPhase = typeof THUMBNAIL_PHASES[number];
```

- [ ] **Step 2: Tighten `status` in `ThumbnailListItemSchema` (L~40)**

Find:
```typescript
status: z.string(),
```

Replace with:
```typescript
status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled']),
```

- [ ] **Step 3: Tighten + add `phase` in `ThumbnailGenerationItemSchema` (L~139)**

Find:
```typescript
  selectedUrl: z.string().nullable(),
  status: z.string(),
  grade: z.string(),
```

Replace with:
```typescript
  selectedUrl: z.string().nullable(),
  status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled']),
  phase: z.enum(THUMBNAIL_PHASES).nullable().optional(),
  grade: z.string(),
```

- [ ] **Step 4: Build shared package**

```bash
npm run build -w packages/shared
```
Expected: `tsup` completes, `packages/shared/dist/` updated.

Since Task 2 backfilled the local DB already, the dev-side list fetch (against canonicalized rows) will not Zod-fail.

- [ ] **Step 5: Run shared tests**

```bash
npx vitest run packages/shared
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas/thumbnails.ts
git commit -m "refactor(shared): ThumbnailGeneration status z.enum + THUMBNAIL_PHASES (ADR-0011 Phase 3)"
```

---

## Task 5: Backend writer helpers — new file (with `include` support)

**Files:**
- Create: `apps/server/src/products/services/thumbnail-status.helpers.ts`

- [ ] **Step 1: Create helper file**

Create `apps/server/src/products/services/thumbnail-status.helpers.ts`:

```typescript
import type { Prisma, PrismaClient, ThumbnailGeneration } from '@prisma/client';

type Client = PrismaClient | Prisma.TransactionClient;

/**
 * ADR-0011 Phase 3 writer helpers. Every helper enforces the invariant:
 *   status = 'succeeded' ⇔ phase ∈ {'ready', 'applied'}
 *   otherwise phase = null
 *
 * State machine (canonical):
 *
 *          markReady(extras?)     markApplied()
 *   pending ─running─────────► succeeded+ready ─────► succeeded+applied
 *      │        │                    │                       │
 *      │        ▼                    ▼                       ▼
 *      │     failed            (user skip)                resetToPending
 *      │                       = cancelled                     │
 *      └◄─────────────────────────────────────────────────────┘
 *
 * Simple terminals (failed/cancelled/running) are written inline with `phase: null`.
 * Helpers support optional `include` to avoid double roundtrip when a caller needs
 * related rows (e.g., include: { product: ... }).
 */

export type ReadyExtras = Partial<Pick<Prisma.ThumbnailGenerationUpdateInput,
  'selectedUrl' | 'candidates' | 'editAnalysis'>>;

export type ResetExtras = Partial<Pick<Prisma.ThumbnailGenerationUpdateInput,
  'candidates' | 'selectedUrl'>>;

type MarkOptions = {
  include?: Prisma.ThumbnailGenerationInclude;
};

export async function markReady<I extends MarkOptions['include']>(
  prisma: Client,
  id: string,
  extras: ReadyExtras = {},
  options?: { include?: I },
) {
  return prisma.thumbnailGeneration.update({
    where: { id },
    data: { status: 'succeeded', phase: 'ready', ...extras },
    ...(options?.include ? { include: options.include } : {}),
  });
}

export async function markApplied<I extends MarkOptions['include']>(
  prisma: Client,
  id: string,
  options?: { include?: I },
) {
  return prisma.thumbnailGeneration.update({
    where: { id },
    data: { status: 'succeeded', phase: 'applied' },
    ...(options?.include ? { include: options.include } : {}),
  });
}

export async function resetToPending(
  prisma: Client,
  id: string,
  extras: ResetExtras = {},
): Promise<ThumbnailGeneration> {
  return prisma.thumbnailGeneration.update({
    where: { id },
    data: { status: 'pending', phase: null, ...extras },
  });
}
```

- [ ] **Step 2: Verify tsc**

```bash
cd apps/server && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/products/services/thumbnail-status.helpers.ts
git commit -m "feat(products): thumbnail status writer helpers (markReady/markApplied/resetToPending) with include support"
```

---

## Task 6: Backend writer migration — `thumbnail-generation.service.ts`

**Files:**
- Modify: `apps/server/src/products/services/thumbnail-generation.service.ts`

- [ ] **Step 1: Add helper imports**

After existing imports:
```typescript
import { markReady, markApplied } from './thumbnail-status.helpers';
```

- [ ] **Step 2: Update raw SQL (L38–49)**

Find:
```typescript
      await this.prisma.$executeRaw`
        UPDATE thumbnail_generations
        SET status = 'pending', selected_url = NULL
        WHERE method = 'edit'
          AND status IN ('ready', 'applied')
          AND (
            candidates = '[]'::jsonb
            OR (
              jsonb_array_length(candidates) > 0
              AND candidates->0->>'url' LIKE '/%'
            )
          )
      `.catch((err: unknown) => {
```

Replace with:
```typescript
      await this.prisma.$executeRaw`
        UPDATE thumbnail_generations
        SET status = 'pending', phase = NULL, selected_url = NULL
        WHERE method = 'edit'
          AND status = 'succeeded'
          AND phase IN ('ready', 'applied')
          AND (
            candidates = '[]'::jsonb
            OR (
              jsonb_array_length(candidates) > 0
              AND candidates->0->>'url' LIKE '/%'
            )
          )
      `.catch((err: unknown) => {
```

- [ ] **Step 3: Update `selectCandidate` — single roundtrip via `include`**

Find:
```typescript
    const updated = await this.prisma.thumbnailGeneration.update({
      where: { id },
      data: { selectedUrl: selectedUrl || null, status: 'ready' },
      include: { product: { select: { id: true, name: true, imageUrl: true, coupangProductId: true, category: true } } },
    });
```

Replace with:
```typescript
    const updated = await markReady(
      this.prisma,
      id,
      { selectedUrl: selectedUrl || null },
      { include: { product: { select: { id: true, name: true, imageUrl: true, coupangProductId: true, category: true } } } },
    );
```

- [ ] **Step 4: Update `applyGeneration` — single roundtrip via `include`**

Find:
```typescript
    const updated = await this.prisma.thumbnailGeneration.update({
      where: { id },
      data: { status: 'applied' },
      include: { product: { select: { id: true, name: true, imageUrl: true, coupangProductId: true, category: true } } },
    });
```

Replace with:
```typescript
    const updated = await markApplied(
      this.prisma,
      id,
      { include: { product: { select: { id: true, name: true, imageUrl: true, coupangProductId: true, category: true } } } },
    );
```

- [ ] **Step 5: Update `skipGeneration` (L137–141)**

Find:
```typescript
    const updated = await this.prisma.thumbnailGeneration.update({
      where: { id },
      data: { status: 'skipped' },
      include: { product: { select: { id: true, name: true, imageUrl: true, coupangProductId: true, category: true } } },
    });
```

Replace with:
```typescript
    const updated = await this.prisma.thumbnailGeneration.update({
      where: { id },
      data: { status: 'cancelled', phase: null },
      include: { product: { select: { id: true, name: true, imageUrl: true, coupangProductId: true, category: true } } },
    });
```

- [ ] **Step 6: Update `saveEditorResult` (L169–180) — cold-start**

Find:
```typescript
      const gen = await this.prisma.thumbnailGeneration.create({
        data: {
          productId: params.productId,
          companyId: params.companyId,
          originalUrl: params.originalUrl,
          candidates: params.candidates,
          status: 'ready',
          method: params.method ?? 'generate',
          grade: '-',
          score: 0,
        },
      });
```

Replace with:
```typescript
      const gen = await this.prisma.thumbnailGeneration.create({
        data: {
          productId: params.productId,
          companyId: params.companyId,
          originalUrl: params.originalUrl,
          candidates: params.candidates,
          status: 'succeeded',
          phase: 'ready',
          method: params.method ?? 'generate',
          grade: '-',
          score: 0,
        },
      });
```

- [ ] **Step 7: Run tsc**

```bash
cd apps/server && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/products/services/thumbnail-generation.service.ts
git commit -m "refactor(products): canonical status + phase in thumbnail-generation.service (5 sites, helper+include)"
```

---

## Task 7: Backend writer migration — `thumbnail-edit.service.ts`

**Files:**
- Modify: `apps/server/src/products/services/thumbnail-edit.service.ts`

- [ ] **Step 1: Add helper imports**

```typescript
import { markReady, resetToPending } from './thumbnail-status.helpers';
```

- [ ] **Step 2: Add ASCII state comment above `processEditJob` (L~139)**

Insert comment block immediately before `private async processEditJob` declaration:

```typescript
  /**
   * Edit job state transitions:
   *   (caller state)                   (processEditJob writes)
   *   pending|running  ─────────►  running (phase=null)
   *     │                              │
   *     │                              ├─► succeeded + phase='ready'   (markReady, happy path)
   *     │                              ├─► failed + phase=null          (0 candidates / timeout / generic error)
   *     │
   *     reEditJob: succeeded+{ready|applied} ─► pending+phase=null (resetToPending)
   */
  private async processEditJob(...)
```

- [ ] **Step 3: Update findFirst generating (L24–26)**

Find:
```typescript
        const generatingJob = await this.prisma.thumbnailGeneration.findFirst({
          where: { productId, method: 'edit', status: 'generating' },
        });
```

Replace with:
```typescript
        const generatingJob = await this.prisma.thumbnailGeneration.findFirst({
          where: { productId, method: 'edit', status: 'running' },
        });
```

- [ ] **Step 4: Update deleteMany terminal (L52–58)**

Find:
```typescript
        await this.prisma.thumbnailGeneration.deleteMany({
          where: {
            productId,
            method: 'edit',
            status: { in: ['failed', 'skipped'] },
          },
        });
```

Replace with:
```typescript
        await this.prisma.thumbnailGeneration.deleteMany({
          where: {
            productId,
            method: 'edit',
            status: { in: ['failed', 'cancelled'] },
          },
        });
```

- [ ] **Step 5: Update findMany completed (L60–64)**

Find:
```typescript
        const completedJobs = await this.prisma.thumbnailGeneration.findMany({
          where: { productId, method: 'edit', status: { in: ['ready', 'applied'] } },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
```

Replace with:
```typescript
        const completedJobs = await this.prisma.thumbnailGeneration.findMany({
          where: { productId, method: 'edit', status: 'succeeded', phase: { in: ['ready', 'applied'] } },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
```

- [ ] **Step 6: Update `reEditJob` reset (L123–126) — critic M1 fix**

Find:
```typescript
    await this.prisma.thumbnailGeneration.update({
      where: { id: generationId },
      data: { status: 'pending', candidates: [], selectedUrl: null },
    });
```

Replace with:
```typescript
    await resetToPending(this.prisma, generationId, { candidates: [], selectedUrl: null });
```

- [ ] **Step 7: Update `processEditJob` start (L151–154)**

Find:
```typescript
    try {
      await this.prisma.thumbnailGeneration.update({
        where: { id: generationId },
        data: { status: 'generating' },
      });
```

Replace with:
```typescript
    try {
      await this.prisma.thumbnailGeneration.update({
        where: { id: generationId },
        data: { status: 'running', phase: null },
      });
```

- [ ] **Step 8: Update `processEditJob` failed (no candidates, L162–167)**

Find:
```typescript
      if (candidates.length === 0) {
        await this.prisma.thumbnailGeneration.update({
          where: { id: generationId },
          data: { status: 'failed' },
        });
        return;
      }
```

Replace with:
```typescript
      if (candidates.length === 0) {
        await this.prisma.thumbnailGeneration.update({
          where: { id: generationId },
          data: { status: 'failed', phase: null },
        });
        return;
      }
```

- [ ] **Step 9: Update `processEditJob` ready (L191–199)**

Find:
```typescript
      await this.prisma.thumbnailGeneration.update({
        where: { id: generationId },
        data: {
          candidates: candidates as unknown as Prisma.InputJsonValue,
          status: 'ready',
          editAnalysis: editAnalysis as unknown as Prisma.InputJsonValue,
        },
      });
```

Replace with:
```typescript
      await markReady(this.prisma, generationId, {
        candidates: candidates as unknown as Prisma.InputJsonValue,
        editAnalysis: editAnalysis as unknown as Prisma.InputJsonValue,
      });
```

- [ ] **Step 10: Update `processEditJob` failed catch (L200–206)**

Find:
```typescript
    } catch (error) {
      this.logger.error(`편집 처리 실패 (${generationId}): ${error instanceof Error ? error.message : error}`);
      await this.prisma.thumbnailGeneration.update({
        where: { id: generationId },
        data: { status: 'failed' },
      }).catch(() => {});
    }
```

Replace with:
```typescript
    } catch (error) {
      this.logger.error(`편집 처리 실패 (${generationId}): ${error instanceof Error ? error.message : error}`);
      await this.prisma.thumbnailGeneration.update({
        where: { id: generationId },
        data: { status: 'failed', phase: null },
      }).catch(() => {});
    }
```

- [ ] **Step 11: Run tsc**

```bash
cd apps/server && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add apps/server/src/products/services/thumbnail-edit.service.ts
git commit -m "refactor(products): canonical status + phase in thumbnail-edit.service (8 sites + state diagram)"
```

---

## Task 8: Test invariant helper — new file

**Files:**
- Create: `apps/server/src/products/services/__tests__/helpers.ts`

- [ ] **Step 1: Create invariant helper**

Create `apps/server/src/products/services/__tests__/helpers.ts`:

```typescript
import { expect } from 'vitest';

/**
 * ADR-0011 Phase 3 invariant: status='succeeded' ⇔ phase ∈ {'ready','applied'}.
 * Otherwise phase must be null.
 */
export function expectValidInvariant(row: { status?: string | null; phase?: string | null }): void {
  const { status, phase } = row;
  if (status === 'succeeded') {
    expect(phase, `status='succeeded' requires phase ∈ {'ready','applied'}`).toMatch(/^(ready|applied)$/);
  } else {
    expect(phase, `status='${status}' requires phase=null`).toBeNull();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/products/services/__tests__/helpers.ts
git commit -m "test(products): expectValidInvariant helper for thumbnail status+phase"
```

---

## Task 9: Helper unit tests — NEW

**Files:**
- Create: `apps/server/src/products/services/__tests__/thumbnail-status.helpers.spec.ts`

- [ ] **Step 1: Create unit tests for helpers**

Create `apps/server/src/products/services/__tests__/thumbnail-status.helpers.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { markReady, markApplied, resetToPending } from '../thumbnail-status.helpers';
import { expectValidInvariant } from './helpers';

describe('thumbnail-status helpers', () => {
  let prisma: any;

  beforeEach(() => {
    prisma = {
      thumbnailGeneration: {
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'g1', ...data })),
      },
    };
  });

  describe('markReady', () => {
    it('writes status=succeeded + phase=ready', async () => {
      const result = await markReady(prisma, 'g1');
      expect(prisma.thumbnailGeneration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'g1' },
          data: expect.objectContaining({ status: 'succeeded', phase: 'ready' }),
        }),
      );
      expectValidInvariant(result);
    });

    it('merges extras (selectedUrl, candidates, editAnalysis)', async () => {
      await markReady(prisma, 'g1', { selectedUrl: '/x.jpg', candidates: [] as any });
      expect(prisma.thumbnailGeneration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'succeeded',
            phase: 'ready',
            selectedUrl: '/x.jpg',
            candidates: [],
          }),
        }),
      );
    });

    it('forwards include option to Prisma', async () => {
      const include = { product: { select: { id: true } } };
      await markReady(prisma, 'g1', {}, { include });
      expect(prisma.thumbnailGeneration.update).toHaveBeenCalledWith(
        expect.objectContaining({ include }),
      );
    });
  });

  describe('markApplied', () => {
    it('writes status=succeeded + phase=applied', async () => {
      const result = await markApplied(prisma, 'g1');
      expect(prisma.thumbnailGeneration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'g1' },
          data: { status: 'succeeded', phase: 'applied' },
        }),
      );
      expectValidInvariant(result);
    });

    it('forwards include option', async () => {
      const include = { product: { select: { name: true } } };
      await markApplied(prisma, 'g1', { include });
      expect(prisma.thumbnailGeneration.update).toHaveBeenCalledWith(
        expect.objectContaining({ include }),
      );
    });
  });

  describe('resetToPending', () => {
    it('writes status=pending + phase=null', async () => {
      const result = await resetToPending(prisma, 'g1');
      expect(prisma.thumbnailGeneration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'g1' },
          data: expect.objectContaining({ status: 'pending', phase: null }),
        }),
      );
      expectValidInvariant(result);
    });

    it('merges candidates and selectedUrl extras', async () => {
      await resetToPending(prisma, 'g1', { candidates: [] as any, selectedUrl: null });
      expect(prisma.thumbnailGeneration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'pending', phase: null, candidates: [], selectedUrl: null },
        }),
      );
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd apps/server && npx vitest run src/products/services/__tests__/thumbnail-status.helpers.spec.ts
```
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/products/services/__tests__/thumbnail-status.helpers.spec.ts
git commit -m "test(products): unit tests for thumbnail-status helpers (markReady/markApplied/resetToPending)"
```

---

## Task 10: Test updates — `thumbnail-flow.spec.ts`

**Files:**
- Modify: `apps/server/src/products/services/__tests__/thumbnail-flow.spec.ts`

- [ ] **Step 1: Add invariant helper import**

At top of file:
```typescript
import { expectValidInvariant } from './helpers';
```

- [ ] **Step 2: Update selectCandidate test (L~515–540)**

Find `existingRecord = { id: 'gen-1', status: 'ready' }` → Replace with `existingRecord = { id: 'gen-1', status: 'succeeded', phase: 'ready' }`.

Find `status: 'ready',` in mocked update response → Replace with `status: 'succeeded', phase: 'ready',`.

Find `data: { selectedUrl: '/generated-thumbnails/chosen.png', status: 'ready' },` → Replace with `data: { status: 'succeeded', phase: 'ready', selectedUrl: '/generated-thumbnails/chosen.png' },`.

At end of test body, add:
```typescript
      expectValidInvariant(result);
```

- [ ] **Step 3: Update applyGeneration test (L~555–580)**

Find `existingRecord = { id: 'gen-1', status: 'ready' }` → `existingRecord = { id: 'gen-1', status: 'succeeded', phase: 'ready' }`.

Find `status: 'applied',` in mock → `status: 'succeeded', phase: 'applied',`.

Find `expect.objectContaining({ data: { status: 'applied' } })` → `expect.objectContaining({ data: { status: 'succeeded', phase: 'applied' } })`.

Find `expect(result.status).toBe('applied');` → replace with two lines:
```typescript
      expect(result.status).toBe('succeeded');
      expect(result.phase).toBe('applied');
      expectValidInvariant(result);
```

- [ ] **Step 4: Update skipGeneration test (L~592–617)**

Find `existingRecord = { id: 'gen-1', status: 'ready' }` → `existingRecord = { id: 'gen-1', status: 'succeeded', phase: 'ready' }`.

Find `status: 'skipped',` in mock → `status: 'cancelled', phase: null,`.

Find `expect.objectContaining({ data: { status: 'skipped' } })` → `expect.objectContaining({ data: { status: 'cancelled', phase: null } })`.

Find `expect(result.status).toBe('skipped');` → replace with:
```typescript
      expect(result.status).toBe('cancelled');
      expect(result.phase).toBeNull();
      expectValidInvariant(result);
```

- [ ] **Step 5: NEW test — saveEditorResult cold-start**

At end of the `describe('ThumbnailGenerationService')` block (or appropriate parent), add:

```typescript
  describe('saveEditorResult (cold-start invariant)', () => {
    it('creates row with status=succeeded + phase=ready (cold-start bypasses running)', async () => {
      prisma.thumbnailGeneration.create.mockResolvedValue({ id: 'new-gen' });

      await service.saveEditorResult({
        productId: 'p1',
        companyId: 'c1',
        originalUrl: 'https://example.com/o.jpg',
        candidates: [{ url: '/x.jpg', filename: 'x.jpg' }],
      });

      expect(prisma.thumbnailGeneration.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'succeeded', phase: 'ready' }),
        }),
      );
    });
  });
```

- [ ] **Step 6: Run tests**

```bash
cd apps/server && npx vitest run src/products/services/__tests__/thumbnail-flow.spec.ts
```
Expected: all pass (includes new cold-start case).

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/products/services/__tests__/thumbnail-flow.spec.ts
git commit -m "test(products): thumbnail-flow canonical assertions + saveEditorResult cold-start invariant"
```

---

## Task 11: Test updates — `thumbnail-edit.spec.ts`

**Files:**
- Modify: `apps/server/src/products/services/__tests__/thumbnail-edit.spec.ts`

- [ ] **Step 1: Update L49 mock (createEditJobs pending row)**

Ensure any mock row object with `status: 'pending'` also includes `phase: null` for type correctness:

Find:
```typescript
        status: 'pending',
```
Replace with:
```typescript
        status: 'pending',
        phase: null,
```

(Apply to all such rows — grep within file for `status: 'pending'` and add `phase: null` where row objects are being constructed. Skip places where `status: 'pending'` is an assertion value not an object field.)

- [ ] **Step 2: Update L84 findFirst generating → running**

Find:
```typescript
      prisma.thumbnailGeneration.findFirst.mockResolvedValue({ id: 'existing', status: 'generating' });
```

Replace with:
```typescript
      prisma.thumbnailGeneration.findFirst.mockResolvedValue({ id: 'existing', status: 'running', phase: null });
```

- [ ] **Step 3: Update L119 processEditJob start**

Find:
```typescript
        expect.objectContaining({ data: { status: 'generating' } }),
```

Replace with:
```typescript
        expect.objectContaining({ data: { status: 'running', phase: null } }),
```

- [ ] **Step 4: Update L124 processEditJob ready**

Find:
```typescript
            status: 'ready',
```

Replace with:
```typescript
            status: 'succeeded',
            phase: 'ready',
```

- [ ] **Step 5: Update L138 processEditJob failed**

Find:
```typescript
        expect.objectContaining({ where: { id: 'g2' }, data: { status: 'failed' } }),
```

Replace with:
```typescript
        expect.objectContaining({ where: { id: 'g2' }, data: { status: 'failed', phase: null } }),
```

- [ ] **Step 6: NEW test — reEditJob phase reset invariant**

At end of the `describe('ThumbnailEditService')` block, add:

```typescript
  describe('reEditJob (phase reset invariant)', () => {
    it("resets status='pending' AND phase=null when re-editing a succeeded+ready job", async () => {
      const job = {
        id: 'gen-ready',
        status: 'succeeded',
        phase: 'ready',
        originalUrl: 'https://example.com/a.jpg',
        product: { id: 'p1', name: 'X', imageUrl: null, coupangProductId: null, category: null },
      };
      prisma.thumbnailGeneration.findUnique.mockResolvedValue(job as any);

      await service.reEditJob('gen-ready');

      const updateCall = prisma.thumbnailGeneration.update.mock.calls.find(
        (c: any) => c[0]?.where?.id === 'gen-ready',
      );
      expect(updateCall).toBeDefined();
      expect(updateCall![0].data).toMatchObject({ status: 'pending', phase: null });
    });

    it("resets phase when re-editing a succeeded+applied job (stale phase → null)", async () => {
      const job = {
        id: 'gen-applied',
        status: 'succeeded',
        phase: 'applied',
        originalUrl: 'https://example.com/a.jpg',
        product: { id: 'p1', name: 'X', imageUrl: null, coupangProductId: null, category: null },
      };
      prisma.thumbnailGeneration.findUnique.mockResolvedValue(job as any);

      await service.reEditJob('gen-applied');

      const updateCall = prisma.thumbnailGeneration.update.mock.calls.find(
        (c: any) => c[0]?.where?.id === 'gen-applied',
      );
      expect(updateCall![0].data).toMatchObject({ status: 'pending', phase: null });
    });
  });
```

- [ ] **Step 7: Run tests**

```bash
cd apps/server && npx vitest run src/products/services/__tests__/thumbnail-edit.spec.ts
```
Expected: all pass (includes 2 new reEditJob cases).

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/products/services/__tests__/thumbnail-edit.spec.ts
git commit -m "test(products): thumbnail-edit canonical + reEditJob phase-reset invariant (2 new cases)"
```

---

## Task 12: Frontend helpers — new file

**Files:**
- Create: `apps/web/src/lib/thumbnail-status.ts`

- [ ] **Step 1: Create helper file**

Create `apps/web/src/lib/thumbnail-status.ts`:

```typescript
import type { ThumbnailGenerationItem } from '@kiditem/shared';

/**
 * ADR-0011 Phase 3 frontend helpers. Compose canonical (status, phase) into
 * domain-level predicates used by 11 web consumers.
 *
 * Invariants (enforced backend-side by writer helpers + Zod):
 *   status = 'succeeded'  ⇔  phase ∈ {'ready', 'applied'}
 *   status ≠ 'succeeded'  ⇔  phase = null
 */

type StatusPhase = Pick<ThumbnailGenerationItem, 'status' | 'phase'>;

export const isReady = (g: StatusPhase): boolean =>
  g.status === 'succeeded' && g.phase === 'ready';

export const isApplied = (g: StatusPhase): boolean =>
  g.status === 'succeeded' && g.phase === 'applied';

export const isActive = (g: StatusPhase): boolean =>
  g.status === 'pending' || g.status === 'running';

export const isCompleted = (g: StatusPhase): boolean =>
  g.status === 'succeeded';
```

- [ ] **Step 2: Run web tsc**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/thumbnail-status.ts
git commit -m "feat(web): thumbnail-status helpers (isReady/isApplied/isActive/isCompleted)"
```

---

## Task 13: Frontend helper unit tests — NEW

**Files:**
- Create: `apps/web/src/lib/__tests__/thumbnail-status.test.ts`

- [ ] **Step 1: Create tests**

Create `apps/web/src/lib/__tests__/thumbnail-status.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isReady, isApplied, isActive, isCompleted } from '../thumbnail-status';

describe('thumbnail-status helpers', () => {
  describe('isReady', () => {
    it('true when status=succeeded and phase=ready', () => {
      expect(isReady({ status: 'succeeded', phase: 'ready' })).toBe(true);
    });
    it('false when status=succeeded and phase=applied', () => {
      expect(isReady({ status: 'succeeded', phase: 'applied' })).toBe(false);
    });
    it('false when status=running', () => {
      expect(isReady({ status: 'running', phase: null })).toBe(false);
    });
  });

  describe('isApplied', () => {
    it('true when status=succeeded and phase=applied', () => {
      expect(isApplied({ status: 'succeeded', phase: 'applied' })).toBe(true);
    });
    it('false when phase=ready', () => {
      expect(isApplied({ status: 'succeeded', phase: 'ready' })).toBe(false);
    });
    it('false when status=cancelled', () => {
      expect(isApplied({ status: 'cancelled', phase: null })).toBe(false);
    });
  });

  describe('isActive', () => {
    it('true when status=pending', () => {
      expect(isActive({ status: 'pending', phase: null })).toBe(true);
    });
    it('true when status=running', () => {
      expect(isActive({ status: 'running', phase: null })).toBe(true);
    });
    it('false when status=succeeded', () => {
      expect(isActive({ status: 'succeeded', phase: 'ready' })).toBe(false);
    });
    it('false when status=failed', () => {
      expect(isActive({ status: 'failed', phase: null })).toBe(false);
    });
  });

  describe('isCompleted', () => {
    it('true when status=succeeded regardless of phase', () => {
      expect(isCompleted({ status: 'succeeded', phase: 'ready' })).toBe(true);
      expect(isCompleted({ status: 'succeeded', phase: 'applied' })).toBe(true);
    });
    it('false for all non-succeeded statuses', () => {
      expect(isCompleted({ status: 'pending', phase: null })).toBe(false);
      expect(isCompleted({ status: 'running', phase: null })).toBe(false);
      expect(isCompleted({ status: 'failed', phase: null })).toBe(false);
      expect(isCompleted({ status: 'cancelled', phase: null })).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd apps/web && npx vitest run src/lib/__tests__/thumbnail-status.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/__tests__/thumbnail-status.test.ts
git commit -m "test(web): unit tests for thumbnail-status helpers"
```

---

## Task 14: Frontend migration — `useThumbnailGenerations.ts` (SINGLE file, re-export stays)

**Files:**
- Modify: `apps/web/src/hooks/useThumbnailGenerations.ts`

**Critic fix**: `apps/web/src/app/thumbnails/hooks/useThumbnailGenerations.ts` is a 1-line re-export (`export * from '@/hooks/useThumbnailGenerations'`), NOT a true duplicate. It needs no edits — the canonical hook migration automatically propagates.

- [ ] **Step 1: Verify re-export structure**

```bash
cat apps/web/src/app/thumbnails/hooks/useThumbnailGenerations.ts
```
Expected: single-line `export * from '@/hooks/useThumbnailGenerations';` (or similar). No edits needed.

- [ ] **Step 2: Add helper import (canonical hook)**

In `apps/web/src/hooks/useThumbnailGenerations.ts`, after existing imports:
```typescript
import { isActive } from '@/lib/thumbnail-status';
```

- [ ] **Step 3: Update polling guard — L17**

Find:
```typescript
      const hasActiveJobs = data.some((g) => g.status === 'pending' || g.status === 'generating');
```

Replace with:
```typescript
      const hasActiveJobs = data.some(isActive);
```

- [ ] **Step 4: Update selectCandidate optimistic writer — L33**

Find:
```typescript
        old?.map((g) => g.id === id ? { ...g, selectedUrl: selectedUrl || null, status: 'ready' } : g) ?? [],
```

Replace with:
```typescript
        old?.map((g) => g.id === id ? { ...g, selectedUrl: selectedUrl || null, status: 'succeeded' as const, phase: 'ready' as const } : g) ?? [],
```

- [ ] **Step 5: Update reEditJob optimistic writer — L90**

Find:
```typescript
        old?.map((g) => g.id === id ? { ...g, status: 'generating', candidates: [] } : g) ?? [],
```

Replace with:
```typescript
        old?.map((g) => g.id === id ? { ...g, status: 'running' as const, phase: null, candidates: [] } : g) ?? [],
```

- [ ] **Step 6: Run web tsc**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/hooks/useThumbnailGenerations.ts
git commit -m "refactor(web): canonical status + phase in useThumbnailGenerations hook (re-export stays)"
```

---

## Task 15: Frontend migration — badge + card + modal

**Files:**
- Modify: `apps/web/src/components/thumbnails/ThumbnailStatusBadge.tsx`
- Modify: `apps/web/src/components/thumbnails/ProductCard.tsx`
- Modify: `apps/web/src/components/thumbnails/DetailModal.tsx`

- [ ] **Step 1: Update `ThumbnailStatusBadge.tsx` — phase-aware derive**

Replace the entire badge config and render logic with:

```typescript
import { Loader2, Sparkles, CheckCircle, SkipForward, AlertCircle, Clock } from 'lucide-react';
import { isReady, isApplied } from '@/lib/thumbnail-status';

type Props = { status: string; phase?: string | null };

export function ThumbnailStatusBadge({ status, phase }: Props) {
  const config = deriveBadgeConfig(status, phase);
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${config.color}`}>
      <Icon size={10} className={status === 'running' ? 'animate-spin' : ''} /> {config.label}
    </span>
  );
}

function deriveBadgeConfig(status: string, phase?: string | null) {
  if (status === 'running') {
    return { label: '생성중', color: 'bg-blue-100 text-blue-700', icon: Loader2 };
  }
  if (status === 'pending') {
    return { label: '대기', color: 'bg-slate-100 text-slate-600', icon: Clock };
  }
  if (isReady({ status, phase })) {
    return { label: '후보 선택', color: 'bg-amber-100 text-amber-700', icon: Sparkles };
  }
  if (isApplied({ status, phase })) {
    return { label: '적용 완료', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle };
  }
  if (status === 'cancelled') {
    return { label: '건너뜀', color: 'bg-slate-100 text-slate-500', icon: SkipForward };
  }
  if (status === 'failed') {
    return { label: '실패', color: 'bg-red-100 text-red-700', icon: AlertCircle };
  }
  return { label: status, color: 'bg-slate-100 text-slate-600', icon: Clock };
}
```

- [ ] **Step 2: Update all `ThumbnailStatusBadge` call sites to pass `phase`**

```bash
grep -rn "<ThumbnailStatusBadge" apps/web/src --include="*.tsx"
```

For each hit, ensure caller passes both `status={...}` and `phase={...}`. If any caller currently passes only status, update to include phase from the same source row.

- [ ] **Step 3: Verify `ProductCard.tsx` overlay vocabulary (no code change)**

```bash
grep -n "overlay" apps/web/src/components/thumbnails/ProductCard.tsx
```

Expected: overlay prop type uses internal labels (`'generating' | 'selected' | 'ready' | 'applied' | 'skipped' | 'needs-fix'`). These are UI overlay states, NOT DB status. No change — callers (Task 16, 17) translate canonical DB status+phase into overlay values.

- [ ] **Step 4: Update `DetailModal.tsx`**

Add import:
```typescript
import { isApplied } from '@/lib/thumbnail-status';
```

Find (L118):
```typescript
            {gen?.status === 'generating' && (
```
Replace with:
```typescript
            {gen?.status === 'running' && (
```

Find (L123):
```typescript
            {gen?.status === 'applied' && (
```
Replace with:
```typescript
            {gen && isApplied(gen) && (
```

Find (L298):
```typescript
                                  pg.status === 'applied' ? 'border-emerald-400' : 'border-slate-200',
```
Replace with:
```typescript
                                  isApplied(pg) ? 'border-emerald-400' : 'border-slate-200',
```

- [ ] **Step 5: Run web tsc**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/thumbnails/
git commit -m "refactor(web/components): badge/card/modal canonical via helpers + ThumbnailStatusBadge phase-aware"
```

---

## Task 16: Frontend migration — `page.tsx` (15+ sites)

**Files:**
- Modify: `apps/web/src/app/thumbnails/page.tsx`

- [ ] **Step 1: Add helper import**

```typescript
import { isReady, isApplied, isActive } from '@/lib/thumbnail-status';
```

- [ ] **Step 2: Keep `editFilter` state type (L106)** — UI tab vocabulary, NOT DB status. No change.

- [ ] **Step 3: Update filter list (L151)**

Find:
```typescript
    () => generations.filter((g) => ['pending', 'generating', 'ready'].includes(g.status)),
```
Replace with:
```typescript
    () => generations.filter((g) => g.status === 'pending' || g.status === 'running' || isReady(g)),
```

- [ ] **Step 4: Update `hasEditStatus` call sites (L213, L215)**

Find (L213):
```typescript
      result = hasEditStatus(base, ['pending', 'generating']);
```
Replace with:
```typescript
      result = hasEditStatus(base, ['pending', 'running']);
```

Find (L215):
```typescript
      result = hasEditStatus(base, ['ready']);
```
Replace with:
```typescript
      result = base.filter((item) => item.gen && isReady(item.gen));
```

- [ ] **Step 5: Update optimistic setter (L268)**

Find:
```typescript
        setSelectedGen({ ...currentGen, selectedUrl: selectedUrl || null, status: 'ready' });
```
Replace with:
```typescript
        setSelectedGen({ ...currentGen, selectedUrl: selectedUrl || null, status: 'succeeded', phase: 'ready' });
```

- [ ] **Step 6: Update filter arrays (L479, L502)**

Find (L479):
```typescript
          ['generating', 'ready'].includes(g.status),
```
Replace with:
```typescript
          g.status === 'running' || isReady(g),
```

Find (L502):
```typescript
      .filter((g) => ['generating', 'pending', 'ready'].includes(g.status))
```
Replace with:
```typescript
      .filter((g) => g.status === 'running' || g.status === 'pending' || isReady(g))
```

- [ ] **Step 7: Update applied count (L506, L1035, L1140)**

Replace all three occurrences of `g.status === 'applied'` with `isApplied(g)`.

- [ ] **Step 8: Update conditional render (L1201–1203)**

Find:
```typescript
                    g.status === 'generating'
                      ? '...'
                      : g.status === 'ready'
```
Replace with:
```typescript
                    g.status === 'running'
                      ? '...'
                      : isReady(g)
```

- [ ] **Step 9: Keep overlay ternary as-is (L1616)**

`!item.imageUrl ? 'skipped'` — overlay value (UI vocabulary), NOT DB. No change.

- [ ] **Step 10: Update filter groupings (L1639, L1643)**

Find:
```typescript
              return g && ['pending', 'generating'].includes(g.status);
```
Replace with:
```typescript
              return g && (g.status === 'pending' || g.status === 'running');
```

Find:
```typescript
              return g && g.status === 'ready';
```
Replace with:
```typescript
              return g && isReady(g);
```

- [ ] **Step 11: Rename local `isReady` (L1802–1803) — AVOID shadowing**

Find:
```typescript
                const isEditing = itemGen && ['generating', 'pending'].includes(itemGen.status);
                const isReady = itemGen && itemGen.status === 'ready';
```
Replace with:
```typescript
                const isEditing = itemGen && (itemGen.status === 'running' || itemGen.status === 'pending');
                const itemReady = itemGen && isReady(itemGen);
```

- [ ] **Step 12: Update `isReady` → `itemReady` at L1814 AND L1825 (critic M4 fix)**

Find (L1814):
```typescript
                      overlay={isEditing ? 'generating' : isReady ? 'selected' : undefined}
```
Replace with:
```typescript
                      overlay={isEditing ? 'generating' : itemReady ? 'selected' : undefined}
```

Find (L1825 — critic M4: also rename this site):
```typescript
                      : isReady ? (
```
(Context: same block as L1803, JSX conditional render branch.)
Replace with:
```typescript
                      : itemReady ? (
```

Grep `isReady` within the L1795-1830 block and confirm all local usages are renamed:
```bash
sed -n '1795,1830p' apps/web/src/app/thumbnails/page.tsx | grep -n isReady
```
Expected after fix: only the imported `isReady` from `@/lib/thumbnail-status` appears, never as a local variable.

- [ ] **Step 13: Update count computations (L1878–1880)**

Find:
```typescript
        const generatingGens = generations.filter((g) => g.status === 'generating' || g.status === 'pending').sort(byNewest);
        const readyGens = generations.filter((g) => g.status === 'ready').sort(byNewest);
        const appliedGens = generations.filter((g) => g.status === 'applied').sort(byNewest);
```
Replace with:
```typescript
        const generatingGens = generations.filter((g) => g.status === 'running' || g.status === 'pending').sort(byNewest);
        const readyGens = generations.filter((g) => isReady(g)).sort(byNewest);
        const appliedGens = generations.filter((g) => isApplied(g)).sort(byNewest);
```

- [ ] **Step 14: Keep tab key config AS-IS (L1885–1887)** — UI vocab, not DB.

- [ ] **Step 15: Keep tab visibility conditionals AS-IS (L1966, L1992, L2129)** — UI vocab match.

- [ ] **Step 16: Update overlay ternary (L2220–2226)**

Find:
```typescript
                          gen.status === 'generating' || gen.status === 'pending'
                            ? 'generating'
                            : gen.status === 'applied'
                            ? 'applied'
                            : gen.status === 'skipped'
                            ? 'skipped'
                            : gen.status === 'ready'
```
Replace with:
```typescript
                          gen.status === 'running' || gen.status === 'pending'
                            ? 'generating'
                            : isApplied(gen)
                            ? 'applied'
                            : gen.status === 'cancelled'
                            ? 'skipped'
                            : isReady(gen)
```

- [ ] **Step 17: Run web tsc**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 18: Commit**

```bash
git add apps/web/src/app/thumbnails/page.tsx
git commit -m "refactor(web/thumbnails): canonical status + phase in page.tsx (16 sites + L1825 rename fix)"
```

---

## Task 17: Frontend migration — remaining components (GenerationQueue/History/Pipeline + EditorHistoryTab)

**Files:**
- Modify: `apps/web/src/app/thumbnails/components/GenerationQueue.tsx`
- Modify: `apps/web/src/app/thumbnails/components/GenerationHistory.tsx`
- Modify: `apps/web/src/app/thumbnails/components/RegenerationPipeline.tsx`
- Modify: `apps/web/src/app/thumbnail-editor/components/EditorHistoryTab.tsx`

**Critic fix (M1)**: `GenerationQueue.tsx` and `GenerationHistory.tsx` each have their OWN inline `StatusBadge` function with legacy 6-key map. v1 was vague ("copy from Task 11 or use shared"). v2 forces replacement with shared badge.

- [ ] **Step 1: `GenerationQueue.tsx` — replace inline `StatusBadge` with shared component**

Current structure (L8–22):
```typescript
function StatusBadge({ status }: { status: string }) {
  const config = {
    pending: { label: '대기', ... },
    generating: { label: '생성중', ... },
    ready: { label: '후보 선택', ... },
    applied: { label: '적용 완료', ... },
    skipped: { label: '건너뜀', ... },
  }[status] ?? { label: status, ... };
  const Icon = config.icon;
  return (
    <span ...>
      <Icon size={10} className={status === 'generating' ? 'animate-spin' : ''} /> {config.label}
    </span>
  );
}
```

Replace the entire local `StatusBadge` function (and its usages) with an import of the shared one:

Add import at top:
```typescript
import { ThumbnailStatusBadge } from '@/components/thumbnails/ThumbnailStatusBadge';
```

Delete the local `StatusBadge` function (L8–22).

Replace all JSX usages of `<StatusBadge status={gen.status} />` with `<ThumbnailStatusBadge status={gen.status} phase={gen.phase ?? null} />`.

- [ ] **Step 2: `GenerationQueue.tsx` — update overlay ternary (L149)**

Find:
```typescript
                overlay={item.gen.status === 'generating' ? 'generating' : item.gen.selectedUrl ? 'selected' : 'ready'}
```
Replace with:
```typescript
                overlay={item.gen.status === 'running' ? 'generating' : item.gen.selectedUrl ? 'selected' : 'ready'}
```

- [ ] **Step 3: `GenerationHistory.tsx` — same treatment as Queue**

Delete local `StatusBadge` function (L8–24). Add import of shared `ThumbnailStatusBadge`. Replace usages with `<ThumbnailStatusBadge status={gen.status} phase={gen.phase ?? null} />`.

Find (L69):
```typescript
            overlay={gen.status === 'applied' ? 'applied' : 'skipped'}
```

Replace with (add import `import { isApplied } from '@/lib/thumbnail-status';`):
```typescript
            overlay={isApplied(gen) ? 'applied' : 'skipped'}
```

- [ ] **Step 4: `RegenerationPipeline.tsx` (L33, L84)**

Add import:
```typescript
import { isApplied } from '@/lib/thumbnail-status';
```

Replace `g.status === 'applied'` with `isApplied(g)` at both occurrences.

- [ ] **Step 5: `EditorHistoryTab.tsx` (L44, L92–98)**

Add imports:
```typescript
import { isReady, isApplied } from '@/lib/thumbnail-status';
```

Find (L44):
```typescript
    setSelectedGen((prev) => (prev ? { ...prev, selectedUrl, status: 'ready' } : prev));
```
Replace with:
```typescript
    setSelectedGen((prev) => (prev ? { ...prev, selectedUrl, status: 'succeeded', phase: 'ready' } : prev));
```

Find (L92–98):
```typescript
              gen.status === 'generating' || gen.status === 'pending'
                ? 'generating'
                : gen.status === 'applied'
                ? 'applied'
                : gen.status === 'skipped'
                ? 'skipped'
                : gen.status === 'ready'
```
Replace with:
```typescript
              gen.status === 'running' || gen.status === 'pending'
                ? 'generating'
                : isApplied(gen)
                ? 'applied'
                : gen.status === 'cancelled'
                ? 'skipped'
                : isReady(gen)
```

- [ ] **Step 6: Run web tsc + build**

```bash
cd apps/web && npx tsc --noEmit && npm run build
```
Expected: tsc passes, build completes.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/thumbnails/components/ apps/web/src/app/thumbnail-editor/components/EditorHistoryTab.tsx
git commit -m "refactor(web): replace inline StatusBadge with shared + canonical predicates (Queue/History/Pipeline/EditorHistoryTab)"
```

---

## Task 18: Regenerate `init.sql.gz`

**Files:**
- Modify: `prisma/init.sql.gz`

- [ ] **Step 1: Regenerate dump**

```bash
docker exec kiditem-postgres pg_dump -U kiditem --data-only --column-inserts --no-owner --no-privileges kiditem | gzip > prisma/init.sql.gz
```

- [ ] **Step 2: Verify no legacy literals in thumbnail_generations**

```bash
gunzip -c prisma/init.sql.gz | grep "thumbnail_generations" | grep -Ec "'generating'|'ready'|'applied'|'skipped'"
```
Expected: `0`.

Also verify `phase` column in schema section:
```bash
gunzip -c prisma/init.sql.gz | grep "CREATE TABLE.*thumbnail_generations" -A 20 | grep phase
```
Expected: `phase text,` line present.

- [ ] **Step 3: Commit**

```bash
git add prisma/init.sql.gz
git commit -m "chore(db): regenerate init.sql.gz after Phase 3 thumbnail canonical"
```

---

## Task 19: Docs update — `products/CLAUDE.md`

**Files:**
- Modify: `apps/server/src/products/CLAUDE.md`

- [ ] **Step 1: Update Status flow line**

```bash
grep -n "Status flow" apps/server/src/products/CLAUDE.md
```

Find:
```markdown
**Status flow**: `pending → generating → ready → applied`
```

Replace with:
```markdown
**Status flow (canonical, ADR-0011 Phase 3)**: `pending → running → succeeded({phase: 'ready' → 'applied'})`. `skipped` maps to `cancelled`. Writer helpers in `services/thumbnail-status.helpers.ts` enforce the status+phase invariant (status='succeeded' ⇔ phase∈{'ready','applied'}).
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/products/CLAUDE.md
git commit -m "docs(products): update thumbnail status flow to canonical (ADR-0011 Phase 3)"
```

---

## Task 20: Full verification (with grep sweep)

- [ ] **Step 1: grep verification — legacy literals in DB-writer sites**

```bash
grep -rn "'generating'\|'ready'\|'applied'\|'skipped'" apps/server/src/products apps/web/src \
  --include="*.ts" --include="*.tsx"
```

Expected hits (only):
- `apps/web/src/components/thumbnails/ProductCard.tsx` overlay prop type (L14)
- `apps/web/src/app/thumbnails/page.tsx` overlay ternaries (L1616, L2220–2226) — internal UI overlay vocabulary
- `apps/web/src/app/thumbnails/components/GenerationQueue.tsx` (L149) overlay value
- `apps/web/src/app/thumbnails/components/GenerationHistory.tsx` (L69) overlay value
- `apps/web/src/app/thumbnail-editor/components/EditorHistoryTab.tsx` (L92–98) overlay value
- `apps/web/src/app/thumbnails/page.tsx` editFilter state type + tab config (L106, 1885–1887, 1966, 1992, 2129) — UI tab vocab

Any hit OUTSIDE these UI-vocabulary call sites → STOP and investigate. The plan missed a site.

- [ ] **Step 2: TypeScript full check**

```bash
cd apps/server && npx tsc --noEmit
cd ../../apps/web && npx tsc --noEmit
cd ../../packages/shared && npx tsc --noEmit || npm run build -w packages/shared
```

- [ ] **Step 3: Test full run**

```bash
npx vitest run
```
Expected: all tests pass (baseline + new from Tasks 9, 10, 11, 13).

- [ ] **Step 4: Build server + web**

```bash
npm run build -w apps/server
npm run build -w apps/web
```

- [ ] **Step 5: NestJS DI boot**

```bash
cd apps/server && timeout 30 npm run start:dev 2>&1 | head -80
```
Expected: "Nest application successfully started" with no DI errors.

- [ ] **Step 6: DB sanity**

```bash
docker exec kiditem-postgres psql -U kiditem -c \
  "SELECT status, phase, COUNT(*) FROM thumbnail_generations GROUP BY status, phase ORDER BY status, phase;" kiditem

docker exec kiditem-postgres psql -U kiditem -c \
  "SELECT COUNT(*) FROM thumbnail_generations WHERE status IN ('generating','ready','applied','skipped');" kiditem
```
Expected: canonical distribution; second query = 0.

- [ ] **Step 7: Optional frontend smoke-test (delegate to user)**

Start dev environment and navigate to `/thumbnails`. Verify badges, filters, and overlays render correctly. Document result in PR body.

- [ ] **Step 8: No commit** — verification only.

---

## Task 21: PR creation

- [ ] **Step 1: Rename branch (if needed)**

```bash
git checkout -b refactor/status-canonical-thumbnail
git push -u origin refactor/status-canonical-thumbnail
```

- [ ] **Step 2: Create PR**

```bash
gh pr create --title "refactor(products): canonicalize ThumbnailGeneration status + phase (ADR-0011 Phase 3)" --body "$(cat <<'EOF'
## 변경 요약

ADR-0011 Phase 3. ThumbnailGeneration의 status 어휘를 canonical enum으로 정렬하고, 새 `phase` sibling 컬럼으로 post-succeeded disposition (`ready|applied`) 분리.

매핑:
- `pending` → `pending` (unchanged)
- `generating` → `running`
- `ready` → `succeeded` + `phase='ready'`
- `applied` → `succeeded` + `phase='applied'`
- `skipped` → `cancelled`
- `failed` → `failed` (unchanged)

## DB 변경

- [x] `prisma/schema.prisma` 변경 — `phase String?` 컬럼 추가
- [x] backfill SQL → `prisma/backfill-status-canonical-thumbnail.sql`
- [x] rollback SQL → `prisma/rollback-status-canonical-thumbnail.sql`
- [x] `prisma/init.sql.gz` 갱신함

## 테스트

- [x] `npx vitest run` 통과 (신규 테스트 포함: helper unit, cold-start, frontend helpers, reEditJob phase reset)
- [x] `npm run build -w apps/server` + `apps/web` 빌드 성공
- [x] `npm run start:dev` NestJS DI 부트 확인
- [x] grep sweep: DB 문자열 literal 중 UI 오버레이 vocabulary 외 canonical 만 남음

## 아키텍처 결정 (ADR-0011 Rule 1~5 준수)

- [x] Rule 1 (canonical status): 모든 6 legacy 값 canonical 에 매핑
- [x] Rule 2 (sibling column): `phase` nullable 컬럼 — disposition sub-state 분리
- [x] Rule 3 (typed union shared): `THUMBNAIL_PHASES = ['ready','applied'] as const` export
- [x] Rule 4 (no mapping at consumer): frontend 가 helper 경유 canonical 직접 사용
- [x] Rule 5 (phased rollout 완결): Phase 1 → 2 → 3 canonical lifecycle 3 도메인 정렬

## Non-goals (follow-up)

- `applyGeneration` 2-table atomicity — 별도 PR + $transaction 예외 ADR 필요
- `processEditJob` double-fire race — 별도 PR
- `useThumbnailGenerations.ts` 중복 파일 — 1-line re-export 로 확인됨, 실제 중복 아님 (정리 불필요)

## Post-pull instructions (팀원용)

```bash
git pull
npm run build -w packages/shared
npx prisma generate
docker exec -i kiditem-postgres psql -U kiditem kiditem < prisma/backfill-status-canonical-thumbnail.sql
```

Skipping backfill → legacy 값이 DB 에 남아 post-Zod-tighten 에서 enum validation error.

## 구조

- Writer helpers (`thumbnail-status.helpers.ts`) — status+phase co-write invariant + `options.include` 로 single-roundtrip
- Frontend helpers (`apps/web/src/lib/thumbnail-status.ts`) — 2-컬럼 predicate 중복 제거
- Test invariant helper (`__tests__/helpers.ts`) — `expectValidInvariant(row)`
- 신규 테스트: helper unit, cold-start, reEditJob phase reset, frontend helper unit

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Capture PR URL**

Return PR URL to conversation for user to review.

---

## Self-Review (v2)

### Spec coverage (re-validated)

- Decision 1 (mapping) → Tasks 2 (backfill), 6, 7 (writers)
- Decision 2 (phase enum) → Task 4 (shared Zod)
- Decision 3 (skipped → cancelled) → Task 6 Step 5 + Task 7 Step 4
- Decision 4 (no failureType) → N/A — nothing to build
- Decision 5 (schema shape) → Task 1
- Decision 6 (writer helpers) → Task 5
- Decision 7 (Zod shape) → Task 4
- Decision 8 (frontend helpers) → Task 12
- State machine → diagram in plan top + inline comments in Tasks 5, 7
- Tests: helper unit (T9), cold-start (T10 Step 5), reEditJob (T11 Step 6), frontend (T13)
- Migration SQL + rollback → T2 + T3 + T18
- Docs update → T19

### Placeholder scan

- No "TBD"/"TODO".
- Task 2 "re-read if structure differs" and Task 14 "verify re-export" are concrete verification steps (run grep, compare).

### Type consistency

- Helper names `markReady/markApplied/resetToPending` consistent across Tasks 5, 6, 7, 9, 10.
- Frontend helper names `isReady/isApplied/isActive/isCompleted` consistent in Tasks 12, 13, 14, 15, 16, 17.
- Status literals `pending|running|succeeded|failed|cancelled` and phase literals `ready|applied` consistent.

### Key v2 changes vs v1

- Task 2 added (local backfill before Zod tighten) — critic M2 fix
- Task 14 (hook migration) now single file, notes re-export — critic CRITICAL 1 fix  
- Task 17 explicit steps for GQ/GH inline badges + animate-spin → running — critic M1 fix
- Task 11 test mocks include `phase` field — critic M3 fix
- Task 16 Step 12 adds L1825 rename — critic M4 fix
- Task 15 Step 4 null handling typed — critic Minor 2 fix
- Task 21 PR body ADR-0011 checklist — critic Minor 3 fix
- Task 20 Step 1 grep sweep added — critic "What's Missing"
- Task 9 helper unit tests added — eng-review Section 3 decision
- Task 13 frontend helper unit tests added — eng-review Section 3 decision
- State machine ASCII diagram at plan top + inline at helper + processEditJob — eng-review Section 1 decision
- Helper signatures with `options?.include` — eng-review Section 1 decision

### Task count: 21 (v1 had 19)

---

## Execution Handoff

Plan v2 complete and saved to `docs/superpowers/plans/2026-04-15-status-canonical-phase3.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
**2. Inline Execution** — via executing-plans, batch with checkpoints.

Which approach?

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | **CLEAR (PLAN)** | 4 issues resolved, 0 critical gaps (v1→v2 rewrite) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

Adversarial (Claude subagent): 1 CRITICAL + 4 MAJOR + 5 MINOR — all integrated into v2.

**VERDICT:** ENG CLEARED (PLAN) after v2 rewrite — ready to implement.
