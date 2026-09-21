import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH } from '@kiditem/shared/product-abc';
import {
  makeTestPrisma,
  OTHER_ORGANIZATION_ID,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import { readMonthlyAdAllocationPublication } from '../read/monthly-ad-allocation.reader';
import type { PrismaClient } from '@prisma/client';
import { seedSourceProduct } from '../../test-helpers/inventory-seeds';

describe('monthly advertising allocation publication reader (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  it('returns measured zero spend with the completed generation and organization fence', async () => {
    const fixture = await seedPublication(prisma);

    const result = await readMonthlyAdAllocationPublication(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      sourceImportRunId: fixture.runId,
    });

    expect(result).toEqual({
      sourceImportRunId: fixture.runId,
      publicationSequence: '4',
      coverageStartDate: '2026-07-01',
      coveredThrough: '2026-07-31',
      capturedAt: '2026-08-01T01:00:00.000Z',
      mappingGeneration: '7',
      adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
      allocations: [{
        channelAccountId: fixture.accountId,
        channelListingId: fixture.listingId,
        masterProductId: fixture.productId,
        month: '2026-07-01',
        coveredStartDate: '2026-07-01',
        coveredEndDate: '2026-07-31',
        wholeRecipeWeight: 2,
        allocatedSpend: 0,
        observedTargetDayCount: 31,
        mappingGeneration: '7',
      }],
    });
    await expect(readMonthlyAdAllocationPublication(prisma, {
      organizationId: OTHER_ORGANIZATION_ID,
      sourceImportRunId: fixture.runId,
    })).resolves.toBeNull();
  });

  it('withholds facts whose mapping generation differs from their completed source run', async () => {
    const fixture = await seedPublication(prisma);
    await prisma.channelAdListingProductMonthlyFact.updateMany({
      where: { sourceImportRunId: fixture.runId },
      data: { mappingGeneration: 8n },
    });

    await expect(readMonthlyAdAllocationPublication(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      sourceImportRunId: fixture.runId,
    })).resolves.toBeNull();
  });

  it('withholds allocations from a source run that is no longer complete', async () => {
    const fixture = await seedPublication(prisma);
    await prisma.sourceImportRun.update({
      where: { id: fixture.runId },
      data: { status: 'failed' },
    });

    await expect(readMonthlyAdAllocationPublication(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      sourceImportRunId: fixture.runId,
    })).resolves.toBeNull();
  });

  it('withholds an allocation whose observed days exceed its raw covered range', async () => {
    const fixture = await seedPublication(prisma);
    await prisma.channelAdListingProductMonthlyFact.updateMany({
      where: { sourceImportRunId: fixture.runId },
      data: {
        coveredEndDate: new Date('2026-07-02T00:00:00.000Z'),
        observedTargetDayCount: 3,
      },
    });

    await expect(readMonthlyAdAllocationPublication(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      sourceImportRunId: fixture.runId,
    })).resolves.toBeNull();
  });

  it('clamps a legacy full-month fact to its frozen account month slice', async () => {
    const fixture = await seedPublication(prisma);
    await prisma.sourceImportRun.update({
      where: { id: fixture.runId },
      data: {
        coverageEndDate: new Date('2026-07-12T00:00:00.000Z'),
        plan: frozenPlan(fixture.accountId, '2026-07-01', '2026-07-12'),
      },
    });

    const result = await readMonthlyAdAllocationPublication(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      sourceImportRunId: fixture.runId,
    });

    expect(result?.allocations).toEqual([
      expect.objectContaining({
        coveredStartDate: '2026-07-01',
        coveredEndDate: '2026-07-12',
        observedTargetDayCount: 12,
      }),
    ]);
  });

  it('keeps strict run bounds when a legacy publication has no frozen plan', async () => {
    const fixture = await seedPublication(prisma);
    await prisma.sourceImportRun.update({
      where: { id: fixture.runId },
      data: { coverageEndDate: new Date('2026-07-12T00:00:00.000Z') },
    });

    await expect(readMonthlyAdAllocationPublication(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      sourceImportRunId: fixture.runId,
    })).resolves.toBeNull();
  });

  it('withholds a frozen slice that exceeds its completed run coverage', async () => {
    const fixture = await seedPublication(prisma);
    await prisma.sourceImportRun.update({
      where: { id: fixture.runId },
      data: {
        coverageEndDate: new Date('2026-07-12T00:00:00.000Z'),
        plan: frozenPlan(fixture.accountId, '2026-07-01', '2026-07-31'),
      },
    });

    await expect(readMonthlyAdAllocationPublication(prisma, {
      organizationId: TEST_ORGANIZATION_ID,
      sourceImportRunId: fixture.runId,
    })).resolves.toBeNull();
  });
});

function frozenPlan(channelAccountId: string, from: string, to: string) {
  return {
    mappingGeneration: '7',
    adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
    accounts: [{
      channelAccountId,
      slices: [{
        sliceId: `${channelAccountId}:${from}_${to}`,
        channelAccountId,
        from,
        to,
      }],
    }],
  };
}

async function seedPublication(prisma: PrismaClient) {
  const account = await prisma.channelAccount.create({ data: {
    organizationId: TEST_ORGANIZATION_ID,
    channel: 'coupang',
    name: 'Allocation account',
    status: 'active',
  } });
  const product = await seedSourceProduct(prisma, {
    organizationId: TEST_ORGANIZATION_ID,
    code: 'ALLOCATION-PRODUCT',
    name: 'Allocation product',
  });
  const listing = await prisma.channelListing.create({ data: {
    organizationId: TEST_ORGANIZATION_ID,
    channelAccountId: account.id,
    masterProductId: product.id,
    externalId: 'ALLOCATION-LISTING',
  } });
  const run = await prisma.sourceImportRun.create({ data: {
    organizationId: TEST_ORGANIZATION_ID,
    sourceType: 'coupang_ad_profitability',
    status: 'completed',
    publicationSequence: 4n,
    mappingGeneration: 7n,
    coverageStartDate: new Date('2026-07-01T00:00:00.000Z'),
    coverageEndDate: new Date('2026-07-31T00:00:00.000Z'),
    coveredMonths: ['2026-07'],
    importedAt: new Date('2026-08-01T01:00:00.000Z'),
    adSourcePolicyHash: PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH,
  } });
  await prisma.channelAdListingProductMonthlyFact.create({ data: {
    organizationId: TEST_ORGANIZATION_ID,
    sourceImportRunId: run.id,
    channelAccountId: account.id,
    channelListingId: listing.id,
    masterProductId: product.id,
    month: new Date('2026-07-01T00:00:00.000Z'),
    coveredStartDate: new Date('2026-07-01T00:00:00.000Z'),
    coveredEndDate: new Date('2026-07-31T00:00:00.000Z'),
    wholeRecipeWeight: 2,
    mappingGeneration: 7n,
    observedTargetDayCount: 31,
    allocatedSpend: 0n,
  } });
  return { runId: run.id, accountId: account.id, listingId: listing.id, productId: product.id };
}
