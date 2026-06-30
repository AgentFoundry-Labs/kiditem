# Sellpia Backend Import Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement backend Sellpia XLSX import, row-scoped recommendations, review approval, and new product candidate resolution without automatic stock adjustment.

**Architecture:** Keep workbook parsing and recommendation policy pure under Inventory. HTTP controllers call incoming Inventory ports; services use repository ports; only repository adapters import Prisma.

**Tech Stack:** NestJS, Prisma, @e965/xlsx through `xlsx`, Zod contracts from `@kiditem/shared/inventory`, Vitest.

---

## File Structure

- Create: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/application/service/sellpia-workbook.parser.ts`
- Create: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/application/service/sellpia-workbook.parser.spec.ts`
- Create: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/domain/policy/sellpia-adjustment-recommendation.ts`
- Create: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/domain/policy/__tests__/sellpia-adjustment-recommendation.spec.ts`
- Create: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/application/port/in/stock/sellpia-sync.port.ts`
- Create: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/application/port/out/repository/sellpia-sync.repository.port.ts`
- Create: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/adapter/out/repository/sellpia-sync.repository.adapter.ts`
- Create: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/application/service/sellpia-sync.service.ts`
- Create: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/application/service/sellpia-sync.service.spec.ts`
- Create: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/adapter/in/http/sellpia-sync.controller.ts`
- Create: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/adapter/in/http/sellpia-receipt-batch.controller.ts`
- Modify: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/inventory.module.ts`
- Modify: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/__tests__/inventory.module.wiring.spec.ts`
- Modify: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/__tests__/inventory-flow.pg.integration.spec.ts`

## Engineering Review Constraints

- Keep `sellpia-adjustment-recommendation.ts` pure domain code. It must not import `@nestjs/*`, Prisma, HTTP types, or the application workbook parser.
- Use repository batch lookups during import: one query for all Sellpia product codes, one query for Rocket stock-impact totals, and one query for latest KidItem stock events.
- Reuse the existing `INVENTORY_REPOSITORY_PORT` mutation path for approval row locks, stock delta application, and stock transaction append. `SellpiaSyncRepositoryPort` persists snapshots, items, candidates, and review state only.
- Controller upload handling enforces a 10 MB file limit. Parser rejects empty workbooks and workbooks over `MAX_SELLPIA_IMPORT_ROWS`.
- Receipt upload batches are workflow state only until the official Sellpia receipt-upload workbook template is configured.

### Task 1: Sellpia Workbook Parser

**Files:**
- Test: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/application/service/sellpia-workbook.parser.spec.ts`
- Create: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/application/service/sellpia-workbook.parser.ts`

- [ ] **Step 1: Write the failing parser tests**

```ts
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseSellpiaWorkbook } from './sellpia-workbook.parser';

function workbookBuffer(rows: Record<string, unknown>[]): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Sheet1');
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

describe('parseSellpiaWorkbook', () => {
  it('uses 상품코드 as identity, 재고 as stock, and ignores Sellpia status columns', () => {
    const parsed = parseSellpiaWorkbook(workbookBuffer([
      {
        상품코드: 'SP-001',
        상품명: '테스트 상품',
        재고: '12',
        안전재고: '3',
        바코드: '8801234567890',
        모델명: 'MODEL-1',
        상품분류: 'ignored',
        품절: 'Y',
        품절일: '2026-01-01',
        단종: 'Y',
        단종일: '2026-02-01',
      },
    ]));

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      rowNumber: 2,
      sellpiaProductCode: 'SP-001',
      sellpiaProductName: '테스트 상품',
      sellpiaStock: 12,
      safetyStock: 3,
      barcode: '8801234567890',
      modelName: 'MODEL-1',
    });
    expect(parsed.ignoredColumns).toEqual(['상품분류', '품절', '품절일', '단종', '단종일']);
  });

  it('flags duplicate 상품코드 rows and invalid stock values', () => {
    const parsed = parseSellpiaWorkbook(workbookBuffer([
      { 상품코드: 'SP-001', 상품명: 'A', 재고: '1' },
      { 상품코드: 'SP-001', 상품명: 'B', 재고: '-1' },
      { 상품코드: 'SP-002', 상품명: 'C', 재고: 'abc' },
    ]));

    expect(parsed.rows[0].warnings).toContain('duplicate_code');
    expect(parsed.rows[1].warnings).toEqual(expect.arrayContaining(['duplicate_code', 'invalid_stock']));
    expect(parsed.rows[2].warnings).toContain('invalid_stock');
  });

  it('rejects empty workbooks and workbooks over the Sellpia row limit', () => {
    expect(() => parseSellpiaWorkbook(workbookBuffer([]))).toThrow('비어 있습니다');

    const rows = Array.from({ length: 20_001 }, (_, index) => ({
      상품코드: `SP-${index}`,
      상품명: '상품',
      재고: '1',
    }));
    expect(() => parseSellpiaWorkbook(workbookBuffer(rows))).toThrow('행 수가 너무 많습니다');
  });
});
```

