# Sellpia Rocket Schema Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the durable Prisma models and shared Zod contracts required by Sellpia import, new product candidates, receipt upload tracking, and Rocket inventory ledger events.

**Architecture:** Keep shared contracts in the existing focused `@kiditem/shared/inventory` subpath by extending `packages/shared/src/schemas/inventory.ts`. Keep persisted models in `prisma/models/inventory.prisma`, with required back-relations added to `Organization`, `ProductOption`, and `Inventory`.

**Tech Stack:** Prisma v7 multi-file schema, Zod, TypeScript, Vitest, tsup.

---

## File Structure

- Modify: `/Users/yhc125/workspace/kiditem/packages/shared/src/schemas/inventory.ts`
  - Owns all shared inventory-facing Zod schemas and inferred types.
- Create: `/Users/yhc125/workspace/kiditem/packages/shared/src/schemas/inventory-sellpia-rocket.spec.ts`
  - Verifies contract parsing, enum values, and reason requirements.
- Modify: `/Users/yhc125/workspace/kiditem/prisma/models/inventory.prisma`
  - Adds Sellpia snapshot, item, new-product candidate, receipt upload batch, and Rocket ledger models.
- Modify: `/Users/yhc125/workspace/kiditem/prisma/models/core.prisma`
  - Adds Prisma back-relations for Organization and ProductOption.
- Modify: `/Users/yhc125/workspace/kiditem/VERSION`
  - Bump from `0.1.6` to `0.1.7` because persisted schema and stock behavior change.

### Task 1: Shared Contract Tests

**Files:**
- Create: `/Users/yhc125/workspace/kiditem/packages/shared/src/schemas/inventory-sellpia-rocket.spec.ts`
- Modify: `/Users/yhc125/workspace/kiditem/packages/shared/src/schemas/inventory.ts`

- [ ] **Step 1: Write the failing shared contract tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  RocketInventoryEventInputSchema,
  SellpiaCandidateResolutionInputSchema,
  SellpiaReceiptUploadBatchSchema,
  SellpiaReceiptUploadBatchStatusSchema,
  SellpiaSnapshotImportResponseSchema,
  SellpiaStockSnapshotItemSchema,
} from './inventory';

