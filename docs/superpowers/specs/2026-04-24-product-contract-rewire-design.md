# Product Contract Rewire Design

- Date: 2026-04-24
- Status: Draft v2 — blocking issues from adversarial review (critic + architect + codex) addressed
- Related ADR: [ADR-0013 — Product schema 3-layer redesign](../../../.claude/docs/decisions/0013-product-schema-3layer.md)
- Related existing design: [Plan B1 Products Module](./2026-04-17-plan-b1-products-module-design.md)
- Revises (not supersedes) the alias strategy in [Plan W1 Product Data UI](../plans/2026-04-23-plan-w1-product-data-ui.md): a deprecated legacy alias is retained during the migration (see §3.4), contrary to v1's position
- Follow-up implementation plan: [Product Contract Rewire Implementation Plan](../plans/2026-04-24-product-contract-rewire.md)

## 1. Context

The database schema has already moved to the three-layer product model:

| Layer | Model | Meaning |
|---|---|---|
| Family/content | `MasterProduct` | Product family, source data, image/content fields, product strategy fields |
| Sellable SKU | `ProductOption` | SKU, barcode, option name, cost/sell price, commission rate, option stock planning fields |
| Channel publication | `ChannelListing`, `ChannelListingOption` | Marketplace/channel listing state and channel-specific option mapping |

The server products module mostly reflects this with `products/masters`, `products/options`, and `products/bundle-components`. The frontend and shared contracts still contain old assumptions from a flat product model:

- old shared names such as `ProductListItem`, `ProductDetail`, `ProductImageItem`, and `PipelineCounts`
- old root calls such as `/api/products`, `/api/products/:id`, and `/api/products/:id/images`
- UI code that reads master-level `costPrice` or `sellPrice`
- direct consumers that treat one product row as both family, option, and listing

This creates additive migration pressure: instead of deleting old concepts, the code starts to grow compatibility paths around them. This spec makes the new contract explicit so implementation can delete and rewire.

## 2. Design Goal

Make the product contract match the database schema.

The implementation should:

- keep entity APIs aligned with schema layers
- introduce one product catalog read model for UI screens that need a combined product row
- delete old flat product types instead of recreating them as shared exports
- move pricing and SKU expectations to option-level fields
- keep image operations anchored on `MasterProduct`
- stop introducing NEW calls to `/api/products`; retain the root only as a deprecated alias for pre-existing cross-domain consumers (§3.4) with a defined removal SLA

## 3. API Resource Model

### 3.1 Entity APIs

Entity APIs represent one schema layer and should remain close to the database model:

| API | Resource |
|---|---|
| `/api/products/masters` | `MasterProduct` |
| `/api/products/options` | `ProductOption` |
| `/api/products/bundle-components` | `BundleComponent` |

These routes are the source for create/update/delete operations on each product layer.

### 3.2 Catalog Read Model

Screens often need a row that is not a single database table. For example, a product list row may show:

- master name, category, brand, thumbnail, pipeline step
- option count
- representative SKU
- min/max sell price
- min/max cost price
- stock summary

That is a catalog view, not a legacy product entity. The canonical route for this is:

```text
/api/products/catalog
```

The route is intentionally not `/api/products` for new callers. Keeping `/api/products` as the canonical would preserve ambiguity because old callers already assume that URL returns a flat legacy product. The new route states that the response is a read model assembled from canonical schema layers.

Root `/api/products` is not deleted in this slice. It is retained as a deprecated alias under defined conditions — see §3.4. All NEW code must call `/api/products/catalog`.

Existing frontend cache keys such as `queryKeys.products` may remain when the meaning is still product catalog caching. Cache key reuse is acceptable because it is an internal frontend namespace, not an API compatibility contract. However, the products detail page and product list page in scope here should introduce a dedicated sub-namespace (for example `queryKeys.products.catalog`) so that cache invalidation from catalog writes does not trigger refetch storms in unrelated domains (order-hub, stock-ops, inventory-hub) that still share `queryKeys.products.list` for legacy `/api/products` reads.

### 3.3 Inventory And Stock

Stock is option-level, not master-level.

| Layer | Responsibility |
|---|---|
| `ProductOption` | Sellable SKU identity and option-level `availableStock` cache/derived value |
| `Inventory` | Operational stock record, 1:1 with a non-bundle `ProductOption` |
| `StockTransaction` | Stock ledger for receive/issue/adjust mutations |
| Bundle `ProductOption` | No `Inventory` row. `availableStock` is computed from component options |
| `Warehouse` | Warehouse master data. Current schema does not store per-warehouse stock balances |

