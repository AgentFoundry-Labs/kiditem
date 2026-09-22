import type { InventorySkuAvailability } from '@kiditem/shared/inventory-availability';
import { projectChannelOptionCapacity } from '@kiditem/shared/channel-option-capacity';

type ChannelRecipeComponent = Readonly<{
  masterProductId: string;
  quantity: number;
}>;

export function projectChannelInventoryComponents<T extends ChannelRecipeComponent>(
  recipeComponents: readonly T[],
  inventoryByMasterProductId: ReadonlyMap<string, InventorySkuAvailability>,
) {
  const components = recipeComponents.map((component) => {
    const inventory = inventoryByMasterProductId.get(component.masterProductId);
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
