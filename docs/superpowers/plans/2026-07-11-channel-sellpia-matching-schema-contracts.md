# Channel and Sellpia Matching Schema Contracts Implementation Plan

> **SUPERSEDED:** Do not execute this plan. The authoritative design is
> `docs/superpowers/specs/2026-07-12-sellpia-authoritative-inventory-cutover-design.md`.
> A replacement implementation plan has not yet been approved.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the expand-release database shape, shared runtime contracts, account backfill, and release metadata for Sellpia inventory SKUs and channel SKU component mappings.

**Architecture:** Preserve `ChannelListing`/`ChannelListingOption` IDs and tables as compatibility storage while adding target metadata fields. Add three new models with organization-scoped relations. Expose two focused shared subpaths: `@kiditem/shared/source-import` for file imports and `@kiditem/shared/channel-sku-matching` for the matching API. No legacy ProductOption relation becomes a new component.

**Tech Stack:** Prisma v7 multi-file schema with partial indexes, Zod, TypeScript, Vitest, Node test runner, versioned data migrations.

## Global Constraints

- Follow the parent plan's global constraints.
- This is release `0.1.8`; change root `VERSION` exactly once in this plan.
- The physical compatibility names remain `ChannelListing` and `ChannelListingOption`.
- `ChannelListing.masterId` becomes nullable so source catalog rows may exist without a `MasterProduct`.
- `ChannelListing.channelAccountId` and new `ChannelListingOption.channelAccountId` remain physically nullable during expand, but every new import/service path requires a real account.
- New `ChannelSkuComponent` rows must use composite organization-safe foreign keys immediately.
- `SourceImportRun.attemptToken` is an internal lease-fencing UUID. It is the only extra operational field: stale/failed run reclaim, normalized writes, completion, and failure marking must all compare the same token so an older worker cannot overwrite a newer retry.
- Do not copy `optionId`, `isUnmatched`, `BundleComponent`, or reconciliation rows into components.
- Never run an unguarded `db:push --accept-data-loss`. Existing-table unique constraints may use it only after the repeatable identity preflight passes and the db-push log contains exactly the allowlisted unique-addition warnings; any drop or extra warning blocks deployment.

---

## File Structure

Create:

- `/Users/yhc125/workspace/kiditem/packages/shared/src/schemas/source-import.ts`
- `/Users/yhc125/workspace/kiditem/packages/shared/src/schemas/source-import.spec.ts`
- `/Users/yhc125/workspace/kiditem/packages/shared/src/source-import.ts`
- `/Users/yhc125/workspace/kiditem/packages/shared/src/schemas/channel-sku-matching.ts`
- `/Users/yhc125/workspace/kiditem/packages/shared/src/schemas/channel-sku-matching.spec.ts`
- `/Users/yhc125/workspace/kiditem/packages/shared/src/channel-sku-matching.ts`
- `/Users/yhc125/workspace/kiditem/scripts/__tests__/channel-sellpia-matching-schema-contract.test.mjs`
- `/Users/yhc125/workspace/kiditem/scripts/check-channel-sku-identity.ts`
- `/Users/yhc125/workspace/kiditem/scripts/check-channel-sku-db-push-warning.mjs`
- `/Users/yhc125/workspace/kiditem/scripts/__tests__/check-channel-sku-identity.spec.ts`
- `/Users/yhc125/workspace/kiditem/scripts/__tests__/check-channel-sku-db-push-warning.test.mjs`
- `/Users/yhc125/workspace/kiditem/scripts/data-migrations/v0.1.8/001_backfill_channel_sku_accounts.ts`

Modify:

- `/Users/yhc125/workspace/kiditem/packages/shared/src/schemas/channel-account.ts`
- `/Users/yhc125/workspace/kiditem/packages/shared/package.json`
- `/Users/yhc125/workspace/kiditem/packages/shared/tsup.config.ts`
- `/Users/yhc125/workspace/kiditem/prisma/models/core.prisma`
- `/Users/yhc125/workspace/kiditem/prisma/models/inventory.prisma`
- `/Users/yhc125/workspace/kiditem/prisma/models/channels.prisma`
- `/Users/yhc125/workspace/kiditem/scripts/data-migrations/index.ts`
- `/Users/yhc125/workspace/kiditem/scripts/__tests__/run-data-migrations.spec.ts`
- `/Users/yhc125/workspace/kiditem/scripts/run-data-migrations.ts`
- `/Users/yhc125/workspace/kiditem/scripts/check-script-inventory.mjs`
- `/Users/yhc125/workspace/kiditem/scripts/README.md`
- `/Users/yhc125/workspace/kiditem/scripts/data-migrations/README.md`
- `/Users/yhc125/workspace/kiditem/package.json`
- `/Users/yhc125/workspace/kiditem/.github/workflows/staging-deploy.yml`
- `/Users/yhc125/workspace/kiditem/.github/workflows/production-deploy.yml`
- `/Users/yhc125/workspace/kiditem/docs/runbooks/staging-deploy.md`
- `/Users/yhc125/workspace/kiditem/docs/runbooks/production-deploy.md`
- `/Users/yhc125/workspace/kiditem/docs/runbooks/deployment-architecture.md`
- `/Users/yhc125/workspace/kiditem/VERSION`

## Task 1: Freeze Shared Import Contracts

**Files:**

- Create: `packages/shared/src/schemas/source-import.spec.ts`
- Create: `packages/shared/src/schemas/source-import.ts`
- Create: `packages/shared/src/source-import.ts`
- Modify: `packages/shared/package.json`
- Modify: `packages/shared/tsup.config.ts`

- [ ] **Step 1: Write the failing source-import schema tests**

Create `packages/shared/src/schemas/source-import.spec.ts` with these cases:

