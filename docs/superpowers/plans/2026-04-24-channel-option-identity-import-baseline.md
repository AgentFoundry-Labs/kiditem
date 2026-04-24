# Channel Option Identity And Import Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewire channel option identity away from Coupang-specific DB naming, preserve provider names at adapter boundaries, and replace the stale product Excel importer with a dry-run-first baseline import for the current 3-layer product schema.

**Architecture:** Canonical tables use channel-neutral names. Coupang adapters, payload DTOs, and raw snapshot fields may still say `vendorItemId`; service code maps those provider fields into `ChannelListingOption.externalOptionId`. Excel import writes only canonical rows that can be identified exactly, and emits a report for unmatched or option-ID-missing rows.

**Tech Stack:** Prisma 7 multi-file schema, PostgreSQL, NestJS 11, `@kiditem/shared` Zod contracts, `xlsx`, `tsx`, Vitest integration tests.

---

## Fresh Evidence

- `omx state list-active --json` returned `{"active_modes":[]}` on 2026-04-24.
- `git status --short --branch` returned `## main...origin/main` before this plan file was added.
- `git log --oneline -5` shows PR #42 merged at `b459f68`.
- Coupang official docs define `sellerProductId` as the registered product ID and `vendorItemId` as the approved option ID / smallest immutable item unit.
- Current schema has `ChannelListing @@unique([channel, externalId])`.
- Current schema has `ChannelListingOption.vendorItemId @map("vendor_item_id")`, `@@unique([listingId, vendorItemId])`, and `@@unique([companyId, vendorItemId])`.
- Current `Inventory` is 1:1 with `ProductOption`; it has `warehouseLocation` but no `warehouseId`.
- Current `Warehouse` exists, but per `apps/server/src/inventory/CLAUDE.md`, warehouse transfer tables are record-only for this phase and do not maintain per-warehouse stock balances.
- Current `scripts/import-product-list.ts` is stale: it still refers to old product-layer fields such as `sku`, `costPrice`, `sellPrice`, `barcode`, and old matching assumptions on `MasterProduct`.

## RALPLAN-DR Summary

### Principles

- Keep provider vocabulary at provider boundaries; keep DB vocabulary channel-neutral.
- Prefer deletion/rewire over compatibility growth when a schema decision is settled.
- Do not create canonical mappings from fuzzy or incomplete identifiers.
- Do not mutate stock outside `InventoryService.receive`, `issue`, or `adjust`.
- Do not introduce warehouse-level stock balances in this plan.

### Decision Drivers

- The DB schema should survive non-Coupang channels without carrying Coupang names.
- Order and ad matching must remain exact-match-first and tenant-scoped.
- Real Excel data should validate schema assumptions without committing private supplier files.

### Viable Options

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Keep `vendorItemId` in DB and document Coupang-only semantics | Smallest code change | Keeps channel-specific leakage in canonical schema; makes future channels awkward | Reject |
| Rename DB/Prisma field to `externalOptionId`; query through `ChannelListing` for channel/listing scope | Channel-neutral; minimal schema surface; no duplicated `channel` column | Replaces some `findUnique` calls with `findFirst` relation filters | Choose |
| Rename and add `ChannelListingOption.channel` denormalized column | Enables direct unique `[companyId, channel, externalOptionId]` | Duplicates `ChannelListing.channel`; needs drift controls and more write-path changes | Defer until a second channel creates a real need |

## Scope

In scope:

- `ChannelListingOption.vendorItemId` canonical rename to `externalOptionId`.
- DB column rename from `vendor_item_id` to `external_option_id`.
- `ChannelListing.externalId` uniqueness made company-scoped.
- Direct server consumers rewired to the new Prisma field.
- Existing stale product Excel importer replaced by a dry-run-first import script for `kiditem_list` plus `wing-inventory-matched`.
- Import report for rows that cannot create canonical channel option mapping because true option-level external ID is missing.

Out of scope:

- New warehouse stock balance model.
- Stored `MasterProduct.totalStock` or automatic stock aggregation fields.
- Changing Coupang adapter payload property names.
- Renaming raw provider fields on `AdSnapshot` or other tables whose purpose is to preserve scraped provider data.
- Importing private Excel files into git.

## File Structure

### Docs

- Create `.claude/docs/decisions/0020-channel-option-external-id.md`  
  Records the canonical naming decision, alternatives, consequences, and import constraints.
- Modify `docs/superpowers/specs/2026-04-24-product-contract-rewire-design.md`  
  Adds the channel option identity decision as a successor note, without changing the already scoped product catalog plan.

### Prisma

- Modify `prisma/models/core.prisma`  
  Rename `ChannelListingOption.vendorItemId` to `externalOptionId`; rename DB column; change listing uniqueness.
- Modify `prisma/3layer-setup.sql`  
  Add/drop idempotent partial unique index for active `channel_listings(company_id, channel, external_id)`.
- Create `prisma/backfill-channel-option-external-id.sql`  
  Preserves existing data by renaming the physical column before `db:push`.

### Server

- Modify `apps/server/src/channels/services/channel-sync.service.ts`  
  Map Coupang `vendorItemId` to `externalOptionId`; use `sellerProductId` plus listing relation when present.
- Modify `apps/server/src/advertising/services/ad-sync.service.ts`  
  Keep inbound `vendorItemId` names, but build an `externalOptionIdMap` from `ChannelListingOption.externalOptionId`.
- Modify server tests and seed helpers that create `channelListingOption` rows.
- Modify scoped docs that explicitly describe DB matching via `ChannelListingOption.vendorItemId`.

### Scripts

- Delete `scripts/import-product-list.ts`.
- Create `scripts/import-product-baseline.ts`  
  Reads both Excel files, defaults to dry-run, writes only with `--write`, and prints a deterministic report.
- Modify `package.json`  
  Add `import:product-baseline`.

## Task 0: Baseline And Guardrails

**Files:**
- Read: `AGENTS.md`
- Read: `prisma/AGENTS.md`
- Read: `apps/server/AGENTS.md`
- Read: `apps/server/src/channels/CLAUDE.md`
- Read: `apps/server/src/advertising/CLAUDE.md`
- Read: `apps/server/src/inventory/CLAUDE.md`
- Read: `apps/server/src/products/CLAUDE.md`
- Read: `packages/shared/AGENTS.md`

- [ ] **Step 1: Verify clean branch state**

Run:

```bash
git status --short --branch
```

Expected: only this plan file and the `.omx/context` snapshot are modified before implementation starts.

- [ ] **Step 2: Capture current identity references**

Run:

```bash
rg -n "vendorItemId|vendor_item_id|companyId_vendorItemId|ChannelListingOption" prisma/models apps/server/src packages/shared/src scripts docs/superpowers -S
```

Expected: non-zero output. Save counts in the implementation notes before editing.

- [ ] **Step 3: Capture stale importer evidence**

Run:

```bash
rg -n "MasterInventory|tx\\.product|masterProduct\\.create|sku,|costPrice|sellPrice|barcode" scripts/import-product-list.ts
```

Expected: output proves the old importer assumes the removed flat product model.

## Task 1: ADR For Channel Option Identity

**Files:**
- Create: `.claude/docs/decisions/0020-channel-option-external-id.md`
- Modify: `.claude/docs/decisions/README.md`
- Modify: `docs/superpowers/specs/2026-04-24-product-contract-rewire-design.md`

- [ ] **Step 1: Create the ADR**

Create `.claude/docs/decisions/0020-channel-option-external-id.md` with this content:

```markdown
# ADR-0020: Channel Option External ID Naming

- Date: 2026-04-24
- Status: Accepted
- Supersedes: none
- Related: ADR-0013, ADR-0015

## Context

`ChannelListingOption.vendorItemId` used a Coupang provider term in the canonical DB model. Coupang's Open API uses `sellerProductId` for the registered product and `vendorItemId` for the approved option/item. That term is correct at the Coupang adapter boundary, but not as a channel-neutral DB field.

## Decision

Rename the canonical `ChannelListingOption` field to `externalOptionId` and the physical DB column to `external_option_id`.

Provider-specific payloads may keep their native field names. Coupang order/product/ad sync maps `vendorItemId` into `externalOptionId` before touching canonical tables.

`ChannelListing.externalId` is listing-level and remains separate from `ChannelListingOption.externalOptionId`, which is option-level.

## Drivers

- Prevent Coupang vocabulary from becoming the internal multi-channel contract.
- Keep order/ad matching exact and tenant-scoped.
- Avoid a duplicated `channel` column on `ChannelListingOption` while `ChannelListing` already owns channel identity.

## Alternatives Considered

1. Keep `vendorItemId` in DB.
   - Rejected because it keeps a provider term in a canonical model.
2. Add `ChannelListingOption.channel`.
   - Rejected for this phase because it duplicates `ChannelListing.channel` and introduces drift risk.
3. Rename to `externalOptionId` and query through `ChannelListing`.
   - Accepted because it gives neutral naming with minimal schema expansion.

## Consequences

- Prisma code uses `externalOptionId`.
- Coupang adapter/input code still uses `vendorItemId`.
- Exact matching can use `(companyId, listing.externalId, externalOptionId)` when `sellerProductId` is present, and `(companyId, listing.channel, externalOptionId)` fallback when it is not.
- Excel rows without a true option-level external ID do not create `ChannelListingOption` rows.

## Verification

- `rg -n "channelListingOption.*vendorItemId|companyId_vendorItemId|vendor_item_id" apps prisma packages scripts`
- `npm run db:push`
- `npx prisma generate`
- `npm run db:3layer-setup`
- `cd packages/shared && npm run build`
- `npm run dev:server`
```

- [ ] **Step 2: Register the ADR**

Add one line to `.claude/docs/decisions/README.md` in the existing ADR index:

```markdown
| 0020 | Channel Option External ID Naming | Accepted | 2026-04-24 | Provider-specific option IDs are normalized to `ChannelListingOption.externalOptionId`; Coupang `vendorItemId` remains at the adapter boundary. |
```

- [ ] **Step 3: Add spec successor note**

Append this short section to `docs/superpowers/specs/2026-04-24-product-contract-rewire-design.md`:

```markdown
## Successor: Channel Option Identity

ADR-0020 moves provider-specific channel option naming out of the canonical DB model. Product catalog read paths should treat `ChannelListing.externalId` as listing-level and `ChannelListingOption.externalOptionId` as option-level. Coupang payloads may still use `vendorItemId` before boundary normalization.
```

## Task 2: Prisma Schema And Backfill

**Files:**
- Modify: `prisma/models/core.prisma`
- Modify: `prisma/3layer-setup.sql`
- Create: `prisma/backfill-channel-option-external-id.sql`

- [ ] **Step 1: Write the backfill SQL**

Create `prisma/backfill-channel-option-external-id.sql`:

```sql
-- Rename Coupang-specific channel option column to channel-neutral naming.
-- Safe to run once before prisma db push. Re-running after the rename is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'channel_listing_options'
      AND column_name = 'vendor_item_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'channel_listing_options'
      AND column_name = 'external_option_id'
  ) THEN
    ALTER TABLE channel_listing_options
      RENAME COLUMN vendor_item_id TO external_option_id;
  END IF;
END $$;

ALTER TABLE channel_listing_options
  DROP CONSTRAINT IF EXISTS channel_listing_options_company_id_vendor_item_id_key;
ALTER TABLE channel_listing_options
  DROP CONSTRAINT IF EXISTS channel_listing_options_listing_id_vendor_item_id_key;
ALTER TABLE channel_listings
  DROP CONSTRAINT IF EXISTS channel_listings_channel_external_id_key;
ALTER TABLE channel_listings
  DROP CONSTRAINT IF EXISTS channel_listings_company_id_channel_external_id_key;

DROP INDEX IF EXISTS channel_listing_options_company_id_vendor_item_id_key;
DROP INDEX IF EXISTS channel_listing_options_listing_id_vendor_item_id_key;
DROP INDEX IF EXISTS channel_listing_options_vendor_item_id_idx;
DROP INDEX IF EXISTS channel_listings_channel_external_id_key;
DROP INDEX IF EXISTS channel_listings_company_id_channel_external_id_key;
```

