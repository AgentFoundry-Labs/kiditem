import type { InventorySkuAvailability } from '@kiditem/shared/inventory-commitment';
import type {
  MasterProductOperationsDetail,
  MasterProductOperationsListItem,
  ProductDepletionProjection,
  ProductVariantDetail,
} from '@kiditem/shared/product-operations';
import type {
  ProductOperationsRepositoryDetail,
  ProductOperationsRepositoryListItem,
  ProductOperationsRepositoryVariant,
} from '../application/port/out/repository/product-operations.repository.port';
import {
  projectProductInventory,
  projectVariantCapacity,
} from '../domain/product-variant-capacity';

type AvailabilityBySkuId = ReadonlyMap<string, InventorySkuAvailability>;

export function mapProductOperationsVariant(
  variant: ProductOperationsRepositoryVariant,
  inventoryBySkuId: AvailabilityBySkuId,
): ProductVariantDetail {
  const components = variant.components.map((component) => {
    const availability = inventoryBySkuId.get(component.sellpiaInventorySkuId);
    return {
      ...component,
      currentStock: availability?.currentStock ?? 0,
      activeCommitmentQuantity: availability?.activeCommitmentQuantity ?? 0,
      availableStock: availability?.availableStock ?? 0,
      isActive: availability?.isActive ?? false,
    };
  });
  const projection = projectVariantCapacity(components.map((component) => ({
    sellpiaInventorySkuId: component.sellpiaInventorySkuId,
    currentStock: component.currentStock,
    activeCommitmentQuantity: component.activeCommitmentQuantity,
    availableStock: component.availableStock,
    quantity: component.quantity,
    isActive: component.isActive,
  })));
  return {
    ...variant,
    components,
    capacity: projection.capacity,
    warningState: projection.warningState,
  };
}

export function mapProductOperationsDetail(
  product: ProductOperationsRepositoryDetail,
  inventoryBySkuId: AvailabilityBySkuId,
): MasterProductOperationsDetail {
  const variants = product.variants.map((variant) =>
    mapProductOperationsVariant(variant, inventoryBySkuId));
  const inventory = projectProductInventory(variants.map(toInventoryVariant));
  return {
    ...product,
    variants,
    inventoryUnits: inventory.inventoryUnits,
    inventoryStatus: inventory.inventoryStatus,
  };
}

export function mapProductOperationsListItem(
  product: ProductOperationsRepositoryListItem,
  inventoryBySkuId: AvailabilityBySkuId,
  depletion: ProductDepletionProjection,
): MasterProductOperationsListItem {
  const { variants: rawVariants, ...metadata } = product;
  const variants = rawVariants.map((variant) =>
    mapProductOperationsVariant(variant, inventoryBySkuId));
  const activeVariants = variants.filter((variant) => variant.isActive);
  const inventory = projectProductInventory(variants.map(toInventoryVariant));
  return {
    ...metadata,
    depletion,
    variantSummary: {
      total: variants.length,
      active: activeVariants.length,
      configured: activeVariants.filter(
        ({ warningState }) => warningState === 'none',
      ).length,
      warning: activeVariants.filter(
        ({ warningState }) => warningState !== 'none',
      ).length,
    },
    inventoryUnits: inventory.inventoryUnits,
    inventoryStatus: inventory.inventoryStatus,
  };
}

function toInventoryVariant(variant: ProductVariantDetail) {
  return {
    isActive: variant.isActive,
    components: variant.components.map((component) => ({
      sellpiaInventorySkuId: component.sellpiaInventorySkuId,
      currentStock: component.currentStock,
      activeCommitmentQuantity: component.activeCommitmentQuantity,
      availableStock: component.availableStock,
      quantity: component.quantity,
      isActive: component.isActive,
    })),
  };
}
