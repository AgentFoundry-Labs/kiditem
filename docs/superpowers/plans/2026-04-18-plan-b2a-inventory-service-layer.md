# Plan B2a — Inventory Service Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan A 3-layer schema 를 inventory 도메인 service layer 에 적용한다. `InventoryService` 하나가 Inventory read/metadata-write/stock-mutation/ledger-read 를 통합 소유하고, `StockTransaction` entity 는 내부 구현 세부사항으로 감춘다. 기존 `StockMovementService`/`StockMovementController` 는 제거하고 `BundleStockService.recomputeForComponent` 로 bundle option 의 `availableStock` fan-out 을 고정한다.

**Architecture:** `InventoryService.receive/issue/adjust` → private `applyDelta()` → `$transaction{ row lock + Inventory.update + StockTransaction.create + BundleStockService.recomputeForComponent }` 원자 시퀀스. `BundleStockService` 를 `ProductsModule.exports` 로 전환하고 (`ADR-0014`) `InventoryService` 만 호출 허용. Transfer (stock + return) 는 record-only (currentStock 미변경, record-keeping 만). semantic REST endpoints (`POST /:id/receive`, `/:id/issue`, `/:id/adjust`).

**Tech Stack:** NestJS 11 + Prisma v7 (multi-file schema) + Zod + `@kiditem/shared` (Zod-first + `satisfies` pattern) + class-validator DTO + vitest + real-Postgres integration tests.

