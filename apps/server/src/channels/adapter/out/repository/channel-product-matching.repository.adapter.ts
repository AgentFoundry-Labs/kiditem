import { readUnresolvedCompositionOptionIds } from "./registration-execution-ledger.reader";
import { Inject, Injectable } from '@nestjs/common';
import { KiditemError, KiditemInvalidValueError, KiditemNotFoundError } from '@kiditem/shared/errors';
import { Prisma } from '@prisma/client';
import { resolveChannelListingSaleStatus } from '@kiditem/shared/channel-listing';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { lockProductMapping } from '../../../../products/transaction/product-mapping-lock';
import {
  readCompletedCatalogRunIds,
  publishedCatalogOptionWhere,
  publishedCatalogListingBranches,
} from './completed-catalog-run';
import { readLatestListingSaleStatusFacts } from '../persistence/channel-listing-daily-facts';
import { readListingProductIds } from '../persistence/listing-product-summary.reader';
import {
  PRODUCT_TRANSACTIONAL_READ_PORT,
  type ProductMatchingCandidate,
  type ProductTransactionalReadPort,
} from '../../../../products/application/port/in/product-transactional-read.port';
import {
  PRODUCT_SOURCE_READ_PORT,
  type ProductSourceReadModel,
  type ProductSourceReadPort,
} from '../../../../products/application/port/in/product-source-read.port';
import { classifyChannelRecipeSuggestion } from '../../../domain/listing/channel-recipe-suggestion';
import { withListingProductSummary } from '../../../domain/listing/listing-product-summary';
import {
  rankChannelRecipeNameCandidates,
  scoreChannelRecipeNameCandidateIfComparable,
  type ChannelRecipeNameOption,
} from '../../../domain/listing/channel-recipe-name-matcher';
import {
  CHANNEL_OPTION_RECIPE_PORT,
  type ChannelOptionRecipePort,
} from '../../../application/port/in/channel-option-recipe.port';
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

/**
 * Loading a listing with all options and recipe components in one query can exceed PostgreSQL's
 * parameter limit. Read the ordered ids first, then hydrate them in bounded batches.
 */
const LISTING_LOAD_BATCH = 2_000;

