# Sellpia-Authoritative Inventory Cutover Implementation Plan

> **SUPERSEDED:** Do not execute this plan. The authoritative design is
> `docs/superpowers/specs/archive/2026-07-12-sellpia-authoritative-inventory-cutover-design.md`.
> A replacement implementation plan has not yet been approved.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace KidItem's ProductOption-owned mutable stock system with a Sellpia-imported `InventorySku.currentStock` snapshot, preserve the inventory routes on truthful read models, and rebuild the disposable development database from the two approved workbooks.

**Architecture:** Inventory owns the only stock writer and the paginated Sellpia snapshot read. Channels owns component recipes and nullable sellable-capacity projections. All consumers either read those owner projections or remove stock claims that the new model cannot support; after the consumer guard reaches zero, delete the obsolete runtime and schema before a guarded development DB reset.

**Tech Stack:** TypeScript, Prisma 7 multi-file schema, PostgreSQL, NestJS, Zod, Next.js App Router, React Query, Vitest, Testing Library, real XLS/XLSX imports.

## Global Constraints

- The latest completed Sellpia workbook is the only current-stock truth.
- `InventorySku.currentStock` is writable only by the Sellpia full-snapshot importer.
- Channel availability is `min(floor(component.currentStock / component.quantity))`; an unmapped SKU returns `null`, not zero.
- No receipt, issue, adjustment, reservation, reconciliation, or procurement decision may mutate or shadow current stock.
- Keep `/inventory-hub`, `/inventory`, `/stock-ops`, and useful operator destinations; replace their implementation and copy.
- Do not present snapshot differences as verified receipt or issue history.
- ProductOption and MasterProduct do not receive a replacement aggregate stock field.
- Preserve Warehouse, Shipment, Unshipped, receipt-upload, return, transfer, and picking only as record-only capabilities.
- Destructively reset only a verified local/development database; refuse staging/production-looking targets.
- Do not alter or stage the user's workbook files.
- Bump root `VERSION` from `0.1.8` to `0.1.9`.

## Target File Structure

- `packages/shared/src/schemas/inventory-snapshot.ts`: snapshot, assets, and import-run contracts.
- `apps/server/src/inventory/application/port/in/stock/inventory-sku-snapshot-list.port.ts`: HTTP-facing owner capability.
- `apps/server/src/inventory/adapter/out/repository/inventory-sku-snapshot-list.repository.adapter.ts`: tenant-scoped list, summary, and history reads.
- `packages/shared/src/schemas/channel-sku-availability.ts`: stock-ops and cross-domain capacity contracts.
- `apps/server/src/channels/domain/channel-sku-sellable-stock.ts`: pure capacity formula.
- `apps/server/src/channels/application/port/in/channel-sku-availability.port.ts`: owner-published availability capability.
- `apps/web/src/app/(inventory)/inventory/`: read-only snapshot at the existing route.
- `apps/web/src/app/(inventory)/inventory-hub/`: snapshot, import, history, assets, and capacity tabs.
- `apps/web/src/app/(inventory)/stock-ops/`: zero-stock, bottleneck, mapping, value, and freshness views.
- `scripts/__tests__/sellpia-authoritative-inventory-contract.test.mjs`: zero-legacy/one-writer guard.
- `scripts/bootstrap-authoritative-inventory-dev.ts`: local-only identity/account bootstrap after reset.

---

### Task 1: Make InventorySku the Authoritative Owner Contract

**Files:**
- Create: `packages/shared/src/schemas/inventory-snapshot.ts`
- Create: `packages/shared/src/schemas/inventory-snapshot.spec.ts`
- Modify: `packages/shared/src/inventory.ts`
- Modify: `packages/shared/src/schemas/channel-sku-matching.ts`
- Modify: `packages/shared/src/schemas/channel-sku-matching.spec.ts`
- Modify: `prisma/models/inventory.prisma`
- Modify: `apps/server/src/inventory/application/service/sellpia-inventory-workbook.parser.ts`
- Modify: `apps/server/src/inventory/application/service/sellpia-inventory-workbook.parser.spec.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/inventory-sku-import.repository.adapter.ts`
- Modify: `apps/server/src/inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts`
- Modify: `apps/server/src/inventory/application/port/in/stock/inventory-sku-read.port.ts`
- Modify: `apps/server/src/inventory/application/service/inventory-sku-read.service.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/inventory-sku-read.repository.adapter.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/inventory-sku-read.repository.adapter.spec.ts`
- Create: `apps/server/src/inventory/application/port/in/stock/inventory-sku-snapshot-list.port.ts`
- Create: `apps/server/src/inventory/application/port/out/repository/inventory-sku-snapshot-list.repository.port.ts`
- Create: `apps/server/src/inventory/application/service/inventory-sku-snapshot-list.service.ts`
- Create: `apps/server/src/inventory/application/service/inventory-sku-snapshot-list.service.spec.ts`
- Create: `apps/server/src/inventory/adapter/out/repository/inventory-sku-snapshot-list.repository.adapter.ts`
- Create: `apps/server/src/inventory/__tests__/inventory-sku-snapshot-list.repository.pg.integration.spec.ts`
- Create: `apps/server/src/inventory/adapter/in/http/dto/list-inventory-skus-query.dto.ts`
- Create: `apps/server/src/inventory/adapter/in/http/dto/list-sellpia-import-runs-query.dto.ts`
- Create: `apps/server/src/inventory/adapter/in/http/inventory-sku-snapshot.controller.ts`
- Create: `apps/server/src/inventory/adapter/in/http/inventory-sku-snapshot.controller.spec.ts`
- Modify: `apps/server/src/inventory/adapter/in/http/dto/index.ts`
- Modify: `apps/server/src/inventory/inventory.module.ts`
- Modify: `apps/server/src/inventory/__tests__/inventory.module.wiring.spec.ts`
- Modify: `scripts/__tests__/channel-sellpia-matching-schema-contract.test.mjs`
- Modify: `apps/server/src/channels/domain/channel-sku-candidate-ranking.ts`
- Modify: `apps/server/src/channels/domain/channel-sku-candidate-ranking.spec.ts`
- Modify: `apps/server/src/channels/application/service/channel-sku-mapping.service.ts`
- Modify: `apps/server/src/channels/application/service/__tests__/channel-sku-mapping.service.spec.ts`
- Modify: `apps/server/src/channels/adapter/out/inventory/inventory-sku-read.adapter.ts`
- Modify: `apps/server/src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts`
- Modify: `apps/server/src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/lib/component-draft.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/lib/component-draft.spec.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/components/ChannelSkuMappingTable.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/components/ChannelSkuComponentDialog.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/lib/channel-sku-matching-api.spec.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/components/__tests__/ChannelSkuComponentDialog.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/components/__tests__/ChannelSkuComponentDialog.refetch.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/components/__tests__/ChannelSkuMappingTable.spec.tsx`

