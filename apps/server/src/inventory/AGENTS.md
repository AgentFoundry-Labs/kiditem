# inventory — Owner Domain

Inventory owns stock state, unshipped reads, warehouses, stock transfers,
stock audits, and picking. These are capabilities inside `inventory/`, not
standalone backend owner domains.

Inventory is the strict reference domain for server hexagonal structure. New
behavior must use incoming ports, outgoing repository/cross-domain ports,
application services, pure domain policies, and mappers as described below.

## Public Routes

| Capability | Route |
|---|---|
| Inventory + StockTransaction | `/api/inventory/*` |
| Unshipped read | `/api/unshipped/*` |
| Warehouses | `/api/warehouses/*` |
| Stock transfers | `/api/stock-transfers/*` |
| Stock audits | `/api/stock-audits/*` |
| Picking | `/api/picking/*` |

Route shape is frozen. Controller file names may be short, but
`@Controller(...)` paths stay as listed.

## Layout

```text
inventory/
  inventory.module.ts
  adapter/in/http/          controllers + DTOs
  adapter/out/repository/   the only PrismaService import lane
  adapter/out/products/     BundleStockPort adapter consuming products owner-side port
  application/port/in/      exported use-case ports
  application/port/out/     repository/query/cross-domain ports
  application/service/      orchestration; no Prisma or adapter imports
  domain/policy/            pure stock/status/transfer/picking rules
  mapper/                   Prisma row -> shared contract mapping
  __tests__/                wiring, architecture, integration specs
```

`InventoryModule` exports `INVENTORY_PORT` only. External domains do not inject
warehouse/transfer/audit/picking services directly.

## Architecture Guards

`inventory.architecture.spec.ts` freezes these invariants:

- `PrismaService` imports only under `adapter/out/repository/**`.
- `application/**` does not import `@prisma/client` or expose Prisma types.
- No `*persistence.ts` files under inventory.
- `application/service/**` does not import `adapter/out/**`.
- `application/service/**` does not import ProductsModule, BundleStockService,
  products ports, or products internals. Products writes go through local
  `BundleStockPort`, whose adapter consumes products' owner-side port.
- HTTP controllers depend on incoming ports, not application service classes.
- `domain/**` imports no NestJS, Prisma, DTOs, HTTP adapters, or filesystem.
- No top-level `warehouses`, `stock-transfers`, `stock-audits`, `picking`, or
  `unshipped` folders may be reintroduced.

## Stock Mutation Contract

`Inventory.currentStock` / `reservedStock` changes happen only through
`InventoryService.receive`, `issue`, and `adjust` via `INVENTORY_PORT`.

`InventoryRepositoryAdapter.runInventoryStockMutation(id, organizationId, op)`
owns the transaction, row lock, and tenant guard:

1. start `$transaction({ timeout: 15_000 })`
2. lock `inventory` row by `(id, organizationId)` with `FOR UPDATE`
3. re-read with `findFirst({ id, organizationId })`
4. run application callback

The callback applies domain stock policy, updates stock, appends
`StockTransaction`, hydrates option name for the ledger, and calls
`BundleStockPort.recomputeForComponent`.

Direct `prisma.inventory.update({ currentStock })` or direct
`prisma.stockTransaction.create()` outside the repository adapter is forbidden.

## State Rules

- Stock transfer create is record-only. It does not change current/available
  stock.
- Valid transfer transitions:
  `pending -> in_transit | cancelled`, `in_transit -> completed | cancelled`.
- Route declaration order must keep static paths before `/:id`.
- Do not filter `BundleComponent` by `isDeleted`; the model is hard-delete and
  has no such field.
- Every single-resource read/write includes `organizationId`.
- DTOs must not contain `organizationId`.

## Shared Contract

Public return shapes follow `@kiditem/shared/inventory`. Repository adapters may
return Prisma rows internally, but mappers own boundary conversion.

## Verification

```bash
npm run build --workspace=apps/server
npm exec --workspace=apps/server -- vitest run src/inventory
npm run check:idor
npm run check:tenant-scope
npm run dev:server
```

Run integration tests for schema, row-lock, transaction, fan-out, record-only,
or IDOR changes:

```bash
npm run db:test:up && npm run db:test:prepare && npm run test:integration
```
