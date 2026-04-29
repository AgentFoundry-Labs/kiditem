# Products Phase 3B — Bundle Stock Invariant Layer Split

> Phase 3B child plan, products domain, Lane C. Sibling lanes (Master/Option
> rewrite, image normalization, etc.) stay out of scope.

**Goal:** Split `BundleComponentsService` and `BundleStockService` so the
production code separates pure invariants, row-lock + scoped persistence, and
read-model from the orchestration layer. The public surfaces and ADR-0014
single-writer contract for `availableStock` stay byte-compatible.

**Architecture:** Apply the Phase 3B internal-layer split inside the products
bounded context. Pure rules and pure capacity math move to `domain/`.
Tenant-scoped Prisma calls and the `SELECT … FOR UPDATE` row-lock move to
`persistence/`. The forward/reverse listing query moves to `read-models/`. The
two `@Injectable()` services keep their constructor signatures, public method
shapes, and orchestration responsibility.

**Tech Stack:** NestJS 11, Prisma 7 tagged templates, PostgreSQL, Vitest unit +
real-Postgres integration.

---

## Scope

- `apps/server/src/products/services/bundle-components.service.ts`
- `apps/server/src/products/services/bundle-stock.service.ts`
- New: `apps/server/src/products/domain/bundle-component-rules.ts`
- New: `apps/server/src/products/domain/bundle-stock-capacity.ts`
- New: `apps/server/src/products/persistence/bundle-component.persistence.ts`
- New: `apps/server/src/products/persistence/bundle-stock.persistence.ts`
- New: `apps/server/src/products/read-models/bundle-component-read-model.ts`
- This plan document.

Out of scope: `options.service.ts`, `masters.service.ts`, controller routes,
DTO shapes, shared package contract, Prisma schema, frontend, other backend
domains. `OptionsService.softDelete` is **read-only verified** to confirm it
still calls `BundleStockService.recompute` per affected bundle and is not
modified.

## Moved Responsibility

| Existing responsibility | New home |
|---|---|
| Self-reference / nested-bundle / cross-company / soft-delete-tombstone validation in `BundleComponentsService.create` | `domain/bundle-component-rules.ts` (pure functions, no Prisma) |
| `min(floor(stock / qty))` capacity math in `BundleStockService.recompute` | `domain/bundle-stock-capacity.ts` (pure function, plain inputs) |
| `SELECT id FROM product_options … FOR UPDATE` row-lock SQL (used by both services) | `persistence/bundle-stock.persistence.ts` (canonical owner — ADR-0014 single-writer); imported by `persistence/bundle-component.persistence.ts` |
| `bundleComponent.{findFirst, create, updateMany, deleteMany}` calls scoped to `{ id, companyId }` | `persistence/bundle-component.persistence.ts` |
| `productOption.findFirst({ select: { id: true }, isDeleted: false })`, `productOption.updateMany availableStock`, `bundleComponent.findMany` for active components + fan-out lookup | `persistence/bundle-stock.persistence.ts` |
| `BundleComponentsService.list` forward/reverse listing | `read-models/bundle-component-read-model.ts` |
| Use-case orchestration (validate → lock → mutate → recompute) | `BundleComponentsService` (kept thin) |
| Use-case orchestration (lock → load components → compute → write) | `BundleStockService` (kept thin) |

The `BundleStockService` export contract is unchanged — `recompute` and
`recomputeForComponent` keep the same signatures so `InventoryService`
(`apps/server/src/inventory/services/inventory.service.ts:263`) and
`OptionsService.softDelete` continue to call them as before. The
ADR-0014 invariant — `availableStock` is written **only** by
`BundleStockService` — is preserved because the new persistence helpers are
called from `BundleStockService.recompute` and nowhere else.

## Invariants Preserved

- 3-way `BundleComponent.companyId = bundleOption.companyId` derivation.
- Self-reference / nested bundle / cross-company / soft-deleted option →
  same HTTP status codes (409, 400, 404, 403).
