# Plan W1 — Product Data UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:writing-plans` for edits to this plan, then `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore product-facing frontend after the 3-layer product schema migration. This plan fixes **both**: (a) the `ProductImageItem` compile blocker, and (b) the broader runtime 404 state where frontend calls `/api/products/:id` / `/api/products?search=...` / `/api/products/pipeline-stats` but the server only serves `/api/products/masters/...`. Scope covers products page, product selector, image hub, thumbnail-editor image consumers, `useProductImages` hook, and the `generate` page.

**Architecture:** `products` is the owner business domain. Same-domain cross-layer edits are allowed under ADR-0019: `packages/shared` product schemas, `apps/server/src/products` contract gaps (including new image endpoints), and direct web consumers under `apps/web`. Sourcing domain calls to `/api/products/:id` are currently broken at runtime — W1 adds a **temporary legacy alias controller** under `apps/server/src/products` so sourcing keeps working, but does **not** rewrite sourcing's own code. The sourcing cleanup belongs to a future plan. Do not touch inventory, orders, ad-ops, or thumbnail generation flows.

**Tech Stack:** Next.js 16, React Query, `apiClient.getParsed`, shared Zod schemas in `@kiditem/shared`, NestJS products module, Prisma `MasterProduct.images Json?`.

**Predecessors:** Plan R0 (`2026-04-23-plan-r0-post-f1-successor-roadmap.md`), historical Plan D.4 spec (`2026-04-20-plan-d-frontend-rewire-design.md`)

**Successor:** `W2 inventory-ui`, then `W3 orders-ui`

---

## Why W1 Exists

The canonical R0 roadmap originally had `W1 products-frontend-rewire`, but historical Plan D also listed `image-hub`, `thumbnail-editor`, and `hooks/useProductImages` under the small-domain D.4 frontend debt. That image-management debt was omitted from the post-F1 successor map.

After ad-ops quarantine, `npm run build --workspace=apps/web` advances to the next product-image compile blocker:

```text
apps/web/src/app/image-hub/components/ImageGrid.tsx:5
Module '"@kiditem/shared"' has no exported member 'ProductImageItem'.
```

But the compile blocker is **only the surface symptom**. The full product-data frontend is runtime-broken because **all** legacy `/api/products` (no prefix) endpoints were deleted when the 3-layer product schema migration shipped. The 3-reviewer adversarial review of the v1 plan confirmed (file:line evidence verified against current `main`):

- `useProductImages.ts:17,35,72` — GET/upload/PATCH all call `/api/products/${productId}` — endpoint does not exist
- `ProductSelector.tsx:46` — calls `/api/products?search=...&limit=10` — endpoint does not exist
- `products/page.tsx:60,72` — calls `/api/products?${params}` and `/api/products/pipeline-stats` — neither exists
- `image-hub/page.tsx:34` — calls `/api/products/${initialProductId}` — does not exist
- `thumbnail-editor/page.tsx:38` — calls `/api/products/${productId}` — does not exist
- `sourcing/lib/sourcing-api.ts:94,116,144` — calls `/api/products/${id}` and `/api/products/sample` — do not exist
- Phantom imports: `packages/shared` never exports `ProductListItem` or `PipelineCounts`, but `products/page.tsx:15`, `ProductFilterBar.tsx:4`, `ProductListItem.tsx:5`, `ProductListTable.tsx:4` import them

W1 repairs all product-owned consumers and installs a legacy alias so sourcing continues working until its own plan runs.

## Source-of-truth Evidence

- Roadmap: `docs/superpowers/plans/2026-04-23-plan-r0-post-f1-successor-roadmap.md`
- Historical D.4 scope: `docs/superpowers/specs/2026-04-20-plan-d-frontend-rewire-design.md`
- Session boundary ADR: `.claude/docs/decisions/0019-business-domain-scoped-session-boundary.md`
- Products backend contract: `apps/server/src/products/CLAUDE.md`
- Web frontend rules: `apps/web/AGENTS.md`
- Shared schema rules: `packages/shared/AGENTS.md`
- Current product server routes:
  - `apps/server/src/products/controllers/masters.controller.ts` — `@Controller('products/masters')`
  - `apps/server/src/products/controllers/options.controller.ts` — `@Controller('products/options')`
  - `apps/server/src/products/controllers/bundle-components.controller.ts` — `@Controller('products/bundle-components')`
