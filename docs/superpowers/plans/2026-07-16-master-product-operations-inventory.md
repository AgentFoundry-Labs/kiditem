# MasterProduct Operations and Sellpia Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore `MasterProduct` as KidItem's product-operations unit while keeping Sellpia SKU stock authoritative, centralize variant recipes, and reconnect product management, channel matching, orders, and Rocket purchase preview to the same inventory basis.

**Architecture:** `MasterProduct` owns operating metadata, `ProductVariant` owns the reusable sellable identity, `ProductVariantComponent` owns one confirmed recipe, and `SellpiaInventorySku` owns physical Sellpia facts and current stock. Channel listings link at product and variant level; Inventory remains the only stock writer; Products derives capacities; Channels, Orders, and Supply consume those derived reads. The existing operations UI is preserved and rewired rather than replaced.

**Tech Stack:** Prisma 7/PostgreSQL, NestJS, Zod and `@kiditem/shared` focused exports, Next.js App Router, React Query, Vitest, Node test runner, Chrome extension APIs, Playwright-style Chrome verification through the existing browser tooling.

## Global Constraints

- Implement the approved design in [`docs/superpowers/specs/2026-07-16-master-product-operations-inventory-design.md`](../specs/2026-07-16-master-product-operations-inventory-design.md). If code and design disagree, stop and resolve the design rather than silently inventing another ownership model.
- Keep the five Tasks below as the review boundaries. The checkbox steps inside a Task are implementation checkpoints, not separate delegated Tasks.
- Preserve the current uncommitted Sellpia order-transmission/freshness work and the UI-restoration work. Never use `git reset`, `git checkout --`, or broad restore commands; inspect overlapping diffs before every edit.
- Do not migrate or preserve the legacy staging `MasterProduct`/`ProductOption` rows. This is an unshipped `0.1.19` correction; rebuild development data after the final schema is present.
- Do not add a second stock ledger, reservation stock, or channel-owned recipe. Only a completed, valid Sellpia full-snapshot publication writes `SellpiaInventorySku.currentStock` and source `isActive`.
- Do not auto-confirm links from normalized names, barcodes with multiple candidates, or AI suggestions. Only exact KidItem-first identities may be written without a separate operator confirmation.
- Every read and mutation is organization-scoped. Every cross-model write validates that all IDs belong to the same organization inside one transaction.
- Keep `MasterProduct`, `ProductVariant`, and recipe services under 700 lines. Split repository queries and pure policies before that limit.
- Use focused shared imports: `@kiditem/shared/product-operations`, `@kiditem/shared/channel-product-matching`, `@kiditem/shared/inventory`, and `@kiditem/shared/channel-sku-availability`.
- Run backend and frontend in watch mode while implementing. Production builds are final verification gates, not the normal feedback loop.
- When execution is delegated, use a Tera 5.6 implementation agent for each complete Task and a Sol review agent for that Task's finished diff. Do not delegate individual checkbox steps.
- At the end of every Task, request a Sol-model review of the complete Task diff. Apply accepted findings, rerun the Task gate, then commit once. Do not request review after every checkbox.

---

## Task 1: Lock the final schema and public contracts

**Review boundary:** One coherent database/API contract change. No service behavior or page rewiring is complete until Tasks 2–4.

**Files:**

- Modify: `prisma/models/core.prisma`
- Modify: `prisma/models/inventory.prisma`
- Modify: `prisma/models/channels.prisma`
- Modify: `prisma/models/supply.prisma`
- Modify: `prisma/AGENTS.md`
- Modify: `apps/server/AGENTS.md`
- Modify: `apps/server/src/products/AGENTS.md`
- Modify: `apps/server/src/inventory/AGENTS.md`
- Modify: `apps/server/src/channels/AGENTS.md`
- Modify: `apps/server/src/supply/AGENTS.md`
- Create: `packages/shared/src/schemas/product-operations.ts`
- Create: `packages/shared/src/schemas/product-operations.spec.ts`
- Create: `packages/shared/src/product-operations.ts`
- Create: `packages/shared/src/schemas/channel-product-matching.ts`
- Create: `packages/shared/src/schemas/channel-product-matching.spec.ts`
- Create: `packages/shared/src/channel-product-matching.ts`
- Modify: `packages/shared/src/schemas/inventory-snapshot.ts`
- Modify: `packages/shared/src/schemas/inventory-snapshot.spec.ts`
- Modify: `packages/shared/src/schemas/channel-sku-availability.ts`
- Modify: `packages/shared/src/schemas/channel-sku-availability.spec.ts`
- Modify: `packages/shared/package.json`
- Create: `scripts/__tests__/master-product-operations-schema-contract.test.mjs`
- Modify: `scripts/__tests__/channel-sellpia-matching-schema-contract.test.mjs`
- Modify: `scripts/__tests__/sellpia-authoritative-inventory-contract.test.mjs`
- Modify: `scripts/check-sellpia-db-push-warning.mjs`

### Step 1: Write failing schema ownership tests

