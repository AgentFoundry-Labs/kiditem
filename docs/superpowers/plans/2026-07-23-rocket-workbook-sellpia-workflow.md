# Rocket Workbook and Sellpia Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Rocket confirmation/reservation behavior with an exact-file workbook export that serializes the next export until matching Coupang orders have been sent to Sellpia and a newer verified inventory generation is observed.

**Architecture:** Keep the existing `rocket_purchase_confirmations*` physical tables for compatibility, but treat their records as immutable workbook exports in all TypeScript contracts and UI. A Supply-owned organization lock creates one export and stores its exact workbook bytes; Orders marks matching export lines collected and assigns stable Sellpia transmission keys; Inventory projects those keys together with its verified generation so Supply can advance the durable workflow without creating an `InventoryCommitment`.

**Tech Stack:** TypeScript, NestJS, Prisma/PostgreSQL, Zod, Next.js/React, TanStack Query, SheetJS, Vitest/Jest, Playwright browser QA.

## Global Constraints

- Rocket shows and calculates from Sellpia `currentStock` only; it does not expose or subtract `activeCommitmentQuantity` or `availableStock`.
- Within one workbook calculation, shared component stock is consumed from one in-memory `remainingStock` map in stable ETA, PO, and line order.
- At most one non-terminal Rocket workbook workflow exists per organization, across Rocket channel accounts.
- A repeated idempotency request returns the first immutable export and exact stored workbook artifact; a different normalized decision using the same key is a conflict.
- A new workbook stays blocked until every positive line is collected, every generated Sellpia file has a finalized stable transmission intent, and `verifiedGeneration` is newer than the export generation and at least every finalized intent generation.
- Abandonment is allowed only after fresh SHIPMENT and MILKRUN collection probes both record no matching confirmed order and no export line has ever been collected.
- Common Inventory commitment models and APIs remain for unrelated domains, but Rocket code must not create, replace, settle, release, query, or display those commitments.
- Preserve the existing Rocket calendar, saved PO list, chart, mapping links/modal, edit panel, custom Coupang template input, and local workbook history.
- Preserve `/api/purchase-orders` as the Supply single-POST action route; workbook upload/download are actions on that route.

---

### Task 1: Replace Rocket commitment DTOs with workbook export DTOs

**Files:**
- Modify: `packages/shared/src/schemas/rocket-purchase-preview.ts`
- Modify: `packages/shared/src/schemas/rocket-purchase-preview.spec.ts`
- Modify: `packages/shared/src/rocket-purchase-preview.ts`

**Interfaces:**
- Consumes: existing PO collection, preview, shortage-reason, and catalog publication schemas.
- Produces: `RocketWorkbookExportRequest`, `RocketWorkbookExportResponse`, `RocketWorkbookWorkflowStatus`, `RocketWorkbookArtifactResponse`, and `isRocketWorkbookBlockingReason`.

- [ ] **Step 1: Write failing shared-schema tests**

Add assertions that a preview component accepts only physical stock fields and rejects the removed fields, and that the workflow response recognizes all stored states:

```ts
expect(RocketPurchasePreviewComponentSchema.parse({
  sellpiaInventorySkuId: crypto.randomUUID(),
  quantity: 2,
  currentStock: 7,
  isActive: true,
})).not.toHaveProperty('availableStock');

expect(() => RocketPurchasePreviewComponentSchema.parse({
  sellpiaInventorySkuId: crypto.randomUUID(),
  quantity: 2,
  currentStock: 7,
  activeCommitmentQuantity: 3,
  availableStock: 4,
  isActive: true,
})).toThrow();

for (const status of [
  'awaiting_coupang_confirmation',
  'orders_collected',
  'sellpia_transmitting',
  'awaiting_inventory_sync',
  'completed',
  'failed',
] as const) {
  expect(RocketWorkbookWorkflowStatusSchema.parse(status)).toBe(status);
}
```

- [ ] **Step 2: Run the shared schema spec and observe failure**

Run: `cd packages/shared && npx vitest run src/schemas/rocket-purchase-preview.spec.ts`

Expected: FAIL because the component still requires commitment fields and workbook export schemas do not exist.

- [ ] **Step 3: Introduce workbook export contracts**

Replace `RocketPurchaseConfirmation*` public schemas with the following semantics while retaining the existing request-base validation:

