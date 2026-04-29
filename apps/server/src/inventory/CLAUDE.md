# apps/server/src/inventory — Inventory Owner Domain

Plan B2a (2026-04-18) introduced the unified `InventoryService`. The Phase 3B
reconstruction (this PR) folded `warehouses`, `stock-transfers`, `stock-audits`,
and `picking` into `inventory/` as capabilities and reorganised the whole owner
domain along the [Backend Architecture Contract](../../../docs/superpowers/plans/2026-04-29-backend-architecture-contract.md):
**Domain-first modular architecture with Application orchestration and selective
Hexagonal Ports**.

## Owner domain rule

`inventory` is an owner domain. Warehouses / stock-transfers / stock-audits /
picking are not standalone owner domains; they are inventory capabilities.
`AppModule` imports only `InventoryModule`. New inventory-side surfaces live as
capability files inside `inventory/adapter|application|domain|mapper/**`. Do
not create top-level `apps/server/src/<capability>/` for inventory work.

| Capability | Public route (frozen) |
|---|---|
| Inventory + StockTransaction | `/api/inventory/*` |
| Unshipped read | `/api/unshipped/*` |
| Warehouses | `/api/warehouses/*` |
| Stock transfers | `/api/stock-transfers/*` |
| Stock audits | `/api/stock-audits/*` |
| Picking | `/api/picking/*` |

## Topology

```
inventory/
├── inventory.module.ts                       ← single mount point in AppModule
├── adapter/
│   ├── in/http/                              ← controllers + DTOs (HTTP DTO binding only)
│   │   ├── inventory.controller.ts
│   │   ├── unshipped.controller.ts
│   │   ├── warehouses.controller.ts
│   │   ├── stock-transfers.controller.ts
│   │   ├── stock-audits.controller.ts
│   │   ├── picking.controller.ts
│   │   └── dto/                              ← every class-validator DTO
│   └── out/prisma/                           ← only place PrismaService is imported
│       ├── inventory.query.ts
│       ├── inventory.persistence.ts
│       ├── unshipped.query.ts
│       ├── warehouses.persistence.ts
│       ├── stock-transfers.persistence.ts
│       ├── stock-audits.persistence.ts
│       └── picking.persistence.ts
├── application/service/                      ← use-case orchestration; no PrismaService
│   ├── inventory-application.service.ts
│   ├── unshipped-query.service.ts
│   ├── warehouses-application.service.ts
│   ├── stock-transfers-application.service.ts
│   ├── stock-audits-application.service.ts
│   └── picking-application.service.ts
├── domain/
│   ├── model/                                ← pure types (StockMutationRequest)
│   └── policy/                               ← pure rules (no Nest, no Prisma)
│       ├── inventory-status.ts               (deriveInventoryStatus)
│       ├── stock-mutation.ts                 (assertSufficientStock, computeStoredQuantity, deriveStockDelta)
│       ├── stock-transfer-transition.ts      (assertValidStockTransferTransition + VALID_TRANSITIONS)
│       └── picking-rules.ts                  (extractPickableItems)
├── mapper/                                   ← Prisma row ↔ @kiditem/shared/inventory
│   ├── inventory.mapper.ts
│   └── stock-transaction.mapper.ts
└── __tests__/
    ├── inventory.module.wiring.spec.ts       ← @Module/@Controller metadata freeze
    ├── inventory.architecture.spec.ts        ← PrismaService scope + domain purity guards
    └── inventory-flow.pg.integration.spec.ts ← real Postgres atomicity / fan-out
```

`__tests__/` lives alongside the source it covers
(`application/service/__tests__/*.spec.ts`,
`domain/policy/__tests__/*.spec.ts`).

## Architecture guard rules (frozen by `inventory.architecture.spec.ts`)

