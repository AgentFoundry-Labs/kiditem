import { Inject, Injectable } from '@nestjs/common';
import type {
  ChannelSkuAvailabilityItem,
  ChannelSkuAvailabilityListResponse,
  ChannelSkuAvailabilityQuery,
} from '@kiditem/shared/channel-sku-availability';
import { projectVariantCapacity } from '../../../products/domain/product-variant-capacity';
import type { ChannelSkuAvailabilityPort } from '../port/in/channel-sku-availability.port';
import type { InventorySkuAvailability } from '@kiditem/shared/inventory-commitment';
import {
  INVENTORY_AVAILABILITY_PORT,
  type InventoryAvailabilityPort,
} from '../../../inventory/application/port/in/stock/inventory-availability.port';
import {
  CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT,
  type ChannelAvailabilityRepositoryRow,
  type ChannelProductMatchingRepositoryPort,
} from '../port/out/repository/channel-product-matching.repository.port';

@Injectable()
export class ChannelSkuAvailabilityService implements ChannelSkuAvailabilityPort {
  constructor(
    @Inject(CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT)
    private readonly repository: ChannelProductMatchingRepositoryPort,
    @Inject(INVENTORY_AVAILABILITY_PORT)
    private readonly inventory: InventoryAvailabilityPort,
  ) {}

  async list(
    organizationId: string,
    query: ChannelSkuAvailabilityQuery,
  ): Promise<ChannelSkuAvailabilityListResponse> {
    const rows = await this.repository.listAvailabilityRows(organizationId, {
      channelAccountId: query.channelAccountId,
      search: query.search?.trim() || undefined,
    });
    const projected = await this.projectRows(organizationId, rows);
    const selected = projected
      .filter((item) => matchesStatus(item, query.status))
      .filter((item) => query.hasBottleneck !== true
        || item.components.some((component) => component.isBottleneck));
    const offset = (query.page - 1) * query.limit;
    return {
      items: selected.slice(offset, offset + query.limit),
      total: selected.length,
      page: query.page,
      limit: query.limit,
      summary: {
        total: projected.length,
        inStock: projected.filter((item) =>
          item.sku.mappingStatus === 'matched'
          && (item.sku.sellableStock ?? 0) > 0).length,
        outOfStock: projected.filter((item) =>
          item.sku.mappingStatus === 'matched'
          && item.sku.sellableStock === 0).length,
        unmatched: projected.filter((item) => item.sku.mappingStatus === 'unmatched').length,
        needsReview: projected.filter(
          (item) => item.sku.mappingStatus === 'needs_review',
        ).length,
      },
    };
  }

  async findByChannelSkuIds(
    organizationId: string,
    ids: string[],
  ): Promise<ChannelSkuAvailabilityItem[]> {
    if (ids.length === 0) return [];
    const rows = await this.repository.listAvailabilityRows(organizationId, {
      optionIds: [...new Set(ids)],
    });
    const projected = await this.projectRows(organizationId, rows);
    const byId = new Map(projected.map((item) => [item.sku.id, item]));
    return ids.flatMap((id) => {
      const item = byId.get(id);
      return item ? [item] : [];
    });
  }

  async findByListingIds(
    organizationId: string,
    ids: string[],
  ): Promise<ChannelSkuAvailabilityItem[]> {
    if (ids.length === 0) return [];
    const rows = await this.repository.listAvailabilityRows(organizationId, {
      listingIds: [...new Set(ids)],
    });
    return this.projectRows(organizationId, rows);
  }

  private async projectRows(
    organizationId: string,
    rows: ChannelAvailabilityRepositoryRow[],
  ): Promise<ChannelSkuAvailabilityItem[]> {
    const sellpiaInventorySkuIds = [...new Set(rows.flatMap((row) =>
      row.variant?.components.map(({ sellpiaInventorySkuId }) =>
        sellpiaInventorySkuId) ?? []))].sort((left, right) =>
      left.localeCompare(right));
    const availability = await this.inventory.findBySkuIds({
      organizationId,
      sellpiaInventorySkuIds,
    });
    const inventoryBySkuId = new Map(availability.items.map((item) => [
      item.sellpiaInventorySkuId,
      item,
    ]));
    return rows.map((row) => toAvailabilityItem(row, inventoryBySkuId));
  }
}