**Interfaces:**
- Produces: `InventorySkuSnapshotListResponse`, `SellpiaImportRunListResponse`, `INVENTORY_SKU_SNAPSHOT_LIST_PORT`, `GET /api/inventory/sellpia-skus`, and `GET /api/inventory/sellpia-sync/import-runs`.
- Preserves: identifier/search methods on `INVENTORY_SKU_READ_PORT`, now returning `currentStock`.

- [ ] **Step 1: Write failing shared-contract and schema-guard tests**

```ts
expect(InventorySkuSnapshotListResponseSchema.parse({
  items: [{
    id: skuId,
    sellpiaProductCode: 'SP-001',
    name: '상품',
    optionName: null,
    barcode: null,
    currentStock: 8,
    purchasePrice: 1000,
    salePrice: null,
    stockValue: 8000,
    lastImportRunId: runId,
    lastImportedAt: '2026-07-12T00:00:00.000Z',
  }],
  total: 1,
  page: 1,
  limit: 50,
  summary: {
    totalSkus: 1,
    inStockSkus: 1,
    outOfStockSkus: 0,
    totalUnits: 8,
    pricedAssetValue: 8000,
    unpricedSkuCount: 0,
  },
  latestImport: {
    id: runId,
    fileName: 'exported-list (3).xls',
    status: 'completed',
    rowCount: 1964,
    importedAt: '2026-07-12T00:00:00.000Z',
  },
})).toBeDefined();
```

The schema guard must expect `currentStock @map("current_stock")` and reject `reportedStock`/`reported_stock`.

- [ ] **Step 2: Run the narrow tests and confirm RED**

```bash
npm exec --workspace=packages/shared vitest -- run \
  src/schemas/inventory-snapshot.spec.ts \
  src/schemas/channel-sku-matching.spec.ts
node --test scripts/__tests__/channel-sellpia-matching-schema-contract.test.mjs
```

Expected: FAIL because the snapshot schemas and `currentStock` contract do not exist.

- [ ] **Step 3: Rename the owner field and importer end to end**

```prisma
model InventorySku {
  id                 String  @id @default(uuid()) @db.Uuid
  organizationId     String  @map("organization_id") @db.Uuid
  sellpiaProductCode String  @map("sellpia_product_code")
  name               String
  optionName         String? @map("option_name")
  barcode            String?
  currentStock       Int     @default(0) @map("current_stock")
  purchasePrice      Int?    @map("purchase_price")
  salePrice          Int?    @map("sale_price")
  rawJson            Json?   @map("raw_json")
  lastImportRunId    String? @map("last_import_run_id") @db.Uuid
}
```

Rename parser types, raw-SQL payload keys/columns, Prisma selectors, channel bridge rows, mapping responses, candidate rows, and visible copy. Keep the importer as the only writer and preserve absent-code zeroing.

- [ ] **Step 4: Implement the focused snapshot contracts**

```ts
export const InventorySkuStockStatusSchema = z.enum(['all', 'in_stock', 'out_of_stock']);

export const InventorySkuSnapshotListResponseSchema = z.object({
  items: z.array(InventorySkuSnapshotItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  summary: InventorySkuSnapshotSummarySchema,
  latestImport: SellpiaImportRunSummarySchema.nullable(),
});
```

Reject negative stock/prices, keep nullable prices, and set `stockValue` null when purchase price is null. `SellpiaImportRunListResponseSchema` contains item array, total, page, and limit.

- [ ] **Step 5: Write failing service, controller, and PostgreSQL tests**

Assert organization isolation; search over code/name/option/barcode; `currentStock > 0` and `= 0` filters; code/ID stable ordering; organization-wide summary; latest completed null-account Sellpia import; newest-first history; and static controller registration before dynamic inventory routes.

- [ ] **Step 6: Run the server tests and confirm RED**

```bash
npm exec --workspace=apps/server vitest -- run \
  src/inventory/application/service/inventory-sku-snapshot-list.service.spec.ts \
  src/inventory/adapter/in/http/inventory-sku-snapshot.controller.spec.ts \
  src/inventory/__tests__/inventory.module.wiring.spec.ts
```

Expected: FAIL because the port, service, controller, and providers do not exist.

- [ ] **Step 7: Implement list capability and module wiring**

```ts
export interface InventorySkuSnapshotListPort {
  listSnapshot(
    organizationId: string,
    query: InventorySkuSnapshotListQuery,
  ): Promise<InventorySkuSnapshotListResponse>;
  listImportRuns(
    organizationId: string,
    query: { page?: number; limit?: number },
  ): Promise<SellpiaImportRunListResponse>;
}
```

The controller passes only `@CurrentOrganization()` tenancy. DTOs default to page 1/limit 50, cap limit at 200, trim search, and validate stock status. Prisma stays under `adapter/out/repository`.

- [ ] **Step 8: Verify GREEN and commit Task 1**

```bash
npm exec --workspace=packages/shared vitest -- run \
  src/schemas/inventory-snapshot.spec.ts \
  src/schemas/channel-sku-matching.spec.ts
npm exec --workspace=apps/server vitest -- run src/inventory
npm run test:integration --workspace=apps/server -- \
  src/inventory/__tests__/inventory-sku-snapshot-list.repository.pg.integration.spec.ts \
  src/inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts
npx prisma generate
npm run build --workspace=packages/shared
```

Expected: all commands exit 0.

```bash
git add packages/shared/src prisma/models/inventory.prisma apps/server/src/inventory \
  apps/server/src/channels apps/web/src/app/\(catalog\)/product-hub/matching \
  scripts/__tests__/channel-sellpia-matching-schema-contract.test.mjs
git commit -m "feat: make Sellpia stock the inventory owner contract"
```

---

### Task 2: Publish Channel SKU Sellable Capacity

