Consult this document first instead of relying on memorized knowledge.

# inventory — Stock, Warehouses, Transfers, Picking

`src/inventory/` owns stock state, unshipped reads, warehouses, stock transfers,
stock audits, and picking. These are capabilities inside one owner domain, not
standalone backend domains.

## Folder Map

```text
inventory/
├── inventory.module.ts
├── adapter/in/http/          # inventory, warehouse, transfer, audit, picking DTO/controllers
├── adapter/out/
│   ├── products/             # bundle-stock adapter consuming products port
│   └── repository/           # the only PrismaService import lane
├── application/
│   ├── port/in/              # exported use-case ports
│   ├── port/out/             # repository/query/cross-domain ports
│   └── service/              # orchestration; no Prisma/adapter imports
├── domain/policy/            # pure stock/status/transfer/picking rules
├── mapper/                   # Prisma row -> shared contract mapping
└── __tests__/                # wiring, architecture, integration specs
```

`application/port/in/` is capability-grouped:

- `stock/`: inventory state, stock mutation, transaction, and audit use cases.
- `warehouse/`: warehouse and stock-transfer use cases.
- `fulfillment/`: unshipped and picking use cases.

## Owned Surfaces

- Inventory and stock transactions: `/api/inventory/*`
- Unshipped reads: `/api/unshipped/*`
- Warehouses: `/api/warehouses/*`
- Stock transfers: `/api/stock-transfers/*`
- Stock audits: `/api/stock-audits/*`
- Picking: `/api/picking/*`
- Sellpia source-stock snapshot: `POST /api/inventory/sellpia-sync/import`
- Sellpia receipt batches: `/api/inventory/sellpia-receipt-batches/*`

Route shape is frozen.

## Main Data Models

- `Inventory` owns current and reserved stock.
- `StockTransaction` is the stock ledger.
- `InventorySku` is one Sellpia product-code row of read-only source-stock
  metadata. It is not a `ProductOption` or an `Inventory` balance.
- `Warehouse`, `StockTransfer`, `StockAudit`, and picking rows model adjacent
  inventory operations.
- `BundleComponent` is read for bundle fan-out; products owns bundle
  composition and materialized bundle stock.

## Stock Mutation Flow

```text
INVENTORY_PORT.receive/issue/adjust
  -> InventoryRepositoryAdapter.runInventoryStockMutation(...)
  -> transaction + tenant-scoped row lock
  -> domain stock policy
  -> Inventory update + StockTransaction append
  -> BundleStockPort.recomputeForComponent
```

Direct `prisma.inventory.update({ currentStock })` or direct
`prisma.stockTransaction.create()` outside the repository adapter is forbidden.

## Sellpia Inventory Snapshot

`POST /api/inventory/sellpia-sync/import` is a pure, organization-scoped full
snapshot replacement. One valid workbook row maps to one `InventorySku`, and a
completed import sets absent Sellpia codes' `reportedStock` to zero without
deleting their identity or channel-component references.

The replacement is atomic and fenced by its `SourceImportRun` attempt token.
It may update only `InventorySku` source metadata and import provenance. Never
translate Sellpia import rows or stock differences into `ProductOption`,
`Inventory`, `StockTransaction`, bundle-stock, or Rocket-ledger mutations.
Receipt-batch create/list/mark-uploaded behavior is a separate capability and
must not depend on the snapshot importer or stock mutation ports.

## Cross-Domain Ports

- `InventoryModule` exports `INVENTORY_PORT` only.
- Bundle stock fan-out goes through local `BundleStockPort`, whose adapter
  consumes products' owner-side bundle stock port.
- External domains do not inject warehouse, transfer, audit, or picking
  services directly.

## Boundary Rules

- HTTP controllers depend on incoming ports, not application service classes.
- `PrismaService` imports stay under `adapter/out/repository/**`.
- `application/**` does not import `@prisma/client`, Prisma types, or concrete
  adapters.
- `domain/**` imports no NestJS, Prisma, DTOs, HTTP adapters, or filesystem.
- Every single-resource read/write includes `organizationId`; DTOs do not carry
  organization id.
- Route declaration order keeps static paths before `/:id`.
- Stock transfers are record-only on create and do not change stock.
- Do not filter `BundleComponent` by `isDeleted`; it is hard-delete.

## Transitional Exceptions

- None for new inventory behavior. Inventory is the reference domain for the
  server hexagonal structure.
