export type ChannelOptionCapacityComponent = Readonly<{
  sellpiaInventorySkuId: string;
  currentStock: number | null;
  availableStock: number | null;
  quantity: number;
  isActive: boolean | null;
}>;

export type ChannelOptionCapacityProjection = Readonly<{
  capacity: number | null;
  warningState: 'none' | 'configuration_required' | 'review_required';
  bottleneckSellpiaInventorySkuIds: readonly string[];
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