```ts
export const RocketPurchasePreviewComponentSchema = z.object({
  sellpiaInventorySkuId: z.string().uuid(),
  quantity: z.number().int().positive(),
  currentStock: z.number().int().nonnegative(),
  isActive: z.boolean(),
}).strict();

export const RocketWorkbookWorkflowStatusSchema = z.enum([
  'awaiting_coupang_confirmation',
  'orders_collected',
  'sellpia_transmitting',
  'awaiting_inventory_sync',
  'completed',
  'failed',
]);

export const RocketWorkbookExportRequestSchema = RocketPurchaseRequestBaseSchema
  .omit({ clampEditedQuantities: true })
  .extend({
    idempotencyKey: z.string().uuid(),
    shortageReasons: z.record(z.string().min(1).max(300), RocketShortageReasonSchema),
    artifactFileName: requiredText(240),
    artifactContentType: z.literal(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ),
  })
  .strict()
  .superRefine(validateRocketWorkbookLines);

export const RocketWorkbookExportResponseSchema = z.object({
  exportId: z.string().uuid(),
  status: RocketWorkbookWorkflowStatusSchema,
  duplicate: z.boolean(),
  canAbandon: z.boolean(),
  inventoryGeneration: z.string().regex(/^\d+$/).nullable(),
  generatedAt: z.string().datetime(),
  artifact: z.object({
    fileName: requiredText(240),
    contentType: z.literal(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    byteLength: z.number().int().positive().max(10 * 1024 * 1024),
  }).strict(),
  totals: z.object({
    lineCount: z.number().int().nonnegative().max(ROCKET_PO_ROW_LIMIT),
    orderQuantity: z.number().int().nonnegative(),
    workbookQuantity: z.number().int().nonnegative(),
    componentQuantity: z.number().int().nonnegative(),
  }).strict(),
  rows: z.array(z.object({
    poLineId: requiredText(300),
    workbookQuantity: z.number().int().nonnegative(),
    shortageReason: RocketShortageReasonSchema.nullable(),
  }).strict()).max(ROCKET_PO_ROW_LIMIT),
}).strict();
```

Rename the blocking helpers to workbook terms and update the focused public re-export without widening the root shared barrel.

- [ ] **Step 4: Run focused shared tests and build**

Run: `cd packages/shared && npx vitest run src/schemas/rocket-purchase-preview.spec.ts && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit the contract slice**

```bash
git add packages/shared/src/schemas/rocket-purchase-preview.ts packages/shared/src/schemas/rocket-purchase-preview.spec.ts packages/shared/src/rocket-purchase-preview.ts
git commit -m "refactor: define Rocket workbook export contract"
```

### Task 2: Calculate Rocket workbooks from physical current stock only

**Files:**
- Modify: `apps/server/src/supply/domain/policy/rocket-capacity-preview.ts`
- Modify: `apps/server/src/supply/domain/policy/__tests__/rocket-capacity-preview.spec.ts`
- Modify: `apps/server/src/supply/application/service/rocket-purchase-preview.service.ts`
- Modify: `apps/server/src/supply/application/service/__tests__/rocket-purchase-preview.service.spec.ts`

**Interfaces:**
- Consumes: `RocketPurchasePreviewComponent.currentStock` and Inventory freshness generation.
- Produces: `previewRocketCapacity(input): RocketPurchasePreviewRow[]` with calculation-local shared SKU depletion only.

- [ ] **Step 1: Write failing policy and service tests**

Add a policy case where two one-unit lines share a SKU with `currentStock: 5`; stable ordering must allocate 4 then 1. Add a multi-component pack case where two variants consume `[skuA: 2, skuB: 3]`. Add a service case whose inventory freshness mock returns `currentStock: 8`, `activeCommitmentQuantity: 7`, and `availableStock: 1`; the Rocket result must still recommend 8.

```ts
expect(result.map(({ recommendedQuantity }) => recommendedQuantity)).toEqual([4, 1]);
expect(result[0]?.components).toEqual([
  expect.objectContaining({ sellpiaInventorySkuId: skuId, currentStock: 5 }),
]);
expect(serviceResult.rows[0]?.recommendedQuantity).toBe(8);
```

- [ ] **Step 2: Run focused backend tests and observe failure**

Run: `cd apps/server && npx vitest run src/supply/domain/policy/__tests__/rocket-capacity-preview.spec.ts src/supply/application/service/__tests__/rocket-purchase-preview.service.spec.ts`

Expected: FAIL because the policy seeds remaining stock from `availableStock` and the service publishes commitment fields.

- [ ] **Step 3: Change the pure allocation seed and projection**

Use only the physical field:

```ts
const remainingStock = new Map<string, number>();
for (const row of stableRows) {
  for (const component of row.components) {
    if (!remainingStock.has(component.sellpiaInventorySkuId)) {
      remainingStock.set(component.sellpiaInventorySkuId, component.currentStock);
    }
  }
}
```

Keep the existing stable ETA/PO/line ordering and consume after each row:

```ts
for (const component of row.components) {
  remainingStock.set(
    component.sellpiaInventorySkuId,
    remainingStock.get(component.sellpiaInventorySkuId)! - quantity * component.quantity,
  );
}
```

In the preview service, retain Inventory's freshness gate but project only `currentStock` and `isActive`; do not copy or calculate common commitment fields.

- [ ] **Step 4: Run focused backend tests**

Run: `cd apps/server && npx vitest run src/supply/domain/policy/__tests__/rocket-capacity-preview.spec.ts src/supply/application/service/__tests__/rocket-purchase-preview.service.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit the allocation slice**

