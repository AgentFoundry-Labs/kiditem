# Products Phase 3B Lane A — split master/catalog read layer

> Lane A of the Phase 3B `products` refactor.
> Parent plan: [`2026-04-28-codebase-reconstruction.md`](./2026-04-28-codebase-reconstruction.md) §Phase 3B.

## Goal

Reduce `MastersService` and `ProductCatalogService` to orchestration by moving
the MasterProduct read shape, image normalization/resolution, and the catalog
list/detail mapper into focused modules. No public API change. No new Nest
provider.

## Target files

| Owner | Path | Before |
|---|---|---|
| Service | `apps/server/src/products/services/masters.service.ts` | 564 LOC |
| Service | `apps/server/src/products/services/product-catalog.service.ts` | 260 LOC |

## New focused modules (function module, no Nest provider)

| Module | Path | Responsibility |
|---|---|---|
| Read-model | `apps/server/src/products/read-models/master-product-read-model.ts` | `MASTER_WITH_IMAGES` include, `MasterWithImageRows` row type, tenant-scoped `findMasterById` / `findMasterByCode` / `findMasterByLegacy` / `findMasterListPage` (cursor + soft-delete + search/filter clauses) / `findMasterImageRows`. |
| Read-model | `apps/server/src/products/read-models/product-catalog-read-model.ts` | `CatalogMasterRow` / `CatalogOptionRow` types, `buildCatalogWhere`, `buildCatalogMasterSelect`, `findCatalogPage` (Promise.all list+count), `findCatalogDetail`, `findCatalogCountsRows`, `normalizePipelineStep`. |
| Mapper | `apps/server/src/products/mappers/master-product.mapper.ts` | `toMasterImageItem` (Prisma `MasterProductImage` → shared `MasterImageItem`), `withImageRows` (read-model row → domain `MasterProduct` shape consumed by `MasterSchema`). |
| Mapper | `apps/server/src/products/mappers/product-catalog.mapper.ts` | `range`, `optionStock`, `activeOptions`, `mapCatalogListItem`, `mapCatalogDetail`, `mapCatalogCounts`. Pure — depends on `normalizeMasterImages` and `toSerializable`. |
| Domain | `apps/server/src/products/domain/master-image-normalizer.ts` | Pure write-side helpers: `normalizeImagesForWrite` (sorted by sortOrder), `representativeImageUrl` (primary || first || null), `primaryImageIndex`. |
| Domain | `apps/server/src/products/domain/public-image-url.ts` | `assertPublicHttpUrl` SSRF guard + IPv4 / IPv6 / IPv4-mapped IPv6 / IPv4-compat IPv6 / link-local / ULA / loopback / unspecified / CGNAT / cloud-metadata blocks. Throws `BadRequestException`. |

`apps/server/src/products/services/product-image-normalizer.ts` and its test
stay where they are — `normalizeMasterImages` is already a focused
read-path normalizer reused by the DTO validator and the catalog mapper.

## Responsibility move

### `MastersService` keeps

- create / update / soft-delete / restore / `updateImages` / `uploadImage` /
  `originalImageBase64` orchestration.
- Inside-transaction re-reads after writes (use `MASTER_WITH_IMAGES` from the
  read-model but issue the read on `tx` directly — preserves the
  tenant-boundary spec assertion that `create` re-reads the new row with
  `{ id, companyId }` only).
- `createImageRowsTx` / `replaceImagesTx` private write helpers (image row
  writes are mutation-coupled and the lane is read-layer scoped).
- `strip` SYSTEM_FIELDS DTO sanitizer (mutation-coupled).

### `MastersService` loses

- `MASTER_WITH_IMAGES` constant + `MasterWithImageRows` type → read-model.
- `toMasterImageItem` + `withImageRows` → mapper.
- `findById` / `findByCode` / `findByLegacy` / `list` / `getImages` reads →
  read-model functions; service collapses to "fetch via read-model, throw if
  null, map via mapper".
- `assertPublicHttpUrl` + `extractEmbeddedIPv4` + `isPrivateIPv4` → domain.
- `normalizeImagesForWrite` + `representativeImageUrl` + `primaryImageIndex` →
  domain.

### `ProductCatalogService` keeps

- public `list` / `detail` / `counts` orchestration only. Each method is a
  single read-model call followed by a single mapper call.

