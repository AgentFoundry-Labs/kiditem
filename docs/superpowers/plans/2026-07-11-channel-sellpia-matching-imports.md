# Sellpia Inventory and Coupang Wing Catalog Imports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the approved Sellpia export as the complete `InventorySku` snapshot and the approved Coupang Wing export as independent `ChannelProduct`/`ChannelSku` metadata without creating or changing any confirmed mapping.

**Architecture:** Add a new Inventory-owned Sellpia import port and a Channels-owned Wing catalog import port. Both parse and validate a complete workbook before writes, claim an idempotent `SourceImportRun`, atomically upsert normalized rows, and complete the run in the same transaction. Preserve Sellpia receipt-batch behavior behind a receipt-only port/service/repository while deleting the old stock-comparison/approval executable path.

**Tech Stack:** NestJS, Prisma v7, PostgreSQL advisory transaction locks, `xlsx` (npm alias to `@e965/xlsx`) with CP949 support, SHA-256, Zod shared response contracts, Vitest, Testcontainers.

## Global Constraints

- Complete the schema-contract plan first.
- Do not modify `Inventory.currentStock`, `Inventory.reservedStock`, `ProductOption`, `BundleComponent`, `StockTransaction`, or Rocket ledger rows.
- Do not infer components from either workbook.
- Do not include the two real workbooks in tests or git.
- Parse identifiers as strings and preserve leading zeroes and hyphens.
- Both repository adapters receive and apply `organizationId` on every query/write.
- File validation happens before `SourceImportRun` is claimed.
- A completed duplicate hash is a no-op. A running duplicate updated within 30 minutes returns HTTP 409. A stale running or failed run rotates `attemptToken` with compare-and-set and reuses the same run ID.
- `SourceImportRun.status='completed'` is written in the same transaction as normalized rows.
- Mark only the run `failed` after a normalized transaction rolls back.
- Do not add a shared generic import framework; each owner repository implements the small claim/write/fail contract explicitly.
- The package is installed through npm alias `xlsx: npm:@e965/xlsx`; source code imports `xlsx` and `xlsx/dist/cpexcel`, never `@e965/xlsx` directly.

---

## Source Field Contracts

### Sellpia `exported-list (3).xls`

| Header | Normalized field |
|---|---|
| `상품코드` | `InventorySku.sellpiaProductCode` |
| `상품명` | `InventorySku.name`; fall back to product code only when blank |
| `옵션명` | `InventorySku.optionName` |
| `재고` | `InventorySku.reportedStock` |
| `매입가` | `InventorySku.purchasePrice` |
| `판매가` | `InventorySku.salePrice` |
| `모델명`, `바코드`, `자사상품코드` | first value in that order whose digits-only normalization is 8–14 digits becomes `InventorySku.barcode` |
| every source column | complete original row in `rawJson` |

Blank price becomes `null`; a present price must be a non-negative integer. A blank/duplicate product code or invalid stock rejects the whole file. A blank product name does not reject the file because the code fallback is deterministic.

### Coupang `Coupang_detailinfo_260711.xlsx`, `Template` sheet

The header is on row 4 and contains 231 columns.

| Header | Logical field / compatibility storage |
|---|---|
| `등록상품ID` | `ChannelProduct.externalProductId` / `ChannelListing.externalId` |
| `등록상품명` | `ChannelProduct.registeredName` / `ChannelListing.channelName` |
| `쿠팡 노출상품명` | `ChannelProduct.displayName` |
| `카테고리` | `ChannelProduct.category` |
| `제조사` | `ChannelProduct.manufacturer` |
| `브랜드` | `ChannelProduct.brand` |
| `승인상태` | `ChannelProduct.status` |
| `옵션 ID` | `ChannelSku.externalSkuId` / `ChannelListingOption.externalOptionId` |
| `등록 옵션명` | `ChannelSku.optionName` / `ChannelListingOption.itemName` |
| `판매상태` | `ChannelSku.status` |
| `모델번호` | `ChannelSku.modelNumber` |
| `바코드` | `ChannelSku.barcode` |
| `노출상품ID`, 검색어, 구매/검색 옵션, remaining provider fields | row `rawJson` only |

This file has no seller SKU or sale-price column. On create, `sellerSku` and `salePrice` are null. On update, do not clear values another source may already have populated.

## File Structure

### Inventory

Create:

