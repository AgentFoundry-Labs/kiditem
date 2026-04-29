# Products Phase 3B — `OptionsService` SKU lifecycle layer

> Phase 3B child plan. Targets large-domain architecture refactor inside
> `apps/server/src/products`. Sits alongside the masters / bundle-components
> services as Lane B of the Phase 3B products track.

## Status

**Transitional split landed; topology converged via [`refactor/products-contract-topology`](2026-04-29-products-contract-topology-convergence.md).** The `services/`, `persistence/`, `read-models/`, and `domain/` waypoints described below were superseded when the products domain folded into the Backend Architecture Contract target shape. Specifically:

| Waypoint (this plan) | Final location after convergence PR |
|---|---|
| `services/options.service.ts` | `application/service/options.service.ts` |
| `persistence/product-option.persistence.ts` | `adapter/out/prisma/product-option.persistence.ts` |
| `read-models/product-option-read-model.ts` | `adapter/out/prisma/product-option.query.ts` |
| `domain/product-option-sku.ts` | `domain/service/product-option-sku.ts` |
| `domain/product-option-mutation-rules.ts` | `domain/policy/product-option-mutation-rules.ts` |

SKU race + tenant scope + bundle-flip + soft-delete recompute invariants were preserved verbatim by the convergence PR — only file paths changed.

## Goal

Pull SKU generation, tenant-scoped reads, mutation invariants, soft-delete
fan-out, and Prisma-touching writes out of `OptionsService` so the service
becomes thin application orchestration. Public API, controller routes, and
shared response contracts stay frozen.

## Non-goals

- No Prisma model or migration changes.
- No controller route changes.
- No `@kiditem/shared` surface change.
- No new `availableStock` writer — `BundleStockService.recompute` stays the
  sole writer (ADR-0014). Options update payloads still strip
  `availableStock` via the system-fields rule.
- No generic repository or 1:1 Prisma wrapper. Persistence helpers exist
  only because they enforce the multi-step transaction or repeated
  `companyId`-scoped invariant.

## Target files

### Production code

| Path | Action | Responsibility moved here |
|---|---|---|
| `apps/server/src/products/services/options.service.ts` | Modify | Application orchestration only — compose helpers, manage `$transaction` ownership, fan-out recompute. |
| `apps/server/src/products/domain/product-option-sku.ts` | Create | Pure SKU formatter — `buildOptionSku(masterCode, optionCounter)`. |
| `apps/server/src/products/domain/product-option-mutation-rules.ts` | Create | Pure mutation policy — `PRODUCT_OPTION_SYSTEM_FIELDS`, `stripProductOptionSystemFields`, `classifyBundleFlip`, `applyTemporaryReasonClearing`. No Prisma dep. |
| `apps/server/src/products/persistence/product-option.persistence.ts` | Create | Tenant-scoped Prisma writers/reads that must run inside the caller's `tx`: counter increment + reread, option create-with-sku, current option fetch inside tx, bundle-flip relation guards (`bundleComponent.count` for both directions), tenant-scoped `applyOptionPatch` (`updateMany` + reread), `softDeleteOptionRow`, `restoreOptionRow`, `findBundleIdsUsingComponent`. |
| `apps/server/src/products/read-models/product-option-read-model.ts` | Create | Controller-facing tenant-scoped reads — `listOptions` (cursor + AND-wrapped search/cursor), `findOptionById`, `findOptionBySku`, `findOptionByBarcode`. All use `findFirst` (`findUnique` is forbidden by `check:tenant-scope`). |

### Plan + tests

| Path | Action | Note |
|---|---|---|
| `docs/superpowers/plans/2026-04-29-products-phase3b-option-sku.md` | Create | This file. |
| `apps/server/src/products/services/__tests__/options-tenant-boundary.spec.ts` | Modify (minimal) | Replace the `findUniqueOrThrow` legacy assertion (already absent in service code) with an explicit "no `findUniqueOrThrow` ever called inside create" check. The bundle-flip tenant-scope assertions stay. |
| `apps/server/src/products/__tests__/options.service.pg.integration.spec.ts` | Untouched | Already covers SKU race, soft-deleted master TOCTOU, partial-unique conflict, isBundle flip 409, IDOR by-sku, soft-delete bundle recompute fan-out. These are the operational risks. |
| `apps/server/src/products/__tests__/master-code.service.spec.ts` | Untouched | Out of scope for this lane. |

No test deletions. Existing real-Postgres integration tests are the
authoritative protection for SKU race + tenant scope + bundle invariant +
soft-delete recompute. The per-internal-method unit spec
(`options-tenant-boundary.spec.ts`) keeps narrow assertions on the in-tx
shape that integration would still catch but at higher cost.