The product catalog may display a stock summary, but it must treat stock as read-only derived data:

- catalog row `totalAvailableStock` is derived from active options
- simple options should use inventory current stock when an inventory row is included
- bundle options should use `ProductOption.availableStock`
- Prisma does not automatically maintain aggregated stock fields. Any stored aggregate must be written by application service logic or by an explicit database trigger/materialized-view strategy.
- this product catalog slice should not add `MasterProduct.totalStock` or another stored master-level stock field
- catalog `totalAvailableStock` should be computed at read time from included options/inventory rows
- `Inventory.currentStock` is company + option total stock, not warehouse-specific stock
- `Inventory.warehouseLocation` is a display/location string, not a `Warehouse` foreign key
- `StockTransaction.warehouseId` records where a stock movement happened, but it is ledger metadata, not a current warehouse balance
- `StockTransfer.fromWarehouseId` / `toWarehouseId` records transfer workflow state, but the schema has no `WarehouseStock` balance table
- missing inventory rows should not be silently created by catalog reads
- receive, issue, adjust, reservation, warehouse, and transfer behavior remains inventory-domain behavior

The product creation form must not write initial stock as part of master creation. If the UI needs stock setup, it should link or transition to the inventory flow after the option exists.

If the product needs to answer "which warehouse has how many units of this option?", that is not represented by the current product catalog contract. It requires an inventory-domain schema decision such as a per-option, per-warehouse balance model.

### 3.4 Legacy Compatibility Controller

Root `/api/products` has live consumers across business domains that are NOT rewired in this slice: ad-ops, inventory, inventory-hub, stock-ops, product-hub, order-hub, reports, settings, thumbnail-editor, sourcing, plus backend call sites inside `apps/server/src/action-task/action-task.service.ts` and action templates in `apps/server/src/workflows/actions/catalog.ts`. Deleting root `/api/products` without a replacement would produce runtime 404s at merge time in domains this spec declares out of scope. Under ADR-0019 that is not acceptable — not editing those files does not give this slice license to silently break their behavior.

The products module therefore registers a deprecated legacy alias controller that proxies the legacy routes to canonical services. Contract:

| Legacy route | Delegates to | Notes |
|---|---|---|
| `GET /api/products` | catalog list service | Same filters/pagination as `/api/products/catalog` |
| `GET /api/products/:id` | catalog detail by master id | `:id` is the master id |
| `PATCH /api/products/:id` | masters PATCH for master-level fields; option-level fields return 400 with an error message naming the canonical option route | See write-path matrix in §6.1 for field ownership. **Not registered in this slice** — the write path ships with the agent/workflow redesign. See §Deferred Work in the implementation plan |
| `PUT /api/products/:id` | same rules as PATCH | **Not registered in this slice**. `workflows/actions/catalog.ts` entries that used this path are removed in this slice; replacements land with the agent/workflow redesign |
| `GET /api/products/:id/original-image-base64` | masters image service | Existing legacy image fetch; SSRF-blocked for private/loopback hosts (IPv4 RFC1918 / CGNAT / 169.254 + IPv6 ::1 / fe80::/10 / fc00::/7 / fd00::/8) with full CDN allowlist deferred to a follow-up |
| `GET /api/products/pipeline-stats` | catalog counts service | Legacy product list/count callers only |
| `GET /api/products/calculate-grades` | catalog counts service with no grade write | Manual / diagnostic callers |
| `POST /api/products/calculate-grades` | catalog counts service with no grade write | Backend `action-task.service.ts` scheduled caller. Accepts empty body; returns `{ok, counts}`. Full grade recalculation remains outside this slice |

Rules:

- Collision prevention is driven by **registration order**, not by the pipe. The legacy controller must be registered AFTER `products/masters`, `products/options`, `products/bundle-components`, and `products/catalog` controllers in `ProductsModule` so NestJS route resolution matches siblings first. `ParseUUIDPipe` on `:id` is a defensive secondary layer that rejects non-UUID ids after the route matches (e.g. `/api/products/not-a-uuid` → 400), not the mechanism that prevents sibling-route collision.
- The controller class is annotated `@deprecated` in JSDoc and returns HTTP `Deprecation` / `Sunset` headers. The repository currently does not use `@nestjs/swagger`, so this slice must not add a Swagger dependency only to mark the legacy alias deprecated.
- Only pre-existing consumers may call the legacy routes. No NEW code may call `/api/products` directly. A grep guard (see §10 Verification) fails the build if a new legacy call site appears outside the known allowlist.
- The legacy alias has an explicit removal SLA. Each adjacent domain owns a follow-up plan that migrates its own call sites off `/api/products`. The alias controller is deleted only after every adjacent domain's migration plan lands. A tracker task under `docs/superpowers/plans/` records the removal condition and blocking consumers.
- Legacy controller responses are identical in shape to what the catalog/masters endpoints return. The spec does NOT attempt to reproduce the v0 flat product shape; it ships the new shape under the legacy URL. Consumers that relied on flat fields (e.g. `costPrice` at the top level) will break on those specific fields — this is accepted breakage limited to those fields, because no schema can reproduce master-level prices that no longer exist in the DB.

## 4. Shared Contract

`@kiditem/shared` should expose two kinds of product types.

### 4.1 Schema Entity Types

These mirror database model boundaries:

- `Master`
- `ProductOption`
- `BundleComponent`
- `MasterWithOptions`
- `OptionWithComponents`
- `MasterImageItem`

These names match the B1-shipped shared exports (`packages/shared/src/schemas/product.ts`). `Master` is the wire-contract name for the family entity; Prisma's generated `MasterProduct` remains the DB model name. Keeping them separate is intentional, not a fork: it avoids import-name collisions in server code that references both the wire Zod type and the Prisma model, and avoids mechanical churn across controllers, services, and tests that already import `Master` / `MasterWithOptions` by name.

`MasterProduct.images` (the DB column, `Json?`) has an app-level canonical shape:

```typescript
type MasterImageItem = {
  url: string;
  role: string;
  label: string;
  sortOrder: number;
};
```

Server mappers MUST normalize existing string-only image arrays into this object shape when reading legacy data (url populated, role/label empty, sortOrder from array index). Writes MUST persist the object shape. The `MasterSchema.images` Zod type in `@kiditem/shared` must be updated from `z.array(z.string().url())` to `z.array(MasterImageItemSchema)` so that runtime validation rejects legacy writes. A one-time backfill is out of scope here; normalization on read covers in-place rows.

### 4.2 Catalog Read-Model Types

These are allowed because the UI needs combined rows:

- `ProductCatalogListItem`
- `ProductCatalogDetail`
- `ProductCatalogCounts`

Catalog types must not reintroduce flat write semantics. If a field is derived from option data, the type name or structure should make that visible.

Field shape and null semantics for derived fields:

| Field | Type | Null rule |
|---|---|---|
| `optionCount` | `number` | `0` (never null) when no options |
| `representativeSku` | `string \| null` | `null` when no active, non-deleted options |
| `priceRange` | `{ min: number; max: number } \| null` | The whole object is `null` when no active options have a non-null `sellPrice`. Does NOT return `{min: null, max: null}` |
| `costRange` | `{ min: number; max: number } \| null` | Same rule as `priceRange` for `costPrice` |
| `totalAvailableStock` | `number` | `0` (never null) when no active options |
| `options: ProductOption[]` | array | Empty array (never null) when no options; only included on detail responses |

The catalog contract may expose convenience display fields, but it must not imply that cost price or sell price live on `MasterProduct`.

## 5. Backend Design

### 5.1 Products Module

The products module owns the catalog read model because it is still product-domain read behavior. The implementation can add:

- `ProductCatalogController`
- `ProductCatalogService`
- `ListProductCatalogQuery`

The controller route should be:

```typescript
@Controller('products/catalog')
```

The service reads `MasterProduct` with related options and any directly needed product-domain relations. It should not reach into unrelated business domains for write behavior. If inventory summary is required for catalog display and the required data is already on `ProductOption.availableStock`, use that. If a richer inventory state is needed, that belongs in a later inventory-domain slice.

### 5.2 Mapping Rules

Backend mappers should use shared types with `satisfies` so drift is visible at compile time.

Core mapping rules:

