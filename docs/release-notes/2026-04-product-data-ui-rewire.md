# 2026-04 Product Data UI Rewire (W1)

## What changed

### Shared image contract (canonical)
- `packages/shared/src/schemas/product.ts` — `MasterImageRoleSchema` is now a
  `z.enum(['box','product','color_variant','size_chart','detail'])`. `MasterImageItem.role` is
  typed against it and `label` widens to `string | null`.
- New envelope schemas for the master-image endpoints:
  `GetMasterImagesResponseSchema`, `UpdateMasterImagesRequestSchema`,
  `UploadMasterImageResponseSchema`. Deprecated `ProductImage*` aliases stay live for now.
- `apps/web/src/lib/hub-roles.ts` re-exports `MasterImageRole` from `@kiditem/shared` so the
  web hub role type derives from the canonical enum.

### Server (master-image endpoints)
- `MastersController` adds `@Get(':id/images')` and `@Patch(':id/images')`.
  `@Post(':id/images/upload')` now returns `{ image: MasterImageItem }` so the client can
  stage the uploaded row without a second lookup.
- `MastersService.getImages()` wraps `findById + normalizeMasterImages` for the read path;
  `uploadImage` synthesizes a canonical `MasterImageItem` shell (role=`product`, label=null,
  sortOrder=0) without appending to `MasterProduct.images` — the PATCH endpoint owns the
  final list.
- `product-image-normalizer` coerces unknown legacy roles to the default `product` instead of
  producing off-enum `role: ''` rows. Read-path lenience is explicit so legacy rows don't
  brick listing reads.
- New `UpdateMasterImagesDto` (class-validator) enforces the image list shape with
  `@ValidateNested` + `ArrayMaxSize(50)`.

### Web
- `useProductImages` rewritten on React Query + `apiClient.getParsed` / `patchParsed` /
  `uploadParsed`. Errors surface through `error` / `uploadError` / `saveError`; the hook no
  longer collapses to `setImages([])` silently.
- `/api/products/masters/:id/images` is the canonical read; save = `PATCH .../images` with
  `{ items }`; upload returns `{ image: MasterImageItem }`. Query key:
  `queryKeys.products.images(masterId)`.
- `apiClient` gains `patchParsed<T>` and `uploadParsed<T>` helpers that mirror `getParsed`
  for schema drift detection on write/multipart paths.
- `image-hub/page.tsx` switched from the legacy `/api/products/:id` alias to the canonical
  `/api/products/masters/:id` via `apiClient.getParsed(MasterSchema, ...)` and now owns a
  local `draft` state that only syncs from the server truth while the user has no unsaved
  edits.
- `thumbnail-editor/page.tsx` master-context fetch moved to `/api/products/masters/:id` with
  `MasterSchema` parsing.

## Why the plan shrank mid-execution

W1 was written against the pre-PR-#42 state. `T0` baseline found that PR #42
(product-contract-rewire) already:
- exported structured `MasterImageItem` (aliased as `ProductImageItem`)
- removed the phantom `ProductListItem` / `PipelineCounts` imports from `products/page.tsx`
- migrated the product list + selector to the `/api/products/catalog` read model
- built `ProductsLegacyController` with the `:id`, `:id/original-image-base64`, list, delete,
  pipeline-stats delegation

W1's effective work narrowed to:
1. role enum + label nullability (T1)
2. the `GET /images` + `PATCH /images` endpoints and DTO tightening (T2)
3. the React Query rewrite of `useProductImages` with error propagation (T3)
4. wiring `image-hub` and `thumbnail-editor` to the canonical routes and the new hook shape
   (T4/T6)

`T5a` / `T5b` were verification-only under the new baseline.

## Known degradations

- None in W1-scoped code paths.
- Ad-ops legacy `/api/products` consumers (`StrategyContent`, `StockAssets`, `OrderMatching`,
  `Categories`, `CleanupProducts`, `CoreProducts`) are still on the legacy alias. W5
  (`ad-ops-rewire`) owns their migration.
- `apps/web/src/app/reports/page.tsx` still calls `/api/products` — deferred to a successor plan.

## Not migrated yet

- `apps/web/src/app/thumbnail-editor/hooks/useOriginalImage.ts` stays on the legacy alias
  path (`/api/products/:id/original-image-base64`). The server delegates to
  `MastersService.originalImageBase64`, so runtime behavior is unchanged; a canonical
  `/masters/:id/original-image-base64` controller route is a small additive follow-up.

## DB impact

- None. No Prisma schema changes. No migration. `MasterProduct.images` type was already
  structured after PR #42.

## Legacy bookmark behavior

- `/api/products/:id` still works via `ProductsLegacyController` (sourcing depends on it).
  The new `/api/products/masters/:id` is the canonical route; both return the same
  normalized master shape.

## Verification

- `npx vitest run packages/shared/src/schemas/product.spec.ts` — PASS (13 / 0)
- `cd packages/shared && npm run build` — PASS
- `cd apps/server && npx vitest run src/products` — PASS (61 / 0)
- `npm run build --workspace=apps/server` — exit 0
- `cd apps/web && npx vitest run src/hooks/__tests__/useProductImages.test.ts` — PASS (6 / 0)
- `npx tsc --noEmit` in apps/web — 0 W1-domain errors. Only pre-existing sourcing
  `@kiditem/templates` errors remain (out of scope per T0).
- `npm run dev:server` — NestJS boots and `RouterExplorer` logs `/masters/:id/images` (GET,
  PATCH) plus the re-shaped `/images/upload` mapping.

## Out of scope

- Ad-ops legacy `/api/products` consumers (`W5 ad-ops-rewire`)
- Reports page `/api/products` legacy call (post-W1 successor)
- `useOriginalImage` canonical route (small follow-up)
- Sourcing `@kiditem/templates` build issue (independent of W1)