- Current web legacy consumers:
  - `apps/web/src/app/products/page.tsx` + `apps/web/src/app/products/components/{ProductListItem,ProductListTable,ProductFilterBar,ProductPageHeader,ProductPipeline,AddProductModal,ExcelUploadModal}.tsx`
  - `apps/web/src/components/product/ProductSelector.tsx`
  - `apps/web/src/app/image-hub/page.tsx` + `components/ImageGrid.tsx`
  - `apps/web/src/hooks/useProductImages.ts`
  - `apps/web/src/app/thumbnail-editor/page.tsx` + `components/HubInlinePicker.tsx` + `components/EditorInputPanel.tsx`
  - `apps/web/src/app/generate/page.tsx` — consumes `useProductImages(productId)` at line 34
- Prisma model: `prisma/models/core.prisma:171` — `images Json? @default("[]")`

## Locked Decisions

1. `MasterProduct` is the canonical product-family entity. W1 must not resurrect the old Prisma `Product` model or old `/api/products` semantics — **except** through the explicit legacy alias controller defined in Decision #9.
2. In W1 web code, product identity means `masterId` even if legacy component names still say `productId`.
3. New product image endpoints live under `/api/products/masters/:id/...` to avoid ambiguity with existing `/api/products/masters` collection routes.
4. Product images use a structured wire format: `{ url, role, label, sortOrder }`. Existing `MasterProduct.images` JSON may contain legacy `string[]`; the server normalizes it at read time before shared-schema parsing. Write path stores structured items only.
5. `ProductImageItem` belongs in `packages/shared/src/schemas/product.ts`, not `thumbnails.ts`. It is product master image metadata; `schemas/thumbnails.ts` remains generation/analysis metadata (ComplianceScoresSchema, ThumbnailGenerationItemSchema, ThumbnailAnalysisResultSchema).
6. `useProductImages` moves from `useState + useEffect + apiClient.get<T>` to React Query + shared schema parsing via `apiClient.getParsed`.
7. W1 must not re-enable `ad-ops`. The quarantine remains until `W5`.
8. W1 does not fake unavailable sales/traffic metrics on the products page. If the canonical product endpoint does not provide a metric, the UI column is removed and documented in the release note as known degradation. No silent stubs.
9. **API URL migration strategy (legacy alias)**: W1 adds a thin legacy-compat `@Controller('products')` in `apps/server/src/products/controllers/products-legacy.controller.ts` serving:
   - `GET /api/products/:id` — forwards to `MastersService.findById(id)`
   - `DELETE /api/products/:id` — forwards to `MastersService.remove(id)`
   - `POST /api/products/sample` — returns the existing sample-creation behavior (keep current semantics; if current code does not have this, stub with 501 Not Implemented and note in release)
   - `GET /api/products?search=...&limit=...` — forwards to `MastersService.list({ search, limit })`
   - `GET /api/products?page=...&pageSize=...` — forwards to `MastersService.list({ page, pageSize })` with `{ items, total }` offset-style envelope
   - `GET /api/products/pipeline-stats` — returns `{ gradeA, gradeB, gradeC, minus, low, gradeRevA, gradeAdA }` computed from `MastersService.aggregatePipelineCounts({ companyId })` (new thin aggregator)

   Purpose: keep `sourcing` and other non-W1 consumers working without cross-domain code changes. Sourcing migration to `/api/products/masters/:id` belongs to a separate plan. Mark the legacy controller class with a JSDoc `@deprecated` tag naming the successor plan.
