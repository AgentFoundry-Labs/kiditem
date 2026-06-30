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

## Sellpia Bulk Review

Use filters to narrow the review table before bulk actions. `추천` rows can be
bulk approved when no required reason is missing. Rows with large differences,
recent KidItem stock changes, or edited target quantities require a reason before
approval. Rows with hard blocking reasons stay selected and are skipped with a
visible reason.

Bulk actions show success, failure, and skipped counts. Failed and skipped rows
remain available for operator review instead of disappearing from the table.

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

## Shipment And Return Stock Links

`/coupang-shipments` provides a `출고 재고 처리 초안` link that opens the Inventory
Hub Rocket event form with `issue` and shipment source reference prefilled. This
is only a draft. Shipment PDFs do not provide item-level inventory IDs, so the
operator still confirms Inventory ID, Option ID, and quantity before applying.

`/returns` provides `재고 처리 초안` links for return line items. Each link opens
the Rocket event form with `return_restock`, line-item source reference, and the
returned quantity prefilled when available. The operator still confirms
Inventory ID and Option ID before applying.

## Verification

- Sellpia import preview does not create stock transactions.
- Approved Sellpia rows create `ADJUST` transactions.
- New candidate initial stock creates `RECEIVE` transactions.
- Rocket reservation changes `reservedStock` only.
- Rocket issue changes both `reservedStock` and `currentStock`.
- Rocket return/restock changes `currentStock` only.