describe('Sellpia and Rocket inventory contracts', () => {
  it('accepts row-scoped Sellpia snapshot responses with candidate rows', () => {
    const parsed = SellpiaSnapshotImportResponseSchema.parse({
      snapshot: {
        id: '00000000-0000-4000-8000-000000000001',
        fileName: 'exported-list.xlsx',
        rowCount: 2,
        effectiveExportedAt: '2026-06-29T00:00:00.000Z',
        status: 'previewed',
      },
      summary: {
        matchedCount: 1,
        recommendedCount: 1,
        reviewCount: 0,
        rejectedCount: 0,
        newProductCandidateCount: 1,
      },
      items: [
        {
          id: '00000000-0000-4000-8000-000000000002',
          rowNumber: 2,
          sellpiaProductCode: 'SP-001',
          sellpiaProductName: '테스트 상품',
          sellpiaStock: 12,
          safetyStock: 3,
          barcode: '8801234567890',
          productOptionId: '00000000-0000-4000-8000-000000000003',
          inventoryId: '00000000-0000-4000-8000-000000000004',
          rocketLedgerNet: -2,
          targetCurrentStock: 10,
          kiditemStockBefore: 8,
          diff: 2,
          diffRate: 0.2,
          status: 'recommended',
          blockingReasons: [],
          warningReasons: [],
          operatorTargetStock: null,
          reviewNote: null,
        },
      ],
      newProductCandidates: [
        {
          id: '00000000-0000-4000-8000-000000000005',
          snapshotItemId: '00000000-0000-4000-8000-000000000006',
          sellpiaProductCode: 'SP-NEW',
          sellpiaProductName: '신규 상품',
          sellpiaStock: 4,
          safetyStock: 0,
          barcode: null,
          status: 'pending',
          operatorInitialStock: 4,
        },
      ],
    });

    expect(parsed.summary.newProductCandidateCount).toBe(1);
    expect(parsed.items[0].targetCurrentStock).toBe(10);
  });

  it('requires a reason for Rocket issue over the open reservation', () => {
    expect(() =>
      RocketInventoryEventInputSchema.parse({
        inventoryId: '00000000-0000-4000-8000-000000000001',
        optionId: '00000000-0000-4000-8000-000000000002',
        eventType: 'issue',
        quantity: 5,
        sourceActionId: 'rocket-po-1-line-1-issue',
        sourceType: 'rocket_shipment',
        sourceRef: 'PO-1/line-1',
        openReservationQty: 3,
        allowOverReservation: true,
      }),
    ).toThrow();

    expect(
      RocketInventoryEventInputSchema.parse({
        inventoryId: '00000000-0000-4000-8000-000000000001',
        optionId: '00000000-0000-4000-8000-000000000002',
        eventType: 'issue',
        quantity: 5,
        sourceActionId: 'rocket-po-1-line-1-issue',
        sourceType: 'rocket_shipment',
        sourceRef: 'PO-1/line-1',
        openReservationQty: 3,
        allowOverReservation: true,
        overrideReason: 'shipment quantity corrected after manual count',
      }).overrideReason,
    ).toBe('shipment quantity corrected after manual count');
  });

  it('models new product candidate resolution with editable initial stock', () => {
    const parsed = SellpiaCandidateResolutionInputSchema.parse({
      action: 'create_product',
      masterName: '신규 상품',
      optionName: '단품',
      sku: 'SP-NEW',
      barcode: '8801234567890',
      operatorInitialStock: 7,
      note: 'Sellpia row confirmed',
    });

    expect(parsed.operatorInitialStock).toBe(7);
  });

  it('does not allow negative target stock on snapshot items', () => {
    expect(() =>
      SellpiaStockSnapshotItemSchema.parse({
        id: '00000000-0000-4000-8000-000000000001',
        rowNumber: 2,
        sellpiaProductCode: 'SP-001',
        sellpiaProductName: '테스트 상품',
        sellpiaStock: 1,
        safetyStock: 0,
        barcode: null,
        productOptionId: null,
        inventoryId: null,
        rocketLedgerNet: -3,
        targetCurrentStock: -2,
        kiditemStockBefore: 0,
        diff: -2,
        diffRate: 1,
        status: 'rejected',
        blockingReasons: ['negative_target_stock'],
        warningReasons: [],
        operatorTargetStock: null,
        reviewNote: null,
      }),
    ).toThrow();
  });

  it('tracks receipt upload batches while the official Sellpia template is pending', () => {
    const parsed = SellpiaReceiptUploadBatchSchema.parse({
      id: '00000000-0000-4000-8000-000000000007',
      status: 'template_pending',
      sourceType: 'purchase_receipt',
      sourceRef: 'receipt-20260629-1',
      templateVersion: null,
      uploadedAt: null,
      note: null,
      createdAt: '2026-06-29T00:00:00.000Z',
    });

    expect(SellpiaReceiptUploadBatchStatusSchema.options).toContain('pending_upload');
    expect(parsed.status).toBe('template_pending');
  });
});
```

- [ ] **Step 2: Run the shared contract test and verify it fails**

Run:

```bash
npm exec --workspace=packages/shared vitest -- run src/schemas/inventory-sellpia-rocket.spec.ts
```

Expected: FAIL with missing exports such as `SellpiaSnapshotImportResponseSchema`.

- [ ] **Step 3: Add Sellpia and Rocket schemas**

Append this block to `/Users/yhc125/workspace/kiditem/packages/shared/src/schemas/inventory.ts`:

```ts
export const SellpiaSnapshotStatusSchema = z.enum(['previewed', 'applied', 'failed']);
export type SellpiaSnapshotStatus = z.infer<typeof SellpiaSnapshotStatusSchema>;

export const SellpiaSnapshotItemStatusSchema = z.enum([
  'recommended',
  'needs_review',
  'approved_adjusted',
  'manual_adjusted',
  'ignored',
  'new_product_candidate',
  'missing_inventory',
  'rejected',
]);
export type SellpiaSnapshotItemStatus = z.infer<typeof SellpiaSnapshotItemStatusSchema>;

export const SellpiaBlockingReasonSchema = z.enum([
  'duplicate_code',
  'invalid_stock',
  'negative_target_stock',
  'parse_warning',
  'recent_kiditem_event',
  'new_product_candidate',
  'missing_inventory',
]);
export type SellpiaBlockingReason = z.infer<typeof SellpiaBlockingReasonSchema>;

