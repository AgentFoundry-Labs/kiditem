import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedSourceProduct } from '../../test-helpers/inventory-seeds';
import { ProductTransactionalReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { ChannelOptionRecipeRepositoryAdapter } from '../adapter/out/persistence/channel-option-recipe.repository.adapter';
import { ChannelOptionRecipeService } from '../application/service/listing/channel-option-recipe.service';
import { ChannelsProductMappingGenerationAdapter } from '../adapter/out/products/product-mapping-generation.adapter';
import { ProductMappingGenerationRepositoryAdapter } from '../../products/adapter/out/persistence/product-mapping-generation.repository.adapter';
import { readListingProductIds } from '../adapter/out/persistence/listing-product-summary.reader';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

describe('Channels channel-option recipe mutation boundary (PG integration)', () => {
  let prisma: PrismaClient;
  let recipes: ChannelOptionRecipeService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    recipes = new ChannelOptionRecipeService(
      new ChannelOptionRecipeRepositoryAdapter(
        prisma as unknown as PrismaService,
        new ProductTransactionalReadRepositoryAdapter(),
        new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()),
      ),
    );
  });

  afterAll(async () => { await prisma?.$disconnect(); });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('atomically composes two options, derives the listing summary, and advances one generation', async () => {
    const product = await createProduct('BULK', 19);
    const { listing, options } = await createListing(2);
    const stockBefore = product.currentStock;

    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      mutations: options.map((option, index) => ({
        channelListingOptionId: option.id,
        expectedMasterProductId: product.id,
        components: [{ masterProductId: product.id, quantity: index + 1 }],
      })),
    };
    await expect(recipes.applyPreservingRecipes(input)).resolves.toEqual({
      changedOptionCount: 2,
      matchedListingCount: 1,
      conflictingChannelListingOptionIds: [],
      mappingChanged: true,
    });
    await expect(readListingProductIds(prisma as unknown as Prisma.TransactionClient, {
      organizationId: TEST_ORGANIZATION_ID,
      listingIds: [listing.id],
    })).resolves.toEqual(new Map([[listing.id, product.id]]));
    await expect(readGeneration()).resolves.toBe(1n);
    const codedOptions = await prisma.channelListingOption.findMany({
      where: { id: { in: options.map(({ id }) => id) } },
    });
    expect(codedOptions.find(({ id }) => id === options[0]!.id)?.kidItemCode).toBe(product.code);
    const bundleCode = codedOptions.find(({ id }) => id === options[1]!.id)?.kidItemCode;
    expect(bundleCode).toMatch(/^KID[0-9]{8}$/);
    expect(bundleCode).not.toBe(product.code);
    await expect(prisma.masterProduct.findUniqueOrThrow({ where: { id: product.id } }))
      .resolves.toMatchObject({ currentStock: stockBefore });

    await expect(recipes.applyPreservingRecipes(input)).resolves.toEqual({
      changedOptionCount: 0,
      matchedListingCount: 0,
      conflictingChannelListingOptionIds: [],
      mappingChanged: false,
    });
    await expect(readGeneration()).resolves.toBe(1n);
  });

  /**
   * 같은 조직의 매핑 변경 두 건이 동시에 와도 둘 다 반영되고 세대는 두 번 오른다(KID-111 완료 조건).
   * 이 스펙은 동작만 고정한다 — 세대 증가는 행 안에서 원자적이라 잠금을 꺼도 통과한다. 잠금 회귀는
   * 아래 "두 동시 교체 중 하나만 이긴다" 스펙이 잡는다(독립 리뷰 2026-09-24 변이로 확인).
   */
  it('applies two concurrent mapping changes of one organization and advances the generation twice', async () => {
    const product = await createProduct('CONCURRENT', 5);
    const first = await createListing(1);
    const second = await createListing(1);
    const change = (optionId: string) => recipes.applyPreservingRecipes({
      organizationId: TEST_ORGANIZATION_ID,
      mutations: [{
        channelListingOptionId: optionId,
        expectedMasterProductId: product.id,
        components: [{ masterProductId: product.id, quantity: 1 }],
      }],
    });

    const results = await Promise.all([change(first.options[0]!.id), change(second.options[0]!.id)]);

    expect(results.map((result) => result.changedOptionCount)).toEqual([1, 1]);
    await expect(prisma.channelListingOptionInventoryComponent.count({
      where: { channelListingOptionId: { in: [first.options[0]!.id, second.options[0]!.id] } },
    })).resolves.toBe(2);
    await expect(readGeneration()).resolves.toBe(2n);
  });

  it('preserves an existing confirmed recipe and reports the conflicting option', async () => {
    const first = await createProduct('CONFIRMED', 8);
    const second = await createProduct('CANDIDATE', 11);
    const { listing, options } = await createListing(1);
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelListingOptionId: options[0]!.id,
        masterProductId: first.id,
        quantity: 3,
      },
    });

    await expect(recipes.applyPreservingRecipes({
      organizationId: TEST_ORGANIZATION_ID,
      mutations: [{
        channelListingOptionId: options[0]!.id,
        expectedMasterProductId: second.id,
        components: [{ masterProductId: second.id, quantity: 1 }],
      }],
    })).resolves.toEqual({
      changedOptionCount: 0,
      matchedListingCount: 0,
      conflictingChannelListingOptionIds: [options[0]!.id],
      mappingChanged: false,
    });
    await expect(prisma.channelListingOptionInventoryComponent.findMany({
      where: { channelListingOptionId: options[0]!.id },
      select: { masterProductId: true, quantity: true },
    })).resolves.toEqual([{ masterProductId: first.id, quantity: 3 }]);
    await expect(readListingProductIds(prisma as unknown as Prisma.TransactionClient, {
      organizationId: TEST_ORGANIZATION_ID,
      listingIds: [listing.id],
    })).resolves.toEqual(new Map([[listing.id, first.id]]));
    await expect(readGeneration()).resolves.toBe(0n);
  });

  it('lets exactly one of two concurrent replacements from the same loaded recipe win', async () => {
    const product = await createProduct('CONCURRENT', 12);
    const { options } = await createListing(1);
    const option = options[0]!;
    const loaded = [{ masterProductId: product.id, quantity: 1 }];
    await prisma.channelListingOptionInventoryComponent.create({
      data: { organizationId: TEST_ORGANIZATION_ID, channelListingOptionId: option.id, ...loaded[0]! },
    });
    const replacements = [2, 3].map(quantity => [{ masterProductId: product.id, quantity }]);

    const results = await Promise.allSettled(replacements.map(components => recipes.replaceRecipe({
      organizationId: TEST_ORGANIZATION_ID,
      channelListingOptionId: option.id,
      expectedComponents: loaded,
      components,
    })));

    const winners = results.flatMap((result, index) => result.status === 'fulfilled' ? [index] : []);
    expect(winners).toHaveLength(1);
    const loser = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    // 웹 recipe-conflict는 409로 "다른 곳에서 바뀜"을 판단한다.
    expect(loser.reason).toMatchObject({ code: 'CHANNELS_OPTION_RECIPE_STALE', kind: 'conflict', httpStatus: 409 });
    await expect(prisma.channelListingOptionInventoryComponent.findMany({
      where: { channelListingOptionId: option.id },
      select: { masterProductId: true, quantity: true },
    })).resolves.toEqual(replacements[winners[0]!]);
    await expect(readGeneration()).resolves.toBe(1n);
  });

  it('rejects a replacement whose loaded recipe is stale without writing anything', async () => {
    const product = await createProduct('STALE', 12);
    const { options } = await createListing(1);
    const option = options[0]!;
    await prisma.channelListingOptionInventoryComponent.create({
      data: { organizationId: TEST_ORGANIZATION_ID, channelListingOptionId: option.id, masterProductId: product.id, quantity: 2 },
    });

    await expect(recipes.replaceRecipe({
      organizationId: TEST_ORGANIZATION_ID,
      channelListingOptionId: option.id,
      expectedComponents: [],
      components: [{ masterProductId: product.id, quantity: 5 }],
    })).rejects.toMatchObject({ code: 'CHANNELS_OPTION_RECIPE_STALE', httpStatus: 409 });
    await expect(prisma.channelListingOptionInventoryComponent.findMany({
      where: { channelListingOptionId: option.id },
      select: { masterProductId: true, quantity: true },
    })).resolves.toEqual([{ masterProductId: product.id, quantity: 2 }]);
    expect(await prisma.channelListingOption.findUniqueOrThrow({ where: { id: option.id } }))
      .toMatchObject({ kidItemCode: null });
    await expect(readGeneration()).resolves.toBe(0n);
  });

  it('answers a stale replacement with a conflict even when it names a since-deleted product', async () => {
    const current = await createProduct('CURRENT', 12);
    const deleted = await createProduct('DELETED', 4);
    const { options } = await createListing(1);
    const option = options[0]!;
    await prisma.channelListingOptionInventoryComponent.create({
      data: { organizationId: TEST_ORGANIZATION_ID, channelListingOptionId: option.id, masterProductId: current.id, quantity: 2 },
    });
    await prisma.masterProduct.delete({ where: { id: deleted.id } });

    await expect(recipes.replaceRecipe({
      organizationId: TEST_ORGANIZATION_ID,
      channelListingOptionId: option.id,
      expectedComponents: [],
      components: [{ masterProductId: deleted.id, quantity: 1 }],
    })).rejects.toMatchObject({ code: 'CHANNELS_OPTION_RECIPE_STALE', httpStatus: 409 });
    await expect(prisma.channelListingOptionInventoryComponent.findMany({
      where: { channelListingOptionId: option.id },
      select: { masterProductId: true, quantity: true },
    })).resolves.toEqual([{ masterProductId: current.id, quantity: 2 }]);
    await expect(readGeneration()).resolves.toBe(0n);
  });

  it('issues a separate bundle code when a singleton recipe changes without rewriting seller SKU', async () => {
    const product = await createProduct('CODE-TRANSITION', 8);
    const { options } = await createListing(1);
    const option = options[0]!;
    await prisma.channelListingOption.update({
      where: { id: option.id },
      data: { sellerSku: 'ORIGINAL-MALL-CODE' },
    });
    const replace = async (quantity: number) => recipes.replaceRecipe({
      organizationId: TEST_ORGANIZATION_ID,
      channelListingOptionId: option.id,
      expectedComponents: await loadedRecipe(option.id),
      components: [{ masterProductId: product.id, quantity }],
    });
    await replace(1);
    expect(await prisma.channelListingOption.findUniqueOrThrow({ where: { id: option.id } }))
      .toMatchObject({ kidItemCode: product.code, sellerSku: 'ORIGINAL-MALL-CODE' });
    await replace(2);
    const bundle = await prisma.channelListingOption.findUniqueOrThrow({ where: { id: option.id } });
    expect(bundle.kidItemCode).toMatch(/^KID[0-9]{8}$/);
    expect(bundle.kidItemCode).not.toBe(product.code);
    expect(bundle.sellerSku).toBe('ORIGINAL-MALL-CODE');
    await replace(2);
    expect(await prisma.channelListingOption.findUniqueOrThrow({ where: { id: option.id } }))
      .toMatchObject({ kidItemCode: bundle.kidItemCode, sellerSku: 'ORIGINAL-MALL-CODE' });
    expect(await prisma.masterProduct.findUniqueOrThrow({ where: { id: product.id } }))
      .toMatchObject({ code: product.code, currentStock: 8 });
  });

  it('uses the current singleton product code and retains the last code when its recipe is cleared', async () => {
    const first = await createProduct('FIRST-CODE', 5);
    const second = await createProduct('SECOND-CODE', 9);
    const { options } = await createListing(1);
    const option = options[0]!;
    await prisma.channelListingOption.update({
      where: { id: option.id }, data: { sellerSku: 'UNCHANGED-EXTERNAL' },
    });
    const replace = async (components: Array<{ masterProductId: string; quantity: number }>) =>
      recipes.replaceRecipe({ organizationId: TEST_ORGANIZATION_ID, channelListingOptionId: option.id,
        expectedComponents: await loadedRecipe(option.id), components });
    const read = () => prisma.channelListingOption.findUniqueOrThrow({ where: { id: option.id } });
    await replace([{ masterProductId: first.id, quantity: 2 }]);
    expect((await read()).kidItemCode).not.toBe(first.code);
    await replace([{ masterProductId: first.id, quantity: 1 }]);
    expect(await read()).toMatchObject({ kidItemCode: first.code, sellerSku: 'UNCHANGED-EXTERNAL' });
    await replace([{ masterProductId: second.id, quantity: 1 }]);
    expect(await read()).toMatchObject({ kidItemCode: second.code, sellerSku: 'UNCHANGED-EXTERNAL' });
    await replace([]);
    expect(await read()).toMatchObject({ kidItemCode: second.code, sellerSku: 'UNCHANGED-EXTERNAL' });
    expect(await prisma.channelListingOptionInventoryComponent.count({ where: { channelListingOptionId: option.id } })).toBe(0);
  });

  it('still rejects new missing-product links even when another mutation carries a frozen code', async () => {
    const { options } = await createListing(2);
    const deletedId = randomUUID();
    await expect(recipes.applyPreservingRecipes({
      organizationId: TEST_ORGANIZATION_ID,
      mutations: [
        {
          channelListingOptionId: options[0]!.id,
          expectedMasterProductId: deletedId,
          preparedKidItemCode: 'KID12345678',
          components: [{ masterProductId: deletedId, quantity: 2 }],
        },
        {
          channelListingOptionId: options[1]!.id,
          components: [{ masterProductId: deletedId, quantity: 1 }],
        },
      ],
    })).rejects.toMatchObject({ code: 'CHANNELS_OPTION_RECIPE_INVALID', kind: 'validation' });
    await expect(recipes.replaceRecipe({
      organizationId: TEST_ORGANIZATION_ID,
      channelListingOptionId: options[0]!.id,
      expectedComponents: [],
      components: [{ masterProductId: deletedId, quantity: 1 }],
    })).rejects.toMatchObject({ code: 'CHANNELS_OPTION_RECIPE_INVALID', kind: 'validation' });
    expect(await prisma.channelListingOptionInventoryComponent.count()).toBe(0);
    expect(await prisma.channelListingOption.findMany({
      where: { id: { in: options.map(({ id }) => id) } },
      select: { kidItemCode: true },
    })).toEqual([{ kidItemCode: null }, { kidItemCode: null }]);
  });

  it.each(['missing', 'foreign'] as const)(
    'rejects a caller-supplied prepared code for a %s target without successful registration evidence',
    async (target) => {
      const { options } = await createListing(1);
      const masterProductId = target === 'missing' ? randomUUID() : (await seedSourceProduct(prisma, {
        organizationId: OTHER_ORGANIZATION_ID, code: 'FOREIGN-SOURCE', name: 'Foreign source', currentStock: 5,
      })).id;
      await expect(recipes.applyPreservingRecipes({
        organizationId: TEST_ORGANIZATION_ID,
        mutations: [{
          channelListingOptionId: options[0]!.id,
          expectedMasterProductId: masterProductId,
          preparedKidItemCode: 'KID12345678',
          components: [{ masterProductId, quantity: 2 }],
        }],
      })).rejects.toMatchObject({ code: 'CHANNELS_OPTION_RECIPE_INVALID', kind: 'validation' });
      expect(await prisma.channelListingOptionInventoryComponent.count()).toBe(0);
      expect(await prisma.channelListingOption.findUniqueOrThrow({ where: { id: options[0]!.id } }))
        .toMatchObject({ kidItemCode: null });
      expect(await readGeneration()).toBe(0n);
    },
  );

  it('rejects non-positive quantities and foreign organization targets before mutation', async () => {
    const product = await createProduct('VALIDATE', 5);
    const { options } = await createListing(1);
    expect(() => recipes.applyPreservingRecipes({
      organizationId: TEST_ORGANIZATION_ID,
      mutations: [{
        channelListingOptionId: options[0]!.id,
        expectedMasterProductId: product.id,
        components: [{ masterProductId: product.id, quantity: 0 }],
      }],
    })).toThrow(expect.objectContaining({ code: 'CHANNELS_OPTION_RECIPE_INVALID', kind: 'validation' }));
    await expect(recipes.applyPreservingRecipes({
      organizationId: OTHER_ORGANIZATION_ID,
      mutations: [{
        channelListingOptionId: options[0]!.id,
        components: [{ masterProductId: product.id, quantity: 1 }],
      }],
    })).rejects.toMatchObject({ code: 'CHANNELS_LISTING_NOT_FOUND', kind: 'not_found' });
    expect(await prisma.channelListingOptionInventoryComponent.count()).toBe(0);
  });

  it('rolls recipe and listing changes back when generation advancement fails', async () => {
    const product = await createProduct('ROLLBACK', 7);
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
        components: [{ masterProductId: product.id, quantity: 2 }],
      }],
    })).rejects.toThrow();
    expect(await prisma.channelListingOptionInventoryComponent.count()).toBe(0);
    await expect(readListingProductIds(prisma as unknown as Prisma.TransactionClient, {
      organizationId: TEST_ORGANIZATION_ID,
      listingIds: [listing.id],
    })).resolves.toEqual(new Map([[listing.id, null]]));
    await expect(readGeneration()).resolves.toBe(maximum);
    expect(await prisma.channelListingOption.findUniqueOrThrow({ where: { id: options[0]!.id } }))
      .toMatchObject({ kidItemCode: null });
  });

  async function createProduct(suffix: string, currentStock: number) {
    return seedSourceProduct(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      code: `SOURCE-${suffix}`,
      name: `Product ${suffix}`,
      currentStock,
    });
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

  function loadedRecipe(channelListingOptionId: string) {
    return prisma.channelListingOptionInventoryComponent.findMany({
      where: { organizationId: TEST_ORGANIZATION_ID, channelListingOptionId },
      select: { masterProductId: true, quantity: true },
    });
  }

  async function readGeneration(): Promise<bigint> {
    const state = await prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId: TEST_ORGANIZATION_ID },
      select: { mappingGeneration: true },
    });
    return state?.mappingGeneration ?? 0n;
  }
});