- [ ] Add `master-product-operations-schema-contract.test.mjs` assertions that require:
  - `MasterProduct` has organization-scoped `code`, `name`, operating metadata, `variants`, and `channelListings`, but no `currentStock`, `barcode`, source prices, `rawJson`, or `lastImportRunId`.
  - `ProductVariant` has `(organizationId, code)` uniqueness, belongs to one `MasterProduct`, and has `components` and linked channel options.
  - `ProductVariantComponent` has positive `quantity`, unique `(productVariantId, sellpiaInventorySkuId)`, and organization-fenced relations.
  - `SellpiaInventorySku` has unique `(organizationId, code)`, `currentStock`, source prices, source metadata, `lastImportRunId`, and no `masterProductId`.
  - `ChannelListing.masterProductId` and `ChannelListingOption.productVariantId` are nullable.
  - `ChannelSkuComponent` and `channel_sku_components` no longer exist.
  - supplier products, purchase items, transfers, picking, and return movements reference `SellpiaInventorySku`.
- [ ] Change the two existing contract tests so they reject physical-stock fields on `MasterProduct` and require `SellpiaInventorySku` as the Sellpia publication target.
- [ ] Run:

  ```bash
  node --test scripts/__tests__/master-product-operations-schema-contract.test.mjs scripts/__tests__/channel-sellpia-matching-schema-contract.test.mjs scripts/__tests__/sellpia-authoritative-inventory-contract.test.mjs
  ```

  Expected: FAIL because the current schema still treats `MasterProduct` as one physical Sellpia row and still contains `ChannelSkuComponent`.

### Step 2: Replace the Prisma ownership graph

- [ ] Rewrite `MasterProduct` in `core.prisma` as the operational product with these persisted fields:

  ```prisma
  id, organizationId, code, name, description?, category?, brand?,
  tags String[], imageUrls String[], abcGrade?, profitTag?, adTier?,
  adBudgetLimit?, healthScore?, healthUpdatedAt?, isActive,
  createdAt, updatedAt
  ```

  Keep `provenanceCandidate` and `processingCosts` on `MasterProduct`. Add organization-fenced relations to `ProductVariant[]` and `ChannelListing[]`.
- [ ] Add `ProductVariant` to `core.prisma` with `id`, `organizationId`, `masterProductId`, stable `code`, `name`, optional `optionLabel`, `isDefault`, `isActive`, timestamps, and organization-fenced relations. Enforce `@@unique([organizationId, code])`, `@@unique([id, organizationId])`, and at most one active default variant per product with a named partial unique index.
- [ ] Add `ProductVariantComponent` with `productVariantId`, `sellpiaInventorySkuId`, positive `quantity`, `source` (`manual` or `deterministic` validated by service/shared schema), `confirmedBy`, `confirmedAt`, and timestamps. Add the composite uniqueness and tenant indexes required by the design.
- [ ] Add `SellpiaInventorySku` to `inventory.prisma` with the physical fields currently on `MasterProduct`; map it to `sellpia_inventory_skus` and use the relation name `SellpiaInventorySkuLastImport`.
- [ ] Add nullable `masterProductId` to `ChannelListing` and nullable `productVariantId` to `ChannelListingOption`, both with composite organization-fenced foreign keys and indexes. Remove `mappingStatus`; matching state is derived from the two nullable links and recipe validity.
- [ ] Delete `ChannelSkuComponent` from `channels.prisma` and remove all relation arrays that only supported it.
- [ ] Rename physical references and relation fields in `inventory.prisma` and `supply.prisma`:

  ```text
  masterProductId/masterProduct -> sellpiaInventorySkuId/sellpiaInventorySku
  ```

  Apply this to `SupplierProduct`, `PurchaseOrderItem`, `StockTransfer`, `PickingItem`, and `ReturnTransfer`. Keep product-level `ProcessingCost.masterProductId` unchanged.
- [ ] Update `Organization` and `SourceImportRun` relation arrays in `core.prisma` for the new models and remove stale arrays for `ChannelSkuComponent`.
- [ ] Run `npx prisma format` and then the three schema contract tests. Expected: PASS.

### Step 3: Define focused Zod contracts before services consume them

- [ ] In `product-operations.ts`, define and test strict schemas for:
  - list query: page, limit, query, `periodDays` (`7|14|30`), category, active status, inventory status, ABC grade, and ad status;
  - product list item: product identity/metadata; `variantSummary`; distinct physical `inventoryUnits`; `inventoryStatus`; channel count/status; nullable traffic/order/sales/ad/profit metrics;
  - detail: product metadata, channel listings, variants, each variant's components, `capacity`, and warning state;
  - create/update product, create/update variant, and complete recipe replacement;
  - `inventoryStatus`: `sellable | partial_out_of_stock | out_of_stock | configuration_required | review_required`.
- [ ] Use these exact mutation invariants in the schemas:

  ```ts
  quantity: z.number().int().positive()
  components: z.array(component).max(50)
  variant code: non-empty, trimmed, max 100
  product code: non-empty, trimmed, max 100
  create product variants: optional, but the service must create one default variant when omitted
  ```

- [ ] In `channel-product-matching.ts`, define product-level and option-level queue rows, counts, evidence, candidate reasons, and strict link commands:

  ```ts
  { masterProductId: z.string().uuid().nullable() }
  { productVariantId: z.string().uuid().nullable() }
  ```

  Candidate reasons are `existing_identity`, `exact_code`, `unique_barcode`, `exact_normalized_name`, `ai_suggestion`, and `manual_search`; every candidate contains evidence and never implies confirmation.
