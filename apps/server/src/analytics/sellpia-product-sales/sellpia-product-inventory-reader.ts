import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CATALOG_DISPLAY_MEDIA_PORT,
  type CatalogDisplayMediaPort,
  type CatalogDisplayMediaTarget,
} from '../../ai/application/port/in/workspace/catalog-display-media.port';
import {
  INVENTORY_AVAILABILITY_PORT,
  type InventoryAvailabilityPort,
} from '../../inventory/application/port/in/stock/inventory-availability.port';
import { PrismaService } from '../../prisma/prisma.service';
import {
  projectSellpiaProductInventory,
  resolveSellpiaProductInventoryRows,
  type SellpiaProductInventoryProjectionInput,
} from './sellpia-product-inventory-projection';

@Injectable()
export class SellpiaProductInventoryReader {
  private readonly logger = new Logger(SellpiaProductInventoryReader.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(INVENTORY_AVAILABILITY_PORT)
    private readonly inventory: InventoryAvailabilityPort,
    @Inject(CATALOG_DISPLAY_MEDIA_PORT)
    private readonly catalogDisplayMedia: CatalogDisplayMediaPort,
  ) {}

  async project(
    organizationId: string,
    products: readonly SellpiaProductInventoryProjectionInput[],
  ) {
    const candidates = await this.prisma.sellpiaInventorySku.findMany({
      where: { organizationId },
      select: { id: true, code: true, barcode: true, isActive: true },
    });
    const resolved = resolveSellpiaProductInventoryRows(products, candidates);
    const availability = await this.inventory.findBySkuIds({
      organizationId,
      sellpiaInventorySkuIds: resolved.matchedSkuIds,
    });
    const destinationRows = resolved.matchedSkuIds.length > 0
      ? await this.prisma.productVariantComponent.findMany({
        where: {
          organizationId,
          sellpiaInventorySkuId: { in: resolved.matchedSkuIds },
          productVariant: {
            is: {
              organizationId,
              isActive: true,
              masterProduct: {
                is: { organizationId, isActive: true },
              },
            },
          },
        },
        select: {
          sellpiaInventorySkuId: true,
          quantity: true,
          productVariant: {
            select: {
              id: true,
              code: true,
              name: true,
              masterProduct: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  abcGrade: true,
                  originChannelListingId: true,
                },
              },
              channelListingOptions: {
                where: {
                  organizationId,
                  isActive: true,
                  listing: {
                    is: {
                      organizationId,
                      isActive: true,
                      channelAccount: {
                        is: {
                          organizationId,
                          status: 'active',
                        },
                      },
                    },
                  },
                },
                select: {
                  organizationId: true,
                  productVariantId: true,
                  externalOptionId: true,
                  isActive: true,
                  listing: {
                    select: {
                      id: true,
                      organizationId: true,
                      masterProductId: true,
                      externalId: true,
                      isActive: true,
                      channelAccount: {
                        select: {
                          organizationId: true,
                          channel: true,
                          status: true,
                          isPrimary: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      })
      : [];
    const mediaRequests = uniqueMediaRequests(organizationId, destinationRows);
    let mediaByVariantId = new Map<string, Awaited<ReturnType<
      CatalogDisplayMediaPort['findDisplayMedia']
    >> extends Map<string, infer Media> ? Media : never>();
    if (mediaRequests.length > 0) {
      try {
        mediaByVariantId = await this.catalogDisplayMedia.findDisplayMedia({
          organizationId,
          requests: mediaRequests,
        });
      } catch (error) {
        this.logger.warn(
          `Catalog display media enrichment failed for organization ${organizationId} (${mediaRequests.length} targets).`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
    const projection = projectSellpiaProductInventory({
      products,
      resolutions: resolved.resolutions,
      availability,
      destinations: destinationRows.map((row) => ({
        sellpiaInventorySkuId: row.sellpiaInventorySkuId,
        unitsPerVariant: row.quantity,
        masterProductId: row.productVariant.masterProduct.id,
        masterProductCode: row.productVariant.masterProduct.code,
        masterProductName: row.productVariant.masterProduct.name,
        productVariantId: row.productVariant.id,
        productVariantCode: row.productVariant.code,
        productVariantName: row.productVariant.name,
        abcGrade:
          row.productVariant.masterProduct.abcGrade === 'A'
          || row.productVariant.masterProduct.abcGrade === 'B'
          || row.productVariant.masterProduct.abcGrade === 'C'
            ? row.productVariant.masterProduct.abcGrade
            : null,
        displayImage: mediaByVariantId.get(row.productVariant.id) ?? null,
      })),
    });
    return { availability, projection };
  }
}

type DestinationOptionTarget = CatalogDisplayMediaTarget & {
  isOrigin: boolean;
  isPrimaryAccount: boolean;
  listingExternalId: string;
};

export function compareOptionTargets(
  left: DestinationOptionTarget,
  right: DestinationOptionTarget,
): number {
  return Number(right.isOrigin) - Number(left.isOrigin)
    || Number(right.isPrimaryAccount) - Number(left.isPrimaryAccount)
    || left.listingExternalId.localeCompare(right.listingExternalId)
    || left.channelListingId.localeCompare(right.channelListingId)
    || left.externalOptionId!.localeCompare(right.externalOptionId!);
}

function uniqueMediaRequests(
  organizationId: string,
  rows: readonly {
    productVariant: {
      id: string;
      masterProduct: { id: string; originChannelListingId?: string | null };
      channelListingOptions?: readonly DestinationOptionSource[];
    };
  }[],
) {
  const candidatesByVariantId = new Map<string, DestinationOptionTarget[]>();
  for (const row of rows) {
    const variant = row.productVariant;
    const candidates = selectDestinationOptionTargets({
      organizationId,
      productVariantId: variant.id,
      masterProductId: variant.masterProduct.id,
      originChannelListingId: variant.masterProduct.originChannelListingId ?? null,
      options: variant.channelListingOptions ?? [],
    });
    if (candidates.length > 0 && !candidatesByVariantId.has(variant.id)) {
      candidatesByVariantId.set(variant.id, candidates);
    }
  }
  return [...candidatesByVariantId.entries()].map(([key, candidates]) => ({
    key,
    candidates: candidates.map(({ channelListingId, externalOptionId }) => ({
      channelListingId,
      externalOptionId,
    })),
  }));
}

type DestinationOptionSource = {
  organizationId: string;
  productVariantId: string | null;
  externalOptionId: string;
  isActive: boolean;
  listing: {
    id: string;
    organizationId: string;
    masterProductId: string | null;
    externalId: string;
    isActive: boolean;
    channelAccount: {
      organizationId: string;
      channel: string;
      status: string;
      isPrimary: boolean;
    };
  };
};

function selectDestinationOptionTargets(input: {
  organizationId: string;
  productVariantId: string;
  masterProductId: string;
  originChannelListingId: string | null;
  options: readonly DestinationOptionSource[];
}): DestinationOptionTarget[] {
  return input.options.flatMap((option) => {
    const listing = option.listing;
    const account = listing.channelAccount;
    if (
      option.organizationId !== input.organizationId
      || option.productVariantId !== input.productVariantId
      || !option.isActive
      || !option.externalOptionId.trim()
      || listing.organizationId !== input.organizationId
      || listing.masterProductId !== input.masterProductId
      || !listing.isActive
      || account.organizationId !== input.organizationId
      || !account.channel.trim()
      || account.status !== 'active'
    ) return [];
    return [{
      channelListingId: listing.id,
      externalOptionId: option.externalOptionId,
      isOrigin: listing.id === input.originChannelListingId,
      isPrimaryAccount: account.isPrimary,
      listingExternalId: listing.externalId,
    }];
  }).sort(compareOptionTargets);
}