- [ ] **Step 2: Run parser tests and verify failure**

Run:

```bash
npm exec --workspace=apps/server vitest -- run src/inventory/application/service/sellpia-workbook.parser.spec.ts
```

Expected: FAIL because `sellpia-workbook.parser.ts` does not exist.

- [ ] **Step 3: Implement the parser**

Create `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/application/service/sellpia-workbook.parser.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';

export type SellpiaParseWarning = 'duplicate_code' | 'invalid_stock' | 'missing_product_code';

export type ParsedSellpiaRow = {
  rowNumber: number;
  sellpiaProductCode: string;
  sellpiaProductName: string | null;
  sellpiaStock: number;
  safetyStock: number;
  ownProductCode: string | null;
  barcode: string | null;
  modelName: string | null;
  warnings: SellpiaParseWarning[];
  raw: Record<string, unknown>;
};

export type ParsedSellpiaWorkbook = {
  rows: ParsedSellpiaRow[];
  ignoredColumns: string[];
  headers: string[];
};

const IGNORED_COLUMNS = ['상품분류', '품절', '품절일', '단종', '단종일'];
const MAX_SELLPIA_IMPORT_ROWS = 20_000;

export function parseSellpiaWorkbook(buffer: Buffer): ParsedSellpiaWorkbook {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    throw new BadRequestException('Sellpia 엑셀 파일을 읽을 수 없습니다.');
  }

  const firstSheetName = workbook.SheetNames[0];
  const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
  if (!sheet) throw new BadRequestException('Sellpia 엑셀 시트가 없습니다.');

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
  const headers = (aoa[0] ?? []).map((cell) => String(cell ?? '').trim()).filter(Boolean);
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
  if (records.length === 0) throw new BadRequestException('Sellpia 엑셀 파일이 비어 있습니다.');
  if (records.length > MAX_SELLPIA_IMPORT_ROWS) {
    throw new BadRequestException('Sellpia 엑셀 행 수가 너무 많습니다.');
  }
  const rows = records.map((record, index) => normalizeRow(record, index + 2));
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.sellpiaProductCode) continue;
    counts.set(row.sellpiaProductCode, (counts.get(row.sellpiaProductCode) ?? 0) + 1);
  }
  for (const row of rows) {
    if (row.sellpiaProductCode && (counts.get(row.sellpiaProductCode) ?? 0) > 1) {
      row.warnings.push('duplicate_code');
    }
  }

  return {
    rows,
    ignoredColumns: IGNORED_COLUMNS,
    headers,
  };
}

function normalizeRow(record: Record<string, unknown>, rowNumber: number): ParsedSellpiaRow {
  const warnings: SellpiaParseWarning[] = [];
  const sellpiaProductCode = text(record['상품코드']);
  if (!sellpiaProductCode) warnings.push('missing_product_code');
  const stock = integer(record['재고']);
  if (stock === null || stock < 0) warnings.push('invalid_stock');

  return {
    rowNumber,
    sellpiaProductCode,
    sellpiaProductName: nullableText(record['상품명']),
    sellpiaStock: stock !== null && stock >= 0 ? stock : 0,
    safetyStock: Math.max(integer(record['안전재고']) ?? 0, 0),
    ownProductCode: nullableText(record['자사상품코드']),
    barcode: nullableText(record['바코드']),
    modelName: nullableText(record['모델명']),
    warnings,
    raw: record,
  };
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function nullableText(value: unknown): string | null {
  const normalized = text(value);
  return normalized ? normalized : null;
}

function integer(value: unknown): number | null {
  const normalized = text(value).replace(/,/g, '');
  if (!/^-?\d+$/.test(normalized)) return null;
  return Number(normalized);
}
```