- `id` on catalog rows is the master id.
- `name`, `category`, `brand`, `thumbnailUrl`, `imageUrl`, `images`, `pipelineStep`, `abcGrade`, `profitTag`, `adTier`, `sourceUrl`, and `detailPageUrl` come from `MasterProduct`.
- "Active option" throughout this spec means `ProductOption.isActive = true AND ProductOption.isDeleted = false`. Both conditions are required; neither is sufficient alone.
- `representativeSku` is the first active option ordered by `sortOrder` ascending, then `createdAt` ascending as tie-break. `null` when no active option exists.
- price and cost ranges are computed over active options whose `sellPrice` / `costPrice` is non-null. If zero active options qualify, the range field itself is `null` (per §4.2).
- `totalAvailableStock` sums option-level availability across active options. For simple options use included `Inventory.currentStock` when the inventory row is present; treat a missing inventory row as `0` (do NOT create the row from the catalog read path). For bundle options use `ProductOption.availableStock` as materialized by `BundleStockService.recompute`. Acknowledged staleness: bundle `availableStock` can lag component inventory changes that do not trigger recompute — this is accepted read-time staleness and not resolved in this spec.
- missing option prices stay nullable or absent; they are not backfilled from master fields.
- catalog mapping must not mutate `Inventory`, `StockTransaction`, `ProductOption.availableStock`, or any other writable column. Catalog is a pure read path.

### 5.3 Image Operations

Product images are master content. Image fetch/update routes should use a master-oriented API:

- `GET /api/products/masters/:id` for reading master image metadata
- `PATCH /api/products/masters/:id` for updating the `images` JSON array
- `POST /api/products/masters/:id/images/upload` for uploading a file and receiving a public image URL

The upload route should use the existing `StorageService` S3-compatible storage path. Product rewire should not introduce a separate file-storage abstraction.

The old `/api/products/:id/images` route is not recreated as a canonical endpoint. The §3.4 legacy alias covers `GET /api/products/:id/original-image-base64` only (existing known caller). Any new image operation must use the master-oriented routes above.

### 5.4 Creation Flow

The product catalog route is read-oriented. Product creation should not post a flat payload to `/api/products`.

Creation flow:

1. create a `MasterProduct` through `/api/products/masters`
2. create options through `/api/products/options`
3. inventory stock writes remain inventory-domain behavior

For this slice, the product UI should create a master only. It should remove flat SKU, price, and stock fields from the master creation form. Option creation remains an explicit option operation.

## 6. Frontend Design

### 6.1 Product List And Detail

The product list page should fetch:

```text
GET /api/products/catalog
```

The product detail page should fetch:

```text
GET /api/products/catalog/:masterId
```

Detail UI should show master fields and option sections separately:

- master identity/content/status cards
- option pricing and SKU table
- image/content section
- channel/listing sections only when backed by the proper listing contract

Any component currently reading `product.masterProduct.costPrice` or `product.masterProduct.sellPrice` must be rewired to option-derived fields or an option table.

#### Rewire Table — `apps/web/src/app/products/[id]/`

`ProductDetail` is already a phantom import (no matching export in `@kiditem/shared`). All 6 files importing it must migrate to `ProductCatalogDetail`. The master-level price reads in `ProductInfoCards` and `ProductMetrics` must move to option-level or derived range fields.

| File | Current | Target |
|---|---|---|
| `page.tsx` | `apiClient.get<ProductDetail as Product>('/api/products/:id')` | `apiClient.getParsed(ProductCatalogDetailSchema)('/api/products/catalog/:masterId')` |
| `page.tsx` sibling: `GET /api/inventory?productId=${productId}` | legacy product id parameter | `GET /api/inventory?masterId=${masterId}`; inventory accepts `masterId`/`optionId`, not `productId` |
| `components/ProductInfoCards.tsx` | reads `product.masterProduct.costPrice` / `sellPrice` | render master identity card from master fields only; render per-option pricing from `product.options[]` in the option section |
| `components/ProductMetrics.tsx` | reads flat `sellPrice`, `costPrice`, `commissionRate`, `status` | read `priceRange` / `costRange` from catalog detail for aggregate; when a specific option is selected use that option's fields; replace `status` read with `pipelineStep` |
| `components/ProductSidebar.tsx` | reads `status`, `adTier`, `commissionRate`, `shippingCost` | `pipelineStep` from master; `adTier` from master; `commissionRate` and `shippingCost` from selected option (surface an option picker when the master has multiple active options) |
| `components/HealthDiagnosis.tsx` | imports `ProductDetail` | import `ProductCatalogDetail` and adjust field reads |
| `hooks/useProductActions.ts` | single `PATCH /api/products/:id` with mixed fields | split per field ownership per write-path matrix below |

#### Write-Path Matrix — `useProductActions.ts`

The legacy payload mixed master-level and option-level fields into one `PATCH /api/products/:id`. The rewire routes each write to its canonical endpoint.