**Spec:** `docs/superpowers/specs/2026-04-18-plan-b2a-inventory-service-layer-design.md`

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `packages/shared/src/schemas/inventory.ts` | 10+ 신규 Zod schema 추가 (기존 `InventorySchema` 유지) |
| Modify | `packages/shared/src/schemas/index.ts` | 신규 schema re-export |
| Modify | `packages/shared/src/index.ts` | 신규 type re-export |
| Modify | `apps/server/src/products/util/serialize.ts` | `toSerializable` BigInt guard (Plan B1 이월 #4) |
| Modify | `apps/server/src/products/util/__tests__/serialize.spec.ts` | BigInt case 테스트 추가 |
| Modify | `apps/server/src/products/services/bundle-stock.service.ts` | `recomputeForComponent(optionId, tx)` 추가 |
| Create | `apps/server/src/products/services/__tests__/bundle-stock.recompute-for-component.spec.ts` | 신규 메서드 unit test |
| Modify | `apps/server/src/products/products.module.ts` | `BundleStockService` 를 `exports` 에 추가 |
| Modify | `apps/server/src/products/CLAUDE.md` | Non-export 섹션에서 `BundleStockService` 제거 |
| Create | `apps/server/src/inventory/dto/list-inventory-query.dto.ts` | List query DTO |
| Create | `apps/server/src/inventory/dto/update-inventory-metadata.dto.ts` | Metadata update DTO |
| Create | `apps/server/src/inventory/dto/receive-stock.dto.ts` | Receive input DTO |
| Create | `apps/server/src/inventory/dto/issue-stock.dto.ts` | Issue input DTO |
| Create | `apps/server/src/inventory/dto/adjust-stock.dto.ts` | Adjust input DTO |
| Create | `apps/server/src/inventory/dto/list-transactions-query.dto.ts` | Ledger query DTO |
| Create | `apps/server/src/inventory/dto/transaction-summary-query.dto.ts` | Summary query DTO |
| Modify | `apps/server/src/inventory/dto/index.ts` | barrel export |
| Rewrite | `apps/server/src/inventory/services/inventory.service.ts` | 단일 통합 service (read + metadata + mutation + ledger) |
| Create | `apps/server/src/inventory/services/__tests__/inventory.service.reads.spec.ts` | list / findById / findByOptionId 단위 |
| Create | `apps/server/src/inventory/services/__tests__/inventory.service.metadata.spec.ts` | updateMetadata 단위 |
| Create | `apps/server/src/inventory/services/__tests__/inventory.service.receive.spec.ts` | receive 단위 |
| Create | `apps/server/src/inventory/services/__tests__/inventory.service.issue.spec.ts` | issue 단위 |
| Create | `apps/server/src/inventory/services/__tests__/inventory.service.adjust.spec.ts` | adjust 단위 |
| Create | `apps/server/src/inventory/services/__tests__/inventory.service.ledger.spec.ts` | listTransactions / getTransactionSummary 단위 |
| Rewrite | `apps/server/src/inventory/controllers/inventory.controller.ts` | 10 endpoints + @CurrentCompany + @CurrentUser |
| Create | `apps/server/src/inventory/controllers/__tests__/inventory.controller.e2e.spec.ts` | 라우트 매칭 순서 + DTO 검증 E2E |
| Delete | `apps/server/src/inventory/services/stock-movement.service.ts` | 기능 InventoryService 로 흡수 |
| Delete | `apps/server/src/inventory/controllers/stock-movement.controller.ts` | 동일 |
| Delete | `apps/server/src/inventory/dto/list-stock-movement-query.dto.ts` | 사용처 소멸 |
| Delete | `apps/server/src/inventory/dto/stock-movement-summary-query.dto.ts` | 동일 |
| Delete | `apps/server/src/inventory/dto/receive-stock-body.dto.ts` | `ReceiveStockDto` 로 대체 |
| Modify | `apps/server/src/inventory/inventory.module.ts` | `ProductsModule` import, `StockMovementService`/Controller 제거 |
| Modify | `apps/server/src/inventory/services/unshipped.service.ts` | `prisma.company.findFirst` 제거 + `companyId` 파라미터 |
| Modify | `apps/server/src/inventory/controllers/unshipped.controller.ts` | `@CurrentCompany()` 배선 |
| Modify | `apps/server/src/stock-transfers/stock-transfers.service.ts` | `productId`→`optionId` + IDOR fix |
| Modify | `apps/server/src/stock-transfers/dto/create-stock-transfer.dto.ts` | optionId 필드 |
| Modify | `apps/server/src/stock-transfers/stock-transfers.controller.ts` | `@CurrentCompany()` 주입 전달 |
| Modify | `apps/server/src/return-transfers/return-transfers.service.ts` | `productId`→`optionId` + IDOR fix |
| Modify | `apps/server/src/return-transfers/dto/create-return-transfer.dto.ts` | optionId 필드 |
| Modify | `apps/server/src/return-transfers/return-transfers.controller.ts` | `@CurrentCompany()` 주입 전달 |
| Modify | `apps/server/src/common/master-product-resolver.ts` | `resolveInventory` export 제거 (파일 유지, `resolvePricing` 은 그대로) |
| Create | `apps/server/src/inventory/__tests__/inventory-flow.integration.spec.ts` | 11 시나리오 real Postgres integration |
| Create | `.claude/docs/decisions/0014-stock-mutation-single-writer.md` | ADR — InventoryService 단독 writer invariant |
| Create | `apps/server/src/inventory/CLAUDE.md` | Inventory 도메인 가이드 |
| Modify | `apps/server/CLAUDE.md` | Domain Guides 표 + inventory 진입 |
| Modify | `prisma/CLAUDE.md` | StockTransaction 접근 규약 1줄 |

---

## Task Dependencies

```
Phase 1 (foundations, parallel-safe):
  T1 (shared types)  ─┐
  T2 (BigInt guard)   ├─> Phase 2
  T3 (BundleStock)   ─┘

Phase 2 (InventoryService — sequential, shared file):
  T4 (DTOs) -> T5 (reads+metadata) -> T6 (receive) -> T7 (issue+adjust) -> T8 (ledger reads)

Phase 3 (wiring):
  T9 (Controller + E2E) -> T10 (Module cleanup)

Phase 4 (adjacent, parallel-safe after Phase 3):
  T11 (unshipped) -> T12 (transfers) -> T13 (resolver)

Phase 5 (integration + docs):
  T14 (integration tests) -> T15 (ADR + CLAUDE.md) -> T16 (final verification)
```

**Parallel dispatch warning**: Phase 2 tasks all touch `inventory.service.ts` (shared file). **Must run sequential** — `vitest` config `fileParallelism:false` 와 별개로 edit race 발생. Phase 1 내부 + Phase 4 내부는 parallel 가능.

---

## Task 1: Shared Types Extension

**Files:**
- Modify: `packages/shared/src/schemas/inventory.ts` (extend)
- Modify: `packages/shared/src/schemas/index.ts`
- Modify: `packages/shared/src/index.ts`

### Step 1.1 — 기존 파일 백업 read (confirm 현재 상태)

- [ ] **기존 `packages/shared/src/schemas/inventory.ts` 확인**

Run: `cat packages/shared/src/schemas/inventory.ts`

Expected 현재 상태:
```ts
import { z } from 'zod';
import { zIsoDate } from './common.js';

export const InventorySchema = z.object({
  id: z.string().uuid(),
  optionId: z.string().uuid(),
  companyId: z.string().uuid(),
  currentStock: z.number().int(),
  reservedStock: z.number().int(),
  safetyStock: z.number().int(),
  reorderPoint: z.number().int(),
  reorderQuantity: z.number().int(),
  leadTimeDays: z.number().int().nullable(),
  dailySalesAvg: z.number(),
  warehouseLocation: z.string().nullable(),
  lastRestockedAt: zIsoDate.nullable(),
  createdAt: zIsoDate,
  updatedAt: zIsoDate,
});
export type Inventory = z.infer<typeof InventorySchema>;
```

### Step 1.2 — 신규 schemas 추가

- [ ] **`packages/shared/src/schemas/inventory.ts` 에 다음 이어서 append**

```ts
// ===== Status =====
export const InventoryStatusSchema = z.enum(['healthy', 'low', 'out']);
export type InventoryStatus = z.infer<typeof InventoryStatusSchema>;

// ===== List item (option + master flattened) =====
export const InventoryListItemSchema = z.object({
  id: z.string().uuid(),
  optionId: z.string().uuid(),
  masterId: z.string().uuid(),
  sku: z.string(),
  masterName: z.string(),
  optionName: z.string().nullable(),
  kind: z.enum(['SIMPLE', 'BUNDLE']),
  currentStock: z.number().int(),
  availableStock: z.number().int(),
  safetyStock: z.number().int(),
  reorderPoint: z.number().int(),
  leadTimeDays: z.number().int().nullable(),
  warehouseLocation: z.string().nullable(),
  status: InventoryStatusSchema,
});
export type InventoryListItem = z.infer<typeof InventoryListItemSchema>;

// ===== Summary =====
export const InventorySummarySchema = z.object({
  total: z.number().int(),
  healthy: z.number().int(),
  low: z.number().int(),
  out: z.number().int(),
});
export type InventorySummary = z.infer<typeof InventorySummarySchema>;

// ===== List response =====
export const InventoryListResponseSchema = z.object({
  items: z.array(InventoryListItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  summary: InventorySummarySchema,
});
export type InventoryListResponse = z.infer<typeof InventoryListResponseSchema>;

// ===== Stock transaction (ledger row) =====
export const StockTransactionTypeSchema = z.enum(['RECEIVE', 'ISSUE', 'ADJUST']);
export type StockTransactionType = z.infer<typeof StockTransactionTypeSchema>;

export const StockTransactionSchema = z.object({
  id: z.string().uuid(),
  optionId: z.string().uuid(),
  type: StockTransactionTypeSchema,
  quantity: z.number().int(),
  unitCost: z.number().int(),
  createdAt: zIsoDate,
});
export type StockTransaction = z.infer<typeof StockTransactionSchema>;

// ===== Mutation result =====
export const StockOperationResultSchema = z.object({
  inventory: InventorySchema,
  transaction: StockTransactionSchema,
  recomputedBundleOptionIds: z.array(z.string().uuid()),
});
export type StockOperationResult = z.infer<typeof StockOperationResultSchema>;

// ===== Ledger list / summary =====
export const TransactionListItemSchema = z.object({
  id: z.string().uuid(),
  optionId: z.string().uuid(),
  optionName: z.string().nullable(),
  type: StockTransactionTypeSchema,
  quantity: z.number().int(),
  unitCost: z.number().int(),
  totalCost: z.number().int(),
  warehouseId: z.string().uuid().nullable(),
  relatedId: z.string().nullable(),
  relatedType: z.string().nullable(),
  note: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: zIsoDate,
});
export type TransactionListItem = z.infer<typeof TransactionListItemSchema>;

export const TransactionListResponseSchema = z.object({
  items: z.array(TransactionListItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});
export type TransactionListResponse = z.infer<typeof TransactionListResponseSchema>;

export const TransactionSummarySchema = z.object({
  inQty: z.number().int(),
  outQty: z.number().int(),
  adjustQty: z.number().int(),
  inAmount: z.number().int(),
  outAmount: z.number().int(),
});
export type TransactionSummary = z.infer<typeof TransactionSummarySchema>;

// ===== Input schemas =====
export const ReceiveStockInputSchema = z.object({
  quantity: z.number().int().positive(),
  unitCost: z.number().int().nonnegative().optional(),
  warehouseId: z.string().uuid().optional(),
  note: z.string().max(500).optional(),
});
export type ReceiveStockInput = z.infer<typeof ReceiveStockInputSchema>;

export const IssueStockInputSchema = z.object({
  quantity: z.number().int().positive(),
  warehouseId: z.string().uuid().optional(),
  relatedId: z.string().max(100).optional(),
  relatedType: z.string().max(50).optional(),
  note: z.string().max(500).optional(),
});
export type IssueStockInput = z.infer<typeof IssueStockInputSchema>;

export const AdjustStockInputSchema = z.object({
  delta: z.number().int().refine((n) => n !== 0, 'delta must be non-zero'),
  reason: z.string().min(1).max(500),
});
export type AdjustStockInput = z.infer<typeof AdjustStockInputSchema>;

export const UpdateInventoryMetadataInputSchema = z.object({
  safetyStock: z.number().int().nonnegative().optional(),
  reorderPoint: z.number().int().nonnegative().optional(),
  reorderQuantity: z.number().int().nonnegative().optional(),
  leadTimeDays: z.number().int().nonnegative().nullable().optional(),
  warehouseLocation: z.string().max(100).nullable().optional(),
});
export type UpdateInventoryMetadataInput = z.infer<typeof UpdateInventoryMetadataInputSchema>;
```

### Step 1.3 — schemas barrel export

- [ ] **`packages/shared/src/schemas/index.ts` 에 re-export 추가**

현재 파일에 이미 `export * from './inventory.js';` 있으면 skip. 없으면 추가:
```ts
export * from './inventory.js';
```

Run: `grep -n "inventory" packages/shared/src/schemas/index.ts`
Expected: `export * from './inventory.js';` 존재.

### Step 1.4 — root barrel export

- [ ] **`packages/shared/src/index.ts` 에 type re-export 확인/추가**

Run: `grep -n "inventory" packages/shared/src/index.ts`

Schema re-export 는 `index.ts` 가 대부분 `export * from './schemas/index.js'` 방식이면 자동 포함. 확인 후 누락된 명시적 type export 없음을 확인.

만약 `index.ts` 가 개별 type 만 export 한다면 (Plan B1 product.ts 패턴) 다음 추가:
```ts
export type {
  Inventory,
  InventoryStatus,
  InventoryListItem,
  InventorySummary,
  InventoryListResponse,
  StockTransactionType,
  StockTransaction,
  StockOperationResult,
  TransactionListItem,
  TransactionListResponse,
  TransactionSummary,
  ReceiveStockInput,
  IssueStockInput,
  AdjustStockInput,
  UpdateInventoryMetadataInput,
} from './schemas/inventory.js';
```

### Step 1.5 — Build + type check

- [ ] **shared 빌드 + 타입 확인**

Run: `npm run build -w packages/shared`
Expected: "Build success" + dist/ 갱신.

- [ ] **서버에서 resolvable 확인**

Run: `cd apps/server && npx tsc --noEmit 2>&1 | grep -c "@kiditem/shared"`
Expected: 0 (shared 관련 resolve 에러 없음)

### Step 1.6 — Commit

- [ ] **커밋**

```bash
git add packages/shared/src/schemas/inventory.ts packages/shared/src/schemas/index.ts packages/shared/src/index.ts packages/shared/dist
git commit -m "feat(shared): inventory schemas for Plan B2a

Add Zod schemas for Inventory domain Plan B2a service layer:
- InventoryListItem/Summary/ListResponse
- StockTransaction + StockOperationResult
- TransactionListItem/Response/Summary
- Receive/Issue/Adjust/UpdateMetadata input schemas

All types derived via z.infer. Existing InventorySchema untouched."
```

---

## Task 2: BigInt Guard in serialize.ts (Plan B1 이월 #4)

**Files:**
- Modify: `apps/server/src/products/util/serialize.ts`
- Modify: `apps/server/src/products/util/__tests__/serialize.spec.ts`

### Step 2.1 — 기존 test + code 확인

- [ ] **현재 serialize.ts + 기존 spec 읽기**

Run: `cat apps/server/src/products/util/serialize.ts apps/server/src/products/util/__tests__/serialize.spec.ts 2>/dev/null | head -80`

### Step 2.2 — 실패 테스트 작성

- [ ] **`apps/server/src/products/util/__tests__/serialize.spec.ts` 에 BigInt case 추가**

```ts
// 기존 파일 끝부분에 describe/it 추가
describe('toSerializable — BigInt guard (Plan B1 #4)', () => {
  it('safe-range BigInt → Number', () => {
    const input = { count: BigInt(42) };
    const result = toSerializable(input);
    expect(result).toEqual({ count: 42 });
    expect(typeof (result as any).count).toBe('number');
  });

  it('unsafe-range BigInt (> MAX_SAFE_INTEGER) → String', () => {
    const huge = BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1);
    const input = { count: huge };
    const result = toSerializable(input);
    expect((result as any).count).toBe(huge.toString());
    expect(typeof (result as any).count).toBe('string');
  });

  it('unsafe-range negative BigInt → String', () => {
    const tinyNeg = BigInt(Number.MIN_SAFE_INTEGER) - BigInt(1);
    const input = { count: tinyNeg };
    const result = toSerializable(input);
    expect((result as any).count).toBe(tinyNeg.toString());
  });

  it('nested BigInt in array', () => {
    const input = [{ n: BigInt(7) }, { n: BigInt(Number.MAX_SAFE_INTEGER) + BigInt(5) }];
    const result = toSerializable(input) as any[];
    expect(result[0].n).toBe(7);
    expect(typeof result[1].n).toBe('string');
  });
});
```

### Step 2.3 — 테스트 실패 확인

- [ ] **Run**: `npx vitest run apps/server/src/products/util/__tests__/serialize.spec.ts`

Expected: 4 new tests FAIL (current `toSerializable` 가 BigInt 미처리).

### Step 2.4 — 구현

- [ ] **`apps/server/src/products/util/serialize.ts` 에서 `toSerializable` 수정**

```ts
export function toSerializable<T>(v: T): T {
  if (typeof v === 'bigint') {
    // Plan B1 이월 #4: $queryRaw 반환 BigInt 대응
    if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < BigInt(Number.MIN_SAFE_INTEGER)) {
      return v.toString() as unknown as T;
    }
    return Number(v) as unknown as T;
  }
  if (Array.isArray(v)) return v.map(toSerializable) as unknown as T;
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, toSerializable(val)]),
    ) as T;
  }
  return v;
}
```

주의: 기존 Decimal / Date 처리 로직이 있다면 그대로 유지하고 BigInt 분기만 상단에 추가.

### Step 2.5 — 테스트 통과 확인

- [ ] **Run**: `npx vitest run apps/server/src/products/util/__tests__/serialize.spec.ts`

Expected: 전체 PASS (4 신규 + 기존 모두)

### Step 2.6 — Commit

- [ ] **커밋**

```bash
git add apps/server/src/products/util/serialize.ts apps/server/src/products/util/__tests__/serialize.spec.ts
git commit -m "feat(products): toSerializable BigInt guard (Plan B1 #4 followup)

Handle BigInt returned from \$queryRaw. Safe-range values become
Number (precision preserved for Int32-ish domain), unsafe-range
values become String to avoid silent precision loss.

Unblocks Plan B2a InventoryService \$queryRaw row-lock pattern."
```

---

## Task 3: BundleStockService.recomputeForComponent + export

**Files:**
- Modify: `apps/server/src/products/services/bundle-stock.service.ts`
- Create: `apps/server/src/products/services/__tests__/bundle-stock.recompute-for-component.spec.ts`
- Modify: `apps/server/src/products/products.module.ts`
- Modify: `apps/server/src/products/CLAUDE.md`

### Step 3.1 — 실패 테스트 작성

- [ ] **Create `apps/server/src/products/services/__tests__/bundle-stock.recompute-for-component.spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { BundleStockService } from '../bundle-stock.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('BundleStockService.recomputeForComponent', () => {
  let service: BundleStockService;
  let mockTx: any;

  beforeEach(async () => {
    mockTx = {
      bundleComponent: { findMany: vi.fn() },
      productOption: { findMany: vi.fn() },
      $queryRaw: vi.fn(),
    };
    const m = await Test.createTestingModule({
      providers: [BundleStockService, { provide: PrismaService, useValue: {} }],
    }).compile();
    service = m.get(BundleStockService);
  });

  it('no bundles using this component → empty array', async () => {
    mockTx.bundleComponent.findMany.mockResolvedValue([]);
    const result = await service.recomputeForComponent('opt-1', mockTx);
    expect(result).toEqual([]);
    expect(mockTx.bundleComponent.findMany).toHaveBeenCalledWith({
      where: { componentOptionId: 'opt-1', componentOption: { isDeleted: false } },
      select: { bundleOptionId: true },
    });
  });

  it('fan-out calls recompute per bundle', async () => {
    mockTx.bundleComponent.findMany.mockResolvedValue([
      { bundleOptionId: 'bundle-A' },
      { bundleOptionId: 'bundle-B' },
    ]);
    const spy = vi.spyOn(service, 'recompute').mockResolvedValue(undefined as any);

    const result = await service.recomputeForComponent('opt-1', mockTx);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith('bundle-A', mockTx);
    expect(spy).toHaveBeenCalledWith('bundle-B', mockTx);
    expect(result).toEqual(['bundle-A', 'bundle-B']);
  });

  it('soft-deleted componentOption excluded by where clause', async () => {
    // findMany 만 확인 (relation filter 로직은 Prisma 에서)
    mockTx.bundleComponent.findMany.mockResolvedValue([]);
    await service.recomputeForComponent('opt-deleted', mockTx);
    const call = mockTx.bundleComponent.findMany.mock.calls[0][0];
    expect(call.where.componentOption.isDeleted).toBe(false);
  });
});
```

### Step 3.2 — 실패 확인

- [ ] **Run**: `npx vitest run apps/server/src/products/services/__tests__/bundle-stock.recompute-for-component.spec.ts`

Expected: FAIL — "service.recomputeForComponent is not a function"

### Step 3.3 — `recomputeForComponent` 구현

- [ ] **`apps/server/src/products/services/bundle-stock.service.ts` class 에 메서드 추가**

```ts
/**
 * 이 option 을 component 로 쓰는 모든 활성 bundle option 에 대해
 * recompute(bundleOptionId, tx) 를 호출. 반환값은 갱신된 bundle option id 리스트.
 *
 * - BundleComponent 는 hard-delete (isDeleted 필드 없음)
 * - componentOption soft-delete 는 fan-out 에서 제외
 * - nested bundle 금지 (BundleComponentsService.create 차단) → 비재귀 종료 보장
 *
 * ADR-0014: InventoryService 전용. 다른 모듈은 호출 금지.
 */
async recomputeForComponent(
  componentOptionId: string,
  tx: Prisma.TransactionClient,
): Promise<string[]> {
  const components = await tx.bundleComponent.findMany({
    where: {
      componentOptionId,
      componentOption: { isDeleted: false },
    },
    select: { bundleOptionId: true },
  });
  for (const { bundleOptionId } of components) {
    await this.recompute(bundleOptionId, tx);
  }
  return components.map((c) => c.bundleOptionId);
}
```

### Step 3.4 — 테스트 통과 확인

- [ ] **Run**: `npx vitest run apps/server/src/products/services/__tests__/bundle-stock.recompute-for-component.spec.ts`

Expected: 3 PASS.

### Step 3.5 — ProductsModule exports 갱신

- [ ] **`apps/server/src/products/products.module.ts` 의 `exports` 에 `BundleStockService` 추가**

```ts
exports: [MastersService, OptionsService, BundleComponentsService, BundleStockService],
```

(기존 exports 배열에 `BundleStockService` 만 append)

### Step 3.6 — products/CLAUDE.md 갱신

- [ ] **`apps/server/src/products/CLAUDE.md` 의 `Non-export` 섹션 수정**

Before:
```
- **Non-export**: `MasterCodeService`, `BundleStockService`.
```

After:
```
- **Non-export**: `MasterCodeService`.
- **Export (restricted)**: `BundleStockService` — InventoryService 가 `recomputeForComponent` 호출 전용 (ADR-0014 단일-writer invariant). 다른 모듈은 직접 호출 금지.
```

### Step 3.7 — 전체 products test 회귀 확인

- [ ] **Run**: `npx vitest run apps/server/src/products`

Expected: 모든 기존 45+ tests + 신규 3 tests PASS.

### Step 3.8 — Commit

- [ ] **커밋**

```bash
git add apps/server/src/products/services/bundle-stock.service.ts apps/server/src/products/services/__tests__/bundle-stock.recompute-for-component.spec.ts apps/server/src/products/products.module.ts apps/server/src/products/CLAUDE.md
git commit -m "feat(products): BundleStockService.recomputeForComponent + export

Fan-out helper: given a componentOptionId, find all bundle options
using it and call recompute(bundleOptionId, tx) for each. Excludes
soft-deleted componentOptions (BundleComponent itself is hard-delete,
no isDeleted field on it).

Export BundleStockService from ProductsModule — restricted to
InventoryService caller per ADR-0014 single-writer invariant.
Document constraint in products/CLAUDE.md."
```

---

## Task 4: Inventory DTOs

**Files:**
- Create: `apps/server/src/inventory/dto/list-inventory-query.dto.ts`
- Create: `apps/server/src/inventory/dto/update-inventory-metadata.dto.ts`
- Create: `apps/server/src/inventory/dto/receive-stock.dto.ts`
- Create: `apps/server/src/inventory/dto/issue-stock.dto.ts`
- Create: `apps/server/src/inventory/dto/adjust-stock.dto.ts`
- Create: `apps/server/src/inventory/dto/list-transactions-query.dto.ts`
- Create: `apps/server/src/inventory/dto/transaction-summary-query.dto.ts`
- Modify: `apps/server/src/inventory/dto/index.ts`
- Delete: `apps/server/src/inventory/dto/list-stock-movement-query.dto.ts`
- Delete: `apps/server/src/inventory/dto/stock-movement-summary-query.dto.ts`
- Delete: `apps/server/src/inventory/dto/receive-stock-body.dto.ts`

### Step 4.1 — 기존 dto/ 디렉토리 확인

- [ ] **Run**: `ls apps/server/src/inventory/dto/`
- [ ] **Run**: `cat apps/server/src/inventory/dto/index.ts`

### Step 4.2 — `list-inventory-query.dto.ts` 생성

- [ ] **Create with exact content**:

```ts
import { IsOptional, IsInt, Min, Max, IsIn, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import type { InventoryStatus } from '@kiditem/shared';

export class ListInventoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsIn(['healthy', 'low', 'out'])
  status?: InventoryStatus;

  @IsOptional()
  @IsUUID()
  optionId?: string;

  @IsOptional()
  @IsUUID()
  masterId?: string;
}
```

### Step 4.3 — `update-inventory-metadata.dto.ts` 생성

- [ ] **Create**:

```ts
import { IsOptional, IsInt, Min, IsString, MaxLength } from 'class-validator';

export class UpdateInventoryMetadataDto {
  @IsOptional() @IsInt() @Min(0) safetyStock?: number;
  @IsOptional() @IsInt() @Min(0) reorderPoint?: number;
  @IsOptional() @IsInt() @Min(0) reorderQuantity?: number;
  @IsOptional() @IsInt() @Min(0) leadTimeDays?: number | null;
  @IsOptional() @IsString() @MaxLength(100) warehouseLocation?: string | null;
}
```

### Step 4.4 — `receive-stock.dto.ts` 생성

- [ ] **Create**:

```ts
import { IsInt, Min, IsOptional, IsUUID, IsString, MaxLength } from 'class-validator';

export class ReceiveStockDto {
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsInt() @Min(0) unitCost?: number;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
```

### Step 4.5 — `issue-stock.dto.ts` 생성

- [ ] **Create**:

```ts
import { IsInt, Min, IsOptional, IsUUID, IsString, MaxLength } from 'class-validator';

export class IssueStockDto {
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsString() @MaxLength(100) relatedId?: string;
  @IsOptional() @IsString() @MaxLength(50) relatedType?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
```

### Step 4.6 — `adjust-stock.dto.ts` 생성

- [ ] **Create**:

```ts
import { IsInt, NotEquals, IsString, MinLength, MaxLength } from 'class-validator';

export class AdjustStockDto {
  @IsInt() @NotEquals(0) delta!: number;
  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
}
```

### Step 4.7 — `list-transactions-query.dto.ts` 생성

- [ ] **Create**:

```ts
import { IsOptional, IsInt, Min, Max, IsUUID, IsIn, IsISO8601 } from 'class-validator';
import { Type } from 'class-transformer';
import type { StockTransactionType } from '@kiditem/shared';

export class ListTransactionsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @IsUUID() optionId?: string;
  @IsOptional() @IsIn(['RECEIVE', 'ISSUE', 'ADJUST']) type?: StockTransactionType;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
}
```

### Step 4.8 — `transaction-summary-query.dto.ts` 생성

- [ ] **Create**:

```ts
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class TransactionSummaryQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) days?: number;
}
```

### Step 4.9 — 구 DTO 삭제

- [ ] **Run**:
```bash
rm apps/server/src/inventory/dto/list-stock-movement-query.dto.ts \
   apps/server/src/inventory/dto/stock-movement-summary-query.dto.ts \
   apps/server/src/inventory/dto/receive-stock-body.dto.ts
```

### Step 4.10 — `index.ts` 갱신

- [ ] **`apps/server/src/inventory/dto/index.ts` 재작성**

```ts
export * from './list-inventory-query.dto';
export * from './update-inventory-metadata.dto';
export * from './receive-stock.dto';
export * from './issue-stock.dto';
export * from './adjust-stock.dto';
export * from './list-transactions-query.dto';
export * from './transaction-summary-query.dto';
```

(UnshippedQueryDto 등 다른 DTO 가 기존에 있었다면 보존)

### Step 4.11 — tsc 검증 (DTO 파일만)

- [ ] **Run**: `cd apps/server && npx tsc --noEmit 2>&1 | grep -E "inventory/dto" | head`

Expected: 0 lines (DTO 에러 없음. 사용처인 service/controller 는 아직 구 DTO 참조 가능성 있으나 Task 5+ 에서 해결).

### Step 4.12 — Commit

- [ ] **커밋**

```bash
git add apps/server/src/inventory/dto/
git commit -m "feat(inventory): new DTOs for Plan B2a service layer

Add class-validator DTOs aligned with @kiditem/shared Zod input schemas:
- ListInventoryQueryDto
- UpdateInventoryMetadataDto
- Receive/Issue/Adjust StockDto
- ListTransactionsQueryDto, TransactionSummaryQueryDto

Remove legacy DTOs (ListStockMovementQueryDto, StockMovementSummaryQueryDto,
ReceiveStockBodyDto) — replaced by unified Plan B2a surface."
```

---

## Task 5: InventoryService Reads + Metadata

**Files:**
- Rewrite: `apps/server/src/inventory/services/inventory.service.ts` (reads + metadata portion)
- Create: `apps/server/src/inventory/services/__tests__/inventory.service.reads.spec.ts`
- Create: `apps/server/src/inventory/services/__tests__/inventory.service.metadata.spec.ts`

### Step 5.1 — 실패 테스트 (reads)

- [ ] **Create `apps/server/src/inventory/services/__tests__/inventory.service.reads.spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { InventoryService } from '../inventory.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { BundleStockService } from '../../../products/services/bundle-stock.service';

describe('InventoryService — reads', () => {
  let service: InventoryService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      inventory: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
    };
    const m = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: BundleStockService, useValue: {} },
      ],
    }).compile();
    service = m.get(InventoryService);
  });

  describe('list', () => {
    it('returns paged items with summary + derived status', async () => {
      prisma.inventory.findMany.mockResolvedValue([
        {
          id: 'inv-1', optionId: 'opt-1', currentStock: 100, reservedStock: 0,
          safetyStock: 10, reorderPoint: 20, reorderQuantity: 50, leadTimeDays: 14,
          dailySalesAvg: 5, warehouseLocation: 'A-1', lastRestockedAt: null,
          createdAt: new Date(), updatedAt: new Date(), companyId: 'c1',
          option: {
            masterId: 'm1', sku: 'SKU-1', optionName: 'Red', isBundle: false,
            availableStock: null, isDeleted: false,
            master: { masterName: 'Product 1' },
          },
        },
      ]);
      prisma.inventory.count.mockResolvedValue(1);

      const result = await service.list({}, 'c1');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].sku).toBe('SKU-1');
      expect(result.items[0].status).toBe('healthy');
      expect(result.items[0].kind).toBe('SIMPLE');
      expect(result.summary.total).toBe(1);
      expect(result.summary.healthy).toBe(1);
    });

    it('bundle option uses availableStock', async () => {
      prisma.inventory.findMany.mockResolvedValue([
        {
          id: 'inv-b', optionId: 'opt-b', currentStock: 0, reservedStock: 0,
          safetyStock: 0, reorderPoint: 0, reorderQuantity: 0, leadTimeDays: null,
          dailySalesAvg: 0, warehouseLocation: null, lastRestockedAt: null,
          createdAt: new Date(), updatedAt: new Date(), companyId: 'c1',
          option: {
            masterId: 'm1', sku: 'BDL-1', optionName: null, isBundle: true,
            availableStock: 5, isDeleted: false,
            master: { masterName: 'Bundle A' },
          },
        },
      ]);
      prisma.inventory.count.mockResolvedValue(1);

      const result = await service.list({}, 'c1');

      expect(result.items[0].kind).toBe('BUNDLE');
      expect(result.items[0].availableStock).toBe(5);
    });

    it('filters by companyId (IDOR)', async () => {
      prisma.inventory.findMany.mockResolvedValue([]);
      prisma.inventory.count.mockResolvedValue(0);
      await service.list({}, 'c1');
      const call = prisma.inventory.findMany.mock.calls[0][0];
      expect(call.where.companyId).toBe('c1');
    });
  });

  describe('findById', () => {
    it('returns inventory when owned by company', async () => {
      prisma.inventory.findFirst.mockResolvedValue({
        id: 'inv-1', optionId: 'opt-1', companyId: 'c1',
        currentStock: 50, reservedStock: 0, safetyStock: 0, reorderPoint: 0,
        reorderQuantity: 0, leadTimeDays: null, dailySalesAvg: 0,
        warehouseLocation: null, lastRestockedAt: null,
        createdAt: new Date(), updatedAt: new Date(),
      });
      const result = await service.findById('inv-1', 'c1');
      expect(result.id).toBe('inv-1');
      expect(prisma.inventory.findFirst).toHaveBeenCalledWith({
        where: { id: 'inv-1', companyId: 'c1' },
      });
    });

    it('throws NotFoundException for wrong company', async () => {
      prisma.inventory.findFirst.mockResolvedValue(null);
      await expect(service.findById('inv-1', 'c2')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByOptionId', () => {
    it('lookup by option id with company guard', async () => {
      prisma.inventory.findFirst.mockResolvedValue({
        id: 'inv-1', optionId: 'opt-1', companyId: 'c1',
        currentStock: 50, reservedStock: 0, safetyStock: 0, reorderPoint: 0,
        reorderQuantity: 0, leadTimeDays: null, dailySalesAvg: 0,
        warehouseLocation: null, lastRestockedAt: null,
        createdAt: new Date(), updatedAt: new Date(),
      });
      const result = await service.findByOptionId('opt-1', 'c1');
      expect(result.optionId).toBe('opt-1');
      expect(prisma.inventory.findFirst).toHaveBeenCalledWith({
        where: { optionId: 'opt-1', companyId: 'c1' },
      });
    });
  });
});
```

### Step 5.2 — 실패 테스트 (metadata)

- [ ] **Create `apps/server/src/inventory/services/__tests__/inventory.service.metadata.spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { InventoryService } from '../inventory.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { BundleStockService } from '../../../products/services/bundle-stock.service';

describe('InventoryService — metadata update', () => {
  let service: InventoryService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      inventory: { findFirst: vi.fn(), update: vi.fn() },
    };
    const m = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: BundleStockService, useValue: {} },
      ],
    }).compile();
    service = m.get(InventoryService);
  });

  it('updates allowed fields only — currentStock never passed to update', async () => {
    prisma.inventory.findFirst.mockResolvedValue({ id: 'i1', companyId: 'c1' });
    prisma.inventory.update.mockResolvedValue({
      id: 'i1', optionId: 'o1', companyId: 'c1',
      currentStock: 999,  // should be untouched
      reservedStock: 0, safetyStock: 20,
      reorderPoint: 0, reorderQuantity: 0, leadTimeDays: null,
      dailySalesAvg: 0, warehouseLocation: null, lastRestockedAt: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    await service.updateMetadata('i1', { safetyStock: 20 }, 'c1');

    const call = prisma.inventory.update.mock.calls[0][0];
    expect(call.data.currentStock).toBeUndefined();
    expect(call.data.reservedStock).toBeUndefined();
    expect(call.data.safetyStock).toBe(20);
  });

  it('wrong company → NotFound', async () => {
    prisma.inventory.findFirst.mockResolvedValue(null);
    await expect(service.updateMetadata('i1', { safetyStock: 20 }, 'c2'))
      .rejects.toThrow(NotFoundException);
  });
});
```

### Step 5.3 — 실패 확인

- [ ] **Run**:
```bash
npx vitest run apps/server/src/inventory/services/__tests__/inventory.service.reads.spec.ts apps/server/src/inventory/services/__tests__/inventory.service.metadata.spec.ts
```

Expected: 모든 신규 tests FAIL (InventoryService 신규 시그니처 미구현).

### Step 5.4 — InventoryService skeleton 생성 (reads + metadata 만)

- [ ] **Rewrite `apps/server/src/inventory/services/inventory.service.ts`**

```ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BundleStockService } from '../../products/services/bundle-stock.service';
import { toSerializable } from '../../products/util/serialize';
import type {
  Inventory,
  InventoryListItem,
  InventorySummary,
  InventoryListResponse,
  InventoryStatus,
  UpdateInventoryMetadataInput,
} from '@kiditem/shared';
import type { Prisma } from '@prisma/client';
import type {
  ListInventoryQueryDto,
  UpdateInventoryMetadataDto,
} from '../dto';

function deriveStatus(currentStock: number, reorderPoint: number): InventoryStatus {
  if (currentStock <= 0) return 'out';
  if (currentStock <= reorderPoint) return 'low';
  return 'healthy';
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bundleStock: BundleStockService,
  ) {}

  // ===== Reads =====
  async list(query: ListInventoryQueryDto, companyId: string): Promise<InventoryListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Prisma.InventoryWhereInput = { companyId };
    if (query.optionId) where.optionId = query.optionId;
    if (query.masterId) where.option = { masterId: query.masterId };

    const [rows, total] = await Promise.all([
      this.prisma.inventory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          option: {
            include: { master: { select: { masterName: true } } },
          },
        },
      }),
      this.prisma.inventory.count({ where }),
    ]);

    const items = rows.map((r: any) => {
      const availableStock = r.option.isBundle ? (r.option.availableStock ?? 0) : r.currentStock;
      const status = deriveStatus(r.currentStock, r.reorderPoint);
      return {
        id: r.id,
        optionId: r.optionId,
        masterId: r.option.masterId,
        sku: r.option.sku,
        masterName: r.option.master.masterName,
        optionName: r.option.optionName,
        kind: r.option.isBundle ? 'BUNDLE' : 'SIMPLE',
        currentStock: r.currentStock,
        availableStock,
        safetyStock: r.safetyStock,
        reorderPoint: r.reorderPoint,
        leadTimeDays: r.leadTimeDays,
        warehouseLocation: r.warehouseLocation,
        status,
      } satisfies InventoryListItem;
    });

    // status 필터는 in-memory (DB level 불가 — computed)
    const filtered = query.status ? items.filter((i) => i.status === query.status) : items;

    const summary: InventorySummary = {
      total: filtered.length,
      healthy: filtered.filter((i) => i.status === 'healthy').length,
      low: filtered.filter((i) => i.status === 'low').length,
      out: filtered.filter((i) => i.status === 'out').length,
    };

    return {
      items: filtered,
      total,
      page,
      limit,
      summary,
    } satisfies InventoryListResponse;
  }

  async findById(id: string, companyId: string): Promise<Inventory> {
    const inv = await this.prisma.inventory.findFirst({ where: { id, companyId } });
    if (!inv) throw new NotFoundException('Inventory not found');
    return toSerializable(inv) as Inventory;
  }

  async findByOptionId(optionId: string, companyId: string): Promise<Inventory> {
    const inv = await this.prisma.inventory.findFirst({ where: { optionId, companyId } });
    if (!inv) throw new NotFoundException('Inventory not found');
    return toSerializable(inv) as Inventory;
  }

  // ===== Metadata =====
  async updateMetadata(
    id: string,
    dto: UpdateInventoryMetadataInput,
    companyId: string,
  ): Promise<Inventory> {
    const existing = await this.prisma.inventory.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Inventory not found');

    const data: Prisma.InventoryUpdateInput = {};
    if (dto.safetyStock !== undefined) data.safetyStock = dto.safetyStock;
    if (dto.reorderPoint !== undefined) data.reorderPoint = dto.reorderPoint;
    if (dto.reorderQuantity !== undefined) data.reorderQuantity = dto.reorderQuantity;
    if (dto.leadTimeDays !== undefined) data.leadTimeDays = dto.leadTimeDays;
    if (dto.warehouseLocation !== undefined) data.warehouseLocation = dto.warehouseLocation;

    const updated = await this.prisma.inventory.update({
      where: { id },
      data,
    });
    return toSerializable(updated) as Inventory;
  }

  // ===== Mutations placeholder — 다음 task =====
  // ===== Ledger placeholder — 다음 task =====
}
```

### Step 5.5 — 테스트 통과 확인

- [ ] **Run**:
```bash
npx vitest run apps/server/src/inventory/services/__tests__/inventory.service.reads.spec.ts apps/server/src/inventory/services/__tests__/inventory.service.metadata.spec.ts
```

Expected: 모든 tests PASS.

### Step 5.6 — Commit

- [ ] **커밋**

```bash
git add apps/server/src/inventory/services/inventory.service.ts apps/server/src/inventory/services/__tests__/inventory.service.reads.spec.ts apps/server/src/inventory/services/__tests__/inventory.service.metadata.spec.ts
git commit -m "feat(inventory): InventoryService reads + metadata

Rewrite InventoryService for Plan A 3-layer schema:
- list: joins Option + Master, derives kind/status/availableStock
- findById/findByOptionId: companyId IDOR guard
- updateMetadata: rejects currentStock/reservedStock mutations by field allowlist

Mutation + ledger methods pending (Tasks 6-8)."
```

---

## Task 6: InventoryService Mutation Entry Point — receive + applyDelta

**Files:**
- Modify: `apps/server/src/inventory/services/inventory.service.ts` (append applyDelta + receive)
- Create: `apps/server/src/inventory/services/__tests__/inventory.service.receive.spec.ts`

### Step 6.1 — 실패 테스트

- [ ] **Create `apps/server/src/inventory/services/__tests__/inventory.service.receive.spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { InventoryService } from '../inventory.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { BundleStockService } from '../../../products/services/bundle-stock.service';

describe('InventoryService.receive', () => {
  let service: InventoryService;
  let prisma: any;
  let bundleStock: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      $queryRaw: vi.fn(),
      inventory: { findFirst: vi.fn(), update: vi.fn() },
      productOption: { findUnique: vi.fn() },
      stockTransaction: { create: vi.fn() },
    };
    prisma = {
      $transaction: vi.fn(async (cb: any) => cb(tx)),
    };
    bundleStock = {
      recomputeForComponent: vi.fn().mockResolvedValue([]),
    };
    const m = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: BundleStockService, useValue: bundleStock },
      ],
    }).compile();
    service = m.get(InventoryService);
  });

  it('atomic sequence: lock → update → ledger → fan-out', async () => {
    tx.inventory.findFirst.mockResolvedValue({
      id: 'i1', companyId: 'c1', optionId: 'o1', currentStock: 10, reservedStock: 0,
      lastRestockedAt: null,
    });
    tx.inventory.update.mockResolvedValue({
      id: 'i1', companyId: 'c1', optionId: 'o1', currentStock: 15, reservedStock: 0,
      safetyStock: 0, reorderPoint: 0, reorderQuantity: 0, leadTimeDays: null,
      dailySalesAvg: 0, warehouseLocation: null, lastRestockedAt: new Date(),
      createdAt: new Date(), updatedAt: new Date(),
    });
    tx.productOption.findUnique.mockResolvedValue({ optionName: 'Red' });
    tx.stockTransaction.create.mockResolvedValue({
      id: 'tx1', optionId: 'o1', type: 'RECEIVE', quantity: 5, unitCost: 100,
      createdAt: new Date(),
    });
    bundleStock.recomputeForComponent.mockResolvedValue(['bundle-A']);

    const result = await service.receive('i1', { quantity: 5, unitCost: 100 }, 'c1', 'user-1');

    // row lock acquired first
    expect(tx.$queryRaw).toHaveBeenCalled();
    // IDOR guard
    expect(tx.inventory.findFirst).toHaveBeenCalledWith({ where: { id: 'i1', companyId: 'c1' } });
    // update uses increment
    expect(tx.inventory.update.mock.calls[0][0].data.currentStock).toEqual({ increment: 5 });
    // ledger entry created
    expect(tx.stockTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'c1', optionId: 'o1', type: 'RECEIVE',
        quantity: 5, unitCost: 100, totalCost: 500,
        optionName: 'Red', createdBy: 'user-1',
      }),
    });
    // fan-out invoked
    expect(bundleStock.recomputeForComponent).toHaveBeenCalledWith('o1', tx);
    // result shape
    expect(result.inventory.currentStock).toBe(15);
    expect(result.transaction.type).toBe('RECEIVE');
    expect(result.recomputedBundleOptionIds).toEqual(['bundle-A']);
  });

  it('wrong company → NotFound, no mutation', async () => {
    tx.inventory.findFirst.mockResolvedValue(null);
    await expect(service.receive('i1', { quantity: 5 }, 'c2', 'user-1'))
      .rejects.toThrow(NotFoundException);
    expect(tx.inventory.update).not.toHaveBeenCalled();
    expect(tx.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('unitCost defaults to 0', async () => {
    tx.inventory.findFirst.mockResolvedValue({ id: 'i1', companyId: 'c1', optionId: 'o1', currentStock: 10, reservedStock: 0, lastRestockedAt: null });
    tx.inventory.update.mockResolvedValue({ id: 'i1', optionId: 'o1', companyId: 'c1', currentStock: 15, reservedStock: 0, safetyStock: 0, reorderPoint: 0, reorderQuantity: 0, leadTimeDays: null, dailySalesAvg: 0, warehouseLocation: null, lastRestockedAt: new Date(), createdAt: new Date(), updatedAt: new Date() });
    tx.productOption.findUnique.mockResolvedValue({ optionName: null });
    tx.stockTransaction.create.mockResolvedValue({ id: 'tx1', optionId: 'o1', type: 'RECEIVE', quantity: 5, unitCost: 0, createdAt: new Date() });

    await service.receive('i1', { quantity: 5 }, 'c1', 'user-1');
    const txCall = tx.stockTransaction.create.mock.calls[0][0];
    expect(txCall.data.unitCost).toBe(0);
    expect(txCall.data.totalCost).toBe(0);
  });
});
```

### Step 6.2 — 실패 확인

- [ ] **Run**: `npx vitest run apps/server/src/inventory/services/__tests__/inventory.service.receive.spec.ts`

Expected: FAIL — "service.receive is not a function"

### Step 6.3 — `applyDelta` + `receive` 구현

- [ ] **`inventory.service.ts` class 에 메서드 추가** (기존 skeleton 의 "Mutations placeholder" 주석 아래)

```ts
  async receive(
    id: string,
    dto: ReceiveStockInput,
    companyId: string,
    userId: string,
  ) {
    return this.applyDelta(id, dto.quantity, {
      type: 'RECEIVE',
      unitCost: dto.unitCost ?? 0,
      warehouseId: dto.warehouseId,
      note: dto.note,
      userId,
    }, companyId);
  }

  private async applyDelta(
    id: string,
    delta: number,
    txParams: {
      type: 'RECEIVE' | 'ISSUE' | 'ADJUST';
      unitCost: number;
      warehouseId?: string;
      relatedId?: string;
      relatedType?: string;
      note?: string;
      userId: string;
    },
    companyId: string,
  ): Promise<StockOperationResult> {
    return this.prisma.$transaction(async (tx) => {
      // 1) row lock
      await tx.$queryRaw`SELECT id FROM inventory WHERE id = ${id}::uuid FOR UPDATE`;

      // 2) read + IDOR guard
      const inv = await tx.inventory.findFirst({ where: { id, companyId } });
      if (!inv) throw new NotFoundException('Inventory not found');

      // 3) bounds check
      const nextStock = inv.currentStock + delta;
      if (nextStock < 0) {
        throw new BadRequestException(
          `insufficient stock (current=${inv.currentStock}, delta=${delta})`,
        );
      }

      // 4) mutate + ledger
      const updated = await tx.inventory.update({
        where: { id },
        data: {
          currentStock: { increment: delta },
          lastRestockedAt: txParams.type === 'RECEIVE' ? new Date() : inv.lastRestockedAt,
        },
      });

      const option = await tx.productOption.findUnique({
        where: { id: updated.optionId },
        select: { optionName: true },
      });

      const transaction = await tx.stockTransaction.create({
        data: {
          companyId,
          optionId: updated.optionId,
          optionName: option?.optionName ?? null,
          type: txParams.type,
          quantity: Math.abs(delta),
          unitCost: txParams.unitCost,
          totalCost: txParams.unitCost * Math.abs(delta),
          warehouseId: txParams.warehouseId,
          relatedId: txParams.relatedId,
          relatedType: txParams.relatedType,
          note: txParams.note,
          createdBy: txParams.userId,
        },
      });

      // 5) bundle fan-out
      const recomputedBundleOptionIds = await this.bundleStock.recomputeForComponent(
        updated.optionId,
        tx,
      );

      return {
        inventory: toSerializable(updated) as Inventory,
        transaction: {
          id: transaction.id,
          optionId: transaction.optionId,
          type: transaction.type as any,
          quantity: transaction.quantity,
          unitCost: transaction.unitCost,
          createdAt: transaction.createdAt.toISOString(),
        },
        recomputedBundleOptionIds,
      } satisfies StockOperationResult;
    }, { timeout: 15_000 });
  }
```

Imports 에 `ReceiveStockInput`, `StockOperationResult` 추가.

### Step 6.4 — 테스트 통과 확인

- [ ] **Run**: `npx vitest run apps/server/src/inventory/services/__tests__/inventory.service.receive.spec.ts`

Expected: 3 PASS.

### Step 6.5 — Commit

- [ ] **커밋**

```bash
git add apps/server/src/inventory/services/inventory.service.ts apps/server/src/inventory/services/__tests__/inventory.service.receive.spec.ts
git commit -m "feat(inventory): InventoryService.receive + private applyDelta

Atomic stock mutation sequence:
1. SELECT FOR UPDATE row lock on inventory
2. findFirst + companyId IDOR guard
3. bounds check (nextStock >= 0)
4. inventory.update + stockTransaction.create with createdBy
5. BundleStockService.recomputeForComponent fan-out

timeout: 15s covers worst-case fan-out breadth. ADR-0014 single-writer."
```

---

## Task 7: InventoryService issue + adjust

**Files:**
- Modify: `apps/server/src/inventory/services/inventory.service.ts` (append issue + adjust)
- Create: `apps/server/src/inventory/services/__tests__/inventory.service.issue.spec.ts`
- Create: `apps/server/src/inventory/services/__tests__/inventory.service.adjust.spec.ts`

### Step 7.1 — issue 실패 테스트

- [ ] **Create `apps/server/src/inventory/services/__tests__/inventory.service.issue.spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InventoryService } from '../inventory.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { BundleStockService } from '../../../products/services/bundle-stock.service';

describe('InventoryService.issue', () => {
  let service: InventoryService;
  let prisma: any;
  let tx: any;
  let bundleStock: any;

  beforeEach(async () => {
    tx = {
      $queryRaw: vi.fn(),
      inventory: { findFirst: vi.fn(), update: vi.fn() },
      productOption: { findUnique: vi.fn().mockResolvedValue({ optionName: null }) },
      stockTransaction: { create: vi.fn().mockResolvedValue({
        id: 't1', optionId: 'o1', type: 'ISSUE', quantity: 3, unitCost: 0, createdAt: new Date(),
      })},
    };
    prisma = { $transaction: vi.fn(async (cb: any) => cb(tx)) };
    bundleStock = { recomputeForComponent: vi.fn().mockResolvedValue([]) };
    const m = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: BundleStockService, useValue: bundleStock },
      ],
    }).compile();
    service = m.get(InventoryService);
  });

  it('decrements currentStock by quantity', async () => {
    tx.inventory.findFirst.mockResolvedValue({ id: 'i1', companyId: 'c1', optionId: 'o1', currentStock: 10, reservedStock: 0, lastRestockedAt: null });
    tx.inventory.update.mockResolvedValue({ id: 'i1', optionId: 'o1', companyId: 'c1', currentStock: 7, reservedStock: 0, safetyStock: 0, reorderPoint: 0, reorderQuantity: 0, leadTimeDays: null, dailySalesAvg: 0, warehouseLocation: null, lastRestockedAt: null, createdAt: new Date(), updatedAt: new Date() });

    await service.issue('i1', { quantity: 3, relatedId: 'order-1', relatedType: 'Order' }, 'c1', 'user-1');

    expect(tx.inventory.update.mock.calls[0][0].data.currentStock).toEqual({ increment: -3 });
    const txData = tx.stockTransaction.create.mock.calls[0][0].data;
    expect(txData.type).toBe('ISSUE');
    expect(txData.quantity).toBe(3);
    expect(txData.relatedId).toBe('order-1');
    expect(txData.relatedType).toBe('Order');
  });

  it('insufficient stock → BadRequest, rollback', async () => {
    tx.inventory.findFirst.mockResolvedValue({ id: 'i1', companyId: 'c1', optionId: 'o1', currentStock: 2, reservedStock: 0, lastRestockedAt: null });
    await expect(service.issue('i1', { quantity: 5 }, 'c1', 'user-1')).rejects.toThrow(BadRequestException);
    expect(tx.inventory.update).not.toHaveBeenCalled();
    expect(tx.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('does not bump lastRestockedAt', async () => {
    const existingDate = new Date('2024-01-01T00:00:00Z');
    tx.inventory.findFirst.mockResolvedValue({ id: 'i1', companyId: 'c1', optionId: 'o1', currentStock: 10, reservedStock: 0, lastRestockedAt: existingDate });
    tx.inventory.update.mockResolvedValue({ id: 'i1', optionId: 'o1', companyId: 'c1', currentStock: 7, reservedStock: 0, safetyStock: 0, reorderPoint: 0, reorderQuantity: 0, leadTimeDays: null, dailySalesAvg: 0, warehouseLocation: null, lastRestockedAt: existingDate, createdAt: new Date(), updatedAt: new Date() });

    await service.issue('i1', { quantity: 3 }, 'c1', 'user-1');

    expect(tx.inventory.update.mock.calls[0][0].data.lastRestockedAt).toBe(existingDate);
  });
});
```

### Step 7.2 — adjust 실패 테스트

- [ ] **Create `apps/server/src/inventory/services/__tests__/inventory.service.adjust.spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { InventoryService } from '../inventory.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { BundleStockService } from '../../../products/services/bundle-stock.service';

describe('InventoryService.adjust', () => {
  let service: InventoryService;
  let tx: any;

  beforeEach(async () => {
    tx = {
      $queryRaw: vi.fn(),
      inventory: { findFirst: vi.fn(), update: vi.fn() },
      productOption: { findUnique: vi.fn().mockResolvedValue({ optionName: null }) },
      stockTransaction: { create: vi.fn().mockResolvedValue({
        id: 't1', optionId: 'o1', type: 'ADJUST', quantity: 4, unitCost: 0, createdAt: new Date(),
      })},
    };
    const prisma = { $transaction: vi.fn(async (cb: any) => cb(tx)) };
    const bundleStock = { recomputeForComponent: vi.fn().mockResolvedValue([]) };
    const m = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: BundleStockService, useValue: bundleStock },
      ],
    }).compile();
    service = m.get(InventoryService);
  });

  it('positive delta increments', async () => {
    tx.inventory.findFirst.mockResolvedValue({ id: 'i1', companyId: 'c1', optionId: 'o1', currentStock: 10, reservedStock: 0, lastRestockedAt: null });
    tx.inventory.update.mockResolvedValue({ id: 'i1', optionId: 'o1', companyId: 'c1', currentStock: 14, reservedStock: 0, safetyStock: 0, reorderPoint: 0, reorderQuantity: 0, leadTimeDays: null, dailySalesAvg: 0, warehouseLocation: null, lastRestockedAt: null, createdAt: new Date(), updatedAt: new Date() });

    await service.adjust('i1', { delta: 4, reason: 'recount' }, 'c1', 'user-1');

    expect(tx.inventory.update.mock.calls[0][0].data.currentStock).toEqual({ increment: 4 });
    const txData = tx.stockTransaction.create.mock.calls[0][0].data;
    expect(txData.type).toBe('ADJUST');
    expect(txData.quantity).toBe(4);   // absolute
    expect(txData.note).toBe('recount');
  });

  it('negative delta decrements with bounds check', async () => {
    tx.inventory.findFirst.mockResolvedValue({ id: 'i1', companyId: 'c1', optionId: 'o1', currentStock: 10, reservedStock: 0, lastRestockedAt: null });
    tx.inventory.update.mockResolvedValue({ id: 'i1', optionId: 'o1', companyId: 'c1', currentStock: 6, reservedStock: 0, safetyStock: 0, reorderPoint: 0, reorderQuantity: 0, leadTimeDays: null, dailySalesAvg: 0, warehouseLocation: null, lastRestockedAt: null, createdAt: new Date(), updatedAt: new Date() });

    await service.adjust('i1', { delta: -4, reason: 'shrinkage' }, 'c1', 'user-1');
    expect(tx.inventory.update.mock.calls[0][0].data.currentStock).toEqual({ increment: -4 });
    expect(tx.stockTransaction.create.mock.calls[0][0].data.quantity).toBe(4);
  });

  it('negative delta exceeding stock → BadRequest', async () => {
    tx.inventory.findFirst.mockResolvedValue({ id: 'i1', companyId: 'c1', optionId: 'o1', currentStock: 3, reservedStock: 0, lastRestockedAt: null });
    await expect(service.adjust('i1', { delta: -5, reason: 'shrinkage' }, 'c1', 'user-1'))
      .rejects.toThrow(BadRequestException);
  });
});
```

### Step 7.3 — 실패 확인

- [ ] **Run**:
```bash
npx vitest run apps/server/src/inventory/services/__tests__/inventory.service.issue.spec.ts apps/server/src/inventory/services/__tests__/inventory.service.adjust.spec.ts
```

Expected: FAIL.

### Step 7.4 — issue + adjust 구현

- [ ] **`inventory.service.ts` 에 메서드 추가**

```ts
  async issue(
    id: string,
    dto: IssueStockInput,
    companyId: string,
    userId: string,
  ) {
    return this.applyDelta(id, -dto.quantity, {
      type: 'ISSUE',
      unitCost: 0,
      warehouseId: dto.warehouseId,
      relatedId: dto.relatedId,
      relatedType: dto.relatedType,
      note: dto.note,
      userId,
    }, companyId);
  }

  async adjust(
    id: string,
    dto: AdjustStockInput,
    companyId: string,
    userId: string,
  ) {
    return this.applyDelta(id, dto.delta, {
      type: 'ADJUST',
      unitCost: 0,
      note: dto.reason,
      userId,
    }, companyId);
  }
```

Imports 에 `IssueStockInput`, `AdjustStockInput` 추가.

### Step 7.5 — 테스트 통과 확인

- [ ] **Run**:
```bash
npx vitest run apps/server/src/inventory/services/__tests__/inventory.service.issue.spec.ts apps/server/src/inventory/services/__tests__/inventory.service.adjust.spec.ts
```

Expected: 6 PASS.

### Step 7.6 — Commit

- [ ] **커밋**

```bash
git add apps/server/src/inventory/services/inventory.service.ts apps/server/src/inventory/services/__tests__/inventory.service.issue.spec.ts apps/server/src/inventory/services/__tests__/inventory.service.adjust.spec.ts
git commit -m "feat(inventory): InventoryService.issue + adjust

Reuse applyDelta with:
- issue: delta = -quantity, type=ISSUE
- adjust: delta = dto.delta (any sign), type=ADJUST, note=reason

Both respect bounds check (nextStock >= 0) and fan-out to bundles."
```

---

## Task 8: InventoryService Ledger Reads

**Files:**
- Modify: `apps/server/src/inventory/services/inventory.service.ts` (append listTransactions + getTransactionSummary)
- Create: `apps/server/src/inventory/services/__tests__/inventory.service.ledger.spec.ts`

### Step 8.1 — 실패 테스트

- [ ] **Create `apps/server/src/inventory/services/__tests__/inventory.service.ledger.spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { InventoryService } from '../inventory.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { BundleStockService } from '../../../products/services/bundle-stock.service';

describe('InventoryService — ledger reads', () => {
  let service: InventoryService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      stockTransaction: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
    };
    const m = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: BundleStockService, useValue: {} },
      ],
    }).compile();
    service = m.get(InventoryService);
  });

  describe('listTransactions', () => {
    it('applies companyId + filters + pagination', async () => {
      prisma.stockTransaction.findMany.mockResolvedValue([
        { id: 't1', optionId: 'o1', optionName: 'R', type: 'RECEIVE', quantity: 5, unitCost: 100, totalCost: 500, warehouseId: null, relatedId: null, relatedType: null, note: null, createdBy: 'u1', createdAt: new Date() },
      ]);
      prisma.stockTransaction.count.mockResolvedValue(1);

      const result = await service.listTransactions({ optionId: 'o1', type: 'RECEIVE', page: 1, limit: 50 }, 'c1');

      expect(result.items).toHaveLength(1);
      const call = prisma.stockTransaction.findMany.mock.calls[0][0];
      expect(call.where.companyId).toBe('c1');
      expect(call.where.optionId).toBe('o1');
      expect(call.where.type).toBe('RECEIVE');
    });

    it('date range filter', async () => {
      prisma.stockTransaction.findMany.mockResolvedValue([]);
      prisma.stockTransaction.count.mockResolvedValue(0);
      await service.listTransactions({ from: '2024-01-01', to: '2024-12-31' }, 'c1');
      const call = prisma.stockTransaction.findMany.mock.calls[0][0];
      expect(call.where.createdAt.gte).toEqual(new Date('2024-01-01'));
      expect(call.where.createdAt.lte).toEqual(new Date('2024-12-31'));
    });
  });

  describe('getTransactionSummary', () => {
    it('returns aggregated in/out/adjust with days default', async () => {
      prisma.stockTransaction.groupBy.mockResolvedValue([
        { type: 'RECEIVE', _sum: { quantity: 100, totalCost: 10000 } },
        { type: 'ISSUE', _sum: { quantity: 30, totalCost: 3000 } },
        { type: 'ADJUST', _sum: { quantity: 5, totalCost: 0 } },
      ]);

      const result = await service.getTransactionSummary({ days: 30 }, 'c1');

      expect(result.inQty).toBe(100);
      expect(result.outQty).toBe(30);
      expect(result.adjustQty).toBe(5);
      expect(result.inAmount).toBe(10000);
      expect(result.outAmount).toBe(3000);
    });
  });
});
```

### Step 8.2 — 실패 확인

- [ ] **Run**: `npx vitest run apps/server/src/inventory/services/__tests__/inventory.service.ledger.spec.ts`

Expected: FAIL.

### Step 8.3 — 구현

- [ ] **`inventory.service.ts` 에 메서드 추가**

```ts
  async listTransactions(
    query: ListTransactionsQueryDto,
    companyId: string,
  ): Promise<TransactionListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Prisma.StockTransactionWhereInput = { companyId };
    if (query.optionId) where.optionId = query.optionId;
    if (query.type) where.type = query.type;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const [rows, total] = await Promise.all([
      this.prisma.stockTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockTransaction.count({ where }),
    ]);

    const items = rows.map((r) => ({
      id: r.id,
      optionId: r.optionId,
      optionName: r.optionName,
      type: r.type as StockTransactionType,
      quantity: r.quantity,
      unitCost: r.unitCost,
      totalCost: r.totalCost,
      warehouseId: r.warehouseId,
      relatedId: r.relatedId,
      relatedType: r.relatedType,
      note: r.note,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
    } satisfies TransactionListItem));

    return { items, total, page, limit } satisfies TransactionListResponse;
  }

  async getTransactionSummary(
    query: TransactionSummaryQueryDto,
    companyId: string,
  ): Promise<TransactionSummary> {
    const days = query.days ?? 30;
    const from = new Date(Date.now() - days * 86400000);

    const grouped = await this.prisma.stockTransaction.groupBy({
      by: ['type'],
      where: { companyId, createdAt: { gte: from } },
      _sum: { quantity: true, totalCost: true },
    });

    const lookup = Object.fromEntries(
      grouped.map((g: any) => [g.type, { qty: g._sum.quantity ?? 0, amt: g._sum.totalCost ?? 0 }]),
    );

    return {
      inQty: lookup.RECEIVE?.qty ?? 0,
      outQty: lookup.ISSUE?.qty ?? 0,
      adjustQty: lookup.ADJUST?.qty ?? 0,
      inAmount: lookup.RECEIVE?.amt ?? 0,
      outAmount: lookup.ISSUE?.amt ?? 0,
    } satisfies TransactionSummary;
  }
```

Imports 에 `ListTransactionsQueryDto`, `TransactionSummaryQueryDto`, `TransactionListResponse`, `TransactionListItem`, `TransactionSummary`, `StockTransactionType` 추가.

### Step 8.4 — 테스트 통과 확인

- [ ] **Run**: `npx vitest run apps/server/src/inventory/services/__tests__/inventory.service.ledger.spec.ts`

Expected: 3 PASS.

### Step 8.5 — 전체 InventoryService test 회귀

- [ ] **Run**: `npx vitest run apps/server/src/inventory/services/__tests__/`

Expected: 모든 spec PASS (reads, metadata, receive, issue, adjust, ledger).

### Step 8.6 — Commit

- [ ] **커밋**

```bash
git add apps/server/src/inventory/services/inventory.service.ts apps/server/src/inventory/services/__tests__/inventory.service.ledger.spec.ts
git commit -m "feat(inventory): listTransactions + getTransactionSummary

Ledger queries on StockTransaction (read-side of the append-only
ledger):
- listTransactions: paginated, filter by optionId/type/date range
- getTransactionSummary: groupBy type over last N days, returns
  inQty/outQty/adjustQty/inAmount/outAmount

Completes Plan B2a InventoryService rewrite. Controller + module
wiring pending."
```

---

## Task 9: InventoryController Rewrite + E2E Tests

**Files:**
- Rewrite: `apps/server/src/inventory/controllers/inventory.controller.ts`
- Create: `apps/server/src/inventory/controllers/__tests__/inventory.controller.e2e.spec.ts`

### Step 9.1 — 실패 E2E 테스트

- [ ] **Create `apps/server/src/inventory/controllers/__tests__/inventory.controller.e2e.spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { InventoryController } from '../inventory.controller';
import { InventoryService } from '../../services/inventory.service';
import { CurrentCompany } from '../../../auth/decorators/current-company.decorator';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';

// Mock @CurrentCompany / @CurrentUser via overridden decorator factory (infra pattern from Plan B1)
// Actual impl: use TestingModule overrideProvider + global param decorator mock request.

describe('InventoryController (e2e)', () => {
  let app: INestApplication;
  let mockService: any;

  beforeAll(async () => {
    mockService = {
      list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 50, summary: { total: 0, healthy: 0, low: 0, out: 0 } }),
      findById: vi.fn().mockResolvedValue({ id: 'i1' }),
      findByOptionId: vi.fn().mockResolvedValue({ id: 'i1', optionId: 'o1' }),
      updateMetadata: vi.fn().mockResolvedValue({ id: 'i1' }),
      receive: vi.fn().mockResolvedValue({ inventory: { id: 'i1', currentStock: 15 }, transaction: {}, recomputedBundleOptionIds: [] }),
      issue: vi.fn().mockResolvedValue({ inventory: { id: 'i1' }, transaction: {}, recomputedBundleOptionIds: [] }),
      adjust: vi.fn().mockResolvedValue({ inventory: { id: 'i1' }, transaction: {}, recomputedBundleOptionIds: [] }),
      listTransactions: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 }),
      getTransactionSummary: vi.fn().mockResolvedValue({ inQty: 0, outQty: 0, adjustQty: 0, inAmount: 0, outAmount: 0 }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [{ provide: InventoryService, useValue: mockService }],
    }).compile();

    app = moduleRef.createNestApplication();
    // Simulate @CurrentCompany / @CurrentUser resolution via request augment middleware
    app.use((req: any, _res: any, next: any) => {
      req.companyId = 'test-company';
      req.user = { id: 'test-user' };
      next();
    });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('GET /inventory → list', async () => {
    await request(app.getHttpServer()).get('/inventory').expect(200);
    expect(mockService.list).toHaveBeenCalled();
  });

  it('GET /inventory/transactions → listTransactions (정적 경로 우선)', async () => {
    await request(app.getHttpServer()).get('/inventory/transactions').expect(200);
    expect(mockService.listTransactions).toHaveBeenCalled();
    expect(mockService.findById).not.toHaveBeenCalled();
  });

  it('GET /inventory/transactions/summary', async () => {
    await request(app.getHttpServer()).get('/inventory/transactions/summary').expect(200);
    expect(mockService.getTransactionSummary).toHaveBeenCalled();
  });

  it('GET /inventory/option/:optionId', async () => {
    await request(app.getHttpServer()).get('/inventory/option/550e8400-e29b-41d4-a716-446655440000').expect(200);
    expect(mockService.findByOptionId).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000', 'test-company');
  });

  it('GET /inventory/:id', async () => {
    await request(app.getHttpServer()).get('/inventory/550e8400-e29b-41d4-a716-446655440001').expect(200);
    expect(mockService.findById).toHaveBeenCalled();
  });

  it('PATCH /inventory/:id → metadata update', async () => {
    await request(app.getHttpServer())
      .patch('/inventory/i1')
      .send({ safetyStock: 20 })
      .expect(200);
    expect(mockService.updateMetadata).toHaveBeenCalledWith('i1', { safetyStock: 20 }, 'test-company');
  });

  it('POST /inventory/:id/receive', async () => {
    await request(app.getHttpServer())
      .post('/inventory/i1/receive')
      .send({ quantity: 5, unitCost: 100 })
      .expect(201);
    expect(mockService.receive).toHaveBeenCalledWith('i1', { quantity: 5, unitCost: 100 }, 'test-company', 'test-user');
  });

  it('POST /inventory/:id/issue', async () => {
    await request(app.getHttpServer())
      .post('/inventory/i1/issue')
      .send({ quantity: 3 })
      .expect(201);
    expect(mockService.issue).toHaveBeenCalled();
  });

  it('POST /inventory/:id/adjust', async () => {
    await request(app.getHttpServer())
      .post('/inventory/i1/adjust')
      .send({ delta: -2, reason: 'shrinkage' })
      .expect(201);
    expect(mockService.adjust).toHaveBeenCalled();
  });

  it('POST /inventory/:id/receive with invalid body → 400', async () => {
    await request(app.getHttpServer())
      .post('/inventory/i1/receive')
      .send({ quantity: -1 })  // violates @Min(1)
      .expect(400);
  });

  it('POST /inventory/:id/adjust with delta=0 → 400', async () => {
    await request(app.getHttpServer())
      .post('/inventory/i1/adjust')
      .send({ delta: 0, reason: 'test' })
      .expect(400);
  });
});
```

### Step 9.2 — 실패 확인

- [ ] **Run**: `npx vitest run apps/server/src/inventory/controllers/__tests__/inventory.controller.e2e.spec.ts`

Expected: 전부 FAIL (controller 새 시그니처 미구현).

### Step 9.3 — Controller 재작성

- [ ] **Rewrite `apps/server/src/inventory/controllers/inventory.controller.ts`**

```ts
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { InventoryService } from '../services/inventory.service';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/types/auth-user';
import {
  ListInventoryQueryDto,
  UpdateInventoryMetadataDto,
  ReceiveStockDto,
  IssueStockDto,
  AdjustStockDto,
  ListTransactionsQueryDto,
  TransactionSummaryQueryDto,
} from '../dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // 정적 경로가 :id 보다 먼저 (NestJS route matching order)
  @Get()
  list(@CurrentCompany() companyId: string, @Query() query: ListInventoryQueryDto) {
    return this.inventoryService.list(query, companyId);
  }

  @Get('transactions')
  listTransactions(
    @CurrentCompany() companyId: string,
    @Query() query: ListTransactionsQueryDto,
  ) {
    return this.inventoryService.listTransactions(query, companyId);
  }

  @Get('transactions/summary')
  transactionSummary(
    @CurrentCompany() companyId: string,
    @Query() query: TransactionSummaryQueryDto,
  ) {
    return this.inventoryService.getTransactionSummary(query, companyId);
  }

  @Get('option/:optionId')
  findByOptionId(
    @CurrentCompany() companyId: string,
    @Param('optionId') optionId: string,
  ) {
    return this.inventoryService.findByOptionId(optionId, companyId);
  }

  @Get(':id')
  findById(@CurrentCompany() companyId: string, @Param('id') id: string) {
    return this.inventoryService.findById(id, companyId);
  }

  @Patch(':id')
  updateMetadata(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateInventoryMetadataDto,
  ) {
    return this.inventoryService.updateMetadata(id, dto, companyId);
  }

  @Post(':id/receive')
  receive(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReceiveStockDto,
  ) {
    return this.inventoryService.receive(id, dto, companyId, user.id);
  }

  @Post(':id/issue')
  issue(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: IssueStockDto,
  ) {
    return this.inventoryService.issue(id, dto, companyId, user.id);
  }

  @Post(':id/adjust')
  adjust(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.inventoryService.adjust(id, dto, companyId, user.id);
  }
}
```

### Step 9.4 — 테스트 통과 확인

- [ ] **Run**: `npx vitest run apps/server/src/inventory/controllers/__tests__/inventory.controller.e2e.spec.ts`

Expected: 11 PASS (route matching, DTO validation, @CurrentCompany + @CurrentUser 주입).

### Step 9.5 — Commit

- [ ] **커밋**

```bash
git add apps/server/src/inventory/controllers/inventory.controller.ts apps/server/src/inventory/controllers/__tests__/inventory.controller.e2e.spec.ts
git commit -m "feat(inventory): InventoryController with semantic endpoints

10 endpoints:
- GET /inventory (list)
- GET /inventory/transactions (ledger list)
- GET /inventory/transactions/summary
- GET /inventory/option/:optionId
- GET /inventory/:id
- PATCH /inventory/:id (metadata)
- POST /inventory/:id/receive / issue / adjust

Route definition order: static paths before :id (NestJS matching).
@CurrentCompany() on all handlers, @CurrentUser() on mutations."
```

---

## Task 10: InventoryModule Cleanup

**Files:**
- Modify: `apps/server/src/inventory/inventory.module.ts`
- Delete: `apps/server/src/inventory/services/stock-movement.service.ts`
- Delete: `apps/server/src/inventory/controllers/stock-movement.controller.ts`

### Step 10.1 — 기존 module 확인

- [ ] **Run**: `cat apps/server/src/inventory/inventory.module.ts`

### Step 10.2 — Module 재작성

- [ ] **`apps/server/src/inventory/inventory.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';
import { InventoryController } from './controllers/inventory.controller';
import { UnshippedController } from './controllers/unshipped.controller';
import { InventoryService } from './services/inventory.service';
import { UnshippedService } from './services/unshipped.service';

@Module({
  imports: [PrismaModule, ProductsModule],
  controllers: [InventoryController, UnshippedController],
  providers: [InventoryService, UnshippedService],
  exports: [InventoryService],
})
export class InventoryModule {}
```

### Step 10.3 — 구 service/controller 삭제

- [ ] **Run**:
```bash
rm apps/server/src/inventory/services/stock-movement.service.ts \
   apps/server/src/inventory/controllers/stock-movement.controller.ts
```

### Step 10.4 — Module load test

- [ ] **Run**: `npx vitest run apps/server/src/inventory`

Expected: 모든 spec PASS. Module compile error 없음.

### Step 10.5 — Commit

- [ ] **커밋**

```bash
git add apps/server/src/inventory/inventory.module.ts
git add -u apps/server/src/inventory/services/stock-movement.service.ts apps/server/src/inventory/controllers/stock-movement.controller.ts
git commit -m "chore(inventory): module cleanup — import ProductsModule, remove StockMovement

- Import ProductsModule for BundleStockService DI
- Remove StockMovementService and StockMovementController (functions
  absorbed into InventoryService)
- Export InventoryService so other modules can consume"
```

---

## Task 11: Unshipped Service + Controller

**Files:**
- Modify: `apps/server/src/inventory/services/unshipped.service.ts`
- Modify: `apps/server/src/inventory/controllers/unshipped.controller.ts`

### Step 11.1 — 현재 상태 확인

- [ ] **Run**: `cat apps/server/src/inventory/services/unshipped.service.ts apps/server/src/inventory/controllers/unshipped.controller.ts`

### Step 11.2 — 서비스 수정

- [ ] **`unshipped.service.ts` 에서 `getCompanyId` private helper 제거 + `companyId` parameter 추가**

변경: 모든 public 메서드가 `companyId: string` 을 인자로 받도록. `prisma.company.findFirst()` 호출 제거.

구체 변경 예 (기존 `findAll` 시그니처 변경):

Before:
```ts
async findAll(query: { page?: string; limit?: string; minDays?: string }) {
  const companyId = await this.getCompanyId();
  ...
}
```

After:
```ts
async findAll(
  query: { page?: string; limit?: string; minDays?: string },
  companyId: string,
) {
  ...
}
```

Private `getCompanyId` 메서드 전체 삭제.

### Step 11.3 — Controller 수정

- [ ] **`unshipped.controller.ts` 에 `@CurrentCompany()` 추가**

```ts
import { Controller, Get, Query } from '@nestjs/common';
import { UnshippedService } from '../services/unshipped.service';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';

@Controller('unshipped')
export class UnshippedController {
  constructor(private readonly unshippedService: UnshippedService) {}

  @Get()
  findAll(
    @CurrentCompany() companyId: string,
    @Query() query: { page?: string; limit?: string; minDays?: string },
  ) {
    return this.unshippedService.findAll(query, companyId);
  }
}
```

(기존 handler 수에 맞춰 `@CurrentCompany()` 인자 추가)

### Step 11.4 — 타입 + 빌드 확인

- [ ] **Run**: `cd apps/server && npx tsc --noEmit 2>&1 | grep "unshipped" | head`

Expected: 0 lines.

### Step 11.5 — Commit

- [ ] **커밋**

```bash
git add apps/server/src/inventory/services/unshipped.service.ts apps/server/src/inventory/controllers/unshipped.controller.ts
git commit -m "refactor(inventory): unshipped service uses @CurrentCompany

Remove prisma.company.findFirst fallback. Service methods accept
companyId parameter, controller injects via @CurrentCompany()."
```

---

## Task 12: Stock Transfers + Return Transfers Compile Fix + IDOR

**Files:**
- Modify: `apps/server/src/stock-transfers/stock-transfers.service.ts`
- Modify: `apps/server/src/stock-transfers/dto/create-stock-transfer.dto.ts`
- Modify: `apps/server/src/stock-transfers/stock-transfers.controller.ts`
- Modify: `apps/server/src/return-transfers/return-transfers.service.ts`
- Modify: `apps/server/src/return-transfers/dto/create-return-transfer.dto.ts`
- Modify: `apps/server/src/return-transfers/return-transfers.controller.ts`

### Step 12.1 — 현재 상태 확인

- [ ] **Run**:
```bash
cat apps/server/src/stock-transfers/stock-transfers.service.ts
cat apps/server/src/stock-transfers/dto/create-stock-transfer.dto.ts
cat apps/server/src/stock-transfers/stock-transfers.controller.ts
cat apps/server/src/return-transfers/return-transfers.service.ts
cat apps/server/src/return-transfers/dto/create-return-transfer.dto.ts
cat apps/server/src/return-transfers/return-transfers.controller.ts
```

### Step 12.2 — StockTransfer DTO 정리

- [ ] **`apps/server/src/stock-transfers/dto/create-stock-transfer.dto.ts`**

`productId` 필드를 `optionId` 로 변경. 기타 관련 필드 (`productName` → `optionName`) 도 필요 시 정리. 아래 예시를 현재 파일 구조에 맞춰 적용:

```ts
import { IsUUID, IsInt, Min, IsString, IsOptional } from 'class-validator';

export class CreateStockTransferDto {
  @IsUUID() optionId!: string;
  @IsUUID() fromWarehouseId!: string;
  @IsUUID() toWarehouseId!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsString() reason?: string;
}
```

### Step 12.3 — StockTransfer service 수정

- [ ] **`apps/server/src/stock-transfers/stock-transfers.service.ts`**

변경 포인트:
- `productId` → `optionId`
- `productName` → `optionName` (denormalization 이 필요하면 option.optionName 에서 가져옴)
- `include: { product: true }` → `include: { option: true }`
- `.update()` IDOR fix: `findUnique({ where: { id } })` → `findFirst({ where: { id, companyId } })`
- 서비스 메서드 시그니처에 `companyId: string` 추가

예시 (핵심 shape — 실제 필드는 prisma model 의 실 필드 기준):

```ts
@Injectable()
export class StockTransfersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateStockTransferDto, companyId: string) {
    // 필요 시 option 검증 (companyId 소속 확인)
    const option = await this.prisma.productOption.findFirst({
      where: { id: dto.optionId, companyId, isDeleted: false },
      select: { optionName: true },
    });
    if (!option) throw new NotFoundException('Option not found');

    return this.prisma.stockTransfer.create({
      data: {
        companyId,
        optionId: dto.optionId,
        optionName: option.optionName,
        fromWarehouseId: dto.fromWarehouseId,
        toWarehouseId: dto.toWarehouseId,
        quantity: dto.quantity,
        reason: dto.reason,
      },
      include: { option: true },
    });
  }

  async findAll(companyId: string) {
    return this.prisma.stockTransfer.findMany({
      where: { companyId },
      include: { option: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, dto: UpdateStockTransferDto, companyId: string) {
    const existing = await this.prisma.stockTransfer.findFirst({
      where: { id, companyId },
    });
    if (!existing) throw new NotFoundException('StockTransfer not found');

    return this.prisma.stockTransfer.update({
      where: { id },
      data: { ...dto },
      include: { option: true },
    });
  }
}
```

### Step 12.4 — StockTransfer Controller 수정

- [ ] **`@CurrentCompany()` 추가 + `companyId` service 전달**

```ts
@Controller('stock-transfers')
export class StockTransfersController {
  constructor(private readonly service: StockTransfersService) {}

  @Post()
  create(@CurrentCompany() companyId: string, @Body() dto: CreateStockTransferDto) {
    return this.service.create(dto, companyId);
  }

  @Get()
  findAll(@CurrentCompany() companyId: string) {
    return this.service.findAll(companyId);
  }

  @Patch(':id')
  update(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStockTransferDto,
  ) {
    return this.service.update(id, dto, companyId);
  }
}
```

### Step 12.5 — ReturnTransfer 동일 작업

- [ ] **`return-transfers` 패키지 전체에 대해 Step 12.2/12.3/12.4 동일 패턴 적용**

- `return-transfers/dto/create-return-transfer.dto.ts` — `productId` → `optionId`
- `return-transfers/return-transfers.service.ts` — 동일 compile fix + IDOR fix. `findUnique({id})` → `findFirst({id, companyId})` in `.update()`
- `return-transfers/return-transfers.controller.ts` — `@CurrentCompany()` 추가

### Step 12.6 — 타입 확인

- [ ] **Run**: `cd apps/server && npx tsc --noEmit 2>&1 | grep -E "stock-transfers|return-transfers" | head`

Expected: 0 lines.

### Step 12.7 — Commit

- [ ] **커밋**

```bash
git add apps/server/src/stock-transfers apps/server/src/return-transfers
git commit -m "fix(transfers): compile-fix Plan A residue + IDOR in .update()

Both stock-transfers and return-transfers:
- productId → optionId (Prisma model already migrated in Plan A)
- productName → optionName (denormalized from option.optionName)
- include: { product: true } → include: { option: true }
- @CurrentCompany() in controllers + service signature accepts companyId
- IDOR fix: .update() uses findFirst({id, companyId}) guard

Record-only invariant (no currentStock mutation) preserved."
```

---

## Task 13: master-product-resolver.ts — resolveInventory 제거

**Files:**
- Modify: `apps/server/src/common/master-product-resolver.ts`

### Step 13.1 — 현재 파일 읽기

- [ ] **Run**: `cat apps/server/src/common/master-product-resolver.ts`

### Step 13.2 — `resolveInventory` function + export 제거

- [ ] **Edit `apps/server/src/common/master-product-resolver.ts`**

`resolveInventory` 함수 본체 + `export` 제거. `resolvePricing` 은 그대로 유지 (out-of-scope 도메인 callers).

파일의 `resolveInventory` 관련 모든 줄 삭제. 만약 내부 helper 만 해당 함수에서 쓰였다면 함께 제거.

### Step 13.3 — Inventory 내부 호출처 확인

- [ ] **Run**: `grep -rn "resolveInventory\|masterProductResolver" apps/server/src/inventory --include="*.ts"`

Expected: 0 hits (Task 5 에서 이미 신규 InventoryService.list 가 resolver 미사용으로 재작성됨).

만약 호출처가 남아있으면 해당 파일에서 제거.

### Step 13.4 — 다른 모듈 영향 확인

- [ ] **Run**: `grep -rn "resolveInventory" apps/server/src --include="*.ts" | grep -v __tests__`

Expected: 0 hits (inventory 외에 없음을 확인).

`resolvePricing` 은 그대로 있어야 함:
- [ ] **Run**: `grep -rn "resolvePricing" apps/server/src --include="*.ts" | head`

Expected: dashboard, finance, traffic, advertising 의 기존 호출 그대로.

### Step 13.5 — 타입 확인

- [ ] **Run**: `cd apps/server && npx tsc --noEmit 2>&1 | grep "master-product-resolver" | head`

Expected: 0 lines.

### Step 13.6 — Commit

- [ ] **커밋**

```bash
git add apps/server/src/common/master-product-resolver.ts
git commit -m "refactor(common): remove resolveInventory from master-product-resolver

Plan A 3-layer schema no longer requires nested inventory resolution
(Inventory is 1:1 with ProductOption). resolvePricing remains for
out-of-scope domains (dashboard/finance/traffic/advertising) until
Plan B2c final cleanup."
```

---

## Task 14: Integration Tests — inventory-flow

**Files:**
- Create: `apps/server/src/inventory/__tests__/inventory-flow.integration.spec.ts`

### Step 14.1 — Test DB 준비 확인

- [ ] **Run**: `docker ps --filter name=kiditem-postgres-test --format '{{.Status}}'`

없으면:
- [ ] **Run**: `npm run db:test:up && npm run db:test:prepare`

### Step 14.2 — 통합 테스트 작성

- [ ] **Create `apps/server/src/inventory/__tests__/inventory-flow.integration.spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { InventoryService } from '../services/inventory.service';
import { BundleStockService } from '../../products/services/bundle-stock.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaClient } from '@prisma/client';

describe('Inventory flow (integration)', () => {
  let prisma: PrismaClient;
  let inventoryService: InventoryService;
  let companyId: string;
  let masterId: string;

  // Helpers
  async function seedOption(isBundle = false, initialStock = 0) {
    const option = await prisma.productOption.create({
      data: {
        companyId,
        masterId,
        sku: `SKU-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        optionName: isBundle ? 'Bundle' : 'Single',
        isBundle,
        availableStock: isBundle ? 0 : null,
      },
    });
    const inv = await prisma.inventory.create({
      data: {
        companyId,
        optionId: option.id,
        currentStock: initialStock,
      },
    });
    return { option, inventory: inv };
  }

  async function bindBundle(bundleOptionId: string, componentOptionId: string, qty: number) {
    await prisma.bundleComponent.create({
      data: {
        companyId,
        bundleOptionId,
        componentOptionId,
        qty,
      },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });
    await prisma.$connect();

    const m = await Test.createTestingModule({
      providers: [
        InventoryService,
        BundleStockService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    inventoryService = m.get(InventoryService);
  });

  afterAll(async () => { await prisma.$disconnect(); });

  beforeEach(async () => {
    // fresh test schema — truncate relevant tables (순서 중요: FK)
    await prisma.stockTransaction.deleteMany();
    await prisma.bundleComponent.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.productOption.deleteMany();
    await prisma.masterProduct.deleteMany();
    await prisma.company.deleteMany();

    const c = await prisma.company.create({ data: { name: 'Test Co' } });
    companyId = c.id;
    const master = await prisma.masterProduct.create({
      data: { companyId: c.id, masterName: 'Master', optionCounter: 0 },
    });
    masterId = master.id;
  });

  it('#1 Receive → bundle fan-out', async () => {
    const simple = await seedOption(false, 0);
    const bundle = await seedOption(true, 0);
    await bindBundle(bundle.option.id, simple.option.id, 2);

    const result = await inventoryService.receive(simple.inventory.id, { quantity: 10 }, companyId, 'user-1');

    expect(result.inventory.currentStock).toBe(10);
    expect(result.recomputedBundleOptionIds).toContain(bundle.option.id);

    const updatedBundle = await prisma.productOption.findUnique({ where: { id: bundle.option.id } });
    expect(updatedBundle?.availableStock).toBe(5);
  });

  it('#2 Issue → bundle fan-out decrease', async () => {
    const simple = await seedOption(false, 10);
    const bundle = await seedOption(true, 0);
    await bindBundle(bundle.option.id, simple.option.id, 2);
    // baseline recompute
    await inventoryService.receive(simple.inventory.id, { quantity: 0 } as any, companyId, 'user-1').catch(() => {});
    // Actually start fresh:
    await prisma.productOption.update({ where: { id: bundle.option.id }, data: { availableStock: 5 } });

    await inventoryService.issue(simple.inventory.id, { quantity: 4 }, companyId, 'user-1');

    const inv = await prisma.inventory.findUnique({ where: { id: simple.inventory.id } });
    expect(inv?.currentStock).toBe(6);
    const updatedBundle = await prisma.productOption.findUnique({ where: { id: bundle.option.id } });
    expect(updatedBundle?.availableStock).toBe(3);
  });

  it('#3 Insufficient stock → BadRequest, rollback', async () => {
    const simple = await seedOption(false, 3);
    await expect(inventoryService.issue(simple.inventory.id, { quantity: 5 }, companyId, 'user-1'))
      .rejects.toThrow();
    const inv = await prisma.inventory.findUnique({ where: { id: simple.inventory.id } });
    expect(inv?.currentStock).toBe(3);  // unchanged
    const ledger = await prisma.stockTransaction.findMany({ where: { optionId: simple.option.id } });
    expect(ledger).toHaveLength(0);
  });

  it('#4 Adjust negative / positive with bundle effect', async () => {
    const simple = await seedOption(false, 10);
    const bundle = await seedOption(true, 0);
    await bindBundle(bundle.option.id, simple.option.id, 2);
    await prisma.productOption.update({ where: { id: bundle.option.id }, data: { availableStock: 5 } });

    await inventoryService.adjust(simple.inventory.id, { delta: -4, reason: 'shrinkage' }, companyId, 'user-1');

    const inv = await prisma.inventory.findUnique({ where: { id: simple.inventory.id } });
    expect(inv?.currentStock).toBe(6);
    const tx = await prisma.stockTransaction.findFirst({ where: { optionId: simple.option.id }, orderBy: { createdAt: 'desc' } });
    expect(tx?.type).toBe('ADJUST');
    expect(tx?.quantity).toBe(4);
  });

  it('#5 Concurrent receive on same option → serialized', async () => {
    const simple = await seedOption(false, 0);

    await Promise.all([
      inventoryService.receive(simple.inventory.id, { quantity: 10 }, companyId, 'user-1'),
      inventoryService.receive(simple.inventory.id, { quantity: 10 }, companyId, 'user-2'),
    ]);

    const inv = await prisma.inventory.findUnique({ where: { id: simple.inventory.id } });
    expect(inv?.currentStock).toBe(20);
    const ledger = await prisma.stockTransaction.findMany({ where: { optionId: simple.option.id } });
    expect(ledger).toHaveLength(2);
  });

  it('#6 Concurrent different components of same bundle', async () => {
    const a = await seedOption(false, 0);
    const b = await seedOption(false, 0);
    const bundle = await seedOption(true, 0);
    await bindBundle(bundle.option.id, a.option.id, 1);
    await bindBundle(bundle.option.id, b.option.id, 1);

    await Promise.all([
      inventoryService.receive(a.inventory.id, { quantity: 5 }, companyId, 'u1'),
      inventoryService.receive(b.inventory.id, { quantity: 3 }, companyId, 'u2'),
    ]);

    const updatedBundle = await prisma.productOption.findUnique({ where: { id: bundle.option.id } });
    expect(updatedBundle?.availableStock).toBe(3);   // min(5/1, 3/1) = 3
  });

  it('#7 Soft-deleted component option excluded from fan-out', async () => {
    const a = await seedOption(false, 10);
    const bundle = await seedOption(true, 0);
    await bindBundle(bundle.option.id, a.option.id, 1);
    await prisma.productOption.update({ where: { id: a.option.id }, data: { isDeleted: true, deletedAt: new Date() } });
    await prisma.productOption.update({ where: { id: bundle.option.id }, data: { availableStock: 10 } });

    const result = await inventoryService.receive(a.inventory.id, { quantity: 5 }, companyId, 'u1');

    expect(result.recomputedBundleOptionIds).toEqual([]);  // excluded by soft-delete
    const updatedBundle = await prisma.productOption.findUnique({ where: { id: bundle.option.id } });
    expect(updatedBundle?.availableStock).toBe(10);  // unchanged
  });

  it('#9 Metadata update → no StockTransaction created', async () => {
    const simple = await seedOption(false, 10);
    await inventoryService.updateMetadata(simple.inventory.id, { safetyStock: 20 }, companyId);
    const ledger = await prisma.stockTransaction.findMany({ where: { optionId: simple.option.id } });
    expect(ledger).toHaveLength(0);
    const inv = await prisma.inventory.findUnique({ where: { id: simple.inventory.id } });
    expect(inv?.currentStock).toBe(10);  // unchanged
    expect(inv?.safetyStock).toBe(20);
  });

  it('#10 Ledger query + summary consistency', async () => {
    const simple = await seedOption(false, 0);
    await inventoryService.receive(simple.inventory.id, { quantity: 10, unitCost: 100 }, companyId, 'u1');
    await inventoryService.issue(simple.inventory.id, { quantity: 3 }, companyId, 'u1');

    const list = await inventoryService.listTransactions({ optionId: simple.option.id }, companyId);
    expect(list.items).toHaveLength(2);

    const summary = await inventoryService.getTransactionSummary({ days: 1 }, companyId);
    expect(summary.inQty).toBe(10);
    expect(summary.outQty).toBe(3);
    expect(summary.inAmount).toBe(1000);
  });

  it('#11 createdBy recorded in StockTransaction', async () => {
    const simple = await seedOption(false, 0);
    await inventoryService.receive(simple.inventory.id, { quantity: 5 }, companyId, 'specific-user');
    const tx = await prisma.stockTransaction.findFirst({ where: { optionId: simple.option.id } });
    expect(tx?.createdBy).toBe('specific-user');
  });
});
```

Test #8 (transfer record-only) 는 transfer service 를 직접 호출 — 별도 test 로 두거나 위 파일에 추가. 아래 append:

```ts
  it('#8 stockTransfer / returnTransfer.create → inventory.currentStock unchanged', async () => {
    const simple = await seedOption(false, 10);
    const warehouse1 = await prisma.warehouse.create({ data: { companyId, name: 'WH1', code: 'A' } });
    const warehouse2 = await prisma.warehouse.create({ data: { companyId, name: 'WH2', code: 'B' } });

    await prisma.stockTransfer.create({
      data: { companyId, optionId: simple.option.id, fromWarehouseId: warehouse1.id, toWarehouseId: warehouse2.id, quantity: 4 },
    });
    await prisma.returnTransfer.create({
      data: { companyId, optionId: simple.option.id, fromWarehouseId: warehouse1.id, toWarehouseId: warehouse2.id, quantity: 2 },
    });

    const inv = await prisma.inventory.findUnique({ where: { id: simple.inventory.id } });
    expect(inv?.currentStock).toBe(10);  // unchanged — record-only
    const ledger = await prisma.stockTransaction.findMany({ where: { optionId: simple.option.id } });
    expect(ledger).toHaveLength(0);
  });
