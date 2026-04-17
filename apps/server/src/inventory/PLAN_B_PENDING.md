# Plan B pending work — Inventory module

Plan A (schema transition) 에서 Prisma 의 `Inventory`/`StockTransaction`/
`StockTransfer`/`PickingItem`/`ReturnTransfer` 모델이 `productId` → `optionId`
로 rename 됨. 이 module 의 service 코드는 아직 기존 `productId` 를 참조 →
Plan B 에서 수정 필요.

파일 목록 (Plan A 시점):
- `inventory.service.ts`
- `stock-transaction.service.ts`
- `stock-transfer.service.ts`
- `stock-audit.service.ts`
- `picking.service.ts`
- `return-transfer.service.ts`

Plan B 에서 각 service 의 `productId` → `optionId` 교체 + 새 products-v2
module 과 통합.