- [ ] Change inventory snapshot IDs from `masterProductId` to `sellpiaInventorySkuId`; add `linkedVariantCount`, `linkedProductCount`, and a derived `linkStatus: linked | unlinked`. Rename `SellpiaMasterActiveStatus` to `SellpiaInventorySkuActiveStatus`.
- [ ] Change channel availability component IDs from `masterProductId` to `sellpiaInventorySkuId`; add `productVariantId`, `variantCode`, and `variantName` to each matched item.
- [ ] Add focused package exports in `packages/shared/package.json`; do not expand the root barrel.
- [ ] Run:

  ```bash
  npm exec --workspace=packages/shared vitest -- run src/schemas/product-operations.spec.ts src/schemas/channel-product-matching.spec.ts src/schemas/inventory-snapshot.spec.ts src/schemas/channel-sku-availability.spec.ts
  npm run build --workspace=packages/shared
  ```

  Expected: all selected tests pass and tsup emits the two new focused subpaths.

### Step 4: Generate and validate the database contract

- [ ] Run:

  ```bash
  npm run db:push -- --accept-data-loss
  npx prisma generate
  npm run check:tenant-scope
  npm run check:directory-architecture
  ```

  Expected: local development DB accepts the destructive unshipped schema reset, Prisma Client generation succeeds, and both repository guards pass. Do not run this against staging or production.
- [ ] Update the scoped `AGENTS.md` files and `apps/server/AGENTS.md` owner map so future work cannot reintroduce physical `MasterProduct`, channel recipes, or direct product-hub inventory reads.
- [ ] Ask for one Sol review covering the schema, tenant fences, partial unique constraints, focused exports, and test quality. Apply findings and rerun all Task 1 commands.
- [ ] Commit:

  ```bash
  git add prisma packages/shared apps/server/AGENTS.md apps/server/src/products/AGENTS.md apps/server/src/inventory/AGENTS.md apps/server/src/channels/AGENTS.md apps/server/src/supply/AGENTS.md scripts/__tests__ scripts/check-sellpia-db-push-warning.mjs
  git commit -m "refactor: restore product and inventory boundaries"
  ```

---

## Task 2: Move Sellpia publication and physical operations to `SellpiaInventorySku`

**Review boundary:** Inventory is fully operational on the new physical model, including freshness fencing and record-only warehouse operations. Product operations and channel links are still added in Task 3.

**Files:**

- Rename: `apps/server/src/inventory/application/port/in/stock/sellpia-master-product-read.port.ts` -> `sellpia-inventory-sku-read.port.ts`
- Rename: `apps/server/src/inventory/application/port/out/repository/sellpia-master-product-read.repository.port.ts` -> `sellpia-inventory-sku-read.repository.port.ts`
- Rename: `apps/server/src/inventory/application/service/sellpia-master-product-read.service.ts` -> `sellpia-inventory-sku-read.service.ts`
- Rename: `apps/server/src/inventory/adapter/out/repository/sellpia-master-product-read.repository.adapter.ts` -> `sellpia-inventory-sku-read.repository.adapter.ts`
- Modify: `apps/server/src/inventory/application/port/in/stock/inventory-sku-snapshot-list.port.ts`
- Modify: `apps/server/src/inventory/application/port/out/repository/inventory-sku-snapshot-list.repository.port.ts`
- Modify: `apps/server/src/inventory/application/service/inventory-sku-snapshot-list.service.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/inventory-sku-snapshot-list.repository.adapter.ts`
- Modify: `apps/server/src/inventory/adapter/in/http/inventory-sku-snapshot.controller.ts`
- Modify: `apps/server/src/inventory/adapter/in/http/dto/list-inventory-skus-query.dto.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/sellpia-snapshot-publication.repository.adapter.ts`
- Modify: `apps/server/src/inventory/application/port/out/repository/sellpia-snapshot-publication.repository.port.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/sellpia-inventory-freshness.repository.adapter.ts`
- Modify: `apps/server/src/inventory/application/port/out/repository/sellpia-inventory-freshness.repository.port.ts`
- Modify: `apps/server/src/inventory/application/service/sellpia-inventory-freshness.service.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/transfers.repository.adapter.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/picking.repository.adapter.ts`
- Modify: `apps/server/src/inventory/application/service/transfers.service.ts`
- Modify: `apps/server/src/inventory/application/service/picking.service.ts`
- Modify: `apps/server/src/inventory/inventory.module.ts`
- Modify tests under: `apps/server/src/inventory/**/*.spec.ts`

### Step 1: Turn the existing Inventory tests red on the new identity

- [ ] Update unit and PG integration fixtures to use `sellpiaInventorySkuId` and Prisma `sellpiaInventorySku` records.
- [ ] Add explicit PG cases for:
  - a full snapshot creates/upserts physical SKUs without creating `MasterProduct` or `ProductVariant`;
  - a missing code becomes inactive and stock zero only after successful publication;
  - duplicate file verification advances freshness without rewriting stock rows;
  - failed parsing/publication leaves the previous completed basis intact;
  - list summary deduplicates physical rows and reports linked/unlinked counts from `ProductVariantComponent`;
  - cross-organization recipe references never make an SKU look linked;
  - stock transfer, picking, and return records validate owned `SellpiaInventorySku` IDs but never mutate current stock.
- [ ] Run:

  ```bash
  npm exec --workspace=apps/server vitest -- run src/inventory/application/service/sellpia-inventory-import.service.spec.ts src/inventory/application/service/inventory-sku-snapshot-list.service.spec.ts src/inventory/application/service/sellpia-inventory-freshness.service.spec.ts src/inventory/application/service/__tests__/transfers.service.spec.ts src/inventory/application/service/__tests__/picking.service.spec.ts
  ```

  Expected: FAIL on old `MasterProduct` types and repository calls.

