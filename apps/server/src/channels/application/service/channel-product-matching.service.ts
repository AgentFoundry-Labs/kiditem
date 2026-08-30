import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  LinkChannelListingProductInputSchema,
  type ChannelOptionMatchingQueueRow,
  type ChannelProductCandidateListResponse,
} from '@kiditem/shared/channel-product-matching';
import type { InventorySkuAvailability } from '@kiditem/shared/inventory-availability';
import { z } from 'zod';
import { rankChannelProductCandidates } from '../../domain/channel-product-candidate-ranking';
import {
  CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT,
  type ChannelOptionMatchingRepositoryRow,
  type ChannelProductMatchingQuery,
  type ChannelProductMatchingRepositoryPort,
} from '../port/out/repository/channel-product-matching.repository.port';
import {
  CATALOG_DISPLAY_MEDIA_PORT,
  type CatalogDisplayMediaPort,
} from '../../../ai/application/port/in/workspace/catalog-display-media.port';
import {
  INVENTORY_AVAILABILITY_PORT,
  type InventoryAvailabilityPort,
} from '../../../inventory/application/port/in/stock/inventory-availability.port';
import { projectChannelInventoryComponents } from './channel-inventory-availability.projection';

@Injectable()
export class ChannelProductMatchingService {
  private readonly logger = new Logger(ChannelProductMatchingService.name);

  constructor(
    @Inject(CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT)
    private readonly repository: ChannelProductMatchingRepositoryPort,
    @Inject(CATALOG_DISPLAY_MEDIA_PORT)
    private readonly catalogDisplayMedia: CatalogDisplayMediaPort,
    @Inject(INVENTORY_AVAILABILITY_PORT)
    private readonly inventory: InventoryAvailabilityPort,
  ) {}

  async list(organizationId: string, query: ChannelProductMatchingQuery = {}) {
    const queue = await this.repository.listQueue(organizationId, {
      channelAccountId: query.channelAccountId,
      search: query.search?.trim() || undefined,
    });
    const channelImages = await this.loadChannelImages(
      organizationId,
      queue.products.map((row) => row.listing.id),
    );
    const products = queue.products.map((row) => {
      const channelImageUrl = channelImages.get(row.listing.id)?.url ?? null;
      return {
        ...row,
        listing: { ...row.listing, channelImageUrl },
        linkedProduct: row.linkedProduct ? {
          ...row.linkedProduct,
          displayImageUrl: row.linkedProduct.displayImageUrl ?? channelImageUrl,
        } : null,
      };
    });
    const options = await this.projectOptions(organizationId, queue.options);
    return {
      products,
      options,
      counts: {
        products: {
          all: products.length,
          linked: products.filter((row) => row.listing.masterProductId !== null).length,
          unlinked: products.filter((row) => row.listing.masterProductId === null).length,
        },
        options: {
          all: options.length,
          configured: options.filter(
            (row) => row.option.inventoryComponents.length > 0,
          ).length,
          unconfigured: options.filter(
            (row) => row.option.inventoryComponents.length === 0,
          ).length,
        },
      },
    };
  }

  private async projectOptions(
    organizationId: string,
    rows: ChannelOptionMatchingRepositoryRow[],
  ): Promise<ChannelOptionMatchingQueueRow[]> {
    const sellpiaInventorySkuIds = [...new Set(rows.flatMap((row) =>
      row.option.inventoryComponents.map((component) =>
        component.sellpiaInventorySkuId)))].sort((left, right) =>
      left.localeCompare(right));
    const availability = await this.inventory.findBySkuIds({
      organizationId,
      sellpiaInventorySkuIds,
    });
    const inventoryBySkuId = new Map(availability.items.map((item) => [
      item.sellpiaInventorySkuId,
      item,
    ]));
    return rows.map((row) => toOptionQueueRow(row, inventoryBySkuId));
  }

  private async loadChannelImages(organizationId: string, listingIds: string[]) {
    if (listingIds.length === 0) return new Map();
    try {
      return await this.catalogDisplayMedia.findDisplayMedia({
        organizationId,
        requests: listingIds.map((key) => ({
          key,
          candidates: [{ channelListingId: key, externalOptionId: null }],
        })),
      });
    } catch (error) {
      this.logger.warn(
        `Matching display media enrichment failed for organization ${organizationId}.`,
        error instanceof Error ? error.stack : undefined,
      );
      return new Map();
    }
  }

  async productCandidates(
    organizationId: string,
    channelListingId: string,
    query: { search?: string },
  ): Promise<ChannelProductCandidateListResponse> {
    const search = query.search?.trim() || undefined;
    const context = await this.repository.getProductCandidateContext(
      organizationId,
      channelListingId,
      search,
    );
    if (!context) throw new NotFoundException('ChannelListing was not found');
    return {
      items: rankChannelProductCandidates({
        candidates: context.candidates,
        confirmedMasterProductId: context.masterProductId,
        providerIdentity: context.externalId,
        explicitCode: context.explicitCode,
        barcode: context.barcode,
        name: context.displayName,
        aiSuggestion: context.aiSuggestion,
        manualSearch: search,
      }),
    };
  }

  async linkProduct(
    organizationId: string,
    channelListingId: string,
    rawInput: unknown,
  ): Promise<void> {
    const parsed = LinkChannelListingProductInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid ChannelListing product link',
        errors: parsed.error.flatten(),
      });
    }
    return this.repository.linkProduct({
      organizationId,
      channelListingId,
      masterProductId: parsed.data.masterProductId,
    });
  }

  async autoMatch(organizationId: string, rawInput: unknown) {
    const parsed = z.object({
      channelAccountId: z.string().uuid().optional(),
    }).strict().safeParse(rawInput ?? {});
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid automatic product matching request',
        errors: parsed.error.flatten(),
      });
    }
    return this.repository.autoMatch({
      organizationId,
      channelAccountId: parsed.data.channelAccountId,
    });
  }
}

function toOptionQueueRow(
  row: ChannelOptionMatchingRepositoryRow,
  inventoryBySkuId: ReadonlyMap<string, InventorySkuAvailability>,
): ChannelOptionMatchingQueueRow {
  const { components, projection } = projectChannelInventoryComponents(
    row.option.inventoryComponents,
    inventoryBySkuId,
  );
  return {
    ...row,
    option: { ...row.option, inventoryComponents: components },
    capacity: projection.warningState === 'none' ? projection.capacity : null,
  };
}
