import {
  projectChannelOptionCapacity,
  projectProductInventory,
} from '../domain/channel-option-capacity';
import type { InventorySkuAvailability } from '@kiditem/shared/inventory-commitment';
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
    activeCommitmentQuantity: inventoryBySkuId.get(component.sellpiaInventorySkuId)
      ?.activeCommitmentQuantity ?? 0,
    availableStock: component.availableStock,
    quantity: component.quantity,
    isActive: component.isActive,
  })));
  return { ...option, inventoryComponents, capacity: capacity.capacity };
}

export function mapProductOperationsDetail(
  product: ProductOperationsRepositoryDetail,
  inventoryBySkuId: AvailabilityBySkuId,
): MasterProductOperationsDetail {
  const channelListings = product.channelListings.map((listing) => ({
    ...listing,
    options: listing.options.map((option) => hydrateOption(option, inventoryBySkuId)),
  }));
  const options = channelListings.flatMap((listing) => listing.options.map((option) => ({
    isActive: listing.isActive && option.isActive,
    components: option.inventoryComponents.map((component) => ({
      ...component,
      activeCommitmentQuantity: inventoryBySkuId.get(component.sellpiaInventorySkuId)
        ?.activeCommitmentQuantity ?? 0,
    })),
  })));
  const inventory = projectProductInventory(options);
  return {
    ...product,
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
): MasterProductOperationsListItem {
  const {
    activeChannelProducts: _activeChannelProducts,
    inventoryOptions: rawOptions,
    ...metadata
  } = product;
  const options = rawOptions.map((option) => hydrateOption(option, inventoryBySkuId));
  const projections = options.map((option) => projectChannelOptionCapacity(
    option.inventoryComponents.map((component) => ({
      ...component,
      activeCommitmentQuantity: inventoryBySkuId.get(component.sellpiaInventorySkuId)
        ?.activeCommitmentQuantity ?? 0,
    })),
  ));
  const inventory = projectProductInventory(options.map((option) => ({
    isActive: option.isActive,
    components: option.inventoryComponents.map((component) => ({
      ...component,
      activeCommitmentQuantity: inventoryBySkuId.get(component.sellpiaInventorySkuId)
        ?.activeCommitmentQuantity ?? 0,
    })),
  })));
  return {
    ...metadata,
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