```ts
import { describe, expect, it } from 'vitest';
import {
  CoupangWingCatalogImportResponseSchema,
  SellpiaInventoryImportResponseSchema,
  SourceImportRunSchema,
} from './source-import';

const run = {
  id: '00000000-0000-4000-8000-000000000001',
  sourceType: 'sellpia_inventory',
  channelAccountId: null,
  fileName: 'exported-list (3).xls',
  fileHash: 'a'.repeat(64),
  status: 'completed',
  rowCount: 1964,
  importedAt: '2026-07-11T00:00:00.000Z',
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
};

describe('source import contracts', () => {
  it('parses a completed Sellpia full-snapshot result', () => {
    const parsed = SellpiaInventoryImportResponseSchema.parse({
      run,
      duplicate: false,
      changes: { createdSkuCount: 1964, updatedSkuCount: 0, zeroedSkuCount: 0 },
    });
    expect(parsed.run.rowCount).toBe(1964);
  });

  it('requires channel account scope for Wing responses', () => {
    expect(() => CoupangWingCatalogImportResponseSchema.parse({
      run: { ...run, sourceType: 'coupang_wing_catalog' },
      duplicate: false,
      changes: {
        createdProductCount: 1225,
        updatedProductCount: 0,
        createdSkuCount: 2241,
        updatedSkuCount: 0,
        skippedRowCount: 3,
      },
    })).toThrow();
  });

  it('accepts an idempotent duplicate with zero changes', () => {
    const parsed = SellpiaInventoryImportResponseSchema.parse({
      run,
      duplicate: true,
      changes: { createdSkuCount: 0, updatedSkuCount: 0, zeroedSkuCount: 0 },
    });
    expect(parsed.duplicate).toBe(true);
  });

  it('rejects a malformed SHA-256 hash', () => {
    expect(() => SourceImportRunSchema.parse({ ...run, fileHash: 'short' })).toThrow();
  });

  it('rejects a non-completed success response and nonzero duplicate changes', () => {
    expect(() => SellpiaInventoryImportResponseSchema.parse({
      run: { ...run, status: 'running', importedAt: null },
      duplicate: false,
      changes: { createdSkuCount: 0, updatedSkuCount: 0, zeroedSkuCount: 0 },
    })).toThrow();
    expect(() => SellpiaInventoryImportResponseSchema.parse({
      run,
      duplicate: true,
      changes: { createdSkuCount: 1, updatedSkuCount: 0, zeroedSkuCount: 0 },
    })).toThrow();
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/source-import.spec.ts
```

Expected: FAIL because `./source-import` does not exist.

- [ ] **Step 3: Implement the complete import schema**

Create `packages/shared/src/schemas/source-import.ts`:

```ts
import { z } from 'zod';
import { zIsoDate } from './common.js';

export const SourceImportTypeSchema = z.enum([
  'sellpia_inventory',
  'coupang_wing_catalog',
]);
export type SourceImportType = z.infer<typeof SourceImportTypeSchema>;

export const SourceImportStatusSchema = z.enum(['running', 'completed', 'failed']);
export type SourceImportStatus = z.infer<typeof SourceImportStatusSchema>;

export const SourceImportRunSchema = z.object({
  id: z.string().uuid(),
  sourceType: SourceImportTypeSchema,
  channelAccountId: z.string().uuid().nullable(),
  fileName: z.string().min(1),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: SourceImportStatusSchema,
  rowCount: z.number().int().nonnegative(),
  importedAt: zIsoDate.nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});
export type SourceImportRun = z.infer<typeof SourceImportRunSchema>;

export const SellpiaInventoryImportResponseSchema = z.object({
  run: SourceImportRunSchema.superRefine((value, ctx) => {
    if (value.sourceType !== 'sellpia_inventory' || value.channelAccountId !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Sellpia run must not have a channel account' });
    }
  }),
  duplicate: z.boolean(),
  changes: z.object({
    createdSkuCount: z.number().int().nonnegative(),
    updatedSkuCount: z.number().int().nonnegative(),
    zeroedSkuCount: z.number().int().nonnegative(),
  }),
});
export type SellpiaInventoryImportResponse = z.infer<typeof SellpiaInventoryImportResponseSchema>;

export const CoupangWingCatalogImportResponseSchema = z.object({
  run: SourceImportRunSchema.superRefine((value, ctx) => {
    if (value.sourceType !== 'coupang_wing_catalog' || value.channelAccountId === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Wing run requires a channel account' });
    }
  }),
  duplicate: z.boolean(),
  changes: z.object({
    createdProductCount: z.number().int().nonnegative(),
    updatedProductCount: z.number().int().nonnegative(),
    createdSkuCount: z.number().int().nonnegative(),
    updatedSkuCount: z.number().int().nonnegative(),
    skippedRowCount: z.number().int().nonnegative(),
  }),
});
export type CoupangWingCatalogImportResponse = z.infer<typeof CoupangWingCatalogImportResponseSchema>;
```

Add response-level `superRefine` rules to both success schemas:

- `run.status` must be `completed` and `run.importedAt` must be non-null;
- when `duplicate === true`, every numeric field under `changes` must be zero.

The internal `attemptToken` is deliberately not exposed in `SourceImportRunSchema` or either HTTP response.

Create `packages/shared/src/source-import.ts`:

```ts
export * from './schemas/source-import.js';
```

Add `src/source-import.ts` to the `entry` array in `packages/shared/tsup.config.ts`. Add matching `./source-import` entries to both `exports` and `typesVersions` in `packages/shared/package.json`. Do not export it from `src/index.ts` or `src/schemas/index.ts`.