- [ ] **Step 2: Rename Prisma field**

In `prisma/models/core.prisma`, change the `ChannelListingOption` model to this field and indexes:

```prisma
/// @namespace Core
/// @describe 채널 listing 내 옵션 externalOptionId 와 내부 ProductOption 매핑.
model ChannelListingOption {
  id               String   @id @default(uuid()) @db.Uuid
  listingId        String   @map("listing_id") @db.Uuid
  optionId         String?  @map("option_id") @db.Uuid
  companyId        String   @map("company_id") @db.Uuid

  externalOptionId String   @map("external_option_id") @db.VarChar(60)
  itemName         String?  @map("item_name")
  salePrice        Int?     @map("sale_price")

  isActive     Boolean  @default(true) @map("is_active")
  isUnmatched  Boolean  @default(false) @map("is_unmatched")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  listing ChannelListing @relation(fields: [listingId], references: [id], onDelete: Cascade)
  option  ProductOption? @relation(fields: [optionId], references: [id], onDelete: SetNull)
  company Company        @relation(fields: [companyId], references: [id], onDelete: Cascade)
  orderLineItems    OrderLineItem[]

  @@unique([listingId, externalOptionId])
  @@index([companyId, externalOptionId])
  @@index([optionId])
  @@index([externalOptionId])
  @@index([companyId, isUnmatched])
  @@map("channel_listing_options")
}
```

- [ ] **Step 3: Scope listing uniqueness by company**

In `ChannelListing`, replace:

```prisma
@@unique([channel, externalId])
```

with:

```prisma
@@unique([companyId, channel, externalId])
```

Service code must still use `findFirst({ where: { companyId, channel, externalId, isDeleted: false } })` for active rows, because `prisma/3layer-setup.sql` will enforce active-only uniqueness.

- [ ] **Step 4: Add active listing partial unique SQL**

In `prisma/3layer-setup.sql`, add an idempotent section:

```sql
ALTER TABLE channel_listings
  DROP CONSTRAINT IF EXISTS channel_listings_channel_external_id_key;
ALTER TABLE channel_listings
  DROP CONSTRAINT IF EXISTS channel_listings_company_id_channel_external_id_key;
DROP INDEX IF EXISTS channel_listings_channel_external_id_key;
DROP INDEX IF EXISTS channel_listings_company_id_channel_external_id_key;
DROP INDEX IF EXISTS channel_listings_company_channel_external_active;

CREATE UNIQUE INDEX channel_listings_company_channel_external_active
  ON channel_listings(company_id, channel, external_id)
  WHERE is_deleted = false;
```

- [ ] **Step 5: Run schema commands**

Run:

```bash
psql "$DATABASE_URL" -f prisma/backfill-channel-option-external-id.sql
```

Expected: command exits 0.

Run:

```bash
npm run db:push
```

Expected: Prisma applies schema without dropping `channel_listing_options` data.

Run:

```bash
npx prisma generate
```

Expected: generated client contains `externalOptionId`.

Run:

```bash
npm run db:3layer-setup
```

Expected: idempotent SQL completes and active partial indexes are present.

## Task 3: Channel And Advertising Rewire

**Files:**
- Modify: `apps/server/src/channels/services/channel-sync.service.ts`
- Modify: `apps/server/src/channels/services/__tests__/channel-sync.service.spec.ts`
- Modify: `apps/server/src/channels/__tests__/order-sync.pg.integration.spec.ts`
- Modify: `apps/server/src/advertising/services/ad-sync.service.ts`
- Modify: `apps/server/src/advertising/services/__tests__/ad-sync.spec.ts`
- Modify: `apps/server/src/advertising/__tests__/ad-sync-flow.pg.integration.spec.ts`
- Modify: `apps/server/src/test-helpers/finance-seeds.ts`

