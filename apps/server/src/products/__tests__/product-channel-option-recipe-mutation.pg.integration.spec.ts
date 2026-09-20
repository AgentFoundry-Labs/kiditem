import { randomUUID } from 'node:crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import { InventoryTransactionalReadRepositoryAdapter } from '../../inventory/adapter/out/persistence/inventory-transactional-read.repository.adapter';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { ProductChannelOptionRecipeMutationRepositoryAdapter } from '../adapter/out/repository/product-channel-option-recipe-mutation.repository.adapter';
import { ProductChannelOptionRecipeMutationService } from '../application/service/product-channel-option-recipe-mutation.service';

describe('Products channel-option recipe mutation boundary (PG integration)', () => {
  let prisma: PrismaClient;
  let recipes: ProductChannelOptionRecipeMutationService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    recipes = new ProductChannelOptionRecipeMutationService(
      new ProductChannelOptionRecipeMutationRepositoryAdapter(
        prisma as unknown as PrismaService,
        new InventoryTransactionalReadRepositoryAdapter(),
      ),
    );
  });

  afterAll(async () => { await prisma?.$disconnect(); });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('atomically composes two options, derives the listing summary, and advances one generation', async () => {
    const { product, sku } = await createInventoryProduct('BULK', 19);
    const { listing, options } = await createListing(2);
    const stockBefore = sku.currentStock;

    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      mutations: options.map((option, index) => ({
        channelListingOptionId: option.id,
        expectedMasterProductId: product.id,
        components: [{ sellpiaInventorySkuId: sku.id, quantity: index + 1 }],
      })),
    };
    await expect(recipes.applyPreservingRecipes(input)).resolves.toEqual({
      changedOptionCount: 2,
      matchedListingCount: 1,
      conflictingChannelListingOptionIds: [],
      mappingChanged: true,
    });
    await expect(prisma.channelListing.findUniqueOrThrow({ where: { id: listing.id } }))
      .resolves.toMatchObject({ masterProductId: product.id });
    await expect(readGeneration()).resolves.toBe(1n);
    await expect(prisma.sellpiaInventorySku.findUniqueOrThrow({ where: { id: sku.id } }))
      .resolves.toMatchObject({ currentStock: stockBefore });

    await expect(recipes.applyPreservingRecipes(input)).resolves.toEqual({
      changedOptionCount: 0,
      matchedListingCount: 0,
      conflictingChannelListingOptionIds: [],
      mappingChanged: false,
    });
    await expect(readGeneration()).resolves.toBe(1n);
  });

  it('preserves an existing confirmed recipe and reports the conflicting option', async () => {
    const first = await createInventoryProduct('CONFIRMED', 8);
    const second = await createInventoryProduct('CANDIDATE', 11);
    const { listing, options } = await createListing(1);
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: options[0]!.id,
        sellpiaInventorySkuId: first.sku.id,
        quantity: 3,
      },
    });

    await expect(recipes.applyPreservingRecipes({
      organizationId: TEST_ORGANIZATION_ID,
      mutations: [{
        channelListingOptionId: options[0]!.id,
        expectedMasterProductId: second.product.id,
        components: [{ sellpiaInventorySkuId: second.sku.id, quantity: 1 }],
      }],
    })).resolves.toEqual({
      changedOptionCount: 0,
      matchedListingCount: 0,
      conflictingChannelListingOptionIds: [options[0]!.id],
      mappingChanged: false,
    });
    await expect(prisma.channelListingOptionInventoryComponent.findMany({
      where: { channelListingOptionId: options[0]!.id },
      select: { sellpiaInventorySkuId: true, quantity: true },
    })).resolves.toEqual([{ sellpiaInventorySkuId: first.sku.id, quantity: 3 }]);
    await expect(prisma.channelListing.findUniqueOrThrow({ where: { id: listing.id } }))
      .resolves.toMatchObject({ masterProductId: null });
    await expect(readGeneration()).resolves.toBe(0n);
  });

  it('rejects non-positive quantities and foreign organization targets before mutation', async () => {
    const { product, sku } = await createInventoryProduct('VALIDATE', 5);
    const { options } = await createListing(1);
    expect(() => recipes.applyPreservingRecipes({
      organizationId: TEST_ORGANIZATION_ID,
      mutations: [{
        channelListingOptionId: options[0]!.id,
        expectedMasterProductId: product.id,
        components: [{ sellpiaInventorySkuId: sku.id, quantity: 0 }],
      }],
    })).toThrow(BadRequestException);
    await expect(recipes.applyPreservingRecipes({
      organizationId: OTHER_ORGANIZATION_ID,
      mutations: [{
        channelListingOptionId: options[0]!.id,
        components: [{ sellpiaInventorySkuId: sku.id, quantity: 1 }],
      }],
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.channelListingOptionInventoryComponent.count()).toBe(0);
  });

  it('rolls recipe and listing changes back when generation advancement fails', async () => {
    const { product, sku } = await createInventoryProduct('ROLLBACK', 7);
    const { listing, options } = await createListing(1);
    const maximum = 9_223_372_036_854_775_807n;
    await prisma.masterProductAbcFormulaState.create({
      data: { organizationId: TEST_ORGANIZATION_ID, mappingGeneration: maximum },
    });

    await expect(recipes.applyPreservingRecipes({
      organizationId: TEST_ORGANIZATION_ID,
      mutations: [{
        channelListingOptionId: options[0]!.id,
        expectedMasterProductId: product.id,
        components: [{ sellpiaInventorySkuId: sku.id, quantity: 2 }],
      }],
    })).rejects.toThrow();
    expect(await prisma.channelListingOptionInventoryComponent.count()).toBe(0);
    await expect(prisma.channelListing.findUniqueOrThrow({ where: { id: listing.id } }))
      .resolves.toMatchObject({ masterProductId: null });
    await expect(readGeneration()).resolves.toBe(maximum);
  });

  async function createInventoryProduct(suffix: string, currentStock: number) {
    const product = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: `MP-${suffix}`,
        name: `Product ${suffix}`,
      },
    });
    const sku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        masterProductId: product.id,
        code: `SP-${suffix}`,
        name: `Sellpia ${suffix}`,
        currentStock,
      },
    });
    return { product, sku };
  }

  async function createListing(optionCount: number) {
    const account = await prisma.channelAccount.create({
      data: {
        id: randomUUID(),
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Wing',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: account.id,
        externalId: randomUUID(),
      },
    });
    const options = await Promise.all(Array.from({ length: optionCount }, (_, index) =>
      prisma.channelListingOption.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          listingId: listing.id,
          externalOptionId: `OPTION-${index}-${randomUUID()}`,
        },
      })));
    return { listing, options };
  }

  async function readGeneration(): Promise<bigint> {
    const state = await prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId: TEST_ORGANIZATION_ID },
      select: { mappingGeneration: true },
    });
    return state?.mappingGeneration ?? 0n;
  }
});