- [ ] **Step 4: Run the focused test and shared build**

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/source-import.spec.ts
rtk npm run build --workspace=packages/shared
```

Expected: PASS and the build emits `dist/source-import.{js,cjs,d.ts}`.

- [ ] **Step 5: Commit**

```bash
rtk git add packages/shared/src/schemas/source-import.ts packages/shared/src/schemas/source-import.spec.ts packages/shared/src/source-import.ts packages/shared/package.json packages/shared/tsup.config.ts
rtk git commit -m "feat: add source import contracts"
```

## Task 2: Freeze Matching Contracts

**Files:**

- Create: `packages/shared/src/schemas/channel-sku-matching.spec.ts`
- Create: `packages/shared/src/schemas/channel-sku-matching.ts`
- Create: `packages/shared/src/channel-sku-matching.ts`
- Modify: `packages/shared/src/schemas/channel-account.ts`
- Modify: `packages/shared/package.json`
- Modify: `packages/shared/tsup.config.ts`

- [ ] **Step 1: Write failing tests for list rows, candidates, and component replacement**

The test must prove:

- `mappingStatus` accepts only `unmatched | needs_review | matched`;
- a list item contains independent account, parent-product, channel-SKU, and Sellpia-component metadata;
- `reportedStock` is display-only response data;
- a same-SKU four-pack parses with `quantity: 4`;
- a mixed recipe parses with two components;
- the shared/exported `MAX_CHANNEL_SKU_COMPONENTS` value is exactly 50 and a 51-row replacement is rejected;
- replacement accepts `[]` as explicit unmap;
- replacement rejects duplicate InventorySku IDs and zero/negative/non-integer quantities;
- `mappingSource`, `createdBy`, and `organizationId` cause strict request parsing to fail rather than being silently stripped;
- candidate reasons accept only `exact_sellpia_code | unique_barcode | ambiguous_identifier | name_suggestion | manual_search`.

Use this replacement assertion verbatim:

```ts
expect(() => ReplaceChannelSkuComponentsInputSchema.parse({
  components: [
    { inventorySkuId: '00000000-0000-4000-8000-000000000001', quantity: 1 },
    { inventorySkuId: '00000000-0000-4000-8000-000000000001', quantity: 2 },
  ],
})).toThrow(/duplicate/i);

expect(ReplaceChannelSkuComponentsInputSchema.parse({ components: [] })).toEqual({ components: [] });
```

- [ ] **Step 2: Run the test and verify failure**

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/channel-sku-matching.spec.ts
```

Expected: FAIL because the matching schemas do not exist.

- [ ] **Step 3: Implement the focused matching schema**

Create `packages/shared/src/schemas/channel-sku-matching.ts` with these exported schemas and inferred types:

```ts
ChannelSkuMappingStatusSchema
ChannelSkuMappingComponentSchema
ChannelSkuMappingListItemSchema
ChannelSkuMappingListResponseSchema
ChannelSkuMatchCandidateReasonSchema
ChannelSkuMatchCandidateSchema
ChannelSkuMatchCandidateListResponseSchema
ReplaceChannelSkuComponentsInputSchema
RefreshChannelSkuMappingStatusInputSchema
```

The public shapes are fixed as follows:

```ts
const ChannelSkuMappingComponentSchema = z.object({
  inventorySkuId: z.string().uuid(),
  sellpiaProductCode: z.string().min(1),
  name: z.string().min(1),
  optionName: z.string().nullable(),
  barcode: z.string().nullable(),
  reportedStock: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  mappingSource: z.string().nullable(),
});

const ChannelSkuMappingListItemSchema = z.object({
  channelAccount: z.object({
    id: z.string().uuid(),
    channel: z.string().min(1),
    name: z.string().min(1),
  }),
  product: z.object({
    id: z.string().uuid(),
    externalProductId: z.string().min(1),
    registeredName: z.string().nullable(),
    displayName: z.string().nullable(),
    status: z.string().nullable(),
  }),
  sku: z.object({
    id: z.string().uuid(),
    externalSkuId: z.string().min(1),
    sellerSku: z.string().nullable(),
    optionName: z.string().nullable(),
    barcode: z.string().nullable(),
    modelNumber: z.string().nullable(),
    salePrice: z.number().int().nonnegative().nullable(),
    status: z.string().nullable(),
    mappingStatus: ChannelSkuMappingStatusSchema,
    updatedAt: zIsoDate,
  }),
  components: z.array(ChannelSkuMappingComponentSchema),
});

export const ChannelSkuMappingCountsSchema = z.object({
  all: z.number().int().nonnegative(),
  unmatched: z.number().int().nonnegative(),
  needsReview: z.number().int().nonnegative(),
  matched: z.number().int().nonnegative(),
});

const ChannelSkuMappingListResponseSchema = z.object({
  items: z.array(ChannelSkuMappingListItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  counts: ChannelSkuMappingCountsSchema,
});

export const ChannelSkuMatchCandidateReasonSchema = z.enum([
  'exact_sellpia_code',
  'unique_barcode',
  'ambiguous_identifier',
  'name_suggestion',
  'manual_search',
]);

const ChannelSkuMatchCandidateSchema = z.object({
  inventorySkuId: z.string().uuid(),
  sellpiaProductCode: z.string().min(1),
  name: z.string().min(1),
  optionName: z.string().nullable(),
  barcode: z.string().nullable(),
  reportedStock: z.number().int().nonnegative(),
  reason: ChannelSkuMatchCandidateReasonSchema,
  rank: z.number().int().nonnegative(),
});

export const MAX_CHANNEL_SKU_COMPONENTS = 50;

const ReplaceChannelSkuComponentsInputSchema = z.object({
  components: z.array(z.object({
    inventorySkuId: z.string().uuid(),
    quantity: z.number().int().positive(),
  }).strict()).max(MAX_CHANNEL_SKU_COMPONENTS),
}).strict().superRefine((value, ctx) => {
  const seen = new Set<string>();
  value.components.forEach((component, index) => {
    if (seen.has(component.inventorySkuId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['components', index, 'inventorySkuId'],
        message: 'duplicate inventorySkuId',
      });
    }
    seen.add(component.inventorySkuId);
  });
});
```