export const SellpiaWarningReasonSchema = z.enum(['large_difference']);
export type SellpiaWarningReason = z.infer<typeof SellpiaWarningReasonSchema>;

export const SellpiaStockSnapshotSchema = z.object({
  id: z.string().uuid(),
  fileName: z.string(),
  rowCount: z.number().int().nonnegative(),
  effectiveExportedAt: zIsoDate,
  status: SellpiaSnapshotStatusSchema,
});
export type SellpiaStockSnapshot = z.infer<typeof SellpiaStockSnapshotSchema>;

export const SellpiaStockSnapshotItemSchema = z.object({
  id: z.string().uuid(),
  rowNumber: z.number().int().positive(),
  sellpiaProductCode: z.string().min(1),
  sellpiaProductName: z.string().nullable(),
  sellpiaStock: z.number().int().nonnegative(),
  safetyStock: z.number().int().nonnegative(),
  barcode: z.string().nullable(),
  productOptionId: z.string().uuid().nullable(),
  inventoryId: z.string().uuid().nullable(),
  rocketLedgerNet: z.number().int(),
  targetCurrentStock: z.number().int().nonnegative(),
  kiditemStockBefore: z.number().int().nonnegative(),
  diff: z.number().int(),
  diffRate: z.number().nonnegative(),
  status: SellpiaSnapshotItemStatusSchema,
  blockingReasons: z.array(SellpiaBlockingReasonSchema),
  warningReasons: z.array(SellpiaWarningReasonSchema),
  operatorTargetStock: z.number().int().nonnegative().nullable(),
  reviewNote: z.string().max(500).nullable(),
});
export type SellpiaStockSnapshotItem = z.infer<typeof SellpiaStockSnapshotItemSchema>;

export const SellpiaNewProductCandidateStatusSchema = z.enum([
  'pending',
  'linked_existing_option',
  'created_new_option',
  'ignored',
  'rejected',
]);
export type SellpiaNewProductCandidateStatus = z.infer<typeof SellpiaNewProductCandidateStatusSchema>;

export const SellpiaNewProductCandidateSchema = z.object({
  id: z.string().uuid(),
  snapshotItemId: z.string().uuid(),
  sellpiaProductCode: z.string().min(1),
  sellpiaProductName: z.string().nullable(),
  sellpiaStock: z.number().int().nonnegative(),
  safetyStock: z.number().int().nonnegative(),
  barcode: z.string().nullable(),
  status: SellpiaNewProductCandidateStatusSchema,
  operatorInitialStock: z.number().int().nonnegative().nullable(),
});
export type SellpiaNewProductCandidate = z.infer<typeof SellpiaNewProductCandidateSchema>;

export const SellpiaSnapshotImportResponseSchema = z.object({
  snapshot: SellpiaStockSnapshotSchema,
  summary: z.object({
    matchedCount: z.number().int().nonnegative(),
    recommendedCount: z.number().int().nonnegative(),
    reviewCount: z.number().int().nonnegative(),
    rejectedCount: z.number().int().nonnegative(),
    newProductCandidateCount: z.number().int().nonnegative(),
  }),
  items: z.array(SellpiaStockSnapshotItemSchema),
  newProductCandidates: z.array(SellpiaNewProductCandidateSchema),
});
export type SellpiaSnapshotImportResponse = z.infer<typeof SellpiaSnapshotImportResponseSchema>;

export const SellpiaApprovalInputSchema = z.object({
  targetCurrentStock: z.number().int().nonnegative(),
  reason: z.string().max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.reason !== undefined && value.reason.trim() === '') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'reason cannot be blank' });
  }
});
export type SellpiaApprovalInput = z.infer<typeof SellpiaApprovalInputSchema>;

export const SellpiaCandidateResolutionInputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_product'),
    masterName: z.string().min(1).max(200),
    optionName: z.string().max(100).nullable().optional(),
    sku: z.string().min(1).max(100),
    barcode: z.string().max(100).nullable().optional(),
    operatorInitialStock: z.number().int().nonnegative(),
    note: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal('create_option'),
    masterProductId: z.string().uuid(),
    optionName: z.string().max(100).nullable().optional(),
    sku: z.string().min(1).max(100),
    barcode: z.string().max(100).nullable().optional(),
    operatorInitialStock: z.number().int().nonnegative(),
    note: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal('link_option'),
    productOptionId: z.string().uuid(),
    operatorInitialStock: z.number().int().nonnegative(),
    note: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal('ignore'),
    note: z.string().max(500).optional(),
  }),
]);
export type SellpiaCandidateResolutionInput = z.infer<typeof SellpiaCandidateResolutionInputSchema>;

