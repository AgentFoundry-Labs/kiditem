import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LinkChannelListingOptionInputSchema,
  LinkChannelListingProductInputSchema,
  type ChannelProductCandidateListResponse,
  type ChannelVariantCandidateListResponse,
} from '@kiditem/shared/channel-product-matching';
import { rankChannelProductCandidates } from '../../domain/channel-product-candidate-ranking';
import { rankChannelVariantCandidates } from '../../domain/channel-variant-candidate-ranking';
import {
  CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT,
  type ChannelProductMatchingQuery,
  type ChannelProductMatchingRepositoryPort,
} from '../port/out/repository/channel-product-matching.repository.port';
import {
  CHANNEL_SKU_AVAILABILITY_PORT,
  type ChannelSkuAvailabilityPort,
} from '../port/in/channel-sku-availability.port';

@Injectable()
export class ChannelProductMatchingService {
  constructor(
    @Inject(CHANNEL_PRODUCT_MATCHING_REPOSITORY_PORT)
    private readonly repository: ChannelProductMatchingRepositoryPort,
    @Inject(CHANNEL_SKU_AVAILABILITY_PORT)
    private readonly channelAvailability: ChannelSkuAvailabilityPort,
  ) {}

  async list(organizationId: string, query: ChannelProductMatchingQuery = {}) {
    const queue = await this.repository.listQueue(organizationId, {
      channelAccountId: query.channelAccountId,
      search: query.search?.trim() || undefined,
    });
    const linkedOptionIds = queue.options
      .filter((row) => row.option.productVariantId !== null)
      .map((row) => row.option.id);
    const availability = await this.channelAvailability.findByChannelSkuIds(
      organizationId,
      linkedOptionIds,
    );
    const byOptionId = new Map(availability.map((item) => [item.sku.id, item]));
    const options = queue.options.map((row) => {
      const item = byOptionId.get(row.option.id);
      if (!item) return row;
      return {
        ...row,
        recipeStatus: item.recipeStatus,
        capacity: item.recipeStatus === 'matched' ? item.sku.sellableStock : null,
      };
    });
    return {
      products: queue.products,
      options,
      counts: {
        products: {
          all: queue.products.length,
          linked: queue.products.filter((row) => row.listing.masterProductId !== null).length,
          unlinked: queue.products.filter((row) => row.listing.masterProductId === null).length,
        },
        options: {
          all: options.length,
          linked: options.filter((row) => row.option.productVariantId !== null).length,
          unlinked: options.filter((row) => row.option.productVariantId === null).length,
          recipeConfirmed: options.filter((row) => row.recipeStatus === 'matched').length,
          configurationRequired: options.filter(
            (row) => row.recipeStatus === 'configuration_required',
          ).length,
          reviewRequired: options.filter((row) => row.recipeStatus === 'review_required').length,
        },
      },
    };
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

  async variantCandidates(
    organizationId: string,
    channelListingOptionId: string,
    query: { search?: string },
  ): Promise<ChannelVariantCandidateListResponse> {
    const search = query.search?.trim() || undefined;
    const context = await this.repository.getVariantCandidateContext(
      organizationId,
      channelListingOptionId,
      search,
    );
    if (!context) throw new NotFoundException('ChannelListingOption was not found');
    if (!context.masterProductId) {
      throw new BadRequestException(
        'Confirm the parent ChannelListing MasterProduct before matching options',
      );
    }
    return {
      items: rankChannelVariantCandidates({
        candidates: context.candidates,
        confirmedMasterProductId: context.masterProductId,
        confirmedProductVariantId: context.productVariantId,
        providerIdentity: context.externalOptionId,
        explicitCode: context.sellerSku,
        barcode: context.barcode,
        name: context.itemName,
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

  async linkOption(
    organizationId: string,
    channelListingOptionId: string,
    rawInput: unknown,
  ): Promise<void> {
    const parsed = LinkChannelListingOptionInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid ChannelListingOption variant link',
        errors: parsed.error.flatten(),
      });
    }
    return this.repository.linkOption({
      organizationId,
      channelListingOptionId,
      productVariantId: parsed.data.productVariantId,
    });
  }
}
