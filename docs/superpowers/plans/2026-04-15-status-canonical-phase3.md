# Status Canonical Phase 3 (ThumbnailGeneration) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate ThumbnailGeneration status vocabulary to ADR-0011 canonical enum (`pending|running|succeeded|failed|cancelled`) with a new `phase` sibling column for post-succeeded disposition (`ready|applied`).

**Architecture:** Single atomic PR. Order: schema → shared Zod → backend helpers → backend writer migration → backend tests → frontend helper → frontend consumers → backfill SQL → init.sql.gz → docs → verification → PR. Writer helpers centralize status+phase co-write invariant. Frontend helpers centralize 2-column status+phase predicates.

**Tech Stack:** Prisma (schema), Zod + TypeScript (shared types), NestJS (backend), Next.js + React Query (frontend), Vitest (tests), Postgres (DB), raw SQL backfill.

**Spec:** [docs/superpowers/specs/2026-04-15-status-canonical-phase3-design.md](../specs/2026-04-15-status-canonical-phase3-design.md)  
**ADR:** [.claude/docs/decisions/0011-status-canonical-lifecycle.md](../../../.claude/docs/decisions/0011-status-canonical-lifecycle.md)  
**Branch:** `refactor/status-canonical-thumbnail` (current worktree: `claude/focused-euler` — rename before PR)  
**Precedent:** Phase 1 PR #9, Phase 2 PR #11 (`5ed570d`)

---

## Non-goals

- `applyGeneration` 2-table atomicity — deferred follow-up PR (would need `$transaction` exception ADR)
- `processEditJob` double-fire race — deferred follow-up PR
- `THUMBNAIL_FAILURE_TYPES` sibling column — YAGNI
- `useThumbnailGenerations.ts` duplicate-file consolidation — Phase 3 canonicalizes both, merger in follow-up
- Phase 4 `AgentTask.status` canonicalization — separate ADR decision

## Pre-flight (line numbers verified on `claude/focused-euler`)

Backend writer sites (13 total):
- `apps/server/src/products/services/thumbnail-generation.service.ts`: L40, 42 (raw SQL), 91, 112, 139, 175
- `apps/server/src/products/services/thumbnail-edit.service.ts`: L25, 56, 61, 125, 153, 165, 196, 204
- Note: L31, 86 use `'pending'` — already canonical, unchanged.

Frontend sites (11 files):
- `apps/web/src/hooks/useThumbnailGenerations.ts`: L17, 33, 90
- `apps/web/src/app/thumbnails/hooks/useThumbnailGenerations.ts`: L17, 33, 90 (duplicate — both migrated)
- `apps/web/src/components/thumbnails/ThumbnailStatusBadge.tsx`: L12–15, 22
- `apps/web/src/components/thumbnails/ProductCard.tsx`: L14, 104, 131, 138
- `apps/web/src/components/thumbnails/DetailModal.tsx`: L118, 123, 298
- `apps/web/src/app/thumbnails/page.tsx`: L106, 151, 213, 215, 268, 479, 502, 506, 1035, 1140, 1201, 1203, 1616, 1639, 1643, 1802, 1803, 1814, 1878–1880, 1885–1887, 1966, 1992, 2129, 2220–2226
- `apps/web/src/app/thumbnails/components/GenerationQueue.tsx`: L11–14, 21, 149
- `apps/web/src/app/thumbnails/components/GenerationHistory.tsx`: L11–14, 21, 69
- `apps/web/src/app/thumbnails/components/RegenerationPipeline.tsx`: L33, 84
- `apps/web/src/app/thumbnail-editor/components/EditorHistoryTab.tsx`: L44, 92–98

Tests (2 files):
- `apps/server/src/products/services/__tests__/thumbnail-flow.spec.ts`: L515, 525, 540, 555, 565, 578, 580, 592, 602, 615, 617
- `apps/server/src/products/services/__tests__/thumbnail-edit.spec.ts`: L49, 64, 67, 84, 119, 124, 138, 150

`ThumbnailEditorView.tsx` verified — no legacy literals, not in scope.

---

## Task 1: Prisma schema — add `phase` column

**Files:**
- Modify: `prisma/schema.prisma` (model `ThumbnailGeneration`, around L658–685)

- [ ] **Step 1: Read current schema section**

Run: `grep -n "model ThumbnailGeneration" prisma/schema.prisma`
Expected: Line ~658.

- [ ] **Step 2: Add `phase` field**

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

Do NOT add `@@index([phase])` — cardinality 2-value + null has poor B-tree effectiveness (see spec Decision 5).

- [ ] **Step 3: Apply schema to DB + regenerate Prisma client**

Run from repo root:
```bash
npm run db:push
npx prisma generate
```
Expected output:
- `db:push` reports "Your database is now in sync with your Prisma schema."
- `prisma generate` reports "Generated Prisma Client (...) to ./node_modules/@prisma/client".

- [ ] **Step 4: Verify column exists**