Define and export these remaining shapes explicitly:

```ts
export const ChannelSkuMatchCandidateListResponseSchema = z.object({
  items: z.array(ChannelSkuMatchCandidateSchema),
});

export const RefreshChannelSkuMappingStatusInputSchema = z.object({
  channelAccountId: z.string().uuid().optional(),
}).strict();

export const RefreshChannelSkuMappingStatusResponseSchema = ChannelSkuMappingCountsSchema;
```

Define `MAX_CHANNEL_SKU_COMPONENTS` before `ReplaceChannelSkuComponentsInputSchema`. Every request schema is `.strict()` so privilege-looking unknown fields are rejected, not silently stripped.

Export all schemas/types through `packages/shared/src/channel-sku-matching.ts`, add the focused package export/typesVersion, and add the entry to `tsup.config.ts`. Do not expand the root barrel.

Add to `packages/shared/src/schemas/channel-account.ts`:

```ts
export const ChannelAccountListItemSchema = z.object({
  id: z.string().uuid(),
  channel: z.string().min(1),
  name: z.string().min(1),
  externalAccountId: z.string().nullable(),
  vendorId: z.string().nullable(),
  sellerId: z.string().nullable(),
  isPrimary: z.boolean(),
});
export type ChannelAccountListItem = z.infer<typeof ChannelAccountListItemSchema>;
```

- [ ] **Step 4: Run tests and build**

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/schemas/channel-sku-matching.spec.ts src/schemas/source-import.spec.ts
rtk npm run build --workspace=packages/shared
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add packages/shared/src/schemas/channel-sku-matching.ts packages/shared/src/schemas/channel-sku-matching.spec.ts packages/shared/src/channel-sku-matching.ts packages/shared/src/schemas/channel-account.ts packages/shared/package.json packages/shared/tsup.config.ts
rtk git commit -m "feat: add channel SKU matching contracts"
```

## Task 3: Add a Static Schema Reconstruction Gate

**Files:**

- Create: `scripts/__tests__/channel-sellpia-matching-schema-contract.test.mjs`

- [ ] **Step 1: Write the failing static contract test**

Read `prisma/models/core.prisma`, `inventory.prisma`, and `channels.prisma` with `readFileSync`. Assert all of the following before changing Prisma:

```text
model InventorySku exists
model SourceImportRun exists
model ChannelSkuComponent exists
InventorySku has sellpiaProductCode, reportedStock, purchasePrice, salePrice, rawJson, lastImportRunId
InventorySku does not have masterId, reservedStock, safetyStock, isBundle, availableStock
ChannelListing.masterId is optional
ChannelListing has displayName, category, brand, manufacturer, rawJson, lastImportRunId
ChannelListingOption has channelAccountId, sellerSku, barcode, modelNumber, status, mappingStatus, rawJson, lastImportRunId
ChannelListingOption.mappingStatus defaults to unmatched
ChannelListing has a composite unique on id + organizationId + channelAccountId
ChannelListingOption has an additional optional composite scopedProduct relation using listingId + organizationId + channelAccountId
ChannelSkuComponent is unique by channelSkuId + inventorySkuId
both component relations include organizationId in fields/references
SourceImportRun has both null-account and non-null-account partial unique indexes
SourceImportRun has an internal UUID attemptToken used for lease fencing
legacy ProductOption, Inventory, BundleComponent, ChannelReconciliationRun, and ChannelReconciliationItem still exist
```

Also assert that `ChannelSkuComponent` contains no `productOptionId` and `InventorySku` contains no marketplace/channel fields.

- [ ] **Step 2: Run and verify failure**

```bash
rtk node --test scripts/__tests__/channel-sellpia-matching-schema-contract.test.mjs
```

Expected: FAIL on missing target models.

## Task 4: Implement the Prisma Expand Shape

**Files:**

- Modify: `prisma/models/core.prisma`
- Modify: `prisma/models/inventory.prisma`
- Modify: `prisma/models/channels.prisma`

- [ ] **Step 1: Add `InventorySku` to `inventory.prisma`**

Use this exact business field set and no stock-mutation fields:

```prisma
/// @namespace Inventory
/// @describe Sellpia 상품코드 한 행에 대응하는 물리 재고 SKU. reportedStock 은 완료된 Sellpia 전체 스냅샷만 교체한다.
model InventorySku {
  id                 String  @id @default(uuid()) @db.Uuid
  organizationId     String  @map("organization_id") @db.Uuid
  sellpiaProductCode String  @map("sellpia_product_code")
  name               String
  optionName         String? @map("option_name")
  barcode            String?
  reportedStock      Int     @default(0) @map("reported_stock")
  purchasePrice      Int?    @map("purchase_price")
  salePrice          Int?    @map("sale_price")
  rawJson            Json?   @map("raw_json")
  lastImportRunId    String? @map("last_import_run_id") @db.Uuid

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  organization Organization          @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  lastImportRun SourceImportRun?      @relation(fields: [lastImportRunId], references: [id], onDelete: SetNull)
  components    ChannelSkuComponent[]

  @@unique([organizationId, sellpiaProductCode])
  @@unique([id, organizationId])
  @@index([organizationId, barcode])
  @@index([lastImportRunId])
  @@map("inventory_skus")
}
```

- [ ] **Step 2: Add `SourceImportRun` to `core.prisma`**

Use a new model with fields from the approved design. Add partial unique indexes exactly for account and non-account imports. Add relations to `Organization`, `ChannelAccount`, `InventorySku`, `ChannelListing`, and `ChannelListingOption`. Use explicit relation names for the two last-import relations.

```prisma
/// @namespace Core
/// @describe 원본 파일의 idempotency와 provenance만 저장하는 import 실행 행.
model SourceImportRun {
  id               String    @id @default(uuid()) @db.Uuid
  organizationId   String    @map("organization_id") @db.Uuid
  sourceType       String    @map("source_type")
  channelAccountId String?   @map("channel_account_id") @db.Uuid
  fileName         String    @map("file_name")
  fileHash         String    @map("file_hash")
  status           String    @default("running")
  rowCount         Int       @default(0) @map("row_count")
  importedAt       DateTime? @map("imported_at") @db.Timestamptz
  createdBy        String?   @map("created_by")
  attemptToken     String    @default(uuid()) @map("attempt_token") @db.Uuid

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  organization   Organization           @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  channelAccount ChannelAccount?        @relation(fields: [channelAccountId], references: [id], onDelete: SetNull)
  inventorySkus  InventorySku[]
  channelProducts ChannelListing[]      @relation("ChannelProductLastImport")
  channelSkus     ChannelListingOption[] @relation("ChannelSkuLastImport")

  @@unique([organizationId, sourceType, channelAccountId, fileHash], map: "source_import_runs_org_source_account_hash_key", where: raw("channel_account_id IS NOT NULL"))
  @@unique([organizationId, sourceType, fileHash], map: "source_import_runs_org_source_hash_null_account_key", where: raw("channel_account_id IS NULL"))
  @@index([organizationId, sourceType, status, createdAt])
  @@index([channelAccountId])
  @@map("source_import_runs")
}
```

`attemptToken` is not business metadata and has no shared response field. Claim/retry code rotates it and every state-changing importer operation compares it.

- [ ] **Step 3: Promote `ChannelListing` fields logically**

Make `masterId` and the `master` relation optional. Keep `externalId` as the physical/logical storage for `externalProductId`, and keep `channelName` as storage for `registeredName`. Add only:

```prisma
displayName     String? @map("display_name")
category        String?
brand           String?
manufacturer    String?
rawJson         Json?   @map("raw_json")
lastImportRunId String? @map("last_import_run_id") @db.Uuid
lastImportRun   SourceImportRun? @relation("ChannelProductLastImport", fields: [lastImportRunId], references: [id], onDelete: SetNull)
```

Add an index for `lastImportRunId`. Preserve every existing legacy field and relation.

Add a compatibility-safe composite key and back-relation:

```prisma
scopedSkus ChannelListingOption[] @relation("ChannelSkuScopedProduct")