async function loadByIdBatches<T extends { id: string }>(
  ids: readonly string[],
  load: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> {
  const byId = new Map<string, T>();
  for (let start = 0; start < ids.length; start += LISTING_LOAD_BATCH) {
    for (const row of await load(ids.slice(start, start + LISTING_LOAD_BATCH))) {
      byId.set(row.id, row);
    }
  }
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

function listingSelect(organizationId: string) {
  return {
    id: true,
    externalId: true,
    displayName: true,
    status: true,
    rawJson: true,
    channelName: true,
    updatedAt: true,
    isActive: true,
    channelAccount: {
      select: { id: true, channel: true, name: true },
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
        safetyStock: true,
        status: true,
        updatedAt: true,
        inventoryComponents: {
          where: { organizationId },
          orderBy: { createdAt: 'asc' as const },
          select: {
            id: true,
            masterProductId: true,
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
type InventorySkuIdentity = ProductSourceReadModel;
type ListingRow = Omit<RawListingRow, 'options'> & {
  masterProductId: string | null;
  linkedProduct: ProductSourceReadModel | null;
  options: Array<Omit<RawOptionRow, 'inventoryComponents'> & {
    inventoryComponents: Array<RawComponentRow & {
      product: InventorySkuIdentity | null;
    }>;
  }>;
};
type ListingWithSaleStatus = ListingRow & {
  latestSnapshotSaleStatus: string | null;
};
type OptionRow = ListingRow['options'][number];
type InventorySellpiaSku = ProductMatchingCandidate;

@Injectable()
export class ChannelProductMatchingRepositoryAdapter
implements ChannelProductMatchingRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT)
    private readonly productTransactionalRead: ProductTransactionalReadPort,
    @Inject(PRODUCT_SOURCE_READ_PORT)
    private readonly productSourceRead: ProductSourceReadPort,
    @Inject(CHANNEL_OPTION_RECIPE_PORT)
    private readonly recipeMutations: ChannelOptionRecipePort,
  ) {}

  async updateSafetyStock(organizationId: string, optionId: string, safetyStock: number): Promise<boolean> {
    const updated = await this.prisma.channelListingOption.updateMany({
      where: { id: optionId, organizationId },
      data: { safetyStock },
    });
    return updated.count === 1;
  }

  async listQueue(
    organizationId: string,
    query: { channelAccountId?: string; search?: string },
  ) {
    const rawListings = await this.prisma.$transaction(async (tx) => {
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
    const listings = await this.hydrateListings(organizationId, rawListings);
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
        displayName: true,
        channelName: true,
        rawJson: true,
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
    });
    if (!listing) return null;
    const listingSummary = withListingProductSummary(listing);
    const manualSearch = search?.trim();
    const candidates = await this.readProductCandidates(organizationId, manualSearch);
    const candidateIds = candidates.map((candidate) => candidate.masterProductId);
    const candidateListings = candidateIds.length === 0
      ? []
      : await this.prisma.channelListing.findMany({
        where: {
          organizationId,
          isActive: true,
          options: {
            some: {
              organizationId,
              inventoryComponents: {
                some: { organizationId, masterProductId: { in: candidateIds } },
              },
            },
          },
        },
        select: {
          id: true,
          options: {
            where: { organizationId },
            select: {
              isActive: true,
              inventoryComponents: {
                where: { organizationId },
                select: { masterProductId: true },
              },
            },
          },
        },
      });
    const candidateIdSet = new Set(candidateIds);
    const matchingCandidateListings = candidateListings
      .map((candidateListing) => withListingProductSummary(candidateListing))
      .filter((candidateListing) => candidateListing.masterProductId !== null
        && candidateIdSet.has(candidateListing.masterProductId));
    const componentIds = [...new Set(matchingCandidateListings.flatMap((candidateListing) =>
      candidateListing.options
        .filter((option) => option.isActive)
        .flatMap((option) => option.inventoryComponents
          .map((component) => component.masterProductId))))];
    const componentIdentities = await this.readProductIdentities(organizationId, componentIds);
    const barcodeByMasterProductId = new Map(componentIdentities.map((identity) => [
      identity.masterProductId,
      identity.barcode,
    ]));
    const componentIdsByCandidate = new Map<string, string[]>();
    for (const candidateListing of matchingCandidateListings) {
      const masterProductId = candidateListing.masterProductId;
      if (!masterProductId) continue;
      const ids = componentIdsByCandidate.get(masterProductId) ?? [];
      ids.push(...candidateListing.options
        .filter((option) => option.isActive)
        .flatMap((option) => option.inventoryComponents
          .map((component) => component.masterProductId)));
      componentIdsByCandidate.set(masterProductId, ids);
    }
    const raw = asRecord(listing.rawJson);
    return {
      listingId: listing.id,
      externalId: listing.externalId,
      masterProductId: listingSummary.masterProductId,
      displayName: listing.displayName ?? listing.channelName,
      explicitCode: firstString(raw, ['masterProductCode', 'productCode', 'code']),
      barcode: firstString(raw, ['barcode', 'productBarcode']),
      aiSuggestion: aiProductSuggestion(raw),
      candidates: candidates.map((candidate) => ({
        id: candidate.masterProductId,
        code: candidate.code,
        name: candidate.name,
        // Category and brand are no longer Products identity fields. Channels
        // retains only the candidate's canonical source identity here.
        category: null,
        brand: null,
        barcodes: distinctStrings((componentIdsByCandidate.get(candidate.masterProductId) ?? [])
          .map((componentId) => barcodeByMasterProductId.get(componentId))
          .filter((value): value is string | null => value !== undefined)),
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
        throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'RECIPE_MUTATION_OWNER_UNAVAILABLE' } });
      }
      if (input.masterProductId === null) {
        await this.recipeMutations.clearListingRecipesInTransaction(ownerTransaction(tx), {
          organizationId: input.organizationId,
          channelListingId: input.channelListingId,
        });
      } else {
        await lockProductMapping(tx, input.organizationId);
        const summaries = await readListingProductIds(tx, {
          organizationId: input.organizationId,
          listingIds: [input.channelListingId],
        });
        if (!summaries.has(input.channelListingId)) {
          throw new KiditemNotFoundError('CHANNELS_LISTING_NOT_FOUND');
        }
        if (summaries.get(input.channelListingId) !== input.masterProductId) {
          throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'PRODUCT_LINK_DERIVED_FROM_RECIPES' } });
        }
      }
    }, TRANSACTION_OPTIONS);
  }

  async autoMatch(input: {
    organizationId: string;
    channelAccountId?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      // Match publication's mapping -> source order before reading or mutating recipes.
      await lockProductMapping(tx, input.organizationId);
      const [rawListings, aliases] = await Promise.all([
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
                    masterProductId: true,
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
            masterProductId: true,
            itemCount: true,
          },
        }),
      ]);
      const listings = rawListings.map((listing) => withListingProductSummary(listing));
      const aliasesByName = new Map<string, typeof aliases>();
      for (const alias of aliases) {
        const rows = aliasesByName.get(alias.normalizedAlias) ?? [];
        rows.push(alias);
        aliasesByName.set(alias.normalizedAlias, rows);
      }
      const productContext = { client: tx };
      const productLock = await this.productTransactionalRead.lock(
        productContext,
        input.organizationId,
      );
      const productIdentities = await this.productTransactionalRead.readActiveMatchingCandidates(
        productContext,
        productLock,
        input.organizationId,
      );
      const inventorySkus: InventorySellpiaSku[] = productIdentities;
      const inventorySkusByBarcode = new Map<string, InventorySellpiaSku[]>();
      for (const sku of inventorySkus) {
        const barcode = normalizePhysicalBarcode(sku.barcode);
        if (!barcode) continue;
        const rows = inventorySkusByBarcode.get(barcode) ?? [];
        rows.push(sku);
        inventorySkusByBarcode.set(barcode, rows);
      }
      const inventorySkusByCode = new Map<string, InventorySellpiaSku[]>();
      for (const sku of inventorySkus) {
        const code = sku.code.trim();
        if (!code) continue;
        const rows = inventorySkusByCode.get(code) ?? [];
        rows.push(sku);
        inventorySkusByCode.set(code, rows);
      }
      const inventorySkuByMasterProductId = new Map(
        inventorySkus.map((sku) => [sku.masterProductId, sku] as const),
      );
      const mutations: Array<{
        channelListingOptionId: string;
        expectedMasterProductId?: string;
        components: Array<{ masterProductId: string; quantity: number }>;
      }> = [];
      for (const listing of listings) {
        const listingNames = listingAliasTitles(listing);
        for (const option of listing.options) {
          const nameOptions = optionNameOptions(listing, option);
          const suggestionSkus = inventorySkus.map(toSuggestionSku);
          const codeEvidence = ([
            ['seller_sku_code', option.sellerSku],
            ['model_number_code', option.modelNumber],
          ] as const).flatMap(([kind, value]) => {
            const channelValue = value?.trim();
            if (!channelValue) return [];
            return (inventorySkusByCode.get(channelValue) ?? []).map((sku) => ({
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
            (inventorySkusByBarcode.get(barcode) ?? []).map((sku) => ({
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
            const sku = alias.masterProductId
              ? inventorySkuByMasterProductId.get(alias.masterProductId)
              : undefined;
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
              masterProductId: component.masterProductId,
              code: inventorySkuByMasterProductId.get(component.masterProductId)?.code ?? '',
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
            ? inventorySkuByMasterProductId.get(proposal.masterProductId)
            : null;
          if (!proposal || !targetSku
            || !Number.isSafeInteger(quantity) || (quantity ?? 0) <= 0) continue;
          mutations.push({
            channelListingOptionId: option.id,
            expectedMasterProductId: targetSku.masterProductId,
            components: [{
              masterProductId: targetSku.masterProductId,
              quantity: quantity!,
            }],
          });
        }
      }
      if (mutations.length > 0 && !this.recipeMutations) {
        throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'RECIPE_MUTATION_CAPABILITY_UNAVAILABLE' } });
      }
      const result = mutations.length > 0
        ? await this.recipeMutations!.applyPreservingRecipesInTransaction(ownerTransaction(tx), {
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
    const { rawListings, unresolvedOptions } = await this.prisma.$transaction(
      async (tx) => {
        const rawListings = await this.loadListings(tx, organizationId, query, 'availability');
        const unresolvedOptions = await readUnresolvedCompositionOptionIds(tx, {
          organizationId, channelListingIds: rawListings.map(listing => listing.id),
        });
        return { rawListings, unresolvedOptions };
      },
      READ_TRANSACTION_OPTIONS,
    );
    const listings = await this.hydrateListings(organizationId, rawListings);
    return listings.flatMap((listing) => listing.options
      .filter((option) => !query.optionIds || query.optionIds.includes(option.id))
      .map((option) => ({
      compositionUnconfirmed: unresolvedOptions.has(option.id),
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
        safetyStock: option.safetyStock,
        status: option.status,
        updatedAt: option.updatedAt,
      },
      inventoryComponents: option.inventoryComponents.map((component) => ({
          masterProductId: component.masterProductId,
          code: component.product?.code ?? null,
          name: component.product?.name ?? null,
          optionName: component.product?.optionName ?? null,
          barcode: component.product?.barcode ?? null,
          purchasePrice: component.product?.purchasePrice ?? null,
          quantity: component.quantity,
        })),
      })));
  }

  private async readProductCandidates(
    organizationId: string,
    search?: string,
  ): Promise<ProductSourceReadModel[]> {
    return search
      ? this.productSourceRead.search(organizationId, search, 100)
      : this.productSourceRead.listActiveForMatching(organizationId);
  }

  private async readProductIdentities(
    organizationId: string,
    masterProductIds: string[],
  ): Promise<ProductSourceReadModel[]> {
    if (masterProductIds.length === 0) return [];
    return this.productSourceRead.findByIds(organizationId, masterProductIds);
  }

  private async hydrateListings<T extends ListingRow>(
    organizationId: string,
    listings: T[],
  ): Promise<T[]> {
    const masterProductIds = [...new Set(listings.flatMap((listing) => [
      ...(listing.masterProductId ? [listing.masterProductId] : []),
      ...listing.options.flatMap((option) => option.inventoryComponents.map(
        (component) => component.masterProductId,
      )),
    ]))];
    const identities = await this.readProductIdentities(organizationId, masterProductIds);
    const identityById = new Map(identities.map((identity) => [
      identity.masterProductId,
      identity,
    ]));
    return listings.map((listing) => ({
      ...listing,
      linkedProduct: listing.masterProductId
        ? identityById.get(listing.masterProductId) ?? null
        : null,
      options: listing.options.map((option) => ({
        ...option,
        inventoryComponents: option.inventoryComponents.map((component) => ({
          ...component,
          product: identityById.get(component.masterProductId) ?? null,
        })),
      })),
    }));
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
    const baseWhere = scope === 'matching'
      ? matchingListingWhere(organizationId)
      : await availabilityListingWhere(prisma, organizationId, query.channelAccountId);
    const where: Prisma.ChannelListingWhereInput = {
      ...baseWhere,
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
    };
    const orderedIds = (await prisma.channelListing.findMany({
      where,
      select: { id: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    })).map((row) => row.id);
    const listings: RawListingRow[] = await loadByIdBatches(
      orderedIds,
      (chunk) => prisma.channelListing.findMany({
        where: { organizationId, id: { in: chunk } },
        select: listingSelect(organizationId),
      }),
    );
    return listings.map((rawListing) => {
      const listing = withListingProductSummary(rawListing);
      return {
        ...listing,
        linkedProduct: null,
        options: listing.options.map((option) => ({
          ...option,
          inventoryComponents: option.inventoryComponents.map((component) => ({
            ...component,
            product: null,
          })),
        })),
      };
    });
  }
}

function matchingListingWhere(
  organizationId: string,
): Prisma.ChannelListingWhereInput {
  return { organizationId };
}

async function availabilityListingWhere(
  prisma: Prisma.TransactionClient,
  organizationId: string,
  channelAccountId?: string,
): Promise<Prisma.ChannelListingWhereInput> {
  const completedRunIds = await readCompletedCatalogRunIds(prisma, { organizationId, channelAccountId });
  return {
    organizationId,
    isActive: true,
    OR: [
      // 수집에서 만든 초안이 붙은 몰 상품은 늘 우리 목록이다.
      { salesProduct: { organizationId, sourceRecordId: { not: null } } },
      ...publishedCatalogListingBranches(completedRunIds),
      {
        options: {
          some: publishedCatalogOptionWhere(organizationId),
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
    linkedProduct: listing.linkedProduct ? {
      id: listing.linkedProduct.masterProductId,
      code: listing.linkedProduct.code,
      name: listing.linkedProduct.name,
      displayImageUrl: listing.linkedProduct.imageUrls[0] ?? null,
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
      masterProductId: component.masterProductId,
      code: component.product?.code ?? null,
      name: component.product?.name ?? null,
      optionName: component.product?.optionName ?? null,
      barcode: component.product?.barcode ?? null,
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

function toSuggestionSku(sku: InventorySellpiaSku) {
  return {
    masterProductId: sku.masterProductId,
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
