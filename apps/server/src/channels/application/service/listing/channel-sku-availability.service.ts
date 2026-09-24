import {
  type ChannelSkuAvailabilityItem,
  type ChannelSkuAvailabilityListResponse,
  type ChannelSkuAvailabilityQuery,
} from '@kiditem/shared/channel-sku-availability';
import type { ChannelSkuAvailabilityPort } from '../../port/in/channel-sku-availability.port';
import type { InventorySkuAvailability } from '@kiditem/shared/inventory-availability';
import {
  type ChannelProductAvailabilityPort,
} from '../../port/out/products/product-availability.port';
import {
  type ChannelAvailabilityRepositoryRow,
  type ChannelProductMatchingRepositoryPort,
} from '../../port/out/repository/channel-product-matching.repository.port';
import { projectChannelInventoryComponents } from './channel-inventory-availability.projection';
import { decideStockout } from '../../../domain/listing/stockout-policy';
import { KiditemInvalidValueError, KiditemNotFoundError } from '@kiditem/shared/errors';

export class ChannelSkuAvailabilityService implements ChannelSkuAvailabilityPort {
  constructor(
    private readonly repository: ChannelProductMatchingRepositoryPort,
    private readonly inventory: ChannelProductAvailabilityPort,
  ) {}

  async updateSafetyStock(organizationId: string, optionId: string, safetyStock: number) {
    if (!Number.isSafeInteger(safetyStock) || safetyStock < 0 || safetyStock > 2_147_483_647) {
      throw new KiditemInvalidValueError('VALIDATION_FAILED', { message: '안전재고는 0 이상의 정수여야 합니다.' });
    }
    if (!await this.repository.updateSafetyStock(organizationId, optionId, safetyStock)) {
      throw new KiditemNotFoundError('CHANNELS_LISTING_NOT_FOUND', { details: { reason: 'LISTING_OPTION_NOT_FOUND' } });
    }
    return { channelListingOptionId: optionId, safetyStock };
  }

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
        inStock: projected.filter((item) => stockoutDecision(item) === 'in_stock').length,
        outOfStock: projected.filter((item) => stockoutDecision(item) === 'out_of_stock').length,
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
  const recipeStatus = row.compositionUnconfirmed
    ? 'review_required' as const
    : components.length === 0
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
      safetyStock: row.option.safetyStock,
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
    warnings: row.compositionUnconfirmed
      ? ['composition_unconfirmed']
      : recipeStatus === 'configuration_required'
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
    return stockoutDecision(item) === 'in_stock';
  }
  return stockoutDecision(item) === 'out_of_stock';
}

function stockoutDecision(item: ChannelSkuAvailabilityItem) {
  return decideStockout(
    item.sku.mappingStatus === 'matched' ? item.sku.sellableStock : null,
    item.sku.safetyStock,
  );
}
