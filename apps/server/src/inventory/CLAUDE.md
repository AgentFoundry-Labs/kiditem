# apps/server/src/inventory — Inventory Domain

Plan B2a (2026-04-18) 가 재작성한 Inventory 도메인. Plan A 3-layer schema (Inventory 1:1 ProductOption) 기반.

## 구조

- `controllers/inventory.controller.ts` — 10 endpoints
- `controllers/unshipped.controller.ts` — 미배송 조회 (단순 wrapper)
- `services/inventory.service.ts` — **단일 통합 서비스** (read + metadata + mutation + ledger)
- `services/unshipped.service.ts` — `UnshippedItem` 조회 (inventory 와 분리된 도메인)
- `dto/*` — class-validator DTO. List/Update/Receive/Issue/Adjust/ListTransactions/TransactionSummary

## 핵심 규약

### ADR-0014 — 단일 writer invariant

`Inventory.currentStock` / `Inventory.reservedStock` 변경은 오직 `InventoryService.receive()` / `issue()` / `adjust()` 경유. 상세: [ADR-0014](../../../../.claude/docs/decisions/0014-stock-mutation-single-writer.md).

외부 호출자 (orders / procurement / picking / advertising 등) 는 `InventoryService` 를 주입하고 semantic 메서드만 호출. `prisma.inventory.update({ currentStock })` 직접 호출 금지. `prisma.stockTransaction.create()` 직접 호출도 금지 (ledger 는 InventoryService 가 자동 append).

### Stock mutation 원자 시퀀스

private `applyDelta(id, delta, txParams, companyId)` 가 소유:

1. `$queryRaw SELECT id FROM inventory WHERE id = ${id}::uuid FOR UPDATE` — row lock
2. `findFirst({ id, companyId })` — IDOR guard
3. bounds check (`nextStock >= 0`, else `BadRequestException`)
4. `inventory.update({ currentStock: { increment: delta } })`
5. `stockTransaction.create` — ledger append (createdBy from `@CurrentUser()`)
6. `bundleStock.recomputeForComponent(optionId, tx)` — fan-out

`$transaction({ timeout: 15_000 })`. Fan-out breadth 15s 내 완료 가정 (현 카탈로그 규모 기준 N < ~50 bundles per component).

### BundleStockService 호출 규약

`BundleStockService.recomputeForComponent` 은 `ProductsModule` 에서 **restricted export**. 오직 `InventoryService` 만 호출. 다른 모듈이 호출 필요해지면 ADR-0014 개정 검토.

### Transfer record-only

`StockTransfer` / `ReturnTransfer` 는 record-keeping 만. `currentStock` / `availableStock` 변경 없음 (Inventory 1:1 option, warehouse 는 label — Inventory schema 에 warehouse FK 없음). Integration test #8 이 이 invariant lock-in.

향후 warehouse 단위 재고가 필요하면 schema 재설계 + 별도 plan.

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

`@kiditem/shared` 의 `packages/shared/src/schemas/inventory.ts` 에 Zod-first 정의. Service return 에 `satisfies <SharedType>` 필수 (Prisma ↔ Shared drift 감지).

## 테스트 tier

| Tier | 파일 | 범위 |
|---|---|---|
| Unit (vitest mock) | `services/__tests__/inventory.service.*.spec.ts` | list/findById/findByOptionId/updateMetadata/receive/issue/adjust/ledger 단위 |
| E2E (HTTP mock) | `controllers/__tests__/inventory.controller.e2e.spec.ts` | 10 endpoint routing + DTO validation + decorator 주입 |
| Integration (real Postgres) | `__tests__/inventory-flow.pg.integration.spec.ts` | 11 시나리오 — 원자성 / bundle fan-out / 동시성 / record-only |

## 금지 패턴

- `@UseGuards('jwt')` / `@UsePipes(...)` / `@nestjs/passport` — 전역 `CompanyScopeGuard` + `ValidationPipe` 적용됨
- `findUnique({ id })` without companyId — IDOR. `findFirst({ id, companyId })` 사용
- Raw `prisma.inventory.update({ currentStock })` 외부 호출 — ADR-0014 위반
- Raw `prisma.stockTransaction.create()` 외부 호출 — 동일
- `isDeleted` 필터를 `BundleComponent` 에 사용 — 해당 모델은 hard-delete, 필드 없음. 필요 시 `componentOption: { isDeleted: false }` 로 relation 필터
