# Plan B2a — Inventory Service Layer (Design Spec)

> **Status**: Draft — pending user approval
> **Session**: 2026-04-18
> **Predecessors**: [Plan A spec](2026-04-17-product-schema-redesign-design.md), [Plan B1 spec](2026-04-17-plan-b1-products-module-design.md), [ADR-0013](../../../.claude/docs/decisions/0013-product-schema-3layer.md)
> **Branch**: `feat/plan-b2a-inventory` (from `origin/main`)

---

## 1. Goal

Plan A 의 3-layer Prisma schema (Master + ProductOption + BundleComponent) 를 Inventory 도메인 service layer 에 적용한다. Inventory 는 `optionId` 1:1 로 재정의되었고, Bundle ProductOption 의 `availableStock` 은 `BundleStockService.recompute` 로 materialize 된다. 이 Plan 은 stock mutation 의 **단일 원자 경로**를 확립하고 bundle fan-out 을 시스템 invariant 로 고정한다.

## 2. Scope Decomposition

Plan B2 전체 (advertising / orders / inventory / supplier / channels / misc, 394 TS errors, ~20 services) 는 단일 spec 으로는 Plan B1 의 2-3 배 규모. Phased 로 분할:

| Plan | Scope | 의존 |
|---|---|---|
| `fix/products-plan-b1-followups` | Plan B1 이월 1/2/3 micro PR (MastersController options ordering, BundleComponentsService race, MastersService race) | Plan B1 |
| **Plan B2a (이 spec)** | **Inventory service layer + BundleStockService hook 배선 + transfers (record-only) + Plan B1 이월 #4 (toSerializable BigInt guard)** | Plan B1 |
| Plan A.5 | Order schema 통합 (Generic `Order` + `OrderLineItem`, `CoupangOrder`/`CoupangOrderItem`/`CoupangReturn` 폐기) | Plan B1 |
| Plan B2b | Advertising service rewrite (ad-action/benchmark/campaigns/collect/config/execution/strategy/sync) | Plan A.5 (OrderLineItem 기반 집계) |
| Plan B2c | Orders + channels + supplier + statistics + action-task + traffic + rules + settlements + procurement + uploads + sourcing catch-all. `dev:server` 부팅 목표 | Plan A.5, B2b |
| Plan B2.picking | Picking redesign (OrderLineItem 기반 generate) | Plan A.5 |

**이 spec 은 Plan B2a 만 다룬다.** 다른 plan 은 별도 spec.

## 3. In-Scope / Out-of-Scope

### 3.1 In-scope files

| Path | 작업 |
|---|---|
| `apps/server/src/inventory/controllers/inventory.controller.ts` | URL 재설계 (`POST /:id/transactions` 통합 endpoint, `GET /option/:optionId` 자연키 lookup, legacy `/by-product/:productId` 제거), `@CurrentCompany()` 적용 |
| `apps/server/src/inventory/services/inventory.service.ts` | read-only 재작성 (`list`, `findById`, `findByOptionId`). `currentStock` 변경 경로 제거 (StockMovementService 로 이관). `resolveInventory` 호출 제거 |
| `apps/server/src/inventory/services/stock-movement.service.ts` | **신규 단일 진입점**. `execute(inventoryId, input, companyId)` 메서드. row lock → Inventory.update → StockTransaction.create → bundle fan-out 원자 시퀀스 |
| `apps/server/src/inventory/services/unshipped.service.ts` | `prisma.company.findFirst` 제거 → `companyId` parameter. 나머지 schema 변경 없음 (UnshippedItem 테이블 자체는 clean) |
| `apps/server/src/inventory/dto/*` | `ListInventoryQueryDto`, `CreateStockTransactionDto` 재작성. 기존 `ReceiveStockBodyDto` 삭제 (통합됨) |
| `apps/server/src/inventory/inventory.module.ts` | `StockMovementService` 추가 등록, `BundleStockService` import (ProductsModule 재export or direct) |
| `apps/server/src/stock-transfers/stock-transfers.service.ts` + `dto/*` | optionId 기반 DTO 정리. `currentStock` 변경 없음 (record-only) 을 코드에 고정. 기존 controller 유지 |
| `apps/server/src/return-transfers/return-transfers.service.ts` + `dto/*` | 동일 정리 |
| `apps/server/src/products/services/bundle-stock.service.ts` | **신규 메서드** `recomputeForComponent(componentOptionId, tx)`: 해당 option 을 component 로 쓰는 모든 bundle option 조회 + 각각 `recompute(bundleOptionId, tx)`. 기존 `recompute` 시그니처 불변 |
| `apps/server/src/products/utils/serialize.ts` | **Plan B1 이월 #4**: `toSerializable` 에 BigInt guard 추가. `$queryRaw` 가 반환하는 BigInt → Number 또는 String 변환 |
| `apps/server/src/common/master-product-resolver.ts` | **삭제**. 호출처 (`inventory.service` 외) 전수 migrate 후 제거 |
| `packages/shared/src/types/inventory.ts` | 재작성. `Inventory`, `InventoryListItem`, `InventorySummary`, `InventoryListResponse`, `StockMovementType`, `StockMovementInput`, `StockTransactionResult` + zod schemas |