- [ ] **Step 4: Run parser tests**

Run:

```bash
npm exec --workspace=apps/server vitest -- run src/inventory/application/service/sellpia-workbook.parser.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit parser**

```bash
git add apps/server/src/inventory/application/service/sellpia-workbook.parser.ts apps/server/src/inventory/application/service/sellpia-workbook.parser.spec.ts
git commit -m "feat: parse Sellpia inventory workbook"
```

### Task 2: Sellpia Recommendation Policy

**Files:**
- Test: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/domain/policy/__tests__/sellpia-adjustment-recommendation.spec.ts`
- Create: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/domain/policy/sellpia-adjustment-recommendation.ts`

- [ ] **Step 1: Write failing policy tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildSellpiaRecommendation, requiresSellpiaApprovalReason } from '../sellpia-adjustment-recommendation';

describe('Sellpia adjustment recommendation policy', () => {
  it('uses Sellpia stock plus Rocket stock-impact ledger net as target', () => {
    const result = buildSellpiaRecommendation({
      sellpiaStock: 10,
      rocketLedgerNet: -2,
      kiditemStockBefore: 6,
      warnings: [],
      productOptionId: 'option-1',
      inventoryId: 'inventory-1',
      hasRecentKidItemEvent: false,
    });

    expect(result.targetCurrentStock).toBe(8);
    expect(result.diff).toBe(2);
    expect(result.status).toBe('recommended');
  });

  it('marks unmatched rows as new product candidates', () => {
    const result = buildSellpiaRecommendation({
      sellpiaStock: 3,
      rocketLedgerNet: 0,
      kiditemStockBefore: 0,
      warnings: [],
      productOptionId: null,
      inventoryId: null,
      hasRecentKidItemEvent: false,
    });

    expect(result.status).toBe('new_product_candidate');
    expect(result.blockingReasons).toContain('new_product_candidate');
  });

  it('warns but does not block large differences', () => {
    const result = buildSellpiaRecommendation({
      sellpiaStock: 100,
      rocketLedgerNet: 0,
      kiditemStockBefore: 1,
      warnings: [],
      productOptionId: 'option-1',
      inventoryId: 'inventory-1',
      hasRecentKidItemEvent: false,
    });

    expect(result.status).toBe('recommended');
    expect(result.warningReasons).toContain('large_difference');
    expect(requiresSellpiaApprovalReason(result, 100)).toBe(true);
  });

  it('requires a reason when operator target differs from recommended target', () => {
    const result = buildSellpiaRecommendation({
      sellpiaStock: 10,
      rocketLedgerNet: 0,
      kiditemStockBefore: 9,
      warnings: [],
      productOptionId: 'option-1',
      inventoryId: 'inventory-1',
      hasRecentKidItemEvent: false,
    });

    expect(requiresSellpiaApprovalReason(result, 11)).toBe(true);
    expect(requiresSellpiaApprovalReason(result, 10)).toBe(false);
  });
});
```

- [ ] **Step 2: Run policy tests and verify failure**

Run:

```bash
npm exec --workspace=apps/server vitest -- run src/inventory/domain/policy/__tests__/sellpia-adjustment-recommendation.spec.ts
```

Expected: FAIL because the policy file does not exist.

- [ ] **Step 3: Implement the recommendation policy**

Create `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/domain/policy/sellpia-adjustment-recommendation.ts`:

```ts
import type {
  SellpiaBlockingReason,
  SellpiaSnapshotItemStatus,
  SellpiaWarningReason,
} from '@kiditem/shared/inventory';

export type SellpiaRecommendationWarning = 'duplicate_code' | 'invalid_stock' | 'missing_product_code';

export type SellpiaRecommendationInput = {
  sellpiaStock: number;
  rocketLedgerNet: number;
  kiditemStockBefore: number;
  warnings: SellpiaRecommendationWarning[];
  productOptionId: string | null;
  inventoryId: string | null;
  hasRecentKidItemEvent: boolean;
};

export type SellpiaRecommendation = {
  targetCurrentStock: number;
  diff: number;
  diffRate: number;
  status: SellpiaSnapshotItemStatus;
  blockingReasons: SellpiaBlockingReason[];
  warningReasons: SellpiaWarningReason[];
};

export function buildSellpiaRecommendation(input: SellpiaRecommendationInput): SellpiaRecommendation {
  const targetCurrentStock = input.sellpiaStock + input.rocketLedgerNet;
  const diff = targetCurrentStock - input.kiditemStockBefore;
  const denominator = Math.max(input.kiditemStockBefore, targetCurrentStock, 1);
  const diffRate = Math.abs(diff) / denominator;
  const blockingReasons: SellpiaBlockingReason[] = [];
  const warningReasons: SellpiaWarningReason[] = [];

  if (!input.productOptionId) blockingReasons.push('new_product_candidate');
  if (input.productOptionId && !input.inventoryId) blockingReasons.push('missing_inventory');
  if (targetCurrentStock < 0) blockingReasons.push('negative_target_stock');
  if (input.hasRecentKidItemEvent) blockingReasons.push('recent_kiditem_event');
  if (input.warnings.includes('duplicate_code')) blockingReasons.push('duplicate_code');
  if (input.warnings.includes('invalid_stock')) blockingReasons.push('invalid_stock');
  if (input.warnings.includes('missing_product_code')) blockingReasons.push('parse_warning');
  if (Math.abs(diff) >= 20 || diffRate >= 0.3) warningReasons.push('large_difference');

  const status: SellpiaSnapshotItemStatus = blockingReasons.includes('new_product_candidate')
    ? 'new_product_candidate'
    : blockingReasons.length > 0
      ? 'needs_review'
      : 'recommended';

  return { targetCurrentStock, diff, diffRate, status, blockingReasons, warningReasons };
}

export function requiresSellpiaApprovalReason(
  recommendation: Pick<SellpiaRecommendation, 'targetCurrentStock' | 'warningReasons'>,
  operatorTargetStock: number,
): boolean {
  return recommendation.warningReasons.includes('large_difference') ||
    operatorTargetStock !== recommendation.targetCurrentStock;
}
```

- [ ] **Step 4: Run policy tests**

Run:

```bash
npm exec --workspace=apps/server vitest -- run src/inventory/domain/policy/__tests__/sellpia-adjustment-recommendation.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit policy**

```bash
git add apps/server/src/inventory/domain/policy/sellpia-adjustment-recommendation.ts apps/server/src/inventory/domain/policy/__tests__/sellpia-adjustment-recommendation.spec.ts
git commit -m "feat: add Sellpia recommendation policy"
```

### Task 3: Sellpia Import Service And Controller

**Files:**
- Create: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/application/port/in/stock/sellpia-sync.port.ts`
- Create: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/application/port/out/repository/sellpia-sync.repository.port.ts`
- Create: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/application/service/sellpia-sync.service.ts`
- Test: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/application/service/sellpia-sync.service.spec.ts`
- Create: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/adapter/out/repository/sellpia-sync.repository.adapter.ts`
- Create: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/adapter/in/http/sellpia-sync.controller.ts`
- Modify: `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/inventory.module.ts`

- [ ] **Step 1: Write failing service tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { SellpiaSyncService } from './sellpia-sync.service';
import type { SellpiaSyncRepositoryPort } from '../port/out/repository/sellpia-sync.repository.port';
import type { InventoryRepositoryPort } from '../port/out/repository/inventory.repository.port';

describe('SellpiaSyncService', () => {
  it('imports rows as preview items and never creates stock transactions during import', async () => {
    const repository = makeRepository({
      optionsByCode: new Map([['SP-001', { productOptionId: 'option-1', inventoryId: 'inventory-1', currentStock: 8 }]]),
      rocketNetByOption: new Map([['option-1', -2]]),
    });
    const inventoryRepository = makeInventoryRepository();
    const service = new SellpiaSyncService(repository, inventoryRepository);

    const result = await service.importRows({
      organizationId: 'org-1',
      userId: 'user-1',
      fileName: 'sellpia.xlsx',
      fileHash: 'hash-1',
      effectiveExportedAt: new Date('2026-06-29T00:00:00Z'),
      rows: [
        {
          rowNumber: 2,
          sellpiaProductCode: 'SP-001',
          sellpiaProductName: '상품',
          sellpiaStock: 10,
          safetyStock: 0,
          ownProductCode: null,
          barcode: null,
          modelName: null,
          warnings: [],
          raw: {},
        },
      ],
      ignoredColumns: [],
      headers: ['상품코드', '재고'],
    });

    expect(result.summary.recommendedCount).toBe(1);
    expect(result.items[0].targetCurrentStock).toBe(8);
    expect(repository.findOptionsBySellpiaCodes).toHaveBeenCalledTimes(1);
    expect(repository.sumRocketStockDeltas).toHaveBeenCalledTimes(1);
    expect(inventoryRepository.appendStockLedger).not.toHaveBeenCalled();
  });

  it('requires reason for large difference approval', async () => {
    const repository = makeRepository({
      item: {
        id: 'item-1',
        inventoryId: 'inventory-1',
        productOptionId: 'option-1',
        targetCurrentStock: 100,
        kiditemStockBefore: 1,
        warningReasons: ['large_difference'],
        blockingReasons: [],
        status: 'recommended',
      },
      lockedStock: 1,
    });
    const service = new SellpiaSyncService(repository, makeInventoryRepository({ lockedStock: 1 }));

    await expect(service.approveItem({
      organizationId: 'org-1',
      userId: 'user-1',
      itemId: 'item-1',
      targetCurrentStock: 100,
    })).rejects.toThrow(BadRequestException);
  });
});

function makeRepository(overrides: Partial<SellpiaSyncRepositoryPort> & Record<string, unknown>): SellpiaSyncRepositoryPort {
  return {
    createSnapshotWithItems: vi.fn(async (input: any) => ({
      snapshot: {
        id: '00000000-0000-4000-8000-000000000001',
        fileName: input.fileName,
        rowCount: input.items.length,
        effectiveExportedAt: input.effectiveExportedAt.toISOString(),
        status: 'previewed',
      },
      items: input.items.map((item: any, index: number) => ({
        id: `00000000-0000-4000-8000-${String(index + 2).padStart(12, '0')}`,
        ...item,
      })),
      newProductCandidates: input.newProductCandidates,
      })),
    findOptionsBySellpiaCodes: vi.fn(async (_organizationId: string, codes: string[]) => {
      const source = overrides.optionsByCode as Map<string, unknown> | undefined;
      return new Map(codes.map((code) => [code, source?.get(code) ?? null]));
    }),
    sumRocketStockDeltas: vi.fn(async (_organizationId: string, optionIds: string[]) => {
      const source = overrides.rocketNetByOption as Map<string, number> | undefined;
      return new Map(optionIds.map((optionId) => [optionId, source?.get(optionId) ?? 0]));
    }),
    listLatestStockEventTimes: vi.fn(async () => new Map()),
    findSnapshotItemForApproval: vi.fn(async () => overrides.item as any),
    markItemApplied: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as SellpiaSyncRepositoryPort;
}

function makeInventoryRepository(overrides: { lockedStock?: number } = {}): InventoryRepositoryPort {
  return {
    runInventoryStockMutation: vi.fn(async (_inventoryId, _organizationId, op) => op(Symbol('tx') as any, {
      id: 'inventory-1',
      optionId: 'option-1',
      organizationId: 'org-1',
      currentStock: overrides.lockedStock ?? 1,
      reservedStock: 0,
      safetyStock: 0,
      reorderPoint: 0,
      reorderQuantity: 0,
      leadTimeDays: null,
      dailySalesAvg: 0,
      warehouseLocation: null,
      lastRestockedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    applyStockDelta: vi.fn(async () => ({ id: 'inventory-1', optionId: 'option-1', organizationId: 'org-1', currentStock: 100 })),
    findOptionNameForLedger: vi.fn(async () => '옵션'),
    appendStockLedger: vi.fn(async () => ({ id: 'tx-1' })),
    ...overrides,
  } as unknown as InventoryRepositoryPort;
}
```

