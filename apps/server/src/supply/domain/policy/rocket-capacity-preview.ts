import type {
  RocketPurchasePreviewComponent,
  RocketPurchasePreviewReason,
} from '@kiditem/shared/rocket-purchase-preview';

export class RocketPreviewQuantityExceededError extends Error {
  override readonly name = 'RocketPreviewQuantityExceededError';

  constructor(
    readonly poLineId: string,
    readonly editedQuantity: number,
    readonly maxQuantity: number,
  ) {
    super(`Edited quantity for ${poLineId} exceeds remaining component capacity`);
  }
}

export type RocketCapacityPreviewInputRow = {
  poLineId: string;
  poNumber: string;
  productNo: string;
  productName: string;
  plannedDeliveryDate: string;
  orderQuantity: number;
  channelSkuId: string | null;
  masterProductId: string | null;
  productVariantId: string | null;
  recipeStatus:
    | 'unmatched'
    | 'configuration_required'
    | 'review_required'
    | 'matched';
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
  masterProductId: string | null;
  productVariantId: string | null;
  components: RocketPurchasePreviewComponent[];
};

export function previewRocketCapacity(input: {
  rows: RocketCapacityPreviewInputRow[];
  editedQuantities: Record<string, number>;
  committedQuantities?: Record<string, number>;
  clampEditedQuantities?: boolean;
}): RocketCapacityPreviewRow[] {
  const remainingStock = new Map<string, number>();
  for (const component of input.rows.flatMap(({ components }) => components)) {
    const current = remainingStock.get(component.sellpiaInventorySkuId);
    remainingStock.set(
      component.sellpiaInventorySkuId,
      current === undefined
        ? Math.max(
            0,
            component.currentStock
              - (input.committedQuantities?.[component.sellpiaInventorySkuId] ?? 0),
          )
        : Math.min(current, component.currentStock),
    );
  }

  return [...input.rows]
    .sort(compareRows)
    .map((row) => allocateRow(
      row,
      input.editedQuantities,
      remainingStock,
      input.clampEditedQuantities === true,
    ));
}

function allocateRow(
  row: RocketCapacityPreviewInputRow,
  editedQuantities: Record<string, number>,
  remainingStock: Map<string, number>,
  clampEditedQuantities: boolean,
): RocketCapacityPreviewRow {
  const requestedEditedQuantity = editedQuantities[row.poLineId] ?? null;
  if (!row.channelSkuId || row.recipeStatus === 'unmatched') {
    const editedQuantity = resolveRocketPreviewEditedQuantity(
      row.poLineId,
      requestedEditedQuantity,
      0,
      clampEditedQuantities,
    );
    return result(row, editedQuantity, 0, 0, 'mapping_required');
  }
  if (row.recipeStatus === 'configuration_required') {
    const editedQuantity = resolveRocketPreviewEditedQuantity(
      row.poLineId,
      requestedEditedQuantity,
      0,
      clampEditedQuantities,
    );
    return result(row, editedQuantity, 0, 0, 'configuration_required');
  }
  if (
    row.recipeStatus === 'review_required'
    || row.components.some(({ isActive }) => !isActive)
  ) {
    const editedQuantity = resolveRocketPreviewEditedQuantity(
      row.poLineId,
      requestedEditedQuantity,
      0,
      clampEditedQuantities,
    );
    return result(row, editedQuantity, 0, 0, 'review_required');
  }

  const maxQuantity = Math.min(
    row.orderQuantity,
    ...row.components.map((component) => Math.floor(
      (remainingStock.get(component.sellpiaInventorySkuId) ?? 0)
        / component.quantity,
    )),
  );
  const editedQuantity = resolveRocketPreviewEditedQuantity(
    row.poLineId,
    requestedEditedQuantity,
    maxQuantity,
    clampEditedQuantities,
  );
  const recommendedQuantity = editedQuantity ?? Math.min(row.orderQuantity, maxQuantity);
  for (const component of row.components) {
    remainingStock.set(
      component.sellpiaInventorySkuId,
      (remainingStock.get(component.sellpiaInventorySkuId) ?? 0)
        - (recommendedQuantity * component.quantity),
    );
  }
  return result(
    row,
    editedQuantity,
    recommendedQuantity,
    maxQuantity,
    (requestedEditedQuantity !== null && editedQuantity !== requestedEditedQuantity)
      || (editedQuantity === null && recommendedQuantity < row.orderQuantity)
      ? 'insufficient_capacity'
      : null,
  );
}

export function resolveRocketPreviewEditedQuantity(
  poLineId: string,
  editedQuantity: number | null,
  maxQuantity: number,
  clampEditedQuantity: boolean,
): number | null {
  if (clampEditedQuantity && editedQuantity !== null) {
    return Math.min(editedQuantity, maxQuantity);
  }
  assertRocketPreviewEditedQuantity(poLineId, editedQuantity, maxQuantity);
  return editedQuantity;
}

export function assertRocketPreviewEditedQuantity(
  poLineId: string,
  editedQuantity: number | null,
  maxQuantity: number,
): void {
  if (editedQuantity !== null && editedQuantity > maxQuantity) {
    throw new RocketPreviewQuantityExceededError(
      poLineId,
      editedQuantity,
      maxQuantity,
    );
  }
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
    masterProductId: row.masterProductId,
    productVariantId: row.productVariantId,
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
