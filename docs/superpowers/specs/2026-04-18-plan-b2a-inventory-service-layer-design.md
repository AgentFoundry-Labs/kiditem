# Plan B2a — Inventory Service Layer (Design Spec v2)

> **Status**: Draft v2 — 3-reviewer adversarial review 반영 (critic + architect + code-reviewer)
> **Session**: 2026-04-18
> **Predecessors**: [Plan A spec](2026-04-17-product-schema-redesign-design.md), [Plan B1 spec](2026-04-17-plan-b1-products-module-design.md), [ADR-0013](../../../.claude/docs/decisions/0013-product-schema-3layer.md)
> **Branch**: `feat/plan-b2a-inventory` (from `origin/main`)

---

## 1. Goal

Plan A 의 3-layer Prisma schema (Master + ProductOption + BundleComponent, `Inventory.optionId` 1:1) 를 Inventory 도메인 service layer 에 적용한다. `currentStock` 변경의 **단일 원자 경로**를 `InventoryService` 에 캡슐화하고, `StockTransaction` ledger 에 자동 append 하며, bundle option 의 materialized `availableStock` 를 `BundleStockService` fan-out 으로 자동 재계산한다. 레거시 `StockMovementService`/`StockMovementController` 를 제거하고 `StockTransaction` entity 를 `InventoryService` 의 내부 구현 세부사항으로 감춘다.

## 2. Scope Decomposition

Plan B2 전체 (advertising / orders / inventory / supplier / channels / misc, 394 TS errors, ~20 services) 는 단일 spec 으로는 Plan B1 의 2-3 배 규모. Phased 로 분할:

| Plan | Scope | 의존 |
|---|---|---|
| `fix/products-plan-b1-followups` | Plan B1 이월 1/2/3 micro PR (MastersController options ordering, BundleComponentsService race, MastersService race) | Plan B1 |
| **Plan B2a (이 spec)** | **Inventory service layer + BundleStockService hook 배선 + transfers (record-only compile fix) + Plan B1 이월 #4 (toSerializable BigInt guard) + ADR-0014** | Plan B1 |
| Plan A.5 | Order schema 통합 (Generic `Order` + `OrderLineItem`, `CoupangOrder`/`CoupangOrderItem`/`CoupangReturn` 폐기) | Plan B1 |
| Plan B2b | Advertising service rewrite (ad-action/benchmark/campaigns/collect/config/execution/strategy/sync) | Plan A.5 |
| Plan B2c | Orders + channels + supplier + statistics + action-task + traffic + rules + settlements + procurement + uploads + sourcing catch-all. `dev:server` 부팅 목표. `master-product-resolver.ts` 최종 삭제 여기서 | Plan A.5, B2b |
| Plan B2.picking | Picking redesign (OrderLineItem 기반 generate) | Plan A.5 |

**이 spec 은 Plan B2a 만 다룬다.** 다른 plan 은 별도 spec.

## 3. In-Scope / Out-of-Scope

### 3.1 In-scope files