```

실제 `Warehouse` 모델 필드는 schema 확인 필요 (code / name 등). 자리에 맞춰 조정.

### Step 14.3 — 통합 테스트 실행

- [ ] **Run**: `npm run test:integration -- inventory-flow`

Expected: 전체 (11 scenarios + transfer #8) PASS.

만약 시드 테이블 누락 / schema mismatch 로 실패 시 `db:test:prepare` 재실행.

### Step 14.4 — Commit

- [ ] **커밋**

```bash
git add apps/server/src/inventory/__tests__/inventory-flow.integration.spec.ts
git commit -m "test(inventory): integration flow — real Postgres scenarios

11 scenarios + transfer record-only guard:
- Receive/Issue/Adjust with bundle fan-out
- Insufficient stock rollback
- Concurrent same-option (row lock)
- Concurrent different-components (bundleOption lock + READ COMMITTED)
- Soft-deleted component exclusion from fan-out
- Transfer record-only (no currentStock mutation)
- Metadata update isolation
- Ledger query / summary consistency
- createdBy audit trail"
```

---

## Task 15: ADR-0014 + CLAUDE.md Chain

**Files:**
- Create: `.claude/docs/decisions/0014-stock-mutation-single-writer.md`
- Create: `apps/server/src/inventory/CLAUDE.md`
- Modify: `apps/server/CLAUDE.md`
- Modify: `prisma/CLAUDE.md`

### Step 15.1 — ADR-0014 생성

- [ ] **Create `.claude/docs/decisions/0014-stock-mutation-single-writer.md`**

```markdown
# ADR-0014: InventoryService 단독 Writer for Inventory.currentStock