export const SellpiaReceiptUploadBatchStatusSchema = z.enum([
  'template_pending',
  'pending_upload',
  'uploaded',
  'needs_reupload',
  'canceled',
]);
export type SellpiaReceiptUploadBatchStatus = z.infer<typeof SellpiaReceiptUploadBatchStatusSchema>;

export const SellpiaReceiptUploadBatchSchema = z.object({
  id: z.string().uuid(),
  status: SellpiaReceiptUploadBatchStatusSchema,
  sourceType: z.string().min(1).max(50),
  sourceRef: z.string().min(1).max(200),
  templateVersion: z.string().max(50).nullable(),
  uploadedAt: zIsoDate.nullable(),
  note: z.string().max(500).nullable(),
  createdAt: zIsoDate,
});
export type SellpiaReceiptUploadBatch = z.infer<typeof SellpiaReceiptUploadBatchSchema>;

export const RocketInventoryEventTypeSchema = z.enum(['reserve', 'release', 'issue', 'return_restock']);
export type RocketInventoryEventType = z.infer<typeof RocketInventoryEventTypeSchema>;

export const RocketInventoryEventInputSchema = z.object({
  inventoryId: z.string().uuid(),
  optionId: z.string().uuid(),
  eventType: RocketInventoryEventTypeSchema,
  quantity: z.number().int().positive(),
  sourceActionId: z.string().min(1).max(200),
  sourceType: z.string().min(1).max(50),
  sourceRef: z.string().min(1).max(200),
  openReservationQty: z.number().int().nonnegative().optional(),
  allowOverReservation: z.boolean().optional(),
  overrideReason: z.string().max(500).optional(),
  note: z.string().max(500).optional(),
}).superRefine((value, ctx) => {
  if (
    value.eventType === 'issue' &&
    value.allowOverReservation === true &&
    value.openReservationQty !== undefined &&
    value.quantity > value.openReservationQty &&
    !value.overrideReason?.trim()
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['overrideReason'],
      message: 'overrideReason is required when issuing over the open reservation',
    });
  }
});
export type RocketInventoryEventInput = z.infer<typeof RocketInventoryEventInputSchema>;
```

- [ ] **Step 4: Run the shared contract test and build**

Run:

```bash
npm exec --workspace=packages/shared vitest -- run src/schemas/inventory-sellpia-rocket.spec.ts
cd packages/shared && npm run build
```

Expected: PASS for the Vitest file, then tsup finishes and emits `dist/inventory.js`.

- [ ] **Step 5: Commit shared contracts**

```bash
git add packages/shared/src/schemas/inventory.ts packages/shared/src/schemas/inventory-sellpia-rocket.spec.ts
git commit -m "feat: add Sellpia Rocket inventory contracts"
```

### Task 2: Prisma Models

**Files:**
- Modify: `/Users/yhc125/workspace/kiditem/prisma/models/inventory.prisma`
- Modify: `/Users/yhc125/workspace/kiditem/prisma/models/core.prisma`
- Modify: `/Users/yhc125/workspace/kiditem/VERSION`

- [ ] **Step 1: Confirm the models are not present**

Run:

```bash
rg -n "model SellpiaStockSnapshot|model RocketInventoryLedger|model SellpiaReceiptUploadBatch" prisma/models
```

Expected: no matches.

- [ ] **Step 2: Add Inventory-domain models**

Append these models to `/Users/yhc125/workspace/kiditem/prisma/models/inventory.prisma`:

```prisma
/// @namespace Inventory
/// @describe Sellpia stock export import attempt. Imports are row-scoped; absent products are ignored.
model SellpiaStockSnapshot {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  fileName       String   @map("file_name")
  fileHash       String   @map("file_hash")
  rowCount       Int      @map("row_count")
  effectiveExportedAt DateTime @map("effective_exported_at") @db.Timestamptz
  uploadedAt     DateTime @default(now()) @map("uploaded_at") @db.Timestamptz
  status         String   @default("previewed")
  createdBy      String?  @map("created_by")
  metaJson       Json?    @map("meta_json")
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  items        SellpiaStockSnapshotItem[]

  @@index([organizationId, createdAt])
  @@index([organizationId, effectiveExportedAt])
  @@map("sellpia_stock_snapshots")
}

