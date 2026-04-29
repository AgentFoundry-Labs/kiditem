# Products / MasterProduct Boundary Rewrite Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the `products` module's `MasterProduct` / `ProductOption` / `BundleComponent` query and write boundary so every tenant-owned read/write goes through `findFirst({ id, companyId, ... })` or `updateMany({ where: { ..., companyId } })` semantics. Resolve a hidden IDOR-class anti-pattern on `findBySku` and tighten restore atomicity. Defer cross-domain cleanup to follow-up slices.

**Architecture:** Phase 3 reconstruction owner = `products`. We enforce ADR-0006 multi-tenant scope inside this domain only. External masterProduct consumers (sourcing/advertising/rules/ai-thumbnail/dashboard/statistics/action-task) and the `channels` raw-SQL JOIN against `master_products` are out of scope here and recorded as separate child plans. No schema changes. No frontend changes. No `init.sql.gz` regeneration.

**Tech Stack:** NestJS 11, Prisma 7, PostgreSQL, Vitest (real-Postgres integration tier).

---

## Current Baseline

- Working branch: `refactor/products-masterproduct-boundary`, forked from `b94317b35d191e1be5fb2644107a21401f137a0d` (`origin/main` after PR #98 wave).
- `npm run check:idor` — **PASS**.
- `npm run check:tenant-scope` — **PASS** (allowlist contains only `marketplace.service.ts findUnique`).
- `npx tsc --noEmit -p apps/server/tsconfig.json` reports **pre-existing** TS errors in 9 files including 4 `products/__tests__/*.pg.integration.spec.ts` files where `MastersService` is constructed with 2 args (Expected 3 — missing `StorageService`). Storage was added but specs not updated. We fix these as part of this slice because they block our own integration test runs.

## Owner Domain (this slice)

- `apps/server/src/products/services/masters.service.ts`
- `apps/server/src/products/services/options.service.ts`
- `apps/server/src/products/services/bundle-stock.service.ts` (read-only verification)
- `apps/server/src/products/services/bundle-components.service.ts` (read-only verification)
- `apps/server/src/products/services/product-catalog.service.ts` (read-only verification)
- `apps/server/src/products/__tests__/*.pg.integration.spec.ts`
- `apps/server/src/products/__tests__/*.spec.ts`

No edits outside `apps/server/src/products/**`. `packages/shared` is untouched (no contract change).

## Tenant-Scope Risk Map

### Confirmed risks fixed in this slice

| # | Site | Pattern | Risk class | Fix |
|---|---|---|---|---|
| R1 | [`OptionsService.findBySku`](../../../apps/server/src/products/services/options.service.ts) (`findUnique({ where: { sku } })` then post-filter `companyId`) | Unbounded global lookup keyed on a unique non-`id` column then post-discard. | IDOR-pattern. Tenant scope is enforced only after the read returns; current scanner keys on `id` so it does not flag this. Timing oracle / pattern violates root AGENTS.md "Multi-tenant scope" hard rule. | Replace with `findFirst({ where: { sku, companyId, isDeleted: false } })`. Drop the post-filter dance. Behavior unchanged for callers (still `NotFoundException`). |
| R2 | `MastersService.restore` (`findFirst + bare-id update`) | Read-then-write. Scanner allows it (preceding 25 lines reference `companyId`), but the actual write is bare-id. | Race window between read and write; pattern leaks intent (the write target is not tenant-scoped). | Replace with single atomic `updateMany({ where: { id, companyId, isDeleted: true }, data: ... })`; check `count === 0` for `NotFoundException`. P2002 propagates the same way through `mapPrismaError`. |
| R3 | `OptionsService.restore` | Same `findFirst + bare-id update`. | Same. | Same `updateMany` rewrite. |

### Confirmed risks intentionally deferred (next slices)

| # | Site | Why deferred |
|---|---|---|
| D1 | `MastersService.create/update` supplier check (`findUnique({ id }) + post-check companyId !== caller`) | Fix changes observable behavior (`ForbiddenException 403` → `NotFoundException 404`) and an existing integration test asserts `status: 403`. Worth doing in its own slice with explicit consumer review. |
| D2 | `MastersService.create` final read `tx.masterProduct.findUniqueOrThrow({ where: { id: row.id } })` (line 102) | Inside the same transaction that just created the row with `companyId`. Risk negligible. Could be tightened to `findFirst({ id, companyId })` defensively but adds no real safety. |
| D3 | `OptionsService.create` `tx.masterProduct.findUniqueOrThrow({ where: { id: dto.masterId } })` (line 56) | Inside the same transaction immediately after `tx.masterProduct.updateMany({ where: { id, companyId, isDeleted: false } })` succeeded with count > 0. Tenant scope is implicit. Defensive symmetry only. |
| D4 | `BundleComponentsService.update/delete` read-then-write (`findFirst({ id, companyId }) + tx.bundleComponent.update/delete({ where: { id } })`) | Pattern is wrapped in a `SELECT ... FOR UPDATE` row lock on the parent bundle option. Replacing with `updateMany` would lose the lock semantics and complicate the recompute fan-out. Worth a separate plan that revisits the row-lock invariant. |

### Cross-domain consumers (out-of-scope analysis only)

These touch `masterProduct` / `productOption` from outside `apps/server/src/products/**`. Per session-boundary rules, they are NOT modified in this slice. Each gets a follow-up plan.

| Consumer | File | Notes |
|---|---|---|
| sourcing | `apps/server/src/sourcing/sourcing.service.ts:73,78,124,125` | `findFirst` + `update` against `masterProduct`. Scanner currently green. Owner: sourcing. |
| advertising | `apps/server/src/advertising/services/advertising.service.ts:94`; `apps/server/src/advertising/services/ad-action.service.ts:234` (raw SQL `LEFT JOIN master_products`); `apps/server/src/advertising/services/ad-campaigns.service.ts:131` | Mix of ORM update + tagged raw SQL JOIN. Owner: advertising. |
| rules | `apps/server/src/rules/services/rules.service.ts:54,161-182` | Already migrated to tenant-scoped `updateMany` per Phase 1. Verify only. |
| ai/thumbnail | `apps/server/src/ai/services/thumbnail-generation.service.ts:108,242,359,707`; `apps/server/src/ai/services/thumbnail-analysis.service.ts:64,144,200,465`; `apps/server/src/ai/services/thumbnail-recompose.service.ts:28` | Heavy reads + per-tenant writes. Owner: ai. Schedule: Phase 3 ai slot. |
| dashboard | `apps/server/src/dashboard/services/dashboard-inventory.service.ts:38,52,83`; `apps/server/src/dashboard/services/dashboard-sales.service.ts:205` (raw SQL JOIN) | Owner: dashboard. |
| statistics | `apps/server/src/statistics/statistics.service.ts:52` | Single `count` already scoped. Owner: statistics. |
| action-task | `apps/server/src/action-task/action-task.service.ts:45` | Owner: action-task. |
| agent-registry | `apps/server/src/agent-registry/business-safety/snapshot.service.ts:23,77` | Already uses `findFirst({ id, companyId })`. Verify only. |
| channels | `apps/server/src/channels/services/channel-dashboard.service.ts:111` (raw SQL `JOIN master_products mp ON mp.id = cl.master_id`) | Tagged raw SQL with `company_id` predicate is presumed enforced. Owner: channels. **DO NOT MODIFY in this slice** per task scope. |

### Schema / shared / frontend impact

- **Schema:** None. `MasterProduct.barcode` non-uniqueness, `ProductOption` partial-unique indexes, `bundle_components` 3-way invariant — all preserved.
- **`@kiditem/shared`:** None. No contract change. `@kiditem/shared/product` types are stable.
- **Frontend:** None. Endpoints and response shapes unchanged. `findBySku` still returns 404 for non-matches; the swap is internal.

## Implementation Plan

### Task 1: Refactor `OptionsService.findBySku` to tenant-scoped `findFirst`

**Files:**

- Modify: `apps/server/src/products/services/options.service.ts:147-155`
- Test: `apps/server/src/products/__tests__/options.service.pg.integration.spec.ts`

- [ ] **Step 1: Update `findBySku` to use `findFirst({ where: { sku, companyId, isDeleted: false } })`.**

```typescript
/**
 * sku is unique across the table, but may belong to another tenant or to a
 * soft-deleted row. Use a tenant-scoped `findFirst` so the DB never returns
 * cross-tenant rows in the first place — eliminates the previous IDOR-pattern
 * (findUnique + post-filter) and aligns with root AGENTS.md "Multi-tenant scope".
 */
async findBySku(companyId: string, sku: string): Promise<ProductOption> {
  const row = await this.prisma.productOption.findFirst({
    where: { sku, companyId, isDeleted: false },
  });
  if (!row) throw new NotFoundException('option not found');
  return row;
}
```

- [ ] **Step 2: Add cross-tenant integration test.**

```typescript
it('findBySku returns 404 for a sku belonging to another company', async () => {
  const otherMaster = await mastersSvc.create(OTHER_COMPANY_ID, { name: 'Other master' } as any);
  const otherOpt = await svc.create(OTHER_COMPANY_ID, {
    masterId: otherMaster.id,
    optionName: 'Other option',
  } as any);
  await expect(svc.findBySku(TEST_COMPANY_ID, otherOpt.sku)).rejects.toMatchObject({
    status: 404,
  });
});
```

- [ ] **Step 3: Run focused vitest on `apps/server/src/products`.**

Run: `npm run test --workspace=apps/server -- --run src/products`
Expected: PASS (existing tests + new test).

### Task 2: Atomic restore for MastersService

**Files:**

- Modify: `apps/server/src/products/services/masters.service.ts:529-548`

- [ ] **Step 1: Replace `findFirst + bare-id update` with atomic `updateMany`.**

```typescript
/**
 * Restore a soft-deleted master. Atomic: no read-then-write window.
 *
 * @param outerTx - Optional outer transaction (Plan B2 compose). Caller must pass
 *                  `{ timeout: >= 15000 }` on the outer `$transaction`.
 */
async restore(
  companyId: string,
  id: string,
  outerTx?: Prisma.TransactionClient,
): Promise<void> {
  const db = outerTx ?? this.prisma;
  try {
    const { count } = await db.masterProduct.updateMany({
      where: { id, companyId, isDeleted: true },
      data: { isDeleted: false, deletedAt: null },
    });
    if (count === 0) throw new NotFoundException('master not found or not deleted');
  } catch (e) { mapPrismaError(e, 'master restore'); }
}
```

- [ ] **Step 2: Verify existing `rejects restore when duplicate legacyCode is taken` integration test still asserts `status: 409` (P2002 propagates through `updateMany` the same way).**

- [ ] **Step 3: Run integration test.**

Run: `npm run db:test:up && npm run db:test:prepare && npm run test:integration --workspace=apps/server -- --run src/products/__tests__/masters.service.pg.integration.spec.ts`
Expected: PASS.

### Task 3: Atomic restore for OptionsService

**Files:**

- Modify: `apps/server/src/products/services/options.service.ts:271-290`

- [ ] **Step 1: Replace `findFirst + bare-id update` with atomic `updateMany`.**

```typescript
/**
 * Restore a soft-deleted option. Atomic: no read-then-write window.
 *
 * @param outerTx - Optional outer transaction (Plan B2 compose). Caller must pass
 *                  `{ timeout: >= 15000 }` on the outer `$transaction`.
 */
async restore(
  companyId: string,
  id: string,
  outerTx?: Prisma.TransactionClient,
): Promise<void> {
  const db = outerTx ?? this.prisma;
  try {
    const { count } = await db.productOption.updateMany({
      where: { id, companyId, isDeleted: true },
      data: { isDeleted: false, deletedAt: null },
    });
    if (count === 0) throw new NotFoundException('option not found or not deleted');
  } catch (e) { mapPrismaError(e, 'option restore'); }
}
```

- [ ] **Step 2: Run focused vitest on `apps/server/src/products`.**

### Task 4: Fix integration spec constructor compile errors

**Files:**

- Modify: `apps/server/src/products/__tests__/masters.service.pg.integration.spec.ts:20`
- Modify: `apps/server/src/products/__tests__/options.service.pg.integration.spec.ts:22`
- Modify: `apps/server/src/products/__tests__/bundle-components.service.pg.integration.spec.ts:25`
- Modify: `apps/server/src/products/__tests__/pagination.pg.integration.spec.ts:27`

Storage was added to `MastersService` constructor but these specs were never updated. They emit `TS2554: Expected 3 arguments, but got 2`. The specs do not exercise upload paths, so a typed null stub is sufficient.

- [ ] **Step 1: Pass a typed null stub as 3rd arg.**

```typescript
import { StorageService } from '../../common/storage/storage.service';
// ...
const storage = null as unknown as StorageService;
mastersSvc = new MastersService(prisma as any, codeSvc, storage);
```

- [ ] **Step 2: `npx tsc --noEmit -p apps/server/tsconfig.json` no longer reports the 4 `TS2554` errors in `products/__tests__/`.**

The 17 remaining TS errors in advertising / ai / statistics specs are pre-existing and out of scope.

### Task 5: Verification gates

- [ ] `npm run check:idor` — PASS.
- [ ] `npm run check:tenant-scope` — PASS.
- [ ] `npm run build --workspace=apps/server` — PASS.
- [ ] `npm run dev:server` (boot, then SIGINT) — Nest boots without DI errors.
- [ ] Focused vitest on `apps/server/src/products` — PASS.
- [ ] Integration spec on `apps/server/src/products/__tests__/*.pg.integration.spec.ts` — PASS (real Postgres).
- [ ] `git diff --check` — clean.

### Task 6: Commit + PR

- [ ] Commit 1: `docs: plan products masterProduct boundary rewrite` (this file).
- [ ] Commit 2: `refactor: harden products masterProduct boundary` (Tasks 1–4).
- [ ] PR: `refactor/products-masterproduct-boundary` — body lists implemented + deferred slices, channels/frontend/shared impact = none, validation evidence.

## Deferred Work (next plans)

1. **`d2-supplier-cross-tenant-unify`** — switch `MastersService.create/update` supplier check to `findFirst({ id, companyId })` + uniform `NotFoundException` (drops the 403 information leak). One-line test update.
2. **`d3-products-defensive-tenant-scope`** — D2 + D3 above (transactional `findUniqueOrThrow → findFirst({ id, companyId })`).
3. **`d4-bundle-components-row-lock-revisit`** — replace `findFirst + bare update` with `updateMany` while preserving `SELECT FOR UPDATE` row-lock invariant.
4. **`d5-channels-master-join-tenancy`** — channels raw SQL JOIN onto `master_products`. Verify `company_id` predicate binding. Owner: channels.
5. **`d6-cross-domain-master-readers`** — sourcing/advertising/dashboard/ai/thumbnail/statistics/action-task per-domain plans (one PR each).

## Non-Goals

- No edits in `prisma/`, `packages/shared/`, `apps/web/`.
- No `init.sql.gz` regeneration.
- No supplier 403 → 404 unification (deferred to D1 because the test asserts `status: 403`).
- No fan-out cleanup of cross-domain `masterProduct` consumers.
- No removal of the existing scanner allowlist entry.

## Remaining Risks

- The cross-tenant integration test for `findBySku` requires the test DB to be up. Local dev runs `npm run db:test:up && npm run db:test:prepare`; CI does not yet (no `.github/workflows`), so the test will only verify locally on this PR. Document this in the PR body.
- Atomic restore + P2002 path: the existing `rejects restore when duplicate legacyCode is taken` test exercises the P2002 → 409 conversion in `mapPrismaError`. With `updateMany` instead of `update`, the same DB-level constraint violation is raised; the catch block is unchanged. If this test starts failing, regenerate the failure trace before assuming the refactor is wrong.
- The integration tests are TS-clean only after Task 4. If the storage stub typing changes, re-verify `tsc --noEmit -p apps/server/tsconfig.json` against the `products/__tests__/` paths.