- `apps/server/src/inventory/application/service/sellpia-inventory-workbook.parser.ts`
- `apps/server/src/inventory/application/service/sellpia-inventory-workbook.parser.spec.ts`
- `apps/server/src/inventory/application/port/in/stock/sellpia-inventory-import.port.ts`
- `apps/server/src/inventory/application/port/out/repository/inventory-sku-import.repository.port.ts`
- `apps/server/src/inventory/application/service/sellpia-inventory-import.service.ts`
- `apps/server/src/inventory/application/service/sellpia-inventory-import.service.spec.ts`
- `apps/server/src/inventory/adapter/out/repository/inventory-sku-import.repository.adapter.ts`
- `apps/server/src/inventory/adapter/in/http/sellpia-inventory-import.controller.ts`
- `apps/server/src/inventory/adapter/in/http/sellpia-inventory-import.controller.spec.ts`
- `apps/server/src/inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts`
- `apps/server/src/inventory/application/port/in/stock/sellpia-receipt-batch.port.ts`
- `apps/server/src/inventory/application/port/out/repository/sellpia-receipt-batch.repository.port.ts`
- `apps/server/src/inventory/application/service/sellpia-receipt-batch.service.ts`
- `apps/server/src/inventory/application/service/sellpia-receipt-batch.service.spec.ts`
- `apps/server/src/inventory/adapter/out/repository/sellpia-receipt-batch.repository.adapter.ts`
- `apps/server/src/inventory/adapter/in/http/dto/sellpia-receipt-batch.dto.ts`

Modify:

- `apps/server/src/inventory/inventory.module.ts`
- `apps/server/src/inventory/__tests__/inventory.module.wiring.spec.ts`
- `apps/server/src/inventory/application/port/in/stock/index.ts`
- `apps/server/src/inventory/application/port/out/repository/index.ts`
- `apps/server/src/inventory/adapter/in/http/sellpia-receipt-batch.controller.ts`
- `apps/server/src/inventory/AGENTS.md`

Delete after the replacement controller is wired:

- `apps/server/src/inventory/adapter/in/http/sellpia-sync.controller.ts`
- `apps/server/src/inventory/adapter/in/http/sellpia-sync.controller.spec.ts`
- `apps/server/src/inventory/adapter/in/http/dto/sellpia-sync.dto.ts`
- `apps/server/src/inventory/application/port/in/stock/sellpia-sync.port.ts`
- `apps/server/src/inventory/application/port/out/repository/sellpia-sync.repository.port.ts`
- `apps/server/src/inventory/application/service/sellpia-sync.service.ts`
- `apps/server/src/inventory/application/service/sellpia-sync.service.spec.ts`
- `apps/server/src/inventory/application/service/sellpia-workbook.parser.ts`
- `apps/server/src/inventory/application/service/sellpia-workbook.parser.spec.ts`
- `apps/server/src/inventory/adapter/out/repository/sellpia-sync.repository.adapter.ts`
- `apps/server/src/inventory/adapter/out/repository/sellpia-sync.repository.adapter.spec.ts`
- `apps/server/src/inventory/__tests__/sellpia-sync.repository.pg.integration.spec.ts`
- `apps/server/src/inventory/domain/policy/sellpia-adjustment-recommendation.ts`
- `apps/server/src/inventory/domain/policy/__tests__/sellpia-adjustment-recommendation.spec.ts`

Move the two receipt DTOs into the new receipt-only DTO file before deleting the old DTO, and update `apps/server/src/inventory/adapter/in/http/dto/index.ts`.

### Channels

Create:

- `apps/server/src/channels/application/service/coupang-wing-workbook.parser.ts`
- `apps/server/src/channels/application/service/coupang-wing-workbook.parser.spec.ts`
- `apps/server/src/channels/application/port/in/channel-catalog-import.port.ts`
- `apps/server/src/channels/application/port/out/repository/channel-catalog-import.repository.port.ts`
- `apps/server/src/channels/application/service/channel-catalog-import.service.ts`
- `apps/server/src/channels/application/service/__tests__/channel-catalog-import.service.spec.ts`
- `apps/server/src/channels/adapter/out/repository/channel-catalog-import.repository.adapter.ts`
- `apps/server/src/channels/adapter/in/http/channel-catalog-import.controller.ts`
- `apps/server/src/channels/adapter/in/http/__tests__/channel-catalog-import.controller.spec.ts`
- `apps/server/src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts`

Modify:

- `apps/server/src/channels/channels.module.ts`
- `apps/server/src/channels/__tests__/channels.module.wiring.spec.ts`
- `apps/server/src/channels/application/port/out/repository/index.ts`

## Task 1: Build the Sellpia Workbook Parser

**Files:**

- Create: `apps/server/src/inventory/application/service/sellpia-inventory-workbook.parser.spec.ts`
- Create: `apps/server/src/inventory/application/service/sellpia-inventory-workbook.parser.ts`

- [ ] **Step 1: Write failing parser tests**

Build synthetic workbooks in memory with `XLSX.utils.aoa_to_sheet`; do not use the real workbook. Cover:

1. binary `.xls`/CP949-compatible read path using the existing hand-built `legacyCp949XlsBuffer()` fixture logic; `aoa_to_sheet` alone does not cover an XLS with missing codepage records;
2. headers with whitespace and BOM;
3. all six normalized fields plus raw JSON;
4. comma-formatted stock/prices;
5. blank price -> null;
6. blank name -> product-code fallback;
7. matching-identifier priority: `모델명`, then `바코드`, then `자사상품코드`; remove non-digits and accept only 8–14 digits;
8. duplicate product codes reject the complete workbook and include both row numbers;
9. blank product code rejects;
10. non-integer/negative stock rejects;
11. non-integer/negative present price rejects;
12. empty/no-sheet/missing required-column/over-20,000-row errors.

