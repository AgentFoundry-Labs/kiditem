# Products Follow-up Boundary Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the products-domain deferred tenant-boundary work left after the MasterProduct boundary rewrite.

**Architecture:** Stay inside the products backend owner domain. Convert remaining supplier existence checks, post-write reads, row-lock mutations, and relation reads to tenant-scoped Prisma predicates while preserving existing API response shapes except for cross-tenant supplier references, which become uniform 404 responses.

**Tech Stack:** NestJS 11, Prisma 7, PostgreSQL, Vitest unit specs, Vitest real-Postgres integration specs.

---

## Scope

Allowed edits:

- `apps/server/src/products/**`
- products-domain test files under `apps/server/src/products/**`
- this child plan under `docs/superpowers/plans/`

Disallowed edits:

- `apps/web/**`
- `packages/shared/**`
- `prisma/**`
- non-products backend domains, including channels, advertising, sourcing, ai, dashboard, statistics, action-task

No schema change, no shared contract change, no frontend change, no `init.sql.gz` regeneration.

## Baseline From Previous Products Boundary PR

Already closed before this slice:

- `OptionsService.findBySku` uses `findFirst({ sku, companyId, isDeleted: false })`.
- `MastersService.restore` uses tenant-scoped `updateMany`.
- `OptionsService.restore` uses tenant-scoped `updateMany`.
- products integration specs include a `StorageService` constructor stub for `MastersService`.

## Follow-up Risk Map

| Risk | Site | Current pattern | Target | Test evidence |
|---|---|---|---|---|
| R1 | `MastersService.create` supplier check | `supplier.findUnique({ id })` then `companyId` post-check; cross-tenant gives 403 | `supplier.findFirst({ id, companyId })`; missing and cross-tenant both 404 | Real-Postgres create test expects 404 for cross-tenant supplier |
| R2 | `MastersService.update` supplier check | `supplier.findUnique({ id })` then missing/cross-tenant gives 403 | `supplier.findFirst({ id, companyId })`; missing and cross-tenant both 404 | Real-Postgres update tests expect 404 and no mutation |
| R3 | `MastersService.create` transaction final read | Same transaction creates `{ companyId }`, then re-reads by bare `findUniqueOrThrow({ id })` | Re-read with `findFirst({ id, companyId })` and throw `NotFoundException` if unexpectedly absent | Unit spec asserts tenant-scoped final read |
| R4 | `OptionsService.create` transaction counter read | `updateMany({ id, companyId, isDeleted:false })` succeeds, then bare `findUniqueOrThrow({ id })` | Re-read with `findFirst({ id, companyId, isDeleted:false })` | Unit spec asserts tenant-scoped counter read |
| R5 | `OptionsService.update` bundle relation counts | Counts `bundleComponent` by `bundleOptionId` / `componentOptionId` only | Include `companyId` in both count predicates | Unit spec asserts count predicates include `companyId` |
| R6 | `BundleComponentsService.update/delete` | `findFirst({ id, companyId })` + parent `SELECT FOR UPDATE` + bare `update/delete({ id })` | Keep parent row lock, replace bare mutation with `updateMany/deleteMany({ id, companyId })`; update re-reads with `findFirst({ id, companyId })` | Unit specs assert scoped mutation and preserved lock-before-mutation order |
| R7 | `ProductCatalogService.masterSelect` nested options | Parent master read/list is tenant-scoped, but nested `options.where` omits `companyId` | Parameterize `masterSelect(companyId)` and include `options.where.companyId` | Unit spec asserts nested relation predicate includes `companyId` |

Manual scan notes:

- `MastersService.findByCode`, `findByLegacy`, `findById`, `list`, `getImages`, `updateImages`, `softDelete`, and `restore` already include `companyId`.
- `OptionsService.findById`, `findBySku`, `findByBarcode`, `list`, `softDelete`, and `restore` already include `companyId`.
- `BundleStockService.recompute` already uses a tenant-scoped parent read, a tagged `SELECT ... FOR UPDATE`, and `productOption.updateMany({ id, companyId })`.
- Remaining `findUniqueOrThrow` calls inside products integration tests are direct assertions against rows that were just created by the same test. They are not production access paths.

