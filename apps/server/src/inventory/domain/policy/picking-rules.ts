export type PickingSourceComponent = {
  inventorySkuId: string;
  quantity: number;
  inventorySku: {
    sellpiaProductCode: string;
    name: string;
    optionName: string | null;
  };
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
  inventorySkuId: string;
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
      if (components.length === 0 || components.some((component) => component.quantity <= 0)) {
        skippedCount += 1;
        continue;
      }
      for (const component of components) {
        items.push({
          orderId: order.id,
          inventorySkuId: component.inventorySkuId,
          productName: component.inventorySku.name,
          sku: component.inventorySku.sellpiaProductCode,
          quantity: li.quantity * component.quantity,
        });
      }
    }
  }
  return { items, skippedCount };
}