The successful normalized row type is fixed:

```ts
export type ParsedSellpiaInventoryRow = {
  rowNumber: number;
  sellpiaProductCode: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  reportedStock: number;
  purchasePrice: number | null;
  salePrice: number | null;
  rawJson: Record<string, unknown>;
};

export type ParsedSellpiaInventoryWorkbook = {
  rows: ParsedSellpiaInventoryRow[];
  headers: string[];
};
```

- [ ] **Step 2: Run and verify failure**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/inventory/application/service/sellpia-inventory-workbook.parser.spec.ts
```

Expected: FAIL because the parser file does not exist.

- [ ] **Step 3: Implement the parser**

Move the proven `legacyCp949XlsBuffer()` test helper before deleting the legacy parser tests. Reuse the read-attempt strategy from the legacy `sellpia-workbook.parser.ts`: normal binary read, codepage 949 read, and UTF-8/EUC-KR delimited-text fallback. Import `* as XLSX` from `xlsx` and `* as cpexcel` from `xlsx/dist/cpexcel`, then register the codepage table. Detect a header row in the first 20 rows containing `상품코드` and `재고`, then parse data from the next row.

Use these normalized header aliases only:

```ts
const HEADER_ALIASES = new Map([
  ['상품코드', '상품코드'],
  ['상품명', '상품명'],
  ['옵션명', '옵션명'],
  ['재고', '재고'],
  ['매입가', '매입가'],
  ['판매가', '판매가'],
  ['자사상품코드', '자사상품코드'],
  ['바코드', '바코드'],
  ['모델명', '모델명'],
]);
```

Read identifier cells from their formatted worksheet text (`cell.w` when present, otherwise the string value), trim product codes, and never run `Number()` on them. For the single barcode/matching-identifier field, remove non-digits as specified but retain the result as a string so leading zeroes survive. Accumulate every validation error before throwing one `BadRequestException` so the operator receives all invalid row numbers at once.

- [ ] **Step 4: Run the parser test**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/inventory/application/service/sellpia-inventory-workbook.parser.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/server/src/inventory/application/service/sellpia-inventory-workbook.parser.ts apps/server/src/inventory/application/service/sellpia-inventory-workbook.parser.spec.ts
rtk git commit -m "feat: parse Sellpia inventory snapshots"
```

## Task 2: Implement the Sellpia Import Application Contract

**Files:**

- Create: `apps/server/src/inventory/application/port/in/stock/sellpia-inventory-import.port.ts`
- Create: `apps/server/src/inventory/application/port/out/repository/inventory-sku-import.repository.port.ts`
- Create: `apps/server/src/inventory/application/service/sellpia-inventory-import.service.spec.ts`
- Create: `apps/server/src/inventory/application/service/sellpia-inventory-import.service.ts`

- [ ] **Step 1: Define ports and write failing service tests**

Use these port shapes:

```ts
export const SELLPIA_INVENTORY_IMPORT_PORT = Symbol('SELLPIA_INVENTORY_IMPORT_PORT');

export type ImportSellpiaInventoryInput = ParsedSellpiaInventoryWorkbook & {
  organizationId: string;
  userId: string;
  fileName: string;
  fileHash: string;
};

export interface SellpiaInventoryImportPort {
  importInventory(input: ImportSellpiaInventoryInput): Promise<SellpiaInventoryImportResponse>;
}

export type ImportClaim =
  | { kind: 'started'; runId: string; attemptToken: string }
  | { kind: 'duplicate'; response: SellpiaInventoryImportResponse }
  | { kind: 'running' };

export interface InventorySkuImportRepositoryPort {
  claimSellpiaImport(input: {
    organizationId: string;
    userId: string;
    fileName: string;
    fileHash: string;
    rowCount: number;
  }): Promise<ImportClaim>;
  replaceSellpiaSnapshot(input: {
    organizationId: string;
    runId: string;
    attemptToken: string;
    rows: ParsedSellpiaInventoryRow[];
  }): Promise<SellpiaInventoryImportResponse>;
  markImportFailed(organizationId: string, runId: string, attemptToken: string): Promise<void>;
}
```

Test exact branches:

- duplicate returns immediately without `replaceSellpiaSnapshot`;
- running throws `ConflictException`;
- a stale-running claim returned as started proceeds with the same run ID and rotated attempt token;
- started calls replace once;
- replace failure calls `markImportFailed` once with the same attempt token and rethrows;
- no ProductOption/Inventory/ledger dependency is injected into the constructor.

- [ ] **Step 2: Run and verify failure**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/inventory/application/service/sellpia-inventory-import.service.spec.ts
```

Expected: FAIL on missing service/ports.

- [ ] **Step 3: Implement the service**

The service depends only on `INVENTORY_SKU_IMPORT_REPOSITORY_PORT`. It does not import the old recommendation policy, bundle stock adapter, inventory mutation repository, or product provision port.

On failure, preserve the original exception and call the fenced failure method. `SourceImportRun` intentionally has no persisted error-text field; normal application logging captures the exception.

- [ ] **Step 4: Run service tests**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/inventory/application/service/sellpia-inventory-import.service.spec.ts
```