**Files:**
- Create: `packages/shared/src/schemas/channel-sku-availability.ts`
- Create: `packages/shared/src/schemas/channel-sku-availability.spec.ts`
- Create: `packages/shared/src/channel-sku-availability.ts`
- Modify: `packages/shared/package.json`
- Modify: `packages/shared/tsup.config.ts`
- Create: `apps/server/src/channels/domain/channel-sku-sellable-stock.ts`
- Create: `apps/server/src/channels/domain/channel-sku-sellable-stock.spec.ts`
- Create: `apps/server/src/channels/application/port/in/channel-sku-availability.port.ts`
- Modify: `apps/server/src/channels/application/port/out/repository/channel-sku-mapping.repository.port.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-sku-mapping.repository.adapter.ts`
- Create: `apps/server/src/channels/application/service/channel-sku-availability.service.ts`
- Create: `apps/server/src/channels/application/service/__tests__/channel-sku-availability.service.spec.ts`
- Create: `apps/server/src/channels/adapter/in/http/dto/channel-sku-availability-query.dto.ts`
- Create: `apps/server/src/channels/adapter/in/http/channel-sku-availability.controller.ts`
- Create: `apps/server/src/channels/adapter/in/http/channel-sku-availability.controller.spec.ts`
- Modify: `apps/server/src/channels/application/service/channel-sku-mapping.service.ts`
- Modify: `apps/server/src/channels/application/service/__tests__/channel-sku-mapping.service.spec.ts`
- Modify: `apps/server/src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts`
- Modify: `apps/server/src/channels/channels.module.ts`
- Modify: `apps/server/src/channels/__tests__/channels.module.wiring.spec.ts`

**Interfaces:**
- Consumes: Inventory owner rows with `currentStock`.
- Produces: `CHANNEL_SKU_AVAILABILITY_PORT`, `GET /api/channels/sku-availability`, nullable `sku.sellableStock`, and component bottleneck metadata.

- [ ] **Step 1: Write and run failing pure-policy tests**

```ts
expect(projectChannelSkuSellableStock([])).toBeNull();
expect(projectChannelSkuSellableStock([{ currentStock: 12, quantity: 1 }])).toBe(12);
expect(projectChannelSkuSellableStock([{ currentStock: 80, quantity: 8 }])).toBe(10);
expect(projectChannelSkuSellableStock([
  { currentStock: 12, quantity: 1 },
  { currentStock: 9, quantity: 2 },
])).toBe(4);
expect(projectChannelSkuSellableStock([{ currentStock: 0, quantity: 8 }])).toBe(0);
```

```bash
npm exec --workspace=apps/server vitest -- run \
  src/channels/domain/channel-sku-sellable-stock.spec.ts
```

Expected: FAIL because the policy does not exist.

- [ ] **Step 2: Implement the pure projection and shared contracts**

```ts
export function projectChannelSkuSellableStock(
  components: readonly { currentStock: number; quantity: number }[],
): number | null {
  if (components.length === 0) return null;
  if (components.some((component) => component.quantity <= 0)) {
    throw new Error('ChannelSku component quantity must be positive');
  }
  return Math.min(
    ...components.map((component) =>
      Math.floor(component.currentStock / component.quantity)),
  );
}
```

Availability status is `all | in_stock | out_of_stock | unmatched | needs_review`. Each item contains account, product, SKU, mapping status, nullable `sellableStock`, and components with current stock, component capacity, and `isBottleneck`. Summary contains total, in-stock, out-of-stock, unmatched, and needs-review counts.

- [ ] **Step 3: Write and run failing availability service/controller tests**

Assert null for unmatched; integrity failure for a missing InventorySku; correct status filter/paging after calculation; organization scope on account/import/listing/component/inventory rows; exact `findByChannelSkuIds` and `findByListingIds`; and zero writes.

```bash
npm exec --workspace=apps/server vitest -- run \
  src/channels/application/service/__tests__/channel-sku-availability.service.spec.ts \
  src/channels/adapter/in/http/channel-sku-availability.controller.spec.ts
```

Expected: FAIL because the capability is missing.

- [ ] **Step 4: Implement and export the owner capability**

```ts
export interface ChannelSkuAvailabilityPort {
  list(
    organizationId: string,
    query: ChannelSkuAvailabilityQuery,
  ): Promise<ChannelSkuAvailabilityListResponse>;
  findByChannelSkuIds(
    organizationId: string,
    ids: string[],
  ): Promise<ChannelSkuAvailabilityItem[]>;
  findByListingIds(
    organizationId: string,
    ids: string[],
  ): Promise<ChannelSkuAvailabilityItem[]>;
}
```

Bind and export only the token. Reuse the hydrator in `ChannelSkuMappingService` so matching and stock-ops cannot disagree.

- [ ] **Step 5: Verify GREEN and commit Task 2**

```bash
npm exec --workspace=packages/shared vitest -- run \
  src/schemas/channel-sku-availability.spec.ts \
  src/schemas/channel-sku-matching.spec.ts
npm exec --workspace=apps/server vitest -- run src/channels
npm run test:integration --workspace=apps/server -- \
  src/channels/__tests__/channel-sku-mapping.pg.integration.spec.ts
```

Expected: all commands exit 0.

```bash
git add packages/shared apps/server/src/channels
git commit -m "feat: project channel SKU sellable stock"
```

---

### Task 3: Cut Every Server Consumer Off Legacy Stock