### 3.2 Out-of-scope (별도 plan)

- `apps/server/src/orders/` (Plan A.5 후 B2c)
- `apps/server/src/advertising/` (Plan B2b)
- `apps/server/src/channels/` (Plan B2c)
- `apps/server/src/picking/` (Plan B2.picking — Plan A.5 후)
- `apps/server/src/stock-audits/` (이미 clean)
- `apps/server/src/rules/`, `apps/server/src/dashboard/`, `apps/server/src/finance/` (B2c / B3)
- `apps/web/*` (Plan D, frontend rewrite)

### 3.3 Out-of-B2a (micro PR before B2a)

- `fix/products-plan-b1-followups` — Plan B1 이월 1/2/3 (5줄 수준, products 도메인 micro fix)

## 4. Architecture

### 4.1 Invariants (Plan A schema 규약)

- Inventory 는 ProductOption 과 **1:1 unique**. `inventory.option_id UNIQUE`.
- MasterInventory / MasterProduct.inventory 개념 **없음**. Inventory 는 오직 option level.
- Bundle ProductOption 의 `availableStock` 은 **materialized** — `BundleStockService.recompute` 로만 갱신.
- `StockTransaction` 은 optionId 기반 append-only ledger.

### 4.2 Service 경계

| Service | 책임 | 금지 |
|---|---|---|
| `InventoryService` | read-only (`list`, `findById`, `findByOptionId`) + metadata-only updates (safety stock, lead time, warehouse label) | `currentStock` / `reservedStock` 변경 |
| `StockMovementService` (신규) | **모든 `currentStock` 변경의 유일한 경로**. receive/issue/adjust 단일 메서드. row-lock + ledger + bundle fan-out 원자화 | InventoryService 를 거치지 않은 직접 `prisma.inventory.update({ currentStock })` |
| `BundleStockService` | `recompute(bundleOptionId, tx)` (기존) + `recomputeForComponent(componentOptionId, tx)` (신규 fan-out) | fan-out 을 caller 가 직접 orchestration |

### 4.3 StockMovementService.execute 원자 시퀀스

```ts
@Injectable()
export class StockMovementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bundleStock: BundleStockService,
  ) {}

  /**
   * 모든 currentStock 변경의 유일한 진입점.
   * - RECEIVE: +quantity
   * - ISSUE:   -quantity (음수 결과 시 BadRequestException)
   * - ADJUST:  +/- quantity (음수 결과 시 BadRequestException)
   *
   * timeout 15000ms — $queryRaw row lock + BundleStockService fan-out 고려.
   */
  async execute(
    inventoryId: string,
    input: StockMovementInput,
    companyId: string,
  ): Promise<StockTransactionResult> {
    return this.prisma.$transaction(async (tx) => {
      // 1) row lock on inventory
      await tx.$queryRaw`SELECT id FROM inventory WHERE id = ${inventoryId}::uuid FOR UPDATE`;

      // 2) read + company guard (IDOR)
      const inv = await tx.inventory.findFirst({ where: { id: inventoryId, companyId } });
      if (!inv) throw new NotFoundException('Inventory');

      // 3) delta
      const delta = computeDelta(input);   // RECEIVE: +q, ISSUE: -q, ADJUST: +/-q
      const nextStock = inv.currentStock + delta;
      if (nextStock < 0) throw new BadRequestException(`insufficient stock (current=${inv.currentStock}, delta=${delta})`);

      // 4) mutate + ledger
      const updated = await tx.inventory.update({
        where: { id: inventoryId },
        data: {
          currentStock: { increment: delta },
          lastRestockedAt: input.type === 'RECEIVE' ? new Date() : inv.lastRestockedAt,
        },
      });

      const transaction = await tx.stockTransaction.create({
        data: {
          companyId,
          optionId: updated.optionId,
          optionName: null,          // denormalization optional — fill via separate lookup if needed
          type: input.type,
          quantity: Math.abs(delta),
          unitCost: input.unitCost ?? 0,
          totalCost: (input.unitCost ?? 0) * Math.abs(delta),
          warehouseId: input.warehouseId,
          relatedId: input.relatedId,
          relatedType: input.relatedType,
          note: input.note,
        },
      });

      // 5) bundle fan-out — encapsulated in BundleStockService
      const recomputedBundleOptionIds = await this.bundleStock.recomputeForComponent(
        updated.optionId,
        tx,
      );

      return {
        inventory: toSerializable(updated) as Inventory,  // products/utils/serialize.ts — Decimal/BigInt/Date 직렬화
        transaction: { id: transaction.id, optionId: transaction.optionId, type: transaction.type as StockMovementType, quantity: transaction.quantity, createdAt: transaction.createdAt.toISOString() },
        recomputedBundleOptionIds,
      };
    }, { timeout: 15_000 });
  }
}
```