```bash
git add apps/server/src/supply/domain/policy/rocket-capacity-preview.ts apps/server/src/supply/domain/policy/__tests__/rocket-capacity-preview.spec.ts apps/server/src/supply/application/service/rocket-purchase-preview.service.ts apps/server/src/supply/application/service/__tests__/rocket-purchase-preview.service.spec.ts
git commit -m "refactor: calculate Rocket workbook stock locally"
```

### Task 3: Persist an exact workbook artifact and serialized workflow

**Files:**
- Modify: `prisma/models/supply.prisma`
- Modify: `prisma/models/core.prisma`
- Modify: `apps/server/src/supply/application/port/in/procurement/rocket-purchase-confirmation.port.ts`
- Modify: `apps/server/src/supply/application/port/out/transaction/rocket-purchase-confirmation.transaction.port.ts`
- Modify: `apps/server/src/supply/application/service/rocket-purchase-confirmation.service.ts`
- Modify: `apps/server/src/supply/application/service/__tests__/rocket-purchase-confirmation.service.spec.ts`
- Modify: `apps/server/src/supply/adapter/out/transaction/rocket-purchase-confirmation.transaction.adapter.ts`
- Modify: `apps/server/src/supply/__tests__/rocket-purchase-confirmation.pg.integration.spec.ts`
- Modify: `apps/server/src/supply/adapter/in/http/dto/purchase-order-action.dto.ts`
- Modify: `apps/server/src/supply/adapter/in/http/procurement.controller.ts`
- Modify: `apps/server/src/supply/supply.module.ts`

**Interfaces:**
- Consumes: canonical re-preview, uploaded XLSX `Buffer`, and `RocketWorkbookProgressPort.read(...)` from Task 4.
- Produces: `exportWorkbook`, `getActiveWorkflow`, `downloadWorkbook`, and evidence-gated `abandonWorkbook` methods; exact stored bytes; one non-terminal export per organization.

- [ ] **Step 1: Write failing service, transaction, and integration tests**

Cover: no `InventoryCommitmentPort` dependency, exact artifact digest and bytes, organization-wide active-workflow conflict, same-key duplicate return, different-request conflict, zero-positive-line immediate completion, and completed predecessor allowing a new export.

```ts
await expect(adapter.exportWorkbook(firstInput)).resolves.toMatchObject({
  status: 'awaiting_coupang_confirmation',
  duplicate: false,
  artifact: { sha256: createHash('sha256').update(workbook).digest('hex') },
});
await expect(adapter.exportWorkbook(secondAccountInput)).rejects.toThrow(
  /previous Rocket workbook workflow/i,
);
expect(await adapter.downloadWorkbook({ organizationId, exportId })).toEqual({
  fileName: 'coupang.xlsx',
  contentType: XLSX_CONTENT_TYPE,
  bytes: workbook,
});
```

- [ ] **Step 2: Run focused tests and observe failure**

Run: `cd apps/server && npx vitest run src/supply/application/service/__tests__/rocket-purchase-confirmation.service.spec.ts && npm run test:integration -- src/supply/__tests__/rocket-purchase-confirmation.pg.integration.spec.ts`

Expected: FAIL because confirmation creates commitments and no artifact/workflow API exists.

- [ ] **Step 3: Extend the compatible physical schema**

Keep model/table names and add workflow/artifact fields:

