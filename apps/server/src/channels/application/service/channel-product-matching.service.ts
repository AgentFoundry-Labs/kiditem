import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  LinkChannelListingProductInputSchema,
  type ChannelProductCandidateListResponse,
} from '@kiditem/shared/channel-product-matching';
import { z } from 'zod';
import { rankChannelProductCandidates } from '../../domain/channel-product-candidate-ranking';
import {
  CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT,
  type ChannelProductMatchingQuery,
  type ChannelProductMatchingRepositoryPort,
} from '../port/out/repository/channel-product-matching.repository.port';
import {
  CATALOG_DISPLAY_MEDIA_PORT,
  type CatalogDisplayMediaPort,
} from '../../../ai/application/port/in/workspace/catalog-display-media.port';

@Injectable()
export class ChannelProductMatchingService {
  private readonly logger = new Logger(ChannelProductMatchingService.name);

  constructor(
    @Inject(CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT)
    private readonly repository: ChannelProductMatchingRepositoryPort,
    @Inject(CATALOG_DISPLAY_MEDIA_PORT)
    private readonly catalogDisplayMedia: CatalogDisplayMediaPort,
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
    const options = queue.options;
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
