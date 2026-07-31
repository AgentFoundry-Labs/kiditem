import type { RocketPurchasePreviewRow } from "@kiditem/shared/rocket-purchase-preview";

function previewRowPriority(
  row: RocketPurchasePreviewRow,
  confirmedQuantity: number,
): number {
  if (row.components.length === 0) return 0;
  if (confirmedQuantity < row.orderQuantity) return 1;
  return 2;
}

export function orderRocketPreviewRows(
  rows: readonly RocketPurchasePreviewRow[],
  confirmedQuantityFor: (row: RocketPurchasePreviewRow) => number,
): RocketPurchasePreviewRow[] {
  return [...rows].sort(
    (left, right) =>
      previewRowPriority(left, confirmedQuantityFor(left)) -
      previewRowPriority(right, confirmedQuantityFor(right)),
  );
}