Expected: PASS.

## Task 3: Persist the Sellpia Full Snapshot Atomically

**Files:**

- Create: `apps/server/src/inventory/adapter/out/repository/inventory-sku-import.repository.adapter.ts`
- Create: `apps/server/src/inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts`

- [ ] **Step 1: Write the failing PostgreSQL integration tests**

Use the repository's existing Testcontainers pattern. Cover:

- 1,964 generated rows create exactly 1,964 unique InventorySku records;
- duplicate names and duplicate barcodes remain separate when Sellpia codes differ;
- second different snapshot updates metadata/stock/prices and zeroes absent codes;
- zeroed rows retain IDs and any ChannelSkuComponent references;
- same completed hash returns duplicate and performs zero writes;
- same hash scoped to a different organization is independent;
- a running run returns `kind: 'running'`;
- a running run newer than 30 minutes remains running, while an older run is compare-and-set reclaimed with the same ID;
- a failed run is compare-and-set back to running with the same run ID and a new attempt token;
- after worker B reclaims a stale run, worker A's old token cannot write normalized rows, complete the run, or mark B's run failed;
- injected failure after the first upsert batch rolls back every InventorySku change and leaves the run failed after service handling;
- another organization's InventorySku rows never change;
- `stock_transactions`, legacy `inventory`, and `product_options` row counts remain unchanged.

- [ ] **Step 2: Run and verify failure**

```bash
rtk npm run test:integration --workspace=apps/server -- src/inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts
```

Expected: FAIL because the repository does not exist.

- [ ] **Step 3: Implement `claimSellpiaImport`**

Lookup the partial-key tuple `(organizationId, 'sellpia_inventory', channelAccountId=null, fileHash)` with `findFirst`.

- completed -> hydrate the run, return `duplicate` with zero change counts;
- running with `updatedAt < new Date(Date.now() - 30 * 60 * 1000)` -> compare-and-set the same `{id, organizationId, status: 'running', updatedAt, attemptToken: oldToken}` row, rotate to a fresh UUID token, and return started;
- any other running row -> return `running`;
- failed -> compare-and-set `{id, organizationId, status: 'failed', attemptToken: oldToken}` back to running with a fresh UUID token; only a count of 1 returns started;
- absent -> create a running run with a fresh UUID token; catch Prisma `P2002`, reread, and apply the same state logic.

Do not use `findUnique` against a partial unique index.

- [ ] **Step 4: Implement `replaceSellpiaSnapshot`**

Inside one Prisma interactive transaction:

1. acquire a transaction advisory lock with `SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`, where key is `inventory-sku-import:${organizationId}:sellpia_inventory`;
2. lock the run row and verify status, source type, organization, null account, and exact `attemptToken` ownership;
3. load existing `{id, sellpiaProductCode}` rows once to compute create/update counts;
4. upsert normalized rows in chunks of 500 using a tagged `INSERT ... SELECT FROM jsonb_array_elements(...) ... ON CONFLICT (organization_id, sellpia_product_code) DO UPDATE`; provide UUIDs for new rows in application data and never update existing IDs;
5. replace name, option, barcode, reported stock, both Sellpia prices, raw JSON, and `last_import_run_id` on conflict;
6. `updateMany` every known organization InventorySku whose code is not in the complete file and whose stock is nonzero to `{reportedStock: 0, lastImportRunId: runId}`;
7. update the run to completed with `rowCount=rows.length` and `importedAt=now()`;
8. return the hydrated response.

Use Prisma tagged templates only. There are no dynamic table/column identifiers.

If the advisory lock is acquired after another worker has already completed the reclaimed run, return that completed run as duplicate success instead of executing the snapshot again.

Use an explicit interactive transaction configuration (`maxWait` and a 60-second `timeout`) for both workbook repositories; Prisma's default 5-second timeout is too short for validated bulk upserts and re-reads.

- [ ] **Step 5: Implement `markImportFailed`**

Tenant/fence-scope the update by `{id: runId, organizationId, sourceType: 'sellpia_inventory', status: 'running', attemptToken}` and set status failed. Do not touch completed or reclaimed runs.

- [ ] **Step 6: Run the integration test**

```bash
rtk npm run test:integration --workspace=apps/server -- src/inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts
```

Expected: PASS.

## Task 4: Route the New Sellpia Import and Isolate Receipt Batches

**Files:**

- Create: `apps/server/src/inventory/adapter/in/http/sellpia-inventory-import.controller.spec.ts`
- Create: `apps/server/src/inventory/adapter/in/http/sellpia-inventory-import.controller.ts`
- Create: receipt-only port/service/repository/DTO/test files listed in File Structure
- Modify: `apps/server/src/inventory/adapter/in/http/sellpia-receipt-batch.controller.ts`
- Modify: `apps/server/src/inventory/inventory.module.ts`
- Modify: `apps/server/src/inventory/__tests__/inventory.module.wiring.spec.ts`