**Status**: Accepted (2026-04-18, Plan B2a)
**Predecessor**: [ADR-0013](0013-product-schema-3layer.md) (3-layer schema + bundle materialization)

## Context

Plan A 가 Inventory 를 `ProductOption` 과 1:1 로 재편하고 bundle option 의 `availableStock` 을 materialized value 로 확립했다. `availableStock` 은 component option 의 stock 변화를 따라 자동 재계산되어야 하며, 이 invariant 를 service layer 에서 보장해야 한다. 여러 경로 (inventory receive / order issue / picking / transfer / manual adjust 등) 가 각자 `prisma.inventory.update({ currentStock })` 를 직접 호출하면 fan-out 을 누락하거나 ledger 를 빠뜨리기 쉽다.

## Decision

**`Inventory.currentStock` 및 `Inventory.reservedStock` 의 변경은 오직 `InventoryService.receive()` / `issue()` / `adjust()` 경유한다.**

이 세 메서드는 내부적으로 private `applyDelta()` 를 호출하며, `applyDelta` 가 `$transaction` 원자 시퀀스 (row lock + Inventory.update + StockTransaction.create + `BundleStockService.recomputeForComponent` fan-out) 를 소유한다.

**금지**:
- `InventoryService` 외부에서 `prisma.inventory.update({ data: { currentStock, reservedStock } })` 직접 호출
- `InventoryService` 외부에서 `prisma.stockTransaction.create()` 직접 호출 (ledger 는 InventoryService 가 자동 append)
- `BundleStockService.recomputeForComponent()` 를 InventoryService 외부에서 호출

