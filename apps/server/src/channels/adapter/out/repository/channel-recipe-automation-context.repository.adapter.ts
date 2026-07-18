import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  ChannelRecipeAutomationContext,
  ChannelRecipeAutomationContextRepositoryPort,
} from '../../../application/port/out/repository/channel-recipe-automation-context.repository.port';

const COMPLETED_CATALOG_SOURCE_TYPES = [
  'coupang_wing_catalog',
  'coupang_rocket_po_catalog',
] as const;
const PUBLISHED_BROWSER_CATALOG_SOURCE = 'coupang_catalog_browser';

@Injectable()
export class ChannelRecipeAutomationContextRepositoryAdapter
implements ChannelRecipeAutomationContextRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listContexts(
    organizationId: string,
    channelAccountId: string,
  ): Promise<ChannelRecipeAutomationContext[]> {
    const selectedOptions = await this.prisma.channelListingOption.findMany({
      where: {
        organizationId,
        isActive: true,
        productVariantId: { not: null },
        listing: {
          is: {
            organizationId,
            channelAccountId,
            isActive: true,
            OR: [
              {
                lastImportRun: {
                  is: {
                    organizationId,
                    status: 'completed',
                    sourceType: { in: [...COMPLETED_CATALOG_SOURCE_TYPES] },
                  },
                },
              },
              {
                options: {
                  some: {
                    organizationId,
                    isActive: true,
                    rawJson: {
                      path: ['source'],
                      equals: PUBLISHED_BROWSER_CATALOG_SOURCE,
                    },
                  },
                },
              },
            ],
          },
        },
      },
      select: { id: true, productVariantId: true },
      orderBy: { id: 'asc' },
    });
    const variantIds = [...new Set(selectedOptions
      .map((option) => option.productVariantId)
      .filter((id): id is string => id !== null))].sort();
    if (variantIds.length === 0) return [];

    const allLinkedOptions = await this.prisma.channelListingOption.findMany({
      where: {
        organizationId,
        isActive: true,
        productVariantId: { in: variantIds },
      },
      select: {
        id: true,
        productVariantId: true,
        itemName: true,
        sellerSku: true,
        modelNumber: true,
        barcode: true,
        listing: { select: { displayName: true, channelName: true } },
        productVariant: {
          select: {
            masterProductId: true,
            components: {
              where: { organizationId },
              orderBy: { createdAt: 'asc' },
              select: {
                quantity: true,
                source: true,
                confirmedBy: true,
                confirmedAt: true,
                sellpiaInventorySku: { select: { id: true, code: true } },
              },
            },
          },
        },
      },
      orderBy: [{ productVariantId: 'asc' }, { id: 'asc' }],
    });

    const selectedIdsByVariant = new Map<string, string[]>();
    for (const option of selectedOptions) {
      if (!option.productVariantId) continue;
      const ids = selectedIdsByVariant.get(option.productVariantId) ?? [];
      ids.push(option.id);
      selectedIdsByVariant.set(option.productVariantId, ids);
    }
    const optionsByVariant = new Map<string, typeof allLinkedOptions>();
    for (const option of allLinkedOptions) {
      if (!option.productVariantId) continue;
      const options = optionsByVariant.get(option.productVariantId) ?? [];
      options.push(option);
      optionsByVariant.set(option.productVariantId, options);
    }

    return variantIds.flatMap((productVariantId) => {
      const options = optionsByVariant.get(productVariantId) ?? [];
      const variant = options[0]?.productVariant;
      if (!variant) return [];
      return [{
        productVariantId,
        masterProductId: variant.masterProductId,
        selectedChannelListingOptionIds: [...(selectedIdsByVariant.get(productVariantId) ?? [])].sort(),
        allLinkedOptions: options.map((option) => ({
          channelListingOptionId: option.id,
          listingName: option.listing.displayName ?? option.listing.channelName,
          itemName: option.itemName,
          sellerSku: option.sellerSku,
          modelNumber: option.modelNumber,
          barcode: option.barcode,
        })),
        existingComponents: variant.components.map((component) => ({
          sellpiaInventorySkuId: component.sellpiaInventorySku.id,
          code: component.sellpiaInventorySku.code,
          quantity: component.quantity,
          source: recipeSource(component.source),
          confirmedBy: component.confirmedBy,
          confirmedAt: component.confirmedAt,
        })),
      }];
    });
  }
}

function recipeSource(value: string): 'manual' | 'deterministic' {
  if (value === 'manual' || value === 'deterministic') return value;
  throw new Error(`Unsupported product variant component source: ${value}`);
}