```prisma
model RocketPurchaseConfirmation {
  // existing identity and audit fields remain
  status                String    @default("awaiting_coupang_confirmation")
  artifactFileName      String?   @map("artifact_file_name") @db.VarChar(240)
  artifactContentType   String?   @map("artifact_content_type") @db.VarChar(120)
  artifactSha256        String?   @map("artifact_sha256") @db.VarChar(64)
  artifactBytes         Bytes?    @map("artifact_bytes")
  artifactStoredAt      DateTime? @map("artifact_stored_at") @db.Timestamptz
  ordersCollectedAt     DateTime? @map("orders_collected_at") @db.Timestamptz
  completedAt           DateTime? @map("completed_at") @db.Timestamptz
  failureCode           String?   @map("failure_code") @db.VarChar(80)
  failureMessage        String?   @map("failure_message") @db.VarChar(500)
  transmissions         RocketPurchaseConfirmationTransmission[]
}

model RocketPurchaseConfirmationLine {
  collectedOrderLineItemId String?   @map("collected_order_line_item_id") @db.Uuid
  collectedAt              DateTime? @map("collected_at") @db.Timestamptz
}

model RocketPurchaseConfirmationTransmission {
  id                String   @id @default(uuid()) @db.Uuid
  organizationId    String   @map("organization_id") @db.Uuid
  confirmationId    String   @map("confirmation_id") @db.Uuid
  sourceImportRunId String   @map("source_import_run_id") @db.Uuid
  transport         String   @db.VarChar(20)
  intentKey         String?  @map("intent_key") @db.VarChar(500)
  matchedLineCount  Int      @default(0) @map("matched_line_count")
  observedAt        DateTime @default(now()) @map("observed_at") @db.Timestamptz
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz
  confirmation RocketPurchaseConfirmation @relation(fields: [confirmationId, organizationId], references: [id, organizationId], onDelete: Cascade)
  @@unique([confirmationId, transport])
  @@unique([organizationId, intentKey], map: "rocket_confirmation_transmissions_org_intent_key", where: raw("intent_key IS NOT NULL"))
  @@index([organizationId, sourceImportRunId])
  @@map("rocket_purchase_confirmation_transmissions")
}
```

Add the required reverse relations on `Organization` and `SourceImportRun`.

- [ ] **Step 4: Generate the Prisma client**

Run: `npx prisma generate`

Expected: Prisma Client generated successfully.

- [ ] **Step 5: Implement export semantics under the existing advisory lock**

Rename application interfaces to workbook methods while keeping physical Prisma identifiers private to the adapter:

```ts
export interface RocketWorkbookExportPort {
  exportWorkbook(input: {
    organizationId: string;
    userId: string;
    request: RocketWorkbookExportRequest;
    artifactBytes: Buffer;
  }): Promise<RocketWorkbookExportResponse>;
  getActiveWorkflow(input: { organizationId: string }): Promise<RocketWorkbookExportResponse | null>;
  downloadWorkbook(input: { organizationId: string; exportId: string }): Promise<{
    fileName: string;
    contentType: string;
    bytes: Buffer;
  }>;
  abandonWorkbook(input: {
    organizationId: string;
    userId: string;
    exportId: string;
    reason: string;
  }): Promise<RocketWorkbookExportResponse>;
}
```

Inside the transaction: acquire `rocket-workbook-workflow` organization advisory lock, validate actor/source/current recipe/fresh generation, refresh the prior workflow projection, reject a remaining non-terminal record, hash the normalized decision and artifact, and persist the snapshot with `awaiting_coupang_confirmation` (or `completed` when every workbook quantity is zero). Remove every call/import of `InventoryCommitmentPort` and the Rocket commitment mapper. `abandonWorkbook` uses the same lock and succeeds only when both transport probe rows were observed after export creation, both have `matchedLineCount = 0`, and every positive export line still has `collectedAt = null`; it records the existing physical release audit fields and returns public status `completed`.

- [ ] **Step 6: Keep the single POST route while accepting XLSX multipart**

Add `exportRocketWorkbook`, `getActiveRocketWorkbook`, `downloadRocketWorkbook`, and `abandonRocketWorkbook` actions. For export, use `FileInterceptor('workbook', { limits: { fileSize: 10 * 1024 * 1024 } })`, parse the `requestJson` field through `RocketWorkbookExportRequestSchema`, and pass the authenticated organization/user plus `file.buffer`. For download, return `StreamableFile` with the stored filename/content type. For abandonment, validate a UUID export ID and a trimmed 1–500 character reason before invoking the evidence gate.

- [ ] **Step 7: Run focused tests and schema gates**

Run: `cd apps/server && npx vitest run src/supply/application/service/__tests__/rocket-purchase-confirmation.service.spec.ts && npm run test:integration -- src/supply/__tests__/rocket-purchase-confirmation.pg.integration.spec.ts && cd ../.. && npm run db:push && npx prisma generate && npm run build --workspace=packages/shared && npm run db:erd && npm run graphify:schema`

Expected: tests PASS; schema push, generation, ERD, and Graphify finish without errors.

- [ ] **Step 8: Commit the durable export slice**

```bash
git add prisma apps/server/src/supply packages/shared/src
git commit -m "feat: persist serialized Rocket workbook exports"
```

### Task 4: Link order collection, Sellpia transmission, and generation completion