@@unique([id, organizationId, channelAccountId], map: "channel_listings_id_org_account_key")
```

Keep the existing `options`/single-ID relation so unrelated consumers retain a required parent type.

- [ ] **Step 4: Promote `ChannelListingOption` fields logically**

Keep `listingId` as `channelProductId`, `externalOptionId` as `externalSkuId`, `itemName` as `optionName`, and the existing `salePrice`. Add:

```prisma
channelAccountId String? @map("channel_account_id") @db.Uuid
sellerSku        String? @map("seller_sku")
barcode          String?
modelNumber      String? @map("model_number")
status           String?
mappingStatus    String  @default("unmatched") @map("mapping_status")
rawJson          Json?   @map("raw_json")
lastImportRunId  String? @map("last_import_run_id") @db.Uuid
```

Add `channelAccount`, named `lastImportRun`, and `components` relations. Add:

```prisma
scopedProduct ChannelListing? @relation(
  "ChannelSkuScopedProduct",
  fields: [listingId, organizationId, channelAccountId],
  references: [id, organizationId, channelAccountId],
  onDelete: Cascade
)

@@unique([id, organizationId], map: "channel_listing_options_id_org_key")
@@unique([organizationId, channelAccountId, externalOptionId], map: "channel_listing_options_org_account_external_option_key")
@@index([channelAccountId])
@@index([organizationId, channelAccountId, mappingStatus])
@@index([lastImportRunId])
```

The account field is nullable only for compatibility rows. Import repositories must always write it.
The existing required `listing` relation remains for compatibility; `scopedProduct` adds a second database foreign key. Because imported rows always have `channelAccountId`, that composite FK enforces that ChannelSku, parent ChannelProduct, organization, and account agree without making legacy relation types nullable.

- [ ] **Step 5: Add `ChannelSkuComponent` to `channels.prisma`**

```prisma
/// @namespace Channels
/// @describe 채널 판매 SKU가 소비하는 Sellpia InventorySku 구성과 수량. 확정 매칭의 유일한 source of truth.
model ChannelSkuComponent {
  id              String  @id @default(uuid()) @db.Uuid
  organizationId  String  @map("organization_id") @db.Uuid
  channelSkuId    String  @map("channel_sku_id") @db.Uuid
  inventorySkuId  String  @map("inventory_sku_id") @db.Uuid
  quantity        Int
  mappingSource   String? @map("mapping_source")
  createdBy       String? @map("created_by")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  organization Organization         @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  channelSku   ChannelListingOption @relation(fields: [channelSkuId, organizationId], references: [id, organizationId], onDelete: Cascade)
  inventorySku InventorySku         @relation(fields: [inventorySkuId, organizationId], references: [id, organizationId], onDelete: Restrict)

  @@unique([channelSkuId, inventorySkuId])
  @@index([organizationId])
  @@index([channelSkuId])
  @@index([inventorySkuId])
  @@map("channel_sku_components")
}
```

Prisma does not own a separate CHECK overlay in this repository. Positive quantity is enforced by shared Zod, service validation, and integration tests.

- [ ] **Step 6: Add back-relations**

Add only the required arrays to `Organization` and `ChannelAccount`, with relation names matching the new models. Do not add a `User` relation for `createdBy`; it remains audit text/UUID without a deletion dependency.

- [ ] **Step 7: Run the static gate and Prisma validation**

```bash
rtk node --test scripts/__tests__/channel-sellpia-matching-schema-contract.test.mjs
rtk npx prisma validate
rtk npx prisma generate
```

Expected: PASS; Prisma Client exposes `inventorySku`, `sourceImportRun`, and `channelSkuComponent` delegates.

- [ ] **Step 8: Commit**

```bash
rtk git add prisma/models/core.prisma prisma/models/inventory.prisma prisma/models/channels.prisma scripts/__tests__/channel-sellpia-matching-schema-contract.test.mjs
rtk git commit -m "feat: add channel Sellpia matching schema"
```

## Task 5: Isolate Legacy MasterProduct Consumers from Unlinked Channel Products

Making `ChannelListing.masterId` optional changes the generated relation type to nullable. Existing catalog, advertising, analytics, finance, and image workflows still mean “a listing already linked to MasterProduct”; they must explicitly exclude or skip the new unlinked catalog rows. This is a reconstruction compatibility task, not a change to those domains' business behavior.

**Files:**

- Modify: `apps/server/src/channels/adapter/out/repository/channel-listing.repository.adapter.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/marketplace-registration.repository.adapter.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-reconciliation-scan.repository.adapter.ts`
- Modify: `apps/server/src/channels/adapter/out/repository/channel-reconciliation-matcher.repository.adapter.ts`
- Modify: `apps/server/src/channels/application/service/__tests__/channel-listing-query.service.spec.ts`
- Modify: `apps/server/src/products/adapter/out/repository/product-management.repository.adapter.ts`
- Modify: `apps/server/src/products/adapter/out/repository/__tests__/product-management.filters.spec.ts`
- Modify: `apps/server/src/advertising/adapter/out/repository/ad-campaign.repository.adapter.ts`
- Modify: `apps/server/src/advertising/adapter/out/repository/ad-listing.repository.adapter.ts`
- Modify: `apps/server/src/advertising/adapter/out/repository/ad-strategy-context.repository.adapter.ts`
- Create: `apps/server/src/advertising/adapter/out/repository/__tests__/channel-listing-master-compatibility.spec.ts`
- Modify: `apps/server/src/analytics/traffic/traffic.service.ts`
- Modify: `apps/server/src/analytics/traffic/__tests__/traffic.service.spec.ts`
- Modify: `apps/server/src/analytics/statistics/statistics.service.ts`
- Modify: `apps/server/src/analytics/statistics/__tests__/statistics-flow.pg.integration.spec.ts`
- Modify: `apps/server/src/common/per-listing-profit.ts`
- Modify: `apps/server/src/common/__tests__/per-listing-profit.pg.integration.spec.ts`
- Modify: `apps/server/src/ai/adapter/out/products/master-catalog.adapter.ts`
- Modify: `apps/server/src/ai/adapter/out/products/__tests__/master-catalog.adapter.spec.ts`

- [ ] **Step 1: Add failing regression cases for an unlinked ChannelProduct**

Use a ChannelListing fixture with `masterId: null`, a valid active account, and a completed Wing-import marker. Prove:

- registered-products list/group/workspace never dereferences or returns it;
- legacy market-count totals exclude it;
- product-management master-ID/status reads exclude it;
- advertising grade/context/listing hydration skips it instead of passing null to MasterProduct queries;
- traffic profit calculation and per-listing profit skip it without throwing;
- repeat-product statistics skip order lines whose listing has no MasterProduct;
- Coupang image/master lookup ignores it because image sync still requires a MasterProduct-linked listing;
- legacy reconciliation scan ignores it until that service is retired in the backend plan;
- confirmed marketplace registration still returns the caller-validated non-null master ID.

- [ ] **Step 2: Run the focused tests and verify failure**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels/application/service/__tests__/channel-listing-query.service.spec.ts src/products/adapter/out/repository/__tests__/product-management.filters.spec.ts src/advertising/adapter/out/repository/__tests__/channel-listing-master-compatibility.spec.ts src/analytics/traffic/__tests__/traffic.service.spec.ts src/ai/adapter/out/products/__tests__/master-catalog.adapter.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/common/__tests__/per-listing-profit.pg.integration.spec.ts src/analytics/statistics/__tests__/statistics-flow.pg.integration.spec.ts
```