### Step 2: Replace the physical read/publication adapters

- [ ] Rename `SellpiaMasterProductReadModel` to `SellpiaInventorySkuReadModel` and return `sellpiaInventorySkuId`, source facts, current stock, and activity only.
- [ ] Change `SellpiaSnapshotPublicationRepositoryAdapter` to upsert `SellpiaInventorySku` by `(organizationId, code)`. Preserve the current transaction, generation fence, quality gate, file hash behavior, and inactive-row update semantics.
- [ ] Rename publication result counters to `createdSkuCount`, `updatedSkuCount`, and `inactivatedSkuCount` throughout the private port and service while keeping the HTTP response backward-compatible only if the existing UI still reads the old names. Remove the compatibility alias in Task 5 after all consumers move.
- [ ] Change the inventory list/detail repository to read `SellpiaInventorySku` and derive `linkedVariantCount`/`linkedProductCount` through distinct component relations. Keep portfolio `totalUnits` and asset value based directly on distinct physical SKU rows.
- [ ] Keep HTTP routes stable:

  ```text
  GET /api/inventory/sellpia-skus
  GET /api/inventory/sellpia-skus/:sellpiaInventorySkuId
  GET /api/inventory/sellpia-sync/import-runs
  POST /api/inventory/sellpia-sync/import
  ```

- [ ] Update freshness transaction reads from `findMasterProducts(ids)` to `findInventorySkus(ids)`. Every freshness/capacity gate input now names `sellpiaInventorySkuIds`.

### Step 3: Move warehouse and physical-reference behavior

- [ ] Update transfer, picking, return-transfer, supplier, and purchase-item repository select/create shapes to use `sellpiaInventorySkuId`. In this Task, change only Inventory-owned service and DTO surfaces; Supply and Orders HTTP contracts are completed in Task 5.
- [ ] Preserve the record-only rule: no create/complete/cancel operation performs an increment/decrement on `SellpiaInventorySku.currentStock`.
- [ ] Update `inventory.module.ts`, barrel exports, dependency tokens, architecture tests, and wiring tests; remove every `SELLPIA_MASTER_PRODUCT_READ` symbol and filename.
- [ ] Run:

  ```bash
  npm exec --workspace=apps/server vitest -- run src/inventory
  npm run test:integration --workspace=apps/server -- src/inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts src/inventory/__tests__/inventory-sku-snapshot-list.repository.pg.integration.spec.ts src/inventory/__tests__/sellpia-inventory-freshness.repository.pg.integration.spec.ts src/inventory/__tests__/stock-transfers-tenant-boundary.pg.integration.spec.ts
  ```

  Expected: Inventory unit and selected PG integration suites pass.

### Step 4: Boot the backend in watch mode and review the Task

- [ ] Start or reuse the backend watch process:

  ```bash
  npm run dev:server
  ```

  Expected: Nest compiles with no TypeScript errors and logs a successful application start. Leave the watch process running for Tasks 3–5.
- [ ] Query a seeded organization and confirm `/api/inventory/sellpia-skus` returns the new ID field, physical summary, and link status without exposing product operations metadata.
- [ ] Ask for one Sol review focused on atomic publication, idempotency/freshness regressions, organization fencing, and accidental stock writers. Apply findings and rerun Task 2 gates.
- [ ] Commit:

  ```bash
  git add apps/server/src/inventory packages/shared/src/schemas/inventory-snapshot.ts packages/shared/src/inventory.ts
  git commit -m "refactor: publish sellpia inventory skus"
  ```

---

## Task 3: Implement product operations, variant recipes, and two-level channel links

**Review boundary:** The backend can create and query operational products, derive capacities from one central recipe, and explicitly link channel products/options. The web UI is rewired in Task 4.

**Files:**

- Create: `apps/server/src/products/products.module.ts`
- Create: `apps/server/src/products/domain/product-variant-capacity.ts`
- Create: `apps/server/src/products/domain/product-variant-capacity.spec.ts`
- Create: `apps/server/src/products/application/port/in/product-operations.port.ts`
- Create: `apps/server/src/products/application/port/in/product-variant-recipe.port.ts`
- Create: `apps/server/src/products/application/port/out/product-operations.repository.port.ts`
- Create: `apps/server/src/products/application/service/product-operations.service.ts`
- Create: `apps/server/src/products/application/service/product-variant-recipe.service.ts`
- Create: `apps/server/src/products/adapter/out/repository/product-operations.repository.adapter.ts`
- Create: `apps/server/src/products/adapter/in/http/product-operations.controller.ts`
- Create: `apps/server/src/products/adapter/in/http/dto/product-operations.dto.ts`
- Create: `apps/server/src/products/__tests__/product-operations.repository.pg.integration.spec.ts`
- Create: `apps/server/src/products/__tests__/products.architecture.spec.ts`
- Modify: `apps/server/src/products/categories/categories.module.ts`
- Modify: `apps/server/src/app.module.ts`
- Replace: `apps/server/src/channels/domain/channel-sku-candidate-ranking.ts` with `channel-product-candidate-ranking.ts` and `channel-variant-candidate-ranking.ts`
- Delete: `apps/server/src/channels/domain/channel-sku-automatic-match.ts`
- Replace: `apps/server/src/channels/application/service/channel-sku-mapping.service.ts` with `channel-product-matching.service.ts`
- Replace: `apps/server/src/channels/application/port/out/repository/channel-sku-mapping.repository.port.ts` with `channel-product-matching.repository.port.ts`
- Replace: `apps/server/src/channels/adapter/out/repository/channel-sku-mapping.repository.adapter.ts` with `channel-product-matching.repository.adapter.ts`
- Replace: `apps/server/src/channels/adapter/in/http/channel-sku-mapping.controller.ts` with `channel-product-matching.controller.ts`
- Modify: `apps/server/src/channels/application/service/channel-sku-availability.service.ts`
- Modify: `apps/server/src/channels/application/service/marketplace-registration.service.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/marketplace-registration.repository.adapter.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-catalog-identity-upsert.ts`
- Modify: `apps/server/src/channels/channels.module.ts`
- Modify tests under: `apps/server/src/channels/**/*.spec.ts`

