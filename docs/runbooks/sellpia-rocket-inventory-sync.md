# Rocket Legacy Inventory Compatibility Runbook

This runbook covers the currently active Rocket PO confirmation and manual
stock-event flow backed by legacy `ProductOption` + `Inventory` barcode
matching. It is a compatibility surface. It does not read
`ChannelSkuComponent`, does not use the Sellpia `InventorySku` snapshot, and
must not be treated as the future Rocket catalog/order design.

For Sellpia source import, Coupang Wing catalog import, and ChannelSku component
matching, use [Channel/Sellpia SKU Matching](channel-sellpia-matching.md).

## Prerequisites

- Sign in to the intended KidItem organization.
- Load `extensions/order-collector` in Chrome and sign in to
  `supplier.coupang.com` before collecting Rocket PO rows.
- Confirm that the legacy `ProductOption` barcode and its one-to-one
  `Inventory` row are correct. The current Rocket preview matches this barcode;
  it does not consult the new ChannelSku component recipe.
- Before applying a manual stock event, obtain and verify the legacy Inventory
  UUID and ProductOption UUID for the same row.

## Rocket PO Confirmation

1. Open `/rocket-orders`.
2. In **발주확정 양식 생성**, choose the expected inbound-date range. The
   default is today through the next six days.
3. Click **발주리스트에서 양식 만들기**. The extension collects
   `거래처확인요청` rows, and the backend returns an editable preview.
4. Review every barcode, legacy available-stock value, calculated
   **확정수량**, and **납품부족사유**. A missing legacy barcode match is shown
   as `미매칭` with a zero confirmation quantity.
5. Edit confirmation quantities if needed. The backend clamps each value to the
   order quantity and remaining legacy available stock across rows sharing a
   barcode.
6. Click **엑셀 다운로드** to generate the Coupang confirmation workbook. The
   file is downloaded and retained in browser IndexedDB as operator convenience,
   not server truth.
7. Click **예약 확정** only when the preview is final. The commit skips zero
   quantities and unmatched legacy Inventory rows, reports new/duplicate/
   skipped/failed counts, and writes idempotent Rocket `reserve` events for
   accepted rows.

The alternative **쿠팡 양식 채우기** action accepts Coupang XLS/XLSX, fills its
confirmation quantity and shortage-reason columns through the same legacy
barcode availability calculation, and downloads the result. It does not commit
reservations by itself.

## Legacy Availability Boundary

The current preview resolves `ProductOption.barcode` inside the organization,
then reads its legacy `Inventory` row:

```text
available = max(0, Inventory.currentStock - Inventory.reservedStock)
confirm quantity = min(order quantity, remaining available, operator request)
```

This is intentionally not the new ChannelSku-to-InventorySku recipe. Do not
assume a mapping saved at `/product-hub/matching` changes Rocket confirmation
results in this compatibility flow.

## Manual Rocket Stock Events

Open `/inventory-hub?tab=rocket-events` and verify every field before clicking
**적용**. Required input is Inventory ID, Option ID, event type, positive
quantity, and source reference. The backend rejects IDs that do not identify
the same organization-scoped legacy inventory row.

| Event | Reserved-stock effect | Current-stock effect | Rule |
|---|---:|---:|---|
| `reserve` | `+quantity` | `0` | Used by Rocket confirmation reservation. |
| `release` | `-quantity` | `0` | Cannot exceed the open reservation. |
| `issue` | Reduce by the reserved portion | `-quantity` | Issuing beyond the open reservation requires **Allow over-reservation** and an override reason. |
| `return_restock` | `0` | `+quantity` | Records returned stock as a receive. |

`issue` and `return_restock` append the normal stock ledger and recompute bundle
availability. Every event also appends the Rocket inventory ledger. Repeating
the same event/source action returns `already applied` instead of applying the
deltas twice; do not change the source reference merely to bypass idempotency.

## Shipment And Return Draft Links

- `/coupang-shipments` provides **출고 재고 처리 초안**. It opens the manual
  event form with `issue`, shipment date/source reference, and note prefilled.
  Shipment files do not provide the legacy Inventory ID, Option ID, quantity,
  or open reservation, so the operator must verify and enter them.
- `/returns` provides **재고 처리 초안** for each return line. It prefills
  `return_restock`, the return line source reference, note, and returned
  quantity when available. The operator must still verify and enter the legacy
  Inventory ID and Option ID.

Both links create drafts only. Opening a link does not mutate stock.

## Forbidden Actions

- Do not use the retired Sellpia preview/approve/target-stock workflow or create
  ProductOption candidates from a Sellpia row. The authoritative Sellpia import
  is the full-snapshot workflow in the new matching runbook.
- Do not claim that ChannelSku component mappings drive the current Rocket PO
  calculation. They do not.
- Do not apply manual Rocket events without verified legacy IDs, quantity, and
  source reference.
- Do not release more than the open reservation or issue over it without a
  recorded override reason.

## Verification

- Rocket preview is scoped to the current organization and displays unmatched
  barcodes with zero confirmation quantity.
- Repeated barcodes share remaining availability instead of each receiving the
  full stock amount.
- `예약 확정` reports reserved, already-reserved, skipped, and failed rows.
- Repeating the same committed row is idempotent.
- `reserve` and `release` change only reserved stock.
- `issue` reduces current stock and the reserved portion, appends an `ISSUE`
  transaction, and enforces the over-reservation reason.
- `return_restock` increases current stock and appends a `RECEIVE` transaction.
- Shipment and return links leave the form as a draft until **적용** is clicked.

Focused checks:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/orders/services/rocket-po-confirm.service.spec.ts src/orders/controllers/__tests__/rocket-po.controller.spec.ts src/inventory/domain/policy/__tests__/rocket-inventory-event.spec.ts src/inventory/application/service/__tests__/inventory.service.mutations.spec.ts
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(orders)/returns/components/ReturnsTables.test.tsx' 'src/app/(inventory)/inventory-hub/components/RocketStockEvents.test.tsx' 'src/app/(inventory)/inventory-hub/lib/rocket-event-draft.test.ts'
```
