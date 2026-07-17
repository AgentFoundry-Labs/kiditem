export type VariantCapacityComponent = Readonly<{
  sellpiaInventorySkuId: string;
  currentStock: number | null;
  quantity: number;
  isActive: boolean | null;
}>;

export type VariantCapacityProjection = Readonly<{
  capacity: number | null;
  warningState: 'none' | 'configuration_required' | 'review_required';
  bottleneckSellpiaInventorySkuIds: readonly string[];
}>;

export type ProductInventoryVariant = Readonly<{
  isActive: boolean;
  components: readonly VariantCapacityComponent[];
}>;

export type ProductInventoryProjection = Readonly<{
  inventoryUnits: number;
  inventoryStatus:
    | 'sellable'
    | 'partial_out_of_stock'
    | 'out_of_stock'
    | 'configuration_required'
    | 'review_required';
  variants: readonly VariantCapacityProjection[];
}>;

export function projectVariantCapacity(
  components: readonly VariantCapacityComponent[],
): VariantCapacityProjection {
  if (components.length === 0) {
    return {
      capacity: null,
      warningState: 'configuration_required',
      bottleneckSellpiaInventorySkuIds: [],
    };
  }
  if (components.some((component) => component.quantity <= 0)) {
    throw new Error('Product variant component quantity must be positive');
  }
  if (components.some(
    (component) => component.isActive !== true || component.currentStock === null,
  )) {
    return {
      capacity: null,
      warningState: 'review_required',
      bottleneckSellpiaInventorySkuIds: [],
    };
  }

  const capacities = components.map((component) => ({
    sellpiaInventorySkuId: component.sellpiaInventorySkuId,
    capacity: Math.floor(component.currentStock! / component.quantity),
  }));
  const capacity = Math.min(...capacities.map((component) => component.capacity));
  return {
    capacity,
    warningState: 'none',
    bottleneckSellpiaInventorySkuIds: capacities
      .filter((component) => component.capacity === capacity)
      .map((component) => component.sellpiaInventorySkuId),
  };
}

export function projectProductInventory(
  variants: readonly ProductInventoryVariant[],
): ProductInventoryProjection {
  const activeVariants = variants.filter((variant) => variant.isActive);
  const projections = activeVariants.map((variant) =>
    projectVariantCapacity(variant.components),
  );
  const physicalStock = new Map<string, number>();
  for (const variant of activeVariants) {
    for (const component of variant.components) {
      if (component.isActive === true && component.currentStock !== null) {
        physicalStock.set(component.sellpiaInventorySkuId, component.currentStock);
      }
    }
  }

  let inventoryStatus: ProductInventoryProjection['inventoryStatus'];
  if (projections.some((projection) => projection.warningState === 'review_required')) {
    inventoryStatus = 'review_required';
  } else if (
    projections.length === 0
    || projections.some((projection) => projection.warningState === 'configuration_required')
  ) {
    inventoryStatus = 'configuration_required';
  } else {
    const capacities = projections.map((projection) => projection.capacity!);
    const hasZero = capacities.some((capacity) => capacity === 0);
    const hasPositive = capacities.some((capacity) => capacity > 0);
    inventoryStatus = hasZero && hasPositive
      ? 'partial_out_of_stock'
      : hasZero
        ? 'out_of_stock'
        : 'sellable';
  }

  return {
    inventoryUnits: [...physicalStock.values()].reduce((sum, stock) => sum + stock, 0),
    inventoryStatus,
    variants: projections,
  };
}