- [ ] **Step 1: Write failing controller and wiring tests**

Assert:

- controller path is exactly `inventory/sellpia-sync`;
- only `POST import` is present on the new controller;
- missing file returns 400;
- file size is capped at 10 MiB;
- controller computes lower-case SHA-256 and passes current organization/user;
- no `effectiveExportedAt` is required or passed;
- module wires the new controller/service/repository/token;
- legacy `SellpiaSyncController`, stock-adjustment service/repository/ports/policy, and old parser are absent from module wiring and source;
- `CreateSellpiaReceiptBatchDto` and `MarkSellpiaReceiptBatchUploadedDto` survive in a receipt-only DTO file;
- `SellpiaReceiptBatchController` uses a receipt-only incoming port/service/repository whose public methods are exactly create/list/mark-uploaded;
- no receipt service constructor injects Inventory mutation, bundle stock, ProductOption provision, Rocket ledger, or Sellpia snapshot dependencies.

- [ ] **Step 2: Run and verify failure**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/inventory/adapter/in/http/sellpia-inventory-import.controller.spec.ts src/inventory/__tests__/inventory.module.wiring.spec.ts
```

Expected: FAIL on missing new controller/wiring.

- [ ] **Step 3: Implement the controller**

Use `FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } })`. Parse with `parseSellpiaInventoryWorkbook`, hash the original buffer, and call `SELLPIA_INVENTORY_IMPORT_PORT.importInventory`.

Do not expose routes for:

```text
items/:id/approve
items/:id/manual-adjust
items/:id/ignore
candidates/:id/resolve
```

- [ ] **Step 4: Extract receipt-batch behavior**

Create the receipt-only incoming/outgoing ports, service, repository adapter, DTO file, and focused service test. Move the existing create/list/mark-uploaded behavior without changing its HTTP routes or response contracts, switch `SellpiaReceiptBatchController` to the new token, and update the module/barrels.

- [ ] **Step 5: Wire the module, delete the old path, and run focused tests**

Only after receipt tests pass, delete the old controller/DTO, old sync service/ports/repository adapter/tests, old parser/tests, and stock-adjustment recommendation policy/tests listed in File Structure. Verify no controller metadata or provider exposes importRows/approve/manual-adjust/ignore/candidate-resolution behavior. Physical legacy Prisma tables and shared response schemas remain in this expand release for compatibility, but no executable backend path writes them.

Update `apps/server/src/inventory/AGENTS.md` to document the Sellpia `InventorySku` snapshot as read-only source stock metadata, the pure import route, and the hard prohibition on translating this import into `Inventory`/ledger mutations. This is a shared instruction change and must be called out in the implementation PR.

```bash
rtk npm exec --workspace=apps/server vitest -- run src/inventory/application/service/sellpia-inventory-workbook.parser.spec.ts src/inventory/application/service/sellpia-inventory-import.service.spec.ts src/inventory/application/service/sellpia-receipt-batch.service.spec.ts src/inventory/adapter/in/http/sellpia-inventory-import.controller.spec.ts src/inventory/__tests__/inventory.module.wiring.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the Sellpia importer**

```bash
rtk git add apps/server/src/inventory/application/port/in/stock/sellpia-inventory-import.port.ts apps/server/src/inventory/application/port/out/repository/inventory-sku-import.repository.port.ts apps/server/src/inventory/application/port/in/stock/sellpia-receipt-batch.port.ts apps/server/src/inventory/application/port/out/repository/sellpia-receipt-batch.repository.port.ts apps/server/src/inventory/application/port/in/stock/index.ts apps/server/src/inventory/application/port/out/repository/index.ts apps/server/src/inventory/application/service/sellpia-inventory-import.service.ts apps/server/src/inventory/application/service/sellpia-inventory-import.service.spec.ts apps/server/src/inventory/application/service/sellpia-receipt-batch.service.ts apps/server/src/inventory/application/service/sellpia-receipt-batch.service.spec.ts apps/server/src/inventory/adapter/out/repository/inventory-sku-import.repository.adapter.ts apps/server/src/inventory/adapter/out/repository/sellpia-receipt-batch.repository.adapter.ts apps/server/src/inventory/adapter/in/http/sellpia-inventory-import.controller.ts apps/server/src/inventory/adapter/in/http/sellpia-inventory-import.controller.spec.ts apps/server/src/inventory/adapter/in/http/sellpia-receipt-batch.controller.ts apps/server/src/inventory/adapter/in/http/dto/sellpia-receipt-batch.dto.ts apps/server/src/inventory/adapter/in/http/dto/index.ts apps/server/src/inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts apps/server/src/inventory/inventory.module.ts apps/server/src/inventory/__tests__/inventory.module.wiring.spec.ts apps/server/src/inventory/AGENTS.md
rtk git add -u apps/server/src/inventory/adapter/in/http/sellpia-sync.controller.ts apps/server/src/inventory/adapter/in/http/sellpia-sync.controller.spec.ts apps/server/src/inventory/adapter/in/http/dto/sellpia-sync.dto.ts apps/server/src/inventory/application/port/in/stock/sellpia-sync.port.ts apps/server/src/inventory/application/port/out/repository/sellpia-sync.repository.port.ts apps/server/src/inventory/application/service/sellpia-sync.service.ts apps/server/src/inventory/application/service/sellpia-sync.service.spec.ts apps/server/src/inventory/application/service/sellpia-workbook.parser.ts apps/server/src/inventory/application/service/sellpia-workbook.parser.spec.ts apps/server/src/inventory/adapter/out/repository/sellpia-sync.repository.adapter.ts apps/server/src/inventory/adapter/out/repository/sellpia-sync.repository.adapter.spec.ts apps/server/src/inventory/__tests__/sellpia-sync.repository.pg.integration.spec.ts apps/server/src/inventory/domain/policy/sellpia-adjustment-recommendation.ts apps/server/src/inventory/domain/policy/__tests__/sellpia-adjustment-recommendation.spec.ts
rtk git commit -m "feat: import Sellpia inventory SKU snapshots"
```

