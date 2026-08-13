import type { InventorySkuAvailability } from '@kiditem/shared/inventory-availability';
import { projectChannelOptionCapacity } from '../../../products/domain/channel-option-capacity';

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
      currentStock: inventory?.currentStock ?? 0,
      availableStock: inventory?.availableStock ?? 0,
      isActive: inventory?.isActive ?? false,
    };
  });
  return {
    components,
    projection: projectChannelOptionCapacity(components),
  };
}