- [ ] **Step 2: Run service tests and verify failure**

Run:

```bash
npm exec --workspace=apps/server vitest -- run src/inventory/application/service/sellpia-sync.service.spec.ts
```

Expected: FAIL because service and port files do not exist.

- [ ] **Step 3: Add ports and service behavior**

Create `sellpia-sync.port.ts` with this incoming interface:

```ts
import type {
  SellpiaApprovalInput,
  SellpiaReceiptUploadBatch,
  SellpiaSnapshotImportResponse,
} from '@kiditem/shared/inventory';
import type { ParsedSellpiaWorkbook } from '../../../service/sellpia-workbook.parser';

export const SELLPIA_SYNC_PORT = Symbol('SellpiaSyncPort');

export type ImportSellpiaRowsInput = ParsedSellpiaWorkbook & {
  organizationId: string;
  userId: string;
  fileName: string;
  fileHash: string;
  effectiveExportedAt: Date;
};

export type ApproveSellpiaItemInput = SellpiaApprovalInput & {
  organizationId: string;
  userId: string;
  itemId: string;
};

export interface SellpiaSyncPort {
  importRows(input: ImportSellpiaRowsInput): Promise<SellpiaSnapshotImportResponse>;
  approveItem(input: ApproveSellpiaItemInput): Promise<void>;
  createReceiptBatch(input: {
    organizationId: string;
    userId: string;
    sourceType: string;
    sourceRef: string;
    note?: string;
  }): Promise<SellpiaReceiptUploadBatch>;
  listReceiptBatches(organizationId: string): Promise<SellpiaReceiptUploadBatch[]>;
  markReceiptBatchUploaded(input: {
    organizationId: string;
    userId: string;
    batchId: string;
    note?: string;
  }): Promise<SellpiaReceiptUploadBatch>;
}
```

Create the repository port with methods named exactly as used in the test:

```ts
import type { RepositoryTransaction } from '../transaction/repository-transaction';

export const SELLPIA_SYNC_REPOSITORY_PORT = Symbol('SellpiaSyncRepositoryPort');

export interface SellpiaSyncRepositoryPort {
  findOptionsBySellpiaCodes(
    organizationId: string,
    sellpiaProductCodes: string[],
  ): Promise<Map<string, { productOptionId: string; inventoryId: string | null; currentStock: number } | null>>;
  sumRocketStockDeltas(organizationId: string, optionIds: string[], until: Date): Promise<Map<string, number>>;
  listLatestStockEventTimes(organizationId: string, optionIds: string[]): Promise<Map<string, Date>>;
  createSnapshotWithItems(input: any): Promise<any>;
  findSnapshotItemForApproval(organizationId: string, itemId: string): Promise<any | null>;
  createReceiptBatch(input: any): Promise<any>;
  listReceiptBatches(organizationId: string): Promise<any[]>;
  markReceiptBatchUploaded(input: any): Promise<any>;
  markItemApplied(tx: RepositoryTransaction, input: {
    organizationId: string;
    itemId: string;
    operatorTargetStock: number;
    kiditemStockAtApply: number;
    transactionId: string;
    userId: string;
    reason: string | null;
  }): Promise<void>;
}
```

Implement `SellpiaSyncService` so import calls `buildSellpiaRecommendation` for each parsed row, creates candidate rows for `new_product_candidate`, and approval re-reads the item and locked inventory before deriving `delta = operatorTargetStock - locked.currentStock`.

Implementation requirements:

- Inject both `SELLPIA_SYNC_REPOSITORY_PORT` and the existing `INVENTORY_REPOSITORY_PORT`.
- Convert parser warnings to `SellpiaRecommendationWarning[]` at the service boundary; the domain policy must not import the parser.
- During import, build a unique list of Sellpia product codes, call `findOptionsBySellpiaCodes` once, build a unique list of matched option ids, call `sumRocketStockDeltas` once, and call `listLatestStockEventTimes` once.
- During approval, call `inventoryRepository.runInventoryStockMutation`, `inventoryRepository.applyStockDelta`, and `inventoryRepository.appendStockLedger` inside the same transaction callback, then call `sellpiaRepository.markItemApplied`.
- Preserve the existing `ADJUST` stock transaction type and reason text. Do not create a Sellpia-specific parallel stock transaction writer.

- [ ] **Step 4: Run focused service tests**

Run:

```bash
npm exec --workspace=apps/server vitest -- run src/inventory/application/service/sellpia-sync.service.spec.ts src/inventory/application/service/sellpia-workbook.parser.spec.ts src/inventory/domain/policy/__tests__/sellpia-adjustment-recommendation.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Add repository adapter, controller, and module wiring**

Add:

- `SellpiaSyncRepositoryAdapter` using tenant-scoped Prisma queries for snapshots, items, candidates, batch option lookup, batch Rocket ledger totals, and latest stock event times. It must not lock or update `inventory`.
- `SellpiaSyncController` with:
  - `POST /api/inventory/sellpia-sync/import`
  - `POST /api/inventory/sellpia-sync/items/:id/approve`
  - `POST /api/inventory/sellpia-sync/items/:id/ignore`
  - `POST /api/inventory/sellpia-sync/items/:id/manual-adjust`
- `SellpiaReceiptBatchController` with:
  - `POST /api/inventory/sellpia-receipt-batches`
  - `GET /api/inventory/sellpia-receipt-batches`
  - `POST /api/inventory/sellpia-receipt-batches/:id/mark-uploaded`

Controller rules:

```ts
@Controller('inventory/sellpia-sync')
export class SellpiaSyncController {
  constructor(@Inject(SELLPIA_SYNC_PORT) private readonly sellpiaSync: SellpiaSyncPort) {}
}
```

Every handler must get `organizationId` from `@CurrentOrganization()` and user id from `@CurrentUser()`. Body DTOs must not contain `organizationId`.

Use `FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } })` for XLSX upload. Receipt batch endpoints return and mutate workflow state only; they do not generate a workbook until the official Sellpia template is configured.

- [ ] **Step 6: Update module wiring and integration specs**

Add `SellpiaSyncController`, `SellpiaReceiptBatchController`, `SellpiaSyncService`, and `SellpiaSyncRepositoryAdapter` to `inventory.module.ts`. Update `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/__tests__/inventory.module.wiring.spec.ts` so InventoryModule still exports only `INVENTORY_PORT`.

Extend `/Users/yhc125/workspace/kiditem/apps/server/src/inventory/__tests__/inventory-flow.pg.integration.spec.ts` with:

- concurrent approval of the same Sellpia snapshot item applies at most one stock adjustment;
- approval after a recent stock event requires explicit operator target and reason;
- Sellpia approval recomputes bundle stock through the existing Inventory mutation path.

- [ ] **Step 7: Run backend architecture and tenant checks**

Run:

```bash
npm exec --workspace=apps/server vitest -- run src/inventory/application/service/sellpia-sync.service.spec.ts
npm exec --workspace=apps/server vitest -- run src/inventory/__tests__/inventory.architecture.spec.ts src/inventory/__tests__/inventory.module.wiring.spec.ts src/inventory/__tests__/inventory-flow.pg.integration.spec.ts
npm run check:idor
npm run check:tenant-scope
npm run build --workspace=apps/server
```

Expected: PASS. The server build must not report unresolved provider tokens.

- [ ] **Step 8: Commit Sellpia backend**

```bash
git add apps/server/src/inventory
git commit -m "feat: add Sellpia inventory import review backend"
```

## Self-Review

- Spec coverage: parser, row-scoped imports, no auto-adjust, recommendations, approval reason policy, and candidate capture are covered.
- Red-flag scan: no blocked planning phrases are intentionally present.
- Type consistency: service tests use the same port method names specified for the repository adapter.