## Layer responsibilities (post-refactor)

```
controllers/options.controller.ts
  ↓ DTO validation + toSerializable + Zod parse (unchanged)
services/options.service.ts                  // orchestration only
  ├─ create:    persistence.incrementMasterOptionCounter
  │              + domain.buildOptionSku
  │              + domain.stripProductOptionSystemFields
  │              + persistence.createOptionWithSku
  ├─ list / findById / findBySku / findByBarcode
  │           → read-models.* (tenant-scoped findFirst)
  ├─ update:    persistence.findCurrentOption (in tx)
  │              + domain.classifyBundleFlip
  │              + persistence.assertNoBundleComponents / assertNotUsedAsComponent
  │              + domain.stripProductOptionSystemFields
  │              + domain.applyTemporaryReasonClearing
  │              + persistence.applyOptionPatch
  ├─ softDelete: persistence.softDeleteOptionRow
  │              + persistence.findBundleIdsUsingComponent
  │              + bundleStock.recompute (unchanged single writer)
  └─ restore:   persistence.restoreOptionRow
```

## Race / tenant invariants preserved

- SKU generation still runs inside `$transaction` with the same 2-step
  shape: `masterProduct.updateMany({ id, companyId, isDeleted: false })`
  → re-read `{code, optionCounter}` via tenant-scoped `findFirst`. The
  helper accepts the caller's `tx` so the invariant moves with the code,
  not the call-site.
- `tx.productOption.create` still hard-pins `companyId`, `masterId`, and
  `availableStock: null` regardless of the DTO.
- `update` still routes through `productOption.updateMany({ id, companyId,
  isDeleted: false })` so a bare-id `update` never touches the tenant
  table — `check:tenant-scope` baseline stays at zero.
- Bundle flip checks remain inside the same transaction as the patch so
  the count → patch window is not externally observable.
- Soft-delete still triggers `bundleStock.recompute` for every bundle
  that references this option as a component, in the same transaction
  as the soft-delete write.
- `findBySku` and `findByBarcode` continue to use tenant-scoped
  `findFirst` (no `findUnique`) — IDOR fix from PR #110 stays.

## Test cleanup rationale

Per [`docs/TESTING.md`](../../TESTING.md), only operational-risk tests
should be added or kept:

- The SKU race + TOCTOU + partial-unique conflict path stays in the
  real-Postgres integration spec. Mocked `$transaction` cannot reproduce
  these.
- The `findBySku` IDOR + soft-deleted-sku 404 stays in the integration
  spec. Mocked Prisma cannot enforce the actual row visibility window.
- The `softDelete` → bundle recompute fan-out stays in the integration
  spec. The behavior crosses two writes and the row-lock semantics in
  `BundleStockService.recompute` are not observable in unit mocks.
- The bundle-flip 409 path stays in both spec files: integration covers
  the real `bundleComponent.count` SQL and the unit spec keeps
  `companyId` scoping assertions on the in-transaction filter.
- No new implementation-detail tests are introduced for the new helpers.
  The integration spec already exercises every new helper end-to-end via
  the public service surface.

## Measurable improvement

`apps/server/src/products/services/options.service.ts`:

- Before: 312 LOC — one service holding system-field policy, sku
  formatting, two-step `masterProduct.updateMany + findFirst` write, four
  read shapes, mutation policy, three multi-step transactions, and the
  recompute fan-out loop.
- After: target ≤ 180 LOC — orchestration only. SKU formatter (one
  function), system-field rules (constants + two pure functions), four
  read shapes, eight persistence helpers, and the soft-delete fan-out
  read each live in their own files.

Net production code is roughly the same; the win is responsibility
separation and the ability to evolve persistence/read shape independently
of orchestration without bloating one service.

## Verification gates

```bash
rtk npm run check:shared-root-imports
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk proxy sh -lc 'cd apps/server && npx vitest run src/products/services/__tests__/options-tenant-boundary.spec.ts src/products/__tests__/options.service.pg.integration.spec.ts src/products/__tests__/master-code.service.spec.ts'
rtk proxy sh -lc 'cd apps/server && npx vitest run src/products'
rtk npm run build --workspace=apps/server
rtk npm run dev:server   # boot, wait for "Server running on http://localhost:4000", stop
rtk proxy git diff --check
```

## PR

- Branch: `refactor/products-option-sku-layer`
- Title: `refactor: split products option sku lifecycle layer`
- Commit: `refactor(products): split option sku lifecycle layer`
- Do not merge.
