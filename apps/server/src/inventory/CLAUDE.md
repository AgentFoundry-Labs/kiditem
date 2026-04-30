# apps/server/src/inventory — Inventory Owner Domain

Plan B2a (2026-04-18) introduced the unified inventory writer. PR #145 folded
`warehouses`, `stock-transfers`, `stock-audits`, and `picking` into
`inventory/` as capabilities and reorganised the whole owner domain along the
[Backend Architecture Contract](../../../../docs/superpowers/plans/2026-04-29-backend-architecture-contract.md):
**Domain-first modular architecture with Application orchestration and selective
Hexagonal Ports**. PR #146 finalised the port/adapter naming used here.

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

Controller file names may be capability-shortened (e.g. `transfers.controller.ts`,
`audits.controller.ts`) but the `@Controller(...)` route shape stays exactly as
above — capability owns route, file name owns code locality.

## Topology

```
inventory/
├── inventory.module.ts                       ← single AppModule mount point + port↔adapter bindings
├── adapter/
│   ├── in/http/                              ← controllers + DTOs (HTTP DTO binding only)
│   │   ├── inventory.controller.ts           (@Controller('inventory'))
│   │   ├── unshipped.controller.ts           (@Controller('unshipped'))
│   │   ├── warehouses.controller.ts          (@Controller('warehouses'))
│   │   ├── transfers.controller.ts           (@Controller('stock-transfers'))
│   │   ├── audits.controller.ts              (@Controller('stock-audits'))
│   │   ├── picking.controller.ts             (@Controller('picking'))
│   │   └── dto/                              ← every class-validator DTO
│   └── out/
│       ├── repository/                       ← Prisma access (sole PrismaService import lane)
│       │   ├── inventory.repository.adapter.ts            (write paths + tx + row lock)
│       │   ├── inventory-query.repository.adapter.ts      (reads + unshipped read)
│       │   ├── warehouses.repository.adapter.ts
│       │   ├── transfers.repository.adapter.ts
│       │   ├── audits.repository.adapter.ts
│       │   ├── picking.repository.adapter.ts              (picking lists/items, completePickingList tenant guard)
│       │   └── confirmed-orders.repository.adapter.ts     (cross-domain read snapshot for picking)
│       └── products/
│           └── bundle-stock.adapter.ts       ← only call site of BundleStockService.recomputeForComponent
├── application/
│   ├── port/
│   │   ├── in/                               ← use-case interfaces (controllers depend on these)
│   │   │   ├── inventory.port.ts             (INVENTORY_PORT)
│   │   │   ├── unshipped.port.ts             (UNSHIPPED_PORT)
│   │   │   ├── warehouses.port.ts            (WAREHOUSES_PORT)
│   │   │   ├── transfers.port.ts             (TRANSFERS_PORT)
│   │   │   ├── audits.port.ts                (AUDITS_PORT)
│   │   │   └── picking.port.ts               (PICKING_PORT)
│   │   └── out/                              ← what application services need from outside
│   │       ├── inventory.repository.port.ts
│   │       ├── inventory-query.repository.port.ts
│   │       ├── warehouses.repository.port.ts
│   │       ├── transfers.repository.port.ts
│   │       ├── audits.repository.port.ts
│   │       ├── picking.repository.port.ts
│   │       ├── confirmed-orders.port.ts      (cross-domain read port)
│   │       └── bundle-stock.port.ts          (cross-domain write port → products)
│   └── service/                              ← use-case orchestration; NO PrismaService, NO adapter/out import
│       ├── inventory.service.ts              (single writer; ADR-0014 invariant)
│       ├── unshipped.service.ts
│       ├── warehouses.service.ts
│       ├── transfers.service.ts
│       ├── audits.service.ts
│       └── picking.service.ts
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
    ├── inventory.architecture.spec.ts        ← port/adapter contract guards (six invariants)
    └── inventory-flow.pg.integration.spec.ts ← real Postgres atomicity / fan-out
```

`__tests__/` lives alongside the source it covers
(`application/service/__tests__/*.spec.ts`,
`domain/policy/__tests__/*.spec.ts`).

## Architecture guard rules (frozen by `inventory.architecture.spec.ts`)

- **PrismaService scope** — `PrismaService` is imported **only** under
  `inventory/adapter/out/repository/**`. Application services compose use
  cases via outgoing ports; they never inject `PrismaService` directly.
- **Application Prisma-free** — `inventory/application/**` must not import
  `@prisma/client` or expose `Prisma.*` types. Prisma row/update/transaction
  details are translated behind outgoing adapters.
- **No `*persistence.ts` final naming** — the spec fails if any
  `*persistence.ts` survives under `apps/server/src/inventory`. Repository
  adapters use `*.repository.adapter.ts`. `persistence` is a migration
  waypoint for legacy domains, not a target for inventory.
- **No `adapter/out/**` import from `application/service/**`** —
  application services depend on `application/port/out/*` contracts only.
  Concrete adapters reach application code through Nest token bindings
  (`useExisting`) declared in `inventory.module.ts`.
- **No products coupling from `application/service/**`** — no
  `ProductsModule`, `BundleStockService`, or `products/application|adapter|domain`
  imports inside `application/service/**`. Products is reached through
  `BundleStockPort`; the only call site of
  `BundleStockService.recomputeForComponent` is
  `adapter/out/products/bundle-stock.adapter.ts`.