**Files:**
- Create: `apps/server/src/inventory/application/port/in/stock/rocket-workbook-progress.port.ts`
- Create: `apps/server/src/inventory/application/service/rocket-workbook-progress.service.ts`
- Create: `apps/server/src/inventory/application/service/rocket-workbook-progress.service.spec.ts`
- Modify: `apps/server/src/inventory/inventory.module.ts`
- Modify: `apps/server/src/supply/application/port/in/procurement/rocket-final-order-reconciliation.port.ts`
- Modify: `apps/server/src/supply/adapter/out/transaction/rocket-final-order-reconciliation.transaction.adapter.ts`
- Modify: `apps/server/src/supply/__tests__/rocket-final-order-reconciliation.transaction.adapter.spec.ts`
- Modify: `apps/server/src/orders/application/port/in/coupang-direct-order-collection.port.ts`
- Modify: `apps/server/src/orders/application/service/coupang-direct-order-collection.service.ts`
- Modify: `apps/server/src/orders/application/service/coupang-direct-order-collection.service.spec.ts`
- Modify: `apps/server/src/orders/adapter/out/transaction/coupang-direct-order-collection.transaction.adapter.ts`
- Modify: `apps/server/src/orders/__tests__/coupang-direct-order-collection.pg.integration.spec.ts`
- Modify: `apps/server/src/orders/controllers/order-collection.controller.ts`
- Modify: `apps/server/src/orders/controllers/order-collection.controller.spec.ts`

**Interfaces:**
- Consumes: Supply transmission `intentKey`s and Inventory's existing `SellpiaOrderTransmissionIntent` plus `SellpiaInventoryState` records.
- Produces: stable `transmissionIntentKey` from collection and a monotonic workflow projection used by Task 3.

- [ ] **Step 1: Write failing progress and collection tests**

Prove the projection rules and matching boundary:

```ts
expect(project({ allPositiveLinesCollected: false, intents: [], verifiedGeneration: 8n }))
  .toBe('awaiting_coupang_confirmation');
expect(project({ allPositiveLinesCollected: true, intents: [], verifiedGeneration: 8n }))
  .toBe('orders_collected');
expect(project({ allPositiveLinesCollected: true, intents: [{ status: 'prepared', finalizedGeneration: null }], verifiedGeneration: 8n }))
  .toBe('sellpia_transmitting');
expect(project({ allPositiveLinesCollected: true, intents: [{ status: 'aborted', finalizedGeneration: null }], verifiedGeneration: 8n }))
  .toBe('failed');
expect(project({ allPositiveLinesCollected: true, intents: [{ status: 'finalized', finalizedGeneration: 9n }], verifiedGeneration: 8n }))
  .toBe('awaiting_inventory_sync');
expect(project({ allPositiveLinesCollected: true, intents: [{ status: 'finalized', finalizedGeneration: 9n }], verifiedGeneration: 9n, exportGeneration: 8n }))
  .toBe('completed');
```

The Orders integration test must assert that only the same organization/account/PO/product/barcode export line receives `collectedOrderLineItemId`, that the batch key is `rocket-workbook:${exportId}:${transport.toLowerCase()}`, and that no Inventory commitment row is created.

- [ ] **Step 2: Run focused tests and observe failure**

Run: `cd apps/server && npx vitest run src/inventory/application/service/rocket-workbook-progress.service.spec.ts src/supply/adapter/out/transaction/rocket-final-order-reconciliation.transaction.adapter.spec.ts src/orders/application/service/coupang-direct-order-collection.service.spec.ts src/orders/controllers/order-collection.controller.spec.ts && npm run test:integration -- src/orders/__tests__/coupang-direct-order-collection.pg.integration.spec.ts`

Expected: FAIL because reconciliation currently replaces request commitments and the controller bypasses durable collection.

- [ ] **Step 3: Add the Inventory-owned read projection**

Implement this boundary without exposing Prisma types:

```ts
export interface RocketWorkbookProgressPort {
  read(input: {
    transaction: unknown;
    organizationId: string;
    exportGeneration: bigint | null;
    allPositiveLinesCollected: boolean;
    intentKeys: string[];
  }): Promise<{
    status: RocketWorkbookWorkflowStatus;
    verifiedGeneration: bigint;
  }>;
}
```

Use the caller transaction to read organization-scoped intent statuses and the verified generation. Require every supplied key to exist and be finalized, require at least one key for a positive workbook, and require `verifiedGeneration > exportGeneration` and `verifiedGeneration >= max(finalizedGeneration)` before returning `completed`. Project an aborted intent or invalid terminal metadata as `failed`; preparing the same stable key reopens the existing intent so a retry can move the workflow forward without creating another transmission record.

- [ ] **Step 4: Replace commitment reconciliation with export-line collection**

For each stable-sorted final order line, select at most one non-terminal export line by organization, account, PO, product, and optional barcode; update `collectedOrderLineItemId` idempotently; reject ambiguous or conflicting matches. Upsert one `RocketPurchaseConfirmationTransmission` collection probe for the request transport, including zero selected/matched lines. Assign its intent key only when the batch has matched rows:

```ts
const intentKey = `rocket-workbook:${exportId}:${transport.toLowerCase()}`;
```

