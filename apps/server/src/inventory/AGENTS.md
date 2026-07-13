Consult this document first instead of relying on memorized knowledge.

# inventory — Sellpia Master Snapshot, Warehouses, Operation Records

`src/inventory/` owns the Sellpia-authoritative physical `MasterProduct`
snapshot and adjacent warehouse, transfer, picking, receipt, unshipped, and
shipment-file capabilities. KidItem does not maintain a second mutable stock
balance.

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

- A physical `MasterProduct` is one Sellpia product-code row and owns the
  current quantity in `currentStock`.
- `SourceImportRun` records workbook provenance, idempotency, and attempt
  fencing.
- `Warehouse` is warehouse metadata.
- `StockTransfer`, `PickingItem`, and `ReturnTransfer` reference
  `MasterProduct`; they record operations and never adjust `currentStock`.
- `SellpiaReceiptUploadBatch` records receipt-upload workflow state separately
  from the stock snapshot.

## Sellpia Inventory Snapshot

`POST /api/inventory/sellpia-sync/import` is the only writer of physical
`MasterProduct.currentStock`. It is an organization-scoped full snapshot
replacement: one valid workbook row maps to one physical `MasterProduct`, and a
completed import marks absent known Sellpia codes inactive with zero stock
without deleting their identity or `ChannelSkuComponent` references.

The replacement is atomic and fenced by its `SourceImportRun` attempt token.
It may update only physical `MasterProduct` source metadata, `currentStock`,
active state, and import provenance. Never translate workbook differences into
channel, transfer, picking, return, purchase-order, or Rocket writes.
Receipt-batch create/list/mark-uploaded behavior is separate and does not
change stock.

## Cross-Domain Ports

- `InventoryModule` exports the read-only `SELLPIA_MASTER_PRODUCT_READ_PORT`
  for matching and channel-capacity consumers.
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
  only; they do not write `MasterProduct.currentStock`.

## Transitional Exceptions

- Release `0.1.9` still dual-writes the legacy `InventorySku` shadow and its
  identity ledger so expand/contract migration and rollback evidence remain
  valid. New reads, cross-domain references, and operational records use the
  physical `MasterProduct`; do not add new `InventorySku` consumers.
