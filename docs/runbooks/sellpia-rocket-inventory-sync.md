# Sellpia + Rocket Inventory Sync Runbook

## Prerequisites

- Operator is signed into KidItem with the correct active organization.
- Sellpia stock export XLSX is available.
- Coupang Rocket PO rows are collected through the order-collector extension.
- Sellpia receipt upload workbook generation is pending until the official upload template is configured.

## Sellpia Import

1. Open `/inventory-hub`.
2. Select `Sellpia 동기화`.
3. Upload the Sellpia XLSX.
4. Confirm the effective export time.
5. Review recommended rows.
6. Enter or confirm the final target quantity.
7. Add a reason for large differences or edited targets.
8. Approve or ignore each selected row.

## New Product Candidates

Rows without a matching `ProductOption.legacyCode` appear as `신규 상품 후보`.
Resolve each candidate by creating a new product, creating an option under an
existing product, linking an existing option, or ignoring the row. Initial stock
is recorded through the normal `RECEIVE` stock ledger path.

## Rocket Confirmation

1. Open `/rocket-orders`.
2. Collect Rocket PO rows.
3. Run preview.
4. Edit confirm quantities if needed.
5. Generate the Coupang confirm workbook.
6. Click `예약 확정` when the operator is ready to reserve KidItem stock.

## Rocket Shipment And Return

Manual shipment issue decreases both `reservedStock` and `currentStock`. Manual
Rocket return/restock increases `currentStock`. Issue over the open reservation
requires an override reason.

## Verification

- Sellpia import preview does not create stock transactions.
- Approved Sellpia rows create `ADJUST` transactions.
- New candidate initial stock creates `RECEIVE` transactions.
- Rocket reservation changes `reservedStock` only.
- Rocket issue changes both `reservedStock` and `currentStock`.
- Rocket return/restock changes `currentStock` only.
