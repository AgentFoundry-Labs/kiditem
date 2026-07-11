# Sellpia and Coupang Rocket Inventory Sync Design

> Superseded on 2026-07-11 by
> [`2026-07-11-channel-inventory-sku-reconstruction-design.md`](./2026-07-11-channel-inventory-sku-reconstruction-design.md).
> This document remains historical implementation context only. The replacement
> makes KidItem the inventory system of record, treats Sellpia as an external
> inventory provider and Rocket as a channel, and removes bundle inventory
> identity from `ProductOption`.

## Purpose

KidItem will use Sellpia as the operational inventory reference for non-Rocket
mall order handling, while managing Coupang Rocket stock effects inside KidItem
because Rocket activity is not reflected in Sellpia.

The first implementation must let operators:

- process receipts in KidItem immediately;
- track Sellpia upload state for those receipts and generate the upload file
  once the official receipt-upload template is confirmed;
- reserve stock for Coupang Rocket PO confirmation;
- issue stock when Rocket shipment/outbound is completed;
- manually receive Rocket returns;
- import Sellpia inventory rows;
- calculate recommended adjustments for safe differences;
- review risky differences row by row.
- capture unmatched Sellpia rows as new product candidates.

This replaces the earlier stock-check-only plan. The workflow now mutates
KidItem inventory, but only through the Inventory owner boundary.

## Existing Context

PR 310 adds the Coupang Rocket operational surface:

- `/rocket-orders` lists real-time Rocket POs from the supplier session.
- Rocket PO confirmation previews use KidItem availability.
- The confirmation service calculates `available = currentStock - reservedStock`
  through `ProductOption.barcode -> Inventory`.
- Coupang shipment work exists as a document/PDF-oriented surface.
- Rocket flow still does not reserve or issue inventory.

Current Sellpia export assumptions from `docs/references/exported-list.xlsx`:

- It is a Sellpia product stock export sample.
- `재고` is the inventory reference column.
- `상품코드` maps to `ProductOption.legacyCode`.
- `상품분류`, `품절`, `품절일`, `단종`, `단종일` are ignored.
- Sellpia status flags are not reliable enough to drive stock state.
- Imports are row-scoped: only uploaded rows are considered, and absent products
  are ignored.

## Inventory Model

Sellpia stock and Rocket activity must not be treated as separate stock pools.
They represent the same physical inventory.

Definitions:

```text
Sellpia stock
  Non-Rocket mall inventory reference. Non-Rocket orders/outbound and receipt
  uploads are reflected in Sellpia.

Rocket ledger
  Coupang Rocket inventory effects that are never reflected in Sellpia.

KidItem current stock
  The stock value used by KidItem operations.

KidItem available stock
  Inventory.currentStock - Inventory.reservedStock.
```

The effective target stock on Sellpia import is:

```text
targetCurrentStock = sellpiaStock + rocketLedgerNet
```

`rocketLedgerNet` is the cumulative Rocket issue/return effect that Sellpia
will never contain.

## Domain Ownership

Inventory owns all stock writes.

Inventory responsibilities:

- `Inventory.currentStock` and `Inventory.reservedStock`.
- Stock transactions.
- Sellpia import execution and review queue.
- Rocket inventory ledger.
- Receipt processing, Sellpia upload tracking, and receipt-upload file generation
  through a template adapter.

Orders responsibilities:

- Rocket PO confirmation UI and API from PR 310.
- Calling Inventory to reserve confirmed Rocket quantities.
- Calling Inventory to issue Rocket quantities on outbound completion.

Channels responsibilities:

- Channel listing and external marketplace reads.
- Future marketplace stock comparison or marketplace stock push, if designed
  later.

The first implementation must not implement `ChannelSyncService.syncInventory()`
or push stock to marketplace APIs.

## Data Model

### SellpiaStockSnapshot

One row per Sellpia import attempt.

Fields:

- `id`
- `organizationId`
- `sourceFileName`
- `sourceFileLastModifiedAt`
- `effectiveExportedAt`
- `manualExportedAtOverride`
- `rowCount`
- `matchedCount`
- `recommendedCount`
- `approvedAdjustedCount`
- `reviewCount`
- `rejectedCount`
- `status`: `previewed`, `applied`, `failed`
- `errorJson`
- `createdByUserId`
- `createdAt`
- `appliedAt`

`effectiveExportedAt` defaults to browser `file.lastModified`. Operators may
override it before running the import.

### SellpiaStockSnapshotItem

One row per Sellpia product row.

Fields:

- `id`
- `snapshotId`
- `organizationId`
- `sellpiaProductCode`
- `sellpiaProductName`
- `sellpiaStock`
- `sellpiaSafetyStock`
- `sourceBarcode`
- `productOptionId`
- `inventoryId`
- `rocketLedgerNet`
- `targetCurrentStock`
- `currentStockBefore`
- `reservedStockBefore`
- `operatorTargetStock`
- `currentStockAtApply`
- `diff`
- `diffRate`
- `status`
- `blockReason`
- `rawJson`
- `resolvedByUserId`
- `resolvedAt`

Statuses:

- `recommended`
- `needs_review`
- `approved_adjusted`
- `manual_adjusted`
- `ignored`
- `new_product_candidate`
- `missing_inventory`
- `rejected`

Block reasons:

- `duplicate_code`
- `large_difference`
- `recent_kiditem_event`
- `negative_target_stock`
- `parse_warning`
- `new_product_candidate`
- `missing_inventory`

### SellpiaNewProductCandidate

One row per unmatched Sellpia product row that may need a KidItem product,
option, inventory row, and initial receive.

Fields:

- `id`
- `organizationId`
- `snapshotItemId`
- `sellpiaProductCode`
- `sellpiaProductName`
- `sellpiaStock`
- `sellpiaSafetyStock`
- `sourceBarcode`
- `status`: `pending`, `created_new_option`, `linked_existing_option`, `ignored`, `rejected`
- `resolvedMasterProductId`
- `resolvedProductOptionId`
- `createdInventoryId`
- `initialReceiveTransactionId`
- `operatorInitialStock`
- `resolutionDecision`
- `resolvedByUserId`
- `resolvedAt`
- `note`

### RocketInventoryLedger

One row per Rocket stock-affecting event that Sellpia will never reflect.

Fields:

- `id`
- `organizationId`
- `optionId`
- `eventType`: `reserve`, `release`, `issue`, `return`
- `quantity`
- `signedQuantity`
- `sourceType`: `rocket_po_confirm`, `rocket_outbound`, `rocket_return`
- `sourceId`
- `eventAt`
- `memo`
- `createdByUserId`
- `createdAt`

Ledger sign policy:

- `reserve`: affects `reservedStock`, not `currentStock`; net stock sign `0`.
- `release`: affects `reservedStock`, not `currentStock`; net stock sign `0`.
- `issue`: decreases `currentStock`; net stock sign negative.
- `return`: increases `currentStock`; net stock sign positive.

## Workflows

### Receipt

```text
Operator records receipt in KidItem
-> Inventory.currentStock increases through Inventory stock mutation
-> StockTransaction(receive)
-> Sellpia upload state is created for the receipt batch
-> If the official template is configured, Sellpia receipt upload XLSX is generated
-> Operator uploads file to Sellpia
-> Later Sellpia stock export rows can be used for reconciliation
```

KidItem updates stock immediately. Operators do not wait for the Sellpia
round trip before Rocket PO confirmation can use the received stock.

### Rocket PO Confirmation

```text
Rocket PO rows are collected
-> Preview calculates available = currentStock - reservedStock
-> Operator edits confirmation quantities
-> Confirmation XLSX is generated
-> Confirmed quantities are reserved in Inventory
-> RocketInventoryLedger(reserve)
```