### 4.4 BundleStockService.recomputeForComponent (신규)

```ts
/**
 * 이 option 을 component 로 사용하는 모든 활성 bundle option 에 대해
 * recompute(bundleOptionId, tx) 를 호출한다. 반환값은 갱신된 bundle option id 리스트.
 * fan-out orchestration 을 이 서비스에 캡슐화 — caller 는 optionId 만 넘긴다.
 */
async recomputeForComponent(
  componentOptionId: string,
  tx: Prisma.TransactionClient,
): Promise<string[]> {
  const components = await tx.bundleComponent.findMany({
    where: { componentOptionId, isDeleted: false },
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
| `POST /inventory/:id/transactions` | 예 (StockMovementService.execute) | 예 (execute 내부) |
| `StockTransfer.create / update` | 아니오 (Inventory 1:1 option, warehouse는 label) | 아니오 |
| `ReturnTransfer.create / update` | 아니오 | 아니오 |
| `InventoryService` metadata update (safety stock 등) | 아니오 | 아니오 |

Transfer 는 record-keeping only. `currentStock` 변경이 필요하면 StockMovementService.execute 를 호출하는 것이 원칙 (Transfer 내부에서 호출하지 않음 — 현재 Transfer 는 감사 기록 역할).

### 4.6 Controller surface

```
GET    /api/inventory                        — list (query: page, limit, status, optionId?, masterId?)
GET    /api/inventory/:id                    — detail (by inventory.id)
GET    /api/inventory/option/:optionId       — detail (by option natural key)
POST   /api/inventory/:id/transactions       — create stock transaction (RECEIVE/ISSUE/ADJUST 통합)

(legacy 제거)
  PATCH /api/inventory/:id/receive           — 제거 (통합 endpoint 로 대체)
  GET   /api/inventory/by-product/:productId — 제거
```

### 4.7 Helper 정리

- `common/master-product-resolver.ts` — 삭제. Plan A 후 무의미. 호출처 전수 migrate 후 제거 (tsc 로 미제거 caller 차단).
- `products/utils/serialize.ts` 의 `toSerializable` — BigInt guard 추가:

```ts
// Plan B1 이월 #4 — $queryRaw 가 반환하는 BigInt 대응
export function toSerializable<T>(v: T): T {
  if (typeof v === 'bigint') return Number(v) as unknown as T;   // safe: stock 수량 Int 범위
  if (Array.isArray(v)) return v.map(toSerializable) as unknown as T;
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, toSerializable(val)]),
    ) as T;
  }
  return v;
}
```

## 5. API contract + Shared types

### 5.1 `packages/shared/src/types/inventory.ts`

```ts
import { z } from 'zod';

// Prisma 1:1 base type
export interface Inventory {
  id: string;
  optionId: string;
  companyId: string;
  currentStock: number;
  reservedStock: number;
  safetyStock: number;
  reorderPoint: number;
  reorderQuantity: number;
  leadTimeDays: number | null;
  dailySalesAvg: string;          // Decimal → string
  warehouseLocation: string | null;
  lastRestockedAt: string | null; // ISO
  createdAt: string;              // ISO
  updatedAt: string;              // ISO
}

// Derived status — client-facing
export type InventoryStatus = 'healthy' | 'low' | 'out';
export function deriveStatus(currentStock: number, reorderPoint: number): InventoryStatus {
  if (currentStock <= 0) return 'out';
  if (currentStock <= reorderPoint) return 'low';
  return 'healthy';
}