After all positive lines have a collected order line, persist `orders_collected` and `ordersCollectedAt`. Return `exportId`, nullable `transmissionIntentKey`, `matchedLineCount`, reconciled refs, and skipped refs. Remove every Inventory commitment call/import. An empty fresh collection is a successful no-match probe rather than a 400 response.

- [ ] **Step 5: Route conversion through the durable collection service**

Inject `COUPANG_DIRECT_ORDER_COLLECTION_PORT` into `OrderCollectionController`, call `collect` before generating the Sellpia file, pass only `confirmedLines` into the generator, and expose:

```ts
response.setHeader('X-Order-Collection-Import-Run-Id', collected.importRunId);
response.setHeader('X-Rocket-Workbook-Export-Id', collected.exportId);
response.setHeader('X-Sellpia-Transmission-Intent-Key', collected.transmissionIntentKey);
```

Keep unmatched orders visible through skipped-row headers and never turn them into a Sellpia file row. When no row matched, return HTTP 204 plus probe/export headers and no generated file; the browser must call both transports on every Rocket collection so abandonment has complete evidence.

- [ ] **Step 6: Run focused tests**

Run: `cd apps/server && npx vitest run src/inventory/application/service/rocket-workbook-progress.service.spec.ts src/supply/adapter/out/transaction/rocket-final-order-reconciliation.transaction.adapter.spec.ts src/orders/application/service/coupang-direct-order-collection.service.spec.ts src/orders/controllers/order-collection.controller.spec.ts && npm run test:integration -- src/orders/__tests__/coupang-direct-order-collection.pg.integration.spec.ts`

Expected: PASS.

- [ ] **Step 7: Commit the external-step linkage**

```bash
git add apps/server/src/inventory apps/server/src/supply apps/server/src/orders
git commit -m "feat: link Rocket collection to Sellpia sync"
```

### Task 5: Use stable transmission keys in the order-collection UI

**Files:**
- Modify: `apps/web/src/app/(orders)/order-collection/lib/order-collection-api.ts`
- Modify: `apps/web/src/app/(orders)/order-collection/lib/coupang-directship-api.ts`
- Modify: `apps/web/src/app/(orders)/order-collection/lib/coupang-directship-api.spec.ts`
- Modify: `apps/web/src/app/(orders)/order-collection/lib/order-generated-file-store.ts`
- Modify: `apps/web/src/app/(orders)/order-collection/lib/browser-mall-collection.ts`
- Modify: `apps/web/src/app/(orders)/order-collection/lib/browser-mall-collection.spec.ts`
- Modify: `apps/web/src/app/(orders)/order-collection/lib/sellpia-order-transmission.ts`
- Modify: `apps/web/src/app/(orders)/order-collection/lib/sellpia-order-transmission.spec.ts`

**Interfaces:**
- Consumes: response headers `X-Rocket-Workbook-Export-Id` and `X-Sellpia-Transmission-Intent-Key` from Task 4.
- Produces: `StoredOrderCollectionFile.transmissionIntentKey`, used instead of browser timestamp ID for Inventory prepare/finalize/abort.

- [ ] **Step 1: Write failing API and transmission tests**

```ts
expect(result).toMatchObject({
  rocketWorkbookExportId: exportId,
  transmissionIntentKey: `rocket-workbook:${exportId}:shipment`,
});
expect(freshness.prepareOrderTransmissionIntent)
  .toHaveBeenCalledWith(`rocket-workbook:${exportId}:shipment`);
expect(freshness.finalizeOrderTransmissionIntent)
  .toHaveBeenCalledWith(`rocket-workbook:${exportId}:shipment`);
```

- [ ] **Step 2: Run focused frontend tests and observe failure**

Run: `cd apps/web && npx vitest run src/app/'(orders)'/order-collection/lib/coupang-directship-api.spec.ts src/app/'(orders)'/order-collection/lib/browser-mall-collection.spec.ts src/app/'(orders)'/order-collection/lib/sellpia-order-transmission.spec.ts`

Expected: FAIL because transmission currently uses the local history ID.

- [ ] **Step 3: Parse and persist the stable keys**

Extend the conversion result and stored-file types with nullable `rocketWorkbookExportId` and `transmissionIntentKey`. Parse the two response headers in `convertCoupangDirectToSellpiaFile`; represent a 204 probe as `{ file: null, matchedRows: 0 }`; call conversion for both transports even when one has no collected POs; use the server transmission key as the history item ID when present; and in `transmitSellpiaOrder` use:

```ts
const intentKey = input.file.transmissionIntentKey ?? input.file.id;
```

Pass `intentKey` consistently to prepare, finalize retry, and abort. This preserves other malls' current behavior.

- [ ] **Step 4: Run focused frontend tests**

