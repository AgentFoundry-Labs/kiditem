import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { resolveChannelListingSaleStatus } from '@kiditem/shared/channel-listing';
import { PrismaService } from '../../../../prisma/prisma.service';
import { completedCatalogRunWhere } from './completed-catalog-run';
import { readLatestListingSaleStatusFacts } from '../../../read/channel-listing-daily-facts';
import {
  readActiveInventoryMatchingCandidates,
  readInventorySkuIdentities,
} from '../../../../inventory/read/inventory-availability';
import { classifyChannelRecipeSuggestion } from '../../../domain/channel-recipe-suggestion';
import {
  rankChannelRecipeNameCandidates,
  scoreChannelRecipeNameCandidateIfComparable,
  type ChannelRecipeNameOption,
} from '../../../domain/channel-recipe-name-matcher';
import {
  PRODUCT_CHANNEL_OPTION_RECIPE_MUTATION_PORT,
  type ProductChannelOptionRecipeMutationPort,
} from '../../../../products/application/port/in/product-channel-option-recipe-mutation.port';
import type {
  ChannelOptionMatchingRepositoryRow,
  ChannelProductMatchingQueueRow,
  ChannelProductMatchingRepositoryPort,
  ChannelAvailabilityRepositoryRow,
} from '../../../application/port/out/repository/channel-product-matching.repository.port';

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;
const READ_TRANSACTION_OPTIONS = {
  ...TRANSACTION_OPTIONS,
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
} as const;
const PUBLISHED_STAGED_CATALOG_IDENTITY_SOURCES = [
  'coupang_catalog_basics',
  'coupang_catalog_details',
] as const;

function listingSelect(organizationId: string) {
  return {
    id: true,
    externalId: true,
    displayName: true,
    status: true,
    rawJson: true,
    channelName: true,
    masterProductId: true,
    updatedAt: true,
    isActive: true,
    channelAccount: {
      select: { id: true, channel: true, name: true },
    },
    masterProduct: {
      select: { id: true, code: true, name: true, imageUrls: true },
    },
    options: {
      orderBy: [{ updatedAt: 'desc' as const }, { id: 'asc' as const }],
      select: {
        id: true,
        externalOptionId: true,
        itemName: true,
        sellerSku: true,
        barcode: true,
        modelNumber: true,
        salePrice: true,
        status: true,
        updatedAt: true,
        inventoryComponents: {
          where: { organizationId },
          orderBy: { createdAt: 'asc' as const },
          select: {
            id: true,
            sellpiaInventorySkuId: true,
            quantity: true,
          },
          },
        },
      },
  };
}

type RawListingRow = Prisma.ChannelListingGetPayload<{
  select: ReturnType<typeof listingSelect>;
}>;
type RawOptionRow = RawListingRow['options'][number];
type RawComponentRow = RawOptionRow['inventoryComponents'][number];
type InventorySkuReadModel = Awaited<
  ReturnType<typeof readInventorySkuIdentities>
>[number];
type InventorySkuIdentity = Omit<
  InventorySkuReadModel,
  'sellpiaInventorySkuId'
> & { id: string };
type ListingRow = Omit<RawListingRow, 'options'> & {
  options: Array<Omit<RawOptionRow, 'inventoryComponents'> & {
    inventoryComponents: Array<RawComponentRow & {
      sellpiaInventorySku: InventorySkuIdentity;
    }>;
  }>;
};
type ListingWithSaleStatus = ListingRow & {
  latestSnapshotSaleStatus: string | null;
};
type OptionRow = ListingRow['options'][number];
type ActiveSellpiaSku = {
  id: string;
  code: string;
  name: string;
  optionName: string | null;
  barcode: string | null;
  masterProductId: string | null;
  currentStock: number | null;
};