- [ ] **Step 1: Replace order sync lookup**

In `channel-sync.service.ts`, replace the `findUnique({ companyId_vendorItemId })` lookup with relation-scoped matching:

```typescript
const externalOptionId = String(item.vendorItemId);
const sellerProductId = item.sellerProductId ? String(item.sellerProductId) : null;
const externalLineId = externalOptionId;

const listingOption = await tx.channelListingOption.findFirst({
  where: {
    companyId,
    externalOptionId,
    isActive: true,
    listing: {
      channel: 'coupang',
      isDeleted: false,
      ...(sellerProductId ? { externalId: sellerProductId } : {}),
    },
  },
  select: {
    id: true,
    optionId: true,
    option: { select: { sku: true, optionName: true } },
  },
});
```

Keep the inbound null guard message using `vendorItemId`, because the payload field is still Coupang-native.

- [ ] **Step 2: Rename advertising internal map**

In `ad-sync.service.ts`, rename the internal map shape:

```typescript
type ListingMap = {
  externalOptionIdMap: Map<string, { listingId: string; optionId: string }>;
  externalIdMap: Map<string, { listingId: string; optionId: null }>;
};
```

The row parser still accepts these input fields:

```typescript
const providerOptionId = this.pickStringField(row, [
  'vendorItemId',
  'vendor_item_id',
  'itemId',
]);
```

The lookup stores provider values under canonical naming:

```typescript
if (providerOptionId) {
  const hit = map.externalOptionIdMap.get(providerOptionId);
  if (hit) return hit;
}
```

- [ ] **Step 3: Update test fixtures**

For Prisma seed data, replace:

```typescript
vendorItemId: 'VI-HIT-1'
```

with:

```typescript
externalOptionId: 'VI-HIT-1'
```

For Coupang payload input objects, keep:

```typescript
vendorItemId: 'VI-HIT-1'
```

Expected distinction: provider payloads use `vendorItemId`; canonical DB writes use `externalOptionId`.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
npm run test:integration -- order-sync
```

Expected: order sync integration tests pass.

Run:

```bash
npm run test:integration -- ad-sync-flow
```

Expected: advertising sync integration tests pass.

## Task 4: Replace Stale Excel Importer

**Files:**
- Delete: `scripts/import-product-list.ts`
- Create: `scripts/import-product-baseline.ts`
- Modify: `package.json`

- [ ] **Step 1: Add package script**

In root `package.json`, add:

```json
"import:product-baseline": "tsx scripts/import-product-baseline.ts"
```

- [ ] **Step 2: Create importer CLI contract**

Create `scripts/import-product-baseline.ts` with this top-level contract:

```typescript
#!/usr/bin/env tsx
import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as XLSX from 'xlsx';

type CliArgs = {
  kiditemPath: string;
  wingPath: string;
  companyId: string;
  write: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string | true>();
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--write') {
      args.set('write', true);
      continue;
    }
    if (token.startsWith('--')) {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) throw new Error(`Missing value for ${token}`);
      args.set(token.slice(2), next);
      i += 1;
    }
  }

  const kiditemPath = args.get('kiditem') as string | undefined;
  const wingPath = args.get('wing') as string | undefined;
  const companyId = args.get('company') as string | undefined;
  if (!kiditemPath) throw new Error('Missing --kiditem <xlsx-path>');
  if (!wingPath) throw new Error('Missing --wing <xlsx-path>');
  if (!companyId) throw new Error('Missing --company <uuid>');

  return {
    kiditemPath,
    wingPath,
    companyId,
    write: args.get('write') === true,
  };
}
```

- [ ] **Step 3: Parse Excel rows with exact headers**

Use `XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })`. Normalize numbers with:

```typescript
function toInt(value: unknown): number {
  const text = String(value ?? '').replace(/[,\s원]/g, '');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function clean(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}
```

Add code/sku helpers that match the products-domain rules:

```typescript
type Tx = Prisma.TransactionClient;

async function nextMasterCode(tx: Tx): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ code: string }>>`
    SELECT 'M-' || lpad(nextval('master_code_seq')::text, 8, '0') AS code
  `;
  return rows[0].code;
}

