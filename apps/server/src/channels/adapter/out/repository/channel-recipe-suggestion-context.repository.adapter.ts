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
        listing: {
          select: {
            masterProductId: true,
            displayName: true,
            channelName: true,
          },
        },
        inventoryComponents: {
          where: { organizationId },
          orderBy: { createdAt: 'asc' },
          select: {
            quantity: true,
            createdAt: true,
            sellpiaInventorySku: { select: { id: true, code: true } },
          },
        },
      },
    });
    if (!selected) return null;

    const options = await this.prisma.channelListingOption.findMany({
      where: { id: selected.id, organizationId },
      select: {
        id: true, itemName: true, sellerSku: true, modelNumber: true, barcode: true,
        listing: { select: { displayName: true, channelName: true } },
      },
    });
    return {
      channelListingOptionId: selected.id,
      masterProductId: selected.listing.masterProductId,
      options: options.map((option) => ({
        channelListingOptionId: option.id,
        listingName: option.listing.displayName ?? option.listing.channelName,
        itemName: option.itemName,
        sellerSku: option.sellerSku,
        modelNumber: option.modelNumber,
        barcode: option.barcode,
      })),
      existingComponents: selected.inventoryComponents.map((component) => ({
        sellpiaInventorySkuId: component.sellpiaInventorySku.id,
        code: component.sellpiaInventorySku.code,
        quantity: component.quantity,
        source: 'manual' as const,
        confirmedBy: null,
        confirmedAt: component.createdAt,
      })),
    };
  }
}