**Files:**
- Modify: `packages/shared/src/schemas/product.ts`
- Modify: `packages/shared/src/schemas/product.spec.ts`
- Modify: `packages/shared/src/schemas/dashboard.ts`
- Modify: `packages/shared/src/schemas/dashboard.spec.ts`
- Modify: `apps/server/src/products/products.module.ts`
- Modify: `apps/server/src/products/application/service/options.service.ts`
- Modify: `apps/server/src/products/application/service/bundle-components.service.ts`
- Modify: `apps/server/src/products/adapter/out/repository/product-catalog.query.ts`
- Modify: `apps/server/src/products/mapper/product-catalog.mapper.ts`
- Modify: `apps/server/src/products/application/port/out/repository/product-catalog.repository.port.ts`
- Modify: `apps/server/src/products/adapter/out/repository/product-management.repository.adapter.ts`
- Modify: `apps/server/src/products/application/port/out/repository/product-management.repository.port.ts`
- Modify: `apps/server/src/products/application/service/product-management-facts.service.ts`
- Modify: `apps/server/src/products/application/service/product-management-enrichment.service.ts`
- Modify: `apps/server/src/products/application/service/product-management.read-model.ts`
- Modify: `apps/server/src/products/application/service/product-management.service.ts`
- Modify: `apps/server/src/products/application/service/product-management-grade.service.ts`
- Delete: `apps/server/src/products/application/service/bundle-stock.service.ts`
- Delete: `apps/server/src/products/adapter/out/repository/bundle-stock.persistence.ts`
- Delete: `apps/server/src/products/domain/service/bundle-stock-capacity.ts`
- Delete: `apps/server/src/products/application/port/in/bundle-stock.port.ts`
- Delete: `apps/server/src/inventory/adapter/out/products/bundle-stock.adapter.ts`
- Delete: `apps/server/src/inventory/application/port/out/cross-domain/bundle-stock.port.ts`
- Create: `apps/server/src/inventory/application/port/out/repository/unshipped.repository.port.ts`
- Create: `apps/server/src/inventory/adapter/out/repository/unshipped.repository.adapter.ts`
- Create: `apps/server/src/inventory/__tests__/unshipped.repository.pg.integration.spec.ts`
- Modify: `apps/server/src/inventory/application/service/unshipped.service.ts`
- Modify: `apps/server/src/inventory/application/port/out/cross-domain/confirmed-orders.port.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/confirmed-orders.repository.adapter.ts`
- Modify: `apps/server/src/inventory/application/port/out/repository/picking.repository.port.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/picking.repository.adapter.ts`
- Modify: `apps/server/src/inventory/application/service/__tests__/picking.service.spec.ts`
- Modify: `apps/server/src/inventory/application/port/in/warehouse/transfers.port.ts`
- Modify: `apps/server/src/inventory/application/port/out/repository/transfers.repository.port.ts`
- Modify: `apps/server/src/inventory/adapter/out/repository/transfers.repository.adapter.ts`
- Modify: `apps/server/src/inventory/application/service/transfers.service.ts`
- Create: `apps/server/src/inventory/application/service/__tests__/transfers.service.spec.ts`
- Modify: `apps/server/src/inventory/adapter/in/http/dto/create-stock-transfer.dto.ts`
- Modify: `apps/server/src/orders/return-transfers/dto/create-return-transfer.dto.ts`
- Modify: `apps/server/src/orders/return-transfers/return-transfers.service.ts`
- Create: `apps/server/src/orders/return-transfers/return-transfers.service.spec.ts`
- Modify: `apps/server/src/orders/orders.module.ts`
- Delete: `apps/server/src/orders/controllers/rocket-po.controller.ts`
- Delete: `apps/server/src/orders/services/rocket-po-confirm.service.ts`
- Delete: `apps/server/src/orders/controllers/__tests__/rocket-po.controller.spec.ts`
- Delete: `apps/server/src/orders/services/rocket-po-confirm.service.spec.ts`
- Modify: `apps/server/src/analytics/dashboard/application/port/out/repository/dashboard-inventory.repository.port.ts`
- Modify: `apps/server/src/analytics/dashboard/adapter/out/repository/dashboard-inventory.repository.adapter.ts`
- Modify: `apps/server/src/analytics/dashboard/application/service/dashboard-inventory.service.ts`
- Modify: `apps/server/src/analytics/dashboard/__tests__/dashboard-inventory.pg.integration.spec.ts`
- Modify: `apps/server/src/automation/application/port/out/repository/action-board.repository.port.ts`
- Modify: `apps/server/src/automation/adapter/out/repository/action-board.repository.adapter.ts`
- Modify: `apps/server/src/automation/application/service/action-board.service.ts`
- Modify: `apps/server/src/automation/domain/policy/action-seeds.ts`
- Modify: `apps/server/src/automation/domain/policy/__tests__/action-seeds.spec.ts`
- Modify: `apps/server/src/automation/application/service/__tests__/action-board-get-tasks.spec.ts`
- Modify: `apps/server/src/automation/application/service/__tests__/action-board-get-tasks.pg.integration.spec.ts`
- Modify: `apps/server/src/advertising/advertising.module.ts`
- Modify: `apps/server/src/advertising/adapter/out/repository/ad-strategy-context.repository.adapter.ts`
- Modify: `apps/server/src/advertising/domain/model/strategy-types.ts`
- Modify: `apps/server/src/advertising/domain/strategy-context.ts`
- Modify: `apps/server/src/advertising/application/service/ad-strategy.service.ts`
- Modify: `apps/server/src/advertising/application/service/ad-exposure.service.ts`
- Modify: `apps/server/src/advertising/application/service/ad-grade-rules.service.ts`
- Modify: `apps/server/src/advertising/application/service/__tests__/ad-exposure.spec.ts`
- Modify: `apps/server/src/advertising/application/service/__tests__/ad-grade-rules.spec.ts`
- Modify: `apps/server/src/advertising/domain/__tests__/strategy-context.spec.ts`
- Modify: `apps/server/src/advertising/__tests__/ad-strategy-flow.pg.integration.spec.ts`
- Modify: `prisma/models/orders.prisma`
- Modify: `prisma/models/inventory.prisma`

**Interfaces:**
- Consumes: snapshot reads and `CHANNEL_SKU_AVAILABILITY_PORT`.
- Produces: stock-free Product contracts, factual dashboard/automation signals, InventorySku-based record-only fulfillment, and no Rocket stock-decision endpoint.

- [ ] **Step 1: Add failing product-contract tests and remove impossible claims**

```ts
expect(ProductManagementItemSchema.safeParse({
  ...validProduct,
  currentStock: 10,
  reorderPoint: 3,
  recommendedOrderQty: 5,
}).success).toBe(false);
```

Remove Product `currentStock`, `reservedStock`, `availableStock`, safety/reorder/optimal quantities, days-until-stockout, stock action, and stock filters. Keep catalog/commercial fields. Delete materialized bundle stock and recompute calls; ChannelSku recipes now own sellable-bundle capacity.

- [ ] **Step 2: Run product tests RED, implement, then verify GREEN**

```bash
npm exec --workspace=packages/shared vitest -- run src/schemas/product.spec.ts
npm exec --workspace=apps/server vitest -- run src/products
```

Expected before: failures on removed fields. Expected after: exit 0 and no `ProductOption.availableStock` production access.

- [ ] **Step 3: Split Unshipped before deleting the mixed query repository**

```ts
export interface UnshippedRepositoryPort {
  list(
    organizationId: string,
    input: { fromDate: Date; limit: number },
  ): Promise<UnshippedItemRow[]>;
}
```

Move only the unshipped query into the new adapter, bind it, and add tenant-scoped tests. `UnshippedService` must no longer import a legacy inventory query port.

- [ ] **Step 4: Convert fulfillment records to InventorySku identity**

```prisma
model StockTransfer {
  inventorySkuId String       @map("inventory_sku_id") @db.Uuid
  inventorySku   InventorySku @relation(fields: [inventorySkuId], references: [id], onDelete: Restrict)
}

model PickingItem {
  inventorySkuId String       @map("inventory_sku_id") @db.Uuid
  inventorySku   InventorySku @relation(fields: [inventorySkuId], references: [id], onDelete: Restrict)
}

model ReturnTransfer {
  inventorySkuId String       @map("inventory_sku_id") @db.Uuid
  inventorySku   InventorySku @relation(fields: [inventorySkuId], references: [id], onDelete: Restrict)
}
```

