import { projectChannelOptionCapacity } from '@kiditem/shared/channel-option-capacity';
import type { InventorySkuAvailability } from '@kiditem/shared/inventory-availability';
import type {
  MasterProductOperationsDetail,
  MasterProductOperationsListItem,
  ProductDepletionProjection,
} from '@kiditem/shared/product-operations';
import type {
  ProductOperationsRepositoryDetail,
  ProductOperationsRepositoryListItem,
  ProductOperationsRepositoryOption,
} from '../application/port/out/repository/product-operations.repository.port';

type AvailabilityBySkuId = ReadonlyMap<string, InventorySkuAvailability>;

function hydrateOption(
  option: ProductOperationsRepositoryOption,
  inventoryBySkuId: AvailabilityBySkuId,
) {
  const inventoryComponents = option.inventoryComponents.map((component) => {
    const availability = inventoryBySkuId.get(component.sellpiaInventorySkuId);
    return {
      ...component,
      currentStock: availability?.currentStock ?? 0,
      availableStock: availability?.availableStock ?? 0,
      isActive: availability?.isActive ?? false,
    };
  });
  const capacity = projectChannelOptionCapacity(inventoryComponents.map((component) => ({
    sellpiaInventorySkuId: component.sellpiaInventorySkuId,
    currentStock: component.currentStock,
    availableStock: component.availableStock,
    quantity: component.quantity,
    isActive: component.isActive,
  })));
  return { ...option, inventoryComponents, capacity: capacity.capacity };
}

export function mapProductOperationsDetail(
  product: ProductOperationsRepositoryDetail,
  inventoryBySkuId: AvailabilityBySkuId,
): Omit<MasterProductOperationsDetail, 'abc' | 'contribution'> {
  const channelListings = product.channelListings.map((listing) => ({
    ...listing,
    options: listing.options.map((option) => hydrateOption(option, inventoryBySkuId)),
  }));
  const inventory = projectCanonicalInventory(product.inventorySkuIds, inventoryBySkuId);
  const { inventorySkuIds: _inventorySkuIds, ...metadata } = product;
  return {
    ...metadata,
    displayImageUrls: [...product.imageUrls],
    channelListings,
    inventoryUnits: inventory.inventoryUnits,
    inventoryStatus: inventory.inventoryStatus,
  };
}

export function mapProductOperationsListItem(
  product: ProductOperationsRepositoryListItem,
  inventoryBySkuId: AvailabilityBySkuId,
  depletion: ProductDepletionProjection,
): Omit<MasterProductOperationsListItem, 'abc' | 'contribution'> {
  const {
    activeChannelProducts,
    abcCreatedAt: _abcCreatedAt,
    inventorySkuIds,
    inventoryOptions: rawOptions,
    ...metadata
  } = product;
  const options = rawOptions.map((option) => hydrateOption(option, inventoryBySkuId));
  const projections = options.map((option) => projectChannelOptionCapacity(
    option.inventoryComponents,
  ));
  const inventory = projectCanonicalInventory(inventorySkuIds, inventoryBySkuId);
  return {
    ...metadata,
    activeChannels: uniqueActiveChannels(activeChannelProducts),
    displayImageUrls: [...product.imageUrls],
    depletion,
    channelOptionSummary: {
      total: options.length,
      active: options.filter((option) => option.isActive).length,
      configured: projections.filter(({ warningState }) => warningState === 'none').length,
      warning: projections.filter(({ warningState }) => warningState !== 'none').length,
    },
    inventoryUnits: inventory.inventoryUnits,
    inventoryStatus: inventory.inventoryStatus,
  };
}

function projectCanonicalInventory(
  inventorySkuIds: readonly string[],
  inventoryBySkuId: AvailabilityBySkuId,
): { inventoryUnits: number; inventoryStatus: MasterProductOperationsListItem['inventoryStatus'] } {
  if (inventorySkuIds.length === 0) {
    return { inventoryUnits: 0, inventoryStatus: 'configuration_required' };
  }
  const inventory = inventorySkuIds.map((id) => inventoryBySkuId.get(id));
  if (inventory.some((item) => !item || !item.isActive)) {
    return {
      inventoryUnits: inventory.reduce(
        (sum, item) => sum + (item?.isActive ? item.availableStock : 0),
        0,
      ),
      inventoryStatus: 'review_required',
    };
  }
  const inventoryUnits = inventory.reduce((sum, item) => sum + item!.availableStock, 0);
  return {
    inventoryUnits,
    inventoryStatus: inventoryUnits === 0 ? 'out_of_stock' : 'sellable',
  };
}

function uniqueActiveChannels(
  channels: ProductOperationsRepositoryListItem['activeChannelProducts'],
) {
  const unique = new Map(channels.map((channel) => [
    channel.channelAccountId,
    channel,
  ]));
  return [...unique.values()].sort((left, right) =>
    left.channelAccountName.localeCompare(right.channelAccountName)
    || left.channelAccountId.localeCompare(right.channelAccountId));
}
