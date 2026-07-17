Consult this document first instead of relying on memorized knowledge.

# inventory — Sellpia SKU Snapshot, Warehouses, Operation Records

`src/inventory/` owns the Sellpia-authoritative physical `SellpiaInventorySku`
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
- Sellpia single-SKU snapshot read: `GET /api/inventory/sellpia-skus/:sellpiaInventorySkuId`
- Sellpia import-run history: `GET /api/inventory/sellpia-sync/import-runs`
- Sellpia freshness state and browser leases:
  `/api/inventory/sellpia-freshness/*`
- Idempotent browser order-transmission intents and post-submit generation
  fencing under `/api/inventory/sellpia-freshness/order-transmission-intents/*`
- Sellpia receipt batches: `/api/inventory/sellpia-receipt-batches/*`
- Physical-stock-independent commitments that reduce common available Sellpia
  capacity for cross-domain workflows. These records never mutate
  `SellpiaInventorySku.currentStock`.
- Unshipped reads: `/api/unshipped/*`
- Warehouses: `/api/warehouses/*`
- Record-only stock transfers: `/api/stock-transfers/*`
- Record-only picking: `/api/picking/*`
- Coupang shipment files: `/api/coupang-shipments/*`

Route shape is frozen.

## Main Data Models

- A physical `SellpiaInventorySku` is one Sellpia product-code row and owns the
  current quantity in `currentStock`.
- `SourceImportRun` records workbook provenance, idempotency, and attempt
  fencing.
- `InventoryCommitment` and `InventoryCommitmentAllocation` own auditable,
  line-level holds against Sellpia SKU capacity independently of physical stock.
- `Warehouse` is warehouse metadata.
- `StockTransfer`, `PickingItem`, and `ReturnTransfer` reference
  `SellpiaInventorySku`; they record operations and never adjust `currentStock`.
- `SellpiaReceiptUploadBatch` records receipt-upload workflow state separately
  from the stock snapshot.

## Sellpia Inventory Snapshot

`POST /api/inventory/sellpia-sync/import` is the only writer of physical
`SellpiaInventorySku.currentStock`. It is an organization-scoped full snapshot
replacement: one valid workbook row maps to one physical `SellpiaInventorySku`, and a
completed import marks absent known Sellpia codes inactive with zero stock
without deleting their identity or `ProductVariantComponent` references.

The replacement is atomic and fenced by its `SourceImportRun` attempt token.
It may update only physical `SellpiaInventorySku` source metadata, `currentStock`,
active state, and import provenance. Never translate workbook differences into
channel, transfer, picking, return, purchase-order, or Rocket writes.
Receipt-batch create/list/mark-uploaded behavior is separate and does not
change stock.

## Cross-Domain Ports

- `InventoryModule` exports a read-only Sellpia inventory-SKU capability for
  product recipes, matching evidence, and capacity consumers. It never exposes
  `MasterProduct` as a physical inventory type.
- `InventoryModule` exports organization-fenced availability and commitment
  ports. Other domains pass structured source identity; Inventory canonicalizes
  business keys and owns commitment lifecycle transitions.
- `InventoryModule` exports `SELLPIA_INVENTORY_REFRESH_REQUEST_PORT` for
  deterministic order/purchase refresh requests and
  `SELLPIA_INVENTORY_FRESHNESS_GATE_PORT` for the final fresh-and-active
  purchase assertion. Consumers do not control leases or read persistence.
- `SELLPIA_INVENTORY_FRESHNESS_GATE_PORT.readFreshCapacity` returns component
  `currentStock` and active state from the same Inventory-owned freshness lock,
  fence, and verified generation. Rocket preview consumers must allocate from
  this gated snapshot rather than a stock value read before the gate.
- External domains do not inject warehouse, transfer, or picking
  services directly.

## Freshness Ownership

- Inventory owns the ten-minute Sellpia freshness policy, generation fence,
  source binding, and organization/source advisory lock.
- Capacity snapshots acquired through the freshness gate are serialized with
  full Sellpia snapshot publication by that same organization/source lock.
- Browser collection claims use a 90-second lease. Only the authenticated
  user who owns a live lease may heartbeat, fail, or cancel it; another user
  may claim only after expiry.
- Order-transmission refresh requests settle for two minutes and coalesce for
  at most five minutes only while the earlier order generation is still
  pending, not failed, and still inside that cap. A new transmission after the
  generation is verified, failed, or reaches the cap starts a new two-minute
  settle window.
- Before the browser invokes irreversible Sellpia order submission, Inventory
  persists an organization-scoped `prepared` transmission intent. An unresolved
  intent keeps freshness `refresh_required` and blocks collection claims. Only
  `submitted: true` finalization advances to a generation strictly newer than
  every generation visible at finalization; retries return the same finalized
  generation. Explicit non-submission may abort and reopen the same intent key.
- Every public view serializes generations as decimal strings and derives
  `activeSync.canControl` from the authenticated user without exposing the
  owner ID.

## Boundary Rules

- HTTP controllers depend on incoming ports, not application service classes.
- `PrismaService` imports stay under `adapter/out/repository/**`.
- `application/**` does not import `@prisma/client`, Prisma types, or concrete
  adapters.
- `domain/**` imports no NestJS, Prisma, DTOs, HTTP adapters, or filesystem.
- Every single-resource read/write includes `organizationId`; DTOs do not carry
  organization id.
- Route declaration order keeps static paths before `/:id`.
- No controller or service may mutate physical `currentStock` through receive,
  issue, adjust, reserve, release, restock, stock-ledger, or Rocket stock-event
  operations. Inventory-owned commitments may reserve, replace, release, and
  settle logical capacity through the exported commitment port only.
- Transfer, picking, and return completion updates operational record fields
  only; they do not write `SellpiaInventorySku.currentStock`.
- Product operations reads must enter through Products APIs. The Inventory SKU
  list may expose linked/unlinked projections, but it must not manufacture or
  mutate `MasterProduct` rows.
- Inventory SKU linked product/variant destinations are distinct read-only
  projections of actual, active, organization-fenced
  `ProductVariantComponent` relations; never infer destinations from codes,
  names, or barcodes.