The first implementation should make reservation an explicit action coupled to
the operator-approved confirmation result. Re-generating a file must not create
duplicate reservations.

### Rocket Outbound

```text
Operator marks Rocket outbound/shipment complete
-> reservedStock decreases
-> currentStock decreases
-> StockTransaction(issue)
-> RocketInventoryLedger(issue)
```

Outbound completion is the point where Rocket stock becomes part of the
Sellpia import correction ledger.

### Rocket Return

```text
Operator manually records Rocket return/restock
-> currentStock increases
-> StockTransaction(return)
-> RocketInventoryLedger(return)
```

Rocket return file import is out of scope for the first implementation.

### Sellpia Full Export Import

```text
Operator uploads Sellpia stock rows
-> parser validates required columns
-> items match by Sellpia 상품코드 -> ProductOption.legacyCode
-> targetCurrentStock = sellpiaStock + rocketLedgerNet
-> safe rows become recommended adjustments
-> unmatched rows become new product candidates
-> operator enters or confirms final target quantity
-> approved rows adjust Inventory
-> risky rows enter review queue
```

Sellpia import must never automatically create `MasterProduct` or
`ProductOption`. New product creation/linking happens only through explicit
candidate resolution.

## Matching Policy

Primary match:

```text
Sellpia 상품코드 -> ProductOption.legacyCode
```

Barcode fields are diagnostic display only in the first implementation.

Suggested display barcode:

```text
sourceBarcode = firstNonBlank(자사상품코드, 바코드, barcodeLike(모델명))
```

No fallback barcode matching is allowed in the first implementation.

Unmatched rows are treated as new product candidates. Candidate resolution can:

- create a new `MasterProduct` and `ProductOption`;
- create a new option under an existing `MasterProduct`;
- link the Sellpia code to an existing `ProductOption`;
- ignore the candidate.

Candidate resolution must ensure a non-bundle `Inventory` row exists before any
initial stock is received. Initial stock is recorded through an operator
approved `RECEIVE`, never by directly setting `Inventory.currentStock`.

## Adjustment Recommendation and Approval Policy

Sellpia import never creates stock transactions automatically. It calculates
recommended target stock and queues rows for operator review. Inventory changes
only after an operator explicitly approves selected rows with final target
quantities.

File-level conditions:

- Required columns exist: `상품코드`, `상품명`, `재고`.
- No duplicate `상품코드`.
- Effective export time is available from `file.lastModified` or manual
  override.

Row-level conditions:

- A non-deleted `ProductOption` matches by `legacyCode`.
- An `Inventory` row exists.
- No KidItem stock event exists for the option after `effectiveExportedAt`.
- `targetCurrentStock` is non-negative.
- Large difference flags are warnings, not hard approval blocks.

`diffRate` uses:

```text
abs(diff) / max(currentStockBefore, targetCurrentStock, 1)
```

Rows that pass are marked as recommended adjustment candidates. The UI may
prefill their final target quantity with `targetCurrentStock`, but the operator
can edit that quantity before approval.

Rows that fail are not directly approvable. They are added to the review queue.

Approved rows are adjusted through the Inventory stock mutation path and
recorded as `StockTransaction(adjust)`. At apply time, the service re-reads the
latest inventory row, rechecks safety, and derives the adjustment delta from the
operator-confirmed target quantity.

A reason is required when `abs(diff) >= 20`, `diffRate >= 30%`, or the operator
target quantity differs from `targetCurrentStock`.

## Review Queue

Operators can process risky rows one by one:

- Approve: adjust to an operator-confirmed target quantity.
- Manual adjust: adjust to an operator-entered stock value and reason.
- Ignore: resolve with no stock mutation.

Every action records:

- actor user id;
- before and after quantity;
- reason or note;
- linked snapshot item;
- resulting stock transaction when a mutation happens.

## UI Surfaces

### Sellpia Inventory Sync

Location: add a `Sellpia 동기화` tab to `/inventory-hub`.