- **PrismaService scope** — `PrismaService` is imported **only** under
  `inventory/adapter/out/prisma/**`. Application services compose use cases via
  `*Persistence` / `*Query` injection and never reach for the Prisma client
  directly. The runtime check is enforced by
  `inventory.architecture.spec.ts → PrismaService is imported only under inventory/adapter/out/prisma/**`.
- **Domain purity** — `inventory/domain/**` must not import `@nestjs`,
  `@prisma/client`, `PrismaService`, files from `adapter/in/http`, or any
  `*.dto` module. Pure functions + plain types only.
- **No top-level capability folders** — adding
  `apps/server/src/{warehouses,stock-transfers,stock-audits,picking,unshipped}`
  back is a regression. Capabilities live as `inventory/<capability>` files.

## 핵심 규약

### 단일 writer invariant (ADR-0014 inheritance)

`Inventory.currentStock` / `Inventory.reservedStock` 변경은 오직
`InventoryApplicationService.receive()` / `issue()` / `adjust()` 경유.
외부 호출자는 `InventoryApplicationService` 만 주입한다 (`InventoryModule`이
유일하게 export 하는 cross-module 진입점).

`prisma.inventory.update({ currentStock })` 직접 호출 금지.
`prisma.stockTransaction.create()` 직접 호출 금지 — ledger append 는
`InventoryPersistence.appendStockLedger` 가 owner.

### Stock mutation 원자 시퀀스

`InventoryPersistence.runInventoryStockMutation(id, companyId, op)` 가 transaction
boundary + Postgres row lock + tenant guard 를 캡슐화한다. 호출 시:

1. `$transaction({ timeout: 15_000 })` 진입
2. `tx.$queryRaw SELECT id FROM inventory WHERE id = $id::uuid AND company_id = $companyId::uuid FOR UPDATE` — row lock + tenant predicate
3. `tx.inventory.findFirst({ id, companyId })` — IDOR guard (lock 후 재확인)
4. `op(tx, lockedRow)` — application service callback

Application service 의 `applyDelta` callback:

1. `assertSufficientStock(currentStock, delta)` — domain policy
2. `applyStockDelta(tx, ...)` — `inventory.update({ currentStock: { increment: delta } })`
3. `findOptionNameForLedger(tx, optionId, companyId)` — tenant-scoped 조회
4. `appendStockLedger(tx, { ..., quantity: computeStoredQuantity(type, delta) })`
5. `bundleStock.recomputeForComponent(companyId, optionId, tx)` — fan-out (products restricted port)

### BundleStockService 호출 규약

`BundleStockService.recomputeForComponent` 은 `ProductsModule` 의 restricted
export. 오직 `InventoryApplicationService.applyDelta` 만 호출한다 (ADR-0014).

### Stock transfer state machine

`assertValidStockTransferTransition(from, to)` (domain policy) 가 유일한 진실:

- `pending → in_transit | cancelled`
- `in_transit → completed | cancelled`
- 그 외 전환 (예: `completed → *`, `pending → completed`) 은 throw.

### Transfer record-only

`StockTransfer` / `ReturnTransfer` create 는 record-keeping. `currentStock` /
`availableStock` 변경 없음. 이 invariant 는 integration spec `#8` 가 lock-in.

## Controller surface

```
GET    /api/inventory                                 — list (filter: optionId/masterId/status)
GET    /api/inventory/transactions                    — ledger list
GET    /api/inventory/transactions/summary            — aggregate by type
GET    /api/inventory/option/:optionId                — detail by option natural key
GET    /api/inventory/:id                             — detail by inventory id
PATCH  /api/inventory/:id                             — metadata only (currentStock 차단)
POST   /api/inventory/:id/receive                     — 입고
POST   /api/inventory/:id/issue                       — 출고
POST   /api/inventory/:id/adjust                      — 조정
GET    /api/unshipped                                 — 미배송 list

GET    /api/warehouses                                — list
POST   /api/warehouses                                — create
PATCH  /api/warehouses/:id                            — update
DELETE /api/warehouses/:id                            — delete

GET    /api/stock-transfers                           — list (filter: status)
POST   /api/stock-transfers                           — create (record only)
PATCH  /api/stock-transfers/:id                       — status transition

GET    /api/stock-audits                              — list
POST   /api/stock-audits                              — create
PATCH  /api/stock-audits/:id                          — update

GET    /api/picking                                   — list picking lists
POST   /api/picking/generate                          — confirmed orders → picking list
PATCH  /api/picking/:id/items/:itemId                 — pick / verify item
PATCH  /api/picking/:id/complete                      — complete list
```