**허용**:
- `InventoryService.updateMetadata()` 를 통한 metadata 필드 (safetyStock, reorderPoint, reorderQuantity, leadTimeDays, warehouseLocation) 변경 — currentStock/reservedStock 건드리지 않음
- `prisma.stockTransaction.findMany` / `count` / `groupBy` 등 **read** 호출 (InventoryService 가 제공하는 `listTransactions` / `getTransactionSummary` 사용 권장)

## Rationale

1. **Invariant enforcement**: `availableStock` materialization 은 Prisma 제약으로 검증 불가. Service layer 가 유일한 선택지.
2. **Audit ledger 완전성**: 모든 stock 변경이 `StockTransaction` 에 append 되어야 COGS / 재고 조정 추적 가능.
3. **원자성**: row lock + ledger + fan-out 을 한 `$transaction` 에 묶어야 READ COMMITTED 상에서도 일관성 확보.
4. **Schema-agnostic**: 다른 도메인 (orders, picking, transfers 등) 이 Inventory 구조를 알 필요 없이 의도만 노출 (receive/issue/adjust).

## Consequences

**긍정**:
- Future stock mutation 추가 시 (orders 의 auto-deduct, procurement 의 auto-receive 등) 반드시 InventoryService 경유 → 실수 차단
- Bundle availableStock 이 항상 consistent 상태 유지
- StockTransaction ledger 가 replay 가능한 single source of truth