### Step 1: Prove capacity and product aggregate policies with pure tests

- [ ] Write `product-variant-capacity.spec.ts` with exact cases:
  - one SKU quantity 1: stock 7 -> capacity 7;
  - multipack quantity 3: stock 8 -> capacity 2;
  - two components `(10/2, 7/1)` -> capacity 5 and first component bottleneck;
  - no components -> `configuration_required`, capacity null;
  - inactive/missing component -> `review_required`, capacity null;
  - product distinct stock counts one shared SKU once across variants;
  - product status priority is review required, configuration required, partial out of stock, out of stock, sellable.
- [ ] Implement pure functions with explicit input/output types:

  ```ts
  projectVariantCapacity(components): VariantCapacityProjection
  projectProductInventory(variants): ProductInventoryProjection
  ```

  Never query Prisma or freshness state from these functions.
- [ ] Run the spec and expect PASS before writing repositories.

### Step 2: Add product operations application behavior with TDD

- [ ] Write service tests first for:
  - product creation atomically creates supplied variants or one default variant;
  - product and variant codes are unique per organization;
  - recipe replacement is complete and atomic, rejects duplicates/non-positive quantities/foreign or inactive SKUs, and records confirmer/time;
  - a product can remain visible with a variant in `configuration_required`;
  - list/detail aggregate physical SKU stock distinctly and expose variant capacity;
  - period metrics aggregate linked `ChannelListing`/daily facts and remain null when the source fact is absent rather than returning invented zero.
- [ ] Implement these endpoints under one `ProductsModule` that also imports the existing `CategoriesModule`:

  ```text
  GET    /api/products/masters
  POST   /api/products/masters
  GET    /api/products/masters/:masterProductId
  PATCH  /api/products/masters/:masterProductId
  POST   /api/products/masters/:masterProductId/variants
  PATCH  /api/products/variants/:productVariantId
  PUT    /api/products/variants/:productVariantId/components
  ```

- [ ] Keep list and detail reads in the repository adapter. Use SQL/Prisma aggregation that deduplicates `SellpiaInventorySku.id`; never sum per-variant presentation stock for a product or portfolio total.
- [ ] Add PG integration cases for organization isolation, shared SKU deduplication, default variant creation, recipe replacement, inactive component warning, and product/listing aggregates.

### Step 3: Replace channel recipe matching with product/variant confirmation

- [ ] Write channel service and PG tests first for:
  - channel-first collection leaves both links null;
  - listing candidate generation never writes `masterProductId`;
  - option candidate generation is unavailable until the listing has a confirmed product;
  - confirming a product link is organization-scoped;
  - confirming an option link rejects a variant owned by another product;
  - unmatching a listing clears its option variant links in the same transaction;
  - recollection updates provider facts but preserves confirmed links;
  - KidItem-first marketplace registration writes exact `masterProductId` and option-to-variant links atomically;
  - normalized name and AI candidates are suggestions only.
- [ ] Expose these endpoints:

  ```text
  GET /api/channels/product-mappings
  GET /api/channels/product-mappings/:channelListingId/candidates
  PUT /api/channels/product-mappings/:channelListingId/master-product
  GET /api/channels/product-mappings/options/:channelListingOptionId/candidates
  PUT /api/channels/product-mappings/options/:channelListingOptionId/product-variant
  ```

- [ ] Delete component replacement/status-refresh routes. Matching responses show the selected variant's inherited recipe and capacity read-only; recipe edits go only through Products.
- [ ] Split candidate ranking into product and variant policies. Ordered evidence is existing exact identity, explicit code/barcode, normalized names, AI suggestion, and manual search. Only the KidItem-first registration command is allowed to persist links without the confirmation endpoints.
- [ ] Change channel availability hydration to resolve:

  ```text
  ChannelListingOption
    -> ProductVariant
    -> ProductVariantComponent
    -> SellpiaInventorySku
  ```

  Return unmatched/configuration/review warnings without mutating confirmed links.

### Step 4: Verify backend behavior and module wiring

- [ ] Run:

  ```bash
  npm exec --workspace=apps/server vitest -- run src/products src/channels
  npm run test:integration --workspace=apps/server -- src/products/__tests__/product-operations.repository.pg.integration.spec.ts src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts src/channels/__tests__/channel-catalog-publication.repository.pg.integration.spec.ts
  ```

  Rename the channel PG spec to `channel-product-matching.pg.integration.spec.ts` when the old adapter is deleted.