Picking expands each confirmed order line's `listingOption.components`; item quantity equals order quantity times component quantity. Unmatched lines are skipped and counted. Transfer completion, return restock/dispose, and picking completion update record status only.

- [ ] **Step 5: Remove Rocket stock decisions while preserving the route's order reads**

Delete backend `confirm-fill`, `confirm-generate`, `confirm-preview`, and `confirm-commit`; remove InventoryModule and `INVENTORY_PORT` from OrdersModule. Keep extension-backed Rocket PO list behavior outside the deleted service. Tests must show no Orders production reference to `INVENTORY_PORT`, `reservedStock`, or `RocketInventoryLedger`.

- [ ] **Step 6: Replace dashboard and automation reorder semantics**

```ts
export const WarningsSchema = z.object({
  minusProducts: z.number(),
  lowProfitProducts: z.number(),
  highAdProducts: z.number(),
  outOfStockSkus: z.number().int().nonnegative(),
  mappingAttentionSkus: z.number().int().nonnegative(),
  lowCtrProducts: z.number().optional(),
  lowReviewProducts: z.number().optional(),
});
```

Remove `needReorder`, `h-reorder`, `analyze-stock`, reorder candidates, and executable `/api/inventory` task calls. Add non-mutating seeds linking zero stock to `/stock-ops?tab=sellpia-zero` and mapping attention to `/product-hub/matching`.

- [ ] **Step 7: Move advertising stock evidence to exact ChannelSku availability**

AdvertisingModule imports ChannelsModule and consumes its exported port. Rename strategy `availableStock` to nullable `sellableStock`; null never triggers sold-out rules, zero does. Use ChannelSku sale price and component purchase cost where required; lead time becomes null because replenishment policy is out of scope.

```ts
expect(rule({ sellableStock: null })).not.toContainEqual(
  expect.objectContaining({ action: 'STOP_AD' }),
);
expect(rule({ sellableStock: 0 })).toContainEqual(
  expect.objectContaining({ reasonCode: 'OUT_OF_STOCK' }),
);
```

- [ ] **Step 8: Verify and commit Task 3**

```bash
npm exec --workspace=apps/server vitest -- run \
  src/products src/orders src/inventory/application/service/__tests__/picking.service.spec.ts \
  src/analytics/dashboard src/automation src/advertising
npm run check:idor
npm run check:tenant-scope
npm run build --workspace=apps/server
```

Expected: all commands exit 0.

```bash
git add packages/shared/src/schemas/product.ts packages/shared/src/schemas/product.spec.ts \
  packages/shared/src/schemas/dashboard.ts packages/shared/src/schemas/dashboard.spec.ts \
  apps/server/src/products apps/server/src/orders apps/server/src/inventory \
  apps/server/src/analytics apps/server/src/automation apps/server/src/advertising \
  prisma/models/orders.prisma prisma/models/inventory.prisma
git commit -m "refactor: cut consumers over to Sellpia inventory"
```

---

### Task 4: Rebuild Existing Screens on the New Read Models

**Files:**
- Modify: `apps/web/src/lib/query-keys.ts`
- Modify: `apps/web/src/lib/query-keys.spec.ts`
- Rewrite: `apps/web/src/app/(inventory)/_shared/inventory-api.ts`
- Rewrite: `apps/web/src/app/(inventory)/_shared/inventory-api.test.ts`
- Create: `apps/web/src/app/(inventory)/_shared/invalidate-sellpia-inventory.ts`
- Create: `apps/web/src/app/(inventory)/_shared/invalidate-sellpia-inventory.spec.ts`
- Rewrite: `apps/web/src/app/(inventory)/inventory/page.tsx`
- Rewrite: `apps/web/src/app/(inventory)/inventory/hooks/useInventory.ts`
- Rewrite: `apps/web/src/app/(inventory)/inventory/components/InventoryTable.tsx`
- Rewrite: `apps/web/src/app/(inventory)/inventory/components/InventorySummaryCards.tsx`
- Rewrite: `apps/web/src/app/(inventory)/inventory/components/InventoryFilterTabs.tsx`
- Rewrite: `apps/web/src/app/(inventory)/inventory/components/InventoryToolbar.tsx`
- Rewrite: `apps/web/src/app/(inventory)/inventory/lib/inventory-export.ts`
- Rewrite: `apps/web/src/app/(inventory)/inventory/lib/barcode-print.ts`
- Modify: `apps/web/src/app/(inventory)/inventory/lib/barcode-print.test.ts`
- Delete: `apps/web/src/app/(inventory)/inventory/components/StockOperationDialog.tsx`
- Delete: `apps/web/src/app/(inventory)/inventory/components/StockMovementTab.tsx`
- Delete: `apps/web/src/app/(inventory)/inventory/components/StockMovementTable.tsx`
- Delete: `apps/web/src/app/(inventory)/inventory/components/StockMovementSummaryCard.tsx`
- Delete: `apps/web/src/app/(inventory)/inventory/components/StockMovementTab.test.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory-hub/page.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaInventoryImport.tsx`
- Modify: `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaInventoryImport.test.tsx`
- Create: `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaImportHistory.tsx`
- Create: `apps/web/src/app/(inventory)/inventory-hub/components/SellpiaImportHistory.spec.tsx`
- Rewrite: `apps/web/src/app/(inventory)/inventory-hub/components/StockAssets.tsx`
- Create: `apps/web/src/app/(inventory)/inventory-hub/components/StockAssets.spec.tsx`
- Delete: `apps/web/src/app/(inventory)/inventory-hub/components/StockIo.tsx`
- Delete: `apps/web/src/app/(inventory)/inventory-hub/components/StockLedger.tsx`
- Delete: `apps/web/src/app/(inventory)/inventory-hub/components/StockAudits.tsx`
- Delete: `apps/web/src/app/(inventory)/inventory-hub/components/RocketStockEvents.tsx`
- Delete: `apps/web/src/app/(inventory)/inventory-hub/components/RocketStockEvents.test.tsx`
- Delete: `apps/web/src/app/(inventory)/inventory-hub/lib/rocket-event-draft.ts`
- Delete: `apps/web/src/app/(inventory)/inventory-hub/lib/rocket-event-draft.test.ts`
- Delete: `apps/web/src/app/(inventory)/inventory-hub/lib/rocket-event-source.ts`
- Delete: `apps/web/src/app/(inventory)/inventory-hub/lib/rocket-event-source.test.ts`
- Rewrite: `apps/web/src/app/(inventory)/stock-ops/page.tsx`
- Rewrite: `apps/web/src/app/(inventory)/stock-ops/components/DeadStock.tsx`
- Rewrite: `apps/web/src/app/(inventory)/stock-ops/components/ZeroItems.tsx`
- Rewrite: `apps/web/src/app/(inventory)/stock-ops/components/OutOfStock.tsx`
- Rewrite: `apps/web/src/app/(inventory)/stock-ops/components/StockRetention.tsx`
- Delete: `apps/web/src/app/(inventory)/stock-ops/components/PendingDelivery.tsx`
- Modify: `apps/web/src/app/(inventory)/stock-ops/components/StockTransfers.tsx`
- Modify: `apps/web/src/app/(inventory)/stock-ops/components/ReturnTransfers.tsx`
- Delete: `apps/web/src/app/(inventory)/stock-ops/lib/inventory-projection.ts`
- Delete: `apps/web/src/app/(inventory)/stock-ops/lib/inventory-projection.test.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/lib/channel-sku-matching-api.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/lib/channel-sku-matching-api.spec.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/hooks/useChannelSkuMappings.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/hooks/useChannelSkuMappings.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/components/ChannelSkuMappingTable.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/components/ChannelSkuComponentDialog.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/page.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/matching/page.spec.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/[id]/page.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/[id]/components/ProductInfoCards.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/components/ProductRowCard.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/components/ProductCommandCenter.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/hooks/useProductHubPageState.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/lib/product-page-model.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/lib/product-page-model.spec.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/lib/abc-grading.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/lib/abc-grading.spec.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/lib/products-export.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/options/lib/product-options-api.ts`
- Modify: `apps/web/src/app/(catalog)/product-hub/options/components/ProductOptionTable.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/options/components/ProductOptionEditModal.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/options/components/ProductOptionFilters.tsx`
- Modify: `apps/web/src/app/(catalog)/product-hub/options/components/__tests__/product-option-boundary.spec.tsx`
- Modify: `apps/web/src/app/(orders)/order-status-hub/components/OrderInventory.tsx`
- Modify: `apps/web/src/app/(orders)/order-status-hub/lib/inventory-risk.ts`
- Modify: `apps/web/src/app/(orders)/order-status-hub/lib/inventory-risk.test.ts`
- Modify: `apps/web/src/app/(orders)/return-scan/page.tsx`
- Modify: `apps/web/src/app/(orders)/return-scan/components/ReturnProductInfo.tsx`
- Modify: `apps/web/src/app/(inventory)/coupang-shipments/page.tsx`
- Modify: `apps/web/src/app/(orders)/returns/components/ReturnsTables.tsx`
- Modify: `apps/web/src/app/(orders)/returns/components/ReturnsTables.test.tsx`
- Modify: `apps/web/src/app/(orders)/rocket-orders/page.tsx`
- Delete: `apps/web/src/app/(orders)/rocket-orders/components/RocketConfirmPanel.tsx`
- Create: `apps/web/src/app/(orders)/rocket-orders/lib/rocket-po-read-api.ts`
- Delete: `apps/web/src/app/(orders)/rocket-orders/lib/rocket-confirm-api.ts` after moving extension-only list reads/types
- Modify: `apps/web/src/app/(finance)/reports/page.tsx`
- Modify: `apps/web/src/app/settings/components/ReportDownload.tsx`
- Modify: `apps/web/src/app/(analytics)/dashboard/page.tsx`
- Modify: `apps/web/src/app/__tests__/page.spec.tsx`
- Modify: `apps/web/src/app/(automation)/action-board/lib/actions.ts`
- Modify: `apps/web/src/app/(advertising)/ad-ops/components/StrategyContent.tsx`
- Keep: existing `/inventory-hub` and `/stock-ops` Sidebar links