@Injectable()
export class ChannelProductMatchingRepositoryAdapter
implements ChannelProductMatchingRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_CHANNEL_OPTION_RECIPE_MUTATION_PORT)
    private readonly recipeMutations?: ProductChannelOptionRecipeMutationPort,
  ) {}

  async listQueue(
    organizationId: string,
    query: { channelAccountId?: string; search?: string },
  ) {
    const listings = await this.prisma.$transaction(async (tx) => {
      const listingRows = await this.loadListings(tx, organizationId, query, 'matching');
      const statusFacts = await readLatestListingSaleStatusFacts(tx, {
        organizationId,
        listingIds: listingRows.map((listing) => listing.id),
      });
      const latestStatus = new Map(statusFacts.map((fact) => [
        fact.listingId,
        fact.saleStatus,
      ]));
      return listingRows.map((listing): ListingWithSaleStatus => ({
        ...listing,
        latestSnapshotSaleStatus: latestStatus.get(listing.id) ?? null,
      }));
    }, READ_TRANSACTION_OPTIONS);
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
                  select: { sellpiaInventorySkuId: true },
                },
              },
            },
          },
        },
      },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    });
    const inventorySkuIds = [
      ...new Set(candidates.flatMap((candidate) =>
        candidate.channelListings.flatMap((channelListing) =>
          channelListing.options.flatMap((option) =>
            option.inventoryComponents.map((component) =>
              component.sellpiaInventorySkuId))))),
    ];
    const identities = await readInventorySkuIdentities(this.prisma, {
      organizationId,
      selector: { kind: 'ids', values: inventorySkuIds },
    });
    const barcodeBySkuId = new Map(identities.map((identity) => [
      identity.sellpiaInventorySkuId,
      identity.barcode,
    ]));
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
            (component) => barcodeBySkuId.get(component.sellpiaInventorySkuId),
          ))).filter((value): value is string | null => value !== undefined)),
      })),
    };
  }

  async linkProduct(input: {
    organizationId: string;
    channelListingId: string;
    masterProductId: string | null;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (!this.recipeMutations) {
        throw new Error('Products recipe mutation owner is unavailable');
      }
      if (input.masterProductId === null) {
        await this.recipeMutations.clearListingRecipesInTransaction(tx, {
          organizationId: input.organizationId,
          channelListingId: input.channelListingId,
        });
      } else {
        const summary = await this.recipeMutations.synchronizeListingSummaryInTransaction(
          tx,
          {
            organizationId: input.organizationId,
            channelListingId: input.channelListingId,
          },
        );
        if (summary.masterProductId !== input.masterProductId) {
          throw new BadRequestException(
            'MasterProduct link is derived from complete option inventory recipes',
          );
        }
      }
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
                    sellpiaInventorySkuId: true,
                    quantity: true,
                    createdAt: true,
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
          },
        }),
      ]);
      const aliasesByName = new Map<string, typeof aliases>();
      for (const alias of aliases) {
        const rows = aliasesByName.get(alias.normalizedAlias) ?? [];
        rows.push(alias);
        aliasesByName.set(alias.normalizedAlias, rows);
      }
      const activeSkus: ActiveSellpiaSku[] =
        await readActiveInventoryMatchingCandidates(tx, input.organizationId);
      const referencedSkuIds = [...new Set([
        ...listings.flatMap((listing) => listing.options.flatMap((option) =>
          option.inventoryComponents.map((component) =>
            component.sellpiaInventorySkuId))),
        ...aliases.map((alias) => alias.sellpiaInventorySkuId),
      ])];
      const referencedIdentities = await readInventorySkuIdentities(tx, {
        organizationId: input.organizationId,
        selector: { kind: 'ids', values: referencedSkuIds },
      });
      const identityById = new Map([
        ...activeSkus.map((sku) => ({
          sellpiaInventorySkuId: sku.id,
          code: sku.code,
          name: sku.name,
          optionName: sku.optionName,
          barcode: sku.barcode,
          purchasePrice: null,
          salePrice: null,
          isActive: true,
          masterProductId: sku.masterProductId,
        })),
        ...referencedIdentities,
      ].map((identity) => [identity.sellpiaInventorySkuId, identity]));
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
      const activeSkuById = new Map(activeSkus.map((sku) => [sku.id, sku]));
      const mutations: Array<{
        channelListingOptionId: string;
        expectedMasterProductId?: string;
        components: Array<{ sellpiaInventorySkuId: string; quantity: number }>;
      }> = [];
      for (const listing of listings) {
        const listingNames = listingAliasTitles(listing);
        for (const option of listing.options) {
          const nameOptions = optionNameOptions(listing, option);
          const suggestionSkus = activeSkus.map(toSuggestionSku);
          const codeEvidence = ([
            ['seller_sku_code', option.sellerSku],
            ['model_number_code', option.modelNumber],
          ] as const).flatMap(([kind, value]) => {
            const channelValue = value?.trim();
            if (!channelValue) return [];
            return (activeSkusByCode.get(channelValue) ?? []).map((sku) => ({
              kind,
              channelValue,
              nameCompatibilityScore: scoreChannelRecipeNameCandidateIfComparable(
                nameOptions,
                toSuggestionSku(sku),
              ),
              sku: toSuggestionSku(sku),
            }));
          });
          const barcodes = distinctStrings([
            option.barcode,
            confirmedRocketCsvBarcode(listing.rawJson),
          ].map(normalizePhysicalBarcode));
          const barcodeEvidence = barcodes.flatMap((barcode) =>
            (activeSkusByBarcode.get(barcode) ?? []).map((sku) => ({
              kind: 'unique_physical_barcode' as const,
              channelValue: barcode,
              normalizedValue: barcode,
              nameCompatibilityScore: scoreChannelRecipeNameCandidateIfComparable(
                nameOptions,
                toSuggestionSku(sku),
              ),
              sku: toSuggestionSku(sku),
            })));
          const exactAliases = exactAliasesForOption(
            aliasesByName,
            listingNames,
            option.itemName,
          );
          const manualMatchEvidence = exactAliases.flatMap((alias) => {
            const sku = activeSkuById.get(alias.sellpiaInventorySkuId);
            return sku ? [{
              channelValue: alias.normalizedAlias,
              normalizedValue: alias.normalizedAlias,
              quantity: alias.itemCount,
              sku: toSuggestionSku(sku),
            }] : [];
          });
          const options = nameOptions.map(({ listingName, itemName }) => ({
            channelListingOptionId: option.id,
            listingName,
            itemName,
            sellerSku: option.sellerSku,
            modelNumber: option.modelNumber,
            barcode: option.barcode,
          }));
          const suggestion = classifyChannelRecipeSuggestion({
            channelListingOptionId: option.id,
            masterProductId: listing.masterProductId,
            options,
            existingComponents: option.inventoryComponents.map((component) => ({
              sellpiaInventorySkuId: component.sellpiaInventorySkuId,
              code: identityById.get(component.sellpiaInventorySkuId)?.code ?? '',
              quantity: component.quantity,
              source: 'manual' as const,
              confirmedBy: null,
              confirmedAt: component.createdAt,
            })),
            codeEvidence,
            barcodeEvidence,
            nameOptionEvidence: [],
            nameEvidence: [],
            similarityEvidence: rankChannelRecipeNameCandidates(nameOptions, suggestionSkus),
            manualMatchEvidence,
          });
          const proposal = suggestion.automationDecision === 'auto_apply'
            && suggestion.proposals.length === 1
            ? suggestion.proposals[0]
            : null;
          const quantity = proposal?.recommendedQuantity ?? suggestion.recommendedQuantity;
          const targetSku = proposal
            ? activeSkuById.get(proposal.sellpiaInventorySkuId)
            : null;
          if (!proposal || !targetSku?.masterProductId
            || !Number.isSafeInteger(quantity) || (quantity ?? 0) <= 0) continue;
          mutations.push({
            channelListingOptionId: option.id,
            expectedMasterProductId: targetSku.masterProductId,
            components: [{
              sellpiaInventorySkuId: proposal.sellpiaInventorySkuId,
              quantity: quantity!,
            }],
          });
        }
      }
      if (mutations.length > 0 && !this.recipeMutations) {
        throw new Error('Products recipe mutation capability is not configured');
      }
      const result = mutations.length > 0
        ? await this.recipeMutations!.applyPreservingRecipesInTransaction(tx, {
          organizationId: input.organizationId,
          mutations,
        })
        : {
          changedOptionCount: 0,
          matchedListingCount: 0,
        };
      return {
        evaluatedListings: listings.length,
        matchedListings: result.matchedListingCount,
        configuredOptions: result.changedOptionCount,
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
    const listings = await this.prisma.$transaction(
      (tx) => this.loadListings(tx, organizationId, query, 'availability'),
      READ_TRANSACTION_OPTIONS,
    );
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
          purchasePrice: component.sellpiaInventorySku.purchasePrice,
          quantity: component.quantity,
        })),
      })));
  }

  private async loadListings(
    prisma: Prisma.TransactionClient,
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
    const listings: RawListingRow[] = await prisma.channelListing.findMany({
      where: {
        ...(scope === 'matching'
          ? matchingListingWhere(organizationId)
          : availabilityListingWhere(organizationId, query.channelAccountId)),
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
      select: listingSelect(organizationId),
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    const inventorySkuIds = [...new Set(listings.flatMap((listing) =>
      listing.options.flatMap((option) => option.inventoryComponents.map(
        (component) => component.sellpiaInventorySkuId,
      ))))];
    const identities = await readInventorySkuIdentities(prisma, {
      organizationId,
      selector: { kind: 'ids', values: inventorySkuIds },
    });
    const identityById = new Map(identities.map((identity) => [
      identity.sellpiaInventorySkuId,
      toInventorySkuIdentity(identity),
    ]));
    return listings.map((listing) => ({
      ...listing,
      options: listing.options.map((option) => ({
        ...option,
        inventoryComponents: option.inventoryComponents.map((component) => {
          const embedded = (component as RawComponentRow & {
            sellpiaInventorySku?: InventorySkuIdentity;
          }).sellpiaInventorySku;
          const identity = identityById.get(component.sellpiaInventorySkuId)
            ?? embedded;
          if (!identity) {
            throw new NotFoundException(
              'A channel recipe references an inventory SKU outside this organization',
            );
          }
          return { ...component, sellpiaInventorySku: identity };
        }),
      })),
    }));
  }
}

function toInventorySkuIdentity(
  identity: InventorySkuReadModel,
): InventorySkuIdentity {
  const { sellpiaInventorySkuId: id, ...fields } = identity;
  return { id, ...fields };
}

function matchingListingWhere(
  organizationId: string,
): Prisma.ChannelListingWhereInput {
  return { organizationId };
}

function availabilityListingWhere(
  organizationId: string,
  channelAccountId?: string,
): Prisma.ChannelListingWhereInput {
  return {
    organizationId,
    isActive: true,
    OR: [
      { sourceCandidateId: { not: null } },
      { lastImportRun: { is: completedCatalogRunWhere(organizationId, channelAccountId) } },
      {
        options: {
          some: {
            organizationId,
            isActive: true,
            OR: PUBLISHED_STAGED_CATALOG_IDENTITY_SOURCES.map((source) => ({
              rawJson: { path: ['source'], equals: source },
            })),
          },
        },
      },
    ],
  };
}

function toProductQueueRow(listing: ListingWithSaleStatus): ChannelProductMatchingQueueRow {
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
): ChannelOptionMatchingRepositoryRow {
  return {
    channelAccount: listing.channelAccount,
    listing: {
      id: listing.id,
      externalId: listing.externalId,
      masterProductId: listing.masterProductId,
    },
    option: optionRecipeIdentity(option),
  };
}

function optionRecipeIdentity(option: OptionRow) {
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
      quantity: component.quantity,
    })),
  };
}

