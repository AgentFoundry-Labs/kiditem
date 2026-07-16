import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { projectVariantCapacity } from '../../../../products/domain/product-variant-capacity';
import type {
  ChannelOptionMatchingQueueRow,
  ChannelProductMatchingQueueRow,
  ChannelProductMatchingRepositoryPort,
  ChannelAvailabilityRepositoryRow,
} from '../../../application/port/out/repository/channel-product-matching.repository.port';

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;
const COMPLETED_CATALOG_SOURCE_TYPES = [
  'coupang_wing_catalog',
  'coupang_rocket_po_catalog',
] as const;

function listingInclude(organizationId: string) {
  return {
    channelAccount: {
      select: { id: true, channel: true, name: true },
    },
    masterProduct: {
      select: { id: true, code: true, name: true },
    },
    options: {
      where: { organizationId, isActive: true },
      orderBy: [{ updatedAt: 'desc' as const }, { id: 'asc' as const }],
      include: {
        productVariant: {
          include: {
            components: {
              where: { organizationId },
              orderBy: { createdAt: 'asc' as const },
              include: {
                sellpiaInventorySku: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    optionName: true,
                    barcode: true,
                    currentStock: true,
                    purchasePrice: true,
                    isActive: true,
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

type ListingRow = Prisma.ChannelListingGetPayload<{
  include: ReturnType<typeof listingInclude>;
}>;
type OptionRow = ListingRow['options'][number];

@Injectable()
export class ChannelProductMatchingRepositoryAdapter
implements ChannelProductMatchingRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async listQueue(
    organizationId: string,
    query: { channelAccountId?: string; search?: string },
  ) {
    const listings = await this.loadListings(organizationId, query, 'matching');
    const products = listings.map(toProductQueueRow);
    const options = listings.flatMap((listing) =>
      listing.options.map((option) => toOptionQueueRow(listing, option)));
    return {
      products,
      options,
      counts: {
        products: {
          all: products.length,
          matched: products.filter((row) => row.listing.masterProductId !== null).length,
          unmatched: products.filter((row) => row.listing.masterProductId === null).length,
        },
        options: {
          all: options.length,
          matched: options.filter((row) => row.recipeStatus === 'matched').length,
          unmatched: options.filter((row) => row.recipeStatus === 'unmatched').length,
          configurationRequired: options.filter(
            (row) => row.recipeStatus === 'configuration_required',
          ).length,
          reviewRequired: options.filter(
            (row) => row.recipeStatus === 'review_required',
          ).length,
        },
      },
    };
  }

  async getProductCandidateContext(
    organizationId: string,
    channelListingId: string,
    search?: string,
  ) {
    const listing = await this.prisma.channelListing.findFirst({
      where: { id: channelListingId, ...matchingListingWhere(organizationId) },
      select: {
        id: true,
        externalId: true,
        masterProductId: true,
        displayName: true,
        channelName: true,
        rawJson: true,
      },
    });
    if (!listing) return null;
    const manualSearch = search?.trim();
    const candidates = await this.prisma.masterProduct.findMany({
      where: {
        organizationId,
        isActive: true,
        ...(manualSearch ? {
          OR: [
            { code: { contains: manualSearch, mode: 'insensitive' } },
            { name: { contains: manualSearch, mode: 'insensitive' } },
            { category: { contains: manualSearch, mode: 'insensitive' } },
            { brand: { contains: manualSearch, mode: 'insensitive' } },
          ],
        } : {}),
      },
      select: {
        id: true,
        code: true,
        name: true,
        category: true,
        brand: true,
        variants: {
          where: { organizationId, isActive: true },
          select: {
            components: {
              where: { organizationId },
              select: {
                sellpiaInventorySku: { select: { barcode: true } },
              },
            },
          },
        },
      },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    });
    const raw = asRecord(listing.rawJson);
    return {
      listingId: listing.id,
      externalId: listing.externalId,
      masterProductId: listing.masterProductId,
      displayName: listing.displayName ?? listing.channelName,
      explicitCode: firstString(raw, ['masterProductCode', 'productCode', 'code']),
      barcode: firstString(raw, ['barcode', 'productBarcode']),
      aiSuggestion: aiProductSuggestion(raw),
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        code: candidate.code,
        name: candidate.name,
        category: candidate.category,
        brand: candidate.brand,
        barcodes: distinctStrings(candidate.variants.flatMap((variant) =>
          variant.components.map((component) => component.sellpiaInventorySku.barcode))),
      })),
    };
  }

  async getVariantCandidateContext(
    organizationId: string,
    channelListingOptionId: string,
    search?: string,
  ) {
    const option = await this.prisma.channelListingOption.findFirst({
      where: {
        id: channelListingOptionId,
        organizationId,
        listing: { is: matchingListingWhere(organizationId) },
      },
      select: {
        id: true,
        externalOptionId: true,
        productVariantId: true,
        sellerSku: true,
        barcode: true,
        itemName: true,
        rawJson: true,
        listing: { select: { masterProductId: true } },
      },
    });
    if (!option) return null;
    const masterProductId = option.listing.masterProductId;
    const manualSearch = search?.trim();
    const candidates = masterProductId
      ? await this.prisma.productVariant.findMany({
        where: {
          organizationId,
          masterProductId,
          isActive: true,
          ...(manualSearch ? {
            OR: [
              { code: { contains: manualSearch, mode: 'insensitive' } },
              { name: { contains: manualSearch, mode: 'insensitive' } },
              { optionLabel: { contains: manualSearch, mode: 'insensitive' } },
            ],
          } : {}),
        },
        select: {
          id: true,
          masterProductId: true,
          code: true,
          name: true,
          optionLabel: true,
          components: {
            where: { organizationId },
            select: {
              sellpiaInventorySku: { select: { barcode: true } },
            },
          },
        },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
      })
      : [];
    const raw = asRecord(option.rawJson);
    return {
      optionId: option.id,
      externalOptionId: option.externalOptionId,
      productVariantId: option.productVariantId,
      masterProductId,
      sellerSku: option.sellerSku,
      barcode: option.barcode,
      itemName: option.itemName,
      aiSuggestion: aiVariantSuggestion(raw),
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        masterProductId: candidate.masterProductId,
        code: candidate.code,
        name: candidate.name,
        optionLabel: candidate.optionLabel,
        barcodes: distinctStrings(candidate.components.map(
          (component) => component.sellpiaInventorySku.barcode,
        )),
      })),
    };
  }

  async linkProduct(input: {
    organizationId: string;
    channelListingId: string;
    masterProductId: string | null;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const listing = await lockChannelListing(
        tx,
        input.organizationId,
        input.channelListingId,
      );
      if (!listing) throw new NotFoundException('ChannelListing was not found');
      if (input.masterProductId) {
        const product = await tx.masterProduct.findFirst({
          where: {
            id: input.masterProductId,
            organizationId: input.organizationId,
            isActive: true,
          },
          select: { id: true },
        });
        if (!product) {
          throw new BadRequestException(
            'MasterProduct is inactive, missing, or belongs to another organization',
          );
        }
      }
      const updated = await tx.channelListing.updateMany({
        where: { id: listing.id, organizationId: input.organizationId },
        data: { masterProductId: input.masterProductId },
      });
      if (updated.count !== 1) throw new NotFoundException('ChannelListing was not found');
      if (
        input.masterProductId === null
        || (
          listing.masterProductId !== null
          && listing.masterProductId !== input.masterProductId
        )
      ) {
        await tx.channelListingOption.updateMany({
          where: {
            organizationId: input.organizationId,
            listingId: listing.id,
          },
          data: { productVariantId: null },
        });
      }
    }, TRANSACTION_OPTIONS);
  }

  async linkOption(input: {
    organizationId: string;
    channelListingOptionId: string;
    productVariantId: string | null;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const option = await tx.channelListingOption.findFirst({
        where: { id: input.channelListingOptionId, organizationId: input.organizationId },
        select: { id: true, listingId: true },
      });
      if (!option) throw new NotFoundException('ChannelListingOption was not found');
      const listing = await lockChannelListing(
        tx,
        input.organizationId,
        option.listingId,
      );
      if (!listing) throw new NotFoundException('ChannelListing was not found');
      if (input.productVariantId) {
        if (!listing.masterProductId) {
          throw new BadRequestException(
            'Confirm the parent ChannelListing MasterProduct before matching options',
          );
        }
        const variant = await tx.productVariant.findFirst({
          where: {
            id: input.productVariantId,
            organizationId: input.organizationId,
            masterProductId: listing.masterProductId,
            isActive: true,
          },
          select: { id: true },
        });
        if (!variant) {
          throw new BadRequestException(
            'ProductVariant must be active and belong to the linked listing product',
          );
        }
      }
      const updated = await tx.channelListingOption.updateMany({
        where: { id: option.id, organizationId: input.organizationId },
        data: { productVariantId: input.productVariantId },
      });
      if (updated.count !== 1) {
        throw new NotFoundException('ChannelListingOption was not found');
      }
    }, TRANSACTION_OPTIONS);
  }

  async listAvailabilityRows(
    organizationId: string,
    query: {
      channelAccountId?: string;
      search?: string;
      optionIds?: string[];
      listingIds?: string[];
    },
  ): Promise<ChannelAvailabilityRepositoryRow[]> {
    const listings = await this.loadListings(organizationId, query, 'availability');
    return listings.flatMap((listing) => listing.options
      .filter((option) => !query.optionIds || query.optionIds.includes(option.id))
      .map((option) => ({
      channelAccount: listing.channelAccount,
      listing: {
        id: listing.id,
        externalId: listing.externalId,
        channelName: listing.channelName,
        displayName: listing.displayName,
        status: listing.status,
        masterProductId: listing.masterProductId,
      },
      option: {
        id: option.id,
        externalOptionId: option.externalOptionId,
        sellerSku: option.sellerSku,
        itemName: option.itemName,
        barcode: option.barcode,
        modelNumber: option.modelNumber,
        salePrice: option.salePrice,
        status: option.status,
        updatedAt: option.updatedAt,
      },
      variant: option.productVariant ? {
        id: option.productVariant.id,
        masterProductId: option.productVariant.masterProductId,
        code: option.productVariant.code,
        name: option.productVariant.name,
        components: option.productVariant.components.map((component) => ({
          sellpiaInventorySkuId: component.sellpiaInventorySkuId,
          code: component.sellpiaInventorySku.code,
          name: component.sellpiaInventorySku.name,
          optionName: component.sellpiaInventorySku.optionName,
          barcode: component.sellpiaInventorySku.barcode,
          currentStock: component.sellpiaInventorySku.currentStock,
          purchasePrice: component.sellpiaInventorySku.purchasePrice,
          isActive: component.sellpiaInventorySku.isActive,
          quantity: component.quantity,
          source: componentSource(component.source),
        })),
      } : null,
      })));
  }

  private loadListings(
    organizationId: string,
    query: {
      channelAccountId?: string;
      search?: string;
      listingIds?: string[];
      optionIds?: string[];
    },
    scope: 'matching' | 'availability',
  ): Promise<ListingRow[]> {
    const search = query.search?.trim();
    return this.prisma.channelListing.findMany({
      where: {
        ...(scope === 'matching'
          ? matchingListingWhere(organizationId)
          : availabilityListingWhere(organizationId)),
        ...(query.listingIds ? { id: { in: query.listingIds } } : {}),
        ...(query.optionIds ? {
          options: { some: { organizationId, id: { in: query.optionIds } } },
        } : {}),
        ...(query.channelAccountId ? { channelAccountId: query.channelAccountId } : {}),
        ...(search ? {
          OR: [
            { externalId: { contains: search, mode: 'insensitive' } },
            { displayName: { contains: search, mode: 'insensitive' } },
            { channelName: { contains: search, mode: 'insensitive' } },
            { options: { some: {
              organizationId,
              OR: [
                { externalOptionId: { contains: search, mode: 'insensitive' } },
                { sellerSku: { contains: search, mode: 'insensitive' } },
                { itemName: { contains: search, mode: 'insensitive' } },
              ],
            } } },
          ],
        } : {}),
      },
      include: listingInclude(organizationId),
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
  }
}

function completedCatalogRunWhere(
  organizationId: string,
): Prisma.SourceImportRunWhereInput {
  return {
    organizationId,
    status: 'completed',
    sourceType: { in: [...COMPLETED_CATALOG_SOURCE_TYPES] },
  };
}

function matchingListingWhere(
  organizationId: string,
): Prisma.ChannelListingWhereInput {
  return {
    organizationId,
    isActive: true,
    lastImportRun: { is: completedCatalogRunWhere(organizationId) },
  };
}

function availabilityListingWhere(
  organizationId: string,
): Prisma.ChannelListingWhereInput {
  return {
    organizationId,
    isActive: true,
    OR: [
      { sourceCandidateId: { not: null } },
      { lastImportRun: { is: completedCatalogRunWhere(organizationId) } },
    ],
  };
}

async function lockChannelListing(
  tx: Prisma.TransactionClient,
  organizationId: string,
  channelListingId: string,
): Promise<{ id: string; masterProductId: string | null } | null> {
  const [listing] = await tx.$queryRaw<Array<{
    id: string;
    masterProductId: string | null;
  }>>`
    SELECT id, master_product_id AS "masterProductId"
    FROM channel_listings
    WHERE id = ${channelListingId}::uuid
      AND organization_id = ${organizationId}::uuid
      AND is_active = TRUE
      AND last_import_run_id IN (
        SELECT id
        FROM source_import_runs
        WHERE organization_id = ${organizationId}::uuid
          AND status = 'completed'
          AND source_type IN ('coupang_wing_catalog', 'coupang_rocket_po_catalog')
      )
    FOR UPDATE
  `;
  return listing ?? null;
}

function toProductQueueRow(listing: ListingRow): ChannelProductMatchingQueueRow {
  return {
    channelAccount: listing.channelAccount,
    listing: {
      id: listing.id,
      externalId: listing.externalId,
      displayName: listing.displayName,
      status: listing.status,
      masterProductId: listing.masterProductId,
      updatedAt: listing.updatedAt,
    },
    linkedProduct: listing.masterProduct,
    optionCount: listing.options.length,
    linkedOptionCount: listing.options.filter(
      (option) => option.productVariantId !== null,
    ).length,
  };
}

function toOptionQueueRow(
  listing: ListingRow,
  option: OptionRow,
): ChannelOptionMatchingQueueRow {
  if (!option.productVariant) {
    return {
      channelAccount: listing.channelAccount,
      listing: {
        id: listing.id,
        externalId: listing.externalId,
        masterProductId: listing.masterProductId,
      },
      option: optionIdentity(option),
      linkedVariant: null,
      recipeStatus: 'unmatched',
      capacity: null,
    };
  }
  const projection = projectVariantCapacity(
    option.productVariant.components.map((component) => ({
      sellpiaInventorySkuId: component.sellpiaInventorySkuId,
      currentStock: component.sellpiaInventorySku.currentStock,
      quantity: component.quantity,
      isActive: component.sellpiaInventorySku.isActive,
    })),
  );
  const recipeStatus = projection.warningState === 'none'
    ? 'matched'
    : projection.warningState;
  return {
    channelAccount: listing.channelAccount,
    listing: {
      id: listing.id,
      externalId: listing.externalId,
      masterProductId: listing.masterProductId,
    },
    option: optionIdentity(option),
    linkedVariant: {
      id: option.productVariant.id,
      masterProductId: option.productVariant.masterProductId,
      code: option.productVariant.code,
      name: option.productVariant.name,
      optionLabel: option.productVariant.optionLabel,
    },
    recipeStatus,
    capacity: projection.capacity,
  };
}

function optionIdentity(option: OptionRow) {
  return {
    id: option.id,
    externalOptionId: option.externalOptionId,
    itemName: option.itemName,
    sellerSku: option.sellerSku,
    barcode: option.barcode,
    productVariantId: option.productVariantId,
    updatedAt: option.updatedAt,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function aiProductSuggestion(record: Record<string, unknown>) {
  const masterProductId = firstString(record, ['aiSuggestedMasterProductId']);
  const explanation = firstString(record, ['aiExplanation']);
  if (!masterProductId || !explanation) return null;
  return {
    masterProductId,
    explanation,
    score: nullableScore(record.aiScore),
  };
}

function aiVariantSuggestion(record: Record<string, unknown>) {
  const productVariantId = firstString(record, ['aiSuggestedProductVariantId']);
  const explanation = firstString(record, ['aiExplanation']);
  if (!productVariantId || !explanation) return null;
  return {
    productVariantId,
    explanation,
    score: nullableScore(record.aiScore),
  };
}

function nullableScore(value: unknown): number | null {
  return typeof value === 'number' && value >= 0 && value <= 1 ? value : null;
}

function distinctStrings(values: readonly (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function componentSource(value: string): 'manual' | 'deterministic' {
  return value === 'deterministic' ? 'deterministic' : 'manual';
}