| User action | Field | Endpoint | Body | Notes |
|---|---|---|---|---|
| Change ABC grade | `abcGrade` | `PATCH /api/products/masters/:id` | `{ abcGrade }` | Master field per `prisma/models/core.prisma` |
| Change ad tier | `adTier` | `PATCH /api/products/masters/:id` | `{ adTier }` | Master field |
| Stop ads | `adTier = 'off'` (or equivalent) | `PATCH /api/products/masters/:id` | `{ adTier: 'off' }` | Same endpoint as change ad tier |
| Discontinue product | `pipelineStep` | `PATCH /api/products/masters/:id` | `{ pipelineStep: 'discontinued' }` | `MasterProduct` has no `status` column; the UI concept "discontinued" maps to `pipelineStep: 'discontinued'`, which the existing frontend utility already recognizes. Do not introduce a new `status` field on master |
| Adjust sell price | `sellPrice` | `PATCH /api/products/options/:optionId` | `{ sellPrice }` | Option-level field. Requires an option id. When the master has exactly one active option, default to it; otherwise the UI must surface an option picker before allowing the write. The legacy single-endpoint shortcut is removed |
| Adjust commission rate | `commissionRate` | `PATCH /api/products/options/:optionId` | `{ commissionRate }` | Option-level field; same picker rule as sell price |

Detail page workflow/activity context passes `objectType: 'product'` with the route `:id`. Treat that id as a master id going forward. If a downstream workflow action requires an option id, the call site must explicitly resolve the option (typically the representative option or a user-selected option). This spec does not change activity/workflow schema; it only fixes the identity interpretation on the product side.

### 6.2 Selectors And Search

Generic product selectors that only need a searchable display row should use the catalog list route. They should treat the selected id as a master id unless the selector explicitly asks for an option id.

Selectors that feed order matching, inventory movement, or ads must be checked carefully:

- if the downstream operation needs a master id, use catalog rows
- if the downstream operation needs an option id, use an option-specific endpoint or expose option choices in the selector
- do not silently pass a master id where an option id is required

### 6.3 Sourcing And Image Workflows

Sourcing extension reads already point at master-oriented data on the server. Frontend sourcing screens should stop using old `/api/products/:id` detail calls and use catalog or master endpoints depending on the UI need.

Thumbnail and image screens should treat `productId` route params as master ids when they are editing master images. Naming can be adjusted locally where it reduces confusion, but route compatibility in the Next.js page path does not need to change in this slice.

## 7. Deletion Rules

Implementation must remove or stop exporting:

- `ProductListItem` — already phantom in `@kiditem/shared`; delete all imports, replace with `ProductCatalogListItem`
- `ProductDetail` — already phantom in `@kiditem/shared`; delete all imports, replace with `ProductCatalogDetail`
- `ProductImageItem` — kept as a `@deprecated` type alias re-exporting `MasterImageItem` to keep `apps/web/src/app/image-hub` and `apps/web/src/app/thumbnail-editor` compiling until their own migration plans run. In-scope product-domain callers use `MasterImageItem` directly. The alias is removed once image-hub and thumbnail-editor migrate — tracked in TODOS.md
- `PipelineCounts` — already phantom; replace with `ProductCatalogCounts` sourced from the catalog pipeline-stats endpoint response shape. Do not preserve the old name under any condition
- root `/api/products` direct calls from in-scope product-domain consumers (products list, product detail, product selector for product-domain screens). Out-of-scope consumers in other domains keep calling `/api/products` via the §3.4 legacy alias until each domain's own migration plan lands
- flat product creation payloads that post SKU, price, or stock fields to the master form (per §5.4)
- master-level `costPrice` / `sellPrice` reads everywhere
- single-endpoint mixed-field `PATCH /api/products/:id` in `useProductActions.ts`; split per §6.1 write-path matrix

The legacy alias controller (§3.4) is the ONLY permitted retained surface for the old URL. Shared contract types are NOT re-exported under legacy names. If a cross-domain consumer still imports a phantom type today, it was broken before this spec; removing the phantom import surface is in scope for the consumer's own migration plan, not this slice.

## 8. Scope Boundaries

In scope:

- shared product schemas and exports (rename/remove phantom types; introduce catalog read-model types and `MasterImageItem`)
- products module catalog read endpoints (`/api/products/catalog` list + detail)
- products module legacy alias controller (§3.4)
- product list page (`apps/web/src/app/products/page.tsx`) and product detail page (`apps/web/src/app/products/[id]/*`) rewire per §6.1
- image hooks that operate on master images within the product-domain pages
- `MasterSchema.images` Zod shape migration + server-side normalizer
- tests covering the rewired product contract and the legacy alias behavior