- Row-lock SQL stays a Prisma tagged template (`$queryRaw`), still binds
  `company_id = ${companyId}::uuid` (raw-SQL tenant predicate rule).
- Component CRUD and the subsequent `recompute` continue to share one
  transaction so the bundle option row-lock is held for the entire
  validate→mutate→recompute window.
- `BundleStockService.recompute` keeps its auto-`$transaction` wrap when no
  outer tx is supplied (the quality-reviewer CRITICAL fix).
- `availableStock` remains write-only via `BundleStockService`.

## Test Policy

This refactor moves code without changing public behavior, so **no new mock
specs are added**. The risk-based coverage that protects this slice already
exists:

| Risk | Existing coverage |
|---|---|
| Real Postgres row-lock + recompute + 3-way invariant | `apps/server/src/products/__tests__/bundle-components.service.pg.integration.spec.ts` (kept as-is) |
| Cross-tenant + lock-ordering inside transaction | `apps/server/src/products/services/__tests__/bundle-components-tenant-boundary.spec.ts` (kept as-is — assertions are call-shape on `tx`, persistence helpers preserve them) |
| `recomputeForComponent` fan-out + soft-deleted exclusion | `apps/server/src/products/services/__tests__/bundle-stock.recompute-for-component.spec.ts` (kept as-is — calls `service.recompute` which now delegates internally) |
| Capacity math + bundle option lookup + scoped write | `apps/server/src/products/__tests__/bundle-stock.service.spec.ts` (kept as-is — assertions check Prisma call shape; persistence helpers issue the exact same calls) |
| Soft-delete fan-out from option → bundle | `apps/server/src/products/__tests__/options.service.pg.integration.spec.ts` (already exercises `softDelete → bundleStock.recompute`) |
| ADR-0014 single-writer invariant on `availableStock` | Inventory unit + integration suites (`inventory.service.*.spec.ts`, `inventory-flow.pg.integration.spec.ts`) |

No tests are deleted, no specs collapsed. Reasoning: the existing tests are
behavior- or call-shape focused (not "wired" tests on private internals). They
already pass with the new structure because the persistence helpers issue the
same underlying Prisma calls on the same `tx` clients. Adding implementation-
detail unit tests for the pure helpers would only restate compiler-enforced
typing.

## Verification Gate

Before claiming completion, this lane must run:

```bash
npm run check:shared-root-imports
npm run check:idor
npm run check:tenant-scope
npm run db:test:up
npm run db:test:prepare
( cd apps/server && DATABASE_URL=postgresql://kiditem_test:kiditem_test@localhost:5434/kiditem_test \
  npx vitest run --config vitest.config.integration.ts \
  src/products/__tests__/bundle-components.service.pg.integration.spec.ts )
( cd apps/server && npx vitest run \
  src/products/services/__tests__/bundle-components-tenant-boundary.spec.ts \
  src/products/services/__tests__/bundle-stock.recompute-for-component.spec.ts \
  src/products/__tests__/bundle-stock.service.spec.ts )
npm run db:test:down
( cd apps/server && npx vitest run src/products )
npm run build --workspace=apps/server
npm run dev:server   # confirm Nest boot, then stop
git diff --check
```

## Measurable Improvement

Baseline LOC (before refactor):

| File | Lines |
|---|---|
| `apps/server/src/products/services/bundle-components.service.ts` | 203 |
| `apps/server/src/products/services/bundle-stock.service.ts` | 112 |

Target after refactor: both services drop noticeably (orchestration-only
shape) while the moved logic lives in 5 focused new files of <100 lines each.
Concrete before/after numbers are recorded in the PR body.

## Non-Goals

- No change to controller routes, DTOs, or shared API contracts.
- No change to row-lock SQL semantics or tenant predicate.
- No new Injectable providers (persistence/domain/read-model are plain
  modules) — DI graph and existing test constructors stay intact.
- No new tests added; no existing tests removed.
- No edits outside `apps/server/src/products/**` and this plan doc.