### `ProductCatalogService` loses

- `where` / `masterSelect` / `normalizePipelineStep` / Promise.all list+count
  / detail findFirst / counts findMany → read-model.
- `range` / `optionStock` / `activeOptions` / `mapListItem` / `CatalogMasterRow`
  / `CatalogOptionRow` → mapper.

## Public API compatibility

- All controller routes (`GET /api/products/masters`,
  `GET /api/products/masters/:id`, `GET /api/products/catalog`,
  `GET /api/products/catalog/:id`, `GET /api/products/catalog/counts`,
  master image POST/PATCH/GET, master CRUD) keep the same shape.
- `MasterSchema` / `MasterWithOptionsSchema` / `MasterImageItemSchema` /
  `ProductCatalogListResponseSchema` / `ProductCatalogDetailSchema` /
  `ProductCatalogCountsSchema` Zod parses are unchanged — controllers
  continue to own response normalization.
- Tenant scope for the catalog detail nested option `where`
  (`{ companyId, isDeleted: false, isActive: true }`) is preserved verbatim.
- Cursor pagination tuple `(createdAt DESC, id DESC)` and the
  `take: limit + 1` overshoot semantics are preserved.

## Test policy (risk-based)

Existing tests already cover the operating risk for this lane and continue
to exercise the public service API after the refactor:

| Test | Why it stays |
|---|---|
| `services/__tests__/masters-ssrf.spec.ts` | Public `originalImageBase64` SSRF behavior — IPv4/IPv6/IPv4-mapped/IPv4-compat/link-local/ULA/CGNAT/metadata blocks. Refactor must not weaken any case. |
| `services/__tests__/masters-tenant-boundary.spec.ts` | `MastersService.create` re-reads with `{ id, companyId }` inside the same transaction; bare-id `findUniqueOrThrow` is forbidden. |
| `__tests__/product-catalog.service.spec.ts` | Catalog list mapping (representativeSku, priceRange, costRange, totalAvailableStock incl. bundle vs option stock) + nested option tenant scope on detail. |
| `__tests__/masters.service.pg.integration.spec.ts` | Real-Postgres tenant isolation: cross-tenant list/findByCode/update/updateImages/restore P2002 + supplier cross-tenant. |
| `__tests__/pagination.pg.integration.spec.ts` | `(createdAt DESC, id DESC)` cursor stability under mid-iteration soft-delete. |
| `services/__tests__/product-image-normalizer.spec.ts` | Pure read-path normalizer behavior (kept where it is — `services/product-image-normalizer.ts` is already focused). |

### No new tests added

Per [`docs/TESTING.md`](../../TESTING.md), file moves and pure helper
extraction without behavior change do not justify new mock-interaction tests.
The existing public-behavior + integration suite already covers SSRF,
tenant isolation, race-free cursor pagination, and catalog mapping.

### No tests deleted

Implementation-detail tests are not present in this lane — the existing
suite is public-behavior or integration-grade. Nothing to collapse.

## Verification gates (Phase 3B per-PR)

```bash
npm run check:shared-root-imports
npm run check:idor
npm run check:tenant-scope

cd apps/server && npx vitest run \
  src/products/services/__tests__/masters-ssrf.spec.ts \
  src/products/services/__tests__/masters-tenant-boundary.spec.ts \
  src/products/__tests__/product-catalog.service.spec.ts \
  src/products/__tests__/pagination.pg.integration.spec.ts

cd apps/server && npx vitest run src/products

npm run build --workspace=apps/server
npm run dev:server
git diff --check
```

## Measurable LOC improvement (target)

| File | Before | After (target) |
|---|---|---|
| `services/masters.service.ts` | 564 | ≤ 430 |
| `services/product-catalog.service.ts` | 260 | ≤ 90 |

The actual numbers and exact file LOC for each new module are recorded in
the PR description.

## Out of scope

- `OptionsService`, `BundleComponentsService`, `BundleStockService`,
  `MasterCodeService` — separate lanes if/when they need the same surgery.
- Persistence layer for image rows (`createImageRowsTx` / `replaceImagesTx`
  remain on `MastersService` because this lane is read-layer scoped).
- Schema changes, Zod schema changes, controller route changes — none.
- Frontend, shared, prisma — untouched.