The first implementation should not add a top-level sidebar route. Operators
already enter stock status, ledger, audit, and assets through `/inventory-hub`,
so the sync workflow belongs there until traffic or complexity justifies a
dedicated route.

Required controls:

- Row-scoped Sellpia stock upload.
- Effective export time display using file modified time.
- Manual export time override.
- Preflight validation summary.
- Preview counts: recommended, review needed, missing match, rejected.
- Editable final target quantity per row.
- Apply selected approved rows.
- Review queue table with row-level actions.
- New product candidate section with create/link/ignore actions.
- Candidate resolution form with editable initial stock quantity.

### Rocket Orders

Build on PR 310 `/rocket-orders`.

Required additions:

- After PO confirmation preview and operator edits, reserve confirmed quantity.
- Show reservation state per PO or generated confirmation file.
- Prevent duplicate reservation for the same source row.
- Add outbound completion action that issues reserved stock.

### Rocket Returns

First implementation:

- Manual input by SKU/barcode.
- Quantity, reason, memo.
- Immediate Inventory receive/return mutation.
- Rocket ledger return row.

## Safety Requirements

- Inventory writes must go through Inventory owner services/ports.
- No direct `prisma.inventory.update({ currentStock })` outside the Inventory
  repository mutation path.
- Every stock-changing operation creates a stock transaction.
- Every Sellpia import item is organization-scoped.
- DTOs do not accept `organizationId`.
- Upload files with supplier or customer data are not committed.
- Products absent from a Sellpia import are ignored.
- Unknown Sellpia product codes never create products automatically.

## Out of Scope

- Marketplace stock API push.
- `ChannelSyncService.syncInventory()`.
- Product or option auto-creation from Sellpia.
- Rocket return file import.
- Channel stock comparison dashboard.
- Supplier contact import from Sellpia exports.

## Verification Plan

Parser tests:

- required Sellpia columns;
- ignored status/category columns;
- numeric stock parsing;
- duplicate product code rejection;
- row-scoped import behavior.

Inventory policy tests:

- Sellpia stock plus Rocket ledger target calculation;
- Sellpia import never creates a stock transaction without explicit operator
  approval;
- approved adjustment uses operator-confirmed target quantity;
- large absolute difference requires reason;
- large percentage difference requires reason;
- recent KidItem event block;
- missing option creates a new product candidate;
- missing inventory queue behavior;
- candidate resolution creates/links product option, ensures inventory, and
  records initial stock through `RECEIVE`.

Rocket flow tests:

- PO confirmation reservation increases `reservedStock`;
- outbound completion decreases `reservedStock` and `currentStock`;
- manual return increases `currentStock`;
- all Rocket events create stock transactions and ledger rows.

Integration and wiring tests:

- organization scope on every read and write;
- Inventory module exports the necessary incoming port;
- Orders consumes Inventory through the port, not concrete services;
- PR 310 availability preview excludes reserved stock.

## Implementation Sequencing

1. Add durable schema and shared contracts.
2. Add Inventory-owned stock mutation capabilities for reserve, issue, return,
   and adjust with source references.
3. Add Rocket ledger and connect PR 310 Rocket confirmation/outbound flows.
4. Add Sellpia parser and snapshot preview.
5. Add new product candidate capture and resolution.
6. Add recommended adjustment and explicit approval execution.
7. Add review queue actions.
8. Add UI surfaces.
9. Add runbook and verification coverage.

## Open Decisions

None. The current design assumes:

- Sellpia imports are row-scoped; absent products are ignored.
- Rocket inventory effects are never reflected in Sellpia.
- Receipts are entered in KidItem immediately; Sellpia upload files are generated
  only after the official receipt-upload template is configured.
- Matching uses Sellpia `상품코드` to `ProductOption.legacyCode`.
- There is no auto-adjust. Large differences require an operator reason, but do
  not hard-block approval when the operator confirms the final target quantity.
- Rocket issue over the open reservation requires admin/inventory-manager
  override with a reason.