- **Controllers depend on incoming ports** — `adapter/in/http/**` cannot
  import `application/service/**`. Controllers `@Inject` an `application/port/in/*`
  token and program against the port interface.
- **Domain purity** — `inventory/domain/**` must not import `@nestjs`,
  `@prisma/client`, `PrismaService`, files from `adapter/in/http`, or any
  `*.dto` module. Pure functions + plain types only.
- **No top-level capability folders** — adding
  `apps/server/src/{warehouses,stock-transfers,stock-audits,picking,unshipped}`
  back is a regression. Capabilities live as `inventory/<capability>` files.

## 핵심 규약

### 단일 writer invariant (ADR-0014 inheritance)

`Inventory.currentStock` / `Inventory.reservedStock` 변경은 오직
`InventoryService.receive()` / `issue()` / `adjust()` 경유. 외부 호출자는
`INVENTORY_PORT` (in port) 만 inject 한다 (`InventoryModule` 의 유일한
cross-module export).

`prisma.inventory.update({ currentStock })` 직접 호출 금지.
`prisma.stockTransaction.create()` 직접 호출 금지 — ledger append 는
`InventoryRepositoryAdapter.appendStockLedger` 가 owner.

### Stock mutation 원자 시퀀스

`InventoryRepositoryAdapter.runInventoryStockMutation(id, companyId, op)` 가
transaction boundary + Postgres row lock + tenant guard 를 캡슐화한다. 호출 시:

1. `$transaction({ timeout: 15_000 })` 진입
2. `tx.$queryRaw SELECT id FROM inventory WHERE id = $id::uuid AND company_id = $companyId::uuid FOR UPDATE` — row lock + tenant predicate
3. `tx.inventory.findFirst({ id, companyId })` — IDOR guard (lock 후 재확인)
4. `op(tx, lockedRow)` — application service callback

Application service 의 `applyDelta` callback (전부 ports 만 사용):

1. `assertSufficientStock(currentStock, delta)` — domain policy
2. `repository.applyStockDelta(tx, ...)` — `inventory.update({ currentStock: { increment: delta } })`
3. `repository.findOptionNameForLedger(tx, optionId, companyId)` — tenant-scoped 조회
4. `repository.appendStockLedger(tx, { ..., quantity: computeStoredQuantity(type, delta) })`
5. `bundleStock.recomputeForComponent(companyId, optionId, tx)` — fan-out (BundleStockPort)

### BundleStockPort 호출 규약

`BundleStockPort.recomputeForComponent` 의 유일한 구현은
`adapter/out/products/bundle-stock.adapter.ts` 이고, 그 adapter 만이
`BundleStockService.recomputeForComponent` 를 호출한다 (ADR-0014 단일-writer
invariant). `application/service/**` 는 `BundleStockService` 를 직접 import 하지
못하며 architecture spec 이 회귀를 차단한다.

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

`InventoryModule` 은 `INVENTORY_PORT` 만 export 한다. orders / procurement /
advertising / channels 등은 `@Inject(INVENTORY_PORT) inv: InventoryPort` 형태로
주입하고, port interface 만으로 inventory state 를 변경한다. 다른 capability
service (warehouses/transfers/...) 는 외부에 노출되지 않으며, 필요하면
`InventoryModule` 내부 cross-capability orchestration 으로 흡수한다.

## Shared types

`@kiditem/shared/inventory` (`packages/shared/src/schemas/inventory.ts`).
Application service return shapes follow these contracts; repository adapters
return Prisma row types and the mapper layer is the seam.

## 테스트 전략

| Tier | 위치 | 목적 |
|---|---|---|
| Domain policy unit | `domain/policy/__tests__/*.spec.ts` | pure 함수 (status, mutation, transfer transition, picking rules) 검증 |
| Application service unit | `application/service/__tests__/*.spec.ts` | use-case orchestration. Outgoing ports 를 fake 로 갈아끼움 |
| Module wiring | `__tests__/inventory.module.wiring.spec.ts` | @Module / @Controller metadata 동결 (port↔adapter binding 포함) |
| Architecture guard | `__tests__/inventory.architecture.spec.ts` | PrismaService scope / no-persistence / service↛adapter / service↛products / controller↛port / domain purity ripgrep 검사 |
| Integration (real Postgres) | `__tests__/inventory-flow.pg.integration.spec.ts` | atomic mutation / bundle fan-out / IDOR / record-only invariant |

`controller e2e` 는 별도 추가하지 않는다. `dev:server` boot + `RoutesResolver` /
`RouterExplorer` log + `curl` 이 routing 표면을 검증한다 (Phase 3B verification
gate).

## 금지 패턴

- Application service 에서 `PrismaService` import — `inventory.architecture.spec.ts` 가 잡는다.
- Application service 에서 `adapter/out/**` 또는 `BundleStockService` 직접 import — 동일.
- Controller 에서 `application/service/**` 직접 import — 동일.
- Domain layer 에서 `@nestjs`, `@prisma/client`, `PrismaService`, `*.dto`, `adapter/in/http` import — 동일.
- `*persistence.ts` 신규 추가 — 동일 (architecture spec).
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
