import { randomUUID } from 'node:crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { upsertChannelCatalogIdentities } from '../adapter/out/repository/channel-catalog-identity-upsert';
import { ChannelProductMatchingRepositoryAdapter } from '../adapter/out/repository/channel-product-matching.repository.adapter';
import { MarketplaceRegistrationRepositoryAdapter } from '../adapter/out/repository/marketplace-registration.repository.adapter';
import { ChannelProductMatchingService } from '../application/service/channel-product-matching.service';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';

describe('ChannelProductMatchingRepositoryAdapter (PG integration)', () => {
  let prisma: PrismaClient;
  let repository: ChannelProductMatchingRepositoryAdapter;
  let service: ChannelProductMatchingService;
  let completedRunId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    repository = new ChannelProductMatchingRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    service = new ChannelProductMatchingService(repository);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.createMany({
      data: [
        {
          id: ACCOUNT_ID,
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'coupang',
          name: 'Wing',
        },
        {
          id: OTHER_ACCOUNT_ID,
          organizationId: OTHER_ORGANIZATION_ID,
          channel: 'coupang',
          name: 'Other Wing',
        },
      ],
    });
    completedRunId = (await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'coupang_wing_catalog',
        channelAccountId: ACCOUNT_ID,
        fileName: 'matching.xlsx',
        fileHash: randomUUID(),
        status: 'completed',
      },
    })).id;
  });

  it('keeps channel-first identities unlinked and treats normalized/AI matches as suggestions', async () => {
    const product = await createProduct('KI-BEAR', 'Blue Bear');
    const listing = await createListing({
      displayName: ' blue  bear ',
      rawJson: {
        aiSuggestedMasterProductId: product.id,
        aiExplanation: 'same catalog image',
        aiScore: 0.8,
      },
    });
    const option = await createOption(listing.id, { itemName: 'Large' });

    const candidates = await service.productCandidates(
      TEST_ORGANIZATION_ID,
      listing.id,
      {},
    );

    expect(candidates.items[0]).toMatchObject({
      masterProductId: product.id,
      reason: 'exact_normalized_name',
    });
    expect(await prisma.channelListing.findUniqueOrThrow({ where: { id: listing.id } }))
      .toMatchObject({ masterProductId: null });
    expect(await prisma.channelListingOption.findUniqueOrThrow({ where: { id: option.id } }))
      .toMatchObject({ productVariantId: null });
    await expect(service.variantCandidates(TEST_ORGANIZATION_ID, option.id, {}))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('fences confirmations, rejects foreign-product variants, and clears option links on unmatch', async () => {
    const first = await createProduct('KI-FIRST', 'First');
    const second = await createProduct('KI-SECOND', 'Second');
    const listing = await createListing({});
    const option = await createOption(listing.id, {});

    await expect(service.linkProduct(
      OTHER_ORGANIZATION_ID,
      listing.id,
      { masterProductId: first.id },
    )).rejects.toBeInstanceOf(NotFoundException);
    await service.linkProduct(TEST_ORGANIZATION_ID, listing.id, {
      masterProductId: first.id,
    });
    await expect(service.linkOption(TEST_ORGANIZATION_ID, option.id, {
      productVariantId: second.variants[0]!.id,
    })).rejects.toBeInstanceOf(BadRequestException);
    await service.linkOption(TEST_ORGANIZATION_ID, option.id, {
      productVariantId: first.variants[0]!.id,
    });
    await service.linkProduct(TEST_ORGANIZATION_ID, listing.id, {
      masterProductId: null,
    });

    expect(await prisma.channelListing.findUniqueOrThrow({ where: { id: listing.id } }))
      .toMatchObject({ masterProductId: null });
    expect(await prisma.channelListingOption.findUniqueOrThrow({ where: { id: option.id } }))
      .toMatchObject({ productVariantId: null });
  });

  it('serializes competing parent and option confirmations on the same listing row', async () => {
    const first = await createProduct('KI-LOCK-FIRST', 'First');
    const second = await createProduct('KI-LOCK-SECOND', 'Second');
    const listing = await createListing({ masterProductId: first.id });
    const option = await createOption(listing.id, {
      productVariantId: first.variants[0]!.id,
    });
    let releaseLock!: () => void;
    let signalLocked!: () => void;
    const locked = new Promise<void>((resolve) => { signalLocked = resolve; });
    const release = new Promise<void>((resolve) => { releaseLock = resolve; });
    const blocker = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM channel_listings
        WHERE id = ${listing.id}::uuid
          AND organization_id = ${TEST_ORGANIZATION_ID}::uuid
        FOR UPDATE
      `;
      signalLocked();
      await release;
    });
    await locked;

    let settled = 0;
    const commands = [
      service.linkProduct(TEST_ORGANIZATION_ID, listing.id, {
        masterProductId: second.id,
      }),
      service.linkOption(TEST_ORGANIZATION_ID, option.id, {
        productVariantId: first.variants[0]!.id,
      }),
    ].map((promise) => promise.finally(() => { settled += 1; }));

    try {
      await prisma.$queryRaw`SELECT pg_sleep(0.1)::text AS slept`;
      expect(settled).toBe(0);
    } finally {
      releaseLock();
      await blocker;
    }
    await Promise.allSettled(commands);
    const [listingAfter, optionAfter] = await Promise.all([
      prisma.channelListing.findUniqueOrThrow({ where: { id: listing.id } }),
      prisma.channelListingOption.findUniqueOrThrow({
        where: { id: option.id },
        include: { productVariant: true },
      }),
    ]);
    expect(listingAfter.masterProductId).toBe(second.id);
    expect(
      optionAfter.productVariantId === null
      || optionAfter.productVariant?.masterProductId === second.id,
    ).toBe(true);
  });

  it('projects configuration, review, and matched option capacity from the linked variant recipe', async () => {
    const activeSku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SP-ACTIVE',
        name: 'Active',
        currentStock: 8,
      },
    });
    const inactiveSku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'SP-INACTIVE',
        name: 'Inactive',
        currentStock: 10,
        isActive: false,
      },
    });
    const configured = await createProduct('KI-CONFIGURED', 'Configured', activeSku.id, 3);
    const review = await createProduct('KI-REVIEW', 'Review');
    await prisma.productVariantComponent.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        productVariantId: review.variants[0]!.id,
        sellpiaInventorySkuId: inactiveSku.id,
        quantity: 1,
        source: 'manual',
      },
    });
    const configuration = await createProduct('KI-EMPTY', 'Empty');
    const matchedListing = await createListing({ masterProductId: configured.id });
    const reviewListing = await createListing({
      externalId: 'P-REVIEW',
      masterProductId: review.id,
    });
    const emptyListing = await createListing({
      externalId: 'P-EMPTY',
      masterProductId: configuration.id,
    });
    await createOption(matchedListing.id, {
      externalOptionId: 'O-MATCHED',
      productVariantId: configured.variants[0]!.id,
    });
    await createOption(reviewListing.id, {
      externalOptionId: 'O-REVIEW',
      productVariantId: review.variants[0]!.id,
    });
    await createOption(emptyListing.id, {
      externalOptionId: 'O-EMPTY',
      productVariantId: configuration.variants[0]!.id,
    });

    const queue = await service.list(TEST_ORGANIZATION_ID);
    const byExternalId = new Map(queue.options.map((row) => [
      row.option.externalOptionId,
      row,
    ]));
    expect(byExternalId.get('O-MATCHED')).toMatchObject({
      recipeStatus: 'matched',
      capacity: 2,
    });
    expect(byExternalId.get('O-REVIEW')).toMatchObject({
      recipeStatus: 'review_required',
      capacity: null,
    });
    expect(byExternalId.get('O-EMPTY')).toMatchObject({
      recipeStatus: 'configuration_required',
      capacity: null,
    });
  });

  it('preserves confirmed links during provider recollection', async () => {
    const product = await createProduct('KI-PRESERVE', 'Preserve');
    const listing = await createListing({ masterProductId: product.id });
    const option = await createOption(listing.id, {
      productVariantId: product.variants[0]!.id,
    });

    await prisma.$transaction((tx) => upsertChannelCatalogIdentities(tx, {
      organizationId: TEST_ORGANIZATION_ID,
      channelAccountId: ACCOUNT_ID,
      lastImportRunId: null,
      rawSource: 'test',
      products: [{
        externalProductId: listing.externalId,
        registeredName: 'Recollected',
        displayName: 'Recollected display',
        category: null,
        manufacturer: null,
        brand: null,
        productStatus: 'active',
        raw: {},
        options: [{
          externalOptionId: option.externalOptionId,
          optionName: 'Recollected option',
          salePrice: 100,
          sellerSku: null,
          barcode: null,
          modelNumber: null,
          skuStatus: 'active',
          attributes: {},
          raw: {},
        }],
      }],
    }));

    expect(await prisma.channelListing.findUniqueOrThrow({ where: { id: listing.id } }))
      .toMatchObject({ masterProductId: product.id, displayName: 'Recollected display' });
    expect(await prisma.channelListingOption.findUniqueOrThrow({ where: { id: option.id } }))
      .toMatchObject({ productVariantId: product.variants[0]!.id, itemName: 'Recollected option' });
  });

  it('limits matching and imported availability to active completed catalog rows', async () => {
    const completed = await createListing({ externalId: 'P-COMPLETED' });
    await createOption(completed.id, { externalOptionId: 'O-COMPLETED' });
    const running = await prisma.sourceImportRun.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceType: 'coupang_wing_catalog',
        channelAccountId: ACCOUNT_ID,
        fileName: 'running.xlsx',
        fileHash: randomUUID(),
        status: 'running',
      },
    });
    const incomplete = await createListing({
      externalId: 'P-RUNNING',
      lastImportRunId: running.id,
    });
    await createOption(incomplete.id, { externalOptionId: 'O-RUNNING' });
    const inactive = await createListing({
      externalId: 'P-INACTIVE',
      isActive: false,
    });
    await createOption(inactive.id, { externalOptionId: 'O-INACTIVE' });

    const queue = await service.list(TEST_ORGANIZATION_ID);
    expect(queue.products.map((row) => row.listing.externalId)).toContain('P-COMPLETED');
    expect(queue.products.map((row) => row.listing.externalId)).not.toContain('P-RUNNING');
    expect(queue.products.map((row) => row.listing.externalId)).not.toContain('P-INACTIVE');
    const availability = await repository.listAvailabilityRows(TEST_ORGANIZATION_ID, {});
    expect(availability.map((row) => row.listing.externalId)).toContain('P-COMPLETED');
    expect(availability.map((row) => row.listing.externalId)).not.toContain('P-RUNNING');
    expect(availability.map((row) => row.listing.externalId)).not.toContain('P-INACTIVE');
  });

  it('links exact KidItem-first product and variant identities in the caller transaction', async () => {
    const product = await createProduct('KI-REGISTER', 'Register');
    const candidate = await prisma.sourcingCandidate.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: 'https://example.com/register',
        sourcePlatform: 'test',
        name: 'Register',
      },
    });
    const registration = new MarketplaceRegistrationRepositoryAdapter(
      prisma as unknown as PrismaService,
    );

    const result = await prisma.$transaction((tx) =>
      registration.resolveProductRegistration(tx, {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: candidate.id,
        channelAccountId: ACCOUNT_ID,
        externalListingId: 'REGISTERED-P',
        displayName: 'Registered',
        masterProductId: product.id,
        optionLinks: [{
          externalOptionId: 'REGISTERED-O',
          productVariantId: product.variants[0]!.id,
        }],
      }));

    expect(await prisma.channelListing.findUniqueOrThrow({ where: { id: result.listingId } }))
      .toMatchObject({ masterProductId: product.id });
    expect(await prisma.channelListingOption.findFirstOrThrow({
      where: { listingId: result.listingId, externalOptionId: 'REGISTERED-O' },
    })).toMatchObject({ productVariantId: product.variants[0]!.id });
    expect(await repository.listAvailabilityRows(TEST_ORGANIZATION_ID, {
      listingIds: [result.listingId],
    })).toHaveLength(1);
  });

  async function createProduct(
    code: string,
    name: string,
    sellpiaInventorySkuId?: string,
    quantity = 1,
  ) {
    return prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code,
        name,
        variants: {
          create: {
            code: `${code}-DEFAULT`,
            name,
            isDefault: true,
            ...(sellpiaInventorySkuId ? {
              components: {
                create: {
                  sellpiaInventorySkuId,
                  quantity,
                  source: 'manual',
                },
              },
            } : {}),
          },
        },
      },
      include: { variants: true },
    });
  }

  function createListing(input: {
    externalId?: string;
    displayName?: string;
    masterProductId?: string;
    rawJson?: object;
    lastImportRunId?: string | null;
    isActive?: boolean;
  }) {
    return prisma.channelListing.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channelAccountId: ACCOUNT_ID,
        externalId: input.externalId ?? `P-${randomUUID()}`,
        displayName: input.displayName,
        masterProductId: input.masterProductId,
        rawJson: input.rawJson,
        lastImportRunId: input.lastImportRunId === undefined
          ? completedRunId
          : input.lastImportRunId,
        isActive: input.isActive ?? true,
      },
    });
  }

  function createOption(listingId: string, input: {
    externalOptionId?: string;
    itemName?: string;
    productVariantId?: string;
  }) {
    return prisma.channelListingOption.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        listingId,
        externalOptionId: input.externalOptionId ?? `O-${randomUUID()}`,
        itemName: input.itemName,
        productVariantId: input.productVariantId,
      },
    });
  }
});
