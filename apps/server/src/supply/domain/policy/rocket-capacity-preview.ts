import { BadRequestException } from '@nestjs/common';
import type {
  RocketPurchasePreviewComponent,
  RocketPurchasePreviewReason,
} from '@kiditem/shared/rocket-purchase-preview';

export type RocketCapacityPreviewInputRow = {
  poLineId: string;
  poNumber: string;
  productNo: string;
  productName: string;
  plannedDeliveryDate: string;
  orderQuantity: number;
  channelSkuId: string | null;
  components: RocketPurchasePreviewComponent[];
};

export type RocketCapacityPreviewRow = {
  poLineId: string;
  poNumber: string;
  productNo: string;
  productName: string;
  orderQuantity: number;
  recommendedQuantity: number;
  maxQuantity: number;
  editedQuantity: number | null;
  reason: RocketPurchasePreviewReason | null;
  channelSkuId: string | null;
  components: RocketPurchasePreviewComponent[];
};

export function previewRocketCapacity(input: {
  rows: RocketCapacityPreviewInputRow[];
  editedQuantities: Record<string, number>;
}): RocketCapacityPreviewRow[] {
  const remainingStock = new Map<string, number>();
  for (const component of input.rows.flatMap(({ components }) => components)) {
    const current = remainingStock.get(component.masterProductId);
    remainingStock.set(
      component.masterProductId,
      current === undefined ? component.currentStock : Math.min(current, component.currentStock),
    );
  }

  return [...input.rows]
    .sort(compareRows)
    .map((row) => allocateRow(row, input.editedQuantities, remainingStock));
}

function allocateRow(
  row: RocketCapacityPreviewInputRow,
  editedQuantities: Record<string, number>,
  remainingStock: Map<string, number>,
): RocketCapacityPreviewRow {
  const editedQuantity = editedQuantities[row.poLineId] ?? null;
  if (!row.channelSkuId || row.components.length === 0) {
    return result(row, editedQuantity, 0, 0, 'mapping_required');
  }
  if (row.components.some(({ isActive }) => !isActive)) {
    return result(row, editedQuantity, 0, 0, 'component_inactive');
  }

  const maxQuantity = Math.min(...row.components.map((component) => Math.floor(
    (remainingStock.get(component.masterProductId) ?? 0) / component.quantity,
  )));
  if (editedQuantity !== null && editedQuantity > maxQuantity) {
    throw new BadRequestException(
      `Edited quantity for ${row.poLineId} exceeds remaining component capacity`,
    );
  }
  const recommendedQuantity = editedQuantity ?? Math.min(row.orderQuantity, maxQuantity);
  for (const component of row.components) {
    remainingStock.set(
      component.masterProductId,
      (remainingStock.get(component.masterProductId) ?? 0)
        - (recommendedQuantity * component.quantity),
    );
  }
  return result(
    row,
    editedQuantity,
    recommendedQuantity,
    maxQuantity,
    editedQuantity === null && recommendedQuantity < row.orderQuantity
      ? 'insufficient_capacity'
      : null,
  );
}

function result(
  row: RocketCapacityPreviewInputRow,
  editedQuantity: number | null,
  recommendedQuantity: number,
  maxQuantity: number,
  reason: RocketPurchasePreviewReason | null,
): RocketCapacityPreviewRow {
  return {
    poLineId: row.poLineId,
    poNumber: row.poNumber,
    productNo: row.productNo,
    productName: row.productName,
    orderQuantity: row.orderQuantity,
    recommendedQuantity,
    maxQuantity,
    editedQuantity,
    reason,
    channelSkuId: row.channelSkuId,
    components: row.components,
  };
}

function compareRows(
  left: RocketCapacityPreviewInputRow,
  right: RocketCapacityPreviewInputRow,
): number {
  return left.plannedDeliveryDate.localeCompare(right.plannedDeliveryDate)
    || left.poNumber.localeCompare(right.poNumber, undefined, { numeric: true })
    || left.poLineId.localeCompare(right.poLineId);
}