Expected: FAIL on nullable master assumptions after Prisma generation.

- [ ] **Step 3: Filter MasterProduct-only query surfaces**

Add `masterId: { not: null }` to every query/count/group base filter whose return contract requires a MasterProduct. Keep organization and deletion predicates. For nullable relation selects, add an explicit runtime guard even when the database predicate makes null impossible:

```ts
if (!row.master || !row.masterId) continue;
```

For array-returning ID methods, use a type guard rather than a cast:

```ts
return rows
  .map((row) => row.masterId)
  .filter((id): id is string => id !== null);
```

For `ChannelListingRepositoryAdapter`, include `masterId: {not: null}` in list, total, market-count, and workspace filters so pagination/counts remain consistent; guard the selected master before mapping.

- [ ] **Step 4: Preserve confirmed-registration output typing**

In `MarketplaceRegistrationRepositoryAdapter`, await the create/update, then return a projection with `masterId: master.id` instead of returning the widened nullable Prisma row directly. Do not change the public `RegisteredMarketplaceListingResult.masterId: string` contract.

- [ ] **Step 5: Skip unlinked rows in calculation/image paths**

Use `listing.master?.options[0]` in traffic calculations and `if (!listing?.master) continue` in per-listing profit. In statistics, guard both `masterId` and the nullable `master` relation before reading name/category. Add `masterId: {not: null}` plus a relation guard in `MasterCatalogAdapter`; never let an import-only ChannelProduct satisfy the legacy image lookup by external ID alone.

