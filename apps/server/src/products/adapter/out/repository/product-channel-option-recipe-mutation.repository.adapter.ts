import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  advanceProductMappingGeneration,
  lockProductMapping,
} from '../../../../common/product-mapping-generation';
import { readInventorySkuIdentities } from '../../../../inventory/read/inventory-availability';
import type {
  ProductChannelOptionRecipeMutationRepositoryPort,
} from '../../../application/port/out/repository/product-channel-option-recipe-mutation.repository.port';
import type {
  ProductChannelOptionRecipeMutation,
  ProductRecipeComponentInput,
} from '../../../application/port/in/product-channel-option-recipe-mutation.port';

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

@Injectable()
export class ProductChannelOptionRecipeMutationRepositoryAdapter
implements ProductChannelOptionRecipeMutationRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  replaceRecipe(input: {
    organizationId: string;
    channelListingOptionId: string;
    components: readonly ProductRecipeComponentInput[];
  }) {
    return this.prisma.$transaction(async (tx) => {
      await lockProductMapping(tx, input.organizationId);
      const option = await tx.channelListingOption.findFirst({
        where: {
          id: input.channelListingOptionId,
          organizationId: input.organizationId,
        },
        select: {
          id: true,
          listingId: true,
          listing: { select: { masterProductId: true } },
          inventoryComponents: {
            where: { organizationId: input.organizationId },
            select: { sellpiaInventorySkuId: true, quantity: true },
          },
        },
      });
      if (!option) throw new NotFoundException('Channel listing option was not found');
      await validateRecipeTargets(tx, input);
      const recipeChanged = !sameRecipe(option.inventoryComponents, input.components);
      if (recipeChanged) {
        await tx.channelListingOptionInventoryComponent.deleteMany({
          where: {
            organizationId: input.organizationId,
            channelListingOptionId: input.channelListingOptionId,
          },
        });
        if (input.components.length > 0) {
          await tx.channelListingOptionInventoryComponent.createMany({
            data: input.components.map((component) => ({
              organizationId: input.organizationId,
              channelListingOptionId: input.channelListingOptionId,
              sellpiaInventorySkuId: component.sellpiaInventorySkuId,
              quantity: component.quantity,
            })),
          });
        }
      }
      const masterProductId = await resolveListingMasterProductId(
        tx,
        input.organizationId,
        option.listingId,
      );
      const listingChanged = option.listing.masterProductId !== masterProductId;
      if (listingChanged) {
        const updated = await tx.channelListing.updateMany({
          where: { id: option.listingId, organizationId: input.organizationId },
          data: { masterProductId },
        });
        if (updated.count !== 1) throw new NotFoundException('Channel listing was not found');
      }
      if (recipeChanged || listingChanged) {
        await advanceProductMappingGeneration(tx, input.organizationId);
      }
      return { masterProductId };
    }, TRANSACTION_OPTIONS);
  }

  validateRecipeTargets(input: {
    organizationId: string;
    expectedMasterProductId?: string;
    components: readonly ProductRecipeComponentInput[];
  }): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      await validateRecipeTargets(tx, input);
    }, TRANSACTION_OPTIONS);
  }

  applyPreservingRecipes(input: {
    organizationId: string;
    mutations: readonly ProductChannelOptionRecipeMutation[];
  }) {
    return this.prisma.$transaction(
      (tx) => this.applyPreservingRecipesInTransaction(tx, input),
      TRANSACTION_OPTIONS,
    );
  }

  async applyPreservingRecipesInTransaction(
    transaction: object,
    input: {
      organizationId: string;
      mutations: readonly ProductChannelOptionRecipeMutation[];
    },
  ) {
    if (input.mutations.length === 0) return emptyResult();
    const tx = transaction as Prisma.TransactionClient;
    await lockProductMapping(tx, input.organizationId);
    const optionIds = input.mutations.map((mutation) => mutation.channelListingOptionId);
    const options = await tx.channelListingOption.findMany({
      where: { organizationId: input.organizationId, id: { in: optionIds } },
      select: {
        id: true,
        listingId: true,
        listing: { select: { masterProductId: true } },
        inventoryComponents: {
          where: { organizationId: input.organizationId },
          select: { sellpiaInventorySkuId: true, quantity: true },
        },
      },
    });
    if (options.length !== optionIds.length) {
      throw new NotFoundException('Channel listing option was not found');
    }
    const optionById = new Map(options.map((option) => [option.id, option]));
    const allComponents = input.mutations.flatMap((mutation) => mutation.components);
    const skuById = await loadRecipeTargets(tx, input.organizationId, allComponents);
    const expectedMasterProductIds = [...new Set(input.mutations.flatMap((mutation) =>
      mutation.expectedMasterProductId ? [mutation.expectedMasterProductId] : []))];
    if (expectedMasterProductIds.length > 0) {
      const activeMasterProducts = await tx.masterProduct.findMany({
        where: {
          organizationId: input.organizationId,
          isActive: true,
          id: { in: expectedMasterProductIds },
        },
        select: { id: true },
      });
      if (activeMasterProducts.length !== expectedMasterProductIds.length) {
        throw new BadRequestException(
          'Expected MasterProduct is inactive, missing, or belongs to another organization',
        );
      }
    }
    for (const mutation of input.mutations) {
      if (!mutation.expectedMasterProductId) continue;
      if (mutation.components.some((component) =>
        skuById.get(component.sellpiaInventorySkuId)?.masterProductId
          !== mutation.expectedMasterProductId)) {
        throw new BadRequestException(
          'Recipe components do not resolve to the expected canonical MasterProduct',
        );
      }
    }

    const conflicts: string[] = [];
    const applied: typeof input.mutations[number][] = [];
    const listingIds = new Set<string>();
    for (const mutation of input.mutations) {
      const option = optionById.get(mutation.channelListingOptionId)!;
      if (option.inventoryComponents.length > 0) {
        if (!sameRecipe(option.inventoryComponents, mutation.components)) {
          conflicts.push(mutation.channelListingOptionId);
          continue;
        }
        listingIds.add(option.listingId);
        continue;
      }
      if (mutation.components.length === 0) continue;
      applied.push(mutation);
      listingIds.add(option.listingId);
    }

    if (applied.length > 0) {
      await tx.channelListingOptionInventoryComponent.createMany({
        data: applied.flatMap((mutation) => mutation.components.map((component) => ({
          organizationId: input.organizationId,
          channelListingOptionId: mutation.channelListingOptionId,
          sellpiaInventorySkuId: component.sellpiaInventorySkuId,
          quantity: component.quantity,
        }))),
      });
    }

    let matchedListingCount = 0;
    let listingChanged = false;
    for (const listingId of [...listingIds].sort()) {
      const previousMasterProductId = options.find((option) =>
        option.listingId === listingId)!.listing.masterProductId;
      const masterProductId = await resolveListingMasterProductId(
        tx,
        input.organizationId,
        listingId,
      );
      if (previousMasterProductId === masterProductId) continue;
      const updated = await tx.channelListing.updateMany({
        where: { id: listingId, organizationId: input.organizationId },
        data: { masterProductId },
      });
      if (updated.count !== 1) throw new NotFoundException('Channel listing was not found');
      listingChanged = true;
      if (previousMasterProductId === null && masterProductId !== null) {
        matchedListingCount += 1;
      }
    }
    const mappingChanged = applied.length > 0 || listingChanged;
    if (mappingChanged) {
      await advanceProductMappingGeneration(tx, input.organizationId);
    }
    return {
      changedOptionCount: applied.length,
      matchedListingCount,
      conflictingChannelListingOptionIds: conflicts.sort(),
      mappingChanged,
    };
  }

  async clearListingRecipesInTransaction(
    transaction: object,
    input: {
      organizationId: string;
      channelListingId: string;
    },
  ) {
    const tx = transaction as Prisma.TransactionClient;
    await lockProductMapping(tx, input.organizationId);
    const listing = await tx.channelListing.findFirst({
      where: {
        id: input.channelListingId,
        organizationId: input.organizationId,
      },
      select: {
        id: true,
        masterProductId: true,
        options: {
          where: { organizationId: input.organizationId },
          select: {
            id: true,
            inventoryComponents: {
              where: { organizationId: input.organizationId },
              select: { id: true },
            },
          },
        },
      },
    });
    if (!listing) throw new NotFoundException('Channel listing was not found');
    const changedOptionIds = listing.options
      .filter((option) => option.inventoryComponents.length > 0)
      .map((option) => option.id);
    if (changedOptionIds.length > 0) {
      await tx.channelListingOptionInventoryComponent.deleteMany({
        where: {
          organizationId: input.organizationId,
          channelListingOptionId: { in: changedOptionIds },
        },
      });
    }
    const listingChanged = listing.masterProductId !== null;
    if (listingChanged) {
      const updated = await tx.channelListing.updateMany({
        where: { id: listing.id, organizationId: input.organizationId },
        data: { masterProductId: null },
      });
      if (updated.count !== 1) throw new NotFoundException('Channel listing was not found');
    }
    const mappingChanged = changedOptionIds.length > 0 || listingChanged;
    if (mappingChanged) {
      await advanceProductMappingGeneration(tx, input.organizationId);
    }
    return {
      changedOptionCount: changedOptionIds.length,
      matchedListingCount: 0,
      conflictingChannelListingOptionIds: [],
      mappingChanged,
    };
  }

  async synchronizeListingSummaryInTransaction(
    transaction: object,
    input: {
      organizationId: string;
      channelListingId: string;
    },
  ) {
    const tx = transaction as Prisma.TransactionClient;
    await lockProductMapping(tx, input.organizationId);
    const listing = await tx.channelListing.findFirst({
      where: {
        id: input.channelListingId,
        organizationId: input.organizationId,
      },
      select: { id: true, masterProductId: true },
    });
    if (!listing) throw new NotFoundException('Channel listing was not found');
    const masterProductId = await resolveListingMasterProductId(
      tx,
      input.organizationId,
      listing.id,
    );
    const mappingChanged = listing.masterProductId !== masterProductId;
    if (mappingChanged) {
      const updated = await tx.channelListing.updateMany({
        where: { id: listing.id, organizationId: input.organizationId },
        data: { masterProductId },
      });
      if (updated.count !== 1) throw new NotFoundException('Channel listing was not found');
      await advanceProductMappingGeneration(tx, input.organizationId);
    }
    return { masterProductId, mappingChanged };
  }
}

