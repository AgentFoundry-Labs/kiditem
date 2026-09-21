import { Inject, Injectable } from '@nestjs/common';
import type {
  ChannelSkuAvailabilityItem,
  ChannelSkuAvailabilityListResponse,
  ChannelSkuAvailabilityQuery,
} from '@kiditem/shared/channel-sku-availability';
import type { ChannelSkuAvailabilityPort } from '../port/in/channel-sku-availability.port';
import type { InventorySkuAvailability } from '@kiditem/shared/inventory-availability';
import {
  PRODUCT_AVAILABILITY_PORT,
  type ProductAvailabilityPort,
} from '../../../products/application/port/in/product-availability.port';
import {
  CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT,
  type ChannelAvailabilityRepositoryRow,
  type ChannelProductMatchingRepositoryPort,
} from '../port/out/repository/channel-product-matching.repository.port';
import { projectChannelInventoryComponents } from './channel-inventory-availability.projection';

@Injectable()
export class ChannelSkuAvailabilityService implements ChannelSkuAvailabilityPort {
  constructor(
    @Inject(CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT)
    private readonly repository: ChannelProductMatchingRepositoryPort,
    @Inject(PRODUCT_AVAILABILITY_PORT)
    private readonly inventory: ProductAvailabilityPort,
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
    const masterProductIds = [...new Set(rows.flatMap((row) =>
      row.inventoryComponents.map(({ masterProductId }) =>
        masterProductId)))].sort((left, right) =>
      left.localeCompare(right));
    const availability = await this.inventory.findByMasterProductIds({
      organizationId,
      masterProductIds,
    });
    const inventoryByMasterProductId = new Map<string, InventorySkuAvailability>(availability.items.map((item) => [
      item.masterProductId,
      item,
    ]));
    return rows.map((row) => toAvailabilityItem(row, inventoryByMasterProductId));
  }
}

function toAvailabilityItem(
  row: ChannelAvailabilityRepositoryRow,
  inventoryByMasterProductId: ReadonlyMap<string, InventorySkuAvailability>,
): ChannelSkuAvailabilityItem {
  const { components, projection } = projectChannelInventoryComponents(
    row.inventoryComponents,
    inventoryByMasterProductId,
  );
  const recipeStatus = components.length === 0
    ? row.listing.masterProductId
      ? 'configuration_required' as const
      : 'unmatched' as const
    : projection.warningState === 'none'
      ? 'matched' as const
      : projection.warningState;
  const mappingStatus = recipeStatus === 'matched'
    ? 'matched' as const
    : recipeStatus === 'unmatched'
      ? 'unmatched' as const
      : 'needs_review' as const;
  const sellableStock = mappingStatus === 'matched' ? projection.capacity : null;
  const componentCapacities = components.map((component) => ({
    component,
    capacity: component.currentStock === null
      ? null
      : Math.floor(component.currentStock / component.quantity),
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
    recipeStatus,
    components: componentCapacities.map(({ component, capacity }) => ({
      masterProductId: component.masterProductId,
      code: component.code,
      name: component.name,
      optionName: component.optionName,
      barcode: component.barcode,
      currentStock: component.currentStock,
      purchasePrice: component.purchasePrice,
      quantity: component.quantity,
      componentCapacity: capacity,
      isBottleneck: mappingStatus === 'matched' && capacity !== null
        ? capacity === sellableStock
        : null,
    })),
    warnings: recipeStatus === 'configuration_required'
      ? ['configuration_required']
      : components.some((component) => component.currentStock === null)
          ? ['inventory_unavailable']
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
