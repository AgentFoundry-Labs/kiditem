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