- [ ] Confirm the running backend watch process recompiles and all new routes appear without a Nest dependency error.
- [ ] Use authenticated API calls to create one product with a simple variant, one multipack variant, and one shared component; verify detail and channel availability return the pure-policy capacities.
- [ ] Ask for one Sol review focused on aggregate correctness, transaction boundaries, candidate side effects, tenant fences, and service size. Apply findings and rerun Task 3 gates.
- [ ] Commit:

  ```bash
  git add apps/server/src/products apps/server/src/channels apps/server/src/app.module.ts packages/shared/src/channel-product-matching.ts packages/shared/src/schemas/channel-product-matching.ts
  git commit -m "feat: connect products variants and channel listings"
  ```

---

## Task 4: Rewire the preserved product UI without adding another hub

**Review boundary:** Existing URLs and visual composition remain available, but each page reads the correct owner. No raw Sellpia row is presented as a KidItem product.

**Files:**

- Modify: `apps/web/src/lib/query-keys.ts`
- Modify: `apps/web/src/lib/query-keys.spec.ts`
- Modify: `apps/web/src/components/layout/sidebar-menu.ts`
- Modify: `apps/web/src/components/layout/__tests__/Sidebar.product-pipeline.spec.ts`
- Modify: `apps/web/src/app/(catalog)/AGENTS.md`
- Modify: `apps/web/src/app/(catalog)/product-hub/AGENTS.md`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/AGENTS.md`
- Modify: `apps/web/src/app/(catalog)/product-hub/page.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/hooks/useProductHubPageState.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/hooks/useProductHubPageState.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/components/ProductsPageContent.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/components/ProductsPageContent.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/components/ProductRowCard.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/components/ProductsColumnHeader.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/components/ProductOperationsCommandCenter.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/components/ProductCategoryTabs.tsx`
- Create: `apps/web/src/app/(catalog)/product-hub/components/ProductEditorDialog.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/[id]/page.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/[id]/page.spec.tsx`
- Create: `apps/web/src/app/(catalog)/product-hub/[id]/components/ProductVariantPanel.tsx`
- Create: `apps/web/src/app/(catalog)/product-hub/[id]/components/VariantRecipeDialog.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/options/page.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/options/components/SellpiaOptionTable.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/options/components/SellpiaOptionFilters.tsx`
- Replace matching files under: `apps/web/src/app/(catalog)/product-hub/matching/`

### Step 1: Protect the preserved screen composition with failing tests

- [ ] Update route/component tests so `/product-hub` must retain:
  - `상품 운영 센터` header and existing command-card/category/filter/metrics/table composition;
  - period controls, product create control, search/filter URL state, and product detail links;
  - traffic, order, sales, advertising, profitability, and inventory columns;
  - no request to `/api/inventory/sellpia-skus` from the main list/detail.
- [ ] Add tests that `/product-hub/options` still reads `/api/inventory/sellpia-skus`, renders every linked and unlinked SKU, and never exposes an editable stock field.
- [ ] Add matching page tests for explicit product confirmation first and option-to-variant confirmation second. Assert that recipe and capacity are read-only and link to the product detail recipe editor.
- [ ] Run:

  ```bash
  npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub'
  ```

  Expected: FAIL because the main hub/detail still parse the inventory snapshot and matching still edits channel-owned components.

### Step 2: Rewire `/product-hub` and product detail

- [ ] Add `queryKeys.products` families for list, detail, and mutations. Keep `queryKeys.inventory` for `/product-hub/options` and shared freshness state only.
- [ ] Change `useProductHubPageState` to call `/api/products/masters` with URL-authoritative search, page, period, category, active state, inventory state, ABC grade, and ad state.
- [ ] Adapt the preserved cards/columns/rows to `ProductOperationsListItem`. Display unavailable source metrics as `미수집`, not zero. Display derived inventory warnings as `구성 필요` or `검토 필요` with warning-centered styling.
- [ ] Enable product create/edit through `ProductEditorDialog`; successful mutations invalidate product list/detail keys only. Creating without supplied variants relies on the backend default variant invariant.
- [ ] Rewire `[id]/page.tsx` to `/api/products/masters/:id`. Add variant cards with capacity, bottleneck, component identity, and a complete-recipe dialog. Do not restore the deleted legacy editable option-management page.

### Step 3: Keep Sellpia inventory read-only and replace matching interaction

- [ ] Keep `/product-hub/options` at its current URL as the full Sellpia read-only table. Rename its sidebar label from `상품 옵션 관리` to `셀피아 재고`; do not add a seventh top-level navigation section.
- [ ] Change table identity to `sellpiaInventorySkuId`; show link state and linked product/variant destinations. Product links are present only when the SKU has confirmed component relations.
- [ ] Replace `ChannelSkuComponentDialog` and `component-draft.ts` with:
  - `ProductLinkDialog.tsx` for listing -> `MasterProduct`;
  - `VariantLinkDialog.tsx` for option -> `ProductVariant`;
  - read-only `VariantRecipeSummary.tsx` for inherited Sellpia components and capacity.
- [ ] Replace `channel-sku-matching-api.ts`/hook types with the new channel product-matching contract. Candidate generation and confirmation use separate mutations; opening or ranking candidates never mutates server state.
- [ ] Keep the sidebar top-level sections exactly `상품 관리 / 주문관리 / 재고관리 / 출고반품 / 거래처 / 재무분석`, and preserve existing order collection and Rocket URLs/UI.

### Step 4: Verify in watch mode, then run the production build gate

- [ ] Start or reuse frontend watch mode:

  ```bash
  npm run dev --workspace=apps/web
  ```

  Expected: Next dev server stays running and recompiles affected routes without a runtime error.
- [ ] Run focused tests, then the build:

  ```bash
  npm exec --workspace=apps/web vitest -- run 'src/app/(catalog)/product-hub' src/components/layout/__tests__/Sidebar.product-pipeline.spec.ts
  npm run build --workspace=apps/web
  ```

  Expected: all focused tests pass and the production build lists `/product-hub`, `/product-hub/[id]`, `/product-hub/options`, and `/product-hub/matching`.
- [ ] Use Chrome at desktop and narrow widths to verify the list, detail, options, and matching pages. Compare `/product-hub` and the sidebar to the preserved commit `c9e7caf875ca82574ae566a27fe0afa35c988918`; only data wiring, enabled product actions, warnings, and explicitly added dialogs may differ.
- [ ] Ask for one Sol visual/code review focused on accidental screen replacement, URL regressions, loading/error/empty states, accessibility, and incorrect source ownership. Apply findings and rerun Task 4 gates.
- [ ] Commit:

  ```bash
  git add apps/web/src/app/'(catalog)' apps/web/src/lib/query-keys.ts apps/web/src/lib/query-keys.spec.ts apps/web/src/components/layout
  git commit -m "feat: restore product operations workflows"
  ```

---

## Task 5: Reconnect orders and purchasing, rebuild dev data, and prove the real Sellpia flow

**Review boundary:** All downstream consumers use the new identities, the database is rebuilt without legacy product rows, and automated Chrome collection proves the actual workbook and UI end to end.

**Files:**

- Modify: `apps/server/src/supply/application/service/purchase-order-submission.service.ts`
- Modify: `apps/server/src/supply/application/service/purchase-order-draft.service.ts`
- Modify: `apps/server/src/supply/application/service/rocket-purchase-preview.service.ts`
- Modify: `apps/server/src/supply/domain/policy/rocket-capacity-preview.ts`
- Modify: `apps/server/src/supply/adapter/out/repository/procurement.repository.adapter.ts`
- Modify: `apps/server/src/supply/adapter/out/repository/supplier.repository.adapter.ts`
- Modify: `apps/server/src/supply/adapter/in/http/dto/*.ts`
- Modify: `apps/server/src/orders/return-transfers/return-transfers.service.ts`
- Modify: `apps/server/src/orders/return-transfers/dto/*.ts`
- Modify: `apps/server/src/orders/__tests__/orders-stock-boundary.spec.ts`
- Modify: `packages/shared/src/schemas/rocket-purchase-preview.ts`
- Modify: `packages/shared/src/schemas/rocket-purchase-preview.spec.ts`
- Modify: `scripts/bootstrap-authoritative-inventory-dev.ts`
- Modify: `scripts/authoritative-inventory-rebuild.ts`
- Modify: `scripts/check-sellpia-cutover-preflight.ts`
- Modify: `scripts/__tests__/bootstrap-authoritative-inventory-dev.spec.ts`
- Modify: `scripts/__tests__/authoritative-inventory-rebuild.spec.ts`
- Modify: `scripts/__tests__/guarded-authoritative-rebuild-workflow.test.mjs`
- Modify: `scripts/__tests__/check-sellpia-cutover-preflight.spec.ts`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DEV_DATA_BUNDLES.md`
- Modify: `docs/runbooks/sellpia-inventory-freshness.md`
- Modify: `docs/runbooks/channel-sellpia-matching.md`
- Verify: `extensions/order-collector/background/sellpia-inventory.js`
- Verify: `extensions/order-collector/background/service-worker.js`
- Modify/extend: `extensions/tests/order-collector-sellpia-inventory.test.mjs`
- Create: `apps/server/src/inventory/__tests__/sellpia-product-operations.e2e.spec.ts`

### Step 1: Turn downstream identity/capacity tests red

- [ ] Update Supply/Orders/Rocket fixtures from `masterProductId` physical references to `sellpiaInventorySkuId` and from channel components to linked product variants.
- [ ] Add tests that:
  - purchase submission freshness-gates the exact distinct component SKU IDs;
  - Rocket preview uses the linked variant capacity and blocks unmatched, configuration-required, review-required, stale, syncing, and failed states;
  - a shared component appears once in the freshness read even when multiple PO lines use the same variant;
  - successful order transmission schedules a later Sellpia refresh and does not predict or decrement stock;
  - return transfers validate an owned physical SKU;
  - non-Rocket purchasing continues to work with physical `SellpiaInventorySku` references.
- [ ] Run selected suites and expect FAIL before implementation:

  ```bash
  npm exec --workspace=apps/server vitest -- run src/supply src/orders/__tests__/orders-stock-boundary.spec.ts src/orders/return-transfers/return-transfers.service.spec.ts
  ```

### Step 2: Complete downstream services and remove compatibility names

- [ ] Change purchase draft/item DTOs and repositories to `sellpiaInventorySkuId`; keep supplier pricing attached to the physical SKU.
- [ ] Change Rocket preview rows to expose `masterProductId`, `productVariantId`, and component `sellpiaInventorySkuId` distinctly. Use the channel availability projection; do not reimplement capacity math in Supply.
- [ ] Pass distinct physical SKU IDs into the existing freshness gate immediately before a freshness-sensitive preview/submission decision.
- [ ] Update return-transfer DTO/service and any remaining Inventory operation HTTP contracts to physical SKU naming.
- [ ] Remove the temporary old publication counter/ID aliases from Task 2 after `rg` proves there are no consumers.
- [ ] Run:

  ```bash
  rtk rg -n 'ChannelSkuComponent|channel_sku_components|SellpiaMasterProduct|masterProductId.*currentStock|findMasterProducts' apps packages scripts prisma
  ```

  Expected: no ownership violation; remaining `masterProductId` occurrences are product-level operations or explicit product links.

### Step 3: Rebuild development data with no legacy product migration

- [ ] Change rebuild readiness counts from `activeMasters` to separate `activeSellpiaInventorySkus`, `masterProducts`, `productVariants`, `linkedListings`, and `linkedOptions`.
- [ ] Keep destructive rebuild guards. Local reset accepts only a localhost database name without `prod`, `production`, or `staging`; shared reset remains GitHub Actions/environment guarded.
- [ ] Bootstrap only organization, membership/user, and channel account metadata. Replay:
  1. the current Sellpia workbook into `SellpiaInventorySku`;
  2. current channel catalogs into unlinked listings/options;
  3. explicit product/variant/recipe/link development bundles when provided.
- [ ] Do not transform old physical `MasterProduct` rows into new products and do not group by normalized names.
- [ ] Run script tests:

  ```bash
  npm run test:scripts
  ```

  Expected: all script/unit contract tests pass, including guarded rebuild and readiness counts.

### Step 4: Prove automated real workbook download and publication

- [ ] Extend the extension test to assert the collector, without a visible-button click:
  - opens/reuses an inactive `https://kiditem.sellpia.com/product_list_total.html` tab;
  - validates `#div_prod_down #downForm` and `#down_act` only as contract evidence;
  - posts `downopt=2` and `downtype=excel` directly to `/product_search.down.html`;
  - rejects login HTML, changed selector/form action, unsupported/oversized workbooks, and timeouts;
  - returns only bounded workbook bytes and non-secret metadata.
- [ ] Run:

  ```bash
  node --test extensions/tests/order-collector-sellpia-inventory.test.mjs
  ```

  Expected: PASS.
- [ ] With backend and frontend watch processes running, Chrome open, the unpacked extension current, and Sellpia already authenticated, create a real refresh request from KidItem. Do not click Sellpia's download button. Observe the coordinator claim, inactive-tab scraper request, upload, parse, and successful publication.
- [ ] Record non-secret evidence in the test report: run ID, workbook filename, byte size, parsed row count, import-run ID, previous/new verified generation, and counts of active/unlinked SKUs. Never record cookies, credentials, response headers, workbook contents, or raw DOM.
- [ ] In `sellpia-product-operations.e2e.spec.ts`, use the downloaded workbook fixture only after redacting/isolating it outside git, then verify publication -> explicit product/default variant -> recipe -> channel listing/option links -> product list/detail -> availability -> Rocket preview all share the same SKU IDs and stock values.

### Step 5: Full UI and repository verification

- [ ] In Chrome, verify these user stories against the rebuilt current development database:
  1. `/product-hub` shows only explicitly created KidItem products.
  2. `/product-hub/options` shows the complete Sellpia snapshot, including unlinked rows.
  3. `/product-hub/matching` confirms product then variant; opening candidates alone changes nothing.
  4. order collection preserves the baseline screen and successful Sellpia transmission schedules refresh.
  5. `/rocket-orders` preserves its baseline UI and replaces the old placeholder with the freshness/capacity result.
  6. stale/failed inventory is warning-centered and blocks purchase decisions but does not hide products.
- [ ] Run the complete gates:

  ```bash
  npm run db:push -- --accept-data-loss
  npx prisma generate
  npm run build --workspace=packages/shared
  npm exec --workspace=apps/server vitest -- run
  npm run test:integration --workspace=apps/server
  npm run test --workspace=apps/web
  npm run test:scripts
  node --test extensions/tests/*.test.mjs
  npm run check:tenant-scope
  npm run check:directory-architecture
  npm run build --workspace=apps/web
  npm run build --workspace=apps/server
  ```

  Expected: all tests/guards/builds pass. `npm run dev:server` has already proven Nest boot in watch mode; final server build proves compile output.
- [ ] Update architecture/runbooks to show the final ownership graph, one combined manual/automatic import history, actual background download contract, product/variant linking flow, and rebuilt development data expectations. Remove language that calls physical Sellpia rows `MasterProduct`.
- [ ] Ask for one final Sol review of the complete branch, including UI screenshots and real-download evidence. Apply findings and rerun every affected gate plus `git diff --check`.
- [ ] Commit:

  ```bash
  git add apps/server/src/supply apps/server/src/orders packages/shared/src/schemas/rocket-purchase-preview.ts scripts extensions/tests docs apps/server/src/inventory/__tests__/sellpia-product-operations.e2e.spec.ts
  git commit -m "feat: complete sellpia-backed product operations"
  ```

## Completion Criteria

- `MasterProduct` cannot be mistaken for a Sellpia stock row in schema, types, APIs, or UI.
- A physical Sellpia SKU has one current-stock owner and can participate in multiple variants without duplicate channel recipes.
- Product list stock is deduplicated physical stock; variant capacity uses the bottleneck formula; portfolio totals query physical SKUs directly.
- KidItem-first registration persists exact product/variant links; channel-first collection and all heuristic/AI candidates require confirmation.
- Existing product, order collection, and Rocket screens remain recognizable at their existing URLs; added functions integrate into them.
- The real Chrome collector obtains the option-product workbook programmatically and the resulting published stock is visible consistently in product operations, matching, orders, and purchasing.
- All five Task reviews and the full verification matrix pass with no unresolved findings.