/// @namespace Inventory
/// @describe One imported Sellpia product row with recommendation/review state.
model SellpiaStockSnapshotItem {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  snapshotId     String   @map("snapshot_id") @db.Uuid
  rowNumber      Int      @map("row_number")
  sellpiaProductCode String @map("sellpia_product_code")
  sellpiaProductName String? @map("sellpia_product_name")
  sellpiaStock   Int      @map("sellpia_stock")
  safetyStock    Int      @default(0) @map("safety_stock")
  ownProductCode String?  @map("own_product_code")
  barcode        String?
  modelName      String?  @map("model_name")
  productOptionId String? @map("product_option_id") @db.Uuid
  inventoryId    String?  @map("inventory_id") @db.Uuid
  rocketLedgerNet Int     @default(0) @map("rocket_ledger_net")
  targetCurrentStock Int  @map("target_current_stock")
  kiditemStockBefore Int  @map("kiditem_stock_before")
  operatorTargetStock Int? @map("operator_target_stock")
  kiditemStockAtApply Int? @map("kiditem_stock_at_apply")
  diff           Int
  diffRate       Decimal  @default(0) @map("diff_rate") @db.Decimal(8, 4)
  status         String
  blockingReasons Json    @map("blocking_reasons")
  warningReasons  Json?   @map("warning_reasons")
  appliedTransactionId String? @map("applied_transaction_id") @db.Uuid
  reviewedBy     String?  @map("reviewed_by")
  reviewedAt     DateTime? @map("reviewed_at") @db.Timestamptz
  reviewDecision String?  @map("review_decision")
  reviewNote     String?  @map("review_note")
  rawJson        Json?    @map("raw_json")
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  snapshot     SellpiaStockSnapshot @relation(fields: [snapshotId], references: [id], onDelete: Cascade)
  option       ProductOption? @relation(fields: [productOptionId], references: [id], onDelete: SetNull)
  inventory    Inventory? @relation(fields: [inventoryId], references: [id], onDelete: SetNull)
  newProductCandidate SellpiaNewProductCandidate?

  @@index([organizationId, snapshotId])
  @@index([organizationId, sellpiaProductCode])
  @@index([organizationId, productOptionId])
  @@index([organizationId, inventoryId])
  @@index([organizationId, status])
  @@map("sellpia_stock_snapshot_items")
}

/// @namespace Inventory
/// @describe Unmatched Sellpia row that must be explicitly created, linked, ignored, or rejected.
model SellpiaNewProductCandidate {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  snapshotItemId String   @unique @map("snapshot_item_id") @db.Uuid
  sellpiaProductCode String @map("sellpia_product_code")
  sellpiaProductName String? @map("sellpia_product_name")
  sellpiaStock   Int      @map("sellpia_stock")
  safetyStock    Int      @default(0) @map("safety_stock")
  ownProductCode String?  @map("own_product_code")
  barcode        String?
  modelName      String?  @map("model_name")
  status         String   @default("pending")
  resolvedMasterProductId String? @map("resolved_master_product_id") @db.Uuid
  resolvedProductOptionId String? @map("resolved_product_option_id") @db.Uuid
  createdInventoryId String? @map("created_inventory_id") @db.Uuid
  initialReceiveTransactionId String? @map("initial_receive_transaction_id") @db.Uuid
  operatorInitialStock Int? @map("operator_initial_stock")
  resolutionDecision String? @map("resolution_decision")
  resolvedBy     String?  @map("resolved_by")
  resolvedAt     DateTime? @map("resolved_at") @db.Timestamptz
  note           String?
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  snapshotItem SellpiaStockSnapshotItem @relation(fields: [snapshotItemId], references: [id], onDelete: Cascade)
  resolvedOption ProductOption? @relation(fields: [resolvedProductOptionId], references: [id], onDelete: SetNull)
  createdInventory Inventory? @relation(fields: [createdInventoryId], references: [id], onDelete: SetNull)

  @@index([organizationId, status])
  @@index([organizationId, sellpiaProductCode])
  @@map("sellpia_new_product_candidates")
}