Run:
```bash
docker exec kiditem-postgres psql -U kiditem -c "\d thumbnail_generations" kiditem | grep phase
```
Expected: `phase | text |  |` (nullable, no default).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(prisma): add ThumbnailGeneration.phase sibling column (ADR-0011 Phase 3)"
```

---

## Task 2: Shared Zod — status enum + `phase` nullable + `THUMBNAIL_PHASES` export

**Files:**
- Modify: `packages/shared/src/schemas/thumbnails.ts`

- [ ] **Step 1: Read current schema file**

Run: `grep -n "status\|ThumbnailGenerationItem" packages/shared/src/schemas/thumbnails.ts`
Expected: line 40 (`status: z.string()`), line 139 (`status: z.string()` inside `ThumbnailGenerationItemSchema`).

- [ ] **Step 2: Add `THUMBNAIL_PHASES` constant + type**

Open `packages/shared/src/schemas/thumbnails.ts`. Insert at the end of the file (after existing exports):

```typescript
// ─── ADR-0011 Phase 3: Canonical status + phase ─────────────────────────
export const THUMBNAIL_PHASES = ['ready', 'applied'] as const;
export type ThumbnailPhase = typeof THUMBNAIL_PHASES[number];
```

- [ ] **Step 3: Tighten `status` in `ThumbnailListItemSchema` (line ~40)**

Find:
```typescript
status: z.string(),
```

Replace with:
```typescript
status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled']),
```

- [ ] **Step 4: Tighten `status` + add `phase` in `ThumbnailGenerationItemSchema` (line ~139)**

Find (in the `ThumbnailGenerationItemSchema` definition):
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

- [ ] **Step 5: Build shared package**

Run:
```bash
npm run build -w packages/shared
```
Expected: `tsup` completes successfully, `packages/shared/dist/` updated.

- [ ] **Step 6: Run shared tests to verify no regression**

Run:
```bash
npx vitest run packages/shared
```
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/schemas/thumbnails.ts
git commit -m "refactor(shared): ThumbnailGeneration status z.enum + THUMBNAIL_PHASES typed union (ADR-0011 Phase 3)"
```

---

## Task 3: Backend writer helpers — new file

**Files:**
- Create: `apps/server/src/products/services/thumbnail-status.helpers.ts`

- [ ] **Step 1: Create helper file**

Create `apps/server/src/products/services/thumbnail-status.helpers.ts` with:

```typescript
import type { Prisma, PrismaClient, ThumbnailGeneration } from '@prisma/client';

type Client = PrismaClient | Prisma.TransactionClient;

/**
 * ADR-0011 Phase 3 writer helpers. Every helper enforces the invariant:
 *   status = 'succeeded' ⇔ phase ∈ {'ready', 'applied'}
 *   otherwise phase = null
 *
 * Used for transitions where phase semantics matter.
 * Simple terminals (failed/cancelled/running) are written inline with `phase: null`.
 */

export type ReadyExtras = Partial<Pick<Prisma.ThumbnailGenerationUpdateInput,
  'selectedUrl' | 'candidates' | 'editAnalysis'>>;

export type ResetExtras = Partial<Pick<Prisma.ThumbnailGenerationUpdateInput,
  'candidates' | 'selectedUrl'>>;

export async function markReady(
  prisma: Client,
  id: string,
  extras: ReadyExtras = {},
): Promise<ThumbnailGeneration> {
  return prisma.thumbnailGeneration.update({
    where: { id },
    data: { status: 'succeeded', phase: 'ready', ...extras },
  });
}

export async function markApplied(
  prisma: Client,
  id: string,
): Promise<ThumbnailGeneration> {
  return prisma.thumbnailGeneration.update({
    where: { id },
    data: { status: 'succeeded', phase: 'applied' },
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

Run:
```bash
cd apps/server && npx tsc --noEmit
```
Expected: no errors (helper imports resolve, Prisma types match).

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/products/services/thumbnail-status.helpers.ts
git commit -m "feat(products): thumbnail status writer helpers (markReady/markApplied/resetToPending)"
```

---

## Task 4: Backend writer migration — `thumbnail-generation.service.ts`

**Files:**
- Modify: `apps/server/src/products/services/thumbnail-generation.service.ts`

- [ ] **Step 1: Add helper imports**

At the top of the file, after existing imports:

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

- [ ] **Step 3: Update `selectCandidate` (L85–96)**

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
    await markReady(this.prisma, id, { selectedUrl: selectedUrl || null });
    const updated = await this.prisma.thumbnailGeneration.findUniqueOrThrow({
      where: { id },
      include: { product: { select: { id: true, name: true, imageUrl: true, coupangProductId: true, category: true } } },
    });