**Interfaces:**
- Consumes: Task 1 snapshot/history and Task 2 availability APIs.
- Produces: read-only, immediately refreshed existing routes with no legacy mutation UI.

- [ ] **Step 1: Write failing API, query-key, and invalidation tests**

```ts
expect(listSellpiaInventorySkus({
  page: 2,
  limit: 50,
  query: 'SP',
  stockStatus: 'out_of_stock',
})).resolves.toMatchObject({ page: 2, limit: 50 });
```

The invalidation test asserts snapshot lists, assets, import runs, stock-ops availability, mapping lists, dashboard inventory, product reads, and ads reads are invalidated after a successful import.

```bash
npm exec --workspace=apps/web vitest -- run \
  src/app/\(inventory\)/_shared/inventory-api.test.ts \
  src/app/\(inventory\)/_shared/invalidate-sellpia-inventory.spec.ts \
  src/lib/query-keys.spec.ts
```

Expected: FAIL because the functions and keys do not exist.

- [ ] **Step 2: Implement focused React Query reads and invalidation**

Keep these API wrappers:

```ts
listSellpiaInventorySkus(params)
fetchAllSellpiaInventorySkus(params)
listSellpiaImportRuns(params)
listChannelSkuAvailability(params)
listSellpiaReceiptBatches()
createSellpiaReceiptBatch(input)
markSellpiaReceiptBatchUploaded(id, input)
```

Remove metadata, receive, issue, adjust, transaction, legacy asset, and Rocket-event wrappers. `SellpiaInventoryImport` calls `invalidateSellpiaInventory(queryClient)` on success.

`fetchAllSellpiaInventorySkus` pages until `items.length === total`; exports and barcode printing must use it so the 1,964-row snapshot is not truncated by the 200-row API limit.

- [ ] **Step 3: Write failing inventory-hub screen tests**

Cover loading, error, empty, search, paging, in/out filter, XLSX export mapping, latest import time, null-price asset handling, import history, and absence of every mutation control. The route test keeps `/inventory`, `/inventory-hub`, and tab navigation reachable.

- [ ] **Step 4: Rebuild `/inventory` and `/inventory-hub`**

Status columns: Sellpia code, name, option, barcode, current stock, purchase price, sale price, stock value, last import. Assets use backend summary and render null price as `가격 미등록`. Replace mutation tabs with current snapshot, import, import history, assets, channel availability, and the existing Supply purchase-order destination.

- [ ] **Step 5: Write failing stock-ops tests, then rebuild the route**

```text
sellpia-zero       InventorySku.currentStock = 0
channel-zero       matched ChannelSku.sellableStock = 0
bottlenecks        lowest-capacity recipe components
mapping-attention  unmatched + needs_review
inventory-value    priced value + unpriced count
freshness          latest/failed import runs
```

React renders backend capacity/bottleneck fields and never repeats the formula. Transfer and return views use InventorySku selectors and record-only copy.

- [ ] **Step 6: Cut over remaining web consumers**