| Path | 작업 |
|---|---|
| `apps/server/src/inventory/controllers/inventory.controller.ts` | **재작성**. 4 read endpoints (`GET /`, `/:id`, `/option/:optionId`, `/transactions`, `/transactions/summary`) + 1 metadata write (`PATCH /:id`) + 3 stock mutation (`POST /:id/receive`, `/issue`, `/adjust`). 모든 handler 에 `@CurrentCompany()`, mutation handler 에 `@CurrentUser()` 추가. 라우트 정의 순서: `/transactions` → `/option/:optionId` → `/:id` (정적 경로 우선) |
| `apps/server/src/inventory/controllers/stock-movement.controller.ts` | **삭제** |
| `apps/server/src/inventory/controllers/unshipped.controller.ts` | 핸들러에 `@CurrentCompany()` 추가, `companyId` 를 service 에 전달 |
| `apps/server/src/inventory/services/inventory.service.ts` | **재작성** (단일 service). read + metadata + mutation + ledger 조회 통합. 내부 private `applyDelta()` 가 `$transaction` 원자 시퀀스 소유 |
| `apps/server/src/inventory/services/stock-movement.service.ts` | **삭제** (기능은 InventoryService 로 흡수) |
| `apps/server/src/inventory/services/unshipped.service.ts` | `prisma.company.findFirst` 제거 → `companyId` 파라미터. 나머지 schema 변경 없음 (UnshippedItem 테이블 자체는 clean) |
| `apps/server/src/inventory/dto/*` | 재작성. `ListInventoryQueryDto`, `UpdateInventoryMetadataDto`, `ReceiveStockDto`, `IssueStockDto`, `AdjustStockDto`, `ListTransactionsQueryDto`, `TransactionSummaryQueryDto`. 기존 `ReceiveStockBodyDto`, `ListStockMovementQueryDto`, `StockMovementSummaryQueryDto` 삭제 |
| `apps/server/src/inventory/inventory.module.ts` | `ProductsModule` import 추가 (BundleStockService 주입 용). `StockMovementController` / `StockMovementService` 제거. `UnshippedController` / `UnshippedService` 유지 |
| `apps/server/src/stock-transfers/stock-transfers.service.ts` + `dto/*` | **compile fix**: `productId`→`optionId`, `productName`→`optionName`, `include: { product: true }`→`include: { option: true }`. `.update()` IDOR fix: `findUnique({id})`→`findFirst({id, companyId})`. `currentStock` 변경 없음 (record-only) 을 코드/test 로 고정 |
| `apps/server/src/return-transfers/return-transfers.service.ts` + `dto/*` | 동일 (compile fix + IDOR fix + record-only lock-in) |
| `apps/server/src/products/services/bundle-stock.service.ts` | **신규 메서드** `recomputeForComponent(componentOptionId, tx)`: `bundleComponent.findMany({ where: { componentOptionId, componentOption: { isDeleted: false } } })` → 각 `bundleOptionId` 에 대해 `recompute(bundleOptionId, tx)` 호출 + 결과 배열 반환. 기존 `recompute` 시그니처 불변 |
| `apps/server/src/products/products.module.ts` | `exports` 에 `BundleStockService` 추가 |
| `apps/server/src/products/CLAUDE.md` | `Non-export` 섹션에서 `BundleStockService` 제거 + "export: InventoryService 에서 `recomputeForComponent` 호출 전용" 명시 |
| `apps/server/src/products/util/serialize.ts` | **Plan B1 이월 #4**: `toSerializable` 에 BigInt guard 추가. `Number.MAX_SAFE_INTEGER` 범위 초과 시 `String` 로 fallback, 범위 내면 `Number` 변환 |
| `apps/server/src/products/util/__tests__/serialize.spec.ts` | BigInt case (safe range + over-max) 테스트 추가 |
| `apps/server/src/common/master-product-resolver.ts` | **부분 정리**: `resolveInventory` export 제거 + 이 파일을 import 하던 `inventory.service.ts` 의 import 제거. 파일 자체는 유지 (`resolvePricing` 는 out-of-scope 도메인들이 사용 중). 전체 파일 삭제는 B2c 로 이연 |
| `packages/shared/src/schemas/inventory.ts` | **확장** (기존 파일). 신규 schemas 추가: `InventoryStatusSchema`, `InventoryListItemSchema`, `InventorySummarySchema`, `InventoryListResponseSchema`, `StockTransactionTypeSchema`, `StockTransactionSchema`, `StockOperationResultSchema`, `TransactionListItemSchema`, `TransactionListResponseSchema`, `TransactionSummarySchema`, `ReceiveStockInputSchema`, `IssueStockInputSchema`, `AdjustStockInputSchema`, `UpdateInventoryMetadataInputSchema`. 기존 `InventorySchema` 유지. `dailySalesAvg: z.number()` 유지 |
| `packages/shared/src/schemas/index.ts` | 신규 schemas re-export |
| `packages/shared/src/index.ts` | 신규 types re-export (Plan B1 P0 lesson: 양쪽 barrel 모두 동기화) |
| `.claude/docs/decisions/0014-stock-mutation-single-writer.md` | **신규 ADR**: "InventoryService 가 `Inventory.currentStock` 변경의 유일한 경로" 불변식. Prisma 의 `inventory.update({ currentStock })` 직접 호출 금지. 호출처 예외 명시 |
| `apps/server/src/inventory/CLAUDE.md` | **신규** (Plan B1 products/CLAUDE.md 패턴). Service 경계 (single InventoryService), hook firing 원칙, 테스트 tier, BundleStockService 접근 규약 |
| `apps/server/CLAUDE.md` | Domain Guides 표에 `src/inventory/` 진입. 기존 Notable Sub-Domains 에서 제거 |
| `prisma/CLAUDE.md` | "StockTransaction 은 InventoryService 의 내부 ledger — 직접 access 금지" 1줄 노트 추가 |