**부정**:
- InventoryService 가 "Inventory + StockTransaction + BundleStockService fan-out" 3-entity responsibility 부담 → 메서드 수 증가 (9개)
- 다른 도메인 (orders/picking/procurement) 이 InventoryService 를 import 해야 함 → 모듈 의존 그래프 확장
- `BundleStockService.recomputeForComponent` 을 `ProductsModule.exports` 로 노출 → 규약 위반 가능성 (ADR 주석 + `products/CLAUDE.md` 의 "restricted export" 명시로 완화)

## Enforcement

코드 리뷰 시점 확인:

```bash
# 1. inventory.update currentStock 직접 호출 (외부)
grep -rn "inventory\.update" apps/server/src --include="*.ts" \
  | grep -v "apps/server/src/inventory/services/inventory.service.ts" \
  | grep -v __tests__ \
  | grep -v ".spec.ts"
# → 결과 비어있어야 함 (InventoryService 외부는 0 hits)

# 2. stockTransaction.create 직접 호출 (외부)
grep -rn "stockTransaction\.create" apps/server/src --include="*.ts" \
  | grep -v "apps/server/src/inventory/services/inventory.service.ts" \
  | grep -v __tests__
# → 결과 비어있어야 함

# 3. recomputeForComponent 호출 (외부)
grep -rn "recomputeForComponent" apps/server/src --include="*.ts" \
  | grep -v "apps/server/src/inventory/services/inventory.service.ts" \
  | grep -v "apps/server/src/products/services/bundle-stock.service.ts" \
  | grep -v __tests__
# → 결과 비어있어야 함
```

