export type ChannelOptionCapacityComponent = Readonly<{
  masterProductId: string;
  currentStock: number | null;
  quantity: number;
}>;

export type ChannelOptionCapacityProjection = Readonly<{
  capacity: number | null;
  warningState: 'none' | 'configuration_required' | 'review_required';
  bottleneckMasterProductIds: readonly string[];
}>;

export function projectChannelOptionCapacity(
  components: readonly ChannelOptionCapacityComponent[],
): ChannelOptionCapacityProjection {
  if (components.length === 0) {
    return {
      capacity: null,
      warningState: 'configuration_required',
      bottleneckMasterProductIds: [],
    };
  }
  if (components.some((component) => component.quantity <= 0)) {
    throw new Error('Channel option inventory quantity must be positive');
  }
  if (components.some(
    (component) => component.currentStock === null,
  )) {
    return {
      capacity: null,
      warningState: 'review_required',
      bottleneckMasterProductIds: [],
    };
  }

  const capacities = components.map((component) => ({
    masterProductId: component.masterProductId,
    capacity: Math.floor(component.currentStock! / component.quantity),
  }));
  const capacity = Math.min(...capacities.map((component) => component.capacity));
  return {
    capacity,
    warningState: 'none',
    bottleneckMasterProductIds: capacities
      .filter((component) => component.capacity === capacity)
      .map((component) => component.masterProductId),
  };
}