## Task 5: Build the Coupang Wing Workbook Parser

**Files:**

- Create: `apps/server/src/channels/application/service/coupang-wing-workbook.parser.spec.ts`
- Create: `apps/server/src/channels/application/service/coupang-wing-workbook.parser.ts`

- [ ] **Step 1: Write failing parser tests**

Use generated workbooks with the `Template` sheet. Cover:

- detection of required headers on row 4 within the first 20 rows;
- selection of `Template` even when another sheet comes first;
- repair of a stale `Template.!ref` such as the real file's `A1:HW4` by scanning actual cell addresses through row 2248 before `sheet_to_json`;
- expansion/fill-forward of the seven vertically merged parent columns (`등록상품ID`, `등록상품명`, `쿠팡 노출상품명`, `카테고리`, `제조사`, `브랜드`, `승인상태`) for follow-on option rows;
- no fill-forward for SKU columns (`옵션 ID`, `등록 옵션명`, `판매상태`, `모델번호`, `바코드`);
- 231-column rows preserve every field in `rawJson`;
- IDs remain strings with leading zeroes;
- exact normalized field mapping from the table above;
- `sellerSku` and `salePrice` are absent from parsed rows;
- rows missing either required ID are returned in `skippedRows` with row number and reason;
- duplicate option IDs reject the complete file;
- one option ID under two parent IDs rejects;
- conflicting nonblank parent normalized metadata rejects, while multiple `노출상품ID` values are allowed because that field remains raw;
- empty/no-Template/missing-column/over-10,000-valid-row cases reject.

Use these result types:

```ts
export type ParsedWingCatalogRow = {
  rowNumber: number;
  externalProductId: string;
  registeredName: string | null;
  displayName: string | null;
  category: string | null;
  manufacturer: string | null;
  brand: string | null;
  productStatus: string | null;
  externalSkuId: string;
  optionName: string | null;
  skuStatus: string | null;
  modelNumber: string | null;
  barcode: string | null;
  rawJson: Record<string, unknown>;
};

export type ParsedWingCatalogWorkbook = {
  rows: ParsedWingCatalogRow[];
  skippedRows: Array<{ rowNumber: number; reason: 'missing_product_id' | 'missing_sku_id' }>;
  headers: string[];
};
```

- [ ] **Step 2: Run and verify failure**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels/application/service/coupang-wing-workbook.parser.spec.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement and test the parser**

Before any `sheet_to_json` call, scan every non-metadata worksheet key, decode its cell address, compute the real maximum row/column, and replace a narrower stale `!ref` with the actual range. Read product/SKU IDs from formatted worksheet text rather than numeric coercion. Then expand values only within explicit `sheet['!merges']` ranges for the seven parent columns and only into blank cells, never over an existing cell value. As a defensive second pass, carry the current parent record only across rows belonging to those parent-column merge ranges; never blindly carry a parent into a true orphan row.

The approved file has 137 vertical merge ranges per parent column and 1,017 follow-on option rows. After expansion there are no `missing_product_id` skips. The only three skips are `missing_sku_id` at worksheet rows 56, 2213, and 2248. Freeze these shapes in a synthetic regression workbook and verify the real-file acceptance later; do not commit the real data.

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels/application/service/coupang-wing-workbook.parser.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/server/src/channels/application/service/coupang-wing-workbook.parser.ts apps/server/src/channels/application/service/coupang-wing-workbook.parser.spec.ts
rtk git commit -m "feat: parse Coupang Wing catalog workbooks"
```

## Task 6: Implement the Wing Import Service and Repository

**Files:**

- Create: `apps/server/src/channels/application/port/in/channel-catalog-import.port.ts`
- Create: `apps/server/src/channels/application/port/out/repository/channel-catalog-import.repository.port.ts`
- Create: `apps/server/src/channels/application/service/__tests__/channel-catalog-import.service.spec.ts`
- Create: `apps/server/src/channels/application/service/channel-catalog-import.service.ts`
- Create: `apps/server/src/channels/adapter/out/repository/channel-catalog-import.repository.adapter.ts`
- Create: `apps/server/src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts`

- [ ] **Step 1: Define the ports and failing service tests**

```ts
export const CHANNEL_CATALOG_IMPORT_PORT = Symbol('CHANNEL_CATALOG_IMPORT_PORT');