async function nextOptionSku(tx: Tx, masterId: string, masterCode: string): Promise<string> {
  const updated = await tx.masterProduct.update({
    where: { id: masterId },
    data: { optionCounter: { increment: 1 } },
    select: { optionCounter: true },
  });
  return `${masterCode}-${String(updated.optionCounter).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Import kiditem rows as canonical product/options/inventory**

For each `kiditem_list` row:

```typescript
const legacyCode = clean(row['상품코드']);
const name = clean(row['상품명']) ?? clean(row['상품명(셀피아)']) ?? legacyCode;
const optionName = clean(row['옵션명']) ?? clean(row['모델명']) ?? null;
const barcode = clean(row['자사상품코드']);
const currentStock = toInt(row['재고']);
const safetyStock = toInt(row['안전재고']);
const warehouseLocation = clean(row['상품위치']);
```

Upsert rules:

- `MasterProduct`: `findFirst({ companyId, legacyCode, isDeleted:false })`, then create if missing.
- `ProductOption`: `findFirst({ companyId, legacyCode, isDeleted:false })`, then create if missing.
- `Inventory`: `upsert` by `optionId`, setting `currentStock`, `safetyStock`, and `warehouseLocation`.

Creation data must include the required generated identifiers:

```typescript
const code = await nextMasterCode(tx);
const master = await tx.masterProduct.create({
  data: {
    companyId: args.companyId,
    code,
    legacyCode,
    name: name ?? legacyCode ?? 'Unnamed product',
    supplierId,
    category: clean(row['상품분류']),
    brand: clean(row['브랜드']),
    rawData: row,
  },
});

const sku = await nextOptionSku(tx, master.id, master.code);
const option = await tx.productOption.create({
  data: {
    companyId: args.companyId,
    masterId: master.id,
    sku,
    legacyCode,
    barcode,
    optionName,
    costPrice: toInt(row['매입가']),
    sellPrice: toInt(row['판매가']),
  },
});
```

The write path must not create `StockTransaction`; this baseline import represents initial state, not an operational stock movement.

- [ ] **Step 5: Import Wing rows as listings only when identifiers are exact**

For each `wing-inventory-matched` row:

```typescript
const listingExternalId = clean(row['등록상품ID']);
const matched = clean(row['매칭상태']) === 'O';
const legacyCode = clean(row['상품코드']);
const channelName = clean(row['등록상품명']);
const channelPrice = toInt(row['판매가']);
```

Rules:

- If `listingExternalId` is missing, count the row as skipped.
- If `matched` is false, create no canonical mapping and record the row in the report.
- Upsert `ChannelListing` by active `companyId + channel:'coupang' + externalId`.
- Do not create `ChannelListingOption` from `등록상품ID`.
- Create `ChannelListingOption` only when the row has a confirmed option-level external id column. Current observed files do not have one, so the dry-run report should show `channelListingOptionsCreated: 0`.

- [ ] **Step 6: Print deterministic report**

At the end, print JSON:

```typescript
console.log(JSON.stringify({
  mode: args.write ? 'write' : 'dry-run',
  kiditem: {
    rows: kiditemRows.length,
    duplicateLegacyCodes,
    mastersCreated,
    optionsCreated,
    inventoryUpserted,
  },
  wing: {
    rows: wingRows.length,
    matchedRows,
    unmatchedRows,
    listingsUpserted,
    channelListingOptionsCreated,
    skippedMissingListingExternalId,
    skippedMissingExternalOptionId,
  },
}, null, 2));
```

- [ ] **Step 7: Delete old importer**

Delete `scripts/import-product-list.ts` after `scripts/import-product-baseline.ts` exists. This avoids keeping two import paths with conflicting schema assumptions.

- [ ] **Step 8: Run dry-run on the real files**

Run:

```bash
npm run import:product-baseline -- --kiditem "/Users/yhc125/Downloads/kiditem_list (1) 2.xlsx" --wing "/Users/yhc125/Downloads/wing-inventory-matched 2.xlsx" --company cacc5509-7f13-50a7-9b99-d2c18e35b5bf
```

Expected:

- exits 0
- mode is `dry-run`
- does not write DB rows
- reports `channelListingOptionsCreated: 0` unless a true option-level external ID column is added

## Task 5: Documentation And Grep Gates

**Files:**
- Modify: `apps/server/src/channels/CLAUDE.md`
- Modify: `apps/server/src/advertising/CLAUDE.md`
- Modify: `apps/server/src/orders/CLAUDE.md`
- Modify: `prisma/AGENTS.md`

- [ ] **Step 1: Update domain docs**

Replace canonical DB references:

```text
ChannelListingOption.vendorItemId
```

with:

```text
ChannelListingOption.externalOptionId
```

Keep provider payload descriptions as:

```text
Coupang vendorItemId
```

- [ ] **Step 2: Run grep gate**

Run:

```bash
rg -n "ChannelListingOption\\.vendorItemId|companyId_vendorItemId|channelListingOption.*vendorItemId|vendor_item_id" apps prisma packages scripts docs/superpowers .claude/docs -S
```

Expected: no canonical DB references remain. Acceptable hits are only provider/raw fields such as `AdSnapshot.vendorItemId`, Coupang payload interfaces, and docs that explicitly say "Coupang vendorItemId".

## Task 6: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Shared build**

Run:

```bash
cd packages/shared
npm run build
```

Expected: build passes.

- [ ] **Step 2: Prisma verification**

Run:

```bash
npm run db:push
```

Expected: schema push passes.

Run:

```bash
npx prisma generate
```

Expected: generated client includes `externalOptionId`.

Run:

```bash
npm run db:3layer-setup
```

Expected: idempotent SQL passes.

- [ ] **Step 3: Server boot**

Run:

```bash
npm run dev:server
```

Expected: NestJS starts successfully and remains running until manually stopped after the boot log confirms route registration.

- [ ] **Step 4: Import dry-run evidence**

Run the dry-run command from Task 4 Step 8 again.

Expected: report is stable across repeated dry-runs.

## Acceptance Criteria

- No canonical Prisma field named `ChannelListingOption.vendorItemId` remains.
- DB column is `channel_listing_options.external_option_id`.
- Coupang payload types and adapter functions still accept `vendorItemId`.
- Order sync still stores `OrderLineItem.externalLineId` from Coupang `vendorItemId`.
- Ad sync still accepts extension fields `vendorItemId` / `vendor_item_id`, but canonical lookup uses `externalOptionId`.
- `ChannelListing.externalId` uniqueness is company-scoped and active-row uniqueness is enforced by `prisma/3layer-setup.sql`.
- The stale `scripts/import-product-list.ts` is gone.
- The new import script defaults to dry-run and refuses to run without explicit `--company`, `--kiditem`, and `--wing` arguments.
- Real Excel dry-run succeeds and reports skipped channel option mappings when option-level external IDs are absent.
- No warehouse-level stock balance model is introduced.

## Execution Staffing

Recommended `$ralph` path: sequential execution in the order above, because schema rename and Prisma client generation affect every later task.

Recommended `$team` path:

- Lane 1, schema/docs: Task 1 and Task 2.
- Lane 2, server rewire: Task 3 after Lane 1 generates Prisma client.
- Lane 3, importer: Task 4 after Lane 1 schema field names are settled.
- Lane 4, verification/docs cleanup: Task 5 and Task 6 after all code lands.

Do not run Lane 2 or Lane 3 against stale Prisma client output.
