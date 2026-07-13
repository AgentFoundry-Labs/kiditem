import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type {
  ChannelSkuAvailabilityItem,
  ChannelSkuAvailabilityListResponse,
  ChannelSkuAvailabilityQuery,
} from '@kiditem/shared/channel-sku-availability';
import { projectChannelSkuSellableStock } from '../../domain/channel-sku-sellable-stock';
import type { ChannelsInventorySkuReadPort } from '../port/out/cross-domain/inventory-sku-read.port';
import { CHANNELS_INVENTORY_SKU_READ_PORT } from '../port/out/cross-domain/inventory-sku-read.port';
import type {
  ChannelSkuMappingRepositoryPort,
  ChannelSkuMappingRow,
} from '../port/out/repository/channel-sku-mapping.repository.port';
import { CHANNEL_SKU_MAPPING_REPOSITORY_PORT } from '../port/out/repository/channel-sku-mapping.repository.port';
import type { ChannelSkuAvailabilityPort } from '../port/in/channel-sku-availability.port';

@Injectable()
export class ChannelSkuAvailabilityService implements ChannelSkuAvailabilityPort {
  constructor(
    @Inject(CHANNEL_SKU_MAPPING_REPOSITORY_PORT)
    private readonly repository: ChannelSkuMappingRepositoryPort,
    @Inject(CHANNELS_INVENTORY_SKU_READ_PORT)
    private readonly inventory: ChannelsInventorySkuReadPort,
  ) {}

  async list(
    organizationId: string,
    query: ChannelSkuAvailabilityQuery,
  ): Promise<ChannelSkuAvailabilityListResponse> {
    const page = await this.repository.listAvailabilityPage(organizationId, {
      channelAccountId: query.channelAccountId,
      status: query.status,
      hasBottleneck: query.hasBottleneck,
      search: query.search?.trim() || undefined,
      page: query.page,
      limit: query.limit,
    });
    const items = await hydrateChannelSkuAvailabilityRows(
      organizationId,
      page.rows,
      this.inventory,
    );
    return {
      items,
      total: page.total,
      page: query.page,
      limit: query.limit,
      summary: page.summary,
    } satisfies ChannelSkuAvailabilityListResponse;
  }

  async findByChannelSkuIds(
    organizationId: string,
    ids: string[],
  ): Promise<ChannelSkuAvailabilityItem[]> {
    if (ids.length === 0) return [];
    const rows = await this.repository.findByChannelSkuIds(organizationId, ids);
    return hydrateChannelSkuAvailabilityRows(organizationId, rows, this.inventory);
  }

  async findByListingIds(
    organizationId: string,
    ids: string[],
  ): Promise<ChannelSkuAvailabilityItem[]> {
    if (ids.length === 0) return [];
    const rows = await this.repository.findByListingIds(organizationId, ids);
    return hydrateChannelSkuAvailabilityRows(organizationId, rows, this.inventory);
  }
}

export async function hydrateChannelSkuAvailabilityRows(
  organizationId: string,
  rows: ChannelSkuMappingRow[],
  inventory: ChannelsInventorySkuReadPort,
): Promise<ChannelSkuAvailabilityItem[]> {
  const masterProductIds = [...new Set(rows.flatMap((row) =>
    row.componentRefs.map(({ masterProductId }) => masterProductId)))];
  const inventoryRows = masterProductIds.length
    ? await inventory.findByIds(organizationId, masterProductIds)
    : [];
  const inventoryById = new Map(inventoryRows.map((row) => [row.id, row]));
  if (masterProductIds.some((id) => !inventoryById.has(id))) {
    throw new InternalServerErrorException(
      'ChannelSku component references a missing MasterProduct',
    );
  }

  return rows.map((row) => {
    const projectedComponents = row.componentRefs.map((component) => {
      const inventorySku = inventoryById.get(component.masterProductId)!;
      return {
        inventorySku,
        component,
        componentCapacity: Math.floor(
          inventorySku.currentStock / component.quantity,
        ),
      };
    });
    const sellableStock = projectChannelSkuSellableStock(projectedComponents.map((entry) => ({
      currentStock: entry.inventorySku.currentStock,
      quantity: entry.component.quantity,
    })));

    return {
      channelAccount: row.channelAccount,
      product: row.product,
      sku: {
        ...row.sku,
        mappingStatus: row.componentRefs.length > 0
          ? 'matched'
          : row.sku.mappingStatus === 'needs_review'
            ? 'needs_review'
            : 'unmatched',
        sellableStock,
        updatedAt: row.sku.updatedAt.toISOString(),
      },
      components: projectedComponents.map((entry) => ({
        masterProductId: entry.inventorySku.id,
        code: entry.inventorySku.sellpiaProductCode,
        name: entry.inventorySku.name,
        optionName: entry.inventorySku.optionName,
        barcode: entry.inventorySku.barcode,
        currentStock: entry.inventorySku.currentStock,
        purchasePrice: entry.inventorySku.purchasePrice,
        quantity: entry.component.quantity,
        mappingSource: entry.component.mappingSource,
        componentCapacity: entry.componentCapacity,
        isBottleneck: entry.componentCapacity === sellableStock,
      })),
    } satisfies ChannelSkuAvailabilityItem;
  });
}