Run: `cd apps/web && npx vitest run src/app/'(orders)'/order-collection/lib/coupang-directship-api.spec.ts src/app/'(orders)'/order-collection/lib/browser-mall-collection.spec.ts src/app/'(orders)'/order-collection/lib/sellpia-order-transmission.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit the stable-key slice**

```bash
git add apps/web/src/app/'(orders)'/order-collection
git commit -m "feat: persist Rocket Sellpia transmission keys"
```

### Task 6: Replace the Rocket reservation UI with exact workbook download

**Files:**
- Modify: `apps/web/src/app/(supply)/purchase-orders/lib/rocket-purchase-preview-api.ts`
- Modify: `apps/web/src/app/(supply)/purchase-orders/lib/rocket-confirmation-workbook.ts`
- Modify: `apps/web/src/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow.ts`
- Modify: `apps/web/src/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow.spec.tsx`
- Modify: `apps/web/src/app/(supply)/purchase-orders/components/RocketPurchaseWorkspace.tsx`
- Modify: `apps/web/src/app/(supply)/purchase-orders/components/RocketPurchaseWorkspace.spec.tsx`
- Modify: `apps/web/src/app/(orders)/rocket-orders/components/RocketConfirmPanel.tsx`
- Modify: `apps/web/src/app/(orders)/rocket-orders/components/RocketConfirmPanel.spec.tsx`
- Modify: `apps/web/src/app/(orders)/rocket-orders/components/RocketMatchStatusModal.tsx`
- Modify: `apps/web/src/app/(orders)/rocket-orders/components/RocketMatchStatusModal.spec.tsx`
- Modify: `apps/web/src/lib/rocket-confirm-file-store.ts`
- Remove Rocket-page usage of: `apps/web/src/app/(supply)/purchase-orders/components/RocketInventoryCommitmentList.tsx`

**Interfaces:**
- Consumes: workbook export multipart/download actions from Task 3 and status projection from Task 4.
- Produces: operator action `쿠팡 엑셀 다운로드`, exact artifact re-download, and workflow status messages with no commitment terminology.

- [ ] **Step 1: Write failing UI and hook tests**

Assert that rendered Rocket surfaces contain `현재고`, `엑셀 수량`, and `쿠팡 엑셀 다운로드`; do not contain `약정`, `가용재고`, `예약 확정`, `재고 예약`, or `발주 확정` as a KidItem action. Assert that an active workflow disables new export but allows `동일 파일 다시 다운로드`, that `워크북 사용 안 함` stays disabled until the server reports both no-match probes, and that the existing calendar/list/chart/mapping/history test IDs still render.

```ts
expect(screen.getByRole('button', { name: '쿠팡 엑셀 다운로드' })).toBeEnabled();
expect(screen.queryByText('가용재고')).not.toBeInTheDocument();
expect(screen.getByRole('button', { name: '동일 파일 다시 다운로드' })).toBeEnabled();
expect(exportRocketWorkbook).toHaveBeenCalledTimes(1);
expect(downloadRocketWorkbook).toHaveBeenCalledTimes(2);
```

- [ ] **Step 2: Run focused UI tests and observe failure**

Run: `cd apps/web && npx vitest run src/app/'(supply)'/purchase-orders/hooks/useRocketPurchaseWorkflow.spec.tsx src/app/'(supply)'/purchase-orders/components/RocketPurchaseWorkspace.spec.tsx src/app/'(orders)'/rocket-orders/components/RocketConfirmPanel.spec.tsx src/app/'(orders)'/rocket-orders/components/RocketMatchStatusModal.spec.tsx`

Expected: FAIL because the hook and panels still model active/released confirmation and commitments.

- [ ] **Step 3: Upload the generated workbook in the export action**

Generate the workbook from the reviewed rows before the API mutation, then send `FormData` with `action=exportRocketWorkbook`, `requestJson`, and `workbook`. On success, download the exact server artifact through `downloadRocketWorkbook(exportId)`, save that returned blob to existing IndexedDB history under `rocket-workbook-${exportId}`, and retain the returned source rows for history metadata.

For re-download, skip preview/export entirely and call only `downloadRocketWorkbook(existing.exportId)`.

- [ ] **Step 4: Render workflow states and remove commitment surfaces**

Use this copy map:

```ts
const WORKFLOW_LABEL = {
  awaiting_coupang_confirmation: '쿠팡 업로드·발주확정 대기',
  orders_collected: '주문수집 완료',
  sellpia_transmitting: 'Sellpia 반영 중',
  awaiting_inventory_sync: '재고 동기화 대기',
  completed: '재고 동기화 완료',
  failed: '재고 동기화 실패 — 다시 시도',
} as const;
```

Remove current commitment/available columns and `RocketInventoryCommitmentList` from the Rocket page. Keep current-stock and mapping/configuration resolution affordances unchanged.

Render `워크북 사용 안 함` only for `awaiting_coupang_confirmation`; invoke `abandonRocketWorkbook` with an explicit operator reason, and display the server's evidence-gate conflict when both fresh transport probes do not yet prove absence of matching orders.

- [ ] **Step 5: Run focused UI tests**

Run: `cd apps/web && npx vitest run src/app/'(supply)'/purchase-orders/hooks/useRocketPurchaseWorkflow.spec.tsx src/app/'(supply)'/purchase-orders/components/RocketPurchaseWorkspace.spec.tsx src/app/'(orders)'/rocket-orders/components/RocketConfirmPanel.spec.tsx src/app/'(orders)'/rocket-orders/components/RocketMatchStatusModal.spec.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the Rocket UI slice**