```

- [ ] **Step 4: Update `applyGeneration` (L110–114)**

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
    await markApplied(this.prisma, id);
    const updated = await this.prisma.thumbnailGeneration.findUniqueOrThrow({
      where: { id },
      include: { product: { select: { id: true, name: true, imageUrl: true, coupangProductId: true, category: true } } },
    });
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

- [ ] **Step 6: Update `saveEditorResult` (L169–180)**

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

Rationale: `saveEditorResult` is a cold-start path — creates a row that's already "post-succeeded with candidates". Uses `create` directly (not `markReady`) because there's no existing row.

- [ ] **Step 7: Run tsc**

Run:
```bash
cd apps/server && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/products/services/thumbnail-generation.service.ts
git commit -m "refactor(products): canonical status + phase in thumbnail-generation.service (5 sites)"
```

---

## Task 5: Backend writer migration — `thumbnail-edit.service.ts`

**Files:**
- Modify: `apps/server/src/products/services/thumbnail-edit.service.ts`

- [ ] **Step 1: Add helper imports**

After existing imports:
```typescript
import { markReady, resetToPending } from './thumbnail-status.helpers';
```

- [ ] **Step 2: Update `createEditJobs` findFirst generating (L24–26)**

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

- [ ] **Step 3: Update deleteMany terminal (L52–58)**

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

- [ ] **Step 4: Update findMany completed (L60–64)**

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

- [ ] **Step 5: Update `reEditJob` reset (L123–126)**

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

Rationale: prior to this change, the row is `status='succeeded', phase='ready'|'applied'`. Without `phase: null`, the reset leaves stale phase data (critic M1 finding).

- [ ] **Step 6: Update `processEditJob` start (L151–154)**

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

- [ ] **Step 7: Update `processEditJob` failed (no candidates, L162–167)**

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

- [ ] **Step 8: Update `processEditJob` ready (L191–199)**

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

- [ ] **Step 9: Update `processEditJob` failed (catch, L200–206)**

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

- [ ] **Step 10: Run tsc**

Run:
```bash
cd apps/server && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add apps/server/src/products/services/thumbnail-edit.service.ts
git commit -m "refactor(products): canonical status + phase in thumbnail-edit.service (8 sites)"
```

---

## Task 6: Test invariant helper — new file

**Files:**
- Create: `apps/server/src/products/services/__tests__/helpers.ts`

- [ ] **Step 1: Create invariant helper**

Create `apps/server/src/products/services/__tests__/helpers.ts`:

```typescript
import { expect } from 'vitest';

/**
 * ADR-0011 Phase 3 invariant: status='succeeded' ⇔ phase ∈ {'ready','applied'}.
 * Otherwise phase must be null.
 * Call this after any writer assertion to catch drift.
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

- [ ] **Step 2: Run tsc**

Run:
```bash
cd apps/server && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/products/services/__tests__/helpers.ts
git commit -m "test(products): expectValidInvariant helper for thumbnail status+phase"
```

---

## Task 7: Test updates — `thumbnail-flow.spec.ts`

**Files:**
- Modify: `apps/server/src/products/services/__tests__/thumbnail-flow.spec.ts`

- [ ] **Step 1: Read full file**

Run: `cat apps/server/src/products/services/__tests__/thumbnail-flow.spec.ts | head -80` then continue reading as needed.

- [ ] **Step 2: Update assertions — line 515–540 (selectCandidate test)**

Find:
```typescript
      const existingRecord = { id: 'gen-1', status: 'ready' };
```

Replace with:
```typescript
      const existingRecord = { id: 'gen-1', status: 'succeeded', phase: 'ready' };
```

Find:
```typescript
        status: 'ready',
```
(in the mocked update response, around L525)

Replace with:
```typescript
        status: 'succeeded',
        phase: 'ready',
```

Find (around L540):
```typescript
          data: { selectedUrl: '/generated-thumbnails/chosen.png', status: 'ready' },
```

Replace with:
```typescript
          data: { status: 'succeeded', phase: 'ready', selectedUrl: '/generated-thumbnails/chosen.png' },
```

- [ ] **Step 3: Update assertions — line 555–580 (applyGeneration test)**

Find:
```typescript
      const existingRecord = { id: 'gen-1', status: 'ready' };
```

Replace with:
```typescript
      const existingRecord = { id: 'gen-1', status: 'succeeded', phase: 'ready' };
```

Find:
```typescript
        status: 'applied',
```

Replace with:
```typescript
        status: 'succeeded',
        phase: 'applied',
```

Find:
```typescript
        expect.objectContaining({ data: { status: 'applied' } }),
```

Replace with:
```typescript
        expect.objectContaining({ data: { status: 'succeeded', phase: 'applied' } }),
```

Find:
```typescript
      expect(result.status).toBe('applied');
```

Replace with:
```typescript
      expect(result.status).toBe('succeeded');
      expect(result.phase).toBe('applied');
```

- [ ] **Step 4: Update assertions — line 592–617 (skipGeneration test)**

Find:
```typescript
      const existingRecord = { id: 'gen-1', status: 'ready' };
```

Replace with:
```typescript
      const existingRecord = { id: 'gen-1', status: 'succeeded', phase: 'ready' };
```

Find:
```typescript
        status: 'skipped',
```

Replace with:
```typescript
        status: 'cancelled',
        phase: null,
```

Find:
```typescript
        expect.objectContaining({ data: { status: 'skipped' } }),
```

Replace with:
```typescript
        expect.objectContaining({ data: { status: 'cancelled', phase: null } }),
```

Find:
```typescript
      expect(result.status).toBe('skipped');
```

Replace with:
```typescript
      expect(result.status).toBe('cancelled');
      expect(result.phase).toBeNull();
```

- [ ] **Step 5: Add `expectValidInvariant` calls**

Inside the same three tests (selectCandidate, applyGeneration, skipGeneration), after the final `expect(result.status)...` assertion, add:

```typescript
      expectValidInvariant(result);
```

At the top of the file, add the import:
```typescript
import { expectValidInvariant } from './helpers';
```

- [ ] **Step 6: Run tests**

Run:
```bash
cd apps/server && npx vitest run src/products/services/__tests__/thumbnail-flow.spec.ts
```
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/products/services/__tests__/thumbnail-flow.spec.ts
git commit -m "test(products): update thumbnail-flow assertions for canonical status + phase"
```

---

## Task 8: Test updates — `thumbnail-edit.spec.ts`

**Files:**
- Modify: `apps/server/src/products/services/__tests__/thumbnail-edit.spec.ts`

- [ ] **Step 1: Update line 49 (createEditJobs pending mock)**

Find:
```typescript
        status: 'pending',
```
(around L49 — `pending` is already canonical, unchanged).

No change. Verify line content still reads `status: 'pending'` — skip.

- [ ] **Step 2: Update line 64 (assertion `results[0].status`)**

Find:
```typescript
      expect(results[0].status).toBe('pending');
```

No change — `pending` stays canonical. Skip.

- [ ] **Step 3: Update line 67 (create call objectContaining)**

Find:
```typescript
          data: expect.objectContaining({ method: 'edit', status: 'pending' }),
```

No change — still valid. Skip.

- [ ] **Step 4: Update line 84 (findFirst generating → running)**

Find:
```typescript
      prisma.thumbnailGeneration.findFirst.mockResolvedValue({ id: 'existing', status: 'generating' });
```

Replace with:
```typescript
      prisma.thumbnailGeneration.findFirst.mockResolvedValue({ id: 'existing', status: 'running', phase: null });
```

- [ ] **Step 5: Update line 119 (processEditJob generating → running)**

Find:
```typescript
        expect.objectContaining({ data: { status: 'generating' } }),
```

Replace with:
```typescript
        expect.objectContaining({ data: { status: 'running', phase: null } }),
```

- [ ] **Step 6: Update line 124 (processEditJob ready)**

Find:
```typescript
            status: 'ready',
```

Replace with:
```typescript
            status: 'succeeded',
            phase: 'ready',
```

- [ ] **Step 7: Update line 138 (processEditJob failed)**

Find:
```typescript
        expect.objectContaining({ where: { id: 'g2' }, data: { status: 'failed' } }),
```

Replace with:
```typescript
        expect.objectContaining({ where: { id: 'g2' }, data: { status: 'failed', phase: null } }),
```

- [ ] **Step 8: Update line 150 (failure filter)**

Find:
```typescript
        (c: any) => c[0]?.data?.status === 'failed',
```

No change needed (still checks for `'failed'`). Skip.

- [ ] **Step 9: Add new test — reEditJob resets phase to null**

At the end of the `describe('ThumbnailEditService')` block, add:

```typescript
  describe('reEditJob (phase reset invariant)', () => {
    it("resets status='pending' AND phase=null when re-editing a ready job", async () => {
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
  });
```

- [ ] **Step 10: Run tests**

Run:
```bash
cd apps/server && npx vitest run src/products/services/__tests__/thumbnail-edit.spec.ts
```
Expected: all pass including the new `reEditJob (phase reset invariant)` test.

- [ ] **Step 11: Commit**

```bash
git add apps/server/src/products/services/__tests__/thumbnail-edit.spec.ts
git commit -m "test(products): thumbnail-edit assertions canonical + reEditJob phase-reset invariant test"
```

---

## Task 9: Frontend helpers — new file

**Files:**
- Create: `apps/web/src/lib/thumbnail-status.ts`

- [ ] **Step 1: Create helper file**

Create `apps/web/src/lib/thumbnail-status.ts`:

```typescript
import type { ThumbnailGenerationItem } from '@kiditem/shared';

/**
 * ADR-0011 Phase 3 frontend helpers. Compose canonical (status, phase) into
 * domain-level predicates that 11 web consumers use.
 */