- Product Hub removes aggregate stock, safety, reorder, and PO recommendation; show mapping coverage/capacity only where the backend provides it.
- Order inventory shows resolved ChannelSku capacity and mapping attention.
- Return scan changes `회수 완료 (재고 +1)` to `회수 기록 완료 · Sellpia 반영 필요` and does not invalidate stock.
- Rocket Orders keeps extension-backed calendars/lists, removes confirmation quantity generation/reservation, and states that purchase judgment is not enabled.
- Finance/settings exports use snapshot/assets only.
- Dashboard/action board use `outOfStockSkus` and `mappingAttentionSkus`.

- [ ] **Step 7: Verify web GREEN and commit Task 4**

```bash
npm exec --workspace=apps/web vitest -- run src/app/\(inventory\)
npm exec --workspace=apps/web vitest -- run \
  src/app/\(catalog\)/product-hub \
  src/app/\(orders\)/order-status-hub \
  src/lib/query-keys.spec.ts
npm run build --workspace=apps/web
```

Expected: all commands exit 0; the build contains `/inventory`, `/inventory-hub`, and `/stock-ops`.

```bash
git add apps/web/src
git commit -m "feat: rebuild inventory screens on Sellpia stock"
```

---

### Task 5: Delete Legacy Runtime, Reset Dev DB, Import Real Files, and Verify

**Files:**
- Delete: `apps/server/src/inventory/adapter/in/http/inventory-items.controller.ts`
- Delete: `apps/server/src/inventory/adapter/in/http/inventory-assets.controller.ts`
- Delete: `apps/server/src/inventory/adapter/in/http/inventory-stock-mutations.controller.ts`
- Delete: `apps/server/src/inventory/adapter/in/http/inventory-transactions.controller.ts`
- Delete: `apps/server/src/inventory/adapter/in/http/rocket-inventory.controller.ts`
- Delete: `apps/server/src/inventory/application/service/inventory.service.ts`
- Delete: `apps/server/src/inventory/application/port/in/stock/inventory.port.ts`
- Delete: `apps/server/src/inventory/application/port/out/repository/inventory.repository.port.ts`
- Delete: `apps/server/src/inventory/application/port/out/repository/inventory-query.repository.port.ts`
- Delete: `apps/server/src/inventory/adapter/out/repository/inventory.repository.adapter.ts`
- Delete: `apps/server/src/inventory/adapter/out/repository/inventory-query.repository.adapter.ts`
- Delete: `apps/server/src/inventory/domain/policy/inventory-status.ts`
- Delete: `apps/server/src/inventory/domain/policy/stock-mutation.ts`
- Delete: `apps/server/src/inventory/domain/policy/rocket-inventory-event.ts`
- Delete: `apps/server/src/inventory/mapper/inventory.mapper.ts`
- Delete: `apps/server/src/inventory/mapper/stock-transaction.mapper.ts`
- Delete: `apps/server/src/inventory/application/service/__tests__/inventory.service.reads.spec.ts`
- Delete: `apps/server/src/inventory/application/service/__tests__/inventory.service.metadata.spec.ts`
- Delete: `apps/server/src/inventory/application/service/__tests__/inventory.service.mutations.spec.ts`
- Delete: `apps/server/src/inventory/adapter/in/http/audits.controller.ts`
- Delete: `apps/server/src/inventory/application/service/audits.service.ts`
- Delete: `apps/server/src/inventory/application/port/in/stock/audits.port.ts`
- Delete: `apps/server/src/inventory/application/port/out/repository/audits.repository.port.ts`
- Delete: `apps/server/src/inventory/adapter/out/repository/audits.repository.adapter.ts`
- Delete: `apps/server/src/inventory/adapter/in/http/dto/create-stock-audit.dto.ts`
- Delete: `apps/server/src/inventory/adapter/in/http/dto/update-stock-audit.dto.ts`
- Delete: `apps/server/src/inventory/adapter/in/http/dto/adjust-stock.dto.ts`
- Delete: `apps/server/src/inventory/adapter/in/http/dto/issue-stock.dto.ts`
- Delete: `apps/server/src/inventory/adapter/in/http/dto/receive-stock.dto.ts`
- Delete: `apps/server/src/inventory/adapter/in/http/dto/update-inventory-metadata.dto.ts`
- Delete: `apps/server/src/inventory/adapter/in/http/dto/list-inventory-query.dto.ts`
- Delete: `apps/server/src/inventory/adapter/in/http/dto/list-transactions-query.dto.ts`
- Delete: `apps/server/src/inventory/adapter/in/http/dto/transaction-summary-query.dto.ts`
- Delete: `apps/server/src/inventory/adapter/in/http/dto/rocket-inventory.dto.ts`
- Delete: Prisma `Inventory`, `StockTransaction`, `RocketInventoryLedger`, `StockAudit`, old Sellpia reconciliation models, and related reverse relations
- Delete: `ProductOption.availableStock` and bundle-stock materialization relations
- Modify: `packages/shared/src/schemas/inventory.ts`, `packages/shared/src/index.ts`, and `packages/shared/src/schemas/index.ts` to remove legacy exports while preserving workbook and receipt-batch contracts still used
- Modify: `apps/server/src/inventory/inventory.module.ts`
- Modify: `apps/server/src/inventory/application/port/in/stock/index.ts`
- Modify: `apps/server/src/inventory/application/port/out/repository/index.ts`
- Modify: `apps/server/src/inventory/adapter/in/http/dto/index.ts`
- Modify: `apps/server/src/inventory/__tests__/inventory.module.wiring.spec.ts`
- Modify: `apps/server/src/inventory/__tests__/inventory.architecture.spec.ts`
- Delete: `apps/server/src/inventory/__tests__/inventory-flow.pg.integration.spec.ts`
- Create: `scripts/__tests__/sellpia-authoritative-inventory-contract.test.mjs`
- Create: `scripts/bootstrap-authoritative-inventory-dev.ts`
- Create: `scripts/__tests__/bootstrap-authoritative-inventory-dev.spec.ts`
- Modify: `scripts/check-script-inventory.mjs`
- Modify: `scripts/__tests__/check-script-inventory.test.mjs`
- Modify: `VERSION`
- Modify: `apps/server/src/inventory/AGENTS.md`
- Modify: `apps/server/src/channels/AGENTS.md`
- Modify: `apps/web/src/app/(inventory)/AGENTS.md`
- Modify: `apps/web/src/app/(inventory)/stock-ops/AGENTS.md`
- Modify: `apps/web/src/app/(orders)/rocket-orders/AGENTS.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/runbooks/channel-sellpia-matching.md`
- Modify: `docs/runbooks/sellpia-rocket-inventory-sync.md`
- Regenerate: `docs/ERD.md`
- Regenerate: `docs/erd/core.md`
- Regenerate: `docs/erd/inventory.md`
- Regenerate: `docs/erd/orders.md`
- Regenerate: `docs/erd/channels.md`
- Regenerate: `graphify-out/schema/GRAPH_REPORT.md`
- Regenerate: `graphify-out/schema/graph.html`
- Regenerate: `graphify-out/schema/graph.json`
- Regenerate: `graphify-out/schema-consumers/GRAPH_REPORT.md`
- Regenerate: `graphify-out/schema-consumers/graph.html`
- Regenerate: `graphify-out/schema-consumers/graph.json`

