export type PickingSourceComponent = {
  masterProductId: string | null;
  quantity: number;
  masterProduct: {
    sellpiaProductCode: string | null;
    name: string;
    optionName: string | null;
  } | null;
};

export type PickingSourceLineItem = {
  productName: string;
  quantity: number;
  listingOption: { components: PickingSourceComponent[] } | null;
};

export type PickingSourceOrder = {
  id: string;
  lineItems: PickingSourceLineItem[];
};

export type PickableItem = {
  orderId: string;
  masterProductId: string;
  productName: string;
  sku: string | null;
  quantity: number;
};

export type PickingExtraction = {
  items: PickableItem[];
  skippedCount: number;
};

// One channel order line may consume several physical Sellpia SKUs. A line is
// pickable only when it has a complete, positive ChannelSku component recipe.
export function extractPickableItems(orders: PickingSourceOrder[]): PickingExtraction {
  const items: PickableItem[] = [];
  let skippedCount = 0;
  for (const order of orders) {
    for (const li of order.lineItems) {
      const components = li.listingOption?.components ?? [];
      if (
        components.length === 0
        || components.some((component) => (
          component.quantity <= 0
          || !component.masterProductId
          || !component.masterProduct
        ))
      ) {
        skippedCount += 1;
        continue;
      }
      for (const component of components) {
        if (!component.masterProductId || !component.masterProduct) continue;
        items.push({
          orderId: order.id,
          masterProductId: component.masterProductId,
          productName: component.masterProduct.name,
          sku: component.masterProduct.sellpiaProductCode,
          quantity: li.quantity * component.quantity,
        });
      }
    }
  }
  return { items, skippedCount };
}
