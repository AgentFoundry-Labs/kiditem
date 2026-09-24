import { channelFactTestPorts } from '../../test-helpers/channel-fact-ports';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../test-helpers/real-prisma';
import { KeywordRankRepositoryAdapter } from '../adapter/out/repository/keyword-rank.repository.adapter';
import { KeywordRankService } from '../application/service/keyword-rank.service';
import { currentBusinessDate } from '../domain/business-date';
import type { PrismaClient } from '@prisma/client';

describe('keyword and rank readers through the public service', () => {
  let prisma: PrismaClient;
  let service: KeywordRankService;
  let generation = 0;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
    const repository = new KeywordRankRepositoryAdapter(channelFactTestPorts(prisma as never).listings, channelFactTestPorts(prisma as never).recipes, prisma as never);
    service = new KeywordRankService(repository);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    generation = 0;
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    const account = await prisma.channelAccount.create({
      data: {
        organizationId: ORG,
        channel: 'coupang',
        name: 'Wing',
        status: 'active',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: ORG,
        channelAccountId: account.id,
        externalId: 'product-1',
        channelName: '연속 순위 상품',
      },
    });
    await prisma.channelListingOption.create({
      data: {
        organizationId: ORG,
        listingId: listing.id,
        externalOptionId: 'vendor-1',
      },
    });
    await prisma.coupangRepresentativeKeywordOverride.create({
      data: {
        organizationId: ORG,
        vendorItemId: 'vendor-1',
        keyword: '슬라임',
      },
    });
  });

  async function wingRank(
    businessDate: Date,
    salesRank: number,
    status: 'completed' | 'failed' = 'completed',
  ) {
    generation += 1;
    const source = await prisma.sourceImportRun.create({
      data: {
        organizationId: ORG,
        sourceType: 'coupang_wing_rank',
        parserVersion: 'wing-rank-v1',
        status,
        rankKeyword: '슬라임',
        freshnessGeneration: BigInt(generation),
        importedAt: new Date(businessDate.getTime() + 12 * 60 * 60 * 1000),
      },
    });
    await prisma.coupangWingSalesRankDailySnapshot.create({
      data: {
        organizationId: ORG,
        sourceImportRunId: source.id,
        keyword: '슬라임',
        vendorItemId: 'vendor-1',
        businessDate,
        productName: '연속 순위 상품',
        salesRank,
        salesLast28d: 40,
        collectedCount: 100,
        capturedAt: source.importedAt!,
      },
    });
  }

  it('does not substitute an older available row for an unmeasured previous business date', async () => {
    const today = currentBusinessDate();
    const previousBusinessDate = new Date(today.getTime() - 86_400_000);
    await wingRank(new Date(today.getTime() - 2 * 86_400_000), 30);
    await wingRank(previousBusinessDate, 15, 'failed');
    await wingRank(today, 20);

    const result = await service.getProductRankOverview(7, ORG);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      currentSalesRank: 20,
      previousSalesRank: null,
      collectedCount: 100,
    });
    expect(result.rows[0]).not.toHaveProperty('rankChange');
    expect(result.rows[0]).not.toHaveProperty('status');
    expect(result.summary).toMatchObject({ risingCount: 0, fallingCount: 0 });
  });

  it('preserves continuous rank numbers and derives movement from the adjacent day', async () => {
    const today = currentBusinessDate();
    await wingRank(new Date(today.getTime() - 86_400_000), 24);
    await wingRank(today, 20);

    const result = await service.getProductRankOverview(7, ORG);

    expect(result.rows[0]).toMatchObject({
      currentSalesRank: 20,
      previousSalesRank: 24,
      collectedCount: 100,
      businessDate: today.toISOString().slice(0, 10),
    });
    expect(result.summary).toMatchObject({ risingCount: 1, fallingCount: 0 });
  });

  it('reads only COMPLETE SERP generations from the requested organization', async () => {
    const today = currentBusinessDate();
    const completedDate = new Date(today.getTime() - 86_400_000);
    const completed = await prisma.sourceImportRun.create({
      data: {
        organizationId: ORG,
        sourceType: 'coupang_keyword_serp',
        parserVersion: 'keyword-serp-v1',
        status: 'completed',
        rankKeyword: '슬라임',
        freshnessGeneration: BigInt(1),
      },
    });
    const failed = await prisma.sourceImportRun.create({
      data: {
        organizationId: ORG,
        sourceType: 'coupang_keyword_serp',
        parserVersion: 'keyword-serp-v1',
        status: 'failed',
        rankKeyword: '슬라임',
        freshnessGeneration: BigInt(2),
      },
    });
    await prisma.coupangKeywordSerpDailySnapshot.createMany({
      data: [
        {
          organizationId: ORG,
          sourceImportRunId: completed.id,
          keyword: '슬라임',
          businessDate: completedDate,
          capturedAt: new Date(completedDate.getTime() + 12 * 60 * 60 * 1000),
          pagesScanned: 2,
          itemCount: 1,
          items: { marker: 'complete' },
        },
        {
          organizationId: ORG,
          sourceImportRunId: failed.id,
          keyword: '슬라임',
          businessDate: today,
          capturedAt: new Date(today.getTime() + 12 * 60 * 60 * 1000),
          pagesScanned: 3,
          itemCount: 2,
          items: { marker: 'failed' },
        },
      ],
    });

    const result = await service.getLatestSerp('슬라임', ORG);

    expect(result).toMatchObject({
      businessDate: completedDate.toISOString().slice(0, 10),
      items: { marker: 'complete' },
    });
  });
});