- [ ] **Step 6: Run focused tests and the full server build**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels/application/service/__tests__/channel-listing-query.service.spec.ts src/products/adapter/out/repository/__tests__/product-management.filters.spec.ts src/advertising/adapter/out/repository/__tests__/channel-listing-master-compatibility.spec.ts src/analytics/traffic/__tests__/traffic.service.spec.ts src/ai/adapter/out/products/__tests__/master-catalog.adapter.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/common/__tests__/per-listing-profit.pg.integration.spec.ts src/analytics/statistics/__tests__/statistics-flow.pg.integration.spec.ts
rtk npm run build --workspace=apps/server
```

Expected: PASS with no nullable `masterId`/`master` TypeScript error.

- [ ] **Step 7: Commit the compatibility boundary**

```bash
rtk git add apps/server/src/channels/adapter/out/repository/channel-listing.repository.adapter.ts apps/server/src/channels/adapter/out/repository/marketplace-registration.repository.adapter.ts apps/server/src/channels/adapter/out/repository/channel-reconciliation-scan.repository.adapter.ts apps/server/src/channels/adapter/out/repository/channel-reconciliation-matcher.repository.adapter.ts apps/server/src/channels/application/service/__tests__/channel-listing-query.service.spec.ts apps/server/src/products/adapter/out/repository/product-management.repository.adapter.ts apps/server/src/products/adapter/out/repository/__tests__/product-management.filters.spec.ts apps/server/src/advertising/adapter/out/repository/ad-campaign.repository.adapter.ts apps/server/src/advertising/adapter/out/repository/ad-listing.repository.adapter.ts apps/server/src/advertising/adapter/out/repository/ad-strategy-context.repository.adapter.ts apps/server/src/advertising/adapter/out/repository/__tests__/channel-listing-master-compatibility.spec.ts apps/server/src/analytics/traffic/traffic.service.ts apps/server/src/analytics/traffic/__tests__/traffic.service.spec.ts apps/server/src/analytics/statistics/statistics.service.ts apps/server/src/analytics/statistics/__tests__/statistics-flow.pg.integration.spec.ts apps/server/src/common/per-listing-profit.ts apps/server/src/common/__tests__/per-listing-profit.pg.integration.spec.ts apps/server/src/ai/adapter/out/products/master-catalog.adapter.ts apps/server/src/ai/adapter/out/products/__tests__/master-catalog.adapter.spec.ts
rtk git commit -m "refactor: isolate unlinked channel catalog rows"
```

Never stage entire domain directories.

## Task 6: Make the `0.1.8` Schema Transition Repeatable and Deployable

This is a release-boundary task. The identity check must run on every deployment immediately before `db push`; it cannot be a one-shot ledger migration. The actual account backfill remains a one-shot post-schema data migration.

**Files:**

- Modify: `VERSION`
- Create: `scripts/check-channel-sku-identity.ts`
- Create: `scripts/check-channel-sku-db-push-warning.mjs`
- Create: `scripts/__tests__/check-channel-sku-identity.spec.ts`
- Create: `scripts/__tests__/check-channel-sku-db-push-warning.test.mjs`
- Create: `scripts/data-migrations/v0.1.8/001_backfill_channel_sku_accounts.ts`
- Modify: `scripts/data-migrations/index.ts`
- Modify: `scripts/__tests__/run-data-migrations.spec.ts`
- Modify: `scripts/run-data-migrations.ts`
- Modify: `package.json`
- Modify: `scripts/check-script-inventory.mjs`
- Modify: `scripts/README.md`
- Modify: `scripts/data-migrations/README.md`
- Modify: `.github/workflows/staging-deploy.yml`
- Modify: `.github/workflows/production-deploy.yml`
- Modify: `docs/runbooks/staging-deploy.md`
- Modify: `docs/runbooks/production-deploy.md`
- Modify: `docs/runbooks/deployment-architecture.md`

- [ ] **Step 1: Write failing tests for the repeatable preflight, warning guard, migration, and production authorization**

Tests must prove:

- the preflight reports at most 20 examples for active parent `(organizationId, channelAccountId, externalId)` duplicates, ChannelSku/parent organization mismatch, parent/ChannelAccount organization mismatch, an already-populated SKU account differing from its parent, and projected duplicate `(organizationId, parent.channelAccountId, externalOptionId)` keys;
- the preflight works both before and after the nullable `channel_account_id` column exists, is read-only, and never guesses a cleanup;
- the warning parser accepts only a non-empty subset of four preflight-covered unique-addition signatures: the already-known active parent key `channel_listings_org_account_external_id_key` plus the three new mapped keys `channel_listings_id_org_account_key`, `channel_listing_options_id_org_key`, and `channel_listing_options_org_account_external_option_key`;
- any drop warning, extra warning, missing preflight marker, or unrecognized constraint blocks `--accept-data-loss`;
- `v0.1.8:001_backfill_channel_sku_accounts` is post-schema and updates only null SKU accounts from a same-organization parent;
- the migration SQL never references `option_id`, `bundle_components`, reconciliation rows, or workbook paths;
- local/staging data migrations still reject production-looking URLs;
- `--target production` is accepted only inside GitHub Actions when both the ordinary `APPLY_DATA_MIGRATIONS` confirmation and `DATA_MIGRATION_PRODUCTION_CONFIRM=DEPLOY_PRODUCTION` are present;
- both deploy workflows order `pre-schema migrations -> repeatable identity preflight -> guarded db push -> prisma generate -> post-schema migrations`.

- [ ] **Step 2: Run and verify failure**

```bash
rtk npm exec vitest -- run --config scripts/vitest.config.ts scripts/__tests__/check-channel-sku-identity.spec.ts scripts/__tests__/run-data-migrations.spec.ts
rtk node --test scripts/__tests__/check-channel-sku-db-push-warning.test.mjs
```

Expected: FAIL because the scripts, migration, release version, and guarded workflow path do not exist.

- [ ] **Step 3: Bump the release and implement the read-only identity preflight**

Set root `VERSION` to `0.1.8`.

`scripts/check-channel-sku-identity.ts` uses Prisma tagged reads and `information_schema.columns` only to decide whether the new nullable SKU account column is present. It emits a bounded JSON report and exits nonzero on any violation. The projected-duplicate query uses the parent account, so it is valid before the new child column exists:

```sql
SELECT sku.organization_id,
       product.channel_account_id,
       sku.external_option_id,
       COUNT(*)::int AS duplicate_count