// List row
export interface InventoryListItem {
  id: string;
  optionId: string;
  masterId: string;
  sku: string;
  masterName: string;
  optionName: string | null;
  kind: 'SIMPLE' | 'BUNDLE';
  currentStock: number;
  availableStock: number;         // bundle: materialized. simple: = currentStock
  safetyStock: number;
  reorderPoint: number;
  leadTimeDays: number | null;
  warehouseLocation: string | null;
  status: InventoryStatus;
}

export interface InventorySummary {
  total: number;
  healthy: number;
  low: number;
  out: number;
}

export interface InventoryListResponse {
  items: InventoryListItem[];
  total: number;
  page: number;
  limit: number;
  summary: InventorySummary;
}

// Stock movement
export type StockMovementType = 'RECEIVE' | 'ISSUE' | 'ADJUST';

export interface StockMovementInput {
  type: StockMovementType;
  quantity: number;               // RECEIVE/ISSUE: 양수. ADJUST: +/-
  unitCost?: number;
  warehouseId?: string;
  relatedId?: string;
  relatedType?: string;
  note?: string;
}

export interface StockTransactionResult {
  inventory: Inventory;
  transaction: {
    id: string;
    optionId: string;
    type: StockMovementType;
    quantity: number;
    createdAt: string;
  };
  recomputedBundleOptionIds: string[];
}

