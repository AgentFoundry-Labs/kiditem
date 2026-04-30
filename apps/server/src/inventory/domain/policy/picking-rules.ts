export type PickingSourceLineItem = {
  optionId: string | null;
  productName: string;
  sku: string | null;
  quantity: number;
  option?: { sku: string | null } | null;
};

export type PickingSourceOrder = {
  id: string;
  lineItems: PickingSourceLineItem[];
};

export type PickableItem = {
  orderId: string;
  optionId: string;
  productName: string;
  sku: string | null;
  quantity: number;
};

export type PickingExtraction = {
  items: PickableItem[];
  skippedCount: number;
};

// PickingItem.optionId is NOT NULL FK — line items missing optionId
// (vendorItemId match failed) are skipped.
export function extractPickableItems(orders: PickingSourceOrder[]): PickingExtraction {
  const items: PickableItem[] = [];
  let skippedCount = 0;
  for (const order of orders) {
    for (const li of order.lineItems) {
      if (!li.optionId) {
        skippedCount += 1;
        continue;
      }
      items.push({
        orderId: order.id,
        optionId: li.optionId,
        productName: li.productName,
        sku: li.sku ?? li.option?.sku ?? null,
        quantity: li.quantity,
      });
    }
  }
  return { items, skippedCount };
}