export const isReady = (g: Pick<ThumbnailGenerationItem, 'status' | 'phase'>) =>
  g.status === 'succeeded' && g.phase === 'ready';

export const isApplied = (g: Pick<ThumbnailGenerationItem, 'status' | 'phase'>) =>
  g.status === 'succeeded' && g.phase === 'applied';

export const isActive = (g: Pick<ThumbnailGenerationItem, 'status' | 'phase'>) =>
  g.status === 'pending' || g.status === 'running';

/** ready or applied — both post-succeeded dispositions. */
export const isCompleted = (g: Pick<ThumbnailGenerationItem, 'status' | 'phase'>) =>
  g.status === 'succeeded';
```

- [ ] **Step 2: Run web tsc**

Run:
```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors (imports resolve from `@kiditem/shared` dist).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/thumbnail-status.ts
git commit -m "feat(web): thumbnail-status helpers (isReady/isApplied/isActive/isCompleted)"
```

---

## Task 10: Frontend migration — `useThumbnailGenerations.ts` (both copies)

**Files:**
- Modify: `apps/web/src/hooks/useThumbnailGenerations.ts`
- Modify: `apps/web/src/app/thumbnails/hooks/useThumbnailGenerations.ts` (duplicate)

Both files have IDENTICAL content. Apply same changes to both.

- [ ] **Step 1: Add helper import (both files)**

Add to both files near the top:
```typescript
import { isActive } from '@/lib/thumbnail-status';
```

- [ ] **Step 2: Update polling guard — line 17**

Find:
```typescript
      const hasActiveJobs = data.some((g) => g.status === 'pending' || g.status === 'generating');
```

Replace with:
```typescript
      const hasActiveJobs = data.some(isActive);