### 3.2 Out-of-scope (별도 plan)

- `apps/server/src/orders/` (Plan A.5 후 B2c)
- `apps/server/src/advertising/` (Plan B2b)
- `apps/server/src/channels/` (Plan B2c)
- `apps/server/src/picking/` (Plan B2.picking — Plan A.5 후)
- `apps/server/src/stock-audits/` (이미 clean)
- `apps/server/src/rules/`, `apps/server/src/dashboard/`, `apps/server/src/finance/`, `apps/server/src/traffic/` (B2c / B3)
- `apps/web/*` (Plan D, frontend rewrite)
- `common/master-product-resolver.ts` 전체 파일 삭제 (Plan B2c 최종 정리)

### 3.3 Out-of-B2a (micro PR before B2a)

- `fix/products-plan-b1-followups` — Plan B1 이월 1/2/3 (5줄 수준, products 도메인 micro fix)

## 4. Architecture

### 4.1 Invariants (Plan A schema 규약)

- Inventory 는 ProductOption 과 **1:1 unique**. `inventory.option_id UNIQUE`.
- MasterInventory / MasterProduct.inventory 개념 **없음**. Inventory 는 오직 option level.
- Bundle ProductOption 의 `availableStock` 은 **materialized** — `BundleStockService.recompute` 로만 갱신.
- `StockTransaction` 은 optionId 기반 append-only ledger. `InventoryService` 의 내부 구현 세부사항 (외부 caller 가 직접 read/write 금지).
- BundleComponent 는 **hard-delete** (soft-delete 없음). Bundle 의 component 의 option 은 soft-delete 가능.

### 4.2 Single-Writer Invariant (ADR-0014)

`Inventory.currentStock` / `Inventory.reservedStock` 값의 **변경은 오직 `InventoryService.receive()` / `issue()` / `adjust()` 경유**. 세 메서드 모두 내부적으로 private `applyDelta()` 를 호출하며, `applyDelta` 가 `$transaction` 원자 시퀀스 (row lock + Inventory.update + StockTransaction.create + bundle fan-out) 소유.

금지:
- `prisma.inventory.update({ data: { currentStock: ... } })` 의 직접 호출 (InventoryService 외부에서)
- `StockTransaction.create` 의 직접 호출 (InventoryService 외부에서)

허용:
- `prisma.inventory.update({ data: { safetyStock, reorderPoint, leadTimeDays, warehouseLocation, reorderQuantity } })` — metadata 는 `InventoryService.updateMetadata()` 경유 (currentStock/reservedStock 건드리지 않음)

### 4.3 InventoryService 구조

```ts
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bundleStock: BundleStockService,
  ) {}

  // ===== Inventory entity reads =====
  async list(query: ListInventoryQueryDto, companyId: string): Promise<InventoryListResponse>
  async findById(id: string, companyId: string): Promise<Inventory>
  async findByOptionId(optionId: string, companyId: string): Promise<Inventory>

  // ===== Metadata write (currentStock 건드리지 않음) =====
  async updateMetadata(
    id: string,
    dto: UpdateInventoryMetadataInput,
    companyId: string,
  ): Promise<Inventory>

  // ===== Stock mutations — 단일 write 경로 =====
  async receive(
    id: string,
    dto: ReceiveStockInput,
    companyId: string,
    userId: string,
  ): Promise<StockOperationResult>

  async issue(
    id: string,
    dto: IssueStockInput,
    companyId: string,
    userId: string,
  ): Promise<StockOperationResult>

  async adjust(
    id: string,
    dto: AdjustStockInput,
    companyId: string,
    userId: string,
  ): Promise<StockOperationResult>

  // ===== Ledger reads (StockTransaction) =====
  async listTransactions(
    query: ListTransactionsQueryDto,
    companyId: string,
  ): Promise<TransactionListResponse>

  async getTransactionSummary(
    query: TransactionSummaryQueryDto,
    companyId: string,
  ): Promise<TransactionSummary>

  // ===== Private atomic helper =====
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
      if (!inv) throw new NotFoundException('Inventory');

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

      // option name denormalization — ledger 감사용 (non-critical)
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

      // 5) bundle fan-out — encapsulated
      const recomputedBundleOptionIds = await this.bundleStock.recomputeForComponent(
        updated.optionId,
        tx,
      );

      return {
        inventory: toSerializable(updated) as Inventory,
        transaction: {
          id: transaction.id,
          optionId: transaction.optionId,
          type: transaction.type as StockTransactionType,
          quantity: transaction.quantity,
          unitCost: transaction.unitCost,
          createdAt: transaction.createdAt.toISOString(),
        },
        recomputedBundleOptionIds,
      } satisfies StockOperationResult;
    }, { timeout: 15_000 });
  }
}
```

