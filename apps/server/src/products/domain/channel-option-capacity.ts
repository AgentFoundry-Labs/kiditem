export type ChannelOptionCapacityComponent = Readonly<{
  sellpiaInventorySkuId: string;
  currentStock: number | null;
  activeCommitmentQuantity: number | null;
  availableStock: number | null;
  quantity: number;
  isActive: boolean | null;
}>;

export type ChannelOptionCapacityProjection = Readonly<{
  capacity: number | null;
  warningState: 'none' | 'configuration_required' | 'review_required';
  bottleneckSellpiaInventorySkuIds: readonly string[];
}>;

export type ProductInventoryOption = Readonly<{
  isActive: boolean;
  components: readonly ChannelOptionCapacityComponent[];
}>;

export type ProductInventoryProjection = Readonly<{
  inventoryUnits: number;
  inventoryStatus:
    | 'sellable'
    | 'partial_out_of_stock'
    | 'out_of_stock'
    | 'configuration_required'
    | 'review_required';
  options: readonly ChannelOptionCapacityProjection[];
}>;

export function projectChannelOptionCapacity(
  components: readonly ChannelOptionCapacityComponent[],
): ChannelOptionCapacityProjection {
  if (components.length === 0) {
    return {
      capacity: null,
      warningState: 'configuration_required',
      bottleneckSellpiaInventorySkuIds: [],
    };
  }
  if (components.some((component) => component.quantity <= 0)) {
    throw new Error('Channel option inventory quantity must be positive');
  }
  if (components.some(
    (component) => component.isActive !== true || component.availableStock === null,
  )) {
    return {
      capacity: null,
      warningState: 'review_required',
      bottleneckSellpiaInventorySkuIds: [],
    };
  }

  const capacities = components.map((component) => ({
    sellpiaInventorySkuId: component.sellpiaInventorySkuId,
    capacity: Math.floor(component.availableStock! / component.quantity),
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
  options: readonly ProductInventoryOption[],
): ProductInventoryProjection {
  const activeOptions = options.filter((option) => option.isActive);
  const projections = activeOptions.map((option) =>
    projectChannelOptionCapacity(option.components),
  );
  const physicalStock = new Map<string, number>();
  for (const option of activeOptions) {
    for (const component of option.components) {
      if (component.isActive === true && component.availableStock !== null) {
        physicalStock.set(component.sellpiaInventorySkuId, component.availableStock);
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
    options: projections,
  };
}
