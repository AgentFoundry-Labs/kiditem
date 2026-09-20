import type { InventorySkuAvailability } from '@kiditem/shared/inventory-availability';
import { projectChannelOptionCapacity } from '@kiditem/shared/channel-option-capacity';

type ChannelRecipeComponent = Readonly<{
  sellpiaInventorySkuId: string;
  quantity: number;
}>;

export function projectChannelInventoryComponents<T extends ChannelRecipeComponent>(
  recipeComponents: readonly T[],
  inventoryBySkuId: ReadonlyMap<string, InventorySkuAvailability>,
) {
  const components = recipeComponents.map((component) => {
    const inventory = inventoryBySkuId.get(component.sellpiaInventorySkuId);
    return {
      ...component,
      currentStock: inventory?.currentStock ?? null,
    };
  });
  return {
    components,
    projection: projectChannelOptionCapacity(components),
  };
}
