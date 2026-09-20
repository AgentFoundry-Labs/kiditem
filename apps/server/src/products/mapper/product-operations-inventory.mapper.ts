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
      currentStock: availability?.currentStock ?? null,
    };
  });
  const capacity = projectChannelOptionCapacity(inventoryComponents.map((component) => ({
    sellpiaInventorySkuId: component.sellpiaInventorySkuId,
    currentStock: component.currentStock,
    quantity: component.quantity,
  })));
  return { ...option, inventoryComponents, capacity: capacity.capacity };
}

export function mapProductOperationsDetail(
  product: ProductOperationsRepositoryDetail,
  inventoryBySkuId: AvailabilityBySkuId,
): Omit<MasterProductOperationsDetail, 'abc' | 'abcGrade' | 'abcEvaluation' | 'contribution'> {
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
    inventory: inventory.inventory,
  };
}

export function mapProductOperationsListItem(
  product: ProductOperationsRepositoryListItem,
  inventoryBySkuId: AvailabilityBySkuId,
  depletion: ProductDepletionProjection,
): Omit<MasterProductOperationsListItem, 'abc' | 'abcGrade' | 'abcEvaluation' | 'contribution'> {
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
    inventory: inventory.inventory,
  };
}

function projectCanonicalInventory(
  inventorySkuIds: readonly string[],
  inventoryBySkuId: AvailabilityBySkuId,
): {
  inventoryUnits: number | null;
  inventory: MasterProductOperationsListItem['inventory'];
} {
  const inventory = inventorySkuIds.map((id) => inventoryBySkuId.get(id));
  const measured = inventory.filter((item): item is InventorySkuAvailability => item !== undefined);
  return {
    inventoryUnits: inventory.length === 0 || measured.length !== inventory.length
      ? null
      : measured.reduce((sum, item) => sum + item.currentStock, 0),
    inventory: {
      skuCount: inventory.length,
      measuredSkuCount: measured.length,
    },
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