/// @namespace Inventory
/// @describe KidItem receipt batch that still needs Sellpia upload confirmation.
model SellpiaReceiptUploadBatch {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  status         String   @default("template_pending")
  sourceType     String   @map("source_type")
  sourceRef      String   @map("source_ref")
  templateVersion String? @map("template_version")
  uploadedBy     String?  @map("uploaded_by")
  uploadedAt     DateTime? @map("uploaded_at") @db.Timestamptz
  note           String?
  metaJson       Json?    @map("meta_json")
  createdBy      String?  @map("created_by")
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId, status])
  @@index([organizationId, createdAt])
  @@map("sellpia_receipt_upload_batches")
}

/// @namespace Inventory
/// @describe Coupang Rocket stock event ledger. Sellpia never contains these effects.
model RocketInventoryLedger {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  inventoryId    String   @map("inventory_id") @db.Uuid
  optionId       String   @map("option_id") @db.Uuid
  eventType      String   @map("event_type")
  quantity       Int
  reservedDelta  Int      @default(0) @map("reserved_delta")
  stockDelta     Int      @default(0) @map("stock_delta")
  rocketPoSeq    Int?     @map("rocket_po_seq")
  rocketPoLineKey String? @map("rocket_po_line_key")
  sourceActionId String   @map("source_action_id")
  sourceType     String   @map("source_type")
  sourceRef      String   @map("source_ref")
  occurredAt     DateTime @default(now()) @map("occurred_at") @db.Timestamptz
  createdBy      String?  @map("created_by")
  note           String?
  metaJson       Json?    @map("meta_json")
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  inventory    Inventory @relation(fields: [inventoryId], references: [id], onDelete: Cascade)
  option       ProductOption @relation(fields: [optionId], references: [id], onDelete: Restrict)

  @@unique([organizationId, sourceActionId, eventType])
  @@index([organizationId, createdAt])
  @@index([organizationId, inventoryId, createdAt])
  @@index([organizationId, optionId, createdAt])
  @@index([organizationId, rocketPoSeq])
  @@map("rocket_inventory_ledger")
}
```

- [ ] **Step 3: Add Prisma back-relations**

Add these fields inside `model Organization` in `/Users/yhc125/workspace/kiditem/prisma/models/core.prisma` under the inventory relation group:

```prisma
  sellpiaStockSnapshots       SellpiaStockSnapshot[]
  sellpiaStockSnapshotItems   SellpiaStockSnapshotItem[]
  sellpiaNewProductCandidates SellpiaNewProductCandidate[]
  sellpiaReceiptUploadBatches SellpiaReceiptUploadBatch[]
  rocketInventoryLedger       RocketInventoryLedger[]
```

Add these fields inside `model ProductOption` next to the inventory/stock relations:

```prisma
  sellpiaStockSnapshotItems   SellpiaStockSnapshotItem[]
  sellpiaNewProductCandidates SellpiaNewProductCandidate[]
  rocketInventoryLedger       RocketInventoryLedger[]
```

Add these fields inside `model Inventory` in `/Users/yhc125/workspace/kiditem/prisma/models/inventory.prisma`:

```prisma
  sellpiaStockSnapshotItems SellpiaStockSnapshotItem[]
  sellpiaNewProductCandidates SellpiaNewProductCandidate[]
  rocketInventoryLedger RocketInventoryLedger[]
```

- [ ] **Step 4: Bump the app version**

Edit `/Users/yhc125/workspace/kiditem/VERSION` so the file contains:

```text
0.1.7
```

- [ ] **Step 5: Validate Prisma and generate client**

Run:

```bash
npx prisma validate
npx prisma generate
```

Expected: Prisma schema validates and generated client includes `sellpiaStockSnapshot`, `sellpiaStockSnapshotItem`, `sellpiaNewProductCandidate`, `sellpiaReceiptUploadBatch`, and `rocketInventoryLedger`.

- [ ] **Step 6: Push schema to the local database**

Run:

```bash
npm run db:push
```

Expected: Prisma reports the database is in sync with the Prisma schema.

- [ ] **Step 7: Commit schema changes**

```bash
git add VERSION prisma/models/core.prisma prisma/models/inventory.prisma
git commit -m "feat: add Sellpia Rocket inventory schema"
```

## Self-Review

- Spec coverage: this plan covers persistent models, shared contracts, version bump, and schema generation.
- Red-flag scan: no blocked planning phrases are intentionally present.
- Type consistency: schema names match the shared exports consumed by the backend and web plans.