## Superseded by

N/A.

## Related

- ADR-0013 (3-layer schema)
- Plan B2a spec: docs/superpowers/specs/2026-04-18-plan-b2a-inventory-service-layer-design.md
```

### Step 15.2 — inventory/CLAUDE.md 생성

- [ ] **Create `apps/server/src/inventory/CLAUDE.md`**

```markdown
# apps/server/src/inventory — Inventory Domain

Plan B2a 가 재작성한 Inventory 도메인. Plan A 3-layer schema (Inventory 1:1 ProductOption) 기반 서비스 레이어.

## 구조

- `controllers/inventory.controller.ts` — 10 endpoints
- `controllers/unshipped.controller.ts` — 미배송 조회 (단순 wrapper)
- `services/inventory.service.ts` — 단일 통합 서비스 (read + metadata + mutation + ledger)
- `services/unshipped.service.ts` — `UnshippedItem` 조회 (inventory 와 분리)
- `dto/*` — class-validator DTO (ListInventory/UpdateMetadata/Receive/Issue/Adjust/ListTransactions/TransactionSummary)

## 핵심 규약

### ADR-0014 — 단일 writer invariant

`Inventory.currentStock` 및 `reservedStock` 변경은 오직 `InventoryService.receive() / issue() / adjust()` 경유. 상세: [ADR-0014](../../../../.claude/docs/decisions/0014-stock-mutation-single-writer.md).