// Zod
export const zStockMovementType = z.enum(['RECEIVE', 'ISSUE', 'ADJUST']);
export const zStockMovementInput = z.object({
  type: zStockMovementType,
  quantity: z.number().int(),
  unitCost: z.number().int().nonnegative().optional(),
  warehouseId: z.string().uuid().optional(),
  relatedId: z.string().uuid().optional(),
  relatedType: z.string().max(50).optional(),
  note: z.string().max(500).optional(),
});
export const zInventoryListItem = z.object({ /* ... mirrors interface */ });
```

### 5.2 DTOs (`apps/server/src/inventory/dto/`)

`list-inventory-query.dto.ts`:
```ts
export class ListInventoryQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)  page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @IsIn(['healthy', 'low', 'out']) status?: InventoryStatus;
  @IsOptional() @IsUUID() optionId?: string;
  @IsOptional() @IsUUID() masterId?: string;
}
```

`create-stock-transaction.dto.ts`:
```ts
export class CreateStockTransactionDto {
  @IsIn(['RECEIVE', 'ISSUE', 'ADJUST']) type!: StockMovementType;
  @IsInt() quantity!: number;
  @IsOptional() @IsInt() @Min(0) unitCost?: number;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsUUID() relatedId?: string;
  @IsOptional() @IsString() @MaxLength(50) relatedType?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
```

## 6. Testing strategy

3-tier (Plan B1 과 동일):

### 6.1 Unit (vitest mock)

- `inventory.service.spec.ts` — `list` filter 조건, `findById` IDOR guard (wrong companyId → NotFound), `findByOptionId` 동일
- `stock-movement.service.spec.ts` — `computeDelta` matrix, InsufficientStock 가드, input validation
- `bundle-stock.recompute-for-component.spec.ts` — fan-out 쿼리 + soft-deleted component 제외 + 반환값 정합성

### 6.2 E2E (HTTP mock)

- `inventory.controller.e2e.spec.ts` — 4 endpoint routing + DTO validation + `@CurrentCompany()` + guard. Body/Query 정상/비정상 케이스

### 6.3 Integration (real Postgres)

`inventory-flow.integration.spec.ts`:

1. **Receive → bundle fan-out**: option A (simple) + bundle B (component A, qty=2). `POST /inv/:idA/transactions {type:RECEIVE, quantity:10}` → A.currentStock=10, B.availableStock=5
2. **Issue → bundle fan-out decrease**: 위 상태 → `POST /inv/:idA/transactions {type:ISSUE, quantity:4}` → A.currentStock=6, B.availableStock=3
3. **Insufficient stock → BadRequest**: A.currentStock=3 → ISSUE 5 → 400, A/ledger/bundle 불변
4. **ADJUST 음수**: A.currentStock=10 → `ADJUST quantity:-4` → A=6, B=3. 로그 type=ADJUST quantity=4
5. **Concurrent receive → 순차 (race-free)**: 2 concurrent `RECEIVE 10` → A.currentStock=20 (row lock 검증)
6. **Soft-deleted component 제외**: BundleComponent.isDeleted=true → fan-out 에서 제외, 해당 bundle.availableStock 불변
7. **Transfer 는 currentStock 불변**: `stockTransfer.create` + `returnTransfer.create` 양쪽 모두 → inventory.currentStock 변경 없음 확인 (record-only 규약 lock-in)
8. **Metadata-only update** (InventoryService) → StockTransaction 생성 안 됨, `recomputedBundleOptionIds` 호출 없음

### 6.4 검증 명령

```bash
# Unit + E2E
npm run test --workspace=apps/server

# Integration
npm run db:test:up && npm run db:test:prepare
npm run test:integration -- inventory-flow

# tsc
cd apps/server && npx tsc --noEmit   # inventory/stock-transfers/return-transfers 파일 에러 0
```

## 7. Risks

| Risk | Mitigation |
|---|---|
| `common/master-product-resolver.ts` 제거 시 stale caller 남음 | `grep -rn "resolveInventory\|masterProductResolver"` 전수 migrate. 삭제 후 tsc 가 caller 차단 |
| `toSerializable` BigInt guard 영향 범위 (products 도메인 touch) | Plan B1 이월 #4 명시. PR 설명에 기록. 테스트: `toSerializable.spec.ts` 에 BigInt 케이스 추가 |
| StockTransfer/ReturnTransfer 가 과거 어딘가에서 currentStock 변경 코드 흔적 남김 | 코드 grep + test 로 currentStock 불변 lock-in. 추후 실제 warehouse 단위 재고 필요 시 별도 plan |
| `bundleStockService.recomputeForComponent` fan-out N+1 성능 | 현재 bundle 개수 적음. 필요 시 향후 batch 재계산 (Plan 아님). Integration test 로 fan-out 정합성만 확인 |
| Plan A.5 선행 여부 | B2a 는 Plan A.5 독립. Order 스키마 미건드. Picking 만 out-of-scope |
| Integration test DB 시드 오염 | `kiditem_test` 스키마 분리 (기 확립), `db:test:prepare` 로 초기화 |
| `unshipped.service.ts` 의 `companyId` 파라미터화 호환성 | 기존 호출처가 없는 new method signature 로 바꿔도 caller 전원 migrate. Controller 도 `@CurrentCompany()` 호환 처리 |

## 8. Migration + Rollout

### 8.1 데이터 마이그레이션

**불필요**. Prisma schema 는 이미 Plan A 에서 optionId 기반으로 재편. B2a 는 순수 service layer rewrite. 기존 `init.sql.gz` 데이터는 Plan A migration (Plan A merge 시) 이후 최신.

### 8.2 Rollout 시퀀스

1. **Micro PR**: `fix/products-plan-b1-followups` (이월 1/2/3) — 독립 merge
2. **B2a 브랜치**: `feat/plan-b2a-inventory` from `origin/main`
3. **B2a 구현** (Plan 단계에서 task 분할): task 별 TDD — test 먼저, implementation 나중 (Plan B1 패턴)
4. **tsc + vitest + integration 전체 PASS** 확인 후 PR
5. **Adversarial review** (critic + architect + code-reviewer) — Plan B1 retrospective 적용
6. **Merge to main** → 다음 plan 세션 진입 (A.5 또는 B2b)

### 8.3 CLAUDE.md / ADR 업데이트

- `apps/server/src/inventory/CLAUDE.md` 신설 (Plan B1 의 products CLAUDE.md 패턴 참조):
  - Service 경계 (InventoryService read-only, StockMovementService 단일 변경 경로)
  - Hook firing 원칙
  - 테스트 tier 분리
- `prisma/CLAUDE.md` 에 "StockTransaction optionId invariant" 섹션 추가 (optionId FK + ledger append-only)
- ADR 여부: 본 Plan 은 ADR 수준 결정 없음 (단일 도메인 service rewrite). BundleStockService.recomputeForComponent 는 Plan B1 의 invariant 를 확장한 것이므로 별도 ADR 불필요.

## 9. Open Questions (Plan 단계에서 해결)

- `StockTransaction.optionName` denormalization 을 자동 채울지 (`execute` 가 option.sku 별도 lookup) — 성능 vs 편의 trade-off
- `unshipped.service.ts` 가 `@CurrentCompany()` 제대로 받는지 controller 확인 필요
- `toSerializable` BigInt guard 가 Number 변환 시 safe 한 범위인지 (Int32 범위 충분하면 Number, 아니면 String)
- Integration test 용 seed fixture — BundleComponent 포함 fixture 필요 (Plan B1 에서 만든 helper 재사용 여부 확인)

---

**End of spec.**
