import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { ownerTransaction } from '../../prisma/owner-transaction';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { seedSourceProduct } from '../../test-helpers/inventory-seeds';
import { ListingRegistrationPersistenceAdapter } from '../adapter/out/persistence/listing-registration.persistence.adapter';
import { ProductTransactionalReadRepositoryAdapter } from '../../products/adapter/out/persistence/product-transactional-read.repository.adapter';
import { ChannelOptionRecipeRepositoryAdapter } from '../adapter/out/persistence/channel-option-recipe.repository.adapter';
import { ChannelOptionRecipeService } from '../application/service/listing/channel-option-recipe.service';
import { ChannelsProductMappingGenerationAdapter } from '../adapter/out/products/product-mapping-generation.adapter';
import { ProductMappingGenerationRepositoryAdapter } from '../../products/adapter/out/persistence/product-mapping-generation.repository.adapter';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const INACTIVE_OPTION_SKU_ID = '26000000-0000-4000-8000-000000000001';
const ROLLBACK_SKU_ID = '26000000-0000-4000-8000-000000000002';

/**
 * 수집 한 줄이 만드는 것. 원천 기록(후보)과 그 편집 정본(판매상품 초안) 한 쌍이고,
 * 등록은 초안을 대상으로 한다(KID-310).
 */
async function seedDraft(prisma: PrismaClient, sourceUrl: string, name: string) {
  const candidate = await prisma.sourceRecord.create({
    data: { sourceIdentityHash: randomUUID(), organizationId: TEST_ORGANIZATION_ID, sourceUrl, sourcePlatform: 'test', name },
  });
  return prisma.salesProduct.create({
    data: { organizationId: TEST_ORGANIZATION_ID, name, sourceRecordId: candidate.id },
  });
}

describe('ListingRegistrationPersistenceAdapter (PG integration)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.create({
      data: {
        id: ACCOUNT_ID,
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Primary Wing',
        externalAccountId: 'PRODUCT-SYNC-PRIMARY',
        isPrimary: true,
        status: 'active',
      },
    });
  });

  it('advances listing identity generation when registration creates or reactivates a linkless listing', async () => {
    // 등록은 판매상품 초안 하나를 대상으로 한다(KID-310). 원천 기록은 그 초안이 가리킨다.
    const draft = await seedDraft(prisma, 'https://example.com/register-linkless', 'Linkless registration');
    const registration = makeRegistration(prisma);
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: draft.id,
      channelAccountId: ACCOUNT_ID,
      submissionKey: 'registration-linkless-key',
      externalListingId: '245',
      displayName: 'Linkless registration',
    };

    const registered = await prisma.$transaction((tx) =>
      registration.resolveProductRegistration(ownerTransaction(tx), input),
    );
    expect(await readMappingGeneration()).toBe(1n);

    await prisma.$transaction((tx) =>
      registration.resolveProductRegistration(ownerTransaction(tx), input),
    );
    expect(await readMappingGeneration()).toBe(1n);

    await prisma.channelListing.update({
      where: { id: registered.listingId },
      data: { isActive: false },
    });
    await prisma.$transaction((tx) =>
      registration.resolveProductRegistration(ownerTransaction(tx), input),
    );
    expect(await readMappingGeneration()).toBe(2n);
  });

  it('reactivates an inactive registration option and advances identity generation once', async () => {
    const [product, draft] = await Promise.all([
      seedSourceProduct(prisma, {
        id: INACTIVE_OPTION_SKU_ID,
        organizationId: TEST_ORGANIZATION_ID,
        code: 'KI-REGISTER-INACTIVE-OPTION',
        name: 'Inactive registration option',
      }),
      seedDraft(prisma, 'https://example.com/register-inactive-option', 'Inactive registration option'),
    ]);
    const registration = makeRegistration(prisma);
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      salesProductId: draft.id,
      channelAccountId: ACCOUNT_ID,
      submissionKey: 'registration-inactive-option-key',
      externalListingId: '246',
      displayName: 'Inactive registration option',
      masterProductId: product.id,
      optionLinks: [{
        externalOptionId: 'INACTIVE-OPTION',
        sellpiaInventorySkuId: INACTIVE_OPTION_SKU_ID,
        quantity: 1,
      }],
    };

    const registered = await prisma.$transaction((tx) =>
      registration.resolveProductRegistration(ownerTransaction(tx), input),
    );
    const option = await prisma.channelListingOption.findFirstOrThrow({
      where: { listingId: registered.listingId },
    });
    expect(await readMappingGeneration()).toBe(1n);

    await prisma.channelListingOption.update({
      where: { id: option.id },
      data: { isActive: false },
    });
    await prisma.$transaction((tx) =>
      registration.resolveProductRegistration(ownerTransaction(tx), input),
    );

    await expect(prisma.channelListingOption.findUniqueOrThrow({
      where: { id: option.id },
    })).resolves.toMatchObject({ isActive: true });
    expect(await readMappingGeneration()).toBe(2n);
  });

  it('rolls back initial registration links when mapping generation cannot advance', async () => {
    const product = await seedSourceProduct(prisma, {
      id: ROLLBACK_SKU_ID,
      code: 'KI-REGISTER-ROLLBACK',
      name: 'Registered rollback',
      organizationId: TEST_ORGANIZATION_ID,
    });
    const draft = await seedDraft(prisma, 'https://example.com/register-rollback', 'Registered rollback');
    const maximum = 9_223_372_036_854_775_807n;
    await prisma.masterProductAbcFormulaState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        mappingGeneration: maximum,
      },
    });
    const registration = makeRegistration(prisma);

    await expect(prisma.$transaction((tx) =>
      registration.resolveProductRegistration(ownerTransaction(tx), {
        organizationId: TEST_ORGANIZATION_ID,
        salesProductId: draft.id,
        channelAccountId: ACCOUNT_ID,
        submissionKey: 'registration-rollback-key',
        externalListingId: '254',
        displayName: 'Registered rollback',
        masterProductId: product.id,
        optionLinks: [{
          externalOptionId: 'BLUE-LOGICAL',
          sellpiaInventorySkuId: ROLLBACK_SKU_ID,
          quantity: 2,
        }],
      }),
    )).rejects.toThrow();

    const [listingCount, optionCount, state] = await Promise.all([
      prisma.channelListing.count({
        where: { organizationId: TEST_ORGANIZATION_ID, externalId: '254' },
      }),
      prisma.channelListingOption.count({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          sellerSku: 'registration-rollback-key',
        },
      }),
      prisma.masterProductAbcFormulaState.findUniqueOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID },
      }),
    ]);
    expect(listingCount).toBe(0);
    expect(optionCount).toBe(0);
    expect(state).toMatchObject({
      activeFormulaVersionId: null,
      formulaRevision: 0,
      publicationRevision: 0,
      publishedAt: null,
      mappingGeneration: maximum,
    });
  });

  async function readMappingGeneration(): Promise<bigint> {
    const state = await prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId: TEST_ORGANIZATION_ID },
      select: { mappingGeneration: true },
    });
    return state?.mappingGeneration ?? 0n;
  }

  function makeRegistration(client: PrismaClient) {
    const prismaService = client as unknown as PrismaService;
    return new ListingRegistrationPersistenceAdapter(
      prismaService,
      new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()),
      new ChannelOptionRecipeService(
        new ChannelOptionRecipeRepositoryAdapter(
          prismaService,
          new ProductTransactionalReadRepositoryAdapter(),
          new ChannelsProductMappingGenerationAdapter(new ProductMappingGenerationRepositoryAdapter()),
        ),
      ),
    );
  }
});
