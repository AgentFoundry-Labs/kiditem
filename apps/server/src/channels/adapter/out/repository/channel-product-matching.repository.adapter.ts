import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { projectChannelOptionCapacity } from '../../../../products/domain/channel-option-capacity';
import { inferRecipeQuantity } from '../../../domain/channel-recipe-suggestion';
import { lockChannelListingRow } from './channel-listing-row-lock';
import { resolveChannelListingSaleStatus } from '@kiditem/shared/channel-listing';
import type {
  ChannelOptionMatchingQueueRow,
  ChannelProductMatchingQueueRow,
  ChannelProductMatchingRepositoryPort,
  ChannelAvailabilityRepositoryRow,
} from '../../../application/port/out/repository/channel-product-matching.repository.port';

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;
const COMPLETED_CATALOG_SOURCE_TYPES = [
  'coupang_wing_catalog',
  'coupang_rocket_catalog_seed',
  'coupang_rocket_po_catalog',
  'coupang_rocket_matching_csv',
] as const;

function listingInclude(organizationId: string) {
  return {
    channelAccount: {
      select: { id: true, channel: true, name: true },
    },
    channelListingDailySnapshots: {
      where: { organizationId },
      orderBy: [
        { businessDate: 'desc' as const },
        { lastObservedAt: 'desc' as const },
      ],
      take: 1,
      select: { saleStatus: true },
    },
    masterProduct: {
      select: { id: true, code: true, name: true, imageUrls: true },
    },
    options: {
      orderBy: [{ updatedAt: 'desc' as const }, { id: 'asc' as const }],
      include: {
        inventoryComponents: {
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
  };
}

type ListingRow = Prisma.ChannelListingGetPayload<{
  include: ReturnType<typeof listingInclude>;
}>;
type OptionRow = ListingRow['options'][number];
type ActiveSellpiaSku = {
  id: string;
  code: string;
  barcode: string | null;
  masterProductId: string | null;
};

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
        channelListings: {
          where: { organizationId, isActive: true },
          select: {
            options: {
              where: { organizationId, isActive: true },
              select: {
                inventoryComponents: {
                  where: { organizationId },
                  select: {
                    sellpiaInventorySku: { select: { barcode: true } },
                  },
                },
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
        barcodes: distinctStrings(candidate.channelListings.flatMap((listing) =>
          listing.options.flatMap((option) => option.inventoryComponents.map(
            (component) => component.sellpiaInventorySku.barcode,
          )))),
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
      if (input.masterProductId === null) {
        await tx.channelListingOptionInventoryComponent.deleteMany({
          where: {
            organizationId: input.organizationId,
            channelListingOption: { listingId: listing.id },
          },
        });
      } else {
        const resolvedMasterProductId = await resolveListingMasterProductId(
          tx,
          input.organizationId,
          listing.id,
        );
        if (resolvedMasterProductId !== input.masterProductId) {
          throw new BadRequestException(
            'MasterProduct link is derived from complete option inventory recipes',
          );
        }
      }
      const updated = await tx.channelListing.updateMany({
        where: { id: listing.id, organizationId: input.organizationId },
        data: { masterProductId: input.masterProductId },
      });
      if (updated.count !== 1) throw new NotFoundException('ChannelListing was not found');
    }, TRANSACTION_OPTIONS);
  }

  async autoMatch(input: {
    organizationId: string;
    channelAccountId?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const [listings, aliases] = await Promise.all([
        tx.channelListing.findMany({
          where: {
            organizationId: input.organizationId,
            ...(input.channelAccountId ? { channelAccountId: input.channelAccountId } : {}),
          },
          select: {
            id: true,
            displayName: true,
            channelName: true,
            rawJson: true,
            masterProductId: true,
            options: {
              where: { organizationId: input.organizationId },
              select: {
                id: true,
                itemName: true,
                sellerSku: true,
                modelNumber: true,
                barcode: true,
                inventoryComponents: {
                  select: {
                    id: true,
                    sellpiaInventorySkuId: true,
                    quantity: true,
                  },
                },
              },
            },
          },
        }),
        tx.sellpiaManualMatchAlias.findMany({
          where: { organizationId: input.organizationId },
          select: {
            normalizedAlias: true,
            sellpiaInventorySkuId: true,
            itemCount: true,
            sellpiaInventorySku: {
              select: { masterProductId: true, isActive: true },
            },
          },
        }),
      ]);
      const aliasesByName = new Map<string, typeof aliases>();
      for (const alias of aliases) {
        const rows = aliasesByName.get(alias.normalizedAlias) ?? [];
        rows.push(alias);
        aliasesByName.set(alias.normalizedAlias, rows);
      }
      const activeSkus: ActiveSellpiaSku[] = await tx.sellpiaInventorySku.findMany({
        where: { organizationId: input.organizationId, isActive: true },
        select: { id: true, code: true, barcode: true, masterProductId: true },
      });
      const activeSkusByBarcode = new Map<string, ActiveSellpiaSku[]>();
      for (const sku of activeSkus) {
        const barcode = normalizePhysicalBarcode(sku.barcode);
        if (!barcode) continue;
        const rows = activeSkusByBarcode.get(barcode) ?? [];
        rows.push(sku);
        activeSkusByBarcode.set(barcode, rows);
      }
      const activeSkusByCode = new Map<string, ActiveSellpiaSku[]>();
      for (const sku of activeSkus) {
        const code = sku.code.trim();
        if (!code) continue;
        const rows = activeSkusByCode.get(code) ?? [];
        rows.push(sku);
        activeSkusByCode.set(code, rows);
      }
      let matchedListings = 0;
      let configuredOptions = 0;
      for (const listing of listings) {
        const listingNames = listingAliasTitles(listing);
        const csvTargetSku = uniqueRocketCsvTargetSku(listing, activeSkusByBarcode);

        for (const option of listing.options) {
          const existingComponent = option.inventoryComponents.length === 1
            ? option.inventoryComponents[0]!
            : null;
          const providerIdentifierSku = uniqueProviderIdentifierSku(
            option,
            activeSkusByCode,
            activeSkusByBarcode,
          );
          const exactAliases = exactAliasesForOption(
            aliasesByName,
            listingNames,
            option.itemName,
          );
          const recipes = new Map(exactAliases.map((alias) => [
            `${alias.sellpiaInventorySkuId}:${alias.itemCount}`,
            alias,
          ]));
          const aliasSkuIds = new Set(exactAliases.map((alias) =>
            alias.sellpiaInventorySkuId));
          if (csvTargetSku) aliasSkuIds.add(csvTargetSku.id);
          if (providerIdentifierSku) aliasSkuIds.add(providerIdentifierSku.id);
          if (aliasSkuIds.size !== 1) {
            const quantity = inferRecipeQuantity([
              listing.channelName,
              listing.displayName,
              option.itemName,
            ]);
            if (
              !existingComponent
              || quantity === null
              || existingComponent.quantity === quantity
            ) continue;
            const updated = await tx.channelListingOptionInventoryComponent.updateMany({
              where: { id: existingComponent.id, organizationId: input.organizationId },
              data: { quantity },
            });
            if (updated.count !== 1) {
              throw new NotFoundException('ChannelListingOptionInventoryComponent was not found');
            }
            configuredOptions += 1;
            continue;
          }
          const aliasRecipe = recipes.size === 1 ? [...recipes.values()][0]! : null;
          if (recipes.size > 1) continue;
          if (
            aliasRecipe
            && (
              !aliasRecipe.sellpiaInventorySku.isActive
              || !aliasRecipe.sellpiaInventorySku.masterProductId
            )
          ) continue;
          const sellpiaInventorySkuId = csvTargetSku?.id
            ?? providerIdentifierSku?.id
            ?? aliasRecipe?.sellpiaInventorySkuId;
          if (!sellpiaInventorySkuId) continue;
          const quantity = aliasRecipe?.itemCount ?? inferRecipeQuantity([
            listing.channelName,
            listing.displayName,
            option.itemName,
          ]);
          if (quantity === null) continue;
          const masterProductId = csvTargetSku?.masterProductId
            ?? providerIdentifierSku?.masterProductId
            ?? aliasRecipe?.sellpiaInventorySku.masterProductId
            ?? null;
          if (!masterProductId) continue;
          if (option.inventoryComponents.length === 0) {
            await tx.channelListingOptionInventoryComponent.create({
              data: {
                organizationId: input.organizationId,
                channelListingOptionId: option.id,
                sellpiaInventorySkuId,
                quantity,
              },
            });
            configuredOptions += 1;
            continue;
          }
          if (
            !existingComponent
            || existingComponent.sellpiaInventorySkuId !== sellpiaInventorySkuId
            || existingComponent.quantity === quantity
          ) continue;
          const updated = await tx.channelListingOptionInventoryComponent.updateMany({
            where: { id: existingComponent.id, organizationId: input.organizationId },
            data: { quantity },
          });
          if (updated.count !== 1) {
            throw new NotFoundException('ChannelListingOptionInventoryComponent was not found');
          }
          configuredOptions += 1;
        }
        const resolvedMasterProductId = await resolveListingMasterProductId(
          tx,
          input.organizationId,
          listing.id,
        );
        await tx.channelListing.updateMany({
          where: { id: listing.id, organizationId: input.organizationId },
          data: { masterProductId: resolvedMasterProductId },
        });
        if (listing.masterProductId === null && resolvedMasterProductId !== null) {
          matchedListings += 1;
        }
      }
      return {
        evaluatedListings: listings.length,
        matchedListings,
        configuredOptions,
      };
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
      inventoryComponents: option.inventoryComponents.map((component) => ({
          sellpiaInventorySkuId: component.sellpiaInventorySkuId,
          code: component.sellpiaInventorySku.code,
          name: component.sellpiaInventorySku.name,
          optionName: component.sellpiaInventorySku.optionName,
          barcode: component.sellpiaInventorySku.barcode,
          currentStock: component.sellpiaInventorySku.currentStock,
          purchasePrice: component.sellpiaInventorySku.purchasePrice,
          isActive: component.sellpiaInventorySku.isActive,
          quantity: component.quantity,
        })),
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
  return { organizationId };
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

async function resolveListingMasterProductId(
  tx: Prisma.TransactionClient,
  organizationId: string,
  channelListingId: string,
): Promise<string | null> {
  const listing = await tx.channelListing.findFirst({
    where: { id: channelListingId, organizationId },
    select: {
      options: {
        where: { organizationId },
        select: {
          inventoryComponents: {
            where: { organizationId },
            select: {
              sellpiaInventorySku: { select: { masterProductId: true } },
            },
          },
        },
      },
    },
  });
  if (!listing || listing.options.length === 0) return null;
  const ownerIds = new Set<string>();
  for (const option of listing.options) {
    if (option.inventoryComponents.length === 0) return null;
    for (const component of option.inventoryComponents) {
      const ownerId = component.sellpiaInventorySku.masterProductId;
      if (!ownerId) return null;
      ownerIds.add(ownerId);
    }
  }
  return ownerIds.size === 1 ? [...ownerIds][0]! : null;
}

async function lockChannelListing(
  tx: Prisma.TransactionClient,
  organizationId: string,
  channelListingId: string,
): Promise<{ id: string; masterProductId: string | null } | null> {
  return lockChannelListingRow(tx, {
    organizationId,
    channelListingId,
    activeOnly: true,
    catalogMatchingEligibleOnly: false,
  });
}

function toProductQueueRow(listing: ListingRow): ChannelProductMatchingQueueRow {
  return {
    channelAccount: listing.channelAccount,
    listing: {
      id: listing.id,
      externalId: listing.externalId,
      displayName: listing.displayName,
      status: listing.status,
      saleStatus: saleStatusFromListing(listing),
      masterProductId: listing.masterProductId,
      channelImageUrl: null,
      updatedAt: listing.updatedAt,
    },
    linkedProduct: listing.masterProduct ? {
      id: listing.masterProduct.id,
      code: listing.masterProduct.code,
      name: listing.masterProduct.name,
      displayImageUrl: listing.masterProduct.imageUrls[0] ?? null,
    } : null,
    optionCount: listing.options.length,
    configuredOptionCount: listing.options.filter(
      (option) => option.inventoryComponents.length > 0,
    ).length,
  };
}

function toOptionQueueRow(
  listing: ListingRow,
  option: OptionRow,
): ChannelOptionMatchingQueueRow {
  const projection = projectChannelOptionCapacity(
    option.inventoryComponents.map((component) => ({
      sellpiaInventorySkuId: component.sellpiaInventorySkuId,
      currentStock: component.sellpiaInventorySku.currentStock,
      activeCommitmentQuantity: 0,
      availableStock: component.sellpiaInventorySku.currentStock,
      quantity: component.quantity,
      isActive: component.sellpiaInventorySku.isActive,
    })),
  );
  return {
    channelAccount: listing.channelAccount,
    listing: {
      id: listing.id,
      externalId: listing.externalId,
      masterProductId: listing.masterProductId,
    },
    option: optionIdentity(option),
    capacity: projection.warningState === 'none'
      ? projection.capacity
      : null,
  };
}

function optionIdentity(option: OptionRow) {
  return {
    id: option.id,
    externalOptionId: option.externalOptionId,
    itemName: option.itemName,
    sellerSku: option.sellerSku,
    barcode: option.barcode,
    updatedAt: option.updatedAt,
    inventoryComponents: option.inventoryComponents.map((component) => ({
      id: component.id,
      sellpiaInventorySkuId: component.sellpiaInventorySkuId,
      code: component.sellpiaInventorySku.code,
      name: component.sellpiaInventorySku.name,
      optionName: component.sellpiaInventorySku.optionName,
      barcode: component.sellpiaInventorySku.barcode,
      currentStock: component.sellpiaInventorySku.currentStock,
      availableStock: component.sellpiaInventorySku.currentStock,
      isActive: component.sellpiaInventorySku.isActive,
      quantity: component.quantity,
    })),
  };
}

function saleStatusFromListing(listing: ListingRow): string | null {
  const raw = asRecord(listing.rawJson);
  return resolveChannelListingSaleStatus({
    latestSnapshotStatus: listing.channelListingDailySnapshots?.[0]?.saleStatus,
    rawStatus: firstString(raw, [
      'saleStatus',
      'salesStatus',
      'sale_status',
      '판매상태',
    ]),
    optionStatuses: listing.options.map((option) => option.status),
    listingStatus: listing.status,
    isActive: listing.isActive,
  });
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

function nullableScore(value: unknown): number | null {
  return typeof value === 'number' && value >= 0 && value <= 1 ? value : null;
}

function distinctStrings(values: readonly (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function normalizeExactName(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function exactAliasesForOption<T>(
  aliasesByName: ReadonlyMap<string, readonly T[]>,
  listingNames: readonly string[],
  optionName: string | null,
): T[] {
  const names = listingNames.flatMap((listingName) => [
    listingName,
    `${listingName} ${optionName ?? ''}`,
  ]);
  if (names.length === 0 && optionName) names.push(optionName);
  const normalizedNames = names.map(normalizeExactName).filter(Boolean);
  return [...new Set(normalizedNames)].flatMap((name) => [...(aliasesByName.get(name) ?? [])]);
}

function listingAliasTitles(listing: {
  channelName: string | null;
  displayName: string | null;
}): string[] {
  return [...new Set([listing.channelName, listing.displayName]
    .map((value) => value?.trim() ?? '')
    .filter(Boolean))];
}

function uniqueRocketCsvTargetSku(
  listing: Pick<ListingRow, 'rawJson'>,
  activeSkusByBarcode: ReadonlyMap<string, readonly ActiveSellpiaSku[]>,
): ActiveSellpiaSku | null {
  const raw = asRecord(listing.rawJson);
  if (raw.source !== 'coupang_rocket_matching_csv' || !isConfirmedRocketCsvMatch(raw)) {
    return null;
  }
  const barcode = normalizePhysicalBarcode(firstString(raw, ['sellpiaBarcode']));
  if (!barcode) return null;
  const matches = activeSkusByBarcode.get(barcode) ?? [];
  return matches.length === 1 ? matches[0]! : null;
}

function uniqueProviderIdentifierSku(
  option: {
    sellerSku: string | null;
    modelNumber: string | null;
    barcode: string | null;
  },
  activeSkusByCode: ReadonlyMap<string, readonly ActiveSellpiaSku[]>,
  activeSkusByBarcode: ReadonlyMap<string, readonly ActiveSellpiaSku[]>,
): ActiveSellpiaSku | null {
  const matches = [option.sellerSku, option.modelNumber]
    .map((code) => code?.trim() ?? '')
    .filter(Boolean)
    .flatMap((code) => activeSkusByCode.get(code) ?? []);
  const barcode = normalizePhysicalBarcode(option.barcode);
  if (barcode) matches.push(...(activeSkusByBarcode.get(barcode) ?? []));
  const distinct = [...new Map(matches.map((sku) => [sku.id, sku])).values()];
  return distinct.length === 1 ? distinct[0]! : null;
}

function isConfirmedRocketCsvMatch(raw: Record<string, unknown>): boolean {
  const matchMethod = firstString(raw, ['matchMethod']);
  const confidence = firstString(raw, ['confidence']);
  const matchStatus = firstString(raw, ['matchStatus']);
  return matchMethod === '바코드확정'
    || confidence === 'high'
    || confidence === '확정'
    || matchStatus === '확정';
}

function normalizePhysicalBarcode(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/[^0-9]/g, '');
  return /^\d{8,14}$/.test(normalized) ? normalized : null;
}