## Bundle Row-lock Decision

`BundleComponentsService.update/delete` must keep the row lock on the parent bundle option:

```sql
SELECT id FROM product_options
WHERE id = ${bundleOptionId}::uuid
  AND company_id = ${companyId}::uuid
FOR UPDATE
```

The safe rewrite is not a plain `updateMany` substitution that removes this lock. The sequence remains:

1. Tenant-scoped read of the bundle component to discover `bundleOptionId`.
2. Tagged, tenant-scoped `SELECT ... FOR UPDATE` on the parent bundle option.
3. Tenant-scoped `updateMany` or `deleteMany` on `bundle_components`.
4. Recompute bundle stock inside the same transaction while the parent row lock is still held.

For `update`, `updateMany` does not return the row, so the service re-reads with `findFirst({ id, companyId })` after a successful count check. Normal behavior stays unchanged. If another transaction deletes the component after the first read and before the scoped mutation, the method now throws `NotFoundException`; the previous bare `update/delete` path would surface Prisma `P2025`, which `mapPrismaError` also maps to 404.

## Out-of-scope Cross-domain Master Readers

These readers remain outside this products-only PR and must be owned by their domains:

- `apps/server/src/channels/**` raw SQL joins against `master_products`.
- `apps/server/src/advertising/**` reads/writes of `masterProduct`.
- `apps/server/src/sourcing/**` reads/writes of `masterProduct`.
- `apps/server/src/ai/**` thumbnail reads/writes of `masterProduct`.
- `apps/server/src/dashboard/**`, `apps/server/src/statistics/**`, and `apps/server/src/action-task/**` master readers.

This PR only records that boundary; it does not edit those files.

## Task 1: Lock Tests For Supplier 404 Semantics

**Files:**

- Modify: `apps/server/src/products/__tests__/masters.service.pg.integration.spec.ts`

- [ ] **Step 1: Change the existing create cross-tenant supplier test to expect 404.**

```typescript
it('returns 404 when create references a supplier from another company', async () => {
  const otherSupplier = await prisma.supplier.create({
    data: { companyId: OTHER_COMPANY_ID, name: 'Other co supplier' },
  });
  await expect(
    svc.create(TEST_COMPANY_ID, { name: 'W', supplierId: otherSupplier.id } as any),
  ).rejects.toMatchObject({ status: 404 });
});
```

- [ ] **Step 2: Add update tests for cross-tenant and missing suppliers.**

```typescript
it('returns 404 when update references a supplier from another company', async () => {
  const master = await svc.create(TEST_COMPANY_ID, { name: 'Own master' } as any);
  const otherSupplier = await prisma.supplier.create({
    data: { companyId: OTHER_COMPANY_ID, name: 'Other co supplier' },
  });

  await expect(
    svc.update(TEST_COMPANY_ID, master.id, { supplierId: otherSupplier.id } as any),
  ).rejects.toMatchObject({ status: 404 });

  const unchanged = await svc.findById(TEST_COMPANY_ID, master.id, {});
  expect(unchanged.supplierId).toBeNull();
});

it('returns 404 when update references a missing supplier', async () => {
  const master = await svc.create(TEST_COMPANY_ID, { name: 'Own master' } as any);

  await expect(
    svc.update(TEST_COMPANY_ID, master.id, { supplierId: '00000000-0000-0000-0000-000000000404' } as any),
  ).rejects.toMatchObject({ status: 404 });
});
```

- [ ] **Step 3: Run the focused integration spec and confirm it fails before production code changes.**

Run from `apps/server`:

```bash
rtk proxy env DATABASE_URL=postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test npx vitest run -c vitest.config.integration.ts src/products/__tests__/masters.service.pg.integration.spec.ts
```

Expected before implementation: at least the cross-tenant supplier tests fail with 403 instead of 404.

## Task 2: Lock Tests For Defensive Tenant-scoped Internal Reads

**Files:**