```bash
git add apps/web/src/app/'(supply)'/purchase-orders apps/web/src/app/'(orders)'/rocket-orders apps/web/src/lib/rocket-confirm-file-store.ts
git commit -m "refactor: make Rocket action a workbook download"
```

### Task 7: Align contracts, verify the full workflow, and update PR #361

**Files:**
- Modify: `apps/server/src/supply/AGENTS.md`
- Modify: `apps/server/src/inventory/AGENTS.md`
- Modify: `apps/server/src/orders/AGENTS.md`
- Modify: `apps/web/src/app/(supply)/AGENTS.md`
- Modify: `apps/web/src/app/(orders)/rocket-orders/AGENTS.md`
- Modify: `apps/web/src/app/(orders)/order-collection/AGENTS.md`
- Modify as required by schema generation: `docs/ERD.md`
- Modify as required by schema generation: `graphify-out/schema/*`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: durable domain instructions, green build/test evidence, browser QA evidence, and an accurate live PR body/comment.

- [ ] **Step 1: Replace stale scoped instructions**

Document `currentStock`-only calculation, calculation-local `remainingStock`, durable exact artifacts, organization-wide serialization, Orders collection linkage, stable Sellpia intent keys, and generation-fenced completion. Remove Rocket statements that require capacity commitments or expose `availableStock`.

- [ ] **Step 2: Run static terminology and architecture checks**

Run:

```bash
rg -n "activeCommitmentQuantity|availableStock|예약 확정|재고 예약|RocketInventoryCommitmentList|createRocketRequest|replaceRocketRequestWithFinalOrder" apps/server/src/supply apps/server/src/orders apps/web/src/app/'(orders)'/rocket-orders apps/web/src/app/'(supply)'/purchase-orders packages/shared/src/schemas/rocket-purchase-preview.ts
npm run check:agents-hygiene
```

Expected: the search has no Rocket product-code matches except explicit negative regression assertions; the agent hygiene check passes.

- [ ] **Step 3: Run complete repository gates for changed surfaces**

Run:

```bash
npm run db:push
npx prisma generate
cd packages/shared && npm run build
cd ../..
npm test --workspace=apps/server -- --runInBand
npm run dev:server
npm run build --workspace=apps/web
npm run db:erd
npm run graphify:schema
npm run check:pr-reconstruction -- --base origin/develop --head HEAD
npm run check:pr-release-contract -- --base origin/develop --head HEAD
```

Expected: every command passes; for `npm run dev:server`, observe a successful Nest boot and then terminate the process.

- [ ] **Step 4: Perform direct browser QA**

Use the browser QA skill against the running web/server stack. Verify: existing Rocket calendar/list/chart/matching/history render; preview shows only current stock; custom template export downloads; a second click downloads byte-identical content; another new export is blocked; collected Coupang PA creates a stable-key Sellpia file; retry does not create a second intent; and a newer verified inventory generation unlocks the next export. Capture screenshots and console/network failures if any.

- [ ] **Step 5: Commit docs and generated artifacts**

```bash
git add apps/server/src/*/AGENTS.md apps/web/src/app/'(supply)'/AGENTS.md apps/web/src/app/'(orders)'/*/AGENTS.md docs/ERD.md graphify-out/schema
git commit -m "docs: align Rocket workbook workflow contracts"
```

- [ ] **Step 6: Update and verify PR #361**

Update the PR body using `.github/PULL_REQUEST_TEMPLATE.md`, including the exact schema `db:push`/backfill decision and browser evidence. Add a review comment explaining that Rocket commitments/available stock were removed, one workbook consumes current stock only in memory, the artifact is immutable/re-downloadable, and the next export waits for linked Sellpia intent completion plus a newer verified generation. Then read back the live PR body and comment.

Run:

```bash
gh pr view 361 --json body,comments,headRefName,baseRefName,statusCheckRollup
git push origin feat/qa-test
```

Expected: base is `develop`, head is `feat/qa-test`, body contains every required template section, the new comment is visible, and the pushed SHA equals local `HEAD`.