10. **`MasterSchema.images` field type**: change `z.array(z.string().url()).nullable()` to `z.array(ProductImageItemSchema).nullable()`. Legacy `string[]` DB data is normalized at the service boundary before `MasterSchema.parse()` — shared schema is structured-only. The service-level normalizer lives in `apps/server/src/products/services/product-image-normalizer.ts` and is exported for test coverage.
11. **Single-writer policy for `MasterProduct.images`**: `MastersService` is the sole writer. Sourcing's `sourcing.service.ts:78` `masterProduct.update({ images: ... })` call remains in place for now (out of W1 scope), but W1 leaves a short code comment on that line referencing this decision and the successor plan. Any new image write path must route through `MastersService`.
12. **`hub-roles.ts` derives from shared schema**: `apps/web/src/lib/hub-roles.ts` re-exports `ProductImageRole` type from `@kiditem/shared` after T1. `HUB_ROLE_CONFIG` stays web-only (it holds UI labels), but its `role` values are typed as the shared union so drift is compile-caught.

## File Map

### Shared

- `packages/shared/src/schemas/product.ts` — add `ProductImageRoleSchema`, `ProductImageItemSchema`, product-image read/write request/response schemas. Modify `MasterSchema.images` to structured type (Decision #10).
- `packages/shared/src/schemas/index.ts` — re-export new schemas
- `packages/shared/src/index.ts` — re-export new types (`ProductImageItem`, `ProductImageRole`, image request/response types)
- `packages/shared/src/schemas/product.spec.ts` — new file. Cover structured parse, legacy `string[]` rejection (normalization is server-side), role validation, invalid role rejection.

### Server Products

- `apps/server/src/products/controllers/masters.controller.ts` — add `GET /:id/images`, `PATCH /:id/images`, `POST /:id/images/upload`
- `apps/server/src/products/controllers/products-legacy.controller.ts` — **new file**. Legacy alias controller per Decision #9.
- `apps/server/src/products/services/masters.service.ts` — add `getImages(id, companyId)`, `updateImages(id, companyId, items)`, `uploadImage(id, companyId, file)`, `aggregatePipelineCounts({ companyId })`. Ensure `findById` applies the image-normalizer before returning.
- `apps/server/src/products/services/product-image-normalizer.ts` — **new file**. `normalizeImages(raw: unknown): ProductImageItem[]` — handles legacy `string[]`, structured, null, unexpected shapes.
- `apps/server/src/products/services/__tests__/product-image-normalizer.spec.ts` — **new file**. Unit tests for the normalizer.
- `apps/server/src/products/dto/update-master-images.dto.ts` — **new file**. Validates `items: ProductImageItem[]` using class-validator.
- `apps/server/src/products/products.module.ts` — register new controller and dependencies
- `apps/server/src/products/__tests__/masters.service.pg.integration.spec.ts` — add image-endpoint coverage (create → set images → get → patch images → get normalized → upload flow if feasible)
- `apps/server/src/products/__tests__/products.module.di.spec.ts` — keep as DI boot sanity check (new controller must not break DI)
- `apps/server/src/products/__tests__/products-legacy.controller.pg.integration.spec.ts` — **new file**. Covers legacy alias forwarding for `GET /api/products/:id`, `/api/products?search=`, `/api/products/pipeline-stats`.

### Web Product Data (T5 scope — product listing page)

- `apps/web/src/app/products/page.tsx`
- `apps/web/src/app/products/components/ProductListItem.tsx`
- `apps/web/src/app/products/components/ProductListTable.tsx`
- `apps/web/src/app/products/components/ProductFilterBar.tsx`
- `apps/web/src/app/products/components/ProductPageHeader.tsx` — touch only if compile errors force it
- `apps/web/src/app/products/components/ProductPipeline.tsx` — touch only if compile errors force it
- `apps/web/src/app/products/components/AddProductModal.tsx` — migrate `POST /api/products` to `POST /api/products/masters` and stop sending `companyId` from the browser
- `apps/web/src/app/products/components/ExcelUploadModal.tsx` — touch only if compile errors force it
- `apps/web/src/components/product/ProductSelector.tsx`
- `apps/web/src/lib/query-keys.ts`

### Web Image Management (T3/T4/T6 scope)

- `apps/web/src/hooks/useProductImages.ts`
- `apps/web/src/hooks/__tests__/useProductImages.test.ts`
- `apps/web/src/app/image-hub/page.tsx`
- `apps/web/src/app/image-hub/components/ImageGrid.tsx`
- `apps/web/src/app/thumbnail-editor/page.tsx`
- `apps/web/src/app/thumbnail-editor/components/HubInlinePicker.tsx`
- `apps/web/src/app/thumbnail-editor/components/EditorInputPanel.tsx`
- `apps/web/src/app/generate/page.tsx` — consumes `useProductImages(productId)` at line 34. Must rebuild clean after hook rewrite.
- `apps/web/src/lib/hub-roles.ts` — `ProductImageRole` type re-exports from shared (Decision #12)

## Out of Scope

- `ad-ops` rewire or quarantine removal — owned by `W5`
- Inventory page contract work — `W2`
- Orders page contract work — `W3`
- Root dashboard `/api/action-tasks` or `/api/agent-registry/org` — `W6`
- Thumbnail generation status lifecycle changes
- Sourcing service code (`apps/server/src/sourcing/**`) and sourcing frontend (`apps/web/src/app/sourcing/**`) rework. W1 installs the legacy alias controller so sourcing keeps calling `/api/products/:id`; sourcing's own migration belongs to a separate plan.
- New Prisma schema migration. The `images Json?` column stays; only the Zod schema shape and the JSON payload structure change.
- Image upload infrastructure changes: S3 path, CDN configuration, file size/type limits, format conversion, or thumbnail resizing. Use the existing `apiClient.upload()` + server-side upload handling as-is.
- Legacy `Product` model deep-link compatibility. Old bookmarks of `/thumbnail-editor?productId=<legacy-uuid>` are expected to 404 against masters; this is known degradation (the `Product` model was already removed). If a deep link's uuid happens to collide with a valid `MasterProduct.id`, that is coincidental.
- Sourcing write-path to `MasterProduct.images` (`sourcing.service.ts:78`). Single-writer policy is documented in Decision #11 but enforcement is a follow-up plan.

## Tasks

- [ ] **T0: Baseline the current product-data error and runtime surface**

Run:

```bash
npm run build --workspace=apps/web
(cd apps/web && npx tsc --noEmit --pretty false) || true
```

Record:
- First repo-wide failing file/line (expected: `ImageGrid.tsx:5` or earlier phantom import from products/)
- Total product-data compile error count by file
- Ad-ops error count (expected: still quarantined, does not appear)

Then inventory the runtime 404 surface (grep, do not actually hit the server):

```bash
rg -n "api/products" apps/web/src --glob '!*.test.*' --glob '!*.spec.*'
```

Record every call site that hits `/api/products` (without `masters/`, `options/`, `bundle-components/` prefix). Expected set at time of writing:

- `apps/web/src/hooks/useProductImages.ts:17,35,72`
- `apps/web/src/components/product/ProductSelector.tsx:46`
- `apps/web/src/app/products/page.tsx:60,72`
- `apps/web/src/app/image-hub/page.tsx:34`
- `apps/web/src/app/thumbnail-editor/page.tsx:38`
- `apps/web/src/app/generate/page.tsx` (via `useProductImages`)
- `apps/web/src/app/sourcing/lib/sourcing-api.ts:94,116,144` (out of W1 scope but must be covered by the legacy alias)

Save both the compile baseline and the runtime 404 inventory into the plan's implementation notes at T8.

- [ ] **T1: Add shared product image schemas and retype `MasterSchema.images`**

Update `packages/shared/src/schemas/product.ts`:

- Add `ProductImageRoleSchema = z.enum(['box', 'product', 'color_variant', 'size_chart', 'detail'])` — the values match `apps/web/src/lib/hub-roles.ts` `HUB_ROLE_CONFIG`.
- Add `ProductImageItemSchema = z.object({ url: z.string().url(), role: ProductImageRoleSchema, label: z.string().nullable(), sortOrder: z.number().int().nonnegative() })`.
- Add request/response schemas: `GetProductImagesResponseSchema = z.object({ images: z.array(ProductImageItemSchema) })`, `UpdateProductImagesRequestSchema = z.object({ items: z.array(ProductImageItemSchema) })`, `UploadProductImageResponseSchema = z.object({ image: ProductImageItemSchema })`.
- Modify `MasterSchema.images` from `z.array(z.string().url()).nullable()` to `z.array(ProductImageItemSchema).nullable()`. This is the cascade change from Decision #10.
- Add a lightweight selector item schema if useful: `ProductSelectorItemSchema = MasterSchema.pick({ id: true, code: true, name: true, thumbnailUrl: true, imageUrl: true })` (or equivalent minimal subset).

Update `packages/shared/src/schemas/index.ts` and `packages/shared/src/index.ts` to re-export every new schema/type.

Create `packages/shared/src/schemas/product.spec.ts` covering:
- structured `ProductImageItem` parse succeeds
- `MasterSchema.parse` with structured images succeeds
- `MasterSchema.parse` with legacy `string[]` images **fails** (normalization is server-side, schema is strict)
- unknown role value rejected
- negative `sortOrder` rejected

Run:

```bash
npx vitest run packages/shared/src/schemas/product.spec.ts
(cd packages/shared && npm run build)
```

Update `apps/web/src/lib/hub-roles.ts` to re-export `ProductImageRole` from `@kiditem/shared` so the web role type derives from the shared union (Decision #12). Keep `HUB_ROLE_CONFIG` local but annotate its role fields with the shared type so drift is compile-caught.

- [ ] **T2: Add canonical image endpoints and legacy alias controller**

Server changes:

Create `apps/server/src/products/services/product-image-normalizer.ts`:
- `export function normalizeImages(raw: unknown): ProductImageItem[]`
- Accept `null | undefined | []` → `[]`
- Accept `string[]` (legacy) → synthesize `{ url: s, role: 'product', label: null, sortOrder: i }` for each `s` with index `i`
- Accept structured array matching the shared schema → pass through after parse
- Reject unexpected shapes with a precise error (log + return `[]` is **not** acceptable — throw)

Create `apps/server/src/products/services/__tests__/product-image-normalizer.spec.ts` with cases for each input shape.

Update `apps/server/src/products/services/masters.service.ts`:
- `findById(id, companyId)` wraps the Prisma read and applies `normalizeImages` before returning
- `getImages(id, companyId): Promise<ProductImageItem[]>`
- `updateImages(id, companyId, items: ProductImageItem[]): Promise<ProductImageItem[]>` — validates company scope, writes structured JSON back to `images` column
- `uploadImage(id, companyId, file): Promise<ProductImageItem>` — uses whatever upload mechanism `MastersService.create/update` currently uses; returns the stored image with url + default role='product' (consumer then PATCH to set role/label via `updateImages`)
- `aggregatePipelineCounts({ companyId }): Promise<PipelineCounts>` — thin aggregator computing `{ gradeA, gradeB, gradeC, minus, low, gradeRevA, gradeAdA }` from existing `MasterProduct` rows scoped by company. Shape must match whatever `products/page.tsx` expects at the time of migration.

Update `apps/server/src/products/controllers/masters.controller.ts`:
- `@Get(':id/images')` → `{ images: ProductImageItem[] }`
- `@Patch(':id/images')` with `UpdateProductImagesRequestDto` body → `{ images: ProductImageItem[] }` (returns updated list)
- `@Post(':id/images/upload')` with `@UseInterceptors(FileInterceptor('file'))` → `{ image: ProductImageItem }`

All three routes scope by `@CurrentCompanyId()` — never trust client-sent companyId.

Create `apps/server/src/products/dto/update-master-images.dto.ts` with class-validator decorators matching `UpdateProductImagesRequestSchema`.

Create `apps/server/src/products/controllers/products-legacy.controller.ts` (Decision #9):
- `@Controller('products')` — JSDoc `@deprecated` with "sourcing migration belongs to successor plan"
- `@Get(':id')` → `MastersService.findById(id, companyId)` with shared `MasterSchema.parse(satisfies Master)` response
- `@Delete(':id')` → `MastersService.remove(id, companyId)` returning `{ ok: true }`
- `@Get()` with query `{ search?, limit?, page?, pageSize? }` → `MastersService.list(...)` wrapped in `{ items, total }` envelope (sourcing + legacy products page expect offset-style, not cursor)
- `@Get('pipeline-stats')` → `MastersService.aggregatePipelineCounts({ companyId })`
- `@Post('sample')` → if existing sourcing flow has a sample-create, forward; otherwise respond 501 with `{ message: 'Sample product creation is pending successor plan' }` and log a warning. Do not crash.

Update `apps/server/src/products/products.module.ts`:
- Register `MastersController`, `OptionsController`, `BundleComponentsController`, **new** `ProductsLegacyController`
- Register `MastersService`, **new** `normalizeImages` (as pure function, no DI needed; or as provider if other services will consume — keep it simple and co-locate)
- Multer / FileInterceptor setup if not already present — **verify DI boot** after this change

Verification (always run, regardless of what changed):

```bash
(cd apps/server && npx vitest run src/products)
npm run dev:server
```

`dev:server` must boot to "Nest application successfully started" without DI errors. If boot fails, fix DI wiring before proceeding.

- [ ] **T3: Rewrite `useProductImages` against canonical endpoints**

Consumers of `useProductImages` that must keep working after this rewrite:

- `apps/web/src/app/image-hub/page.tsx` (T4 target)
- `apps/web/src/app/thumbnail-editor/page.tsx` (T6 target)
- `apps/web/src/app/generate/page.tsx` (T6 target — do not forget this consumer)

Update `apps/web/src/hooks/useProductImages.ts`:
- Replace `useState + useEffect + apiClient.get<T>` with React Query (`useQuery` + `useMutation`)
- `apiClient.getParsed(GetProductImagesResponseSchema)` against `GET /api/products/masters/:id/images`
- Upload via `apiClient.upload(`/api/products/masters/${masterId}/images/upload`, file)` with `UploadProductImageResponseSchema` parsing
- Save via `apiClient.patchParsed(GetProductImagesResponseSchema, `/api/products/masters/${masterId}/images`, { items })`
- Keep the public API shape (`{ images, loading, saving, uploadFile, saveImages, setImages }`) or rename deliberately and update all three consumers in T4/T6 — choose one and document.
- On error: surface error state to the caller (observable), never fall back to `setImages([])`.
- Use `apps/web/src/lib/query-keys.ts` for the query key under `productImages(masterId)`.

Update `apps/web/src/hooks/__tests__/useProductImages.test.ts`:
- Keep existing structure; replace endpoint URLs and response shapes to match T2's new contract.
- Add a test for error propagation (no silent empty fallback).

Run:

```bash
(cd apps/web && npx vitest run src/hooks/__tests__/useProductImages.test.ts)
```

- [ ] **T4: Rewire image-hub to shared schemas**

Update `apps/web/src/app/image-hub/page.tsx` and `apps/web/src/app/image-hub/components/ImageGrid.tsx`:
- Import `ProductImageItem`, `ProductImageRole` from `@kiditem/shared` (now exists after T1)
- Fetch selected master via `apiClient.getParsed(MasterSchema, `/api/products/masters/${masterId}`)` (no legacy `/api/products/:id`)
- Use `useProductImages` from T3
- Preserve dirty-state behavior and save flow
- When editing touched blocks, replace hard-coded legacy color classes with semantic DESIGN.md tokens
- Deep-link `/thumbnail-editor?productId=...` still carries master id — keep working

Add focused RTL coverage if trivial:
- Load selected product from URL param
- Upload image appends with default role
- Save patches structured images

Run:

```bash
(cd apps/web && npx vitest run src/app/image-hub)
```

(only if tests exist; if not, defer to T7 build verification)

- [ ] **T5a: Build the legacy → canonical API migration map for products page + selector**

This is a docs-only sub-task. Create a table inside this plan's T8 implementation notes mapping every legacy call to its canonical counterpart or legacy-alias target:

| Call site | Legacy path | Strategy | Target path |
|---|---|---|---|
| `ProductSelector.tsx:46` | `GET /api/products?search=&limit=` | migrate | `GET /api/products/masters?search=&limit=` (cursor envelope) |
| `products/page.tsx:60` | `GET /api/products?params` | migrate | `GET /api/products/masters?params` OR keep on legacy alias (choose based on envelope compatibility) |
| `products/page.tsx:72` | `GET /api/products/pipeline-stats` | legacy alias | `GET /api/products/pipeline-stats` (alias forwards to `aggregatePipelineCounts`) |
| `AddProductModal.tsx:25` | `POST /api/products` | migrate | `POST /api/products/masters` |
| `products/page.tsx` delete | `DELETE /api/products/:id` | legacy alias | `DELETE /api/products/:id` (alias forwards) |

Lock the decision per row. The recommended default: **migrate** all product-owned consumers (products page + selector + image/thumbnail consumers) directly to `/api/products/masters/...`, use the legacy alias **only** for sourcing and any compile-clean consumer W1 does not touch.

- [ ] **T5b: Rewire products page + product selector**

Update `ProductSelector` (`apps/web/src/components/product/ProductSelector.tsx`):
- Search via `apiClient.getParsed(PaginatedResponseSchema(MasterSchema), `/api/products/masters?search=${q}&limit=10`)` (or whatever cursor envelope applies)
- Return `{ id, name, imageUrl, sku }`-compatible shape. `sku` is aliased from `Master.code` inside an adapter function inside this component or a colocated helper. Document the alias.
- Parse responses with shared schemas; no `apiClient.get<T>` shadow typing.

Update `apps/web/src/app/products/page.tsx`:
- Remove `import type { ProductListItem as Product, PipelineCounts } from "@kiditem/shared"` (both types are phantom). Replace with derived types from the shared `MasterSchema` and a new locally-defined `PipelineCounts` type that matches the aliased `/api/products/pipeline-stats` response from T2.
- Fetch list via `apiClient.getParsed` against `/api/products/masters?...`. Handle both cursor and offset envelopes per T5a decision.
- Fetch pipeline stats via `apiClient.getParsed(PipelineCountsSchema, '/api/products/pipeline-stats')` through the legacy alias.
- Map `MasterProduct` fields deliberately: `id`, `code`, `name`, `category`, `thumbnailUrl`, `imageUrl`, `abcGrade`, `healthScore`, `pipelineStep`.
- **Remove UI columns that require unavailable metrics** (방문자/조회/장바구니/주문/판매량/매출) unless a canonical endpoint surfaces them. Enumerate removed columns in T8 release note as known degradation. Do not stub zeros.
- Keep ABC grade / pipeline cards **only if** the aliased `/api/products/pipeline-stats` returns matching fields.
- Update create flow (`AddProductModal.tsx`): `POST /api/products/masters` using shared `CreateMasterDto` wire shape; do not send `companyId` from the browser.

Also rewire the components that phantom-import types:
- `apps/web/src/app/products/components/ProductListItem.tsx:5` — replace `ProductListItem` import
- `apps/web/src/app/products/components/ProductListTable.tsx:4` — replace `ProductListItem` import
- `apps/web/src/app/products/components/ProductFilterBar.tsx:4` — replace `PipelineCounts` import

Update `apps/web/src/lib/query-keys.ts` for any new product-related query keys.

Run focused web tests only if they exist; otherwise rely on T7 build + manual smoke.

- [ ] **T6: Align thumbnail-editor and generate consumers**

Update:
- `apps/web/src/app/thumbnail-editor/page.tsx`
- `apps/web/src/app/thumbnail-editor/components/HubInlinePicker.tsx`
- `apps/web/src/app/thumbnail-editor/components/EditorInputPanel.tsx`
- **`apps/web/src/app/generate/page.tsx`** ← do not forget

Requirements:
- Keep existing generation UX unchanged
- Keep `productId` URL parameter name; its value now means `masterId`
- Fetch master via `apiClient.getParsed(MasterSchema, `/api/products/masters/${id}`)` (not legacy `/api/products/:id`)
- Consume the updated `useProductImages` result — if T3 renamed any return keys, update here
- Preserve role-slot mapping from `apps/web/src/lib/hub-roles.ts`

Do not change thumbnail generation workflow status semantics in W1.

- [ ] **T7: Verification (unconditional)**

Always run — regardless of which tasks landed:

```bash
# Shared build + tests
npx vitest run packages/shared/src/schemas/product.spec.ts
(cd packages/shared && npm run build)

# Server products tests + DI boot (unconditional because T2 adds controllers/providers)
(cd apps/server && npx vitest run src/products)
npm run dev:server &
DEVPID=$!
# Give it 30s to reach "Nest application successfully started" — if not, fail
sleep 30
kill $DEVPID 2>/dev/null || true

# Web tests
(cd apps/web && npx vitest run src/hooks/__tests__/useProductImages.test.ts)

# Repo-wide frontend build gate
npm run build --workspace=apps/web
```

Expected result:
- No `ProductImageItem` export error from `@kiditem/shared`
- No `ProductListItem` / `PipelineCounts` phantom import error
- No product-data compile errors in products/image-hub/thumbnail-editor/generate
- `dev:server` boots without DI error
- Ad-ops still quarantined, does not appear in tsc error surface
- Any remaining web-build error is outside W1 scope — document its first failing file in T8

Runtime smoke (manual, not automated in this plan — qa-verifier handles it):
- Open `/products` in dev — list loads, search works, pagination works
- Open `/image-hub?productId=<valid-master-id>` — images load, upload appends, save persists
- Open `/thumbnail-editor?productId=<valid-master-id>` — hub picker shows images
- Open `/generate?productId=<valid-master-id>` — product context loads

- [ ] **T8: Documentation and handoff**

Create `docs/release-notes/2026-04-product-data-ui-rewire.md`:
- Summary of what migrated (canonical paths) and what stayed on alias (sourcing)
- Known degradations: removed products page columns (list explicitly) with "owned by follow-up analytics plan"
- DB impact: none (no Prisma migration)
- Legacy Product bookmark 404: known behavior, stated explicitly

Update this plan's implementation notes section with:
- Files changed (git diff summary)
- Whether all image endpoints were added and which legacy alias routes went live
- T0 baseline and T7 final error counts
- Runtime smoke results
- Remaining non-W1 frontend blockers with first failing file, if any

## Review Checklist

- [ ] No old Prisma `Product` model assumptions reintroduced
- [ ] Browser never sends or trusts `companyId`
- [ ] Product image wire format is structured (`{ url, role, label, sortOrder }`) everywhere
- [ ] `MasterProduct.images` legacy `string[]` data normalized at the service boundary without loss
- [ ] Product selector uses canonical `/api/products/masters` route
- [ ] Products page no longer depends on missing `ProductListItem` / `PipelineCounts` phantom imports
- [ ] Thumbnail-editor behavior is unchanged except for the product image data boundary
- [ ] **`generate/page.tsx` builds clean after hook rewrite** ← added from review
- [ ] **`npm run dev:server` boots without DI errors** ← upgraded from conditional to mandatory
- [ ] **Legacy `/api/products/:id` alias serves sourcing without exceptions** (integration test)
- [ ] **`hub-roles.ts` `ProductImageRole` derives from shared; drift caught at compile**
- [ ] **Normalizer spec covers: null, `string[]`, structured, unexpected shape throws**
- [ ] **Release note lists every removed products-page UI column** as known degradation
- [ ] `npm run build --workspace=apps/web` either passes or fails on a documented non-W1 blocker

## Implementation Order Recommendation

Two lanes, with explicit dependencies:

**Shared/server lane (sequential):**
1. T1 (shared schemas + hub-roles re-export)
2. T2 (server endpoints + legacy alias + normalizer)
3. Server verification (`(cd apps/server && npx vitest run src/products)` + `npm run dev:server`)

**Web lane (after shared build is available; can parallelize T3+T4 with T5 if two implementers):**
1. T3 (`useProductImages` rewrite)
2. T4 (image-hub) — depends on T3
3. T5a + T5b (products page + selector) — independent of T3/T4
4. T6 (thumbnail-editor + generate) — depends on T3

**Integration + ship (main thread or lead):**
1. T7 full verification
2. T8 release note + implementation notes
3. Commit + PR

Do not start `W2`, `W3`, or `W5` until W1's product data contract is stable and `npm run build --workspace=apps/web` is green or has only non-W1 blockers documented.

## Implementation Notes

(Filled in by the executing team during T0 and T8.)

### T0 baseline

- Compile error count: _pending_
- First failing file: _pending_
- Runtime 404 inventory: _pending_

### T5a migration map (locked during execution)

_pending_

### T7 final state

- Shared build: _pending_
- Server tests + DI boot: _pending_
- Web build: _pending_
- Runtime smoke: _pending_

### Files changed

_pending_

### Known degradations

_pending_