function toAvailabilityItem(
  row: ChannelAvailabilityRepositoryRow,
  inventoryBySkuId: ReadonlyMap<string, InventorySkuAvailability>,
): ChannelSkuAvailabilityItem {
  const components = row.variant?.components.map((component) => {
    const inventory = inventoryBySkuId.get(component.sellpiaInventorySkuId);
    return {
      ...component,
      currentStock: inventory?.currentStock ?? 0,
      activeCommitmentQuantity: inventory?.activeCommitmentQuantity ?? 0,
      availableStock: inventory?.availableStock ?? 0,
      isActive: inventory?.isActive ?? false,
    };
  }) ?? [];
  const projection = row.variant
    ? projectVariantCapacity(components.map((component) => ({
      sellpiaInventorySkuId: component.sellpiaInventorySkuId,
      currentStock: component.currentStock,
      activeCommitmentQuantity: component.activeCommitmentQuantity,
      availableStock: component.availableStock,
      quantity: component.quantity,
      isActive: component.isActive,
    })))
    : null;
  const recipeStatus = !row.variant
    ? 'unmatched' as const
    : !row.variant.isActive
      ? 'review_required' as const
    : projection?.warningState === 'none'
      ? 'matched' as const
      : projection!.warningState;
  const mappingStatus = recipeStatus === 'matched'
    ? 'matched' as const
    : recipeStatus === 'unmatched'
      ? 'unmatched' as const
      : 'needs_review' as const;
  const sellableStock = mappingStatus === 'matched' ? projection!.capacity : null;
  const componentCapacities = components.map((component) => ({
    component,
    capacity: Math.floor(component.availableStock / component.quantity),
  }));

  return {
    channelAccount: row.channelAccount,
    product: {
      id: row.listing.id,
      externalProductId: row.listing.externalId,
      registeredName: row.listing.channelName,
      displayName: row.listing.displayName,
      status: row.listing.status,
    },
    masterProductId: row.listing.masterProductId,
    sku: {
      id: row.option.id,
      externalSkuId: row.option.externalOptionId,
      sellerSku: row.option.sellerSku,
      optionName: row.option.itemName,
      barcode: row.option.barcode,
      modelNumber: row.option.modelNumber,
      salePrice: row.option.salePrice,
      status: row.option.status,
      mappingStatus,
      sellableStock,
      updatedAt: row.option.updatedAt,
    },
    productVariantId: row.variant?.id ?? null,
    variantCode: row.variant?.code ?? null,
    variantName: row.variant?.name ?? null,
    recipeStatus,
    components: componentCapacities.map(({ component, capacity }) => ({
      sellpiaInventorySkuId: component.sellpiaInventorySkuId,
      code: component.code,
      name: component.name,
      optionName: component.optionName,
      barcode: component.barcode,
      currentStock: component.currentStock,
      activeCommitmentQuantity: component.activeCommitmentQuantity,
      availableStock: component.availableStock,
      purchasePrice: component.purchasePrice,
      isActive: component.isActive,
      quantity: component.quantity,
      source: component.source,
      componentCapacity: capacity,
      isBottleneck: mappingStatus === 'matched' && capacity === sellableStock,
    })),
    warnings: !row.variant?.isActive && row.variant !== null
      ? ['variant_inactive']
      : recipeStatus === 'configuration_required'
      ? ['configuration_required']
      : components.some((component) => !component.isActive)
        ? ['component_inactive']
        : [],
  };
}

function matchesStatus(
  item: ChannelSkuAvailabilityItem,
  status: ChannelSkuAvailabilityQuery['status'],
): boolean {
  if (status === 'all') return true;
  if (status === 'unmatched') return item.sku.mappingStatus === 'unmatched';
  if (status === 'needs_review') return item.sku.mappingStatus === 'needs_review';
  if (status === 'in_stock') {
    return item.sku.mappingStatus === 'matched' && (item.sku.sellableStock ?? 0) > 0;
  }
  return item.sku.mappingStatus === 'matched' && item.sku.sellableStock === 0;
}
