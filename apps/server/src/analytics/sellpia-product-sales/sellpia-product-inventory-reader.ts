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
import {
  INVENTORY_TRANSACTIONAL_READ_PORT,
  type InventoryTransactionalReadPort,
} from '../../inventory/application/port/in/stock/inventory-transactional-read.port';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PRODUCT_ABC_READ_PORT,
  type ProductAbcReadPort,
} from '../../products/application/port/in/product-abc-read.port';
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
    @Inject(PRODUCT_ABC_READ_PORT)
    private readonly productAbc: ProductAbcReadPort,
    @Inject(INVENTORY_TRANSACTIONAL_READ_PORT)
    private readonly inventoryTransactionalRead: InventoryTransactionalReadPort,
  ) {}

  async project(
    organizationId: string,
    products: readonly SellpiaProductInventoryProjectionInput[],
  ) {
    const candidates = await this.prisma.$transaction(async (tx) => {
      const identities = await this.inventoryTransactionalRead.readSkuIdentities(
        { client: tx },
        { organizationId, selector: { kind: 'all' } },
      );
      const masterProductIds = [...new Set(identities.flatMap((identity) =>
        identity.masterProductId ? [identity.masterProductId] : []))];
      const masterProducts = masterProductIds.length > 0
        ? await tx.masterProduct.findMany({
          where: { organizationId, id: { in: masterProductIds } },
          select: { id: true, code: true, name: true, createdAt: true },
        })
        : [];
      const masterById = new Map(masterProducts.map((product) => [product.id, product]));
      return identities.map((identity) => ({
        id: identity.sellpiaInventorySkuId,
        code: identity.code,
        barcode: identity.barcode,
        masterProduct: identity.masterProductId
          ? masterById.get(identity.masterProductId) ?? null
          : null,
      }));
    });
    // ABC belongs to Products: this read names the inventory products it
    // resolved and displays the status Products published for them, rather
    // than deriving one against a cutoff of its own (ADR 0002).
    const abcSnapshot = await this.productAbc.readAbc({
      organizationId,
      masterProductIds: [...new Set(candidates.flatMap((candidate) =>
        candidate.masterProduct ? [candidate.masterProduct.id] : []))],
    });
    const abcByProductId = new Map(abcSnapshot.products.map((product) =>
      [product.masterProductId, product.abc] as const));
    const resolved = resolveSellpiaProductInventoryRows(products, candidates);
    const canonicalProductBySkuId = new Map(candidates.flatMap((candidate) => {
      const product = candidate.masterProduct;
      if (!product) return [];
      const abc = abcByProductId.get(product.id);
      if (!abc) return [];
      return [[candidate.id, {
        sellpiaInventorySkuId: candidate.id,
        masterProductId: product.id,
        masterProductCode: product.code,
        masterProductName: product.name,
        abc,
      }] as const];
    }));
    const availability = await this.inventory.findBySkuIds({
      organizationId,
      sellpiaInventorySkuIds: resolved.matchedSkuIds,
    });
    const destinationRows = resolved.matchedSkuIds.length > 0
      ? await this.prisma.channelListingOptionInventoryComponent.findMany({
        where: {
          organizationId,
          sellpiaInventorySkuId: { in: resolved.matchedSkuIds },
          channelListingOption: {
            organizationId,
            isActive: true,
            listing: {
              organizationId,
              isActive: true,
              channelAccount: { organizationId, status: 'active' },
            },
          },
        },
        select: {
          sellpiaInventorySkuId: true,
          quantity: true,
          channelListingOption: {
            select: {
              id: true,
              externalOptionId: true,
              itemName: true,
              listing: {
                select: {
                  id: true,
                  externalId: true,
                  channelAccount: { select: { channel: true, isPrimary: true } },
                },
              },
            },
          },
        },
      })
      : [];
    const mediaRequests = uniqueMediaRequests(organizationId, destinationRows);
    let mediaByOptionId = new Map<string, Awaited<ReturnType<
      CatalogDisplayMediaPort['findDisplayMedia']
    >> extends Map<string, infer Media> ? Media : never>();
    if (mediaRequests.length > 0) {
      try {
        mediaByOptionId = await this.catalogDisplayMedia.findDisplayMedia({
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
      inventoryProducts: [...canonicalProductBySkuId.values()],
      destinations: destinationRows.flatMap((row) => {
        const product = canonicalProductBySkuId.get(row.sellpiaInventorySkuId);
        if (!product) return [];
        return [{
        sellpiaInventorySkuId: row.sellpiaInventorySkuId,
        unitsPerSale: row.quantity,
        masterProductId: product.masterProductId,
        masterProductCode: product.masterProductCode,
        masterProductName: product.masterProductName,
        channelListingOptionId: row.channelListingOption.id,
        channelListingId: row.channelListingOption.listing.id,
        channel: row.channelListingOption.listing.channelAccount.channel,
        externalOptionId: row.channelListingOption.externalOptionId,
        optionName: row.channelListingOption.itemName,
        abc: product.abc,
        displayImage: mediaByOptionId.get(row.channelListingOption.id) ?? null,
      }];
      }),
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
  _organizationId: string,
  rows: readonly {
    channelListingOption: {
      id: string;
      externalOptionId: string;
      listing: {
        id: string;
        externalId: string;
        channelAccount: { isPrimary: boolean };
      };
    };
  }[],
) {
  const byOptionId = new Map<string, DestinationOptionTarget>();
  for (const row of rows) {
    const option = row.channelListingOption;
    if (!byOptionId.has(option.id)) {
      byOptionId.set(option.id, {
        channelListingId: option.listing.id,
        externalOptionId: option.externalOptionId,
        isOrigin: false,
        isPrimaryAccount: option.listing.channelAccount.isPrimary,
        listingExternalId: option.listing.externalId,
      });
    }
  }
  return [...byOptionId.entries()].map(([key, candidate]) => ({
    key,
    candidates: [{
      channelListingId: candidate.channelListingId,
      externalOptionId: candidate.externalOptionId,
    }],
  }));
}