function emptyResult() {
  return {
    changedOptionCount: 0,
    matchedListingCount: 0,
    conflictingChannelListingOptionIds: [],
    mappingChanged: false,
  };
}

async function validateRecipeTargets(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    expectedMasterProductId?: string;
    components: readonly ProductRecipeComponentInput[];
  },
): Promise<void> {
  if (input.expectedMasterProductId) {
    const masterProduct = await tx.masterProduct.findFirst({
      where: {
        id: input.expectedMasterProductId,
        organizationId: input.organizationId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!masterProduct) {
      throw new BadRequestException(
        'Expected MasterProduct is inactive, missing, or belongs to another organization',
      );
    }
  }
  const skuById = await loadRecipeTargets(tx, input.organizationId, input.components);
  if (input.expectedMasterProductId
    && input.components.some((component) =>
      skuById.get(component.sellpiaInventorySkuId)?.masterProductId
        !== input.expectedMasterProductId)) {
    throw new BadRequestException(
      'Recipe components do not resolve to the expected canonical MasterProduct',
    );
  }
}

async function loadRecipeTargets(
  tx: Prisma.TransactionClient,
  organizationId: string,
  components: readonly ProductRecipeComponentInput[],
) {
  const ids = [...new Set(components.map((component) => component.sellpiaInventorySkuId))];
  if (ids.length === 0) return new Map<string, { masterProductId: string | null }>();
  const rows = await readInventorySkuIdentities(tx, {
    organizationId,
    selector: { kind: 'ids', values: ids },
  });
  const byId = new Map(rows.map((row) => [row.sellpiaInventorySkuId, row]));
  if (ids.some((id) => !byId.has(id))) {
    throw new BadRequestException(
      'One or more SellpiaInventorySku components do not belong to this organization',
    );
  }
  if (ids.some((id) => byId.get(id)?.isActive !== true)) {
    throw new BadRequestException('Inactive SellpiaInventorySku components require review');
  }
  if (ids.some((id) => !byId.get(id)?.masterProductId)) {
    throw new BadRequestException(
      'SellpiaInventorySku canonical MasterProduct must be synchronized before matching',
    );
  }
  return byId;
}

function sameRecipe(
  current: readonly ProductRecipeComponentInput[],
  replacement: readonly ProductRecipeComponentInput[],
): boolean {
  if (current.length !== replacement.length) return false;
  const bySku = new Map(current.map((component) => [
    component.sellpiaInventorySkuId,
    component.quantity,
  ]));
  return replacement.every((component) =>
    bySku.get(component.sellpiaInventorySkuId) === component.quantity);
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
            select: { sellpiaInventorySkuId: true },
          },
        },
      },
    },
  });
  if (!listing || listing.options.length === 0) return null;
  const inventorySkuIds = [...new Set(listing.options.flatMap((option) =>
    option.inventoryComponents.map((component) => component.sellpiaInventorySkuId)))];
  const inventorySkus = await readInventorySkuIdentities(tx, {
    organizationId,
    selector: { kind: 'ids', values: inventorySkuIds },
  });
  const inventorySkuById = new Map(inventorySkus.map((sku) => [
    sku.sellpiaInventorySkuId,
    sku,
  ]));
  const masterProductIds = new Set<string>();
  for (const option of listing.options) {
    if (option.inventoryComponents.length === 0) return null;
    for (const component of option.inventoryComponents) {
      const masterProductId = inventorySkuById.get(
        component.sellpiaInventorySkuId,
      )?.masterProductId;
      if (!masterProductId) return null;
      masterProductIds.add(masterProductId);
    }
  }
  return masterProductIds.size === 1 ? [...masterProductIds][0]! : null;
}