### 4.4 BundleStockService.recomputeForComponent (신규)

```ts
/**
 * 이 option 을 component 로 사용하는 모든 활성 bundle option 에 대해
 * recompute(bundleOptionId, tx) 를 호출. 반환값은 갱신된 bundle option id 리스트.
 * fan-out orchestration 을 이 서비스에 캡슐화 — caller 는 optionId 만 넘긴다.
 *
 * - BundleComponent 는 hard-delete (isDeleted 필드 없음) — where 절에 포함하지 않음.
 * - 대신 componentOption 이 soft-delete 된 경우 fan-out 제외 (bundle.recompute 와 동일 invariant).
 * - 현 시스템은 nested bundle 금지 (BundleComponentsService.create 가 차단). 따라서 fan-out 는 비재귀 — 종료 보장.
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

### 4.5 Hook firing 원칙

| 경로 | `currentStock` 변경 | `recomputeForComponent` 호출 |
|---|---|---|
| `POST /inventory/:id/receive` | 예 (InventoryService.receive → applyDelta) | 예 (applyDelta 내부) |
| `POST /inventory/:id/issue` | 예 (InventoryService.issue → applyDelta) | 예 |
| `POST /inventory/:id/adjust` | 예 (InventoryService.adjust → applyDelta) | 예 |
| `PATCH /inventory/:id` (metadata) | 아니오 | 아니오 |
| `StockTransfer.create / update` | 아니오 (Inventory 1:1 option, warehouse 는 label) | 아니오 |
| `ReturnTransfer.create / update` | 아니오 | 아니오 |
| `InventoryService.listTransactions` / `getTransactionSummary` | 아니오 | 아니오 |

Transfer 는 record-keeping only. 향후 warehouse 단위 재고가 필요하면 schema 재설계 + 별도 plan.

### 4.6 Concurrent race analysis

**Same option 동시 mutation**: `SELECT FOR UPDATE` 가 inventory row 에서 직렬화 → 순차 처리 (integration test #5 로 검증).

**Different components of same bundle 동시 mutation**:
1. T1: component A 락 획득 → A.currentStock 갱신 → bundle.recompute (bundleOption 락 획득) → A 읽고 계산 → availableStock 갱신 → commit
2. T2 (병렬): component B 락 획득 → B.currentStock 갱신 → bundle.recompute (T1 의 bundleOption 락 해제 대기) → 획득 후 A+B 읽고 계산 → 갱신 → commit

T2 의 `recompute` 는 `SELECT FOR UPDATE` 로 bundleOption 을 락한 뒤 component 를 `findMany` — 이 때 T1 이 이미 commit 했으므로 READ COMMITTED 상에서 최신 A 값을 관찰. 따라서 최종 availableStock 는 A+B 갱신 모두 반영된 값. **race-free.**

단, T1 이 **아직 commit 전**이고 T2 가 bundleOption 락 대기 중이라면, T2 는 T1 commit 까지 대기 → 정합성 보장.

Integration test #6 이 이 시나리오 검증.

### 4.7 Controller surface

```
# Inventory (entity)
GET    /api/inventory                                 — list (query: page, limit, status?, optionId?, masterId?)
GET    /api/inventory/transactions                    — ledger list (query: optionId?, type?, from?, to?)
GET    /api/inventory/transactions/summary            — aggregate (query: days)
GET    /api/inventory/option/:optionId                — detail by option natural key
GET    /api/inventory/:id                             — detail by inventory id
PATCH  /api/inventory/:id                             — metadata (safetyStock/reorderPoint/leadTimeDays/warehouseLocation/reorderQuantity)
POST   /api/inventory/:id/receive                     — 입고 ({ quantity, unitCost?, warehouseId?, note? })
POST   /api/inventory/:id/issue                       — 출고 ({ quantity, warehouseId?, relatedId?, relatedType?, note? })
POST   /api/inventory/:id/adjust                      — 조정 ({ delta, reason })
```

라우트 정의 순서 (정적 경로가 `:id` 보다 먼저):
1. `@Get()` — /
2. `@Get('transactions')`
3. `@Get('transactions/summary')`
4. `@Get('option/:optionId')`
5. `@Get(':id')`
6. `@Patch(':id')`
7. `@Post(':id/receive')`, `@Post(':id/issue')`, `@Post(':id/adjust')`

**삭제 URL**:
- `GET /api/stock-movement` / `GET /api/stock-movement/summary`
- `PATCH /api/inventory/:id/receive` (기존 레거시)
- `GET /api/inventory/by-product/:productId`

### 4.8 Controller skeleton

```ts
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  list(@CurrentCompany() companyId: string, @Query() query: ListInventoryQueryDto) {
    return this.inventoryService.list(query, companyId);
  }

  @Get('transactions')
  listTransactions(@CurrentCompany() companyId: string, @Query() query: ListTransactionsQueryDto) {
    return this.inventoryService.listTransactions(query, companyId);
  }

  @Get('transactions/summary')
  transactionSummary(@CurrentCompany() companyId: string, @Query() query: TransactionSummaryQueryDto) {
    return this.inventoryService.getTransactionSummary(query, companyId);
  }

  @Get('option/:optionId')
  findByOptionId(@CurrentCompany() companyId: string, @Param('optionId') optionId: string) {
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

### 4.9 Helper 정리

- `common/master-product-resolver.ts` — **부분 정리**: `resolveInventory` export 제거 + `inventory.service.ts` 의 `resolveInventory` 사용 제거. `resolvePricing` 과 파일 자체는 유지 (out-of-scope 도메인 의존). 전체 파일 삭제는 Plan B2c 로 이연.
- `products/util/serialize.ts` — `toSerializable` BigInt guard:

```ts
export function toSerializable<T>(v: T): T {
  if (typeof v === 'bigint') {
    // Plan B1 이월 #4: $queryRaw 가 반환하는 BigInt 대응
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

### 4.10 DI boundary 조정 (Blocker 해결)

현재 `BundleStockService` 는 `ProductsModule` 의 `Non-export` — `apps/server/src/products/products.module.ts:18` 의 `exports` 에 없음.

**조치**: `BundleStockService` 를 `exports` 에 추가 + `products/CLAUDE.md` 의 `Non-export` 섹션에서 제거 + "Export: `BundleStockService` — InventoryService 가 fan-out 용으로 호출. 다른 모듈은 호출 금지 (ADR-0014 단일 쓰기 경로 규약)" 주석 추가.

`InventoryModule` 은 `ProductsModule` 을 `imports` 에 추가하여 `BundleStockService` 주입 가능.

## 5. API contract + Shared types

### 5.1 `packages/shared/src/schemas/inventory.ts` (확장)

```ts
import { z } from 'zod';
import { zIsoDate } from './common.js';

// ===== 기존 유지 =====
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

// ===== 신규 =====
export const InventoryStatusSchema = z.enum(['healthy', 'low', 'out']);
export type InventoryStatus = z.infer<typeof InventoryStatusSchema>;

export const InventoryListItemSchema = z.object({
  id: z.string().uuid(),
  optionId: z.string().uuid(),
  masterId: z.string().uuid(),
  sku: z.string(),
  masterName: z.string(),
  optionName: z.string().nullable(),
  kind: z.enum(['SIMPLE', 'BUNDLE']),
  currentStock: z.number().int(),
  availableStock: z.number().int(),    // bundle: materialized. simple: = currentStock
  safetyStock: z.number().int(),
  reorderPoint: z.number().int(),
  leadTimeDays: z.number().int().nullable(),
  warehouseLocation: z.string().nullable(),
  status: InventoryStatusSchema,
});
export type InventoryListItem = z.infer<typeof InventoryListItemSchema>;

export const InventorySummarySchema = z.object({
  total: z.number().int(),
  healthy: z.number().int(),
  low: z.number().int(),
  out: z.number().int(),
});
export type InventorySummary = z.infer<typeof InventorySummarySchema>;

export const InventoryListResponseSchema = z.object({
  items: z.array(InventoryListItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  summary: InventorySummarySchema,
});
export type InventoryListResponse = z.infer<typeof InventoryListResponseSchema>;

// Stock transaction types
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

export const StockOperationResultSchema = z.object({
  inventory: InventorySchema,
  transaction: StockTransactionSchema,
  recomputedBundleOptionIds: z.array(z.string().uuid()),
});
export type StockOperationResult = z.infer<typeof StockOperationResultSchema>;

// Ledger list / summary
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

// Input schemas (for service boundaries + DTO inference)
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

**Re-export 의무** (Plan B1 P0 lesson):
- `packages/shared/src/schemas/index.ts` — 신규 schema export 추가
- `packages/shared/src/index.ts` — 신규 type export 추가

### 5.2 DTOs (`apps/server/src/inventory/dto/`)

NestJS 서비스 entry 는 class-validator DTO, 내부 로직은 위 Zod input schema 와 1:1 일치.

```ts
// list-inventory-query.dto.ts
export class ListInventoryQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @IsIn(['healthy', 'low', 'out']) status?: InventoryStatus;
  @IsOptional() @IsUUID() optionId?: string;
  @IsOptional() @IsUUID() masterId?: string;
}

// receive-stock.dto.ts
export class ReceiveStockDto {
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsInt() @Min(0) unitCost?: number;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

// issue-stock.dto.ts
export class IssueStockDto {
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsString() @MaxLength(100) relatedId?: string;
  @IsOptional() @IsString() @MaxLength(50) relatedType?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

// adjust-stock.dto.ts
export class AdjustStockDto {
  @IsInt() @NotEquals(0) delta!: number;
  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
}

// update-inventory-metadata.dto.ts
export class UpdateInventoryMetadataDto {
  @IsOptional() @IsInt() @Min(0) safetyStock?: number;
  @IsOptional() @IsInt() @Min(0) reorderPoint?: number;
  @IsOptional() @IsInt() @Min(0) reorderQuantity?: number;
  @IsOptional() @IsInt() @Min(0) leadTimeDays?: number | null;
  @IsOptional() @IsString() @MaxLength(100) warehouseLocation?: string | null;
}

// list-transactions-query.dto.ts
export class ListTransactionsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @IsUUID() optionId?: string;
  @IsOptional() @IsIn(['RECEIVE', 'ISSUE', 'ADJUST']) type?: StockTransactionType;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
}

// transaction-summary-query.dto.ts
export class TransactionSummaryQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) days?: number;
}
```

### 5.3 `satisfies` 패턴 적용

모든 service 메서드 return 에 `satisfies` (packages/shared/CLAUDE.md 규약):

```ts
// 예시
async list(query, companyId): Promise<InventoryListResponse> {
  const rows = await this.prisma.inventory.findMany({ ... });
  const items = rows.map((r) => ({
    id: r.id,
    optionId: r.optionId,
    masterId: r.option.masterId,
    sku: r.option.sku,
    masterName: r.option.master.masterName,
    optionName: r.option.optionName,
    kind: r.option.isBundle ? 'BUNDLE' : 'SIMPLE',
    currentStock: r.currentStock,
    availableStock: r.option.availableStock ?? r.currentStock,
    safetyStock: r.safetyStock,
    reorderPoint: r.reorderPoint,
    leadTimeDays: r.leadTimeDays,
    warehouseLocation: r.warehouseLocation,
    status: deriveStatus(r.currentStock, r.reorderPoint),
  } satisfies InventoryListItem));

  return {
    items,
    total: totalCount,
    page,
    limit,
    summary: { ... } satisfies InventorySummary,
  } satisfies InventoryListResponse;
}
```

## 6. Testing strategy

3-tier (Plan B1 패턴):

### 6.1 Unit (vitest mock)

- `inventory.service.spec.ts` — list filter, findById IDOR, findByOptionId, updateMetadata 가드 (currentStock 필드 거부), `computeDelta` 가드
- `inventory.service.receive.spec.ts` — receive 호출 + mock Prisma 트랜잭션 + applyDelta 동작
- `inventory.service.issue.spec.ts` — issue 동일
- `inventory.service.adjust.spec.ts` — adjust 동일 (delta 양수/음수)
- `bundle-stock.recompute-for-component.spec.ts` — fan-out 쿼리 + soft-deleted component option 제외 + 반환값 정합성
- `serialize.bigint.spec.ts` — BigInt safe/unsafe range 동작

### 6.2 E2E (HTTP mock via `Test.createTestingModule` + supertest)

- `inventory.controller.e2e.spec.ts` — 10 endpoint routing + DTO validation + `@CurrentCompany()` / `@CurrentUser()` 주입 + 라우트 매칭 순서 (`/transactions` vs `/:id`)
- `dev:server` 부팅 의존 없음 — `INestApplication` 직접 생성

### 6.3 Integration (real Postgres)

`inventory-flow.integration.spec.ts`:

1. **Receive → bundle fan-out**: option A (simple) + bundle B (component A, qty=2). `POST /inv/:idA/receive {quantity:10}` → A.currentStock=10, B.availableStock=5, StockTransaction 1건 생성 (type=RECEIVE)
2. **Issue → bundle fan-out decrease**: 위 상태 → `POST /inv/:idA/issue {quantity:4}` → A.currentStock=6, B.availableStock=3
3. **Insufficient stock → BadRequest**: A.currentStock=3 → ISSUE 5 → 400, A/ledger/bundle 불변 (transaction rollback 검증)
4. **Adjust 양수/음수**: A.currentStock=10 → `adjust {delta:-4, reason:'shrinkage'}` → A=6, B=3, StockTransaction type=ADJUST quantity=4
5. **Same option concurrent**: 2 concurrent `receive {quantity:10}` → A.currentStock=20 (row lock 검증)
6. **Different components of same bundle concurrent**: A + B 가 bundle C 의 component. A.receive(10) + B.receive(10) 병렬 → C.availableStock 이 A+B 모두 반영된 값 (READ COMMITTED + bundleOption FOR UPDATE 검증)
7. **Soft-deleted component option 제외**: componentOption isDeleted=true → fan-out 에서 제외, 해당 bundle.availableStock 불변
8. **Transfer 는 currentStock 불변**: `stockTransfer.create` + `returnTransfer.create` 양쪽 모두 → inventory.currentStock 변경 없음 (record-only lock-in)
9. **Metadata-only update**: `PATCH /inv/:id {safetyStock:20}` → StockTransaction 생성 안 됨, `recomputedBundleOptionIds` 없음
10. **Ledger query / summary**: receive/issue/adjust 후 `GET /inventory/transactions?optionId=A` 로 건수/집계 일치 확인
11. **createdBy 기록**: receive → `StockTransaction.createdBy = userId` 저장 확인

### 6.4 검증 명령

```bash
# Unit + E2E
npm run test --workspace=apps/server

# Integration
npm run db:test:up && npm run db:test:prepare
npm run test:integration -- inventory-flow

# tsc
cd apps/server && npx tsc --noEmit   # B2a 범위 (inventory/stock-transfers/return-transfers/products/util/serialize.ts) 에러 0
```

Note: B2a merge 후에도 전체 repo 의 tsc 는 out-of-scope 도메인 에러로 비non-zero. 해당 domain 은 Plan B2b/B2c 에서 해결.

## 7. Risks

| Risk | Mitigation |
|---|---|
| `BundleStockService` export 전환이 다른 모듈에서 남용될 가능성 | ADR-0014 에 명시: `InventoryService` 전용 호출. `products/CLAUDE.md` Non-export 섹션 갱신 + inventory/CLAUDE.md 에 호출 규약 기록 |
| `recomputeForComponent` fan-out 이 N 클 때 15s timeout 부족 | 현 bundle 수 적음 (경험적 < 20). Integration test #6 이 race 만 검증하고 breadth stress 미포함 — 필요 시 별도 perf plan (B2a 아님) |
| `StockTransfer.update` IDOR 수정 시 기존 호출처 side effect | grep 후 controller 가 `@CurrentCompany()` 을 이미 받고 있으면 companyId pass 만 추가. 그 외에 서비스 signature 변경 없음 |
| `master-product-resolver.ts` 의 `resolveInventory` 제거가 advertising 등 다른 caller 영향 | `resolveInventory` caller 는 advertising/ad-strategy 만 (out-of-scope). 해당 파일은 여전히 import 할 수 있음 → `resolveInventory` 함수는 제거하지 않고 `common/master-product-resolver.ts` 에 **남겨둔 채 inventory 에서 사용만 제거** 로 축소. 파일 전체 삭제는 B2c |
| `StockMovementController` 삭제 시 프론트 호출 | 사용자 확인: 기존 DB 데이터 리셋 + 프론트 Plan D 재작성. 현 시점 깨져도 허용 |
| 기존 `InventoryService` 코드가 이미 `masterProductId` / `prisma.masterInventory` 등 Plan A 이후 존재하지 않는 필드 참조 → compile-broken 상태 | 이 사실을 전제로 **전체 재작성**. "기존 로직 보존" 의도 없음 |
| `toSerializable` BigInt guard 가 products 도메인 touch (cross-domain) | Plan B1 이월 #4 = 예외적 micro touch. PR 설명에 "Plan B1 follow-up (#4)" 명시. Test 로 보호 |
| Integration test DB 시드 오염 | `kiditem_test` 스키마 분리 (기 확립), `db:test:prepare` 로 초기화 |

## 8. Migration + Rollout

### 8.1 데이터 마이그레이션

**불필요**. Prisma schema 는 이미 Plan A 에서 optionId 기반으로 재편. 기존 DB 데이터는 Plan A 전환 시점에 reset/reseed 된 것으로 간주 (사용자 확인).

### 8.2 Rollout 시퀀스

1. **Micro PR**: `fix/products-plan-b1-followups` (이월 1/2/3) — 독립 merge
2. **B2a 브랜치**: `feat/plan-b2a-inventory` from `origin/main`
3. **B2a 구현**: Plan 단계에서 task 분할 + 각 task TDD (Plan B1 패턴)
4. **검증**: tsc (in-scope 0 error) + vitest + integration 전체 PASS
5. **Adversarial review**: 각 task spec+quality 2단계 + final e2e 1단계 (Plan B1 retrospective)
6. **Merge to main** → 다음 plan 세션 진입 (A.5 또는 B2b)

### 8.3 CLAUDE.md / ADR 업데이트

**CLAUDE.md**:
- `apps/server/src/inventory/CLAUDE.md` 신설:
  - Single InventoryService 규약 (ADR-0014)
  - Hook firing 원칙 + `BundleStockService.recomputeForComponent` 호출 경로
  - 3-tier 테스트 규약
- `apps/server/CLAUDE.md` Domain Guides 표에 `src/inventory/` 진입 (Notable Sub-Domains 에서 제거)
- `apps/server/src/products/CLAUDE.md` Non-export 섹션에서 `BundleStockService` 제거 + "Export (restricted): BundleStockService — InventoryService 전용 호출" 명시
- `prisma/CLAUDE.md` 에 "StockTransaction 은 InventoryService 의 내부 ledger, 직접 access 금지" 1줄

**ADR**:
- `.claude/docs/decisions/0014-stock-mutation-single-writer.md` 신설. 제목: "InventoryService 가 Inventory.currentStock 단독 writer". Decision / Rationale / Consequences / Enforcement (grep pattern). Plan A.5 / B2b / B2c 가 이 invariant 따르도록.

## 9. Open Questions (Plan 단계에서 해결)

- `kiditem_test` 스키마에 seed fixture (Master + Option + BundleComponent + Inventory 조합) 공용 helper 가 필요 — Plan B1 integration test 의 inline 패턴 재사용 여부 확인
- `InventoryService.list` 의 Prisma `include` depth 최적화 (option→master join) vs 2-step query (list + batch masters)
- `relatedType` enum 화 여부 (현 `string`) — Plan A.5 / B2c 에서 `'OrderLineItem'`, `'PickingItem'`, `'ReturnTransfer'` 등 후보가 확정되면 enum 도입 고려

---

**End of spec v2.**
