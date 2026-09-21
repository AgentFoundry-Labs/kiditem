import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  PRODUCT_SOURCE_READ_PORT,
  type ProductSourceReadPort,
} from '../../../../products/application/port/in/product-source-read.port';
import { withListingProductSummary } from '../../../domain/listing-product-summary';
import type {
  ChannelRecipeSuggestionContext,
  ChannelRecipeSuggestionContextRepositoryPort,
} from '../../../application/port/out/repository/channel-recipe-suggestion-context.repository.port';

@Injectable()
export class ChannelRecipeSuggestionContextRepositoryAdapter
implements ChannelRecipeSuggestionContextRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_SOURCE_READ_PORT)
    private readonly products: ProductSourceReadPort,
  ) {}

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
            displayName: true,
            channelName: true,
            options: {
              where: { organizationId },
              select: {
                inventoryComponents: {
                  where: { organizationId },
                  select: { masterProductId: true },
                },
              },
            },
          },
        },
        inventoryComponents: {
          where: { organizationId },
          orderBy: { createdAt: 'asc' },
          select: {
            quantity: true,
            createdAt: true,
            masterProductId: true,
          },
        },
      },
    });
    if (!selected) return null;
    const listingSummary = withListingProductSummary(selected.listing);

    const products = await this.products.findByIds(
      organizationId,
      selected.inventoryComponents.map((component) => component.masterProductId),
    );
    const productById = new Map(products.map((product) => [
      product.masterProductId,
      product,
    ]));

    const options = await this.prisma.channelListingOption.findMany({
      where: { id: selected.id, organizationId },
      select: {
        id: true, itemName: true, sellerSku: true, modelNumber: true, barcode: true,
        listing: { select: { displayName: true, channelName: true } },
      },
    });
    return {
      channelListingOptionId: selected.id,
      masterProductId: listingSummary.masterProductId,
      options: options.map((option) => ({
        channelListingOptionId: option.id,
        listingName: option.listing.displayName ?? option.listing.channelName,
        itemName: option.itemName,
        sellerSku: option.sellerSku,
        modelNumber: option.modelNumber,
        barcode: option.barcode,
      })),
      existingComponents: selected.inventoryComponents.flatMap((component) => {
        const product = productById.get(component.masterProductId);
        return product ? [{
          masterProductId: product.masterProductId,
          code: product.code,
          quantity: component.quantity,
          source: 'manual' as const,
          confirmedBy: null,
          confirmedAt: component.createdAt,
        }] : [];
      }),
    };
  }
}