function saleStatusFromListing(listing: ListingWithSaleStatus): string | null {
  const raw = asRecord(listing.rawJson);
  return resolveChannelListingSaleStatus({
    latestSnapshotStatus: listing.latestSnapshotSaleStatus,
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

function confirmedRocketCsvBarcode(rawValue: unknown): string | null {
  const raw = asRecord(rawValue);
  if (raw.source !== 'coupang_rocket_matching_csv' || !isConfirmedRocketCsvMatch(raw)) {
    return null;
  }
  return firstString(raw, ['sellpiaBarcode']);
}

function toSuggestionSku(sku: ActiveSellpiaSku) {
  return {
    sellpiaInventorySkuId: sku.id,
    code: sku.code,
    name: sku.name,
    optionName: sku.optionName,
    currentStock: sku.currentStock,
  };
}

function listingNameOptions(listing: {
  channelName: string | null;
  displayName: string | null;
  options: ReadonlyArray<{ itemName: string | null }>;
}): ChannelRecipeNameOption[] {
  return listing.options.flatMap((option) => optionNameOptions(listing, option));
}

function optionNameOptions(
  listing: { channelName: string | null; displayName: string | null },
  option: { itemName: string | null },
): ChannelRecipeNameOption[] {
  const names = listingAliasTitles(listing);
  return (names.length > 0 ? names : [null]).map((listingName) => ({
    listingName,
    itemName: option.itemName,
  }));
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