FROM channel_listing_options sku
JOIN channel_listings product
  ON product.id = sku.listing_id
 AND product.organization_id = sku.organization_id
WHERE product.channel_account_id IS NOT NULL
GROUP BY sku.organization_id, product.channel_account_id, sku.external_option_id
HAVING COUNT(*) > 1
LIMIT 20
```

Add package entrypoint `check:channel-sku-identity`, script inventory metadata, README ownership, and failure/blocker guidance. The script never writes a schema, row, workbook, or migration ledger record.

- [ ] **Step 4: Implement the post-schema account backfill**

Create `v0.1.8:001_backfill_channel_sku_accounts` with the default post-schema phase. In one tagged SQL update, copy `product.channel_account_id` only where:

```text
sku.listing_id = product.id
sku.organization_id = product.organization_id
sku.channel_account_id IS NULL
product.channel_account_id IS NOT NULL
```

The repeatable preflight already blocks projected duplicate keys. After the update, query and fail on any non-null child account that differs from its parent. Register the migration and update the exact registry expectation.

- [ ] **Step 5: Repair the production data-migration authorization boundary**

Extend `assertMutatingTarget` without weakening local/staging safety:

- `local | staging` keep the current confirmation and production-looking URL rejection;
- `production` additionally requires `GITHUB_ACTIONS === 'true'` and `DATA_MIGRATION_PRODUCTION_CONFIRM === 'DEPLOY_PRODUCTION'`;
- any other target remains rejected;
- export/test the authorization helper directly.

Pass `${{ inputs.confirm }}` as `DATA_MIGRATION_PRODUCTION_CONFIRM` only in the production deploy job, which already requires the protected `production` GitHub Environment and `DEPLOY_PRODUCTION` workflow confirmation. Document the two independent confirmations.

- [ ] **Step 6: Add the exact-warning db-push guard to staging and production**

Immediately before each schema push:

1. run `npm run check:channel-sku-identity` against that environment database;
2. set a job-local preflight marker only after exit `0`;
3. capture an ordinary `npx prisma db push` log;
4. if it succeeds, continue normally;
5. if it stops only for warnings, pass the log and marker to `check-channel-sku-db-push-warning.mjs`;
6. rerun with `--accept-data-loss` only when the parser proves every warning belongs to the four preflight-covered unique additions and contains no destructive/extra warning;
7. otherwise fail the deployment.

Do not create SQL overlay indexes; Prisma remains schema truth. Preserve staging's existing explicit reviewed-cleanup input for unrelated releases, but do not let it bypass this plan's identity preflight. Update the deployment architecture and both environment runbooks in the same commit.

- [ ] **Step 7: Run script and disposable-database transition gates**

```bash
rtk npm run check:scripts-inventory
rtk npm run test:scripts
rtk npm run data:migrate -- up --phase pre-schema --target local --confirm APPLY_DATA_MIGRATIONS
rtk npm run check:channel-sku-identity
rtk npm run db:push
rtk npx prisma generate
rtk npm run data:migrate -- up --phase post-schema --target local --confirm APPLY_DATA_MIGRATIONS
rtk npm run data:migrate -- status
rtk npm run build --workspace=packages/shared
```

Run the mutating sequence against a disposable/local verification database, not a shared environment. Expected: the repeatable preflight passes immediately before schema push, the post-schema backfill succeeds once, a second run skips it from the ledger, and no unguarded accept-data-loss path exists.

- [ ] **Step 8: Commit the release transition**

```bash
rtk git add VERSION package.json scripts/check-channel-sku-identity.ts scripts/check-channel-sku-db-push-warning.mjs scripts/__tests__/check-channel-sku-identity.spec.ts scripts/__tests__/check-channel-sku-db-push-warning.test.mjs scripts/data-migrations/v0.1.8/001_backfill_channel_sku_accounts.ts scripts/data-migrations/index.ts scripts/__tests__/run-data-migrations.spec.ts scripts/run-data-migrations.ts scripts/check-script-inventory.mjs scripts/README.md scripts/data-migrations/README.md .github/workflows/staging-deploy.yml .github/workflows/production-deploy.yml docs/runbooks/staging-deploy.md docs/runbooks/production-deploy.md docs/runbooks/deployment-architecture.md
rtk git commit -m "feat: guard channel matching schema transition"
```

## Task 7: Schema Checkpoint

- [ ] **Step 1: Run the full schema checkpoint**

```bash
rtk node --test scripts/__tests__/channel-sellpia-matching-schema-contract.test.mjs
rtk npm run test:scripts
rtk npx prisma validate
rtk npm run check:channel-sku-identity
rtk npm run db:push
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
rtk npm run db:erd
rtk npm run graphify:schema
rtk npm run check:schema-artifact-sync
```

Expected: PASS on the disposable/local verification database. Review generated ERD/Graphify diffs only for the three new models, new relations, and promoted compatibility fields.

- [ ] **Step 2: Verify no old mapping was migrated**

Against the development database, verify `channel_sku_components` is empty immediately after schema push/data migration and that existing `channel_listing_options.option_id` values, if any, remain untouched.

- [ ] **Step 3: Review git scope**

```bash
rtk git status --short
rtk git diff --stat origin/develop...HEAD
```

Expected: no `docs/references/**` workbook change is staged or committed.