외부 호출자 (orders / procurement / picking / advertising 등) 는 `InventoryService` 를 주입하고 semantic 메서드만 호출. `prisma.inventory.update({ currentStock })` 직접 호출 금지.

### Stock mutation 원자 시퀀스

`applyDelta(id, delta, txParams, companyId)` 가 소유:
1. `$queryRaw SELECT id FROM inventory WHERE id = ... FOR UPDATE` (row lock)
2. `findFirst({ id, companyId })` (IDOR guard)
3. bounds check (nextStock >= 0)
4. `inventory.update({ currentStock: { increment: delta } })`
5. `stockTransaction.create` (ledger append)
6. `bundleStock.recomputeForComponent(optionId, tx)` (fan-out)

`$transaction({ timeout: 15_000 })` — fan-out breadth 15s 내 완료 가정.

### BundleStockService 호출 규약

`BundleStockService.recomputeForComponent` 은 `ProductsModule` 에서 restricted export 됨. **오직 InventoryService 만 호출**. 다른 서비스가 호출 필요해지면 ADR-0014 개정 검토.

### Transfer record-only

`StockTransfer` / `ReturnTransfer` 는 record-keeping 만 수행. `currentStock` / `availableStock` 변경 없음. Integration test #8 이 이 invariant lock-in.

## Controller surface

```
GET    /api/inventory                                 — list
GET    /api/inventory/transactions                    — ledger list
GET    /api/inventory/transactions/summary            — aggregate
GET    /api/inventory/option/:optionId                — detail by option natural key
GET    /api/inventory/:id                             — detail by inventory id
PATCH  /api/inventory/:id                             — metadata only
POST   /api/inventory/:id/receive                     — 입고
POST   /api/inventory/:id/issue                       — 출고
POST   /api/inventory/:id/adjust                      — 조정
```

라우트 정의 순서: 정적 경로 (`/transactions`, `/option/:optionId`) → `/:id`. NestJS route matching 은 선언 순서 우선.

## Shared types

`@kiditem/shared` 의 `packages/shared/src/schemas/inventory.ts` 에 Zod-first 정의. service return 에 `satisfies <SharedType>` 필수 (Prisma↔Shared drift 감지).

## 테스트 tier

| Tier | 파일 | 범위 |
|---|---|---|
| Unit (vitest mock) | `services/__tests__/inventory.service.*.spec.ts` | list/findById/findByOptionId/updateMetadata/receive/issue/adjust/ledger 단위 |
| E2E (HTTP mock) | `controllers/__tests__/inventory.controller.e2e.spec.ts` | 10 endpoint routing + DTO validation + decorator 주입 |
| Integration (real Postgres) | `__tests__/inventory-flow.integration.spec.ts` | 11 시나리오 — 원자성 / bundle fan-out / 동시성 / record-only |

## 금지 패턴

- `@UseGuards('jwt')` / `@UsePipes(...)` / `@nestjs/passport` 관련 — 전역 `CompanyScopeGuard` + `ValidationPipe` 적용됨
- `findUnique({ id })` without companyId — IDOR. `findFirst({ id, companyId })` 사용
- Raw `prisma.inventory.update({ currentStock })` 외부 호출 — ADR-0014 위반
- `isDeleted` 필터를 `BundleComponent` 에 사용 — 해당 모델은 hard-delete, 필드 없음. 필요 시 `componentOption: { isDeleted: false }` 로 relation 필터
```

### Step 15.3 — apps/server/CLAUDE.md Domain Guides 갱신

- [ ] **`apps/server/CLAUDE.md` Domain Guides 표에 inventory 추가**

기존 표 위치 찾고 (`전용 CLAUDE.md 가 있는 도메인` 유사 섹션), 다음 row append:

```markdown
| [`src/inventory/CLAUDE.md`](src/inventory/CLAUDE.md) | ~80줄 | Inventory + StockTransaction — 단일 InventoryService (read + metadata + mutation + ledger). ADR-0014 단독 writer. BundleStockService 제한 호출. |
```

기존에 "Notable Sub-Domains" 같은 섹션에 inventory 가 있었다면 제거 (이제 전용 가이드 보유).

### Step 15.4 — prisma/CLAUDE.md 1줄 추가

- [ ] **`prisma/CLAUDE.md` 의 "StockTransaction" 언급 근처에 다음 추가**

```markdown
> **StockTransaction 은 InventoryService 의 내부 ledger — 외부 모듈의 직접 read/write 금지. ADR-0014.**
```

위치는 Inventory namespace 설명 근처가 자연스러움.

### Step 15.5 — Commit

- [ ] **커밋**

```bash
git add .claude/docs/decisions/0014-stock-mutation-single-writer.md apps/server/src/inventory/CLAUDE.md apps/server/CLAUDE.md prisma/CLAUDE.md
git commit -m "docs: ADR-0014 + inventory CLAUDE.md chain

ADR-0014: InventoryService 단독 writer for Inventory.currentStock.
Enforces fan-out and ledger append via single entry point. Lists
grep patterns for convention enforcement.

New inventory/CLAUDE.md documents:
- Service structure + atomic sequence
- BundleStockService restricted-export rule
- Transfer record-only invariant
- 3-tier test layout
- Forbidden patterns

apps/server/CLAUDE.md Domain Guides table updated.
prisma/CLAUDE.md gains StockTransaction access note."
```

---

## Task 16: Final Verification

**Files:** None (검증 전용)

### Step 16.1 — tsc in-scope 에러 0 확인

- [ ] **Run**:
```bash
cd apps/server && npx tsc --noEmit 2>&1 \
  | grep -E "error TS" \
  | grep -E "inventory|stock-transfers|return-transfers|products/util/serialize|products/services/bundle-stock|products/products.module"
```

Expected: 0 lines.

### Step 16.2 — 전체 unit + e2e tests

- [ ] **Run**: `npm run test --workspace=apps/server`

Expected: 전체 PASS (변경된 도메인 + 기존 Plan B1 products 포함).

### Step 16.3 — Integration tests

- [ ] **Run**:
```bash
npm run db:test:up && npm run db:test:prepare
npm run test:integration -- inventory-flow
```

Expected: 12 PASS (11 + transfer #8).

### Step 16.4 — ADR-0014 enforcement grep 확인

- [ ] **Run**:
```bash
grep -rn "inventory\.update" apps/server/src --include="*.ts" \
  | grep -v "apps/server/src/inventory/services/inventory.service.ts" \
  | grep -v __tests__ \
  | grep -v ".spec.ts"
```

Expected: 0 lines (inventoryService 외부 호출자 없음).

- [ ] **Run**:
```bash
grep -rn "stockTransaction\.create" apps/server/src --include="*.ts" \
  | grep -v "apps/server/src/inventory/services/inventory.service.ts" \
  | grep -v __tests__
```

Expected: 0 lines.

- [ ] **Run**:
```bash
grep -rn "recomputeForComponent" apps/server/src --include="*.ts" \
  | grep -v "apps/server/src/inventory/services/inventory.service.ts" \
  | grep -v "apps/server/src/products/services/bundle-stock.service.ts" \
  | grep -v __tests__
```

Expected: 0 lines.

### Step 16.5 — satisfies 패턴 self-check

- [ ] **Run** (packages/shared/CLAUDE.md 규약):
```bash
for f in $(grep -rlE "from '@kiditem/shared'" apps/server/src/inventory --include="*.service.ts"); do
  if grep -E "from '@kiditem/shared'" "$f" | grep -qE '\b[A-Z][a-zA-Z]+\b'; then
    grep -qE 'satisfies ' "$f" || echo "MISSING: $f"
  fi
done
```

Expected: 출력 없음 (모든 service 가 satisfies 사용).

### Step 16.6 — 전체 in-scope TS error 수 감소 확인

- [ ] **Run**: `cd apps/server && npx tsc --noEmit 2>&1 | grep -c "error TS"`

Expected: 시작 시점 394 대비 **-40 이상 감소** (inventory ~30 + transfers ~8 + picking 미해결 영향 제외).

### Step 16.7 — 최종 상태 기록

- [ ] **한 줄 기록 + commit 없음** (모두 PASS 이면 PR 생성 단계로)

- [ ] **Run**: `git log --oneline | head -20`

Plan B2a 커밋 순서 확인.

---

## Post-Implementation

### PR 생성

- [ ] **PR body 템플릿 (`.github/PULL_REQUEST_TEMPLATE.md`) 기준 작성**

포함 체크리스트:
- [ ] ADR-0014 신설 기록
- [ ] `BundleStockService` export 전환 + `products/CLAUDE.md` 갱신
- [ ] `StockMovementService`/`StockMovementController` 삭제 기록
- [ ] `common/master-product-resolver.ts` 부분 정리 (파일 유지, B2c 에 최종 삭제 예고)
- [ ] Integration test seed 요구 사항 (kiditem_test)
- [ ] Plan B1 이월 #4 (BigInt guard) 포함 설명
- [ ] 후속 plan 의존성 (Plan A.5 / B2b / B2c / B2.picking) 언급

- [ ] **`gh pr create`** 실행

### 후속 세션 진입

- [ ] Plan A.5 (Order schema 통합) 또는 Plan B2b (advertising) 선택
- [ ] 이 spec/plan 의 retrospective 를 `project_plan_b2a_completed.md` memory 에 기록

---

**End of plan.**
