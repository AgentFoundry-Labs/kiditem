import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { seedActiveSellpiaInventorySku } from '../../test-helpers/inventory-seeds';
import { MarketplaceRegistrationRepositoryAdapter } from '../adapter/out/repository/marketplace-registration.repository.adapter';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const INACTIVE_OPTION_SKU_ID = '26000000-0000-4000-8000-000000000001';
const ROLLBACK_SKU_ID = '26000000-0000-4000-8000-000000000002';

describe('MarketplaceRegistrationRepositoryAdapter (PG integration)', () => {
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
    const candidate = await prisma.sourcingCandidate.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: 'https://example.com/register-linkless',
        sourcePlatform: 'test',
        name: 'Linkless registration',
      },
    });
    const registration = new MarketplaceRegistrationRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidate.id,
      channelAccountId: ACCOUNT_ID,
      submissionKey: 'registration-linkless-key',
      externalListingId: '245',
      displayName: 'Linkless registration',
    };

    const registered = await prisma.$transaction((tx) =>
      registration.resolveProductRegistration(tx, input),
    );
    expect(await readMappingGeneration()).toBe(1n);

    await prisma.$transaction((tx) =>
      registration.resolveProductRegistration(tx, input),
    );
    expect(await readMappingGeneration()).toBe(1n);

    await prisma.channelListing.update({
      where: { id: registered.listingId },
      data: { isActive: false },
    });
    await prisma.$transaction((tx) =>
      registration.resolveProductRegistration(tx, input),
    );
    expect(await readMappingGeneration()).toBe(2n);
  });

  it('reactivates an inactive registration option and advances identity generation once', async () => {
    const [product, , candidate] = await Promise.all([
      prisma.masterProduct.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'KI-REGISTER-INACTIVE-OPTION',
          name: 'Inactive registration option',
        },
      }),
      seedActiveSellpiaInventorySku(prisma, {
        id: INACTIVE_OPTION_SKU_ID,
        organizationId: TEST_ORGANIZATION_ID,
        code: 'KI-REGISTER-INACTIVE-OPTION-SKU',
        name: 'Inactive option SKU',
      }),
      prisma.sourcingCandidate.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          sourceUrl: 'https://example.com/register-inactive-option',
          sourcePlatform: 'test',
          name: 'Inactive registration option',
        },
      }),
    ]);
    const registration = new MarketplaceRegistrationRepositoryAdapter(
      prisma as unknown as PrismaService,
    );
    const input = {
      organizationId: TEST_ORGANIZATION_ID,
      sourceCandidateId: candidate.id,
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
      registration.resolveProductRegistration(tx, input),
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
      registration.resolveProductRegistration(tx, input),
    );

    await expect(prisma.channelListingOption.findUniqueOrThrow({
      where: { id: option.id },
    })).resolves.toMatchObject({ isActive: true });
    expect(await readMappingGeneration()).toBe(2n);
  });

  it('rolls back initial registration links when mapping generation cannot advance', async () => {
    const product = await prisma.masterProduct.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        code: 'KI-REGISTER-ROLLBACK',
        name: 'Registered rollback',
      },
    });
    await seedActiveSellpiaInventorySku(prisma, {
      id: ROLLBACK_SKU_ID,
      organizationId: TEST_ORGANIZATION_ID,
      code: 'KI-REGISTER-ROLLBACK-BLUE',
      name: 'Blue',
    });
    const candidate = await prisma.sourcingCandidate.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: 'https://example.com/register-rollback',
        sourcePlatform: 'test',
        name: 'Registered rollback',
      },
    });
    const maximum = 9_223_372_036_854_775_807n;
    await prisma.masterProductAbcFormulaState.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        mappingGeneration: maximum,
      },
    });
    const registration = new MarketplaceRegistrationRepositoryAdapter(
      prisma as unknown as PrismaService,
    );

    await expect(prisma.$transaction((tx) =>
      registration.resolveProductRegistration(tx, {
        organizationId: TEST_ORGANIZATION_ID,
        sourceCandidateId: candidate.id,
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
});