- Create: `apps/server/src/products/services/__tests__/masters-tenant-boundary.spec.ts`
- Create: `apps/server/src/products/services/__tests__/options-tenant-boundary.spec.ts`

- [ ] **Step 1: Add a MastersService unit spec proving create final read is tenant-scoped.**

```typescript
expect(tx.masterProduct.findFirst).toHaveBeenCalledWith({
  where: { id: 'master-1', companyId: 'company-1' },
  include: expect.any(Object),
});
expect(tx.masterProduct.findUniqueOrThrow).not.toHaveBeenCalled();
```

- [ ] **Step 2: Add an OptionsService unit spec proving create counter read is tenant-scoped.**

```typescript
expect(tx.masterProduct.findFirst).toHaveBeenCalledWith({
  where: { id: 'master-1', companyId: 'company-1', isDeleted: false },
  select: { code: true, optionCounter: true },
});
expect(tx.masterProduct.findUniqueOrThrow).not.toHaveBeenCalled();
```

- [ ] **Step 3: Add OptionsService unit specs proving bundle relation counts include companyId.**

```typescript
expect(tx.bundleComponent.count).toHaveBeenCalledWith({
  where: { bundleOptionId: 'option-1', companyId: 'company-1' },
});
expect(tx.bundleComponent.count).toHaveBeenCalledWith({
  where: { componentOptionId: 'option-1', companyId: 'company-1' },
});
```

- [ ] **Step 4: Run these unit specs and confirm they fail before implementation.**

Run from `apps/server`:

```bash
rtk proxy npx vitest run src/products/services/__tests__/masters-tenant-boundary.spec.ts src/products/services/__tests__/options-tenant-boundary.spec.ts
```

Expected before implementation: assertions fail because production code still uses bare `findUniqueOrThrow` and relation counts without `companyId`.

## Task 3: Lock Tests For Bundle Row-lock Scoped Mutations

**Files:**

- Create: `apps/server/src/products/services/__tests__/bundle-components-tenant-boundary.spec.ts`

- [ ] **Step 1: Add an update spec proving scoped mutation and lock ordering.**

```typescript
expect(tx.$queryRaw).toHaveBeenCalled();
expect(tx.bundleComponent.updateMany).toHaveBeenCalledWith({
  where: { id: 'bc-1', companyId: 'company-1' },
  data: { qty: 5 },
});
expect(tx.bundleComponent.update).not.toHaveBeenCalled();
expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
  tx.bundleComponent.updateMany.mock.invocationCallOrder[0],
);
```

- [ ] **Step 2: Add a delete spec proving scoped mutation and lock ordering.**

```typescript
expect(tx.bundleComponent.deleteMany).toHaveBeenCalledWith({
  where: { id: 'bc-1', companyId: 'company-1' },
});
expect(tx.bundleComponent.delete).not.toHaveBeenCalled();
expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
  tx.bundleComponent.deleteMany.mock.invocationCallOrder[0],
);
```

- [ ] **Step 3: Run the spec and confirm it fails before implementation.**

Run from `apps/server`:

```bash
rtk proxy npx vitest run src/products/services/__tests__/bundle-components-tenant-boundary.spec.ts
```

Expected before implementation: assertions fail because production code still uses bare `update/delete`.

## Task 4: Lock Test For ProductCatalog Nested Relation Scope

**Files:**

- Modify: `apps/server/src/products/__tests__/product-catalog.service.spec.ts`

- [ ] **Step 1: Add a unit assertion for nested options tenant scope.**

```typescript
await service.detail('c1', 'm1');
const select = prisma.masterProduct.findFirst.mock.calls[0][0].select;
expect(select.options.where).toEqual({
  companyId: 'c1',
  isDeleted: false,
  isActive: true,
});
```

- [ ] **Step 2: Run the spec and confirm it fails before implementation.**

Run from `apps/server`:

```bash
rtk proxy npx vitest run src/products/__tests__/product-catalog.service.spec.ts
```

Expected before implementation: assertion fails because `options.where.companyId` is absent.

## Task 5: Implement Products Tenant-boundary Hardening

**Files:**

