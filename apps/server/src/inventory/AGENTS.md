Consult this document first instead of relying on memorized knowledge.

# inventory — Sellpia Snapshot, Warehouses, Operation Records

`src/inventory/` owns the Sellpia-authoritative `InventorySku` snapshot and
adjacent warehouse, transfer, picking, receipt, unshipped, and shipment-file
capabilities. KidItem does not maintain a second mutable stock balance.

## Folder Map

```text
inventory/
├── inventory.module.ts
├── adapter/in/http/          # snapshot/import, warehouse, transfer, picking controllers
├── adapter/out/
│   ├── repository/           # the only PrismaService import lane
│   └── storage/              # generated shipment-file storage
├── application/
│   ├── port/in/              # exported use-case ports
│   ├── port/out/             # repository/cross-domain/storage ports
│   └── service/              # orchestration; no Prisma/adapter imports
├── domain/policy/            # pure transfer/picking rules
└── __tests__/                # wiring, architecture, integration specs
```

`application/port/in/` is capability-grouped:

- `stock/`: Sellpia import, snapshot/history reads, matching reads, and receipt
  batch records.
- `warehouse/`: warehouse and stock-transfer use cases.
- `fulfillment/`: unshipped and picking use cases.

## Owned Surfaces

- Sellpia source-stock snapshot: `POST /api/inventory/sellpia-sync/import`
- Sellpia current-stock snapshot read: `GET /api/inventory/sellpia-skus`
- Sellpia import-run history: `GET /api/inventory/sellpia-sync/import-runs`
- Sellpia receipt batches: `/api/inventory/sellpia-receipt-batches/*`
- Unshipped reads: `/api/unshipped/*`
- Warehouses: `/api/warehouses/*`
- Record-only stock transfers: `/api/stock-transfers/*`
- Record-only picking: `/api/picking/*`
- Coupang shipment files: `/api/coupang-shipments/*`

Route shape is frozen.

## Main Data Models

- `InventorySku` is one Sellpia product-code row and owns the current physical
  quantity in `currentStock`.
- `SourceImportRun` records workbook provenance, idempotency, and attempt
  fencing.
- `Warehouse` is warehouse metadata.
- `StockTransfer`, `PickingItem`, and `ReturnTransfer` reference
  `InventorySku`; they record operations and never adjust `currentStock`.
- `SellpiaReceiptUploadBatch` records receipt-upload workflow state separately
  from the stock snapshot.

## Sellpia Inventory Snapshot

`POST /api/inventory/sellpia-sync/import` is the only writer of
`InventorySku.currentStock`. It is an organization-scoped full snapshot
replacement: one valid workbook row maps to one `InventorySku`, and a completed
import sets absent known Sellpia codes to zero without deleting their identity
or `ChannelSkuComponent` references.

The replacement is atomic and fenced by its `SourceImportRun` attempt token.
It may update only `InventorySku` source metadata, `currentStock`, and import
provenance. Never translate workbook differences into product, channel,
transfer, picking, return, purchase-order, or Rocket writes. Receipt-batch
create/list/mark-uploaded behavior is separate and does not change stock.

## Cross-Domain Ports

- `InventoryModule` exports only the read-only `INVENTORY_SKU_READ_PORT` for
  matching and channel-capacity consumers.
- External domains do not inject warehouse, transfer, or picking
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
- No controller or service may expose receive, issue, adjust, reserve, release,
  restock, stock-ledger, or Rocket stock-event mutations.
- Transfer, picking, and return completion updates operational record fields
  only; they do not write `InventorySku.currentStock`.

## Transitional Exceptions

- None for new inventory behavior. Inventory is the reference domain for the
  server hexagonal structure.
