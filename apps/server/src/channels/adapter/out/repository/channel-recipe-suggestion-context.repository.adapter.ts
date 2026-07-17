import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ChannelRecipeSuggestionContext,
  ChannelRecipeSuggestionContextRepositoryPort,
} from '../../../application/port/out/repository/channel-recipe-suggestion-context.repository.port';

@Injectable()
export class ChannelRecipeSuggestionContextRepositoryAdapter
implements ChannelRecipeSuggestionContextRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async getContext(
    organizationId: string,
    channelListingOptionId: string,
  ): Promise<ChannelRecipeSuggestionContext | null> {
    const selected = await this.prisma.channelListingOption.findFirst({
      where: {
        id: channelListingOptionId,
        organizationId,
        isActive: true,
        listing: { is: { organizationId, isActive: true } },
      },
      select: {
        id: true,
        productVariantId: true,
        listing: { select: { displayName: true, channelName: true } },
        productVariant: {
          select: {
            masterProductId: true,
            components: {
              where: { organizationId },
              orderBy: { createdAt: 'asc' },
              select: {
                quantity: true,
                sellpiaInventorySku: { select: { id: true, code: true } },
              },
            },
          },
        },
      },
    });
    if (!selected) return null;

    const options = selected.productVariantId
      ? await this.prisma.channelListingOption.findMany({
        where: { organizationId, productVariantId: selected.productVariantId, isActive: true },
        select: {
          id: true, itemName: true, sellerSku: true, modelNumber: true,
          listing: { select: { displayName: true, channelName: true } },
        },
        orderBy: { id: 'asc' },
      })
      : await this.prisma.channelListingOption.findMany({
        where: { id: selected.id, organizationId },
        select: {
          id: true, itemName: true, sellerSku: true, modelNumber: true,
          listing: { select: { displayName: true, channelName: true } },
        },
      });
    return {
      channelListingOptionId: selected.id,
      productVariantId: selected.productVariantId,
      masterProductId: selected.productVariant?.masterProductId ?? null,
      options: options.map((option) => ({
        channelListingOptionId: option.id,
        listingName: option.listing.displayName ?? option.listing.channelName,
        itemName: option.itemName,
        sellerSku: option.sellerSku,
        modelNumber: option.modelNumber,
      })),
      existingComponents: (selected.productVariant?.components ?? []).map((component) => ({
        sellpiaInventorySkuId: component.sellpiaInventorySku.id,
        code: component.sellpiaInventorySku.code,
        quantity: component.quantity,
      })),
    };
  }
}