```

- [ ] **Step 3: Update optimistic writer — line 33 (selectCandidate onMutate)**

Find:
```typescript
        old?.map((g) => g.id === id ? { ...g, selectedUrl: selectedUrl || null, status: 'ready' } : g) ?? [],
```

Replace with:
```typescript
        old?.map((g) => g.id === id ? { ...g, selectedUrl: selectedUrl || null, status: 'succeeded' as const, phase: 'ready' as const } : g) ?? [],
```

- [ ] **Step 4: Update optimistic writer — line 90 (reEditJob onMutate)**

Find:
```typescript
        old?.map((g) => g.id === id ? { ...g, status: 'generating', candidates: [] } : g) ?? [],
```

Replace with:
```typescript
        old?.map((g) => g.id === id ? { ...g, status: 'running' as const, phase: null, candidates: [] } : g) ?? [],
```

- [ ] **Step 5: Run web tsc**

Run:
```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks/useThumbnailGenerations.ts apps/web/src/app/thumbnails/hooks/useThumbnailGenerations.ts
git commit -m "refactor(web): canonical status + phase in useThumbnailGenerations (both copies)"
```

---

## Task 11: Frontend migration — badge + card + modal

**Files:**
- Modify: `apps/web/src/components/thumbnails/ThumbnailStatusBadge.tsx`
- Modify: `apps/web/src/components/thumbnails/ProductCard.tsx`
- Modify: `apps/web/src/components/thumbnails/DetailModal.tsx`

- [ ] **Step 1: Update `ThumbnailStatusBadge.tsx`**

Read file. Current shape maps keys `generating/ready/applied/skipped` → label/color/icon. New shape uses a derive function.

Replace the entire badge config object (L12–15 area) + the render logic:

```typescript
import { Loader2, Sparkles, CheckCircle, SkipForward, AlertCircle, Clock } from 'lucide-react';
import { isReady, isApplied, isActive } from '@/lib/thumbnail-status';

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
  if (isActive({ status, phase }) && status === 'running') {
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

Preserve existing exports & `Props` typing; if the existing file has a different props shape (callers pass just `status`), update callers by passing `phase` too — grep for `<ThumbnailStatusBadge` and update props.

- [ ] **Step 2: Verify badge callers receive phase**

Run:
```bash
grep -rn "ThumbnailStatusBadge" apps/web/src --include="*.tsx" --include="*.ts"
```
For each call site, verify the caller passes both `status` and `phase` (from the gen/item). Update any that don't.

- [ ] **Step 3: Update `ProductCard.tsx`**

Open file. The `overlay` prop type is internal UI vocabulary — keep its literal values (`'generating' | 'selected' | 'ready' | 'applied' | 'skipped' | 'needs-fix'`) unchanged. These are NOT the DB status vocabulary; they're UI overlay states set by callers who already translate canonical DB fields → overlay value.

Verify with:
```bash
grep -n "overlay" apps/web/src/components/thumbnails/ProductCard.tsx
```
Expected: lines 14, 104, 131, 138 show overlay type and render branches. No changes needed — the overlay values remain internal labels. Callers (page.tsx) are updated in Task 12 to compute overlay from `status+phase` via helpers.

- [ ] **Step 4: Update `DetailModal.tsx`**

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
            {isApplied(gen ?? { status: '', phase: null }) && (
```

(Add import `import { isApplied } from '@/lib/thumbnail-status';` at top if not present.)

Find (L298):
```typescript
                                  pg.status === 'applied' ? 'border-emerald-400' : 'border-slate-200',
```

Replace with:
```typescript
                                  isApplied(pg) ? 'border-emerald-400' : 'border-slate-200',
```

- [ ] **Step 5: Run web tsc**

Run:
```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/thumbnails/
git commit -m "refactor(web/components): thumbnail badge/card/modal via canonical helpers"
```

---

## Task 12: Frontend migration — `page.tsx` (15+ sites)

**Files:**
- Modify: `apps/web/src/app/thumbnails/page.tsx`

Due to volume, apply changes by semantic cluster rather than line-by-line.

- [ ] **Step 1: Add helper import**

At the top imports:
```typescript
import { isReady, isApplied, isActive } from '@/lib/thumbnail-status';
```

- [ ] **Step 2: Update state type (L106)**

Find:
```typescript
  const [editFilter, setEditFilter] = useState<'pending' | 'generating' | 'ready' | 'applied'>('ready');
```

The `editFilter` is a UI-tab key, not a DB status. Keep legacy literal values for the tab key (UI vocabulary); only the comparisons against `g.status` change.

No change to this line.

- [ ] **Step 3: Update filter list — L151**

Find:
```typescript
    () => generations.filter((g) => ['pending', 'generating', 'ready'].includes(g.status)),
```

Replace with:
```typescript
    () => generations.filter((g) => g.status === 'pending' || g.status === 'running' || isReady(g)),
```

- [ ] **Step 4: Update `hasEditStatus` call sites — L213, L215**

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

Context: `hasEditStatus` takes DB status values. Replace with:
```typescript
      result = base.filter((item) => item.gen && isReady(item.gen));
```

(If `hasEditStatus` is a helper used elsewhere, update it — grep `function hasEditStatus` and confirm its signature first. If it only checks `status ∈ list`, replacing the call with an inline filter is cleaner; if it does more, update the helper to also accept phase predicates.)

- [ ] **Step 5: Update optimistic setter — L268**

Find:
```typescript
        setSelectedGen({ ...currentGen, selectedUrl: selectedUrl || null, status: 'ready' });
```

Replace with:
```typescript
        setSelectedGen({ ...currentGen, selectedUrl: selectedUrl || null, status: 'succeeded', phase: 'ready' });
```

- [ ] **Step 6: Update filter arrays — L479, L502**

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

- [ ] **Step 7: Update applied count — L506, L1035, L1140**

Find each of:
```typescript
  const appliedCount = generations.filter((g) => g.status === 'applied').length;
          const reviewedCount = generations.filter((g) => g.status === 'applied').length;
            .filter((g) => g.status === 'applied')
```

Replace each occurrence of `g.status === 'applied'` with `isApplied(g)`.

- [ ] **Step 8: Update conditional render — L1201–1203**

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

(Preserve the rendered text/expressions; only swap the conditions.)

- [ ] **Step 9: Update overlay ternary — L1616**

Find:
```typescript
                        !item.imageUrl ? 'skipped'
```

Context: `'skipped'` here is overlay value (UI vocabulary, not DB). This line maps absence-of-image to the 'skipped' overlay for display. Overlay vocabulary unchanged. **No change.**

- [ ] **Step 10: Update filter groupings — L1639–1643**

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

- [ ] **Step 11: Update inline checks — L1802–1803**

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

(Rename local `isReady` to `itemReady` to avoid shadowing the imported helper. Update uses of the local variable within this block — grep 10 lines around L1803 to find them and rename accordingly.)

- [ ] **Step 12: Update overlay prop — L1814**

Find:
```typescript
                      overlay={isEditing ? 'generating' : isReady ? 'selected' : undefined}
```

Replace with:
```typescript
                      overlay={isEditing ? 'generating' : itemReady ? 'selected' : undefined}
```

(If you renamed to `itemReady` in Step 11.)

- [ ] **Step 13: Update count computations — L1878–1880**

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

- [ ] **Step 14: Tab key config — L1885–1887**

Find:
```typescript
          { key: 'generating' as const, label: '생성 중',   count: generatingGens.length,  color: '#3182f6', desc: 'AI 처리 중',    icon: Loader2 },
          { key: 'ready' as const,      label: '선택 대기', count: readyGens.length,        color: '#7048e8', desc: '이미지 선택 필요', icon: Wand2 },
          { key: 'applied' as const,    label: '적용 완료', count: appliedGens.length,      color: '#00c471', desc: '쿠팡 반영',     icon: CheckCircle },
```

**No change** — these `key` values are UI tab identifiers that match the `editFilter` state type. Keep legacy vocabulary for the tab state to minimize page.tsx churn. The DB value comparisons (L1878–1880) are already updated.

- [ ] **Step 15: Tab visibility conditionals — L1966, L1992, L2129**

Find:
```typescript
            {editFilter === 'generating' && (
            {editFilter === 'ready' && (() => {
            {editFilter === 'applied' && (
```

**No change** — same reason as Step 14. These conditionals compare the UI tab state (which still uses legacy vocab) not DB values.

- [ ] **Step 16: Update overlay ternary — L2220–2226**

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

Run:
```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors. Any error indicates a missed site — fix inline.

- [ ] **Step 18: Commit**

```bash
git add apps/web/src/app/thumbnails/page.tsx
git commit -m "refactor(web/thumbnails): canonical status + phase predicates in page.tsx (15+ sites)"
```

---

## Task 13: Frontend migration — remaining components

**Files:**
- Modify: `apps/web/src/app/thumbnails/components/GenerationQueue.tsx`
- Modify: `apps/web/src/app/thumbnails/components/GenerationHistory.tsx`
- Modify: `apps/web/src/app/thumbnails/components/RegenerationPipeline.tsx`
- Modify: `apps/web/src/app/thumbnail-editor/components/EditorHistoryTab.tsx`

- [ ] **Step 1: Update `GenerationQueue.tsx` (L11–14, L21, L149)**

Replace the badge config map (L11–14) with the deriveBadgeConfig pattern (copy from Task 11 Step 1) OR use the shared `ThumbnailStatusBadge` component if it's accepting `phase`. If the file already uses `ThumbnailStatusBadge`, just ensure callers pass `phase` prop.

Find (L149):
```typescript
                overlay={item.gen.status === 'generating' ? 'generating' : item.gen.selectedUrl ? 'selected' : 'ready'}
```

Replace with:
```typescript
                overlay={item.gen.status === 'running' ? 'generating' : item.gen.selectedUrl ? 'selected' : 'ready'}
```

- [ ] **Step 2: Update `GenerationHistory.tsx` (L11–14, L21, L69)**

Same pattern as GenerationQueue — badge config map migration.

Find (L69):
```typescript
            overlay={gen.status === 'applied' ? 'applied' : 'skipped'}
```

Replace with:
```typescript
            overlay={isApplied(gen) ? 'applied' : 'skipped'}
```

Add import if needed: `import { isApplied } from '@/lib/thumbnail-status';`

- [ ] **Step 3: Update `RegenerationPipeline.tsx` (L33, L84)**

Find:
```typescript
  const appliedCount = completedGenerations.filter((g) => g.status === 'applied').length;
      items: completedGenerations.filter((g) => g.status === 'applied').slice(0, 5).map((g) => g.product.name),
```

Replace each `g.status === 'applied'` with `isApplied(g)`. Add import.

- [ ] **Step 4: Update `EditorHistoryTab.tsx` (L44, L92–98)**

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

Add imports.

- [ ] **Step 5: Run web tsc + build**

Run:
```bash
cd apps/web && npx tsc --noEmit && npm run build
```
Expected: tsc passes, build completes successfully.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/thumbnails/components/ apps/web/src/app/thumbnail-editor/components/EditorHistoryTab.tsx
git commit -m "refactor(web): remaining thumbnail components via canonical helpers"
```

---

## Task 14: Backfill SQL

**Files:**
- Create: `prisma/backfill-status-canonical-thumbnail.sql`

- [ ] **Step 1: Create backfill SQL**

Create `prisma/backfill-status-canonical-thumbnail.sql`:

```sql
-- ADR-0011 Phase 3: ThumbnailGeneration status canonicalization
-- Pre-condition: Tasks 1-5 (schema + writer) deployed first so new writes are canonical.
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

Run:
```bash
docker exec -i kiditem-postgres psql -U kiditem kiditem < prisma/backfill-status-canonical-thumbnail.sql
```
Expected output: both sanity checks return `n = 0`.

- [ ] **Step 3: Verify DB state**

Run:
```bash
docker exec kiditem-postgres psql -U kiditem -c \
  "SELECT status, phase, COUNT(*) FROM thumbnail_generations GROUP BY status, phase ORDER BY status, phase;" kiditem
```
Expected: all status values are canonical (`pending`, `running`, `succeeded`, `failed`, `cancelled`); succeeded rows have phase set to 'ready' or 'applied'; others have phase null.

- [ ] **Step 4: Commit**

```bash
git add prisma/backfill-status-canonical-thumbnail.sql
git commit -m "chore(db): backfill ThumbnailGeneration status canonical + phase (ADR-0011 Phase 3)"
```

---

## Task 15: Rollback SQL

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

## Task 16: Regenerate `init.sql.gz`

**Files:**
- Modify: `prisma/init.sql.gz`

- [ ] **Step 1: Regenerate dump**

Run from repo root:
```bash
docker exec kiditem-postgres pg_dump -U kiditem --data-only --column-inserts --no-owner --no-privileges kiditem | gzip > prisma/init.sql.gz
```

- [ ] **Step 2: Verify dump has no legacy literals**

Run:
```bash
gunzip -c prisma/init.sql.gz | grep -c "thumbnail_generations" 
gunzip -c prisma/init.sql.gz | grep "thumbnail_generations" | grep -Ec "'generating'|'ready'|'applied'|'skipped'"
```
Expected first: count > 0 (table exists with data). Expected second: `0` (no legacy values remain).

Also verify phase column shows up in the dump schema section:
```bash
gunzip -c prisma/init.sql.gz | grep "CREATE TABLE.*thumbnail_generations" -A 20 | grep phase
```
Expected: `phase text,` line present.

- [ ] **Step 3: Commit**

```bash
git add prisma/init.sql.gz
git commit -m "chore(db): regenerate init.sql.gz after Phase 3 thumbnail canonical + phase column"
```

---

## Task 17: Docs update — `apps/server/src/products/CLAUDE.md`

**Files:**
- Modify: `apps/server/src/products/CLAUDE.md`

- [ ] **Step 1: Locate status flow line**

Run:
```bash
grep -n "Status flow" apps/server/src/products/CLAUDE.md
```
Expected: a single line matching `**Status flow**: \`pending → generating → ready → applied\``.

- [ ] **Step 2: Update to canonical**

Find:
```markdown
**Status flow**: `pending → generating → ready → applied`
```

Replace with:
```markdown
**Status flow (canonical, ADR-0011 Phase 3)**: `pending → running → succeeded({phase: 'ready' → 'applied'})`. `skipped` maps to `cancelled`. Helpers in `services/thumbnail-status.helpers.ts` enforce status+phase invariant.
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/products/CLAUDE.md
git commit -m "docs(products): update thumbnail status flow to canonical (ADR-0011 Phase 3)"
```

---

## Task 18: Full verification

- [ ] **Step 1: TypeScript full check**

Run:
```bash
cd apps/server && npx tsc --noEmit
cd ../../apps/web && npx tsc --noEmit
cd ../../packages/shared && npx tsc --noEmit || npm run build -w packages/shared
```
Expected: all pass with no errors.

- [ ] **Step 2: Test full run**

Run from repo root:
```bash
npx vitest run
```
Expected: all tests pass (baseline count + new tests from Tasks 6–8).

- [ ] **Step 3: Build server + web**

Run:
```bash
npm run build -w apps/server
npm run build -w apps/web
```
Expected: both succeed.

- [ ] **Step 4: NestJS DI boot**

Run:
```bash
cd apps/server && timeout 30 npm run start:dev 2>&1 | head -80
```
Expected: "Nest application successfully started" without DI errors. ProductsModule + ThumbnailServices resolved cleanly.

Stop the dev server with Ctrl-C after seeing the startup message.

- [ ] **Step 5: DB sanity**

Run:
```bash
docker exec kiditem-postgres psql -U kiditem -c \
  "SELECT status, phase, COUNT(*) FROM thumbnail_generations GROUP BY status, phase ORDER BY status, phase;" kiditem

docker exec kiditem-postgres psql -U kiditem -c \
  "SELECT COUNT(*) FROM thumbnail_generations WHERE status IN ('generating','ready','applied','skipped');" kiditem
```
Expected first: canonical status distribution. Expected second: `count = 0`.

- [ ] **Step 6: Smoke-test frontend (manual)**

Start dev environment and navigate to `/thumbnails`:
```bash
# In one terminal
cd apps/server && npm run start:dev
# In another terminal
cd apps/web && npm run dev
```

In the browser:
1. Verify the thumbnails page loads without console errors.
2. Verify badges show correct labels for existing ready/applied jobs (후보 선택 / 적용 완료).
3. If edit jobs exist in DB, verify they display under the correct tab.
4. If possible, trigger a new edit job and verify the "생성 중" badge appears.

Document the smoke-test result as a comment in the PR body.

- [ ] **Step 7: No commit for verification step**

Verification-only task — no commit.

---

## Task 19: PR creation

- [ ] **Step 1: Rename branch (if needed)**

If the branch is currently `claude/focused-euler`, create the conventional branch name:
```bash
git checkout -b refactor/status-canonical-thumbnail
git push -u origin refactor/status-canonical-thumbnail
```

Or push the current branch name if team convention permits.

- [ ] **Step 2: Create PR**

Run:
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

- [x] `npx vitest run` 통과
- [x] `npm run build -w apps/server` + `apps/web` 빌드 성공
- [x] `npm run start:dev` NestJS DI 부트 확인
- [x] 프론트엔드 smoke-test (/thumbnails 페이지 로드 + 라벨 렌더링 + 상태 배지)

## 아키텍처 결정

- Writer helpers (`thumbnail-status.helpers.ts`) — status+phase co-write invariant 중앙화
- Frontend helpers (`apps/web/src/lib/thumbnail-status.ts`) — 2-컬럼 predicate 중복 제거
- Test invariant helper (`__tests__/helpers.ts`) — `expectValidInvariant(row)` drift 방지
- ADR-0011 Rule 1~5 전부 준수 (Phase 3 완료로 canonical lifecycle 3-도메인 정렬 완결)

## Non-goals (follow-up)

- `applyGeneration` 2-table atomicity — 별도 PR + $transaction 예외 ADR 필요
- `processEditJob` double-fire race — 별도 PR
- `useThumbnailGenerations.ts` 중복 파일 consolidation — 후속

## Post-pull instructions (팀원용)

```bash
git pull
npm run build -w packages/shared
npx prisma generate
docker exec -i kiditem-postgres psql -U kiditem kiditem < prisma/backfill-status-canonical-thumbnail.sql
```

Skipping backfill → legacy `ready`/`applied` rows remain; frontend post-Zod-tighten rejects them as enum errors on list fetch.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Verify PR URL returned**

Capture the PR URL from the command output. Note in the conversation so the user can review.

- [ ] **Step 4: No commit for PR step**

PR creation is not a commit.

---

## Self-Review

### Spec coverage

- Decision 1 (mapping) → covered in Tasks 4, 5, 14 writers + SQL
- Decision 2 (phase enum) → covered in Task 2 (shared Zod)
- Decision 3 (skipped → cancelled) → covered in Task 4 Step 5 + Task 7 Step 4
- Decision 4 (no failureType) → N/A — nothing to build
- Decision 5 (schema shape) → covered in Task 1
- Decision 6 (writer helpers) → covered in Task 3
- Decision 7 (Zod shape) → covered in Task 2
- Decision 8 (frontend helpers) → covered in Task 9
- Affected files 23 items → Tasks 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17 collectively cover all
- Task order (T1–T9 in spec maps to T1-T19 here, expanded for granularity)
- Backfill + rollback SQL → Tasks 14, 15
- init.sql.gz → Task 16
- Tests (invariant helper + 3 new cases) → Tasks 6, 7, 8
- Non-goals explicit → repeated in Task 19 PR body
- products/CLAUDE.md update → Task 17

### Placeholder scan

- No "TBD"/"TODO" markers.
- One callout with a decision dependency: Task 11 Step 2 says "grep for `ThumbnailStatusBadge` and update props." This is concrete (grep + update) not vague.
- Task 12 Step 4 says "grep `function hasEditStatus` and confirm its signature first." Also concrete.
- Task 18 Step 6 is "manual smoke-test" with concrete navigation steps.

### Type consistency

- Helper names: `markReady / markApplied / resetToPending` used consistently in Tasks 3, 4, 5.
- Frontend helpers `isReady / isApplied / isActive / isCompleted` used consistently in Tasks 9-13.
- Shared export `THUMBNAIL_PHASES` referenced in Task 2 only, not needed in later tasks (Task 2 closes its usage).
- Status literals: `'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'` used consistently.
- Phase literals: `'ready' | 'applied'` used consistently.

### Scope

- 19 tasks, roughly 5-10 steps each → large but each step is atomic. Decomposable into subagent-driven execution.
- Single PR per Phase 2 precedent — compile-breaking change across shared package.

### Fixed inline

- Task 11 Step 1 originally had `isActive({status, phase})` with wrong predicate for badge state; updated to direct `status === 'running'` check since only running matches "생성중" label.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-15-status-canonical-phase3.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Task boundaries (T1–T19) are well-suited to per-task subagent dispatch.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