export type ImportCoupangWingCatalogInput = ParsedWingCatalogWorkbook & {
  organizationId: string;
  userId: string;
  channelAccountId: string;
  fileName: string;
  fileHash: string;
};

export interface ChannelCatalogImportPort {
  importCoupangWing(input: ImportCoupangWingCatalogInput): Promise<CoupangWingCatalogImportResponse>;
}
```

The repository port mirrors the Sellpia claim/write/fail shape, including `attemptToken` on started/write/fail operations, but uses source type `coupang_wing_catalog` and requires `channelAccountId`.

Service tests cover duplicate/running/failed paths, wrong-account propagation, and mark-failed behavior.

- [ ] **Step 2: Write failing PostgreSQL integration tests**

Cover:

- final 1,225-parent/2,241-SKU generated dataset shape plus three skipped rows;
- active Wing account is resolved with `{id, organizationId, channel: 'coupang'}`; wrong organization returns not found and another channel (including the reserved future `rocket` account code) returns bad request before a run is created;
- an imported SKU cannot point at a parent from another account in the same organization; the composite scoped-product FK rejects it;
- parent upsert key is account + `externalProductId`;
- SKU upsert key is account + `externalSkuId`;
- existing active parent/SKU UUIDs are preserved;
- same external SKU already attached to a different parent rejects the whole import;
- metadata and raw JSON update;
- sellerSku and salePrice remain unchanged on update;
- new mapping status is unmatched;
- existing unmatched/needs_review/matched value remains unchanged on re-import;
- existing single, quantity-four, and mixed components remain byte-for-byte equivalent;
- rows absent from the next file remain stored and keep their status;
- completed same hash/account is a no-op;
- fresh running same hash/account returns 409, while a run stale for 30 minutes is reclaimed with the same ID;
- a reclaimed Wing run rejects the old worker token on write/fail exactly like Sellpia;
- same hash under another account is a distinct run/import;
- mid-write failure rolls back parents, SKUs, and run completion;
- another organization's rows never change.

- [ ] **Step 3: Implement account validation and run claiming**

Resolve an active ChannelAccount with `findFirst({ where: { id: channelAccountId, organizationId, status: 'active' } })`, then require `account.channel === 'coupang'` for this Wing-specific endpoint. In this release that channel code means Wing; future Rocket accounts use the distinct `rocket` code. Return `BadRequestException` for another marketplace/channel before claiming a run. Write `channel='coupang'` on ChannelProduct rows. Do not infer service type from account name, infer a primary account, or fall back to environment credentials.

Apply the same completed/running/failed fenced state machine as Sellpia, scoped by account. In the write transaction use `pg_advisory_xact_lock(hashtextextended(${key}, 0))`, lock and verify the run/token, and use the same explicit 60-second transaction timeout.

- [ ] **Step 4: Implement atomic catalog upserts**

Inside one transaction and an account-scoped advisory lock:

1. verify the claimed run and account;
2. group one canonical parent record per external product ID;
3. load existing active parents and SKUs for stable-ID/change counts;
4. upsert parents through the existing active partial unique key; set `masterId=null` only on create and never clear an existing `masterId`;
5. re-read parent IDs keyed by external product ID;
6. reject an existing external SKU whose current parent differs from the imported parent;
7. upsert SKU metadata and `lastImportRunId`; set `channelAccountId` on every imported SKU;
8. on create set `mappingStatus='unmatched'`, `sellerSku=null`, and `salePrice=null`;
9. on update do not write mappingStatus, sellerSku, salePrice, optionId, isUnmatched, or components;
10. retain absent products/SKUs;
11. complete the run with valid row count; skipped count is returned from parsed input.

Use `ON CONFLICT` with the current active partial-index predicate for parent rows and the new organization/account/external-option unique key for SKU rows. Never delete/recreate a stable channel row to simplify an upsert.

- [ ] **Step 5: Run service and integration tests**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels/application/service/__tests__/channel-catalog-import.service.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts
```

Expected: PASS.

## Task 7: Add the Wing Upload Endpoint

**Files:**

- Create: `apps/server/src/channels/adapter/in/http/__tests__/channel-catalog-import.controller.spec.ts`
- Create: `apps/server/src/channels/adapter/in/http/channel-catalog-import.controller.ts`
- Modify: `apps/server/src/channels/channels.module.ts`
- Modify: `apps/server/src/channels/__tests__/channels.module.wiring.spec.ts`

- [ ] **Step 1: Write failing controller/wiring tests**

Assert:

- route is exactly `channels/accounts/:channelAccountId/catalog-imports/coupang-wing`;
- account param uses `ParseUUIDPipe`;
- upload field is `file`, max size 20 MiB;
- current organization/user and SHA-256 reach the port;
- missing file returns 400;
- module registers controller, service, adapter, token binding;
- no organization ID comes from body/query.

- [ ] **Step 2: Implement the controller and module wiring**

The controller parses the workbook, hashes the original bytes, and calls `CHANNEL_CATALOG_IMPORT_PORT.importCoupangWing`.

- [ ] **Step 3: Run focused channels tests**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/channels/application/service/coupang-wing-workbook.parser.spec.ts src/channels/application/service/__tests__/channel-catalog-import.service.spec.ts src/channels/adapter/in/http/__tests__/channel-catalog-import.controller.spec.ts src/channels/__tests__/channels.module.wiring.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/server/src/channels/application/port/in/channel-catalog-import.port.ts apps/server/src/channels/application/port/out/repository/channel-catalog-import.repository.port.ts apps/server/src/channels/application/service/channel-catalog-import.service.ts apps/server/src/channels/application/service/__tests__/channel-catalog-import.service.spec.ts apps/server/src/channels/adapter/out/repository/channel-catalog-import.repository.adapter.ts apps/server/src/channels/adapter/in/http/channel-catalog-import.controller.ts apps/server/src/channels/adapter/in/http/__tests__/channel-catalog-import.controller.spec.ts apps/server/src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts apps/server/src/channels/channels.module.ts apps/server/src/channels/__tests__/channels.module.wiring.spec.ts apps/server/src/channels/application/port/out/repository/index.ts
rtk git commit -m "feat: import Coupang Wing catalog metadata"
```

## Task 8: Retire the Old Executable Baseline Import

**Files:**

- Delete: `scripts/import-product-baseline.ts`
- Delete: `scripts/import-baseline-planner.ts`
- Delete: `scripts/__tests__/import-baseline-planner.spec.ts`
- Delete: `docs/runbooks/import-drive-reference-data.md`
- Modify: `package.json`
- Modify: `scripts/check-script-inventory.mjs`
- Modify: `scripts/README.md`
- Modify: `docs/runbooks/README.md`

- [ ] **Step 1: Add a failing retirement assertion**

Extend `scripts/__tests__/removed-legacy-scripts.spec.ts` or add a focused Node test asserting:

- package script `import:product-baseline` is absent;
- both importer/planner source files are absent;
- script inventory does not list them;
- the runbook index no longer advertises the old importer.

- [ ] **Step 2: Remove the executable path and update inventories**

Do not remove the dev-data bundle's ability to carry reference files; this task removes only the executable DB importer and its dedicated runbook. The source-of-truth imports are now runtime endpoints.

- [ ] **Step 3: Verify no active instructions remain**

```bash
rtk rg -n 'import:product-baseline|import-product-baseline|import-baseline-planner' package.json scripts docs/runbooks
rtk npm run test:scripts
rtk npm run check:scripts-inventory
```

Expected: `rg` returns no active hit and both checks pass.

- [ ] **Step 4: Commit**

```bash
rtk git add package.json scripts/check-script-inventory.mjs scripts/README.md scripts/__tests__/removed-legacy-scripts.spec.ts docs/runbooks/README.md
rtk git add -u scripts/import-product-baseline.ts scripts/import-baseline-planner.ts scripts/__tests__/import-baseline-planner.spec.ts docs/runbooks/import-drive-reference-data.md
rtk git commit -m "refactor: retire legacy matched workbook importer"
```

## Task 9: Import Checkpoint

- [ ] **Step 1: Run all focused tests**

```bash
rtk npm exec --workspace=apps/server vitest -- run src/inventory/application/service/sellpia-inventory-workbook.parser.spec.ts src/inventory/application/service/sellpia-inventory-import.service.spec.ts src/inventory/adapter/in/http/sellpia-inventory-import.controller.spec.ts src/inventory/__tests__/inventory.module.wiring.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/channels/application/service/coupang-wing-workbook.parser.spec.ts src/channels/application/service/__tests__/channel-catalog-import.service.spec.ts src/channels/adapter/in/http/__tests__/channel-catalog-import.controller.spec.ts src/channels/__tests__/channels.module.wiring.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts src/channels/__tests__/channel-catalog-import.repository.pg.integration.spec.ts
```

Expected: PASS.

- [ ] **Step 2: Run build/tenancy/boot gates**

```bash
rtk npm run build --workspace=packages/shared
rtk npm run build --workspace=apps/server
rtk npm run check:idor
rtk npm run check:tenant-scope
rtk npm run dev:server
```

Expected: builds/checks exit `0`; server boots with exactly one `POST /api/inventory/sellpia-sync/import` route and the new account-scoped Wing import route.

- [ ] **Step 3: Inspect route and mutation regressions**

Confirm from boot logs/controller metadata tests that old Sellpia approve/manual-adjust/ignore/candidate routes are not registered. Confirm the new import tests assert zero stock-ledger writes.