**Interfaces:**
- Consumes: all replacements from Tasks 1-4.
- Produces: zero-legacy runtime/schema, local-only bootstrap, and real imported dev baseline.

- [ ] **Step 1: Write and run failing reconstruction guard**

```js
const forbidden = [
  'prisma.inventory',
  'INVENTORY_PORT',
  'reservedStock',
  'reorderPoint',
  'ProductOption.availableStock',
  'RocketInventoryLedger',
  'StockTransaction',
  'SellpiaStockSnapshot',
];
```

The guard also asserts InventorySku `currentStock` writes occur only in `inventory-sku-import.repository.adapter.ts`; read-only selectors and the Prisma field declaration are allowed.

```bash
node --test scripts/__tests__/sellpia-authoritative-inventory-contract.test.mjs
```

Expected: FAIL listing remaining legacy consumers.

- [ ] **Step 2: Delete legacy runtime and physical schema**

Remove forbidden files, providers, exports, shared root exports, Prisma models, and reverse relations. Keep Warehouse, Shipment, Unshipped, Picking, StockTransfer, ReturnTransfer, InventorySku, SourceImportRun, ChannelSkuComponent, and SellpiaReceiptUploadBatch. InventoryModule exports only required read capabilities and mounts snapshot/import/record-only controllers.

- [ ] **Step 3: Implement and test local-only bootstrap guard**

```ts
export function assertLocalDevelopmentDatabase(databaseUrl: string): void {
  const url = new URL(databaseUrl);
  const localHost = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  const forbiddenName = /(prod|production|staging)/i.test(url.pathname);
  if (!localHost || forbiddenName) {
    throw new Error('Refusing to bootstrap a non-local development database');
  }
}
```

The bootstrap accepts organization ID/name and optional Wing/Rocket account IDs. It creates only organization plus active `coupang` and `rocket` account metadata, never products, stock, mappings, orders, or credentials.

- [ ] **Step 4: Run full static, unit, integration, schema, and build gates**

```bash
npm run test:scripts
npm run check:conventions
npm run build --workspace=packages/shared
npx prisma generate
npm run db:erd
npm run graphify:schema
npm run check:schema-artifact-sync
npx vitest run
npm run build --workspace=apps/server
npm run build --workspace=apps/web
```

Expected: every command exits 0 before reset.

- [ ] **Step 5: Inspect the effective database target**

```bash
node --env-file=.env -e '
const raw = process.env.DATABASE_URL;
if (!raw) throw new Error("DATABASE_URL missing");
const u = new URL(raw);
const local = ["localhost", "127.0.0.1", "::1"].includes(u.hostname);
const forbidden = /(prod|production|staging)/i.test(u.pathname);
if (!local || forbidden) throw new Error("Refusing non-local database reset");
console.log(`verified local development database: ${u.hostname}/${u.pathname.slice(1)}`);
'
```

Expected: one safe host/database line. Any error terminates the reset sequence.

- [ ] **Step 6: Reset only verified dev DB and rebuild identity metadata**

```bash
npx prisma db push --force-reset
npx prisma generate
npx tsx scripts/bootstrap-authoritative-inventory-dev.ts \
  --organization-id 11111111-1111-4111-8111-111111111111 \
  --organization-name "KidItem Dev"
npx tsx scripts/sync-supabase-user.ts \
  --email kiditem@naver.com \
  --organizationId 11111111-1111-4111-8111-111111111111 \
  --role admin
```

Expected: target schema, one organization, Wing/Rocket accounts, local user mirror, and active membership. This is a DB reset only; never run `git reset --hard`.

- [ ] **Step 7: Import approved workbooks through real UI/API paths**

Start Nest and Next with same-origin API proxy, mint the dev preview callback, authenticate the in-app browser, and upload:

```text
/Users/yhc125/Downloads/exported-list (3).xls
/Users/yhc125/Downloads/Coupang_detailinfo_260711.xlsx
```

Expected:

```text
InventorySku: 1,964
ChannelProduct: 1,225
ChannelSku: 2,241
Coupang skipped rows: 3
legacy Inventory/StockTransaction models: absent
```

Do not copy, move, stage, delete, or rewrite either workbook.

- [ ] **Step 8: Perform browser verification**

- `/inventory-hub`: 1,964-row snapshot, import time, search/filter/paging, history, assets, no mutations.
- `/inventory`: same authoritative read-only data.
- `/stock-ops`: Sellpia zero stock, nullable/unmatched capacity, bottlenecks, value/freshness.
- `/product-hub/matching`: 2,241 SKUs, `currentStock`, nullable `sellableStock`, direct/multipack/mixed recipes.
- `/rocket-orders`: order list remains; confirmation/reservation controls are absent.
- Browser console has no errors and no nested-main regression.

- [ ] **Step 9: Run final fresh verification and commit Task 5**

```bash
node --test scripts/__tests__/sellpia-authoritative-inventory-contract.test.mjs
npm run check:conventions
npx vitest run
npm run build
npm run dev:server
```

Expected: guard passes, zero test failures, builds exit 0, and Nest logs `Nest application successfully started`.

```bash
git add VERSION apps packages prisma scripts docs/ARCHITECTURE.md docs/ERD.md \
  docs/erd docs/runbooks graphify-out
git status --short
git commit -m "refactor: retire legacy KidItem stock runtime"
```

Before committing, confirm the three existing workbook status entries remain unstaged.

---

## Final Review Checklist

- [ ] `InventorySku.currentStock` is the only current-stock property and has one writer.
- [ ] Marketplace SKU availability is nullable until mapped and uses exact component quantities.
- [ ] Product, dashboard, automation, advertising, order, return, transfer, picking, finance, and settings paths no longer read legacy stock.
- [ ] Existing inventory routes remain and display real imported data.
- [ ] No old mutation endpoint, UI action, or shared contract remains.
- [ ] The DB target was verified local before reset.
- [ ] Real imports produce 1,964 Sellpia rows and 2,241 Coupang SKUs.
- [ ] User-owned workbook files remain unchanged and unstaged.
- [ ] Tests, builds, conventions, schema artifacts, server boot, and browser QA pass from the final tree.