라우트 정의 순서: 정적 경로 (`/transactions`, `/option/:optionId`, `/generate`,
`/complete`) → `/:id`. NestJS route matching 은 선언 순서 우선.

## 외부 consumer

`InventoryModule` 은 `InventoryApplicationService` 만 export 한다. orders /
procurement / advertising / channels 등은 이 facade 를 통해서만 inventory state
를 변경할 수 있다. 다른 capability application service 는 inventory 외부에서
직접 inject 하지 않는다 (필요시 `InventoryModule` 내부 cross-capability
orchestration 으로 흡수).

## Shared types

`@kiditem/shared/inventory` (`packages/shared/src/schemas/inventory.ts`).
Application service return shapes follow these contracts; persistence/query
adapters return Prisma row types and the mapper layer is the seam.

## 테스트 전략

| Tier | 위치 | 목적 |
|---|---|---|
| Domain policy unit | `domain/policy/__tests__/*.spec.ts` | pure 함수 (status, mutation, transfer transition, picking rules) 검증 |
| Application service unit | `application/service/__tests__/*.spec.ts` | use-case orchestration. Persistence/Query 를 fake 로 갈아끼움 |
| Module wiring | `__tests__/inventory.module.wiring.spec.ts` | @Module / @Controller metadata 동결 |
| Architecture guard | `__tests__/inventory.architecture.spec.ts` | PrismaService scope / domain purity ripgrep 검사 |
| Integration (real Postgres) | `__tests__/inventory-flow.pg.integration.spec.ts` | atomic mutation / bundle fan-out / IDOR / record-only invariant |

`controller e2e` 는 별도 추가하지 않는다. `dev:server` boot + `RoutesResolver` /
`RouterExplorer` log + `curl` 이 routing 표면을 검증한다 (Phase 3B verification
gate).

## 금지 패턴

- Application service 에서 `PrismaService` 를 import — `inventory.architecture.spec.ts` 가 잡는다.
- Domain layer 에서 `@nestjs`, `@prisma/client`, `PrismaService`, `*.dto`, `adapter/in/http` import — 동일.
- `findUnique({ id })` (companyId 없이) — IDOR. 모든 read/update/delete 는 `findFirst({ id, companyId })`.
- `@UseGuards('jwt')` / `@UsePipes(...)` / `@nestjs/passport` — 전역 `CompanyScopeGuard` + `ValidationPipe` 적용됨.
- DTO 에 `companyId` 필드 추가, controller 에서 `@Body/@Query/@Param('companyId')` 수신 — `npm run check:tenant-scope` 가 잡는다.
- top-level `apps/server/src/{warehouses,stock-transfers,stock-audits,picking}` 부활 — capability folder 만 사용.
- `isDeleted` 필터를 `BundleComponent` 에 사용 — hard-delete 모델, 필드 없음. 필요 시 `componentOption: { isDeleted: false }` relation 필터.

## Verification gates (PR 별 필수)

```
npm run build --workspace=apps/server
npm exec --workspace=apps/server -- vitest run src/inventory
npm run check:idor
npm run check:tenant-scope
npm run dev:server   # 부팅 후 RoutesResolver 로그 + curl /api/{inventory,unshipped,warehouses,stock-transfers,stock-audits,picking}
```

Integration tier 는 schema / row-lock / transaction / IDOR 가 변경될 때만:
`npm run db:test:up && npm run db:test:prepare && npm run test:integration`.