- Modify: `apps/server/src/products/services/masters.service.ts`
- Modify: `apps/server/src/products/services/options.service.ts`
- Modify: `apps/server/src/products/services/bundle-components.service.ts`
- Modify: `apps/server/src/products/services/product-catalog.service.ts`

- [ ] **Step 1: Replace supplier checks with `findFirst({ id, companyId })`.**

```typescript
const supplier = await db.supplier.findFirst({
  where: { id: dto.supplierId, companyId },
  select: { id: true },
});
if (!supplier) throw new NotFoundException('supplier not found');
```

- [ ] **Step 2: Replace `MastersService.create` final read with tenant-scoped `findFirst`.**

```typescript
const created = await tx.masterProduct.findFirst({
  where: { id: row.id, companyId },
  include: MASTER_WITH_IMAGES,
});
if (!created) throw new NotFoundException('master not found');
return created;
```

- [ ] **Step 3: Replace `OptionsService.create` counter read with tenant-scoped `findFirst`.**

```typescript
const master = await tx.masterProduct.findFirst({
  where: { id: dto.masterId, companyId, isDeleted: false },
  select: { code: true, optionCounter: true },
});
if (!master) throw new NotFoundException('master not found or deleted');
```

- [ ] **Step 4: Add `companyId` to `OptionsService.update` bundle relation counts.**

```typescript
await tx.bundleComponent.count({
  where: { bundleOptionId: id, companyId },
});
await tx.bundleComponent.count({
  where: { componentOptionId: id, companyId },
});
```

- [ ] **Step 5: Preserve bundle row locks while replacing bare mutations.**

```typescript
const { count } = await tx.bundleComponent.updateMany({
  where: { id, companyId },
  data: { qty: dto.qty },
});
if (count === 0) throw new NotFoundException('bundle-component not found');
const updated = await tx.bundleComponent.findFirst({ where: { id, companyId } });
if (!updated) throw new NotFoundException('bundle-component not found');
```

```typescript
const { count } = await tx.bundleComponent.deleteMany({
  where: { id, companyId },
});
if (count === 0) throw new NotFoundException('bundle-component not found');
```

- [ ] **Step 6: Parameterize `ProductCatalogService.masterSelect(companyId)` and include `companyId` in nested options.**

```typescript
options: {
  where: { companyId, isDeleted: false, isActive: true },
  orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
  include: { inventory: { select: { currentStock: true } } },
},
```

## Task 6: Verification

- [ ] `rtk npm run check:idor`
- [ ] `rtk npm run check:tenant-scope`
- [ ] `rtk npm run build --workspace=apps/server`
- [ ] From `apps/server`: `rtk proxy npx vitest run src/products`
- [ ] If Docker Postgres is available: `rtk npm run db:test:up`
- [ ] If Docker Postgres is available: `rtk npm run db:test:prepare`
- [ ] From `apps/server`: `rtk proxy env DATABASE_URL=postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test npx vitest run -c vitest.config.integration.ts src/products`
- [ ] `rtk npm run dev:server`
- [ ] `rtk git diff --check`

If Vitest fails on the known subpath alias issue, capture the exact error text and report it in the PR body. Do not fix aliasing in this PR.

## Task 7: Commits And PR

- [ ] Commit this plan:

```bash
rtk git add docs/superpowers/plans/2026-04-29-products-followup-boundary-rewrite.md
rtk git commit -m "docs: plan products follow-up boundary rewrite"
```

- [ ] Commit implementation and tests:

```bash
rtk git add apps/server/src/products
rtk git commit -m "refactor: harden products follow-up tenant boundary"
```

- [ ] Push branch:

```bash
rtk git push -u origin refactor/phase3-products-followup-boundary
```

- [ ] Open PR without merging:

```bash
rtk gh pr create --title "refactor: harden products follow-up tenant boundary" --body-file /tmp/products-followup-boundary-pr.md
```

PR body must include: change summary, which deferred work closed, bundle row-lock rationale, out-of-scope cross-domain master readers, verification results, exact Vitest alias blocker if present, and DB/schema/init.sql.gz unchanged status.