Out of scope:

- Prisma schema changes
- inventory write flows
- order matching semantics
- ad strategy business logic (ad-ops page, ad-strategy service)
- report export redesign
- channel listing CRUD beyond data needed for catalog display
- sourcing extension create-path redesign
- migrating cross-domain `/api/products` callers (inventory, inventory-hub, stock-ops, product-hub, order-hub, reports, settings, thumbnail-editor, ad-ops, action-task.service, workflows/actions/catalog.ts). Each is a separate follow-up plan in its own business domain. They keep calling `/api/products` through the §3.4 alias until their plan lands

Rule: this slice may NOT edit files in out-of-scope domains to "quickly" migrate them, even if an adjacent consumer looks easy. Cross-domain migration requires a separate plan in the consumer's own domain. The legacy alias exists precisely so this rule can hold.

## 9. Error Handling

Catalog endpoints should follow existing NestJS conventions:

- company scoping through `@CurrentCompany`
- `404` when a master id is not found in the company scope
- `400` for invalid query parameters
- no `companyId` in client payloads

Frontend queries should keep existing loading and empty states, but error messages should avoid implying that products are missing because of legacy migration state.

## 10. Verification

No Prisma schema change is part of this spec. Verification after implementation must include:

Build + boot:

```bash
npm run build --workspace=packages/shared
npm run build --workspace=apps/server
npm run build --workspace=apps/web
npm run dev:server
```

The server boot check is required because NestJS DI errors can pass typecheck.

Grep gates (each must return zero matches except the legacy alias controller for the first gate):

```bash
# no new direct root /api/products callers inside the product-domain rewrite surface
rg -n '/api/products(?!/(masters|options|bundle-components|catalog))' \
  apps/web/src/app/products apps/web/src/components/product apps/server/src/products --pcre2 \
  | rg -v 'apps/server/src/products/.*legacy.*\.ts'

# no lingering phantom type imports
rg -n '\bProductListItem\b|\bProductDetail\b|\bProductImageItem\b|\bPipelineCounts\b' apps/web/src packages/shared/src

# no master-level price reads
rg -n 'masterProduct\.costPrice|masterProduct\.sellPrice' apps/web/src

# no legacy identity mismatch on inventory queries
rg -n 'api/inventory\?productId=' apps/web/src apps/server/src
```

These gates enforce that the deletion phase left no dangling references. The first gate allows matches only inside the legacy alias controller file(s); a reviewer should scan the output to confirm.

Integration tests in scope:

- `apps/server/src/products/__tests__/` catalog list + detail with options aggregation (active / soft-deleted / bundle mix)
- legacy alias controller behavior: GET list passes through, PATCH with master-level field succeeds, PATCH with option-level field returns 400 naming the canonical route
- `MasterSchema.images` Zod rejects legacy string-array writes after the shape migration

## 11. Open Decisions Resolved In This Spec

| Question | Decision |
|---|---|
| Use `/api/products/catalog` as the canonical read route for new callers? | Yes. `/api/products` is not canonical. |
| Delete root `/api/products`? | No, not in this slice. Retained as a deprecated alias controller (§3.4) with explicit removal SLA gated on adjacent-domain migrations. |
| Rename shared `Master` → `MasterProduct` to match Prisma? | No. Keep B1 convention. `Master` is the wire type, `MasterProduct` stays the DB model name. Avoids import collisions and mechanical churn. |
| Put price fields back on master? | No. Price fields remain option-level. |
| Recreate old shared flat product types (`ProductListItem`, `ProductDetail`, `ProductImageItem`, `PipelineCounts`)? | No. Replace with schema-aligned entity and catalog read-model types. |
| Use catalog route for writes? | No. Catalog is read-oriented. Writes go through layer-specific APIs. |
| Route a single `PATCH /api/products/:id` for mixed master/option field writes? | No. Split per §6.1 write-path matrix. Master fields to `/api/products/masters/:id`, option fields to `/api/products/options/:optionId`. |
| Add a `status` field to master for "discontinued"? | No. Use an existing `pipelineStep` enum value. |
| Rewire all domains at once? | No. Only direct product catalog reads are in scope. Other domains remain on the legacy alias until their own plans migrate them. |
